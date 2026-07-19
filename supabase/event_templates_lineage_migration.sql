-- ─── event_templates yearbook: per-season playbooks (history-first creation) ──
--
-- Before: UNIQUE (ministry_id, team_id, event_type) — compiling a season's event
-- REPLACED last year's playbook, so no history shelf could exist.
-- After: one row per (ministry, team, event lineage, season). `lineage_key` is
-- the stable identity of a recurring event ("coffeehouse", "welcome-week"),
-- derived from the template name at compile time; `year_label` (existing column)
-- is the season ("2025–26"). Re-compiling the SAME season still upserts in
-- place; a NEW season adds a new shelf row.
--
-- RLS: no policy changes. All four event_templates policies (select = same
-- ministry; insert/update/delete = admin/leader OR can_plan_events) and the
-- template_tasks/template_roles passthroughs are untouched and continue to
-- govern the new column identically (column is data, not a scope key).
--
-- team_id is nullable → the unique index COALESCEs it (and year_label) so
-- ministry-level templates and unlabeled seasons still dedupe correctly.

ALTER TABLE event_templates ADD COLUMN IF NOT EXISTS lineage_key text;

-- Backfill existing rows: their event_type was their identity under the old key.
UPDATE event_templates SET lineage_key = event_type WHERE lineage_key IS NULL;

ALTER TABLE event_templates ALTER COLUMN lineage_key SET NOT NULL;

ALTER TABLE event_templates
  DROP CONSTRAINT IF EXISTS event_templates_ministry_id_team_id_event_type_key;

CREATE UNIQUE INDEX IF NOT EXISTS event_templates_lineage_season_key
  ON event_templates (
    ministry_id,
    COALESCE(team_id, '00000000-0000-0000-0000-000000000000'::uuid),
    lineage_key,
    COALESCE(year_label, '')
  );

CREATE INDEX IF NOT EXISTS event_templates_lineage_idx
  ON event_templates (ministry_id, lineage_key);
