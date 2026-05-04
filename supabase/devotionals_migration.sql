-- Migration: Devotionals Journal
-- Run in Supabase Dashboard → SQL Editor

-- 1. Create devotionals table
CREATE TABLE IF NOT EXISTS devotionals (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  ministry_id UUID NOT NULL REFERENCES ministries(id) ON DELETE CASCADE,
  title       TEXT NOT NULL DEFAULT '',
  passage     TEXT NOT NULL DEFAULT '',
  content     TEXT NOT NULL DEFAULT '',
  image_url   TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS devotionals_user_id_idx    ON devotionals(user_id);
CREATE INDEX IF NOT EXISTS devotionals_created_at_idx ON devotionals(created_at DESC);

-- 2. Enable RLS
ALTER TABLE devotionals ENABLE ROW LEVEL SECURITY;

-- 3. Policies — users can only access their own entries
CREATE POLICY "devotionals_select" ON devotionals
  FOR SELECT USING (user_id = auth.uid());

CREATE POLICY "devotionals_insert" ON devotionals
  FOR INSERT WITH CHECK (
    user_id = auth.uid()
    AND ministry_id = auth_ministry_id()
  );

CREATE POLICY "devotionals_update" ON devotionals
  FOR UPDATE USING (user_id = auth.uid());

CREATE POLICY "devotionals_delete" ON devotionals
  FOR DELETE USING (user_id = auth.uid());

-- 4. Add to realtime publication
ALTER PUBLICATION supabase_realtime ADD TABLE devotionals;

-- 5. Storage bucket for devotional images
INSERT INTO storage.buckets (id, name, public)
VALUES ('devotionals', 'devotionals', true)
ON CONFLICT (id) DO NOTHING;

-- Storage policies
CREATE POLICY "devotionals_storage_select" ON storage.objects
  FOR SELECT USING (bucket_id = 'devotionals');

CREATE POLICY "devotionals_storage_insert" ON storage.objects
  FOR INSERT WITH CHECK (
    bucket_id = 'devotionals'
    AND auth.uid() IS NOT NULL
  );

CREATE POLICY "devotionals_storage_update" ON storage.objects
  FOR UPDATE USING (
    bucket_id = 'devotionals'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

CREATE POLICY "devotionals_storage_delete" ON storage.objects
  FOR DELETE USING (
    bucket_id = 'devotionals'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );
