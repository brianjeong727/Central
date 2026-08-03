"use client"
import { ReactNode } from "react"
import { MONO_METRIC_STYLE } from "./typography"

// L3 · RULED SECTION HEADER — the unified body section header for the event
// workspace sub-tabs. Declared an H3-tier ruled label (NOT a §1.3 section H2), so
// the "mono eyebrow above every section H2" rule does not bind: this header takes
// no eyebrow. Do not add one.
//
//   [label] [count?] [meta?] ──── hairline fills ──── [trailing?] [action?]
//
// The flex:1 hairline is the signature of the pattern: the rule is the section
// divider AND the rail its state/action ride on. InsetHairline cannot be reused —
// that is a standalone full-width rule, not a flex filler.
//
// Anatomy (spec §1.3, orders read off the design's `.shead`):
//   label    — sans 17/600 --ink, letter-spacing 0, flex-shrink 0     (order 0)
//   count    — ivory pill, mono 11 --body, min-w 22 / h 22 / pad 0 7  (order 0)
//   meta     — MONO_METRIC_STYLE, LEADING (design's `.sm`)            (order 0)
//   rule     — flex:1, 1px --line                                      (order 1)
//   trailing — MONO_METRIC_STYLE, right of the rule (design's `.cnt`)  (order 2)
//   action   — the section's create / object actions                   (order 3)
//
// The four metadata slots are NOT interchangeable — `meta` sits with the label
// (it qualifies the section: "T−4 weeks  Jun 16 – Jul 16"), `trailing` sits past
// the rule (it reports the section's state: "5 of 5 done"). Design call sites:
//   Roles        label + count (no trailing)         → Event Level [2] ─────────────────
//   Countdown    label + meta + trailing             → T−4 weeks Jun 16 – Jul 16 ──── 5 of 5 done
//   Run of Show  label + count + trailing            → Timed blocks [7] ──── across 3 nights
//   Sub-events   label + count + trailing + action   → Sub-events [6] ──── Aug 18 – Aug 29 [+ Add]
// (Roles carries NO trailing: its "Needs someone" / "Covered" sub-dividers below
//  already state the same thing with their own counts — see the note at its site.)
//
// SCOPE — DESKTOP ONLY. The ruled grammar above is ratified in
// web_design_system.md; mobile_design_system.md governs phone width and was NOT
// amended, so at `md:hidden` widths this renders exactly what it rendered before
// the header-hierarchy adoption: a 21px instrument-serif head, no rule, no
// count/meta/trailing slots, action right-aligned. Size and family therefore live
// in CLASSES, never inline — an inline `fontSize`/`display` outranks a `md:`
// utility and the desktop treatment would leak back onto the phone.
export function EventSectionHeader({ title, meta, count, trailing, action }: {
  title: string
  // LEADING mono metric, sits with the label — qualifies the section itself
  // ("Jun 16 – Jul 16"). The design's `.sm`. Optional and additive.
  meta?: ReactNode
  // LEADING ivory count pill. Optional and additive.
  count?: ReactNode
  // TRAILING mono metric riding right of the rule — reports the section's state
  // ("needs someone", "5 of 5 done", "across 3 nights", "Aug 18 – Aug 29").
  // The design's `.cnt`. Optional and additive.
  trailing?: ReactNode
  action?: ReactNode
}) {
  const has = (v: ReactNode) => v !== undefined && v !== null && v !== false && v !== ""
  return (
    <div className="mb-[18px] flex flex-wrap items-end justify-between gap-[18px] md:mb-[14px] md:flex-nowrap md:items-baseline md:justify-start md:gap-3">
      {/* PHONE label — the pre-adoption serif head (mobile_design_system.md). */}
      <h2
        className="text-[21px] tracking-[-0.3px] md:hidden"
        style={{ fontFamily: "var(--font-instrument-serif)", fontWeight: 600, color: "var(--ink)", lineHeight: 1.1, margin: 0 }}
      >
        {title}
      </h2>

      {/* DESKTOP label — L3 ruled, sans 17/600. Semantically the SAME heading as
          the phone head above (one is always display:none), so it is an <h2> too:
          the section structure must survive in the accessibility tree at both
          widths. `margin: 0` + the explicit fontSize/fontWeight neutralise the UA
          h2 defaults so this is a semantics-only change with zero visual diff. */}
      <h2
        className="hidden md:inline"
        style={{ fontFamily: "var(--sans)", fontSize: 17, fontWeight: 600, letterSpacing: 0, color: "var(--ink)", lineHeight: 1.2, flexShrink: 0, margin: 0 }}
      >
        {title}
      </h2>

      {has(count) && (
        // `display` stays in the CLASS — an inline display:inline-grid would
        // outrank `hidden` and the pill would survive at phone width.
        <span
          className="hidden md:inline-grid"
          style={{
            placeItems: "center",
            minWidth: 22,
            height: 22,
            padding: "0 7px",
            borderRadius: 999,
            background: "var(--ivory)",
            fontFamily: "var(--mono)",
            fontSize: 11,
            color: "var(--body)",
            flexShrink: 0,
          }}
        >
          {count}
        </span>
      )}

      {has(meta) && <span className="hidden md:inline" style={{ ...MONO_METRIC_STYLE, flexShrink: 0 }}>{meta}</span>}

      {/* The rule. An empty flex item — identical rendering to the design's
          ::after { content:"" }, and expressible without a global CSS class. */}
      <span aria-hidden className="hidden md:block" style={{ flex: 1, height: 1, background: "var(--line)", order: 1 }} />

      {has(trailing) && (
        <span className="hidden md:inline" style={{ ...MONO_METRIC_STYLE, flexShrink: 0, order: 2 }}>{trailing}</span>
      )}

      {action && (
        <div className="flex shrink-0 items-center gap-3 md:order-3">{action}</div>
      )}
    </div>
  )
}
