/**
 * Airline Deep Links Service
 * Builds direct booking URLs for specific airlines
 * Includes fallback to Google Flights when airline pattern doesn't exist
 */

const airlineDeepLinks = require('../data/airlineDeepLinks.json');

class AirlineDeepLinksService {
  /**
   * Build a booking URL for a specific airline
   * @param {Object} params - URL parameters
   * @param {string} params.airlineCode - IATA airline code (e.g., "AC", "DL")
   * @param {string} params.origin - Origin airport code (e.g., "YVR")
   * @param {string} params.destination - Destination airport code (e.g., "JFK")
   * @param {string} params.departure - Departure date (YYYY-MM-DD)
   * @param {string} [params.return] - Return date (YYYY-MM-DD), optional for one-way
   * @param {number} [params.passengers=1] - Number of passengers
   * @param {string} [params.cabin='economy'] - Cabin class
   * @returns {string|null} Booking URL or null if pattern doesn't exist
   */
  buildAirlineLink(params) {
    const {
      airlineCode,
      origin,
      destination,
      departure,
      return: returnDate,
      passengers = 1,
      cabin = 'economy'
    } = params;

    // Check if we have a pattern for this airline
    const template = airlineDeepLinks[airlineCode];

    if (!template) {
      console.log(`[AirlineDeepLinks] No pattern found for airline: ${airlineCode}`);
      return null;
    }

    // Build the URL by replacing placeholders
    let url = template
      .replaceAll('{origin}', encodeURIComponent(origin))
      .replaceAll('{destination}', encodeURIComponent(destination))
      .replaceAll('{departure}', encodeURIComponent(departure))
      .replaceAll('{passengers}', encodeURIComponent(passengers.toString()))
      .replaceAll('{cabin}', encodeURIComponent(cabin));

    // Handle return date (optional for one-way flights)
    if (returnDate) {
      url = url.replaceAll('{return}', encodeURIComponent(returnDate));
    } else {
      // Remove return date parameter if one-way
      // This is a simple cleanup - airlines may have different formats
      url = url.replace(/[&?]returnDate=[^&]*/g, '');
      url = url.replace(/[&?]return=[^&]*/g, '');
      url = url.replace(/[&?]inbound=[^&]*/g, '');
      url = url.replace(/[&?]retDate=[^&]*/g, '');
    }

    console.log(`[AirlineDeepLinks] Built URL for ${airlineCode}: ${url}`);
    return url;
  }

  /**
   * Build Kayak fallback URL
   * Used when airline-specific pattern doesn't exist
   * Kayak has reliable deep linking that actually works
   * @param {Object} params - URL parameters
   * @param {string} params.origin - Origin airport code
   * @param {string} params.destination - Destination airport code
   * @param {string} params.departure - Departure date (YYYY-MM-DD)
   * @param {string} [params.return] - Return date (YYYY-MM-DD)
   * @param {number} [params.passengers=1] - Number of passengers
   * @param {string} [params.cabin='economy'] - Cabin class
   * @returns {string} Kayak URL
   */
  buildGoogleFlightsFallback(params) {
    const { origin, destination, departure, return: returnDate, passengers = 1, cabin = 'economy' } = params;

    // Kayak URL format: https://www.kayak.com/flights/ORIGIN-DEST/YYYY-MM-DD/YYYY-MM-DD/PASSENGERS?sort=bestflight_a
    if (returnDate) {
      // Round trip
      return `https://www.kayak.com/flights/${origin}-${destination}/${departure}/${returnDate}/${passengers}adults?sort=bestflight_a&fs=bfc=${cabin}`;
    } else {
      // One-way
      return `https://www.kayak.com/flights/${origin}-${destination}/${departure}/${passengers}adults?sort=bestflight_a&fs=bfc=${cabin}`;
    }
  }

