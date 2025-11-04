const axios = require('axios');

const TRAVELPAYOUTS_TOKEN = process.env.TRAVELPAYOUTS_TOKEN;
const AVIASALES_MARKER = process.env.AVIASALES_MARKER;

class TravelPayoutsService {
  /**
   * Search for flights based on trip parameters
   * @param {Object} tripData - Trip search parameters
   * @returns {Promise<Object>} Flight search results
   */
  async searchFlights(tripData) {
    if (!TRAVELPAYOUTS_TOKEN || !AVIASALES_MARKER) {
      throw new Error('TravelPayouts credentials not configured');
    }

    try {
      const { destination, startDate, endDate, travelers, budget } = tripData;

      // Parse destination and origin
      // For now, we'll use a simple approach - you can enhance this with a city code lookup
      const originCity = this.extractCityCode(tripData.origin || 'LAX');
      const destCity = this.extractCityCode(destination);

      console.log(`🔍 Searching flights: ${originCity} → ${destCity}`);
      console.log(`📅 Dates: ${startDate} to ${endDate || 'one-way'}`);
      console.log(`👥 Travelers: ${travelers || 1}`);

      // TravelPayouts API v2 - has more cached data than v3
      // Using latest prices endpoint which returns actual cached flight data
      const apiUrl = 'https://api.travelpayouts.com/v2/prices/latest';

      const params = {
        origin: originCity,
        destination: destCity,
        currency: budget?.currency || 'USD',
        token: TRAVELPAYOUTS_TOKEN,
        limit: 10 // Get more results to filter
      };

      const response = await axios.get(apiUrl, {
        params,
        timeout: 10000
      });

      console.log(`✅ Found ${response.data.data?.length || 0} flight options`);

      // Format the results and add affiliate markers
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
      console.error('TravelPayouts API Error:', error.message);

      if (error.response) {
        console.error('API Response:', error.response.data);
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

      // Generate affiliate booking link
      const affiliateLink = this.generateAffiliateLink(flight, tripData);

      return {
        rank: index + 1,
        price: `$${price} ${currency}`,
        priceValue: price,
        airline: flight.airline || 'Various',
        departure: flight.depart_date || tripData.startDate,
        returnDate: flight.return_date || tripData.endDate,
        link: affiliateLink,
        duration: flight.duration || null,
        transfers: flight.number_of_changes || 0
      };
    });
  }

  /**
   * Generate affiliate booking link for a flight
   * @param {Object} flight - Flight data
   * @param {Object} tripData - Search parameters
   * @returns {string} Affiliate link
   */
  generateAffiliateLink(flight, tripData) {
    if (!AVIASALES_MARKER) {
      return null;
    }

    // Use the link from API response if available
    if (flight.link) {
      // Ensure our Aviasales marker is in the URL
      const url = new URL(flight.link);
      url.searchParams.set('marker', AVIASALES_MARKER);
      return url.toString();
    }

    // Otherwise, construct Aviasales search link with affiliate marker
    const origin = this.extractCityCode(tripData.origin || 'LAX');
    const dest = this.extractCityCode(tripData.destination);
    const depart = tripData.startDate;
    const returnDate = tripData.endDate || '';

    // Aviasales affiliate link format
    let link = `https://www.aviasales.com/search/${origin}${depart}${dest}${returnDate}`;
    link += `?marker=${AVIASALES_MARKER}`;

    return link;
  }

  /**
   * Format flight results as SMS message
   * @param {Object} searchResults - Flight search results
   * @returns {string} Formatted SMS message
   */
  formatSMSMessage(searchResults) {
    if (!searchResults.success || searchResults.flights.length === 0) {
      return "No flights found. Try different dates!";
    }

    const { flights, searchParams } = searchResults;
    const topFlight = flights[0];

    // Super concise format to avoid SMS splitting
    let message = `✈️ ${searchParams.origin}→${searchParams.destination}\n`;
    message += `Best: ${topFlight.price}`;

    if (topFlight.transfers > 0) {
      message += ` (${topFlight.transfers} stop)`;
    }

    message += `\n\n`;

    // List top 3 flights compactly
    flights.slice(0, 3).forEach(flight => {
      message += `${flight.rank}. ${flight.price}`;
      if (flight.transfers > 0) {
        message += ` (${flight.transfers}st)`;
      }
      message += `\n`;
    });

    // Add booking link for best deal
    if (topFlight.link) {
      message += `\nBook: ${topFlight.link}`;
    }

    return message;
  }

  /**
   * Check if TravelPayouts is configured
   * @returns {boolean} True if configured
   */
  isConfigured() {
    return !!(TRAVELPAYOUTS_TOKEN && AVIASALES_MARKER);
  }
}

module.exports = new TravelPayoutsService();
