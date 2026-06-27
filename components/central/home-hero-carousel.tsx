"use client"

import { useState, CSSProperties, ReactNode } from "react"
import { ChevronLeft, ChevronRight } from "lucide-react"
import { UpNextCard, UpNextEventDetail } from "./up-next-card"

// A curated hero slide resolves to LIVE data from the entity it references
// (an announcement, a calendar_event), or is a standalone uploaded photo.
export type HeroSlide =
  | {
      kind: "announcement"
      key: string
      announcementId: string
      title: string
      body: string | null
      isEvent: boolean
      eyebrowLabel?: string
      eyebrowAccent?: boolean
    }
  | {
      kind: "event"
      key: string
      calendarEventId: string
      linkedAnnouncementId: string | null
      title: string
      body: string | null
      eventDetail: UpNextEventDetail
      imageUrl?: string | null
      panelColor?: string | null
    }
  | {
      kind: "photo"
      key: string
      imageUrl: string
      caption: string
      eyebrow: string
      panelColor?: string | null
      meta?: string | null
    }

// Fallback panel color when a stored clamped color is missing (darkest brand token).
const PANEL_FALLBACK = "var(--plum-deep)"
// --plum-deep components, for the gradient when no stored clamped color exists.
const PANEL_FALLBACK_RGB = "27, 10, 30"
// Tall side-pill arrow width — component constant (no spacing token for chrome width).
const ARROW_W = 54

// "#rrggbb" → "r, g, b" for building the clamped-color gradient stops.
function rgbFromHex(hex?: string | null): string {
  if (!hex) return PANEL_FALLBACK_RGB
  const m = hex.replace("#", "")
  if (m.length < 6) return PANEL_FALLBACK_RGB
  const r = parseInt(m.slice(0, 2), 16)
  const g = parseInt(m.slice(2, 4), 16)
  const b = parseInt(m.slice(4, 6), 16)
  if ([r, g, b].some(Number.isNaN)) return PANEL_FALLBACK_RGB
  return `${r}, ${g}, ${b}`
}

// ── Shared frame: single source of truth for height/radius/border/clip ───────
// Owns the border, radius (--r-hero), and overflow so every slide interior fills
// the same --hero-h frame. Used by the carousel AND the home-tab fallback.
export function HeroFrame({ children, style }: { children: ReactNode; style?: CSSProperties }) {
  return (
    <div
      style={{
        position: "relative",
        height: "var(--hero-h)",
        borderRadius: "var(--r-hero)",
        overflow: "hidden",
        border: "1px solid var(--line-2)",
        ...style,
      }}
    >
      {children}
    </div>
  )
}

// ── Constant section eyebrow above the hero ("Featured" + plum dot) ───────────
export function HeroSectionLabel({ offsetForArrows = false, breathe = false }: { offsetForArrows?: boolean; breathe?: boolean }) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 9,
        marginBottom: "var(--space-6)",
        paddingLeft: offsetForArrows ? `calc(${ARROW_W}px + var(--space-6))` : 0,
      }}
    >
      <span className={breathe ? "greeting-dot-breathe" : undefined} style={{ width: 7, height: 7, borderRadius: "50%", background: "var(--plum)" }} />
      <span
        style={{
          fontFamily: "var(--mono)",
          fontSize: 12,
          letterSpacing: "0.12em",
          textTransform: "uppercase",
          color: "var(--muted-text)",
        }}
      >
        Featured
      </span>
    </div>
  )
}

// Compact date range for the event glass chip (e.g. "Oct 24–26").
function chipDate(detail: UpNextEventDetail): string {
  const s = new Date(detail.startDate)
  const e = new Date(detail.endDate)
  const mo = (d: Date) => d.toLocaleDateString("en-US", { month: "short" })
  const sameDay = s.toDateString() === e.toDateString()
  if (sameDay) return `${mo(s)} ${s.getDate()}`
  if (s.getMonth() === e.getMonth()) return `${mo(s)} ${s.getDate()}–${e.getDate()}`
  return `${mo(s)} ${s.getDate()} – ${mo(e)} ${e.getDate()}`
}

