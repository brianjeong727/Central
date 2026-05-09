"use client"

import { Suspense, useState, useEffect, useCallback } from "react"
import { Search } from "lucide-react"
import { joinMinistryByCode, getPublicMinistries, joinMinistryById, getUserMinistries, setCurrentMinistry } from "@/app/actions/ministry"
import { Spinner } from "@/app/home/components/shared"

const SIZE_LABELS: Record<string, string> = {
  small: "Under 50",
  medium: "50–100",
  large: "100+",
}

type Ministry = { id: string; name: string; university: string; size: string; location: string | null }
type Tab = "browse" | "code"

function getInitials(name: string) {
  return name.split(/\s+/).map((w: string) => w[0]).join("").slice(0, 2).toUpperCase()
}

function readPendingJoinState(): { tab: Tab; inviteCode: string; selected: Ministry | null } {
  if (typeof window === "undefined") return { tab: "browse", inviteCode: "", selected: null }

  const inviteCode = sessionStorage.getItem("pending_invite_code") ?? ""
  const browseRaw = sessionStorage.getItem("pending_browse_ministry")
  let selected: Ministry | null = null

  if (browseRaw) {
    try {
      selected = JSON.parse(browseRaw) as Ministry
    } catch {
      selected = null
    }
  }

  return { tab: inviteCode ? "code" : "browse", inviteCode, selected }
}

