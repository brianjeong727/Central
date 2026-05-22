"use client"

import { useState, useEffect } from "react"
import { Copy, Check, Users, Shield, Crown, MoreHorizontal, Search, X, AlertTriangle, RefreshCw, Pencil } from "lucide-react"
import { createClient } from "@/lib/supabase"
import {
  updateMinistryPublic,
  updateMinistryInfo,
  regenerateInviteCode,
  updateMemberRole,
  removeMember,
  archiveMinistry,
} from "@/app/actions/ministry"
import { updateAutomationSettings } from "@/app/actions/auto-chats"
import { DesktopTopbar } from "../components/desktop-nav"
import { getInitials } from "../utils"

interface MemberRow {
  id: string
  name: string
  email: string
  role: string
  graduation_year: number | null
}

interface MinistryInfo {
  name: string
  university: string
  size: string
}

type RoleFilter = "all" | "member" | "visitor" | "leader" | "admin"

const ROLE_STYLE: Record<string, { bg: string; color: string; border: string; label: string }> = {
  admin:   { bg: "#2D0F2E",  color: "#FBF8F2", border: "#2D0F2E",              label: "Admin"   },
  leader:  { bg: "#F1ECDE",  color: "#3E1540", border: "rgba(62,21,64,0.2)",   label: "Leader"  },
  member:  { bg: "#F1ECDE",  color: "#8A8497", border: "#E2DDCF",              label: "Member"  },
  visitor: { bg: "white",    color: "#8A8497", border: "#D8D3C8",              label: "Visitor" },
}

function roleBadge(role: string) {
  const r = role.toLowerCase()
  const s = ROLE_STYLE[r] ?? ROLE_STYLE.member
  return (
    <span style={{ fontSize: "11px", fontWeight: 500, padding: "4px 10px", borderRadius: 999, background: s.bg, color: s.color, border: `1px solid ${s.border}`, whiteSpace: "nowrap" }}>
      {s.label}
    </span>
  )
}

const SECTION_LABEL: React.CSSProperties = {
  fontFamily: "ui-monospace, 'SF Mono', Menlo, monospace",
  fontSize: "11px", fontWeight: 400, color: "#8A8497", textTransform: "uppercase", letterSpacing: "1.4px",
}

const CARD: React.CSSProperties = {
  background: "#FBF8F2", borderRadius: "12px", border: "1px solid #E8E2D2",
}

