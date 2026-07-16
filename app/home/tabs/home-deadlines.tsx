"use client"

// ── My Deadlines (Run Sheet P1) ───────────────────────────────────────────────
// A personal Home surface: my open dated tasks + my pending role confirmations,
// urgency-sorted, with in-place optimistic taps (Convention #4, RSVP shape). Two
// row species — TASK (checkbox = mark done, U2b) and CONFIRMATION (Confirm/Decline
// buttons + quiet status text, K6). Attention is PLUM only; never --danger/--gold.
//
// Mounted TWICE from home-tab (variant="desktop" / "mobile"); both mounts share the
// single SWR cache keyed ["my-deadlines", ministryId, profileId], so a tap in either
// viewport revalidates both and the fetch runs once.

import { useMemo } from "react"
import useSWR from "swr"
import { Check, Circle, CheckCircle2, CalendarCheck } from "lucide-react"
import { createClient } from "@/lib/supabase"
import { SectionHeader, ListRow, CentralButton, MONO_STYLE } from "@/components/central"
import { PocketCard, PocketRowCard } from "@/components/central"
import { EmptyState } from "../components/shared"
import { completeTaskAction } from "@/app/actions/event-confirmations"
import type { EventConfirmation } from "../types"

// ── Merged item model ─────────────────────────────────────────────────────────
type ConfStatus = EventConfirmation["status"]
type DeadlineItem =
  | {
      kind: "task"
      id: string
      title: string
      context: string
      dueDate: string | null
      completed: boolean
      completedAt: string | null
    }
  | {
      kind: "confirmation"
      id: string
      roleName: string
      eventTitle: string
      eventDate: string | null
      status: ConfStatus
      respondedAt: string | null
    }

// ── Date helpers (client-local; the 9am-PT precision is the cron's job) ────────
function isoDay(offset = 0): string {
  const d = new Date()
  d.setDate(d.getDate() + offset)
  return d.toLocaleDateString("en-CA") // YYYY-MM-DD, local
}
function dayDiff(dateStr: string): number {
  const target = new Date(dateStr.length <= 10 ? `${dateStr}T00:00:00` : dateStr)
  const t = new Date(target.getFullYear(), target.getMonth(), target.getDate())
  const now = new Date()
  const n = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  return Math.round((t.getTime() - n.getTime()) / 86_400_000)
}
function relLabel(dateStr: string): string {
  const d = dayDiff(dateStr)
  if (d < 0) return "OVERDUE"
  if (d === 0) return "TODAY"
  if (d === 1) return "TOMORROW"
  return `IN ${d}D`
}
function absLabel(dateStr: string): string {
  const d = new Date(dateStr.length <= 10 ? `${dateStr}T00:00:00` : dateStr)
  if (isNaN(d.getTime())) return ""
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" })
}
function isUrgentTask(dueDate: string | null): boolean {
  return dueDate != null && dayDiff(dueDate) <= 0
}

// Status vocab → quiet text color (K6). Plum for attention/positive, muted for declined.
const STATUS_TEXT: Record<ConfStatus, { label: string; color: string }> = {
  requested: { label: "Awaiting", color: "var(--plum)" },
  escalated: { label: "Escalated", color: "var(--plum)" },
  confirmed: { label: "Confirmed", color: "var(--plum)" },
  declined: { label: "Declined", color: "var(--muted-text)" },
}

