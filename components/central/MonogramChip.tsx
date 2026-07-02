"use client"

import type { CSSProperties } from "react"
import { Users } from "lucide-react"

interface MonogramChipProps {
  initials: string
  avatarUrl?: string | null
  className?: string
  style?: CSSProperties
  title?: string
}

// Single source of truth for monogram/avatar chips.
// Color (plum bg + cream text), shape (full circle), and overflow-hidden are
// structurally enforced — callers set size and font via className/style only.
export function MonogramChip({ initials, avatarUrl, className = "", style, title }: MonogramChipProps) {
  return (
    <div
      className={`flex items-center justify-center flex-shrink-0 ${className}`}
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
        ? <img src={avatarUrl} alt={initials} className="w-full h-full object-cover" />
        : (initials && initials.trim())
          ? initials
          : <Users style={{ width: "55%", height: "55%" }} strokeWidth={2} />
      }
    </div>
  )
}
