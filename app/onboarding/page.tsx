"use client"

import { useState } from "react"
import { submitMinistryApplication } from "@/app/actions/ministry"

// ─── design tokens ──────────────────────────────────────────────
const SANS = "var(--font-inter), system-ui, sans-serif"
const SERIF = "var(--font-instrument-serif)"

const mono: React.CSSProperties = {
  fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
  fontSize: 11, letterSpacing: "0.13em", color: "#8A8497", textTransform: "uppercase",
}
const serif: React.CSSProperties = {
  fontFamily: SERIF, fontWeight: 400, color: "#13101A", margin: 0,
}

// ─── icon helper ─────────────────────────────────────────────────
function Icon({ d, size = 16, stroke = 1.5 }: { d: string; size?: number; stroke?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth={stroke} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d={d}/>
    </svg>
  )
}

// ─── wordmark ────────────────────────────────────────────────────
function Wordmark({ tone = "ink" }: { tone?: "ink" | "plum" }) {
  const isInk = tone === "ink"
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
      <span style={{
        width: 32, height: 32, borderRadius: 8,
        background: isInk ? "#3E1540" : "rgba(251,248,242,0.10)",
        color: "#FBF8F2", display: "grid", placeItems: "center",
        fontFamily: SERIF, fontSize: 15, flexShrink: 0,
      }}>C</span>
      <span style={{ fontFamily: SERIF, fontSize: 22, letterSpacing: "-0.01em", color: isInk ? "#13101A" : "#FBF8F2" }}>
        Central
      </span>
    </div>
  )
}

// ─── stepper (cream circles on plum) ─────────────────────────────
const STEP_LABELS = ["Basic info", "Structure", "Teams", "Review"]

function Stepper({ step }: { step: number }) {
  return (
    <div style={{ display: "flex", alignItems: "flex-start" }}>
      {STEP_LABELS.map((label, i) => {
        const done = i < step, current = i === step
        return (
          <div key={label} style={{ display: "contents" }}>
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 10, minWidth: 72 }}>
              <span style={{
                width: 30, height: 30, borderRadius: 999, display: "grid", placeItems: "center",
                fontFamily: SANS, fontSize: 13, fontWeight: 600,
                background: (done || current) ? "#FBF8F2" : "rgba(251,248,242,0.08)",
                color: done ? "#3E1540" : current ? "#2D0F2E" : "rgba(251,248,242,0.5)",
                border: (done || current) ? "none" : "1px solid rgba(251,248,242,0.25)",
              }}>
                {done ? <Icon d="M5 12l5 5L20 7" size={14} stroke={2.4}/> : i + 1}
              </span>
              <span style={{
                fontFamily: SANS, fontSize: 12, textAlign: "center",
                color: current ? "#FBF8F2" : "rgba(251,248,242,0.55)",
                fontWeight: current ? 600 : 400,
              }}>{label}</span>
            </div>
            {i < STEP_LABELS.length - 1 && (
              <span style={{ flex: 1, height: 1, background: "rgba(251,248,242,0.25)", marginTop: 15 }}/>
            )}
          </div>
        )
      })}
    </div>
  )
}

// ─── checkbox ────────────────────────────────────────────────────
function CheckBox({ on }: { on: boolean }) {
  return (
    <span style={{
      width: 20, height: 20, borderRadius: 6, flexShrink: 0,
      border: `1.5px solid ${on ? "#3E1540" : "#C4C0B0"}`,
      background: on ? "#3E1540" : "transparent",
      display: "grid", placeItems: "center", color: "#FBF8F2",
    }}>
      {on && <Icon d="M5 12l5 5L20 7" size={12} stroke={2.4}/>}
    </span>
  )
}

