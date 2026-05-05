-- Phase 2: Song set list + invite system for Praise Team
-- Run this after worship_phase1_migration.sql

-- ── worship_songs ────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS worship_songs (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  week_id        uuid NOT NULL REFERENCES worship_weeks(id) ON DELETE CASCADE,
  title          text NOT NULL,
  key            text NOT NULL DEFAULT 'G',
  song_leader_id uuid REFERENCES profiles(id) ON DELETE SET NULL,
  order_index    integer NOT NULL DEFAULT 0,
  created_at     timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE worship_songs ENABLE ROW LEVEL SECURITY;

-- Ministry members can read songs for their ministry's teams
CREATE POLICY "Ministry members can read worship_songs"
  ON worship_songs FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM worship_weeks ww
      JOIN teams t ON t.id = ww.team_id
      WHERE ww.id = worship_songs.week_id
        AND t.ministry_id = auth_ministry_id()
    )
  );

-- Members with can_manage_worship_set can insert songs
CREATE POLICY "Worship managers can insert worship_songs"
  ON worship_songs FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM worship_weeks ww
      WHERE ww.id = worship_songs.week_id
        AND auth_has_team_permission(ww.team_id, 'can_manage_worship_set')
    )
  );

-- Members with can_manage_worship_set can update songs
CREATE POLICY "Worship managers can update worship_songs"
  ON worship_songs FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM worship_weeks ww
      WHERE ww.id = worship_songs.week_id
        AND auth_has_team_permission(ww.team_id, 'can_manage_worship_set')
    )
  );

-- Members with can_manage_worship_set can delete songs
CREATE POLICY "Worship managers can delete worship_songs"
  ON worship_songs FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM worship_weeks ww
      WHERE ww.id = worship_songs.week_id
        AND auth_has_team_permission(ww.team_id, 'can_manage_worship_set')
    )
  );

-- ── worship_invites ──────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS worship_invites (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  week_id      uuid NOT NULL REFERENCES worship_weeks(id) ON DELETE CASCADE,
  user_id      uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  status       text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'declined')),
  sent_at      timestamptz NOT NULL DEFAULT now(),
  responded_at timestamptz,
  UNIQUE (week_id, user_id)
);

ALTER TABLE worship_invites ENABLE ROW LEVEL SECURITY;

-- Ministry members can read invites for their ministry's teams
CREATE POLICY "Ministry members can read worship_invites"
  ON worship_invites FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM worship_weeks ww
      JOIN teams t ON t.id = ww.team_id
      WHERE ww.id = worship_invites.week_id
        AND t.ministry_id = auth_ministry_id()
    )
  );

-- Members with can_manage_worship_set can send invites
CREATE POLICY "Worship managers can insert worship_invites"
  ON worship_invites FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM worship_weeks ww
      WHERE ww.id = worship_invites.week_id
        AND auth_has_team_permission(ww.team_id, 'can_manage_worship_set')
    )
  );

-- Users can update their own invite (accept / decline)
CREATE POLICY "Users can respond to their own worship_invites"
  ON worship_invites FOR UPDATE
  USING (worship_invites.user_id = auth.uid());
