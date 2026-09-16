-- The Mieterdaten form marks Nachname/Vorname without the "(optional)"
-- marker for the Hauptmieter (isPrimary), same as it already does for
-- Steuer-ID/Einzugsdatum (see 20260911000003_tenancy_person_primary_required_fields.sql)
-- — extends that same backing constraint to the two name fields, so a
-- primary tenant can't be saved nameless either. Still nullable for
-- non-primary persons.

ALTER TABLE tenancy_person
    ADD CONSTRAINT tenancy_person_primary_last_name_required
        CHECK (NOT is_primary OR last_name IS NOT NULL),
    ADD CONSTRAINT tenancy_person_primary_first_name_required
        CHECK (NOT is_primary OR first_name IS NOT NULL);
