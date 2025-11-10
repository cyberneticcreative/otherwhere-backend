const axios = require('axios');

// Support both old and new env variable names
const AVIASALES_TOKEN = process.env.AVIASALES_TOKEN || process.env.TRAVELPAYOUTS_TOKEN;
const AVIASALES_MARKER = process.env.AVIASALES_MARKER;

/**
 * Aviasales/TravelPayouts Flight Discovery Service
 *
 * ⚠️  DISCOVERY ONLY - DO NOT USE FOR DIRECT BOOKING
 *
 * This service uses the Aviasales API to discover flights for SMS/AI recommendations.
 * Results should NEVER link directly to affiliate URLs from the API.
 *
 * CORRECT FLOW:
 * 1. Use this service to search flights and show options to user
 * 2. When user wants to book, redirect to /go/flights with search params
 * 3. /go/flights routes through white-label (book.otherwhere.world) for attribution
 *
 * See: /routes/goFlights.js for the booking redirect handler
 */
class TravelPayoutsService {
  /**
   * Search for flights based on trip parameters
   * @param {Object} tripData - Trip search parameters
   * @returns {Promise<Object>} Flight search results
   */
  async searchFlights(tripData) {
    if (!AVIASALES_TOKEN || !AVIASALES_MARKER) {
      throw new Error('Aviasales credentials not configured');
    }

    try {
      const { destination, startDate, endDate, travelers, budget } = tripData;

      // Parse destination and origin
      const originCity = this.extractCityCode(tripData.origin || 'LAX');
      const destCity = this.extractCityCode(destination);

      console.log(`[Aviasales] 🔍 Searching flights: ${originCity} → ${destCity}`);
      console.log(`[Aviasales] 📅 Dates: ${startDate} to ${endDate || 'one-way'}`);
      console.log(`[Aviasales] 👥 Travelers: ${travelers || 1}`);

      // TravelPayouts API v2 - has more cached data than v3
      // Using latest prices endpoint which returns actual cached flight data
      const apiUrl = 'https://api.travelpayouts.com/v2/prices/latest';

      const params = {
        origin: originCity,
        destination: destCity,
        currency: budget?.currency || 'USD',
        token: AVIASALES_TOKEN,
        limit: 10 // Get more results to filter
      };

      const response = await axios.get(apiUrl, {
        params,
        timeout: 10000
      });

      console.log(`[Aviasales] ✅ Found ${response.data.data?.length || 0} flight options`);

      // Format the results - DO NOT include direct affiliate links
      const flights = this.formatFlightResults(response.data.data || [], tripData);

      return {
        success: true,
        flights,
        searchParams: {
          origin: originCity,
          destination: destCity,
          dates: `${startDate} - ${endDate || 'one-way'}`,
          travelers: travelers || 1
        }
      };

    } catch (error) {
      console.error('[Aviasales] API Error:', error.message);

      if (error.response) {
        console.error('[Aviasales] API Response:', error.response.data);
      }

      throw new Error(`Failed to search flights: ${error.message}`);
    }
  }

  /**
   * Extract IATA city code from city name
   * @param {string} cityName - City name or code
   * @returns {string} IATA code
   */
  extractCityCode(cityName) {
    // Common city mappings
    const cityMap = {
      'los angeles': 'LAX',
      'la': 'LAX',
      'new york': 'NYC',
      'nyc': 'NYC',
      'new york city': 'NYC',
      'paris': 'PAR',
      'london': 'LON',
      'tokyo': 'TYO',
      'san francisco': 'SFO',
      'chicago': 'CHI',
      'miami': 'MIA',
      'boston': 'BOS',
      'seattle': 'SEA',
      'las vegas': 'LAS',
      'orlando': 'ORL',
      'toronto': 'YTO',
      'vancouver': 'YVR',
      'montreal': 'YMQ'
    };

    const normalized = cityName.toLowerCase().trim();

    // Check if it's already a code (3 letters)
    if (/^[A-Z]{3}$/i.test(cityName)) {
      return cityName.toUpperCase();
    }

    // Look up in map
    return cityMap[normalized] || 'LAX'; // Default to LAX if not found
  }

