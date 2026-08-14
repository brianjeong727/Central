"use client"

import { useEffect } from "react"
import { runBackIntent } from "@/lib/back-intent"

// Mounted once in the ROOT layout so Android's hardware/gesture back resolves on
// EVERY route — same shape as KeyboardInsetBridge (Convention #28). Renders nothing.
//
// Every Capacitor import is DYNAMIC so the web bundle never pulls the plugin in at
// module top, and a shell binary predating @capacitor/app throws rather than
// crashing. On plain web and on iOS this is inert: `backButton` is an Android-only
// event, so the listener simply never fires.
//
// Deliberately NOT wired to history.back(): Central's nav state lives in URL query
// params written with router.replace (Convention #12), which creates no history
// entries — so the WebView's `canGoBack` is meaningless here and following it would
// walk out of the app while the user still had screens to back out of.
//
// The fallback when nothing is registered is minimizeApp(), NOT exitApp(). Back on
// the root screen should behave like Home — the app goes to the background and the
// user's place is kept. Killing the process is an Android anti-pattern and would
// throw away the session's scroll/tab state on every stray back tap.
export default function NativeBackBridge() {
  useEffect(() => {
    let cancelled = false
    let remove: (() => void) | undefined

    void (async () => {
      try {
        const { Capacitor } = await import("@capacitor/core")
        if (!Capacitor.isNativePlatform()) return
        const { App } = await import("@capacitor/app")

        const handle = await App.addListener("backButton", () => {
          if (runBackIntent()) return
          App.minimizeApp().catch(() => {})
        })

        if (cancelled) {
          void handle.remove()
          return
        }
        remove = () => void handle.remove()
      } catch {
        // Not native, or a binary without @capacitor/app — nothing to wire.
      }
    })()

    return () => {
      cancelled = true
      remove?.()
    }
  }, [])

  return null
}
