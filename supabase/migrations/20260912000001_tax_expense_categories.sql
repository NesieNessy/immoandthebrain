-- Backs the Steuerunterlagen ("Angefallene Kosten") screen: a property-scoped
-- list of user-defined expense categories (Fahrtkosten, Übernachtungskosten,
-- ...), each with a manually-entered amount and any number of uploaded
-- receipts. Stage 1 is manual entry only — no OCR extraction yet, and no
-- WISO export — so there is nothing here to model for either beyond the
-- elster_reference field below.

CREATE TABLE tax_expense_category (
    tax_expense_category_id  SERIAL                    PRIMARY KEY,
    property_id               INTEGER                   NOT NULL REFERENCES property(property_id) ON DELETE CASCADE,
    sort_order                 INTEGER                   NOT NULL DEFAULT 0,

    label                      TEXT                      NOT NULL,
    amount                     NUMERIC(12,2)             NOT NULL DEFAULT 0,
    -- Free-text ELSTER Anlage V line/field reference, entered by the user —
    -- deliberately not pre-filled with specific line numbers here, since
    -- those change between tax years and should come from the user's own
    -- tax software/advisor, not be guessed by this migration.
    elster_reference           TEXT,

    created_at                 TIMESTAMPTZ               NOT NULL DEFAULT NOW(),
    updated_at                 TIMESTAMPTZ               NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_tax_expense_category_property_id ON tax_expense_category (property_id);

COMMENT ON COLUMN tax_expense_category.elster_reference IS 'User-entered ELSTER Anlage V line/field reference (e.g. "Zeile 35") — Entwicklungsstufe 1 exposes the field but does not pre-populate or validate it.';

-- ==============================================================================
-- CREATE TABLE: tax_expense_document
-- Uploaded receipts per category. property_id is denormalized so the generic
-- /api/property-resources dispatcher (which requires that column on every
-- table it serves) can own the CRUD.
-- ==============================================================================
CREATE TABLE tax_expense_document (
    tax_expense_document_id   SERIAL                    PRIMARY KEY,
    tax_expense_category_id    INTEGER                   NOT NULL REFERENCES tax_expense_category(tax_expense_category_id) ON DELETE CASCADE,
    property_id                 INTEGER                   NOT NULL REFERENCES property(property_id) ON DELETE CASCADE,

    storage_path                 TEXT                      NOT NULL,
    file_name                    TEXT                      NOT NULL,

    created_at                   TIMESTAMPTZ               NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_tax_expense_document_category_id ON tax_expense_document (tax_expense_category_id);
CREATE INDEX idx_tax_expense_document_property_id ON tax_expense_document (property_id);

-- ==============================================================================
-- RLS — identical owner-only shape as the rest of the property-scoped tables.
-- ==============================================================================
ALTER TABLE tax_expense_category ENABLE ROW LEVEL SECURITY;
ALTER TABLE tax_expense_document ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own tax expense categories"
    ON tax_expense_category FOR SELECT
    USING (EXISTS (SELECT 1 FROM property WHERE property.property_id = tax_expense_category.property_id AND property.user_id = auth.uid()));
CREATE POLICY "Users can insert own tax expense categories"
    ON tax_expense_category FOR INSERT
    WITH CHECK (EXISTS (SELECT 1 FROM property WHERE property.property_id = tax_expense_category.property_id AND property.user_id = auth.uid()));
CREATE POLICY "Users can update own tax expense categories"
    ON tax_expense_category FOR UPDATE
    USING (EXISTS (SELECT 1 FROM property WHERE property.property_id = tax_expense_category.property_id AND property.user_id = auth.uid()));
CREATE POLICY "Users can delete own tax expense categories"
    ON tax_expense_category FOR DELETE
    USING (EXISTS (SELECT 1 FROM property WHERE property.property_id = tax_expense_category.property_id AND property.user_id = auth.uid()));

CREATE POLICY "Users can view own tax expense documents"
    ON tax_expense_document FOR SELECT
    USING (EXISTS (SELECT 1 FROM property WHERE property.property_id = tax_expense_document.property_id AND property.user_id = auth.uid()));
CREATE POLICY "Users can insert own tax expense documents"
    ON tax_expense_document FOR INSERT
    WITH CHECK (EXISTS (SELECT 1 FROM property WHERE property.property_id = tax_expense_document.property_id AND property.user_id = auth.uid()));
CREATE POLICY "Users can delete own tax expense documents"
    ON tax_expense_document FOR DELETE
    USING (EXISTS (SELECT 1 FROM property WHERE property.property_id = tax_expense_document.property_id AND property.user_id = auth.uid()));

CREATE OR REPLACE FUNCTION update_tax_expense_category_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER tax_expense_category_updated_at
    BEFORE UPDATE ON tax_expense_category
    FOR EACH ROW EXECUTE FUNCTION update_tax_expense_category_updated_at();

-- ==============================================================================
-- Storage — private bucket for receipts, objects path-scoped as
-- "{auth.uid()}/{propertyId}/{categoryId}/...".
-- ==============================================================================
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
    'tax-expense-documents',
    'tax-expense-documents',
    false,
    10485760, -- 10 MB
    ARRAY['application/pdf', 'image/jpeg', 'image/png', 'image/webp']
)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Users can upload own tax expense files"
    ON storage.objects FOR INSERT
    WITH CHECK (bucket_id = 'tax-expense-documents' AND (storage.foldername(name))[1] = auth.uid()::text);

CREATE POLICY "Users can view own tax expense files"
    ON storage.objects FOR SELECT
    USING (bucket_id = 'tax-expense-documents' AND (storage.foldername(name))[1] = auth.uid()::text);

CREATE POLICY "Users can delete own tax expense files"
    ON storage.objects FOR DELETE
    USING (bucket_id = 'tax-expense-documents' AND (storage.foldername(name))[1] = auth.uid()::text);
