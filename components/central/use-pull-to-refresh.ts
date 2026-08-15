"use client"

// Pull-to-refresh for the mobile shell. Drag DOWN from the top of the scroll
// region → a spinner appears and follows the finger → release past the threshold
// → the caller's async refresh runs → the spinner holds until it settles.
//
// Attach the returned ref to the SCROLL element itself (the shell's `.shell-scroll`),
// not to a wrapper — the gesture reads that element's scroll position and listens
// on it. Note that at phone width that element is not actually the scroller; see
// `effectiveScrollTop` below, which is what keeps the top-anchored guard honest.
//
// Safety properties, same discipline as useEdgeSwipeBack (Convention #7 — never
// fight another gesture):
//   • coarse-pointer only; inert on desktop, so a trackpad can never trigger it
//   • top-anchored — arms ONLY when the page is already scrolled to the very top,
//     so it can never hijack a normal upward scroll through content
//   • direction-locked — a horizontal-dominant drag releases immediately, so
//     carousels and chip-rails keep their gesture
//   • vertical-scroller guard — bails if the touch starts inside a NESTED vertical
//     scroller (a chat transcript, a modal body); that element owns its own
//     overscroll and pulling it must not refresh the page behind it
//   • multi-touch guarded — a second finger (pinch-zoom) abandons the drag
//
// Resistance is intentional: travel is damped so the sheet feels attached to the
// finger rather than free, and it cannot be flung an arbitrary distance.

import { useCallback, useEffect, useRef, useState } from "react"

/** Drag distance (px, post-resistance) that commits the refresh on release. */
const THRESHOLD = 64
/** Hard ceiling on travel, so a long drag doesn't push the page absurdly far. */
const MAX_PULL = 96
/** Below this the drag is ambiguous — don't show anything yet. */
const ARM_PX = 6
/** Horizontal movement beyond this before arming means the user meant sideways. */
const H_SLOP = 12

// How far the page is scrolled, from whichever element is ACTUALLY scrolling.
//
// The shell's scroll region is only a real scroller on desktop: at phone width
// every one of its height/overflow constraints is `md:`-prefixed, so the div is
// auto-height (`min-h-screen`) and its content can never overflow its own box —
// the DOCUMENT scrolls instead. Measured on the announcements tab at 390px:
// scrollHeight 1920 === clientHeight 1920, and after scrolling 600px the div's
// own scrollTop was still 0 while window.scrollY was 600.
//
// So reading `node.scrollTop` alone reports a permanent 0 at exactly the width
// this gesture runs at, which satisfies the top-anchored guard at EVERY scroll
// position — the pull would arm halfway down a feed and preventDefault would
// eat the scroll. Fall back to the document whenever the node isn't scrollable.
function effectiveScrollTop(node: HTMLElement): number {
  if (node.scrollHeight > node.clientHeight) return node.scrollTop
  return window.scrollY || document.documentElement.scrollTop || 0
}

function inNestedVerticalScroller(target: EventTarget | null, root: HTMLElement): boolean {
  let n = target as HTMLElement | null
  while (n && n !== root) {
    const s = getComputedStyle(n)
    if ((s.overflowY === "auto" || s.overflowY === "scroll") && n.scrollHeight > n.clientHeight) return true
    n = n.parentElement
  }
  return false
}

interface Options {
  /** Runs on commit. The spinner stays up until this settles (resolve OR reject). */
  onRefresh: () => Promise<unknown>
  /** Hard off-switch — e.g. while a full-screen overlay owns the screen. */
  enabled?: boolean
}

export function usePullToRefresh<T extends HTMLElement>({ onRefresh, enabled = true }: Options) {
  const ref = useRef<T | null>(null)
  const [pull, setPull] = useState(0)
  const [refreshing, setRefreshing] = useState(false)

  // Read in touch handlers that are attached once — a ref keeps them from going
  // stale without re-binding listeners on every render.
  const refreshRef = useRef(onRefresh)
  refreshRef.current = onRefresh
  const refreshingRef = useRef(false)
  refreshingRef.current = refreshing

  const run = useCallback(async () => {
    setRefreshing(true)
    try {
      await refreshRef.current()
    } catch {
      // A failed refresh must still release the spinner — leaving it spinning
      // forever is worse than showing stale data.
    } finally {
      setRefreshing(false)
      setPull(0)
    }
  }, [])

  useEffect(() => {
    const el = ref.current
    if (!el || !enabled) return
    if (!window.matchMedia("(pointer: coarse)").matches) return

    let startY = 0
    let startX = 0
    let armed = false
    let dragging = false

    function onStart(e: TouchEvent) {
      if (refreshingRef.current || e.touches.length !== 1) { armed = false; dragging = false; return }
      const node = ref.current
      if (!node) return
      // Only from the very top, and never from inside a nested scroller.
      if (effectiveScrollTop(node) > 0) { armed = false; return }
      if (inNestedVerticalScroller(e.target, node)) { armed = false; return }
      startY = e.touches[0].clientY
      startX = e.touches[0].clientX
      armed = true
      dragging = false
    }

    function onMove(e: TouchEvent) {
      if (!armed || refreshingRef.current || e.touches.length !== 1) return
      const dy = e.touches[0].clientY - startY
      const dx = Math.abs(e.touches[0].clientX - startX)

      if (!dragging) {
        if (dy <= ARM_PX) {
          // Upward or still — this is an ordinary scroll; let it go for good.
          if (dy < 0) armed = false
          return
        }
        if (dx > H_SLOP) { armed = false; return }   // sideways intent
        dragging = true
      }

      // Square-root resistance: responsive at first, increasingly reluctant.
      const damped = Math.min(MAX_PULL, Math.sqrt(Math.max(0, dy)) * 7)
      setPull(damped)
      // Non-passive so this can win over the WebView's rubber-band, which would
      // otherwise scroll the whole page and leave the indicator drifting.
      if (e.cancelable) e.preventDefault()
    }

    function onEnd() {
      if (!armed || !dragging) { armed = false; dragging = false; return }
      armed = false
      dragging = false
      setPull(cur => {
        if (cur >= THRESHOLD) { void run() ; return THRESHOLD }
        return 0
      })
    }

    el.addEventListener("touchstart", onStart, { passive: true })
    el.addEventListener("touchmove", onMove, { passive: false })
    el.addEventListener("touchend", onEnd, { passive: true })
    el.addEventListener("touchcancel", onEnd, { passive: true })
    return () => {
      el.removeEventListener("touchstart", onStart)
      el.removeEventListener("touchmove", onMove)
      el.removeEventListener("touchend", onEnd)
      el.removeEventListener("touchcancel", onEnd)
    }
  }, [enabled, run])

  return {
    /** Attach to the scroll element itself. */
    ref,
    /** Current travel in px (0 when idle). Drives the indicator's position. */
    pull,
    /** True while onRefresh is in flight — keep the spinner up and spinning. */
    refreshing,
    /** Past the commit point, so the indicator can signal "release now". */
    armed: pull >= THRESHOLD,
  }
}
