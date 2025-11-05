const axios = require('axios');
const dayjs = require('dayjs');

const RAPIDAPI_KEY = process.env.RAPIDAPI_KEY_AIRBNB || process.env.RAPIDAPI_KEY;
const RAPIDAPI_HOST = 'airbnb19.p.rapidapi.com';
const BASE_URL = `https://${RAPIDAPI_HOST}/api/v1`;
const BASE_URL_V2 = `https://${RAPIDAPI_HOST}/api/v2`;

/**
 * Airbnb API Service via RapidAPI
 *
 * Provides:
 * - Location/destination search (city names → destination IDs)
 * - Property search with filters
 * - Property details and availability checking
 * - SMS-formatted results
 * - Aggressive caching and rate limiting for unofficial API
 *
 * Note: This uses an unofficial Airbnb API via RapidAPI.
 * Expect aggressive rate limiting and potential format changes.
 */
class AirbnbService {
  constructor() {
    this.defaultHeaders = {
      'x-rapidapi-host': RAPIDAPI_HOST,
      'x-rapidapi-key': RAPIDAPI_KEY
    };

    // In-memory caches
    this.destinationCache = new Map();
    this.propertyCache = new Map();
    this.DESTINATION_CACHE_TTL = 24 * 60 * 60 * 1000; // 24 hours
    this.PROPERTY_CACHE_TTL = 30 * 60 * 1000; // 30 minutes (availability changes fast)

    // Rate limiting - more aggressive than flights due to unofficial API
    this.lastRequestTime = 0;
    this.MIN_REQUEST_INTERVAL = 2500; // 2.5 seconds between requests (increased from 1.5s to avoid 429)

    // Common destinations fallback (major cities)
    this.commonDestinations = {
      'new york': { id: 'ChIJOwg_06VPwokRYv534QaPC8g', name: 'New York, NY', type: 'CITY' },
      'los angeles': { id: 'ChIJE9on3F3HwoAR9AhGJW_fL-I', name: 'Los Angeles, CA', type: 'CITY' },
      'chicago': { id: 'ChIJ7cv00DwsDogRAMDACa2m4K8', name: 'Chicago, IL', type: 'CITY' },
      'san francisco': { id: 'ChIJIQBpAG2ahYAR_6128GcTUEo', name: 'San Francisco, CA', type: 'CITY' },
      'miami': { id: 'ChIJEcHIDqKw2YgRZU-t3XHylv8', name: 'Miami, FL', type: 'CITY' },
      'seattle': { id: 'ChIJVTPokywQkFQRmtVEaUZlJRA', name: 'Seattle, WA', type: 'CITY' },
      'austin': { id: 'ChIJLwPMoJm1RIYRetVp1EtGm10', name: 'Austin, TX', type: 'CITY' },
      'boston': { id: 'ChIJGzE9DS1l44kRoOhiASS_fHg', name: 'Boston, MA', type: 'CITY' },
      'denver': { id: 'ChIJzxcfI6qAa4cR1jaKJ_j0jhE', name: 'Denver, CO', type: 'CITY' },
      'portland': { id: 'ChIJJ3SpfQsLlVQRkYXR9ua5Nhw', name: 'Portland, OR', type: 'CITY' },
      'toronto': { id: 'ChIJpTvG15DL1IkRd8S0KlBVNTI', name: 'Toronto, ON', type: 'CITY' },
      'vancouver': { id: 'ChIJs0-pQ_FzhlQRi_OBm-qWkbs', name: 'Vancouver, BC', type: 'CITY' },
      'london': { id: 'ChIJdd4hrwug2EcRmSrV3Vo6llI', name: 'London, UK', type: 'CITY' },
      'paris': { id: 'ChIJD7fiBh9u5kcRYJSMaMOCCwQ', name: 'Paris, France', type: 'CITY' },
      'tokyo': { id: 'ChIJXSModoWLGGARILWiCfeu2M0', name: 'Tokyo, Japan', type: 'CITY' }
    };

    // Minimum quality filters
    this.MIN_RATING = 4.0;
    this.MIN_REVIEW_COUNT = 0; // Allow new listings (changed from 3)
  }

