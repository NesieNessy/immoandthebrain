-- The category total is no longer typed in by hand — it's the sum of what
-- each uploaded Beleg contributes, entered once at upload time. The category
-- keeps its own `amount` as a running total (kept in sync by the upload/
-- delete routes) so the Kostenkategorien table and the Gesamtbetrag tile
-- don't need to re-sum every receipt on every read.

ALTER TABLE tax_expense_document
    ADD COLUMN amount NUMERIC(12,2) NOT NULL DEFAULT 0;

COMMENT ON COLUMN tax_expense_document.amount IS 'Amount this receipt contributes, entered at upload time. The parent category''s amount is a running total of these, not a value the user edits directly.';
