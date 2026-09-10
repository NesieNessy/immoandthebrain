-- ==============================================================================
-- ImmoAndTheBrain – property_overview.is_rented: date-aware instead of the stored flag
--
-- is_rented previously checked tenancy.is_rented = TRUE, a column that's only
-- ever set explicitly (on tenancy creation, and by the tenant-history page's
-- "Reaktivieren") and never cleared back to FALSE when a tenant moves out —
-- so a property kept showing "Vermietet" forever after its last tenant's
-- move-out date passed. Recomputed from tenancy_end_date instead, matching
-- the same "current tenancy" rule used by property-resources' current=true
-- query: a tenancy counts as active while tenancy_end_date is NULL or still
-- in the future.
-- ==============================================================================

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
        WHERE t.property_id = p.property_id
          AND (t.tenancy_end_date IS NULL OR t.tenancy_end_date >= CURRENT_DATE)
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

COMMENT ON VIEW property_overview IS 'Read view for the Bestandsobjekte overview page — property plus property_category (direct column, falling back to detail_check_property_data via quick_check), is_rented (date-aware: any tenancy with no or future tenancy_end_date), and purchase_price (via acquisition_costs).';
