const twilioService = require('../services/twilioService');
const llmService = require('../services/llmService');
const assistantService = require('../services/assistantService');
const realtimeService = require('../services/realtimeService');
const elevenLabsService = require('../services/elevenLabsService');
const sessionManager = require('../services/sessionManager');
const tripService = require('../services/tripService');

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

      // Get or create session (phone number = universal user ID)
      const session = await sessionManager.getSession(from);

      // Mark onboarding via voice if new user
      if (!session.onboardedVia) {
        await sessionManager.updateSession(from, {
          onboardedVia: 'voice',
          channel: 'voice'
        });
        console.log(`🎤 New user onboarded via voice: ${from}`);
      }

      // Update session with call details
      await sessionManager.updateSession(from, {
        channel: 'voice',
        context: {
          ...session.context,
          currentCallSid: callSid,
          homeAirport: session.context?.homeAirport // Pass existing home airport if available
        }
      });

      // Priority 1: Use ElevenLabs if configured (better quality)
      if (elevenLabsService.isConfigured() && process.env.ELEVENLABS_VOICE_AGENT_ID) {
        console.log('🎙️ Using ElevenLabs for voice call');

        // Transfer call to ElevenLabs agent with user context
        const agentId = process.env.ELEVENLABS_VOICE_AGENT_ID;

        // Prepare user context for the agent
        const userContext = {
          phoneNumber: from,
          callSid: callSid,
          hasProfile: !!session.onboardedVia,
          homeAirport: session.context?.homeAirport || null,
          previousTrips: tripService.getTripsByPhone(from).length
        };

        // Generate TwiML to handoff to ElevenLabs
        const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say>Connecting you to your AI travel assistant.</Say>
  <Connect>
    <ConversationalAI agentId="${agentId}">
      <Parameter name="from" value="${from}" />
      <Parameter name="callSid" value="${callSid}" />
      <Parameter name="userContext" value="${Buffer.from(JSON.stringify(userContext)).toString('base64')}" />
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

      // Generate TwiML response
      const shouldContinue = true; // Continue conversation

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
      Duration: duration,
      CallDuration: callDuration
    } = req.body;

    console.log(`📊 Call Status: ${callSid} - ${status} (Duration: ${duration || callDuration || 0}s)`);

    try {
      if (from) {
        const session = await sessionManager.getSession(from);

        // Handle different call statuses
        switch (status) {
          case 'completed':
            // Normal call completion
            const finalDuration = parseInt(duration || callDuration || 0);

            if (session.context?.currentCallSid === callSid) {
              await sessionManager.updateSession(from, {
                context: {
                  ...session.context,
                  currentCallSid: null,
                  lastCallDuration: finalDuration,
                  lastCallStatus: 'completed',
                  lastCallEndedAt: new Date().toISOString()
                }
              });

              // Detect dropped calls (very short duration)
              if (finalDuration < 10) {
                console.log(`⚠️ Short call detected (${finalDuration}s) - likely dropped`);

                // Send SMS for dropped call
                const twilioService = require('../services/twilioService');
                await twilioService.sendSMS(
                  from,
                  "Looks like we got disconnected! 📞\n\nNo worries - text me where you'd like to go and I'll help you plan your trip."
                );
              }
            }

            console.log(`✅ Call completed. Duration: ${finalDuration}s`);
            break;

          case 'busy':
          case 'no-answer':
          case 'failed':
          case 'canceled':
            // Call didn't connect - log but don't trigger handoff
            console.log(`⚠️ Call not connected: ${status}`);

            if (session.context?.currentCallSid === callSid) {
              await sessionManager.updateSession(from, {
                context: {
                  ...session.context,
                  currentCallSid: null,
                  lastCallStatus: status,
                  lastCallEndedAt: new Date().toISOString()
                }
              });
            }

            // For failed calls, send a helpful SMS
            if (status === 'failed' || status === 'busy') {
              const twilioService = require('../services/twilioService');
              await twilioService.sendSMS(
                from,
                "We couldn't connect your call right now. 😔\n\nNo problem - just text me where you want to go and I'll help you plan an amazing trip!"
              );
            }
            break;

          case 'in-progress':
          case 'ringing':
            // Call in progress - just log
            console.log(`📞 Call ${status}`);
            break;

          default:
            console.log(`Unknown call status: ${status}`);
        }
      }
    } catch (error) {
      console.error('❌ Error handling call status callback:', error);
      // Don't fail the webhook response
    }

    res.sendStatus(200);
  }
}

module.exports = new VoiceController();
