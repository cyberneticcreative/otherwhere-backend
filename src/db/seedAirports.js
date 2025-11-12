/**
 * Airport Database Seeding Script
 *
 * Populates airports, metro_areas, and aliases tables from OurAirports.com data
 *
 * Usage:
 *   node src/db/seedAirports.js
 *
 * Data source: https://ourairports.com/data/
 */

const https = require('https');
const { parse } = require('csv-parse/sync');
const db = require('./index');

// OurAirports.com CSV data URLs
const DATA_SOURCES = {
  airports: 'https://davidmegginson.github.io/ourairports-data/airports.csv',
  // countries: 'https://davidmegginson.github.io/ourairports-data/countries.csv',
  // regions: 'https://davidmegginson.github.io/ourairports-data/regions.csv',
};

// Major metro areas and their component airports
// Priority determines which airport is "primary" for the metro
const METRO_AREA_MAPPINGS = {
  NYC: {
    name: 'New York City',
    country: 'United States',
    country_code: 'US',
    airports: [
      { iata: 'JFK', is_primary: true },   // John F. Kennedy International
      { iata: 'LGA', is_primary: false },  // LaGuardia
      { iata: 'EWR', is_primary: false },  // Newark Liberty International
    ],
  },
  LON: {
    name: 'London',
    country: 'United Kingdom',
    country_code: 'GB',
    airports: [
      { iata: 'LHR', is_primary: true },   // Heathrow
      { iata: 'LGW', is_primary: false },  // Gatwick
      { iata: 'STN', is_primary: false },  // Stansted
      { iata: 'LTN', is_primary: false },  // Luton
      { iata: 'LCY', is_primary: false },  // London City
      { iata: 'SEN', is_primary: false },  // Southend
    ],
  },
  TYO: {
    name: 'Tokyo',
    country: 'Japan',
    country_code: 'JP',
    airports: [
      { iata: 'HND', is_primary: true },   // Haneda (closer to city)
      { iata: 'NRT', is_primary: false },  // Narita
    ],
  },
  PAR: {
    name: 'Paris',
    country: 'France',
    country_code: 'FR',
    airports: [
      { iata: 'CDG', is_primary: true },   // Charles de Gaulle
      { iata: 'ORY', is_primary: false },  // Orly
      { iata: 'BVA', is_primary: false },  // Beauvais
    ],
  },
  YTO: {
    name: 'Toronto',
    country: 'Canada',
    country_code: 'CA',
    airports: [
      { iata: 'YYZ', is_primary: true },   // Pearson International
      { iata: 'YTZ', is_primary: false },  // Billy Bishop Toronto City
    ],
  },
  OSA: {
    name: 'Osaka',
    country: 'Japan',
    country_code: 'JP',
    airports: [
      { iata: 'KIX', is_primary: true },   // Kansai International
      { iata: 'ITM', is_primary: false },  // Osaka International (Itami)
    ],
  },
  CHI: {
    name: 'Chicago',
    country: 'United States',
    country_code: 'US',
    airports: [
      { iata: 'ORD', is_primary: true },   // O'Hare International
      { iata: 'MDW', is_primary: false },  // Midway
    ],
  },
  WAS: {
    name: 'Washington D.C.',
    country: 'United States',
    country_code: 'US',
    airports: [
      { iata: 'DCA', is_primary: true },   // Ronald Reagan Washington National
      { iata: 'IAD', is_primary: false },  // Dulles International
      { iata: 'BWI', is_primary: false },  // Baltimore/Washington International
    ],
  },
  MIL: {
    name: 'Milan',
    country: 'Italy',
    country_code: 'IT',
    airports: [
      { iata: 'MXP', is_primary: true },   // Malpensa
      { iata: 'LIN', is_primary: false },  // Linate
      { iata: 'BGY', is_primary: false },  // Bergamo (Orio al Serio)
    ],
  },
  SAO: {
    name: 'São Paulo',
    country: 'Brazil',
    country_code: 'BR',
    airports: [
      { iata: 'GRU', is_primary: true },   // Guarulhos International
      { iata: 'CGH', is_primary: false },  // Congonhas
      { iata: 'VCP', is_primary: false },  // Viracopos (Campinas)
    ],
  },
  BUE: {
    name: 'Buenos Aires',
    country: 'Argentina',
    country_code: 'AR',
    airports: [
      { iata: 'EZE', is_primary: true },   // Ministro Pistarini International
      { iata: 'AEP', is_primary: false },  // Jorge Newbery
    ],
  },
  RIO: {
    name: 'Rio de Janeiro',
    country: 'Brazil',
    country_code: 'BR',
    airports: [
      { iata: 'GIG', is_primary: true },   // Galeão International
      { iata: 'SDU', is_primary: false },  // Santos Dumont
    ],
  },
  MOW: {
    name: 'Moscow',
    country: 'Russia',
    country_code: 'RU',
    airports: [
      { iata: 'SVO', is_primary: true },   // Sheremetyevo
      { iata: 'DME', is_primary: false },  // Domodedovo
      { iata: 'VKO', is_primary: false },  // Vnukovo
    ],
  },
  BER: {
    name: 'Berlin',
    country: 'Germany',
    country_code: 'DE',
    airports: [
      { iata: 'BER', is_primary: true },   // Brandenburg (new unified airport)
    ],
  },
  STO: {
    name: 'Stockholm',
    country: 'Sweden',
    country_code: 'SE',
    airports: [
      { iata: 'ARN', is_primary: true },   // Arlanda
      { iata: 'BMA', is_primary: false },  // Bromma
      { iata: 'NYO', is_primary: false },  // Skavsta
    ],
  },
};

