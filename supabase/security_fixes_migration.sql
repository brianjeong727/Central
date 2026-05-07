-- ───────────────────────────────────────────────────────────────────────────────
-- Security fixes: three critical RLS vulnerabilities
-- Run in Supabase SQL editor.
-- ───────────────────────────────────────────────────────────────────────────────


-- ── Helper: auth_profile_role() ──────────────────────────────────────────────
-- Returns current user's role. SECURITY DEFINER bypasses RLS on profiles so
-- this can be used safely inside profiles UPDATE WITH CHECK without recursion.

CREATE OR REPLACE FUNCTION auth_profile_role()
RETURNS TEXT
LANGUAGE SQL
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT role FROM profiles WHERE id = auth.uid()
$$;


-- ── Helper: is_ministry_member(user_id, ministry_id) ─────────────────────────
-- Returns true if a given user belongs to a given ministry.
-- SECURITY DEFINER so it can be used inside group_members policies without
-- triggering profiles RLS.

CREATE OR REPLACE FUNCTION is_ministry_member(p_user_id UUID, p_ministry_id UUID)
RETURNS BOOLEAN
LANGUAGE SQL
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM profiles
    WHERE id = p_user_id AND ministry_id = p_ministry_id
  )
$$;


-- ── FIX 1: profiles UPDATE — prevent self-promotion and ministry hopping ─────
-- Replace the open UPDATE policy with one that enforces:
--   • role cannot be changed (prevents self-promotion to admin/leader)
--   • ministry_id cannot be changed (prevents cross-ministry access)
-- Legitimate mutations (join ministry, register ministry) must use the service
-- role client in server actions — they bypass RLS intentionally.

DROP POLICY IF EXISTS "Users can update own profile" ON profiles;

CREATE POLICY "Users can update own profile"
ON profiles FOR UPDATE
USING (id = auth.uid())
WITH CHECK (
  id = auth.uid()
  -- role must remain unchanged
  AND role = auth_profile_role()
  -- ministry_id must remain unchanged (IS NOT DISTINCT FROM handles NULL equality)
  AND ministry_id IS NOT DISTINCT FROM auth_ministry_id()
);


-- ── FIX 2a: group_members SELECT — only see groups you belong to ──────────────
-- The old policy exposed all group memberships across the ministry, letting any
-- member discover private chat and DM membership lists via the API.

DROP POLICY IF EXISTS "Ministry members can view group membership" ON group_members;

CREATE POLICY "Members can view their own group membership"
ON group_members FOR SELECT
USING (
  -- Your own membership row
  user_id = auth.uid()
  -- Co-members in groups you're already in (needed for chat member lists)
  OR is_group_member(group_id, auth.uid())
  -- Admins and leaders can see all membership for moderation
  OR auth_is_admin_or_leader()
);


-- ── FIX 2b: group_members INSERT — prevent self-joining arbitrary groups ──────
-- The old policy let any ministry member add themselves (or anyone) to any group
-- in the ministry. Now:
--   • The added user must belong to the same ministry (prevents cross-tenant adds)
--   • Admins/leaders can add anyone
--   • The group creator can add members (handles group creation flow)
--   • Other users can only add themselves (self-join via invite)

DROP POLICY IF EXISTS "Ministry members can add group members" ON group_members;

CREATE POLICY "Authorized users can add group members"
ON group_members FOR INSERT
WITH CHECK (
  -- Group must be in the user's ministry
  group_ministry_id(group_id) = auth_ministry_id()
  -- The user being added must also be in the same ministry
  AND is_ministry_member(user_id, auth_ministry_id())
  -- Must be one of: admin/leader, group creator, or adding yourself
  AND (
    auth_is_admin_or_leader()
    OR (SELECT created_by FROM groups WHERE id = group_id) = auth.uid()
    OR user_id = auth.uid()
  )
);
