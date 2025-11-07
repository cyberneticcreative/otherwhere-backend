const twilioService = require('../services/twilioService');
const sessionManager = require('../services/sessionManager');
const elevenLabsService = require('../services/elevenLabsService');
const airlineDeeplinksService = require('../services/airlineDeeplinksService');
const airbnbService = require('../services/airbnbService');
const { getOrCreateConversation, createLinkSession } = require('../db/queries');

class WebhookController {
  /**
   * Handle webhooks from ElevenLabs agents
   * @param {Object} req - Express request
   * @param {Object} res - Express response
   */
  async handleElevenLabsWebhook(req, res) {
    try {
      console.log('🔔 ElevenLabs webhook received');

      // Validate webhook signature
      const signature = req.headers['x-elevenlabs-signature'];
      const isValid = elevenLabsService.validateWebhookSignature(signature, req.body);

      if (!isValid) {
        console.error('❌ Invalid ElevenLabs webhook signature');
        return res.status(401).json({ success: false, error: 'Invalid signature' });
      }

      const webhookData = elevenLabsService.processWebhook(req.body);

      const {
        eventType,
        agentId,
        conversationId,
        message,
        metadata
      } = webhookData;

      // Handle different event types
      switch (eventType) {
        case 'conversation.started':
          console.log(`Conversation started: ${conversationId}`);
          break;

        case 'conversation.message':
          // Message received from agent
          if (metadata?.userId) {
            await sessionManager.addMessage(metadata.userId, {
              role: 'assistant',
              content: message,
              source: 'elevenlabs',
              agentId
            });
          }
          break;

        case 'conversation.ended':
          console.log(`Conversation ended: ${conversationId}`);
          if (metadata?.userId) {
            const session = await sessionManager.getSession(metadata.userId);
            await sessionManager.updateSession(metadata.userId, {
              context: {
                ...session.context,
                lastConversationId: conversationId,
                conversationEndedAt: new Date().toISOString()
              }
            });
          }
          break;

        case 'agent.action':
          // Handle custom actions from the agent
          console.log('Agent action:', message);
          break;

        default:
          console.log(`Unhandled event type: ${eventType}`);
      }

      res.json({ success: true, received: true });

    } catch (error) {
      console.error('Error handling ElevenLabs webhook:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  }

  /**
   * Handle ElevenLabs function/tool call webhooks
   * @param {Object} req - Express request
   * @param {Object} res - Express response
   */
  async handleElevenLabsToolCall(req, res) {
    try {
      console.log('🔧 ElevenLabs tool call webhook received');

      // Validate webhook signature
      const signature = req.headers['x-elevenlabs-signature'];
      const isValid = elevenLabsService.validateWebhookSignature(signature, req.body);

      if (!isValid) {
        console.error('❌ Invalid ElevenLabs tool call webhook signature');
        return res.status(401).json({
          result: 'Unauthorized webhook request',
          success: false,
          error: 'Invalid signature'
        });
      }

      console.log('Payload:', JSON.stringify(req.body, null, 2));

      const { tool_name, parameters, conversation_id, metadata } = req.body;

      // Handle search_trips function
      if (tool_name === 'search_trips') {
        const {
          destination,
          origin = 'LAX',
          check_in,
          check_out,
          travelers = 1,
          budget_usd
        } = parameters;

        console.log(`🛫 Processing search_trips for ${destination}`);

        // Fix dates if they're in the past (smart correction)
        const fixPastDate = (dateStr) => {
          if (!dateStr) return null;

          const inputDate = new Date(dateStr);
          const now = new Date();

          // If date is in the future, use it as-is
          if (inputDate > now) {
            return dateStr;
          }

          // Date is in the past - need to correct it
          // Extract month and day from the input date
          const month = inputDate.getMonth(); // 0-11
          const day = inputDate.getDate();
          const currentYear = now.getFullYear();

          // Try current year first
          const currentYearDate = new Date(currentYear, month, day);

          if (currentYearDate > now) {
            // The date hasn't happened yet this year - use current year
            const correctedDate = `${currentYear}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
            console.log(`📅 Corrected past date: ${dateStr} → ${correctedDate} (this year)`);
            return correctedDate;
          } else {
            // The date already passed this year - use next year
            const nextYear = currentYear + 1;
            const correctedDate = `${nextYear}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
            console.log(`📅 Corrected past date: ${dateStr} → ${correctedDate} (next year)`);
            return correctedDate;
          }
        };

        const correctedCheckIn = fixPastDate(check_in);
        const correctedCheckOut = fixPastDate(check_out);

        // Check if dates are too far in the future (warn but don't block)
        let dateWarning = '';
        if (correctedCheckIn) {
          const checkInDate = new Date(correctedCheckIn);
          const now = new Date();
          const tenMonthsFromNow = new Date(now.getFullYear(), now.getMonth() + 10, now.getDate());

          if (checkInDate > tenMonthsFromNow) {
            const monthsAway = Math.round((checkInDate - now) / (1000 * 60 * 60 * 24 * 30));
            dateWarning = `Note: Your travel date is ${monthsAway} months away. Flight availability may be limited for dates that far in advance. `;
            console.log(`⚠️ Date warning: Search is ${monthsAway} months in the future`);
          }
        }

        // Build trip details object
        const tripDetails = {
          destination,
          origin,
          startDate: correctedCheckIn,
          endDate: correctedCheckOut,
          travelers,
          budget: budget_usd ? {
            amount: budget_usd,
            currency: 'USD'
          } : null
        };

        // Get user phone number from metadata
        const phoneNumber = metadata?.phone_number || metadata?.from;

        try {
          // Create Duffel Links session for flights
          console.log(`[Duffel] Creating booking session: ${origin} → ${destination} on ${correctedCheckIn}`);

          // Normalize search parameters for Duffel
          const searchParams = duffelLinksService.normalizeSearchParams({
            origin: origin,
            destination: destination,
            departure_date: correctedCheckIn,
            return_date: correctedCheckOut,
            passengers: parseInt(travelers) || 1,
            cabin_class: 'economy'
          });

          // Validate search parameters
          const validation = duffelLinksService.validateSearchParams(searchParams);
          if (!validation.valid) {
            throw new Error(`Missing required parameters: ${validation.missing.join(', ')}`);
          }

          // Get or create conversation in database
          const conversation = await getOrCreateConversation(
            phoneNumber,
            'browse',
            searchParams
          );

          // Create Duffel Links session
          const session = await duffelLinksService.createFlightSession({
            conversationId: conversation.id,
            phone: phoneNumber,
            searchParams: searchParams
          });

          // Store session in database
          await createLinkSession({
            conversationId: conversation.id,
            duffelSessionId: session.id,
            sessionUrl: session.url,
            expiresAt: session.expires_at,
            searchParams: searchParams
          });

          console.log('✅ Duffel Links session created:', session.id);

          // Format SMS message with booking link
          const smsMessage = duffelLinksService.formatLinksSMS({
            sessionUrl: session.url,
            searchParams: searchParams,
            expiresAt: session.expires_at
          });

          // Save to session for tracking
          if (phoneNumber) {
            await sessionManager.updateSession(phoneNumber, {
              tripDetails,
              context: {
                conversationId: conversation_id,
                lastDuffelSession: {
                  sessionId: session.id,
                  sessionUrl: session.url,
                  searchParams: searchParams
                },
                tripSearchInitiated: true,
                tripSearchTimestamp: new Date().toISOString()
              }
            });

            // Send SMS with Duffel Links URL
            await twilioService.sendLongSMS(phoneNumber, smsMessage);
            console.log(`✅ Sent Duffel booking link via SMS to ${phoneNumber}`);
          }

          // Return success response to ElevenLabs
          res.json({
            result: phoneNumber
              ? `${dateWarning}Perfect! I've created a booking link for flights from ${origin} to ${destination}. Check your texts for the link to browse and book flights.`
              : `${dateWarning}I've found flights from ${origin} to ${destination}. You can browse options and book directly.`,
            success: true
          });

        } catch (searchError) {
          console.error('Duffel Links creation error:', searchError);

          // Send error message via SMS if phone available
          if (phoneNumber) {
            try {
              await twilioService.sendSMS(
                phoneNumber,
                `Sorry, I had trouble creating your booking link for ${origin} to ${destination}. Please try again or contact support.`
              );
            } catch (smsError) {
              console.error('Failed to send error SMS:', smsError);
            }
          }

          res.json({
            result: `I'm having trouble creating a booking link for ${origin} to ${destination} right now. Could you try again in a moment?`,
            success: false,
            error: searchError.message
          });
        }

      } else if (tool_name === 'search_accommodations') {
        const {
          destination,
          check_in,
          check_out,
          guests = 1,
          budget_per_night_usd
        } = parameters;

        console.log(`🏠 Processing search_accommodations for ${destination}`);

        // Fix dates if they're in the past (smart correction)
        const fixPastDate = (dateStr) => {
          if (!dateStr) return null;

          const inputDate = new Date(dateStr);
          const now = new Date();

          // If date is in the future, use it as-is
          if (inputDate > now) {
            return dateStr;
          }

          // Date is in the past - need to correct it
          const month = inputDate.getMonth(); // 0-11
          const day = inputDate.getDate();
          const currentYear = now.getFullYear();

          // Try current year first
          const currentYearDate = new Date(currentYear, month, day);

          if (currentYearDate > now) {
            const correctedDate = `${currentYear}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
            console.log(`📅 Corrected past date: ${dateStr} → ${correctedDate} (this year)`);
            return correctedDate;
          } else {
            const nextYear = currentYear + 1;
            const correctedDate = `${nextYear}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
            console.log(`📅 Corrected past date: ${dateStr} → ${correctedDate} (next year)`);
            return correctedDate;
          }
        };

        const correctedCheckIn = fixPastDate(check_in);
        const correctedCheckOut = fixPastDate(check_out);

        // Get user phone number from metadata
        const phoneNumber = metadata?.phone_number || metadata?.from;

        try {
          // Search accommodations using Airbnb API
          console.log(`[Airbnb] Searching: ${destination} (${correctedCheckIn} to ${correctedCheckOut})`);

          // Step 1: Resolve destination ID
          console.log(`🔍 Searching destination: ${destination}`);
          const destinations = await airbnbService.searchDestination(destination, 'USA');

          if (!destinations || destinations.length === 0) {
            throw new Error(`Could not find destination: ${destination}`);
          }

          const destinationId = destinations[0]?.id;
          const destinationName = destinations[0]?.name || destination;

          if (!destinationId) {
            console.error(`[Airbnb] Destination missing ID:`, destinations[0]);
            throw new Error(`Could not resolve destination ID for: ${destination}`);
          }

          console.log(`[Airbnb] Resolved destination: ${destinationName} (${destinationId})`);

          // Step 2: Search properties
          const searchParams = {
            destinationId: destinationId,
            checkIn: correctedCheckIn,
            checkOut: correctedCheckOut,
            adults: parseInt(guests) || 1,
            maxPrice: budget_per_night_usd || undefined,
            currency: 'USD',
            limit: 10
          };

          const searchResults = await airbnbService.searchProperties(searchParams);

          // Step 3: Format top 3 results for SMS
          const formattedProperties = airbnbService.formatPropertyResults(searchResults, 3, {
            privateOnly: true,
            minRating: 4.0,
            minReviews: 3
          });

          if (formattedProperties.length === 0) {
            throw new Error('No properties found for your search');
          }

          // Step 4: Generate SMS message
          const smsMessage = airbnbService.formatSMSMessage(formattedProperties, {
            destinationName,
            checkIn: correctedCheckIn,
            checkOut: correctedCheckOut
          });

          // Step 5: Save to session if phone number available
          if (phoneNumber) {
            await sessionManager.updateSession(phoneNumber, {
              context: {
                conversationId: conversation_id,
                lastAccommodationSearch: {
                  destination,
                  destinationId,
                  destinationName,
                  checkIn: correctedCheckIn,
                  checkOut: correctedCheckOut,
                  guests,
                  results: formattedProperties
                },
                accommodationSearchTimestamp: new Date().toISOString()
              },
              lastAccommodationResults: formattedProperties,
              lastAccommodationSearch: {
                destination: destinationName,
                checkIn: correctedCheckIn,
                checkOut: correctedCheckOut
              }
            });

            // Step 6: Send SMS with property results
            await twilioService.sendLongSMS(phoneNumber, smsMessage);
            console.log(`✅ Sent accommodation results via SMS to ${phoneNumber}`);
          }

          // Step 7: Return success response to ElevenLabs
          res.json({
            result: phoneNumber
              ? `Great! I found ${formattedProperties.length} places to stay in ${destinationName}. I've texted you the details with prices and ratings. Reply with a number to get the booking link!`
              : `I found ${formattedProperties.length} places in ${destinationName}. The best option is $${formattedProperties[0].pricePerNight}/night with a ${formattedProperties[0].rating} star rating.`,
            success: true
          });

        } catch (searchError) {
          console.error('Accommodation search error:', searchError);

          // Send error message via SMS if phone available
          if (phoneNumber) {
            try {
              await twilioService.sendSMS(
                phoneNumber,
                `Sorry, I had trouble finding accommodations in ${destination}. Please try a different location or dates.`
              );
            } catch (smsError) {
              console.error('Failed to send error SMS:', smsError);
            }
          }

          res.json({
            result: `I'm having trouble finding accommodations in ${destination} right now. Could you try a different city or check the spelling?`,
            success: false,
            error: searchError.message
          });
        }

      } else {
        // Unknown tool
        console.log(`Unknown tool call: ${tool_name}`);
        res.status(400).json({
          result: `Unknown tool: ${tool_name}`,
          success: false
        });
      }

    } catch (error) {
      console.error('Error handling ElevenLabs tool call:', error);
      res.status(500).json({
        result: 'Sorry, I encountered an error processing your request.',
        success: false,
        error: error.message
      });
    }
  }

  /**
   * Generic webhook handler for custom integrations
   * @param {Object} req - Express request
   * @param {Object} res - Express response
   */
  async handleGenericWebhook(req, res) {
    try {
      console.log('🔔 Generic webhook received');
      console.log('Headers:', req.headers);
      console.log('Body:', req.body);

      // Process webhook based on headers or body content
      const source = req.headers['x-webhook-source'] || 'unknown';

      // Handle different webhook sources
      switch (source) {
        case 'custom-integration':
          // Handle custom integration webhooks
          break;

        default:
          console.log(`Webhook from unknown source: ${source}`);
      }

      res.json({ success: true, received: true });

    } catch (error) {
      console.error('Error handling generic webhook:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  }
}

module.exports = new WebhookController();
