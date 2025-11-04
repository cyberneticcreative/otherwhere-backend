# Otherwhere Backend

AI Travel Concierge Backend - SMS and Voice travel planning powered by OpenAI, Twilio, ElevenLabs, and TravelPayouts.

**📖 See [ARCHITECTURE.md](./ARCHITECTURE.md) for detailed architecture documentation.**

## Overview

Otherwhere is an intelligent travel concierge that helps users plan amazing trips through natural conversations via SMS or voice calls. The system uses AI to understand travel preferences, ask clarifying questions, and coordinate with external services to search for flights, hotels, and activities.

## Features

- **Multi-Channel Support**: Interact via SMS or voice calls
- **AI-Powered Conversations**: Uses OpenAI GPT-4 with function calling for natural language understanding
- **Voice AI Integration**: ElevenLabs conversational AI for voice interactions
- **Session Management**: Maintains conversation context across interactions
- **Flight Search**: Direct integration with TravelPayouts API (Aviasales)
- **Comprehensive City Support**: 150+ major cities worldwide
- **Twilio Integration**: SMS and voice webhooks with error handling
- **Webhook Security**: Signature validation for ElevenLabs webhooks
- **Redis Support**: Optional Redis for production session storage

## Architecture

```
├── src/
│   ├── app.js                      # Express app entry point
│   ├── controllers/
│   │   ├── smsController.js        # SMS webhook handlers
│   │   ├── voiceController.js      # Voice webhook handlers
│   │   └── webhookController.js    # ElevenLabs webhooks
│   ├── services/
│   │   ├── sessionManager.js       # Session/conversation management
│   │   ├── llmService.js           # Direct OpenAI LLM integration
│   │   ├── assistantService.js     # OpenAI Assistants API
│   │   ├── realtimeService.js      # OpenAI Realtime API (voice)
│   │   ├── twilioService.js        # Twilio SMS/Voice
│   │   ├── elevenLabsService.js    # ElevenLabs AI agents
│   │   └── travelPayoutsService.js # Flight search API
│   ├── middleware/
│   │   └── errorHandler.js         # Global error handling
│   └── utils/
│       └── constants.js            # App constants
```

## Prerequisites

- Node.js (v16 or higher)
- npm or yarn
- Twilio account with SMS and Voice capabilities
- OpenAI API key
- TravelPayouts API token and Aviasales affiliate marker
- ElevenLabs account (optional, for enhanced voice AI)
- Redis (optional, for production session storage)

## Installation

1. Clone the repository:
```bash
git clone https://github.com/cyberneticcreative/otherwhere-backend.git
cd otherwhere-backend
```

2. Install dependencies:
```bash
npm install
```

3. Copy `.env.example` to `.env` and configure your environment variables:
```bash
cp .env.example .env
```

4. Update `.env` with your API keys and configuration:
```
# Server Configuration
PORT=3000
NODE_ENV=development

# OpenAI Configuration
OPENAI_API_KEY=your_openai_api_key_here
OPENAI_MODEL=gpt-4-turbo-preview

# Twilio Configuration
TWILIO_ACCOUNT_SID=your_account_sid
TWILIO_AUTH_TOKEN=your_auth_token
TWILIO_PHONE_NUMBER=+19789179795

# ElevenLabs Configuration (Optional)
ELEVENLABS_API_KEY=your_elevenlabs_key
ELEVENLABS_TEXT_AGENT_ID=your_text_agent_id
ELEVENLABS_VOICE_AGENT_ID=your_voice_agent_id
ELEVENLABS_WEBHOOK_SECRET=your_webhook_secret

# Travel API Configuration
TRAVELPAYOUTS_TOKEN=your_token
AVIASALES_MARKER=your_affiliate_id

# Redis Configuration (Optional)
REDIS_URL=redis://localhost:6379
USE_REDIS=false
```

## Running the Application

### Development Mode
```bash
npm run dev
```

### Production Mode
```bash
npm start
```

### Running Tests
```bash
npm test
```

## API Endpoints

### Health Check
- `GET /health` - Returns service health status

### Twilio Webhooks
- `POST /sms/inbound` - Receives inbound SMS messages
- `POST /sms/status` - Receives SMS status callbacks
- `POST /voice/inbound` - Handles inbound voice calls
- `POST /voice/process-speech` - Processes voice input
- `POST /voice/status` - Receives call status callbacks

### Integration Webhooks
- `POST /webhook/elevenlabs` - Receives conversation webhooks from ElevenLabs agents
- `POST /webhook/elevenlabs/tool-call` - Receives function call webhooks from ElevenLabs

### Development Endpoints
- `GET /sessions` - Lists all active sessions (dev only)
- `DELETE /sessions/:id` - Clears a specific session (dev only)

## How It Works

### SMS Flow
1. User sends SMS to Twilio number
2. Twilio forwards message to `/sms/inbound` webhook
3. System retrieves or creates user session
4. Message is sent to OpenAI Assistants API for processing
5. If trip details are extracted, flight search is triggered via TravelPayouts API
6. Flight results are formatted and sent back to user via SMS

