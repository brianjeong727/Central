"use client"

import { useState, useEffect } from "react"
import { Copy, Check, Users, Shield, Crown, MoreHorizontal, Search, X, AlertTriangle, RefreshCw, Pencil, Calendar, ExternalLink, GripVertical, BookOpen } from "lucide-react"
import { createClient } from "@/lib/supabase"
import { logAudit } from "@/lib/audit"
import { EYEBROW_STYLE } from "../components/shared"
import {
  updateMinistryPublic,
  updateMinistryInfo,
  regenerateInviteCode,
  regenerateStaffCode,
  updateMemberRole,
  removeMember,
  excommunicateMember,
  getBannedMembers,
  archiveMinistry,
  runDepartedMemberCleanup,
} from "@/app/actions/ministry"
import { updateAutomationSettings, runAnnualClassMaintenance, retroactivelyApplyToggle, archiveToggleChats } from "@/app/actions/auto-chats"
import { getReceiptLimits, upsertReceiptLimit, deleteReceiptLimit } from "@/app/actions/receipts"
import type { ReceiptLimit } from "@/app/actions/receipts"
import { getHomeVerses, addHomeVerse, updateHomeVerse, deleteHomeVerse, reorderHomeVerses } from "@/app/actions/home-verses"
import type { HomeVerse } from "@/app/actions/home-verses"
import { updateGovernanceSettings, updateTeamAdminAccess } from "@/app/actions/governance"
import type { GovernanceSettings } from "../types"
import { getInitials } from "../utils"
import { MonogramChip, PageTitle, PlanSubTabStrip, SectionHeader, TabPageHeader } from "@/components/central"
import { useNavState } from "../nav-state"

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

type RoleFilter = "all" | "member" | "visitor" | "leader" | "admin" | "deacon" | "elder"
type ActiveSettingsTab = "general" | "people" | "governance" | "automations" | "workspace" | "audit"

interface GovTeamRow {
  id: string
  name: string
  icon: string | null
  admin_access: "none" | "view" | "write"
}

