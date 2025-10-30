const dayjs = require('dayjs');

/**
 * Format phone number to E.164 format
 * @param {string} phoneNumber - Raw phone number
 * @returns {string} Formatted phone number
 */
function formatPhoneNumber(phoneNumber) {
  // Remove all non-digit characters
  const digits = phoneNumber.replace(/\D/g, '');

  // Add + prefix if not present
  if (!phoneNumber.startsWith('+')) {
    return `+${digits}`;
  }

  return `+${digits}`;
}

/**
 * Parse date string to ISO format
 * @param {string} dateString - Date string in various formats
 * @returns {string|null} ISO date string or null
 */
function parseDate(dateString) {
  const parsed = dayjs(dateString);
  return parsed.isValid() ? parsed.format('YYYY-MM-DD') : null;
}

/**
 * Calculate duration between two dates in days
 * @param {string} startDate - Start date (YYYY-MM-DD)
 * @param {string} endDate - End date (YYYY-MM-DD)
 * @returns {number} Number of days
 */
function calculateDuration(startDate, endDate) {
  const start = dayjs(startDate);
  const end = dayjs(endDate);
  return end.diff(start, 'day');
}

/**
 * Format currency amount
 * @param {number} amount - Amount
 * @param {string} currency - Currency code (default: USD)
 * @returns {string} Formatted currency string
 */
function formatCurrency(amount, currency = 'USD') {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency
  }).format(amount);
}

/**
 * Truncate text to a maximum length
 * @param {string} text - Text to truncate
 * @param {number} maxLength - Maximum length
 * @param {string} suffix - Suffix to add (default: '...')
 * @returns {string} Truncated text
 */
function truncateText(text, maxLength, suffix = '...') {
  if (text.length <= maxLength) {
    return text;
  }
  return text.substring(0, maxLength - suffix.length) + suffix;
}

/**
 * Validate email address
 * @param {string} email - Email address
 * @returns {boolean} True if valid
 */
function isValidEmail(email) {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

/**
 * Validate phone number (basic validation)
 * @param {string} phoneNumber - Phone number
 * @returns {boolean} True if valid
 */
function isValidPhoneNumber(phoneNumber) {
  const phoneRegex = /^\+?[1-9]\d{1,14}$/;
  return phoneRegex.test(phoneNumber.replace(/[\s\-\(\)]/g, ''));
}

/**
 * Generate random ID
 * @param {number} length - Length of ID
 * @returns {string} Random ID
 */
function generateRandomId(length = 8) {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let result = '';
  for (let i = 0; i < length; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

/**
 * Sleep for a specified duration
 * @param {number} ms - Milliseconds to sleep
 * @returns {Promise<void>}
 */
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Sanitize user input
 * @param {string} input - User input
 * @returns {string} Sanitized input
 */
function sanitizeInput(input) {
  return input
    .trim()
    .replace(/[<>]/g, '') // Remove potential HTML tags
    .substring(0, 10000); // Limit length
}

/**
 * Extract destination from natural language
 * @param {string} text - User message
 * @returns {string|null} Extracted destination or null
 */
function extractDestination(text) {
  // Simple pattern matching for destinations
  const patterns = [
    /(?:go(?:ing)? to|visit|travel to|trip to)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)/i,
    /(?:in|at)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)/i
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) {
      return match[1];
    }
  }

  return null;
}

/**
 * Format trip summary for display
 * @param {Object} tripData - Trip data object
 * @returns {string} Formatted summary
 */
function formatTripSummary(tripData) {
  const parts = [];

  if (tripData.destination) {
    parts.push(`Destination: ${tripData.destination}`);
  }

  if (tripData.startDate && tripData.endDate) {
    const duration = calculateDuration(tripData.startDate, tripData.endDate);
    parts.push(`Dates: ${tripData.startDate} to ${tripData.endDate} (${duration} days)`);
  }

  if (tripData.travelers) {
    parts.push(`Travelers: ${tripData.travelers}`);
  }

  if (tripData.budget) {
    if (tripData.budget.min && tripData.budget.max) {
      parts.push(`Budget: ${formatCurrency(tripData.budget.min)} - ${formatCurrency(tripData.budget.max)}`);
    } else if (tripData.budget.amount) {
      parts.push(`Budget: ${formatCurrency(tripData.budget.amount)}`);
    }
  }

  if (tripData.interests && tripData.interests.length > 0) {
    parts.push(`Interests: ${tripData.interests.join(', ')}`);
  }

  return parts.join('\n');
}

/**
 * Check if text contains trip search intent
 * @param {string} text - User message
 * @returns {boolean} True if likely a trip search intent
 */
function hasTripSearchIntent(text) {
  const keywords = [
    'plan', 'trip', 'travel', 'vacation', 'holiday',
    'visit', 'going to', 'want to go', 'fly to',
    'book', 'reserve', 'looking for'
  ];

  const lowerText = text.toLowerCase();
  return keywords.some(keyword => lowerText.includes(keyword));
}

module.exports = {
  formatPhoneNumber,
  parseDate,
  calculateDuration,
  formatCurrency,
  truncateText,
  isValidEmail,
  isValidPhoneNumber,
  generateRandomId,
  sleep,
  sanitizeInput,
  extractDestination,
  formatTripSummary,
  hasTripSearchIntent
};
