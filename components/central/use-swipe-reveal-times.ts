"use client"

// ── useSwipeRevealTimes — drag the transcript LEFT to see every message's time ─
//
// iMessage's timestamp gesture: per-message times are not printed under every
// bubble (that is a column of near-identical "3:42 PM"s that says nothing), they
// sit just past the right edge of the screen and slide into view when you drag
// the conversation leftward, one beside each bubble; let go and everything
// settles back. What the reader gets at rest is the centred separator that opens
// each conversation window (see `formatTimeSepLabel`), which is the timestamp
// that actually carries information.
//
// TWO ELEMENTS, ONE TRANSFORM. The listeners sit on the HOST (the transcript
// scroller — it is the whole touch surface) and the drag is written as a single
// `translateX` on the TRACK (the message column inside it). Every row already
// holds its time label absolutely positioned 72px past the row's right edge
// (`[data-message-time]` in message-row.tsx), clipped by the scroller's
// `overflow-x-hidden`, so moving the column IS the reveal — no per-row style
// write, no CSS variable fanning a style recalc through ~100 rows per touchmove.
//
// Coexistence (Convention #7 — never fight another gesture). The bubble's own
// `useSwipeToReply` claims a RIGHTWARD drag; this hook claims a LEFTWARD one and
// releases anything else, so the two never both lock. Edge-swipe-back starts at
// the left edge and travels right — disjoint again. A vertical-dominant move is
// released to the scroller before anything is claimed, and a touch inside a
// horizontal scroller (link preview, poll) is left alone via the SAME guard the
// other two hooks import.
//
// `onLock` matters for the same reason it does in `useSwipeToReply`: a leftward
// drag that begins ON a bubble has already started ChatScreen's 400ms long-press
// timer, and once this hook preventDefaults the move the browser never fires the
// pointercancel that would have stopped it. The host cancels it explicitly.
//
// Motion follows emil / PocketSheet: transform-only, direct DOM writes, the house
// ease-out for the snap home. Finger-follow is direct manipulation and runs under
// reduced motion; only the snap-back transition is suppressed there.

import { useEffect, type RefObject } from "react"
import { inHorizontalScroller } from "./use-edge-swipe-back"

const EASE = "cubic-bezier(0.23,1,0.32,1)"

/**
 * How far the column travels at full reveal, and therefore how far past the
 * row's right edge each time label is parked. message-row.tsx positions
 * `[data-message-time]` at `right: -REVEAL`; the two must move together.
 */
export const TIME_REVEAL_PX = 72

interface Options {
  /** px from the left edge within which a touch is left to edge-swipe-back. */
  edgePx?: number
  /** hard off-switch (the desktop render path, an empty room). */
  enabled?: boolean
  /** Fired once per drag, the instant the gesture locks horizontal-left. */
  onLock?: () => void
}

export function useSwipeRevealTimes(
  hostRef: RefObject<HTMLElement | null>,
  trackRef: RefObject<HTMLElement | null>,
  { edgePx = 24, enabled = true, onLock }: Options = {},
) {
  useEffect(() => {
    const host = hostRef.current
    if (!host || !enabled) return
    if (typeof window === "undefined" || !window.matchMedia?.("(pointer: coarse)").matches) return
    const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false

    let startX = 0, startY = 0, dx = 0
    let armed = false      // touch began somewhere we may claim
    let locked = false     // leftward drag confirmed — we own the gesture
    let touchId: number | null = null
    let track: HTMLElement | null = null

    const clearInline = (el: HTMLElement) => { el.style.transition = ""; el.style.transform = "" }

    const onStart = (e: TouchEvent) => {
      if (locked || touchId !== null) return                 // multi-touch protection
      const t = e.touches[0]
      if (!t) return
      if (t.clientX <= edgePx) return                        // that zone is back-swipe's
      if (inHorizontalScroller(e.target, host)) return        // never hijack a scroller
      touchId = t.identifier
      startX = t.clientX; startY = t.clientY
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
        if (mx >= 0) { armed = false; return }               // rightward is swipe-to-reply's
        // The column is read at lock time, not at attach time: the host mounts
        // before the room has any messages, and the column with it.
        track = trackRef.current
        if (!track) { armed = false; return }
        locked = true
        track.style.transition = "none"
        onLock?.()
      }
      e.preventDefault()                                      // we own it (listener non-passive)
      dx = Math.max(0, -mx)
      // HARD STOP at full reveal (ratified with Brian 2026-09-13). A rubber-band
      // past it was tried and read as "keep going": the column kept creeping, so
      // the times never felt parked. The finger can travel; the column cannot.
      const shown = Math.min(dx, TIME_REVEAL_PX)
      track!.style.transform = `translateX(${-shown}px)`
    }

    const settle = () => {
      const el = track
      track = null
      if (!el) return
      if (reduce) { clearInline(el); return }
      el.style.transition = `transform 240ms ${EASE}`
      el.style.transform = ""
      const clear = () => { clearInline(el); el.removeEventListener("transitionend", clear) }
      el.addEventListener("transitionend", clear)
    }

    const onEnd = () => {
      const was = locked
      armed = false; locked = false; touchId = null
      if (was) settle()
    }

    host.addEventListener("touchstart", onStart, { passive: true })
    host.addEventListener("touchmove", onMove, { passive: false })
    host.addEventListener("touchend", onEnd, { passive: true })
    host.addEventListener("touchcancel", onEnd, { passive: true })
    return () => {
      host.removeEventListener("touchstart", onStart)
      host.removeEventListener("touchmove", onMove)
      host.removeEventListener("touchend", onEnd)
      host.removeEventListener("touchcancel", onEnd)
      // Only a drag in flight has written anything; `track` is that column.
      if (track) clearInline(track)
    }
    // `onLock` is read at call time; re-binding ~listeners on a parent re-render
    // for a callback identity change is exactly what the other swipe hooks avoid.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hostRef, trackRef, edgePx, enabled])
}
