"use client"

import { CSSProperties, ReactNode } from "react"

// DESIGN_SYSTEM §3.2 Zone-C "content header" — the single recognizable place
// create/object actions live in the body. Label on the LEFT (serif), an optional
// mono eyebrow above it, and a right-aligned `action` slot. Carries NO horizontal
// padding of its own; the host supplies the inset (e.g. a px-5 md:px-14 wrapper or
// a SubpageShell). Formalizes the de-facto Receipts "Categories" header row.
export function ContentHeader({ label, action, eyebrow, style }: {
  label: string
  action?: ReactNode
  eyebrow?: string
  style?: CSSProperties
}) {
  return (
    <div className="flex items-center justify-between gap-3" style={style}>
      <div>
        {eyebrow && (
          <p style={{ fontFamily: "var(--mono)", fontSize: 11, fontWeight: 600, letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--muted-text)", margin: "0 0 4px" }}>
            {eyebrow}
          </p>
        )}
        <span style={{ fontFamily: "var(--font-instrument-serif)", fontSize: 19, fontWeight: 500, color: "var(--ink)" }}>{label}</span>
      </div>
      {action && <div className="flex items-center gap-2" style={{ flexShrink: 0 }}>{action}</div>}
    </div>
  )
}
