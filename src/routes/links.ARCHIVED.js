/**
 * Duffel Links Routes
 * Handle creation and management of Duffel Links v2 sessions
 */

const express = require('express');
const router = express.Router();
const duffelLinks = require('../services/duffelLinksService');
const {
  getOrCreateConversation,
  createLinkSession,
  getLinkSessionsByConversation
} = require('../db/queries');

/**
 * POST /links/session
 * Create a new Duffel Links v2 session
 *
 * Body:
 * {
 *   phone: "+1234567890",
 *   searchParams: {
 *     origin: "YVR",
 *     destination: "NRT",
 *     departure_date: "2025-11-15",
 *     return_date: "2025-11-22",
 *     passengers: 1,
 *     cabin_class: "economy"
 *   }
 * }
 *
 * Returns: { session_id, url, expires_at }
 */
router.post('/session', async (req, res) => {
  try {
    const { phone, searchParams } = req.body;

    // Validate required fields
    if (!phone) {
      return res.status(400).json({
        error: 'Phone number is required'
      });
    }

    if (!searchParams) {
      return res.status(400).json({
        error: 'Search parameters are required'
      });
    }

    // Normalize search params
    const normalizedParams = duffelLinks.normalizeSearchParams(searchParams);

    // Validate search params
    const validation = duffelLinks.validateSearchParams(normalizedParams);
    if (!validation.valid) {
      return res.status(400).json({
        error: 'Missing required search parameters',
        missing: validation.missing,
        question: duffelLinks.generateClarifyingQuestion(validation.missing)
      });
    }

    // Get or create conversation
    const conversation = await getOrCreateConversation(
      phone,
      'browse',
      normalizedParams
    );

    // Create Duffel Links session
    const session = await duffelLinks.createFlightSession({
      conversationId: conversation.id,
      phone: phone,
      searchParams: normalizedParams
    });

    // Store session in database
    await createLinkSession({
      conversationId: conversation.id,
      duffelSessionId: session.id,
      sessionUrl: session.url,
      expiresAt: session.expires_at,
      searchParams: normalizedParams
    });

    // Return session details
    res.json({
      session_id: session.id,
      url: session.url,
      expires_at: session.expires_at,
      conversation_id: conversation.id
    });

  } catch (error) {
    console.error('Error creating Links session:', error);
    res.status(500).json({
      error: 'Failed to create booking session',
      message: error.message
    });
  }
});

/**
 * GET /links/sessions/:conversationId
 * Get all Links sessions for a conversation
 */
router.get('/sessions/:conversationId', async (req, res) => {
  try {
    const { conversationId } = req.params;

    const sessions = await getLinkSessionsByConversation(conversationId);

    res.json({
      conversation_id: conversationId,
      sessions: sessions
    });

  } catch (error) {
    console.error('Error fetching sessions:', error);
    res.status(500).json({
      error: 'Failed to fetch sessions',
      message: error.message
    });
  }
});

/**
 * POST /links/format-sms
 * Format a Links session as SMS message
 *
 * Body: { session_url, search_params, expires_at }
 * Returns: { message }
 */
router.post('/format-sms', async (req, res) => {
  try {
    const { session_url, search_params, expires_at } = req.body;

    if (!session_url) {
      return res.status(400).json({
        error: 'Session URL is required'
      });
    }

    const message = duffelLinks.formatLinksSMS({
      sessionUrl: session_url,
      searchParams: search_params || {},
      expiresAt: expires_at
    });

    res.json({ message });

  } catch (error) {
    console.error('Error formatting SMS:', error);
    res.status(500).json({
      error: 'Failed to format SMS',
      message: error.message
    });
  }
});

module.exports = router;
