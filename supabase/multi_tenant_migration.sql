-- ═══════════════════════════════════════════════════════════════════════════════
-- Migration: Multi-tenant platform — CENTRAL v2.0
-- ═══════════════════════════════════════════════════════════════════════════════
--
-- Transforms CENTRAL from a single-tenant app into a fully isolated multi-tenant
-- platform. Each ministry gets its own workspace; all data is scoped by ministry_id.
--
-- Run this entire file in Supabase SQL Editor (Project → SQL Editor → New query).
--
-- EXECUTION ORDER:
--   1. Run Steps 1–8  (schema: new tables, new columns, helper functions)
--   2. Run Steps 9–21 (RLS: drop old policies, create new ministry-scoped policies)
--   3. Run Step 22    (backfill: MANUAL — read comments carefully before running)
--
-- BACKFILL IS REQUIRED for existing data. Steps 1–21 are safe to run immediately.
-- Step 22 requires a real ministry admin UUID — do not skip it.
-- ═══════════════════════════════════════════════════════════════════════════════


-- ───────────────────────────────────────────────────────────────────────────────
-- STEP 1: Create ministries table
-- ───────────────────────────────────────────────────────────────────────────────
-- Core multi-tenant anchor. Every piece of data hangs off a ministry row.

CREATE TABLE IF NOT EXISTS ministries (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  name         TEXT        NOT NULL,
  university   TEXT        NOT NULL,
  size         TEXT        NOT NULL CHECK (size IN ('small', 'medium', 'large')),
  invite_code  TEXT        NOT NULL UNIQUE,
  created_by   UUID        NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS ministries_invite_code_idx ON ministries(invite_code);
CREATE INDEX IF NOT EXISTS ministries_created_by_idx  ON ministries(created_by);


-- ───────────────────────────────────────────────────────────────────────────────
-- STEP 2: Add ministry_id to existing tenant tables (nullable for safe backfill)
-- ───────────────────────────────────────────────────────────────────────────────
-- These three tables own all existing single-tenant data. We add ministry_id as
-- nullable now so existing rows are not immediately broken. After the backfill in
-- Step 22 succeeds, the NOT NULL constraints are added (also in Step 22).

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS ministry_id UUID
  REFERENCES ministries(id) ON DELETE SET NULL;

ALTER TABLE groups
  ADD COLUMN IF NOT EXISTS ministry_id UUID
  REFERENCES ministries(id) ON DELETE CASCADE;

ALTER TABLE announcements
  ADD COLUMN IF NOT EXISTS ministry_id UUID
  REFERENCES ministries(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS profiles_ministry_id_idx      ON profiles(ministry_id);
CREATE INDEX IF NOT EXISTS groups_ministry_id_idx        ON groups(ministry_id);
CREATE INDEX IF NOT EXISTS announcements_ministry_id_idx ON announcements(ministry_id);


-- ───────────────────────────────────────────────────────────────────────────────
-- STEP 3: Create teams table
-- ───────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS teams (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  ministry_id  UUID        NOT NULL REFERENCES ministries(id) ON DELETE CASCADE,
  name         TEXT        NOT NULL,
  description  TEXT,
  icon         TEXT,
  created_by   UUID        NOT NULL REFERENCES profiles(id) ON DELETE RESTRICT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS teams_ministry_id_idx ON teams(ministry_id);
CREATE INDEX IF NOT EXISTS teams_created_by_idx  ON teams(created_by);


-- ───────────────────────────────────────────────────────────────────────────────
-- STEP 4: Create team_roles table
-- ───────────────────────────────────────────────────────────────────────────────
-- permissions is a JSONB array of flag strings, e.g.:
--   '["can_manage_worship_set", "can_view_worship_set", "can_generate_slides"]'

CREATE TABLE IF NOT EXISTS team_roles (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id      UUID        NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  name         TEXT        NOT NULL,
  permissions  JSONB       NOT NULL DEFAULT '[]'::JSONB,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS team_roles_team_id_idx ON team_roles(team_id);


-- ───────────────────────────────────────────────────────────────────────────────
-- STEP 5: Create team_members table
-- ───────────────────────────────────────────────────────────────────────────────
-- A user may belong to multiple teams with different roles in each.
-- UNIQUE(team_id, user_id) enforces one role per team per person.

CREATE TABLE IF NOT EXISTS team_members (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id    UUID        NOT NULL REFERENCES teams(id)       ON DELETE CASCADE,
  user_id    UUID        NOT NULL REFERENCES profiles(id)    ON DELETE CASCADE,
  role_id    UUID        NOT NULL REFERENCES team_roles(id)  ON DELETE RESTRICT,
  added_by   UUID        NOT NULL REFERENCES profiles(id)    ON DELETE RESTRICT,
  joined_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(team_id, user_id)
);

CREATE INDEX IF NOT EXISTS team_members_team_id_idx ON team_members(team_id);
CREATE INDEX IF NOT EXISTS team_members_user_id_idx ON team_members(user_id);


-- ───────────────────────────────────────────────────────────────────────────────
-- STEP 6: Helper function — auth_ministry_id()
-- ───────────────────────────────────────────────────────────────────────────────
-- Returns the ministry_id of the currently authenticated user.
-- SECURITY DEFINER + explicit search_path: bypasses RLS on profiles so that
-- policies on other tables can call this function without triggering the profiles
-- RLS check, which would otherwise cause infinite recursion.

CREATE OR REPLACE FUNCTION auth_ministry_id()
RETURNS UUID
LANGUAGE SQL
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT ministry_id FROM profiles WHERE id = auth.uid()
$$;


-- ───────────────────────────────────────────────────────────────────────────────
-- STEP 7: Helper function — auth_is_admin_or_leader()
-- ───────────────────────────────────────────────────────────────────────────────
-- Returns TRUE if the current user has role 'admin' or 'leader' (case-insensitive).
-- SECURITY DEFINER for the same reason as auth_ministry_id().

CREATE OR REPLACE FUNCTION auth_is_admin_or_leader()
RETURNS BOOLEAN
LANGUAGE SQL
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM profiles
    WHERE id = auth.uid()
      AND lower(role) IN ('admin', 'leader')
  )
$$;


-- ───────────────────────────────────────────────────────────────────────────────
-- STEP 7a: Helper function — is_group_member()
-- ───────────────────────────────────────────────────────────────────────────────
-- SECURITY DEFINER: queries group_members without triggering its RLS policy.
-- Breaks the groups ↔ group_members SELECT policy recursion cycle.

CREATE OR REPLACE FUNCTION is_group_member(p_group_id UUID, p_user_id UUID)
RETURNS BOOLEAN
LANGUAGE SQL
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM group_members
    WHERE group_id = p_group_id AND user_id = p_user_id
  )
$$;


-- ───────────────────────────────────────────────────────────────────────────────
-- STEP 7b: Helper function — group_ministry_id()
-- ───────────────────────────────────────────────────────────────────────────────
-- SECURITY DEFINER: queries groups without triggering its RLS policy.
-- Lets group_members policies check ministry scope without hitting groups SELECT RLS.

CREATE OR REPLACE FUNCTION group_ministry_id(p_group_id UUID)
RETURNS UUID
LANGUAGE SQL
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT ministry_id FROM groups WHERE id = p_group_id
$$;


-- ───────────────────────────────────────────────────────────────────────────────
-- STEP 8: Drop all old RLS policies (from previous migrations)
-- ───────────────────────────────────────────────────────────────────────────────
-- These were created by chat_features_migration.sql, chat_settings_migration.sql,
-- messages_rls.sql, and reactions_migration.sql. All are replaced below with
-- ministry-scoped equivalents.

-- groups
DROP POLICY IF EXISTS "Members can view their groups"         ON groups;
DROP POLICY IF EXISTS "Authenticated users can create groups" ON groups;
DROP POLICY IF EXISTS "Creator can update their group"        ON groups;
DROP POLICY IF EXISTS "Members can update their groups"       ON groups;

-- group_members
DROP POLICY IF EXISTS "Members can view membership of their groups" ON group_members;
DROP POLICY IF EXISTS "Authenticated users can add members"         ON group_members;
DROP POLICY IF EXISTS "Users can update their own last_read_at"     ON group_members;
DROP POLICY IF EXISTS "Members can remove from their groups"        ON group_members;

-- messages
DROP POLICY IF EXISTS "Members can read messages in their groups" ON messages;
DROP POLICY IF EXISTS "Members can send messages to their groups" ON messages;

-- message_reactions
DROP POLICY IF EXISTS "Members can view reactions"     ON message_reactions;
DROP POLICY IF EXISTS "Users can insert own reactions" ON message_reactions;
DROP POLICY IF EXISTS "Users can delete own reactions" ON message_reactions;

-- announcements (may or may not exist — safe to drop)
DROP POLICY IF EXISTS "Members can view announcements"   ON announcements;
DROP POLICY IF EXISTS "Leaders can create announcements" ON announcements;
DROP POLICY IF EXISTS "Leaders can update announcements" ON announcements;
DROP POLICY IF EXISTS "Leaders can delete announcements" ON announcements;

-- announcement_views (may or may not exist)
DROP POLICY IF EXISTS "Members can view announcement views"   ON announcement_views;
DROP POLICY IF EXISTS "Members can insert announcement views" ON announcement_views;

-- rsvps (may or may not exist)
DROP POLICY IF EXISTS "Members can view rsvps"   ON rsvps;
DROP POLICY IF EXISTS "Members can insert rsvps" ON rsvps;
DROP POLICY IF EXISTS "Members can delete rsvps" ON rsvps;

-- profiles (may or may not exist)
DROP POLICY IF EXISTS "Users can view profiles in their ministry" ON profiles;
DROP POLICY IF EXISTS "Users can update own profile"              ON profiles;
DROP POLICY IF EXISTS "Users can insert own profile"              ON profiles;


-- ═══════════════════════════════════════════════════════════════════════════════
-- RLS POLICIES — all ministry-scoped
-- ═══════════════════════════════════════════════════════════════════════════════


-- ───────────────────────────────────────────────────────────────────────────────
-- STEP 9: RLS — ministries
-- ───────────────────────────────────────────────────────────────────────────────

ALTER TABLE ministries ENABLE ROW LEVEL SECURITY;

-- Any authenticated user can browse ministries (needed for /join discovery flow)
CREATE POLICY "Anyone can view ministries"
ON ministries FOR SELECT
USING (auth.uid() IS NOT NULL);

-- Any authenticated user can register a new ministry (onboarding wizard)
CREATE POLICY "Anyone can create a ministry"
ON ministries FOR INSERT
WITH CHECK (
  auth.uid() IS NOT NULL
  AND created_by = auth.uid()
);

-- Only the founding admin (created_by) can update ministry metadata
CREATE POLICY "Ministry admin can update their ministry"
ON ministries FOR UPDATE
USING (created_by = auth.uid());


-- ───────────────────────────────────────────────────────────────────────────────
-- STEP 10: RLS — profiles
-- ───────────────────────────────────────────────────────────────────────────────
-- NOTE: auth_ministry_id() is SECURITY DEFINER, so querying profiles inside a
-- profiles RLS policy does not recurse — it bypasses RLS on that internal query.

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

-- Members can see other members in the same ministry.
-- The `OR id = auth.uid()` covers newly-signed-up users who have no ministry yet.
CREATE POLICY "Ministry members can view profiles"
ON profiles FOR SELECT
USING (
  ministry_id = auth_ministry_id()
  OR id = auth.uid()
);

-- Signup: users create their own profile row
CREATE POLICY "Users can insert own profile"
ON profiles FOR INSERT
WITH CHECK (id = auth.uid());

-- Users can only edit their own profile
CREATE POLICY "Users can update own profile"
ON profiles FOR UPDATE
USING (id = auth.uid());


-- ───────────────────────────────────────────────────────────────────────────────
-- STEP 11: RLS — groups
-- ───────────────────────────────────────────────────────────────────────────────
-- Uses is_group_member() (SECURITY DEFINER) instead of a direct EXISTS subquery
-- on group_members to avoid the groups ↔ group_members SELECT policy cycle.

ALTER TABLE groups ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Ministry members can view their groups"
ON groups FOR SELECT
USING (
  ministry_id = auth_ministry_id()
  AND is_group_member(id, auth.uid())
);

-- Any ministry member can create a group within their own ministry
CREATE POLICY "Ministry members can create groups"
ON groups FOR INSERT
WITH CHECK (
  ministry_id = auth_ministry_id()
  AND auth.uid() IS NOT NULL
);

CREATE POLICY "Ministry members can update their groups"
ON groups FOR UPDATE
USING (
  ministry_id = auth_ministry_id()
  AND created_by = auth.uid()
);


-- ───────────────────────────────────────────────────────────────────────────────
-- STEP 12: RLS — group_members
-- ───────────────────────────────────────────────────────────────────────────────
-- Uses group_ministry_id() (SECURITY DEFINER) instead of a direct JOIN/subquery
-- on groups to avoid triggering the groups SELECT policy and causing recursion.

ALTER TABLE group_members ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Ministry members can view group membership"
ON group_members FOR SELECT
USING (
  group_ministry_id(group_id) = auth_ministry_id()
);

CREATE POLICY "Ministry members can add group members"
ON group_members FOR INSERT
WITH CHECK (
  group_ministry_id(group_id) = auth_ministry_id()
);

-- Users can only update their own last_read_at
CREATE POLICY "Users can update own last_read_at"
ON group_members FOR UPDATE
USING (user_id = auth.uid());

CREATE POLICY "Members can leave or be removed from groups"
ON group_members FOR DELETE
USING (
  -- Self-remove always
  user_id = auth.uid()
  -- Admin/leader can remove anyone (is_group_member confirms they belong)
  OR (
    auth_is_admin_or_leader()
    AND is_group_member(group_id, auth.uid())
  )
  -- Any member can remove others from non-church (my/dm) groups
  OR (
    is_group_member(group_id, auth.uid())
    AND group_ministry_id(group_id) = auth_ministry_id()
    AND (SELECT type FROM groups WHERE id = group_id) != 'church'
  )
);


-- ───────────────────────────────────────────────────────────────────────────────
-- STEP 13: RLS — messages
-- ───────────────────────────────────────────────────────────────────────────────

ALTER TABLE messages ENABLE ROW LEVEL SECURITY;

-- Must be a group member to read messages in that group
CREATE POLICY "Group members can read messages"
ON messages FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM group_members
    WHERE group_members.group_id = messages.group_id
      AND group_members.user_id  = auth.uid()
  )
);

