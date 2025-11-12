/**
 * Airport Lookup Service
 *
 * Production-ready airport lookup with:
 * - Multi-tier lookup (memory cache -> DB -> API -> fallback)
 * - Fuzzy matching with confidence scoring
 * - Metro area preference (NYC vs JFK, LON vs LHR)
 * - Disambiguation support
 * - High availability with fallback
 *
 * @module airportLookupService
 */

const db = require('../db');
const airportResolverService = require('./airportResolverService');

class AirportLookupService {
  constructor() {
    // In-memory LRU cache for blazing fast lookups
    this.memoryCache = new Map();
    this.MAX_CACHE_SIZE = 1000;

    // Cache hit/miss statistics
    this.stats = {
      hits: { memory: 0, db: 0, api: 0, fallback: 0 },
      misses: 0,
      errors: 0,
    };

    // Levenshtein distance threshold for fuzzy matching
    this.FUZZY_THRESHOLD = 3; // max edit distance
    this.MIN_CONFIDENCE = 0.5; // minimum confidence to accept a match
  }

  /**
   * Main lookup method - resolves any user input to normalized airport/metro code
   *
   * @param {string} query - User input (e.g., "Toronto", "YYZ", "JFK", "New York City")
   * @param {Object} options - Lookup options
   * @param {boolean} options.preferMetro - Prefer metro codes over single airports (default: true)
   * @param {boolean} options.fuzzy - Enable fuzzy matching (default: true)
   * @param {number} options.maxResults - Max disambiguation results (default: 5)
   * @returns {Promise<LookupResult>}
   */
  async lookup(query, options = {}) {
    const {
      preferMetro = true,
      fuzzy = true,
      maxResults = 5,
    } = options;

    if (!query || typeof query !== 'string') {
      throw new Error('Query must be a non-empty string');
    }

    const normalizedQuery = this.normalizeQuery(query);
    const startTime = Date.now();

    try {
      // Tier 1: Check memory cache
      const cacheKey = this.getCacheKey(normalizedQuery, preferMetro);
      if (this.memoryCache.has(cacheKey)) {
        this.stats.hits.memory++;
        const cached = this.memoryCache.get(cacheKey);
        console.log(`[AirportLookup] Memory cache HIT for "${query}" -> ${cached.iataCode} (${Date.now() - startTime}ms)`);
        return cached;
      }

      // Tier 2: Check database cache table
      const dbCacheResult = await this.checkDbCache(normalizedQuery);
      if (dbCacheResult && dbCacheResult.confidence >= this.MIN_CONFIDENCE) {
        this.stats.hits.db++;
        this.addToMemoryCache(cacheKey, dbCacheResult);
        console.log(`[AirportLookup] DB cache HIT for "${query}" -> ${dbCacheResult.iataCode} (${Date.now() - startTime}ms)`);
        return dbCacheResult;
      }

      // Tier 3: Perform database lookup
      const dbResult = await this.performDatabaseLookup(normalizedQuery, { preferMetro, fuzzy, maxResults });

      if (dbResult) {
        // Cache the result
        await this.cacheResult(normalizedQuery, dbResult);
        this.addToMemoryCache(cacheKey, dbResult);

        console.log(`[AirportLookup] Database lookup SUCCESS for "${query}" -> ${dbResult.iataCode} (${Date.now() - startTime}ms)`);
        return dbResult;
      }

      // Tier 4: Fallback to hardcoded resolver
      console.log(`[AirportLookup] Database lookup failed, falling back to airportResolverService for "${query}"`);
      const fallbackResult = this.fallbackLookup(query, preferMetro);

      if (fallbackResult) {
        this.stats.hits.fallback++;
        this.addToMemoryCache(cacheKey, fallbackResult);
        console.log(`[AirportLookup] Fallback SUCCESS for "${query}" -> ${fallbackResult.iataCode} (${Date.now() - startTime}ms)`);
        return fallbackResult;
      }

      // No results found
      this.stats.misses++;
      throw new Error(`Could not resolve airport for "${query}". Please use a valid city name or IATA code.`);

    } catch (error) {
      this.stats.errors++;
      console.error(`[AirportLookup] Error looking up "${query}":`, error.message);

      // Try fallback on any error
      try {
        const fallbackResult = this.fallbackLookup(query, preferMetro);
        if (fallbackResult) {
          this.stats.hits.fallback++;
          console.log(`[AirportLookup] Fallback recovery for "${query}" -> ${fallbackResult.iataCode}`);
          return fallbackResult;
        }
      } catch (fallbackError) {
        // Fallback also failed
      }

      throw error;
    }
  }

