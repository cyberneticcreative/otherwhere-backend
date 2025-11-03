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

      // TravelPayouts API - using their cheapest flights endpoint
      const apiUrl = 'https://api.travelpayouts.com/aviasales/v3/prices_for_dates';

      const params = {
        origin: originCity,
        destination: destCity,
        departure_at: startDate,
        return_at: endDate || undefined,
        currency: budget?.currency || 'CAD',
        sorting: 'price',
        limit: 5,
        token: TRAVELPAYOUTS_TOKEN,
        marker: AVIASALES_MARKER // Aviasales affiliate marker for commission tracking
      };

      const response = await axios.get(apiUrl, {
        params,
        timeout: 10000
      });

      console.log(`✅ Found ${response.data.data?.length || 0} flight options`);

      // Format the results
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

    return flights.slice(0, 5).map((flight, index) => {
      const price = flight.price || flight.value || 0;
      const currency = tripData.budget?.currency || 'CAD';

      // Generate affiliate booking link
      const affiliateLink = this.generateAffiliateLink(flight, tripData);

      return {
        rank: index + 1,
        price: `${currency} ${price}`,
        priceValue: price,
        airline: flight.airline || 'Unknown',
        departure: flight.departure_at || tripData.startDate,
        returnDate: flight.return_at || tripData.endDate,
        link: affiliateLink || flight.link,
        duration: flight.duration || null,
        transfers: flight.transfers || 0
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
      return "Sorry, I couldn't find any flights for your search. Try different dates or destinations!";
    }

    const { flights, searchParams } = searchResults;
    const topFlight = flights[0];

    let message = `✈️ Found ${flights.length} flights!\n\n`;
    message += `🏆 Best Deal: ${topFlight.price}\n`;
    message += `${searchParams.origin} → ${searchParams.destination}\n`;
    message += `${searchParams.dates}\n\n`;

    // List top 3 flights with booking links
    flights.slice(0, 3).forEach(flight => {
      message += `${flight.rank}. ${flight.price}`;
      if (flight.transfers > 0) {
        message += ` (${flight.transfers} stop${flight.transfers > 1 ? 's' : ''})`;
      }
      message += `\n`;
    });

    // Add booking link for best deal
    if (topFlight.link) {
      message += `\n🔗 Book now: ${topFlight.link}`;
    }

    message += `\n\n💡 Click the link to book your flight!`;

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
