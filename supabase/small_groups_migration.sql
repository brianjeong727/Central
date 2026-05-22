-- ── small_groups_migration.sql ────────────────────────────────────────────────
-- Small Group Leaders tab: groups, members, DGL availability, DGL assignments

-- ── 1. small_groups ───────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS small_groups (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id         UUID        NOT NULL REFERENCES teams(id)        ON DELETE CASCADE,
  ministry_id     UUID        NOT NULL REFERENCES ministries(id)   ON DELETE CASCADE,
  name            TEXT        NOT NULL,
  leader_id       UUID        REFERENCES profiles(id)              ON DELETE SET NULL,
  type            TEXT        NOT NULL CHECK (type IN ('brothers', 'sisters')),
  paired_group_id UUID        REFERENCES small_groups(id)          ON DELETE SET NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ── 2. small_group_members ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS small_group_members (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id        UUID        NOT NULL REFERENCES small_groups(id) ON DELETE CASCADE,
  user_id         UUID        NOT NULL REFERENCES profiles(id)     ON DELETE CASCADE,
  meal_taken      BOOLEAN     NOT NULL DEFAULT false,
  meal_semester   TEXT        NOT NULL DEFAULT '',
  UNIQUE (group_id, user_id)
);

-- ── 3. dgl_availability ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS dgl_availability (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID        NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  team_id     UUID        NOT NULL REFERENCES teams(id)    ON DELETE CASCADE,
  week_date   DATE        NOT NULL,
  slot        TEXT        NOT NULL CHECK (slot IN ('wednesday_pm', 'friday_sg', 'sunday_service')),
  is_busy     BOOLEAN     NOT NULL DEFAULT false,
  semester    TEXT        NOT NULL,
  CONSTRAINT dgl_availability_unique UNIQUE (user_id, week_date, slot)
);

-- ── 4. dgl_assignments ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS dgl_assignments (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id     UUID        NOT NULL REFERENCES teams(id)      ON DELETE CASCADE,
  ministry_id UUID        NOT NULL REFERENCES ministries(id) ON DELETE CASCADE,
  user_id     UUID        NOT NULL REFERENCES profiles(id)   ON DELETE CASCADE,
  week_date   DATE        NOT NULL,
  slot        TEXT        NOT NULL CHECK (slot IN ('wednesday_pm', 'friday_sg', 'sunday_service')),
  role        TEXT        NOT NULL CHECK (role IN ('leading_pm', 'pm_praise', 'cooking', 'friday_praise', 'congregational_prayer', 'dishes')),
  semester    TEXT        NOT NULL,
  published   BOOLEAN     NOT NULL DEFAULT false,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ── Enable RLS ────────────────────────────────────────────────────────────────
ALTER TABLE small_groups        ENABLE ROW LEVEL SECURITY;
ALTER TABLE small_group_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE dgl_availability    ENABLE ROW LEVEL SECURITY;
ALTER TABLE dgl_assignments     ENABLE ROW LEVEL SECURITY;

-- ── Helper: is the current user a member of a given team? ─────────────────────
-- Reuses auth_has_team_permission from worship_phase1_migration if available.
-- Safe to call even without that function — defined independently below.
CREATE OR REPLACE FUNCTION auth_is_team_member(p_team_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT EXISTS (
    SELECT 1 FROM team_members
    WHERE user_id = auth.uid() AND team_id = p_team_id
  );
$$;

-- ── small_groups policies ─────────────────────────────────────────────────────
-- Ministry members can read groups in their ministry
CREATE POLICY "sg_select_ministry"
  ON small_groups FOR SELECT
  USING (ministry_id = auth_ministry_id());

-- Team members can insert groups
CREATE POLICY "sg_insert_team"
  ON small_groups FOR INSERT
  WITH CHECK (auth_is_team_member(team_id));

-- Team members can update groups (pairing, name changes)
CREATE POLICY "sg_update_team"
  ON small_groups FOR UPDATE
  USING (auth_is_team_member(team_id));

-- Team members can delete their own groups
CREATE POLICY "sg_delete_team"
  ON small_groups FOR DELETE
  USING (auth_is_team_member(team_id));

-- ── small_group_members policies ──────────────────────────────────────────────
-- Ministry members can read group membership
CREATE POLICY "sgm_select_ministry"
  ON small_group_members FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM small_groups sg
      WHERE sg.id = small_group_members.group_id
        AND sg.ministry_id = auth_ministry_id()
    )
  );

-- Users can insert members to a group they lead (leader_id = current user)
-- OR if they are a team member (president can manage all)
CREATE POLICY "sgm_insert_leader"
  ON small_group_members FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM small_groups sg
      WHERE sg.id = small_group_members.group_id
        AND (sg.leader_id = auth.uid() OR auth_is_team_member(sg.team_id))
    )
  );