-- Must be a group member, and can only send as yourself
CREATE POLICY "Group members can send messages"
ON messages FOR INSERT
WITH CHECK (
  sender_id = auth.uid()
  AND EXISTS (
    SELECT 1 FROM group_members
    WHERE group_members.group_id = messages.group_id
      AND group_members.user_id  = auth.uid()
  )
);

-- Senders can delete their own messages
CREATE POLICY "Senders can delete own messages"
ON messages FOR DELETE
USING (sender_id = auth.uid());


-- ───────────────────────────────────────────────────────────────────────────────
-- STEP 14: RLS — message_reactions
-- ───────────────────────────────────────────────────────────────────────────────

ALTER TABLE message_reactions ENABLE ROW LEVEL SECURITY;

-- Can see reactions on messages in groups the user belongs to
CREATE POLICY "Group members can view reactions"
ON message_reactions FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM messages m
    JOIN group_members gm ON gm.group_id = m.group_id
    WHERE m.id       = message_reactions.message_id
      AND gm.user_id = auth.uid()
  )
);

-- Can only react as yourself
CREATE POLICY "Users can insert own reactions"
ON message_reactions FOR INSERT
WITH CHECK (user_id = auth.uid());

-- Can only remove your own reactions
CREATE POLICY "Users can delete own reactions"
ON message_reactions FOR DELETE
USING (user_id = auth.uid());


