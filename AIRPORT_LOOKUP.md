# Airport Lookup Layer

Production-ready airport and metro area lookup system for otherwhere-backend.

## Features

- **Multi-tier Lookup Strategy**: Memory cache → Database → API → Fallback
- **Fuzzy Matching**: Handles typos and variations using PostgreSQL trigrams
- **Metro Code Preference**: Prioritizes city codes (NYC, LON, YTO) over individual airports
- **Confidence Scoring**: Returns match quality scores (0.0-1.0)
- **Disambiguation**: Provides alternatives when multiple matches exist
- **High Availability**: Falls back to hardcoded mappings if database unavailable
- **Performance Optimized**: In-memory LRU cache + database cache with hit tracking
- **Backward Compatible**: Drop-in replacement for existing `airportResolverService`

## Architecture

```
User Query
    ↓
┌─────────────────────────────────────┐
│  Memory Cache (LRU)                 │ ← Instant (microseconds)
│  - 1000 most recent queries         │
└─────────────────────────────────────┘
    ↓ (cache miss)
┌─────────────────────────────────────┐
│  Database Cache Table               │ ← Very Fast (<10ms)
│  - Frequently accessed queries      │
│  - Hit count tracking               │
└─────────────────────────────────────┘
    ↓ (cache miss)
┌─────────────────────────────────────┐
│  Database Lookup                    │ ← Fast (<50ms)
│  1. Exact IATA match                │
│  2. City/name match                 │
│  3. Alias match                     │
│  4. Fuzzy trigram search            │
└─────────────────────────────────────┘
    ↓ (no result)
┌─────────────────────────────────────┐
│  Fallback to Hardcoded Resolver     │ ← Guaranteed availability
│  - ~90 major cities/airports        │
└─────────────────────────────────────┘
    ↓
Normalized Result (IATA code + metadata)
```

## Database Schema

### Tables

#### `airports`
Individual airports with IATA/ICAO codes and metadata.

```sql
- iata_code (VARCHAR(3), unique)    -- e.g., 'JFK', 'LHR', 'YYZ'
- icao_code (VARCHAR(4))            -- e.g., 'KJFK', 'EGLL', 'CYYZ'
- name (VARCHAR(255))               -- Full airport name
- city (VARCHAR(100))               -- City name
- country (VARCHAR(100))            -- Country name
- country_code (CHAR(2))            -- ISO 3166-1 alpha-2
- latitude, longitude               -- Geographic coordinates
- timezone (VARCHAR(50))            -- IANA timezone
- airport_type (VARCHAR(20))        -- large_airport, medium_airport, small_airport
- is_active (BOOLEAN)               -- Whether airport is operational
- passenger_count (INT)             -- Annual passengers (for ranking)
- search_text (TEXT)                -- Auto-generated search index
```

#### `metro_areas`
City/metro codes representing multiple airports (e.g., NYC, LON, TYO).

```sql
- iata_code (VARCHAR(3), unique)    -- e.g., 'NYC', 'LON', 'YTO'
- name (VARCHAR(255))               -- Metro area name
- country (VARCHAR(100))            -- Country name
- country_code (CHAR(2))            -- ISO 3166-1 alpha-2
- latitude, longitude               -- Geographic coordinates
- timezone (VARCHAR(50))            -- IANA timezone
- search_text (TEXT)                -- Auto-generated search index
```

#### `airport_metro_associations`
Many-to-many relationship between airports and metro areas.

```sql
- airport_id (UUID)                 -- References airports
- metro_id (UUID)                   -- References metro_areas
- is_primary (BOOLEAN)              -- Primary airport for metro (e.g., JFK for NYC)
```

#### `airport_aliases`
Alternative names, spellings, and common variations.

```sql
- airport_id (UUID)                 -- References airports
- alias (VARCHAR(255))              -- Alternative name
- alias_type (VARCHAR(50))          -- common_name, abbreviation, typo, local_name
- language (CHAR(2))                -- ISO 639-1 language code
- confidence (DECIMAL(3,2))         -- Match confidence (0.00-1.00)
```

#### `airport_lookup_cache`
Performance cache with hit tracking.

