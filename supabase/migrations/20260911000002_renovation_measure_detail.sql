-- Backs the per-measure detail page: damage description + photos, a
-- category-based cost-indication reference (computed client-side, nothing
-- to store for it here), a multi-quote list (customer manually enters each
-- offer they received — still no craftsperson portal/login), and a defects
-- list for the completion stage.

ALTER TABLE renovation_measure
    ADD COLUMN category TEXT,
    ADD COLUMN description TEXT,
    ADD COLUMN craftsman_confirmed_completed BOOLEAN NOT NULL DEFAULT FALSE,
    ADD COLUMN craftsman_notes TEXT;

COMMENT ON COLUMN renovation_measure.category IS 'Drives the static Preisindikation lookup on the detail page (Badezimmer, Fenster, ...) — free text, no CHECK, unknown categories just show no estimate.';
COMMENT ON COLUMN renovation_measure.craftsman_confirmed_completed IS 'Owner-entered proxy for "the contractor told me it''s done" — there''s no contractor portal to report it directly.';
COMMENT ON COLUMN renovation_measure.craftsman_notes IS 'Rückfragen des Handwerks — free-text notes field, entered by the owner on the contractor''s behalf (phone/email), not a real two-way message thread.';

-- ==============================================================================
-- CREATE TABLE: renovation_measure_quote
-- One row per offer the owner received for a measure. property_id is
-- denormalized so the generic /api/property-resources dispatcher (which
-- requires that column on every table it serves) can own the CRUD.
-- ==============================================================================
CREATE TABLE renovation_measure_quote (
    renovation_measure_quote_id  SERIAL                    PRIMARY KEY,
    renovation_measure_id         INTEGER                   NOT NULL REFERENCES renovation_measure(renovation_measure_id) ON DELETE CASCADE,
    property_id                    INTEGER                   NOT NULL REFERENCES property(property_id) ON DELETE CASCADE,
    sort_order                      INTEGER                   NOT NULL DEFAULT 0,

    company_name                   TEXT                      NOT NULL,
    cost                           NUMERIC,
    document_path                  TEXT,
    document_file_name             TEXT,
    -- Only one quote per measure should be accepted at a time — enforced in
    -- the app (accepting one clears the others), not by a DB constraint,
    -- since a transient "none accepted" state is normal while switching.
    accepted                       BOOLEAN                   NOT NULL DEFAULT FALSE,

    created_at                     TIMESTAMPTZ               NOT NULL DEFAULT NOW(),
    updated_at                     TIMESTAMPTZ               NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_renovation_measure_quote_measure_id ON renovation_measure_quote (renovation_measure_id);
CREATE INDEX idx_renovation_measure_quote_property_id ON renovation_measure_quote (property_id);

-- ==============================================================================
-- CREATE TABLE: renovation_measure_defect
-- ==============================================================================
CREATE TABLE renovation_measure_defect (
    renovation_measure_defect_id  SERIAL                    PRIMARY KEY,
    renovation_measure_id          INTEGER                   NOT NULL REFERENCES renovation_measure(renovation_measure_id) ON DELETE CASCADE,
    property_id                     INTEGER                   NOT NULL REFERENCES property(property_id) ON DELETE CASCADE,
    sort_order                       INTEGER                   NOT NULL DEFAULT 0,

    description                     TEXT                      NOT NULL,

    created_at                      TIMESTAMPTZ               NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_renovation_measure_defect_measure_id ON renovation_measure_defect (renovation_measure_id);
CREATE INDEX idx_renovation_measure_defect_property_id ON renovation_measure_defect (property_id);

-- ==============================================================================
-- CREATE TABLE: renovation_measure_photo
-- Damage photos ("Bilder der Schäden hochladen").
-- ==============================================================================
CREATE TABLE renovation_measure_photo (
    renovation_measure_photo_id   SERIAL                    PRIMARY KEY,
    renovation_measure_id          INTEGER                   NOT NULL REFERENCES renovation_measure(renovation_measure_id) ON DELETE CASCADE,
    property_id                     INTEGER                   NOT NULL REFERENCES property(property_id) ON DELETE CASCADE,

    storage_path                    TEXT                      NOT NULL,
    file_name                       TEXT                      NOT NULL,

    created_at                      TIMESTAMPTZ               NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_renovation_measure_photo_measure_id ON renovation_measure_photo (renovation_measure_id);
CREATE INDEX idx_renovation_measure_photo_property_id ON renovation_measure_photo (property_id);

-- ==============================================================================
-- RLS — identical owner-only shape as renovation_measure itself
-- ==============================================================================
ALTER TABLE renovation_measure_quote ENABLE ROW LEVEL SECURITY;
ALTER TABLE renovation_measure_defect ENABLE ROW LEVEL SECURITY;
ALTER TABLE renovation_measure_photo ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own renovation measure quotes"
    ON renovation_measure_quote FOR SELECT
    USING (EXISTS (SELECT 1 FROM property WHERE property.property_id = renovation_measure_quote.property_id AND property.user_id = auth.uid()));
CREATE POLICY "Users can insert own renovation measure quotes"
    ON renovation_measure_quote FOR INSERT
    WITH CHECK (EXISTS (SELECT 1 FROM property WHERE property.property_id = renovation_measure_quote.property_id AND property.user_id = auth.uid()));
CREATE POLICY "Users can update own renovation measure quotes"
    ON renovation_measure_quote FOR UPDATE
    USING (EXISTS (SELECT 1 FROM property WHERE property.property_id = renovation_measure_quote.property_id AND property.user_id = auth.uid()));
CREATE POLICY "Users can delete own renovation measure quotes"
    ON renovation_measure_quote FOR DELETE
    USING (EXISTS (SELECT 1 FROM property WHERE property.property_id = renovation_measure_quote.property_id AND property.user_id = auth.uid()));

CREATE POLICY "Users can view own renovation measure defects"
    ON renovation_measure_defect FOR SELECT
    USING (EXISTS (SELECT 1 FROM property WHERE property.property_id = renovation_measure_defect.property_id AND property.user_id = auth.uid()));
CREATE POLICY "Users can insert own renovation measure defects"
    ON renovation_measure_defect FOR INSERT
    WITH CHECK (EXISTS (SELECT 1 FROM property WHERE property.property_id = renovation_measure_defect.property_id AND property.user_id = auth.uid()));
CREATE POLICY "Users can delete own renovation measure defects"
    ON renovation_measure_defect FOR DELETE
    USING (EXISTS (SELECT 1 FROM property WHERE property.property_id = renovation_measure_defect.property_id AND property.user_id = auth.uid()));

CREATE POLICY "Users can view own renovation measure photos"
    ON renovation_measure_photo FOR SELECT
    USING (EXISTS (SELECT 1 FROM property WHERE property.property_id = renovation_measure_photo.property_id AND property.user_id = auth.uid()));
CREATE POLICY "Users can insert own renovation measure photos"
    ON renovation_measure_photo FOR INSERT
    WITH CHECK (EXISTS (SELECT 1 FROM property WHERE property.property_id = renovation_measure_photo.property_id AND property.user_id = auth.uid()));
CREATE POLICY "Users can delete own renovation measure photos"
    ON renovation_measure_photo FOR DELETE
    USING (EXISTS (SELECT 1 FROM property WHERE property.property_id = renovation_measure_photo.property_id AND property.user_id = auth.uid()));

CREATE OR REPLACE FUNCTION update_renovation_measure_quote_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER renovation_measure_quote_updated_at
    BEFORE UPDATE ON renovation_measure_quote
    FOR EACH ROW EXECUTE FUNCTION update_renovation_measure_quote_updated_at();

-- ==============================================================================
-- Storage — private bucket shared by damage photos and quote documents,
-- objects path-scoped as "{auth.uid()}/{propertyId}/{measureId}/...".
-- ==============================================================================
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
    'renovation-measure-files',
    'renovation-measure-files',
    false,
    10485760, -- 10 MB
    ARRAY['application/pdf', 'image/jpeg', 'image/png', 'image/webp']
)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Users can upload own renovation measure files"
    ON storage.objects FOR INSERT
    WITH CHECK (bucket_id = 'renovation-measure-files' AND (storage.foldername(name))[1] = auth.uid()::text);

CREATE POLICY "Users can view own renovation measure files"
    ON storage.objects FOR SELECT
    USING (bucket_id = 'renovation-measure-files' AND (storage.foldername(name))[1] = auth.uid()::text);

CREATE POLICY "Users can delete own renovation measure files"
    ON storage.objects FOR DELETE
    USING (bucket_id = 'renovation-measure-files' AND (storage.foldername(name))[1] = auth.uid()::text);