  /**
   * Perform database lookup with fuzzy matching
   * @private
   */
  async performDatabaseLookup(query, options) {
    const { preferMetro, fuzzy, maxResults } = options;

    try {
      // Strategy 1: Exact IATA code match (fastest)
      if (/^[A-Z]{3}$/i.test(query)) {
        const code = query.toUpperCase();

        // Check if it's a metro code
        if (preferMetro) {
          const metroResult = await this.findMetroByIata(code);
          if (metroResult) return metroResult;
        }

        // Check if it's an airport code
        const airportResult = await this.findAirportByIata(code);
        if (airportResult) {
          // If preferMetro, check if this airport belongs to a metro area
          if (preferMetro) {
            const metro = await this.findMetroForAirport(airportResult.id);
            if (metro) return metro;
          }
          return airportResult;
        }
      }

      // Strategy 2: Exact city/name match
      const exactMatches = await this.findExactMatches(query, preferMetro);
      if (exactMatches.length > 0) {
        return this.selectBestMatch(exactMatches, query);
      }

      // Strategy 3: Alias match
      const aliasMatches = await this.findByAlias(query);
      if (aliasMatches.length > 0) {
        const airport = aliasMatches[0];
        if (preferMetro) {
          const metro = await this.findMetroForAirport(airport.id);
          if (metro) return metro;
        }
        return airport;
      }

      // Strategy 4: Fuzzy text search (if enabled)
      if (fuzzy) {
        const fuzzyMatches = await this.findFuzzyMatches(query, preferMetro, maxResults);
        if (fuzzyMatches.length > 0) {
          return this.selectBestMatch(fuzzyMatches, query);
        }
      }

      return null;

    } catch (error) {
      console.error('[AirportLookup] Database lookup error:', error);
      return null;
    }
  }

  /**
   * Find metro area by IATA code
   * @private
   */
  async findMetroByIata(iataCode) {
    const result = await db.query(`
      SELECT
        m.id,
        m.iata_code,
        m.name,
        m.city,
        m.country,
        m.country_code,
        m.latitude,
        m.longitude,
        m.timezone,
        ARRAY_AGG(a.iata_code ORDER BY ama.is_primary DESC) as airport_codes
      FROM metro_areas m
      LEFT JOIN airport_metro_associations ama ON m.id = ama.metro_id
      LEFT JOIN airports a ON ama.airport_id = a.id
      WHERE UPPER(m.iata_code) = UPPER($1)
      GROUP BY m.id
    `, [iataCode]);

    if (result.rows.length === 0) return null;

    const row = result.rows[0];
    return this.formatMetroResult(row, 1.0);
  }

  /**
   * Find airport by IATA code
   * @private
   */
  async findAirportByIata(iataCode) {
    const result = await db.query(`
      SELECT
        id,
        iata_code,
        icao_code,
        name,
        city,
        country,
        country_code,
        latitude,
        longitude,
        timezone,
        airport_type,
        passenger_count
      FROM airports
      WHERE UPPER(iata_code) = UPPER($1)
        AND is_active = true
    `, [iataCode]);

    if (result.rows.length === 0) return null;

    return this.formatAirportResult(result.rows[0], 1.0);
  }

  /**
   * Find metro area that contains this airport
   * @private
   */
  async findMetroForAirport(airportId) {
    const result = await db.query(`
      SELECT
        m.id,
        m.iata_code,
        m.name,
        m.country,
        m.country_code,
        m.latitude,
        m.longitude,
        m.timezone,
        ARRAY_AGG(a.iata_code ORDER BY ama.is_primary DESC) as airport_codes
      FROM metro_areas m
      JOIN airport_metro_associations ama ON m.id = ama.metro_id
      LEFT JOIN airport_metro_associations ama2 ON m.id = ama2.metro_id
      LEFT JOIN airports a ON ama2.airport_id = a.id
      WHERE ama.airport_id = $1
      GROUP BY m.id
    `, [airportId]);

    if (result.rows.length === 0) return null;

    return this.formatMetroResult(result.rows[0], 0.95);
  }

