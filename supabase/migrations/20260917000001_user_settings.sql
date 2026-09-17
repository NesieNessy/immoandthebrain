-- Backs the redesigned Einstellungen screen: a signature image (alongside
-- the existing profile_picture), a small JSON bag of notification-preference
-- toggles, and a self-service account-deactivation flag.

ALTER TABLE personal_data ADD COLUMN IF NOT EXISTS signature_url TEXT;
ALTER TABLE personal_data ADD COLUMN IF NOT EXISTS notification_preferences JSONB NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE personal_data ADD COLUMN IF NOT EXISTS deactivated_at TIMESTAMPTZ;

-- Avatar + signature images. Public, like property-images — served via
-- their plain public URL, no signed-URL round trip needed at render time.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('user-assets', 'user-assets', true, 4194304, ARRAY['image/jpeg', 'image/png', 'image/webp'])
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Users can upload own user asset files"
    ON storage.objects FOR INSERT
    WITH CHECK (bucket_id = 'user-assets' AND (storage.foldername(name))[1] = auth.uid()::text);

CREATE POLICY "Users can update own user asset files"
    ON storage.objects FOR UPDATE
    USING (bucket_id = 'user-assets' AND (storage.foldername(name))[1] = auth.uid()::text);

CREATE POLICY "Users can delete own user asset files"
    ON storage.objects FOR DELETE
    USING (bucket_id = 'user-assets' AND (storage.foldername(name))[1] = auth.uid()::text);

-- No SELECT policy: the bucket is public, so reads go through the public
-- URL and bypass storage.objects RLS entirely.
