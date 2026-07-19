"use server"

// Run Sheet P2 — playbook compiler.
//
// Two leader-triggered actions:
//   compileEventTemplateAction   — a completed event → a reusable per-team playbook
//                                  (template) carrying T-minus offsets, roles, briefs.
//   instantiateTemplateAction    — a playbook → real event_tasks/event_roles on a new
//                                  event, dates recomputed from the stored offsets.
//
// Pattern (Convention #2/#6/#8): authz guard (session) → createAdminClient() (bypasses
// RLS) → ministry-rescoped writes. Actor/created_by is ALWAYS the authz userId, never a
// caller-supplied id. Role gates go through lib/roles.ts predicates + can_plan_events.
//
// Offset math is anchored to PT (America/Los_Angeles) so a late-evening event never
// lands a task on the wrong calendar day: event_date is the PT calendar date of the
// calendar_event.start_date; completed_at is likewise projected into PT before diffing.
// due_date is already a bare DATE, so it is used as-is.

import { createAdminClient } from "@/lib/supabase-admin"
import { requireMinistryMember, type AuthzContext } from "@/app/actions/authz"
import { isLeaderRole } from "@/lib/roles"
import { lineageKeyOf, seasonLabelOf } from "@/app/home/event-presets"

type AdminClient = ReturnType<typeof createAdminClient>

// ── PT calendar-date helpers (pure) ────────────────────────────────────────
// 'en-CA' formats as YYYY-MM-DD; timeZone projects the instant into PT first.
function ptYMD(iso: string): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Los_Angeles" }).format(new Date(iso))
}
function ymdToUTC(ymd: string): number {
  const [y, m, d] = ymd.split("-").map(Number)
  return Date.UTC(y, m - 1, d)
}
function daysBetween(fromYMD: string, toYMD: string): number {
  return Math.round((ymdToUTC(toYMD) - ymdToUTC(fromYMD)) / 86_400_000)
}
function addDaysYMD(ymd: string, days: number): string {
  const dt = new Date(ymdToUTC(ymd) + days * 86_400_000)
  const y = dt.getUTCFullYear()
  const m = String(dt.getUTCMonth() + 1).padStart(2, "0")
  const d = String(dt.getUTCDate()).padStart(2, "0")
  return `${y}-${m}-${d}`
}
function todayPT(): string {
  return ptYMD(new Date().toISOString())
}

// ── Authz (mirrors event_confirmations authorizePlan) ───────────────────────
// Same ministry AND (admin-tier/leader OR holds can_plan_events on any team role).
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

// ── Curated payload shape (from the compile-review modal) ───────────────────
export type CompileCuratedTask = {
  taskId: string           // source event_tasks.id
  brief: string | null     // leader-edited micro-brief
  useActual: boolean        // adopt actual_offset_days as the stored offset_days (else planned)
}
export type CompileCurated = {
  name?: string
  yearLabel?: string | null
  tasks: CompileCuratedTask[]
  extraNotes?: unknown[]   // unmapped transition_notes → event_templates.extra_notes
}

type SourceTask = {
  id: string
  title: string
  phase: string | null
  due_date: string | null
  completed: boolean | null
  completed_at: string | null
  parent_id: string | null
  sort_order: number | null
}

