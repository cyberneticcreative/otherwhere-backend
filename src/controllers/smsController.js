const twilioService = require('../services/twilioService');
const llmService = require('../services/llmService');
const assistantService = require('../services/assistantService');
const sessionManager = require('../services/sessionManager');
const airlineDeepLinksService = require('../services/airlineDeepLinksService');
const airbnbService = require('../services/airbnbService');

class SMSController {
  /**
   * Handle inbound SMS messages from Twilio
   * @param {Object} req - Express request
   * @param {Object} res - Express response
   */
  async handleInboundSMS(req, res) {
    const startTime = Date.now();
    try {
      const { From: from, Body: body, MessageSid: messageSid } = req.body;

      console.log(`📱 Inbound SMS from ${from}: "${body}"`);
      console.log(`⏱️  Request start: ${new Date().toISOString()}`);

      // Get or create session
      let session = await sessionManager.getSession(from);
      await sessionManager.updateSession(from, { channel: 'sms' });

      // Re-fetch session to get latest data (in case it was updated by flight results)
      session = await sessionManager.getSession(from);

      // Check for reset/start over command
      const resetTriggers = ['reset', 'start over', 'restart', 'new search'];
      const isResetCommand = resetTriggers.some(trigger =>
        body.toLowerCase().includes(trigger)
      );

      if (isResetCommand) {
        console.log(`🔄 User requested reset`);
        await sessionManager.clearSession(from);
        await twilioService.sendSMS(
          from,
          "Sure! Let's start fresh. Where would you like to go?"
        );

        res.type('text/xml');
        res.send('<?xml version="1.0" encoding="UTF-8"?><Response></Response>');
        return;
      }

      // Debug: Log session state
      console.log(`🔍 Session check - lastAccommodationResults: ${!!session.lastAccommodationResults}`);

      // Check if user is selecting a number (1, 2, or 3) for accommodation
      // Only match if the ENTIRE message is exactly "1", "2", or "3"
      // This prevents "Jan 3-18" or "December 1" from triggering
      const isShortMessage = body.trim().length < 15;
      const numberSelection = isShortMessage ? body.trim().match(/^([123])$/) : null;
      console.log(`🔍 Number selection check - matched: ${!!numberSelection}, short: ${isShortMessage}, body: "${body}"`);

      // Handle accommodation selection (flights now handled via Duffel Links)
      if (numberSelection && session.lastAccommodationResults) {
        // Handle accommodation selection
        const selectedIndex = parseInt(numberSelection[1]) - 1;
        const selectedProperty = session.lastAccommodationResults[selectedIndex];

        if (selectedProperty) {
          console.log(`🏠 User selected accommodation #${numberSelection[1]}, generating booking URL...`);

          // Generate Airbnb URL
          const bookingUrl = selectedProperty.url;

          // Calculate total cost if dates available
          let costInfo = '';
          if (session.lastAccommodationSearch?.checkIn && session.lastAccommodationSearch?.checkOut) {
            const costBreakdown = airbnbService.calculateTotalCost(
              selectedProperty.pricePerNight,
              session.lastAccommodationSearch.checkIn,
              session.lastAccommodationSearch.checkOut
            );

            costInfo = `\n${costBreakdown.nights} nights = $${costBreakdown.subtotal}\n${costBreakdown.feesNote}`;
          }

          const bookingMessage = bookingUrl
            ? `Great choice! 🏠\n\n${selectedProperty.name}\n$${selectedProperty.pricePerNight}/night ⭐${selectedProperty.rating}${costInfo}\n\n🔗 Book here: ${bookingUrl}`
            : `Great choice! 🏠\n\n${selectedProperty.name}\n$${selectedProperty.pricePerNight}/night ⭐${selectedProperty.rating}${costInfo}\n\nPlease search on Airbnb for this property.`;

          await twilioService.sendSMS(from, bookingMessage);

          res.type('text/xml');
          res.send('<?xml version="1.0" encoding="UTF-8"?><Response></Response>');

          const totalDuration = Date.now() - startTime;
          console.log(`⏱️  TOTAL request time: ${totalDuration}ms (${(totalDuration/1000).toFixed(1)}s)`);
          return;
        }
      }

      // Add user message to conversation history
      await sessionManager.addMessage(from, {
        role: 'user',
        content: body
      });

      // Decide whether to use OpenAI Assistant or direct LLM
      const useAssistant = assistantService.isConfigured();

      let responseText;
      let tripSearchData = null;
      let flightResults = null;
      let accommodationResults = null;

      const aiStartTime = Date.now();
      console.log(`🤖 Using ${useAssistant ? 'OpenAI Assistant' : 'Direct LLM'}`);

      if (useAssistant) {
        // Use OpenAI Assistant
        try {
          // Create thread if it doesn't exist
          if (!session.threadId) {
            const threadId = await assistantService.createThread();
            await sessionManager.updateSession(from, { threadId });
            session.threadId = threadId;
          }

          // Send message to assistant with session context
          const assistantResponse = await assistantService.sendMessage(
            session.threadId,
            body,
            {
              sessionContext: {
                lastFlightSearch: session.lastFlightSearch,
                lastAccommodationSearch: session.lastAccommodationSearch
              }
            }
          );

          responseText = assistantResponse.text;
          tripSearchData = assistantResponse.tripSearch;
          flightResults = assistantResponse.flightResults;
          accommodationResults = assistantResponse.accommodationResults;

          const aiDuration = Date.now() - aiStartTime;
          console.log(`⏱️  Assistant took ${aiDuration}ms (${(aiDuration/1000).toFixed(1)}s)`);

        } catch (error) {
          console.error('Assistant error, falling back to LLM:', error);
          // Fall back to LLM
          const llmResponse = await llmService.generateResponse(
            session.conversationHistory,
            body
          );
          responseText = llmResponse.text;
          tripSearchData = llmResponse.tripSearch;
        }
      } else {
        // Use LLM directly
        const llmResponse = await llmService.generateResponse(
          session.conversationHistory,
          body
        );
        responseText = llmResponse.text;
        tripSearchData = llmResponse.tripSearch;

        const aiDuration = Date.now() - aiStartTime;
        console.log(`⏱️  LLM took ${aiDuration}ms (${(aiDuration/1000).toFixed(1)}s)`);
      }

      // Add assistant response to conversation history
      await sessionManager.addMessage(from, {
        role: 'assistant',
        content: responseText
      });

      // Send response via SMS
      const smsStartTime = Date.now();
      await twilioService.sendLongSMS(from, responseText);
      const smsDuration = Date.now() - smsStartTime;
      console.log(`⏱️  SMS send took ${smsDuration}ms`);

      // If we have flight results, send them with airline deeplinks
      if (flightResults && flightResults.flights && flightResults.flights.length > 0) {
        console.log('✈️ Sending flight results with airline deeplinks...');

        try {
          // Format SMS message with flight options and airline deeplinks
          const flightMessage = airlineDeepLinksService.formatSMSWithLinks(
            flightResults.flights,
            {
              origin: flightResults.originCode,
              destination: flightResults.destCode,
              departure: flightResults.searchParams?.outboundDate,
              returnDate: flightResults.searchParams?.returnDate,
              passengers: flightResults.searchParams?.passengers || 1,
              cabin: flightResults.searchParams?.cabinClass || 'economy'
            }
          );

          // Store flight results in session for reference
          await sessionManager.updateSession(from, {
            lastFlightResults: flightResults.flights,
            context: {
              lastFlightSearch: {
                origin: flightResults.originCode,
                destination: flightResults.destCode,
                startDate: flightResults.searchParams?.outboundDate,
                endDate: flightResults.searchParams?.returnDate,
                passengers: flightResults.searchParams?.passengers,
                results: flightResults.flights
              }
            }
          });

          // Send flight results as a second SMS (no delay needed, async send)
          twilioService.sendLongSMS(from, flightMessage)
            .then(() => {
              console.log('✅ Flight results with airline deeplinks sent');
            })
            .catch((smsError) => {
              console.error('❌ Failed to send flight results SMS:', smsError);
            });

        } catch (error) {
          console.error('❌ Failed to send flight results:', error);

          // Send fallback message
          twilioService.sendSMS(
            from,
            "I found flights but had trouble sending you the details. Please try again or contact support."
          )
            .then(() => {
              console.log('✅ Error fallback SMS sent');
            })
            .catch((smsError) => {
              console.error('❌ Failed to send error message:', smsError);
            });
        }
      }

      // If we have accommodation results, send them as a separate SMS
      if (accommodationResults && accommodationResults.properties && accommodationResults.properties.length > 0) {
        console.log('🏠 Sending accommodation results as separate SMS...');

        // Store accommodation results and search details in session so user can select one later
        await sessionManager.updateSession(from, {
          lastAccommodationResults: accommodationResults.properties,
          lastAccommodationSearch: {
            destination: accommodationResults.destinationName,
            checkIn: accommodationResults.searchParams?.checkIn,
            checkOut: accommodationResults.searchParams?.checkOut
          }
        });
        console.log(`💾 Stored ${accommodationResults.properties.length} properties in session for ${from}`);

        // Format accommodation message (supports both Airbnb and Hotels.com)
        const formatAccommodationMessage = (properties, searchInfo) => {
          if (!properties || properties.length === 0) {
            return 'Sorry, no accommodations found.';
          }

          const { checkIn, checkOut, destinationName } = searchInfo;

          // Compact date format (MM/DD)
          const formatDate = (dateStr) => {
            if (!dateStr) return '';
            const parts = dateStr.split('-');
            if (parts.length === 3) return `${parts[1]}/${parts[2]}`;
            return dateStr;
          };

          const dateRange = checkIn && checkOut ? ` ${formatDate(checkIn)}-${formatDate(checkOut)}` : '';
          const header = `🏠 ${destinationName || 'Your destination'}${dateRange}\n\n`;

          const propertiesList = properties.map(property => {
            const price = `$${property.pricePerNight}/nt`;
            const ratingDisplay = property.rating !== 'New' ? `⭐${property.rating}` : '⭐New';

            // Show source indicator (Airbnb or Hotel)
            const sourceIcon = property.source === 'hotel' ? '🏨' : '🏠';

            // Compact name (max 28 chars to fit source icon)
            const shortName = property.name.length > 28
              ? property.name.substring(0, 25) + '...'
              : property.name;

            // Property type info
            const typeInfo = property.source === 'hotel' && property.starRating
              ? `${property.starRating}★ Hotel`
              : property.propertyType || 'Property';

            return `${property.index}. ${sourceIcon} ${shortName} - ${price}\n${typeInfo} ${ratingDisplay}`;
          }).join('\n\n');

          return `${header}${propertiesList}\n\nReply 1-${properties.length} for booking link`;
        };

        const accommodationMessage = formatAccommodationMessage(
          accommodationResults.properties,
          {
            destinationName: accommodationResults.destinationName,
            checkIn: accommodationResults.searchParams?.checkIn,
            checkOut: accommodationResults.searchParams?.checkOut
          }
        );

        // Send accommodation details as a second SMS (async)
        twilioService.sendLongSMS(from, accommodationMessage)
          .then(() => {
            console.log('✅ Accommodation results SMS sent');
          })
          .catch((smsError) => {
            console.error('❌ Failed to send accommodation results SMS:', smsError);
          });
      }

      // Send TwiML response to Twilio
      res.type('text/xml');
      res.send('<?xml version="1.0" encoding="UTF-8"?><Response></Response>');

      const totalDuration = Date.now() - startTime;
      console.log(`⏱️  TOTAL request time: ${totalDuration}ms (${(totalDuration/1000).toFixed(1)}s)`);

    } catch (error) {
      console.error('Error handling inbound SMS:', error);

      // Try to send error message to user
      try {
        await twilioService.sendSMS(
          req.body.From,
          "I'm having trouble processing your message right now. Please try again in a moment."
        );
      } catch (sendError) {
        console.error('Failed to send error message:', sendError);
      }

      res.type('text/xml');
      res.send('<?xml version="1.0" encoding="UTF-8"?><Response></Response>');
    }
  }

  /**
   * Handle SMS status callbacks from Twilio
   * @param {Object} req - Express request
   * @param {Object} res - Express response
   */
  async handleStatusCallback(req, res) {
    const {
      MessageSid: messageSid,
      MessageStatus: status,
      To: to,
      ErrorCode: errorCode,
      ErrorMessage: errorMessage
    } = req.body;

    console.log(`📊 SMS Status: ${messageSid} - ${status}`);

    if (errorCode) {
      console.error(`SMS Error ${errorCode}: ${errorMessage}`);
    }

    // You can log this to a database or analytics service
    // For now, just acknowledge
    res.sendStatus(200);
  }
}

module.exports = new SMSController();
