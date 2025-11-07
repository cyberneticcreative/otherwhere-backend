/**
 * Test script for Duffel Flights + Airline Deep Links
 * Run with: node test-duffel-deeplinks.js
 */

require('dotenv').config();

const duffelFlightsService = require('./src/services/duffelFlightsService');
const airlineDeepLinksService = require('./src/services/airlineDeepLinksService');

async function testDuffelDeepLinks() {
  console.log('🧪 Testing Duffel Flights + Airline Deep Links\n');

  // Test parameters
  const testSearch = {
    origin: 'YVR',
    destination: 'JFK',
    departureDate: '2025-12-15',
    returnDate: '2025-12-22',
    passengers: 1,
    cabin: 'economy'
  };

  console.log('📋 Test Search Parameters:');
  console.log(JSON.stringify(testSearch, null, 2));
  console.log('\n---\n');

  try {
    // Step 1: Search flights via Duffel
    console.log('1️⃣ Searching flights via Duffel API...');
    const searchResults = await duffelFlightsService.searchFlights(testSearch);

    if (!searchResults.success) {
      console.error('❌ Flight search failed');
      return;
    }

    console.log(`✅ Found ${searchResults.offers.length} offers`);
    console.log('\n---\n');

    // Step 2: Format top 3 offers
    console.log('2️⃣ Formatting top 3 offers...');
    const formattedFlights = duffelFlightsService.formatOffers(searchResults.offers, 3);
    console.log(`✅ Formatted ${formattedFlights.length} flights`);
    console.log('\n---\n');

    // Step 3: Build airline deep links
    console.log('3️⃣ Building airline deep links...\n');
    const flightsWithLinks = formattedFlights.map((flight, index) => {
      const bookingData = airlineDeepLinksService.buildBookingURL({
        airlineCode: flight.airline.iata_code,
        origin: testSearch.origin,
        destination: testSearch.destination,
        departure: testSearch.departureDate,
        return: testSearch.returnDate,
        passengers: testSearch.passengers,
        cabin: testSearch.cabin
      });

      console.log(`Flight ${index + 1}:`);
      console.log(`  Airline: ${flight.airline.name} (${flight.airline.iata_code})`);
      console.log(`  Price: $${Math.round(flight.price)} ${flight.currency}`);
      console.log(`  Duration: ${flight.duration.text}`);
      console.log(`  Stops: ${flight.stops === 0 ? 'Direct' : `${flight.stops} stop${flight.stops > 1 ? 's' : ''}`}`);
      console.log(`  Link Source: ${bookingData.source}`);
      console.log(`  Booking URL: ${bookingData.url}`);
      console.log('');

      return {
        ...flight,
        bookingUrl: bookingData.url,
        bookingSource: bookingData.source
      };
    });

    console.log('---\n');

    // Step 4: Format SMS message
    console.log('4️⃣ Formatting SMS message...\n');
    const smsMessage = airlineDeepLinksService.formatSMSWithLinks(
      flightsWithLinks,
      testSearch
    );

    console.log('📱 SMS Message:');
    console.log('---');
    console.log(smsMessage);
    console.log('---\n');

    // Step 5: Summary
    console.log('✅ All tests passed!\n');
    console.log('📊 Summary:');
    console.log(`  - Total offers from Duffel: ${searchResults.offers.length}`);
    console.log(`  - Formatted flights: ${flightsWithLinks.length}`);
    console.log(`  - Airline deep links: ${flightsWithLinks.filter(f => f.bookingSource === 'airline').length}`);
    console.log(`  - Google Flights fallbacks: ${flightsWithLinks.filter(f => f.bookingSource === 'google_flights').length}`);
    console.log('');

    // Step 6: Supported airlines info
    const supportedCount = airlineDeepLinksService.getSupportedCount();
    console.log(`📚 Airline Deep Links Library: ${supportedCount} airlines supported`);

  } catch (error) {
    console.error('❌ Test failed:');
    console.error(error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

// Run the test
testDuffelDeepLinks()
  .then(() => {
    console.log('\n✅ Test completed successfully!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ Test failed:');
    console.error(error);
    process.exit(1);
  });