interface PhotoSlideProps {
  imageUrl: string
  panelColor?: string | null
  eyebrow: string
  title: string
  body?: string | null
  meta?: string | null
  event?: {
    dateLabel: string
    location: string | null
    userHasRsvped: boolean
    rsvping: boolean
    onRsvp?: () => void
  } | null
  mobile?: boolean
}

// Photo interior — full-height image with an adaptive dark panel on the left.
// The panel is filled with the STORED clamped color (panel_color), not a live
// blur; an ink-based scrim sits on top purely for cream-text legibility.
function PhotoSlide({ imageUrl, panelColor, eyebrow, title, body, meta, event, mobile = false }: PhotoSlideProps) {
  const panel = panelColor || PANEL_FALLBACK

  if (mobile) {
    return (
      <div
        style={{
          position: "relative",
          width: "100%",
          height: 280,
          borderRadius: "var(--r-hero)",
          overflow: "hidden",
          border: "1px solid var(--line-2)",
          background: panel,
        }}
      >
        <img src={imageUrl} alt="" style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
        {/* ink scrim, bottom-weighted for legibility */}
        <div
          style={{
            position: "absolute",
            inset: 0,
            background: "linear-gradient(180deg, rgba(19,16,26,0.10) 35%, rgba(19,16,26,0.66) 100%)",
          }}
        />
        <div style={{ position: "absolute", left: 0, right: 0, bottom: 0, padding: "var(--space-7)", display: "flex", flexDirection: "column", gap: 6 }}>
          <Eyebrow text={eyebrow} />
          <div style={{ fontFamily: "var(--serif)", fontSize: 24, fontWeight: 600, letterSpacing: "-0.015em", lineHeight: 1.1, color: "var(--cream)" }}>
            {title}
          </div>
          {event && (
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 4 }}>
              <span style={{ fontSize: 13, color: "var(--cream)", opacity: 0.85, fontWeight: 500 }}>{event.dateLabel}</span>
              {event.location && <span style={{ fontSize: 12, color: "var(--cream)", opacity: 0.7 }}>· {event.location}</span>}
              {event.onRsvp && (
                <button
                  onClick={event.onRsvp}
                  disabled={event.rsvping}
                  style={{
                    marginLeft: "auto",
                    background: "var(--cream)",
                    color: "var(--plum-2)",
                    border: "none",
                    borderRadius: "var(--r-chip)",
                    padding: "var(--space-2) var(--space-5)",
                    fontSize: 12,
                    fontWeight: 600,
                    cursor: "pointer",
                    fontFamily: "var(--sans)",
                  }}
                >
                  {event.userHasRsvped ? "Going ✓" : "RSVP"}
                </button>
              )}
            </div>
          )}
          {meta && !event && <div style={{ fontSize: 12, color: "var(--cream)", opacity: 0.7 }}>{meta}</div>}
        </div>
      </div>
    )
  }

  // Desktop: full-bleed photo; the clamped panel_color fades to transparent
  // across the seam (Option B) over a left-anchored ink legibility scrim, so the
  // image emerges out of the color with no hard slab edge. The solid-vs-clear
  // ratio is the single --hero-panel-fade knob. Pure static CSS — SSR-safe, no blur.
  const c = rgbFromHex(panelColor)
  return (
    <div style={{ position: "relative", height: "100%", width: "100%", background: panel }}>
      <img
        src={imageUrl}
        alt=""
        style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover", objectPosition: "75% center", display: "block" }}
      />
      {/* ink legibility scrim — left-anchored, --ink-token based (the hard floor) */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          background:
            "linear-gradient(90deg, color-mix(in srgb, var(--ink) 72%, transparent) 0%, color-mix(in srgb, var(--ink) 50%, transparent) 34%, transparent 60%)",
        }}
      />
      {/* clamped panel_color → transparent across the seam (Option B) */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          background: `linear-gradient(90deg, rgba(${c}, 0.96) 0%, rgba(${c}, 0.88) var(--hero-panel-fade), rgba(${c}, 0) 100%)`,
        }}
      />
      {/* content */}
      <div style={{ position: "absolute", inset: 0, width: "44%", padding: "var(--space-10)", display: "flex", flexDirection: "column", zIndex: 1 }}>
        <Eyebrow text={eyebrow} />
        <div
          style={{
            fontFamily: "var(--serif)",
            fontSize: event ? 46 : 34,
            fontWeight: 600,
            letterSpacing: "-0.015em",
            lineHeight: event ? 1.02 : 1.1,
            color: "var(--cream)",
            marginTop: "var(--space-7)",
            maxWidth: "92%",
          }}
        >
          {title}
        </div>
        {body && (
          <p className="line-clamp-2" style={{ fontSize: 15, color: "var(--cream)", opacity: 0.72, marginTop: "var(--space-5)", lineHeight: 1.5, maxWidth: "92%" }}>
            {body}
          </p>
        )}
        {meta && !event && (
          <div style={{ marginTop: "auto", fontSize: 14, color: "var(--cream)", opacity: 0.62 }}>{meta}</div>
        )}
      </div>
      {/* event glass chip — surgical backdrop-blur material (contained to this chip) */}
      {event && (
        <div
          style={{
            position: "absolute",
            right: "var(--space-8)",
            bottom: "var(--space-8)",
            zIndex: 2,
            background: "rgba(253,252,248,0.16)",
            backdropFilter: "blur(16px)",
            WebkitBackdropFilter: "blur(16px)",
            border: "1px solid rgba(253,252,248,0.22)",
            borderRadius: "var(--r-card)",
            padding: "var(--space-5) var(--space-6)",
            display: "flex",
            alignItems: "center",
            gap: "var(--space-6)",
          }}
        >
          <div>
            <div style={{ fontFamily: "var(--serif)", fontSize: 18, fontWeight: 600, color: "var(--cream)", lineHeight: 1 }}>
              {event.dateLabel}
            </div>
            {event.location && <div style={{ fontSize: 12, color: "var(--cream)", opacity: 0.7, marginTop: 3 }}>{event.location}</div>}
          </div>
          {event.onRsvp && (
            <button
              onClick={event.onRsvp}
              disabled={event.rsvping}
              style={{
                background: "var(--cream)",
                color: "var(--plum-2)",
                border: "none",
                borderRadius: "var(--r-chip)",
                padding: "var(--space-3) var(--space-6)",
                fontSize: 13,
                fontWeight: 600,
                cursor: "pointer",
                fontFamily: "var(--sans)",
              }}
            >
              {event.userHasRsvped ? "Going ✓" : "RSVP"}
            </button>
          )}
        </div>
      )}
    </div>
  )
}

