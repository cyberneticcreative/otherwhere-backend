const axios = require('axios');
const dayjs = require('dayjs');

const RAPIDAPI_KEY = process.env.RAPIDAPI_KEY_HOTELS || process.env.RAPIDAPI_KEY;
const RAPIDAPI_HOST = 'hotels-com6.p.rapidapi.com';
const BASE_URL = `https://${RAPIDAPI_HOST}`;

/**
 * Hotels.com API Service via RapidAPI
 *
 * Provides:
 * - Location/region search (city names → location IDs)
 * - Hotel search with filters
 * - Hotel details and pricing
 * - SMS-formatted results
 *
 * Documentation: https://rapidapi.com/ntd119/api/hotels-com6
 */
class HotelsService {
  constructor() {
    this.defaultHeaders = {
      'x-rapidapi-host': RAPIDAPI_HOST,
      'x-rapidapi-key': RAPIDAPI_KEY
    };

    // In-memory caches
    this.regionCache = new Map();
    this.hotelCache = new Map();
    this.REGION_CACHE_TTL = 24 * 60 * 60 * 1000; // 24 hours
    this.HOTEL_CACHE_TTL = 30 * 60 * 1000; // 30 minutes (prices change)

    // Rate limiting
    this.lastRequestTime = 0;
    this.MIN_REQUEST_INTERVAL = 1500; // 1.5 seconds between requests

    // Common locations fallback (major cities) - these are example IDs, need to be verified
    this.commonLocations = {
      'new york': { id: '1506246', name: 'New York, NY' },
      'los angeles': { id: '1178275', name: 'Los Angeles, CA' },
      'chicago': { id: '1297892', name: 'Chicago, IL' },
      'san francisco': { id: '1377549', name: 'San Francisco, CA' },
      'miami': { id: '1165775', name: 'Miami, FL' },
      'seattle': { id: '1142697', name: 'Seattle, WA' },
      'austin': { id: '1181555', name: 'Austin, TX' },
      'boston': { id: '1168634', name: 'Boston, MA' },
      'toronto': { id: '178315', name: 'Toronto, ON' },
      'vancouver': { id: '179228', name: 'Vancouver, BC' },
      'london': { id: '553173', name: 'London, UK' },
      'paris': { id: '179898', name: 'Paris, France' }
    };

    // Minimum quality filters
    this.MIN_RATING = 3.5; // Hotels.com has different rating scale than Airbnb
    this.MIN_REVIEW_COUNT = 10;
  }

  /**
   * Check if service is configured
   */
  isConfigured() {
    return !!RAPIDAPI_KEY;
  }

  /**
   * Add delay between requests to avoid rate limiting
   */
  async rateLimitDelay() {
    const now = Date.now();
    const timeSinceLastRequest = now - this.lastRequestTime;

    if (timeSinceLastRequest < this.MIN_REQUEST_INTERVAL) {
      const delay = this.MIN_REQUEST_INTERVAL - timeSinceLastRequest;
      await new Promise(resolve => setTimeout(resolve, delay));
    }

    this.lastRequestTime = Date.now();
  }

