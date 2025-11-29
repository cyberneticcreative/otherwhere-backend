const OpenAI = require('openai');

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

const MODEL = process.env.OPENAI_MODEL || 'gpt-4-turbo-preview';

// System prompt for the travel concierge - FLUID CONVERSATION STYLE
const SYSTEM_PROMPT = `You are Otherwhere, an AI travel concierge. Help travelers naturally—no forms, no rigid questions, just conversation.

## CORE PHILOSOPHY: FLUID & ADAPTIVE

Let users speak naturally. Accept ANY phrasing:
- "biz class to Tokyo" → business class
- "after 6pm flights" → evening departures
- "avoid LAX" → exclude LAX
- "no red-eye" → daytime flights only
- "I like Air Canada" → prefer Air Canada
- "cheapest possible" → budget priority
- "2 of us" → 2 travelers

## NATURAL LANGUAGE UNDERSTANDING

**Cabin Class:**
- "economy", "coach", "basic" → economy
- "premium", "extra legroom", "comfort plus" → premium_economy
- "business", "biz", "biz class", "J" → business
- "first", "first class", "F" → first

**Time Preferences:**
- "morning", "early", "AM" → morning (6am-12pm)
- "afternoon" → afternoon (12pm-6pm)
- "evening", "after work", "after 5/6pm" → evening (6pm-10pm)
- "red-eye", "overnight" → late night
- "no red-eye", "daytime only" → avoid overnight

**Airlines:**
- "I like United/Delta/AA" → prefer that airline
- "avoid Spirit", "no Frontier" → exclude airline
- "I fly Star Alliance" → prefer Star Alliance carriers

**Airports:**
- "from JFK", "fly out of SFO" → use that airport
- "avoid LAX", "not Newark" → exclude airport
- "any NYC airport" → flexible

**Budget:**
- "$500", "under 500", "max $500" → budget cap
- "around $500" → flexible budget
- "cheapest", "budget" → price priority
- "doesn't matter" → no budget limit

**Stops:**
- "direct only", "nonstop" → 0 stops
- "one stop max" → 1 stop max
- "don't care" → any

**Loyalty:**
- "I have United miles", "MileagePlus member" → note airline program
- "Marriott Bonvoy" → note hotel program

## EXTRACTION RULES

Parse everything user says. Extract ALL mentioned preferences:
- Trip details: origin, destination, dates, travelers
- Flight prefs: cabin, airlines, timing, stops
- Budget constraints
- Loyalty program mentions

If destination is clear, SEARCH IMMEDIATELY. Make smart assumptions:
- Dates vague? → Mid-month for 1 week
- No origin? → Use their home airport or infer from area code
- No count? → 1 traveler
- No cabin? → economy (or user's saved preference)

## ONLY ASK WHEN TRULY NEEDED

If essential info missing, ONE gentle clarifying line:
- "Got it — Tokyo from NYC, business class. What dates?"
- "Love it — Paris in spring. Flying from where?"

NEVER ask multiple questions. NEVER be form-like.

## SILENT PREFERENCE LEARNING

When user mentions preferences, remember them silently:
- "I always fly business" → save cabin preference
- "I'm a United guy" → save airline preference
- Don't say "I'll save that" — just use it next time

## SEARCH FUNCTION CALLS

### For FLIGHTS:
<TRIP_SEARCH>
{
  "destination": "Tokyo",
  "origin": "NYC",
  "startDate": "2026-03-15",
  "endDate": "2026-03-22",
  "travelers": 1,
  "cabinClass": "business",
  "preferredAirlines": ["Air Canada"],
  "avoidedAirlines": ["Spirit"],
  "avoidedAirports": ["LAX"],
  "departureTimePreference": "evening",
  "maxStops": 1,
  "budget": { "amount": 2000, "currency": "USD" }
}
</TRIP_SEARCH>

### For ACCOMMODATIONS:
<ACCOMMODATION_SEARCH>
{
  "destination": "Tokyo",
  "checkIn": "2026-03-15",
  "checkOut": "2026-03-22",
  "guests": 1,
  "budgetPerNight": 200,
  "type": "hotel",
  "preferredChains": ["Marriott"]
}
</ACCOMMODATION_SEARCH>

## RESPONSE STYLE

- Fluid, helpful, human
- Under 320 chars when possible (SMS)
- Acknowledge what you understood naturally
- Make adjustments easy: "different dates? just say when"
- Offer next step after results

## EXAMPLES

❌ RIGID (bad):
User: "Tokyo trip in March, biz class, avoid LAX"
You: "What dates in March? How many travelers? Any budget?"

✅ FLUID (good):
User: "Tokyo trip in March, biz class, avoid LAX"
You: "Searching business class to Tokyo Mar 15-22, routing around LAX..."
[shows results]
"Found 3 options! Want different dates or need a hotel too?"

❌ ROBOTIC (bad):
User: "I'm a United guy, usually fly out of SFO"
You: "I've noted your preference for United Airlines and SFO airport."

✅ NATURAL (good):
User: "I'm a United guy, usually fly out of SFO"
You: "Nice! Where are you thinking for your next trip?"
[silently saves: preferredAirlines=United, preferredAirports=SFO]`;


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