export function SettingsTab({
  ministryId,
  ministryName,
  ministryIsPublic: initialIsPublic,
  onPublicChange,
  userRole,
  userId,
}: {
  ministryId: string
  ministryName: string
  ministryIsPublic: boolean
  onPublicChange: (v: boolean) => void
  userRole: string
  userId: string
}) {
  const supabase = createClient()
  const isAdmin = userRole.toLowerCase() === "admin"

  // Ministry info
  const [ministryInfo, setMinistryInfo] = useState<MinistryInfo | null>(null)
  const [editingName, setEditingName] = useState(false)
  const [nameDraft, setNameDraft] = useState("")
  const [editingUniversity, setEditingUniversity] = useState(false)
  const [universityDraft, setUniversityDraft] = useState("")
  const [savingInfo, setSavingInfo] = useState(false)
  const [infoError, setInfoError] = useState<string | null>(null)

  // Members
  const [members, setMembers] = useState<MemberRow[]>([])
  const [showMembersOverlay, setShowMembersOverlay] = useState(false)
  const [overlayInitialFilter, setOverlayInitialFilter] = useState<RoleFilter>("all")

  const totalMembers = members.length
  const totalLeaders = members.filter(m => m.role.toLowerCase() === "leader").length
  const totalAdmins = members.filter(m => m.role.toLowerCase() === "admin").length
  const totalVisitors = members.filter(m => m.role.toLowerCase() === "visitor").length

  // Invite code
  const [inviteCode, setInviteCode] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const [showRegenerateConfirm, setShowRegenerateConfirm] = useState(false)
  const [regenerating, setRegenerating] = useState(false)

  // Discovery
  const [isPublic, setIsPublic] = useState(initialIsPublic)
  const [toggling, setToggling] = useState(false)

  // Automations
  const [automationSettings, setAutomationSettings] = useState<Record<string, boolean>>({
    auto_praise_chat: true,
    auto_archive_praise: true,
    auto_sg_chats: true,
    auto_grade_chats: true,
    auto_central_chat: true,
  })

  // Danger Zone
  const [showArchiveConfirm, setShowArchiveConfirm] = useState(false)
  const [archiveConfirmText, setArchiveConfirmText] = useState("")
  const [archiving, setArchiving] = useState(false)

  // Loading
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      const [{ data: min }, { data: profiles }] = await Promise.all([
        supabase.from("ministries").select("name, university, size, invite_code, is_public, automation_settings").eq("id", ministryId).maybeSingle(),
        supabase.from("profiles").select("id, name, email, role, graduation_year").eq("ministry_id", ministryId).order("name"),
      ])

      if (min) {
        setMinistryInfo({ name: min.name, university: min.university, size: min.size })
        setInviteCode(min.invite_code)
        setIsPublic(min.is_public ?? false)
        if (min.automation_settings) {
          setAutomationSettings(s => ({ ...s, ...(min.automation_settings as Record<string, boolean>) }))
        }
      }
      setMembers(profiles ?? [])
      setLoading(false)
    }
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ministryId])

  // ── Ministry info edit ──────────────────────────────────────────────────────
  async function saveMinistryField(field: "name" | "university", val: string) {
    const trimmed = val.trim()
    const current = field === "name" ? (ministryInfo?.name ?? "") : (ministryInfo?.university ?? "")
    if (!trimmed || trimmed === current) {
      field === "name" ? setEditingName(false) : setEditingUniversity(false)
      return
    }
    setSavingInfo(true)
    setInfoError(null)
    const { error } = await updateMinistryInfo({
      name: field === "name" ? trimmed : (ministryInfo?.name ?? ""),
      university: field === "university" ? trimmed : (ministryInfo?.university ?? ""),
    })
    setSavingInfo(false)
    if (error) { setInfoError(error); return }
    setMinistryInfo(prev => prev ? { ...prev, [field]: trimmed } : prev)
    field === "name" ? setEditingName(false) : setEditingUniversity(false)
  }

  // ── Role change ─────────────────────────────────────────────────────────────
  async function handleRoleChange(memberId: string, newRole: "visitor" | "member" | "leader" | "admin") {
    const { error } = await updateMemberRole(memberId, newRole)
    if (!error) setMembers(prev => prev.map(m => m.id === memberId ? { ...m, role: newRole } : m))
  }

  // ── Remove member ───────────────────────────────────────────────────────────
  async function handleRemoveMember(memberId: string) {
    const { error } = await removeMember(memberId)
    if (!error) setMembers(prev => prev.filter(m => m.id !== memberId))
  }

  // ── Invite code ─────────────────────────────────────────────────────────────
  function copyInviteCode() {
    if (!inviteCode) return
    navigator.clipboard.writeText(inviteCode)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  async function handleRegenerate() {
    setRegenerating(true)
    setShowRegenerateConfirm(false)
    const { code, error } = await regenerateInviteCode()
    if (!error && code) setInviteCode(code)
    setRegenerating(false)
  }

  // ── Automation toggle ────────────────────────────────────────────────────────
  async function handleAutomationToggle(key: string) {
    if (!isAdmin) return
    const next = { ...automationSettings, [key]: !automationSettings[key] }
    setAutomationSettings(next)
    updateAutomationSettings(ministryId, next)
  }

  // ── Discovery toggle ─────────────────────────────────────────────────────────
  async function handleToggle() {
    if (toggling) return
    setToggling(true)
    const next = !isPublic
    const { error } = await updateMinistryPublic(next)
    if (!error) { setIsPublic(next); onPublicChange(next) }
    setToggling(false)
  }

  // ── Archive ─────────────────────────────────────────────────────────────────
  async function handleArchive() {
    setArchiving(true)
    await archiveMinistry()
    setArchiving(false)
    setShowArchiveConfirm(false)
    window.location.href = "/landing"
  }


  return (
    <div className="md:h-full md:overflow-y-auto">
      <DesktopTopbar crumbs={["Central", "Church Settings"]} />

      <div className="px-5 py-6 md:px-14 md:py-10 pb-28 md:pb-10">
        {/* ── Page header ── */}
        <div className="mb-5 md:mb-7">
          <p style={{ fontFamily: "ui-monospace,'SF Mono',Menlo,monospace", fontSize: "11px", fontWeight: 400, letterSpacing: "1.4px", textTransform: "uppercase", color: "#8A8497", marginBottom: 4 }}>
            {isAdmin ? "Ministry Admin" : "Ministry Workspace"}
          </p>
          <h1 style={{ fontFamily: "var(--font-instrument-serif)", fontSize: "clamp(28px, 4vw, 44px)", color: "#13101A", fontWeight: 400, margin: 0, letterSpacing: "-0.01em" }}>
            Church Settings
          </h1>
        </div>

        {loading ? (
          <div style={{ color: "#8A8497", fontSize: "14px" }}>Loading…</div>
        ) : (
          <div className="flex flex-col gap-8 md:grid md:items-stretch" style={{ gridTemplateColumns: "1fr 300px" }}>
            {/* ── LEFT COLUMN ── */}
            <div className="flex flex-col gap-8 h-full">

              {/* Ministry Profile */}
              <section>
                <p style={SECTION_LABEL} className="mb-3">Ministry profile</p>
                <div style={CARD} className="p-6">
                  <div className="flex items-center gap-3">
                    <div style={{ width: 40, height: 40, borderRadius: 10, background: "#3E1540", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                      <span style={{ fontFamily: "var(--font-instrument-serif)", fontSize: "16px", color: "#FBF8F2" }}>{(ministryInfo?.name ?? ministryName)[0]}</span>
                    </div>
                    <div className="flex-1 min-w-0">
                      {editingName ? (
                        <input
                          autoFocus
                          value={nameDraft}
                          onChange={e => setNameDraft(e.target.value)}
                          onKeyDown={e => { if (e.key === "Enter") saveMinistryField("name", nameDraft); if (e.key === "Escape") setEditingName(false) }}
                          onBlur={() => saveMinistryField("name", nameDraft)}
                          style={{ fontSize: "16px", fontWeight: 600, color: "#13101A", lineHeight: 1.2, background: "transparent", border: "none", borderBottom: "1px solid #E2DDCF", outline: "none", padding: 0, width: "100%" }}
                        />
                      ) : (
                        <div
                          className="group flex items-center gap-1.5"
                          style={{ cursor: isAdmin ? "text" : "default" }}
                          onClick={isAdmin ? () => { setNameDraft(ministryInfo?.name ?? ministryName); setEditingName(true) } : undefined}
                        >
                          <p style={{ fontSize: "16px", fontWeight: 600, color: "#13101A", lineHeight: 1.2 }}>{ministryInfo?.name ?? ministryName}</p>
                          {isAdmin && <Pencil className="opacity-0 group-hover:opacity-100 transition-opacity duration-150" style={{ width: 12, height: 12, color: "#8A8497", flexShrink: 0 }} />}
                        </div>
                      )}
                      {editingUniversity ? (
                        <input
                          autoFocus
                          value={universityDraft}
                          onChange={e => setUniversityDraft(e.target.value)}
                          onKeyDown={e => { if (e.key === "Enter") saveMinistryField("university", universityDraft); if (e.key === "Escape") setEditingUniversity(false) }}
                          onBlur={() => saveMinistryField("university", universityDraft)}
                          style={{ fontSize: "12px", color: "#8A8497", marginTop: "2px", background: "transparent", border: "none", borderBottom: "1px solid #E2DDCF", outline: "none", padding: 0, width: "100%" }}
                        />
                      ) : (
                        <div
                          className="group flex items-center gap-1"
                          style={{ cursor: isAdmin ? "text" : "default", marginTop: "2px" }}
                          onClick={isAdmin ? () => { setUniversityDraft(ministryInfo?.university ?? ""); setEditingUniversity(true) } : undefined}
                        >
                          <p style={{ fontSize: "12px", color: "#8A8497" }}>{ministryInfo?.university ?? "—"}</p>
                          {isAdmin && <Pencil className="opacity-0 group-hover:opacity-100 transition-opacity duration-150" style={{ width: 11, height: 11, color: "#8A8497", flexShrink: 0 }} />}
                        </div>
                      )}
                      {infoError && <p style={{ fontSize: "12px", color: "#DC2626", marginTop: 4 }}>{infoError}</p>}
                    </div>
                  </div>
                </div>
              </section>

              {/* Member Preview */}
              <section className="flex flex-col flex-1">
                <p style={SECTION_LABEL} className="mb-3">Members <span style={{ fontWeight: 400, opacity: 0.7 }}>({totalMembers})</span></p>
                <div style={{ ...CARD, display: "flex", flexDirection: "column", flex: 1 }}>
                  <div>
                    {members.length === 0 ? (
                      <p style={{ fontSize: "13px", color: "#8A8497", padding: "20px", textAlign: "center" }}>No members yet.</p>
                    ) : (
                      members.slice(0, 6).map((m, i) => (
                        <div
                          key={m.id}
                          className="flex items-center gap-3 px-4 py-3.5"
                          style={{ borderTop: i ? "1px solid #EFE9DA" : undefined }}
                        >
                          <div style={{ width: 34, height: 34, borderRadius: 9, background: i % 2 === 0 ? "#3E1540" : "#13101A", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                            <span style={{ fontSize: "12px", fontWeight: 600, color: "#FBF8F2" }}>{getInitials(m.name)}</span>
                          </div>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div className="flex items-center gap-2">
                              <p style={{ fontSize: "13px", fontWeight: 500, color: "#13101A", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{m.name}</p>
                              {m.id === userId && <span style={{ fontSize: "10px", color: "#8A8497" }}>you</span>}
                            </div>
                            <p style={{ fontSize: "11px", color: "#8A8497", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{m.email}</p>
                          </div>
                          {roleBadge(m.role)}
                        </div>
                      ))
                    )}
                  </div>
                  {members.length > 6 && (
                    <button
                      onClick={() => setShowMembersOverlay(true)}
                      className="w-full text-left px-4 py-3 text-[13px] text-[#A09A8C] hover:text-[#3E1540] transition-colors"
                      style={{ borderTop: "1px solid #EFE9DA" }}
                    >
                      View all {totalMembers} members →
                    </button>
                  )}
                </div>
              </section>
            </div>

            {/* ── RIGHT COLUMN ── */}
            <div className="flex flex-col gap-5">

              {/* Ministry Overview — clickable stat cards, 2×2 grid */}
              <section>
                <p style={SECTION_LABEL} className="mb-3">Overview</p>
                <div className="grid grid-cols-2 gap-2">
                  {[
                    { value: totalMembers, label: "Members", filter: "all" as RoleFilter },
                    { value: totalLeaders, label: "Leaders", filter: "leader" as RoleFilter },
                    { value: totalAdmins, label: "Admins", filter: "admin" as RoleFilter },
                    { value: totalMembers - totalLeaders - totalAdmins - totalVisitors, label: "Regular", filter: "member" as RoleFilter },
                    { value: totalVisitors, label: "Visitors", filter: "visitor" as RoleFilter },
                  ].map(({ value, label, filter }) => (
                    <button
                      key={label}
                      onClick={() => { setOverlayInitialFilter(filter); setShowMembersOverlay(true) }}
                      className="text-left transition-all"
                      style={{ ...CARD, padding: "16px 18px", cursor: "pointer" }}
                    >
                      <p style={{ fontFamily: "ui-monospace, 'SF Mono', Menlo, monospace", fontSize: "11px", fontWeight: 400, color: "#8A8497", textTransform: "uppercase", letterSpacing: "1.4px", marginBottom: "6px" }}>{label}</p>
                      <p style={{ fontFamily: "var(--font-instrument-serif)", fontSize: "32px", color: "#13101A", fontWeight: 400, lineHeight: 1 }}>{value}</p>
                    </button>
                  ))}
                </div>
              </section>

              {/* Discovery */}
              <section>
                <p style={SECTION_LABEL} className="mb-3">Discovery</p>
                <div style={CARD} className="p-5">
                  <div className="flex items-center justify-between gap-4">
                    <div className="flex-1">
                      <p style={{ fontSize: "13px", fontWeight: 500, color: "#13101A" }}>Public discovery</p>
                      <p style={{ fontSize: "12px", color: "#5A5466", marginTop: "3px", lineHeight: 1.5 }}>
                        {isPublic ? "Anyone can find and join without an invite code." : "Invite-only — code required to join."}
                      </p>
                    </div>
                    <button
                      onClick={isAdmin ? handleToggle : undefined}
                      disabled={toggling || !isAdmin}
                      className={`relative w-11 h-6 rounded-full flex-shrink-0 transition-colors duration-200 ${!isAdmin ? "opacity-50 cursor-not-allowed" : ""}`}
                      style={{ background: isPublic ? "#3E1540" : "#D6D0C0" }}
                    >
                      <div className="absolute top-0.5 w-5 h-5 rounded-full bg-[#FBF8F2] transition-transform duration-200" style={{ transform: isPublic ? "translateX(21px)" : "translateX(2px)" }} />
                    </button>
                  </div>
                </div>
              </section>

              {/* Automations */}
              <section>
                <p style={SECTION_LABEL} className="mb-3">Automations</p>
                <div style={CARD} className="divide-y divide-[#F0EBE0]">
                  {([
                    { key: "auto_praise_chat",    label: "Auto-create praise team chats when a week is confirmed" },
                    { key: "auto_archive_praise", label: "Auto-archive praise team chats after Sunday" },
                    { key: "auto_sg_chats",       label: "Auto-create small group chats when groups are confirmed" },
                    { key: "auto_grade_chats",    label: "Auto-add new members to grade chats" },
                    { key: "auto_central_chat",   label: `Auto-add new members to ${ministryName} Chat` },
                  ] as { key: string; label: string }[]).map(({ key, label }) => {
                    const on = automationSettings[key] !== false
                    return (
                      <div key={key} className="flex items-center justify-between gap-4 px-5 py-4">
                        <p style={{ fontSize: "13px", color: "#13101A", lineHeight: 1.5 }}>{label}</p>
                        <button
                          onClick={() => handleAutomationToggle(key)}
                          disabled={!isAdmin}
                          className={`relative w-11 h-6 rounded-full flex-shrink-0 transition-colors duration-200 ${!isAdmin ? "opacity-50 cursor-not-allowed" : ""}`}
                          style={{ background: on ? "#3E1540" : "#D6D0C0" }}
                        >
                          <div className="absolute top-0.5 w-5 h-5 rounded-full bg-[#FBF8F2] transition-transform duration-200" style={{ transform: on ? "translateX(21px)" : "translateX(2px)" }} />
                        </button>
                      </div>
                    )
                  })}
                </div>
              </section>

              {/* Invite Code */}
              <section>
                <p style={SECTION_LABEL} className="mb-3">Invite code</p>
                <div style={CARD} className="p-5">
                  <p style={{ fontSize: "12px", color: "#5A5466", marginBottom: "12px" }}>
                    Share with members to let them join directly.
                  </p>
                  <div className="flex items-center gap-2 mb-3">
                    <div style={{ flex: 1, padding: "10px 14px", background: "#F1ECDE", borderRadius: "10px", border: "1px solid #E2DDCF" }}>
                      <span style={{ fontFamily: "ui-monospace, 'SF Mono', Menlo, monospace", fontSize: "16px", fontWeight: 600, color: "#13101A", letterSpacing: "0.15em" }}>
                        {inviteCode ?? "———"}
                      </span>
                    </div>
                    <button
                      onClick={copyInviteCode}
                      disabled={!inviteCode}
                      className="flex items-center gap-1.5 px-3 py-2.5 rounded-[10px] border border-[#E2DDCF] text-[12px] font-medium text-[#5A5466] hover:bg-[#F1ECDE] disabled:opacity-40 transition-colors flex-shrink-0"
                    >
                      {copied ? <Check className="w-3.5 h-3.5 text-[#3E1540]" /> : <Copy className="w-3.5 h-3.5" />}
                      {copied ? "Copied" : "Copy"}
                    </button>
                  </div>

                  {/* Regenerate */}
                  {isAdmin && (
                    showRegenerateConfirm ? (
                      <div className="rounded-[10px] border border-[#E8E2D2] bg-[#FBF8F2] p-3">
                        <p style={{ fontSize: "12px", color: "#5A5466", marginBottom: "8px" }}>
                          The old code will stop working immediately. Anyone with it won&apos;t be able to join.
                        </p>
                        <div className="flex gap-2">
                          <button onClick={() => setShowRegenerateConfirm(false)} className="px-3 py-1.5 rounded-[10px] border border-[#E2DDCF] text-[11px] text-[#5A5466] hover:bg-[#F1ECDE] transition-colors">Cancel</button>
                          <button onClick={handleRegenerate} disabled={regenerating} className="px-3 py-1.5 rounded-[10px] bg-[#2D0F2E] text-[#FBF8F2] text-[11px] font-semibold hover:bg-[#13101A] disabled:opacity-60 transition-colors">
                            {regenerating ? "Regenerating…" : "Yes, regenerate"}
                          </button>
                        </div>
                      </div>
                    ) : (
                      <button
                        onClick={() => setShowRegenerateConfirm(true)}
                        className="flex items-center gap-1.5 text-[11px] text-[#8A8497] hover:text-[#3E1540] transition-colors"
                      >
                        <RefreshCw className="w-3 h-3" />Regenerate code
                      </button>
                    )
                  )}
                </div>
              </section>
            </div>
          </div>
        )}

        {/* ── Danger Zone — editorial inline rule ── */}
        {isAdmin && !loading && (
          <div className="mt-16">
            <div style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: 20 }}>
              <div style={{ flex: 1, height: 1, background: "#E8E2D2" }} />
              <p style={{ fontFamily: "ui-monospace,'SF Mono',Menlo,monospace", fontSize: "10px", fontWeight: 400, letterSpacing: "1.2px", textTransform: "uppercase", color: "#9F3030", whiteSpace: "nowrap" }}>
                Danger Zone
              </p>
              <div style={{ flex: 1, height: 1, background: "#E8E2D2" }} />
            </div>

            <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 24 }}>
              <div style={{ flex: 1 }}>
                <p style={{ fontFamily: "var(--font-instrument-serif)", fontSize: "20px", fontWeight: 400, color: "#13101A", marginBottom: 4 }}>Archive ministry</p>
                <p style={{ fontSize: "13px", color: "#8A8497", lineHeight: 1.6, maxWidth: "480px" }}>
                  Deactivates the ministry. Members lose access immediately. Data is preserved and can be restored by contacting support.
                </p>
              </div>
              {!showArchiveConfirm ? (
                <button
                  onClick={() => setShowArchiveConfirm(true)}
                  className="flex-shrink-0 px-4 py-2 rounded-[10px] text-[13px] transition-colors"
                  style={{ border: "1px solid #9F3030", color: "#9F3030", background: "transparent" }}
                  onMouseEnter={e => { e.currentTarget.style.background = "#FDF5F5" }}
                  onMouseLeave={e => { e.currentTarget.style.background = "transparent" }}
                >
                  Archive
                </button>
              ) : (
                <div className="flex-shrink-0 flex flex-col items-end gap-2">
                  <p style={{ fontSize: "12px", color: "#8A8497", textAlign: "right" }}>
                    Type <strong style={{ color: "#13101A" }}>{ministryInfo?.name ?? ministryName}</strong> to confirm
                  </p>
                  <input
                    value={archiveConfirmText}
                    onChange={e => setArchiveConfirmText(e.target.value)}
                    placeholder="Ministry name…"
                    className="px-3 py-2 rounded-[10px] border text-[13px] text-[#13101A] focus:outline-none bg-[#FBF8F2] w-48"
                    style={{ borderColor: "#9F3030" }}
                  />
                  <div className="flex gap-2">
                    <button
                      onClick={() => { setShowArchiveConfirm(false); setArchiveConfirmText("") }}
                      className="px-3 py-1.5 rounded-[10px] border border-[#E2DDCF] text-[12px] text-[#5A5466] hover:bg-[#F1ECDE] transition-colors"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={handleArchive}
                      disabled={archiving || archiveConfirmText !== (ministryInfo?.name ?? ministryName)}
                      className="px-3 py-1.5 rounded-[10px] text-[12px] font-semibold disabled:opacity-40 transition-colors"
                      style={{ border: "1px solid #9F3030", color: "#9F3030", background: "transparent" }}
                    >
                      {archiving ? "Archiving…" : "Archive ministry"}
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {showMembersOverlay && (
        <MembersFullOverlay
          members={members}
          userId={userId}
          isAdmin={isAdmin}
          initialFilter={overlayInitialFilter}
          onClose={() => setShowMembersOverlay(false)}
          onRoleChange={handleRoleChange}
          onRemoveMember={handleRemoveMember}
        />
      )}
    </div>
  )
}

// ── MembersFullOverlay ────────────────────────────────────────────────────────

function MembersFullOverlay({ members, userId, isAdmin, initialFilter, onClose, onRoleChange, onRemoveMember }: {
  members: MemberRow[]
  userId: string
  isAdmin: boolean
  initialFilter: RoleFilter
  onClose: () => void
  onRoleChange: (id: string, role: "visitor" | "member" | "leader" | "admin") => Promise<void>
  onRemoveMember: (id: string) => Promise<void>
}) {
  const [search, setSearch] = useState("")
  const [filter, setFilter] = useState<RoleFilter>(initialFilter)
  const [roleMenuOpen, setRoleMenuOpen] = useState<string | null>(null)
  const [changingRole, setChangingRole] = useState<string | null>(null)
  const [removeConfirmId, setRemoveConfirmId] = useState<string | null>(null)
  const [removing, setRemoving] = useState(false)

  const filtered = members.filter(m => {
    const roleMatch = filter === "all" || m.role.toLowerCase() === filter
    const s = search.toLowerCase().trim()
    return roleMatch && (!s || m.name.toLowerCase().includes(s) || m.email.toLowerCase().includes(s))
  })

  async function handleRoleChange(memberId: string, role: "visitor" | "member" | "leader" | "admin") {
    setChangingRole(memberId)
    setRoleMenuOpen(null)
    await onRoleChange(memberId, role)
    setChangingRole(null)
  }

  async function handleRemove() {
    if (!removeConfirmId) return
    setRemoving(true)
    await onRemoveMember(removeConfirmId)
    setRemoving(false)
    setRemoveConfirmId(null)
  }

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 80, background: "#FBF8F2", display: "flex", flexDirection: "column" }}>
      {/* Header */}
      <div style={{ padding: "20px 24px 14px", borderBottom: "1px solid #E8E2D2", display: "flex", alignItems: "center", justifyContent: "space-between", background: "#FBF8F2", flexShrink: 0 }}>
        <h2 style={{ fontFamily: "var(--font-instrument-serif)", fontSize: 26, color: "#13101A", fontWeight: 400, margin: 0 }}>
          Members <span style={{ fontSize: 18, color: "#8A8497", fontFamily: "var(--font-inter)" }}>({members.length})</span>
        </h2>
        <button onClick={onClose} style={{ width: 36, height: 36, borderRadius: 8, border: "1px solid #E8E2D2", background: "#FBF8F2", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}>
          <X className="w-4 h-4 text-[#5A5466]" />
        </button>
      </div>

      {/* Search + filter bar */}
      <div style={{ padding: "14px 24px 0", background: "#FBF8F2", flexShrink: 0 }}>
        <div style={{ position: "relative", marginBottom: 10 }}>
          <Search style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", width: 14, height: 14, color: "#8A8497" }} />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search members…"
            style={{ width: "100%", boxSizing: "border-box", paddingLeft: 36, paddingRight: 16, paddingTop: 10, paddingBottom: 10, borderRadius: 10, border: "1px solid #E2DDCF", background: "#FBF8F2", fontSize: 13, color: "#13101A", outline: "none", fontFamily: "var(--font-inter)" }}
          />
        </div>
        <div style={{ display: "flex", gap: 6, paddingBottom: 12 }}>
          {(["all", "visitor", "member", "leader", "admin"] as const).map(f => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              style={{ fontSize: 11, fontWeight: 500, padding: "4px 10px", borderRadius: 999, border: `1px solid ${filter === f ? "#2D0F2E" : "#E2DDCF"}`, background: filter === f ? "#2D0F2E" : "#FBF8F2", color: filter === f ? "#FBF8F2" : "#8A8497", cursor: "pointer", fontFamily: "var(--font-inter)" }}
            >
              {f === "all" ? "All" : f.charAt(0).toUpperCase() + f.slice(1)}
            </button>
          ))}
        </div>
      </div>

      {/* Scrollable list */}
      <div style={{ flex: 1, overflowY: "auto", padding: "0 24px 32px" }}>
        {removeConfirmId && (() => {
          const target = members.find(m => m.id === removeConfirmId)
          return (
            <div style={{ margin: "12px 0", borderRadius: 10, border: "1px solid #FEE2E2", background: "#FFF5F5", padding: "12px 16px", display: "flex", alignItems: "center", gap: 12 }}>
              <AlertTriangle style={{ width: 16, height: 16, color: "#F87171", flexShrink: 0 }} />
              <p style={{ fontSize: 13, color: "#5A5466", flex: 1, margin: 0 }}>Remove <strong style={{ color: "#13101A" }}>{target?.name}</strong> from this ministry?</p>
              <button onClick={() => setRemoveConfirmId(null)} style={{ fontSize: 12, color: "#5A5466", background: "none", border: "none", cursor: "pointer", padding: "4px 8px" }}>Cancel</button>
              <button onClick={handleRemove} disabled={removing} style={{ fontSize: 12, fontWeight: 600, color: "#9F3030", border: "1px solid #9F3030", background: "transparent", borderRadius: 8, padding: "6px 12px", cursor: "pointer", opacity: removing ? 0.6 : 1 }}>
                {removing ? "Removing…" : "Remove"}
              </button>
            </div>
          )
        })()}

        <div style={{ background: "#FBF8F2", borderRadius: 12, border: "1px solid #E8E2D2", overflow: "hidden" }}>
          {filtered.length === 0 ? (
            <p style={{ fontSize: 13, color: "#8A8497", padding: 24, textAlign: "center" }}>
              {search ? "No members match your search." : "No members found."}
            </p>
          ) : filtered.map((m, i) => {
            const isMe = m.id === userId
            const menuOpen = roleMenuOpen === m.id
            return (
              <div key={m.id} style={{ display: "flex", alignItems: "center", gap: 12, padding: "14px 16px", borderTop: i ? "1px solid #EFE9DA" : undefined, position: "relative" }}>
                <div style={{ width: 36, height: 36, borderRadius: 9, background: i % 2 === 0 ? "#3E1540" : "#13101A", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                  <span style={{ fontSize: 13, fontWeight: 600, color: "#FBF8F2" }}>{getInitials(m.name)}</span>
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <p style={{ fontSize: 14, fontWeight: 500, color: "#13101A", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", margin: 0 }}>{m.name}</p>
                    {isMe && <span style={{ fontSize: 10, color: "#8A8497" }}>you</span>}
                  </div>
                  <p style={{ fontSize: 12, color: "#8A8497", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", margin: 0 }}>{m.email}</p>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
                  {changingRole === m.id
                    ? <span style={{ fontSize: 11, color: "#8A8497" }}>Saving…</span>
                    : roleBadge(m.role)
                  }
                  {isAdmin && !isMe && (
                    <div style={{ position: "relative" }}>
                      {menuOpen && <div style={{ position: "fixed", inset: 0, zIndex: 5 }} onClick={() => setRoleMenuOpen(null)} />}
                      <button onClick={() => setRoleMenuOpen(menuOpen ? null : m.id)} style={{ width: 28, height: 28, borderRadius: 6, display: "flex", alignItems: "center", justifyContent: "center", background: "none", border: "none", cursor: "pointer" }}>
                        <MoreHorizontal style={{ width: 16, height: 16, color: "#8A8497" }} />
                      </button>
                      {menuOpen && (
                        <div style={{ position: "absolute", top: 32, right: 0, zIndex: 20, background: "#FBF8F2", borderRadius: 12, boxShadow: "0 4px 20px rgba(19,16,26,0.12)", border: "1px solid #E8E2D2", padding: "6px 0", minWidth: 160 }}>
                          <p style={{ fontFamily: "ui-monospace,'SF Mono',Menlo,monospace", fontSize: 10, color: "#8A8497", padding: "4px 12px 6px", textTransform: "uppercase", letterSpacing: "1.2px", fontWeight: 400, margin: 0 }}>Set role</p>
                          {(["visitor", "member", "leader", "admin"] as const).map(r => (
                            <button key={r} onClick={() => handleRoleChange(m.id, r)} style={{ width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between", padding: "8px 12px", fontSize: 13, background: "none", border: "none", cursor: "pointer", color: m.role.toLowerCase() === r ? "#3E1540" : "#13101A", fontWeight: m.role.toLowerCase() === r ? 600 : 400, textAlign: "left", boxSizing: "border-box" }}>
                              {r.charAt(0).toUpperCase() + r.slice(1)}
                              {m.role.toLowerCase() === r && <Check style={{ width: 14, height: 14, color: "#3E1540" }} />}
                            </button>
                          ))}
                          <div style={{ margin: "6px 12px", borderTop: "1px solid #EFE9DA" }} />
                          <button onClick={() => { setRemoveConfirmId(m.id); setRoleMenuOpen(null) }} style={{ width: "100%", display: "flex", alignItems: "center", gap: 8, padding: "8px 12px", fontSize: 13, color: "#9F3030", background: "none", border: "none", cursor: "pointer", textAlign: "left", boxSizing: "border-box" }}>
                            Remove from ministry
                          </button>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
