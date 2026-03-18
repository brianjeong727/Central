-- ─── RLS Policies for the messages table ────────────────────────────────────
--
-- Run this in the Supabase SQL editor (or as a migration).
-- Assumes the messages table has columns:
--   id, group_id, sender_id, content, created_at
-- and that group_members (group_id, user_id) tracks membership.

-- 1. Enable RLS on messages
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;

-- 2. Members can READ messages only from groups they belong to
CREATE POLICY "Members can read messages in their groups"
ON messages
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM group_members
    WHERE group_members.group_id = messages.group_id
      AND group_members.user_id  = auth.uid()
  )
);

-- 3. Members can INSERT messages only into groups they belong to,
--    and only as themselves (sender_id must match the logged-in user)
CREATE POLICY "Members can send messages to their groups"
ON messages
FOR INSERT
WITH CHECK (
  sender_id = auth.uid()
  AND EXISTS (
    SELECT 1 FROM group_members
    WHERE group_members.group_id = messages.group_id
      AND group_members.user_id  = auth.uid()
  )
);

-- ─── Enable Realtime on the messages table ───────────────────────────────────
-- Run this once in the Supabase dashboard → Database → Replication,
-- or via SQL:
ALTER PUBLICATION supabase_realtime ADD TABLE messages;
