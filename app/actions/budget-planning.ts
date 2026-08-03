"use server"

import { createClient } from "@/lib/supabase-server"
import { createAdminClient } from "@/lib/supabase-admin"
import { getFinanceCapability } from "./finance-auth"
import { currentFiscalYear, fiscalYearToDateRange } from "@/lib/fiscal-year"
import { getMinistryTimezone } from "@/lib/ministry-timezone"
import { dayEndInstantISO, dayStartInstantISO } from "@/lib/tz"

export interface BudgetAllocation {
  id: string
  ministry_id: string
  fiscal_year: string
  category: string
  fund: string
  allocated_amount: number
  notes: string | null
}

// One row per (category, fund). `fund` is the slug stored on budget_entries, or
// null for legacy entries with no fund attributed. Consumers that want a
// category-level total sum across all funds for that category.
export interface CategoryActual {
  category: string
  fund: string | null
  total_spent: number
}

// A single event's draw against one fund. One row per (event_plan_id, fund) —
// `fund` is the finance_funds SLUG (composite-FK enforced), never fund_id.
export interface EventBudgetDraw {
  id: string
  ministry_id: string
  event_plan_id: string
  fund: string
  amount: number
}

// Committed = the sum of LEAF-event draws against a (category, fund) inside a
// fiscal year — the middle number between allocated (ministry_budgets) and spent
// (budget_entries). `events` carries the contributing events so Finance can drill
// from a committed figure to the events that make it up.
export interface CategoryCommitment {
  category: string
  fund: string
  committed: number
  events: Array<{ eventPlanId: string; calendarEventId: string; title: string; amount: number }>
}

// Historical allocation years (any year with ministry_budgets rows) + the current
// fiscal year — never future years. Sorted ascending; the current year is last.
export async function getAllocationYears(
  ministryId: string,
): Promise<{ data: string[]; error: string | null }> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from("ministry_budgets")
    .select("fiscal_year")
    .eq("ministry_id", ministryId)
  if (error) return { data: [currentFiscalYear()], error: error.message }
  const years = new Set((data ?? []).map((r) => (r as { fiscal_year: string }).fiscal_year))
  years.add(currentFiscalYear())
  return { data: Array.from(years).sort(), error: null }
}

export async function getBudgetAllocations(
  ministryId: string,
  fiscalYear: string,
): Promise<{ data: BudgetAllocation[]; error: string | null }> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from("ministry_budgets")
    .select("*")
    .eq("ministry_id", ministryId)
    .eq("fiscal_year", fiscalYear)
    .order("category")
  if (error) return { data: [], error: error.message }
  return { data: (data ?? []) as BudgetAllocation[], error: null }
}

export async function upsertBudgetAllocation(params: {
  ministryId: string
  fiscalYear: string
  category: string
  fund: string
  amount: number
  notes?: string
}): Promise<{ error: string | null }> {
  const admin = createAdminClient()

  // Finance-capability gate (admin-tier OR finance team w/ can_view_finances).
  const cap = await getFinanceCapability(params.ministryId)
  if (!cap.canApprove) return { error: "Not authorized" }

  // Verify caller is authenticated (additional safety layer)
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: "Not authenticated" }

  const { error } = await admin
    .from("ministry_budgets")
    .upsert(
      {
        ministry_id:      params.ministryId,
        fiscal_year:      params.fiscalYear,
        category:         params.category,
        fund:             params.fund,
        allocated_amount: params.amount,
        notes:            params.notes ?? null,
        updated_by:       user.id,
        updated_at:       new Date().toISOString(),
        created_by:       user.id,
      },
      { onConflict: "ministry_id,fiscal_year,category,fund" },
    )
  if (error) return { error: error.message }
  return { error: null }
}

