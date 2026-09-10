-- ==============================================================================
-- ImmoAndTheBrain - VIEW: property_overview
--
-- Enriches `property` with three derived, non-persisted fields for the
-- Bestandsobjekte overview page:
--
--   property_category  Sourced from detail_check_property_data via the
--                       quick_check that was accepted into this property
--                       (quick_check.property_id -> quick_check_id ->
--                       detail_check_property_data.quick_check_id). Not a
--                       column on `property` itself — a property that never
--                       went through a detail check (or whose detail check
--                       used a different/unlinked workflow) has NULL here.
--                       Picks the most recently created matching quick_check
--                       if there's more than one.
--
--   is_rented           TRUE if at least one tenancy row for this property
--                       has is_rented = TRUE (tenancy is 1:n with property —
--                       multiple units are possible, so this is an OR across
--                       all of them, not a 1:1 lookup).
--
--   purchase_price      From acquisition_costs.property_purchase_price
--                       (1 property : 1 acquisition_costs row in practice,
--                       but no DB-level UNIQUE enforces that — picks the
--                       most recently created row if there's more than one).
--                       NULL if acquisition costs were never entered.
--
-- Plain view (not SECURITY DEFINER) — RLS on property/quick_check/
-- detail_check_property_data/tenancy/acquisition_costs applies transparently
-- per querying user, same as quick_check_overview.
-- ==============================================================================

CREATE OR REPLACE VIEW property_overview AS
SELECT
    p.*,
    dcpd.property_category,
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

COMMENT ON VIEW property_overview IS 'Read view for the Bestandsobjekte overview page — property plus derived property_category (via quick_check/detail_check_property_data), is_rented (via tenancy), and purchase_price (via acquisition_costs).';