// Cream eyebrow over a dark photo — cream dot (NOT gold) preserves the constant
// dot identity while staying legible. Uses --cream everywhere (no over-dark token).
function Eyebrow({ text }: { text: string }) {
  return (
    <div style={{ display: "inline-flex", alignItems: "center", gap: 9 }}>
      <span style={{ width: 8, height: 8, borderRadius: "50%", background: "var(--cream)", flexShrink: 0 }} />
      <span
        style={{
          fontFamily: "var(--mono)",
          fontSize: 12,
          letterSpacing: "0.1em",
          textTransform: "uppercase",
          color: "var(--cream)",
          opacity: 0.85,
        }}
      >
        {text}
      </span>
    </div>
  )
}

// Tall flanking nav pill (desktop) — cream/line tokens, hover → ivory/plum-2.
function TallArrow({ dir, disabled, onClick }: { dir: "prev" | "next"; disabled: boolean; onClick: () => void }) {
  const [hover, setHover] = useState(false)
  const Icon = dir === "prev" ? ChevronLeft : ChevronRight
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={dir === "prev" ? "Previous slide" : "Next slide"}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        flexShrink: 0,
        width: ARROW_W,
        alignSelf: "stretch",
        border: "1px solid var(--line-2)",
        background: !disabled && hover ? "var(--ivory)" : "var(--cream-2)",
        color: !disabled && hover ? "var(--plum-2)" : "var(--body)",
        borderRadius: "var(--r-pill-lg)",
        cursor: disabled ? "default" : "pointer",
        opacity: disabled ? 0.4 : 1,
        display: "grid",
        placeItems: "center",
        transition: "background var(--dur-fast) var(--ease-out), color var(--dur-fast) var(--ease-out)",
      }}
    >
      <Icon style={{ width: 22, height: 22 }} />
    </button>
  )
}

