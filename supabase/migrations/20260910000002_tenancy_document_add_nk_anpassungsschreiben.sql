-- Adds 'Nebenkosten-Anpassungsschreiben' as its own document_type, separate
-- from 'Nebenkostenabrechnung' — the two are generated independently on the
-- Nebenkostenabrechnung page and need their own document-box "slot" so an
-- upload of one never overwrites the other.

ALTER TABLE tenancy_document DROP CONSTRAINT tenancy_document_document_type_check;
ALTER TABLE tenancy_document ADD CONSTRAINT tenancy_document_document_type_check
    CHECK (document_type IN ('Ausweis', 'Schufa', 'Bürgschaft', 'Gehaltsnachweise', 'Vormieterbescheinigung', 'Sonstiges', 'Mietvertrag', 'Mieterbescheinigung', 'Mieterhöhungsschreiben', 'Sanierungsanpassungsschreiben', 'Abnahme', 'Nebenkostenabrechnung', 'Nebenkosten-Anpassungsschreiben'));
