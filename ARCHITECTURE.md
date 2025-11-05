# Otherwhere Backend Architecture

**Last Updated:** November 4, 2025
**Status:** Active - Production Backend

## Overview

This is the backend service for Otherwhere, an AI travel concierge that handles SMS and voice interactions for trip planning. Users interact via SMS or phone calls to get flight search results sent back to them.

## Current Architecture

```
SMS Flow:
User → Twilio SMS → Backend → OpenAI Assistant → Google Flights API → SMS Response

Voice Flow (Primary):
User → Twilio Voice → ElevenLabs Agent → Backend Webhook → Google Flights API → SMS Response

Voice Flow (Fallback):
User → Twilio Voice → Backend → OpenAI Realtime API → Google Flights API → SMS Response
```

## Core Goal

**Collect trip details from users via SMS or voice, search for flights, and send back booking links via SMS.**

## Components

### 1. SMS Handler (`/sms/inbound`)
- Processes incoming text messages
- Uses OpenAI Assistants API with function calling
- Extracts trip details (destination, dates, travelers, budget)
- Searches flights via Google Flights API (RapidAPI)
- Sends results back as formatted SMS

### 2. Voice Handler (`/voice/inbound`)
- **Primary:** Hands off to ElevenLabs Conversational AI agent
- **Fallback:** OpenAI Realtime API for voice streaming
- Voice responses synthesized via ElevenLabs
- Results sent via SMS after call

### 3. ElevenLabs Webhooks
- **Tool Call Webhook** (`/webhook/elevenlabs/tool-call`): Receives `search_trips` function calls
- **Conversation Webhook** (`/webhook/elevenlabs`): Tracks conversation events
- Includes signature validation for security (HMAC SHA-256)

### 4. Flight Search Integration
- **Primary Service:** Google Flights API via RapidAPI
- **Secondary Service:** TravelPayouts v2 API (Aviasales) - waiting for affiliate approval
- Supports dynamic IATA code lookup (city names → airport codes)
- Returns booking links with tracking/affiliate markers

## Technology Stack

- **Runtime:** Node.js + Express
- **AI Services:**
  - OpenAI GPT-4 (Assistants API & Realtime API)
  - ElevenLabs Conversational AI
- **Communication:** Twilio (SMS + Voice)
- **Flight Data:**
  - Google Flights API (RapidAPI) - Primary
  - TravelPayouts API - Secondary
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
RAPIDAPI_KEY=your_key              # Google Flights API
RAPIDAPI_HOST=google-flights2.p.rapidapi.com
TRAVELPAYOUTS_TOKEN=your_token     # Secondary/fallback
AVIASALES_MARKER=your_affiliate_id
```

## Key Features

### ✅ Implemented
- SMS conversation handling
- Voice call handling with dual implementation (ElevenLabs + OpenAI Realtime)
- OpenAI function calling for trip data extraction
- Flight search via Google Flights API (with dynamic IATA lookup)
- TravelPayouts API integration (secondary)
- Session management with conversation history
- Error handling and fallbacks
- Webhook signature validation for security (HMAC SHA-256)
- Multi-message SMS support for long responses
- Proper error messages sent to users

### ⚠️ In Progress
- Waiting for Aviasales/TravelPayouts affiliate approval

### ❌ Not Implemented
- Hotels search (waiting on API access)
- Activities/experiences search (future)

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
| `/api/flights/search` | POST | Direct flight search API |
| `/api/flights/booking-url` | POST | Get booking URL for a flight |

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

### Dynamic IATA Code Lookup
- Users can provide city names (e.g., "New York", "LA")
- Google Flights API automatically resolves to airport codes
- No hardcoded city mapping required
- Supports 150+ major cities worldwide

### Search Parameters
- Origin city (default: LAX)
- Destination city
- Departure date
- Return date (optional for one-way)
- Number of travelers
- Budget (USD)

### Response Format
- Top 3 flight options sorted by price
- Airline, price, stops, duration
- Booking links (Google Flights or Aviasales)
- Formatted for SMS readability

## Deployment

- **Platform:** Railway, Heroku, or any Node.js hosting
- **Port:** 3000 (configurable via PORT env var)
- **Health Check:** GET `/health`
- **WebSocket Support:** Required for OpenAI Realtime API

## Recent Changes (November 2025)

1. ✅ Removed n8n integration (no longer needed)
2. ✅ Fixed budget parameter inconsistency (USD instead of CAD)
3. ✅ Added proper error handling for flight search failures
4. ✅ Fixed fire-and-forget SMS to handle errors properly
5. ✅ Expanded city code support with dynamic IATA lookup
6. ✅ Added ElevenLabs webhook signature validation
7. ✅ Updated all architecture documentation

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
- **Currency:** Standardized on USD
- **Error Handling:** All async operations have try-catch blocks
- **Logging:** Console logs for debugging (consider structured logging for production)

---

**This backend is actively maintained and in production use.**
