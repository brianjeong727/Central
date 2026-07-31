"use client"

// ── Event CONTAINER surfaces ──────────────────────────────────────────────────
//
// A "container" is an event whose content is really its sub-events — Welcome Week
// holding seven nights. Before this module every event, container or leaf, got the
// identical four core tabs, so Welcome Week owned a Run of Show and so did Popsicle
// Social *inside* it, and there was no defensible answer to "where do I assign the
// lead for one night?".
//
// The model: anything with a clock or a person standing somewhere belongs to the
// NIGHT. What belongs to the WEEK is thin — its own week-spanning tasks and roles,
// plus VIEWS onto what the nights are doing. So the week stops competing with the
// nights and becomes the place you see and steer them from:
//
//   runsheet  → read-only merged week timeline (every night's blocks, chronological)
//   roles     → the week's own roles + an EDITABLE staffing table across all nights
//   checklist → the week's own tasks + a read-only roll-up of the nights' open tasks
//
// Every write here is the SAME statement the night's own screen issues, through the
// same browser client — so this opens no new authorization surface: whatever RLS
// permits there it permits here, and nothing more.
//
// Split out of plan-tab.tsx (~15k lines) following the countdown-tab.tsx precedent.
// Desktop follows web_design_system.md; the isMobile branches follow
// mobile_design_system.md (Pocket grammar) — never the desktop card.

import { useCallback, useEffect, useMemo, useState } from "react"
import { ChevronRight, Plus } from "lucide-react"
import { createClient } from "@/lib/supabase"
import { MONO_STYLE } from "@/components/central/typography"
import { PocketKicker, PocketRow, PocketRowCard } from "@/components/central"
import { eventDayHeaderLabel } from "../utils"
import type { CalendarEvent, EventBlock, EventPlan, EventRole, EventTask } from "../types"

// ── Types ──────────────────────────────────────────────────────────────────────

/** One sub-event with everything the container's three surfaces need. */
export interface ContainerChild {
  event: CalendarEvent
  /** null until the night's workspace has been opened once (plans are lazily created). */
  plan: EventPlan | null
  roles: EventRole[]
  tasks: EventTask[]
  blocks: EventBlock[]
  done: number
  total: number
}

export interface ContainerRollup {
  children: ContainerChild[]
  loading: boolean
  /** Re-run the batched fetch (after a write that changed a child's rows). */
  refresh: () => void
}

// ── Loader ─────────────────────────────────────────────────────────────────────
// FIVE batched queries, never N+1: children → their plans → roles/tasks/blocks by
// plan id. event_roles / event_tasks / event_blocks carry no ministry_id of their
// own (they're scoped transitively through event_plans), so the ministry scope is
// applied on the two tables that do have it.

