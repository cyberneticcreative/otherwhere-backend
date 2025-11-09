const axios = require('axios');

/**
 * Flight Link Builder & Validator
 *
 * Builds and validates flight search URLs across multiple providers
 * with automatic fallback and health checking.
 */

// In-memory cache for link validation results
const validationCache = new Map();
const VALIDATION_CACHE_TTL = 2 * 60 * 60 * 1000; // 2 hours

/**
 * Normalize trip data
 */
function normalizeTrip(trip) {
  return {
    origin: (trip.origin || '').toUpperCase().trim(),
    destination: (trip.destination || '').toUpperCase().trim(),
    departDate: trip.departDate,
    returnDate: trip.returnDate || null,
    adults: Math.max(1, trip.adults ?? 1),
    cabin: trip.cabin || 'e' // e = economy, b = business, p = premium, f = first
  };
}

/**
 * Build Kayak URL
 * @param {Object} trip - Normalized trip data
 * @param {string} tld - "com" or "ca"
 * @param {boolean} includeParams - Include query params (adults, cabin)
 */
function buildKayakUrl(trip, tld = 'com', includeParams = true) {
  const { origin, destination, departDate, returnDate, adults, cabin } = normalizeTrip(trip);

  if (!origin || !destination || !departDate) {
    throw new Error('Kayak URL requires origin, destination, and departDate');
  }

  // Build path
  let path = `/flights/${origin}-${destination}/${departDate}`;
  if (returnDate) {
    path += `/${returnDate}`;
  }

  // Build query params (only if not defaults)
  const params = [];
  if (includeParams) {
    if (adults > 1) {
      params.push(`adults=${adults}`);
    }
    if (cabin && cabin !== 'e') {
      params.push(`cabin=${cabin}`);
    }
  }

  const query = params.length > 0 ? '?' + params.join('&') : '';
  return `https://www.kayak.${tld}${path}${query}`;
}

/**
 * Build Google Flights URL
 */
function buildGoogleUrl(trip) {
  const { origin, destination, departDate, returnDate } = normalizeTrip(trip);

  if (!origin || !destination || !departDate) {
    throw new Error('Google URL requires origin, destination, and departDate');
  }

  const dates = returnDate ? `${departDate} ${returnDate}` : departDate;
  const query = encodeURIComponent(`flights ${origin} to ${destination} ${dates}`);

  return `https://www.google.com/travel/flights?q=${query}`;
}

/**
 * Build Kiwi URL
 */
function buildKiwiUrl(trip) {
  const { origin, destination, departDate, returnDate } = normalizeTrip(trip);

  if (!origin || !destination || !departDate) {
    throw new Error('Kiwi URL requires origin, destination, and departDate');
  }

  const ret = returnDate ? `_${returnDate}` : '';
  return `https://www.kiwi.com/en/search/results/${origin}/${destination}/${departDate}${ret}`;
}

/**
 * Build Skyscanner URL
 */
function buildSkyscannerUrl(trip) {
  const { origin, destination, departDate, returnDate } = normalizeTrip(trip);

  if (!origin || !destination || !departDate) {
    throw new Error('Skyscanner URL requires origin, destination, and departDate');
  }

  // Skyscanner uses YYMMDD format
  const formatDateSky = (dateStr) => {
    const date = new Date(dateStr);
    const yy = String(date.getFullYear()).slice(2);
    const mm = String(date.getMonth() + 1).padStart(2, '0');
    const dd = String(date.getDate()).padStart(2, '0');
    return `${yy}${mm}${dd}`;
  };

  const dep = formatDateSky(departDate);
  const ret = returnDate ? `/${formatDateSky(returnDate)}` : '';

  return `https://www.skyscanner.com/transport/flights/${origin}/${destination}/${dep}${ret}`;
}

/**
 * Validate a link by checking if it loads successfully
 * @param {string} url - URL to validate
 * @returns {Promise<{health: string, details?: string}>}
 */
