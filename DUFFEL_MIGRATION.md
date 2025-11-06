# Duffel Migration Guide
**Date:** November 6, 2025
**Status:** Phase 1 (MVP) Complete - Ready for Testing

## What Changed

We've successfully migrated from Google Flights API to **Duffel Links v2** for flight booking. This gives you:

✅ **Professional hosted checkout** - Users complete booking on Duffel's secure platform
✅ **Revenue from day 1** - 2% fee with $10 minimum per booking
✅ **Real bookings** - Actual ticket issuance, not just affiliate links
✅ **Better UX** - Single link to browse all flights and book directly
✅ **Persistent data** - All bookings stored in PostgreSQL database

## Architecture Changes

### Before (Google Flights)
```
User SMS → OpenAI extracts params → Google Flights API → Show 3 options
User replies "1" → Get booking token → Send Google Flights URL
```

### After (Duffel Links v2)
```
User SMS → OpenAI extracts params → Create Duffel Links session → Send booking URL
User clicks → Duffel hosted checkout → Complete booking → Webhook confirmation
```

## New Files Created

### Database Layer
- `src/db/index.js` - PostgreSQL client and connection pool
- `src/db/queries.js` - Database query helpers
- `src/db/migrations/001_initial_schema.sql` - Database schema

### Duffel Integration
- `src/services/duffelClient.js` - Base Duffel API client
- `src/services/duffelLinksService.js` - Links v2 session creation
- `src/routes/links.js` - Links API endpoints
- `src/routes/webhooks/duffel.js` - Webhook handler for order events

### Archived Files
- `archive/2025-11-06-pre-duffel/googleFlightsService.js`
- `archive/2025-11-06-pre-duffel/airbnbService.js`
- `archive/2025-11-06-pre-duffel/README.md`

## Files Updated

### Controllers
- `src/controllers/smsController.js` - Now creates Duffel Links instead of showing flight options
- `src/controllers/webhookController.js` - ElevenLabs tool calls now create Links sessions

### Services
- `src/services/assistantService.js` - OpenAI Assistant function calling uses Duffel

### Configuration
- `src/app.js` - Added Duffel routes and webhooks, database testing on startup
- `.env.example` - Added Duffel and database configuration

## Database Schema

Four tables power the new system:

### `conversations`
Tracks SMS conversations by phone number
- `id` (UUID)
- `phone` (VARCHAR)
- `intent` ('browse' or 'book_for_me')
- `search_params` (JSONB)

### `link_sessions`
Tracks Duffel Links sessions sent to users
- `id` (UUID)
- `duffel_session_id` (VARCHAR)
- `session_url` (TEXT)
- `expires_at` (TIMESTAMP)
- `status` ('sent', 'completed', 'expired')
- `search_params` (JSONB)

### `bookings`
Completed bookings from Duffel webhooks
- `id` (UUID)
- `duffel_order_id` (VARCHAR)
- `booking_reference` (VARCHAR) - PNR
- `passenger_name` (VARCHAR)
- `origin`, `destination` (VARCHAR)
- `total_paid` (DECIMAL)
- `order_data` (JSONB) - Full Duffel order

### `event_logs`
Audit trail of all system events
- `id` (UUID)
- `event_type` (VARCHAR)
- `entity_type` (VARCHAR)
- `payload` (JSONB)

## Setup Steps

### 1. Railway PostgreSQL Setup

In your Railway project:
1. Click "+ New" → "Database" → "PostgreSQL"
2. Railway auto-generates `DATABASE_URL` environment variable
3. The app will auto-detect and connect on startup

### 2. Run Database Migrations

The migrations will run automatically on first connection. Or manually:

```bash
node -e "require('./src/db').runMigrations()"
```

### 3. Set Environment Variables

Copy from `.env.example` and set these in Railway:

```env
# Duffel (REQUIRED)
DUFFEL_ACCESS_TOKEN=duffel_test_YOUR_TOKEN_HERE
DUFFEL_WEBHOOK_SECRET=(get from Duffel dashboard)

# Database (Railway auto-injects this)
DATABASE_URL=postgresql://...

# Brand (optional, defaults provided)
BRAND_NAME=Otherwhere
BRAND_LOGO_URL=https://otherwhere.app/logo.png
BRAND_COLOR=#E75C1E
SUCCESS_URL=https://otherwhere.app/success
CANCEL_URL=https://otherwhere.app/cancel
FAILURE_URL=https://otherwhere.app/failure
```

### 4. Configure Duffel Webhooks

In the Duffel dashboard:
1. Go to Settings → Webhooks
2. Add webhook URL: `https://your-app.railway.app/webhooks/duffel`
3. Subscribe to events:
   - `order.created`
   - `order.updated`
   - `order.cancelled`
   - `session.completed`
4. Copy the webhook secret to `DUFFEL_WEBHOOK_SECRET`

### 5. Deploy to Railway

```bash
git add .
git commit -m "Migrate to Duffel Links v2"
git push origin claude/replace-flight-booking-apis-011CUr83EEjjvjLmK3BSTYzR
```

Railway will auto-deploy. Watch logs for:
```
✅ Database connected
✅ Duffel API: test mode
```

## Testing Checklist

### ✅ Test 1: Duffel API Connection
```bash
curl -X GET https://api.duffel.com/air/aircraft?limit=1 \
  -H "Authorization: Bearer duffel_test_YOUR_TOKEN_HERE" \
  -H "Duffel-Version: v2"
```

Expected: JSON response with aircraft data

### ✅ Test 2: Database Connection
```bash
curl https://your-app.railway.app/health
```

Expected: `"status": "healthy"`

Check logs for: `✅ Database connected`

