-- ==============================================================================
-- ImmoAndTheBrain – KPF ranges: table + RPC
-- KPF = Kaufpreisfaktor (purchase price factor / gross yield multiplier)
--
-- Sections:
--   1. Type: kpf_construction_year_bucket
--   2. Table: kpf_ranges
--   3. Table: postal_code_to_state  (postal code → region / state mapping)
--   4. RPC:   get_kpf_range (4-level geographic fallback)
-- ==============================================================================

-- ─── 1. Enum type ─────────────────────────────────────────────────────────────

CREATE TYPE kpf_construction_year_bucket AS ENUM (
    '<1918',
    '1918-1949',
    '1950-1959',
    '1960-1969',
    '1970-1979',
    '1980-1989',
    '1990-1999',
    '2000-2009',
    '2010-2014',
    '2015+'
);

-- ─── 2. Table: kpf_ranges ─────────────────────────────────────────────────────
-- Reference lookup table: read-only for app users, maintained by admin.
-- No sequential PK — composite primary key on (postal_code, condition, construction_year_bucket).
-- Depends on: property_condition type (defined in 20260224_property.sql)

CREATE TABLE IF NOT EXISTS kpf_ranges (
    postal_code                 VARCHAR(10)                     NOT NULL,
    condition                   property_condition              NOT NULL,
    construction_year_bucket    kpf_construction_year_bucket    NOT NULL,

    min_value                   DECIMAL(5, 1)                   NOT NULL,
    max_value                   DECIMAL(5, 1)                   NOT NULL,
    sample_size                 INT                             NOT NULL,

    PRIMARY KEY (postal_code, condition, construction_year_bucket),

    CONSTRAINT chk_kpf_value_range    CHECK (max_value >= min_value),
    CONSTRAINT chk_kpf_sample_size    CHECK (sample_size > 0),
    CONSTRAINT chk_kpf_min_positive   CHECK (min_value > 0)
);

-- Index for fast postal-code lookups (condition + bucket covered by PK)
CREATE INDEX IF NOT EXISTS idx_kpf_ranges_postal_code ON kpf_ranges (postal_code);

COMMENT ON TABLE  kpf_ranges                             IS 'Kaufpreisfaktor reference ranges per postal code, property condition and construction year bucket.';
COMMENT ON COLUMN kpf_ranges.postal_code                 IS 'German 5-digit postal code (PLZ).';
COMMENT ON COLUMN kpf_ranges.condition                   IS 'Property condition matching PropertyCondition enum: Sanierungsbedürftig, Standard, Gehoben, Luxus.';
COMMENT ON COLUMN kpf_ranges.construction_year_bucket    IS 'Construction decade bucket, e.g. ''1960-1969'' or ''<1918''.';
COMMENT ON COLUMN kpf_ranges.min_value                   IS 'Lower bound of KPF range (gross yield multiplier).';
COMMENT ON COLUMN kpf_ranges.max_value                   IS 'Upper bound of KPF range (gross yield multiplier).';
COMMENT ON COLUMN kpf_ranges.sample_size                 IS 'Number of transactions used to derive this range.';

-- Row Level Security — authenticated users can read; writes are admin-only
ALTER TABLE kpf_ranges ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view kpf ranges"
    ON kpf_ranges FOR SELECT
    USING (auth.role() = 'authenticated');

-- ─── 3. Table: postal_code_to_state ──────────────────────────────────────────
-- Maps German postal codes to their federal state and region (Kreis/Stadt).
-- Used by the get_kpf_range RPC for geographic fallback lookups.

CREATE TABLE IF NOT EXISTS postal_code_to_state (
    postal_code     VARCHAR(5)      PRIMARY KEY,
    city_name       VARCHAR(100)    NOT NULL,
    region_code     VARCHAR(100)    NOT NULL,   -- Kreis / Landkreis / kreisfreie Stadt
    state_code      VARCHAR(3)      NOT NULL,   -- ISO 3166-2:DE short code (e.g. 'BY', 'BE', 'NW')
    state_name      VARCHAR(50)     NOT NULL    -- Full name e.g. 'Bayern', 'Berlin'
);

CREATE INDEX IF NOT EXISTS idx_pcts_state_code   ON postal_code_to_state (state_code);
CREATE INDEX IF NOT EXISTS idx_pcts_region_code  ON postal_code_to_state (region_code);
CREATE INDEX IF NOT EXISTS idx_pcts_city_name    ON postal_code_to_state (city_name);

