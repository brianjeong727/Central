"use client"

// ── Countdown ladder editor ───────────────────────────────────────────────────
// The per-event planning structure control, rendered inside the Add/Edit Event
// modal (§4.17 — modals are for creation/config, and this is config).
//
// This REPLACED the old "Plan start date" + "Crunch date" input pair. Those were
// two absolute dates that had to be shifted every time the event moved; a ladder
// is relative offsets, so it means the same thing wherever the event lands.
//
// Two presets seed it (COUNTDOWN_PRESETS in app/home/event-presets-data.mjs) and
// every rung is then editable — label and how many days out it starts. Editing
// anything flips the picker to "Custom", which is DERIVED from the phase list
// (countdownPresetIdOf), never stored: edit a ladder back into preset shape and
// it reads as that preset again.
//
// Lives in app/home/components/ rather than components/central/ because it
// consumes `CountdownPhaseDef` from app/home/types — components/central is a
// LEAF and must never import from app/ (CLAUDE.md, Key Files).
//
// Staging: this control mutates the PARENT's pending state only. The DB write
// happens on the modal's Save (Convention #21).

import { Plus, X } from "lucide-react"
import { MONO_STYLE } from "@/components/central/typography"
import { Input, SegmentedControl } from "@/components/central"
import { COUNTDOWN_PRESET_LIST, countdownPresetPhases, countdownPresetIdOf } from "../event-presets"
import type { CountdownPhaseDef } from "../types"

// Rungs are ordered earliest → latest, i.e. strictly DESCENDING startDaysBefore.
// Every mutation re-sorts, so a user typing a boundary out of order still lands a
// coherent ladder rather than a silently broken bucketer.
function normalize(phases: CountdownPhaseDef[]): CountdownPhaseDef[] {
  return [...phases].sort((a, b) => b.startDaysBefore - a.startDaysBefore)
}

/** Stable-ish key for a new rung; collisions are avoided by suffixing on clash. */
function freshKey(phases: CountdownPhaseDef[], days: number): string {
  const base = days >= 0 ? `t${days}d` : "after"
  if (!phases.some((p) => p.key === base)) return base
  let n = 2
  while (phases.some((p) => p.key === `${base}-${n}`)) n++
  return `${base}-${n}`
}

/** Human default label for a boundary — "T−3 WEEKS" on exact weeks, else days. */
function defaultLabel(days: number): string {
  if (days < 0) return "AFTER"
  if (days === 0) return "DAY OF"
  if (days % 7 === 0) {
    const w = days / 7
    return `T−${w} ${w === 1 ? "WEEK" : "WEEKS"}`
  }
  return `T−${days} ${days === 1 ? "DAY" : "DAYS"}`
}

