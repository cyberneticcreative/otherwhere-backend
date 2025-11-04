const axios = require('axios');
const dayjs = require('dayjs');

const RAPIDAPI_KEY = process.env.RAPIDAPI_KEY;
const RAPIDAPI_HOST = process.env.RAPIDAPI_HOST || 'google-flights2.p.rapidapi.com';
const BASE_URL = `https://${RAPIDAPI_HOST}/api/v1`;

/**
 * Google Flights API Service via RapidAPI
 * Provides flight search, airport lookup, and booking URL generation
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
   * @param {string} params.outboundDate - Departure date (YYYY-MM-DD)
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

    if (!outboundDate) {
      throw new Error('Outbound date is required');
    }

    // Validate date format
    if (!dayjs(outboundDate, 'YYYY-MM-DD', true).isValid()) {
      throw new Error('Invalid outbound date format. Use YYYY-MM-DD');
    }

    if (returnDate && !dayjs(returnDate, 'YYYY-MM-DD', true).isValid()) {
      throw new Error('Invalid return date format. Use YYYY-MM-DD');
    }

    try {
      console.log(`[GoogleFlights] Searching flights: ${departureId} → ${arrivalId} on ${outboundDate}`);

      const searchParams = {
        departure_id: departureId,
        arrival_id: arrivalId,
        outbound_date: outboundDate,
        travel_class: travelClass.toUpperCase(),
        adults,
        currency,
        language_code: languageCode,
        country_code: countryCode,
        search_type: searchType,
        show_hidden: 1
      };

      // Add optional parameters
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

      console.log(`[GoogleFlights] Found flights:`, data?.itineraries?.length || 0);

      return {
        success: true,
        searchParams: params,
        results: data,
        count: data?.itineraries?.length || 0
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

    const itineraries = searchResults.results.itineraries.slice(0, limit);

    return itineraries.map((itinerary, index) => {
      const legs = itinerary.legs || [];
      const outbound = legs[0] || {};
      const pricing = itinerary.pricing_options?.[0] || {};

      // Calculate duration
      const durationMinutes = outbound.duration_minutes || 0;
      const hours = Math.floor(durationMinutes / 60);
      const minutes = durationMinutes % 60;
      const duration = `${hours}h ${minutes}m`;

      // Get airline info
      const carriers = outbound.carriers || [];
      const airline = carriers.map(c => c.name).join(', ') || 'Unknown Airline';

      // Get stops
      const stops = (outbound.segments?.length || 1) - 1;
      const stopsText = stops === 0 ? 'Direct' : `${stops} stop${stops > 1 ? 's' : ''}`;

      return {
        index: index + 1,
        airline,
        price: pricing.price?.amount || 0,
        currency: pricing.price?.currency || 'USD',
        departure: outbound.departure_time,
        arrival: outbound.arrival_time,
        duration,
        stops,
        stopsText,
        bookingToken: pricing.token || itinerary.token,
        rawData: itinerary
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
      const departTime = dayjs(flight.departure).format('h:mm A');
      const arriveTime = dayjs(flight.arrival).format('h:mm A');

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
