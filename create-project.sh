#!/bin/bash

echo "🚀 Creating Otherwhere Backend Project..."

# Create directory structure
mkdir -p src/controllers src/services src/middleware

# Create package.json
cat > package.json << 'EOF'
{
  "name": "otherwhere-backend",
  "version": "1.0.0",
  "description": "AI Travel Concierge Backend - Unified brain for SMS and Voice",
  "main": "src/app.js",
  "scripts": {
    "start": "node src/app.js",
    "dev": "nodemon src/app.js",
    "test": "jest"
  },
  "dependencies": {
    "express": "^4.18.2",
    "twilio": "^4.19.0",
    "openai": "^4.24.1",
    "axios": "^1.6.2",
    "dotenv": "^16.3.1",
    "body-parser": "^1.20.2",
    "redis": "^4.6.11",
    "morgan": "^1.10.0",
    "cors": "^2.8.5",
    "dayjs": "^1.11.10",
    "uuid": "^9.0.1"
  },
  "devDependencies": {
    "nodemon": "^3.0.2",
    "jest": "^29.7.0"
  }
}
EOF

# Create .env.example
cat > .env.example << 'EOF'
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

# ElevenLabs Configuration
ELEVENLABS_API_KEY=your_elevenlabs_key
ELEVENLABS_TEXT_AGENT_ID=your_text_agent_id
ELEVENLABS_VOICE_AGENT_ID=your_voice_agent_id

# Redis Configuration (for session management)
REDIS_URL=redis://localhost:6379
USE_REDIS=false

# Travel API Keys (to be added)
TRAVELPAYOUTS_TOKEN=
RAPIDAPI_KEY=
GETYOURGUIDE_API_KEY=

# Webhook URLs
N8N_WEBHOOK_URL=https://cyberneticcreative.app.n8n.cloud/webhook/otherwhere-trip-search
BACKEND_WEBHOOK_URL=http://localhost:3000/webhook
EOF

# Create .gitignore
cat > .gitignore << 'EOF'
node_modules/
.env
.DS_Store
*.log
logs/
dist/
.vscode/
.idea/
EOF

echo "✅ Project structure created!"
echo "📦 Installing dependencies..."
npm install

echo "✅ Dependencies installed!"
echo ""
echo "Next steps:"
echo "1. Copy .env.example to .env and add your API keys"
echo "2. Run 'npm run dev' to start the server"
