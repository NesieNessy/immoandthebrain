-- Links a document to the Detailbewertung it was uploaded in — including one
-- started without an Ersteinschätzung, which has no quick_check row that
-- quick_check_id could point to. A detail check's data is keyed by its
-- workflow id ("quick-check:<id>" or "detail-check:<uuid>", the same key every
-- detail_check_* table uses), so the document stores that.
--
-- No foreign key: workflows have no table of their own. Deleting a detail
-- check unlinks its documents (they stay on the Dokumente page as the user's
-- files); see DELETE in apps/web/src/app/api/detail-checks/route.ts.

ALTER TABLE document ADD COLUMN IF NOT EXISTS detail_check_workflow_id TEXT;

COMMENT ON COLUMN document.detail_check_workflow_id IS 'Workflow der Detailbewertung ("quick-check:<id>" oder "detail-check:<uuid>"), in der das Dokument hochgeladen wurde.';

CREATE INDEX IF NOT EXISTS idx_document_detail_check_workflow_id
    ON document (user_id, detail_check_workflow_id)
    WHERE detail_check_workflow_id IS NOT NULL;

-- Detailbewertung documents uploaded before this column existed were linked
-- through their quick check only.
UPDATE document
SET detail_check_workflow_id = 'quick-check:' || quick_check_id
WHERE category = 'Detailbewertung'
  AND quick_check_id IS NOT NULL
  AND detail_check_workflow_id IS NULL;
