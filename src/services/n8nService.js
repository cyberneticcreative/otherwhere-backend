const axios = require('axios');

const N8N_WEBHOOK_URL = process.env.N8N_WEBHOOK_URL;

class N8nService {
  /**
   * Trigger trip search workflow in n8n
   * @param {Object} tripData - Trip search parameters
   * @param {string} userId - User identifier (phone number)
   * @param {string} sessionId - Session ID
   * @returns {Promise<Object>} Workflow response
   */
  async triggerTripSearch(tripData, userId, sessionId) {
    if (!N8N_WEBHOOK_URL) {
      throw new Error('n8n webhook URL not configured');
    }

    try {
      const payload = {
        event: 'trip_search',
        userId,
        sessionId,
        tripData: {
          destination: tripData.destination,
          startDate: tripData.startDate,
          endDate: tripData.endDate,
          travelers: tripData.travelers || 1,
          budget: tripData.budget || {},
          interests: tripData.interests || [],
          preferences: tripData.preferences || {},
          searchTimestamp: new Date().toISOString()
        },
        callbackUrl: `${process.env.BACKEND_WEBHOOK_URL}/webhook/trip-complete`,
        metadata: {
          requestedAt: new Date().toISOString(),
          source: 'otherwhere-backend'
        }
      };

      console.log(`🔍 Triggering trip search workflow for ${userId}`);
      console.log('Trip data:', JSON.stringify(tripData, null, 2));

      const response = await axios.post(N8N_WEBHOOK_URL, payload, {
        headers: {
          'Content-Type': 'application/json'
        },
        timeout: 10000 // 10 second timeout
      });

      console.log('✅ Trip search workflow triggered successfully');
      return {
        success: true,
        workflowId: response.data?.workflowId || null,
        executionId: response.data?.executionId || null,
        data: response.data
      };

    } catch (error) {
      console.error('Failed to trigger n8n workflow:', error.message);

      if (error.response) {
        console.error('Response error:', error.response.data);
        throw new Error(`n8n workflow error: ${error.response.status} - ${error.response.statusText}`);
      } else if (error.request) {
        throw new Error('n8n workflow timeout or connection error');
      } else {
        throw new Error(`Failed to trigger trip search: ${error.message}`);
      }
    }
  }

  /**
   * Send custom event to n8n workflow
   * @param {string} eventType - Event type
   * @param {Object} data - Event data
   * @returns {Promise<Object>} Response
   */
  async sendEvent(eventType, data) {
    if (!N8N_WEBHOOK_URL) {
      throw new Error('n8n webhook URL not configured');
    }

    try {
      const payload = {
        event: eventType,
        data,
        timestamp: new Date().toISOString()
      };

      const response = await axios.post(N8N_WEBHOOK_URL, payload, {
        headers: {
          'Content-Type': 'application/json'
        },
        timeout: 10000
      });

      return response.data;
    } catch (error) {
      console.error(`Failed to send ${eventType} event to n8n:`, error.message);
      throw error;
    }
  }

  /**
   * Process trip search results from n8n webhook
   * @param {Object} webhookData - Webhook payload from n8n
   * @returns {Object} Processed trip results
   */
  processTripResults(webhookData) {
    const {
      userId,
      sessionId,
      status,
      results,
      error
    } = webhookData;

    if (error) {
      console.error(`Trip search error for user ${userId}:`, error);
      return {
        success: false,
        userId,
        sessionId,
        error: error.message || 'Trip search failed'
      };
    }

    console.log(`✅ Trip search completed for user ${userId}`);

    return {
      success: status === 'completed',
      userId,
      sessionId,
      results: {
        flights: results?.flights || [],
        hotels: results?.hotels || [],
        activities: results?.activities || [],
        itinerary: results?.itinerary || null,
        estimatedCost: results?.estimatedCost || null,
        summary: results?.summary || null
      },
      metadata: {
        processedAt: new Date().toISOString(),
        resultCount: {
          flights: results?.flights?.length || 0,
          hotels: results?.hotels?.length || 0,
          activities: results?.activities?.length || 0
        }
      }
    };
  }

  /**
   * Format trip results for user message
   * @param {Object} tripResults - Processed trip results
   * @param {string} format - 'short' or 'detailed'
   * @returns {string} Formatted message
   */
  formatTripResultsMessage(tripResults, format = 'short') {
    if (!tripResults.success) {
      return "I encountered an issue searching for your trip. Let me try a different approach. Could you tell me more about what you're looking for?";
    }

    const { results } = tripResults;

    if (format === 'short') {
      const summary = [];

      if (results.summary) {
        return results.summary;
      }

      if (results.flights?.length > 0) {
        summary.push(`✈️ Found ${results.flights.length} flight option(s)`);
      }

      if (results.hotels?.length > 0) {
        summary.push(`🏨 Found ${results.hotels.length} hotel option(s)`);
      }

      if (results.activities?.length > 0) {
        summary.push(`🎯 Found ${results.activities.length} activity option(s)`);
      }

      if (results.estimatedCost) {
        summary.push(`💰 Estimated total: ${results.estimatedCost}`);
      }

      return summary.length > 0
        ? `Great news! ${summary.join(' • ')}\n\nI can share more details or help you book. What would you like to do?`
        : "I found some options for your trip! Let me know if you'd like more details.";
    }

    // Detailed format
    let message = "Here's what I found for your trip:\n\n";

    if (results.flights?.length > 0) {
      message += "✈️ FLIGHTS:\n";
      results.flights.slice(0, 3).forEach((flight, i) => {
        message += `${i + 1}. ${flight.airline || 'Flight'}: ${flight.price || 'Price available'}\n`;
      });
      message += "\n";
    }

    if (results.hotels?.length > 0) {
      message += "🏨 HOTELS:\n";
      results.hotels.slice(0, 3).forEach((hotel, i) => {
        message += `${i + 1}. ${hotel.name || 'Hotel'}: ${hotel.price || 'Price available'}\n`;
      });
      message += "\n";
    }

    if (results.activities?.length > 0) {
      message += "🎯 ACTIVITIES:\n";
      results.activities.slice(0, 3).forEach((activity, i) => {
        message += `${i + 1}. ${activity.name || 'Activity'}\n`;
      });
      message += "\n";
    }

    if (results.estimatedCost) {
      message += `💰 Estimated total: ${results.estimatedCost}\n\n`;
    }

    message += "Would you like more details on any of these options?";

    return message;
  }

  /**
   * Check if n8n is configured
   * @returns {boolean} True if configured
   */
  isConfigured() {
    return !!N8N_WEBHOOK_URL;
  }
}

module.exports = new N8nService();
