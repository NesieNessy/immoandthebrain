-- ==============================================================================
-- ImmoAndTheBrain – CREATE TABLE: maintenance_costs
-- Depends on: property (property_id)
-- ==============================================================================

CREATE TABLE IF NOT EXISTS maintenance_costs (
    maintenance_costs_id        SERIAL                      PRIMARY KEY,
    property_id                 INT                         NOT NULL REFERENCES property(property_id) ON DELETE CASCADE,

    cost_breakdown              BOOLEAN                     NOT NULL DEFAULT FALSE,
    allocable_costs             NUMERIC(10, 2),
    non_allocable_costs         NUMERIC(10, 2),
    total_costs                 NUMERIC(10, 2),
    house_money                 NUMERIC(10, 2),
    allocable_costs_projection  BOOLEAN                     NOT NULL DEFAULT FALSE,
    non_allocable_costs_projection BOOLEAN                  NOT NULL DEFAULT FALSE,
    total_costs_projection      BOOLEAN                     NOT NULL DEFAULT FALSE,

    created_at                  TIMESTAMP WITH TIME ZONE    DEFAULT NOW(),
    updated_at                  TIMESTAMP WITH TIME ZONE    DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_maintenance_costs_property_id ON maintenance_costs (property_id);

COMMENT ON TABLE  maintenance_costs                          IS '1:n with property (Bewirtschaftungskosten).';
COMMENT ON COLUMN maintenance_costs.allocable_costs          IS 'Umlagefähige Kosten — passable to tenant.';
COMMENT ON COLUMN maintenance_costs.non_allocable_costs      IS 'Nicht-umlagefähige Kosten — borne by owner.';
COMMENT ON COLUMN maintenance_costs.house_money              IS 'Hausgeld paid to property management company.';

ALTER TABLE maintenance_costs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own maintenance costs"
    ON maintenance_costs FOR SELECT
    USING (EXISTS (SELECT 1 FROM property WHERE property.property_id = maintenance_costs.property_id AND property.user_id = auth.uid()));

CREATE POLICY "Users can insert own maintenance costs"
    ON maintenance_costs FOR INSERT
    WITH CHECK (EXISTS (SELECT 1 FROM property WHERE property.property_id = maintenance_costs.property_id AND property.user_id = auth.uid()));

CREATE POLICY "Users can update own maintenance costs"
    ON maintenance_costs FOR UPDATE
    USING (EXISTS (SELECT 1 FROM property WHERE property.property_id = maintenance_costs.property_id AND property.user_id = auth.uid()));

CREATE POLICY "Users can delete own maintenance costs"
    ON maintenance_costs FOR DELETE
    USING (EXISTS (SELECT 1 FROM property WHERE property.property_id = maintenance_costs.property_id AND property.user_id = auth.uid()));

CREATE OR REPLACE FUNCTION update_maintenance_costs_updated_at()
RETURNS TRIGGER AS $$ BEGIN NEW.updated_at = NOW(); RETURN NEW; END; $$ LANGUAGE plpgsql;

CREATE TRIGGER maintenance_costs_updated_at
    BEFORE UPDATE ON maintenance_costs
    FOR EACH ROW EXECUTE FUNCTION update_maintenance_costs_updated_at();
