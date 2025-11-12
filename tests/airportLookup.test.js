/**
 * Airport Lookup Service Tests
 *
 * Tests for the production-ready airport lookup layer
 */

const airportLookupService = require('../src/services/airportLookupService');
const db = require('../src/db');

// Mock database if not available
jest.mock('../src/db', () => ({
  query: jest.fn(),
  pool: {
    connect: jest.fn()
  }
}));

describe('AirportLookupService', () => {
  beforeEach(() => {
    // Clear memory cache before each test
    airportLookupService.clearCache();
    jest.clearAllMocks();
  });

  describe('normalizeQuery', () => {
    test('should remove " city" suffix', () => {
      const normalized = airportLookupService.normalizeQuery('New York City');
      expect(normalized).toBe('new york');
    });

    test('should remove " airport" suffix', () => {
      const normalized = airportLookupService.normalizeQuery('Toronto Airport');
      expect(normalized).toBe('toronto');
    });

    test('should lowercase and trim', () => {
      const normalized = airportLookupService.normalizeQuery('  LONDON  ');
      expect(normalized).toBe('london');
    });

    test('should remove "the" prefix', () => {
      const normalized = airportLookupService.normalizeQuery('the Hague');
      expect(normalized).toBe('hague');
    });
  });

  describe('getCacheKey', () => {
    test('should generate unique keys for different preferences', () => {
      const key1 = airportLookupService.getCacheKey('toronto', true);
      const key2 = airportLookupService.getCacheKey('toronto', false);
      expect(key1).not.toBe(key2);
      expect(key1).toBe('toronto:metro');
      expect(key2).toBe('toronto:airport');
    });
  });

  describe('calculateConfidence', () => {
    test('should return confidence between 0 and 1', () => {
      const conf1 = airportLookupService.calculateConfidence(0.5);
      const conf2 = airportLookupService.calculateConfidence(0.9);
      expect(conf1).toBeGreaterThan(0);
      expect(conf1).toBeLessThanOrEqual(1);
      expect(conf2).toBeGreaterThan(conf1);
    });

    test('should never exceed 1.0', () => {
      const conf = airportLookupService.calculateConfidence(0.99);
      expect(conf).toBeLessThanOrEqual(1.0);
    });
  });

  describe('formatAirportResult', () => {
    test('should format airport result correctly', () => {
      const row = {
        iata_code: 'YYZ',
        icao_code: 'CYYZ',
        name: 'Toronto Pearson International Airport',
        city: 'Toronto',
        country: 'Canada',
        country_code: 'CA',
        latitude: 43.6772,
        longitude: -79.6306,
        timezone: 'America/Toronto',
        airport_type: 'large_airport',
        passenger_count: 50000000
      };

      const result = airportLookupService.formatAirportResult(row, 0.95);

      expect(result).toEqual({
        type: 'airport',
        iataCode: 'YYZ',
        icaoCode: 'CYYZ',
        name: 'Toronto Pearson International Airport',
        city: 'Toronto',
        country: 'Canada',
        countryCode: 'CA',
        latitude: 43.6772,
        longitude: -79.6306,
        timezone: 'America/Toronto',
        airportType: 'large_airport',
        passengerCount: 50000000,
        confidence: 0.95
      });
    });
  });

  describe('formatMetroResult', () => {
    test('should format metro result correctly', () => {
      const row = {
        iata_code: 'NYC',
        name: 'New York City',
        country: 'United States',
        country_code: 'US',
        latitude: 40.7128,
        longitude: -74.0060,
        timezone: 'America/New_York',
        airport_codes: ['JFK', 'LGA', 'EWR']
      };

      const result = airportLookupService.formatMetroResult(row, 1.0);

      expect(result).toEqual({
        type: 'metro',
        iataCode: 'NYC',
        name: 'New York City',
        city: 'New York City',
        country: 'United States',
        countryCode: 'US',
        latitude: 40.7128,
        longitude: -74.0060,
        timezone: 'America/New_York',
        airportCodes: ['JFK', 'LGA', 'EWR'],
        confidence: 1.0
      });
    });
  });

  describe('selectBestMatch', () => {
    test('should return null for empty matches', () => {
      const result = airportLookupService.selectBestMatch([], 'test');
      expect(result).toBeNull();
    });

    test('should return single match', () => {
      const matches = [{
        iataCode: 'YYZ',
        name: 'Toronto Pearson',
        confidence: 1.0
      }];
      const result = airportLookupService.selectBestMatch(matches, 'toronto');
      expect(result.iataCode).toBe('YYZ');
    });

    test('should prefer metro over airport with same confidence', () => {
      const matches = [
        { type: 'airport', iataCode: 'YYZ', name: 'Pearson', confidence: 0.9, passengerCount: 50000000 },
        { type: 'metro', iataCode: 'YTO', name: 'Toronto', confidence: 0.9, passengerCount: null }
      ];
      const result = airportLookupService.selectBestMatch(matches, 'toronto');
      expect(result.type).toBe('metro');
      expect(result.iataCode).toBe('YTO');
    });

    test('should prefer higher confidence', () => {
      const matches = [
        { type: 'airport', iataCode: 'YYZ', name: 'Pearson', confidence: 0.9 },
        { type: 'airport', iataCode: 'LAX', name: 'LA', confidence: 0.5 }
      ];
      const result = airportLookupService.selectBestMatch(matches, 'toronto');
      expect(result.iataCode).toBe('YYZ');
    });

    test('should include alternatives for similar confidence', () => {
      const matches = [
        { type: 'airport', iataCode: 'JFK', name: 'JFK', city: 'New York', country: 'USA', confidence: 0.95 },
        { type: 'airport', iataCode: 'LGA', name: 'LaGuardia', city: 'New York', country: 'USA', confidence: 0.93 },
        { type: 'airport', iataCode: 'EWR', name: 'Newark', city: 'Newark', country: 'USA', confidence: 0.92 }
      ];
      const result = airportLookupService.selectBestMatch(matches, 'new york');
      expect(result.iataCode).toBe('JFK');
      expect(result.alternatives).toBeDefined();
      expect(result.alternatives.length).toBeGreaterThan(0);
    });
  });

  describe('fallbackLookup', () => {
    test('should fallback to hardcoded resolver for known cities', () => {
      const result = airportLookupService.fallbackLookup('Toronto', true);
      expect(result).not.toBeNull();
      expect(result.iataCode).toBe('YYZ');
      expect(result.source).toBe('fallback');
      expect(result.confidence).toBeGreaterThan(0);
    });

    test('should fallback for 3-letter codes', () => {
      const result = airportLookupService.fallbackLookup('LAX', false);
      expect(result).not.toBeNull();
      expect(result.iataCode).toBe('LAX');
    });

    test('should return null for unknown locations', () => {
      const result = airportLookupService.fallbackLookup('UnknownCityXYZ123', true);
      expect(result).toBeNull();
    });
  });

  describe('memory cache', () => {
    test('should add to memory cache', () => {
      const key = 'test:metro';
      const value = { iataCode: 'YYZ', confidence: 1.0 };

      airportLookupService.addToMemoryCache(key, value);

      // Check cache size
      const stats = airportLookupService.getStats();
      expect(stats.cacheSize).toBe(1);
    });

    test('should respect MAX_CACHE_SIZE', () => {
      const maxSize = airportLookupService.MAX_CACHE_SIZE;

      // Add more than max size
      for (let i = 0; i < maxSize + 10; i++) {
        airportLookupService.addToMemoryCache(`key${i}:metro`, { iataCode: 'YYZ' });
      }

      const stats = airportLookupService.getStats();
      expect(stats.cacheSize).toBeLessThanOrEqual(maxSize);
    });

    test('should clear cache', () => {
      airportLookupService.addToMemoryCache('test:metro', { iataCode: 'YYZ' });
      expect(airportLookupService.getStats().cacheSize).toBe(1);

      airportLookupService.clearCache();
      expect(airportLookupService.getStats().cacheSize).toBe(0);
    });
  });

  describe('getStats', () => {
    test('should return statistics object', () => {
      const stats = airportLookupService.getStats();

      expect(stats).toHaveProperty('hits');
      expect(stats.hits).toHaveProperty('memory');
      expect(stats.hits).toHaveProperty('db');
      expect(stats.hits).toHaveProperty('api');
      expect(stats.hits).toHaveProperty('fallback');
      expect(stats).toHaveProperty('misses');
      expect(stats).toHaveProperty('errors');
      expect(stats).toHaveProperty('cacheSize');
      expect(stats).toHaveProperty('hitRate');
    });

    test('should calculate hit rate correctly', () => {
      const stats = airportLookupService.getStats();
      expect(stats.hitRate).toMatch(/^\d+(\.\d+)?%$/);
    });
  });

  describe('backward compatibility', () => {
    test('resolveAirportCode should return IATA code string', async () => {
      // Mock successful lookup
      const mockResult = { iataCode: 'YYZ', type: 'airport' };

      // Mock the lookup method
      jest.spyOn(airportLookupService, 'lookup').mockResolvedValue(mockResult);

      const code = await airportLookupService.resolveAirportCode('Toronto');
      expect(code).toBe('YYZ');
      expect(typeof code).toBe('string');
    });

    test('getAirportInfo should return airport object', async () => {
      const mockResult = {
        iataCode: 'YYZ',
        name: 'Toronto Pearson',
        city: 'Toronto',
        country: 'Canada',
        type: 'airport'
      };

      jest.spyOn(airportLookupService, 'lookup').mockResolvedValue(mockResult);

      const info = await airportLookupService.getAirportInfo('Toronto');
      expect(info).toHaveProperty('code', 'YYZ');
      expect(info).toHaveProperty('name');
      expect(info).toHaveProperty('city');
      expect(info).toHaveProperty('country');
    });

    test('getAirportInfo should return null on error', async () => {
      jest.spyOn(airportLookupService, 'lookup').mockRejectedValue(new Error('Not found'));

      const info = await airportLookupService.getAirportInfo('UnknownXYZ');
      expect(info).toBeNull();
    });

    test('canResolve should return boolean', async () => {
      jest.spyOn(airportLookupService, 'lookup').mockResolvedValue({ iataCode: 'YYZ' });

      const canResolve = await airportLookupService.canResolve('Toronto');
      expect(typeof canResolve).toBe('boolean');
      expect(canResolve).toBe(true);
    });

    test('canResolve should return false for unresolvable locations', async () => {
      jest.spyOn(airportLookupService, 'lookup').mockRejectedValue(new Error('Not found'));

      const canResolve = await airportLookupService.canResolve('UnknownXYZ');
      expect(canResolve).toBe(false);
    });
  });

  describe('lookup method validation', () => {
    test('should throw error for empty query', async () => {
      await expect(airportLookupService.lookup('')).rejects.toThrow();
    });

    test('should throw error for null query', async () => {
      await expect(airportLookupService.lookup(null)).rejects.toThrow();
    });

    test('should throw error for non-string query', async () => {
      await expect(airportLookupService.lookup(123)).rejects.toThrow();
    });

    test('should accept valid options', async () => {
      // Mock successful lookup
      jest.spyOn(airportLookupService, 'performDatabaseLookup').mockResolvedValue({
        iataCode: 'YYZ',
        type: 'airport'
      });

      const result = await airportLookupService.lookup('Toronto', {
        preferMetro: false,
        fuzzy: false,
        maxResults: 10
      });

      expect(result).toBeDefined();
    });
  });
});

describe('Integration Tests (require database)', () => {
  // These tests require a real database connection
  // Skip if DATABASE_URL is not set

  const skipIfNoDb = () => {
    if (!process.env.DATABASE_URL) {
      return test.skip;
    }
    return test;
  };

  skipIfNoDb()('should find airport by exact IATA code', async () => {
    const result = await airportLookupService.lookup('YYZ');
    expect(result).toBeDefined();
    expect(result.iataCode).toBe('YYZ');
  });

  skipIfNoDb()('should find metro by city name', async () => {
    const result = await airportLookupService.lookup('New York', { preferMetro: true });
    expect(result).toBeDefined();
    expect(result.type).toBe('metro');
    expect(result.iataCode).toBe('NYC');
  });

  skipIfNoDb()('should handle fuzzy matching', async () => {
    const result = await airportLookupService.lookup('Tornto', { fuzzy: true });
    expect(result).toBeDefined();
    expect(result.city).toMatch(/Toronto/i);
  });
});
