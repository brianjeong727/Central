-- 1. Detach founder account from any ministry so it lives only in /admin
UPDATE profiles
SET ministry_id = NULL,
    role        = 'member'
WHERE email = 'brianjeong13@gmail.com';

-- 2. Make Bj.jihoon.19059@gmail.com the admin of Central ministry
--    (assumes this account already has a profile row in Central)
UPDATE profiles
SET role = 'admin'
WHERE email = 'Bj.jihoon.19059@gmail.com';

-- 3. Reject the test ministry application submitted by the founder account
--    (clean up the test — remove if you want to keep it)
UPDATE ministries
SET status = 'rejected'
WHERE status = 'pending'
  AND created_by = (
    SELECT id FROM profiles WHERE email = 'brianjeong13@gmail.com'
  );