// ── Urgency sort: overdue → today → soon → done tail ──────────────────────────
function rankOf(it: DeadlineItem): number {
  if (it.kind === "task") {
    if (it.completed) return 3
    if (!it.dueDate) return 2
    const d = dayDiff(it.dueDate)
    return d < 0 ? 0 : d === 0 ? 1 : 2
  }
  // confirmation
  if (it.status === "confirmed" || it.status === "declined") return 3
  return 1 // awaiting (requested / escalated) — surfaces high
}
function sortKeyDate(it: DeadlineItem): number {
  const s = it.kind === "task" ? it.dueDate : it.eventDate
  return s ? new Date(s.length <= 10 ? `${s}T00:00:00` : s).getTime() : Number.MAX_SAFE_INTEGER
}
function doneTs(it: DeadlineItem): number {
  const s = it.kind === "task" ? it.completedAt : it.respondedAt
  return s ? new Date(s).getTime() : 0
}
function sortItems(items: DeadlineItem[]): DeadlineItem[] {
  return [...items].sort((a, b) => {
    const ra = rankOf(a)
    const rb = rankOf(b)
    if (ra !== rb) return ra - rb
    if (ra === 3) return doneTs(b) - doneTs(a) // done tail: most-recent first
    return sortKeyDate(a) - sortKeyDate(b)
  })
}

