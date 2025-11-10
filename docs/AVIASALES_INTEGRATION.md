# Aviasales / TravelPayouts Integration

## Overview

Otherwhere uses a **hybrid approach** for flight bookings:

1. **Aviasales API** - For flight discovery (SMS/AI recommendations)
2. **White-Label Widget** - For bookings with full attribution (`book.otherwhere.world`)
3. **Smart Fallback** - Automatic failover to deep links if white-label is unavailable

---

## Architecture

```
┌─────────────┐
│  User (SMS) │
└──────┬──────┘
       │
       ▼
┌──────────────────┐
│ Aviasales API    │  ← Discovery: Find flights, show prices
│ (travelPayouts   │
│  Service)        │
└──────┬───────────┘
       │
       │ User wants to book
       ▼
┌──────────────────┐
│  /go/flights     │  ← Validation + Routing
│  (Ingress)       │
└──────┬───────────┘
       │
       ├─── Healthy? ──→ ┌──────────────────────┐
       │                 │ White-Label Widget   │
       │                 │ (book.otherwhere.    │
       │                 │  world)              │
       │                 └──────────────────────┘
       │                          ↓
       │                   ✅ Full Attribution
       │                   (marker + subid)
       │
       └─── Unhealthy? ─→ ┌──────────────────────┐
                          │ Fallback Deep Links  │
                          │ - Aviasales Direct   │
                          │ - Kayak (no affiliate)│
                          └──────────────────────┘
```

---

## Configuration

### Environment Variables

Add to `.env`:

```bash
# Aviasales API & Affiliate Credentials
AVIASALES_TOKEN=6e78afe70bbc55ff9fd91b517d71e435
AVIASALES_MARKER=681469
AVIASALES_WL_HOST=book.otherwhere.world

# Backend URL (for /go/flights links in SMS)
BACKEND_WEBHOOK_URL=https://your-backend.railway.app
```

### DNS Setup

Create a CNAME record:

```
book.otherwhere.world → whitelabel.travelpayouts.com
```

**Verify DNS:**
```bash
dig book.otherwhere.world CNAME
```

### Travelpayouts Dashboard Setup

