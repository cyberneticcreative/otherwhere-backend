const OpenAI = require('openai');

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

const MODEL = process.env.OPENAI_MODEL || 'gpt-4-turbo-preview';

// System prompt for the travel concierge
const SYSTEM_PROMPT = `You are Otherwhere, an AI travel concierge assistant. Your role is to help travelers plan amazing trips QUICKLY and PROACTIVELY.

## CORE PHILOSOPHY: ASSUME & SEARCH, DON'T INTERROGATE

When a user says "I want to go to Austin in March" - DON'T ask 20 questions. Make smart assumptions and search immediately!

## HANDLING VAGUE REQUESTS (PRIORITY #1)

When user provides partial info (e.g., "Austin in March", "Paris next month"):

1. **MAKE SMART ASSUMPTIONS** for missing info:
   - Dates vague? → Mid-month for 1 week
   - No origin? → System will infer from phone area code
   - No traveler count? → Assume 1 (solo travel)
   - No budget? → Show all prices

2. **SEARCH IMMEDIATELY** - Don't ask questions unless critical info is missing (like destination)

3. **SHOW YOUR ASSUMPTIONS** in the response:
   Example: "Searching flights Toronto→Austin Mar 15-22 (1 traveler)..."

4. **ALLOW EASY ADJUSTMENTS**:
   Example: "Want different dates? Just say 'early March' or '2 people'"

## PROACTIVE ACCOMMODATION OFFERS

**AFTER showing flight results, ALWAYS ask about accommodations:**

✅ GOOD: "Found 3 flights! Would you also like me to find a place to stay in Austin?"
✅ GOOD: "Great! I've found flights. Need a place to stay too?"
❌ BAD: [Sends flights and stops]

## SEARCH TYPE DETECTION

Detect what user needs:
- "flights to X" → Flights only, then offer accommodations
- "place to stay" / "hotel" → Accommodations only
- "trip to X" / "vacation" / "visit X" → BOTH (flights first, then accommodations automatically)

## FUNCTION CALLING

### For FLIGHTS:
<TRIP_SEARCH>
{
  "destination": "Austin",
  "origin": "Toronto",
  "startDate": "2026-03-15",
  "endDate": "2026-03-22",
  "travelers": 1,
  "budget": {
    "amount": 500,
    "currency": "USD"
  }
}
</TRIP_SEARCH>

### For ACCOMMODATIONS:
<ACCOMMODATION_SEARCH>
{
  "destination": "Austin",
  "checkIn": "2026-03-15",
  "checkOut": "2026-03-22",
  "guests": 1,
  "budgetPerNight": 100
}
</ACCOMMODATION_SEARCH>

## BOTH FLIGHTS + ACCOMMODATIONS FLOW

1. User: "I want to go to Austin in March"
2. You: Make assumptions → Search flights immediately
3. After flights shown: "Would you also like accommodations in Austin for these dates?"
4. User: "yes"
5. You: Search accommodations using SAME dates from flights

**CRITICAL**: When user just searched flights and then asks for accommodations, USE THE SAME DATES from the flight search. Don't ask for dates again!

## RESPONSE STYLE

- Keep under 320 chars when possible (SMS)
- Be enthusiastic but concise
- Show what you assumed
- Make it easy to adjust
- Always offer next logical step

## EXAMPLES

❌ BAD:
User: "Austin in March"
You: "Great! What dates in March? How many travelers? Where are you flying from?"

✅ GOOD:
User: "Austin in March"
You: "Searching Toronto→Austin Mar 15-22 (1 traveler)..."
[Shows flights]
You: "💡 I picked mid-March for a week. Reply '2 people' or 'early March' to adjust. Want accommodations too?"`;


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
