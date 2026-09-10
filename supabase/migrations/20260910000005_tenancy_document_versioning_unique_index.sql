-- Fixes uq_tenancy_document_slot for the versioning support added in
-- 20260910000004: that index was a plain (non-partial) unique constraint on
-- (tenancy_id, document_type, tenancy_person_id) — "one row per slot, period"
-- — which the archive-then-insert flow in the API route violates the moment
-- a second upload happens for the same slot, regardless of superseded_at.
-- Only CURRENT (non-superseded) rows need to be unique per slot; any number
-- of archived versions must be allowed alongside them.

DROP INDEX IF EXISTS uq_tenancy_document_slot;

CREATE UNIQUE INDEX uq_tenancy_document_slot
    ON tenancy_document (tenancy_id, document_type, COALESCE(tenancy_person_id, 0))
    WHERE superseded_at IS NULL;
