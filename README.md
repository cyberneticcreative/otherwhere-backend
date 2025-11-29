# Otherwhere Backend

AI Travel Concierge Backend - A unified brain for SMS and Voice travel planning powered by OpenAI, Twilio, and ElevenLabs.

## Overview

Otherwhere is an intelligent travel concierge that helps users plan amazing trips through natural conversations via SMS or voice calls. The system uses AI to understand travel preferences, ask clarifying questions, and coordinate with external services to search for flights, hotels, and activities.

## Features

- **Multi-Channel Support**: Interact via SMS or voice calls
- **AI-Powered Conversations**: Uses OpenAI GPT-4 for natural language understanding
- **Voice AI Integration**: ElevenLabs conversational AI for voice interactions
- **Session Management**: Maintains conversation context across interactions
- **Flight Search**: Direct integration with TravelPayouts and Google Flights APIs
- **Twilio Integration**: SMS and voice webhooks
- **Error Handling**: Comprehensive error handling and logging
- **Redis Support**: Optional Redis for production session storage

## Architecture

```
├── src/
│   ├── app.js                 # Express app entry point
│   ├── controllers/
│   │   ├── smsController.js   # SMS webhook handlers
│   │   ├── voiceController.js # Voice webhook handlers
│   │   └── webhookController.js # ElevenLabs webhooks
│   ├── services/
│   │   ├── sessionManager.js   # Session/conversation management
│   │   ├── openaiService.js    # OpenAI integration
│   │   ├── twilioService.js    # Twilio SMS/Voice
│   │   ├── elevenLabsService.js # ElevenLabs AI agents
│   │   └── googleFlightsService.js # Flight search integration
│   ├── middleware/
│   │   └── errorHandler.js    # Global error handling
│   └── utils/
│       ├── constants.js       # App constants
│       └── helpers.js         # Utility functions
```

## Prerequisites

- Node.js (v16 or higher)
- npm or yarn
- Twilio account with SMS and Voice capabilities
- OpenAI API key
- ElevenLabs account (optional, for voice AI)
- RapidAPI key for Google Flights API
- Redis (optional, for production)

## Installation

1. Clone the repository:
```bash
git clone https://github.com/otherwhere666/otherwhere-backend.git
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

# Redis Configuration (Optional)
REDIS_URL=redis://localhost:6379
USE_REDIS=false

# Travel APIs
RAPIDAPI_KEY=your_rapidapi_key_here
TRAVELPAYOUTS_TOKEN=your_token
AVIASALES_MARKER=your_affiliate_id
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
- `POST /webhook/elevenlabs` - Receives webhooks from ElevenLabs agents
- `POST /webhook/elevenlabs/tool-call` - Receives tool/function calls from ElevenLabs

### Development Endpoints
- `GET /sessions` - Lists all active sessions (dev only)
- `DELETE /sessions/:id` - Clears a specific session (dev only)

## How It Works

### SMS Flow
1. User sends SMS to Twilio number
2. Twilio forwards message to `/sms/inbound` webhook
3. System retrieves or creates user session
4. Message is sent to OpenAI for processing with function calling
5. If trip details are extracted, flight search is triggered
6. Results are sent back to user via SMS

### Voice Flow
1. User calls Twilio number
2. Twilio hits `/voice/inbound` webhook
3. Call is handed off to ElevenLabs conversational AI agent
4. ElevenLabs processes voice and calls `/webhook/elevenlabs/tool-call` for flight search
5. System searches flights via Google Flights/TravelPayouts API
6. Results are sent back to user via SMS
7. Conversation continues through ElevenLabs agent

### Flight Search Flow
1. AI identifies complete trip requirements from conversation
2. System extracts structured trip data (origin, destination, dates, travelers, budget)
3. Flight search is triggered via Google Flights or TravelPayouts API
4. Top results are formatted and sent to user via SMS with booking links

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
- `ELEVENLABS_API_KEY` - Optional, for voice AI enhancement
- `RAPIDAPI_KEY` - Required for Google Flights API
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
3. Add `search_trips` tool/function to agent with parameters:
   - destination (string)
   - origin (string, default: LAX)
   - check_in (date)
   - check_out (date)
   - travelers (number)
   - budget_usd (number)
4. Set tool call webhook URL to `https://your-domain.com/webhook/elevenlabs/tool-call`
5. Set conversation webhook URL to `https://your-domain.com/webhook/elevenlabs`
6. Add agent IDs to `.env`

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
- GitHub Issues: https://github.com/otherwhere666/otherwhere-backend/issues
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