```sql
- query (VARCHAR(255), primary key) -- User query
- result_type (VARCHAR(20))         -- 'airport' or 'metro'
- result_iata (VARCHAR(3))          -- Resolved IATA code
- alternatives (JSONB)              -- Alternative matches
- confidence (DECIMAL(3,2))         -- Match confidence
- hit_count (INT)                   -- Number of hits
- last_accessed (TIMESTAMP)         -- Last access time
```

### Indexes

- **Trigram indexes** (GIN) on `search_text` columns for fuzzy matching
- **B-tree indexes** on IATA codes, city names, country codes
- **Partial indexes** on active airports and primary metro airports

## Setup

### 1. Run Database Migration

The migration runs automatically on server startup. To run manually:

```bash
node -e "require('./src/db').runMigrations()"
```

### 2. Seed Airport Data

Download and populate airport data from OurAirports.com:

```bash
node src/db/seedAirports.js
```

This will:
- Download ~8,000 airports from OurAirports.com
- Filter to large/medium airports with IATA codes (~2,500 airports)
- Create 15 major metro areas (NYC, LON, TYO, PAR, etc.)
- Add 100+ airport aliases for fuzzy matching
- Take ~30-60 seconds to complete

**Expected output:**
```
🛫 Starting airport database seeding...

📥 Step 1: Downloading airport data from OurAirports.com...
   ✓ Parsed 67,421 airports

✈️  Step 2: Inserting airports into database...
   ✓ Inserted 2,487 airports successfully

🌆 Step 3: Inserting metro areas...
   ✓ NYC - New York City (3 airports)
   ✓ LON - London (6 airports)
   ...
   ✓ Inserted 15 metro areas

🔗 Step 4: Creating airport-metro associations...
   ✓ Created 47 airport-metro associations

📝 Step 5: Inserting airport aliases...
   ✓ Inserted 156 airport aliases

📊 Database Statistics:
   Airports: 2,487
   Metro Areas: 15
   Associations: 47
   Aliases: 156

✅ Airport seeding completed successfully!
```

## API Usage

### REST API Endpoints

#### `POST /airports/lookup`

Look up airport or metro area from user input.

**Request:**
```json
{
  "query": "Toronto",
  "preferMetro": true,
  "fuzzy": true,
  "maxResults": 5
}
```

**Response (Metro):**
```json
{
  "query": "Toronto",
  "result": {
    "type": "metro",
    "iataCode": "YTO",
    "name": "Toronto",
    "city": "Toronto",
    "country": "Canada",
    "countryCode": "CA",
    "airportCodes": ["YYZ", "YTZ"],
    "latitude": 43.6772,
    "longitude": -79.6306,
    "timezone": "America/Toronto",
    "confidence": 1.0
  },
  "timestamp": "2025-11-12T..."
}
```

**Response (Airport):**
```json
{
  "query": "YYZ",
  "result": {
    "type": "airport",
    "iataCode": "YYZ",
    "icaoCode": "CYYZ",
    "name": "Toronto Pearson International Airport",
    "city": "Toronto",
    "country": "Canada",
    "countryCode": "CA",
    "latitude": 43.6772,
    "longitude": -79.6306,
    "timezone": "America/Toronto",
    "airportType": "large_airport",
    "passengerCount": 50000000,
    "confidence": 1.0
  }
}
```

**Response (Disambiguation):**
```json
{
  "query": "Portland",
  "result": {
    "type": "airport",
    "iataCode": "PDX",
    "name": "Portland International Airport",
    "city": "Portland",
    "country": "United States",
    "confidence": 0.92,
    "alternatives": [
      {
        "iataCode": "PWM",
        "name": "Portland International Jetport",
        "city": "Portland",
        "country": "United States",
        "type": "airport",
        "confidence": 0.88
      }
    ]
  }
}
```

#### `GET /airports/lookup/:query`

Convenience endpoint for URL-based lookups.

```bash
curl http://localhost:3000/airports/lookup/Toronto?preferMetro=true
```

#### `POST /airports/batch-lookup`

Look up multiple airports in a single request (max 50).

**Request:**
```json
{
  "queries": ["Toronto", "NYC", "London", "Tokyo"],
  "preferMetro": true,
  "fuzzy": true
}
```

