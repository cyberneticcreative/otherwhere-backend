const axios = require('axios');
const crypto = require('crypto');

// Support both old and new env variable names
const AVIASALES_TOKEN = process.env.AVIASALES_TOKEN || process.env.TRAVELPAYOUTS_TOKEN;
const AVIASALES_MARKER = process.env.AVIASALES_MARKER;
const AVIASALES_WL_HOST = process.env.AVIASALES_WL_HOST || 'book.otherwhere.world';

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
   * Generate MD5 signature for API authentication
   * @param {Object} requestBody - Request body object
   * @returns {string} MD5 signature
   */
  generateSignature(requestBody) {
    // Signature = MD5(token:marker:directions_json)
    const directionsJson = JSON.stringify(requestBody.directions);
    const signatureString = `${AVIASALES_TOKEN}:${AVIASALES_MARKER}:${directionsJson}`;
    return crypto.createHash('md5').update(signatureString).digest('hex');
  }

  /**
   * Search for flights based on trip parameters (REAL-TIME API)
   * @param {Object} tripData - Trip search parameters
   * @returns {Promise<Object>} Flight search results
   */
  async searchFlights(tripData) {
    if (!AVIASALES_TOKEN || !AVIASALES_MARKER) {
      throw new Error('Aviasales credentials not configured');
    }

    try {
      // === NORMALIZE INPUT DATA ===
      // Handle both check_in/check_out AND startDate/endDate formats
      const departDate = tripData.startDate || tripData.check_in || tripData.depart_date;
      const returnDate = tripData.endDate || tripData.check_out || tripData.return_date;
      const destination = tripData.destination;
      const origin = tripData.origin;
      const travelers = tripData.travelers || tripData.adults || 1;
      const budget = tripData.budget;

      // === VALIDATION: Check required fields ===
      if (!origin || !destination) {
        throw new Error('Missing origin or destination');
      }

      if (!departDate) {
        throw new Error('Missing departure date. Please specify dates like "Dec 15-19"');
      }

      // Parse destination and origin codes
      const originCity = this.extractCityCode(origin);
      const destCity = this.extractCityCode(destination);

      console.log(`[Aviasales] 🔍 Searching flights: ${originCity} → ${destCity}`);
      console.log(`[Aviasales] 📅 Dates: ${departDate} to ${returnDate || 'one-way'}`);
      console.log(`[Aviasales] 👥 Travelers: ${travelers}`);
      console.log(`[Aviasales] 🔑 Using token:`, AVIASALES_TOKEN?.substring(0, 8) + '...');
      console.log(`[Aviasales] 🏷️  Using marker:`, AVIASALES_MARKER);
      console.log(`[Aviasales] 🌐 WL Host:`, AVIASALES_WL_HOST);

      let flightData = [];

      // === STRATEGY 1: Try v3 prices_for_dates (best for near-term) ===
      try {
        console.log(`[Aviasales] 🚀 Strategy 1: Trying v3/prices_for_dates...`);
        const v3Url = 'https://api.travelpayouts.com/aviasales/v3/prices_for_dates';
        const v3Params = {
          origin: originCity,
          destination: destCity,
          departure_at: departDate,
          return_at: returnDate || undefined,
          currency: budget?.currency || 'USD',
          token: AVIASALES_TOKEN,
          sorting: 'price',
          limit: 30
        };

        const v3Response = await axios.get(v3Url, {
          params: v3Params,
          timeout: 10000
        });

        if (v3Response.data?.success && v3Response.data?.data?.length > 0) {
          flightData = v3Response.data.data;
          console.log(`[Aviasales] ✅ v3 found ${flightData.length} flights`);
        } else {
          console.log(`[Aviasales] ⚠️  v3 returned 0 results, trying fallback...`);
        }
      } catch (v3Error) {
        console.log(`[Aviasales] ⚠️  v3 error:`, v3Error.message);
      }

      // === STRATEGY 2: Fallback to v1 prices/cheap (works for far future) ===
      if (flightData.length === 0) {
        try {
          console.log(`[Aviasales] 🚀 Strategy 2: Trying v1/prices/cheap...`);
          const v1Url = 'https://api.travelpayouts.com/v1/prices/cheap';
          const v1Params = {
            origin: originCity,
            destination: destCity,
            currency: budget?.currency || 'USD',
            token: AVIASALES_TOKEN
          };

          const v1Response = await axios.get(v1Url, {
            params: v1Params,
            timeout: 10000
          });

          if (v1Response.data?.success && v1Response.data?.data?.[destCity]) {
            // v1 returns data grouped by destination
            const destData = v1Response.data.data[destCity];
            // Convert to array and take cheapest options
            flightData = Object.values(destData).slice(0, 5);
            console.log(`[Aviasales] ✅ v1 found ${flightData.length} price options`);
          } else {
            console.log(`[Aviasales] ⚠️  v1 returned no data`);
          }
        } catch (v1Error) {
          console.log(`[Aviasales] ⚠️  v1 error:`, v1Error.message);
        }
      }

      // === STRATEGY 3: Always return white-label link even with no API data ===
      const flights = flightData.length > 0
        ? this.formatDataAPIResults(flightData, tripData)
        : this.generateFallbackFlights(originCity, destCity, departDate, returnDate);

      console.log(`[Aviasales] 🎯 Final result: ${flights.length} flight options`);

      return {
        success: true,
        flights,
        searchParams: {
          origin: originCity,
          destination: destCity,
          dates: `${departDate} - ${returnDate || 'one-way'}`,
          travelers: travelers || 1
        }
      };

    } catch (error) {
      console.error('[Aviasales] API Error:', error.message);

      if (error.response) {
        console.error('[Aviasales] API Response Status:', error.response.status);
        console.error('[Aviasales] API Response Data:', JSON.stringify(error.response.data).substring(0, 500));
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
      'sf': 'SFO',
      'chicago': 'CHI',
      'miami': 'MIA',
      'boston': 'BOS',
      'seattle': 'SEA',
      'las vegas': 'LAS',
      'orlando': 'ORL',
      'toronto': 'YTO',
      'vancouver': 'YVR',
      'montreal': 'YUL',
      'dublin': 'DUB',
      'barcelona': 'BCN',
      'rome': 'ROM',
      'amsterdam': 'AMS',
      'berlin': 'BER',
      'madrid': 'MAD',
      'lisbon': 'LIS'
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
   * Format flight results for user display (LEGACY - for v2 cached API)
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
   * Generate fallback flight entries when API returns no data
   * Like Kayak fallback - always provide a booking link
   * @param {string} origin - Origin airport code
   * @param {string} destination - Destination airport code
   * @param {string} departDate - Departure date
   * @param {string} returnDate - Return date (optional)
   * @returns {Array} Fallback flight entries
   */
  generateFallbackFlights(origin, destination, departDate, returnDate) {
    console.log(`[Aviasales] 🎯 Generating fallback flight entry (no API prices available)`);

    // Return a single generic flight entry
    // The white-label link will still work for booking
    return [{
      rank: 1,
      price: 'Search flights',
      priceValue: 0,
      airline: 'Multiple Airlines',
      departure: departDate,
      returnDate: returnDate,
      duration: null,
      transfers: null,
      // No affiliateLink - will use white-label URL in getBestBookingURL()
      affiliateLink: null,
      rawData: null
    }];
  }

  /**
   * Format Data API results for user display
   * @param {Array} flights - Flight data from Data API
   * @param {Object} tripData - Original search parameters
   * @returns {Array} Formatted flight results
   */
  formatDataAPIResults(flights, tripData) {
    if (!flights || flights.length === 0) {
      return [];
    }

    // Normalize field names
    const startDate = tripData.startDate || tripData.check_in || tripData.depart_date;
    const endDate = tripData.endDate || tripData.check_out || tripData.return_date;

    // Sort by price
    const sorted = flights.sort((a, b) => (a.price || 0) - (b.price || 0));

    return sorted.slice(0, 5).map((flight, index) => {
      const price = flight.price || 0;
      const currency = flight.currency || tripData.budget?.currency || 'USD';

      // Data API format: transfers, airline
      const airline = flight.airline || 'Various';
      const transfers = flight.transfers || 0;

      return {
        rank: index + 1,
        price: `$${Math.round(price)} ${currency}`,
        priceValue: price,
        airline: airline,
        departure: startDate,
        returnDate: endDate,
        duration: flight.duration || null,
        transfers: transfers,
        // Extract link if available (Data API may include gate links)
        affiliateLink: flight.link || null,
        rawData: flight
      };
    });
  }

  /**
   * Format real-time API proposals for user display (DEPRECATED - needs special access)
   * @param {Array} proposals - Proposals from real-time API
   * @param {Object} tripData - Original search parameters
   * @returns {Array} Formatted flight results
   */
  formatRealTimeResults(proposals, tripData) {
    if (!proposals || proposals.length === 0) {
      return [];
    }

    // Normalize field names
    const startDate = tripData.startDate || tripData.check_in || tripData.depart_date;
    const endDate = tripData.endDate || tripData.check_out || tripData.return_date;

    // Sort by total price
    const sorted = proposals.sort((a, b) => {
      const priceA = a.terms?.price?.total?.amount || 0;
      const priceB = b.terms?.price?.total?.amount || 0;
      return priceA - priceB;
    });

    return sorted.slice(0, 5).map((proposal, index) => {
      const price = proposal.terms?.price?.total?.amount || 0;
      const currency = proposal.terms?.price?.total?.currency || tripData.budget?.currency || 'USD';

      // Extract airline from first segment
      const firstSegment = proposal.segment?.[0];
      const airline = firstSegment?.carrier?.marketing_carrier_name || 'Various';

      // Count total stops/transfers
      const totalStops = proposal.segment?.reduce((sum, seg) => {
        return sum + (seg.stop?.length || 0);
      }, 0) || 0;

      return {
        rank: index + 1,
        price: `$${Math.round(price)} ${currency}`,
        priceValue: price,
        airline: airline,
        departure: startDate,
        returnDate: endDate,
        duration: null, // Can be calculated from segments if needed
        transfers: totalStops,
        // Extract direct affiliate link from proposal (PRIORITY #1)
        affiliateLink: proposal.link || null,
        rawData: proposal
      };
    });
  }

  /**
   * Build white-label booking URL directly (PRIORITY #2)
   * @param {Object} tripData - Trip search parameters
   * @param {string} sessionId - Session ID for subid tracking
   * @returns {string} White-label booking URL
   */
  buildWhiteLabelURL(tripData, sessionId = null) {
    // Normalize field names
    const origin = tripData.origin;
    const destination = tripData.destination;
    const startDate = tripData.startDate || tripData.check_in || tripData.depart_date;
    const endDate = tripData.endDate || tripData.check_out || tripData.return_date;
    const travelers = tripData.travelers || tripData.adults || 1;

    // Extract airport codes
    const originCode = this.extractCityCode(origin);
    const destCode = this.extractCityCode(destination);

    // Format dates as MMDD (e.g., 1215 for Dec 15)
    const formatDate = (dateStr) => {
      const date = new Date(dateStr);
      const month = String(date.getMonth() + 1).padStart(2, '0');
      const day = String(date.getDate()).padStart(2, '0');
      return `${month}${day}`;
    };

    const departDate = formatDate(startDate);
    const returnDate = endDate ? formatDate(endDate) : '';

    // Build flightSearch parameter: "YYZ1215CDG12191"
    const flightSearch = `${originCode}${departDate}${destCode}${returnDate}${travelers || 1}`;

    const params = new URLSearchParams({
      flightSearch,
      marker: AVIASALES_MARKER
    });

    if (sessionId) {
      params.set('subid', `ow_${sessionId}`);
    }

    return `https://${AVIASALES_WL_HOST}/?${params.toString()}`;
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
    // Normalize field names
    const startDate = tripData.startDate || tripData.check_in || tripData.depart_date;
    const endDate = tripData.endDate || tripData.check_out || tripData.return_date;

    const origin = this.extractCityCode(tripData.origin || 'LAX');
    const dest = this.extractCityCode(tripData.destination);

    const params = new URLSearchParams({
      o: origin,
      d: dest,
      dd: startDate,
      ad: (tripData.travelers || tripData.adults || 1).toString(),
      ch: (tripData.children || 0).toString(),
      in: (tripData.infants || 0).toString(),
      cls: tripData.travelClass?.charAt(0)?.toLowerCase() || 'e',
      cur: tripData.budget?.currency || 'USD',
      utm_source: 'sms'
    });

    // Add return date if provided
    if (endDate) {
      params.set('rd', endDate);
    }

    // Add session ID if provided
    if (sessionId) {
      params.set('sid', sessionId);
    }

    // Get base URL and strip any trailing /webhook path
    let base = baseUrl || process.env.BACKEND_WEBHOOK_URL || 'http://localhost:3000';
    base = base.replace(/\/webhook\/?$/, ''); // Remove /webhook or /webhook/ from end

    return `${base}/go/flights?${params.toString()}`;
  }

  /**
   * Get best booking URL with priority logic
   * Priority: proposal.link > white-label > /go/flights
   *
   * @param {Object} flightResults - Flight results with affiliateLink
   * @param {Object} tripData - Original trip search data
   * @param {string} sessionId - Session ID for tracking
   * @returns {string} Best booking URL
   */
  getBestBookingURL(flightResults, tripData, sessionId = null) {
    // PRIORITY #1: Use direct affiliate link from API response
    if (flightResults.flights?.[0]?.affiliateLink) {
      console.log('[TravelPayouts] 🔗 Using direct affiliate link from API');
      return flightResults.flights[0].affiliateLink;
    }

    // PRIORITY #2: Use white-label URL
    if (AVIASALES_WL_HOST && AVIASALES_MARKER) {
      console.log('[TravelPayouts] 🏷️  Using white-label URL (book.otherwhere.world)');
      return this.buildWhiteLabelURL(tripData, sessionId);
    }

    // PRIORITY #3: Fallback to /go/flights redirector
    console.log('[TravelPayouts] ⚠️  Fallback to /go/flights redirector');
    return this.buildGoFlightsURL(tripData, sessionId);
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
