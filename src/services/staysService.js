const { v4: uuidv4 } = require('uuid');
const sessionManager = require('./sessionManager');

/**
 * Stays Service
 * Manages accommodation search results and user selections
 */
class StaysService {
  constructor() {
    // In-memory storage for search results (using Map for faster lookups)
    this.searches = new Map();
    this.selections = new Map();

    // TTL for search results (24 hours)
    this.SEARCH_TTL = 24 * 60 * 60 * 1000;

    // Cleanup expired searches every hour
    setInterval(() => this.cleanupExpiredSearches(), 60 * 60 * 1000);
  }

  /**
   * Create a new search result and return a unique ID
   * @param {Object} searchData - The search parameters and results
   * @returns {string} - Unique search ID
   */
  createSearch(searchData) {
    const searchId = uuidv4().substring(0, 8); // Short UUID
    const expiresAt = Date.now() + this.SEARCH_TTL;

    const search = {
      id: searchId,
      ...searchData,
      createdAt: new Date().toISOString(),
      expiresAt
    };

    this.searches.set(searchId, search);

    console.log(`[Stays Service] Created search ${searchId} with ${searchData.results?.length || 0} results`);
    console.log(`[Stays Service] Total active searches: ${this.searches.size}`);

    return searchId;
  }

  /**
   * Get search results by ID
   * @param {string} searchId
   * @returns {Object|null}
   */
  async getSearchResults(searchId) {
    const search = this.searches.get(searchId);

    if (!search) {
      console.log(`[Stays Service] Search ${searchId} not found`);
      return null;
    }

    // Check if expired
    if (Date.now() > search.expiresAt) {
      console.log(`[Stays Service] Search ${searchId} has expired`);
      this.searches.delete(searchId);
      return null;
    }

    console.log(`[Stays Service] Retrieved search ${searchId}`);
    return search;
  }

  /**
   * Get specific hotel details from a search or by ID
   * @param {string} hotelId
   * @returns {Object|null}
   */
  async getHotelDetails(hotelId) {
    // Search through all active searches for this hotel
    for (const [searchId, search] of this.searches.entries()) {
      if (search.results) {
        const hotel = search.results.find(h => h.id === hotelId);
        if (hotel) {
          console.log(`[Stays Service] Found hotel ${hotelId} in search ${searchId}`);
          return {
            ...hotel,
            searchId // Include search ID for context
          };
        }
      }
    }

    console.log(`[Stays Service] Hotel ${hotelId} not found in any active search`);
    return null;
  }

  /**
   * Save a user's accommodation selection
   * @param {Object} selectionData
   * @returns {Object}
   */
  async saveSelection(selectionData) {
    const { phoneNumber, hotelId, searchId, hotelDetails } = selectionData;

    // Create selection record
    const selectionId = uuidv4().substring(0, 8);
    const selection = {
      id: selectionId,
      phoneNumber,
      hotelId,
      searchId,
      hotelDetails,
      selectedAt: new Date().toISOString(),
      status: 'pending' // pending, confirmed, cancelled
    };

    // Store selection
    this.selections.set(selectionId, selection);

    // Also update the user's session with their selection
    await sessionManager.updateSession(phoneNumber, {
      lastAccommodationSelection: {
        selectionId,
        hotelId,
        hotelName: hotelDetails?.name,
        selectedAt: selection.selectedAt
      }
    });

    console.log(`[Stays Service] Saved selection ${selectionId} for ${phoneNumber}`);
    console.log(`[Stays Service] Hotel: ${hotelDetails?.name}`);

    return selection;
  }

  /**
   * Get all selections for a phone number
   * @param {string} phoneNumber
   * @returns {Array}
   */
  getSelectionsByPhone(phoneNumber) {
    const selections = [];
    for (const [id, selection] of this.selections.entries()) {
      if (selection.phoneNumber === phoneNumber) {
        selections.push(selection);
      }
    }
    return selections;
  }

  /**
   * Get selection by ID
   * @param {string} selectionId
   * @returns {Object|null}
   */
  getSelection(selectionId) {
    return this.selections.get(selectionId) || null;
  }

