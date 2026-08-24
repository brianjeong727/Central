"use client"

// ── SwipeActionRow — swipe actions for a mobile list row ─────────────────────
// iMessage's row gesture, both halves of it:
//
//   • a SHORT drag uncovers a panel of action tiles sitting behind the row —
//     tap one to fire it;
//   • a FULL drag past the commit distance fires the side's flagged action the
//     moment you let go, with no tap at all. Drag back before releasing and
//     nothing happens — the decision is made on release, never on crossing.
//
// The full swipe is the reason the panel can stay boring: the common action is
// one motion away, and the panel is what's left for the rarer ones. Generic —
// it knows nothing about chats; the caller supplies the actions, flags which one
// a full swipe commits, and owns which row is open.
//
// The gesture is an ACCELERATOR, never the only path to an action (mobile
// _design_system §0.3 — a swipe is an alternate input, not a new affordance).
// Everything reachable here must also be reachable by tapping through the UI, so
// a user who never discovers the swipe loses nothing and a screen reader is not
// stranded. That is doubly true of the committed action: it has no tile of its
// own to reach, only the tile it shares with the tap path.
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
// motion; only the auto-snap transition and the arm/disarm cross-fade are
// suppressed there (`.swipe-*` rules in `app/globals.css`).

import { ReactNode, useCallback, useEffect, useRef } from "react"
import { inHorizontalScroller } from "./use-edge-swipe-back"