**Response:**
```json
{
  "results": [
    { "query": "Toronto", "success": true, "result": {...} },
    { "query": "NYC", "success": true, "result": {...} },
    { "query": "London", "success": true, "result": {...} },
    { "query": "Tokyo", "success": true, "result": {...} }
  ],
  "total": 4,
  "successful": 4,
  "failed": 0
}
```

#### `GET /airports/stats`

Get cache statistics.

```json
{
  "hits": {
    "memory": 1250,
    "db": 342,
    "api": 0,
    "fallback": 12
  },
  "misses": 8,
  "errors": 2,
  "cacheSize": 987,
  "hitRate": "99.50%"
}
```

#### `POST /airports/cache/clear`

Clear in-memory cache (admin endpoint).

#### `DELETE /airports/cache/db?olderThanDays=30`

Clear old database cache entries (admin endpoint).

## Service Usage (JavaScript)

### Basic Lookup

```javascript
const airportLookupService = require('./services/airportLookupService');

// Simple lookup (returns metro code if available)
const result = await airportLookupService.lookup('Toronto');
console.log(result.iataCode); // 'YTO'

// Force airport code (no metro preference)
const airport = await airportLookupService.lookup('Toronto', { preferMetro: false });
console.log(airport.iataCode); // 'YYZ'

// Disable fuzzy matching
const exact = await airportLookupService.lookup('YYZ', { fuzzy: false });
```

### Backward Compatible Methods

Drop-in replacement for `airportResolverService`:

```javascript
// Old way (still works)
const code = await airportLookupService.resolveAirportCode('Toronto');
console.log(code); // 'YTO'

// Get airport info
const info = await airportLookupService.getAirportInfo('YYZ');
console.log(info); // { code: 'YYZ', name: '...', city: 'Toronto', ... }

// Check if resolvable
const canResolve = await airportLookupService.canResolve('Toronto');
console.log(canResolve); // true
```

### Advanced Features

```javascript
// Get multiple disambiguation options
const result = await airportLookupService.lookup('Portland', { maxResults: 10 });
if (result.alternatives) {
  console.log('Multiple matches found:');
  console.log('Primary:', result.iataCode);
  console.log('Alternatives:', result.alternatives.map(a => a.iataCode));
}

// Fuzzy matching (handles typos)
const fuzzy = await airportLookupService.lookup('Tornto'); // typo
console.log(fuzzy.iataCode); // 'YTO' (corrected)
console.log(fuzzy.confidence); // 0.87 (lower confidence indicates fuzzy match)

// Get statistics
const stats = airportLookupService.getStats();
console.log(`Hit rate: ${stats.hitRate}`);
console.log(`Cache size: ${stats.cacheSize}`);

// Clear cache
airportLookupService.clearCache();
```

## Metro Areas

The system includes these major metro areas:

| Code | City | Airports |
|------|------|----------|
| NYC | New York City | JFK, LGA, EWR |
| LON | London | LHR, LGW, STN, LTN, LCY, SEN |
| TYO | Tokyo | HND, NRT |
| PAR | Paris | CDG, ORY, BVA |
| YTO | Toronto | YYZ, YTZ |
| OSA | Osaka | KIX, ITM |
| CHI | Chicago | ORD, MDW |
| WAS | Washington D.C. | DCA, IAD, BWI |
| MIL | Milan | MXP, LIN, BGY |
| SAO | São Paulo | GRU, CGH, VCP |
| BUE | Buenos Aires | EZE, AEP |
| RIO | Rio de Janeiro | GIG, SDU |
| MOW | Moscow | SVO, DME, VKO |
| BER | Berlin | BER |
| STO | Stockholm | ARN, BMA, NYO |

## Lookup Strategies

The service uses multiple strategies in order:

1. **Exact IATA Code Match** (fastest)
   - Checks if query is 3-letter code
   - Looks up in metro_areas first (if preferMetro=true)
   - Then checks airports table

2. **Exact City/Name Match**
   - Exact match on city name or airport name
   - Case-insensitive

3. **Alias Match**
   - Checks common alternative names
   - Examples: "Heathrow" → LHR, "Pearson" → YYZ

4. **Fuzzy Text Search** (if enabled)
   - Uses PostgreSQL trigram similarity
   - Handles typos and variations
   - Returns confidence score

5. **Fallback** (if database unavailable)
   - Uses hardcoded `airportResolverService`
   - Guarantees availability