export async function getCategoryActuals(
  ministryId: string,
  fiscalYear: string,
): Promise<{ data: CategoryActual[]; error: string | null }> {
  const supabase = await createClient()
  const { start, end } = fiscalYearToDateRange(fiscalYear)

  const { data, error } = await supabase
    .from("budget_entries")
    .select("category, amount, fund")
    .eq("ministry_id", ministryId)
    .gte("entry_date", start)
    .lte("entry_date", end)

  if (error) return { data: [], error: error.message }

  // Aggregate by (category, fund) client-side (Supabase JS doesn't expose GROUP BY
  // cleanly). A category-level total is the sum across its fund rows; per-fund
  // rows drive the overview's fund breakdown (legacy null-fund rows still count
  // into the category total but carry no fund).
  const totals = new Map<string, CategoryActual>()
  for (const row of (data ?? []) as { category: string; amount: number; fund: string | null }[]) {
    const fund = row.fund ?? null
    const key = `${row.category}::${fund ?? ""}`
    const cur = totals.get(key) ?? { category: row.category, fund, total_spent: 0 }
    cur.total_spent += Number(row.amount)
    totals.set(key, cur)
  }

  return { data: Array.from(totals.values()), error: null }
}

export interface BudgetCategory {
  id: string
  name: string
  created_at: string
}

export async function getBudgetCategories(
  ministryId: string,
): Promise<{ data: BudgetCategory[]; error: string | null }> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from("budget_categories")
    .select("id, name, created_at")
    .eq("ministry_id", ministryId)
    .order("created_at", { ascending: true })
  if (error) return { data: [], error: error.message }
  return { data: (data ?? []) as BudgetCategory[], error: null }
}

export async function addBudgetCategory(
  ministryId: string,
  name: string,
  userId: string,
): Promise<{ data: BudgetCategory | null; error: string | null }> {
  // Finance-capability gate (admin-tier OR finance team w/ can_view_finances).
  const cap = await getFinanceCapability(ministryId)
  if (!cap.canApprove) return { data: null, error: "Not authorized" }

  const supabase = await createClient()
  const { data, error } = await supabase
    .from("budget_categories")
    .insert({ ministry_id: ministryId, name: name.trim(), created_by: userId })
    .select("id, name, created_at")
    .single()
  if (error) return { data: null, error: error.message }
  return { data: data as BudgetCategory, error: null }
}

/**
 * Delete a category and everything that pointed at it, in one gate.
 *
 * The previous version half-applied by construction: it service-role-deleted every
 * `ministry_budgets` row for the category across ALL fiscal years, then deleted the
 * `budget_categories` row through the USER client — whose policy was admin/leader-only
 * at the time. A finance treasurer therefore got `0 rows, error: null` on step two and
 * the action reported success with the allocations already destroyed. The migration
 * brought the category policies to parity, but the ordering stays wrong on principle:
 * both deletes now run on the ADMIN client so `cap.canApprove` is the single gate and
 * neither half can silently fail while the other lands.
 *
 * Draws are deleted explicitly BEFORE the category row. `event_plans.budget_category_id`
 * is `ON DELETE SET NULL`, so a surviving draw would still hold money while its plan's
 * category went NULL — invisible to `getCategoryCommitments` (which joins through the
 * category) but still shown on the event card as committed.
 *
 * Returns the counts so the UI can warn before/after ("this deletes 3 allocations and
 * unlinks 2 events"). Note `budget_entries` rows are deliberately NOT touched — the
 * ledger is historical record; its `category` text simply becomes an orphan string, the
 * pre-existing behavior the rename cascade's collision guard already accounts for.
 */
