-- ─── Migration: Emoji reactions on messages ─────────────────────────────────
-- Run this in the Supabase SQL editor (Project → SQL Editor → New query).

-- ─── 1. Create message_reactions table ───────────────────────────────────────
CREATE TABLE message_reactions (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id  UUID NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
  user_id     UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  emoji       TEXT NOT NULL,
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (message_id, user_id, emoji)
);

-- ─── 2. REPLICA IDENTITY FULL so DELETE payloads carry all columns ────────────
ALTER TABLE message_reactions REPLICA IDENTITY FULL;

-- ─── 3. Index for fast lookups by message ─────────────────────────────────────
CREATE INDEX message_reactions_message_id_idx ON message_reactions(message_id);

-- ─── 4. RLS ───────────────────────────────────────────────────────────────────
ALTER TABLE message_reactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members can view reactions"
ON message_reactions FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM messages m
    JOIN group_members gm ON gm.group_id = m.group_id
    WHERE m.id = message_reactions.message_id
      AND gm.user_id = auth.uid()
  )
);

CREATE POLICY "Users can insert own reactions"
ON message_reactions FOR INSERT
WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can delete own reactions"
ON message_reactions FOR DELETE
USING (user_id = auth.uid());

-- ─── 5. Enable Realtime ───────────────────────────────────────────────────────
ALTER PUBLICATION supabase_realtime ADD TABLE message_reactions;
