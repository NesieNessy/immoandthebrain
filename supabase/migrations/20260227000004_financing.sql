-- ==============================================================================
-- ImmoAndTheBrain – CREATE TABLE: financing
-- Depends on: property (property_id)
-- ==============================================================================

CREATE TABLE IF NOT EXISTS financing (
    financing_id                    SERIAL                      PRIMARY KEY,
    property_id                     INT                         NOT NULL REFERENCES property(property_id) ON DELETE CASCADE,

    number_of_loans                 INT                         NOT NULL DEFAULT 1 CHECK (number_of_loans > 0),
    weighted_loan_amount            NUMERIC(14, 2),
    weighted_equity                 NUMERIC(14, 2),
    weighted_interest_rate          NUMERIC(6, 4),
    weighted_repayment_rate         NUMERIC(6, 4),
    weighted_monthly_debt_service   NUMERIC(10, 2),
    single_loan_amount              NUMERIC(14, 2),
    single_equity                   NUMERIC(14, 2),
    single_interest_rate            NUMERIC(6, 4),
    single_repayment_rate           NUMERIC(6, 4),
    single_monthly_debt_service     NUMERIC(10, 2),
    single_repayment_start_date     DATE,
    fixed_interest_period           NUMERIC(6, 2),
    interest_rate                   NUMERIC(6, 4),
    regular_interest_rate           NUMERIC(6, 4),

    created_at                      TIMESTAMP WITH TIME ZONE    DEFAULT NOW(),
    updated_at                      TIMESTAMP WITH TIME ZONE    DEFAULT NOW()
);

-- Index
CREATE INDEX IF NOT EXISTS idx_financing_property_id ON financing (property_id);

-- Comment
COMMENT ON TABLE financing IS '1:n with property. Tracks loan structure and debt service.';

-- Row Level Security
ALTER TABLE financing ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own financing"
    ON financing FOR SELECT
    USING (EXISTS (SELECT 1 FROM property WHERE property.property_id = financing.property_id AND property.user_id = auth.uid()));

CREATE POLICY "Users can insert own financing"
    ON financing FOR INSERT
    WITH CHECK (EXISTS (SELECT 1 FROM property WHERE property.property_id = financing.property_id AND property.user_id = auth.uid()));

CREATE POLICY "Users can update own financing"
    ON financing FOR UPDATE
    USING (EXISTS (SELECT 1 FROM property WHERE property.property_id = financing.property_id AND property.user_id = auth.uid()));

CREATE POLICY "Users can delete own financing"
    ON financing FOR DELETE
    USING (EXISTS (SELECT 1 FROM property WHERE property.property_id = financing.property_id AND property.user_id = auth.uid()));

-- Auto-update updated_at
CREATE OR REPLACE FUNCTION update_financing_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER financing_updated_at
    BEFORE UPDATE ON financing
    FOR EACH ROW EXECUTE FUNCTION update_financing_updated_at();
