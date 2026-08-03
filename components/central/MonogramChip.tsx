"use client"

import type { CSSProperties } from "react"
import Image from "next/image"
import { Plus, Users } from "lucide-react"

interface MonogramChipProps {
  initials?: string
  avatarUrl?: string | null
  // UNASSIGNED SLOT variant — an empty seat is not a monogram, so it renders as a
  // dashed placeholder (§9): 38px circle, 1.5px dashed --dashed, --faint glyph,
  // transparent fill. `initials`/`avatarUrl`/`online` are ignored. Size is still
  // overridable via className/style, same contract as the filled chip.
  unassigned?: boolean
  className?: string
  style?: CSSProperties
  title?: string
  // Presence dot (--success, bottom-right, breathe glow). The chip clips its own
  // contents, so the dot lives on a same-size wrapper outside the circle.
  online?: boolean
  dotSize?: number
  // Ring color separating the dot from the avatar — match the surface behind the
  // chip (cream default; pass --ivory on pocket cards).
  dotRing?: string
}

// Single source of truth for monogram/avatar chips.
// Color (plum bg + cream text), shape (full circle), and overflow-hidden are
// structurally enforced — callers set size and font via className/style only.
export function MonogramChip({ initials = "", avatarUrl, unassigned = false, className = "", style, title, online = false, dotSize = 9, dotRing = "var(--cream)" }: MonogramChipProps) {
  if (unassigned) {
    return (
      <div
        className={`flex items-center justify-center flex-shrink-0 ${className}`}
        title={title}
        style={{
          width: 38,
          height: 38,
          ...style,
          background: "transparent",
          border: "1.5px dashed var(--dashed)",
          color: "var(--faint)",
          borderRadius: "999px",
        }}
      >
        <Plus style={{ width: 14, height: 14 }} strokeWidth={1.6} />
      </div>
    )
  }

  const chip = (
    <div
      className={`relative flex items-center justify-center flex-shrink-0 ${className}`}
      title={title}
      style={{
        ...style,
        background: "var(--plum)",
        color: "var(--cream)",
        borderRadius: "999px",
        overflow: "hidden",
      }}
    >
      {avatarUrl
        ? <Image src={avatarUrl} alt={initials} fill sizes="64px" className="object-cover" />
        : (initials && initials.trim())
          ? initials
          : <Users style={{ width: "55%", height: "55%" }} strokeWidth={2} />
      }
    </div>
  )

  if (!online) return chip

  // Dot center sits on the circle's 45° point (14.6% in from each edge) so the
  // same math lands correctly at every avatar size, 32px through 120px.
  return (
    <span className="relative inline-flex flex-shrink-0">
      {chip}
      <span
        role="img"
        aria-label="Online now"
        className="presence-dot-breathe"
        style={{
          position: "absolute",
          width: dotSize,
          height: dotSize,
          right: `calc(14.6% - ${dotSize / 2}px)`,
          bottom: `calc(14.6% - ${dotSize / 2}px)`,
          borderRadius: 999,
          background: "var(--success)",
          border: `2px solid ${dotRing}`,
          pointerEvents: "none",
        }}
      />
    </span>
  )
}
