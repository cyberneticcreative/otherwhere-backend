# Airline Deep Links Status

## ⚠️ Important: Deep Links Reliability

Airline booking deep links are **notoriously unreliable**:
- Airlines frequently change their booking URL structures
- Many airlines don't support pre-filled search parameters
- URLs may work in one country but not another
- Some airlines block automated deep linking

**Strategy:** Start with a small set of verified working links, use Google Flights fallback for the rest.

## Tested & Working ✅

These airline deep links have been tested and verified to work:

*None verified yet - all using Google Flights fallback currently*

## Removed (Use Google Flights Fallback) ❌

These airlines had unreliable or broken deep links:

- **AA (American Airlines)** - Booking URL structure doesn't accept deep link parameters reliably
  - Fallback: Google Flights
  - Status: Error page when clicking link

## Untested ⚠️

All other airlines in `airlineDeepLinks.json` are **untested** and may not work. They should be tested individually before relying on them.

## Testing Process

To test an airline deep link:

1. Get a real flight search result for that airline
2. Click the generated booking link
3. Verify:
   - ✅ Airline website loads
   - ✅ Origin/destination are pre-filled
   - ✅ Dates are pre-filled
   - ✅ Passenger count is correct
   - ✅ Cabin class is correct (if applicable)
4. If any step fails → Remove from `airlineDeepLinks.json`

## Google Flights Fallback

When an airline doesn't have a deep link pattern (or it's removed), the system automatically uses:

```
https://www.google.com/flights?hl=en#flt=YYZ.JFK.2026-03-02*JFK.YYZ.2026-03-18
```

**Benefits:**
- ✅ Always works
- ✅ Shows all airlines
- ✅ Reliable search pre-filling
- ✅ Users can compare prices

**Tradeoff:**
- ❌ Not a direct airline link
- ❌ May show multiple airlines (but this can be good!)

## Recommendation

For now, **use Google Flights fallback for most airlines** until we can individually verify which deep links actually work. This provides the best user experience.

To remove more airlines from deep links, edit `src/data/airlineDeepLinks.json` and delete their entries.

## Future: Verified Airlines List

As we test and verify airline deep links, we can gradually add them back. Priority airlines to test:

1. **Air Canada (AC)** - Major Canadian carrier
2. **Delta (DL)** - Major US carrier
3. **United (UA)** - Major US carrier
4. **British Airways (BA)** - Major international
5. **Lufthansa (LH)** - Major European

Test these first as they're most commonly used.
