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
const duffelClient = require('./services/duffelClient');

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

// Link redirector endpoint
const linkRedirectorService = require('./services/linkRedirectorService');

app.get('/r/:token', async (req, res) => {
  const { token } = req.params;
  const startTime = Date.now();

  try {
    console.log(`[Redirector] Request for token: ${token}`);

    const result = await linkRedirectorService.resolveLink(token);
    const latency = Date.now() - startTime;

    console.log(`[Redirector] Redirecting to ${result.provider} (${latency}ms)${result.wasRevalidated ? ' [revalidated]' : ''}`);

    // Redirect to the resolved URL
    res.redirect(302, result.url);

  } catch (error) {
    console.error(`[Redirector] Error resolving token ${token}:`, error.message);

    // Fallback to Google Flights search page
    res.redirect(302, 'https://www.google.com/travel/flights');
  }
});

// Get redirector stats (for debugging)
app.get('/r-stats', (req, res) => {
  const stats = linkRedirectorService.getStats();
  res.json(stats);
});

// Hotels.com cache management (for debugging)
const hotelsService = require('./services/hotelsService');

app.get('/hotels/cache-stats', (req, res) => {
  res.json({
    message: 'Hotels.com cache stats',
    note: 'Use /hotels/clear-cache to clear all cached data'
  });
});

