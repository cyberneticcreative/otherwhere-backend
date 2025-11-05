const twilioService = require('../services/twilioService');
const sessionManager = require('../services/sessionManager');
const elevenLabsService = require('../services/elevenLabsService');
const googleFlightsService = require('../services/googleFlightsService');

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
          // Search flights using Google Flights API
          console.log(`[GoogleFlights] Searching: ${origin} → ${destination} on ${correctedCheckIn}`);

          // Step 1: Resolve airport codes (sequential to avoid rate limits)
          console.log(`🔍 Searching origin airport: ${origin}`);
          const originAirports = await googleFlightsService.searchAirport(origin);

          console.log(`🔍 Searching destination airport: ${destination}`);
          const destAirports = await googleFlightsService.searchAirport(destination);

          if (!originAirports || originAirports.length === 0) {
            throw new Error(`Could not find airport for: ${origin}`);
          }

          if (!destAirports || destAirports.length === 0) {
            throw new Error(`Could not find airport for: ${destination}`);
          }

          const originCode = originAirports[0]?.code;
          const destCode = destAirports[0]?.code;

          // Validate that we actually got valid airport codes
          if (!originCode) {
            console.error(`[GoogleFlights] Origin airport missing code:`, originAirports[0]);
            throw new Error(`Could not resolve airport code for: ${origin}`);
          }

          if (!destCode) {
            console.error(`[GoogleFlights] Destination airport missing code:`, destAirports[0]);
            throw new Error(`Could not resolve airport code for: ${destination}`);
          }

          console.log(`[GoogleFlights] Resolved: ${originCode} → ${destCode}`);

          // Step 2: Search flights
          const searchParams = {
            departureId: originCode,
            arrivalId: destCode,
            outboundDate: correctedCheckIn,
            returnDate: correctedCheckOut || undefined, // Only add if provided
            adults: parseInt(travelers) || 1,
            travelClass: 'ECONOMY',
            currency: 'USD'
          };

          const searchResults = await googleFlightsService.searchFlights(searchParams);

          // Step 3: Format top 3 results for SMS
          const formattedFlights = googleFlightsService.formatFlightResults(searchResults, 3);

          if (formattedFlights.length === 0) {
            throw new Error('No flights found for your search');
          }

          // Step 4: Generate SMS message
          const smsMessage = googleFlightsService.formatSMSMessage(formattedFlights, {
            departureId: originCode,
            arrivalId: destCode,
            outboundDate: check_in
          });

          // Step 5: Save to session if phone number available
          if (phoneNumber) {
            await sessionManager.updateSession(phoneNumber, {
              tripDetails,
              context: {
                conversationId: conversation_id,
                lastFlightSearch: {
                  origin,
                  destination,
                  originCode,
                  destCode,
                  date: check_in,
                  returnDate: check_out,
                  travelers,
                  results: formattedFlights
                },
                tripSearchInitiated: true,
                tripSearchTimestamp: new Date().toISOString()
              }
            });

            // Step 6: Send SMS with flight results
            await twilioService.sendLongSMS(phoneNumber, smsMessage);
            console.log(`✅ Sent flight results via SMS to ${phoneNumber}`);
          }

          // Step 7: Return success response to ElevenLabs
          res.json({
            result: phoneNumber
              ? `Great! I found ${formattedFlights.length} flights from ${origin} to ${destination}. I've texted you the details with prices and times. Reply with a number to get the booking link!`
              : `I found ${formattedFlights.length} flights from ${origin} to ${destination}. The best option is $${formattedFlights[0].price} on ${formattedFlights[0].airline}.`,
            success: true
          });

        } catch (searchError) {
          console.error('Flight search error:', searchError);

          // Send error message via SMS if phone available
          if (phoneNumber) {
            try {
              await twilioService.sendSMS(
                phoneNumber,
                `Sorry, I had trouble finding flights from ${origin} to ${destination}. Please try different cities or dates.`
              );
            } catch (smsError) {
              console.error('Failed to send error SMS:', smsError);
            }
          }

          res.json({
            result: `I'm having trouble finding flights from ${origin} to ${destination} right now. Could you try different cities or check the spelling?`,
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
