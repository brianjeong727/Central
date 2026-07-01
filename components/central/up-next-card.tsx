"use client"

import { CSSProperties, ReactNode } from "react"
import { ClipboardList } from "lucide-react"
import { CentralButton } from "./button"

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

// Structured date parts for the BIG serif anchor in the 40% detail slot.
function dateParts(iso: string) {
  const d = new Date(iso)
  return {
    weekday: d.toLocaleDateString("en-US", { weekday: "long" }),
    monthDay: d.toLocaleDateString("en-US", { month: "short", day: "numeric" }),
    year: d.toLocaleDateString("en-US", { year: "numeric" }),
    time: d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" }),
  }
}

// Compact "Mon DD · time" line used for the demoted event meta-row value.
function eventWhenCompact(detail: UpNextEventDetail): string {
  const p = dateParts(detail.startDate)
  return detail.allDay ? `${p.monthDay} · All day` : `${p.monthDay} · ${p.time}`
}

// ── Direction A typography tokens for the 40% panel + demoted meta-list ───────
// Mono micro-label inside the 40% panel ("Event" / "Form" / "Posted").
const MONO_RPANEL: CSSProperties = {
  fontFamily: "var(--mono)",
  fontSize: 11,
  letterSpacing: "0.12em",
  textTransform: "uppercase",
  color: "var(--muted-text)",
}

// Mono micro-label inside a demoted meta-row.
const MONO_DEM: CSSProperties = {
  fontFamily: "var(--mono)",
  fontSize: 10,
  letterSpacing: "0.14em",
  textTransform: "uppercase",
  color: "var(--muted-text)",
}

// Weekday line above the big date.
const EV_WK: CSSProperties = {
  fontFamily: "var(--sans)",
  fontSize: 16,
  fontWeight: 600,
  color: "var(--ink)",
}

// Big serif date anchor — the focal point of the 40% slot. Serif weight 600 is
// the approved §1.3 "Date anchor" exception (scoped to this featured card).
const BIG_SERIF_DATE: CSSProperties = {
  fontFamily: "var(--serif)",
  fontSize: 36,
  fontWeight: 600,
  letterSpacing: "-0.02em",
  lineHeight: 1,
  color: "var(--ink)",
}

// Event time — sits below the big date.
const EV_TIME: CSSProperties = {
  fontFamily: "var(--sans)",
  fontSize: 22,
  color: "var(--ink)",
}

// Form headline — serif display, weight 600 (heading-tier emphasis).
const FORM_H: CSSProperties = {
  fontFamily: "var(--serif)",
  fontSize: 22,
  fontWeight: 600,
  lineHeight: 1.1,
  color: "var(--ink)",
}

// Year line beneath the posted date.
const POSTED_YR: CSSProperties = {
  fontFamily: "var(--sans)",
  fontSize: 15,
  color: "var(--faint)",
}

