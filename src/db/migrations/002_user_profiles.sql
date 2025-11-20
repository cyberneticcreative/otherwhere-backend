-- User Profiles, Loyalty Programs, and Preferences
-- Created: 2025-11-20
-- Purpose: Store persistent user profile data for Softr integration

-- Core user profiles table
CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  phone_number VARCHAR(20) UNIQUE NOT NULL,
  first_name VARCHAR(100),
  last_name VARCHAR(100),
  date_of_birth DATE,
  nationality VARCHAR(2), -- ISO 3166-1 alpha-2 country code
  gender VARCHAR(1), -- M/F/X
  known_traveler_number VARCHAR(50), -- TSA PreCheck, Global Entry, etc.
  passport_number VARCHAR(50),
  passport_expiry DATE,
  home_airport VARCHAR(3), -- IATA airport code
  onboarded_via VARCHAR(20), -- 'sms', 'voice', 'web'
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Airline loyalty programs
CREATE TABLE IF NOT EXISTS airline_loyalty_programs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  airline_name VARCHAR(100) NOT NULL, -- e.g., "United Airlines"
  program_name VARCHAR(100), -- e.g., "MileagePlus"
  program_number VARCHAR(100) NOT NULL,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Hotel loyalty programs
CREATE TABLE IF NOT EXISTS hotel_loyalty_programs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  hotel_chain VARCHAR(100) NOT NULL, -- e.g., "Marriott"
  program_name VARCHAR(100), -- e.g., "Bonvoy"
  program_number VARCHAR(100) NOT NULL,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- User travel preferences
CREATE TABLE IF NOT EXISTS user_preferences (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID UNIQUE NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  preferred_class VARCHAR(20), -- 'economy', 'premium_economy', 'business', 'first'
  travel_credit_cards TEXT[], -- Array of credit card names
  prioritize_card_benefits BOOLEAN DEFAULT false,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Link users to existing conversations table
-- This allows us to associate phone-based conversations with user profiles
ALTER TABLE conversations
ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES users(id);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_users_phone ON users(phone_number);
CREATE INDEX IF NOT EXISTS idx_airline_loyalty_user ON airline_loyalty_programs(user_id);
CREATE INDEX IF NOT EXISTS idx_hotel_loyalty_user ON hotel_loyalty_programs(user_id);
CREATE INDEX IF NOT EXISTS idx_user_preferences_user ON user_preferences(user_id);
CREATE INDEX IF NOT EXISTS idx_conversations_user ON conversations(user_id);

-- Comments for documentation
COMMENT ON TABLE users IS 'Core user profile data - phone number is universal ID';
COMMENT ON TABLE airline_loyalty_programs IS 'User airline loyalty/frequent flyer programs';
COMMENT ON TABLE hotel_loyalty_programs IS 'User hotel loyalty/rewards programs';
COMMENT ON TABLE user_preferences IS 'User travel preferences (class, credit cards, etc.)';
COMMENT ON COLUMN users.onboarded_via IS 'How user first signed up: sms, voice, or web';
COMMENT ON COLUMN user_preferences.preferred_class IS 'Preferred flight class: economy, premium_economy, business, first';
