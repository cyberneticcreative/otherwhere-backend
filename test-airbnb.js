/**
 * Test script for Airbnb Service
 *
 * Usage: node test-airbnb.js
 *
 * Make sure to set RAPIDAPI_KEY or RAPIDAPI_KEY_AIRBNB in your .env file first!
 */

require('dotenv').config();
const airbnbService = require('./src/services/airbnbService');

async function testAirbnbService() {
  console.log('🧪 Testing Airbnb Service\n');
  console.log('=' .repeat(60));

  try {
    // Test 1: Check configuration
    console.log('\n1️⃣  Checking configuration...');
    const isConfigured = airbnbService.isConfigured();
    console.log(`   ✅ Service configured: ${isConfigured}`);

    if (!isConfigured) {
      console.error('   ❌ Service not configured. Please set RAPIDAPI_KEY in .env');
      return;
    }

    // Test 2: Search destination
    console.log('\n2️⃣  Searching for destination: Austin, Texas...');
    const destinations = await airbnbService.searchDestination('Austin', 'USA');
    console.log(`   ✅ Found ${destinations.length} destinations`);

    if (destinations.length > 0) {
      console.log(`   📍 First destination:`, destinations[0]);
    }

    const destinationId = destinations[0]?.id;

    if (!destinationId) {
      console.error('   ❌ No destination ID found. Cannot proceed with property search.');
      return;
    }

    // Test 3: Search properties (without dates - general search)
    console.log('\n3️⃣  Searching properties in Austin (no dates)...');
    const searchResults = await airbnbService.searchProperties({
      destinationId: destinationId,
      adults: 2,
      currency: 'USD',
      limit: 5
    });

    console.log(`   ✅ Found ${searchResults.count} properties`);

    if (searchResults.count > 0) {
      console.log(`   🏠 First property sample:`, {
        id: searchResults.results[0].id,
        name: searchResults.results[0].name?.substring(0, 50),
        price: searchResults.results[0].price
      });
    }

    // Test 4: Format results for SMS
    console.log('\n4️⃣  Formatting results for SMS...');
    const formattedResults = airbnbService.formatPropertyResults(searchResults, 3);
    console.log(`   ✅ Formatted ${formattedResults.length} properties`);

    if (formattedResults.length > 0) {
      console.log(`   🏠 First formatted property:`, {
        index: formattedResults[0].index,
        name: formattedResults[0].name,
        pricePerNight: formattedResults[0].pricePerNight,
        rating: formattedResults[0].rating,
        url: formattedResults[0].url
      });
    }

    // Test 5: Generate SMS message
    console.log('\n5️⃣  Generating SMS message...');
    const smsMessage = airbnbService.formatSMSMessage(formattedResults, {
      destinationName: 'Austin, TX',
      checkIn: '2025-03-15',
      checkOut: '2025-03-18'
    });

    console.log(`   ✅ SMS message generated (${smsMessage.length} chars)`);
    console.log('\n📱 SMS Preview:\n');
    console.log('─'.repeat(60));
    console.log(smsMessage);
    console.log('─'.repeat(60));

    // Test 6: Search with specific dates (if we have time)
    console.log('\n6️⃣  Searching properties with specific dates...');
    const datedSearch = await airbnbService.searchProperties({
      destinationId: destinationId,
      checkIn: '2025-03-15',
      checkOut: '2025-03-18',
      adults: 2,
      maxPrice: 200,
      currency: 'USD',
      limit: 3
    });

    console.log(`   ✅ Found ${datedSearch.count} properties for specific dates`);

    // Test 7: Calculate total cost
    console.log('\n7️⃣  Calculating total stay cost...');
    if (formattedResults.length > 0) {
      const costBreakdown = airbnbService.calculateTotalCost(
        formattedResults[0].pricePerNight,
        '2025-03-15',
        '2025-03-18'
      );
      console.log(`   ✅ Cost breakdown:`, costBreakdown);
    }

    console.log('\n' + '='.repeat(60));
    console.log('✅ All tests passed!\n');

  } catch (error) {
    console.error('\n❌ Test failed:', error.message);
    console.error('Full error:', error);
    process.exit(1);
  }
}

// Run tests
testAirbnbService()
  .then(() => {
    console.log('🎉 Test suite completed successfully');
    process.exit(0);
  })
  .catch(error => {
    console.error('💥 Test suite failed:', error);
    process.exit(1);
  });