// Demoted meta-row value (left of the plum-outline action).
const DEM_VAL: CSSProperties = {
  fontFamily: "var(--sans)",
  fontSize: 14,
  fontWeight: 500,
  color: "var(--ink)",
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
  // label / labelAccent are retained for the API but the inner eyebrow is gone —
  // the carousel's "Featured" section label is the single accent and the title leads.
  label: _label,
  labelAccent: _labelAccent = true,
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
  void _label
  void _labelAccent
  const maxAttendees = mobile ? 6 : 8
  const bodyText = body ? body.replace(/\n+/g, " ") : null

  // fill mode (carousel slide): ivory surface fills the HeroFrame, which owns the
  // border/radius/clip. Standalone mode keeps its own soft-callout chrome (--r-hero).
  const cardBase: CSSProperties = fill
    ? { background: "var(--ivory)", height: "100%", boxSizing: "border-box", ...style }
    : {
        background: "var(--ivory)",
        border: "1px solid var(--line-2)",
        borderRadius: "var(--r-hero)",
        ...style,
      }

  // ── Buttons (SNAP to CentralButton) ─────────────────────────────────────────
  // Primary "See details" = plum fill. RSVP / form / demoted actions = plum-outline.
  const detailsButton = onDetails ? (
    <CentralButton variant="primary" onClick={onDetails}>
      {isEvent ? "See details" : "See announcement"}
    </CentralButton>
  ) : null

  // RSVP with "N going" count — used in the 40% event panel where there's room.
  const rsvpFull = (size: "sm" | "md"): ReactNode =>
    isEvent && onRsvp ? (
      <div style={{ display: "flex", alignItems: "center", gap: "var(--space-4)" }}>
        <CentralButton size={size} variant="plum-outline" onClick={onRsvp} disabled={rsvping}>
          {userHasRsvped ? "Going ✓" : "RSVP"}
        </CentralButton>
        {rsvpCount > 0 && (
          <span style={{ fontSize: 12, color: "var(--faint)", fontWeight: 500 }}>{rsvpCount} going</span>
        )}
      </div>
    ) : null

  // RSVP button only — used in the tight demoted meta-row.
  const rsvpCompact = (size: "sm" | "md"): ReactNode =>
    isEvent && onRsvp ? (
      <CentralButton size={size} variant="plum-outline" onClick={onRsvp} disabled={rsvping}>
        {userHasRsvped ? "Going ✓" : "RSVP"}
      </CentralButton>
    ) : null

  const formBtn = (size: "sm" | "md"): ReactNode =>
    onDetails ? (
      <CentralButton size={size} variant="plum-outline" onClick={onDetails}>
        View / Fill out
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

  // 40% panel content (shared by desktop seam-panel + mobile stacked section).
  const detailContent = (): ReactNode => {
    if (primary === "event" && eventDetail) {
      const p = dateParts(eventDetail.startDate)
      const r = rsvpFull("md")
      return (
        <>
          <div style={MONO_RPANEL}>Event</div>
          <div style={{ ...EV_WK, marginTop: "var(--space-7)" }}>{p.weekday}</div>
          <div style={{ ...BIG_SERIF_DATE, marginTop: "var(--space-2)" }}>{p.monthDay}</div>
          <div style={{ ...EV_TIME, marginTop: "var(--space-4)" }}>
            {eventDetail.allDay ? "All day" : p.time}
          </div>
          {r && <div style={{ marginTop: "var(--space-8)" }}>{r}</div>}
        </>
      )
    }
    if (primary === "form") {
      const b = formBtn("md")
      return (
        <>
          <div style={MONO_RPANEL}>Form</div>
          <ClipboardList
            style={{ width: 30, height: 30, color: "var(--plum-2)", marginTop: "var(--space-7)", flexShrink: 0 }}
          />
          <div style={{ ...FORM_H, marginTop: "var(--space-5)" }}>Includes a form</div>
          {b && <div style={{ marginTop: "var(--space-8)" }}>{b}</div>}
        </>
      )
    }
    // posted
    return (
      <>
        <div style={MONO_RPANEL}>Posted</div>
        {postedDate ? (
          <>
            <div style={{ ...BIG_SERIF_DATE, marginTop: "var(--space-7)" }}>
              {dateParts(postedDate).monthDay}
            </div>
            <div style={{ ...POSTED_YR, marginTop: "var(--space-3)" }}>{dateParts(postedDate).year}</div>
          </>
        ) : (
          <div style={{ ...BIG_SERIF_DATE, marginTop: "var(--space-7)", color: "var(--faint)" }}>—</div>
        )}
      </>
    )
  }

  // ── Demoted meta-list (whatever priority didn't win) ─────────────────────────
  const demRow = (key: string, label: string, value: string, action: ReactNode): ReactNode => (
    <div
      key={key}
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: "var(--space-7)",
      }}
    >
      <div style={{ minWidth: 0 }}>
        <div style={MONO_DEM}>{label}</div>
        <div style={{ ...DEM_VAL, marginTop: "var(--space-1)" }}>{value}</div>
      </div>
      {action}
    </div>
  )

  const demRows: ReactNode[] = []
  if (primary === "image") {
    if (eventDetail) demRows.push(demRow("ev", "Event", eventWhenCompact(eventDetail), rsvpCompact("sm")))
    if (hasForm) demRows.push(demRow("form", "Form", "Sign-up form", formBtn("sm")))
  } else if (primary === "event") {
    if (hasForm) demRows.push(demRow("form", "Form", "Sign-up form", formBtn("sm")))
  }

  const demotedBlock =
    demRows.length > 0 ? (
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: "var(--space-6)",
          marginBottom: "var(--space-8)",
          paddingTop: "var(--space-7)",
          borderTop: "1px solid var(--line)",
        }}
      >
        {demRows}
      </div>
    ) : null

  // ── Mobile: single column — title leads, 40% detail + demoted list stacked ────
  if (mobile) {
    const mobilePrimary: ReactNode =
      primary === "image" && imageUrl ? (
        <div
          style={{
            height: 180,
            borderRadius: "var(--r-input)",
            overflow: "hidden",
            border: "1px solid var(--line)",
          }}
        >
          <img
            src={imageUrl}
            alt=""
            style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
          />
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-start" }}>
          {detailContent()}
        </div>
      )

    return (
      <div
        style={{
          ...cardBase,
          padding: "var(--space-8)",
          display: "flex",
          flexDirection: "column",
          gap: "var(--space-6)",
        }}
      >
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
        {demotedBlock}
        {isEvent && onRsvp && !eventDetail && rsvpFull("md")}
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
        fontSize: 30,
        fontWeight: 600,
        letterSpacing: "-0.02em",
        lineHeight: 1.08,
        color: "var(--ink)",
        margin: 0,
      }}
    >
      {title}
    </h2>
  )

  // Carousel detail mode (fill): 60/40 flex split — editorial left, priority detail
  // right (flush against a hairline seam, no nested box; image case full-bleed).
  if (fill) {
    const rightRegion: ReactNode =
      primary === "image" && imageUrl ? (
        <div style={{ flex: 1, minWidth: 0, position: "relative", display: "flex" }}>
          <img
            src={imageUrl}
            alt=""
            style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
          />
        </div>
      ) : (
        <div
          style={{
            flex: 1,
            minWidth: 0,
            position: "relative",
            display: "flex",
            borderLeft: "1px solid var(--line)",
          }}
        >
          <div
            style={{
              flex: 1,
              display: "flex",
              flexDirection: "column",
              justifyContent: "center",
              alignItems: "flex-start",
              padding: "var(--space-10)",
            }}
          >
            {detailContent()}
          </div>
        </div>
      )

    return (
      <div style={{ ...cardBase, display: "flex", minWidth: 0 }}>
        <div
          style={{
            flex: "0 0 60%",
            minWidth: 0,
            display: "flex",
            flexDirection: "column",
            padding: "var(--space-10)",
          }}
        >
          <div>
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
          <div style={{ marginTop: "auto" }}>
            {demotedBlock}
            {isEvent && onRsvp && !eventDetail && (
              <div style={{ marginBottom: "var(--space-6)" }}>{rsvpFull("md")}</div>
            )}
            {detailsButton && <div>{detailsButton}</div>}
            {attendeeChips && <div style={{ marginTop: "var(--space-5)" }}>{attendeeChips}</div>}
          </div>
        </div>
        {rightRegion}
      </div>
    )
  }

  // ── Non-fill standalone fallback (no current caller) — single editorial column ─
  return (
    <div
      style={{
        ...cardBase,
        padding: "var(--space-10) var(--space-11)",
        display: "flex",
        flexDirection: "column",
      }}
    >
      <div style={{ maxWidth: 620 }}>
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
      <div style={{ marginTop: "auto", paddingTop: "var(--space-9)" }}>
        {isEvent && onRsvp && !eventDetail && (
          <div style={{ marginBottom: "var(--space-6)" }}>{rsvpFull("md")}</div>
        )}
        {detailsButton && <div>{detailsButton}</div>}
        {attendeeChips && <div style={{ marginTop: "var(--space-5)" }}>{attendeeChips}</div>}
      </div>
    </div>
  )
}
