-- ==============================================================================
-- ImmoAndTheBrain - CREATE TABLE: quick_check
--
-- Flow:
--   INSERT   -> user fills QuickCheckPage. Inputs stored in snapshot fields.
--              No property record exists yet.
--
--   ACCEPT   -> finalize_quick_check(p_action := 'ACCEPT'):
--              Step 1 (both): UPSERT kpf_ranges - every check is a data point
--              Step 2 (both): finalised_action = 'ACCEPT'
--              Step 3 (ACCEPT only): INSERT property -> appears in Portfolio
--
--   DISCARD  -> finalize_quick_check(p_action := 'DISCARD'):
--              Step 1 (both): UPSERT kpf_ranges - every check is a data point
--              Step 2 (both): finalised_action = 'DISCARD'
--              (no property record created)
--
-- Key invariant: kpf_ranges updated on EVERY finalisation, accept or discard.
--
-- Status semantics (independent of finalisation):
--   ACTIVE   = listing is still available on the Immo portal
--   INACTIVE = listing has been taken offline / no longer available
--   Status is set by the user (or external sync) and is NOT changed by
--   finalize_quick_check. A listing can be discarded while still ACTIVE,
--   or accepted while already INACTIVE.
--
-- Field mapping:
--   Erfassungsdatum (capture date)  -> created_at                         (auto)
--   Portal ID                      -> portal_id                          (optional; empty for manual entries)
--   KPF Faktor (KPF factor)        -> kpf_multiplier                     (computed, frontend)
--   Kaufpreis (purchase price)     -> purchase_price
--   PLZ (postal code)              -> postal_code
--   Baujahr (year built)           -> year_of_construction
--   Zustand (condition)            -> condition                          (reuses property_condition enum)
--   Status                         -> status                             (quick_check_status enum)
--   Detailbewertung (detail check) -> detail_check                       (boolean)
-- ==============================================================================

CREATE TYPE quick_check_status AS ENUM (
    'ACTIVE',   -- listing is still available on the Immo portal
    'INACTIVE'  -- listing has been taken offline / is no longer available
);

