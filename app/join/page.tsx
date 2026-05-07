"use client"

import { Suspense, useState, useEffect, useCallback } from "react"
import { ArrowLeft, Search, Users, Building2, ChevronRight } from "lucide-react"
import { joinMinistryByCode, getPublicMinistries, joinMinistryById } from "@/app/actions/ministry"

const SIZE_LABELS: Record<string, string> = {
  small: "Under 50",
  medium: "50–100",
  large: "100+",
}

type Ministry = { id: string; name: string; university: string; size: string; location: string | null }
type Mode = "code" | "browse" | "confirm"

const inputClass =
  "w-full px-4 py-3 rounded-xl border border-[#ECE8DE] bg-[#FBF8F2] text-[14px] text-[#13101A] placeholder:text-[#C4C4C4] focus:outline-none focus:ring-2 focus:ring-[#3E1540]/20 focus:border-[#3E1540]/40 transition-all"

function Logo() {
  return (
    <div className="flex items-center gap-2.5">
      <svg width="32" height="32" viewBox="0 0 100 100" fill="none">
        <circle cx="50" cy="50" r="44" stroke="#3E1540" strokeWidth="6" />
        <rect x="47" y="22" width="6" height="56" fill="#3E1540" />
        <rect x="22" y="47" width="56" height="6" fill="#3E1540" />
      </svg>
      <span style={{ fontFamily: "var(--font-instrument-serif)", fontSize: "36px", color: "#13101A", letterSpacing: "-0.01em", lineHeight: 1 }}>
        Central
      </span>
    </div>
  )
}

