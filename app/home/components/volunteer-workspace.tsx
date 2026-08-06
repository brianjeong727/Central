"use client"

// ── Volunteer workspace ───────────────────────────────────────────────────────
// The Workspace tab for someone who is on NO planning team — the large majority
// of a congregation. Before this, the tab simply did not render for them, so a
// volunteer staffed on an event had no way to see the event at all: their only
// trace of it was the task rows in Home's My Deadlines, stripped of the event
// they belonged to.
//
// This is a READ surface with one write: ticking your own task (the same
// assignee-gated `completeTaskAction` My Deadlines already uses). Everything else
// — the run of show, who else is staffed — is presentational.
//
// SCOPE NOTE: this is a VISIBILITY feature, not a permissions boundary. SELECT on
// calendar_events / event_plans / event_roles / event_tasks is already
// ministry-wide, so nothing here widens what a member could read; it decides what
// they are SHOWN. Writes stay where they were (task completion is assignee-or-
// leader inside the action, confirmations are own-row).
//
// "Staffed on" deliberately means a role assignment OR an assigned task. A task
// is as real a commitment as a role, and a volunteer handed only tasks would
// otherwise see the empty state while holding work.

import { useState } from "react"
import useSWR from "swr"
import { ClipboardList, Users } from "lucide-react"
import { createClient } from "@/lib/supabase"
import { completeTaskAction } from "@/app/actions/event-confirmations"
import {
  SubpageShell, PocketKicker, PocketRow, PocketRowCard, PocketFactsGrid,
  POCKET_KICKER_STYLE, MonogramChip,
} from "@/components/central"
import { EmptyState } from "./shared"
import { useMinistryTimezone } from "../ministry-timezone-context"
import { instantToZoned, formatInZone } from "@/lib/tz"
import { getInitials } from "../utils"
import type { Crumb } from "../types"

// ── Types ─────────────────────────────────────────────────────────────────────

interface StaffedEvent {
  eventId: string
  planId: string
  title: string
  startISO: string
  allDay: boolean
  startDay: string | null
  location: string | null
  /** Role names this person holds on the event (empty when they only hold tasks). */
  myRoles: { name: string; notes: string | null }[]
  myOpenCount: number
}

interface EventDetail {
  myTasks: { id: string; title: string; due_date: string | null; completed: boolean }[]
  blocks: { id: string; title: string; time_label: string | null; day_index: number; owner_name: string | null }[]
  staffed: { name: string; role: string }[]
}

// ── Data ──────────────────────────────────────────────────────────────────────

/**
 * Every event this person is staffed on. Batched, never N+1: roles+tasks for the
 * user → their plans → the plans' events. Three round trips regardless of count.
 */
async function loadStaffedEvents([, ministryId, userId]: readonly [string, string, string]): Promise<StaffedEvent[]> {
  const supabase = createClient()
  const [rolesRes, tasksRes] = await Promise.all([
    supabase.from("event_roles").select("event_plan_id, role_name, notes").eq("assigned_to", userId),
    supabase.from("event_tasks").select("event_plan_id, completed").eq("assigned_to", userId),
  ])
  const roles = (rolesRes.data ?? []) as { event_plan_id: string; role_name: string; notes: string | null }[]
  const tasks = (tasksRes.data ?? []) as { event_plan_id: string; completed: boolean }[]

  const planIds = [...new Set([...roles.map(r => r.event_plan_id), ...tasks.map(t => t.event_plan_id)])]
  if (planIds.length === 0) return []

  const { data: planRows } = await supabase
    .from("event_plans")
    .select("id, calendar_event_id")
    .in("id", planIds)
    .eq("ministry_id", ministryId)
  const plans = (planRows ?? []) as { id: string; calendar_event_id: string }[]
  if (plans.length === 0) return []

  const { data: evRows } = await supabase
    .from("calendar_events")
    .select("id, title, start_date, all_day, start_day, location")
    .in("id", plans.map(p => p.calendar_event_id))
    .eq("ministry_id", ministryId)
    .order("start_date", { ascending: true })
  const events = new Map(
    ((evRows ?? []) as { id: string; title: string; start_date: string; all_day: boolean; start_day: string | null; location: string | null }[])
      .map(e => [e.id, e]),
  )

  return plans
    .map((p): StaffedEvent | null => {
      const ev = events.get(p.calendar_event_id)
      if (!ev) return null
      const mine = tasks.filter(t => t.event_plan_id === p.id)
      return {
        eventId: ev.id,
        planId: p.id,
        title: ev.title,
        startISO: ev.start_date,
        allDay: !!ev.all_day,
        startDay: ev.start_day,
        location: ev.location,
        myRoles: roles.filter(r => r.event_plan_id === p.id).map(r => ({ name: r.role_name, notes: r.notes })),
        myOpenCount: mine.filter(t => !t.completed).length,
      }
    })
    .filter((e): e is StaffedEvent => e !== null)
    .sort((a, b) => a.startISO.localeCompare(b.startISO))
}

