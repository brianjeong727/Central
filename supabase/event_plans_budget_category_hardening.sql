-- ═══════════════════════════════════════════════════════════════════════════════
-- Hardening: event_plans.budget_category_id — money ATTRIBUTION
--
-- STATUS: APPLIED 2026-08-03 (migrations `event_plans_budget_category_hardening` and
-- `event_plans_column_grant_correction`). From the rls-reviewer AFTER pass, warn 1.
-- ═══════════════════════════════════════════════════════════════════════════════
--
-- THE HOLE
-- The draws table made event AMOUNTS finance-gated, but budget_category_id — which
-- decides WHICH ceiling those amounts count against — was left client-writable and its
-- FK was single-column. Proven live by the reviewer, as a can_plan_events member holding
-- no finance permission whatsoever:
--     UPDATE event_plans SET budget_category_id = <own-tenant category>    -> 1 row
--     UPDATE event_plans SET budget_category_id = <OTHER ministry's cat>   -> 1 row  (!)
--
-- Not a cross-tenant leak: getCategoryCommitments filters the category-name lookup by
-- ministry, so a foreign link resolves to nothing and the draw is skipped. The real
-- consequence is silent UNDER-reporting inside the attacker's own tenant — the draw stays
-- visible on the event card but disappears from the Finance ceiling — plus the ability to
-- move committed money between ceilings with no finance permission. Amounts were
-- protected; attribution was not, which undercuts the guarantee the feature makes.

-- 1. Structural fix, matching the pattern already used for event_budget_draws: a composite
--    FK makes a cross-ministry link impossible at the DB rather than dependent on app code
--    remembering to check. Verified 0 existing rows violated it before repointing.
CREATE UNIQUE INDEX IF NOT EXISTS budget_categories_id_ministry_key
  ON public.budget_categories (id, ministry_id);

ALTER TABLE public.event_plans
  DROP CONSTRAINT IF EXISTS event_plans_budget_category_id_fkey;

ALTER TABLE public.event_plans
  ADD CONSTRAINT event_plans_budget_category_fkey
  FOREIGN KEY (budget_category_id, ministry_id)
  REFERENCES public.budget_categories (id, ministry_id) ON DELETE SET NULL;

-- 2. Take the column out of client reach.
--
--    ⚠ `REVOKE UPDATE (budget_category_id) … FROM authenticated` DOES NOT WORK and was
--    tried first: event_plans carries a TABLE-level UPDATE grant, and a column-level
--    REVOKE cannot subtract from one. It applied "successfully" and changed nothing —
--    has_column_privilege still returned true. The working shape is revoke-then-regrant.
--
--    Unlike budget_allocated, this needed no deploy-time deferral: the column is new, so
--    no deployed client statement names it, and its only writer anywhere is
--    setEventBudgetCategory on the admin client.
REVOKE UPDATE ON public.event_plans FROM authenticated, anon;

GRANT UPDATE (
  id, ministry_id, calendar_event_id,
  overview_notes, expected_turnout, budget_allocated,
  created_by, created_at, type_data, planning_group_id,
  plan_start_date, crunch_date, template_id, countdown_phases
) ON public.event_plans TO authenticated;
-- budget_allocated IS still granted here — it comes out at deploy time via
-- event_plans_budget_column_revoke.sql, which re-runs this same statement without it.
-- anon is not re-granted: no anon flow writes event_plans and RLS already denied it.

-- ── Verified after applying ───────────────────────────────────────────────────
--   budget_category_id UPDATE -> false     (locked)
--   budget_allocated   UPDATE -> true      (deferred, expected)
--   expected_turnout / overview_notes / type_data / crunch_date / countdown_phases -> true
--   anon UPDATE -> false
--   SELECT on budget_category_id -> true   (reads unaffected)
--   sandbox plan->category links intact: 7
