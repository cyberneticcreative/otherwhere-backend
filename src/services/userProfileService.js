/**
 * User Profile Service
 * Manages user profiles in PostgreSQL
 */

const db = require('../db');

/**
 * Normalize phone number format
 * @param {string} phone - Phone number in any format
 * @returns {string} Normalized phone number
 */
function normalizePhone(phone) {
  if (!phone) return null;

  // Remove all non-digit characters
  let cleaned = phone.replace(/\D/g, '');

  // Add +1 prefix for US numbers if not present
  if (cleaned.length === 10) {
    cleaned = '1' + cleaned;
  }

  // Add + prefix
  if (!cleaned.startsWith('+')) {
    cleaned = '+' + cleaned;
  }

  return cleaned;
}

/**
 * Get user by phone number
 * @param {string} phoneNumber - User's phone number
 * @returns {Promise<Object|null>} User object or null
 */
async function getUserByPhone(phoneNumber) {
  if (!db.isConfigured) {
    console.warn('Database not configured - getUserByPhone skipped');
    return null;
  }

  const normalizedPhone = normalizePhone(phoneNumber);

  const result = await db.query(
    'SELECT * FROM users WHERE phone_number = $1',
    [normalizedPhone]
  );

  return result.rows[0] || null;
}

/**
 * Get user by ID
 * @param {string} userId - User's UUID
 * @returns {Promise<Object|null>} User object or null
 */
async function getUserById(userId) {
  if (!db.isConfigured) {
    console.warn('Database not configured - getUserById skipped');
    return null;
  }

  const result = await db.query(
    'SELECT * FROM users WHERE id = $1',
    [userId]
  );

  return result.rows[0] || null;
}

/**
 * Create a new user
 * @param {Object} userData - User data
 * @returns {Promise<Object>} Created user object
 */
async function createUser(userData) {
  if (!db.isConfigured) {
    throw new Error('Database not configured');
  }

  const {
    phoneNumber,
    firstName,
    lastName,
    dateOfBirth,
    nationality,
    gender,
    knownTravelerNumber,
    passportNumber,
    passportExpiry,
    homeAirport,
    onboardedVia
  } = userData;

  const normalizedPhone = normalizePhone(phoneNumber);

  // Check if user already exists
  const existing = await getUserByPhone(normalizedPhone);
  if (existing) {
    throw new Error('User with this phone number already exists');
  }

  const result = await db.query(
    `INSERT INTO users (
      phone_number, first_name, last_name, date_of_birth,
      nationality, gender, known_traveler_number,
      passport_number, passport_expiry, home_airport, onboarded_via
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
    RETURNING *`,
    [
      normalizedPhone,
      firstName || null,
      lastName || null,
      dateOfBirth || null,
      nationality || null,
      gender || null,
      knownTravelerNumber || null,
      passportNumber || null,
      passportExpiry || null,
      homeAirport || null,
      onboardedVia || null
    ]
  );

  console.log(`✅ Created user profile for ${normalizedPhone}`);
  return result.rows[0];
}

/**
 * Update user profile
 * @param {string} phoneNumber - User's phone number
 * @param {Object} updates - Fields to update
 * @returns {Promise<Object>} Updated user object
 */
async function updateUser(phoneNumber, updates) {
  if (!db.isConfigured) {
    throw new Error('Database not configured');
  }

  const normalizedPhone = normalizePhone(phoneNumber);

  // Get current user
  const user = await getUserByPhone(normalizedPhone);
  if (!user) {
    throw new Error('User not found');
  }

  const {
    firstName,
    lastName,
    dateOfBirth,
    nationality,
    gender,
    knownTravelerNumber,
    passportNumber,
    passportExpiry,
    homeAirport
  } = updates;

  const result = await db.query(
    `UPDATE users SET
      first_name = COALESCE($2, first_name),
      last_name = COALESCE($3, last_name),
      date_of_birth = COALESCE($4, date_of_birth),
      nationality = COALESCE($5, nationality),
      gender = COALESCE($6, gender),
      known_traveler_number = COALESCE($7, known_traveler_number),
      passport_number = COALESCE($8, passport_number),
      passport_expiry = COALESCE($9, passport_expiry),
      home_airport = COALESCE($10, home_airport),
      updated_at = NOW()
    WHERE phone_number = $1
    RETURNING *`,
    [
      normalizedPhone,
      firstName,
      lastName,
      dateOfBirth,
      nationality,
      gender,
      knownTravelerNumber,
      passportNumber,
      passportExpiry,
      homeAirport
    ]
  );

  console.log(`✅ Updated user profile for ${normalizedPhone}`);
  return result.rows[0];
}

/**
 * Get or create user (upsert pattern)
 * @param {string} phoneNumber - User's phone number
 * @param {Object} userData - Optional user data for creation
 * @returns {Promise<Object>} User object
 */
async function getOrCreateUser(phoneNumber, userData = {}) {
  if (!db.isConfigured) {
    console.warn('Database not configured - getOrCreateUser skipped');
    return null;
  }

  const normalizedPhone = normalizePhone(phoneNumber);

  let user = await getUserByPhone(normalizedPhone);

  if (!user) {
    user = await createUser({
      phoneNumber: normalizedPhone,
      ...userData
    });
    console.log(`📝 Created new user profile for ${normalizedPhone}`);
  }

  return user;
}

/**
 * Delete user and all related data
 * @param {string} phoneNumber - User's phone number
 * @returns {Promise<boolean>} Success status
 */
async function deleteUser(phoneNumber) {
  if (!db.isConfigured) {
    throw new Error('Database not configured');
  }

  const normalizedPhone = normalizePhone(phoneNumber);

  const result = await db.query(
    'DELETE FROM users WHERE phone_number = $1 RETURNING id',
    [normalizedPhone]
  );

  if (result.rows.length === 0) {
    return false;
  }

  console.log(`🗑️ Deleted user profile for ${normalizedPhone}`);
  return true;
}

/**
 * Get user profile with all related data (loyalty programs, preferences)
 * @param {string} phoneNumber - User's phone number
 * @returns {Promise<Object|null>} Complete user profile
 */
async function getFullProfile(phoneNumber) {
  if (!db.isConfigured) {
    console.warn('Database not configured - getFullProfile skipped');
    return null;
  }

  const normalizedPhone = normalizePhone(phoneNumber);
  const user = await getUserByPhone(normalizedPhone);

  if (!user) {
    return null;
  }

  // Get loyalty programs
  const airlinePrograms = await db.query(
    'SELECT * FROM airline_loyalty_programs WHERE user_id = $1 ORDER BY created_at',
    [user.id]
  );

  const hotelPrograms = await db.query(
    'SELECT * FROM hotel_loyalty_programs WHERE user_id = $1 ORDER BY created_at',
    [user.id]
  );

  // Get preferences
  const preferences = await db.query(
    'SELECT * FROM user_preferences WHERE user_id = $1',
    [user.id]
  );

  return {
    ...user,
    airlineLoyaltyPrograms: airlinePrograms.rows || [],
    hotelLoyaltyPrograms: hotelPrograms.rows || [],
    preferences: preferences.rows[0] || null
  };
}

/**
 * Check if user exists
 * @param {string} phoneNumber - User's phone number
 * @returns {Promise<boolean>} True if user exists
 */
async function userExists(phoneNumber) {
  if (!db.isConfigured) {
    return false;
  }

  const user = await getUserByPhone(phoneNumber);
  return !!user;
}

module.exports = {
  normalizePhone,
  getUserByPhone,
  getUserById,
  createUser,
  updateUser,
  getOrCreateUser,
  deleteUser,
  getFullProfile,
  userExists
};
