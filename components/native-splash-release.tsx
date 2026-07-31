"use client"

import { useEffect } from "react"
import { isNativeShell } from "@/lib/native-auth"
import { hideNativeSplash, isNativeSplashClaimed } from "@/lib/native-splash"

// Mounted once in the ROOT layout so EVERY route releases the native launch splash —
// not just /home and /login (the only two that mount EntrySplash). See lib/native-splash.ts
// for why the release is centralized and how the EntrySplash claim interacts with it.
//
// The release is deferred one macrotask so EntrySplash — which mounts deeper in the tree
// and claims the splash synchronously in its own effect — always wins the race regardless
// of effect ordering. Renders nothing.
//
// The BACKSTOP then hides unconditionally a few seconds later: an orphaned claim (e.g.
// EntrySplash unmounting between its claim and its post-paint handoff) would otherwise
// leave the net permanently backed off — reintroducing the very forever-splash this
// exists to prevent. By then any legitimate handoff has long since fired, and hide() is
// idempotent, so the extra call is free.
const BACKSTOP_MS = 6000

// Is there a native splash to release at all? Two independent signals, OR'd on purpose:
// the appended UA tag (same one proxy.ts routes on) and the Capacitor bridge global the
// shell injects. Either alone is enough, so a UA-detection miss can't strand the splash —
// while plain web matches neither and skips the @capacitor/splash-screen import entirely.
function hasNativeSplash(): boolean {
  return (
    isNativeShell() ||
    (typeof window !== "undefined" && typeof (window as { Capacitor?: unknown }).Capacitor !== "undefined")
  )
}

export default function NativeSplashRelease() {
  useEffect(() => {
    if (!hasNativeSplash()) return

    const soon = window.setTimeout(() => {
      if (!isNativeSplashClaimed()) hideNativeSplash()
    }, 0)
    const backstop = window.setTimeout(() => { hideNativeSplash() }, BACKSTOP_MS)
    return () => { window.clearTimeout(soon); window.clearTimeout(backstop) }
  }, [])

  return null
}
