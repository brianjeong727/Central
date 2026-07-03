"use client"

import { useState, useEffect, useCallback } from "react"
import { X, ChevronUp, ChevronDown, Plus, CalendarDays, Megaphone, Image as ImageIcon } from "lucide-react"
import { createClient } from "@/lib/supabase"
import { Spinner } from "./shared"

// Curation overlay for the home hero carousel. Reference slides (upcoming events
// / announcements); add, reorder, remove. Writes go straight to home_slides
// (ministry_id on every write; RLS mirrors canCurateHome).
// Photo slides are shelved (coming soon): existing rows are soft-hidden here and
// on the home tab, and upload UI is replaced by a placeholder — no data deleted.

interface SlideRow {
  id: string
  slide_type: "announcement" | "event" | "photo"
  announcement_id: string | null
  calendar_event_id: string | null
  order_index: number
  title: string
}

interface EventOpt {
  id: string
  title: string
  start_date: string
}

interface AnnOpt {
  id: string
  title: string
  is_event: boolean
}

const MONO: React.CSSProperties = {
  fontFamily: "var(--mono)",
  fontSize: 10,
  letterSpacing: "1.2px",
  color: "var(--muted-text)",
  textTransform: "uppercase",
}

export function HomeSlideManager({
  ministryId,
  onClose,
}: {
  ministryId: string
  onClose: () => void
}) {
  const supabase = createClient()
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [slides, setSlides] = useState<SlideRow[]>([])
  const [events, setEvents] = useState<EventOpt[]>([])
  const [anns, setAnns] = useState<AnnOpt[]>([])
  const [userId, setUserId] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    const nowIso = new Date().toISOString()
    const [{ data: slideRows }, { data: evRows }, { data: annRows }] = await Promise.all([
      supabase
        .from("home_slides")
        .select("id, slide_type, announcement_id, calendar_event_id, order_index, caption")
        .eq("ministry_id", ministryId)
        .order("order_index", { ascending: true }),
      supabase
        .from("calendar_events")
        .select("id, title, start_date")
        .eq("ministry_id", ministryId)
        .gte("start_date", nowIso)
        .order("start_date", { ascending: true }),
      supabase
        .from("announcements")
        .select("id, title, is_event")
        .eq("ministry_id", ministryId)
        .eq("status", "published")
        .order("created_at", { ascending: false })
        .limit(50),
    ])

    const evMap = new Map((evRows ?? []).map((e) => [e.id, e]))
    const annMap = new Map((annRows ?? []).map((a) => [a.id, a]))

    const resolved: SlideRow[] = (slideRows ?? []).map((r) => ({
      id: r.id,
      slide_type: r.slide_type,
      announcement_id: r.announcement_id,
      calendar_event_id: r.calendar_event_id,
      order_index: r.order_index,
      title:
        r.slide_type === "event"
          ? evMap.get(r.calendar_event_id ?? "")?.title ?? "Event"
          : r.slide_type === "photo"
            ? r.caption || "Photo"
            : annMap.get(r.announcement_id ?? "")?.title ?? "Announcement",
    }))

    // Photo slides are shelved — soft-hide them from the manager list (rows kept in DB).
    setSlides(resolved.filter((s) => s.slide_type !== "photo"))
    setEvents(evRows ?? [])
    setAnns(annRows ?? [])
    setLoading(false)
  }, [ministryId, supabase])

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setUserId(data.user?.id ?? null))
    refresh()
  }, [refresh, supabase])

  const usedEventIds = new Set(slides.filter((s) => s.slide_type === "event").map((s) => s.calendar_event_id))
  const usedAnnIds = new Set(slides.filter((s) => s.slide_type === "announcement").map((s) => s.announcement_id))
  const availableEvents = events.filter((e) => !usedEventIds.has(e.id))
  const availableAnns = anns.filter((a) => !usedAnnIds.has(a.id))

  async function addSlide(type: "event" | "announcement", refId: string) {
    setBusy(true)
    const nextOrder = slides.length ? Math.max(...slides.map((s) => s.order_index)) + 1 : 0
    await supabase.from("home_slides").insert({
      ministry_id: ministryId,
      slide_type: type,
      calendar_event_id: type === "event" ? refId : null,
      announcement_id: type === "announcement" ? refId : null,
      order_index: nextOrder,
      created_by: userId,
    })
    await refresh()
    setBusy(false)
  }

  async function removeSlide(id: string) {
    setBusy(true)
    await supabase.from("home_slides").delete().eq("id", id).eq("ministry_id", ministryId)
    await refresh()
    setBusy(false)
  }

  async function moveSlide(i: number, dir: "up" | "down") {
    const j = dir === "up" ? i - 1 : i + 1
    if (j < 0 || j >= slides.length) return
    setBusy(true)
    const a = slides[i]
    const b = slides[j]
    await Promise.all([
      supabase.from("home_slides").update({ order_index: b.order_index }).eq("id", a.id).eq("ministry_id", ministryId),
      supabase.from("home_slides").update({ order_index: a.order_index }).eq("id", b.id).eq("ministry_id", ministryId),
    ])
    await refresh()
    setBusy(false)
  }

  function formatWhen(iso: string) {
    return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" })
  }

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 120,
        background: "rgba(19,16,26,0.55)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "0 20px",
      }}
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: "var(--cream-2, var(--cream-panel))",
          borderRadius: "var(--r-callout)",
          width: "100%",
          maxWidth: 480,
          maxHeight: "85vh",
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
        }}
      >
        {/* Header */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "20px 24px",
            borderBottom: "1px solid var(--line)",
            flexShrink: 0,
          }}
        >
          <div>
            <div style={MONO}>Home hero</div>
            <h2
              style={{
                fontFamily: "var(--serif)",
                fontSize: 22,
                fontWeight: 400,
                color: "var(--ink)",
                margin: "4px 0 0",
              }}
            >
              Curate slides
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            style={{
              width: 32,
              height: 32,
              borderRadius: 999,
              border: "1px solid var(--line)",
              background: "var(--ivory)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              cursor: "pointer",
              flexShrink: 0,
            }}
          >
            <X style={{ width: 16, height: 16, color: "var(--ink)" }} />
          </button>
        </div>

        {loading ? (
          <div style={{ padding: 24 }}>
            <Spinner />
          </div>
        ) : (
          <div style={{ overflowY: "auto", padding: "20px 24px", display: "flex", flexDirection: "column", gap: 24 }}>
            {/* Current slides */}
            <section>
              <div style={{ ...MONO, marginBottom: 12 }}>Current slides · {slides.length}</div>
              {slides.length === 0 ? (
                <p style={{ fontSize: 13, color: "var(--muted-text)", margin: 0 }}>
                  No slides yet — add an event or announcement below. The home hero falls back to the latest
                  pinned announcement until you add one.
                </p>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {slides.map((s, i) => (
                    <div
                      key={s.id}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 12,
                        padding: "12px 14px",
                        border: "1px solid var(--line-2)",
                        borderRadius: "var(--r-card)",
                        background: "var(--ivory)",
                      }}
                    >
                      {s.slide_type === "event" ? (
                        <CalendarDays style={{ width: 16, height: 16, color: "var(--plum)", flexShrink: 0 }} />
                      ) : s.slide_type === "photo" ? (
                        <ImageIcon style={{ width: 16, height: 16, color: "var(--plum)", flexShrink: 0 }} />
                      ) : (
                        <Megaphone style={{ width: 16, height: 16, color: "var(--plum)", flexShrink: 0 }} />
                      )}
                      <span
                        style={{
                          flex: 1,
                          minWidth: 0,
                          fontSize: 14,
                          color: "var(--ink)",
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {s.title}
                      </span>
                      <button
                        type="button"
                        onClick={() => moveSlide(i, "up")}
                        disabled={i === 0 || busy}
                        aria-label="Move up"
                        style={iconBtn(i === 0 || busy)}
                      >
                        <ChevronUp style={{ width: 15, height: 15 }} />
                      </button>
                      <button
                        type="button"
                        onClick={() => moveSlide(i, "down")}
                        disabled={i === slides.length - 1 || busy}
                        aria-label="Move down"
                        style={iconBtn(i === slides.length - 1 || busy)}
                      >
                        <ChevronDown style={{ width: 15, height: 15 }} />
                      </button>
                      <button
                        type="button"
                        onClick={() => removeSlide(s.id)}
                        disabled={busy}
                        aria-label="Remove slide"
                        style={iconBtn(busy)}
                      >
                        <X style={{ width: 15, height: 15 }} />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </section>

            {/* Photo slides — shelved (coming soon placeholder, nothing interactive) */}
            <section>
              <div style={{ ...MONO, marginBottom: 12 }}>Photo slides</div>
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  gap: 8,
                  padding: "28px 22px",
                  border: "1px dashed var(--dashed)",
                  borderRadius: "var(--r-card)",
                  background: "transparent",
                  textAlign: "center",
                }}
              >
                <ImageIcon style={{ width: 18, height: 18, color: "var(--muted-text)" }} />
                <span style={MONO}>Coming soon</span>
                <p style={{ fontSize: 13, color: "var(--muted-text)", lineHeight: 1.5, margin: 0, fontFamily: "var(--sans)" }}>
                  Photo slides are coming soon. For now, feature upcoming events and announcements below.
                </p>
              </div>
            </section>

            {/* Add upcoming events */}
            <section>
              <div style={{ ...MONO, marginBottom: 12 }}>Add an upcoming event</div>
              {availableEvents.length === 0 ? (
                <p style={{ fontSize: 13, color: "var(--muted-text)", margin: 0 }}>No upcoming events to add.</p>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {availableEvents.map((e) => (
                    <AddRow
                      key={e.id}
                      icon={<CalendarDays style={{ width: 16, height: 16, color: "var(--plum)", flexShrink: 0 }} />}
                      title={e.title}
                      meta={formatWhen(e.start_date)}
                      disabled={busy}
                      onAdd={() => addSlide("event", e.id)}
                    />
                  ))}
                </div>
              )}
            </section>

            {/* Add announcements */}
            <section>
              <div style={{ ...MONO, marginBottom: 12 }}>Add an announcement</div>
              {availableAnns.length === 0 ? (
                <p style={{ fontSize: 13, color: "var(--muted-text)", margin: 0 }}>No announcements to add.</p>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {availableAnns.map((a) => (
                    <AddRow
                      key={a.id}
                      icon={<Megaphone style={{ width: 16, height: 16, color: "var(--plum)", flexShrink: 0 }} />}
                      title={a.title}
                      meta={a.is_event ? "Event" : "Post"}
                      disabled={busy}
                      onAdd={() => addSlide("announcement", a.id)}
                    />
                  ))}
                </div>
              )}
            </section>
          </div>
        )}
      </div>
    </div>
  )
}

function iconBtn(disabled: boolean): React.CSSProperties {
  return {
    width: 28,
    height: 28,
    borderRadius: 8,
    border: "1px solid var(--line)",
    background: "var(--cream)",
    color: "var(--body)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    cursor: disabled ? "default" : "pointer",
    opacity: disabled ? 0.4 : 1,
    flexShrink: 0,
  }
}

function AddRow({
  icon,
  title,
  meta,
  disabled,
  onAdd,
}: {
  icon: React.ReactNode
  title: string
  meta: string
  disabled: boolean
  onAdd: () => void
}) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 12,
        padding: "12px 14px",
        border: "1px solid var(--line-2)",
        borderRadius: "var(--r-card)",
        background: "var(--ivory)",
      }}
    >
      {icon}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{
            fontSize: 14,
            color: "var(--ink)",
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {title}
        </div>
        <div style={{ fontSize: 11, color: "var(--muted-text)", marginTop: 2 }}>{meta}</div>
      </div>
      <button
        type="button"
        onClick={onAdd}
        disabled={disabled}
        aria-label={`Add ${title}`}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 5,
          padding: "6px 12px",
          borderRadius: 9,
          border: "1px solid var(--plum)",
          background: "transparent",
          color: "var(--plum)",
          fontSize: 13,
          fontWeight: 500,
          cursor: disabled ? "default" : "pointer",
          opacity: disabled ? 0.5 : 1,
          flexShrink: 0,
          fontFamily: "var(--sans)",
        }}
      >
        <Plus style={{ width: 14, height: 14 }} />
        Add
      </button>
    </div>
  )
}
