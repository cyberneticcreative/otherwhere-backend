/**
 * User Preferences Service
 * Manages user travel preferences (class, credit cards, etc.)
 */

const db = require('../db');
const userProfileService = require('./userProfileService');

/**
 * Get user preferences
 * @param {string} phoneNumber - User's phone number
 * @returns {Promise<Object|null>} Preferences object or null
 */
async function getPreferences(phoneNumber) {
  if (!db.isConfigured) {
    console.warn('Database not configured - getPreferences skipped');
    return null;
  }

  const user = await userProfileService.getUserByPhone(phoneNumber);
  if (!user) {
    return null;
  }

  const result = await db.query(
    'SELECT * FROM user_preferences WHERE user_id = $1',
    [user.id]
  );

  return result.rows[0] || null;
}

/**
 * Create or update user preferences (upsert)
 * Handles all preference fields including airline, airport, and timing preferences
 * @param {string} phoneNumber - User's phone number
 * @param {Object} preferencesData - Preferences data
 * @returns {Promise<Object>} Created/updated preferences
 */
async function setPreferences(phoneNumber, preferencesData) {
  if (!db.isConfigured) {
    throw new Error('Database not configured');
  }

  const user = await userProfileService.getOrCreateUser(phoneNumber);
  if (!user) {
    throw new Error('Could not find or create user');
  }

  const {
    preferredClass,
    travelCreditCards,
    prioritizeCardBenefits,
    // New fields for fluid conversation
    preferredAirlines,
    avoidedAirlines,
    preferredAirports,
    avoidedAirports,
    departureTimePreference,
    maxStops,
    connectionPreference,
    budgetFlexibility
  } = preferencesData;

  // Check if preferences already exist
  const existing = await db.query(
    'SELECT id FROM user_preferences WHERE user_id = $1',
    [user.id]
  );

  let result;

  if (existing.rows.length > 0) {
    // Update existing preferences - only update fields that are provided
    result = await db.query(
      `UPDATE user_preferences SET
        preferred_class = COALESCE($2, preferred_class),
        travel_credit_cards = COALESCE($3, travel_credit_cards),
        prioritize_card_benefits = COALESCE($4, prioritize_card_benefits),
        preferred_airlines = COALESCE($5, preferred_airlines),
        avoided_airlines = COALESCE($6, avoided_airlines),
        preferred_airports = COALESCE($7, preferred_airports),
        avoided_airports = COALESCE($8, avoided_airports),
        departure_time_preference = COALESCE($9, departure_time_preference),
        max_stops = COALESCE($10, max_stops),
        connection_preference = COALESCE($11, connection_preference),
        budget_flexibility = COALESCE($12, budget_flexibility),
        updated_at = NOW()
      WHERE user_id = $1
      RETURNING *`,
      [
        user.id,
        preferredClass,
        travelCreditCards,
        prioritizeCardBenefits,
        preferredAirlines,
        avoidedAirlines,
        preferredAirports,
        avoidedAirports,
        departureTimePreference,
        maxStops,
        connectionPreference,
        budgetFlexibility
      ]
    );
    console.log(`✅ Updated preferences for ${phoneNumber}`);
  } else {
    // Create new preferences with all fields
    result = await db.query(
      `INSERT INTO user_preferences (
        user_id, preferred_class, travel_credit_cards, prioritize_card_benefits,
        preferred_airlines, avoided_airlines, preferred_airports, avoided_airports,
        departure_time_preference, max_stops, connection_preference, budget_flexibility
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
      RETURNING *`,
      [
        user.id,
        preferredClass || null,
        travelCreditCards || [],
        prioritizeCardBenefits !== undefined ? prioritizeCardBenefits : false,
        preferredAirlines || null,
        avoidedAirlines || null,
        preferredAirports || null,
        avoidedAirports || null,
        departureTimePreference || null,
        maxStops !== undefined ? maxStops : null,
        connectionPreference || null,
        budgetFlexibility || null
      ]
    );
    console.log(`✅ Created preferences for ${phoneNumber}`);
  }

  return result.rows[0];
}

