const twilioService = require('../services/twilioService');
const llmService = require('../services/llmService');
const assistantService = require('../services/assistantService');
const realtimeService = require('../services/realtimeService');
const elevenLabsService = require('../services/elevenLabsService');
const sessionManager = require('../services/sessionManager');

class VoiceController {
  /**
   * Handle inbound voice calls - routes to ElevenLabs or OpenAI based on configuration
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

      // Priority 1: Use ElevenLabs if configured (better quality)
      if (elevenLabsService.isConfigured() && process.env.ELEVENLABS_VOICE_AGENT_ID) {
        console.log('🎙️ Using ElevenLabs for voice call');

        // Transfer call to ElevenLabs agent
        const agentId = process.env.ELEVENLABS_VOICE_AGENT_ID;

        // Generate TwiML to handoff to ElevenLabs
        const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say>Connecting you to your AI travel assistant.</Say>
  <Connect>
    <ConversationalAI agentId="${agentId}">
      <Parameter name="from" value="${from}" />
      <Parameter name="callSid" value="${callSid}" />
    </ConversationalAI>
  </Connect>
</Response>`;

        res.type('text/xml');
        res.send(twiml);

      // Priority 2: Use OpenAI Realtime API for voice streaming
      } else if (realtimeService.isConfigured()) {
        console.log('🎙️ Using OpenAI Realtime API for voice call');

        // Generate TwiML to connect Twilio's audio stream to our WebSocket
        const websocketUrl = process.env.VOICE_WEBSOCKET_URL ||
          'wss://otherwhere-backend-production.up.railway.app/voice/media-stream';

        const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Connect>
    <Stream url="${websocketUrl}">
      <Parameter name="callSid" value="${callSid}" />
      <Parameter name="from" value="${from}" />
    </Stream>
  </Connect>
</Response>`;

        console.log(`🔌 Connecting call to WebSocket: ${websocketUrl}`);

        res.type('text/xml');
        res.send(twiml);

      } else {
        // Fallback to standard voice handling
        console.log('🎙️ Using fallback voice handling');

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

      // Generate response using OpenAI Assistant or LLM
      let responseText;
      let tripSearchData = null;

      if (assistantService.isConfigured()) {
        try {
          // Create thread if it doesn't exist
          if (!session.threadId) {
            const threadId = await assistantService.createThread();
            await sessionManager.updateSession(from, { threadId });
            session.threadId = threadId;
          }

          // Send message to assistant
          const assistantResponse = await assistantService.sendMessage(
            session.threadId,
            speechResult
          );

          responseText = assistantResponse.text;
          tripSearchData = assistantResponse.tripSearch;

        } catch (error) {
          console.error('Assistant error, falling back to LLM:', error);
          // Fall back to LLM
          const llmResponse = await llmService.generateResponse(
            session.conversationHistory,
            speechResult,
            { maxTokens: 300 }
          );
          responseText = llmResponse.text;
          tripSearchData = llmResponse.tripSearch;
        }
      } else {
        // Use LLM directly
        const llmResponse = await llmService.generateResponse(
          session.conversationHistory,
          speechResult,
          { maxTokens: 300 } // Shorter for voice
        );
        responseText = llmResponse.text;
        tripSearchData = llmResponse.tripSearch;
      }

      // Add assistant response to conversation history
      await sessionManager.addMessage(from, {
        role: 'assistant',
        content: responseText
      });

      // If trip search data is present, search flights directly
      if (tripSearchData) {
        try {
          const travelPayoutsService = require('../services/travelPayoutsService');
          const results = await travelPayoutsService.searchFlights(tripSearchData);
          const smsMessage = travelPayoutsService.formatSMSMessage(results);

          // Send SMS with flight results
          await twilioService.sendLongSMS(from, smsMessage);

          await sessionManager.updateSession(from, {
            tripDetails: tripSearchData,
            context: { ...session.context, tripSearchInitiated: true }
          });
        } catch (searchError) {
          console.error('Flight search error:', searchError);
          // Send error message to user
          await twilioService.sendSMS(from, "I'm having trouble finding flights right now. I'll keep working on it and get back to you!");
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
