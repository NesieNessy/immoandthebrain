-- ==============================================================================
-- ImmoAndTheBrain – CREATE TABLE: tenancy_move_out
-- 1:1 with tenancy — meter readings and damage descriptions captured on the
-- tenant move-out page. property_id is denormalized from tenancy for RLS.
-- ==============================================================================

CREATE TABLE IF NOT EXISTS tenancy_move_out (
    tenancy_move_out_id  SERIAL                      PRIMARY KEY,
    tenancy_id           INT                         NOT NULL UNIQUE REFERENCES tenancy(tenancy_id) ON DELETE CASCADE,
    property_id          INT                         NOT NULL REFERENCES property(property_id) ON DELETE CASCADE,

    meter_readings        JSONB,
    damages                JSONB,

    created_at            TIMESTAMP WITH TIME ZONE   DEFAULT NOW(),
    updated_at            TIMESTAMP WITH TIME ZONE   DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_tenancy_move_out_tenancy_id ON tenancy_move_out (tenancy_id);

COMMENT ON TABLE  tenancy_move_out               IS '1:1 with tenancy (Mieterauszug — Zählerstände und Schäden bei Auszug).';
COMMENT ON COLUMN tenancy_move_out.meter_readings IS 'Array of { id, room, value } — Zählerstände bei Auszug.';
COMMENT ON COLUMN tenancy_move_out.damages        IS 'Array of { id, description, photos: [{ path, fileName }] } — Schäden bei Auszug, Fotos im tenancy-documents Bucket.';

ALTER TABLE tenancy_move_out ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own tenancy move-out records"
    ON tenancy_move_out FOR SELECT
    USING (EXISTS (SELECT 1 FROM property WHERE property.property_id = tenancy_move_out.property_id AND property.user_id = auth.uid()));

CREATE POLICY "Users can insert own tenancy move-out records"
    ON tenancy_move_out FOR INSERT
    WITH CHECK (EXISTS (SELECT 1 FROM property WHERE property.property_id = tenancy_move_out.property_id AND property.user_id = auth.uid()));

CREATE POLICY "Users can update own tenancy move-out records"
    ON tenancy_move_out FOR UPDATE
    USING (EXISTS (SELECT 1 FROM property WHERE property.property_id = tenancy_move_out.property_id AND property.user_id = auth.uid()));

CREATE POLICY "Users can delete own tenancy move-out records"
    ON tenancy_move_out FOR DELETE
    USING (EXISTS (SELECT 1 FROM property WHERE property.property_id = tenancy_move_out.property_id AND property.user_id = auth.uid()));

CREATE OR REPLACE FUNCTION update_tenancy_move_out_updated_at()
RETURNS TRIGGER AS $$ BEGIN NEW.updated_at = NOW(); RETURN NEW; END; $$ LANGUAGE plpgsql;

CREATE TRIGGER tenancy_move_out_updated_at
    BEFORE UPDATE ON tenancy_move_out
    FOR EACH ROW EXECUTE FUNCTION update_tenancy_move_out_updated_at();
