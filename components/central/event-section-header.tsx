"use client"
import { ReactNode } from "react"

// Unified body section header for the event workspace sub-tabs (Overview's
// single-line display title, no eyebrow). Title on the left (instrument-serif
// display), optional right-aligned action slot for CTAs / meta.
// Responsive: 32px is desktop type — phone width (mobile spec: no type >22px)
// drops to 21/600 via classes (size/tracking must NOT be inline or md: can't win).
export function EventSectionHeader({ title, action }: { title: string; action?: ReactNode }) {
  return (
    <div className="mb-[18px] md:mb-[28px]" style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 18, flexWrap: "wrap" }}>
      <h2 className="text-[21px] tracking-[-0.3px] md:text-[32px] md:tracking-[-0.4px]" style={{ fontFamily: "var(--font-instrument-serif)", fontWeight: 600, color: "var(--ink)", lineHeight: 1.1, margin: 0 }}>{title}</h2>
      {action && <div style={{ display: "flex", alignItems: "center", gap: 12, flexShrink: 0 }}>{action}</div>}
    </div>
  )
}
