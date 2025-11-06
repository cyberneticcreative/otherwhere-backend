/**
 * Test Custom Booking Flow
 * Tests the new Duffel Offers API integration
 */

require('dotenv').config();
const axios = require('axios');

const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';

async function testBookingFlow() {
  console.log('🧪 Testing Custom Booking Flow\n');
  console.log('Base URL:', BASE_URL);
  console.log('DUFFEL_ACCESS_TOKEN:', process.env.DUFFEL_ACCESS_TOKEN ? '✅ Set' : '❌ Missing');
  console.log('BOOK_LINK_SECRET:', process.env.BOOK_LINK_SECRET ? '✅ Set' : '❌ Missing');
  console.log('DATABASE_URL:', process.env.DATABASE_URL ? '✅ Set' : '❌ Missing');
  console.log('');

  try {
    // Test 1: Search for flights
    console.log('1️⃣ Testing flight search (POST /offers)...');
    const searchResponse = await axios.post(`${BASE_URL}/offers`, {
      origin: 'YVR',
      destination: 'LAX',
      departure_date: '2025-12-01',
      passengers: 1,
      cabin_class: 'economy'
    });

    console.log('✅ Flight search successful!');
    console.log(`   Found ${searchResponse.data.count} offers`);

    if (searchResponse.data.offers.length === 0) {
      console.log('⚠️  No offers returned. This might be expected with test data.');
      return;
    }

    const firstOffer = searchResponse.data.offers[0];
    console.log(`   Top offer: ${firstOffer.owner.name}`);
    console.log(`   Price: ${firstOffer.total_currency} ${firstOffer.total_with_fee}`);
    console.log(`   Route: ${firstOffer.departure.airport} → ${firstOffer.arrival.airport}`);
    console.log('');

    // Test 2: Create booking link
    console.log('2️⃣ Testing booking link creation (POST /offers/booking-link)...');
    const linkResponse = await axios.post(`${BASE_URL}/offers/booking-link`, {
      offer_id: firstOffer.id,
      expires_in_minutes: 30
    });

    console.log('✅ Booking link created!');
    console.log(`   URL: ${linkResponse.data.url}`);
    console.log(`   Expires: ${linkResponse.data.expires_at}`);
    console.log('');

    // Test 3: Get booking page data
    console.log('3️⃣ Testing booking page (GET /book/:token)...');
    const token = linkResponse.data.token;
    const bookingPageResponse = await axios.get(`${BASE_URL}/book/${token}`);

    console.log('✅ Booking page data retrieved!');
    console.log(`   Offer ID: ${bookingPageResponse.data.offer.id}`);
    console.log(`   Total: ${bookingPageResponse.data.offer.total_currency} ${bookingPageResponse.data.offer.total_with_fee}`);
    console.log(`   Price changed: ${bookingPageResponse.data.price_changed ? 'Yes ⚠️' : 'No ✅'}`);
    console.log('');

    // Test 4: Token validation
    console.log('4️⃣ Testing token service...');
    const tokenService = require('./src/utils/tokenService');
    const decoded = tokenService.verifyBookingToken(token);
    console.log('✅ Token verified successfully!');
    console.log(`   JTI: ${decoded.jti}`);
    console.log(`   Offer ID: ${decoded.offer_id}`);
    console.log(`   Expires: ${new Date(decoded.exp * 1000).toISOString()}`);
    console.log('');

    // Summary
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('✅ All tests passed!');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('');
    console.log('📝 Next steps:');
    console.log('   1. Test creating an order (requires passenger data)');
    console.log('   2. Update SMS controller to use new endpoints');
    console.log('   3. Test with real user flow');
    console.log('');

  } catch (error) {
    console.error('❌ Test failed:', error.message);

    if (error.response) {
      console.error('   Status:', error.response.status);
      console.error('   Error:', error.response.data);
    } else {
      console.error('   Details:', error);
    }

    process.exit(1);
  }
}

// Run tests
testBookingFlow();