### Voice Flow (ElevenLabs)
1. User calls Twilio number
2. Twilio hits `/voice/inbound` webhook
3. System generates TwiML to hand off call to ElevenLabs agent
4. User converses naturally with ElevenLabs AI
5. When trip details are collected, `search_trips` function is called
6. Backend webhook receives function call and searches flights
7. Results are sent to user via SMS

### Voice Flow (Fallback - OpenAI Realtime)
1. User calls Twilio number
2. Twilio connects audio stream to WebSocket `/voice/media-stream`
3. Audio is streamed bidirectionally to OpenAI Realtime API
4. OpenAI processes speech in real-time and responds
5. When trip details are extracted, flights are searched
6. Results are sent via SMS

### Trip Search Flow
1. AI (OpenAI or ElevenLabs) identifies complete trip requirements
2. System extracts structured trip data (destination, dates, travelers, budget)
3. TravelPayouts API is called with search parameters
4. Flight results are sorted by price and formatted
5. Top 5 results with Aviasales booking links are sent to user
6. User can click the link to book directly

## Session Management

Sessions are stored in-memory by default or in Redis for production use. Each session includes:
- Conversation history (last 20 messages)
- User context and preferences
- Trip details and search status
- Channel information (SMS/Voice)
- Agent IDs for ElevenLabs integration

Sessions expire after 30 minutes of inactivity and are automatically cleaned up.

## Environment Variables

See `.env.example` for all available configuration options. Key variables:

- `OPENAI_API_KEY` - Required for AI responses
- `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN` - Required for Twilio integration
- `TRAVELPAYOUTS_TOKEN` - Required for flight search
- `AVIASALES_MARKER` - Required for affiliate tracking
- `ELEVENLABS_API_KEY` - Optional, for enhanced voice AI
- `ELEVENLABS_WEBHOOK_SECRET` - Optional, for webhook signature validation
- `USE_REDIS` - Set to `true` to use Redis for session storage

## Deployment

### Heroku
```bash
heroku create otherwhere-backend
heroku config:set OPENAI_API_KEY=your_key
heroku config:set TWILIO_ACCOUNT_SID=your_sid
# ... set other env vars
git push heroku master
```

### Railway
```bash
railway login
railway init
railway up
```

### Docker
```bash
docker build -t otherwhere-backend .
docker run -p 3000:3000 --env-file .env otherwhere-backend
```

## Development

### Project Structure
- **Controllers**: Handle HTTP requests and responses
- **Services**: Business logic and external API integrations
- **Middleware**: Request processing and error handling
- **Utils**: Helper functions and constants

### Adding New Features
1. Create service in `src/services/` for external integrations
2. Create controller in `src/controllers/` for HTTP endpoints
3. Add routes in `src/app.js`
4. Update error handling in `src/middleware/errorHandler.js`

## Twilio Setup

1. Buy a phone number with SMS and Voice capabilities
2. Configure webhooks in Twilio console:
   - SMS: `https://your-domain.com/sms/inbound`
   - Voice: `https://your-domain.com/voice/inbound`
3. Set status callbacks:
   - SMS: `https://your-domain.com/sms/status`
   - Voice: `https://your-domain.com/voice/status`

## ElevenLabs Setup (Optional)

1. Create conversational AI agents in ElevenLabs dashboard
2. Configure voice agent for phone call interactions
3. Add `search_trips` function/tool to the agent:
   - Parameters: `destination`, `origin`, `check_in`, `check_out`, `travelers`, `budget_usd`
4. Set tool call webhook URL to `https://your-domain.com/webhook/elevenlabs/tool-call`
5. Set conversation webhook URL to `https://your-domain.com/webhook/elevenlabs`
6. Generate webhook secret and add to `.env` as `ELEVENLABS_WEBHOOK_SECRET`
7. Add agent IDs to `.env`

## TravelPayouts Setup

1. Sign up for TravelPayouts account at https://www.travelpayouts.com
2. Apply for Aviasales affiliate program
3. Get your API token from the dashboard
4. Get your Aviasales marker (affiliate ID)
5. Add both to `.env` as `TRAVELPAYOUTS_TOKEN` and `AVIASALES_MARKER`

## Troubleshooting

### SMS not working
- Verify Twilio credentials in `.env`
- Check webhook URL is publicly accessible
- Review Twilio debugger in console

### Voice not working
- Ensure phone number has voice capabilities
- Check TwiML response format
- Verify webhook URLs are correct

### OpenAI errors
- Verify API key is valid
- Check rate limits and quota
- Review error logs for details

### Session issues
- Clear old sessions in development mode via `/sessions` endpoint
- Consider enabling Redis for production
- Check session cleanup logs

## Security

- Never commit `.env` file to version control
- Use environment variables for all secrets
- Validate Twilio webhook signatures in production
- Rate limit API endpoints
- Sanitize user input
- Use HTTPS in production

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Submit a pull request

## License

MIT License - See LICENSE file for details

## Support

For issues and questions:
- GitHub Issues: https://github.com/cyberneticcreative/otherwhere-backend/issues
- Email: support@otherwhere.ai

## Roadmap

- [ ] Add authentication for API endpoints
- [ ] Implement user accounts and profile management
- [ ] Add support for more languages
- [ ] Integration with more travel APIs
- [ ] Web dashboard for managing conversations
- [ ] Analytics and reporting
- [ ] WhatsApp integration
- [ ] Email notifications
