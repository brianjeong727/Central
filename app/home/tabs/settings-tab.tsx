"use client"

import { useState, useEffect } from "react"
import { Copy, Check, Users, Shield, Crown, MoreHorizontal, Search, X, AlertTriangle, RefreshCw, Pencil, Calendar, ExternalLink, GripVertical, BookOpen } from "lucide-react"
import { createClient } from "@/lib/supabase"
import { logAudit } from "@/lib/audit"
import { EYEBROW_STYLE, PlanLineIcon } from "../components/shared"
import { teamIconKey } from "../workspace-presets"
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
  cancelArchiveRequest,
  getMinistryCodes,
  runDepartedMemberCleanup,
} from "@/app/actions/ministry"
import { updateAutomationSettings, runAnnualClassMaintenance, retroactivelyApplyToggle, archiveToggleChats } from "@/app/actions/auto-chats"
import { getReceiptLimits, upsertReceiptLimit, deleteReceiptLimit } from "@/app/actions/receipts"
import type { ReceiptLimit } from "@/app/actions/receipts"
import { getHomeVerses, addHomeVerse, updateHomeVerse, deleteHomeVerse, reorderHomeVerses } from "@/app/actions/home-verses"
import type { HomeVerse } from "@/app/actions/home-verses"
import { updateGovernanceSettings, updateTeamAdminAccess } from "@/app/actions/governance"
import { activateSetupChecklist } from "@/app/actions/setup-checklist"
import { updateModerationSettings } from "@/app/actions/moderation"
import { MODERATION_DEFAULTS } from "@/lib/moderation"
import type { ModerationSettings, ModBehavior, ModStrictness, ModScope } from "@/lib/moderation"
import type { GovernanceSettings } from "../types"
import { getInitials, formatRelativeTime } from "../utils"
import { roleLabel } from "@/app/actions/super-constants"
import { MonogramChip, PageTitle, PlanSubTabStrip, SectionHeader, TabPageHeader, CentralButton, FilterChip, ConfirmDialog, CentralModal, ContentActionButton } from "@/components/central"
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
type ActiveSettingsTab = "general" | "people" | "governance" | "automations" | "chat" | "workspace" | "audit"

interface GovTeamRow {
  id: string
  name: string
  team_type: string | null
  admin_access: "none" | "view" | "write"
}

const ROLE_STYLE: Record<string, { bg: string; color: string; border: string; label: string }> = {
  admin:   { bg: "var(--plum-2)",  color: "var(--cream-panel)", border: "var(--plum-2)",              label: "Admin"   },
  deacon:  { bg: "var(--plum-2)",  color: "var(--cream-panel)", border: "var(--plum-2)",              label: "Deacon"  },
  elder:   { bg: "var(--plum-2)",  color: "var(--cream-panel)", border: "var(--plum-2)",              label: "Elder"   },
  pastor:  { bg: "var(--plum-2)",  color: "var(--cream-panel)", border: "var(--plum-2)",              label: "Pastor"  },
  leader:  { bg: "var(--ivory)",  color: "var(--plum)", border: "rgba(62,21,64,0.2)",   label: "Leader"  },
  member:  { bg: "var(--ivory)",  color: "var(--muted-text)", border: "var(--line-2)",              label: "Member"  },
  visitor: { bg: "var(--cream)", color: "var(--muted-text)", border: "var(--dashed)",       label: "Visitor" },
}

function roleBadge(role: string, personId?: string | null) {
  const r = role.toLowerCase()
  const s = ROLE_STYLE[r] ?? ROLE_STYLE.member
  return (
    <span style={{ fontSize: "11px", fontWeight: 500, padding: "4px 10px", borderRadius: 999, background: s.bg, color: s.color, border: `1px solid ${s.border}`, whiteSpace: "nowrap" }}>
      {roleLabel(role, personId)}
    </span>
  )
}

const SECTION_LABEL: React.CSSProperties = { ...EYEBROW_STYLE, fontWeight: 400 }

const CARD: React.CSSProperties = {
  background: "var(--cream-panel)", borderRadius: "14px", border: "1px solid var(--line)",
}

// ── Shared edit→stage→confirm→feedback primitives ─────────────────────────────
// One reusable system for the whole tab. A section header carries SectionEditControls
// (Edit → Cancel/Save + a transient Saved ✓), Save opens a CentralModal that lists
// the deltas, and Confirm persists. View mode leaves every input read-only.

// Transient "Saved ✓" tick — plum check + mono "Saved", auto-cleared by the caller.
function SavedTick({ show }: { show: boolean }) {
  if (!show) return null
  return (
    <span className="animate-fade-up" style={{ display: "inline-flex", alignItems: "center", gap: 5, fontFamily: "var(--mono)", fontSize: 11, fontWeight: 400, letterSpacing: "0.06em", color: "var(--plum)", whiteSpace: "nowrap" }}>
      <Check style={{ width: 13, height: 13 }} /> Saved
    </span>
  )
}

