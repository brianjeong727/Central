"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { Copy, Check, Users, Shield, Crown, MoreHorizontal, Search, X, AlertTriangle, RefreshCw, Pencil, Calendar, ExternalLink, GripVertical, BookOpen } from "lucide-react"
import { createClient } from "@/lib/supabase"
import { logAudit } from "@/lib/audit"
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
} from "@/app/actions/ministry"
import { updateAutomationSettings, runAnnualClassMaintenance, retroactivelyApplyToggle, archiveToggleChats } from "@/app/actions/auto-chats"
import { getReceiptLimits, upsertReceiptLimit, deleteReceiptLimit } from "@/app/actions/receipts"
import type { ReceiptLimit } from "@/app/actions/receipts"
import { getHomeVerses, addHomeVerse, updateHomeVerse, deleteHomeVerse, reorderHomeVerses } from "@/app/actions/home-verses"
import type { HomeVerse } from "@/app/actions/home-verses"
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

type RoleFilter = "all" | "member" | "visitor" | "leader" | "admin" | "deacon" | "elder"
type ActiveSettingsTab = "general" | "people" | "automations" | "workspace" | "audit"

const ROLE_STYLE: Record<string, { bg: string; color: string; border: string; label: string }> = {
  admin:   { bg: "#2D0F2E",  color: "#FBF8F2", border: "#2D0F2E",              label: "Admin"   },
  deacon:  { bg: "#2D0F2E",  color: "#FBF8F2", border: "#2D0F2E",              label: "Deacon"  },
  elder:   { bg: "#2D0F2E",  color: "#FBF8F2", border: "#2D0F2E",              label: "Elder"   },
  pastor:  { bg: "#2D0F2E",  color: "#FBF8F2", border: "#2D0F2E",              label: "Pastor"  },
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
  background: "#FBF8F2", borderRadius: "14px", border: "1px solid #E8E2D2",
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
  const router = useRouter()
  const isAdmin = ["admin", "deacon", "elder", "pastor"].includes(userRole.toLowerCase())

  const [activeSettingsTab, setActiveSettingsTab] = useState<ActiveSettingsTab>(() => {
    if (typeof window === "undefined") return "general"
    const p = new URLSearchParams(window.location.search).get("stab")
    return (["general", "people", "automations", "workspace", "audit"].includes(p ?? "") ? p as ActiveSettingsTab : "general")
  })
  function goToSettingsTab(t: ActiveSettingsTab) {
    setActiveSettingsTab(t)
    const params = new URLSearchParams(window.location.search)
    params.set("stab", t)
    router.replace(`?${params.toString()}`, { scroll: false })
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
  const [showMembersOverlay, setShowMembersOverlay] = useState(false)
  const [overlayInitialFilter, setOverlayInitialFilter] = useState<RoleFilter>("all")

  const totalMembers = members.length
  const totalLeaders = members.filter(m => m.role.toLowerCase() === "leader").length
  const totalAdmins = members.filter(m => ["admin", "deacon", "elder"].includes(m.role.toLowerCase())).length
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

  // Loading
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      const [{ data: min }, { data: profiles }, { data: schoolRows }, limitsRes, verses] = await Promise.all([
        supabase.from("ministries").select("name, university, size, invite_code, staff_invite_code, is_public, automation_settings").eq("id", ministryId).maybeSingle(),
        supabase.from("profiles").select("id, name, email, role, graduation_year").eq("ministry_id", ministryId).order("name"),
        supabase.from("ministry_schools").select("id, name, abbreviation, sort_order").eq("ministry_id", ministryId).order("sort_order"),
        getReceiptLimits(ministryId),
        getHomeVerses(ministryId),
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
      }
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
  async function handleRoleChange(memberId: string, newRole: "visitor" | "member" | "leader" | "admin" | "deacon" | "elder") {
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
    { key: "automations", label: "Automations" },
    { key: "workspace", label: "Workspace" },
    ...(isAdmin ? [{ key: "audit" as ActiveSettingsTab, label: "Audit Log" }] : []),
  ]

  return (
    <div className="md:h-full md:overflow-y-auto">
      <DesktopTopbar crumbs={["Central", "Church Settings"]} />

      <div className="px-5 py-6 md:px-14 md:py-10 pb-28 md:pb-10">
        {/* ── Page header ── */}
        <div>
          <p style={{ fontFamily: "ui-monospace,'SF Mono',Menlo,monospace", fontSize: "11px", fontWeight: 400, letterSpacing: "1.4px", textTransform: "uppercase", color: "#8A8497", marginBottom: 4 }}>
            {isAdmin ? "Ministry Admin" : "Ministry Workspace"}
          </p>
          <h1 style={{ fontFamily: "var(--font-instrument-serif)", fontSize: "clamp(34px, 4vw, 52px)", color: "#13101A", fontWeight: 400, margin: 0, letterSpacing: "-0.01em" }}>
            Church Settings
          </h1>
        </div>

        {/* ── Tab strip ── */}
        <div style={{ marginTop: 28, display: "flex", gap: 32, borderBottom: "1px solid #E8E2D2" }}>
          {TABS.map(({ key, label }) => {
            const on = activeSettingsTab === key
            return (
              <button key={key} onClick={() => goToSettingsTab(key)} style={{ background: "none", border: "none", cursor: "pointer", padding: "12px 0 14px", fontSize: 15, fontFamily: "var(--font-inter)", color: on ? "#2D0F2E" : "#8A8497", fontWeight: on ? 600 : 400, borderBottom: on ? "2px solid #3E1540" : "2px solid transparent", marginBottom: -1 }}>
                {label}
              </button>
            )
          })}
        </div>

        {loading ? (
          <div style={{ color: "#8A8497", fontSize: "14px", marginTop: 40 }}>Loading…</div>
        ) : (
          <>

          {/* ══════════════════ GENERAL TAB ══════════════════ */}
          {activeSettingsTab === "general" && (
            <div style={{ display: "flex", flexDirection: "column", gap: 48, marginTop: 40 }}>

              {/* Ministry Profile */}
              <section>
                <div style={{ marginBottom: 20 }}>
                  <p style={SECTION_LABEL}>Ministry Identity</p>
                  <h2 style={{ fontFamily: "var(--font-instrument-serif)", fontSize: 32, margin: "4px 0 0", letterSpacing: -0.3, lineHeight: 1.05, color: "#13101A" }}>Profile</h2>
                  <p style={{ marginTop: 8, fontSize: 14, color: "#5A5466", lineHeight: 1.55 }}>The name, school, and visual identity members see when they find your ministry.</p>
                </div>
                <div style={{ ...CARD, padding: "22px 26px", display: "flex", alignItems: "center", gap: 20 }}>
                  <div style={{ width: 64, height: 64, borderRadius: 14, background: "#3E1540", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                    <span style={{ fontFamily: "var(--font-instrument-serif)", fontSize: 30, color: "#FBF8F2" }}>{(ministryInfo?.name ?? ministryName)[0]}</span>
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    {editingName ? (
                      <input autoFocus value={nameDraft} onChange={e => setNameDraft(e.target.value)} onKeyDown={e => { if (e.key === "Enter") saveMinistryField("name", nameDraft); if (e.key === "Escape") setEditingName(false) }} onBlur={() => saveMinistryField("name", nameDraft)} style={{ fontFamily: "var(--font-instrument-serif)", fontSize: "28px", letterSpacing: -0.3, color: "#13101A", lineHeight: 1.1, background: "transparent", border: "none", borderBottom: "1px solid #E2DDCF", outline: "none", padding: 0, width: "100%" }} />
                    ) : (
                      <div className="group flex items-center gap-2" style={{ cursor: isAdmin ? "text" : "default" }} onClick={isAdmin ? () => { setNameDraft(ministryInfo?.name ?? ministryName); setEditingName(true) } : undefined}>
                        <p style={{ fontFamily: "var(--font-instrument-serif)", fontSize: "28px", letterSpacing: -0.3, color: "#13101A", lineHeight: 1.1 }}>{ministryInfo?.name ?? ministryName}</p>
                        {isAdmin && <Pencil className="opacity-0 group-hover:opacity-100 transition-opacity duration-150" style={{ width: 13, height: 13, color: "#8A8497", flexShrink: 0 }} />}
                      </div>
                    )}
                    {editingUniversity ? (
                      <input autoFocus value={universityDraft} onChange={e => setUniversityDraft(e.target.value)} onKeyDown={e => { if (e.key === "Enter") saveMinistryField("university", universityDraft); if (e.key === "Escape") setEditingUniversity(false) }} onBlur={() => saveMinistryField("university", universityDraft)} style={{ fontSize: "14px", color: "#5A5466", marginTop: 4, background: "transparent", border: "none", borderBottom: "1px solid #E2DDCF", outline: "none", padding: 0, width: "100%" }} />
                    ) : (
                      <div className="group flex items-center gap-1" style={{ cursor: isAdmin ? "text" : "default", marginTop: 4 }} onClick={isAdmin ? () => { setUniversityDraft(ministryInfo?.university ?? ""); setEditingUniversity(true) } : undefined}>
                        <p style={{ fontSize: "14px", color: "#5A5466" }}>{ministryInfo?.university ?? "—"}</p>
                        {isAdmin && <Pencil className="opacity-0 group-hover:opacity-100 transition-opacity duration-150" style={{ width: 11, height: 11, color: "#8A8497", flexShrink: 0 }} />}
                      </div>
                    )}
                    {infoError && <p style={{ fontSize: "12px", color: "#DC2626", marginTop: 4 }}>{infoError}</p>}
                  </div>
                </div>
              </section>

              {/* Discovery + Schools 2-col */}
              <section>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 28 }}>
                  {/* Discovery */}
                  <div>
                    <div style={{ marginBottom: 16 }}>
                      <p style={SECTION_LABEL}>Discovery</p>
                      <h2 style={{ fontFamily: "var(--font-instrument-serif)", fontSize: 26, margin: "4px 0 0", letterSpacing: -0.3, lineHeight: 1.05, color: "#13101A" }}>Who can find {ministryInfo?.name ?? ministryName}</h2>
                    </div>
                    <div style={{ ...CARD, padding: "20px 22px", display: "flex", alignItems: "flex-start", gap: 16 }}>
                      <button onClick={isAdmin ? handleToggle : undefined} disabled={toggling || !isAdmin} style={{ width: 38, height: 22, borderRadius: 999, border: "none", background: isPublic ? "#3E1540" : "#D6D0C0", position: "relative", flexShrink: 0, cursor: isAdmin ? "pointer" : "not-allowed", padding: 0, opacity: !isAdmin ? 0.5 : 1 }}>
                        <span style={{ position: "absolute", width: 16, height: 16, borderRadius: 999, background: "#FBF8F2", top: 3, left: isPublic ? 19 : 3, transition: "left 0.15s" }} />
                      </button>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: 14, fontWeight: 500, color: "#13101A" }}>Public discovery</div>
                        <div style={{ marginTop: 4, fontSize: 13, color: "#5A5466", lineHeight: 1.5 }}>{isPublic ? "Anyone can find and join without an invite code." : "Invite-only — code required to join."}</div>
                      </div>
                    </div>
                  </div>

                  {/* Schools */}
                  <div>
                    <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", marginBottom: 16 }}>
                      <div>
                        <p style={SECTION_LABEL}>Schools</p>
                        <h2 style={{ fontFamily: "var(--font-instrument-serif)", fontSize: 26, margin: "4px 0 0", letterSpacing: -0.3, lineHeight: 1.05, color: "#13101A" }}>Linked campuses</h2>
                      </div>
                      {isAdmin && !addingSchool && (
                        <button onClick={() => setAddingSchool(true)} style={{ padding: "7px 12px", borderRadius: 10, border: "1px solid #E2DDCF", background: "transparent", color: "#5A5466", fontSize: 13, cursor: "pointer", flexShrink: 0 }}>+ Add school</button>
                      )}
                    </div>
                    <div style={{ ...CARD, overflow: "hidden" }}>
                      {schools.length === 0 && !addingSchool && <div style={{ padding: "16px 20px" }}><p style={{ fontSize: 13, color: "#8A8497" }}>No schools added yet.</p></div>}
                      {schools.length > 0 && (
                        <div style={{ padding: "16px 18px", display: "flex", flexWrap: "wrap", gap: 8 }}>
                          {schools.map(s => (
                            <span key={s.id} style={{ display: "inline-flex", alignItems: "center", gap: 8, padding: "6px 12px", borderRadius: 999, background: "#F1ECDE", color: "#2D0F2E", border: "1px solid #E2DDCF", fontSize: 13 }}>
                              <span style={{ fontWeight: 500 }}>{s.name}</span>
                              <span style={{ color: "#8A8497", fontSize: 12 }}>({s.abbreviation})</span>
                              {isAdmin && <button onClick={() => handleDeleteSchool(s.id)} style={{ background: "none", border: "none", padding: 0, color: "#8A8497", cursor: "pointer", lineHeight: 1, fontSize: 16 }}>×</button>}
                            </span>
                          ))}
                        </div>
                      )}
                      {isAdmin && addingSchool && (
                        <div style={{ padding: "16px 18px", borderTop: schools.length > 0 ? "1px solid #EFE9DA" : undefined }}>
                          {schoolError && <p style={{ fontSize: 12, color: "#E53E3E", marginBottom: 8 }}>{schoolError}</p>}
                          <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 10 }}>
                            <input autoFocus type="text" placeholder="School name (e.g. University of Pittsburgh)" value={newSchoolName} onChange={e => setNewSchoolName(e.target.value)} style={{ width: "100%", border: "1.5px solid #E2DDCF", borderRadius: 8, padding: "7px 10px", fontSize: 13, fontFamily: "inherit", outline: "none", boxSizing: "border-box" }} />
                            <input type="text" placeholder="Abbreviation (e.g. Pitt)" value={newSchoolAbbr} onChange={e => setNewSchoolAbbr(e.target.value)} style={{ width: "100%", border: "1.5px solid #E2DDCF", borderRadius: 8, padding: "7px 10px", fontSize: 13, fontFamily: "inherit", outline: "none", boxSizing: "border-box" }} />
                          </div>
                          <div style={{ display: "flex", gap: 8 }}>
                            <button onClick={() => { setAddingSchool(false); setNewSchoolName(""); setNewSchoolAbbr(""); setSchoolError(null) }} style={{ flex: 1, padding: "7px 0", background: "transparent", border: "1.5px solid #E2DDCF", borderRadius: 8, fontSize: 13, fontWeight: 500, cursor: "pointer", fontFamily: "inherit", color: "#5A5466" }}>Cancel</button>
                            <button onClick={handleAddSchool} disabled={savingSchool || !newSchoolName.trim() || !newSchoolAbbr.trim()} style={{ flex: 1, padding: "7px 0", background: "#3E1540", border: "none", borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: savingSchool ? "not-allowed" : "pointer", fontFamily: "inherit", color: "#F6F4EF", opacity: savingSchool ? 0.6 : 1 }}>{savingSchool ? "Adding…" : "Add"}</button>
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
                  <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", marginBottom: 20 }}>
                    <div>
                      <p style={SECTION_LABEL}>Daily Verse Rotation</p>
                      <h2 style={{ fontFamily: "var(--font-instrument-serif)", fontSize: 32, margin: "4px 0 0", letterSpacing: -0.3, lineHeight: 1.05, color: "#13101A" }}>Verses on the sidebar</h2>
                      <p style={{ marginTop: 8, fontSize: 14, color: "#5A5466", lineHeight: 1.55 }}>Verses rotate daily in the order below. Drag to reorder. Today&apos;s verse is highlighted.</p>
                    </div>
                    {!addingVerse && <button onClick={() => setAddingVerse(true)} style={{ padding: "7px 12px", borderRadius: 10, border: "1px solid #E2DDCF", background: "transparent", color: "#5A5466", fontSize: 13, cursor: "pointer", flexShrink: 0 }}>+ Add verse</button>}
                  </div>
                  <div style={{ border: "1px solid #E8E2D2", borderRadius: 14, background: "#FBF8F2", overflow: "hidden" }}>
                    {homeVerses.length === 0 && !addingVerse && (
                      <div style={{ padding: "20px 22px" }}><p style={{ fontSize: 13, color: "#8A8497" }}>No verses yet. Add one to start the daily rotation.</p></div>
                    )}
                    {homeVerses.map((v, idx) => {
                      const isToday = v.id === todayVerseId
                      return (
                        <div key={v.id} style={{ background: dragOverVerseIdx === idx ? "#F7F4EF" : isToday ? "#F6F2E8" : undefined, borderBottom: "1px solid #EFE9DA", transition: "background 100ms" }} draggable={editingVerseId !== v.id && confirmDeleteVerseId !== v.id} onDragStart={e => handleVerseDragStart(e, idx)} onDragOver={e => { e.preventDefault(); setDragOverVerseIdx(idx) }} onDragLeave={() => setDragOverVerseIdx(null)} onDrop={e => handleVerseDrop(e, idx)}>
                          {editingVerseId === v.id ? (
                            <div style={{ padding: "16px 22px", display: "flex", flexDirection: "column", gap: 8 }}>
                              <input autoFocus value={verseRefDraft} onChange={e => setVerseRefDraft(e.target.value)} placeholder="Reference (e.g. John 3:16)" style={{ width: "100%", border: "1.5px solid #E2DDCF", borderRadius: 8, padding: "7px 10px", fontSize: 13, fontFamily: "inherit", outline: "none", boxSizing: "border-box" }} />
                              <textarea value={verseTextDraft} onChange={e => setVerseTextDraft(e.target.value)} placeholder="Verse text" rows={3} style={{ width: "100%", border: "1.5px solid #E2DDCF", borderRadius: 8, padding: "7px 10px", fontSize: 13, fontFamily: "inherit", outline: "none", resize: "vertical", boxSizing: "border-box" }} />
                              <div style={{ display: "flex", gap: 8 }}>
                                <button onClick={() => setEditingVerseId(null)} style={{ flex: 1, padding: "6px 0", background: "transparent", border: "1.5px solid #E2DDCF", borderRadius: 8, fontSize: 13, fontWeight: 500, cursor: "pointer", fontFamily: "inherit", color: "#5A5466" }}>Cancel</button>
                                <button onClick={() => handleUpdateVerse(v.id)} disabled={savingVerse || !verseRefDraft.trim() || !verseTextDraft.trim()} style={{ flex: 1, padding: "6px 0", background: "#3E1540", border: "none", borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: "inherit", color: "#F6F4EF", opacity: savingVerse ? 0.6 : 1 }}>{savingVerse ? "Saving…" : "Save"}</button>
                              </div>
                            </div>
                          ) : confirmDeleteVerseId === v.id ? (
                            <div style={{ padding: "16px 22px" }}>
                              <p style={{ fontSize: 12, color: "#5A5466", marginBottom: 8 }}>Remove &ldquo;{v.reference}&rdquo;?</p>
                              <div style={{ display: "flex", gap: 8 }}>
                                <button onClick={() => setConfirmDeleteVerseId(null)} style={{ flex: 1, padding: "5px 0", background: "transparent", border: "1.5px solid #E2DDCF", borderRadius: 8, fontSize: 12, fontWeight: 500, cursor: "pointer", fontFamily: "inherit", color: "#5A5466" }}>Cancel</button>
                                <button onClick={() => handleDeleteVerse(v.id)} disabled={deletingVerseId === v.id} style={{ flex: 1, padding: "5px 0", background: "#9D2D2D", border: "none", borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: "inherit", color: "white", opacity: deletingVerseId === v.id ? 0.6 : 1 }}>{deletingVerseId === v.id ? "Removing…" : "Remove"}</button>
                              </div>
                            </div>
                          ) : (
                            <div className="group" style={{ display: "flex", alignItems: "flex-start", gap: 14, padding: "16px 22px" }}>
                              <span style={{ color: "#A09A8C", cursor: "grab", fontSize: 16, marginTop: 2, userSelect: "none", fontFamily: "ui-monospace, Menlo, monospace", flexShrink: 0 }}>⋮⋮</span>
                              <div style={{ flex: 1, minWidth: 0 }}>
                                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                                  <span style={{ fontSize: 14, fontWeight: 500, color: "#13101A" }}>{v.reference}</span>
                                  {isToday && <span style={{ padding: "2px 8px", borderRadius: 999, background: "#3E1540", color: "#FBF8F2", fontSize: 10, letterSpacing: 0.6, textTransform: "uppercase", fontWeight: 500 }}>Today</span>}
                                </div>
                                <div style={{ marginTop: 4, fontSize: 13, color: "#8A8497", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{v.text}</div>
                              </div>
                              <div className="opacity-0 group-hover:opacity-100 transition-opacity" style={{ display: "flex", alignItems: "center", gap: 2, flexShrink: 0 }}>
                                <button onClick={() => { setEditingVerseId(v.id); setVerseRefDraft(v.reference); setVerseTextDraft(v.text) }} style={{ padding: 6, background: "none", border: "none", cursor: "pointer", borderRadius: 6 }}><Pencil style={{ width: 13, height: 13, color: "#8A8497" }} /></button>
                                <button onClick={() => setConfirmDeleteVerseId(v.id)} style={{ padding: 6, background: "none", border: "none", cursor: "pointer", borderRadius: 6 }}><X style={{ width: 13, height: 13, color: "#8A8497" }} /></button>
                              </div>
                            </div>
                          )}
                        </div>
                      )
                    })}
                    {addingVerse ? (
                      <div style={{ padding: "16px 22px", display: "flex", flexDirection: "column", gap: 8, borderTop: homeVerses.length > 0 ? "1px solid #EFE9DA" : undefined }}>
                        <input autoFocus value={newVerseRef} onChange={e => setNewVerseRef(e.target.value)} placeholder="Reference (e.g. John 3:16)" style={{ width: "100%", border: "1.5px solid #E2DDCF", borderRadius: 8, padding: "7px 10px", fontSize: 13, fontFamily: "inherit", outline: "none", boxSizing: "border-box" }} />
                        <textarea value={newVerseText} onChange={e => setNewVerseText(e.target.value)} onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleAddVerse() } }} placeholder="Verse text" rows={3} style={{ width: "100%", border: "1.5px solid #E2DDCF", borderRadius: 8, padding: "7px 10px", fontSize: 13, fontFamily: "inherit", outline: "none", resize: "vertical", boxSizing: "border-box" }} />
                        <div style={{ display: "flex", gap: 8 }}>
                          <button onClick={() => { setAddingVerse(false); setNewVerseRef(""); setNewVerseText("") }} style={{ flex: 1, padding: "7px 0", background: "transparent", border: "1.5px solid #E2DDCF", borderRadius: 8, fontSize: 13, fontWeight: 500, cursor: "pointer", fontFamily: "inherit", color: "#5A5466" }}>Cancel</button>
                          <button onClick={handleAddVerse} disabled={savingVerse || !newVerseRef.trim() || !newVerseText.trim()} style={{ flex: 1, padding: "7px 0", background: "#3E1540", border: "none", borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: savingVerse ? "not-allowed" : "pointer", fontFamily: "inherit", color: "#F6F4EF", opacity: savingVerse || !newVerseRef.trim() || !newVerseText.trim() ? 0.5 : 1 }}>{savingVerse ? "Adding…" : "Add verse"}</button>
                        </div>
                      </div>
                    ) : (
                      <div style={{ padding: "14px 22px", borderTop: homeVerses.length > 0 ? "1px solid #EFE9DA" : undefined }}>
                        <button onClick={() => setAddingVerse(true)} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 13, color: "#3E1540", fontWeight: 500, fontFamily: "inherit", padding: 0 }}>+ Add verse</button>
                      </div>
                    )}
                  </div>
                </section>
              )}

              {/* Danger Zone */}
              {isAdmin && (
                <section>
                  <div style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: 22 }}>
                    <div style={{ flex: 1, height: 1, background: "#E8E2D2" }} />
                    <p style={{ fontFamily: "ui-monospace,'SF Mono',Menlo,monospace", fontSize: "10px", fontWeight: 400, letterSpacing: "1.2px", textTransform: "uppercase", color: "#9F3030", whiteSpace: "nowrap" }}>Danger Zone</p>
                    <div style={{ flex: 1, height: 1, background: "#E8E2D2" }} />
                  </div>
                  <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 24 }}>
                    <div style={{ flex: 1 }}>
                      <p style={{ fontFamily: "var(--font-instrument-serif)", fontSize: "22px", fontWeight: 400, color: "#13101A", marginBottom: 6 }}>Archive ministry</p>
                      <p style={{ fontSize: "13px", color: "#5A5466", lineHeight: 1.6, maxWidth: "560px" }}>Deactivates the ministry. Members lose access immediately. Data is preserved and can be restored by contacting support.</p>
                    </div>
                    {!showArchiveConfirm ? (
                      <button onClick={() => setShowArchiveConfirm(true)} style={{ flexShrink: 0, padding: "10px 18px", borderRadius: 10, border: "1px solid #9F3030", color: "#9F3030", background: "transparent", fontSize: 13, fontWeight: 500, cursor: "pointer" }}>Archive</button>
                    ) : (
                      <div style={{ flexShrink: 0, display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 8 }}>
                        <p style={{ fontSize: "12px", color: "#8A8497", textAlign: "right" }}>Type <strong style={{ color: "#13101A" }}>{ministryInfo?.name ?? ministryName}</strong> to confirm</p>
                        <input value={archiveConfirmText} onChange={e => setArchiveConfirmText(e.target.value)} placeholder="Ministry name…" style={{ padding: "8px 12px", borderRadius: 10, border: "1.5px solid #9F3030", fontSize: 13, color: "#13101A", outline: "none", background: "#FBF8F2", width: 192, fontFamily: "inherit" }} />
                        <div style={{ display: "flex", gap: 8 }}>
                          <button onClick={() => { setShowArchiveConfirm(false); setArchiveConfirmText("") }} style={{ padding: "6px 12px", borderRadius: 10, border: "1px solid #E2DDCF", fontSize: 12, color: "#5A5466", cursor: "pointer", background: "transparent" }}>Cancel</button>
                          <button onClick={handleArchive} disabled={archiving || archiveConfirmText !== (ministryInfo?.name ?? ministryName)} style={{ padding: "6px 12px", borderRadius: 10, border: "1px solid #9F3030", fontSize: 12, fontWeight: 600, color: "#9F3030", background: "transparent", cursor: "pointer", opacity: archiving || archiveConfirmText !== (ministryInfo?.name ?? ministryName) ? 0.5 : 1 }}>{archiving ? "Archiving…" : "Archive ministry"}</button>
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
            <div style={{ display: "flex", flexDirection: "column", gap: 32, marginTop: 40 }}>
              <div>
                <p style={SECTION_LABEL}>People · {totalMembers}</p>
                <h2 style={{ fontFamily: "var(--font-instrument-serif)", fontSize: 32, margin: "4px 0 0", letterSpacing: -0.3, lineHeight: 1.05, color: "#13101A" }}>Members and roles</h2>
                <p style={{ marginTop: 8, fontSize: 14, color: "#5A5466", lineHeight: 1.55 }}>Every person in {ministryInfo?.name ?? ministryName}, the role they hold, and how they joined.</p>
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
                  <button key={label} onClick={() => setPeopleFilter(filter)} style={{ ...CARD, padding: "18px", cursor: "pointer", textAlign: "left", borderColor: peopleFilter === filter ? "#3E1540" : "#E8E2D2" }}>
                    <p style={{ ...SECTION_LABEL, marginBottom: 8 }}>{label}</p>
                    <p style={{ fontFamily: "var(--font-instrument-serif)", fontSize: "32px", color: "#13101A", fontWeight: 400, lineHeight: 1 }}>{value}</p>
                  </button>
                ))}
              </div>

              {/* Search + filter */}
              <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
                <div style={{ flex: 1, minWidth: 280, maxWidth: 420, display: "flex", alignItems: "center", gap: 10, padding: "9px 14px", border: "1px solid #E2DDCF", borderRadius: 10, background: "#FBF8F2" }}>
                  <Search style={{ width: 15, height: 15, color: "#8A8497", flexShrink: 0 }} />
                  <input value={peopleSearch} onChange={e => setPeopleSearch(e.target.value)} placeholder="Search members…" style={{ flex: 1, border: "none", outline: "none", background: "transparent", fontSize: 14, color: "#13101A", fontFamily: "var(--font-inter)" }} />
                </div>
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                  {(["all", "admin", "leader", "member", "visitor"] as const).map(f => (
                    <button key={f} onClick={() => setPeopleFilter(f)} style={{ padding: "7px 12px", borderRadius: 999, border: `1px solid ${peopleFilter === f ? "#3E1540" : "#E2DDCF"}`, background: peopleFilter === f ? "#2D0F2E" : "#FBF8F2", color: peopleFilter === f ? "#FBF8F2" : "#5A5466", fontSize: 12, fontWeight: peopleFilter === f ? 500 : 400, cursor: "pointer", fontFamily: "var(--font-inter)" }}>
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
                    <p style={{ fontSize: 13, color: "#5A5466", flex: 1, margin: 0 }}>Remove <strong style={{ color: "#13101A" }}>{target?.name}</strong> from this ministry?</p>
                    <button onClick={() => setPeopleRemoveConfirmId(null)} style={{ fontSize: 12, color: "#5A5466", background: "none", border: "none", cursor: "pointer", padding: "4px 8px" }}>Cancel</button>
                    <button onClick={async () => { setPeopleRemoving(true); await handleRemoveMember(peopleRemoveConfirmId); setPeopleRemoving(false); setPeopleRemoveConfirmId(null) }} disabled={peopleRemoving} style={{ fontSize: 12, fontWeight: 600, color: "#9F3030", border: "1px solid #9F3030", background: "transparent", borderRadius: 8, padding: "6px 12px", cursor: "pointer", opacity: peopleRemoving ? 0.6 : 1 }}>
                      {peopleRemoving ? "Removing…" : "Remove"}
                    </button>
                  </div>
                )
              })()}

              {/* Member list */}
              <div style={{ border: "1px solid #E8E2D2", borderRadius: 14, background: "#FBF8F2", overflow: "hidden" }}>
                {peopleFiltered.length === 0 ? (
                  <p style={{ fontSize: 13, color: "#8A8497", padding: "24px", textAlign: "center" }}>{peopleSearch ? "No members match your search." : "No members found."}</p>
                ) : peopleFiltered.map((m, i) => {
                  const isMe = m.id === userId
                  const menuOpen = peopleRoleMenuOpen === m.id
                  return (
                    <div key={m.id} style={{ display: "flex", alignItems: "center", gap: 16, padding: "16px 22px", borderBottom: i < peopleFiltered.length - 1 ? "1px solid #EFE9DA" : "none", position: "relative" }}>
                      <span style={{ width: 38, height: 38, borderRadius: 10, flexShrink: 0, background: ["admin","deacon","elder","pastor"].includes(m.role.toLowerCase()) ? "#3E1540" : "#13101A", color: "#FBF8F2", display: "grid", placeItems: "center", fontSize: 13, fontWeight: 600 }}>{getInitials(m.name)}</span>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                          <span style={{ fontSize: 14, fontWeight: 500, color: "#13101A" }}>{m.name}</span>
                          {isMe && <span style={{ fontSize: 12, color: "#8A8497" }}>you</span>}
                        </div>
                        <div style={{ marginTop: 2, fontSize: 13, color: "#8A8497", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{m.email}</div>
                      </div>
                      {peopleChangingRole === m.id ? <span style={{ fontSize: 11, color: "#8A8497" }}>Saving…</span> : roleBadge(m.role)}
                      {isAdmin && !isMe && (
                        <div style={{ position: "relative" }}>
                          {menuOpen && <div style={{ position: "fixed", inset: 0, zIndex: 5 }} onClick={() => setPeopleRoleMenuOpen(null)} />}
                          <button onClick={() => setPeopleRoleMenuOpen(menuOpen ? null : m.id)} style={{ width: 28, height: 28, borderRadius: 6, display: "flex", alignItems: "center", justifyContent: "center", background: "none", border: "none", cursor: "pointer" }}>
                            <MoreHorizontal style={{ width: 16, height: 16, color: "#A09A8C" }} />
                          </button>
                          {menuOpen && (
                            <div style={{ position: "absolute", top: 32, right: 0, zIndex: 20, background: "#FBF8F2", borderRadius: 12, boxShadow: "0 4px 20px rgba(19,16,26,0.12)", border: "1px solid #E8E2D2", padding: "6px 0", minWidth: 160 }}>
                              <p style={{ fontFamily: "ui-monospace,'SF Mono',Menlo,monospace", fontSize: 10, color: "#8A8497", padding: "4px 12px 6px", textTransform: "uppercase", letterSpacing: "1.2px", fontWeight: 400, margin: 0 }}>Set role</p>
                              {(["visitor", "member", "leader", "admin", "deacon", "elder"] as const).map(r => (
                                <button key={r} onClick={async () => { setPeopleChangingRole(m.id); setPeopleRoleMenuOpen(null); await handleRoleChange(m.id, r); setPeopleChangingRole(null) }} style={{ width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between", padding: "8px 12px", fontSize: 13, background: "none", border: "none", cursor: "pointer", color: m.role.toLowerCase() === r ? "#3E1540" : "#13101A", fontWeight: m.role.toLowerCase() === r ? 600 : 400, textAlign: "left", boxSizing: "border-box" }}>
                                  {r.charAt(0).toUpperCase() + r.slice(1)}
                                  {m.role.toLowerCase() === r && <Check style={{ width: 14, height: 14, color: "#3E1540" }} />}
                                </button>
                              ))}
                              <div style={{ margin: "6px 12px", borderTop: "1px solid #EFE9DA" }} />
                              <button onClick={() => { setPeopleRemoveConfirmId(m.id); setPeopleRoleMenuOpen(null) }} style={{ width: "100%", display: "flex", alignItems: "center", gap: 8, padding: "8px 12px", fontSize: 13, color: "#9F3030", background: "none", border: "none", cursor: "pointer", textAlign: "left", boxSizing: "border-box" }}>Remove from ministry</button>
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
                    <AlertTriangle style={{ width: 16, height: 16, color: "#9F3030", flexShrink: 0 }} />
                    <div style={{ flex: 1 }}>
                      <p style={{ fontSize: 13, color: "#5A5466", margin: "0 0 2px" }}>Excommunicate <strong style={{ color: "#13101A" }}>{target?.name}</strong>?</p>
                      <p style={{ fontSize: 12, color: "#9F3030", margin: 0 }}>This is permanent. They will never be able to rejoin this ministry.</p>
                    </div>
                    <button onClick={() => setPeopleExcomConfirmId(null)} style={{ fontSize: 12, color: "#5A5466", background: "none", border: "none", cursor: "pointer", padding: "4px 8px" }}>Cancel</button>
                    <button onClick={() => handleExcommunicate(peopleExcomConfirmId)} disabled={excomming} style={{ fontSize: 12, fontWeight: 700, color: "#FBF8F2", border: "none", background: "#7A1010", borderRadius: 8, padding: "6px 12px", cursor: "pointer", opacity: excomming ? 0.6 : 1 }}>
                      {excomming ? "Banning…" : "Excommunicate"}
                    </button>
                  </div>
                )
              })()}

              {/* Banned members */}
              {isAdmin && bannedMembers.length > 0 && (
                <div>
                  <p style={{ ...SECTION_LABEL, marginBottom: 10 }}>Excommunicated</p>
                  <div style={{ border: "1px solid #F5D0D0", borderRadius: 14, background: "#FBF8F2", overflow: "hidden" }}>
                    {bannedMembers.map((b, i) => (
                      <div key={b.user_id} style={{ display: "flex", alignItems: "center", gap: 14, padding: "14px 20px", borderBottom: i < bannedMembers.length - 1 ? "1px solid #F5D0D0" : "none" }}>
                        <span style={{ width: 36, height: 36, borderRadius: 9, background: "#7A1010", color: "#FBF8F2", display: "grid", placeItems: "center", fontSize: 13, fontWeight: 600, flexShrink: 0 }}>{getInitials(b.name ?? "?")}</span>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: 14, fontWeight: 500, color: "#13101A" }}>{b.name ?? "Unknown"}</div>
                          <div style={{ fontSize: 12, color: "#8A8497", marginTop: 1 }}>{b.email ?? ""}</div>
                        </div>
                        <span style={{ fontSize: 11, color: "#9F3030", fontFamily: "ui-monospace, Menlo, monospace", letterSpacing: "0.05em", textTransform: "uppercase" }}>Banned</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ══════════════════ AUTOMATIONS TAB ══════════════════ */}
          {activeSettingsTab === "automations" && (
            <div style={{ display: "flex", flexDirection: "column", gap: 28, marginTop: 40 }}>
              <div>
                <p style={SECTION_LABEL}>Automations</p>
                <h2 style={{ fontFamily: "var(--font-instrument-serif)", fontSize: 32, margin: "4px 0 0", letterSpacing: -0.3, lineHeight: 1.05, color: "#13101A" }}>Chat &amp; membership rules</h2>
                <p style={{ marginTop: 8, fontSize: 14, color: "#5A5466", maxWidth: 640, lineHeight: 1.55 }}>Behind-the-scenes rules that keep chats current and new members in the right rooms. Changes take effect when you save.</p>
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
                    <div key={key} style={{ ...CARD, padding: 22, display: "flex", alignItems: "flex-start", gap: 16, outline: changed ? "2px solid #3E1540" : "none", outlineOffset: -2 }}>
                      <button onClick={() => handleAutomationToggle(key)} disabled={!isAdmin} style={{ width: 38, height: 22, borderRadius: 999, border: "none", background: on ? "#3E1540" : "#D6D0C0", position: "relative", flexShrink: 0, cursor: isAdmin ? "pointer" : "not-allowed", padding: 0, opacity: !isAdmin ? 0.5 : 1 }}>
                        <span style={{ position: "absolute", width: 16, height: 16, borderRadius: 999, background: "#FBF8F2", top: 3, left: on ? 19 : 3, transition: "left 0.15s" }} />
                      </button>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 14, fontWeight: 500, color: "#13101A" }}>{label}</div>
                        <div style={{ marginTop: 6, fontSize: 13, color: "#5A5466", lineHeight: 1.55 }}>{sub}</div>
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
                    <div key={key} style={{ ...CARD, padding: 22, display: "flex", alignItems: "flex-start", gap: 16, background: "#F7F4EF", opacity: 0.6, pointerEvents: "none" }}>
                      <div style={{ width: 38, height: 22, borderRadius: 999, background: "#D6D0C0", position: "relative", flexShrink: 0 }}>
                        <span style={{ position: "absolute", width: 16, height: 16, borderRadius: 999, background: "#FBF8F2", top: 3, left: 3 }} />
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 14, fontWeight: 500, color: "#13101A", display: "flex", alignItems: "center", gap: 8 }}>
                          {label}
                          <span style={{ fontSize: 10, letterSpacing: "0.8px", padding: "2px 7px", borderRadius: 999, background: "#EFEAE0", textTransform: "uppercase", fontWeight: 500, color: "#8A8497" }}>Soon</span>
                        </div>
                        <div style={{ marginTop: 6, fontSize: 13, color: "#5A5466", lineHeight: 1.55 }}>{sub}</div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Archive warning */}
              {showArchiveWarning && (
                <div style={{ ...CARD, padding: 20, borderColor: "#FECACA", background: "#FFF5F5" }}>
                  <div style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
                    <AlertTriangle style={{ width: 18, height: 18, color: "#DC2626", flexShrink: 0, marginTop: 1 }} />
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 14, fontWeight: 600, color: "#13101A", marginBottom: 6 }}>This will archive chats</div>
                      <div style={{ fontSize: 13, color: "#5A5466", lineHeight: 1.55, marginBottom: 14 }}>
                        Turning these off will archive: <strong>{pendingArchiveLabels.join(", ")}</strong>. Members will lose access from their active list.
                      </div>
                      <div style={{ display: "flex", gap: 10 }}>
                        <button onClick={() => setShowArchiveWarning(false)} style={{ padding: "8px 16px", borderRadius: 10, border: "1px solid #E2DDCF", background: "transparent", color: "#5A5466", fontSize: 13, fontWeight: 500, cursor: "pointer" }}>Cancel</button>
                        <button onClick={commitSaveAutomations} disabled={savingAutomations} style={{ padding: "8px 16px", borderRadius: 10, border: "none", background: "#DC2626", color: "#fff", fontSize: 13, fontWeight: 600, cursor: "pointer", opacity: savingAutomations ? 0.6 : 1 }}>
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
                  <button onClick={() => setPendingAutomationSettings(automationSettings)} style={{ padding: "9px 18px", borderRadius: 10, border: "1px solid #E2DDCF", background: "transparent", color: "#5A5466", fontSize: 13, fontWeight: 500, cursor: "pointer" }}>Discard</button>
                  <button onClick={handleSaveAutomations} disabled={savingAutomations} style={{ padding: "9px 18px", borderRadius: 10, border: "none", background: "#2D0F2E", color: "#F6F4EF", fontSize: 13, fontWeight: 600, cursor: savingAutomations ? "not-allowed" : "pointer", opacity: savingAutomations ? 0.6 : 1 }}>
                    {savingAutomations ? "Saving…" : "Save changes"}
                  </button>
                </div>
              )}

              {automationSaveMsg && (
                <div style={{ padding: "10px 16px", borderRadius: 10, background: "#F1ECDE", border: "1px solid #E2DDCF", fontSize: 13, color: "#5A5466" }}>
                  {automationSaveMsg}
                </div>
              )}

              {/* Annual class maintenance */}
              {isAdmin && (
                <div style={{ ...CARD, padding: 22, display: "flex", alignItems: "flex-start", gap: 18 }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 14, fontWeight: 500, color: "#13101A" }}>Run annual class maintenance</div>
                    <div style={{ marginTop: 6, fontSize: 13, color: "#5A5466", lineHeight: 1.55 }}>Creates the new incoming class chat for this fall, and converts the graduating class chat from a church chat to a my-chat. Safe to run multiple times.</div>
                    {maintenanceResult && <div style={{ marginTop: 8, fontSize: 12, color: maintenanceResult.startsWith("Error") ? "#9F3030" : "#3E7A40" }}>{maintenanceResult}</div>}
                  </div>
                  <button onClick={handleRunMaintenance} disabled={maintenanceRunning} style={{ padding: "8px 16px", borderRadius: 10, border: "1px solid #E2DDCF", background: maintenanceRunning ? "#E2DDCF" : "#FBF8F2", color: maintenanceRunning ? "#8A8497" : "#13101A", fontSize: 13, fontWeight: 500, cursor: maintenanceRunning ? "not-allowed" : "pointer", flexShrink: 0 }}>
                    {maintenanceRunning ? "Running…" : "Run now"}
                  </button>
                </div>
              )}
            </div>
          )}

          {/* ══════════════════ WORKSPACE TAB ══════════════════ */}
          {activeSettingsTab === "workspace" && (
            <div style={{ display: "flex", flexDirection: "column", gap: 48, marginTop: 40 }}>

              {/* Join codes */}
              <section>
                <div style={{ marginBottom: 20 }}>
                  <p style={SECTION_LABEL}>Join Codes</p>
                  <h2 style={{ fontFamily: "var(--font-instrument-serif)", fontSize: 32, margin: "4px 0 0", letterSpacing: -0.3, lineHeight: 1.05, color: "#13101A" }}>How people get in</h2>
                  <p style={{ marginTop: 8, fontSize: 14, color: "#5A5466", lineHeight: 1.55 }}>Share these codes to let people join {ministryInfo?.name ?? ministryName}. Staff codes assign admin-tier roles automatically.</p>
                </div>
                <div style={{ display: "grid", gridTemplateColumns: isAdmin && staffCode ? "1fr 1fr" : "1fr", gap: 18, maxWidth: isAdmin && staffCode ? undefined : 480 }}>
                  {/* Invite code */}
                  <div style={{ ...CARD, padding: 22 }}>
                    <div style={{ fontSize: 14, fontWeight: 500, color: "#13101A" }}>Invite code</div>
                    <div style={{ marginTop: 6, fontSize: 13, color: "#5A5466", lineHeight: 1.5 }}>Share with members to let them join directly.</div>
                    <div style={{ marginTop: 16, display: "flex", alignItems: "center", gap: 10 }}>
                      <span style={{ flex: 1, padding: "10px 14px", borderRadius: 10, background: "#F1ECDE", border: "1px solid #E2DDCF", fontFamily: "ui-monospace, Menlo, monospace", fontSize: 16, letterSpacing: 2, color: "#13101A", fontWeight: 600, textAlign: "center", display: "block" }}>{inviteCode ?? "———"}</span>
                      <button onClick={copyInviteCode} disabled={!inviteCode} style={{ padding: "9px 14px", borderRadius: 10, border: "1px solid #E2DDCF", background: "transparent", color: "#5A5466", fontSize: 13, cursor: "pointer", display: "flex", alignItems: "center", gap: 6 }}>
                        {copied ? <Check style={{ width: 13, height: 13, color: "#3E1540" }} /> : <Copy style={{ width: 13, height: 13 }} />}
                        {copied ? "Copied" : "Copy"}
                      </button>
                    </div>
                    {isAdmin && (showRegenerateConfirm ? (
                      <div style={{ marginTop: 14, borderRadius: 10, border: "1px solid #E8E2D2", background: "#F7F4EF", padding: "12px 14px" }}>
                        <p style={{ fontSize: 12, color: "#5A5466", marginBottom: 8 }}>The old code will stop working immediately.</p>
                        <div style={{ display: "flex", gap: 8 }}>
                          <button onClick={() => setShowRegenerateConfirm(false)} style={{ padding: "5px 10px", borderRadius: 8, border: "1px solid #E2DDCF", fontSize: 12, color: "#5A5466", cursor: "pointer", background: "transparent" }}>Cancel</button>
                          <button onClick={handleRegenerate} disabled={regenerating} style={{ padding: "5px 10px", borderRadius: 8, background: "#2D0F2E", border: "none", fontSize: 12, fontWeight: 600, color: "#FBF8F2", cursor: "pointer", opacity: regenerating ? 0.6 : 1 }}>{regenerating ? "Regenerating…" : "Yes, regenerate"}</button>
                        </div>
                      </div>
                    ) : (
                      <button onClick={() => setShowRegenerateConfirm(true)} style={{ marginTop: 12, padding: 0, background: "none", border: "none", color: "#8A8497", fontSize: 13, cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 6 }}>
                        <RefreshCw style={{ width: 12, height: 12 }} /> Regenerate code
                      </button>
                    ))}
                  </div>

                  {/* Staff code — admin only */}
                  {isAdmin && staffCode && (
                    <div style={{ ...CARD, padding: 22 }}>
                      <div style={{ fontSize: 14, fontWeight: 500, color: "#13101A" }}>Staff code</div>
                      <div style={{ marginTop: 6, fontSize: 13, color: "#5A5466", lineHeight: 1.5 }}>For pastors, deacons, and elders. Joining with this code assigns an admin-tier role.</div>
                      <div style={{ marginTop: 16, display: "flex", alignItems: "center", gap: 10 }}>
                        <span style={{ flex: 1, padding: "10px 14px", borderRadius: 10, background: "#F1ECDE", border: "1px solid #E2DDCF", fontFamily: "ui-monospace, Menlo, monospace", fontSize: 16, letterSpacing: 2, color: "#13101A", fontWeight: 600, textAlign: "center", display: "block" }}>{staffCode}</span>
                        <button onClick={copyStaffCode} style={{ padding: "9px 14px", borderRadius: 10, border: "1px solid #E2DDCF", background: "transparent", color: "#5A5466", fontSize: 13, cursor: "pointer", display: "flex", alignItems: "center", gap: 6 }}>
                          {staffCopied ? <Check style={{ width: 13, height: 13, color: "#3E1540" }} /> : <Copy style={{ width: 13, height: 13 }} />}
                          {staffCopied ? "Copied" : "Copy"}
                        </button>
                      </div>
                      {showStaffRegenerateConfirm ? (
                        <div style={{ marginTop: 14, borderRadius: 10, border: "1px solid #E8E2D2", background: "#F7F4EF", padding: "12px 14px" }}>
                          <p style={{ fontSize: 12, color: "#5A5466", marginBottom: 8 }}>The old staff code will stop working immediately.</p>
                          <div style={{ display: "flex", gap: 8 }}>
                            <button onClick={() => setShowStaffRegenerateConfirm(false)} style={{ padding: "5px 10px", borderRadius: 8, border: "1px solid #E2DDCF", fontSize: 12, color: "#5A5466", cursor: "pointer", background: "transparent" }}>Cancel</button>
                            <button onClick={handleRegenerateStaff} disabled={regeneratingStaff} style={{ padding: "5px 10px", borderRadius: 8, background: "#2D0F2E", border: "none", fontSize: 12, fontWeight: 600, color: "#FBF8F2", cursor: "pointer", opacity: regeneratingStaff ? 0.6 : 1 }}>{regeneratingStaff ? "Regenerating…" : "Yes, regenerate"}</button>
                          </div>
                        </div>
                      ) : (
                        <button onClick={() => setShowStaffRegenerateConfirm(true)} style={{ marginTop: 12, padding: 0, background: "none", border: "none", color: "#8A8497", fontSize: 13, cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 6 }}>
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
                  <p style={SECTION_LABEL}>Calendar Integration</p>
                  <h2 style={{ fontFamily: "var(--font-instrument-serif)", fontSize: 32, margin: "4px 0 0", letterSpacing: -0.3, lineHeight: 1.05, color: "#13101A" }}>Sync events to your calendar</h2>
                  <p style={{ marginTop: 8, fontSize: 14, color: "#5A5466", lineHeight: 1.55 }}>Subscribe to your ministry&apos;s event calendar in Google Calendar, Apple Calendar, or Outlook. Events added in Central sync automatically every few hours.</p>
                </div>
                <div style={{ ...CARD, padding: 22 }}>
                  <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                    <div style={{ flex: 1, padding: "10px 14px", borderRadius: 10, background: "#F1ECDE", border: "1px solid #E2DDCF", fontFamily: "ui-monospace, Menlo, monospace", fontSize: 13, color: "#5A5466", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{calFeedUrl}</div>
                    <button onClick={copyCalUrl} style={{ padding: "9px 14px", borderRadius: 10, border: "1px solid #E2DDCF", background: "transparent", color: "#5A5466", fontSize: 13, cursor: "pointer", display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
                      {calCopied ? <Check style={{ width: 13, height: 13, color: "#3E1540" }} /> : <Copy style={{ width: 13, height: 13 }} />}
                      {calCopied ? "Copied" : "Copy"}
                    </button>
                    <button onClick={openGoogleCalendar} style={{ padding: "9px 14px", borderRadius: 10, background: "#2D0F2E", border: "none", color: "#FBF8F2", fontSize: 13, cursor: "pointer", display: "flex", alignItems: "center", gap: 6, flexShrink: 0, fontWeight: 500 }}>
                      <Calendar style={{ width: 13, height: 13 }} /> Add to Google Calendar
                    </button>
                  </div>
                  <p style={{ marginTop: 14, fontSize: 12, color: "#8A8497", lineHeight: 1.5 }}>Clicking the button copies the URL and opens Google Calendar — paste it in the &quot;From URL&quot; field. For Apple Calendar or Outlook, use the Copy button.</p>
                </div>
              </section>

              {/* Receipt limits */}
              {isAdmin && (
                <section>
                  <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", marginBottom: 20 }}>
                    <div>
                      <p style={SECTION_LABEL}>Receipt Limits</p>
                      <h2 style={{ fontFamily: "var(--font-instrument-serif)", fontSize: 32, margin: "4px 0 0", letterSpacing: -0.3, lineHeight: 1.05, color: "#13101A" }}>Per-event reimbursement caps</h2>
                      <p style={{ marginTop: 8, fontSize: 14, color: "#5A5466", lineHeight: 1.55 }}>Define a maximum reimbursement that members can submit against an event before it requires admin approval.</p>
                    </div>
                    {!addingLimit && <button onClick={() => setAddingLimit(true)} style={{ padding: "7px 12px", borderRadius: 10, border: "1px solid #E2DDCF", background: "transparent", color: "#5A5466", fontSize: 13, cursor: "pointer", flexShrink: 0 }}>+ Add limit</button>}
                  </div>
                  <div style={{ border: "1px solid #E8E2D2", borderRadius: 14, background: "#FBF8F2", overflow: "hidden" }}>
                    {receiptLimits.length === 0 && !addingLimit && <div style={{ padding: "20px 22px" }}><p style={{ fontSize: 13, color: "#8A8497" }}>No limits set. Add a limit to flag over-budget receipts.</p></div>}
                    {receiptLimits.map((l, i) => {
                      const catLabel = { dg_dinner: "DG Dinner", welcoming_week: "Welcoming Week", coffeehouse: "Coffeehouse", turkeybowl: "Turkey Bowl", supplies: "Supplies", other: "Other" }[l.category] ?? l.category
                      const fundLabel = { church: "Church", cmu: "CMU", pitt: "Pitt" }[l.fund] ?? l.fund
                      return (
                        <div key={l.id} style={{ display: "grid", gridTemplateColumns: "1.6fr 1fr auto auto", alignItems: "center", gap: 18, padding: "16px 22px", borderBottom: i < receiptLimits.length - 1 ? "1px solid #EFE9DA" : "none" }}>
                          <div>
                            <div style={{ fontSize: 14, fontWeight: 500, color: "#13101A" }}>{catLabel}</div>
                            <div style={{ marginTop: 2, fontSize: 13, color: "#8A8497" }}>{fundLabel} fund</div>
                          </div>
                          <div style={{ fontFamily: "var(--font-instrument-serif)", fontSize: 22, color: "#13101A", letterSpacing: -0.2 }}>${Number(l.max_amount).toFixed(0)}</div>
                          <button style={{ padding: "6px 12px", borderRadius: 8, border: "1px solid #E2DDCF", background: "transparent", color: "#5A5466", fontSize: 12, cursor: "default" }}>Edit</button>
                          <button onClick={() => handleDeleteLimit(l.id)} style={{ padding: "6px 12px", borderRadius: 8, border: "1px solid #E2DDCF", background: "transparent", color: "#9F3030", fontSize: 12, cursor: "pointer" }}>Remove</button>
                        </div>
                      )
                    })}
                    {addingLimit && (
                      <div style={{ padding: "16px 22px", borderTop: receiptLimits.length > 0 ? "1px solid #EFE9DA" : undefined }}>
                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 80px", gap: 8, marginBottom: 10 }}>
                          <select value={newLimitCategory} onChange={e => setNewLimitCategory(e.target.value)} style={{ padding: "7px 10px", border: "1.5px solid #E2DDCF", borderRadius: 8, fontSize: 13, fontFamily: "inherit", background: "#FDFBF7", outline: "none" }}>
                            {[["dg_dinner","DG Dinner"],["welcoming_week","Welcoming Week"],["coffeehouse","Coffeehouse"],["turkeybowl","Turkey Bowl"],["supplies","Supplies"],["other","Other"]].map(([v,l]) => <option key={v} value={v}>{l}</option>)}
                          </select>
                          <select value={newLimitFund} onChange={e => setNewLimitFund(e.target.value)} style={{ padding: "7px 10px", border: "1.5px solid #E2DDCF", borderRadius: 8, fontSize: 13, fontFamily: "inherit", background: "#FDFBF7", outline: "none" }}>
                            {[["church","Church"],["cmu","CMU"],["pitt","Pitt"]].map(([v,l]) => <option key={v} value={v}>{l}</option>)}
                          </select>
                          <input type="number" min="0" step="1" placeholder="$" value={newLimitAmount} onChange={e => setNewLimitAmount(e.target.value)} style={{ padding: "7px 10px", border: "1.5px solid #E2DDCF", borderRadius: 8, fontSize: 13, fontFamily: "inherit", background: "#FDFBF7", outline: "none" }} />
                        </div>
                        {limitError && <p style={{ fontSize: 12, color: "#9D2D2D", marginBottom: 8 }}>{limitError}</p>}
                        <div style={{ display: "flex", gap: 8 }}>
                          <button onClick={() => { setAddingLimit(false); setNewLimitAmount(""); setLimitError(null) }} style={{ flex: 1, padding: "7px 0", background: "transparent", border: "1.5px solid #E2DDCF", borderRadius: 8, fontSize: 13, fontWeight: 500, cursor: "pointer", fontFamily: "inherit", color: "#5A5466" }}>Cancel</button>
                          <button onClick={handleAddLimit} disabled={savingLimit || !newLimitAmount} style={{ flex: 1, padding: "7px 0", background: "#3E1540", border: "none", borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: savingLimit ? "not-allowed" : "pointer", fontFamily: "inherit", color: "#F6F4EF", opacity: savingLimit ? 0.6 : 1 }}>{savingLimit ? "Saving…" : "Add limit"}</button>
                        </div>
                      </div>
                    )}
                  </div>
                </section>
              )}
            </div>
          )}

          {activeSettingsTab === "audit" && isAdmin && (
            <div style={{ marginTop: 40 }}>
              <div style={{ marginBottom: 24 }}>
                <p style={SECTION_LABEL}>Audit Log</p>
                <h2 style={{ fontFamily: "var(--font-instrument-serif)", fontSize: 32, margin: "4px 0 0", letterSpacing: -0.3, lineHeight: 1.05, color: "#13101A" }}>Admin activity</h2>
                <p style={{ marginTop: 8, fontSize: 14, color: "#5A5466", lineHeight: 1.55 }}>A read-only record of administrative actions taken in your ministry. Last 100 entries.</p>
              </div>
              {auditLoading ? (
                <div style={{ textAlign: "center", padding: "40px 0", color: "#8A8497", fontSize: 14 }}>Loading…</div>
              ) : auditLogs.length === 0 ? (
                <div style={{ ...CARD, padding: "28px 22px", textAlign: "center" }}>
                  <p style={{ fontSize: 14, color: "#8A8497" }}>No activity recorded yet. Logs appear here as admins take actions.</p>
                </div>
              ) : (
                <div style={{ border: "1px solid #E8E2D2", borderRadius: 14, background: "#FBF8F2", overflow: "hidden" }}>
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
                      <div key={log.id} style={{ display: "grid", gridTemplateColumns: "1fr auto", alignItems: "start", gap: 16, padding: "14px 20px", borderBottom: i < auditLogs.length - 1 ? "1px solid #EFE9DA" : "none" }}>
                        <div>
                          <div style={{ fontSize: 14, fontWeight: 500, color: "#13101A" }}>{label}{log.entity_label ? ` "${log.entity_label}"` : ""}{roleChange}</div>
                          <div style={{ marginTop: 2, fontSize: 12, color: "#8A8497" }}>by {log.actor_name}</div>
                        </div>
                        <div style={{ fontSize: 12, color: "#A09A8C", whiteSpace: "nowrap", paddingTop: 2 }}>{timeStr}</div>
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

// ── MembersFullOverlay (kept for potential future use) ─────────────────────────

function MembersFullOverlay({ members, userId, isAdmin, initialFilter, onClose, onRoleChange, onRemoveMember, onExcommunicate }: {
  members: MemberRow[]
  userId: string
  isAdmin: boolean
  initialFilter: RoleFilter
  onClose: () => void
  onRoleChange: (id: string, role: "visitor" | "member" | "leader" | "admin" | "deacon" | "elder") => Promise<void>
  onRemoveMember: (id: string) => Promise<void>
  onExcommunicate?: (id: string) => Promise<void>
}) {
  const [search, setSearch] = useState("")
  const [filter, setFilter] = useState<RoleFilter>(initialFilter)
  const [roleMenuOpen, setRoleMenuOpen] = useState<string | null>(null)
  const [changingRole, setChangingRole] = useState<string | null>(null)
  const [removeConfirmId, setRemoveConfirmId] = useState<string | null>(null)
  const [removing, setRemoving] = useState(false)
  const [excomConfirmId, setExcomConfirmId] = useState<string | null>(null)
  const [excomming, setExcomming] = useState(false)

  const filtered = members.filter(m => {
    const role = m.role.toLowerCase()
    const roleMatch = filter === "all"
      || (filter === "admin" && ["admin", "deacon", "elder"].includes(role))
      || (filter !== "admin" && role === filter)
    const s = search.toLowerCase().trim()
    return roleMatch && (!s || m.name.toLowerCase().includes(s) || m.email.toLowerCase().includes(s))
  })

  async function handleRoleChange(memberId: string, role: "visitor" | "member" | "leader" | "admin" | "deacon" | "elder") {
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

  async function handleExcom() {
    if (!excomConfirmId || !onExcommunicate) return
    setExcomming(true)
    await onExcommunicate(excomConfirmId)
    setExcomming(false)
    setExcomConfirmId(null)
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
          {(["all", "visitor", "member", "leader", "admin", "deacon", "elder"] as const).map(f => (
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
        {excomConfirmId && (() => {
          const target = members.find(m => m.id === excomConfirmId)
          return (
            <div style={{ margin: "12px 0", borderRadius: 10, border: "1px solid #F87171", background: "#FFF0F0", padding: "12px 16px", display: "flex", alignItems: "center", gap: 12 }}>
              <AlertTriangle style={{ width: 16, height: 16, color: "#9F3030", flexShrink: 0 }} />
              <div style={{ flex: 1 }}>
                <p style={{ fontSize: 13, color: "#5A5466", margin: "0 0 2px" }}>Excommunicate <strong style={{ color: "#13101A" }}>{target?.name}</strong>?</p>
                <p style={{ fontSize: 12, color: "#9F3030", margin: 0 }}>Permanent — they can never rejoin this ministry.</p>
              </div>
              <button onClick={() => setExcomConfirmId(null)} style={{ fontSize: 12, color: "#5A5466", background: "none", border: "none", cursor: "pointer", padding: "4px 8px" }}>Cancel</button>
              <button onClick={handleExcom} disabled={excomming} style={{ fontSize: 12, fontWeight: 700, color: "#FBF8F2", border: "none", background: "#7A1010", borderRadius: 8, padding: "6px 12px", cursor: "pointer", opacity: excomming ? 0.6 : 1 }}>
                {excomming ? "Banning…" : "Excommunicate"}
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
                          {(["visitor", "member", "leader", "admin", "deacon", "elder"] as const).map(r => (
                            <button key={r} onClick={() => handleRoleChange(m.id, r)} style={{ width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between", padding: "8px 12px", fontSize: 13, background: "none", border: "none", cursor: "pointer", color: m.role.toLowerCase() === r ? "#3E1540" : "#13101A", fontWeight: m.role.toLowerCase() === r ? 600 : 400, textAlign: "left", boxSizing: "border-box" }}>
                              {r.charAt(0).toUpperCase() + r.slice(1)}
                              {m.role.toLowerCase() === r && <Check style={{ width: 14, height: 14, color: "#3E1540" }} />}
                            </button>
                          ))}
                          <div style={{ margin: "6px 12px", borderTop: "1px solid #EFE9DA" }} />
                          <button onClick={() => { setRemoveConfirmId(m.id); setRoleMenuOpen(null) }} style={{ width: "100%", display: "flex", alignItems: "center", gap: 8, padding: "8px 12px", fontSize: 13, color: "#9F3030", background: "none", border: "none", cursor: "pointer", textAlign: "left", boxSizing: "border-box" }}>
                            Remove from ministry
                          </button>
                          {onExcommunicate && (
                            <button onClick={() => { setExcomConfirmId(m.id); setRoleMenuOpen(null) }} style={{ width: "100%", display: "flex", alignItems: "center", gap: 8, padding: "8px 12px", fontSize: 13, color: "#7A1010", fontWeight: 600, background: "none", border: "none", cursor: "pointer", textAlign: "left", boxSizing: "border-box" }}>
                              Excommunicate
                            </button>
                          )}
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
