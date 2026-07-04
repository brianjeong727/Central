"use client"

import { InsetHairline } from "./hairline"

// ── PlanSubTabStrip ────────────────────────────────────────────────────────────
// Single canonical tab strip used by every team page in the Plan tab.
// Implements §4.2 exactly: underline only, no pills, no segmented backgrounds.
export function PlanSubTabStrip({
  tabs,
  active,
  onChange,
  flush = false,
}: {
  tabs: readonly { key: string; label: string }[]
  active: string
  onChange: (key: string) => void
  // When true, drop the strip's own horizontal inset (label row md:pl-14 + hairline
  // md:mx-14) so it aligns to the host's padding edge instead of double-insetting.
  flush?: boolean
}) {
  return (
    // Outer div: scroll container only — no border (replaced by soft hairline below)
    <div style={{ overflowX: "auto", scrollbarWidth: "none" as const }}>
      {/* Label row: 56px left inset on desktop, aligns with TabPageHeader's px-14 */}
      <div className={flush ? undefined : "md:pl-14"} style={{ display: "flex", gap: 32 }}>
        {tabs.map(({ key, label }) => (
          <button
            key={key}
            onClick={() => onChange(key)}
            style={{
              padding: "12px 0 14px",
              fontSize: 15,
              fontFamily: "var(--font-inter)",
              fontWeight: active === key ? 600 : 400,
              color: active === key ? "var(--plum-2)" : "var(--muted-text)",
              border: "none",
              borderBottom: active === key ? "2px solid var(--plum)" : "2px solid transparent",
              marginBottom: -1,
              background: "none",
              cursor: "pointer",
              whiteSpace: "nowrap" as const,
              outline: "none",
              flexShrink: 0,
            }}
          >
            {label}
          </button>
        ))}
      </div>
      {/* Soft inset hairline — matches InsetHairline: var(--line), 0.65 opacity, 56px inset on desktop */}
      <InsetHairline className={flush ? "" : "md:mx-14"} />
    </div>
  )
}
