# Duffel Links Implementation Guide

**Status:** 🔒 Waiting for Duffel Links Access (Canadian Registration)
**Last Updated:** November 7, 2025
**Markup:** 3% with $20 USD minimum (whichever is higher)

---

## 📋 Overview

This guide documents how to implement **Duffel Links v2** when access is granted. Duffel Links provides a hosted checkout experience where users browse and book flights directly on Duffel's secure platform.

### Why Duffel Links?

✅ **Revenue from day 1** - 3% markup with $20 minimum per booking
✅ **Professional checkout** - Duffel-hosted, secure payment processing
✅ **Better UX** - Users browse ALL flights and airlines in one place
✅ **Real bookings** - Actual ticket issuance, PNR generation
✅ **Persistent data** - All bookings tracked via webhooks
✅ **No maintenance** - No airline deep links to maintain

### Current vs. Future State

**Current (Kayak Fallback):**
```
User → OpenAI → Duffel Flights API → 3 flight options → Kayak links
```

**Future (Duffel Links):**
```
User → OpenAI → Create Duffel Session → Single booking link → Duffel checkout
```

---

## 🔑 Prerequisites

Before implementing, ensure you have:

- [x] Duffel account (registered in Canada) ✅
- [ ] **Duffel Links access granted** (currently waiting)
- [ ] `DUFFEL_ACCESS_TOKEN` for production mode
- [ ] Webhook secret from Duffel dashboard
- [ ] PostgreSQL database connected (already set up ✅)
- [ ] Airport resolver working (already set up ✅)

---

## 💰 Markup Configuration

### Your Pricing Structure

**3% with $20 USD minimum** (whichever is higher)

| Ticket Price | 3% Markup | Minimum | **You Earn** |
|--------------|-----------|---------|--------------|
| $200         | $6        | $20     | **$20**      |
| $500         | $15       | $20     | **$20**      |
| $700         | $21       | $20     | **$21**      |
| $1,000       | $30       | $20     | **$30**      |
| $2,000       | $60       | $20     | **$60**      |

### Duffel API Implementation

Duffel Links supports two markup parameters:

```javascript
{
  "markup_rate": "0.03",        // 3% of ticket price
  "markup_amount": "20.00",     // $20 minimum
  "markup_currency": "USD"
}
```

**Important:** When both are provided, Duffel uses **whichever is higher**. Perfect for your 3% + $20 min structure!

---

## 🛠️ Implementation Steps

### Step 1: Update Environment Variables

Add to Railway (or `.env` for local):

```env
# Duffel Configuration
DUFFEL_ACCESS_TOKEN=duffel_live_YOUR_PRODUCTION_TOKEN
DUFFEL_WEBHOOK_SECRET=your_webhook_secret_from_dashboard

# Brand Customization
BRAND_NAME=Otherwhere
BRAND_LOGO_URL=https://otherwhere.app/logo.png
BRAND_COLOR=#E75C1E

# Redirect URLs (Duffel redirects users here after booking)
SUCCESS_URL=https://otherwhere.app/booking-success
FAILURE_URL=https://otherwhere.app/booking-failed
ABANDONMENT_URL=https://otherwhere.app/booking-cancelled
```

**Note:** Redirect URLs should be valid pages on your site. Duffel appends query params like `?order_id=xxx`.

---

### Step 2: Replace Duffel Links Service

**File:** `src/services/duffelLinksService.js`

Replace the current `createFlightSession()` function with:

