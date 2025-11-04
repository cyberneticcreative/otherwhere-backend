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
          budget
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

        // Get user phone number from metadata
        const phoneNumber = metadata?.phone_number || metadata?.from;

        try {
          // Trigger trip search via n8n if configured
          if (n8nService.isConfigured() && phoneNumber) {
            await n8nService.triggerTripSearch(tripDetails, phoneNumber, conversation_id);

            // Update session
            if (phoneNumber) {
              await sessionManager.updateSession(phoneNumber, {
                tripDetails,
                context: {
                  conversationId: conversation_id,
                  tripSearchInitiated: true,
                  tripSearchTimestamp: new Date().toISOString()
                }
              });
            }

            // Return success response to ElevenLabs
            res.json({
              result: `Perfect! I'm searching for trips to ${destination} from ${origin}, departing ${check_in} and returning ${check_out} for ${travelers} traveler(s). I'll text you the best options I find!`,
              success: true
            });

          } else {
            // Fallback: search flights directly
            const travelPayoutsService = require('../services/travelPayoutsService');
            const results = await travelPayoutsService.searchFlights(tripDetails);
            const smsMessage = travelPayoutsService.formatSMSMessage(results);

            // Send SMS if phone number available
            if (phoneNumber) {
              await twilioService.sendLongSMS(phoneNumber, smsMessage);
            }

            res.json({
              result: `I found some great options! ${phoneNumber ? "I've texted you the details." : "Here are your flight options: " + smsMessage}`,
              success: true
            });
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
}

module.exports = new WebhookController();
