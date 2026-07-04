"use client"

import { Suspense, useState, useEffect, useCallback } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { createClient } from "@/lib/supabase"
import { getUserMinistries, getPublicMinistries, joinMinistryById, joinMinistryByCode, setCurrentMinistry } from "@/app/actions/ministry"
import { Spinner, RingCrossLogo } from "@/app/home/components/shared"
import { MonogramChip } from "@/components/central/MonogramChip"
import { PlanSubTabStrip } from "@/components/central/plan-sub-tab-strip"

const SANS  = "var(--font-inter), system-ui, sans-serif"
const SERIF = "var(--font-instrument-serif)"

const mono: React.CSSProperties = {
  fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
  fontSize: 11, letterSpacing: "0.13em", color: "var(--muted-text)", textTransform: "uppercase",
}

const SIZE_LABELS: Record<string, string> = {
  small: "Under 50", medium: "50–100", large: "100+",
}

type MyMinistry     = { id: string; name: string; university: string; role: string }
type PublicMinistry = { id: string; name: string; university: string; size: string; location: string | null }
type Tab = "browse" | "code"

// ─── Avatar ──────────────────────────────────────────────────────
function Avatar({ name }: { name: string }) {
  return (
    <MonogramChip
      initials={name.charAt(0).toUpperCase()}
      style={{ width: 48, height: 48, fontFamily: SERIF, fontSize: 22 }}
    />
  )
}

// ─── Ministry row shell ──────────────────────────────────────────
function MinRow({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      display: "flex", alignItems: "center", gap: 16,
      padding: "16px 18px", border: "1px solid var(--line)", borderRadius: 12,
      background: "#FDFCF8", marginBottom: 12,
    }}>
      {children}
    </div>
  )
}

// ─── Section label ───────────────────────────────────────────────
function SectionLabel({ children }: { children: React.ReactNode }) {
  return <div style={{ ...mono, margin: "26px 0 12px" }}>{children}</div>
}

