-- Otherwhere Database Schema
-- Created: 2025-11-06
-- Purpose: Track SMS conversations, Duffel Links sessions, and bookings

-- Track SMS conversations
CREATE TABLE IF NOT EXISTS conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  phone VARCHAR(20) NOT NULL,
  intent VARCHAR(50), -- 'browse' or 'book_for_me'
  search_params JSONB, -- {origin, destination, dates, passengers}
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Track Duffel Links sessions sent to users
CREATE TABLE IF NOT EXISTS link_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID REFERENCES conversations(id),
  duffel_session_id VARCHAR(255) UNIQUE NOT NULL,
  session_url TEXT NOT NULL,
  expires_at TIMESTAMP,
  status VARCHAR(20) DEFAULT 'sent', -- 'sent', 'opened', 'completed', 'expired'
  search_params JSONB, -- Store what user searched for
  created_at TIMESTAMP DEFAULT NOW()
);

-- Track completed bookings from Duffel
CREATE TABLE IF NOT EXISTS bookings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  link_session_id UUID REFERENCES link_sessions(id),
  conversation_id UUID REFERENCES conversations(id),
  duffel_order_id VARCHAR(255) UNIQUE NOT NULL,
  booking_reference VARCHAR(10) NOT NULL, -- 6-char PNR
  passenger_name VARCHAR(255),
  origin VARCHAR(10),
  destination VARCHAR(10),
  departure_date DATE,
  total_paid DECIMAL(10,2),
  currency VARCHAR(3) DEFAULT 'USD',
  ticket_numbers TEXT[],
  status VARCHAR(20) DEFAULT 'confirmed', -- 'confirmed', 'cancelled'
  order_data JSONB, -- Full Duffel order response
  created_at TIMESTAMP DEFAULT NOW()
);

-- Event log for debugging
CREATE TABLE IF NOT EXISTS event_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type VARCHAR(50) NOT NULL, -- 'link_created', 'booking_completed', etc
  entity_type VARCHAR(50), -- 'conversation', 'booking'
  entity_id UUID,
  payload JSONB,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_conversations_phone ON conversations(phone);
CREATE INDEX IF NOT EXISTS idx_link_sessions_duffel_id ON link_sessions(duffel_session_id);
CREATE INDEX IF NOT EXISTS idx_link_sessions_conversation ON link_sessions(conversation_id);
CREATE INDEX IF NOT EXISTS idx_bookings_duffel_order ON bookings(duffel_order_id);
CREATE INDEX IF NOT EXISTS idx_bookings_conversation ON bookings(conversation_id);
CREATE INDEX IF NOT EXISTS idx_event_logs_created ON event_logs(created_at DESC);

-- Comments for documentation
COMMENT ON TABLE conversations IS 'SMS/Voice conversation sessions with users';
COMMENT ON TABLE link_sessions IS 'Duffel Links v2 sessions created for users';
COMMENT ON TABLE bookings IS 'Completed flight bookings from Duffel webhooks';
COMMENT ON TABLE event_logs IS 'Audit trail of all system events';