/**
 * Update specific preference fields
 * @param {string} phoneNumber - User's phone number
 * @param {Object} updates - Fields to update
 * @returns {Promise<Object>} Updated preferences
 */
async function updatePreferences(phoneNumber, updates) {
  return setPreferences(phoneNumber, updates);
}

/**
 * Delete user preferences
 * @param {string} phoneNumber - User's phone number
 * @returns {Promise<boolean>} Success status
 */
async function deletePreferences(phoneNumber) {
  if (!db.isConfigured) {
    throw new Error('Database not configured');
  }

  const user = await userProfileService.getUserByPhone(phoneNumber);
  if (!user) {
    return false;
  }

  const result = await db.query(
    'DELETE FROM user_preferences WHERE user_id = $1 RETURNING id',
    [user.id]
  );

  if (result.rows.length === 0) {
    return false;
  }

  console.log(`🗑️ Deleted preferences for ${phoneNumber}`);
  return true;
}

/**
 * Get or create default preferences for a user
 * @param {string} phoneNumber - User's phone number
 * @returns {Promise<Object>} Preferences object
 */
async function getOrCreatePreferences(phoneNumber) {
  let preferences = await getPreferences(phoneNumber);

  if (!preferences) {
    // Create with defaults
    preferences = await setPreferences(phoneNumber, {
      preferredClass: 'economy',
      travelCreditCards: [],
      prioritizeCardBenefits: false
    });
  }

  return preferences;
}

/**
 * Add a credit card to user's preferences
 * @param {string} phoneNumber - User's phone number
 * @param {string} cardName - Credit card name
 * @returns {Promise<Object>} Updated preferences
 */
async function addCreditCard(phoneNumber, cardName) {
  if (!db.isConfigured) {
    throw new Error('Database not configured');
  }

  const user = await userProfileService.getOrCreateUser(phoneNumber);
  if (!user) {
    throw new Error('Could not find or create user');
  }

  // Get current preferences
  let preferences = await getPreferences(phoneNumber);

  // If no preferences exist, create them
  if (!preferences) {
    preferences = await setPreferences(phoneNumber, {
      travelCreditCards: [cardName],
      preferredClass: 'economy',
      prioritizeCardBenefits: false
    });
  } else {
    // Add card to existing list (if not already present)
    const currentCards = preferences.travel_credit_cards || [];
    if (!currentCards.includes(cardName)) {
      const updatedCards = [...currentCards, cardName];

      const result = await db.query(
        `UPDATE user_preferences SET
          travel_credit_cards = $2,
          updated_at = NOW()
        WHERE user_id = $1
        RETURNING *`,
        [user.id, updatedCards]
      );

      preferences = result.rows[0];
      console.log(`✅ Added credit card ${cardName} for ${phoneNumber}`);
    }
  }

  return preferences;
}

/**
 * Remove a credit card from user's preferences
 * @param {string} phoneNumber - User's phone number
 * @param {string} cardName - Credit card name
 * @returns {Promise<Object>} Updated preferences
 */
async function removeCreditCard(phoneNumber, cardName) {
  if (!db.isConfigured) {
    throw new Error('Database not configured');
  }

  const user = await userProfileService.getUserByPhone(phoneNumber);
  if (!user) {
    throw new Error('User not found');
  }

  const preferences = await getPreferences(phoneNumber);
  if (!preferences) {
    throw new Error('Preferences not found');
  }

  const currentCards = preferences.travel_credit_cards || [];
  const updatedCards = currentCards.filter(card => card !== cardName);

  const result = await db.query(
    `UPDATE user_preferences SET
      travel_credit_cards = $2,
      updated_at = NOW()
    WHERE user_id = $1
    RETURNING *`,
    [user.id, updatedCards]
  );

  console.log(`✅ Removed credit card ${cardName} for ${phoneNumber}`);
  return result.rows[0];
}

module.exports = {
  getPreferences,
  setPreferences,
  updatePreferences,
  deletePreferences,
  getOrCreatePreferences,
  addCreditCard,
  removeCreditCard
};
