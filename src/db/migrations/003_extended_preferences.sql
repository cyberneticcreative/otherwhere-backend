-- Extended User Preferences
-- Created: 2025-11-26
-- Purpose: Support fluid conversation preferences (airline, airports, timing, etc.)

-- Add new preference columns to user_preferences table
ALTER TABLE user_preferences
ADD COLUMN IF NOT EXISTS preferred_airlines TEXT[], -- Array of airline names/codes
ADD COLUMN IF NOT EXISTS avoided_airlines TEXT[], -- Airlines to avoid
ADD COLUMN IF NOT EXISTS preferred_airports TEXT[], -- Preferred departure airports (IATA codes)
ADD COLUMN IF NOT EXISTS avoided_airports TEXT[], -- Airports to avoid
ADD COLUMN IF NOT EXISTS departure_time_preference VARCHAR(20), -- morning, afternoon, evening, no_red_eye
ADD COLUMN IF NOT EXISTS max_stops INTEGER, -- 0 = direct only, 1 = one stop max, null = any
ADD COLUMN IF NOT EXISTS connection_preference VARCHAR(20), -- short, any
ADD COLUMN IF NOT EXISTS budget_flexibility VARCHAR(20); -- strict, flexible, unlimited

-- Comments for documentation
COMMENT ON COLUMN user_preferences.preferred_airlines IS 'Array of preferred airline names (e.g., ["United Airlines", "Delta Air Lines"])';
COMMENT ON COLUMN user_preferences.avoided_airlines IS 'Array of airlines to avoid (e.g., ["Spirit Airlines"])';
COMMENT ON COLUMN user_preferences.preferred_airports IS 'Preferred departure airports as IATA codes (e.g., ["JFK", "EWR"])';
COMMENT ON COLUMN user_preferences.avoided_airports IS 'Airports to avoid as IATA codes (e.g., ["LAX"])';
COMMENT ON COLUMN user_preferences.departure_time_preference IS 'Preferred departure time: morning, afternoon, evening, no_red_eye';
COMMENT ON COLUMN user_preferences.max_stops IS 'Maximum number of stops (0=direct, 1=one stop, null=any)';
COMMENT ON COLUMN user_preferences.connection_preference IS 'Connection preference: short (minimize layovers), any';
COMMENT ON COLUMN user_preferences.budget_flexibility IS 'Budget approach: strict, flexible, unlimited';
