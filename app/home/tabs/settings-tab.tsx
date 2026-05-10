"use client"

import { useState, useEffect } from "react"
import { Copy, Check, Users, Shield, Crown, MoreHorizontal, Search, X, AlertTriangle, RefreshCw, Edit2 } from "lucide-react"
import { createClient } from "@/lib/supabase"
import {
  updateMinistryPublic,
  updateMinistryInfo,
  regenerateInviteCode,
  updateMemberRole,
  removeMember,
  archiveMinistry,
} from "@/app/actions/ministry"
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

type RoleFilter = "all" | "member" | "leader" | "admin"

const ROLE_STYLE: Record<string, { bg: string; color: string; border: string; label: string }> = {
  admin:  { bg: "#3E1540", color: "#F6F4EF", border: "#3E1540", label: "Admin" },
  leader: { bg: "rgba(62,21,64,0.08)", color: "#3E1540", border: "rgba(62,21,64,0.25)", label: "Leader" },
  member: { bg: "#F4F1E8", color: "#5A5466", border: "#E5E0D2", label: "Member" },
}

function roleBadge(role: string) {
  const r = role.toLowerCase()
  const s = ROLE_STYLE[r] ?? ROLE_STYLE.member
  return (
    <span style={{ fontSize: "11px", fontWeight: 600, padding: "2px 9px", borderRadius: 999, background: s.bg, color: s.color, border: `1px solid ${s.border}`, letterSpacing: "0.02em", whiteSpace: "nowrap" }}>
      {s.label}
    </span>
  )
}

const SECTION_LABEL: React.CSSProperties = {
  fontSize: "11px", fontWeight: 600, color: "#8A8497", textTransform: "uppercase", letterSpacing: "0.08em",
}