```javascript
const axios = require('axios');

const DUFFEL_API_URL = 'https://api.duffel.com';
const DUFFEL_TOKEN = process.env.DUFFEL_ACCESS_TOKEN;

/**
 * Create a Duffel Links session
 * @param {Object} params
 * @param {string} params.conversationId - Conversation UUID
 * @param {string} params.phone - User's phone number
 * @param {Object} params.searchParams - { origin, destination, departure_date, return_date, passengers, cabin_class }
 * @returns {Promise<Object>} { id, url, expires_at }
 */
async function createFlightSession(params) {
  const { conversationId, phone, searchParams } = params;

  try {
    console.log('[DuffelLinks] Creating session:', { phone, searchParams });

    // Build Duffel Links session request
    const requestBody = {
      data: {
        // Reference for tracking (use phone number or conversation ID)
        reference: conversationId || phone,

        // Redirect URLs
        success_url: process.env.SUCCESS_URL || 'https://otherwhere.app/booking-success',
        failure_url: process.env.FAILURE_URL || 'https://otherwhere.app/booking-failed',
        abandonment_url: process.env.ABANDONMENT_URL || 'https://otherwhere.app/booking-cancelled',

        // Brand customization
        logo_url: process.env.BRAND_LOGO_URL || 'https://otherwhere.app/logo.png',
        primary_color: process.env.BRAND_COLOR || '#E75C1E',
        checkout_display_text: 'Otherwhere booking support fee',

        // Markup: 3% with $20 USD minimum (whichever is higher)
        markup_rate: '0.03',        // 3%
        markup_amount: '20.00',     // $20 minimum
        markup_currency: 'USD',

        // Currency
        traveller_currency: 'USD',

        // Enable flights
        flights: {
          enabled: true
        }
      }
    };

    // Call Duffel Sessions API
    const response = await axios.post(
      `${DUFFEL_API_URL}/links/sessions`,
      requestBody,
      {
        headers: {
          'Authorization': `Bearer ${DUFFEL_TOKEN}`,
          'Duffel-Version': 'v2',
          'Content-Type': 'application/json'
        },
        timeout: 30000
      }
    );

    const session = response.data.data;

    console.log('[DuffelLinks] ✅ Session created:', {
      url: session.url,
      expires: '24 hours'
    });

    // Log to database (optional)
    if (conversationId) {
      try {
        await logEvent('duffel_session_created', 'session', conversationId, {
          session_url: session.url,
          search_params: searchParams
        });
      } catch (logError) {
        console.warn('[DuffelLinks] Could not log event:', logError.message);
      }
    }

    return {
      id: session.id || `ses_${Date.now()}`,
      url: session.url,
      expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString() // 24 hours
    };

  } catch (error) {
    console.error('[DuffelLinks] ❌ Session creation failed:', error.response?.data || error.message);

    // Log failure
    if (conversationId) {
      try {
        await logEvent('duffel_session_failed', 'session', conversationId, {
          error: error.message,
          search_params: searchParams
        });
      } catch (logError) {
        // Ignore logging errors
      }
    }

    throw new Error(`Failed to create booking session: ${error.message}`);
  }
}
```

---

### Step 3: Update SMS Message Format

**File:** `src/services/duffelLinksService.js`

Update `formatLinksSMS()`:

```javascript
/**
 * Format SMS message with Duffel Links booking URL
 * @param {Object} params
 * @param {string} params.sessionUrl - Duffel Links URL
 * @param {Object} params.searchParams - { origin, destination, departure_date, return_date }
 * @returns {string} SMS message
 */
function formatLinksSMS(params) {
  const { sessionUrl, searchParams } = params;
  const { origin, destination, departure_date, return_date } = searchParams;

  // Format date as MM/DD
  const formatDate = (dateStr) => {
    if (!dateStr) return '';
    const [year, month, day] = dateStr.split('-');
    return `${month}/${day}`;
  };

  let message = `✈️ ${origin} → ${destination}\n`;

  if (departure_date) {
    message += `Departing: ${formatDate(departure_date)}\n`;
  }

  if (return_date) {
    message += `Returning: ${formatDate(return_date)}\n`;
  }

  message += `\n📲 Browse flights & book:\n${sessionUrl}\n\n`;
  message += `✓ Compare all airlines\n`;
  message += `✓ Secure checkout\n`;
  message += `✓ Instant confirmation\n`;
  message += `✓ Best prices guaranteed\n\n`;
  message += `Link expires in 24 hours`;

  return message;
}
```

---

### Step 4: Add Kayak Fallback Logic

**File:** `src/services/assistantService.js`

In the `search_trips` function, add try/catch with Kayak fallback:

```javascript
try {
  // Try Duffel Links first
  console.log('[Assistant] Creating Duffel Links session...');

  const session = await duffelLinksService.createFlightSession({
    conversationId: conversation?.id,
    phone: userPhone,
    searchParams: {
      origin: originCode,
      destination: destCode,
      departure_date: tripSearchData.startDate,
      return_date: tripSearchData.endDate,
      passengers: parseInt(tripSearchData.travelers) || 1,
      cabin_class: cabinClass
    }
  });

  return {
    success: true,
    message: duffelLinksService.formatLinksSMS({
      sessionUrl: session.url,
      searchParams: {
        origin: originCode,
        destination: destCode,
        departure_date: tripSearchData.startDate,
        return_date: tripSearchData.endDate
      }
    }),
    source: 'duffel_links'
  };

} catch (duffelError) {
  // Fallback to Kayak if Duffel fails
  console.warn('[Assistant] Duffel Links failed, using Kayak fallback:', duffelError.message);

  // Search flights for display
  const searchResults = await duffelFlightsService.searchFlights({
    origin: originCode,
    destination: destCode,
    departureDate: tripSearchData.startDate,
    returnDate: tripSearchData.endDate,
    passengers: parseInt(tripSearchData.travelers) || 1,
    cabin: cabinClass
  });

  // Format with Kayak links
  const formattedFlights = duffelFlightsService.formatOffers(searchResults.offers, 3);
  const smsMessage = airlineDeepLinksService.formatSMSWithLinks(formattedFlights, {
    origin: originCode,
    destination: destCode,
    departure: tripSearchData.startDate,
    returnDate: tripSearchData.endDate,
    passengers: parseInt(tripSearchData.travelers) || 1,
    cabin: cabinClass
  });

  return {
    success: true,
    message: smsMessage,
    source: 'kayak_fallback'
  };
}
```

