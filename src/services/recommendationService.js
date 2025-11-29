/**
 * Recommendation Service
 *
 * Generates personalized travel destination recommendations based on user preferences.
 * Designed to feel like talking to a well-traveled friend who reads Condé Nast Traveler.
 *
 * Tone: Editorial, specific, alive with detail. No "hidden gems" or "something for everyone."
 */

const OpenAI = require('openai');

// Lazy initialization of OpenAI client to allow tests to run without API key
let openai = null;
function getOpenAI() {
  if (!openai) {
    openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY
    });
  }
  return openai;
}

// Recommendation flow states
const RECO_STATES = {
  IDLE: 'idle',
  ASKING_VIBE: 'asking_vibe',
  ASKING_WHEN: 'asking_when',
  ASKING_BUDGET: 'asking_budget',
  ASKING_WHO: 'asking_who',
  GENERATING: 'generating',
  AWAITING_SELECTION: 'awaiting_selection',
  REROLLING: 'rerolling'
};

// Trigger phrases that enter recommendation mode
const RECO_TRIGGERS = [
  /i don'?t know where to go/i,
  /don'?t know where/i,
  /give me (some )?ideas/i,
  /give me recos/i,
  /give me recommendations/i,
  /surprise me/i,
  /where should i (go|travel)/i,
  /what'?s good right now/i,
  /help me (decide|choose|pick)/i,
  /not sure where/i,
  /need inspiration/i,
  /any suggestions/i,
  /suggest somewhere/i,
  /recommend (a place|somewhere|a destination)/i
];

// Patterns for detecting dates/budget without destination (partial booking data)
const HAS_DATES_NO_DEST = /\b(next\s+\w+|in\s+\w+|this\s+\w+|\d{1,2}\/\d{1,2}|\w+\s+\d{1,2})/i;
const HAS_BUDGET_NO_DEST = /\b(budget|spend|around\s+\$|\$\d+|cheap|expensive|luxury|affordable)/i;

// Vibe categories with descriptors for LLM
const VIBE_CATEGORIES = {
  beach: {
    name: 'beach and slow days',
    descriptors: ['relaxing', 'coastal', 'tropical', 'laid-back', 'resort', 'water activities'],
    examples: ['Tulum', 'Bali', 'Algarve', 'Zanzibar', 'Turks and Caicos']
  },
  city: {
    name: 'city buzz and culture',
    descriptors: ['urban', 'museums', 'nightlife', 'food scene', 'architecture', 'shopping'],
    examples: ['Tokyo', 'Mexico City', 'Lisbon', 'Buenos Aires', 'Seoul']
  },
  adventure: {
    name: 'adventure and big landscapes',
    descriptors: ['outdoors', 'hiking', 'nature', 'wildlife', 'remote', 'active'],
    examples: ['Patagonia', 'New Zealand', 'Iceland', 'Tasmania', 'Norwegian Fjords']
  },
  culture: {
    name: 'deep culture and history',
    descriptors: ['ancient', 'traditional', 'authentic', 'local life', 'heritage'],
    examples: ['Oaxaca', 'Kyoto', 'Morocco', 'Peru', 'Jordan']
  },
  mixed: {
    name: 'a bit of everything',
    descriptors: ['versatile', 'diverse', 'balanced'],
    examples: ['Portugal', 'Colombia', 'Vietnam', 'Greece']
  }
};

// Budget categories
const BUDGET_CATEGORIES = {
  budget: {
    name: 'making it work on a budget',
    descriptors: ['affordable', 'value', 'cheap eats', 'hostels'],
    dailyRange: '$50-100/day'
  },
  moderate: {
    name: 'comfortable middle',
    descriptors: ['mid-range', 'good value', 'nice hotels', 'good restaurants'],
    dailyRange: '$150-300/day'
  },
  luxury: {
    name: 'going all-out',
    descriptors: ['luxury', 'five-star', 'fine dining', 'premium experiences'],
    dailyRange: '$400+/day'
  }
};

// Travel companion categories
const COMPANION_CATEGORIES = {
  solo: 'solo trip',
  romantic: 'romantic getaway',
  friends: 'rolling with friends',
  family: 'family trip'
};

