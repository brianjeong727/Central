"use client"

import { useState, CSSProperties } from "react"
import { ChevronLeft, ChevronRight } from "lucide-react"
import { UpNextCard, UpNextEventDetail } from "./up-next-card"

// A curated hero slide resolves to LIVE data from the entity it references
// (an announcement, or a calendar_event). Phase 1 supports these two kinds only.
export type HeroSlide =
  | {
      kind: "announcement"
      key: string
      announcementId: string
      title: string
      body: string | null
      isEvent: boolean
    }
  | {
      kind: "event"
      key: string
      calendarEventId: string
      linkedAnnouncementId: string | null
      title: string
      body: string | null
      eventDetail: UpNextEventDetail
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

// Stubbed manual nav arrow — no auto-rotation/timers/motion this phase.
function NavArrow({ dir, disabled, onClick }: { dir: "prev" | "next"; disabled: boolean; onClick: () => void }) {
  const Icon = dir === "prev" ? ChevronLeft : ChevronRight
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={dir === "prev" ? "Previous slide" : "Next slide"}
      style={{
        width: 30,
        height: 30,
        borderRadius: 999,
        border: "1px solid var(--line)",
        background: "var(--ivory)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        cursor: disabled ? "default" : "pointer",
        opacity: disabled ? 0.4 : 1,
        flexShrink: 0,
      }}
    >
      <Icon style={{ width: 16, height: 16, color: "var(--ink)" }} />
    </button>
  )
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
  // Ephemeral, manually-advanced index — intentionally NOT URL-synced (transient view state).
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
      : slide.linkedAnnouncementId

  const isEvent = slide.kind === "event" || (slide.kind === "announcement" && slide.isEvent)
  const attendees = rsvpAnnId ? rsvpAttendees[rsvpAnnId] ?? [] : []
  const showAttendees =
    !!rsvpAnnId && attendees.length > 0 && (isLeaderOrAdmin || showAttendeesIds.has(rsvpAnnId))

  // Whether this slide has a detail target. Announcement slides always do;
  // event slides only when they have a linked announcement to open. Without a
  // target the "See details" button is hidden (no dead control).
  const hasDetailTarget = slide.kind === "announcement" || slide.linkedAnnouncementId != null

  return (
    <div style={style}>
      <UpNextCard
        label="Up next"
        labelAccent
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

      {multi && (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 14,
            marginTop: 16,
          }}
        >
          <NavArrow dir="prev" disabled={safeIdx === 0} onClick={() => setIdx(safeIdx - 1)} />
          <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
            {slides.map((s, i) => (
              <button
                key={s.key}
                type="button"
                aria-label={`Go to slide ${i + 1}`}
                onClick={() => setIdx(i)}
                style={{
                  width: i === safeIdx ? 18 : 7,
                  height: 7,
                  borderRadius: 999,
                  background: i === safeIdx ? "var(--plum)" : "var(--line-2)",
                  border: "none",
                  padding: 0,
                  cursor: "pointer",
                }}
              />
            ))}
          </div>
          <NavArrow
            dir="next"
            disabled={safeIdx === slides.length - 1}
            onClick={() => setIdx(safeIdx + 1)}
          />
        </div>
      )}
    </div>
  )
}