export function CountdownLadderEditor({
  phases,
  onChange,
  disabled = false,
}: {
  phases: CountdownPhaseDef[]
  onChange: (next: CountdownPhaseDef[]) => void
  disabled?: boolean
}) {
  const presetId = countdownPresetIdOf(phases)

  function patch(index: number, patchFields: Partial<CountdownPhaseDef>) {
    const next = phases.map((p, i) => (i === index ? { ...p, ...patchFields } : p))
    onChange(normalize(next))
  }

  function removeAt(index: number) {
    onChange(phases.filter((_, i) => i !== index))
  }

  function addRung() {
    // Slot the new rung halfway between the last two boundaries so it lands
    // somewhere meaningful instead of colliding with an existing one.
    const days = phases.length >= 2
      ? Math.max(0, Math.round((phases[phases.length - 2].startDaysBefore + phases[phases.length - 1].startDaysBefore) / 2))
      : 1
    const rung: CountdownPhaseDef = {
      key: freshKey(phases, days),
      label: defaultLabel(days),
      startDaysBefore: days,
      seedOffsetDays: -days,
      eventPhase: days === 0 ? "day_of" : "pre_event",
    }
    onChange(normalize([...phases, rung]))
  }

  const options = [
    ...COUNTDOWN_PRESET_LIST.map((p) => ({ id: p.id, label: p.label })),
    // "Custom" is not selectable — it only lights up once the ladder diverges.
    ...(presetId === "custom" ? [{ id: "custom", label: "Custom" }] : []),
  ]
  const activeHint = COUNTDOWN_PRESET_LIST.find((p) => p.id === presetId)?.hint
    ?? "Your own structure — add, rename, or re-time any phase."

  return (
    <div>
      <span style={{ ...MONO_STYLE, display: "block", marginBottom: 8 }}>Countdown planning</span>

      <SegmentedControl
        options={options}
        value={presetId}
        onChange={(id) => { if (id !== "custom" && !disabled) onChange(countdownPresetPhases(id)) }}
        aria-label="Countdown planning structure"
      />

      <p style={{ fontSize: 11.5, color: "var(--muted-text)", margin: "8px 0 0" }}>{activeHint}</p>

      <div style={{ marginTop: 14, border: "1px solid var(--line-2)", borderRadius: 12, overflow: "hidden" }}>
        {phases.map((p, i) => {
          const isLast = i === phases.length - 1
          return (
            <div
              key={p.key}
              style={{
                display: "grid",
                // minmax(0, 1fr) — NOT plain 1fr. A grid child's default min-width
                // is auto, so at phone width the label input would refuse to
                // shrink below its intrinsic size and push the row into overflow.
                gridTemplateColumns: "minmax(0, 1fr) 88px 28px",
                gap: 10,
                alignItems: "center",
                padding: "10px 12px",
                background: "var(--cream)",
                borderBottom: isLast ? "none" : "1px solid var(--line-3)",
              }}
            >
              <Input
                size="sm"
                value={p.label}
                disabled={disabled}
                aria-label={`Phase ${i + 1} label`}
                onChange={(e) => patch(i, { label: e.target.value })}
              />
              {isLast ? (
                // The LAST rung has no editable boundary by construction: the
                // bucketer never reads it (it swallows everything below the rung
                // above). Rendering a number here — "−1" for AFTER — would invite
                // edits that change nothing, so say what it actually does.
                <span style={{ fontSize: 11.5, color: "var(--faint)", textAlign: "center" }}>
                  everything after
                </span>
              ) : (
                <Input
                  size="sm"
                  type="number"
                  value={String(p.startDaysBefore)}
                  disabled={disabled}
                  aria-label={`Phase ${i + 1} starts this many days before the event`}
                  onChange={(e) => {
                    const days = Number(e.target.value)
                    if (Number.isNaN(days)) return
                    patch(i, {
                      startDaysBefore: days,
                      seedOffsetDays: -days,
                      eventPhase: days < 0 ? "post_event" : days === 0 ? "day_of" : p.eventPhase,
                    })
                  }}
                />
              )}
              <button
                type="button"
                disabled={disabled || phases.length <= 2}
                onClick={() => removeAt(i)}
                aria-label={`Remove ${p.label}`}
                title={phases.length <= 2 ? "A ladder needs at least two phases" : `Remove ${p.label}`}
                style={{
                  width: 28, height: 28, borderRadius: 6, display: "grid", placeItems: "center",
                  background: "none", border: "1px solid var(--line-2)",
                  color: phases.length <= 2 ? "var(--faint)" : "var(--muted-text)",
                  cursor: phases.length <= 2 || disabled ? "not-allowed" : "pointer",
                }}
              >
                <X style={{ width: 13, height: 13 }} />
              </button>
            </div>
          )
        })}
      </div>

      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 8 }}>
        <span style={{ fontSize: 11, color: "var(--faint)" }}>Days before the event each phase opens.</span>
        <button
          type="button"
          onClick={addRung}
          disabled={disabled}
          style={{
            display: "inline-flex", alignItems: "center", gap: 5, padding: "5px 10px", borderRadius: 8,
            background: "none", border: "1px solid var(--line-2)", color: "var(--body)",
            fontSize: 12, fontFamily: "var(--font-inter)", cursor: disabled ? "not-allowed" : "pointer",
          }}
        >
          <Plus style={{ width: 12, height: 12 }} /> Add phase
        </button>
      </div>
    </div>
  )
}
