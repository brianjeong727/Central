"use client"
import { CSSProperties, ReactNode } from "react"
import { MONO_METRIC_STYLE } from "./typography"

// L1 · EVENT META LINE — the persistent identity metadata that sits directly under
// an event's page title. NOT a §1.3 date anchor (that pattern is scoped to the
// featured card + announcement aside); this is a quiet single line of facts.
//
//   Aug 18 – Aug 29  12 days      The Cut, CMU      in 17 days
//   └──── group ─────┘            └── group ──┘     └─ group ─┘
//
// Every value must arrive already formatted by the canonical helpers in
// app/home/utils.ts / lib/tz.ts (Convention #23) — this component does no date
// math and holds no zone knowledge. components/central is a LEAF.
export function EventMetaLine({ range, duration, location, countdown, style }: {
  // Date range — feed it eventDateRangeShort ("Aug 18 – Aug 29", no weekdays).
  range?: ReactNode
  // Mono span metric — feed it eventDaySpan ("12 days").
  duration?: ReactNode
  location?: ReactNode
  // Mono countdown metric — feed it countdownLabel ("in 17 days").
  countdown?: ReactNode
  style?: CSSProperties
}) {
  const has = (v: ReactNode) => v !== undefined && v !== null && v !== false && v !== ""
  if (!has(range) && !has(duration) && !has(location) && !has(countdown)) return null

  return (
    <div
      style={{
        display: "flex",
        flexWrap: "wrap",
        alignItems: "center",
        gap: "4px 22px",
        marginTop: 10,
        fontSize: 14,
        color: "var(--body)",
        ...style,
      }}
    >
      {(has(range) || has(duration)) && (
        <span style={{ display: "flex", alignItems: "center", gap: 10 }}>
          {has(range) && <span>{range}</span>}
          {has(duration) && <span style={MONO_METRIC_STYLE}>{duration}</span>}
        </span>
      )}

      {has(location) && (
        <span style={{ display: "flex", alignItems: "center", gap: 10 }}>{location}</span>
      )}

      {has(countdown) && (
        <span style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span style={MONO_METRIC_STYLE}>{countdown}</span>
        </span>
      )}
    </div>
  )
}
