/**
 * Test script for Google Flights API integration
 *
 * Usage:
 *   node test-flights.js
 *
 * Make sure to set RAPIDAPI_KEY in your .env file before running
 */

require('dotenv').config();
const googleFlightsService = require('./src/services/googleFlightsService');
const dayjs = require('dayjs');

async function testAirportSearch() {
  console.log('\n========================================');
  console.log('TEST 1: Airport Search');
  console.log('========================================\n');

  try {
    console.log('🔍 Searching for "New York" airports...\n');
    const airports = await googleFlightsService.searchAirport('New York');

    console.log(`✅ Found ${airports.length} airports:\n`);
    airports.forEach((airport, idx) => {
      console.log(`${idx + 1}. ${airport.displayName}`);
      console.log(`   Code: ${airport.code}`);
      console.log(`   City: ${airport.city}, ${airport.country}\n`);
    });

    return airports;
  } catch (error) {
    console.error('❌ Airport search failed:', error.message);
    return [];
  }
}

async function testFlightSearch() {
  console.log('\n========================================');
  console.log('TEST 2: Flight Search');
  console.log('========================================\n');

  try {
    // Test WITHOUT date first (matching the working curl command)
    console.log(`🔍 Searching flights LAX → JFK (no date specified)...\n`);

    const searchParams = {
      departureId: 'LAX',
      arrivalId: 'JFK',
      adults: 1,
      travelClass: 'ECONOMY',
      currency: 'USD'
    };

    const results = await googleFlightsService.searchFlights(searchParams);

    console.log(`✅ Found ${results.count} flights\n`);

    if (results.count > 0) {
      console.log('📊 Raw API Response Structure:');
      console.log('-----------------------------------');
      console.log(JSON.stringify(results.results, null, 2).substring(0, 500) + '...\n');

      // Format top 3 results
      console.log('🎯 Formatted Top 3 Results:');
      console.log('-----------------------------------');
      const formatted = googleFlightsService.formatFlightResults(results, 3);

      formatted.forEach(flight => {
        console.log(`\n${flight.index}. ${flight.airline}`);
        console.log(`   Price: $${flight.price} ${flight.currency}`);
        console.log(`   Departure: ${dayjs(flight.departure).format('h:mm A')}`);
        console.log(`   Arrival: ${dayjs(flight.arrival).format('h:mm A')}`);
        console.log(`   Duration: ${flight.duration}`);
        console.log(`   Stops: ${flight.stopsText}`);
        console.log(`   Token: ${flight.bookingToken ? flight.bookingToken.substring(0, 30) + '...' : 'N/A'}`);
      });

      // Test SMS formatting
      console.log('\n📱 SMS Message Format:');
      console.log('-----------------------------------');
      const smsMessage = googleFlightsService.formatSMSMessage(formatted, searchParams);
      console.log(smsMessage);

      return formatted[0]; // Return first flight for booking URL test
    }

    return null;
  } catch (error) {
    console.error('❌ Flight search failed:', error.message);
    if (error.response) {
      console.error('Response status:', error.response.status);
      console.error('Response data:', JSON.stringify(error.response.data, null, 2));
    }
    return null;
  }
}

async function testBookingURL(flight) {
  console.log('\n========================================');
  console.log('TEST 3: Booking URL');
  console.log('========================================\n');

  if (!flight || !flight.bookingToken) {
    console.log('⏭️  Skipping: No booking token available from previous test\n');
    return;
  }

  try {
    console.log('🔗 Getting booking URL for first flight...\n');
    const bookingData = await googleFlightsService.getBookingURL(flight.bookingToken);

    console.log('✅ Booking URL generated:');
    console.log(`   URL: ${bookingData.bookingUrl}\n`);
  } catch (error) {
    console.error('❌ Booking URL failed:', error.message);
  }
}

async function testConfigurationCheck() {
  console.log('\n========================================');
  console.log('TEST 0: Configuration Check');
  console.log('========================================\n');

  const isConfigured = googleFlightsService.isConfigured();

  if (isConfigured) {
    console.log('✅ Google Flights API is configured');
    console.log(`   RAPIDAPI_KEY: ${process.env.RAPIDAPI_KEY.substring(0, 10)}...`);
    console.log(`   RAPIDAPI_HOST: ${process.env.RAPIDAPI_HOST || 'google-flights2.p.rapidapi.com'}\n`);
  } else {
    console.log('❌ Google Flights API is NOT configured');
    console.log('   Please set RAPIDAPI_KEY in your .env file\n');
    process.exit(1);
  }
}

async function runAllTests() {
  console.log('\n🧪 GOOGLE FLIGHTS API TEST SUITE');
  console.log('=====================================\n');

  // Check configuration first
  await testConfigurationCheck();

  // Test 1: Airport search
  await testAirportSearch();

  // Test 2: Flight search
  const firstFlight = await testFlightSearch();

  // Test 3: Booking URL
  await testBookingURL(firstFlight);

  console.log('\n========================================');
  console.log('✨ All tests completed!');
  console.log('========================================\n');
}

// Run all tests
runAllTests().catch(error => {
  console.error('\n💥 Test suite failed:', error);
  process.exit(1);
});
