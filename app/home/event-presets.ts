// ─── Event presets — typed wrapper ───────────────────────────────────────────
//
// The DATA lives in event-presets-data.mjs (plain ESM) so node seed scripts can
// import the exact same playbooks the app seeds from — see that file's header.
// This wrapper applies the TS types and hosts the small date helpers the app
// and the Add-Event modal use to turn offsets/anchors into concrete dates.

import type { EventType, EventExtraTab, CountdownPhaseDef } from "./types"
import {
  EVENT_PRESET_DATA, BOARD_ROLE_RESOURCES,
  lineageKeyOf as _lineageKeyOf, seasonLabelOf as _seasonLabelOf,
  COUNTDOWN_PRESETS, DEFAULT_COUNTDOWN_PRESET,
  countdownPresetPhases as _countdownPresetPhases,
  countdownPresetIdOf as _countdownPresetIdOf,
} from "./event-presets-data.mjs"

export type { CountdownPhaseDef }

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
  // Quick presets: suggest today+N instead of the annual anchor (a game night
  // is "next week", not "next September").
  relativeDays?: number
}

export type EventTypeConfig = {
  label: string; icon: string; dot: string; bg: string; text: string
  budgetCategory: string | null; description: string
  defaults: EventTypeDefaults
  defaultPhases: { key: string; label: string; tasks: PresetTask[] }[]
  defaultRoles: { name: string; notes: string }[]
  extraTabs: EventExtraTab[]
}

export const EVENT_TYPE_CONFIGS = EVENT_PRESET_DATA as Record<EventType, EventTypeConfig>

export type RoleResource = { summary: string; responsibilities: string[] }
export const BOARD_ROLE_RESOURCE_MAP = BOARD_ROLE_RESOURCES as Record<string, RoleResource>

// ── Countdown ladders ────────────────────────────────────────────────────────
// Typed view of the shared preset data. The ladder REPLACED plan_start_date /
// crunch_date — see COUNTDOWN_PRESETS in event-presets-data.mjs for the shape
// and the bucketing contract.

export type CountdownPreset = {
  id: string
  label: string
  hint: string
  phases: CountdownPhaseDef[]
}

export const COUNTDOWN_PRESET_MAP = COUNTDOWN_PRESETS as Record<string, CountdownPreset>

/** Ordered for pickers: long first, then short. "Custom" is derived, never listed. */
export const COUNTDOWN_PRESET_LIST: CountdownPreset[] = [
  COUNTDOWN_PRESET_MAP.long,
  COUNTDOWN_PRESET_MAP.short,
]

/** Fresh deep copy of a preset's phases — callers mutate freely. */
export const countdownPresetPhases = _countdownPresetPhases as (id?: string) => CountdownPhaseDef[]

/** Which preset a ladder matches, or "custom" once it diverges. Derived, never stored. */
export const countdownPresetIdOf = _countdownPresetIdOf as (phases: CountdownPhaseDef[] | null | undefined) => string

export { DEFAULT_COUNTDOWN_PRESET }

/**
 * A plan's ladder, falling back to the default preset. Rows created before the
 * column existed (and any row whose jsonb failed to shape) read as the long
 * ladder rather than rendering an eventless, phase-less checklist.
 */
export function ladderOf(phases: CountdownPhaseDef[] | null | undefined): CountdownPhaseDef[] {
  return Array.isArray(phases) && phases.length > 0 ? phases : countdownPresetPhases(DEFAULT_COUNTDOWN_PRESET)
}

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

// Lineage + season identity live in event-presets-data.mjs (shared with the
// seed scripts) — re-exported here with types applied.
export const lineageKeyOf = _lineageKeyOf as (name: string) => string
export const seasonLabelOf = _seasonLabelOf as (eventYMD: string) => string
