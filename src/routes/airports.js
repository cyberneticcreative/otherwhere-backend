/**
 * Airport Lookup Routes
 *
 * API endpoints for airport and metro area lookup with fuzzy matching
 */

const express = require('express');
const router = express.Router();
const airportLookupService = require('../services/airportLookupService');

/**
 * POST /airports/lookup
 *
 * Look up airport or metro area from user input
 *
 * Request body:
 * {
 *   "query": "Toronto",              // Required: city name, airport code, or fuzzy input
 *   "preferMetro": true,             // Optional: prefer metro codes (default: true)
 *   "fuzzy": true,                   // Optional: enable fuzzy matching (default: true)
 *   "maxResults": 5                  // Optional: max disambiguation results (default: 5)
 * }
 *
 * Response (success):
 * {
 *   "query": "Toronto",
 *   "result": {
 *     "type": "metro",
 *     "iataCode": "YTO",
 *     "name": "Toronto",
 *     "city": "Toronto",
 *     "country": "Canada",
 *     "countryCode": "CA",
 *     "airportCodes": ["YYZ", "YTZ"],
 *     "confidence": 1.0,
 *     "alternatives": [...]           // If ambiguous
 *   }
 * }
 *
 * Response (error):
 * {
 *   "error": "Could not resolve airport for \"XYZ\""
 * }
 */
router.post('/lookup', async (req, res) => {
  try {
    const {
      query,
      preferMetro = true,
      fuzzy = true,
      maxResults = 5
    } = req.body;

    // Validate required fields
    if (!query) {
      return res.status(400).json({
        error: 'Missing required parameter: query',
        example: { query: 'Toronto' }
      });
    }

    // Perform lookup
    const result = await airportLookupService.lookup(query, {
      preferMetro,
      fuzzy,
      maxResults
    });

    res.json({
      query,
      result,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('[AirportRoutes] Lookup error:', error);

    // Return user-friendly error
    res.status(404).json({
      error: error.message || 'Airport lookup failed',
      query: req.body.query
    });
  }
});

/**
 * GET /airports/lookup/:query
 *
 * Look up airport from URL parameter (convenience endpoint)
 *
 * Example: GET /airports/lookup/Toronto
 *
 * Response: Same as POST /airports/lookup
 */
router.get('/lookup/:query', async (req, res) => {
  try {
    const { query } = req.params;
    const {
      preferMetro = 'true',
      fuzzy = 'true',
      maxResults = '5'
    } = req.query;

    const result = await airportLookupService.lookup(query, {
      preferMetro: preferMetro === 'true',
      fuzzy: fuzzy === 'true',
      maxResults: parseInt(maxResults, 10)
    });

    res.json({
      query,
      result,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('[AirportRoutes] Lookup error:', error);

    res.status(404).json({
      error: error.message || 'Airport lookup failed',
      query: req.params.query
    });
  }
});

/**
 * POST /airports/batch-lookup
 *
 * Look up multiple airports in a single request
 *
 * Request body:
 * {
 *   "queries": ["Toronto", "NYC", "London"],
 *   "preferMetro": true,
 *   "fuzzy": true
 * }
 *
 * Response:
 * {
 *   "results": [
 *     { "query": "Toronto", "result": {...}, "success": true },
 *     { "query": "NYC", "result": {...}, "success": true },
 *     { "query": "London", "result": {...}, "success": true }
 *   ]
 * }
 */
router.post('/batch-lookup', async (req, res) => {
  try {
    const {
      queries,
      preferMetro = true,
      fuzzy = true,
      maxResults = 5
    } = req.body;

    // Validate
    if (!Array.isArray(queries) || queries.length === 0) {
      return res.status(400).json({
        error: 'queries must be a non-empty array',
        example: { queries: ['Toronto', 'NYC'] }
      });
    }

    if (queries.length > 50) {
      return res.status(400).json({
        error: 'Maximum 50 queries per batch request'
      });
    }

    // Perform lookups
    const results = await Promise.allSettled(
      queries.map(query =>
        airportLookupService.lookup(query, { preferMetro, fuzzy, maxResults })
      )
    );

    const formattedResults = queries.map((query, index) => {
      const result = results[index];
      return {
        query,
        success: result.status === 'fulfilled',
        result: result.status === 'fulfilled' ? result.value : null,
        error: result.status === 'rejected' ? result.reason.message : null
      };
    });

    res.json({
      results: formattedResults,
      total: queries.length,
      successful: formattedResults.filter(r => r.success).length,
      failed: formattedResults.filter(r => !r.success).length,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('[AirportRoutes] Batch lookup error:', error);

    res.status(500).json({
      error: error.message || 'Batch lookup failed'
    });
  }
});

/**
 * GET /airports/stats
 *
 * Get airport lookup service statistics (cache hits, misses, etc.)
 *
 * Response:
 * {
 *   "hits": { "memory": 120, "db": 45, "api": 0, "fallback": 12 },
 *   "misses": 3,
 *   "errors": 1,
 *   "cacheSize": 177,
 *   "hitRate": "96.67%"
 * }
 */
router.get('/stats', (req, res) => {
  try {
    const stats = airportLookupService.getStats();
    res.json(stats);
  } catch (error) {
    console.error('[AirportRoutes] Stats error:', error);
    res.status(500).json({
      error: 'Failed to get statistics'
    });
  }
});

/**
 * POST /airports/cache/clear
 *
 * Clear the in-memory cache (admin endpoint)
 *
 * Response:
 * {
 *   "message": "Memory cache cleared",
 *   "timestamp": "2025-11-12T..."
 * }
 */
router.post('/cache/clear', (req, res) => {
  try {
    airportLookupService.clearCache();
    res.json({
      message: 'Memory cache cleared',
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('[AirportRoutes] Cache clear error:', error);
    res.status(500).json({
      error: 'Failed to clear cache'
    });
  }
});

/**
 * DELETE /airports/cache/db
 *
 * Clear old database cache entries (admin endpoint)
 *
 * Query params:
 * - olderThanDays: number of days (default: 30)
 *
 * Response:
 * {
 *   "message": "Cleared 42 old cache entries",
 *   "count": 42
 * }
 */
router.delete('/cache/db', async (req, res) => {
  try {
    const olderThanDays = parseInt(req.query.olderThanDays || '30', 10);
    const count = await airportLookupService.clearDbCache(olderThanDays);

    res.json({
      message: `Cleared ${count} old cache entries`,
      count,
      olderThanDays,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('[AirportRoutes] DB cache clear error:', error);
    res.status(500).json({
      error: 'Failed to clear database cache'
    });
  }
});

module.exports = router;
