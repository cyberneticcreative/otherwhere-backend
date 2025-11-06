/**
 * Duffel API Client
 * Base wrapper for Duffel API with error handling and logging
 */

const { Duffel } = require('@duffel/api');

// Initialize Duffel client
const duffel = new Duffel({
  token: process.env.DUFFEL_ACCESS_TOKEN,
  debug: process.env.NODE_ENV === 'development'
});

// Debug: Check if Links API is available
if (process.env.DUFFEL_ACCESS_TOKEN) {
  console.log('🔍 Duffel client initialized');
  console.log('🔍 Token present:', !!process.env.DUFFEL_ACCESS_TOKEN);
  console.log('🔍 duffel.links available:', !!duffel.links);
  console.log('🔍 duffel.links.sessions available:', !!duffel?.links?.sessions);
}

/**
 * Test Duffel API connection
 * @returns {Promise<boolean>}
 */
async function testConnection() {
  try {
    // Simple test: list aircraft (no params needed)
    const response = await duffel.aircraft.list({ limit: 1 });
    console.log('✅ Duffel API connection successful');
    return true;
  } catch (error) {
    console.error('❌ Duffel API connection failed:', error.message);
    return false;
  }
}

/**
 * Check if Duffel is configured
 * @returns {boolean}
 */
function isConfigured() {
  return !!process.env.DUFFEL_ACCESS_TOKEN;
}

/**
 * Get API mode (test or live)
 * @returns {string}
 */
function getApiMode() {
  const token = process.env.DUFFEL_ACCESS_TOKEN || '';
  return token.startsWith('duffel_test_') ? 'test' : 'live';
}

/**
 * Handle Duffel API errors
 * @param {Error} error
 * @param {string} context
 */
function handleDuffelError(error, context = 'Duffel API') {
  console.error(`${context} error:`, {
    message: error.message,
    type: error.type,
    code: error.code,
    errors: error.errors
  });

  // Return user-friendly error message
  if (error.message.includes('not found')) {
    return 'Resource not found. Please check your request.';
  }

  if (error.message.includes('expired')) {
    return 'This session has expired. Please start a new search.';
  }

  if (error.message.includes('invalid')) {
    return 'Invalid request. Please check your input and try again.';
  }

  return 'An error occurred. Please try again or contact support.';
}

module.exports = {
  duffel,
  testConnection,
  isConfigured,
  getApiMode,
  handleDuffelError
};
