const twilioService = require('../services/twilioService');
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

      // Validate webhook signature
      if (!elevenLabsService.validateWebhookSignature(req.headers, req.rawBody || JSON.stringify(req.body))) {
        console.error('❌ Invalid webhook signature - rejecting request');
        return res.status(401).json({ error: 'Invalid signature' });
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
      console.log('Payload:', JSON.stringify(req.body, null, 2));

      // Validate webhook signature
      if (!elevenLabsService.validateWebhookSignature(req.headers, req.rawBody || JSON.stringify(req.body))) {
        console.error('❌ Invalid webhook signature - rejecting request');
        return res.status(401).json({ error: 'Invalid signature' });
      }

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

        // Build trip details object
        const tripDetails = {
          destination,
          origin,
          startDate: check_in,
          endDate: check_out,
          travelers,
          budget: budget_usd ? {
            amount: budget_usd,
            currency: 'USD'
          } : null
        };

        // Get user phone number from metadata
        const phoneNumber = metadata?.phone_number || metadata?.from;

        try {
          // Search flights directly via TravelPayouts
          const travelPayoutsService = require('../services/travelPayoutsService');
          const results = await travelPayoutsService.searchFlights(tripDetails);
          const smsMessage = travelPayoutsService.formatSMSMessage(results);

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

          // Send SMS if phone number available
          if (phoneNumber) {
            await twilioService.sendLongSMS(phoneNumber, smsMessage);
          }

          res.json({
            result: `I found some great options! ${phoneNumber ? "I've texted you the details." : "Here are your flight options: " + smsMessage}`,
            success: true
          });

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