// System prompt for generating recommendations
const RECO_SYSTEM_PROMPT = `You are a well-traveled friend who reads Condé Nast Traveler. You're helping someone decide where to go next.

## YOUR VOICE
- Editorial, specific, alive with detail
- Sound like you've actually been there
- Use sensory language (smells, light, texture, rhythm)
- Show cultural momentum ("finally getting attention," "having a moment")

## WHAT TO AVOID
- "Hidden gem" / "off the beaten path" / "something for everyone"
- "Rich history and culture" / "popular destination"
- Anything that sounds like a brochure
- Generic descriptions

## RECOMMENDATION FORMAT
Each recommendation must be under 35 words total. Structure:
1. Destination + hook (one punchy sentence)
2. One vivid detail that proves insider knowledge
3. Vibe callback (reference what they asked for)

## EXAMPLES OF GREAT RECOMMENDATIONS

"Medellín, Colombia — City energy with mountain drama. Terrace bars in Provenza, cable cars over Comuna 13, a food scene finally getting global attention. You wanted city with landscapes — this doesn't stop after dark."

"Oaxaca, Mexico — Culture without the crowds. Mezcal in candlelit courtyards, markets that smell like mole and woodsmoke, art everywhere. Slow days, deep flavor — exactly what you asked for."

"Tasmania, Australia — Wild and uncrowded. Ancient rainforests, empty coastline, MONA if you want your brain rewired. You said adventure and landscapes — this is the quiet, weird, beautiful version."

"Lisbon, Portugal — Old city, new energy. Tiled streets, natural wine bars in crumbling buildings, light that photographers lose their minds over. Comfortable budget, real culture — checks both."

## IMPORTANT
- Be specific: real neighborhoods, restaurants, details
- Connect to what they said they wanted (vibe, budget, who they're with)
- Make it feel current (what's happening there NOW)
- Each recommendation should feel distinct, not variations on a theme`;

class RecommendationService {
  /**
   * Check if a message triggers recommendation mode
   * @param {string} message - User message
   * @param {Object} session - Current session
   * @returns {boolean} True if should enter reco mode
   */
  shouldEnterRecoMode(message, session) {
    // Don't enter if already in an active booking flow with destination
    if (session.tripDetails?.destination || session.context?.lastFlightSearch?.destination) {
      return false;
    }

    // Check explicit triggers
    const hasExplicitTrigger = RECO_TRIGGERS.some(pattern => pattern.test(message));
    if (hasExplicitTrigger) {
      return true;
    }

    // Check for dates/budget without destination (implicit trigger)
    const hasDatesBudget = HAS_DATES_NO_DEST.test(message) || HAS_BUDGET_NO_DEST.test(message);
    const messageLower = message.toLowerCase();
    const hasNoDestination = !this.extractDestinationHint(message);

    // If they mention travel dates or budget but no destination, could be reco mode
    // But be conservative - only trigger if it feels like discovery
    if (hasDatesBudget && hasNoDestination) {
      const travelWords = ['trip', 'travel', 'vacation', 'getaway', 'go somewhere', 'escape'];
      const hasTravelIntent = travelWords.some(word => messageLower.includes(word));
      return hasTravelIntent;
    }

    return false;
  }

  /**
   * Try to extract a destination hint from message (to avoid false triggers)
   * @param {string} message - User message
   * @returns {string|null} Destination hint or null
   */
  extractDestinationHint(message) {
    // Common destination patterns
    const destPatterns = [
      /\bto\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)\b/,  // "to Paris", "to New York"
      /\b(Paris|London|Tokyo|NYC|LA|Miami|Barcelona|Rome|Bali|Thailand|Mexico|Japan|Italy|France|Spain)\b/i
    ];

