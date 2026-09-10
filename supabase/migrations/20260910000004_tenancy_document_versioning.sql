-- Adds document history: uploading into an occupied (tenancy, document_type,
-- tenancy_person_id) slot used to UPDATE the existing row in place, silently
-- discarding the previous file both in storage and in the metadata table —
-- there was never anywhere the old version could be recovered from. From now
-- on the API layer archives the current row (superseded_at) instead of
-- overwriting it, then inserts a new row for the upload — the old file stays
-- in storage and the old row stays queryable, just excluded from the
-- "current document" views by default.

ALTER TABLE tenancy_document ADD COLUMN superseded_at TIMESTAMPTZ;

COMMENT ON COLUMN tenancy_document.superseded_at IS
    'Set when a newer upload replaced this document for the same (tenancy, document_type, tenancy_person_id) slot. NULL = this is the current version.';

-- Fast "current documents only" lookups (the common case everywhere except
-- the Verlauf/history toggle on the documents overview).
CREATE INDEX idx_tenancy_document_current
    ON tenancy_document (tenancy_id, document_type, tenancy_person_id)
    WHERE superseded_at IS NULL;
