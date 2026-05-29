"use client"

import { Suspense, useState, useEffect, useCallback } from "react"
import { useRouter } from "next/navigation"
import { Search } from "lucide-react"
import { createClient } from "@/lib/supabase"
import { getUserMinistries, getPublicMinistries, joinMinistryById, joinMinistryByCode, setCurrentMinistry } from "@/app/actions/ministry"
import { Spinner } from "@/app/home/components/shared"

// ─── design tokens ──────────────────────────────────────────────
const SANS = "var(--font-inter), system-ui, sans-serif"
const SERIF = "var(--font-instrument-serif)"

const mono: React.CSSProperties = {
  fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
  fontSize: 11, letterSpacing: "0.13em", color: "#8A8497", textTransform: "uppercase",
}

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

// ─── data ────────────────────────────────────────────────────────
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
  const router = useRouter()
  const [tab, setTab] = useState<Tab>("browse")
  const [authChecked, setAuthChecked] = useState(false)
  const [isLoggedIn, setIsLoggedIn] = useState(false)

  const [myMinistries, setMyMinistries] = useState<MyMinistry[]>([])
  const [myIds, setMyIds] = useState<Set<string>>(new Set())
  const [loadingMine, setLoadingMine] = useState(false)
  const [switchingId, setSwitchingId] = useState<string | null>(null)

  const [search, setSearch] = useState("")
  const [publicMinistries, setPublicMinistries] = useState<PublicMinistry[]>([])
  const [browsingPublic, setBrowsingPublic] = useState(false)
  const [browseError, setBrowseError] = useState<string | null>(null)
  const [confirmingId, setConfirmingId] = useState<string | null>(null)
  const [joiningId, setJoiningId] = useState<string | null>(null)
  const [joinError, setJoinError] = useState<string | null>(null)

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
            const urlTab = new URLSearchParams(window.location.search).get("tab") as Tab | null
            if (!urlTab) setTab("mine")
          }
          setLoadingMine(false)
        })
      }
      setAuthChecked(true)
    })
    const urlTab = new URLSearchParams(window.location.search).get("tab") as Tab | null
    if (urlTab && ["mine", "browse", "code"].includes(urlTab)) setTab(urlTab)
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
    setConfirmingId(null)
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

  const showMineTab = authChecked && myMinistries.length > 0

  const tabs: { key: Tab; label: string }[] = [
    ...(showMineTab ? [{ key: "mine" as Tab, label: "My ministries" }] : []),
    { key: "browse", label: "Browse" },
    { key: "code", label: "Invite code" },
  ]

  return (
    <div style={{ display: "flex", flexDirection: "column", background: "#FBF8F2", minHeight: "100svh", fontFamily: SANS }}>

      {/* ── Plum hero band ── */}
      <div style={{
        position: "relative", overflow: "hidden", color: "#FBF8F2",
        background: "radial-gradient(120% 130% at 0% 0%, #7A4080 0%, #5A2860 50%, #3E1540 100%)",
        padding: "40px 0 36px", flexShrink: 0,
      }}>
        <div aria-hidden style={{
          position: "absolute", inset: 0, opacity: 0.16, pointerEvents: "none",
          background: "radial-gradient(rgba(251,248,242,0.6) 1px, transparent 1.4px) 0 0 / 14px 14px",
        }}/>
        <div style={{ position: "relative", maxWidth: 860, margin: "0 auto", padding: "0 24px" }}>
          <a href="/" style={{ textDecoration: "none" }}>
            <Wordmark tone="plum"/>
          </a>
          <h1 style={{
            fontFamily: SERIF, fontWeight: 400, color: "#FBF8F2",
            fontSize: 44, letterSpacing: "-0.03em", lineHeight: 1.08,
            margin: "24px 0 8px",
          }}>
            Ministries
          </h1>
          <p style={{ fontSize: 14, color: "rgba(251,248,242,0.65)", lineHeight: 1.5, margin: 0 }}>
            Your communities, and ones you can join.
          </p>
        </div>
      </div>

      {/* ── Tab bar ── */}
      <div style={{ background: "#FBF8F2", borderBottom: "1px solid #E8E2D2", flexShrink: 0 }}>
        <div style={{ maxWidth: 860, margin: "0 auto", display: "flex", padding: "0 24px" }}>
          {tabs.map(({ key, label }) => (
            <button key={key} onClick={() => changeTab(key)} style={{
              paddingTop: 14, paddingBottom: 14, paddingLeft: 0, paddingRight: 0,
              marginRight: 28, fontSize: 13, fontWeight: tab === key ? 600 : 400,
              fontFamily: SANS, background: "none", cursor: "pointer",
              color: tab === key ? "#2D0F2E" : "#8A8497",
              border: "none", borderBottom: "2px solid",
              borderBottomColor: tab === key ? "#2D0F2E" : "transparent",
              marginBottom: -1, transition: "color .15s", whiteSpace: "nowrap",
            }}>
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* ── Content ── */}
      <div style={{ flex: 1, maxWidth: 860, margin: "0 auto", width: "100%", padding: "24px 16px" }}>

        {/* My ministries tab */}
        {tab === "mine" && (
          <div>
            {loadingMine && <div style={{ display: "flex", justifyContent: "center", paddingTop: 48 }}><Spinner /></div>}
            {!loadingMine && (
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {myMinistries.map((m) => (
                  <div key={m.id} style={{
                    display: "flex", alignItems: "center", gap: 14,
                    background: "#FBF8F2", borderRadius: 14,
                    border: "1px solid #E2DDCF", padding: "16px 18px",
                  }}>
                    <div style={{
                      width: 42, height: 42, borderRadius: 12, flexShrink: 0,
                      background: "#F1ECDE", color: "#3E1540",
                      display: "grid", placeItems: "center",
                    }}>
                      <span style={{ fontFamily: SERIF, fontSize: 16, fontWeight: 400 }}>
                        {getInitials(m.name)}
                      </span>
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <p style={{ fontSize: 14, fontWeight: 500, color: "#13101A", margin: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{m.name}</p>
                      <p style={{ fontSize: 12, color: "#8A8497", margin: "2px 0 0", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{m.university}</p>
                    </div>
                    <button onClick={() => handleGoToMinistry(m.id)} disabled={switchingId === m.id} style={{
                      flexShrink: 0, padding: "9px 18px", borderRadius: 10,
                      background: switchingId === m.id ? "#E2DDCF" : "#2D0F2E",
                      color: switchingId === m.id ? "#A09A8C" : "#FBF8F2",
                      fontSize: 13, fontWeight: 500, fontFamily: SANS,
                      border: "none", cursor: switchingId === m.id ? "not-allowed" : "pointer",
                      transition: "background .15s ease",
                    }}>
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
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            {/* Search */}
            <div style={{ position: "relative" }}>
              <Search style={{ position: "absolute", left: 14, top: "50%", transform: "translateY(-50%)", width: 16, height: 16, color: "#8A8497", pointerEvents: "none" }}/>
              <input
                type="text" value={search} onChange={(e) => setSearch(e.target.value)}
                placeholder="Search by name or university…" autoComplete="off"
                style={{
                  width: "100%", paddingLeft: 42, paddingRight: 16, paddingTop: 12, paddingBottom: 12,
                  borderRadius: 12, border: "1px solid #E2DDCF", background: "#FBF8F2",
                  fontSize: 14, color: "#13101A", fontFamily: SANS, outline: "none",
                  boxSizing: "border-box",
                }}
              />
            </div>

            {(joinError || browseError) && (
              <div style={{ borderRadius: 12, background: "rgba(62,21,64,0.07)", padding: "10px 14px", fontSize: 13, color: "#3E1540", fontWeight: 500 }}>
                {joinError ?? browseError}
              </div>
            )}

            {browsingPublic && <div style={{ display: "flex", justifyContent: "center", paddingTop: 40 }}><Spinner /></div>}

            {!browsingPublic && browseable.length === 0 && !browseError && (
              <div style={{ display: "flex", flexDirection: "column", alignItems: "center", paddingTop: 56, textAlign: "center" }}>
                <div style={{ width: 48, height: 48, borderRadius: 999, background: "#F1ECDE", display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 12 }}>
                  <Search style={{ width: 20, height: 20, color: "#8A8497" }}/>
                </div>
                <p style={{ fontSize: 14, fontWeight: 600, color: "#13101A", marginBottom: 4 }}>No ministries found</p>
                <p style={{ fontSize: 13, color: "#8A8497" }}>
                  {search ? "Try a different search." : myIds.size > 0 ? "You've joined all available public ministries." : "Your ministry might be private."}
                </p>
                {!search && myIds.size === 0 && (
                  <button type="button" onClick={() => changeTab("code")} style={{
                    fontSize: 13, fontWeight: 600, color: "#2D0F2E", marginTop: 8,
                    background: "transparent", border: "none", cursor: "pointer",
                  }}>
                    Try an invite code instead →
                  </button>
                )}
              </div>
            )}

            {!browsingPublic && browseable.length > 0 && (
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {browseable.map((m) => (
                  <div key={m.id} style={{
                    display: "flex", alignItems: "center", gap: 14,
                    background: "#FBF8F2", borderRadius: 14,
                    border: "1px solid #E2DDCF", padding: "16px 18px",
                  }}>
                    <div style={{
                      width: 42, height: 42, borderRadius: 12, flexShrink: 0,
                      background: "#F1ECDE", color: "#3E1540",
                      display: "grid", placeItems: "center",
                    }}>
                      <span style={{ fontFamily: SERIF, fontSize: 16, fontWeight: 400 }}>
                        {getInitials(m.name)}
                      </span>
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <p style={{ fontSize: 14, fontWeight: 500, color: "#13101A", margin: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{m.name}</p>
                      <p style={{ fontSize: 12, color: "#8A8497", margin: "2px 0 0", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {m.university} · {SIZE_LABELS[m.size] ?? m.size}
                      </p>
                    </div>
                    {confirmingId === m.id ? (
                      <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
                        <span style={{ fontSize: 13, color: "#13101A", fontWeight: 500 }}>Join {m.name}?</span>
                        <button onClick={() => handleJoin(m)} disabled={joiningId === m.id} style={{
                          padding: "7px 14px", borderRadius: 8,
                          background: joiningId === m.id ? "#E2DDCF" : "#2D0F2E",
                          color: joiningId === m.id ? "#A09A8C" : "#FBF8F2",
                          fontSize: 12, fontWeight: 500, border: "none", cursor: joiningId === m.id ? "not-allowed" : "pointer",
                          fontFamily: SANS, transition: "background .15s",
                        }}>
                          {joiningId === m.id ? "Joining…" : "Confirm"}
                        </button>
                        <button onClick={() => setConfirmingId(null)} style={{
                          padding: "7px 14px", borderRadius: 8, border: "1px solid #E2DDCF",
                          background: "transparent", fontSize: 12, fontWeight: 500, color: "#8A8497",
                          cursor: "pointer", fontFamily: SANS,
                        }}>
                          Cancel
                        </button>
                      </div>
                    ) : (
                      <button onClick={() => setConfirmingId(m.id)} disabled={joiningId === m.id} style={{
                        flexShrink: 0, padding: "9px 18px", borderRadius: 10,
                        background: joiningId === m.id ? "#E2DDCF" : "#2D0F2E",
                        color: joiningId === m.id ? "#A09A8C" : "#FBF8F2",
                        fontSize: 13, fontWeight: 500, fontFamily: SANS,
                        border: "none", cursor: joiningId === m.id ? "not-allowed" : "pointer",
                        transition: "background .15s ease",
                      }}>
                        Join
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Invite code tab */}
        {tab === "code" && (
          <form onSubmit={handleCodeJoin} style={{
            display: "flex", flexDirection: "column", alignItems: "center",
            paddingTop: 40, paddingBottom: 32, gap: 20, maxWidth: 400, margin: "0 auto",
          }}>
            <p style={{ fontSize: 13, color: "#8A8497", textAlign: "center", lineHeight: 1.6, margin: 0 }}>
              Enter the invite code shared by your ministry leader.
            </p>

            {codeError && (
              <div style={{ width: "100%", borderRadius: 12, background: "rgba(62,21,64,0.07)", padding: "10px 14px", fontSize: 13, color: "#3E1540", fontWeight: 500, textAlign: "center" }}>
                {codeError}
              </div>
            )}

            <div style={{ width: "100%" }}>
              <input
                type="text" value={inviteCode}
                onChange={(e) => setInviteCode(e.target.value.toUpperCase())}
                placeholder="ENTER CODE"
                autoComplete="off" autoCapitalize="characters"
                style={{
                  width: "100%", padding: "16px 0", textAlign: "center",
                  borderRadius: 12, border: "1px solid #E2DDCF", background: "#FBF8F2",
                  fontSize: 22, color: "#13101A",
                  fontFamily: "ui-monospace, 'SF Mono', Menlo, monospace",
                  letterSpacing: "0.18em", textTransform: "uppercase",
                  outline: "none", boxSizing: "border-box",
                }}
              />
              <p style={{ fontSize: 11, color: "#8A8497", textAlign: "center", marginTop: 8 }}>
                Codes are usually 6–8 characters
              </p>
            </div>

            <button type="submit" disabled={joiningCode || inviteCode.trim().length < 4} style={{
              width: "100%", padding: "14px 0", borderRadius: 12, border: "none",
              background: (joiningCode || inviteCode.trim().length < 4) ? "#E2DDCF" : "#2D0F2E",
              color: (joiningCode || inviteCode.trim().length < 4) ? "#A09A8C" : "#FBF8F2",
              fontSize: 15, fontWeight: 500, fontFamily: SANS,
              cursor: (joiningCode || inviteCode.trim().length < 4) ? "not-allowed" : "pointer",
              transition: "background .15s ease",
            }}>
              {joiningCode ? "Joining…" : "Join ministry"}
            </button>

            {!isLoggedIn && authChecked && (
              <p style={{ fontSize: 13, color: "#8A8497", textAlign: "center", margin: 0 }}>
                You&apos;ll be asked to sign in before joining.
              </p>
            )}

            <button type="button" onClick={() => changeTab("browse")} style={{
              fontSize: 13, color: "#8A8497", background: "none", border: "none", cursor: "pointer", fontFamily: SANS,
            }}>
              Don&apos;t have a code?{" "}
              <span style={{ fontWeight: 600, color: "#2D0F2E" }}>Browse public ministries</span>
            </button>
          </form>
        )}
      </div>

      {/* ── Footer ── */}
      <div style={{ borderTop: "1px solid #E8E2D2", padding: "18px 24px" }}>
        <div style={{ maxWidth: 860, margin: "0 auto", display: "flex", alignItems: "center", gap: 24 }}>
          <a href="/" style={{ fontSize: 13, color: "#8A8497", textDecoration: "none" }}>← Back to home</a>
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
