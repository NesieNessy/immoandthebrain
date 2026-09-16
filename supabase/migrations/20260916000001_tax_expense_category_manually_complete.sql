-- Manual override for a Steuerunterlagen category's completeness: a category
-- that genuinely has nothing to upload for a given property (e.g. no
-- Sonderumlagen ever apply there) can be marked "vollständig" by hand so it
-- stops being reported as "Beleg fehlt" everywhere completeness is derived
-- (the per-property Kostenkategorien table, the Steuerübersicht dashboard).
-- Not year-scoped — categories themselves aren't either; this reflects
-- "this category doesn't apply to this property" rather than a per-year fact.

ALTER TABLE tax_expense_category
    ADD COLUMN manually_complete BOOLEAN NOT NULL DEFAULT FALSE;