1. Go to: [partner.travelpayouts.com](https://partner.travelpayouts.com)
2. Navigate to: **Tools → White Label**
3. Configure:
   - **Domain:** `book.otherwhere.world`
   - **Marker:** `681469`
   - **SubID Tracking:** Enabled
   - **Logo:** Upload Otherwhere logo
   - **Brand Colors:** Set primary color
   - **Custom CSS:** (Optional) Add font matching

---

## API Endpoints

### 1. `/go/flights` - Flight Redirect (PRIMARY)

**Purpose:** Single ingress for all SMS/web flight bookings

**Method:** `GET`

**Query Parameters:**

| Param | Type   | Required | Description                     | Example      |
|-------|--------|----------|---------------------------------|--------------|
| `o`   | String | Yes      | Origin IATA code (3 letters)    | `YYZ`        |
| `d`   | String | Yes      | Destination IATA code           | `LIS`        |
| `dd`  | String | Yes      | Departure date (YYYY-MM-DD)     | `2026-02-12` |
| `rd`  | String | No       | Return date (omit for one-way)  | `2026-02-20` |
| `ad`  | Number | No       | Adults (default: 1)             | `2`          |
| `ch`  | Number | No       | Children (default: 0)           | `1`          |
| `in`  | Number | No       | Infants (default: 0)            | `0`          |
| `cls` | String | No       | Cabin class: e\|p\|b\|f (default: e) | `e`     |
| `cur` | String | No       | Currency code (default: USD)    | `USD`        |
| `sid` | String | No       | Session ID (auto-generated)     | `abc123`     |

**Example Request:**
```
GET /go/flights?o=YYZ&d=LIS&dd=2026-02-12&rd=2026-02-20&ad=2&ch=1&cls=e&cur=USD
```

**Response:**
- `302 Redirect` to white-label (if healthy)
- `302 Redirect` to fallback (if unhealthy)
- `400 Bad Request` (if validation fails)

**Example URLs Generated:**

**White-Label (Primary):**
```
https://book.otherwhere.world/YYZ0212LIS0220?adults=2&children=1&trip_class=0&currency=USD&marker=681469&subid=ow_abc123
```

**Aviasales Fallback:**
```
https://www.aviasales.com/search/YYZ0212LIS0220?adults=2&children=1&trip_class=0&marker=681469&subid=ow_abc123
```

**Kayak Fallback (No Affiliate):**
```
https://www.kayak.com/flights/YYZ-LIS/2026-02-12/2026-02-20?passengers=3&utm_source=otherwhere
```

---

### 2. `/go/flights/health` - Health Check

**Method:** `GET`

**Response:**
```json
{
  "status": "ok",
  "service": "go-flights",
  "timestamp": "2025-11-10T12:00:00.000Z",
  "whiteLabel": {
    "isHealthy": true,
    "host": "book.otherwhere.world",
    "p95Latency": 245,
    "successRate": 0.98
  }
}
```

---

### 3. `/go/flights/stats` - Analytics & Metrics

**Method:** `GET`

**Response:**
```json
{
  "whiteLabelHealth": {
    "isHealthy": true,
    "host": "book.otherwhere.world",
    "consecutiveFailures": 0,
    "rolling60s": {
      "totalChecks": 240,
      "successRate": 0.983,
      "failureRate": 0.017,
      "p50Latency": 180,
      "p95Latency": 245
    },
    "lifetime": {
      "totalChecks": 8640,
      "totalFailures": 42,
      "failureRate": 0.0049
    }
  }
}
```

---

## Validation Rules

The `/go/flights` endpoint validates:

1. **Airport Codes:** Must be 3-letter IATA codes (uppercase)
2. **Dates:**
   - Must be `YYYY-MM-DD` format
   - Departure must be in the future
   - Return must be after departure (if provided)
3. **Passengers:**
   - At least 1 adult required
   - Infants cannot exceed adults
   - Negative counts rejected
4. **Cabin Class:** Must be `e`, `p`, `b`, or `f`
5. **Currency:** Must be 3-letter ISO code

**Error Response Example:**
```json
{
  "success": false,
  "error": "Invalid search parameters",
  "details": [
    "Departure date must be in the future",
    "Number of infants cannot exceed number of adults"
  ],
  "suggestedFixes": {
    "departureDate": "2026-02-13",
    "infants": 1
  }
}
```

---

## White-Label Health Monitoring

The backend continuously monitors white-label availability:

- **Check Interval:** Every 15 seconds
- **Method:** `GET https://book.otherwhere.world/robots.txt`
- **Timeout:** 5 seconds
- **Metrics Window:** Rolling 60 seconds

**Fallback Triggers:**

1. **3+ consecutive failures**
2. **p95 latency > 3000ms**

When triggered:
- Auto-switch to Aviasales deep links (if marker available)
- Fallback to Kayak (if no marker)
- Log event with reason code

---

## Usage in Code

### 1. Flight Discovery (Aviasales API)

```javascript
const travelPayoutsService = require('./services/travelPayoutsService');

const tripData = {
  origin: 'Toronto',
  destination: 'Lisbon',
  startDate: '2026-02-12',
  endDate: '2026-02-20',
  travelers: 2,
  budget: { currency: 'USD' }
};

// Search for flights (discovery only)
const results = await travelPayoutsService.searchFlights(tripData);

// ⚠️ DO NOT use results.flights[0].link directly
// Instead, build /go/flights URL:

const sessionId = 'user_session_123';
const bookingUrl = travelPayoutsService.buildGoFlightsURL(tripData, sessionId);

// Send to user via SMS
await sendSMS(phoneNumber, `Book now: ${bookingUrl}`);
```

### 2. Direct /go/flights Link (SMS)

```javascript
const baseUrl = process.env.BACKEND_WEBHOOK_URL;

const flightLink = `${baseUrl}/go/flights?o=YYZ&d=LIS&dd=2026-02-12&rd=2026-02-20&ad=2&ch=1&cls=e&cur=USD&sid=abc123&utm_source=sms`;

await sendSMS(phoneNumber, `✈️ View flights: ${flightLink}`);
```

---

## Provider Selection Logic

**Priority Order:**

1. **White-Label** (if healthy)
   - Full attribution (marker + subid)
   - Branded experience
   - Commission tracking

2. **Aviasales Direct** (if white-label down + marker available)
   - Still has affiliate tracking
   - Lower conversion rate
   - Less branding

3. **Kayak** (if no marker)
   - No affiliate commission
   - Reliable fallback
   - UTM tracking only

---

## Attribution & Tracking

### Marker

- **Value:** `681469`
- **Purpose:** Identifies Otherwhere as the affiliate partner
- **Appears in:** All white-label and Aviasales URLs

### SubID

- **Format:** `ow_{sessionId}`
- **Purpose:** Tracks individual user sessions for conversion analysis
- **Example:** `ow_abc123def456`
- **Appears in:** All booking URLs

### Reconciliation

**Daily Job (Manual):**

1. Export clicks from Travelpayouts dashboard
2. Filter by `subid` prefix `ow_`
3. Join with backend logs by `sessionId`
4. Calculate conversion rate per source (SMS, web, voice)

**Example Log Query:**
```javascript
// Find all redirects with their outcomes
SELECT
  requestId,
  provider,
  sessionId,
  timestamp
FROM event_logs
WHERE event = 'flight_redirect'
  AND timestamp > NOW() - INTERVAL '24 hours'
ORDER BY timestamp DESC;
```

---

## Testing

### 1. Run Unit Tests

```bash
node tests/flightLinks.test.js
```

Expected output:
```
✅ Passed: 28
❌ Failed: 0
```

### 2. Manual Test Flow

**Step 1: Test White-Label Health**
```bash
curl http://localhost:3000/go/flights/health
```

**Step 2: Test Valid Redirect**
```bash
curl -I "http://localhost:3000/go/flights?o=YYZ&d=LIS&dd=2026-02-12&rd=2026-02-20&ad=2"
```

Expected: `302 Found` with `Location` header

**Step 3: Test Validation Errors**
```bash
curl "http://localhost:3000/go/flights?o=INVALID&d=LIS&dd=2020-01-01"
```

Expected: `400 Bad Request` with error details

**Step 4: Test Fallback**

Temporarily set an invalid white-label host:
```bash
export AVIASALES_WL_HOST=nonexistent.example.com
```

Then test:
```bash
curl -I "http://localhost:3000/go/flights?o=YYZ&d=LIS&dd=2026-02-12"
```

Expected: Redirect to Aviasales or Kayak

---

## Deployment Checklist

### Pre-Deploy

- [ ] Set `AVIASALES_TOKEN` in Railway/production env
- [ ] Set `AVIASALES_MARKER` in Railway/production env
- [ ] Set `AVIASALES_WL_HOST=book.otherwhere.world`
- [ ] Set `BACKEND_WEBHOOK_URL` to production URL
- [ ] Verify DNS CNAME is live

### Deploy

```bash
git add .
git commit -m "Add Aviasales white-label integration"
git push -u origin claude/aviasales-travelpayouts-integration-011CUzm7SyQsDoZi6jDYReYQ
```

### Post-Deploy Verification

1. **Check logs for health check start:**
   ```
   🏥 Aviasales White-Label Health Check: Started
   ✈️  Flight Redirect Endpoint: http://localhost:3000/go/flights
   ```

2. **Test /go/flights endpoint:**
   ```bash
   curl https://your-backend.railway.app/go/flights/health
   ```

3. **Send test SMS with booking link:**
   ```
   https://your-backend.railway.app/go/flights?o=LAX&d=JFK&dd=2026-03-15&rd=2026-03-22
   ```

4. **Monitor Travelpayouts dashboard:**
   - Check for clicks within 2 hours
   - Verify `marker=681469` appears
   - Verify `subid=ow_*` appears

5. **Make test booking:**
   - Use the link from SMS
   - Complete a real booking (small amount)
   - Wait 48-72 hours for attribution

---

## Monitoring & Alerts

### Key Metrics to Track

1. **White-Label Availability**
   - Target: >99% uptime
   - Alert if <95% over 15 minutes

2. **Fallback Rate**
   - Target: <5%
   - Alert if >10% over 15 minutes

3. **p95 Latency**
   - Target: <300ms for /go/flights
   - Alert if >1000ms

4. **Conversion Rate**
   - Clicks → Bookings
   - Track weekly via Travelpayouts dashboard

### Log Monitoring

**Watch for these events:**
```bash
tail -f logs/app.log | grep "GoFlights"
```

**Example healthy log:**
```
[GoFlights:abc123] Incoming request: { o: 'YYZ', d: 'LIS', ... }
[GoFlights:abc123] White-label health: healthy
[GoFlights:abc123] Selected provider: whitelabel
[GoFlights:abc123] ⏱️ TOTAL request time: 87ms
```

**Example fallback log:**
```
[GoFlights:def456] White-label health: unhealthy
[GoFlights:def456] Selected provider: aviasales
[GoFlights:def456] Analytics: {"fallbackUsed":true,"fallbackReason":"consecutive_failures_3"}
```

---

## Troubleshooting

### Issue: White-label always unhealthy

**Symptoms:** All requests use fallback provider

**Diagnosis:**
```bash
curl https://book.otherwhere.world/robots.txt
```

**Solutions:**
1. Check DNS CNAME is correct
2. Verify domain in Travelpayouts dashboard
3. Check for HTTPS redirect issues
4. Verify no firewall blocking

---

### Issue: No clicks in Travelpayouts dashboard

**Symptoms:** Links work but no attribution

**Diagnosis:**
```bash
# Check if marker is in URL
curl -I "https://your-backend.railway.app/go/flights?o=LAX&d=JFK&dd=2026-03-15" | grep Location
```

**Solutions:**
1. Verify `AVIASALES_MARKER` is set correctly
2. Check that marker appears in final redirect URL
3. Wait 2-4 hours (attribution delay)
4. Check Travelpayouts dashboard filters

---

### Issue: Validation errors

**Symptoms:** 400 Bad Request responses

**Diagnosis:**
```bash
curl "https://your-backend.railway.app/go/flights?o=INVALID&d=LIS&dd=2020-01-01"
```

**Solutions:**
1. Check date format (YYYY-MM-DD)
2. Ensure airport codes are 3 letters
3. Verify passengers: adults ≥ 1, infants ≤ adults
4. Use suggested fixes from error response

---

## File Structure

```
src/
├── providers/
│   └── flightsLinks.js          # URL builders for all providers
├── routes/
│   └── goFlights.js             # /go/flights endpoint
├── services/
│   ├── travelPayoutsService.js  # Aviasales API client
│   └── whiteLabelHealthCheck.js # Health monitoring service
├── app.js                       # Route registration + health check startup
tests/
└── flightLinks.test.js          # Unit tests
docs/
└── AVIASALES_INTEGRATION.md     # This file
```

---

## Next Steps (Optional Enhancements)

1. **Sub-markers per source:**
   - `681469.sms` for SMS links
   - `681469.web` for web app
   - `681469.voice` for voice calls

2. **Geolocation defaults:**
   - Auto-detect origin from user IP
   - Suggest top 3 nearby airports

3. **Smart date suggestions:**
   - "±1 day" links for flexible travelers
   - Weekend getaway shortcuts

4. **A/B Testing:**
   - Test different SMS copy
   - Measure click-through rates
   - Optimize conversion funnel

5. **OpenTelemetry:**
   - Distributed tracing
   - Latency percentiles
   - Error rate dashboards

---

## Support

- **Travelpayouts Dashboard:** [partner.travelpayouts.com](https://partner.travelpayouts.com)
- **API Documentation:** [Travelpayouts API Docs](https://support.travelpayouts.com/hc/en-us/categories/115000474268)
- **White-Label Setup:** Tools → White Label in dashboard

---

**Last Updated:** 2025-11-10
**Version:** 1.0.0
