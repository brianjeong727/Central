"use client"

// ── Countdown tab ─────────────────────────────────────────────────────────────
// A T-minus planning timeline that REPLACES the old Checklist tab. It re-presents
// the SAME event_tasks data (owned by EventPlanWorkspace) grouped by T-minus phase
// — computed from each task's due_date vs the event's start_date projected into the
// MINISTRY's timezone — and adds three augmentations: trigger badges (nudge state), playbook
// whispers (event_tasks.brief), and load-aware reassign; plus a right rail
// (Readiness · Reminder schedule · Load this month).
//
// This file is PRESENTATIONAL + PURE HELPERS only. All task CRUD stays in
// EventPlanWorkspace (plan-tab.tsx); the closure-bound row machinery (renderTaskTree)
// is passed in as a `renderRow` render-prop and the inline add-row as `renderAddRow`.
// Design spec: .claude/task-context/countdown/design-spec.md — authoritative for
// every token/class. web_design_system.md §4.21/§4.22, contract-card.md.

import { Fragment, type ReactNode } from "react"
import useSWR from "swr"
import { Radio, Send, AlertTriangle, ArrowLeftRight } from "lucide-react"
import { createClient } from "@/lib/supabase"
import { MONO_STYLE } from "@/components/central/typography"
import { CentralCard, ActionMenu, CollapsibleRail, PocketKicker, PocketProgress } from "@/components/central"
import { addDaysYMD, daysBetweenYMD, instantToZoned, todayInZone } from "@/lib/tz"
import { useMinistryTimezone } from "../ministry-timezone-context"
import type { EventTask, CountdownPhaseDef } from "../types"

// ── Types ──────────────────────────────────────────────────────────────────────

export type TriggerKind = "overdue" | "fired" | "armed"

export interface MemberOpenCount {
  user_id: string
  open_tasks: number
  pending_confirms: number
}

// Per-row presentation flags handed from CountdownTab → renderRow (renderTaskTree)
// so the SAME row machinery can add a trigger badge, a now/risk left accent, and
// render the brief as a whisper callout — without duplicating any CRUD wiring.
export interface RowAug {
  countdown: true
  badge: TriggerKind | null
  badgeCopy: string
  variant: "now" | "risk" | null
  // True for ANY incomplete, past-due task (assigned or not). Drives the loud
  // overdue treatment on the row — independent of the assignment-gated nudge badge.
  overdue: boolean
  // Reassign-by-load control, anchored INTO the risk row's meta cluster (not a
  // detached button below the card). Present only on risk rows.
  reassign?: ReactNode
}

// A plan's ladder rung is typed in ../types (CountdownPhaseDef) and its data
// lives in COUNTDOWN_PRESETS (app/home/event-presets-data.mjs) — the single
// source shared by the app and the seed scripts. Re-exported here so consumers
// of the countdown module get the type without a second import path.
export type { CountdownPhaseDef }

// The computed catch-all for tasks carrying no due_date. Never stored in a
// ladder — it is the ABSENCE of a date, not a window.
export const UNSCHEDULED_KEY = "unscheduled"

export interface CountdownPhase {
  key: string
  tk: string            // T-minus label ("T−3 WEEKS")
  dateLabel: string     // due-date window for the phase
  doneLabel: string     // "2 of 4 done"
  isCurrent: boolean
  isPast: boolean
  tasks: EventTask[]    // top-level, non-pinned tasks in this phase, sorted
  defaultDue: string    // representative YMD to seed the phase's inline add-row
  eventPhase: EventTask["phase"]
  sectionKey: string    // the phase's own key — what drag/add-row targets
}

// ── Pure date helpers ──────────────────────────────────────────────────────────
// These operate on bare "YYYY-MM-DD" strings only, so they are zone-immune. The
// two places a zone IS needed — projecting the event's start instant onto a
// calendar day, and "today" — go through lib/tz.ts with the MINISTRY's zone
// (see CountdownTab below). There is no PT default here any more: a hardcoded
// America/Los_Angeles put every Eastern ministry's T-minus math a day off for
// any event or deadline near midnight.

// Calendar-day arithmetic lives in lib/tz.ts (Convention #23) — these were two
// of six private copies across three incompatible strategies. Re-exported so any
// existing `from "./countdown-tab"` import keeps resolving to the ONE impl.
export { daysBetweenYMD }