-- ───────────────────────────────────────────────────────────────────────────────
-- STEP 15: RLS — announcements
-- ───────────────────────────────────────────────────────────────────────────────
-- Audience filtering (all / grad year / group) is handled at the application
-- layer. The DB policy just enforces the ministry boundary.

ALTER TABLE announcements ENABLE ROW LEVEL SECURITY;

-- All ministry members can read announcements for their ministry
CREATE POLICY "Ministry members can view announcements"
ON announcements FOR SELECT
USING (ministry_id = auth_ministry_id());

-- Admin/leader can create announcements within their ministry
CREATE POLICY "Admins and leaders can create announcements"
ON announcements FOR INSERT
WITH CHECK (
  ministry_id = auth_ministry_id()
  AND auth_is_admin_or_leader()
);

-- Admin/leader can edit announcements in their ministry
CREATE POLICY "Admins and leaders can update announcements"
ON announcements FOR UPDATE
USING (
  ministry_id = auth_ministry_id()
  AND auth_is_admin_or_leader()
);

-- Admin/leader can delete announcements in their ministry
CREATE POLICY "Admins and leaders can delete announcements"
ON announcements FOR DELETE
USING (
  ministry_id = auth_ministry_id()
  AND auth_is_admin_or_leader()
);


-- ───────────────────────────────────────────────────────────────────────────────
-- STEP 16: RLS — announcement_views
-- ───────────────────────────────────────────────────────────────────────────────

