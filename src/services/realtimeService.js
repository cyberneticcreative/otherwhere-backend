const axios = require('axios');
const WebSocket = require('ws');
const twilioService = require('./twilioService');
const travelPayoutsService = require('./travelPayoutsService');

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const OPENAI_PROMPT_ID = process.env.OPENAI_PROMPT_ID || 'pmpt_6908682a4f608190bf9ccc7211db3dcb0f52166b142036f3';

class RealtimeService {
  /**
   * Create a new OpenAI Realtime session with prompt
   * @returns {Promise<Object>} Session data with client_secret
   */
  async createRealtimeSession() {
    if (!OPENAI_API_KEY) {
      throw new Error('OpenAI API key not configured');
    }

    try {
      console.log(`🎙️ Creating OpenAI Realtime session with prompt ${OPENAI_PROMPT_ID}`);

      const response = await axios.post(
        'https://api.openai.com/v1/realtime/sessions',
        {
          model: 'gpt-4o-realtime-preview-2024-12-17',
          voice: 'verse',
          prompt: {
            id: OPENAI_PROMPT_ID,
            version: '1'
          }
        },
        {
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${OPENAI_API_KEY}`,
            'OpenAI-Beta': 'realtime=v1'
          }
        }
      );

      console.log(`✅ Realtime session created: ${response.data.id}`);

      return {
        id: response.data.id,
        client_secret: response.data.client_secret.value,
        expires_at: response.data.expires_at,
        model: response.data.model
      };

    } catch (error) {
      console.error('Failed to create Realtime session:', error.response?.data || error.message);
      throw new Error('Failed to create OpenAI Realtime session');
    }
  }

  /**
   * Handle WebSocket connection between Twilio and OpenAI Realtime API
   * @param {WebSocket} twilioWs - Twilio WebSocket connection
   * @param {string} callSid - Twilio Call SID
   * @param {string} from - Caller's phone number
   */
  async handleMediaStream(twilioWs, callSid, from) {
    try {
      // Create OpenAI Realtime session
      const session = await this.createRealtimeSession();

      console.log(`🔌 Connecting to OpenAI Realtime API for call ${callSid}`);

      // Connect to OpenAI Realtime API via WebSocket
      const openaiWs = new WebSocket(
        'wss://api.openai.com/v1/realtime',
        {
          headers: {
            'Authorization': `Bearer ${session.client_secret}`,
            'OpenAI-Beta': 'realtime=v1'
          }
        }
      );

      let streamSid = null;
      let conversationMessages = [];
      let tripDetails = null;

      // OpenAI WebSocket opened
      openaiWs.on('open', () => {
        console.log(`✅ Connected to OpenAI Realtime API`);

        // Send session configuration
        openaiWs.send(JSON.stringify({
          type: 'session.update',
          session: {
            turn_detection: {
              type: 'server_vad'
            },
            input_audio_format: 'g711_ulaw',
            output_audio_format: 'g711_ulaw',
            voice: 'verse',
            instructions: 'You are Otherwhere, an AI travel concierge. Help users plan amazing trips.',
            modalities: ['text', 'audio'],
            temperature: 0.8
          }
        }));
      });

      // Handle messages from OpenAI
      openaiWs.on('message', (data) => {
        try {
          const event = JSON.parse(data.toString());

          // Log important events
          if (event.type === 'session.created') {
            console.log(`🎯 OpenAI session created: ${event.session.id}`);
          }

          if (event.type === 'session.updated') {
            console.log(`🔄 OpenAI session updated`);
          }

          if (event.type === 'conversation.item.created') {
            console.log(`💬 Conversation item: ${event.item.type}`);
          }

          // Capture transcript for trip extraction
          if (event.type === 'response.audio_transcript.done') {
            console.log(`🤖 Assistant: ${event.transcript}`);
            conversationMessages.push({
              role: 'assistant',
              content: event.transcript
            });
          }

          if (event.type === 'conversation.item.input_audio_transcription.completed') {
            console.log(`👤 User: ${event.transcript}`);
            conversationMessages.push({
              role: 'user',
              content: event.transcript
            });

            // Try to extract trip details from conversation
            this.extractTripDetails(conversationMessages, from, callSid);
          }

          // Forward audio to Twilio
          if (event.type === 'response.audio.delta' && streamSid) {
            const audioData = {
              event: 'media',
              streamSid: streamSid,
              media: {
                payload: event.delta
              }
            };
            twilioWs.send(JSON.stringify(audioData));
          }

          // Handle function calls for trip search
          if (event.type === 'response.function_call_arguments.done') {
            console.log(`🔧 Function call: ${event.name}`);
            if (event.name === 'search_trips') {
              try {
                const args = JSON.parse(event.arguments);
                tripDetails = {
                  destination: args.destination,
                  origin: args.origin || 'LAX',
                  startDate: args.check_in,
                  endDate: args.check_out,
                  travelers: args.travelers || 1,
                  budget: args.budget_cad ? {
                    amount: args.budget_cad,
                    currency: 'CAD'
                  } : null
                };

                // Search flights directly and send SMS
                console.log(`🛫 Searching flights for ${from}...`);
                travelPayoutsService.searchFlights(tripDetails)
                  .then(results => {
                    const smsMessage = travelPayoutsService.formatSMSMessage(results);
                    return twilioService.sendLongSMS(from, smsMessage);
                  })
                  .then(() => console.log(`✅ Flight results sent via SMS to ${from}`))
                  .catch(err => {
                    console.error(`❌ Flight search error:`, err.message);
                    twilioService.sendSMS(from, "I found your trip details! I'm searching for flights and will text you the results shortly.")
                      .catch(e => console.error('Failed to send fallback SMS:', e));
                  });
              } catch (err) {
                console.error('Failed to parse function arguments:', err);
              }
            }
          }

        } catch (error) {
          console.error('Error processing OpenAI message:', error);
        }
      });

      // Handle messages from Twilio
      twilioWs.on('message', (message) => {
        try {
          const msg = JSON.parse(message);

          if (msg.event === 'start') {
            streamSid = msg.start.streamSid;
            console.log(`📞 Twilio stream started: ${streamSid}`);
          }

          if (msg.event === 'media' && openaiWs.readyState === WebSocket.OPEN) {
            // Forward audio to OpenAI
            openaiWs.send(JSON.stringify({
              type: 'input_audio_buffer.append',
              audio: msg.media.payload
            }));
          }

          if (msg.event === 'stop') {
            console.log(`📴 Twilio stream stopped: ${streamSid}`);
            openaiWs.close();
          }

        } catch (error) {
          console.error('Error processing Twilio message:', error);
        }
      });

      // Handle WebSocket closures
      twilioWs.on('close', () => {
        console.log(`📴 Twilio WebSocket closed for ${callSid}`);
        if (openaiWs.readyState === WebSocket.OPEN) {
          openaiWs.close();
        }
      });

      openaiWs.on('close', () => {
        console.log(`📴 OpenAI WebSocket closed for ${callSid}`);
      });

      // Handle errors
      twilioWs.on('error', (error) => {
        console.error('Twilio WebSocket error:', error);
        if (openaiWs.readyState === WebSocket.OPEN) {
          openaiWs.close();
        }
      });

      openaiWs.on('error', (error) => {
        console.error('OpenAI WebSocket error:', error);
      });

    } catch (error) {
      console.error('Error in handleMediaStream:', error);
      twilioWs.close();
    }
  }

  /**
   * Extract trip details from conversation history
   * @param {Array} messages - Conversation messages
   * @param {string} from - Phone number
   * @param {string} callSid - Call SID
   */
  async extractTripDetails(messages, from, callSid) {
    // Simple pattern matching for trip details
    // This is a fallback if function calling doesn't trigger
    const fullConversation = messages.map(m => m.content).join(' ').toLowerCase();

    const hasDestination = /(?:going to|travel to|visit|fly to)\s+([a-z\s]+)/i.test(fullConversation);
    const hasDates = /(?:in|on|around|during)\s+([a-z]+\s+\d{1,2})/i.test(fullConversation);
    const hasBudget = /\$?\d{1,5}|\d{1,5}\s*(?:dollars|cad|usd)/i.test(fullConversation);

    if (hasDestination && (hasDates || hasBudget)) {
      console.log(`🎯 Potential trip details detected in conversation`);
      // Let the function calling handle it - this is just for logging
    }
  }

  /**
   * Check if Realtime service is configured
   * @returns {boolean}
   */
  isConfigured() {
    return !!(OPENAI_API_KEY && OPENAI_PROMPT_ID);
  }
}

module.exports = new RealtimeService();