  /**
   * Format flight results for user display
   * @param {Array} flights - Raw flight data from API
   * @param {Object} tripData - Original search parameters
   * @returns {Array} Formatted flight results
   */
  formatFlightResults(flights, tripData) {
    if (!flights || flights.length === 0) {
      return [];
    }

    // Sort by price (v2 API uses 'value' field)
    const sorted = flights.sort((a, b) => (a.value || 0) - (b.value || 0));

    return sorted.slice(0, 5).map((flight, index) => {
      const price = flight.value || flight.price || 0;
      const currency = (tripData.budget?.currency || 'USD').toUpperCase();

      return {
        rank: index + 1,
        price: `$${price} ${currency}`,
        priceValue: price,
        airline: flight.airline || 'Various',
        departure: flight.depart_date || tripData.startDate,
        returnDate: flight.return_date || tripData.endDate,
        duration: flight.duration || null,
        transfers: flight.number_of_changes || 0,
        // DO NOT include direct affiliate link - use buildGoFlightsURL() instead
        rawData: flight
      };
    });
  }

  /**
   * Build /go/flights URL for proper attribution
   * ⚠️  ALWAYS use this instead of direct affiliate links
   *
   * @param {Object} tripData - Search parameters
   * @param {string} sessionId - Session ID for tracking
   * @param {string} baseUrl - Base URL (defaults to production)
   * @returns {string} /go/flights URL
   */
  buildGoFlightsURL(tripData, sessionId = null, baseUrl = null) {
    const origin = this.extractCityCode(tripData.origin || 'LAX');
    const dest = this.extractCityCode(tripData.destination);

    const params = new URLSearchParams({
      o: origin,
      d: dest,
      dd: tripData.startDate,
      ad: (tripData.travelers || tripData.adults || 1).toString(),
      ch: (tripData.children || 0).toString(),
      in: (tripData.infants || 0).toString(),
      cls: tripData.travelClass?.charAt(0)?.toLowerCase() || 'e',
      cur: tripData.budget?.currency || 'USD',
      utm_source: 'sms'
    });

    // Add return date if provided
    if (tripData.endDate) {
      params.set('rd', tripData.endDate);
    }

    // Add session ID if provided
    if (sessionId) {
      params.set('sid', sessionId);
    }

    const base = baseUrl || process.env.BACKEND_WEBHOOK_URL || 'http://localhost:3000';
    return `${base}/go/flights?${params.toString()}`;
  }

  /**
   * Format flight results as SMS message
   * @param {Object} searchResults - Flight search results
   * @param {Object} tripData - Original trip data for building /go/flights URL
   * @param {string} sessionId - Session ID for tracking
   * @returns {string} Formatted SMS message
   */
  formatSMSMessage(searchResults, tripData, sessionId = null) {
    if (!searchResults.success || searchResults.flights.length === 0) {
      return "Sorry, I couldn't find any flights for your search. Try different dates or destinations!";
    }

    const { flights, searchParams } = searchResults;
    const topFlight = flights[0];

    let message = `✈️ Found ${flights.length} flights!\n\n`;
    message += `🏆 Best Deal: ${topFlight.price}\n`;
    message += `${searchParams.origin} → ${searchParams.destination}\n`;
    message += `${searchParams.dates}\n\n`;

    // List top 3 flights
    flights.slice(0, 3).forEach(flight => {
      message += `${flight.rank}. ${flight.price}`;
      if (flight.transfers > 0) {
        message += ` (${flight.transfers} stop${flight.transfers > 1 ? 's' : ''})`;
      }
      message += `\n`;
    });

    // Add /go/flights booking link (routes through white-label)
    const bookingUrl = this.buildGoFlightsURL(tripData, sessionId);
    message += `\n🔗 Book now: ${bookingUrl}`;
    message += `\n\n💡 Click the link to view all options!`;

    return message;
  }

  /**
   * Check if Aviasales is configured
   * @returns {boolean} True if configured
   */
  isConfigured() {
    return !!(AVIASALES_TOKEN && AVIASALES_MARKER);
  }
}

module.exports = new TravelPayoutsService();