const EASE = "cubic-bezier(0.23,1,0.32,1)"
const EDGE_PX = 24          // matches useEdgeSwipeBack's edge zone
const ACTION_W = 76         // per-action width; two actions ≈ a comfortable thumb reach
const SNAP_MS = 240         // --dur-layout: this moves POSITION, not just colour
const THRESHOLD = 0.4       // fraction of the panel that must be uncovered to stick
const FLICK = 0.5           // px/ms that completes regardless of distance
// Full-swipe commit distance: half the row, floored at the panel plus a clear
// tile's worth. Both terms matter. The fraction is what makes it feel like iOS
// on any row width; the floor is what keeps "open a three-action panel" and
// "commit its first action" two different intents rather than two readings of
// the same distance — without it a 228px panel would sit past a 195px commit
// point and every attempt to reach Leave would fire Mute on the way.
const COMMIT_GAP = 48
const COMMIT_FRAC = 0.5
// A flick is deliberately NOT a commit. Distance is the only thing that fires an
// action without a tap: a fast, short flick is how you ASK to see the panel, and
// it is also what a mis-swipe looks like. Firing on velocity would make the
// cheapest possible gesture the most consequential one.

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
  /** A full swipe past the commit distance fires THIS action on release, with no
   *  tap. Opt-in per action, and deliberately NOT an implicit "the first one":
   *  a thumb-flick must never be able to reach something irreversible, and a
   *  first-wins rule would silently arm whatever a later caller happens to list
   *  first. Only an action that is reversible — and that SAYS so, with an Undo —
   *  belongs here. At most one per side; the first flagged one wins. A side with
   *  none simply has no full swipe: its travel still clamps at the panel. */
  commit?: boolean
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
  const leadPanelRef = useRef<HTMLDivElement | null>(null)
  const trailPanelRef = useRef<HTMLDivElement | null>(null)
  const openRef = useRef<SwipeSide | null>(open)
  // Set while a drag is settling so the synthetic click that follows a touch
  // sequence can't also fire the row's onClick.
  const draggedRef = useRef(false)
  const onOpenChangeRef = useRef(onOpenChange)
  useEffect(() => { onOpenChangeRef.current = onOpenChange })

  const leadingW = leading.length * ACTION_W
  const trailingW = trailing.length * ACTION_W

  const leadCommit = leading.find((a) => a.commit)
  const trailCommit = trailing.find((a) => a.commit)
  // Held in a ref so the drag listeners never re-subscribe when the caller
  // rebuilds its action array (chat rows rebuild theirs on every list patch —
  // an optimistic pin is exactly that). The effect keys off the BOOLEANS below,
  // which only change when a side gains or loses its commit action.
  const commitRef = useRef<Partial<Record<SwipeSide, SwipeAction>>>({})
  useEffect(() => { commitRef.current = { leading: leadCommit, trailing: trailCommit } })
  const hasLeadCommit = Boolean(leadCommit)
  const hasTrailCommit = Boolean(trailCommit)

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

    let startX = 0, startY = 0, startT = 0, base = 0, x = 0, rowW = 0
    let armed = false, locked = false
    let armedSide: SwipeSide | null = null
    let touchId: number | null = null

    const panelEl = (side: SwipeSide) => (side === "leading" ? leadPanelRef.current : trailPanelRef.current)
    const panelW = (side: SwipeSide) => (side === "leading" ? leadingW : trailingW)
    const canCommit = (side: SwipeSide) => Boolean(commitRef.current[side])
    const commitAt = (side: SwipeSide) => Math.max(panelW(side) + COMMIT_GAP, rowW * COMMIT_FRAC)

    // The panel is stretched to fill EXACTLY the strip the row has uncovered, so
    // a drag past its natural width grows the committing tile (it is the flex
    // child) instead of opening a gap onto the page behind the row. Every tile
    // shares one fill, so once the siblings fade out at the arm point what is
    // left reads as a single slab that has swallowed the row — which is the
    // whole "release now and this fires" signal. `data-armed` is what the
    // `.swipe-*` rules in globals.css key off.
    const paint = () => {
      for (const side of ["leading", "trailing"] as const) {
        const p = panelEl(side)
        if (!p) continue
        const shown = side === "leading" ? Math.max(0, x) : Math.max(0, -x)
        // A panel is EXACTLY the strip the row has uncovered on its own side,
        // and nothing when the row has gone the other way. Collapsing it is not
        // cosmetic: a full right swipe travels most of the row, so a trailing
        // panel left at its natural width would sit out beyond the row's new
        // right edge and put Mute on screen during a Pin.
        p.style.width = `${shown > 0 ? Math.max(panelW(side), shown) : 0}px`
        p.dataset.armed = armedSide === side ? "1" : "0"
      }
    }

    const onStart = (e: TouchEvent) => {
      if (locked || touchId !== null) return                 // multi-touch protection
      const t = e.touches[0]
      if (!t) return
      if (t.clientX <= EDGE_PX) return                       // leave the back gesture alone
      if (inHorizontalScroller(e.target, el)) return         // never hijack a carousel/rail
      touchId = t.identifier
      startX = t.clientX; startY = t.clientY; startT = e.timeStamp
      base = offsetFor(openRef.current)
      // Measured per drag rather than once: the row is the full screen width and
      // the phone can be rotated between two swipes.
      rowW = el.clientWidth || el.getBoundingClientRect().width
      x = base; armed = true; locked = false; armedSide = null
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
      // Clamped to what each side can actually show: the panel alone, or the
      // whole row where a full swipe is on offer. A side with neither simply
      // refuses to travel that way (no rubber-band to nothing).
      const maxLead = leadingW ? (canCommit("leading") ? rowW : leadingW) : 0
      const maxTrail = trailingW ? (canCommit("trailing") ? rowW : trailingW) : 0
      x = Math.max(-maxTrail, Math.min(maxLead, base + mx))
      const dir: SwipeSide | null = x > 0 ? "leading" : x < 0 ? "trailing" : null
      // Recomputed every frame, so dragging BACK below the line disarms — the
      // gesture is only ever decided by where the finger is when it lifts.
      armedSide = dir && canCommit(dir) && Math.abs(x) >= commitAt(dir) ? dir : null
      el.style.transform = `translateX(${x}px)`
      paint()
    }

    /** Snap the row to `side` (null = closed). `keepArmed` holds the committed
     *  tile's slab look for the duration of the snap: the row is sliding back
     *  OVER the panel, and letting the siblings fade in underneath it mid-slide
     *  is a flicker with nothing to say. Panels are only shrunk back once the
     *  row has covered them again, for the same reason. */
    const settle = (side: SwipeSide | null, keepArmed = false) => {
      const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false
      if (!keepArmed) { armedSide = null; paint() }
      x = offsetFor(side)
      el.style.transition = reduce ? "none" : `transform ${SNAP_MS}ms ${EASE}`
      el.style.transform = `translateX(${x}px)`
      if (side !== openRef.current) onOpenChangeRef.current(side)
      // Let the settle finish before a click is allowed through again.
      window.setTimeout(() => {
        draggedRef.current = false
        armedSide = null
        paint()
      }, reduce ? 0 : SNAP_MS)
    }

    const onEnd = (e: TouchEvent) => {
      if (!locked) { armed = false; touchId = null; return }
      const elapsed = e.timeStamp - startT
      const travelled = x - base
      const flick = Math.abs(travelled) / Math.max(1, elapsed)
      const committed = armedSide ? commitRef.current[armedSide] : undefined
      armed = false; locked = false; touchId = null

      // Past the commit distance the row closes and the action fires — there is
      // nothing left to tap.
      if (committed) {
        settle(null, true)
        committed.onSelect()
        return
      }

      // Otherwise the direction of the finger decides which panel is a
      // candidate; distance or flick decides whether it sticks.
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
  }, [leadingW, trailingW, offsetFor, hasLeadCommit, hasTrailCommit])

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
      {leading.length > 0 && <Panel actions={leading} side="leading" hidden={open !== "leading"} panelRef={leadPanelRef} onDone={() => onOpenChange(null)} />}
      {trailing.length > 0 && <Panel actions={trailing} side="trailing" hidden={open !== "trailing"} panelRef={trailPanelRef} onDone={() => onOpenChange(null)} />}
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

