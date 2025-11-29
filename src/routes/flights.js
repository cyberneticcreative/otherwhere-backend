/**
 * Flight Search Routes
 *
 * API endpoints for searching flights with airline deep links
 */

const express = require('express');
const router = express.Router();
const airlineDeeplinksService = require('../services/airlineDeepLinksService');

/**
 * POST /flights/search
 *
 * Search flights and return results with airline deep links
 *
 * Request body:
 * {
 *   "origin": "LAX",
 *   "destination": "JFK",
 *   "departure": "2025-12-01",
 *   "returnDate": "2025-12-08",  // optional
 *   "passengers": 1,
 *   "cabin": "economy",            // optional
 *   "limit": 3                     // optional
 * }
 *
 * Response:
 * {
 *   "searchParams": {...},
 *   "results": [...],
 *   "meta": {...}
 * }
 */
router.post('/search', async (req, res) => {
  try {
    const {
      origin,
      destination,
      departure,
      returnDate,
      passengers = 1,
      cabin = 'economy',
      limit = 3
    } = req.body;

    // Validate required fields
    if (!origin || !destination || !departure) {
      return res.status(400).json({
        error: 'Missing required parameters',
        required: ['origin', 'destination', 'departure']
      });
    }

    const searchParams = {
      origin,
      destination,
      departure,
      returnDate,
      passengers: parseInt(passengers, 10),
      cabin
    };

    console.log('Flight search request:', searchParams);

    const results = await airlineDeeplinksService.searchFlightsWithDeeplinks(
      searchParams,
      parseInt(limit, 10)
    );

    res.json(results);
  } catch (error) {
    console.error('Flight search error:', error);

    res.status(500).json({
      error: 'Flight search failed',
      message: error.message
    });
  }
});

/**
 * POST /flights/search/best
 *
 * Get the best flight offer (lowest price) with deep link
 *
 * Request body: Same as /flights/search
 *
 * Response: Single flight result object
 */
router.post('/search/best', async (req, res) => {
  try {
    const {
      origin,
      destination,
      departure,
      returnDate,
      passengers = 1,
      cabin = 'economy'
    } = req.body;

    if (!origin || !destination || !departure) {
      return res.status(400).json({
        error: 'Missing required parameters',
        required: ['origin', 'destination', 'departure']
      });
    }

    const searchParams = {
      origin,
      destination,
      departure,
      returnDate,
      passengers: parseInt(passengers, 10),
      cabin
    };

    console.log('Best offer search request:', searchParams);

    const bestOffer = await airlineDeeplinksService.getBestOffer(searchParams);

    if (!bestOffer) {
      return res.status(404).json({
        error: 'No flights found',
        searchParams
      });
    }

    res.json(bestOffer);
  } catch (error) {
    console.error('Best offer search error:', error);

    res.status(500).json({
      error: 'Best offer search failed',
      message: error.message
    });
  }
});

/**
 * POST /flights/search/sms
 *
 * Search flights and return formatted SMS message
 *
 * Request body: Same as /flights/search + includeLinks (boolean, optional)
 *
 * Response:
 * {
 *   "message": "Formatted SMS text...",
 *   "resultsCount": 3
 * }
 */
router.post('/search/sms', async (req, res) => {
  try {
    const {
      origin,
      destination,
      departure,
      returnDate,
      passengers = 1,
      cabin = 'economy',
      limit = 3,
      includeLinks = true
    } = req.body;

    if (!origin || !destination || !departure) {
      return res.status(400).json({
        error: 'Missing required parameters',
        required: ['origin', 'destination', 'departure']
      });
    }

    const searchParams = {
      origin,
      destination,
      departure,
      returnDate,
      passengers: parseInt(passengers, 10),
      cabin
    };

    console.log('SMS format search request:', searchParams);

    const results = await airlineDeeplinksService.searchFlightsWithDeeplinks(
      searchParams,
      parseInt(limit, 10)
    );

    const message = airlineDeeplinksService.formatFlightResultsSMS(results, includeLinks);

    res.json({
      message,
      resultsCount: results.results.length,
      searchParams: results.searchParams
    });
  } catch (error) {
    console.error('SMS format search error:', error);

    res.status(500).json({
      error: 'SMS format search failed',
      message: error.message
    });
  }
});

/**
 * GET /flights/airlines
 *
 * Get list of all supported airlines
 *
 * Response:
 * [
 *   {
 *     "code": "AA",
 *     "name": "American Airlines",
 *     "supportsCabin": true,
 *     "hasDeeplink": true
 *   },
 *   ...
 * ]
 */
router.get('/airlines', (req, res) => {
  try {
    const airlines = airlineDeeplinksService.listSupportedAirlines();

    res.json({
      airlines,
      totalCount: airlines.length
    });
  } catch (error) {
    console.error('List airlines error:', error);

    res.status(500).json({
      error: 'Failed to list airlines',
      message: error.message
    });
  }
});

/**
 * GET /flights/airlines/:code
 *
 * Check if a specific airline is supported
 *
 * Response:
 * {
 *   "supported": true,
 *   "airlineInfo": {
 *     "code": "AA",
 *     "name": "American Airlines",
 *     ...
 *   }
 * }
 */
router.get('/airlines/:code', (req, res) => {
  try {
    const { code } = req.params;
    const result = airlineDeeplinksService.checkAirlineSupport(code.toUpperCase());

    if (!result.supported) {
      return res.status(404).json({
        supported: false,
        airlineCode: code.toUpperCase(),
        message: 'Airline not supported or not found'
      });
    }

    res.json(result);
  } catch (error) {
    console.error('Check airline support error:', error);

    res.status(500).json({
      error: 'Failed to check airline support',
      message: error.message
    });
  }
});

/**
 * POST /flights/track-click
 *
 * Track when a user clicks a deep link
 *
 * Request body:
 * {
 *   "offerId": "duffel_offer_id",
 *   "airlineCode": "AA",
 *   "provider": "airline",
 *   "userId": "phone_or_session_id"
 * }
 *
 * Response:
 * {
 *   "success": true
 * }
 */
router.post('/track-click', async (req, res) => {
  try {
    const { offerId, airlineCode, provider, userId } = req.body;

    if (!offerId || !airlineCode || !provider) {
      return res.status(400).json({
        error: 'Missing required parameters',
        required: ['offerId', 'airlineCode', 'provider']
      });
    }

    await airlineDeeplinksService.trackDeeplinkClick({
      offerId,
      airlineCode,
      provider,
      userId
    });

    res.json({ success: true });
  } catch (error) {
    console.error('Track click error:', error);

    res.status(500).json({
      error: 'Failed to track click',
      message: error.message
    });
  }
});

/**
 * Health check endpoint
 */
router.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    service: 'flights-api',
    timestamp: new Date().toISOString()
  });
});

module.exports = router;