export async function deleteBudgetCategory(
  ministryId: string,
  categoryName: string,
): Promise<{ error: string | null; deletedAllocations: number; unlinkedEvents: number }> {
  // Finance-capability gate (admin-tier OR finance team w/ can_view_finances).
  const cap = await getFinanceCapability(ministryId)
  if (!cap.canApprove) return { error: "Not authorized", deletedAllocations: 0, unlinkedEvents: 0 }

  const admin = createAdminClient()

  // The category row (may be absent — a ledger-only orphan string is still deletable
  // from the grid, and its allocations should still be purged).
  const { data: catRow } = await admin
    .from("budget_categories")
    .select("id")
    .eq("ministry_id", ministryId)
    .eq("name", categoryName)
    .maybeSingle()
  const categoryId = (catRow as { id: string } | null)?.id ?? null

  // Events drawing against this category → drop their draws first.
  let unlinkedEvents = 0
  if (categoryId) {
    const { data: planRows } = await admin
      .from("event_plans")
      .select("id")
      .eq("ministry_id", ministryId)
      .eq("budget_category_id", categoryId)
    const planIds = ((planRows ?? []) as { id: string }[]).map((p) => p.id)
    unlinkedEvents = planIds.length
    if (planIds.length) {
      const { error: drawErr } = await admin
        .from("event_budget_draws")
        .delete()
        .eq("ministry_id", ministryId)
        .in("event_plan_id", planIds)
      if (drawErr) return { error: drawErr.message, deletedAllocations: 0, unlinkedEvents: 0 }
    }
  }

  // Allocations across every fiscal year.
  const { data: deletedAlloc, error: allocErr } = await admin
    .from("ministry_budgets")
    .delete()
    .eq("ministry_id", ministryId)
    .eq("category", categoryName)
    .select("id")
  if (allocErr) return { error: allocErr.message, deletedAllocations: 0, unlinkedEvents }

  // The category row itself. ON DELETE SET NULL clears event_plans.budget_category_id.
  const { error } = await admin
    .from("budget_categories")
    .delete()
    .eq("ministry_id", ministryId)
    .eq("name", categoryName)
  if (error) return { error: error.message, deletedAllocations: (deletedAlloc ?? []).length, unlinkedEvents }

  return { error: null, deletedAllocations: (deletedAlloc ?? []).length, unlinkedEvents }
}

/**
 * Rename a category across all three places its identity lives.
 *
 * `budget_categories.name` is the identity, but `ministry_budgets.category` and
 * `budget_entries.category` are still free text — so a rename has to move all three
 * ATOMICALLY or it orphans allocations and ledger rows (exactly the breakage that made
 * renaming a calendar event lose its money under the old title-match scheme). The
 * `rename_budget_category` RPC does it in one statement and is service-role-only by
 * design (EXECUTE revoked from anon/authenticated), so it must be called on the admin
 * client behind this capability gate.
 */
export async function renameBudgetCategory(
  ministryId: string,
  fromName: string,
  toName: string,
): Promise<{ error: string | null }> {
  const cap = await getFinanceCapability(ministryId)
  if (!cap.canApprove) return { error: "Not authorized" }

  const trimmed = toName.trim()
  if (!trimmed) return { error: "Category name can't be empty" }

  const admin = createAdminClient()
  const { error } = await admin.rpc("rename_budget_category", {
    p_ministry_id: ministryId,
    p_from_name:   fromName,
    p_to_name:     trimmed,
  })

  if (error) {
    // The RPC raises unique_violation (23505) when the target name already exists in
    // budget_categories, ministry_budgets, OR budget_entries — merging two categories'
    // money silently is the thing it refuses to do.
    if (error.code === "23505" || /already exists/i.test(error.message)) {
      return { error: `A category named "${trimmed}" already exists.` }
    }
    return { error: error.message }
  }
  return { error: null }
}

// ─── Event budget draws ───────────────────────────────────────────────────────

/**
 * This event's per-fund draws.
 *
 * User client on purpose: `event_budget_draws` SELECT is finance + admin/leader only
 * (per-fund money splits stay with the people who own money). A non-finance planner
 * therefore gets an EMPTY array with `error: null` — that is the designed outcome, not
 * a failure, and callers must not render it as an error state.
 */
export async function getEventDraws(
  eventPlanId: string,
): Promise<{ data: EventBudgetDraw[]; error: string | null }> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from("event_budget_draws")
    .select("id, ministry_id, event_plan_id, fund, amount")
    .eq("event_plan_id", eventPlanId)
    .order("fund")
  if (error) return { data: [], error: error.message }
  return {
    data: ((data ?? []) as EventBudgetDraw[]).map((d) => ({ ...d, amount: Number(d.amount) })),
    error: null,
  }
}

/**
 * Set one fund's draw for an event. Amount 0 DELETES the row rather than storing a
 * zero — a zero draw and no draw must not be two states every roll-up has to tell
 * apart. Mirrors `upsertBudgetAllocation`'s gate exactly (`cap.canApprove`, which is
 * the finance WRITE flag despite deriving from `can_view_finances`).
 *
 * The plan is not re-verified against `ministryId` in app code: the composite FK
 * `(event_plan_id, ministry_id) → event_plans (id, ministry_id)` makes a cross-tenant
 * pairing fail at the database. The `fund` slug is likewise FK-checked against this
 * ministry's `finance_funds`.
 */