// Compile a completed event plan into a per-team playbook. Upserts on
// UNIQUE(ministry_id, team_id, event_type) — newest replaces last year's. Returns the
// new template id plus the replaced template's name (so the UI can confirm the swap).
export async function compileEventTemplateAction(
  eventPlanId: string,
  curated: CompileCurated,
): Promise<{ templateId: string; replacedName: string | null } | { error: string }> {
  const ctx = await requireMinistryMember()
  if (ctx.error !== null) return { error: ctx.error }

  const admin = createAdminClient()

  // Load the source plan → its calendar_event (title, event_type, team_id, start_date).
  const { data: plan } = await admin
    .from("event_plans")
    .select("id, ministry_id, calendar_event_id, expected_turnout")
    .eq("id", eventPlanId)
    .maybeSingle()
  if (!plan || plan.ministry_id !== ctx.ministryId) return { error: "Not authorized." }
  if (!(await canPlanEvents(admin, ctx))) return { error: "Not authorized." }

  const { data: ev } = await admin
    .from("calendar_events")
    .select("id, title, event_type, team_id, start_date")
    .eq("id", plan.calendar_event_id)
    .maybeSingle()
  if (!ev) return { error: "Event not found." }

  const eventDate = ptYMD(ev.start_date as string)
  const ministryId = plan.ministry_id as string
  const teamId = (ev.team_id as string | null) ?? null
  const eventType = ev.event_type as string

  // Source tasks + roles.
  const { data: taskData } = await admin
    .from("event_tasks")
    .select("id, title, phase, due_date, completed, completed_at, parent_id, sort_order")
    .eq("event_plan_id", eventPlanId)
    .order("sort_order", { ascending: true })
  const sourceTasks = (taskData ?? []) as SourceTask[]

  const { data: roleData } = await admin
    .from("event_roles")
    .select("id, role_name, notes, created_at")
    .eq("event_plan_id", eventPlanId)
    .order("created_at", { ascending: true })
  const sourceRoles = (roleData ?? []) as { id: string; role_name: string; notes: string | null }[]

  const briefByTask = new Map<string, string | null>()
  const useActualByTask = new Map<string, boolean>()
  for (const c of curated.tasks) {
    briefByTask.set(c.taskId, c.brief && c.brief.trim() ? c.brief.trim() : null)
    useActualByTask.set(c.taskId, c.useActual)
  }

  // Per-task offsets (PT). offset_days = the value instantiate uses (planned by default,
  // or the adopted actual). actual_offset_days is always recorded for display.
  let onTime = 0
  const perTask = sourceTasks.map((t) => {
    const planned = t.due_date ? daysBetween(eventDate, t.due_date) : null
    const actual = t.completed && t.completed_at ? daysBetween(eventDate, ptYMD(t.completed_at)) : null
    if (planned !== null && actual !== null && actual <= planned) onTime++
    const chosen = useActualByTask.get(t.id) && actual !== null ? actual : planned
    return { t, planned, actual, chosen }
  })

  const taskCount = sourceTasks.length
  const stats = {
    actual_turnout: plan.expected_turnout ?? null,
    task_count: taskCount,
    on_time_pct: taskCount > 0 ? Math.round((onTime / taskCount) * 100) : null,
  }

  const templateName = (curated.name && curated.name.trim()) || (ev.title as string)
  const nowIso = new Date().toISOString()

  // Yearbook upsert: one shelf row per (ministry, team, lineage, season). Re-compiling
  // the SAME season swaps that row's children in place (id preserved — keeps
  // event_plans.template_id links intact); a new season adds a new shelf row instead
  // of replacing last year's.
  const lineageKey = lineageKeyOf(templateName)
  const yearLabel = (curated.yearLabel && curated.yearLabel.trim()) || seasonLabelOf(eventDate)
  let existingQuery = admin
    .from("event_templates")
    .select("id, name")
    .eq("ministry_id", ministryId)
    .eq("lineage_key", lineageKey)
    .eq("year_label", yearLabel)
  existingQuery = teamId ? existingQuery.eq("team_id", teamId) : existingQuery.is("team_id", null)
  const { data: existing } = await existingQuery.maybeSingle()

  const replacedName = (existing?.name as string | null) ?? null
  let templateId: string

  const rowValues = {
    ministry_id: ministryId,
    team_id: teamId,
    event_type: eventType,
    lineage_key: lineageKey,
    name: templateName,
    source_event_plan_id: eventPlanId,
    year_label: yearLabel,
    extra_notes: curated.extraNotes ?? [],
    stats,
    created_by: ctx.userId,
    created_at: nowIso,
  }

  if (existing) {
    templateId = existing.id as string
    const { error: updErr } = await admin
      .from("event_templates")
      .update(rowValues)
      .eq("id", templateId)
      .eq("ministry_id", ministryId)
    if (updErr) return { error: updErr.message }
    // Replace children (cascade-safe explicit delete; template id is preserved).
    await admin.from("template_tasks").delete().eq("template_id", templateId)
    await admin.from("template_roles").delete().eq("template_id", templateId)
  } else {
    const { data: inserted, error: insErr } = await admin
      .from("event_templates")
      .insert(rowValues)
      .select("id")
      .single()
    if (insErr || !inserted) return { error: insErr?.message ?? "Failed to create playbook." }
    templateId = inserted.id as string
  }

  // Insert template_tasks with a client-generated id map so 1-level parent links remap
  // deterministically (no reliance on insert ordering).
  const idMap = new Map<string, string>()
  for (const { t } of perTask) idMap.set(t.id, crypto.randomUUID())
  const taskRows = perTask.map(({ t, chosen, actual }) => ({
    id: idMap.get(t.id)!,
    template_id: templateId,
    title: t.title,
    phase: t.phase ?? "pre_event",
    offset_days: chosen,
    actual_offset_days: actual,
    brief: briefByTask.get(t.id) ?? null,
    role_hint: null as string | null,
    parent_id: t.parent_id ? (idMap.get(t.parent_id) ?? null) : null,
    sort_order: t.sort_order ?? 0,
  }))
  if (taskRows.length > 0) {
    const { error: tErr } = await admin.from("template_tasks").insert(taskRows)
    if (tErr) return { error: tErr.message }
  }

  const roleRows = sourceRoles.map((r, i) => ({
    template_id: templateId,
    role_name: r.role_name,
    notes: r.notes ?? null,
    sort_order: i,
  }))
  if (roleRows.length > 0) {
    const { error: rErr } = await admin.from("template_roles").insert(roleRows)
    if (rErr) return { error: rErr.message }
  }

  return { templateId, replacedName }
}

