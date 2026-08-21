-- profile-images: pin writes to the caller's own root-level IMAGE key.
-- APPLIED 2026-08-19 via MCP. Reviewed before + after.
--
-- The old predicate matched split_part(name,'.',1) — everything before the FIRST
-- dot — so any authenticated user could write `<their-uid>.x/evil.html` at any
-- depth, publicly fetchable at 200 on the Supabase domain. Proven live in review.
--
-- Constraining the extension's SHAPE (<=5 alphanumerics) was NOT enough: it still
-- admitted `<uid>.html` and `<uid>.svg`, and svg executes script on direct
-- navigation. The predicate now pins the extension to the same image SET the
-- uploader clamps to (profile-tab.tsx ALLOWED_EXT), so the two cannot drift.
--
-- ALTER, not DROP+CREATE: dropping leaves a window with NO insert policy, during
-- which every upload in flight is denied. lock_timeout because policy DDL takes
-- ACCESS EXCLUSIVE on storage.objects — every bucket, not just this one.
--
-- Verified after: all 6 live objects still match their own owner (nobody lost the
-- ability to replace or remove their photo); traversal, .html and .svg all reject.

SET LOCAL lock_timeout = '3s';

ALTER POLICY "Users can upload their own avatar" ON storage.objects
  WITH CHECK (bucket_id = 'profile-images'
    AND name ~ ('^' || (auth.uid())::text || '\.(jpe?g|png|webp|gif|hei[cf]|avif)$'));

-- Both halves spelled out: this governs the upsert path (INSERT … ON CONFLICT DO
-- UPDATE), where USING checks the old row and WITH CHECK the new one.
ALTER POLICY "Users can update their own avatar" ON storage.objects
  USING (bucket_id = 'profile-images'
    AND name ~ ('^' || (auth.uid())::text || '\.(jpe?g|png|webp|gif|hei[cf]|avif)$'))
  WITH CHECK (bucket_id = 'profile-images'
    AND name ~ ('^' || (auth.uid())::text || '\.(jpe?g|png|webp|gif|hei[cf]|avif)$'));

ALTER POLICY "Users can delete their own avatar" ON storage.objects
  USING (bucket_id = 'profile-images'
    AND name ~ ('^' || (auth.uid())::text || '\.(jpe?g|png|webp|gif|hei[cf]|avif)$'));

-- Second, policy-independent gate. Content-type is caller-supplied and echoed on
-- the public endpoint, so a key-shape rule alone can never stop `text/html`.
UPDATE storage.buckets
SET allowed_mime_types = ARRAY[
  'image/jpeg','image/png','image/webp','image/gif','image/heic','image/heif','image/avif'
]
WHERE id = 'profile-images';
