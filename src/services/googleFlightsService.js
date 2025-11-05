const axios = require('axios');
const dayjs = require('dayjs');

const RAPIDAPI_KEY = process.env.RAPIDAPI_KEY;
const RAPIDAPI_HOST = process.env.RAPIDAPI_HOST || 'google-flights2.p.rapidapi.com';
const BASE_URL = `https://${RAPIDAPI_HOST}/api/v1`;

/**
 * Google Flights API Service via RapidAPI
 *
 * THIS IS THE PRIMARY FLIGHT SEARCH SERVICE
 * All flight searches currently use this API as it's the only one with active access.
 *
 * Provides:
 * - Airport code resolution (city names → IATA codes)
 * - Flight search (one-way and round-trip)
 * - Booking URL generation
 * - SMS-formatted results
 *
 * Note: TravelPayouts service exists but is inactive (waiting for API approval)
 */
class GoogleFlightsService {
  constructor() {
    this.defaultHeaders = {
      'x-rapidapi-host': RAPIDAPI_HOST,
      'x-rapidapi-key': RAPIDAPI_KEY
    };
  }

  /**
   * Search for airports by location name
   * Converts user input like "New York" or "LA" into airport codes
   *
   * @param {string} query - Location name (e.g., "New York", "Los Angeles")
   * @param {string} languageCode - Language code (default: en-US)
   * @param {string} countryCode - Country code (default: US)
   * @returns {Promise<Array>} Array of airport options with codes, names, and cities
   */
  async searchAirport(query, languageCode = 'en-US', countryCode = 'US') {
    if (!this.isConfigured()) {
      throw new Error('Google Flights API not configured - missing RAPIDAPI_KEY');
    }

    try {
      console.log(`[GoogleFlights] Searching airports for: ${query}`);

      const response = await axios.get(`${BASE_URL}/searchAirport`, {
        params: {
          query,
          language_code: languageCode,
          country_code: countryCode
        },
        headers: this.defaultHeaders,
        timeout: 10000
      });

      const airports = response.data?.data || [];

      console.log(`[GoogleFlights] Found ${airports.length} airports for "${query}"`);

      return airports.map(airport => ({
        code: airport.airport_id || airport.code,
        name: airport.airport_name || airport.name,
        city: airport.city || airport.city_name,
        country: airport.country || airport.country_name,
        displayName: `${airport.airport_name || airport.name} (${airport.airport_id || airport.code})`
      }));

    } catch (error) {
      console.error(`[GoogleFlights] Airport search error:`, error.message);

      if (error.response?.status === 429) {
        throw new Error('Flight search rate limit exceeded. Please try again in a few minutes.');
      }

      throw new Error(`Airport search failed: ${error.message}`);
    }
  }

  /**
   * Search for flights between two airports
   *
   * @param {Object} params - Search parameters
   * @param {string} params.departureId - Departure airport code (e.g., "LAX")
   * @param {string} params.arrivalId - Arrival airport code (e.g., "JFK")
   * @param {string} [params.outboundDate] - Departure date (YYYY-MM-DD), optional
   * @param {string} [params.returnDate] - Return date for round trips (YYYY-MM-DD)
   * @param {string} [params.travelClass] - ECONOMY, PREMIUM_ECONOMY, BUSINESS, FIRST
   * @param {number} [params.adults] - Number of adult passengers
   * @param {number} [params.children] - Number of children
   * @param {number} [params.infants] - Number of infants
   * @param {string} [params.currency] - Currency code (default: USD)
   * @param {string} [params.languageCode] - Language code (default: en-US)
   * @param {string} [params.countryCode] - Country code (default: US)
   * @param {string} [params.searchType] - "best" for sorted results
   * @returns {Promise<Object>} Flight search results
   */
  async searchFlights(params) {
    if (!this.isConfigured()) {
      throw new Error('Google Flights API not configured - missing RAPIDAPI_KEY');
    }

    const {
      departureId,
      arrivalId,
      outboundDate,
      returnDate,
      travelClass = 'ECONOMY',
      adults = 1,
      children = 0,
      infants = 0,
      currency = 'USD',
      languageCode = 'en-US',
      countryCode = 'US',
      searchType = 'best'
    } = params;

    // Validate required parameters
    if (!departureId || !arrivalId) {
      throw new Error('Departure and arrival airport codes are required');
    }

    // Validate date format if provided
    if (outboundDate && !dayjs(outboundDate, 'YYYY-MM-DD', true).isValid()) {
      throw new Error('Invalid outbound date format. Use YYYY-MM-DD');
    }

    if (returnDate && !dayjs(returnDate, 'YYYY-MM-DD', true).isValid()) {
      throw new Error('Invalid return date format. Use YYYY-MM-DD');
    }

    try {
      console.log(`[GoogleFlights] Searching flights: ${departureId} → ${arrivalId}${outboundDate ? ` on ${outboundDate}` : ''}`);

      const searchParams = {
        departure_id: departureId,
        arrival_id: arrivalId,
        travel_class: travelClass.toUpperCase(),
        adults,
        currency,
        language_code: languageCode,
        country_code: countryCode,
        search_type: searchType,
        show_hidden: 1
      };

      // Add optional parameters
      if (outboundDate) {
        searchParams.outbound_date = outboundDate;
      }
      if (returnDate) {
        searchParams.return_date = returnDate;
      }
      if (children > 0) {
        searchParams.children = children;
      }
      if (infants > 0) {
        searchParams.infants = infants;
      }

      const response = await axios.get(`${BASE_URL}/searchFlights`, {
        params: searchParams,
        headers: this.defaultHeaders,
        timeout: 15000
      });

      const data = response.data?.data || response.data;

      // Count total flights from both topFlights and otherFlights
      const topFlightsCount = data?.itineraries?.topFlights?.length || 0;
      const otherFlightsCount = data?.itineraries?.otherFlights?.length || 0;
      const totalCount = topFlightsCount + otherFlightsCount;

      console.log(`[GoogleFlights] Found ${totalCount} flights (${topFlightsCount} top, ${otherFlightsCount} other)`);

      return {
        success: true,
        searchParams: params,
        results: data,
        count: totalCount
      };

    } catch (error) {
      console.error(`[GoogleFlights] Flight search error:`, error.message);

      if (error.response?.status === 429) {
        throw new Error('Flight search rate limit exceeded. Please try again in a few minutes.');
      }

      if (error.response?.status === 400) {
        throw new Error('Invalid flight search parameters. Please check your dates and airport codes.');
      }

      throw new Error(`Flight search failed: ${error.message}`);
    }
  }

