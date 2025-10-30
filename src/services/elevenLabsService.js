const axios = require('axios');

const ELEVENLABS_API_KEY = process.env.ELEVENLABS_API_KEY;
const TEXT_AGENT_ID = process.env.ELEVENLABS_TEXT_AGENT_ID;
const VOICE_AGENT_ID = process.env.ELEVENLABS_VOICE_AGENT_ID;

const BASE_URL = 'https://api.elevenlabs.io/v1';

class ElevenLabsService {
  /**
   * Send a text message to ElevenLabs conversational AI agent
   * @param {string} message - User message
   * @param {string} agentId - Agent ID (defaults to TEXT_AGENT_ID)
   * @param {Object} metadata - Additional metadata
   * @returns {Promise<Object>} Agent response
   */
  async sendTextMessage(message, agentId = TEXT_AGENT_ID, metadata = {}) {
    if (!ELEVENLABS_API_KEY) {
      throw new Error('ElevenLabs API key not configured');
    }

    try {
      const response = await axios.post(
        `${BASE_URL}/convai/agents/${agentId}/message`,
        {
          message,
          metadata: {
            ...metadata,
            timestamp: new Date().toISOString()
          }
        },
        {
          headers: {
            'xi-api-key': ELEVENLABS_API_KEY,
            'Content-Type': 'application/json'
          }
        }
      );

      console.log(`🧠 ElevenLabs response for agent ${agentId}`);
      return response.data;
    } catch (error) {
      console.error('ElevenLabs API error:', error.response?.data || error.message);
      throw new Error('Failed to get response from ElevenLabs agent');
    }
  }

  /**
   * Initiate a voice conversation with ElevenLabs agent
   * @param {string} phoneNumber - User's phone number
   * @param {string} agentId - Agent ID (defaults to VOICE_AGENT_ID)
   * @param {Object} metadata - Additional metadata
   * @returns {Promise<Object>} Conversation initiation response
   */
  async initiateVoiceConversation(phoneNumber, agentId = VOICE_AGENT_ID, metadata = {}) {
    if (!ELEVENLABS_API_KEY) {
      throw new Error('ElevenLabs API key not configured');
    }

    try {
      const response = await axios.post(
        `${BASE_URL}/convai/agents/${agentId}/voice/initiate`,
        {
          phone_number: phoneNumber,
          metadata: {
            ...metadata,
            timestamp: new Date().toISOString()
          }
        },
        {
          headers: {
            'xi-api-key': ELEVENLABS_API_KEY,
            'Content-Type': 'application/json'
          }
        }
      );

      console.log(`📞 Voice conversation initiated for ${phoneNumber}`);
      return response.data;
    } catch (error) {
      console.error('ElevenLabs voice initiation error:', error.response?.data || error.message);
      throw new Error('Failed to initiate voice conversation');
    }
  }

  /**
   * Get agent configuration
   * @param {string} agentId - Agent ID
   * @returns {Promise<Object>} Agent configuration
   */
  async getAgentConfig(agentId) {
    if (!ELEVENLABS_API_KEY) {
      throw new Error('ElevenLabs API key not configured');
    }

    try {
      const response = await axios.get(
        `${BASE_URL}/convai/agents/${agentId}`,
        {
          headers: {
            'xi-api-key': ELEVENLABS_API_KEY
          }
        }
      );

      return response.data;
    } catch (error) {
      console.error('Failed to get agent config:', error.response?.data || error.message);
      throw error;
    }
  }

  /**
   * Process webhook from ElevenLabs agent
   * @param {Object} webhookData - Webhook payload
   * @returns {Object} Processed webhook data
   */
  processWebhook(webhookData) {
    const {
      event_type,
      agent_id,
      conversation_id,
      message,
      metadata,
      timestamp
    } = webhookData;

    console.log(`🔔 ElevenLabs webhook: ${event_type} from agent ${agent_id}`);

    return {
      eventType: event_type,
      agentId: agent_id,
      conversationId: conversation_id,
      message: message || null,
      metadata: metadata || {},
      timestamp: timestamp || new Date().toISOString()
    };
  }

  /**
   * Format message for ElevenLabs agent based on channel
   * @param {string} userMessage - Raw user message
   * @param {string} channel - 'sms' or 'voice'
   * @param {Object} context - Additional context
   * @returns {string} Formatted message
   */
  formatMessageForAgent(userMessage, channel, context = {}) {
    let formattedMessage = userMessage;

    // Add channel context
    if (channel) {
      formattedMessage = `[${channel.toUpperCase()}] ${formattedMessage}`;
    }

    // Add conversation context if available
    if (context.previousMessages && context.previousMessages.length > 0) {
      const recentContext = context.previousMessages
        .slice(-3)
        .map(msg => `${msg.role}: ${msg.content}`)
        .join('\n');

      formattedMessage = `Previous context:\n${recentContext}\n\nCurrent message: ${formattedMessage}`;
    }

    return formattedMessage;
  }

  /**
   * Check if ElevenLabs is configured
   * @returns {boolean} True if configured
   */
  isConfigured() {
    return !!(ELEVENLABS_API_KEY && (TEXT_AGENT_ID || VOICE_AGENT_ID));
  }

  /**
   * Get configured agent IDs
   * @returns {Object} Object with textAgent and voiceAgent IDs
   */
  getAgentIds() {
    return {
      textAgent: TEXT_AGENT_ID,
      voiceAgent: VOICE_AGENT_ID
    };
  }
}

module.exports = new ElevenLabsService();