-- Leaders and team members can update (meal_taken toggle)
CREATE POLICY "sgm_update_leader"
  ON small_group_members FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM small_groups sg
      WHERE sg.id = small_group_members.group_id
        AND (sg.leader_id = auth.uid() OR auth_is_team_member(sg.team_id))
    )
  );

-- Leaders and team members can delete members
CREATE POLICY "sgm_delete_leader"
  ON small_group_members FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM small_groups sg
      WHERE sg.id = small_group_members.group_id
        AND (sg.leader_id = auth.uid() OR auth_is_team_member(sg.team_id))
    )
  );

-- ── dgl_availability policies ─────────────────────────────────────────────────
-- Team members can read all availability on their team
CREATE POLICY "da_select_team"
  ON dgl_availability FOR SELECT
  USING (auth_is_team_member(team_id));

-- Users can insert their own availability
CREATE POLICY "da_insert_own"
  ON dgl_availability FOR INSERT
  WITH CHECK (user_id = auth.uid() AND auth_is_team_member(team_id));

-- Users can update their own availability
CREATE POLICY "da_update_own"
  ON dgl_availability FOR UPDATE
  USING (user_id = auth.uid());

-- Users can delete their own availability
CREATE POLICY "da_delete_own"
  ON dgl_availability FOR DELETE
  USING (user_id = auth.uid());

-- ── dgl_assignments policies ──────────────────────────────────────────────────
-- Team members can read published assignments for their team
-- Unpublished assignments only visible to team members (president sees all)
CREATE POLICY "dasn_select_team"
  ON dgl_assignments FOR SELECT
  USING (
    ministry_id = auth_ministry_id()
    AND auth_is_team_member(team_id)
  );

-- Only team members can insert assignments (president action)
CREATE POLICY "dasn_insert_team"
  ON dgl_assignments FOR INSERT
  WITH CHECK (auth_is_team_member(team_id));

-- Only team members can update (publish, swap)
CREATE POLICY "dasn_update_team"
  ON dgl_assignments FOR UPDATE
  USING (auth_is_team_member(team_id));

-- Only team members can delete
CREATE POLICY "dasn_delete_team"
  ON dgl_assignments FOR DELETE
  USING (auth_is_team_member(team_id));

-- ── Indexes for common query patterns ─────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_small_groups_team         ON small_groups(team_id);
CREATE INDEX IF NOT EXISTS idx_small_groups_ministry     ON small_groups(ministry_id);
CREATE INDEX IF NOT EXISTS idx_small_groups_leader       ON small_groups(leader_id);
CREATE INDEX IF NOT EXISTS idx_sgm_group                 ON small_group_members(group_id);
CREATE INDEX IF NOT EXISTS idx_sgm_user                  ON small_group_members(user_id);
CREATE INDEX IF NOT EXISTS idx_dgl_avail_team_sem        ON dgl_availability(team_id, semester);
CREATE INDEX IF NOT EXISTS idx_dgl_avail_user            ON dgl_availability(user_id);
CREATE INDEX IF NOT EXISTS idx_dgl_assign_team_sem       ON dgl_assignments(team_id, semester);
CREATE INDEX IF NOT EXISTS idx_dgl_assign_user           ON dgl_assignments(user_id);
