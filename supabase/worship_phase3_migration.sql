-- Phase 3: Chord charts, slide annotations, and slide generator
-- Run this after worship_phase2_migration.sql

-- ── worship_charts ────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS worship_charts (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  song_id     uuid NOT NULL REFERENCES worship_songs(id) ON DELETE CASCADE,
  chart_url   text NOT NULL,
  uploaded_by uuid REFERENCES profiles(id) ON DELETE SET NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (song_id)
);

ALTER TABLE worship_charts ENABLE ROW LEVEL SECURITY;

-- Ministry members can read charts
CREATE POLICY "Ministry members can read worship_charts"
  ON worship_charts FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM worship_songs ws
      JOIN worship_weeks ww ON ww.id = ws.week_id
      JOIN teams t ON t.id = ww.team_id
      WHERE ws.id = worship_charts.song_id
        AND t.ministry_id = auth_ministry_id()
    )
  );

-- Praise Team members (any permission) can upload charts
CREATE POLICY "Praise Team members can insert worship_charts"
  ON worship_charts FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM worship_songs ws
      JOIN worship_weeks ww ON ww.id = ws.week_id
      JOIN team_members tm ON tm.team_id = ww.team_id
      WHERE ws.id = worship_charts.song_id
        AND tm.user_id = auth.uid()
    )
  );

-- Worship managers can update charts (replace)
CREATE POLICY "Worship managers can update worship_charts"
  ON worship_charts FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM worship_songs ws
      JOIN worship_weeks ww ON ww.id = ws.week_id
      WHERE ws.id = worship_charts.song_id
        AND auth_has_team_permission(ww.team_id, 'can_manage_worship_set')
    )
  );

-- ── worship_annotations ───────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS worship_annotations (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  chart_id        uuid NOT NULL REFERENCES worship_charts(id) ON DELETE CASCADE,
  user_id         uuid REFERENCES profiles(id) ON DELETE SET NULL,
  annotation_data jsonb NOT NULL DEFAULT '[]'::jsonb,
  updated_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (chart_id)
);

ALTER TABLE worship_annotations ENABLE ROW LEVEL SECURITY;

-- Ministry members can read annotations
CREATE POLICY "Ministry members can read worship_annotations"
  ON worship_annotations FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM worship_charts wc
      JOIN worship_songs ws ON ws.id = wc.song_id
      JOIN worship_weeks ww ON ww.id = ws.week_id
      JOIN teams t ON t.id = ww.team_id
      WHERE wc.id = worship_annotations.chart_id
        AND t.ministry_id = auth_ministry_id()
    )
  );

-- Worship managers can insert annotations
CREATE POLICY "Worship managers can insert worship_annotations"
  ON worship_annotations FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM worship_charts wc
      JOIN worship_songs ws ON ws.id = wc.song_id
      JOIN worship_weeks ww ON ww.id = ws.week_id
      WHERE wc.id = worship_annotations.chart_id
        AND auth_has_team_permission(ww.team_id, 'can_manage_worship_set')
    )
  );

-- Worship managers can update annotations
CREATE POLICY "Worship managers can update worship_annotations"
  ON worship_annotations FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM worship_charts wc
      JOIN worship_songs ws ON ws.id = wc.song_id
      JOIN worship_weeks ww ON ww.id = ws.week_id
      WHERE wc.id = worship_annotations.chart_id
        AND auth_has_team_permission(ww.team_id, 'can_manage_worship_set')
    )
  );
