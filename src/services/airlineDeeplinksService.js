/**
 * Airline Deep Links Service
 *
 * Combines Duffel flight search with airline-specific deep links.
 * Returns curated flight results with direct booking URLs.
 */

const duffelFlightSearchService = require('./duffelFlightSearchService');
const {
  buildDeeplinkWithFallback,
  getAirlineInfo,
  isAirlineSupported,
  getSupportedAirlines,
  validateSearchParams
} = require('../utils/deeplinksBuilder');

/**
 * Search flights and return results with airline deep links
 *
 * @param {Object} searchParams - Flight search parameters
 * @param {string} searchParams.origin - Origin airport code
 * @param {string} searchParams.destination - Destination airport code
 * @param {string} searchParams.departure - Departure date (YYYY-MM-DD)
 * @param {string} searchParams.returnDate - Return date (YYYY-MM-DD), optional
 * @param {number} searchParams.passengers - Number of passengers
 * @param {string} searchParams.cabin - Cabin class
 * @param {number} limit - Maximum number of results (default: 3)
 * @returns {Promise<Object>} - Search results with deep links
 */
async function searchFlightsWithDeeplinks(searchParams, limit = 3) {
  // Validate parameters
  const validation = validateSearchParams(searchParams);
  if (!validation.valid) {
    throw new Error(`Invalid search parameters: ${validation.errors.join(', ')}`);
  }

  // Search flights using Duffel
  const offers = await duffelFlightSearchService.searchFlights(searchParams, limit);

  console.log(`Found ${offers.length} flight offers, building deep links...`);

  // Build deep links for each offer
  const results = offers.map(offer => {
    const airlineCode = offer.airline.code;
    const linkData = buildDeeplinkWithFallback(airlineCode, searchParams);

    return {
      offerId: offer.offerId,
      airline: {
        code: airlineCode,
        name: offer.airline.name,
        logo: offer.airline.logo,
        supportsDeeplink: isAirlineSupported(airlineCode)
      },
      price: {
        amount: offer.totalAmount,
        currency: offer.currency,
        formatted: `${offer.currency} ${offer.totalAmount.toFixed(2)}`
      },
      duration: {
        total: offer.totalDuration,
        formatted: offer.durationFormatted
      },
      legs: offer.legs.map(leg => ({
        departure: {
          airport: leg.departure.airport,
          city: leg.departure.city,
          time: leg.departure.time,
          timeFormatted: leg.departure.timeFormatted
        },
        arrival: {
          airport: leg.arrival.airport,
          city: leg.arrival.city,
          time: leg.arrival.time,
          timeFormatted: leg.arrival.timeFormatted
        },
        stops: leg.stops,
        duration: leg.durationFormatted
      })),
      bookingLink: {
        url: linkData.url,
        provider: linkData.provider, // 'airline' or 'google'
        ctaText: linkData.provider === 'airline'
          ? `Book on ${offer.airline.name}`
          : 'View on Google Flights'
      }
    };
  });

  // Build response
  return {
    searchParams: {
      origin: searchParams.origin.toUpperCase(),
      destination: searchParams.destination.toUpperCase(),
      departure: searchParams.departure,
      returnDate: searchParams.returnDate,
      passengers: searchParams.passengers,
      cabin: searchParams.cabin || 'economy'
    },
    results,
    meta: {
      totalResults: results.length,
      airlinesWithDeeplinks: results.filter(r => r.airline.supportsDeeplink).length,
      currency: results[0]?.price.currency || 'USD',
      searchedAt: new Date().toISOString()
    }
  };
}

/**
 * Get the best flight offer with deep link
 *
 * @param {Object} searchParams - Flight search parameters
 * @returns {Promise<Object>} - Best offer with deep link
 */
async function getBestOffer(searchParams) {
  const response = await searchFlightsWithDeeplinks(searchParams, 1);
  return response.results[0] || null;
}

/**
 * Format flight results as SMS message
 *
 * @param {Object} searchResults - Results from searchFlightsWithDeeplinks
 * @param {boolean} includeLinks - Whether to include booking links (default: true)
 * @returns {string} - Formatted SMS message
 */
