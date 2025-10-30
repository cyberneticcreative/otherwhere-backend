const twilio = require('twilio');

const accountSid = process.env.TWILIO_ACCOUNT_SID;
const authToken = process.env.TWILIO_AUTH_TOKEN;
const twilioPhoneNumber = process.env.TWILIO_PHONE_NUMBER;

let client = null;

if (accountSid && authToken) {
  client = twilio(accountSid, authToken);
  console.log('✅ Twilio client initialized');
} else {
  console.warn('⚠️ Twilio credentials not configured');
}

class TwilioService {
  /**
   * Send an SMS message
   * @param {string} to - Recipient phone number
   * @param {string} body - Message body
   * @param {Object} options - Additional options
   * @returns {Promise<Object>} Message object
   */
  async sendSMS(to, body, options = {}) {
    if (!client) {
      throw new Error('Twilio client not initialized. Check your credentials.');
    }

    try {
      const message = await client.messages.create({
        body,
        from: twilioPhoneNumber,
        to,
        statusCallback: options.statusCallback || process.env.BACKEND_WEBHOOK_URL + '/sms/status',
        ...options
      });

      console.log(`📱 SMS sent to ${to}: ${message.sid}`);
      return message;
    } catch (error) {
      console.error('Failed to send SMS:', error);
      throw error;
    }
  }

  /**
   * Send multiple SMS messages (for long content)
   * @param {string} to - Recipient phone number
   * @param {string} body - Message body
   * @param {number} chunkSize - Max characters per message
   * @returns {Promise<Array>} Array of message objects
   */
  async sendLongSMS(to, body, chunkSize = 1600) {
    const chunks = this.splitMessage(body, chunkSize);
    const messages = [];

    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i];
      const prefix = chunks.length > 1 ? `(${i + 1}/${chunks.length}) ` : '';
      messages.push(await this.sendSMS(to, prefix + chunk));

      // Small delay between messages to ensure order
      if (i < chunks.length - 1) {
        await this.delay(500);
      }
    }

    return messages;
  }

  /**
   * Generate TwiML response for voice
   * @param {string} message - Message to speak
   * @param {Object} options - TwiML options
   * @returns {string} TwiML XML
   */
  generateVoiceResponse(message, options = {}) {
    const VoiceResponse = twilio.twiml.VoiceResponse;
    const response = new VoiceResponse();

    const say = response.say({
      voice: options.voice || 'Polly.Joanna',
      language: options.language || 'en-US'
    }, message);

    if (options.gather) {
      const gather = response.gather({
        input: 'speech',
        action: options.gatherAction || '/voice/process-speech',
        method: 'POST',
        speechTimeout: options.speechTimeout || 'auto',
        language: options.language || 'en-US'
      });

      gather.say({
        voice: options.voice || 'Polly.Joanna'
      }, message);
    }

    if (options.hangup) {
      response.hangup();
    }

    return response.toString();
  }

  /**
   * Make an outbound call
   * @param {string} to - Recipient phone number
   * @param {string} url - TwiML URL to execute
   * @param {Object} options - Additional options
   * @returns {Promise<Object>} Call object
   */
  async makeCall(to, url, options = {}) {
    if (!client) {
      throw new Error('Twilio client not initialized');
    }

    try {
      const call = await client.calls.create({
        to,
        from: twilioPhoneNumber,
        url,
        statusCallback: options.statusCallback || process.env.BACKEND_WEBHOOK_URL + '/voice/status',
        statusCallbackEvent: ['initiated', 'ringing', 'answered', 'completed'],
        ...options
      });

      console.log(`📞 Call initiated to ${to}: ${call.sid}`);
      return call;
    } catch (error) {
      console.error('Failed to make call:', error);
      throw error;
    }
  }

  /**
   * Get call details
   * @param {string} callSid - Call SID
   * @returns {Promise<Object>} Call details
   */
  async getCallDetails(callSid) {
    if (!client) {
      throw new Error('Twilio client not initialized');
    }

    return await client.calls(callSid).fetch();
  }

  /**
   * Get message details
   * @param {string} messageSid - Message SID
   * @returns {Promise<Object>} Message details
   */
  async getMessageDetails(messageSid) {
    if (!client) {
      throw new Error('Twilio client not initialized');
    }

    return await client.messages(messageSid).fetch();
  }

  /**
   * Validate Twilio webhook signature
   * @param {string} signature - X-Twilio-Signature header
   * @param {string} url - Full webhook URL
   * @param {Object} params - Request parameters
   * @returns {boolean} True if valid
   */
  validateSignature(signature, url, params) {
    return twilio.validateRequest(
      authToken,
      signature,
      url,
      params
    );
  }

  /**
   * Split long message into chunks
   * @param {string} message - Message to split
   * @param {number} chunkSize - Max size per chunk
   * @returns {Array<string>} Message chunks
   */
  splitMessage(message, chunkSize = 1600) {
    const chunks = [];
    let currentChunk = '';

    const sentences = message.split(/([.!?]+\s+)/);

    for (const sentence of sentences) {
      if ((currentChunk + sentence).length <= chunkSize) {
        currentChunk += sentence;
      } else {
        if (currentChunk) {
          chunks.push(currentChunk.trim());
        }
        currentChunk = sentence;
      }
    }

    if (currentChunk) {
      chunks.push(currentChunk.trim());
    }

    return chunks;
  }

  /**
   * Delay helper
   * @param {number} ms - Milliseconds to delay
   * @returns {Promise<void>}
   */
  delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

module.exports = new TwilioService();
