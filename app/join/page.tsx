"use client"

import { Suspense, useState, useEffect, useCallback } from "react"
import Link from "next/link"
import { Search } from "lucide-react"
import { joinMinistryByCode, getPublicMinistries, joinMinistryById, getUserMinistries, setCurrentMinistry } from "@/app/actions/ministry"
import { Spinner } from "@/app/home/components/shared"
import { createClient } from "@/lib/supabase"
import { MonogramChip } from "@/components/central/MonogramChip"
import { getInitials } from "@/app/home/utils"

// ─── design tokens ──────────────────────────────────────────────
const SANS = "var(--font-inter), system-ui, sans-serif"
const SERIF = "var(--font-instrument-serif)"

const mono: React.CSSProperties = {
  fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
  fontSize: 11, letterSpacing: "0.13em", color: "var(--muted-text)", textTransform: "uppercase",
}

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

// ─── modal action button ─────────────────────────────────────────
function ModalAction({ children, onClick, disabled }: {
  children: React.ReactNode; onClick?: () => void; disabled?: boolean
}) {
  return (
    <button type="button" onClick={disabled ? undefined : onClick} disabled={disabled} style={{
      width: "100%", padding: "14px 0", borderRadius: 12, border: "none",
      background: disabled ? "var(--line-2)" : "var(--plum-2)",
      color: disabled ? "#A09A8C" : "var(--cream-panel)",
      fontSize: 15, fontWeight: 500, fontFamily: SANS,
      cursor: disabled ? "not-allowed" : "pointer",
      transition: "background .15s ease",
    }}>{children}</button>
  )
}

// ─── data ────────────────────────────────────────────────────────
const GENDERS = [
  { value: "male",   label: "Male" },
  { value: "female", label: "Female" },
] as const

const SIZE_LABELS: Record<string, string> = {
  small: "Under 50",
  medium: "50–100",
  large: "100+",
}

