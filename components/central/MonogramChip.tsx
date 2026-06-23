"use client"

import type { CSSProperties } from "react"

interface MonogramChipProps {
  initials: string
  className?: string
  style?: CSSProperties
}

// Single source of truth for avatar/monogram chip color.
// Background (plum) and text (cream) are structurally enforced — spread AFTER
// any caller style so they can never be overridden.
export function MonogramChip({ initials, className = "", style }: MonogramChipProps) {
  return (
    <div
      className={`flex items-center justify-center flex-shrink-0 overflow-hidden font-bold ${className}`}
      style={{
        ...style,
        background: "var(--plum)",
        color: "var(--cream)",
      }}
    >
      {initials}
    </div>
  )
}
