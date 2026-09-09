-- ==============================================================================
-- ImmoAndTheBrain – CREATE TABLE: city
-- Reference / lookup table — not user-owned.
-- All authenticated users can read; only admins/service role can write.
-- ==============================================================================


CREATE TYPE market_tier_type AS ENUM ('A', 'B', 'C', 'D');

CREATE TABLE IF NOT EXISTS city (
    city_id             SERIAL                      PRIMARY KEY,

    city_name           VARCHAR(100)                NOT NULL,
    building_share      NUMERIC(3, 2)               NOT NULL CHECK (building_share BETWEEN 0 AND 1),
    land_share          NUMERIC(3, 2)               NOT NULL CHECK (land_share BETWEEN 0 AND 1),
    population          INTEGER                     NOT NULL,
    market_tier         market_tier_type            NOT NULL,
    designation         VARCHAR(150)                NOT NULL,

    created_at          TIMESTAMP WITH TIME ZONE    DEFAULT NOW(),
    updated_at          TIMESTAMP WITH TIME ZONE    DEFAULT NOW(),

    -- building_share + land_share must equal 1
    CONSTRAINT chk_city_shares CHECK (
    ROUND(building_share + land_share, 2) = 1.00
    )
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_city_name              ON city (city_name);

-- Enable Row Level Security
ALTER TABLE city ENABLE ROW LEVEL SECURITY;

-- All authenticated users can read city data
CREATE POLICY "Authenticated users can view cities"
    ON city FOR SELECT
    USING (auth.role() = 'authenticated');

-- Only service role / admin can insert, update, delete
-- (managed via Supabase dashboard or migrations — no user-facing write policies)

-- Auto-update updated_at on changes
CREATE OR REPLACE FUNCTION update_city_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER city_updated_at
    BEFORE UPDATE ON city
    FOR EACH ROW EXECUTE FUNCTION update_city_updated_at();
