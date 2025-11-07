/**
 * Test Script for Airline Deep Links
 *
 * Run with: node test-deeplinks.js
 */

const {
  buildAirlineDeeplink,
  buildGoogleFlightsUrl,
  buildDeeplinkWithFallback,
  isAirlineSupported,
  getSupportedAirlines,
  validateSearchParams
} = require('./src/utils/deeplinksBuilder');

const { AIRLINE_DEEPLINKS } = require('./src/utils/airlineMapping');

console.log('='.repeat(60));
console.log('AIRLINE DEEP LINKS TEST');
console.log('='.repeat(60));

// Test search parameters
const testParams = {
  origin: 'LAX',
  destination: 'JFK',
  departure: '2025-12-01',
  returnDate: '2025-12-08',
  passengers: 2,
  cabin: 'economy'
};

console.log('\n📋 Test Parameters:');
console.log(JSON.stringify(testParams, null, 2));

// Test 1: Validate parameters
console.log('\n✅ Test 1: Parameter Validation');
const validation = validateSearchParams(testParams);
console.log('Valid:', validation.valid);
if (!validation.valid) {
  console.log('Errors:', validation.errors);
}

// Test 2: List supported airlines
console.log('\n✅ Test 2: Supported Airlines');
const supportedAirlines = getSupportedAirlines();
console.log(`Total supported airlines: ${supportedAirlines.length}`);
console.log('Sample airlines:', supportedAirlines.slice(0, 10).join(', '));

// Test 3: Build deep links for major airlines
console.log('\n✅ Test 3: Build Airline Deep Links');

const testAirlines = ['AA', 'DL', 'UA', 'BA', 'EK', 'QR', 'NH', 'QF'];

testAirlines.forEach(code => {
  const supported = isAirlineSupported(code);
  if (supported) {
    const url = buildAirlineDeeplink(code, testParams);
    const airlineName = AIRLINE_DEEPLINKS[code].name;
    console.log(`\n${code} - ${airlineName}:`);
    console.log(`  ${url}`);
  } else {
    console.log(`\n${code} - NOT SUPPORTED`);
  }
});

// Test 4: Google Flights fallback
console.log('\n✅ Test 4: Google Flights Fallback');
const googleUrl = buildGoogleFlightsUrl(testParams);
console.log('Google Flights URL:');
console.log(`  ${googleUrl}`);

// Test 5: Build with fallback for unsupported airline
console.log('\n✅ Test 5: Fallback for Unsupported Airline');
const fallbackResult = buildDeeplinkWithFallback('XX', testParams);
console.log('Provider:', fallbackResult.provider);
console.log('URL:', fallbackResult.url);

// Test 6: One-way trip
console.log('\n✅ Test 6: One-Way Trip');
const oneWayParams = {
  origin: 'SFO',
  destination: 'ORD',
  departure: '2025-12-15',
  passengers: 1,
  cabin: 'business'
};
const oneWayUrl = buildAirlineDeeplink('AA', oneWayParams);
console.log('One-way American Airlines URL:');
console.log(`  ${oneWayUrl}`);

// Test 7: Cabin class support
console.log('\n✅ Test 7: Cabin Class Support');
const cabinClasses = ['economy', 'premium_economy', 'business', 'first'];
cabinClasses.forEach(cabin => {
  const params = { ...testParams, cabin };
  const url = buildAirlineDeeplink('DL', params);
  console.log(`\n${cabin}:`);
  console.log(`  ${url}`);
});

// Test 8: Statistics
console.log('\n✅ Test 8: Statistics');
const allAirlines = Object.entries(AIRLINE_DEEPLINKS);
const withCabinSupport = allAirlines.filter(([_, airline]) => airline.supportsCabin).length;
const withoutCabinSupport = allAirlines.length - withCabinSupport;

console.log(`Total airlines: ${allAirlines.length}`);
console.log(`With cabin class support: ${withCabinSupport}`);
console.log(`Without cabin class support: ${withoutCabinSupport}`);

// Test 9: Airline alliances
console.log('\n✅ Test 9: Airline Alliances');
const { AIRLINE_ALLIANCES } = require('./src/utils/airlineMapping');
Object.entries(AIRLINE_ALLIANCES).forEach(([alliance, airlines]) => {
  console.log(`${alliance}: ${airlines.length} airlines`);
  console.log(`  Sample: ${airlines.slice(0, 5).join(', ')}`);
});

console.log('\n' + '='.repeat(60));
console.log('✅ ALL TESTS COMPLETED SUCCESSFULLY');
console.log('='.repeat(60));
