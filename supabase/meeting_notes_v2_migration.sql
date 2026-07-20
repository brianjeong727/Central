-- ─── Meeting Notes v2 — structured capture (Variant B redesign) ──────────────
--
-- The redesigned notes carry pinned Agenda + Decisions sections and a linked
-- event; the list view renders a digest (decision summary/count, event chip,
-- attendee avatars) from this structure. Body stays the freeform "Notes" prose.
--
-- RLS: the two child tables mirror meeting_notes' existing semantics via the
-- parent note's team — SELECT for the whole ministry, writes for admin/leader
-- OR team members (is_team_member). meeting_notes itself keeps its existing
-- 3 policies untouched (still no DELETE policy — unchanged behavior); the new
-- columns are data on already-policied rows.

-- 1) meeting_notes: linked event + attendees
ALTER TABLE meeting_notes
  ADD COLUMN IF NOT EXISTS linked_event_id uuid REFERENCES calendar_events(id) ON DELETE SET NULL;
ALTER TABLE meeting_notes
  ADD COLUMN IF NOT EXISTS attendees uuid[] NOT NULL DEFAULT '{}';
CREATE INDEX IF NOT EXISTS meeting_notes_linked_event_idx
  ON meeting_notes(linked_event_id) WHERE linked_event_id IS NOT NULL;

-- 2) Agenda items
CREATE TABLE IF NOT EXISTS meeting_note_agenda_items (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  note_id     uuid NOT NULL REFERENCES meeting_notes(id) ON DELETE CASCADE,
  text        text NOT NULL DEFAULT '',
  sub_text    text,
  done        boolean NOT NULL DEFAULT false,
  sort_order  integer NOT NULL DEFAULT 0,
  created_by  uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS meeting_note_agenda_items_note_idx ON meeting_note_agenda_items(note_id);

-- 3) Decisions
CREATE TABLE IF NOT EXISTS meeting_note_decisions (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  note_id     uuid NOT NULL REFERENCES meeting_notes(id) ON DELETE CASCADE,
  text        text NOT NULL,
  sort_order  integer NOT NULL DEFAULT 0,
  created_by  uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS meeting_note_decisions_note_idx ON meeting_note_decisions(note_id);

-- 4) RLS — passthrough via the parent note's team (template_tasks precedent:
--    one ministry-scoped SELECT + one gated ALL with USING and WITH CHECK).
ALTER TABLE meeting_note_agenda_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE meeting_note_decisions ENABLE ROW LEVEL SECURITY;

CREATE POLICY mn_agenda_select ON meeting_note_agenda_items FOR SELECT USING (
  EXISTS (SELECT 1 FROM meeting_notes n JOIN teams t ON t.id = n.team_id
          WHERE n.id = meeting_note_agenda_items.note_id
            AND t.ministry_id = (SELECT auth_ministry_id()))
);
CREATE POLICY mn_agenda_write ON meeting_note_agenda_items FOR ALL USING (
  EXISTS (SELECT 1 FROM meeting_notes n JOIN teams t ON t.id = n.team_id
          WHERE n.id = meeting_note_agenda_items.note_id
            AND t.ministry_id = (SELECT auth_ministry_id())
            AND ((SELECT auth_is_admin_or_leader()) OR is_team_member(n.team_id, (SELECT auth.uid()))))
) WITH CHECK (
  EXISTS (SELECT 1 FROM meeting_notes n JOIN teams t ON t.id = n.team_id
          WHERE n.id = meeting_note_agenda_items.note_id
            AND t.ministry_id = (SELECT auth_ministry_id())
            AND ((SELECT auth_is_admin_or_leader()) OR is_team_member(n.team_id, (SELECT auth.uid()))))
);

CREATE POLICY mn_decisions_select ON meeting_note_decisions FOR SELECT USING (
  EXISTS (SELECT 1 FROM meeting_notes n JOIN teams t ON t.id = n.team_id
          WHERE n.id = meeting_note_decisions.note_id
            AND t.ministry_id = (SELECT auth_ministry_id()))
);
CREATE POLICY mn_decisions_write ON meeting_note_decisions FOR ALL USING (
  EXISTS (SELECT 1 FROM meeting_notes n JOIN teams t ON t.id = n.team_id
          WHERE n.id = meeting_note_decisions.note_id
            AND t.ministry_id = (SELECT auth_ministry_id())
            AND ((SELECT auth_is_admin_or_leader()) OR is_team_member(n.team_id, (SELECT auth.uid()))))
) WITH CHECK (
  EXISTS (SELECT 1 FROM meeting_notes n JOIN teams t ON t.id = n.team_id
          WHERE n.id = meeting_note_decisions.note_id
            AND t.ministry_id = (SELECT auth_ministry_id())
            AND ((SELECT auth_is_admin_or_leader()) OR is_team_member(n.team_id, (SELECT auth.uid()))))
);
