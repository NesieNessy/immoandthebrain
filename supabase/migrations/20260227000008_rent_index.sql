-- ==============================================================================
-- ImmoAndTheBrain – CREATE TABLE: rent_index
-- Depends on: city (city_id)
-- ==============================================================================

CREATE TYPE rent_index_methodology_enum AS ENUM (
    'QUALIFIED',
    'SIMPLE',
    'EMPIRICAL'
);

CREATE TABLE IF NOT EXISTS rent_index (
    rent_index_id   SERIAL                          PRIMARY KEY,
    city_id         INT                             NOT NULL REFERENCES city(city_id) ON DELETE RESTRICT,

    valid_from      DATE                            NOT NULL,
    valid_until     DATE,
    methodology     rent_index_methodology_enum     NOT NULL,
    reference_rents NUMERIC(10, 2)                  NOT NULL,

    created_at      TIMESTAMP WITH TIME ZONE        DEFAULT NOW(),
    updated_at      TIMESTAMP WITH TIME ZONE        DEFAULT NOW(),

    CONSTRAINT chk_rent_index_dates CHECK (valid_until IS NULL OR valid_until > valid_from)
);

CREATE INDEX IF NOT EXISTS idx_rent_index_city_id   ON rent_index (city_id);
CREATE INDEX IF NOT EXISTS idx_rent_index_valid_from ON rent_index (valid_from);

COMMENT ON TABLE  rent_index                  IS 'Mietspiegel — versioned rent index per city.';
COMMENT ON COLUMN rent_index.reference_rents  IS 'Reference rent per sqm in EUR.';
COMMENT ON COLUMN rent_index.valid_until      IS 'NULL = currently active index.';

ALTER TABLE rent_index ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view rent index"
    ON rent_index FOR SELECT
    USING (auth.role() = 'authenticated');


CREATE OR REPLACE FUNCTION update_rent_index_updated_at()
RETURNS TRIGGER AS $$ BEGIN NEW.updated_at = NOW(); RETURN NEW; END; $$ LANGUAGE plpgsql;
CREATE TRIGGER rent_index_updated_at BEFORE UPDATE ON rent_index FOR EACH ROW EXECUTE FUNCTION update_rent_index_updated_at();