// ── Component ─────────────────────────────────────────────────────────────────
export function HomeDeadlines({
  ministryId,
  profileId,
  variant,
  onSeeAll,
}: {
  ministryId: string
  profileId: string
  variant: "desktop" | "mobile"
  onSeeAll?: () => void
}) {
  const supabase = createClient()

  async function loadDeadlines(): Promise<DeadlineItem[]> {
    const today = isoDay(0)
    const plus14 = isoDay(14)
    const minus7 = new Date(Date.now() - 7 * 86_400_000).toISOString()

    // Tasks: my open dated tasks (≤ today+14d) + a short DONE tail (completed ≤7d ago).
    const taskSelect =
      "id, title, due_date, completed, completed_at, event_plan_id, " +
      "event_plans!inner(calendar_events!inner(title))"
    const [{ data: openTasks }, { data: doneTasks }, { data: awaiting }, { data: resolved }] =
      await Promise.all([
        supabase
          .from("event_tasks")
          .select(taskSelect)
          .eq("assigned_to", profileId)
          .eq("completed", false)
          .not("due_date", "is", null)
          .lte("due_date", plus14),
        supabase
          .from("event_tasks")
          .select(taskSelect)
          .eq("assigned_to", profileId)
          .eq("completed", true)
          .gte("completed_at", minus7),
        supabase
          .from("event_confirmations")
          .select("id, subject_id, status, event_plan_id, responded_at")
          .eq("user_id", profileId)
          .eq("ministry_id", ministryId)
          .in("status", ["requested", "escalated"]),
        supabase
          .from("event_confirmations")
          .select("id, subject_id, status, event_plan_id, responded_at")
          .eq("user_id", profileId)
          .eq("ministry_id", ministryId)
          .in("status", ["confirmed", "declined"])
          .gte("responded_at", minus7),
      ])

    const eventTitleOf = (row: Record<string, unknown>): string => {
      const ep = row.event_plans as { calendar_events?: { title?: string } | { title?: string }[] } | null
      const ce = Array.isArray(ep?.calendar_events) ? ep?.calendar_events[0] : ep?.calendar_events
      return ce?.title ?? ""
    }
    const mapTask = (row: Record<string, unknown>): DeadlineItem => ({
      kind: "task",
      id: row.id as string,
      title: (row.title as string) || "Task",
      context: eventTitleOf(row),
      dueDate: (row.due_date as string | null) ?? null,
      completed: (row.completed as boolean) ?? false,
      completedAt: (row.completed_at as string | null) ?? null,
    })

    const confRows = [...(awaiting ?? []), ...(resolved ?? [])] as {
      id: string
      subject_id: string
      status: ConfStatus
      event_plan_id: string
      responded_at: string | null
    }[]

    // Resolve role_name (polymorphic subject → no FK) + event title/date per plan.
    const roleIds = [...new Set(confRows.map((c) => c.subject_id))]
    const planIds = [...new Set(confRows.map((c) => c.event_plan_id))]
    const [{ data: roleRows }, { data: planRows }] = await Promise.all([
      roleIds.length
        ? supabase.from("event_roles").select("id, role_name").in("id", roleIds)
        : Promise.resolve({ data: [] as { id: string; role_name: string }[] }),
      planIds.length
        ? supabase
            .from("event_plans")
            .select("id, calendar_events(title, start_date)")
            .in("id", planIds)
        : Promise.resolve({ data: [] as Record<string, unknown>[] }),
    ])
    const roleName = new Map((roleRows ?? []).map((r) => [r.id, r.role_name]))
    const planInfo = new Map<string, { title: string; startDate: string | null }>()
    for (const p of (planRows ?? []) as Record<string, unknown>[]) {
      const ce = p.calendar_events as { title?: string; start_date?: string } | { title?: string; start_date?: string }[] | null
      const c = Array.isArray(ce) ? ce[0] : ce
      planInfo.set(p.id as string, { title: c?.title ?? "", startDate: c?.start_date ?? null })
    }

    const confItems: DeadlineItem[] = confRows.map((c) => {
      const info = planInfo.get(c.event_plan_id)
      return {
        kind: "confirmation",
        id: c.id,
        roleName: roleName.get(c.subject_id) ?? "your role",
        eventTitle: info?.title ?? "your event",
        eventDate: info?.startDate ?? null,
        status: c.status,
        respondedAt: c.responded_at,
      }
    })

    return [
      ...((openTasks ?? []) as unknown as Record<string, unknown>[]).map(mapTask),
      ...((doneTasks ?? []) as unknown as Record<string, unknown>[]).map(mapTask),
      ...confItems,
    ]
  }

  const { data, mutate } = useSWR(["my-deadlines", ministryId, profileId], loadDeadlines)
  const items = useMemo(() => sortItems(data ?? []), [data])

  const openCount = items.filter((it) => rankOf(it) < 3).length
  const doneCount = items.filter((it) => rankOf(it) === 3).length

  // ── Optimistic taps ─────────────────────────────────────────────────────────
  async function toggleTask(id: string, completed: boolean) {
    if (!data) return
    const optimistic = data.map((it) =>
      it.kind === "task" && it.id === id
        ? { ...it, completed, completedAt: completed ? new Date().toISOString() : null }
        : it,
    )
    await mutate(
      async () => {
        const res = await completeTaskAction(id, completed)
        if ("error" in res) throw new Error(res.error)
        return optimistic
      },
      { optimisticData: optimistic, rollbackOnError: true, revalidate: false },
    )
  }

  async function respondConfirmation(id: string, status: "confirmed" | "declined") {
    if (!data) return
    const now = new Date().toISOString()
    const optimistic = data.map((it) =>
      it.kind === "confirmation" && it.id === id ? { ...it, status, respondedAt: now } : it,
    )
    await mutate(
      async () => {
        // Own-row UPDATE under event_confirmations_update_own (column grant allows
        // status/responded_at/note). Ministry-scoped for defense-in-depth.
        const { error } = await supabase
          .from("event_confirmations")
          .update({ status, responded_at: now })
          .eq("id", id)
          .eq("user_id", profileId)
          .eq("ministry_id", ministryId)
        if (error) throw error
        return optimistic
      },
      { optimisticData: optimistic, rollbackOnError: true, revalidate: false },
    )
  }

  if (!data) return null // parent home payload shows its own skeleton; stay quiet until ready

  const empty = items.length === 0
  const countMeta = `${openCount} open · ${doneCount} done`

  // ══════════════════════════════════════════════════════════════ DESKTOP ══
  if (variant === "desktop") {
    return (
      <div style={{ marginTop: 36 }}>
        <SectionHeader
          eyebrow="Deadlines"
          title="My deadlines"
          action={<span style={{ fontSize: 13, color: "var(--muted-text)", fontFamily: "var(--sans)" }}>{countMeta}</span>}
          style={{ marginBottom: 6 }}
        />
        <p style={{ fontSize: 14, color: "var(--body)", margin: "0 0 16px", fontFamily: "var(--sans)" }}>
          Everything you owe, most urgent first.
        </p>

        {empty ? (
          <EmptyState
            icon={<CalendarCheck style={{ width: 22, height: 22 }} strokeWidth={1.6} />}
            title="You're all caught up"
            subtitle="New deadlines land here the moment a leader sets them."
          />
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {items.map((it, i) => (
              <DesktopRow
                key={`${it.kind}-${it.id}`}
                item={it}
                last={i === items.length - 1}
                onToggleTask={toggleTask}
                onRespond={respondConfirmation}
              />
            ))}
          </div>
        )}
      </div>
    )
  }

  // ══════════════════════════════════════════════════════════════ MOBILE ══
  const openItems = items.filter((it) => rankOf(it) < 3)
  const doneItems = items.filter((it) => rankOf(it) === 3)
  return (
    <section>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 12 }}>
        <span style={{ fontFamily: "var(--serif)", fontSize: 19, fontWeight: 600, color: "var(--ink)", letterSpacing: "-0.01em" }}>
          My deadlines
        </span>
        {!empty && (
          <span style={{ fontSize: 13, color: "var(--muted-text)", fontFamily: "var(--sans)" }}>{countMeta}</span>
        )}
      </div>

      {empty ? (
        <EmptyState
          icon={<CalendarCheck style={{ width: 22, height: 22 }} strokeWidth={1.6} />}
          title="You're all caught up"
          subtitle="New deadlines land here the moment a leader sets them."
        />
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {/* Task rows grouped in one tonal card; confirmation rows are their own cards. */}
          {(() => {
            const openTaskItems = openItems.filter((it) => it.kind === "task")
            const openConfItems = openItems.filter((it) => it.kind === "confirmation")
            return (
              <>
                {openTaskItems.length > 0 && (
                  <PocketRowCard>
                    {openTaskItems.map((it, i) => (
                      <MobileTaskRow key={it.id} item={it} last={i === openTaskItems.length - 1} onToggleTask={toggleTask} />
                    ))}
                  </PocketRowCard>
                )}
                {openConfItems.map((it) => (
                  <MobileConfirmationCard key={it.id} item={it} onRespond={respondConfirmation} />
                ))}
                {doneItems.length > 0 && (
                  <PocketRowCard>
                    {doneItems.map((it, i) => (
                      <MobileDoneRow key={`${it.kind}-${it.id}`} item={it} last={i === doneItems.length - 1} />
                    ))}
                  </PocketRowCard>
                )}
              </>
            )
          })()}
        </div>
      )}
    </section>
  )
}