CREATE TABLE IF NOT EXISTS quick_check (
    quick_check_id                  SERIAL                      PRIMARY KEY,
    user_id                         UUID                        NOT NULL
                                        REFERENCES personal_data(user_id) ON DELETE CASCADE,

    -- Set only when finalised_action = 'ACCEPT'. NULL for DISCARD.
    property_id                     INT
                                        REFERENCES property(property_id) ON DELETE SET NULL,

    -- External listing reference (e.g. ImmoScout24 expose ID or URL)
    portal_id                       VARCHAR(255),
    data_entry_source               TEXT                        NOT NULL DEFAULT 'MANUELL',

    -- Snapshot fields: entered by user in QuickCheckPage. Immutable after INSERT.
    -- Source of truth for kpf_ranges upsert and (on ACCEPT) property creation.
    purchase_price         NUMERIC(14, 2)              NOT NULL,
    cold_rent              NUMERIC(10, 2)              NOT NULL,
    street                 VARCHAR(120)                NOT NULL,
    postal_code            VARCHAR(10)                 NOT NULL,
    city                   VARCHAR(120)                NOT NULL,
    year_of_construction   INT                         NOT NULL
                                        CHECK (year_of_construction BETWEEN 1800 AND 2100),

    -- Reuses existing property_condition enum (no new type needed):
    -- 'Sanierungsbedürftig' | 'Standard' | 'Gehoben' | 'Luxus'
    condition                       property_condition          NOT NULL,

    -- KPF = purchase_price / (cold_rent * 12), 1 decimal.
    -- Computed in frontend, stored at check time. Not persisted anywhere else.
    kpf_multiplier                     NUMERIC(5, 1)               NOT NULL
                                        CHECK (kpf_multiplier > 0),

    status                          quick_check_status          NOT NULL DEFAULT 'ACTIVE',

    -- Which button the user clicked. NULL while not yet finalised.
    finalised_action                VARCHAR(10)
                                        CHECK (finalised_action IN ('ACCEPT', 'DISCARD')),

    -- TRUE once a full Detailbewertung has been started or completed
    detail_check               BOOLEAN                     NOT NULL DEFAULT FALSE,

    created_at                      TIMESTAMP WITH TIME ZONE    NOT NULL DEFAULT NOW(),
    updated_at                      TIMESTAMP WITH TIME ZONE    NOT NULL DEFAULT NOW()

);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_quick_check_user_id     ON quick_check (user_id);
CREATE INDEX IF NOT EXISTS idx_quick_check_property_id ON quick_check (property_id);
CREATE INDEX IF NOT EXISTS idx_quick_check_status      ON quick_check (status);
CREATE INDEX IF NOT EXISTS idx_quick_check_created_at  ON quick_check (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_quick_check_postal_code ON quick_check (postal_code);

-- Comments
COMMENT ON TABLE  quick_check IS 'Quick-check records. All display columns are self-contained snapshots. kpf_ranges updated on every finalisation regardless of action.';
COMMENT ON COLUMN quick_check.portal_id IS 'External listing reference, e.g. ImmoScout24 expose ID or URL.';
COMMENT ON COLUMN quick_check.purchase_price IS 'Kaufpreis at check time. Input to KPF and kpf_ranges upsert.';
COMMENT ON COLUMN quick_check.cold_rent IS 'Kaltmiete at check time. Required for KPF = price / (rent * 12).';
COMMENT ON COLUMN quick_check.street IS 'Street and house number snapshot entered during quick-check.';
COMMENT ON COLUMN quick_check.postal_code IS 'PLZ at check time. Key for kpf_ranges upsert on finalisation.';
COMMENT ON COLUMN quick_check.city IS 'City snapshot entered during quick-check.';
COMMENT ON COLUMN quick_check.year_of_construction IS 'Baujahr at check time. Mapped to kpf_construction_year_bucket on finalisation.';
COMMENT ON COLUMN quick_check.kpf_multiplier IS 'Kaufpreisfaktor = Kaufpreis / (Kaltmiete * 12), 1 decimal. Stored at check time.';
COMMENT ON COLUMN quick_check.status IS 'ACTIVE = listing is still available on the Immo portal. INACTIVE = listing no longer available. Tracks portal state, not finalization state.';
COMMENT ON COLUMN quick_check.finalised_action IS 'ACCEPT = taken over into Portfolio. DISCARD = dismissed. NULL while not yet finalised. Independent of status.';
COMMENT ON COLUMN quick_check.property_id IS 'Set only when finalised_action = ACCEPT. NULL for DISCARD.';
COMMENT ON COLUMN quick_check.created_at IS 'Erfassungsdatum: when the quick-check was first accepted.';

-- Row Level Security
ALTER TABLE quick_check ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view own quick checks"   ON quick_check FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own quick checks" ON quick_check FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own quick checks" ON quick_check FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own quick checks" ON quick_check FOR DELETE USING (auth.uid() = user_id);

-- updated_at trigger
CREATE OR REPLACE FUNCTION update_quick_check_updated_at()
RETURNS TRIGGER AS $$ BEGIN NEW.updated_at = NOW(); RETURN NEW; END; $$ LANGUAGE plpgsql;
CREATE TRIGGER quick_check_updated_at
    BEFORE UPDATE ON quick_check
    FOR EACH ROW EXECUTE FUNCTION update_quick_check_updated_at();


-- ==============================================================================
-- VIEW: quick_check_overview
-- All display columns from snapshot fields — no joins required.
-- Frontend: WHERE status = 'ACTIVE'   -> available on Immoportal
--           WHERE status = 'INACTIVE' -> not available on Immoportal
-- ==============================================================================

CREATE OR REPLACE VIEW quick_check_overview AS
SELECT
    qc.quick_check_id,
    qc.user_id,
    qc.created_at           AS ingest_date,
    qc.portal_id,
    qc.data_entry_source,
    qc.kpf_multiplier,
    qc.purchase_price,
    qc.cold_rent,
    qc.street,
    qc.postal_code,
    qc.city,
    qc.year_of_construction,
    qc.condition,
    qc.status,
    qc.finalised_action,
    qc.detail_check,
    qc.property_id
FROM quick_check qc;

COMMENT ON VIEW quick_check_overview IS 'Read view for the Quick-Check overview table. All columns self-contained — no joins required.';


-- ==============================================================================
-- RPC: finalize_quick_check
--
-- Single entry point for BOTH the "Übernehmen" and "Verwerfen" buttons.
-- p_action: 'ACCEPT' | 'DISCARD'
--
-- p_kpf_multiplier: the live KPF value from the UI at the moment the user
--   clicks Verwerfen / Übernehmen. This may differ from v_qc.kpf_multiplier
--   when the user has edited purchase price or cold rent without saving first.
--   Always used for the kpf_ranges upsert (the comparison data point) and
--   written back to quick_check.kpf_multiplier so the row stays consistent.
--
-- NOTE: status (ACTIVE/INACTIVE) is NOT changed here — it tracks portal
--   listing availability, not finalization state.
--
-- Step 1 (both):   UPSERT kpf_ranges — only when p_kpf_multiplier is not null.
--                  First entry:      min = max = p_kpf_multiplier, sample_size = 1
--                  Subsequent entry: expands min/max range, sample_size + 1
-- Step 2 (both):   kpf_multiplier = p_kpf_multiplier (when provided),
--                  finalised_action = p_action.
-- Step 3 (ACCEPT): INSERT INTO property -> object appears in Portfolio.
--
-- Returns: new property_id for ACCEPT, NULL for DISCARD.
-- ==============================================================================

CREATE OR REPLACE FUNCTION finalize_quick_check(
    p_quick_check_id        INT,
    p_user_id               UUID,
    p_action                VARCHAR(10),            -- 'ACCEPT' | 'DISCARD'
    p_kpf_multiplier        DECIMAL(5, 1)           DEFAULT NULL,  -- live KPF from UI; NULL = skip kpf_ranges upsert
    -- Required only when p_action = 'ACCEPT'
    p_street                VARCHAR(100)            DEFAULT NULL,
    p_house_number          VARCHAR(10)             DEFAULT NULL,
    p_city_name             VARCHAR(100)            DEFAULT NULL,
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

    -- Guard: ACCEPT requires all property fields
    IF p_action = 'ACCEPT' AND (
        p_street IS NULL OR p_house_number IS NULL OR p_city_name IS NULL OR
        p_federal_state IS NULL OR p_city_id IS NULL OR
        p_property_abbreviation IS NULL OR p_square_meters IS NULL OR
        p_number_of_rooms IS NULL OR p_energy_efficient IS NULL
    ) THEN
        RAISE EXCEPTION 'ACCEPT action requires all property fields to be provided.';
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
    UPDATE quick_check
       SET kpf_multiplier    = COALESCE(p_kpf_multiplier, kpf_multiplier),
           finalised_action  = p_action,
           updated_at        = NOW()
     WHERE quick_check_id = p_quick_check_id;

    -- ── Step 3 (ACCEPT only): create property record ──────────────────────────
    IF p_action = 'ACCEPT' THEN
        INSERT INTO property (
            user_id, city_id, property_abbreviation,
            street, house_number, city, postal_code, federal_state,
            square_meters, number_of_rooms, year_of_construction, energy_efficient
        ) VALUES (
            p_user_id, p_city_id, p_property_abbreviation,
            p_street, p_house_number, p_city_name,
            v_qc.postal_code,          p_federal_state,
            p_square_meters,                    p_number_of_rooms,
            v_qc.year_of_construction, p_energy_efficient
        )
        RETURNING property_id INTO v_property_id;

        UPDATE quick_check
           SET property_id = v_property_id,
               updated_at  = NOW()
         WHERE quick_check_id = p_quick_check_id;
    END IF;

    RETURN v_property_id;
END;
$$;

GRANT EXECUTE ON FUNCTION finalize_quick_check(
    INT, UUID, VARCHAR, DECIMAL,
    VARCHAR, VARCHAR, VARCHAR, VARCHAR,
    INT, VARCHAR, NUMERIC, NUMERIC,
    energy_efficiency_class
) TO authenticated;



-- ==============================================================================
-- RPC: upsert_kpf_range
--
-- Called when the user clicks "Verwerfen" on the NEW quick-check page.
-- In that flow the check result is intentionally NOT saved to quick_check —
-- only the market data point (kpf_ranges) is recorded.
--
-- Takes the raw inputs (postal_code, condition, year_of_construction,
-- kpf_multiplier) and performs the same kpf_ranges upsert as finalize_quick_check
-- Step 1, but completely independent of any quick_check row.
--
-- SECURITY DEFINER so the function can write to kpf_ranges (which has no
-- direct RLS write policy for authenticated users).
-- ==============================================================================

CREATE OR REPLACE FUNCTION upsert_kpf_range(
    p_postal_code           VARCHAR(10),
    p_condition             property_condition,
    p_year_of_construction  INT,
    p_kpf_multiplier        DECIMAL(5, 1)
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_bucket kpf_construction_year_bucket;
BEGIN
    v_bucket := CASE
        WHEN p_year_of_construction < 1918 THEN '<1918'
        WHEN p_year_of_construction < 1950 THEN '1918-1949'
        WHEN p_year_of_construction < 1960 THEN '1950-1959'
        WHEN p_year_of_construction < 1970 THEN '1960-1969'
        WHEN p_year_of_construction < 1980 THEN '1970-1979'
        WHEN p_year_of_construction < 1990 THEN '1980-1989'
        WHEN p_year_of_construction < 2000 THEN '1990-1999'
        WHEN p_year_of_construction < 2010 THEN '2000-2009'
        WHEN p_year_of_construction < 2015 THEN '2010-2014'
        ELSE '2015+'
    END::kpf_construction_year_bucket;

    INSERT INTO kpf_ranges (postal_code, condition, construction_year_bucket, min_value, max_value, sample_size)
    VALUES (p_postal_code, p_condition, v_bucket, p_kpf_multiplier, p_kpf_multiplier, 1)
    ON CONFLICT (postal_code, condition, construction_year_bucket) DO UPDATE
        SET min_value   = LEAST   (kpf_ranges.min_value,  EXCLUDED.min_value),
            max_value   = GREATEST(kpf_ranges.max_value,  EXCLUDED.max_value),
            sample_size = kpf_ranges.sample_size + 1
        WHERE EXCLUDED.min_value < kpf_ranges.min_value
           OR EXCLUDED.max_value > kpf_ranges.max_value;
END;
$$;

GRANT EXECUTE ON FUNCTION upsert_kpf_range(
    VARCHAR, property_condition, INT, DECIMAL
) TO authenticated;