export async function upsertEventDraw(params: {
  ministryId: string
  eventPlanId: string
  fund: string
  amount: number
}): Promise<{ error: string | null }> {
  const cap = await getFinanceCapability(params.ministryId)
  if (!cap.canApprove) return { error: "Not authorized" }

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: "Not authenticated" }

  // Reject before the CHECK constraint so the caller gets a sentence, not a 23514.
  if (!Number.isFinite(params.amount) || params.amount < 0) {
    return { error: "Amount must be zero or more" }
  }

  const admin = createAdminClient()

  if (params.amount === 0) {
    const { error } = await admin
      .from("event_budget_draws")
      .delete()
      .eq("ministry_id", params.ministryId)
      .eq("event_plan_id", params.eventPlanId)
      .eq("fund", params.fund)
    if (error) return { error: error.message }
    return { error: null }
  }

  const { error } = await admin
    .from("event_budget_draws")
    .upsert(
      {
        ministry_id:   params.ministryId,
        event_plan_id: params.eventPlanId,
        fund:          params.fund,
        amount:        params.amount,
        created_by:    user.id,
        updated_by:    user.id,
        updated_at:    new Date().toISOString(),
      },
      { onConflict: "event_plan_id,fund" },
    )
  if (error) return { error: error.message }
  return { error: null }
}

/**
 * Link (or unlink) an event to the budget category it draws against. Replaces the old
 * calendar-event-TITLE string match, which orphaned every allocation the moment someone
 * renamed the event.
 *
 * The ministry is derived from the plan rather than trusted from the caller, and
 * `getFinanceCapability` then verifies the caller actually belongs to that ministry —
 * so a plan id from another tenant fails the gate rather than the write.
 */
export async function setEventBudgetCategory(
  eventPlanId: string,
  categoryId: string | null,
): Promise<{ error: string | null }> {
  const admin = createAdminClient()

  const { data: planRow } = await admin
    .from("event_plans")
    .select("ministry_id")
    .eq("id", eventPlanId)
    .maybeSingle()
  const ministryId = (planRow as { ministry_id: string } | null)?.ministry_id
  if (!ministryId) return { error: "Event plan not found" }

  const cap = await getFinanceCapability(ministryId)
  if (!cap.canApprove) return { error: "Not authorized" }

  // The FK points at budget_categories(id) with no ministry predicate, so same-tenancy
  // is app code's job here (unlike draws, which carry a composite FK).
  if (categoryId) {
    const { data: catRow } = await admin
      .from("budget_categories")
      .select("id")
      .eq("id", categoryId)
      .eq("ministry_id", ministryId)
      .maybeSingle()
    if (!catRow) return { error: "Category not found" }
  }

  const { error } = await admin
    .from("event_plans")
    .update({ budget_category_id: categoryId })
    .eq("id", eventPlanId)
    .eq("ministry_id", ministryId)
  if (error) return { error: error.message }
  return { error: null }
}

/**
 * Committed money per (category, fund) for a fiscal year — the middle number between
 * allocated and spent.
 *
 * Three constraints shape this:
 *
 * · ONLY LEAF EVENTS COMMIT. A container (an event with children) rolls its nights up;
 *   counting both would double-charge the category. This cannot be a DB constraint —
 *   children are added over time, so a draw that was valid when written becomes invalid
 *   later — so the exclusion lives here, per the migration's note.
 * · FISCAL YEAR COMES FROM THE EVENT. A draw has no fiscal year of its own; it inherits
 *   the one containing its event's `start_date`. That column is a timestamptz holding a
 *   true instant, so the June 1 / May 31 boundaries are converted to instants in the
 *   MINISTRY's zone (Convention #23) instead of being compared against bare date strings
 *   — otherwise a May 31 evening event east or west of UTC lands in the wrong year.
 * · AGGREGATION IS IN JS, mirroring `getCategoryActuals` — Supabase JS exposes no clean
 *   GROUP BY. The joins are separate round trips rather than PostgREST embeds because
 *   the draws→plans relationship is a COMPOSITE FK, which embed syntax resolves poorly.
 *
 * Plans with a null `budget_category_id` contribute nothing (unlinked money is not
 * committed against anything). Reads through the user client, so a non-finance caller
 * sees zero draws — same designed emptiness as `getEventDraws`.
 */