export function useContainerRollup(parentEventId: string | null, ministryId: string): ContainerRollup {
  const supabase = createClient()
  const [children, setChildren] = useState<ContainerChild[]>([])
  const [loading, setLoading] = useState(true)
  const [tick, setTick] = useState(0)
  const refresh = useCallback(() => setTick((t) => t + 1), [])

  useEffect(() => {
    let cancelled = false
    async function load() {
      if (!parentEventId) { setChildren([]); setLoading(false); return }
      setLoading(true)

      const { data: kids } = await supabase
        .from("calendar_events")
        .select("id, title, description, location, start_date, end_date, all_day, category, event_type, parent_event_id, linked_announcement_id, status, created_by, recurring")
        .eq("parent_event_id", parentEventId)
        .eq("ministry_id", ministryId)
        .order("start_date", { ascending: true })
      const events = (kids ?? []) as CalendarEvent[]
      if (events.length === 0) {
        if (!cancelled) { setChildren([]); setLoading(false) }
        return
      }

      const childIds = events.map((e) => e.id)
      const { data: planRows } = await supabase
        .from("event_plans").select("*")
        .in("calendar_event_id", childIds)
        .eq("ministry_id", ministryId)
      const plans = (planRows ?? []) as EventPlan[]
      const planIds = plans.map((p) => p.id)
      const planByChild = new Map(plans.map((p) => [p.calendar_event_id, p]))

      const [rolesRes, tasksRes, blocksRes] = planIds.length
        ? await Promise.all([
            supabase.from("event_roles")
              .select("*, profiles!event_roles_assigned_to_fkey(name)")
              .in("event_plan_id", planIds),
            supabase.from("event_tasks")
              .select("*, profiles!event_tasks_assigned_to_fkey(name)")
              .in("event_plan_id", planIds),
            // The owner name is joined here rather than resolved against the team
            // roster: a night's block can be owned by someone outside the planning
            // team, and the merged timeline must still name them.
            supabase.from("event_blocks")
              .select("*, profiles!event_blocks_owner_id_fkey(name)")
              .in("event_plan_id", planIds)
              .order("day_index", { ascending: true })
              .order("sort_order", { ascending: true }),
          ])
        : [{ data: [] }, { data: [] }, { data: [] }]

      const rolesByPlan = new Map<string, EventRole[]>()
      for (const raw of (rolesRes.data ?? []) as Record<string, unknown>[]) {
        const r: EventRole = {
          id: raw.id as string,
          event_plan_id: raw.event_plan_id as string,
          role_name: raw.role_name as string,
          assigned_to: (raw.assigned_to as string | null) ?? null,
          assigned_name: (raw.profiles as { name?: string } | null)?.name,
          notes: (raw.notes as string | null) ?? null,
        }
        const arr = rolesByPlan.get(r.event_plan_id) ?? []
        arr.push(r); rolesByPlan.set(r.event_plan_id, arr)
      }

      const tasksByPlan = new Map<string, EventTask[]>()
      for (const raw of (tasksRes.data ?? []) as Record<string, unknown>[]) {
        const t: EventTask = {
          id: raw.id as string,
          event_plan_id: raw.event_plan_id as string,
          title: raw.title as string,
          assigned_to: (raw.assigned_to as string | null) ?? null,
          assigned_name: (raw.profiles as { name?: string } | null)?.name,
          due_date: (raw.due_date as string | null) ?? null,
          completed: !!raw.completed,
          phase: ((raw.phase as string) ?? "pre_event") as EventTask["phase"],
          sort_order: (raw.sort_order as number) ?? 0,
          parent_id: (raw.parent_id as string | null) ?? null,
          pinned: !!raw.pinned,
          priority: ((raw.priority as string) ?? "none") as EventTask["priority"],
          brief: (raw.brief as string | null) ?? null,
        }
        const arr = tasksByPlan.get(t.event_plan_id) ?? []
        arr.push(t); tasksByPlan.set(t.event_plan_id, arr)
      }

      const blocksByPlan = new Map<string, EventBlock[]>()
      for (const raw of (blocksRes.data ?? []) as Record<string, unknown>[]) {
        const b = { ...raw, owner_name: (raw.profiles as { name?: string } | null)?.name } as unknown as EventBlock
        const arr = blocksByPlan.get(b.event_plan_id) ?? []
        arr.push(b); blocksByPlan.set(b.event_plan_id, arr)
      }

      const assembled: ContainerChild[] = events.map((event) => {
        const plan = planByChild.get(event.id) ?? null
        const tasks = plan ? (tasksByPlan.get(plan.id) ?? []) : []
        return {
          event,
          plan,
          roles: plan ? (rolesByPlan.get(plan.id) ?? []) : [],
          tasks,
          blocks: plan ? (blocksByPlan.get(plan.id) ?? []) : [],
          done: tasks.filter((t) => t.completed).length,
          total: tasks.length,
        }
      })
      if (!cancelled) { setChildren(assembled); setLoading(false) }
    }
    load()
    return () => { cancelled = true }
  // supabase client is a stable singleton
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [parentEventId, ministryId, tick])

  return { children, loading, refresh }
}

// ── Shared bits ────────────────────────────────────────────────────────────────

/** Night heading: title + its date. Same date grammar as Sub-events / Run of Show. */
function nightLabel(ev: CalendarEvent): string {
  return eventDayHeaderLabel(new Date(ev.start_date))
}

export function SectionKicker({ label, hint, isMobile }: { label: string; hint?: string; isMobile: boolean }) {
  return (
    <div style={{ marginTop: 30, marginBottom: hint ? 6 : 12 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <span style={isMobile
          ? { ...MONO_STYLE, margin: 0 }
          : { fontFamily: "var(--mono)", fontSize: 11, letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--muted-text)", whiteSpace: "nowrap" }}>
          {label}
        </span>
        {!isMobile && <span style={{ flex: 1, height: 1, background: "var(--line)" }} />}
      </div>
      {hint && (
        <p style={{ fontSize: 12.5, color: "var(--muted-text)", lineHeight: 1.5, margin: "6px 0 12px" }}>{hint}</p>
      )}
    </div>
  )
}

function EmptyLine({ children }: { children: React.ReactNode }) {
  return (
    <p style={{ fontFamily: "var(--font-instrument-serif)", fontStyle: "italic", fontSize: 14, color: "var(--faint)", padding: "10px 2px", margin: 0 }}>
      {children}
    </p>
  )
}

// ── 1. Merged week timeline (read-only) ────────────────────────────────────────
// Every night's blocks stitched into one chronological run. A block's absolute
// moment is its OWN night's start_date + day_index days, at start_time — day_index
// is relative to the child, never to the week, so this cannot be a flat sort on
// day_index. Grouped by calendar date via the shared eventDayHeaderLabel so it
// reads identically to the leaf Run of Show and to Sub-events.

interface TimelineEntry {
  block: EventBlock
  child: ContainerChild
  ymd: string
  sortKey: string
}

export function buildWeekTimeline(children: ContainerChild[]): { ymd: string; entries: TimelineEntry[] }[] {
  const entries: TimelineEntry[] = []
  for (const child of children) {
    const start = new Date(child.event.start_date)
    for (const block of child.blocks) {
      const d = new Date(start.getFullYear(), start.getMonth(), start.getDate() + block.day_index)
      const ymd = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`
      // Blocks with no parsed time sort last within their day, in their own order.
      entries.push({ block, child, ymd, sortKey: `${ymd} ${block.start_time ?? "99:99"} ${String(block.sort_order).padStart(4, "0")}` })
    }
  }
  entries.sort((a, b) => a.sortKey.localeCompare(b.sortKey))
  const byDay: { ymd: string; entries: TimelineEntry[] }[] = []
  for (const e of entries) {
    const last = byDay[byDay.length - 1]
    if (last && last.ymd === e.ymd) last.entries.push(e)
    else byDay.push({ ymd: e.ymd, entries: [e] })
  }
  return byDay
}

export function ContainerWeekTimeline({
  nights, isMobile, onOpenChild, ownBlocks, eventTitle,
}: {
  nights: ContainerChild[]
  isMobile: boolean
  onOpenChild?: (ev: CalendarEvent) => void
  /** Blocks written on the WEEK itself before timing moved to the nights. Never hidden. */
  ownBlocks: EventBlock[]
  eventTitle: string
}) {
  const days = useMemo(() => buildWeekTimeline(nights), [nights])

  return (
    <div>
      <p style={{ fontSize: 12.5, color: "var(--muted-text)", lineHeight: 1.5, margin: "0 0 20px" }}>
        The whole week, night by night. Timing is owned by each night — open one to edit its run of show.
      </p>

      {ownBlocks.length > 0 && (
        <>
          <SectionKicker
            label="On the week itself"
            hint={`${ownBlocks.length === 1 ? "This block was" : `These ${ownBlocks.length} blocks were`} written on ${eventTitle} rather than on a night. Move ${ownBlocks.length === 1 ? "it" : "them"} onto the night ${ownBlocks.length === 1 ? "it belongs" : "they belong"} to when you get a chance.`}
            isMobile={isMobile}
          />
          <div style={{ marginBottom: 34 }}>
            {/* Same column grid as the night rows below, so the two read as one list. */}
            {ownBlocks.map((b, i) => (
              <div
                key={b.id}
                style={{
                  display: "grid",
                  gridTemplateColumns: isMobile ? "68px 1fr" : "84px 1fr 150px auto",
                  gap: 12,
                  alignItems: "center",
                  padding: "12px 2px",
                  borderBottom: i === ownBlocks.length - 1 ? "none" : "1px solid var(--line-3)",
                }}
              >
                <span style={{ fontFamily: "var(--mono)", fontSize: isMobile ? 11 : 13, color: "var(--muted-text)", whiteSpace: "nowrap" }}>{b.time_label || "—"}</span>
                <span style={{ minWidth: 0 }}>
                  <span style={{ display: "block", fontSize: isMobile ? 15 : 14, fontWeight: isMobile ? 600 : 400, color: "var(--ink)" }}>
                    {b.title || <span style={{ color: "var(--faint)", fontStyle: "italic" }}>Untitled block</span>}
                  </span>
                  {isMobile && b.owner_name && (
                    <span style={{ display: "block", fontSize: 12.5, color: "var(--muted-text)", marginTop: 2 }}>{b.owner_name}</span>
                  )}
                </span>
                {!isMobile && <span style={{ fontSize: 12, color: "var(--body)" }}>{b.owner_name ?? "—"}</span>}
                {!isMobile && <span />}
              </div>
            ))}
          </div>
        </>
      )}

      {days.length === 0 && ownBlocks.length === 0 && (
        <EmptyLine>No run of show yet. Open a night and add its blocks — they&rsquo;ll appear here.</EmptyLine>
      )}

      {days.map(({ ymd, entries }) => (
        <div key={ymd} style={{ marginBottom: 30 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 10 }}>
            <span style={isMobile
              ? { ...MONO_STYLE, margin: 0 }
              : { fontFamily: "var(--mono)", fontSize: 11, letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--body)", fontWeight: 500, whiteSpace: "nowrap" }}>
              {eventDayHeaderLabel(new Date(`${ymd}T00:00:00`))}
            </span>
            {!isMobile && <span style={{ flex: 1, height: 1, background: "var(--line)" }} />}
          </div>

          {entries.map(({ block, child }, i) => {
            const drill = onOpenChild ? () => onOpenChild(child.event) : undefined
            const owner = block.owner_name
            return (
              <div
                key={block.id}
                onClick={drill}
                role={drill ? "button" : undefined}
                tabIndex={drill ? 0 : undefined}
                onKeyDown={drill ? (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); drill() } } : undefined}
                style={{
                  display: "grid",
                  gridTemplateColumns: isMobile ? "68px 1fr" : "84px 1fr 150px auto",
                  gap: 12,
                  alignItems: "center",
                  padding: "12px 2px",
                  borderBottom: i === entries.length - 1 ? "none" : "1px solid var(--line-3)",
                  cursor: drill ? "pointer" : "default",
                }}
              >
                <span style={{ fontFamily: "var(--mono)", fontSize: isMobile ? 11 : 13, color: "var(--plum)", whiteSpace: "nowrap" }}>
                  {block.time_label || "—"}
                </span>
                <span style={{ minWidth: 0 }}>
                  <span style={{ display: "block", fontSize: isMobile ? 15 : 14, fontWeight: isMobile ? 600 : 400, color: "var(--ink)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {block.title || <span style={{ color: "var(--faint)", fontStyle: "italic" }}>Untitled block</span>}
                  </span>
                  <span style={{ display: "block", fontSize: 12.5, color: "var(--muted-text)", marginTop: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {child.event.title}{isMobile && owner ? ` · ${owner}` : ""}
                  </span>
                </span>
                {!isMobile && <span style={{ fontSize: 12, color: "var(--body)" }}>{owner ?? "—"}</span>}
                {!isMobile && (drill ? <ChevronRight style={{ width: 15, height: 15, color: "var(--faint)" }} /> : <span />)}
              </div>
            )
          })}
        </div>
      ))}
    </div>
  )
}

// ── 2. Across-the-nights staffing table (editable) ─────────────────────────────
// Grouped by night; each night's roles editable inline. event_roles is a free-form
// list, so a night can carry 0–5 roles rather than exactly one "lead" — grouping by
// night renders the common single-role case as one clean line while staying honest
// when a night has three. The assignee write is byte-identical to the leaf's
// (plan-tab handleAssignRole), so no new authorization surface.

export function ContainerStaffing({
  nights, members, canEdit, isMobile, ministryId, userId, onOpenChild, onChanged,
}: {
  nights: ContainerChild[]
  members: { id: string; name: string }[]
  canEdit: boolean
  isMobile: boolean
  ministryId: string
  userId: string
  onOpenChild?: (ev: CalendarEvent) => void
  onChanged: () => void
}) {
  const supabase = createClient()
  const [busyId, setBusyId] = useState<string | null>(null)
  const [addingFor, setAddingFor] = useState<string | null>(null)
  const [newName, setNewName] = useState("")

  async function assign(role: EventRole, assignee: string) {
    setBusyId(role.id)
    await supabase.from("event_roles").update({ assigned_to: assignee || null }).eq("id", role.id)
    setBusyId(null)
    onChanged()
  }

  // A night whose workspace has never been opened has no plan yet (they're created
  // lazily on first open, plan-tab.tsx). Adding a role from the week creates the
  // plan first — the same lazy-create, just reached from here.
  async function addRole(child: ContainerChild, name: string) {
    const title = name.trim()
    if (!title) return
    setBusyId(child.event.id)
    let planId = child.plan?.id
    if (!planId) {
      const { data } = await supabase
        .from("event_plans")
        .insert({ ministry_id: ministryId, calendar_event_id: child.event.id, created_by: userId })
        .select("id").single()
      planId = (data as { id: string } | null)?.id
    }
    if (planId) {
      await supabase.from("event_roles").insert({ event_plan_id: planId, role_name: title, created_by: userId })
    }
    setBusyId(null)
    setAddingFor(null)
    setNewName("")
    onChanged()
  }

  if (nights.length === 0) {
    return <EmptyLine>No nights yet. Add sub-events and their leads will be staffed from here.</EmptyLine>
  }

  const selectStyle: React.CSSProperties = {
    padding: isMobile ? "10px 8px" : "5px 8px",
    minHeight: isMobile ? 44 : undefined,
    borderRadius: 8,
    border: "1px solid var(--line-2)",
    background: "var(--cream)",
    color: "var(--body)",
    fontSize: 12.5,
    cursor: "pointer",
    maxWidth: isMobile ? 150 : 190,
  }

  return (
    <div>
      {nights.map((child) => (
        <div key={child.event.id} style={{ marginBottom: 22 }}>
          <div style={{ display: "flex", alignItems: "baseline", gap: 10, marginBottom: 6 }}>
            <button
              onClick={onOpenChild ? () => onOpenChild(child.event) : undefined}
              style={{ background: "none", border: "none", padding: 0, fontSize: 14, fontWeight: 500, color: "var(--ink)", cursor: onOpenChild ? "pointer" : "default", textAlign: "left" }}
            >
              {child.event.title}
            </button>
            <span style={{ fontFamily: "var(--mono)", fontSize: 10.5, letterSpacing: "0.08em", color: "var(--muted-text)", whiteSpace: "nowrap" }}>
              {nightLabel(child.event)}
            </span>
          </div>

          {child.roles.length === 0 && addingFor !== child.event.id && (
            <p style={{ fontSize: 13, color: "var(--faint)", fontStyle: "italic", margin: "0 0 6px" }}>No roles on this night yet.</p>
          )}

          {child.roles.map((role) => (
            <div key={role.id} style={{ display: "flex", alignItems: "center", gap: 12, padding: "9px 0", borderBottom: "1px solid var(--line-3)" }}>
              <span style={{ flex: 1, minWidth: 0, fontSize: 13.5, color: "var(--body)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {role.role_name}
              </span>
              {canEdit ? (
                <select
                  value={role.assigned_to ?? ""}
                  disabled={busyId === role.id}
                  onChange={(e) => assign(role, e.target.value)}
                  style={selectStyle}
                >
                  <option value="">Unassigned</option>
                  {members.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
                </select>
              ) : (
                <span style={{ fontSize: 13, color: role.assigned_name ? "var(--ink)" : "var(--faint)", whiteSpace: "nowrap" }}>
                  {role.assigned_name ?? "Unassigned"}
                </span>
              )}
            </div>
          ))}

          {canEdit && (addingFor === child.event.id ? (
            <div style={{ display: "flex", alignItems: "center", gap: 8, paddingTop: 9 }}>
              <input
                autoFocus
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") addRole(child, newName); if (e.key === "Escape") { setAddingFor(null); setNewName("") } }}
                placeholder="Role name…"
                style={{ flex: 1, background: "var(--cream)", border: "1px solid var(--line-2)", borderRadius: 8, outline: "none", fontSize: 13, color: "var(--body)", padding: isMobile ? "11px 10px" : "6px 10px", minHeight: isMobile ? 44 : undefined }}
              />
              <button onClick={() => addRole(child, newName)} disabled={busyId === child.event.id}
                style={{ background: "none", border: "none", color: "var(--plum)", fontSize: 13, fontWeight: 500, cursor: "pointer", padding: "6px 4px" }}>Add</button>
              <button onClick={() => { setAddingFor(null); setNewName("") }}
                style={{ background: "none", border: "none", color: "var(--muted-text)", fontSize: 13, cursor: "pointer", padding: "6px 4px" }}>Cancel</button>
            </div>
          ) : (
            <button
              onClick={() => { setAddingFor(child.event.id); setNewName("") }}
              style={{ display: "inline-flex", alignItems: "center", gap: 5, background: "none", border: "none", padding: "9px 0 0", color: "var(--muted-text)", fontSize: 12.5, cursor: "pointer", minHeight: isMobile ? 44 : undefined }}
            >
              <Plus style={{ width: 13, height: 13 }} /> Add a role
            </button>
          ))}
        </div>
      ))}
    </div>
  )
}

// ── 3. Across-the-nights task roll-up (read-only) ──────────────────────────────
// The week lead's answer to "are the nights on track" without eight drill-ins.
// Open items only; completed collapse to a count so the section stays scannable.

export function ContainerTaskRollup({
  nights, isMobile, onOpenChild,
}: {
  nights: ContainerChild[]
  isMobile: boolean
  onOpenChild?: (ev: CalendarEvent) => void
}) {
  const withTasks = nights.filter((c) => c.total > 0)
  if (withTasks.length === 0) {
    return <EmptyLine>The nights don&rsquo;t have checklists yet.</EmptyLine>
  }

  if (isMobile) {
    return (
      <div>
        {withTasks.map((child) => {
          const open = child.tasks.filter((t) => !t.completed)
          return (
            <div key={child.event.id} style={{ marginBottom: 18 }}>
              <PocketKicker
                label={child.event.title}
                action={<span style={{ fontFamily: "var(--mono)", fontSize: 11, color: "var(--muted-text)" }}>{child.done}/{child.total}</span>}
              />
              <PocketRowCard>
                {open.length === 0 ? (
                  <div style={{ padding: "13px 0", fontSize: 13, color: "var(--muted-text)" }}>All {child.total} done.</div>
                ) : open.map((t, i) => (
                  <PocketRow
                    key={t.id}
                    title={t.title}
                    sub={[t.assigned_name, t.due_date ? new Date(`${t.due_date}T00:00:00`).toLocaleDateString("en-US", { month: "short", day: "numeric" }) : null].filter(Boolean).join(" · ") || undefined}
                    isLast={i === open.length - 1}
                    chevron
                    onClick={() => onOpenChild?.(child.event)}
                  />
                ))}
              </PocketRowCard>
            </div>
          )
        })}
      </div>
    )
  }

  return (
    <div>
      {withTasks.map((child) => {
        const open = child.tasks.filter((t) => !t.completed)
        return (
          <div key={child.event.id} style={{ marginBottom: 22 }}>
            <div style={{ display: "flex", alignItems: "baseline", gap: 10, marginBottom: 6 }}>
              <button
                onClick={onOpenChild ? () => onOpenChild(child.event) : undefined}
                style={{ background: "none", border: "none", padding: 0, fontSize: 14, fontWeight: 500, color: "var(--ink)", cursor: onOpenChild ? "pointer" : "default" }}
              >
                {child.event.title}
              </button>
              <span style={{ fontFamily: "var(--mono)", fontSize: 10.5, letterSpacing: "0.08em", color: "var(--muted-text)", whiteSpace: "nowrap" }}>
                {nightLabel(child.event)}
              </span>
              <span style={{ flex: 1, height: 1, background: "var(--line-3)" }} />
              <span style={{ fontFamily: "var(--mono)", fontSize: 11, color: "var(--muted-text)", whiteSpace: "nowrap" }}>{child.done} of {child.total} done</span>
            </div>
            {open.length === 0 ? (
              <p style={{ fontSize: 13, color: "var(--muted-text)", margin: "4px 0 0" }}>All {child.total} done.</p>
            ) : open.map((t) => (
              <div key={t.id} style={{ display: "flex", alignItems: "baseline", gap: 12, padding: "8px 0", borderBottom: "1px solid var(--line-3)" }}>
                <span style={{ flex: 1, minWidth: 0, fontSize: 13.5, color: "var(--body)" }}>{t.title}</span>
                {t.assigned_name && <span style={{ fontSize: 12, color: "var(--muted-text)", whiteSpace: "nowrap" }}>{t.assigned_name}</span>}
                {t.due_date && (
                  <span style={{ fontFamily: "var(--mono)", fontSize: 11, color: "var(--muted-text)", whiteSpace: "nowrap" }}>
                    {new Date(`${t.due_date}T00:00:00`).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                  </span>
                )}
              </div>
            ))}
          </div>
        )
      })}
    </div>
  )
}
