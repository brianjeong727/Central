-- ── Event Planning Tables ────────────────────────────────────────────────────

-- event_plans: one per calendar event
CREATE TABLE IF NOT EXISTS event_plans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ministry_id UUID NOT NULL REFERENCES ministries(id) ON DELETE CASCADE,
  calendar_event_id UUID NOT NULL UNIQUE REFERENCES calendar_events(id) ON DELETE CASCADE,
  overview_notes TEXT,
  expected_turnout INTEGER,
  budget_allocated NUMERIC(10,2),
  created_by UUID NOT NULL REFERENCES profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- event_tasks: checklist items
CREATE TABLE IF NOT EXISTS event_tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_plan_id UUID NOT NULL REFERENCES event_plans(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  assigned_to UUID REFERENCES profiles(id) ON DELETE SET NULL,
  due_date DATE,
  completed BOOLEAN NOT NULL DEFAULT false,
  completed_at TIMESTAMPTZ,
  created_by UUID NOT NULL REFERENCES profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- event_roles: named leads
CREATE TABLE IF NOT EXISTS event_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_plan_id UUID NOT NULL REFERENCES event_plans(id) ON DELETE CASCADE,
  role_name TEXT NOT NULL,
  assigned_to UUID REFERENCES profiles(id) ON DELETE SET NULL,
  notes TEXT,
  created_by UUID NOT NULL REFERENCES profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- event_notes: persistent transition notes (never deleted)
CREATE TABLE IF NOT EXISTS event_notes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_plan_id UUID NOT NULL REFERENCES event_plans(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  created_by UUID NOT NULL REFERENCES profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── Indexes ───────────────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_event_tasks_event_plan_id ON event_tasks(event_plan_id);
CREATE INDEX IF NOT EXISTS idx_event_tasks_assigned_to ON event_tasks(assigned_to);
CREATE INDEX IF NOT EXISTS idx_event_roles_event_plan_id ON event_roles(event_plan_id);
CREATE INDEX IF NOT EXISTS idx_event_notes_event_plan_id ON event_notes(event_plan_id);
CREATE INDEX IF NOT EXISTS idx_event_notes_created_by ON event_notes(created_by);

-- ── RLS ───────────────────────────────────────────────────────────────────────

ALTER TABLE event_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE event_tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE event_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE event_notes ENABLE ROW LEVEL SECURITY;

-- event_plans policies
CREATE POLICY "event_plans_select" ON event_plans
  FOR SELECT USING (ministry_id = auth_ministry_id());

CREATE POLICY "event_plans_insert" ON event_plans
  FOR INSERT WITH CHECK (
    auth_is_admin_or_leader()
    OR EXISTS (
      SELECT 1 FROM team_members tm
      JOIN team_roles tr ON tr.id = tm.role_id
      WHERE tm.user_id = auth.uid()
        AND tr.permissions @> '["can_plan_events"]'::jsonb
    )
  );

CREATE POLICY "event_plans_update" ON event_plans
  FOR UPDATE USING (
    auth_is_admin_or_leader()
    OR EXISTS (
      SELECT 1 FROM team_members tm
      JOIN team_roles tr ON tr.id = tm.role_id
      WHERE tm.user_id = auth.uid()
        AND tr.permissions @> '["can_plan_events"]'::jsonb
    )
  );

CREATE POLICY "event_plans_delete" ON event_plans
  FOR DELETE USING (
    auth_is_admin_or_leader()
    OR EXISTS (
      SELECT 1 FROM team_members tm
      JOIN team_roles tr ON tr.id = tm.role_id
      WHERE tm.user_id = auth.uid()
        AND tr.permissions @> '["can_plan_events"]'::jsonb
    )
  );

-- event_tasks policies
CREATE POLICY "event_tasks_select" ON event_tasks
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM event_plans ep
      WHERE ep.id = event_tasks.event_plan_id
        AND ep.ministry_id = auth_ministry_id()
    )
  );

CREATE POLICY "event_tasks_insert" ON event_tasks
  FOR INSERT WITH CHECK (
    auth_is_admin_or_leader()
    OR EXISTS (
      SELECT 1 FROM team_members tm
      JOIN team_roles tr ON tr.id = tm.role_id
      WHERE tm.user_id = auth.uid()
        AND tr.permissions @> '["can_plan_events"]'::jsonb
    )
  );

CREATE POLICY "event_tasks_update" ON event_tasks
  FOR UPDATE USING (
    auth_is_admin_or_leader()
    OR EXISTS (
      SELECT 1 FROM team_members tm
      JOIN team_roles tr ON tr.id = tm.role_id
      WHERE tm.user_id = auth.uid()
        AND tr.permissions @> '["can_plan_events"]'::jsonb
    )
  );

