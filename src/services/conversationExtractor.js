/**
 * Conversation Extractor Service
 * Extracts structured travel preferences from natural language
 * Handles fluid, informal phrasing and normalizes into structured data
 */

const OpenAI = require('openai');

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

// Extraction prompt - handles all the casual phrasing variations
const EXTRACTION_PROMPT = `You are a travel preference extractor. Parse the user's natural language into structured data.

IMPORTANT: Extract ONLY what's explicitly mentioned. Return null for fields not mentioned.

## Field Mappings

**Cabin Class** (cabin_class):
- "economy", "coach", "basic" → "economy"
- "premium economy", "premium", "extra legroom" → "premium_economy"
- "business", "biz", "biz class", "J class" → "business"
- "first", "first class", "F class" → "first"

**Time Windows** (departure_time_preference):
- "morning", "early", "AM flight" → "morning" (6am-12pm)
- "afternoon" → "afternoon" (12pm-6pm)
- "evening", "after work", "after 5", "after 6pm" → "evening" (6pm-10pm)
- "red-eye", "overnight", "late night" → "red_eye" (10pm-6am)
- "no red-eye", "avoid overnight" → "no_red_eye"

**Airline Preferences** (preferred_airlines, avoided_airlines):
- "I like United", "prefer Delta", "fly AA" → add to preferred_airlines
- "avoid Spirit", "hate Frontier", "no basic carriers" → add to avoided_airlines
- Common aliases: AA=American, UA=United, DL=Delta, WN=Southwest, B6=JetBlue, AS=Alaska

**Airport Constraints** (preferred_airports, avoided_airports):
- "fly out of JFK", "from LAX", "use SFO" → add to preferred_airports
- "avoid LAX", "not Newark", "hate EWR" → add to avoided_airports
- "any NYC airport", "flexible on airport" → null (no constraint)

**Budget** (max_budget, budget_flexibility):
- "$500", "under 500", "max $500" → max_budget: 500
- "around $500", "about 500" → max_budget: 500, budget_flexibility: "flexible"
- "cheapest", "lowest price", "budget" → budget_flexibility: "strict"
- "price doesn't matter", "whatever it costs" → budget_flexibility: "unlimited"

**Loyalty Programs** (loyalty_programs):
- "I have United miles", "MileagePlus member" → { airline: "United", program: "MileagePlus" }
- "Marriott Bonvoy", "Hilton Honors" → { hotel_chain: "Marriott/Hilton", program: "Bonvoy/Honors" }
- Include number if mentioned: "my United number is 12345"

**Stops/Routing** (max_stops, connection_preferences):
- "direct only", "nonstop", "no stops" → max_stops: 0
- "one stop max", "1 stop okay" → max_stops: 1
- "avoid long layovers", "short connections" → connection_preferences: "short"
- "don't care about stops" → null

**Trip Details** (origin, destination, dates, travelers):
- Extract city/airport codes when mentioned
- Parse dates naturally: "March 15", "next weekend", "spring break"
- "me and my wife", "2 of us", "solo" → travelers count

Return JSON with these fields (null if not mentioned):
{
  "trip": {
    "origin": string | null,
    "destination": string | null,
    "departure_date": "YYYY-MM-DD" | null,
    "return_date": "YYYY-MM-DD" | null,
    "travelers": number | null,
    "trip_type": "roundtrip" | "one_way" | null
  },
  "flight_preferences": {
    "cabin_class": "economy" | "premium_economy" | "business" | "first" | null,
    "preferred_airlines": string[] | null,
    "avoided_airlines": string[] | null,
    "max_stops": number | null,
    "departure_time_preference": "morning" | "afternoon" | "evening" | "red_eye" | "no_red_eye" | null,
    "connection_preferences": "short" | "any" | null
  },
  "airport_preferences": {
    "preferred_airports": string[] | null,
    "avoided_airports": string[] | null
  },
  "budget": {
    "max_amount": number | null,
    "currency": "USD",
    "flexibility": "strict" | "flexible" | "unlimited" | null
  },
  "loyalty_programs": [
    {
      "type": "airline" | "hotel",
      "company": string,
      "program_name": string | null,
      "member_number": string | null
    }
  ] | null,
  "accommodation_preferences": {
    "type": "hotel" | "airbnb" | "both" | null,
    "max_per_night": number | null,
    "preferred_chains": string[] | null
  },
  "extracted_intent": "search_flights" | "search_accommodations" | "search_both" | "update_preferences" | "general_question" | null,
  "missing_critical": string[] // What's needed to search (e.g., ["destination", "dates"])
}`;

/**
 * Extract structured travel data from natural language
 * @param {string} userMessage - Raw user message
 * @param {Object} conversationContext - Previous context (last search, known preferences)
 * @returns {Promise<Object>} Extracted structured data
 */
async function extractFromMessage(userMessage, conversationContext = {}) {
  try {
    // Build context for the extraction
    let contextHint = '';
    if (conversationContext.lastSearch) {
      contextHint += `\n[Previous search: ${JSON.stringify(conversationContext.lastSearch)}]`;
    }
    if (conversationContext.userPreferences) {
      contextHint += `\n[Known preferences: ${JSON.stringify(conversationContext.userPreferences)}]`;
    }

    const completion = await openai.chat.completions.create({
      model: 'gpt-4-turbo-preview',
      messages: [
        { role: 'system', content: EXTRACTION_PROMPT },
        { role: 'user', content: `${contextHint}\n\nUser message: "${userMessage}"` }
      ],
      response_format: { type: 'json_object' },
      max_tokens: 800,
      temperature: 0.1 // Low temp for consistent extraction
    });

    const extracted = JSON.parse(completion.choices[0].message.content);

    // Merge with context - user's new input takes precedence
    return mergeWithContext(extracted, conversationContext);

  } catch (error) {
    console.error('Extraction error:', error);
    return {
      error: true,
      extracted_intent: 'general_question',
      missing_critical: ['destination']
    };
  }
}

