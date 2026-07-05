"use client"

import { useState } from "react"
import Link from "next/link"
import { submitMinistryApplication } from "@/app/actions/ministry"
import { RingCrossLogo, PlanLineIcon } from "@/app/home/components/shared"
import { WORKSPACE_PRESETS } from "@/app/home/workspace-presets"
import { EYEBROW_STYLE as mono } from "@/components/central/typography"

const SANS  = "var(--font-inter), system-ui, sans-serif"
const SERIF = "var(--font-instrument-serif)"

// ─── Rail stepper ────────────────────────────────────────────────
const STEPS = [
  { label: "Basic info",  sub: "Name, campus, size"  },
  { label: "Structure",   sub: "Public or private"   },
  { label: "Workspaces",  sub: "What you need"       },
  { label: "Review",      sub: "Confirm & submit"    },
]

function RailStep({ i, label, sub, status }: {
  i: number; label: string; sub: string; status: "active" | "done" | "pending"
}) {
  return (
    <>
      <div style={{ display: "flex", alignItems: "flex-start", gap: 14, padding: "8px 4px" }}>
        <span style={{
          width: 26, height: 26, borderRadius: "50%", display: "grid", placeItems: "center",
          fontSize: 12, flexShrink: 0, transition: "all .14s ease",
          border: status === "pending" ? "1px solid var(--line-2)" : "none",
          background: status === "active" ? "var(--plum-2)" : status === "done" ? "var(--ivory)" : "var(--cream)",
          color:      status === "active" ? "var(--cream)"  : status === "done" ? "var(--plum)" : "var(--muted-text)",
        }}>
          {status === "done"
            ? <svg width={12} height={12} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M5 12l5 5L20 7"/></svg>
            : i + 1}
        </span>
        <span style={{ paddingTop: 4 }}>
          <span style={{
            display: "block", fontSize: 14, transition: "color .14s ease",
            color: status === "active" ? "var(--ink)" : "var(--muted-text)",
            fontWeight: status === "active" ? 500 : 400,
          }}>{label}</span>
          <span style={{ display: "block", fontSize: 12, color: "var(--faint)", marginTop: 1 }}>{sub}</span>
        </span>
      </div>
      {i < STEPS.length - 1 && (
        <div style={{ width: 1, height: 14, background: "var(--line-2)", marginLeft: 16 }} />
      )}
    </>
  )
}

// ─── Icon helper ─────────────────────────────────────────────────
function Icon({ d, size = 16, stroke = 1.6 }: { d: string; size?: number; stroke?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth={stroke} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d={d}/>
    </svg>
  )
}

// ─── Toggle ──────────────────────────────────────────────────────
function Toggle({ on, onClick }: { on: boolean; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} style={{
      width: 36, height: 22, borderRadius: 999, border: "none", padding: 0,
      cursor: "pointer", position: "relative", flexShrink: 0,
      background: on ? "var(--plum)" : "var(--dashed)", transition: "background .14s ease",
      marginTop: 1,
    }}>
      <span style={{
        position: "absolute", width: 18, height: 18, borderRadius: "50%", background: "var(--cream)",
        top: 2, left: on ? 16 : 2, transition: "left .14s ease",
      }}/>
    </button>
  )
}

// ─── Toggle row ──────────────────────────────────────────────────
function ToggleRow({ title, desc, on, onClick }: {
  title: string; desc: string; on: boolean; onClick: () => void
}) {
  return (
    <div style={{
      display: "flex", alignItems: "flex-start", gap: 14, padding: 18,
      border: "1px solid var(--line)", borderRadius: 12, background: "var(--cream)", marginTop: 12,
    }}>
      <Toggle on={on} onClick={onClick}/>
      <div>
        <div style={{ fontSize: 14, fontWeight: 500, color: "var(--ink)" }}>{title}</div>
        <div style={{ fontSize: 13, color: "var(--muted-text)", marginTop: 3, lineHeight: 1.5 }}>{desc}</div>
      </div>
    </div>
  )
}

