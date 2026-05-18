-- Fix Student Org Board role permissions to match actual team workflow
-- (event planning, attendance tracking, member management, finance visibility)
-- Worship-related permissions are irrelevant to this team

UPDATE team_roles tr
SET permissions = CASE tr.name
  WHEN 'President'         THEN '["can_plan_events","can_view_finances","can_manage_members","can_manage_team","can_track_attendance"]'::jsonb
  WHEN 'Secretary'         THEN '["can_plan_events","can_manage_members","can_track_attendance"]'::jsonb
  WHEN 'Treasurer'         THEN '["can_view_finances","can_plan_events"]'::jsonb
  WHEN 'Event Coordinator' THEN '["can_plan_events","can_track_attendance"]'::jsonb
  ELSE permissions
END
WHERE tr.team_id IN (
  SELECT id FROM teams
  WHERE name ILIKE '%student%org%'
     OR name ILIKE '%student%board%'
     OR name ILIKE '%org%board%'
)
AND tr.name IN ('President', 'Secretary', 'Treasurer', 'Event Coordinator');
