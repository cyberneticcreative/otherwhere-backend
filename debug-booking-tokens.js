/**
 * Debug Script: Test Flight Search & Booking Token Extraction
 *
 * This script helps us understand:
 * 1. What fields are in the flight search API response
 * 2. Which token field has the booking_token
 * 3. What getBookingURL returns for each token
 * 4. Whether we need to call getNextFlights
 */

const axios = require('axios');

// Use the API key directly for testing
const RAPIDAPI_KEY = '30b3541a9cmsh8e733c7a9e9154fp1565bejsnd0464b3ea8df';
const RAPIDAPI_HOST = 'google-flights2.p.rapidapi.com';
const BASE_URL = `https://${RAPIDAPI_HOST}/api/v1`;

const headers = {
  'x-rapidapi-host': RAPIDAPI_HOST,
  'x-rapidapi-key': RAPIDAPI_KEY,
  'Content-Type': 'application/json'
};

async function testFlightSearch() {
  console.log('🔍 Step 1: Searching for flights...\n');

  try {
    // Simple test search: LAX to JFK
    const searchParams = {
      departure_id: 'LAX',
      arrival_id: 'JFK',
      outbound_date: '2025-12-15',
      adults: 1,
      travel_class: 'ECONOMY',
      currency: 'USD',
      language_code: 'en-US',
      country_code: 'US',
      search_type: 'best',
      show_hidden: 1
    };

    const response = await axios.get(`${BASE_URL}/searchFlights`, {
      params: searchParams,
      headers: {
        'x-rapidapi-host': RAPIDAPI_HOST,
        'x-rapidapi-key': RAPIDAPI_KEY
      },
      timeout: 30000
    });

    const data = response.data?.data || response.data;

    console.log('✅ Flight search successful!\n');
    console.log('📊 Response structure:');
    console.log('  - Top level keys:', Object.keys(data));
    console.log('  - Itineraries keys:', Object.keys(data.itineraries || {}));

    const topFlights = data?.itineraries?.topFlights || [];
    const otherFlights = data?.itineraries?.otherFlights || [];

    console.log(`\n  - topFlights count: ${topFlights.length}`);
    console.log(`  - otherFlights count: ${otherFlights.length}`);

    if (topFlights.length === 0 && otherFlights.length === 0) {
      console.log('\n❌ No flights found! Try different dates or route.');
      return;
    }

    // Analyze first flight from topFlights
    const sampleFlight = topFlights[0] || otherFlights[0];

    console.log('\n🔬 Analyzing first flight object:');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('Available fields:', Object.keys(sampleFlight));

    console.log('\n📝 Token fields analysis:');
    console.log('  - flight.token:', sampleFlight.token ? `✅ EXISTS (${sampleFlight.token.substring(0, 50)}...)` : '❌ MISSING');
    console.log('  - flight.booking_token:', sampleFlight.booking_token ? `✅ EXISTS (${sampleFlight.booking_token.substring(0, 50)}...)` : '❌ MISSING');
    console.log('  - flight.purchase_token:', sampleFlight.purchase_token ? `✅ EXISTS (${sampleFlight.purchase_token.substring(0, 50)}...)` : '❌ MISSING');
    console.log('  - flight.next_token:', sampleFlight.next_token ? `✅ EXISTS (${sampleFlight.next_token.substring(0, 50)}...)` : '❌ MISSING');
    console.log('  - flight.id:', sampleFlight.id ? `✅ EXISTS (${sampleFlight.id})` : '❌ MISSING');

    // Determine which token to use (mimicking our code logic)
    const tokenToUse = sampleFlight.token
      || sampleFlight.booking_token
      || sampleFlight.purchase_token
      || sampleFlight.next_token
      || sampleFlight.id;

    const tokenSource = Object.keys(sampleFlight).find(k => sampleFlight[k] === tokenToUse);

    console.log('\n🎯 Token selection:');
    console.log(`  - Using token from field: "${tokenSource}"`);
    console.log(`  - Token value: ${tokenToUse ? tokenToUse.substring(0, 50) + '...' : 'NONE'}`);

    if (!tokenToUse) {
      console.log('\n❌ No token available! Need to call getNextFlights endpoint.');
      return;
    }

    // Test getBookingURL with this token
    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('🔍 Step 2: Testing getBookingURL endpoint...\n');

    try {
      const bookingResponse = await axios.post(
        `${BASE_URL}/getBookingURL`,
        { token: tokenToUse },
        { headers, timeout: 10000 }
      );

      console.log('✅ getBookingURL response received!\n');
      console.log('📋 Response structure:');
      console.log(JSON.stringify(bookingResponse.data, null, 2));

      // Check for booking URL
      const bookingUrl = bookingResponse.data?.url
        || bookingResponse.data?.booking_url
        || bookingResponse.data?.bookingUrl
        || bookingResponse.data?.data?.url
        || bookingResponse.data?.data?.booking_url;

      console.log('\n🔗 Booking URL analysis:');
      if (bookingUrl) {
        console.log(`  ✅ URL found: ${bookingUrl.substring(0, 100)}...`);
        console.log(`  - Contains "/booking": ${bookingUrl.includes('/booking') ? '✅ YES' : '❌ NO'}`);
        console.log(`  - Contains "?tfs=": ${bookingUrl.includes('?tfs=') ? '✅ YES' : '❌ NO'}`);
        console.log(`  - Contains "/booking?tfs=": ${bookingUrl.includes('/booking?tfs=') ? '✅ YES' : '❌ NO'}`);

        if (bookingUrl.includes('/search')) {
          console.log('  ⚠️  WARNING: This looks like a SEARCH URL, not a BOOKING URL!');
        } else if (bookingUrl.includes('/booking')) {
          console.log('  ✅ This looks like a valid BOOKING URL!');
        } else {
          console.log('  ❓ Unknown URL type');
        }
      } else {
        console.log('  ❌ No booking URL found in response');
      }

    } catch (bookingError) {
      console.log('❌ getBookingURL failed:');
      console.log(`   Status: ${bookingError.response?.status}`);
      console.log(`   Message: ${bookingError.message}`);
      if (bookingError.response?.data) {
        console.log('   Response:', JSON.stringify(bookingError.response.data, null, 2));
      }
    }

    // Test getBookingDetails endpoint
    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('🔍 Step 3: Testing getBookingDetails endpoint...\n');

    try {
      const detailsResponse = await axios.get(`${BASE_URL}/getBookingDetails`, {
        params: {
          booking_token: tokenToUse,
          currency: 'USD',
          language_code: 'en-US',
          country_code: 'US'
        },
        headers: {
          'x-rapidapi-host': RAPIDAPI_HOST,
          'x-rapidapi-key': RAPIDAPI_KEY
        },
        timeout: 10000
      });

      console.log('✅ getBookingDetails response received!\n');
      console.log('📋 Response structure:');
      console.log(JSON.stringify(detailsResponse.data, null, 2));

    } catch (detailsError) {
      console.log('❌ getBookingDetails failed:');
      console.log(`   Status: ${detailsError.response?.status}`);
      console.log(`   Message: ${detailsError.message}`);
      if (detailsError.response?.data) {
        console.log('   Response:', JSON.stringify(detailsError.response.data, null, 2));
      }
    }

    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('✅ Debug test complete!\n');

  } catch (error) {
    console.error('❌ Flight search failed:', error.message);
    if (error.response) {
      console.error('   Status:', error.response.status);
      console.error('   Response:', JSON.stringify(error.response.data, null, 2));
    }
  }
}

// Run the test
console.log('🚀 Starting Booking Token Debug Test');
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

testFlightSearch().catch(console.error);