// ─── field ───────────────────────────────────────────────────────
function Field({ label, value, onChange, placeholder, autoFocus, error }: {
  label: string; value: string; onChange: (v: string) => void
  placeholder?: string; autoFocus?: boolean; error?: boolean
}) {
  return (
    <label style={{ display: "block" }}>
      <div style={{ ...mono, marginBottom: 8 }}>{label}</div>
      <div style={{
        display: "flex", alignItems: "center",
        background: "#FBF8F2",
        border: `1px solid ${error ? "#E53E3E" : "#E2DDCF"}`,
        borderRadius: 10, padding: "0 14px",
      }}>
        <input
          value={value} onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder} autoFocus={autoFocus}
          style={{
            flex: 1, border: "none", outline: "none", background: "transparent",
            padding: "13px 0", fontFamily: SANS, fontSize: 15, color: "#13101A",
          }}
        />
      </div>
    </label>
  )
}

// ─── select tile ─────────────────────────────────────────────────
function SelectTile({ title, sub, on, onClick, big }: {
  title: string; sub?: string; on: boolean; onClick: () => void; big?: boolean
}) {
  return (
    <button type="button" onClick={onClick} style={{
      flex: 1, textAlign: "left", padding: "16px 18px", borderRadius: 12,
      border: `1px solid ${on ? "#2D0F2E" : "#E2DDCF"}`,
      background: on ? "#2D0F2E" : "#FBF8F2",
      cursor: "pointer", transition: "all .12s ease",
    }}>
      <div style={{
        fontFamily: SERIF, fontWeight: 400,
        fontSize: big ? 26 : 20, letterSpacing: -0.3, lineHeight: 1.1,
        color: on ? "#FBF8F2" : "#13101A",
      }}>{title}</div>
      {sub && (
        <div style={{ fontSize: 13, marginTop: 4, color: on ? "rgba(251,248,242,0.72)" : "#8A8497" }}>{sub}</div>
      )}
    </button>
  )
}

// ─── struct row ──────────────────────────────────────────────────
function StructRow({ title, body, on, soon, onClick }: {
  title: string; body: string; on?: boolean; soon?: boolean; onClick?: () => void
}) {
  return (
    <button type="button" onClick={soon ? undefined : onClick} disabled={soon} style={{
      width: "100%", textAlign: "left", display: "flex", alignItems: "center", gap: 16,
      padding: "18px 20px", borderRadius: 12,
      border: `1px solid ${on ? "#3E1540" : "#E2DDCF"}`,
      background: on ? "#F6F2E8" : "#FBF8F2",
      cursor: soon ? "default" : "pointer",
      opacity: soon ? 0.55 : 1,
      transition: "all .12s ease",
    }}>
      <CheckBox on={!!on}/>
      <span style={{ flex: 1 }}>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 10 }}>
          <span style={{ fontFamily: SERIF, fontSize: 20, letterSpacing: -0.2, color: "#13101A" }}>{title}</span>
          {soon && (
            <span style={{
              ...mono, fontSize: 10, background: "#F1ECDE",
              border: "1px solid #E2DDCF", borderRadius: 999, padding: "3px 8px",
            }}>Coming soon</span>
          )}
        </span>
        <span style={{ display: "block", fontSize: 13.5, color: "#8A8497", marginTop: 3 }}>{body}</span>
      </span>
    </button>
  )
}

// ─── team row ────────────────────────────────────────────────────
function TeamRow({ team, onRemove, onChangeName }: {
  team: Team; onRemove: () => void; onChangeName: (name: string) => void
}) {
  return (
    <div style={{
      display: "flex", alignItems: "center", gap: 14, padding: "12px 14px",
      borderRadius: 12, border: "1px solid #E2DDCF", background: "#FBF8F2",
    }}>
      <span style={{
        width: 38, height: 38, borderRadius: 10, background: "#F1ECDE", color: "#3E1540",
        display: "grid", placeItems: "center", flexShrink: 0,
        fontFamily: SERIF, fontSize: 18,
      }}>
        {team.name.charAt(0) || "T"}
      </span>
      <input
        value={team.name}
        onChange={(e) => onChangeName(e.target.value)}
        style={{
          flex: 1, border: "none", outline: "none", background: "transparent",
          fontFamily: SANS, fontSize: 15, fontWeight: 500, color: "#13101A",
        }}
      />
      <button type="button" onClick={onRemove} aria-label="Remove team" style={{
        width: 30, height: 30, borderRadius: 8, border: "1px solid #E2DDCF", background: "transparent",
        color: "#8A8497", cursor: "pointer", display: "grid", placeItems: "center", flexShrink: 0,
      }}>
        <Icon d="M18 6L6 18M6 6l12 12" size={14}/>
      </button>
    </div>
  )
}

