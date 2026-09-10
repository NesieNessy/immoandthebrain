-- ==============================================================================
-- ImmoAndTheBrain – CREATE TABLE: depreciation
-- Merged from: Depreciation (AfA) + DepreciationCalculation (AfA)
-- Depends on: property (property_id), system_config (config_id)
-- ==============================================================================

CREATE TYPE residential_type AS ENUM (
    'NEW_BUILD',
    'EXISTING',
    'LISTED_BUILDING',
    'SOCIAL_HOUSING'
);

CREATE TABLE IF NOT EXISTS depreciation (
    depreciation_id             SERIAL                      PRIMARY KEY,
    property_id                 INT                         NOT NULL UNIQUE REFERENCES property(property_id) ON DELETE CASCADE,
    config_id                   INT                         REFERENCES system_config(config_id) ON DELETE SET NULL,

    -- From original Depreciation table
    depreciation_type           VARCHAR(50),
    depreciation_calculation    NUMERIC(10, 2),
    depreciation_year           INT,

    -- Merged from DepreciationCalculation
    residential_type            residential_type,
    roof_renewal                NUMERIC(6, 4),
    windows_exterior_doors      NUMERIC(6, 4),
    piping_systems              NUMERIC(6, 4),
    heating_system              NUMERIC(6, 4),
    exterior_wall_insulation    NUMERIC(6, 4),
    bathrooms                   NUMERIC(6, 4),
    interior_fitting            NUMERIC(6, 4),
    floorplan_improvement       NUMERIC(6, 4),
    modernisation_points        NUMERIC(6, 2),
    age                         NUMERIC(8, 2),
    total_useful_life           NUMERIC(8, 2),
    remaining_useful_life_years NUMERIC(8, 2),
    depreciation_rate_percent   NUMERIC(6, 4),

    created_at                  TIMESTAMP WITH TIME ZONE    DEFAULT NOW(),
    updated_at                  TIMESTAMP WITH TIME ZONE    DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_depreciation_property_id ON depreciation (property_id);

COMMENT ON TABLE  depreciation                          IS '1:1 with property. Merged AfA table — inputs and calculation parameters.';
COMMENT ON COLUMN depreciation.depreciation_rate_percent IS 'Annual AfA rate, e.g. 0.02 = 2%.';
COMMENT ON COLUMN depreciation.modernisation_points      IS 'Points-based modernisation score per §22 Abs. 3 ImmoWertV.';

ALTER TABLE depreciation ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own depreciation"
    ON depreciation FOR SELECT
    USING (EXISTS (SELECT 1 FROM property WHERE property.property_id = depreciation.property_id AND property.user_id = auth.uid()));

CREATE POLICY "Users can insert own depreciation"
    ON depreciation FOR INSERT
    WITH CHECK (EXISTS (SELECT 1 FROM property WHERE property.property_id = depreciation.property_id AND property.user_id = auth.uid()));

CREATE POLICY "Users can update own depreciation"
    ON depreciation FOR UPDATE
    USING (EXISTS (SELECT 1 FROM property WHERE property.property_id = depreciation.property_id AND property.user_id = auth.uid()));

CREATE POLICY "Users can delete own depreciation"
    ON depreciation FOR DELETE
    USING (EXISTS (SELECT 1 FROM property WHERE property.property_id = depreciation.property_id AND property.user_id = auth.uid()));

CREATE OR REPLACE FUNCTION update_depreciation_updated_at()
RETURNS TRIGGER AS $$ BEGIN NEW.updated_at = NOW(); RETURN NEW; END; $$ LANGUAGE plpgsql;
CREATE TRIGGER depreciation_updated_at BEFORE UPDATE ON depreciation FOR EACH ROW EXECUTE FUNCTION update_depreciation_updated_at();
