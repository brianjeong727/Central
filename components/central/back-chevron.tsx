"use client"

// The canonical stacked-header back control (cdesign "Back chevron" handoff,
// ratified 2026-07-27). A muted-ink ChevronLeft that reads as navigation CHROME,
// not an action — plum stays reserved for the one accent per view. Every stacked
// screen header (subpages, chat, event, settings, auth steps) routes through this;
// no per-screen overrides. Replaces the old plum ArrowLeft in a 34×34 circle.
//
// Spec: ChevronLeft size 19, strokeWidth 1.7, round caps, no fill. Color --body,
// hover → --ink. Visual box 24×34, flush-left, no bg/radius, margin-left -3 optical
// nudge. The visible glyph stays 24px wide; the TAP target is expanded to 44×44 via
// a transparent ::after (.back-chevron in app/globals.css), never by growing the box.

import { ChevronLeft } from "lucide-react"
import type { CSSProperties } from "react"

export function BackChevron({
  onClick,
  label = "Back",
  style,
  className,
}: {
  onClick?: () => void
  /** Accessible label — "Back" or "Back to <parent>". */
  label?: string
  style?: CSSProperties
  /** Extra classes appended after `back-chevron` (e.g. `md:hidden` for a mobile-only back). */
  className?: string
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      className={className ? `back-chevron ${className}` : "back-chevron"}
      style={{
        position: "relative",
        width: 24,
        height: 34,
        flexShrink: 0,
        display: "flex",
        alignItems: "center",
        justifyContent: "flex-start",
        padding: 0,
        marginLeft: -3,
        background: "none",
        border: "none",
        color: "var(--body)",
        cursor: "pointer",
        ...style,
      }}
    >
      <ChevronLeft style={{ width: 19, height: 19 }} strokeWidth={1.7} />
    </button>
  )
}
