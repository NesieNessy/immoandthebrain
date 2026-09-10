-- ==============================================================================
-- ImmoAndTheBrain – VIEW: metrics_today
-- Aggregates key metrics from tenancy, maintenance_costs, financing,
-- depreciation and personal_data per property.
-- No table — computed on demand.
-- ==============================================================================

CREATE OR REPLACE VIEW metrics_today AS
SELECT
    pd.user_id,
    p.property_id,
    t.tenancy_id,
    t.cold_rent,
    t.warm_rent,
    t.is_rented,
    mc.maintenance_costs_id,
    mc.total_costs                          AS maintenance_total_costs,
    mc.allocable_costs,
    mc.non_allocable_costs,
    f.financing_id,
    f.weighted_monthly_debt_service         AS monthly_debt_service,
    f.weighted_interest_rate                AS interest_rate,
    d.depreciation_id,
    d.depreciation_rate_percent,
    d.remaining_useful_life_years,
    dt.development_tomorrow_id              AS development_id
FROM personal_data pd
JOIN property p              ON p.user_id = pd.user_id
LEFT JOIN tenancy t           ON t.property_id = p.property_id AND t.tenancy_end_date IS NULL
LEFT JOIN maintenance_costs mc ON mc.property_id = p.property_id
LEFT JOIN financing f          ON f.property_id = p.property_id
LEFT JOIN depreciation d       ON d.property_id = p.property_id
LEFT JOIN development_tomorrow dt ON dt.property_id = p.property_id;

COMMENT ON VIEW metrics_today IS 'Live view aggregating current metrics per property. Replaces the former MetricsToday table.';
