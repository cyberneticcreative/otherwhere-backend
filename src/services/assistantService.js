const OpenAI = require('openai');
const googleFlightsService = require('./googleFlightsService');

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

const ASSISTANT_ID = process.env.OPENAI_ASSISTANT_ID;

class AssistantService {
  /**
   * Create a new thread for a conversation
   * @returns {Promise<string>} Thread ID
   */
  async createThread() {
    try {
      const thread = await openai.beta.threads.create();
      console.log(`🧵 Created new thread: ${thread.id}`);
      return thread.id;
    } catch (error) {
      console.error('Failed to create thread:', error);
      throw new Error('Failed to create conversation thread');
    }
  }

  /**
   * Send a message to the assistant and get a response
   * @param {string} threadId - Thread ID for the conversation
   * @param {string} userMessage - User's message
   * @param {Object} options - Additional options
   * @returns {Promise<Object>} Response object with text and metadata
   */
  async sendMessage(threadId, userMessage, options = {}) {
    if (!ASSISTANT_ID) {
      throw new Error('OpenAI Assistant ID not configured');
    }

    try {
      // Add user message to thread
      await openai.beta.threads.messages.create(threadId, {
        role: 'user',
        content: userMessage
      });

      console.log(`💬 Added message to thread ${threadId}`);

      // Create a run
      const run = await openai.beta.threads.runs.create(threadId, {
        assistant_id: ASSISTANT_ID
      });

      console.log(`🏃 Started run ${run.id}`);

      // Poll for completion and handle function calls
      const { run: completedRun, tripSearchData, flightResults } = await this.waitForRunCompletion(threadId, run.id);

      // Get the assistant's response
      const messages = await openai.beta.threads.messages.list(threadId, {
        order: 'desc',
        limit: 1
      });

      const assistantMessage = messages.data[0];

      if (!assistantMessage || assistantMessage.role !== 'assistant') {
        throw new Error('No assistant response found');
      }

      // Extract text content
      const textContent = assistantMessage.content
        .filter(content => content.type === 'text')
        .map(content => content.text.value)
        .join('\n');

      console.log(`✅ Assistant response received (${textContent.length} chars)`);

      return {
        text: textContent || 'Let me help you with that...',
        tripSearch: tripSearchData, // This comes from function calling
        flightResults: flightResults, // This contains actual flight data from TravelPayouts
        threadId: threadId,
        runId: completedRun.id
      };

    } catch (error) {
      console.error('Assistant API Error:', error);
      throw new Error('Failed to get response from assistant');
    }
  }

