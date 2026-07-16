"use client"

// Run Sheet P2 — the compile-review modal.
//
// Opened from the EventPlanWorkspace Overview "Compile playbook" button once an event
// date has passed. Presents the source plan's tasks with their computed T-minus offsets
// (planned vs actual, one-tap adopt), a brief textarea per task, and the matching
// transition_notes as attachable brief candidates. On "Compile playbook" it hands the
// leader's curated choices to compileEventTemplateAction — v1 scope is accept-all + edit
// briefs + planned/actual toggle; no deep reordering.

import { useEffect, useMemo, useState } from "react"
import { createClient } from "@/lib/supabase"
import { CentralModal, CentralButton, FilterChip, Textarea } from "@/components/central"
import { compileEventTemplateAction, type CompileCurated } from "@/app/actions/event-templates"
import type { CalendarEvent, TransitionNote } from "../types"

// ── PT calendar-date helpers (mirror the server action, client-side preview) ──
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
// Render an offset as T±N (negative = before the event); null → "no date".
function fmtOffset(n: number | null): string {
  if (n === null) return "no date"
  if (n === 0) return "T0"
  return n < 0 ? `T−${Math.abs(n)}` : `T+${n}`
}

const PHASE_LABEL: Record<string, string> = {
  pre_event: "Pre-event",
  day_of: "Day-of",
  post_event: "Post-event",
  followup: "Follow-up",
}

type SourceTask = {
  id: string
  title: string
  phase: string | null
  due_date: string | null
  completed: boolean | null
  completed_at: string | null
  sort_order: number | null
}

type Row = {
  task: SourceTask
  planned: number | null
  actual: number | null
  brief: string
  useActual: boolean
}

