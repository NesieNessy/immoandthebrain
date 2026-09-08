-- Per-cost-item manual override for the unit's allocated share (Anteil Wohnung).
-- The share is normally computed at read time from living-area proportions
-- (amount * unit's area share), but different cost items often use different
-- Verteilerschlüssel (e.g. by consumption, by number of units) — these columns
-- let a specific row's computed share be overridden while leaving the
-- automatic calculation as the default for every other row.
ALTER TABLE service_charge_cost_item
    ADD COLUMN IF NOT EXISTS actual_share_override NUMERIC(12, 2),
    ADD COLUMN IF NOT EXISTS budget_share_override  NUMERIC(12, 2);

COMMENT ON COLUMN service_charge_cost_item.actual_share_override IS 'Manual override of the computed Abrechnung-year Anteil Wohnung for this row; NULL uses the automatic actual_amount * unit share calculation.';
COMMENT ON COLUMN service_charge_cost_item.budget_share_override IS 'Manual override of the computed Wirtschaftsplan-year Anteil Wohnung for this row; NULL uses the automatic budget_amount * unit share calculation.';
