const { parseVagueDate, getDefaultDateRange } = require('../utils/dateParser');

/**
 * Smart Defaults Service
 *
 * Fills in missing parameters for trip searches with intelligent defaults
 * Allows for frictionless "I want to go to Austin in March" experiences
 */

// Area code to airport mapping (most common origins)
const AREA_CODE_TO_AIRPORT = {
  // Toronto
  '416': 'YYZ',
  '647': 'YYZ',
  '437': 'YYZ',
  '905': 'YYZ',

  // New York
  '212': 'JFK',
  '646': 'JFK',
  '917': 'JFK',
  '718': 'JFK',
  '347': 'JFK',
  '929': 'JFK',

  // Los Angeles
  '213': 'LAX',
  '310': 'LAX',
  '424': 'LAX',
  '323': 'LAX',
  '818': 'LAX',

  // Chicago
  '312': 'ORD',
  '773': 'ORD',
  '872': 'ORD',

  // San Francisco
  '415': 'SFO',
  '628': 'SFO',

  // Boston
  '617': 'BOS',
  '857': 'BOS',

  // Seattle
  '206': 'SEA',
  '425': 'SEA',

  // Miami
  '305': 'MIA',
  '786': 'MIA',

  // Dallas
  '214': 'DFW',
  '469': 'DFW',
  '972': 'DFW',

  // Houston
  '713': 'IAH',
  '281': 'IAH',
  '832': 'IAH',

  // Atlanta
  '404': 'ATL',
  '470': 'ATL',
  '678': 'ATL',
  '770': 'ATL',

  // Denver
  '303': 'DEN',
  '720': 'DEN',

  // Phoenix
  '602': 'PHX',
  '623': 'PHX',
  '480': 'PHX',

  // Philadelphia
  '215': 'PHL',
  '267': 'PHL',

  // San Diego
  '619': 'SAN',
  '858': 'SAN',

  // Las Vegas
  '702': 'LAS',

  // Portland
  '503': 'PDX',
  '971': 'PDX',

  // Vancouver
  '604': 'YVR',
  '778': 'YVR',

  // Montreal
  '514': 'YUL',
  '438': 'YUL',

  // Calgary
  '403': 'YYC',
  '587': 'YYC',

  // Ottawa
  '613': 'YOW',
  '343': 'YOW'
};

class SmartDefaultsService {
  /**
   * Infer origin airport from phone number
   * @param {string} phoneNumber - Phone number in format +1XXXXXXXXXX
   * @param {Object} session - User session (may have lastFlightSearch)
   * @returns {string|null} Airport code or null if can't infer
   */
  inferOrigin(phoneNumber, session = {}) {
    // First, check if user has a previous flight search
    if (session.lastFlightSearch?.origin) {
      console.log(`[SmartDefaults] Using previous origin: ${session.lastFlightSearch.origin}`);
      return session.lastFlightSearch.origin;
    }

    // Try to infer from phone number area code
    if (phoneNumber && typeof phoneNumber === 'string') {
      // Extract area code from phone number (assuming +1XXXXXXXXXX format)
      const areaCodeMatch = phoneNumber.match(/\+1(\d{3})/);

      if (areaCodeMatch) {
        const areaCode = areaCodeMatch[1];
        const airport = AREA_CODE_TO_AIRPORT[areaCode];

        if (airport) {
          console.log(`[SmartDefaults] Inferred origin ${airport} from area code ${areaCode}`);
          return airport;
        } else {
          console.log(`[SmartDefaults] Unknown area code: ${areaCode}`);
        }
      }
    }

    // No origin could be inferred
    console.log(`[SmartDefaults] Could not infer origin from phone: ${phoneNumber}`);
    return null;
  }

  /**
   * Infer number of travelers from message content
   * @param {string} message - User message
   * @returns {number} Number of travelers
   */
  inferTravelers(message) {
    if (!message) return 1;

    const lowerMessage = message.toLowerCase();

    // Explicit numbers: "2 people", "3 travelers", "4 guests"
    const numberMatch = lowerMessage.match(/(\d+)\s*(people|travelers?|guests?|adults?|persons?)/);
    if (numberMatch) {
      const count = parseInt(numberMatch[1]);
      console.log(`[SmartDefaults] Found explicit traveler count: ${count}`);
      return count;
    }

    // Pronouns: "we", "us"
    if (lowerMessage.includes(' we ') || lowerMessage.includes(' us ') || lowerMessage.startsWith('we ')) {
      console.log(`[SmartDefaults] Inferred 2 travelers from pronoun`);
      return 2;
    }

    // Family keywords
    if (lowerMessage.includes('family')) {
      console.log(`[SmartDefaults] Inferred 4 travelers from 'family'`);
      return 4;
    }

    // Couple keywords
    if (lowerMessage.includes('couple') || lowerMessage.includes('partner') || lowerMessage.includes('wife') || lowerMessage.includes('husband')) {
      console.log(`[SmartDefaults] Inferred 2 travelers from couple keywords`);
      return 2;
    }

    // Default: solo traveler
    console.log(`[SmartDefaults] Defaulting to 1 traveler`);
    return 1;
  }