// ─── Selectable workspace card ───────────────────────────────────
// Workspaces come from the shared preset list. Available presets are multi-select
// (default none); coming-soon presets render dimmed and disabled.
function WorkspacePickCard({ iconKey, name, desc, selected, comingSoon, onToggle }: {
  iconKey: string; name: string; desc: string
  selected: boolean; comingSoon?: boolean; onToggle?: () => void
}) {
  return (
    <button
      type="button"
      disabled={comingSoon}
      onClick={onToggle}
      aria-pressed={selected}
      style={{
        width: "100%", display: "flex", alignItems: "center", gap: 12, padding: "12px 14px",
        border: `1.5px solid ${selected ? "var(--plum)" : "var(--line-2)"}`,
        borderRadius: 10,
        // Selected = ivory surface + plum border (the app's active-state pattern).
        // Plum is a surgical accent, never a card fill — esp. with multi-select.
        background: comingSoon ? "var(--cream-3)" : selected ? "var(--ivory)" : "var(--cream)",
        marginBottom: 10, textAlign: "left", fontFamily: SANS,
        cursor: comingSoon ? "default" : "pointer", opacity: comingSoon ? 0.55 : 1,
        transition: "border-color .12s ease, background .12s ease",
      }}
    >
      <PlanLineIcon iconKey={iconKey} size={38} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontSize: 15, color: "var(--ink)" }}>{name}</span>
          {comingSoon && (
            <span style={{
              ...mono, fontSize: 9.5, letterSpacing: "0.1em", color: "var(--muted-text)",
              border: "1px solid var(--line-2)", borderRadius: 99, padding: "2px 7px",
            }}>Coming soon</span>
          )}
        </div>
        <div style={{ fontSize: 12.5, color: "var(--muted-text)", marginTop: 2 }}>{desc}</div>
      </div>
      {!comingSoon && (
        <span style={{
          width: 20, height: 20, borderRadius: 6, flexShrink: 0,
          border: `2px solid ${selected ? "var(--plum)" : "var(--dashed)"}`,
          background: selected ? "var(--plum)" : "transparent",
          display: "grid", placeItems: "center",
        }}>
          {selected && (
            <svg width={11} height={11} viewBox="0 0 24 24" fill="none" stroke="var(--cream)" strokeWidth={3.5} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <polyline points="20 6 9 17 4 12"/>
            </svg>
          )}
        </span>
      )}
    </button>
  )
}

// ─── Field ───────────────────────────────────────────────────────
function Field({ label, value, onChange, placeholder, readOnly, mono: monoFont, error }: {
  label: string; value: string; onChange?: (v: string) => void
  placeholder?: string; readOnly?: boolean; mono?: boolean; error?: boolean
}) {
  return (
    <div>
      <label style={{ ...mono, display: "block", marginBottom: 9 }}>{label}</label>
      <input
        value={value}
        readOnly={readOnly}
        onChange={e => onChange?.(e.target.value)}
        placeholder={placeholder}
        style={{
          width: "100%", padding: "13px 15px",
          border: `1px solid ${error ? "var(--danger)" : "var(--line-2)"}`,
          borderRadius: 10, background: "var(--cream)",
          fontFamily: monoFont ? "ui-monospace, SFMono-Regular, Menlo, monospace" : SANS,
          fontSize: 15, color: "var(--ink)", outline: "none",
          letterSpacing: monoFont ? "2px" : undefined,
          boxSizing: "border-box",
        }}
      />
    </div>
  )
}

// ─── Review row ──────────────────────────────────────────────────
function ReviewRow({ label, value, last }: { label: string; value: string; last?: boolean }) {
  return (
    <div style={{
      display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16,
      padding: "15px 0",
      borderBottom: last ? "none" : "1px solid var(--line-3)",
    }}>
      <span style={{ ...mono }}>{label}</span>
      <span style={{ fontSize: 15, color: "var(--ink)", textAlign: "right" }}>{value}</span>
    </div>
  )
}

