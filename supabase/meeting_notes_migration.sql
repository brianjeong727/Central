-- ═══════════════════════════════════════════════════════════════════════════════
-- Migration: Meeting Notes — CENTRAL
-- ═══════════════════════════════════════════════════════════════════════════════
--
-- Creates meeting_notes table for the Student Org Board General tab.
--
-- RLS:
--   READ  — any member of the same ministry
--   WRITE — ministry admin/leader, OR any member of the team
--
-- Depends on: multi_tenant_migration.sql (auth_ministry_id, auth_is_admin_or_leader,
--             is_team_member, teams)
-- ═══════════════════════════════════════════════════════════════════════════════


-- ───────────────────────────────────────────────────────────────────────────────
-- STEP 1: meeting_notes table
-- ───────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS meeting_notes (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id     UUID        NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  note_number INT         NOT NULL,
  date        DATE        NOT NULL DEFAULT CURRENT_DATE,
  title       TEXT        NOT NULL DEFAULT '',
  body        TEXT        NOT NULL DEFAULT '',
  created_by  UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS meeting_notes_team_id_idx
  ON meeting_notes(team_id, created_at DESC);


-- ───────────────────────────────────────────────────────────────────────────────
-- STEP 2: RLS
-- ───────────────────────────────────────────────────────────────────────────────

ALTER TABLE meeting_notes ENABLE ROW LEVEL SECURITY;

-- All ministry members can read
CREATE POLICY "Ministry members can view meeting notes"
ON meeting_notes FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM teams t
    WHERE t.id          = meeting_notes.team_id
      AND t.ministry_id = auth_ministry_id()
  )
);

-- Team members (and admin/leader) can create notes
CREATE POLICY "Team members can create meeting notes"
ON meeting_notes FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1 FROM teams t
    WHERE t.id          = meeting_notes.team_id
      AND t.ministry_id = auth_ministry_id()
  )
  AND (
    auth_is_admin_or_leader()
    OR is_team_member(meeting_notes.team_id, auth.uid())
  )
);

-- Team members (and admin/leader) can edit notes
CREATE POLICY "Team members can update meeting notes"
ON meeting_notes FOR UPDATE
USING (
  EXISTS (
    SELECT 1 FROM teams t
    WHERE t.id          = meeting_notes.team_id
      AND t.ministry_id = auth_ministry_id()
  )
  AND (
    auth_is_admin_or_leader()
    OR is_team_member(meeting_notes.team_id, auth.uid())
  )
);
