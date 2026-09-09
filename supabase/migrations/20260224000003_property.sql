-- ==============================================================================
-- ImmoAndTheBrain – CREATE TABLE: property
-- Depends on: personal_data (user_id), city (city_id)
-- ==============================================================================

CREATE TYPE energy_efficiency_class AS ENUM (
    'A+',
    'A',
    'B',
    'C',
    'D',
    'E',
    'F',
    'G',
    'H'
);

CREATE TYPE property_condition AS ENUM (
    'Sanierungsbedürftig',
    'Standard',
    'Gehoben',
    'Luxus'
);

CREATE TABLE IF NOT EXISTS property (
    property_id             SERIAL                      PRIMARY KEY,
    user_id                 UUID                        NOT NULL REFERENCES personal_data(user_id) ON DELETE CASCADE,
    city_id                 INT                         NOT NULL REFERENCES city(city_id) ON DELETE RESTRICT,

    -- Identification
    property_abbreviation   VARCHAR(20)                 NOT NULL,

    -- Address
    street                  VARCHAR(100)                NOT NULL,
    house_number            VARCHAR(10)                 NOT NULL,
    city                    VARCHAR(100)                NOT NULL,
    postal_code             VARCHAR(10)                 NOT NULL,
    federal_state           VARCHAR(100)                NOT NULL,

    -- Property details
    square_meters           NUMERIC(10, 2)              NOT NULL CHECK (square_meters > 0),
    number_of_rooms         INT                         NOT NULL CHECK (number_of_rooms > 0),
    year_of_construction    INT                         NOT NULL CHECK (year_of_construction BETWEEN 1800 AND EXTRACT(YEAR FROM NOW())::INT),
    energy_efficient        energy_efficiency_class     NOT NULL,
    image_base64            TEXT,

    created_at              TIMESTAMP WITH TIME ZONE    DEFAULT NOW(),
    updated_at              TIMESTAMP WITH TIME ZONE    DEFAULT NOW(),

    -- Each user's property abbreviation must be unique
    CONSTRAINT uq_property_abbreviation_user UNIQUE (user_id, property_abbreviation)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_property_user_id    ON property (user_id);
CREATE INDEX IF NOT EXISTS idx_property_city_id    ON property (city_id);
CREATE INDEX IF NOT EXISTS idx_property_postal     ON property (postal_code);

-- Comments
COMMENT ON TABLE  property                       IS 'Core property master data. One user can own multiple properties (1:n with personal_data).';
COMMENT ON COLUMN property.property_abbreviation IS 'Short user-defined label, e.g. "MUC-01". Unique per user.';
COMMENT ON COLUMN property.square_meters         IS 'Living area in square metres (m²).';
COMMENT ON COLUMN property.energy_efficient      IS 'German energy efficiency class: A+ (best) → H (worst).';
COMMENT ON COLUMN property.year_of_construction  IS 'Must be between 1800 and the current year.';

-- Enable Row Level Security
ALTER TABLE property ENABLE ROW LEVEL SECURITY;

-- Users can only read their own properties
CREATE POLICY "Users can view own properties"
    ON property FOR SELECT
    USING (auth.uid() = user_id);

-- Users can insert their own properties
CREATE POLICY "Users can insert own properties"
    ON property FOR INSERT
    WITH CHECK (auth.uid() = user_id);

-- Users can update their own properties
CREATE POLICY "Users can update own properties"
    ON property FOR UPDATE
    USING (auth.uid() = user_id);

-- Users can delete their own properties
CREATE POLICY "Users can delete own properties"
    ON property FOR DELETE
    USING (auth.uid() = user_id);

-- Auto-update updated_at on changes
CREATE OR REPLACE FUNCTION update_property_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER property_updated_at
    BEFORE UPDATE ON property
    FOR EACH ROW EXECUTE FUNCTION update_property_updated_at();