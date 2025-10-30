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
