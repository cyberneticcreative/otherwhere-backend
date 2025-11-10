/**
 * Flight Link Providers
 *
 * Builds URLs for different flight booking providers:
 * - Aviasales White-Label (primary for commissions)
 * - Aviasales Deep Link (fallback)
 * - Kayak (fallback)
 */

const AVIASALES_MARKER = process.env.AVIASALES_MARKER;
const AVIASALES_WL_HOST = process.env.AVIASALES_WL_HOST || 'book.otherwhere.world';

/**
 * Map cabin class codes to Aviasales trip_class values
 * @param {string} cls - Cabin class code (e|p|b|f)
 * @returns {string} Aviasales trip_class value
 */
function mapCabinClass(cls) {
  const classMap = {
    'e': '0',  // Economy
    'p': '1',  // Premium Economy
    'b': '2',  // Business
    'f': '2'   // First (Aviasales groups First with Business)
  };
  return classMap[cls?.toLowerCase()] || '0';
}

/**
 * Build Aviasales White-Label URL (primary booking method)
 *
 * @param {Object} params - Search parameters
 * @param {string} params.o - Origin IATA code
 * @param {string} params.d - Destination IATA code
 * @param {string} params.dd - Departure date (YYYY-MM-DD)
 * @param {string} params.rd - Return date (YYYY-MM-DD) - optional for one-way
 * @param {number} params.ad - Adults (≥1)
 * @param {number} params.ch - Children (≥0)
 * @param {number} params.in - Infants (≥0)
 * @param {string} params.cls - Cabin class (e|p|b|f)
 * @param {string} params.cur - Currency (USD, CAD, EUR, etc.)
 * @param {string} params.sid - Session ID for tracking (subid)
 * @returns {string} White-label URL
 */
function buildWhiteLabelURL(params) {
  const {
    o,           // origin
    d,           // destination
    dd,          // depart date
    rd,          // return date (optional)
    ad = 1,      // adults
    ch = 0,      // children
    in: infants = 0,  // infants (renamed to avoid 'in' keyword)
    cls = 'e',   // class
    cur = 'USD', // currency
    sid          // session id
  } = params;

  // Base URL to white-label host
  const baseUrl = `https://${AVIASALES_WL_HOST}`;

  // Build search path
  // Format: /origin{depart_date}destination{return_date}
  // Example: /YYZ0212LIS0220 for YYZ→LIS departing Feb 12, returning Feb 20
  const departMonth = dd.substring(5, 7);
  const departDay = dd.substring(8, 10);

  let searchPath = `/${o}${departMonth}${departDay}${d}`;

  // Add return date if provided (round-trip)
  if (rd) {
    const returnMonth = rd.substring(5, 7);
    const returnDay = rd.substring(8, 10);
    searchPath += `${returnMonth}${returnDay}`;
  }

  // Build query parameters
  const queryParams = new URLSearchParams();

  // Passenger counts
  queryParams.set('adults', ad.toString());
  if (ch > 0) queryParams.set('children', ch.toString());
  if (infants > 0) queryParams.set('infants', infants.toString());

  // Trip class
  queryParams.set('trip_class', mapCabinClass(cls));

  // Currency
  queryParams.set('currency', cur.toUpperCase());

  // Attribution (required for commission tracking)
  if (AVIASALES_MARKER) {
    queryParams.set('marker', AVIASALES_MARKER);
  }

  // SubID for detailed tracking (session/campaign/source)
  if (sid) {
    queryParams.set('subid', `ow_${sid}`);
  }

  return `${baseUrl}${searchPath}?${queryParams.toString()}`;
}

/**
 * Build Aviasales direct deep link (fallback)
 * Uses aviasales.com with affiliate marker
 *
 * @param {Object} params - Search parameters (same as buildWhiteLabelURL)
 * @returns {string} Aviasales deep link URL
 */
function buildAviasalesFallback(params) {
  const {
    o,
    d,
    dd,
    rd,
    ad = 1,
    ch = 0,
    in: infants = 0,
    cls = 'e',
    cur = 'USD',
    sid
  } = params;

  // Aviasales search URL format
  const departMonth = dd.substring(5, 7);
  const departDay = dd.substring(8, 10);

  let searchPath = `/search/${o}${departMonth}${departDay}${d}`;

  if (rd) {
    const returnMonth = rd.substring(5, 7);
    const returnDay = rd.substring(8, 10);
    searchPath += `${returnMonth}${returnDay}`;
  }

  const queryParams = new URLSearchParams();
  queryParams.set('adults', ad.toString());
  if (ch > 0) queryParams.set('children', ch.toString());
  if (infants > 0) queryParams.set('infants', infants.toString());
  queryParams.set('trip_class', mapCabinClass(cls));
  queryParams.set('currency', cur.toUpperCase());

  if (AVIASALES_MARKER) {
    queryParams.set('marker', AVIASALES_MARKER);
  }
  if (sid) {
    queryParams.set('subid', `ow_${sid}`);
  }

  return `https://www.aviasales.com${searchPath}?${queryParams.toString()}`;
}

/**
 * Build Kayak deep link (secondary fallback, no affiliate)
 *
 * @param {Object} params - Search parameters
 * @returns {string} Kayak URL
 */