// Small round nav pill (mobile).
function RoundArrow({ dir, disabled, onClick }: { dir: "prev" | "next"; disabled: boolean; onClick: () => void }) {
  const Icon = dir === "prev" ? ChevronLeft : ChevronRight
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={dir === "prev" ? "Previous slide" : "Next slide"}
      style={{
        width: 44,
        height: 44,
        borderRadius: 999,
        border: "1px solid var(--line-2)",
        background: "var(--cream-2)",
        color: "var(--body)",
        display: "grid",
        placeItems: "center",
        cursor: disabled ? "default" : "pointer",
        opacity: disabled ? 0.4 : 1,
        flexShrink: 0,
      }}
    >
      <Icon style={{ width: 18, height: 18 }} />
    </button>
  )
}

function Dots({ count, active, onPick }: { count: number; active: number; onPick: (i: number) => void }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
      {Array.from({ length: count }).map((_, i) => (
        <button
          key={i}
          type="button"
          aria-label={`Go to slide ${i + 1}`}
          onClick={() => onPick(i)}
          style={{
            width: i === active ? 24 : 8,
            height: 8,
            borderRadius: 999,
            background: i === active ? "var(--plum-2)" : "var(--dashed)",
            border: "none",
            padding: 0,
            cursor: "pointer",
          }}
        />
      ))}
    </div>
  )
}

interface HomeHeroCarouselProps {
  slides: HeroSlide[]
  mobile?: boolean
  // RSVP state keyed by announcement_id — reuses the existing announcement RSVP wiring.
  rsvpedIds: Set<string>
  rsvpCounts: Record<string, number>
  rsvpAttendees: Record<string, { user_id: string; name: string }[]>
  showAttendeesIds: Set<string>
  isLeaderOrAdmin: boolean
  rsvping: boolean
  onRsvp: (announcementId: string) => void
  onDetails: (slide: HeroSlide) => void
  style?: CSSProperties
}

