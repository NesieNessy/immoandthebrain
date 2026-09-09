-- ==============================================================================
-- ImmoAndTheBrain – CREATE TABLE: acquisition_costs
-- Depends on: property (property_id), parking_space (parking_space_id)
-- ==============================================================================

CREATE TABLE IF NOT EXISTS acquisition_costs (
    acquisition_costs_id        SERIAL                      PRIMARY KEY,
    property_id                 INT                         NOT NULL REFERENCES property(property_id) ON DELETE CASCADE,
    parking_space_id            INT                         REFERENCES parking_space(parking_space_id) ON DELETE SET NULL,

    property_purchase_price     NUMERIC(14, 2)              NOT NULL,
    price_per_sqm               NUMERIC(10, 2),
    broker                      NUMERIC(6, 4),
    broker_value                NUMERIC(14, 2),
    notary                      NUMERIC(6, 4),
    notary_value                NUMERIC(14, 2),
    land_registry               NUMERIC(6, 4),
    land_registry_value         NUMERIC(14, 2),
    real_estate_tax             NUMERIC(6, 4),
    real_estate_tax_value       NUMERIC(14, 2),
    adjustment_variable         NUMERIC(14, 2),
    adjustment_variable_value   NUMERIC(14, 2),
    total_ancillary_costs_value NUMERIC(14, 2),
    total_ancillary_costs       NUMERIC(6, 4),
    parking_space_purchase_price NUMERIC(14, 2),

    created_at                  TIMESTAMP WITH TIME ZONE    DEFAULT NOW(),
    updated_at                  TIMESTAMP WITH TIME ZONE    DEFAULT NOW()
);

-- Index
CREATE INDEX IF NOT EXISTS idx_acquisition_costs_property_id ON acquisition_costs (property_id);

-- Comment
COMMENT ON TABLE acquisition_costs IS '1:n with property. Stores all purchase-related costs (Kaufkosten).';

-- Row Level Security
ALTER TABLE acquisition_costs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own acquisition costs"
    ON acquisition_costs FOR SELECT
    USING (EXISTS (SELECT 1 FROM property WHERE property.property_id = acquisition_costs.property_id AND property.user_id = auth.uid()));

CREATE POLICY "Users can insert own acquisition costs"
    ON acquisition_costs FOR INSERT
    WITH CHECK (EXISTS (SELECT 1 FROM property WHERE property.property_id = acquisition_costs.property_id AND property.user_id = auth.uid()));

CREATE POLICY "Users can update own acquisition costs"
    ON acquisition_costs FOR UPDATE
    USING (EXISTS (SELECT 1 FROM property WHERE property.property_id = acquisition_costs.property_id AND property.user_id = auth.uid()));

CREATE POLICY "Users can delete own acquisition costs"
    ON acquisition_costs FOR DELETE
    USING (EXISTS (SELECT 1 FROM property WHERE property.property_id = acquisition_costs.property_id AND property.user_id = auth.uid()));

-- Auto-update updated_at
CREATE OR REPLACE FUNCTION update_acquisition_costs_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER acquisition_costs_updated_at
    BEFORE UPDATE ON acquisition_costs
    FOR EACH ROW EXECUTE FUNCTION update_acquisition_costs_updated_at();