ALTER TABLE announcement_views ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Ministry members can view announcement views"
ON announcement_views FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM announcements a
    WHERE a.id          = announcement_views.announcement_id
      AND a.ministry_id = auth_ministry_id()
  )
);

-- Users mark their own views; announcement must belong to their ministry
CREATE POLICY "Users can mark announcements viewed"
ON announcement_views FOR INSERT
WITH CHECK (
  user_id = auth.uid()
  AND EXISTS (
    SELECT 1 FROM announcements a
    WHERE a.id          = announcement_views.announcement_id
      AND a.ministry_id = auth_ministry_id()
  )
);


-- ───────────────────────────────────────────────────────────────────────────────
-- STEP 17: RLS — rsvps
-- ───────────────────────────────────────────────────────────────────────────────

ALTER TABLE rsvps ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Ministry members can view rsvps"
ON rsvps FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM announcements a
    WHERE a.id          = rsvps.announcement_id
      AND a.ministry_id = auth_ministry_id()
  )
);

-- Users RSVP as themselves; announcement must be in their ministry
CREATE POLICY "Users can rsvp to their ministry events"
ON rsvps FOR INSERT
WITH CHECK (
  user_id = auth.uid()
  AND EXISTS (
    SELECT 1 FROM announcements a
    WHERE a.id          = rsvps.announcement_id
      AND a.ministry_id = auth_ministry_id()
  )
);

