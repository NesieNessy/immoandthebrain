-- Raises the "tenancy-documents" bucket's upload size limit from 10 MB to
-- 25 MB. 10 MB is fine for anything this app generates itself (a compressed
-- JPEG-based PDF or a text-only Word document), but a real-world scanned
-- Nebenkostenabrechnung the landlord uploads manually — several pages from a
-- Hausverwaltung's scanner — routinely lands in the 10-20 MB range on its
-- own, with no client-side compression possible for a file that already
-- exists as-is.

UPDATE storage.buckets
SET file_size_limit = 26214400 -- 25 MB
WHERE id = 'tenancy-documents';