export async function getCategoryCommitments(
  ministryId: string,
  fiscalYear: string,
): Promise<{ data: CategoryCommitment[]; error: string | null }> {
  const supabase = await createClient()

  const { data: drawRows, error: drawErr } = await supabase
    .from("event_budget_draws")
    .select("event_plan_id, fund, amount")
    .eq("ministry_id", ministryId)
  if (drawErr) return { data: [], error: drawErr.message }
  const draws = (drawRows ?? []) as { event_plan_id: string; fund: string; amount: number }[]
  if (!draws.length) return { data: [], error: null }

  // Plans behind those draws, with their category link.
  const planIds = Array.from(new Set(draws.map((d) => d.event_plan_id)))
  const { data: planRows, error: planErr } = await supabase
    .from("event_plans")
    .select("id, calendar_event_id, budget_category_id")
    .eq("ministry_id", ministryId)
    .in("id", planIds)
  if (planErr) return { data: [], error: planErr.message }
  const plans = ((planRows ?? []) as {
    id: string; calendar_event_id: string; budget_category_id: string | null
  }[]).filter((p) => p.budget_category_id && p.calendar_event_id)
  if (!plans.length) return { data: [], error: null }

  // Events inside the fiscal window. Boundaries resolved in the ministry's zone.
  const timeZone = await getMinistryTimezone(supabase, ministryId)
  const { start, end } = fiscalYearToDateRange(fiscalYear)
  const { data: eventRows, error: eventErr } = await supabase
    .from("calendar_events")
    .select("id, title, parent_event_id")
    .eq("ministry_id", ministryId)
    .in("id", plans.map((p) => p.calendar_event_id))
    .gte("start_date", dayStartInstantISO(start, timeZone))
    .lte("start_date", dayEndInstantISO(end, timeZone))
  if (eventErr) return { data: [], error: eventErr.message }
  const events = (eventRows ?? []) as { id: string; title: string; parent_event_id: string | null }[]
  if (!events.length) return { data: [], error: null }

  // Leaf test: does any event name this one as its parent? Asked of the whole ministry,
  // not just the in-window set — a container's nights can sit outside the window.
  const { data: childRows, error: childErr } = await supabase
    .from("calendar_events")
    .select("parent_event_id")
    .eq("ministry_id", ministryId)
    .in("parent_event_id", events.map((e) => e.id))
  if (childErr) return { data: [], error: childErr.message }
  const containerIds = new Set(
    ((childRows ?? []) as { parent_event_id: string | null }[])
      .map((r) => r.parent_event_id)
      .filter((id): id is string => !!id),
  )

  const categoryIds = Array.from(new Set(plans.map((p) => p.budget_category_id as string)))
  const { data: catRows, error: catErr } = await supabase
    .from("budget_categories")
    .select("id, name")
    .eq("ministry_id", ministryId)
    .in("id", categoryIds)
  if (catErr) return { data: [], error: catErr.message }
  const categoryName = new Map(((catRows ?? []) as { id: string; name: string }[]).map((c) => [c.id, c.name]))

  const eventById = new Map(events.map((e) => [e.id, e]))
  const planById = new Map(plans.map((p) => [p.id, p]))

  const groups = new Map<string, CategoryCommitment>()
  for (const draw of draws) {
    const plan = planById.get(draw.event_plan_id)
    if (!plan) continue
    const event = eventById.get(plan.calendar_event_id)
    if (!event) continue                       // outside the fiscal window
    if (containerIds.has(event.id)) continue   // container — its nights commit instead
    const category = categoryName.get(plan.budget_category_id as string)
    if (!category) continue

    const amount = Number(draw.amount)
    const key = `${category}::${draw.fund}`
    const cur = groups.get(key) ?? { category, fund: draw.fund, committed: 0, events: [] }
    cur.committed += amount
    cur.events.push({
      eventPlanId:     plan.id,
      calendarEventId: event.id,
      title:           event.title,
      amount,
    })
    groups.set(key, cur)
  }

  return { data: Array.from(groups.values()), error: null }
}
