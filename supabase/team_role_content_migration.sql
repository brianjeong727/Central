-- ═══════════════════════════════════════════════════════════════════════════════
-- Migration: Team Role Content — CENTRAL
-- ═══════════════════════════════════════════════════════════════════════════════
--
-- Creates two tables for Student Org Board role tab content:
--   • team_role_descriptions — one editable description per (team, role)
--   • team_role_links        — ordered list of resource links per (team, role)
--
-- RLS:
--   READ  — any member of the same ministry
--   WRITE — ministry admin/leader, OR President of the team, OR member whose
--           role_name exactly matches the row's role_name column
--
-- Depends on: multi_tenant_migration.sql (auth_ministry_id, auth_is_admin_or_leader,
--             teams, team_members, team_roles)
-- ═══════════════════════════════════════════════════════════════════════════════


-- ───────────────────────────────────────────────────────────────────────────────
-- STEP 1: Helper — user_team_role_name()
-- ───────────────────────────────────────────────────────────────────────────────
-- SECURITY DEFINER so it can read team_members + team_roles without recursion
-- inside RLS policies on these new tables.

CREATE OR REPLACE FUNCTION user_team_role_name(p_team_id UUID, p_user_id UUID)
RETURNS TEXT
LANGUAGE SQL
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT tr.name
  FROM team_members tm
  JOIN team_roles tr ON tr.id = tm.role_id
  WHERE tm.team_id = p_team_id
    AND tm.user_id = p_user_id
  LIMIT 1
$$;


-- ───────────────────────────────────────────────────────────────────────────────
-- STEP 2: team_role_descriptions
-- ───────────────────────────────────────────────────────────────────────────────
-- One row per (team_id, role_name). UPSERT-friendly via the unique constraint.

CREATE TABLE IF NOT EXISTS team_role_descriptions (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id     UUID        NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  role_name   TEXT        NOT NULL,
  description TEXT        NOT NULL DEFAULT '',
  created_by  UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  updated_by  UUID                 REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (team_id, role_name)
);

CREATE INDEX IF NOT EXISTS team_role_descriptions_team_id_idx
  ON team_role_descriptions(team_id);

CREATE INDEX IF NOT EXISTS team_role_descriptions_role_name_idx
  ON team_role_descriptions(team_id, role_name);


-- ───────────────────────────────────────────────────────────────────────────────
-- STEP 3: team_role_links
-- ───────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS team_role_links (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id     UUID        NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  role_name   TEXT        NOT NULL,
  title       TEXT        NOT NULL,
  description TEXT        NOT NULL DEFAULT '',
  url         TEXT        NOT NULL,
  created_by  UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  updated_by  UUID                 REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS team_role_links_team_role_idx
  ON team_role_links(team_id, role_name);


-- ───────────────────────────────────────────────────────────────────────────────
-- STEP 4: RLS — team_role_descriptions
-- ───────────────────────────────────────────────────────────────────────────────

ALTER TABLE team_role_descriptions ENABLE ROW LEVEL SECURITY;

-- All ministry members can read
CREATE POLICY "Ministry members can view role descriptions"
ON team_role_descriptions FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM teams t
    WHERE t.id          = team_role_descriptions.team_id
      AND t.ministry_id = auth_ministry_id()
  )
);

-- Write = admin/leader, OR President of the team, OR member whose role matches
CREATE POLICY "Role members can insert role descriptions"
ON team_role_descriptions FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1 FROM teams t
    WHERE t.id          = team_role_descriptions.team_id
      AND t.ministry_id = auth_ministry_id()
  )
  AND (
    auth_is_admin_or_leader()
    OR user_team_role_name(team_role_descriptions.team_id, auth.uid()) = 'President'
    OR user_team_role_name(team_role_descriptions.team_id, auth.uid()) = team_role_descriptions.role_name
  )
);

CREATE POLICY "Role members can update role descriptions"
ON team_role_descriptions FOR UPDATE
USING (
  EXISTS (
    SELECT 1 FROM teams t
    WHERE t.id          = team_role_descriptions.team_id
      AND t.ministry_id = auth_ministry_id()
  )
  AND (
    auth_is_admin_or_leader()
    OR user_team_role_name(team_role_descriptions.team_id, auth.uid()) = 'President'
    OR user_team_role_name(team_role_descriptions.team_id, auth.uid()) = team_role_descriptions.role_name
  )
);


-- ───────────────────────────────────────────────────────────────────────────────
-- STEP 5: RLS — team_role_links
-- ───────────────────────────────────────────────────────────────────────────────

ALTER TABLE team_role_links ENABLE ROW LEVEL SECURITY;

-- All ministry members can read
CREATE POLICY "Ministry members can view role links"
ON team_role_links FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM teams t
    WHERE t.id          = team_role_links.team_id
      AND t.ministry_id = auth_ministry_id()
  )
);

-- Insert
CREATE POLICY "Role members can insert role links"
ON team_role_links FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1 FROM teams t
    WHERE t.id          = team_role_links.team_id
      AND t.ministry_id = auth_ministry_id()
  )
  AND (
    auth_is_admin_or_leader()
    OR user_team_role_name(team_role_links.team_id, auth.uid()) = 'President'
    OR user_team_role_name(team_role_links.team_id, auth.uid()) = team_role_links.role_name
  )
);

-- Update
CREATE POLICY "Role members can update role links"
ON team_role_links FOR UPDATE
USING (
  EXISTS (
    SELECT 1 FROM teams t
    WHERE t.id          = team_role_links.team_id
      AND t.ministry_id = auth_ministry_id()
  )
  AND (
    auth_is_admin_or_leader()
    OR user_team_role_name(team_role_links.team_id, auth.uid()) = 'President'
    OR user_team_role_name(team_role_links.team_id, auth.uid()) = team_role_links.role_name
  )
);

-- Delete
CREATE POLICY "Role members can delete role links"
ON team_role_links FOR DELETE
USING (
  EXISTS (
    SELECT 1 FROM teams t
    WHERE t.id          = team_role_links.team_id
      AND t.ministry_id = auth_ministry_id()
  )
  AND (
    auth_is_admin_or_leader()
    OR user_team_role_name(team_role_links.team_id, auth.uid()) = 'President'
    OR user_team_role_name(team_role_links.team_id, auth.uid()) = team_role_links.role_name
  )
);
