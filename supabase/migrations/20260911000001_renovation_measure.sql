-- Backs the "Handwerker" (Sanierungsmaßnahmen) overview: one row per planned
-- renovation measure on a property, tracked from cost estimate through
-- publish/quote/commission/completion. There is no craftsperson-facing
-- portal yet — the property owner enters the quote and completion state
-- themselves once they have it from the contractor by phone/email/etc.
-- "published" is a local status flag only; nothing here calls out to a real
-- marketplace/platform.

CREATE TABLE renovation_measure (
    renovation_measure_id         SERIAL                    PRIMARY KEY,
    property_id                    INTEGER                   NOT NULL REFERENCES property(property_id) ON DELETE CASCADE,
    sort_order                      INTEGER                   NOT NULL DEFAULT 0,

    title                           TEXT                      NOT NULL,
    estimated_cost                  NUMERIC,
    quoted_cost                     NUMERIC,
    preferred_start_date            DATE,
    quoted_start_date               DATE,
    actual_completion_date          DATE,

    published                      BOOLEAN                   NOT NULL DEFAULT FALSE,
    published_at                    TIMESTAMPTZ,
    -- Once true, the measure is read-only (title/costs/dates/publish/delete) —
    -- the only exception is customer_confirmed_completed below.
    quote_accepted                  BOOLEAN                   NOT NULL DEFAULT FALSE,
    -- "Contractor reports completion" has no real contractor input to
    -- read from yet, so it's represented by actual_completion_date being
    -- set (entered by the owner) rather than a separate boolean; this flag
    -- is the owner's own explicit confirmation on top of that.
    customer_confirmed_completed    BOOLEAN                   NOT NULL DEFAULT FALSE,

    created_at                     TIMESTAMPTZ               NOT NULL DEFAULT NOW(),
    updated_at                     TIMESTAMPTZ               NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_renovation_measure_property_id ON renovation_measure (property_id);

COMMENT ON TABLE renovation_measure IS 'One row per planned Sanierungsmaßnahme on a property — the Handwerker overview table.';
COMMENT ON COLUMN renovation_measure.quote_accepted IS 'Once true, the measure becomes read-only except customer_confirmed_completed.';
COMMENT ON COLUMN renovation_measure.customer_confirmed_completed IS 'Owner-entered confirmation that the (owner-reported) completion is accepted; only settable once actual_completion_date is set.';

ALTER TABLE renovation_measure ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own renovation measures"
    ON renovation_measure FOR SELECT
    USING (EXISTS (SELECT 1 FROM property WHERE property.property_id = renovation_measure.property_id AND property.user_id = auth.uid()));

CREATE POLICY "Users can insert own renovation measures"
    ON renovation_measure FOR INSERT
    WITH CHECK (EXISTS (SELECT 1 FROM property WHERE property.property_id = renovation_measure.property_id AND property.user_id = auth.uid()));

CREATE POLICY "Users can update own renovation measures"
    ON renovation_measure FOR UPDATE
    USING (EXISTS (SELECT 1 FROM property WHERE property.property_id = renovation_measure.property_id AND property.user_id = auth.uid()));

CREATE POLICY "Users can delete own renovation measures"
    ON renovation_measure FOR DELETE
    USING (EXISTS (SELECT 1 FROM property WHERE property.property_id = renovation_measure.property_id AND property.user_id = auth.uid()));

CREATE OR REPLACE FUNCTION update_renovation_measure_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER renovation_measure_updated_at
    BEFORE UPDATE ON renovation_measure
    FOR EACH ROW EXECUTE FUNCTION update_renovation_measure_updated_at();
