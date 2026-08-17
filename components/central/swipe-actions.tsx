"use client"

// ── SwipeActionRow — reveal-on-swipe actions for a mobile list row ────────────
// iMessage's row gesture: drag a row sideways to uncover a panel of actions
// sitting behind it. Generic — it knows nothing about chats; the caller supplies
// the actions and owns which row is open.
//
// The gesture is an ACCELERATOR, never the only path to an action (mobile
// _design_system §0.3 — a swipe is an alternate input, not a new affordance).
// Everything reachable here must also be reachable by tapping through the UI, so
// a user who never discovers the swipe loses nothing and a screen reader is not
// stranded.
//
// Safety properties — the SAME set `use-edge-swipe-back.ts` established
// (Convention #7, never fight another gesture); that file is the reference and
// its scroller guard is imported rather than re-implemented:
//   • coarse-pointer only — inert on desktop, which keeps its own affordances
//   • `touch-action: pan-y` on the foreground, so the browser keeps vertical
//     scrolling (and pull-to-refresh) natively — we never preventDefault a
//     vertical drag, we simply never claim one
//   • direction-locked — a vertical-dominant drag releases immediately
//   • LEFT-EDGE EXCLUDED — a touch starting within `EDGE_PX` of the left edge is
//     ignored outright so back-swipe (Convention #22) is never contested, even
//     on a surface where both are armed
//   • multi-touch guarded — extra fingers can't retarget a drag in flight
//   • horizontal-scroller guard — a carousel inside a row still scrolls
//
// Open state is CONTROLLED so the parent can guarantee only one row is open at a
// time (and can close it on Android back, or when the list refetches). A
// module-level registry would do the same thing less legibly.
//
// Motion follows emil / PocketSheet: transform-only, direct DOM writes, custom
// ease-out. Finger-follow is direct manipulation and runs even under reduced
// motion; only the auto-snap transition is suppressed there.

import { ReactNode, useCallback, useEffect, useRef } from "react"
import { inHorizontalScroller } from "./use-edge-swipe-back"

const EASE = "cubic-bezier(0.23,1,0.32,1)"
const EDGE_PX = 24          // matches useEdgeSwipeBack's edge zone
const ACTION_W = 76         // per-action width; two actions ≈ a comfortable thumb reach
const SNAP_MS = 240         // --dur-layout: this moves POSITION, not just colour
const THRESHOLD = 0.4       // fraction of the panel that must be uncovered to stick
const FLICK = 0.5           // px/ms that completes regardless of distance

export type SwipeSide = "leading" | "trailing"

export interface SwipeAction {
  key: string
  label: string
  icon: ReactNode
  /** `strong` = the weightier action in the set (leave / archive).
   *
   *  BOTH tones fill `--pocket-track`; the weight comes from TEXT, not fill —
   *  `default` keeps `--body`, `strong` steps to `--ink`. One fill also means the
   *  tiles need something to separate them, which is the `--line-3` hairline
   *  between adjacent tiles below.
   *
   *  Why one fill: `--pocket-track` is THE mobile fill token (§2) — `--line-2` is
   *  a border/stroke value and §6 forbids it as a fill outright, and `--cream-2`
   *  is a DESKTOP token that is lighter than the `--ivory` row card the panel
   *  sits behind, so it read as a hole punched through the card instead of a
   *  layer recessed beneath it. `--pocket-track` is the family's own "behind the
   *  card" value and reads correctly at both tones.
   *
   *  Plum is deliberately absent — it is a surgical accent and the chat list
   *  already spends it on the unread dot, the scope pill and the create +. Never
   *  a danger fill either: the contract allows danger as text+border only, and
   *  the one genuinely destructive chat action isn't offered here at all. */
  tone?: "default" | "strong"
  onSelect: () => void
}

