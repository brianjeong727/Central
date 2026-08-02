"use client"
import { CSSProperties, ReactNode, useEffect, useId, useRef, useState } from "react"
import { ChevronLeft, ChevronRight } from "lucide-react"
import { EYEBROW_STYLE } from "./typography"

// ── CollapsibleRail ───────────────────────────────────────────────────────────
// A two-column desktop layout — a main content column plus a secondary right rail
// that the reader can FOLD AWAY horizontally. Built for surfaces whose rail is
// supporting information (a readiness card, a schedule digest) rather than a
// working surface: it does not deserve permanent width, so the default is
// COLLAPSED and the main column starts at full width.
//
//   collapsed              expanded
//   ┌───────────────┬─┐    ┌──────────┬─────────────┐
//   │ children      │▸│    │ children │ rail        │
//   └───────────────┴─┘    └──────────┴─────────────┘
//                    ↑ the edge tab: chevron + vertical label, the whole strip
//                      is the toggle
//
// Anatomy notes
// - The width lives on `grid-template-columns`, which IS animatable, so one
//   transition on the grid moves both columns in lockstep — no absolute
//   positioning, no measuring, no reflow of the main column's text mid-flight.
// - The rail BODY keeps a fixed pixel width at all times and is clipped by the
//   column's `overflow: hidden`. If it were allowed to shrink with the column its
//   own cards would re-wrap on every frame of the animation — that is the jank
//   this shape exists to avoid.
// - Collapsed state is COMPONENT STATE only. It is deliberately not persisted:
//   Convention #1 forbids localStorage/sessionStorage, and a rail preference is
//   not worth a profile column.
//
// Timing + the reduced-motion guard live in `.collapsible-rail` (app/globals.css)
// rather than inline, because a media query cannot be expressed in a style object.
export function CollapsibleRail({
  rail,
  label,
  contentsName,
  width = 336,
  gap = "var(--space-10)",
  defaultCollapsed = true,
  expandTitle,
  collapseTitle = "Hide",
  className,
  style,
  children,
}: {
  /** The rail column's content — cards, a digest, a stat stack. */
  rail: ReactNode
  /**
   * Short name for the rail. Rides the collapsed edge tab vertically, so it has to
   * stay readable rotated — keep it to ~2 words. It must cover EVERYTHING in the
   * rail: naming it after the top card hides the rest from anyone who folded it.
   */
  label: string
  /**
   * Fuller noun phrase for what the rail holds ("readiness and reminder schedule"),
   * used only for the accessible names. Exists because `label` is constrained by
   * vertical reading, so a rail with several cards needs a short tab label AND a
   * spoken name that enumerates them. Defaults to `label` lowercased.
   */
  contentsName?: string
  /** Expanded rail width in px. */
  width?: number
  /** Gap between the main column and the rail (a CSS length or token). */
  gap?: string
  /** Start folded. Defaults to true — this component exists for rails that have not earned permanent width. */
  defaultCollapsed?: boolean
  /** Visible label on the expand affordance. Defaults to `label`. */
  expandTitle?: string
  /** Visible label on the collapse affordance. */
  collapseTitle?: string
  /** Extra classes on the grid — e.g. `max-md:!block` to stack below the md breakpoint. */
  className?: string
  style?: CSSProperties
  /** The main column. */
  children: ReactNode
}) {
  const [collapsed, setCollapsed] = useState(defaultCollapsed)
  // Trails `collapsed` by the animation so the body can FADE while the column
  // narrows, then drop out of flow (height 0) once it is off screen. Without the
  // delay the body would vanish a frame before the width started moving. Driven
  // from the handlers, never from an effect — a setState inside an effect keyed on
  // `collapsed` is a cascading render (and the lint rule that says so is right).
  const [bodyFolded, setBodyFolded] = useState(defaultCollapsed)
  const foldTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const bodyId = useId()

  // Accessible names. Two constraints, both real:
  // - the name must say what EXPANDING does, because the only visible content of
  //   the collapsed control is a rotated word;
  // - WCAG 2.5.3 (Label in Name) — the visible label has to be INSIDE the
  //   accessible name, or a speech-input user saying "click At a glance" misses.
  //   Hence the `label — show …` shape rather than a bare "Show …".
  const spokenContents = contentsName ?? label.toLowerCase()
  const expandName = expandTitle ?? (contentsName ? `${label} — show ${contentsName}` : `Show ${spokenContents}`)
  const collapseName = `${collapseTitle} ${spokenContents}`

  useEffect(() => () => { if (foldTimer.current) clearTimeout(foldTimer.current) }, [])

  const expand = () => {
    if (foldTimer.current) clearTimeout(foldTimer.current)
    setBodyFolded(false)
    setCollapsed(false)
  }
  const collapse = () => {
    setCollapsed(true)
    // Must track --dur-layout in globals.css — the body may only leave the flow
    // once the column has finished narrowing over it.
    foldTimer.current = setTimeout(() => setBodyFolded(true), 240)
  }

  const EDGE = 34

  return (
    <div
      className={`collapsible-rail${className ? ` ${className}` : ""}`}
      style={{
        display: "grid",
        gridTemplateColumns: `minmax(0, 1fr) ${collapsed ? EDGE : width}px`,
        gap,
        alignItems: "start",
        ...style,
      }}
    >
      <div style={{ minWidth: 0 }}>{children}</div>

      {/* The rail column. `overflow: hidden` is what makes the fold read as a
          clip rather than a squeeze. */}
      <div style={{ minWidth: 0, overflow: "hidden" }}>
        {collapsed ? (
          // COLLAPSED — the whole ivory strip is the toggle, so there is no
          // pixel-hunting for a 16px chevron. Ivory matches the rail's own cards:
          // it reads as the rail folded up, not as new furniture.
          <button
            type="button"
            onClick={expand}
            aria-expanded={false}
            aria-controls={bodyId}
            // aria-label, not title: the visible content is the vertical label, so
            // without this the accessible name would be the bare tab word ("At a
            // glance") with no hint that the control opens anything.
            aria-label={expandName}
            title={expandName}
            className="collapsible-rail-tab"
            style={{
              width: EDGE,
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: 10,
              padding: "10px 0 14px",
              background: "var(--ivory)",
              border: "none",
              borderRadius: "var(--r-card)",
              cursor: "pointer",
              color: "var(--muted-text)",
            }}
          >
            <ChevronLeft style={{ width: 15, height: 15 }} strokeWidth={1.8} />
            <span
              style={{
                ...EYEBROW_STYLE,
                color: "inherit",
                writingMode: "vertical-rl",
                // vertical-rl reads top-to-bottom; the 180° flip makes it read
                // bottom-to-top, the convention for a left-hand vertical tab.
                transform: "rotate(180deg)",
                whiteSpace: "nowrap",
              }}
            >
              {label}
            </span>
          </button>
        ) : (
          <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 10 }}>
            <button
              type="button"
              onClick={collapse}
              aria-expanded
              aria-controls={bodyId}
              aria-label={collapseName}
              title={collapseName}
              className="collapsible-rail-tab"
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 4,
                background: "none",
                border: "none",
                padding: "2px 2px 2px 6px",
                cursor: "pointer",
                color: "var(--muted-text)",
                fontSize: 12.5,
                fontWeight: 500,
                fontFamily: "var(--sans)",
              }}
            >
              {collapseTitle}
              <ChevronRight style={{ width: 15, height: 15 }} strokeWidth={1.8} />
            </button>
          </div>
        )}

        <div
          id={bodyId}
          // `inert` (not just aria-hidden) so the folded rail cannot be reached by
          // Tab while it is clipped out of view.
          inert={collapsed || undefined}
          className="collapsible-rail-body"
          style={{
            width,
            // height:0 + overflow:hidden takes it out of FLOW, but its children keep
            // a non-zero bounding box (overflow only clips painting) — so hit-testing
            // and every "is it visible" check would still say yes. `visibility:hidden`
            // is the one that actually makes it gone. Applied on the trailing
            // `bodyFolded` flag so the opacity fade still plays first.
            height: bodyFolded ? 0 : undefined,
            overflow: bodyFolded ? "hidden" : undefined,
            visibility: bodyFolded ? "hidden" : undefined,
            opacity: collapsed ? 0 : 1,
          }}
        >
          {rail}
        </div>
      </div>
    </div>
  )
}