// Common aliases for better fuzzy matching
// Maps airport IATA code to array of common alternative names/typos
const AIRPORT_ALIASES = {
  JFK: ['Kennedy', 'JFK Airport', 'New York JFK', 'john f kennedy'],
  LGA: ['LaGuardia', 'La Guardia', 'LGA Airport'],
  EWR: ['Newark', 'Newark Airport', 'EWR Airport'],
  LHR: ['Heathrow', 'London Heathrow'],
  LGW: ['Gatwick', 'London Gatwick'],
  CDG: ['Charles de Gaulle', 'Roissy', 'Paris CDG'],
  ORY: ['Orly', 'Paris Orly'],
  YYZ: ['Pearson', 'Toronto Pearson', 'YYZ Airport'],
  LAX: ['LAX Airport', 'Los Angeles Airport', 'LA Airport'],
  SFO: ['SFO Airport', 'San Francisco Airport', 'SF Airport'],
  ORD: ['O\'Hare', 'Ohare', 'Chicago O\'Hare'],
  MIA: ['Miami Airport', 'MIA Airport'],
  DXB: ['Dubai Airport', 'Dubai International'],
  SIN: ['Changi', 'Singapore Changi'],
  HND: ['Haneda', 'Tokyo Haneda'],
  NRT: ['Narita', 'Tokyo Narita'],
  ICN: ['Incheon', 'Seoul Incheon'],
  HKG: ['Hong Kong Airport', 'Chek Lap Kok'],
  SYD: ['Sydney Airport', 'Kingsford Smith'],
  MEL: ['Melbourne Airport', 'Tullamarine'],
  AMS: ['Schiphol', 'Amsterdam Schiphol'],
  FRA: ['Frankfurt Airport', 'Frankfurt Main'],
  MUC: ['Munich Airport', 'München'],
  BCN: ['Barcelona Airport', 'El Prat'],
  MAD: ['Madrid Airport', 'Barajas', 'Adolfo Suárez'],
  FCO: ['Fiumicino', 'Rome Fiumicino', 'Leonardo da Vinci'],
  IST: ['Istanbul Airport', 'Istanbul New Airport'],
  DFW: ['Dallas Fort Worth', 'DFW Airport'],
  ATL: ['Atlanta Airport', 'Hartsfield Jackson'],
  DEN: ['Denver Airport', 'DIA'],
  SEA: ['Seattle Airport', 'SeaTac', 'Sea-Tac'],
  BOS: ['Logan', 'Boston Logan'],
  IAH: ['Houston Airport', 'Bush Intercontinental'],
  PHX: ['Phoenix Airport', 'Sky Harbor'],
  LAS: ['Las Vegas Airport', 'McCarran'],
  MCO: ['Orlando Airport', 'MCO Airport'],
  CLT: ['Charlotte Airport', 'Douglas'],
  SLC: ['Salt Lake City Airport', 'SLC Airport'],
  DTW: ['Detroit Airport', 'Metro Wayne County'],
  MSP: ['Minneapolis Airport', 'MSP Airport'],
  PHL: ['Philadelphia Airport', 'PHL Airport'],
  BWI: ['Baltimore Airport', 'BWI Marshall'],
  BNA: ['Nashville Airport', 'BNA Airport'],
  AUS: ['Austin Airport', 'AUS Airport'],
  MDW: ['Midway', 'Chicago Midway'],
  OAK: ['Oakland Airport', 'OAK Airport'],
  SJC: ['San Jose Airport', 'SJC Airport'],
  PDX: ['Portland Airport', 'PDX Airport'],
  MSY: ['New Orleans Airport', 'Louis Armstrong'],
  RDU: ['Raleigh Durham', 'RDU Airport'],
  SAN: ['San Diego Airport', 'Lindbergh Field'],
  TPA: ['Tampa Airport', 'TPA Airport'],
  STL: ['St Louis Airport', 'Lambert'],
  PIT: ['Pittsburgh Airport', 'PIT Airport'],
  CLE: ['Cleveland Airport', 'Hopkins'],
  CMH: ['Columbus Airport', 'John Glenn'],
  IND: ['Indianapolis Airport', 'IND Airport'],
  MCI: ['Kansas City Airport', 'MCI Airport'],
  CUN: ['Cancun Airport', 'Cancún'],
  MEX: ['Mexico City Airport', 'Benito Juárez'],
  YVR: ['Vancouver Airport', 'YVR Airport'],
  YUL: ['Montreal Airport', 'Trudeau', 'Pierre Elliott Trudeau'],
  YYC: ['Calgary Airport', 'YYC Airport'],
  GRU: ['Guarulhos', 'São Paulo Guarulhos', 'Sao Paulo Airport'],
  EZE: ['Ezeiza', 'Buenos Aires Ezeiza', 'Ministro Pistarini'],
  GIG: ['Galeão', 'Rio Galeao', 'Rio Airport', 'Tom Jobim'],
  BOG: ['Bogota Airport', 'El Dorado'],
  LIM: ['Lima Airport', 'Jorge Chávez', 'Jorge Chavez'],
  SCL: ['Santiago Airport', 'Arturo Merino Benítez'],
};

