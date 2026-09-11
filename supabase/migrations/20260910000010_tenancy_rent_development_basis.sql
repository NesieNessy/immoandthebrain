-- Backs the "Kalkulationsbasis" tab of the Objektentwicklung (rent
-- development) screen — inputs the §558/§559 proposal math needs that
-- aren't already available elsewhere (coldRent/livingAreaM2/city and the
-- history of past increases all already exist). NULL means "use the legal
-- default" (see rentDevelopmentPlan.ts), not "zero".

ALTER TABLE tenancy ADD COLUMN rent_index_per_m2 NUMERIC;
ALTER TABLE tenancy ADD COLUMN rent_increase_interval_months INTEGER;
ALTER TABLE tenancy ADD COLUMN planned_renovation_cost NUMERIC;

COMMENT ON COLUMN tenancy.rent_index_per_m2 IS 'Örtlicher Vergleichsmietenindex, €/m² — §558 BGB target basis.';
COMMENT ON COLUMN tenancy.rent_increase_interval_months IS '§558 Sperrfrist override in months; NULL = legal default (12, clamped to 15 by the calculator).';
COMMENT ON COLUMN tenancy.planned_renovation_cost IS 'Geplante Sanierungskosten, €, total — feeds the §559 8%-of-cost-per-year cap.';
