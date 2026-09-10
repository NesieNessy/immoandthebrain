-- The sale-prep Unterlagen section was originally one fixed slot per
-- document type (Energieausweis/Grundriss/Sonstiges), replace-only. The
-- owner now wants to attach as many documents as they like, each with its
-- own freely chosen name — so the "one current file per (property, type)"
-- constraint no longer applies, and document_type stops being a meaningful
-- category (every upload is inserted as 'Sonstiges', kept only because the
-- column is still NOT NULL; the user-chosen name lives in file_name).

DROP INDEX IF EXISTS uq_property_document_slot;

ALTER TABLE property_document DROP CONSTRAINT IF EXISTS property_document_document_type_check;
