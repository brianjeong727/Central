-- Add status (pending/active/rejected) and location to ministries
-- Existing rows default to 'active' so nothing breaks

ALTER TABLE ministries
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('pending', 'active', 'rejected')),
  ADD COLUMN IF NOT EXISTS location TEXT;

CREATE INDEX IF NOT EXISTS ministries_status_idx ON ministries(status);
