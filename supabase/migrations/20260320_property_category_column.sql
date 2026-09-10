-- ==============================================================================
-- ImmoAndTheBrain - property.property_category (direct column)
--
-- property_overview (20260319) originally derived property_category only via
-- the accepted quick_check -> detail_check_property_data chain. That leaves
-- no way to set it for a property that never went through — or won't ever
-- go through — a detail check, and no UI exists yet to edit it directly.
--
-- Adds a plain nullable column on `property` itself (same free-TEXT
-- convention as detail_check_property_data.property_category — no enum
-- constraint, mirrors propertyCategoryOptions in the detail-check form) and
-- updates the view to prefer it, falling back to the detail-check-derived
-- value for properties where only that exists.
-- ==============================================================================

ALTER TABLE property ADD COLUMN IF NOT EXISTS property_category TEXT;
COMMENT ON COLUMN property.property_category IS 'Objekttyp (e.g. EIGENTUMSWOHNUNG) — directly editable; falls back to the linked detail-check''s value in property_overview if not set here.';

-- p.* would duplicate the property_category column now that it also exists
-- directly on `property` (COALESCE recomputes it below) — list columns
-- explicitly instead of p.* to avoid two same-named columns in the view.
-- DROP+CREATE (not CREATE OR REPLACE) because the explicit column list
-- doesn't match the original p.*-expanded column order/names exactly enough
-- for Postgres's "OR REPLACE can only append columns" rule.
DROP VIEW IF EXISTS property_overview;
CREATE VIEW property_overview AS
SELECT
    p.property_id,
    p.user_id,
    p.city_id,
    p.property_abbreviation,
    p.street,
    p.house_number,
    p.city,
    p.postal_code,
    p.federal_state,
    p.square_meters,
    p.number_of_rooms,
    p.year_of_construction,
    p.energy_efficient,
    p.image_base64,
    p.created_at,
    p.updated_at,
    COALESCE(p.property_category, dcpd.property_category) AS property_category,
    EXISTS (
        SELECT 1 FROM tenancy t
        WHERE t.property_id = p.property_id AND t.is_rented = TRUE
    ) AS is_rented,
    ac.property_purchase_price AS purchase_price
FROM property p
LEFT JOIN LATERAL (
    SELECT qc.quick_check_id
    FROM quick_check qc
    WHERE qc.property_id = p.property_id
    ORDER BY qc.created_at DESC
    LIMIT 1
) qc ON true
LEFT JOIN detail_check_property_data dcpd ON dcpd.quick_check_id = qc.quick_check_id
LEFT JOIN LATERAL (
    SELECT ac.property_purchase_price
    FROM acquisition_costs ac
    WHERE ac.property_id = p.property_id
    ORDER BY ac.created_at DESC
    LIMIT 1
) ac ON true;

COMMENT ON VIEW property_overview IS 'Read view for the Bestandsobjekte overview page — property plus property_category (direct column, falling back to detail_check_property_data via quick_check), is_rented (via tenancy), and purchase_price (via acquisition_costs).';