export function SwipeActionRow({
  leading = [], trailing = [], open, onOpenChange, bleed = 0, surface = "var(--ivory)", children,
}: {
  leading?: SwipeAction[]
  trailing?: SwipeAction[]
  /** Which panel is showing, or null. Controlled by the parent. */
  open: SwipeSide | null
  onOpenChange: (side: SwipeSide | null) => void
  /** Horizontal padding of the ancestor card to cancel, so the action panel
   *  bleeds to the card's edge instead of stopping short of it. The foreground
   *  re-applies the same value, so row content does not move. */
  bleed?: number
  /** Opaque fill for the foreground layer — must match whatever the row sits on,
   *  or the action panel's fill shows through. `--ivory` inside a card (default),
   *  `--cream` for a full-bleed row on the page surface. */
  surface?: string
  children: ReactNode
}) {
  const fgRef = useRef<HTMLDivElement | null>(null)
  const openRef = useRef<SwipeSide | null>(open)
  // Set while a drag is settling so the synthetic click that follows a touch
  // sequence can't also fire the row's onClick.
  const draggedRef = useRef(false)
  const onOpenChangeRef = useRef(onOpenChange)
  useEffect(() => { onOpenChangeRef.current = onOpenChange })

  const leadingW = leading.length * ACTION_W
  const trailingW = trailing.length * ACTION_W

  const offsetFor = useCallback(
    (side: SwipeSide | null) => (side === "leading" ? leadingW : side === "trailing" ? -trailingW : 0),
    [leadingW, trailingW],
  )

  // Drive the foreground to match the controlled prop — this is what closes THIS
  // row when another one opens.
  useEffect(() => {
    openRef.current = open
    const el = fgRef.current
    if (!el) return
    const reduce = typeof window !== "undefined" && (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false)
    el.style.transition = reduce ? "none" : `transform ${SNAP_MS}ms ${EASE}`
    el.style.transform = `translateX(${offsetFor(open)}px)`
  }, [open, offsetFor])

  useEffect(() => {
    const el = fgRef.current
    if (!el) return
    if (typeof window === "undefined" || !window.matchMedia?.("(pointer: coarse)").matches) return
    if (!leadingW && !trailingW) return

    let startX = 0, startY = 0, startT = 0, base = 0, x = 0
    let armed = false, locked = false
    let touchId: number | null = null

    const onStart = (e: TouchEvent) => {
      if (locked || touchId !== null) return                 // multi-touch protection
      const t = e.touches[0]
      if (!t) return
      if (t.clientX <= EDGE_PX) return                       // leave the back gesture alone
      if (inHorizontalScroller(e.target, el)) return         // never hijack a carousel/rail
      touchId = t.identifier
      startX = t.clientX; startY = t.clientY; startT = e.timeStamp
      base = offsetFor(openRef.current)
      x = base; armed = true; locked = false
    }

    const onMove = (e: TouchEvent) => {
      if (!armed) return
      const t = Array.from(e.touches).find((c) => c.identifier === touchId)
      if (!t) return
      const mx = t.clientX - startX
      const my = t.clientY - startY
      if (!locked) {
        if (Math.abs(mx) < 8 && Math.abs(my) < 8) return     // wait for a decisive move
        if (Math.abs(my) >= Math.abs(mx)) { armed = false; touchId = null; return }  // vertical → scroll
        locked = true
        draggedRef.current = true
        el.style.transition = "none"
      }
      // Clamped to the panels that actually exist, so a row with no leading
      // action simply refuses to travel that way (no rubber-band to nothing).
      x = Math.max(-trailingW, Math.min(leadingW, base + mx))
      el.style.transform = `translateX(${x}px)`
    }

    const settle = (side: SwipeSide | null) => {
      const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false
      el.style.transition = reduce ? "none" : `transform ${SNAP_MS}ms ${EASE}`
      el.style.transform = `translateX(${offsetFor(side)}px)`
      if (side !== openRef.current) onOpenChangeRef.current(side)
      // Let the settle finish before a click is allowed through again.
      window.setTimeout(() => { draggedRef.current = false }, reduce ? 0 : SNAP_MS)
    }

    const onEnd = (e: TouchEvent) => {
      if (!locked) { armed = false; touchId = null; return }
      const elapsed = e.timeStamp - startT
      const travelled = x - base
      const flick = Math.abs(travelled) / Math.max(1, elapsed)
      armed = false; locked = false; touchId = null

      // Direction of the finger decides which panel is a candidate; distance or
      // flick decides whether it sticks.
      let side: SwipeSide | null = null
      if (x > 0 && leadingW) side = x >= leadingW * THRESHOLD || (travelled > 0 && flick > FLICK) ? "leading" : null
      else if (x < 0 && trailingW) side = -x >= trailingW * THRESHOLD || (travelled < 0 && flick > FLICK) ? "trailing" : null
      settle(side)
    }

    const onCancel = () => {
      armed = false; locked = false; touchId = null
      settle(openRef.current)
    }

    el.addEventListener("touchstart", onStart, { passive: true })
    el.addEventListener("touchmove", onMove, { passive: true })
    el.addEventListener("touchend", onEnd, { passive: true })
    el.addEventListener("touchcancel", onCancel, { passive: true })
    return () => {
      el.removeEventListener("touchstart", onStart)
      el.removeEventListener("touchmove", onMove)
      el.removeEventListener("touchend", onEnd)
      el.removeEventListener("touchcancel", onCancel)
    }
  }, [leadingW, trailingW, offsetFor])

  // A tap while open CLOSES and is swallowed — it must not also open the row's
  // destination. Capture phase, because the row itself is a <button>.
  const swallow = (e: React.MouseEvent) => {
    if (open || draggedRef.current) {
      e.preventDefault()
      e.stopPropagation()
      if (open) onOpenChange(null)
    }
  }

  return (
    <div style={{ position: "relative", overflow: "hidden", margin: bleed ? `0 -${bleed}px` : undefined }}>
      {leading.length > 0 && <Panel actions={leading} side="leading" hidden={open !== "leading"} onDone={() => onOpenChange(null)} />}
      {trailing.length > 0 && <Panel actions={trailing} side="trailing" hidden={open !== "trailing"} onDone={() => onOpenChange(null)} />}
      <div
        ref={fgRef}
        onClickCapture={swallow}
        style={{
          position: "relative",
          // MUST be opaque — it is what hides the action panel until you swipe.
          // Defaults to the card fill because that is where this shipped; a row
          // sitting directly on the page (full-bleed list, §4) passes `--cream`
          // instead. Getting this wrong doesn't hide the panel, it TINTS every
          // row with the panel's fill, which reads as a styling bug rather than
          // a layering one.
          background: surface,
          padding: bleed ? `0 ${bleed}px` : undefined,
          // The browser keeps vertical panning; we only ever claim horizontal.
          touchAction: "pan-y",
          willChange: "transform",
        }}
      >
        {children}
      </div>
    </div>
  )
}

