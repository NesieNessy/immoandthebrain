-- Extends the "tenancy-documents" bucket to also accept Word files, not just
-- PDF/JPG/PNG — Mieterbescheinigung, Anpassungsschreiben and Mietvertrag can
-- all be generated/uploaded as an editable .docx, which Supabase Storage was
-- silently rejecting (the client-side upload call returns null with no
-- network request ever reaching the API, since the MIME type is rejected by
-- the bucket itself before that).

UPDATE storage.buckets
SET allowed_mime_types = ARRAY[
    'application/pdf',
    'image/jpeg',
    'image/png',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
]
WHERE id = 'tenancy-documents';
