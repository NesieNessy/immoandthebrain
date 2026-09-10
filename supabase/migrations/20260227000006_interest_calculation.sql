-- ==============================================================================
-- ImmoAndTheBrain – CREATE TABLE: interest_calculation
-- Depends on: financing (financing_id)
-- ==============================================================================

CREATE TABLE IF NOT EXISTS interest_calculation (
    interest_calculation_id       SERIAL                      PRIMARY KEY,
    financing_id                  INT                         NOT NULL REFERENCES financing(financing_id) ON DELETE CASCADE,

    modification_variable         NUMERIC(6, 4),
    fixed_interest_period         NUMERIC(6, 2),
    fixed_interest_period_percent NUMERIC(6, 4),
    estimated_interest_rate       NUMERIC(6, 4),
    loan_to_value_equity_share    NUMERIC(6, 4),
    equity_thresholds             NUMERIC(6, 4),
    equity_thresholds_corridor    NUMERIC(6, 4),
    equity_thresholds_percent     NUMERIC(6, 4),

    created_at                    TIMESTAMP WITH TIME ZONE    DEFAULT NOW(),
    updated_at                    TIMESTAMP WITH TIME ZONE    DEFAULT NOW()
);

-- Index
CREATE INDEX IF NOT EXISTS idx_interest_calculation_financing_id ON interest_calculation (financing_id);

-- Comment
COMMENT ON TABLE interest_calculation IS '1:n with financing. Models interest rate scenarios and modifications.';

-- Row Level Security
ALTER TABLE interest_calculation ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own interest calculations"
    ON interest_calculation FOR SELECT
    USING (EXISTS (
        SELECT 1 FROM financing
        JOIN property ON property.property_id = financing.property_id
        WHERE financing.financing_id = interest_calculation.financing_id
          AND property.user_id = auth.uid()
    ));

CREATE POLICY "Users can insert own interest calculations"
    ON interest_calculation FOR INSERT
    WITH CHECK (EXISTS (
        SELECT 1 FROM financing
        JOIN property ON property.property_id = financing.property_id
        WHERE financing.financing_id = interest_calculation.financing_id
          AND property.user_id = auth.uid()
    ));

CREATE POLICY "Users can update own interest calculations"
    ON interest_calculation FOR UPDATE
    USING (EXISTS (
        SELECT 1 FROM financing
        JOIN property ON property.property_id = financing.property_id
        WHERE financing.financing_id = interest_calculation.financing_id
          AND property.user_id = auth.uid()
    ));

CREATE POLICY "Users can delete own interest calculations"
    ON interest_calculation FOR DELETE
    USING (EXISTS (
        SELECT 1 FROM financing
        JOIN property ON property.property_id = financing.property_id
        WHERE financing.financing_id = interest_calculation.financing_id
          AND property.user_id = auth.uid()
    ));

-- Auto-update updated_at
CREATE OR REPLACE FUNCTION update_interest_calculation_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER interest_calculation_updated_at
    BEFORE UPDATE ON interest_calculation
    FOR EACH ROW EXECUTE FUNCTION update_interest_calculation_updated_at();