// ─── Main content ────────────────────────────────────────────────
function MinistriesContent() {
  const router = useRouter()
  const [tab, setTab] = useState<Tab>("browse")
  const [authChecked, setAuthChecked] = useState(false)
  const [isLoggedIn, setIsLoggedIn] = useState(false)

  const [myMinistries, setMyMinistries]   = useState<MyMinistry[]>([])
  const [myIds, setMyIds]                 = useState<Set<string>>(new Set())
  const [loadingMine, setLoadingMine]     = useState(false)
  const [switchingId, setSwitchingId]     = useState<string | null>(null)

  const [search, setSearch]                         = useState("")
  const [publicMinistries, setPublicMinistries]     = useState<PublicMinistry[]>([])
  const [browsingPublic, setBrowsingPublic]         = useState(false)
  const [browseError, setBrowseError]               = useState<string | null>(null)
  const [joiningId, setJoiningId]                   = useState<string | null>(null)
  const [joinError, setJoinError]                   = useState<string | null>(null)

  const [inviteCode, setInviteCode]   = useState("")
  const [joiningCode, setJoiningCode] = useState(false)
  const [codeError, setCodeError]     = useState<string | null>(null)

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
          }
          setLoadingMine(false)
        })
      }
      setAuthChecked(true)
    })
    const urlTab = new URLSearchParams(window.location.search).get("tab") as Tab | null
    if (urlTab && ["browse", "code"].includes(urlTab)) setTab(urlTab)
  }, [])

  function changeTab(t: Tab) {
    setTab(t)
    router.replace(`/ministries?tab=${t}`, { scroll: false })
  }

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
    window.location.assign("/home")
  }

  async function handleJoin(ministry: PublicMinistry) {
    if (!isLoggedIn) { window.location.assign("/signup"); return }
    setJoiningId(ministry.id)
    setJoinError(null)
    const { error } = await joinMinistryById(ministry.id)
    if (error) { setJoinError(error); setJoiningId(null); return }
    window.location.assign("/home")
  }

  async function handleCodeJoin(e: React.FormEvent) {
    e.preventDefault()
    if (!isLoggedIn) { window.location.assign("/login?intent=join"); return }
    if (!inviteCode.trim()) return
    setJoiningCode(true)
    setCodeError(null)
    try {
      const { error } = await joinMinistryByCode(inviteCode)
      if (error) { setCodeError(error); setJoiningCode(false); return }
      window.location.assign("/home")
    } catch {
      setCodeError("Something went wrong. Please try again.")
      setJoiningCode(false)
    }
  }

  return (
    <div style={{ minHeight: "100svh", background: "#FDFCF8", fontFamily: SANS, color: "var(--ink)" }}>

      {/* ── Top bar ── */}
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "22px 48px", borderBottom: "1px solid #EFE9DA",
      }}>
        <Link href="/" aria-label="Central — home" className="transition-opacity hover:opacity-70" style={{ display: "inline-flex", alignItems: "center", gap: 11, textDecoration: "none", color: "inherit" }}>
          <span style={{
            width: 32, height: 32, borderRadius: 9, display: "grid", placeItems: "center",
            background: "var(--plum-2)", flexShrink: 0,
          }}>
            <RingCrossLogo size={18} color="var(--ivory)"/>
          </span>
          <span style={{ fontFamily: SERIF, fontSize: 20, letterSpacing: "-0.01em" }}>Central</span>
        </Link>
        <a href="/home" style={{
          display: "inline-flex", alignItems: "center", gap: 8,
          fontSize: 14, color: "var(--muted-text)", textDecoration: "none",
        }}>
          <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="M19 12H5M12 19l-7-7 7-7"/>
          </svg>
          Back to home
        </a>
      </div>

      {/* ── Content ── */}
      <div style={{ maxWidth: 760, margin: "0 auto", padding: "48px 40px 64px" }}>

        {/* Page header */}
        <div style={mono}>Discover · Central</div>
        <h1 style={{
          fontFamily: SERIF, fontWeight: 600, fontSize: 44, letterSpacing: "-0.02em",
          color: "var(--ink)", margin: "12px 0 8px", lineHeight: 1.1,
        }}>Ministries</h1>
        <p style={{ fontSize: 16, color: "var(--body)", lineHeight: 1.6, margin: 0 }}>
          Your communities, and ones you can join.
        </p>

        {/* Underline tabs */}
        <div style={{ marginTop: 32 }}>
          <PlanSubTabStrip
            flush
            tabs={[{ key: "browse", label: "Browse" }, { key: "code", label: "Invite code" }]}
            active={tab}
            onChange={(k) => changeTab(k as Tab)}
          />
        </div>

        {/* ── Browse panel ── */}
        {tab === "browse" && (
          <div style={{ paddingTop: 26 }}>

            {/* Search */}
            <div style={{
              display: "flex", alignItems: "center", gap: 12,
              padding: "14px 18px", border: "1px solid var(--line-2)", borderRadius: 10,
              background: "#FDFCF8",
            }}>
              <svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="var(--muted-text)" strokeWidth={1.6} strokeLinecap="round" aria-hidden style={{ flexShrink: 0 }}>
                <path d="M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16zM21 21l-4.3-4.3"/>
              </svg>
              <input
                value={search} onChange={e => setSearch(e.target.value)}
                placeholder="Search by name or university…"
                autoComplete="off"
                style={{
                  border: "none", outline: "none", background: "none",
                  fontFamily: SANS, fontSize: 15, color: "var(--ink)", width: "100%",
                }}
              />
            </div>

            {(joinError || browseError) && (
              <div style={{ marginTop: 14, borderRadius: 10, background: "rgba(220,38,38,0.08)", border: "1px solid rgba(220,38,38,0.15)", padding: "10px 14px", fontSize: 13, color: "#B91C1C" }}>
                {joinError ?? browseError}
              </div>
            )}

            {/* Your ministries */}
            {loadingMine && (
              <div style={{ display: "flex", justifyContent: "center", paddingTop: 40 }}>
                <Spinner/>
              </div>
            )}
            {!loadingMine && myMinistries.length > 0 && (
              <>
                <SectionLabel>Your ministries</SectionLabel>
                {myMinistries.map(m => (
                  <MinRow key={m.id}>
                    <Avatar name={m.name}/>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 16, fontWeight: 500, color: "var(--ink)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{m.name}</div>
                      <div style={{ fontSize: 13, color: "var(--muted-text)", marginTop: 3 }}>{m.university}</div>
                    </div>
                    <div style={{ marginLeft: "auto", flexShrink: 0 }}>
                      <button onClick={() => handleGoToMinistry(m.id)} disabled={switchingId === m.id} style={{
                        padding: "8px 16px", border: "1px solid var(--line-2)", borderRadius: 10,
                        background: "transparent", color: "var(--body)",
                        fontFamily: SANS, fontSize: 13, cursor: switchingId === m.id ? "not-allowed" : "pointer",
                        display: "inline-flex", alignItems: "center", gap: 7,
                      }}>
                        {switchingId === m.id
                          ? "Opening…"
                          : <><svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M20 6 9 17l-5-5"/></svg>Open</>
                        }
                      </button>
                    </div>
                  </MinRow>
                ))}
              </>
            )}

            {/* Ministries you can join */}
            {browsingPublic && (
              <div style={{ display: "flex", justifyContent: "center", paddingTop: 40 }}>
                <Spinner/>
              </div>
            )}

            {!browsingPublic && browseable.length > 0 && (
              <>
                <SectionLabel>Ministries you can join</SectionLabel>
                {browseable.map(m => (
                  <MinRow key={m.id}>
                    <Avatar name={m.name}/>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 16, fontWeight: 500, color: "var(--ink)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{m.name}</div>
                      <div style={{ fontSize: 13, color: "var(--muted-text)", marginTop: 3 }}>
                        {m.university}{m.size ? ` · ${SIZE_LABELS[m.size] ?? m.size}` : ""}
                      </div>
                    </div>
                    <div style={{ marginLeft: "auto", flexShrink: 0 }}>
                      <button onClick={() => handleJoin(m)} disabled={joiningId === m.id} style={{
                        padding: "10px 22px", border: "none", borderRadius: 10,
                        background: joiningId === m.id ? "var(--line-2)" : "var(--plum-2)",
                        color: joiningId === m.id ? "#A09A8C" : "#FDFCF8",
                        fontFamily: SANS, fontSize: 14, fontWeight: 500,
                        cursor: joiningId === m.id ? "not-allowed" : "pointer",
                        transition: "opacity .12s ease",
                      }}>
                        {joiningId === m.id ? "Joining…" : "Join"}
                      </button>
                    </div>
                  </MinRow>
                ))}
              </>
            )}

            {!browsingPublic && browseable.length === 0 && !browseError && authChecked && (
              <div style={{ paddingTop: 56, textAlign: "center" }}>
                <p style={{ fontSize: 14, color: "var(--muted-text)", margin: 0 }}>
                  {search
                    ? "No ministries match your search."
                    : myIds.size > 0
                    ? "You've joined all available public ministries."
                    : "No public ministries to show."}
                </p>
                {!search && myIds.size === 0 && (
                  <button type="button" onClick={() => changeTab("code")} style={{
                    marginTop: 8, fontSize: 13, fontWeight: 600, color: "var(--plum-2)",
                    background: "none", border: "none", cursor: "pointer", fontFamily: SANS,
                  }}>
                    Try an invite code instead →
                  </button>
                )}
              </div>
            )}
          </div>
        )}

        {/* ── Invite code panel ── */}
        {tab === "code" && (
          <div style={{ paddingTop: 26 }}>
            <p style={{ fontSize: 15, color: "var(--body)", lineHeight: 1.6, margin: "0 0 22px", maxWidth: 480 }}>
              Have an invite code from a ministry leader? Enter it below to join their workspace directly.
            </p>

            {codeError && (
              <div style={{ marginBottom: 16, borderRadius: 10, background: "rgba(220,38,38,0.08)", border: "1px solid rgba(220,38,38,0.15)", padding: "10px 14px", fontSize: 13, color: "#B91C1C" }}>
                {codeError}
              </div>
            )}

            <form onSubmit={handleCodeJoin}>
              <label style={{ ...mono, display: "block", marginBottom: 10 }}>Invite code</label>
              <input
                value={inviteCode}
                onChange={e => setInviteCode(e.target.value.toUpperCase())}
                placeholder="MERCY24"
                autoComplete="off" autoCapitalize="characters" maxLength={10}
                style={{
                  width: "100%", padding: "16px 18px",
                  border: "1px solid var(--line-2)", borderRadius: 10, background: "#FDFCF8",
                  fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
                  fontSize: 22, letterSpacing: "4px", textTransform: "uppercase",
                  color: "var(--ink)", outline: "none", boxSizing: "border-box",
                }}
              />
              <div>
                <button type="submit" disabled={joiningCode || inviteCode.trim().length < 4} style={{
                  marginTop: 20, padding: "14px 28px", border: "none", borderRadius: 10,
                  background: (joiningCode || inviteCode.trim().length < 4) ? "var(--line-2)" : "var(--plum-2)",
                  color: (joiningCode || inviteCode.trim().length < 4) ? "#A09A8C" : "#FDFCF8",
                  fontFamily: SANS, fontSize: 15, fontWeight: 500,
                  cursor: (joiningCode || inviteCode.trim().length < 4) ? "not-allowed" : "pointer",
                }}>
                  {joiningCode ? "Joining…" : "Join ministry"}
                </button>
              </div>
              <p style={{ fontSize: 13, color: "var(--muted-text)", marginTop: 14 }}>
                Codes are case-insensitive. Ask your ministry&apos;s admin or leader if you don&apos;t have one.
              </p>
            </form>
          </div>
        )}

        {/* ── Footer register row ── */}
        <div style={{
          marginTop: 34, paddingTop: 26, borderTop: "1px solid var(--line)",
          display: "flex", alignItems: "center", justifyContent: "space-between", gap: 20,
        }}>
          <span style={{ fontSize: 14, color: "var(--body)" }}>Leading a ministry that isn&apos;t here yet?</span>
          <button type="button" onClick={() => router.push("/register-ministry")} style={{
            padding: "9px 18px", border: "1px solid var(--plum)", borderRadius: 10,
            background: "transparent", color: "var(--plum)",
            fontFamily: SANS, fontSize: 13, fontWeight: 500, cursor: "pointer",
          }}>
            Register a ministry →
          </button>
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
