const { v4: uuidv4 } = require('uuid');

// In-memory session storage (use Redis for production)
const sessions = new Map();
const USE_REDIS = process.env.USE_REDIS === 'true';

let redisClient = null;

// Initialize Redis if enabled
if (USE_REDIS) {
  try {
    const redis = require('redis');
    redisClient = redis.createClient({
      url: process.env.REDIS_URL || 'redis://localhost:6379'
    });

    redisClient.on('error', (err) => console.error('Redis Client Error', err));
    redisClient.on('connect', () => console.log('✅ Connected to Redis'));

    redisClient.connect();
  } catch (error) {
    console.error('Failed to initialize Redis:', error);
    console.log('Falling back to in-memory storage');
  }
}

class SessionManager {
  /**
   * Get or create a session for a user
   * @param {string} userId - Phone number or unique identifier
   * @returns {Promise<Object>} Session object
   */
  async getSession(userId) {
    if (USE_REDIS && redisClient) {
      const sessionData = await redisClient.get(`session:${userId}`);
      if (sessionData) {
        return JSON.parse(sessionData);
      }
    }

    if (!sessions.has(userId)) {
      return this.createSession(userId);
    }

    return sessions.get(userId);
  }

  /**
   * Create a new session for a user
   * @param {string} userId - Phone number or unique identifier
   * @returns {Promise<Object>} New session object
   */
  async createSession(userId) {
    const session = {
      id: uuidv4(),
      userId,
      conversationHistory: [],
      context: {},
      tripDetails: null,
      channel: null, // 'sms' or 'voice' or 'web'
      onboardedVia: null, // 'sms', 'voice', or 'web'
      threadId: null, // OpenAI Assistant thread ID
      // Trip tracking
      currentTripId: null, // Active trip ID
      bookingState: 'planning', // 'planning', 'booking_intent', 'awaiting_data', 'booking', 'booked'
      // Flight-related session data
      lastFlightResults: null, // Array of formatted flight results
      lastFlightSearch: null, // Last flight search parameters
      // Accommodation-related session data
      lastAccommodationResults: null, // Array of formatted accommodation results
      lastAccommodationSearch: null, // Last accommodation search parameters
      lastAccommodationSelection: null, // Selected accommodation details
      // Search flow tracking
      searchType: null, // 'flights' | 'accommodations' | 'both'
      flightsCompleted: false, // For "both" flow sequencing
      // Recommendation mode state
      recoMode: null, // null | 'asking_vibe' | 'asking_when' | 'asking_budget' | 'asking_who' | 'awaiting_selection' | 'rerolling'
      recoPreferences: null, // { vibe, when, budget, who }
      recoRecommendations: null, // Last generated recommendations
      createdAt: new Date().toISOString(),
      lastActivity: new Date().toISOString()
    };

    if (USE_REDIS && redisClient) {
      await redisClient.setEx(
        `session:${userId}`,
        3600, // 1 hour TTL
        JSON.stringify(session)
      );
    } else {
      sessions.set(userId, session);
    }

    return session;
  }

  /**
   * Update session data
   * @param {string} userId - User identifier
   * @param {Object} updates - Updates to apply
   * @returns {Promise<Object>} Updated session
   */
  async updateSession(userId, updates) {
    const session = await this.getSession(userId);
    const updatedSession = {
      ...session,
      ...updates,
      lastActivity: new Date().toISOString()
    };

    if (USE_REDIS && redisClient) {
      await redisClient.setEx(
        `session:${userId}`,
        3600,
        JSON.stringify(updatedSession)
      );
    } else {
      sessions.set(userId, updatedSession);
    }

    return updatedSession;
  }

  /**
   * Add a message to conversation history
   * @param {string} userId - User identifier
   * @param {Object} message - Message object with role and content
   * @returns {Promise<void>}
   */
  async addMessage(userId, message) {
    const session = await this.getSession(userId);
    session.conversationHistory.push({
      ...message,
      timestamp: new Date().toISOString()
    });

    // Keep only last 20 messages to prevent memory issues
    if (session.conversationHistory.length > 20) {
      session.conversationHistory = session.conversationHistory.slice(-20);
    }

    await this.updateSession(userId, { conversationHistory: session.conversationHistory });
  }

  /**
   * Clear a user's session
   * @param {string} userId - User identifier
   * @returns {Promise<void>}
   */
  async clearSession(userId) {
    if (USE_REDIS && redisClient) {
      await redisClient.del(`session:${userId}`);
    } else {
      sessions.delete(userId);
    }
  }

  /**
   * Get all active sessions (for debugging)
   * @returns {Promise<Array>} Array of session objects
   */
  async getAllSessions() {
    if (USE_REDIS && redisClient) {
      const keys = await redisClient.keys('session:*');
      const sessionData = await Promise.all(
        keys.map(key => redisClient.get(key))
      );
      return sessionData.map(data => JSON.parse(data));
    }

    return Array.from(sessions.values());
  }

  /**
   * Clean up old sessions (call periodically)
   * @param {number} maxAgeMinutes - Maximum age in minutes
   * @returns {Promise<number>} Number of sessions cleared
   */
  async cleanupOldSessions(maxAgeMinutes = 60) {
    if (USE_REDIS && redisClient) {
      // Redis handles TTL automatically
      return 0;
    }

    const now = Date.now();
    const maxAge = maxAgeMinutes * 60 * 1000;
    let cleared = 0;

    for (const [userId, session] of sessions.entries()) {
      const lastActivity = new Date(session.lastActivity).getTime();
      if (now - lastActivity > maxAge) {
        sessions.delete(userId);
        cleared++;
      }
    }

    return cleared;
  }
}

// Run cleanup every 15 minutes
if (!USE_REDIS) {
  setInterval(() => {
    const manager = new SessionManager();
    manager.cleanupOldSessions().then(cleared => {
      if (cleared > 0) {
        console.log(`🧹 Cleaned up ${cleared} old sessions`);
      }
    });
  }, 15 * 60 * 1000);
}

module.exports = new SessionManager();