  /**
   * Find exact matches by city name or airport name
   * @private
   */
  async findExactMatches(query, preferMetro) {
    const results = [];

    // Search metros by name
    if (preferMetro) {
      const metroResults = await db.query(`
        SELECT
          m.id,
          m.iata_code,
          m.name,
          m.country,
          m.country_code,
          m.latitude,
          m.longitude,
          m.timezone,
          ARRAY_AGG(a.iata_code ORDER BY ama.is_primary DESC) as airport_codes
        FROM metro_areas m
        LEFT JOIN airport_metro_associations ama ON m.id = ama.metro_id
        LEFT JOIN airports a ON ama.airport_id = a.id
        WHERE LOWER(m.name) = LOWER($1)
        GROUP BY m.id
      `, [query]);

      for (const row of metroResults.rows) {
        results.push(this.formatMetroResult(row, 1.0));
      }
    }

    // Search airports by city or name
    const airportResults = await db.query(`
      SELECT
        id,
        iata_code,
        icao_code,
        name,
        city,
        country,
        country_code,
        latitude,
        longitude,
        timezone,
        airport_type,
        passenger_count
      FROM airports
      WHERE (LOWER(city) = LOWER($1) OR LOWER(name) LIKE LOWER($2))
        AND is_active = true
      ORDER BY passenger_count DESC NULLS LAST
      LIMIT 5
    `, [query, `%${query}%`]);

    for (const row of airportResults.rows) {
      // If preferMetro, check if this airport has a metro
      if (preferMetro) {
        const metro = await this.findMetroForAirport(row.id);
        if (metro && !results.find(r => r.iataCode === metro.iataCode)) {
          results.push(metro);
          continue;
        }
      }
      results.push(this.formatAirportResult(row, 0.95));
    }

    return results;
  }

  /**
   * Find airports by alias
   * @private
   */
  async findByAlias(query) {
    const result = await db.query(`
      SELECT DISTINCT
        a.id,
        a.iata_code,
        a.icao_code,
        a.name,
        a.city,
        a.country,
        a.country_code,
        a.latitude,
        a.longitude,
        a.timezone,
        a.airport_type,
        a.passenger_count,
        al.confidence as alias_confidence
      FROM airports a
      JOIN airport_aliases al ON a.id = al.airport_id
      WHERE LOWER(al.alias) = LOWER($1)
      ORDER BY al.confidence DESC, a.passenger_count DESC NULLS LAST
      LIMIT 5
    `, [query]);

    return result.rows.map(row => this.formatAirportResult(row, row.alias_confidence || 0.9));
  }

  /**
   * Fuzzy text search using PostgreSQL trigrams
   * @private
   */
  async findFuzzyMatches(query, preferMetro, maxResults) {
    const results = [];

    // Fuzzy search metros
    if (preferMetro) {
      const metroResults = await db.query(`
        SELECT
          m.id,
          m.iata_code,
          m.name,
          m.country,
          m.country_code,
          m.latitude,
          m.longitude,
          m.timezone,
          ARRAY_AGG(a.iata_code ORDER BY ama.is_primary DESC) as airport_codes,
          SIMILARITY(m.search_text, LOWER($1)) as similarity
        FROM metro_areas m
        LEFT JOIN airport_metro_associations ama ON m.id = ama.metro_id
        LEFT JOIN airports a ON ama.airport_id = a.id
        WHERE SIMILARITY(m.search_text, LOWER($1)) > 0.3
        GROUP BY m.id
        ORDER BY similarity DESC
        LIMIT $2
      `, [query, maxResults]);

      for (const row of metroResults.rows) {
        const confidence = this.calculateConfidence(row.similarity);
        if (confidence >= this.MIN_CONFIDENCE) {
          results.push(this.formatMetroResult(row, confidence));
        }
      }
    }

    // Fuzzy search airports and aliases
    const airportResults = await db.query(`
      SELECT DISTINCT ON (a.id)
        a.id,
        a.iata_code,
        a.icao_code,
        a.name,
        a.city,
        a.country,
        a.country_code,
        a.latitude,
        a.longitude,
        a.timezone,
        a.airport_type,
        a.passenger_count,
        GREATEST(
          SIMILARITY(a.search_text, LOWER($1)),
          COALESCE(MAX(SIMILARITY(al.search_text, LOWER($1))), 0)
        ) as similarity
      FROM airports a
      LEFT JOIN airport_aliases al ON a.id = al.airport_id
      WHERE a.is_active = true
        AND (
          SIMILARITY(a.search_text, LOWER($1)) > 0.3
          OR SIMILARITY(al.search_text, LOWER($1)) > 0.3
        )
      GROUP BY a.id
      ORDER BY a.id, similarity DESC
      LIMIT $2
    `, [query, maxResults]);

    for (const row of airportResults.rows) {
      const confidence = this.calculateConfidence(row.similarity);
      if (confidence >= this.MIN_CONFIDENCE) {
        // Check if airport belongs to metro
        if (preferMetro && !results.find(r => r.type === 'metro')) {
          const metro = await this.findMetroForAirport(row.id);
          if (metro && !results.find(r => r.iataCode === metro.iataCode)) {
            results.push({ ...metro, confidence });
            continue;
          }
        }
        results.push(this.formatAirportResult(row, confidence));
      }
    }

    return results;
  }

