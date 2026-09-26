-- Taking a Detailbewertung (or an Ersteinschätzung) over into the
-- Bestandsobjekte.

-- ── 1. Which Bestandsobjekt a Detailbewertung became ────────────────────────
-- Set by POST /api/detail-checks/takeover. Guards against taking the same
-- detail check over twice (two Bestandsobjekte for one purchase) and lets the
-- overview offer "Zum Bestandsobjekt" instead. SET NULL: deleting the
-- Bestandsobjekt makes the detail check takeable again.
ALTER TABLE detail_check_property_data
    ADD COLUMN IF NOT EXISTS taken_over_property_id INT REFERENCES property(property_id) ON DELETE SET NULL;

COMMENT ON COLUMN detail_check_property_data.taken_over_property_id IS 'Bestandsobjekt, in das diese Detailbewertung übernommen wurde.';

-- ── 2. Ersteinschätzung "Übernehmen" ────────────────────────────────────────
-- Same signature and behaviour as 20260318_property_optional_fields.sql, with
-- two changes to step 3 (ACCEPT):
--   * An Ersteinschätzung that already has its Bestandsobjekt reuses it
--     instead of inserting another property row — saving an edited
--     Ersteinschätzung calls ACCEPT again, which used to create a duplicate
--     Bestandsobjekt every time.
--   * Kaufpreis and Kaltmiete are carried over (acquisition_costs and the
--     default unit "Gesamtes Objekt" with its Soll-Kaltmiete) instead of being
--     lost — only address and Baujahr were taken over before.
CREATE OR REPLACE FUNCTION finalize_quick_check(
    p_quick_check_id        INT,
    p_user_id               UUID,
    p_action                VARCHAR(10),            -- 'ACCEPT' | 'DISCARD'
    p_kpf_multiplier        DECIMAL(5, 1)           DEFAULT NULL,  -- live KPF from UI; NULL = skip kpf_ranges upsert
    -- Optional property fields — only used when p_action = 'ACCEPT'
    p_house_number          VARCHAR(10)             DEFAULT NULL,
    p_federal_state         VARCHAR(100)            DEFAULT NULL,
    p_city_id               INT                     DEFAULT NULL,
    p_property_abbreviation VARCHAR(20)             DEFAULT NULL,
    p_square_meters         NUMERIC(10, 2)          DEFAULT NULL,
    p_number_of_rooms       NUMERIC(3, 1)           DEFAULT NULL,
    p_energy_efficient      energy_efficiency_class DEFAULT NULL
)
RETURNS INT
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_qc            quick_check%ROWTYPE;
    v_property_id   INT := NULL;
    v_bucket        kpf_construction_year_bucket;
BEGIN
    -- Guard: valid action
    IF p_action NOT IN ('ACCEPT', 'DISCARD') THEN
        RAISE EXCEPTION 'p_action must be ACCEPT or DISCARD, got: %', p_action;
    END IF;

    -- Load + lock the row; guard against wrong owner or already-finalised
    SELECT * INTO v_qc
    FROM quick_check
    WHERE quick_check_id = p_quick_check_id
      AND user_id        = p_user_id
      AND status         = 'ACTIVE'
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'quick_check % not found, not owned by user, or already finalised.', p_quick_check_id;
    END IF;

    -- ── Step 1 (both): UPSERT kpf_ranges with the live KPF value ─────────────
    IF p_kpf_multiplier IS NOT NULL THEN
        v_bucket := CASE
            WHEN v_qc.year_of_construction < 1918 THEN '<1918'
            WHEN v_qc.year_of_construction < 1950 THEN '1918-1949'
            WHEN v_qc.year_of_construction < 1960 THEN '1950-1959'
            WHEN v_qc.year_of_construction < 1970 THEN '1960-1969'
            WHEN v_qc.year_of_construction < 1980 THEN '1970-1979'
            WHEN v_qc.year_of_construction < 1990 THEN '1980-1989'
            WHEN v_qc.year_of_construction < 2000 THEN '1990-1999'
            WHEN v_qc.year_of_construction < 2010 THEN '2000-2009'
            WHEN v_qc.year_of_construction < 2015 THEN '2010-2014'
            ELSE '2015+'
        END::kpf_construction_year_bucket;

        INSERT INTO kpf_ranges (postal_code, condition, construction_year_bucket, min_value, max_value, sample_size)
        VALUES (v_qc.postal_code, v_qc.condition, v_bucket, p_kpf_multiplier, p_kpf_multiplier, 1)
        ON CONFLICT (postal_code, condition, construction_year_bucket) DO UPDATE
            SET min_value   = LEAST   (kpf_ranges.min_value,  EXCLUDED.min_value),
                max_value   = GREATEST(kpf_ranges.max_value,  EXCLUDED.max_value),
                sample_size = kpf_ranges.sample_size + 1
            WHERE EXCLUDED.min_value < kpf_ranges.min_value
               OR EXCLUDED.max_value > kpf_ranges.max_value;
    END IF;

    -- ── Step 2 (both): finalise the quick_check row ───────────────────────────
    -- (status is intentionally not changed — it tracks portal listing
    -- availability, not finalization state)
    UPDATE quick_check
       SET kpf_multiplier    = COALESCE(p_kpf_multiplier, kpf_multiplier),
           finalised_action  = p_action,
           updated_at        = NOW()
     WHERE quick_check_id = p_quick_check_id;

    -- ── Step 3 (ACCEPT only): create — or reuse — the Bestandsobjekt ──────────
    IF p_action = 'ACCEPT' THEN
        -- Already taken over before (e.g. the edited Ersteinschätzung was saved
        -- again): keep that Bestandsobjekt, never insert a second one.
        IF v_qc.property_id IS NOT NULL AND EXISTS (SELECT 1 FROM property WHERE property_id = v_qc.property_id) THEN
            RETURN v_qc.property_id;
        END IF;

        INSERT INTO property (
            user_id, city_id, property_abbreviation,
            street, house_number, city, postal_code, federal_state,
            square_meters, number_of_rooms, year_of_construction, energy_efficient
        ) VALUES (
            p_user_id, p_city_id, p_property_abbreviation,
            v_qc.street, p_house_number, v_qc.city,
            v_qc.postal_code, p_federal_state,
            p_square_meters, p_number_of_rooms,
            v_qc.year_of_construction, p_energy_efficient
        )
        RETURNING property_id INTO v_property_id;

        -- Kaufpreis → Kaufkosten of the Bestandsobjekt.
        IF v_qc.purchase_price IS NOT NULL AND v_qc.purchase_price > 0 THEN
            INSERT INTO acquisition_costs (property_id, property_purchase_price)
            VALUES (v_property_id, v_qc.purchase_price);
        END IF;

        -- Kaltmiete → Soll-Kaltmiete of the default unit, the same "Gesamtes
        -- Objekt" unit the property page would otherwise create on first open.
        INSERT INTO property_unit (
            property_id, unit_label, sort_order, usage_type,
            living_area_m2, number_of_rooms, year_of_construction, target_cold_rent
        ) VALUES (
            v_property_id, 'Gesamtes Objekt', 0, 'WOHNUNG',
            p_square_meters, p_number_of_rooms, v_qc.year_of_construction,
            NULLIF(v_qc.cold_rent, 0)
        );

        UPDATE quick_check
           SET property_id = v_property_id,
               updated_at  = NOW()
         WHERE quick_check_id = p_quick_check_id;
    END IF;

    RETURN v_property_id;
END;
$$;