  /**
   * Poll for run completion and handle function calls
   * @param {string} threadId - Thread ID
   * @param {string} runId - Run ID
   * @param {number} maxAttempts - Maximum polling attempts
   * @returns {Promise<Object>} Completed run object with tripSearchData if applicable
   */
  async waitForRunCompletion(threadId, runId, maxAttempts = 60) {
    let tripSearchData = null;
    let flightResults = null;
    const pollStartTime = Date.now();

    for (let i = 0; i < maxAttempts; i++) {
      const run = await openai.beta.threads.runs.retrieve(threadId, runId);

      if (run.status === 'completed') {
        const pollDuration = Date.now() - pollStartTime;
        console.log(`⏱️  Assistant polling completed in ${pollDuration}ms after ${i + 1} attempts`);
        return { run, tripSearchData, flightResults };
      }

      if (run.status === 'requires_action') {
        // Handle function calling
        const toolCalls = run.required_action?.submit_tool_outputs?.tool_calls || [];

        if (toolCalls.length > 0) {
          console.log(`🔧 Handling ${toolCalls.length} function call(s)`);

          const toolOutputs = [];

          for (const toolCall of toolCalls) {
            if (toolCall.function.name === 'search_trips') {
              // Extract the function arguments
              const args = JSON.parse(toolCall.function.arguments);
              console.log(`🔍 search_trips called with:`, args);

              // Store trip search data
              tripSearchData = {
                destination: args.destination,
                origin: args.origin || 'LAX',
                startDate: args.check_in || null,
                endDate: args.check_out || null,
                travelers: args.travelers || 1,
                budget: args.budget_cad ? {
                  amount: args.budget_cad,
                  currency: 'CAD'
                } : null
              };

              // ACTUALLY SEARCH FOR FLIGHTS using Google Flights API
              try {
                const flightSearchStart = Date.now();
                console.log('🛫 Calling Google Flights API...');

                // Step 1: Resolve airport codes
                const [originAirports, destAirports] = await Promise.all([
                  googleFlightsService.searchAirport(tripSearchData.origin),
                  googleFlightsService.searchAirport(tripSearchData.destination)
                ]);

                if (!originAirports || originAirports.length === 0) {
                  throw new Error(`Could not find airport for: ${tripSearchData.origin}`);
                }

                if (!destAirports || destAirports.length === 0) {
                  throw new Error(`Could not find airport for: ${tripSearchData.destination}`);
                }

                const originCode = originAirports[0].code;
                const destCode = destAirports[0].code;

                console.log(`[GoogleFlights] Resolved: ${originCode} → ${destCode}`);

                // Step 2: Search flights
                const searchParams = {
                  departureId: originCode,
                  arrivalId: destCode,
                  outboundDate: tripSearchData.startDate,
                  returnDate: tripSearchData.endDate || undefined,
                  adults: parseInt(tripSearchData.travelers) || 1,
                  travelClass: 'ECONOMY',
                  currency: 'USD'
                };

                const searchResults = await googleFlightsService.searchFlights(searchParams);

                // Step 3: Format results
                const formattedFlights = googleFlightsService.formatFlightResults(searchResults, 3);

                // Store formatted results for SMS sending later
                flightResults = {
                  flights: formattedFlights,
                  originCode,
                  destCode,
                  searchParams
                };

                // Return flight results to the assistant
                const resultsMessage = formattedFlights.length > 0
                  ? `Found ${formattedFlights.length} flights! Best price: $${formattedFlights[0].price} on ${formattedFlights[0].airline}`
                  : 'No flights found for these dates. Try different dates.';

                toolOutputs.push({
                  tool_call_id: toolCall.id,
                  output: JSON.stringify({
                    success: true,
                    message: resultsMessage,
                    flightCount: formattedFlights.length,
                    bestPrice: formattedFlights[0]?.price || null,
                    bestAirline: formattedFlights[0]?.airline || null
                  })
                });

                const flightSearchDuration = Date.now() - flightSearchStart;
                console.log(`✅ Flight search completed: ${formattedFlights.length} results in ${flightSearchDuration}ms`);

              } catch (error) {
                console.error('❌ Google Flights API error:', error.message);

                // Return error to assistant
                toolOutputs.push({
                  tool_call_id: toolCall.id,
                  output: JSON.stringify({
                    success: false,
                    message: 'Unable to search flights at the moment. Please try again or check city names.'
                  })
                });
              }
            }
          }

          // Submit tool outputs
          if (toolOutputs.length > 0) {
            await openai.beta.threads.runs.submitToolOutputs(threadId, runId, {
              tool_outputs: toolOutputs
            });
            console.log(`✅ Submitted ${toolOutputs.length} tool output(s)`);
          }
        }
      }

      if (run.status === 'failed' || run.status === 'cancelled' || run.status === 'expired') {
        throw new Error(`Run ${run.status}: ${run.last_error?.message || 'Unknown error'}`);
      }

      // Wait before polling again (faster polling, max 2s instead of 5s)
      // Start at 500ms, increase to 1s, then 2s max
      const waitTime = i < 3 ? 500 : (i < 10 ? 1000 : 2000);
      await new Promise(resolve => setTimeout(resolve, waitTime));
    }

    throw new Error('Run timed out waiting for completion');
  }

  /**
   * Get thread messages
   * @param {string} threadId - Thread ID
   * @param {number} limit - Number of messages to retrieve
   * @returns {Promise<Array>} Array of messages
   */
  async getThreadMessages(threadId, limit = 20) {
    try {
      const messages = await openai.beta.threads.messages.list(threadId, {
        order: 'asc',
        limit: limit
      });

      return messages.data.map(msg => ({
        role: msg.role,
        content: msg.content
          .filter(content => content.type === 'text')
          .map(content => content.text.value)
          .join('\n'),
        timestamp: msg.created_at
      }));
    } catch (error) {
      console.error('Failed to get thread messages:', error);
      return [];
    }
  }

  /**
   * Delete a thread
   * @param {string} threadId - Thread ID to delete
   * @returns {Promise<boolean>} Success status
   */
  async deleteThread(threadId) {
    try {
      await openai.beta.threads.del(threadId);
      console.log(`🗑️  Deleted thread ${threadId}`);
      return true;
    } catch (error) {
      console.error('Failed to delete thread:', error);
      return false;
    }
  }

  /**
   * Check if assistant is configured
   * @returns {boolean} True if configured
   */
  isConfigured() {
    return !!(process.env.OPENAI_API_KEY && ASSISTANT_ID);
  }

  /**
   * Get assistant details
   * @returns {Promise<Object>} Assistant object
   */
  async getAssistantDetails() {
    if (!ASSISTANT_ID) {
      throw new Error('Assistant ID not configured');
    }

    try {
      const assistant = await openai.beta.assistants.retrieve(ASSISTANT_ID);
      return {
        id: assistant.id,
        name: assistant.name,
        model: assistant.model,
        instructions: assistant.instructions
      };
    } catch (error) {
      console.error('Failed to get assistant details:', error);
      throw error;
    }
  }
}

module.exports = new AssistantService();