  /**
   * Search for regions/locations by name
   *
   * @param {string} query - City name or location to search
   * @returns {Promise<Array>} Array of matching regions
   */
  async searchRegion(query) {
    if (!this.isConfigured()) {
      throw new Error('Hotels.com API not configured - missing RAPIDAPI_KEY');
    }

    const cleanQuery = query.trim();
    const cacheKey = `region:${cleanQuery.toLowerCase()}`;

    // Check cache first
    const cached = this.regionCache.get(cacheKey);
    if (cached && (Date.now() - cached.timestamp) < this.REGION_CACHE_TTL) {
      console.log(`[Hotels.com] Using cached region for: ${cleanQuery}`);
      return cached.data;
    }

    // Try API first (fallbacks only used if API fails)
    const maxRetries = 2;
    let lastError;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        console.log(`[Hotels.com] Searching region: ${cleanQuery} (attempt ${attempt}/${maxRetries})`);

        await this.rateLimitDelay();

        const response = await axios.get(`${BASE_URL}/hotels/auto-complete`, {
          params: { query: cleanQuery },
          headers: this.defaultHeaders,
          timeout: 15000
        });

        // Extract search results from response
        // API structure: { data: { sr: [...] }, status: true, message: "..." }
        const rawResults = response.data?.data?.sr || response.data?.sr || [];

        // Validate we got an array
        if (!Array.isArray(rawResults)) {
          console.log(`[Hotels.com] ❌ Unexpected response format`);
          console.log(`[Hotels.com] Response keys:`, response.data ? Object.keys(response.data).join(', ') : 'null');
          console.log(`[Hotels.com] Response sample:`, JSON.stringify(response.data).substring(0, 300));
          throw new Error(`API returned unexpected format: expected array in data.sr`);
        }

        console.log(`[Hotels.com] Found ${rawResults.length} locations for "${query}"`);

        if (rawResults.length > 0) {
          console.log(`[Hotels.com] Sample location:`, JSON.stringify(rawResults[0], null, 2).substring(0, 500));
        }

        // Format results - support multiple possible response formats
        const regions = rawResults.map(location => {
          // Extract location ID - try multiple possible fields
          const id = location.gaiaId
            || location.regionId
            || location.id
            || location.hotelId
            || location.locationId;

          // Extract name - try multiple possible fields
          const name = location.regionNames?.fullName
            || location.regionName
            || location.name
            || location.cityName
            || cleanQuery;

          // Extract type
          const type = location.essId?.type || location.type || 'CITY';

          console.log(`[Hotels.com] Parsed location: id=${id}, name=${name}, type=${type}`);

          return { id, name, type };
        }).filter(region => region.id); // Only keep locations with valid IDs

        // Cache the result
        this.regionCache.set(cacheKey, {
          data: regions,
          timestamp: Date.now()
        });

        console.log(`[Hotels.com] ✅ Successfully retrieved regions on attempt ${attempt}`);
        return regions;

      } catch (error) {
        lastError = error;
        console.error(`[Hotels.com] Region search error (attempt ${attempt}/${maxRetries}):`, error.message);

        if (error.response?.status === 429) {
          throw new Error('Hotels.com API rate limit exceeded. Please try again in a few minutes.');
        }

        if (attempt < maxRetries) {
          const retryDelay = 2000;
          console.log(`[Hotels.com] Retrying in ${retryDelay}ms...`);
          await new Promise(resolve => setTimeout(resolve, retryDelay));
        }
      }
    }

    // API failed, try hardcoded fallback as last resort
    console.log(`[Hotels.com] API search failed, checking hardcoded fallback for: ${cleanQuery}`);
    const fallbackKey = cleanQuery.toLowerCase();
    const fallbackLocation = this.commonLocations[fallbackKey];
    if (fallbackLocation) {
      console.log(`[Hotels.com] ⚠️ Using hardcoded fallback location for: ${cleanQuery}`);
      const result = [fallbackLocation];
      this.regionCache.set(cacheKey, {
        data: result,
        timestamp: Date.now()
      });
      return result;
    }

    console.error(`[Hotels.com] All ${maxRetries} attempts failed for region search: ${cleanQuery}`);
    throw new Error(`Region search failed after ${maxRetries} attempts: ${lastError?.message || 'Unknown error'}`);
  }

  /**
   * Search for hotels
   *
   * @param {Object} params - Search parameters
   * @param {string} params.locationId - Location ID from searchRegion()
   * @param {string} [params.checkIn] - Check-in date (YYYY-MM-DD)
   * @param {string} [params.checkOut] - Check-out date (YYYY-MM-DD)
   * @param {number} [params.adults] - Number of adults (default: 1)
   * @param {number} [params.children] - Number of children (default: 0)
   * @param {number} [params.maxPrice] - Maximum price per night
   * @param {string} [params.currency] - Currency code (default: USD)
   * @param {number} [params.limit] - Number of results to return (default: 10)
   * @returns {Promise<Object>} Hotel search results
   */
  async searchHotels(params) {
    if (!this.isConfigured()) {
      throw new Error('Hotels.com API not configured - missing RAPIDAPI_KEY');
    }

    const {
      locationId,
      checkIn,
      checkOut,
      adults = 1,
      children = 0,
      maxPrice,
      currency = 'USD',
      limit = 10
    } = params;

    if (!locationId) {
      throw new Error('Location ID is required');
    }

    // Validate dates if provided
    if (checkIn && !dayjs(checkIn, 'YYYY-MM-DD', true).isValid()) {
      throw new Error('Invalid check-in date format. Use YYYY-MM-DD');
    }

    if (checkOut && !dayjs(checkOut, 'YYYY-MM-DD', true).isValid()) {
      throw new Error('Invalid check-out date format. Use YYYY-MM-DD');
    }

    try {
      console.log(`[Hotels.com] Searching hotels: ${locationId}${checkIn ? ` (${checkIn} to ${checkOut})` : ''}`);

      await this.rateLimitDelay();

      // Build rooms parameter: [{"adults": 1, "children": []}]
      const rooms = [{
        adults: adults,
        children: children > 0 ? new Array(children).fill(0) : []
      }];

      const searchParams = {
        locationId: locationId,
        rooms: JSON.stringify(rooms),
        resultsSize: limit
      };

      // Add optional parameters
      if (checkIn) {
        searchParams.checkinDate = checkIn;
      }
      if (checkOut) {
        searchParams.checkoutDate = checkOut;
      }
      if (currency) {
        searchParams.currency = currency;
      }

      console.log(`[Hotels.com] API Request params:`, JSON.stringify(searchParams, null, 2));

      const response = await axios.get(`${BASE_URL}/hotels/search`, {
        params: searchParams,
        headers: this.defaultHeaders,
        timeout: 30000
      });

      const data = response.data;

      console.log(`[Hotels.com] Response structure:`, {
        hasData: !!data,
        topLevelKeys: Object.keys(data || {})
      });

      // Extract hotels from response
      const properties = data?.data?.propertySearchListings || data?.properties || data?.data?.properties || [];
      const propertiesArray = Array.isArray(properties) ? properties : [];

      console.log(`[Hotels.com] Found ${propertiesArray.length} hotels`);

      if (propertiesArray.length === 0) {
        console.log(`[Hotels.com] ⚠️ 0 hotels found. Raw response:`, JSON.stringify(data, null, 2).substring(0, 500));
      }

      return {
        success: true,
        searchParams: params,
        results: propertiesArray,
        count: propertiesArray.length
      };

    } catch (error) {
      console.error(`[Hotels.com] Hotel search error:`, error.message);

      if (error.response?.status === 429) {
        throw new Error('Hotels.com API rate limit exceeded. Please try again in a few minutes.');
      }

      if (error.response?.status === 400) {
        throw new Error('Invalid hotel search parameters. Please check your dates and location.');
      }

      throw new Error(`Hotel search failed: ${error.message}`);
    }
  }

  /**
   * Filter hotels by quality criteria
   */
  filterHotels(hotels, options = {}) {
    const {
      minRating = this.MIN_RATING,
      minReviews = this.MIN_REVIEW_COUNT,
      maxPrice
    } = options;

    return hotels.filter(hotel => {
      // Extract rating - support both old and new API structures
      let rating = 0;
      if (hotel.summarySections?.[0]?.guestRatingSectionV2?.badge?.text) {
        // New API structure
        rating = parseFloat(hotel.summarySections[0].guestRatingSectionV2.badge.text) || 0;
      } else {
        // Old API structure
        rating = hotel.reviews?.score || hotel.starRating || 0;
      }

      if (rating < minRating && rating > 0) {
        console.log(`[Hotels.com] Filtering out hotel with low rating: ${rating} < ${minRating}`);
        return false;
      }

      // Extract review count - support both old and new API structures
      let reviewCount = 0;
      if (hotel.summarySections?.[0]?.guestRatingSectionV2?.phrases?.[1]?.phraseParts?.[0]?.text) {
        // New API structure - extract from phrases like "2,622 reviews"
        const reviewPhrase = hotel.summarySections[0].guestRatingSectionV2.phrases[1].phraseParts[0].text || '';
        const reviewMatch = reviewPhrase.match(/[\d,]+/);
        if (reviewMatch) {
          reviewCount = parseInt(reviewMatch[0].replace(/,/g, '')) || 0;
        }
      } else {
        // Old API structure
        reviewCount = hotel.reviews?.total || 0;
      }

      if (reviewCount < minReviews) {
        console.log(`[Hotels.com] Filtering out hotel with low reviews: ${reviewCount} < ${minReviews}`);
        return false;
      }

      // Check price if available - support both structures
      if (maxPrice) {
        let hotelPrice = 0;

        // New API structure
        if (hotel.priceSection?.priceSummary?.displayMessages?.[0]?.lineItems) {
          const leadPrice = hotel.priceSection.priceSummary.displayMessages[0].lineItems.find(
            item => item.role === 'LEAD'
          );
          if (leadPrice?.price?.formatted) {
            const priceStr = leadPrice.price.formatted;
            hotelPrice = parseFloat(priceStr.replace(/[^0-9.]/g, '')) || 0;
          }
        } else if (hotel.price?.lead?.amount) {
          // Old API structure
          hotelPrice = hotel.price.lead.amount;
        }

        if (hotelPrice > 0 && hotelPrice > maxPrice) {
          console.log(`[Hotels.com] Filtering out hotel with high price: ${hotelPrice} > ${maxPrice}`);
          return false;
        }
      }

      return true;
    });
  }

  /**
   * Format hotel results for display
   *
   * @param {Object} searchResults - Results from searchHotels()
   * @param {number} limit - Number of results to return (default: 3)
   * @param {Object} options - Formatting options
   * @returns {Array} Formatted hotel options
   */
  formatHotelResults(searchResults, limit = 3, options = {}) {
    if (!searchResults?.results || !Array.isArray(searchResults.results)) {
      return [];
    }

    // Apply quality filters
    console.log(`[Hotels.com] Filtering ${searchResults.results.length} hotels with options:`, options);
    let filteredHotels = this.filterHotels(searchResults.results, options);
    console.log(`[Hotels.com] After filtering: ${filteredHotels.length} hotels remaining`);

    // If filtering removed all hotels, use unfiltered results (better to show something than nothing)
    if (filteredHotels.length === 0 && searchResults.results.length > 0) {
      console.log(`[Hotels.com] ⚠️ All hotels filtered out, using unfiltered results`);
      filteredHotels = searchResults.results;
    }

    // Format ALL filtered hotels so we can filter out $0 prices
    const formattedHotels = filteredHotels.map((hotel, index) => {
      // Extract hotel details from various possible locations
      const id = hotel.id || hotel.propertyId;

      // Name extraction - support new API structure
      const name = hotel.headingSection?.heading || hotel.name || 'Hotel';

      // Price extraction with multiple fallback paths
      let priceString = null;
      let priceSource = 'none';

      // New API structure: priceSection.priceSummary.displayMessages[0].lineItems (find LEAD role)
      if (hotel.priceSection?.priceSummary?.displayMessages?.[0]?.lineItems) {
        const leadPrice = hotel.priceSection.priceSummary.displayMessages[0].lineItems.find(
          item => item.role === 'LEAD'
        );
        if (leadPrice?.price?.formatted) {
          priceString = leadPrice.price.formatted;
          priceSource = 'hotel.priceSection.priceSummary (LEAD)';
        }
      }

      // Old API structure fallbacks
      if (!priceString && hotel.price?.lead?.amount) {
        priceString = hotel.price.lead.amount;
        priceSource = 'hotel.price.lead.amount';
      } else if (!priceString && hotel.price?.displayPrice) {
        priceString = hotel.price.displayPrice;
        priceSource = 'hotel.price.displayPrice';
      } else if (!priceString && hotel.ratePlan?.price?.current) {
        priceString = hotel.ratePlan.price.current;
        priceSource = 'hotel.ratePlan.price.current';
      } else if (!priceString && hotel.price) {
        priceString = hotel.price;
        priceSource = 'hotel.price';
      } else if (!priceString) {
        priceString = 0;
        priceSource = 'default (0)';
      }

      console.log(`[Hotels.com] Hotel ${index + 1} price source: ${priceSource} = ${priceString}`);

      // Extract numeric price from string
      const pricePerNight = typeof priceString === 'string'
        ? parseFloat(priceString.replace(/[^0-9.]/g, ''))
        : (priceString || 0);

      // If price is $0, dump the hotel object for debugging
      if (!pricePerNight || pricePerNight === 0) {
        console.error(`[Hotels.com] ⚠️ Hotel ${index + 1} has $0 price! Full hotel object:`,
          JSON.stringify(hotel, null, 2).substring(0, 2000));
      }

      // Rating extraction - new API structure
      let rating = 0;
      let reviewCount = 0;

      if (hotel.summarySections?.[0]?.guestRatingSectionV2?.badge?.text) {
        rating = parseFloat(hotel.summarySections[0].guestRatingSectionV2.badge.text) || 0;

        // Extract review count from phrases like "2,622 reviews"
        const reviewPhrase = hotel.summarySections[0].guestRatingSectionV2.phrases?.[1]?.phraseParts?.[0]?.text || '';
        const reviewMatch = reviewPhrase.match(/[\d,]+/);
        if (reviewMatch) {
          reviewCount = parseInt(reviewMatch[0].replace(/,/g, '')) || 0;
        }
      } else {
        // Old API structure fallbacks
        rating = hotel.reviews?.score || hotel.starRating || 0;
        reviewCount = hotel.reviews?.total || 0;
      }

      const currency = hotel.priceSection?.priceSummary?.displayMessages?.[0]?.lineItems?.[0]?.price?.currency
        || hotel.price?.lead?.currencyInfo?.code || 'USD';
      const starRating = hotel.star || hotel.starRating || 0;

      // Image extraction - new API structure
      const mainImage = hotel.mediaSection?.gallery?.media?.[0]?.media?.url
        || hotel.propertyImage?.image?.url || hotel.image?.url || '';

      // Generate Hotels.com URL
      const hotelUrl = id ? `https://www.hotels.com/h${id}.Hotel-Information` : '';

      console.log(`[Hotels.com] Hotel ${index + 1} structure:`, {
        topLevel: Object.keys(hotel),
        priceKeys: hotel.price ? Object.keys(hotel.price) : null,
        extractedPriceString: priceString,
        extractedPrice: pricePerNight,
        extractedName: name
      });

      return {
        index: index + 1,
        id,
        name,
        pricePerNight,
        currency,
        rating: rating > 0 ? rating.toFixed(1) : 'New',
        reviewCount,
        starRating,
        mainImage,
        url: hotelUrl,
        rawData: hotel
      };
    });

    // Filter out hotels with no valid price
    const hotelsWithPrice = formattedHotels.filter(hotel => {
      if (!hotel.pricePerNight || hotel.pricePerNight === 0) {
        console.warn(`[Hotels.com] ⚠️ Filtering out hotel with $0 price: ${hotel.name}`);
        return false;
      }
      return true;
    });

    console.log(`[Hotels.com] After price filtering: ${hotelsWithPrice.length}/${formattedHotels.length} hotels with valid prices`);

    // Get only the requested number of hotels
    const finalHotels = hotelsWithPrice.slice(0, limit);

    // Re-index to be sequential
    return finalHotels.map((hotel, index) => ({
      ...hotel,
      index: index + 1
    }));
  }

  /**
   * Format hotel results as SMS message
   *
   * @param {Array} formattedHotels - Hotels from formatHotelResults()
   * @param {Object} searchInfo - Original search parameters
   * @returns {string} SMS-formatted message
   */
  formatSMSMessage(formattedHotels, searchInfo = {}) {
    if (!formattedHotels || formattedHotels.length === 0) {
      return 'Sorry, no hotels found for your search. Try different dates or location.';
    }

    const { checkIn, checkOut, locationName } = searchInfo;

    // Compact date format (MM/DD)
    const formatDate = (dateStr) => {
      if (!dateStr) return '';
      const parts = dateStr.split('-');
      if (parts.length === 3) {
        return `${parts[1]}/${parts[2]}`;
      }
      return dateStr;
    };

    const checkInDisplay = formatDate(checkIn);
    const checkOutDisplay = formatDate(checkOut);
    const dateRange = checkInDisplay && checkOutDisplay ? ` ${checkInDisplay}-${checkOutDisplay}` : '';
    const location = locationName || 'your destination';

    const header = `🏨 ${location}${dateRange}\n\n`;

    const hotelsList = formattedHotels.map(hotel => {
      // Price display
      const price = `$${hotel.pricePerNight}/nt`;

      // Rating display
      const ratingDisplay = hotel.rating !== 'New'
        ? `⭐${hotel.rating}`
        : '⭐New';

      // Star rating if available
      const stars = hotel.starRating > 0 ? ` • ${hotel.starRating}★` : '';

      // Compact name (max 30 chars)
      const shortName = hotel.name.length > 30
        ? hotel.name.substring(0, 27) + '...'
        : hotel.name;

      return `${hotel.index}. ${shortName} - ${price}\nHotel${stars} ${ratingDisplay}`;
    }).join('\n\n');

    return `${header}${hotelsList}\n\nReply 1-${formattedHotels.length} for booking link`;
  }

  /**
   * Clear all caches (for debugging)
   */
  clearCache() {
    const regionCount = this.regionCache.size;
    const hotelCount = this.hotelCache.size;

    this.regionCache.clear();
    this.hotelCache.clear();

    console.log(`[Hotels.com] Cache cleared: ${regionCount} regions, ${hotelCount} hotel searches`);

    return {
      regionsCached: regionCount,
      hotelsCached: hotelCount
    };
  }
}

module.exports = new HotelsService();
