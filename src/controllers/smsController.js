const twilioService = require('../services/twilioService');
const llmService = require('../services/llmService');
const elevenLabsService = require('../services/elevenLabsService');
const n8nService = require('../services/n8nService');
const sessionManager = require('../services/sessionManager');

class SMSController {
  /**
   * Handle inbound SMS messages from Twilio
   * @param {Object} req - Express request
   * @param {Object} res - Express response
   */
  async handleInboundSMS(req, res) {
    try {
      const { From: from, Body: body, MessageSid: messageSid } = req.body;

      console.log(`📱 Inbound SMS from ${from}: "${body}"`);

      // Get or create session
      const session = await sessionManager.getSession(from);
      await sessionManager.updateSession(from, { channel: 'sms' });

      // Add user message to conversation history
      await sessionManager.addMessage(from, {
        role: 'user',
        content: body
      });

      // Decide whether to use ElevenLabs or OpenAI
      const useElevenLabs = elevenLabsService.isConfigured() && session.agentId;

      let responseText;
      let tripSearchData = null;

      if (useElevenLabs) {
        // Use ElevenLabs conversational AI
        try {
          const agentResponse = await elevenLabsService.sendTextMessage(
            body,
            session.agentId,
            { userId: from, channel: 'sms' }
          );

          responseText = agentResponse.message || agentResponse.response ||
            "I'm processing your request. Let me help you with that.";

        } catch (error) {
          console.error('ElevenLabs error, falling back to LLM:', error);
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
      }

      // Add assistant response to conversation history
      await sessionManager.addMessage(from, {
        role: 'assistant',
        content: responseText
      });

      // If trip search data is present, trigger n8n workflow
      if (tripSearchData && n8nService.isConfigured()) {
        try {
          await n8nService.triggerTripSearch(tripSearchData, from, session.id);

          // Update session with trip details
          await sessionManager.updateSession(from, {
            tripDetails: tripSearchData,
            context: { ...session.context, tripSearchInitiated: true }
          });

          // Add a note about trip search
          if (!responseText.toLowerCase().includes('search')) {
            responseText += "\n\nI'm searching for the best options for your trip now. I'll get back to you shortly with some great recommendations!";
          }
        } catch (n8nError) {
          console.error('n8n workflow error:', n8nError);
          responseText += "\n\nI'm working on finding options for you. This might take a moment.";
        }
      }

      // Send response via SMS
      await twilioService.sendLongSMS(from, responseText);

      // Send TwiML response to Twilio
      res.type('text/xml');
      res.send('<?xml version="1.0" encoding="UTF-8"?><Response></Response>');

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
