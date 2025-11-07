/**
 * Duffel Links v2 Service
 * Creates and manages Duffel Links sessions for hosted checkout
 */

const axios = require('axios');
const { handleDuffelError } = require('./duffelClient');
const { logEvent } = require('../db/queries');

/**
 * Brand configuration
 */
const BRAND_CONFIG = {
  name: process.env.BRAND_NAME || 'Otherwhere',
  logo_url: process.env.BRAND_LOGO_URL || 'https://otherwhere.app/logo.png',
  primary_color: process.env.BRAND_COLOR || '#E75C1E',
  font: 'Inter'
};

/**
 * Fee configuration (2% with $10 minimum)
 */
const FEE_CONFIG = {
  type: 'percentage',
  amount: '2.00', // 2%
  minimum_amount: '10.00', // $10 minimum
  currency: 'USD',
  label: 'Otherwhere booking support fee'
};

/**
 * Redirect URLs
 */
const REDIRECT_URLS = {
  success_url: process.env.SUCCESS_URL || 'https://otherwhere.app/success',
  cancel_url: process.env.CANCEL_URL || 'https://otherwhere.app/cancel',
  failure_url: process.env.FAILURE_URL || 'https://otherwhere.app/failure'
};

/**
 * Create a custom booking session (replaces deprecated Duffel Links)
 * Generates a unique URL to your own hosted booking page
 * @param {Object} params - Session parameters
 * @param {string} params.conversationId - Conversation UUID
 * @param {string} params.phone - User's phone number
 * @param {Object} params.searchParams - Flight search parameters
 * @returns {Promise<Object>} Booking session
 */
async function createFlightSession(params) {
  const { conversationId, phone, searchParams } = params;

  try {
    console.log('Creating custom booking session:', {
      conversationId,
      phone,
      searchParams
    });

    // Generate unique session ID
    const sessionId = `bk_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    // Build booking URL with search parameters
    const baseUrl = process.env.BOOKING_PAGE_URL || 'https://otherwhere.app/book';
    const queryParams = new URLSearchParams({
      session: sessionId,
      origin: searchParams.origin || '',
      destination: searchParams.destination || '',
      departure: searchParams.departure_date || '',
      ...(searchParams.return_date && { return: searchParams.return_date }),
      passengers: searchParams.passengers || 1,
      cabin: searchParams.cabin_class || 'economy',
      phone: phone || ''
    });

    const bookingUrl = `${baseUrl}?${queryParams.toString()}`;
    const expiresAt = new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString(); // 48 hours

    console.log('✅ Custom booking session created:', {
      sessionId,
      url: bookingUrl
    });

    // Log event (optional, only if database available)
    if (conversationId) {
      try {
        await logEvent('booking_session_created', 'booking_session', conversationId, {
          session_id: sessionId,
          session_url: bookingUrl,
          search_params: searchParams
        });
      } catch (logError) {
        console.warn('⚠️ Could not log event to database:', logError.message);
      }
    }

    return {
      id: sessionId,
      url: bookingUrl,
      expires_at: expiresAt,
      metadata: { phone, searchParams }
    };

  } catch (error) {
    console.error('Failed to create booking session:', error.message);

    // Try to log failure (optional)
    if (conversationId) {
      try {
        await logEvent('booking_session_failed', 'booking_session', conversationId, {
          error: error.message,
          search_params: searchParams
        });
      } catch (logError) {
        console.warn('⚠️ Could not log error to database:', logError.message);
      }
    }

    throw new Error(`Booking session error: ${error.message}`);
  }
}

/**
 * Get a Duffel Links session by ID
 * @param {string} sessionId - Duffel session ID
 * @returns {Promise<Object>} Session details
 */
async function getSession(sessionId) {
  try {
    const session = await duffel.links.sessions.get(sessionId);
    return session;
  } catch (error) {
    console.error('Failed to get Duffel session:', error);
    throw new Error(handleDuffelError(error, 'Get session'));
  }
}

/**
 * Format SMS message with booking URL
 * @param {Object} params
 * @param {string} params.sessionUrl - Booking page URL
 * @param {Object} params.searchParams - Search parameters
 * @param {string} params.expiresAt - Session expiration
 * @returns {string} Formatted SMS message
 */
function formatLinksSMS(params) {
  const { sessionUrl, searchParams, expiresAt } = params;
  const { origin, destination, departure_date, return_date } = searchParams;

  let message = `✈️ Ready to book your flights!\n\n`;

  if (origin && destination) {
    message += `${origin} → ${destination}\n`;
  }

  if (departure_date) {
    message += `Departing: ${departure_date}\n`;
  }

  if (return_date) {
    message += `Returning: ${return_date}\n`;
  }

  message += `\n📲 Book now:\n${sessionUrl}\n\n`;
  message += `✓ Secure payment\n`;
  message += `✓ Instant confirmation\n`;
  message += `✓ 24/7 support included`;

  // Add expiration warning if within 24 hours
  if (expiresAt) {
    const expiryDate = new Date(expiresAt);
    const hoursUntilExpiry = (expiryDate - new Date()) / (1000 * 60 * 60);

    if (hoursUntilExpiry < 48) {
      message += `\n\n⏰ Link valid for ${Math.round(hoursUntilExpiry)} hours`;
    }
  }

  return message;
}

/**
 * Extract trip details from conversation for Links session
 * @param {Object} searchParams - Raw search parameters
 * @returns {Object} Normalized search params
 */
function normalizeSearchParams(searchParams) {
  return {
    origin: searchParams.origin || searchParams.from || null,
    destination: searchParams.destination || searchParams.to || null,
    departure_date: searchParams.departure_date || searchParams.checkIn || searchParams.departureDate || null,
    return_date: searchParams.return_date || searchParams.checkOut || searchParams.returnDate || null,
    passengers: searchParams.passengers || searchParams.travelers || 1,
    cabin_class: searchParams.cabin_class || searchParams.class || 'economy'
  };
}

/**
 * Validate search parameters
 * @param {Object} searchParams
 * @returns {Object} { valid: boolean, missing: string[] }
 */
function validateSearchParams(searchParams) {
  const required = ['origin', 'destination', 'departure_date'];
  const missing = [];

  for (const field of required) {
    if (!searchParams[field]) {
      missing.push(field);
    }
  }

  return {
    valid: missing.length === 0,
    missing
  };
}

/**
 * Generate clarifying question for missing parameters
 * @param {string[]} missing - Missing parameter names
 * @returns {string} Question to ask user
 */
function generateClarifyingQuestion(missing) {
  const questions = {
    origin: "Where are you flying from?",
    destination: "Where would you like to go?",
    departure_date: "When do you want to leave?",
    return_date: "When do you want to return? (or reply 'one-way')"
  };

  if (missing.length === 1) {
    return questions[missing[0]];
  }

  return `I need a few more details:\n${missing.map(m => `• ${questions[m]}`).join('\n')}`;
}

module.exports = {
  createFlightSession,
  getSession,
  formatLinksSMS,
  normalizeSearchParams,
  validateSearchParams,
  generateClarifyingQuestion
};