    for (const pattern of destPatterns) {
      const match = message.match(pattern);
      if (match) return match[1];
    }
    return null;
  }

  /**
   * Get the initial recommendation mode prompt
   * @returns {string} First question to ask
   */
  getVibeQuestion() {
    return "What are you in the mood for — beach and slow days, city buzz and culture, or adventure and big landscapes?";
  }

  /**
   * Get the when question
   * @returns {string}
   */
  getWhenQuestion() {
    return "When are you thinking? And is that flexible or locked in?";
  }

  /**
   * Get the budget question
   * @returns {string}
   */
  getBudgetQuestion() {
    return "Are we going all-out, comfortable middle, or making it work on a budget?";
  }

  /**
   * Get the who question
   * @returns {string}
   */
  getWhoQuestion() {
    return "Solo trip, romantic getaway, or rolling with friends?";
  }

  /**
   * Parse vibe from user response
   * @param {string} message - User message
   * @returns {Object} Parsed vibe data
   */
  parseVibeResponse(message) {
    const lower = message.toLowerCase();

    if (/beach|slow|relax|chill|ocean|coast|water|swim|sun|tropical/i.test(lower)) {
      return { category: 'beach', raw: message };
    }
    if (/city|urban|culture|museum|food|restaurant|nightlife|bar|shop/i.test(lower)) {
      return { category: 'city', raw: message };
    }
    if (/adventure|hik|mountain|nature|outdoor|wild|landscape|active|trek/i.test(lower)) {
      return { category: 'adventure', raw: message };
    }
    if (/history|ancient|traditional|local|authentic|heritage/i.test(lower)) {
      return { category: 'culture', raw: message };
    }
    if (/mix|both|everything|all|variety|diverse/i.test(lower)) {
      return { category: 'mixed', raw: message };
    }

    // Default to mixed if unclear
    return { category: 'mixed', raw: message };
  }

  /**
   * Parse when from user response
   * @param {string} message - User message
   * @returns {Object} Parsed timing data
   */
  parseWhenResponse(message) {
    const lower = message.toLowerCase();

    // Month detection
    const months = ['january', 'february', 'march', 'april', 'may', 'june',
                    'july', 'august', 'september', 'october', 'november', 'december'];
    const monthMatch = months.find(m => lower.includes(m) || lower.includes(m.slice(0, 3)));

    // Relative timing
    let timing = null;
    if (/next week|this week/i.test(lower)) timing = 'immediate';
    else if (/next month|soon/i.test(lower)) timing = 'soon';
    else if (/summer/i.test(lower)) timing = 'summer';
    else if (/fall|autumn/i.test(lower)) timing = 'fall';
    else if (/winter|holidays|christmas|new year/i.test(lower)) timing = 'winter';
    else if (/spring/i.test(lower)) timing = 'spring';

    // Flexibility
    const flexible = /flexible|open|whenever|doesn'?t matter|anytime/i.test(lower);
    const locked = /locked|set|have to|must be|booked|can'?t change/i.test(lower);

    return {
      month: monthMatch,
      timing,
      flexible: flexible ? true : (locked ? false : null),
      raw: message
    };
  }

  /**
   * Parse budget from user response
   * @param {string} message - User message
   * @returns {Object} Parsed budget data
   */
  parseBudgetResponse(message) {
    const lower = message.toLowerCase();

    if (/all[- ]?out|luxury|splurge|money.*(no|not).*(object|issue)|fancy|five[- ]?star|premium/i.test(lower)) {
      return { category: 'luxury', raw: message };
    }
    if (/budget|cheap|save|tight|limit|afford|economical|backpack/i.test(lower)) {
      return { category: 'budget', raw: message };
    }
    if (/middle|moderate|comfortable|reasonable|not too|decent|mid/i.test(lower)) {
      return { category: 'moderate', raw: message };
    }

    // Try to extract dollar amount
    const dollarMatch = message.match(/\$(\d+)/);
    if (dollarMatch) {
      const amount = parseInt(dollarMatch[1]);
      if (amount < 100) return { category: 'budget', amount, raw: message };
      if (amount < 300) return { category: 'moderate', amount, raw: message };
      return { category: 'luxury', amount, raw: message };
    }

    return { category: 'moderate', raw: message }; // Default
  }

  /**
   * Parse who from user response
   * @param {string} message - User message
   * @returns {Object} Parsed companion data
   */
  parseWhoResponse(message) {
    const lower = message.toLowerCase();

    if (/solo|alone|myself|just me|by myself/i.test(lower)) {
      return { category: 'solo', count: 1, raw: message };
    }
    if (/romantic|partner|wife|husband|boyfriend|girlfriend|honeymoon|anniversary|couple|two of us/i.test(lower)) {
      return { category: 'romantic', count: 2, raw: message };
    }
    if (/friend|group|crew|squad|bunch/i.test(lower)) {
      // Try to extract count
      const countMatch = message.match(/(\d+)/);
      const count = countMatch ? parseInt(countMatch[1]) : 4;
      return { category: 'friends', count, raw: message };
    }
    if (/family|kids|children|parents/i.test(lower)) {
      const countMatch = message.match(/(\d+)/);
      const count = countMatch ? parseInt(countMatch[1]) : 4;
      return { category: 'family', count, raw: message };
    }

    return { category: 'solo', count: 1, raw: message }; // Default
  }

  /**
   * Generate 3 destination recommendations based on preferences
   * @param {Object} preferences - Collected user preferences
   * @returns {Promise<Object>} Recommendations and follow-up
   */
  async generateRecommendations(preferences) {
    const { vibe, when, budget, who } = preferences;

    // Build context for LLM
    const vibeInfo = VIBE_CATEGORIES[vibe?.category] || VIBE_CATEGORIES.mixed;
    const budgetInfo = BUDGET_CATEGORIES[budget?.category] || BUDGET_CATEGORIES.moderate;
    const companionInfo = COMPANION_CATEGORIES[who?.category] || 'solo trip';

    const prompt = `Generate exactly 3 travel destination recommendations based on these preferences:

VIBE: ${vibeInfo.name}
User said: "${vibe?.raw || 'not specified'}"

TIMING: ${when?.timing || when?.month || 'flexible'}
User said: "${when?.raw || 'not specified'}"
${when?.flexible ? 'They are flexible on dates.' : when?.flexible === false ? 'Dates are locked in.' : ''}

BUDGET: ${budgetInfo.name} (${budgetInfo.dailyRange})
User said: "${budget?.raw || 'not specified'}"

TRAVELING: ${companionInfo}
User said: "${who?.raw || 'not specified'}"

Generate 3 diverse recommendations. Each MUST be under 35 words.
Format each as: "Destination — Hook sentence. Vivid detail. Vibe callback."

Return as JSON:
{
  "recommendations": [
    {
      "destination": "City, Country",
      "pitch": "The full recommendation text under 35 words"
    }
  ]
}`;

    try {
      const completion = await getOpenAI().chat.completions.create({
        model: process.env.OPENAI_MODEL || 'gpt-4-turbo-preview',
        messages: [
          { role: 'system', content: RECO_SYSTEM_PROMPT },
          { role: 'user', content: prompt }
        ],
        response_format: { type: 'json_object' },
        max_completion_tokens: 800,
        temperature: 0.9 // Higher creativity for recommendations
      });

      const result = JSON.parse(completion.choices[0].message.content);
      return {
        success: true,
        recommendations: result.recommendations || [],
        preferences
      };
    } catch (error) {
      console.error('Failed to generate recommendations:', error);

      // Fallback recommendations
      return {
        success: false,
        recommendations: this.getFallbackRecommendations(vibe?.category, budget?.category),
        preferences,
        error: error.message
      };
    }
  }

  /**
   * Get fallback recommendations if LLM fails
   * @param {string} vibeCategory
   * @param {string} budgetCategory
   * @returns {Array}
   */
  getFallbackRecommendations(vibeCategory = 'mixed', budgetCategory = 'moderate') {
    const fallbacks = {
      beach: [
        { destination: 'Tulum, Mexico', pitch: 'Tulum — Where the jungle meets the Caribbean. Cenote swims, beach clubs with actual taste, Mayan ruins at sunrise. You wanted slow days — this delivers, with an edge.' },
        { destination: 'Algarve, Portugal', pitch: 'Algarve — Europe\'s best-kept coastline. Golden cliffs, empty coves, grilled fish with local wine. Beach life without the crowds or the price tag.' },
        { destination: 'Zanzibar, Tanzania', pitch: 'Zanzibar — Spice island energy. Stone Town\'s winding alleys, dhow sails at sunset, some of the Indian Ocean\'s clearest water. Remote but reachable.' }
      ],
      city: [
        { destination: 'Mexico City, Mexico', pitch: 'Mexico City — Massive, chaotic, endlessly rewarding. World-class museums, mezcal bars in Roma Norte, tacos that ruin you for anywhere else. Culture that doesn\'t quit.' },
        { destination: 'Lisbon, Portugal', pitch: 'Lisbon — Old city, new energy. Tiled streets, natural wine bars in crumbling buildings, light that photographers lose their minds over. Comfortable and cultured.' },
        { destination: 'Seoul, South Korea', pitch: 'Seoul — Future and tradition in one frame. Street food markets, palace courtyards, K-culture everything. A city that\'s always five minutes ahead.' }
      ],
      adventure: [
        { destination: 'Patagonia, Chile', pitch: 'Patagonia — The end of the world, and worth every mile. Glaciers cracking into lakes, condors overhead, hiking that makes you earn the views.' },
        { destination: 'Iceland', pitch: 'Iceland — Otherworldly and accessible. Volcanic beaches, northern lights, hot springs in the middle of nowhere. Adventure without roughing it.' },
        { destination: 'New Zealand', pitch: 'New Zealand — Every landscape in one country. Fjords, volcanoes, glaciers, empty beaches. Two weeks won\'t be enough, but it\'s a start.' }
      ],
      mixed: [
        { destination: 'Portugal', pitch: 'Portugal — Europe\'s best value, still. Lisbon\'s energy, Porto\'s wine cellars, southern beaches, central castles. Does everything well, costs less than it should.' },
        { destination: 'Colombia', pitch: 'Colombia — Finally having its moment. Cartagena\'s colors, Medellín\'s reinvention, coffee country calm. More diverse than you expect, safer than you\'ve heard.' },
        { destination: 'Vietnam', pitch: 'Vietnam — The full spectrum. Hanoi\'s chaos, Ha Long Bay\'s drama, Hoi An\'s charm, Saigon\'s energy. A month wouldn\'t cover it all.' }
      ]
    };

    return fallbacks[vibeCategory] || fallbacks.mixed;
  }

  /**
   * Format recommendations for SMS/voice (no bullets, no bold)
   * @param {Array} recommendations
   * @returns {string}
   */
  formatRecommendationsForChannel(recommendations) {
    if (!recommendations || recommendations.length === 0) {
      return "I'm having trouble coming up with ideas right now. Tell me more about what you're looking for?";
    }

    let message = '';
    recommendations.forEach((reco, idx) => {
      message += `${idx + 1}. ${reco.pitch}\n\n`;
    });

    message += "Any of these calling to you?";
    return message.trim();
  }

  /**
   * Handle user selection from recommendations
   * @param {string} message - User's response
   * @param {Array} recommendations - The 3 recommendations shown
   * @returns {Object} Selection result
   */
  parseSelection(message, recommendations) {
    const lower = message.toLowerCase();

    // Check for number selection
    const numberMatch = message.match(/^([123])$/);
    if (numberMatch && recommendations[parseInt(numberMatch[1]) - 1]) {
      const selected = recommendations[parseInt(numberMatch[1]) - 1];
      return {
        selected: true,
        destination: selected.destination,
        index: parseInt(numberMatch[1]) - 1
      };
    }

    // Check for destination name mention
    for (let i = 0; i < recommendations.length; i++) {
      const destLower = recommendations[i].destination.toLowerCase();
      const destParts = destLower.split(',')[0]; // Just the city
      if (lower.includes(destParts)) {
        return {
          selected: true,
          destination: recommendations[i].destination,
          index: i
        };
      }
    }

    // Check for rejection/reroll
    if (/no|none|nah|different|other|more options|try again|something else/i.test(lower)) {
      return { selected: false, reroll: true };
    }

    // Check for positive sentiment without clear selection
    if (/maybe|interesting|hmm|could be|sounds good|like/i.test(lower)) {
      return { selected: false, needsClarification: true };
    }

    return { selected: false, unclear: true };
  }

  /**
   * Get reroll prompt
   * @returns {string}
   */
  getRerollPrompt() {
    return "No problem — tell me more about what you're after and I'll try again.";
  }

  /**
   * Get clarification prompt when selection is unclear
   * @returns {string}
   */
  getClarificationPrompt() {
    return "Which one's catching your eye? Just reply with the number (1, 2, or 3).";
  }

  /**
   * Get transition message after selection
   * @param {string} destination
   * @returns {string}
   */
  getSelectionConfirmation(destination) {
    const city = destination.split(',')[0];
    return `${city} it is! Let's make it happen. When are you thinking of going?`;
  }
}

// Export singleton and constants
module.exports = new RecommendationService();
module.exports.RECO_STATES = RECO_STATES;
module.exports.RECO_TRIGGERS = RECO_TRIGGERS;
