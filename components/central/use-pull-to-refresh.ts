"use client"

// Pull-to-refresh for the mobile shell, iOS/Instagram grammar: the CONTENT itself
// follows the finger downward, opening a gap above it, and the spinner lives in
// that gap. Release past the threshold and the content rests at the gap height
// while the refresh runs, then settles closed.
//
// Attach the returned `ref` to the surface that should TRANSLATE — the shell's
// `.shell-scroll`. The gesture listens on that same element and reads its scroll
// position; see `effectiveScrollTop`, which is what keeps the top-anchored guard
// honest at phone width.
//
// The travel is written STRAIGHT TO THE DOM, not through React state. A drag
// emits a touchmove per frame, and `.shell-scroll` wraps the entire app tree —
// re-rendering HomeApp 60 times a second to move a div is the self-inflicted
// stutter Convention #28 calls out for the keyboard. React state here changes
// only at the coarse transitions (refresh starts / ends).
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
/** Gap the content rests at while the refresh runs — the spinner's home. */
const REST = 56
/** Below this the drag is ambiguous — don't show anything yet. */
const ARM_PX = 6
/** Horizontal movement beyond this before arming means the user meant sideways. */
const H_SLOP = 12
/** Settle animation when the finger leaves. */
const SETTLE_MS = 320
const EASE = "cubic-bezier(0.22, 1, 0.36, 1)"

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
  /** Runs on commit. The gap stays open until this settles (resolve OR reject). */
  onRefresh: () => Promise<unknown>
  /** Hard off-switch — e.g. while a full-screen overlay owns the screen. */
  enabled?: boolean
}

export function usePullToRefresh<T extends HTMLElement>({ onRefresh, enabled = true }: Options) {
  /** The surface that translates. Also the gesture's listener + scroll source. */
  const ref = useRef<T | null>(null)
  /** The gap the spinner sits in. Sized imperatively alongside the content. */
  const indicatorRef = useRef<HTMLDivElement | null>(null)
  const [refreshing, setRefreshing] = useState(false)

  // Read in touch handlers that are attached once — a ref keeps them from going
  // stale without re-binding listeners on every render.
  const refreshRef = useRef(onRefresh)
  refreshRef.current = onRefresh
  const refreshingRef = useRef(false)
  const clearTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Paint the gesture. `animate` is for the release settle only — while the
  // finger is down the travel must track it exactly, and a transition would lag
  // behind the finger by its own duration.
  const paint = useCallback((travel: number, animate: boolean) => {
    if (clearTimer.current) { clearTimeout(clearTimer.current); clearTimer.current = null }

    const el = ref.current
    if (el) {
      el.style.transition = animate ? `transform ${SETTLE_MS}ms ${EASE}` : "none"
      el.style.transform = `translateY(${travel}px)`
    }
    const ind = indicatorRef.current
    if (ind) {
      ind.style.transition = animate ? `height ${SETTLE_MS}ms ${EASE}, opacity ${SETTLE_MS}ms ${EASE}` : "none"
      ind.style.height = `${travel}px`
      // Fade in over the first stretch so a tiny accidental drag shows almost nothing.
      ind.style.opacity = `${Math.min(1, travel / 40)}`
      // Winds up with the drag: a full turn by the time it commits. Past the
      // commit point the ring spins on its own (CSS class), so leave it alone.
      const ring = ind.firstElementChild as HTMLElement | null
      if (ring) {
        const committed = travel >= THRESHOLD
        ring.classList.toggle("animate-spin", committed)
        ring.style.transform = committed ? "" : `rotate(${(travel / THRESHOLD) * 360}deg)`
      }
    }

    // At rest, strip the transform ENTIRELY rather than leaving translateY(0).
    // Any non-`none` transform makes the element a containing block for its
    // `position: fixed` descendants — the same hazard globals.css documents for
    // `.content-enter`. A lingering identity transform would silently re-anchor
    // every fixed overlay in the app to the scroll region.
    if (travel === 0) {
      const strip = () => {
        clearTimer.current = null
        const node = ref.current
        if (node) { node.style.transform = ""; node.style.transition = "" }
        const i = indicatorRef.current
        if (i) i.style.transition = ""
      }
      if (animate) clearTimer.current = setTimeout(strip, SETTLE_MS)
      else strip()
    }
  }, [])

  const run = useCallback(async () => {
    refreshingRef.current = true
    setRefreshing(true)
    paint(REST, true)
    try {
      await refreshRef.current()
    } catch {
      // A failed refresh must still close the gap — leaving it open forever is
      // worse than showing stale data.
    } finally {
      refreshingRef.current = false
      setRefreshing(false)
      paint(0, true)
    }
  }, [paint])

  useEffect(() => {
    const el = ref.current
    if (!el || !enabled) return
    if (!window.matchMedia("(pointer: coarse)").matches) return

    let startY = 0
    let startX = 0
    let armed = false
    let dragging = false
    let travel = 0

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
      travel = 0
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
      travel = Math.min(MAX_PULL, Math.sqrt(Math.max(0, dy)) * 7)
      paint(travel, false)
      // Non-passive so this can win over the WebView's rubber-band, which would
      // otherwise scroll the whole page and leave the gap drifting.
      if (e.cancelable) e.preventDefault()
    }

    function onEnd() {
      if (!armed || !dragging) { armed = false; dragging = false; return }
      armed = false
      dragging = false
      if (travel >= THRESHOLD) void run()
      else paint(0, true)
      travel = 0
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
  }, [enabled, run, paint])

  // Never leave the shell mid-pull if the gesture unmounts or is disabled
  // (an overlay opening mid-drag would otherwise freeze the content off-origin).
  useEffect(() => () => {
    if (clearTimer.current) clearTimeout(clearTimer.current)
    const node = ref.current
    if (node) { node.style.transform = ""; node.style.transition = "" }
  }, [])

  return {
    /** Attach to the surface that should translate (the shell scroll region). */
    ref,
    /** Attach to <PullToRefreshIndicator>. */
    indicatorRef,
    /** True while onRefresh is in flight — the gap is held open. */
    refreshing,
  }
}
