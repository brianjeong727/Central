"use client"

import { useCallback } from "react"
import { useRouter } from "next/navigation"
import type { Tab } from "./types"

// ── Per-tab owned-param registry ─────────────────────────────────────────────
// Each top-level tab "owns" a set of URL sub-params. Switching to a DIFFERENT
// tab leaves other tabs' params untouched (resume-where-left-off); re-clicking
// the ALREADY-active tab clears its own set (the active-nav reset). Keep this in
// sync with the lazy-init reads scattered across the tab files.
export const TAB_PARAMS: Record<Tab, string[]> = {
  home: [],
  announcements: ["compose"],
  chats: ["chats"],
  plan: ["team", "view", "sotab", "ptab", "sgltab", "evtab", "fsec", "rteam"],
  directory: ["member"],
  give: [],
  profile: ["section"],
  settings: ["stab"],
  forms: [],
  congregation: ["cq", "cnew"],
}

// ── useNavState ──────────────────────────────────────────────────────────────
// The canonical URL-param mutation helpers. Every write reads
// window.location.search at call time and does exactly ONE router.replace
// (Convention #5 — no sequential replaces). SSR-safe: guards `window`.
export function useNavState() {
  const router = useRouter()

  // Atomic MULTI-param replace — set non-null keys, delete null keys, one replace.
  const setParams = useCallback((mutations: Record<string, string | null>) => {
    if (typeof window === "undefined") return
    const params = new URLSearchParams(window.location.search)
    for (const [key, value] of Object.entries(mutations)) {
      if (value === null) params.delete(key)
      else params.set(key, value)
    }
    router.replace(`/home?${params.toString()}`, { scroll: false })
  }, [router])

  // One-key convenience over setParams.
  const setParam = useCallback((key: string, value: string | null) => {
    setParams({ [key]: value })
  }, [setParams])

  // Delete every param the given tab owns (plus optional `extra` mutations),
  // in ONE atomic replace. Used by the active-nav reset to return a tab to its
  // landing view without disturbing other tabs' params.
  const clearTabParams = useCallback((tab: Tab, extra?: Record<string, string | null>) => {
    const mutations: Record<string, string | null> = {}
    for (const key of TAB_PARAMS[tab]) mutations[key] = null
    if (extra) Object.assign(mutations, extra)
    setParams(mutations)
  }, [setParams])

  return { setParam, setParams, clearTabParams }
}
