-- Fix: team_roles had no DELETE policy, so Supabase RLS silently blocked deletions.
-- Also make role_id nullable with ON DELETE SET NULL so the pre-delete nullification
-- step in handleDeleteRole can succeed when members are assigned to the deleted role.

-- 1. Make role_id nullable and cascade NULLs on role deletion
ALTER TABLE team_members ALTER COLUMN role_id DROP NOT NULL;

ALTER TABLE team_members DROP CONSTRAINT IF EXISTS team_members_role_id_fkey;
ALTER TABLE team_members
  ADD CONSTRAINT team_members_role_id_fkey
  FOREIGN KEY (role_id) REFERENCES team_roles(id) ON DELETE SET NULL;

-- 2. Add the missing DELETE policy for team_roles (mirrors the UPDATE policy gate)
CREATE POLICY "Team managers can delete team roles"
ON team_roles FOR DELETE
USING (
  auth_is_admin_or_leader()
  OR user_can_manage_team(team_roles.team_id, auth.uid())
);
