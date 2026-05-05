-- ── worship_phase1_migration.sql ─────────────────────────────────────────────
-- Phase 1: Praise Team scheduling and availability tables

-- 1. worship_weeks — one row per Sunday a worship set is planned
CREATE TABLE worship_weeks (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id     uuid        NOT NULL REFERENCES teams(id)      ON DELETE CASCADE,
  ministry_id uuid        NOT NULL REFERENCES ministries(id) ON DELETE CASCADE,
  week_date   date        NOT NULL,
  leader_id   uuid        REFERENCES profiles(id)            ON DELETE SET NULL,
  status      text        NOT NULL DEFAULT 'draft'
                          CHECK (status IN ('draft', 'filled', 'confirmed')),
  created_at  timestamptz NOT NULL DEFAULT now()
);

-- 2. worship_roles — which member plays which part for a given week
CREATE TABLE worship_roles (
  id        uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  week_id   uuid        NOT NULL REFERENCES worship_weeks(id) ON DELETE CASCADE,
  user_id   uuid        NOT NULL REFERENCES profiles(id)      ON DELETE CASCADE,
  role_name text        NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- 3. worship_availability — member availability per week date
CREATE TABLE worship_availability (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id      uuid        NOT NULL REFERENCES teams(id)    ON DELETE CASCADE,
  user_id      uuid        NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  week_date    date        NOT NULL,
  is_available boolean     NOT NULL,
  created_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (team_id, user_id, week_date)
);

-- ── Enable RLS ────────────────────────────────────────────────────────────────
ALTER TABLE worship_weeks       ENABLE ROW LEVEL SECURITY;
ALTER TABLE worship_roles       ENABLE ROW LEVEL SECURITY;
ALTER TABLE worship_availability ENABLE ROW LEVEL SECURITY;

-- ── Helper: does the current user hold a specific permission on a team? ────────
-- Uses SECURITY DEFINER to avoid recursion (same pattern as auth_ministry_id).
CREATE OR REPLACE FUNCTION auth_has_team_permission(p_team_id uuid, p_permission text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM team_members tm
    JOIN team_roles   tr ON tr.id = tm.role_id
    WHERE tm.user_id  = auth.uid()
      AND tm.team_id  = p_team_id
      AND tr.permissions @> to_jsonb(ARRAY[p_permission])
  );
$$;

-- ── worship_weeks policies ────────────────────────────────────────────────────

-- Any ministry member may read weeks in their ministry
CREATE POLICY "ww_select_ministry"
  ON worship_weeks FOR SELECT
  USING (ministry_id = auth_ministry_id());

-- Only managers (can_manage_worship_set) may create weeks
CREATE POLICY "ww_insert_managers"
  ON worship_weeks FOR INSERT
  WITH CHECK (auth_has_team_permission(team_id, 'can_manage_worship_set'));

-- Only managers may update weeks (status, leader changes)
CREATE POLICY "ww_update_managers"
  ON worship_weeks FOR UPDATE
  USING (auth_has_team_permission(team_id, 'can_manage_worship_set'));

-- ── worship_roles policies ────────────────────────────────────────────────────

-- Any ministry member may read roles for their ministry's weeks
CREATE POLICY "wr_select_ministry"
  ON worship_roles FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM worship_weeks ww
      WHERE ww.id = worship_roles.week_id
        AND ww.ministry_id = auth_ministry_id()
    )
  );

-- Only managers may assign members to a week
CREATE POLICY "wr_insert_managers"
  ON worship_roles FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM worship_weeks ww
      WHERE ww.id = worship_roles.week_id
        AND auth_has_team_permission(ww.team_id, 'can_manage_worship_set')
    )
  );

-- Only managers may remove members from a week
CREATE POLICY "wr_delete_managers"
  ON worship_roles FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM worship_weeks ww
      WHERE ww.id = worship_roles.week_id
        AND auth_has_team_permission(ww.team_id, 'can_manage_worship_set')
    )
  );

-- ── worship_availability policies ────────────────────────────────────────────

-- All team members may read availability for their team
CREATE POLICY "wa_select_team_members"
  ON worship_availability FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM team_members tm
      WHERE tm.user_id = auth.uid()
        AND tm.team_id = worship_availability.team_id
    )
  );

-- Any team member may record their own availability
CREATE POLICY "wa_insert_own"
  ON worship_availability FOR INSERT
  WITH CHECK (
    user_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM team_members tm
      WHERE tm.user_id = auth.uid()
        AND tm.team_id = worship_availability.team_id
    )
  );

-- Users may only update their own row
CREATE POLICY "wa_update_own"
  ON worship_availability FOR UPDATE
  USING (user_id = auth.uid());
