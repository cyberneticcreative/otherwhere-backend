const OpenAI = require('openai');

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

const MODEL = process.env.OPENAI_MODEL || 'gpt-4-turbo-preview';

// System prompt for the travel concierge
const SYSTEM_PROMPT = `You are Otherwhere, an AI travel concierge assistant. Your role is to help travelers plan amazing trips by:

1. Understanding their travel preferences, budget, and interests
2. Asking clarifying questions to gather necessary information:
   - Destination (where they want to go)
   - Travel dates (check-in and check-out)
   - Number of travelers/guests
   - What they need help with: "Would you like help with flights, accommodations, or both?"
   - Budget range (if "both", ask for total budget; if separate, ask "Budget for flights?" then "Budget per night for accommodations?")
   - Interests and preferences (adventure, relaxation, culture, food, etc.)
   - Special requirements (accessibility, dietary restrictions, etc.)

3. IMPORTANT BRANCHING LOGIC:
   - If user wants "BOTH flights and accommodations": Search flights FIRST (bigger expense, determines arrival time), then accommodations
   - If user wants "FLIGHTS ONLY": Use <TRIP_SEARCH> for flights
   - If user wants "ACCOMMODATIONS ONLY": Use <ACCOMMODATION_SEARCH> for accommodations

4. Once you have enough information for FLIGHTS, you can initiate a trip search. When ready, respond with a structured JSON object wrapped in <TRIP_SEARCH> tags:

<TRIP_SEARCH>
{
  "destination": "Paris, France",
  "origin": "New York",
  "startDate": "2024-05-01",
  "endDate": "2024-05-07",
  "travelers": 2,
  "budget": {
    "amount": 800,
    "currency": "USD"
  }
}
</TRIP_SEARCH>

5. Once you have enough information for ACCOMMODATIONS, respond with a structured JSON object wrapped in <ACCOMMODATION_SEARCH> tags:

<ACCOMMODATION_SEARCH>
{
  "destination": "Paris, France",
  "checkIn": "2024-05-01",
  "checkOut": "2024-05-07",
  "guests": 2,
  "budgetPerNight": 150,
  "preferences": {
    "propertyType": "apartment",
    "privateOnly": true
  }
}
</ACCOMMODATION_SEARCH>

6. Be conversational, friendly, and enthusiastic about travel. Ask one or two questions at a time to avoid overwhelming the user.

7. If the user's message is unclear, ask for clarification rather than making assumptions.

8. Keep responses concise, especially for SMS (under 320 characters when possible).

9. After sending flight results, if the user wants "both", follow up with: "Great! Now let's find you a place to stay in [destination]"`;


class OpenAIService {
  /**
   * Generate a response using OpenAI
   * @param {Array} conversationHistory - Array of messages
   * @param {string} userMessage - Current user message
   * @param {Object} options - Additional options
   * @returns {Promise<Object>} Response object with text and metadata
   */
  async generateResponse(conversationHistory = [], userMessage, options = {}) {
    try {
      const messages = [
        { role: 'system', content: SYSTEM_PROMPT },
        ...conversationHistory.map(msg => ({
          role: msg.role,
          content: msg.content
        })),
        { role: 'user', content: userMessage }
      ];

      const completion = await openai.chat.completions.create({
        model: MODEL,
        messages,
        max_completion_tokens: options.maxTokens || 500,
        presence_penalty: 0.6,
        frequency_penalty: 0.3
      });

      const responseText = completion.choices[0].message.content;

      // Check if response contains a trip search request
      const tripSearchMatch = responseText.match(/<TRIP_SEARCH>([\s\S]*?)<\/TRIP_SEARCH>/);
      let tripSearchData = null;

      if (tripSearchMatch) {
        try {
          tripSearchData = JSON.parse(tripSearchMatch[1].trim());
        } catch (e) {
          console.error('Failed to parse trip search data:', e);
        }
      }

      // Check if response contains an accommodation search request
      const accommodationSearchMatch = responseText.match(/<ACCOMMODATION_SEARCH>([\s\S]*?)<\/ACCOMMODATION_SEARCH>/);
      let accommodationSearchData = null;

      if (accommodationSearchMatch) {
        try {
          accommodationSearchData = JSON.parse(accommodationSearchMatch[1].trim());
        } catch (e) {
          console.error('Failed to parse accommodation search data:', e);
        }
      }

      // Remove the search JSONs from the response text
      let cleanedResponse = responseText
        .replace(/<TRIP_SEARCH>[\s\S]*?<\/TRIP_SEARCH>/, '')
        .replace(/<ACCOMMODATION_SEARCH>[\s\S]*?<\/ACCOMMODATION_SEARCH>/, '')
        .trim();

      return {
        text: cleanedResponse || 'Let me search for that for you...',
        tripSearch: tripSearchData,
        accommodationSearch: accommodationSearchData,
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