type Ministry = { id: string; name: string; university: string; size: string; location: string | null }
type Tab = "browse" | "code"

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

  const [inviteCode, setInviteCode] = useState(pendingJoin.inviteCode)
  const [joining, setJoining] = useState(false)
  const [codeError, setCodeError] = useState<string | null>(null)

  const [search, setSearch] = useState("")
  const [ministries, setMinistries] = useState<Ministry[]>([])
  const [browsing, setBrowsing] = useState(false)
  const [browseError, setBrowseError] = useState<string | null>(null)
  const [selected, setSelected] = useState<Ministry | null>(pendingJoin.selected)
  const [confirming, setConfirming] = useState(false)
  const [confirmError, setConfirmError] = useState<string | null>(null)
  const [myMinistryIds, setMyMinistryIds] = useState<Set<string>>(new Set())
  const [switching, setSwitching] = useState<string | null>(null)

  const [needsStaffRole, setNeedsStaffRole] = useState(false)
  const [staffMinistryName, setStaffMinistryName] = useState<string | null>(null)
  const [staffRole, setStaffRole] = useState<"pastor" | "deacon" | "elder" | "">("")
  const [joiningStaff, setJoiningStaff] = useState(false)
  const [staffRoleError, setStaffRoleError] = useState<string | null>(null)

  const [needsGender, setNeedsGender] = useState(false)
  const [gender, setGender] = useState<string>("")
  const [savingGender, setSavingGender] = useState(false)
  const [genderError, setGenderError] = useState<string | null>(null)
  const [pendingAction, setPendingAction] = useState<"code" | "browse" | null>(null)

  const [needsSchool, setNeedsSchool] = useState(false)
  const [schoolOptions, setSchoolOptions] = useState<{ id: string; name: string; abbreviation: string }[]>([])
  const [selectedSchoolId, setSelectedSchoolId] = useState<string>("")
  const [savingSchool, setSavingSchool] = useState(false)
  const [schoolError, setSchoolError] = useState<string | null>(null)
  const [pendingSchoolRedirect, setPendingSchoolRedirect] = useState<(() => void) | null>(null)

  useEffect(() => {
    sessionStorage.removeItem("pending_invite_code")
    sessionStorage.removeItem("pending_browse_ministry")
    getUserMinistries().then(({ data }) => {
      if (data) setMyMinistryIds(new Set(data.map((m) => m.id)))
    })
    const supabase = createClient()
    supabase.auth.getUser().then(async ({ data: { user } }) => {
      if (!user) return
      const { data: profile } = await supabase
        .from("profiles").select("gender").eq("id", user.id).single()
      if (profile && !profile.gender) setNeedsGender(true)
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

  async function checkAndShowSchoolPicker(afterFn: () => void) {
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { afterFn(); return }
    const { data: profile } = await supabase.from("profiles").select("ministry_id, school_id").eq("id", user.id).maybeSingle()
    if (!profile?.ministry_id || profile?.school_id) { afterFn(); return }
    const { data: schools } = await supabase.from("ministry_schools").select("id, name, abbreviation").eq("ministry_id", profile.ministry_id).order("sort_order")
    if (!schools || schools.length === 0) { afterFn(); return }
    setSchoolOptions(schools)
    setNeedsSchool(true)
    setPendingSchoolRedirect(() => afterFn)
    setJoining(false)
    setConfirming(false)
  }

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
      await checkAndShowSchoolPicker(() => window.location.assign("/home"))
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
      await checkAndShowSchoolPicker(() => window.location.assign("/home"))
    } catch {
      setStaffRoleError("Something went wrong. Please try again.")
      setJoiningStaff(false)
    }
  }

  async function handleCodeJoin(e: React.FormEvent) {
    e.preventDefault()
    if (!inviteCode.trim()) return
    if (needsGender) { setPendingAction("code"); return }
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
    await checkAndShowSchoolPicker(() => window.location.assign("/home"))
  }

  async function handleSaveSchool() {
    if (!selectedSchoolId) return
    setSavingSchool(true)
    setSchoolError(null)
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setSchoolError("Not signed in."); setSavingSchool(false); return }
    const schoolId = selectedSchoolId === "other" ? null : selectedSchoolId
    const { error } = await supabase.from("profiles").update({ school_id: schoolId }).eq("id", user.id)
    if (error) { setSchoolError("Failed to save. Try again."); setSavingSchool(false); return }
    setSavingSchool(false)
    setNeedsSchool(false)
    if (pendingSchoolRedirect) pendingSchoolRedirect()
  }

  async function handleBrowseJoin() {
    if (!selected) return
    if (needsGender) { setPendingAction("browse"); return }
    doBrowseJoin()
  }

  async function handleSaveGender() {
    if (!gender) return
    setSavingGender(true)
    setGenderError(null)
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setGenderError("Not signed in."); setSavingGender(false); return }
    const { error } = await supabase.from("profiles").update({ gender }).eq("id", user.id)
    if (error) { setGenderError("Failed to save. Try again."); setSavingGender(false); return }
    setNeedsGender(false)
    setSavingGender(false)
    if (pendingAction === "code") { setPendingAction(null); doCodeJoin() }
    else if (pendingAction === "browse") { setPendingAction(null); doBrowseJoin() }
    else setPendingAction(null)
  }

  const joinLabel = switching ? "Switching…" : confirming ? "Joining…"
    : selected && myMinistryIds.has(selected.id) ? `Go to ${selected.name} →`
    : selected ? `Join ${selected.name} →`
    : "Select a ministry"

  return (
    <>
      {/* ── School picker modal ── */}
      {needsSchool && (
        <div style={{
          position: "fixed", inset: 0, zIndex: 200,
          background: "rgba(19,16,26,0.6)",
          display: "flex", alignItems: "center", justifyContent: "center", padding: "0 24px",
        }}>
          <div style={{ background: "var(--cream-panel)", borderRadius: 20, padding: "28px 24px 24px", width: "100%", maxWidth: 360 }}>
            <div style={mono}>One more thing</div>
            <h2 style={{ fontFamily: SERIF, fontSize: 26, color: "var(--ink)", margin: "6px 0", fontWeight: 400 }}>
              Which school?
            </h2>
            <p style={{ fontSize: 13, color: "var(--body)", marginBottom: 20, lineHeight: 1.5 }}>
              This helps us organize groups and events by campus.
            </p>
            {schoolError && (
              <div style={{ borderRadius: 10, background: "rgba(62,21,64,0.08)", padding: "8px 12px", fontSize: 13, color: "var(--plum)", marginBottom: 14 }}>
                {schoolError}
              </div>
            )}
            <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 20 }}>
              {schoolOptions.map(s => {
                const active = selectedSchoolId === s.id
                return (
                  <button key={s.id} type="button" onClick={() => setSelectedSchoolId(s.id)} style={{
                    padding: "12px 16px", borderRadius: 12, textAlign: "left", cursor: "pointer",
                    border: `1px solid ${active ? "var(--plum-2)" : "var(--line-2)"}`,
                    background: active ? "var(--plum-2)" : "var(--cream-panel)",
                    transition: "all .12s ease",
                    display: "flex", alignItems: "center", justifyContent: "space-between",
                  }}>
                    <span style={{ fontFamily: SERIF, fontSize: 18, color: active ? "var(--cream-panel)" : "var(--ink)" }}>
                      {s.name}
                    </span>
                    <span style={{ fontSize: 12, color: active ? "rgba(251,248,242,0.65)" : "var(--muted-text)" }}>
                      {s.abbreviation}
                    </span>
                  </button>
                )
              })}
              <button type="button" onClick={() => setSelectedSchoolId("other")} style={{
                padding: "12px 16px", borderRadius: 12, textAlign: "left", cursor: "pointer",
                border: `1px solid ${selectedSchoolId === "other" ? "var(--plum-2)" : "var(--line-2)"}`,
                background: selectedSchoolId === "other" ? "var(--plum-2)" : "var(--cream-panel)",
                transition: "all .12s ease",
              }}>
                <span style={{ fontFamily: SERIF, fontSize: 18, color: selectedSchoolId === "other" ? "var(--cream-panel)" : "var(--ink)" }}>
                  Other / Not a student
                </span>
              </button>
            </div>
            <ModalAction onClick={handleSaveSchool} disabled={!selectedSchoolId || savingSchool}>
              {savingSchool ? "Saving…" : "Continue"}
            </ModalAction>
            <button type="button" onClick={() => { setNeedsSchool(false); if (pendingSchoolRedirect) pendingSchoolRedirect() }}
              style={{ width: "100%", background: "none", border: "none", color: "var(--muted-text)", fontSize: 13, marginTop: 12, cursor: "pointer", fontFamily: SANS }}>
              Skip for now
            </button>
          </div>
        </div>
      )}

      {/* ── Staff role picker modal ── */}
      {needsStaffRole && (
        <div style={{
          position: "fixed", inset: 0, zIndex: 200,
          background: "rgba(19,16,26,0.6)",
          display: "flex", alignItems: "center", justifyContent: "center", padding: "0 24px",
        }}>
          <div style={{ background: "var(--cream-panel)", borderRadius: 20, padding: "28px 24px 24px", width: "100%", maxWidth: 360 }}>
            <div style={mono}>Staff invite code</div>
            <h2 style={{ fontFamily: SERIF, fontSize: 26, color: "var(--ink)", margin: "6px 0", fontWeight: 400 }}>
              {staffMinistryName ? `Join ${staffMinistryName}` : "Join ministry"}
            </h2>
            <p style={{ fontSize: 13, color: "var(--body)", marginBottom: 20, lineHeight: 1.5 }}>
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
          </div>
        </div>
      )}

      {/* ── Gender picker modal ── */}
      {needsGender && pendingAction !== null && (
        <div style={{
          position: "fixed", inset: 0, zIndex: 200,
          background: "rgba(19,16,26,0.6)",
          display: "flex", alignItems: "center", justifyContent: "center", padding: "0 24px",
        }}>
          <div style={{ background: "var(--cream-panel)", borderRadius: 20, padding: "28px 24px 24px", width: "100%", maxWidth: 360 }}>
            <div style={mono}>One more thing</div>
            <h2 style={{ fontFamily: SERIF, fontSize: 26, color: "var(--ink)", margin: "6px 0", fontWeight: 400 }}>
              What&apos;s your gender?
            </h2>
            <p style={{ fontSize: 13, color: "var(--body)", marginBottom: 20, lineHeight: 1.5 }}>
              Helps us place you in the right small group.
            </p>
            {genderError && (
              <div style={{ borderRadius: 10, background: "rgba(62,21,64,0.08)", padding: "8px 12px", fontSize: 13, color: "var(--plum)", marginBottom: 14 }}>
                {genderError}
              </div>
            )}
            <div style={{ display: "flex", gap: 8, marginBottom: 20 }}>
              {GENDERS.map(({ value, label }) => {
                const active = gender === value
                return (
                  <button key={value} type="button" onClick={() => setGender(value)} style={{
                    flex: 1, padding: "10px 16px", borderRadius: 999,
                    border: `1px solid ${active ? "var(--plum)" : "var(--line-2)"}`,
                    background: active ? "var(--plum-2)" : "var(--cream-panel)",
                    color: active ? "var(--cream-panel)" : "var(--body)",
                    fontSize: 14, fontWeight: active ? 500 : 400, cursor: "pointer",
                    transition: "all .12s ease", fontFamily: SANS,
                  }}>
                    {label}
                  </button>
                )
              })}
            </div>
            <ModalAction onClick={handleSaveGender} disabled={!gender || savingGender}>
              {savingGender ? "Saving…" : "Continue"}
            </ModalAction>
            <button type="button" onClick={() => setPendingAction(null)}
              style={{ width: "100%", background: "none", border: "none", color: "var(--muted-text)", fontSize: 13, marginTop: 12, cursor: "pointer", fontFamily: SANS }}>
              Cancel
            </button>
          </div>
        </div>
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
        <div style={{ borderBottom: "1px solid var(--line)", flexShrink: 0, background: "var(--cream-panel)" }}>
          <div style={{ maxWidth: 520, margin: "0 auto", display: "flex", padding: "0 24px" }}>
            {(["browse", "code"] as Tab[]).map((t) => (
              <button key={t} onClick={() => setTab(t)} style={{
                paddingTop: 14, paddingBottom: 14, marginRight: 32,
                fontSize: 14, fontFamily: SANS, background: "none",
                color: tab === t ? "var(--plum-2)" : "var(--muted-text)",
                fontWeight: tab === t ? 600 : 400,
                borderBottom: tab === t ? "2px solid var(--plum-2)" : "2px solid transparent",
                border: "none", borderBottomWidth: 2,
                borderBottomStyle: "solid",
                borderBottomColor: tab === t ? "var(--plum-2)" : "transparent",
                marginBottom: -1, cursor: "pointer", transition: "color .15s",
              }}>
                {t === "browse" ? "Find ministry" : "I have a code"}
              </button>
            ))}
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
                  <a href="/onboarding" style={{ fontWeight: 600, color: "var(--plum-2)", textDecoration: "none" }}>Register here</a>
                </p>
                <button onClick={handleBrowseJoin} disabled={!selected || confirming || !!switching} style={{
                  width: "100%", padding: "14px 0", borderRadius: 12, border: "none",
                  background: (!selected || confirming || !!switching) ? "var(--line-2)" : "var(--plum-2)",
                  color: (!selected || confirming || !!switching) ? "#A09A8C" : "var(--cream-panel)",
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
                color: (joining || inviteCode.trim().length < 4) ? "#A09A8C" : "var(--cream-panel)",
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
                <a href="/onboarding" style={{ fontWeight: 600, color: "var(--plum-2)", textDecoration: "none" }}>Register here</a>
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