  /**
   * Select best match from multiple candidates
   * @private
   */
  selectBestMatch(matches, query) {
    if (matches.length === 0) return null;
    if (matches.length === 1) return matches[0];

    // Sort by confidence, then by passenger count, then by type (metro > airport)
    const sorted = matches.sort((a, b) => {
      if (a.confidence !== b.confidence) return b.confidence - a.confidence;
      if (a.type === 'metro' && b.type !== 'metro') return -1;
      if (a.type !== 'metro' && b.type === 'metro') return 1;
      return (b.passengerCount || 0) - (a.passengerCount || 0);
    });

    const best = sorted[0];

    // If multiple matches with similar confidence, return disambiguation info
    const similarMatches = sorted.filter(m => Math.abs(m.confidence - best.confidence) < 0.1);
    if (similarMatches.length > 1) {
      best.alternatives = similarMatches.slice(1, 6).map(m => ({
        iataCode: m.iataCode,
        name: m.name,
        city: m.city,
        country: m.country,
        type: m.type,
        confidence: m.confidence,
      }));
    }

    return best;
  }

  /**
   * Calculate confidence score from similarity
   * @private
   */
  calculateConfidence(similarity) {
    // Map PostgreSQL similarity (0-1) to confidence (0-1)
    // Boost higher similarities
    return Math.min(1.0, Math.pow(similarity, 0.8));
  }

  /**
   * Format metro area result
   * @private
   */
  formatMetroResult(row, confidence) {
    return {
      type: 'metro',
      iataCode: row.iata_code,
      name: row.name,
      city: row.name,
      country: row.country,
      countryCode: row.country_code,
      latitude: parseFloat(row.latitude) || null,
      longitude: parseFloat(row.longitude) || null,
      timezone: row.timezone,
      airportCodes: row.airport_codes || [],
      confidence: Math.round(confidence * 100) / 100,
    };
  }

  /**
   * Format airport result
   * @private
   */
  formatAirportResult(row, confidence) {
    return {
      type: 'airport',
      iataCode: row.iata_code,
      icaoCode: row.icao_code,
      name: row.name,
      city: row.city,
      country: row.country,
      countryCode: row.country_code,
      latitude: parseFloat(row.latitude) || null,
      longitude: parseFloat(row.longitude) || null,
      timezone: row.timezone,
      airportType: row.airport_type,
      passengerCount: row.passenger_count,
      confidence: Math.round(confidence * 100) / 100,
    };
  }

  /**
   * Check database cache
   * @private
   */
  async checkDbCache(query) {
    try {
      const result = await db.query(`
        SELECT
          result_type,
          result_iata,
          result_id,
          alternatives,
          confidence,
          hit_count
        FROM airport_lookup_cache
        WHERE LOWER(query) = LOWER($1)
          AND last_accessed > NOW() - INTERVAL '7 days'
      `, [query]);

      if (result.rows.length === 0) return null;

      const row = result.rows[0];

      // Update hit count
      await db.query(`
        UPDATE airport_lookup_cache
        SET hit_count = hit_count + 1,
            last_accessed = NOW()
        WHERE LOWER(query) = LOWER($1)
      `, [query]);

      // Fetch full details based on cached result
      if (row.result_type === 'metro') {
        return await this.findMetroByIata(row.result_iata);
      } else {
        return await this.findAirportByIata(row.result_iata);
      }

    } catch (error) {
      console.error('[AirportLookup] DB cache check error:', error);
      return null;
    }
  }

  /**
   * Cache lookup result in database
   * @private
   */
  async cacheResult(query, result) {
    try {
      await db.query(`
        INSERT INTO airport_lookup_cache (
          query,
          result_type,
          result_iata,
          result_id,
          alternatives,
          confidence,
          hit_count,
          last_accessed
        )
        VALUES ($1, $2, $3, $4, $5, $6, 1, NOW())
        ON CONFLICT (query) DO UPDATE
        SET result_type = EXCLUDED.result_type,
            result_iata = EXCLUDED.result_iata,
            result_id = EXCLUDED.result_id,
            alternatives = EXCLUDED.alternatives,
            confidence = EXCLUDED.confidence,
            hit_count = airport_lookup_cache.hit_count + 1,
            last_accessed = NOW()
      `, [
        query,
        result.type,
        result.iataCode,
        result.id || null,
        JSON.stringify(result.alternatives || []),
        result.confidence,
      ]);
    } catch (error) {
      console.error('[AirportLookup] Cache write error:', error);
      // Non-fatal, continue
    }
  }