const CARD: React.CSSProperties = {
  background: "white", borderRadius: "16px", border: "1px solid #E5E0D2",
  boxShadow: "0 1px 3px rgba(19,16,26,0.04)",
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
  const [editingInfo, setEditingInfo] = useState(false)
  const [editName, setEditName] = useState("")
  const [editUniversity, setEditUniversity] = useState("")
  const [savingInfo, setSavingInfo] = useState(false)
  const [infoError, setInfoError] = useState<string | null>(null)

  // Members
  const [members, setMembers] = useState<MemberRow[]>([])
  const [showMembersOverlay, setShowMembersOverlay] = useState(false)
  const [overlayInitialFilter, setOverlayInitialFilter] = useState<RoleFilter>("all")

  const totalMembers = members.length
  const totalLeaders = members.filter(m => m.role.toLowerCase() === "leader").length
  const totalAdmins = members.filter(m => m.role.toLowerCase() === "admin").length

  // Invite code
  const [inviteCode, setInviteCode] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const [showRegenerateConfirm, setShowRegenerateConfirm] = useState(false)
  const [regenerating, setRegenerating] = useState(false)

  // Discovery
  const [isPublic, setIsPublic] = useState(initialIsPublic)
  const [toggling, setToggling] = useState(false)

  // Danger Zone
  const [showArchiveConfirm, setShowArchiveConfirm] = useState(false)
  const [archiveConfirmText, setArchiveConfirmText] = useState("")
  const [archiving, setArchiving] = useState(false)

  // Loading
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      const [{ data: min }, { data: profiles }] = await Promise.all([
        supabase.from("ministries").select("name, university, size, invite_code, is_public").eq("id", ministryId).maybeSingle(),
        supabase.from("profiles").select("id, name, email, role, graduation_year").eq("ministry_id", ministryId).order("name"),
      ])

      if (min) {
        setMinistryInfo({ name: min.name, university: min.university, size: min.size })
        setInviteCode(min.invite_code)
        setIsPublic(min.is_public ?? false)
      }
      setMembers(profiles ?? [])
      setLoading(false)
    }
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ministryId])

  // ── Ministry info edit ──────────────────────────────────────────────────────
  function startEdit() {
    if (!ministryInfo) return
    setEditName(ministryInfo.name)
    setEditUniversity(ministryInfo.university)
    setInfoError(null)
    setEditingInfo(true)
  }

  async function saveInfo() {
    if (!editName.trim() || !editUniversity.trim()) return
    setSavingInfo(true)
    setInfoError(null)
    const { error } = await updateMinistryInfo({ name: editName.trim(), university: editUniversity.trim() })
    setSavingInfo(false)
    if (error) { setInfoError(error); return }
    setMinistryInfo(prev => prev ? { ...prev, name: editName.trim(), university: editUniversity.trim() } : prev)
    setEditingInfo(false)
  }

  // ── Role change ─────────────────────────────────────────────────────────────
  async function handleRoleChange(memberId: string, newRole: "member" | "leader" | "admin") {
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
      <DesktopTopbar crumbs={[ministryName, "Church Settings"]} />

      <div className="px-5 py-6 md:px-14 md:py-10 pb-28 md:pb-10">
        {/* ── Page header ── */}
        <div className="mb-8 md:mb-10">
          <h1 style={{ fontFamily: "var(--font-instrument-serif)", fontSize: "clamp(28px, 4vw, 40px)", color: "#13101A", fontWeight: 400, margin: "0 0 4px" }}>
            Church Settings
          </h1>
          <p style={{ fontSize: "14px", color: "#8A8497" }}>
            {isAdmin ? "Ministry admin control panel" : "Ministry workspace — you can view member info"}
          </p>
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
                  {editingInfo ? (
                    <div className="flex flex-col gap-4">
                      <div>
                        <label style={{ fontSize: "11px", fontWeight: 600, color: "#8A8497", textTransform: "uppercase", letterSpacing: "0.07em", display: "block", marginBottom: "6px" }}>Ministry Name</label>
                        <input
                          value={editName}
                          onChange={e => setEditName(e.target.value)}
                          className="w-full px-3 py-2 rounded-lg border border-[#E5E0D2] text-[14px] text-[#13101A] focus:outline-none focus:border-[#3E1540]/40 bg-[#FBF8F2]"
                        />
                      </div>
                      <div>
                        <label style={{ fontSize: "11px", fontWeight: 600, color: "#8A8497", textTransform: "uppercase", letterSpacing: "0.07em", display: "block", marginBottom: "6px" }}>University</label>
                        <input
                          value={editUniversity}
                          onChange={e => setEditUniversity(e.target.value)}
                          className="w-full px-3 py-2 rounded-lg border border-[#E5E0D2] text-[14px] text-[#13101A] focus:outline-none focus:border-[#3E1540]/40 bg-[#FBF8F2]"
                        />
                      </div>
                      {infoError && <p style={{ fontSize: "12px", color: "#DC2626" }}>{infoError}</p>}
                      <div className="flex gap-2 justify-end">
                        <button onClick={() => setEditingInfo(false)} className="px-4 py-2 rounded-lg border border-[#E5E0D2] text-[13px] text-[#5A5466] hover:bg-[#F4F1E8] transition-colors">
                          Cancel
                        </button>
                        <button onClick={saveInfo} disabled={savingInfo || !editName.trim() || !editUniversity.trim()} className="px-4 py-2 rounded-lg bg-[#3E1540] text-[#F6F4EF] text-[13px] font-semibold hover:bg-[#2D0F2E] disabled:opacity-50 transition-colors">
                          {savingInfo ? "Saving…" : "Save changes"}
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-3 mb-1">
                          <div style={{ width: 40, height: 40, borderRadius: 10, background: "#3E1540", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                            <span style={{ fontFamily: "var(--font-instrument-serif)", fontSize: "16px", color: "#F6F4EF" }}>{(ministryInfo?.name ?? ministryName)[0]}</span>
                          </div>
                          <div>
                            <p style={{ fontSize: "16px", fontWeight: 600, color: "#13101A", lineHeight: 1.2 }}>{ministryInfo?.name ?? ministryName}</p>
                            <p style={{ fontSize: "12px", color: "#8A8497", marginTop: "2px" }}>{ministryInfo?.university ?? "—"}</p>
                          </div>
                        </div>
                      </div>
                      {isAdmin && (
                        <button onClick={startEdit} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-[#E5E0D2] text-[12px] text-[#5A5466] hover:bg-[#F4F1E8] hover:text-[#13101A] transition-colors flex-shrink-0">
                          <Edit2 className="w-3.5 h-3.5" />Edit
                        </button>
                      )}
                    </div>
                  )}
                </div>
              </section>

              {/* Member Preview */}
              <section className="flex flex-col flex-1">
                <p style={SECTION_LABEL} className="mb-3">Members <span style={{ fontWeight: 400, opacity: 0.7 }}>({totalMembers})</span></p>
                <div style={{ ...CARD, display: "flex", flexDirection: "column", flex: 1 }}>
                  {/* member rows — fills space, clips any that don't fit */}
                  <div style={{ flex: 1, overflow: "hidden" }}>
                    {members.length === 0 ? (
                      <p style={{ fontSize: "13px", color: "#8A8497", padding: "20px", textAlign: "center" }}>No members yet.</p>
                    ) : (
                      members.map((m, i) => (
                        <div
                          key={m.id}
                          className="flex items-center gap-3 px-4 py-3.5"
                          style={{ borderTop: i ? "1px solid #F4F1E8" : undefined }}
                        >
                          <div style={{ width: 34, height: 34, borderRadius: 8, background: m.role.toLowerCase() === "admin" ? "#3E1540" : m.role.toLowerCase() === "leader" ? "rgba(62,21,64,0.12)" : "#EFEAE0", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                            <span style={{ fontSize: "12px", fontWeight: 600, color: m.role.toLowerCase() === "admin" ? "#F6F4EF" : m.role.toLowerCase() === "leader" ? "#3E1540" : "#5A5466" }}>{getInitials(m.name)}</span>
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
                  {members.length > 0 && (
                    <button
                      onClick={() => setShowMembersOverlay(true)}
                      className="w-full flex items-center justify-center gap-1.5 py-3 text-[13px] font-semibold text-[#3E1540] hover:bg-[#FBF8F2] transition-colors flex-shrink-0"
                      style={{ borderTop: "1px solid #F4F1E8" }}
                    >
                      See all {totalMembers} members
                    </button>
                  )}
                </div>
              </section>
            </div>

            {/* ── RIGHT COLUMN ── */}
            <div className="flex flex-col gap-5">

              {/* Ministry Overview — clickable stat cards */}
              <section>
                <p style={SECTION_LABEL} className="mb-3">Overview</p>
                <div className="grid grid-cols-3 gap-2 md:grid-cols-1 md:gap-2">
                  {[
                    { icon: <Users className="w-4 h-4" />, value: totalMembers, label: "Members", filter: "all" as RoleFilter },
                    { icon: <Shield className="w-4 h-4" />, value: totalLeaders, label: "Leaders", filter: "leader" as RoleFilter },
                    { icon: <Crown className="w-4 h-4" />, value: totalAdmins, label: "Admins", filter: "admin" as RoleFilter },
                  ].map(({ icon, value, label, filter }) => (
                    <button
                      key={label}
                      onClick={() => { setOverlayInitialFilter(filter); setShowMembersOverlay(true) }}
                      className="text-left transition-all"
                      style={{ ...CARD, padding: "14px 16px", cursor: "pointer" }}
                    >
                      <div className="mb-2" style={{ color: "#8A8497" }}>{icon}</div>
                      <p style={{ fontFamily: "var(--font-instrument-serif)", fontSize: "28px", color: "#13101A", fontWeight: 400, lineHeight: 1 }}>{value}</p>
                      <p style={{ fontSize: "11px", color: "#8A8497", marginTop: "2px" }}>{label}</p>
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
                      <p style={{ fontSize: "13px", fontWeight: 600, color: "#13101A" }}>Public discovery</p>
                      <p style={{ fontSize: "12px", color: "#5A5466", marginTop: "3px", lineHeight: 1.5 }}>
                        {isPublic ? "Anyone can find and join without an invite code." : "Invite-only — code required to join."}
                      </p>
                    </div>
                    <button
                      onClick={isAdmin ? handleToggle : undefined}
                      disabled={toggling || !isAdmin}
                      className={`relative w-11 h-6 rounded-full flex-shrink-0 transition-colors duration-200 ${!isAdmin ? "opacity-50 cursor-not-allowed" : ""}`}
                      style={{ background: isPublic ? "#3E1540" : "#E5E0D2" }}
                    >
                      <div className="absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform duration-200" style={{ transform: isPublic ? "translateX(21px)" : "translateX(2px)" }} />
                    </button>
                  </div>
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
                    <div style={{ flex: 1, padding: "10px 14px", background: "#F4F1E8", borderRadius: "10px", border: "1px solid #E5E0D2" }}>
                      <span style={{ fontFamily: "monospace", fontSize: "16px", fontWeight: 700, color: "#13101A", letterSpacing: "0.15em" }}>
                        {inviteCode ?? "———"}
                      </span>
                    </div>
                    <button
                      onClick={copyInviteCode}
                      disabled={!inviteCode}
                      className="flex items-center gap-1.5 px-3 py-2.5 rounded-xl border border-[#E5E0D2] text-[12px] font-semibold text-[#5A5466] hover:bg-[#F4F1E8] disabled:opacity-40 transition-colors flex-shrink-0"
                    >
                      {copied ? <Check className="w-3.5 h-3.5 text-[#3E1540]" /> : <Copy className="w-3.5 h-3.5" />}
                      {copied ? "Copied" : "Copy"}
                    </button>
                  </div>

                  {/* Regenerate */}
                  {isAdmin && (
                    showRegenerateConfirm ? (
                      <div className="rounded-lg border border-[#E5E0D2] bg-[#FBF8F2] p-3">
                        <p style={{ fontSize: "12px", color: "#5A5466", marginBottom: "8px" }}>
                          The old code will stop working immediately. Anyone with it won&apos;t be able to join.
                        </p>
                        <div className="flex gap-2">
                          <button onClick={() => setShowRegenerateConfirm(false)} className="px-3 py-1.5 rounded-lg border border-[#E5E0D2] text-[11px] text-[#5A5466] hover:bg-[#F4F1E8] transition-colors">Cancel</button>
                          <button onClick={handleRegenerate} disabled={regenerating} className="px-3 py-1.5 rounded-lg bg-[#3E1540] text-[#F6F4EF] text-[11px] font-semibold hover:bg-[#2D0F2E] disabled:opacity-60 transition-colors">
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

        {/* ── Danger Zone ── */}
        {isAdmin && !loading && (
          <div className="mt-12">
            <div className="flex items-center gap-2 mb-4">
              <div style={{ flex: 1, height: 1, background: "#ECE8DE" }} />
              <p style={{ fontSize: "11px", color: "#C4B8B8", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.08em", whiteSpace: "nowrap" }}>Danger Zone</p>
              <div style={{ flex: 1, height: 1, background: "#ECE8DE" }} />
            </div>

            <div className="rounded-2xl border border-red-100" style={{ background: "#FFF8F8" }}>
              <div className="p-6">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p style={{ fontSize: "14px", fontWeight: 600, color: "#13101A" }}>Archive ministry</p>
                    <p style={{ fontSize: "12px", color: "#5A5466", marginTop: "4px", lineHeight: 1.5, maxWidth: "420px" }}>
                      Deactivates the ministry. Members lose access immediately. The ministry data is preserved and can be restored by contacting support.
                    </p>
                  </div>
                  {!showArchiveConfirm ? (
                    <button
                      onClick={() => setShowArchiveConfirm(true)}
                      className="flex-shrink-0 px-4 py-2 rounded-lg border border-red-200 text-[13px] font-semibold text-red-600 hover:bg-red-50 transition-colors"
                    >
                      Archive
                    </button>
                  ) : (
                    <div className="flex-shrink-0 flex flex-col items-end gap-2">
                      <p style={{ fontSize: "12px", color: "#5A5466", textAlign: "right" }}>
                        Type <strong>{ministryInfo?.name ?? ministryName}</strong> to confirm
                      </p>
                      <input
                        value={archiveConfirmText}
                        onChange={e => setArchiveConfirmText(e.target.value)}
                        placeholder="Ministry name…"
                        className="px-3 py-2 rounded-lg border border-red-200 text-[13px] text-[#13101A] focus:outline-none focus:border-red-400 bg-white w-48"
                      />
                      <div className="flex gap-2">
                        <button onClick={() => { setShowArchiveConfirm(false); setArchiveConfirmText("") }} className="px-3 py-1.5 rounded-lg border border-[#E5E0D2] text-[12px] text-[#5A5466] hover:bg-[#F4F1E8] transition-colors">Cancel</button>
                        <button
                          onClick={handleArchive}
                          disabled={archiving || archiveConfirmText !== (ministryInfo?.name ?? ministryName)}
                          className="px-3 py-1.5 rounded-lg bg-red-600 text-white text-[12px] font-semibold hover:bg-red-700 disabled:opacity-40 transition-colors"
                        >
                          {archiving ? "Archiving…" : "Archive ministry"}
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </div>
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
  onRoleChange: (id: string, role: "member" | "leader" | "admin") => Promise<void>
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

  async function handleRoleChange(memberId: string, role: "member" | "leader" | "admin") {
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
      <div style={{ padding: "20px 24px 14px", borderBottom: "1px solid #ECE8DE", display: "flex", alignItems: "center", justifyContent: "space-between", background: "#FBF8F2", flexShrink: 0 }}>
        <h2 style={{ fontFamily: "var(--font-instrument-serif)", fontSize: 26, color: "#13101A", fontWeight: 400, margin: 0 }}>
          Members <span style={{ fontSize: 18, color: "#8A8497", fontFamily: "var(--font-inter)" }}>({members.length})</span>
        </h2>
        <button onClick={onClose} style={{ width: 36, height: 36, borderRadius: 8, border: "1px solid #ECE8DE", background: "white", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}>
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
            style={{ width: "100%", boxSizing: "border-box", paddingLeft: 36, paddingRight: 16, paddingTop: 10, paddingBottom: 10, borderRadius: 12, border: "1px solid #E5E0D2", background: "white", fontSize: 13, color: "#13101A", outline: "none", fontFamily: "var(--font-inter)" }}
          />
        </div>
        <div style={{ display: "flex", gap: 6, paddingBottom: 12 }}>
          {(["all", "member", "leader", "admin"] as const).map(f => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              style={{ fontSize: 11, fontWeight: 600, padding: "4px 10px", borderRadius: 999, border: `1px solid ${filter === f ? "#3E1540" : "#E5E0D2"}`, background: filter === f ? "#3E1540" : "white", color: filter === f ? "#F6F4EF" : "#8A8497", cursor: "pointer", fontFamily: "var(--font-inter)" }}
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
            <div style={{ margin: "12px 0", borderRadius: 12, border: "1px solid #FEE2E2", background: "#FFF5F5", padding: "12px 16px", display: "flex", alignItems: "center", gap: 12 }}>
              <AlertTriangle style={{ width: 16, height: 16, color: "#F87171", flexShrink: 0 }} />
              <p style={{ fontSize: 13, color: "#5A5466", flex: 1, margin: 0 }}>Remove <strong style={{ color: "#13101A" }}>{target?.name}</strong> from this ministry?</p>
              <button onClick={() => setRemoveConfirmId(null)} style={{ fontSize: 12, color: "#5A5466", background: "none", border: "none", cursor: "pointer", padding: "4px 8px" }}>Cancel</button>
              <button onClick={handleRemove} disabled={removing} style={{ fontSize: 12, fontWeight: 600, color: "white", background: "#EF4444", border: "none", borderRadius: 8, padding: "6px 12px", cursor: "pointer", opacity: removing ? 0.6 : 1 }}>
                {removing ? "Removing…" : "Remove"}
              </button>
            </div>
          )
        })()}

        <div style={{ background: "white", borderRadius: 16, border: "1px solid #E5E0D2", overflow: "hidden", boxShadow: "0 1px 3px rgba(19,16,26,0.04)" }}>
          {filtered.length === 0 ? (
            <p style={{ fontSize: 13, color: "#8A8497", padding: 24, textAlign: "center" }}>
              {search ? "No members match your search." : "No members found."}
            </p>
          ) : filtered.map((m, i) => {
            const isMe = m.id === userId
            const menuOpen = roleMenuOpen === m.id
            return (
              <div key={m.id} style={{ display: "flex", alignItems: "center", gap: 12, padding: "14px 16px", borderTop: i ? "1px solid #F4F1E8" : undefined, position: "relative" }}>
                <div style={{ width: 36, height: 36, borderRadius: 9, background: m.role.toLowerCase() === "admin" ? "#3E1540" : m.role.toLowerCase() === "leader" ? "rgba(62,21,64,0.12)" : "#EFEAE0", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                  <span style={{ fontSize: 13, fontWeight: 600, color: m.role.toLowerCase() === "admin" ? "#F6F4EF" : m.role.toLowerCase() === "leader" ? "#3E1540" : "#5A5466" }}>{getInitials(m.name)}</span>
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
                        <div style={{ position: "absolute", top: 32, right: 0, zIndex: 20, background: "white", borderRadius: 12, boxShadow: "0 4px 20px rgba(19,16,26,0.12)", border: "1px solid #ECE8DE", padding: "6px 0", minWidth: 160 }}>
                          <p style={{ fontSize: 10, color: "#8A8497", padding: "4px 12px 6px", textTransform: "uppercase", letterSpacing: "0.06em", fontWeight: 600, margin: 0 }}>Set role</p>
                          {(["member", "leader", "admin"] as const).map(r => (
                            <button key={r} onClick={() => handleRoleChange(m.id, r)} style={{ width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between", padding: "8px 12px", fontSize: 13, background: "none", border: "none", cursor: "pointer", color: m.role.toLowerCase() === r ? "#3E1540" : "#13101A", fontWeight: m.role.toLowerCase() === r ? 600 : 400, textAlign: "left", boxSizing: "border-box" }}>
                              {r.charAt(0).toUpperCase() + r.slice(1)}
                              {m.role.toLowerCase() === r && <Check style={{ width: 14, height: 14, color: "#3E1540" }} />}
                            </button>
                          ))}
                          <div style={{ margin: "6px 12px", borderTop: "1px solid #F4F1E8" }} />
                          <button onClick={() => { setRemoveConfirmId(m.id); setRoleMenuOpen(null) }} style={{ width: "100%", display: "flex", alignItems: "center", gap: 8, padding: "8px 12px", fontSize: 13, color: "#EF4444", background: "none", border: "none", cursor: "pointer", textAlign: "left", boxSizing: "border-box" }}>
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
