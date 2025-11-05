# Services Architecture

This document outlines the current service architecture and guidelines for adding new APIs for flights, accommodations, and other travel services.

## Current Services

### Flight Search Services

#### 1. **Google Flights API** (✅ ACTIVE - PRIMARY - ONLY SERVICE IN USE)
- **File**: `src/services/googleFlightsService.js`
- **Provider**: RapidAPI (Google Flights v2)
- **Status**: ✅ **ACTIVE - This is the ONLY flight search service currently operational**
- **Used in ALL flight searches across:**
  - SMS Controller (OpenAI Assistants API)
  - Webhook Controller (ElevenLabs tool calls)
  - Realtime Service (OpenAI Realtime API)
  - Assistant Service (function calling)
  - Direct API endpoint (`/api/flights/search`)
- **Capabilities**:
  - Airport code resolution (city name → airport code) - DYNAMIC LOOKUP
  - Flight search (one-way and round-trip)
  - Booking URL generation
  - SMS-formatted results
  - Supports 150+ cities worldwide

#### 2. **TravelPayouts API** (⚠️ INACTIVE - NOT IN USE)
- **File**: `src/services/travelPayoutsService.js`
- **Status**: ⚠️ **INACTIVE** - Waiting for affiliate program approval
- **Note**: Kept for future use when API access is granted. Not currently imported or used anywhere in the codebase.

### Accommodation Services

**Status**: 🔜 To be implemented

Recommended APIs for accommodations:
- Booking.com API
- Hotels.com API
- Airbnb API (if available)
- Expedia API

## Integration Points

All travel search services are called from these locations:

### 1. **SMS Controller** (`src/controllers/smsController.js`)
- Handles inbound SMS messages
- Uses OpenAI Assistant with function calling
- Sends formatted results via Twilio SMS

### 2. **Webhook Controller** (`src/controllers/webhookController.js`)
- **ElevenLabs Tool Call Handler** (`handleElevenLabsToolCall`)
  - Primary integration point for voice agent
  - Handles `search_trips` function calls
  - Currently uses: **Google Flights API** ✅
  - Future: Add accommodation search functions

### 3. **Assistant Service** (`src/services/assistantService.js`)
- OpenAI Assistant with function calling
- Handles `search_trips` tool in `waitForRunCompletion`
- Currently uses: **Google Flights API** ✅
- Returns formatted results to SMS controller

### 4. **Realtime Service** (`src/services/realtimeService.js`)
- OpenAI Realtime API for voice conversations
- Handles function calls in real-time
- Currently uses: **Google Flights API** ✅
- Sends results via SMS asynchronously

### 5. **Direct API Endpoint** (`src/app.js`)
- `POST /api/flights/search`
- `POST /api/flights/booking-url`
- Currently uses: **Google Flights API** ✅
- Can be used by any external service

## Adding New Services

### For Flight APIs

1. **Create Service File**
   ```
   src/services/[provider]FlightsService.js
   ```

2. **Implement Required Methods**
   ```javascript
   class FlightService {
     async searchAirport(query) { /* ... */ }
     async searchFlights(params) { /* ... */ }
     async getBookingURL(token) { /* ... */ }
     formatFlightResults(results, limit) { /* ... */ }
     formatSMSMessage(flights, searchInfo) { /* ... */ }
     isConfigured() { /* ... */ }
   }
   ```

3. **Update Integration Points**
   - Add conditional logic or strategy pattern to select API
   - Update all 5 integration points listed above
   - Consider adding API selection environment variable

4. **Add to Environment Variables**
   ```
   [PROVIDER]_API_KEY=...
   [PROVIDER]_API_HOST=...
   ```

### For Accommodation APIs

1. **Create Service File**
   ```
   src/services/[provider]AccommodationService.js
   ```

2. **Implement Standard Methods**
   ```javascript
   class AccommodationService {
     async searchAccommodations(params) { /* ... */ }
     async getAccommodationDetails(id) { /* ... */ }
     async getBookingURL(id) { /* ... */ }
     formatAccommodationResults(results, limit) { /* ... */ }
     formatSMSMessage(accommodations, searchInfo) { /* ... */ }
     isConfigured() { /* ... */ }
   }
   ```

3. **Add New Function/Tool**
   - Create `search_accommodations` function in ElevenLabs agent
   - Add handler in `webhookController.handleElevenLabsToolCall`
   - Add function definition to OpenAI Assistant
   - Add handler in `assistantService.waitForRunCompletion`
   - Add function to OpenAI Realtime API tools

4. **Update Session Management**
   - Store accommodation search results in session context
   - Enable follow-up questions about accommodations

## Service Selection Strategy (Future)

### Option 1: Environment Variable
```javascript
const FLIGHT_API_PROVIDER = process.env.FLIGHT_API_PROVIDER || 'google-flights';

const flightService = FLIGHT_API_PROVIDER === 'google-flights'
  ? googleFlightsService
  : travelPayoutsService;
```

### Option 2: Factory Pattern
```javascript
class FlightServiceFactory {
  static getService() {
    const provider = process.env.FLIGHT_API_PROVIDER || 'google-flights';
    switch (provider) {
      case 'google-flights':
        return googleFlightsService;
      case 'travelpayouts':
        return travelPayoutsService;
      // Add more providers here
      default:
        return googleFlightsService;
    }
  }
}
```

### Option 3: Aggregator Pattern (Best for multiple sources)
```javascript
class FlightAggregatorService {
  constructor() {
    this.providers = [
      googleFlightsService,
      travelPayoutsService,
      // Add more providers
    ];
  }

  async searchFlights(params) {
    // Try each provider in order, or combine results
    for (const provider of this.providers) {
      if (provider.isConfigured()) {
        try {
          return await provider.searchFlights(params);
        } catch (error) {
          console.warn(`${provider.name} failed, trying next...`);
        }
      }
    }
    throw new Error('All flight providers failed');
  }
}
```

## Response Format Standards

### Flight Results
```javascript
{
  index: 1,
  airline: "United Airlines",
  price: 299,
  currency: "USD",
  departure: "2025-12-01 08:30 AM",
  arrival: "2025-12-01 04:45 PM",
  duration: "5 hr 15 min",
  durationMinutes: 315,
  stops: 0,
  stopsText: "Direct",
  bookingToken: "...",
  bookingUrl: "https://..."
}
```

### SMS Message Format
```
✈️ Flights LAX → JFK (2025-12-01)

1. United Airlines
$299 • 08:30 AM - 04:45 PM
5 hr 15 min • Direct

2. Delta Air Lines
$325 • 10:15 AM - 06:30 PM
5 hr 15 min • Direct

3. American Airlines
$350 • 12:00 PM - 08:20 PM
5 hr 20 min • Direct

Reply with a number to get booking link.
```

## Testing

When adding new services:

1. Create test file: `test-[service].js`
2. Test each method independently
3. Test SMS formatting
4. Test integration with all 5 integration points
5. Test error handling and fallbacks

## Environment Variables

Current:
```
# Google Flights (Active)
RAPIDAPI_KEY=...
RAPIDAPI_HOST=google-flights2.p.rapidapi.com

# TravelPayouts (Inactive)
TRAVELPAYOUTS_API_TOKEN=...

# Future accommodations
# BOOKING_API_KEY=...
# AIRBNB_API_KEY=...
```

---

**Last Updated**: 2025-11-04
**Current Active Services**: Google Flights API (RapidAPI)
