#!/bin/bash

# Test Script: Booking Token Extraction
# Run this to see what tokens are in the flight search response

RAPIDAPI_KEY="30b3541a9cmsh8e733c7a9e9154fp1565bejsnd0464b3ea8df"
HOST="google-flights2.p.rapidapi.com"

echo "🔍 Step 1: Searching for flights (LAX → JFK)..."
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

SEARCH_RESPONSE=$(curl -s --request GET \
  --url "https://${HOST}/api/v1/searchFlights?departure_id=LAX&arrival_id=JFK&outbound_date=2025-12-15&adults=1&travel_class=ECONOMY&currency=USD&language_code=en-US&country_code=US&search_type=best&show_hidden=1" \
  --header "x-rapidapi-host: ${HOST}" \
  --header "x-rapidapi-key: ${RAPIDAPI_KEY}")

echo "Full response (first 2000 chars):"
echo "$SEARCH_RESPONSE" | head -c 2000
echo ""
echo ""

# Extract first flight's token fields
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "🔬 Extracting token fields from first flight:"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# Check for different token field names
HAS_TOKEN=$(echo "$SEARCH_RESPONSE" | jq -r '.data.itineraries.topFlights[0].token // "MISSING"')
HAS_BOOKING_TOKEN=$(echo "$SEARCH_RESPONSE" | jq -r '.data.itineraries.topFlights[0].booking_token // "MISSING"')
HAS_PURCHASE_TOKEN=$(echo "$SEARCH_RESPONSE" | jq -r '.data.itineraries.topFlights[0].purchase_token // "MISSING"')
HAS_NEXT_TOKEN=$(echo "$SEARCH_RESPONSE" | jq -r '.data.itineraries.topFlights[0].next_token // "MISSING"')

echo "Token field analysis:"
echo "  - .token: $HAS_TOKEN"
echo "  - .booking_token: $HAS_BOOKING_TOKEN"
echo "  - .purchase_token: $HAS_PURCHASE_TOKEN"
echo "  - .next_token: $HAS_NEXT_TOKEN"
echo ""

# Use the first available token
if [ "$HAS_BOOKING_TOKEN" != "MISSING" ] && [ "$HAS_BOOKING_TOKEN" != "null" ]; then
  TOKEN="$HAS_BOOKING_TOKEN"
  TOKEN_SOURCE="booking_token"
elif [ "$HAS_TOKEN" != "MISSING" ] && [ "$HAS_TOKEN" != "null" ]; then
  TOKEN="$HAS_TOKEN"
  TOKEN_SOURCE="token"
elif [ "$HAS_PURCHASE_TOKEN" != "MISSING" ] && [ "$HAS_PURCHASE_TOKEN" != "null" ]; then
  TOKEN="$HAS_PURCHASE_TOKEN"
  TOKEN_SOURCE="purchase_token"
elif [ "$HAS_NEXT_TOKEN" != "MISSING" ] && [ "$HAS_NEXT_TOKEN" != "null" ]; then
  TOKEN="$HAS_NEXT_TOKEN"
  TOKEN_SOURCE="next_token"
else
  echo "❌ No token found! Cannot proceed with booking URL test."
  exit 1
fi

echo "✅ Using token from field: $TOKEN_SOURCE"
echo "   Token value (first 50 chars): ${TOKEN:0:50}..."
echo ""

# Test getBookingURL
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "🔍 Step 2: Testing getBookingURL..."
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

BOOKING_RESPONSE=$(curl -s --request POST \
  --url "https://${HOST}/api/v1/getBookingURL" \
  --header "Content-Type: application/json" \
  --header "x-rapidapi-host: ${HOST}" \
  --header "x-rapidapi-key: ${RAPIDAPI_KEY}" \
  --data "{\"token\":\"$TOKEN\"}")

echo "Response:"
echo "$BOOKING_RESPONSE" | jq '.'
echo ""

# Extract booking URL
BOOKING_URL=$(echo "$BOOKING_RESPONSE" | jq -r '.url // .booking_url // .bookingUrl // .data.url // "MISSING"')

if [ "$BOOKING_URL" != "MISSING" ] && [ "$BOOKING_URL" != "null" ]; then
  echo "✅ Booking URL found:"
  echo "   $BOOKING_URL"
  echo ""

  # Analyze URL type
  if echo "$BOOKING_URL" | grep -q "/booking?tfs="; then
    echo "✅ This is a DIRECT BOOKING URL (contains /booking?tfs=)"
  elif echo "$BOOKING_URL" | grep -q "/booking"; then
    echo "⚠️  This contains /booking but not the ?tfs= pattern"
  elif echo "$BOOKING_URL" | grep -q "/search"; then
    echo "❌ This is a SEARCH URL, not a booking URL!"
  else
    echo "❓ Unknown URL type"
  fi
else
  echo "❌ No booking URL found in response"
fi

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "✅ Test complete!"
