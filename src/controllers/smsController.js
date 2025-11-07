const twilioService = require('../services/twilioService');
const llmService = require('../services/llmService');
const assistantService = require('../services/assistantService');
const sessionManager = require('../services/sessionManager');
const airlineDeeplinksService = require('../services/airlineDeeplinksService');
const airbnbService = require('../services/airbnbService');
const { getOrCreateConversation, createLinkSession } = require('../db/queries');

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

      // If we have flight results, search and send airline deep links
      if (flightResults && flightResults.flights && flightResults.flights.length > 0) {
        console.log('✈️ Searching flights with airline deep links...');

        try {
          // Build search parameters for new airline deeplinks service
          const searchParams = {
            origin: flightResults.originCode,
            destination: flightResults.destCode,
            departure: flightResults.searchParams?.outboundDate,
            returnDate: flightResults.searchParams?.returnDate,
            passengers: flightResults.searchParams?.passengers || 1,
            cabin: (flightResults.searchParams?.cabinClass || 'economy').toLowerCase()
          };

          console.log('🔍 Flight search params:', searchParams);

          // Try to get conversation from database (optional)
          let conversationId = null;
          try {
            const conversation = await getOrCreateConversation(from, 'browse', searchParams);
            conversationId = conversation?.id || null;
            if (conversationId) {
              console.log('✅ Conversation tracked:', conversationId);
            }
          } catch (dbError) {
            console.warn('⚠️ Database unavailable, continuing without tracking:', dbError.message);
          }

          // Search flights using new airline deeplinks service
          const flightSearchResults = await airlineDeeplinksService.searchFlightsWithDeeplinks(
            searchParams,
            3 // Get top 3 results
          );

          console.log(`✅ Found ${flightSearchResults.results.length} flight offers`);

          // Format SMS message with flight results and booking links
          const flightMessage = airlineDeeplinksService.formatFlightResultsSMS(
            flightSearchResults,
            true // Include booking links
          );

          // Send flight results as SMS (after a brief delay for better UX)
          setTimeout(async () => {
            try {
              await twilioService.sendLongSMS(from, flightMessage);
              console.log('✅ Flight results SMS sent with airline deep links');
            } catch (smsError) {
              console.error('❌ Failed to send flight results SMS:', smsError);
            }
          }, 2000); // 2 second delay

        } catch (error) {
          console.error('❌ Failed to search flights with airline deep links:', error);

          // Send fallback message
          setTimeout(async () => {
            try {
              await twilioService.sendSMS(
                from,
                "I found your destination but had trouble searching flights. Please try again or let me know if you'd like to search for something else."
              );
            } catch (smsError) {
              console.error('❌ Failed to send error message:', smsError);
            }
          }, 2000);
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

        // Use Airbnb service for formatting
        const airbnbService = require('../services/airbnbService');
        const accommodationMessage = airbnbService.formatSMSMessage(
          accommodationResults.properties,
          {
            destinationName: accommodationResults.destinationName,
            checkIn: accommodationResults.searchParams?.checkIn,
            checkOut: accommodationResults.searchParams?.checkOut
          }
        );

        // Send accommodation details as a second SMS (after a brief delay for better UX)
        // Delay more if we also sent flight results
        const delay = flightResults ? 4000 : 2000;
        setTimeout(async () => {
          try {
            await twilioService.sendLongSMS(from, accommodationMessage);
            console.log('✅ Accommodation results SMS sent');
          } catch (smsError) {
            console.error('❌ Failed to send accommodation results SMS:', smsError);
          }
        }, delay);
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
