"use client"

import { useState, useEffect } from "react"

// Shared B3 Pocket Daybreak breakpoint hook. Consumers that load ssr:false (the
// home tabs do) get the correct value on the very first client paint via the lazy
// window read — no desktop→mobile flash — and desktop reads false, so any
// isMobile-gated styling collapses to its desktop branch (byte-identical desktop).
export function useIsMobile(query = "(max-width: 767px)") {
  const [isMobile, setIsMobile] = useState(
    () => typeof window !== "undefined" && window.matchMedia(query).matches
  )
  useEffect(() => {
    const mq = window.matchMedia(query)
    const handler = () => setIsMobile(mq.matches)
    mq.addEventListener("change", handler)
    return () => mq.removeEventListener("change", handler)
  }, [query])
  return isMobile
}
