-- ─── Migration: Reply-to messages ───────────────────────────────────────────
-- Run this in the Supabase SQL editor (Project → SQL Editor → New query).

ALTER TABLE messages
  ADD COLUMN IF NOT EXISTS reply_to_id UUID REFERENCES messages(id) ON DELETE SET NULL;

-- Index so lookups by reply_to_id are fast
CREATE INDEX IF NOT EXISTS messages_reply_to_id_idx ON messages(reply_to_id);
