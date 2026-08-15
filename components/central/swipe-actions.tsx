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
  /** `strong` = the weightier action in the set (leave / archive). Both tones
   *  come from the cream/tan family and get their weight from VALUE, not hue:
   *  `default` is the lighter inset surface, `strong` a step darker. Plum is
   *  deliberately absent — it is a surgical accent and the chat list already
   *  spends it on the unread dot, the scope pill and the create +. Never a
   *  danger fill either: the contract allows danger as text+border only, and the
   *  one genuinely destructive chat action isn't offered here at all. */
  tone?: "default" | "strong"
  onSelect: () => void
}

export function SwipeActionRow({
  leading = [], trailing = [], open, onOpenChange, bleed = 0, children,
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
          background: "var(--ivory)",
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
      {actions.map((a) => (
        <button
          key={a.key}
          type="button"
          tabIndex={hidden ? -1 : 0}
          onClick={(e) => { e.stopPropagation(); onDone(); a.onSelect() }}
          aria-label={a.label}
          style={{
            width: ACTION_W, border: "none", cursor: "pointer",
            display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 5,
            background: a.tone === "strong" ? "var(--line-2)" : "var(--cream-2)",
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
