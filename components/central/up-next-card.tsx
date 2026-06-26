"use client"

import { CSSProperties } from "react"
import { CalendarDays, MapPin } from "lucide-react"
import { CentralButton } from "./button"

const PLUM_EYEBROW: CSSProperties = {
  fontFamily: "var(--mono)",
  fontSize: 11,
  letterSpacing: "1.4px",
  color: "var(--plum)",
  textTransform: "uppercase",
}

const MUTED_EYEBROW: CSSProperties = {
  fontFamily: "var(--mono)",
  fontSize: 11,
  letterSpacing: "1.4px",
  color: "var(--muted-text)",
  textTransform: "uppercase",
}

// B · Emphasis: solid cream inset (not dashed) — DS §4.18 reserves dashed for
// ACTIONABLE empty states with a +; this passive "not set yet" reads calmer solid.
function EventDetailPlaceholder() {
  return (
    <div
      style={{
        background: "var(--cream)",
        border: "1px solid var(--line)",
        borderRadius: "var(--r-input)",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        textAlign: "center",
        padding: "28px 20px",
      }}
    >
      <CalendarDays style={{ width: 26, height: 26, color: "var(--faint)", marginBottom: 14 }} />
      <div
        style={{
          fontFamily: "var(--mono)",
          fontSize: 10,
          letterSpacing: "1.2px",
          color: "var(--muted-text)",
          textTransform: "uppercase",
          marginBottom: 12,
        }}
      >
        Event Details
      </div>
      <div style={{ fontSize: 14, color: "var(--faint)", lineHeight: 1.5 }}>
        No date, time, or
        <br />
        location set yet
      </div>
    </div>
  )
}

// Live event-detail data, pulled from a referenced calendar_events row.
// When provided, replaces the "no date set yet" placeholder with real details.
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
  style,
}: UpNextCardProps) {
  const maxAttendees = mobile ? 6 : 8
  const bodyText = body ? body.replace(/\n+/g, " ") : null

  // B · Emphasis: --ivory as the single emphasized surface; --line-2 border to
  // complement the warmer/slightly-darker card bg (DS soft-callout pattern).
  const cardBase: CSSProperties = {
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
      <div style={labelAccent ? PLUM_EYEBROW : MUTED_EYEBROW}>{label}</div>
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

  // ── Desktop: B · Emphasis — two-column grid 1.95fr 1fr ──────────────────────
  // Title at 36px steps clearly below the greeting H1 (52px) so both serif
  // moments are distinct and neither competes for dominance.
  return (
    <div
      style={{
        ...cardBase,
        padding: "36px 40px",
        display: "grid",
        gridTemplateColumns: "1.95fr 1fr",
        gap: "40px",
        alignItems: "stretch",
      }}
    >
      {/* Left content column */}
      <div style={{ display: "flex", flexDirection: "column" }}>
        {eyebrow}
        <div style={{ marginTop: 18 }}>
          <h2
            style={{
              fontFamily: "var(--serif)",
              fontSize: 36,
              fontWeight: 400,
              letterSpacing: "-0.01em",
              lineHeight: 1.04,
              color: "var(--ink)",
              margin: 0,
            }}
          >
            {title}
          </h2>
          {bodyText && (
            <p
              className="line-clamp-2"
              style={{ fontSize: 15, color: "var(--body)", marginTop: 12, lineHeight: 1.6 }}
            >
              {bodyText}
            </p>
          )}
        </div>
        <div style={{ marginTop: "auto", paddingTop: 28 }}>
          {actions}
        </div>
      </div>

      {/* Right: event detail slot — cream bg so it reads lighter than the ivory card.
          Real details when a referenced event provides them; placeholder otherwise. */}
      {eventDetail ? <EventDetailCard detail={eventDetail} /> : <EventDetailPlaceholder />}
    </div>
  )
}
