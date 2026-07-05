"use client"

import { Suspense, useState, useEffect, useCallback } from "react"
import Link from "next/link"
import { Search } from "lucide-react"
import { joinMinistryByCode, getPublicMinistries, joinMinistryById, getUserMinistries, setCurrentMinistry } from "@/app/actions/ministry"
import { Spinner } from "@/app/home/components/shared"
import { MonogramChip } from "@/components/central/MonogramChip"
import { PlanSubTabStrip } from "@/components/central/plan-sub-tab-strip"
import { getInitials } from "@/app/home/utils"
import { usePostJoinPickers, PostJoinPickerModals, ModalAction, SIZE_LABELS } from "./post-join-pickers"
import { CentralModal } from "@/components/central"
import { EYEBROW_STYLE as mono } from "@/components/central/typography"

// ─── design tokens ──────────────────────────────────────────────
const SANS = "var(--font-inter), system-ui, sans-serif"
const SERIF = "var(--font-instrument-serif)"

function Icon({ d, size = 16, stroke = 1.5 }: { d: string; size?: number; stroke?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth={stroke} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d={d}/>
    </svg>
  )
}

function Wordmark({ tone = "ink" }: { tone?: "ink" | "plum" }) {
  const isInk = tone === "ink"
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
      <span style={{
        width: 32, height: 32, borderRadius: 8,
        background: isInk ? "var(--plum)" : "rgba(251,248,242,0.10)",
        color: "var(--cream-panel)", display: "grid", placeItems: "center",
        fontFamily: SERIF, fontSize: 15, flexShrink: 0,
      }}>C</span>
      <span style={{ fontFamily: SERIF, fontSize: 22, letterSpacing: "-0.01em", color: isInk ? "var(--ink)" : "var(--cream-panel)" }}>
        Central
      </span>
    </div>
  )
}

// ─── data ────────────────────────────────────────────────────────
type Ministry ={ id: string; name: string; university: string; size: string; location: string | null }
type Tab = "browse" | "code"