async function validateLink(url) {
  // Check cache first
  const cached = validationCache.get(url);
  if (cached && (Date.now() - cached.timestamp) < VALIDATION_CACHE_TTL) {
    console.log(`[Links] Using cached validation for ${url.substring(0, 50)}...`);
    return { health: cached.health, details: cached.details };
  }

  console.log(`[Links] Validating: ${url}`);

  try {
    const response = await axios.get(url, {
      timeout: 8000,
      maxRedirects: 5,
      validateStatus: (status) => status >= 200 && status < 400,
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; OtherwhereBot/1.0)'
      }
    });

    const html = response.data || '';
    const htmlStr = typeof html === 'string' ? html : '';

    // Check for known error patterns (Kayak-specific)
    const errorPatterns = [
      "Something's not right",
      "Internal error. Contact KAYAK",
      "We're having trouble loading",
      "Page not found",
      "404"
    ];

    for (const pattern of errorPatterns) {
      if (htmlStr.includes(pattern)) {
        const result = { health: 'unhealthy', details: `Found error pattern: ${pattern}` };
        validationCache.set(url, { ...result, timestamp: Date.now() });
        console.log(`[Links] ❌ Unhealthy: ${pattern}`);
        return result;
      }
    }

    const result = { health: 'healthy', details: `HTTP ${response.status}` };
    validationCache.set(url, { ...result, timestamp: Date.now() });
    console.log(`[Links] ✅ Healthy: HTTP ${response.status}`);
    return result;

  } catch (error) {
    const result = {
      health: 'unhealthy',
      details: error.code || error.message || 'Request failed'
    };
    validationCache.set(url, { ...result, timestamp: Date.now() });
    console.log(`[Links] ❌ Unhealthy: ${result.details}`);
    return result;
  }
}

/**
 * Build a bundle of links with primary and fallback candidates
 * @param {Object} trip - Trip data
 * @param {string} userCountry - "US" or "CA"
 * @returns {Promise<{primary: Object, candidates: Array}>}
 */
async function buildLinkBundle(trip, userCountry = 'US') {
  const tld = userCountry === 'CA' ? 'ca' : 'com';

  console.log(`[Links] Building link bundle for ${trip.origin} → ${trip.destination}`);

  // Build all candidate URLs in priority order
  const candidates = [
    // Kayak variants (primary)
    { provider: 'kayak', url: buildKayakUrl(trip, tld, true), health: 'unknown', tld, params: true },
    { provider: 'kayak', url: buildKayakUrl(trip, tld, false), health: 'unknown', tld, params: false },

    // Fallback providers
    { provider: 'google', url: buildGoogleUrl(trip), health: 'unknown' },
    { provider: 'kiwi', url: buildKiwiUrl(trip), health: 'unknown' },
    { provider: 'skyscanner', url: buildSkyscannerUrl(trip), health: 'unknown' }
  ];

  // Add alternate TLD for Kayak if we haven't tried it
  const altTld = tld === 'com' ? 'ca' : 'com';
  candidates.splice(2, 0,
    { provider: 'kayak', url: buildKayakUrl(trip, altTld, true), health: 'unknown', tld: altTld, params: true }
  );

  // Validate candidates until we find a healthy one
  for (const candidate of candidates) {
    const validation = await validateLink(candidate.url);
    candidate.health = validation.health;
    candidate.details = validation.details;

    if (validation.health === 'healthy') {
      console.log(`[Links] ✅ Primary link selected: ${candidate.provider} (${candidate.url.substring(0, 60)}...)`);
      return {
        primary: candidate,
        candidates
      };
    }
  }

  // If no healthy link found, use first Kayak URL as primary
  console.log(`[Links] ⚠️ No healthy links found, using first candidate as primary`);
  return {
    primary: candidates[0],
    candidates
  };
}

/**
 * Clear validation cache (useful for testing)
 */
function clearValidationCache() {
  validationCache.clear();
  console.log('[Links] Validation cache cleared');
}

/**
 * Get cache statistics
 */
function getCacheStats() {
  const now = Date.now();
  let valid = 0;
  let expired = 0;

  for (const [url, entry] of validationCache.entries()) {
    if ((now - entry.timestamp) < VALIDATION_CACHE_TTL) {
      valid++;
    } else {
      expired++;
    }
  }

  return {
    total: validationCache.size,
    valid,
    expired,
    ttl: VALIDATION_CACHE_TTL
  };
}

module.exports = {
  buildKayakUrl,
  buildGoogleUrl,
  buildKiwiUrl,
  buildSkyscannerUrl,
  validateLink,
  buildLinkBundle,
  normalizeTrip,
  clearValidationCache,
  getCacheStats
};