  /**
   * Get booking URL for a specific flight
   *
   * @param {string} token - Flight token from search results
   * @returns {Promise<Object>} Booking URL and details
   */
  async getBookingURL(token) {
    if (!this.isConfigured()) {
      throw new Error('Google Flights API not configured - missing RAPIDAPI_KEY');
    }

    if (!token) {
      throw new Error('Flight token is required to generate booking URL');
    }

    try {
      console.log(`[GoogleFlights] Getting booking URL for token: ${token.substring(0, 20)}...`);

      const response = await axios.get(`${BASE_URL}/getBookingURL`, {
        params: { token },
        headers: this.defaultHeaders,
        timeout: 10000
      });

      return {
        success: true,
        bookingUrl: response.data?.url || response.data?.booking_url,
        data: response.data
      };

    } catch (error) {
      console.error(`[GoogleFlights] Booking URL error:`, error.message);
      throw new Error(`Failed to get booking URL: ${error.message}`);
    }
  }

  /**
   * Get price graph/trends for a route
   *
   * @param {Object} params - Parameters
   * @param {string} params.departureId - Departure airport code
   * @param {string} params.arrivalId - Arrival airport code
   * @param {string} [params.travelClass] - Travel class
   * @param {number} [params.adults] - Number of adults
   * @param {string} [params.currency] - Currency code
   * @param {string} [params.countryCode] - Country code
   * @returns {Promise<Object>} Price trend data
   */
  async getPriceGraph(params) {
    if (!this.isConfigured()) {
      throw new Error('Google Flights API not configured - missing RAPIDAPI_KEY');
    }

    const {
      departureId,
      arrivalId,
      travelClass = 'ECONOMY',
      adults = 1,
      currency = 'USD',
      countryCode = 'US'
    } = params;

    try {
      console.log(`[GoogleFlights] Getting price graph: ${departureId} → ${arrivalId}`);

      const response = await axios.get(`${BASE_URL}/getPriceGraph`, {
        params: {
          departure_id: departureId,
          arrival_id: arrivalId,
          travel_class: travelClass.toUpperCase(),
          adults,
          currency,
          country_code: countryCode
        },
        headers: this.defaultHeaders,
        timeout: 10000
      });

      return {
        success: true,
        data: response.data
      };

    } catch (error) {
      console.error(`[GoogleFlights] Price graph error:`, error.message);
      throw new Error(`Failed to get price graph: ${error.message}`);
    }
  }