  /**
   * Build booking URL with fallback
   * Tries to build airline-specific URL, falls back to Kayak if not available
   * @param {Object} params - URL parameters
   * @param {string} params.airlineCode - IATA airline code
   * @param {string} params.origin - Origin airport code
   * @param {string} params.destination - Destination airport code
   * @param {string} params.departure - Departure date (YYYY-MM-DD)
   * @param {string} [params.return] - Return date (YYYY-MM-DD)
   * @param {number} [params.passengers=1] - Number of passengers
   * @param {string} [params.cabin='economy'] - Cabin class
   * @returns {Object} { url, source: 'airline' | 'kayak' }
   */
  buildBookingURL(params) {
    // Try airline-specific URL first
    const airlineUrl = this.buildAirlineLink(params);

    if (airlineUrl) {
      return {
        url: airlineUrl,
        source: 'airline',
        airline: params.airlineCode
      };
    }

    // Fallback to Kayak (more reliable than Google Flights)
    const kayakUrl = this.buildGoogleFlightsFallback(params);

    console.log(`[AirlineDeepLinks] Using Kayak fallback for ${params.airlineCode}`);

    return {
      url: kayakUrl,
      source: 'kayak',
      airline: params.airlineCode
    };
  }

  /**
   * Format SMS message with flight options and booking links
   * @param {Array} flights - Formatted flight data from Duffel
   * @param {Object} searchParams - Original search parameters
   * @returns {string} SMS message
   */
  formatSMSWithLinks(flights, searchParams) {
    if (!flights || flights.length === 0) {
      return 'Sorry, no flights found for your search. Try different dates or airports.';
    }

    const { origin, destination } = searchParams;
    // Support both 'departure' and 'departureDate' for flexibility
    const departure = searchParams.departure || searchParams.departureDate;

    // Format date as MM/DD
    const formatDate = (dateStr) => {
      if (!dateStr) return '';
      const [year, month, day] = dateStr.split('-');
      return `${month}/${day}`;
    };

    const dateDisplay = formatDate(departure);
    const header = `✈️ ${origin}→${destination} ${dateDisplay}\n\n`;

    const flightsList = flights.map(flight => {
      const { index, airline, price, currency, duration, stops } = flight;

      // Format price
      const priceDisplay = `$${Math.round(price)}`;

      // Format stops
      const stopsText = stops === 0 ? 'Direct' : `${stops} stop${stops > 1 ? 's' : ''}`;

      // Build booking URL
      const bookingData = this.buildBookingURL({
        airlineCode: airline.iata_code,
        origin,
        destination,
        departure: departure, // Use the normalized departure date
        return: searchParams.returnDate || searchParams.return,
        passengers: searchParams.passengers || 1,
        cabin: searchParams.cabin || 'economy'
      });

      const bookingCTA = bookingData.source === 'airline'
        ? `Book on ${airline.name}`
        : `Search on Kayak`;

      return `${index}. ${airline.name} ${priceDisplay}\n${duration.text} • ${stopsText}\n🔗 ${bookingCTA}: ${bookingData.url}`;
    }).join('\n\n');

    const footer = `\n\nYou'll complete your booking on the airline's official site.`;

    return `${header}${flightsList}${footer}`;
  }

  /**
   * Check if we have a deep link pattern for an airline
   * @param {string} airlineCode - IATA airline code
   * @returns {boolean} True if pattern exists
   */
  hasPattern(airlineCode) {
    return !!airlineDeepLinks[airlineCode];
  }

  /**
   * Get list of all supported airlines
   * @returns {Array<string>} Array of IATA codes
   */
  getSupportedAirlines() {
    return Object.keys(airlineDeepLinks);
  }

  /**
   * Get count of supported airlines
   * @returns {number} Number of airlines with deep link patterns
   */
  getSupportedCount() {
    return Object.keys(airlineDeepLinks).length;
  }
}

// Export as singleton instance
module.exports = new AirlineDeepLinksService();
