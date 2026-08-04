-- ═══════════════════════════════════════════════════════════════════════════════
-- DEPLOY-TIME STATEMENT — run ONLY after the split-save event Overview is live.
--
-- Companion to supabase/event_budget_draws_migration.sql. Split out because the
-- database is shared with production and this is the one piece that breaks
-- currently-deployed code.
-- ═══════════════════════════════════════════════════════════════════════════════
--
-- WHY IT EXISTS
-- Moving event money into event_budget_draws behind a finance-gated policy achieves
-- nothing while event_plans.budget_allocated stays writable by any can_plan_events
-- member: "Treasurer only" would remain decorative and the bug would exist in two
-- columns with different gates.
--
-- WHY IT IS NOT IN THE MIGRATION
-- The deployed handleSaveOverview writes budget_allocated through the BROWSER client in
-- the same UPDATE as expected_turnout and overview_notes. Postgres rejects the whole
-- statement when any targeted column is unprivileged, so running this early 403s that
-- save and breaks turnout + notes editing in production for every planner.
--
-- ⚠ CORRECTED SHAPE — the obvious version of this statement DOES NOT WORK.
-- The first draft of this file said:
--     REVOKE UPDATE (budget_allocated) ON public.event_plans FROM authenticated, anon;
-- That is a silent no-op. `event_plans` carries a TABLE-level UPDATE grant to
-- authenticated and anon (Supabase's project default), and a column-level REVOKE cannot
-- subtract from a table-level grant. Discovered empirically: after running exactly that
-- against budget_category_id, has_column_privilege(…, 'UPDATE') was still true.
--
-- The working shape is REVOKE-then-REGRANT: drop the table-level UPDATE, then grant back
-- UPDATE on precisely the columns that should stay client-writable. The migration
-- `event_plans_column_grant_correction` already did this once (to lock budget_category_id
-- and drop anon), so the statement below only needs to re-grant the same list MINUS
-- budget_allocated. If further columns are added to event_plans between now and deploy,
-- ADD THEM TO THIS LIST or they will silently become unwritable by clients.
--
-- ORDER OF OPERATIONS
--   1. event_budget_draws_migration.sql              (applied)
--   2. event_plans_budget_category_hardening         (applied)
--   3. event_plans_column_grant_correction           (applied)
--   4. Merge + deploy the feature (split save; budget_allocated no longer written by any
--      client path — verified: nothing in app/ writes it outside the admin client)
--   5. Run THIS file
--   6. Verify (below)

REVOKE UPDATE ON public.event_plans FROM authenticated, anon;

GRANT UPDATE (
  id, ministry_id, calendar_event_id,
  overview_notes, expected_turnout,
  created_by, created_at, type_data, planning_group_id,
  plan_start_date, crunch_date, template_id, countdown_phases
) ON public.event_plans TO authenticated;
-- budget_allocated and budget_category_id are BOTH omitted — that is the whole point.
-- Service-role paths (season-rollover.ts, seed-ccsf-events.mjs, the budget-planning
-- actions) bypass grants entirely and are unaffected.

-- ── Verify ────────────────────────────────────────────────────────────────────
-- Expect false:
--   select has_column_privilege('authenticated','public.event_plans','budget_allocated','UPDATE'),
--          has_column_privilege('authenticated','public.event_plans','budget_category_id','UPDATE');
-- Expect true (planners must keep these):
--   select has_column_privilege('authenticated','public.event_plans','expected_turnout','UPDATE'),
--          has_column_privilege('authenticated','public.event_plans','overview_notes','UPDATE'),
--          has_column_privilege('authenticated','public.event_plans','type_data','UPDATE'),
--          has_column_privilege('authenticated','public.event_plans','crunch_date','UPDATE');
--
-- Rollback if needed:
--   GRANT UPDATE ON public.event_plans TO authenticated;
