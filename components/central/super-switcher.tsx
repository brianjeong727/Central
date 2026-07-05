"use client"

// Super-account POV switcher (Phase 1a). Renders ONLY for the one super account
// (gated on profile.id === SUPER_UUID, never the role — so it stays reachable even
// while acting as "visitor"). Lets the super "become" any ministry role in the
// Central sandbox to hit the real gates + RLS, with an always-visible way back.
//
// - Floating chip (bottom-left): "Acting as {Role}" → popover of the 7 roles +
//   "Reset to super".
// - Slim top banner: only while acting-as (role !== HOME_ROLE) — a persistent
//   super/dev reminder with an inline reset.
//
// Any role change / reset calls the super-gated server action, then reloads so a
// fresh profile fetch drives every gate + RLS with the new role.

import { useState } from "react"
import { switchMinistryRole, resetToSuper } from "@/app/actions/super"
import { SUPER_UUID, HOME_ROLE, MINISTRY_ROLES } from "@/app/actions/super-constants"

function cap(role: string): string {
  return role.charAt(0).toUpperCase() + role.slice(1)
}

export function SuperSwitcher({ profile }: { profile: { id: string; role: string } }) {
  const [open, setOpen] = useState(false)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Hard gate on identity — never the role. Rendered nowhere for anyone else.
  if (profile.id !== SUPER_UUID) return null

  const currentRole = profile.role.toLowerCase()
  const isActingAs = currentRole !== HOME_ROLE

  async function run(action: () => Promise<{ error: string | null }>) {
    setPending(true)
    setError(null)
    const res = await action()
    if (res.error) {
      setError(res.error)
      setPending(false)
      return
    }
    // Fresh load re-fetches the profile so the new role drives RLS + every gate.
    window.location.reload()
  }

  const chip: React.CSSProperties = {
    position: "fixed",
    bottom: 80,
    left: 12,
    zIndex: 140,
    fontFamily: "var(--font-inter), system-ui, sans-serif",
  }

  return (
    <>
      {/* Slim persistent top banner — only while acting-as. */}
      {isActingAs && (
        <div
          role="status"
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            right: 0,
            zIndex: 140,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 10,
            padding: "5px 12px",
            background: "var(--plum-2)",
            color: "var(--cream-on-dark)",
            fontFamily: "var(--font-inter), system-ui, sans-serif",
            fontSize: 12.5,
            fontWeight: 500,
            letterSpacing: "0.01em",
            borderBottom: "1px solid var(--plum-deep)",
          }}
        >
          <span>⚠ Acting as {cap(currentRole)} in Central</span>
          <button
            onClick={() => run(resetToSuper)}
            disabled={pending}
            style={{
              padding: "2px 10px",
              borderRadius: "var(--r-pill)",
              border: "1px solid color-mix(in srgb, var(--cream-on-dark) 45%, transparent)",
              background: "transparent",
              color: "var(--cream-on-dark)",
              fontFamily: "inherit",
              fontSize: 12,
              fontWeight: 600,
              cursor: pending ? "not-allowed" : "pointer",
              opacity: pending ? 0.6 : 1,
            }}
          >
            Reset to super
          </button>
        </div>
      )}

      {/* Floating chip + popover. */}
      <div style={chip}>
        {open && (
          <div
            style={{
              position: "absolute",
              bottom: "calc(100% + 8px)",
              left: 0,
              width: 200,
              background: "var(--cream-panel)",
              border: "1px solid var(--line-2)",
              borderRadius: "var(--r-card)",
              boxShadow: "0 12px 32px -8px color-mix(in srgb, var(--plum-deep) 28%, transparent)",
              overflow: "hidden",
              padding: 6,
            }}
          >
            {error && (
              <div style={{ padding: "6px 10px", fontSize: 11.5, color: "var(--danger)", lineHeight: 1.4 }}>
                {error}
              </div>
            )}
            {MINISTRY_ROLES.map((role) => {
              const active = role === currentRole
              return (
                <button
                  key={role}
                  onClick={() => run(() => switchMinistryRole(role))}
                  disabled={pending || active}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    width: "100%",
                    padding: "8px 10px",
                    borderRadius: "var(--r-input)",
                    border: "none",
                    background: active ? "var(--plum-tint)" : "transparent",
                    color: active ? "var(--plum)" : "var(--ink)",
                    fontFamily: "inherit",
                    fontSize: 13,
                    fontWeight: active ? 600 : 500,
                    cursor: pending || active ? "default" : "pointer",
                    textAlign: "left",
                  }}
                >
                  <span>{cap(role)}</span>
                  {active && <span style={{ fontSize: 11 }}>●</span>}
                </button>
              )
            })}
            <div style={{ height: 1, background: "var(--line)", margin: "6px 4px" }} />
            <button
              onClick={() => run(resetToSuper)}
              disabled={pending}
              style={{
                display: "flex",
                width: "100%",
                padding: "8px 10px",
                borderRadius: "var(--r-input)",
                border: "none",
                background: "transparent",
                color: "var(--plum)",
                fontFamily: "inherit",
                fontSize: 13,
                fontWeight: 600,
                cursor: pending ? "not-allowed" : "pointer",
                textAlign: "left",
                opacity: pending ? 0.6 : 1,
              }}
            >
              Reset to super
            </button>
          </div>
        )}

        <button
          onClick={() => { setError(null); setOpen((v) => !v) }}
          disabled={pending}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 7,
            padding: "7px 12px",
            borderRadius: "var(--r-pill-lg)",
            border: "1px solid var(--plum-light)",
            background: "var(--plum-2)",
            color: "var(--cream-on-dark)",
            fontFamily: "inherit",
            fontSize: 12.5,
            fontWeight: 500,
            cursor: pending ? "wait" : "pointer",
            boxShadow: "0 6px 18px -6px color-mix(in srgb, var(--plum-deep) 40%, transparent)",
          }}
        >
          <span
            aria-hidden
            style={{ width: 6, height: 6, borderRadius: "50%", background: isActingAs ? "var(--cream-on-dark)" : "color-mix(in srgb, var(--cream-on-dark) 55%, transparent)" }}
          />
          {pending ? "Switching…" : `Acting as: ${cap(currentRole)}`}
        </button>
      </div>
    </>
  )
}
