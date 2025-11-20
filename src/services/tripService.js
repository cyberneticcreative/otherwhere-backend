const { v4: uuidv4 } = require('uuid');

/**
 * Trip Service
 * Manages trips and traveler data collection
 * Phone number is the universal user ID
 */
class TripService {
  constructor() {
    // In-memory storage for trips (use database in production)
    this.trips = new Map();
    this.travelers = new Map();

    // Trip TTL: 30 days
    this.TRIP_TTL = 30 * 24 * 60 * 60 * 1000;
  }

  /**
   * Create a new trip
   * @param {Object} tripData
   * @returns {Object} Created trip
   */
  createTrip(tripData) {
    const {
      phoneNumber,
      destination,
      origin,
      departureDate,
      returnDate,
      travelers = 1,
      flightOptions = [],
      hotelOptions = []
    } = tripData;

    const tripId = uuidv4().substring(0, 8); // Short UUID
    const expiresAt = Date.now() + this.TRIP_TTL;

    const trip = {
      id: tripId,
      phoneNumber,
      status: 'planning', // planning, awaiting_data, booked, cancelled
      destination,
      origin,
      departureDate,
      returnDate,
      travelers: travelers,
      selectedFlight: null,
      selectedHotel: null,
      flightOptions,
      hotelOptions,
      travelerData: [], // Will be populated via web form
      bookingDetails: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      expiresAt
    };

    this.trips.set(tripId, trip);

    console.log(`[Trip Service] Created trip ${tripId} for ${phoneNumber}`);
    return trip;
  }

  /**
   * Get trip by ID
   * @param {string} tripId
   * @returns {Object|null}
   */
  getTrip(tripId) {
    const trip = this.trips.get(tripId);

    if (!trip) {
      console.log(`[Trip Service] Trip ${tripId} not found`);
      return null;
    }

    // Check if expired
    if (Date.now() > trip.expiresAt) {
      console.log(`[Trip Service] Trip ${tripId} has expired`);
      this.trips.delete(tripId);
      return null;
    }

    return trip;
  }

  /**
   * Update trip
   * @param {string} tripId
   * @param {Object} updates
   * @returns {Object|null}
   */
  updateTrip(tripId, updates) {
    const trip = this.getTrip(tripId);

    if (!trip) {
      return null;
    }

    const updatedTrip = {
      ...trip,
      ...updates,
      updatedAt: new Date().toISOString()
    };

    this.trips.set(tripId, updatedTrip);

    console.log(`[Trip Service] Updated trip ${tripId}`);
    return updatedTrip;
  }

  /**
   * Update trip status
   * @param {string} tripId
   * @param {string} status
   */
  updateStatus(tripId, status) {
    return this.updateTrip(tripId, { status });
  }

  /**
   * Save traveler data for a trip
   * @param {string} tripId
   * @param {Array} travelers
   * @returns {Object|null}
   */
  saveTravelerData(tripId, travelers) {
    const trip = this.getTrip(tripId);

    if (!trip) {
      return null;
    }

    // Validate travelers
    const validatedTravelers = travelers.map((traveler, index) => ({
      id: traveler.id || uuidv4().substring(0, 8),
      index: index + 1,
      firstName: traveler.firstName?.trim(),
      middleName: traveler.middleName?.trim() || '',
      lastName: traveler.lastName?.trim(),
      dateOfBirth: traveler.dateOfBirth,
      nationality: traveler.nationality,
      passportNumber: traveler.passportNumber || null,
      passportExpiry: traveler.passportExpiry || null,
      gender: traveler.gender || null,
      knownTravelerNumber: traveler.knownTravelerNumber || null,
      createdAt: new Date().toISOString()
    }));

    // Store travelers
    validatedTravelers.forEach(traveler => {
      this.travelers.set(traveler.id, {
        ...traveler,
        phoneNumber: trip.phoneNumber,
        tripId
      });
    });

    // Update trip
    const updatedTrip = this.updateTrip(tripId, {
      travelerData: validatedTravelers,
      status: 'awaiting_booking'
    });

    console.log(`[Trip Service] Saved ${validatedTravelers.length} travelers for trip ${tripId}`);

    return updatedTrip;
  }

  /**
   * Get all trips for a phone number
   * @param {string} phoneNumber
   * @returns {Array}
   */
  getTripsByPhone(phoneNumber) {
    const trips = [];

    for (const [id, trip] of this.trips.entries()) {
      if (trip.phoneNumber === phoneNumber && Date.now() <= trip.expiresAt) {
        trips.push(trip);
      }
    }

    return trips.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  }

  /**
   * Get traveler profiles for a phone number (for pre-filling forms)
   * @param {string} phoneNumber
   * @returns {Array}
   */
  getTravelerProfiles(phoneNumber) {
    const profiles = [];
    const seen = new Set();

    for (const [id, traveler] of this.travelers.entries()) {
      if (traveler.phoneNumber === phoneNumber) {
        // Use passport number or name as unique key to avoid duplicates
        const key = traveler.passportNumber || `${traveler.firstName}_${traveler.lastName}_${traveler.dateOfBirth}`;

        if (!seen.has(key)) {
          profiles.push({
            id: traveler.id,
            firstName: traveler.firstName,
            middleName: traveler.middleName,
            lastName: traveler.lastName,
            dateOfBirth: traveler.dateOfBirth,
            nationality: traveler.nationality,
            passportNumber: traveler.passportNumber,
            passportExpiry: traveler.passportExpiry,
            gender: traveler.gender,
            knownTravelerNumber: traveler.knownTravelerNumber,
            lastUsed: traveler.createdAt
          });
          seen.add(key);
        }
      }
    }

    return profiles.sort((a, b) => new Date(b.lastUsed) - new Date(a.lastUsed));
  }

  /**
   * Clean up expired trips
   */
  cleanupExpiredTrips() {
    const now = Date.now();
    let cleaned = 0;

    for (const [tripId, trip] of this.trips.entries()) {
      if (now > trip.expiresAt) {
        this.trips.delete(tripId);
        cleaned++;
      }
    }

    if (cleaned > 0) {
      console.log(`[Trip Service] Cleaned up ${cleaned} expired trips`);
    }
  }

  /**
   * Get stats for debugging
   */
  getStats() {
    return {
      activeTrips: this.trips.size,
      totalTravelers: this.travelers.size,
      trips: Array.from(this.trips.values()).map(t => ({
        id: t.id,
        phoneNumber: t.phoneNumber,
        status: t.status,
        destination: t.destination,
        createdAt: t.createdAt
      }))
    };
  }
}

// Export singleton instance
module.exports = new TripService();

// Cleanup expired trips every hour
setInterval(() => {
  module.exports.cleanupExpiredTrips();
}, 60 * 60 * 1000);
