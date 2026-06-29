"use client"

import { useCallback } from "react"
import type { Tab } from "./types"

// ── Per-tab owned-param registry ─────────────────────────────────────────────
// Each top-level tab "owns" a set of URL sub-params. Switching to a DIFFERENT
// tab leaves other tabs' params untouched (resume-where-left-off); re-clicking
// the ALREADY-active tab clears its own set (the active-nav reset). Keep this in
// sync with the lazy-init reads scattered across the tab files. Within a tab's
// set, "sidebar-level" params (= TAB_PARAMS minus TAB_FOLDED_PARAMS) persist
// across leave/return; "folded-in" params (see TAB_FOLDED_PARAMS) reset on leave.
export const TAB_PARAMS: Record<Tab, string[]> = {
  home: [],
  announcements: ["ann"],
  chats: ["chats", "chat"],
  plan: ["team", "sotab", "ptab", "sgltab", "evtab", "fsec", "rteam", "week"],
  directory: ["member"],
  give: [],
  profile: ["section", "jtab"],
  settings: ["stab"],
  forms: ["fresp"],
  congregation: ["cq"],
}

// ── Folded-in (transient) sub-params ─────────────────────────────────────────
// Deep subtabs, settings sub-pages, drill-in detail. These RESET when you leave
// a tab (so returning lands on the section's sidebar-level default, NOT the
// folded-in sub-page). The complement of these within TAB_PARAMS is
// "sidebar-level" and persists across leave/return.
export const TAB_FOLDED_PARAMS: Record<Tab, string[]> = {
  home: [], announcements: [], chats: [], give: [], directory: [],
  plan: ["sotab", "ptab", "sgltab", "evtab", "week", "fsec"],
  profile: ["section", "jtab"],
  settings: ["stab"],
  forms: ["fresp"],
  congregation: ["cq"],
}
export const ALL_FOLDED_PARAMS: string[] = Object.values(TAB_FOLDED_PARAMS).flat()

// ── useNavState ──────────────────────────────────────────────────────────────
// The canonical URL-param mutation helpers. Every write reads
// window.location.search at call time and does exactly one atomic
// history.replaceState (Convention #5 — no sequential replaces). SSR-safe: guards `window`.
export function useNavState() {
  // Atomic MULTI-param replace — set non-null keys, delete null keys, one replace.
  const setParams = useCallback((mutations: Record<string, string | null>) => {
    if (typeof window === "undefined") return
    const params = new URLSearchParams(window.location.search)
    for (const [key, value] of Object.entries(mutations)) {
      if (value === null) params.delete(key)
      else params.set(key, value)
    }
    const qs = params.toString()
    window.history.replaceState(null, "", qs ? `/home?${qs}` : "/home")
  }, [])

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