// Header-right control cluster. View: ghost Edit + Saved ✓. Edit: Cancel + Save changes.
function SectionEditControls({ editing, dirty, saving, saved, disabled, onEdit, onCancel, onSave }: {
  editing: boolean
  dirty: boolean
  saving: boolean
  saved: boolean
  disabled?: boolean
  onEdit: () => void
  onCancel: () => void
  onSave: () => void
}) {
  if (!editing) {
    if (disabled) return <SavedTick show={saved} />
    return (
      <div style={{ display: "inline-flex", alignItems: "center", gap: 12, flexShrink: 0 }}>
        <SavedTick show={saved} />
        <ContentActionButton label="Edit" variant="ghost" onClick={onEdit} icon={<Pencil style={{ width: 13, height: 13 }} />} />
      </div>
    )
  }
  return (
    <div style={{ display: "inline-flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
      <CentralButton variant="secondary" size="sm" onClick={onCancel} disabled={saving}>Cancel</CentralButton>
      <CentralButton variant="primary" size="sm" onClick={onSave} disabled={!dirty || saving}>{saving ? "Saving…" : "Save changes"}</CentralButton>
    </div>
  )
}

// One line in a confirm modal's change summary — "Label: old → new".
function ChangeRow({ label, from, to }: { label: string; from?: string; to: string }) {
  return (
    <div style={{ display: "flex", alignItems: "baseline", gap: 8, fontSize: 13.5, color: "var(--body)", lineHeight: 1.5 }}>
      <span style={{ fontWeight: 500, color: "var(--ink)", flexShrink: 0 }}>{label}</span>
      <span style={{ minWidth: 0 }}>
        {from !== undefined && <><span style={{ color: "var(--muted-text)" }}>{from}</span> <span style={{ color: "var(--faint)" }}>→</span> </>}
        <span style={{ color: "var(--ink)" }}>{to}</span>
      </span>
    </div>
  )
}

// The delta list shown inside every confirm modal.
function ChangeSummary({ children }: { children: React.ReactNode }) {
  return <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>{children}</div>
}

// Shared footer for confirm modals (Cancel + Confirm & save / custom confirm).
function ConfirmFooter({ onCancel, onConfirm, saving, confirmLabel = "Confirm & save", danger = false }: {
  onCancel: () => void
  onConfirm: () => void
  saving: boolean
  confirmLabel?: string
  danger?: boolean
}) {
  return (
    <>
      <CentralButton variant="secondary" size="sm" onClick={onCancel} disabled={saving}>Cancel</CentralButton>
      <CentralButton variant={danger ? "danger-solid" : "primary"} size="sm" onClick={onConfirm} disabled={saving}>{saving ? "Saving…" : confirmLabel}</CentralButton>
    </>
  )
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
    return (["general", "people", "governance", "automations", "chat", "workspace", "audit"].includes(p ?? "") ? p as ActiveSettingsTab : "general")
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

  // Chat moderation
  const [moderationSettings, setModerationSettings] = useState<ModerationSettings>(MODERATION_DEFAULTS)
  const [pendingModerationSettings, setPendingModerationSettings] = useState<ModerationSettings>(MODERATION_DEFAULTS)
  const [savingModeration, setSavingModeration] = useState(false)
  const [moderationSaveMsg, setModerationSaveMsg] = useState<string | null>(null)

  // Danger Zone — archiving is two-step (Q4): one admin requests, a DIFFERENT
  // admin confirms. archiveRequest mirrors ministries.archive_requested_by/_at.
  const [showArchiveConfirm, setShowArchiveConfirm] = useState(false)
  const [archiveConfirmText, setArchiveConfirmText] = useState("")
  const [archiving, setArchiving] = useState(false)
  const [archiveRequest, setArchiveRequest] = useState<{ by: string; at: string | null; name: string | null } | null>(null)
  const [cancelingArchive, setCancelingArchive] = useState(false)
  const [archiveError, setArchiveError] = useState<string | null>(null)

  // Schools
  const [schools, setSchools] = useState<{ id: string; name: string; abbreviation: string; sort_order: number }[]>([])
  const [addingSchool, setAddingSchool] = useState(false)
  const [newSchoolName, setNewSchoolName] = useState("")
  const [newSchoolAbbr, setNewSchoolAbbr] = useState("")
  const [savingSchool, setSavingSchool] = useState(false)
  const [schoolError, setSchoolError] = useState<string | null>(null)
  const [confirmDeleteSchool, setConfirmDeleteSchool] = useState<{ id: string; name: string } | null>(null)

  // Receipt limits
  const [receiptLimits, setReceiptLimits] = useState<ReceiptLimit[]>([])
  const [addingLimit, setAddingLimit] = useState(false)
  const [newLimitCategory, setNewLimitCategory] = useState("dg_dinner")
  const [newLimitFund, setNewLimitFund] = useState("church")
  const [newLimitAmount, setNewLimitAmount] = useState("")
  const [savingLimit, setSavingLimit] = useState(false)
  const [limitError, setLimitError] = useState<string | null>(null)
  const [editingLimitId, setEditingLimitId] = useState<string | null>(null)
  const [confirmDeleteLimit, setConfirmDeleteLimit] = useState<ReceiptLimit | null>(null)
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

  // Giving (offering) info — ministry_giving (zelle_name + zelle_info)
  const [givingName, setGivingName] = useState("")
  const [givingInfo, setGivingInfo] = useState("")
  const [givingSaved, setGivingSaved] = useState({ name: "", info: "" })
  const [savingGiving, setSavingGiving] = useState(false)
  const [givingSaveMsg, setGivingSaveMsg] = useState(false)
  const [editingGiving, setEditingGiving] = useState(false)
  const [givingError, setGivingError] = useState<string | null>(null)

  // Getting started guide — explicit re-activation for old ministries (setup_checklist.active)
  const [guideActivating, setGuideActivating] = useState(false)
  const [guideActivated, setGuideActivated] = useState(false)
  const [guideError, setGuideError] = useState<string | null>(null)

  // ── Edit → stage → confirm → feedback sessions ─────────────────────────────
  // Ministry Profile (name + university → updateMinistryInfo)
  const [profileEditing, setProfileEditing] = useState(false)
  const [profileDraft, setProfileDraft] = useState<{ name: string; university: string }>({ name: "", university: "" })
  const [profileConfirmOpen, setProfileConfirmOpen] = useState(false)
  const [profileSaved, setProfileSaved] = useState(false)

  // Discovery (isPublic → updateMinistryPublic)
  const [discoveryEditing, setDiscoveryEditing] = useState(false)
  const [discoveryDraft, setDiscoveryDraft] = useState(false)
  const [discoveryConfirmOpen, setDiscoveryConfirmOpen] = useState(false)
  const [discoverySaved, setDiscoverySaved] = useState(false)
  const [discoveryError, setDiscoveryError] = useState<string | null>(null)

  // Governance (all_admins + roster_ids + per-team access → one confirm)
  const [govEditing, setGovEditing] = useState(false)
  const [govDraft, setGovDraft] = useState<{ all_admins: boolean; roster_ids: string[]; teamAccess: Record<string, "none" | "view" | "write"> } | null>(null)
  const [govConfirmOpen, setGovConfirmOpen] = useState(false)
  const [govSaving, setGovSaving] = useState(false)
  const [govSaved, setGovSaved] = useState(false)

  // Automations (reuses pending/base + savingAutomations)
  const [automationsEditing, setAutomationsEditing] = useState(false)
  const [automationsConfirmOpen, setAutomationsConfirmOpen] = useState(false)
  const [automationsSaved, setAutomationsSaved] = useState(false)

  // Moderation (reuses pending/base + savingModeration)
  const [moderationEditing, setModerationEditing] = useState(false)
  const [moderationConfirmOpen, setModerationConfirmOpen] = useState(false)
  const [moderationSaved, setModerationSaved] = useState(false)

  // People — role-change confirm
  const [roleChangeConfirm, setRoleChangeConfirm] = useState<{ memberId: string; name: string; currentRole: string; newRole: "visitor" | "member" | "leader" | "admin" | "deacon" | "elder" | "pastor" } | null>(null)

  useEffect(() => {
    async function load() {
      const [{ data: min }, { data: profiles }, { data: schoolRows }, limitsRes, verses, { data: teamRows }, codesRes, { data: givingRow }] = await Promise.all([
        // invite_code/staff_invite_code are column-revoked for browser clients
        // (Q2 migration) — they load via the admin-scoped getMinistryCodes action.
        supabase.from("ministries").select("name, university, size, is_public, automation_settings, governance_settings, moderation_settings, archive_requested_by, archive_requested_at").eq("id", ministryId).maybeSingle(),
        supabase.from("profiles").select("id, name, email, role, graduation_year").eq("ministry_id", ministryId).order("name"),
        supabase.from("ministry_schools").select("id, name, abbreviation, sort_order").eq("ministry_id", ministryId).order("sort_order"),
        getReceiptLimits(ministryId),
        getHomeVerses(ministryId),
        supabase.from("teams").select("id, name, team_type, admin_access").eq("ministry_id", ministryId).order("name"),
        getMinistryCodes(ministryId),
        supabase.from("ministry_giving").select("zelle_info, zelle_name").eq("ministry_id", ministryId).maybeSingle(),
      ])

      setInviteCode(codesRes.inviteCode)
      setStaffCode(codesRes.staffInviteCode)
      if (min) {
        setMinistryInfo({ name: min.name, university: min.university, size: min.size })
        setIsPublic(min.is_public ?? false)
        if (min.archive_requested_by) {
          setArchiveRequest({
            by: min.archive_requested_by,
            at: min.archive_requested_at ?? null,
            name: (profiles ?? []).find(p => p.id === min.archive_requested_by)?.name ?? null,
          })
        }
        if (min.automation_settings) {
          const merged = { ...AUTOMATION_DEFAULTS, ...(min.automation_settings as Record<string, boolean>) }
          setAutomationSettings(merged)
          setPendingAutomationSettings(merged)
        }
        const gov = min.governance_settings as GovernanceSettings | null
        if (gov && typeof gov.all_admins === "boolean") {
          setGovernanceSettings({ all_admins: gov.all_admins, roster_ids: Array.isArray(gov.roster_ids) ? gov.roster_ids : [] })
        }
        const mergedMod = { ...MODERATION_DEFAULTS, ...((min.moderation_settings as Partial<ModerationSettings> | null) ?? {}) }
        setModerationSettings(mergedMod)
        setPendingModerationSettings(mergedMod)
      }
      setGovTeams((teamRows ?? []).map((t) => ({ id: t.id, name: t.name, team_type: t.team_type ?? null, admin_access: (t.admin_access ?? "view") as "none" | "view" | "write" })))
      setSchools((schoolRows ?? []) as { id: string; name: string; abbreviation: string; sort_order: number }[])
      setReceiptLimits(limitsRes.data)
      setMembers(profiles ?? [])
      setHomeVerses(verses)
      setGivingName(givingRow?.zelle_name ?? "")
      setGivingInfo(givingRow?.zelle_info ?? "")
      setGivingSaved({ name: givingRow?.zelle_name ?? "", info: givingRow?.zelle_info ?? "" })
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

  // ── Ministry Profile edit session (name + university) ────────────────────────
  function flashSaved(setter: (v: boolean) => void) {
    setter(true)
    setTimeout(() => setter(false), 1800)
  }
  function startProfileEdit() {
    setProfileDraft({ name: ministryInfo?.name ?? ministryName, university: ministryInfo?.university ?? "" })
    setInfoError(null)
    setProfileEditing(true)
  }
  const profileDirty = !!ministryInfo && (
    profileDraft.name.trim() !== (ministryInfo.name ?? "") ||
    profileDraft.university.trim() !== (ministryInfo.university ?? "")
  )
  async function confirmProfileSave() {
    const name = profileDraft.name.trim()
    const university = profileDraft.university.trim()
    if (!name) { setInfoError("Ministry name can’t be empty."); setProfileConfirmOpen(false); return }
    setSavingInfo(true)
    setInfoError(null)
    const { error } = await updateMinistryInfo({ name, university })
    setSavingInfo(false)
    if (error) { setInfoError(error); setProfileConfirmOpen(false); return }
    setMinistryInfo(prev => prev ? { ...prev, name, university } : prev)
    setProfileConfirmOpen(false)
    setProfileEditing(false)
    flashSaved(setProfileSaved)
  }

  // ── Discovery edit session (public toggle) ───────────────────────────────────
  function startDiscoveryEdit() { setDiscoveryDraft(isPublic); setDiscoveryError(null); setDiscoveryEditing(true) }
  const discoveryDirty = discoveryDraft !== isPublic
  async function confirmDiscoverySave() {
    setToggling(true)
    setDiscoveryError(null)
    const { error } = await updateMinistryPublic(discoveryDraft)
    setToggling(false)
    if (error) { setDiscoveryError(error); setDiscoveryConfirmOpen(false); return }
    setIsPublic(discoveryDraft); onPublicChange(discoveryDraft)
    setDiscoveryConfirmOpen(false)
    setDiscoveryEditing(false)
    flashSaved(setDiscoverySaved)
  }

  // ── Giving (offering) info ──────────────────────────────────────────────────
  async function handleSaveGiving() {
    if (!isAdmin) return
    const info = givingInfo.trim(); const name = givingName.trim()
    setSavingGiving(true)
    setGivingError(null)
    const { error } = await supabase.from("ministry_giving").upsert(
      { ministry_id: ministryId, zelle_info: info || null, zelle_name: name || null, updated_by: userId, updated_at: new Date().toISOString() },
      { onConflict: "ministry_id" }
    )
    setSavingGiving(false)
    if (error) { setGivingError(error.message || "Couldn't save offering info."); return }
    setGivingSaved({ name, info }); setEditingGiving(false); setGivingSaveMsg(true); setTimeout(() => setGivingSaveMsg(false), 2500)
  }

  // ── Getting started guide (re-activate the Home setup checklist) ─────────────
  async function handleActivateGuide() {
    if (!isAdmin) return
    setGuideActivating(true)
    setGuideError(null)
    const { error } = await activateSetupChecklist()
    setGuideActivating(false)
    if (error) { setGuideError(error); return }
    setGuideActivated(true)
  }

  // ── Role change (routed through a confirm modal) ─────────────────────────────
  async function handleRoleChange(memberId: string, newRole: "visitor" | "member" | "leader" | "admin" | "deacon" | "elder" | "pastor") {
    const target = members.find(m => m.id === memberId)
    setPeopleChangingRole(memberId)
    const { error } = await updateMemberRole(memberId, newRole)
    if (!error) {
      setMembers(prev => prev.map(m => m.id === memberId ? { ...m, role: newRole } : m))
      logAudit({ ministryId, actorId: userId, actorName: userName, action: "member.role_change", entityType: "member", entityId: memberId, entityLabel: target?.name ?? null, metadata: { old_role: target?.role ?? null, new_role: newRole } })
    }
    setPeopleChangingRole(null)
  }
  async function confirmRoleChange() {
    if (!roleChangeConfirm) return
    const { memberId, newRole } = roleChangeConfirm
    setRoleChangeConfirm(null)
    await handleRoleChange(memberId, newRole)
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
    if (!isAdmin || !automationsEditing) return
    setPendingAutomationSettings(prev => ({ ...prev, [key]: !isToggleOn(key, prev) }))
  }

  const hasAutomationChanges = JSON.stringify(pendingAutomationSettings) !== JSON.stringify(automationSettings)

  const AUTOMATION_LABELS: Record<string, string> = {
    auto_sg_chats: "Auto-create small group chats",
    auto_grade_chats: "Grade & Young Adult chats",
    auto_central_chat: `Auto-add to ${ministryInfo?.name ?? ministryName} Chat`,
    auto_staff_chat: "Staff chat",
  }
  function automationDeltas() {
    const keys = ["auto_sg_chats", "auto_grade_chats", "auto_central_chat", "auto_staff_chat"]
    return keys
      .filter(k => isToggleOn(k, pendingAutomationSettings) !== isToggleOn(k, automationSettings))
      .map(k => ({ key: k, label: AUTOMATION_LABELS[k] ?? k, from: isToggleOn(k, automationSettings) ? "on" : "off", to: isToggleOn(k, pendingAutomationSettings) ? "on" : "off" }))
  }
  function automationArchiveLabels() {
    const labels: string[] = []
    for (const key of ARCHIVE_ON_OFF_KEYS) {
      const wasOn = isToggleOn(key, automationSettings)
      const isNowOn = isToggleOn(key, pendingAutomationSettings)
      if (!isNowOn && wasOn) {
        if (key === "auto_staff_chat") labels.push(`${ministryInfo?.name ?? ministryName} Staff chat`)
        if (key === "auto_grade_chats") labels.push("all Class of {year} chats")
      }
    }
    return labels
  }

  function startAutomationsEdit() { setPendingAutomationSettings(automationSettings); setAutomationSaveMsg(null); setAutomationsEditing(true) }
  function cancelAutomationsEdit() { setPendingAutomationSettings(automationSettings); setAutomationsEditing(false); setAutomationSaveMsg(null) }

  async function commitSaveAutomations() {
    setSavingAutomations(true)
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
    setAutomationSaveMsg(null)
    setAutomationsConfirmOpen(false)
    setAutomationsEditing(false)
    flashSaved(setAutomationsSaved)
  }

  const hasModerationChanges = JSON.stringify(pendingModerationSettings) !== JSON.stringify(moderationSettings)
  function setModField<K extends keyof ModerationSettings>(key: K, val: ModerationSettings[K]) {
    if (!moderationEditing) return
    setPendingModerationSettings((prev) => ({ ...prev, [key]: val }))
    setModerationSaveMsg(null)
  }
  function startModerationEdit() { setPendingModerationSettings(moderationSettings); setModerationSaveMsg(null); setModerationEditing(true) }
  function cancelModerationEdit() { setPendingModerationSettings(moderationSettings); setModerationEditing(false); setModerationSaveMsg(null) }
  const CAP = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)
  const MOD_BEHAVIOR_LABEL: Record<ModBehavior, string> = { asterisk_first: "Soften (s***)", asterisk_all: "Censor (****)", block: "Block send" }
  const MOD_SCOPE_LABEL: Record<ModScope, string> = { all: "All chats", church: "Church chats", personal: "Personal chats", ministry: "Ministry chat" }
  function moderationDeltas(): { label: string; from: string; to: string }[] {
    const d: { label: string; from: string; to: string }[] = []
    const p = pendingModerationSettings, b = moderationSettings
    if (p.enabled !== b.enabled) d.push({ label: "Language filter", from: b.enabled ? "on" : "off", to: p.enabled ? "on" : "off" })
    if (p.behavior !== b.behavior) d.push({ label: "Behavior", from: MOD_BEHAVIOR_LABEL[b.behavior], to: MOD_BEHAVIOR_LABEL[p.behavior] })
    if (p.strictness !== b.strictness) d.push({ label: "Strictness", from: CAP(b.strictness), to: CAP(p.strictness) })
    if (p.scope !== b.scope) d.push({ label: "Scope", from: MOD_SCOPE_LABEL[b.scope], to: MOD_SCOPE_LABEL[p.scope] })
    if (p.reverent_caps !== b.reverent_caps) d.push({ label: "Reverent capitalization", from: b.reverent_caps ? "on" : "off", to: p.reverent_caps ? "on" : "off" })
    return d
  }
  async function handleSaveModeration() {
    setSavingModeration(true)
    const res = await updateModerationSettings(ministryId, pendingModerationSettings)
    setSavingModeration(false)
    if (res?.error) { setModerationSaveMsg(`Error: ${res.error}`); setModerationConfirmOpen(false); return }
    setModerationSettings(pendingModerationSettings)
    setModerationConfirmOpen(false)
    setModerationEditing(false)
    flashSaved(setModerationSaved)
  }

  // ── Archive (two-step: request → second-admin confirm) ──────────────────────
  // The same action serves both steps: with no pending request it records one
  // ("requested"); called by a DIFFERENT admin with a request pending it
  // completes the archive ("archived"). The requester can never self-confirm.
  async function handleArchive() {
    setArchiving(true)
    setArchiveError(null)
    const { state, error } = await archiveMinistry()
    setArchiving(false)
    if (error) { setArchiveError(error); return }
    setShowArchiveConfirm(false)
    setArchiveConfirmText("")
    if (state === "requested") {
      setArchiveRequest({ by: userId, at: new Date().toISOString(), name: userName })
      return
    }
    if (state === "archived") window.location.href = "/landing"
  }

  async function handleCancelArchiveRequest() {
    setCancelingArchive(true)
    setArchiveError(null)
    const { error } = await cancelArchiveRequest(ministryId)
    setCancelingArchive(false)
    if (error) { setArchiveError(error); return }
    setArchiveRequest(null)
    setShowArchiveConfirm(false)
    setArchiveConfirmText("")
  }

  async function handleAddSchool() {
    const name = newSchoolName.trim()
    const abbr = newSchoolAbbr.trim()
    if (!name) return
    setSavingSchool(true)
    setSchoolError(null)
    const { data, error } = await supabase.from("ministry_schools").insert({ ministry_id: ministryId, name, abbreviation: abbr, sort_order: schools.length }).select("id, name, abbreviation, sort_order").single()
    if (error || !data) { setSchoolError(error?.message ? `Couldn't add school — ${error.message}` : "Failed to add school."); setSavingSchool(false); return }
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

  // ── Governance edit session ──────────────────────────────────────────────────
  // The all-admins toggle, roster toggles, and per-team access matrix are all
  // staged into ONE draft and persisted together on confirm.
  const adminMembers = members.filter(m => ["admin", "deacon", "elder", "pastor"].includes(m.role.toLowerCase()))

  function startGovEdit() {
    setGovDraft({
      all_admins: governanceSettings.all_admins,
      roster_ids: [...governanceSettings.roster_ids],
      teamAccess: Object.fromEntries(govTeams.map(t => [t.id, t.admin_access])),
    })
    setGovError(null)
    setGovEditing(true)
  }
  function cancelGovEdit() { setGovDraft(null); setGovEditing(false); setGovError(null) }

  function draftToggleAllAdmins() { setGovDraft(d => d ? { ...d, all_admins: !d.all_admins } : d) }
  function draftToggleRoster(id: string) {
    setGovDraft(d => d ? { ...d, roster_ids: d.roster_ids.includes(id) ? d.roster_ids.filter(x => x !== id) : [...d.roster_ids, id] } : d)
  }
  function draftTeamAccess(teamId: string, access: "none" | "view" | "write") {
    setGovDraft(d => d ? { ...d, teamAccess: { ...d.teamAccess, [teamId]: access } } : d)
  }

  const govRosterChanged = !!govDraft && JSON.stringify([...govDraft.roster_ids].sort()) !== JSON.stringify([...governanceSettings.roster_ids].sort())
  const govAllAdminsChanged = !!govDraft && govDraft.all_admins !== governanceSettings.all_admins
  const govTeamsChanged = !!govDraft && govTeams.filter(t => govDraft.teamAccess[t.id] !== t.admin_access)
  const govDirty = !!govDraft && (govAllAdminsChanged || govRosterChanged || (Array.isArray(govTeamsChanged) && govTeamsChanged.length > 0))

  async function confirmGovSave() {
    if (!govDraft) return
    setGovSaving(true)
    setGovError(null)
    const failures: string[] = []
    let nextGov = governanceSettings
    let nextTeams = govTeams

    if (govAllAdminsChanged || govRosterChanged) {
      const payload: GovernanceSettings = { all_admins: govDraft.all_admins, roster_ids: govDraft.roster_ids }
      const { error } = await updateGovernanceSettings(payload)
      if (error) failures.push("governance roster"); else nextGov = payload
    }
    const changedTeams = govTeams.filter(t => govDraft.teamAccess[t.id] !== t.admin_access)
    for (const t of changedTeams) {
      const { error } = await updateTeamAdminAccess(t.id, govDraft.teamAccess[t.id])
      if (error) failures.push(t.name)
      else nextTeams = nextTeams.map(x => x.id === t.id ? { ...x, admin_access: govDraft.teamAccess[t.id] } : x)
    }

    setGovernanceSettings(nextGov)
    setGovTeams(nextTeams)
    setGovSaving(false)
    setGovConfirmOpen(false)

    if (failures.length > 0) {
      // Partial: what succeeded is committed to real state; the draft is left
      // intact so only the still-changed (failed) items remain dirty for a retry.
      setGovError(`Couldn’t save: ${failures.join(", ")}. Other changes were saved — please retry the rest.`)
      return
    }
    setGovEditing(false)
    setGovDraft(null)
    flashSaved(setGovSaved)
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
    { key: "chat", label: "Chat" },
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

      {/* Desktop header — settings tab strip below is the single terminating hairline (R1) */}
      <TabPageHeader noBottomHairline>
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
                  <SectionHeader eyebrow="Ministry Identity" title="Profile" titleSize={20} action={
                    <SectionEditControls editing={profileEditing} dirty={profileDirty} saving={savingInfo} saved={profileSaved} disabled={!isAdmin}
                      onEdit={startProfileEdit} onCancel={() => { setProfileEditing(false); setInfoError(null) }} onSave={() => setProfileConfirmOpen(true)} />
                  } />
                  <p style={{ marginTop: 8, fontSize: 14, color: "var(--body)", lineHeight: 1.55 }}>The name, school, and visual identity members see when they find your ministry.</p>
                </div>
                <div style={{ ...CARD, padding: "22px 26px", display: "flex", alignItems: "center", gap: 20 }}>
                  <MonogramChip
                    initials={(ministryInfo?.name ?? ministryName)[0]}
                    className="flex-shrink-0"
                    style={{ width: 64, height: 64, fontFamily: "var(--font-instrument-serif)", fontSize: 30 }}
                  />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    {profileEditing ? (
                      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                        <input autoFocus value={profileDraft.name} onChange={e => setProfileDraft(d => ({ ...d, name: e.target.value }))} placeholder="Ministry name" style={{ fontFamily: "var(--font-instrument-serif)", fontSize: "28px", letterSpacing: -0.3, color: "var(--ink)", lineHeight: 1.1, background: "var(--ivory)", border: "1px solid var(--line-2)", borderRadius: 10, outline: "none", padding: "6px 12px", width: "100%", boxSizing: "border-box" }} />
                        <input value={profileDraft.university} onChange={e => setProfileDraft(d => ({ ...d, university: e.target.value }))} placeholder="School / university" style={{ fontSize: "14px", color: "var(--body)", background: "var(--ivory)", border: "1px solid var(--line-2)", borderRadius: 10, outline: "none", padding: "8px 12px", width: "100%", boxSizing: "border-box", fontFamily: "inherit" }} />
                      </div>
                    ) : (
                      <>
                        <p style={{ fontFamily: "var(--font-instrument-serif)", fontSize: "28px", letterSpacing: -0.3, color: "var(--ink)", lineHeight: 1.1 }}>{ministryInfo?.name ?? ministryName}</p>
                        <p style={{ fontSize: "14px", color: "var(--body)", marginTop: 4 }}>{ministryInfo?.university ?? "—"}</p>
                      </>
                    )}
                    {infoError && <p style={{ fontSize: "12px", color: "var(--danger)", marginTop: 8 }}>{infoError}</p>}
                  </div>
                </div>
              </section>

              {/* Discovery + Schools 2-col */}
              <section>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 28 }}>
                  {/* Discovery */}
                  <div>
                    <div style={{ marginBottom: 16 }}>
                      <SectionHeader eyebrow="Discovery" title={`Who can find ${ministryInfo?.name ?? ministryName}`} titleSize={20} action={
                        <SectionEditControls editing={discoveryEditing} dirty={discoveryDirty} saving={toggling} saved={discoverySaved} disabled={!isAdmin}
                          onEdit={startDiscoveryEdit} onCancel={() => { setDiscoveryEditing(false); setDiscoveryError(null) }} onSave={() => setDiscoveryConfirmOpen(true)} />
                      } />
                    </div>
                    {(() => {
                      const shown = discoveryEditing ? discoveryDraft : isPublic
                      const locked = !discoveryEditing
                      return (
                        <div style={{ ...CARD, padding: "20px 22px", display: "flex", alignItems: "flex-start", gap: 16 }}>
                          <button onClick={discoveryEditing ? () => setDiscoveryDraft(v => !v) : undefined} disabled={locked} style={{ width: 38, height: 22, borderRadius: 999, border: "none", background: shown ? "var(--plum)" : "var(--dashed)", position: "relative", flexShrink: 0, cursor: locked ? "default" : "pointer", padding: 0, opacity: locked ? 0.6 : 1 }}>
                            <span style={{ position: "absolute", width: 18, height: 18, borderRadius: 999, background: "var(--cream)", top: 2, ...(shown ? { right: 2 } : { left: 2 }) }} />
                          </button>
                          <div style={{ flex: 1 }}>
                            <div style={{ fontSize: 14, fontWeight: 500, color: "var(--ink)" }}>Public discovery</div>
                            <div style={{ marginTop: 4, fontSize: 13, color: "var(--body)", lineHeight: 1.5 }}>{shown ? "Anyone can find and join without an invite code." : "Invite-only — code required to join."}</div>
                            {discoveryError && <div style={{ marginTop: 6, fontSize: 12, color: "var(--danger)" }}>{discoveryError}</div>}
                          </div>
                        </div>
                      )
                    })()}
                  </div>

                  {/* Schools */}
                  <div>
                    <div style={{ marginBottom: 16 }}>
                      <SectionHeader eyebrow="Schools" title="Linked campuses" titleSize={20} action={isAdmin && !addingSchool ? (<CentralButton variant="create" size="sm" onClick={() => setAddingSchool(true)} style={{ flexShrink: 0 }}>+ Add school</CentralButton>) : undefined} />
                    </div>
                    <div style={{ ...CARD, overflow: "hidden" }}>
                      {schools.length === 0 && !addingSchool && <div style={{ padding: "16px 20px" }}><p style={{ fontSize: 13, color: "var(--muted-text)" }}>No schools added yet.</p></div>}
                      {schools.length > 0 && (
                        <div style={{ padding: "16px 18px", display: "flex", flexWrap: "wrap", gap: 8 }}>
                          {schools.map(s => (
                            <span key={s.id} style={{ display: "inline-flex", alignItems: "center", gap: 8, padding: "6px 12px", borderRadius: 999, background: "var(--ivory)", color: "var(--plum-2)", border: "1px solid var(--line-2)", fontSize: 13 }}>
                              <span style={{ fontWeight: 500 }}>{s.name}</span>
                              {s.abbreviation && <span style={{ color: "var(--muted-text)", fontSize: 12 }}>({s.abbreviation})</span>}
                              {isAdmin && <button onClick={() => setConfirmDeleteSchool({ id: s.id, name: s.name })} style={{ background: "none", border: "none", padding: 0, color: "var(--muted-text)", cursor: "pointer", lineHeight: 1, fontSize: 16 }}>×</button>}
                            </span>
                          ))}
                        </div>
                      )}
                      {isAdmin && addingSchool && (
                        <div style={{ padding: "16px 18px", borderTop: schools.length > 0 ? "1px solid var(--line-3)" : undefined }}>
                          {schoolError && <p style={{ fontSize: 12, color: "var(--danger)", marginBottom: 8 }}>{schoolError}</p>}
                          <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 10 }}>
                            <input autoFocus type="text" placeholder="School name (e.g. University of Pittsburgh)" value={newSchoolName} onChange={e => setNewSchoolName(e.target.value)} style={{ width: "100%", border: "1.5px solid var(--line-2)", borderRadius: 8, padding: "7px 10px", fontSize: 13, fontFamily: "inherit", outline: "none", boxSizing: "border-box" }} />
                            <input type="text" placeholder="Abbreviation (optional, e.g. Pitt)" value={newSchoolAbbr} onChange={e => setNewSchoolAbbr(e.target.value)} style={{ width: "100%", border: "1.5px solid var(--line-2)", borderRadius: 8, padding: "7px 10px", fontSize: 13, fontFamily: "inherit", outline: "none", boxSizing: "border-box" }} />
                          </div>
                          <div style={{ display: "flex", gap: 8 }}>
                            <button onClick={() => { setAddingSchool(false); setNewSchoolName(""); setNewSchoolAbbr(""); setSchoolError(null) }} style={{ flex: 1, padding: "7px 0", background: "transparent", border: "1.5px solid var(--line-2)", borderRadius: 8, fontSize: 13, fontWeight: 500, cursor: "pointer", fontFamily: "inherit", color: "var(--body)" }}>Cancel</button>
                            <button onClick={handleAddSchool} disabled={savingSchool || !newSchoolName.trim()} style={{ flex: 1, padding: "7px 0", background: "var(--plum)", border: "none", borderRadius: 8, fontSize: 13, fontWeight: 500, cursor: (savingSchool || !newSchoolName.trim()) ? "not-allowed" : "pointer", fontFamily: "inherit", color: "var(--cream-on-dark)", opacity: (savingSchool || !newSchoolName.trim()) ? 0.45 : 1 }}>{savingSchool ? "Adding…" : "Add"}</button>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </section>

              {/* Giving (offering) info */}
              {isAdmin && (
                <section>
                  <div style={{ marginBottom: 16 }}>
                    <SectionHeader eyebrow="Giving" title="Offering info" titleSize={20} action={
                      <div style={{ display: "inline-flex", alignItems: "center", gap: 12, flexShrink: 0 }}>
                        <SavedTick show={givingSaveMsg} />
                        {isAdmin && !editingGiving && (givingSaved.name || givingSaved.info) ? (<button onClick={() => { setGivingName(givingSaved.name); setGivingInfo(givingSaved.info); setGivingError(null); setEditingGiving(true) }} style={{ padding: "7px 12px", borderRadius: 10, border: "1px solid var(--line-2)", background: "transparent", color: "var(--body)", fontSize: 13, cursor: "pointer", flexShrink: 0 }}>Edit</button>) : null}
                      </div>
                    } />
                    <p style={{ marginTop: 8, fontSize: 14, color: "var(--body)", lineHeight: 1.55 }}>The Zelle destination members see on the Give tab. The recipient name lets givers confirm they&apos;re sending to the right place.</p>
                  </div>
                  <div style={{ ...CARD, padding: "20px 22px", maxWidth: 520 }}>
                    {editingGiving ? (
                      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                        {givingError && <p style={{ fontSize: 13, color: "var(--danger)", margin: 0 }}>{givingError}</p>}
                        <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
                          <label style={{ fontSize: 12, color: "var(--muted-text)", letterSpacing: "0.08em", textTransform: "uppercase" }}>Recipient name</label>
                          <input type="text" value={givingName} onChange={e => setGivingName(e.target.value)} placeholder="The Korean Central Church of Pittsburgh" style={{ background: "var(--ivory)", border: "1px solid var(--line-2)", borderRadius: 12, padding: "12px 14px", fontSize: 14, color: "var(--ink)", outline: "none", width: "100%", boxSizing: "border-box" }} />
                        </div>
                        <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
                          <label style={{ fontSize: 12, color: "var(--muted-text)", letterSpacing: "0.08em", textTransform: "uppercase" }}>Zelle email or phone</label>
                          <input type="text" value={givingInfo} onChange={e => setGivingInfo(e.target.value)} placeholder="giving@yourministry.org" style={{ background: "var(--ivory)", border: "1px solid var(--line-2)", borderRadius: 12, padding: "12px 14px", fontSize: 14, color: "var(--ink)", outline: "none", width: "100%", boxSizing: "border-box" }} />
                        </div>
                        <div style={{ display: "flex", gap: 8 }}>
                          <CentralButton variant="secondary" size="sm" onClick={() => { setGivingName(givingSaved.name); setGivingInfo(givingSaved.info); setGivingError(null); setEditingGiving(false) }} style={{ flex: 1 }}>Cancel</CentralButton>
                          <CentralButton variant="primary" size="sm" onClick={handleSaveGiving} disabled={savingGiving} style={{ flex: 1 }}>{savingGiving ? "Saving…" : "Save changes"}</CentralButton>
                        </div>
                      </div>
                    ) : (givingSaved.name || givingSaved.info) ? (
                      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                        <div>
                          <p style={{ fontSize: 12, color: "var(--muted-text)", letterSpacing: "0.08em", textTransform: "uppercase", margin: 0 }}>Recipient name</p>
                          <p style={{ fontSize: 14, color: "var(--ink)", margin: "5px 0 0" }}>{givingSaved.name || <span style={{ color: "var(--muted-text)" }}>Not set</span>}</p>
                        </div>
                        <div>
                          <p style={{ fontSize: 12, color: "var(--muted-text)", letterSpacing: "0.08em", textTransform: "uppercase", margin: 0 }}>Zelle email or phone</p>
                          <p style={{ fontSize: 14, color: "var(--ink)", margin: "5px 0 0" }}>{givingSaved.info || <span style={{ color: "var(--muted-text)" }}>Not set</span>}</p>
                        </div>
                        {givingSaveMsg && <SavedTick show={givingSaveMsg} />}
                      </div>
                    ) : (
                      <div style={{ display: "flex", flexDirection: "column", gap: 12, alignItems: "flex-start" }}>
                        <p style={{ fontSize: 14, color: "var(--muted-text)", margin: 0, lineHeight: 1.55 }}>No offering info set yet. Add your Zelle destination so members can give on the Give tab.</p>
                        <CentralButton variant="primary" size="sm" onClick={() => { setGivingName(givingSaved.name); setGivingInfo(givingSaved.info); setGivingError(null); setEditingGiving(true) }}>Add offering info</CentralButton>
                      </div>
                    )}
                  </div>
                </section>
              )}

              {/* Daily Verse Rotation */}
              {isAdmin && (
                <section>
                  <div style={{ marginBottom: 20 }}>
                    <SectionHeader eyebrow="Daily Verse Rotation" title="Verses on the sidebar" titleSize={20} action={!addingVerse ? <CentralButton variant="create" size="sm" onClick={() => setAddingVerse(true)} style={{ flexShrink: 0 }}>+ Add verse</CentralButton> : undefined} />
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
                                <CentralButton variant="secondary" size="sm" onClick={() => setEditingVerseId(null)} style={{ flex: 1 }}>Cancel</CentralButton>
                                <CentralButton variant="primary" size="sm" onClick={() => handleUpdateVerse(v.id)} disabled={savingVerse || !verseRefDraft.trim() || !verseTextDraft.trim()} style={{ flex: 1 }}>{savingVerse ? "Saving…" : "Save"}</CentralButton>
                              </div>
                            </div>
                          ) : confirmDeleteVerseId === v.id ? (
                            <div style={{ padding: "16px 22px" }}>
                              <p style={{ fontSize: 12, color: "var(--body)", marginBottom: 8 }}>Remove &ldquo;{v.reference}&rdquo;?</p>
                              <div style={{ display: "flex", gap: 8 }}>
                                <CentralButton variant="secondary" size="sm" onClick={() => setConfirmDeleteVerseId(null)} style={{ flex: 1 }}>Cancel</CentralButton>
                                <CentralButton variant="danger-solid" size="sm" onClick={() => handleDeleteVerse(v.id)} disabled={deletingVerseId === v.id} style={{ flex: 1 }}>{deletingVerseId === v.id ? "Removing…" : "Remove"}</CentralButton>
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
                          <CentralButton variant="secondary" size="sm" onClick={() => { setAddingVerse(false); setNewVerseRef(""); setNewVerseText("") }} style={{ flex: 1 }}>Cancel</CentralButton>
                          <CentralButton variant="primary" size="sm" onClick={handleAddVerse} disabled={savingVerse || !newVerseRef.trim() || !newVerseText.trim()} style={{ flex: 1 }}>{savingVerse ? "Adding…" : "Add verse"}</CentralButton>
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

              {/* Getting started guide */}
              {isAdmin && (
                <section>
                  <div style={{ marginBottom: 16 }}>
                    <SectionHeader eyebrow="Onboarding" title="Getting started guide" titleSize={20} />
                    <p style={{ marginTop: 8, fontSize: 14, color: "var(--body)", lineHeight: 1.55 }}>Show the setup checklist on Home for all admins — useful when onboarding new leadership.</p>
                  </div>
                  <div style={{ ...CARD, padding: "20px 22px", maxWidth: 520, display: "flex", alignItems: "center", gap: 16 }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      {guideActivated ? (
                        <span className="animate-fade-up" style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 14, fontWeight: 500, color: "var(--ink)" }}>
                          <Check style={{ width: 14, height: 14, color: "var(--plum)" }} /> Visible on Home
                        </span>
                      ) : (
                        <span style={{ fontSize: 14, color: "var(--muted-text)" }}>The guide stays on Home until an admin dismisses it.</span>
                      )}
                      {guideError && <p style={{ fontSize: 12, color: "var(--danger)", margin: "6px 0 0" }}>{guideError}</p>}
                    </div>
                    {guideActivated ? (
                      <CentralButton variant="secondary" size="sm" disabled style={{ flexShrink: 0 }}>Shown</CentralButton>
                    ) : (
                      <CentralButton variant="primary" size="sm" onClick={handleActivateGuide} disabled={guideActivating} style={{ flexShrink: 0 }}>{guideActivating ? "Showing…" : "Show on Home"}</CentralButton>
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
                      {archiveRequest === null ? (
                        <p style={{ fontSize: "13px", color: "var(--body)", lineHeight: 1.6, maxWidth: "560px" }}>Deactivates the ministry. Members lose access immediately. Data is preserved and can be restored by contacting support. Requesting archive requires a second admin to confirm.</p>
                      ) : archiveRequest.by === userId ? (
                        <p style={{ fontSize: "13px", color: "var(--body)", lineHeight: 1.6, maxWidth: "560px" }}>Archive requested — awaiting a different admin to confirm. You can&apos;t confirm your own request.</p>
                      ) : (
                        <p style={{ fontSize: "13px", color: "var(--body)", lineHeight: 1.6, maxWidth: "560px" }}>
                          Archive requested by <strong style={{ color: "var(--ink)" }}>{archiveRequest.name ?? "another admin"}</strong>
                          {archiveRequest.at ? <> · {formatRelativeTime(archiveRequest.at)} ago</> : null} — confirm to deactivate the ministry. Members lose access immediately.
                        </p>
                      )}
                      {archiveError && <p style={{ fontSize: "12px", color: "var(--danger)", marginTop: 8 }}>{archiveError}</p>}
                    </div>
                    {archiveRequest !== null && archiveRequest.by === userId ? (
                      /* Pending, requested by ME — no self-confirm; cancel only. */
                      <CentralButton variant="secondary" size="md" onClick={handleCancelArchiveRequest} disabled={cancelingArchive} style={{ flexShrink: 0 }}>{cancelingArchive ? "Canceling…" : "Cancel request"}</CentralButton>
                    ) : !showArchiveConfirm ? (
                      <div style={{ flexShrink: 0, display: "flex", gap: 8 }}>
                        {archiveRequest !== null && (
                          <CentralButton variant="secondary" size="md" onClick={handleCancelArchiveRequest} disabled={cancelingArchive}>{cancelingArchive ? "Canceling…" : "Cancel request"}</CentralButton>
                        )}
                        <CentralButton variant="destructive" size="md" onClick={() => setShowArchiveConfirm(true)}>{archiveRequest === null ? "Archive" : "Confirm archive"}</CentralButton>
                      </div>
                    ) : (
                      <div style={{ flexShrink: 0, display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 8 }}>
                        <p style={{ fontSize: "12px", color: "var(--muted-text)", textAlign: "right" }}>Type <strong style={{ color: "var(--ink)" }}>{ministryInfo?.name ?? ministryName}</strong> to confirm</p>
                        <input value={archiveConfirmText} onChange={e => setArchiveConfirmText(e.target.value)} placeholder="Ministry name…" style={{ padding: "8px 12px", borderRadius: 10, border: "1.5px solid var(--danger)", fontSize: 13, color: "var(--ink)", outline: "none", background: "var(--cream-panel)", width: 192, fontFamily: "inherit" }} />
                        <div style={{ display: "flex", gap: 8 }}>
                          <CentralButton variant="secondary" size="sm" onClick={() => { setShowArchiveConfirm(false); setArchiveConfirmText("") }}>Cancel</CentralButton>
                          <CentralButton variant="danger-solid" size="sm" onClick={handleArchive} disabled={archiving || archiveConfirmText !== (ministryInfo?.name ?? ministryName)}>
                            {archiveRequest === null ? (archiving ? "Requesting…" : "Request archive") : (archiving ? "Archiving…" : "Archive ministry")}
                          </CentralButton>
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
                    <FilterChip key={f} selected={peopleFilter === f} onClick={() => setPeopleFilter(f)} tone="plum">
                      {f === "all" ? "All" : f.charAt(0).toUpperCase() + f.slice(1)}
                    </FilterChip>
                  ))}
                </div>
              </div>

              {/* Remove confirm banner */}
              {peopleRemoveConfirmId && (() => {
                const target = members.find(m => m.id === peopleRemoveConfirmId)
                return (
                  <div style={{ borderRadius: 10, border: "1px solid color-mix(in srgb, var(--danger) 25%, transparent)", background: "color-mix(in srgb, var(--danger) 8%, transparent)", padding: "12px 16px", display: "flex", alignItems: "center", gap: 12 }}>
                    <AlertTriangle style={{ width: 16, height: 16, color: "var(--danger)", flexShrink: 0 }} />
                    <p style={{ fontSize: 13, color: "var(--body)", flex: 1, margin: 0 }}>Remove <strong style={{ color: "var(--ink)" }}>{target?.name}</strong> from this ministry?</p>
                    <button onClick={() => setPeopleRemoveConfirmId(null)} style={{ fontSize: 12, color: "var(--body)", background: "none", border: "none", cursor: "pointer", padding: "4px 8px" }}>Cancel</button>
                    <button onClick={async () => { setPeopleRemoving(true); await handleRemoveMember(peopleRemoveConfirmId); setPeopleRemoving(false); setPeopleRemoveConfirmId(null) }} disabled={peopleRemoving} style={{ fontSize: 12, fontWeight: 500, color: "var(--danger)", border: "1px solid var(--danger)", background: "transparent", borderRadius: 8, padding: "6px 12px", cursor: "pointer", opacity: peopleRemoving ? 0.6 : 1 }}>
                      {peopleRemoving ? "Removing…" : "Remove"}
                    </button>
                  </div>
                )
              })()}

              {/* Member list — no overflow:hidden so a row's role menu can extend past
                  the card edge without being clipped (rows have no bg / no last-row
                  border, so the rounded corners stay clean). */}
              <div style={{ border: "1px solid var(--line)", borderRadius: 14, background: "var(--cream-panel)" }}>
                {peopleFiltered.length === 0 ? (
                  <p style={{ fontSize: 13, color: "var(--muted-text)", padding: "24px", textAlign: "center" }}>{peopleSearch ? "No members match your search." : "No members found."}</p>
                ) : peopleFiltered.map((m, i) => {
                  const isMe = m.id === userId
                  const menuOpen = peopleRoleMenuOpen === m.id
                  return (
                    <div key={m.id} style={{ display: "flex", alignItems: "center", gap: 16, padding: "16px 22px", borderBottom: i < peopleFiltered.length - 1 ? "1px solid var(--line-3)" : "none", position: "relative" }}>
                      <MonogramChip initials={getInitials(m.name)} className="w-[38px] h-[38px] text-[13px] font-medium" />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                          <span style={{ fontSize: 14, fontWeight: 500, color: "var(--ink)" }}>{m.name}</span>
                          {isMe && <span style={{ fontSize: 12, color: "var(--muted-text)" }}>you</span>}
                        </div>
                        <div style={{ marginTop: 2, fontSize: 13, color: "var(--muted-text)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{m.email}</div>
                      </div>
                      {peopleChangingRole === m.id ? <span style={{ fontSize: 11, color: "var(--muted-text)" }}>Saving…</span> : roleBadge(m.role, m.id)}
                      {isAdmin && !isMe && (
                        <div style={{ position: "relative" }}>
                          {menuOpen && <div className="fixed inset-0 z-[5] md:left-[var(--shell-offset)]" onClick={() => setPeopleRoleMenuOpen(null)} />}
                          <button onClick={() => setPeopleRoleMenuOpen(menuOpen ? null : m.id)} style={{ width: 28, height: 28, borderRadius: 6, display: "flex", alignItems: "center", justifyContent: "center", background: "none", border: "none", cursor: "pointer" }}>
                            <MoreHorizontal style={{ width: 16, height: 16, color: "var(--faint)" }} />
                          </button>
                          {menuOpen && (
                            <div style={{ position: "absolute", top: 32, right: 0, zIndex: 20, background: "var(--cream-panel)", borderRadius: 12, border: "1px solid var(--line)", padding: "6px 0", minWidth: 160 }}>
                              <p style={{ fontFamily: "ui-monospace,'SF Mono',Menlo,monospace", fontSize: 10, color: "var(--muted-text)", padding: "4px 12px 6px", textTransform: "uppercase", letterSpacing: "1.2px", fontWeight: 400, margin: 0 }}>Set role</p>
                              {(["visitor", "member", "leader", "admin", "deacon", "elder", "pastor"] as const).map(r => (
                                <button key={r} onClick={() => { setPeopleRoleMenuOpen(null); if (m.role.toLowerCase() !== r) setRoleChangeConfirm({ memberId: m.id, name: m.name, currentRole: m.role, newRole: r }) }} style={{ width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between", padding: "8px 12px", fontSize: 13, background: "none", border: "none", cursor: "pointer", color: m.role.toLowerCase() === r ? "var(--plum)" : "var(--ink)", fontWeight: m.role.toLowerCase() === r ? 600 : 400, textAlign: "left", boxSizing: "border-box" }}>
                                  {r.charAt(0).toUpperCase() + r.slice(1)}
                                  {m.role.toLowerCase() === r && <Check style={{ width: 14, height: 14, color: "var(--plum)" }} />}
                                </button>
                              ))}
                              <div style={{ margin: "6px 12px", borderTop: "1px solid var(--line-3)" }} />
                              <button onClick={() => { setPeopleRemoveConfirmId(m.id); setPeopleRoleMenuOpen(null) }} style={{ width: "100%", display: "flex", alignItems: "center", gap: 8, padding: "8px 12px", fontSize: 13, color: "var(--danger)", background: "none", border: "none", cursor: "pointer", textAlign: "left", boxSizing: "border-box" }}>Remove from ministry</button>
                              <button onClick={() => { setPeopleExcomConfirmId(m.id); setPeopleRoleMenuOpen(null) }} style={{ width: "100%", display: "flex", alignItems: "center", gap: 8, padding: "8px 12px", fontSize: 13, color: "color-mix(in srgb, var(--danger) 80%, var(--ink))", background: "none", border: "none", cursor: "pointer", textAlign: "left", boxSizing: "border-box", fontWeight: 500 }}>Excommunicate</button>
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
                  <div style={{ borderRadius: 10, border: "1px solid color-mix(in srgb, var(--danger) 25%, transparent)", background: "color-mix(in srgb, var(--danger) 8%, transparent)", padding: "12px 16px", display: "flex", alignItems: "center", gap: 12 }}>
                    <AlertTriangle style={{ width: 16, height: 16, color: "var(--danger)", flexShrink: 0 }} />
                    <div style={{ flex: 1 }}>
                      <p style={{ fontSize: 13, color: "var(--body)", margin: "0 0 2px" }}>Excommunicate <strong style={{ color: "var(--ink)" }}>{target?.name}</strong>?</p>
                      <p style={{ fontSize: 12, color: "var(--danger)", margin: 0 }}>This is permanent. They will never be able to rejoin this ministry.</p>
                    </div>
                    <button onClick={() => setPeopleExcomConfirmId(null)} style={{ fontSize: 12, color: "var(--body)", background: "none", border: "none", cursor: "pointer", padding: "4px 8px" }}>Cancel</button>
                    <button onClick={() => handleExcommunicate(peopleExcomConfirmId)} disabled={excomming} style={{ fontSize: 12, fontWeight: 500, color: "var(--cream-panel)", border: "none", background: "color-mix(in srgb, var(--danger) 80%, var(--ink))", borderRadius: 8, padding: "6px 12px", cursor: "pointer", opacity: excomming ? 0.6 : 1 }}>
                      {excomming ? "Banning…" : "Excommunicate"}
                    </button>
                  </div>
                )
              })()}

              {/* Banned members */}
              {isAdmin && bannedMembers.length > 0 && (
                <div>
                  <p style={{ ...SECTION_LABEL, marginBottom: 10 }}>Excommunicated</p>
                  <div style={{ border: "1px solid color-mix(in srgb, var(--danger) 25%, transparent)", borderRadius: 14, background: "var(--cream-panel)", overflow: "hidden" }}>
                    {bannedMembers.map((b, i) => (
                      <div key={b.user_id} style={{ display: "flex", alignItems: "center", gap: 14, padding: "14px 20px", borderBottom: i < bannedMembers.length - 1 ? "1px solid color-mix(in srgb, var(--danger) 25%, transparent)" : "none" }}>
                        <MonogramChip initials={getInitials(b.name ?? "?")} className="w-9 h-9 text-[13px] font-medium" />
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
                <div style={{ borderRadius: 10, border: "1px solid color-mix(in srgb, var(--danger) 25%, transparent)", background: "color-mix(in srgb, var(--danger) 8%, transparent)", padding: "10px 14px", display: "flex", alignItems: "center", gap: 10 }}>
                  <AlertTriangle style={{ width: 15, height: 15, color: "var(--danger)", flexShrink: 0 }} />
                  <p style={{ fontSize: 13, color: "var(--body)", margin: 0 }}>{govError}</p>
                </div>
              )}

              {/* ── Governance roster ── */}
              {(() => {
                const gAllAdmins = govEditing && govDraft ? govDraft.all_admins : governanceSettings.all_admins
                const rosterIncluded = (id: string) => (govEditing && govDraft ? govDraft.roster_ids : governanceSettings.roster_ids).includes(id)
                const teamAccessOf = (team: GovTeamRow) => govEditing && govDraft ? govDraft.teamAccess[team.id] : team.admin_access
                return (
              <>
              <section>
                <div style={{ marginBottom: 20 }}>
                  <SectionHeader eyebrow="Governance" title="Who governs teams" titleSize={20} action={
                    <SectionEditControls editing={govEditing} dirty={govDirty} saving={govSaving} saved={govSaved} disabled={!isAdmin}
                      onEdit={startGovEdit} onCancel={cancelGovEdit} onSave={() => setGovConfirmOpen(true)} />
                  } />
                  <p style={{ marginTop: 8, fontSize: 14, color: "var(--body)", lineHeight: 1.55 }}>Governance is oversight of teams they aren&apos;t members of — viewing or acting on a team&apos;s roster and work. Church Settings itself stays open to every admin regardless of this list.</p>
                </div>

                <div style={{ ...CARD, padding: "20px 22px", display: "flex", alignItems: "flex-start", gap: 16 }}>
                  <button onClick={govEditing ? draftToggleAllAdmins : undefined} disabled={!govEditing} style={{ width: 38, height: 22, borderRadius: 999, border: "none", background: gAllAdmins ? "var(--plum)" : "var(--dashed)", position: "relative", flexShrink: 0, cursor: govEditing ? "pointer" : "default", padding: 0, opacity: govEditing ? 1 : 0.6 }}>
                    <span style={{ position: "absolute", width: 18, height: 18, borderRadius: 999, background: "var(--cream)", top: 2, ...(gAllAdmins ? { right: 2 } : { left: 2 }) }} />
                  </button>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 14, fontWeight: 500, color: "var(--ink)" }}>All admins can govern teams</div>
                    <div style={{ marginTop: 4, fontSize: 13, color: "var(--body)", lineHeight: 1.5 }}>{gAllAdmins ? "Every admin-tier member governs teams per the access matrix below." : "Only the people you select below govern teams."}</div>
                  </div>
                </div>

                {!gAllAdmins && (
                  <div style={{ marginTop: 16 }}>
                    <p style={{ ...SECTION_LABEL, marginBottom: 10 }}>Governing roster</p>
                    <div style={{ border: "1px solid var(--line)", borderRadius: 14, background: "var(--cream-panel)", overflow: "hidden" }}>
                      {adminMembers.length === 0 ? (
                        <p style={{ fontSize: 13, color: "var(--muted-text)", padding: "20px 22px", textAlign: "center" }}>No admin-tier members to choose from.</p>
                      ) : adminMembers.map((m, i) => {
                        const included = rosterIncluded(m.id)
                        return (
                          <div key={m.id} style={{ display: "flex", alignItems: "center", gap: 16, padding: "14px 22px", borderBottom: i < adminMembers.length - 1 ? "1px solid var(--line-3)" : "none" }}>
                            <MonogramChip initials={getInitials(m.name)} className="w-9 h-9 text-[13px] font-medium" />
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div style={{ fontSize: 14, fontWeight: 500, color: "var(--ink)" }}>{m.name}</div>
                              <div style={{ marginTop: 2, fontSize: 13, color: "var(--muted-text)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{m.email}</div>
                            </div>
                            {roleBadge(m.role, m.id)}
                            <button onClick={govEditing ? () => draftToggleRoster(m.id) : undefined} disabled={!govEditing} style={{ width: 38, height: 22, borderRadius: 999, border: "none", background: included ? "var(--plum)" : "var(--dashed)", position: "relative", flexShrink: 0, cursor: govEditing ? "pointer" : "default", padding: 0, opacity: govEditing ? 1 : 0.6 }}>
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
                      <div style={{ width: 36, height: 36, borderRadius: 10, background: "var(--ivory)", border: "1px solid var(--line-2)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                        <PlanLineIcon iconKey={teamIconKey(team)} bg="transparent" fg="var(--plum)" size={20} radius={0} />
                      </div>
                      <div style={{ flex: 1, minWidth: 0, fontSize: 14, fontWeight: 500, color: "var(--ink)" }}>{team.name}</div>
                      <div style={{ display: "inline-flex", border: "1px solid var(--line-2)", borderRadius: 999, padding: 2, background: "var(--ivory)", flexShrink: 0, opacity: govEditing ? 1 : 0.6 }}>
                        {(["none", "view", "write"] as const).map(opt => {
                          const active = teamAccessOf(team) === opt
                          return (
                            <button key={opt} onClick={govEditing ? () => draftTeamAccess(team.id, opt) : undefined} disabled={!govEditing} style={{ padding: "5px 14px", borderRadius: 999, border: "none", background: active ? "var(--plum)" : "transparent", color: active ? "var(--cream-panel)" : "var(--body)", fontSize: 12, fontWeight: active ? 500 : 400, cursor: govEditing ? "pointer" : "default", fontFamily: "var(--font-inter)" }}>
                              {opt.charAt(0).toUpperCase() + opt.slice(1)}
                            </button>
                          )
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              </section>
              </>
                )
              })()}
            </div>
          )}

          {/* ══════════════════ AUTOMATIONS TAB ══════════════════ */}
          {activeSettingsTab === "automations" && (
            <div className="px-5 md:px-14" style={{ display: "flex", flexDirection: "column", gap: 28, marginTop: 40 }}>
              <div>
                <SectionHeader eyebrow="Automations" title="Chat & membership rules" titleSize={20} action={
                  <SectionEditControls editing={automationsEditing} dirty={hasAutomationChanges} saving={savingAutomations} saved={automationsSaved} disabled={!isAdmin}
                    onEdit={startAutomationsEdit} onCancel={cancelAutomationsEdit} onSave={() => setAutomationsConfirmOpen(true)} />
                } />
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
                  const changed = automationsEditing && isToggleOn(key, pendingAutomationSettings) !== isToggleOn(key, automationSettings)
                  const locked = !automationsEditing || !isAdmin
                  return (
                    <div key={key} style={{ ...CARD, padding: 22, display: "flex", alignItems: "flex-start", gap: 16, outline: changed ? "2px solid var(--plum)" : "none", outlineOffset: -2 }}>
                      <button onClick={() => handleAutomationToggle(key)} disabled={locked} style={{ width: 38, height: 22, borderRadius: 999, border: "none", background: on ? "var(--plum)" : "var(--dashed)", position: "relative", flexShrink: 0, cursor: locked ? "default" : "pointer", padding: 0, opacity: locked ? 0.6 : 1 }}>
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
                      <div style={{ width: 38, height: 22, borderRadius: 999, background: "var(--dashed)", position: "relative", flexShrink: 0 }}>
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

              {/* Progress message during a running save (e.g. retroactive member add) */}
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

          {/* ══════════════════ CHAT TAB ══════════════════ */}
          {activeSettingsTab === "chat" && (
            <div className="px-5 md:px-14" style={{ display: "flex", flexDirection: "column", gap: 28, marginTop: 40 }}>
              <div>
                <SectionHeader eyebrow="Chat" title="Chat moderation" titleSize={20} action={
                  <SectionEditControls editing={moderationEditing} dirty={hasModerationChanges} saving={savingModeration} saved={moderationSaved} disabled={!isAdmin}
                    onEdit={startModerationEdit} onCancel={cancelModerationEdit} onSave={() => setModerationConfirmOpen(true)} />
                } />
                <p style={{ marginTop: 8, fontSize: 14, color: "var(--body)", maxWidth: 640, lineHeight: 1.55 }}>Screen messages for profanity and slurs before they send. Choose how flagged language is handled, how strict the filter is, and which chats it covers.</p>
              </div>

              {/* Enable toggle */}
              <div style={{ ...CARD, padding: 22, display: "flex", alignItems: "flex-start", gap: 16 }}>
                <button onClick={() => setModField("enabled", !pendingModerationSettings.enabled)} disabled={!moderationEditing || !isAdmin} style={{ width: 38, height: 22, borderRadius: 999, border: "none", background: pendingModerationSettings.enabled ? "var(--plum)" : "var(--dashed)", position: "relative", flexShrink: 0, cursor: (!moderationEditing || !isAdmin) ? "default" : "pointer", padding: 0, opacity: (!moderationEditing || !isAdmin) ? 0.6 : 1 }}>
                  <span style={{ position: "absolute", width: 18, height: 18, borderRadius: 999, background: "var(--cream)", top: 2, ...(pendingModerationSettings.enabled ? { right: 2 } : { left: 2 }) }} />
                </button>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 14, fontWeight: 500, color: "var(--ink)" }}>Filter message language</div>
                  <div style={{ marginTop: 6, fontSize: 13, color: "var(--body)", lineHeight: 1.55 }}>When on, messages are screened using the rules below before they send.</div>
                </div>
              </div>

              {/* Rule chips — only when enabled */}
              {pendingModerationSettings.enabled && (
                <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
                  {/* Behavior */}
                  <div>
                    <p style={{ ...SECTION_LABEL, marginBottom: 10 }}>Behavior</p>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                      {([{ v: "asterisk_first", l: "Soften (s***)" }, { v: "asterisk_all", l: "Censor (****)" }, { v: "block", l: "Block send" }] as { v: ModBehavior; l: string }[]).map((o) => (
                        <FilterChip key={o.v} tone="ivory" selected={pendingModerationSettings.behavior === o.v} disabled={!moderationEditing || !isAdmin} onClick={() => setModField("behavior", o.v)}>{o.l}</FilterChip>
                      ))}
                    </div>
                    <p style={{ marginTop: 8, fontSize: 13, color: "var(--body)", lineHeight: 1.5 }}>How flagged words are handled. Block prevents the message from sending at all.</p>
                  </div>

                  {/* Strictness */}
                  <div>
                    <p style={{ ...SECTION_LABEL, marginBottom: 10 }}>Strictness</p>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                      {([{ v: "lenient", l: "Lenient" }, { v: "moderate", l: "Moderate" }, { v: "strict", l: "Strict" }] as { v: ModStrictness; l: string }[]).map((o) => (
                        <FilterChip key={o.v} tone="ivory" selected={pendingModerationSettings.strictness === o.v} disabled={!moderationEditing || !isAdmin} onClick={() => setModField("strictness", o.v)}>{o.l}</FilterChip>
                      ))}
                    </div>
                    <p style={{ marginTop: 8, fontSize: 13, color: "var(--body)", lineHeight: 1.5 }}>Lenient flags only slurs and hate terms; Moderate adds strong profanity; Strict adds crude and borderline words.</p>
                  </div>

                  {/* Scope */}
                  <div>
                    <p style={{ ...SECTION_LABEL, marginBottom: 10 }}>Scope</p>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                      {([{ v: "all", l: "All chats" }, { v: "church", l: "Church chats" }, { v: "personal", l: "Personal chats" }, { v: "ministry", l: "Ministry chat" }] as { v: ModScope; l: string }[]).map((o) => (
                        <FilterChip key={o.v} tone="ivory" selected={pendingModerationSettings.scope === o.v} disabled={!moderationEditing || !isAdmin} onClick={() => setModField("scope", o.v)}>{o.l}</FilterChip>
                      ))}
                    </div>
                    <p style={{ marginTop: 8, fontSize: 13, color: "var(--body)", lineHeight: 1.5 }}>Which conversations the filter covers. Ministry chat = the default chat everyone&apos;s in.</p>
                  </div>
                </div>
              )}

              {/* Reverent capitalization — independent of the language filter */}
              <div style={{ ...CARD, padding: 22, display: "flex", alignItems: "flex-start", gap: 16 }}>
                <button onClick={() => setModField("reverent_caps", !pendingModerationSettings.reverent_caps)} disabled={!moderationEditing || !isAdmin} style={{ width: 38, height: 22, borderRadius: 999, border: "none", background: pendingModerationSettings.reverent_caps ? "var(--plum)" : "var(--dashed)", position: "relative", flexShrink: 0, cursor: (!moderationEditing || !isAdmin) ? "default" : "pointer", padding: 0, opacity: (!moderationEditing || !isAdmin) ? 0.6 : 1 }}>
                  <span style={{ position: "absolute", width: 18, height: 18, borderRadius: 999, background: "var(--cream)", top: 2, ...(pendingModerationSettings.reverent_caps ? { right: 2 } : { left: 2 }) }} />
                </button>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 14, fontWeight: 500, color: "var(--ink)" }}>Reverent capitalization</div>
                  <div style={{ marginTop: 6, fontSize: 13, color: "var(--body)", lineHeight: 1.55 }}>Auto-capitalizes God, Jesus, and Holy Spirit in messages.</div>
                </div>
              </div>

              {/* Coming soon — photo moderation */}
              <div>
                <p style={{ ...SECTION_LABEL, marginBottom: 12 }}>Coming soon</p>
                <div style={{ ...CARD, padding: 22, display: "flex", alignItems: "flex-start", gap: 16, background: "var(--cream-2)", opacity: 0.6, pointerEvents: "none" }}>
                  <div style={{ width: 38, height: 22, borderRadius: 999, background: "var(--dashed)", position: "relative", flexShrink: 0 }}>
                    <span style={{ position: "absolute", width: 18, height: 18, borderRadius: 999, background: "var(--cream)", top: 2, left: 2 }} />
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 14, fontWeight: 500, color: "var(--ink)", display: "flex", alignItems: "center", gap: 8 }}>
                      Inappropriate photo filter
                      <span style={{ fontSize: 10, letterSpacing: "0.8px", padding: "2px 7px", borderRadius: 999, background: "#EFEAE0", textTransform: "uppercase", fontWeight: 500, color: "var(--muted-text)" }}>Coming soon</span>
                    </div>
                    <div style={{ marginTop: 6, fontSize: 13, color: "var(--body)", lineHeight: 1.55 }}>Automatically flags explicit images.</div>
                  </div>
                </div>
              </div>

              {moderationSaveMsg && (
                <div style={{ padding: "10px 16px", borderRadius: 10, background: "var(--ivory)", border: "1px solid var(--line-2)", fontSize: 13, color: "var(--body)" }}>
                  {moderationSaveMsg}
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
                      <span style={{ flex: 1, padding: "10px 14px", borderRadius: 10, background: "var(--ivory)", border: "1px solid var(--line-2)", fontFamily: "ui-monospace, Menlo, monospace", fontSize: 16, letterSpacing: 2, color: "var(--ink)", fontWeight: 500, textAlign: "center", display: "block" }}>{inviteCode ?? "———"}</span>
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
                          <CentralButton variant="danger-solid" onClick={handleRegenerate} disabled={regenerating} style={{ padding: "5px 10px", borderRadius: 8, fontSize: 12 }}>{regenerating ? "Regenerating…" : "Yes, regenerate"}</CentralButton>
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
                        <span style={{ flex: 1, padding: "10px 14px", borderRadius: 10, background: "var(--ivory)", border: "1px solid var(--line-2)", fontFamily: "ui-monospace, Menlo, monospace", fontSize: 16, letterSpacing: 2, color: "var(--ink)", fontWeight: 500, textAlign: "center", display: "block" }}>{staffCode}</span>
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
                            <CentralButton variant="danger-solid" onClick={handleRegenerateStaff} disabled={regeneratingStaff} style={{ padding: "5px 10px", borderRadius: 8, fontSize: 12 }}>{regeneratingStaff ? "Regenerating…" : "Yes, regenerate"}</CentralButton>
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
                    <CentralButton variant="primary" onClick={openGoogleCalendar} style={{ padding: "9px 14px", borderRadius: 10, fontSize: 13, flexShrink: 0 }}>
                      <Calendar style={{ width: 13, height: 13 }} /> Add to Google Calendar
                    </CentralButton>
                  </div>
                  <p style={{ marginTop: 14, fontSize: 12, color: "var(--muted-text)", lineHeight: 1.5 }}>Clicking the button copies the URL and opens Google Calendar — paste it in the &quot;From URL&quot; field. For Apple Calendar or Outlook, use the Copy button.</p>
                </div>
              </section>

              {/* Receipt limits */}
              {isAdmin && (
                <section>
                  <div style={{ marginBottom: 20 }}>
                    <SectionHeader eyebrow="Receipt Limits" title="Per-event reimbursement caps" titleSize={20} action={!addingLimit ? <CentralButton variant="create" size="sm" onClick={() => setAddingLimit(true)} style={{ flexShrink: 0 }}>+ Add limit</CentralButton> : undefined} />
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
                                style={{ padding: "6px 12px", borderRadius: 8, border: "none", background: "var(--plum)", color: "var(--cream-on-dark)", fontSize: 12, fontWeight: 500, cursor: savingLimitEdit ? "not-allowed" : "pointer", opacity: savingLimitEdit || !editingLimitAmount ? 0.5 : 1, whiteSpace: "nowrap" }}
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
                              <button onClick={() => setConfirmDeleteLimit(l)} style={{ padding: "6px 12px", borderRadius: 8, border: "1px solid var(--line-2)", background: "transparent", color: "var(--danger)", fontSize: 12, cursor: "pointer" }}>Remove</button>
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
                          <button onClick={handleAddLimit} disabled={savingLimit || !newLimitAmount} style={{ flex: 1, padding: "7px 0", background: "var(--plum)", border: "none", borderRadius: 8, fontSize: 13, fontWeight: 500, cursor: savingLimit ? "not-allowed" : "pointer", fontFamily: "inherit", color: "var(--cream-on-dark)", opacity: savingLimit ? 0.6 : 1 }}>{savingLimit ? "Saving…" : "Add limit"}</button>
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
      <ConfirmDialog
        open={!!confirmDeleteSchool}
        title="Remove school?"
        message={confirmDeleteSchool ? `${confirmDeleteSchool.name} will be removed from this ministry.` : undefined}
        confirmLabel="Remove"
        onConfirm={() => { const s = confirmDeleteSchool; setConfirmDeleteSchool(null); if (s) handleDeleteSchool(s.id) }}
        onClose={() => setConfirmDeleteSchool(null)}
      />
      <ConfirmDialog
        open={!!confirmDeleteLimit}
        title="Remove receipt limit?"
        message="This spending limit will no longer be enforced."
        confirmLabel="Remove"
        onConfirm={() => { const l = confirmDeleteLimit; setConfirmDeleteLimit(null); if (l) handleDeleteLimit(l.id) }}
        onClose={() => setConfirmDeleteLimit(null)}
      />

      {/* ── Profile save confirm ── */}
      {profileConfirmOpen && ministryInfo && (
        <CentralModal
          onClose={() => setProfileConfirmOpen(false)}
          eyebrow="Confirm changes"
          title="Save profile changes?"
          maxWidth={440}
          footer={<ConfirmFooter onCancel={() => setProfileConfirmOpen(false)} onConfirm={confirmProfileSave} saving={savingInfo} />}
        >
          <ChangeSummary>
            {profileDraft.name.trim() !== (ministryInfo.name ?? "") && <ChangeRow label="Ministry name" from={ministryInfo.name || "—"} to={profileDraft.name.trim() || "—"} />}
            {profileDraft.university.trim() !== (ministryInfo.university ?? "") && <ChangeRow label="School" from={ministryInfo.university || "—"} to={profileDraft.university.trim() || "—"} />}
          </ChangeSummary>
        </CentralModal>
      )}

      {/* ── Discovery save confirm ── */}
      {discoveryConfirmOpen && (
        <CentralModal
          onClose={() => setDiscoveryConfirmOpen(false)}
          eyebrow="Confirm changes"
          title="Save discovery changes?"
          maxWidth={440}
          footer={<ConfirmFooter onCancel={() => setDiscoveryConfirmOpen(false)} onConfirm={confirmDiscoverySave} saving={toggling} />}
        >
          <ChangeSummary>
            <ChangeRow label="Ministry visibility" from={isPublic ? "public" : "private"} to={discoveryDraft ? "public" : "private"} />
            <p style={{ fontSize: 13, color: "var(--body)", lineHeight: 1.5, margin: 0 }}>
              {discoveryDraft ? "Your ministry will appear in Browse — anyone can find and join without an invite code." : "Your ministry will be hidden from Browse — an invite code will be required to join."}
            </p>
          </ChangeSummary>
        </CentralModal>
      )}

      {/* ── Governance save confirm ── */}
      {govConfirmOpen && govDraft && (
        <CentralModal
          onClose={() => setGovConfirmOpen(false)}
          eyebrow="Confirm changes"
          title="Save governance changes?"
          maxWidth={460}
          footer={<ConfirmFooter onCancel={() => setGovConfirmOpen(false)} onConfirm={confirmGovSave} saving={govSaving} />}
        >
          <ChangeSummary>
            {govAllAdminsChanged && (
              <ChangeRow label="Governance roster" from={governanceSettings.all_admins ? "all admins" : `curated (${governanceSettings.roster_ids.length})`} to={govDraft.all_admins ? "all admins" : `curated (${govDraft.roster_ids.length} admin${govDraft.roster_ids.length === 1 ? "" : "s"})`} />
            )}
            {!govAllAdminsChanged && govRosterChanged && (
              <ChangeRow label="Governing roster" from={`${governanceSettings.roster_ids.length} selected`} to={`${govDraft.roster_ids.length} selected`} />
            )}
            {govTeams.filter(t => govDraft.teamAccess[t.id] !== t.admin_access).map(t => (
              <ChangeRow key={t.id} label={`Admin access — ${t.name}`} from={t.admin_access} to={govDraft.teamAccess[t.id]} />
            ))}
          </ChangeSummary>
        </CentralModal>
      )}

      {/* ── Automations save confirm (archive warning folded in) ── */}
      {automationsConfirmOpen && (
        <CentralModal
          onClose={() => { if (!savingAutomations) setAutomationsConfirmOpen(false) }}
          eyebrow="Confirm changes"
          title="Save automation changes?"
          maxWidth={460}
          footer={<ConfirmFooter onCancel={() => setAutomationsConfirmOpen(false)} onConfirm={commitSaveAutomations} saving={savingAutomations} confirmLabel={automationArchiveLabels().length > 0 ? "Archive & save" : "Confirm & save"} danger={automationArchiveLabels().length > 0} />}
        >
          <ChangeSummary>
            {automationDeltas().map(d => <ChangeRow key={d.key} label={d.label} from={d.from} to={d.to} />)}
            {automationArchiveLabels().length > 0 && (
              <div style={{ display: "flex", gap: 10, alignItems: "flex-start", marginTop: 4, padding: "12px 14px", borderRadius: 10, border: "1px solid color-mix(in srgb, var(--danger) 25%, transparent)", background: "color-mix(in srgb, var(--danger) 8%, transparent)" }}>
                <AlertTriangle style={{ width: 16, height: 16, color: "var(--danger)", flexShrink: 0, marginTop: 1 }} />
                <div style={{ fontSize: 13, color: "var(--body)", lineHeight: 1.5 }}>
                  This will archive: <strong style={{ color: "var(--ink)" }}>{automationArchiveLabels().join(", ")}</strong>. Members will lose access from their active list.
                </div>
              </div>
            )}
          </ChangeSummary>
        </CentralModal>
      )}

      {/* ── Moderation save confirm ── */}
      {moderationConfirmOpen && (
        <CentralModal
          onClose={() => { if (!savingModeration) setModerationConfirmOpen(false) }}
          eyebrow="Confirm changes"
          title="Save chat moderation changes?"
          maxWidth={460}
          footer={<ConfirmFooter onCancel={() => setModerationConfirmOpen(false)} onConfirm={handleSaveModeration} saving={savingModeration} />}
        >
          <ChangeSummary>
            {moderationDeltas().map((d, i) => <ChangeRow key={i} label={d.label} from={d.from} to={d.to} />)}
          </ChangeSummary>
        </CentralModal>
      )}

      {/* ── Role change confirm (extra gravity when demoting YOURSELF) ── */}
      {roleChangeConfirm && (() => {
        // Rank: all admin-tier roles are equal (3) — a lateral admin change isn't a
        // "step down"; leaving admin-tier or dropping to member/visitor is.
        const RANK: Record<string, number> = { visitor: 0, member: 1, leader: 2, admin: 3, deacon: 3, elder: 3, pastor: 3 }
        const cur = roleChangeConfirm.currentRole.toLowerCase()
        const nw = roleChangeConfirm.newRole
        const isAdminTier = (r: string) => ["admin", "deacon", "elder", "pastor"].includes(r)
        const selfDemote = roleChangeConfirm.memberId === userId && (RANK[nw] ?? 0) < (RANK[cur] ?? 0)
        const losesAdmin = selfDemote && isAdminTier(cur) && !isAdminTier(nw)
        return (
        <CentralModal
          onClose={() => setRoleChangeConfirm(null)}
          eyebrow={selfDemote ? "Step down" : "Confirm role change"}
          title={selfDemote ? `Demote yourself to ${CAP(nw)}?` : `Change ${roleChangeConfirm.name}’s role?`}
          maxWidth={420}
          footer={<ConfirmFooter onCancel={() => setRoleChangeConfirm(null)} onConfirm={confirmRoleChange} saving={false} confirmLabel={selfDemote ? "Yes, demote myself" : "Change role"} />}
        >
          <ChangeSummary>
            <ChangeRow label={roleChangeConfirm.name} from={CAP(cur)} to={CAP(nw)} />
          </ChangeSummary>
          {selfDemote && (
            <p style={{ marginTop: 14, fontSize: 13, color: "var(--body)", lineHeight: 1.55 }}>
              You&apos;re lowering your <strong style={{ color: "var(--ink)", fontWeight: 500 }}>own</strong> role.
              {losesAdmin
                ? " You’ll immediately lose admin access — settings, member management, and governance — and only another admin can restore it."
                : " Only an admin can change it back afterward."} Make sure this is intended.
            </p>
          )}
        </CentralModal>
        )
      })()}
    </div>
  )
}

