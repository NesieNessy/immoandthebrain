-- Backs the "Netzwerk" section (WEGs / Handwerker / Forum). This is the
-- first genuinely cross-user content in this app — every other table is
-- scoped to its owner and never read by anyone else. weg/weg_review and
-- forum_post are readable by every signed-in user, writable only by their
-- own author. The Handwerker job board needs no new table: it reads
-- renovation_measure directly (published = true), plus two new columns for
-- a real budget range.

-- ==============================================================================
-- renovation_measure: real Budget-von/-bis range for the Netzwerk job board
-- (previously only a single estimated_cost/quoted_cost existed).
-- ==============================================================================
ALTER TABLE renovation_measure
    ADD COLUMN budget_min NUMERIC,
    ADD COLUMN budget_max NUMERIC;

COMMENT ON COLUMN renovation_measure.budget_min IS 'Netzwerk > Handwerker job-board budget range (von) — only meaningful once published; both budget_min/budget_max null shows "Preis auf Anfrage" there.';
COMMENT ON COLUMN renovation_measure.budget_max IS 'Netzwerk > Handwerker job-board budget range (bis).';

-- ==============================================================================
-- CREATE TABLE: weg
-- Crowd-sourced directory entry ("WEG vorschlagen") — every suggestion is
-- immediately visible to every user (no moderation queue yet; `approved`
-- is a forward-compatible hook for one, not acted on by any code today).
-- ==============================================================================
CREATE TABLE weg (
    weg_id                  SERIAL                    PRIMARY KEY,
    created_by_user_id       UUID                      NOT NULL REFERENCES personal_data(user_id) ON DELETE CASCADE,

    name                     TEXT                      NOT NULL,
    founded_year             INTEGER,
    city                     TEXT                      NOT NULL,
    unit_count               INTEGER,
    -- Free text (e.g. "All-inklusiv", "Hausverwaltung", "HsVw. und NKA") —
    -- no CHECK, same convention as renovation_measure.category.
    service_tier             TEXT                      NOT NULL,
    annual_fee_per_unit       NUMERIC,
    response_time_hours       INTEGER,
    reachability             TEXT,
    website                  TEXT,
    phone                    TEXT,
    email                    TEXT,
    approved                 BOOLEAN                   NOT NULL DEFAULT TRUE,

    created_at               TIMESTAMPTZ               NOT NULL DEFAULT NOW(),
    updated_at               TIMESTAMPTZ               NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_weg_city ON weg (city);

COMMENT ON TABLE weg IS 'Crowd-sourced WEG/property-management-company directory — Netzwerk > WEGs. Visible to every user, editable only by whoever suggested it.';

-- ==============================================================================
-- CREATE TABLE: weg_review
-- One rating+comment per (weg, user) — submitting again replaces the same
-- review rather than adding a second one.
-- ==============================================================================
CREATE TABLE weg_review (
    weg_review_id            SERIAL                    PRIMARY KEY,
    weg_id                   INTEGER                   NOT NULL REFERENCES weg(weg_id) ON DELETE CASCADE,
    user_id                  UUID                      NOT NULL REFERENCES personal_data(user_id) ON DELETE CASCADE,

    rating                   INTEGER                   NOT NULL CHECK (rating BETWEEN 1 AND 5),
    comment                  TEXT,

    created_at               TIMESTAMPTZ               NOT NULL DEFAULT NOW(),

    UNIQUE (weg_id, user_id)
);

CREATE INDEX idx_weg_review_weg_id ON weg_review (weg_id);

-- ==============================================================================
-- CREATE TABLE: forum_post
-- No reply/comment table yet — reply_count is always 0 in the API response
-- until that's built (not represented as a column here to avoid a field
-- that could silently drift from reality).
-- ==============================================================================
CREATE TABLE forum_post (
    forum_post_id             SERIAL                    PRIMARY KEY,
    -- NULL = staff-authored ("inb Expertenkommentar") — there is no
    -- staff/admin role in this app, so this is a sentinel, not a real flag.
    author_user_id            UUID                      REFERENCES personal_data(user_id) ON DELETE SET NULL,

    category                  TEXT                      NOT NULL,
    title                     TEXT                      NOT NULL,
    body                      TEXT                      NOT NULL,
    view_count                INTEGER                   NOT NULL DEFAULT 0,

    created_at                TIMESTAMPTZ               NOT NULL DEFAULT NOW(),
    updated_at                TIMESTAMPTZ               NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_forum_post_category ON forum_post (category);
CREATE INDEX idx_forum_post_created_at ON forum_post (created_at DESC);

-- ==============================================================================
-- RLS — public read, author-only write. Irrelevant to this app's own
-- backend routes (apps/web/src/lib/server/db.ts connects as the Postgres
-- superuser via DATABASE_URL, which bypasses RLS unconditionally — same
-- precedent as property_sale_listing), kept here as defense-in-depth and
-- for consistency with every other table in this app having RLS.
-- ==============================================================================
ALTER TABLE weg ENABLE ROW LEVEL SECURITY;
ALTER TABLE weg_review ENABLE ROW LEVEL SECURITY;
ALTER TABLE forum_post ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Any signed-in user can view WEGs"
    ON weg FOR SELECT
    USING (auth.role() = 'authenticated');
CREATE POLICY "Users can suggest WEGs"
    ON weg FOR INSERT
    WITH CHECK (auth.uid() = created_by_user_id);
CREATE POLICY "Users can edit their own suggested WEGs"
    ON weg FOR UPDATE
    USING (auth.uid() = created_by_user_id);
CREATE POLICY "Users can delete their own suggested WEGs"
    ON weg FOR DELETE
    USING (auth.uid() = created_by_user_id);

CREATE POLICY "Any signed-in user can view WEG reviews"
    ON weg_review FOR SELECT
    USING (auth.role() = 'authenticated');
CREATE POLICY "Users can write their own WEG review"
    ON weg_review FOR INSERT
    WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can edit their own WEG review"
    ON weg_review FOR UPDATE
    USING (auth.uid() = user_id);
CREATE POLICY "Users can delete their own WEG review"
    ON weg_review FOR DELETE
    USING (auth.uid() = user_id);

CREATE POLICY "Any signed-in user can view forum posts"
    ON forum_post FOR SELECT
    USING (auth.role() = 'authenticated');
CREATE POLICY "Users can write their own forum posts"
    ON forum_post FOR INSERT
    WITH CHECK (auth.uid() = author_user_id);
CREATE POLICY "Users can edit their own forum posts"
    ON forum_post FOR UPDATE
    USING (auth.uid() = author_user_id);
CREATE POLICY "Users can delete their own forum posts"
    ON forum_post FOR DELETE
    USING (auth.uid() = author_user_id);

CREATE OR REPLACE FUNCTION update_weg_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER weg_updated_at
    BEFORE UPDATE ON weg
    FOR EACH ROW EXECUTE FUNCTION update_weg_updated_at();

CREATE OR REPLACE FUNCTION update_forum_post_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER forum_post_updated_at
    BEFORE UPDATE ON forum_post
    FOR EACH ROW EXECUTE FUNCTION update_forum_post_updated_at();
