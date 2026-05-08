"use client"

import { Suspense, useState, useEffect, useCallback } from "react"
import { Search } from "lucide-react"
import { createClient } from "@/lib/supabase"
import { getUserMinistries, getPublicMinistries, joinMinistryById, joinMinistryByCode, setCurrentMinistry } from "@/app/actions/ministry"
import { Spinner } from "@/app/home/components/shared"

const SIZE_LABELS: Record<string, string> = {
  small: "Under 50",
  medium: "50–100",
  large: "100+",
}

type MyMinistry = { id: string; name: string; university: string; role: string }
type PublicMinistry = { id: string; name: string; university: string; size: string; location: string | null }
type Tab = "mine" | "browse" | "code"

function getInitials(name: string) {
  return name.split(/\s+/).map((w: string) => w[0]).join("").slice(0, 2).toUpperCase()
}

function MinistriesContent() {
  const [tab, setTab] = useState<Tab>("browse")
  const [authChecked, setAuthChecked] = useState(false)
  const [isLoggedIn, setIsLoggedIn] = useState(false)

  // My ministries
  const [myMinistries, setMyMinistries] = useState<MyMinistry[]>([])
  const [myIds, setMyIds] = useState<Set<string>>(new Set())
  const [loadingMine, setLoadingMine] = useState(false)

  const [switchingId, setSwitchingId] = useState<string | null>(null)

  // Browse
  const [search, setSearch] = useState("")
  const [publicMinistries, setPublicMinistries] = useState<PublicMinistry[]>([])
  const [browsingPublic, setBrowsingPublic] = useState(false)
  const [browseError, setBrowseError] = useState<string | null>(null)
  const [joiningId, setJoiningId] = useState<string | null>(null)
  const [joinError, setJoinError] = useState<string | null>(null)

  // Invite code
  const [inviteCode, setInviteCode] = useState("")
  const [joiningCode, setJoiningCode] = useState(false)
  const [codeError, setCodeError] = useState<string | null>(null)

  useEffect(() => {
    const supabase = createClient()
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (user) {
        setIsLoggedIn(true)
        setLoadingMine(true)
        getUserMinistries().then(({ data }) => {
          if (data && data.length > 0) {
            setMyMinistries(data)
            setMyIds(new Set(data.map((m) => m.id)))
            setTab("mine")
          }
          setLoadingMine(false)
        })
      }
      setAuthChecked(true)
    })
  }, [])

  const fetchPublic = useCallback(async (q: string) => {
    setBrowsingPublic(true)
    setBrowseError(null)
    const { data, error } = await getPublicMinistries(q)
    if (error) setBrowseError(error)
    else setPublicMinistries(data ?? [])
    setBrowsingPublic(false)
  }, [])

  useEffect(() => {
    if (tab !== "browse") return
    const t = setTimeout(() => fetchPublic(search), 300)
    return () => clearTimeout(t)
  }, [tab, search, fetchPublic])

  const browseable = publicMinistries.filter((m) => !myIds.has(m.id))

  async function handleGoToMinistry(id: string) {
    setSwitchingId(id)
    await setCurrentMinistry(id)
    window.location.href = "/home"
  }

  async function handleJoin(ministry: PublicMinistry) {
    if (!isLoggedIn) { window.location.href = "/signup"; return }
    setJoiningId(ministry.id)
    setJoinError(null)
    const { error } = await joinMinistryById(ministry.id)
    if (error) { setJoinError(error); setJoiningId(null); return }
    window.location.href = "/home"
  }

  async function handleCodeJoin(e: React.FormEvent) {
    e.preventDefault()
    if (!isLoggedIn) { window.location.href = "/login?intent=join"; return }
    if (!inviteCode.trim()) return
    setJoiningCode(true)
    setCodeError(null)
    try {
      const { error } = await joinMinistryByCode(inviteCode)
      if (error) { setCodeError(error); setJoiningCode(false); return }
      window.location.href = "/home"
    } catch {
      setCodeError("Something went wrong. Please try again.")
      setJoiningCode(false)
    }
  }

  // Only show "My ministries" tab once we know they have at least one
  const showMineTab = authChecked && myMinistries.length > 0

  const tabs: { key: Tab; label: string }[] = [
    ...(showMineTab ? [{ key: "mine" as Tab, label: "My ministries" }] : []),
    { key: "browse", label: "Browse ministries" },
    { key: "code", label: "Invite code" },
  ]

  return (
    <div className="flex flex-col bg-[#FBF8F2]" style={{ minHeight: "100svh" }}>

      {/* ── Plum header ── */}
      <div className="bg-[#3E1540] px-6 pt-12 pb-8 flex-shrink-0">
        <div className="max-w-[860px] mx-auto">
          <a href="/landing" className="inline-flex items-center gap-2.5 mb-6" style={{ textDecoration: "none" }}>
            <svg width="24" height="24" viewBox="0 0 100 100" fill="none">
              <circle cx="50" cy="50" r="44" stroke="#F6F4EF" strokeWidth="6" />
              <rect x="47" y="22" width="6" height="56" fill="#F6F4EF" />
              <rect x="22" y="47" width="56" height="6" fill="#F6F4EF" />
            </svg>
            <span style={{ fontFamily: "var(--font-instrument-serif)", fontSize: "22px", color: "#F6F4EF", letterSpacing: "-0.01em", lineHeight: 1 }}>
              Central
            </span>
          </a>
          <h1 style={{ fontFamily: "var(--font-instrument-serif)", fontSize: "38px", color: "#F6F4EF", fontWeight: 400, lineHeight: 1.15, marginBottom: 8 }}>
            Ministries
          </h1>
          <p style={{ fontSize: "13px", color: "rgba(246,244,239,0.6)", lineHeight: 1.5 }}>
            Your communities, and ones you can join.
          </p>
        </div>
      </div>

      {/* ── Tab bar ── */}
      <div className="bg-white border-b border-[#ECE8DE] flex-shrink-0">
        <div className="max-w-[860px] mx-auto flex">
          {tabs.map(({ key, label }) => (
            <button
              key={key}
              onClick={() => setTab(key)}
              className="py-3.5 text-[13px] font-semibold transition-colors"
              style={{
                paddingLeft: 20,
                paddingRight: 20,
                color: tab === key ? "#3E1540" : "#8A8497",
                borderBottom: tab === key ? "2px solid #3E1540" : "2px solid transparent",
                background: "none",
                marginBottom: -1,
                whiteSpace: "nowrap",
              }}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* ── Content ── */}
      <div className="flex-1 max-w-[860px] mx-auto w-full px-4 py-6">

        {/* My ministries tab */}
        {tab === "mine" && (
          <div>
            {loadingMine && <div className="flex justify-center py-12"><Spinner /></div>}
            {!loadingMine && (
              <div className="flex flex-col gap-3">
                {myMinistries.map((m) => (
                  <div key={m.id} className="flex items-center gap-3.5 bg-white rounded-xl border border-[#ECE8DE] px-[18px] py-4">
                    <div className="w-10 h-10 rounded-[10px] bg-[#F4F1E8] flex items-center justify-center flex-shrink-0">
                      <span style={{ fontFamily: "var(--font-instrument-serif)", fontSize: "16px", color: "#3E1540", fontWeight: 400 }}>
                        {getInitials(m.name)}
                      </span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-[14px] font-medium text-[#13101A] truncate">{m.name}</p>
                      <p className="text-[12px] text-[#8A8497] truncate">{m.university}</p>
                    </div>
                    <button
                      onClick={() => handleGoToMinistry(m.id)}
                      disabled={switchingId === m.id}
                      className="flex-shrink-0 px-4 py-2 bg-[#3E1540] text-[#F6F4EF] text-[13px] font-semibold rounded-lg hover:bg-[#2D0F2E] disabled:opacity-60 transition-colors"
                    >
                      {switchingId === m.id ? "Opening…" : "Go to ministry"}
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Browse ministries tab */}
        {tab === "browse" && (
          <div className="flex flex-col gap-4">
            <div className="relative">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-[#8A8497] pointer-events-none" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search by name or university…"
                className="w-full pl-10 pr-4 py-3 rounded-xl border border-[#ECE8DE] bg-white text-[14px] text-[#13101A] placeholder:text-[#C4C4C4] focus:outline-none focus:ring-2 focus:ring-[#3E1540]/20 focus:border-[#3E1540]/40 transition-all"
                autoComplete="off"
              />
            </div>

            {(joinError || browseError) && (
              <div className="rounded-xl bg-[#3E1540]/8 px-4 py-3 text-[13px] text-[#3E1540] font-medium">
                {joinError ?? browseError}
              </div>
            )}

            {browsingPublic && <div className="flex justify-center py-10"><Spinner /></div>}

            {!browsingPublic && browseable.length === 0 && !browseError && (
              <div className="flex flex-col items-center py-14 text-center">
                <div className="w-12 h-12 rounded-full bg-[#F4F1E8] flex items-center justify-center mb-3">
                  <Search className="w-5 h-5 text-[#8A8497]" />
                </div>
                <p className="text-[14px] font-semibold text-[#13101A] mb-1">No ministries found</p>
                <p className="text-[13px] text-[#8A8497]">
                  {search ? "Try a different search." : myIds.size > 0 ? "You've joined all available public ministries." : "No public ministries are listed yet."}
                </p>
              </div>
            )}

            {!browsingPublic && browseable.length > 0 && (
              <div className="flex flex-col gap-2">
                {browseable.map((m) => (
                  <div key={m.id} className="flex items-center gap-3.5 bg-white rounded-xl border border-[#ECE8DE] px-[18px] py-4">
                    <div className="w-10 h-10 rounded-[10px] bg-[#F4F1E8] flex items-center justify-center flex-shrink-0">
                      <span style={{ fontFamily: "var(--font-instrument-serif)", fontSize: "16px", color: "#3E1540", fontWeight: 400 }}>
                        {getInitials(m.name)}
                      </span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-[14px] font-medium text-[#13101A] truncate">{m.name}</p>
                      <p className="text-[12px] text-[#8A8497] truncate">{m.university} · {SIZE_LABELS[m.size] ?? m.size}</p>
                    </div>
                    <button
                      onClick={() => handleJoin(m)}
                      disabled={joiningId === m.id}
                      className="flex-shrink-0 px-4 py-2 bg-[#3E1540] text-[#F6F4EF] text-[13px] font-semibold rounded-lg hover:bg-[#2D0F2E] disabled:opacity-50 transition-colors"
                    >
                      {joiningId === m.id ? "Joining…" : "Join"}
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Invite code tab */}
        {tab === "code" && (
          <form onSubmit={handleCodeJoin} className="flex flex-col items-center pt-10 pb-8 gap-5 max-w-[400px] mx-auto">
            <p className="text-[13px] text-[#8A8497] text-center leading-relaxed">
              Enter the invite code shared by your ministry leader.
            </p>

            {codeError && (
              <div className="w-full rounded-xl bg-[#3E1540]/8 px-4 py-3 text-[13px] text-[#3E1540] font-medium text-center">
                {codeError}
              </div>
            )}

            <div className="w-full">
              <input
                type="text"
                value={inviteCode}
                onChange={(e) => setInviteCode(e.target.value.toUpperCase())}
                placeholder="Enter invite code"
                autoComplete="off"
                autoCapitalize="characters"
                className="w-full px-4 py-4 rounded-xl border border-[#ECE8DE] bg-white text-[18px] text-[#13101A] placeholder:text-[#C4C4C4] focus:outline-none focus:ring-2 focus:ring-[#3E1540]/20 focus:border-[#3E1540]/40 transition-all text-center font-mono"
                style={{ letterSpacing: "0.15em", textTransform: "uppercase" }}
              />
              <p className="text-[11px] text-[#8A8497] text-center mt-2">Codes are usually 6–8 characters</p>
            </div>

            <button
              type="submit"
              disabled={joiningCode || inviteCode.trim().length < 4}
              className="w-full bg-[#3E1540] hover:bg-[#2D0F2E] disabled:opacity-40 text-[#F6F4EF] font-bold py-3.5 rounded-[10px] transition-colors text-[14px]"
            >
              {joiningCode ? "Joining…" : "Join ministry"}
            </button>

            {!isLoggedIn && authChecked && (
              <p className="text-[13px] text-[#8A8497] text-center">
                You&apos;ll be asked to sign in before joining.
              </p>
            )}

            <button
              type="button"
              onClick={() => setTab("browse")}
              className="text-[13px] text-[#8A8497] hover:text-[#3E1540] transition-colors"
            >
              Don&apos;t have a code?{" "}
              <span className="font-semibold text-[#3E1540]">Browse public ministries</span>
            </button>
          </form>
        )}
      </div>

      {/* Footer */}
      <div className="border-t border-[#ECE8DE] px-6 py-5">
        <div className="max-w-[860px] mx-auto flex items-center gap-6">
          <a href="/landing" style={{ fontSize: 13, color: "#8A8497", textDecoration: "none" }}>← Back to home</a>
          <a href="/onboarding" style={{ fontSize: 13, color: "#8A8497", textDecoration: "none" }}>Register a ministry</a>
        </div>
      </div>
    </div>
  )
}

export default function MinistriesPage() {
  return (
    <Suspense>
      <MinistriesContent />
    </Suspense>
  )
}
