"use client"

import { Suspense, useState, useEffect, useCallback } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { createClient } from "@/lib/supabase"
import { getUserMinistries, getPublicMinistries, joinMinistryById, joinMinistryByCode, setCurrentMinistry, getMemberInviteCode } from "@/app/actions/ministry"
import { Spinner, RingCrossLogo } from "@/app/home/components/shared"
import { MonogramChip } from "@/components/central/MonogramChip"
import { PlanSubTabStrip } from "@/components/central/plan-sub-tab-strip"
import { CentralButton } from "@/components/central/button"
import { CentralModal } from "@/components/central"
import { usePostJoinPickers, PostJoinPickerModals, SIZE_LABELS, ModalAction } from "./post-join-pickers"
import { EYEBROW_STYLE as mono } from "@/components/central/typography"

const SANS  = "var(--font-inter), system-ui, sans-serif"
const SERIF = "var(--font-instrument-serif)"

type MyMinistry     = { id: string; name: string; university: string; role: string }
type PublicMinistry = { id: string; name: string; university: string; size: string; location: string | null; is_public: boolean }
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
      background: "var(--cream)", marginBottom: 12,
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
  // Lazy-init from URL (Convention #12) rather than setting tab in a mount
  // effect — avoids the setState-in-effect cascade and the initial flash.
  const [tab, setTab] = useState<Tab>(() => {
    if (typeof window === "undefined") return "browse"
    const urlTab = new URLSearchParams(window.location.search).get("tab")
    return urlTab === "browse" || urlTab === "code" ? urlTab : "browse"
  })
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

  // Staff-code join — a staff invite code grants a pastor/deacon/elder role, so we
  // collect that role via a picker before completing the join. (Ported from the
  // retired /join route 2026-07-12 so /ministries fully handles staff codes.)
  const [needsStaffRole, setNeedsStaffRole]     = useState(false)
  const [staffMinistryName, setStaffMinistryName] = useState<string | null>(null)
  const [staffRole, setStaffRole]               = useState<"pastor" | "deacon" | "elder" | "">("")
  const [joiningStaff, setJoiningStaff]         = useState(false)
  const [staffRoleError, setStaffRoleError]     = useState<string | null>(null)

  // Member invite codes per my-ministry (member-visible by rule change 2026-07-04),
  // so members can share their ministry's code without asking an admin.
  const [memberCodes, setMemberCodes] = useState<Record<string, string>>({})
  const [copiedCodeId, setCopiedCodeId] = useState<string | null>(null)

  // Gender + school pickers — every join path enforces the same
  // profile-completeness flow.
  const pickers = usePostJoinPickers()

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
            // Fetch each ministry's member code (fails silently per-ministry).
            data.forEach(async (m) => {
              try {
                const { inviteCode: code } = await getMemberInviteCode(m.id)
                if (code) setMemberCodes(prev => ({ ...prev, [m.id]: code }))
              } catch { /* ignore */ }
            })
          }
          setLoadingMine(false)
        })
      }
      setAuthChecked(true)
    })
  }, [])

  async function copyMemberCode(id: string, code: string) {
    try {
      await navigator.clipboard.writeText(code)
      setCopiedCodeId(id)
      setTimeout(() => setCopiedCodeId(c => (c === id ? null : c)), 1600)
    } catch { /* clipboard unavailable — no-op */ }
  }

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

  async function doJoin(ministry: PublicMinistry) {
    setJoiningId(ministry.id)
    setJoinError(null)
    const { error } = await joinMinistryById(ministry.id)
    if (error) { setJoinError(error); setJoiningId(null); return }
    const shown = await pickers.maybeShowSchoolPicker(() => window.location.assign("/home"))
    if (shown) setJoiningId(null)
  }

  async function handleJoin(ministry: PublicMinistry) {
    if (!isLoggedIn) { window.location.assign("/signup"); return }
    if (pickers.genderGate(() => doJoin(ministry))) return
    doJoin(ministry)
  }

  async function doCodeJoin() {
    setJoiningCode(true)
    setCodeError(null)
    try {
      const { error, isStaffCode, ministryName } = await joinMinistryByCode(inviteCode)
      if (isStaffCode) {
        // Staff codes grant a pastor/deacon/elder role — open the role picker to
        // capture it before completing the join. The code never leaves in a URL.
        setStaffMinistryName(ministryName)
        setNeedsStaffRole(true)
        setJoiningCode(false)
        return
      }
      if (error) { setCodeError(error); setJoiningCode(false); return }
      const shown = await pickers.maybeShowSchoolPicker(() => window.location.assign("/home"))
      if (shown) setJoiningCode(false)
    } catch {
      setCodeError("Something went wrong. Please try again.")
      setJoiningCode(false)
    }
  }

  async function doStaffCodeJoin() {
    if (!staffRole) return
    setJoiningStaff(true)
    setStaffRoleError(null)
    try {
      const { error } = await joinMinistryByCode(inviteCode, staffRole)
      if (error) { setStaffRoleError(error); setJoiningStaff(false); return }
      setNeedsStaffRole(false)
      const shown = await pickers.maybeShowSchoolPicker(() => window.location.assign("/home"))
      if (shown) setJoiningStaff(false)
    } catch {
      setStaffRoleError("Something went wrong. Please try again.")
      setJoiningStaff(false)
    }
  }

  async function handleCodeJoin(e: React.FormEvent) {
    e.preventDefault()
    if (!isLoggedIn) { window.location.assign("/login?intent=join"); return }
    if (!inviteCode.trim()) return
    if (pickers.genderGate(doCodeJoin)) return
    doCodeJoin()
  }

  return (
    <div style={{ minHeight: "100svh", background: "var(--cream)", fontFamily: SANS, color: "var(--ink)" }}>

      {/* ── Gender + school picker modals ── */}
      <PostJoinPickerModals pickers={pickers} />

      {/* ── Staff role picker modal (CentralModal shell, §4.17) ── */}
      {needsStaffRole && (
        <CentralModal
          onClose={() => { setNeedsStaffRole(false); setStaffRole(""); setStaffRoleError(null) }}
          eyebrow="Staff invite code"
          title={staffMinistryName ? `Join ${staffMinistryName}` : "Join ministry"}
          maxWidth={360}
        >
          <p style={{ fontSize: 13, color: "var(--body)", margin: "0 0 20px", lineHeight: 1.5 }}>
            Select your staff role to continue.
          </p>
          {staffRoleError && (
            <div style={{ borderRadius: 10, background: "rgba(62,21,64,0.08)", padding: "8px 12px", fontSize: 13, color: "var(--plum)", marginBottom: 14 }}>
              {staffRoleError}
            </div>
          )}
          <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 20 }}>
            {([
              { value: "pastor" as const,  label: "Pastor",  desc: "Senior leader"  },
              { value: "deacon" as const,  label: "Deacon",  desc: "Servant leader" },
              { value: "elder"  as const,  label: "Elder",   desc: "Elder board"    },
            ]).map(({ value, label, desc }) => {
              const active = staffRole === value
              return (
                <button key={value} type="button" onClick={() => setStaffRole(value)} style={{
                  padding: "14px 18px", borderRadius: 12, textAlign: "left", cursor: "pointer",
                  border: `1px solid ${active ? "var(--plum-2)" : "var(--line-2)"}`,
                  background: active ? "var(--plum-2)" : "var(--cream-panel)",
                  transition: "all .12s ease",
                }}>
                  <div style={{ fontFamily: SERIF, fontSize: 20, color: active ? "var(--cream-panel)" : "var(--ink)" }}>{label}</div>
                  <div style={{ fontSize: 13, color: active ? "rgba(251,248,242,0.72)" : "var(--muted-text)", marginTop: 4 }}>{desc}</div>
                </button>
              )
            })}
          </div>
          <ModalAction onClick={doStaffCodeJoin} disabled={!staffRole || joiningStaff}>
            {joiningStaff ? "Joining…" : `Join as ${staffRole || "…"}`}
          </ModalAction>
          <button type="button" onClick={() => { setNeedsStaffRole(false); setStaffRole(""); setStaffRoleError(null) }}
            style={{ width: "100%", background: "none", border: "none", color: "var(--muted-text)", fontSize: 13, marginTop: 12, cursor: "pointer", fontFamily: SANS }}>
            Cancel
          </button>
        </CentralModal>
      )}

      {/* ── Top bar ── */}
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "22px 48px", borderBottom: "1px solid var(--line-3)",
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
              background: "var(--cream)",
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
              <div style={{ marginTop: 14, borderRadius: 10, background: "color-mix(in srgb, var(--danger) 8%, transparent)", border: "1px solid color-mix(in srgb, var(--danger) 18%, transparent)", padding: "10px 14px", fontSize: 13, color: "var(--danger)" }}>
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
                      {/* Member invite code — visible to every member so anyone can invite a friend. */}
                      {memberCodes[m.id] && (
                        <button
                          type="button"
                          onClick={() => copyMemberCode(m.id, memberCodes[m.id])}
                          title="Copy invite code"
                          style={{
                            display: "inline-flex", alignItems: "center", gap: 8,
                            marginTop: 6, padding: 0, background: "transparent", border: "none",
                            cursor: "pointer", fontFamily: SANS,
                          }}
                        >
                          <span style={{ ...mono, fontSize: 12, letterSpacing: "2px", color: "var(--ink)", textTransform: "none" }}>
                            {memberCodes[m.id]}
                          </span>
                          <span style={{ fontSize: 12, fontWeight: 500, color: "var(--plum)" }}>
                            {copiedCodeId === m.id ? "Copied" : "Copy invite code"}
                          </span>
                        </button>
                      )}
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
                        {m.university}{m.size ? ` · ${SIZE_LABELS[m.size] ?? m.size}` : ""}{!m.is_public ? " · Private" : ""}
                      </div>
                    </div>
                    <div style={{ marginLeft: "auto", flexShrink: 0 }}>
                      {m.is_public ? (
                        <CentralButton variant="primary" onClick={() => handleJoin(m)} disabled={joiningId === m.id} style={{ padding: "10px 22px" }}>
                          {joiningId === m.id ? "Joining…" : "Join"}
                        </CentralButton>
                      ) : (
                        /* Private ministry — discoverable, but code is the only door. */
                        <button onClick={() => changeTab("code")} title="This ministry is private — joining requires an invite code" style={{
                          padding: "10px 18px", borderRadius: 10,
                          border: "1px solid var(--line-2)", background: "transparent",
                          color: "var(--body)", fontFamily: SANS, fontSize: 13, fontWeight: 500,
                          cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 7,
                        }}>
                          <svg width={13} height={13} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                            <rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>
                          </svg>
                          Invite code
                        </button>
                      )}
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
                    ? "You've joined all listed ministries."
                    : "No ministries to show."}
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
              <div style={{ marginBottom: 16, borderRadius: 10, background: "color-mix(in srgb, var(--danger) 8%, transparent)", border: "1px solid color-mix(in srgb, var(--danger) 18%, transparent)", padding: "10px 14px", fontSize: 13, color: "var(--danger)" }}>
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
                  border: "1px solid var(--line-2)", borderRadius: 10, background: "var(--cream)",
                  fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
                  fontSize: 22, letterSpacing: "4px", textTransform: "uppercase",
                  color: "var(--ink)", outline: "none", boxSizing: "border-box",
                }}
              />
              <div>
                <CentralButton type="submit" variant="primary" disabled={joiningCode || inviteCode.trim().length < 4} style={{ marginTop: 20, padding: "14px 28px", fontSize: 15 }}>
                  {joiningCode ? "Joining…" : "Join ministry"}
                </CentralButton>
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