async function loadEventDetail([, planId, userId]: readonly [string, string, string]): Promise<EventDetail> {
  const supabase = createClient()
  const [tasksRes, blocksRes, rolesRes] = await Promise.all([
    supabase.from("event_tasks")
      .select("id, title, due_date, completed")
      .eq("event_plan_id", planId).eq("assigned_to", userId)
      .order("due_date", { ascending: true, nullsFirst: false }),
    supabase.from("event_blocks")
      .select("id, title, time_label, day_index, profiles!event_blocks_owner_id_fkey(name)")
      .eq("event_plan_id", planId)
      .order("day_index", { ascending: true })
      .order("sort_order", { ascending: true }),
    supabase.from("event_roles")
      .select("role_name, profiles!event_roles_assigned_to_fkey(name)")
      .eq("event_plan_id", planId)
      .not("assigned_to", "is", null),
  ])
  const one = (v: unknown): string | null => {
    const p = Array.isArray(v) ? v[0] : v
    return (p as { name?: string } | null)?.name ?? null
  }
  return {
    myTasks: (tasksRes.data ?? []) as EventDetail["myTasks"],
    blocks: ((blocksRes.data ?? []) as Record<string, unknown>[]).map(b => ({
      id: b.id as string,
      title: b.title as string,
      time_label: (b.time_label as string | null) ?? null,
      day_index: (b.day_index as number) ?? 0,
      owner_name: one(b.profiles),
    })),
    staffed: ((rolesRes.data ?? []) as Record<string, unknown>[])
      .map(r => ({ name: one(r.profiles) ?? "Unassigned", role: r.role_name as string }))
      .filter(s => s.name !== "Unassigned"),
  }
}

// ── Component ─────────────────────────────────────────────────────────────────

export function VolunteerWorkspace({ ministryId, userId }: {
  ministryId: string
  userId: string
}) {
  const timeZone = useMinistryTimezone()
  const [openEventId, setOpenEventId] = useState<string | null>(null)
  const { data: staffed, isLoading } = useSWR(
    ["volunteer-staffed-events", ministryId, userId] as const,
    loadStaffedEvents,
  )
  const events = staffed ?? []
  const open = events.find(e => e.eventId === openEventId) ?? null

  // A staffed event's day, on the MINISTRY's clock (Convention #23). All-day rows
  // carry the truth in start_day; timed rows project their instant.
  const dayOf = (e: StaffedEvent) => (e.allDay && e.startDay ? e.startDay : instantToZoned(e.startISO, timeZone).ymd)
  const dayLabel = (ymd: string) => new Date(`${ymd}T12:00:00`).toLocaleDateString("en-US", { month: "numeric", day: "numeric", year: "2-digit" })
  const timeLabel = (e: StaffedEvent) =>
    e.allDay ? "All day" : formatInZone(e.startISO, timeZone, { hour: "numeric", minute: "2-digit" })

  if (open) {
    return (
      <VolunteerEventDetail
        event={open}
        userId={userId}
        crumbs={[
          { label: "Workspace", onClick: () => setOpenEventId(null) },
          { label: open.title },
        ]}
        dayLabel={dayLabel(dayOf(open))}
        timeLabel={timeLabel(open)}
      />
    )
  }

  return (
    <SubpageShell
      crumbs={[{ label: "Workspace" }]}
      title="Workspace"
      width="full"
    >
      {isLoading ? (
        <p style={{ fontSize: 13.5, color: "var(--muted-text)", padding: "24px 0" }}>Loading…</p>
      ) : events.length === 0 ? (
        // The whole point of showing this tab to an unassigned member: tell them
        // what the tab is FOR, so it reads as "not yet" rather than "broken".
        <div style={{ paddingTop: 48 }}>
          <EmptyState
            variant="quiet"
            icon={<ClipboardList size={20} strokeWidth={1.5} />}
            title="Nothing assigned yet"
            subtitle="When a leader puts you on an event, it shows up here with your role, your tasks, and the plan for the day."
          />
        </div>
      ) : (
        <div style={{ paddingTop: 4 }}>
          <PocketKicker label="You're on" style={{ margin: "0 4px 10px" }} />
          <PocketRowCard>
            {events.map((e, i) => (
              <PocketRow
                key={e.eventId}
                leading={<MonogramChip initials={getInitials(e.title)} style={{ width: 40, height: 40, fontSize: 13, fontWeight: 500 }} />}
                title={e.title}
                sub={[e.myRoles[0]?.name, `${dayLabel(dayOf(e))} · ${timeLabel(e)}`].filter(Boolean).join(" · ")}
                meta={e.myOpenCount > 0 ? `${e.myOpenCount} open` : undefined}
                chevron
                isLast={i === events.length - 1}
                onClick={() => setOpenEventId(e.eventId)}
              />
            ))}
          </PocketRowCard>
        </div>
      )}
    </SubpageShell>
  )
}