/**
 * Download CSV data from URL
 */
function downloadCSV(url) {
  return new Promise((resolve, reject) => {
    console.log(`Downloading: ${url}`);
    https.get(url, (res) => {
      if (res.statusCode !== 200) {
        reject(new Error(`HTTP ${res.statusCode}: ${url}`));
        return;
      }

      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        console.log(`Downloaded ${(data.length / 1024).toFixed(2)} KB`);
        resolve(data);
      });
    }).on('error', reject);
  });
}

/**
 * Main seeding function
 */
async function seedAirports() {
  const client = await db.pool.connect();

  try {
    console.log('\n🛫 Starting airport database seeding...\n');

    await client.query('BEGIN');

    // Step 1: Download and parse airport data
    console.log('📥 Step 1: Downloading airport data from OurAirports.com...');
    const airportsCSV = await downloadCSV(DATA_SOURCES.airports);
    const airportsData = parse(airportsCSV, {
      columns: true,
      skip_empty_lines: true,
    });
    console.log(`   ✓ Parsed ${airportsData.length} airports\n`);

    // Step 2: Filter and insert airports
    console.log('✈️  Step 2: Inserting airports into database...');

    // Filter: only large/medium airports with IATA codes
    const filteredAirports = airportsData.filter(row =>
      row.iata_code &&
      row.iata_code.length === 3 &&
      (row.type === 'large_airport' || row.type === 'medium_airport')
    );

    console.log(`   Filtered to ${filteredAirports.length} large/medium airports with IATA codes`);

    let insertedCount = 0;
    const airportIdMap = new Map(); // IATA -> UUID mapping

    for (const row of filteredAirports) {
      try {
        const result = await client.query(`
          INSERT INTO airports (
            iata_code, icao_code, name, city, country, country_code,
            latitude, longitude, airport_type, is_active
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
          ON CONFLICT (iata_code) DO UPDATE
          SET icao_code = EXCLUDED.icao_code,
              name = EXCLUDED.name,
              city = EXCLUDED.city,
              country = EXCLUDED.country,
              latitude = EXCLUDED.latitude,
              longitude = EXCLUDED.longitude
          RETURNING id, iata_code
        `, [
          row.iata_code.toUpperCase(),
          row.ident || null,
          row.name,
          row.municipality || 'Unknown',
          row.iso_country || 'Unknown',
          row.iso_country || null,
          parseFloat(row.latitude_deg) || null,
          parseFloat(row.longitude_deg) || null,
          row.type,
          true, // is_active
        ]);

        airportIdMap.set(row.iata_code.toUpperCase(), result.rows[0].id);
        insertedCount++;

        if (insertedCount % 100 === 0) {
          process.stdout.write(`\r   Inserted ${insertedCount}/${filteredAirports.length} airports...`);
        }
      } catch (err) {
        console.error(`\n   ⚠️  Error inserting ${row.iata_code}: ${err.message}`);
      }
    }
    console.log(`\r   ✓ Inserted ${insertedCount} airports successfully\n`);

    // Step 3: Insert metro areas
    console.log('🌆 Step 3: Inserting metro areas...');
    const metroIdMap = new Map(); // Metro IATA -> UUID mapping

    for (const [iataCode, metro] of Object.entries(METRO_AREA_MAPPINGS)) {
      try {
        // Calculate average lat/lon from component airports
        const validAirports = metro.airports
          .map(a => filteredAirports.find(row => row.iata_code === a.iata))
          .filter(Boolean);

        const avgLat = validAirports.length > 0
          ? validAirports.reduce((sum, a) => sum + parseFloat(a.latitude_deg || 0), 0) / validAirports.length
          : null;

        const avgLon = validAirports.length > 0
          ? validAirports.reduce((sum, a) => sum + parseFloat(a.longitude_deg || 0), 0) / validAirports.length
          : null;

        const result = await client.query(`
          INSERT INTO metro_areas (
            iata_code, name, country, country_code, latitude, longitude
          )
          VALUES ($1, $2, $3, $4, $5, $6)
          ON CONFLICT (iata_code) DO UPDATE
          SET name = EXCLUDED.name,
              country = EXCLUDED.country
          RETURNING id
        `, [
          iataCode,
          metro.name,
          metro.country,
          metro.country_code,
          avgLat,
          avgLon,
        ]);

        metroIdMap.set(iataCode, result.rows[0].id);
        console.log(`   ✓ ${iataCode} - ${metro.name} (${metro.airports.length} airports)`);
      } catch (err) {
        console.error(`   ⚠️  Error inserting metro ${iataCode}: ${err.message}`);
      }
    }
    console.log(`   ✓ Inserted ${metroIdMap.size} metro areas\n`);

    // Step 4: Create airport-metro associations
    console.log('🔗 Step 4: Creating airport-metro associations...');
    let associationCount = 0;

    for (const [metroIata, metro] of Object.entries(METRO_AREA_MAPPINGS)) {
      const metroId = metroIdMap.get(metroIata);
      if (!metroId) continue;

      for (const airport of metro.airports) {
        const airportId = airportIdMap.get(airport.iata);
        if (!airportId) {
          console.log(`   ⚠️  Airport ${airport.iata} not found for metro ${metroIata}`);
          continue;
        }

        try {
          await client.query(`
            INSERT INTO airport_metro_associations (airport_id, metro_id, is_primary)
            VALUES ($1, $2, $3)
            ON CONFLICT (airport_id, metro_id) DO UPDATE
            SET is_primary = EXCLUDED.is_primary
          `, [airportId, metroId, airport.is_primary]);

          associationCount++;
        } catch (err) {
          console.error(`   ⚠️  Error associating ${airport.iata} with ${metroIata}: ${err.message}`);
        }
      }
    }
    console.log(`   ✓ Created ${associationCount} airport-metro associations\n`);

    // Step 5: Insert airport aliases
    console.log('📝 Step 5: Inserting airport aliases...');
    let aliasCount = 0;

    for (const [iataCode, aliases] of Object.entries(AIRPORT_ALIASES)) {
      const airportId = airportIdMap.get(iataCode);
      if (!airportId) {
        console.log(`   ⚠️  Airport ${iataCode} not found for aliases`);
        continue;
      }

      for (const alias of aliases) {
        try {
          await client.query(`
            INSERT INTO airport_aliases (airport_id, alias, alias_type, confidence)
            VALUES ($1, $2, $3, $4)
            ON CONFLICT DO NOTHING
          `, [airportId, alias, 'common_name', 0.95]);

          aliasCount++;
        } catch (err) {
          console.error(`   ⚠️  Error inserting alias '${alias}' for ${iataCode}: ${err.message}`);
        }
      }
    }
    console.log(`   ✓ Inserted ${aliasCount} airport aliases\n`);

    await client.query('COMMIT');

    // Step 6: Show statistics
    console.log('📊 Database Statistics:');
    const stats = await client.query(`
      SELECT
        (SELECT COUNT(*) FROM airports) as airports,
        (SELECT COUNT(*) FROM metro_areas) as metro_areas,
        (SELECT COUNT(*) FROM airport_metro_associations) as associations,
        (SELECT COUNT(*) FROM airport_aliases) as aliases
    `);
    console.log(`   Airports: ${stats.rows[0].airports}`);
    console.log(`   Metro Areas: ${stats.rows[0].metro_areas}`);
    console.log(`   Associations: ${stats.rows[0].associations}`);
    console.log(`   Aliases: ${stats.rows[0].aliases}\n`);

    console.log('✅ Airport seeding completed successfully!\n');

  } catch (error) {
    await client.query('ROLLBACK');
    console.error('\n❌ Error during seeding:');
    console.error(error);
    process.exit(1);
  } finally {
    client.release();
    await db.pool.end();
  }
}

// Run if called directly
if (require.main === module) {
  seedAirports();
}

module.exports = { seedAirports };
