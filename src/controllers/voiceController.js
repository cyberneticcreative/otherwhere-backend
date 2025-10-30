const twilioService = require('../services/twilioService');
const llmService = require('../services/llmService');
const elevenLabsService = require('../services/elevenLabsService');
const n8nService = require('../services/n8nService');
const sessionManager = require('../services/sessionManager');

class VoiceController {
  /**
   * Handle inbound voice calls
   * @param {Object} req - Express request
   * @param {Object} res - Express response
   */
  async handleInboundCall(req, res) {
    try {
      const { From: from, CallSid: callSid } = req.body;

      console.log(`📞 Inbound call from ${from}: ${callSid}`);

      // Get or create session
      const session = await sessionManager.getSession(from);
      await sessionManager.updateSession(from, {
        channel: 'voice',
        context: { ...session.context, currentCallSid: callSid }
      });

      // Check if we should use ElevenLabs voice agent
      const useElevenLabs = elevenLabsService.isConfigured() &&
        elevenLabsService.getAgentIds().voiceAgent;

      if (useElevenLabs) {
        // Hand off to ElevenLabs voice agent
        try {
          const agentId = elevenLabsService.getAgentIds().voiceAgent;
          await sessionManager.updateSession(from, { agentId });

          // Note: ElevenLabs handles the voice interaction directly
          // Send a simple greeting and let ElevenLabs take over
          const greeting = "Hello! I'm Otherwhere, your AI travel concierge. How can I help you plan your next adventure?";

          const twiml = twilioService.generateVoiceResponse(greeting, {
            gather: true,
            gatherAction: '/voice/process-speech'
          });

          res.type('text/xml');
          res.send(twiml);

        } catch (error) {
          console.error('ElevenLabs voice error:', error);
          // Fall back to standard voice handling
          this.handleStandardVoiceGreeting(req, res);
        }
      } else {
        // Standard voice handling with Twilio + OpenAI
        this.handleStandardVoiceGreeting(req, res);
      }

    } catch (error) {
      console.error('Error handling inbound call:', error);

      const errorResponse = twilioService.generateVoiceResponse(
        "I'm sorry, I'm having trouble connecting right now. Please try again later.",
        { hangup: true }
      );

      res.type('text/xml');
      res.send(errorResponse);
    }
  }

  /**
   * Handle standard voice greeting (without ElevenLabs)
   * @param {Object} req - Express request
   * @param {Object} res - Express response
   */
  handleStandardVoiceGreeting(req, res) {
    const greeting = "Hello! Welcome to Otherwhere, your AI travel concierge. " +
      "I can help you plan amazing trips. Tell me, where would you like to go?";

    const twiml = twilioService.generateVoiceResponse(greeting, {
      gather: true,
      gatherAction: '/voice/process-speech',
      speechTimeout: 'auto'
    });

    res.type('text/xml');
    res.send(twiml);
  }

  /**
   * Process speech input from user
   * @param {Object} req - Express request
   * @param {Object} res - Express response
   */
  async processSpeech(req, res) {
    try {
      const {
        From: from,
        SpeechResult: speechResult,
        Confidence: confidence
      } = req.body;

      console.log(`🎤 Speech from ${from} (confidence: ${confidence}): "${speechResult}"`);

      if (!speechResult) {
        const retry = twilioService.generateVoiceResponse(
          "I didn't catch that. Could you please repeat?",
          {
            gather: true,
            gatherAction: '/voice/process-speech'
          }
        );

        res.type('text/xml');
        return res.send(retry);
      }

      // Get session
      const session = await sessionManager.getSession(from);

      // Add user message to conversation history
      await sessionManager.addMessage(from, {
        role: 'user',
        content: speechResult
      });

      // Generate response using LLM
      const llmResponse = await llmService.generateResponse(
        session.conversationHistory,
        speechResult,
        { maxTokens: 300 } // Shorter for voice
      );

      const responseText = llmResponse.text;
      const tripSearchData = llmResponse.tripSearch;

      // Add assistant response to conversation history
      await sessionManager.addMessage(from, {
        role: 'assistant',
        content: responseText
      });

      // If trip search data is present, trigger n8n workflow
      if (tripSearchData && n8nService.isConfigured()) {
        try {
          await n8nService.triggerTripSearch(tripSearchData, from, session.id);

          await sessionManager.updateSession(from, {
            tripDetails: tripSearchData,
            context: { ...session.context, tripSearchInitiated: true }
          });
        } catch (n8nError) {
          console.error('n8n workflow error:', n8nError);
        }
      }

      // Generate TwiML response
      const shouldContinue = !tripSearchData; // End call if trip search initiated

      const twiml = twilioService.generateVoiceResponse(
        responseText,
        {
          gather: shouldContinue,
          gatherAction: '/voice/process-speech',
          hangup: !shouldContinue
        }
      );

      res.type('text/xml');
      res.send(twiml);

    } catch (error) {
      console.error('Error processing speech:', error);

      const errorResponse = twilioService.generateVoiceResponse(
        "I'm sorry, I encountered an error. Let me transfer you to our support team.",
        { hangup: true }
      );

      res.type('text/xml');
      res.send(errorResponse);
    }
  }

  /**
   * Handle voice call status callbacks
   * @param {Object} req - Express request
   * @param {Object} res - Express response
   */
  async handleStatusCallback(req, res) {
    const {
      CallSid: callSid,
      CallStatus: status,
      From: from,
      Duration: duration
    } = req.body;

    console.log(`📊 Call Status: ${callSid} - ${status}`);

    if (status === 'completed' && from) {
      // Clean up session context on call completion
      const session = await sessionManager.getSession(from);
      if (session.context?.currentCallSid === callSid) {
        await sessionManager.updateSession(from, {
          context: {
            ...session.context,
            currentCallSid: null,
            lastCallDuration: duration
          }
        });
      }

      console.log(`Call completed. Duration: ${duration}s`);
    }

    res.sendStatus(200);
  }
}

module.exports = new VoiceController();
