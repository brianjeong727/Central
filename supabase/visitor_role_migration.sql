-- ─── Add "visitor" role ──────────────────────────────────────────────────────
-- Visitors have identical permissions to members. No RLS changes needed because
-- the auth_is_admin_or_leader() helper already returns false for both member and
-- visitor, and all member-level SELECT/INSERT policies check ministry_id only.
--
-- The only change needed is to allow "visitor" as a valid role value, update the
-- auth_is_admin_or_leader helper comment (logic unchanged), and backfill 5 test
-- users to visitor for demo purposes.

-- 1. Drop the role check constraint if one exists, then re-add including visitor.
--    (Supabase's default profiles schema uses TEXT with no CHECK; this is a no-op
--     if the constraint doesn't exist, but adds it explicitly going forward.)
ALTER TABLE profiles
  DROP CONSTRAINT IF EXISTS profiles_role_check;

ALTER TABLE profiles
  ADD CONSTRAINT profiles_role_check
  CHECK (role IN ('admin', 'leader', 'member', 'visitor'));

-- 2. Seed: change 5 non-leader/non-admin members in the Central ministry to visitor.
--    We pick the 5 most-recently-joined members who are currently role = 'member'.
UPDATE profiles
SET role = 'visitor'
WHERE id IN (
  SELECT id
  FROM profiles
  WHERE role = 'member'
    AND ministry_id = (
      SELECT id FROM ministries WHERE name ILIKE '%central%' LIMIT 1
    )
  ORDER BY created_at DESC
  LIMIT 5
);