/**
 * Merge extracted data with existing context
 * New data takes precedence, but fills gaps from context
 */
function mergeWithContext(extracted, context) {
  const merged = { ...extracted };

  // If we have a last search and user is asking for accommodations without dates,
  // inherit the dates from the flight search
  if (context.lastFlightSearch && extracted.extracted_intent === 'search_accommodations') {
    if (!merged.trip) merged.trip = {};

    if (!merged.trip.destination && context.lastFlightSearch.destination) {
      merged.trip.destination = context.lastFlightSearch.destination;
    }
    if (!merged.trip.departure_date && context.lastFlightSearch.startDate) {
      merged.trip.departure_date = context.lastFlightSearch.startDate;
    }
    if (!merged.trip.return_date && context.lastFlightSearch.endDate) {
      merged.trip.return_date = context.lastFlightSearch.endDate;
    }
  }

  // Inherit user's known preferences for search if not overridden
  if (context.userPreferences) {
    if (!merged.flight_preferences) merged.flight_preferences = {};

    // Use saved cabin class if not specified in this message
    if (!merged.flight_preferences.cabin_class && context.userPreferences.preferred_class) {
      merged.flight_preferences.cabin_class = context.userPreferences.preferred_class;
      merged._inherited = merged._inherited || [];
      merged._inherited.push('cabin_class');
    }
  }

  return merged;
}

/**
 * Determine what clarifying question to ask (if any)
 * Returns null if we have enough to search
 */
function getGentleClarification(extracted) {
  const missing = extracted.missing_critical || [];

  // Destination is truly required
  if (missing.includes('destination') && !extracted.trip?.destination) {
    return null; // Let the main LLM handle this naturally
  }

  // Dates are important but we can assume
  if (missing.includes('dates') && !extracted.trip?.departure_date) {
    // We can make smart assumptions, so just note it
    return {
      canProceed: true,
      assumption: 'mid_month_week',
      note: 'Assuming mid-month for 1 week'
    };
  }

  return { canProceed: true };
}

/**
 * Normalize airline names to standard format
 */
function normalizeAirline(input) {
  const aliases = {
    'aa': 'American Airlines',
    'american': 'American Airlines',
    'ua': 'United Airlines',
    'united': 'United Airlines',
    'dl': 'Delta Air Lines',
    'delta': 'Delta Air Lines',
    'wn': 'Southwest Airlines',
    'southwest': 'Southwest Airlines',
    'b6': 'JetBlue Airways',
    'jetblue': 'JetBlue Airways',
    'as': 'Alaska Airlines',
    'alaska': 'Alaska Airlines',
    'nk': 'Spirit Airlines',
    'spirit': 'Spirit Airlines',
    'f9': 'Frontier Airlines',
    'frontier': 'Frontier Airlines',
    'air canada': 'Air Canada',
    'ac': 'Air Canada',
    'ba': 'British Airways',
    'british airways': 'British Airways'
  };

  const normalized = input.toLowerCase().trim();
  return aliases[normalized] || input;
}

/**
 * Normalize cabin class from various inputs
 */
function normalizeCabinClass(input) {
  if (!input) return null;

  const normalized = input.toLowerCase().trim();

  const mappings = {
    'economy': 'economy',
    'coach': 'economy',
    'basic': 'economy',
    'main cabin': 'economy',
    'premium': 'premium_economy',
    'premium economy': 'premium_economy',
    'extra legroom': 'premium_economy',
    'comfort plus': 'premium_economy',
    'business': 'business',
    'biz': 'business',
    'biz class': 'business',
    'j class': 'business',
    'first': 'first',
    'first class': 'first',
    'f class': 'first'
  };

  return mappings[normalized] || null;
}

/**
 * Extract preference updates that should be saved silently
 * These are things the user mentions that indicate lasting preferences
 */
function extractPreferenceUpdates(extracted) {
  const updates = {};

  // Cabin class mentioned = likely a preference
  if (extracted.flight_preferences?.cabin_class) {
    updates.preferredClass = extracted.flight_preferences.cabin_class;
  }

  // Loyalty programs should definitely be saved
  if (extracted.loyalty_programs && extracted.loyalty_programs.length > 0) {
    updates.loyaltyPrograms = extracted.loyalty_programs;
  }

  // Consistent airline preferences
  if (extracted.flight_preferences?.preferred_airlines) {
    updates.preferredAirlines = extracted.flight_preferences.preferred_airlines;
  }
  if (extracted.flight_preferences?.avoided_airlines) {
    updates.avoidedAirlines = extracted.flight_preferences.avoided_airlines;
  }

  return Object.keys(updates).length > 0 ? updates : null;
}

module.exports = {
  extractFromMessage,
  getGentleClarification,
  normalizeAirline,
  normalizeCabinClass,
  extractPreferenceUpdates
};