function fmtMD(ymd: string): string {
  return new Date(ymd + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" })
}

function weekday(ymd: string): string {
  return new Date(ymd + "T00:00:00").toLocaleDateString("en-US", { weekday: "short" })
}

// ── Phase model ────────────────────────────────────────────────────────────────
// The ladder is DATA now (event_plans.countdown_phases), not a hardcoded const —
// seeded from a preset and editable per plan. This replaced the old
// plan_start_date / crunch_date anchors entirely: because every boundary is a
// relative offset, moving an event re-buckets nothing and needs no date shift.
//
// Bucketing contract (see COUNTDOWN_PRESETS in event-presets-data.mjs): a phase
// covers d ∈ (nextPhase.startDaysBefore, startDaysBefore], the first phase is
// open upward, the last covers everything below it.

/** The phase a task falls in, given days-to-event `d`. Ladder is earliest→latest. */
export function phaseKeyForDays(ladder: CountdownPhaseDef[], d: number): string {
  if (ladder.length === 0) return UNSCHEDULED_KEY
  for (let i = 0; i < ladder.length; i++) {
    const next = ladder[i + 1]
    // Last rung swallows everything below its predecessor.
    if (!next) return ladder[i].key
    if (d > next.startDaysBefore) return ladder[i].key
  }
  return ladder[ladder.length - 1].key
}

/**
 * Rank a phase for past/current comparison — earlier phases rank HIGHER, matching
 * the old PHASE_META ranks (far:5 … post:1). Index 0 is the earliest rung.
 */
function rankOf(ladder: CountdownPhaseDef[], key: string): number {
  const i = ladder.findIndex((p) => p.key === key)
  return i === -1 ? 0 : ladder.length - i
}

// Group top-level tasks into ordered T-minus phases. Children render nested by the
// caller's renderRow (renderTaskTree), so only parent_id === null is bucketed here.
export function bucketCountdownPhases(
  tasks: EventTask[],
  eventYMD: string,
  todayYMD: string,
  ladder: CountdownPhaseDef[],
): CountdownPhase[] {
  const tops = tasks.filter((t) => t.parent_id === null && !t.pinned)
  const groups = new Map<string, EventTask[]>()
  for (const t of tops) {
    const key = t.due_date ? phaseKeyForDays(ladder, daysBetweenYMD(t.due_date, eventYMD)) : UNSCHEDULED_KEY
    const arr = groups.get(key) ?? []
    arr.push(t)
    groups.set(key, arr)
  }
  // Render order: the ladder as stored, then the computed unscheduled catch-all.
  const PHASE_ORDER: string[] = [...ladder.map((p) => p.key), UNSCHEDULED_KEY]
  const metaFor = (key: string): { tk: string; eventPhase: EventTask["phase"]; dayOffset: number } => {
    const def = ladder.find((p) => p.key === key)
    if (def) return { tk: def.label, eventPhase: def.eventPhase, dayOffset: def.seedOffsetDays }
    return { tk: "UNSCHEDULED", eventPhase: "pre_event", dayOffset: 0 }
  }
  // "Current" lead-up phase = the phase holding the NEXT upcoming deadline
  // (earliest due_date on/after today). This lands "· this week" on the bucket that
  // actually contains today — or the nearest UPCOMING bucket — never a fully-past
  // one. Falls back to today's own d-bucket only if nothing is upcoming.
  const nextUpcoming = tops
    .map((t) => t.due_date)
    .filter((d): d is string => !!d && d >= todayYMD)
    .sort()[0]
  const currentKey: string = nextUpcoming
    ? phaseKeyForDays(ladder, daysBetweenYMD(nextUpcoming, eventYMD))
    : phaseKeyForDays(ladder, daysBetweenYMD(todayYMD, eventYMD))
  const currentRank = rankOf(ladder, currentKey)

  return PHASE_ORDER.flatMap((key): CountdownPhase[] => {
    const arr = groups.get(key)
    if (!arr || arr.length === 0) return []
    arr.sort(
      (a, b) =>
        Number(b.priority === "high") - Number(a.priority === "high") ||
        (a.due_date ?? "9999").localeCompare(b.due_date ?? "9999") ||
        a.sort_order - b.sort_order,
    )
    const meta = metaFor(key)
    const dated = arr.map((t) => t.due_date).filter(Boolean) as string[]
    dated.sort()
    const dateLabel =
      key === UNSCHEDULED_KEY || dated.length === 0
        ? ""
        : dated[0] === dated[dated.length - 1]
          ? fmtMD(dated[0])
          : `${fmtMD(dated[0])} – ${fmtMD(dated[dated.length - 1])}`
    const done = arr.filter((t) => t.completed).length
    return [
      {
        key,
        tk: meta.tk,
        dateLabel,
        doneLabel: `${done} of ${arr.length} done`,
        isCurrent: key !== UNSCHEDULED_KEY && key === currentKey,
        isPast: key !== UNSCHEDULED_KEY && rankOf(ladder, key) > currentRank,
        tasks: arr,
        defaultDue: key === UNSCHEDULED_KEY ? "" : addDaysYMD(eventYMD, meta.dayOffset),
        eventPhase: meta.eventPhase,
        sectionKey: key,
      },
    ]
  })
}

// ── Trigger badges ─────────────────────────────────────────────────────────────
// Precedence: overdue > fired > armed. overdue is purely computed (incomplete,
// assigned, past-due on the ministry's calendar — `todayYMD` is resolved by the
// caller in the ministry's zone). fired reads the notification_ledger set. armed = an
// upcoming auto-DM is scheduled.
export function badgeFor(task: EventTask, firedIds: Set<string>, todayYMD: string): TriggerKind | null {
  const due = task.due_date
  if (!due) return firedIds.has(task.id) ? "fired" : null
  if (!task.completed && task.assigned_to && due < todayYMD) return "overdue"
  if (firedIds.has(task.id)) return "fired"
  if (!task.completed && due >= todayYMD) return "armed"
  return null
}

// Short human copy carried in the badge pill. T−2 confirm tasks get the brief-
// driven confirm-taps line; other armed tasks announce the auto-DM fire day.
export function badgeCopyFor(task: EventTask, kind: TriggerKind | null, eventYMD: string): string {
  if (kind === "overdue") return "Nudged 2× — no reply"
  if (kind === "fired") return "Auto-DM sent"
  if (kind === "armed") {
    if (task.due_date) {
      const d = daysBetweenYMD(task.due_date, eventYMD)
      if (d >= 0 && d <= 2) return "Confirm-taps go out T−2 days"
      const fire = addDaysYMD(task.due_date, -1)
      return `Auto-DM fires ${weekday(fire)}`
    }
    return "Auto-DM armed"
  }
  return ""
}

// ── Fires-next queue ────────────────────────────────────────────────────────────
// Upcoming auto-fires: armed tasks sorted by fire date (due − 1), capped.
export function deriveFiresNext(
  tasks: EventTask[],
  firedIds: Set<string>,
  eventYMD: string,
  todayYMD: string,
  cap = 6,
): { task: EventTask; fireYMD: string; copy: string }[] {
  return tasks
    .filter((t) => t.due_date && badgeFor(t, firedIds, todayYMD) === "armed")
    .map((t) => ({ task: t, fireYMD: addDaysYMD(t.due_date!, -1), copy: badgeCopyFor(t, "armed", eventYMD) }))
    .sort((a, b) => a.fireYMD.localeCompare(b.fireYMD))
    .slice(0, cap)
}

// ── Load counts (SWR) ────────────────────────────────────────────────────────────
export function useLoadCounts(teamId: string | null | undefined): MemberOpenCount[] | undefined {
  const supabase = createClient()
  const { data } = useSWR(
    teamId ? ["load-counts", teamId] : null,
    async () => {
      const { data, error } = await supabase.rpc("member_open_counts", { p_team_id: teamId })
      if (error) throw error
      return (data ?? []) as MemberOpenCount[]
    },
  )
  return data
}

// ── Presentational atoms ─────────────────────────────────────────────────────────

// Countdown pill (§4.21). Reuses the events countdown-pill treatment: cream-2 bg +
// line-2 hairline at the default distance; the ivory+plum "soon" variant only ≤7d.
export function CountdownPill({ label, soon }: { label: string; soon: boolean }) {
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        padding: "4px 12px",
        borderRadius: 999,
        fontFamily: "var(--mono)",
        fontSize: 12,
        background: soon ? "var(--ivory)" : "var(--cream-2)",
        border: "1px solid var(--line-2)",
        color: soon ? "var(--plum)" : "var(--muted-text)",
        whiteSpace: "nowrap",
      }}
    >
      {label}
    </span>
  )
}

