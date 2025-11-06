/**
 * JWT Token Service
 * Handles signing and verification of booking link tokens
 */

const jwt = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');

/**
 * Get JWT secret from environment
 * @returns {string}
 */
function getSecret() {
  const secret = process.env.BOOK_LINK_SECRET || process.env.JWT_SECRET;

  if (!secret) {
    throw new Error('BOOK_LINK_SECRET or JWT_SECRET environment variable must be set');
  }

  return secret;
}

/**
 * Sign a booking link token
 * @param {Object} payload - Token payload
 * @param {string} payload.offer_id - Duffel Offer ID
 * @param {string} payload.account_id - Account UUID (optional)
 * @param {string} payload.conversation_id - Conversation UUID (optional)
 * @param {number} expiresInMinutes - Token expiration time in minutes (default: 30)
 * @returns {Object} { token, jti, expiresAt }
 */
function signBookingToken(payload, expiresInMinutes = 30) {
  const jti = uuidv4();
  const expiresAt = new Date(Date.now() + expiresInMinutes * 60 * 1000);

  const token = jwt.sign(
    {
      ...payload,
      jti,
      type: 'booking_link'
    },
    getSecret(),
    {
      expiresIn: `${expiresInMinutes}m`,
      issuer: 'otherwhere',
      audience: 'booking'
    }
  );

  return {
    token,
    jti,
    expiresAt
  };
}

/**
 * Verify and decode a booking link token
 * @param {string} token - JWT token
 * @returns {Object} Decoded token payload
 * @throws {Error} If token is invalid or expired
 */
function verifyBookingToken(token) {
  try {
    const decoded = jwt.verify(token, getSecret(), {
      issuer: 'otherwhere',
      audience: 'booking'
    });

    // Verify token type
    if (decoded.type !== 'booking_link') {
      throw new Error('Invalid token type');
    }

    return decoded;
  } catch (error) {
    if (error.name === 'TokenExpiredError') {
      throw new Error('Booking link has expired. Please request a new one.');
    }

    if (error.name === 'JsonWebTokenError') {
      throw new Error('Invalid booking link token.');
    }

    throw error;
  }
}

/**
 * Decode a token without verification (for debugging)
 * @param {string} token - JWT token
 * @returns {Object} Decoded token payload
 */
function decodeToken(token) {
  return jwt.decode(token);
}

/**
 * Check if a token is expired
 * @param {string} token - JWT token
 * @returns {boolean}
 */
function isTokenExpired(token) {
  try {
    const decoded = decodeToken(token);
    if (!decoded || !decoded.exp) return true;

    return decoded.exp * 1000 < Date.now();
  } catch (error) {
    return true;
  }
}

module.exports = {
  signBookingToken,
  verifyBookingToken,
  decodeToken,
  isTokenExpired
};