function Panel({ actions, side, hidden, panelRef, onDone }: {
  actions: SwipeAction[]
  side: SwipeSide
  hidden: boolean
  panelRef: React.RefObject<HTMLDivElement | null>
  onDone: () => void
}) {
  const commitKey = actions.find((a) => a.commit)?.key
  return (
    <div
      ref={panelRef}
      className="swipe-panel"
      data-armed="0"
      aria-hidden={hidden}
      style={{
        position: "absolute", top: 0, bottom: 0, [side === "leading" ? "left" : "right"]: 0,
        display: "flex", alignItems: "stretch", overflow: "hidden",
        // The panel carries the tiles' own fill. Two adjacent tiles land on
        // fractional device pixels at any DPR above 1, and the sliver between
        // them shows whatever is BEHIND them — which was the page, so the armed
        // slab kept a hairline exactly where the seam it had just dissolved used
        // to be. With the panel painted the same colour there is nothing behind
        // them to show.
        background: "var(--pocket-track)",
      }}
    >
      {actions.map((a, i) => {
        const isCommit = a.key === commitKey
        const seam = i === 0 ? 0 : 1
        return (
          <button
            key={a.key}
            type="button"
            className="swipe-tile"
            data-commit={isCommit ? "1" : "0"}
            data-tone={a.tone === "strong" ? "strong" : "default"}
            tabIndex={hidden ? -1 : 0}
            onClick={(e) => { e.stopPropagation(); onDone(); a.onSelect() }}
            aria-label={a.label}
            style={{
              // One fill across the panel means two adjacent tiles read as a single
              // slab, so a hairline marks the seam — `--line-3`, the mobile system's
              // ONE in-card divider (§2), the same rule that separates PocketRows.
              // It is LIGHTER than `--pocket-track`, so it reads as an inset seam
              // rather than a stroke; that is intentional. Both the seam and the
              // reset live in `.swipe-tile` (globals.css) rather than here: an
              // inline border beats every stylesheet rule short of !important, so
              // declaring it here is what stopped the armed state from dissolving
              // it. box-sizing must stay border-box or the 1px would push the panel
              // past `actions.length * ACTION_W`, which is the offset the drag math
              // uses.
              //
              // The committing tile is the flex child: it, and only it, absorbs
              // whatever the drag uncovers beyond the panel's natural width.
              flex: isCommit ? "1 1 auto" : "0 0 auto",
              width: ACTION_W, boxSizing: "border-box", cursor: "pointer",
              // Row-flex with the glyph pinned to the tile's FIXED edge — the
              // outer edge for a leading panel, the inner one for a trailing
              // panel. Both are the edge that does not move as the tile grows,
              // so the icon and label stay exactly where the finger first
              // uncovered them instead of drifting to the centre of a slab.
              display: "flex", alignItems: "stretch",
              justifyContent: side === "leading" ? "flex-start" : "flex-end",
              background: "var(--pocket-track)",
              // Colour is NOT inline: it has an armed state, and an inline
              // declaration outranks every stylesheet rule short of !important.
              // Both the resting tone and the armed step live in `.swipe-tile`
              // (globals.css), keyed off `data-tone`.
            }}
          >
            <span
              className="swipe-glyph"
              style={{
                width: isCommit ? ACTION_W - seam : "100%", flexShrink: 0,
                display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 5,
                fontFamily: "var(--serif)", fontSize: 11, fontWeight: 600, letterSpacing: "-0.01em",
              }}
            >
              {a.icon}
              {a.label}
            </span>
          </button>
        )
      })}
    </div>
  )
}
