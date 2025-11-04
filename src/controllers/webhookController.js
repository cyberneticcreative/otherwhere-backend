const twilioService = require('../services/twilioService');
const n8nService = require('../services/n8nService');
const sessionManager = require('../services/sessionManager');
const elevenLabsService = require('../services/elevenLabsService');

class WebhookController {
  /**
   * Handle webhooks from ElevenLabs agents
   * @param {Object} req - Express request
   * @param {Object} res - Express response
   */
  async handleElevenLabsWebhook(req, res) {
    try {
      console.log('🔔 ElevenLabs webhook received');

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
      console.log('Payload:', JSON.stringify(req.body, null, 2));

      let { tool_name, parameters, conversation_id, metadata } = req.body;

      // ElevenLabs may send parameters directly in the body without tool_name
      // If we detect trip search parameters directly, infer the tool name
      if (!tool_name && req.body.destination) {
        console.log('🔍 Detected search_trips parameters directly in body');
        tool_name = 'search_trips';
        parameters = req.body;
      }

      // Handle search_trips function
      if (tool_name === 'search_trips') {
        const {
          destination,
          origin = 'LAX',
          check_in,
          check_out,
          travelers = 1,
          budget_usd,
          budget,
          phone_number // Agent should ask user for phone number
        } = parameters;

        console.log(`🛫 Processing search_trips for ${destination}`);

        // Build trip details object
        // Support both 'budget' and 'budget_usd' field names
        const budgetAmount = budget_usd || budget;
        const tripDetails = {
          destination,
          origin,
          startDate: check_in,
          endDate: check_out,
          travelers,
          budget: budgetAmount ? {
            amount: budgetAmount,
            currency: 'USD'
          } : null
        };

        // Get phone number: prioritize parameter, then metadata, then active session
        let phoneNumber = phone_number || metadata?.phone_number || metadata?.from;

        // If no phone number in parameters or metadata, try to find from active voice session
        if (!phoneNumber) {
          console.log('⚠️ No phone number in parameters or metadata, checking active sessions...');
          phoneNumber = await this.findActiveVoiceSession();
        }

        // Normalize phone number format (remove spaces, dashes, ensure + prefix)
        if (phoneNumber) {
          phoneNumber = this.normalizePhoneNumber(phoneNumber);
          console.log(`📱 Using phone number: ${phoneNumber}`);
        }

        try {
          // If we have a phone number, we can send results via SMS
          if (phoneNumber) {
            console.log(`📱 Phone number found: ${phoneNumber}`);

            // Trigger trip search via n8n if configured
            if (n8nService.isConfigured()) {
              await n8nService.triggerTripSearch(tripDetails, phoneNumber, conversation_id);

              // Update session
              await sessionManager.updateSession(phoneNumber, {
                tripDetails,
                context: {
                  conversationId: conversation_id,
                  tripSearchInitiated: true,
                  tripSearchTimestamp: new Date().toISOString()
                }
              });

              // Return success response to ElevenLabs
              res.json({
                result: `Perfect! I'm searching for trips to ${destination} from ${origin}, departing ${check_in} and returning ${check_out} for ${travelers} traveler(s). I'll text you the best options I find!`,
                success: true
              });

            } else {
              // Fallback: search flights directly using TravelPayouts
              const travelPayoutsService = require('../services/travelPayoutsService');
              const results = await travelPayoutsService.searchFlights(tripDetails);
              const smsMessage = travelPayoutsService.formatSMSMessage(results);

              // Send SMS with results
              await twilioService.sendLongSMS(phoneNumber, smsMessage);

              res.json({
                result: `I found some great options! I've texted you the details.`,
                success: true
              });
            }

          } else {
            // No phone number available - search anyway and return verbal results
            console.log('⚠️ No phone number available, searching flights without SMS...');
            const travelPayoutsService = require('../services/travelPayoutsService');
            const results = await travelPayoutsService.searchFlights(tripDetails);

            if (results.success && results.flights.length > 0) {
              const topFlight = results.flights[0];
              res.json({
                result: `I found flights from ${origin} to ${destination}! The best option is ${topFlight.price} with ${topFlight.transfers} stop${topFlight.transfers !== 1 ? 's' : ''}. I'm unable to text you the details right now, but you can book at ${topFlight.link || 'Aviasales.com'}`,
                success: true
              });
            } else {
              res.json({
                result: `I searched but couldn't find any flights for those exact dates. Would you like to try different dates or a different route?`,
                success: true
              });
            }
          }

        } catch (searchError) {
          console.error('Trip search error:', searchError);
          res.json({
            result: `I've noted your trip preferences for ${destination}. Let me work on finding you the best options and I'll get back to you shortly!`,
            success: true,
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
   * Handle trip search completion webhook from n8n
   * @param {Object} req - Express request
   * @param {Object} res - Express response
   */
  async handleTripComplete(req, res) {
    try {
      console.log('🎉 Trip search completed webhook received');

      const tripResults = n8nService.processTripResults(req.body);

      const { userId, sessionId, success, results, error } = tripResults;

      if (!userId) {
        console.error('No userId in trip completion webhook');
        return res.status(400).json({ error: 'userId is required' });
      }

      // Get user session
      const session = await sessionManager.getSession(userId);

      // Update session with results
      await sessionManager.updateSession(userId, {
        context: {
          ...session.context,
          tripSearchCompleted: true,
          tripSearchResults: results,
          tripSearchError: error || null
        }
      });

      // Format results message
      const messageFormat = session.channel === 'sms' ? 'short' : 'detailed';
      const resultMessage = n8nService.formatTripResultsMessage(
        tripResults,
        messageFormat
      );

      // Send results to user based on their channel
      if (session.channel === 'sms') {
        await twilioService.sendLongSMS(userId, resultMessage);
      } else if (session.channel === 'voice') {
        // For voice, we might need to initiate a callback
        // This depends on your workflow - you might want to:
        // 1. Send an SMS with results
        // 2. Make an outbound call
        // 3. Store results for next call

        // Option 1: Send SMS with results
        await twilioService.sendSMS(
          userId,
          "Your trip search is ready! " + resultMessage
        );
      }

      // Add assistant message to history
      await sessionManager.addMessage(userId, {
        role: 'assistant',
        content: resultMessage,
        metadata: {
          tripResults: results,
          source: 'trip_search_completion'
        }
      });

      res.json({
        success: true,
        messageSent: true,
        userId,
        sessionId
      });

    } catch (error) {
      console.error('Error handling trip completion webhook:', error);
      res.status(500).json({
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

  /**
   * Find an active voice session to get phone number
   * This is a fallback when ElevenLabs doesn't send phone in metadata
   * @returns {Promise<string|null>} Phone number or null
   */
  async findActiveVoiceSession() {
    try {
      const sessions = await sessionManager.getAllSessions();

      // Find the most recent active voice session (within last 5 minutes)
      const fiveMinutesAgo = Date.now() - (5 * 60 * 1000);

      for (const [phoneNumber, session] of Object.entries(sessions)) {
        if (session.channel === 'voice' &&
            session.context?.currentCallSid &&
            new Date(session.lastActivity).getTime() > fiveMinutesAgo) {
          console.log(`📞 Found active voice session for ${phoneNumber}`);
          return phoneNumber;
        }
      }

      console.log('❌ No active voice sessions found');
      return null;
    } catch (error) {
      console.error('Error finding active voice session:', error);
      return null;
    }
  }

  /**
   * Normalize phone number to E.164 format
   * @param {string} phoneNumber - Raw phone number
   * @returns {string} Normalized phone number
   */
  normalizePhoneNumber(phoneNumber) {
    if (!phoneNumber) return null;

    // Remove all non-digit characters except +
    let normalized = phoneNumber.replace(/[^\d+]/g, '');

    // If it doesn't start with +, add it (assume US/Canada +1 if 10 digits)
    if (!normalized.startsWith('+')) {
      if (normalized.length === 10) {
        normalized = '+1' + normalized;
      } else if (normalized.length === 11 && normalized.startsWith('1')) {
        normalized = '+' + normalized;
      } else {
        // Default to adding + if not already there
        normalized = '+' + normalized;
      }
    }

    return normalized;
  }
}

module.exports = new WebhookController();
