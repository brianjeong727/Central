"use client"

import { CSSProperties } from "react"
import { CalendarDays, MapPin } from "lucide-react"
import { CentralButton } from "./button"
import { EYEBROW_STYLE } from "@/app/home/components/shared"

// Live event-detail data, pulled from a referenced calendar_events row.
// When provided, the reference slide shows a real two-column detail panel; when
// absent the slide fills editorially (single column) — there is NO hollow
// "nothing set yet" placeholder anymore (retired in the hero carousel, Phase 2).
export interface UpNextEventDetail {
  startDate: string
  endDate: string
  allDay: boolean
  location: string | null
}

function formatEventWhen(detail: UpNextEventDetail): string {
  const start = new Date(detail.startDate)
  const dateStr = start.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })
  if (detail.allDay) return `${dateStr} · All day`
  const timeStr = start.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })
  return `${dateStr} · ${timeStr}`
}

// Desktop right-column real event details — same cream frame as the placeholder
// so the hero reads as one coherent frame regardless of slide type.
function EventDetailCard({ detail }: { detail: UpNextEventDetail }) {
  return (
    <div
      style={{
        background: "var(--cream)",
        border: "1px solid var(--line)",
        borderRadius: "var(--r-input)",
        display: "flex",
        flexDirection: "column",
        justifyContent: "center",
        gap: 14,
        padding: "28px 24px",
      }}
    >
      <div
        style={{
          fontFamily: "var(--mono)",
          fontSize: 10,
          letterSpacing: "1.2px",
          color: "var(--muted-text)",
          textTransform: "uppercase",
        }}
      >
        Event Details
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <CalendarDays style={{ width: 16, height: 16, color: "var(--plum)", flexShrink: 0 }} />
        <span style={{ fontSize: 14, color: "var(--ink)", fontWeight: 500 }}>{formatEventWhen(detail)}</span>
      </div>
      {detail.location && (
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <MapPin style={{ width: 16, height: 16, color: "var(--plum)", flexShrink: 0 }} />
          <span style={{ fontSize: 14, color: "var(--body)" }}>{detail.location}</span>
        </div>
      )}
    </div>
  )
}

// Mobile inline event details — compact stacked rows (mobile card is single-column).
function EventDetailInline({ detail }: { detail: UpNextEventDetail }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <CalendarDays style={{ width: 14, height: 14, color: "var(--plum)", flexShrink: 0 }} />
        <span style={{ fontSize: 13, color: "var(--ink)", fontWeight: 500 }}>{formatEventWhen(detail)}</span>
      </div>
      {detail.location && (
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <MapPin style={{ width: 14, height: 14, color: "var(--plum)", flexShrink: 0 }} />
          <span style={{ fontSize: 13, color: "var(--body)" }}>{detail.location}</span>
        </div>
      )}
    </div>
  )
}

interface UpNextCardProps {
  label: string
  labelAccent?: boolean
  title: string
  body?: string | null
  isEvent?: boolean
  eventDetail?: UpNextEventDetail
  userHasRsvped?: boolean
  rsvping?: boolean
  rsvpCount?: number
  attendees?: { user_id: string; name: string }[]
  showAttendees?: boolean
  onRsvp?: () => void
  // Optional: when omitted, the primary "See details" button is not rendered.
  // Used by event slides whose calendar_events row has no detail target.
  onDetails?: () => void
  mobile?: boolean
  // Carousel slide mode: fill the shared --hero-h frame (no own border/radius —
  // the HeroFrame owns the border, radius, and clipping).
  fill?: boolean
  style?: CSSProperties
}

