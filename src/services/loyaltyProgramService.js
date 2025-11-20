/**
 * Loyalty Program Service
 * Manages airline and hotel loyalty programs for users
 */

const db = require('../db');
const userProfileService = require('./userProfileService');

/**
 * AIRLINE LOYALTY PROGRAMS
 */

/**
 * Get all airline loyalty programs for a user
 * @param {string} phoneNumber - User's phone number
 * @returns {Promise<Array>} Array of airline loyalty programs
 */
async function getAirlineLoyaltyPrograms(phoneNumber) {
  if (!db.isConfigured) {
    console.warn('Database not configured - getAirlineLoyaltyPrograms skipped');
    return [];
  }

  const user = await userProfileService.getUserByPhone(phoneNumber);
  if (!user) {
    return [];
  }

  const result = await db.query(
    'SELECT * FROM airline_loyalty_programs WHERE user_id = $1 ORDER BY created_at',
    [user.id]
  );

  return result.rows;
}

/**
 * Add airline loyalty program for a user
 * @param {string} phoneNumber - User's phone number
 * @param {Object} programData - Loyalty program data
 * @returns {Promise<Object>} Created program
 */
async function addAirlineLoyaltyProgram(phoneNumber, programData) {
  if (!db.isConfigured) {
    throw new Error('Database not configured');
  }

  const user = await userProfileService.getOrCreateUser(phoneNumber);
  if (!user) {
    throw new Error('Could not find or create user');
  }

  const { airlineName, programName, programNumber } = programData;

  if (!programNumber) {
    throw new Error('Program number is required');
  }

  const result = await db.query(
    `INSERT INTO airline_loyalty_programs (
      user_id, airline_name, program_name, program_number
    ) VALUES ($1, $2, $3, $4)
    RETURNING *`,
    [user.id, airlineName, programName || null, programNumber]
  );

  console.log(`✅ Added airline loyalty program for ${phoneNumber}: ${airlineName}`);
  return result.rows[0];
}

/**
 * Update airline loyalty program
 * @param {string} programId - Program UUID
 * @param {Object} updates - Fields to update
 * @returns {Promise<Object>} Updated program
 */
async function updateAirlineLoyaltyProgram(programId, updates) {
  if (!db.isConfigured) {
    throw new Error('Database not configured');
  }

  const { airlineName, programName, programNumber } = updates;

  const result = await db.query(
    `UPDATE airline_loyalty_programs SET
      airline_name = COALESCE($2, airline_name),
      program_name = COALESCE($3, program_name),
      program_number = COALESCE($4, program_number),
      updated_at = NOW()
    WHERE id = $1
    RETURNING *`,
    [programId, airlineName, programName, programNumber]
  );

  if (result.rows.length === 0) {
    throw new Error('Airline loyalty program not found');
  }

  console.log(`✅ Updated airline loyalty program ${programId}`);
  return result.rows[0];
}

/**
 * Delete airline loyalty program
 * @param {string} programId - Program UUID
 * @returns {Promise<boolean>} Success status
 */
async function deleteAirlineLoyaltyProgram(programId) {
  if (!db.isConfigured) {
    throw new Error('Database not configured');
  }

  const result = await db.query(
    'DELETE FROM airline_loyalty_programs WHERE id = $1 RETURNING id',
    [programId]
  );

  if (result.rows.length === 0) {
    return false;
  }

  console.log(`🗑️ Deleted airline loyalty program ${programId}`);
  return true;
}

/**
 * HOTEL LOYALTY PROGRAMS
 */

/**
 * Get all hotel loyalty programs for a user
 * @param {string} phoneNumber - User's phone number
 * @returns {Promise<Array>} Array of hotel loyalty programs
 */
