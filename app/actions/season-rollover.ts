"use server"

// Season rollover — "Start next season".
//
// CCSF reality: the annual traditions ALWAYS run back. Instead of per-event
// inheriting, one leader-gated button copies every RECURRING top-level event
// of the latest season forward a year — an exact copy of last year's work
// (plan, checklist with shifted due dates, roles, run-of-show blocks,
// sub-events) with completion reset and every lead/assignment left empty.
// One-off events stay in their season, browsable via the season filter.
//
// Dates: same-weekday match (ratified 2026-07-18) — each event lands on the
// equivalent weekday next year (3rd Saturday of August stays a 3rd Saturday).
// The whole event shifts by ONE delta (a multiple of 7 days), so sub-events
// and every task due-date keep their weekday alignment automatically.
//
// Pattern (Convention #2/#6/#8): authz guard → createAdminClient() →
// ministry-rescoped writes; actor is always the authz userId.

import { createAdminClient } from "@/lib/supabase-admin"
import { requireMinistryMember, type AuthzContext } from "@/app/actions/authz"
import { isLeaderRole } from "@/lib/roles"
import { lineageKeyOf, seasonLabelOf } from "@/app/home/event-presets"

type AdminClient = ReturnType<typeof createAdminClient>

// Same gate as event planning (mirrors event-templates.ts).
async function canPlanEvents(admin: AdminClient, ctx: AuthzContext): Promise<boolean> {
  if (isLeaderRole(ctx.role)) return true
  const { data: memberships } = await admin
    .from("team_members")
    .select("id, team_roles!role_id(permissions)")
    .eq("user_id", ctx.userId)
  return ((memberships ?? []) as { team_roles: { permissions?: string[] } | null }[]).some(
    (m) => (m.team_roles?.permissions ?? []).includes("can_plan_events"),
  )
}

// ── date helpers ─────────────────────────────────────────────────────────────
function ptYMD(iso: string): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Los_Angeles" }).format(new Date(iso))
}
function ymdToUTC(ymd: string): number {
  const [y, m, d] = ymd.split("-").map(Number)
  return Date.UTC(y, m - 1, d)
}
function addDaysYMD(ymd: string, days: number): string {
  const dt = new Date(ymdToUTC(ymd) + days * 86_400_000)
  return dt.toISOString().slice(0, 10)
}
// Shift an ISO timestamp's DATE part by whole days, preserving the clock time
// and offset exactly as stored (an "exact copy, new date").
function shiftIsoDays(iso: string, days: number): string {
  const datePart = iso.slice(0, 10)
  const rest = iso.slice(10)
  return `${addDaysYMD(datePart, days)}${rest}`
}
// Same-weekday match: the source date's (month, nth-weekday) slot next year;
// a 5th occurrence that doesn't exist next year falls back to the last one.
// Returned as a day DELTA from the source date — always a multiple of 7.
function weekdayMatchDelta(sourceYMD: string): number {
  const [y, m, d] = sourceYMD.split("-").map(Number)
  const src = new Date(Date.UTC(y, m - 1, d))
  const weekday = src.getUTCDay()
  const ordinal = Math.ceil(d / 7)
  // nth `weekday` of month m in year y+1
  const first = new Date(Date.UTC(y + 1, m - 1, 1))
  const firstDow = first.getUTCDay()
  let day = 1 + ((weekday - firstDow + 7) % 7) + (ordinal - 1) * 7
  const daysInMonth = new Date(Date.UTC(y + 1, m, 0)).getUTCDate()
  if (day > daysInMonth) day -= 7 // 5th occurrence missing → last occurrence
  const target = `${y + 1}-${String(m).padStart(2, "0")}-${String(day).padStart(2, "0")}`
  return Math.round((ymdToUTC(target) - ymdToUTC(sourceYMD)) / 86_400_000)
}

type SourceEvent = {
  id: string; title: string; description: string | null; location: string | null
  start_date: string; end_date: string; all_day: boolean; category: string
  event_type: string; team_id: string | null; recurring: boolean
}