---

### Step 5: Configure Duffel Webhooks

In the Duffel Dashboard:

1. Go to **Settings → Webhooks**
2. Click **Add Webhook**
3. Set URL: `https://your-app.railway.app/webhooks/duffel`
4. Subscribe to these events:
   - ✅ `order.created`
   - ✅ `order.updated`
   - ✅ `order.cancelled`
   - ✅ `order.airline_initiated_change_detected`
5. Copy the **Webhook Secret**
6. Add to Railway environment: `DUFFEL_WEBHOOK_SECRET=your_secret_here`

**Webhook Handler:** Already exists at `src/routes/webhooks/duffel.js` ✅

---

### Step 6: Update Webhook Handler (Optional)

**File:** `src/routes/webhooks/duffel.js`

Verify it sends confirmation SMS:

```javascript
// After order.created event
if (event.type === 'order.created') {
  const order = event.data;

  // Send confirmation SMS
  const confirmationMessage = `
✅ Booking Confirmed!

Reference: ${order.booking_reference}
Passenger: ${order.passengers[0].given_name} ${order.passengers[0].family_name}
Route: ${order.slices[0].origin.iata_code} → ${order.slices[0].destination.iata_code}
Departure: ${order.slices[0].segments[0].departing_at.split('T')[0]}
Total Paid: ${order.total_currency} ${order.total_amount}

Check your email for full itinerary.
Have a great trip! ✈️
  `.trim();

  await twilioClient.messages.create({
    body: confirmationMessage,
    from: process.env.TWILIO_PHONE_NUMBER,
    to: conversation.phone
  });
}
```

---

## 🧪 Testing Checklist

### Before Going Live

- [ ] Verify `DUFFEL_ACCESS_TOKEN` is production token (starts with `duffel_live_`)
- [ ] Verify webhook secret is set
- [ ] Test airport resolver: "Find flights from Toronto to New York"
- [ ] Verify PostgreSQL connection: Check Railway logs for "✅ Database connected"

### Test 1: Create Duffel Links Session

**Send SMS:**
```
Find flights from Vancouver to Tokyo December 15-22
```

**Expected Response:**
```
✈️ YVR → NRT
Departing: 12/15
Returning: 12/22

📲 Browse flights & book:
https://links.duffel.com/sessions/ses_xxxxx

✓ Compare all airlines
✓ Secure checkout
✓ Instant confirmation
✓ Best prices guaranteed

Link expires in 24 hours
```

**Verify:**
- ✅ URL starts with `https://links.duffel.com/sessions/`
- ✅ Link opens Duffel branded page
- ✅ Otherwhere logo appears (if configured)
- ✅ Search params pre-filled (YVR → NRT, dates)

### Test 2: Complete Test Booking

1. Click Duffel Links URL
2. Browse flights on Duffel page
3. Select a flight
4. Complete checkout (use test credit card in sandbox)
5. Verify redirect to `SUCCESS_URL`
6. Check Railway logs for webhook: `order.created`
7. Check database: `SELECT * FROM bookings ORDER BY created_at DESC LIMIT 1;`
8. Verify confirmation SMS received

### Test 3: Verify Markup Calculation

| Scenario | Ticket Price | Expected Markup |
|----------|--------------|-----------------|
| Low price | $200 | $20 (minimum) |
| Medium price | $667 | $20 (minimum) |
| High price | $1,000 | $30 (3%) |
| Very high | $2,000 | $60 (3%) |

**How to verify:**
- Check `order.total_amount` in webhook payload
- Should include your markup automatically

### Test 4: Kayak Fallback

**Simulate Duffel failure:**
```javascript
// Temporarily set invalid token
DUFFEL_ACCESS_TOKEN=invalid_token
```

**Send SMS:** "Find flights Vancouver to Toronto"

