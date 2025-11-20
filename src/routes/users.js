/**
 * User API Routes
 * Provides RESTful endpoints for Softr integration
 */

const express = require('express');
const router = express.Router();

const userProfileService = require('../services/userProfileService');
const loyaltyProgramService = require('../services/loyaltyProgramService');
const userPreferencesService = require('../services/userPreferencesService');

/**
 * POST /api/users/onboard
 * Create or update user profile from onboarding form
 */
router.post('/onboard', async (req, res) => {
  try {
    const {
      phoneNumber,
      firstName,
      lastName,
      dateOfBirth,
      nationality,
      gender,
      knownTravelerNumber,
      homeAirport
    } = req.body;

    if (!phoneNumber) {
      return res.status(400).json({
        success: false,
        error: 'Phone number is required'
      });
    }

    // Check if user exists
    const existingUser = await userProfileService.getUserByPhone(phoneNumber);

    let user;
    if (existingUser) {
      // Update existing user
      user = await userProfileService.updateUser(phoneNumber, {
        firstName,
        lastName,
        dateOfBirth,
        nationality,
        gender,
        knownTravelerNumber,
        homeAirport
      });
    } else {
      // Create new user
      user = await userProfileService.createUser({
        phoneNumber,
        firstName,
        lastName,
        dateOfBirth,
        nationality,
        gender,
        knownTravelerNumber,
        homeAirport,
        onboardedVia: 'web'
      });
    }

    res.json({
      success: true,
      user,
      message: existingUser ? 'Profile updated successfully' : 'Profile created successfully'
    });

  } catch (error) {
    console.error('Error in user onboarding:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/users/:phoneNumber
 * Get full user profile with loyalty programs and preferences
 */
router.get('/:phoneNumber', async (req, res) => {
  try {
    const { phoneNumber } = req.params;

    const profile = await userProfileService.getFullProfile(phoneNumber);

    if (!profile) {
      return res.status(404).json({
        success: false,
        error: 'User not found'
      });
    }

    res.json({
      success: true,
      user: profile
    });

  } catch (error) {
    console.error('Error getting user profile:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * PUT /api/users/:phoneNumber
 * Update user profile
 */
router.put('/:phoneNumber', async (req, res) => {
  try {
    const { phoneNumber } = req.params;
    const updates = req.body;

    const user = await userProfileService.updateUser(phoneNumber, updates);

    res.json({
      success: true,
      user,
      message: 'Profile updated successfully'
    });

  } catch (error) {
    console.error('Error updating user profile:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * DELETE /api/users/:phoneNumber
 * Delete user account and all data
 */
router.delete('/:phoneNumber', async (req, res) => {
  try {
    const { phoneNumber } = req.params;

    const deleted = await userProfileService.deleteUser(phoneNumber);

    if (!deleted) {
      return res.status(404).json({
        success: false,
        error: 'User not found'
      });
    }

    res.json({
      success: true,
      message: 'User deleted successfully'
    });

  } catch (error) {
    console.error('Error deleting user:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * AIRLINE LOYALTY PROGRAMS
 */

/**
 * GET /api/users/:phoneNumber/loyalty/airlines
 * Get all airline loyalty programs
 */
router.get('/:phoneNumber/loyalty/airlines', async (req, res) => {
  try {
    const { phoneNumber } = req.params;

    const programs = await loyaltyProgramService.getAirlineLoyaltyPrograms(phoneNumber);

    res.json({
      success: true,
      programs
    });

  } catch (error) {
    console.error('Error getting airline loyalty programs:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * POST /api/users/:phoneNumber/loyalty/airlines
 * Add airline loyalty program
 */
router.post('/:phoneNumber/loyalty/airlines', async (req, res) => {
  try {
    const { phoneNumber } = req.params;
    const { airlineName, programName, programNumber } = req.body;

    if (!airlineName || !programNumber) {
      return res.status(400).json({
        success: false,
        error: 'Airline name and program number are required'
      });
    }

    const program = await loyaltyProgramService.addAirlineLoyaltyProgram(phoneNumber, {
      airlineName,
      programName,
      programNumber
    });

    res.json({
      success: true,
      program,
      message: 'Airline loyalty program added successfully'
    });

  } catch (error) {
    console.error('Error adding airline loyalty program:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * PUT /api/users/:phoneNumber/loyalty/airlines/:programId
 * Update airline loyalty program
 */
router.put('/:phoneNumber/loyalty/airlines/:programId', async (req, res) => {
  try {
    const { programId } = req.params;
    const updates = req.body;

    const program = await loyaltyProgramService.updateAirlineLoyaltyProgram(programId, updates);

    res.json({
      success: true,
      program,
      message: 'Airline loyalty program updated successfully'
    });

  } catch (error) {
    console.error('Error updating airline loyalty program:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * DELETE /api/users/:phoneNumber/loyalty/airlines/:programId
 * Delete airline loyalty program
 */
router.delete('/:phoneNumber/loyalty/airlines/:programId', async (req, res) => {
  try {
    const { programId } = req.params;

    const deleted = await loyaltyProgramService.deleteAirlineLoyaltyProgram(programId);

    if (!deleted) {
      return res.status(404).json({
        success: false,
        error: 'Airline loyalty program not found'
      });
    }

    res.json({
      success: true,
      message: 'Airline loyalty program deleted successfully'
    });

  } catch (error) {
    console.error('Error deleting airline loyalty program:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * HOTEL LOYALTY PROGRAMS
 */

/**
 * GET /api/users/:phoneNumber/loyalty/hotels
 * Get all hotel loyalty programs
 */
router.get('/:phoneNumber/loyalty/hotels', async (req, res) => {
  try {
    const { phoneNumber } = req.params;

    const programs = await loyaltyProgramService.getHotelLoyaltyPrograms(phoneNumber);

    res.json({
      success: true,
      programs
    });

  } catch (error) {
    console.error('Error getting hotel loyalty programs:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * POST /api/users/:phoneNumber/loyalty/hotels
 * Add hotel loyalty program
 */
router.post('/:phoneNumber/loyalty/hotels', async (req, res) => {
  try {
    const { phoneNumber } = req.params;
    const { hotelChain, programName, programNumber } = req.body;

    if (!hotelChain || !programNumber) {
      return res.status(400).json({
        success: false,
        error: 'Hotel chain and program number are required'
      });
    }

    const program = await loyaltyProgramService.addHotelLoyaltyProgram(phoneNumber, {
      hotelChain,
      programName,
      programNumber
    });

    res.json({
      success: true,
      program,
      message: 'Hotel loyalty program added successfully'
    });

  } catch (error) {
    console.error('Error adding hotel loyalty program:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * PUT /api/users/:phoneNumber/loyalty/hotels/:programId
 * Update hotel loyalty program
 */
router.put('/:phoneNumber/loyalty/hotels/:programId', async (req, res) => {
  try {
    const { programId } = req.params;
    const updates = req.body;

    const program = await loyaltyProgramService.updateHotelLoyaltyProgram(programId, updates);

    res.json({
      success: true,
      program,
      message: 'Hotel loyalty program updated successfully'
    });

  } catch (error) {
    console.error('Error updating hotel loyalty program:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * DELETE /api/users/:phoneNumber/loyalty/hotels/:programId
 * Delete hotel loyalty program
 */
router.delete('/:phoneNumber/loyalty/hotels/:programId', async (req, res) => {
  try {
    const { programId } = req.params;

    const deleted = await loyaltyProgramService.deleteHotelLoyaltyProgram(programId);

    if (!deleted) {
      return res.status(404).json({
        success: false,
        error: 'Hotel loyalty program not found'
      });
    }

    res.json({
      success: true,
      message: 'Hotel loyalty program deleted successfully'
    });

  } catch (error) {
    console.error('Error deleting hotel loyalty program:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * USER PREFERENCES
 */

/**
 * GET /api/users/:phoneNumber/preferences
 * Get user travel preferences
 */
router.get('/:phoneNumber/preferences', async (req, res) => {
  try {
    const { phoneNumber } = req.params;

    const preferences = await userPreferencesService.getPreferences(phoneNumber);

    res.json({
      success: true,
      preferences: preferences || {
        preferred_class: null,
        travel_credit_cards: [],
        prioritize_card_benefits: false
      }
    });

  } catch (error) {
    console.error('Error getting user preferences:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * PUT /api/users/:phoneNumber/preferences
 * Update user travel preferences
 */
router.put('/:phoneNumber/preferences', async (req, res) => {
  try {
    const { phoneNumber } = req.params;
    const { preferredClass, travelCreditCards, prioritizeCardBenefits } = req.body;

    const preferences = await userPreferencesService.setPreferences(phoneNumber, {
      preferredClass,
      travelCreditCards,
      prioritizeCardBenefits
    });

    res.json({
      success: true,
      preferences,
      message: 'Preferences updated successfully'
    });

  } catch (error) {
    console.error('Error updating user preferences:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

module.exports = router;
