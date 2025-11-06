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
 * Create a Duffel Links v2 session for flights
 * @param {Object} params - Session parameters
 * @param {string} params.conversationId - Conversation UUID
 * @param {string} params.phone - User's phone number
 * @param {Object} params.searchParams - Flight search parameters
 * @returns {Promise<Object>} Duffel session
 */
async function createFlightSession(params) {
  const { conversationId, phone, searchParams } = params;

  try {
    // Check if Duffel is configured
    if (!process.env.DUFFEL_ACCESS_TOKEN) {
      throw new Error('DUFFEL_ACCESS_TOKEN not configured. Please add it to your environment variables.');
    }

    console.log('Creating Duffel Links session:', {
      conversationId,
      phone,
      searchParams
    });

    // Build session request per Duffel Links v2 API
    const requestBody = {
      data: {
        reference: phone || `session_${Date.now()}`,
        success_url: REDIRECT_URLS.success_url,
        failure_url: REDIRECT_URLS.failure_url,
        abandonment_url: REDIRECT_URLS.cancel_url,
        primary_color: BRAND_CONFIG.primary_color,
        logo_url: BRAND_CONFIG.logo_url,
        markup_rate: FEE_CONFIG.amount, // 2.00 = 2%
        flights: { enabled: true },
        stays: { enabled: false }
      }
    };

    // Create session via Duffel REST API
    const response = await axios.post(
      'https://api.duffel.com/links/sessions',
      requestBody,
      {
        headers: {
          'Accept': 'application/json',
          'Content-Type': 'application/json',
          'Duffel-Version': 'v2',
          'Authorization': `Bearer ${process.env.DUFFEL_ACCESS_TOKEN}`
        }
      }
    );

    const session = response.data.data;

    console.log('✅ Duffel session created:', {
      url: session.url
    });

    // Log event (optional, only if database available)
    if (conversationId) {
      try {
        await logEvent('link_session_created', 'link_session', conversationId, {
          session_url: session.url,
          search_params: searchParams
        });
      } catch (logError) {
        console.warn('⚠️ Could not log event to database:', logError.message);
      }
    }

    return {
      id: `session_${Date.now()}`, // Links v2 doesn't return an ID
      url: session.url,
      expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(), // 24 hours
      metadata: { phone, searchParams }
    };

  } catch (error) {
    console.error('Failed to create Duffel Links session:', error.response?.data || error.message);

    // Try to log failure (optional)
    if (conversationId) {
      try {
        await logEvent('link_session_failed', 'link_session', conversationId, {
          error: error.response?.data || error.message,
          search_params: searchParams
        });
      } catch (logError) {
        console.warn('⚠️ Could not log error to database:', logError.message);
      }
    }

    const errorMessage = error.response?.data?.errors?.[0]?.message || error.message;
    throw new Error(`Duffel Links error: ${errorMessage}`);
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
 * Format SMS message with Links URL
 * @param {Object} params
 * @param {string} params.sessionUrl - Duffel Links URL
 * @param {Object} params.searchParams - Search parameters
 * @param {string} params.expiresAt - Session expiration
 * @returns {string} Formatted SMS message
 */
function formatLinksSMS(params) {
  const { sessionUrl, searchParams, expiresAt } = params;
  const { origin, destination, departure_date, return_date } = searchParams;

  let message = `✈️ Found flight options for you!\n\n`;

  if (origin && destination) {
    message += `Route: ${origin} → ${destination}\n`;
  }

  if (departure_date) {
    message += `Departure: ${departure_date}\n`;
  }

  if (return_date) {
    message += `Return: ${return_date}\n`;
  }

  message += `\nBook securely here:\n${sessionUrl}\n\n`;
  message += `Includes fare monitoring + rebooking support.\n`;

  // Add expiration warning if within 24 hours
  if (expiresAt) {
    const expiryDate = new Date(expiresAt);
    const hoursUntilExpiry = (expiryDate - new Date()) / (1000 * 60 * 60);

    if (hoursUntilExpiry < 24) {
      message += `\n⏰ Link expires in ${Math.round(hoursUntilExpiry)} hours`;
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
