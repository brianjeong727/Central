"use client"

import { useSyncExternalStore } from "react"
import { MOBILE_QUERY } from "@/lib/breakpoints"

// The exact complement of the `max-md:` variant — NOT a bare width test. A phone
// in landscape is wider than 768px, so the old "(max-width: 767px)" reported
// desktop on a rotated iPhone while the layout around it stayed mobile.
const QUERY = MOBILE_QUERY

// Shared viewport hook — true whenever the MOBILE layout is in force. SSR-safe and
// lint-clean via useSyncExternalStore: the server snapshot is always false (so
// hydration matches), the client snapshot reads matchMedia live, and the store
// re-subscribes on breakpoint changes. Use it to branch MOBILE-ONLY behavior that
// can't be expressed with `md:` utilities — e.g. restyling an inline-styled
// component that renders one shared tree for both viewports, keeping desktop
// byte-identical.
export function useIsMobile(): boolean {
  return useSyncExternalStore(
    (onChange) => {
      const mq = window.matchMedia(QUERY)
      mq.addEventListener("change", onChange)
      return () => mq.removeEventListener("change", onChange)
    },
    () => window.matchMedia(QUERY).matches,
    () => false,
  )
}
