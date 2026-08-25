"use client"

// ─── Meeting Notes v2 — digest list + Variant B structured editor ────────────
//
// Redesign (cdesign exploration: explorations/meeting-notes/Meeting Notes
// Redesign.html, reconciled manifest in .claude/task-context/meeting-notes/).
// List: month-grouped rows with a real digest — decision summary + count,
// linked-event chip, attendee avatars, derived Draft badge — replacing the
// old "title + date ×3" cards. Editor: pinned Agenda + Decisions sections
// above the freeform Tiptap Notes body; a linked event powers the digest chip
// and the "tasks live on the event" whisper. In-prose @-mentions are v2.
//
// Data: meeting_notes (+linked_event_id, attendees) with child tables
// meeting_note_agenda_items / meeting_note_decisions (RLS mirrors the parent).
// All client-side writes — same pattern the old section used.

import { useState, useEffect, useRef, useMemo, useCallback } from "react"
import useSWR from "swr"
import { Plus, X, ChevronRight, ArrowUpRight, Trash2 } from "lucide-react"
import type { Editor } from "@tiptap/core"
import { createClient } from "@/lib/supabase"
import { ActionMenu } from "@/components/central/action-menu"
import { SubpageShell, SerifInput, PocketRow, PocketRowCard, PocketButton, ConfirmDialog, POCKET_KICKER_STYLE } from "@/components/central"
import { EYEBROW_STYLE, MONO_STYLE } from "../components/shared"
import { getInitials } from "../utils"
import { useIsMobile } from "../use-is-mobile"
import { TiptapToolbar, MeetingNoteEditor } from "./note-editors"
import type { MeetingNote, MeetingAgendaItem, MeetingDecision } from "../types"

// ── Shared bits ──────────────────────────────────────────────────────────────

// §4.8: avatars are plum MonogramChip grammar — uniform plum (multi-hue palette
// is UNSURE-1 in the reconciliation manifest, awaiting ratification).
const AV_BG = "var(--plum)"

function Avatar({ name, size = 24 }: { name: string; size?: number }) {
  return (
    <span
      title={name}
      style={{
        width: size, height: size, borderRadius: "50%", display: "grid", placeItems: "center",
        fontSize: 10, fontWeight: 600, color: "var(--cream-on-dark)",
        background: AV_BG, flexShrink: 0,
      }}
    >
      {getInitials(name)}
    </span>
  )
}

function AvatarStack({ people, size = 24 }: { people: { id: string; name: string }[]; size?: number }) {
  if (people.length === 0) return null
  return (
    <span style={{ display: "flex" }}>
      {people.slice(0, 5).map((p, i) => (
        <span key={p.id} style={{ marginLeft: i === 0 ? 0 : -7, border: "1.5px solid var(--cream)", borderRadius: "50%", display: "inline-flex" }}>
          <Avatar name={p.name} size={size} />
        </span>
      ))}
    </span>
  )
}