  /**
   * Add delay between requests to avoid rate limiting
   */
  async rateLimitDelay() {
    const now = Date.now();
    const timeSinceLastRequest = now - this.lastRequestTime;

    if (timeSinceLastRequest < this.MIN_REQUEST_INTERVAL) {
      const delay = this.MIN_REQUEST_INTERVAL - timeSinceLastRequest;
      console.log(`[Airbnb] Rate limit delay: ${delay}ms`);
      await new Promise(resolve => setTimeout(resolve, delay));
    }

    this.lastRequestTime = Date.now();
  }

  /**
   * Search for destinations (cities/locations) by name
   * Converts user input like "Austin" into Airbnb destination IDs
   *
   * @param {string} query - Location name (e.g., "Austin", "Paris")
   * @param {string} country - Country code (optional, e.g., "USA", "France")
   * @returns {Promise<Array>} Array of destination options with IDs and names
   */
  async searchDestination(query, country = 'USA') {
    if (!this.isConfigured()) {
      throw new Error('Airbnb API not configured - missing RAPIDAPI_KEY');
    }

    // Clean up query
    const cleanQuery = query.trim();

    // Check cache first
    const cacheKey = `${cleanQuery.toLowerCase()}_${country}`;
    const cached = this.destinationCache.get(cacheKey);

    if (cached && (Date.now() - cached.timestamp < this.DESTINATION_CACHE_TTL)) {
      console.log(`[Airbnb] Using cached destination for: ${cleanQuery}`);
      return cached.data;
    }

    // Check hardcoded fallback first
    const fallbackKey = cleanQuery.toLowerCase();
    const fallbackDestination = this.commonDestinations[fallbackKey];
    if (fallbackDestination) {
      console.log(`[Airbnb] Using fallback destination for: ${cleanQuery}`);
      const result = [fallbackDestination];
      // Cache the fallback too
      this.destinationCache.set(cacheKey, {
        data: result,
        timestamp: Date.now()
      });
      return result;
    }

    // Try API with retry logic
    const maxRetries = 2;
    let lastError;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        console.log(`[Airbnb] Searching destination: ${cleanQuery} (attempt ${attempt}/${maxRetries})`);

        // Add rate limiting delay
        await this.rateLimitDelay();

        const response = await axios.get(`${BASE_URL}/searchDestination`, {
          params: {
            query: cleanQuery,
            country: country
          },
          headers: this.defaultHeaders,
          timeout: 20000
        });

        const rawResults = response.data?.data || response.data || [];

        console.log(`[Airbnb] Found ${rawResults.length} destinations for "${query}"`);

        // Debug: Log first result structure if available
        if (rawResults.length > 0) {
          console.log(`[Airbnb] Sample destination data:`, JSON.stringify(rawResults[0], null, 2));
        }

        // Format results
        const destinations = rawResults.map(dest => ({
          id: dest.id || dest.place_id || dest.placeId,
          name: dest.name || dest.title || dest.display_name,
          type: dest.type || 'CITY',
          subtitle: dest.subtitle,
          country: dest.country
        }));

        // Cache the result
        this.destinationCache.set(cacheKey, {
          data: destinations,
          timestamp: Date.now()
        });

        console.log(`[Airbnb] ✅ Successfully retrieved destinations on attempt ${attempt}`);
        return destinations;

      } catch (error) {
        lastError = error;
        console.error(`[Airbnb] Destination search error (attempt ${attempt}/${maxRetries}):`, error.message);

        // Don't retry on rate limit - fail immediately with helpful message
        if (error.response?.status === 429) {
          throw new Error('Airbnb search rate limit exceeded. Please try again in a few minutes.');
        }

        // If not the last attempt, wait before retrying
        if (attempt < maxRetries) {
          const retryDelay = 2000; // 2 seconds
          console.log(`[Airbnb] Retrying in ${retryDelay}ms...`);
          await new Promise(resolve => setTimeout(resolve, retryDelay));
        }
      }
    }

    // All retries failed - throw the last error
    console.error(`[Airbnb] All ${maxRetries} attempts failed for destination search: ${cleanQuery}`);
    throw new Error(`Destination search failed after ${maxRetries} attempts: ${lastError?.message || 'Unknown error'}`);
  }

  /**
   * Search for properties/accommodations
   *
   * @param {Object} params - Search parameters
   * @param {string} params.destinationId - Destination ID from searchDestination()
   * @param {string} params.checkIn - Check-in date (YYYY-MM-DD)
   * @param {string} params.checkOut - Check-out date (YYYY-MM-DD)
   * @param {number} [params.adults] - Number of guests (default: 1)
   * @param {number} [params.children] - Number of children (default: 0)
   * @param {number} [params.maxPrice] - Maximum price per night in USD
   * @param {string} [params.propertyType] - Property type filter (optional)
   * @param {string} [params.currency] - Currency code (default: USD)
   * @param {number} [params.limit] - Number of results to return (default: 10)
   * @returns {Promise<Object>} Property search results
   */
  async searchProperties(params) {
    if (!this.isConfigured()) {
      throw new Error('Airbnb API not configured - missing RAPIDAPI_KEY');
    }

    const {
      destinationId,
      checkIn,
      checkOut,
      adults = 1,
      children = 0,
      maxPrice,
      propertyType,
      currency = 'USD',
      limit = 10
    } = params;

    // Validate required parameters
    if (!destinationId) {
      throw new Error('Destination ID is required');
    }

    // Validate dates if provided
    if (checkIn && !dayjs(checkIn, 'YYYY-MM-DD', true).isValid()) {
      throw new Error('Invalid check-in date format. Use YYYY-MM-DD');
    }

    if (checkOut && !dayjs(checkOut, 'YYYY-MM-DD', true).isValid()) {
      throw new Error('Invalid check-out date format. Use YYYY-MM-DD');
    }

    // Validate check-in is before check-out
    if (checkIn && checkOut && dayjs(checkIn).isAfter(dayjs(checkOut))) {
      throw new Error('Check-in date must be before check-out date');
    }

    // Validate dates are not in the past
    const today = dayjs().startOf('day');
    if (checkIn && dayjs(checkIn).isBefore(today)) {
      throw new Error('Check-in date cannot be in the past');
    }

    try {
      console.log(`[Airbnb] Searching properties: ${destinationId}${checkIn ? ` (${checkIn} to ${checkOut})` : ''}`);

      // Add rate limiting delay
      await this.rateLimitDelay();

      const searchParams = {
        category: 'TAB_8225', // Default category (appears to be "all properties")
        totalRecords: limit,
        currency: currency,
        adults: adults + children // Airbnb API treats total guests
      };

      // Add optional parameters
      if (checkIn) {
        searchParams.checkin = checkIn;
      }
      if (checkOut) {
        searchParams.checkout = checkOut;
      }
      if (maxPrice) {
        searchParams.priceMax = maxPrice;
      }
      if (destinationId) {
        searchParams.id = destinationId;
      }

      // Debug: Log the exact params being sent
      console.log(`[Airbnb] API Request params:`, JSON.stringify(searchParams, null, 2));

      const response = await axios.get(`${BASE_URL}/searchPropertyV2`, {
        params: searchParams,
        headers: this.defaultHeaders,
        timeout: 30000 // 30 seconds for property search
      });

      const data = response.data?.data || response.data;

      // Debug: Log response structure
      console.log(`[Airbnb] Response structure:`, {
        hasData: !!data,
        topLevelKeys: Object.keys(response.data || {}),
        dataKeys: Object.keys(data || {})
      });

      // Extract properties from response
      const properties = data?.list || data?.results || data || [];
      const propertiesArray = Array.isArray(properties) ? properties : [];

      console.log(`[Airbnb] Found ${propertiesArray.length} properties`);

      // If 0 properties, log more details
      if (propertiesArray.length === 0) {
        console.log(`[Airbnb] ⚠️ 0 properties found. Raw response sample:`, JSON.stringify(response.data, null, 2).substring(0, 500));
      }

      return {
        success: true,
        searchParams: params,
        results: propertiesArray,
        count: propertiesArray.length
      };

    } catch (error) {
      console.error(`[Airbnb] Property search error:`, error.message);

      if (error.response?.status === 429) {
        throw new Error('Airbnb search rate limit exceeded. Please try again in a few minutes.');
      }

      if (error.response?.status === 400) {
        throw new Error('Invalid property search parameters. Please check your dates and location.');
      }

      throw new Error(`Property search failed: ${error.message}`);
    }
  }

  /**
   * Get detailed information about a specific property
   *
   * @param {string} propertyId - Airbnb property ID
   * @param {string} [currency] - Currency code (default: USD)
   * @returns {Promise<Object>} Property details
   */
  async getPropertyDetails(propertyId, currency = 'USD') {
    if (!this.isConfigured()) {
      throw new Error('Airbnb API not configured - missing RAPIDAPI_KEY');
    }

    if (!propertyId) {
      throw new Error('Property ID is required');
    }

    // Check cache first
    const cacheKey = `${propertyId}_${currency}`;
    const cached = this.propertyCache.get(cacheKey);

    if (cached && (Date.now() - cached.timestamp < this.PROPERTY_CACHE_TTL)) {
      console.log(`[Airbnb] Using cached property details for: ${propertyId}`);
      return cached.data;
    }

    try {
      console.log(`[Airbnb] Getting property details: ${propertyId}`);

      await this.rateLimitDelay();

      const response = await axios.get(`${BASE_URL_V2}/getPropertyDetails`, {
        params: {
          propertyId: propertyId,
          currency: currency
        },
        headers: this.defaultHeaders,
        timeout: 15000
      });

      const data = response.data?.data || response.data;

      // Cache the result
      this.propertyCache.set(cacheKey, {
        data: data,
        timestamp: Date.now()
      });

      console.log(`[Airbnb] ✅ Successfully retrieved property details`);
      return {
        success: true,
        data: data
      };

    } catch (error) {
      console.error(`[Airbnb] Property details error:`, error.message);
      throw new Error(`Failed to get property details: ${error.message}`);
    }
  }

  /**
   * Filter properties by quality standards
   * Removes shared rooms, low-rated, or poorly-reviewed properties
   *
   * @param {Array} properties - Array of property results
   * @param {Object} options - Filter options
   * @param {boolean} [options.privateOnly] - Filter out shared rooms (default: true)
   * @param {number} [options.minRating] - Minimum rating (default: 4.0)
   * @param {number} [options.minReviews] - Minimum review count (default: 3)
   * @returns {Array} Filtered properties
   */
  filterProperties(properties, options = {}) {
    const {
      privateOnly = true,
      minRating = this.MIN_RATING,
      minReviews = this.MIN_REVIEW_COUNT
    } = options;

    return properties.filter(property => {
      // Filter shared rooms if requested
      if (privateOnly) {
        const roomType = property.roomType || property.room_type || '';
        if (roomType.toLowerCase().includes('shared')) {
          return false;
        }
      }

      // Filter by rating
      const rating = property.rating || property.avgRating || 0;
      if (rating < minRating && rating > 0) { // Only filter if rating exists
        return false;
      }

      // Filter by review count
      const reviewCount = property.reviewsCount || property.reviews_count || property.numberOfReviews || 0;
      if (reviewCount < minReviews) {
        return false;
      }

      return true;
    });
  }

  /**
   * Format property results for display (top N results)
   *
   * @param {Object} searchResults - Results from searchProperties()
   * @param {number} limit - Number of results to return (default: 3)
   * @param {Object} options - Formatting options
   * @returns {Array} Formatted property options
   */
  formatPropertyResults(searchResults, limit = 3, options = {}) {
    if (!searchResults?.results || !Array.isArray(searchResults.results)) {
      return [];
    }

    // Apply quality filters
    const filteredProperties = this.filterProperties(searchResults.results, options);

    // Get only the requested number of properties
    const propertiesToFormat = filteredProperties.slice(0, limit);

    return propertiesToFormat.map((property, index) => {
      // Handle nested API response structure (listing, pricingQuote, listingParamOverrides)
      const listing = property.listing || property;
      const pricingQuote = property.pricingQuote || {};

      // Extract property details (handle nested and flat structures)
      const id = listing.id || property.id || property.propertyId || property.listingId;
      const name = listing.name || listing.title || listing.publicAddress || property.name || property.title || 'Property';

      // Price can be in multiple locations - try all possible paths
      const priceString = pricingQuote.structuredStayDisplayPrice?.primaryLine?.price
        || pricingQuote.structuredStayDisplayPrice?.secondaryLine?.price
        || pricingQuote.rate?.amount
        || pricingQuote.price?.amount
        || property.price?.rate
        || property.price?.amount
        || property.price
        || property.pricePerNight
        || listing.price?.rate
        || listing.price?.amount
        || listing.price
        || null; // Use null instead of 0 to distinguish "no price data" from "$0"

      // Extract numeric price from string like "$123" or "123"
      let pricePerNight = null;
      if (priceString !== null) {
        if (typeof priceString === 'string') {
          const numericPrice = parseFloat(priceString.replace(/[^0-9.]/g, ''));
          pricePerNight = isNaN(numericPrice) ? null : numericPrice;
        } else if (typeof priceString === 'number') {
          pricePerNight = priceString;
        }
      }

      const currency = pricingQuote.rate?.currency || property.price?.currency || listing.price?.currency || 'USD';
      const rating = listing.avgRating || listing.rating || property.rating || property.avgRating || 0;
      const reviewCount = listing.reviewsCount || listing.reviews_count || property.reviewsCount || property.reviews_count || property.numberOfReviews || 0;
      const propertyType = listing.roomTypeCategory || listing.type || listing.propertyType || listing.roomType || property.type || property.propertyType || property.roomType || 'Property';
      const beds = listing.beds || listing.bedrooms || property.beds || property.bedrooms || 0;
      const baths = listing.bathrooms || listing.baths || property.bathrooms || property.baths || 0;
      const maxGuests = listing.maxGuests || listing.personCapacity || property.maxGuests || property.personCapacity || 0;
      const images = listing.contextualPictures || listing.images || listing.photos || property.images || property.photos || [];
      const mainImage = images[0]?.picture || images[0]?.url || images[0] || '';

      // Generate Airbnb URL
      const airbnbUrl = id ? `https://www.airbnb.com/rooms/${id}` : '';

      // Debug: log available fields for first property
      if (index === 0) {
        console.log(`[Airbnb] Sample property structure:`, {
          topLevel: Object.keys(property),
          listingKeys: listing ? Object.keys(listing).slice(0, 10) : [],
          pricingKeys: pricingQuote ? Object.keys(pricingQuote) : [],
          hasPricingQuote: !!property.pricingQuote,
          pricingQuoteStructure: property.pricingQuote ? JSON.stringify(property.pricingQuote, null, 2).substring(0, 300) : 'N/A',
          extractedPrice: pricePerNight,
          extractedName: name,
          priceStringFound: priceString
        });

        // If no price found, log the entire property structure for debugging
        if (pricePerNight === null || pricePerNight === 0) {
          console.warn(`[Airbnb] ⚠️ No valid price found for property. Full property sample:`, JSON.stringify(property, null, 2).substring(0, 1000));
        }
      }

      return {
        index: index + 1,
        id,
        name,
        pricePerNight,
        currency,
        rating: rating > 0 ? rating.toFixed(1) : 'New',
        reviewCount,
        propertyType,
        beds,
        baths,
        maxGuests,
        mainImage,
        url: airbnbUrl,
        rawData: property
      };
    });
  }

  /**
   * Format property results as SMS message
   *
   * @param {Array} formattedProperties - Properties from formatPropertyResults()
   * @param {Object} searchInfo - Original search parameters
   * @returns {string} SMS-formatted message
   */
  formatSMSMessage(formattedProperties, searchInfo = {}) {
    if (!formattedProperties || formattedProperties.length === 0) {
      return 'Sorry, no properties found for your search. Try different dates or location.';
    }

    const { checkIn, checkOut, destinationName } = searchInfo;

    // Compact date format (MM/DD)
    const formatDate = (dateStr) => {
      if (!dateStr) return '';
      const parts = dateStr.split('-');
      if (parts.length === 3) {
        return `${parts[1]}/${parts[2]}`; // Returns "02/14"
      }
      return dateStr;
    };

    const checkInDisplay = formatDate(checkIn);
    const checkOutDisplay = formatDate(checkOut);
    const dateRange = checkInDisplay && checkOutDisplay ? ` ${checkInDisplay}-${checkOutDisplay}` : '';
    const location = destinationName || 'your destination';

    const header = `🏠 ${location}${dateRange}\n\n`;

    const propertiesList = formattedProperties.map(property => {
      // Compact property type (remove "Entire" prefix if present)
      const type = property.propertyType.replace(/^Entire\s+/i, '');

      // Price display - handle null prices
      const price = property.pricePerNight !== null && property.pricePerNight > 0
        ? `$${property.pricePerNight}/nt`
        : 'Price TBD';

      // Rating display (⭐ emoji + rating)
      const ratingDisplay = property.rating !== 'New'
        ? `⭐${property.rating}`
        : '⭐New';

      // Beds/baths if available
      const details = [];
      if (property.beds > 0) details.push(`${property.beds}bd`);
      if (property.baths > 0) details.push(`${property.baths}ba`);
      const detailsText = details.length > 0 ? ` • ${details.join(' ')}` : '';

      // Compact name (max 30 chars)
      const shortName = property.name.length > 30
        ? property.name.substring(0, 27) + '...'
        : property.name;

      return `${property.index}. ${shortName} - ${price}\n${type}${detailsText} ${ratingDisplay}`;
    }).join('\n\n');

    return `${header}${propertiesList}\n\nReply 1-${formattedProperties.length} for booking link`;
  }

  /**
   * Calculate total stay cost
   *
   * @param {number} pricePerNight - Nightly rate
   * @param {string} checkIn - Check-in date (YYYY-MM-DD)
   * @param {string} checkOut - Check-out date (YYYY-MM-DD)
   * @returns {Object} Total cost breakdown
   */
  calculateTotalCost(pricePerNight, checkIn, checkOut) {
    if (!checkIn || !checkOut) {
      return {
        nights: 0,
        subtotal: 0,
        total: 0
      };
    }

    const nights = dayjs(checkOut).diff(dayjs(checkIn), 'day');
    const subtotal = pricePerNight * nights;

    // Airbnb typically adds ~15-20% in fees, but we don't have exact data
    // Just show subtotal and note additional fees apply
    return {
      nights,
      pricePerNight,
      subtotal,
      total: subtotal, // Without fees since we don't have exact data
      feesNote: 'Plus Airbnb service fees and taxes'
    };
  }

  /**
   * Check if service is properly configured
   *
   * @returns {boolean} True if API key is set
   */
  isConfigured() {
    const isConfigured = !!RAPIDAPI_KEY;
    if (!isConfigured) {
      console.warn('[Airbnb] Service not configured - RAPIDAPI_KEY or RAPIDAPI_KEY_AIRBNB missing from environment');
    }
    return isConfigured;
  }
}

// Export as singleton instance
module.exports = new AirbnbService();