-- Users can cancel their own RSVP
CREATE POLICY "Users can cancel own rsvp"
ON rsvps FOR DELETE
USING (user_id = auth.uid());


-- ───────────────────────────────────────────────────────────────────────────────
-- STEP 18: RLS — teams
-- ───────────────────────────────────────────────────────────────────────────────

ALTER TABLE teams ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Ministry members can view teams"
ON teams FOR SELECT
USING (ministry_id = auth_ministry_id());

CREATE POLICY "Admins and leaders can create teams"
ON teams FOR INSERT
WITH CHECK (
  ministry_id = auth_ministry_id()
  AND auth_is_admin_or_leader()
);

CREATE POLICY "Admins and leaders can update teams"
ON teams FOR UPDATE
USING (
  ministry_id = auth_ministry_id()
  AND auth_is_admin_or_leader()
);

CREATE POLICY "Admins and leaders can delete teams"
ON teams FOR DELETE
USING (
  ministry_id = auth_ministry_id()
  AND auth_is_admin_or_leader()
);


-- ───────────────────────────────────────────────────────────────────────────────
-- STEP 7c: Helper function — is_team_member()
-- ───────────────────────────────────────────────────────────────────────────────
-- SECURITY DEFINER: queries team_members without triggering its RLS policy.
-- Breaks the team_members self-referential INSERT/DELETE policy recursion.

