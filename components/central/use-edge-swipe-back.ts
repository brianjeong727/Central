"use client"

// Edge-swipe-to-go-back for mobile push surfaces (mobile_design_system §0.3 —
// the swipe is an ALTERNATE input to the single chrome chevron, never a new
// visible affordance). Attach the returned ref to the panel element that should
// slide; pass the SAME handler the chevron fires (`onClose` / the parent crumb's
// `onClick`). Inert on desktop — it only arms on a coarse pointer.
//
// Safety properties (Convention #7 — never fight another gesture):
//   • coarse-pointer only; never touches mouse/desktop
//   • edge-anchored — the touch must START within `edgePx` of the left edge
//   • horizontal-scroller guard — bails if the touch begins inside a carousel /
//     chip-rail (any overflow-x scroller), so those can never be hijacked
//   • direction-locked — a vertical-dominant drag releases to the scroller
//   • multi-touch guarded — ignores extra fingers once a drag has started
//
// Motion follows emil / PocketSheet: transform-only, direct DOM writes (no CSS
// vars → no child style recalc), custom ease-out curve. Finger-follow is direct
// manipulation so it runs even under reduced-motion; only the auto snap/slide-off
// transitions are suppressed there.

import { useEffect, useRef } from "react"

const EASE = "cubic-bezier(0.23,1,0.32,1)"

interface Options {
  /** px from the left edge within which a touch must start to arm the gesture */
  edgePx?: number
  /** fraction of panel width to travel to complete the back (default 0.4) */
  threshold?: number
  /** flick velocity (px/ms) that completes regardless of distance */
  velocity?: number
  /** hard off-switch (e.g. an inline/desktop render path) */
  enabled?: boolean
}

/** Exported so `swipe-actions.tsx` shares this ONE guard rather than keeping a
 *  second copy that drifts — both gestures must skip carousels/chip-rails
 *  identically (Convention #7). */
export function inHorizontalScroller(target: EventTarget | null, root: HTMLElement): boolean {
  let n = target as HTMLElement | null
  while (n && n !== root) {
    const s = getComputedStyle(n)
    if ((s.overflowX === "auto" || s.overflowX === "scroll") && n.scrollWidth > n.clientWidth + 1) return true
    n = n.parentElement
  }
  return false
}

export function useEdgeSwipeBack<T extends HTMLElement>(
  onBack: (() => void) | undefined,
  { edgePx = 24, threshold = 0.4, velocity = 0.5, enabled = true }: Options = {},
) {
  const ref = useRef<T | null>(null)
  const onBackRef = useRef(onBack)
  useEffect(() => { onBackRef.current = onBack })

  const active = enabled && !!onBack

  useEffect(() => {
    const el = ref.current
    if (!el || !active) return
    if (typeof window === "undefined" || !window.matchMedia?.("(pointer: coarse)").matches) return
    const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false

    let startX = 0, startY = 0, startT = 0, dx = 0
    let armed = false      // touch began in the edge zone
    let locked = false     // horizontal drag confirmed — we own the gesture
    let touchId: number | null = null

    const panelWidth = () => el.getBoundingClientRect().width || window.innerWidth
    const clearInline = () => { el.style.transition = ""; el.style.transform = "" }

    const onStart = (e: TouchEvent) => {
      if (locked || touchId !== null) return             // multi-touch protection
      const t = e.touches[0]
      if (!t || t.clientX > edgePx) return                // must start at the left edge
      if (inHorizontalScroller(e.target, el)) return       // never hijack a carousel/rail
      touchId = t.identifier
      startX = t.clientX; startY = t.clientY; startT = e.timeStamp
      dx = 0; armed = true; locked = false
    }

    const onMove = (e: TouchEvent) => {
      if (!armed) return
      const t = Array.from(e.touches).find(x => x.identifier === touchId)
      if (!t) return
      const mx = t.clientX - startX
      const my = t.clientY - startY
      if (!locked) {
        if (Math.abs(mx) < 8 && Math.abs(my) < 8) return  // wait for a decisive move
        if (Math.abs(my) >= Math.abs(mx)) { armed = false; return }  // vertical → let it scroll
        locked = true
        el.style.transition = "none"
      }
      e.preventDefault()                                   // we own it now (listener is non-passive)
      dx = Math.max(0, mx)                                 // rightward only
      el.style.transform = `translateX(${dx}px)`
    }

    const onEnd = (e: TouchEvent) => {
      if (!locked) { armed = false; touchId = null; return }
      const elapsed = e.timeStamp - startT
      const flick = dx / Math.max(1, elapsed)
      const complete = dx >= panelWidth() * threshold || flick > velocity
      armed = false; locked = false; touchId = null

      if (!complete) {                                     // snap back to rest
        if (reduce) { clearInline(); return }
        el.style.transition = `transform 220ms ${EASE}`
        el.style.transform = ""
        const clear = () => { clearInline(); el.removeEventListener("transitionend", clear) }
        el.addEventListener("transitionend", clear)
        return
      }
      if (reduce) { clearInline(); onBackRef.current?.(); return }
      el.style.transition = `transform 200ms ${EASE}`      // finish sliding off, then fire
      el.style.transform = `translateX(${panelWidth()}px)`
      const done = () => {
        el.removeEventListener("transitionend", done)
        clearInline()
        onBackRef.current?.()
      }
      el.addEventListener("transitionend", done)
    }

    const onCancel = () => {
      armed = false; locked = false; touchId = null
      if (reduce) clearInline()
      else { el.style.transition = `transform 220ms ${EASE}`; el.style.transform = "" }
    }

    el.addEventListener("touchstart", onStart, { passive: true })
    el.addEventListener("touchmove", onMove, { passive: false })
    el.addEventListener("touchend", onEnd, { passive: true })
    el.addEventListener("touchcancel", onCancel, { passive: true })
    return () => {
      el.removeEventListener("touchstart", onStart)
      el.removeEventListener("touchmove", onMove)
      el.removeEventListener("touchend", onEnd)
      el.removeEventListener("touchcancel", onCancel)
      clearInline()
    }
  }, [active, edgePx, threshold, velocity])

  return ref
}
