"use client"

import { CSSProperties, ReactNode } from "react"
import { CalendarDays, MapPin, ClipboardList } from "lucide-react"
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

function formatPosted(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
}

// Mono micro-label for the detail-panel cards ("Event Details", "Form", "Posted").
const MONO_LABEL: CSSProperties = {
  fontFamily: "var(--mono)",
  fontSize: 10,
  letterSpacing: "1.2px",
  color: "var(--muted-text)",
  textTransform: "uppercase",
}

// Quiet plum text affordance (form CTA, demoted links). No chrome.
const QUIET_LINK: CSSProperties = {
  background: "none",
  border: "none",
  padding: 0,
  margin: 0,
  color: "var(--plum)",
  fontWeight: 500,
  fontSize: 13,
  cursor: "pointer",
  fontFamily: "var(--sans)",
  textAlign: "left",
  alignSelf: "flex-start",
  display: "inline-flex",
  alignItems: "center",
  gap: 6,
}

// ── The 40% detail-slot cards (desktop) ──────────────────────────────────────
// One shared cream frame keeps every slot type reading as the same right panel,
// so the 60/40 structure stays consistent no matter which detail wins.
function DetailFrame({ children }: { children: ReactNode }) {
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
        height: "100%",
        boxSizing: "border-box",
      }}
    >
      {children}
    </div>
  )
}

// Image slot — rounded cover image filling the slot height.
function ImageSlot({ url, mobile = false }: { url: string; mobile?: boolean }) {
  return (
    <div
      style={{
        height: mobile ? 180 : "100%",
        borderRadius: "var(--r-input)",
        overflow: "hidden",
        border: "1px solid var(--line)",
        background: "var(--cream-2)",
      }}
    >
      <img src={url} alt="" style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
    </div>
  )
}

// Event slot — date + time BOLD, location, and the RSVP control travelling with it.
function EventDetailCard({ detail, rsvp }: { detail: UpNextEventDetail; rsvp?: ReactNode }) {
  return (
    <DetailFrame>
      <div style={MONO_LABEL}>Event Details</div>
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <CalendarDays style={{ width: 16, height: 16, color: "var(--plum)", flexShrink: 0 }} />
        <span style={{ fontSize: 16, color: "var(--ink)", fontWeight: 600, letterSpacing: "-0.01em" }}>
          {formatEventWhen(detail)}
        </span>
      </div>
      {detail.location && (
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <MapPin style={{ width: 16, height: 16, color: "var(--plum)", flexShrink: 0 }} />
          <span style={{ fontSize: 14, color: "var(--body)" }}>{detail.location}</span>
        </div>
      )}
      {rsvp && <div style={{ marginTop: 4 }}>{rsvp}</div>}
    </DetailFrame>
  )
}

// Form slot — quiet CTA: "Includes a form" + a "View / Fill out →" affordance.
function FormDetailCard({ onDetails }: { onDetails?: () => void }) {
  return (
    <DetailFrame>
      <div style={MONO_LABEL}>Form</div>
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <ClipboardList style={{ width: 16, height: 16, color: "var(--plum)", flexShrink: 0 }} />
        <span style={{ fontSize: 14, color: "var(--ink)", fontWeight: 500 }}>Includes a form</span>
      </div>
      {onDetails && (
        <button onClick={onDetails} style={QUIET_LINK}>
          View / Fill out →
        </button>
      )}
    </DetailFrame>
  )
}

// Posted-date slot — keeps the 40% structure when there is nothing else to show.
function PostedDetailCard({ date }: { date?: string }) {
  return (
    <DetailFrame>
      <div style={MONO_LABEL}>Posted</div>
      <div style={{ fontSize: 14, color: "var(--ink)", fontWeight: 500 }}>
        {date ? formatPosted(date) : "—"}
      </div>
    </DetailFrame>
  )
}

// ── Demoted compact pieces (bottom of the 60% column) ────────────────────────
function DemotedEventRow({ detail, rsvp }: { detail: UpNextEventDetail; rsvp?: ReactNode }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <CalendarDays style={{ width: 14, height: 14, color: "var(--plum)", flexShrink: 0 }} />
        <span style={{ fontSize: 13, color: "var(--ink)", fontWeight: 500 }}>{formatEventWhen(detail)}</span>
      </div>
      {rsvp}
    </div>
  )
}