CREATE POLICY "event_tasks_delete" ON event_tasks
  FOR DELETE USING (
    auth_is_admin_or_leader()
    OR EXISTS (
      SELECT 1 FROM team_members tm
      JOIN team_roles tr ON tr.id = tm.role_id
      WHERE tm.user_id = auth.uid()
        AND tr.permissions @> '["can_plan_events"]'::jsonb
    )
  );

-- event_roles policies
CREATE POLICY "event_roles_select" ON event_roles
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM event_plans ep
      WHERE ep.id = event_roles.event_plan_id
        AND ep.ministry_id = auth_ministry_id()
    )
  );

CREATE POLICY "event_roles_insert" ON event_roles
  FOR INSERT WITH CHECK (
    auth_is_admin_or_leader()
    OR EXISTS (
      SELECT 1 FROM team_members tm
      JOIN team_roles tr ON tr.id = tm.role_id
      WHERE tm.user_id = auth.uid()
        AND tr.permissions @> '["can_plan_events"]'::jsonb
    )
  );

CREATE POLICY "event_roles_update" ON event_roles
  FOR UPDATE USING (
    auth_is_admin_or_leader()
    OR EXISTS (
      SELECT 1 FROM team_members tm
      JOIN team_roles tr ON tr.id = tm.role_id
      WHERE tm.user_id = auth.uid()
        AND tr.permissions @> '["can_plan_events"]'::jsonb
    )
  );

CREATE POLICY "event_roles_delete" ON event_roles
  FOR DELETE USING (
    auth_is_admin_or_leader()
    OR EXISTS (
      SELECT 1 FROM team_members tm
      JOIN team_roles tr ON tr.id = tm.role_id
      WHERE tm.user_id = auth.uid()
        AND tr.permissions @> '["can_plan_events"]'::jsonb
    )
  );

-- event_notes policies
CREATE POLICY "event_notes_select" ON event_notes
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM event_plans ep
      WHERE ep.id = event_notes.event_plan_id
        AND ep.ministry_id = auth_ministry_id()
    )
  );

CREATE POLICY "event_notes_insert" ON event_notes
  FOR INSERT WITH CHECK (
    auth_is_admin_or_leader()
    OR EXISTS (
      SELECT 1 FROM team_members tm
      JOIN team_roles tr ON tr.id = tm.role_id
      WHERE tm.user_id = auth.uid()
        AND tr.permissions @> '["can_plan_events"]'::jsonb
    )
  );

CREATE POLICY "event_notes_update" ON event_notes
  FOR UPDATE USING (
    auth_is_admin_or_leader()
    OR EXISTS (
      SELECT 1 FROM team_members tm
      JOIN team_roles tr ON tr.id = tm.role_id
      WHERE tm.user_id = auth.uid()
        AND tr.permissions @> '["can_plan_events"]'::jsonb
    )
  );

CREATE POLICY "event_notes_delete" ON event_notes
  FOR DELETE USING (
    auth_is_admin_or_leader()
    OR EXISTS (
      SELECT 1 FROM team_members tm
      JOIN team_roles tr ON tr.id = tm.role_id
      WHERE tm.user_id = auth.uid()
        AND tr.permissions @> '["can_plan_events"]'::jsonb
    )
  );

-- ── Seed Data ─────────────────────────────────────────────────────────────────

DO $$
DECLARE
  v_ministry_id UUID;
  v_user_id UUID;
  v_coffeehouse_id UUID;
  v_turkeybowl_id UUID;
  v_welcoming_id UUID;
  v_plan_id UUID;