// Trigger badge. armed = ivory + plum (S11, plum-tint deliberately NOT used for a
// status pill). fired = ivory soft-pill (K6). overdue = transparent + danger
// outline + danger text — the ratified danger-as-outline for genuine escalation (K2).
export function TriggerBadge({ kind, copy }: { kind: TriggerKind; copy: string }) {
  const base = {
    display: "inline-flex",
    alignItems: "center",
    gap: 5,
    padding: "2px 9px",
    borderRadius: 999,
    fontFamily: "var(--mono)",
    fontSize: 10.5,
    lineHeight: 1.4,
    whiteSpace: "nowrap" as const,
    flexShrink: 0,
  }
  if (kind === "overdue") {
    return (
      <span style={{ ...base, background: "transparent", border: "1px solid var(--danger)", color: "var(--danger)" }}>
        <AlertTriangle style={{ width: 11, height: 11 }} /> {copy}
      </span>
    )
  }
  if (kind === "fired") {
    return (
      <span style={{ ...base, background: "var(--ivory)", color: "var(--body)" }}>
        <Send style={{ width: 11, height: 11 }} /> {copy}
      </span>
    )
  }
  return (
    <span style={{ ...base, background: "var(--ivory)", color: "var(--plum)" }}>
      <Radio style={{ width: 11, height: 11 }} /> {copy}
    </span>
  )
}

