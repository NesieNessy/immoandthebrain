-- ==============================================================================
-- ImmoAndTheBrain – CREATE TABLE: building_proportion
-- Depends on: property (property_id), acquisition_costs (acquisition_costs_id)
-- ==============================================================================

CREATE TABLE IF NOT EXISTS building_proportion (
    building_proportion_id  SERIAL                      PRIMARY KEY,
    property_id             INT                         NOT NULL UNIQUE REFERENCES property(property_id) ON DELETE CASCADE,
    acquisition_costs_id    INT                         REFERENCES acquisition_costs(acquisition_costs_id) ON DELETE SET NULL,

    total_area              NUMERIC(10, 2),
    total_area_share        NUMERIC(6, 4),
    land_value              NUMERIC(14, 2),
    land_and_soil           NUMERIC(14, 2),
    building_factor         NUMERIC(8, 4),
    building_value          NUMERIC(14, 2),
    numerator               NUMERIC(10, 4),
    denominator             NUMERIC(10, 4),
    ancillary_cost_share    NUMERIC(6, 4),
    building_depreciation   NUMERIC(10, 2),

    created_at              TIMESTAMP WITH TIME ZONE    DEFAULT NOW(),
    updated_at              TIMESTAMP WITH TIME ZONE    DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_building_proportion_property_id ON building_proportion (property_id);

COMMENT ON TABLE  building_proportion                 IS '1:1 with property. Splits total value between land and building for tax depreciation.';
COMMENT ON COLUMN building_proportion.building_factor IS 'Ratio of building value to total property value.';

ALTER TABLE building_proportion ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own building proportion"
    ON building_proportion FOR SELECT
    USING (EXISTS (SELECT 1 FROM property WHERE property.property_id = building_proportion.property_id AND property.user_id = auth.uid()));

CREATE POLICY "Users can insert own building proportion"
    ON building_proportion FOR INSERT
    WITH CHECK (EXISTS (SELECT 1 FROM property WHERE property.property_id = building_proportion.property_id AND property.user_id = auth.uid()));

CREATE POLICY "Users can update own building proportion"
    ON building_proportion FOR UPDATE
    USING (EXISTS (SELECT 1 FROM property WHERE property.property_id = building_proportion.property_id AND property.user_id = auth.uid()));

CREATE POLICY "Users can delete own building proportion"
    ON building_proportion FOR DELETE
    USING (EXISTS (SELECT 1 FROM property WHERE property.property_id = building_proportion.property_id AND property.user_id = auth.uid()));

CREATE OR REPLACE FUNCTION update_building_proportion_updated_at()
RETURNS TRIGGER AS $$ BEGIN NEW.updated_at = NOW(); RETURN NEW; END; $$ LANGUAGE plpgsql;
CREATE TRIGGER building_proportion_updated_at BEFORE UPDATE ON building_proportion FOR EACH ROW EXECUTE FUNCTION update_building_proportion_updated_at();