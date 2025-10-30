/**
 * Application constants
 */

const CHANNELS = {
  SMS: 'sms',
  VOICE: 'voice',
  WEB: 'web'
};

const MESSAGE_ROLES = {
  USER: 'user',
  ASSISTANT: 'assistant',
  SYSTEM: 'system'
};

const SESSION_STATUS = {
  ACTIVE: 'active',
  IDLE: 'idle',
  COMPLETED: 'completed'
};

const TRIP_SEARCH_STATUS = {
  PENDING: 'pending',
  IN_PROGRESS: 'in_progress',
  COMPLETED: 'completed',
  FAILED: 'failed'
};

const WEBHOOK_EVENTS = {
  ELEVENLABS: {
    CONVERSATION_STARTED: 'conversation.started',
    CONVERSATION_MESSAGE: 'conversation.message',
    CONVERSATION_ENDED: 'conversation.ended',
    AGENT_ACTION: 'agent.action'
  },
  N8N: {
    TRIP_SEARCH_COMPLETE: 'trip_search_complete',
    TRIP_SEARCH_ERROR: 'trip_search_error'
  }
};

const ERROR_MESSAGES = {
  GENERIC: "I'm sorry, I encountered an error. Please try again.",
  OPENAI_ERROR: "I'm having trouble thinking right now. Please try again in a moment.",
  TWILIO_ERROR: "I'm having trouble sending messages right now. Please try again later.",
  N8N_ERROR: "I'm having trouble searching for trips right now. Let me try a different approach.",
  SESSION_ERROR: "I'm having trouble accessing your conversation history. Let's start fresh."
};

const SMS_LIMITS = {
  MAX_LENGTH: 320,
  CHUNK_SIZE: 320
};

const VOICE_SETTINGS = {
  DEFAULT_VOICE: 'Polly.Joanna',
  DEFAULT_LANGUAGE: 'en-US',
  SPEECH_TIMEOUT: 'auto',
  MAX_WORDS: 15
};

const SESSION_CONFIG = {
  MAX_CONVERSATION_HISTORY: 20,
  SESSION_TTL_MINUTES: 30,
  CLEANUP_INTERVAL_MINUTES: 15
};

const HTTP_STATUS = {
  OK: 200,
  CREATED: 201,
  BAD_REQUEST: 400,
  UNAUTHORIZED: 401,
  NOT_FOUND: 404,
  INTERNAL_SERVER_ERROR: 500,
  SERVICE_UNAVAILABLE: 503
};

module.exports = {
  CHANNELS,
  MESSAGE_ROLES,
  SESSION_STATUS,
  TRIP_SEARCH_STATUS,
  WEBHOOK_EVENTS,
  ERROR_MESSAGES,
  SMS_LIMITS,
  VOICE_SETTINGS,
  SESSION_CONFIG,
  HTTP_STATUS
};
