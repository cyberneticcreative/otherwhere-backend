# Otherwhere Backend - Current Status

**Last Updated:** November 7, 2025
**Status:** Pre-launch, ready for testing

---

## 🎯 What's Working Right Now

### ✅ Flight Search & Booking
- **Duffel Flights API** - Searches live flight offers
- **Airport Resolver** - Converts city names to airport codes (90+ cities)
- **Kayak Booking Links** - Reliable fallback for booking
- **SMS Flow** - Users get flight options via SMS
- **Voice Flow** - ElevenLabs webhook triggers flight search

### ✅ Infrastructure
- **PostgreSQL Database** - Connected on Railway
  - `conversations` - Track user conversations
  - `link_sessions` - Track booking sessions
  - `bookings` - Store completed bookings
  - `event_logs` - Audit trail
- **Twilio SMS** - Send/receive messages
- **OpenAI Assistant** - Extract search parameters
- **Railway Deployment** - Auto-deploy from GitHub

### ✅ Airport Code Resolution

**Supported Cities:** 90+ major cities worldwide

**Examples:**
- "Toronto" → YYZ
- "New York" → JFK
- "NYC" → JFK
- "New York City" → JFK (smart preprocessing)
- "Tokyo" → NRT
- "LA" → LAX
- "San Francisco" → SFO

**File:** `src/services/airportResolverService.js`

**Integration:** ✅ Used in `assistantService.js` and `webhookController.js`

---

## 🔒 Waiting for Access

### Duffel Links v2
**Status:** Registered in Canada, waiting for Links access

**Why we need it:**
- Revenue from day 1 (3% + $20 min markup)
- Professional hosted checkout
- Real ticket issuance
- Better user experience

**When granted:**
- Follow `DUFFEL_LINKS_IMPLEMENTATION.md`
- Use `DUFFEL_LINKS_ACTIVATION.md` checklist
- 30 minutes to activate

**Current workaround:** Kayak links (no revenue, but works)

---

## 📊 Current User Flow

### SMS Flow
```
1. User: "Find flights from Vancouver to Tokyo December 15-22"
2. OpenAI extracts: origin=Vancouver, destination=Tokyo, dates
3. Airport Resolver: Vancouver→YVR, Tokyo→NRT
4. Duffel API: Search flights YVR→NRT
5. Format top 3 options with Kayak links
6. Send SMS with flight options
7. User clicks Kayak link → Browse & book
```

### Voice Flow
```
1. User calls Twilio number
2. ElevenLabs: "Find me flights from LAX to NYC"
3. Webhook extracts parameters
4. Airport Resolver: LAX→LAX, NYC→JFK
5. Duffel API: Search flights
6. Send SMS with Kayak links
```

---

## 🎯 Future Flow (When Duffel Links Enabled)

### SMS Flow (Enhanced)
```
1. User: "Find flights from Vancouver to Tokyo December 15-22"
2. OpenAI extracts parameters
3. Airport Resolver: Vancouver→YVR, Tokyo→NRT
4. Create Duffel Links session (with 3% + $20 min markup)
5. Send SMS with single Duffel booking link
6. User clicks → Duffel checkout → Browse all flights
7. User completes booking → Webhook → Database
8. Send confirmation SMS
9. ✅ Earn revenue!
```

**Fallback:** If Duffel fails, automatically use Kayak

---

## 💰 Revenue Model (When Duffel Links Active)

### Markup Structure
- **3% of ticket price**
- **$20 USD minimum**
- **Whichever is higher**

### Example Earnings

| Ticket Price | 3% Markup | Minimum | **You Earn** |
|--------------|-----------|---------|--------------|
| $300         | $9        | $20     | **$20**      |
| $500         | $15       | $20     | **$20**      |
| $750         | $22.50    | $20     | **$22.50**   |
| $1,000       | $30       | $20     | **$30**      |
| $2,000       | $60       | $20     | **$60**      |

### Projections

**10 bookings/month @ $800 avg:**
- Markup per booking: $24
- Monthly revenue: **$240**
- Annual revenue: **$2,880**

**50 bookings/month @ $800 avg:**
- Monthly revenue: **$1,200**
- Annual revenue: **$14,400**

---

## 🧪 How to Test Right Now

### Test 1: Basic Flight Search
**SMS:** `Find flights from Vancouver to Toronto December 15-22`

**Expected:**
```
✈️ YVR→YYZ 12/15

1. WestJet $213
8h 8m • Direct
🔗 Search on Kayak: https://www.kayak.com/flights/YVR-YYZ/...

2. Air Canada $245
8h 15m • Direct
🔗 Search on Kayak: https://www.kayak.com/flights/...

3. United $289
10h 45m • 1 stop
🔗 Search on Kayak: https://www.kayak.com/flights/...

Kayak compares all airlines so you can find the best price.
```

### Test 2: City Name Resolution
**SMS:** `Find flights from New York City to LA`

