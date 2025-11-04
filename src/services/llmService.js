const OpenAI = require('openai');

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

const MODEL = process.env.OPENAI_MODEL || 'gpt-4-turbo-preview';

// System prompt for the travel concierge
const SYSTEM_PROMPT = `You are Otherwhere, a travel concierge. Help plan trips via SMS.

Keep responses VERY SHORT (under 100 chars when possible).

Gather: destination, dates, budget, # of travelers.

Once you have destination and at least rough dates, call search_trips to find flights.

Be friendly but concise. One question at a time.`;

class OpenAIService {
  /**
   * Generate a response using OpenAI with function calling
   * @param {Array} conversationHistory - Array of messages
   * @param {string} userMessage - Current user message
   * @param {Object} options - Additional options
   * @returns {Promise<Object>} Response object with text and metadata
   */
  async generateResponse(conversationHistory = [], userMessage, options = {}) {
    const travelPayoutsService = require('./travelPayoutsService');

    try {
      const messages = [
        { role: 'system', content: SYSTEM_PROMPT },
        ...conversationHistory.map(msg => ({
          role: msg.role,
          content: msg.content
        })),
        { role: 'user', content: userMessage }
      ];

      // Define the search_trips function tool
      const tools = [{
        type: 'function',
        function: {
          name: 'search_trips',
          description: 'Search for flights to a destination. Call this when you have destination and approximate dates.',
          parameters: {
            type: 'object',
            properties: {
              destination: {
                type: 'string',
                description: 'Destination city or airport code (e.g., Paris, Tokyo, NYC)'
              },
              origin: {
                type: 'string',
                description: 'Origin city or airport code',
                default: 'LAX'
              },
              check_in: {
                type: 'string',
                description: 'Departure date in YYYY-MM-DD format'
              },
              check_out: {
                type: 'string',
                description: 'Return date in YYYY-MM-DD format (optional for one-way)'
              },
              travelers: {
                type: 'number',
                description: 'Number of travelers',
                default: 1
              },
              budget_cad: {
                type: 'number',
                description: 'Budget in USD (optional)'
              }
            },
            required: ['destination']
          }
        }
      }];

      const completion = await openai.chat.completions.create({
        model: MODEL,
        messages,
        tools,
        tool_choice: 'auto',
        max_completion_tokens: options.maxTokens || 300,
        presence_penalty: 0.6,
        frequency_penalty: 0.3
      });

      const choice = completion.choices[0];
      let flightResults = null;
      let responseText = '';

      // Handle function calls
      if (choice.message.tool_calls && choice.message.tool_calls.length > 0) {
        for (const toolCall of choice.message.tool_calls) {
          if (toolCall.function.name === 'search_trips') {
            const args = JSON.parse(toolCall.function.arguments);
            console.log(`🔍 LLM search_trips called with:`, args);

            // Build trip data
            const tripData = {
              destination: args.destination,
              origin: args.origin || 'LAX',
              startDate: args.check_in || null,
              endDate: args.check_out || null,
              travelers: args.travelers || 1,
              budget: args.budget_cad ? {
                amount: args.budget_cad,
                currency: 'USD'
              } : null
            };

            // Actually search for flights
            try {
              console.log('🛫 Calling TravelPayouts API...');
              const searchResults = await travelPayoutsService.searchFlights(tripData);
              flightResults = searchResults;

              // Add function result to messages and get final response
              messages.push(choice.message);
              messages.push({
                role: 'tool',
                tool_call_id: toolCall.id,
                content: JSON.stringify({
                  success: true,
                  message: `Found ${searchResults.flights.length} flights! Best price: ${searchResults.flights[0]?.price || 'N/A'}`,
                  flightCount: searchResults.flights.length
                })
              });

              // Get the assistant's final response
              const finalCompletion = await openai.chat.completions.create({
                model: MODEL,
                messages,
                max_completion_tokens: 150 // Keep it very short
              });

              responseText = finalCompletion.choices[0].message.content;
              console.log(`✅ LLM flight search completed: ${searchResults.flights.length} results`);

            } catch (error) {
              console.error('❌ TravelPayouts error in LLM fallback:', error.message);
              responseText = "I found some issues searching flights right now. Can you try again or adjust your dates?";
            }
          }
        }
      } else {
        // No function call, just return the text response
        responseText = choice.message.content || '';
      }

      return {
        text: responseText || 'Let me help you find flights...',
        tripSearch: null, // No longer needed with function calling
        flightResults, // Include actual flight results
        usage: completion.usage,
        model: completion.model
      };

    } catch (error) {
      console.error('OpenAI API Error:', error);
      throw new Error('Failed to generate response from OpenAI');
    }
  }

  /**
   * Summarize conversation for context
   * @param {Array} conversationHistory - Array of messages
   * @returns {Promise<string>} Summary text
   */
  async summarizeConversation(conversationHistory) {
    try {
      const messages = [
        {
          role: 'system',
          content: 'Summarize this travel planning conversation, focusing on key trip details, preferences, and decisions made.'
        },
        ...conversationHistory.map(msg => ({
          role: msg.role,
          content: msg.content
        }))
      ];

      const completion = await openai.chat.completions.create({
        model: 'gpt-3.5-turbo',
        messages,
        max_completion_tokens: 200
      });

      return completion.choices[0].message.content;
    } catch (error) {
      console.error('Failed to summarize conversation:', error);
      return 'Unable to generate summary';
    }
  }

  /**
   * Extract structured trip data from natural language
   * @param {string} text - User message text
   * @returns {Promise<Object|null>} Extracted trip data or null
   */
  async extractTripData(text) {
    try {
      const completion = await openai.chat.completions.create({
        model: MODEL,
        messages: [
          {
            role: 'system',
            content: `Extract trip planning information from the user's message and return it as JSON. Include only the information explicitly mentioned. Return null if no trip information is present.

Format:
{
  "destination": "string or null",
  "startDate": "YYYY-MM-DD or null",
  "endDate": "YYYY-MM-DD or null",
  "duration": "number of days or null",
  "travelers": "number or null",
  "budget": { "amount": number, "currency": "string" } or null,
  "interests": ["array of strings"] or null
}`
          },
          {
            role: 'user',
            content: text
          }
        ],
        response_format: { type: 'json_object' }
      });

      const result = JSON.parse(completion.choices[0].message.content);
      return result;
    } catch (error) {
      console.error('Failed to extract trip data:', error);
      return null;
    }
  }
}

module.exports = new OpenAIService();