// ─── toggle ──────────────────────────────────────────────────────
function Toggle({ on, onClick }: { on: boolean; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} style={{
      width: 44, height: 26, borderRadius: 999, border: "none", padding: 0, cursor: "pointer",
      background: on ? "#3E1540" : "#D6D0C0", position: "relative", flexShrink: 0,
      transition: "background .15s ease",
    }}>
      <span style={{
        position: "absolute", width: 20, height: 20, borderRadius: 999, background: "#FBF8F2",
        top: 3, left: on ? 21 : 3, transition: "left .15s ease",
      }}/>
    </button>
  )
}

// ─── primary button ──────────────────────────────────────────────
function Primary({ children, onClick, disabled }: {
  children: React.ReactNode; onClick?: () => void; disabled?: boolean
}) {
  return (
    <button type="button" onClick={disabled ? undefined : onClick} disabled={disabled} style={{
      width: "100%", padding: "14px 22px", borderRadius: 12, border: "none",
      background: disabled ? "#E2DDCF" : "#2D0F2E",
      color: disabled ? "#A09A8C" : "#FBF8F2",
      fontSize: 15, fontWeight: 500, fontFamily: SANS,
      cursor: disabled ? "not-allowed" : "pointer",
      transition: "background .15s ease",
      marginTop: 6,
    }}>{children}</button>
  )
}

// ─── back link ───────────────────────────────────────────────────
function BackLink({ onClick }: { onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} style={{
      background: "transparent", border: "none", cursor: "pointer", padding: 0,
      display: "inline-flex", alignItems: "center", gap: 8,
      fontFamily: SANS, fontSize: 14, color: "#8A8497",
    }}>
      <Icon d="M19 12H5M12 19l-7-7 7-7" size={15}/> Back
    </button>
  )
}

// ─── step head ───────────────────────────────────────────────────
function StepHead({ eyebrow, title, sub }: { eyebrow: string; title: string; sub: string }) {
  return (
    <div style={{ marginBottom: 28 }}>
      <div style={mono}>{eyebrow}</div>
      <h2 style={{ ...serif, fontSize: 34, lineHeight: 1.1, letterSpacing: "-0.02em", marginTop: 4 }}>{title}</h2>
      <p style={{ fontSize: 15, color: "#5A5466", marginTop: 8, marginBottom: 0 }}>{sub}</p>
    </div>
  )
}

// ─── review card ────────────────────────────────────────────────
function ReviewCard({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ padding: 22, borderRadius: 14, border: "1px solid #E8E2D2", background: "#FBF8F2" }}>
      {children}
    </div>
  )
}

// ─── soft pill (review teams) ────────────────────────────────────
function SoftPill({ name }: { name: string }) {
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", gap: 8, padding: "6px 14px 6px 8px",
      borderRadius: 999, background: "#F1ECDE", border: "1px solid #E8E2D2", color: "#2D0F2E",
      fontSize: 13, fontWeight: 500,
    }}>
      <span style={{
        width: 24, height: 24, borderRadius: 7, background: "#FBF8F2", color: "#3E1540",
        display: "grid", placeItems: "center",
        fontFamily: SERIF, fontSize: 14,
      }}>
        {name.charAt(0) || "T"}
      </span>
      {name}
    </span>
  )
}

// ─── data ────────────────────────────────────────────────────────
const SIZE_OPTIONS = [
  { value: "small" as const, label: "Under 50", sub: "Small fellowship" },
  { value: "medium" as const, label: "50–100", sub: "Mid-size ministry" },
  { value: "large" as const, label: "100+", sub: "Large campus group" },
]

const STRUCTURE_QUESTIONS = [
  { id: "worship",    label: "Worship / Music",   desc: "Worship leading and music ministry",       soon: true  },
  { id: "media",      label: "Media & Tech",       desc: "Sound, projection, and live streaming",    soon: true  },
  { id: "smallGroups",label: "Small Groups",       desc: "Bible study groups or cells",              soon: false },
  { id: "hospitality",label: "Hospitality",        desc: "Welcoming guests and outreach",            soon: false },
  { id: "leadership", label: "Leadership Team",    desc: "Core leadership board and oversight",      soon: false },
]

