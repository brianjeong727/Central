-- ═══════════════════════════════════════════════════════════════════════════════
-- HOTFIX — event_plans write policies had NO tenant predicate
--
-- SEVERITY: cross-tenant destructive write, live in production until this applied.
--
-- The three write policies read:
--     auth_is_admin_or_leader() OR EXISTS (
--       SELECT 1 FROM team_members tm JOIN team_roles tr ON tr.id = tm.role_id
--       WHERE tm.user_id = auth.uid() AND tr.permissions @> '["can_plan_events"]')
--
-- Two independent defects:
--   1. No `ministry_id = auth_ministry_id()` predicate on UPDATE / INSERT / DELETE.
--      (SELECT has one; the write policies do not.)
--   2. The EXISTS subquery is itself unscoped — it matches a can_plan_events role on
--      ANY team in ANY ministry, so it is not even a check that the caller plans events
--      for the ministry whose row they are writing.
--
-- Why this is worse than a targeted cross-tenant edit: a WHERE clause naming `id`
-- causes Postgres to apply the (correctly scoped) SELECT policy to the UPDATE, so a
-- targeted blind write hits 0 rows. But an UNFILTERED write references no columns, so
-- SELECT is never consulted and the unscoped write policy is the only gate. That is
-- precisely the SQL PostgREST emits for an unfiltered `PATCH /rest/v1/event_plans` or
-- `DELETE /rest/v1/event_plans` (it uses RETURNING 1 so it needs no SELECT).
--
-- Measured live (member-tier account holding can_plan_events on one team, probes run
-- inside BEGIN … ROLLBACK):
--     UPDATE event_plans SET overview_notes='…'   -- no WHERE -> 79 rows, all 4 ministries
--     DELETE FROM event_plans                     -- no WHERE -> 80 rows, every plan on the platform
--     INSERT … ministry_id = '<other ministry>'   -- accepted
-- `authenticated` holds full table DML grants, so RLS was the only control.
--
-- After this fix, the same account: unfiltered UPDATE -> 35 rows (own ministry only),
-- unfiltered DELETE -> 35, cross-ministry INSERT -> denied 42501, own-ministry INSERT
-- still allowed. A second ministry's planner still edits their own 21 plans. No
-- legitimate planner loses access.
--
-- Scope note: this file contains ONLY the policy fix. It is deliberately independent of
-- the event-budget-draws feature that surfaced it, so it can ship on its own.
-- ═══════════════════════════════════════════════════════════════════════════════

-- The EXISTS now joins through `teams` so the permission must be held on a team IN THE
-- CALLER'S OWN MINISTRY — fixing defect 2. The outer `ministry_id = auth_ministry_id()`
-- fixes defect 1. Both are needed: the first alone would still let a planner from
-- another ministry qualify, and the second alone would still let any planner write rows
-- of a ministry they merely happen to belong to without planning rights.

DROP POLICY IF EXISTS event_plans_update ON public.event_plans;
CREATE POLICY event_plans_update ON public.event_plans FOR UPDATE
  USING (
    ministry_id = (SELECT auth_ministry_id())
    AND (
      (SELECT auth_is_admin_or_leader())
      OR EXISTS (
        SELECT 1 FROM team_members tm
        JOIN team_roles tr ON tr.id = tm.role_id
        JOIN teams t ON t.id = tm.team_id
        WHERE tm.user_id = (SELECT auth.uid())
          AND t.ministry_id = (SELECT auth_ministry_id())
          AND tr.permissions @> '["can_plan_events"]'::jsonb
      )
    )
  );
-- No explicit WITH CHECK: Postgres defaults it to the USING expression, which is what
-- prevents a planner relocating a plan into another ministry via UPDATE.

DROP POLICY IF EXISTS event_plans_insert ON public.event_plans;
CREATE POLICY event_plans_insert ON public.event_plans FOR INSERT
  WITH CHECK (
    ministry_id = (SELECT auth_ministry_id())
    AND (
      (SELECT auth_is_admin_or_leader())
      OR EXISTS (
        SELECT 1 FROM team_members tm
        JOIN team_roles tr ON tr.id = tm.role_id
        JOIN teams t ON t.id = tm.team_id
        WHERE tm.user_id = (SELECT auth.uid())
          AND t.ministry_id = (SELECT auth_ministry_id())
          AND tr.permissions @> '["can_plan_events"]'::jsonb
      )
    )
  );

DROP POLICY IF EXISTS event_plans_delete ON public.event_plans;
CREATE POLICY event_plans_delete ON public.event_plans FOR DELETE
  USING (
    ministry_id = (SELECT auth_ministry_id())
    AND (
      (SELECT auth_is_admin_or_leader())
      OR EXISTS (
        SELECT 1 FROM team_members tm
        JOIN team_roles tr ON tr.id = tm.role_id
        JOIN teams t ON t.id = tm.team_id
        WHERE tm.user_id = (SELECT auth.uid())
          AND t.ministry_id = (SELECT auth_ministry_id())
          AND tr.permissions @> '["can_plan_events"]'::jsonb
      )
    )
  );

-- ── Verify after applying ─────────────────────────────────────────────────────
-- All four policies (incl. SELECT) must now carry the tenant predicate:
--   select policyname, cmd,
--          coalesce(qual::text, with_check::text) like '%auth_ministry_id%' as has_tenant_predicate
--     from pg_policies where schemaname='public' and tablename='event_plans' order by cmd;
--   -- expect has_tenant_predicate = true for ALL FOUR rows
--
-- Related, NOT fixed here (tracked separately): auth_has_finance_permission() and
-- auth_has_finance_view_permission() are internally unscoped in the same way — they
-- match a finance role on any team anywhere. Every policy that uses them pairs them
-- with `ministry_id = auth_ministry_id()`, so they are not currently exploitable, but
-- the helpers should get the same `JOIN teams … AND t.ministry_id = auth_ministry_id()`
-- treatment applied above.