function DemotedFormLink({ onDetails }: { onDetails?: () => void }) {
  if (!onDetails) return null
  return (
    <button onClick={onDetails} style={QUIET_LINK}>
      <ClipboardList style={{ width: 14, height: 14 }} />
      Form →
    </button>
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

function FormInline({ onDetails }: { onDetails?: () => void }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <ClipboardList style={{ width: 14, height: 14, color: "var(--plum)", flexShrink: 0 }} />
        <span style={{ fontSize: 13, color: "var(--ink)", fontWeight: 500 }}>Includes a form</span>
      </div>
      {onDetails && (
        <button onClick={onDetails} style={QUIET_LINK}>
          View / Fill out →
        </button>
      )}
    </div>
  )
}

function PostedInline({ date }: { date?: string }) {
  if (!date) return null
  return (
    <div style={{ ...MONO_LABEL, fontSize: 11, color: "var(--faint)" }}>Posted · {formatPosted(date)}</div>
  )
}

interface UpNextCardProps {
  label: string
  labelAccent?: boolean
  title: string
  body?: string | null
  isEvent?: boolean
  eventDetail?: UpNextEventDetail
  // Priority inputs for the 40% detail slot (image > event > form > posted-date).
  imageUrl?: string | null
  hasForm?: boolean
  postedDate?: string
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
  // the HeroFrame owns the border, radius, and clipping). Also opts the card into
  // the 60/40 detail-panel layout.
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
  imageUrl,
  hasForm,
  postedDate,
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

  // RSVP control — button + "N going" count. Travels WITH the event detail.
  const rsvpNode = (size: "sm" | "md" = "md"): ReactNode =>
    isEvent && onRsvp ? (
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <CentralButton size={size} variant="secondary" onClick={onRsvp} disabled={rsvping}>
          {userHasRsvped ? "Going ✓" : "RSVP"}
        </CentralButton>
        {rsvpCount > 0 && (
          <span style={{ fontSize: 12, color: "var(--faint)", fontWeight: 500 }}>{rsvpCount} going</span>
        )}
      </div>
    ) : null

  const detailsButton = onDetails ? (
    <CentralButton variant="primary" onClick={onDetails}>
      {isEvent ? "See details" : "See announcement"}
    </CentralButton>
  ) : null

  const attendeeChips =
    showAttendees && attendees.length > 0 ? (
      <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
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
    ) : null

  // ── Priority for the 40% detail slot: image > event > form > posted-date ──
  type DetailKind = "image" | "event" | "form" | "posted"
  const primary: DetailKind = imageUrl
    ? "image"
    : eventDetail
      ? "event"
      : hasForm
        ? "form"
        : "posted"

  // Legacy single-column actions block — only used by the non-fill, non-mobile
  // standalone fallback branches below (no current caller hits these).
  const legacyActions = (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        {detailsButton}
        {rsvpNode("md")}
      </div>
      {attendeeChips && <div style={{ marginTop: 12 }}>{attendeeChips}</div>}
    </div>
  )

  // ── Mobile: single column, detail stacked below the editorial content ────────
  if (mobile) {
    let mobilePrimary: ReactNode = null
    if (primary === "image" && imageUrl) mobilePrimary = <ImageSlot url={imageUrl} mobile />
    else if (primary === "event" && eventDetail)
      mobilePrimary = (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <EventDetailInline detail={eventDetail} />
          {rsvpNode("sm")}
        </div>
      )
    else if (primary === "form") mobilePrimary = <FormInline onDetails={onDetails} />
    else mobilePrimary = <PostedInline date={postedDate} />

    const mobileDemoted: ReactNode[] = []
    if (primary === "image") {
      if (eventDetail)
        mobileDemoted.push(
          <div key="ev" style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <EventDetailInline detail={eventDetail} />
            {rsvpNode("sm")}
          </div>
        )
      if (hasForm) mobileDemoted.push(<DemotedFormLink key="form" onDetails={onDetails} />)
    } else if (primary === "event") {
      if (hasForm) mobileDemoted.push(<DemotedFormLink key="form" onDetails={onDetails} />)
    }

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
        {mobilePrimary}
        {mobileDemoted}
        {isEvent && onRsvp && !eventDetail && rsvpNode("md")}
        {detailsButton}
        {attendeeChips}
      </div>
    )
  }

  // ── Desktop ─────────────────────────────────────────────────────────────────
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

  // Carousel detail mode (fill): the 60/40 split — editorial left, priority detail
  // right; lower-priority details demote into the bottom of the 60%.
  if (fill) {
    let slot40: ReactNode
    if (primary === "image" && imageUrl) slot40 = <ImageSlot url={imageUrl} />
    else if (primary === "event" && eventDetail)
      slot40 = <EventDetailCard detail={eventDetail} rsvp={rsvpNode("md")} />
    else if (primary === "form") slot40 = <FormDetailCard onDetails={onDetails} />
    else slot40 = <PostedDetailCard date={postedDate} />

    const demoted: ReactNode[] = []
    if (primary === "image") {
      if (eventDetail)
        demoted.push(<DemotedEventRow key="ev" detail={eventDetail} rsvp={rsvpNode("sm")} />)
      if (hasForm) demoted.push(<DemotedFormLink key="form" onDetails={onDetails} />)
    } else if (primary === "event") {
      if (hasForm) demoted.push(<DemotedFormLink key="form" onDetails={onDetails} />)
    }

    return (
      <div
        style={{
          ...cardBase,
          padding: "var(--space-10) var(--space-11)",
          display: "grid",
          gridTemplateColumns: "1.5fr 1fr",
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
          <div
            style={{
              marginTop: "auto",
              paddingTop: "var(--space-9)",
              display: "flex",
              flexDirection: "column",
              gap: "var(--space-6)",
            }}
          >
            {demoted}
            {isEvent && onRsvp && !eventDetail && rsvpNode("md")}
            {detailsButton}
            {attendeeChips}
          </div>
        </div>
        {slot40}
      </div>
    )
  }

  // ── Non-fill standalone fallbacks (no current caller) ────────────────────────
  // Two-column: real event detail present → editorial left + detail card right.
  if (eventDetail) {
    return (
      <div
        style={{
          ...cardBase,
          padding: "var(--space-10) var(--space-11)",
          display: "grid",
          gridTemplateColumns: "1.5fr 1fr",
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
          <div style={{ marginTop: "auto", paddingTop: "var(--space-9)" }}>{legacyActions}</div>
        </div>
        <EventDetailCard detail={eventDetail} rsvp={rsvpNode("md")} />
      </div>
    )
  }

  // Single editorial column.
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
      <div style={{ marginTop: "auto", paddingTop: "var(--space-9)" }}>{legacyActions}</div>
    </div>
  )
}
