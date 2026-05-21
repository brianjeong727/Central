-- Run this in Supabase SQL Editor.

-- ============================================================
-- Group Generator Tables
-- ============================================================

-- 1. group_sessions
CREATE TABLE IF NOT EXISTS group_sessions (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id      UUID NOT NULL REFERENCES teams(id),
  ministry_id  UUID NOT NULL REFERENCES ministries(id),
  name         TEXT NOT NULL,
  source_type  TEXT NOT NULL,
  source_id    UUID,
  config       JSONB NOT NULL DEFAULT '{}',
  created_by   UUID NOT NULL REFERENCES profiles(id),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE group_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "group_sessions_select"
  ON group_sessions FOR SELECT
  USING (ministry_id = auth_ministry_id());

CREATE POLICY "group_sessions_insert"
  ON group_sessions FOR INSERT
  WITH CHECK (auth_is_admin_or_leader());

CREATE POLICY "group_sessions_delete"
  ON group_sessions FOR DELETE
  USING (auth_is_admin_or_leader());

-- 2. generated_groups
CREATE TABLE IF NOT EXISTS generated_groups (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id  UUID NOT NULL REFERENCES group_sessions(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  order_index INT NOT NULL DEFAULT 0
);

ALTER TABLE generated_groups ENABLE ROW LEVEL SECURITY;

CREATE POLICY "generated_groups_select"
  ON generated_groups FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM group_sessions gs
      WHERE gs.id = session_id
        AND gs.ministry_id = auth_ministry_id()
    )
  );

CREATE POLICY "generated_groups_insert"
  ON generated_groups FOR INSERT
  WITH CHECK (auth_is_admin_or_leader());

CREATE POLICY "generated_groups_delete"
  ON generated_groups FOR DELETE
  USING (auth_is_admin_or_leader());

-- 3. generated_group_members
CREATE TABLE IF NOT EXISTS generated_group_members (
  id       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id UUID NOT NULL REFERENCES generated_groups(id) ON DELETE CASCADE,
  user_id  UUID NOT NULL REFERENCES profiles(id)
);

ALTER TABLE generated_group_members ENABLE ROW LEVEL SECURITY;

CREATE POLICY "generated_group_members_select"
  ON generated_group_members FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM generated_groups gg
      JOIN group_sessions gs ON gs.id = gg.session_id
      WHERE gg.id = group_id
        AND gs.ministry_id = auth_ministry_id()
    )
  );

CREATE POLICY "generated_group_members_insert"
  ON generated_group_members FOR INSERT
  WITH CHECK (auth_is_admin_or_leader());

CREATE POLICY "generated_group_members_delete"
  ON generated_group_members FOR DELETE
  USING (auth_is_admin_or_leader());
