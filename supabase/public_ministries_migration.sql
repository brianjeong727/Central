-- Add is_public flag to ministries
ALTER TABLE ministries
  ADD COLUMN IF NOT EXISTS is_public BOOLEAN NOT NULL DEFAULT false;

-- Anyone (including unauthenticated) can read public, active ministries
-- If you already have a SELECT policy on ministries, extend it to also allow is_public=true rows.
CREATE POLICY "Public ministries readable by all"
  ON ministries FOR SELECT
  USING (is_public = true AND status = 'active');

-- Ministry admin/leader can update their own ministry (e.g. toggle is_public)
CREATE POLICY "Ministry admin can update their ministry"
  ON ministries FOR UPDATE
  USING (auth_ministry_id() = id AND auth_is_admin_or_leader());