// Copy one event (+plan/tasks/roles/blocks) shifted by `delta` days. Returns the new event id.
async function copyEventForward(
  admin: AdminClient,
  ctx: { ministryId: string; userId: string },
  src: SourceEvent,
  delta: number,
  parentId: string | null,
): Promise<string> {
  const { data: newEv, error: evErr } = await admin
    .from("calendar_events")
    .insert({
      ministry_id: ctx.ministryId,
      team_id: src.team_id,
      title: src.title,
      description: src.description,
      location: src.location,
      start_date: shiftIsoDays(src.start_date, delta),
      end_date: shiftIsoDays(src.end_date, delta),
      all_day: src.all_day,
      category: src.category,
      event_type: src.event_type,
      parent_event_id: parentId,
      recurring: parentId === null, // children roll via their parent, never independently
      created_by: ctx.userId,
    })
    .select("id")
    .single()
  if (evErr || !newEv) throw new Error(`${src.title}: ${evErr?.message ?? "copy failed"}`)

  const { data: srcPlan } = await admin
    .from("event_plans")
    .select("id, expected_turnout, budget_allocated, type_data, plan_start_date, crunch_date")
    .eq("calendar_event_id", src.id)
    .maybeSingle()

  if (srcPlan) {
    const { data: newPlan, error: planErr } = await admin
      .from("event_plans")
      .insert({
        ministry_id: ctx.ministryId,
        calendar_event_id: newEv.id,
        created_by: ctx.userId,
        expected_turnout: srcPlan.expected_turnout,
        budget_allocated: srcPlan.budget_allocated,
        type_data: srcPlan.type_data ?? {},
        plan_start_date: srcPlan.plan_start_date ? addDaysYMD(srcPlan.plan_start_date as string, delta) : null,
        crunch_date: srcPlan.crunch_date ? addDaysYMD(srcPlan.crunch_date as string, delta) : null,
      })
      .select("id")
      .single()
    if (planErr || !newPlan) throw new Error(`${src.title} plan: ${planErr?.message ?? "copy failed"}`)

    // Checklist: exact copy, dates shifted, completion reset, assignments empty.
    const { data: tasks } = await admin
      .from("event_tasks")
      .select("id, title, phase, due_date, brief, parent_id, sort_order, pinned, priority")
      .eq("event_plan_id", srcPlan.id)
      .order("sort_order", { ascending: true })
    const idMap = new Map<string, string>()
    for (const t of tasks ?? []) idMap.set(t.id as string, crypto.randomUUID())
    const taskRows = (tasks ?? []).map((t) => ({
      id: idMap.get(t.id as string)!,
      event_plan_id: newPlan.id,
      title: t.title,
      phase: t.phase ?? "pre_event",
      due_date: t.due_date ? addDaysYMD(t.due_date as string, delta) : null,
      brief: t.brief ?? null,
      parent_id: t.parent_id ? (idMap.get(t.parent_id as string) ?? null) : null,
      sort_order: t.sort_order ?? 0,
      pinned: t.pinned ?? false,
      priority: t.priority ?? "none",
      completed: false,
      completed_at: null as string | null,
      assigned_to: null as string | null,
      created_by: ctx.userId,
    }))
    if (taskRows.length) {
      const { error } = await admin.from("event_tasks").insert(taskRows)
      if (error) throw new Error(`${src.title} tasks: ${error.message}`)
    }

    const { data: roles } = await admin
      .from("event_roles")
      .select("role_name, notes")
      .eq("event_plan_id", srcPlan.id)
      .order("created_at", { ascending: true })
    if (roles?.length) {
      const { error } = await admin.from("event_roles").insert(
        roles.map((r) => ({ event_plan_id: newPlan.id, role_name: r.role_name, notes: r.notes ?? null, assigned_to: null, created_by: ctx.userId })),
      )
      if (error) throw new Error(`${src.title} roles: ${error.message}`)
    }

    // Run-of-show blocks are day-relative (day_index + clock time) → copy
    // verbatim with owners cleared and live-mode state reset.
    const { data: blocks } = await admin
      .from("event_blocks")
      .select("day_index, time_label, start_time, duration_min, title, brief, sort_order")
      .eq("event_plan_id", srcPlan.id)
      .order("sort_order", { ascending: true })
    if (blocks?.length) {
      const { error } = await admin.from("event_blocks").insert(
        blocks.map((b) => ({ ...b, ministry_id: ctx.ministryId, event_plan_id: newPlan.id, owner_id: null, created_by: ctx.userId })),
      )
      if (error) throw new Error(`${src.title} blocks: ${error.message}`)
    }
  }

  return newEv.id as string
}

