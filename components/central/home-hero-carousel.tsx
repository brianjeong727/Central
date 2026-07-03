"use client"

import { useState, useRef, useEffect, CSSProperties, ReactNode, TransitionEvent } from "react"
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
      imageUrl?: string | null
      hasForm?: boolean
      eventDetail?: UpNextEventDetail
      createdAt?: string
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

// ── Option A photo-slide treatment (desktop) ──────────────────────────────────
// "Light ramp + soft broad scrim, no solid panel." The clamped panel_color makes a
// LIGHT mood ramp that fades out by ~70% (photo reads through nearly everywhere); a
// separate soft radial SCRIM of near-black hugs the text for legibility. The near-
// black (#0c0a10 backdrop, 8,6,10 scrim) is intentionally darker than --ink — a true
// floor under cream text over a photo. Kept inline: one component's internal curve.
const PHOTO_BACKDROP = "#0c0a10"
const SCRIM = "8, 6, 10"
const rampBg = (c: string) =>
  `linear-gradient(90deg, rgb(${c}) 0%, rgba(${c},0.9) 4%, rgba(${c},0.46) 22%, rgba(${c},0.13) 48%, rgba(${c},0) 70%)`
const SCRIM_BG = `radial-gradient(135% 105% at 0% 52%, rgba(${SCRIM},0.5) 0%, rgba(${SCRIM},0.24) 36%, rgba(${SCRIM},0) 64%)`
const CAP_SHADOW = `0 1px 10px rgba(${SCRIM},0.28)`

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
// `bare` mode (photo slides): the frame is just the fixed-height footprint and
// centers a floating card — the card itself owns border/radius/clip so it can be
// sized to the image's aspect (see PhotoSlide desktop).
export function HeroFrame({ children, style, bare = false }: { children: ReactNode; style?: CSSProperties; bare?: boolean }) {
  return (
    <div
      style={{
        position: "relative",
        height: "var(--hero-h)",
        ...(bare
          ? { display: "flex", alignItems: "center", justifyContent: "center" }
          : { borderRadius: "var(--r-hero)", overflow: "hidden", border: "1px solid var(--line-2)" }),
        ...style,
      }}
    >
      {children}
    </div>
  )
}

// ── Constant section eyebrow above the hero ("Featured" + plum dot) ───────────
// (No arrow offset anymore — carousel nav lives BELOW the frame, so the label
// always sits flush with the frame's left edge.)
export function HeroSectionLabel({ breathe = false }: { breathe?: boolean }) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 9,
        marginBottom: "var(--space-6)",
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
// Card aspect-ratio (w/h) is clamped to this band. Inside the band the card takes the
// image's true aspect so the photo shows IN FULL (cover with matching aspect = no crop);
// outside it (extreme pano / very tall) the card clamps and cover trims to the bound.
// These two numbers + --hero-h are the dials for the size/crop tradeoff.
const CARD_AR_MIN = 0.8 // portrait floor (~4:5)
const CARD_AR_MAX = 2.1 // landscape cap (~21:10)
const CARD_AR_FALLBACK = 16 / 9 // before the image reports its natural size

