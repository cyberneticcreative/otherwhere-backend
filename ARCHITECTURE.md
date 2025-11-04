# Otherwhere Backend Architecture

**Last Updated:** November 4, 2025
**Status:** Active - Production Backend

## Overview

This is the backend service for Otherwhere, an AI travel concierge that handles SMS and voice interactions for trip planning. Users interact via SMS or phone calls to get flight search results sent back to them.

## Current Architecture

```
SMS Flow:
User → Twilio SMS → Backend → OpenAI Assistant → TravelPayouts API → SMS Response

Voice Flow (Primary):
User → Twilio Voice → ElevenLabs Agent → Backend Webhook → TravelPayouts API → SMS Response

Voice Flow (Fallback):
User → Twilio Voice → Backend → OpenAI Realtime API → TravelPayouts API → SMS Response
```

## Core Goal

**Collect trip details from users via SMS or voice, search for flights, and send back booking links via SMS.**

## Components

### 1. SMS Handler (`/sms/inbound`)
- Processes incoming text messages
- Uses OpenAI Assistants API with function calling
- Extracts trip details (destination, dates, travelers, budget)
- Searches flights via TravelPayouts API
- Sends results back as formatted SMS

### 2. Voice Handler (`/voice/inbound`)
- **Primary:** Hands off to ElevenLabs Conversational AI agent
- **Fallback:** OpenAI Realtime API for voice streaming
- Voice responses synthesized via Amazon Polly or ElevenLabs
- Results sent via SMS after call

### 3. ElevenLabs Webhooks
- **Tool Call Webhook** (`/webhook/elevenlabs/tool-call`): Receives `search_trips` function calls
- **Conversation Webhook** (`/webhook/elevenlabs`): Tracks conversation events
- Includes signature validation for security

### 4. Flight Search Integration
- **Service:** TravelPayouts v2 API (Aviasales)
- **Status:** Waiting for affiliate approval
- **Future:** Will be replaced with actual Google Flights or expanded affiliate network
- Supports 150+ major cities worldwide
- Returns Aviasales booking links with affiliate markers

## Technology Stack

- **Runtime:** Node.js + Express
- **AI Services:**
  - OpenAI GPT-4 (Assistants API & Realtime API)
  - ElevenLabs Conversational AI
- **Communication:** Twilio (SMS + Voice)
- **Flight Data:** TravelPayouts API
- **Session Storage:** Redis (production) / In-memory (development)

## Environment Variables

```bash
# Server
PORT=3000
NODE_ENV=development

# OpenAI
OPENAI_API_KEY=your_api_key
OPENAI_MODEL=gpt-4-turbo-preview
OPENAI_ASSISTANT_ID=asst_xxx  # Optional, for Assistants API

# Twilio
TWILIO_ACCOUNT_SID=your_sid
TWILIO_AUTH_TOKEN=your_token
TWILIO_PHONE_NUMBER=+1xxx

# ElevenLabs
ELEVENLABS_API_KEY=your_key
ELEVENLABS_TEXT_AGENT_ID=agent_xxx
ELEVENLABS_VOICE_AGENT_ID=agent_xxx
ELEVENLABS_WEBHOOK_SECRET=your_secret  # For webhook signature validation

# Redis (Production)
REDIS_URL=redis://localhost:6379
USE_REDIS=false

# Travel APIs
TRAVELPAYOUTS_TOKEN=your_token
AVIASALES_MARKER=your_affiliate_id
```

## Key Features

### ✅ Implemented
- SMS conversation handling
- Voice call handling with dual implementation (ElevenLabs + OpenAI Realtime)
- OpenAI function calling for trip data extraction
- Flight search via TravelPayouts API
- Comprehensive city code support (150+ cities)
- Session management with conversation history
- Error handling and fallbacks
- Webhook signature validation for security
- Multi-message SMS support for long responses

### ⚠️ In Progress
- Waiting for Aviasales/TravelPayouts affiliate approval
- Waiting for hotel API access (future integration)

### ❌ Not Implemented
- Hotels search (waiting on API access)
- Activities/experiences search (future)
- Direct Google Flights integration (using TravelPayouts instead)

## API Endpoints

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/health` | GET | Health check |
| `/sms/inbound` | POST | Twilio SMS webhook |
| `/sms/status` | POST | SMS delivery status |
| `/voice/inbound` | POST | Twilio voice webhook |
| `/voice/process-speech` | POST | Process voice input (fallback) |
| `/voice/status` | POST | Voice call status |
| `/voice/media-stream` | WebSocket | OpenAI Realtime API streaming |
| `/webhook/elevenlabs` | POST | ElevenLabs conversation events |
| `/webhook/elevenlabs/tool-call` | POST | ElevenLabs function calls |

## Security

- **Webhook Signature Validation:** ElevenLabs webhooks validated with HMAC SHA-256
- **Environment Variables:** Sensitive credentials stored in environment
- **Error Handling:** Graceful error messages, no credential leakage
- **Session Cleanup:** Automatic cleanup after 30 minutes of inactivity

## Session Management

- **Storage:** In-memory Map (dev) or Redis (production)
- **TTL:** 30 minutes
- **Data Stored:**
  - Conversation history (last 20 messages)
  - Trip details
  - OpenAI thread ID (for Assistants API)
  - Channel (SMS or voice)
  - Session metadata

## Flight Search Details

### Supported Cities (150+)
- North America: NYC, LAX, SFO, CHI, MIA, etc.
- Europe: LON, PAR, ROM, BCN, AMS, etc.
- Asia: TYO, BKK, SIN, HKG, etc.
- And many more...

### Search Parameters
- Origin city (default: LAX)
- Destination city
- Departure date
- Return date (optional for one-way)
- Number of travelers
- Budget (USD)

### Response Format
- Top 5 flight options sorted by price
- Airline, price, stops, duration
- Aviasales booking link with affiliate marker
- Formatted for SMS readability

## Deployment

- **Platform:** Railway, Heroku, or any Node.js hosting
- **Port:** 3000 (configurable via PORT env var)
- **Health Check:** GET `/health`
- **WebSocket Support:** Required for OpenAI Realtime API

## Future Enhancements

1. **Hotel Search:** Integrate hotel API once access is granted
2. **Activity Search:** Add experiences/tours
3. **Multi-destination:** Support complex itineraries
4. **Price Alerts:** Notify users of price changes
5. **Booking Integration:** Direct booking flow (not just links)
6. **Analytics:** Track user interactions and conversion rates

## Development

```bash
# Install dependencies
npm install

# Set up environment variables
cp .env.example .env
# Edit .env with your credentials

# Run locally
npm start

# Development with auto-reload
npm run dev
```

## Notes

- **n8n Integration:** Removed (no longer used)
- **Currency:** Standardized on USD (was CAD previously)
- **Error Handling:** All async operations have try-catch blocks
- **Logging:** Console logs for debugging (consider structured logging for production)

---

**This backend is actively maintained and in production use.**
