-- Fix: link bj.jihoon.19059@gmail.com to the Central ministry as admin

-- Step 1: preview — confirm the user's current profile state
SELECT id, name, email, role, ministry_id
FROM profiles
WHERE email = 'bj.jihoon.19059@gmail.com';

-- Step 2: preview — confirm the Central ministry ID
SELECT id, name, status FROM ministries WHERE name ILIKE '%central%';

-- Step 3: update the profile to link to Central as admin
-- (run after confirming the IDs above look correct)
UPDATE profiles
SET
  ministry_id = (SELECT id FROM ministries WHERE name ILIKE '%central%' LIMIT 1),
  role        = 'admin'
WHERE email = 'bj.jihoon.19059@gmail.com';

-- Step 4: backfill user_ministries table (safe to run even if table doesn't exist yet)
INSERT INTO user_ministries (user_id, ministry_id, role)
SELECT p.id, p.ministry_id, 'admin'
FROM profiles p
WHERE p.email = 'bj.jihoon.19059@gmail.com'
  AND p.ministry_id IS NOT NULL
ON CONFLICT (user_id, ministry_id) DO UPDATE SET role = 'admin';