function JoinContent() {
  const [mode, setMode] = useState<Mode>("code")

  // Invite code state
  const [inviteCode, setInviteCode] = useState("")
  const [joining, setJoining] = useState(false)
  const [codeError, setCodeError] = useState<string | null>(null)

  // Browse state
  const [search, setSearch] = useState("")
  const [ministries, setMinistries] = useState<Ministry[]>([])
  const [browsing, setBrowsing] = useState(false)
  const [browseError, setBrowseError] = useState<string | null>(null)

  // Confirm state
  const [selected, setSelected] = useState<Ministry | null>(null)
  const [confirming, setConfirming] = useState(false)
  const [confirmError, setConfirmError] = useState<string | null>(null)

  // Pre-fill invite code or pre-select browse ministry from sessionStorage
  useEffect(() => {
    const code = sessionStorage.getItem("pending_invite_code")
    if (code) {
      setInviteCode(code)
      sessionStorage.removeItem("pending_invite_code")
    }
    const browseRaw = sessionStorage.getItem("pending_browse_ministry")
    if (browseRaw) {
      try {
        const m = JSON.parse(browseRaw) as Ministry
        sessionStorage.removeItem("pending_browse_ministry")
        setSelected(m)
        setMode("confirm")
      } catch {}
    }
  }, [])

  // Fetch public ministries when browse mode is active
  const fetchMinistries = useCallback(async (q: string) => {
    setBrowsing(true)
    setBrowseError(null)
    const { data, error } = await getPublicMinistries(q)
    if (error) setBrowseError(error)
    else setMinistries(data ?? [])
    setBrowsing(false)
  }, [])

  useEffect(() => {
    if (mode !== "browse") return
    const t = setTimeout(() => fetchMinistries(search), 300)
    return () => clearTimeout(t)
  }, [mode, search, fetchMinistries])

  async function handleCodeJoin(e: React.FormEvent) {
    e.preventDefault()
    if (!inviteCode.trim()) return
    setJoining(true)
    setCodeError(null)
    try {
      const { error } = await joinMinistryByCode(inviteCode)
      if (error) { setCodeError(error); setJoining(false); return }
      window.location.href = "/home"
    } catch {
      setCodeError("Something went wrong. Please try again.")
      setJoining(false)
    }
  }

  function selectMinistry(m: Ministry) {
    setSelected(m)
    setConfirmError(null)
    setMode("confirm")
  }

  async function handleConfirmJoin() {
    if (!selected) return
    setConfirming(true)
    setConfirmError(null)
    const { error } = await joinMinistryById(selected.id)
    if (error) { setConfirmError(error); setConfirming(false); return }
    window.location.href = "/home"
  }

  return (
    <div className="min-h-screen bg-[#FBF8F2] flex items-center justify-center px-6 py-12">
      <div className="w-full max-w-[420px]">

        {/* Logo */}
        <div className="flex flex-col items-center mb-10">
          <div className="mb-3"><Logo /></div>
          <p className="text-[13px] text-[#8A8497]">College ministry community</p>
        </div>

        {/* ── Confirm screen ── */}
        {mode === "confirm" && selected && (
          <div className="bg-white rounded-2xl border border-[#ECE8DE] p-6 shadow-[0_2px_8px_rgba(19,16,26,0.06)]">
            <button
              onClick={() => setMode("browse")}
              className="flex items-center gap-1.5 text-[13px] text-[#8A8497] hover:text-[#3E1540] mb-5 transition-colors"
            >
              <ArrowLeft className="w-3.5 h-3.5" /> Back
            </button>

            <h2 style={{ fontFamily: "var(--font-instrument-serif)", fontSize: "22px", color: "#13101A", fontWeight: 400, marginBottom: 16 }}>
              Join {selected.name}?
            </h2>

            <div className="rounded-xl bg-[#FBF8F2] border border-[#ECE8DE] p-4 mb-5 flex flex-col gap-2">
              <div className="flex items-center gap-2 text-[13px] text-[#5A5466]">
                <Building2 className="w-3.5 h-3.5 text-[#8A8497] flex-shrink-0" />
                {selected.university}
              </div>
              {selected.location && (
                <div className="flex items-center gap-2 text-[13px] text-[#5A5466]">
                  <span className="w-3.5 h-3.5 flex-shrink-0 text-[#8A8497] text-center">📍</span>
                  {selected.location}
                </div>
              )}
              <div className="flex items-center gap-2 text-[13px] text-[#5A5466]">
                <Users className="w-3.5 h-3.5 text-[#8A8497] flex-shrink-0" />
                {SIZE_LABELS[selected.size] ?? selected.size} members
              </div>
            </div>

            {confirmError && (
              <div className="rounded-xl bg-[#3E1540]/8 px-4 py-3 text-[13px] text-[#3E1540] font-medium mb-4">
                {confirmError}
              </div>
            )}

            <button
              onClick={handleConfirmJoin}
              disabled={confirming}
              className="w-full bg-[#3E1540] hover:bg-[#2D0F2E] disabled:opacity-60 text-[#F6F4EF] font-bold py-3.5 rounded-xl transition-colors text-[14px]"
            >
              {confirming ? "Joining…" : "Join this ministry"}
            </button>
          </div>
        )}

        {/* ── Code + Browse modes ── */}
        {mode !== "confirm" && (
          <div className="bg-white rounded-2xl border border-[#ECE8DE] shadow-[0_2px_8px_rgba(19,16,26,0.06)] overflow-hidden">

            {/* Tab strip */}
            <div className="flex border-b border-[#ECE8DE]">
              {(["code", "browse"] as const).map((m) => (
                <button
                  key={m}
                  onClick={() => setMode(m)}
                  className="flex-1 py-3.5 text-[13px] font-semibold transition-colors"
                  style={{
                    color: mode === m ? "#3E1540" : "#8A8497",
                    borderBottom: mode === m ? "2px solid #3E1540" : "2px solid transparent",
                    background: "none",
                    marginBottom: -1,
                  }}
                >
                  {m === "code" ? "Join with invite code" : "Browse ministries"}
                </button>
              ))}
            </div>

            <div className="p-6">

              {/* ── Code tab ── */}
              {mode === "code" && (
                <form onSubmit={handleCodeJoin} className="flex flex-col gap-4">
                  <p className="text-[13px] text-[#8A8497]">
                    Enter the invite code your ministry leader shared with you.
                  </p>

                  {codeError && (
                    <div className="rounded-xl bg-[#3E1540]/8 px-4 py-3 text-[13px] text-[#3E1540] font-medium">
                      {codeError}
                    </div>
                  )}

                  <div className="flex flex-col gap-1.5">
                    <label className="text-[12px] font-medium text-[#5A5466]">Invite code</label>
                    <input
                      type="text"
                      value={inviteCode}
                      onChange={(e) => setInviteCode(e.target.value.toUpperCase())}
                      placeholder="e.g. CCSF26"
                      required
                      autoComplete="off"
                      autoCapitalize="characters"
                      className={`${inputClass} font-mono tracking-[0.15em] text-[16px]`}
                    />
                  </div>

                  <button
                    type="submit"
                    disabled={joining || !inviteCode.trim()}
                    className="w-full bg-[#3E1540] hover:bg-[#2D0F2E] disabled:opacity-60 text-white font-bold py-3.5 rounded-xl transition-colors text-[14px]"
                  >
                    {joining ? "Joining…" : "Join ministry"}
                  </button>
                </form>
              )}

              {/* ── Browse tab ── */}
              {mode === "browse" && (
                <div className="flex flex-col gap-4">
                  {/* Search */}
                  <div className="relative">
                    <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-[#8A8497] pointer-events-none" />
                    <input
                      type="text"
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                      placeholder="Search by name or university…"
                      className={`${inputClass} pl-10`}
                      autoComplete="off"
                    />
                  </div>

                  {browseError && (
                    <div className="rounded-xl bg-[#3E1540]/8 px-4 py-3 text-[13px] text-[#3E1540] font-medium">
                      {browseError}
                    </div>
                  )}

                  {browsing && (
                    <div className="text-center py-8 text-[13px] text-[#8A8497]">Loading…</div>
                  )}

                  {!browsing && ministries.length === 0 && !browseError && (
                    <div className="text-center py-8">
                      <p className="text-[14px] font-semibold text-[#13101A] mb-1">No ministries found</p>
                      <p className="text-[13px] text-[#8A8497]">
                        {search ? "Try a different search." : "No public ministries yet."}
                      </p>
                    </div>
                  )}

                  {!browsing && ministries.length > 0 && (
                    <div className="flex flex-col gap-2 max-h-[360px] overflow-y-auto -mx-1 px-1">
                      {ministries.map((m) => (
                        <button
                          key={m.id}
                          onClick={() => selectMinistry(m)}
                          className="flex items-center gap-4 p-4 rounded-xl border border-[#ECE8DE] bg-[#FBF8F2] hover:border-[#3E1540]/30 hover:bg-[#F4F0EA] transition-colors text-left w-full"
                        >
                          <div className="w-10 h-10 rounded-xl bg-[#3E1540] flex items-center justify-center flex-shrink-0">
                            <span style={{ fontFamily: "var(--font-instrument-serif)", fontSize: "18px", color: "#F6F4EF" }}>
                              {m.name[0]}
                            </span>
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-[14px] font-semibold text-[#13101A] truncate">{m.name}</p>
                            <p className="text-[12px] text-[#8A8497] truncate">{m.university}</p>
                            <p className="text-[11px] text-[#8A8497]">{SIZE_LABELS[m.size] ?? m.size} members</p>
                          </div>
                          <ChevronRight className="w-4 h-4 text-[#C4C4C4] flex-shrink-0" />
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        )}

        <p className="text-center text-[13px] text-[#8A8497] mt-6">
          Starting a new ministry?{" "}
          <a href="/onboarding" className="font-semibold text-[#3E1540] hover:underline underline-offset-2">
            Register here
          </a>
        </p>
      </div>
    </div>
  )
}

export default function JoinPage() {
  return (
    <Suspense>
      <JoinContent />
    </Suspense>
  )
}
