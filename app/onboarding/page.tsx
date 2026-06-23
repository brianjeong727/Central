"use client"

import { useState } from "react"
import { submitMinistryApplication } from "@/app/actions/ministry"
import { RingCrossLogo, PlanLineIcon } from "@/app/home/components/shared"

const SANS  = "var(--font-inter), system-ui, sans-serif"
const SERIF = "var(--font-instrument-serif)"

const mono: React.CSSProperties = {
  fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
  fontSize: 11, letterSpacing: "0.13em", color: "#8A8497", textTransform: "uppercase",
}

// ─── Rail stepper ────────────────────────────────────────────────
const STEPS = [
  { label: "Basic info",  sub: "Name, campus, size"  },
  { label: "Structure",   sub: "Visibility & access" },
  { label: "Teams",       sub: "Starting groups"     },
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
          border: status === "pending" ? "1px solid #E2DDCF" : "none",
          background: status === "active" ? "#2D0F2E" : status === "done" ? "#F1ECDE" : "#FDFCF8",
          color:      status === "active" ? "#FDFCF8"  : status === "done" ? "#3E1540" : "#8A8497",
        }}>
          {status === "done"
            ? <svg width={12} height={12} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M5 12l5 5L20 7"/></svg>
            : i + 1}
        </span>
        <span style={{ paddingTop: 4 }}>
          <span style={{
            display: "block", fontSize: 14, transition: "color .14s ease",
            color: status === "active" ? "#13101A" : "#8A8497",
            fontWeight: status === "active" ? 500 : 400,
          }}>{label}</span>
          <span style={{ display: "block", fontSize: 12, color: "#A09A8C", marginTop: 1 }}>{sub}</span>
        </span>
      </div>
      {i < STEPS.length - 1 && (
        <div style={{ width: 1, height: 14, background: "#E2DDCF", marginLeft: 16 }} />
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
      background: on ? "#3E1540" : "#D6D0C0", transition: "background .14s ease",
      marginTop: 1,
    }}>
      <span style={{
        position: "absolute", width: 18, height: 18, borderRadius: "50%", background: "#FDFCF8",
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
      border: "1px solid #E8E2D2", borderRadius: 12, background: "#FDFCF8", marginTop: 12,
    }}>
      <Toggle on={on} onClick={onClick}/>
      <div>
        <div style={{ fontSize: 14, fontWeight: 500, color: "#13101A" }}>{title}</div>
        <div style={{ fontSize: 13, color: "#8A8497", marginTop: 3, lineHeight: 1.5 }}>{desc}</div>
      </div>
    </div>
  )
}

// ─── Fixed beta teams ────────────────────────────────────────────
const BETA_TEAMS = [
  { iconKey: "book",  name: "Small Group Leaders",  desc: "Bible study & discipleship"  },
  { iconKey: "users", name: "Student Org Board",    desc: "Campus ministry leadership"  },
]

