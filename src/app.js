const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const morgan = require('morgan');
const http = require('http');
const WebSocket = require('ws');
require('dotenv').config();

// Import controllers
const smsController = require('./controllers/smsController');
const voiceController = require('./controllers/voiceController');
const webhookController = require('./controllers/webhookController');

// Import middleware
const errorHandler = require('./middleware/errorHandler');
const sessionManager = require('./services/sessionManager');

// Import services
const realtimeService = require('./services/realtimeService');

const app = express();
const PORT = process.env.PORT || 3000;

// Create HTTP server for WebSocket support
const server = http.createServer(app);

// Middleware
app.use(cors());
app.use(morgan('combined'));
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ 
    status: 'healthy',
    service: 'Otherwhere Backend',
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || 'development'
  });
});

// Twilio webhooks
app.post('/sms/inbound', smsController.handleInboundSMS);
app.post('/sms/status', smsController.handleStatusCallback);

// Voice webhooks  
app.post('/voice/inbound', voiceController.handleInboundCall);
app.post('/voice/process-speech', voiceController.processSpeech);
app.post('/voice/status', voiceController.handleStatusCallback);

// ElevenLabs webhook (from agents)
app.post('/webhook/elevenlabs', webhookController.handleElevenLabsWebhook);

// n8n webhook (for trip processing)
app.post('/webhook/trip-complete', webhookController.handleTripComplete);

// Session management endpoints (for debugging)
if (process.env.NODE_ENV === 'development') {
  app.get('/sessions', async (req, res) => {
    const sessions = await sessionManager.getAllSessions();
    res.json(sessions);
  });
  
  app.delete('/sessions/:id', async (req, res) => {
    await sessionManager.clearSession(req.params.id);
    res.json({ message: 'Session cleared' });
  });
}

// Error handling middleware (must be last)
app.use(errorHandler);

// Set up WebSocket server for OpenAI Realtime API
const wss = new WebSocket.Server({ server, path: '/voice/media-stream' });

wss.on('connection', (ws, req) => {
  console.log('🔌 WebSocket connection established');

  // Extract parameters from the connection
  let callSid = null;
  let from = null;

  ws.on('message', async (message) => {
    try {
      const msg = JSON.parse(message);

      // Extract call parameters from Twilio's start event
      if (msg.event === 'start') {
        callSid = msg.start.callSid;
        from = msg.start.customParameters?.from || msg.start.customParameters?.From;

        console.log(`📞 Media stream started for call ${callSid} from ${from}`);

        // Initialize OpenAI Realtime API connection
        await realtimeService.handleMediaStream(ws, callSid, from);
      }
    } catch (error) {
      console.error('Error handling WebSocket message:', error);
    }
  });

  ws.on('error', (error) => {
    console.error('WebSocket error:', error);
  });

  ws.on('close', () => {
    console.log(`📴 WebSocket connection closed for ${callSid || 'unknown'}`);
  });
});

// Start server - bind to 0.0.0.0 for Railway/Docker compatibility
server.listen(PORT, '0.0.0.0', () => {
  console.log('🚀 Otherwhere Backend running on port ' + PORT);
  console.log('📱 SMS webhook: http://localhost:' + PORT + '/sms/inbound');
  console.log('📞 Voice webhook: http://localhost:' + PORT + '/voice/inbound');
  console.log('🔌 WebSocket endpoint: ws://localhost:' + PORT + '/voice/media-stream');
  console.log('🧠 Using OpenAI model: ' + process.env.OPENAI_MODEL);
  console.log('🎙️ OpenAI Realtime API: ' + (realtimeService.isConfigured() ? 'Enabled' : 'Disabled'));
});

module.exports = app;