// ─── Step header ─────────────────────────────────────────────────
function StepHeader({ eyebrow, title, sub }: { eyebrow: string; title: string; sub: string }) {
  return (
    <div style={{ marginBottom: 28 }}>
      <div style={mono}>{eyebrow}</div>
      <h1 style={{
        fontFamily: SERIF, fontWeight: 600, fontSize: 38, letterSpacing: "-0.02em",
        color: "var(--ink)", margin: "12px 0 8px", lineHeight: 1.1,
      }}>{title}</h1>
      <p style={{ fontSize: 15, color: "var(--body)", lineHeight: 1.6, margin: 0 }}>{sub}</p>
    </div>
  )
}

// ─── Nav row ─────────────────────────────────────────────────────
function NavRow({ onBack, onNext, nextLabel, disabled }: {
  onBack?: () => void; onNext: () => void; nextLabel: string; disabled?: boolean
}) {
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 36, gap: 14 }}>
      {onBack ? (
        <button type="button" onClick={onBack} style={{
          background: "none", border: "none", fontFamily: SANS, fontSize: 14,
          color: "var(--muted-text)", cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 8,
          padding: 0,
        }}>
          <Icon d="M19 12H5M12 19l-7-7 7-7" size={16}/> Back
        </button>
      ) : <span/>}
      <button type="button" onClick={onNext} disabled={disabled} style={{
        padding: "14px 32px", border: "none", borderRadius: 10,
        background: disabled ? "var(--line-2)" : "var(--plum-2)",
        color: disabled ? "var(--faint)" : "var(--cream)",
        fontFamily: SANS, fontSize: 15, fontWeight: 500,
        cursor: disabled ? "not-allowed" : "pointer",
        transition: "opacity .12s ease",
      }}>
        {nextLabel}
      </button>
    </div>
  )
}

// ─── Size options ────────────────────────────────────────────────
const SIZE_OPTIONS = [
  { value: "small"  as const, label: "Under 50", sub: "Small fellowship"    },
  { value: "medium" as const, label: "50–100",   sub: "Mid-size ministry"   },
  { value: "large"  as const, label: "100+",     sub: "Large campus group"  },
]

