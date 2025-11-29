/**
 * Tests for Recommendation Service
 *
 * Run with: node tests/recommendation.test.js
 */

const recommendationService = require('../src/services/recommendationService');

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
  console.log('\n🧪 Testing Recommendation Service\n');

  // ===========================================
  // Test: Trigger Detection
  // ===========================================
  console.log('--- Test: Trigger Detection ---');

  // Test explicit triggers
  const triggers = [
    "I don't know where to go",
    "give me some ideas",
    "give me recos",
    "surprise me",
    "where should I travel?",
    "what's good right now?",
    "help me decide",
    "not sure where to go",
    "need inspiration"
  ];

  const mockEmptySession = {
    tripDetails: null,
    context: {}
  };

  triggers.forEach(trigger => {
    const result = recommendationService.shouldEnterRecoMode(trigger, mockEmptySession);
    assert(result === true, `Should trigger on: "${trigger}"`);
  });

  // Test non-triggers
  const nonTriggers = [
    "book me a flight to Paris",
    "I want to go to Tokyo",
    "NYC next month"
  ];

  nonTriggers.forEach(msg => {
    const result = recommendationService.shouldEnterRecoMode(msg, mockEmptySession);
    assert(result === false, `Should NOT trigger on: "${msg}"`);
  });

  // Test that it doesn't trigger when destination already set
  const sessionWithDest = {
    tripDetails: { destination: 'Paris' },
    context: {}
  };
  const noTriggerWithDest = recommendationService.shouldEnterRecoMode("give me recos", sessionWithDest);
  assert(noTriggerWithDest === false, `Should NOT trigger when destination already set`);

  // ===========================================
  // Test: Vibe Parsing
  // ===========================================
  console.log('\n--- Test: Vibe Parsing ---');

  const vibeTests = [
    { input: 'beach and chill', expected: 'beach' },
    { input: 'I want to relax by the ocean', expected: 'beach' },
    { input: 'city buzz', expected: 'city' },
    { input: 'museums and food', expected: 'city' },
    { input: 'adventure and hiking', expected: 'adventure' },
    { input: 'big landscapes', expected: 'adventure' },
    { input: 'ancient history', expected: 'culture' },
    { input: 'traditional and authentic', expected: 'culture' },
    { input: 'a bit of everything', expected: 'mixed' },
    { input: 'asdf jkl', expected: 'mixed' } // Unknown defaults to mixed
  ];

  vibeTests.forEach(({ input, expected }) => {
    const result = recommendationService.parseVibeResponse(input);
    assert(result.category === expected, `Vibe "${input}" should parse to "${expected}" (got: ${result.category})`);
  });

  // ===========================================
  // Test: When Parsing
  // ===========================================
  console.log('\n--- Test: When Parsing ---');

  const whenTests = [
    { input: 'next week', expected: { timing: 'immediate' } },
    { input: 'next month', expected: { timing: 'soon' } },
    { input: 'summer', expected: { timing: 'summer' } },
    { input: 'winter holidays', expected: { timing: 'winter' } },
    { input: 'in march', expected: { month: 'march' } },
    { input: 'flexible on dates', expected: { flexible: true } },
    { input: 'dates are locked in', expected: { flexible: false } }
  ];

  whenTests.forEach(({ input, expected }) => {
    const result = recommendationService.parseWhenResponse(input);
    Object.keys(expected).forEach(key => {
      assert(result[key] === expected[key], `When "${input}" should have ${key}="${expected[key]}" (got: ${result[key]})`);
    });
  });

  // ===========================================
  // Test: Budget Parsing
  // ===========================================
  console.log('\n--- Test: Budget Parsing ---');

  const budgetTests = [
    { input: 'going all-out', expected: 'luxury' },
    { input: 'luxury travel', expected: 'luxury' },
    { input: 'splurge', expected: 'luxury' },
    { input: 'on a budget', expected: 'budget' },
    { input: 'cheap as possible', expected: 'budget' },
    { input: 'comfortable middle', expected: 'moderate' },
    { input: 'mid-range', expected: 'moderate' },
    { input: '$50 per day', expected: 'budget' },
    { input: '$200 per day', expected: 'moderate' },
    { input: '$500 per day', expected: 'luxury' }
  ];

  budgetTests.forEach(({ input, expected }) => {
    const result = recommendationService.parseBudgetResponse(input);
    assert(result.category === expected, `Budget "${input}" should parse to "${expected}" (got: ${result.category})`);
  });

  // ===========================================
  // Test: Who Parsing
  // ===========================================
  console.log('\n--- Test: Who Parsing ---');

  const whoTests = [
    { input: 'solo trip', expected: { category: 'solo', count: 1 } },
    { input: 'just me', expected: { category: 'solo', count: 1 } },
    { input: 'romantic getaway', expected: { category: 'romantic', count: 2 } },
    { input: 'with my partner', expected: { category: 'romantic', count: 2 } },
    { input: 'with friends', expected: { category: 'friends' } },
    { input: '4 friends', expected: { category: 'friends', count: 4 } },
    { input: 'family trip with kids', expected: { category: 'family' } }
  ];

  whoTests.forEach(({ input, expected }) => {
    const result = recommendationService.parseWhoResponse(input);
    Object.keys(expected).forEach(key => {
      assert(result[key] === expected[key], `Who "${input}" should have ${key}="${expected[key]}" (got: ${result[key]})`);
    });
  });

  // ===========================================
  // Test: Selection Parsing
  // ===========================================
  console.log('\n--- Test: Selection Parsing ---');

  const mockRecos = [
    { destination: 'Lisbon, Portugal', pitch: 'Test 1' },
    { destination: 'Tokyo, Japan', pitch: 'Test 2' },
    { destination: 'Medellín, Colombia', pitch: 'Test 3' }
  ];

  // Number selection
  const sel1 = recommendationService.parseSelection('1', mockRecos);
  assert(sel1.selected === true, 'Should select on "1"');
  assert(sel1.destination === 'Lisbon, Portugal', 'Should select correct destination for "1"');

  const sel2 = recommendationService.parseSelection('2', mockRecos);
  assert(sel2.selected === true, 'Should select on "2"');
  assert(sel2.destination === 'Tokyo, Japan', 'Should select correct destination for "2"');

  // Destination name mention
  const sel3 = recommendationService.parseSelection("let's do lisbon", mockRecos);
  assert(sel3.selected === true, 'Should select when destination name mentioned');
  assert(sel3.destination === 'Lisbon, Portugal', 'Should select correct destination by name');

  // Reroll
  const reroll = recommendationService.parseSelection("none of these", mockRecos);
  assert(reroll.reroll === true, 'Should detect reroll request');
  assert(reroll.selected === false, 'Should not be selected on reroll');

  // Needs clarification
  const unclear = recommendationService.parseSelection("maybe", mockRecos);
  assert(unclear.needsClarification === true, 'Should need clarification on "maybe"');

  // ===========================================
  // Test: Fallback Recommendations
  // ===========================================
  console.log('\n--- Test: Fallback Recommendations ---');

  const fallbackBeach = recommendationService.getFallbackRecommendations('beach', 'moderate');
  assert(fallbackBeach.length === 3, 'Fallback should return 3 recommendations');
  assert(fallbackBeach[0].destination.length > 0, 'Fallback should have destination');
  assert(fallbackBeach[0].pitch.length > 0, 'Fallback should have pitch');

  const fallbackCity = recommendationService.getFallbackRecommendations('city', 'budget');
  assert(fallbackCity.length === 3, 'City fallback should return 3 recommendations');

  const fallbackAdventure = recommendationService.getFallbackRecommendations('adventure', 'luxury');
  assert(fallbackAdventure.length === 3, 'Adventure fallback should return 3 recommendations');

  // ===========================================
  // Test: Format Recommendations for Channel
  // ===========================================
  console.log('\n--- Test: Format Recommendations ---');

  const formatted = recommendationService.formatRecommendationsForChannel(mockRecos);
  assert(formatted.includes('1.'), 'Formatted should include numbering');
  assert(formatted.includes('2.'), 'Formatted should include numbering');
  assert(formatted.includes('3.'), 'Formatted should include numbering');
  assert(formatted.includes('Any of these calling to you?'), 'Formatted should include follow-up');
  assert(!formatted.includes('*'), 'Formatted should not include markdown bold');
  assert(!formatted.includes('-'), 'Formatted should not include bullet points');

  // Empty recommendations
  const emptyFormatted = recommendationService.formatRecommendationsForChannel([]);
  assert(emptyFormatted.includes('trouble'), 'Empty format should indicate trouble');

  // ===========================================
  // Test: Questions
  // ===========================================
  console.log('\n--- Test: Question Generation ---');

  const vibeQ = recommendationService.getVibeQuestion();
  assert(vibeQ.includes('beach'), 'Vibe question should mention beach');
  assert(vibeQ.includes('city'), 'Vibe question should mention city');
  assert(vibeQ.includes('adventure'), 'Vibe question should mention adventure');

  const whenQ = recommendationService.getWhenQuestion();
  assert(whenQ.includes('When'), 'When question should ask about timing');
  assert(whenQ.includes('flexible'), 'When question should ask about flexibility');

  const budgetQ = recommendationService.getBudgetQuestion();
  assert(budgetQ.includes('all-out'), 'Budget question should mention luxury option');
  assert(budgetQ.includes('budget'), 'Budget question should mention budget option');

  const whoQ = recommendationService.getWhoQuestion();
  assert(whoQ.includes('Solo'), 'Who question should mention solo');
  assert(whoQ.includes('romantic'), 'Who question should mention romantic');
  assert(whoQ.includes('friends'), 'Who question should mention friends');

  // ===========================================
  // Test: Selection Confirmation
  // ===========================================
  console.log('\n--- Test: Selection Confirmation ---');

  const confirmation = recommendationService.getSelectionConfirmation('Lisbon, Portugal');
  assert(confirmation.includes('Lisbon'), 'Confirmation should include city name');
  assert(confirmation.includes('When'), 'Confirmation should transition to dates');

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