BEGIN
  -- Find first ministry
  SELECT id INTO v_ministry_id FROM ministries ORDER BY created_at LIMIT 1;
  IF v_ministry_id IS NULL THEN RETURN; END IF;

  -- Find first profile in that ministry
  SELECT id INTO v_user_id FROM profiles WHERE ministry_id = v_ministry_id ORDER BY created_at LIMIT 1;
  IF v_user_id IS NULL THEN RETURN; END IF;

  -- Only seed if no event_plans exist for this ministry
  IF EXISTS (SELECT 1 FROM event_plans WHERE ministry_id = v_ministry_id) THEN RETURN; END IF;

  -- ── Insert calendar events ────────────────────────────────────────────────

  -- Coffeehouse
  INSERT INTO calendar_events (ministry_id, title, description, location, start_date, end_date, all_day, category, created_by)
  SELECT
    v_ministry_id,
    'Coffeehouse',
    'Open mic and coffee night for the whole campus community.',
    'Connolly Ballroom',
    '2026-11-07T19:00:00',
    '2026-11-07T22:00:00',
    false,
    'social',
    v_user_id
  WHERE NOT EXISTS (
    SELECT 1 FROM calendar_events WHERE title = 'Coffeehouse' AND ministry_id = v_ministry_id
  )
  RETURNING id INTO v_coffeehouse_id;

  IF v_coffeehouse_id IS NULL THEN
    SELECT id INTO v_coffeehouse_id FROM calendar_events WHERE title = 'Coffeehouse' AND ministry_id = v_ministry_id LIMIT 1;
  END IF;

  -- Turkeybowl
  INSERT INTO calendar_events (ministry_id, title, description, location, start_date, end_date, all_day, category, created_by)
  SELECT
    v_ministry_id,
    'Turkeybowl',
    'Annual Thanksgiving flag football game followed by a potluck.',
    'Campus Rec Fields',
    '2026-11-22T14:00:00',
    '2026-11-22T17:00:00',
    false,
    'social',
    v_user_id
  WHERE NOT EXISTS (
    SELECT 1 FROM calendar_events WHERE title = 'Turkeybowl' AND ministry_id = v_ministry_id
  )
  RETURNING id INTO v_turkeybowl_id;

  IF v_turkeybowl_id IS NULL THEN
    SELECT id INTO v_turkeybowl_id FROM calendar_events WHERE title = 'Turkeybowl' AND ministry_id = v_ministry_id LIMIT 1;
  END IF;

  -- Welcoming Night
  INSERT INTO calendar_events (ministry_id, title, description, location, start_date, end_date, all_day, category, created_by)
  SELECT
    v_ministry_id,
    'Welcoming Night',
    'Fall semester welcome event for new and returning students.',
    'Student Union Ballroom',
    '2026-08-29T18:00:00',
    '2026-08-29T21:00:00',
    false,
    'welcoming',
    v_user_id
  WHERE NOT EXISTS (
    SELECT 1 FROM calendar_events WHERE title = 'Welcoming Night' AND ministry_id = v_ministry_id
  )
  RETURNING id INTO v_welcoming_id;

  IF v_welcoming_id IS NULL THEN
    SELECT id INTO v_welcoming_id FROM calendar_events WHERE title = 'Welcoming Night' AND ministry_id = v_ministry_id LIMIT 1;
  END IF;

  -- ── Coffeehouse event_plan ────────────────────────────────────────────────

  INSERT INTO event_plans (ministry_id, calendar_event_id, created_by)
  VALUES (v_ministry_id, v_coffeehouse_id, v_user_id)
  RETURNING id INTO v_plan_id;

  INSERT INTO event_tasks (event_plan_id, title, due_date, created_by) VALUES
    (v_plan_id, 'Book Connolly Ballroom (2 months out)', '2026-08-30', v_user_id),
    (v_plan_id, 'Open performer signups — cap at 10 slots', '2026-10-15', v_user_id),
    (v_plan_id, 'Hire photographer', '2026-10-20', v_user_id),
    (v_plan_id, 'Plan coffee & dessert bar menu', '2026-10-25', v_user_id),
    (v_plan_id, 'Run sound check (2hrs before)', NULL, v_user_id),
    (v_plan_id, 'Design & distribute event flyer', '2026-10-25', v_user_id),
    (v_plan_id, 'Coordinate setup & cleanup crew', NULL, v_user_id);

  INSERT INTO event_roles (event_plan_id, role_name, created_by) VALUES
    (v_plan_id, 'Sound Lead', v_user_id),
    (v_plan_id, 'MC', v_user_id),
    (v_plan_id, 'Food & Drinks Lead', v_user_id),
    (v_plan_id, 'Promotions Lead', v_user_id),
    (v_plan_id, 'Photographer', v_user_id);

  INSERT INTO event_notes (event_plan_id, content, created_by, created_at) VALUES
    (v_plan_id, 'Book the Connolly Ballroom at least 2 months in advance — it fills up fast. Cap performers at 8-10 slots (~5 min each). Sound check MUST happen 2 hours before doors open. Coffee & dessert bar was a massive hit — budget $200 minimum for supplies. This event is great for campus outreach; invite people who wouldn''t normally come to a church event.', v_user_id, NOW()),
    (v_plan_id, 'First time running this event. Lower turnout than expected (~40 people) but energy was great. Need better promotion next year. Sound issues — rent better equipment. The dessert spread was the highlight.', v_user_id, NOW() - INTERVAL '1 year');

  -- ── Turkeybowl event_plan ─────────────────────────────────────────────────

  INSERT INTO event_plans (ministry_id, calendar_event_id, created_by)
  VALUES (v_ministry_id, v_turkeybowl_id, v_user_id)
  RETURNING id INTO v_plan_id;

  INSERT INTO event_tasks (event_plan_id, title, due_date, created_by) VALUES
    (v_plan_id, 'Reserve field with Campus Rec (3 weeks out)', '2026-11-01', v_user_id),
    (v_plan_id, 'Buy/borrow flag football sets', '2026-11-10', v_user_id),
    (v_plan_id, 'Assign team captains', '2026-11-15', v_user_id),
    (v_plan_id, 'Set up potluck signup sheet (who brings what)', '2026-11-10', v_user_id),
    (v_plan_id, 'Promote to alumni email list', '2026-11-01', v_user_id),
    (v_plan_id, 'Create game bracket/schedule', '2026-11-20', v_user_id),
    (v_plan_id, 'Build event day playlist', NULL, v_user_id);

  INSERT INTO event_roles (event_plan_id, role_name, created_by) VALUES
    (v_plan_id, 'Field Coordinator', v_user_id),
    (v_plan_id, 'Team Captain — Seniors', v_user_id),
    (v_plan_id, 'Team Captain — Underclassmen', v_user_id),
    (v_plan_id, 'Food Coordinator', v_user_id),
    (v_plan_id, 'Music Lead', v_user_id);

  INSERT INTO event_notes (event_plan_id, content, created_by, created_at) VALUES
    (v_plan_id, 'Run it Thanksgiving weekend (Saturday). Alumni love coming back — send the invite to the alumni list at least 3 weeks early. Get the field permit from Campus Rec early — minimum 3 weeks out. Split teams by grad year for fun competition. Always bring extra flags, they break. The potluck after is the best part of the day. Keep it 2-5pm so people can still make it to their families.', v_user_id, NOW()),
    (v_plan_id, 'Amazing first year. ~60 people showed up including 15 alumni. Flag sets from Walmart worked fine. Need a referee next time — disagreements on calls. Potluck was chaotic; assign dishes ahead of time by group (seniors bring mains, juniors bring sides, etc.).', v_user_id, NOW() - INTERVAL '1 year');

  -- ── Welcoming Night event_plan ────────────────────────────────────────────

  INSERT INTO event_plans (ministry_id, calendar_event_id, created_by)
  VALUES (v_ministry_id, v_welcoming_id, v_user_id)
  RETURNING id INTO v_plan_id;

  INSERT INTO event_tasks (event_plan_id, title, due_date, created_by) VALUES
    (v_plan_id, 'Reserve Student Union Ballroom', '2026-07-15', v_user_id),
    (v_plan_id, 'Design & print flyers/banners', '2026-08-15', v_user_id),
    (v_plan_id, 'Prepare icebreaker materials', '2026-08-25', v_user_id),
    (v_plan_id, 'Coordinate dinner & food orders', '2026-08-25', v_user_id),
    (v_plan_id, 'Brief all leaders on welcoming newcomers', '2026-08-28', v_user_id),
    (v_plan_id, 'Set up sign-in & connections card table', NULL, v_user_id),
    (v_plan_id, 'Arrange short worship set opener', NULL, v_user_id),
    (v_plan_id, 'Set up nametag stations (30 min before)', NULL, v_user_id);

  INSERT INTO event_roles (event_plan_id, role_name, created_by) VALUES
    (v_plan_id, 'Emcee', v_user_id),
    (v_plan_id, 'Food Lead', v_user_id),
    (v_plan_id, 'Setup Lead', v_user_id),
    (v_plan_id, 'Connections Lead', v_user_id),
    (v_plan_id, 'Worship Lead', v_user_id);

  INSERT INTO event_notes (event_plan_id, content, created_by, created_at) VALUES
    (v_plan_id, 'Brief ALL leaders beforehand — they should be proactively approaching newcomers, not just standing with each other. The icebreaker ''Two Truths and a Lie'' in small groups worked really well. Food ran out last year — order 20% more than you think you need. Nametag stations should be ready 30 min before doors open. Connections cards are key — follow up with everyone who fills one out within 48 hours.', v_user_id, NOW()),
    (v_plan_id, '~120 people attended. Logistics were solid. The worship opener set the right tone. Main feedback: some newcomers felt overwhelmed by the crowd; consider having a quieter side room with lawn games for introverts. Make sure the AV system is tested the day before.', v_user_id, NOW() - INTERVAL '1 year');

END $$;
