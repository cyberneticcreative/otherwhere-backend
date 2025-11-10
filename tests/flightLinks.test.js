/**
 * Tests for Flight Link Providers
 *
 * Run with: node tests/flightLinks.test.js
 */

const {
  buildWhiteLabelURL,
  buildAviasalesFallback,
  buildKayakFallback,
  validateSearchParams,
  normalizeParams,
  selectProvider
} = require('../src/providers/flightsLinks');

// Test counter
let passed = 0;
let failed = 0;

function assert(condition, message) {
  if (condition) {
    console.log(`✅ ${message}`);
    passed++;
  } else {
    console.error(`❌ ${message}`);
    failed++;
  }
}

function runTests() {
  console.log('\n🧪 Testing Flight Link Providers\n');

  // Test 1: Validate search params - valid round trip
  console.log('--- Test: Validate Search Params (Valid) ---');
  const validParams = {
    o: 'YYZ',
    d: 'LIS',
    dd: '2026-02-12',
    rd: '2026-02-20',
    ad: 2,
    ch: 1,
    in: 0,
    cls: 'e',
    cur: 'USD'
  };

  const validation1 = validateSearchParams(validParams);
  assert(validation1.valid === true, 'Valid round-trip params should pass validation');
  assert(validation1.errors.length === 0, 'Valid params should have no errors');

  // Test 2: Validate search params - invalid airport code
  console.log('\n--- Test: Validate Search Params (Invalid Airport) ---');
  const invalidAirport = { ...validParams, o: 'XYZ9' };
  const validation2 = validateSearchParams(invalidAirport);
  assert(validation2.valid === false, 'Invalid airport code should fail validation');
  assert(validation2.errors.length > 0, 'Invalid airport should have errors');

  // Test 3: Validate search params - past date
  console.log('\n--- Test: Validate Search Params (Past Date) ---');
  const pastDate = { ...validParams, dd: '2020-01-01' };
  const validation3 = validateSearchParams(pastDate);
  assert(validation3.valid === false, 'Past departure date should fail validation');

  // Test 4: Validate search params - return before departure
  console.log('\n--- Test: Validate Search Params (Return Before Departure) ---');
  const badReturn = { ...validParams, rd: '2026-02-10' };
  const validation4 = validateSearchParams(badReturn);
  assert(validation4.valid === false, 'Return date before departure should fail validation');

  // Test 5: Validate search params - too many infants
  console.log('\n--- Test: Validate Search Params (Too Many Infants) ---');
  const tooManyInfants = { ...validParams, ad: 1, in: 2 };
  const validation5 = validateSearchParams(tooManyInfants);
  assert(validation5.valid === false, 'More infants than adults should fail validation');

  // Test 6: Normalize params
  console.log('\n--- Test: Normalize Params ---');
  const rawParams = {
    o: 'yyz',
    d: 'lis',
    dd: '2026-02-12',
    rd: '2026-02-20',
    ad: '2',
    ch: '1',
    cls: 'E',
    cur: 'usd'
  };
  const normalized = normalizeParams(rawParams);
  assert(normalized.o === 'YYZ', 'Origin should be uppercase');
  assert(normalized.d === 'LIS', 'Destination should be uppercase');
  assert(normalized.ad === 2, 'Adults should be parsed as integer');
  assert(normalized.ch === 1, 'Children should be parsed as integer');
  assert(normalized.cls === 'e', 'Class should be lowercase');
  assert(normalized.cur === 'USD', 'Currency should be uppercase');

  // Test 7: Build white-label URL (round trip)
  console.log('\n--- Test: Build White-Label URL (Round Trip) ---');
  process.env.AVIASALES_MARKER = '681469';
  const wlParams = {
    o: 'YYZ',
    d: 'LIS',
    dd: '2026-02-12',
    rd: '2026-02-20',
    ad: 2,
    ch: 1,
    in: 0,
    cls: 'e',
    cur: 'USD',
    sid: 'test123'
  };
  const wlUrl = buildWhiteLabelURL(wlParams);
  assert(wlUrl.includes('book.otherwhere.world'), 'White-label URL should use correct host');
  assert(wlUrl.includes('/YYZ0212LIS0220'), 'White-label URL should have correct path format');
  assert(wlUrl.includes('marker=681469'), 'White-label URL should include marker');
  assert(wlUrl.includes('subid=ow_test123'), 'White-label URL should include subid');
  assert(wlUrl.includes('adults=2'), 'White-label URL should include adults');
  assert(wlUrl.includes('children=1'), 'White-label URL should include children');

  // Test 8: Build white-label URL (one-way)
  console.log('\n--- Test: Build White-Label URL (One-Way) ---');
  const wlOneWay = { ...wlParams, rd: null };
  const wlUrlOneWay = buildWhiteLabelURL(wlOneWay);
  assert(wlUrlOneWay.includes('/YYZ0212LIS'), 'One-way URL should not have return date');
  assert(!wlUrlOneWay.includes('0220'), 'One-way URL should not include return date');

  // Test 9: Build Aviasales fallback URL
  console.log('\n--- Test: Build Aviasales Fallback URL ---');
  const avUrl = buildAviasalesFallback(wlParams);
  assert(avUrl.includes('aviasales.com/search'), 'Aviasales URL should use correct host');
  assert(avUrl.includes('marker=681469'), 'Aviasales URL should include marker');
  assert(avUrl.includes('subid=ow_test123'), 'Aviasales URL should include subid');

  // Test 10: Build Kayak fallback URL
  console.log('\n--- Test: Build Kayak Fallback URL ---');
  const kayakUrl = buildKayakFallback(wlParams);
  assert(kayakUrl.includes('kayak.com/flights'), 'Kayak URL should use correct host');
  assert(kayakUrl.includes('YYZ-LIS'), 'Kayak URL should include route');
  assert(kayakUrl.includes('2026-02-12'), 'Kayak URL should include departure date');
  assert(kayakUrl.includes('utm_source=otherwhere'), 'Kayak URL should include UTM tracking');

  // Test 11: Provider selection - healthy white-label
  console.log('\n--- Test: Provider Selection (Healthy) ---');
  const provider1 = selectProvider(true);
  assert(provider1 === 'whitelabel', 'Should select white-label when healthy');

  // Test 12: Provider selection - unhealthy white-label
  console.log('\n--- Test: Provider Selection (Unhealthy) ---');
  const provider2 = selectProvider(false);
  assert(provider2 === 'aviasales', 'Should select Aviasales when white-label unhealthy');

  // Test 13: Provider selection - no marker
  console.log('\n--- Test: Provider Selection (No Marker) ---');
  delete process.env.AVIASALES_MARKER;
  const provider3 = selectProvider(false);
  assert(provider3 === 'kayak', 'Should select Kayak when no marker and white-label unhealthy');

  // Summary
  console.log('\n' + '='.repeat(50));
  console.log(`✅ Passed: ${passed}`);
  console.log(`❌ Failed: ${failed}`);
  console.log(`📊 Total: ${passed + failed}`);
  console.log('='.repeat(50) + '\n');

  process.exit(failed > 0 ? 1 : 0);
}

// Run tests
runTests();