// ── Event detail (read-only, except your own task checkboxes) ──────────────────

function VolunteerEventDetail({ event, userId, crumbs, dayLabel, timeLabel }: {
  event: StaffedEvent
  userId: string
  crumbs: Crumb[]
  dayLabel: string
  timeLabel: string
}) {
  const { data, mutate } = useSWR(
    ["volunteer-event-detail", event.planId, userId] as const,
    loadEventDetail,
  )
  const [busyId, setBusyId] = useState<string | null>(null)

  async function toggleTask(taskId: string, next: boolean) {
    if (!data) return
    setBusyId(taskId)
    // Optimistic (Convention #4) — the row flips immediately, reverts on failure.
    const optimistic = { ...data, myTasks: data.myTasks.map(t => t.id === taskId ? { ...t, completed: next } : t) }
    await mutate(async () => {
      const res = await completeTaskAction(taskId, next)
      if ("error" in res) throw new Error(res.error)
      return optimistic
    }, { optimisticData: optimistic, rollbackOnError: true, revalidate: false }).catch(() => {})
    setBusyId(null)
  }

  const tasks = data?.myTasks ?? []
  const openCount = tasks.filter(t => !t.completed).length
  const blocks = data?.blocks ?? []
  const staffed = data?.staffed ?? []

  return (
    <SubpageShell crumbs={crumbs} title={event.title} mobileTitle={event.title} width="full">
      <div style={{ paddingTop: 4 }}>
        <PocketFactsGrid items={[
          { key: "Date", value: dayLabel },
          ...(event.allDay ? [] : [{ key: "Time", value: timeLabel }]),
          { key: "Location", value: event.location?.trim() || "" },
        ]} />

        {/* YOUR ROLE — the reason they're here. Notes carry the actual job. */}
        {event.myRoles.length > 0 && (
          <div style={{ marginTop: 26 }}>
            <p style={{ ...POCKET_KICKER_STYLE, marginBottom: 10 }}>Your role</p>
            {event.myRoles.map(r => (
              <div key={r.name} style={{ marginBottom: 12 }}>
                <div style={{ fontSize: 15, fontWeight: 600, color: "var(--ink)" }}>{r.name}</div>
                {r.notes && (
                  <div style={{ fontSize: 13, color: "var(--muted-text)", lineHeight: 1.5, marginTop: 3, overflowWrap: "anywhere" }}>{r.notes}</div>
                )}
              </div>
            ))}
          </div>
        )}

        {/* YOUR TASKS — the one writable thing on this screen. */}
        {tasks.length > 0 && (
          <div style={{ marginTop: 26 }}>
            <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 10 }}>
              <p style={{ ...POCKET_KICKER_STYLE, margin: 0 }}>Your tasks</p>
              <span style={{ fontSize: 12, color: "var(--muted-text)" }}>{openCount} open</span>
            </div>
            {tasks.map((t, i) => (
              <div
                key={t.id}
                style={{ display: "flex", alignItems: "flex-start", gap: 12, padding: "13px 0", borderBottom: i === tasks.length - 1 ? "none" : "1px solid var(--line-3)", opacity: busyId === t.id ? 0.5 : 1 }}
              >
                <button
                  onClick={() => toggleTask(t.id, !t.completed)}
                  disabled={busyId === t.id}
                  aria-label={t.completed ? "Mark incomplete" : "Mark complete"}
                  style={{ marginTop: 1, width: 20, height: 20, borderRadius: "var(--r-check)", border: "1.6px solid " + (t.completed ? "var(--plum-2)" : "var(--dashed)"), background: t.completed ? "var(--plum-2)" : "transparent", display: "grid", placeItems: "center", cursor: "pointer", flexShrink: 0 }}
                >
                  {t.completed && <span style={{ width: 8, height: 8, borderRadius: 2, background: "var(--cream)" }} />}
                </button>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 15, color: t.completed ? "var(--muted-text)" : "var(--ink)", textDecoration: t.completed ? "line-through" : "none", lineHeight: 1.35, overflowWrap: "anywhere" }}>{t.title}</div>
                  {t.due_date && (
                    <div style={{ fontFamily: "var(--mono)", fontSize: 11, color: "var(--muted-text)", marginTop: 5 }}>
                      {new Date(`${t.due_date}T12:00:00`).toLocaleDateString("en-US", { month: "short", day: "numeric" }).toUpperCase()}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* RUN OF SHOW — read-only. This is the context Home's My Deadlines can't
            give: what happens around your piece on the day. */}
        {blocks.length > 0 && (
          <div style={{ marginTop: 26 }}>
            <p style={{ ...POCKET_KICKER_STYLE, marginBottom: 10 }}>Run of show</p>
            {blocks.map((b, i) => (
              <div key={b.id} style={{ display: "flex", gap: 12, padding: "11px 0", borderBottom: i === blocks.length - 1 ? "none" : "1px solid var(--line-3)" }}>
                <span style={{ fontFamily: "var(--mono)", fontSize: 11.5, color: "var(--muted-text)", width: 62, flexShrink: 0, paddingTop: 2 }}>
                  {b.time_label || "—"}
                </span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 14.5, color: "var(--ink)", lineHeight: 1.35, overflowWrap: "anywhere" }}>{b.title}</div>
                  {b.owner_name && (
                    <div style={{ fontSize: 12.5, color: "var(--muted-text)", marginTop: 2 }}>{b.owner_name}</div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* WHO ELSE — so a volunteer knows who to find on the day. */}
        {staffed.length > 0 && (
          <div style={{ marginTop: 26, marginBottom: 12 }}>
            <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 10 }}>
              <p style={{ ...POCKET_KICKER_STYLE, margin: 0 }}>Who else</p>
              <span style={{ fontSize: 12, color: "var(--muted-text)" }}>{staffed.length} staffed</span>
            </div>
            {staffed.map((s, i) => (
              <div key={`${s.name}-${s.role}-${i}`} style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 0", borderBottom: i === staffed.length - 1 ? "none" : "1px solid var(--line-3)" }}>
                <MonogramChip initials={getInitials(s.name)} style={{ width: 32, height: 32, fontSize: 11, fontWeight: 500, flexShrink: 0 }} />
                <span style={{ flex: 1, minWidth: 0, fontSize: 14.5, color: "var(--ink)" }}>{s.name}</span>
                <span style={{ fontSize: 12.5, color: "var(--muted-text)", whiteSpace: "nowrap" }}>{s.role}</span>
              </div>
            ))}
          </div>
        )}

        {tasks.length === 0 && blocks.length === 0 && event.myRoles.length === 0 && (
          <div style={{ paddingTop: 40 }}>
            <EmptyState
              variant="quiet"
              icon={<Users size={20} strokeWidth={1.5} />}
              title="Nothing to show yet"
              subtitle="Your leader hasn't added the plan for this event. Check back closer to the date."
            />
          </div>
        )}
      </div>
    </SubpageShell>
  )
}