// Playbook whisper (K5) — event_tasks.brief on a sanctioned cream-3 accent surface,
// faint, pre-wrap. Rendered only when brief is non-null.
export function CountdownWhisper({ text }: { text: string }) {
  return (
    <span
      style={{
        display: "block",
        marginTop: 6,
        background: "var(--cream-3)",
        borderRadius: "var(--r-chip)",
        padding: "8px 11px",
        fontFamily: "var(--sans)",
        fontSize: 12.5,
        lineHeight: 1.5,
        color: "var(--body)",
        whiteSpace: "pre-wrap",
      }}
    >
      {text}
    </span>
  )
}

function loadTone(load: number): { chipBg: string; chipBorder: string; chipColor: string } {
  // lo = ivory + success; mid = ivory + gold (S12); hi = transparent + danger outline (K4).
  if (load <= 1) return { chipBg: "var(--ivory)", chipBorder: "1px solid var(--line-2)", chipColor: "var(--success)" }
  if (load <= 3) return { chipBg: "var(--ivory)", chipBorder: "1px solid var(--line-2)", chipColor: "var(--gold)" }
  return { chipBg: "transparent", chipBorder: "1px solid var(--danger)", chipColor: "var(--danger)" }
}

// Reassign-by-load control (augmentation #3). Built on the shared ActionMenu
// primitive (cream-panel, hairline, NO shadow — S14) so the colored load chips can
// render. Members sorted ASCENDING by open-task load; pick calls onReassign.
export function ReassignControl({
  task,
  assigneePool,
  loadCounts,
  onReassign,
}: {
  task: EventTask
  assigneePool: { id: string; name: string }[]
  loadCounts: MemberOpenCount[] | undefined
  onReassign: (task: EventTask, userId: string) => void
}) {
  const loadMap = new Map((loadCounts ?? []).map((c) => [c.user_id, c.open_tasks]))
  const sorted = [...assigneePool].sort((a, b) => (loadMap.get(a.id) ?? 99) - (loadMap.get(b.id) ?? 99))

  return (
    <ActionMenu
        align="right"
        minWidth={240}
        renderTrigger={({ open, toggle }) => (
          <button
            type="button"
            onClick={toggle}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 5,
              padding: "3px 10px",
              borderRadius: 999,
              background: open ? "var(--cream-2)" : "transparent",
              border: "1px solid var(--danger)",
              color: "var(--danger)",
              fontSize: 12,
              whiteSpace: "nowrap",
              flexShrink: 0,
              cursor: "pointer",
            }}
          >
            <ArrowLeftRight style={{ width: 12, height: 12 }} /> Reassign
          </button>
        )}
      >
        {(close) => (
          <div style={{ padding: "4px 0", maxHeight: 300, overflowY: "auto" }}>
            <div style={{ ...MONO_STYLE, padding: "6px 14px 8px" }}>Lightest load first</div>
            {sorted.map((m) => {
              const load = loadMap.get(m.id) ?? 0
              const tone = loadTone(load)
              return (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => {
                    onReassign(task, m.id)
                    close()
                  }}
                  className="hover:bg-[var(--cream-2)]"
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    gap: 12,
                    width: "100%",
                    padding: "8px 14px",
                    background: "none",
                    border: "none",
                    cursor: "pointer",
                    textAlign: "left",
                  }}
                >
                  <span style={{ fontSize: 13, color: "var(--ink)" }}>{m.name}</span>
                  <span
                    style={{
                      fontFamily: "var(--mono)",
                      fontSize: 10.5,
                      padding: "2px 8px",
                      borderRadius: 999,
                      background: tone.chipBg,
                      border: tone.chipBorder,
                      color: tone.chipColor,
                      whiteSpace: "nowrap",
                    }}
                  >
                    {load} open
                  </span>
                </button>
              )
            })}
          </div>
        )}
      </ActionMenu>
  )
}

