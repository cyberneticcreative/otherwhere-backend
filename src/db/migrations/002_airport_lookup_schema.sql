-- Airport Lookup Layer Schema
-- Created: 2025-11-12
-- Purpose: Production-ready airport and metro area lookup with fuzzy matching

-- Enable PostgreSQL trigram extension for fuzzy text search
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- Metro areas (city codes) table
-- Represents IATA city/metro codes that group multiple airports
-- Examples: NYC (JFK, LGA, EWR), LON (LHR, LGW, STN, LTN, LCY), TYO (NRT, HND)
CREATE TABLE IF NOT EXISTS metro_areas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  iata_code VARCHAR(3) UNIQUE NOT NULL, -- e.g., 'NYC', 'LON', 'TYO'
  name VARCHAR(255) NOT NULL, -- e.g., 'New York City', 'London', 'Tokyo'
  country VARCHAR(100) NOT NULL,
  country_code CHAR(2), -- ISO 3166-1 alpha-2
  timezone VARCHAR(50),
  latitude DECIMAL(10, 6),
  longitude DECIMAL(10, 6),
  search_text TEXT, -- Preprocessed searchable text (lowercase, normalized)
  metadata JSONB, -- Additional data (population, region, etc.)
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Individual airports table
CREATE TABLE IF NOT EXISTS airports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  iata_code VARCHAR(3) UNIQUE NOT NULL, -- e.g., 'JFK', 'LHR', 'YYZ'
  icao_code VARCHAR(4), -- e.g., 'KJFK', 'EGLL', 'CYYZ'
  name VARCHAR(255) NOT NULL, -- e.g., 'John F. Kennedy International Airport'
  city VARCHAR(100) NOT NULL, -- e.g., 'New York'
  country VARCHAR(100) NOT NULL,
  country_code CHAR(2), -- ISO 3166-1 alpha-2
  latitude DECIMAL(10, 6),
  longitude DECIMAL(10, 6),
  timezone VARCHAR(50),
  airport_type VARCHAR(20), -- 'large_airport', 'medium_airport', 'small_airport'
  is_active BOOLEAN DEFAULT true, -- Whether airport is currently operational
  passenger_count INT, -- Annual passenger volume (for ranking)
  search_text TEXT, -- Preprocessed searchable text (lowercase, normalized)
  metadata JSONB, -- Additional data (terminals, airlines, etc.)
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Many-to-many: airports belong to metro areas
-- Example: JFK, LGA, EWR all belong to NYC metro area
CREATE TABLE IF NOT EXISTS airport_metro_associations (
  airport_id UUID REFERENCES airports(id) ON DELETE CASCADE,
  metro_id UUID REFERENCES metro_areas(id) ON DELETE CASCADE,
  is_primary BOOLEAN DEFAULT false, -- Primary airport for the metro (e.g., JFK for NYC)
  created_at TIMESTAMP DEFAULT NOW(),
  PRIMARY KEY (airport_id, metro_id)
);

-- Airport aliases for fuzzy matching
-- Stores common alternative names, typos, and variations
CREATE TABLE IF NOT EXISTS airport_aliases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  airport_id UUID REFERENCES airports(id) ON DELETE CASCADE,
  alias VARCHAR(255) NOT NULL,
  alias_type VARCHAR(50), -- 'common_name', 'abbreviation', 'typo', 'local_name'
  language CHAR(2), -- ISO 639-1 language code
  search_text TEXT, -- Normalized version for matching
  confidence DECIMAL(3, 2) DEFAULT 1.00, -- 0.00 to 1.00
  created_at TIMESTAMP DEFAULT NOW()
);

-- Lookup cache for performance optimization
-- Stores recent queries and their results with hit tracking
CREATE TABLE IF NOT EXISTS airport_lookup_cache (
  query VARCHAR(255) PRIMARY KEY,
  result_type VARCHAR(20) NOT NULL, -- 'airport', 'metro', 'ambiguous'
  result_iata VARCHAR(3), -- IATA code of resolved airport/metro
  result_id UUID, -- UUID of airport or metro area
  alternatives JSONB, -- Array of alternative matches for disambiguation
  confidence DECIMAL(3, 2), -- Match confidence (0.00 to 1.00)
  hit_count INT DEFAULT 1,
  last_accessed TIMESTAMP DEFAULT NOW(),
  created_at TIMESTAMP DEFAULT NOW()
);

-- Indexes for blazing fast lookups

-- Metro areas indexes
CREATE INDEX IF NOT EXISTS idx_metro_iata ON metro_areas(iata_code);
CREATE INDEX IF NOT EXISTS idx_metro_name ON metro_areas(LOWER(name));
CREATE INDEX IF NOT EXISTS idx_metro_country ON metro_areas(country_code);
CREATE INDEX IF NOT EXISTS idx_metro_search_trgm ON metro_areas USING gin(search_text gin_trgm_ops);