app.post('/hotels/clear-cache', (req, res) => {
  try {
    hotelsService.clearCache();
    res.json({
      success: true,
      message: 'Hotels.com cache cleared successfully'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Twilio webhooks
app.post('/sms/inbound', smsController.handleInboundSMS);
app.post('/sms/status', smsController.handleStatusCallback);
app.post('/webhook/sms/status', smsController.handleStatusCallback); // Alternative path for Twilio

// Voice webhooks  
app.post('/voice/inbound', voiceController.handleInboundCall);
app.post('/voice/process-speech', voiceController.processSpeech);
app.post('/voice/status', voiceController.handleStatusCallback);

// ElevenLabs webhooks
app.post('/webhook/elevenlabs', webhookController.handleElevenLabsWebhook);
app.post('/webhook/elevenlabs/tool-call', webhookController.handleElevenLabsToolCall);

// Duffel webhooks
const duffelWebhookRouter = require('./routes/webhooks/duffel');
app.use('/webhooks/duffel', duffelWebhookRouter);

// Duffel Links routes
const linksRouter = require('./routes/links');
app.use('/links', linksRouter);

// Flight search with airline deep links
const flightsRouter = require('./routes/flights');
app.use('/flights', flightsRouter);

// ARCHIVED: Old Flight search API endpoints (replaced by Duffel Links)
app.post('/api/flights/search', async (req, res) => {
  try {
    const { origin, destination, date, returnDate, passengers = 1, travelClass = 'economy', phoneNumber } = req.body;

    console.log(`[API] Flight search request: ${origin} → ${destination} on ${date}`);

    // Validate required parameters
    if (!origin || !destination || !date) {
      return res.status(400).json({
        success: false,
        error: 'Missing required parameters: origin, destination, and date are required'
      });
    }

    // Step 1: Resolve origin airport code
    console.log(`[API] Resolving origin airport: ${origin}`);
    const originAirports = await googleFlightsService.searchAirport(origin);

    if (!originAirports || originAirports.length === 0) {
      return res.status(400).json({
        success: false,
        error: `Could not find airport for origin: ${origin}`
      });
    }

    // Step 2: Resolve destination airport code
    console.log(`[API] Resolving destination airport: ${destination}`);
    const destAirports = await googleFlightsService.searchAirport(destination);

    if (!destAirports || destAirports.length === 0) {
      return res.status(400).json({
        success: false,
        error: `Could not find airport for destination: ${destination}`
      });
    }

    // Use the first airport found (typically the main one)
    const originCode = originAirports[0]?.code;
    const destCode = destAirports[0]?.code;

    // Validate that we actually got valid airport codes
    if (!originCode) {
      console.error(`[API] Origin airport missing code:`, originAirports[0]);
      return res.status(400).json({
        success: false,
        error: `Could not resolve airport code for origin: ${origin}`
      });
    }

    if (!destCode) {
      console.error(`[API] Destination airport missing code:`, destAirports[0]);
      return res.status(400).json({
        success: false,
        error: `Could not resolve airport code for destination: ${destination}`
      });
    }

    console.log(`[API] Resolved airports: ${originCode} → ${destCode}`);

    // Step 3: Search for flights
    const searchParams = {
      departureId: originCode,
      arrivalId: destCode,
      outboundDate: date,
      adults: parseInt(passengers) || 1,
      travelClass: travelClass.toUpperCase(),
      currency: 'USD'
    };

    // Add return date for round trips
    if (returnDate) {
      searchParams.returnDate = returnDate;
    }

    const searchResults = await googleFlightsService.searchFlights(searchParams);

    // Step 4: Format top 3 results
    const formattedFlights = googleFlightsService.formatFlightResults(searchResults, 3);

    // Step 5: Generate booking URLs for each flight
    const flightsWithBooking = await Promise.all(
      formattedFlights.map(async (flight) => {
        try {
          if (flight.bookingToken) {
            const bookingData = await googleFlightsService.getBookingURL(flight.bookingToken);
            return {
              ...flight,
              bookingUrl: bookingData.bookingUrl
            };
          }
          return flight;
        } catch (error) {
          console.warn(`[API] Could not get booking URL for flight ${flight.index}:`, error.message);
          return flight;
        }
      })
    );

    // Save search to session if phoneNumber provided
    if (phoneNumber) {
      await sessionManager.updateSession(phoneNumber, {
        context: {
          lastFlightSearch: {
            origin,
            destination,
            date,
            returnDate,
            passengers,
            travelClass,
            originCode,
            destCode,
            results: formattedFlights
          }
        }
      });
      console.log(`[API] Saved search to session for ${phoneNumber}`);
    }

    // Return formatted response
    res.json({
      success: true,
      searchInfo: {
        origin: originAirports[0].displayName,
        destination: destAirports[0].displayName,
        originCode,
        destCode,
        date,
        returnDate,
        passengers,
        travelClass
      },
      results: flightsWithBooking,
      count: flightsWithBooking.length,
      smsMessage: googleFlightsService.formatSMSMessage(flightsWithBooking, searchParams)
    });

  } catch (error) {
    console.error('[API] Flight search error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Flight search failed'
    });
  }
});

// Get booking URL for a specific flight
app.post('/api/flights/booking-url', async (req, res) => {
  try {
    const { token } = req.body;

    if (!token) {
      return res.status(400).json({
        success: false,
        error: 'Flight token is required'
      });
    }

    const bookingData = await googleFlightsService.getBookingURL(token);

    res.json(bookingData);

  } catch (error) {
    console.error('[API] Booking URL error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to get booking URL'
    });
  }
});

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

wss.on('connection', async (ws, req) => {
  console.log('🔌 WebSocket connection established');

  try {
    // Let realtimeService handle all the WebSocket logic
    await realtimeService.handleMediaStream(ws);
  } catch (error) {
    console.error('Error setting up Realtime service:', error);
    ws.close();
  }
});

// Start server - bind to 0.0.0.0 for Railway/Docker compatibility
server.listen(PORT, '0.0.0.0', async () => {
  console.log('🚀 Otherwhere Backend running on port ' + PORT);
  console.log('📱 SMS webhook: http://localhost:' + PORT + '/sms/inbound');
  console.log('📞 Voice webhook: http://localhost:' + PORT + '/voice/inbound');
  console.log('🔌 WebSocket endpoint: ws://localhost:' + PORT + '/voice/media-stream');
  console.log('🧠 Using OpenAI model: ' + process.env.OPENAI_MODEL);
  console.log('🎙️ OpenAI Realtime API: ' + (realtimeService.isConfigured() ? 'Enabled' : 'Disabled'));
  console.log('✈️ Duffel API: ' + (duffelClient.isConfigured() ? `${duffelClient.getApiMode()} mode` : 'Not configured'));
  console.log('🔗 Duffel Links: http://localhost:' + PORT + '/links/session');
  console.log('📥 Duffel Webhooks: http://localhost:' + PORT + '/webhooks/duffel');
  console.log('✈️  Flight Search API: http://localhost:' + PORT + '/flights/search');

  // Test database connection and run migrations
  if (process.env.DATABASE_URL) {
    try {
      const db = require('./db');
      const connected = await db.testConnection();

      if (connected) {
        console.log('🗃️  Running database migrations...');
        await db.runMigrations();
        console.log('✅ Database ready');
      }
    } catch (error) {
      console.error('⚠️ Database setup failed:', error.message);
      console.error('   App will continue without database features');
    }
  } else {
    console.log('⚠️ DATABASE_URL not set - database features disabled');
  }
});

module.exports = app;