CREATE OR REPLACE FUNCTION is_team_member(p_team_id UUID, p_user_id UUID)
RETURNS BOOLEAN
LANGUAGE SQL
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM team_members
    WHERE team_id = p_team_id AND user_id = p_user_id
  )
$$;


-- ───────────────────────────────────────────────────────────────────────────────
-- STEP 7d: Helper function — user_can_manage_team()
-- ───────────────────────────────────────────────────────────────────────────────
-- SECURITY DEFINER: JOINs team_members + team_roles without triggering their RLS.
-- Breaks infinite recursion in team_roles INSERT/UPDATE policies (which join
-- team_roles inside a team_roles policy) and team_members DELETE.

CREATE OR REPLACE FUNCTION user_can_manage_team(p_team_id UUID, p_user_id UUID)
RETURNS BOOLEAN
LANGUAGE SQL
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM team_members tm
    JOIN team_roles tr ON tr.id = tm.role_id
    WHERE tm.team_id = p_team_id
      AND tm.user_id = p_user_id
      AND tr.permissions @> '["can_manage_team"]'::JSONB
  )
$$;


-- ───────────────────────────────────────────────────────────────────────────────
-- STEP 19: RLS — team_roles
-- ───────────────────────────────────────────────────────────────────────────────
-- Uses user_can_manage_team() (SECURITY DEFINER) to avoid JOIN-ing team_roles
-- inside a team_roles policy, which would cause infinite recursion.

ALTER TABLE team_roles ENABLE ROW LEVEL SECURITY;

-- All ministry members can read role definitions
CREATE POLICY "Ministry members can view team roles"
ON team_roles FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM teams
    WHERE teams.id          = team_roles.team_id
      AND teams.ministry_id = auth_ministry_id()
  )
);

-- Admin/leader or can_manage_team holder can create roles
CREATE POLICY "Team managers can create team roles"
ON team_roles FOR INSERT
WITH CHECK (
  auth_is_admin_or_leader()
  OR user_can_manage_team(team_roles.team_id, auth.uid())
);

-- Same gate for updates
CREATE POLICY "Team managers can update team roles"
ON team_roles FOR UPDATE
USING (
  auth_is_admin_or_leader()
  OR user_can_manage_team(team_roles.team_id, auth.uid())
);


-- ───────────────────────────────────────────────────────────────────────────────
-- STEP 20: RLS — team_members
-- ───────────────────────────────────────────────────────────────────────────────
-- Uses is_team_member() and user_can_manage_team() (SECURITY DEFINER) to avoid
-- team_members self-referential subqueries causing recursion.

ALTER TABLE team_members ENABLE ROW LEVEL SECURITY;

-- All ministry members can see team rosters
CREATE POLICY "Ministry members can view team members"
ON team_members FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM teams
    WHERE teams.id          = team_members.team_id
      AND teams.ministry_id = auth_ministry_id()
  )
);

-- Any existing member of that team can add new members; admin/leader can always add
CREATE POLICY "Team members or admins can add team members"
ON team_members FOR INSERT
WITH CHECK (
  auth_is_admin_or_leader()
  OR is_team_member(team_members.team_id, auth.uid())
);