const todayYMD = () => {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`
}

// A note is a live draft while it has no decisions and its meeting date hasn't passed.
function isDraft(note: MeetingNote, decisionCount: number): boolean {
  return decisionCount === 0 && note.date >= todayYMD()
}

// ── Debounced text saves ─────────────────────────────────────────────────────
// The optimistic cache patch stays IMMEDIATE (every keystroke); only the
// Supabase UPDATE is deferred, on the same 400ms beat the title field already
// uses. Agenda item text used to issue one UPDATE per keystroke — a
// 40-character edit was 40 round trips.
//
// Keyed per (row, field-set) so editing an item's text and its detail line
// inside one window can't cancel each other, and pending writes FLUSH on
// unmount: navigating back within 400ms of the last keystroke must not
// silently drop the edit.
const SAVE_DEBOUNCE_MS = 400

type PendingWrite = () => Promise<void>

function useDebouncedSave(delay = SAVE_DEBOUNCE_MS) {
  const pending = useRef(new Map<string, { timer: ReturnType<typeof setTimeout>; run: PendingWrite }>())
  useEffect(() => {
    const map = pending.current
    return () => {
      map.forEach(({ timer, run }) => { clearTimeout(timer); void run() })
      map.clear()
    }
  }, [])
  return useCallback((key: string, run: PendingWrite) => {
    const prev = pending.current.get(key)
    if (prev) clearTimeout(prev.timer)
    const timer = setTimeout(() => { pending.current.delete(key); void run() }, delay)
    pending.current.set(key, { timer, run })
  }, [delay])
}

// ── Fetchers ─────────────────────────────────────────────────────────────────

// List payload: notes + per-note decisions (digest) + linked-event titles.
async function fetchNotesDigest([, teamId]: readonly [string, string]) {
  const supabase = createClient()
  const { data: notes } = await supabase
    .from("meeting_notes")
    .select("*")
    .eq("team_id", teamId)
    .order("date", { ascending: false })
    .order("created_at", { ascending: false })
  const list = (notes ?? []) as MeetingNote[]
  const ids = list.map(n => n.id)

  // Plain objects, NOT Maps: SWR's deep-compare can't see into Map contents,
  // so a Map-carrying payload compares "unchanged" and revalidations never
  // re-render (stale digest counts after editing — the bug this fixes).
  const decisionsByNote: Record<string, MeetingDecision[]> = {}
  if (ids.length) {
    const { data: decs } = await supabase
      .from("meeting_note_decisions")
      .select("*")
      .in("note_id", ids)
      .order("sort_order", { ascending: true })
    for (const d of (decs ?? []) as MeetingDecision[]) {
      ;(decisionsByNote[d.note_id] ??= []).push(d)
    }
  }

  const eventIds = [...new Set(list.map(n => n.linked_event_id).filter(Boolean))] as string[]
  const eventTitles: Record<string, string> = {}
  if (eventIds.length) {
    const { data: evs } = await supabase.from("calendar_events").select("id, title").in("id", eventIds)
    for (const e of (evs ?? []) as { id: string; title: string }[]) eventTitles[e.id] = e.title
  }

  const personIds = [...new Set(list.flatMap(n => [...(n.attendees ?? []), n.updated_by ?? n.created_by].filter(Boolean)))] as string[]
  const personNames: Record<string, string> = {}
  if (personIds.length) {
    const { data: profs } = await supabase.from("profiles").select("id, name").in("id", personIds)
    for (const p of (profs ?? []) as { id: string; name: string }[]) personNames[p.id] = p.name
  }

  return { notes: list, decisionsByNote, eventTitles, personNames }
}

// Editor payload for one note: agenda + decisions.
async function fetchNoteSections([, noteId]: readonly [string, string]) {
  const supabase = createClient()
  const [{ data: agenda }, { data: decisions }] = await Promise.all([
    supabase.from("meeting_note_agenda_items").select("*").eq("note_id", noteId).order("sort_order", { ascending: true }),
    supabase.from("meeting_note_decisions").select("*").eq("note_id", noteId).order("sort_order", { ascending: true }),
  ])
  return {
    agenda: (agenda ?? []) as MeetingAgendaItem[],
    decisions: (decisions ?? []) as MeetingDecision[],
  }
}

// ── Editor sections (Variant B) ──────────────────────────────────────────────

const SECHEAD: React.CSSProperties = { display: "flex", alignItems: "baseline", gap: 12, marginBottom: 12 }
const SECKICKER: React.CSSProperties = { ...EYEBROW_STYLE, fontSize: 11, letterSpacing: "0.14em" }
const SECRULE: React.CSSProperties = { flex: 1, height: 1, background: "var(--line)" }
const SECHINT: React.CSSProperties = { fontSize: 12, color: "var(--muted-text)" }

function SectionHead({ kicker, hint }: { kicker: string; hint?: string }) {
  return (
    <div style={SECHEAD}>
      <span style={SECKICKER}>{kicker}</span>
      <div style={SECRULE} />
      {hint && <span style={SECHINT}>{hint}</span>}
    </div>
  )
}

// Borderless auto-growing text field. Same inline, chromeless treatment as the
// agenda item's <input>, but a decision is a SENTENCE: it WRAPS today, and at
// phone width almost every decision is two lines, so a single-line <input>
// would collapse it into a horizontally scrolling sliver. Enter commits
// (blurs) rather than inserting a newline — a decision stays one paragraph.
function GrowText({
  value, onChange, placeholder, style,
}: {
  value: string
  onChange: (v: string) => void
  placeholder?: string
  style?: React.CSSProperties
}) {
  const ref = useRef<HTMLTextAreaElement | null>(null)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    el.style.height = "0px"
    el.style.height = `${el.scrollHeight}px`
  }, [value])
  return (
    <textarea
      ref={ref}
      rows={1}
      value={value}
      placeholder={placeholder}
      onChange={e => onChange(e.target.value)}
      onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); e.currentTarget.blur() } }}
      style={{ width: "100%", background: "none", border: "none", outline: "none", fontFamily: "var(--sans)", padding: 0, resize: "none", overflow: "hidden", display: "block", ...style }}
    />
  )
}

// §14 inline two-step remove for a DENSE row (agenda item / decision) — a modal
// would be overkill here, and firing the delete on the first click (what these
// rows used to do) is exactly what §14 forbids.
//
// Visibility: hover-revealed on desktop, ALWAYS visible on touch — there is no
// hover on a phone, so the hover-only gate made these unreachable there.
//
// Touch target: the glyph stays 13px, but on touch the button CLAIMS a 44px-wide
// layout box (glyph pinned to its right edge, so nothing moves visually) and the
// transparent expander is pinned to that box's own left/right edges. Centring an
// oversized 44×44 overlay on the glyph instead — the first shape of this — hung
// ~15px of live hit area over the agenda text field beside it and over the
// decision card above, where a positioned element wins hit-testing against a
// static sibling and a tap at the end of a line armed the wrong remove. A real
// flex box costs the text field 31px of width and cannot overlap anything.
function RowRemove({
  label, visible, confirming, deleting, touch, onArm, onCancel, onConfirm, top = 4,
}: {
  label: string
  visible: boolean
  confirming: boolean
  deleting: boolean
  touch: boolean
  onArm: () => void
  onCancel: () => void
  onConfirm: () => void
  top?: number
}) {
  if (confirming) {
    return (
      <div style={{ display: "flex", alignItems: "center", gap: 5, flexShrink: 0, paddingTop: Math.max(top - 2, 0) }}>
        <button
          type="button"
          onClick={onConfirm}
          disabled={deleting}
          style={{
            fontSize: 11, fontWeight: 600, color: "var(--danger)",
            background: "color-mix(in srgb, var(--danger) 7%, var(--cream))",
            border: "1px solid color-mix(in srgb, var(--danger) 28%, transparent)",
            borderRadius: 6, padding: "3px 8px", cursor: deleting ? "default" : "pointer",
            whiteSpace: "nowrap", opacity: deleting ? 0.5 : 1,
          }}
        >
          {deleting ? "Deleting…" : "Delete"}
        </button>
        <button
          type="button"
          onClick={onCancel}
          style={{ fontSize: 11, color: "var(--muted-text)", background: "none", border: "none", cursor: "pointer", padding: "3px 4px" }}
        >
          Cancel
        </button>
      </div>
    )
  }
  if (!visible) return null
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onArm}
      style={{
        color: "var(--faint)", cursor: "pointer", paddingTop: top, position: "relative", flexShrink: 0,
        ...(touch ? { width: 44, display: "flex", justifyContent: "flex-end", alignItems: "flex-start" } : null),
      }}
    >
      <X style={{ width: 13, height: 13 }} />
      {touch && (
        <span aria-hidden style={{ position: "absolute", left: 0, right: 0, top: "50%", height: 44, transform: "translateY(-50%)" }} />
      )}
    </button>
  )
}

export function MeetingNoteDetail({
  note,
  teamId,
  userId,
  userName,
  onBack,
  onSaveTitle,
  onSaveBody,
  onSaveDate,
  onDeleteNote,
  onNoteMetaChange,
  onOpenEvent,
  canWrite = true,
}: {
  note: MeetingNote
  teamId: string | null
  userId: string
  userName: string
  onBack: () => void
  onSaveTitle: (id: string, title: string) => Promise<void>
  onSaveBody: (id: string, body: string) => Promise<void>
  /** Persist a new meeting DATE (plain YYYY-MM-DD) + re-sort the list cache. */
  onSaveDate: (id: string, date: string) => Promise<void>
  /** Delete the note. Resolves false when the write changed nothing (RLS). */
  onDeleteNote: (id: string) => Promise<boolean>
  /** Persist + reflect linked_event_id / attendees changes on the list cache. */
  onNoteMetaChange: (id: string, patch: Partial<MeetingNote>) => void
  onOpenEvent?: (eventId: string) => void
  canWrite?: boolean
}) {
  const supabase = createClient()
  const isMobile = useIsMobile()
  const saveLater = useDebouncedSave()
  const [localTitle, setLocalTitle] = useState(note.title)
  const titleSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
   
  useEffect(() => { setLocalTitle(note.title) }, [note.id, note.title])
  const [noteEditor, setNoteEditor] = useState<Editor | null>(null)

  // Live title co-edit: note-editors relays the collab channel's title
  // broadcasts as a `note-title-{id}` DOM event; we listen, and broadcast our
  // own debounced edits over the same `meeting-note-{id}` channel.
  useEffect(() => {
    const handler = (e: Event) => {
      const { title } = (e as CustomEvent).detail
      setLocalTitle(title)
    }
    window.addEventListener(`note-title-${note.id}`, handler)
    return () => window.removeEventListener(`note-title-${note.id}`, handler)
  }, [note.id])
  // ONE channel per note, reused for every keystroke and removed when the note
  // changes or unmounts. It used to call supabase.channel() inside the function
  // below — which fires on every keystroke in the title field, and each call
  // registers a NEW channel object on the client that nothing ever removed. A
  // 40-character title left 40 channels behind, plus one broadcast request each.
  const titleChanRef = useRef<ReturnType<typeof supabase.channel> | null>(null)
  useEffect(() => {
    const ch = supabase.channel(`meeting-note-${note.id}`)
    titleChanRef.current = ch
    return () => {
      titleChanRef.current = null
      supabase.removeChannel(ch)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [note.id])

  function broadcastTitle(title: string) {
    titleChanRef.current
      ?.send({ type: "broadcast", event: "title", payload: { title, userId } })
      .catch(() => {})
  }

  const { data: sections, mutate: mutateSections } = useSWR(
    ["meeting-note-sections", note.id] as const,
    fetchNoteSections,
  )
  const agenda = useMemo(() => sections?.agenda ?? [], [sections])
  const decisions = useMemo(() => sections?.decisions ?? [], [sections])

  // Attendee + team-member context (manual add) and linked-event context.
  const [members, setMembers] = useState<{ id: string; name: string }[]>([])
  useEffect(() => {
    if (!teamId) return
    supabase.from("team_members").select("user_id, profiles(name)").eq("team_id", teamId)
      .then(({ data }) => setMembers(((data ?? []) as { user_id: string; profiles: { name?: string } | null }[])
        .map(m => ({ id: m.user_id, name: m.profiles?.name ?? "Member" }))))
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [teamId])
  const [teamEvents, setTeamEvents] = useState<{ id: string; title: string; start_date: string }[]>([])
  useEffect(() => {
    if (!teamId) return
    supabase.from("calendar_events")
      .select("id, title, start_date")
      .eq("team_id", teamId)
      .is("parent_event_id", null)
      .order("start_date", { ascending: false })
      .limit(20)
      .then(({ data }) => setTeamEvents((data ?? []) as { id: string; title: string; start_date: string }[]))
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [teamId])
  const [linkedEventTitle, setLinkedEventTitle] = useState<string | null>(null)
  useEffect(() => {
    if (!note.linked_event_id) { setLinkedEventTitle(null); return }
    const known = teamEvents.find(e => e.id === note.linked_event_id)
    if (known) { setLinkedEventTitle(known.title); return }
    supabase.from("calendar_events").select("title").eq("id", note.linked_event_id).maybeSingle()
      .then(({ data }) => setLinkedEventTitle((data?.title as string | undefined) ?? null))
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [note.linked_event_id, teamEvents])

  const memberName = (id: string) => members.find(m => m.id === id)?.name ?? (id === userId ? userName : "Member")
  const attendees = note.attendees ?? []
  const attendeePeople = attendees.map(id => ({ id, name: memberName(id) }))

  // Editing anything marks you as attending (auto-collect); manual add/remove below.
  async function ensureAttendee() {
    if (!canWrite || attendees.includes(userId)) return
    const next = [...attendees, userId]
    onNoteMetaChange(note.id, { attendees: next })
    await supabase.from("meeting_notes").update({ attendees: next }).eq("id", note.id)
  }
  async function toggleAttendee(id: string) {
    const next = attendees.includes(id) ? attendees.filter(a => a !== id) : [...attendees, id]
    onNoteMetaChange(note.id, { attendees: next })
    await supabase.from("meeting_notes").update({ attendees: next }).eq("id", note.id)
  }
  async function setLinkedEvent(eventId: string | null) {
    onNoteMetaChange(note.id, { linked_event_id: eventId })
    await supabase.from("meeting_notes").update({ linked_event_id: eventId }).eq("id", note.id)
  }

  // ── Agenda CRUD ──
  async function addAgendaItem(text: string) {
    if (!text.trim()) return
    void ensureAttendee()
    const { data } = await supabase
      .from("meeting_note_agenda_items")
      .insert({ note_id: note.id, text: text.trim(), sort_order: agenda.length, created_by: userId })
      .select()
      .single()
    if (data) void mutateSections(prev => prev ? { ...prev, agenda: [...prev.agenda, data as MeetingAgendaItem] } : prev, { revalidate: false })
  }
  // A PostgREST query builder is a LAZY thenable — it only issues the HTTP
  // request when something awaits it or calls `.then()`. `void builder` does
  // NEITHER: it evaluates the expression and discards the value, so the PATCH
  // is constructed and thrown away and nothing is ever sent. Paired with an
  // optimistic cache patch that shape is silent data loss — the UI shows the
  // edit, a reload reveals the database never took it. Every write below is
  // `await`ed inside an async closure, and a failed one revalidates so the
  // cache can never keep showing a value the database refused.
  //
  // `debounce` is for TEXT fields only — a discrete toggle (done) writes at once.
  function patchAgendaItem(id: string, patch: Partial<MeetingAgendaItem>, debounce = false) {
    void mutateSections(prev => prev ? { ...prev, agenda: prev.agenda.map(a => a.id === id ? { ...a, ...patch } : a) } : prev, { revalidate: false })
    const write = async () => {
      const { error } = await supabase.from("meeting_note_agenda_items").update(patch).eq("id", id)
      if (error) void mutateSections()
    }
    if (debounce) saveLater(`agenda:${id}:${Object.keys(patch).join(",")}`, write)
    else void write()
  }
  function patchDecision(id: string, patch: Partial<MeetingDecision>, debounce = false) {
    void mutateSections(prev => prev ? { ...prev, decisions: prev.decisions.map(d => d.id === id ? { ...d, ...patch } : d) } : prev, { revalidate: false })
    const write = async () => {
      const { error } = await supabase.from("meeting_note_decisions").update(patch).eq("id", id)
      if (error) void mutateSections()
    }
    if (debounce) saveLater(`decision:${id}:${Object.keys(patch).join(",")}`, write)
    else void write()
  }
  async function removeAgendaItem(id: string) {
    void mutateSections(prev => prev ? { ...prev, agenda: prev.agenda.filter(a => a.id !== id) } : prev, { revalidate: false })
    await supabase.from("meeting_note_agenda_items").delete().eq("id", id)
  }

  // ── Decision CRUD ──
  async function addDecision(text: string) {
    if (!text.trim()) return
    void ensureAttendee()
    const { data } = await supabase
      .from("meeting_note_decisions")
      .insert({ note_id: note.id, text: text.trim(), sort_order: decisions.length, created_by: userId })
      .select()
      .single()
    if (data) void mutateSections(prev => prev ? { ...prev, decisions: [...prev.decisions, data as MeetingDecision] } : prev, { revalidate: false })
  }
  async function removeDecision(id: string) {
    void mutateSections(prev => prev ? { ...prev, decisions: prev.decisions.filter(d => d.id !== id) } : prev, { revalidate: false })
    await supabase.from("meeting_note_decisions").delete().eq("id", id)
  }

  const [agendaDraft, setAgendaDraft] = useState("")
  const [decisionDraft, setDecisionDraft] = useState("")
  const [hoveredAgenda, setHoveredAgenda] = useState<string | null>(null)
  const [hoveredDecision, setHoveredDecision] = useState<string | null>(null)
  // §14 two-step state shape — ONE `confirmRemoveId` (so only one row can be
  // armed at a time, agenda and decisions sharing it since ids are uuids) and a
  // separate `removingId` for the in-flight state.
  const [confirmRemoveId, setConfirmRemoveId] = useState<string | null>(null)
  const [removingId, setRemovingId] = useState<string | null>(null)
  // The agenda row the user is INSIDE (focus anywhere within it). On touch this
  // is what reveals the "detail…" line — a phone has no hover, but painting the
  // empty field on every row turns the note from a document into a form.
  const [activeAgenda, setActiveAgenda] = useState<string | null>(null)
  const [editingDate, setEditingDate] = useState(false)
  const [dateDraft, setDateDraft] = useState(note.date)
  const [confirmDeleteNote, setConfirmDeleteNote] = useState(false)
  const [deletingNote, setDeletingNote] = useState(false)
  const [deleteError, setDeleteError] = useState<string | null>(null)

  useEffect(() => { setDateDraft(note.date) }, [note.id, note.date])

  // A native date input emits COMPLETE, valid intermediate values while a year
  // is typed digit by digit — 0002-08-25, then 0020-…, then 0202-… — so a
  // per-keystroke write persists year 2 the instant the user tabs away
  // mid-entry, which is precisely the misfiling this affordance exists to fix
  // (and it fired four writes plus four digest re-sorts for one edit). The
  // value is held locally and committed ONCE, on blur or Enter, and a year
  // outside the plausible range is discarded rather than stored.
  function commitDate() {
    setEditingDate(false)
    const v = dateDraft
    const year = Number(v.slice(0, 4))
    if (!/^\d{4}-\d{2}-\d{2}$/.test(v) || year < 1900 || year > 2999) { setDateDraft(note.date); return }
    if (v === note.date) return
    void onSaveDate(note.id, v)
  }

  async function handleDeleteNote() {
    setDeletingNote(true)
    setDeleteError(null)
    const ok = await onDeleteNote(note.id)
    setDeletingNote(false)
    if (ok) { setConfirmDeleteNote(false); onBack(); return }
    setDeleteError("That didn't go through — the note is still here. Try again, or ask an admin.")
  }

  const noteDateLabel = (() => {
    const d = new Date(note.date + "T12:00:00")
    return `${d.toLocaleDateString("en-US", { weekday: "long" })} · ${d.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}`
  })()

  const px = isMobile ? 0 : 6

  return (
    <SubpageShell crumbs={[{ label: "Meeting Notes", onClick: onBack }, { label: note.title || "Untitled" }]} width="full">
      <div style={{ padding: `0 ${px}px` }}>
        {/* ── Meta row: date · attendees · linked event ── */}
        <div style={{ display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap" }}>
          {/* The meeting DATE is the affordance — a note written up two days
              after the meeting was permanently misfiled (it also sorts and
              month-groups off this). Resting appearance stays the MONO_STYLE
              label with a dashed underline, the same quiet weight as the
              "Edit"/"Link an event" pills beside it; click reveals a native
              date input. `meeting_notes.date` is a DATE column, so the value is
              a plain YYYY-MM-DD string end to end — <input type="date"> emits
              exactly that, and it must never round-trip through a Date
              (Convention #23). */}
          {!canWrite ? (
            <span style={MONO_STYLE}>{noteDateLabel}</span>
          ) : editingDate ? (
            <input
              type="date"
              autoFocus
              min="1900-01-01"
              max="2999-12-31"
              value={dateDraft}
              onChange={e => setDateDraft(e.target.value)}
              onBlur={commitDate}
              onKeyDown={e => {
                if (e.key === "Enter") commitDate()
                if (e.key === "Escape") { setDateDraft(note.date); setEditingDate(false) }
              }}
              style={{ ...MONO_STYLE, color: "var(--ink)", background: "none", border: "1px solid var(--line-2)", borderRadius: 8, padding: "3px 8px", outline: "none", minHeight: isMobile ? 44 : 30 }}
            />
          ) : (
            <button
              type="button"
              aria-label="Change the meeting date"
              onClick={() => setEditingDate(true)}
              style={{ ...MONO_STYLE, background: "none", border: "none", borderBottom: "1px dashed var(--dashed)", padding: "0 0 2px", cursor: "pointer", position: "relative" }}
            >
              {noteDateLabel}
              {/* ≥44px tap target without a visually bigger control — the label
                  is already ~180px wide, so the expander only has to grow
                  VERTICALLY, and it is pinned to the button's own left/right
                  edges so it can never reach a neighbour in the meta row. */}
              {isMobile && (
                <span aria-hidden style={{ position: "absolute", left: 0, right: 0, top: "50%", height: 44, transform: "translateY(-50%)" }} />
              )}
            </button>
          )}
          <span style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 14, color: "var(--body)" }}>
            <AvatarStack people={attendeePeople} />
            {attendeePeople.length > 0 && <span>{attendeePeople.length} attending</span>}
            {canWrite && (
              <ActionMenu
                align="left"
                minWidth={200}
                items={members.map(m => ({
                  key: m.id,
                  label: `${attendees.includes(m.id) ? "✓ " : ""}${m.name}`,
                  onSelect: () => { void toggleAttendee(m.id) },
                }))}
                renderTrigger={({ toggle }) => (
                  <button type="button" onClick={toggle} aria-label="Edit attendees"
                    style={{ fontSize: 12, color: "var(--muted-text)", border: "1px dashed var(--dashed)", borderRadius: 999, padding: "3px 10px", cursor: "pointer", background: "none" }}>
                    {attendeePeople.length === 0 ? "Add attendees" : "Edit"}
                  </button>
                )}
              />
            )}
          </span>
          <span style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 8 }}>
            {note.linked_event_id && linkedEventTitle ? (
              <span style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12, fontWeight: 500, background: "var(--plum-tint)", color: "var(--plum)", borderRadius: 999, padding: "4px 12px" }}>
                <button type="button" onClick={() => onOpenEvent?.(note.linked_event_id!)} style={{ color: "inherit", fontWeight: 500, cursor: "pointer" }}>
                  {linkedEventTitle}
                </button>
                {canWrite && (
                  <button type="button" aria-label="Unlink event" onClick={() => { void setLinkedEvent(null) }} style={{ display: "inline-flex", cursor: "pointer", color: "inherit", opacity: 0.7 }}>
                    <X style={{ width: 12, height: 12 }} />
                  </button>
                )}
              </span>
            ) : canWrite && (
              <ActionMenu
                align="right"
                minWidth={240}
                items={teamEvents.map(e => ({
                  key: e.id,
                  label: e.title,
                  onSelect: () => { void setLinkedEvent(e.id) },
                }))}
                renderTrigger={({ toggle }) => (
                  <button type="button" onClick={toggle}
                    style={{ fontSize: 12, color: "var(--muted-text)", border: "1px dashed var(--dashed)", borderRadius: 999, padding: "3px 12px", cursor: "pointer", background: "none" }}>
                    Link an event
                  </button>
                )}
              />
            )}
          </span>
        </div>

        {/* ── Title ── */}
        <SerifInput
          fontSize={isMobile ? 26 : 36}
          underline={false}
          value={localTitle}
          readOnly={!canWrite}
          onChange={e => {
            if (!canWrite) return
            setLocalTitle(e.target.value)
            if (titleSaveTimer.current) clearTimeout(titleSaveTimer.current)
            titleSaveTimer.current = setTimeout(() => {
              broadcastTitle(e.target.value)
              void onSaveTitle(note.id, e.target.value)
            }, 400)
          }}
          placeholder="Untitled meeting"
          style={{ fontWeight: 600, letterSpacing: "-0.02em", lineHeight: 1.15, padding: 0, display: "block", marginTop: 16 }}
        />

        {/* ── Agenda ── */}
        <div style={{ marginTop: 30 }}>
          <SectionHead kicker="Agenda" hint={canWrite ? "check off as you go" : undefined} />
          <div>
            {agenda.map((item, i) => (
              <div key={item.id}
                onMouseEnter={() => setHoveredAgenda(item.id)}
                onMouseLeave={() => setHoveredAgenda(null)}
                // React's onFocus/onBlur are focusIN/focusOUT — they bubble, so
                // this tracks focus anywhere in the row. The relatedTarget check
                // is what lets focus move from the item text to the detail line
                // without the detail line unmounting out from under the tap.
                onFocus={() => setActiveAgenda(item.id)}
                onBlur={e => { if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setActiveAgenda(null) }}
                style={{ display: "flex", gap: 13, alignItems: "flex-start", padding: "10px 2px", borderBottom: "1px solid var(--line-3)" }}>
                <button
                  type="button"
                  disabled={!canWrite}
                  aria-label={item.done ? "Mark not covered" : "Mark covered"}
                  onClick={() => { patchAgendaItem(item.id, { done: !item.done }) }}
                  style={{ fontFamily: "var(--mono)", fontSize: 12, color: item.done ? "var(--sage)" : "var(--muted-text)", width: 20, flexShrink: 0, paddingTop: 4, textAlign: "left", cursor: canWrite ? "pointer" : "default" }}
                >
                  {item.done ? "✓" : i + 1}
                </button>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <input
                    value={item.text}
                    readOnly={!canWrite}
                    onChange={e => { patchAgendaItem(item.id, { text: e.target.value }, true) }}
                    placeholder="Agenda item…"
                    style={{ width: "100%", background: "none", border: "none", outline: "none", fontSize: 15, lineHeight: 1.5, color: item.done ? "var(--body)" : "var(--ink)", fontFamily: "var(--sans)", padding: 0 }}
                  />
                  {/* The detail line reveals on hover OR on focus. Focus is
                      what makes it reachable on a phone, where there is no
                      hover — and it reveals it for the ONE row the user is in,
                      where `isMobile ||` painted an empty "detail…" placeholder
                      under every item and tipped the note from a document
                      toward a form. */}
                  {(item.sub_text !== null || activeAgenda === item.id || hoveredAgenda === item.id) && canWrite ? (
                    <input
                      value={item.sub_text ?? ""}
                      onChange={e => { patchAgendaItem(item.id, { sub_text: e.target.value || null }, true) }}
                      placeholder="detail…"
                      style={{ width: "100%", background: "none", border: "none", outline: "none", fontSize: 13, color: "var(--body)", fontFamily: "var(--sans)", padding: 0, marginTop: 3 }}
                    />
                  ) : item.sub_text ? (
                    <div style={{ fontSize: 13, color: "var(--body)", marginTop: 3, lineHeight: 1.45 }}>{item.sub_text}</div>
                  ) : null}
                </div>
                {canWrite && (
                  <RowRemove
                    label="Remove agenda item"
                    visible={isMobile || hoveredAgenda === item.id}
                    confirming={confirmRemoveId === item.id}
                    deleting={removingId === item.id}
                    touch={isMobile}
                    onArm={() => setConfirmRemoveId(item.id)}
                    onCancel={() => setConfirmRemoveId(null)}
                    onConfirm={async () => {
                      setRemovingId(item.id)
                      setConfirmRemoveId(null)
                      await removeAgendaItem(item.id)
                      setRemovingId(null)
                    }}
                  />
                )}
              </div>
            ))}
            {canWrite && (
              <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 2px" }}>
                <Plus style={{ width: 14, height: 14, color: "var(--faint)", flexShrink: 0 }} />
                <input
                  value={agendaDraft}
                  onChange={e => setAgendaDraft(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === "Enter" && agendaDraft.trim()) {
                      void addAgendaItem(agendaDraft)
                      setAgendaDraft("")
                    }
                  }}
                  placeholder={agenda.length === 0 ? "Add agenda item — anyone can add these before the meeting" : "Add agenda item…"}
                  style={{ flex: 1, background: "none", border: "none", outline: "none", fontSize: 14, color: "var(--body)", fontFamily: "var(--sans)", padding: 0 }}
                />
              </div>
            )}
            {!canWrite && agenda.length === 0 && (
              <p style={{ fontSize: 14, color: "var(--muted-text)", fontStyle: "italic", margin: "6px 0 0" }}>No agenda was set.</p>
            )}
          </div>
        </div>

        {/* ── Decisions ── */}
        <div style={{ marginTop: 34 }}>
          <SectionHead kicker="Decisions" hint="what the board settled" />
          {decisions.map(d => (
            <div key={d.id}
              onMouseEnter={() => setHoveredDecision(d.id)}
              onMouseLeave={() => setHoveredDecision(null)}
              style={{ display: "flex", gap: 13, alignItems: "flex-start", background: "var(--cream-3)", border: "1px solid var(--line)", borderRadius: 12, padding: "14px 18px", marginBottom: 9 }}>
              <span style={{ width: 8, height: 8, borderRadius: "50%", background: "var(--gold)", flexShrink: 0, marginTop: 7 }} />
              <div style={{ flex: 1, minWidth: 0, fontSize: 15, lineHeight: 1.5 }}>
                {/* Editable in place — the only correction path used to be
                    delete-and-retype. Mirrors the agenda item input. */}
                {canWrite ? (
                  <GrowText
                    value={d.text}
                    onChange={v => { patchDecision(d.id, { text: v }, true) }}
                    placeholder="Decision…"
                    style={{ fontSize: 15, lineHeight: 1.5, color: "var(--ink)" }}
                  />
                ) : d.text}
                <div style={{ fontSize: 12, color: "var(--muted-text)", marginTop: 4 }}>
                  {linkedEventTitle ? `Re: ${linkedEventTitle} · ` : ""}{memberName(d.created_by)}
                </div>
              </div>
              {canWrite && (
                <RowRemove
                  label="Remove decision"
                  visible={isMobile || hoveredDecision === d.id}
                  confirming={confirmRemoveId === d.id}
                  deleting={removingId === d.id}
                  touch={isMobile}
                  top={2}
                  onArm={() => setConfirmRemoveId(d.id)}
                  onCancel={() => setConfirmRemoveId(null)}
                  onConfirm={async () => {
                    setRemovingId(d.id)
                    setConfirmRemoveId(null)
                    await removeDecision(d.id)
                    setRemovingId(null)
                  }}
                />
              )}
            </div>
          ))}
          {canWrite && (
            <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 2px" }}>
              <Plus style={{ width: 14, height: 14, color: "var(--faint)", flexShrink: 0 }} />
              <input
                value={decisionDraft}
                onChange={e => setDecisionDraft(e.target.value)}
                onKeyDown={e => {
                  if (e.key === "Enter" && decisionDraft.trim()) {
                    void addDecision(decisionDraft)
                    setDecisionDraft("")
                  }
                }}
                placeholder={decisions.length === 0 ? "Record a decision — these become the note's summary" : "Record another decision…"}
                style={{ flex: 1, background: "none", border: "none", outline: "none", fontSize: 14, color: "var(--body)", fontFamily: "var(--sans)", padding: 0 }}
              />
            </div>
          )}
          {!canWrite && decisions.length === 0 && (
            <p style={{ fontSize: 14, color: "var(--muted-text)", fontStyle: "italic", margin: "6px 0 0" }}>No decisions were recorded.</p>
          )}
          {note.linked_event_id && linkedEventTitle && (
            <div style={{ display: "flex", gap: 9, alignItems: "flex-start", fontSize: 12, color: "var(--body)", lineHeight: 1.45, background: "var(--cream-2)", border: "1px solid var(--line-2)", borderRadius: 10, padding: "10px 14px", marginTop: 10 }}>
              <ArrowUpRight style={{ width: 13, height: 13, color: "var(--muted-text)", flexShrink: 0, marginTop: 1 }} />
              <span>
                Follow-up tasks belong on the event, not the note.{" "}
                <button type="button" onClick={() => onOpenEvent?.(note.linked_event_id!)} style={{ color: "var(--plum)", fontWeight: 500, cursor: "pointer" }}>
                  Open {linkedEventTitle} planning →
                </button>
              </span>
            </div>
          )}
        </div>

        {/* ── Notes (freeform Tiptap, collab channel preserved) ── */}
        <div style={{ marginTop: 34 }}>
          <SectionHead kicker="Notes" />
          {canWrite && <TiptapToolbar editor={noteEditor} flush />}
          <MeetingNoteEditor
            key={note.id}
            noteId={note.id}
            userId={userId}
            userName={userName}
            initialContent={note.body}
            onSave={(html) => { void ensureAttendee(); return onSaveBody(note.id, html) }}
            onEditorReady={setNoteEditor}
            canWrite={canWrite}
          />
        </div>

        {/* Danger zone (§4.20) — mono "Danger zone" eyebrow in --danger over an
            OUTLINE-only destructive button. Never a filled red, and never a bare
            trash glyph in the chrome row, where a one-tap destroy would sit
            next to navigation. It lives at the FOOT of the note at both widths:
            this screen deliberately passes no `title` to SubpageShell (the note
            headlines itself in the body), so hosting a kebab in the shell's
            titleAction would mean rendering the note's name twice, stacked. */}
        {canWrite && (
          isMobile ? (
            <div style={{ marginTop: 40 }}>
              <div style={{ margin: "0 4px 10px" }}>
                <span style={{ ...POCKET_KICKER_STYLE, color: "var(--danger)" }}>Danger zone</span>
              </div>
              <PocketButton variant="destructiveOutline" onClick={() => { setDeleteError(null); setConfirmDeleteNote(true) }}>
                <Trash2 style={{ width: 14, height: 14 }} /> Delete note
              </PocketButton>
            </div>
          ) : (
            <div style={{ marginTop: 44 }}>
              <p style={{ ...EYEBROW_STYLE, color: "var(--danger)", margin: "0 0 12px" }}>Danger zone</p>
              <div style={{ height: 1, background: "var(--line)", marginBottom: 16 }} />
              <button
                type="button"
                onClick={() => { setDeleteError(null); setConfirmDeleteNote(true) }}
                style={{ display: "flex", alignItems: "center", gap: 6, height: 36, padding: "0 18px", background: "transparent", border: "1px solid color-mix(in srgb, var(--danger) 25%, transparent)", borderRadius: "var(--r-chip)", color: "var(--danger)", fontSize: 14, cursor: "pointer" }}
              >
                <Trash2 style={{ width: 14, height: 14 }} /> Delete note
              </button>
            </div>
          )
        )}
      </div>

      <ConfirmDialog
        open={confirmDeleteNote}
        title="Delete this meeting note?"
        message={deleteError
          ? <span style={{ color: "var(--danger)" }}>{deleteError}</span>
          : "This permanently removes the note, its agenda and its decisions for everyone."}
        confirmLabel="Delete"
        loading={deletingNote}
        onConfirm={() => { void handleDeleteNote() }}
        onClose={() => { setConfirmDeleteNote(false); setDeleteError(null) }}
      />
    </SubpageShell>
  )
}

// ── List ─────────────────────────────────────────────────────────────────────

export function MeetingNotesSection({
  teamId,
  userId,
  userName,
  canWrite,
  startNewTrigger,
  openNoteId,
  onOpenNote,
  onOpenEvent,
  query = "",
}: {
  teamId: string | null
  userId: string
  userName: string
  canWrite: boolean
  startNewTrigger?: number
  openNoteId: string | null
  onOpenNote: (id: string | null) => void
  onOpenEvent?: (eventId: string) => void
  /** Search text — owned by the header row (plan-tab), one-row fold. */
  query?: string
}) {
  const supabase = createClient()
  const isMobile = useIsMobile()
  const { data, isLoading: loading, mutate: mutateNotes } = useSWR(
    teamId ? (["meeting-notes-digest", teamId] as const) : null,
    fetchNotesDigest,
    { keepPreviousData: false },
  )
  const notes = useMemo(() => data?.notes ?? [], [data])
  const [creating, setCreating] = useState(false)

  // Revalidate the digest whenever the LIST becomes visible. The section
  // renders from two mount sites (full-bleed detail vs. normal section), so a
  // back-navigation swaps instances — a revalidate fired from the unmounting
  // side can be deduped away; this one runs in the instance that survives.
  useEffect(() => {
    if (!openNoteId) void mutateNotes()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openNoteId])

  // Create-on-trigger fires only when the counter CHANGES while mounted — never
  // on mount (the section remounts when swapping detail/list render sites; a
  // mount-fired effect with a stale trigger spawned a note per navigation).
  const lastTriggerRef = useRef(startNewTrigger ?? 0)
  useEffect(() => {
    const t = startNewTrigger ?? 0
    if (t === lastTriggerRef.current) return
    lastTriggerRef.current = t
    if (t > 0) createNote()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [startNewTrigger])

  async function createNote() {
    if (!teamId || creating) return
    setCreating(true)
    const { data: lastRow } = await supabase
      .from("meeting_notes")
      .select("note_number")
      .eq("team_id", teamId)
      .order("note_number", { ascending: false })
      .limit(1)
      .maybeSingle()
    const noteNumber = ((lastRow?.note_number as number | undefined) ?? 0) + 1
    const today = new Date()
    const dateStr = today.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })
    const title = `Board Meeting — ${dateStr}`
    // `meeting_notes.date` is a DATE column — a calendar day, no instant, no zone.
    // `toISOString()` would hand back the UTC day, which after ~8pm Eastern is
    // TOMORROW: the title said "July 30" while the stored date said "2026-07-31",
    // one insert contradicting itself. `todayYMD()` (this file, :64) is the same
    // local calendar day the title renders — and the same one `isDraft` compares
    // against, so an evening note no longer files itself a day into the future.
    const dateIso = todayYMD()
    const { data: created, error } = await supabase
      .from("meeting_notes")
      .insert({ team_id: teamId, note_number: noteNumber, date: dateIso, title, body: "", created_by: userId, attendees: [userId] })
      .select()
      .single()
    setCreating(false)
    if (!error && created) {
      const newNote = created as MeetingNote
      // Works even when the digest payload hasn't landed yet (fast New-note
      // click): seed a minimal cache so the detail can render immediately.
      void mutateNotes(prev => prev
        ? { ...prev, notes: [newNote, ...prev.notes] }
        : { notes: [newNote], decisionsByNote: {}, eventTitles: {}, personNames: {} }, { revalidate: false })
      onOpenNote(newNote.id)
    }
  }

  async function saveTitle(id: string, title: string) {
    const now = new Date().toISOString()
    void mutateNotes(prev => prev ? { ...prev, notes: prev.notes.map(n => n.id === id ? { ...n, title, updated_by: userId, updated_at: now } : n) } : prev, { revalidate: false })
    const { error } = await supabase.from("meeting_notes").update({ title, updated_by: userId, updated_at: now }).eq("id", id)
    if (error) void mutateNotes()
  }
  async function saveBody(id: string, body: string) {
    const now = new Date().toISOString()
    void mutateNotes(prev => prev ? { ...prev, notes: prev.notes.map(n => n.id === id ? { ...n, body, updated_by: userId, updated_at: now } : n) } : prev, { revalidate: false })
    const { error } = await supabase.from("meeting_notes").update({ body, updated_by: userId, updated_at: now }).eq("id", id)
    if (error) void mutateNotes()
  }
  // `date` is a plain YYYY-MM-DD calendar day straight off <input type="date">
  // — never parsed into a Date on the way through (Convention #23). The digest
  // is ordered `date desc` and the desktop list month-groups off
  // `date.slice(0, 7)`, so the optimistic patch alone leaves the row in its old
  // month and old position: revalidate after the write to re-sort and re-group.
  async function saveDate(id: string, date: string) {
    const now = new Date().toISOString()
    void mutateNotes(prev => prev ? { ...prev, notes: prev.notes.map(n => n.id === id ? { ...n, date, updated_by: userId, updated_at: now } : n) } : prev, { revalidate: false })
    await supabase.from("meeting_notes").update({ date, updated_by: userId, updated_at: now }).eq("id", id)
    void mutateNotes()
  }
  // Children (agenda items, decisions) are ON DELETE CASCADE — no manual
  // cleanup. `.select()` is load-bearing: an RLS-denied delete is not an error,
  // it silently affects ZERO rows, so the returned rows are the only honest
  // signal that the note is actually gone. The detail awaits this behind the
  // ConfirmDialog's loading state rather than patching optimistically — an
  // optimistic destroy that quietly rolls back re-materializes a note the user
  // has already been told is gone.
  async function deleteNote(id: string): Promise<boolean> {
    const { data: removed, error } = await supabase.from("meeting_notes").delete().eq("id", id).select("id")
    if (error || !removed || removed.length === 0) { void mutateNotes(); return false }
    void mutateNotes(prev => prev ? { ...prev, notes: prev.notes.filter(n => n.id !== id) } : prev, { revalidate: false })
    return true
  }
  function noteMetaChange(id: string, patch: Partial<MeetingNote>) {
    void mutateNotes(prev => prev ? { ...prev, notes: prev.notes.map(n => n.id === id ? { ...n, ...patch } : n) } : prev, { revalidate: false })
  }

  // Detail view. While the list payload is still in flight (or a just-created
  // note hasn't landed in the cache yet), hold a loading state — falling
  // through to the empty list with a note open reads as data loss.
  const openNote = openNoteId ? notes.find(n => n.id === openNoteId) ?? null : null
  if (openNoteId && !openNote && (loading || !data)) {
    return <div style={{ textAlign: "center", padding: "32px 0", color: "var(--muted-text)", fontSize: 13 }}>Loading…</div>
  }
  if (openNoteId && openNote) {
    return (
      <MeetingNoteDetail
        note={openNote}
        teamId={teamId}
        userId={userId}
        userName={userName}
        onBack={() => { onOpenNote(null); void mutateNotes() }}
        onSaveTitle={saveTitle}
        onSaveBody={saveBody}
        onSaveDate={saveDate}
        onDeleteNote={deleteNote}
        onNoteMetaChange={noteMetaChange}
        onOpenEvent={onOpenEvent}
        canWrite={canWrite}
      />
    )
  }

  // ── List view ──
  const decisionsOf = (n: MeetingNote) => data?.decisionsByNote[n.id] ?? []
  const filtered = query.trim()
    ? notes.filter(n =>
        n.title.toLowerCase().includes(query.toLowerCase()) ||
        decisionsOf(n).some(d => d.text.toLowerCase().includes(query.toLowerCase())))
    : notes

  // Month grouping (notes are date-desc already).
  const groups: { key: string; label: string; items: MeetingNote[] }[] = []
  for (const n of filtered) {
    const key = n.date.slice(0, 7)
    const last = groups[groups.length - 1]
    if (last && last.key === key) last.items.push(n)
    else {
      const d = new Date(n.date + "T12:00:00")
      groups.push({ key, label: d.toLocaleDateString("en-US", { month: "long", year: "numeric" }), items: [n] })
    }
  }

  if (loading) {
    return <div style={{ textAlign: "center", padding: "32px 0", color: "var(--muted-text)", fontSize: 13 }}>Loading…</div>
  }

  if (notes.length === 0) {
    return (
      <div style={{ borderLeft: "1px solid var(--line)", paddingLeft: 24, paddingTop: 4, paddingBottom: 4 }}>
        <p style={{ fontFamily: "var(--font-instrument-serif)", fontStyle: "italic", fontSize: 15, color: "var(--muted-text)", margin: 0 }}>
          {canWrite ? "No notes yet — start a new one." : "No notes have been created yet."}
        </p>
      </div>
    )
  }

  // Mobile: Pocket rows with the digest as the sub line.
  if (isMobile) {
    return (
      <PocketRowCard>
        {filtered.map((note, i) => {
          const decs = decisionsOf(note)
          const d = new Date(note.date + "T12:00:00")
          const dateLabel = d.toLocaleDateString("en-US", { month: "short", day: "numeric" })
          const evTitle = note.linked_event_id ? data?.eventTitles[note.linked_event_id] : null
          const sub = [
            dateLabel,
            decs.length > 0 ? `${decs.length} ${decs.length === 1 ? "decision" : "decisions"}` : (isDraft(note, decs.length) ? "draft" : null),
            evTitle ?? null,
          ].filter(Boolean).join(" · ")
          return (
            <PocketRow
              key={note.id}
              title={note.title || "(Untitled)"}
              sub={sub}
              chevron
              isLast={i === filtered.length - 1}
              onClick={() => onOpenNote(note.id)}
            />
          )
        })}
      </PocketRowCard>
    )
  }

  return (
    <div>
      {groups.map((g, gi) => (
        <div key={g.key} style={{ marginTop: gi === 0 ? 0 : 26 }}>
          <div style={{ display: "flex", alignItems: "baseline", gap: 14, marginBottom: 4 }}>
            <span style={{ ...EYEBROW_STYLE, fontSize: 11, letterSpacing: "0.13em", whiteSpace: "nowrap" }}>{g.label}</span>
            <div style={{ flex: 1, height: 1, background: "var(--line)" }} />
            <span style={{ fontFamily: "var(--mono)", fontSize: 11, color: "var(--muted-text)", whiteSpace: "nowrap" }}>{g.items.length} {g.items.length === 1 ? "meeting" : "meetings"}</span>
          </div>
          {g.items.map(note => {
            const decs = decisionsOf(note)
            const d = new Date(note.date + "T12:00:00")
            const evTitle = note.linked_event_id ? data?.eventTitles[note.linked_event_id] : null
            const draft = isDraft(note, decs.length)
            const attendeePeople = (note.attendees ?? []).map(id => ({ id, name: data?.personNames[id] ?? "Member" }))
            return (
              <button
                key={note.id}
                type="button"
                onClick={() => onOpenNote(note.id)}
                aria-label={`Open ${note.title || "note"}`}
                style={{
                  width: "100%", textAlign: "left", display: "grid", gridTemplateColumns: "52px minmax(0, 1fr) auto",
                  gap: 16, alignItems: "center", padding: "14px 10px", borderBottom: "1px solid var(--line-3)",
                  borderRadius: 10, cursor: "pointer", background: "none", transition: "background .12s",
                }}
                onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = "var(--cream-2)" }}
                onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = "none" }}
              >
                <span style={{ textAlign: "center", lineHeight: 1.05 }}>
                  <span style={{ display: "block", fontFamily: "var(--serif)", fontSize: 19, fontWeight: 600, color: "var(--ink)" }}>{String(d.getDate()).padStart(2, "0")}</span>
                  <span style={{ display: "block", fontFamily: "var(--mono)", fontSize: 10, letterSpacing: "1px", textTransform: "uppercase", color: "var(--muted-text)", marginTop: 3 }}>{d.toLocaleDateString("en-US", { weekday: "short" })}</span>
                </span>
                <span style={{ minWidth: 0 }}>
                  <span style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
                    <span style={{ fontSize: 16, fontWeight: 500, color: "var(--ink)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{note.title || "(Untitled)"}</span>
                    {draft && (
                      <span style={{ fontFamily: "var(--mono)", fontSize: 10, letterSpacing: "0.8px", textTransform: "uppercase", color: "color-mix(in srgb, var(--gold) 65%, var(--ink))", background: "color-mix(in srgb, var(--gold) 13%, var(--cream))", borderRadius: 999, padding: "2px 8px", flexShrink: 0 }}>Draft</span>
                    )}
                  </span>
                  <span style={{ display: "block", fontSize: 13, color: "var(--body)", marginTop: 4, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", lineHeight: 1.4 }}>
                    {decs.length > 0
                      ? decs.slice(0, 2).map(x => x.text).join(" · ")
                      : <span style={{ color: "var(--muted-text)", fontStyle: "italic" }}>{draft ? "No decisions yet — meeting in progress" : "No decisions recorded"}</span>}
                  </span>
                </span>
                <span style={{ display: "flex", alignItems: "center", gap: 16, flexShrink: 0 }}>
                  {decs.length > 0 && (
                    <span style={{ display: "inline-flex", alignItems: "center", gap: 6, fontFamily: "var(--mono)", fontSize: 11, color: "var(--muted-text)", whiteSpace: "nowrap" }}>
                      <i style={{ width: 6, height: 6, borderRadius: "50%", background: "var(--gold)", flexShrink: 0 }} />
                      {decs.length} {decs.length === 1 ? "decision" : "decisions"}
                    </span>
                  )}
                  {evTitle && (
                    <span style={{ display: "inline-flex", alignItems: "center", fontSize: 12, fontWeight: 500, background: "var(--plum-tint)", color: "var(--plum)", borderRadius: 999, padding: "3px 10px", whiteSpace: "nowrap", maxWidth: 160, overflow: "hidden", textOverflow: "ellipsis" }}>{evTitle}</span>
                  )}
                  <AvatarStack people={attendeePeople} />
                  <ChevronRight style={{ width: 15, height: 15, color: "var(--dashed)", flexShrink: 0 }} />
                </span>
              </button>
            )
          })}
        </div>
      ))}
      {filtered.length === 0 && (
        <p style={{ fontSize: 14, color: "var(--muted-text)", fontStyle: "italic", marginTop: 24 }}>No notes match “{query}”.</p>
      )}
    </div>
  )
}