const TEAM_PRESETS: Record<string, { name: string; icon: string }> = {
  worship:     { name: "Worship",        icon: "🎵" },
  media:       { name: "Media & Tech",   icon: "🎬" },
  smallGroups: { name: "Small Groups",   icon: "👥" },
  hospitality: { name: "Hospitality",    icon: "🤝" },
  leadership:  { name: "Leadership",     icon: "✝️" },
}

function mapLandingSize(s: string): "small" | "medium" | "large" {
  if (s === "100+") return "large"
  if (s === "50–100") return "medium"
  return "small"
}

function readPendingMinistry(): { name: string; university: string; size: "small" | "medium" | "large" } {
  if (typeof window === "undefined") return { name: "", university: "", size: "small" }
  try {
    const raw = sessionStorage.getItem("pending_ministry")
    if (!raw) return { name: "", university: "", size: "small" }
    const saved = JSON.parse(raw) as { name?: string; university?: string; size?: string }
    return {
      name: saved.name ?? "",
      university: saved.university ?? "",
      size: saved.size ? mapLandingSize(saved.size) : "small",
    }
  } catch {
    return { name: "", university: "", size: "small" }
  }
}

interface Team {
  id: string
  name: string
  icon: string
}

// ─── page ────────────────────────────────────────────────────────
export default function OnboardingPage() {
  const pendingMinistry = useState(readPendingMinistry)[0]
  const [step, setStep] = useState<1 | 2 | 3 | 4>(1)

  // Step 1
  const [name, setName] = useState(pendingMinistry.name)
  const [university, setUniversity] = useState(pendingMinistry.university)
  const [location, setLocation] = useState("")
  const [size, setSize] = useState<"small" | "medium" | "large">(pendingMinistry.size)
  const [step1Touched, setStep1Touched] = useState(false)

  // Step 2
  const [structure, setStructure] = useState<Record<string, boolean>>({
    worship: false, media: false, smallGroups: false, hospitality: false, leadership: false,
  })

  // Step 3
  const [teams, setTeams] = useState<Team[]>([])

  // Step 4
  const [isPublic, setIsPublic] = useState(false)

  // Submit
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function toggleStructure(id: string) {
    setStructure((prev) => ({ ...prev, [id]: !prev[id] }))
  }

  function buildTeamsFromStructure(): Team[] {
    const result: Team[] = [{ id: "prayer", name: "Prayer", icon: "🙏" }]
    for (const [key, yes] of Object.entries(structure)) {
      if (yes && TEAM_PRESETS[key]) {
        result.push({ id: key, name: TEAM_PRESETS[key].name, icon: TEAM_PRESETS[key].icon })
      }
    }
    return result
  }

  function addTeam() {
    setTeams((prev) => [...prev, { id: `c-${Date.now()}`, name: "New team", icon: "🙏" }])
  }

  function removeTeam(id: string) {
    setTeams((prev) => prev.filter((t) => t.id !== id))
  }

  function updateTeamName(id: string, newName: string) {
    setTeams((prev) => prev.map((t) => t.id === id ? { ...t, name: newName } : t))
  }

  function next() {
    if (step === 1) {
      if (!step1Valid) { setStep1Touched(true); return }
      setStep(2)
    } else if (step === 2) {
      setTeams(buildTeamsFromStructure())
      setStep(3)
    } else if (step === 3) {
      setStep(4)
    }
  }

  function back() {
    setStep((prev) => (prev - 1) as 1 | 2 | 3 | 4)
  }

  async function handleSubmit() {
    setSubmitting(true)
    setError(null)
    const { error: err } = await submitMinistryApplication({
      name, university, location, size,
      teams: teams.map((t) => ({ name: t.name, icon: t.icon })),
      isPublic,
    })
    if (err) {
      setError(err)
      setSubmitting(false)
      return
    }
    sessionStorage.removeItem("pending_ministry")
    window.location.assign("/pending")
  }

  const step1Valid = name.trim() && university.trim() && location.trim()
  const stepIndex = step - 1

  return (
    <div style={{ minHeight: "100svh", background: "#FBF8F2", fontFamily: SANS }}>

      {/* ── Plum hero band ── */}
      <div style={{
        position: "relative", overflow: "hidden", color: "#FBF8F2",
        background: "radial-gradient(120% 130% at 0% 0%, #5A2860 0%, #3E1540 55%, #2A0E2C 100%)",
        padding: "40px 0 44px",
      }}>
        {/* dot texture */}
        <div aria-hidden style={{
          position: "absolute", inset: 0, opacity: 0.16, pointerEvents: "none",
          background: "radial-gradient(rgba(251,248,242,0.6) 1px, transparent 1.4px) 0 0 / 14px 14px",
        }}/>

        <div style={{ position: "relative", maxWidth: 760, margin: "0 auto", padding: "0 24px" }}>
          <Wordmark tone="plum"/>

          <div style={{ ...mono, color: "rgba(251,248,242,0.55)", marginTop: 28 }}>
            Register your ministry
          </div>
          <h1 style={{
            fontFamily: SERIF, fontWeight: 400, color: "#FBF8F2",
            fontSize: 52, letterSpacing: "-0.03em", lineHeight: 1.04, margin: "10px 0 0",
          }}>
            Set up your ministry workspace.
          </h1>
          <p style={{ fontSize: 15, color: "rgba(251,248,242,0.78)", marginTop: 12, marginBottom: 0 }}>
            It only takes a few minutes. We&apos;ll get your team ready to go.
          </p>
          <div style={{
            ...mono, color: "rgba(251,248,242,0.45)", marginTop: 8,
            letterSpacing: "0.06em", textTransform: "none" as const,
          }}>
            Approved within 24–48 hours · Free during beta
          </div>
          <div style={{ marginTop: 32 }}>
            <Stepper step={stepIndex}/>
          </div>
        </div>
      </div>

      {/* ── Form body ── */}
      <div style={{ maxWidth: 640, margin: "0 auto", padding: "48px 24px 72px" }}>

        {/* Step 1 — Basic info */}
        {step === 1 && (
          <div>
            <StepHead
              eyebrow="Step 1 · Basic info"
              title="Basic information"
              sub="Tell us the basics about your ministry."
            />
            <div style={{ display: "flex", flexDirection: "column", gap: 22 }}>
              <Field
                label="Ministry name"
                value={name} onChange={setName}
                placeholder="e.g. Central Student Fellowship"
                autoFocus
                error={step1Touched && !name.trim()}
              />
              <Field
                label="University"
                value={university} onChange={setUniversity}
                placeholder="e.g. University of Pittsburgh"
                error={step1Touched && !university.trim()}
              />
              <Field
                label="Location"
                value={location} onChange={setLocation}
                placeholder="e.g. Pittsburgh, PA"
                error={step1Touched && !location.trim()}
              />

              <div>
                <div style={{ ...mono, marginBottom: 10 }}>Approximate size</div>
                <div style={{ display: "flex", gap: 10 }}>
                  {SIZE_OPTIONS.map((opt) => (
                    <SelectTile
                      key={opt.value} big
                      title={opt.label} sub={opt.sub}
                      on={size === opt.value}
                      onClick={() => setSize(opt.value)}
                    />
                  ))}
                </div>
              </div>

              <Primary onClick={next}>Continue</Primary>
            </div>
          </div>
        )}

        {/* Step 2 — Structure */}
        {step === 2 && (
          <div>
            <StepHead
              eyebrow="Step 2 · Structure"
              title="Ministry structure"
              sub="Select everything that applies to your ministry."
            />
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              {STRUCTURE_QUESTIONS.map((q) => (
                <StructRow
                  key={q.id}
                  title={q.label} body={q.desc}
                  on={structure[q.id]}
                  soon={q.soon}
                  onClick={() => toggleStructure(q.id)}
                />
              ))}
              <Primary onClick={next}>Continue</Primary>
              <div style={{ textAlign: "center" }}><BackLink onClick={back}/></div>
            </div>
          </div>
        )}

        {/* Step 3 — Teams */}
        {step === 3 && (
          <div>
            <StepHead
              eyebrow="Step 3 · Teams"
              title="Your teams"
              sub={`We'll create ${teams.length} ${teams.length === 1 ? "team" : "teams"} in your workspace.`}
            />
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              {teams.map((t) => (
                <TeamRow
                  key={t.id}
                  team={t}
                  onRemove={() => removeTeam(t.id)}
                  onChangeName={(n) => updateTeamName(t.id, n)}
                />
              ))}

              <button type="button" onClick={addTeam} style={{
                padding: "14px 16px", borderRadius: 12, border: "1px dashed #C4C0B0",
                background: "transparent", color: "#5A5466", fontSize: 14, fontFamily: SANS,
                cursor: "pointer", display: "flex", alignItems: "center",
                justifyContent: "center", gap: 8, width: "100%",
              }}>
                <Icon d="M12 5v14M5 12h14" size={16}/> Add team
              </button>

              <Primary onClick={next}>Continue</Primary>
              <div style={{ textAlign: "center" }}><BackLink onClick={back}/></div>
            </div>
          </div>
        )}

        {/* Step 4 — Review & Submit */}
        {step === 4 && (
          <div>
            <StepHead
              eyebrow="Step 4 · Review"
              title="Review & submit"
              sub="Review your details before submitting."
            />
            <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              {error && (
                <div style={{
                  borderRadius: 10, background: "rgba(220,38,38,0.08)",
                  padding: "12px 16px", fontSize: 13, color: "#B91C1C", fontWeight: 500,
                }}>
                  {error}
                </div>
              )}

              <ReviewCard>
                <div style={mono}>Ministry</div>
                <div style={{
                  fontFamily: SERIF, fontSize: 26, letterSpacing: -0.3,
                  color: "#13101A", marginTop: 8,
                }}>
                  {name}
                </div>
                <div style={{ fontSize: 14, color: "#5A5466", marginTop: 8, lineHeight: 1.7 }}>
                  {university}<br/>
                  {location}<br/>
                  {SIZE_OPTIONS.find((o) => o.value === size)?.label} members
                </div>
              </ReviewCard>

              {teams.length > 0 && (
                <ReviewCard>
                  <div style={mono}>Teams · {teams.length}</div>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 10, marginTop: 14 }}>
                    {teams.map((t) => (
                      <SoftPill key={t.id} name={t.name}/>
                    ))}
                  </div>
                </ReviewCard>
              )}

              <ReviewCard>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 18 }}>
                  <div>
                    <div style={{ fontSize: 15, fontWeight: 500, color: "#13101A" }}>List in public directory</div>
                    <div style={{ fontSize: 13, color: "#8A8497", marginTop: 3 }}>Anyone can find and request to join.</div>
                  </div>
                  <Toggle on={isPublic} onClick={() => setIsPublic((v) => !v)}/>
                </div>
              </ReviewCard>

              {/* Beta banner */}
              <div style={{
                display: "flex", alignItems: "center", gap: 14, padding: "16px 20px",
                borderRadius: 14, background: "#F6F2E8", border: "1px solid #E8E2D2",
              }}>
                <span style={{
                  width: 28, height: 28, borderRadius: 999,
                  background: "#2D0F2E", color: "#FBF8F2",
                  display: "grid", placeItems: "center", flexShrink: 0,
                }}>
                  <Icon d="M5 12l5 5L20 7" size={14} stroke={2.2}/>
                </span>
                <div>
                  <div style={{ fontSize: 14, fontWeight: 500, color: "#13101A" }}>
                    Free during beta · No credit card required
                  </div>
                  <div style={{ fontSize: 13, color: "#8A8497", marginTop: 2 }}>
                    Your application will be reviewed within 24–48 hours.
                  </div>
                </div>
              </div>

              <Primary onClick={handleSubmit} disabled={submitting}>
                {submitting ? "Submitting…" : "Submit application"}
              </Primary>
              <div style={{ textAlign: "center" }}><BackLink onClick={back}/></div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
