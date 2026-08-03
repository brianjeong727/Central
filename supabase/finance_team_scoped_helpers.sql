-- ═══════════════════════════════════════════════════════════════════════════════
-- Finance-team-scoped RLS helpers — align the DB's "finance" with the app's
--
-- STATUS: APPLIED 2026-08-03 (migration `finance_team_scoped_helpers`).
-- From the rls-reviewer AFTER pass, warn 2.
-- ═══════════════════════════════════════════════════════════════════════════════
--
-- THE DIVERGENCE
-- auth_has_finance_permission() matches a `can_view_finances` role on ANY team in ANY
-- ministry — no ministry filter, no team_type filter:
--     select exists (select 1 from team_members tm join team_roles tr on tr.id = tm.role_id
--                     where tm.user_id = auth.uid() and tr.permissions ? 'can_view_finances')
-- computeFinanceCapability (app/actions/finance-auth.ts:38-43) requires membership on a
-- team with `.eq("ministry_id", ministryId).eq("team_type", "finance")`.
--
-- Live proof of the gap, not hypothetical: Daniel Lee holds can_view_finances as Treasurer
-- of "Student Org Board" (team_type='standard'); his role on the ACTUAL Finance team is
-- Finance Deacon (can_audit_finances only). The server action computes canApprove=false and
-- refuses him — yet under RLS he could write draws directly through the browser client.
-- This feature is the first thing to CLAIM the DB enforces "Treasurer only", so the gap
-- had to close here rather than be inherited.
--
-- WHY NEW HELPERS INSTEAD OF TIGHTENING THE SHARED ONE
-- auth_has_finance_permission() also gates receipt_fund_allocations and budget_entries.
-- Narrowing it in place would promote the surviving predicate to the effective gate on
-- those tables for the first time — a silent tightening with its own blast radius, and the
-- exact shape of past regressions. Those tables keep the old helper, untouched.

CREATE OR REPLACE FUNCTION public.auth_has_finance_team_permission()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1
      FROM team_members tm
      JOIN team_roles tr ON tr.id = tm.role_id
      JOIN teams t ON t.id = tm.team_id
     WHERE tm.user_id = auth.uid()
       AND t.ministry_id = auth_ministry_id()
       AND t.team_type = 'finance'
       AND tr.permissions ? 'can_view_finances'
  )
$$;

-- Read variant, mirroring computeFinanceCapability's canView: can_audit_finances is the
-- read-only finance-deacon role.
CREATE OR REPLACE FUNCTION public.auth_has_finance_team_view_permission()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1
      FROM team_members tm
      JOIN team_roles tr ON tr.id = tm.role_id
      JOIN teams t ON t.id = tm.team_id
     WHERE tm.user_id = auth.uid()
       AND t.ministry_id = auth_ministry_id()
       AND t.team_type = 'finance'
       AND (tr.permissions ? 'can_view_finances' OR tr.permissions ? 'can_audit_finances')
  )
$$;

-- Repointed: event_budget_draws (select→view variant, insert/update/delete→write variant)
-- and budget_cat_insert/update/delete (write variant). Each keeps its
-- `ministry_id = auth_ministry_id()` conjunct and its `auth_is_admin_or_leader() OR` branch.
-- Full policy bodies are in the applied migration `finance_team_scoped_helpers`.

-- ── IMPACT ANALYSIS RUN BEFORE APPLYING ───────────────────────────────────────
-- Four users passed the loose helper but not the scoped one. Three are unaffected because
-- auth_is_admin_or_leader() short-circuits first (it includes 'leader', not just admin-tier):
--   Alex Kang    — leader, Central          → unaffected
--   Daniel Kim   — leader, Central          → unaffected
--   E2E Admin    — admin, E2E Sandbox       → unaffected
--   Daniel Lee   — MEMBER, Brian's Sandbox  → loses draws/category WRITE
-- Daniel Lee is precisely the divergent case: the app already refused him. The narrowing
-- removes an access the product never intended to grant.
--
-- ── PROBES (all inside BEGIN … ROLLBACK, zero residue verified) ───────────────
-- Negative (Daniel Lee as-is):
--   draws visible                8   ← keeps READ via can_audit_finances on the finance team
--   draws UPDATE rows            0   ← loses WRITE
--   budget_categories DELETE     0
-- Positive — no non-admin currently holds can_view_finances on a real finance team, so the
-- helper's true-path does not exist in live data. Constructed it inside the transaction by
-- granting Daniel Lee's FINANCE-team role can_view_finances:
--   auth_has_finance_team_permission()        true
--   auth_has_finance_team_view_permission()   true
--   draws UPDATE rows                         8
--   budget_categories INSERT                  1
-- Rolled back; his role is can_audit_finances again, 0 probe rows remain, draws still
-- 8 rows / $2,100.
--
-- ── STILL OPEN ────────────────────────────────────────────────────────────────
-- receipt_fund_allocations and budget_entries remain on auth_has_finance_permission() and
-- therefore still honour a can_view_finances role held on any team in any ministry. Moving
-- them is a separate, deliberately reviewed change.