-- Airports indexes
CREATE INDEX IF NOT EXISTS idx_airports_iata ON airports(iata_code);
CREATE INDEX IF NOT EXISTS idx_airports_icao ON airports(icao_code);
CREATE INDEX IF NOT EXISTS idx_airports_city ON airports(LOWER(city));
CREATE INDEX IF NOT EXISTS idx_airports_name ON airports(LOWER(name));
CREATE INDEX IF NOT EXISTS idx_airports_country ON airports(country_code);
CREATE INDEX IF NOT EXISTS idx_airports_active ON airports(is_active) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_airports_type ON airports(airport_type);
CREATE INDEX IF NOT EXISTS idx_airports_search_trgm ON airports USING gin(search_text gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_airports_passenger_count ON airports(passenger_count DESC NULLS LAST);

-- Airport-metro associations indexes
CREATE INDEX IF NOT EXISTS idx_airport_metro_airport ON airport_metro_associations(airport_id);
CREATE INDEX IF NOT EXISTS idx_airport_metro_metro ON airport_metro_associations(metro_id);
CREATE INDEX IF NOT EXISTS idx_airport_metro_primary ON airport_metro_associations(metro_id, is_primary) WHERE is_primary = true;

-- Aliases indexes
CREATE INDEX IF NOT EXISTS idx_aliases_airport ON airport_aliases(airport_id);
CREATE INDEX IF NOT EXISTS idx_aliases_alias ON airport_aliases(LOWER(alias));
CREATE INDEX IF NOT EXISTS idx_aliases_search_trgm ON airport_aliases USING gin(search_text gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_aliases_type ON airport_aliases(alias_type);

-- Cache indexes
CREATE INDEX IF NOT EXISTS idx_cache_query ON airport_lookup_cache(query);
CREATE INDEX IF NOT EXISTS idx_cache_accessed ON airport_lookup_cache(last_accessed DESC);
CREATE INDEX IF NOT EXISTS idx_cache_hits ON airport_lookup_cache(hit_count DESC);

-- Functions for automatic search text generation
CREATE OR REPLACE FUNCTION update_airport_search_text()
RETURNS TRIGGER AS $$
BEGIN
  NEW.search_text := LOWER(
    COALESCE(NEW.iata_code, '') || ' ' ||
    COALESCE(NEW.icao_code, '') || ' ' ||
    COALESCE(NEW.name, '') || ' ' ||
    COALESCE(NEW.city, '') || ' ' ||
    COALESCE(NEW.country, '')
  );
  NEW.updated_at := NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION update_metro_search_text()
RETURNS TRIGGER AS $$
BEGIN
  NEW.search_text := LOWER(
    COALESCE(NEW.iata_code, '') || ' ' ||
    COALESCE(NEW.name, '') || ' ' ||
    COALESCE(NEW.country, '')
  );
  NEW.updated_at := NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION update_alias_search_text()
RETURNS TRIGGER AS $$
BEGIN
  NEW.search_text := LOWER(COALESCE(NEW.alias, ''));
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Triggers to automatically update search text
CREATE TRIGGER airports_search_text_trigger
  BEFORE INSERT OR UPDATE ON airports
  FOR EACH ROW
  EXECUTE FUNCTION update_airport_search_text();

CREATE TRIGGER metro_search_text_trigger
  BEFORE INSERT OR UPDATE ON metro_areas
  FOR EACH ROW
  EXECUTE FUNCTION update_metro_search_text();

CREATE TRIGGER alias_search_text_trigger
  BEFORE INSERT OR UPDATE ON airport_aliases
  FOR EACH ROW
  EXECUTE FUNCTION update_alias_search_text();

-- Function to update cache hit count
CREATE OR REPLACE FUNCTION increment_cache_hit()
RETURNS TRIGGER AS $$
BEGIN
  NEW.hit_count := OLD.hit_count + 1;
  NEW.last_accessed := NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Comments for documentation
COMMENT ON TABLE metro_areas IS 'IATA city/metro codes representing multiple airports (e.g., NYC, LON, TYO)';
COMMENT ON TABLE airports IS 'Individual airports with IATA/ICAO codes and metadata';
COMMENT ON TABLE airport_metro_associations IS 'Many-to-many relationship between airports and metro areas';
COMMENT ON TABLE airport_aliases IS 'Alternative names, spellings, and typos for fuzzy matching';
COMMENT ON TABLE airport_lookup_cache IS 'Performance cache for frequent queries with hit tracking';

COMMENT ON COLUMN metro_areas.search_text IS 'Auto-generated normalized text for fuzzy searching';
COMMENT ON COLUMN airports.search_text IS 'Auto-generated normalized text for fuzzy searching';
COMMENT ON COLUMN airports.passenger_count IS 'Annual passenger volume for ranking/disambiguation';
COMMENT ON COLUMN airport_metro_associations.is_primary IS 'Primary airport for metro area (e.g., JFK for NYC)';
COMMENT ON COLUMN airport_lookup_cache.alternatives IS 'JSON array of alternative matches for disambiguation';