function Panel({ actions, side, hidden, onDone }: {
  actions: SwipeAction[]
  side: SwipeSide
  hidden: boolean
  onDone: () => void
}) {
  return (
    <div
      aria-hidden={hidden}
      style={{
        position: "absolute", top: 0, bottom: 0, [side === "leading" ? "left" : "right"]: 0,
        display: "flex", alignItems: "stretch",
      }}
    >
      {actions.map((a, i) => (
        <button
          key={a.key}
          type="button"
          tabIndex={hidden ? -1 : 0}
          onClick={(e) => { e.stopPropagation(); onDone(); a.onSelect() }}
          aria-label={a.label}
          style={{
            // One fill across the panel means two adjacent tiles read as a single
            // slab, so a hairline marks the seam — `--line-3`, the mobile system's
            // ONE in-card divider (§2), the same rule that separates PocketRows.
            // It is LIGHTER than `--pocket-track`, so it reads as an inset seam
            // rather than a stroke; that is intentional. On the FIRST tile only
            // (i === 0) it is omitted — a rule on the panel's outer edge would sit
            // against the row/card edge and read as a border on the card itself.
            // box-sizing must stay border-box or the 1px would push the panel past
            // `actions.length * ACTION_W`, which is the offset the drag math uses.
            width: ACTION_W, boxSizing: "border-box", cursor: "pointer",
            border: "none",
            borderLeft: i === 0 ? "none" : "1px solid var(--line-3)",
            display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 5,
            background: "var(--pocket-track)",
            color: a.tone === "strong" ? "var(--ink)" : "var(--body)",
            fontFamily: "var(--serif)", fontSize: 11, fontWeight: 600, letterSpacing: "-0.01em",
          }}
        >
          {a.icon}
          {a.label}
        </button>
      ))}
    </div>
  )
}
