"use client"
import { ReactNode } from "react"

// Unified body section header for the event workspace sub-tabs (Overview's
// single-line display title, no eyebrow). Title on the left (instrument-serif
// display), optional right-aligned action slot for CTAs / meta.
export function EventSectionHeader({ title, action }: { title: string; action?: ReactNode }) {
  return (
    <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 18, marginBottom: 28, flexWrap: "wrap" }}>
      <h2 style={{ fontFamily: "var(--font-instrument-serif)", fontSize: 32, fontWeight: 600, color: "var(--ink)", lineHeight: 1.1, letterSpacing: -0.4, margin: 0 }}>{title}</h2>
      {action && <div style={{ display: "flex", alignItems: "center", gap: 12, flexShrink: 0 }}>{action}</div>}
    </div>
  )
}