const ROLE_STYLE: Record<string, { bg: string; color: string; border: string; label: string }> = {
  admin:   { bg: "var(--plum-2)",  color: "var(--cream-panel)", border: "var(--plum-2)",              label: "Admin"   },
  deacon:  { bg: "var(--plum-2)",  color: "var(--cream-panel)", border: "var(--plum-2)",              label: "Deacon"  },
  elder:   { bg: "var(--plum-2)",  color: "var(--cream-panel)", border: "var(--plum-2)",              label: "Elder"   },
  pastor:  { bg: "var(--plum-2)",  color: "var(--cream-panel)", border: "var(--plum-2)",              label: "Pastor"  },
  leader:  { bg: "var(--ivory)",  color: "var(--plum)", border: "rgba(62,21,64,0.2)",   label: "Leader"  },
  member:  { bg: "var(--ivory)",  color: "var(--muted-text)", border: "var(--line-2)",              label: "Member"  },
  visitor: { bg: "white",    color: "var(--muted-text)", border: "#D8D3C8",              label: "Visitor" },
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

const SECTION_LABEL: React.CSSProperties = { ...EYEBROW_STYLE, fontWeight: 400 }

const CARD: React.CSSProperties = {
  background: "var(--cream-panel)", borderRadius: "14px", border: "1px solid var(--line)",
}

export function SettingsTab({
  ministryId,
  ministryName,
  ministryIsPublic: initialIsPublic,
  onPublicChange,
  userRole,
  userId,
  userName,
}: {
  ministryId: string
  ministryName: string
  ministryIsPublic: boolean
  onPublicChange: (v: boolean) => void
  userRole: string
  userId: string
  userName: string
}) {
  const supabase = createClient()
  const { setParam } = useNavState()
  const isAdmin = ["admin", "deacon", "elder", "pastor"].includes(userRole.toLowerCase())

  const [activeSettingsTab, setActiveSettingsTab] = useState<ActiveSettingsTab>(() => {
    if (typeof window === "undefined") return "general"
    const p = new URLSearchParams(window.location.search).get("stab")
    return (["general", "people", "governance", "automations", "workspace", "audit"].includes(p ?? "") ? p as ActiveSettingsTab : "general")
  })
  function goToSettingsTab(t: ActiveSettingsTab) {
    setActiveSettingsTab(t)
    setParam("stab", t === "general" ? null : t)
  }

  // People tab state
  const [peopleSearch, setPeopleSearch] = useState("")
  const [peopleFilter, setPeopleFilter] = useState<RoleFilter>("all")
  const [peopleRoleMenuOpen, setPeopleRoleMenuOpen] = useState<string | null>(null)
  const [peopleChangingRole, setPeopleChangingRole] = useState<string | null>(null)
  const [peopleRemoveConfirmId, setPeopleRemoveConfirmId] = useState<string | null>(null)
  const [peopleRemoving, setPeopleRemoving] = useState(false)
  const [peopleExcomConfirmId, setPeopleExcomConfirmId] = useState<string | null>(null)
  const [excomming, setExcomming] = useState(false)
  const [bannedMembers, setBannedMembers] = useState<Array<{ user_id: string; name: string | null; email: string | null; created_at: string }>>([])
  const [loadingBanned, setLoadingBanned] = useState(false)
  const [maintenanceRunning, setMaintenanceRunning] = useState(false)
  const [maintenanceResult, setMaintenanceResult] = useState<string | null>(null)
  const [cleanupRunning, setCleanupRunning] = useState(false)
  const [cleanupResult, setCleanupResult] = useState<string | null>(null)
  // retroactiveMsg removed — replaced by automationSaveMsg in Automations state block below

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

  const totalMembers = members.length
  const totalLeaders = members.filter(m => m.role.toLowerCase() === "leader").length
  const totalAdmins = members.filter(m => ["admin", "deacon", "elder", "pastor"].includes(m.role.toLowerCase())).length
  const totalVisitors = members.filter(m => m.role.toLowerCase() === "visitor").length

  // Invite code
  const [inviteCode, setInviteCode] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const [showRegenerateConfirm, setShowRegenerateConfirm] = useState(false)
  const [regenerating, setRegenerating] = useState(false)

  // Staff invite code
  const [staffCode, setStaffCode] = useState<string | null>(null)
  const [staffCopied, setStaffCopied] = useState(false)
  const [showStaffRegenerateConfirm, setShowStaffRegenerateConfirm] = useState(false)
  const [regeneratingStaff, setRegeneratingStaff] = useState(false)

  // Calendar feed
  const calFeedUrl = `https://www.joincentral.app/api/calendar/${ministryId}`
  const gcalUrl = `https://calendar.google.com/calendar/r/settings/addbyurl`
  const [calCopied, setCalCopied] = useState(false)
  function copyCalUrl() {
    navigator.clipboard.writeText(calFeedUrl)
    setCalCopied(true)
    setTimeout(() => setCalCopied(false), 2000)
  }
  function openGoogleCalendar() {
    navigator.clipboard.writeText(calFeedUrl)
    setCalCopied(true)
    setTimeout(() => setCalCopied(false), 3000)
    window.open(gcalUrl, "_blank", "noopener,noreferrer")
  }

  // Discovery
  const [isPublic, setIsPublic] = useState(initialIsPublic)
  const [toggling, setToggling] = useState(false)

  // Automations
  const AUTOMATION_DEFAULTS: Record<string, boolean> = {
    auto_sg_chats: true,
    auto_grade_chats: false,
    auto_central_chat: true,
    auto_staff_chat: false,
    auto_praise_chat: true,
    auto_archive_praise: true,
  }
  const [automationSettings, setAutomationSettings] = useState<Record<string, boolean>>(AUTOMATION_DEFAULTS)
  const [pendingAutomationSettings, setPendingAutomationSettings] = useState<Record<string, boolean>>(AUTOMATION_DEFAULTS)
  const [savingAutomations, setSavingAutomations] = useState(false)
  const [automationSaveMsg, setAutomationSaveMsg] = useState<string | null>(null)
  const [showArchiveWarning, setShowArchiveWarning] = useState(false)
  const [pendingArchiveLabels, setPendingArchiveLabels] = useState<string[]>([])

  // Danger Zone
  const [showArchiveConfirm, setShowArchiveConfirm] = useState(false)
  const [archiveConfirmText, setArchiveConfirmText] = useState("")
  const [archiving, setArchiving] = useState(false)

  // Schools
  const [schools, setSchools] = useState<{ id: string; name: string; abbreviation: string; sort_order: number }[]>([])
  const [addingSchool, setAddingSchool] = useState(false)
  const [newSchoolName, setNewSchoolName] = useState("")
  const [newSchoolAbbr, setNewSchoolAbbr] = useState("")
  const [savingSchool, setSavingSchool] = useState(false)
  const [schoolError, setSchoolError] = useState<string | null>(null)

  // Receipt limits
  const [receiptLimits, setReceiptLimits] = useState<ReceiptLimit[]>([])
  const [addingLimit, setAddingLimit] = useState(false)
  const [newLimitCategory, setNewLimitCategory] = useState("dg_dinner")
  const [newLimitFund, setNewLimitFund] = useState("church")
  const [newLimitAmount, setNewLimitAmount] = useState("")
  const [savingLimit, setSavingLimit] = useState(false)
  const [limitError, setLimitError] = useState<string | null>(null)
  const [editingLimitId, setEditingLimitId] = useState<string | null>(null)
  const [editingLimitAmount, setEditingLimitAmount] = useState("")
  const [savingLimitEdit, setSavingLimitEdit] = useState(false)

  // Daily verse rotation
  const [homeVerses, setHomeVerses] = useState<HomeVerse[]>([])
  const [addingVerse, setAddingVerse] = useState(false)
  const [newVerseRef, setNewVerseRef] = useState("")
  const [newVerseText, setNewVerseText] = useState("")
  const [savingVerse, setSavingVerse] = useState(false)
  const [editingVerseId, setEditingVerseId] = useState<string | null>(null)
  const [verseRefDraft, setVerseRefDraft] = useState("")
  const [verseTextDraft, setVerseTextDraft] = useState("")
  const [confirmDeleteVerseId, setConfirmDeleteVerseId] = useState<string | null>(null)
  const [deletingVerseId, setDeletingVerseId] = useState<string | null>(null)
  const [dragOverVerseIdx, setDragOverVerseIdx] = useState<number | null>(null)

  // Audit log
  const [auditLogs, setAuditLogs] = useState<Array<{ id: string; actor_name: string; action: string; entity_type: string; entity_label: string | null; metadata: Record<string, unknown> | null; created_at: string }>>([])
  const [auditLoading, setAuditLoading] = useState(false)

  // Governance
  const [governanceSettings, setGovernanceSettings] = useState<GovernanceSettings>({ all_admins: true, roster_ids: [] })
  const [govTeams, setGovTeams] = useState<GovTeamRow[]>([])
  const [govError, setGovError] = useState<string | null>(null)

  // Loading
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      const [{ data: min }, { data: profiles }, { data: schoolRows }, limitsRes, verses, { data: teamRows }] = await Promise.all([
        supabase.from("ministries").select("name, university, size, invite_code, staff_invite_code, is_public, automation_settings, governance_settings").eq("id", ministryId).maybeSingle(),
        supabase.from("profiles").select("id, name, email, role, graduation_year").eq("ministry_id", ministryId).order("name"),
        supabase.from("ministry_schools").select("id, name, abbreviation, sort_order").eq("ministry_id", ministryId).order("sort_order"),
        getReceiptLimits(ministryId),
        getHomeVerses(ministryId),
        supabase.from("teams").select("id, name, icon, admin_access").eq("ministry_id", ministryId).order("name"),
      ])

      if (min) {
        setMinistryInfo({ name: min.name, university: min.university, size: min.size })
        setInviteCode(min.invite_code)
        setStaffCode(min.staff_invite_code ?? null)
        setIsPublic(min.is_public ?? false)
        if (min.automation_settings) {
          const merged = { ...AUTOMATION_DEFAULTS, ...(min.automation_settings as Record<string, boolean>) }
          setAutomationSettings(merged)
          setPendingAutomationSettings(merged)
        }
        const gov = min.governance_settings as GovernanceSettings | null
        if (gov && typeof gov.all_admins === "boolean") {
          setGovernanceSettings({ all_admins: gov.all_admins, roster_ids: Array.isArray(gov.roster_ids) ? gov.roster_ids : [] })
        }
      }
      setGovTeams((teamRows ?? []).map((t) => ({ id: t.id, name: t.name, icon: t.icon, admin_access: (t.admin_access ?? "view") as "none" | "view" | "write" })))
      setSchools((schoolRows ?? []) as { id: string; name: string; abbreviation: string; sort_order: number }[])
      setReceiptLimits(limitsRes.data)
      setMembers(profiles ?? [])
      setHomeVerses(verses)
      setLoading(false)
    }
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ministryId])

  useEffect(() => {
    if (activeSettingsTab === "people" && isAdmin && bannedMembers.length === 0) {
      loadBannedMembers()
    }
    if (activeSettingsTab === "audit" && isAdmin && auditLogs.length === 0) {
      setAuditLoading(true)
      supabase.from("audit_logs").select("id, actor_name, action, entity_type, entity_label, metadata, created_at").eq("ministry_id", ministryId).order("created_at", { ascending: false }).limit(100)
        .then(({ data }) => { setAuditLogs((data ?? []) as typeof auditLogs); setAuditLoading(false) })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeSettingsTab])

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
  async function handleRoleChange(memberId: string, newRole: "visitor" | "member" | "leader" | "admin" | "deacon" | "elder" | "pastor") {
    const target = members.find(m => m.id === memberId)
    const { error } = await updateMemberRole(memberId, newRole)
    if (!error) {
      setMembers(prev => prev.map(m => m.id === memberId ? { ...m, role: newRole } : m))
      logAudit({ ministryId, actorId: userId, actorName: userName, action: "member.role_change", entityType: "member", entityId: memberId, entityLabel: target?.name ?? null, metadata: { old_role: target?.role ?? null, new_role: newRole } })
    }
  }

  // ── Remove member ───────────────────────────────────────────────────────────
  async function handleRemoveMember(memberId: string) {
    const target = members.find(m => m.id === memberId)
    const { error } = await removeMember(memberId)
    if (!error) {
      setMembers(prev => prev.filter(m => m.id !== memberId))
      logAudit({ ministryId, actorId: userId, actorName: userName, action: "member.remove", entityType: "member", entityId: memberId, entityLabel: target?.name ?? null })
    }
  }

  // ── Excommunicate member ─────────────────────────────────────────────────────
  async function handleExcommunicate(memberId: string) {
    setExcomming(true)
    const target = members.find(m => m.id === memberId)
    const { error } = await excommunicateMember(memberId)
    if (!error) {
      setMembers(prev => prev.filter(m => m.id !== memberId))
      if (target) setBannedMembers(prev => [{ user_id: memberId, name: target.name, email: target.email, created_at: new Date().toISOString() }, ...prev])
      logAudit({ ministryId, actorId: userId, actorName: userName, action: "member.excommunicate", entityType: "member", entityId: memberId, entityLabel: target?.name ?? null })
    }
    setExcomming(false)
    setPeopleExcomConfirmId(null)
  }

  // ── Load banned members ──────────────────────────────────────────────────────
  async function loadBannedMembers() {
    setLoadingBanned(true)
    const { data } = await getBannedMembers(ministryId)
    if (data) setBannedMembers(data)
    setLoadingBanned(false)
  }

  // ── Annual maintenance ───────────────────────────────────────────────────────
  async function handleRunMaintenance() {
    setMaintenanceRunning(true)
    setMaintenanceResult(null)
    const { created, graduated, error } = await runAnnualClassMaintenance(ministryId)
    if (error) { setMaintenanceResult(`Error: ${error}`) }
    else {
      const parts = []
      if (created) parts.push(`Created: ${created}`)
      if (graduated) parts.push(`Graduated: ${graduated}`)
      setMaintenanceResult(parts.length ? parts.join(" · ") : "Nothing to do for this cycle.")
    }
    setMaintenanceRunning(false)
  }

  // ── Departed member cleanup ──────────────────────────────────────────────────
  async function handleRunDepartedCleanup() {
    setCleanupRunning(true)
    setCleanupResult(null)
    const { cleaned, error } = await runDepartedMemberCleanup(ministryId)
    if (error) { setCleanupResult(`Error: ${error}`) }
    else { setCleanupResult(cleaned > 0 ? `Cleaned up ${cleaned} member${cleaned !== 1 ? "s" : ""}.` : "No members ready for cleanup yet (< 30 days).") }
    setCleanupRunning(false)
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

  function copyStaffCode() {
    if (!staffCode) return
    navigator.clipboard.writeText(staffCode)
    setStaffCopied(true)
    setTimeout(() => setStaffCopied(false), 2000)
  }

  async function handleRegenerateStaff() {
    setRegeneratingStaff(true)
    setShowStaffRegenerateConfirm(false)
    const { code, error } = await regenerateStaffCode()
    if (!error && code) setStaffCode(code)
    setRegeneratingStaff(false)
  }

  // ── Automation toggle ────────────────────────────────────────────────────────
  const CHAT_TOGGLES = ["auto_central_chat", "auto_grade_chats", "auto_staff_chat", "auto_sg_chats"]
  const OPT_IN_KEYS = ["auto_grade_chats", "auto_staff_chat"]
  const ARCHIVE_ON_OFF_KEYS = ["auto_staff_chat", "auto_grade_chats"]

  function isToggleOn(key: string, settings: Record<string, boolean>) {
    return OPT_IN_KEYS.includes(key) ? settings[key] === true : settings[key] !== false
  }

  function handleAutomationToggle(key: string) {
    if (!isAdmin) return
    setPendingAutomationSettings(prev => ({ ...prev, [key]: !isToggleOn(key, prev) }))
  }

  const hasAutomationChanges = JSON.stringify(pendingAutomationSettings) !== JSON.stringify(automationSettings)

  async function commitSaveAutomations() {
    setSavingAutomations(true)
    setShowArchiveWarning(false)
    await updateAutomationSettings(ministryId, pendingAutomationSettings)

    const allKeys = new Set([...Object.keys(automationSettings), ...Object.keys(pendingAutomationSettings)])
    for (const key of allKeys) {
      const wasOn = isToggleOn(key, automationSettings)
      const isNowOn = isToggleOn(key, pendingAutomationSettings)
      if (!isNowOn && wasOn) {
        await archiveToggleChats(ministryId, key)
      } else if (isNowOn && !wasOn && CHAT_TOGGLES.includes(key)) {
        setAutomationSaveMsg("Adding existing members…")
        await retroactivelyApplyToggle(ministryId, key)
      }
    }

    setAutomationSettings(pendingAutomationSettings)
    setSavingAutomations(false)
    setAutomationSaveMsg("Changes saved.")
    setTimeout(() => setAutomationSaveMsg(null), 4000)
  }

  async function handleSaveAutomations() {
    // Collect which destructive toggles are being turned OFF
    const archiveLabels: string[] = []
    for (const key of ARCHIVE_ON_OFF_KEYS) {
      const wasOn = isToggleOn(key, automationSettings)
      const isNowOn = isToggleOn(key, pendingAutomationSettings)
      if (!isNowOn && wasOn) {
        if (key === "auto_staff_chat") archiveLabels.push(`${ministryInfo?.name ?? ministryName} Staff chat`)
        if (key === "auto_grade_chats") archiveLabels.push("all Class of {year} chats")
      }
    }
    if (archiveLabels.length > 0) {
      setPendingArchiveLabels(archiveLabels)
      setShowArchiveWarning(true)
      return
    }
    await commitSaveAutomations()
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

  async function handleAddSchool() {
    const name = newSchoolName.trim()
    const abbr = newSchoolAbbr.trim()
    if (!name || !abbr) return
    setSavingSchool(true)
    setSchoolError(null)
    const { data, error } = await supabase.from("ministry_schools").insert({ ministry_id: ministryId, name, abbreviation: abbr, sort_order: schools.length }).select("id, name, abbreviation, sort_order").single()
    if (error || !data) { setSchoolError("Failed to add school."); setSavingSchool(false); return }
    setSchools(prev => [...prev, data as { id: string; name: string; abbreviation: string; sort_order: number }])
    setNewSchoolName("")
    setNewSchoolAbbr("")
    setAddingSchool(false)
    setSavingSchool(false)
  }

  async function handleDeleteSchool(id: string) {
    const { error } = await supabase.from("ministry_schools").delete().eq("id", id).eq("ministry_id", ministryId)
    if (!error) setSchools(prev => prev.filter(s => s.id !== id))
  }

  async function handleAddLimit() {
    const amount = parseFloat(newLimitAmount)
    if (isNaN(amount) || amount <= 0) { setLimitError("Please enter a positive amount."); return }
    if (amount > 1_000_000) { setLimitError("Amount cannot exceed $1,000,000."); return }
    setLimitError(null)
    setSavingLimit(true)
    const { error } = await upsertReceiptLimit({ ministryId, category: newLimitCategory, fund: newLimitFund, maxAmount: amount })
    if (!error) {
      const { data: fresh } = await getReceiptLimits(ministryId)
      setReceiptLimits(fresh)
      setAddingLimit(false)
      setNewLimitAmount("")
    }
    setSavingLimit(false)
  }

  async function handleDeleteLimit(id: string) {
    const { error } = await deleteReceiptLimit(id)
    if (!error) setReceiptLimits(prev => prev.filter(l => l.id !== id))
  }

  async function handleSaveLimitEdit(limitId: string, category: string, fund: string) {
    const amount = parseFloat(editingLimitAmount)
    if (isNaN(amount) || amount <= 0 || amount > 1_000_000) return
    setSavingLimitEdit(true)
    const { error } = await upsertReceiptLimit({ ministryId, category, fund, maxAmount: amount })
    if (!error) {
      const { data: fresh } = await getReceiptLimits(ministryId)
      setReceiptLimits(fresh)
      setEditingLimitId(null)
      setEditingLimitAmount("")
    }
    setSavingLimitEdit(false)
  }

  // ── Verse handlers ──────────────────────────────────────────────────────────
  async function handleAddVerse() {
    if (!newVerseRef.trim() || !newVerseText.trim() || savingVerse) return
    setSavingVerse(true)
    const { data, error } = await addHomeVerse(ministryId, newVerseRef.trim(), newVerseText.trim(), userId)
    setSavingVerse(false)
    if (!error && data) {
      setHomeVerses(prev => [...prev, data])
      setNewVerseRef("")
      setNewVerseText("")
      setAddingVerse(false)
    }
  }

  async function handleUpdateVerse(id: string) {
    if (!verseRefDraft.trim() || !verseTextDraft.trim() || savingVerse) return
    setSavingVerse(true)
    const { error } = await updateHomeVerse(id, verseRefDraft.trim(), verseTextDraft.trim())
    setSavingVerse(false)
    if (!error) {
      setHomeVerses(prev => prev.map(v => v.id === id ? { ...v, reference: verseRefDraft.trim(), text: verseTextDraft.trim() } : v))
      setEditingVerseId(null)
    }
  }

  async function handleDeleteVerse(id: string) {
    setDeletingVerseId(id)
    const { error } = await deleteHomeVerse(id)
    setDeletingVerseId(null)
    if (!error) {
      setHomeVerses(prev => prev.filter(v => v.id !== id))
      setConfirmDeleteVerseId(null)
    }
  }

  function handleVerseDragStart(e: React.DragEvent, idx: number) {
    e.dataTransfer.setData("verseIdx", String(idx))
    e.dataTransfer.effectAllowed = "move"
  }

  async function handleVerseDrop(e: React.DragEvent, targetIdx: number) {
    e.preventDefault()
    const fromIdx = parseInt(e.dataTransfer.getData("verseIdx"), 10)
    if (isNaN(fromIdx) || fromIdx === targetIdx) { setDragOverVerseIdx(null); return }
    const reordered = [...homeVerses]
    const [moved] = reordered.splice(fromIdx, 1)
    reordered.splice(targetIdx, 0, moved)
    const updated = reordered.map((v, i) => ({ ...v, order_index: i }))
    setHomeVerses(updated)
    setDragOverVerseIdx(null)
    await reorderHomeVerses(ministryId, updated.map(v => v.id))
  }

  // ── Governance handlers ──────────────────────────────────────────────────────
  const adminMembers = members.filter(m => ["admin", "deacon", "elder", "pastor"].includes(m.role.toLowerCase()))

  async function persistGovernance(next: GovernanceSettings, prev: GovernanceSettings) {
    setGovError(null)
    const { error } = await updateGovernanceSettings(next)
    if (error) { setGovernanceSettings(prev); setGovError(error) }
  }

  function handleToggleAllAdmins() {
    const prev = governanceSettings
    const next = { ...prev, all_admins: !prev.all_admins }
    setGovernanceSettings(next)
    persistGovernance(next, prev)
  }

  function handleToggleRosterMember(memberId: string) {
    const prev = governanceSettings
    const inRoster = prev.roster_ids.includes(memberId)
    const next = {
      ...prev,
      roster_ids: inRoster ? prev.roster_ids.filter(id => id !== memberId) : [...prev.roster_ids, memberId],
    }
    setGovernanceSettings(next)
    persistGovernance(next, prev)
  }

  async function handleTeamAccessChange(teamId: string, access: "none" | "view" | "write") {
    const prev = govTeams
    setGovError(null)
    setGovTeams(t => t.map(x => x.id === teamId ? { ...x, admin_access: access } : x))
    const { error } = await updateTeamAdminAccess(teamId, access)
    if (error) { setGovTeams(prev); setGovError(error) }
  }

  const now = new Date()
  const dayOfYear = Math.floor((now.getTime() - new Date(now.getFullYear(), 0, 0).getTime()) / 86_400_000)
  const todayVerseId = homeVerses.length > 0 ? homeVerses[dayOfYear % homeVerses.length]?.id : null

  const peopleFiltered = members.filter(m => {
    const role = m.role.toLowerCase()
    const roleMatch = peopleFilter === "all"
      || (peopleFilter === "admin" && ["admin", "deacon", "elder", "pastor"].includes(role))
      || (peopleFilter !== "admin" && role === peopleFilter)
    const s = peopleSearch.toLowerCase().trim()
    return roleMatch && (!s || m.name.toLowerCase().includes(s) || m.email.toLowerCase().includes(s))
  })

  const TABS: { key: ActiveSettingsTab; label: string }[] = [
    { key: "general", label: "General" },
    { key: "people", label: "People" },
    ...(isAdmin ? [{ key: "governance" as ActiveSettingsTab, label: "Governance" }] : []),
    { key: "automations", label: "Automations" },
    { key: "workspace", label: "Workspace" },
    ...(isAdmin ? [{ key: "audit" as ActiveSettingsTab, label: "Audit Log" }] : []),
  ]

  return (
    <div className="pb-28 md:pb-0 md:flex md:flex-col md:h-full md:overflow-hidden">
      {/* Mobile header */}
      <div className="md:hidden px-5 pt-14 pb-5">
        <p style={EYEBROW_STYLE}>
          {isAdmin ? "Ministry Admin" : "Ministry Workspace"}
        </p>
        <h1 style={{ fontFamily: "var(--serif)", fontSize: 32, color: "var(--ink)", fontWeight: 600, letterSpacing: "-0.02em", lineHeight: 1.05, margin: "12px 0 0" }}>Church Settings</h1>
      </div>

      {/* Desktop header */}
      <TabPageHeader>
        <PageTitle eyebrow={isAdmin ? "Ministry Admin" : "Ministry Workspace"} title="Church Settings" />
      </TabPageHeader>

      {/* Scrollable content: tab strip + tab panels */}
      <div className="md:flex-1 md:overflow-y-auto md:pb-10">
        {/* ── Tab strip — edge-to-edge per §4.2 ── */}
        <div>
          <PlanSubTabStrip
            tabs={TABS}
            active={activeSettingsTab}
            onChange={(k) => goToSettingsTab(k as ActiveSettingsTab)}
          />
        </div>

        {loading ? (
          <div className="px-5 md:px-14" style={{ color: "var(--muted-text)", fontSize: "14px", marginTop: 40 }}>Loading…</div>
        ) : (
          <>

          {/* ══════════════════ GENERAL TAB ══════════════════ */}
          {activeSettingsTab === "general" && (
            <div className="px-5 md:px-14" style={{ display: "flex", flexDirection: "column", gap: 32, marginTop: 40 }}>

              {/* Ministry Profile */}
              <section>
                <div style={{ marginBottom: 20 }}>
                  <SectionHeader eyebrow="Ministry Identity" title="Profile" titleSize={20} />
                  <p style={{ marginTop: 8, fontSize: 14, color: "var(--body)", lineHeight: 1.55 }}>The name, school, and visual identity members see when they find your ministry.</p>
                </div>
                <div style={{ ...CARD, padding: "22px 26px", display: "flex", alignItems: "center", gap: 20 }}>
                  <MonogramChip
                    initials={(ministryInfo?.name ?? ministryName)[0]}
                    className="flex-shrink-0"
                    style={{ width: 64, height: 64, fontFamily: "var(--font-instrument-serif)", fontSize: 30 }}
                  />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    {editingName ? (
                      <input autoFocus value={nameDraft} onChange={e => setNameDraft(e.target.value)} onKeyDown={e => { if (e.key === "Enter") saveMinistryField("name", nameDraft); if (e.key === "Escape") setEditingName(false) }} onBlur={() => saveMinistryField("name", nameDraft)} style={{ fontFamily: "var(--font-instrument-serif)", fontSize: "28px", letterSpacing: -0.3, color: "var(--ink)", lineHeight: 1.1, background: "transparent", border: "none", borderBottom: "1px solid var(--line-2)", outline: "none", padding: 0, width: "100%" }} />
                    ) : (
                      <div className="group flex items-center gap-2" style={{ cursor: isAdmin ? "text" : "default" }} onClick={isAdmin ? () => { setNameDraft(ministryInfo?.name ?? ministryName); setEditingName(true) } : undefined}>
                        <p style={{ fontFamily: "var(--font-instrument-serif)", fontSize: "28px", letterSpacing: -0.3, color: "var(--ink)", lineHeight: 1.1 }}>{ministryInfo?.name ?? ministryName}</p>
                        {isAdmin && <Pencil className="opacity-0 group-hover:opacity-100 transition-opacity duration-150" style={{ width: 13, height: 13, color: "var(--muted-text)", flexShrink: 0 }} />}
                      </div>
                    )}
                    {editingUniversity ? (
                      <input autoFocus value={universityDraft} onChange={e => setUniversityDraft(e.target.value)} onKeyDown={e => { if (e.key === "Enter") saveMinistryField("university", universityDraft); if (e.key === "Escape") setEditingUniversity(false) }} onBlur={() => saveMinistryField("university", universityDraft)} style={{ fontSize: "14px", color: "var(--body)", marginTop: 4, background: "transparent", border: "none", borderBottom: "1px solid var(--line-2)", outline: "none", padding: 0, width: "100%" }} />
                    ) : (
                      <div className="group flex items-center gap-1" style={{ cursor: isAdmin ? "text" : "default", marginTop: 4 }} onClick={isAdmin ? () => { setUniversityDraft(ministryInfo?.university ?? ""); setEditingUniversity(true) } : undefined}>
                        <p style={{ fontSize: "14px", color: "var(--body)" }}>{ministryInfo?.university ?? "—"}</p>
                        {isAdmin && <Pencil className="opacity-0 group-hover:opacity-100 transition-opacity duration-150" style={{ width: 11, height: 11, color: "var(--muted-text)", flexShrink: 0 }} />}
                      </div>
                    )}
                    {infoError && <p style={{ fontSize: "12px", color: "var(--danger)", marginTop: 4 }}>{infoError}</p>}
                  </div>
                </div>
              </section>

              {/* Discovery + Schools 2-col */}
              <section>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 28 }}>
                  {/* Discovery */}
                  <div>
                    <div style={{ marginBottom: 16 }}>
                      <SectionHeader eyebrow="Discovery" title={`Who can find ${ministryInfo?.name ?? ministryName}`} titleSize={20} />
                    </div>
                    <div style={{ ...CARD, padding: "20px 22px", display: "flex", alignItems: "flex-start", gap: 16 }}>
                      <button onClick={isAdmin ? handleToggle : undefined} disabled={toggling || !isAdmin} style={{ width: 38, height: 22, borderRadius: 999, border: "none", background: isPublic ? "var(--plum)" : "#D6D0C0", position: "relative", flexShrink: 0, cursor: isAdmin ? "pointer" : "not-allowed", padding: 0, opacity: !isAdmin ? 0.5 : 1 }}>
                        <span style={{ position: "absolute", width: 18, height: 18, borderRadius: 999, background: "var(--cream)", top: 2, ...(isPublic ? { right: 2 } : { left: 2 }) }} />
                      </button>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: 14, fontWeight: 500, color: "var(--ink)" }}>Public discovery</div>
                        <div style={{ marginTop: 4, fontSize: 13, color: "var(--body)", lineHeight: 1.5 }}>{isPublic ? "Anyone can find and join without an invite code." : "Invite-only — code required to join."}</div>
                      </div>
                    </div>
                  </div>

                  {/* Schools */}
                  <div>
                    <div style={{ marginBottom: 16 }}>
                      <SectionHeader eyebrow="Schools" title="Linked campuses" titleSize={20} action={isAdmin && !addingSchool ? (<button onClick={() => setAddingSchool(true)} style={{ padding: "7px 12px", borderRadius: 10, border: "1px solid var(--line-2)", background: "transparent", color: "var(--body)", fontSize: 13, cursor: "pointer", flexShrink: 0 }}>+ Add school</button>) : undefined} />
                    </div>
                    <div style={{ ...CARD, overflow: "hidden" }}>
                      {schools.length === 0 && !addingSchool && <div style={{ padding: "16px 20px" }}><p style={{ fontSize: 13, color: "var(--muted-text)" }}>No schools added yet.</p></div>}
                      {schools.length > 0 && (
                        <div style={{ padding: "16px 18px", display: "flex", flexWrap: "wrap", gap: 8 }}>
                          {schools.map(s => (
                            <span key={s.id} style={{ display: "inline-flex", alignItems: "center", gap: 8, padding: "6px 12px", borderRadius: 999, background: "var(--ivory)", color: "var(--plum-2)", border: "1px solid var(--line-2)", fontSize: 13 }}>
                              <span style={{ fontWeight: 500 }}>{s.name}</span>
                              <span style={{ color: "var(--muted-text)", fontSize: 12 }}>({s.abbreviation})</span>
                              {isAdmin && <button onClick={() => handleDeleteSchool(s.id)} style={{ background: "none", border: "none", padding: 0, color: "var(--muted-text)", cursor: "pointer", lineHeight: 1, fontSize: 16 }}>×</button>}
                            </span>
                          ))}
                        </div>
                      )}
                      {isAdmin && addingSchool && (
                        <div style={{ padding: "16px 18px", borderTop: schools.length > 0 ? "1px solid var(--line-3)" : undefined }}>
                          {schoolError && <p style={{ fontSize: 12, color: "var(--danger)", marginBottom: 8 }}>{schoolError}</p>}
                          <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 10 }}>
                            <input autoFocus type="text" placeholder="School name (e.g. University of Pittsburgh)" value={newSchoolName} onChange={e => setNewSchoolName(e.target.value)} style={{ width: "100%", border: "1.5px solid var(--line-2)", borderRadius: 8, padding: "7px 10px", fontSize: 13, fontFamily: "inherit", outline: "none", boxSizing: "border-box" }} />
                            <input type="text" placeholder="Abbreviation (e.g. Pitt)" value={newSchoolAbbr} onChange={e => setNewSchoolAbbr(e.target.value)} style={{ width: "100%", border: "1.5px solid var(--line-2)", borderRadius: 8, padding: "7px 10px", fontSize: 13, fontFamily: "inherit", outline: "none", boxSizing: "border-box" }} />
                          </div>
                          <div style={{ display: "flex", gap: 8 }}>
                            <button onClick={() => { setAddingSchool(false); setNewSchoolName(""); setNewSchoolAbbr(""); setSchoolError(null) }} style={{ flex: 1, padding: "7px 0", background: "transparent", border: "1.5px solid var(--line-2)", borderRadius: 8, fontSize: 13, fontWeight: 500, cursor: "pointer", fontFamily: "inherit", color: "var(--body)" }}>Cancel</button>
                            <button onClick={handleAddSchool} disabled={savingSchool || !newSchoolName.trim() || !newSchoolAbbr.trim()} style={{ flex: 1, padding: "7px 0", background: "var(--plum)", border: "none", borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: savingSchool ? "not-allowed" : "pointer", fontFamily: "inherit", color: "var(--cream-on-dark)", opacity: savingSchool ? 0.6 : 1 }}>{savingSchool ? "Adding…" : "Add"}</button>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </section>

              {/* Daily Verse Rotation */}
              {isAdmin && (
                <section>
                  <div style={{ marginBottom: 20 }}>
                    <SectionHeader eyebrow="Daily Verse Rotation" title="Verses on the sidebar" titleSize={20} action={!addingVerse ? <button onClick={() => setAddingVerse(true)} style={{ padding: "7px 12px", borderRadius: 10, border: "1px solid var(--line-2)", background: "transparent", color: "var(--body)", fontSize: 13, cursor: "pointer", flexShrink: 0 }}>+ Add verse</button> : undefined} />
                    <p style={{ marginTop: 8, fontSize: 14, color: "var(--body)", lineHeight: 1.55 }}>Verses rotate daily in the order below. Drag to reorder. Today&apos;s verse is highlighted.</p>
                  </div>
                  <div style={{ border: "1px solid var(--line)", borderRadius: 14, background: "var(--cream-panel)", overflow: "hidden" }}>
                    {homeVerses.length === 0 && !addingVerse && (
                      <div style={{ padding: "20px 22px" }}><p style={{ fontSize: 13, color: "var(--muted-text)" }}>No verses yet. Add one to start the daily rotation.</p></div>
                    )}
                    {homeVerses.map((v, idx) => {
                      const isToday = v.id === todayVerseId
                      return (
                        <div key={v.id} style={{ background: dragOverVerseIdx === idx ? "#F7F4EF" : isToday ? "var(--cream-3)" : undefined, borderBottom: "1px solid var(--line-3)", transition: "background 100ms" }} draggable={editingVerseId !== v.id && confirmDeleteVerseId !== v.id} onDragStart={e => handleVerseDragStart(e, idx)} onDragOver={e => { e.preventDefault(); setDragOverVerseIdx(idx) }} onDragLeave={() => setDragOverVerseIdx(null)} onDrop={e => handleVerseDrop(e, idx)}>
                          {editingVerseId === v.id ? (
                            <div style={{ padding: "16px 22px", display: "flex", flexDirection: "column", gap: 8 }}>
                              <input autoFocus value={verseRefDraft} onChange={e => setVerseRefDraft(e.target.value)} placeholder="Reference (e.g. John 3:16)" style={{ width: "100%", border: "1.5px solid var(--line-2)", borderRadius: 8, padding: "7px 10px", fontSize: 13, fontFamily: "inherit", outline: "none", boxSizing: "border-box" }} />
                              <textarea value={verseTextDraft} onChange={e => setVerseTextDraft(e.target.value)} placeholder="Verse text" rows={3} style={{ width: "100%", border: "1.5px solid var(--line-2)", borderRadius: 8, padding: "7px 10px", fontSize: 13, fontFamily: "inherit", outline: "none", resize: "vertical", boxSizing: "border-box" }} />
                              <div style={{ display: "flex", gap: 8 }}>
                                <button onClick={() => setEditingVerseId(null)} style={{ flex: 1, padding: "6px 0", background: "transparent", border: "1.5px solid var(--line-2)", borderRadius: 8, fontSize: 13, fontWeight: 500, cursor: "pointer", fontFamily: "inherit", color: "var(--body)" }}>Cancel</button>
                                <button onClick={() => handleUpdateVerse(v.id)} disabled={savingVerse || !verseRefDraft.trim() || !verseTextDraft.trim()} style={{ flex: 1, padding: "6px 0", background: "var(--plum)", border: "none", borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: "inherit", color: "var(--cream-on-dark)", opacity: savingVerse ? 0.6 : 1 }}>{savingVerse ? "Saving…" : "Save"}</button>
                              </div>
                            </div>
                          ) : confirmDeleteVerseId === v.id ? (
                            <div style={{ padding: "16px 22px" }}>
                              <p style={{ fontSize: 12, color: "var(--body)", marginBottom: 8 }}>Remove &ldquo;{v.reference}&rdquo;?</p>
                              <div style={{ display: "flex", gap: 8 }}>
                                <button onClick={() => setConfirmDeleteVerseId(null)} style={{ flex: 1, padding: "5px 0", background: "transparent", border: "1.5px solid var(--line-2)", borderRadius: 8, fontSize: 12, fontWeight: 500, cursor: "pointer", fontFamily: "inherit", color: "var(--body)" }}>Cancel</button>
                                <button onClick={() => handleDeleteVerse(v.id)} disabled={deletingVerseId === v.id} style={{ flex: 1, padding: "5px 0", background: "var(--danger)", border: "none", borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: "inherit", color: "white", opacity: deletingVerseId === v.id ? 0.6 : 1 }}>{deletingVerseId === v.id ? "Removing…" : "Remove"}</button>
                              </div>
                            </div>
                          ) : (
                            <div className="group" style={{ display: "flex", alignItems: "flex-start", gap: 14, padding: "16px 22px" }}>
                              <span style={{ color: "var(--faint)", cursor: "grab", fontSize: 16, marginTop: 2, userSelect: "none", fontFamily: "ui-monospace, Menlo, monospace", flexShrink: 0 }}>⋮⋮</span>
                              <div style={{ flex: 1, minWidth: 0 }}>
                                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                                  <span style={{ fontSize: 14, fontWeight: 500, color: "var(--ink)" }}>{v.reference}</span>
                                  {isToday && <span style={{ padding: "2px 8px", borderRadius: 999, background: "var(--plum)", color: "var(--cream-panel)", fontSize: 10, letterSpacing: 0.6, textTransform: "uppercase", fontWeight: 500 }}>Today</span>}
                                </div>
                                <div style={{ marginTop: 4, fontSize: 13, color: "var(--muted-text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{v.text}</div>
                              </div>
                              <div className="opacity-0 group-hover:opacity-100 transition-opacity" style={{ display: "flex", alignItems: "center", gap: 2, flexShrink: 0 }}>
                                <button onClick={() => { setEditingVerseId(v.id); setVerseRefDraft(v.reference); setVerseTextDraft(v.text) }} style={{ padding: 6, background: "none", border: "none", cursor: "pointer", borderRadius: 6 }}><Pencil style={{ width: 13, height: 13, color: "var(--muted-text)" }} /></button>
                                <button onClick={() => setConfirmDeleteVerseId(v.id)} style={{ padding: 6, background: "none", border: "none", cursor: "pointer", borderRadius: 6 }}><X style={{ width: 13, height: 13, color: "var(--muted-text)" }} /></button>
                              </div>
                            </div>
                          )}
                        </div>
                      )
                    })}
                    {addingVerse ? (
                      <div style={{ padding: "16px 22px", display: "flex", flexDirection: "column", gap: 8, borderTop: homeVerses.length > 0 ? "1px solid var(--line-3)" : undefined }}>
                        <input autoFocus value={newVerseRef} onChange={e => setNewVerseRef(e.target.value)} placeholder="Reference (e.g. John 3:16)" style={{ width: "100%", border: "1.5px solid var(--line-2)", borderRadius: 8, padding: "7px 10px", fontSize: 13, fontFamily: "inherit", outline: "none", boxSizing: "border-box" }} />
                        <textarea value={newVerseText} onChange={e => setNewVerseText(e.target.value)} onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleAddVerse() } }} placeholder="Verse text" rows={3} style={{ width: "100%", border: "1.5px solid var(--line-2)", borderRadius: 8, padding: "7px 10px", fontSize: 13, fontFamily: "inherit", outline: "none", resize: "vertical", boxSizing: "border-box" }} />
                        <div style={{ display: "flex", gap: 8 }}>
                          <button onClick={() => { setAddingVerse(false); setNewVerseRef(""); setNewVerseText("") }} style={{ flex: 1, padding: "7px 0", background: "transparent", border: "1.5px solid var(--line-2)", borderRadius: 8, fontSize: 13, fontWeight: 500, cursor: "pointer", fontFamily: "inherit", color: "var(--body)" }}>Cancel</button>
                          <button onClick={handleAddVerse} disabled={savingVerse || !newVerseRef.trim() || !newVerseText.trim()} style={{ flex: 1, padding: "7px 0", background: "var(--plum)", border: "none", borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: savingVerse ? "not-allowed" : "pointer", fontFamily: "inherit", color: "var(--cream-on-dark)", opacity: savingVerse || !newVerseRef.trim() || !newVerseText.trim() ? 0.5 : 1 }}>{savingVerse ? "Adding…" : "Add verse"}</button>
                        </div>
                      </div>
                    ) : (
                      <div style={{ padding: "14px 22px", borderTop: homeVerses.length > 0 ? "1px solid var(--line-3)" : undefined }}>
                        <button onClick={() => setAddingVerse(true)} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 13, color: "var(--plum)", fontWeight: 500, fontFamily: "inherit", padding: 0 }}>+ Add verse</button>
                      </div>
                    )}
                  </div>
                </section>
              )}

              {/* Danger Zone */}
              {isAdmin && (
                <section>
                  <div style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: 22 }}>
                    <div style={{ flex: 1, height: 1, background: "var(--line)" }} />
                    <p style={{ fontFamily: "ui-monospace,'SF Mono',Menlo,monospace", fontSize: "10px", fontWeight: 400, letterSpacing: "1.2px", textTransform: "uppercase", color: "var(--danger)", whiteSpace: "nowrap" }}>Danger Zone</p>
                    <div style={{ flex: 1, height: 1, background: "var(--line)" }} />
                  </div>
                  <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 24 }}>
                    <div style={{ flex: 1 }}>
                      <p style={{ fontFamily: "var(--font-instrument-serif)", fontSize: "22px", fontWeight: 400, color: "var(--ink)", marginBottom: 6 }}>Archive ministry</p>
                      <p style={{ fontSize: "13px", color: "var(--body)", lineHeight: 1.6, maxWidth: "560px" }}>Deactivates the ministry. Members lose access immediately. Data is preserved and can be restored by contacting support.</p>
                    </div>
                    {!showArchiveConfirm ? (
                      <button onClick={() => setShowArchiveConfirm(true)} style={{ flexShrink: 0, padding: "10px 18px", borderRadius: 10, border: "1px solid var(--danger)", color: "var(--danger)", background: "transparent", fontSize: 13, fontWeight: 500, cursor: "pointer" }}>Archive</button>
                    ) : (
                      <div style={{ flexShrink: 0, display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 8 }}>
                        <p style={{ fontSize: "12px", color: "var(--muted-text)", textAlign: "right" }}>Type <strong style={{ color: "var(--ink)" }}>{ministryInfo?.name ?? ministryName}</strong> to confirm</p>
                        <input value={archiveConfirmText} onChange={e => setArchiveConfirmText(e.target.value)} placeholder="Ministry name…" style={{ padding: "8px 12px", borderRadius: 10, border: "1.5px solid var(--danger)", fontSize: 13, color: "var(--ink)", outline: "none", background: "var(--cream-panel)", width: 192, fontFamily: "inherit" }} />
                        <div style={{ display: "flex", gap: 8 }}>
                          <button onClick={() => { setShowArchiveConfirm(false); setArchiveConfirmText("") }} style={{ padding: "6px 12px", borderRadius: 10, border: "1px solid var(--line-2)", fontSize: 12, color: "var(--body)", cursor: "pointer", background: "transparent" }}>Cancel</button>
                          <button onClick={handleArchive} disabled={archiving || archiveConfirmText !== (ministryInfo?.name ?? ministryName)} style={{ padding: "6px 12px", borderRadius: 10, border: "1px solid var(--danger)", fontSize: 12, fontWeight: 600, color: "var(--danger)", background: "transparent", cursor: "pointer", opacity: archiving || archiveConfirmText !== (ministryInfo?.name ?? ministryName) ? 0.5 : 1 }}>{archiving ? "Archiving…" : "Archive ministry"}</button>
                        </div>
                      </div>
                    )}
                  </div>
                </section>
              )}
            </div>
          )}

          {/* ══════════════════ PEOPLE TAB ══════════════════ */}
          {activeSettingsTab === "people" && (
            <div className="px-5 md:px-14" style={{ display: "flex", flexDirection: "column", gap: 32, marginTop: 40 }}>
              <div>
                <SectionHeader eyebrow={`People · ${totalMembers}`} title="Members and roles" titleSize={20} />
                <p style={{ marginTop: 8, fontSize: 14, color: "var(--body)", lineHeight: 1.55 }}>Every person in {ministryInfo?.name ?? ministryName}, the role they hold, and how they joined.</p>
              </div>

              {/* Stat tiles */}
              <div style={{ display: "grid", gridTemplateColumns: "repeat(5, minmax(0, 1fr))", gap: 14 }}>
                {([
                  { label: "Members",  value: totalMembers,                                              filter: "all" as RoleFilter },
                  { label: "Admins",   value: totalAdmins,                                               filter: "admin" as RoleFilter },
                  { label: "Leaders",  value: totalLeaders,                                              filter: "leader" as RoleFilter },
                  { label: "Regular",  value: totalMembers - totalLeaders - totalAdmins - totalVisitors, filter: "member" as RoleFilter },
                  { label: "Visitors", value: totalVisitors,                                             filter: "visitor" as RoleFilter },
                ] as { label: string; value: number; filter: RoleFilter }[]).map(({ value, label, filter }) => (
                  <button key={label} onClick={() => setPeopleFilter(filter)} style={{ ...CARD, padding: "18px", cursor: "pointer", textAlign: "left", borderColor: peopleFilter === filter ? "var(--plum)" : "var(--line)" }}>
                    <p style={{ ...SECTION_LABEL, marginBottom: 8 }}>{label}</p>
                    <p style={{ fontFamily: "var(--font-instrument-serif)", fontSize: "32px", color: "var(--ink)", fontWeight: 400, lineHeight: 1 }}>{value}</p>
                  </button>
                ))}
              </div>

              {/* Search + filter */}
              <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
                <div style={{ flex: 1, minWidth: 280, maxWidth: 420, display: "flex", alignItems: "center", gap: 10, padding: "9px 14px", border: "1px solid var(--line-2)", borderRadius: 10, background: "var(--cream-panel)" }}>
                  <Search style={{ width: 15, height: 15, color: "var(--muted-text)", flexShrink: 0 }} />
                  <input value={peopleSearch} onChange={e => setPeopleSearch(e.target.value)} placeholder="Search members…" style={{ flex: 1, border: "none", outline: "none", background: "transparent", fontSize: 14, color: "var(--ink)", fontFamily: "var(--font-inter)" }} />
                </div>
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                  {(["all", "admin", "leader", "member", "visitor"] as const).map(f => (
                    <button key={f} onClick={() => setPeopleFilter(f)} style={{ padding: "7px 12px", borderRadius: 999, border: `1px solid ${peopleFilter === f ? "var(--plum)" : "var(--line-2)"}`, background: peopleFilter === f ? "var(--plum-2)" : "var(--cream-panel)", color: peopleFilter === f ? "var(--cream-panel)" : "var(--body)", fontSize: 12, fontWeight: peopleFilter === f ? 500 : 400, cursor: "pointer", fontFamily: "var(--font-inter)" }}>
                      {f === "all" ? "All" : f.charAt(0).toUpperCase() + f.slice(1)}
                    </button>
                  ))}
                </div>
              </div>

              {/* Remove confirm banner */}
              {peopleRemoveConfirmId && (() => {
                const target = members.find(m => m.id === peopleRemoveConfirmId)
                return (
                  <div style={{ borderRadius: 10, border: "1px solid #FEE2E2", background: "#FFF5F5", padding: "12px 16px", display: "flex", alignItems: "center", gap: 12 }}>
                    <AlertTriangle style={{ width: 16, height: 16, color: "#F87171", flexShrink: 0 }} />
                    <p style={{ fontSize: 13, color: "var(--body)", flex: 1, margin: 0 }}>Remove <strong style={{ color: "var(--ink)" }}>{target?.name}</strong> from this ministry?</p>
                    <button onClick={() => setPeopleRemoveConfirmId(null)} style={{ fontSize: 12, color: "var(--body)", background: "none", border: "none", cursor: "pointer", padding: "4px 8px" }}>Cancel</button>
                    <button onClick={async () => { setPeopleRemoving(true); await handleRemoveMember(peopleRemoveConfirmId); setPeopleRemoving(false); setPeopleRemoveConfirmId(null) }} disabled={peopleRemoving} style={{ fontSize: 12, fontWeight: 600, color: "var(--danger)", border: "1px solid var(--danger)", background: "transparent", borderRadius: 8, padding: "6px 12px", cursor: "pointer", opacity: peopleRemoving ? 0.6 : 1 }}>
                      {peopleRemoving ? "Removing…" : "Remove"}
                    </button>
                  </div>
                )
              })()}

              {/* Member list */}
              <div style={{ border: "1px solid var(--line)", borderRadius: 14, background: "var(--cream-panel)", overflow: "hidden" }}>
                {peopleFiltered.length === 0 ? (
                  <p style={{ fontSize: 13, color: "var(--muted-text)", padding: "24px", textAlign: "center" }}>{peopleSearch ? "No members match your search." : "No members found."}</p>
                ) : peopleFiltered.map((m, i) => {
                  const isMe = m.id === userId
                  const menuOpen = peopleRoleMenuOpen === m.id
                  return (
                    <div key={m.id} style={{ display: "flex", alignItems: "center", gap: 16, padding: "16px 22px", borderBottom: i < peopleFiltered.length - 1 ? "1px solid var(--line-3)" : "none", position: "relative" }}>
                      <MonogramChip initials={getInitials(m.name)} className="w-[38px] h-[38px] text-[13px] font-semibold" />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                          <span style={{ fontSize: 14, fontWeight: 500, color: "var(--ink)" }}>{m.name}</span>
                          {isMe && <span style={{ fontSize: 12, color: "var(--muted-text)" }}>you</span>}
                        </div>
                        <div style={{ marginTop: 2, fontSize: 13, color: "var(--muted-text)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{m.email}</div>
                      </div>
                      {peopleChangingRole === m.id ? <span style={{ fontSize: 11, color: "var(--muted-text)" }}>Saving…</span> : roleBadge(m.role)}
                      {isAdmin && !isMe && (
                        <div style={{ position: "relative" }}>
                          {menuOpen && <div style={{ position: "fixed", inset: 0, zIndex: 5 }} onClick={() => setPeopleRoleMenuOpen(null)} />}
                          <button onClick={() => setPeopleRoleMenuOpen(menuOpen ? null : m.id)} style={{ width: 28, height: 28, borderRadius: 6, display: "flex", alignItems: "center", justifyContent: "center", background: "none", border: "none", cursor: "pointer" }}>
                            <MoreHorizontal style={{ width: 16, height: 16, color: "var(--faint)" }} />
                          </button>
                          {menuOpen && (
                            <div style={{ position: "absolute", top: 32, right: 0, zIndex: 20, background: "var(--cream-panel)", borderRadius: 12, boxShadow: "0 4px 20px rgba(19,16,26,0.12)", border: "1px solid var(--line)", padding: "6px 0", minWidth: 160 }}>
                              <p style={{ fontFamily: "ui-monospace,'SF Mono',Menlo,monospace", fontSize: 10, color: "var(--muted-text)", padding: "4px 12px 6px", textTransform: "uppercase", letterSpacing: "1.2px", fontWeight: 400, margin: 0 }}>Set role</p>
                              {(["visitor", "member", "leader", "admin", "deacon", "elder", "pastor"] as const).map(r => (
                                <button key={r} onClick={async () => { setPeopleChangingRole(m.id); setPeopleRoleMenuOpen(null); await handleRoleChange(m.id, r); setPeopleChangingRole(null) }} style={{ width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between", padding: "8px 12px", fontSize: 13, background: "none", border: "none", cursor: "pointer", color: m.role.toLowerCase() === r ? "var(--plum)" : "var(--ink)", fontWeight: m.role.toLowerCase() === r ? 600 : 400, textAlign: "left", boxSizing: "border-box" }}>
                                  {r.charAt(0).toUpperCase() + r.slice(1)}
                                  {m.role.toLowerCase() === r && <Check style={{ width: 14, height: 14, color: "var(--plum)" }} />}
                                </button>
                              ))}
                              <div style={{ margin: "6px 12px", borderTop: "1px solid var(--line-3)" }} />
                              <button onClick={() => { setPeopleRemoveConfirmId(m.id); setPeopleRoleMenuOpen(null) }} style={{ width: "100%", display: "flex", alignItems: "center", gap: 8, padding: "8px 12px", fontSize: 13, color: "var(--danger)", background: "none", border: "none", cursor: "pointer", textAlign: "left", boxSizing: "border-box" }}>Remove from ministry</button>
                              <button onClick={() => { setPeopleExcomConfirmId(m.id); setPeopleRoleMenuOpen(null) }} style={{ width: "100%", display: "flex", alignItems: "center", gap: 8, padding: "8px 12px", fontSize: 13, color: "#7A1010", background: "none", border: "none", cursor: "pointer", textAlign: "left", boxSizing: "border-box", fontWeight: 600 }}>Excommunicate</button>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>

              {/* Excommunicate confirm banner */}
              {peopleExcomConfirmId && (() => {
                const target = members.find(m => m.id === peopleExcomConfirmId)
                return (
                  <div style={{ borderRadius: 10, border: "1px solid #F87171", background: "#FFF0F0", padding: "12px 16px", display: "flex", alignItems: "center", gap: 12 }}>
                    <AlertTriangle style={{ width: 16, height: 16, color: "var(--danger)", flexShrink: 0 }} />
                    <div style={{ flex: 1 }}>
                      <p style={{ fontSize: 13, color: "var(--body)", margin: "0 0 2px" }}>Excommunicate <strong style={{ color: "var(--ink)" }}>{target?.name}</strong>?</p>
                      <p style={{ fontSize: 12, color: "var(--danger)", margin: 0 }}>This is permanent. They will never be able to rejoin this ministry.</p>
                    </div>
                    <button onClick={() => setPeopleExcomConfirmId(null)} style={{ fontSize: 12, color: "var(--body)", background: "none", border: "none", cursor: "pointer", padding: "4px 8px" }}>Cancel</button>
                    <button onClick={() => handleExcommunicate(peopleExcomConfirmId)} disabled={excomming} style={{ fontSize: 12, fontWeight: 700, color: "var(--cream-panel)", border: "none", background: "#7A1010", borderRadius: 8, padding: "6px 12px", cursor: "pointer", opacity: excomming ? 0.6 : 1 }}>
                      {excomming ? "Banning…" : "Excommunicate"}
                    </button>
                  </div>
                )
              })()}

              {/* Banned members */}
              {isAdmin && bannedMembers.length > 0 && (
                <div>
                  <p style={{ ...SECTION_LABEL, marginBottom: 10 }}>Excommunicated</p>
                  <div style={{ border: "1px solid #F5D0D0", borderRadius: 14, background: "var(--cream-panel)", overflow: "hidden" }}>
                    {bannedMembers.map((b, i) => (
                      <div key={b.user_id} style={{ display: "flex", alignItems: "center", gap: 14, padding: "14px 20px", borderBottom: i < bannedMembers.length - 1 ? "1px solid #F5D0D0" : "none" }}>
                        <MonogramChip initials={getInitials(b.name ?? "?")} className="w-9 h-9 text-[13px] font-semibold" />
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: 14, fontWeight: 500, color: "var(--ink)" }}>{b.name ?? "Unknown"}</div>
                          <div style={{ fontSize: 12, color: "var(--muted-text)", marginTop: 1 }}>{b.email ?? ""}</div>
                        </div>
                        <span style={{ fontSize: 11, color: "var(--danger)", fontFamily: "ui-monospace, Menlo, monospace", letterSpacing: "0.05em", textTransform: "uppercase" }}>Banned</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ══════════════════ GOVERNANCE TAB ══════════════════ */}
          {activeSettingsTab === "governance" && isAdmin && (
            <div className="px-5 md:px-14" style={{ display: "flex", flexDirection: "column", gap: 32, marginTop: 40 }}>

              {govError && (
                <div style={{ borderRadius: 10, border: "1px solid #FEE2E2", background: "#FFF5F5", padding: "10px 14px", display: "flex", alignItems: "center", gap: 10 }}>
                  <AlertTriangle style={{ width: 15, height: 15, color: "#F87171", flexShrink: 0 }} />
                  <p style={{ fontSize: 13, color: "var(--body)", margin: 0 }}>{govError}</p>
                </div>
              )}

              {/* ── Governance roster ── */}
              <section>
                <div style={{ marginBottom: 20 }}>
                  <SectionHeader eyebrow="Governance" title="Who governs teams" titleSize={20} />
                  <p style={{ marginTop: 8, fontSize: 14, color: "var(--body)", lineHeight: 1.55 }}>Governance is oversight of teams they aren&apos;t members of — viewing or acting on a team&apos;s roster and work. Church Settings itself stays open to every admin regardless of this list.</p>
                </div>

                <div style={{ ...CARD, padding: "20px 22px", display: "flex", alignItems: "flex-start", gap: 16 }}>
                  <button onClick={handleToggleAllAdmins} style={{ width: 38, height: 22, borderRadius: 999, border: "none", background: governanceSettings.all_admins ? "var(--plum)" : "#D6D0C0", position: "relative", flexShrink: 0, cursor: "pointer", padding: 0 }}>
                    <span style={{ position: "absolute", width: 18, height: 18, borderRadius: 999, background: "var(--cream)", top: 2, ...(governanceSettings.all_admins ? { right: 2 } : { left: 2 }) }} />
                  </button>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 14, fontWeight: 500, color: "var(--ink)" }}>All admins can govern teams</div>
                    <div style={{ marginTop: 4, fontSize: 13, color: "var(--body)", lineHeight: 1.5 }}>{governanceSettings.all_admins ? "Every admin-tier member governs teams per the access matrix below." : "Only the people you select below govern teams."}</div>
                  </div>
                </div>

                {!governanceSettings.all_admins && (
                  <div style={{ marginTop: 16 }}>
                    <p style={{ ...SECTION_LABEL, marginBottom: 10 }}>Governing roster</p>
                    <div style={{ border: "1px solid var(--line)", borderRadius: 14, background: "var(--cream-panel)", overflow: "hidden" }}>
                      {adminMembers.length === 0 ? (
                        <p style={{ fontSize: 13, color: "var(--muted-text)", padding: "20px 22px", textAlign: "center" }}>No admin-tier members to choose from.</p>
                      ) : adminMembers.map((m, i) => {
                        const included = governanceSettings.roster_ids.includes(m.id)
                        return (
                          <div key={m.id} style={{ display: "flex", alignItems: "center", gap: 16, padding: "14px 22px", borderBottom: i < adminMembers.length - 1 ? "1px solid var(--line-3)" : "none" }}>
                            <MonogramChip initials={getInitials(m.name)} className="w-9 h-9 text-[13px] font-semibold" />
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div style={{ fontSize: 14, fontWeight: 500, color: "var(--ink)" }}>{m.name}</div>
                              <div style={{ marginTop: 2, fontSize: 13, color: "var(--muted-text)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{m.email}</div>
                            </div>
                            {roleBadge(m.role)}
                            <button onClick={() => handleToggleRosterMember(m.id)} style={{ width: 38, height: 22, borderRadius: 999, border: "none", background: included ? "var(--plum)" : "#D6D0C0", position: "relative", flexShrink: 0, cursor: "pointer", padding: 0 }}>
                              <span style={{ position: "absolute", width: 18, height: 18, borderRadius: 999, background: "var(--cream)", top: 2, ...(included ? { right: 2 } : { left: 2 }) }} />
                            </button>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                )}
              </section>

              {/* ── Per-team admin access matrix ── */}
              <section>
                <div style={{ marginBottom: 20 }}>
                  <SectionHeader eyebrow="Team Access" title="What governors get per team" titleSize={20} />
                  <p style={{ marginTop: 8, fontSize: 14, color: "var(--body)", lineHeight: 1.55 }}>For admins who aren&apos;t on a team, this sets how much of it they can reach. Team members always keep full access.</p>
                  <div style={{ marginTop: 12, display: "flex", flexDirection: "column", gap: 4 }}>
                    {[
                      ["None", "Hidden from non-member admins."],
                      ["View", "See and administer the team — roster and settings."],
                      ["Write", "Everything in View, plus acting on the team’s work."],
                    ].map(([k, d]) => (
                      <p key={k} style={{ fontSize: 12.5, color: "var(--muted-text)", lineHeight: 1.5, margin: 0 }}>
                        <span style={{ fontWeight: 500, color: "var(--body)" }}>{k}</span> — {d}
                      </p>
                    ))}
                  </div>
                </div>

                <div style={{ border: "1px solid var(--line)", borderRadius: 14, background: "var(--cream-panel)", overflow: "hidden" }}>
                  {govTeams.length === 0 ? (
                    <p style={{ fontSize: 13, color: "var(--muted-text)", padding: "20px 22px", textAlign: "center" }}>No teams yet.</p>
                  ) : govTeams.map((team, i) => (
                    <div key={team.id} style={{ display: "flex", alignItems: "center", gap: 16, padding: "16px 22px", borderBottom: i < govTeams.length - 1 ? "1px solid var(--line-3)" : "none" }}>
                      <div style={{ width: 36, height: 36, borderRadius: 10, background: "var(--ivory)", border: "1px solid var(--line-2)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18, flexShrink: 0 }}>{team.icon ?? "•"}</div>
                      <div style={{ flex: 1, minWidth: 0, fontSize: 14, fontWeight: 500, color: "var(--ink)" }}>{team.name}</div>
                      <div style={{ display: "inline-flex", border: "1px solid var(--line-2)", borderRadius: 999, padding: 2, background: "var(--ivory)", flexShrink: 0 }}>
                        {(["none", "view", "write"] as const).map(opt => {
                          const active = team.admin_access === opt
                          return (
                            <button key={opt} onClick={() => handleTeamAccessChange(team.id, opt)} style={{ padding: "5px 14px", borderRadius: 999, border: "none", background: active ? "var(--plum)" : "transparent", color: active ? "var(--cream-panel)" : "var(--body)", fontSize: 12, fontWeight: active ? 500 : 400, cursor: "pointer", fontFamily: "var(--font-inter)" }}>
                              {opt.charAt(0).toUpperCase() + opt.slice(1)}
                            </button>
                          )
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            </div>
          )}

          {/* ══════════════════ AUTOMATIONS TAB ══════════════════ */}
          {activeSettingsTab === "automations" && (
            <div className="px-5 md:px-14" style={{ display: "flex", flexDirection: "column", gap: 28, marginTop: 40 }}>
              <div>
                <SectionHeader eyebrow="Automations" title="Chat & membership rules" titleSize={20} />
                <p style={{ marginTop: 8, fontSize: 14, color: "var(--body)", maxWidth: 640, lineHeight: 1.55 }}>Behind-the-scenes rules that keep chats current and new members in the right rooms. Changes take effect when you save.</p>
              </div>

              {/* Active toggles */}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
                {([
                  { key: "auto_sg_chats",     label: "Auto-create small group chats",                                                         sub: "When groups are finalized for the semester, a chat is opened per group." },
                  { key: "auto_grade_chats",  label: "Grade & Young Adult chats",                                                             sub: "New members are auto-added to their class-year chat (Freshman – Senior, Young Adult) when they join. Off by default." },
                  { key: "auto_central_chat", label: `Auto-add new members to ${ministryInfo?.name ?? ministryName} Chat`,                    sub: "Joining the workspace adds the member to the main ministry chat." },
                  { key: "auto_staff_chat",   label: "Staff chat",                                                                            sub: "Pastors, deacons, and elders are auto-added to a private staff chat when they join. Off by default." },
                ] as { key: string; label: string; sub: string }[]).map(({ key, label, sub }) => {
                  const on = isToggleOn(key, pendingAutomationSettings)
                  const changed = isToggleOn(key, pendingAutomationSettings) !== isToggleOn(key, automationSettings)
                  return (
                    <div key={key} style={{ ...CARD, padding: 22, display: "flex", alignItems: "flex-start", gap: 16, outline: changed ? "2px solid var(--plum)" : "none", outlineOffset: -2 }}>
                      <button onClick={() => handleAutomationToggle(key)} disabled={!isAdmin} style={{ width: 38, height: 22, borderRadius: 999, border: "none", background: on ? "var(--plum)" : "#D6D0C0", position: "relative", flexShrink: 0, cursor: isAdmin ? "pointer" : "not-allowed", padding: 0, opacity: !isAdmin ? 0.5 : 1 }}>
                        <span style={{ position: "absolute", width: 18, height: 18, borderRadius: 999, background: "var(--cream)", top: 2, ...(on ? { right: 2 } : { left: 2 }) }} />
                      </button>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 14, fontWeight: 500, color: "var(--ink)" }}>{label}</div>
                        <div style={{ marginTop: 6, fontSize: 13, color: "var(--body)", lineHeight: 1.55 }}>{sub}</div>
                      </div>
                    </div>
                  )
                })}
              </div>

              {/* Coming soon */}
              <div>
                <p style={{ ...SECTION_LABEL, marginBottom: 12 }}>Coming soon</p>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
                  {([
                    { key: "auto_praise_chat",    label: "Auto-create praise team chats", sub: "When a Sunday week is confirmed, a new chat is opened with that week's lineup." },
                    { key: "auto_archive_praise", label: "Auto-archive praise team chats", sub: "After Sunday at 11:59 pm, the chat is archived from your active list." },
                  ] as { key: string; label: string; sub: string }[]).map(({ key, label, sub }) => (
                    <div key={key} style={{ ...CARD, padding: 22, display: "flex", alignItems: "flex-start", gap: 16, background: "var(--cream-2)", opacity: 0.6, pointerEvents: "none" }}>
                      <div style={{ width: 38, height: 22, borderRadius: 999, background: "#D6D0C0", position: "relative", flexShrink: 0 }}>
                        <span style={{ position: "absolute", width: 18, height: 18, borderRadius: 999, background: "var(--cream)", top: 2, left: 2 }} />
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 14, fontWeight: 500, color: "var(--ink)", display: "flex", alignItems: "center", gap: 8 }}>
                          {label}
                          <span style={{ fontSize: 10, letterSpacing: "0.8px", padding: "2px 7px", borderRadius: 999, background: "#EFEAE0", textTransform: "uppercase", fontWeight: 500, color: "var(--muted-text)" }}>Soon</span>
                        </div>
                        <div style={{ marginTop: 6, fontSize: 13, color: "var(--body)", lineHeight: 1.55 }}>{sub}</div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Archive warning */}
              {showArchiveWarning && (
                <div style={{ ...CARD, padding: 20, borderColor: "#FECACA", background: "#FFF5F5" }}>
                  <div style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
                    <AlertTriangle style={{ width: 18, height: 18, color: "var(--danger)", flexShrink: 0, marginTop: 1 }} />
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 14, fontWeight: 600, color: "var(--ink)", marginBottom: 6 }}>This will archive chats</div>
                      <div style={{ fontSize: 13, color: "var(--body)", lineHeight: 1.55, marginBottom: 14 }}>
                        Turning these off will archive: <strong>{pendingArchiveLabels.join(", ")}</strong>. Members will lose access from their active list.
                      </div>
                      <div style={{ display: "flex", gap: 10 }}>
                        <button onClick={() => setShowArchiveWarning(false)} style={{ padding: "8px 16px", borderRadius: 10, border: "1px solid var(--line-2)", background: "transparent", color: "var(--body)", fontSize: 13, fontWeight: 500, cursor: "pointer" }}>Cancel</button>
                        <button onClick={commitSaveAutomations} disabled={savingAutomations} style={{ padding: "8px 16px", borderRadius: 10, border: "none", background: "var(--danger)", color: "#fff", fontSize: 13, fontWeight: 600, cursor: "pointer", opacity: savingAutomations ? 0.6 : 1 }}>
                          {savingAutomations ? "Saving…" : "Archive & Save"}
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Save / discard bar */}
              {hasAutomationChanges && !showArchiveWarning && (
                <div style={{ display: "flex", justifyContent: "flex-end", alignItems: "center", gap: 10 }}>
                  <button onClick={() => setPendingAutomationSettings(automationSettings)} style={{ padding: "9px 18px", borderRadius: 10, border: "1px solid var(--line-2)", background: "transparent", color: "var(--body)", fontSize: 13, fontWeight: 500, cursor: "pointer" }}>Discard</button>
                  <button onClick={handleSaveAutomations} disabled={savingAutomations} style={{ padding: "9px 18px", borderRadius: 10, border: "none", background: "var(--plum-2)", color: "var(--cream-on-dark)", fontSize: 13, fontWeight: 600, cursor: savingAutomations ? "not-allowed" : "pointer", opacity: savingAutomations ? 0.6 : 1 }}>
                    {savingAutomations ? "Saving…" : "Save changes"}
                  </button>
                </div>
              )}

              {automationSaveMsg && (
                <div style={{ padding: "10px 16px", borderRadius: 10, background: "var(--ivory)", border: "1px solid var(--line-2)", fontSize: 13, color: "var(--body)" }}>
                  {automationSaveMsg}
                </div>
              )}

              {/* Annual class maintenance */}
              {isAdmin && (
                <div style={{ ...CARD, padding: 22, display: "flex", alignItems: "flex-start", gap: 18 }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 14, fontWeight: 500, color: "var(--ink)" }}>Run annual class maintenance</div>
                    <div style={{ marginTop: 6, fontSize: 13, color: "var(--body)", lineHeight: 1.55 }}>Creates the new incoming class chat for this fall, and converts the graduating class chat from a church chat to a my-chat. Safe to run multiple times.</div>
                    {maintenanceResult && <div style={{ marginTop: 8, fontSize: 12, color: maintenanceResult.startsWith("Error") ? "var(--danger)" : "#3E7A40" }}>{maintenanceResult}</div>}
                  </div>
                  <button onClick={handleRunMaintenance} disabled={maintenanceRunning} style={{ padding: "8px 16px", borderRadius: 10, border: "1px solid var(--line-2)", background: maintenanceRunning ? "var(--line-2)" : "var(--cream-panel)", color: maintenanceRunning ? "var(--muted-text)" : "var(--ink)", fontSize: 13, fontWeight: 500, cursor: maintenanceRunning ? "not-allowed" : "pointer", flexShrink: 0 }}>
                    {maintenanceRunning ? "Running…" : "Run now"}
                  </button>
                </div>
              )}

              {/* Departed member cleanup */}
              {isAdmin && (
                <div style={{ ...CARD, padding: 22, display: "flex", alignItems: "flex-start", gap: 18 }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 14, fontWeight: 500, color: "var(--ink)" }}>Departed member cleanup</div>
                    <div style={{ marginTop: 6, fontSize: 13, color: "var(--body)", lineHeight: 1.55 }}>Permanently anonymizes messages from members who left more than 30 days ago. Their messages remain but show as "Former Member."</div>
                    {cleanupResult && <div style={{ marginTop: 8, fontSize: 12, color: cleanupResult.startsWith("Error") ? "var(--danger)" : "#3E7A40" }}>{cleanupResult}</div>}
                  </div>
                  <button onClick={handleRunDepartedCleanup} disabled={cleanupRunning} style={{ padding: "8px 16px", borderRadius: 10, border: "1px solid var(--line-2)", background: cleanupRunning ? "var(--line-2)" : "var(--cream-panel)", color: cleanupRunning ? "var(--muted-text)" : "var(--ink)", fontSize: 13, fontWeight: 500, cursor: cleanupRunning ? "not-allowed" : "pointer", flexShrink: 0 }}>
                    {cleanupRunning ? "Running…" : "Run now"}
                  </button>
                </div>
              )}
            </div>
          )}

          {/* ══════════════════ WORKSPACE TAB ══════════════════ */}
          {activeSettingsTab === "workspace" && (
            <div className="px-5 md:px-14" style={{ display: "flex", flexDirection: "column", gap: 32, marginTop: 40 }}>

              {/* Join codes */}
              <section>
                <div style={{ marginBottom: 20 }}>
                  <SectionHeader eyebrow="Join Codes" title="How people get in" titleSize={20} />
                  <p style={{ marginTop: 8, fontSize: 14, color: "var(--body)", lineHeight: 1.55 }}>Share these codes to let people join {ministryInfo?.name ?? ministryName}. Staff codes assign admin-tier roles automatically.</p>
                </div>
                <div style={{ display: "grid", gridTemplateColumns: isAdmin && staffCode ? "1fr 1fr" : "1fr", gap: 18, maxWidth: isAdmin && staffCode ? undefined : 480 }}>
                  {/* Invite code */}
                  <div style={{ ...CARD, padding: 22 }}>
                    <div style={{ fontSize: 14, fontWeight: 500, color: "var(--ink)" }}>Invite code</div>
                    <div style={{ marginTop: 6, fontSize: 13, color: "var(--body)", lineHeight: 1.5 }}>Share with members to let them join directly.</div>
                    <div style={{ marginTop: 16, display: "flex", alignItems: "center", gap: 10 }}>
                      <span style={{ flex: 1, padding: "10px 14px", borderRadius: 10, background: "var(--ivory)", border: "1px solid var(--line-2)", fontFamily: "ui-monospace, Menlo, monospace", fontSize: 16, letterSpacing: 2, color: "var(--ink)", fontWeight: 600, textAlign: "center", display: "block" }}>{inviteCode ?? "———"}</span>
                      <button onClick={copyInviteCode} disabled={!inviteCode} style={{ padding: "9px 14px", borderRadius: 10, border: "1px solid var(--line-2)", background: "transparent", color: "var(--body)", fontSize: 13, cursor: "pointer", display: "flex", alignItems: "center", gap: 6 }}>
                        {copied ? <Check style={{ width: 13, height: 13, color: "var(--plum)" }} /> : <Copy style={{ width: 13, height: 13 }} />}
                        {copied ? "Copied" : "Copy"}
                      </button>
                    </div>
                    {isAdmin && (showRegenerateConfirm ? (
                      <div style={{ marginTop: 14, borderRadius: 10, border: "1px solid var(--line)", background: "#F7F4EF", padding: "12px 14px" }}>
                        <p style={{ fontSize: 12, color: "var(--body)", marginBottom: 8 }}>The old code will stop working immediately.</p>
                        <div style={{ display: "flex", gap: 8 }}>
                          <button onClick={() => setShowRegenerateConfirm(false)} style={{ padding: "5px 10px", borderRadius: 8, border: "1px solid var(--line-2)", fontSize: 12, color: "var(--body)", cursor: "pointer", background: "transparent" }}>Cancel</button>
                          <button onClick={handleRegenerate} disabled={regenerating} style={{ padding: "5px 10px", borderRadius: 8, background: "var(--plum-2)", border: "none", fontSize: 12, fontWeight: 600, color: "var(--cream-panel)", cursor: "pointer", opacity: regenerating ? 0.6 : 1 }}>{regenerating ? "Regenerating…" : "Yes, regenerate"}</button>
                        </div>
                      </div>
                    ) : (
                      <button onClick={() => setShowRegenerateConfirm(true)} style={{ marginTop: 12, padding: 0, background: "none", border: "none", color: "var(--muted-text)", fontSize: 13, cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 6 }}>
                        <RefreshCw style={{ width: 12, height: 12 }} /> Regenerate code
                      </button>
                    ))}
                  </div>

                  {/* Staff code — admin only */}
                  {isAdmin && staffCode && (
                    <div style={{ ...CARD, padding: 22 }}>
                      <div style={{ fontSize: 14, fontWeight: 500, color: "var(--ink)" }}>Staff code</div>
                      <div style={{ marginTop: 6, fontSize: 13, color: "var(--body)", lineHeight: 1.5 }}>For pastors, deacons, and elders. Joining with this code assigns an admin-tier role.</div>
                      <div style={{ marginTop: 16, display: "flex", alignItems: "center", gap: 10 }}>
                        <span style={{ flex: 1, padding: "10px 14px", borderRadius: 10, background: "var(--ivory)", border: "1px solid var(--line-2)", fontFamily: "ui-monospace, Menlo, monospace", fontSize: 16, letterSpacing: 2, color: "var(--ink)", fontWeight: 600, textAlign: "center", display: "block" }}>{staffCode}</span>
                        <button onClick={copyStaffCode} style={{ padding: "9px 14px", borderRadius: 10, border: "1px solid var(--line-2)", background: "transparent", color: "var(--body)", fontSize: 13, cursor: "pointer", display: "flex", alignItems: "center", gap: 6 }}>
                          {staffCopied ? <Check style={{ width: 13, height: 13, color: "var(--plum)" }} /> : <Copy style={{ width: 13, height: 13 }} />}
                          {staffCopied ? "Copied" : "Copy"}
                        </button>
                      </div>
                      {showStaffRegenerateConfirm ? (
                        <div style={{ marginTop: 14, borderRadius: 10, border: "1px solid var(--line)", background: "#F7F4EF", padding: "12px 14px" }}>
                          <p style={{ fontSize: 12, color: "var(--body)", marginBottom: 8 }}>The old staff code will stop working immediately.</p>
                          <div style={{ display: "flex", gap: 8 }}>
                            <button onClick={() => setShowStaffRegenerateConfirm(false)} style={{ padding: "5px 10px", borderRadius: 8, border: "1px solid var(--line-2)", fontSize: 12, color: "var(--body)", cursor: "pointer", background: "transparent" }}>Cancel</button>
                            <button onClick={handleRegenerateStaff} disabled={regeneratingStaff} style={{ padding: "5px 10px", borderRadius: 8, background: "var(--plum-2)", border: "none", fontSize: 12, fontWeight: 600, color: "var(--cream-panel)", cursor: "pointer", opacity: regeneratingStaff ? 0.6 : 1 }}>{regeneratingStaff ? "Regenerating…" : "Yes, regenerate"}</button>
                          </div>
                        </div>
                      ) : (
                        <button onClick={() => setShowStaffRegenerateConfirm(true)} style={{ marginTop: 12, padding: 0, background: "none", border: "none", color: "var(--muted-text)", fontSize: 13, cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 6 }}>
                          <RefreshCw style={{ width: 12, height: 12 }} /> Regenerate staff code
                        </button>
                      )}
                    </div>
                  )}
                </div>
              </section>

              {/* Calendar integration */}
              <section>
                <div style={{ marginBottom: 20 }}>
                  <SectionHeader eyebrow="Calendar Integration" title="Sync events to your calendar" titleSize={20} />
                  <p style={{ marginTop: 8, fontSize: 14, color: "var(--body)", lineHeight: 1.55 }}>Subscribe to your ministry&apos;s event calendar in Google Calendar, Apple Calendar, or Outlook. Events added in Central sync automatically every few hours.</p>
                </div>
                <div style={{ ...CARD, padding: 22 }}>
                  <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                    <div style={{ flex: 1, padding: "10px 14px", borderRadius: 10, background: "var(--ivory)", border: "1px solid var(--line-2)", fontFamily: "ui-monospace, Menlo, monospace", fontSize: 13, color: "var(--body)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{calFeedUrl}</div>
                    <button onClick={copyCalUrl} style={{ padding: "9px 14px", borderRadius: 10, border: "1px solid var(--line-2)", background: "transparent", color: "var(--body)", fontSize: 13, cursor: "pointer", display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
                      {calCopied ? <Check style={{ width: 13, height: 13, color: "var(--plum)" }} /> : <Copy style={{ width: 13, height: 13 }} />}
                      {calCopied ? "Copied" : "Copy"}
                    </button>
                    <button onClick={openGoogleCalendar} style={{ padding: "9px 14px", borderRadius: 10, background: "var(--plum-2)", border: "none", color: "var(--cream-panel)", fontSize: 13, cursor: "pointer", display: "flex", alignItems: "center", gap: 6, flexShrink: 0, fontWeight: 500 }}>
                      <Calendar style={{ width: 13, height: 13 }} /> Add to Google Calendar
                    </button>
                  </div>
                  <p style={{ marginTop: 14, fontSize: 12, color: "var(--muted-text)", lineHeight: 1.5 }}>Clicking the button copies the URL and opens Google Calendar — paste it in the &quot;From URL&quot; field. For Apple Calendar or Outlook, use the Copy button.</p>
                </div>
              </section>

              {/* Receipt limits */}
              {isAdmin && (
                <section>
                  <div style={{ marginBottom: 20 }}>
                    <SectionHeader eyebrow="Receipt Limits" title="Per-event reimbursement caps" titleSize={20} action={!addingLimit ? <button onClick={() => setAddingLimit(true)} style={{ padding: "7px 12px", borderRadius: 10, border: "1px solid var(--line-2)", background: "transparent", color: "var(--body)", fontSize: 13, cursor: "pointer", flexShrink: 0 }}>+ Add limit</button> : undefined} />
                    <p style={{ marginTop: 8, fontSize: 14, color: "var(--body)", lineHeight: 1.55 }}>Define a maximum reimbursement that members can submit against an event before it requires admin approval.</p>
                  </div>
                  <div style={{ border: "1px solid var(--line)", borderRadius: 14, background: "var(--cream-panel)", overflow: "hidden" }}>
                    {receiptLimits.length === 0 && !addingLimit && <div style={{ padding: "20px 22px" }}><p style={{ fontSize: 13, color: "var(--muted-text)" }}>No limits set. Add a limit to flag over-budget receipts.</p></div>}
                    {receiptLimits.map((l, i) => {
                      const catLabel = { dg_dinner: "DG Dinner", welcoming_week: "Welcoming Week", coffeehouse: "Coffeehouse", turkeybowl: "Turkey Bowl", supplies: "Supplies", other: "Other" }[l.category] ?? l.category
                      const fundLabel = { church: "Church", cmu: "CMU", pitt: "Pitt" }[l.fund] ?? l.fund
                      return (
                        <div key={l.id} style={{ display: "grid", gridTemplateColumns: "1.6fr 1fr auto auto", alignItems: "center", gap: 18, padding: "16px 22px", borderBottom: i < receiptLimits.length - 1 ? "1px solid var(--line-3)" : "none" }}>
                          <div>
                            <div style={{ fontSize: 14, fontWeight: 500, color: "var(--ink)" }}>{catLabel}</div>
                            <div style={{ marginTop: 2, fontSize: 13, color: "var(--muted-text)" }}>{fundLabel} fund</div>
                          </div>
                          {editingLimitId === l.id ? (
                            <>
                              <input
                                type="number"
                                min="1"
                                step="1"
                                autoFocus
                                value={editingLimitAmount}
                                onChange={e => setEditingLimitAmount(e.target.value)}
                                onKeyDown={e => { if (e.key === "Enter") handleSaveLimitEdit(l.id, l.category, l.fund); if (e.key === "Escape") { setEditingLimitId(null); setEditingLimitAmount("") } }}
                                style={{ padding: "6px 10px", border: "1.5px solid var(--plum)", borderRadius: 8, fontSize: 13, fontFamily: "inherit", background: "var(--cream)", outline: "none", width: "100%" }}
                              />
                              <button
                                onClick={() => handleSaveLimitEdit(l.id, l.category, l.fund)}
                                disabled={savingLimitEdit || !editingLimitAmount}
                                style={{ padding: "6px 12px", borderRadius: 8, border: "none", background: "var(--plum)", color: "var(--cream-on-dark)", fontSize: 12, fontWeight: 600, cursor: savingLimitEdit ? "not-allowed" : "pointer", opacity: savingLimitEdit || !editingLimitAmount ? 0.5 : 1, whiteSpace: "nowrap" }}
                              >{savingLimitEdit ? "…" : "Save"}</button>
                              <button
                                onClick={() => { setEditingLimitId(null); setEditingLimitAmount("") }}
                                style={{ padding: "6px 12px", borderRadius: 8, border: "1px solid var(--line-2)", background: "transparent", color: "var(--body)", fontSize: 12, cursor: "pointer", whiteSpace: "nowrap" }}
                              >Cancel</button>
                            </>
                          ) : (
                            <>
                              <div style={{ fontFamily: "var(--font-instrument-serif)", fontSize: 22, color: "var(--ink)", letterSpacing: -0.2 }}>${Number(l.max_amount).toFixed(0)}</div>
                              <button onClick={() => { setEditingLimitId(l.id); setEditingLimitAmount(String(Math.round(l.max_amount))) }} style={{ padding: "6px 12px", borderRadius: 8, border: "1px solid var(--line-2)", background: "transparent", color: "var(--body)", fontSize: 12, cursor: "pointer" }}>Edit</button>
                              <button onClick={() => handleDeleteLimit(l.id)} style={{ padding: "6px 12px", borderRadius: 8, border: "1px solid var(--line-2)", background: "transparent", color: "var(--danger)", fontSize: 12, cursor: "pointer" }}>Remove</button>
                            </>
                          )}
                        </div>
                      )
                    })}
                    {addingLimit && (
                      <div style={{ padding: "16px 22px", borderTop: receiptLimits.length > 0 ? "1px solid var(--line-3)" : undefined }}>
                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 80px", gap: 8, marginBottom: 10 }}>
                          <select value={newLimitCategory} onChange={e => setNewLimitCategory(e.target.value)} style={{ padding: "7px 10px", border: "1.5px solid var(--line-2)", borderRadius: 8, fontSize: 13, fontFamily: "inherit", background: "var(--cream)", outline: "none" }}>
                            {[["dg_dinner","DG Dinner"],["welcoming_week","Welcoming Week"],["coffeehouse","Coffeehouse"],["turkeybowl","Turkey Bowl"],["supplies","Supplies"],["other","Other"]].map(([v,l]) => <option key={v} value={v}>{l}</option>)}
                          </select>
                          <select value={newLimitFund} onChange={e => setNewLimitFund(e.target.value)} style={{ padding: "7px 10px", border: "1.5px solid var(--line-2)", borderRadius: 8, fontSize: 13, fontFamily: "inherit", background: "var(--cream)", outline: "none" }}>
                            {[["church","Church"],["cmu","CMU"],["pitt","Pitt"]].map(([v,l]) => <option key={v} value={v}>{l}</option>)}
                          </select>
                          <input type="number" min="0" step="1" placeholder="$" value={newLimitAmount} onChange={e => setNewLimitAmount(e.target.value)} style={{ padding: "7px 10px", border: "1.5px solid var(--line-2)", borderRadius: 8, fontSize: 13, fontFamily: "inherit", background: "var(--cream)", outline: "none" }} />
                        </div>
                        {limitError && <p style={{ fontSize: 12, color: "var(--danger)", marginBottom: 8 }}>{limitError}</p>}
                        <div style={{ display: "flex", gap: 8 }}>
                          <button onClick={() => { setAddingLimit(false); setNewLimitAmount(""); setLimitError(null) }} style={{ flex: 1, padding: "7px 0", background: "transparent", border: "1.5px solid var(--line-2)", borderRadius: 8, fontSize: 13, fontWeight: 500, cursor: "pointer", fontFamily: "inherit", color: "var(--body)" }}>Cancel</button>
                          <button onClick={handleAddLimit} disabled={savingLimit || !newLimitAmount} style={{ flex: 1, padding: "7px 0", background: "var(--plum)", border: "none", borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: savingLimit ? "not-allowed" : "pointer", fontFamily: "inherit", color: "var(--cream-on-dark)", opacity: savingLimit ? 0.6 : 1 }}>{savingLimit ? "Saving…" : "Add limit"}</button>
                        </div>
                      </div>
                    )}
                  </div>
                </section>
              )}
            </div>
          )}

          {activeSettingsTab === "audit" && isAdmin && (
            <div className="px-5 md:px-14" style={{ marginTop: 40 }}>
              <div style={{ marginBottom: 24 }}>
                <SectionHeader eyebrow="Audit Log" title="Admin activity" titleSize={20} />
                <p style={{ marginTop: 8, fontSize: 14, color: "var(--body)", lineHeight: 1.55 }}>A read-only record of administrative actions taken in your ministry. Last 100 entries.</p>
              </div>
              {auditLoading ? (
                <div style={{ textAlign: "center", padding: "40px 0", color: "var(--muted-text)", fontSize: 14 }}>Loading…</div>
              ) : auditLogs.length === 0 ? (
                <div style={{ border: "1px dashed var(--dashed)", borderRadius: 14, background: "transparent", padding: "28px 22px", textAlign: "center" }}>
                  <p style={{ fontSize: 13, color: "var(--muted-text)" }}>No admin actions have been recorded yet.</p>
                </div>
              ) : (
                <div style={{ border: "1px solid var(--line)", borderRadius: 14, background: "var(--cream-panel)", overflow: "hidden" }}>
                  {auditLogs.map((log, i) => {
                    const actionLabel: Record<string, string> = {
                      "announcement.create": "Created announcement",
                      "announcement.edit": "Edited announcement",
                      "announcement.delete": "Deleted announcement",
                      "announcement.pin": "Pinned announcement",
                      "announcement.unpin": "Unpinned announcement",
                      "announcement.subpin": "Pinned to For You",
                      "announcement.unsubpin": "Removed from For You",
                      "member.role_change": "Changed member role",
                      "member.remove": "Removed member",
                      "member.excommunicate": "Excommunicated member",
                      "team.member_add": "Added team member",
                      "team.member_remove": "Removed team member",
                      "team.member_role_change": "Changed team role",
                    }
                    const label = actionLabel[log.action] ?? log.action
                    const meta = log.metadata
                    const roleChange = meta?.old_role && meta?.new_role ? ` (${meta.old_role} → ${meta.new_role})` : ""
                    const ts = new Date(log.created_at)
                    const timeStr = ts.toLocaleDateString("en-US", { month: "short", day: "numeric" }) + " at " + ts.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })
                    return (
                      <div key={log.id} style={{ display: "grid", gridTemplateColumns: "1fr auto", alignItems: "start", gap: 16, padding: "14px 20px", borderBottom: i < auditLogs.length - 1 ? "1px solid var(--line-3)" : "none" }}>
                        <div>
                          <div style={{ fontSize: 14, fontWeight: 500, color: "var(--ink)" }}>{label}{log.entity_label ? ` "${log.entity_label}"` : ""}{roleChange}</div>
                          <div style={{ marginTop: 2, fontSize: 12, color: "var(--muted-text)" }}>by {log.actor_name}</div>
                        </div>
                        <div style={{ fontSize: 12, color: "var(--faint)", whiteSpace: "nowrap", paddingTop: 2 }}>{timeStr}</div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          )}

          </>
        )}
      </div>
    </div>
  )
}

