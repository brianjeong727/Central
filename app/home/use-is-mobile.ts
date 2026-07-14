"use client"

import { useSyncExternalStore } from "react"

const QUERY = "(max-width: 767px)"

// Shared viewport hook — true below the md (768px) breakpoint. SSR-safe and
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