### ✅ Test 3: Create Links Session (API)
```bash
curl -X POST https://your-app.railway.app/links/session \
  -H "Content-Type: application/json" \
  -d '{
    "phone": "+15555551234",
    "searchParams": {
      "origin": "YVR",
      "destination": "NRT",
      "departure_date": "2025-12-15",
      "return_date": "2025-12-22",
      "passengers": 1
    }
  }'
```

Expected: JSON with `session_id`, `url`, `expires_at`

### ✅ Test 4: SMS End-to-End Flow

1. **Send SMS:**
   ```
   Find flights from Vancouver to Tokyo for December 15-22
   ```

2. **Expected Response:**
   ```
   ✈️ Found flight options for you!

   Route: YVR → NRT
   Departure: 2025-12-15
   Return: 2025-12-22

   Book securely here:
   https://links.duffel.com/sessions/ses_xxx

   Includes fare monitoring + rebooking support.
   ```

3. **Click Link** → Duffel hosted page loads
4. **Complete Booking** (use Duffel test mode)
5. **Check Database:**
   ```sql
   SELECT * FROM bookings ORDER BY created_at DESC LIMIT 1;
   ```

6. **Expect Confirmation SMS:**
   ```
   ✅ Booking Confirmed!

   Reference: ABC123
   Passenger: John Doe
   Route: YVR → NRT
   Departure: 2025-12-15
   Total: USD 850.00

   🎉 Have a great trip!
   ```

### ✅ Test 5: Voice (ElevenLabs) Flow

1. Call your Twilio number
2. Say: "Find me flights from LAX to NYC for next Friday"
3. Expect SMS with Duffel Links URL
4. Complete booking as above

### ✅ Test 6: Webhook Signature Validation

```bash
# Without signature - should fail
curl -X POST https://your-app.railway.app/webhooks/duffel \
  -H "Content-Type: application/json" \
  -d '{"event": "test"}'
```

Expected: `401 Unauthorized` (if DUFFEL_WEBHOOK_SECRET is set)

## API Endpoints

### Links Creation
```
POST /links/session
Body: { phone, searchParams }
Returns: { session_id, url, expires_at }
```

### Get Sessions by Conversation
```
GET /links/sessions/:conversationId
Returns: { sessions: [...] }
```

### Format Links SMS
```
POST /links/format-sms
Body: { session_url, search_params, expires_at }
Returns: { message: "..." }
```

### Duffel Webhooks
```
POST /webhooks/duffel
Headers: X-Duffel-Signature
Body: Duffel webhook payload
```

## Monitoring & Debugging

### Check Recent Bookings
```sql
SELECT
  booking_reference,
  passenger_name,
  origin,
  destination,
  departure_date,
  total_paid,
  created_at
FROM bookings
ORDER BY created_at DESC
LIMIT 10;
```

### Check Link Sessions
```sql
SELECT
  ls.duffel_session_id,
  ls.status,
  ls.created_at,
  c.phone
FROM link_sessions ls
JOIN conversations c ON ls.conversation_id = c.id
ORDER BY ls.created_at DESC
LIMIT 10;
```

### Check Event Logs
```sql
SELECT
  event_type,
  entity_type,
  created_at,
  payload->>'message' as message
FROM event_logs
ORDER BY created_at DESC
LIMIT 20;
```

### Check Stats
```bash
curl https://your-app.railway.app/stats
```

## Revenue Tracking

Each booking has a **2% fee with $10 minimum**:

```sql
-- Calculate total revenue
SELECT
  COUNT(*) as total_bookings,
  SUM(total_paid) as total_booking_value,
  SUM(
    CASE
      WHEN total_paid * 0.02 > 10
      THEN total_paid * 0.02
      ELSE 10
    END
  ) as total_revenue
FROM bookings
WHERE status = 'confirmed';
```

## Troubleshooting

### Issue: "Database connection failed"
**Fix:** Check that `DATABASE_URL` is set in Railway environment variables

### Issue: "Duffel API not configured"
**Fix:** Set `DUFFEL_ACCESS_TOKEN` in environment variables

### Issue: Links session creation fails
**Check:**
1. Is `DUFFEL_ACCESS_TOKEN` correct?
2. Are search params valid? (origin, destination, departure_date required)
3. Check logs for error details

### Issue: Webhooks not received
**Check:**
1. Is webhook URL correct in Duffel dashboard?
2. Is `DUFFEL_WEBHOOK_SECRET` set?
3. Are events subscribed in Duffel?
4. Check Railway logs for incoming webhook requests

### Issue: Booking confirmation SMS not sent
**Check:**
1. Did webhook arrive? (check event_logs)
2. Is conversation phone number valid?
3. Check Twilio logs for SMS delivery

## Next Steps (Phase 2)

🚀 **Track B - Concierge "Book For Me"**
- User accounts (magic link auth)
- Traveler profiles (encrypted)
- Stripe integration (save cards, charge 8% fee)
- Duffel Flights API (direct booking)
- Quote → Approve → Book workflow

🏨 **Duffel Stays**
- Replace Airbnb API when Stays access granted
- Similar Links flow for hotels

📊 **Analytics Dashboard**
- Track conversion rates
- Monitor booking volume
- Revenue reporting

✈️ **Fare Monitoring**
- Daily cron job to re-query same routes
- Alert users if price drops
- One-tap rebooking

## Support

- **Duffel Docs:** https://duffel.com/docs/api/v2/sessions
- **Duffel SDK:** https://www.npmjs.com/package/@duffel/api
- **Railway Docs:** https://docs.railway.app
- **Issues:** Check Railway logs and database event_logs table

---

**Migration completed by:** Claude
**Date:** November 6, 2025
**Branch:** `claude/replace-flight-booking-apis-011CUr83EEjjvjLmK3BSTYzR`
