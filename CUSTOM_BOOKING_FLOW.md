# Custom Booking Flow - Duffel Flights API

**Date**: 2025-11-06
**Status**: Active - Replaces Duffel Links API (sunset)

## Overview

This implementation replaces Duffel Links with a custom booking flow using the Duffel Flights API (Offers → Orders). The flow gives us full control over the booking experience while maintaining the same user-facing simplicity.

## Why Replace Duffel Links?

Duffel announced the sunset of their Links API. Instead of relying on their hosted checkout, we now:
- Create our own booking links using JWT tokens
- Search flights via Duffel Offers API
- Create bookings via Duffel Orders API
- Control the entire user experience
- Own all booking data and analytics

## Architecture

### Flow Diagram

```
User (SMS) → Search Flights → Create Booking Link → Book Page → Create Order → Confirmation
     ↓              ↓                    ↓                ↓             ↓            ↓
  Request      POST /offers      POST /booking-link   GET /book/:token  POST /orders  Webhook
```

### Components

1. **Token Service** (`src/utils/tokenService.js`)
   - Signs JWT tokens for secure booking links
   - Validates tokens on booking page access
   - 30-minute expiration by default

2. **Duffel Offers Service** (`src/services/duffelOffersService.js`)
   - Searches flights via Duffel Offers API
   - Retrieves specific offers by ID
   - Creates orders via Duffel Orders API
   - Calculates fees (2% with $10 minimum)

3. **Offers Routes** (`src/routes/offers.js`)
   - `POST /offers` - Search flights
   - `POST /offers/booking-link` - Create booking link
   - `GET /book/:token` - Booking page data
   - `POST /offers/orders` - Finalize booking

4. **Database** (`src/db/migrations/002_booking_links.sql`)
   - `booking_links` table - Stores token metadata
   - `bookings.offer_snapshot` - Caches offer data
   - `bookings.booking_link_id` - Links bookings to links

## API Endpoints

### 1. Search Flights

```http
POST /offers
Content-Type: application/json

{
  "origin": "YVR",
  "destination": "NRT",
  "departure_date": "2025-11-15",
  "return_date": "2025-11-22",
  "passengers": 1,
  "cabin_class": "economy",
  "phone": "+1234567890"
}
```

**Response:**
```json
{
  "success": true,
  "offers": [
    {
      "id": "off_12345",
      "total_amount": 500.00,
      "total_currency": "USD",
      "fee_amount": 10.00,
      "total_with_fee": 510.00,
      "departure": {
        "airport": "YVR",
        "city": "Vancouver",
        "time": "2025-11-15T10:00:00Z"
      },
      "arrival": {
        "airport": "NRT",
        "city": "Tokyo",
        "time": "2025-11-15T14:00:00+09:00"
      },
      "stops": 0,
      "cabin_class": "Economy"
    }
  ],
  "count": 15
}
```

### 2. Create Booking Link

```http
POST /offers/booking-link
Content-Type: application/json

{
  "offer_id": "off_12345",
  "conversation_id": "uuid",
  "expires_in_minutes": 30
}
```

**Response:**
```json
{
  "success": true,
  "url": "https://otherwhere.app/book/eyJhbGc...",
  "token": "eyJhbGc...",
  "expires_at": "2025-11-06T12:30:00Z",
  "offer_summary": {
    "id": "off_12345",
    "total": 510.00,
    "currency": "USD"
  }
}
```

### 3. Get Booking Page Data

```http
GET /book/:token
```

**Response:**
```json
{
  "success": true,
  "token": "eyJhbGc...",
  "offer": {
    "id": "off_12345",
    "total_with_fee": 510.00,
    "departure": { ... },
    "arrival": { ... }
  },
  "price_changed": false,
  "expires_at": "2025-11-06T12:30:00Z"
}
```

### 4. Create Order (Book Flight)

```http
POST /offers/orders
Content-Type: application/json

{
  "token": "eyJhbGc...",
  "passengers": [
    {
      "type": "adult",
      "given_name": "John",
      "family_name": "Doe",
      "born_on": "1990-01-01",
      "gender": "m",
      "email": "john@example.com",
      "phone_number": "+1234567890"
    }
  ]
}
```

**Response:**
```json
{
  "success": true,
  "order_id": "ord_12345",
  "booking_reference": "ABC123",
  "booking_id": "uuid",
  "status": "confirmed",
  "total_amount": "500.00",
  "total_currency": "USD"
}
```

## Fee Structure

- **Percentage**: 2% of flight total
- **Minimum**: $10 USD
- **Label**: "Otherwhere booking support fee (fare monitoring + rebooking help)"

Example:
- $100 flight → $10 fee (minimum)
- $500 flight → $10 fee (2% = $10)
- $1000 flight → $20 fee (2%)

## Security

### JWT Tokens

