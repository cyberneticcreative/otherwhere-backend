/**
 * Tests for Accommodation Intent Detection
 *
 * Run with: node tests/accommodationIntent.test.js
 *
 * Tests the flexible intent matching that prevents the bot from
 * re-asking when user says "stays too please" after flight selection
 */

// Test counter
let passed = 0;
let failed = 0;

// Copy of the intent detection functions for testing without loading full controller
function detectAccommodationIntent(message) {
  const lower = message.toLowerCase().trim();

  const accommodationPatterns = [
    /^stays?$/i,
    /^hotels?$/i,
    /^airbnb$/i,
    /^accommodations?$/i,
    /^lodging$/i,
    /^place to stay$/i,
    /^(yes|yeah|yep|yup|sure|ok|okay|please|definitely|absolutely)$/i,
    /^(yes|yeah|yep|yup|sure|ok|okay)\s*(please|thanks)?$/i,
    /stays?\s*(too|also|as\s*well|please)?/i,
    /hotels?\s*(too|also|as\s*well|please)?/i,
    /airbnb\s*(too|also|as\s*well|please)?/i,
    /(find|get|search|show|book)\s*(me\s*)?(a\s*)?(place|stay|hotel|airbnb|accommodation)/i,
    /(need|want|looking\s*for)\s*(a\s*)?(place|stay|hotel|airbnb|accommodation)/i,
    /place\s*to\s*stay/i,
    /somewhere\s*to\s*stay/i,
    /both\s*(please)?$/i,
    /and\s*(a\s*)?(hotel|stay|accommodation)/i,
    /^that\s*too$/i,
    /^add\s*(a\s*)?(hotel|stay)/i,
  ];

  return accommodationPatterns.some(pattern => pattern.test(lower));
}

function detectJustFlightIntent(message) {
  const lower = message.toLowerCase().trim();

  const justFlightPatterns = [
    /^just\s*(the\s*)?flight$/i,
    /^(only|just)\s*(the\s*)?flight$/i,
    /^no\s*(hotel|stay|accommodation)/i,
    /^flight\s*only$/i,
    /^(nope|no|nah)$/i,
    /^i'?m?\s*(good|fine|all\s*set)$/i,  // "im good", "I'm good", "i'm fine"
    /^that'?s?\s*(it|all)$/i,  // "thats it", "that's all", "thats all"
    /^all\s*set$/i,  // "all set"
  ];

  return justFlightPatterns.some(pattern => pattern.test(lower));
}

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
  console.log('\n🧪 Testing Accommodation Intent Detection\n');

  // ===========================================
  // Test: Accommodation Intent Detection
  // ===========================================
  console.log('--- Test: Should detect accommodation intent ---');

  const accommodationTests = [
    // Direct keywords
    'stays',
    'stay',
    'hotel',
    'hotels',
    'airbnb',
    'accommodation',
    'accommodations',
    'lodging',
    'place to stay',

    // With modifiers (the actual failure case from logs)
    'Stays too please',
    'stays too',
    'stays also',
    'stays as well',
    'hotel too please',
    'hotel too',
    'airbnb too',
    'yes please',
    'yeah',
    'yep',
    'sure',
    'ok',
    'okay',
    'please',
    'definitely',
    'absolutely',

    // Natural variations
    'yes please',
    'yeah thanks',
    'find me a place to stay',
    'get me a hotel',
    'search for hotels',
    'show me airbnbs',
    'book accommodation',
    'I need a place to stay',
    'I want a hotel',
    'looking for a place',
    'place to stay',
    'somewhere to stay',
    'both',
    'both please',
    'and a hotel',
    'and a stay',
    'that too',
    'add a hotel',
    'add a stay',
  ];

  accommodationTests.forEach(input => {
    const result = detectAccommodationIntent(input);
    assert(result === true, `Should detect accommodation intent: "${input}"`);
  });

  // ===========================================
  // Test: Just Flight Intent Detection
  // ===========================================
  console.log('\n--- Test: Should detect "just flight" intent ---');

  const justFlightTests = [
    'just flight',
    'just the flight',
    'only flight',
    'flight only',
    'no hotel',
    'no stay',
    'no accommodation',
    'nope',
    'no',
    'nah',
    'I\'m good',
    'im good',
    'I\'m fine',
    'all set',
    'that\'s it',
    'thats all',
  ];

  justFlightTests.forEach(input => {
    const result = detectJustFlightIntent(input);
    assert(result === true, `Should detect "just flight" intent: "${input}"`);
  });

  // ===========================================
  // Test: Should NOT detect false positives
  // ===========================================
  console.log('\n--- Test: Should NOT detect false positives ---');

  const shouldNotTrigger = [
    'Can I change my flight time?',
    'Show me afternoon flights',
    'I want morning departure',
    'What about business class?',
    'How much is it?',
    'Tell me more about the options',
    '15th works',
    'January 20',
    'Vancouver',
  ];

  shouldNotTrigger.forEach(input => {
    const accomResult = detectAccommodationIntent(input);
    const flightResult = detectJustFlightIntent(input);
    assert(
      accomResult === false && flightResult === false,
      `Should NOT trigger on unrelated: "${input}"`
    );
  });

  // ===========================================
  // Test: Edge cases
  // ===========================================
  console.log('\n--- Test: Edge cases ---');

  // Mixed case
  assert(
    detectAccommodationIntent('STAYS TOO PLEASE') === true,
    'Should handle uppercase: "STAYS TOO PLEASE"'
  );

  // Extra whitespace
  assert(
    detectAccommodationIntent('  stays too please  ') === true,
    'Should handle whitespace: "  stays too please  "'
  );

  // Common typos/variations - these might not match but shouldn't crash
  const edgeCases = ['stasy', 'hotle', 'aribnb'];
  edgeCases.forEach(input => {
    // Just make sure it doesn't throw
    try {
      detectAccommodationIntent(input);
      detectJustFlightIntent(input);
      console.log(`✅ Handles edge case without crashing: "${input}"`);
      passed++;
    } catch (e) {
      console.error(`❌ Crashed on edge case: "${input}"`);
      failed++;
    }
  });

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