function JoinContent() {
  const pendingJoin = useState(readPendingJoinState)[0]
  const [tab, setTab] = useState<Tab>(pendingJoin.tab)

  // Invite code state
  const [inviteCode, setInviteCode] = useState(pendingJoin.inviteCode)
  const [joining, setJoining] = useState(false)
  const [codeError, setCodeError] = useState<string | null>(null)

  // Browse state
  const [search, setSearch] = useState("")
  const [ministries, setMinistries] = useState<Ministry[]>([])
  const [browsing, setBrowsing] = useState(false)
  const [browseError, setBrowseError] = useState<string | null>(null)
  const [selected, setSelected] = useState<Ministry | null>(pendingJoin.selected)
  const [confirming, setConfirming] = useState(false)
  const [confirmError, setConfirmError] = useState<string | null>(null)
  const [myMinistryIds, setMyMinistryIds] = useState<Set<string>>(new Set())
  const [switching, setSwitching] = useState<string | null>(null)

  // Clear consumed sessionStorage handoff + load user's existing memberships
  useEffect(() => {
    sessionStorage.removeItem("pending_invite_code")
    sessionStorage.removeItem("pending_browse_ministry")
    getUserMinistries().then(({ data }) => {
      if (data) setMyMinistryIds(new Set(data.map((m) => m.id)))
    })
  }, [])

  const fetchMinistries = useCallback(async (q: string) => {
    setBrowsing(true)
    setBrowseError(null)
    const { data, error } = await getPublicMinistries(q)
    if (error) setBrowseError(error)
    else setMinistries(data ?? [])
    setBrowsing(false)
  }, [])

  useEffect(() => {
    if (tab !== "browse") return
    const t = setTimeout(() => fetchMinistries(search), 300)
    return () => clearTimeout(t)
  }, [tab, search, fetchMinistries])

  async function handleCodeJoin(e: React.FormEvent) {
    e.preventDefault()
    if (!inviteCode.trim()) return
    setJoining(true)
    setCodeError(null)
    try {
      const { error } = await joinMinistryByCode(inviteCode)
      if (error) { setCodeError(error); setJoining(false); return }
      window.location.assign("/home")
    } catch {
      setCodeError("Something went wrong. Please try again.")
      setJoining(false)
    }
  }

  async function handleBrowseJoin() {
    if (!selected) return
    if (myMinistryIds.has(selected.id)) {
      setSwitching(selected.id)
      const { error } = await setCurrentMinistry(selected.id)
      if (error) { setConfirmError(error); setSwitching(null); return }
      window.location.assign("/home")
      return
    }
    setConfirming(true)
    setConfirmError(null)
    const { error } = await joinMinistryById(selected.id)
    if (error) { setConfirmError(error); setConfirming(false); return }
    window.location.assign("/home")
  }

  return (
    <div className="flex flex-col bg-[#FBF8F2]" style={{ height: "100svh" }}>

      {/* ── Plum header ── */}
      <div className="bg-[#3E1540] px-6 pt-12 pb-8 flex-shrink-0">
        <div className="max-w-[480px] mx-auto">
          {/* Logo + wordmark */}
          <div className="flex items-center gap-2.5 mb-6">
            <svg width="26" height="26" viewBox="0 0 100 100" fill="none">
              <circle cx="50" cy="50" r="44" stroke="#F6F4EF" strokeWidth="6" />
              <rect x="47" y="22" width="6" height="56" fill="#F6F4EF" />
              <rect x="22" y="47" width="56" height="6" fill="#F6F4EF" />
            </svg>
            <span style={{ fontFamily: "var(--font-instrument-serif)", fontSize: "26px", color: "#F6F4EF", letterSpacing: "-0.01em", lineHeight: 1 }}>
              Central
            </span>
          </div>
          <p style={{ fontSize: "10px", fontWeight: 600, letterSpacing: "0.12em", color: "rgba(246,244,239,0.5)", textTransform: "uppercase", marginBottom: 8 }}>
            Join a ministry
          </p>
          <h1 style={{ fontFamily: "var(--font-instrument-serif)", fontSize: "34px", color: "#F6F4EF", fontWeight: 400, lineHeight: 1.15, marginBottom: 8 }}>
            Find your community.
          </h1>
          <p style={{ fontSize: "13px", color: "rgba(246,244,239,0.6)", lineHeight: 1.5 }}>
            Browse public ministries or enter a private invite code from your leader.
          </p>
        </div>
      </div>

      {/* ── Tab bar ── */}
      <div className="bg-white border-b border-[#ECE8DE] flex-shrink-0">
        <div className="max-w-[480px] mx-auto flex">
          {(["browse", "code"] as Tab[]).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className="flex-1 py-3.5 text-[13px] font-semibold transition-colors"
              style={{
                color: tab === t ? "#3E1540" : "#8A8497",
                borderBottom: tab === t ? "2px solid #3E1540" : "2px solid transparent",
                background: "none",
                marginBottom: -1,
              }}
            >
              {t === "browse" ? "Browse ministries" : "Private invite code"}
            </button>
          ))}
        </div>
      </div>

      {/* ── Tab content ── */}
      <div className="flex-1 flex flex-col overflow-hidden max-w-[480px] mx-auto w-full">

        {/* Browse tab */}
        {tab === "browse" && (
          <div className="flex flex-col flex-1 overflow-hidden px-4 pt-4 gap-3">

            {/* Search */}
            <div className="relative flex-shrink-0">
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

            {browseError && (
              <div className="flex-shrink-0 rounded-xl bg-[#3E1540]/8 px-4 py-3 text-[13px] text-[#3E1540] font-medium">
                {browseError}
              </div>
            )}
            {confirmError && (
              <div className="flex-shrink-0 rounded-xl bg-[#3E1540]/8 px-4 py-3 text-[13px] text-[#3E1540] font-medium">
                {confirmError}
              </div>
            )}

            {/* Scrollable list */}
            <div className="flex-1 overflow-y-auto min-h-0">
              {browsing && (
                <div className="flex justify-center py-10"><Spinner /></div>
              )}

              {!browsing && ministries.length === 0 && !browseError && (
                <div className="flex flex-col items-center py-14">
                  <div className="w-12 h-12 rounded-full bg-[#F4F1E8] flex items-center justify-center mb-3">
                    <Search className="w-5 h-5 text-[#8A8497]" />
                  </div>
                  <p className="text-[14px] font-semibold text-[#13101A] mb-1">No ministries found</p>
                  <p className="text-[13px] text-[#8A8497]">
                    {search ? "Try a different search." : "No public ministries yet."}
                  </p>
                </div>
              )}

              {!browsing && ministries.length > 0 && (
                <div className="flex flex-col gap-2 pb-2">
                  {ministries.map((m) => {
                    const isSelected = selected?.id === m.id
                    const isMember = myMinistryIds.has(m.id)
                    return (
                      <button
                        key={m.id}
                        onClick={() => { setSelected(isSelected ? null : m); setConfirmError(null) }}
                        className="flex items-center gap-3.5 rounded-xl border transition-all text-left w-full"
                        style={{
                          padding: "16px 18px",
                          borderColor: isMember ? "#3E1540" : isSelected ? "#3E1540" : "#ECE8DE",
                          borderWidth: isMember || isSelected ? "1.5px" : "1px",
                          background: isMember ? "#F4F0FF" : isSelected ? "#FBF8F2" : "#FFFFFF",
                        }}
                      >
                        {/* Initials icon */}
                        <div className="w-10 h-10 rounded-[10px] bg-[#F4F1E8] flex items-center justify-center flex-shrink-0">
                          <span style={{ fontFamily: "var(--font-instrument-serif)", fontSize: "16px", color: "#3E1540", fontWeight: 400 }}>
                            {getInitials(m.name)}
                          </span>
                        </div>

                        {/* Info */}
                        <div className="flex-1 min-w-0">
                          <p className="text-[14px] font-medium text-[#13101A] truncate">{m.name}</p>
                          <p className="text-[12px] text-[#8A8497] truncate">
                            {m.university} · {SIZE_LABELS[m.size] ?? m.size}
                          </p>
                          {isMember && (
                            <p className="text-[11px] font-semibold text-[#3E1540] mt-0.5">Already a member</p>
                          )}
                        </div>

                        {/* Right indicator */}
                        {isMember ? (
                          <div className="w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0 bg-[#3E1540]">
                            <svg width="10" height="8" viewBox="0 0 10 8" fill="none">
                              <path d="M1 4L3.5 6.5L9 1" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                            </svg>
                          </div>
                        ) : (
                          <div
                            className="w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0 transition-all"
                            style={{
                              border: isSelected ? "none" : "1.5px solid #ECE8DE",
                              background: isSelected ? "#3E1540" : "transparent",
                            }}
                          >
                            {isSelected && (
                              <svg width="10" height="8" viewBox="0 0 10 8" fill="none">
                                <path d="M1 4L3.5 6.5L9 1" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                              </svg>
                            )}
                          </div>
                        )}
                      </button>
                    )
                  })}
                </div>
              )}
            </div>

            {/* Join button pinned at bottom of content area */}
            <div className="flex-shrink-0 pt-3 pb-5 border-t border-[#ECE8DE]">
              <button
                onClick={handleBrowseJoin}
                disabled={!selected || confirming || !!switching}
                className="w-full bg-[#3E1540] hover:bg-[#2D0F2E] disabled:opacity-40 text-[#F6F4EF] font-bold py-3.5 rounded-[10px] transition-colors text-[14px]"
              >
                {switching ? "Switching…" : confirming ? "Joining…" : selected && myMinistryIds.has(selected.id) ? `Go to ${selected.name} →` : selected ? `Join ${selected.name} →` : "Select a ministry to join"}
              </button>
              <p className="text-center text-[13px] text-[#8A8497] mt-4">
                Starting a new ministry?{" "}
                <a href="/onboarding" className="font-semibold text-[#3E1540] hover:underline underline-offset-2">
                  Register here
                </a>
              </p>
            </div>
          </div>
        )}

        {/* Invite code tab */}
        {tab === "code" && (
          <form onSubmit={handleCodeJoin} className="flex flex-col items-center overflow-y-auto px-4 pt-10 pb-8 gap-5">
            <p className="text-[13px] text-[#8A8497] text-center max-w-[260px] leading-relaxed">
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
              disabled={joining || inviteCode.trim().length < 4}
              className="w-full bg-[#3E1540] hover:bg-[#2D0F2E] disabled:opacity-40 text-[#F6F4EF] font-bold py-3.5 rounded-[10px] transition-colors text-[14px]"
            >
              {joining ? "Joining…" : "Join ministry"}
            </button>

            <button
              type="button"
              onClick={() => setTab("browse")}
              className="text-[13px] text-[#8A8497] hover:text-[#3E1540] transition-colors"
            >
              Don&apos;t have a code?{" "}
              <span className="font-semibold text-[#3E1540]">Browse public ministries</span>
            </button>

            <p className="text-[13px] text-[#8A8497]">
              Starting a new ministry?{" "}
              <a href="/onboarding" className="font-semibold text-[#3E1540] hover:underline underline-offset-2">
                Register here
              </a>
            </p>
          </form>
        )}
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
