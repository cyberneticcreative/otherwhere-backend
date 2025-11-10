/**
 * /go/flights Route
 *
 * Single ingress endpoint for SMS/web flight links
 * Validates params, checks white-label health, and redirects to appropriate provider
 */

const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');

const {
  validateSearchParams,
  normalizeParams,
  selectProvider,
  buildProviderURL
} = require('../providers/flightsLinks');

const whiteLabelHealth = require('../services/whiteLabelHealthCheck');
const sessionManager = require('../services/sessionManager');

/**
 * GET /go/flights
 *
 * Query parameters:
 * - o: Origin IATA code (required)
 * - d: Destination IATA code (required)
 * - dd: Departure date YYYY-MM-DD (required)
 * - rd: Return date YYYY-MM-DD (optional, omit for one-way)
 * - ad: Adults count (default: 1)
 * - ch: Children count (default: 0)
 * - in: Infants count (default: 0)
 * - cls: Cabin class - e|p|b|f (default: e)
 * - cur: Currency code (default: USD)
 * - sid: Session ID for tracking (optional, will generate if missing)
 * - utm_source: UTM source for analytics (optional)
 * - utm_campaign: UTM campaign (optional)
 */
router.get('/', async (req, res) => {
  const startTime = Date.now();
  const requestId = uuidv4().split('-')[0];

  console.log(`[GoFlights:${requestId}] Incoming request:`, req.query);

  try {
    // Step 1: Normalize parameters
    const rawParams = { ...req.query };
    const params = normalizeParams(rawParams);

    // Generate session ID if not provided
    if (!params.sid) {
      params.sid = uuidv4().split('-').join('').substring(0, 12); // 12-char session ID
    }

    console.log(`[GoFlights:${requestId}] Normalized params:`, params);

    // Step 2: Validate parameters
    const validation = validateSearchParams(params);

    if (!validation.valid) {
      console.error(`[GoFlights:${requestId}] Validation failed:`, validation.errors);

      // Return user-friendly error page
      return res.status(400).json({
        success: false,
        error: 'Invalid search parameters',
        details: validation.errors,
        hint: 'Please check your airport codes, dates, and passenger counts.',
        suggestedFixes: generateSuggestedFixes(params, validation.errors)
      });
    }

    // Step 3: Check white-label health
    const isWLHealthy = whiteLabelHealth.getHealthStatus();
    const provider = selectProvider(isWLHealthy);

    console.log(`[GoFlights:${requestId}] White-label health: ${isWLHealthy ? 'healthy' : 'unhealthy'}`);
    console.log(`[GoFlights:${requestId}] Selected provider: ${provider}`);

    // Step 4: Build redirect URL
    const redirectUrl = buildProviderURL(params, provider);
    const buildTime = Date.now() - startTime;

    console.log(`[GoFlights:${requestId}] Redirect URL: ${redirectUrl}`);
    console.log(`[GoFlights:${requestId}] Built in ${buildTime}ms`);

    // Step 5: Log analytics event
    const analyticsEvent = {
      event: 'flight_redirect',
      requestId,
      provider,
      fallbackUsed: provider !== 'whitelabel',
      fallbackReason: isWLHealthy ? null : whiteLabelHealth.getUnhealthyReason(),
      search: {
        route: `${params.o}-${params.d}`,
        tripType: params.rd ? 'round-trip' : 'one-way',
        passengers: params.ad + params.ch + params.in,
        class: params.cls,
        currency: params.cur
      },
      attribution: {
        sessionId: params.sid,
        utmSource: rawParams.utm_source,
        utmCampaign: rawParams.utm_campaign
      },
      performance: {
        buildTimeMs: buildTime,
        totalTimeMs: Date.now() - startTime
      },
      timestamp: new Date().toISOString()
    };

    console.log(`[GoFlights:${requestId}] Analytics:`, JSON.stringify(analyticsEvent));

    // Step 6: Store search in session (if we have user context)
    // This allows us to reconcile conversions later
    if (rawParams.phone || rawParams.userId) {
      const userId = rawParams.phone || rawParams.userId;

      await sessionManager.updateSession(userId, {
        lastFlightSearch: {
          ...params,
          provider,
          redirectUrl,
          requestId,
          timestamp: Date.now()
        }
      });

      console.log(`[GoFlights:${requestId}] Saved to session for user: ${userId}`);
    }

    // Step 7: Redirect to provider
    const totalTime = Date.now() - startTime;
    console.log(`[GoFlights:${requestId}] ⏱️ TOTAL request time: ${totalTime}ms`);

    // Add server timing header for debugging
    res.set('Server-Timing', `total;dur=${totalTime}, build;dur=${buildTime}`);

    res.redirect(302, redirectUrl);

  } catch (error) {
    const totalTime = Date.now() - startTime;

    console.error(`[GoFlights:${requestId}] Error:`, error);
    console.error(`[GoFlights:${requestId}] ⏱️ Failed after ${totalTime}ms`);

    // Fallback to Google Flights if something goes wrong
    const fallbackUrl = 'https://www.google.com/travel/flights';

    console.log(`[GoFlights:${requestId}] Using emergency fallback: ${fallbackUrl}`);

    res.redirect(302, fallbackUrl);
  }
});

