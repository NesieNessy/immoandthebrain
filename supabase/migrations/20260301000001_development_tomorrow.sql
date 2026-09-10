-- ==============================================================================
-- ImmoAndTheBrain – CREATE TABLE: development_tomorrow
-- Depends on: property, tenancy, city, legal_requirements, rent_index, financing
-- ==============================================================================

CREATE TABLE IF NOT EXISTS development_tomorrow (
    development_tomorrow_id             SERIAL                      PRIMARY KEY,
    property_id                         INT                         NOT NULL REFERENCES property(property_id) ON DELETE CASCADE,
    tenancy_id                          INT                         REFERENCES tenancy(tenancy_id) ON DELETE SET NULL,
    city_id                             INT                         REFERENCES city(city_id) ON DELETE RESTRICT,
    legal_requirements_id               INT                         REFERENCES legal_requirements(legal_requirements_id) ON DELETE SET NULL,
    rent_index_id                       INT                         REFERENCES rent_index(rent_index_id) ON DELETE SET NULL,
    financing_id                        INT                         REFERENCES financing(financing_id) ON DELETE SET NULL,

    development_year                    INT,
    year_start                          INT,
    date_start                          INT,
    metropolitan_area                   BOOLEAN,

    cold_rent_increase                  NUMERIC(10, 2),
    cold_rent_increase_eligible         BOOLEAN,
    cold_rent_increase_lock_period      NUMERIC(6, 2),
    cold_rent_increase_reminder         BOOLEAN,
    cold_rent_increase_percent          NUMERIC(6, 4),
    cold_rent_increase_3year_average_percent NUMERIC(6, 4),

    last_rent_increase                  NUMERIC(10, 2),
    last_rent_increase_relevance        BOOLEAN,
    last_rent_increase_value            NUMERIC(10, 2),
    last_rent_increase_percent          NUMERIC(6, 4),

    created_at                          TIMESTAMP WITH TIME ZONE    DEFAULT NOW(),
    updated_at                          TIMESTAMP WITH TIME ZONE    DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_development_tomorrow_property_id ON development_tomorrow (property_id);
CREATE INDEX IF NOT EXISTS idx_development_tomorrow_tenancy_id  ON development_tomorrow (tenancy_id);

COMMENT ON TABLE  development_tomorrow                          IS 'Input parameters for future rent development scenarios.';
COMMENT ON COLUMN development_tomorrow.cold_rent_increase_3year_average_percent IS 'Average rent increase over 3 years as required by §558 BGB.';

ALTER TABLE development_tomorrow ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own development tomorrow"
    ON development_tomorrow FOR SELECT
    USING (EXISTS (SELECT 1 FROM property WHERE property.property_id = development_tomorrow.property_id AND property.user_id = auth.uid()));

CREATE POLICY "Users can insert own development tomorrow"
    ON development_tomorrow FOR INSERT
    WITH CHECK (EXISTS (SELECT 1 FROM property WHERE property.property_id = development_tomorrow.property_id AND property.user_id = auth.uid()));

CREATE POLICY "Users can update own development tomorrow"
    ON development_tomorrow FOR UPDATE
    USING (EXISTS (SELECT 1 FROM property WHERE property.property_id = development_tomorrow.property_id AND property.user_id = auth.uid()));

CREATE POLICY "Users can delete own development tomorrow"
    ON development_tomorrow FOR DELETE
    USING (EXISTS (SELECT 1 FROM property WHERE property.property_id = development_tomorrow.property_id AND property.user_id = auth.uid()));

CREATE OR REPLACE FUNCTION update_development_tomorrow_updated_at()
RETURNS TRIGGER AS $$ BEGIN NEW.updated_at = NOW(); RETURN NEW; END; $$ LANGUAGE plpgsql;
CREATE TRIGGER development_tomorrow_updated_at BEFORE UPDATE ON development_tomorrow FOR EACH ROW EXECUTE FUNCTION update_development_tomorrow_updated_at();