export function HomeHeroCarousel({
  slides,
  mobile = false,
  rsvpedIds,
  rsvpCounts,
  rsvpAttendees,
  showAttendeesIds,
  isLeaderOrAdmin,
  rsvping,
  onRsvp,
  onDetails,
  style,
}: HomeHeroCarouselProps) {
  // Ephemeral, manually-advanced index — intentionally NOT URL-synced.
  const [idx, setIdx] = useState(0)

  if (slides.length === 0) return null

  const safeIdx = Math.min(idx, slides.length - 1)
  const slide = slides[safeIdx]
  const multi = slides.length > 1

  // The announcement this slide RSVPs through (event slides reuse their linked announcement).
  const rsvpAnnId =
    slide.kind === "announcement"
      ? slide.isEvent
        ? slide.announcementId
        : null
      : slide.kind === "event"
        ? slide.linkedAnnouncementId
        : null

  const usePhoto = slide.kind === "photo" || (slide.kind === "event" && !!slide.imageUrl)
  const hasDetailTarget = slide.kind === "announcement" || (slide.kind === "event" && !!slide.linkedAnnouncementId)

  // ── Build the interior for the active slide ──
  let interior: ReactNode
  if (usePhoto && slide.kind === "photo") {
    interior = (
      <PhotoSlide
        imageUrl={slide.imageUrl}
        panelColor={slide.panelColor}
        eyebrow={slide.eyebrow}
        title={slide.caption}
        meta={slide.meta}
        mobile={mobile}
      />
    )
  } else if (usePhoto && slide.kind === "event") {
    interior = (
      <PhotoSlide
        imageUrl={slide.imageUrl!}
        panelColor={slide.panelColor}
        eyebrow="Up next"
        title={slide.title}
        body={slide.body}
        mobile={mobile}
        event={{
          dateLabel: chipDate(slide.eventDetail),
          location: slide.eventDetail.location,
          userHasRsvped: rsvpAnnId ? rsvpedIds.has(rsvpAnnId) : false,
          rsvping,
          onRsvp: rsvpAnnId ? () => onRsvp(rsvpAnnId) : undefined,
        }}
      />
    )
  } else {
    // Reference interior (ivory) — announcement, or event without a photo.
    const isEvent = slide.kind === "event" || (slide.kind === "announcement" && slide.isEvent)
    const attendees = rsvpAnnId ? rsvpAttendees[rsvpAnnId] ?? [] : []
    const showAttendees = !!rsvpAnnId && attendees.length > 0 && (isLeaderOrAdmin || showAttendeesIds.has(rsvpAnnId))
    interior = (
      <UpNextCard
        fill
        label={slide.kind === "announcement" ? slide.eyebrowLabel ?? "Up next" : "Up next"}
        labelAccent={slide.kind === "announcement" ? slide.eyebrowAccent ?? true : true}
        title={slide.title}
        body={slide.body}
        isEvent={isEvent}
        eventDetail={slide.kind === "event" ? slide.eventDetail : undefined}
        userHasRsvped={rsvpAnnId ? rsvpedIds.has(rsvpAnnId) : false}
        rsvping={rsvping}
        rsvpCount={rsvpAnnId ? rsvpCounts[rsvpAnnId] ?? 0 : 0}
        attendees={attendees}
        showAttendees={showAttendees}
        onRsvp={rsvpAnnId ? () => onRsvp(rsvpAnnId) : undefined}
        onDetails={hasDetailTarget ? () => onDetails(slide) : undefined}
        mobile={mobile}
      />
    )
  }

  // ── Mobile: interior + round arrows + dots below ──
  if (mobile) {
    return (
      <div style={style}>
        {interior}
        {multi && (
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 14, marginTop: "var(--space-6)" }}>
            <RoundArrow dir="prev" disabled={safeIdx === 0} onClick={() => setIdx(safeIdx - 1)} />
            <Dots count={slides.length} active={safeIdx} onPick={setIdx} />
            <RoundArrow dir="next" disabled={safeIdx === slides.length - 1} onClick={() => setIdx(safeIdx + 1)} />
          </div>
        )}
      </div>
    )
  }

  // ── Desktop: tall flanking arrows + framed interior + dots below ──
  return (
    <div style={style}>
      <div style={{ display: "flex", alignItems: "stretch", gap: "var(--space-6)" }}>
        {multi && <TallArrow dir="prev" disabled={safeIdx === 0} onClick={() => setIdx(safeIdx - 1)} />}
        <HeroFrame style={{ flex: 1, minWidth: 0 }}>{interior}</HeroFrame>
        {multi && <TallArrow dir="next" disabled={safeIdx === slides.length - 1} onClick={() => setIdx(safeIdx + 1)} />}
      </div>
      {multi && (
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", marginTop: "var(--space-7)" }}>
          <Dots count={slides.length} active={safeIdx} onPick={setIdx} />
        </div>
      )}
    </div>
  )
}