/**
 * GET /go/flights/health
 * Health check for the /go/flights service
 */
router.get('/health', (req, res) => {
  const wlHealth = whiteLabelHealth.getStats();

  res.json({
    status: 'ok',
    service: 'go-flights',
    timestamp: new Date().toISOString(),
    whiteLabel: {
      isHealthy: wlHealth.isHealthy,
      host: wlHealth.host,
      p95Latency: wlHealth.rolling60s.p95Latency,
      successRate: wlHealth.rolling60s.successRate
    }
  });
});

/**
 * GET /go/flights/stats
 * Statistics and analytics for debugging
 */
router.get('/stats', (req, res) => {
  const wlStats = whiteLabelHealth.getStats();

  res.json({
    whiteLabelHealth: wlStats,
    timestamp: new Date().toISOString()
  });
});

/**
 * POST /go/flights/check-wl
 * Trigger a manual white-label health check
 */
router.post('/check-wl', async (req, res) => {
  console.log('[GoFlights] Manual white-label health check requested');

  const result = await whiteLabelHealth.manualCheck();

  res.json({
    ...result,
    currentStatus: whiteLabelHealth.getHealthStatus(),
    stats: whiteLabelHealth.getStats()
  });
});

/**
 * Generate suggested fixes for common validation errors
 * @param {Object} params - Search parameters
 * @param {Array} errors - Validation errors
 * @returns {Object} Suggested fixes
 */
function generateSuggestedFixes(params, errors) {
  const fixes = {};

  // Check for date issues
  if (errors.some(e => e.includes('future'))) {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const tomorrowStr = tomorrow.toISOString().split('T')[0];

    fixes.departureDate = tomorrowStr;

    if (params.rd) {
      const dayAfter = new Date(tomorrow);
      dayAfter.setDate(dayAfter.getDate() + 7);
      fixes.returnDate = dayAfter.toISOString().split('T')[0];
    }
  }

  // Check for return date before departure
  if (errors.some(e => e.includes('Return date must be after'))) {
    if (params.dd) {
      const depart = new Date(params.dd);
      depart.setDate(depart.getDate() + 7);
      fixes.returnDate = depart.toISOString().split('T')[0];
    }
  }

  // Check for infant/adult ratio
  if (errors.some(e => e.includes('infants'))) {
    fixes.infants = params.ad || 1;
  }

  // Check for airport codes
  if (errors.some(e => e.includes('airport code'))) {
    fixes.note = 'Please use 3-letter IATA airport codes (e.g., LAX, JFK, LHR)';
  }

  return fixes;
}

module.exports = router;
