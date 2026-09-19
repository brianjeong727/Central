"use client"

// ── "Set it up" — the event's configuration surface ──────────────────────────
// Design pass R3 (2026-09-17): every hub shows only the DOING plane; what
// configures it lives behind ONE row. For an event that is the countdown ladder
// (which used to sit at the bottom of the create modal, 59 controls deep), the
// optional modules (which used to be create-time chips a lead had to guess at),
// and Compile (which used to be a permanent card on every past event's Overview).
//
// Config, not creation, so it is a CentralModal on desktop and a PocketSheet at
// phone width — both sanctioned for exactly this (web §4.17, mobile §4). Every
// control is STAGED behind Save (Convention #21); Cancel discards.
import { useState } from "react"
import { CentralModal, CentralButton, PocketSheet, PocketSwitch, PocketButton, POCKET_KICKER_STYLE, MONO_STYLE } from "@/components/central"
import { CountdownLadderEditor } from "./countdown-ladder-editor"
import type { CountdownPhaseDef, EventExtraTab } from "../types"

export const OPTIONAL_MODULES: { key: EventExtraTab; label: string; hint: string }[] = [
  { key: "sub_events", label: "Sub-events", hint: "Nights or activities inside a bigger week" },
  { key: "acts", label: "Performances", hint: "An act line-up with sound checks" },
  { key: "teams", label: "Teams", hint: "Rosters and brackets" },
  { key: "transport", label: "Transport", hint: "Drivers and cars" },
]

function Switch({ on, onToggle, disabled, label, mobile }: { on: boolean; onToggle: () => void; disabled?: boolean; label: string; mobile: boolean }) {
  if (mobile) return <PocketSwitch checked={on} onChange={() => { if (!disabled) onToggle() }} ariaLabel={label} />
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      onClick={onToggle}
      disabled={disabled}
      style={{ width: 38, height: 22, borderRadius: 999, border: "none", background: on ? "var(--plum)" : "var(--dashed)", position: "relative", flexShrink: 0, cursor: disabled ? "default" : "pointer", padding: 0, opacity: disabled ? 0.6 : 1 }}
    >
      <span style={{ position: "absolute", width: 18, height: 18, borderRadius: 999, background: "var(--cream)", top: 2, left: on ? 18 : 2, transition: "left var(--dur-fast) var(--ease-out)" }} />
    </button>
  )
}

