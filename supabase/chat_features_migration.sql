-- ─── Migration: Chat features ────────────────────────────────────────────────
-- Run this in the Supabase SQL editor (Project → SQL Editor → New query).

-- ─── 1. Add last_read_at to group_members ────────────────────────────────────
ALTER TABLE group_members
  ADD COLUMN IF NOT EXISTS last_read_at TIMESTAMPTZ DEFAULT NULL;

-- ─── 2. RLS on groups ────────────────────────────────────────────────────────
ALTER TABLE groups ENABLE ROW LEVEL SECURITY;

-- Members can read groups they belong to
CREATE POLICY "Members can view their groups"
ON groups
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM group_members
    WHERE group_members.group_id = groups.id
      AND group_members.user_id  = auth.uid()
  )
);

-- Any authenticated user can create a group
CREATE POLICY "Authenticated users can create groups"
ON groups
FOR INSERT
WITH CHECK (auth.uid() IS NOT NULL);

-- Group creator (or admin) can update group details
CREATE POLICY "Creator can update their group"
ON groups
FOR UPDATE
USING (created_by = auth.uid());

-- ─── 3. RLS on group_members ─────────────────────────────────────────────────
ALTER TABLE group_members ENABLE ROW LEVEL SECURITY;

-- Members can see who else is in their groups
CREATE POLICY "Members can view membership of their groups"
ON group_members
FOR SELECT
USING (
  user_id = auth.uid()
  OR EXISTS (
    SELECT 1 FROM group_members gm2
    WHERE gm2.group_id = group_members.group_id
      AND gm2.user_id  = auth.uid()
  )
);

-- Authenticated users can add members (when creating groups)
CREATE POLICY "Authenticated users can add members"
ON group_members
FOR INSERT
WITH CHECK (auth.uid() IS NOT NULL);

-- Users can update their own last_read_at
CREATE POLICY "Users can update their own last_read_at"
ON group_members
FOR UPDATE
USING (user_id = auth.uid());

-- ─── 4. Ensure Realtime is enabled on messages ───────────────────────────────
-- (Only needed once; skip if already added)
ALTER PUBLICATION supabase_realtime ADD TABLE messages;
