-- Backs the Kennzahlen (key metrics) screen: current market value plus the
-- financing inputs (loan, equity, interest/repayment rate, fixed-interest
-- period) needed for cash flow, return-on-equity and capital-service
-- figures on an already-acquired property. Mirrors the property_rnd /
-- property_price_split 1:1 child-table pattern — only raw inputs are
-- stored, everything derived is recomputed on read.

CREATE TABLE IF NOT EXISTS property_financials (
    property_financials_id       SERIAL PRIMARY KEY,
    property_id                   INT NOT NULL UNIQUE REFERENCES property(property_id) ON DELETE CASCADE,
    current_market_value          NUMERIC(14, 2),
    loan_amount                   NUMERIC(14, 2),
    equity                        NUMERIC(14, 2),
    interest_rate                 NUMERIC(6, 4),
    repayment_rate                NUMERIC(6, 4),
    fixed_interest_period_years   NUMERIC(6, 2),
    created_at                    TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at                    TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_property_financials_property_id
    ON property_financials(property_id);

-- Row Level Security, matching property_rnd / property_price_split
-- (ownership derived from the parent property row).
ALTER TABLE property_financials ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own property financials"
    ON property_financials FOR SELECT
    USING (EXISTS (SELECT 1 FROM property WHERE property.property_id = property_financials.property_id AND property.user_id = auth.uid()));

CREATE POLICY "Users can insert own property financials"
    ON property_financials FOR INSERT
    WITH CHECK (EXISTS (SELECT 1 FROM property WHERE property.property_id = property_financials.property_id AND property.user_id = auth.uid()));

CREATE POLICY "Users can update own property financials"
    ON property_financials FOR UPDATE
    USING (EXISTS (SELECT 1 FROM property WHERE property.property_id = property_financials.property_id AND property.user_id = auth.uid()));

CREATE POLICY "Users can delete own property financials"
    ON property_financials FOR DELETE
    USING (EXISTS (SELECT 1 FROM property WHERE property.property_id = property_financials.property_id AND property.user_id = auth.uid()));

CREATE OR REPLACE FUNCTION update_property_financials_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER property_financials_updated_at
    BEFORE UPDATE ON property_financials
    FOR EACH ROW EXECUTE FUNCTION update_property_financials_updated_at();