**Expected:**
- ✅ Should fallback to Kayak links
- ✅ Shows 3 flight options
- ✅ Each has Kayak URL
- ✅ Logs show "Duffel Links failed, using Kayak fallback"

---

## 📊 Revenue Tracking

### Calculate Your Earnings

```sql
-- Total bookings and revenue
SELECT
  COUNT(*) as total_bookings,
  SUM(total_paid) as total_booking_value,
  SUM(
    CASE
      WHEN total_paid * 0.03 > 20
      THEN total_paid * 0.03
      ELSE 20
    END
  ) as total_revenue
FROM bookings
WHERE status = 'confirmed';
```

### Example Earnings

If you book **10 flights per month**:

| Avg Ticket | 3% Markup | Minimum | Monthly Revenue |
|------------|-----------|---------|-----------------|
| $500       | $15       | $20     | 10 × $20 = **$200** |
| $800       | $24       | $20     | 10 × $24 = **$240** |
| $1,200     | $36       | $20     | 10 × $36 = **$360** |

**Annual projection (10 bookings/month, $800 avg):** $2,880/year

---

## 🚨 Troubleshooting

### Issue: "Duffel API error: 401 Unauthorized"
**Fix:** Verify `DUFFEL_ACCESS_TOKEN` is correct and starts with `duffel_live_`

### Issue: "Duffel Links not available"
**Fix:** Contact Duffel support to confirm Links access is enabled for your account

### Issue: Session URL returns 404
**Fix:**
- Verify session was created successfully
- Check session hasn't expired (24 hour limit)
- Check Duffel dashboard for session status

### Issue: Markup not applied
**Fix:**
- Verify `markup_rate` and `markup_amount` in session request
- Check order details in Duffel dashboard
- Contact Duffel if markup still missing

### Issue: Webhooks not received
**Fix:**
- Verify webhook URL is correct: `https://your-app.railway.app/webhooks/duffel`
- Check `DUFFEL_WEBHOOK_SECRET` is set
- Verify events are subscribed in Duffel dashboard
- Check Railway logs for incoming requests

### Issue: Fallback to Kayak every time
**Fix:**
- Check Railway logs for Duffel error message
- Verify Duffel token is production (not test)
- Confirm Duffel Links access is enabled

---

## 🎯 Go-Live Checklist

When Duffel grants Links access:

### Pre-Launch
- [ ] Replace `createFlightSession()` in `duffelLinksService.js`
- [ ] Update `formatLinksSMS()` message format
- [ ] Add Kayak fallback to `assistantService.js`
- [ ] Set `DUFFEL_ACCESS_TOKEN` (production)
- [ ] Set `DUFFEL_WEBHOOK_SECRET`
- [ ] Configure webhooks in Duffel dashboard
- [ ] Set redirect URLs (SUCCESS_URL, FAILURE_URL, ABANDONMENT_URL)
- [ ] Upload brand logo (BRAND_LOGO_URL)

### Testing
- [ ] Test SMS flow end-to-end
- [ ] Complete test booking on Duffel
- [ ] Verify webhook received
- [ ] Verify booking in database
- [ ] Verify confirmation SMS sent
- [ ] Test Kayak fallback works

### Monitoring
- [ ] Monitor Railway logs for errors
- [ ] Check Duffel dashboard for sessions
- [ ] Track bookings in PostgreSQL
- [ ] Monitor revenue calculations
- [ ] Set up alerts for failed webhooks

### Launch
- [ ] Deploy to Railway
- [ ] Test with real booking (yourself)
- [ ] Monitor first user bookings
- [ ] Verify markup is being collected

---

## 📚 Additional Resources

- **Duffel Links Docs:** https://duffel.com/docs/guides/duffel-links
- **Duffel Sessions API:** https://duffel.com/docs/api/v2/sessions
- **Webhook Events:** https://duffel.com/docs/api/v2/webhooks
- **Airport Resolver:** Already integrated ✅
- **Database Schema:** `src/db/migrations/001_initial_schema.sql`

---

## 🔄 Rollback Plan

If Duffel Links has issues after launch:

1. **Disable Duffel Links** by setting invalid token:
   ```env
   DUFFEL_ACCESS_TOKEN=disabled
   ```

2. **System automatically falls back to Kayak** ✅

3. **No code changes needed** - fallback is built-in

4. **Fix and re-enable** when ready

---

**Created:** November 7, 2025
**For:** Otherwhere pre-launch
**Status:** Ready to implement when Duffel grants Links access
**Markup:** 3% with $20 USD minimum

When you get access, follow this guide step-by-step and you'll be earning revenue from day 1! 🚀
