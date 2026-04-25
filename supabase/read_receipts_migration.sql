-- ─── Migration: Read receipts UI ────────────────────────────────────────────
-- Run this in the Supabase SQL editor (Project → SQL Editor → New query).
-- Enables Realtime on group_members so last_read_at updates fire as events.

-- Enable Realtime on group_members
ALTER PUBLICATION supabase_realtime ADD TABLE group_members;

-- REPLICA IDENTITY FULL lets UPDATE events carry the full old row (good practice)
ALTER TABLE group_members REPLICA IDENTITY FULL;
