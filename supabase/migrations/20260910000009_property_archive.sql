-- Lets a property be archived from the Bestandsobjekte overview instead of
-- only ever being hard-deleted. Archived properties are hidden from the
-- default list view and only reappear when "Verlauf" is switched on —
-- same visibility pattern as the superseded-document history on the global
-- Dokumente page.

ALTER TABLE property ADD COLUMN archived_at TIMESTAMPTZ;

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
    p.archived_at,
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

COMMENT ON VIEW property_overview IS 'Read view for the Bestandsobjekte overview page — property plus property_category (direct column, falling back to detail_check_property_data via quick_check), is_rented (date-aware: any tenancy with no or future tenancy_end_date), archived_at, and purchase_price (via acquisition_costs).';
