"use client"

import { useState, useEffect } from "react"
import { Check, Plus, X, ChevronLeft } from "lucide-react"
import { submitMinistryApplication } from "@/app/actions/ministry"

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
  { value: "small" as const, label: "Under 50" },
  { value: "medium" as const, label: "50–100" },
  { value: "large" as const, label: "100+" },
]

const STEP_TITLES = ["Basic information", "Ministry structure", "Your teams", "Review & submit"]

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

const inputClass =
  "w-full px-4 py-3 rounded-xl border border-[#ECE8DE] bg-[#FBF8F2] text-[14px] text-[#13101A] placeholder:text-[#C4C4C4] focus:outline-none focus:ring-2 focus:ring-[#3E1540]/20 focus:border-[#3E1540]/40 transition-all"

export default function OnboardingPage() {
  const [step, setStep] = useState<1 | 2 | 3 | 4>(1)

  // Step 1
  const [name, setName] = useState("")
  const [university, setUniversity] = useState("")
  const [location, setLocation] = useState("")
  const [size, setSize] = useState<"small" | "medium" | "large">("small")

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

  useEffect(() => {
    try {
      const raw = sessionStorage.getItem("pending_ministry")
      if (!raw) return
      const saved = JSON.parse(raw)
      if (saved.name) setName(saved.name)
      if (saved.university) setUniversity(saved.university)
      if (saved.size) setSize(mapLandingSize(saved.size))
    } catch {}
  }, [])

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
    })
    if (err) {
      setError(err)
      setSubmitting(false)
      return
    }
    sessionStorage.removeItem("pending_ministry")
    window.location.href = "/pending"
  }

  const step1Valid = name.trim() && university.trim() && location.trim()

  return (
    <div className="min-h-screen bg-[#FBF8F2] flex items-center justify-center px-5 py-12">
      <div className="w-full max-w-[480px]">

        {/* Logo */}
        <div className="flex flex-col items-center mb-8">
          <div className="flex items-center gap-2.5 mb-2">
            <svg width="28" height="28" viewBox="0 0 100 100" fill="none">
              <circle cx="50" cy="50" r="44" stroke="#3E1540" strokeWidth="6" />
              <rect x="47" y="22" width="6" height="56" fill="#3E1540" />
              <rect x="22" y="47" width="56" height="6" fill="#3E1540" />
            </svg>
            <span style={{ fontFamily: "var(--font-instrument-serif)", fontSize: "30px", color: "#13101A", letterSpacing: "-0.01em", lineHeight: 1 }}>
              Central
            </span>
          </div>
          <p className="text-[13px] text-[#8A8497]">Create your ministry workspace</p>
        </div>

        {/* Step indicator */}
        <div className="flex items-center justify-center gap-2 mb-7">
          {Array.from({ length: STEPS }, (_, i) => (
            <div key={i} className="flex items-center gap-2">
              <div
                className="w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-bold transition-all"
                style={{
                  background: i + 1 <= step ? "#3E1540" : "#E5E0D2",
                  color: i + 1 <= step ? "#F6F4EF" : "#8A8497",
                }}
              >
                {i + 1 < step ? <Check className="w-3 h-3" /> : i + 1}
              </div>
              {i < STEPS - 1 && (
                <div className="w-8 h-px" style={{ background: i + 1 < step ? "#3E1540" : "#E5E0D2" }} />
              )}
            </div>
          ))}
        </div>

        {/* Card */}
        <div className="bg-white rounded-2xl border border-[#ECE8DE] p-6 shadow-[0_2px_8px_rgba(19,16,26,0.06)]">
          <h2 style={{ fontFamily: "var(--font-instrument-serif)", fontSize: "22px", color: "#13101A", marginBottom: 4, fontWeight: 400 }}>
            {STEP_TITLES[step - 1]}
          </h2>
          <p className="text-[12px] text-[#8A8497] mb-6">Step {step} of {STEPS}</p>

          {/* ── Step 1: Basic Info ── */}
          {step === 1 && (
            <div className="flex flex-col gap-4">
              <div className="flex flex-col gap-1.5">
                <label className="text-[12px] font-medium text-[#5A5466]">Ministry name</label>
                <input type="text" value={name} onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. Central Student Fellowship" className={inputClass} />
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="text-[12px] font-medium text-[#5A5466]">University</label>
                <input type="text" value={university} onChange={(e) => setUniversity(e.target.value)}
                  placeholder="e.g. University of Pittsburgh" className={inputClass} />
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="text-[12px] font-medium text-[#5A5466]">Location</label>
                <input type="text" value={location} onChange={(e) => setLocation(e.target.value)}
                  placeholder="e.g. Pittsburgh, PA" className={inputClass} />
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="text-[12px] font-medium text-[#5A5466]">Approximate size</label>
                <div className="flex gap-2">
                  {SIZE_OPTIONS.map((opt) => (
                    <button key={opt.value} type="button" onClick={() => setSize(opt.value)}
                      className={`flex-1 py-2.5 rounded-xl border text-[13px] font-semibold transition-all ${
                        size === opt.value
                          ? "bg-[#3E1540] border-[#3E1540] text-[#F6F4EF]"
                          : "bg-[#FBF8F2] border-[#ECE8DE] text-[#5A5466] hover:border-[#3E1540]/40"
                      }`}>
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* ── Step 2: Structure ── */}
          {step === 2 && (
            <div className="flex flex-col gap-3">
              <p className="text-[13px] text-[#5A5466] -mt-2 mb-1">Which of these apply to your ministry?</p>
              {STRUCTURE_QUESTIONS.map((q) => (
                <button key={q.id} type="button" onClick={() => toggleStructure(q.id)}
                  className="flex items-center gap-4 p-4 rounded-xl text-left w-full transition-all"
                  style={{
                    border: structure[q.id] ? "1.5px solid #3E1540" : "1.5px solid #E5E0D2",
                    background: structure[q.id] ? "rgba(62,21,64,0.04)" : "white",
                  }}>
                  <div className="w-5 h-5 rounded-md flex items-center justify-center flex-shrink-0 transition-all"
                    style={{
                      background: structure[q.id] ? "#3E1540" : "#F4F1E8",
                      border: structure[q.id] ? "none" : "1.5px solid #E5E0D2",
                    }}>
                    {structure[q.id] && <Check className="w-3 h-3 text-white" />}
                  </div>
                  <div>
                    <p className="text-[14px] font-semibold text-[#13101A]">{q.label}</p>
                    <p className="text-[12px] text-[#8A8497]">{q.desc}</p>
                  </div>
                </button>
              ))}
            </div>
          )}

          {/* ── Step 3: Teams ── */}
          {step === 3 && (
            <div className="flex flex-col gap-3">
              <p className="text-[13px] text-[#5A5466] -mt-2 mb-1">
                {teams.length === 0
                  ? "Add your first team below."
                  : `${teams.length} team${teams.length !== 1 ? "s" : ""} will be created in your workspace.`}
              </p>

              {teams.map((team) => (
                <div key={team.id} className="flex items-center gap-3 px-4 py-3 rounded-xl border border-[#E5E0D2] bg-[#FBF8F2]">
                  <span className="text-xl">{team.icon}</span>
                  <span className="text-[14px] font-medium text-[#13101A] flex-1">{team.name}</span>
                  <button type="button" onClick={() => removeTeam(team.id)}
                    className="w-6 h-6 rounded-full flex items-center justify-center text-[#8A8497] hover:text-[#9D2D2D] hover:bg-red-50 transition-colors">
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}

              {showAdd ? (
                <div className="p-4 rounded-xl border border-[#E5E0D2] bg-[#FBF8F2] flex flex-col gap-2">
                  <div className="flex gap-2">
                    <select value={newIcon} onChange={(e) => setNewIcon(e.target.value)}
                      className="w-14 px-1 py-2 rounded-lg border border-[#E5E0D2] bg-white text-center text-xl focus:outline-none cursor-pointer">
                      {["🙏","📖","💒","🌍","🎓","❤️","💜","⭐","📋","🎯","🎉","💡","🏠","🍞","🌱","🤲","🫶","🎤","🥁","🎸","🎵","🎬","👥","🤝","✝️"].map((e) => (
                        <option key={e} value={e}>{e}</option>
                      ))}
                    </select>
                    <input type="text" value={newName} onChange={(e) => setNewName(e.target.value)}
                      placeholder="Team name" className={`${inputClass} flex-1`}
                      onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addTeam() } }} />
                  </div>
                  <div className="flex gap-2">
                    <button type="button" onClick={addTeam} disabled={!newName.trim()}
                      className="flex-1 py-2 rounded-lg bg-[#3E1540] text-[#F6F4EF] text-[13px] font-semibold disabled:opacity-50 transition-colors">
                      Add
                    </button>
                    <button type="button" onClick={() => { setShowAdd(false); setNewName(""); }}
                      className="flex-1 py-2 rounded-lg border border-[#E5E0D2] text-[13px] text-[#8A8497] transition-colors">
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <button type="button" onClick={() => setShowAdd(true)}
                  className="flex items-center gap-2 px-4 py-3 rounded-xl border border-dashed border-[#E5E0D2] text-[13px] text-[#8A8497] hover:border-[#3E1540]/40 hover:text-[#3E1540] transition-colors">
                  <Plus className="w-4 h-4" /> Add team
                </button>
              )}
            </div>
          )}

          {/* ── Step 4: Review & Submit ── */}
          {step === 4 && (
            <div className="flex flex-col gap-4">
              {error && (
                <div className="rounded-xl bg-[#3E1540]/8 px-4 py-3 text-[13px] text-[#3E1540] font-medium">
                  {error}
                </div>
              )}

              <div className="p-4 rounded-xl bg-[#FBF8F2] border border-[#E5E0D2]">
                <p className="text-[11px] font-semibold text-[#8A8497] uppercase tracking-wider mb-3">Ministry</p>
                <p style={{ fontFamily: "var(--font-instrument-serif)", fontSize: "18px", color: "#13101A", fontWeight: 400 }}>{name}</p>
                <p className="text-[13px] text-[#5A5466] mt-0.5">{university}</p>
                <p className="text-[13px] text-[#8A8497]">{location}</p>
                <p className="text-[12px] text-[#8A8497] mt-1">
                  {SIZE_OPTIONS.find((o) => o.value === size)?.label} members
                </p>
              </div>

              {teams.length > 0 && (
                <div className="p-4 rounded-xl bg-[#FBF8F2] border border-[#E5E0D2]">
                  <p className="text-[11px] font-semibold text-[#8A8497] uppercase tracking-wider mb-3">
                    Teams ({teams.length})
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {teams.map((t) => (
                      <span key={t.id} className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-white border border-[#E5E0D2] text-[13px] text-[#13101A]">
                        {t.icon} {t.name}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* Discoverability toggle */}
              <button
                type="button"
                onClick={() => setIsPublic((v) => !v)}
                className="flex items-center justify-between w-full p-4 rounded-xl border transition-all"
                style={{
                  border: isPublic ? "1.5px solid #3E1540" : "1.5px solid #E5E0D2",
                  background: isPublic ? "rgba(62,21,64,0.04)" : "white",
                }}
              >
                <div className="text-left">
                  <p className="text-[14px] font-semibold text-[#13101A]">Make ministry discoverable</p>
                  <p className="text-[12px] text-[#8A8497] mt-0.5">Anyone can find and join once approved</p>
                </div>
                <div
                  className="w-10 h-6 rounded-full relative transition-colors flex-shrink-0 ml-4"
                  style={{ background: isPublic ? "#3E1540" : "#E5E0D2" }}
                >
                  <div
                    className="absolute top-0.5 w-5 h-5 rounded-full bg-white shadow-sm transition-transform"
                    style={{ transform: isPublic ? "translateX(18px)" : "translateX(2px)" }}
                  />
                </div>
              </button>

              <div className="flex items-start gap-3 p-4 rounded-xl bg-[#FBF8F2] border border-[#E5E0D2]">
                <div className="w-4 h-4 mt-0.5 rounded-full bg-[#C9A34B]/20 flex items-center justify-center flex-shrink-0">
                  <Check className="w-2.5 h-2.5 text-[#C9A34B]" />
                </div>
                <p className="text-[12px] text-[#8A8497] leading-relaxed">
                  Your application will be reviewed by the Central team within 24–48 hours. You&apos;ll receive full access once approved.
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Navigation buttons */}
        <div className="flex gap-3 mt-4">
          {step > 1 && (
            <button type="button" onClick={back}
              className="flex items-center gap-1.5 px-5 py-3 rounded-xl border border-[#E5E0D2] text-[13px] font-semibold text-[#5A5466] hover:border-[#3E1540]/40 hover:text-[#3E1540] transition-colors">
              <ChevronLeft className="w-4 h-4" /> Back
            </button>
          )}

          {step < STEPS ? (
            <button type="button" onClick={next} disabled={step === 1 && !step1Valid}
              className="flex-1 py-3 rounded-xl bg-[#3E1540] hover:bg-[#2D0F2E] disabled:opacity-50 text-[#F6F4EF] font-bold text-[14px] transition-colors">
              Continue
            </button>
          ) : (
            <button type="button" onClick={handleSubmit} disabled={submitting}
              className="flex-1 py-3 rounded-xl bg-[#3E1540] hover:bg-[#2D0F2E] disabled:opacity-50 text-[#F6F4EF] font-bold text-[14px] transition-colors">
              {submitting ? "Submitting…" : "Submit application"}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
