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

      {/* ── Editorial header ── */}
      <div className="flex-shrink-0 px-6 pt-12 pb-0 max-w-[520px] mx-auto w-full">
        {/* Logo + wordmark */}
        <div className="flex items-center gap-2.5 mb-8">
          <svg width="22" height="22" viewBox="0 0 100 100" fill="none">
            <circle cx="50" cy="50" r="44" stroke="#3E1540" strokeWidth="6" />
            <rect x="47" y="22" width="6" height="56" fill="#3E1540" />
            <rect x="22" y="47" width="56" height="6" fill="#3E1540" />
          </svg>
          <span style={{ fontFamily: "var(--font-instrument-serif)", fontSize: "22px", color: "#13101A", letterSpacing: "-0.01em", lineHeight: 1 }}>
            Central
          </span>
        </div>
        <p style={{ fontFamily: "ui-monospace,'SF Mono',Menlo,monospace", fontSize: "10px", fontWeight: 600, letterSpacing: "0.12em", color: "#8A8497", textTransform: "uppercase", marginBottom: 10 }}>
          Find your ministry
        </p>
        <h1 style={{ fontFamily: "var(--font-instrument-serif)", fontSize: "40px", color: "#13101A", fontWeight: 400, lineHeight: 1.1, marginBottom: 0 }}>
          Choose a ministry.
        </h1>
      </div>

      {/* ── Tab bar ── */}
      <div className="border-b border-[#E8E2D2] flex-shrink-0 mt-6">
        <div className="max-w-[520px] mx-auto flex px-6">
          {(["browse", "code"] as Tab[]).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className="py-3.5 mr-8 text-[14px] transition-colors"
              style={{
                color: tab === t ? "#2D0F2E" : "#8A8497",
                fontWeight: tab === t ? 600 : 400,
                borderBottom: tab === t ? "2px solid #3E1540" : "2px solid transparent",
                background: "none",
                marginBottom: -1,
              }}
            >
              {t === "browse" ? "Browse" : "Invite code"}
            </button>
          ))}
        </div>
      </div>

      {/* ── Tab content ── */}
      <div className="flex-1 flex flex-col overflow-hidden max-w-[520px] mx-auto w-full">

        {/* Browse tab */}
        {tab === "browse" && (
          <div className="flex flex-col flex-1 overflow-hidden px-6 pt-5 gap-3">

            {/* Search */}
            <div className="relative flex-shrink-0">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-[#8A8497] pointer-events-none" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search by name or university…"
                className="w-full pl-10 pr-4 py-3 rounded-2xl border border-[#E8E2D2] bg-[#FBF8F2] text-[14px] text-[#13101A] placeholder:text-[#C4C4C4] focus:outline-none focus:ring-2 focus:ring-[#3E1540]/20 focus:border-[#3E1540]/40 transition-all"
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
                <div className="flex flex-col gap-3 pb-2">
                  {ministries.map((m) => {
                    const isSelected = selected?.id === m.id
                    const isMember = myMinistryIds.has(m.id)
                    return (
                      <button
                        key={m.id}
                        onClick={() => { setSelected(isSelected ? null : m); setConfirmError(null) }}
                        className="flex items-center gap-4 rounded-2xl border transition-all text-left w-full active:scale-[0.99]"
                        style={{
                          padding: "18px 20px",
                          borderColor: isSelected ? "#3E1540" : "#E8E2D2",
                          borderWidth: isSelected ? "1.5px" : "1px",
                          background: isSelected ? "#F9F5FF" : "#FBF8F2",
                        }}
                      >
                        {/* Plum icon chip */}
                        <div className="flex-shrink-0 flex items-center justify-center" style={{ width: 44, height: 44, borderRadius: 12, background: "#3E1540" }}>
                          <span style={{ fontFamily: "var(--font-instrument-serif)", fontSize: "18px", color: "#F6F4EF", fontWeight: 400 }}>
                            {getInitials(m.name)}
                          </span>
                        </div>

                        {/* Info */}
                        <div className="flex-1 min-w-0">
                          <p style={{ fontWeight: 600, fontSize: "15px", color: "#13101A" }} className="truncate">{m.name}</p>
                          <p style={{ fontSize: "12px", color: "#8A8497", marginTop: 2 }} className="truncate">
                            {m.university} · {SIZE_LABELS[m.size] ?? m.size}
                          </p>
                        </div>

                        {/* Role pill or member badge */}
                        {isMember && (
                          <span style={{ padding: "3px 10px", borderRadius: 999, background: "rgba(62,21,64,0.08)", color: "#3E1540", fontSize: "12px", fontWeight: 500, flexShrink: 0 }}>
                            Member
                          </span>
                        )}

                        {/* Chevron */}
                        <svg width="7" height="12" viewBox="0 0 7 12" fill="none" className="flex-shrink-0" style={{ color: "#C4C4C4" }}>
                          <path d="M1 1l5 5-5 5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                      </button>
                    )
                  })}
                </div>
              )}
            </div>

            {/* Join button pinned at bottom of content area */}
            <div className="flex-shrink-0 pt-4 pb-5 border-t border-[#E8E2D2]">
              <button
                onClick={handleBrowseJoin}
                disabled={!selected || confirming || !!switching}
                className="w-full bg-[#2D0F2E] hover:bg-[#13101A] disabled:opacity-50 text-[#F6F4EF] font-semibold py-3.5 rounded-[12px] active:scale-[0.97] transition-[transform,background-color] duration-150 text-[14px]"
              >
                {switching ? "Switching…" : confirming ? "Joining…" : selected && myMinistryIds.has(selected.id) ? `Go to ${selected.name} →` : selected ? `Join ${selected.name} →` : "Select a ministry"}
              </button>
              <p className="text-center text-[13px] text-[#8A8497] mt-4">
                Starting a new ministry?{" "}
                <a href="/onboarding" className="font-semibold text-[#3E1540] hover:underline underline-offset-2">
                  Register here
                </a>
              </p>
              <p className="text-center mt-5" style={{ fontFamily: "var(--font-instrument-serif)", fontStyle: "italic", fontSize: "13px", color: "#A09A8C" }}>
                &ldquo;Be still and know that I am God.&rdquo; — Psalm 46:10
              </p>
            </div>
          </div>
        )}

        {/* Invite code tab */}
        {tab === "code" && (
          <form onSubmit={handleCodeJoin} className="flex flex-col items-center overflow-y-auto px-6 pt-10 pb-8 gap-5">
            <p className="text-[13px] text-[#8A8497] text-center max-w-[280px] leading-relaxed">
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
                placeholder="ENTER CODE"
                autoComplete="off"
                autoCapitalize="characters"
                className="w-full px-4 py-4 rounded-2xl border border-[#E8E2D2] bg-[#FBF8F2] text-[18px] text-[#13101A] placeholder:text-[#C4C4C4] focus:outline-none focus:ring-2 focus:ring-[#3E1540]/20 focus:border-[#3E1540]/40 transition-all text-center"
                style={{ letterSpacing: "0.18em", textTransform: "uppercase", fontFamily: "ui-monospace,'SF Mono',Menlo,monospace" }}
              />
              <p className="text-[11px] text-[#8A8497] text-center mt-2">Codes are usually 6–8 characters</p>
            </div>

            <button
              type="submit"
              disabled={joining || inviteCode.trim().length < 4}
              className="w-full bg-[#2D0F2E] hover:bg-[#13101A] disabled:opacity-50 text-[#F6F4EF] font-semibold py-3.5 rounded-[12px] active:scale-[0.97] transition-[transform,background-color] duration-150 text-[14px]"
            >
              {joining ? "Joining…" : "Join ministry"}
            </button>

            <button
              type="button"
              onClick={() => setTab("browse")}
              className="text-[13px] text-[#8A8497] hover:text-[#3E1540] transition-colors"
            >
              Don&apos;t have a code?{" "}
              <span className="font-semibold text-[#3E1540]">Browse ministries</span>
            </button>

            <p className="text-[13px] text-[#8A8497]">
              Starting a new ministry?{" "}
              <a href="/onboarding" className="font-semibold text-[#3E1540] hover:underline underline-offset-2">
                Register here
              </a>
            </p>
            <p className="text-center mt-2" style={{ fontFamily: "var(--font-instrument-serif)", fontStyle: "italic", fontSize: "13px", color: "#A09A8C" }}>
              &ldquo;Be still and know that I am God.&rdquo; — Psalm 46:10
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
