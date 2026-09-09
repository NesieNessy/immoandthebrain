-- ==============================================================================
-- ImmoAndTheBrain – CREATE TABLE: legal_requirements
-- Depends on: city (city_id)
-- ==============================================================================

CREATE TABLE IF NOT EXISTS legal_requirements (
    legal_requirements_id   SERIAL                      PRIMARY KEY,
    city_id                 INT                         NOT NULL REFERENCES city(city_id) ON DELETE RESTRICT,

    rent_cap_limit          NUMERIC(10, 2),
    sqm_increase_low        NUMERIC(6, 4),
    sqm_increase_high       NUMERIC(6, 4),
    renovation_limit_percent NUMERIC(6, 4),
    valid_from              DATE                        NOT NULL,
    valid_until             DATE,

    created_at              TIMESTAMP WITH TIME ZONE    DEFAULT NOW(),
    updated_at              TIMESTAMP WITH TIME ZONE    DEFAULT NOW(),

    CONSTRAINT chk_legal_requirements_dates CHECK (valid_until IS NULL OR valid_until > valid_from)
);

CREATE INDEX IF NOT EXISTS idx_legal_requirements_city_id    ON legal_requirements (city_id);
CREATE INDEX IF NOT EXISTS idx_legal_requirements_valid_from ON legal_requirements (valid_from);

COMMENT ON TABLE  legal_requirements                      IS 'Versioned legal rent regulations per city (Mietrechtsvorschriften).';
COMMENT ON COLUMN legal_requirements.rent_cap_limit       IS 'Mietpreisbremse cap limit per sqm.';
COMMENT ON COLUMN legal_requirements.sqm_increase_low     IS 'Lower bound of allowed rent increase per sqm.';
COMMENT ON COLUMN legal_requirements.sqm_increase_high    IS 'Upper bound of allowed rent increase per sqm.';
COMMENT ON COLUMN legal_requirements.renovation_limit_percent IS 'Max % of renovation cost passable to tenant per §559 BGB.';

ALTER TABLE legal_requirements ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view legal requirements"
    ON legal_requirements FOR SELECT
    USING (auth.role() = 'authenticated');

CREATE OR REPLACE FUNCTION update_legal_requirements_updated_at()
RETURNS TRIGGER AS $$ BEGIN NEW.updated_at = NOW(); RETURN NEW; END; $$ LANGUAGE plpgsql;
CREATE TRIGGER legal_requirements_updated_at BEFORE UPDATE ON legal_requirements FOR EACH ROW EXECUTE FUNCTION update_legal_requirements_updated_at();
