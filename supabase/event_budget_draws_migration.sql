-- ═══════════════════════════════════════════════════════════════════════════════
-- Event budgets ↔ Finance allocation: "ceiling + draws"
--
-- Finance owns the per-(category, fund, fiscal_year) ALLOCATION (ministry_budgets).
-- Each LEAF event DRAWS against a category, split across funds. Allocated → committed
-- → spent. No two-way sync: the numbers mean different things.
--
-- STATUS: NOT YET APPLIED.
-- Incorporates the rls-reviewer BEFORE pass. Changes from the first draft:
--   · The event_plans policy fix was REMOVED — it was a live cross-tenant breach
--     unrelated to this feature and shipped separately (PR #261,
--     supabase/event_plans_tenant_scoping_hotfix.sql, already applied).
--   · budget_cat insert/delete brought to parity with the new update policy (block).
--   · REVOKE UPDATE (budget_allocated) added, without which "Treasurer only" stays
--     false and the bug simply lives in two columns with different gates (block).
--   · draws SELECT narrowed to finance + admin/leader (Brian's call).
--   · DROP POLICY IF EXISTS added to all four draw policies (idempotency).
--   · fund constrained by composite FK to finance_funds (ministry_id, slug).
--   · rename collision guard extended to the orphan cases.
-- ═══════════════════════════════════════════════════════════════════════════════


-- ── 1. budget_categories becomes the single category identity ─────────────────
-- The Finance grid currently unions hardcoded "DG Dinner" + every calendar_events.title
-- + budget_categories rows. Backfill a real row for every category string already in use
-- so the grid can read budget_categories alone without anything vanishing.
--
-- btrim on the way in: addBudgetCategory trims, so an untrimmed backfill would create
-- near-duplicates that look identical in the UI.

INSERT INTO public.budget_categories (ministry_id, name, created_by)
SELECT DISTINCT mb.ministry_id, btrim(mb.category), NULL::uuid
  FROM public.ministry_budgets mb
 WHERE mb.category IS NOT NULL AND btrim(mb.category) <> ''
ON CONFLICT (ministry_id, name) DO NOTHING;

INSERT INTO public.budget_categories (ministry_id, name, created_by)
SELECT DISTINCT be.ministry_id, btrim(be.category), NULL::uuid
  FROM public.budget_entries be
 WHERE be.category IS NOT NULL AND btrim(be.category) <> ''
ON CONFLICT (ministry_id, name) DO NOTHING;

-- Renaming a category is currently IMPOSSIBLE: no UPDATE policy, no rename action.
-- That is why renaming a calendar event silently orphans its allocations and ledger rows.
--
-- The three policies are brought to ONE predicate deliberately. Previously insert/delete
-- were admin/leader-only while getFinanceCapability told a finance treasurer they could
-- manage categories — so deleteBudgetCategory would purge every ministry_budgets row via
-- the service-role client and then silently fail (0 rows, error null) on the RLS-client
-- category delete, reporting success with the allocations already gone. Adding an update
-- policy at a wider predicate than insert/delete would have deepened that asymmetry.
DROP POLICY IF EXISTS budget_cat_update ON public.budget_categories;
CREATE POLICY budget_cat_update ON public.budget_categories FOR UPDATE
  USING (
    ministry_id = (SELECT auth_ministry_id())
    AND ((SELECT auth_is_admin_or_leader()) OR (SELECT auth_has_finance_permission()))
  );

DROP POLICY IF EXISTS budget_cat_insert ON public.budget_categories;
CREATE POLICY budget_cat_insert ON public.budget_categories FOR INSERT
  WITH CHECK (
    ministry_id = (SELECT auth_ministry_id())
    AND ((SELECT auth_is_admin_or_leader()) OR (SELECT auth_has_finance_permission()))
  );

DROP POLICY IF EXISTS budget_cat_delete ON public.budget_categories;
CREATE POLICY budget_cat_delete ON public.budget_categories FOR DELETE
  USING (
    ministry_id = (SELECT auth_ministry_id())
    AND ((SELECT auth_is_admin_or_leader()) OR (SELECT auth_has_finance_permission()))
  );


-- ── 2. The rename cascade ─────────────────────────────────────────────────────
-- Category identity lives in budget_categories.name, but ministry_budgets.category and
-- budget_entries.category are still text. Renaming must move all three ATOMICALLY —
-- three separate PostgREST calls can half-apply and orphan the ledger.
--
-- SECURITY INVOKER on purpose: the caller is the service-role admin client (which
-- bypasses RLS) behind a cap.canApprove check in the server action. EXECUTE is revoked
-- from PUBLIC so it can never be reached from a browser client.

CREATE OR REPLACE FUNCTION public.rename_budget_category(
  p_ministry_id uuid,
  p_from_name   text,
  p_to_name     text
) RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_to text := btrim(p_to_name);
BEGIN
  IF v_to = '' OR p_from_name IS NULL THEN
    RAISE EXCEPTION 'rename_budget_category: names must be non-empty';
  END IF;
  IF v_to = p_from_name THEN
    RETURN;
  END IF;

  -- Collision guard. Checking budget_categories ALONE is not enough: deleteBudgetCategory
  -- purges ministry_budgets and the category row but never budget_entries, so a ledger
  -- category can exist with no category row behind it. Renaming onto that orphan would
  -- silently merge two categories' money with nothing to catch it — ministry_budgets'
  -- unique constraint only fires if BOTH sides have allocation rows for the same
  -- (fiscal_year, fund). So check all three tables.
  IF EXISTS (SELECT 1 FROM budget_categories
              WHERE ministry_id = p_ministry_id AND name = v_to)
     OR EXISTS (SELECT 1 FROM ministry_budgets
                 WHERE ministry_id = p_ministry_id AND category = v_to)
     OR EXISTS (SELECT 1 FROM budget_entries
                 WHERE ministry_id = p_ministry_id AND category = v_to) THEN
    RAISE EXCEPTION 'A category named "%" already exists (or has allocations/ledger entries)', v_to
      USING ERRCODE = 'unique_violation';
  END IF;

  -- Source-orphan case is intentionally allowed to fall through: if there is no
  -- budget_categories row for p_from_name but ministry_budgets/budget_entries hold rows,
  -- the two text UPDATEs still fire and repair the orphan.
  UPDATE budget_categories SET name = v_to
   WHERE ministry_id = p_ministry_id AND name = p_from_name;

  UPDATE ministry_budgets SET category = v_to
   WHERE ministry_id = p_ministry_id AND category = p_from_name;

  UPDATE budget_entries SET category = v_to
   WHERE ministry_id = p_ministry_id AND category = p_from_name;
END;
$$;

-- anon/authenticated MUST be named explicitly. Supabase's project defaults include
-- `ALTER DEFAULT PRIVILEGES ... ON FUNCTIONS GRANT ALL TO anon, authenticated,
-- service_role`, which is a DIRECT grant — revoking from PUBLIC alone leaves it in place
-- and the function stays callable straight from a browser client. Verified: with only
-- `FROM PUBLIC`, has_function_privilege('authenticated', …, 'EXECUTE') returned true.
REVOKE ALL ON FUNCTION public.rename_budget_category(uuid, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.rename_budget_category(uuid, text, text) TO service_role;


-- ── 3. The event → category link ──────────────────────────────────────────────
-- Replaces the calendar-event-title string match. ON DELETE SET NULL: deleting a
-- category unlinks the event rather than cascading away its plan.
--
-- Note for the delete path: draws survive a category delete and still hold money while
-- their plan's budget_category_id goes NULL, so a roll-up joining draws → plan →
-- category would silently drop them. deleteBudgetCategory must therefore delete or
-- reassign the affected draws explicitly and report the count before deleting.

ALTER TABLE public.event_plans
  ADD COLUMN IF NOT EXISTS budget_category_id uuid
    REFERENCES public.budget_categories(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS event_plans_budget_category_idx
  ON public.event_plans (budget_category_id) WHERE budget_category_id IS NOT NULL;

-- Target of the composite FK below — what guarantees a draw can never point at a plan
-- in another ministry.
CREATE UNIQUE INDEX IF NOT EXISTS event_plans_id_ministry_key
  ON public.event_plans (id, ministry_id);

-- ── Make "Treasurer only" TRUE — DEFERRED, see the separate file ──────────────
-- The required statement is:
--     REVOKE UPDATE (budget_allocated) ON public.event_plans FROM authenticated, anon;
--
-- It is NOT in this migration ON PURPOSE. This database is shared with production, and
-- the currently-deployed handleSaveOverview writes budget_allocated through the BROWSER
-- client in the same UPDATE as expected_turnout and overview_notes. Revoking the column
-- before the new UI ships would 403 that statement and break turnout and notes editing
-- in production — for every planner, immediately, with no code change to explain it.
--
-- It therefore lives in supabase/event_plans_budget_column_revoke.sql and is applied at
-- DEPLOY time, after the split-save UI is live. Everything else here is purely additive
-- and safe to apply against prod ahead of the code.
--
-- Until that runs, bug B is only half-fixed: draws are properly gated, but the legacy
-- column is still planner-writable. Do not mark bug B closed on the strength of this
-- migration alone.


-- ── 4. event_budget_draws — the per-fund draw ─────────────────────────────────
-- `fund` is the SLUG TEXT, matching ministry_budgets.fund. Deliberately NOT fund_id:
-- that column exists on ministry_budgets, is NULL on every row, and is read by nothing —
-- the dual-write transition it was added for never happened. Adding a second dead id
-- column would repeat that mistake rather than fix it.
--
-- Unlike ministry_budgets, the slug here IS constrained (composite FK below). Free-text
-- funds are how 'church' and 'Church' become two rows that both count, double-charging a
-- category, and how a renamed slug drops draws out of every per-fund total while leaving
-- the category total intact.

CREATE TABLE IF NOT EXISTS public.event_budget_draws (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ministry_id   uuid NOT NULL REFERENCES public.ministries(id) ON DELETE CASCADE,
  event_plan_id uuid NOT NULL,
  fund          text NOT NULL,
  amount        numeric(10,2) NOT NULL DEFAULT 0 CHECK (amount >= 0),
  created_by    uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_by    uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_at    timestamptz NOT NULL DEFAULT now(),
  created_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (event_plan_id, fund),
  -- The draw's ministry MUST equal its plan's ministry. Without this, a plausible-looking
  -- ministry_id could disagree with the plan it points at and every roll-up filtered by
  -- ministry_id would quietly mis-total. This composite FK supersedes a plain
  -- event_plan_id FK, so only this one is declared.
  FOREIGN KEY (event_plan_id, ministry_id)
    REFERENCES public.event_plans (id, ministry_id) ON DELETE CASCADE,
  -- The fund must be a real fund OF THIS MINISTRY. RESTRICT, not CASCADE: deleting a
  -- fund that events have drawn against should fail loudly, not silently delete money.
  FOREIGN KEY (ministry_id, fund)
    REFERENCES public.finance_funds (ministry_id, slug) ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS event_budget_draws_plan_idx
  ON public.event_budget_draws (event_plan_id);
CREATE INDEX IF NOT EXISTS event_budget_draws_ministry_fund_idx
  ON public.event_budget_draws (ministry_id, fund);

ALTER TABLE public.event_budget_draws ENABLE ROW LEVEL SECURITY;

-- SELECT: finance + admin/leader, matching receipt_fund_allocations rather than the
-- whole ministry. Per-fund money splits stay with the people who own money; the event
-- card shows the category ceiling to everyone and the fund breakdown only to finance.
DROP POLICY IF EXISTS event_budget_draws_select ON public.event_budget_draws;
CREATE POLICY event_budget_draws_select ON public.event_budget_draws FOR SELECT
  USING (
    ministry_id = (SELECT auth_ministry_id())
    AND ((SELECT auth_is_admin_or_leader()) OR (SELECT auth_has_finance_view_permission()))
  );

-- WRITES: admin/leader OR finance-write. Together with the REVOKE above, this is what
-- makes the event card's "Treasurer only" label true rather than decorative.
-- NOTE: auth_has_finance_permission() is internally UNSCOPED (it matches a
-- can_view_finances role on any team anywhere), so the `AND ministry_id =
-- auth_ministry_id()` on every policy is the only thing supplying tenant scoping. Do not
-- drop it. Fixing the helper itself is tracked separately.
DROP POLICY IF EXISTS event_budget_draws_insert ON public.event_budget_draws;
CREATE POLICY event_budget_draws_insert ON public.event_budget_draws FOR INSERT
  WITH CHECK (
    ministry_id = (SELECT auth_ministry_id())
    AND ((SELECT auth_is_admin_or_leader()) OR (SELECT auth_has_finance_permission()))
  );

DROP POLICY IF EXISTS event_budget_draws_update ON public.event_budget_draws;
CREATE POLICY event_budget_draws_update ON public.event_budget_draws FOR UPDATE
  USING (
    ministry_id = (SELECT auth_ministry_id())
    AND ((SELECT auth_is_admin_or_leader()) OR (SELECT auth_has_finance_permission()))
  );

DROP POLICY IF EXISTS event_budget_draws_delete ON public.event_budget_draws;
CREATE POLICY event_budget_draws_delete ON public.event_budget_draws FOR DELETE
  USING (
    ministry_id = (SELECT auth_ministry_id())
    AND ((SELECT auth_is_admin_or_leader()) OR (SELECT auth_has_finance_permission()))
  );


-- ── "Only leaf events commit" is enforced in the ROLL-UP, not by a constraint ──
-- Deliberate. A container is an event with children, and children are added over time —
-- so a draw that is valid when written (week with no nights yet) becomes invalid later.
-- A CHECK cannot reference other tables, and a trigger could only catch the ordering
-- where nights already exist, giving false confidence for the ordering that actually
-- occurs. getCategoryCommitments therefore excludes any plan whose calendar_event has
-- children, and the UI does not offer a draw editor on a container. Two consequences to
-- keep in mind when reading a committed figure:
--   · event_plans rows are created lazily on first workspace open, so a night nobody has
--     opened has no plan and no draw — committed reads LOW with no signal.
--   · a draw left on an event that later became a container stops counting, silently.
--     The roll-up should surface those rather than drop them.


-- ── Verify after applying ─────────────────────────────────────────────────────
-- 1. Backfill completeness — zero rows expected:
--      select 'ministry_budgets' src, mb.ministry_id, mb.category from ministry_budgets mb
--       where not exists (select 1 from budget_categories bc
--                          where bc.ministry_id=mb.ministry_id and bc.name=btrim(mb.category))
--      union all
--      select 'budget_entries', be.ministry_id, be.category from budget_entries be
--       where not exists (select 1 from budget_categories bc
--                          where bc.ministry_id=be.ministry_id and bc.name=btrim(be.category));
-- 2. Draws RLS on + 4 policies, all tenant-scoped:
--      select relrowsecurity from pg_class where oid='public.event_budget_draws'::regclass;
--      select policyname, cmd, coalesce(qual::text, with_check::text) like '%auth_ministry_id%'
--        from pg_policies where tablename='event_budget_draws';
-- 3. budget_allocated no longer client-writable (expect false):
--      select has_column_privilege('authenticated','public.event_plans','budget_allocated','UPDATE');
-- 4. Rename fn not client-callable (expect false):
--      select has_function_privilege('authenticated',
--        'public.rename_budget_category(uuid,text,text)', 'EXECUTE');
-- 5. budget_categories policies now share one predicate:
--      select policyname, cmd from pg_policies where tablename='budget_categories';