// ── Desktop row ───────────────────────────────────────────────────────────────
function DesktopRow({
  item,
  last,
  onToggleTask,
  onRespond,
}: {
  item: DeadlineItem
  last: boolean
  onToggleTask: (id: string, completed: boolean) => void
  onRespond: (id: string, status: "confirmed" | "declined") => void
}) {
  const isDone = rankOf(item) === 3
  const showDot =
    (item.kind === "task" && !item.completed && isUrgentTask(item.dueDate)) ||
    (item.kind === "confirmation" && (item.status === "requested" || item.status === "escalated"))

  // Due stamp (col 1)
  let d1 = ""
  let d1Color = "var(--ink)"
  let d2 = ""
  if (item.kind === "task") {
    if (item.completed) {
      d1 = "DONE"; d1Color = "var(--muted-text)"; d2 = item.completedAt ? absLabel(item.completedAt) : ""
    } else if (item.dueDate) {
      d1 = relLabel(item.dueDate); d1Color = isUrgentTask(item.dueDate) ? "var(--plum)" : "var(--ink)"; d2 = absLabel(item.dueDate)
    }
  } else if (item.eventDate) {
    d1 = relLabel(item.eventDate); d1Color = "var(--ink)"; d2 = absLabel(item.eventDate)
  }

  const title = item.kind === "task" ? item.title : item.roleName
  const sub = item.kind === "task" ? item.context : item.eventTitle

  return (
    <ListRow
      last={last}
      hover={false}
      style={{ display: "grid", gridTemplateColumns: "16px 74px 1fr auto", alignItems: "center", gap: 14, padding: "14px 18px" }}
    >
      {/* Col 0 — urgency dot */}
      <span>{showDot && <span style={{ display: "block", width: 8, height: 8, borderRadius: 999, background: "var(--plum)" }} />}</span>

      {/* Col 1 — due stamp */}
      <div>
        {d1 && <div style={{ ...MONO_STYLE, fontSize: 12, color: d1Color }}>{d1}</div>}
        {d2 && <div style={{ ...MONO_STYLE, fontSize: 10, color: "var(--muted-text)", marginTop: 2 }}>{d2}</div>}
      </div>

      {/* Col 2 — what */}
      <div style={{ minWidth: 0 }}>
        <div
          className="line-clamp-1"
          style={{ fontFamily: "var(--serif)", fontSize: 15, fontWeight: 500, lineHeight: 1.3, color: isDone ? "var(--body)" : "var(--ink)" }}
        >
          {title}
        </div>
        {sub && <div className="line-clamp-1" style={{ fontSize: 12, color: "var(--muted-text)", marginTop: 3, fontFamily: "var(--sans)" }}>{sub}</div>}
      </div>

      {/* Col 3 — action */}
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        {item.kind === "task" ? (
          item.completed ? (
            <DoneChip />
          ) : (
            <button
              onClick={() => onToggleTask(item.id, true)}
              aria-label="Mark done"
              title="Mark done"
              style={{ background: "none", border: "none", cursor: "pointer", display: "grid", placeItems: "center", color: "var(--muted-text)", padding: 2 }}
            >
              <Circle style={{ width: 20, height: 20 }} strokeWidth={1.6} />
            </button>
          )
        ) : item.status === "requested" || item.status === "escalated" ? (
          <>
            <CentralButton variant="primary" size="sm" onClick={() => onRespond(item.id, "confirmed")}>Confirm</CentralButton>
            <CentralButton variant="quiet" size="sm" onClick={() => onRespond(item.id, "declined")} style={{ padding: "8px 10px" }}>Decline</CentralButton>
          </>
        ) : (
          <span style={{ fontSize: 13, fontWeight: 500, color: STATUS_TEXT[item.status].color, fontFamily: "var(--sans)" }}>
            {STATUS_TEXT[item.status].label}
          </span>
        )}
      </div>
    </ListRow>
  )
}

