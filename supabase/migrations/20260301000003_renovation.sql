-- ==============================================================================
-- ImmoAndTheBrain – CREATE TABLE: renovation
-- Depends on: property (property_id), legal_requirements (legal_requirements_id)
-- ==============================================================================

CREATE TABLE IF NOT EXISTS renovation (
    renovation_id               SERIAL                      PRIMARY KEY,
    property_id                 INT                         NOT NULL REFERENCES property(property_id) ON DELETE CASCADE,
    legal_requirements_id       INT                         REFERENCES legal_requirements(legal_requirements_id) ON DELETE SET NULL,

    modernisation_property      VARCHAR(255),
    modernisation_date          DATE,
    modernisation_value         NUMERIC(14, 2),
    limit_15_percent            NUMERIC(14, 2),
    three_year_value            NUMERIC(14, 2),
    last_modernisation          DATE,
    last_modernisation_relevance VARCHAR(255),
    last_modernisation_value    NUMERIC(14, 2),
    last_modernisation_percent  NUMERIC(6, 4),
    purchase_depreciation       NUMERIC(14, 2),

    created_at                  TIMESTAMP WITH TIME ZONE    DEFAULT NOW(),
    updated_at                  TIMESTAMP WITH TIME ZONE    DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_renovation_property_id ON renovation (property_id);

COMMENT ON TABLE  renovation                          IS '1:n with property. Tracks modernisation measures and their rent-increase relevance.';
COMMENT ON COLUMN renovation.limit_15_percent         IS 'Mieterhöhungskappungsgrenze — maximum allowable rent increase from modernisation.';
COMMENT ON COLUMN renovation.purchase_depreciation    IS 'Anschaffungsnahe Herstellungskosten — acquisition-related production costs.';

ALTER TABLE renovation ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own renovations"
    ON renovation FOR SELECT
    USING (EXISTS (SELECT 1 FROM property WHERE property.property_id = renovation.property_id AND property.user_id = auth.uid()));

CREATE POLICY "Users can insert own renovations"
    ON renovation FOR INSERT
    WITH CHECK (EXISTS (SELECT 1 FROM property WHERE property.property_id = renovation.property_id AND property.user_id = auth.uid()));

CREATE POLICY "Users can update own renovations"
    ON renovation FOR UPDATE
    USING (EXISTS (SELECT 1 FROM property WHERE property.property_id = renovation.property_id AND property.user_id = auth.uid()));

CREATE POLICY "Users can delete own renovations"
    ON renovation FOR DELETE
    USING (EXISTS (SELECT 1 FROM property WHERE property.property_id = renovation.property_id AND property.user_id = auth.uid()));

CREATE OR REPLACE FUNCTION update_renovation_updated_at()
RETURNS TRIGGER AS $$ BEGIN NEW.updated_at = NOW(); RETURN NEW; END; $$ LANGUAGE plpgsql;
CREATE TRIGGER renovation_updated_at BEFORE UPDATE ON renovation FOR EACH ROW EXECUTE FUNCTION update_renovation_updated_at();