function formatFlightResultsSMS(searchResults, includeLinks = true) {
  const { searchParams, results } = searchResults;

  if (!results || results.length === 0) {
    return `No flights found for ${searchParams.origin} → ${searchParams.destination} on ${searchParams.departure}`;
  }

  let message = `✈️ Flights ${searchParams.origin} → ${searchParams.destination}\n`;
  message += `${duffelFlightSearchService.formatDate(searchParams.departure)}`;

  if (searchParams.returnDate) {
    message += ` - ${duffelFlightSearchService.formatDate(searchParams.returnDate)}`;
  }

  message += `\n\n`;

  results.forEach((result, index) => {
    message += `${index + 1}. ${result.airline.name}\n`;
    message += `   ${result.price.formatted} • ${result.duration.formatted}`;

    if (result.legs[0].stops > 0) {
      message += ` • ${result.legs[0].stops} stop${result.legs[0].stops > 1 ? 's' : ''}`;
    } else {
      message += ` • Nonstop`;
    }

    message += `\n`;

    // Departure details
    message += `   ${result.legs[0].departure.timeFormatted} ${result.legs[0].departure.airport} → `;
    message += `${result.legs[0].arrival.timeFormatted} ${result.legs[0].arrival.airport}\n`;

    // Add booking link if requested
    if (includeLinks) {
      message += `   ${result.bookingLink.ctaText}: ${result.bookingLink.url}\n`;
    }

    message += `\n`;
  });

  // Add disclaimer
  message += `💡 Complete your booking directly on the airline's website.`;

  return message;
}

/**
 * Format single flight as card for display
 *
 * @param {Object} flightResult - Single flight result
 * @returns {Object} - Formatted card data
 */
function formatFlightCard(flightResult) {
  const { airline, price, duration, legs, bookingLink } = flightResult;

  return {
    title: airline.name,
    logo: airline.logo,
    price: price.formatted,
    duration: duration.formatted,
    stops: legs[0].stops === 0 ? 'Nonstop' : `${legs[0].stops} stop${legs[0].stops > 1 ? 's' : ''}`,
    departure: {
      time: legs[0].departure.timeFormatted,
      airport: legs[0].departure.airport,
      city: legs[0].departure.city
    },
    arrival: {
      time: legs[0].arrival.timeFormatted,
      airport: legs[0].arrival.airport,
      city: legs[0].arrival.city
    },
    cta: {
      text: bookingLink.ctaText,
      url: bookingLink.url,
      provider: bookingLink.provider
    }
  };
}

/**
 * Get list of all supported airlines
 *
 * @returns {Object[]} - Array of airline information
 */
function listSupportedAirlines() {
  const codes = getSupportedAirlines();

  return codes.map(code => getAirlineInfo(code)).filter(Boolean);
}

/**
 * Check if a specific airline is supported
 *
 * @param {string} airlineCode - IATA airline code
 * @returns {Object} - { supported: boolean, airlineInfo: Object }
 */
function checkAirlineSupport(airlineCode) {
  const supported = isAirlineSupported(airlineCode);
  const airlineInfo = supported ? getAirlineInfo(airlineCode) : null;

  return { supported, airlineInfo };
}

/**
 * Get flight offer by Duffel offer ID
 *
 * This would typically fetch from a cache or database where offers are temporarily stored
 * For now, it's a placeholder for future implementation
 *
 * @param {string} offerId - Duffel offer ID
 * @returns {Promise<Object>} - Offer details
 */
async function getOfferById(offerId) {
  // TODO: Implement offer retrieval from cache/database
  // For now, return null
  console.warn(`getOfferById not yet implemented for offer: ${offerId}`);
  return null;
}

/**
 * Track deep link click for analytics
 *
 * @param {Object} clickData - Click tracking data
 * @param {string} clickData.offerId - Duffel offer ID
 * @param {string} clickData.airlineCode - IATA airline code
 * @param {string} clickData.provider - 'airline' or 'google'
 * @param {string} clickData.userId - User identifier (phone number, session ID, etc.)
 * @returns {Promise<void>}
 */
async function trackDeeplinkClick(clickData) {
  // TODO: Implement analytics tracking
  // Could store in database or send to analytics service
  console.log('Deep link clicked:', {
    timestamp: new Date().toISOString(),
    ...clickData
  });
}

module.exports = {
  searchFlightsWithDeeplinks,
  getBestOffer,
  formatFlightResultsSMS,
  formatFlightCard,
  listSupportedAirlines,
  checkAirlineSupport,
  getOfferById,
  trackDeeplinkClick
};
