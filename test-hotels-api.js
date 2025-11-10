const axios = require('axios');
require('dotenv').config();

const RAPIDAPI_KEY = process.env.RAPIDAPI_KEY_HOTELS || process.env.RAPIDAPI_KEY;
const RAPIDAPI_HOST = 'hotels-com6.p.rapidapi.com';
const BASE_URL = `https://${RAPIDAPI_HOST}`;

async function testHotelsAPI() {
  console.log('🧪 Testing Hotels.com API...\n');

  if (!RAPIDAPI_KEY) {
    console.error('❌ No RapidAPI key found in environment variables');
    return;
  }

  console.log(`🔑 Using API key: ${RAPIDAPI_KEY.substring(0, 10)}...`);
  console.log(`🌐 Testing endpoint: ${BASE_URL}/hotels/auto-complete`);
  console.log(`📍 Query: Berlin\n`);

  try {
    const response = await axios.get(`${BASE_URL}/hotels/auto-complete`, {
      params: { query: 'Berlin' },
      headers: {
        'x-rapidapi-host': RAPIDAPI_HOST,
        'x-rapidapi-key': RAPIDAPI_KEY
      },
      timeout: 15000
    });

    console.log('✅ API Response received!\n');
    console.log('📊 Response status:', response.status);
    console.log('📊 Response data structure:', JSON.stringify(response.data, null, 2));

    // Check what type the data is
    const rawResults = response.data?.data || response.data;
    console.log('\n🔍 Analysis:');
    console.log('  Type of rawResults:', typeof rawResults);
    console.log('  Is array?', Array.isArray(rawResults));
    if (typeof rawResults === 'object' && !Array.isArray(rawResults)) {
      console.log('  Object keys:', Object.keys(rawResults));
    }

  } catch (error) {
    console.error('❌ API Error:', error.message);
    if (error.response) {
      console.error('  Status:', error.response.status);
      console.error('  Data:', JSON.stringify(error.response.data, null, 2));
    }
  }
}

testHotelsAPI();
