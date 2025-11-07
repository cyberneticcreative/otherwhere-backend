# Duffel Flight Data + Airline Deep Links Implementation

**Date:** November 6, 2025
**Status:** ✅ Implemented and Ready for Testing

## Overview

This system uses **Duffel API** to fetch live flight offers and creates **direct airline deep links** so travelers can book flights directly on the airline's official website. Includes a **fallback to Google Flights** when no airline-specific pattern exists.

## Architecture

```
User Request → Duffel API (/air/offer_requests) → Format Offers → Build Airline Deep Links → Send SMS with Links
```

### What Changed from Previous Implementation

**Before:** Google Flights API → Booking URLs
**After:** Duffel Offers API → Custom Airline Deep Links → Direct to airline websites

## Components

### 1. Duffel Flights Service
**File:** `src/services/duffelFlightsService.js`

- Searches flights using Duffel's `/air/offer_requests` endpoint
- Returns raw flight offers with pricing, airline, duration, stops
- Formats offers into a consistent structure for display
- Validates IATA codes and date formats

**Key Methods:**
- `searchFlights(params)` - Search for flight offers
- `formatOffers(offers, limit)` - Format top N offers for display

### 2. Airline Deep Links Service
**File:** `src/services/airlineDeepLinksService.js`

- Builds direct booking URLs for 70+ airlines
- Maps airline IATA codes to URL patterns
- Fallback to Google Flights when pattern doesn't exist
- URL-encodes all parameters for safety

**Key Methods:**
- `buildAirlineLink(params)` - Build airline-specific URL
- `buildGoogleFlightsFallback(params)` - Build Google Flights URL
- `buildBookingURL(params)` - Build with automatic fallback
- `formatSMSWithLinks(flights, searchParams)` - Format SMS message

### 3. Airline Deep Links Mapping
**File:** `src/data/airlineDeepLinks.json`

Contains URL patterns for 70+ airlines including:
- **North America:** AC, DL, AA, UA, WN, B6, AS, NK, F9
- **Europe:** BA, AF, LH, KL, IB, AZ, LX, SN, OS, TP
- **Middle East:** EK, QR, EY, SV, TK, MS
- **Asia:** SQ, CX, JL, NH, KE, OZ, TG, MH, PR, CI, BR
- **Oceania:** QF, NZ, VA, JQ
- **Latin America:** AM, LA, AV, CM, AR, G3
- **Africa:** SA, ET, KQ, RK
- **China:** CA, CZ, MU, HU, 3U
- **India:** AI, 6E, UK, SG
- **Nordic:** AY, SK, DY
- **Low-Cost:** FR, U2, W6

### 4. Updated Controllers

**SMS Controller** (`src/controllers/smsController.js`)
- Uses Duffel flights + airline deeplinks
- Removed setTimeout delays for better performance
- Async SMS sending (non-blocking)

**ElevenLabs Webhook** (`src/controllers/webhookController.js`)
- Voice calls trigger Duffel flight searches
- Returns airline deeplinks via SMS
- Same format as SMS flow

**Assistant Service** (`src/services/assistantService.js`)
- OpenAI function calling (`search_trips`) uses Duffel API
- Builds airline deeplinks for all results
- Returns formatted flights to SMS controller

## URL Pattern System

### Template Format

```json
{
  "AC": "https://www.aircanada.com/en-ca/flights-to-{destination}?origin={origin}&destination={destination}&departureDate={departure}&returnDate={return}&adults={passengers}"
}
```

### Placeholders

- `{origin}` - Origin airport code (e.g., "YVR")
- `{destination}` - Destination airport code (e.g., "JFK")
- `{departure}` - Departure date (YYYY-MM-DD)
- `{return}` - Return date (YYYY-MM-DD), optional
- `{passengers}` - Number of passengers
- `{cabin}` - Cabin class (economy, premium_economy, business, first)

### Link Building Process

1. Check if airline has a deep link pattern
2. If yes → Build airline-specific URL with placeholders replaced
3. If no → Fall back to Google Flights URL
4. URL-encode all parameters
5. Return `{ url, source: 'airline' | 'google_flights' }`

### Google Flights Fallback

When no airline pattern exists:

```
Round Trip:
https://www.google.com/flights?hl=en#flt=YVR.JFK.2025-12-15*JFK.YVR.2025-12-22

One-Way:
https://www.google.com/flights?hl=en#flt=YVR.JFK.2025-12-15
```

## SMS Message Format

```
✈️ YVR→JFK 12/15

1. Air Canada $650
5h 30m • Direct
🔗 Book on Air Canada: https://www.aircanada.com/...

2. United $680
6h 15m • 1 stop
🔗 Book on United: https://www.united.com/...

3. Delta $720
7h 45m • 1 stop
🔗 View on Google Flights: https://www.google.com/flights...

You'll complete your booking on the airline's official site.
```

## User Flow