async function getHotelLoyaltyPrograms(phoneNumber) {
  if (!db.isConfigured) {
    console.warn('Database not configured - getHotelLoyaltyPrograms skipped');
    return [];
  }

  const user = await userProfileService.getUserByPhone(phoneNumber);
  if (!user) {
    return [];
  }

  const result = await db.query(
    'SELECT * FROM hotel_loyalty_programs WHERE user_id = $1 ORDER BY created_at',
    [user.id]
  );

  return result.rows;
}

/**
 * Add hotel loyalty program for a user
 * @param {string} phoneNumber - User's phone number
 * @param {Object} programData - Loyalty program data
 * @returns {Promise<Object>} Created program
 */
async function addHotelLoyaltyProgram(phoneNumber, programData) {
  if (!db.isConfigured) {
    throw new Error('Database not configured');
  }

  const user = await userProfileService.getOrCreateUser(phoneNumber);
  if (!user) {
    throw new Error('Could not find or create user');
  }

  const { hotelChain, programName, programNumber } = programData;

  if (!programNumber) {
    throw new Error('Program number is required');
  }

  const result = await db.query(
    `INSERT INTO hotel_loyalty_programs (
      user_id, hotel_chain, program_name, program_number
    ) VALUES ($1, $2, $3, $4)
    RETURNING *`,
    [user.id, hotelChain, programName || null, programNumber]
  );

  console.log(`✅ Added hotel loyalty program for ${phoneNumber}: ${hotelChain}`);
  return result.rows[0];
}

/**
 * Update hotel loyalty program
 * @param {string} programId - Program UUID
 * @param {Object} updates - Fields to update
 * @returns {Promise<Object>} Updated program
 */
async function updateHotelLoyaltyProgram(programId, updates) {
  if (!db.isConfigured) {
    throw new Error('Database not configured');
  }

  const { hotelChain, programName, programNumber } = updates;

  const result = await db.query(
    `UPDATE hotel_loyalty_programs SET
      hotel_chain = COALESCE($2, hotel_chain),
      program_name = COALESCE($3, program_name),
      program_number = COALESCE($4, program_number),
      updated_at = NOW()
    WHERE id = $1
    RETURNING *`,
    [programId, hotelChain, programName, programNumber]
  );

  if (result.rows.length === 0) {
    throw new Error('Hotel loyalty program not found');
  }

  console.log(`✅ Updated hotel loyalty program ${programId}`);
  return result.rows[0];
}

/**
 * Delete hotel loyalty program
 * @param {string} programId - Program UUID
 * @returns {Promise<boolean>} Success status
 */
async function deleteHotelLoyaltyProgram(programId) {
  if (!db.isConfigured) {
    throw new Error('Database not configured');
  }

  const result = await db.query(
    'DELETE FROM hotel_loyalty_programs WHERE id = $1 RETURNING id',
    [programId]
  );

  if (result.rows.length === 0) {
    return false;
  }

  console.log(`🗑️ Deleted hotel loyalty program ${programId}`);
  return true;
}

/**
 * COMBINED OPERATIONS
 */

/**
 * Get all loyalty programs (airline + hotel) for a user
 * @param {string} phoneNumber - User's phone number
 * @returns {Promise<Object>} Object with airline and hotel programs
 */
async function getAllLoyaltyPrograms(phoneNumber) {
  const [airlinePrograms, hotelPrograms] = await Promise.all([
    getAirlineLoyaltyPrograms(phoneNumber),
    getHotelLoyaltyPrograms(phoneNumber)
  ]);

  return {
    airline: airlinePrograms,
    hotel: hotelPrograms
  };
}

module.exports = {
  // Airline programs
  getAirlineLoyaltyPrograms,
  addAirlineLoyaltyProgram,
  updateAirlineLoyaltyProgram,
  deleteAirlineLoyaltyProgram,

  // Hotel programs
  getHotelLoyaltyPrograms,
  addHotelLoyaltyProgram,
  updateHotelLoyaltyProgram,
  deleteHotelLoyaltyProgram,

  // Combined
  getAllLoyaltyPrograms
};