- **Algorithm**: HS256
- **Secret**: `BOOK_LINK_SECRET` environment variable
- **Expiration**: 30 minutes (configurable)
- **Claims**:
  - `jti` - Unique token ID (for replay protection)
  - `offer_id` - Duffel Offer ID
  - `conversation_id` - User conversation UUID
  - `type` - Always "booking_link"
  - `iss` - Issuer: "otherwhere"
  - `aud` - Audience: "booking"

### Token Lifecycle

1. **Active** - Token created, not yet used
2. **Consumed** - Token used to create an order (can only be used once)
3. **Expired** - Token past expiration time

## Database Schema

### booking_links

```sql
CREATE TABLE booking_links (
  id UUID PRIMARY KEY,
  token_jti VARCHAR(255) UNIQUE NOT NULL,
  offer_id VARCHAR(255) NOT NULL,
  conversation_id UUID REFERENCES conversations(id),
  status VARCHAR(20) DEFAULT 'active',
  offer_snapshot JSONB,
  created_at TIMESTAMP DEFAULT NOW(),
  expires_at TIMESTAMP NOT NULL
);
```

### bookings (updated)

```sql
ALTER TABLE bookings
  ADD COLUMN offer_snapshot JSONB,
  ADD COLUMN booking_link_id UUID REFERENCES booking_links(id);
```

## Environment Variables

```bash
# Required
DUFFEL_ACCESS_TOKEN=duffel_test_...
BOOK_LINK_SECRET=your_secret_key_here
BASE_URL=https://your-domain.com

# Optional
DUFFEL_WEBHOOK_SECRET=whsec_...
```

## SMS Integration

The SMS controller can use the new flow like this:

```javascript
const duffelOffers = require('../services/duffelOffersService');

// 1. Search flights
const offers = await duffelOffers.searchFlights({
  origin: 'YVR',
  destination: 'NRT',
  departure_date: '2025-11-15',
  passengers: 1,
  conversationId: conversation.id
});

// 2. Create booking link for top offer
const response = await axios.post('/offers/booking-link', {
  offer_id: offers[0].id,
  conversation_id: conversation.id
});

// 3. Send SMS with link
await twilioService.sendSMS(
  phone,
  `✈️ Found ${offers.length} flights!\n\nBook here: ${response.data.url}\n\nIncludes fare monitoring + support.`
);
```

## Error Handling

### Common Errors

| Error | Status | Cause | Solution |
|-------|--------|-------|----------|
| Invalid token | 401 | Token expired or malformed | Request new booking link |
| Link consumed | 410 | Token already used | Request new booking link |
| Link expired | 410 | Past expiration time | Request new booking link |
| Offer expired | 410 | Duffel offer no longer valid | Search again for fresh offers |
| Price changed | 409 | Offer price changed | Review new price and confirm |

## Testing

### Manual Test Flow

1. **Search flights**:
   ```bash
   curl -X POST http://localhost:3000/offers \
     -H "Content-Type: application/json" \
     -d '{
       "origin": "YVR",
       "destination": "NRT",
       "departure_date": "2025-12-01",
       "passengers": 1
     }'
   ```

2. **Create booking link**:
   ```bash
   curl -X POST http://localhost:3000/offers/booking-link \
     -H "Content-Type: application/json" \
     -d '{
       "offer_id": "off_12345"
     }'
   ```

3. **Get booking page**:
   ```bash
   curl http://localhost:3000/book/eyJhbGc...
   ```

4. **Create order**:
   ```bash
   curl -X POST http://localhost:3000/offers/orders \
     -H "Content-Type: application/json" \
     -d '{
       "token": "eyJhbGc...",
       "passengers": [{
         "type": "adult",
         "given_name": "John",
         "family_name": "Doe",
         "born_on": "1990-01-01",
         "gender": "m",
         "email": "test@example.com",
         "phone_number": "+1234567890"
       }]
     }'
   ```

## Migration from Duffel Links

The old Duffel Links flow (`/links/session`) is still available but marked as legacy. To fully migrate:

1. Update SMS controller to use new `/offers` endpoints
2. Update any webhooks or integrations
3. Test thoroughly with Duffel test environment
4. Deploy and monitor
5. Deprecate `/links/*` endpoints after confirmation

## Future Enhancements

- [ ] Stripe integration for payment collection
- [ ] Seat selection UI
- [ ] Baggage selection
- [ ] Email confirmations
- [ ] Booking management dashboard
- [ ] Fare monitoring and alerts
- [ ] Multi-passenger booking UI
- [ ] Hotel bookings (Duffel Stays API)

## Support

For issues or questions:
- Check Duffel API docs: https://duffel.com/docs
- Review event logs in database: `SELECT * FROM event_logs ORDER BY created_at DESC`
- Check application logs for detailed error messages

---

**Last Updated**: 2025-11-06
**Author**: Otherwhere Engineering Team
