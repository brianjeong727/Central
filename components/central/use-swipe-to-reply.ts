"use client"

// ── useSwipeToReply — drag a chat bubble sideways to reply to it ──────────────
//
// iMessage's message gesture (iOS 17+): swipe a bubble RIGHT and release, and
// that message loads into the composer's reply strip. The direction is the same
// for your own bubble and someone else's — iMessage, WhatsApp and Signal all do
// right-for-both, and only Telegram inverts. Ratified with Brian 2026-08-20
// after fact-checking the "it's mirrored for your own messages" intuition, which
// is wrong: what IS true is the geometry behind it — an own bubble is
// right-aligned and flush to the trailing inset, so it has nowhere to travel.
// iMessage lets it slide under the screen edge, and so do we (the consumer
// clips; see message-row.tsx's avatar+bubble row).
//
// The gesture is an ACCELERATOR, never the only path (mobile_design_system §0.3):
// reply stays reachable by long-press → Reply, so a user who never discovers the
// swipe loses nothing and a screen-reader user is not stranded.
//
// Safety properties — the SAME set `use-edge-swipe-back.ts` established
// (Convention #7, never fight another gesture), which is why its scroller guard
// is IMPORTED here rather than re-implemented:
//   • coarse-pointer only — inert on desktop, which keeps hover + long-press
//   • LEFT-EDGE EXCLUDED — a touch starting within `edgePx` belongs to
//     `useEdgeSwipeBack`, which ChatScreen wires to onClose (Convention #22).
//     An incoming bubble starts around x≈56 so this rarely bites; the guard is
//     what turns "rarely" into "never".
//   • direction-locked — a vertical-dominant drag releases to the scroller. We
//     never preventDefault a vertical move, we simply never claim one.
//   • multi-touch guarded — extra fingers can't retarget a drag in flight
//   • horizontal-scroller guard — a scrolling child (link preview, poll) wins
//
// `onLock` is not decoration: the bubble's own onPointerDown starts ChatScreen's
// 400ms long-press timer (Convention #7), and onPointerLeave/onPointerCancel do
// NOT reliably fire for a touch dragging WITHIN the element. Without an explicit
// cancel at the moment the drag locks, a slow swipe opens the context menu
// mid-drag.
//
// Motion follows emil / PocketSheet: transform-only, direct DOM writes (no CSS
// vars → no child style recalc), custom ease-out. Finger-follow is direct
// manipulation so it runs even under reduced motion; only the auto-snap
// transition is suppressed there.

import { useEffect, useRef } from "react"
import { inHorizontalScroller } from "./use-edge-swipe-back"

const EASE = "cubic-bezier(0.23,1,0.32,1)"

interface Options {
  /** px from the left edge within which a touch is left to edge-swipe-back. */
  edgePx?: number
  /** px of travel that completes the reply (iMessage sits around here). */
  trigger?: number
  /** flick velocity (px/ms) that completes regardless of distance. */
  velocity?: number
  /** hard off-switch (a deleted message, the desktop render path). */
  enabled?: boolean
  /**
   * Fired once per drag, the instant the gesture locks horizontal. The consumer
   * uses it to cancel any press timer it started on pointerdown.
   */
  onLock?: () => void
  /**
   * Fired on every frame of the drag with progress in 0..1 (travel / trigger,
   * clamped). Drives the reply glyph's fade — a callback rather than React state
   * because a bubble re-render per touchmove is a self-inflicted stutter on a
   * list this long.
   */
  onProgress?: (p: number) => void
}

export function useSwipeToReply<T extends HTMLElement>(
  onReply: (() => void) | undefined,
  { edgePx = 24, trigger = 56, velocity = 0.5, enabled = true, onLock, onProgress }: Options = {},
) {
  const ref = useRef<T | null>(null)
  // Every callback goes through a ref so the listener set is attached ONCE and
  // never re-bound on a parent re-render (each transcript holds ~100 rows).
  const onReplyRef = useRef(onReply)
  const onLockRef = useRef(onLock)
  const onProgressRef = useRef(onProgress)
  useEffect(() => {
    onReplyRef.current = onReply
    onLockRef.current = onLock
    onProgressRef.current = onProgress
  })

  const active = enabled && !!onReply

  useEffect(() => {
    const el = ref.current
    if (!el || !active) return
    if (typeof window === "undefined" || !window.matchMedia?.("(pointer: coarse)").matches) return
    const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false

    let startX = 0, startY = 0, startT = 0, dx = 0
    let armed = false      // touch began outside the back-swipe edge zone
    let locked = false     // horizontal drag confirmed — we own the gesture
    let touchId: number | null = null

    const clearInline = () => { el.style.transition = ""; el.style.transform = "" }
    const report = (travel: number) => onProgressRef.current?.(Math.min(1, travel / trigger))

    const onStart = (e: TouchEvent) => {
      if (locked || touchId !== null) return                 // multi-touch protection
      const t = e.touches[0]
      if (!t) return
      if (t.clientX <= edgePx) return                        // that zone is back-swipe's
      if (inHorizontalScroller(e.target, el)) return          // never hijack a scroller
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
        if (Math.abs(mx) < 8 && Math.abs(my) < 8) return     // wait for a decisive move
        if (Math.abs(my) >= Math.abs(mx)) { armed = false; return }   // vertical → scroll
        if (mx <= 0) { armed = false; return }               // leftward is not this gesture
        locked = true
        el.style.transition = "none"
        // Kill the host's long-press timer NOW — see the header note.
        onLockRef.current?.()
      }
      e.preventDefault()                                      // we own it (listener non-passive)
      dx = Math.max(0, mx)
      report(dx)
      // Rubber-band past the trigger: the bubble keeps answering the finger but
      // stops tracking it 1:1, so the gesture reads as "already committed"
      // instead of letting the bubble be dragged arbitrarily far off-screen.
      const shown = dx <= trigger ? dx : trigger + (dx - trigger) * 0.3
      el.style.transform = `translateX(${shown}px)`
    }

    const settle = (fire: boolean) => {
      report(0)
      if (reduce) { clearInline(); if (fire) onReplyRef.current?.(); return }
      el.style.transition = `transform 240ms ${EASE}`
      el.style.transform = ""
      const clear = () => { clearInline(); el.removeEventListener("transitionend", clear) }
      el.addEventListener("transitionend", clear)
      // Fire on release, not on transition end: the reply strip should appear
      // while the bubble is still travelling home, the way iMessage does it.
      if (fire) onReplyRef.current?.()
    }

    const onEnd = (e: TouchEvent) => {
      if (!locked) { armed = false; touchId = null; return }
      const elapsed = e.timeStamp - startT
      const flick = dx / Math.max(1, elapsed)
      // A flick still has to be a real gesture, not a twitch — the 8px lock
      // threshold alone would let a fast 10px nudge count.
      const complete = dx >= trigger || (flick > velocity && dx >= 24)
      armed = false; locked = false; touchId = null
      settle(complete)
    }

    const onCancel = () => {
      if (!locked) { armed = false; touchId = null; return }
      armed = false; locked = false; touchId = null
      settle(false)
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
  }, [active, edgePx, trigger, velocity])

  return ref
}
