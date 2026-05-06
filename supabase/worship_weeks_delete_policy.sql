-- Adds the missing DELETE RLS policy for worship_weeks.
-- Without this, DELETE statements silently fail (RLS denies, 0 rows affected, no error).
-- This is why the "Delete week" button in the Schedule tab appeared broken — the optimistic
-- UI removed the row, but the DB delete was a no-op, so the next loadSchedule restored it.
--
-- Run this in the Supabase SQL editor.

CREATE POLICY "ww_delete_managers"
  ON worship_weeks FOR DELETE
  USING (auth_has_team_permission(team_id, 'can_manage_worship_set'));