// ─── Page ────────────────────────────────────────────────────────
export default function OnboardingPage() {
  const [step, setStep] = useState(0) // 0-indexed

  // Step 1
  const [name, setName]             = useState("")
  const [universities, setUniversities] = useState<string[]>([])
  const [uniInput, setUniInput]     = useState("")
  const [location, setLocation]     = useState("")
  const [size, setSize]             = useState<"small" | "medium" | "large">("small")
  const [step1Touched, setStep1Touched] = useState(false)

  // Step 2
  const [isPublic, setIsPublic]         = useState(false)

  // Step 3 — workspaces (preset ids). Default: none selected.
  const [selectedWorkspaces, setSelectedWorkspaces] = useState<string[]>([])
  function toggleWorkspace(id: string) {
    setSelectedWorkspaces(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id])
  }

  // Submit
  const [submitting, setSubmitting] = useState(false)
  const [error, setError]           = useState<string | null>(null)

  const step1Valid = name.trim() !== "" && universities.length > 0 && location.trim() !== ""

  function addUniversity() {
    const val = uniInput.trim()
    if (!val || universities.includes(val)) { setUniInput(""); return }
    setUniversities(prev => [...prev, val])
    setUniInput("")
  }

  function next() {
    if (step === 0) {
      if (!step1Valid) { setStep1Touched(true); return }
    }
    setStep(s => Math.min(s + 1, 3))
  }

  function back() {
    setStep(s => Math.max(s - 1, 0))
  }

  async function handleSubmit() {
    setSubmitting(true)
    setError(null)
    const { error: err } = await submitMinistryApplication({
      name,
      university: universities[0] ?? "",
      universities,
      location, size,
      workspaces: selectedWorkspaces,
      isPublic,
    })
    if (err) { setError(err); setSubmitting(false); return }
    window.location.assign("/pending")
  }

  const sizeLabel = SIZE_OPTIONS.find(o => o.value === size)?.label ?? ""
  const discoveryLabel = isPublic ? "Public" : "Private"

  return (
    <div style={{ display: "flex", height: "100svh", overflow: "hidden", fontFamily: SANS, color: "var(--ink)" }}>

      {/* ── Left cream rail ── */}
      <div style={{
        width: 320, flexShrink: 0,
        background: "var(--body-bg)", borderRight: "1px solid var(--line)",
        display: "flex", flexDirection: "column",
      }}>
        {/* Brand */}
        <div style={{ padding: "30px 28px 24px" }}>
          <Link href="/" aria-label="Central — home" className="transition-opacity hover:opacity-70" style={{ display: "inline-flex", alignItems: "center", gap: 11, textDecoration: "none", color: "inherit" }}>
            <span style={{
              width: 34, height: 34, borderRadius: 9, display: "grid", placeItems: "center",
              background: "var(--plum-2)", flexShrink: 0,
            }}>
              <RingCrossLogo size={20} color="var(--ivory)"/>
            </span>
            <span style={{ fontFamily: SERIF, fontSize: 21, letterSpacing: "-0.01em", color: "var(--ink)" }}>Central</span>
          </Link>
        </div>

        {/* Register eyebrow */}
        <div style={{ ...mono, padding: "0 28px", margin: "0 0 16px" }}>Register your ministry</div>

        {/* Step list */}
        <div style={{ padding: "0 24px" }}>
          {STEPS.map((s, i) => (
            <RailStep
              key={s.label} i={i} label={s.label} sub={s.sub}
              status={i < step ? "done" : i === step ? "active" : "pending"}
            />
          ))}
        </div>

        {/* Verse callout (pushed to bottom) */}
        <div style={{
          margin: "auto 18px 18px",
          background: "var(--cream-3)", border: "1px solid var(--line)", borderRadius: 14, padding: 18,
        }}>
          <div style={{ ...mono, color: "var(--muted-text)", marginBottom: 10 }}>Verse · Psalm 127:1</div>
          <div style={{
            fontFamily: SERIF, fontStyle: "italic", fontSize: 16, lineHeight: 1.45, color: "var(--plum-2)",
          }}>
            Unless the Lord builds the house, those who build it labor in vain.
          </div>
        </div>
      </div>

      {/* ── Content area ── */}
      <div style={{ flex: 1, background: "var(--cream)", overflowY: "auto" }}>
        <div style={{ maxWidth: 560, margin: "0 auto", padding: "56px 40px 80px" }}>

          {/* Persistent exit — back to landing (shown on every step, both layouts) */}
          <Link href="/" className="transition-opacity hover:opacity-70" style={{
            display: "inline-flex", alignItems: "center", gap: 8,
            color: "var(--body)", textDecoration: "none", fontSize: 14, marginBottom: 28,
          }}>
            <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="M19 12H5M12 19l-7-7 7-7"/>
            </svg>
            Back to home
          </Link>

          {/* ── Step 1 — Basic info ── */}
          {step === 0 && (
            <>
              <StepHeader
                eyebrow="Step 1 of 4 · Basic info"
                title="Set up your ministry workspace."
                sub="It only takes a few minutes — we'll get your team ready to go."
              />

              <div style={{ display: "flex", flexDirection: "column", gap: 26 }}>
                {/* Ministry name */}
                <Field
                  label="Ministry name"
                  value={name} onChange={setName}
                  placeholder="e.g. Central Student Fellowship"
                  error={step1Touched && !name.trim()}
                />

                {/* Universities */}
                <div>
                  <label style={{ ...mono, display: "block", marginBottom: 9 }}>Universities</label>
                  <div style={{ display: "flex", gap: 10 }}>
                    <input
                      value={uniInput}
                      onChange={e => setUniInput(e.target.value)}
                      onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); addUniversity() } }}
                      placeholder="e.g. University of Pittsburgh"
                      style={{
                        flex: 1, padding: "13px 15px",
                        border: `1px solid ${step1Touched && universities.length === 0 ? "var(--danger)" : "var(--line-2)"}`,
                        borderRadius: 10, background: "var(--cream)",
                        fontFamily: SANS, fontSize: 15, color: "var(--ink)", outline: "none",
                        boxSizing: "border-box",
                      }}
                    />
                    <button type="button" onClick={addUniversity} style={{
                      padding: "0 20px", border: "1px solid var(--line-2)", borderRadius: 10,
                      background: "var(--ivory)", color: "var(--plum-2)",
                      fontFamily: SANS, fontSize: 14, fontWeight: 500, cursor: "pointer",
                      whiteSpace: "nowrap",
                    }}>Add</button>
                  </div>
                  {universities.length > 0 && (
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 12 }}>
                      {universities.map(u => (
                        <span key={u} style={{
                          display: "inline-flex", alignItems: "center", gap: 8,
                          padding: "7px 8px 7px 14px", borderRadius: 999,
                          background: "var(--cream-3)", border: "1px solid var(--line)",
                          fontSize: 13, color: "var(--ink)",
                        }}>
                          {u}
                          <span
                            onClick={() => setUniversities(prev => prev.filter(x => x !== u))}
                            style={{
                              width: 18, height: 18, borderRadius: "50%",
                              display: "grid", placeItems: "center",
                              cursor: "pointer", color: "var(--muted-text)",
                            }}
                          >×</span>
                        </span>
                      ))}
                    </div>
                  )}
                  {step1Touched && universities.length === 0 && (
                    <p style={{ fontSize: 12, color: "var(--danger)", marginTop: 5, marginBottom: 0 }}>Add at least one university.</p>
                  )}
                </div>

                {/* Location */}
                <Field
                  label="Location"
                  value={location} onChange={setLocation}
                  placeholder="e.g. Pittsburgh, PA"
                  error={step1Touched && !location.trim()}
                />

                {/* Size */}
                <div>
                  <div style={{ ...mono, marginBottom: 9 }}>Approximate size</div>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10 }}>
                    {SIZE_OPTIONS.map(opt => (
                      <button key={opt.value} type="button" onClick={() => setSize(opt.value)} style={{
                        border: `1px solid ${size === opt.value ? "var(--plum-2)" : "var(--line-2)"}`,
                        borderRadius: 10, background: size === opt.value ? "var(--plum-2)" : "var(--cream)",
                        padding: 18, cursor: "pointer", textAlign: "left",
                        transition: "all .12s ease",
                      }}>
                        <div style={{
                          fontFamily: SERIF, fontSize: 24, color: size === opt.value ? "var(--cream)" : "var(--ink)",
                        }}>{opt.label}</div>
                        <div style={{ fontSize: 12.5, marginTop: 5, color: size === opt.value ? "rgba(253,252,248,0.72)" : "var(--body)" }}>{opt.sub}</div>
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              <NavRow nextLabel="Continue" onNext={next}/>
            </>
          )}

          {/* ── Step 2 — Structure ── */}
          {step === 1 && (
            <>
              <StepHeader
                eyebrow="Step 2 of 4 · Structure"
                title="Visibility."
                sub="Decide whether your ministry is listed publicly or joinable only by invite code. You can change this anytime in settings."
              />

              <div>
                <div style={mono}>Discovery</div>
                <ToggleRow
                  title="List in the public directory"
                  desc="On: students find your ministry on the Ministries page and join instantly. Off: your ministry stays private and only people with your invite code can enter."
                  on={isPublic} onClick={() => setIsPublic(v => !v)}
                />
                <div style={{ fontSize: 12.5, color: "var(--muted-text)", marginTop: 12, lineHeight: 1.5 }}>
                  You&apos;ll get your invite codes to share once your ministry is approved.
                </div>
              </div>

              <NavRow onBack={back} onNext={next} nextLabel="Continue"/>
            </>
          )}

          {/* ── Step 3 — Teams ── */}
          {step === 2 && (
            <>
              <StepHeader
                eyebrow="Step 3 of 4 · Workspaces"
                title="Choose your workspaces."
                sub="Select the workspaces your ministry needs. They'll be ready and empty when you're approved — you can assign a leader and add more anytime."
              />

              <div style={mono}>Available workspaces</div>
              <div style={{ marginTop: 12 }}>
                {WORKSPACE_PRESETS.map(p => (
                  <WorkspacePickCard
                    key={p.id}
                    iconKey={p.iconKey}
                    name={p.name}
                    desc={p.description}
                    comingSoon={p.comingSoon}
                    selected={selectedWorkspaces.includes(p.id)}
                    onToggle={() => toggleWorkspace(p.id)}
                  />
                ))}
              </div>

              <div style={{ fontSize: 13, color: "var(--muted-text)", marginTop: 4, marginBottom: 4, lineHeight: 1.5 }}>
                {selectedWorkspaces.length === 0
                  ? "No workspaces selected — that's fine. You can add your first one once your ministry is live."
                  : `${selectedWorkspaces.length} workspace${selectedWorkspaces.length === 1 ? "" : "s"} selected.`}
              </div>

              <NavRow onBack={back} onNext={next} nextLabel="Continue"/>
            </>
          )}

          {/* ── Step 4 — Review ── */}
          {step === 3 && (
            <>
              <StepHeader
                eyebrow="Step 4 of 4 · Review"
                title="Review & submit."
                sub="Confirm the details below. You can refine everything once your workspace is live."
              />

              {error && (
                <div style={{
                  borderRadius: 10, background: "color-mix(in srgb, var(--danger) 8%, transparent)", border: "1px solid color-mix(in srgb, var(--danger) 18%, transparent)",
                  padding: "12px 16px", fontSize: 13, color: "var(--danger)", fontWeight: 500, marginBottom: 16,
                }}>{error}</div>
              )}

              {/* Review card */}
              <div style={{
                border: "1px solid var(--line)", borderRadius: 12, background: "var(--cream)",
                padding: "6px 20px", marginTop: 14,
              }}>
                <ReviewRow label="Ministry"  value={name || "—"}/>
                <ReviewRow label="University" value={universities.join(", ") || "—"}/>
                <ReviewRow label="Location"  value={location || "—"}/>
                <ReviewRow label="Size"       value={sizeLabel}/>
                <ReviewRow label="Discovery"  value={discoveryLabel}/>
                <ReviewRow label="Workspaces" value={selectedWorkspaces.length > 0 ? selectedWorkspaces.map(id => WORKSPACE_PRESETS.find(p => p.id === id)?.name ?? id).join(", ") : "None"} last/>
              </div>

              {/* Approval notice */}
              <div style={{
                display: "flex", alignItems: "center", gap: 10,
                marginTop: 22, fontSize: 13.5, color: "var(--body)",
                background: "var(--cream-3)", border: "1px solid var(--line)", borderRadius: 10, padding: "14px 16px",
              }}>
                <svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="var(--success)" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                  <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><path d="M22 4 12 14.01l-3-3"/>
                </svg>
                New ministries are approved within 24–48 hours. Free during beta.
              </div>

              <NavRow
                onBack={back}
                onNext={handleSubmit}
                nextLabel={submitting ? "Submitting…" : "Submit for review"}
                disabled={submitting}
              />
            </>
          )}

        </div>
      </div>
    </div>
  )
}
