-- Migration: Allow team presidents to delete their own team
-- Only users with a role named like "President" on that team can delete it
-- (in addition to ministry admins and leaders who could already delete)

-- Helper: check if a user has a president-named role on a given team
CREATE OR REPLACE FUNCTION is_team_president(p_team_id UUID, p_user_id UUID)
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
      AND LOWER(tr.name) LIKE '%president%'
  )
$$;

-- Replace the teams DELETE policy to also allow team presidents
DROP POLICY IF EXISTS "Admins and leaders can delete teams" ON teams;

CREATE POLICY "Admins, leaders, and team presidents can delete teams"
ON teams FOR DELETE
USING (
  ministry_id = auth_ministry_id()
  AND (
    auth_is_admin_or_leader()
    OR is_team_president(id, auth.uid())
  )
);
