"use client"
import { CSSProperties, ReactNode } from "react"
import { MONO_METRIC_STYLE } from "./typography"

// L4 · NIGHT DIVIDER — the group divider that subordinates to the L3 ruled section
// header (EventSectionHeader). Same flex:1 hairline signature, one tier down.
//
//   [name]  [date?] ──────── hairline fills ──────── [count?]
//
// NAME = sans 14 / 600 / --ink (revised 2026-08-02, Brian's hierarchy sign-off).
// It was 14/500 --muted-text, which inverted the hierarchy: the divider was
// QUIETER AND SMALLER than the row titles it introduced (15/500 --ink), so a group
// header read as a caption hanging off the rows rather than as the structure above
// them. Colour was the bigger lever of the two — bolding a --muted-text label
// would still have left it recessive against ink rows.
//
// It stays clearly subordinate to L3 (17/600 --ink) by SIZE — 14 vs 17 — which is
// the tier separation that matters once both are bold ink. Internal contrast inside
// the divider is preserved by keeping the mono date and the trailing count on
// --muted-text: bold ink name, quiet mono metadata, then the rule.
//
// The date rides MONO_METRIC_STYLE's --muted-text: the design put it on --faint,
// but --faint is the NON-TEXT tier (3.48:1) and "TUE · AUG 18" is the only place a
// night's date is stated — it must be readable.
export function NightDivider({ name, date, count, first = false, onNameClick, style }: {
  name: string
  // Mono date micro-label — feed it eventDayHeaderLabel ("TUE · AUG 18").
  date?: ReactNode
  // Trailing mono metric riding right of the rule — "0 / 2", "4 blocks".
  count?: ReactNode
  // First divider in a group stack — tightens the leading margin (the L3 header
  // above it already supplies rhythm). Replaces the design's :first-of-type rule,
  // which inline styles cannot express.
  first?: boolean
  // When the group the divider names is itself navigable (a container's night
  // drills into that night's own workspace), the NAME becomes the target. Kept on
  // the component rather than left to callers so a drillable divider can't grow a
  // second, competing typography.
  onNameClick?: () => void
  style?: CSSProperties
}) {
  const nameStyle: CSSProperties = { fontSize: 14, fontWeight: 600, color: "var(--ink)", flexShrink: 0 }
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 12, margin: `${first ? 22 : 28}px 0 10px`, ...style }}>
      {/* The name is the divider's SEMANTIC heading — one tier under the L3
          EventSectionHeader's <h2>, so <h3>. `margin: 0` + the explicit
          fontSize/fontWeight neutralise the UA h3 defaults; when the name is
          drillable the <h3> is a bare flex wrapper around the real <button> so the
          box model (and therefore the rendering) is unchanged. */}
      {onNameClick ? (
        <h3 style={{ display: "flex", margin: 0, flexShrink: 0 }}>
          <button
            type="button"
            onClick={onNameClick}
            // Color lives in the class, NOT inline — an inline `color` outranks the
            // hover rule and would silently kill the affordance.
            className="text-[var(--ink)] hover:text-[var(--plum)] transition-colors"
            style={{ ...nameStyle, color: undefined, fontFamily: "var(--sans)", background: "none", border: 0, padding: 0, textAlign: "left", cursor: "pointer" }}
          >
            {name}
          </button>
        </h3>
      ) : (
        <h3 style={{ ...nameStyle, margin: 0 }}>{name}</h3>
      )}

      {date !== undefined && date !== null && date !== false && (
        <span style={{ ...MONO_METRIC_STYLE, flexShrink: 0 }}>{date}</span>
      )}

      <span aria-hidden style={{ flex: 1, height: 1, background: "var(--line)", order: 1 }} />

      {count !== undefined && count !== null && count !== false && (
        <span style={{ ...MONO_METRIC_STYLE, flexShrink: 0, order: 2 }}>{count}</span>
      )}
    </div>
  )
}