## Query Normalization

The service automatically normalizes queries:

- Removes " city" suffix: "New York City" → "new york"
- Removes " airport" suffix: "Toronto Airport" → "toronto"
- Removes prefixes: "the Hague" → "hague"
- Lowercases and trims whitespace

## Performance

Typical response times:

- **Memory cache hit**: < 1ms
- **Database cache hit**: < 10ms
- **Database lookup**: < 50ms
- **Fuzzy search**: < 100ms
- **Fallback**: < 5ms

Memory usage:
- **In-memory cache**: ~100 KB (1000 entries)
- **Database**: ~5 MB (2,500 airports + metadata)

## Testing

Run tests:

```bash
npm test tests/airportLookup.test.js
```

Tests include:
- Query normalization
- Cache key generation
- Confidence calculation
- Result formatting
- Match selection logic
- Fallback behavior
- Backward compatibility
- Input validation

## Maintenance

### Update Airport Data

Re-run the seed script to refresh airport data:

```bash
node src/db/seedAirports.js
```

The script uses `ON CONFLICT` clauses to safely update existing data.

### Add Custom Aliases

```sql
-- Add alias for an airport
INSERT INTO airport_aliases (airport_id, alias, alias_type, confidence)
SELECT id, 'Pearson', 'common_name', 0.95
FROM airports
WHERE iata_code = 'YYZ';
```

### Add Custom Metro Area

```sql
-- Add new metro area
INSERT INTO metro_areas (iata_code, name, country, country_code)
VALUES ('SEL', 'Seoul', 'South Korea', 'KR');

-- Associate airports
INSERT INTO airport_metro_associations (airport_id, metro_id, is_primary)
SELECT a.id, m.id, true
FROM airports a, metro_areas m
WHERE a.iata_code = 'ICN' AND m.iata_code = 'SEL';
```

### Clear Old Cache Entries

```bash
curl -X DELETE "http://localhost:3000/airports/cache/db?olderThanDays=30"
```

## Migration from airportResolverService

The new service is backward compatible. To migrate:

### Option 1: Replace Everywhere (Recommended)

```javascript
// Before
const airportResolver = require('./services/airportResolverService');
const code = airportResolver.resolveAirportCode('Toronto');

// After
const airportLookup = require('./services/airportLookupService');
const code = await airportLookup.resolveAirportCode('Toronto'); // Note: now async
```

### Option 2: Gradual Migration

Keep both services and use new one where needed:

```javascript
const airportLookup = require('./services/airportLookupService');

// Use advanced features
const result = await airportLookup.lookup('Toronto', {
  preferMetro: true,
  fuzzy: true
});

if (result.alternatives) {
  // Handle disambiguation
}
```

## Troubleshooting

### Database Connection Issues

```bash
# Check database connection
node -e "require('./src/db').testConnection()"

# Verify tables exist
psql $DATABASE_URL -c "\dt"
```

### Migration Fails

```bash
# Check migration files
ls src/db/migrations/

# Run migrations manually
node -e "require('./src/db').runMigrations()"
```

### Seed Script Fails

```bash
# Check network access to OurAirports.com
curl -I https://davidmegginson.github.io/ourairports-data/airports.csv

# Run with more verbose output
node src/db/seedAirports.js
```

### Low Hit Rate

```bash
# Check cache statistics
curl http://localhost:3000/airports/stats

# Clear and rebuild cache
curl -X POST http://localhost:3000/airports/cache/clear
```

## Future Enhancements

Potential improvements:

- [ ] Add support for ICAO codes (4-letter codes)
- [ ] Integrate with Duffel Places API for live lookups
- [ ] Add multi-language support (airport names in local languages)
- [ ] Add airport amenities and services metadata
- [ ] Implement ML-based query understanding
- [ ] Add geolocation-based suggestions
- [ ] Cache in Redis for distributed systems
- [ ] Add airport popularity rankings
- [ ] Support for train stations and ferry terminals

## Credits

- **Airport Data**: [OurAirports.com](https://ourairports.com/) (Public Domain)
- **Fuzzy Matching**: PostgreSQL pg_trgm extension
- **Original Service**: airportResolverService.js

## License

Part of otherwhere-backend. All rights reserved.
