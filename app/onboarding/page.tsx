"use client"

import { useState } from "react"
import { Check, Plus, X } from "lucide-react"
import { submitMinistryApplication } from "@/app/actions/ministry"
import { RingCrossLogo } from "@/app/home/components/shared"

const STEPS = 4

const STRUCTURE_QUESTIONS = [
  { id: "worship", label: "Worship / Music", desc: "Worship leading and music ministry" },
  { id: "media", label: "Media & Tech", desc: "Sound, projection, and live streaming" },
  { id: "smallGroups", label: "Small Groups", desc: "Bible study groups or cells" },
  { id: "hospitality", label: "Hospitality", desc: "Welcoming guests and outreach" },
  { id: "leadership", label: "Leadership Team", desc: "Core leadership board and oversight" },
]

const TEAM_PRESETS: Record<string, { name: string; icon: string }> = {
  worship: { name: "Worship", icon: "🎵" },
  media: { name: "Media & Tech", icon: "🎬" },
  smallGroups: { name: "Small Groups", icon: "👥" },
  hospitality: { name: "Hospitality", icon: "🤝" },
  leadership: { name: "Leadership", icon: "✝️" },
}

const SIZE_OPTIONS = [
  { value: "small" as const, label: "Under 50", desc: "Small fellowship" },
  { value: "medium" as const, label: "50–100", desc: "Mid-size ministry" },
  { value: "large" as const, label: "100+", desc: "Large campus group" },
]

const STEP_TITLES = ["Basic info", "Structure", "Teams", "Review"]

const STEP_HEADINGS = [
  "Basic information",
  "Ministry structure",
  "Your teams",
  "Review & submit",
]

const STEP_SUBTITLES = [
  "Tell us the basics about your ministry.",
  "Select everything that applies to your ministry.",
  "We'll create these teams in your workspace.",
  "Review your details before submitting.",
]

const EMOJI_OPTIONS = ["🙏","📖","💒","🌍","🎓","❤️","💜","⭐","📋","🎯","🎉","💡","🏠","🍞","🌱","🤲","🫶","🎤","🥁","🎸","🎵","🎬","👥","🤝","✝️"]

function mapLandingSize(s: string): "small" | "medium" | "large" {
  if (s === "100+") return "large"
  if (s === "50–100") return "medium"
  return "small"
}

