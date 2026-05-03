-- Seed: Add Brian (bjj46@pitt.edu) to Small Group Leaders team
-- Run in Supabase Dashboard → SQL Editor

DO $$
DECLARE
  v_user_id    UUID;
  v_team_id    UUID;
  v_role_id    UUID;
BEGIN
  -- Resolve Brian's profile ID from auth email
  SELECT p.id INTO v_user_id
  FROM profiles p
  JOIN auth.users u ON u.id = p.id
  WHERE u.email = 'bjj46@pitt.edu'
  LIMIT 1;

  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Profile not found for bjj46@pitt.edu';
  END IF;

  -- Find the Small Group Leaders team
  SELECT id INTO v_team_id
  FROM teams
  WHERE name ILIKE 'Small Group Leaders'
  LIMIT 1;

  IF v_team_id IS NULL THEN
    RAISE EXCEPTION 'Team "Small Group Leaders" not found';
  END IF;

  -- Get or create a "Small Group Leader" role for this team
  SELECT id INTO v_role_id
  FROM team_roles
  WHERE team_id = v_team_id
  LIMIT 1;

  IF v_role_id IS NULL THEN
    INSERT INTO team_roles (team_id, name, permissions)
    VALUES (v_team_id, 'Small Group Leader', '["can_view_members"]')
    RETURNING id INTO v_role_id;
  END IF;

  -- Add Brian to the team (skip if already a member)
  INSERT INTO team_members (team_id, user_id, role_id, added_by)
  VALUES (v_team_id, v_user_id, v_role_id, v_user_id)
  ON CONFLICT (team_id, user_id) DO NOTHING;

  RAISE NOTICE 'Done — added user % to team % with role %', v_user_id, v_team_id, v_role_id;
END $$;