function JoinContent() {
  // Lazy-init from URL (SSR-safe): /ministries hands staff codes off to
  // /join?tab=code (code deliberately NOT in the URL — it's a credential).
  // ?code= is still honored for future member-invite links.
  const [tab, setTab] = useState<Tab>(() => {
    if (typeof window === "undefined") return "browse"
    return new URLSearchParams(window.location.search).get("tab") === "code" ? "code" : "browse"
  })

  const [inviteCode, setInviteCode] = useState(() => {
    if (typeof window === "undefined") return ""
    return (new URLSearchParams(window.location.search).get("code") ?? "").toUpperCase()
  })
  const [joining, setJoining] = useState(false)
  const [codeError, setCodeError] = useState<string | null>(null)

  const [search, setSearch] = useState("")
  const [ministries, setMinistries] = useState<Ministry[]>([])
  const [browsing, setBrowsing] = useState(false)
  const [browseError, setBrowseError] = useState<string | null>(null)
  const [selected, setSelected] = useState<Ministry | null>(null)
  const [confirming, setConfirming] = useState(false)
  const [confirmError, setConfirmError] = useState<string | null>(null)
  const [myMinistryIds, setMyMinistryIds] = useState<Set<string>>(new Set())
  const [switching, setSwitching] = useState<string | null>(null)

  const [needsStaffRole, setNeedsStaffRole] = useState(false)
  const [staffMinistryName, setStaffMinistryName] = useState<string | null>(null)
  const [staffRole, setStaffRole] = useState<"pastor" | "deacon" | "elder" | "">("")
  const [joiningStaff, setJoiningStaff] = useState(false)
  const [staffRoleError, setStaffRoleError] = useState<string | null>(null)

  // Gender + school pickers — shared with /ministries (one implementation).
  const pickers = usePostJoinPickers()

  useEffect(() => {
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

  async function doCodeJoin() {
    setJoining(true)
    setCodeError(null)
    try {
      const { error, isStaffCode, ministryName } = await joinMinistryByCode(inviteCode)
      if (isStaffCode) {
        setStaffMinistryName(ministryName)
        setNeedsStaffRole(true)
        setJoining(false)
        return
      }
      if (error) { setCodeError(error); setJoining(false); return }
      const shown = await pickers.maybeShowSchoolPicker(() => window.location.assign("/home"))
      if (shown) setJoining(false)
    } catch {
      setCodeError("Something went wrong. Please try again.")
      setJoining(false)
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
    if (!inviteCode.trim()) return
    if (pickers.genderGate(doCodeJoin)) return
    doCodeJoin()
  }

  async function doBrowseJoin() {
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
    const shown = await pickers.maybeShowSchoolPicker(() => window.location.assign("/home"))
    if (shown) setConfirming(false)
  }

  async function handleBrowseJoin() {
    if (!selected) return
    if (pickers.genderGate(doBrowseJoin)) return
    doBrowseJoin()
  }

  const joinLabel = switching ? "Switching…" : confirming ? "Joining…"
    : selected && myMinistryIds.has(selected.id) ? `Go to ${selected.name} →`
    : selected ? `Join ${selected.name} →`
    : "Select a ministry"

  return (
    <>
      {/* ── Gender + school picker modals (shared with /ministries) ── */}
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

      <div style={{ display: "flex", flexDirection: "column", background: "var(--cream-panel)", height: "100svh", fontFamily: SANS }}>

        {/* ── Plum hero band ── */}
        <div style={{
          flexShrink: 0, position: "relative", overflow: "hidden", color: "var(--cream-panel)",
          background: "var(--plum)",
          padding: "28px 0 32px",
        }}>
          <div style={{ position: "relative", maxWidth: 520, margin: "0 auto", padding: "0 24px" }}>
            <Link href="/" aria-label="Central — home" className="transition-opacity hover:opacity-70" style={{ display: "inline-flex", textDecoration: "none", color: "inherit" }}>
              <Wordmark tone="plum"/>
            </Link>
            <div style={{ ...mono, color: "rgba(251,248,242,0.55)", marginTop: 22, marginBottom: 8 }}>
              Find your ministry
            </div>
            <h1 style={{
              fontFamily: SERIF, fontWeight: 400, color: "var(--cream-panel)",
              fontSize: 40, letterSpacing: "-0.03em", lineHeight: 1.04, margin: 0,
            }}>
              Choose a ministry.
            </h1>
          </div>
        </div>

        {/* ── Tab bar ── */}
        <div style={{ flexShrink: 0, background: "var(--cream-panel)" }}>
          <div style={{ maxWidth: 520, margin: "0 auto", padding: "0 24px" }}>
            <PlanSubTabStrip
              flush
              tabs={[{ key: "browse", label: "Find ministry" }, { key: "code", label: "I have a code" }]}
              active={tab}
              onChange={(k) => setTab(k as Tab)}
            />
          </div>
        </div>

        {/* ── Tab content ── */}
        <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden", maxWidth: 520, margin: "0 auto", width: "100%" }}>

          {/* Browse tab */}
          {tab === "browse" && (
            <div style={{ display: "flex", flexDirection: "column", flex: 1, overflow: "hidden", padding: "20px 24px 0", gap: 12 }}>

              {/* Search */}
              <div style={{ position: "relative", flexShrink: 0 }}>
                <Search style={{ position: "absolute", left: 14, top: "50%", transform: "translateY(-50%)", width: 16, height: 16, color: "var(--muted-text)", pointerEvents: "none" }}/>
                <input
                  type="text" value={search} onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search by name or university…"
                  autoComplete="off"
                  style={{
                    width: "100%", paddingLeft: 42, paddingRight: 16, paddingTop: 12, paddingBottom: 12,
                    borderRadius: 12, border: "1px solid var(--line-2)", background: "var(--cream-panel)",
                    fontSize: 14, color: "var(--ink)", fontFamily: SANS, outline: "none",
                    boxSizing: "border-box",
                  }}
                />
              </div>

              {browseError && (
                <div style={{ flexShrink: 0, borderRadius: 12, background: "rgba(62,21,64,0.07)", padding: "10px 14px", fontSize: 13, color: "var(--plum)", fontWeight: 500 }}>
                  {browseError}
                </div>
              )}
              {confirmError && (
                <div style={{ flexShrink: 0, borderRadius: 12, background: "rgba(62,21,64,0.07)", padding: "10px 14px", fontSize: 13, color: "var(--plum)", fontWeight: 500 }}>
                  {confirmError}
                </div>
              )}

              {/* Scrollable list */}
              <div style={{ flex: 1, overflowY: "auto", minHeight: 0 }}>
                {browsing && (
                  <div style={{ display: "flex", justifyContent: "center", paddingTop: 40 }}><Spinner /></div>
                )}
                {!browsing && ministries.length === 0 && !browseError && (
                  <div style={{ display: "flex", flexDirection: "column", alignItems: "center", paddingTop: 56 }}>
                    <div style={{ width: 48, height: 48, borderRadius: 999, background: "var(--ivory)", display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 12 }}>
                      <Search style={{ width: 20, height: 20, color: "var(--muted-text)" }}/>
                    </div>
                    <p style={{ fontSize: 14, fontWeight: 600, color: "var(--ink)", marginBottom: 4 }}>No ministries found</p>
                    <p style={{ fontSize: 13, color: "var(--muted-text)", textAlign: "center" }}>
                      {search ? "Try a different search." : "Your ministry might be private."}
                    </p>
                    {!search && (
                      <button type="button" onClick={() => setTab("code")} style={{
                        fontSize: 13, color: "var(--plum-2)", fontWeight: 600, marginTop: 8,
                        background: "none", border: "none", cursor: "pointer",
                      }}>
                        Try an invite code instead →
                      </button>
                    )}
                  </div>
                )}

                {!browsing && ministries.length > 0 && (
                  <div style={{ display: "flex", flexDirection: "column", gap: 10, paddingBottom: 8 }}>
                    {ministries.map((m) => {
                      const isSelected = selected?.id === m.id
                      const isMember = myMinistryIds.has(m.id)
                      return (
                        <button key={m.id} onClick={() => { setSelected(isSelected ? null : m); setConfirmError(null) }} style={{
                          display: "flex", alignItems: "center", gap: 16, borderRadius: 14,
                          padding: "16px 18px", textAlign: "left", width: "100%", cursor: "pointer",
                          border: `1px solid ${isSelected ? "var(--plum)" : "var(--line-2)"}`,
                          background: isSelected ? "#F6F2E8" : "var(--cream-panel)",
                          transition: "all .12s ease",
                        }}>
                          <MonogramChip
                            initials={getInitials(m.name)}
                            style={{ width: 44, height: 44, fontFamily: SERIF, fontSize: 17, fontWeight: 400 }}
                          />
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <p style={{ fontSize: 15, fontWeight: 600, color: "var(--ink)", margin: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{m.name}</p>
                            <p style={{ fontSize: 12, color: "var(--muted-text)", margin: "2px 0 0", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                              {m.university} · {SIZE_LABELS[m.size] ?? m.size}
                            </p>
                          </div>
                          {isMember && (
                            <span style={{
                              padding: "3px 10px", borderRadius: 999, flexShrink: 0,
                              background: "var(--ivory)", color: "var(--plum)", fontSize: 12, fontWeight: 500,
                            }}>Member</span>
                          )}
                          <Icon d="M9 18l6-6-6-6" size={16} stroke={1.5}/>
                        </button>
                      )
                    })}
                  </div>
                )}
              </div>

              {/* Bottom CTA */}
              <div style={{ flexShrink: 0, paddingTop: 14, paddingBottom: 20, borderTop: "1px solid var(--line)" }}>
                <p style={{ textAlign: "center", fontSize: 14, marginBottom: 12, color: "var(--body)" }}>
                  Starting a new ministry?{" "}
                  <a href="/register-ministry" style={{ fontWeight: 600, color: "var(--plum-2)", textDecoration: "none" }}>Register here</a>
                </p>
                <button onClick={handleBrowseJoin} disabled={!selected || confirming || !!switching} style={{
                  width: "100%", padding: "14px 0", borderRadius: 12, border: "none",
                  background: (!selected || confirming || !!switching) ? "var(--line-2)" : "var(--plum-2)",
                  color: (!selected || confirming || !!switching) ? "var(--faint)" : "var(--cream-panel)",
                  fontSize: 15, fontWeight: 500, fontFamily: SANS,
                  cursor: (!selected || confirming || !!switching) ? "not-allowed" : "pointer",
                  transition: "background .15s ease",
                }}>
                  {joinLabel}
                </button>
              </div>
            </div>
          )}

          {/* Code tab */}
          {tab === "code" && (
            <form onSubmit={handleCodeJoin} style={{
              display: "flex", flexDirection: "column", alignItems: "center",
              overflowY: "auto", padding: "40px 24px 32px", gap: 20,
            }}>
              <p style={{ fontSize: 13, color: "var(--muted-text)", textAlign: "center", maxWidth: 280, lineHeight: 1.6 }}>
                Enter the invite code shared by your ministry leader.
              </p>

              {codeError && (
                <div style={{ width: "100%", borderRadius: 12, background: "rgba(62,21,64,0.07)", padding: "10px 14px", fontSize: 13, color: "var(--plum)", fontWeight: 500, textAlign: "center" }}>
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
                    borderRadius: 12, border: "1px solid var(--line-2)", background: "var(--cream-panel)",
                    fontSize: 22, color: "var(--ink)",
                    fontFamily: "ui-monospace, 'SF Mono', Menlo, monospace",
                    letterSpacing: "0.18em", textTransform: "uppercase",
                    outline: "none", boxSizing: "border-box",
                  }}
                />
                <p style={{ fontSize: 11, color: "var(--muted-text)", textAlign: "center", marginTop: 8 }}>
                  Codes are usually 6–8 characters
                </p>
              </div>

              <button type="submit" disabled={joining || inviteCode.trim().length < 4} style={{
                width: "100%", padding: "14px 0", borderRadius: 12, border: "none",
                background: (joining || inviteCode.trim().length < 4) ? "var(--line-2)" : "var(--plum-2)",
                color: (joining || inviteCode.trim().length < 4) ? "var(--faint)" : "var(--cream-panel)",
                fontSize: 15, fontWeight: 500, fontFamily: SANS,
                cursor: (joining || inviteCode.trim().length < 4) ? "not-allowed" : "pointer",
                transition: "background .15s ease",
              }}>
                {joining ? "Joining…" : "Join ministry"}
              </button>

              <button type="button" onClick={() => setTab("browse")} style={{
                fontSize: 13, color: "var(--muted-text)", background: "none", border: "none", cursor: "pointer", fontFamily: SANS,
              }}>
                Don&apos;t have a code?{" "}
                <span style={{ fontWeight: 600, color: "var(--plum-2)" }}>Browse ministries</span>
              </button>

              <p style={{ fontSize: 13, color: "var(--muted-text)" }}>
                Starting a new ministry?{" "}
                <a href="/register-ministry" style={{ fontWeight: 600, color: "var(--plum-2)", textDecoration: "none" }}>Register here</a>
              </p>
            </form>
          )}
        </div>
      </div>
    </>
  )
}

export default function JoinPage() {
  return (
    <Suspense>
      <JoinContent />
    </Suspense>
  )
}