  /**
   * Parse dates from message
   * @param {string} message - User message
   * @returns {Object|null} {checkIn, checkOut, confidence, matched} or null
   */
  parseDates(message) {
    if (!message) return null;

    const parsedDate = parseVagueDate(message);

    if (parsedDate) {
      console.log(`[SmartDefaults] Parsed dates: ${parsedDate.checkIn} to ${parsedDate.checkOut} (${parsedDate.matched})`);
      return parsedDate;
    }

    console.log(`[SmartDefaults] Could not parse dates from message`);
    return null;
  }

  /**
   * Infer search type (flights, accommodations, or both)
   * @param {string} message - User message
   * @returns {string} 'flights' | 'accommodations' | 'both'
   */
  inferSearchType(message) {
    if (!message) return 'both';

    const lowerMessage = message.toLowerCase();

    // Explicit flight-only indicators
    if (lowerMessage.includes('flight') && !lowerMessage.includes('hotel') && !lowerMessage.includes('stay') && !lowerMessage.includes('accommodation')) {
      console.log(`[SmartDefaults] Detected flights-only request`);
      return 'flights';
    }

    // Explicit accommodation-only indicators
    if ((lowerMessage.includes('hotel') || lowerMessage.includes('stay') || lowerMessage.includes('accommodation') || lowerMessage.includes('place to stay') || lowerMessage.includes('airbnb'))
        && !lowerMessage.includes('flight')) {
      console.log(`[SmartDefaults] Detected accommodations-only request`);
      return 'accommodations';
    }

    // Default to both if it's a general "trip" request
    if (lowerMessage.includes('trip') || lowerMessage.includes('vacation') || lowerMessage.includes('visit') || lowerMessage.includes('go to')) {
      console.log(`[SmartDefaults] Detected full trip request (both flights + accommodations)`);
      return 'both';
    }

    // If unclear, default to 'both' for best user experience
    console.log(`[SmartDefaults] Defaulting to both (flights + accommodations)`);
    return 'both';
  }

  /**
   * Fill missing parameters with smart defaults
   * @param {Object} params - Partial trip parameters
   * @param {Object} context - Context (phoneNumber, session, message)
   * @returns {Object} Complete trip parameters with assumptions array
   */
  fillMissingParams(params, context = {}) {
    const { phoneNumber, session, message } = context;
    const filled = { ...params };
    const assumptions = [];

    // Fill destination (required - can't assume)
    // This should always be provided by the user

    // Fill dates
    if (!filled.checkIn || !filled.checkOut) {
      const parsedDates = message ? this.parseDates(message) : null;

      if (parsedDates) {
        filled.checkIn = parsedDates.checkIn;
        filled.checkOut = parsedDates.checkOut;
        assumptions.push(`Dates: ${parsedDates.matched}`);
      } else {
        // Use default: 30 days out, 7 day trip
        const defaultDates = getDefaultDateRange();
        filled.checkIn = defaultDates.checkIn;
        filled.checkOut = defaultDates.checkOut;
        assumptions.push(`Dates: ${defaultDates.matched} for 7 nights`);
      }
    }

    // Fill origin (for flights)
    if (!filled.origin) {
      const inferredOrigin = this.inferOrigin(phoneNumber, session);
      if (inferredOrigin) {
        filled.origin = inferredOrigin;
        assumptions.push(`Origin: ${inferredOrigin}`);
      }
      // If still no origin, we'll need to ask - this is critical for flights
    }

    // Fill travelers
    if (!filled.travelers && !filled.guests) {
      const inferredTravelers = message ? this.inferTravelers(message) : 1;
      filled.travelers = inferredTravelers;
      filled.guests = inferredTravelers;

      if (inferredTravelers === 1) {
        assumptions.push(`1 traveler`);
      } else {
        assumptions.push(`${inferredTravelers} travelers`);
      }
    }

    // Fill search type
    if (!filled.searchType) {
      const inferredType = message ? this.inferSearchType(message) : 'both';
      filled.searchType = inferredType;
    }

    return {
      ...filled,
      assumptions
    };
  }

  /**
   * Format assumptions for display to user
   * @param {Array} assumptions - Array of assumption strings
   * @returns {string} Formatted string for user
   */
  formatAssumptions(assumptions) {
    if (!assumptions || assumptions.length === 0) {
      return '';
    }

    return `\n\n💡 I assumed: ${assumptions.join(', ')}`;
  }
}

module.exports = new SmartDefaultsService();