function BetaTeamRow({ iconKey, name, desc }: { iconKey: string; name: string; desc: string }) {
  return (
    <div style={{
      display: "flex", alignItems: "center", gap: 12, padding: "12px 14px",
      border: "1px solid #E8E2D2", borderRadius: 10, background: "#FDFCF8", marginBottom: 10,
    }}>
      <PlanLineIcon iconKey={iconKey} size={38} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 15, color: "#13101A" }}>{name}</div>
        <div style={{ fontSize: 12.5, color: "#8A8497", marginTop: 2 }}>{desc}</div>
      </div>
    </div>
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
          border: `1px solid ${error ? "#E53E3E" : "#E2DDCF"}`,
          borderRadius: 10, background: "#FDFCF8",
          fontFamily: monoFont ? "ui-monospace, SFMono-Regular, Menlo, monospace" : SANS,
          fontSize: 15, color: "#13101A", outline: "none",
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
      borderBottom: last ? "none" : "1px solid #EFE9DA",
    }}>
      <span style={{ ...mono }}>{label}</span>
      <span style={{ fontSize: 15, color: "#13101A", textAlign: "right" }}>{value}</span>
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
        color: "#13101A", margin: "12px 0 8px", lineHeight: 1.1,
      }}>{title}</h1>
      <p style={{ fontSize: 15, color: "#5A5466", lineHeight: 1.6, margin: 0 }}>{sub}</p>
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
          color: "#8A8497", cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 8,
          padding: 0,
        }}>
          <Icon d="M19 12H5M12 19l-7-7 7-7" size={16}/> Back
        </button>
      ) : <span/>}
      <button type="button" onClick={onNext} disabled={disabled} style={{
        padding: "14px 32px", border: "none", borderRadius: 10,
        background: disabled ? "#E2DDCF" : "#2D0F2E",
        color: disabled ? "#A09A8C" : "#FDFCF8",
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
  const [isPublic, setIsPublic]         = useState(true)
  const [allowInviteCode, setAllowInviteCode] = useState(true)
  const [requireApproval, setRequireApproval] = useState(false)

  // Step 3
  const [includeTeams, setIncludeTeams] = useState(true)

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
      teams: includeTeams ? BETA_TEAMS.map(t => ({ name: t.name, icon: t.iconKey })) : [],
      isPublic,
    })
    if (err) { setError(err); setSubmitting(false); return }
    window.location.assign("/pending")
  }

  const sizeLabel = SIZE_OPTIONS.find(o => o.value === size)?.label ?? ""
  const discoveryLabel = isPublic
    ? `Public${allowInviteCode ? " · invite code" : ""}`
    : "Private"

  return (
    <div style={{ display: "flex", height: "100svh", overflow: "hidden", fontFamily: SANS, color: "#13101A" }}>

      {/* ── Left cream rail ── */}
      <div style={{
        width: 320, flexShrink: 0,
        background: "#F4F1E8", borderRight: "1px solid #E8E2D2",
        display: "flex", flexDirection: "column",
      }}>
        {/* Brand */}
        <div style={{ padding: "30px 28px 24px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 11 }}>
            <span style={{
              width: 34, height: 34, borderRadius: 9, display: "grid", placeItems: "center",
              background: "#2D0F2E", flexShrink: 0,
            }}>
              <RingCrossLogo size={20} color="#F1ECDE"/>
            </span>
            <span style={{ fontFamily: SERIF, fontSize: 21, letterSpacing: "-0.01em", color: "#13101A" }}>Central</span>
          </div>
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
          background: "#F6F2E8", border: "1px solid #E8E2D2", borderRadius: 14, padding: 18,
        }}>
          <div style={{ ...mono, color: "#8A8497", marginBottom: 10 }}>Verse · Psalm 127:1</div>
          <div style={{
            fontFamily: SERIF, fontStyle: "italic", fontSize: 16, lineHeight: 1.45, color: "#2D0F2E",
          }}>
            Unless the Lord builds the house, those who build it labor in vain.
          </div>
        </div>
      </div>

      {/* ── Content area ── */}
      <div style={{ flex: 1, background: "#FDFCF8", overflowY: "auto" }}>
        <div style={{ maxWidth: 560, margin: "0 auto", padding: "56px 40px 80px" }}>

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
                        border: `1px solid ${step1Touched && universities.length === 0 ? "#E53E3E" : "#E2DDCF"}`,
                        borderRadius: 10, background: "#FDFCF8",
                        fontFamily: SANS, fontSize: 15, color: "#13101A", outline: "none",
                        boxSizing: "border-box",
                      }}
                    />
                    <button type="button" onClick={addUniversity} style={{
                      padding: "0 20px", border: "1px solid #E2DDCF", borderRadius: 10,
                      background: "#F1ECDE", color: "#2D0F2E",
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
                          background: "#F6F2E8", border: "1px solid #E8E2D2",
                          fontSize: 13, color: "#13101A",
                        }}>
                          {u}
                          <span
                            onClick={() => setUniversities(prev => prev.filter(x => x !== u))}
                            style={{
                              width: 18, height: 18, borderRadius: "50%",
                              display: "grid", placeItems: "center",
                              cursor: "pointer", color: "#8A8497",
                            }}
                          >×</span>
                        </span>
                      ))}
                    </div>
                  )}
                  {step1Touched && universities.length === 0 && (
                    <p style={{ fontSize: 12, color: "#E53E3E", marginTop: 5, marginBottom: 0 }}>Add at least one university.</p>
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
                        border: `1px solid ${size === opt.value ? "#2D0F2E" : "#E2DDCF"}`,
                        borderRadius: 10, background: size === opt.value ? "#2D0F2E" : "#FDFCF8",
                        padding: 18, cursor: "pointer", textAlign: "left",
                        transition: "all .12s ease",
                      }}>
                        <div style={{
                          fontFamily: SERIF, fontSize: 24, color: size === opt.value ? "#FDFCF8" : "#13101A",
                        }}>{opt.label}</div>
                        <div style={{ fontSize: 12.5, marginTop: 5, color: size === opt.value ? "rgba(253,252,248,0.72)" : "#5A5466" }}>{opt.sub}</div>
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
                title="Visibility & access."
                sub="Decide how new members find and enter your ministry. You can change this anytime in settings."
              />

              <div>
                <div style={mono}>Discovery</div>
                <ToggleRow
                  title="List in the public directory"
                  desc="Students can find your ministry by name or university on the Ministries page."
                  on={isPublic} onClick={() => setIsPublic(v => !v)}
                />
                <ToggleRow
                  title="Allow joining by invite code"
                  desc="Leaders share a code for direct entry without browsing."
                  on={allowInviteCode} onClick={() => setAllowInviteCode(v => !v)}
                />
                <ToggleRow
                  title="Require admin approval to join"
                  desc="New requests wait for a leader to approve before they're in."
                  on={requireApproval} onClick={() => setRequireApproval(v => !v)}
                />
              </div>

              <div style={{ marginTop: 26 }}>
                <Field
                  label="Member invite code"
                  value={name.trim().replace(/[^a-zA-Z0-9]/g, "").toUpperCase().slice(0, 5) || "CODE"}
                  readOnly
                  mono
                />
                <div style={{ fontSize: 12.5, color: "#8A8497", marginTop: 8 }}>
                  Auto-generated — edit it to something memorable for your campus.
                </div>
              </div>

              <NavRow onBack={back} onNext={next} nextLabel="Continue"/>
            </>
          )}

          {/* ── Step 3 — Teams ── */}
          {step === 2 && (
            <>
              <StepHeader
                eyebrow="Step 3 of 4 · Teams"
                title="Starter teams."
                sub="These are the teams available during beta. You can configure roles and members after your ministry is approved."
              />

              <div style={mono}>Available teams</div>
              <div style={{ marginTop: 12 }}>
                {BETA_TEAMS.map(t => (
                  <BetaTeamRow key={t.name} iconKey={t.iconKey} name={t.name} desc={t.desc} />
                ))}
              </div>

              {/* Beta notice */}
              <div style={{
                display: "flex", alignItems: "flex-start", gap: 10, marginTop: 4, marginBottom: 24,
                background: "#F6F2E8", border: "1px solid #E8E2D2", borderRadius: 10,
                padding: "13px 15px", fontSize: 13, color: "#5A5466", lineHeight: 1.5,
              }}>
                <svg width={15} height={15} viewBox="0 0 24 24" fill="none" stroke="#A09A8C" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden style={{ flexShrink: 0, marginTop: 1 }}>
                  <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
                </svg>
                In beta, Small Group Leaders and Student Org Board are the only supported teams. More team types are coming soon.
              </div>

              {/* Accept / skip choice */}
              <div style={mono}>Would you like to include these teams?</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 12 }}>
                {[
                  { value: true,  label: "Yes, add these teams",    sub: "Start with Small Group Leaders and Student Org Board." },
                  { value: false, label: "Skip for now",            sub: "You can add teams later from your ministry settings." },
                ].map(opt => (
                  <button
                    key={String(opt.value)}
                    type="button"
                    onClick={() => setIncludeTeams(opt.value)}
                    style={{
                      display: "flex", alignItems: "flex-start", gap: 14, padding: 16,
                      border: `1.5px solid ${includeTeams === opt.value ? "#3E1540" : "#E2DDCF"}`,
                      borderRadius: 12,
                      background: includeTeams === opt.value ? "#F4EFF8" : "#FDFCF8",
                      cursor: "pointer", textAlign: "left", fontFamily: SANS,
                      transition: "border-color .12s ease, background .12s ease",
                    }}
                  >
                    <span style={{
                      width: 20, height: 20, borderRadius: "50%", flexShrink: 0, marginTop: 1,
                      border: `2px solid ${includeTeams === opt.value ? "#3E1540" : "#C4C0B0"}`,
                      background: includeTeams === opt.value ? "#3E1540" : "transparent",
                      display: "grid", placeItems: "center",
                    }}>
                      {includeTeams === opt.value && (
                        <span style={{ width: 8, height: 8, borderRadius: "50%", background: "#FDFCF8" }}/>
                      )}
                    </span>
                    <div>
                      <div style={{ fontSize: 14, fontWeight: 500, color: "#13101A" }}>{opt.label}</div>
                      <div style={{ fontSize: 13, color: "#8A8497", marginTop: 3 }}>{opt.sub}</div>
                    </div>
                  </button>
                ))}
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
                  borderRadius: 10, background: "rgba(220,38,38,0.08)", border: "1px solid rgba(220,38,38,0.15)",
                  padding: "12px 16px", fontSize: 13, color: "#B91C1C", fontWeight: 500, marginBottom: 16,
                }}>{error}</div>
              )}

              {/* Review card */}
              <div style={{
                border: "1px solid #E8E2D2", borderRadius: 12, background: "#FDFCF8",
                padding: "6px 20px", marginTop: 14,
              }}>
                <ReviewRow label="Ministry"  value={name || "—"}/>
                <ReviewRow label="University" value={universities.join(", ") || "—"}/>
                <ReviewRow label="Location"  value={location || "—"}/>
                <ReviewRow label="Size"       value={sizeLabel}/>
                <ReviewRow label="Discovery"  value={discoveryLabel}/>
                <ReviewRow label="Teams"      value={includeTeams ? BETA_TEAMS.map(t => t.name).join(", ") : "None"} last/>
              </div>

              {/* Approval notice */}
              <div style={{
                display: "flex", alignItems: "center", gap: 10,
                marginTop: 22, fontSize: 13.5, color: "#5A5466",
                background: "#F6F2E8", border: "1px solid #E8E2D2", borderRadius: 10, padding: "14px 16px",
              }}>
                <svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="#7FA67F" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
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
