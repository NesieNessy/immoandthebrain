-- Backs the "Unterlagen" section of the sale-prep form (Energieausweis/
-- Grundriss/Sonstiges). Modeled directly on tenancy_document, minus the
-- tenancy dimension — one slot per (property_id, document_type). Storage
-- objects live at "{auth.uid()}/{propertyId}/{...}", same private-bucket
-- pattern as tenancy-documents.

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
    'property-documents',
    'property-documents',
    false,
    26214400, -- 25 MB, matching the tenancy-documents bucket's current limit
    ARRAY['application/pdf', 'image/jpeg', 'image/png', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document']
)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Users can upload own property documents"
    ON storage.objects FOR INSERT
    WITH CHECK (bucket_id = 'property-documents' AND (storage.foldername(name))[1] = auth.uid()::text);

CREATE POLICY "Users can view own property documents"
    ON storage.objects FOR SELECT
    USING (bucket_id = 'property-documents' AND (storage.foldername(name))[1] = auth.uid()::text);

CREATE POLICY "Users can update own property documents"
    ON storage.objects FOR UPDATE
    USING (bucket_id = 'property-documents' AND (storage.foldername(name))[1] = auth.uid()::text);

CREATE POLICY "Users can delete own property documents"
    ON storage.objects FOR DELETE
    USING (bucket_id = 'property-documents' AND (storage.foldername(name))[1] = auth.uid()::text);

CREATE TABLE property_document (
    property_document_id  SERIAL                      PRIMARY KEY,
    property_id              INTEGER                     NOT NULL REFERENCES property(property_id) ON DELETE CASCADE,
    document_type             TEXT                        NOT NULL CHECK (document_type IN ('Energieausweis', 'Grundriss', 'Sonstiges')),
    file_name                 TEXT                        NOT NULL,
    storage_path               TEXT                        NOT NULL UNIQUE,
    content_type                TEXT,
    file_size                  INTEGER,
    superseded_at               TIMESTAMPTZ,
    created_at                  TIMESTAMPTZ                 NOT NULL DEFAULT NOW(),
    updated_at                  TIMESTAMPTZ                 NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_property_document_property_id ON property_document (property_id);

-- One current file per (property, document type) slot — applied as a
-- *partial* index from the start (superseded rows are exempt), unlike the
-- non-partial index tenancy_document originally shipped with and had to be
-- fixed later (20260910000005).
CREATE UNIQUE INDEX uq_property_document_slot
    ON property_document (property_id, document_type)
    WHERE superseded_at IS NULL;

COMMENT ON TABLE property_document IS 'Metadata for files uploaded in the sale-prep Unterlagen section; bytes live in the property-documents storage bucket.';

-- No RLS — like property_image, only ever touched through
-- /api/property-documents (pg.Pool, service-role), which enforces ownership
-- itself by joining through property.user_id.

CREATE OR REPLACE FUNCTION update_property_document_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER property_document_updated_at
    BEFORE UPDATE ON property_document
    FOR EACH ROW EXECUTE FUNCTION update_property_document_updated_at();
