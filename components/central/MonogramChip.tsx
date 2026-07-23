"use client"

import type { CSSProperties } from "react"
import Image from "next/image"
import { Users } from "lucide-react"

interface MonogramChipProps {
  initials: string
  avatarUrl?: string | null
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
export function MonogramChip({ initials, avatarUrl, className = "", style, title, online = false, dotSize = 9, dotRing = "var(--cream)" }: MonogramChipProps) {
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