  /**
   * Add to in-memory LRU cache
   * @private
   */
  addToMemoryCache(key, value) {
    // Simple LRU: delete oldest if at capacity
    if (this.memoryCache.size >= this.MAX_CACHE_SIZE) {
      const firstKey = this.memoryCache.keys().next().value;
      this.memoryCache.delete(firstKey);
    }
    this.memoryCache.set(key, value);
  }

  /**
   * Generate cache key
   * @private
   */
  getCacheKey(query, preferMetro) {
    return `${query}:${preferMetro ? 'metro' : 'airport'}`;
  }

  /**
   * Normalize query string
   * @private
   */
  normalizeQuery(query) {
    let normalized = query.toLowerCase().trim();

    // Remove " city" suffix
    if (normalized.endsWith(' city')) {
      normalized = normalized.slice(0, -5).trim();
    }

    // Remove " airport" suffix
    if (normalized.endsWith(' airport')) {
      normalized = normalized.slice(0, -8).trim();
    }

    // Remove common prefixes
    normalized = normalized.replace(/^(the|from|to)\s+/i, '');

    return normalized;
  }

  /**
   * Fallback to hardcoded resolver
   * @private
   */
  fallbackLookup(query, preferMetro) {
    try {
      const iataCode = airportResolverService.resolveAirportCode(query);
      const info = airportResolverService.getAirportInfo(query);

      if (info) {
        return {
          type: 'airport',
          iataCode: info.code,
          name: info.name,
          city: info.city,
          country: info.country,
          confidence: 0.9,
          source: 'fallback',
        };
      } else if (iataCode) {
        return {
          type: 'airport',
          iataCode,
          name: `${iataCode} Airport`,
          city: 'Unknown',
          country: 'Unknown',
          confidence: 0.8,
          source: 'fallback',
        };
      }

      return null;
    } catch (error) {
      return null;
    }
  }

  /**
   * Backward-compatible method - simple interface for resolving airport codes
   * Matches airportResolverService.resolveAirportCode() signature
   *
   * @param {string} location - City name or IATA code
   * @returns {Promise<string>} IATA code (3 letters)
   */
  async resolveAirportCode(location) {
    const result = await this.lookup(location, { preferMetro: true });
    return result.iataCode;
  }

  /**
   * Backward-compatible method - get airport info
   * Matches airportResolverService.getAirportInfo() signature
   *
   * @param {string} location - City name or IATA code
   * @returns {Promise<Object|null>} Airport info or null
   */
  async getAirportInfo(location) {
    try {
      const result = await this.lookup(location, { preferMetro: false });
      return {
        code: result.iataCode,
        name: result.name,
        city: result.city,
        country: result.country,
        ...result,
      };
    } catch (error) {
      return null;
    }
  }

  /**
   * Backward-compatible method - check if location can be resolved
   * Matches airportResolverService.canResolve() signature
   *
   * @param {string} location - City name or IATA code
   * @returns {Promise<boolean>} True if resolvable
   */
  async canResolve(location) {
    try {
      await this.lookup(location);
      return true;
    } catch (error) {
      return false;
    }
  }

  /**
   * Get lookup statistics
   * @returns {Object} Cache hit/miss stats
   */
  getStats() {
    return {
      ...this.stats,
      cacheSize: this.memoryCache.size,
      hitRate: this.stats.hits.memory + this.stats.hits.db > 0
        ? ((this.stats.hits.memory + this.stats.hits.db) /
           (this.stats.hits.memory + this.stats.hits.db + this.stats.misses) * 100).toFixed(2) + '%'
        : '0%',
    };
  }

  /**
   * Clear memory cache
   */
  clearCache() {
    this.memoryCache.clear();
    console.log('[AirportLookup] Memory cache cleared');
  }

  /**
   * Clear database cache (old entries)
   */
  async clearDbCache(olderThanDays = 30) {
    try {
      const result = await db.query(`
        DELETE FROM airport_lookup_cache
        WHERE last_accessed < NOW() - INTERVAL '${olderThanDays} days'
      `);
      console.log(`[AirportLookup] Cleared ${result.rowCount} old cache entries`);
      return result.rowCount;
    } catch (error) {
      console.error('[AirportLookup] Error clearing DB cache:', error);
      return 0;
    }
  }
}

// Export as singleton
module.exports = new AirportLookupService();