COMMENT ON TABLE  postal_code_to_state             IS 'Lookup: German PLZ → city, Kreis, Bundesland. Seed from Destatis PLZ dataset.';
COMMENT ON COLUMN postal_code_to_state.postal_code IS 'German 5-digit postal code (PLZ).';
COMMENT ON COLUMN postal_code_to_state.city_name   IS 'Primary city/municipality name for this PLZ.';
COMMENT ON COLUMN postal_code_to_state.region_code IS 'Kreis or kreisfreie Stadt, e.g. ''München'', ''Rhein-Sieg-Kreis''.';
COMMENT ON COLUMN postal_code_to_state.state_code  IS 'ISO 3166-2:DE without prefix: BY, BE, HH, HB, SH, MV, BB, ST, TH, SN, NI, NW, HE, RP, SL, BW.';
COMMENT ON COLUMN postal_code_to_state.state_name  IS 'Full Bundesland name.';

ALTER TABLE postal_code_to_state ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view postal code mappings"
    ON postal_code_to_state FOR SELECT
    USING (auth.role() = 'authenticated');

-- ─── 4. RPC: get_kpf_range ────────────────────────────────────────────────────
-- Resolves a KPF range for a given postal code, property condition and
-- construction-year bucket using a 4-level geographic fallback chain:
--   Level 1: Exact match         (PLZ + condition + bucket)
--   Level 2: Any bucket          (PLZ + condition, averaged across all buckets)
--   Level 3: Region              (Kreis/Stadt + condition + bucket)
--   Level 4: Federal state       (any condition + any bucket, state-wide average)
--   Level 0: No data found

CREATE OR REPLACE FUNCTION get_kpf_range(
    p_postal_code   VARCHAR(10),
    p_condition     property_condition,
    p_bucket        kpf_construction_year_bucket
)
RETURNS TABLE (
    min_value       DECIMAL(5,1),
    max_value       DECIMAL(5,1),
    sample_size     INT,
    fallback_level  INT,   -- 1=exact, 2=any bucket, 3=region, 4=state, 0=no result
    fallback_hint   TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_state   VARCHAR(3);  -- e.g. 'BY', 'NW', 'BE'
BEGIN
    -- Derive federal state prefix from PLZ
    v_state := (
        SELECT state_code FROM postal_code_to_state
        WHERE postal_code = p_postal_code
        LIMIT 1
    );

    -- Level 1: Exact match (PLZ + condition + bucket)
    RETURN QUERY
    SELECT k.min_value, k.max_value, k.sample_size, 1, NULL::TEXT
    FROM kpf_ranges k
    WHERE k.postal_code = p_postal_code
      AND k.condition   = p_condition
      AND k.construction_year_bucket = p_bucket
    LIMIT 1;
    IF FOUND THEN RETURN; END IF;

    -- Level 2: PLZ + condition, any bucket
    RETURN QUERY
    SELECT AVG(k.min_value)::DECIMAL(5,1), AVG(k.max_value)::DECIMAL(5,1),
           SUM(k.sample_size), 2,
           'Kein exakter Baujahr-Treffer – Durchschnitt aller Baujahre dieser PLZ'
    FROM kpf_ranges k
    WHERE k.postal_code = p_postal_code
      AND k.condition   = p_condition;
    IF FOUND THEN RETURN; END IF;

    -- Level 3: Region (Kreis/Stadt) + condition + bucket
    RETURN QUERY
    SELECT AVG(k.min_value)::DECIMAL(5,1), AVG(k.max_value)::DECIMAL(5,1),
           SUM(k.sample_size), 3,
           'Kein PLZ-Treffer – Daten aus der Region verwendet'
    FROM kpf_ranges k
    JOIN postal_code_to_state pts ON pts.postal_code = k.postal_code
    WHERE pts.region_code = (SELECT region_code FROM postal_code_to_state WHERE postal_code = p_postal_code LIMIT 1)
      AND k.condition     = p_condition
      AND k.construction_year_bucket = p_bucket;
    IF FOUND THEN RETURN; END IF;

    -- Level 4: Federal state + condition, any bucket
    RETURN QUERY
    SELECT AVG(k.min_value)::DECIMAL(5,1), AVG(k.max_value)::DECIMAL(5,1),
           SUM(k.sample_size), 4,
           'Breiter Korridor mangels lokaler Daten – Bundeslanddurchschnitt'
    FROM kpf_ranges k
    JOIN postal_code_to_state pts ON pts.postal_code = k.postal_code
    WHERE pts.state_code = v_state
      AND k.condition    = p_condition;
    IF FOUND THEN RETURN; END IF;

    -- Level 0: No data at all
    RETURN QUERY SELECT NULL::DECIMAL(5,1), NULL::DECIMAL(5,1), 0, 0, 'Keine Vergleichsdaten gefunden'::TEXT;
END;
$$;