### SMS Flow
1. User: "Find flights from Vancouver to NYC December 15-22"
2. OpenAI Assistant extracts: origin, destination, dates
3. System searches Duffel API for offers
4. Format top 3 offers and build airline deeplinks
5. Send SMS with flight options and booking links
6. User clicks link → Airline website → Book directly

### Voice Flow (ElevenLabs)
1. User calls phone number
2. Says: "Find flights from LAX to Tokyo"
3. ElevenLabs extracts parameters
4. Webhook searches Duffel API
5. SMS sent with airline deeplinks
6. User books on airline website

## API Configuration

### Environment Variables

```env
# Duffel API (Required)
DUFFEL_ACCESS_TOKEN=duffel_test_YOUR_TOKEN_HERE

# For production
DUFFEL_ACCESS_TOKEN=duffel_live_YOUR_TOKEN_HERE
```

### Duffel API Limits

- **Test Mode:** Unlimited searches, limited to test data
- **Live Mode:** Check your Duffel plan for rate limits

## Testing

### Test 1: SMS Flight Search

**Send SMS:**
```
Find flights from Vancouver to Tokyo December 15-22
```

**Expected Response:**
```
✈️ YVR→NRT 12/15

1. Air Canada $850
10h 30m • Direct
🔗 Book on Air Canada: https://www.aircanada.com/...

2. United $920
12h 15m • 1 stop
🔗 Book on United: https://www.united.com/...

3. ANA $980
11h 45m • Direct
🔗 Book on ANA: https://www.ana.co.jp/...

You'll complete your booking on the airline's official site.
```

### Test 2: Voice Call

1. Call Twilio number
2. Say: "Find me flights from LAX to NYC next Friday"
3. Check SMS for flight results with airline deeplinks

### Test 3: Verify Airline Deep Links

Click each booking link and verify:
- ✅ Opens airline's official website
- ✅ Origin/destination pre-filled
- ✅ Dates pre-filled
- ✅ Passenger count correct
- ✅ Shows available flights

### Test 4: Google Flights Fallback

Search for a flight on an airline not in the mapping (e.g., a small regional carrier):
- ✅ Should show "View on Google Flights" instead of "Book on [Airline]"
- ✅ Google Flights URL should open with search pre-filled

## Benefits vs. Previous Implementation

### Duffel Offers API
✅ **Real-time availability** - Live flight data from airlines
✅ **Better pricing** - Direct from source
✅ **More airlines** - Global coverage
✅ **Accurate schedules** - Real airline schedules

### Airline Deep Links
✅ **No transaction fees** - Users book directly with airline
✅ **Transparent pricing** - Airline's own prices
✅ **Better conversion** - Users trust airline websites
✅ **Loyalty points** - Users can use frequent flyer accounts

### Google Flights Fallback
✅ **Always works** - Even for obscure airlines
✅ **Familiar UX** - Users know Google Flights
✅ **Multi-airline comparison** - When deep link fails

## Performance Optimizations

✅ **Removed setTimeout delays** - Async SMS sending (non-blocking)
✅ **Parallel API calls** - No sequential waits
✅ **Efficient formatting** - Single pass through offers
✅ **Cached airline patterns** - No repeated file reads

## Troubleshooting

### Issue: "No flights found"
**Causes:**
- Invalid IATA codes
- Dates in the past
- No availability for route

**Solutions:**
- Verify airport codes are 3 letters (YVR, JFK, etc.)
- Check dates are in YYYY-MM-DD format
- Try different dates

### Issue: Airline deep link doesn't work
**Causes:**
- Airline changed URL format
- Parameter encoding issue
- Airline doesn't support deep links

**Solutions:**
- Google Flights fallback will be used automatically
- Update airline pattern in `airlineDeepLinks.json`
- Test URL manually and adjust

### Issue: "Duffel API error"
**Causes:**
- Invalid API key
- Rate limit exceeded
- Invalid search parameters

**Solutions:**
- Check `DUFFEL_ACCESS_TOKEN` is set correctly
- Verify API key in Duffel dashboard
- Check Duffel API logs for error details

## Next Steps

### Phase 2: Enhanced Features
- [ ] Add cabin class selection (business, first)
- [ ] Add airline preferences (direct flights only, specific airlines)
- [ ] Add price alerts and monitoring
- [ ] Add multi-city search support

### Phase 3: Analytics
- [ ] Track which airlines get most bookings
- [ ] Track deep link click-through rates
- [ ] A/B test airline deep links vs. Google Flights
- [ ] Monitor conversion rates

### Phase 4: Expansion
- [ ] Add more airlines to deep link mapping (target: 100+)
- [ ] Test and verify all airline URLs quarterly
- [ ] Add hotel deep links using similar pattern
- [ ] Add car rental deep links

## Support & Documentation

- **Duffel API Docs:** https://duffel.com/docs/api/overview
- **Duffel Offers API:** https://duffel.com/docs/api/offers
- **Airline Deep Links QA:** Test each airline URL manually
- **Google Flights URL Format:** https://www.google.com/travel/flights

---

**Implementation completed by:** Claude
**Date:** November 6, 2025
**Status:** ✅ Ready for Testing
