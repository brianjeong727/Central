// ─── Event presets — typed wrapper ───────────────────────────────────────────
//
// The DATA lives in event-presets-data.mjs (plain ESM) so node seed scripts can
// import the exact same playbooks the app seeds from — see that file's header.
// This wrapper applies the TS types and hosts the small date helpers the app
// and the Add-Event modal use to turn offsets/anchors into concrete dates.

import type { EventType, EventExtraTab } from "./types"
import { EVENT_PRESET_DATA, BOARD_ROLE_RESOURCES } from "./event-presets-data.mjs"

// A checklist task with its due-date offset in days relative to the event start
// (negative = before, 0 = day-of, null = unscheduled).
export type PresetTask = { title: string; off: number | null }

export type EventTypeDefaults = {
  title: string
  description: string
  location: string
  startTime: string // "HH:MM"
  endTime: string
  allDay: boolean
  durationDays: number // end date = start date + (durationDays - 1)
  anchorMonth: number // 1–12 — last year's real date, projected forward
  anchorDay: number
}

export type EventTypeConfig = {
  label: string; icon: string; dot: string; bg: string; text: string
  budgetCategory: string | null; canHaveSubEvents: boolean; description: string
  defaults: EventTypeDefaults
  defaultPhases: { key: string; label: string; tasks: PresetTask[] }[]
  defaultRoles: { name: string; notes: string }[]
  extraTabs: EventExtraTab[]
}

export const EVENT_TYPE_CONFIGS = EVENT_PRESET_DATA as Record<EventType, EventTypeConfig>

export type RoleResource = { summary: string; responsibilities: string[] }
export const BOARD_ROLE_RESOURCE_MAP = BOARD_ROLE_RESOURCES as Record<string, RoleResource>

// ── Date helpers (local-time YMD strings, matching the modal's date inputs) ──

export function ymdOf(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, "0")
  const day = String(d.getDate()).padStart(2, "0")
  return `${y}-${m}-${day}`
}

export function addDaysToYMD(ymd: string, days: number): string {
  const [y, m, d] = ymd.split("-").map(Number)
  const dt = new Date(y, m - 1, d + days)
  return ymdOf(dt)
}

// Next occurrence of the preset's anchor date: this year if it's still at least
// `minLeadDays` away, otherwise next year — a fresh event always lands ahead.
export function nextAnchorYMD(anchorMonth: number, anchorDay: number, minLeadDays = 3, from = new Date()): string {
  const candidate = new Date(from.getFullYear(), anchorMonth - 1, anchorDay)
  const lead = new Date(from.getFullYear(), from.getMonth(), from.getDate() + minLeadDays)
  if (candidate < lead) candidate.setFullYear(candidate.getFullYear() + 1)
  return ymdOf(candidate)
}
