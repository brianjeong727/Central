-- ─────────────────────────────────────────────────────────────────────────────
-- worship_charts_rebuild_migration.sql
--
-- Run this entire file in the Supabase SQL editor.
-- It is safe to run multiple times (IF NOT EXISTS / OR REPLACE throughout).
--
-- What it does:
--   1. Adds chart_url column to worship_songs (missing column causes 400 on
--      every SELECT and PATCH that references it)
--   2. Adds missing storage RLS policies for the worship-charts bucket
--
-- ALSO REQUIRED — manual step in Supabase Dashboard (cannot be done via SQL):
--   Storage → New Bucket
--   Name:   worship-charts
--   Public: YES  ← critical; without this getPublicUrl() URLs return 400
--   If the bucket already exists and returns 400, open it → Settings → set Public.
-- ─────────────────────────────────────────────────────────────────────────────

-- 1. Add chart_url to worship_songs
--    Without this column every .select("...chart_url...") and .update({ chart_url })
--    returns HTTP 400 Bad Request from PostgREST.
ALTER TABLE worship_songs
  ADD COLUMN IF NOT EXISTS chart_url text;

-- 2. Storage RLS policies for worship-charts bucket
--    Enable RLS on storage.objects if not already on (usually already enabled).

-- Allow authenticated users to upload to worship-charts
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects'
      AND policyname = 'worship_charts_upload'
  ) THEN
    EXECUTE $policy$
      CREATE POLICY "worship_charts_upload"
        ON storage.objects FOR INSERT
        TO authenticated
        WITH CHECK (bucket_id = 'worship-charts');
    $policy$;
  END IF;
END $$;

-- Allow public read of worship-charts objects (required for PDF viewer to load charts)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects'
      AND policyname = 'worship_charts_public_read'
  ) THEN
    EXECUTE $policy$
      CREATE POLICY "worship_charts_public_read"
        ON storage.objects FOR SELECT
        TO public
        USING (bucket_id = 'worship-charts');
    $policy$;
  END IF;
END $$;

-- Allow authenticated users to delete their own uploads
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects'
      AND policyname = 'worship_charts_delete'
  ) THEN
    EXECUTE $policy$
      CREATE POLICY "worship_charts_delete"
        ON storage.objects FOR DELETE
        TO authenticated
        USING (bucket_id = 'worship-charts');
    $policy$;
  END IF;
END $$;
