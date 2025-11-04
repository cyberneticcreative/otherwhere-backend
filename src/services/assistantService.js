const OpenAI = require('openai');
const travelPayoutsService = require('./travelPayoutsService');

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
   * @param {string} options.userPhone - User's phone number for async notifications
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
      const { run: completedRun, tripSearchData, flightResults } = await this.waitForRunCompletion(threadId, run.id, options);

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
   * @param {Object} options - Options including userPhone for async notifications
   * @param {number} maxAttempts - Maximum polling attempts
   * @returns {Promise<Object>} Completed run object with tripSearchData if applicable
   */
  async waitForRunCompletion(threadId, runId, options = {}, maxAttempts = 30) {
    const twilioService = require('./twilioService');
    let tripSearchData = null;
    let flightResults = null;

    for (let i = 0; i < maxAttempts; i++) {
      const run = await openai.beta.threads.runs.retrieve(threadId, runId);

      if (run.status === 'completed') {
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

              // 🔐 VALIDATE: Check for required fields
              const requiredFields = {
                destination: args.destination,
                origin: args.origin,
                check_in: args.check_in,
                check_out: args.check_out,
                travelers: args.travelers
              };

              const missingFields = Object.entries(requiredFields)
                .filter(([key, value]) => !value)
                .map(([key]) => key);

              if (missingFields.length > 0) {
                console.log(`⚠️ Missing required fields: ${missingFields.join(', ')}`);

                // Return validation error to assistant
                toolOutputs.push({
                  tool_call_id: toolCall.id,
                  output: JSON.stringify({
                    success: false,
                    message: `I need more information to search for flights. Please ask the user for: ${missingFields.join(', ').replace(/_/g, ' ')}`,
                    missingFields: missingFields
                  })
                });

                continue; // Skip to next tool call
              }

              // Store trip search data (all fields are validated at this point)
              tripSearchData = {
                destination: args.destination,
                origin: args.origin,
                startDate: args.check_in,
                endDate: args.check_out,
                travelers: args.travelers,
                budget: args.budget_usd ? {
                  amount: args.budget_usd,
                  currency: 'USD'
                } : null
              };

              // 🚀 ASYNC FLIGHT SEARCH - Don't block the response!
              console.log('🛫 Triggering async flight search...');

              // Fire-and-forget: Start search in background
              travelPayoutsService.searchFlights(tripSearchData)
                .then(async (searchResults) => {
                  console.log(`✅ Background search completed: ${searchResults.flights.length} flights found`);

                  // Send results as separate SMS if phone number available
                  if (options.userPhone) {
                    try {
                      const smsMessage = travelPayoutsService.formatSMSMessage(searchResults);
                      await twilioService.sendLongSMS(options.userPhone, smsMessage);
                      console.log('✅ Flight results SMS sent');
                    } catch (smsError) {
                      console.error('❌ Failed to send flight results SMS:', smsError);
                    }
                  }
                })
                .catch(err => {
                  console.error('❌ Background flight search failed:', err.message);

                  // Optionally notify user of error
                  if (options.userPhone) {
                    twilioService.sendSMS(
                      options.userPhone,
                      "Sorry, I encountered an issue searching for flights. Please try again with different dates or destinations."
                    ).catch(console.error);
                  }
                });

              // Return immediately to assistant (don't wait for search)
              const destination = args.destination;
              const dates = args.check_in && args.check_out
                ? `from ${args.check_in} to ${args.check_out}`
                : 'for your dates';

              toolOutputs.push({
                tool_call_id: toolCall.id,
                output: JSON.stringify({
                  success: true,
                  message: `Perfect! I'm searching for flights to ${destination} ${dates}. I'll text you the best options in just a moment!`,
                  searching: true
                })
              });

              console.log(`⚡ Search started in background, responding immediately`);
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

      // Wait before polling again (exponential backoff)
      const waitTime = Math.min(1000 * Math.pow(1.5, i), 5000);
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