  /**
   * Get calendar picker data for flexible date searches
   *
   * @param {Object} params - Parameters
   * @param {string} params.departureId - Departure airport code
   * @param {string} params.arrivalId - Arrival airport code
   * @param {string} [params.tripType] - ONE_WAY or ROUND_TRIP
   * @param {string} [params.travelClass] - Travel class
   * @param {number} [params.adults] - Number of adults
   * @param {string} [params.currency] - Currency code
   * @param {string} [params.countryCode] - Country code
   * @returns {Promise<Object>} Calendar data with prices
   */
  async getCalendarPicker(params) {
    if (!this.isConfigured()) {
      throw new Error('Google Flights API not configured - missing RAPIDAPI_KEY');
    }

    const {
      departureId,
      arrivalId,
      tripType = 'ONE_WAY',
      travelClass = 'ECONOMY',
      adults = 1,
      currency = 'USD',
      countryCode = 'US'
    } = params;

    try {
      console.log(`[GoogleFlights] Getting calendar picker: ${departureId} → ${arrivalId}`);

      const response = await axios.get(`${BASE_URL}/getCalendarPicker`, {
        params: {
          departure_id: departureId,
          arrival_id: arrivalId,
          trip_type: tripType,
          travel_class: travelClass.toUpperCase(),
          adults,
          currency,
          country_code: countryCode
        },
        headers: this.defaultHeaders,
        timeout: 10000
      });

      return {
        success: true,
        data: response.data
      };

    } catch (error) {
      console.error(`[GoogleFlights] Calendar picker error:`, error.message);
      throw new Error(`Failed to get calendar picker: ${error.message}`);
    }
  }

  /**
   * Format flight results for SMS display (top N results)
   *
   * @param {Object} searchResults - Results from searchFlights()
   * @param {number} limit - Number of results to return (default: 3)
   * @returns {Array} Formatted flight options
   */
  formatFlightResults(searchResults, limit = 3) {
    if (!searchResults?.results?.itineraries) {
      return [];
    }

    // Combine topFlights and otherFlights, prioritizing topFlights
    const topFlights = searchResults.results.itineraries.topFlights || [];
    const otherFlights = searchResults.results.itineraries.otherFlights || [];
    const allFlights = [...topFlights, ...otherFlights];

    // Get only the requested number of flights
    const flightsToFormat = allFlights.slice(0, limit);

    return flightsToFormat.map((flight, index) => {
      // Get first flight segment to extract airline info
      const firstSegment = flight.flights?.[0] || {};
      const airline = firstSegment.airline || 'Unknown Airline';

      // Parse duration
      const durationText = flight.duration?.text || '';

      // Get number of stops
      const stops = flight.stops || 0;
      const stopsText = stops === 0 ? 'Direct' : `${stops} stop${stops > 1 ? 's' : ''}`;

      return {
        index: index + 1,
        airline,
        price: flight.price || 0,
        currency: 'USD', // API returns price in USD
        departure: flight.departure_time || '',
        arrival: flight.arrival_time || '',
        duration: durationText,
        durationMinutes: flight.duration?.raw || 0,
        stops,
        stopsText,
        bookingToken: flight.next_token || '',
        airlineLogo: flight.airline_logo || '',
        carbonEmissions: flight.carbon_emissions,
        layovers: flight.layovers || null,
        bags: flight.bags || { carry_on: 0, checked: 0 },
        rawData: flight
      };
    });
  }

  /**
   * Format flight results as SMS message
   *
   * @param {Array} formattedFlights - Flights from formatFlightResults()
   * @param {Object} searchInfo - Original search parameters
   * @returns {string} SMS-formatted message
   */
  formatSMSMessage(formattedFlights, searchInfo = {}) {
    if (!formattedFlights || formattedFlights.length === 0) {
      return 'Sorry, no flights found for your search. Try different dates or airports.';
    }

    const { departureId, arrivalId, outboundDate } = searchInfo;
    const header = `✈️ Flights ${departureId} → ${arrivalId} (${outboundDate})\n\n`;

    const flightsList = formattedFlights.map(flight => {
      // Parse time from format "26-11-2025 08:53 PM" to just "8:53 AM"
      const parseTime = (timeStr) => {
        if (!timeStr) return '';
        const parts = timeStr.split(' ');
        if (parts.length >= 3) {
          return `${parts[1]} ${parts[2]}`; // Returns "08:53 PM"
        }
        return timeStr;
      };

      const departTime = parseTime(flight.departure);
      const arriveTime = parseTime(flight.arrival);

      return `${flight.index}. ${flight.airline}
$${flight.price} • ${departTime} - ${arriveTime}
${flight.duration} • ${flight.stopsText}`;
    }).join('\n\n');

    return header + flightsList + '\n\nReply with a number to get booking link.';
  }

  /**
   * Check if service is properly configured
   *
   * @returns {boolean} True if API key is set
   */
  isConfigured() {
    return !!RAPIDAPI_KEY;
  }
}

// Export as singleton instance
module.exports = new GoogleFlightsService();
