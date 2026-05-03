-- ─── Ministry Calendar Migration ──────────────────────────────────────────────

-- 1. Create calendar_events table
CREATE TABLE IF NOT EXISTS calendar_events (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  ministry_id   UUID        NOT NULL REFERENCES ministries(id) ON DELETE CASCADE,
  team_id       UUID        REFERENCES teams(id) ON DELETE SET NULL,
  title         TEXT        NOT NULL,
  description   TEXT,
  location      TEXT,
  start_date    TIMESTAMPTZ NOT NULL,
  end_date      TIMESTAMPTZ NOT NULL,
  all_day       BOOLEAN     NOT NULL DEFAULT false,
  category      TEXT        NOT NULL DEFAULT 'regular'
                            CHECK (category IN ('welcoming','retreat','social','service','regular')),
  created_by    UUID        NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2. Indexes
CREATE INDEX IF NOT EXISTS calendar_events_ministry_id_idx ON calendar_events(ministry_id);
CREATE INDEX IF NOT EXISTS calendar_events_team_id_idx     ON calendar_events(team_id);
CREATE INDEX IF NOT EXISTS calendar_events_start_date_idx  ON calendar_events(start_date);

-- 3. Enable RLS
ALTER TABLE calendar_events ENABLE ROW LEVEL SECURITY;

-- SELECT: members of the same ministry can read all events
CREATE POLICY "calendar_events_select"
  ON calendar_events FOR SELECT
  USING (ministry_id = auth_ministry_id());

-- INSERT: admin/leader OR team member with can_plan_events permission
CREATE POLICY "calendar_events_insert"
  ON calendar_events FOR INSERT
  WITH CHECK (
    auth_is_admin_or_leader()
    OR EXISTS (
      SELECT 1
      FROM   team_members tm
      JOIN   team_roles   tr ON tr.id = tm.role_id
      WHERE  tm.user_id   = auth.uid()
        AND  tm.team_id   = calendar_events.team_id
        AND  tr.permissions @> '["can_plan_events"]'
    )
  );

-- UPDATE: same as INSERT
CREATE POLICY "calendar_events_update"
  ON calendar_events FOR UPDATE
  USING (
    auth_is_admin_or_leader()
    OR EXISTS (
      SELECT 1
      FROM   team_members tm
      JOIN   team_roles   tr ON tr.id = tm.role_id
      WHERE  tm.user_id   = auth.uid()
        AND  tm.team_id   = calendar_events.team_id
        AND  tr.permissions @> '["can_plan_events"]'
    )
  )
  WITH CHECK (
    auth_is_admin_or_leader()
    OR EXISTS (
      SELECT 1
      FROM   team_members tm
      JOIN   team_roles   tr ON tr.id = tm.role_id
      WHERE  tm.user_id   = auth.uid()
        AND  tm.team_id   = calendar_events.team_id
        AND  tr.permissions @> '["can_plan_events"]'
    )
  );

-- DELETE: admin/leader OR the creator
CREATE POLICY "calendar_events_delete"
  ON calendar_events FOR DELETE
  USING (
    auth_is_admin_or_leader()
    OR created_by = auth.uid()
  );

-- 4. Enable realtime
ALTER PUBLICATION supabase_realtime ADD TABLE calendar_events;

-- 5. Seed data
DO $$
DECLARE
  v_ministry_id UUID;
  v_team_id     UUID;
  v_user_id     UUID;
BEGIN
  -- Find an existing ministry
  SELECT id INTO v_ministry_id FROM ministries LIMIT 1;
  IF v_ministry_id IS NULL THEN RETURN; END IF;

  -- Find any team in that ministry (nullable — events can be ministry-wide)
  SELECT id INTO v_team_id FROM teams WHERE ministry_id = v_ministry_id LIMIT 1;

  -- Find a user to act as creator
  SELECT id INTO v_user_id FROM profiles WHERE ministry_id = v_ministry_id LIMIT 1;
  IF v_user_id IS NULL THEN RETURN; END IF;

  -- Only seed if no events exist for this ministry
  IF EXISTS (SELECT 1 FROM calendar_events WHERE ministry_id = v_ministry_id) THEN RETURN; END IF;

  -- ── Main ministry events ────────────────────────────────────────────────────

  INSERT INTO calendar_events (ministry_id, team_id, title, description, location, start_date, end_date, all_day, category, created_by) VALUES
  -- Fall Welcome Week (welcoming) Aug 28 2026, all-day
  (v_ministry_id, NULL, 'Fall Welcome Week',
   'Kick off the new school year! Meet the ministry, learn about our community, and find your place.',
   'Student Union Building',
   '2026-08-28T00:00:00+00:00', '2026-08-28T23:59:59+00:00', true, 'welcoming', v_user_id),

  -- Fall Retreat (retreat) Sep 18-20 2026
  (v_ministry_id, v_team_id, 'Fall Retreat',
   'A weekend away to rest, reconnect, and seek God together. Sign-ups required.',
   'Camp Gideon, Johnstown PA',
   '2026-09-18T16:00:00+00:00', '2026-09-20T16:00:00+00:00', false, 'retreat', v_user_id),

  -- Community Service Day (service) Oct 10 2026
  (v_ministry_id, NULL, 'Community Service Day',
   'Serve Pittsburgh together. We''ll partner with a local food bank and neighborhood clean-up crew.',
   'East Liberty Community Center',
   '2026-10-10T09:00:00+00:00', '2026-10-10T14:00:00+00:00', false, 'service', v_user_id),

  -- Friendsgiving (social) Nov 21 2026
  (v_ministry_id, NULL, 'Friendsgiving',
   'Bring a dish, share a story. A night of gratitude before everyone heads home for Thanksgiving.',
   'Towers Lobby, University of Pittsburgh',
   '2026-11-21T18:00:00+00:00', '2026-11-21T21:00:00+00:00', false, 'social', v_user_id),

  -- Christmas Party (social) Dec 12 2026
  (v_ministry_id, NULL, 'Christmas Party',
   'Ugly sweaters, white elephant, and carols. Celebrate the season with your Central fam.',
   'William Pitt Union, Room 539',
   '2026-12-12T18:30:00+00:00', '2026-12-12T21:30:00+00:00', false, 'social', v_user_id),

  -- Spring Welcome Week (welcoming) Jan 16 2027
  (v_ministry_id, NULL, 'Spring Welcome Week',
   'New semester, new faces. Come meet the community and see what Central is all about.',
   'Cathedral of Learning Commons Room',
   '2027-01-16T00:00:00+00:00', '2027-01-16T23:59:59+00:00', true, 'welcoming', v_user_id),

  -- Valentine's Social (social) Feb 13 2027
  (v_ministry_id, NULL, 'Valentine''s Social',
   'Friendship, games, and good food. Bring a friend and celebrate love in community.',
   'Hillman Library Patio',
   '2027-02-13T18:00:00+00:00', '2027-02-13T20:30:00+00:00', false, 'social', v_user_id),

  -- Spring Retreat (retreat) Mar 19-21 2027
  (v_ministry_id, v_team_id, 'Spring Retreat',
   'Our annual spring getaway — worship, teaching, and space to breathe.',
   'Ligonier Camp & Conference Center',
   '2027-03-19T15:00:00+00:00', '2027-03-21T15:00:00+00:00', false, 'retreat', v_user_id),

  -- Community Service (service) Apr 17 2027
  (v_ministry_id, NULL, 'Community Service',
   'Spring clean-up and service at a local shelter. Light work gloves recommended.',
   'Squirrel Hill Community Center',
   '2027-04-17T09:00:00+00:00', '2027-04-17T13:00:00+00:00', false, 'service', v_user_id),

  -- End of Year Banquet (social) May 1 2027
  (v_ministry_id, NULL, 'End of Year Banquet',
   'Celebrate the year, honor graduating seniors, and reflect on God''s faithfulness.',
   'Frick Fine Arts Building Auditorium',
   '2027-05-01T18:00:00+00:00', '2027-05-01T21:00:00+00:00', false, 'social', v_user_id),

  -- ── Monthly Board Meetings ─────────────────────────────────────────────────
  -- First Saturday of each month, Sep 2026 – May 2027
  (v_ministry_id, v_team_id, 'Monthly Board Meeting',
   'Monthly leadership planning meeting for board members and ministry officers.',
   'Posvar Hall, Room 2600',
   '2026-09-05T10:00:00+00:00', '2026-09-05T12:00:00+00:00', false, 'regular', v_user_id),

  (v_ministry_id, v_team_id, 'Monthly Board Meeting',
   'Monthly leadership planning meeting for board members and ministry officers.',
   'Posvar Hall, Room 2600',
   '2026-10-03T10:00:00+00:00', '2026-10-03T12:00:00+00:00', false, 'regular', v_user_id),

  (v_ministry_id, v_team_id, 'Monthly Board Meeting',
   'Monthly leadership planning meeting for board members and ministry officers.',
   'Posvar Hall, Room 2600',
   '2026-11-07T10:00:00+00:00', '2026-11-07T12:00:00+00:00', false, 'regular', v_user_id),

  (v_ministry_id, v_team_id, 'Monthly Board Meeting',
   'Monthly leadership planning meeting for board members and ministry officers.',
   'Posvar Hall, Room 2600',
   '2026-12-05T10:00:00+00:00', '2026-12-05T12:00:00+00:00', false, 'regular', v_user_id),

  (v_ministry_id, v_team_id, 'Monthly Board Meeting',
   'Monthly leadership planning meeting for board members and ministry officers.',
   'Posvar Hall, Room 2600',
   '2027-01-02T10:00:00+00:00', '2027-01-02T12:00:00+00:00', false, 'regular', v_user_id),

  (v_ministry_id, v_team_id, 'Monthly Board Meeting',
   'Monthly leadership planning meeting for board members and ministry officers.',
   'Posvar Hall, Room 2600',
   '2027-02-06T10:00:00+00:00', '2027-02-06T12:00:00+00:00', false, 'regular', v_user_id),

  (v_ministry_id, v_team_id, 'Monthly Board Meeting',
   'Monthly leadership planning meeting for board members and ministry officers.',
   'Posvar Hall, Room 2600',
   '2027-03-06T10:00:00+00:00', '2027-03-06T12:00:00+00:00', false, 'regular', v_user_id),

  (v_ministry_id, v_team_id, 'Monthly Board Meeting',
   'Monthly leadership planning meeting for board members and ministry officers.',
   'Posvar Hall, Room 2600',
   '2027-04-03T10:00:00+00:00', '2027-04-03T12:00:00+00:00', false, 'regular', v_user_id),

  (v_ministry_id, v_team_id, 'Monthly Board Meeting',
   'Monthly leadership planning meeting for board members and ministry officers.',
   'Posvar Hall, Room 2600',
   '2027-05-01T10:00:00+00:00', '2027-05-01T12:00:00+00:00', false, 'regular', v_user_id);

END $$;
