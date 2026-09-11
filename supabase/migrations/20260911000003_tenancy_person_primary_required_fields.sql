-- The Mieterdaten form already shows Steuer-ID and Einzugsdatum without the
-- "(optional)" marker for the Hauptmieter (isPrimary) — this backs that with
-- an actual constraint so a primary tenant can't be saved without them.
-- Both columns stay nullable for non-primary persons.

ALTER TABLE tenancy_person
    ADD CONSTRAINT tenancy_person_primary_tax_id_required
        CHECK (NOT is_primary OR tax_id IS NOT NULL),
    ADD CONSTRAINT tenancy_person_primary_move_in_date_required
        CHECK (NOT is_primary OR move_in_date IS NOT NULL);
