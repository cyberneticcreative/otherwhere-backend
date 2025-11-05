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

    // In-memory cache for airport searches (airports don't change often)
    this.airportCache = new Map();
    this.CACHE_TTL = 24 * 60 * 60 * 1000; // 24 hours

    // Rate limiting
    this.lastRequestTime = 0;
    this.MIN_REQUEST_INTERVAL = 1000; // 1 second between requests (increased from 500ms)

    // Common airport codes fallback (in case API is slow/down)
    this.commonAirports = {
      // North America
      'toronto': [{ code: 'YYZ', name: 'Toronto Pearson International Airport', city: 'Toronto', country: 'Canada' }],
      'vancouver': [{ code: 'YVR', name: 'Vancouver International Airport', city: 'Vancouver', country: 'Canada' }],
      'montreal': [{ code: 'YUL', name: 'Montreal-Pierre Elliott Trudeau International Airport', city: 'Montreal', country: 'Canada' }],
      'calgary': [{ code: 'YYC', name: 'Calgary International Airport', city: 'Calgary', country: 'Canada' }],
      'ottawa': [{ code: 'YOW', name: 'Ottawa Macdonald-Cartier International Airport', city: 'Ottawa', country: 'Canada' }],
      'new york': [{ code: 'JFK', name: 'John F. Kennedy International Airport', city: 'New York', country: 'USA' }, { code: 'EWR', name: 'Newark Liberty International Airport', city: 'Newark', country: 'USA' }],
      'los angeles': [{ code: 'LAX', name: 'Los Angeles International Airport', city: 'Los Angeles', country: 'USA' }],
      'chicago': [{ code: 'ORD', name: "O'Hare International Airport", city: 'Chicago', country: 'USA' }],
      'san francisco': [{ code: 'SFO', name: 'San Francisco International Airport', city: 'San Francisco', country: 'USA' }],
      'miami': [{ code: 'MIA', name: 'Miami International Airport', city: 'Miami', country: 'USA' }],
      'seattle': [{ code: 'SEA', name: 'Seattle-Tacoma International Airport', city: 'Seattle', country: 'USA' }],
      'boston': [{ code: 'BOS', name: 'Logan International Airport', city: 'Boston', country: 'USA' }],
      'dallas': [{ code: 'DFW', name: 'Dallas/Fort Worth International Airport', city: 'Dallas', country: 'USA' }],
      'houston': [{ code: 'IAH', name: 'George Bush Intercontinental Airport', city: 'Houston', country: 'USA' }],
      'denver': [{ code: 'DEN', name: 'Denver International Airport', city: 'Denver', country: 'USA' }],
      'atlanta': [{ code: 'ATL', name: 'Hartsfield-Jackson Atlanta International Airport', city: 'Atlanta', country: 'USA' }],
      'las vegas': [{ code: 'LAS', name: 'Harry Reid International Airport', city: 'Las Vegas', country: 'USA' }],
      'orlando': [{ code: 'MCO', name: 'Orlando International Airport', city: 'Orlando', country: 'USA' }],
      'phoenix': [{ code: 'PHX', name: 'Phoenix Sky Harbor International Airport', city: 'Phoenix', country: 'USA' }],
      'philadelphia': [{ code: 'PHL', name: 'Philadelphia International Airport', city: 'Philadelphia', country: 'USA' }],
      'san diego': [{ code: 'SAN', name: 'San Diego International Airport', city: 'San Diego', country: 'USA' }],
      'portland': [{ code: 'PDX', name: 'Portland International Airport', city: 'Portland', country: 'USA' }],

      // Europe
      'london': [{ code: 'LHR', name: 'London Heathrow Airport', city: 'London', country: 'UK' }, { code: 'LGW', name: 'London Gatwick Airport', city: 'London', country: 'UK' }],
      'paris': [{ code: 'CDG', name: 'Charles de Gaulle Airport', city: 'Paris', country: 'France' }],
      'madrid': [{ code: 'MAD', name: 'Adolfo Suárez Madrid–Barajas Airport', city: 'Madrid', country: 'Spain' }],
      'barcelona': [{ code: 'BCN', name: 'Barcelona-El Prat Airport', city: 'Barcelona', country: 'Spain' }],
      'rome': [{ code: 'FCO', name: 'Leonardo da Vinci–Fiumicino Airport', city: 'Rome', country: 'Italy' }],
      'amsterdam': [{ code: 'AMS', name: 'Amsterdam Airport Schiphol', city: 'Amsterdam', country: 'Netherlands' }],
      'frankfurt': [{ code: 'FRA', name: 'Frankfurt Airport', city: 'Frankfurt', country: 'Germany' }],
      'dublin': [{ code: 'DUB', name: 'Dublin Airport', city: 'Dublin', country: 'Ireland' }],
      'berlin': [{ code: 'BER', name: 'Berlin Brandenburg Airport', city: 'Berlin', country: 'Germany' }],
      'munich': [{ code: 'MUC', name: 'Munich Airport', city: 'Munich', country: 'Germany' }],
      'vienna': [{ code: 'VIE', name: 'Vienna International Airport', city: 'Vienna', country: 'Austria' }],
      'zurich': [{ code: 'ZRH', name: 'Zurich Airport', city: 'Zurich', country: 'Switzerland' }],
      'brussels': [{ code: 'BRU', name: 'Brussels Airport', city: 'Brussels', country: 'Belgium' }],
      'lisbon': [{ code: 'LIS', name: 'Lisbon Portela Airport', city: 'Lisbon', country: 'Portugal' }],
      'copenhagen': [{ code: 'CPH', name: 'Copenhagen Airport', city: 'Copenhagen', country: 'Denmark' }],
      'stockholm': [{ code: 'ARN', name: 'Stockholm Arlanda Airport', city: 'Stockholm', country: 'Sweden' }],
      'oslo': [{ code: 'OSL', name: 'Oslo Airport', city: 'Oslo', country: 'Norway' }],
      'helsinki': [{ code: 'HEL', name: 'Helsinki-Vantaa Airport', city: 'Helsinki', country: 'Finland' }],
      'reykjavik': [{ code: 'KEF', name: 'Keflavík International Airport', city: 'Reykjavik', country: 'Iceland' }],
      'athens': [{ code: 'ATH', name: 'Athens International Airport', city: 'Athens', country: 'Greece' }],
      'istanbul': [{ code: 'IST', name: 'Istanbul Airport', city: 'Istanbul', country: 'Turkey' }],
      'prague': [{ code: 'PRG', name: 'Václav Havel Airport Prague', city: 'Prague', country: 'Czech Republic' }],
      'warsaw': [{ code: 'WAW', name: 'Warsaw Chopin Airport', city: 'Warsaw', country: 'Poland' }],
      'bucharest': [{ code: 'OTP', name: 'Henri Coandă International Airport', city: 'Bucharest', country: 'Romania' }],
      'budapest': [{ code: 'BUD', name: 'Budapest Ferenc Liszt International Airport', city: 'Budapest', country: 'Hungary' }],

      // Asia & Oceania
      'tokyo': [{ code: 'NRT', name: 'Narita International Airport', city: 'Tokyo', country: 'Japan' }, { code: 'HND', name: 'Haneda Airport', city: 'Tokyo', country: 'Japan' }],
      'singapore': [{ code: 'SIN', name: 'Singapore Changi Airport', city: 'Singapore', country: 'Singapore' }],
      'sydney': [{ code: 'SYD', name: 'Sydney Kingsford Smith Airport', city: 'Sydney', country: 'Australia' }],
      'melbourne': [{ code: 'MEL', name: 'Melbourne Airport', city: 'Melbourne', country: 'Australia' }],
      'brisbane': [{ code: 'BNE', name: 'Brisbane Airport', city: 'Brisbane', country: 'Australia' }],
      'auckland': [{ code: 'AKL', name: 'Auckland Airport', city: 'Auckland', country: 'New Zealand' }],
      'dubai': [{ code: 'DXB', name: 'Dubai International Airport', city: 'Dubai', country: 'UAE' }],
      'bangkok': [{ code: 'BKK', name: 'Suvarnabhumi Airport', city: 'Bangkok', country: 'Thailand' }],
      'hong kong': [{ code: 'HKG', name: 'Hong Kong International Airport', city: 'Hong Kong', country: 'Hong Kong' }],
      'seoul': [{ code: 'ICN', name: 'Incheon International Airport', city: 'Seoul', country: 'South Korea' }],
      'beijing': [{ code: 'PEK', name: 'Beijing Capital International Airport', city: 'Beijing', country: 'China' }],
      'shanghai': [{ code: 'PVG', name: 'Shanghai Pudong International Airport', city: 'Shanghai', country: 'China' }],
      'delhi': [{ code: 'DEL', name: 'Indira Gandhi International Airport', city: 'Delhi', country: 'India' }],
      'mumbai': [{ code: 'BOM', name: 'Chhatrapati Shivaji Maharaj International Airport', city: 'Mumbai', country: 'India' }],
      'kuala lumpur': [{ code: 'KUL', name: 'Kuala Lumpur International Airport', city: 'Kuala Lumpur', country: 'Malaysia' }],
      'jakarta': [{ code: 'CGK', name: 'Soekarno-Hatta International Airport', city: 'Jakarta', country: 'Indonesia' }],
      'manila': [{ code: 'MNL', name: 'Ninoy Aquino International Airport', city: 'Manila', country: 'Philippines' }],
      'taipei': [{ code: 'TPE', name: 'Taiwan Taoyuan International Airport', city: 'Taipei', country: 'Taiwan' }],

      // South America
      'mexico city': [{ code: 'MEX', name: 'Mexico City International Airport', city: 'Mexico City', country: 'Mexico' }],
      'cancun': [{ code: 'CUN', name: 'Cancún International Airport', city: 'Cancun', country: 'Mexico' }],
      'sao paulo': [{ code: 'GRU', name: 'São Paulo/Guarulhos International Airport', city: 'São Paulo', country: 'Brazil' }],
      'rio de janeiro': [{ code: 'GIG', name: 'Rio de Janeiro/Galeão International Airport', city: 'Rio de Janeiro', country: 'Brazil' }],
      'buenos aires': [{ code: 'EZE', name: 'Ministro Pistarini International Airport', city: 'Buenos Aires', country: 'Argentina' }],
      'santiago': [{ code: 'SCL', name: 'Arturo Merino Benítez International Airport', city: 'Santiago', country: 'Chile' }],
      'bogota': [{ code: 'BOG', name: 'El Dorado International Airport', city: 'Bogotá', country: 'Colombia' }],
      'lima': [{ code: 'LIM', name: 'Jorge Chávez International Airport', city: 'Lima', country: 'Peru' }],

      // Africa & Middle East
      'johannesburg': [{ code: 'JNB', name: 'O.R. Tambo International Airport', city: 'Johannesburg', country: 'South Africa' }],
      'cape town': [{ code: 'CPT', name: 'Cape Town International Airport', city: 'Cape Town', country: 'South Africa' }],
      'cairo': [{ code: 'CAI', name: 'Cairo International Airport', city: 'Cairo', country: 'Egypt' }],
      'doha': [{ code: 'DOH', name: 'Hamad International Airport', city: 'Doha', country: 'Qatar' }],
      'tel aviv': [{ code: 'TLV', name: 'Ben Gurion Airport', city: 'Tel Aviv', country: 'Israel' }],
    };
  }

  /**
   * Add delay between requests to avoid rate limiting
   */
  async rateLimitDelay() {
    const now = Date.now();
    const timeSinceLastRequest = now - this.lastRequestTime;

    if (timeSinceLastRequest < this.MIN_REQUEST_INTERVAL) {
      const delay = this.MIN_REQUEST_INTERVAL - timeSinceLastRequest;
      console.log(`[GoogleFlights] Rate limit delay: ${delay}ms`);
      await new Promise(resolve => setTimeout(resolve, delay));
    }

    this.lastRequestTime = Date.now();
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

    // Clean up query - remove common country suffixes that confuse the API
    let cleanQuery = query
      .replace(/,?\s*(England|UK|United Kingdom|USA|US|United States|Canada)$/i, '')
      .trim();

    // Check cache first
    const cacheKey = `${cleanQuery.toLowerCase()}_${countryCode}`;
    const cached = this.airportCache.get(cacheKey);

    if (cached && (Date.now() - cached.timestamp < this.CACHE_TTL)) {
      console.log(`[GoogleFlights] Using cached airports for: ${cleanQuery}`);
      return cached.data;
    }

    // Check hardcoded fallback first
    const fallbackKey = cleanQuery.toLowerCase();
    const fallbackAirports = this.commonAirports[fallbackKey];
    if (fallbackAirports) {
      console.log(`[GoogleFlights] Using fallback airports for: ${cleanQuery}`);
      // Cache the fallback too
      this.airportCache.set(cacheKey, {
        data: fallbackAirports,
        timestamp: Date.now()
      });
      return fallbackAirports;
    }

    // Try API with retry logic
    const maxRetries = 2;
    let lastError;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        console.log(`[GoogleFlights] Searching airports for: ${cleanQuery}${cleanQuery !== query ? ` (cleaned from "${query}")` : ''} (attempt ${attempt}/${maxRetries})`);

        // Add rate limiting delay
        await this.rateLimitDelay();

        const response = await axios.get(`${BASE_URL}/searchAirport`, {
          params: {
            query: cleanQuery,
            language_code: languageCode,
            country_code: countryCode
          },
          headers: this.defaultHeaders,
          timeout: 30000 // Increased from 20s to 30s
        });

        const rawResults = response.data?.data || [];

        console.log(`[GoogleFlights] Found ${rawResults.length} results for "${query}"`);

        // Debug: Log first result structure if available
        if (rawResults.length > 0) {
          console.log(`[GoogleFlights] Sample result data:`, JSON.stringify(rawResults[0], null, 2));
        }

        // Flatten the results - extract airports from nested 'list' arrays
        let airports = [];

        for (const result of rawResults) {
          // If this result has a 'list' property with airports, extract them
          if (result.list && Array.isArray(result.list)) {
            const airportsInList = result.list.filter(item => item.type === 'airport');
            airports.push(...airportsInList);
          }
          // Otherwise, if this is a direct airport result, use it
          else if (result.type === 'airport') {
            airports.push(result);
          }
        }

        console.log(`[GoogleFlights] Extracted ${airports.length} airports from results`);

        const formattedAirports = airports.map(airport => {
          // For the nested structure, 'id' is the airport code
          const code = airport.id || airport.airport_id || airport.code || airport.iata_code || airport.iata;
          const name = airport.title || airport.airport_name || airport.name || airport.display_name;

          if (!code) {
            console.warn(`[GoogleFlights] Warning: Airport missing code field:`, airport);
          }

          return {
            code,
            name,
            city: airport.city || airport.city_name,
            country: airport.country || airport.country_name,
            subtitle: airport.subtitle,
            distance: airport.distance,
            displayName: `${name} (${code || 'N/A'})`
          };
        });

        // Cache the result
        this.airportCache.set(cacheKey, {
          data: formattedAirports,
          timestamp: Date.now()
        });

        console.log(`[GoogleFlights] ✅ Successfully retrieved airports on attempt ${attempt}`);
        return formattedAirports;

      } catch (error) {
        lastError = error;
        console.error(`[GoogleFlights] Airport search error (attempt ${attempt}/${maxRetries}):`, error.message);

        // Don't retry on rate limit - fail immediately
        if (error.response?.status === 429) {
          throw new Error('Flight search rate limit exceeded. Please try again in a few minutes.');
        }

        // If not the last attempt, wait a bit before retrying
        if (attempt < maxRetries) {
          const retryDelay = 2000; // 2 seconds
          console.log(`[GoogleFlights] Retrying in ${retryDelay}ms...`);
          await new Promise(resolve => setTimeout(resolve, retryDelay));
        }
      }
    }

    // All retries failed - throw the last error
    console.error(`[GoogleFlights] All ${maxRetries} attempts failed for airport search: ${cleanQuery}`);
    throw new Error(`Airport search failed after ${maxRetries} attempts: ${lastError?.message || 'Unknown error'}`);
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

      // Add rate limiting delay
      await this.rateLimitDelay();

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

      // Debug: Log the exact params being sent
      console.log(`[GoogleFlights] API Request params:`, JSON.stringify(searchParams, null, 2));

      const response = await axios.get(`${BASE_URL}/searchFlights`, {
        params: searchParams,
        headers: this.defaultHeaders,
        timeout: 20000 // Increased from 15s to 20s
      });

      const data = response.data?.data || response.data;

      // Debug: Log response structure
      console.log(`[GoogleFlights] Response structure:`, {
        hasData: !!data,
        hasItineraries: !!data?.itineraries,
        topLevelKeys: Object.keys(response.data || {}),
        dataKeys: Object.keys(data || {}),
        itinerariesKeys: Object.keys(data?.itineraries || {})
      });

      // Count total flights from both topFlights and otherFlights
      const topFlightsCount = data?.itineraries?.topFlights?.length || 0;
      const otherFlightsCount = data?.itineraries?.otherFlights?.length || 0;
      const totalCount = topFlightsCount + otherFlightsCount;

      console.log(`[GoogleFlights] Found ${totalCount} flights (${topFlightsCount} top, ${otherFlightsCount} other)`);

      // If 0 flights, log more details
      if (totalCount === 0) {
        console.log(`[GoogleFlights] ⚠️ 0 flights found. Raw response sample:`, JSON.stringify(response.data, null, 2).substring(0, 500));
      }

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

      // Use POST method with token in request body (per API docs)
      const response = await axios.post(`${BASE_URL}/getBookingURL`,
        { token },  // Token in body
        {
          headers: {
            ...this.defaultHeaders,
            'Content-Type': 'application/json'
          },
          timeout: 10000
        }
      );

      // Debug: log the actual response
      console.log(`[GoogleFlights] Booking API response:`, JSON.stringify(response.data, null, 2));

      // Check for error responses
      if (response.data?.status === false || response.data?.message === 'Invalid token') {
        console.warn(`[GoogleFlights] ❌ API rejected token: ${response.data?.message || 'Unknown error'}`);
        console.warn(`[GoogleFlights] Token used: ${token.substring(0, 50)}...`);
        // Return null so caller can use fallback
        return {
          success: false,
          bookingUrl: null,
          error: response.data?.message || 'Invalid token',
          data: response.data
        };
      }

      // Try multiple possible field names for the booking URL
      const bookingUrl = response.data?.url
        || response.data?.booking_url
        || response.data?.bookingUrl
        || response.data?.data?.url
        || response.data?.data?.booking_url;

      if (!bookingUrl) {
        console.warn(`[GoogleFlights] Could not find booking URL in response. Available fields:`, Object.keys(response.data || {}));
      }

      return {
        success: true,
        bookingUrl: bookingUrl,
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

      // Try multiple possible token fields for booking
      // Prioritize actual booking tokens over pagination tokens
      const bookingToken = flight.token
        || flight.booking_token
        || flight.purchase_token
        || flight.token_id
        || flight.book_token
        || flight.id
        || flight.next_token  // Last resort - might be pagination token
        || '';

      // Debug: log available fields for first flight
      if (index === 0) {
        console.log(`[GoogleFlights] Sample flight keys:`, Object.keys(flight));
        console.log(`[GoogleFlights] Using booking token from field: ${bookingToken ? Object.keys(flight).find(k => flight[k] === bookingToken) : 'NONE'}`);

        // Log a sample of the token to help debug
        if (bookingToken) {
          console.log(`[GoogleFlights] Token sample: ${bookingToken.substring(0, 50)}... (length: ${bookingToken.length})`);
        }

        // If we're using next_token, warn that it might be a pagination token
        if (bookingToken === flight.next_token && !flight.token && !flight.booking_token) {
          console.warn(`[GoogleFlights] ⚠️ Using 'next_token' as booking token - this may be a pagination token and could fail`);
        }
      }

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
        bookingToken: bookingToken,
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

    const { departureId, arrivalId, outboundDate, currency } = searchInfo;

    // Compact date format (MM/DD)
    const formatDate = (dateStr) => {
      if (!dateStr) return '';
      const parts = dateStr.split('-');
      if (parts.length === 3) {
        return `${parts[1]}/${parts[2]}`; // Returns "02/14"
      }
      return dateStr;
    };

    const dateDisplay = formatDate(outboundDate);
    const header = `✈️ ${departureId}→${arrivalId} ${dateDisplay}\n`;

    const flightsList = formattedFlights.map(flight => {
      // Parse and compact time: "26-11-2025 08:53 PM" → "8:53p"
      const compactTime = (timeStr) => {
        if (!timeStr) return '';
        const parts = timeStr.split(' ');
        if (parts.length >= 3) {
          let time = parts[1]; // "08:53"
          const ampm = parts[2].toLowerCase()[0]; // "p" or "a"

          // Remove leading zero and shorten format
          const [hours, mins] = time.split(':');
          const h = hours.startsWith('0') ? hours.substring(1) : hours;
          return `${h}:${mins}${ampm}`;
        }
        return timeStr;
      };

      // Compact duration: "13 hr 40 min" → "13h40m"
      const compactDuration = (durationStr) => {
        if (!durationStr) return '';
        return durationStr
          .replace(/ hr /g, 'h')
          .replace(/ min/g, 'm')
          .replace(/ /g, '');
      };

      const departTime = compactTime(flight.departure);
      const arriveTime = compactTime(flight.arrival);
      const duration = compactDuration(flight.duration);

      // Use displayPrice if available (converted currency), otherwise use price
      const priceDisplay = flight.displayPrice || `$${flight.price}`;

      // Compact stops text
      const stops = flight.stops === 0 ? 'Direct' : `${flight.stops} stop${flight.stops > 1 ? 's' : ''}`;

      return `${flight.index}. ${flight.airline} ${priceDisplay}\n${departTime}-${arriveTime} ${duration} ${stops}`;
    }).join('\n\n');

    return `${header}${flightsList}\n\nReply 1-${formattedFlights.length} for booking link`;
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