function PhotoSlide({ imageUrl, panelColor, eyebrow, title, body, meta, event, mobile = false }: PhotoSlideProps) {
  const panel = panelColor || PANEL_FALLBACK

  // Desktop: measure the fixed footprint + read the image's natural aspect, then size a
  // centered card that fits inside it (contain) so the whole image is visible.
  const boxRef = useRef<HTMLDivElement>(null)
  const [box, setBox] = useState({ w: 0, h: 0 })
  const [naturalAR, setNaturalAR] = useState<number | null>(null)
  useEffect(() => {
    const el = boxRef.current
    if (!el) return
    const measure = () => setBox({ w: el.clientWidth, h: el.clientHeight })
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  const cardAR = Math.min(CARD_AR_MAX, Math.max(CARD_AR_MIN, naturalAR ?? CARD_AR_FALLBACK))
  // Fit a cardAR box inside the measured footprint (contain). Falls back to filling the
  // frame until measured (avoids a 0-size flash on first paint / SSR).
  let cardW: number | string = "100%"
  let cardH: number | string = "100%"
  if (box.w > 0 && box.h > 0) {
    let w = box.w
    let h = box.w / cardAR
    if (h > box.h) { h = box.h; w = box.h * cardAR }
    cardW = Math.round(w)
    cardH = Math.round(h)
  }

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
                    fontWeight: 500,
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

  // Desktop: full-bleed photo (Option A — "light ramp + soft broad scrim, no solid
  // panel"). The clamped panel_color becomes a LIGHT mood ramp that fades out by ~70%
  // so the photo reads through almost everywhere; a SEPARATE soft radial near-black
  // scrim hugs the text for legibility. No solid slab, no seam. Pure static CSS — SSR-safe.
  const c = rgbFromHex(panelColor)
  return (
    <div ref={boxRef} style={{ position: "relative", width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center" }}>
      {/* card sized to the image's aspect (clamped), centered in the fixed footprint — shows the whole image */}
      <div style={{ position: "relative", width: cardW, height: cardH, flexShrink: 0, borderRadius: "var(--r-hero)", overflow: "hidden", border: "1px solid var(--line-2)", background: PHOTO_BACKDROP }}>
        <img
          src={imageUrl}
          alt=""
          onLoad={(e) => { const t = e.currentTarget; if (t.naturalWidth && t.naturalHeight) setNaturalAR(t.naturalWidth / t.naturalHeight) }}
          style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover", objectPosition: "center", display: "block" }}
        />
      {/* light clamped-color mood ramp — fades out by ~70%, photo reads through */}
      <div style={{ position: "absolute", inset: 0, background: rampBg(c) }} />
      {/* soft broad radial ink scrim — hugs the text for legibility, never a panel */}
      <div style={{ position: "absolute", inset: 0, background: SCRIM_BG }} />
      {/* content */}
      <div style={{ position: "absolute", inset: 0, width: "44%", padding: "var(--space-9)", display: "flex", flexDirection: "column", zIndex: 1 }}>
        <Eyebrow text={eyebrow} />
        <div
          style={{
            fontFamily: "var(--serif)",
            fontSize: event ? 46 : 34,
            fontWeight: 600,
            letterSpacing: "-0.02em",
            lineHeight: event ? 1.02 : 1.1,
            color: "var(--cream)",
            marginTop: "var(--space-7)",
            maxWidth: "92%",
            textShadow: CAP_SHADOW,
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
          <div style={{ marginTop: "auto", fontSize: 12, color: "var(--cream)", opacity: 0.72 }}>{meta}</div>
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
                fontWeight: 500,
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

// Quiet nav chevron in the bottom controls row (desktop + mobile) — replaces
// the old flanking TallArrow / RoundArrow pills.
function NavChevron({ dir, disabled, onClick }: { dir: "prev" | "next"; disabled: boolean; onClick: () => void }) {
  const Icon = dir === "prev" ? ChevronLeft : ChevronRight
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={dir === "prev" ? "Previous slide" : "Next slide"}
      style={{
        background: "none",
        border: "none",
        padding: "var(--space-1)",
        color: "var(--muted-text)",
        display: "grid",
        placeItems: "center",
        cursor: disabled ? "default" : "pointer",
        opacity: disabled ? 0.35 : 1,
        flexShrink: 0,
      }}
    >
      <Icon style={{ width: 24, height: 24 }} />
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

// Auto-advance cadence — slow + unhurried to stay "calm, not playful".
const AUTOPLAY_MS = 7000
// Slide-transition motion — calm decelerate, no bounce ("calm, not playful").
const SLIDE_MS = 600
const SLIDE_EASE = "var(--ease-out)"

function prefersReducedMotion(): boolean {
  return typeof window !== "undefined" && !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches
}

interface HomeHeroCarouselProps {
  slides: HeroSlide[]
  // Optional Pastor Pulse lead slide — rides as slide index 0 when present (NOT a
  // HeroSlide; the interactive card is built by HomeTab and passed in whole).
  pulseNode?: ReactNode
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
  pulseNode,
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
  // Auto-advance pauses while the user is hovering/focusing the carousel.
  const [paused, setPaused] = useState(false)

  // ── Slide-transition state machine ──
  // `anim` holds the in-flight FROM→TO pair (+ direction). While it's set we render
  // BOTH slides as a 2-cell track and translate it; on transitionend we commit the
  // index and clear `anim` (back to a single resting slide). `started` gates the
  // start→end transform flip via rAF so the transition actually runs. `frozenH` keeps
  // the viewport height stable on mobile (where slides are content-height) during the
  // slide — desktop uses the fixed --hero-h frame so it never needs it.
  const [anim, setAnim] = useState<{ from: number; to: number; dir: "fwd" | "back" } | null>(null)
  const [started, setStarted] = useState(false)
  const [frozenH, setFrozenH] = useState<number>(0)
  const trackRef = useRef<HTMLDivElement>(null)
  const viewportRef = useRef<HTMLDivElement>(null)

  // Pulse lead slide: index 0 when present; data slides fill indices lead..total-1.
  const lead = pulseNode ? 1 : 0
  const total = lead + slides.length

  const safeIdx = Math.min(idx, Math.max(0, total - 1))

  // Start (or instantly perform, under reduced motion) a move to `to` in `dir`.
  // Bounded + guarded: ignores no-ops, out-of-range targets, and triggers fired
  // mid-transition (no queue — matches the "ignore" guard in the spec).
  const go = (to: number, dir: "fwd" | "back") => {
    if (to === safeIdx || to < 0 || to >= total) return
    if (anim) return
    if (prefersReducedMotion()) {
      setIdx(to)
      return
    }
    if (mobile && viewportRef.current) setFrozenH(viewportRef.current.offsetHeight)
    setStarted(false)
    setAnim({ from: safeIdx, to, dir })
  }

  // Gentle auto-rotation: advance forward (looping) every AUTOPLAY_MS. Keyed on the
  // resting index AND `anim`, so it never fires mid-transition and resets after every
  // change (auto OR manual). Pauses on hover/focus, skipped under reduced motion. The
  // wrap (last → first) is a normal forward move, so it slides forward — never rewinds.
  // NEVER auto-advances off the pulse lead slide — the user may be mid-drag on the
  // scale slider or typing an answer (manual prev/next still work: "can peek past").
  useEffect(() => {
    if (total <= 1 || paused || anim) return
    if (lead && safeIdx === 0) return
    if (prefersReducedMotion()) return
    const t = setTimeout(() => go((safeIdx + 1) % total, "fwd"), AUTOPLAY_MS)
    return () => clearTimeout(t)
  }, [safeIdx, paused, total, lead, anim])

  // Drive the start→end transform: render at the start position (no transition),
  // then flip `started` on the next frame so the transition runs. Safety timeout
  // commits even if `transitionend` never fires (e.g. unmount/interruption).
  useEffect(() => {
    if (!anim) return
    const raf = requestAnimationFrame(() => requestAnimationFrame(() => setStarted(true)))
    const safety = setTimeout(() => {
      setIdx(anim.to)
      setAnim(null)
      setStarted(false)
    }, SLIDE_MS + 120)
    return () => {
      cancelAnimationFrame(raf)
      clearTimeout(safety)
    }
  }, [anim])

  if (total === 0) return null

  const multi = total > 1
  // The dots / arrow bounds track the TARGET of an in-flight move (resting index otherwise).
  const displayIdx = anim ? anim.to : safeIdx

  // ── Build one slide's interior (+ whether it's a photo slide) ──
  const renderSlide = (s: HeroSlide): { interior: ReactNode; usePhoto: boolean } => {
    // The announcement this slide RSVPs through (events reuse their linked announcement).
    const annId =
      s.kind === "announcement"
        ? s.isEvent
          ? s.announcementId
          : null
        : s.kind === "event"
          ? s.linkedAnnouncementId
          : null
    // Inline (not slideUsesPhoto) so TS narrows the discriminated union in the branches below.
    const usePhoto = s.kind === "photo" || (s.kind === "event" && !!s.imageUrl)
    const hasDetailTarget = s.kind === "announcement" || (s.kind === "event" && !!s.linkedAnnouncementId)

    let interior: ReactNode
    if (usePhoto && s.kind === "photo") {
      interior = (
        <PhotoSlide
          imageUrl={s.imageUrl}
          panelColor={s.panelColor}
          eyebrow={s.eyebrow}
          title={s.caption}
          meta={s.meta}
          mobile={mobile}
        />
      )
    } else if (usePhoto && s.kind === "event") {
      interior = (
        <PhotoSlide
          imageUrl={s.imageUrl!}
          panelColor={s.panelColor}
          eyebrow="Up next"
          title={s.title}
          body={s.body}
          mobile={mobile}
          event={{
            dateLabel: chipDate(s.eventDetail),
            location: s.eventDetail.location,
            userHasRsvped: annId ? rsvpedIds.has(annId) : false,
            rsvping,
            onRsvp: annId ? () => onRsvp(annId) : undefined,
          }}
        />
      )
    } else {
      // Reference interior (ivory) — announcement, or event without a photo.
      const isEvent = s.kind === "event" || (s.kind === "announcement" && s.isEvent)
      const attendees = annId ? rsvpAttendees[annId] ?? [] : []
      const showAttendees = !!annId && attendees.length > 0 && (isLeaderOrAdmin || showAttendeesIds.has(annId))
      interior = (
        <UpNextCard
          fill
          label={s.kind === "announcement" ? s.eyebrowLabel ?? "Up next" : "Up next"}
          labelAccent={s.kind === "announcement" ? s.eyebrowAccent ?? true : true}
          title={s.title}
          body={s.body}
          isEvent={isEvent}
          eventDetail={s.kind === "event" ? s.eventDetail : s.kind === "announcement" ? s.eventDetail : undefined}
          imageUrl={s.kind === "announcement" ? s.imageUrl : undefined}
          hasForm={s.kind === "announcement" ? s.hasForm : undefined}
          postedDate={s.kind === "announcement" ? s.createdAt : undefined}
          userHasRsvped={annId ? rsvpedIds.has(annId) : false}
          rsvping={rsvping}
          rsvpCount={annId ? rsvpCounts[annId] ?? 0 : 0}
          attendees={attendees}
          showAttendees={showAttendees}
          onRsvp={annId ? () => onRsvp(annId) : undefined}
          onDetails={hasDetailTarget ? () => onDetails(s) : undefined}
          mobile={mobile}
        />
      )
    }
    return { interior, usePhoto }
  }

  // One slide cell by carousel index. Index 0 is the pulse lead slide when present
  // — rendered full-bleed (bare frame on desktop: the plum card owns its own
  // border/radius, no UpNextCard wrapper). Data slides shift up by `lead`.
  // Desktop wraps interiors in their own HeroFrame (border/radius/clip are
  // per-slide — bare for photos); mobile renders the interior directly (it carries
  // its own chrome), matching the previous mobile render.
  const keyAt = (i: number): string => (lead && i === 0 ? "__pulse__" : slides[i - lead].key)
  const cellContentAt = (i: number): ReactNode => {
    if (lead && i === 0) {
      return mobile ? pulseNode : <HeroFrame bare style={{ height: "100%" }}>{pulseNode}</HeroFrame>
    }
    const { interior, usePhoto } = renderSlide(slides[i - lead])
    return mobile ? interior : (
      <HeroFrame bare={usePhoto} style={{ height: "100%" }}>{interior}</HeroFrame>
    )
  }

  // ── The 2-cell track inside an overflow-hidden viewport ──
  // Cells are each one viewport wide and overflow to the right; the track itself stays
  // one viewport wide, so translateX percentages are viewport-relative. Forward order
  // is [from, to] sliding 0 → -100% (new enters from the right, old exits left); back
  // order is [to, from] sliding -100% → 0 (mirror). One resting cell when idle.
  const cellIdxs = !anim ? [safeIdx] : anim.dir === "fwd" ? [anim.from, anim.to] : [anim.to, anim.from]
  const trackTransform = !anim
    ? "translateX(0)"
    : anim.dir === "fwd"
      ? started ? "translateX(-100%)" : "translateX(0)"
      : started ? "translateX(0)" : "translateX(-100%)"
  // Only transition once we've flipped `started`; the initial start-position render
  // must snap (no transition) so the back direction doesn't flash the wrong way.
  const trackTransition = anim && started ? `transform ${SLIDE_MS}ms ${SLIDE_EASE}` : "none"

  const onTrackTransitionEnd = (e: TransitionEvent<HTMLDivElement>) => {
    if (e.target !== e.currentTarget || e.propertyName !== "transform") return
    if (!anim) return
    setIdx(anim.to)
    setAnim(null)
    setStarted(false)
  }

  const track = (
    <div
      ref={trackRef}
      onTransitionEnd={onTrackTransitionEnd}
      style={{
        display: "flex",
        height: mobile ? undefined : "100%",
        alignItems: mobile ? "flex-start" : "stretch",
        transform: trackTransform,
        transition: trackTransition,
        willChange: "transform",
      }}
    >
      {cellIdxs.map((ci) => (
        <div
          key={keyAt(ci)}
          style={{ flex: "0 0 100%", width: "100%", minWidth: 0, ...(mobile ? {} : { height: "100%" }) }}
        >
          {cellContentAt(ci)}
        </div>
      ))}
    </div>
  )

  const viewport = (
    <div
      ref={viewportRef}
      style={
        mobile
          ? { position: "relative", overflow: "hidden", width: "100%", height: anim ? frozenH : "auto" }
          : { position: "relative", overflow: "hidden", width: "100%", minWidth: 0, height: "var(--hero-h)" }
      }
    >
      {track}
    </div>
  )

  // ── Bottom controls row (desktop + mobile): prev chevron · dots · next chevron ──
  const controls = multi && (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        gap: "var(--space-6)",
        marginTop: mobile ? "var(--space-6)" : "var(--space-7)",
      }}
    >
      <NavChevron dir="prev" disabled={displayIdx === 0} onClick={() => go(safeIdx - 1, "back")} />
      <Dots count={total} active={displayIdx} onPick={(i) => go(i, i > safeIdx ? "fwd" : "back")} />
      <NavChevron dir="next" disabled={displayIdx === total - 1} onClick={() => go(safeIdx + 1, "fwd")} />
    </div>
  )

  // Full-width viewport, nav below the frame (both breakpoints).
  return (
    <div
      style={style}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocusCapture={() => setPaused(true)}
      onBlurCapture={() => setPaused(false)}
    >
      {viewport}
      {controls}
    </div>
  )
}