interface Team {
  id: string
  name: string
  icon: string
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

const inputClass =
  "w-full px-4 py-3 rounded-[10px] border border-[#ECE8DE] bg-white text-[14px] text-[#13101A] placeholder:text-[#C4C4C4] focus:outline-none focus:ring-2 focus:ring-[#3E1540]/20 focus:border-[#3E1540]/40 transition-all"

const inputErrorClass =
  "w-full px-4 py-3 rounded-[10px] border border-red-400 bg-white text-[14px] text-[#13101A] placeholder:text-[#C4C4C4] focus:outline-none focus:ring-2 focus:ring-red-200 transition-all"

function Toggle({ on, onToggle }: { on: boolean; onToggle: () => void }) {
  return (
    <div
      onClick={onToggle}
      style={{
        width: 40, height: 24, borderRadius: 999,
        background: on ? "#3E1540" : "#E5E0D2",
        position: "relative", cursor: "pointer", flexShrink: 0,
        transition: "background 0.2s",
      }}
    >
      <div style={{
        position: "absolute", top: 2, left: on ? 18 : 2,
        width: 20, height: 20, borderRadius: "50%", background: "white",
        boxShadow: "0 1px 3px rgba(0,0,0,0.15)",
        transition: "left 0.2s",
      }} />
    </div>
  )
}

export default function OnboardingPage() {
  const pendingMinistry = useState(readPendingMinistry)[0]
  const [step, setStep] = useState<1 | 2 | 3 | 4>(1)

  // Step 1
  const [name, setName] = useState(pendingMinistry.name)
  const [university, setUniversity] = useState(pendingMinistry.university)
  const [location, setLocation] = useState("")
  const [size, setSize] = useState<"small" | "medium" | "large">(pendingMinistry.size)
  const [founderRole, setFounderRole] = useState<"pastor" | "deacon" | "elder">("pastor")
  const [step1Touched, setStep1Touched] = useState(false)

  // Step 2
  const [structure, setStructure] = useState<Record<string, boolean>>({
    worship: false, media: false, smallGroups: false, hospitality: false, leadership: false,
  })

  // Step 3
  const [teams, setTeams] = useState<Team[]>([])
  const [showAdd, setShowAdd] = useState(false)
  const [newName, setNewName] = useState("")
  const [newIcon, setNewIcon] = useState("🙏")

  // Discoverability
  const [isPublic, setIsPublic] = useState(false)

  // Submit
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function toggleStructure(id: string) {
    setStructure((prev) => ({ ...prev, [id]: !prev[id] }))
  }

  function buildTeamsFromStructure() {
    const result: Team[] = [{ id: "prayer", name: "Prayer", icon: "🙏" }]
    for (const [key, yes] of Object.entries(structure)) {
      if (yes && TEAM_PRESETS[key]) {
        result.push({ id: key, name: TEAM_PRESETS[key].name, icon: TEAM_PRESETS[key].icon })
      }
    }
    return result
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

  function addTeam() {
    if (!newName.trim()) return
    setTeams((prev) => [...prev, { id: `c-${Date.now()}`, name: newName.trim(), icon: newIcon }])
    setNewName("")
    setNewIcon("🙏")
    setShowAdd(false)
  }

  function removeTeam(id: string) {
    setTeams((prev) => prev.filter((t) => t.id !== id))
  }

  async function handleSubmit() {
    setSubmitting(true)
    setError(null)
    const { error: err } = await submitMinistryApplication({
      name, university, location, size,
      teams: teams.map((t) => ({ name: t.name, icon: t.icon })),
      isPublic,
      founderRole,
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

  return (
    <div style={{ minHeight: "100svh", display: "flex", flexDirection: "column", fontFamily: "var(--font-inter)" }}>

      {/* ── Plum header ── */}
      <div style={{ background: "#3E1540" }}>
        <div className="px-6 sm:px-10" style={{ maxWidth: 580, margin: "0 auto", paddingTop: 36, paddingBottom: 40 }}>

          {/* Logo */}
          <div style={{ display: "flex", alignItems: "center", gap: 9, marginBottom: 32 }}>
            <RingCrossLogo size={24} color="#F6F4EF" />
            <span style={{ fontFamily: "var(--font-instrument-serif)", fontSize: 22, color: "#F6F4EF", letterSpacing: "-0.01em", lineHeight: 1 }}>
              Central
            </span>
          </div>

          {/* Eyebrow + heading + subtitle */}
          <p style={{ fontSize: 10, letterSpacing: "0.18em", textTransform: "uppercase", color: "rgba(246,244,239,0.5)", margin: "0 0 12px" }}>
            Register your ministry
          </p>
          <h1 style={{ fontFamily: "var(--font-instrument-serif)", fontSize: 38, fontWeight: 400, color: "#F6F4EF", letterSpacing: "-0.02em", lineHeight: 1.1, margin: "0 0 10px" }}>
            Set up your ministry workspace.
          </h1>
          <p style={{ fontSize: 14, color: "rgba(246,244,239,0.7)", lineHeight: 1.5, margin: "0 0 6px" }}>
            It only takes a few minutes. We&apos;ll get your team ready to go.
          </p>
          <p style={{ fontSize: 12, color: "rgba(246,244,239,0.45)", margin: "0 0 32px" }}>
            Approved within 24–48 hours · Free during beta
          </p>

          {/* Step indicator */}
          <div style={{ display: "flex", alignItems: "flex-start" }}>
            {Array.from({ length: STEPS }, (_, i) => (
              <div key={i} style={{ display: "flex", alignItems: "flex-start", flex: i < STEPS - 1 ? 1 : undefined }}>
                <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 7 }}>
                  <div style={{
                    width: 28, height: 28, borderRadius: "50%", flexShrink: 0,
                    background: i + 1 <= step ? "#F6F4EF" : "rgba(246,244,239,0.12)",
                    color: i + 1 <= step ? "#3E1540" : "rgba(246,244,239,0.3)",
                    display: "flex", alignItems: "center", justifyContent: "center",
                    fontSize: 11, fontWeight: 700,
                    transition: "all 0.2s",
                  }}>
                    {i + 1 < step
                      ? <Check style={{ width: 13, height: 13, color: "#3E1540" }} />
                      : i + 1}
                  </div>
                  <span style={{
                    fontSize: 10, letterSpacing: "0.04em", whiteSpace: "nowrap",
                    color: i + 1 === step ? "rgba(246,244,239,0.95)" : i + 1 < step ? "rgba(246,244,239,0.55)" : "rgba(246,244,239,0.4)",
                    fontWeight: i + 1 === step ? 600 : 400,
                    transition: "color 0.2s",
                  }}>
                    {STEP_TITLES[i]}
                  </span>
                </div>
                {i < STEPS - 1 && (
                  <div style={{
                    flex: 1, height: 1, marginTop: 14, marginLeft: 8, marginRight: 8,
                    background: i + 1 < step ? "rgba(246,244,239,0.55)" : "rgba(246,244,239,0.15)",
                    transition: "background 0.2s",
                  }} />
                )}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── Form area ── */}
      <div style={{ background: "#FBF8F2", flex: 1 }}>
        <div className="px-6 pt-9 pb-12 sm:px-10" style={{ maxWidth: 580, margin: "0 auto" }}>

          {/* Step heading */}
          <h2 style={{ fontFamily: "var(--font-instrument-serif)", fontSize: 26, fontWeight: 400, color: "#13101A", letterSpacing: "-0.01em", margin: "0 0 6px" }}>
            {STEP_HEADINGS[step - 1]}
          </h2>
          <p style={{ fontSize: 13, color: "#8A8497", margin: "0 0 28px", lineHeight: 1.5 }}>
            {STEP_SUBTITLES[step - 1]}
          </p>

          {/* ── Step 1: Basic Info ── */}
          {step === 1 && (
            <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                <label style={{ fontSize: 12, fontWeight: 600, color: "#5A5466", letterSpacing: "0.02em" }}>Ministry name</label>
                <input type="text" value={name} onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. Central Student Fellowship"
                  className={step1Touched && !name.trim() ? inputErrorClass : inputClass} />
                {step1Touched && !name.trim() && <p style={{ fontSize: 11, color: "#B91C1C", marginTop: -2 }}>Required</p>}
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                <label style={{ fontSize: 12, fontWeight: 600, color: "#5A5466", letterSpacing: "0.02em" }}>University</label>
                <input type="text" value={university} onChange={(e) => setUniversity(e.target.value)}
                  placeholder="e.g. University of Pittsburgh"
                  className={step1Touched && !university.trim() ? inputErrorClass : inputClass} />
                {step1Touched && !university.trim() && <p style={{ fontSize: 11, color: "#B91C1C", marginTop: -2 }}>Required</p>}
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                <label style={{ fontSize: 12, fontWeight: 600, color: "#5A5466", letterSpacing: "0.02em" }}>Location</label>
                <input type="text" value={location} onChange={(e) => setLocation(e.target.value)}
                  placeholder="e.g. Pittsburgh, PA"
                  className={step1Touched && !location.trim() ? inputErrorClass : inputClass} />
                {step1Touched && !location.trim() && <p style={{ fontSize: 11, color: "#B91C1C", marginTop: -2 }}>Required</p>}
              </div>

              {/* Size cards */}
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                <label style={{ fontSize: 12, fontWeight: 600, color: "#5A5466", letterSpacing: "0.02em" }}>Approximate size</label>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10 }}>
                  {SIZE_OPTIONS.map((opt) => {
                    const selected = size === opt.value
                    return (
                      <button key={opt.value} type="button" onClick={() => setSize(opt.value)}
                        style={{
                          padding: "16px 14px", borderRadius: 10, textAlign: "left", cursor: "pointer",
                          border: selected ? "2px solid #3E1540" : "1.5px solid #ECE8DE",
                          background: selected ? "#3E1540" : "white",
                          transition: "all 0.15s",
                        }}>
                        <p style={{ fontSize: 15, fontWeight: 700, color: selected ? "#F6F4EF" : "#13101A", margin: "0 0 3px" }}>
                          {opt.label}
                        </p>
                        <p style={{ fontSize: 11, color: selected ? "rgba(246,244,239,0.6)" : "#8A8497", margin: 0 }}>
                          {opt.desc}
                        </p>
                      </button>
                    )
                  })}
                </div>
              </div>

              {/* Founder role */}
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                <label style={{ fontSize: 12, fontWeight: 600, color: "#5A5466", letterSpacing: "0.02em" }}>Your role</label>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10 }}>
                  {([
                    { value: "pastor",  label: "Pastor",  desc: "Senior leader" },
                    { value: "deacon",  label: "Deacon",  desc: "Servant leader" },
                    { value: "elder",   label: "Elder",   desc: "Elder board" },
                  ] as const).map((opt) => {
                    const sel = founderRole === opt.value
                    return (
                      <button key={opt.value} type="button" onClick={() => setFounderRole(opt.value)}
                        style={{
                          padding: "16px 14px", borderRadius: 10, textAlign: "left", cursor: "pointer",
                          border: sel ? "2px solid #3E1540" : "1.5px solid #ECE8DE",
                          background: sel ? "#3E1540" : "white",
                          transition: "all 0.15s",
                        }}>
                        <p style={{ fontSize: 15, fontWeight: 700, color: sel ? "#F6F4EF" : "#13101A", margin: "0 0 3px" }}>
                          {opt.label}
                        </p>
                        <p style={{ fontSize: 11, color: sel ? "rgba(246,244,239,0.6)" : "#8A8497", margin: 0 }}>
                          {opt.desc}
                        </p>
                      </button>
                    )
                  })}
                </div>
              </div>
            </div>
          )}

          {/* ── Step 2: Structure ── */}
          {step === 2 && (
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {STRUCTURE_QUESTIONS.map((q) => {
                const comingSoon = q.id === "worship" || q.id === "media"
                if (comingSoon) {
                  return (
                    <div key={q.id}
                      style={{
                        display: "flex", alignItems: "center", gap: 14,
                        padding: "14px 16px", borderRadius: 10, textAlign: "left", width: "100%",
                        border: "1.5px solid #ECE8DE", background: "#F8F6F2",
                        opacity: 0.6, cursor: "not-allowed",
                      }}>
                      <div style={{
                        width: 20, height: 20, borderRadius: 6, flexShrink: 0,
                        background: "#F4F1E8", border: "1.5px solid #E5E0D2",
                      }} />
                      <div style={{ flex: 1 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                          <p style={{ fontSize: 14, fontWeight: 600, color: "#8A8497", margin: "0 0 2px" }}>{q.label}</p>
                          <span style={{ fontSize: 10, fontWeight: 600, letterSpacing: "0.08em", textTransform: "uppercase", background: "#ECE8DE", color: "#8A8497", padding: "2px 7px", borderRadius: 99 }}>Coming soon</span>
                        </div>
                        <p style={{ fontSize: 12, color: "#C4C0B0", margin: 0 }}>{q.desc}</p>
                      </div>
                    </div>
                  )
                }
                return (
                  <button key={q.id} type="button" onClick={() => toggleStructure(q.id)}
                    style={{
                      display: "flex", alignItems: "center", gap: 14,
                      padding: "14px 16px", borderRadius: 10, textAlign: "left", width: "100%", cursor: "pointer",
                      border: structure[q.id] ? "1.5px solid #3E1540" : "1.5px solid #ECE8DE",
                      background: structure[q.id] ? "rgba(62,21,64,0.04)" : "white",
                      transition: "all 0.15s",
                    }}>
                    <div style={{
                      width: 20, height: 20, borderRadius: 6, flexShrink: 0,
                      background: structure[q.id] ? "#3E1540" : "#F4F1E8",
                      border: structure[q.id] ? "none" : "1.5px solid #E5E0D2",
                      display: "flex", alignItems: "center", justifyContent: "center",
                      transition: "all 0.15s",
                    }}>
                      {structure[q.id] && <Check style={{ width: 11, height: 11, color: "white" }} />}
                    </div>
                    <div>
                      <p style={{ fontSize: 14, fontWeight: 600, color: "#13101A", margin: "0 0 2px" }}>{q.label}</p>
                      <p style={{ fontSize: 12, color: "#8A8497", margin: 0 }}>{q.desc}</p>
                    </div>
                  </button>
                )
              })}
            </div>
          )}

          {/* ── Step 3: Teams ── */}
          {step === 3 && (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <p style={{ fontSize: 13, color: "#8A8497", margin: "0 0 4px" }}>
                {teams.length === 0
                  ? "Add your first team below."
                  : `${teams.length} team${teams.length !== 1 ? "s" : ""} will be created in your workspace.`}
              </p>

              {teams.map((team) => (
                <div key={team.id} style={{
                  display: "flex", alignItems: "center", gap: 12,
                  padding: "12px 14px", borderRadius: 10,
                  border: "1px solid #ECE8DE", background: "white",
                }}>
                  <span style={{ fontSize: 18 }}>{team.icon}</span>
                  <span style={{ fontSize: 14, fontWeight: 500, color: "#13101A", flex: 1 }}>{team.name}</span>
                  <button type="button" onClick={() => removeTeam(team.id)}
                    style={{
                      width: 24, height: 24, borderRadius: "50%", border: "none", background: "#F4F1E8",
                      display: "flex", alignItems: "center", justifyContent: "center",
                      cursor: "pointer", color: "#8A8497", flexShrink: 0,
                    }}>
                    <X style={{ width: 12, height: 12 }} />
                  </button>
                </div>
              ))}

              {showAdd ? (
                <div style={{ padding: 16, borderRadius: 10, border: "1px solid #ECE8DE", background: "white", display: "flex", flexDirection: "column", gap: 12 }}>
                  {/* Emoji grid picker */}
                  <div>
                    <p style={{ fontSize: 11, fontWeight: 600, color: "#8A8497", letterSpacing: "0.04em", marginBottom: 8 }}>Choose an icon</p>
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(6, 1fr)", gap: 6 }}>
                      {EMOJI_OPTIONS.map((e) => (
                        <button
                          key={e}
                          type="button"
                          onClick={() => setNewIcon(e)}
                          style={{
                            width: 36, height: 36, fontSize: 18,
                            borderRadius: 8, border: newIcon === e ? "1.5px solid #3E1540" : "1.5px solid transparent",
                            background: newIcon === e ? "rgba(62,21,64,0.08)" : "transparent",
                            cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center",
                            transition: "all 0.12s",
                          }}
                        >
                          {e}
                        </button>
                      ))}
                    </div>
                  </div>
                  <input type="text" value={newName} onChange={(e) => setNewName(e.target.value)}
                    placeholder="Team name" className={inputClass}
                    onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addTeam() } }} />
                  <div style={{ display: "flex", gap: 8 }}>
                    <button type="button" onClick={addTeam} disabled={!newName.trim()}
                      style={{ flex: 1, padding: "9px 0", borderRadius: 8, background: "#3E1540", color: "#F6F4EF", fontSize: 13, fontWeight: 600, border: "none", cursor: "pointer", opacity: !newName.trim() ? 0.5 : 1 }}>
                      Add
                    </button>
                    <button type="button" onClick={() => { setShowAdd(false); setNewName("") }}
                      style={{ flex: 1, padding: "9px 0", borderRadius: 8, border: "1px solid #ECE8DE", background: "transparent", fontSize: 13, color: "#8A8497", cursor: "pointer" }}>
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <button type="button" onClick={() => setShowAdd(true)}
                  style={{
                    display: "flex", alignItems: "center", gap: 8,
                    padding: "12px 14px", borderRadius: 10,
                    border: "1.5px dashed #E5E0D2", background: "transparent",
                    fontSize: 13, color: "#8A8497", cursor: "pointer",
                  }}>
                  <Plus style={{ width: 15, height: 15 }} /> Add team
                </button>
              )}
            </div>
          )}

          {/* ── Step 4: Review & Submit ── */}
          {step === 4 && (
            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              {error && (
                <div style={{ borderRadius: 10, background: "rgba(220,38,38,0.08)", padding: "12px 16px", fontSize: 13, color: "#B91C1C", fontWeight: 500 }}>
                  {error}
                </div>
              )}

              <div style={{ padding: "16px 18px", borderRadius: 10, background: "white", border: "1px solid #ECE8DE" }}>
                <p style={{ fontSize: 10, fontWeight: 600, color: "#8A8497", textTransform: "uppercase", letterSpacing: "0.12em", margin: "0 0 10px" }}>Ministry</p>
                <p style={{ fontFamily: "var(--font-instrument-serif)", fontSize: 18, color: "#13101A", fontWeight: 400, margin: "0 0 3px" }}>{name}</p>
                <p style={{ fontSize: 13, color: "#5A5466", margin: "0 0 2px" }}>{university}</p>
                <p style={{ fontSize: 13, color: "#8A8497", margin: "0 0 2px" }}>{location}</p>
                <p style={{ fontSize: 12, color: "#8A8497", margin: "0 0 2px" }}>
                  {SIZE_OPTIONS.find((o) => o.value === size)?.label} members
                </p>
                <p style={{ fontSize: 12, color: "#8A8497", margin: 0, textTransform: "capitalize" }}>
                  Your role: {founderRole}
                </p>
              </div>

              {teams.length > 0 && (
                <div style={{ padding: "16px 18px", borderRadius: 10, background: "white", border: "1px solid #ECE8DE" }}>
                  <p style={{ fontSize: 10, fontWeight: 600, color: "#8A8497", textTransform: "uppercase", letterSpacing: "0.12em", margin: "0 0 10px" }}>
                    Teams ({teams.length})
                  </p>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                    {teams.map((t) => (
                      <span key={t.id} style={{
                        display: "flex", alignItems: "center", gap: 6,
                        padding: "4px 12px", borderRadius: 9999,
                        background: "#F4F1E8", border: "1px solid #ECE8DE",
                        fontSize: 13, color: "#13101A",
                      }}>
                        {t.icon} {t.name}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* Discoverability toggle */}
              <div style={{
                display: "flex", alignItems: "center", justifyContent: "space-between",
                padding: "16px 18px", borderRadius: 10, background: "white", border: "1px solid #ECE8DE",
              }}>
                <div>
                  <p style={{ fontSize: 14, fontWeight: 600, color: "#13101A", margin: "0 0 3px" }}>List in public directory</p>
                  <p style={{ fontSize: 12, color: "#8A8497", margin: 0 }}>Anyone can find and request to join</p>
                </div>
                <Toggle on={isPublic} onToggle={() => setIsPublic((v) => !v)} />
              </div>

              {/* Free beta banner */}
              <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "14px 18px", borderRadius: 10, background: "#F4F1E8", border: "1px solid #ECE8DE" }}>
                <div style={{ width: 20, height: 20, borderRadius: "50%", background: "#3E1540", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                  <Check style={{ width: 11, height: 11, color: "white" }} />
                </div>
                <div>
                  <p style={{ fontSize: 13, fontWeight: 600, color: "#13101A", margin: "0 0 2px" }}>Free during beta · No credit card required</p>
                  <p style={{ fontSize: 12, color: "#8A8497", margin: 0 }}>Your application will be reviewed within 24–48 hours.</p>
                </div>
              </div>
            </div>
          )}

          {/* Navigation */}
          <div style={{ display: "flex", flexDirection: "column", gap: 12, marginTop: 36 }}>
            {step < STEPS ? (
              <button type="button" onClick={next}
                className="active:scale-[0.97]"
                style={{
                  width: "100%", padding: "14px 0", background: "#3E1540", color: "#F6F4EF",
                  border: "none", borderRadius: 12, fontSize: 14, fontWeight: 600,
                  cursor: "pointer",
                  transition: "opacity 0.15s, transform 0.15s",
                }}>
                Continue
              </button>
            ) : (
              <button type="button" onClick={handleSubmit} disabled={submitting}
                className="active:scale-[0.97]"
                style={{
                  width: "100%", padding: "14px 0", background: "#3E1540", color: "#F6F4EF",
                  border: "none", borderRadius: 12, fontSize: 14, fontWeight: 600,
                  cursor: submitting ? "not-allowed" : "pointer",
                  opacity: submitting ? 0.5 : 1,
                  transition: "opacity 0.15s, transform 0.15s",
                }}>
                {submitting ? "Submitting…" : "Submit application"}
              </button>
            )}
            {step > 1 && (
              <button type="button" onClick={back}
                style={{ fontSize: 13, color: "#8A8497", background: "none", border: "none", cursor: "pointer", padding: "6px 0", fontWeight: 500, textAlign: "center" }}>
                ← Back
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
