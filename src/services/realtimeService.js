const axios = require('axios');
const WebSocket = require('ws');
const twilioService = require('./twilioService');
const googleFlightsService = require('./googleFlightsService');

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
          model: 'gpt-realtime',
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
   */
  async handleMediaStream(twilioWs) {
    let callSid = null;
    let from = null;
    let streamSid = null;
    let openaiWs = null;

    // Handle messages from Twilio
    twilioWs.on('message', async (message) => {
      try {
        const msg = JSON.parse(message);

        if (msg.event === 'start') {
          streamSid = msg.start.streamSid;
          callSid = msg.start.callSid;
          from = msg.start.customParameters?.from || msg.start.customParameters?.From;

          console.log(`📞 Twilio stream started: ${streamSid} from ${from}`);

          // Create OpenAI Realtime session
          const session = await this.createRealtimeSession();
          console.log(`🔌 Connecting to OpenAI Realtime API for call ${callSid}`);

          // Connect to OpenAI Realtime API via WebSocket
          openaiWs = new WebSocket(
            'wss://api.openai.com/v1/realtime',
            {
              headers: {
                'Authorization': `Bearer ${session.client_secret}`,
                'OpenAI-Beta': 'realtime=v1'
              }
            }
          );

          // Set up OpenAI WebSocket handlers
          this.setupOpenAIHandlers(openaiWs, twilioWs, streamSid, from, callSid);
        }

        if (msg.event === 'media' && openaiWs && openaiWs.readyState === WebSocket.OPEN) {
          // Forward audio to OpenAI
          openaiWs.send(JSON.stringify({
            type: 'input_audio_buffer.append',
            audio: msg.media.payload
          }));
        }

        if (msg.event === 'stop') {
          console.log(`📴 Twilio stream stopped: ${streamSid}`);
          if (openaiWs) {
            openaiWs.close();
          }
        }

      } catch (error) {
        console.error('Error processing Twilio message:', error);
      }
    });

    // Handle WebSocket closures
    twilioWs.on('close', () => {
      console.log(`📴 Twilio WebSocket closed for ${callSid || 'unknown'}`);
      if (openaiWs && openaiWs.readyState === WebSocket.OPEN) {
        openaiWs.close();
      }
    });

    twilioWs.on('error', (error) => {
      console.error('Twilio WebSocket error:', error);
      if (openaiWs && openaiWs.readyState === WebSocket.OPEN) {
        openaiWs.close();
      }
    });
  }

  /**
   * Set up OpenAI WebSocket event handlers
   * @param {WebSocket} openaiWs - OpenAI WebSocket
   * @param {WebSocket} twilioWs - Twilio WebSocket
   * @param {string} streamSid - Stream SID
   * @param {string} from - Phone number
   * @param {string} callSid - Call SID
   */
  setupOpenAIHandlers(openaiWs, twilioWs, streamSid, from, callSid) {
    let conversationMessages = [];

    // OpenAI WebSocket opened
    openaiWs.on('open', () => {
      console.log(`✅ Connected to OpenAI Realtime API`);

      // When using a prompt, don't override with session.update
      // The prompt already contains voice, instructions, etc.
      // Just set audio formats for Twilio compatibility
      openaiWs.send(JSON.stringify({
        type: 'session.update',
        session: {
          input_audio_format: 'g711_ulaw',
          output_audio_format: 'g711_ulaw'
        }
      }));

      // Trigger auto-greeting by creating a response
      // This makes the AI speak first when the call connects
      setTimeout(() => {
        openaiWs.send(JSON.stringify({
          type: 'response.create'
        }));
        console.log('🎤 Triggered AI greeting');
      }, 500);
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
              const tripDetails = {
                destination: args.destination,
                origin: args.origin || 'LAX',
                startDate: args.check_in,
                endDate: args.check_out,
                travelers: args.travelers || 1,
                budget: args.budget_usd ? {
                  amount: args.budget_usd,
                  currency: 'USD'
                } : null
              };

              // Search flights directly and send SMS using Google Flights API
              console.log(`🛫 Searching flights for ${from}...`);

              // Async function to handle the flight search
              (async () => {
                try {
                  // Step 1: Resolve airport codes
                  const [originAirports, destAirports] = await Promise.all([
                    googleFlightsService.searchAirport(tripDetails.origin),
                    googleFlightsService.searchAirport(tripDetails.destination)
                  ]);

                  if (!originAirports || originAirports.length === 0) {
                    throw new Error(`Could not find airport for: ${tripDetails.origin}`);
                  }

                  if (!destAirports || destAirports.length === 0) {
                    throw new Error(`Could not find airport for: ${tripDetails.destination}`);
                  }

                  const originCode = originAirports[0].code;
                  const destCode = destAirports[0].code;

                  console.log(`[GoogleFlights] Resolved: ${originCode} → ${destCode}`);

                  // Step 2: Search flights
                  const searchParams = {
                    departureId: originCode,
                    arrivalId: destCode,
                    outboundDate: tripDetails.startDate,
                    returnDate: tripDetails.endDate || undefined,
                    adults: parseInt(tripDetails.travelers) || 1,
                    travelClass: 'ECONOMY',
                    currency: 'USD'
                  };

                  const searchResults = await googleFlightsService.searchFlights(searchParams);

                  // Step 3: Format results
                  const formattedFlights = googleFlightsService.formatFlightResults(searchResults, 3);

                  if (formattedFlights.length === 0) {
                    throw new Error('No flights found for your search');
                  }

                  // Step 4: Generate SMS message
                  const smsMessage = googleFlightsService.formatSMSMessage(formattedFlights, {
                    departureId: originCode,
                    arrivalId: destCode,
                    outboundDate: tripDetails.startDate
                  });

                  // Step 5: Send SMS
                  await twilioService.sendLongSMS(from, smsMessage);
                  console.log(`✅ Flight results sent via SMS to ${from}`);

                } catch (err) {
                  console.error(`❌ Flight search error:`, err.message);
                  try {
                    await twilioService.sendSMS(
                      from,
                      `Sorry, I had trouble finding flights from ${tripDetails.origin} to ${tripDetails.destination}. Please try different cities or dates, or text me for help!`
                    );
                  } catch (e) {
                    console.error('Failed to send error SMS:', e);
                  }
                }
              })();
            } catch (err) {
              console.error('Failed to parse function arguments:', err);
            }
          }
        }

      } catch (error) {
        console.error('Error processing OpenAI message:', error);
      }
    });

    // Handle OpenAI WebSocket closure
    openaiWs.on('close', () => {
      console.log(`📴 OpenAI WebSocket closed for ${callSid}`);
    });

    openaiWs.on('error', (error) => {
      console.error('OpenAI WebSocket error:', error);
    });
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