function DoneChip() {
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 12, color: "var(--muted-text)", fontFamily: "var(--sans)" }}>
      <Check style={{ width: 14, height: 14 }} strokeWidth={2} /> Done
    </span>
  )
}

// ── Mobile rows ───────────────────────────────────────────────────────────────
function TaskCheckbox({ checked, onClick }: { checked: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      aria-label={checked ? "Mark not done" : "Mark done"}
      style={{ flexShrink: 0, width: 44, height: 44, display: "grid", placeItems: "center", background: "none", border: "none", cursor: "pointer" }}
    >
      <span
        style={{
          width: 22, height: 22, borderRadius: "var(--r-check)", display: "grid", placeItems: "center",
          border: checked ? "none" : "1.5px solid var(--line-2)",
          background: checked ? "var(--plum)" : "transparent",
          color: "var(--cream)",
        }}
      >
        {checked && <Check style={{ width: 14, height: 14 }} strokeWidth={2.5} />}
      </span>
    </button>
  )
}

function MobileTaskRow({ item, last, onToggleTask }: { item: DeadlineItem & { kind: "task" }; last: boolean; onToggleTask: (id: string, completed: boolean) => void }) {
  const urgent = isUrgentTask(item.dueDate)
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 0", borderBottom: last ? "none" : "1px solid var(--line-3)" }}>
      <span style={{ flex: 1, minWidth: 0 }}>
        <span style={{ display: "flex", alignItems: "center", gap: 6, minWidth: 0 }}>
          <span className="line-clamp-1" style={{ fontSize: 15, fontWeight: 600, letterSpacing: "-0.01em", color: "var(--ink)" }}>{item.title}</span>
          {urgent && <span style={{ width: 8, height: 8, borderRadius: 999, background: "var(--plum)", flexShrink: 0 }} />}
        </span>
        {item.context && <span className="line-clamp-1" style={{ display: "block", fontSize: 13, color: "var(--muted-text)", marginTop: 2 }}>{item.context}</span>}
      </span>
      {item.dueDate && <span style={{ fontSize: 11, color: "var(--faint)", flexShrink: 0, ...MONO_STYLE }}>{relLabel(item.dueDate)}</span>}
      <TaskCheckbox checked={false} onClick={() => onToggleTask(item.id, true)} />
    </div>
  )
}