export async function startNextSeasonAction(
  teamId: string,
): Promise<{ created: string[]; skipped: string[]; season: string } | { error: string }> {
  const ctx = await requireMinistryMember()
  if (ctx.error !== null) return { error: ctx.error }
  const admin = createAdminClient()
  if (!(await canPlanEvents(admin, ctx))) return { error: "Not authorized." }

  // Source = the latest season that has recurring top-level events for this team.
  const { data: recEvents } = await admin
    .from("calendar_events")
    .select("id, title, description, location, start_date, end_date, all_day, category, event_type, team_id, recurring")
    .eq("ministry_id", ctx.ministryId)
    .eq("team_id", teamId)
    .eq("recurring", true)
    .is("parent_event_id", null)
    .order("start_date", { ascending: false })
  const all = (recEvents ?? []) as SourceEvent[]
  if (all.length === 0) return { error: "No recurring events to carry forward — mark the annual traditions as recurring first." }

  const latestSeason = seasonLabelOf(ptYMD(all[0].start_date))
  const sources = all.filter((e) => seasonLabelOf(ptYMD(e.start_date)) === latestSeason)

  // Double-press guard: a season can only be rolled forward once it has been
  // (mostly) RUN — if its last recurring event is still ahead, there's nothing
  // to inherit yet. This also makes an accidental second press a no-op instead
  // of minting a season two years out.
  const lastEnd = sources.reduce((max, e) => (e.end_date > max ? e.end_date : max), sources[0].end_date)
  if (ptYMD(lastEnd) > ptYMD(new Date().toISOString())) {
    return { error: `The ${latestSeason} season is still ahead — start the next one after it wraps up.` }
  }

  // Target-season dedupe: an event whose lineage already exists next season is skipped.
  const targetLineages = new Set(
    all
      .filter((e) => seasonLabelOf(ptYMD(e.start_date)) > latestSeason)
      .map((e) => lineageKeyOf(e.title)),
  )

  const skipped: string[] = []
  const toCopy = sources.filter((src) => {
    if (targetLineages.has(lineageKeyOf(src.title))) { skipped.push(src.title); return false }
    return true
  })

  // Each event copies as an independent chain (event → plan → tasks/roles/blocks
  // → sub-events); the chains run concurrently — a season is ~100 inserts and
  // sequential round-trips made the button feel broken.
  const actor = { ministryId: ctx.ministryId, userId: ctx.userId }
  const results = await Promise.all(toCopy.map(async (src) => {
    const delta = weekdayMatchDelta(ptYMD(src.start_date))
    const newId = await copyEventForward(admin, actor, src, delta, null)
    // Sub-events ride the SAME delta so the week's internal structure is preserved.
    const { data: children } = await admin
      .from("calendar_events")
      .select("id, title, description, location, start_date, end_date, all_day, category, event_type, team_id, recurring")
      .eq("ministry_id", ctx.ministryId)
      .eq("parent_event_id", src.id)
      .order("start_date", { ascending: true })
    await Promise.all(((children ?? []) as SourceEvent[]).map((child) => copyEventForward(admin, actor, child, delta, newId)))
    return { title: src.title, season: seasonLabelOf(addDaysYMD(ptYMD(src.start_date), delta)) }
  }))
  const created = results.map((r) => r.title)
  const targetSeason = results[results.length - 1]?.season ?? latestSeason

  if (created.length === 0) {
    return { error: `The ${targetSeason} season has already been started — every recurring event already exists.` }
  }
  return { created, skipped, season: targetSeason }
}