-- Migration: Journal — Devotionals, Prayers, Verses
-- Run in Supabase Dashboard → SQL Editor
-- Safe to run even if devotionals table already exists from devotionals_migration.sql

-- ─── devotionals ─────────────────────────────────────────────────────────────
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
ALTER TABLE devotionals ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'devotionals' AND policyname = 'devotionals_select') THEN
    CREATE POLICY "devotionals_select" ON devotionals FOR SELECT USING (user_id = auth.uid());
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'devotionals' AND policyname = 'devotionals_insert') THEN
    CREATE POLICY "devotionals_insert" ON devotionals FOR INSERT WITH CHECK (user_id = auth.uid() AND ministry_id = auth_ministry_id());
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'devotionals' AND policyname = 'devotionals_update') THEN
    CREATE POLICY "devotionals_update" ON devotionals FOR UPDATE USING (user_id = auth.uid());
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'devotionals' AND policyname = 'devotionals_delete') THEN
    CREATE POLICY "devotionals_delete" ON devotionals FOR DELETE USING (user_id = auth.uid());
  END IF;
END $$;

-- ─── prayers ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS prayers (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  ministry_id UUID NOT NULL REFERENCES ministries(id) ON DELETE CASCADE,
  title       TEXT NOT NULL DEFAULT '',
  content     TEXT NOT NULL DEFAULT '',
  status      TEXT NOT NULL DEFAULT 'praying' CHECK (status IN ('praying', 'answered', 'ongoing')),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS prayers_user_id_idx    ON prayers(user_id);
CREATE INDEX IF NOT EXISTS prayers_created_at_idx ON prayers(created_at DESC);
ALTER TABLE prayers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "prayers_select" ON prayers FOR SELECT USING (user_id = auth.uid());
CREATE POLICY "prayers_insert" ON prayers FOR INSERT WITH CHECK (user_id = auth.uid() AND ministry_id = auth_ministry_id());
CREATE POLICY "prayers_update" ON prayers FOR UPDATE USING (user_id = auth.uid());
CREATE POLICY "prayers_delete" ON prayers FOR DELETE USING (user_id = auth.uid());

-- ─── verses ──────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS verses (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  ministry_id UUID NOT NULL REFERENCES ministries(id) ON DELETE CASCADE,
  reference   TEXT NOT NULL DEFAULT '',
  verse_text  TEXT NOT NULL DEFAULT '',
  note        TEXT NOT NULL DEFAULT '',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS verses_user_id_idx    ON verses(user_id);
CREATE INDEX IF NOT EXISTS verses_created_at_idx ON verses(created_at DESC);
ALTER TABLE verses ENABLE ROW LEVEL SECURITY;
CREATE POLICY "verses_select" ON verses FOR SELECT USING (user_id = auth.uid());
CREATE POLICY "verses_insert" ON verses FOR INSERT WITH CHECK (user_id = auth.uid() AND ministry_id = auth_ministry_id());
CREATE POLICY "verses_update" ON verses FOR UPDATE USING (user_id = auth.uid());
CREATE POLICY "verses_delete" ON verses FOR DELETE USING (user_id = auth.uid());

-- ─── Realtime ────────────────────────────────────────────────────────────────
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'devotionals'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE devotionals;
  END IF;
END $$;
ALTER PUBLICATION supabase_realtime ADD TABLE prayers;
ALTER PUBLICATION supabase_realtime ADD TABLE verses;

-- ─── Storage bucket for devotional images ────────────────────────────────────
INSERT INTO storage.buckets (id, name, public)
VALUES ('devotionals', 'devotionals', true)
ON CONFLICT (id) DO NOTHING;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'objects' AND policyname = 'devotionals_storage_select') THEN
    CREATE POLICY "devotionals_storage_select" ON storage.objects FOR SELECT USING (bucket_id = 'devotionals');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'objects' AND policyname = 'devotionals_storage_insert') THEN
    CREATE POLICY "devotionals_storage_insert" ON storage.objects FOR INSERT WITH CHECK (bucket_id = 'devotionals' AND auth.uid() IS NOT NULL);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'objects' AND policyname = 'devotionals_storage_delete') THEN
    CREATE POLICY "devotionals_storage_delete" ON storage.objects FOR DELETE USING (bucket_id = 'devotionals' AND auth.uid()::text = (storage.foldername(name))[1]);
  END IF;
END $$;
