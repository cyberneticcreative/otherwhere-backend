/**
 * Deep Links Builder Utility
 *
 * Builds airline-specific booking deep links from flight search parameters.
 * Supports URL encoding, cabin class mapping, and Google Flights fallback.
 */

const { AIRLINE_DEEPLINKS, CABIN_CLASS_MAPPING } = require('./airlineMapping');

/**
 * Build airline deep link from search parameters
 *
 * @param {string} airlineCode - IATA airline code (e.g., "AA", "DL")
 * @param {Object} params - Search parameters
 * @param {string} params.origin - Origin airport code
 * @param {string} params.destination - Destination airport code
 * @param {string} params.departure - Departure date (YYYY-MM-DD)
 * @param {string} params.returnDate - Return date (YYYY-MM-DD), optional for one-way
 * @param {number} params.passengers - Number of passengers
 * @param {string} params.cabin - Cabin class (economy, premium_economy, business, first)
 * @returns {string|null} - Built deep link URL or null if airline not supported
 */
function buildAirlineDeeplink(airlineCode, params) {
  const airline = AIRLINE_DEEPLINKS[airlineCode];

  if (!airline) {
    return null;
  }

  let url = airline.url;

  // Replace standard placeholders
  url = url
    .replaceAll('{origin}', encodeURIComponent(params.origin.toUpperCase()))
    .replaceAll('{destination}', encodeURIComponent(params.destination.toUpperCase()))
    .replaceAll('{departure}', params.departure)
    .replaceAll('{passengers}', params.passengers);

  // Handle return date (optional for one-way trips)
  if (params.returnDate) {
    url = url.replaceAll('{return}', params.returnDate);
  } else {
    // Remove return date parameter if one-way
    url = url.replace(/[&?]returnDate=[^&]*/, '');
    url = url.replace(/[&?]retDate=[^&]*/, '');
    url = url.replace(/[&?]inbound=[^&]*/, '');
    url = url.replace(/[&?]returning=[^&]*/, '');
  }

  // Handle cabin class if supported
  if (params.cabin && airline.supportsCabin && airline.cabinParam) {
    const cabinValue = mapCabinClass(airlineCode, params.cabin);
    url += airline.cabinParam.replace('{cabin}', encodeURIComponent(cabinValue));
  }

  return url;
}

/**
 * Map cabin class to airline-specific format
 *
 * @param {string} airlineCode - IATA airline code
 * @param {string} cabin - Standard cabin class
 * @returns {string} - Airline-specific cabin class value
 */
function mapCabinClass(airlineCode, cabin) {
  const mapping = CABIN_CLASS_MAPPING[cabin];

  if (!mapping) {
    return 'economy'; // Default fallback
  }

  // Check for airline-specific mapping
  const airlineName = AIRLINE_DEEPLINKS[airlineCode]?.name.toLowerCase();

  if (airlineName && airlineName.includes('delta')) {
    return mapping.delta || mapping.standard;
  }
  if (airlineName && airlineName.includes('united')) {
    return mapping.united || mapping.standard;
  }
  if (airlineName && airlineName.includes('american')) {
    return mapping.aa || mapping.standard;
  }
  if (airlineName && airlineName.includes('emirates')) {
    return mapping.emirates || mapping.standard;
  }

  return mapping.standard;
}

/**
 * Build Google Flights fallback URL
 *
 * Used when airline-specific deep link is not available
 *
 * @param {Object} params - Search parameters
 * @param {string} params.origin - Origin airport code
 * @param {string} params.destination - Destination airport code
 * @param {string} params.departure - Departure date (YYYY-MM-DD)
 * @param {string} params.returnDate - Return date (YYYY-MM-DD), optional
 * @param {number} params.passengers - Number of passengers
 * @param {string} params.cabin - Cabin class
 * @returns {string} - Google Flights URL
 */
function buildGoogleFlightsUrl(params) {
  const { origin, destination, departure, returnDate, passengers, cabin } = params;

  let url = 'https://www.google.com/flights?hl=en';

  if (returnDate) {
    // Round trip
    url += `#flt=${origin.toUpperCase()}.${destination.toUpperCase()}.${departure}*${destination.toUpperCase()}.${origin.toUpperCase()}.${returnDate}`;
  } else {
    // One way
    url += `#flt=${origin.toUpperCase()}.${destination.toUpperCase()}.${departure}`;
  }

  // Add passengers
  if (passengers > 1) {
    url += `;p=${passengers}`;
  }

  // Add cabin class
  if (cabin && cabin !== 'economy') {
    const cabinCode = {
      'premium_economy': 'p',
      'business': 'b',
      'first': 'f'
    }[cabin];
    if (cabinCode) {
      url += `;c=${cabinCode}`;
    }
  }

  return url;
}

/**
 * Get airline information by IATA code
 *
 * @param {string} airlineCode - IATA airline code
 * @returns {Object|null} - Airline information or null
 */
function getAirlineInfo(airlineCode) {
  const airline = AIRLINE_DEEPLINKS[airlineCode];

  if (!airline) {
    return null;
  }

  return {
    code: airlineCode,
    name: airline.name,
    supportsCabin: airline.supportsCabin,
    hasDeeplink: true
  };
}

/**
 * Check if airline supports deep linking
 *
 * @param {string} airlineCode - IATA airline code
 * @returns {boolean} - True if supported
 */
function isAirlineSupported(airlineCode) {
  return airlineCode in AIRLINE_DEEPLINKS;
}

/**
 * Get all supported airline codes
 *
 * @returns {string[]} - Array of supported IATA codes
 */
function getSupportedAirlines() {
  return Object.keys(AIRLINE_DEEPLINKS);
}

/**
 * Build deep link with fallback to Google Flights
 *
 * @param {string} airlineCode - IATA airline code
 * @param {Object} params - Search parameters
 * @returns {Object} - { url, provider } where provider is 'airline' or 'google'
 */
function buildDeeplinkWithFallback(airlineCode, params) {
  const airlineUrl = buildAirlineDeeplink(airlineCode, params);

  if (airlineUrl) {
    return {
      url: airlineUrl,
      provider: 'airline',
      airlineName: AIRLINE_DEEPLINKS[airlineCode].name
    };
  }

  return {
    url: buildGoogleFlightsUrl(params),
    provider: 'google',
    airlineName: null
  };
}

/**
 * Validate search parameters
 *
 * @param {Object} params - Search parameters
 * @returns {Object} - { valid: boolean, errors: string[] }
 */
function validateSearchParams(params) {
  const errors = [];

  if (!params.origin || params.origin.length !== 3) {
    errors.push('Invalid origin airport code');
  }
  if (!params.destination || params.destination.length !== 3) {
    errors.push('Invalid destination airport code');
  }
  if (!params.departure || !/^\d{4}-\d{2}-\d{2}$/.test(params.departure)) {
    errors.push('Invalid departure date format (expected YYYY-MM-DD)');
  }
  if (params.returnDate && !/^\d{4}-\d{2}-\d{2}$/.test(params.returnDate)) {
    errors.push('Invalid return date format (expected YYYY-MM-DD)');
  }
  if (!params.passengers || params.passengers < 1 || params.passengers > 9) {
    errors.push('Invalid number of passengers (1-9)');
  }
  if (params.cabin && !['economy', 'premium_economy', 'business', 'first'].includes(params.cabin)) {
    errors.push('Invalid cabin class');
  }

  return {
    valid: errors.length === 0,
    errors
  };
}

/**
 * Format deep link for SMS message
 *
 * @param {Object} linkData - Link data from buildDeeplinkWithFallback
 * @param {Object} flightInfo - Flight details (price, duration, etc.)
 * @returns {string} - Formatted message
 */
function formatDeeplinkSMS(linkData, flightInfo = {}) {
  const { provider, airlineName, url } = linkData;
  const { price, currency, duration } = flightInfo;

  let message = '';

  if (provider === 'airline') {
    message = `✈️ Book on ${airlineName}\n`;
  } else {
    message = `✈️ View on Google Flights\n`;
  }

  if (price && currency) {
    message += `Price: ${currency} ${price}\n`;
  }
  if (duration) {
    message += `Duration: ${duration}\n`;
  }

  message += `\n${url}`;

  return message;
}

module.exports = {
  buildAirlineDeeplink,
  buildGoogleFlightsUrl,
  buildDeeplinkWithFallback,
  getAirlineInfo,
  isAirlineSupported,
  getSupportedAirlines,
  validateSearchParams,
  formatDeeplinkSMS,
  mapCabinClass
};