export function EventCompileModal({
  eventPlanId,
  calendarEvent,
  ministryId,
  teamId,
  onClose,
  onCompiled,
}: {
  eventPlanId: string
  calendarEvent: CalendarEvent
  ministryId: string
  teamId: string | null
  onClose: () => void
  onCompiled?: (templateId: string) => void
}) {
  const supabase = createClient()
  const eventDate = ptYMD(calendarEvent.start_date)

  const [loading, setLoading] = useState(true)
  const [rows, setRows] = useState<Row[]>([])
  const [roles, setRoles] = useState<{ id: string; role_name: string }[]>([])
  const [candidates, setCandidates] = useState<TransitionNote[]>([])
  const [attached, setAttached] = useState<Set<string>>(new Set())
  const [focusedTaskId, setFocusedTaskId] = useState<string | null>(null)
  const [replacedName, setReplacedName] = useState<string | null>(null)
  const [name, setName] = useState(calendarEvent.title)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      setLoading(true)
      const [{ data: taskData }, { data: roleData }, { data: existing }] = await Promise.all([
        supabase
          .from("event_tasks")
          .select("id, title, phase, due_date, completed, completed_at, sort_order")
          .eq("event_plan_id", eventPlanId)
          .order("sort_order", { ascending: true }),
        supabase
          .from("event_roles")
          .select("id, role_name")
          .eq("event_plan_id", eventPlanId)
          .order("created_at", { ascending: true }),
        (teamId
          ? supabase.from("event_templates").select("name").eq("ministry_id", ministryId).eq("event_type", calendarEvent.event_type).eq("team_id", teamId)
          : supabase.from("event_templates").select("name").eq("ministry_id", ministryId).eq("event_type", calendarEvent.event_type).is("team_id", null)
        ).maybeSingle(),
      ])

      // Transition-note brief candidates (ministry + event_type [+ team_id]).
      let tnQuery = supabase
        .from("transition_notes")
        .select("*")
        .eq("ministry_id", ministryId)
        .eq("event_type", calendarEvent.event_type)
      tnQuery = teamId ? tnQuery.eq("team_id", teamId) : tnQuery.is("team_id", null)
      const { data: tnData } = await tnQuery.order("created_at", { ascending: false })

      if (cancelled) return

      const src = (taskData ?? []) as SourceTask[]
      setRows(
        src.map((t) => ({
          task: t,
          planned: t.due_date ? daysBetween(eventDate, t.due_date) : null,
          actual: t.completed && t.completed_at ? daysBetween(eventDate, ptYMD(t.completed_at)) : null,
          brief: "",
          useActual: false,
        })),
      )
      setRoles((roleData ?? []) as { id: string; role_name: string }[])
      setCandidates((tnData ?? []) as TransitionNote[])
      setReplacedName((existing?.name as string | null) ?? null)
      setLoading(false)
    })()
    return () => { cancelled = true }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [eventPlanId])

  const onTimePct = useMemo(() => {
    const eligible = rows.filter((r) => r.planned !== null && r.actual !== null)
    if (eligible.length === 0 || rows.length === 0) return null
    const onTime = eligible.filter((r) => (r.actual as number) <= (r.planned as number)).length
    return Math.round((onTime / rows.length) * 100)
  }, [rows])

  function setBrief(taskId: string, value: string) {
    setRows((prev) => prev.map((r) => (r.task.id === taskId ? { ...r, brief: value } : r)))
  }
  function toggleActual(taskId: string) {
    setRows((prev) => prev.map((r) => (r.task.id === taskId ? { ...r, useActual: !r.useActual } : r)))
  }

  // Drop a candidate note's text into the focused task's brief (append), marking it attached.
  function attachCandidate(note: TransitionNote) {
    if (!focusedTaskId) { setError("Tap a task's brief field first, then attach a note."); return }
    setError(null)
    const text = [note.watch_text, note.solved_text].filter(Boolean).join(" — ")
    setRows((prev) =>
      prev.map((r) =>
        r.task.id === focusedTaskId
          ? { ...r, brief: r.brief ? `${r.brief}\n${text}` : text }
          : r,
      ),
    )
    setAttached((prev) => new Set(prev).add(note.id))
  }

  async function handleCompile() {
    setSaving(true)
    setError(null)
    const extraNotes = candidates
      .filter((n) => !attached.has(n.id))
      .map((n) => ({ title: n.title, category: n.category, watch: n.watch_text, solved: n.solved_text, class_year: n.class_year }))
    const curated: CompileCurated = {
      name: name.trim() || calendarEvent.title,
      tasks: rows.map((r) => ({ taskId: r.task.id, brief: r.brief.trim() || null, useActual: r.useActual })),
      extraNotes,
    }
    const res = await compileEventTemplateAction(eventPlanId, curated)
    if ("error" in res) { setError(res.error); setSaving(false); return }
    onCompiled?.(res.templateId)
    onClose()
  }

  const dirty = rows.some((r) => r.brief.trim() || r.useActual) || name.trim() !== calendarEvent.title

  return (
    <CentralModal
      onClose={onClose}
      eyebrow="Compile playbook"
      title={`Compile playbook — ${calendarEvent.title}`}
      maxWidth={640}
      dirty={dirty && !saving}
      footer={
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 14, flexWrap: "wrap", width: "100%" }}>
          <span style={{ fontSize: 12, color: "var(--muted-text)" }}>
            {rows.length} task{rows.length === 1 ? "" : "s"} · {roles.length} role{roles.length === 1 ? "" : "s"}
            {onTimePct !== null && <> · {onTimePct}% on time</>}
          </span>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <CentralButton variant="secondary" size="sm" onClick={onClose}>Cancel</CentralButton>
            <CentralButton variant="primary" size="sm" onClick={handleCompile} disabled={saving || loading}>
              {saving ? "Compiling…" : "Compile playbook"}
            </CentralButton>
          </div>
        </div>
      }
    >
      <p style={{ fontSize: 13.5, color: "var(--body)", lineHeight: 1.5, margin: "0 0 18px", maxWidth: 480 }}>
        Save this event as {PHASE_LABEL[calendarEvent.event_type] ? "" : ""}<span style={{ fontWeight: 500 }}>{calendarEvent.event_type}</span>&apos;s reusable playbook. Next
        time you run this event, &ldquo;Run it back&rdquo; recreates these tasks and roles with dates recomputed from the offsets below.
      </p>

      {replacedName && (
        <div style={{ marginBottom: 18, padding: "11px 14px", background: "color-mix(in srgb, var(--plum) 8%, transparent)", border: "1px solid color-mix(in srgb, var(--plum) 22%, transparent)", borderRadius: 10, fontSize: 13, color: "var(--body)" }}>
          This replaces last year&apos;s <span style={{ fontWeight: 500, color: "var(--plum)" }}>{replacedName}</span> playbook for this team.
        </div>
      )}

      {loading ? (
        <p style={{ fontSize: 14, color: "var(--faint)", fontStyle: "italic" }}>Loading event…</p>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 22 }}>
          {/* Playbook name */}
          <div>
            <label style={labelStyle}>Playbook name</label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Spring Retreat"
              style={{ width: "100%", background: "var(--cream)", border: "1px solid var(--line-2)", borderRadius: "var(--r-input)", padding: "9px 13px", fontSize: 14, fontFamily: "var(--font-inter)", color: "var(--ink)", outline: "none", boxSizing: "border-box" }}
            />
          </div>

          {/* Brief candidate panel */}
          {candidates.length > 0 && (
            <div>
              <label style={labelStyle}>Brief candidates — tap a note to drop it into the focused task</label>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 8 }}>
                {candidates.map((n) => (
                  <FilterChip
                    key={n.id}
                    selected={attached.has(n.id)}
                    onClick={() => attachCandidate(n)}
                    tone="plum"
                    style={{ fontWeight: 500 }}
                  >
                    {attached.has(n.id) ? "✓ " : ""}{n.title}
                  </FilterChip>
                ))}
              </div>
              <p style={{ fontSize: 11.5, color: "var(--muted-text)", marginTop: 8 }}>
                Unattached notes are archived on the playbook as reference.
              </p>
            </div>
          )}

          {/* Task list */}
          <div>
            <label style={labelStyle}>Tasks &amp; timing</label>
            <div style={{ marginTop: 8, border: "1px solid var(--line-2)", borderRadius: 12, overflow: "hidden" }}>
              {rows.length === 0 ? (
                <p style={{ fontSize: 14, color: "var(--faint)", fontStyle: "italic", padding: "16px 14px", margin: 0 }}>No tasks on this event.</p>
              ) : rows.map((r, i) => {
                const hasActual = r.actual !== null
                return (
                  <div key={r.task.id} style={{ padding: "13px 14px", borderBottom: i === rows.length - 1 ? "none" : "1px solid var(--line-3)" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                      <span style={{ flex: 1, minWidth: 0, fontSize: 14.5, color: "var(--ink)", lineHeight: 1.35 }}>{r.task.title}</span>
                      <span style={{ fontFamily: "var(--mono)", fontSize: 10.5, letterSpacing: "0.05em", textTransform: "uppercase", color: "var(--muted-text)", background: "var(--ivory)", borderRadius: 999, padding: "2px 8px", whiteSpace: "nowrap" }}>
                        {PHASE_LABEL[r.task.phase ?? "pre_event"] ?? r.task.phase}
                      </span>
                      <span style={{ fontFamily: "var(--mono)", fontSize: 11.5, color: "var(--body)", whiteSpace: "nowrap" }}>
                        planned {fmtOffset(r.planned)} · done {fmtOffset(r.actual)}
                      </span>
                      <button
                        type="button"
                        onClick={() => hasActual && toggleActual(r.task.id)}
                        disabled={!hasActual}
                        title={hasActual ? "Adopt the actual timing as next year's plan" : "No completion date to adopt"}
                        style={{
                          fontFamily: "var(--mono)", fontSize: 10.5, letterSpacing: "0.04em", textTransform: "uppercase",
                          border: "1px solid " + (r.useActual ? "var(--plum)" : "var(--line-2)"),
                          background: r.useActual ? "color-mix(in srgb, var(--plum) 10%, transparent)" : "var(--cream)",
                          color: r.useActual ? "var(--plum)" : hasActual ? "var(--body)" : "var(--faint)",
                          borderRadius: 999, padding: "3px 10px", cursor: hasActual ? "pointer" : "default", whiteSpace: "nowrap",
                        }}
                      >
                        {r.useActual ? "using actual" : "use actual"}
                      </button>
                    </div>
                    <div style={{ marginTop: 9 }}>
                      <Textarea
                        value={r.brief}
                        onChange={(e) => setBrief(r.task.id, e.target.value)}
                        onFocus={() => setFocusedTaskId(r.task.id)}
                        rows={2}
                        placeholder="Brief — what the next class should know about this task…"
                        style={{ minHeight: 46, fontSize: 13.5, borderColor: focusedTaskId === r.task.id ? "var(--plum)" : undefined }}
                      />
                    </div>
                  </div>
                )
              })}
            </div>
          </div>

          {/* Roles preview */}
          {roles.length > 0 && (
            <div>
              <label style={labelStyle}>Roles that carry over</label>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 8 }}>
                {roles.map((r) => (
                  <span key={r.id} style={{ fontSize: 13, color: "var(--body)", background: "var(--ivory)", border: "1px solid var(--line-2)", borderRadius: 999, padding: "4px 12px", whiteSpace: "nowrap" }}>{r.role_name}</span>
                ))}
              </div>
            </div>
          )}

          {error && <p style={{ fontSize: 13, color: "var(--danger)", margin: 0 }}>{error}</p>}
        </div>
      )}
    </CentralModal>
  )
}

const labelStyle: React.CSSProperties = {
  fontSize: 11, fontFamily: "var(--mono)",
  letterSpacing: "0.06em", textTransform: "uppercase", color: "var(--muted-text)", marginBottom: 4, display: "block",
}