export function UpNextCard({
  label,
  labelAccent = true,
  title,
  body,
  isEvent,
  eventDetail,
  userHasRsvped,
  rsvping,
  rsvpCount = 0,
  attendees = [],
  showAttendees,
  onRsvp,
  onDetails,
  mobile = false,
  fill = false,
  style,
}: UpNextCardProps) {
  const maxAttendees = mobile ? 6 : 8
  const bodyText = body ? body.replace(/\n+/g, " ") : null

  // fill mode (carousel slide): ivory surface fills the HeroFrame, which owns the
  // border/radius/clip. Standalone mode keeps its own soft-callout chrome.
  const cardBase: CSSProperties = fill
    ? { background: "var(--ivory)", height: "100%", boxSizing: "border-box", ...style }
    : {
        background: "var(--ivory)",
        border: "1px solid var(--line-2)",
        borderRadius: "var(--r-callout)",
        ...style,
      }

  const eyebrow = (
    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
      {labelAccent && (
        <div
          style={{
            width: 7,
            height: 7,
            borderRadius: "50%",
            background: "var(--plum)",
            flexShrink: 0,
          }}
        />
      )}
      <div style={labelAccent ? { ...EYEBROW_STYLE, color: "var(--plum)" } : EYEBROW_STYLE}>{label}</div>
    </div>
  )

  const actions = (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        {onDetails && (
          <CentralButton variant="primary" onClick={onDetails}>
            {isEvent ? "See details" : "See announcement"}
          </CentralButton>
        )}
        {isEvent && onRsvp && (
          <CentralButton onClick={onRsvp} disabled={rsvping} variant="secondary">
            {userHasRsvped ? "Going ✓" : "RSVP"}
          </CentralButton>
        )}
        {isEvent && rsvpCount > 0 && (
          <span style={{ fontSize: 12, color: "var(--faint)", fontWeight: 500 }}>
            {rsvpCount} going
          </span>
        )}
      </div>
      {showAttendees && attendees.length > 0 && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 12 }}>
          {attendees.slice(0, maxAttendees).map((a) => (
            <span
              key={a.user_id}
              style={{
                fontSize: 11,
                color: "var(--body)",
                background: "var(--ivory)",
                border: "1px solid var(--line)",
                padding: "2px 9px",
                borderRadius: 999,
              }}
            >
              {a.name.split(" ")[0]}
            </span>
          ))}
          {attendees.length > maxAttendees && (
            <span style={{ fontSize: 11, color: "var(--faint)", padding: "2px 4px" }}>
              +{attendees.length - maxAttendees} more
            </span>
          )}
        </div>
      )}
    </div>
  )

  // ── Mobile: single column ────────────────────────────────────────────────────
  if (mobile) {
    return (
      <div style={{ ...cardBase, padding: "24px 24px", display: "flex", flexDirection: "column", gap: 14 }}>
        {eyebrow}
        <div>
          <h2
            style={{
              fontFamily: "var(--serif)",
              fontSize: 34,
              fontWeight: 400,
              letterSpacing: "-0.5px",
              lineHeight: 1.05,
              color: "var(--ink)",
              margin: 0,
            }}
          >
            {title}
          </h2>
          {bodyText && (
            <p
              className="line-clamp-3"
              style={{ fontSize: 13, color: "var(--body)", marginTop: 10, lineHeight: 1.55 }}
            >
              {bodyText}
            </p>
          )}
        </div>
        {eventDetail && <EventDetailInline detail={eventDetail} />}
        {actions}
      </div>
    )
  }

  // ── Desktop ─────────────────────────────────────────────────────────────────
  // Title bumped to 46px for the taller --hero-h frame. Two layouts share the
  // same frame: a two-column split when there is REAL event detail, and a calm
  // single editorial column otherwise (no hollow placeholder — retired).
  const titleEl = (
    <h2
      style={{
        fontFamily: "var(--serif)",
        fontSize: 46,
        fontWeight: 400,
        letterSpacing: "-0.02em",
        lineHeight: 1.02,
        color: "var(--ink)",
        margin: 0,
      }}
    >
      {title}
    </h2>
  )

  // Two-column: real event detail present → editorial left + detail card right.
  if (eventDetail) {
    return (
      <div
        style={{
          ...cardBase,
          padding: "var(--space-10) var(--space-11)",
          display: "grid",
          gridTemplateColumns: "1.95fr 1fr",
          gap: "var(--space-11)",
          alignItems: "stretch",
        }}
      >
        <div style={{ display: "flex", flexDirection: "column", minWidth: 0 }}>
          {eyebrow}
          <div style={{ marginTop: "var(--space-7)" }}>
            {titleEl}
            {bodyText && (
              <p
                className="line-clamp-2"
                style={{ fontSize: 15, color: "var(--body)", marginTop: "var(--space-5)", lineHeight: 1.6 }}
              >
                {bodyText}
              </p>
            )}
          </div>
          <div style={{ marginTop: "auto", paddingTop: "var(--space-9)" }}>{actions}</div>
        </div>
        <EventDetailCard detail={eventDetail} />
      </div>
    )
  }

  // Single editorial column: announcements (and events without detail) fill the
  // frame; CTA pinned to the bottom so the tall frame never reads empty.
  return (
    <div
      style={{
        ...cardBase,
        padding: "var(--space-10) var(--space-11)",
        display: "flex",
        flexDirection: "column",
      }}
    >
      {eyebrow}
      <div style={{ marginTop: "var(--space-7)", maxWidth: 620 }}>
        {titleEl}
        {bodyText && (
          <p
            className="line-clamp-3"
            style={{ fontSize: 16, color: "var(--body)", marginTop: "var(--space-6)", lineHeight: 1.6 }}
          >
            {bodyText}
          </p>
        )}
      </div>
      <div style={{ marginTop: "auto", paddingTop: "var(--space-9)" }}>{actions}</div>
    </div>
  )
}
