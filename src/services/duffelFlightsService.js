/**
 * Duffel Flights API Service
 * Searches for flight offers using Duffel's /air/offer_requests endpoint
 * Returns raw flight data for building custom airline deep links
 */

const axios = require('axios');

const DUFFEL_API_KEY = process.env.DUFFEL_ACCESS_TOKEN;
const DUFFEL_API_URL = 'https://api.duffel.com';

class DuffelFlightsService {
  constructor() {
    this.headers = {
      'Authorization': `Bearer ${DUFFEL_API_KEY}`,
      'Duffel-Version': 'v2',
      'Content-Type': 'application/json',
      'Accept': 'application/json'
    };
  }

  /**
   * Create an offer request to search for flights
   * @param {Object} params - Search parameters
   * @param {string} params.origin - Origin airport IATA code (e.g., "YVR")
   * @param {string} params.destination - Destination airport IATA code (e.g., "JFK")
   * @param {string} params.departureDate - Departure date (YYYY-MM-DD)
   * @param {string} [params.returnDate] - Return date for round trips (YYYY-MM-DD)
   * @param {number} [params.passengers=1] - Number of passengers
   * @param {string} [params.cabin='economy'] - Cabin class (economy, premium_economy, business, first)
   * @returns {Promise<Object>} Offer request with offers
   */
  async searchFlights(params) {
    if (!this.isConfigured()) {
      throw new Error('Duffel API not configured - missing DUFFEL_ACCESS_TOKEN');
    }

    const {
      origin,
      destination,
      departureDate,
      returnDate,
      passengers = 1,
      cabin = 'economy'
    } = params;

    // Validate required parameters
    if (!origin || !destination || !departureDate) {
      throw new Error('Origin, destination, and departure date are required');
    }

    // Validate IATA codes (should be 3 letters)
    if (origin.length !== 3 || destination.length !== 3) {
      throw new Error('Origin and destination must be 3-letter IATA codes');
    }

    // Validate date format (YYYY-MM-DD)
    const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
    if (!dateRegex.test(departureDate)) {
      throw new Error('Departure date must be in YYYY-MM-DD format');
    }
    if (returnDate && !dateRegex.test(returnDate)) {
      throw new Error('Return date must be in YYYY-MM-DD format');
    }

    try {
      console.log(`[DuffelFlights] Searching: ${origin} → ${destination} on ${departureDate}${returnDate ? ` (return ${returnDate})` : ''}`);

      // Build slices for the offer request
      const slices = [
        {
          origin: origin.toUpperCase(),
          destination: destination.toUpperCase(),
          departure_date: departureDate
        }
      ];

      // Add return slice if round trip
      if (returnDate) {
        slices.push({
          origin: destination.toUpperCase(),
          destination: origin.toUpperCase(),
          departure_date: returnDate
        });
      }

      // Build passenger list
      const passengersList = [];
      for (let i = 0; i < passengers; i++) {
        passengersList.push({
          type: 'adult'
        });
      }

      // Create the offer request
      const requestBody = {
        data: {
          slices,
          passengers: passengersList,
          cabin_class: cabin.toLowerCase(),
          return_offers: true // Get offers immediately in the response
        }
      };

      console.log(`[DuffelFlights] Request body:`, JSON.stringify(requestBody, null, 2));

      const response = await axios.post(
        `${DUFFEL_API_URL}/air/offer_requests`,
        requestBody,
        {
          headers: this.headers,
          timeout: 30000 // 30 seconds
        }
      );

      const offerRequest = response.data.data;
      const offers = offerRequest.offers || [];

      console.log(`[DuffelFlights] Found ${offers.length} offers`);

      // Return the offer request with offers
      return {
        success: true,
        offerRequestId: offerRequest.id,
        offers: offers,
        searchParams: params
      };

    } catch (error) {
      console.error(`[DuffelFlights] Search error:`, error.response?.data || error.message);

      if (error.response?.status === 429) {
        throw new Error('Rate limit exceeded. Please try again in a moment.');
      }

      if (error.response?.status === 400) {
        const errorMessage = error.response?.data?.errors?.[0]?.message || 'Invalid search parameters';
        throw new Error(`Duffel API error: ${errorMessage}`);
      }

      throw new Error(`Flight search failed: ${error.message}`);
    }
  }

  /**
   * Format flight offers for display
   * Extracts key information from Duffel offers
   * @param {Array} offers - Array of Duffel offers
   * @param {number} limit - Maximum number of offers to format (default: 3)
   * @returns {Array} Formatted flight data
   */
  formatOffers(offers, limit = 3) {
    if (!offers || offers.length === 0) {
      return [];
    }

    // Sort by price (ascending)
    const sortedOffers = [...offers].sort((a, b) =>
      parseFloat(a.total_amount) - parseFloat(b.total_amount)
    );

    // Take top N offers
    const topOffers = sortedOffers.slice(0, limit);

    return topOffers.map((offer, index) => {
      // Extract airline info from the first segment
      const firstSlice = offer.slices[0];
      const firstSegment = firstSlice?.segments[0];
      const airline = firstSegment?.marketing_carrier;

      // Calculate total stops (sum stops across all segments in all slices)
      let totalStops = 0;
      offer.slices.forEach(slice => {
        slice.segments.forEach(segment => {
          totalStops += (segment.stops?.length || 0);
        });
      });

      // Calculate duration in minutes
      const durationMatch = firstSlice?.duration?.match(/PT(\d+H)?(\d+M)?/);
      let durationMinutes = 0;
      if (durationMatch) {
        const hours = durationMatch[1] ? parseInt(durationMatch[1]) : 0;
        const minutes = durationMatch[2] ? parseInt(durationMatch[2]) : 0;
        durationMinutes = hours * 60 + minutes;
      }

      // Format duration as "Xh Ym"
      const hours = Math.floor(durationMinutes / 60);
      const mins = durationMinutes % 60;
      const durationText = `${hours}h ${mins}m`;

      return {
        index: index + 1,
        offerId: offer.id,
        airline: {
          name: airline?.name || 'Unknown Airline',
          iata_code: airline?.iata_code || null,
          logo: airline?.logo_symbol_url || null
        },
        price: parseFloat(offer.total_amount),
        currency: offer.total_currency,
        departure: {
          airport: firstSlice?.origin?.iata_code,
          time: firstSlice?.segments[0]?.departing_at
        },
        arrival: {
          airport: firstSlice?.destination?.iata_code,
          time: firstSlice?.segments[firstSlice.segments.length - 1]?.arriving_at
        },
        duration: {
          text: durationText,
          minutes: durationMinutes
        },
        stops: totalStops,
        slices: offer.slices,
        rawOffer: offer
      };
    });
  }

  /**
   * Check if service is properly configured
   * @returns {boolean} True if API key is set
   */
  isConfigured() {
    return !!DUFFEL_API_KEY;
  }
}

// Export as singleton instance
module.exports = new DuffelFlightsService();