export function EventSetupSurface({
  mobile,
  phases,
  extras,
  builtInExtras,
  isContainer,
  isChild,
  isPast,
  onClose,
  onSave,
  onCompile,
}: {
  mobile: boolean
  phases: CountdownPhaseDef[]
  extras: EventExtraTab[]
  /** Modules the event's playbook carries by itself — shown ON and locked. */
  builtInExtras: EventExtraTab[]
  isContainer: boolean
  isChild: boolean
  isPast: boolean
  onClose: () => void
  onSave: (next: { phases: CountdownPhaseDef[]; extras: EventExtraTab[] }) => Promise<void>
  /** Opens the Compile-playbook modal (past events only). */
  onCompile?: () => void
}) {
  const [pendingPhases, setPendingPhases] = useState<CountdownPhaseDef[]>(phases)
  const [pendingExtras, setPendingExtras] = useState<EventExtraTab[]>(extras)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const dirty = JSON.stringify(pendingPhases) !== JSON.stringify(phases) || JSON.stringify([...pendingExtras].sort()) !== JSON.stringify([...extras].sort())

  async function handleSave() {
    setSaving(true); setError(null)
    try { await onSave({ phases: pendingPhases, extras: pendingExtras }); onClose() }
    catch (e: unknown) { setError((e as { message?: string }).message ?? "Couldn't save — try again.") }
    finally { setSaving(false) }
  }

  const kicker = mobile ? POCKET_KICKER_STYLE : MONO_STYLE
  const modules = OPTIONAL_MODULES.filter((m) => !(m.key === "sub_events" && isChild))

  const body = (
    <div style={{ display: "flex", flexDirection: "column", gap: mobile ? 26 : 28 }}>
      <section>
        <p style={{ ...kicker, margin: "0 0 4px" }}>Planning schedule</p>
        <p style={{ fontSize: 13, color: "var(--muted-text)", margin: "0 0 12px", lineHeight: 1.5 }}>
          When the reminders fire and how the checklist is grouped. Picked for you from how far out the event was; change it here.
        </p>
        <CountdownLadderEditor phases={pendingPhases} onChange={setPendingPhases} />
      </section>

      <section>
        <p style={{ ...kicker, margin: "0 0 4px" }}>Optional modules</p>
        <p style={{ fontSize: 13, color: "var(--muted-text)", margin: "0 0 10px", lineHeight: 1.5 }}>
          Each one adds its own door to the event. Off means it isn&apos;t on anyone&apos;s screen.
        </p>
        <div style={{ borderRadius: mobile ? "var(--r-pocket)" : "var(--r-card)", background: mobile ? "var(--ivory)" : "var(--cream-panel)", border: mobile ? "none" : "1px solid var(--line)", overflow: "hidden" }}>
          {modules.map((m, i) => {
            const builtIn = builtInExtras.includes(m.key) || (m.key === "sub_events" && isContainer)
            const on = builtIn || pendingExtras.includes(m.key)
            return (
              <div key={m.key} style={{ display: "flex", alignItems: "center", gap: 14, padding: mobile ? "12px 18px" : "12px 16px", borderBottom: i < modules.length - 1 ? "1px solid var(--line-3)" : "none" }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 14, fontWeight: 500, color: "var(--ink)" }}>{m.label}</div>
                  <div style={{ fontSize: 12, color: "var(--muted-text)", marginTop: 2 }}>{builtIn ? "Part of this playbook" : m.hint}</div>
                </div>
                <Switch
                  on={on}
                  disabled={builtIn}
                  label={m.label}
                  mobile={mobile}
                  onToggle={() => setPendingExtras((cur) => (cur.includes(m.key) ? cur.filter((k) => k !== m.key) : [...cur, m.key]))}
                />
              </div>
            )
          })}
        </div>
      </section>

      {isPast && onCompile && (
        <section>
          <p style={{ ...kicker, margin: "0 0 4px" }}>Playbook</p>
          <p style={{ fontSize: 13, color: "var(--muted-text)", margin: "0 0 12px", lineHeight: 1.5 }}>
            Save this event&apos;s tasks, roles and timing so next year&apos;s team can run it back.
          </p>
          {mobile ? (
            <PocketButton variant="quiet" surface="card" onClick={onCompile} style={{ width: "100%" }}>Compile playbook</PocketButton>
          ) : (
            <CentralButton variant="secondary" size="sm" onClick={onCompile}>Compile playbook</CentralButton>
          )}
        </section>
      )}

      {error && <p role="alert" style={{ fontSize: 13, color: "var(--danger)", margin: 0 }}>{error}</p>}
    </div>
  )

  const actions = mobile ? (
    <div style={{ display: "flex", gap: 10, marginTop: 24 }}>
      <PocketButton variant="quiet" surface="page" onClick={onClose} disabled={saving} style={{ flex: 1 }}>Cancel</PocketButton>
      <PocketButton variant="primary" onClick={handleSave} disabled={!dirty || saving} style={{ flex: 1 }}>{saving ? "Saving…" : "Save changes"}</PocketButton>
    </div>
  ) : (
    <>
      <CentralButton variant="secondary" size="sm" onClick={onClose} disabled={saving}>Cancel</CentralButton>
      <CentralButton variant="primary" size="sm" onClick={handleSave} disabled={!dirty || saving}>{saving ? "Saving…" : "Save changes"}</CentralButton>
    </>
  )

  if (mobile) {
    return (
      <PocketSheet title="Set it up" onClose={onClose}>
        {body}
        {actions}
      </PocketSheet>
    )
  }
  return (
    <CentralModal title="Set it up" onClose={onClose} maxWidth={560} footer={actions}>
      {body}
    </CentralModal>
  )
}
