"use client"

// Shared scroll-reset hook. Every phone-width navigation (tab change, hub drill,
// subpage open/close, section swap) must land the NEW surface at the top —
// otherwise the incoming page inherits the outgoing page's scroll offset.
//
// On any change to `deps`, scroll `window` to (0,0) instantly, and — when a
// scroll-container ref is provided (the desktop shell locks `window`; the real
// scroll lives in an inner `md:overflow-y-auto` div) — reset that element too.
// Always `behavior: "auto"`: html sets `scroll-behavior: smooth`, so an
// unqualified scroll would animate; navigation resets must be instantaneous.

import { useEffect, DependencyList, RefObject } from "react"

export function useScrollResetOn(
  deps: DependencyList,
  ref?: RefObject<HTMLElement | null>,
) {
  useEffect(() => {
    if (typeof window !== "undefined") {
      window.scrollTo({ top: 0, left: 0, behavior: "auto" })
    }
    const el = ref?.current
    if (el) el.scrollTo({ top: 0, left: 0, behavior: "auto" })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps)
}