// ── Right-rail cards ─────────────────────────────────────────────────────────────

function railCard(children: ReactNode, key?: string) {
  return (
    <CentralCard key={key} variant="callout" radius="var(--r-callout)" padding={22}>
      {children}
    </CentralCard>
  )
}

// Readiness — mirrors the overview Readiness render (plan-tab 8419–8437): 8px dot,
// 14px/500 label, canonical 5-seg bar (plum / success at 100%), "X of Y done" + pct.
function ReadinessCard({ done, total, overdue }: { done: number; total: number; overdue: number }) {
  const pct = total > 0 ? Math.round((done / total) * 100) : 0
  const filledSegs = total > 0 ? Math.round((done / total) * 5) : 0
  const readiness =
    total === 0
      ? { color: "var(--faint)", label: "No checklist yet" }
      : pct === 100
        ? { color: "var(--success)", label: "Ready" }
        : pct >= 50
          ? { color: "var(--sage)", label: "In progress" }
          : { color: "var(--gold)", label: "Needs attention" }
  return railCard(
    <>
      <p style={{ ...MONO_STYLE, margin: 0 }}>Readiness</p>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 12 }}>
        <span style={{ width: 8, height: 8, borderRadius: 99, background: readiness.color, flexShrink: 0 }} />
        <span style={{ fontSize: 14, fontWeight: 500, color: "var(--ink)" }}>{readiness.label}</span>
      </div>
      <div style={{ display: "flex", gap: 6, marginTop: 14 }}>
        {Array.from({ length: 5 }).map((_, i) => (
          <span
            key={i}
            style={{
              flex: 1,
              height: 6,
              borderRadius: 99,
              background: i < filledSegs ? (pct === 100 ? "var(--success)" : "var(--plum)") : "var(--line-2)",
            }}
          />
        ))}
      </div>
      {total > 0 && (
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginTop: 12 }}>
          <span style={{ fontSize: 12, color: "var(--body)" }}>{done} of {total} done</span>
          <span style={{ fontFamily: "var(--font-instrument-serif)", fontSize: 18, fontWeight: 600, color: "var(--ink)" }}>{pct}%</span>
        </div>
      )}
      {overdue > 0 && (
        <div style={{ marginTop: 12, display: "flex", alignItems: "center", gap: 8, background: "color-mix(in srgb, var(--danger) 8%, transparent)", borderRadius: 8, padding: "8px 10px" }}>
          <span style={{ width: 7, height: 7, borderRadius: 99, background: "var(--danger)", flexShrink: 0 }} />
          <span style={{ fontSize: 13, fontWeight: 600, color: "var(--danger)" }}>{overdue} overdue</span>
        </div>
      )}
    </>,
  )
}

// "Reminder schedule" (K9): armed auto-fires sorted by fire date.
function FiresNextCard({ queue }: { queue: { task: EventTask; fireYMD: string; copy: string }[] }) {
  return railCard(
    <>
      <p style={{ ...MONO_STYLE, margin: 0 }}>Reminder schedule</p>
      {queue.length === 0 ? (
        <p style={{ fontSize: 13, color: "var(--faint)", fontStyle: "italic", marginTop: 12 }}>Nothing armed right now.</p>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 12, marginTop: 14 }}>
          {queue.map(({ task, fireYMD, copy }) => (
            <div key={task.id} style={{ display: "flex", alignItems: "baseline", gap: 10 }}>
              <span style={{ fontFamily: "var(--mono)", fontSize: 11, color: "var(--plum)", whiteSpace: "nowrap", flexShrink: 0, minWidth: 30 }}>
                {weekday(fireYMD)}
              </span>
              <span style={{ fontSize: 13, color: "var(--ink)", lineHeight: 1.4 }}>
                {task.title}
                <span style={{ display: "block", fontStyle: "italic", fontSize: 12, color: "var(--muted-text)", marginTop: 1 }}>{copy}</span>
              </span>
            </div>
          ))}
        </div>
      )}
    </>,
  )
}