function buildKayakFallback(params) {
  const {
    o,
    d,
    dd,
    rd,
    ad = 1,
    ch = 0,
    in: infants = 0,
    cls = 'e'
  } = params;

  const totalPax = ad + ch + infants;

  // Kayak cabin class mapping
  const kayakClass = {
    'e': 'e',  // economy
    'p': 'p',  // premium
    'b': 'b',  // business
    'f': 'f'   // first
  }[cls.toLowerCase()] || 'e';

  // Build Kayak URL
  let url = `https://www.kayak.com/flights/${o}-${d}/${dd}`;

  if (rd) {
    url += `/${rd}`;
  }

  const queryParams = new URLSearchParams();
  if (totalPax > 1) queryParams.set('passengers', totalPax.toString());
  if (kayakClass !== 'e') queryParams.set('sort', kayakClass);
  queryParams.set('fs', 'bfc=0'); // Best flight combo

  // Attribution (Kayak doesn't have official affiliate program, but we can add UTM)
  queryParams.set('utm_source', 'otherwhere');
  queryParams.set('utm_medium', 'sms');

  if (queryParams.toString()) {
    url += `?${queryParams.toString()}`;
  }

  return url;
}

/**
 * Select the best provider based on white-label health
 *
 * @param {boolean} isWhiteLabelHealthy - Whether white-label is responding
 * @returns {string} Provider name ('whitelabel', 'aviasales', or 'kayak')
 */
function selectProvider(isWhiteLabelHealthy) {
  if (isWhiteLabelHealthy) {
    return 'whitelabel';
  }

  // If white-label is down, prefer Aviasales direct (still has affiliate tracking)
  if (AVIASALES_MARKER) {
    return 'aviasales';
  }

  // Last resort: Kayak (no affiliate, but reliable)
  return 'kayak';
}

/**
 * Build the appropriate URL based on provider selection
 *
 * @param {Object} params - Search parameters
 * @param {string} provider - Provider name ('whitelabel', 'aviasales', 'kayak')
 * @returns {string} URL for the selected provider
 */
function buildProviderURL(params, provider) {
  switch (provider) {
    case 'whitelabel':
      return buildWhiteLabelURL(params);
    case 'aviasales':
      return buildAviasalesFallback(params);
    case 'kayak':
      return buildKayakFallback(params);
    default:
      throw new Error(`Unknown provider: ${provider}`);
  }
}

/**
 * Validate search parameters
 *
 * @param {Object} params - Search parameters
 * @returns {Object} { valid: boolean, errors: string[] }
 */
function validateSearchParams(params) {
  const errors = [];

  // Required fields
  if (!params.o || !/^[A-Z]{3}$/.test(params.o)) {
    errors.push('Invalid origin airport code (must be 3-letter IATA code)');
  }

  if (!params.d || !/^[A-Z]{3}$/.test(params.d)) {
    errors.push('Invalid destination airport code (must be 3-letter IATA code)');
  }

  if (!params.dd || !/^\d{4}-\d{2}-\d{2}$/.test(params.dd)) {
    errors.push('Invalid departure date (must be YYYY-MM-DD)');
  }

  // Validate departure date is in the future
  if (params.dd) {
    const departDate = new Date(params.dd);
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    if (departDate < today) {
      errors.push('Departure date must be in the future');
    }
  }

  // Optional return date validation
  if (params.rd) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(params.rd)) {
      errors.push('Invalid return date (must be YYYY-MM-DD)');
    }

    // Return date must be after departure
    if (params.dd && params.rd) {
      const depart = new Date(params.dd);
      const returnDate = new Date(params.rd);

      if (returnDate <= depart) {
        errors.push('Return date must be after departure date');
      }
    }
  }

  // Passenger validations
  const adults = parseInt(params.ad) || 1;
  const children = parseInt(params.ch) || 0;
  const infants = parseInt(params.in) || 0;

  if (adults < 1) {
    errors.push('At least 1 adult passenger required');
  }

  if (children < 0 || infants < 0) {
    errors.push('Passenger counts cannot be negative');
  }

  if (infants > adults) {
    errors.push('Number of infants cannot exceed number of adults');
  }

  // Cabin class validation
  if (params.cls && !['e', 'p', 'b', 'f'].includes(params.cls.toLowerCase())) {
    errors.push('Invalid cabin class (must be e, p, b, or f)');
  }

  // Currency validation (basic - 3-letter code)
  if (params.cur && !/^[A-Z]{3}$/.test(params.cur.toUpperCase())) {
    errors.push('Invalid currency code (must be 3-letter ISO code)');
  }

  return {
    valid: errors.length === 0,
    errors
  };
}

/**
 * Normalize search parameters
 * Ensures all codes are uppercase, adds defaults
 *
 * @param {Object} params - Raw query parameters
 * @returns {Object} Normalized parameters
 */
function normalizeParams(params) {
  return {
    o: params.o?.toUpperCase(),
    d: params.d?.toUpperCase(),
    dd: params.dd,
    rd: params.rd || null,
    ad: parseInt(params.ad) || 1,
    ch: parseInt(params.ch) || 0,
    in: parseInt(params.in) || 0,
    cls: params.cls?.toLowerCase() || 'e',
    cur: params.cur?.toUpperCase() || 'USD',
    sid: params.sid || null
  };
}

module.exports = {
  buildWhiteLabelURL,
  buildAviasalesFallback,
  buildKayakFallback,
  selectProvider,
  buildProviderURL,
  validateSearchParams,
  normalizeParams,
  mapCabinClass
};