**Expected:**
- NYC → JFK ✅
- LA → LAX ✅
- Shows flight options with correct codes

### Test 3: Voice Call
1. Call Twilio number
2. Say: "Find me flights from Toronto to Miami"
3. Receive SMS with flight options

### Test 4: Edge Cases
- **Missing return date:** "Find flights from YVR to JFK December 15" (one-way)
- **Unknown city:** "Find flights from Smallville to Gotham" (should ask for clarification)
- **Invalid dates:** "Find flights from YVR to JFK yesterday" (should handle gracefully)

---

## 📁 Key Files

### Services
- `src/services/duffelFlightsService.js` - Duffel Offers API integration
- `src/services/airportResolverService.js` - City → IATA code mapping
- `src/services/airlineDeepLinksService.js` - Kayak URL builder
- `src/services/duffelLinksService.js` - Ready for Duffel Links (waiting for access)
- `src/services/assistantService.js` - OpenAI function calling

### Controllers
- `src/controllers/smsController.js` - Handle incoming SMS
- `src/controllers/webhookController.js` - ElevenLabs voice webhook

### Routes
- `src/routes/webhooks/duffel.js` - Duffel order webhooks (ready for when Links enabled)

### Database
- `src/db/index.js` - PostgreSQL client
- `src/db/queries.js` - Database helpers
- `src/db/migrations/001_initial_schema.sql` - Schema

### Documentation
- `DUFFEL_LINKS_IMPLEMENTATION.md` - Complete implementation guide
- `DUFFEL_LINKS_ACTIVATION.md` - 30-minute activation checklist
- `CURRENT_STATUS.md` - This file
- `DUFFEL_AIRLINE_DEEPLINKS.md` - Old implementation (now using Kayak)

---

## 🚀 Pre-Launch Checklist

### Before Public Launch
- [ ] Test SMS flow with 10+ different city combinations
- [ ] Test voice flow (ElevenLabs)
- [ ] Verify all environment variables set
- [ ] Test PostgreSQL connection
- [ ] Test Kayak links open correctly
- [ ] Monitor Railway logs for errors
- [ ] Set up error alerts
- [ ] Create customer support script

### When Duffel Links Granted
- [ ] Follow `DUFFEL_LINKS_ACTIVATION.md`
- [ ] Test Duffel checkout flow
- [ ] Complete test booking
- [ ] Verify webhook integration
- [ ] Verify confirmation SMS
- [ ] Test revenue tracking query
- [ ] Monitor first 10 real bookings

### Marketing Ready
- [ ] Landing page ready
- [ ] Social media accounts created
- [ ] Pricing page shows markup disclosure
- [ ] Terms of service updated
- [ ] Privacy policy updated
- [ ] Customer support email set up

---

## 📞 Environment Variables Required

### Already Set ✅
```env
# Twilio
TWILIO_ACCOUNT_SID=xxx
TWILIO_AUTH_TOKEN=xxx
TWILIO_PHONE_NUMBER=xxx

# OpenAI
OPENAI_API_KEY=xxx

# Duffel (Flights API)
DUFFEL_ACCESS_TOKEN=duffel_test_xxx

# Database
DATABASE_URL=postgresql://xxx (Railway auto-injects)
```

### Needed for Duffel Links ⏳
```env
DUFFEL_ACCESS_TOKEN=duffel_live_xxx (production)
DUFFEL_WEBHOOK_SECRET=xxx
SUCCESS_URL=https://otherwhere.app/booking-success
FAILURE_URL=https://otherwhere.app/booking-failed
ABANDONMENT_URL=https://otherwhere.app/booking-cancelled
BRAND_LOGO_URL=https://otherwhere.app/logo.png
BRAND_COLOR=#E75C1E
```

---

## 🎯 Next Steps

### Immediate (This Week)
1. **Test extensively** while traveling
2. **Collect edge cases** (weird city names, date formats)
3. **Monitor Railway logs** for errors
4. **Track conversion** (SMS sent vs. Kayak clicks)

### When Duffel Links Access Granted
1. **Follow activation checklist** (30 min)
2. **Test end-to-end** with real booking
3. **Monitor first week** closely
4. **Track revenue** and conversion

### Growth (Next Month)
1. **Add more cities** to airport resolver
2. **Improve error messages**
3. **A/B test SMS copy**
4. **Add cabin class selection** (economy, business, first)
5. **Add multi-city support**

---

## 📊 Success Metrics

### Week 1
- SMS sent: Track daily
- Flight searches: Track daily
- Kayak clicks: Track CTR
- Errors: Aim for <1%

### Month 1 (After Duffel Links)
- Bookings completed: Target 10+
- Revenue generated: Target $200+
- Conversion rate: Target 5%+
- Customer satisfaction: Survey

---

**Current Status:** ✅ Ready for pre-launch testing
**Next Milestone:** Duffel Links access granted
**Revenue Start Date:** When first Duffel booking completes

Test it while traveling and you're good to go! 🚀
