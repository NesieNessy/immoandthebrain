-- ==============================================================================
-- ImmoAndTheBrain – CREATE TABLE: financing_calculation
-- Depends on: financing (financing_id)
-- ==============================================================================

CREATE TABLE IF NOT EXISTS financing_calculation (
    financing_calculation_id    SERIAL                      PRIMARY KEY,
    financing_id                INT                         NOT NULL REFERENCES financing(financing_id) ON DELETE CASCADE,

    month                       INT                         NOT NULL CHECK (month > 0),
    monthly_debt_service        NUMERIC(10, 2),
    single_monthly_debt_service INT,
    interest_portion            NUMERIC(10, 2),
    repayment_portion           NUMERIC(10, 2),
    remaining_debt              NUMERIC(14, 2),
    repayment_year              INT,
    repayment_month             INT,

    created_at                  TIMESTAMP WITH TIME ZONE    DEFAULT NOW()
);

-- Index
CREATE INDEX IF NOT EXISTS idx_financing_calculation_financing_id ON financing_calculation (financing_id);

-- Comment
COMMENT ON TABLE financing_calculation IS '1:n with financing. Monthly amortisation schedule.';

-- Row Level Security
ALTER TABLE financing_calculation ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own financing calculations"
    ON financing_calculation FOR SELECT
    USING (EXISTS (
        SELECT 1 FROM financing
        JOIN property ON property.property_id = financing.property_id
        WHERE financing.financing_id = financing_calculation.financing_id
          AND property.user_id = auth.uid()
    ));

CREATE POLICY "Users can insert own financing calculations"
    ON financing_calculation FOR INSERT
    WITH CHECK (EXISTS (
        SELECT 1 FROM financing
        JOIN property ON property.property_id = financing.property_id
        WHERE financing.financing_id = financing_calculation.financing_id
          AND property.user_id = auth.uid()
    ));

CREATE POLICY "Users can delete own financing calculations"
    ON financing_calculation FOR DELETE
    USING (EXISTS (
        SELECT 1 FROM financing
        JOIN property ON property.property_id = financing.property_id
        WHERE financing.financing_id = financing_calculation.financing_id
          AND property.user_id = auth.uid()
    ));