-- Self-remove always; can_manage_team or admin/leader can remove others
CREATE POLICY "Team members can leave or be removed"
ON team_members FOR DELETE
USING (
  user_id = auth.uid()
  OR auth_is_admin_or_leader()
  OR user_can_manage_team(team_members.team_id, auth.uid())
);


-- ═══════════════════════════════════════════════════════════════════════════════
-- STEP 21: Realtime — ensure group_members is still publishing
-- ═══════════════════════════════════════════════════════════════════════════════
-- Already added by read_receipts_migration.sql; safe to re-run (idempotent).

ALTER TABLE group_members REPLICA IDENTITY FULL;


-- ═══════════════════════════════════════════════════════════════════════════════
-- STEP 22: BACKFILL — existing single-tenant data  ⚠️  MANUAL — READ FIRST
-- ═══════════════════════════════════════════════════════════════════════════════
--
-- All statements in this section are commented out intentionally.
-- Run them ONE AT A TIME in the Supabase SQL Editor after Steps 1–21 complete.
--
-- You need your ministry admin's UUID from auth.users. Find it at:
--   Supabase Dashboard → Authentication → Users → (your account) → Copy UUID
--
-- ─── 22a. Create the existing ministry row ────────────────────────────────────
--
-- Replace '<ADMIN_USER_UUID>' with the real UUID before running.
-- Capture the returned `id` — you need it in 22b.
--
-- INSERT INTO ministries (name, university, size, invite_code, created_by)
-- VALUES (
--   'Central Church Student Fellowship',
--   'University of Pittsburgh',
--   'medium',
--   'CCSF2026',
--   '<ADMIN_USER_UUID>'
-- )
-- RETURNING id;
--
-- ─── 22b. Backfill ministry_id on all existing rows ──────────────────────────
--
-- Replace '<MINISTRY_UUID>' with the UUID returned from 22a.
--
-- UPDATE profiles      SET ministry_id = '<MINISTRY_UUID>' WHERE ministry_id IS NULL;
-- UPDATE groups        SET ministry_id = '<MINISTRY_UUID>' WHERE ministry_id IS NULL;
-- UPDATE announcements SET ministry_id = '<MINISTRY_UUID>' WHERE ministry_id IS NULL;
--
-- ─── 22c. Verify — all rows should return 0 ──────────────────────────────────
--
-- SELECT COUNT(*) FROM profiles      WHERE ministry_id IS NULL;
-- SELECT COUNT(*) FROM groups        WHERE ministry_id IS NULL;
-- SELECT COUNT(*) FROM announcements WHERE ministry_id IS NULL;
--
-- ─── 22d. Enforce NOT NULL once 22c shows all zeros ──────────────────────────
--
-- ⚠️  WARNING: Do NOT run the profiles line until a ministry-linking step is
-- built into the signup flow. The handle_new_user trigger inserts profile rows
-- WITHOUT ministry_id (users link a ministry afterwards via /join). If profiles
-- has NOT NULL on ministry_id, every new signup will fail with
-- "Database error saving new user". The groups/announcements lines are safe
-- to enforce immediately since those rows are only created post-join.
--
-- ALTER TABLE profiles      ALTER COLUMN ministry_id SET NOT NULL;  -- ⚠️ see above
-- ALTER TABLE groups        ALTER COLUMN ministry_id SET NOT NULL;
-- ALTER TABLE announcements ALTER COLUMN ministry_id SET NOT NULL;
--
-- ─── 22e. Update the ministry admin's role in profiles ───────────────────────
--
-- UPDATE profiles SET role = 'admin' WHERE id = '<ADMIN_USER_UUID>';
--
-- ═══════════════════════════════════════════════════════════════════════════════
-- END OF MIGRATION
-- ═══════════════════════════════════════════════════════════════════════════════
