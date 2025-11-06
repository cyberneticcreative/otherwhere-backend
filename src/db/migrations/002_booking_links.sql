-- Add booking_links table for custom booking flow
-- Created: 2025-11-06
-- Purpose: Replace Duffel Links with custom booking links using Duffel Flights API

-- Create booking_links table
CREATE TABLE IF NOT EXISTS booking_links (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  token_jti VARCHAR(255) UNIQUE NOT NULL,
  offer_id VARCHAR(255) NOT NULL,
  account_id UUID,
  conversation_id UUID REFERENCES conversations(id),
  status VARCHAR(20) DEFAULT 'active', -- 'active', 'consumed', 'expired'
  offer_snapshot JSONB, -- Store offer details at link creation time
  created_at TIMESTAMP DEFAULT NOW(),
  expires_at TIMESTAMP NOT NULL
);

-- Add offer_snapshot to bookings table
ALTER TABLE bookings
  ADD COLUMN IF NOT EXISTS offer_snapshot JSONB,
  ADD COLUMN IF NOT EXISTS booking_link_id UUID REFERENCES booking_links(id);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_booking_links_token ON booking_links(token_jti);
CREATE INDEX IF NOT EXISTS idx_booking_links_conversation ON booking_links(conversation_id);
CREATE INDEX IF NOT EXISTS idx_booking_links_status ON booking_links(status);
CREATE INDEX IF NOT EXISTS idx_booking_links_expires ON booking_links(expires_at);

-- Comments for documentation
COMMENT ON TABLE booking_links IS 'Custom booking links using Duffel Flights API (replaces Links v2)';
COMMENT ON COLUMN booking_links.token_jti IS 'JWT ID (jti claim) for token replay protection';
COMMENT ON COLUMN booking_links.offer_id IS 'Duffel Offer ID from Flights API';
COMMENT ON COLUMN booking_links.offer_snapshot IS 'Cached offer details at link creation';
COMMENT ON COLUMN booking_links.status IS 'Link status: active, consumed (used once), or expired';