// "Load this month" (S13): per-member open-task bars, descending. ALL bars fill
// plum (length conveys load); the overloaded member's COUNT is danger TEXT — never
// a red fill. Footer names the lowest-two the reassign popover surfaces first.
function LoadCard({
  loadCounts,
  nameOf,
}: {
  loadCounts: MemberOpenCount[]
  nameOf: (id: string) => string
}) {
  const rows = loadCounts.filter((c) => c.open_tasks > 0).sort((a, b) => b.open_tasks - a.open_tasks).slice(0, 6)
  if (rows.length === 0) return null
  const max = Math.max(...rows.map((r) => r.open_tasks), 1)
  const lowestTwo = [...loadCounts]
    .sort((a, b) => a.open_tasks - b.open_tasks)
    .slice(0, 2)
    .map((c) => nameOf(c.user_id).split(" ")[0])
    .filter(Boolean)
  return railCard(
    <>
      <p style={{ ...MONO_STYLE, margin: 0 }}>Load this month</p>
      <div style={{ display: "flex", flexDirection: "column", gap: 11, marginTop: 14 }}>
        {rows.map((r) => {
          const overloaded = r.open_tasks === max && max >= 5
          return (
            <div key={r.user_id} style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <span style={{ width: 74, fontSize: 12.5, color: "var(--body)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flexShrink: 0 }}>
                {nameOf(r.user_id)}
              </span>
              <span style={{ flex: 1, height: 6, borderRadius: 99, background: "var(--line-2)", overflow: "hidden" }}>
                <span style={{ display: "block", height: "100%", width: `${(r.open_tasks / max) * 100}%`, background: "var(--plum)", borderRadius: 99 }} />
              </span>
              <span style={{ fontFamily: "var(--mono)", fontSize: 11, color: overloaded ? "var(--danger)" : "var(--muted-text)", whiteSpace: "nowrap", flexShrink: 0, fontWeight: overloaded ? 500 : 400 }}>
                {r.open_tasks}
              </span>
            </div>
          )
        })}
      </div>
      {lowestTwo.length > 0 && (
        <p style={{ fontSize: 11.5, color: "var(--muted-text)", marginTop: 14, lineHeight: 1.4 }}>
          Reassign surfaces {lowestTwo.join(" & ")} first.
        </p>
      )}
    </>,
  )
}

// ── Phase header ────────────────────────────────────────────────────────────────
function PhaseHead({
  phase,
  stickyTop,
  dragActive,
  dragOver,
  onDragOver,
  onDrop,
}: {
  phase: CountdownPhase
  stickyTop: number
  dragActive: boolean
  dragOver: boolean
  onDragOver?: () => void
  onDrop?: () => void
}) {
  const labelColor = phase.isCurrent ? "var(--plum)" : phase.isPast ? "var(--faint)" : "var(--muted-text)"
  return (
    <div
      onDragOver={dragActive && onDragOver ? (e) => { e.preventDefault(); onDragOver() } : undefined}
      onDrop={dragActive && onDrop ? (e) => { e.preventDefault(); onDrop() } : undefined}
      style={{
        position: "sticky",
        top: stickyTop,
        zIndex: 2,
        display: "flex",
        alignItems: "center",
        gap: 12,
        padding: "10px 2px 8px",
        background: dragOver ? "var(--cream-3)" : "var(--cream-panel)",
        boxShadow: dragOver ? "inset 0 0 0 1.5px var(--plum)" : "none",
        borderRadius: dragOver ? 8 : 0,
      }}
    >
      <span style={{ fontFamily: "var(--mono)", fontSize: 12, letterSpacing: "1.2px", textTransform: "uppercase", color: labelColor, fontWeight: 500, whiteSpace: "nowrap" }}>
        {phase.tk}{phase.isCurrent ? " · this week" : ""}
      </span>
      {phase.dateLabel && (
        <span style={{ fontFamily: "var(--mono)", fontSize: 11, color: "var(--muted-text)", whiteSpace: "nowrap" }}>{phase.dateLabel}</span>
      )}
      <div style={{ flex: 1, height: 1, background: "var(--line)" }} />
      <span style={{ fontFamily: "var(--mono)", fontSize: 11, color: "var(--muted-text)", whiteSpace: "nowrap" }}>{phase.doneLabel}</span>
    </div>
  )
}

// ── CountdownTab ────────────────────────────────────────────────────────────────

export interface CountdownTabProps {
  tasks: EventTask[]
  eventStartISO: string
  teamId: string | null | undefined
  assigneePool: { id: string; name: string }[]
  firedIds: Set<string>
  canEdit: boolean
  isMobile: boolean
  /** The plan's stored T-minus ladder (event_plans.countdown_phases). */
  ladder: CountdownPhaseDef[]
  countdownPill: ReactNode
  pinnedBand?: ReactNode
  // Render-props into EventPlanWorkspace's closure-bound row machinery.
  renderRow: (task: EventTask, aug: RowAug) => ReactNode
  // Mobile row (Pocket-style, title on its own line) — used only at phone width.
  renderMobileRow: (task: EventTask, aug: RowAug) => ReactNode
  renderAddRow: (phase: CountdownPhase) => ReactNode
  onReassign: (task: EventTask, userId: string) => void
  // Drag-to-phase (re-date) — optional; desktop only.
  dragActive: boolean
  dragOverPhaseKey: string | null
  onPhaseDragOver: (phaseKey: string) => void
  onPhaseDrop: (phase: CountdownPhase) => void
  // Sticky offset so phase headers clear the PlanSubTabStrip.
  stickyTop?: number
}

export function CountdownTab(props: CountdownTabProps) {
  const {
    // `ladder` replaces main's `hasCrunch` (the boolean only existed to pick
    // between two hardcoded phase sets). `onGoRunSheet` is NOT taken from the
    // ladder branch — main deleted that button and its prop.
    tasks, eventStartISO, teamId, assigneePool, firedIds, canEdit, isMobile, ladder,
    countdownPill, pinnedBand, renderRow, renderMobileRow, renderAddRow, onReassign,
    dragActive, dragOverPhaseKey, onPhaseDragOver, onPhaseDrop, stickyTop = 52,
  } = props

  // The two zone-dependent values in the whole T-minus model. Both resolve in the
  // MINISTRY's zone: `eventStartISO` is a true instant (lib/tz.ts), and "today"
  // must flip at the ministry's midnight, not the viewer's and not Pacific's.
  const timeZone = useMinistryTimezone()
  const eventYMD = instantToZoned(eventStartISO, timeZone).ymd
  const todayYMD = todayInZone(timeZone)
  const phases = bucketCountdownPhases(tasks, eventYMD, todayYMD, ladder)
  const loadCounts = useLoadCounts(teamId)

  const done = tasks.filter((t) => t.completed).length
  const total = tasks.length
  const overdueCount = tasks.filter((t) => !t.completed && !!t.due_date && t.due_date < todayYMD).length

  // "Now" = the single earliest-due incomplete top-level task that is NOT overdue
  // (due today or later). Overdue tasks get the risk treatment instead.
  const nowTaskId = tasks
    .filter((t) => t.parent_id === null && !t.completed && t.due_date && t.due_date >= todayYMD)
    .sort((a, b) => (a.due_date ?? "9999").localeCompare(b.due_date ?? "9999"))[0]?.id

  const augFor = (task: EventTask): RowAug => {
    const badge = badgeFor(task, firedIds, todayYMD)
    // Overdue = incomplete + has a due date in the past (PT), regardless of assignee.
    const overdue = !task.completed && !!task.due_date && task.due_date < todayYMD
    const variant = overdue ? "risk" : task.id === nowTaskId ? "now" : null
    return {
      countdown: true,
      badge,
      badgeCopy: badge ? badgeCopyFor(task, badge, eventYMD) : "",
      variant,
      overdue,
      reassign: variant === "risk" && canEdit
        ? <ReassignControl task={task} assigneePool={assigneePool} loadCounts={loadCounts} onReassign={onReassign} />
        : undefined,
    }
  }

  const nameOf = (id: string) => assigneePool.find((m) => m.id === id)?.name ?? "Member"
  const firesNext = deriveFiresNext(tasks, firedIds, eventYMD, todayYMD)

  const timeline = (
    <div>
      {pinnedBand}
      {phases.map((phase) => (
        <div key={phase.key} style={{ marginBottom: "var(--space-9)" }}>
          <PhaseHead
            phase={phase}
            stickyTop={stickyTop}
            dragActive={dragActive}
            dragOver={dragOverPhaseKey === phase.key}
            onDragOver={() => onPhaseDragOver(phase.key)}
            onDrop={() => onPhaseDrop(phase)}
          />
          {phase.tasks.map((task) => (
            <Fragment key={task.id}>{renderRow(task, augFor(task))}</Fragment>
          ))}
          {renderAddRow(phase)}
        </div>
      ))}
    </div>
  )

  // ── Mobile ─────────────────────────────────────────────────────────────────
  if (isMobile) {
    return (
      <div>
        <PocketKicker label="COUNTDOWN" action={countdownPill} />
        <div style={{ display: "flex", alignItems: "center", gap: 10, margin: "0 4px 20px" }}>
          <PocketProgress done={done} total={total} />
          <span style={{ fontSize: 12, color: "var(--muted-text)", whiteSpace: "nowrap" }}>{done}/{total} done</span>
          {overdueCount > 0 && (
            <span style={{ fontFamily: "var(--mono)", fontSize: 11, fontWeight: 600, letterSpacing: "0.03em", color: "var(--danger)", background: "color-mix(in srgb, var(--danger) 10%, transparent)", borderRadius: 999, padding: "3px 9px", whiteSpace: "nowrap" }}>{overdueCount} OVERDUE</span>
          )}
        </div>
        {firesNext.length > 0 && (
          <div style={{ background: "var(--ivory)", borderRadius: 16, padding: "12px 16px", margin: "0 0 20px" }}>
            <p style={{ ...MONO_STYLE, margin: 0 }}>Reminder schedule</p>
            <p style={{ fontSize: 13, color: "var(--ink)", marginTop: 6 }}>
              <span style={{ color: "var(--plum)" }}>{firesNext.length}</span> auto-DM{firesNext.length > 1 ? "s" : ""} queued — next {weekday(firesNext[0].fireYMD)}.
            </p>
          </div>
        )}
        {pinnedBand}
        {phases.map((phase) => (
          <section key={phase.key} style={{ marginBottom: 24 }}>
            <PocketKicker
              label={`${phase.tk}${phase.isCurrent ? " · THIS WEEK" : ""}`}
              action={<span style={{ fontFamily: "var(--mono)", fontSize: 11, color: "var(--muted-text)" }}>{phase.doneLabel}</span>}
            />
            {phase.tasks.map((task) => (
              <Fragment key={task.id}>{renderMobileRow(task, augFor(task))}</Fragment>
            ))}
            {renderAddRow(phase)}
          </section>
        ))}
      </div>
    )
  }

  // ── Desktop ──────────────────────────────────────────────────────────────────
  // The prose line that used to sit here ("Day-of timing lives in the Run of Show
  // tab…") is gone (2026-08-02, Brian's hierarchy pass): the Run of Show tab is one
  // click away in the strip directly above, so the sentence bought a cross-link the
  // reader already had and cost a muted line at the top of every visit.
  //
  // The rail is READINESS + REMINDER SCHEDULE + LOAD — supporting readouts, not a
  // working surface. It starts FOLDED so the task timeline gets the full width, and
  // the reader unfolds it when they want the readout. No persistence (Convention #1).
  //
  // The folded tab says "At a glance", not "Readiness": it was named after its TOP
  // CARD, which told anyone who folded it that the reminder schedule and the load
  // readout were gone rather than hidden. A collapsed tab is the only description
  // its contents get, so it names the whole column. `contentsName` then enumerates
  // those cards for screen readers, where there is no width limit.
  return (
    <CollapsibleRail
      label="At a glance"
      contentsName="readiness and reminder schedule"
      width={336}
      gap="var(--space-10)"
      defaultCollapsed
      className="max-md:!block"
      rail={
        <aside style={{ display: "flex", flexDirection: "column", gap: "var(--space-6)" }} className="max-md:mt-8">
          <ReadinessCard done={done} total={total} overdue={overdueCount} />
          <FiresNextCard queue={firesNext} />
          {teamId && loadCounts && loadCounts.length > 0 && <LoadCard loadCounts={loadCounts} nameOf={nameOf} />}
        </aside>
      }
    >
      <section>{timeline}</section>
    </CollapsibleRail>
  )
}
