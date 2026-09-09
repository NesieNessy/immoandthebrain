-- ==============================================================================
-- ImmoAndTheBrain – CREATE TABLE: development_tomorrow_metrics
-- Depends on: development_tomorrow (development_tomorrow_id)
-- ==============================================================================

CREATE TABLE IF NOT EXISTS development_tomorrow_metrics (
    metrics_id                              SERIAL                      PRIMARY KEY,
    development_tomorrow_id                 INT                         NOT NULL REFERENCES development_tomorrow(development_tomorrow_id) ON DELETE CASCADE,

    sqm_price_with_ri                       NUMERIC(10, 2),
    sqm_price_without_ri                    NUMERIC(10, 2),
    total_rent_with_ri                      NUMERIC(10, 2),
    total_rent_without_ri                   NUMERIC(10, 2),
    debt_service_diff_with_ri               NUMERIC(10, 2),
    debt_service_diff_without_ri            NUMERIC(10, 2),
    net_rent_yield_pre_tax_with_ri          NUMERIC(8, 6),
    net_rent_yield_pre_tax_without_ri       NUMERIC(8, 6),
    net_rent_yield_after_tax_with_ri        NUMERIC(8, 6),
    net_rent_yield_after_tax_without_ri     NUMERIC(8, 6),
    operative_cashflow_with_ri              NUMERIC(10, 2),
    operative_cashflow_without_ri           NUMERIC(10, 2),
    after_tax_cashflow_with_ri              NUMERIC(10, 2),
    after_tax_cashflow_without_ri           NUMERIC(10, 2),
    computed_at                             TIMESTAMP WITH TIME ZONE    NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_dev_tomorrow_metrics_dev_id ON development_tomorrow_metrics (development_tomorrow_id);

COMMENT ON TABLE  development_tomorrow_metrics             IS 'Computed output metrics split from development_tomorrow inputs.';
COMMENT ON COLUMN development_tomorrow_metrics.computed_at IS 'Timestamp of last computation run.';

ALTER TABLE development_tomorrow_metrics ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own development tomorrow metrics"
    ON development_tomorrow_metrics FOR SELECT
    USING (EXISTS (
        SELECT 1 FROM development_tomorrow dt
        JOIN property p ON p.property_id = dt.property_id
        WHERE dt.development_tomorrow_id = development_tomorrow_metrics.development_tomorrow_id
        AND p.user_id = auth.uid()
    ));

CREATE POLICY "Users can insert own development tomorrow metrics"
    ON development_tomorrow_metrics FOR INSERT
    WITH CHECK (EXISTS (
        SELECT 1 FROM development_tomorrow dt
        JOIN property p ON p.property_id = dt.property_id
        WHERE dt.development_tomorrow_id = development_tomorrow_metrics.development_tomorrow_id
        AND p.user_id = auth.uid()
    ));

CREATE POLICY "Users can delete own development tomorrow metrics"
    ON development_tomorrow_metrics FOR DELETE
    USING (EXISTS (
        SELECT 1 FROM development_tomorrow dt
        JOIN property p ON p.property_id = dt.property_id
        WHERE dt.development_tomorrow_id = development_tomorrow_metrics.development_tomorrow_id
        AND p.user_id = auth.uid()
    ));