function MobileConfirmationCard({ item, onRespond }: { item: DeadlineItem & { kind: "confirmation" }; onRespond: (id: string, status: "confirmed" | "declined") => void }) {
  const awaiting = item.status === "requested" || item.status === "escalated"
  return (
    <PocketCard>
      <div style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
        <span style={{ flex: 1, minWidth: 0 }}>
          <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <span className="line-clamp-1" style={{ fontSize: 15, fontWeight: 600, letterSpacing: "-0.01em", color: "var(--ink)" }}>{item.roleName}</span>
            {awaiting && <span style={{ width: 8, height: 8, borderRadius: 999, background: "var(--plum)", flexShrink: 0 }} />}
          </span>
          <span className="line-clamp-1" style={{ display: "block", fontSize: 13, color: "var(--muted-text)", marginTop: 2 }}>{item.eventTitle}</span>
        </span>
      </div>
      {awaiting ? (
        <div style={{ display: "flex", gap: 8, marginTop: 14 }}>
          <button
            onClick={() => onRespond(item.id, "confirmed")}
            style={{ flex: 1, minHeight: 44, borderRadius: 999, border: "none", background: "var(--plum)", color: "var(--cream)", fontSize: 13.5, fontWeight: 600, fontFamily: "var(--sans)", cursor: "pointer" }}
          >
            Confirm
          </button>
          <button
            onClick={() => onRespond(item.id, "declined")}
            style={{ flex: 1, minHeight: 44, borderRadius: 999, border: "none", background: "var(--cream-panel)", color: "var(--plum)", fontSize: 13.5, fontWeight: 600, fontFamily: "var(--sans)", cursor: "pointer" }}
          >
            Decline
          </button>
        </div>
      ) : (
        <div style={{ marginTop: 10, fontSize: 13, fontWeight: 500, color: STATUS_TEXT[item.status].color, fontFamily: "var(--sans)" }}>
          {STATUS_TEXT[item.status].label}
        </div>
      )}
    </PocketCard>
  )
}

function MobileDoneRow({ item, last }: { item: DeadlineItem; last: boolean }) {
  const title = item.kind === "task" ? item.title : item.roleName
  const sub = item.kind === "task" ? item.context : STATUS_TEXT[item.status].label
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 0", borderBottom: last ? "none" : "1px solid var(--line-3)" }}>
      <CheckCircle2 style={{ width: 18, height: 18, color: "var(--muted-text)", flexShrink: 0 }} strokeWidth={1.8} />
      <span style={{ flex: 1, minWidth: 0 }}>
        <span className="line-clamp-1" style={{ display: "block", fontSize: 15, fontWeight: 600, letterSpacing: "-0.01em", color: "var(--body)" }}>{title}</span>
        {sub && <span className="line-clamp-1" style={{ display: "block", fontSize: 13, color: "var(--muted-text)", marginTop: 2 }}>{sub}</span>}
      </span>
    </div>
  )
}