// Instantiate a playbook onto a calendar event: create/attach the event_plan and seed
// real event_tasks + event_roles with dates recomputed from the stored offsets (clamped
// to today when the computed date is already past). assigned_to is left NULL — so the
// Phase-1 assignment push triggers stay silent.
export async function instantiateTemplateAction(
  templateId: string,
  calendarEventId: string,
): Promise<{ tasks: number; roles: number } | { error: string }> {
  const ctx = await requireMinistryMember()
  if (ctx.error !== null) return { error: ctx.error }

  const admin = createAdminClient()

  const { data: template } = await admin
    .from("event_templates")
    .select("id, ministry_id")
    .eq("id", templateId)
    .maybeSingle()
  if (!template || template.ministry_id !== ctx.ministryId) return { error: "Not authorized." }
  if (!(await canPlanEvents(admin, ctx))) return { error: "Not authorized." }
  const ministryId = template.ministry_id as string

  const { data: ev } = await admin
    .from("calendar_events")
    .select("id, ministry_id, start_date")
    .eq("id", calendarEventId)
    .maybeSingle()
  if (!ev || ev.ministry_id !== ministryId) return { error: "Event not found." }
  const eventDate = ptYMD(ev.start_date as string)
  const today = todayPT()

  // Ensure the event_plan (AddEventModal usually created it) and stamp provenance.
  let { data: plan } = await admin
    .from("event_plans")
    .select("id")
    .eq("calendar_event_id", calendarEventId)
    .maybeSingle()
  if (!plan) {
    const { data: newPlan, error: planErr } = await admin
      .from("event_plans")
      .insert({ ministry_id: ministryId, calendar_event_id: calendarEventId, created_by: ctx.userId, template_id: templateId })
      .select("id")
      .single()
    if (planErr || !newPlan) return { error: planErr?.message ?? "Failed to create plan." }
    plan = newPlan
  } else {
    await admin.from("event_plans").update({ template_id: templateId }).eq("id", plan.id).eq("ministry_id", ministryId)
  }
  const planId = plan.id as string

  // Template children.
  const { data: ttData } = await admin
    .from("template_tasks")
    .select("id, title, phase, offset_days, brief, parent_id, sort_order")
    .eq("template_id", templateId)
    .order("sort_order", { ascending: true })
  const tTasks = (ttData ?? []) as {
    id: string; title: string; phase: string; offset_days: number | null
    brief: string | null; parent_id: string | null; sort_order: number | null
  }[]

  const { data: trData } = await admin
    .from("template_roles")
    .select("role_name, notes, sort_order")
    .eq("template_id", templateId)
    .order("sort_order", { ascending: true })
  const tRoles = (trData ?? []) as { role_name: string; notes: string | null }[]

  // event_tasks with recomputed, past-clamped due_dates + remapped parents.
  const idMap = new Map<string, string>()
  for (const t of tTasks) idMap.set(t.id, crypto.randomUUID())
  const taskRows = tTasks.map((t) => {
    let due: string | null = null
    if (t.offset_days !== null) {
      const computed = addDaysYMD(eventDate, t.offset_days)
      due = ymdToUTC(computed) < ymdToUTC(today) ? today : computed
    }
    return {
      id: idMap.get(t.id)!,
      event_plan_id: planId,
      title: t.title,
      phase: t.phase ?? "pre_event",
      due_date: due,
      brief: t.brief ?? null,
      parent_id: t.parent_id ? (idMap.get(t.parent_id) ?? null) : null,
      sort_order: t.sort_order ?? 0,
      completed: false,
      assigned_to: null as string | null,
      created_by: ctx.userId,
    }
  })
  if (taskRows.length > 0) {
    const { error: tErr } = await admin.from("event_tasks").insert(taskRows)
    if (tErr) return { error: tErr.message }
  }

  const roleRows = tRoles.map((r) => ({
    event_plan_id: planId,
    role_name: r.role_name,
    notes: r.notes ?? null,
    assigned_to: null as string | null,
    created_by: ctx.userId,
  }))
  if (roleRows.length > 0) {
    const { error: rErr } = await admin.from("event_roles").insert(roleRows)
    if (rErr) return { error: rErr.message }
  }

  return { tasks: taskRows.length, roles: roleRows.length }
}
