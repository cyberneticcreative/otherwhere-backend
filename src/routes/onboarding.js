const express = require('express');
const router = express.Router();
const sessionManager = require('../services/sessionManager');
const tripService = require('../services/tripService');
const twilioService = require('../services/twilioService');

/**
 * Web Entry Point - Landing Page Submission
 * POST /api/onboarding/web
 *
 * User submits phone number (required) and home airport (optional)
 * Backend creates/finds user profile and triggers welcome SMS
 */
router.post('/web', async (req, res) => {
  try {
    const { phoneNumber, homeAirport } = req.body;

    console.log(`[Onboarding] Web entry from ${phoneNumber}`);

    // Validate phone number
    if (!phoneNumber) {
      return res.status(400).json({
        success: false,
        error: 'Phone number is required'
      });
    }

    // Normalize phone number (add +1 if not present for US numbers)
    let normalizedPhone = phoneNumber.trim();
    if (!normalizedPhone.startsWith('+')) {
      normalizedPhone = `+1${normalizedPhone.replace(/\D/g, '')}`;
    }

    // Get or create session (phone number is the universal ID)
    let session = await sessionManager.getSession(normalizedPhone);

    // Update session with home airport if provided
    if (homeAirport) {
      await sessionManager.updateSession(normalizedPhone, {
        context: {
          ...session.context,
          homeAirport: homeAirport.trim()
        }
      });
    }

    // Mark channel as web (but conversation will continue via SMS)
    await sessionManager.updateSession(normalizedPhone, {
      channel: 'web',
      onboardedVia: 'web'
    });

    // Send welcome SMS
    const welcomeMessage = homeAirport
      ? `Hi! I'm your Otherwhere travel concierge. I see you're based near ${homeAirport}. Where should we go?`
      : `Hi! I'm your Otherwhere travel concierge. Where are you thinking of going?`;

    await twilioService.sendSMS(normalizedPhone, welcomeMessage);

    console.log(`[Onboarding] Welcome SMS sent to ${normalizedPhone}`);

    // Return success
    res.json({
      success: true,
      message: 'Welcome SMS sent! Check your phone.',
      phoneNumber: normalizedPhone
    });

  } catch (error) {
    console.error('[Onboarding] Error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Onboarding failed'
    });
  }
});

/**
 * Get Traveler Form Data
 * GET /api/trips/:tripId/travelers
 *
 * Returns trip details and any existing traveler profiles for pre-filling
 */
router.get('/trips/:tripId/travelers', async (req, res) => {
  try {
    const { tripId } = req.params;

    console.log(`[Onboarding] Fetching trip ${tripId} for traveler form`);

    const trip = tripService.getTrip(tripId);

    if (!trip) {
      return res.status(404).json({
        success: false,
        error: 'Trip not found or expired'
      });
    }

    // Get existing traveler profiles for this phone number (for pre-filling)
    const travelerProfiles = tripService.getTravelerProfiles(trip.phoneNumber);

    res.json({
      success: true,
      trip: {
        id: trip.id,
        destination: trip.destination,
        origin: trip.origin,
        departureDate: trip.departureDate,
        returnDate: trip.returnDate,
        travelers: trip.travelers,
        selectedFlight: trip.selectedFlight,
        selectedHotel: trip.selectedHotel
      },
      travelerProfiles: travelerProfiles.slice(0, trip.travelers), // Return up to needed count
      requiredTravelers: trip.travelers
    });

  } catch (error) {
    console.error(`[Onboarding] Error fetching trip ${req.params.tripId}:`, error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * Submit Traveler Data
 * POST /api/trips/:tripId/travelers
 *
 * Receives traveler data from web form
 * Validates and stores data, then triggers booking process
 */
router.post('/trips/:tripId/travelers', async (req, res) => {
  try {
    const { tripId } = req.params;
    const { travelers } = req.body;

    console.log(`[Onboarding] Received traveler data for trip ${tripId}`);

    if (!travelers || !Array.isArray(travelers) || travelers.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'Traveler data is required'
      });
    }

    const trip = tripService.getTrip(tripId);

    if (!trip) {
      return res.status(404).json({
        success: false,
        error: 'Trip not found or expired'
      });
    }

    // Validate traveler count
    if (travelers.length !== trip.travelers) {
      return res.status(400).json({
        success: false,
        error: `Expected ${trip.travelers} traveler(s), received ${travelers.length}`
      });
    }

    // Validate required fields
    for (let i = 0; i < travelers.length; i++) {
      const traveler = travelers[i];
      const missing = [];

      if (!traveler.firstName) missing.push('first name');
      if (!traveler.lastName) missing.push('last name');
      if (!traveler.dateOfBirth) missing.push('date of birth');
      if (!traveler.nationality) missing.push('nationality');

      // Passport required for international flights
      const isInternational = trip.origin && trip.destination &&
        !trip.destination.toLowerCase().includes('us') &&
        !trip.destination.toLowerCase().includes('united states');

      if (isInternational && !traveler.passportNumber) {
        missing.push('passport number');
      }

      if (missing.length > 0) {
        return res.status(400).json({
          success: false,
          error: `Traveler ${i + 1} is missing: ${missing.join(', ')}`
        });
      }
    }

    // Save traveler data
    const updatedTrip = tripService.saveTravelerData(tripId, travelers);

    // Send confirmation SMS
    const confirmationMessage = `Perfect! I've got all the traveler details. Working on your booking now and will confirm shortly!`;

    await twilioService.sendSMS(trip.phoneNumber, confirmationMessage);

    console.log(`[Onboarding] Traveler data saved for trip ${tripId}, confirmation SMS sent`);

    res.json({
      success: true,
      message: 'Traveler data saved successfully',
      trip: {
        id: updatedTrip.id,
        status: updatedTrip.status
      }
    });

  } catch (error) {
    console.error(`[Onboarding] Error saving traveler data for trip ${req.params.tripId}:`, error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

module.exports = router;