  /**
   * Update selection status
   * @param {string} selectionId
   * @param {string} status - 'pending', 'confirmed', 'cancelled'
   */
  updateSelectionStatus(selectionId, status) {
    const selection = this.selections.get(selectionId);
    if (selection) {
      selection.status = status;
      selection.updatedAt = new Date().toISOString();
      console.log(`[Stays Service] Updated selection ${selectionId} status to ${status}`);
    }
  }

  /**
   * Clean up expired searches
   */
  cleanupExpiredSearches() {
    const now = Date.now();
    let cleaned = 0;

    for (const [searchId, search] of this.searches.entries()) {
      if (now > search.expiresAt) {
        this.searches.delete(searchId);
        cleaned++;
      }
    }

    if (cleaned > 0) {
      console.log(`[Stays Service] Cleaned up ${cleaned} expired searches`);
    }
  }

  /**
   * Get mock data for testing
   */
  getMockData() {
    return {
      id: 'mock-search',
      phoneNumber: '+1234567890',
      location: 'Miami, FL',
      checkIn: '2025-01-03',
      checkOut: '2025-01-08',
      guests: 2,
      results: [
        {
          id: 'hotel-1',
          name: 'Ocean View Resort',
          address: '123 Ocean Drive, Miami Beach, FL',
          city: 'Miami Beach',
          rating: 4.5,
          price: 299,
          currency: 'USD',
          photos: [
            'https://images.unsplash.com/photo-1542314831-068cd1dbfeeb?w=800',
            'https://images.unsplash.com/photo-1520250497591-112f2f40a3f4?w=800'
          ],
          amenities: ['Pool', 'WiFi', 'Beach Access', 'Restaurant', 'Spa'],
          rooms: [{
            id: 'room-1',
            name: 'Deluxe Ocean View',
            rates: [{
              totalAmount: '1495.00',
              taxAmount: '224.25',
              feeAmount: '50.00',
              currency: 'USD',
              perNight: '299.00'
            }]
          }]
        },
        {
          id: 'hotel-2',
          name: 'Downtown Luxury Hotel',
          address: '456 Brickell Ave, Miami, FL',
          city: 'Miami',
          rating: 4.7,
          price: 350,
          currency: 'USD',
          photos: [
            'https://images.unsplash.com/photo-1551882547-ff40c63fe5fa?w=800',
            'https://images.unsplash.com/photo-1566665797739-1674de7a421a?w=800'
          ],
          amenities: ['Rooftop Pool', 'Gym', 'WiFi', 'Business Center', 'Concierge'],
          rooms: [{
            id: 'room-2',
            name: 'Executive Suite',
            rates: [{
              totalAmount: '1750.00',
              taxAmount: '262.50',
              feeAmount: '75.00',
              currency: 'USD',
              perNight: '350.00'
            }]
          }]
        },
        {
          id: 'hotel-3',
          name: 'Boutique Art Deco Hotel',
          address: '789 Collins Ave, South Beach, FL',
          city: 'South Beach',
          rating: 4.3,
          price: 225,
          currency: 'USD',
          photos: [
            'https://images.unsplash.com/photo-1582719478250-c89cae4dc85b?w=800',
            'https://images.unsplash.com/photo-1542314831-068cd1dbfeeb?w=800'
          ],
          amenities: ['WiFi', 'Bar', 'Beach Access', 'Complimentary Breakfast'],
          rooms: [{
            id: 'room-3',
            name: 'Art Deco King Room',
            rates: [{
              totalAmount: '1125.00',
              taxAmount: '168.75',
              feeAmount: '35.00',
              currency: 'USD',
              perNight: '225.00'
            }]
          }]
        }
      ],
      createdAt: new Date().toISOString()
    };
  }

  /**
   * Get stats for debugging
   */
  getStats() {
    return {
      activeSearches: this.searches.size,
      totalSelections: this.selections.size,
      searches: Array.from(this.searches.values()).map(s => ({
        id: s.id,
        location: s.location,
        resultsCount: s.results?.length || 0,
        createdAt: s.createdAt
      })),
      selections: Array.from(this.selections.values()).map(s => ({
        id: s.id,
        hotelName: s.hotelDetails?.name,
        status: s.status,
        selectedAt: s.selectedAt
      }))
    };
  }
}

// Export singleton instance
module.exports = new StaysService();
