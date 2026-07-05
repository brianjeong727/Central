"use client"

import { useState, useEffect, useRef, useCallback, useMemo, Fragment, type ReactNode } from "react"
import dynamic from "next/dynamic"
import { createPortal } from "react-dom"
import useSWR from "swr"
import {
  ChevronRight, ChevronDown, ChevronLeft, X, Check, Plus, Settings, Trash2, MapPin,
  Edit3, ArrowLeft, ArrowRight, Calendar, List, Grid3x3, Users, MoreHorizontal, Search,
  ClipboardList, Pencil,
  Shuffle, Download, GripVertical, Loader2, MessageCircle, ArrowUpRight,
  FileText, ExternalLink, CheckCircle2, Circle, Share2, AlertCircle, Eye,
  Sparkles, Layers, Bus, Clock, Star, CornerUpLeft, AlertTriangle, PlusCircle,
} from "lucide-react"
import type { Editor } from "@tiptap/core"
import { createClient } from "@/lib/supabase"
import { getCategoryBudgetAllocation } from "@/app/actions/budget-planning"
import { useNavState } from "../nav-state"
import { useSubpageCrumbs, useBreadcrumbExtra } from "../breadcrumb-context"

function currentFiscalYear(): string {
  const now = new Date()
  const y = now.getFullYear()
  return now.getMonth() >= 7 ? `${y}-${y + 1}` : `${y - 1}-${y}`
}
import { runAlgorithm, runSmallGroupAlgorithm, type PoolPerson, type GeneratedGroup, type PrevPairing, type DGLLeader, type SGGeneratedGroup } from "@/lib/group-algorithm"
import {
  generateDGLRotationAction, saveDGLRotationAction, publishDGLRotationAction,
} from "@/app/actions/generate-dgl-rotation"
import { confirmSmallGroupsAction, deleteSmallGroupAssignmentsAction } from "@/app/actions/generate-groups"
import { SLOTS, type DGLSlot, type ProposedAssignment } from "@/app/actions/dgl-constants"
import { getSemesterLabel, getSemesterWeeks, getSemesterDates, getSemesterOptions, type DGLAvailSlot } from "@/app/actions/dgl-utils"
import { createPraiseTeamChatAction, updateSmallGroupMembersAction, createTeamChatAction, createEventPlanningChatAction } from "@/app/actions/auto-chats"
import { confirmDGLRosterAction, handleRosterRenewalAction, type RosterMember, type RosterStatus } from "@/app/actions/dgl-roster"
import { finalizeBibleStudyAction, savePastorNotesAction } from "@/app/actions/bible-study"
import { elevateToLeader } from "@/app/actions/ministry"
import { Spinner, EmptyState, PlanLineIcon, PlanSectionHeader, AnimateIn, sidebarItemStyle, EYEBROW_STYLE, MONO_STYLE } from "../components/shared"
import { getInitials, formatRelativeTime } from "../utils"
import { TabPageHeader } from "@/components/central/tab-page-header"
import { PageTitle } from "@/components/central/page-title"
import { MonogramChip, PlanSubTabStrip, SubpageShell, ContentHeader, ContentActionButton, EventSectionHeader, CentralButton, IconButton, Input, Select, Textarea, SerifInput, AddInlineSelect, FormField, CentralCard, ListRow, FilterChip, CentralModal } from "@/components/central"
import { FinanceWorkspace, type FinanceSection } from "../components/finance-workspace"
import { ReceiptsWorkspace, type ReceiptsTeamRef } from "../components/receipts-workspace"
import { classifyTeam } from "../team-type"
import { WORKSPACE_PRESETS, AVAILABLE_PRESETS, ownedPresetKeys } from "../workspace-presets"
import type {
  PlanTabProps, UserTeam, Team, CalendarEvent, EventPlan, EventTask, EventRole,
  TeamRole, TeamMemberDisplay, DraftRole, RoleDescription, RoleLink, MeetingNote,
  WorshipWeek, WorshipRoleRow, PraiseTeamMember, WorshipSong, WorshipInvite, WorshipChart, AnnotationObj, Category,
  EventType, EventExtraTab, TransitionNote,
} from "../types"
import { teamAccessLevel, type TeamAccess } from "../governance"

// Rich-text / collaborative note editors are lazy-loaded so the heavy @tiptap/*
// and yjs runtime deps stay OUT of plan-tab's static module graph. They sit behind
// user interaction (opening a meeting note, editing a role description), so ssr:false
// with a light fallback is safe. See ./note-editors.
const TiptapToolbar = dynamic(
  () => import("./note-editors").then(m => m.TiptapToolbar),
  { ssr: false, loading: () => null },
)
const MeetingNoteEditor = dynamic(
  () => import("./note-editors").then(m => m.MeetingNoteEditor),
  { ssr: false, loading: () => <div style={{ padding: "20px 32px 44px" }}><Spinner /></div> },
)

const PERMISSION_LABELS: Record<string, string> = {
  can_manage_worship_set: "Manage worship set",
  can_view_worship_set: "View worship set",
  can_generate_slides: "Generate slides",
  can_create_dgs: "Create discipleship groups",
  can_view_dgs: "View discipleship groups",
  can_generate_bible_study: "Generate Bible studies",
  can_track_attendance: "Track attendance",
  can_plan_events: "Plan events",
  can_view_finances: "View finances",
  can_manage_members: "Manage members",
  can_manage_team: "Manage team",
  can_manage_schedule: "Manage schedule",
}

const ALL_PERMISSIONS = Object.keys(PERMISSION_LABELS)

const TEAM_PERMISSION_FILTERS: Record<string, string[]> = {
  praise: ["can_manage_worship_set", "can_view_worship_set", "can_generate_slides", "can_manage_schedule", "can_manage_team"],
  student_org: ["can_plan_events", "can_view_finances", "can_manage_members", "can_track_attendance", "can_manage_team"],
  small_group: ["can_create_dgs", "can_view_dgs", "can_generate_bible_study", "can_track_attendance", "can_manage_team"],
}

function getVisiblePermissions(teamName: string): string[] {
  const lower = teamName.toLowerCase()
  if (/praise|worship/.test(lower)) return TEAM_PERMISSION_FILTERS.praise
  if (/student.*org|student.*board|org.*board/.test(lower)) return TEAM_PERMISSION_FILTERS.student_org
  if (/small.*group|dgl|discipleship/.test(lower)) return TEAM_PERMISSION_FILTERS.small_group
  return ALL_PERMISSIONS
}


const WORSHIP_FEATURES = [
  { icon: "set", name: "This Week's Set", desc: "View songs, keys, and role assignments for Sunday's worship." },
  { icon: "sliders", name: "Set Builder", desc: "Build and reorder worship sets, assign keys and roles per song." },
  { icon: "sparkle", name: "Slide Generator", desc: "Auto-generate lyric slides from your worship set." },
  { icon: "calendar", name: "Team Schedule", desc: "See who's playing what role this Sunday." },
]

const DISCIPLESHIP_FEATURES = [
  { icon: "users", name: "My Group", desc: "View your small group members and contact info." },
  { icon: "book", name: "Bible Study Generator", desc: "AI-generated study guides from any passage or topic." },
  { icon: "users", name: "Attendance", desc: "Track weekly attendance for your small group." },
]

const MINISTRY_FEATURES = [
  { icon: "calendar", name: "Events", desc: "Plan and manage upcoming ministry events." },
  { icon: "chart", name: "Attendance Overview", desc: "Ministry-wide attendance trends and insights." },
  { icon: "seedling", name: "New folks", desc: "Track new visitors and their journey to membership." },
  { icon: "dollar", name: "Finances", desc: "Budget tracking and expense reporting for your ministry." },
]

export function PlanFeatureCard({ icon, name, desc }: { icon: string; name: string; desc: string }) {
  return (
    <div className="bg-[var(--cream)] rounded-2xl border border-[var(--line)] p-4 opacity-70">
      <div className="flex items-start gap-3">
        <PlanLineIcon iconKey={icon} bg="var(--cream)" fg="var(--plum)" />
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2">
            <p className="text-[14px] font-semibold text-[var(--ink)]">{name}</p>
            <span className="text-[10px] font-medium text-[var(--muted-text)] bg-[#F0EDE8] px-2 py-0.5 rounded-full whitespace-nowrap flex-shrink-0 mt-0.5">
              Soon
            </span>
          </div>
          <p className="text-[13px] text-[var(--body)] mt-0.5 leading-relaxed">{desc}</p>
        </div>
      </div>
    </div>
  )
}

// Shared field styling for the Resources edit forms (§4.4 inputs).
const RESOURCE_LABEL_STYLE: React.CSSProperties = {
  ...EYEBROW_STYLE,
  fontSize: 10,
  letterSpacing: "0.09em",
  display: "block",
  marginBottom: 6,
}
// Inline add/edit form for a relevant link. Rendered inside a plum-bordered card
// by the parent. Label + URL sit in a 2-col grid; Description spans below.
export function LinkForm({
  form,
  setForm,
  onSave,
  onCancel,
  saving,
  isNew,
}: {
  form: { title: string; description: string; url: string }
  setForm: (f: { title: string; description: string; url: string }) => void
  onSave: () => void
  onCancel: () => void
  saving: boolean
  isNew: boolean
}) {
  return (
    <div>
      <div className="grid grid-cols-2 gap-3.5">
        <div>
          <label style={RESOURCE_LABEL_STYLE}>Label</label>
          <Input
            value={form.title}
            onChange={e => setForm({ ...form, title: e.target.value })}
            placeholder="e.g. Room booking"
          />
        </div>
        <div>
          <label style={RESOURCE_LABEL_STYLE}>URL</label>
          <Input
            value={form.url}
            onChange={e => setForm({ ...form, url: e.target.value })}
            placeholder="https://…"
            type="url"
          />
        </div>
      </div>
      <div style={{ marginTop: 12 }}>
        <label style={RESOURCE_LABEL_STYLE}>Description (optional)</label>
        <Input
          value={form.description}
          onChange={e => setForm({ ...form, description: e.target.value })}
          placeholder="What it's for"
        />
      </div>
      <div className="flex gap-3 items-center" style={{ marginTop: 16 }}>
        <CentralButton
          variant="primary"
          size="sm"
          onClick={onSave}
          disabled={saving || !form.title.trim() || !form.url.trim()}
        >
          <Check className="w-3.5 h-3.5" />
          {saving ? "Saving…" : isNew ? "Add link" : "Save"}
        </CentralButton>
        <CentralButton variant="secondary" size="sm" onClick={onCancel}>
          Cancel
        </CentralButton>
      </div>
    </div>
  )
}

// Parse a display domain from a URL: strip protocol + www, keep host only.
function linkDomain(url: string): string {
  return (url || "").replace(/^https?:\/\//, "").replace(/^www\./, "").split("/")[0]
}
// Derive favicon-style initials from a link label (first letters of up to two words).
function linkInitials(label: string): string {
  const words = (label || "").trim().split(/\s+/).filter(Boolean)
  if (words.length === 0) return "•"
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase()
  return (words[0][0] + words[1][0]).toUpperCase()
}

export function StudentOrgRoleTabContent({
  teamId,
  roleName,
  userId,
  canWrite,
}: {
  teamId: string | null
  roleName: string
  userId: string
  canWrite: boolean
}) {
  const supabase = createClient()

  const [description, setDescription] = useState<RoleDescription | null>(null)
  const [editingDesc, setEditingDesc] = useState(false)
  const [summaryDraft, setSummaryDraft] = useState("")
  const [respDraft, setRespDraft] = useState<string[]>([])
  const [savingDesc, setSavingDesc] = useState(false)
  const [descError, setDescError] = useState<string | null>(null)

  const [links, setLinks] = useState<RoleLink[]>([])
  const [addingLink, setAddingLink] = useState(false)
  const [editingLinkId, setEditingLinkId] = useState<string | null>(null)
  const [linkForm, setLinkForm] = useState({ title: "", description: "", url: "" })
  const [savingLink, setSavingLink] = useState(false)
  const [linkError, setLinkError] = useState<string | null>(null)

  const loadContent = useCallback(async () => {
    if (!teamId) return
    const [{ data: desc }, { data: linkRows }] = await Promise.all([
      supabase.from("team_role_descriptions").select("*").eq("team_id", teamId).eq("role_name", roleName).maybeSingle(),
      supabase.from("team_role_links").select("*").eq("team_id", teamId).eq("role_name", roleName).order("created_at", { ascending: true }),
    ])
    setDescription((desc as RoleDescription | null) ?? null)
    setLinks((linkRows ?? []) as RoleLink[])
  }, [teamId, roleName])

  // Role content is hydrated from Supabase when the selected role changes.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { loadContent() }, [loadContent])

  // ── Derived: the new summary/responsibilities vs. the legacy HTML description ──
  const summaryText = description?.summary?.trim() ?? ""
  const responsibilities = Array.isArray(description?.responsibilities) ? description!.responsibilities.filter(r => r && r.trim()) : []
  const hasNewContent = summaryText.length > 0 || responsibilities.length > 0
  const legacyHtml = description?.description?.trim() ? description.description : null
  const showLegacy = !hasNewContent && !!legacyHtml

  function startEditDesc() {
    setDescError(null)
    setSummaryDraft(description?.summary ?? "")
    setRespDraft(responsibilities.length > 0 ? [...responsibilities] : [""])
    setEditingDesc(true)
  }

  async function saveDescription() {
    if (!teamId) return
    setSavingDesc(true)
    setDescError(null)
    const now = new Date().toISOString()
    const cleanResp = respDraft.map(r => r.trim()).filter(Boolean)
    const summary = summaryDraft.trim()
    const { error } = description
      ? await supabase.from("team_role_descriptions")
          .update({ summary, responsibilities: cleanResp, updated_by: userId, updated_at: now })
          .eq("id", description.id).eq("team_id", teamId)
      : await supabase.from("team_role_descriptions")
          .insert({ team_id: teamId, role_name: roleName, summary, responsibilities: cleanResp, created_by: userId, updated_by: userId, updated_at: now })
    setSavingDesc(false)
    if (error) { setDescError("Couldn't save — you may not have permission to edit this role."); return }
    setEditingDesc(false)
    loadContent()
  }

  async function saveLink() {
    if (!teamId) return
    setSavingLink(true)
    setLinkError(null)
    const now = new Date().toISOString()
    const { error } = editingLinkId
      ? await supabase.from("team_role_links")
          .update({ title: linkForm.title.trim(), description: linkForm.description.trim(), url: linkForm.url.trim(), updated_by: userId, updated_at: now })
          .eq("id", editingLinkId).eq("team_id", teamId)
      : await supabase.from("team_role_links")
          .insert({ team_id: teamId, role_name: roleName, title: linkForm.title.trim(), description: linkForm.description.trim(), url: linkForm.url.trim(), created_by: userId, updated_by: userId, updated_at: now })
    setSavingLink(false)
    if (error) { setLinkError("Couldn't save link — you may not have permission to edit this role."); return }
    setAddingLink(false)
    setEditingLinkId(null)
    setLinkForm({ title: "", description: "", url: "" })
    loadContent()
  }

  async function deleteLink(id: string) {
    setLinkError(null)
    const prev = links
    setLinks(cur => cur.filter(l => l.id !== id))
    const { error } = await supabase.from("team_role_links").delete().eq("id", id).eq("team_id", teamId ?? "")
    if (error) { setLinks(prev); setLinkError("Couldn't delete link — you may not have permission.") }
  }

  function startEditLink(link: RoleLink) {
    setLinkError(null)
    setLinkForm({ title: link.title, description: link.description, url: link.url })
    setEditingLinkId(link.id)
    setAddingLink(false)
  }

  function cancelLink() {
    setAddingLink(false)
    setEditingLinkId(null)
    setLinkForm({ title: "", description: "", url: "" })
  }

  const sectionHeaderStyle: React.CSSProperties = { ...EYEBROW_STYLE, fontSize: 11, letterSpacing: "0.12em" }
  const respEyebrow: React.CSSProperties = { ...EYEBROW_STYLE, fontSize: 11, letterSpacing: "0.1em", color: "var(--muted-text)", margin: "18px 0 10px" }

  return (
    <div>
      {/* ── Role description ── */}
      <div style={{ marginBottom: 38 }}>
        <div className="flex items-center justify-between" style={{ marginBottom: 14 }}>
          <span style={sectionHeaderStyle}>Role description</span>
          {canWrite && !editingDesc && (
            <CentralButton variant="quiet" size="sm" onClick={startEditDesc}>
              <Edit3 className="w-3.5 h-3.5" />
              Edit
            </CentralButton>
          )}
        </div>

        {editingDesc ? (
          <div style={{ border: "1px solid var(--plum)", borderRadius: "var(--r-callout)", padding: "20px 22px", background: "var(--cream)" }}>
            <label style={RESOURCE_LABEL_STYLE}>Summary</label>
            <Textarea
              value={summaryDraft}
              onChange={e => setSummaryDraft(e.target.value)}
              placeholder={`Describe the ${roleName} role…`}
              style={{ minHeight: 70 }}
            />

            <div style={respEyebrow}>Responsibilities</div>
            <div className="flex flex-col gap-2">
              {respDraft.map((r, i) => (
                <div key={i} className="flex items-center gap-2.5">
                  <span style={{ color: "var(--dashed)", flexShrink: 0, display: "grid", placeItems: "center", cursor: "grab" }} aria-hidden>
                    <GripVertical className="w-3.5 h-3.5" />
                  </span>
                  <Input
                    value={r}
                    onChange={e => setRespDraft(d => d.map((v, idx) => idx === i ? e.target.value : v))}
                    placeholder="A responsibility…"
                    style={{ flex: 1 }}
                  />
                  <IconButton dim={26} onClick={() => setRespDraft(d => d.filter((_, idx) => idx !== i))} title="Remove" className="resource-remove-btn">
                    <X className="w-3.5 h-3.5" />
                  </IconButton>
                </div>
              ))}
            </div>
            <CentralButton variant="quiet" size="sm" onClick={() => setRespDraft(d => [...d, ""])} style={{ marginTop: 10 }}>
              <Plus className="w-3.5 h-3.5" />
              Add responsibility
            </CentralButton>

            {descError && (
              <p style={{ ...EYEBROW_STYLE, fontSize: 11, letterSpacing: "0.04em", textTransform: "none", color: "var(--danger)", margin: "14px 0 0" }}>{descError}</p>
            )}
            <div className="flex gap-3 items-center" style={{ marginTop: 18 }}>
              <CentralButton variant="primary" size="sm" onClick={saveDescription} disabled={savingDesc}>
                <Check className="w-3.5 h-3.5" />
                {savingDesc ? "Saving…" : "Save"}
              </CentralButton>
              <CentralButton variant="secondary" size="sm" onClick={() => setEditingDesc(false)}>Cancel</CentralButton>
            </div>
          </div>
        ) : (
          <CentralCard variant="standard" radius="var(--r-callout)" padding="22px 22px">
            {hasNewContent ? (
              <>
                {summaryText && (
                  <p style={{ fontFamily: "var(--sans)", fontSize: 15, fontWeight: 400, color: "var(--ink)", lineHeight: 1.55, margin: 0 }}>
                    {summaryText}
                  </p>
                )}
                {responsibilities.length > 0 && (
                  <>
                    <div style={{ ...respEyebrow, marginTop: summaryText ? 18 : 0 }}>Responsibilities</div>
                    <ul style={{ margin: 0, padding: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: 9 }}>
                      {responsibilities.map((t, i) => (
                        <li key={i} style={{ fontFamily: "var(--sans)", fontSize: 14, color: "var(--body)", lineHeight: 1.45, paddingLeft: 18, position: "relative" }}>
                          <span style={{ position: "absolute", left: 0, top: 7, width: 5, height: 5, borderRadius: "50%", background: "var(--dashed)" }} />
                          {t}
                        </li>
                      ))}
                    </ul>
                  </>
                )}
              </>
            ) : showLegacy ? (
              <>
                <div className="role-desc-view" dangerouslySetInnerHTML={{ __html: legacyHtml! }} />
                {canWrite && (
                  <p style={{ ...EYEBROW_STYLE, fontSize: 10, letterSpacing: "0.06em", color: "var(--faint)", margin: "14px 0 0" }}>
                    Legacy description — edit to migrate
                  </p>
                )}
              </>
            ) : (
              <p style={{ fontFamily: "var(--sans)", fontSize: 14, color: "var(--muted-text)", margin: 0 }}>
                {canWrite ? "No description yet. Click Edit to add one." : "No description yet."}
              </p>
            )}
          </CentralCard>
        )}
      </div>

      {/* ── Relevant links ── */}
      <div>
        <div className="flex items-center justify-between" style={{ marginBottom: 14 }}>
          <span style={sectionHeaderStyle}>Relevant links</span>
          {canWrite && !addingLink && editingLinkId === null && (
            <CentralButton
              variant="quiet"
              size="sm"
              onClick={() => { setLinkError(null); setLinkForm({ title: "", description: "", url: "" }); setEditingLinkId(null); setAddingLink(true) }}
            >
              <Plus className="w-3.5 h-3.5" />
              Add link
            </CentralButton>
          )}
        </div>

        {linkError && (
          <p style={{ ...EYEBROW_STYLE, fontSize: 11, letterSpacing: "0.04em", textTransform: "none", color: "var(--danger)", margin: "0 0 10px" }}>{linkError}</p>
        )}

        {addingLink && (
          <div style={{ border: "1px solid var(--plum)", borderRadius: "var(--r-card)", padding: "16px 18px", background: "var(--cream)", marginBottom: 10 }}>
            <LinkForm form={linkForm} setForm={setLinkForm} onSave={saveLink} onCancel={cancelLink} saving={savingLink} isNew />
          </div>
        )}

        {links.length === 0 && !addingLink ? (
          <div style={{ border: "1px solid var(--line-2)", borderRadius: "var(--r-card)", background: "var(--cream)", textAlign: "center", padding: "28px 20px" }}>
            <p style={{ fontFamily: "var(--sans)", fontSize: 14, color: "var(--muted-text)", margin: 0 }}>
              {canWrite ? "No links yet. Add one to get started." : "No links yet."}
            </p>
          </div>
        ) : (
          <div className="flex flex-col gap-2.5">
            {links.map(link =>
              editingLinkId === link.id ? (
                <div key={link.id} style={{ border: "1px solid var(--plum)", borderRadius: "var(--r-card)", padding: "16px 18px", background: "var(--cream)" }}>
                  <LinkForm form={linkForm} setForm={setLinkForm} onSave={saveLink} onCancel={cancelLink} saving={savingLink} isNew={false} />
                </div>
              ) : (
                <div
                  key={link.id}
                  className="group flex items-center gap-3.5 border border-[var(--line-2)] rounded-[var(--r-card)] bg-[var(--cream)] hover:border-[var(--dashed)] transition-colors"
                  style={{ padding: "14px 16px" }}
                >
                  {/* Favicon badge — initials from the label */}
                  <span
                    style={{ width: 36, height: 36, borderRadius: "var(--r-input)", background: "var(--ivory)", display: "grid", placeItems: "center", fontFamily: "var(--sans)", fontWeight: 600, fontSize: 13, color: "var(--body)", flexShrink: 0 }}
                    aria-hidden
                  >
                    {linkInitials(link.title)}
                  </span>

                  <a href={link.url} target="_blank" rel="noopener noreferrer" className="flex-1 min-w-0 block">
                    <span style={{ display: "block", fontFamily: "var(--sans)", fontSize: 15, fontWeight: 500, color: "var(--ink)", letterSpacing: "-0.01em", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {link.title}
                    </span>
                    {link.description && (
                      <span style={{ display: "block", fontFamily: "var(--sans)", fontSize: 12.5, color: "var(--body)", marginTop: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {link.description}
                      </span>
                    )}
                  </a>

                  <span style={{ fontFamily: "var(--mono)", fontSize: 11, letterSpacing: "0.02em", color: "var(--muted-text)", whiteSpace: "nowrap", flexShrink: 0 }} className="hidden sm:block">
                    {linkDomain(link.url)}
                  </span>

                  {canWrite && (
                    <div className="flex items-center gap-1 flex-shrink-0 opacity-100 md:opacity-0 md:group-hover:opacity-100 transition-opacity">
                      <IconButton dim={26} onClick={() => startEditLink(link)} title="Edit link">
                        <Edit3 className="w-3.5 h-3.5" />
                      </IconButton>
                      <IconButton dim={26} onClick={() => deleteLink(link.id)} title="Delete link" className="resource-remove-btn">
                        <Trash2 className="w-3.5 h-3.5" />
                      </IconButton>
                    </div>
                  )}

                  <ArrowUpRight className="w-3.5 h-3.5 flex-shrink-0" style={{ color: "var(--faint)" }} />
                </div>
              )
            )}
          </div>
        )}
      </div>
    </div>
  )
}

// Dedicated full-width note page. The Tiptap + Yjs collaborative editor
// (MeetingNoteEditor + useNoteCollab + presence + autosave) is reused unchanged —
// only its container moved from an expanded accordion card to this standalone page.
export function MeetingNoteDetail({
  note,
  userId,
  userName,
  onBack,
  onSaveTitle,
  onSaveBody,
  canWrite = true,
}: {
  note: MeetingNote
  userId: string
  userName: string
  onBack: () => void
  onSaveTitle: (id: string, title: string) => Promise<void>
  onSaveBody: (id: string, body: string) => Promise<void>
  canWrite?: boolean
}) {
  const supabase = createClient()
  const [localTitle, setLocalTitle] = useState(note.title)
  const titleSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { setLocalTitle(note.title) }, [note.id, note.title])
  const [noteEditor, setNoteEditor] = useState<Editor | null>(null)

  // Listen for remote title changes (live co-edit of the title via the collab channel).
  useEffect(() => {
    const handler = (e: Event) => {
      const { title } = (e as CustomEvent).detail
      setLocalTitle(title)
    }
    window.addEventListener(`note-title-${note.id}`, handler)
    return () => window.removeEventListener(`note-title-${note.id}`, handler)
  }, [note.id])

  // Broadcast title edits over the same meeting-note channel the collab hook uses.
  function broadcastTitle(title: string) {
    const ch = supabase.channel(`meeting-note-${note.id}`)
    ch.send({ type: "broadcast", event: "title", payload: { title, userId } }).catch(() => {})
  }

  const noteDateLabel = (() => {
    const d = new Date(note.date + "T12:00:00")
    return d.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })
  })()

  return (
    <SubpageShell crumbs={[{ label: "Meeting Notes", onClick: onBack }, { label: note.title || "Untitled" }]} width="full">
      <div style={{ background: "var(--cream)", borderRadius: 16, border: "1px solid var(--line)", overflow: "hidden" }}>
        {/* Date strip — inset tone to sit above the cream editor body */}
        <div
          style={{
            padding: "11px 20px",
            display: "flex",
            alignItems: "center",
            borderBottom: "1px solid var(--line-3)",
            background: "var(--cream-2)",
          }}
        >
          <span style={MONO_STYLE}>
            {noteDateLabel}
          </span>
        </div>

        {canWrite && <TiptapToolbar editor={noteEditor} />}

        {/* Document body */}
        <div style={{ padding: "28px 32px 0" }}>
          <SerifInput
            fontSize={26}
            underline={false}
            value={localTitle}
            readOnly={!canWrite}
            onChange={e => {
              if (!canWrite) return
              setLocalTitle(e.target.value)
              if (titleSaveTimer.current) clearTimeout(titleSaveTimer.current)
              titleSaveTimer.current = setTimeout(() => {
                broadcastTitle(e.target.value)
                onSaveTitle(note.id, e.target.value)
              }, 400)
            }}
            placeholder="Untitled"
            style={{
              fontWeight: 400,
              letterSpacing: "-0.02em",
              lineHeight: 1.2,
              padding: 0,
              display: "block",
            }}
          />
          <div style={{ height: 1, background: "var(--line-3)", margin: "18px 0 0" }} />
        </div>
        <MeetingNoteEditor
          key={note.id}
          noteId={note.id}
          userId={userId}
          userName={userName}
          initialContent={note.body}
          onSave={(html) => onSaveBody(note.id, html)}
          onEditorReady={setNoteEditor}
          canWrite={canWrite}
        />
      </div>
    </SubpageShell>
  )
}

// Pure SWR fetcher for the meeting-notes LIST (key: ["meeting-notes", teamId]).
async function fetchMeetingNotes([, teamId]: readonly [string, string]) {
  const supabase = createClient()
  const { data } = await supabase
    .from("meeting_notes")
    .select("*")
    .eq("team_id", teamId)
    .order("created_at", { ascending: false })
  return (data ?? []) as MeetingNote[]
}

export function MeetingNotesSection({
  teamId,
  userId,
  userName,
  canWrite,
  startNewTrigger,
  openNoteId,
  onOpenNote,
}: {
  teamId: string | null
  userId: string
  userName: string
  canWrite: boolean
  startNewTrigger?: number
  openNoteId: string | null
  onOpenNote: (id: string | null) => void
}) {
  const supabase = createClient()
  const { data: notesData, isLoading: loading, mutate: mutateNotes } = useSWR(
    teamId ? (["meeting-notes", teamId] as const) : null,
    fetchMeetingNotes,
    { keepPreviousData: false },
  )
  const notes = useMemo(() => notesData ?? [], [notesData])
  const [creating, setCreating] = useState(false)

  // Resolve "last edited by" names: fetch profile names for every author referenced
  // by the notes (updated_by preferred, created_by fallback).
  const [names, setNames] = useState<Record<string, string>>({})
  useEffect(() => {
    const ids = Array.from(new Set(notes.flatMap(n => [n.updated_by, n.created_by].filter(Boolean) as string[])))
    if (ids.length === 0) return
    supabase.from("profiles").select("id, name").in("id", ids).then(({ data }) => {
      const map: Record<string, string> = {}
      for (const p of (data ?? []) as { id: string; name: string }[]) map[p.id] = p.name
      setNames(map)
    })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [notes])

  useEffect(() => {
    if (startNewTrigger) createNote()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [startNewTrigger])

  async function createNote() {
    if (!teamId || creating) return
    setCreating(true)
    // Derive the next note_number server-side to avoid the stale-client-state race
    // (two rapid creates collided on notes.length + 1).
    const { data: lastRow } = await supabase
      .from("meeting_notes")
      .select("note_number")
      .eq("team_id", teamId)
      .order("note_number", { ascending: false })
      .limit(1)
      .maybeSingle()
    const noteNumber = ((lastRow?.note_number as number | undefined) ?? 0) + 1
    const today = new Date()
    const dateStr = today.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })
    const title = `Meeting ${noteNumber} — ${dateStr}`
    const dateIso = today.toISOString().split("T")[0]
    const { data, error } = await supabase
      .from("meeting_notes")
      .insert({ team_id: teamId, note_number: noteNumber, date: dateIso, title, body: "", created_by: userId })
      .select()
      .single()
    setCreating(false)
    if (!error && data) {
      const newNote = data as MeetingNote
      void mutateNotes(prev => [newNote, ...(prev ?? [])], { revalidate: false })
      onOpenNote(newNote.id)
    }
  }

  async function saveTitle(id: string, title: string) {
    const now = new Date().toISOString()
    // Optimistic first (Convention #4): the list metadata updates immediately.
    void mutateNotes(prev => (prev ?? []).map(n => n.id === id ? { ...n, title, updated_by: userId, updated_at: now } : n), { revalidate: false })
    const { error } = await supabase.from("meeting_notes").update({ title, updated_by: userId, updated_at: now }).eq("id", id)
    if (error) void mutateNotes() // revert to server truth on failure
  }

  async function saveBody(id: string, body: string) {
    const now = new Date().toISOString()
    void mutateNotes(prev => (prev ?? []).map(n => n.id === id ? { ...n, body, updated_by: userId, updated_at: now } : n), { revalidate: false })
    const { error } = await supabase.from("meeting_notes").update({ body, updated_by: userId, updated_at: now }).eq("id", id)
    if (error) void mutateNotes()
  }

  // Detail view — dedicated full-width note page.
  const openNote = openNoteId ? notes.find(n => n.id === openNoteId) ?? null : null
  if (openNoteId && openNote) {
    return (
      <MeetingNoteDetail
        note={openNote}
        userId={userId}
        userName={userName}
        onBack={() => onOpenNote(null)}
        onSaveTitle={saveTitle}
        onSaveBody={saveBody}
        canWrite={canWrite}
      />
    )
  }

  // List view.
  return (
    <div>
      {loading ? (
        <div style={{ textAlign: "center", padding: "32px 0", color: "var(--muted-text)", fontSize: 13 }}>Loading…</div>
      ) : notes.length === 0 ? (
        <div style={{ borderLeft: "1px solid var(--line)", paddingLeft: 24, paddingTop: 4, paddingBottom: 4 }}>
          <p style={{ fontFamily: "var(--font-instrument-serif)", fontStyle: "italic", fontSize: 15, color: "var(--faint)", margin: 0 }}>
            {canWrite ? "No notes yet — start a new one." : "No notes have been created yet."}
          </p>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {notes.map(note => {
            const noteDateLabel = (() => {
              const d = new Date(note.date + "T12:00:00")
              return d.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })
            })()
            const editorId = note.updated_by ?? note.created_by
            const editorName = names[editorId] ?? "Someone"
            const editedAt = note.updated_at ?? note.created_at
            return (
              <button
                key={note.id}
                type="button"
                onClick={() => onOpenNote(note.id)}
                aria-label={`View ${note.title || "note"}`}
                className="hover:border-[var(--plum)] transition-colors"
                style={{
                  width: "100%",
                  textAlign: "left",
                  background: "var(--cream)",
                  borderRadius: "var(--r-card)",
                  border: "1px solid var(--line)",
                  padding: "13px 18px",
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: 12,
                }}
              >
                <div style={{ minWidth: 0, flex: 1 }}>
                  <p style={{ fontFamily: "var(--font-instrument-serif)", fontSize: 15, fontWeight: 400, color: "var(--ink)", margin: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {note.title || "(Untitled)"}
                  </p>
                  <p style={{ fontSize: 12, color: "var(--muted-text)", margin: "2px 0 0" }}>{noteDateLabel}</p>
                  <p style={{ fontSize: 11, color: "var(--faint)", margin: "3px 0 0" }}>
                    Last edited by {editorName} · {formatRelativeTime(editedAt)}
                  </p>
                </div>
                <ChevronRight size={14} aria-hidden style={{ color: "var(--faint)", flexShrink: 0 }} />
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}

// Stable empty Set reference so derived `plannedIds` keeps referential identity across renders.
const EMPTY_ID_SET: Set<string> = new Set()

// Shared, PURE SWR fetcher for calendar events + which events already have a plan.
// Key: ["calendar-events", ministryId, teamId ?? "all"] — StudentOrgTeamHome and
// MinistryCalendar share this key so the module cache dedupes them. Returns the
// events, the planned-event id Set (drives the "has plan" badge — must NOT be a
// fetcher side-effect), and tableReady (legacy "table missing" guard).
// NOTE: returns the BROADER set including sub-events (matches MinistryCalendar's
// original behavior). StudentOrgTeamHome locally filters out sub-events
// (parent_event_id != null) to preserve its original exclude-sub-events behavior.
async function fetchCalendarEventsAndPlans([, ministryId, teamScope]: readonly [string, string, string]) {
  const supabase = createClient()
  let query = supabase
    .from("calendar_events")
    .select("id, title, description, location, start_date, end_date, all_day, category, event_type, parent_event_id, linked_announcement_id, status, created_by")
    .eq("ministry_id", ministryId)
    .order("start_date", { ascending: true })
  if (teamScope !== "all") {
    query = query.or(`team_id.eq.${teamScope},team_id.is.null`)
  }
  const { data, error } = await query
  const tableReady = !(error && error.message.includes("Could not find the table"))
  const events = (tableReady ? (data ?? []) : []) as CalendarEvent[]

  const { data: plans } = await supabase
    .from("event_plans")
    .select("calendar_event_id")
    .eq("ministry_id", ministryId)
  const plannedIds = new Set((plans ?? []).map((p: { calendar_event_id: string }) => p.calendar_event_id))

  return { events, plannedIds, tableReady }
}

// ── Events agenda helpers ──────────────────────────────────────────────────────
// Whole-day difference between two dates (calendar days, sign-preserving).
function daysUntil(start: Date, now: Date): number {
  const s = new Date(start.getFullYear(), start.getMonth(), start.getDate())
  const n = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  return Math.round((s.getTime() - n.getTime()) / 86400000)
}
// Humanised countdown for a future event; null for past events (caller shows no pill).
function countdownLabel(start: Date, now: Date): { label: string; soon: boolean } | null {
  const days = daysUntil(start, now)
  if (days < 0) return null
  let label: string
  if (days === 0) label = "Today"
  else if (days === 1) label = "Tomorrow"
  else if (days < 30) label = `in ${days} days`
  else { const m = Math.round(days / 30); label = `in ${m} month${m === 1 ? "" : "s"}` }
  return { label, soon: days <= 7 }
}
// Humanised "Ended · …" label for a past event (day/week/month granularity).
function endedAgoLabel(start: Date, now: Date): string {
  const days = -daysUntil(start, now) // positive = days in the past
  if (days <= 0) return "Ended · today"
  if (days === 1) return "Ended · yesterday"
  if (days < 7) return `Ended · ${days} days ago`
  if (days < 14) return "Ended · last week"
  if (days < 30) { const w = Math.round(days / 7); return `Ended · ${w} weeks ago` }
  if (days < 60) return "Ended · last month"
  const m = Math.round(days / 30)
  return `Ended · ${m} months ago`
}

// ── EventsAgendaList ───────────────────────────────────────────────────────────
// Agenda/timeline view for a team's Events section (redesign per cdesign handoff).
// Groups top-level events by month with a spine + node rail; the earliest upcoming
// event is emphasised as an "up next" callout with an optional sub-events disclosure.
function EventsAgendaList({
  events, allEvents, onOpenEvent, canEdit, onDelete, deleteConfirmId, setDeleteConfirmId, deleting, plannedIds,
}: {
  events: CalendarEvent[]
  allEvents: CalendarEvent[]
  onOpenEvent: (ev: CalendarEvent) => void
  canEdit: boolean
  onDelete: (id: string) => void
  deleteConfirmId: string | null
  setDeleteConfirmId: (id: string | null) => void
  deleting: boolean
  plannedIds: Set<string>
}) {
  const now = useMemo(() => new Date(), [])
  const [hoveredId, setHoveredId] = useState<string | null>(null)
  // null = user hasn't toggled anything → fall back to the derived default (up-next open).
  const [openSubs, setOpenSubs] = useState<Set<string> | null>(null)
  // null = user hasn't toggled → derived default (collapsed unless there are no upcoming events).
  const [showPastOverride, setShowPastOverride] = useState<boolean | null>(null)
  const [pastBarHover, setPastBarHover] = useState(false)

  const sorted = useMemo(
    () => [...events].sort((a, b) => new Date(a.start_date).getTime() - new Date(b.start_date).getTime()),
    [events],
  )
  // Split by the same "today" cutoff countdownLabel uses: on/after today = upcoming.
  const upcoming = useMemo(() => sorted.filter(e => daysUntil(new Date(e.start_date), now) >= 0), [sorted, now])
  const past = useMemo(() => sorted.filter(e => daysUntil(new Date(e.start_date), now) < 0), [sorted, now])
  const upNextId = upcoming[0]?.id ?? null
  const showPast = showPastOverride ?? (upcoming.length === 0)
  const childrenByParent = useMemo(() => {
    const m = new Map<string, CalendarEvent[]>()
    for (const e of allEvents) {
      if (!e.parent_event_id) continue
      const arr = m.get(e.parent_event_id) ?? []
      arr.push(e); m.set(e.parent_event_id, arr)
    }
    for (const arr of m.values()) arr.sort((a, b) => new Date(a.start_date).getTime() - new Date(b.start_date).getTime())
    return m
  }, [allEvents])

  // Derived open set: until the user toggles, the up-next event's panel defaults open.
  const effectiveOpenSubs = openSubs ?? new Set<string>(upNextId ? [upNextId] : [])

  function toggleSubs(id: string) {
    setOpenSubs(prev => {
      const base = prev ?? new Set<string>(upNextId ? [upNextId] : [])
      const next = new Set(base)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  if (events.length === 0) {
    return (
      <div style={{ borderLeft: "2px solid var(--line)", paddingLeft: 20 }}>
        <p style={{ fontFamily: "var(--serif)", fontStyle: "italic", fontSize: 15, color: "var(--faint)" }}>
          No events yet. Click &ldquo;New Event&rdquo; to get started.
        </p>
      </div>
    )
  }

  const monoBase: React.CSSProperties = { fontFamily: "var(--mono)", textTransform: "uppercase" }
  const dot = <span style={{ width: 3, height: 3, borderRadius: "50%", background: "var(--faint)", flexShrink: 0 }} />

  // Shared bits reused by both the upcoming and past lists.
  const renderPlannedCheck = (isPlanned: boolean) => isPlanned ? (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="var(--faint)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
      <polyline points="20 6 9 17 4 12" />
    </svg>
  ) : null
  const renderDeleteBtn = (evId: string, isHovered: boolean) => canEdit ? (
    <button
      onClick={e => { e.stopPropagation(); setDeleteConfirmId(evId) }}
      style={{ background: "none", border: "none", cursor: "pointer", padding: "4px 6px", color: "var(--muted-text)", flexShrink: 0, display: "flex", alignItems: "center", opacity: isHovered ? 1 : 0, transition: "opacity 120ms" }}
      title="Delete event"
    >
      <Trash2 className="w-4 h-4" />
    </button>
  ) : null
  const renderConfirmBody = (ev: CalendarEvent) => (
    <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "17px 20px", borderRadius: "var(--r-card)", background: "color-mix(in srgb, var(--danger) 5%, var(--cream))", border: "1px solid color-mix(in srgb, var(--danger) 28%, var(--line-2))" }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <p style={{ fontFamily: "var(--serif)", fontSize: 19, fontWeight: 600, color: "var(--danger)", margin: 0, letterSpacing: "-0.01em" }}>{ev.title}</p>
        <p style={{ fontSize: 13, color: "color-mix(in srgb, var(--danger) 60%, var(--body))", margin: "4px 0 0", fontFamily: "var(--sans)" }}>Delete this event and all its planning data?</p>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
        <CentralButton variant="secondary" size="sm" onClick={e => { e.stopPropagation(); setDeleteConfirmId(null) }}>Cancel</CentralButton>
        <CentralButton variant="danger-solid" size="sm" onClick={e => { e.stopPropagation(); onDelete(ev.id) }} disabled={deleting}>{deleting ? "Deleting…" : "Delete"}</CentralButton>
      </div>
    </div>
  )

  // ── Upcoming list (month-grouped; first entry is the emphasised Up-Next) ──────
  const upcomingNodes: ReactNode[] = []
  let lastMonthKey = ""
  upcoming.forEach((ev, i) => {
    const d = new Date(ev.start_date)
    const end = new Date(ev.end_date)
    const monthKey = `${d.getFullYear()}-${d.getMonth()}`
    if (monthKey !== lastMonthKey) {
      lastMonthKey = monthKey
      // First month sits flush under the section header — the padded wrapper already
      // supplies the top gap; only later months get the full separating top margin.
      const firstMonth = upcomingNodes.length === 0
      upcomingNodes.push(
        <div key={`m-${monthKey}`} style={{ display: "flex", alignItems: "center", gap: "var(--space-6)", margin: `${firstMonth ? "0" : "var(--space-9)"} 0 var(--space-6)` }}>
          <span style={{ ...monoBase, fontSize: 11, letterSpacing: "0.16em", color: "var(--muted-text)", whiteSpace: "nowrap" }}>
            {d.toLocaleDateString("en-US", { month: "long", year: "numeric" })}
          </span>
          <span style={{ flex: 1, height: 1, background: "var(--line)" }} />
        </div>,
      )
    }

    const isFirst = i === 0
    const isLast = i === upcoming.length - 1
    const isUpNext = ev.id === upNextId
    const isConfirmDelete = deleteConfirmId === ev.id
    const isHovered = hoveredId === ev.id
    const isPlanned = plannedIds.has(ev.id)
    const cd = countdownLabel(d, now)
    const kids = childrenByParent.get(ev.id) ?? []
    const hasKids = kids.length > 0
    const subsOpen = effectiveOpenSubs.has(ev.id)

    const metaDate = d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })
    const timeStr = d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })
    const dtStr = ev.all_day ? metaDate : `${metaDate} · ${timeStr}`
    const multiDay = new Date(end.getFullYear(), end.getMonth(), end.getDate()).getTime() !== new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime() && !isNaN(end.getTime())
    const rangeStr = multiDay
      ? `${d.toLocaleDateString("en-US", { month: "short", day: "numeric" })} – ${end.toLocaleDateString("en-US", { month: "short", day: "numeric" })}`
      : dtStr

    const dayNum = daysUntil(d, now)
    const bigNum = dayNum >= 30 ? String(Math.round(dayNum / 30)) : String(Math.max(dayNum, 0))
    const bigUnit = dayNum <= 0 ? "today" : dayNum < 30 ? (dayNum === 1 ? "day away" : "days away") : (Math.round(dayNum / 30) === 1 ? "month away" : "months away")

    // Body: confirm-delete swap, up-next callout, or standard card.
    let body: ReactNode
    if (isConfirmDelete) {
      body = renderConfirmBody(ev)
    } else if (isUpNext) {
      body = (
        <div
          onClick={() => onOpenEvent(ev)}
          onMouseEnter={() => setHoveredId(ev.id)}
          onMouseLeave={() => setHoveredId(null)}
          style={{ background: "var(--cream-3)", border: "1px solid var(--line-2)", borderLeft: "3px solid var(--plum)", borderRadius: "var(--r-callout)", padding: "18px 22px", cursor: "pointer" }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
            <span style={{ width: 7, height: 7, borderRadius: "50%", background: "var(--plum)", flexShrink: 0 }} />
            <span style={{ ...monoBase, fontSize: 10.5, letterSpacing: "0.15em", color: "var(--plum)" }}>Up next · Starts {(cd?.label ?? "soon").toLowerCase()}</span>
            <span style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 8 }}>
              {renderPlannedCheck(isPlanned)}
              {renderDeleteBtn(ev.id, isHovered)}
            </span>
          </div>
          <div style={{ display: "flex", alignItems: "flex-start", gap: 16, marginTop: 12 }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <h3 style={{ fontFamily: "var(--serif)", fontSize: 23, fontWeight: 600, color: "var(--ink)", margin: 0, letterSpacing: "-0.01em" }}>{ev.title}</h3>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 6, fontSize: 13, color: "var(--body)", fontFamily: "var(--sans)", flexWrap: "wrap" }}>
                <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}><Calendar className="w-3.5 h-3.5" style={{ opacity: 0.7 }} /> {rangeStr}</span>
                {ev.location && <>{dot}<span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}><MapPin className="w-3.5 h-3.5" style={{ opacity: 0.7 }} /> {ev.location}</span></>}
              </div>
            </div>
            <div style={{ marginLeft: "auto", textAlign: "right", flexShrink: 0 }}>
              <div style={{ fontFamily: "var(--serif)", fontSize: 22, fontWeight: 600, color: "var(--plum)", lineHeight: 1, letterSpacing: "-0.02em" }}>{bigNum}</div>
              <div style={{ ...monoBase, fontSize: 10, color: "var(--muted-text)", marginTop: 3 }}>{bigUnit}</div>
            </div>
          </div>
        </div>
      )
    } else {
      const isPast = cd === null
      body = (
        <div
          onClick={() => onOpenEvent(ev)}
          onMouseEnter={() => setHoveredId(ev.id)}
          onMouseLeave={() => setHoveredId(null)}
          style={{ display: "flex", alignItems: "center", gap: "var(--space-5)", padding: "17px 20px", borderRadius: "var(--r-card)", background: "var(--cream)", border: `1px solid ${isHovered ? "var(--dashed)" : "var(--line-2)"}`, cursor: "pointer", transition: "border-color 120ms ease" }}
        >
          <div style={{ flex: 1, minWidth: 0 }}>
            <p style={{ fontFamily: "var(--serif)", fontSize: 19, fontWeight: 600, color: "var(--ink)", margin: 0, letterSpacing: "-0.01em" }}>{ev.title}</p>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 4, fontSize: 13, color: "var(--body)", fontFamily: "var(--sans)", flexWrap: "wrap" }}>
              <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}><Calendar className="w-3.5 h-3.5" style={{ opacity: 0.7 }} /> {dtStr}</span>
              {ev.location && <>{dot}<span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}><MapPin className="w-3.5 h-3.5" style={{ opacity: 0.7 }} /> {ev.location}</span></>}
            </div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 10, flexShrink: 0 }}>
            {!isPast && cd && (
              <span style={{ fontFamily: "var(--sans)", fontSize: 12.5, borderRadius: 999, padding: "5px 12px", whiteSpace: "nowrap", border: "1px solid var(--line-2)", background: cd.soon ? "var(--ivory)" : "var(--cream-2)", color: cd.soon ? "var(--plum)" : "var(--body)", fontWeight: cd.soon ? 500 : 400 }}>{cd.label}</span>
            )}
            {renderPlannedCheck(isPlanned)}
            {renderDeleteBtn(ev.id, isHovered)}
          </div>
        </div>
      )
    }

    // Sub-events disclosure (only when the event has children).
    const subsBlock = hasKids ? (
      <div style={{ marginTop: 10 }}>
        <CentralButton
          variant="quiet"
          size="sm"
          onClick={() => toggleSubs(ev.id)}
          style={{ fontSize: 12.5, gap: 7 }}
        >
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ transform: subsOpen ? "rotate(90deg)" : "none", transition: "transform 160ms ease" }}>
            <path d="M9 6l6 6-6 6" />
          </svg>
          <span>Sub-events</span>
          <span style={{ ...monoBase, fontSize: 10, background: "var(--ivory)", border: "1px solid var(--line-2)", borderRadius: 999, padding: "1px 7px", color: "var(--plum)" }}>{kids.length}</span>
        </CentralButton>
        <div style={{ overflow: "hidden", maxHeight: subsOpen ? 2000 : 0, transition: "max-height 260ms ease" }}>
          <div style={{ paddingTop: 10, display: "flex", flexDirection: "column", gap: 8 }}>
            {kids.map(c => {
              const cd2 = new Date(c.start_date)
              const cTime = c.all_day ? "All day" : cd2.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })
              return (
                <div key={c.id} onClick={e => { e.stopPropagation(); onOpenEvent(c) }} style={{ display: "grid", gridTemplateColumns: "52px 20px 1fr", cursor: "pointer" }}>
                  <div style={{ textAlign: "center", paddingTop: 4 }}>
                    <div style={{ fontFamily: "var(--serif)", fontSize: 19, fontWeight: 600, color: "var(--ink)", lineHeight: 1, letterSpacing: "-0.02em" }}>{cd2.getDate()}</div>
                    <div style={{ ...monoBase, fontSize: 9, color: "var(--muted-text)", marginTop: 2 }}>{cd2.toLocaleDateString("en-US", { month: "short" })}</div>
                  </div>
                  <div style={{ position: "relative" }}>
                    <div style={{ position: "absolute", left: "50%", top: 0, bottom: 0, width: 2, background: "var(--line-2)", transform: "translateX(-50%)" }} />
                    <div style={{ position: "absolute", left: "50%", top: "50%", width: 7, height: 7, borderRadius: "50%", background: "var(--cream)", border: "2px solid var(--dashed)", transform: "translate(-50%,-50%)", boxSizing: "border-box" }} />
                  </div>
                  <div style={{ background: "var(--cream)", border: "1px solid var(--line-2)", borderRadius: 10, padding: "11px 15px", display: "flex", alignItems: "center", gap: 10 }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <p style={{ fontSize: 15, fontWeight: 500, color: "var(--ink)", margin: 0, fontFamily: "var(--sans)" }}>{c.title}</p>
                      {c.description && <p style={{ fontSize: 12, color: "var(--body)", margin: "2px 0 0", fontFamily: "var(--sans)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.description}</p>}
                    </div>
                    <span style={{ ...monoBase, fontSize: 11, color: "var(--muted-text)", marginLeft: "auto", flexShrink: 0 }}>{cTime}</span>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      </div>
    ) : null

    upcomingNodes.push(
      <div key={ev.id} style={{ display: "grid", gridTemplateColumns: "76px 26px 1fr" }}>
        {/* Date block */}
        <div style={{ textAlign: "center", paddingTop: 20 }}>
          <div style={{ ...monoBase, fontSize: 11, letterSpacing: "0.12em", color: "var(--muted-text)" }}>{d.toLocaleDateString("en-US", { weekday: "short" })}</div>
          <div style={{ fontFamily: "var(--serif)", fontSize: 38, fontWeight: 600, letterSpacing: "-0.02em", color: isUpNext ? "var(--plum)" : "var(--ink)", lineHeight: 1 }}>{d.getDate()}</div>
          <div style={{ ...monoBase, fontSize: 11, color: "var(--muted-text)" }}>{d.toLocaleDateString("en-US", { month: "short" })}</div>
        </div>
        {/* Spine */}
        <div style={{ position: "relative" }}>
          <div style={{ position: "absolute", left: "50%", transform: "translateX(-50%)", width: 2, background: "var(--line)", top: isFirst ? 28 : 0, bottom: isLast ? "auto" : 0, height: isLast ? 28 : "auto" }} />
          <div className={isUpNext ? "event-upnext-node" : undefined} style={{ position: "absolute", top: 28, left: "50%", transform: "translate(-50%,-50%)", width: 11, height: 11, borderRadius: "50%", background: isUpNext ? "var(--plum)" : "var(--cream)", border: `2px solid ${isUpNext ? "var(--plum)" : "var(--dashed)"}`, boxSizing: "border-box" }} />
        </div>
        {/* Body */}
        <div style={{ paddingTop: 14, minWidth: 0 }}>
          {body}
          {subsBlock}
        </div>
      </div>,
    )
  })

  // ── Past list (reverse-chronological, de-emphasised; no month grouping, no subs) ──
  const pastDesc = [...past].reverse()
  const pastNodes: ReactNode[] = pastDesc.map((ev, i) => {
    const d = new Date(ev.start_date)
    const isFirst = i === 0
    const isLast = i === pastDesc.length - 1
    const isConfirmDelete = deleteConfirmId === ev.id
    const isHovered = hoveredId === ev.id
    const isPlanned = plannedIds.has(ev.id)
    const metaDate = d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })
    const timeStr = d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })
    const dtStr = ev.all_day ? metaDate : `${metaDate} · ${timeStr}`

    const body = isConfirmDelete ? renderConfirmBody(ev) : (
      <div
        onClick={() => onOpenEvent(ev)}
        onMouseEnter={() => setHoveredId(ev.id)}
        onMouseLeave={() => setHoveredId(null)}
        style={{ display: "flex", alignItems: "center", gap: "var(--space-5)", padding: "17px 20px", borderRadius: "var(--r-card)", background: "var(--cream-2)", border: `1px solid ${isHovered ? "var(--line-2)" : "var(--line)"}`, opacity: isHovered ? 1 : 0.82, cursor: "pointer", transition: "opacity 120ms ease, border-color 120ms ease" }}
      >
        <div style={{ flex: 1, minWidth: 0 }}>
          <p style={{ fontFamily: "var(--serif)", fontSize: 19, fontWeight: 500, color: "var(--body)", margin: 0, letterSpacing: "-0.01em" }}>{ev.title}</p>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 4, fontSize: 13, color: "var(--faint)", fontFamily: "var(--sans)", flexWrap: "wrap" }}>
            <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}><Calendar className="w-3.5 h-3.5" style={{ opacity: 0.7 }} /> {dtStr}</span>
            {ev.location && <>{dot}<span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}><MapPin className="w-3.5 h-3.5" style={{ opacity: 0.7 }} /> {ev.location}</span></>}
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexShrink: 0 }}>
          <span style={{ ...monoBase, fontSize: 10.5, letterSpacing: "0.08em", color: "var(--faint)", whiteSpace: "nowrap" }}>{endedAgoLabel(d, now)}</span>
          {renderPlannedCheck(isPlanned)}
          {renderDeleteBtn(ev.id, isHovered)}
        </div>
      </div>
    )

    return (
      <div key={ev.id} style={{ display: "grid", gridTemplateColumns: "76px 26px 1fr" }}>
        {/* Date block — de-emphasised */}
        <div style={{ textAlign: "center", paddingTop: 20 }}>
          <div style={{ ...monoBase, fontSize: 11, letterSpacing: "0.12em", color: "var(--faint)" }}>{d.toLocaleDateString("en-US", { weekday: "short" })}</div>
          <div style={{ fontFamily: "var(--serif)", fontSize: 38, fontWeight: 600, letterSpacing: "-0.02em", color: "var(--muted-text)", lineHeight: 1 }}>{d.getDate()}</div>
          <div style={{ ...monoBase, fontSize: 11, color: "var(--faint)" }}>{d.toLocaleDateString("en-US", { month: "short" })}</div>
        </div>
        {/* Spine — done node */}
        <div style={{ position: "relative" }}>
          <div style={{ position: "absolute", left: "50%", transform: "translateX(-50%)", width: 2, background: "var(--line)", top: isFirst ? 28 : 0, bottom: isLast ? "auto" : 0, height: isLast ? 28 : "auto" }} />
          <div style={{ position: "absolute", top: 28, left: "50%", transform: "translate(-50%,-50%)", width: 11, height: 11, borderRadius: "50%", background: "var(--line-2)", border: "2px solid var(--line-2)", boxSizing: "border-box", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <Check style={{ width: 8, height: 8, color: "var(--cream)" }} strokeWidth={3} />
          </div>
        </div>
        {/* Body */}
        <div style={{ paddingTop: 14, minWidth: 0 }}>{body}</div>
      </div>
    )
  })

  return (
    <div>
      {upcomingNodes}
      {past.length > 0 && (
        <>
          <CentralButton
            variant="quiet"
            onClick={() => setShowPastOverride(v => !(v ?? (upcoming.length === 0)))}
            onMouseEnter={() => setPastBarHover(true)}
            onMouseLeave={() => setPastBarHover(false)}
            style={{ width: "100%", gap: "var(--space-6)", marginTop: "var(--space-10)" }}
          >
            <span style={{ flex: 1, height: 1, background: "var(--line)" }} />
            <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <ChevronDown className="w-3.5 h-3.5" style={{ color: "var(--muted-text)", transform: showPast ? "rotate(180deg)" : "none", transition: "transform 200ms ease" }} />
              <span style={{ ...monoBase, fontSize: 11, letterSpacing: "0.14em", color: pastBarHover ? "var(--body)" : "var(--muted-text)", transition: "color 120ms ease" }}>Past events</span>
              <span style={{ ...monoBase, fontSize: 10, background: "var(--ivory)", border: "1px solid var(--line-2)", borderRadius: 999, padding: "1px 7px", color: "var(--muted-text)" }}>{past.length}</span>
            </span>
            <span style={{ flex: 1, height: 1, background: "var(--line)" }} />
          </CentralButton>
          {showPast && <div style={{ paddingTop: "var(--space-6)" }}>{pastNodes}</div>}
        </>
      )}
    </div>
  )
}

// ── StudentOrgTeamHome ─────────────────────────────────────────────────────────
// Full redesign per design spec: plum hero → General/Plan/Roster/Resources tabs →
// General = month calendar (click → EventPlanWorkspace directly) + UP NEXT + QUICK ADD + notes timeline

export function StudentOrgTeamHome({
  teamId, teamName, teamIcon, ministryId, userId, userName, userRole, canEdit, canEditBudget, onTeamSettings,
  planningEvent, onPlanningEventChange, refreshSignal, onOpenChat,
  desktopSection, isDesktopView, onCalEventsChange, onEditEvent,
}: {
  teamId: string | null
  teamName: string
  teamIcon: string
  ministryId: string
  userId: string
  userName: string
  userRole: string
  canEdit: boolean
  canEditBudget: boolean
  onTeamSettings?: () => void
  planningEvent: CalendarEvent | null
  onPlanningEventChange: (ev: CalendarEvent | null) => void
  refreshSignal?: number
  onOpenChat?: (id: string, name: string, type?: string) => void
  desktopSection?: string
  isDesktopView?: boolean
  onCalEventsChange?: (events: CalendarEvent[]) => void
  onEditEvent?: () => void
}) {
  const supabase = createClient()
  const { setParam } = useNavState()
  const [teamTab, setTeamTab] = useState<"General" | "Meeting Notes" | "Events" | "Resources" | "Groups" | "Rotations">(() => {
    const p = typeof window !== "undefined" ? new URLSearchParams(window.location.search).get("sotab") : null
    return (["General", "Meeting Notes", "Events", "Resources", "Groups", "Rotations"].includes(p ?? "") ? p : "General") as "General" | "Meeting Notes" | "Events" | "Resources" | "Groups" | "Rotations"
  })

  function setTeamTabAndUrl(tab: "General" | "Meeting Notes" | "Events" | "Resources" | "Groups" | "Rotations") {
    setTeamTab(tab)
    setParam("sotab", tab)
  }

  // On desktop: section is driven by sidebar prop; on mobile: by internal teamTab state
  const displaySection = desktopSection ?? teamTab

  // Calendar — SWR-cached list of events + planned-event ids (shared key with MinistryCalendar).
  const { data: calData, isLoading: calLoading, mutate: mutateCal } = useSWR(
    ministryId ? (["calendar-events", ministryId, teamId ?? "all"] as const) : null,
    fetchCalendarEventsAndPlans,
    { keepPreviousData: false },
  )
  // Shared fetcher returns the broader set (incl. sub-events) for MinistryCalendar.
  // StudentOrgTeamHome excludes sub-events locally to preserve its original behavior.
  const calEvents = useMemo(() => (calData?.events ?? []).filter(e => e.parent_event_id == null), [calData])
  const plannedIds = calData?.plannedIds ?? EMPTY_ID_SET
  const [currentMonth, setCurrentMonth] = useState(new Date())

  // Add / delete
  const [showAddModal, setShowAddModal] = useState(false)
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null)
  const [deleting, setDeleting] = useState(false)

  // Sub-event body-swap: when a sub-event is opened from EventPlanWorkspace's
  // Sub-events tab, it reuses the SAME parent SubpageShell (body + extended
  // crumbs) instead of nesting a second shell. Cleared whenever the parent
  // event changes or closes, so closing the parent also drops the child.
  const [planningChild, setPlanningChild] = useState<CalendarEvent | null>(null)
  useEffect(() => {
    setPlanningChild(null)
  }, [planningEvent?.id])

  // Roster
  const [roster, setRoster] = useState<{ id: string; user_id: string; name: string; role: string }[]>([])

  // Resources tab — which role's content to display + the team's actual roles
  const [resourcesRole, setResourcesRole] = useState<string | null>(null)
  const [teamRoles, setTeamRoles] = useState<{ name: string; is_president: boolean }[]>([])
  // Reset the selected role whenever the team changes so a stale role from a
  // previous team never renders as the active tab.
  useEffect(() => { setResourcesRole(null) }, [teamId])

  // Groups tab — trigger wizard from header button
  const [groupGenerateTrigger, setGroupGenerateTrigger] = useState(0)
  // Notes tab — trigger createNote from header button
  const [notesTrigger, setNotesTrigger] = useState(0)
  // Rotations tab — trigger New-semester modal from header button
  const [rotationNewSemesterTrigger, setRotationNewSemesterTrigger] = useState(0)
  // Meeting Notes — which note is open (URL-synced via ?notetab); null = list view.
  const [openNoteId, setOpenNoteId] = useState<string | null>(() =>
    typeof window !== "undefined" ? new URLSearchParams(window.location.search).get("notetab") : null,
  )
  function setOpenNoteAndUrl(id: string | null) {
    setOpenNoteId(id)
    setParam("notetab", id)
  }
  // Clear the open note when the team changes or the user leaves the Meeting Notes
  // section. Skip the initial mount so a ?notetab deep-link/refresh is preserved.
  const prevNoteTeamRef = useRef(teamId)
  const noteSectionMountRef = useRef(false)
  useEffect(() => {
    if (prevNoteTeamRef.current !== teamId) {
      prevNoteTeamRef.current = teamId
      setOpenNoteAndUrl(null)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [teamId])
  useEffect(() => {
    if (!noteSectionMountRef.current) { noteSectionMountRef.current = true; return }
    if (displaySection !== "Meeting Notes" && openNoteId) setOpenNoteAndUrl(null)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [displaySection])

  // Side-effect (was inside the fetcher): notify the parent of the current event list.
  // Pass the sub-event-excluded list (calEvents) to keep parent consumers consistent
  // with StudentOrgTeamHome's original filtered dataset.
  useEffect(() => {
    if (calData) onCalEventsChange?.(calEvents)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [calData])
  // External refresh trigger → revalidate the shared cache.
  useEffect(() => {
    if (refreshSignal) void mutateCal()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshSignal])

  useEffect(() => {
    if (!teamId) return
    supabase.from("team_members")
      .select("id, user_id, team_roles(name), profiles(name)")
      .eq("team_id", teamId)
      .then(({ data }) => setRoster((data ?? []).map((m: Record<string, unknown>) => ({
        id: m.id as string,
        user_id: m.user_id as string,
        name: (m.profiles as { name?: string } | null)?.name ?? "Unknown",
        role: (m.team_roles as { name?: string } | null)?.name ?? "Member",
      }))))
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [teamId])

  // Resources role tabs are the team's ACTUAL roles (president first), not a hardcoded list.
  useEffect(() => {
    if (!teamId) { setTeamRoles([]); return }
    supabase.from("team_roles")
      .select("name, is_president")
      .eq("team_id", teamId)
      .then(({ data }) => {
        const rows = (data ?? []) as { name: string; is_president: boolean | null }[]
        // President(s) first; otherwise preserve the query order.
        const sorted = [...rows].sort((a, b) => (b.is_president ? 1 : 0) - (a.is_president ? 1 : 0))
        setTeamRoles(sorted.map(r => ({ name: r.name, is_president: !!r.is_president })))
      })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [teamId])

  const now = new Date()

  async function handleDeleteEvent(evId: string) {
    setDeleting(true)
    const { data: plan } = await supabase.from("event_plans").select("id").eq("calendar_event_id", evId).maybeSingle()
    if (plan) {
      await Promise.all([
        supabase.from("event_tasks").delete().eq("event_plan_id", plan.id),
        supabase.from("event_roles").delete().eq("event_plan_id", plan.id),
        supabase.from("event_notes").delete().eq("event_plan_id", plan.id),
      ])
      await supabase.from("event_plans").delete().eq("id", plan.id)
    }
    await supabase.from("calendar_events").delete().eq("id", evId)
    void mutateCal()
    setDeleteConfirmId(null)
    setDeleting(false)
    if (planningEvent?.id === evId) onPlanningEventChange(null)
  }

  if (planningEvent) {
    // Single render for both viewports. SubpageShell consumes the page body
    // (cream, in-content) and supplies the only horizontal inset + the mobile
    // back row. It pushes [team (closes the event), event title]; getShellCrumbs
    // omits the team crumb while an event is open so the desktop trail stays
    // Central / Workspace / {team} / {event} with no duplicate — and the team
    // crumb's onClick gives the mobile back row a "← {team}" target.
    // EventPlanWorkspace runs `bare` so its own px doesn't double-pad under the shell.
    // Body-swap: a single SubpageShell renders either the parent event or, when
    // a sub-event is open, the child — extending the crumb trail to
    // Central / Workspace / {team} / {event} / {sub-event}. The {team} crumb
    // closes everything; the {event} crumb returns to the parent. Nesting is
    // capped at one level: onOpenChild is only passed while viewing the parent,
    // so a sub-event offers no further drill affordance.
    const activeEvent = planningChild ?? planningEvent
    const crumbs = planningChild
      ? [
          { label: teamName, onClick: () => { setPlanningChild(null); onPlanningEventChange(null) } },
          { label: planningEvent.title, onClick: () => setPlanningChild(null) },
          { label: planningChild.title },
        ]
      : [
          { label: teamName, onClick: () => onPlanningEventChange(null) },
          { label: planningEvent.title },
        ]
    return (
      <SubpageShell crumbs={crumbs} title={activeEvent.title} width="full">
        {/* key on the event id: remount when switching parent<->sub-event so the
            section state re-inits (a sub-event has no Sub-events tab → lands on
            Overview instead of inheriting the parent's ?evtab=sub_events). */}
        <EventPlanWorkspace
          key={activeEvent.id}
          inline
          bare
          calendarEvent={activeEvent}
          ministryId={ministryId}
          userId={userId}
          canEdit={canEdit}
          canEditBudget={canEditBudget}
          teamId={teamId}
          onClose={() => planningChild ? setPlanningChild(null) : onPlanningEventChange(null)}
          onOpenChat={onOpenChat}
          onEditEvent={onEditEvent}
          onOpenChild={planningChild ? undefined : setPlanningChild}
          refreshSignal={refreshSignal}
        />
      </SubpageShell>
    )
  }

  const userRosterRole = roster.find(m => m.user_id === userId)?.role ?? null
  const resourcesRoles = teamRoles.map(r => r.name)
  const presidentRoleName = teamRoles.find(r => r.is_president)?.name ?? null
  // Resolve the active role tab to a REAL role: an explicit selection, else the
  // user's own role if it's a resource role, else the first role.
  const activeResourcesRole =
    (resourcesRole && resourcesRoles.includes(resourcesRole) ? resourcesRole : null) ??
    (userRosterRole && resourcesRoles.includes(userRosterRole) ? userRosterRole : null) ??
    resourcesRoles[0] ?? ""
  // Per-role edit gating (mirrors the DB RLS write rule): admin/leader-tier team
  // editors (canEdit) OR the team President OR the member whose own role matches
  // the active role tab. Prevents edit controls appearing where the write is a
  // silent RLS no-op.
  const canWriteActiveRole =
    canEdit ||
    (presidentRoleName != null && userRosterRole === presidentRoleName) ||
    (!!userRosterRole && userRosterRole === activeResourcesRole)

  // Note detail consumes the whole content body on BOTH viewports: the section
  // header is suppressed and MeetingNotesSection (which early-returns the
  // SubpageShell-wrapped detail) renders full-bleed, OUTSIDE the px-5 md:px-14
  // wrapper — so SubpageShell's own padding is the only inset (no double-padding
  // on mobile). The desktop TabPageHeader gate below still ANDs with isDesktopView.
  const meetingNoteOpen = displaySection === "Meeting Notes" && openNoteId != null

  return (
    <>
    <div>
      {/* Mobile tab strip — desktop uses sidebar nav */}
      {!isDesktopView && (
        <div style={{ marginBottom: 24, display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <PlanSubTabStrip
              tabs={[
                { key: "General", label: "General" },
                { key: "Meeting Notes", label: "Meeting Notes" },
                { key: "Events", label: "Events" },
                { key: "Resources", label: "Resources" },
                { key: "Groups", label: "Groups" },
                { key: "Rotations", label: "Rotations" },
              ]}
              active={teamTab}
              onChange={t => setTeamTabAndUrl(t as "General" | "Meeting Notes" | "Events" | "Resources" | "Groups" | "Rotations")}
            />
          </div>
          {onTeamSettings && (
            <IconButton dim={32} onClick={onTeamSettings} title="Team settings" className="ml-auto">
              <Settings className="w-4 h-4" />
            </IconButton>
          )}
        </div>
      )}

      {/* Desktop object header — workspace name + settings gear only.
          Per-section titles + creates now live in each section body (Zone C). */}
      {isDesktopView && !meetingNoteOpen && (
        <TabPageHeader>
          <PageTitle title={teamName} compact />
          {onTeamSettings && (
            <IconButton dim={32} onClick={onTeamSettings} title="Team settings" className="ml-auto">
              <Settings className="w-4 h-4" />
            </IconButton>
          )}
        </TabPageHeader>
      )}

      {/* ── Tab content ── */}
      {/* Note detail goes full-bleed (SubpageShell supplies cream bg + padding); everything else stays in the padded wrapper. */}
      {meetingNoteOpen ? (
        <MeetingNotesSection teamId={teamId} userId={userId} userName={userName} canWrite={canEdit} startNewTrigger={notesTrigger} openNoteId={openNoteId} onOpenNote={setOpenNoteAndUrl} />
      ) : (
      <div className="px-5 md:px-14" style={{ paddingTop: 24, paddingBottom: 60 }}>

        {/* GENERAL — calendar full-width + meeting notes */}
        {displaySection === "General" && (
          <div>
            <ContentHeader label="General" style={{ marginBottom: 24 }} />
            <section>
              {calLoading ? (
                <div style={{ textAlign: "center", padding: "48px 0", color: "var(--muted-text)", fontSize: 13 }}>Loading…</div>
              ) : (
                <MonthGrid
                  events={calEvents}
                  currentMonth={currentMonth}
                  onMonthChange={setCurrentMonth}
                  onSelectEvent={(ev) => onPlanningEventChange(ev)}
                />
              )}

              <p style={{ marginTop: 10, fontSize: 12, color: "var(--muted-text)", display: "flex", alignItems: "center", gap: 6 }}>
                <span style={{ display: "inline-block", width: 6, height: 6, borderRadius: 99, background: "var(--plum)" }} />
                Click any event to open its plan — no modal in between.
              </p>
            </section>
          </div>
        )}

        {/* NOTES — meeting notes timeline */}
        {displaySection === "Meeting Notes" && (
          <div>
            <ContentHeader
              label="Meeting Notes"
              style={{ marginBottom: 24 }}
              action={canEdit && (
                <ContentActionButton
                  variant="primary"
                  icon={<Plus style={{ width: 13, height: 13 }} />}
                  label="New note"
                  onClick={() => setNotesTrigger(t => t + 1)}
                />
              )}
            />
            <MeetingNotesSection teamId={teamId} userId={userId} userName={userName} canWrite={canEdit} startNewTrigger={notesTrigger} openNoteId={openNoteId} onOpenNote={setOpenNoteAndUrl} />
          </div>
        )}

        {/* PLAN — events list with Plan → links */}
        {displaySection === "Events" && (
          <div>
            <ContentHeader
              label="Events"
              style={{ marginBottom: 24 }}
              action={canEdit && (
                <ContentActionButton
                  variant="primary"
                  icon={<Plus style={{ width: 13, height: 13 }} />}
                  label="New Event"
                  onClick={() => setShowAddModal(true)}
                />
              )}
            />
            <EventsAgendaList
              events={calEvents}
              allEvents={calData?.events ?? []}
              onOpenEvent={onPlanningEventChange}
              canEdit={canEdit}
              onDelete={handleDeleteEvent}
              deleteConfirmId={deleteConfirmId}
              setDeleteConfirmId={setDeleteConfirmId}
              deleting={deleting}
              plannedIds={plannedIds}
            />
          </div>
        )}

        {/* RESOURCES — role links/docs */}
        {displaySection === "Resources" && (
          <div>
            {/* Header + role sub-strip render once for both breakpoints. */}
            <ContentHeader
              label="Resources"
              style={{ marginBottom: 24 }}
              action={userRosterRole && (
                <span style={{ fontSize: 11, fontWeight: 600, color: "var(--plum)", background: "#F3EAF4", borderRadius: 9999, padding: "4px 10px", letterSpacing: "0.05em", textTransform: "uppercase", whiteSpace: "nowrap", flexShrink: 0 }}>
                  {userRosterRole}
                </span>
              )}
            />
            {resourcesRoles.length > 0 && (
              <div style={{ marginBottom: 22 }}>
                <PlanSubTabStrip
                  tabs={resourcesRoles.map(r => ({ key: r, label: r }))}
                  active={activeResourcesRole}
                  onChange={setResourcesRole}
                  flush
                />
              </div>
            )}
            <StudentOrgRoleTabContent key={activeResourcesRole} teamId={teamId} roleName={activeResourcesRole} userId={userId} canWrite={canWriteActiveRole} />
          </div>
        )}

        {/* GROUPS — group generator */}
        {displaySection === "Groups" && (
          <div>
            <ContentHeader
              label="Groups"
              style={{ marginBottom: 24 }}
              action={canEdit && (
                <ContentActionButton
                  variant="primary"
                  icon={<Plus style={{ width: 13, height: 13 }} />}
                  label="Generate groups"
                  onClick={() => setGroupGenerateTrigger(t => t + 1)}
                />
              )}
            />
            <GroupsTab
              teamId={teamId}
              ministryId={ministryId}
              userId={userId}
              canEdit={canEdit}
              generateTrigger={groupGenerateTrigger}
            />
          </div>
        )}

        {displaySection === "Rotations" && teamId && (
          <div>
            <ContentHeader
              label="Rotations"
              style={{ marginBottom: 24 }}
              action={canEdit && (
                <ContentActionButton
                  variant="primary"
                  icon={<Plus style={{ width: 13, height: 13 }} />}
                  label="New semester"
                  onClick={() => setRotationNewSemesterTrigger(t => t + 1)}
                />
              )}
            />
            <RotationsTab
              teamId={teamId}
              ministryId={ministryId}
              userId={userId}
              canEdit={canEdit}
              newSemesterTrigger={rotationNewSemesterTrigger}
            />
          </div>
        )}
      </div>
      )}
    </div>

    {showAddModal && (
      <AddEventModal
        ministryId={ministryId}
        teamId={teamId}
        userId={userId}
        onClose={() => setShowAddModal(false)}
        onSaved={(newEv) => {
          void mutateCal()
          setShowAddModal(false)
          onPlanningEventChange(newEv)
        }}
      />
    )}
    </>
  )
}

// ── RotationsTab ──────────────────────────────────────────────────────────────
type CCSFRotationType = "lockup" | "sunday_lunch_prayer"
const ROTATION_TYPES: { type: CCSFRotationType; label: string }[] = [
  { type: "lockup", label: "Lock-up" },
  { type: "sunday_lunch_prayer", label: "Sunday Lunch Prayer" },
]
const WEEKDAY_LONG = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"]

interface RotationSlot {
  id: string
  rotation_type: CCSFRotationType
  assigned_to: string | null
  assigned_name?: string
  week_date: string
}
interface RotationSemester {
  id: string
  name: string
  start_date: string
  end_date: string
}

// Local YMD (avoids UTC-shift from toISOString on local dates)
function ymd(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`
}
// All dates in [start, end] falling on `weekday` (0=Sun..6=Sat)
function datesForWeekday(startStr: string, endStr: string, weekday: number): string[] {
  const out: string[] = []
  const d = new Date(startStr + "T12:00:00")
  const end = new Date(endStr + "T12:00:00")
  while (d.getDay() !== weekday && d <= end) d.setDate(d.getDate() + 1)
  while (d <= end) {
    out.push(ymd(d))
    d.setDate(d.getDate() + 7)
  }
  return out
}
function shortMonthDay(dateStr: string): string {
  return new Date(dateStr + "T12:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" })
}
function shortDow(dateStr: string): string {
  return new Date(dateStr + "T12:00:00").toLocaleDateString("en-US", { weekday: "short" })
}

// Small circular initials avatar. `mine` → plum fill (canonical MonogramChip);
// else neutral ivory (outside MonogramChip's plum-only contract, kept custom).
function RotationAvatar({ name, mine }: { name: string; mine: boolean }) {
  if (mine) {
    return (
      <MonogramChip
        initials={getInitials(name)}
        style={{ width: 22, height: 22, fontSize: 9.5, fontWeight: 600, letterSpacing: "0.02em" }}
      />
    )
  }
  return (
    <span
      style={{
        display: "inline-flex", alignItems: "center", justifyContent: "center",
        width: 22, height: 22, borderRadius: 999, flexShrink: 0,
        fontFamily: "var(--sans)", fontSize: 9.5, fontWeight: 600, letterSpacing: "0.02em",
        background: "var(--ivory)",
        color: "var(--body)",
        border: "1px solid var(--line-2)",
      }}
    >
      {getInitials(name)}
    </span>
  )
}

function RotationsTab({ teamId, ministryId, userId, canEdit, newSemesterTrigger }: {
  teamId: string; ministryId: string; userId: string; canEdit: boolean; newSemesterTrigger?: number
}) {
  const supabase = createClient()
  const [semesters, setSemesters] = useState<RotationSemester[]>([])
  const [activeSemesterId, setActiveSemesterId] = useState<string | null>(null)
  const [slots, setSlots] = useState<RotationSlot[]>([])
  const [loading, setLoading] = useState(true)
  const [slotsLoading, setSlotsLoading] = useState(false)

  const [confirmSlot, setConfirmSlot] = useState<RotationSlot | null>(null)
  const [confirmBusy, setConfirmBusy] = useState(false)
  const [showNewSemester, setShowNewSemester] = useState(false)

  // Open the New-semester modal from the section ContentHeader create button.
  useEffect(() => { if (newSemesterTrigger) setShowNewSemester(true) }, [newSemesterTrigger])

  const loadSemesters = useCallback(async () => {
    setLoading(true)
    const { data } = await supabase
      .from("rotation_semesters")
      .select("id, name, start_date, end_date")
      .eq("ministry_id", ministryId)
      .eq("team_id", teamId)
      .order("start_date", { ascending: false })
    const rows = (data ?? []) as RotationSemester[]
    setSemesters(rows)
    setActiveSemesterId(prev => (prev && rows.some(s => s.id === prev) ? prev : rows[0]?.id ?? null))
    setLoading(false)
  }, [supabase, ministryId, teamId])

  const loadSlots = useCallback(async (semesterId: string | null) => {
    if (!semesterId) { setSlots([]); return }
    setSlotsLoading(true)
    const { data } = await supabase
      .from("ccsf_rotations")
      .select("id, rotation_type, assigned_to, week_date")
      .eq("semester_id", semesterId)
      .order("week_date", { ascending: true })
    const rows = (data ?? []) as RotationSlot[]
    const ids = [...new Set(rows.map(r => r.assigned_to).filter(Boolean))] as string[]
    let nameMap = new Map<string, string>()
    if (ids.length > 0) {
      const { data: pData } = await supabase.from("profiles").select("id, name").in("id", ids)
      nameMap = new Map((pData ?? []).map((p: { id: string; name: string }) => [p.id, p.name]))
    }
    setSlots(rows.map(r => ({ ...r, assigned_name: r.assigned_to ? nameMap.get(r.assigned_to) : undefined })))
    setSlotsLoading(false)
  }, [supabase])

  useEffect(() => { loadSemesters() }, [loadSemesters])
  useEffect(() => { loadSlots(activeSemesterId) }, [activeSemesterId, loadSlots])

  // Claim an open slot or drop your own — mutates only assigned_to.
  // RLS only permits writing an OPEN or your-own slot; if the write hit 0 rows
  // (someone raced us / stale state) `.select()` returns nothing → resync from DB
  // instead of keeping a phantom optimistic change.
  async function confirmClaimOrDrop() {
    if (!confirmSlot) return
    const slot = confirmSlot
    const isMine = slot.assigned_to === userId
    setConfirmBusy(true)
    const nextAssigned = isMine ? null : userId
    const { data, error } = await supabase
      .from("ccsf_rotations")
      .update({ assigned_to: nextAssigned })
      .eq("id", slot.id)
      .eq("ministry_id", ministryId)
      .select()
    setConfirmBusy(false)
    if (error) return
    if (!data || data.length === 0) {
      // rejected / no-op — reconcile with the DB and close.
      await loadSlots(activeSemesterId)
      setConfirmSlot(null)
      return
    }
    setSlots(prev => prev.map(s => s.id === slot.id
      ? { ...s, assigned_to: nextAssigned, assigned_name: nextAssigned ? s.assigned_name : undefined }
      : s))
    setConfirmSlot(null)
  }

  async function createSemester(name: string, start: string, end: string, configs: { type: CCSFRotationType; enabled: boolean; weekday: number }[]) {
    const { data: sem, error } = await supabase
      .from("rotation_semesters")
      .insert({ ministry_id: ministryId, team_id: teamId, name, start_date: start, end_date: end, created_by: userId })
      .select("id, name, start_date, end_date")
      .single()
    if (error || !sem) return
    const rows: { ministry_id: string; team_id: string; semester_id: string; rotation_type: CCSFRotationType; week_date: string; assigned_to: null }[] = []
    for (const cfg of configs.filter(c => c.enabled)) {
      for (const d of datesForWeekday(start, end, cfg.weekday)) {
        rows.push({ ministry_id: ministryId, team_id: teamId, semester_id: sem.id, rotation_type: cfg.type, week_date: d, assigned_to: null })
      }
    }
    if (rows.length > 0) await supabase.from("ccsf_rotations").insert(rows)
    setShowNewSemester(false)
    await loadSemesters()
    setActiveSemesterId(sem.id)
  }

  if (loading) return <div style={{ textAlign: "center", padding: "40px 0", color: "var(--muted-text)", fontSize: 14 }}>Loading…</div>

  const groups = ROTATION_TYPES
    .map(rt => ({ ...rt, slots: slots.filter(s => s.rotation_type === rt.type) }))
    .filter(g => g.slots.length > 0)

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 28 }}>
      {/* ── Semester bar ── */}
      {semesters.length > 0 && (
        <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", flex: 1, minWidth: 0 }}>
            {semesters.map(sem => {
              const active = sem.id === activeSemesterId
              return (
                <FilterChip
                  key={sem.id}
                  selected={active}
                  onClick={() => setActiveSemesterId(sem.id)}
                  tone="ivory"
                  style={{
                    display: "flex", flexDirection: "column", alignItems: "flex-start", gap: 2,
                    padding: "8px 14px", borderRadius: 12, whiteSpace: "normal", textAlign: "left",
                    ...(active ? {} : { background: "transparent" }),
                  }}
                >
                  <span style={{ fontSize: 13, fontWeight: active ? 600 : 500, color: active ? "var(--plum)" : "var(--body)" }}>{sem.name}</span>
                  <span style={{ fontSize: 10.5, color: "var(--muted-text)" }}>{shortMonthDay(sem.start_date)} – {shortMonthDay(sem.end_date)}</span>
                </FilterChip>
              )
            })}
          </div>
        </div>
      )}

      {/* ── No semesters at all ── */}
      {semesters.length === 0 ? (
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 14 }}>
          <EmptyState
            icon={<Calendar className="w-6 h-6" />}
            title="No rotation semesters yet."
            subtitle={canEdit ? "Create a semester to open up sign-up slots." : "Ask a leader to set up a semester."}
          />
          {canEdit && (
            <CentralButton variant="secondary" size="sm" onClick={() => setShowNewSemester(true)}>
              <Plus className="w-4 h-4" /> New semester
            </CentralButton>
          )}
        </div>
      ) : slotsLoading ? (
        <div style={{ textAlign: "center", padding: "24px 0", color: "var(--muted-text)", fontSize: 14 }}>Loading…</div>
      ) : groups.length === 0 ? (
        <EmptyState
          icon={<ClipboardList className="w-6 h-6" />}
          title="No slots in this semester."
          subtitle={canEdit ? "This semester has no rotations. Create a new one to add slots." : "Nothing to sign up for here yet."}
        />
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 30 }}>
          {groups.map(group => {
            const total = group.slots.length
            const filled = group.slots.filter(s => s.assigned_to).length
            const weekdayName = WEEKDAY_LONG[new Date(group.slots[0].week_date + "T12:00:00").getDay()]
            const pct = total ? Math.round((filled / total) * 100) : 0
            return (
              <div key={group.type}>
                {/* header */}
                <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 12, flexWrap: "wrap" }}>
                  <p style={{ fontFamily: "var(--mono)", fontSize: 11, fontWeight: 600, letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--muted-text)", margin: 0 }}>
                    {group.label} · {weekdayName}s
                  </p>
                  <span style={{ fontFamily: "var(--sans)", fontSize: 11, fontWeight: 500, color: "var(--body)", background: "var(--ivory)", border: "1px solid var(--line-2)", borderRadius: 999, padding: "3px 10px", whiteSpace: "nowrap" }}>
                    {filled} of {total} filled
                  </span>
                  <div style={{ flex: 1, minWidth: 80, height: 5, borderRadius: 999, background: "var(--line-2)", overflow: "hidden" }}>
                    <div style={{ width: `${pct}%`, height: "100%", background: "var(--plum)", borderRadius: 999, transition: "width 200ms" }} />
                  </div>
                </div>
                {/* slot grid */}
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }} className="max-md:!grid-cols-1">
                  {group.slots.map(slot => (
                    <RotationSlotCell key={slot.id} slot={slot} userId={userId} onClick={() => setConfirmSlot(slot)} />
                  ))}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* ── Claim / Drop confirm modal ── */}
      {confirmSlot && (() => {
        const isMine = confirmSlot.assigned_to === userId
        const label = ROTATION_TYPES.find(r => r.type === confirmSlot.rotation_type)?.label ?? ""
        const dateLine = new Date(confirmSlot.week_date + "T12:00:00").toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })
        return (
          <CentralModal
            onClose={() => { if (!confirmBusy) setConfirmSlot(null) }}
            title={isMine ? "Drop this slot?" : "Take this slot?"}
            maxWidth={380}
            footer={
              <>
                <CentralButton variant="quiet" size="sm" onClick={() => setConfirmSlot(null)} disabled={confirmBusy}>
                  {isMine ? "Keep it" : "Cancel"}
                </CentralButton>
                {isMine ? (
                  <CentralButton variant="danger-solid" size="sm" onClick={confirmClaimOrDrop} disabled={confirmBusy}>
                    {confirmBusy ? "Dropping…" : "Drop it"}
                  </CentralButton>
                ) : (
                  <CentralButton variant="primary" size="sm" onClick={confirmClaimOrDrop} disabled={confirmBusy}>
                    {confirmBusy ? "Signing up…" : "Yes, sign me up"}
                  </CentralButton>
                )}
              </>
            }
          >
            {/* slot detail card */}
            <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 14px", background: "var(--cream-2)", border: "1px solid var(--line-2)", borderRadius: 12 }}>
              <span style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", width: 36, height: 36, borderRadius: 10, background: "var(--ivory)", border: "1px solid var(--line-2)", color: "var(--plum)", flexShrink: 0 }}>
                <Calendar className="w-4 h-4" />
              </span>
              <div style={{ minWidth: 0 }}>
                <p style={{ fontFamily: "var(--sans)", fontSize: 14, fontWeight: 600, color: "var(--ink)", margin: 0 }}>{label}</p>
                <p style={{ fontFamily: "var(--sans)", fontSize: 12.5, color: "var(--body)", margin: "2px 0 0" }}>{dateLine}</p>
              </div>
            </div>
          </CentralModal>
        )
      })()}

      {/* ── New semester modal ── */}
      {showNewSemester && (
        <NewSemesterModal
          onClose={() => setShowNewSemester(false)}
          onCreate={createSemester}
        />
      )}
    </div>
  )
}

// A single sign-up slot cell. Claimable = open, or your own.
function RotationSlotCell({ slot, userId, onClick }: {
  slot: RotationSlot; userId: string; onClick: () => void
}) {
  const [hover, setHover] = useState(false)
  const isOpen = !slot.assigned_to
  const isMine = slot.assigned_to === userId
  const claimable = isOpen || isMine

  const border = isMine
    ? "1px solid var(--plum)"
    : isOpen
    ? "1px dashed var(--dashed)"
    : "1px solid var(--line-2)"
  const bg = isMine ? "var(--cream-3)" : isOpen ? "var(--cream-2)" : "var(--cream)"

  return (
    <button
      onClick={claimable ? onClick : undefined}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      disabled={!claimable}
      style={{
        display: "flex", alignItems: "center", gap: 10, width: "100%", textAlign: "left",
        padding: "11px 14px", borderRadius: 11, background: bg,
        border: claimable && hover && !isMine ? "1px solid var(--dashed)" : border,
        cursor: claimable ? "pointer" : "default",
        transition: "border-color 150ms, background-color 150ms",
      }}
    >
      {/* date */}
      <div style={{ display: "flex", flexDirection: "column", gap: 1, flexShrink: 0 }}>
        <span style={{ fontFamily: "var(--mono)", fontSize: 10, fontWeight: 600, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--muted-text)" }}>{shortDow(slot.week_date)}</span>
        <span style={{ fontFamily: "var(--sans)", fontSize: 13.5, fontWeight: 500, color: "var(--ink)" }}>{shortMonthDay(slot.week_date)}</span>
      </div>
      {/* status */}
      <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 7, minWidth: 0 }}>
        {isOpen ? (
          <span style={{ display: "inline-flex", alignItems: "center", gap: 5, fontFamily: "var(--sans)", fontSize: 12.5, fontWeight: 500, color: "var(--plum)" }}>
            <PlusCircle className="w-4 h-4" /> Open
          </span>
        ) : isMine ? (
          <>
            <RotationAvatar name="You" mine />
            <span style={{ fontFamily: "var(--sans)", fontSize: 12.5, fontWeight: 500, color: "var(--plum)" }}>You</span>
          </>
        ) : (
          <>
            <RotationAvatar name={slot.assigned_name ?? "?"} mine={false} />
            <span style={{ fontFamily: "var(--sans)", fontSize: 12.5, fontWeight: 500, color: "var(--body)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{slot.assigned_name ?? "Assigned"}</span>
          </>
        )}
      </div>
    </button>
  )
}

// New-semester creation modal — name, dates, and a per-rotation run/weekday picker.
function NewSemesterModal({ onClose, onCreate }: {
  onClose: () => void
  onCreate: (name: string, start: string, end: string, configs: { type: CCSFRotationType; enabled: boolean; weekday: number }[]) => Promise<void>
}) {
  const [name, setName] = useState("")
  const [start, setStart] = useState("")
  const [end, setEnd] = useState("")
  const [configs, setConfigs] = useState<{ type: CCSFRotationType; enabled: boolean; weekday: number }[]>(
    ROTATION_TYPES.map(rt => ({ type: rt.type, enabled: true, weekday: 0 }))
  )
  const [busy, setBusy] = useState(false)

  const anyRotation = configs.some(c => c.enabled)
  const validDates = start !== "" && end !== "" && start <= end
  const canCreate = name.trim() !== "" && validDates && anyRotation && !busy

  async function submit() {
    if (!canCreate) return
    setBusy(true)
    await onCreate(name.trim(), start, end, configs)
    setBusy(false)
  }

  const labelStyle: React.CSSProperties = { fontFamily: "var(--mono)", fontSize: 10.5, letterSpacing: "0.07em", textTransform: "uppercase", color: "var(--muted-text)" }

  return (
    <CentralModal
      onClose={() => { if (!busy) onClose() }}
      eyebrow="Rotations"
      title="New semester"
      maxWidth={520}
      footer={
        <>
          <CentralButton variant="quiet" size="sm" onClick={() => { if (!busy) onClose() }} disabled={busy}>Cancel</CentralButton>
          <CentralButton variant="primary" size="sm" onClick={submit} disabled={!canCreate}>
            {busy ? "Creating…" : "Create"}
          </CentralButton>
        </>
      }
    >
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <FormField label="Semester name">
            <Input value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Fall 2026" />
          </FormField>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }} className="max-md:!grid-cols-1">
            <FormField label="Starts">
              <Input type="date" value={start} onChange={e => setStart(e.target.value)} />
            </FormField>
            <FormField label="Ends">
              <Input type="date" value={end} onChange={e => setEnd(e.target.value)} />
            </FormField>
          </div>
          {!validDates && start !== "" && end !== "" && (
            <p style={{ fontFamily: "var(--sans)", fontSize: 12, color: "var(--danger)", margin: 0 }}>End date must be on or after the start date.</p>
          )}

          {/* rotation picker */}
          <div>
            <span style={labelStyle}>Rotations</span>
            <div style={{ marginTop: 9, display: "flex", flexDirection: "column", gap: 8 }}>
              {configs.map((cfg, i) => {
                const label = ROTATION_TYPES.find(r => r.type === cfg.type)?.label ?? ""
                return (
                  <div key={cfg.type} style={{ display: "flex", alignItems: "center", gap: 12, padding: "11px 14px", background: cfg.enabled ? "var(--cream-2)" : "var(--cream-panel)", border: "1px solid var(--line-2)", borderRadius: 11 }}>
                    <button
                      onClick={() => setConfigs(prev => prev.map((c, j) => j === i ? { ...c, enabled: !c.enabled } : c))}
                      style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", width: 20, height: 20, borderRadius: 6, flexShrink: 0, cursor: "pointer", background: cfg.enabled ? "var(--plum)" : "transparent", border: cfg.enabled ? "1px solid var(--plum)" : "1px solid var(--line-2)", color: "var(--cream-on-dark)" }}
                    >
                      {cfg.enabled && <Check className="w-3 h-3" />}
                    </button>
                    <span style={{ flex: 1, fontFamily: "var(--sans)", fontSize: 14, fontWeight: 500, color: cfg.enabled ? "var(--ink)" : "var(--muted-text)", minWidth: 0 }}>{label}</span>
                    <select
                      value={cfg.weekday}
                      disabled={!cfg.enabled}
                      onChange={e => setConfigs(prev => prev.map((c, j) => j === i ? { ...c, weekday: Number(e.target.value) } : c))}
                      style={{ fontFamily: "var(--sans)", fontSize: 13, color: cfg.enabled ? "var(--ink)" : "var(--muted-text)", background: "var(--cream)", border: "1px solid var(--line-2)", borderRadius: 8, padding: "6px 8px", cursor: cfg.enabled ? "pointer" : "default", outline: "none" }}
                    >
                      {WEEKDAY_LONG.map((w, wi) => <option key={wi} value={wi}>{w}</option>)}
                    </select>
                  </div>
                )
              })}
            </div>
          </div>
        </div>
    </CentralModal>
  )
}

// ── Workspace picker primitives ─────────────────────────────────────────────
// Initials for a team monogram: first letters of the first two words, uppercase;
// one-word names → first two letters (e.g. "Finance Team"→"FT", "Receipts"→"RE").
function teamInitials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean)
  if (words.length === 0) return "?"
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase()
  return (words[0][0] + words[1][0]).toUpperCase()
}

// Adaptive column count for a picker section — avoids skinny cards / lone orphans.
function wsCols(n: number): 2 | 3 {
  return (n <= 2 || n === 4) ? 2 : 3
}

// Role badge pill (§4.7 tokens). tone: lead | member | admin.
function WsBadge({ tone, label }: { tone: "lead" | "member" | "admin"; label: string }) {
  const toneStyle =
    tone === "admin"
      ? { background: "var(--plum-2)", color: "var(--cream)", border: "1px solid transparent" }
      : tone === "lead"
      ? { background: "var(--ivory)", color: "var(--plum)", border: "1px solid var(--line-2)" }
      : { background: "var(--ivory)", color: "var(--muted-text)", border: "1px solid var(--line-2)" }
  return (
    <span style={{ ...toneStyle, borderRadius: 999, padding: "4px 10px", fontSize: 11, fontWeight: 500, fontFamily: "var(--sans)", whiteSpace: "nowrap", flexShrink: 0 }}>
      {label}
    </span>
  )
}

// Carried-forward "Needs a president" indicator — identical styling to the prior
// picker pill; shown in the badge slot in place of the role badge.
function NeedsPresidentPill() {
  return (
    <span style={{ fontFamily: "var(--mono)", fontSize: 9, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--muted-text)", border: "1px solid var(--line)", borderRadius: 999, padding: "2px 7px", whiteSpace: "nowrap", flexShrink: 0 }}>
      Needs a president
    </span>
  )
}

// A workspace tile: monogram + badge toprow, name + optional sub at the bottom.
function WsTile({ initials, badge, name, sub, onClick }: {
  initials: string
  badge: ReactNode
  name: string
  sub?: string
  onClick: () => void
}) {
  const [hover, setHover] = useState(false)
  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        display: "flex", flexDirection: "column", gap: 14, textAlign: "left",
        background: hover ? "var(--cream)" : "var(--cream-2)",
        border: `1px solid ${hover ? "var(--plum)" : "var(--line-2)"}`,
        borderRadius: "var(--r-card)", padding: 18, minHeight: 128, cursor: "pointer",
        transform: hover ? "translateY(-2px)" : "translateY(0)",
        transition: "border-color var(--dur-fast), background var(--dur-fast), transform var(--dur-fast)",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
        <MonogramChip initials={initials} style={{ width: 38, height: 38, fontSize: 14, fontWeight: 600 }} />
        {badge}
      </div>
      <div style={{ marginTop: "auto", minWidth: 0 }}>
        <p style={{ fontFamily: "var(--sans)", fontSize: 16, fontWeight: 500, color: "var(--ink)", letterSpacing: "-0.01em", margin: 0, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
          {name}
        </p>
        {sub && <p style={{ fontSize: 12, color: "var(--muted-text)", margin: "2px 0 0" }}>{sub}</p>}
      </div>
    </button>
  )
}

// Dashed "Add workspace" tile (admin only) — last in the Your-workspaces grid.
function WsAddTile({ onClick }: { onClick: () => void }) {
  const [hover, setHover] = useState(false)
  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        display: "flex", flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8,
        background: "transparent",
        border: `1px dashed ${hover ? "var(--plum)" : "var(--dashed)"}`,
        borderRadius: "var(--r-card)", padding: 18, minHeight: 128, cursor: "pointer",
        color: hover ? "var(--plum)" : "var(--body)",
        transition: "border-color var(--dur-fast), color var(--dur-fast)",
      }}
    >
      <Plus style={{ width: 16, height: 16 }} strokeWidth={2.2} />
      <span style={{ fontFamily: "var(--sans)", fontSize: 14, fontWeight: 500 }}>Add workspace</span>
    </button>
  )
}

export function PlanTab({
  userId, userName, ministryId, ministryName, userTeams, allTeams, isAdmin, isGovernanceAdmin, governanceSettings, isDGL, isPastor,
  onTeamsChange, showCreateTeam, onShowCreateTeam, activeTeamId, onOpenChat,
  onTeamSelect,
  studentOrgSection, onStudentOrgSectionChange, studentOrgPlanningEvent, onStudentOrgPlanningEventChange, onStudentOrgCalEventsChange,
  sglSection, onSglSectionChange,
  financeSection: financeSectionProp, onFinanceSectionChange,
  activeReceiptsTeamId, onReceiptsTeamChange,
  closeSubpageSignal,
}: PlanTabProps) {
  // Resolve from membership first, then from allTeams (a governance admin may be
  // viewing a team they don't belong to), then the ministry-name fallback.
  const activeTeamName = userTeams.find(t => t.teamId === activeTeamId)?.teamName
    ?? allTeams.find(t => t.id === activeTeamId)?.name
    ?? (isAdmin ? ministryName : "Plan")
  const setShowCreateTeam = onShowCreateTeam
  const supabase = createClient()
  // A subpage is open somewhere in the content area when it has pushed breadcrumb
  // crumbs. §4.18: the subpage consumes the page header, so suppress the team
  // TabPageHeader while one is active (e.g. the finance reimbursement detail).
  const subpageActive = useBreadcrumbExtra().length > 0
  const [openTeam, setOpenTeam] = useState<Team | null>(null)
  const [showEditEvent, setShowEditEvent] = useState(false)
  // Finance section is lifted to home-app (drives the sidebar nav on desktop) and synced to ?fsec.
  const financeSection = (financeSectionProp ?? "reimbursements") as FinanceSection
  const setFinanceSection = (s: FinanceSection) => onFinanceSectionChange?.(s)
  const [studentOrgRefreshSignal, setStudentOrgRefreshSignal] = useState(0)
  const [teamEventCounts, setTeamEventCounts] = useState<Record<string, number>>({})

  // Fetch upcoming event counts per team — only runs when the picker is visible (no team selected)
  useEffect(() => {
    if (activeTeamId || userTeams.length === 0) return
    const teamIds = userTeams.map(t => t.teamId)
    const now = new Date().toISOString()
    supabase
      .from("calendar_events")
      .select("team_id")
      .eq("ministry_id", ministryId)
      .in("team_id", teamIds)
      .gte("start_date", now)
      .then(({ data }) => {
        const counts: Record<string, number> = {}
        for (const ev of (data ?? []) as { team_id: string }[]) {
          counts[ev.team_id] = (counts[ev.team_id] ?? 0) + 1
        }
        setTeamEventCounts(counts)
      })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTeamId, userTeams.length, ministryId])

  function getPickerSectionCount(team: UserTeam): number {
    const name = team.teamName.toLowerCase()
    const perms = team.permissions
    if (/\b(student org|board|leadership|officer)\b/.test(name) ||
        perms.some(p => ["can_plan_events", "can_view_finances", "can_manage_members"].includes(p))) return 5
    if (/\b(praise|worship)\b/.test(name) ||
        perms.some(p => ["can_manage_worship_set", "can_view_worship_set", "can_generate_slides", "can_manage_schedule"].includes(p))) return 3
    if (/\b(dgl|small group|discipleship|sg)\b/.test(name) ||
        perms.some(p => ["can_create_dgs", "can_view_dgs"].includes(p))) return 3
    return 3
  }

  // Team settings overlay is ephemeral plain state — never in the URL. A reload
  // while it's open drops back to the team workspace (Phase 2).
  function openSettings(team: Team) {
    setOpenTeam(team)
  }

  function closeSettings() {
    setOpenTeam(null)
  }

  // Build a minimal Team object from a UserTeam (matches the auto-open fallback shape).
  function userTeamToTeam(t: UserTeam): Team {
    return {
      id: t.teamId, name: t.teamName, icon: t.teamIcon, description: t.teamDescription,
      created_by: "", member_count: 0, team_type: t.teamType,
      allow_co_presidency: t.allowCoPresidency, admin_access: "view",
      allow_admin_members: t.allowAdminMembers, hasPresident: t.hasPresident,
    }
  }

  // Clicking a workspace card: a governance admin on a presidentless workspace is
  // routed to settings to assign one; everyone else enters the workspace normally.
  // Gated on isGovernanceAdmin (not bare isAdmin) so a non-roster admin isn't sent
  // to a settings page they can't configure under Full-gov RLS.
  function handleWorkspaceCardClick(team: Team) {
    if (isGovernanceAdmin && team.hasPresident === false) { openSettings(team); return }
    onTeamSelect?.(team.id)
  }

  // Receipts is a team like any other (unifying formality): its settings page is
  // the active Receipts team's TeamDetailOverlay (members + president). Manage
  // parity with auth_can_manage_team: the receipts team's president, OR a
  // governance admin the team's matrix grants WRITE (gov-view is not enough — the
  // overlay would open read-only, so we don't surface the affordance for it).
  const activeReceiptsUserTeam = userTeams.find(t => t.teamId === activeReceiptsTeamId)
  const activeReceiptsTeamFull = allTeams.find(t => t.id === activeReceiptsTeamId)
  const receiptsGovWrite = isGovernanceAdmin && activeReceiptsTeamFull?.admin_access === "write"
  const canManageReceiptsTeam = !!activeReceiptsTeamId && ((activeReceiptsUserTeam?.isPresident ?? false) || receiptsGovWrite)
  function openActiveReceiptsTeamSettings() {
    if (!activeReceiptsTeamId) return
    const full = allTeams.find(t => t.id === activeReceiptsTeamId)
      ?? (activeReceiptsUserTeam ? userTeamToTeam(activeReceiptsUserTeam) : null)
    if (full) openSettings(full)
  }

  // Reset internal component state when the user switches to a different team.
  // The sub-page URL params are cleared by home-app's handleTeamChange (one atomic
  // replace, set team + clear sub-params); this effect only does non-URL bookkeeping.
  const teamSwitchRef = useRef(false)
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => {
    if (!teamSwitchRef.current) { teamSwitchRef.current = true; return }
    setOpenTeam(null)
    onStudentOrgPlanningEventChange?.(null)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTeamId])

  // Close the team-settings subpage when the user clicks a workspace section-nav item
  // (finance/student-org/DGL section, or a receipts team). The section state lives in
  // home-app, which can't reach this local `openTeam` — so it bumps `closeSubpageSignal`
  // on every such click and we drop the subpage here. Skip the initial mount so opening
  // the workspace (or a remount) doesn't immediately close a freshly-opened subpage.
  const closeSignalRef = useRef(false)
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => {
    if (!closeSignalRef.current) { closeSignalRef.current = true; return }
    setOpenTeam(null)
  }, [closeSubpageSignal])

  const hasAnyPlanning = isAdmin || userTeams.length > 0

  const monoStyle: React.CSSProperties = EYEBROW_STYLE

  const activeUserTeam = userTeams.find(t => t.teamId === activeTeamId)
  const activeTeamPerms = activeUserTeam?.permissions ?? []

  // The active team object — from membership if a member, else from allTeams
  // (a governance admin entering a team they don't belong to).
  const activeTeamFull = allTeams.find(t => t.id === activeTeamId)
    ?? (activeUserTeam ? { id: activeUserTeam.teamId, name: activeUserTeam.teamName, icon: activeUserTeam.teamIcon, description: activeUserTeam.teamDescription, created_by: "", member_count: 0, team_type: activeUserTeam.teamType, allow_co_presidency: activeUserTeam.allowCoPresidency, admin_access: 'view', allow_admin_members: activeUserTeam.allowAdminMembers } : undefined)

  // Effective access this user has to the active team. Member → full domain
  // access. Non-member governance admin → gov-write / gov-view per the matrix.
  const activeTeamAccess: TeamAccess = teamAccessLevel({
    isMember: !!activeUserTeam,
    isGovernanceAdmin,
    adminAccess: activeTeamFull?.admin_access ?? "view",
  })
  const govWrite = activeTeamAccess === "gov-write"
  const govView = activeTeamAccess === "gov-view"
  // Deep-link gate: a team workspace only renders when the caller has SOME
  // access to it (member, gov-write, or gov-view) — `?team=<id>` alone must not
  // mount a workspace the user can't see. Mirrors the finance branch's
  // financeCanAccess gate.
  const activeTeamAllowed = activeTeamAccess !== "none"

  // Single classifier — team_type + name only, no permission probes. See
  // app/home/team-type.ts for precedence and rationale. This is the only thing
  // that decides which workspace renders for the active team.
  const teamKind = classifyTeam(activeTeamFull)

  // Finance write = member with can_view_finances OR governance-write. Read-only under gov-view.
  const financeCanEdit = activeTeamPerms.includes("can_view_finances") || govWrite
  const financeCanAccess = financeCanEdit || govView
  const financeStripTabs: { key: string; label: string }[] = [
    { key: "reimbursements", label: "Reimbursements" },
    { key: "budget", label: "Budget" },
    { key: "allocation", label: "Allocation" },
  ]

  const studentOrgRole = (teamKind === "studentOrg" ? activeUserTeam?.roleName : undefined) ?? ""
  const canEditStudentOrg = activeTeamPerms.includes("can_plan_events") || govWrite

  const praiseTeamPerms = teamKind === "praise" ? activeTeamPerms : []
  const canManageWorship = praiseTeamPerms.includes("can_manage_worship_set") || govWrite
  const canManageSchedule = praiseTeamPerms.includes("can_manage_schedule") || govWrite

  const isActiveTeamPresident = activeUserTeam?.isPresident ?? false
  // Structural gate: a team president may open settings; a governance admin may
  // open settings only when the team grants them view or write (matrix ≠ none).
  const canOpenTeamSettings = isActiveTeamPresident || activeTeamAccess === "gov-view" || activeTeamAccess === "gov-write"

  const isDGLPresident = teamKind === "dgl" && (isActiveTeamPresident || govWrite)

  // Governance-accessible teams: ministry teams the user is NOT a member of but
  // may enter as a governing admin (matrix grants view or write). Empty for
  // non-governance users (teamAccessLevel returns "none"). Shown in the picker
  // as a separate "Admin access" group; selecting one enters its CONTENT view.
  const memberTeamIds = new Set(userTeams.map(t => t.teamId))
  const govTeams = allTeams.filter(t => {
    if (memberTeamIds.has(t.id)) return false
    const access = teamAccessLevel({ isMember: false, isGovernanceAdmin, adminAccess: t.admin_access })
    return access === "gov-view" || access === "gov-write"
  })

  // Teams shown in the Receipts workspace: teams the user is a member of OR governs.
  const receiptsTeams: ReceiptsTeamRef[] = [
    ...userTeams.map(t => ({ id: t.teamId, name: t.teamName })),
    ...govTeams.map(t => ({ id: t.id, name: t.name })),
  ]

  // Team-settings subpage — rendered IN-CONTENT (not a portal) via SubpageShell.
  // Mounted once per viewport (desktop section swaps the team body for it; mobile
  // area wraps it in md:hidden), mirroring the file's existing double-mount pattern.
  const teamSettingsEl = openTeam ? (
    <TeamDetailOverlay
      team={openTeam}
      userId={userId}
      ministryId={ministryId}
      isAdmin={isAdmin}
      // Gov-WRITE to THIS team (matrix = 'write'), mirroring the RLS
      // auth_can_manage_team: gov-view admins get a read-only settings view.
      govWrite={isGovernanceAdmin && openTeam.admin_access === "write"}
      onClose={closeSettings}
      onChanged={() => { closeSettings(); onTeamsChange() }}
      onOpenChat={onOpenChat}
    />
  ) : null

  // Add-workspace is an in-content subpage (SubpageShell), not a portal/modal. The
  // same element description is rendered in the desktop picker swap and the mobile
  // content swap — each viewport section mounts its own instance (the established
  // twice-rendered pattern), and the shell breadcrumb / mobile back row is the back.
  const addWorkspaceModal = (
    <AddWorkspaceModal
      ministryId={ministryId}
      userId={userId}
      ownedKeys={ownedPresetKeys([...userTeams.map(t => ({ team_type: t.teamType, name: t.teamName })), ...allTeams.map(t => ({ team_type: t.team_type, name: t.name }))])}
      onClose={() => setShowCreateTeam(false)}
      onCreated={(team) => {
        setShowCreateTeam(false)
        onTeamsChange()
        // Open the new (empty) workspace's settings so the admin assigns a president.
        // admin_access matches the 'write' the team was just inserted with, so the
        // overlay computes govWrite=true and opens in manageable (not read-only) mode.
        openSettings({ id: team.id, name: team.name, icon: team.icon, description: "", created_by: "", member_count: 0, team_type: team.team_type as Team["team_type"], allow_co_presidency: false, admin_access: "write", allow_admin_members: false, hasPresident: false })
      }}
    />
  )

  return (
    <div className="pb-2 md:pb-0 md:flex md:flex-col md:h-full md:overflow-hidden">
      {/* Mobile Header */}
      <div className="flex items-center justify-between px-5 pt-14 pb-5 md:hidden">
        <div className="flex items-center gap-2.5">
          <svg width="26" height="26" viewBox="0 0 100 100" fill="none">
            <path d="M70 28 A32 32 0 1 0 70 72" stroke="var(--plum)" strokeWidth="8" strokeLinecap="round" />
            <circle cx="50" cy="50" r="6" fill="var(--plum)" />
          </svg>
          <span style={{ fontFamily: "var(--font-instrument-serif)", fontSize: "28px", color: "var(--ink)", letterSpacing: "-0.01em", lineHeight: 1 }}>{ministryName}</span>
        </div>
        {isGovernanceAdmin && (
          <button onClick={() => setShowCreateTeam(true)} className="size-9 bg-[var(--plum)] rounded-xl flex items-center justify-center hover:bg-[var(--plum-2)] transition-colors">
            <Plus className="w-4 h-4 text-[var(--cream-on-dark)]" />
          </button>
        )}
      </div>

      {/* Mobile title */}
      <div className="flex items-end justify-between px-5 mb-5 md:hidden">
        <h1 style={{ fontFamily: "var(--font-instrument-serif)", fontSize: "36px", fontWeight: 400, letterSpacing: "-0.02em", color: "var(--ink)", lineHeight: 1.05, margin: 0 }}>Plan</h1>
      </div>

      {/* Edit planning event modal */}
      {showEditEvent && studentOrgPlanningEvent && (
        <AddEventModal
          ministryId={ministryId}
          teamId={null}
          userId={userId}
          existing={studentOrgPlanningEvent}
          onClose={() => setShowEditEvent(false)}
          onSaved={(updated) => {
            onStudentOrgPlanningEventChange?.(updated)
            // Bump the refresh signal so EventPlanWorkspace re-fetches the plan's
            // plan_start_date / crunch_date after the modal writes them.
            setStudentOrgRefreshSignal(s => s + 1)
            setShowEditEvent(false)
          }}
          onDelete={() => {
            setShowEditEvent(false)
            onStudentOrgPlanningEventChange?.(null)
            setStudentOrgRefreshSignal(s => s + 1)
          }}
        />
      )}

      {/* Desktop section — shell pattern */}
      <div className="hidden md:flex md:flex-col md:flex-1 md:overflow-hidden" style={{ background: "var(--cream)" }}>
        {/* Page header — hidden for student org board, DGL team (both use section-level headers),
            the no-team picker screen, the Receipts sentinel (ReceiptsWorkspace owns its own header),
            and whenever a subpage is open (§4.18: the subpage consumes the page header). */}
        {activeTeamId && activeTeamId !== "receipts" && teamKind !== "studentOrg" && teamKind !== "dgl" && !subpageActive && !openTeam && (
          <TabPageHeader>
            {/* Compact workspace header (DESIGN_SYSTEM §3.1): 25px title, no eyebrow.
                Shared by every non-section workspace kind (praise, finance, etc.). */}
            <PageTitle
              title={activeTeamName}
              compact
            />
            {activeTeamFull && canOpenTeamSettings && (
              <IconButton dim={32} onClick={() => openSettings(activeTeamFull)} title="Team settings" className="ml-auto">
                <Settings className="w-4 h-4" />
              </IconButton>
            )}
          </TabPageHeader>
        )}

        {/* Team settings subpage swaps the whole team body (mirrors the event page). */}
        {openTeam ? teamSettingsEl : (
        <>
        {/* Scrollable team content */}
        <div className="flex-1 overflow-y-auto">
        {activeTeamId && activeTeamId !== "receipts" && govView && (
          <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 56px", background: "var(--ivory)", borderBottom: "1px solid var(--line)" }}>
            <Eye style={{ width: 13, height: 13, color: "var(--muted-text)", flexShrink: 0 }} />
            <span style={{ fontFamily: "var(--mono)", fontSize: 11, letterSpacing: "0.06em", textTransform: "uppercase", color: "var(--muted-text)", fontWeight: 500 }}>
              Viewing as admin · read-only
            </span>
          </div>
        )}
        {/* Receipt submission now lives exclusively in the Receipts workspace
            (sidebar → Receipts), filed under a team's receipt category. The old
            per-team-workspace "Submit receipt" affordance was removed in B2. */}
        {!activeTeamId ? (
          /* Add-workspace subpage swaps IN PLACE of the picker tiles (content swap,
             §4.18) — the SubpageShell owns the header + breadcrumb back. */
          showCreateTeam ? (
            addWorkspaceModal
          ) :
          /* ── Three-way branch: 0 teams → empty state | 2+ teams (or any
             governance-accessible team) → picker
             (1-team case auto-entered in home-app before this renders) ── */
          (userTeams.length >= 2 || govTeams.length > 0) ? (
            /* PICKER — full-width, no sidebar */
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", padding: "44px 48px 64px" }}>
              <div style={{ width: "100%", maxWidth: 760 }}>
                {/* Header */}
                <p style={{ fontFamily: "var(--mono)", fontSize: 11, letterSpacing: "1.4px", textTransform: "uppercase", color: "var(--muted-text)", margin: "0 0 14px", textAlign: "center" }}>
                  WORKSPACE · {ministryName.toUpperCase()}
                </p>
                <h1 style={{ fontFamily: "var(--serif)", fontSize: 36, fontWeight: 600, color: "var(--ink)", letterSpacing: "-0.02em", lineHeight: 1.05, margin: "0 0 10px", textAlign: "center" }}>
                  Which workspace are you entering?
                </h1>
                <p style={{ fontSize: 15, color: "var(--body)", margin: "0 0 32px", lineHeight: 1.6, textAlign: "center" }}>
                  Pick a workspace to enter.
                </p>

                {/* ── Your workspaces: member teams + Receipts + (Add, admin only) ── */}
                {(() => {
                  const n = userTeams.length + 1 + (isAdmin ? 1 : 0)
                  const cols = wsCols(n)
                  return (
                    <>
                      <p style={{ fontFamily: "var(--mono)", fontSize: 11, letterSpacing: "1.4px", textTransform: "uppercase", color: "var(--muted-text)", margin: "0 0 12px" }}>
                        Your workspaces · {n}
                      </p>
                      <div style={{ display: "grid", gridTemplateColumns: cols === 2 ? "repeat(2, 264px)" : "repeat(3, 212px)", gap: 14, justifyContent: "center" }}>
                        {userTeams.map(t => {
                          const isLead = t.isPresident || !/^member$/i.test(t.roleName.trim())
                          const badge = t.hasPresident === false
                            ? <NeedsPresidentPill />
                            : <WsBadge tone={isLead ? "lead" : "member"} label={t.isPresident ? "President" : (isLead ? t.roleName : "Member")} />
                          const sub = t.memberCount != null ? `${t.memberCount} member${t.memberCount === 1 ? "" : "s"}` : undefined
                          return (
                            <WsTile
                              key={t.teamId}
                              initials={teamInitials(t.teamName)}
                              badge={badge}
                              name={t.teamName}
                              sub={sub}
                              onClick={() => handleWorkspaceCardClick(userTeamToTeam(t))}
                            />
                          )
                        })}
                        {/* Receipts — a shared surface across your teams (not a team itself),
                            so its subtitle counts the teams you can file receipts for. */}
                        <WsTile
                          initials="RE"
                          badge={<WsBadge tone="member" label="Member" />}
                          name="Receipts"
                          sub={`${receiptsTeams.length} team${receiptsTeams.length === 1 ? "" : "s"}`}
                          onClick={() => onTeamSelect?.("receipts")}
                        />
                        {isGovernanceAdmin && <WsAddTile onClick={() => setShowCreateTeam(true)} />}
                      </div>
                    </>
                  )
                })()}

                {/* ── Admin access (governance, view-only) ── */}
                {govTeams.length > 0 && (() => {
                  const cols = wsCols(govTeams.length)
                  return (
                    <>
                      <p style={{ fontFamily: "var(--mono)", fontSize: 11, letterSpacing: "1.4px", textTransform: "uppercase", color: "var(--muted-text)", margin: "28px 0 12px" }}>
                        Admin access · view only · {govTeams.length}
                      </p>
                      <div style={{ display: "grid", gridTemplateColumns: cols === 2 ? "repeat(2, 264px)" : "repeat(3, 212px)", gap: 14, justifyContent: "center" }}>
                        {govTeams.map(t => {
                          const canWrite = t.admin_access === "write"
                          const badge = t.hasPresident === false
                            ? <NeedsPresidentPill />
                            : <WsBadge tone="admin" label={canWrite ? "Admin · can edit" : "Admin · view only"} />
                          const sub = `${t.member_count} member${t.member_count === 1 ? "" : "s"}`
                          return (
                            <WsTile
                              key={t.id}
                              initials={teamInitials(t.name)}
                              badge={badge}
                              name={t.name}
                              sub={sub}
                              onClick={() => handleWorkspaceCardClick(t)}
                            />
                          )
                        })}
                      </div>
                    </>
                  )
                })()}
              </div>
            </div>
          ) : (
            /* EMPTY STATE — strictly 0 teams */
            <div className="px-14 py-7">
              <div className="flex flex-col items-center justify-center py-24 text-center">
                <div style={{ ...MONO_STYLE, marginBottom: 12 }}>
                  {isAdmin ? "YOUR TEAMS · 0" : "NO TEAM YET"}
                </div>
                <h2 style={{ fontFamily: "var(--font-instrument-serif)", fontSize: 40, fontWeight: 400, color: "var(--ink)", letterSpacing: "-0.02em", margin: "0 0 12px" }}>
                  {isAdmin ? "Add your first workspace." : "You're not on a team yet."}
                </h2>
                <p style={{ fontSize: 14, color: "var(--body)", maxWidth: 380, lineHeight: 1.6, margin: "0 0 28px" }}>
                  {isAdmin
                    ? "Workspaces keep your ministry organized — Small Group Leaders, Student Org Board, Finance, and more."
                    : "Ask a leader to add you to a team."}
                </p>
                {isGovernanceAdmin && (
                  <CentralButton
                    variant="primary" size="md"
                    onClick={() => setShowCreateTeam(true)}
                  >
                    <Plus style={{ width: 14, height: 14 }} /> Add a workspace
                  </CentralButton>
                )}
              </div>
            </div>
          )
        ) : activeTeamId === "receipts" ? (
          <ReceiptsWorkspace
            ministryId={ministryId}
            userId={userId}
            userName={userName}
            teams={receiptsTeams}
            activeReceiptsTeamId={activeReceiptsTeamId ?? null}
            onReceiptsTeamChange={(id) => onReceiptsTeamChange?.(id)}
            onOpenTeamSettings={canManageReceiptsTeam ? openActiveReceiptsTeamSettings : undefined}
          />
        ) : teamKind === "finance" && activeTeamId && financeCanAccess ? (
          /* Desktop: section nav lives in the sidebar (FinanceSectionNav) — no content strip here.
             Mounted BARE (no px wrapper): FinanceWorkspace owns its own inset internally so its
             reimbursement-detail SubpageShell stays full-bleed (single inset). */
          <FinanceWorkspace
            ministryId={ministryId}
            userId={userId}
            userName={userName}
            userRole={activeUserTeam?.roleName ?? ""}
            section={financeSection}
            onSectionChange={setFinanceSection}
            canEditBudget={financeCanEdit}
            canAccessReimbursements={financeCanEdit}
            readOnly={govView}
          />
        ) : teamKind === "dgPraise" && activeTeamId && activeTeamAllowed ? (
          <div className="px-14 py-7">
            <DgPraiseTeamTab
              teamId={activeTeamId}
              ministryId={ministryId}
              userId={userId}
              canManage={canManageWorship}
            />
          </div>
        ) : teamKind === "oneTime" && activeTeamId && activeTeamAllowed ? (
          <div className="px-14 py-7">
            <OneTimeTeamTab
              teamId={activeTeamId}
              ministryId={ministryId}
              userId={userId}
              canManage={canManageWorship}
            />
          </div>
        ) : teamKind === "tech" && activeTeamAllowed ? (
          <div className="px-14 py-7">
            <TechTeamTab ministryId={ministryId} userId={userId} canManage={canManageWorship} />
          </div>
        ) : teamKind === "praise" && activeTeamId && activeTeamAllowed ? (
          <PraiseTeamTab
            teamId={activeTeamId}
            ministryId={ministryId}
            userId={userId}
            canManage={canManageWorship}
            canManageSchedule={canManageSchedule}
          />
        ) : teamKind === "studentOrg" && activeTeamAllowed ? (
          <StudentOrgTeamHome
              teamId={activeTeamId}
              teamName={activeTeamName}
              teamIcon={activeUserTeam?.teamIcon ?? activeTeamFull?.icon ?? "🏛️"}
              ministryId={ministryId}
              userId={userId}
              userName={userName}
              userRole={studentOrgRole}
              canEdit={canEditStudentOrg}
              canEditBudget={activeTeamPerms.includes("can_view_finances") || govWrite}
              onTeamSettings={activeTeamFull && canOpenTeamSettings ? () => openSettings(activeTeamFull) : undefined}
              planningEvent={studentOrgPlanningEvent ?? null}
              onPlanningEventChange={ev => onStudentOrgPlanningEventChange?.(ev)}
              refreshSignal={studentOrgRefreshSignal}
              onOpenChat={onOpenChat}
              isDesktopView
              desktopSection={studentOrgSection ?? "Events"}
              onCalEventsChange={evs => onStudentOrgCalEventsChange?.(evs)}
              onEditEvent={() => setShowEditEvent(true)}
            />
        ) : teamKind === "dgl" && activeTeamId && activeTeamAllowed ? (
          <SmallGroupLeadersTab
              teamId={activeTeamId}
              ministryId={ministryId}
              userId={userId}
              isPresident={isDGLPresident}
              isPastor={isPastor}
              onOpenChat={onOpenChat}
              onTeamSettings={activeTeamFull && canOpenTeamSettings ? () => openSettings(activeTeamFull) : undefined}
              isDesktopView
              desktopSection={sglSection ?? "bible_study"}
              praiseTeamId={
                allTeams.find(t =>
                  /\b(praise|worship)\b/i.test(t.name) ||
                  userTeams.find(ut => ut.teamId === t.id)?.permissions.some(p =>
                    ["can_manage_worship_set","can_view_worship_set","can_manage_schedule"].includes(p)
                  )
                )?.id ?? null
              }
            />
        ) : (() => {
          /* Fallback: team selected but not a recognized special type → ministry calendar */
          const perms = activeUserTeam?.permissions ?? []
          // Visible to members who can view/plan, or any governance access (view/write).
          // Edit comes from member perm or governance-write — never raw admin.
          if (!perms.includes("can_plan_events") && !govWrite && !govView) return null
          return (
            <MinistryCalendar
              ministryId={ministryId}
              teamId={activeTeamId}
              teamName={activeTeamName}
              userId={userId}
              canEdit={perms.includes("can_plan_events") || govWrite}
              onOpenChat={onOpenChat}
            />
          )
        })()}
      </div>
        </>
        )}
      </div>

      {/* Mobile content. Receipts + Finance render FULL-BLEED (no px-5 wrapper) so their
          detail SubpageShell is the only horizontal inset; each supplies its own inset
          internally. Every other team kind keeps the shared px-5 wrapper. */}
      {openTeam ? (
        <div className="md:hidden">{teamSettingsEl}</div>
      ) : showCreateTeam ? (
        /* Add-workspace subpage (SubpageShell) — overrides mobile content; its own
           md:hidden back row is the back. Mobile has no shell breadcrumb. */
        <div className="md:hidden">{addWorkspaceModal}</div>
      ) : activeTeamId === "receipts" ? (
        <div className="md:hidden pb-4">
          <ReceiptsWorkspace
            ministryId={ministryId}
            userId={userId}
            userName={userName}
            teams={receiptsTeams}
            activeReceiptsTeamId={activeReceiptsTeamId ?? null}
            onReceiptsTeamChange={(id) => onReceiptsTeamChange?.(id)}
            onOpenTeamSettings={canManageReceiptsTeam ? openActiveReceiptsTeamSettings : undefined}
          />
        </div>
      ) : teamKind === "finance" && activeTeamId && financeCanAccess ? (
        <div className="md:hidden pb-4">
          {/* govView banner + section strip each carry their own px-5 mobile inset;
              FinanceWorkspace is bare so its detail SubpageShell stays full-bleed. */}
          {govView && (
            <div className="px-5">
              <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 12px", background: "var(--ivory)", border: "1px solid var(--line)", borderRadius: 10, marginBottom: 16 }}>
                <Eye style={{ width: 13, height: 13, color: "var(--muted-text)", flexShrink: 0 }} />
                <span style={{ fontFamily: "var(--mono)", fontSize: 11, letterSpacing: "0.06em", textTransform: "uppercase", color: "var(--muted-text)", fontWeight: 500 }}>
                  Viewing as admin · read-only
                </span>
              </div>
            </div>
          )}
          <div className="px-5" style={{ marginBottom: 16 }}>
            <PlanSubTabStrip
              tabs={financeStripTabs}
              active={financeSection}
              onChange={k => setFinanceSection(k as FinanceSection)}
            />
          </div>
          <FinanceWorkspace
            ministryId={ministryId}
            userId={userId}
            userName={userName}
            userRole={activeUserTeam?.roleName ?? ""}
            section={financeSection}
            onSectionChange={setFinanceSection}
            canEditBudget={financeCanEdit}
            canAccessReimbursements={financeCanEdit}
            readOnly={govView}
          />
        </div>
      ) : (
      <div className="md:hidden px-5 pb-4">
        {activeTeamId && govView && (
          <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 12px", background: "var(--ivory)", border: "1px solid var(--line)", borderRadius: 10, marginBottom: 16 }}>
            <Eye style={{ width: 13, height: 13, color: "var(--muted-text)", flexShrink: 0 }} />
            <span style={{ fontFamily: "var(--mono)", fontSize: 11, letterSpacing: "0.06em", textTransform: "uppercase", color: "var(--muted-text)", fontWeight: 500 }}>
              Viewing as admin · read-only
            </span>
          </div>
        )}
        {teamKind === "dgPraise" && activeTeamId && activeTeamAllowed ? (
          <DgPraiseTeamTab
            teamId={activeTeamId}
            ministryId={ministryId}
            userId={userId}
            canManage={canManageWorship}
          />
        ) : teamKind === "oneTime" && activeTeamId && activeTeamAllowed ? (
          <OneTimeTeamTab
            teamId={activeTeamId}
            ministryId={ministryId}
            userId={userId}
            canManage={canManageWorship}
          />
        ) : teamKind === "tech" && activeTeamAllowed ? (
          <TechTeamTab ministryId={ministryId} userId={userId} canManage={canManageWorship} />
        ) : teamKind === "praise" && activeTeamId && activeTeamAllowed ? (
          <PraiseTeamTab
            teamId={activeTeamId}
            ministryId={ministryId}
            userId={userId}
            canManage={canManageWorship}
            canManageSchedule={canManageSchedule}
          />
        ) : teamKind === "studentOrg" && activeTeamAllowed ? (
          <StudentOrgTeamHome
            teamId={activeTeamId}
            teamName={activeTeamName}
            teamIcon={activeUserTeam?.teamIcon ?? activeTeamFull?.icon ?? "🏛️"}
            ministryId={ministryId}
            userId={userId}
            userName={userName}
            userRole={studentOrgRole}
            canEdit={canEditStudentOrg}
            canEditBudget={activeTeamPerms.includes("can_view_finances") || govWrite}
            onTeamSettings={activeTeamFull && canOpenTeamSettings ? () => openSettings(activeTeamFull) : undefined}
            planningEvent={studentOrgPlanningEvent ?? null}
            onPlanningEventChange={ev => onStudentOrgPlanningEventChange?.(ev)}
            onOpenChat={onOpenChat}
          />
        ) : teamKind === "dgl" && activeTeamId && activeTeamAllowed ? (
          <SmallGroupLeadersTab
            teamId={activeTeamId}
            ministryId={ministryId}
            userId={userId}
            isPresident={isDGLPresident}
            isPastor={isPastor}
            onOpenChat={onOpenChat}
            onTeamSettings={activeTeamFull && canOpenTeamSettings ? () => openSettings(activeTeamFull) : undefined}
            praiseTeamId={
              allTeams.find(t =>
                /\b(praise|worship)\b/i.test(t.name) ||
                userTeams.find(ut => ut.teamId === t.id)?.permissions.some(p =>
                  ["can_manage_worship_set","can_view_worship_set","can_manage_schedule"].includes(p)
                )
              )?.id ?? null
            }
          />
        ) : (
          <>
            {/* Admin: team management */}
            {isAdmin && (
              <div className="mb-8">
                <PlanSectionHeader>Teams</PlanSectionHeader>
                {allTeams.length === 0 ? (
                  <div className="bg-[var(--cream)] rounded-2xl border border-dashed border-[var(--line)] p-6 text-center">
                    <p className="text-[14px] font-semibold text-[var(--ink)]/60 mb-1">No teams yet.</p>
                    <p className="text-[13px] text-[var(--muted-text)]">Tap + above to create your first team.</p>
                  </div>
                ) : (
                  <div className="flex flex-col gap-2">
                    {allTeams.map((team) => (
                      <button
                        key={team.id}
                        onClick={() => openSettings(team)}
                        className="w-full bg-[var(--cream)] rounded-2xl border border-[var(--line)] p-4 text-left flex items-center gap-3 hover:bg-[var(--cream)] transition-colors"
                      >
                        <PlanLineIcon iconKey={team.icon ?? "👥"} bg="var(--plum)" fg="var(--cream-on-dark)" />
                        <div className="flex-1 min-w-0">
                          <p className="text-[14px] font-semibold text-[var(--ink)]">{team.name}</p>
                          <p className="text-[12px] text-[var(--muted-text)]">{team.member_count} member{team.member_count !== 1 ? "s" : ""}</p>
                        </div>
                        <ChevronRight className="w-4 h-4 text-[var(--faint)] flex-shrink-0" />
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
            <div className="mt-4">
              <PlanSectionHeader>Tools</PlanSectionHeader>
              <div className="grid grid-cols-2 gap-2">
                {[{ icon: "set", name: "Set" }, { icon: "sparkle", name: "Slides" }, { icon: "calendar", name: "Schedule" }, { icon: "book", name: "Bible Study" }].map((tool) => (
                  <div key={tool.name} className="bg-[var(--cream)] rounded-2xl border border-[var(--line)] p-4 opacity-60 flex flex-col gap-2">
                    <PlanLineIcon iconKey={tool.icon} bg="var(--cream)" fg="var(--plum)" size={36} />
                    <div>
                      <p className="text-[13px] font-semibold text-[var(--ink)]">{tool.name}</p>
                      <p style={{ fontFamily: "var(--mono)", fontSize: "9px", color: "var(--muted-text)", letterSpacing: "0.08em", textTransform: "uppercase", marginTop: "2px" }}>Coming soon</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
            {!isAdmin && !hasAnyPlanning && userTeams.length === 0 && (
              <EmptyState icon={<ClipboardList className="w-6 h-6" />} title="You're not on a team yet." subtitle="Ask a leader to add you." />
            )}
          </>
        )}
      </div>
      )}

    </div>
  )
}

// ── StudentOrgSectionNav ──────────────────────────────────────────────────────
// Vertical sidebar nav for the Student Org Board workspace on desktop.
// Renders in place of the flat team list in DesktopSidebar when SOB is active.
export function StudentOrgSectionNav({
  activeSection, onSectionChange,
  calEvents, planningEvent, onPlanningEventChange,
}: {
  activeSection: string
  onSectionChange: (s: string) => void
  calEvents: CalendarEvent[]
  planningEvent: CalendarEvent | null
  onPlanningEventChange: (ev: CalendarEvent | null) => void
}) {
  const SECTIONS = ["General", "Meeting Notes", "Events", "Resources", "Groups", "Rotations"] as const
  // Independent — only toggled by the chevron button, never by section navigation
  const [isPlanOpen, setIsPlanOpen] = useState(
    () => activeSection === "Events" || planningEvent !== null
  )
  const PLUM = "var(--plum)"
  const FAINT = "var(--faint)"
  const LINE = "var(--line)"

  return (
    <div style={{ display: "flex", flexDirection: "column", flex: 1, overflow: "hidden" }}>
      <div className="flex-1 overflow-y-auto px-2 pt-2 pb-3">
        {SECTIONS.map(section => {
          const isEvents = section === "Events"
          const isActive = isEvents
            ? activeSection === "Events" || planningEvent !== null
            : activeSection === section
          return (
            <div key={section}>
              {isEvents ? (
                /* Events row: text click navigates, chevron click toggles — never nested buttons */
                <div
                  style={{ ...sidebarItemStyle(isActive), marginBottom: 1, display: "flex", alignItems: "center", cursor: "pointer" }}
                  onClick={() => { onSectionChange("Events"); onPlanningEventChange(null) }}
                  role="button"
                  tabIndex={0}
                  onKeyDown={e => e.key === "Enter" && onSectionChange("Events")}
                >
                  <span style={{ flex: 1 }}>Events</span>
                  <span
                    role="button"
                    tabIndex={0}
                    onClick={e => { e.stopPropagation(); setIsPlanOpen(p => !p) }}
                    onKeyDown={e => e.key === "Enter" && (e.stopPropagation(), setIsPlanOpen(p => !p))}
                    style={{ display: "flex", alignItems: "center", padding: "2px 4px", borderRadius: 4, cursor: "pointer" }}
                    title={isPlanOpen ? "Collapse" : "Expand"}
                  >
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
                      style={{ transform: isPlanOpen ? "rotate(90deg)" : undefined, transition: "transform 160ms", color: FAINT }}>
                      <path d="M9 6l6 6-6 6" />
                    </svg>
                  </span>
                </div>
              ) : (
                <button
                  onClick={() => {
                    onSectionChange(section)
                    onPlanningEventChange(null)
                  }}
                  style={{ ...sidebarItemStyle(isActive), marginBottom: 1 }}
                >
                  <span style={{ flex: 1 }}>{section}</span>
                </button>
              )}

              {isEvents && isPlanOpen && (
                <div style={{ marginLeft: 16, marginBottom: 4 }}>
                  {calEvents.length === 0 ? (
                    <p style={{ fontSize: 11, color: FAINT, padding: "4px 10px", fontFamily: "var(--sans)" }}>No events yet</p>
                  ) : (
                    calEvents.map(ev => {
                      const isEvActive = planningEvent?.id === ev.id
                      return (
                        <button
                          key={ev.id}
                          onClick={() => { onPlanningEventChange(ev); onSectionChange("Events") }}
                          style={{ ...sidebarItemStyle(isEvActive), gap: 7, fontSize: 12, borderLeftColor: "transparent" }}
                        >
                          <span style={{ width: 4, height: 4, borderRadius: "50%", background: isEvActive ? PLUM : LINE, flexShrink: 0 }} />
                          <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" as const }}>{ev.title}</span>
                        </button>
                      )
                    })
                  )}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ── SmallGroupSectionNav ──────────────────────────────────────────────────────

export function SmallGroupSectionNav({
  activeSection,
  onSectionChange,
}: {
  activeSection: string
  onSectionChange: (s: string) => void
}) {
  const sections = [
    { key: "bible_study", label: "Bible Study" },
    { key: "schedule", label: "Schedule" },
  ]
  return (
    <div className="flex-1 overflow-y-auto px-2 pt-2 pb-3">
      {sections.map(s => (
        <button
          key={s.key}
          style={{ ...sidebarItemStyle(activeSection === s.key), marginBottom: 1 }}
          onClick={() => onSectionChange(s.key)}
        >
          <span style={{ flex: 1 }}>{s.label}</span>
        </button>
      ))}
    </div>
  )
}

// ── FinanceSectionNav ─────────────────────────────────────────────────────────
// Vertical sidebar nav for the Finance Team workspace on desktop.
// Renders in place of the flat team list in DesktopSidebar when a finance team is active.
export function FinanceSectionNav({
  active,
  onChange,
}: {
  active: string
  onChange: (s: string) => void
}) {
  const sections = [
    { key: "reimbursements", label: "Reimbursements" },
    { key: "budget", label: "Budget" },
    { key: "allocation", label: "Allocation" },
  ]
  return (
    <div className="flex-1 overflow-y-auto px-2 pt-2 pb-3">
      {sections.map(s => (
        <button
          key={s.key}
          style={{ ...sidebarItemStyle(active === s.key), marginBottom: 1 }}
          onClick={() => onChange(s.key)}
        >
          <span style={{ flex: 1 }}>{s.label}</span>
        </button>
      ))}
    </div>
  )
}

// ── PraiseTeamTab ─────────────────────────────────────────────────────────────

function getUpcomingSundays(n = 26): { date: string; label: string }[] {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const d = new Date(today)
  const dayOfWeek = d.getDay()
  if (dayOfWeek !== 0) d.setDate(d.getDate() + (7 - dayOfWeek))
  const sundays: { date: string; label: string }[] = []
  for (let i = 0; i < n; i++) {
    const y = d.getFullYear()
    const m = String(d.getMonth() + 1).padStart(2, "0")
    const dd = String(d.getDate()).padStart(2, "0")
    sundays.push({
      date: `${y}-${m}-${dd}`,
      label: d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }),
    })
    d.setDate(d.getDate() + 7)
  }
  return sundays
}

const WORSHIP_ROLE_OPTIONS = [
  "Lead Vocals", "Backup Vocals", "Keys", "Acoustic Guitar", "Electric Guitar",
  "Bass", "Drums", "Cajon", "Violin", "Cello", "Flute", "Trumpet", "Other",
]

export function worshipWeekDateLabel(dateStr: string) {
  return new Date(dateStr + "T12:00:00").toLocaleDateString("en-US", {
    weekday: "long", month: "long", day: "numeric",
  })
}

export function WorshipStatusBadge({ status, onChange }: { status: "draft" | "filled" | "confirmed"; onChange?: (s: string) => void }) {
  const cfg = {
    draft:     { label: "Draft",     bg: "#F3F0F7", color: "var(--body)" },
    filled:    { label: "Filled",    bg: "var(--body-bg)", color: "var(--plum)" },
    confirmed: { label: "Confirmed", bg: "#EDE5F0", color: "var(--plum)" },
  }[status]
  if (onChange) {
    return (
      <select
        value={status}
        onChange={e => onChange(e.target.value)}
        style={{ fontSize: 11, fontWeight: 600, letterSpacing: "0.03em", textTransform: "uppercase" as const, border: "none", outline: "none", cursor: "pointer", borderRadius: 20, padding: "3px 9px", background: cfg.bg, color: cfg.color, appearance: "none" as const }}
      >
        <option value="draft">Draft</option>
        <option value="filled">Filled</option>
        <option value="confirmed">Confirmed</option>
      </select>
    )
  }
  return (
    <span style={{ fontSize: 11, fontWeight: 600, letterSpacing: "0.03em", textTransform: "uppercase" as const, borderRadius: 20, padding: "3px 9px", background: cfg.bg, color: cfg.color }}>{cfg.label}</span>
  )
}

export function PraiseTeamTab({ teamId, ministryId, userId, canManage, canManageSchedule }: { teamId: string; ministryId: string; userId: string; canManage: boolean; canManageSchedule: boolean }) {
  const supabase = createClient()
  const { setParam } = useNavState()
  const validPTabs = ["schedule", "setlist", "availability"] as const
  const [subTab, setSubTab] = useState<"schedule" | "setlist" | "availability">(() => {
    const p = typeof window !== "undefined" ? new URLSearchParams(window.location.search).get("ptab") : null
    return (validPTabs as readonly string[]).includes(p ?? "") ? p as "schedule" | "setlist" | "availability" : "schedule"
  })
  function setSubTabAndUrl(t: "schedule" | "setlist" | "availability") {
    setSubTab(t)
    setParam("ptab", t)
  }

  // If navigated from DGL "Prepare →", highlight a specific week
  const [highlightWeek, setHighlightWeek] = useState<string | null>(() => {
    if (typeof window === "undefined") return null
    const w = new URLSearchParams(window.location.search).get("week")
    return w ?? null
  })

  // Schedule state
  const [weeks, setWeeks] = useState<WorshipWeek[]>([])
  const [scheduleLoading, setScheduleLoading] = useState(true)
  const [teamMembers, setTeamMembers] = useState<PraiseTeamMember[]>([])

  // Add week form
  const [showAddWeek, setShowAddWeek] = useState(false)
  const [newDate, setNewDate] = useState("")
  const [newLeaderError, setNewLeaderError] = useState(false)
  const [newLeaderId, setNewLeaderId] = useState("")
  const [addingWeek, setAddingWeek] = useState(false)
  const [addWeekError, setAddWeekError] = useState<string | null>(null)

  // Add member to week form
  const [addMemberToWeekId, setAddMemberToWeekId] = useState<string | null>(null)
  const [addMemberUserId, setAddMemberUserId] = useState("")
  const [addMemberRole, setAddMemberRole] = useState("Vocals")
  const [addMemberSearch, setAddMemberSearch] = useState("")
  const [addMemberFocused, setAddMemberFocused] = useState(false)
  const [addingMember, setAddingMember] = useState(false)

  // Availability state
  type AvailStatus = "available" | "busy" | "unsure"
  const [availLoading, setAvailLoading] = useState(false)
  const [myAvailability, setMyAvailability] = useState<Record<string, AvailStatus>>({})
  const [allAvailability, setAllAvailability] = useState<Record<string, Record<string, AvailStatus>>>({})
  const [savingAvail, setSavingAvail] = useState<string | null>(null)

  // Songs / Set List state
  const [songsByWeek, setSongsByWeek] = useState<Record<string, WorshipSong[]>>({})
  const [songsLoading, setSongsLoading] = useState(false)
  const [uploadingChartWeek, setUploadingChartWeek] = useState<string | null>(null)
  const [editingSong, setEditingSong] = useState<{ songId: string; field: "title" | "key"; value: string } | null>(null)
  const [viewingChart, setViewingChart] = useState<WorshipSong | null>(null)
  const [ocrInProgress, setOcrInProgress] = useState<Set<string>>(new Set())

  // Generation counter to cancel stale loadSchedule results
  const loadScheduleGenRef = useRef(0)

  // Week delete confirmation
  const [confirmDeleteWeekId, setConfirmDeleteWeekId] = useState<string | null>(null)

  const now = new Date()
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split("T")[0]
  const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().split("T")[0]

  const monoStyle: React.CSSProperties = EYEBROW_STYLE
  async function loadSchedule() {
    const gen = ++loadScheduleGenRef.current
    setScheduleLoading(true)
    const { data: weeksData } = await supabase
      .from("worship_weeks")
      .select("id, week_date, leader_id, status, auto_archive_date, chat_group_id, profiles!leader_id(name)")
      .eq("team_id", teamId)
      .order("week_date")

    if (gen !== loadScheduleGenRef.current) return
    if (!weeksData) { setScheduleLoading(false); return }

    const weekIds = weeksData.map(w => w.id)
    const { data: rolesData } = weekIds.length > 0
      ? await supabase.from("worship_roles").select("id, week_id, user_id, role_name, profiles!user_id(name)").in("week_id", weekIds)
      : { data: [] as { id: string; week_id: string; user_id: string; role_name: string; profiles: { name: string } | { name: string }[] | null }[] }

    if (gen !== loadScheduleGenRef.current) return

    const rolesByWeek: Record<string, WorshipRoleRow[]> = {}
    for (const r of rolesData ?? []) {
      const p = Array.isArray(r.profiles) ? r.profiles[0] : r.profiles
      if (!rolesByWeek[r.week_id]) rolesByWeek[r.week_id] = []
      rolesByWeek[r.week_id].push({ id: r.id, user_id: r.user_id, user_name: p?.name ?? "Unknown", role_name: r.role_name })
    }

    setWeeks(weeksData.map(w => {
      const raw = w as unknown as { id: string; week_date: string; leader_id: string | null; status: string; profiles: { name: string } | { name: string }[] | null }
      const p = Array.isArray(raw.profiles) ? raw.profiles[0] : raw.profiles
      return { id: raw.id, week_date: raw.week_date, leader_id: raw.leader_id, leader_name: p?.name ?? null, status: raw.status as WorshipWeek["status"], auto_archive_date: (raw as { auto_archive_date?: string | null }).auto_archive_date ?? null, chat_group_id: (raw as { chat_group_id?: string | null }).chat_group_id ?? null, event_name: (raw as { event_name?: string | null }).event_name ?? null, roles: rolesByWeek[raw.id] ?? [] }
    }))
    setScheduleLoading(false)
  }

  async function loadTeamMembers() {
    const { data } = await supabase
      .from("team_members")
      .select("user_id, profiles!user_id(name), team_roles!role_id(name)")
      .eq("team_id", teamId)
    type Raw = { user_id: string; profiles: { name: string } | { name: string }[] | null; team_roles: { name: string } | { name: string }[] | null }
    setTeamMembers((data ?? []).map((m: Raw) => {
      const p = Array.isArray(m.profiles) ? m.profiles[0] : m.profiles
      const r = Array.isArray(m.team_roles) ? m.team_roles[0] : m.team_roles
      return { user_id: m.user_id, name: p?.name ?? "Unknown", role_name: r?.name ?? "" }
    }))
  }

  async function loadAvailability() {
    setAvailLoading(true)
    const { data } = await supabase
      .from("worship_availability")
      .select("user_id, week_date, status")
      .eq("team_id", teamId)
      .gte("week_date", monthStart)
      .lte("week_date", monthEnd)
    const mine: Record<string, AvailStatus> = {}
    const all: Record<string, Record<string, AvailStatus>> = {}
    for (const row of data ?? []) {
      const s = (row.status ?? "available") as AvailStatus
      if (row.user_id === userId) mine[row.week_date] = s
      if (!all[row.user_id]) all[row.user_id] = {}
      all[row.user_id][row.week_date] = s
    }
    setMyAvailability(mine)
    setAllAvailability(all)
    setAvailLoading(false)
  }

  useEffect(() => {
    loadSchedule()
    loadTeamMembers()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [teamId])

  useEffect(() => {
    if (subTab === "availability") loadAvailability()
    if (subTab === "setlist") loadSetList()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [subTab, teamId])

  async function handleAddWeek() {
    if (!newDate) return
    if (!newLeaderId) { setNewLeaderError(true); return }
    setNewLeaderError(false)
    setAddWeekError(null)
    setAddingWeek(true)
    const { data: existing } = await supabase
      .from("worship_weeks")
      .select("id")
      .eq("team_id", teamId)
      .eq("week_date", newDate)
      .maybeSingle()
    if (existing) {
      setAddWeekError("A week for this date already exists.")
      setAddingWeek(false)
      return
    }
    const { error } = await supabase.from("worship_weeks").insert({ team_id: teamId, ministry_id: ministryId, week_date: newDate, leader_id: newLeaderId, status: "draft" })
    if (!error) { setShowAddWeek(false); setNewDate(""); setNewLeaderId(""); setAddWeekError(null); await loadSchedule() }
    else { setAddWeekError("Failed to add week. Please try again.") }
    setAddingWeek(false)
  }

  async function handleAddMember(weekId: string) {
    if (!addMemberUserId) return
    setAddingMember(true)
    const { error } = await supabase.from("worship_roles").insert({ week_id: weekId, user_id: addMemberUserId, role_name: addMemberRole })
    if (!error) {
      setAddMemberToWeekId(null); setAddMemberUserId(""); setAddMemberRole("Vocals"); setAddMemberSearch(""); await loadSchedule()
      // If week is already confirmed and has no chat yet, create chat now that a role exists
      const week = weeks.find(w => w.id === weekId)
      if (week?.status === "confirmed" && !week.chat_group_id) {
        try {
          const result = await createPraiseTeamChatAction(weekId, ministryId)
          if (result.groupId) {
            setWeeks(prev => prev.map(w => w.id === weekId ? { ...w, chat_group_id: result.groupId } : w))
          }
        } catch {
          // non-blocking
        }
      }
    }
    setAddingMember(false)
  }

  async function handleRemoveMember(roleId: string) {
    await supabase.from("worship_roles").delete().eq("id", roleId)
    setWeeks(prev => prev.map(w => ({ ...w, roles: w.roles.filter(r => r.id !== roleId) })))
  }

  async function handleLeaderChange(weekId: string, leaderId: string) {
    await supabase.from("worship_weeks").update({ leader_id: leaderId || null }).eq("id", weekId)
    const member = teamMembers.find(m => m.user_id === leaderId)
    setWeeks(prev => prev.map(w => w.id === weekId ? { ...w, leader_id: leaderId || null, leader_name: member?.name ?? null } : w))
  }

  async function handleStatusChange(weekId: string, status: string) {
    await supabase.from("worship_weeks").update({ status }).eq("id", weekId)
    setWeeks(prev => prev.map(w => w.id === weekId ? { ...w, status: status as WorshipWeek["status"] } : w))
    if (status === "confirmed") {
      const week = weeks.find(w => w.id === weekId)
      if (week && !week.chat_group_id) {
        try {
          const result = await createPraiseTeamChatAction(weekId, ministryId)
          if (result.groupId) {
            setWeeks(prev => prev.map(w => w.id === weekId ? { ...w, chat_group_id: result.groupId } : w))
          }
        } catch {
          // Chat creation failure is non-blocking — week status is already saved
        }
      }
    }
  }

  async function handleDeleteWeek(weekId: string) {
    setConfirmDeleteWeekId(null)
    setWeeks(prev => prev.filter(w => w.id !== weekId))
    setSongsByWeek(prev => { const next = { ...prev }; delete next[weekId]; return next })
    loadScheduleGenRef.current++
    await supabase.from("worship_songs").delete().eq("week_id", weekId)
    await supabase.from("worship_roles").delete().eq("week_id", weekId)
    await supabase.from("worship_weeks").delete().eq("id", weekId)
    await loadSchedule()
  }

  async function handleSetAvailability(weekDate: string, status: AvailStatus) {
    setSavingAvail(weekDate)
    const { error } = await supabase.from("worship_availability")
      .upsert(
        { team_id: teamId, user_id: userId, week_date: weekDate, status, is_available: status === "available" },
        { onConflict: "team_id,user_id,week_date" }
      )
    if (!error) {
      setMyAvailability(prev => ({ ...prev, [weekDate]: status }))
      setAllAvailability(prev => ({ ...prev, [userId]: { ...(prev[userId] ?? {}), [weekDate]: status } }))
    }
    setSavingAvail(null)
  }

  async function loadSetList() {
    setSongsLoading(true)
    const { data: weekRows } = await supabase
      .from("worship_weeks")
      .select("id")
      .eq("team_id", teamId)
      .gte("week_date", monthStart)
      .lte("week_date", monthEnd)
    const ids = (weekRows ?? []).map(w => w.id)
    if (ids.length === 0) { setSongsLoading(false); return }
    const { data: songsData } = await supabase
      .from("worship_songs")
      .select("id, week_id, title, key, song_leader_id, order_index, chart_url")
      .in("week_id", ids)
      .order("order_index")
    type RawSong = { id: string; week_id: string; title: string; key: string; song_leader_id: string | null; order_index: number; chart_url: string | null }
    const songMap: Record<string, WorshipSong[]> = {}
    for (const s of ((songsData ?? []) as RawSong[])) {
      if (!songMap[s.week_id]) songMap[s.week_id] = []
      songMap[s.week_id].push({ id: s.id, week_id: s.week_id, title: s.title, key: s.key, song_leader_id: s.song_leader_id, song_leader_name: null, order_index: s.order_index, chart_url: s.chart_url })
    }
    setSongsByWeek(songMap)
    setSongsLoading(false)
  }

  // SongSelect chord chart PDFs are image-only (no extractable text), so we OCR
  // the rendered first page. Runs in the background after upload completes.
  async function runOcrOnChart(songId: string, weekId: string, arrayBuffer: ArrayBuffer) {
    setOcrInProgress(prev => { const next = new Set(prev); next.add(songId); return next })

    let title = ""
    let key = ""

    try {
      const ocrPromise = (async () => {
        const pdfjsLib = await import("pdfjs-dist")
        pdfjsLib.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs"
        const pdf = await pdfjsLib.getDocument({ data: new Uint8Array(arrayBuffer) }).promise
        const page = await pdf.getPage(1)
        const viewport = page.getViewport({ scale: 2 })
        const canvas = document.createElement("canvas")
        canvas.width = viewport.width
        canvas.height = viewport.height
        const ctx = canvas.getContext("2d")
        if (!ctx) throw new Error("canvas 2d context unavailable")
        await page.render({ canvasContext: ctx, viewport, canvas }).promise

        const { createWorker } = await import("tesseract.js")
        const worker = await createWorker("eng")
        const result = await worker.recognize(canvas)
        await worker.terminate()
        const rawText = result.data.text
        console.log("[OCR] raw text:", rawText)

        const lines = rawText.split("\n").map(l => l.trim()).filter(l => l.length > 0)

        // Title: first line — strip "%" and everything after (CCLI watermark artifacts),
        // then strip "SongSelect" and everything after (logo text OCR'd onto same line)
        const rawTitle = lines[0] ?? ""
        const ocrTitle = rawTitle.split("%")[0].split("SongSelect")[0].trim()

        // Key: find line starting with "Key", handle two OCR formats:
        //   "Key - D | Tempo..."  → standard
        //   "KeyD1 Tempo..."      → OCR misread of "Key - D |"
        let ocrKey = ""
        for (const line of lines) {
          if (!line.includes("Key")) continue
          const m = line.match(/Key\s*-\s*([A-G][b#]?)/) ?? line.match(/Key([A-G][b#]?)/)
          if (m) { ocrKey = m[1]; break }
        }
        return { title: ocrTitle, key: ocrKey }
      })()

      const timeoutPromise = new Promise<{ title: string; key: string }>((_, reject) =>
        setTimeout(() => reject(new Error("OCR timeout (15s)")), 15000)
      )

      const out = await Promise.race([ocrPromise, timeoutPromise])
      title = out.title
      key = out.key
    } catch (err) {
      console.error("[OCR] failed:", err)
    }

    await supabase.from("worship_songs").update({ title, key }).eq("id", songId)
    setSongsByWeek(prev => ({
      ...prev,
      [weekId]: (prev[weekId] ?? []).map(s => s.id === songId ? { ...s, title, key } : s),
    }))
    setOcrInProgress(prev => { const next = new Set(prev); next.delete(songId); return next })
  }

  async function handleUploadChartForWeek(weekId: string, file: File) {
    setUploadingChartWeek(weekId)
    try {
      const arrayBuffer = await file.arrayBuffer()
      const existingSongs = songsByWeek[weekId] ?? []
      const orderIndex = existingSongs.length > 0 ? Math.max(...existingSongs.map(s => s.order_index)) + 1 : 0

      const { data: inserted, error: insErr } = await supabase
        .from("worship_songs")
        .insert({ week_id: weekId, title: "", key: "", order_index: orderIndex })
        .select("id")
        .single()
      if (insErr || !inserted) return

      const songId = (inserted as { id: string }).id

      const path = `${teamId}/${weekId}/${songId}.pdf`
      const { error: upErr } = await supabase.storage
        .from("worship-charts")
        .upload(path, file, { contentType: "application/pdf" })
      if (upErr) { await supabase.from("worship_songs").delete().eq("id", songId); return }

      const { data: urlData } = supabase.storage.from("worship-charts").getPublicUrl(path)
      const chartUrl = urlData.publicUrl
      await supabase.from("worship_songs").update({ chart_url: chartUrl }).eq("id", songId)

      const newSong: WorshipSong = { id: songId, week_id: weekId, title: "", key: "", song_leader_id: null, song_leader_name: null, order_index: orderIndex, chart_url: chartUrl }
      setSongsByWeek(prev => ({ ...prev, [weekId]: [...(prev[weekId] ?? []), newSong] }))

      // Fire-and-forget — OCR runs in background, never blocks upload
      void runOcrOnChart(songId, weekId, arrayBuffer)
    } finally {
      setUploadingChartWeek(null)
    }
  }

  async function handleDeleteSong(weekId: string, songId: string) {
    await supabase.from("worship_songs").delete().eq("id", songId)
    setSongsByWeek(prev => ({ ...prev, [weekId]: (prev[weekId] ?? []).filter(s => s.id !== songId) }))
  }

  async function handleReorderSong(weekId: string, songId: string, direction: "up" | "down") {
    const songs = [...(songsByWeek[weekId] ?? [])].sort((a, b) => a.order_index - b.order_index)
    const idx = songs.findIndex(s => s.id === songId)
    const swapIdx = direction === "up" ? idx - 1 : idx + 1
    if (swapIdx < 0 || swapIdx >= songs.length) return
    const a = songs[idx], b = songs[swapIdx]
    await supabase.from("worship_songs").update({ order_index: b.order_index }).eq("id", a.id)
    await supabase.from("worship_songs").update({ order_index: a.order_index }).eq("id", b.id)
    const updated = songs.map(s => s.id === a.id ? { ...s, order_index: b.order_index } : s.id === b.id ? { ...s, order_index: a.order_index } : s)
    setSongsByWeek(prev => ({ ...prev, [weekId]: updated }))
  }

  async function handleSaveInlineEdit() {
    if (!editingSong) return
    const { songId, field, value } = editingSong
    if (!value.trim()) { setEditingSong(null); return }
    await supabase.from("worship_songs").update({ [field]: value.trim() }).eq("id", songId)
    setSongsByWeek(prev => {
      const next = { ...prev }
      for (const wid of Object.keys(next)) {
        next[wid] = next[wid].map(s => s.id === songId ? { ...s, [field]: value.trim() } : s)
      }
      return next
    })
    if (viewingChart?.id === songId) setViewingChart(prev => prev ? { ...prev, [field]: value.trim() } : null)
    setEditingSong(null)
  }

  const visibleWeeks = weeks
  const worshipLeaders = teamMembers.filter(m => m.role_name === "Worship Leader")
  const weekDates = weeks.map(w => w.week_date)
  const monthLabel = "Schedule"

  return (
    <div>
      {viewingChart && (
        <SetListPdfViewer
          song={viewingChart}
          canManage={canManage}
          userId={userId}
          onClose={() => setViewingChart(null)}
          onSongUpdate={(field, value) => {
            setSongsByWeek(prev => {
              const next = { ...prev }
              for (const wid of Object.keys(next)) {
                next[wid] = next[wid].map(s => s.id === viewingChart.id ? { ...s, [field]: value } : s)
              }
              return next
            })
            setViewingChart(prev => prev ? { ...prev, [field]: value } : null)
          }}
        />
      )}

      {/* Sub-tabs */}
      <div style={{ marginBottom: 24 }}>
        <PlanSubTabStrip
          tabs={[
            { key: "schedule", label: "Schedule" },
            { key: "setlist", label: "Set List" },
            { key: "availability", label: "Availability" },
          ]}
          active={subTab}
          onChange={t => setSubTabAndUrl(t as "schedule" | "setlist" | "availability")}
        />
      </div>

      <div className="md:px-14">
      {/* ── Schedule ── */}
      {subTab === "schedule" && (
        <div>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
            <p style={{ ...monoStyle, fontSize: 11 }}>{monthLabel}</p>
            {canManageSchedule && !showAddWeek && (
              <CentralButton
                variant="primary" size="sm"
                onClick={() => setShowAddWeek(true)}
              >
                <Plus className="w-3.5 h-3.5" />
                Add week
              </CentralButton>
            )}
          </div>

          {/* Add week inline form */}
          {showAddWeek && (
            <div style={{ background: "var(--cream-panel)", border: "1px solid var(--line-2)", borderRadius: 14, padding: 20, marginBottom: 16 }}>
              <p style={{ fontFamily: "var(--font-instrument-serif)", fontSize: 17, color: "var(--ink)", marginBottom: 14 }}>New worship week</p>
              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                <div>
                  <label style={{ display: "block", fontSize: 12, fontWeight: 500, color: "var(--body)", marginBottom: 4 }}>Date — Sundays only</label>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 6, maxHeight: 148, overflowY: "auto", padding: "10px", background: "var(--cream)", border: "1px solid var(--line)", borderRadius: 10 }}>
                    {getUpcomingSundays(26).map(({ date, label }) => {
                      const isSelected = newDate === date
                      const alreadyExists = weekDates.includes(date)
                      return (
                        <button
                          key={date}
                          type="button"
                          onClick={() => { if (!alreadyExists) { setNewDate(date); setAddWeekError(null) } }}
                          style={{
                            padding: "5px 11px", borderRadius: 20,
                            border: isSelected ? "1.5px solid var(--plum)" : "1px solid var(--line-2)",
                            background: isSelected ? "var(--plum)" : alreadyExists ? "#F4F1EA" : "var(--cream)",
                            color: isSelected ? "var(--cream-on-dark)" : alreadyExists ? "#C5C0CC" : "var(--ink)",
                            fontSize: 12, fontWeight: isSelected ? 600 : 400,
                            cursor: alreadyExists ? "default" : "pointer",
                            fontFamily: "inherit",
                            opacity: alreadyExists ? 0.55 : 1,
                          }}
                        >
                          {label}
                        </button>
                      )
                    })}
                  </div>
                  {addWeekError && (
                    <p style={{ fontSize: 12, color: "var(--danger)", marginTop: 5 }}>{addWeekError}</p>
                  )}
                </div>
                <div>
                  <label style={{ display: "block", fontSize: 12, fontWeight: 500, color: newLeaderError ? "var(--danger)" : "var(--body)", marginBottom: 4 }}>
                    Leader <span style={{ color: newLeaderError ? "var(--danger)" : "var(--muted-text)", fontWeight: 400 }}>{newLeaderError ? "— required" : "(required)"}</span>
                  </label>
                  <select value={newLeaderId} onChange={e => { setNewLeaderId(e.target.value); setNewLeaderError(false) }}
                    style={{ width: "100%", padding: "10px 12px", borderRadius: 10, border: `1px solid ${newLeaderError ? "var(--danger)" : "var(--line)"}`, background: "var(--cream-panel)", fontSize: 14, color: newLeaderId ? "var(--ink)" : "var(--muted-text)", outline: "none" }}>
                    <option value="">Select Worship Leader…</option>
                    {worshipLeaders.map(m => <option key={m.user_id} value={m.user_id}>{m.name}</option>)}
                  </select>
                </div>
                <div style={{ display: "flex", gap: 8 }}>
                  <CentralButton variant="primary" size="sm" onClick={handleAddWeek} disabled={!newDate || addingWeek}
                    style={{ flex: 1 }}>
                    {addingWeek ? "Adding…" : "Add"}
                  </CentralButton>
                  <button onClick={() => { setShowAddWeek(false); setNewDate(""); setNewLeaderId(""); setAddWeekError(null) }}
                    style={{ padding: "10px 16px", background: "transparent", color: "var(--muted-text)", borderRadius: 10, fontSize: 13, border: "1px solid var(--line)", cursor: "pointer" }}>
                    Cancel
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Weeks list */}
          {scheduleLoading ? (
            <div style={{ textAlign: "center", padding: "40px 0", color: "var(--muted-text)", fontSize: 14 }}>Loading…</div>
          ) : visibleWeeks.length === 0 ? (
            <div style={{ background: "var(--cream-panel)", border: "1.5px dashed var(--line-2)", borderRadius: 14, padding: "40px 24px", textAlign: "center" }}>
              <p style={{ fontFamily: "var(--font-instrument-serif)", fontSize: 18, color: "var(--ink)", marginBottom: 6 }}>No weeks scheduled yet.</p>
              <p style={{ fontSize: 13, color: "var(--muted-text)" }}>{canManageSchedule ? "Add one to get started." : "Check back later or set your availability."}</p>
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              {visibleWeeks.map(week => {
                const isThisWeekAddTarget = addMemberToWeekId === week.id
                const isLeader = week.leader_id === userId
                const canChangeStatus = canManage || isLeader
                const alreadyAssigned = new Set(week.roles.map(r => r.user_id))
                const filteredMembers = teamMembers.filter(m =>
                  !alreadyAssigned.has(m.user_id) && m.name.toLowerCase().includes(addMemberSearch.toLowerCase())
                )
                const isHighlighted = highlightWeek === week.week_date
                return (
                  <div key={week.id} ref={isHighlighted ? (el => { if (el) { el.scrollIntoView({ behavior: "smooth", block: "start" }); setHighlightWeek(null) } }) : undefined} style={{ background: "var(--cream-panel)", border: isHighlighted ? "2px solid var(--plum)" : "1px solid var(--line)", borderRadius: 12, overflow: "hidden" }}>

                    {/* ── Date / status / delete row ── */}
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, padding: "14px 20px", borderBottom: "1px solid var(--line-3)" }}>
                      <p style={{ fontFamily: "var(--font-instrument-serif)", fontSize: 17, color: "var(--ink)", lineHeight: 1.2, margin: 0 }}>
                        {worshipWeekDateLabel(week.week_date)}
                      </p>
                      <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
                        <WorshipStatusBadge status={week.status} onChange={canChangeStatus ? s => handleStatusChange(week.id, s) : undefined} />
                        {canManage && (
                          <IconButton dim={26} onClick={() => setConfirmDeleteWeekId(confirmDeleteWeekId === week.id ? null : week.id)} title="Delete week">
                            <Trash2 className="w-3.5 h-3.5" />
                          </IconButton>
                        )}
                      </div>
                    </div>

                    {/* ── Auto-archive date (president only) ── */}
                    {canManage && (
                      <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 20px", borderBottom: "1px solid var(--line-3)" }}>
                        <span style={{ fontSize: 12, color: "var(--muted-text)", fontFamily: "var(--font-inter)", flexShrink: 0 }}>Auto-archive</span>
                        <input
                          type="date"
                          value={week.auto_archive_date ?? ""}
                          onChange={async e => {
                            const val = e.target.value
                            setWeeks(prev => prev.map(w => w.id === week.id ? { ...w, auto_archive_date: val || null } : w))
                            await supabase.from("worship_weeks").update({ auto_archive_date: val || null }).eq("id", week.id)
                          }}
                          style={{ fontSize: 12, color: "var(--body)", border: "none", outline: "none", background: "transparent", cursor: "pointer", fontFamily: "var(--font-inter)" }}
                        />
                      </div>
                    )}

                    {/* ── Confirm delete ── */}
                    {confirmDeleteWeekId === week.id && (
                      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 20px", borderBottom: "1px solid var(--line-3)" }}>
                        <span style={{ fontSize: 13, color: "var(--body)" }}>Delete this week?</span>
                        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
                          <button onClick={() => setConfirmDeleteWeekId(null)} style={{ fontSize: 13, fontWeight: 500, color: "var(--muted-text)", background: "none", border: "none", cursor: "pointer", padding: 0 }}>Cancel</button>
                          <button onClick={() => handleDeleteWeek(week.id)} style={{ fontSize: 13, fontWeight: 600, color: "var(--danger)", background: "none", border: "none", cursor: "pointer", padding: 0 }}>Delete</button>
                        </div>
                      </div>
                    )}

                    {/* ── Leader row ── */}
                    <div style={{ display: "flex", alignItems: "center", gap: 16, padding: "0 20px", minHeight: 52 }}>
                      <span style={{ ...monoStyle, color: !week.leader_id ? "var(--danger)" : undefined, flexShrink: 0, width: 80 }}>Leader</span>
                      {canManageSchedule ? (
                        <select value={week.leader_id ?? ""} onChange={e => handleLeaderChange(week.id, e.target.value)}
                          style={{ flex: 1, fontSize: 14, color: week.leader_id ? "var(--ink)" : "var(--danger)", border: "none", outline: "none", background: "transparent", cursor: "pointer" }}>
                          <option value="">— required —</option>
                          {worshipLeaders.map(m => <option key={m.user_id} value={m.user_id}>{m.name}</option>)}
                        </select>
                      ) : (
                        <span style={{ fontSize: 14, color: week.leader_name ? "var(--ink)" : "var(--danger)", flex: 1 }}>
                          {week.leader_name ?? "Not assigned"}
                        </span>
                      )}
                    </div>

                    {/* ── Member roster rows ── */}
                    {week.roles.length === 0 && !(canManageSchedule || isLeader) && (
                      <div style={{ padding: "13px 20px", borderTop: "1px solid var(--line-3)" }}>
                        <p style={{ fontSize: 13, color: "var(--muted-text)", margin: 0 }}>No members assigned yet.</p>
                      </div>
                    )}
                    {week.roles.map(role => (
                      <div key={role.id} style={{ display: "flex", alignItems: "center", gap: 16, padding: "0 20px", minHeight: 52, borderTop: "1px solid var(--line-3)" }}>
                        <span style={{ ...monoStyle, flexShrink: 0, width: 80 }}>{role.role_name}</span>
                        <span style={{ fontSize: 14, color: "var(--ink)", flex: 1 }}>{role.user_name}</span>
                        {(canManageSchedule || isLeader) && (
                          <IconButton dim={24} onClick={() => handleRemoveMember(role.id)} title="Remove">
                            <X style={{ width: 13, height: 13 }} />
                          </IconButton>
                        )}
                      </div>
                    ))}

                    {/* ── + Add member row ── */}
                    {(canManageSchedule || isLeader) && !isThisWeekAddTarget && (
                      <button
                        onClick={() => { setAddMemberToWeekId(week.id); setAddMemberSearch(""); setAddMemberUserId(""); setAddMemberRole("Vocals") }}
                        style={{
                          display: "block", width: "100%", padding: "14px 20px",
                          borderTop: "1px solid var(--line-3)", borderRight: "none", borderBottom: "none", borderLeft: "none",
                          background: "transparent", cursor: "pointer", textAlign: "left" as const,
                          fontSize: 14, color: "var(--body)",
                        }}
                      >
                        + Add member
                      </button>
                    )}

                    {/* ── Inline add-member form ── */}
                    {isThisWeekAddTarget && (
                      <div style={{ padding: "14px 20px", borderTop: "1px solid var(--line-3)" }}>
                        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                          <div style={{ position: "relative" }}>
                            <input type="text" placeholder="Search member…" value={addMemberSearch}
                              onChange={e => { setAddMemberSearch(e.target.value); setAddMemberUserId("") }}
                              onFocus={() => setAddMemberFocused(true)}
                              onBlur={() => setTimeout(() => setAddMemberFocused(false), 150)}
                              style={{ width: "100%", padding: "8px 10px", borderRadius: 8, border: "1px solid var(--line-2)", background: "var(--cream)", fontSize: 13, color: "var(--ink)", outline: "none", boxSizing: "border-box" as const }} />
                            {addMemberFocused && !addMemberUserId && filteredMembers.length > 0 && (
                              <div style={{ position: "absolute", top: "100%", left: 0, right: 0, border: "1px solid var(--line-2)", borderRadius: 8, background: "var(--cream)", maxHeight: 160, overflowY: "auto", zIndex: 10, boxShadow: "0 4px 12px rgba(0,0,0,0.08)" }}>
                                {filteredMembers.map(m => (
                                  <button key={m.user_id}
                                    onMouseDown={e => { e.preventDefault(); setAddMemberUserId(m.user_id); setAddMemberSearch(m.name); setAddMemberFocused(false) }}
                                    style={{ display: "block", width: "100%", textAlign: "left", padding: "8px 12px", fontSize: 13, color: "var(--ink)", background: addMemberUserId === m.user_id ? "#F4F0F8" : "transparent", border: "none", cursor: "pointer" }}>
                                    {m.name}
                                  </button>
                                ))}
                              </div>
                            )}
                          </div>
                          <select value={addMemberRole} onChange={e => setAddMemberRole(e.target.value)}
                            style={{ width: "100%", padding: "8px 10px", borderRadius: 8, border: "1px solid var(--line-2)", background: "var(--cream)", fontSize: 13, color: "var(--ink)", outline: "none" }}>
                            {WORSHIP_ROLE_OPTIONS.map(r => <option key={r} value={r}>{r}</option>)}
                          </select>
                          <div style={{ display: "flex", gap: 6 }}>
                            <CentralButton variant="primary" size="sm" onClick={() => handleAddMember(week.id)} disabled={!addMemberUserId || addingMember}
                              style={{ flex: 1 }}>
                              {addingMember ? "Adding…" : "Add"}
                            </CentralButton>
                            <button onClick={() => { setAddMemberToWeekId(null); setAddMemberSearch(""); setAddMemberUserId(""); setAddMemberFocused(false) }}
                              style={{ padding: "8px 12px", background: "transparent", color: "var(--muted-text)", borderRadius: 8, fontSize: 12, border: "1px solid var(--line-2)", cursor: "pointer" }}>
                              Cancel
                            </button>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}

      {/* ── Set List ── */}
      {subTab === "setlist" && (
        <div>
          {weeks.length === 0 ? (
            <div style={{ background: "var(--cream-panel)", border: "1.5px dashed var(--line-2)", borderRadius: 14, padding: "40px 24px", textAlign: "center" }}>
              <p style={{ fontFamily: "var(--font-instrument-serif)", fontSize: 18, color: "var(--ink)", marginBottom: 6 }}>No weeks scheduled yet.</p>
              <p style={{ fontSize: 13, color: "var(--muted-text)" }}>Add a week in the Schedule tab first.</p>
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              {weeks.map(week => {
                const songs = [...(songsByWeek[week.id] ?? [])].sort((a, b) => a.order_index - b.order_index)
                const isUploadingThis = uploadingChartWeek === week.id
                return (
                  <div key={week.id} style={{ background: "var(--cream-panel)", border: "1px solid var(--line-2)", borderRadius: 14, overflow: "hidden" }}>
                    {/* Card header */}
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, padding: "14px 18px", borderBottom: songs.length > 0 || isUploadingThis ? "1px solid var(--line-2)" : "none" }}>
                      <p style={{ fontFamily: "var(--font-instrument-serif)", fontSize: 17, color: "var(--ink)", lineHeight: 1.2 }}>
                        {worshipWeekDateLabel(week.week_date)}
                      </p>
                      {canManage && (
                        <label style={{ flexShrink: 0, display: "inline-flex", alignItems: "center", gap: 6, padding: "6px 14px", background: "var(--plum)", color: "var(--cream-on-dark)", borderRadius: 10, fontSize: 13, fontWeight: 600, cursor: isUploadingThis ? "not-allowed" : "pointer", opacity: isUploadingThis ? 0.6 : 1 }}>
                          <Plus className="w-3.5 h-3.5" />
                          {isUploadingThis ? "Uploading…" : "Upload Chart"}
                          <input type="file" accept="application/pdf" style={{ display: "none" }} disabled={isUploadingThis}
                            onChange={e => { const f = e.target.files?.[0]; if (f) handleUploadChartForWeek(week.id, f); e.target.value = "" }} />
                        </label>
                      )}
                    </div>

                    {/* Song list */}
                    {songs.length === 0 && !isUploadingThis ? (
                      <div style={{ padding: "20px 18px", textAlign: "center" }}>
                        <p style={{ fontSize: 13, color: "var(--faint)" }}>No charts uploaded yet.</p>
                      </div>
                    ) : (
                      <div>
                        {songs.map((song, idx) => {
                          const isEditingTitle = editingSong?.songId === song.id && editingSong?.field === "title"
                          const isEditingKey = editingSong?.songId === song.id && editingSong?.field === "key"
                          const needsTitle = !song.title
                          const needsKey = !song.key
                          const isOcr = ocrInProgress.has(song.id)
                          return (
                            <div key={song.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "12px 18px", borderBottom: idx < songs.length - 1 ? "1px solid var(--line-3)" : "none" }}>
                              {/* Position number */}
                              <span style={{ fontFamily: "var(--mono)", fontSize: 11, color: "var(--faint)", minWidth: 16, flexShrink: 0 }}>{idx + 1}</span>

                              {/* Title */}
                              <div style={{ flex: 1, minWidth: 0 }}>
                                {isOcr ? (
                                  <span style={{ fontSize: 13, color: "var(--muted-text)", fontStyle: "italic" }}>Reading chart…</span>
                                ) : isEditingTitle || needsTitle ? (
                                  <input
                                    autoFocus={isEditingTitle || (needsTitle && !needsKey)}
                                    value={isEditingTitle ? (editingSong?.value ?? "") : (needsTitle ? (editingSong?.songId === song.id ? (editingSong?.value ?? "") : "") : song.title)}
                                    placeholder="Song title…"
                                    onChange={e => setEditingSong({ songId: song.id, field: "title", value: e.target.value })}
                                    onFocus={() => { if (!isEditingTitle) setEditingSong({ songId: song.id, field: "title", value: "" }) }}
                                    onBlur={handleSaveInlineEdit}
                                    onKeyDown={e => { if (e.key === "Enter") handleSaveInlineEdit() }}
                                    style={{ width: "100%", border: "none", outline: "none", fontFamily: "var(--font-instrument-serif)", fontSize: 20, color: "var(--ink)", background: "transparent", padding: "2px 0", borderBottom: "1px solid var(--line-2)" }}
                                  />
                                ) : (
                                  <button
                                    onClick={() => song.chart_url ? setViewingChart(song) : setEditingSong({ songId: song.id, field: "title", value: song.title })}
                                    style={{ background: "transparent", border: "none", cursor: "pointer", fontFamily: "var(--font-instrument-serif)", fontSize: 20, color: "var(--ink)", textAlign: "left", padding: 0, width: "100%", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" as const, lineHeight: 1.2 }}
                                  >
                                    {song.title}
                                  </button>
                                )}
                              </div>

                              {/* Key — hidden during OCR */}
                              {!isOcr && (
                                <div style={{ flexShrink: 0 }}>
                                  {isEditingKey || needsKey ? (
                                    <input
                                      autoFocus={isEditingKey}
                                      value={isEditingKey ? (editingSong?.value ?? "") : ""}
                                      placeholder="Key"
                                      onChange={e => setEditingSong({ songId: song.id, field: "key", value: e.target.value })}
                                      onFocus={() => { if (!isEditingKey) setEditingSong({ songId: song.id, field: "key", value: "" }) }}
                                      onBlur={handleSaveInlineEdit}
                                      onKeyDown={e => { if (e.key === "Enter") handleSaveInlineEdit() }}
                                      style={{ width: 52, border: "none", outline: "none", fontFamily: "var(--mono)", fontSize: 12, color: "var(--plum-2)", background: "#EDE3EE", borderRadius: 8, padding: "3px 8px", textAlign: "center" as const }}
                                    />
                                  ) : (
                                    <button
                                      onClick={() => setEditingSong({ songId: song.id, field: "key", value: song.key })}
                                      style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", width: 28, height: 28, fontFamily: "var(--mono)", fontSize: 12, fontWeight: 700, color: "var(--plum-2)", background: "#EDE3EE", borderRadius: 8, border: "none", cursor: "pointer" }}
                                    >
                                      {song.key || "—"}
                                    </button>
                                  )}
                                </div>
                              )}

                              {/* Actions */}
                              {canManage && (
                                <div style={{ display: "flex", alignItems: "center", gap: 2, flexShrink: 0 }}>
                                  <button onClick={() => handleReorderSong(week.id, song.id, "up")} disabled={idx === 0}
                                    style={{ padding: "2px 5px", background: "transparent", border: "none", cursor: idx === 0 ? "default" : "pointer", color: idx === 0 ? "var(--line-2)" : "var(--muted-text)", fontSize: 13, lineHeight: 1 }}>↑</button>
                                  <button onClick={() => handleReorderSong(week.id, song.id, "down")} disabled={idx === songs.length - 1}
                                    style={{ padding: "2px 5px", background: "transparent", border: "none", cursor: idx === songs.length - 1 ? "default" : "pointer", color: idx === songs.length - 1 ? "var(--line-2)" : "var(--muted-text)", fontSize: 13, lineHeight: 1 }}>↓</button>
                                  <IconButton dim={24} onClick={() => handleDeleteSong(week.id, song.id)} title="Delete song">
                                    <Trash2 className="w-3 h-3" />
                                  </IconButton>
                                </div>
                              )}
                            </div>
                          )
                        })}
                        {isUploadingThis && (
                          <div style={{ padding: "12px 18px", borderTop: songs.length > 0 ? "1px solid var(--line-3)" : "none", display: "flex", alignItems: "center", gap: 10 }}>
                            <span style={{ fontFamily: "var(--mono)", fontSize: 11, color: "var(--faint)", minWidth: 16 }}>—</span>
                            <span style={{ fontSize: 13, color: "var(--muted-text)" }}>Parsing chart…</span>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}

      {/* ── Availability ── */}
      {subTab === "availability" && (
        <div>
          {availLoading ? (
            <div style={{ textAlign: "center", padding: "40px 0", color: "var(--muted-text)", fontSize: 14 }}>Loading…</div>
          ) : (
            <>
              {/* My availability */}
              <div style={{ marginBottom: 32 }}>
                <p style={{ fontFamily: "var(--font-instrument-serif)", fontSize: 20, color: "var(--ink)", marginBottom: 14 }}>My availability</p>
                {weeks.length === 0 ? (
                  <div style={{ background: "var(--cream-panel)", border: "1.5px dashed var(--line-2)", borderRadius: 14, padding: "32px 24px", textAlign: "center" }}>
                    <p style={{ fontSize: 13, color: "var(--muted-text)" }}>No weeks scheduled this month. Check the Schedule tab.</p>
                  </div>
                ) : (
                  <div style={{ background: "var(--cream-panel)", border: "1px solid var(--line-2)", borderRadius: 14, overflow: "hidden" }}>
                    {weeks.map((week, i) => {
                      const date = week.week_date
                      const avail = myAvailability[date]
                      const isSaving = savingAvail === date
                      return (
                        <div key={week.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, padding: "14px 18px", borderBottom: i < weeks.length - 1 ? "1px solid var(--line-2)" : "none", flexWrap: "wrap" as const }}>
                          <p style={{ fontSize: 14, color: "var(--ink)", flexShrink: 0 }}>{worshipWeekDateLabel(date)}</p>
                          <div style={{ display: "flex", gap: 6, opacity: isSaving ? 0.5 : 1, pointerEvents: isSaving ? "none" : "auto" }}>
                            {(["available", "busy", "unsure"] as AvailStatus[]).map(s => {
                              const active = avail === s
                              const cfg = {
                                available: { label: "Available", activeBg: "#E5EFE5", activeColor: "#2C5F2C", activeBorder: "#A3D9A3" },
                                busy:      { label: "Busy",      activeBg: "#F4E2E2", activeColor: "#8A2C2C", activeBorder: "#E8A0A0" },
                                unsure:    { label: "Unsure",    activeBg: "#F4ECDB", activeColor: "#B58940", activeBorder: "#E0C883" },
                              }[s]
                              return (
                                <button key={s} onClick={() => handleSetAvailability(date, s)}
                                  style={{
                                    padding: "5px 12px", borderRadius: 20, fontSize: 12, fontWeight: 600,
                                    border: `1px solid ${active ? cfg.activeBorder : "var(--line)"}`,
                                    background: active ? cfg.activeBg : "transparent",
                                    color: active ? cfg.activeColor : "var(--muted-text)",
                                    cursor: "pointer", transition: "all 0.15s",
                                  }}>
                                  {cfg.label}
                                </button>
                              )
                            })}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>

              {/* Team availability — visible to all members */}
              {weeks.length > 0 && teamMembers.length > 0 && (
                <div>
                  <p style={{ fontFamily: "var(--font-instrument-serif)", fontSize: 20, color: "var(--ink)", marginBottom: 14 }}>Team availability</p>
                  <div style={{ background: "var(--cream-panel)", border: "1px solid var(--line-2)", borderRadius: 14, overflowX: "auto" }}>
                    <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                      <thead>
                        <tr style={{ borderBottom: "1px solid var(--line-2)" }}>
                          <th style={{ textAlign: "left", padding: "10px 16px", color: "var(--muted-text)", fontFamily: "var(--mono)", fontWeight: 400, fontSize: 11, letterSpacing: "0.1em", textTransform: "uppercase", whiteSpace: "nowrap" as const }}>Member</th>
                          {weeks.map(w => (
                            <th key={w.id} style={{ textAlign: "center", padding: "10px 12px", color: "var(--muted-text)", fontFamily: "var(--mono)", fontWeight: 400, fontSize: 11, letterSpacing: "0.1em", whiteSpace: "nowrap" as const }}>
                              {new Date(w.week_date + "T12:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {teamMembers.map((member, i) => (
                          <tr key={member.user_id} style={{ borderBottom: i < teamMembers.length - 1 ? "1px solid var(--line-2)" : "none" }}>
                            <td style={{ padding: "10px 16px", color: "var(--ink)", fontWeight: 500, whiteSpace: "nowrap" as const }}>{member.name}</td>
                            {weeks.map(w => {
                              const a = allAvailability[member.user_id]?.[w.week_date]
                              return (
                                <td key={w.id} style={{ textAlign: "center", padding: "10px 12px" }}>
                                  {a === "available"
                                    ? <span style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", width: 24, height: 24, borderRadius: "50%", background: "#E5EFE5", color: "#2C5F2C", fontSize: 11, fontWeight: 700 }}>✓</span>
                                    : a === "busy"
                                      ? <span style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", width: 24, height: 24, borderRadius: "50%", background: "#F4E2E2", color: "#8A2C2C", fontSize: 11, fontWeight: 700 }}>✕</span>
                                      : a === "unsure"
                                        ? <span style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", width: 24, height: 24, borderRadius: "50%", background: "#F4ECDB", color: "#B58940", fontSize: 11, fontWeight: 700 }}>?</span>
                                        : <span style={{ color: "var(--faint)", fontSize: 13 }}>—</span>
                                  }
                                </td>
                              )
                            })}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      )}
      </div>
    </div>
  )
}

// ── DgPraiseTeamTab ───────────────────────────────────────────────────────────

function DgPraiseTeamTab({ teamId, ministryId, userId, canManage }: { teamId: string; ministryId: string; userId: string; canManage: boolean }) {
  const supabase = createClient()
  const monoStyle: React.CSSProperties = EYEBROW_STYLE

  const [events, setEvents] = useState<{ id: string; week_date: string; roles: WorshipRoleRow[] }[]>([])
  const [teamMembers, setTeamMembers] = useState<{ user_id: string; name: string }[]>([])
  const [songsByEvent, setSongsByEvent] = useState<Record<string, WorshipSong[]>>({})
  const [loading, setLoading] = useState(true)
  const [showAddEvent, setShowAddEvent] = useState(false)
  const [newEventDate, setNewEventDate] = useState("")
  const [addingEvent, setAddingEvent] = useState(false)
  const [showMembers, setShowMembers] = useState(false)

  // Add role to event
  const [addRoleToEventId, setAddRoleToEventId] = useState<string | null>(null)
  const [addRoleUserId, setAddRoleUserId] = useState("")
  const [addRoleSearch, setAddRoleSearch] = useState("")
  const [addRoleFocused, setAddRoleFocused] = useState(false)
  const [addRoleValue, setAddRoleValue] = useState(WORSHIP_ROLE_OPTIONS[0])
  const [addRoleCustom, setAddRoleCustom] = useState("")
  const [addingRole, setAddingRole] = useState(false)

  // Add team member
  const [allMinistryMembers, setAllMinistryMembers] = useState<{ id: string; name: string }[]>([])
  const [addMemberSearch, setAddMemberSearch] = useState("")
  const [addMemberFocused, setAddMemberFocused] = useState(false)
  const [addMemberId, setAddMemberId] = useState("")
  const [addingMember, setAddingMember] = useState(false)

  // Upload/edit songs
  const [uploadingEventId, setUploadingEventId] = useState<string | null>(null)
  const [editingSong, setEditingSong] = useState<{ songId: string; field: "title" | "key"; value: string } | null>(null)
  const [ocrInProgress, setOcrInProgress] = useState<Set<string>>(new Set())

  async function loadData() {
    setLoading(true)
    const { data: eventsData } = await supabase
      .from("worship_weeks")
      .select("id, week_date")
      .eq("team_id", teamId)
      .order("week_date")
    if (!eventsData) { setLoading(false); return }

    const eventIds = eventsData.map(e => e.id)
    const [{ data: rolesData }, { data: songsData }, { data: membersData }] = await Promise.all([
      eventIds.length > 0 ? supabase.from("worship_roles").select("id, week_id, user_id, role_name, profiles!user_id(name)").in("week_id", eventIds) : { data: [] as never[] },
      eventIds.length > 0 ? supabase.from("worship_songs").select("id, week_id, title, key, song_leader_id, order_index, chart_url").in("week_id", eventIds).order("order_index") : { data: [] as never[] },
      supabase.from("team_members").select("user_id, profiles!user_id(name)").eq("team_id", teamId),
    ])

    type RawRole = { id: string; week_id: string; user_id: string; role_name: string; profiles: { name: string } | { name: string }[] | null }
    const rolesByEvent: Record<string, WorshipRoleRow[]> = {}
    for (const r of (rolesData ?? []) as RawRole[]) {
      const p = Array.isArray(r.profiles) ? r.profiles[0] : r.profiles
      if (!rolesByEvent[r.week_id]) rolesByEvent[r.week_id] = []
      rolesByEvent[r.week_id].push({ id: r.id, user_id: r.user_id, user_name: p?.name ?? "Unknown", role_name: r.role_name })
    }

    type RawSong = { id: string; week_id: string; title: string; key: string; song_leader_id: string | null; order_index: number; chart_url: string | null }
    const songMap: Record<string, WorshipSong[]> = {}
    for (const s of (songsData ?? []) as RawSong[]) {
      if (!songMap[s.week_id]) songMap[s.week_id] = []
      songMap[s.week_id].push({ id: s.id, week_id: s.week_id, title: s.title, key: s.key, song_leader_id: s.song_leader_id, song_leader_name: null, order_index: s.order_index, chart_url: s.chart_url })
    }

    type RawMember = { user_id: string; profiles: { name: string } | { name: string }[] | null }
    setTeamMembers((membersData ?? []).map((m: RawMember) => {
      const p = Array.isArray(m.profiles) ? m.profiles[0] : m.profiles
      return { user_id: m.user_id, name: p?.name ?? "Unknown" }
    }))

    setEvents(eventsData.map(e => ({ id: e.id, week_date: e.week_date, roles: rolesByEvent[e.id] ?? [] })))
    setSongsByEvent(songMap)
    setLoading(false)
  }

  useEffect(() => { loadData() }, [teamId])

  useEffect(() => {
    if (!showMembers) return
    supabase.from("profiles").select("id, name").eq("ministry_id", ministryId).order("name")
      .then(({ data }) => setAllMinistryMembers(data ?? []))
  }, [showMembers])

  async function handleAddEvent() {
    if (!newEventDate) return
    setAddingEvent(true)
    await supabase.from("worship_weeks").insert({ team_id: teamId, ministry_id: ministryId, week_date: newEventDate, status: "draft" })
    setShowAddEvent(false); setNewEventDate(""); setAddingEvent(false)
    await loadData()
  }

  async function handleDeleteEvent(eventId: string) {
    setEvents(prev => prev.filter(e => e.id !== eventId))
    await supabase.from("worship_songs").delete().eq("week_id", eventId)
    await supabase.from("worship_roles").delete().eq("week_id", eventId)
    await supabase.from("worship_weeks").delete().eq("id", eventId)
    await loadData()
  }

  async function handleAddRole(eventId: string) {
    if (!addRoleUserId) return
    setAddingRole(true)
    const roleName = addRoleValue === "Other" ? (addRoleCustom.trim() || "Other") : addRoleValue
    await supabase.from("worship_roles").insert({ week_id: eventId, user_id: addRoleUserId, role_name: roleName })
    setAddRoleToEventId(null); setAddRoleUserId(""); setAddRoleSearch(""); setAddRoleValue(WORSHIP_ROLE_OPTIONS[0]); setAddRoleCustom(""); setAddingRole(false)
    await loadData()
  }

  async function handleRemoveRole(roleId: string) {
    await supabase.from("worship_roles").delete().eq("id", roleId)
    setEvents(prev => prev.map(e => ({ ...e, roles: e.roles.filter(r => r.id !== roleId) })))
  }

  async function handleAddTeamMember() {
    if (!addMemberId) return
    setAddingMember(true)
    const { data: roleData } = await supabase.from("team_roles").select("id").eq("team_id", teamId).limit(1).single()
    if (roleData) {
      await supabase.from("team_members").insert({ team_id: teamId, user_id: addMemberId, role_id: roleData.id, added_by: userId })
    }
    setAddMemberId(""); setAddMemberSearch(""); setAddingMember(false)
    await loadData()
  }

  async function handleRemoveTeamMember(memberId: string) {
    await supabase.from("team_members").delete().eq("team_id", teamId).eq("user_id", memberId)
    setTeamMembers(prev => prev.filter(m => m.user_id !== memberId))
  }

  async function handleDeleteSong(eventId: string, songId: string) {
    await supabase.from("worship_songs").delete().eq("id", songId)
    setSongsByEvent(prev => ({ ...prev, [eventId]: (prev[eventId] ?? []).filter(s => s.id !== songId) }))
  }

  async function handleSaveInlineEdit() {
    if (!editingSong) return
    const { songId, field, value } = editingSong
    if (!value.trim()) { setEditingSong(null); return }
    await supabase.from("worship_songs").update({ [field]: value.trim() }).eq("id", songId)
    setSongsByEvent(prev => {
      const next = { ...prev }
      for (const eid of Object.keys(next)) next[eid] = next[eid].map(s => s.id === songId ? { ...s, [field]: value.trim() } : s)
      return next
    })
    setEditingSong(null)
  }

  async function handleUploadChart(eventId: string, file: File) {
    setUploadingEventId(eventId)
    try {
      const arrayBuffer = await file.arrayBuffer()
      const existingSongs = songsByEvent[eventId] ?? []
      const orderIndex = existingSongs.length > 0 ? Math.max(...existingSongs.map(s => s.order_index)) + 1 : 0
      const { data: inserted } = await supabase.from("worship_songs").insert({ week_id: eventId, title: "", key: "", order_index: orderIndex }).select("id").single()
      if (!inserted) return
      const songId = (inserted as { id: string }).id
      const path = `${teamId}/${eventId}/${songId}.pdf`
      const { error: upErr } = await supabase.storage.from("worship-charts").upload(path, file, { contentType: "application/pdf" })
      if (upErr) { await supabase.from("worship_songs").delete().eq("id", songId); return }
      const { data: urlData } = supabase.storage.from("worship-charts").getPublicUrl(path)
      const chartUrl = urlData.publicUrl
      await supabase.from("worship_songs").update({ chart_url: chartUrl }).eq("id", songId)
      const newSong: WorshipSong = { id: songId, week_id: eventId, title: "", key: "", song_leader_id: null, song_leader_name: null, order_index: orderIndex, chart_url: chartUrl }
      setSongsByEvent(prev => ({ ...prev, [eventId]: [...(prev[eventId] ?? []), newSong] }))
      // OCR background
      const pdfjsLib = await import("pdfjs-dist")
      pdfjsLib.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs"
      setOcrInProgress(prev => { const next = new Set(prev); next.add(songId); return next })
      try {
        const pdf = await pdfjsLib.getDocument({ data: new Uint8Array(arrayBuffer) }).promise
        const page = await pdf.getPage(1)
        const viewport = page.getViewport({ scale: 2 })
        const canvas = document.createElement("canvas"); canvas.width = viewport.width; canvas.height = viewport.height
        const ctx = canvas.getContext("2d")
        if (ctx) {
          await page.render({ canvasContext: ctx, viewport, canvas }).promise
          const { createWorker } = await import("tesseract.js")
          const worker = await createWorker("eng")
          const result = await worker.recognize(canvas); await worker.terminate()
          const lines = result.data.text.split("\n").map((l: string) => l.trim()).filter((l: string) => l.length > 0)
          const ocrTitle = (lines[0] ?? "").split("%")[0].split("SongSelect")[0].trim()
          let ocrKey = ""
          for (const line of lines) { if (!line.includes("Key")) continue; const m = line.match(/Key\s*-\s*([A-G][b#]?)/) ?? line.match(/Key([A-G][b#]?)/); if (m) { ocrKey = m[1]; break } }
          await supabase.from("worship_songs").update({ title: ocrTitle, key: ocrKey }).eq("id", songId)
          setSongsByEvent(prev => ({ ...prev, [eventId]: (prev[eventId] ?? []).map(s => s.id === songId ? { ...s, title: ocrTitle, key: ocrKey } : s) }))
        }
      } catch { /* OCR non-blocking */ }
      setOcrInProgress(prev => { const next = new Set(prev); next.delete(songId); return next })
    } finally { setUploadingEventId(null) }
  }

  if (loading) return <div style={{ textAlign: "center", padding: "60px 0", color: "var(--muted-text)", fontSize: 14 }}>Loading…</div>

  const filteredForRole = teamMembers.filter(m =>
    !addRoleSearch || m.name.toLowerCase().includes(addRoleSearch.toLowerCase())
  )
  const filteredForAdd = allMinistryMembers.filter(m =>
    m.id !== userId && !teamMembers.some(tm => tm.user_id === m.id) &&
    (!addMemberSearch || m.name.toLowerCase().includes(addMemberSearch.toLowerCase()))
  )

  return (
    <div>
      {/* Header row */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
        <p style={monoStyle}>Events · {events.length}</p>
        <div style={{ display: "flex", gap: 8 }}>
          <button onClick={() => setShowMembers(!showMembers)}
            style={{ padding: "6px 14px", background: showMembers ? "var(--plum)" : "transparent", color: showMembers ? "var(--cream-on-dark)" : "var(--body)", border: "1px solid var(--line-2)", borderRadius: 10, fontSize: 13, fontWeight: 500, cursor: "pointer" }}>
            Members
          </button>
          {canManage && !showAddEvent && (
            <CentralButton variant="primary" size="sm" onClick={() => setShowAddEvent(true)}>
              <Plus className="w-3.5 h-3.5" /> Add event
            </CentralButton>
          )}
        </div>
      </div>

      {/* Members panel */}
      {showMembers && (
        <div style={{ background: "var(--cream-panel)", border: "1px solid var(--line-2)", borderRadius: 14, padding: 20, marginBottom: 24 }}>
          <p style={{ ...monoStyle, marginBottom: 14 }}>Team members</p>
          {teamMembers.length === 0 && <p style={{ fontSize: 13, color: "var(--muted-text)", marginBottom: 12 }}>No members yet.</p>}
          {teamMembers.map(m => (
            <div key={m.user_id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "8px 0", borderBottom: "1px solid var(--line-3)" }}>
              <span style={{ fontSize: 14, color: "var(--ink)" }}>{m.name}</span>
              {canManage && m.user_id !== userId && (
                <IconButton dim={22} onClick={() => handleRemoveTeamMember(m.user_id)} title="Remove"><X style={{ width: 12, height: 12 }} /></IconButton>
              )}
            </div>
          ))}
          {canManage && (
            <div style={{ marginTop: 14, position: "relative" }}>
              <input type="text" placeholder="Add member…" value={addMemberSearch}
                onChange={e => { setAddMemberSearch(e.target.value); setAddMemberId("") }}
                onFocus={() => setAddMemberFocused(true)}
                onBlur={() => setTimeout(() => setAddMemberFocused(false), 150)}
                style={{ width: "100%", padding: "8px 10px", borderRadius: 8, border: "1px solid var(--line-2)", background: "var(--cream)", fontSize: 13, outline: "none", boxSizing: "border-box" as const }} />
              {addMemberFocused && filteredForAdd.length > 0 && (
                <div style={{ position: "absolute", top: "100%", left: 0, right: 0, border: "1px solid var(--line-2)", borderRadius: 8, background: "var(--cream)", maxHeight: 160, overflowY: "auto", zIndex: 10, boxShadow: "0 4px 12px rgba(0,0,0,0.08)" }}>
                  {filteredForAdd.map(m => (
                    <button key={m.id} onMouseDown={e => { e.preventDefault(); setAddMemberId(m.id); setAddMemberSearch(m.name); setAddMemberFocused(false) }}
                      style={{ display: "block", width: "100%", textAlign: "left", padding: "8px 12px", fontSize: 13, color: "var(--ink)", background: addMemberId === m.id ? "#F4F0F8" : "transparent", border: "none", cursor: "pointer" }}>
                      {m.name}
                    </button>
                  ))}
                </div>
              )}
              {addMemberId && (
                <CentralButton variant="primary" size="sm" onClick={handleAddTeamMember} disabled={addingMember}
                  style={{ marginTop: 8 }}>
                  {addingMember ? "Adding…" : "Add"}
                </CentralButton>
              )}
            </div>
          )}
        </div>
      )}

      {/* Add event form */}
      {showAddEvent && (
        <div style={{ background: "var(--cream-panel)", border: "1px solid var(--line-2)", borderRadius: 14, padding: 20, marginBottom: 16 }}>
          <p style={{ fontFamily: "var(--font-instrument-serif)", fontSize: 17, color: "var(--ink)", marginBottom: 14 }}>New event</p>
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <div>
              <label style={{ display: "block", fontSize: 12, fontWeight: 500, color: "var(--body)", marginBottom: 4 }}>Date</label>
              <input type="date" value={newEventDate} onChange={e => setNewEventDate(e.target.value)}
                style={{ padding: "9px 12px", borderRadius: 10, border: "1px solid var(--line)", background: "var(--cream)", fontSize: 14, color: "var(--ink)", outline: "none" }} />
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <CentralButton variant="primary" size="sm" onClick={handleAddEvent} disabled={!newEventDate || addingEvent}
                style={{ flex: 1 }}>
                {addingEvent ? "Adding…" : "Add"}
              </CentralButton>
              <button onClick={() => { setShowAddEvent(false); setNewEventDate("") }}
                style={{ padding: "10px 16px", background: "transparent", color: "var(--muted-text)", borderRadius: 10, fontSize: 13, border: "1px solid var(--line)", cursor: "pointer" }}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Events list */}
      {events.length === 0 && !showAddEvent ? (
        <div style={{ background: "var(--cream-panel)", border: "1.5px dashed var(--line-2)", borderRadius: 14, padding: "40px 24px", textAlign: "center" }}>
          <p style={{ fontFamily: "var(--font-instrument-serif)", fontSize: 18, color: "var(--ink)", marginBottom: 6 }}>No events yet.</p>
          <p style={{ fontSize: 13, color: "var(--muted-text)" }}>Add an event to get started.</p>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          {events.map(event => {
            const songs = [...(songsByEvent[event.id] ?? [])].sort((a, b) => a.order_index - b.order_index)
            const isAddRoleTarget = addRoleToEventId === event.id
            const assignedIds = new Set(event.roles.map(r => r.user_id))
            const availableMembers = teamMembers.filter(m => !assignedIds.has(m.user_id) && (!addRoleSearch || m.name.toLowerCase().includes(addRoleSearch.toLowerCase())))
            return (
              <div key={event.id} style={{ background: "var(--cream-panel)", border: "1px solid var(--line)", borderRadius: 12, overflow: "hidden" }}>
                {/* Date header */}
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 20px", borderBottom: "1px solid var(--line-3)" }}>
                  <p style={{ fontFamily: "var(--font-instrument-serif)", fontSize: 17, color: "var(--ink)" }}>
                    {new Date(event.week_date + "T12:00:00").toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })}
                  </p>
                  {canManage && (
                    <IconButton dim={26} onClick={() => handleDeleteEvent(event.id)} title="Delete event">
                      <Trash2 className="w-3.5 h-3.5" />
                    </IconButton>
                  )}
                </div>

                {/* Roles */}
                {event.roles.map(role => (
                  <div key={role.id} style={{ display: "flex", alignItems: "center", gap: 16, padding: "0 20px", minHeight: 48, borderBottom: "1px solid var(--line-3)" }}>
                    <span style={{ ...monoStyle, flexShrink: 0, width: 90, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" as const }}>{role.role_name}</span>
                    <span style={{ fontSize: 14, color: "var(--ink)", flex: 1 }}>{role.user_name}</span>
                    {canManage && <IconButton dim={24} onClick={() => handleRemoveRole(role.id)} title="Remove"><X style={{ width: 13, height: 13 }} /></IconButton>}
                  </div>
                ))}

                {/* Add role row */}
                {canManage && !isAddRoleTarget && (
                  <button onClick={() => { setAddRoleToEventId(event.id); setAddRoleSearch(""); setAddRoleUserId(""); setAddRoleValue(WORSHIP_ROLE_OPTIONS[0]); setAddRoleCustom("") }}
                    style={{ display: "block", width: "100%", padding: "12px 20px", borderTop: event.roles.length > 0 ? "1px solid var(--line-3)" : "none", borderRight: "none", borderBottom: "none", borderLeft: "none", background: "transparent", cursor: "pointer", textAlign: "left" as const, fontSize: 14, color: "var(--body)" }}>
                    + Add person
                  </button>
                )}
                {isAddRoleTarget && (
                  <div style={{ padding: "12px 20px", borderTop: "1px solid var(--line-3)" }}>
                    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                      <div style={{ position: "relative" }}>
                        <input type="text" placeholder="Search member…" value={addRoleSearch}
                          onChange={e => { setAddRoleSearch(e.target.value); setAddRoleUserId("") }}
                          onFocus={() => setAddRoleFocused(true)} onBlur={() => setTimeout(() => setAddRoleFocused(false), 150)}
                          style={{ width: "100%", padding: "8px 10px", borderRadius: 8, border: "1px solid var(--line-2)", background: "var(--cream)", fontSize: 13, outline: "none", boxSizing: "border-box" as const }} />
                        {addRoleFocused && !addRoleUserId && availableMembers.length > 0 && (
                          <div style={{ position: "absolute", top: "100%", left: 0, right: 0, border: "1px solid var(--line-2)", borderRadius: 8, background: "var(--cream)", maxHeight: 160, overflowY: "auto", zIndex: 10, boxShadow: "0 4px 12px rgba(0,0,0,0.08)" }}>
                            {availableMembers.map(m => (
                              <button key={m.user_id} onMouseDown={e => { e.preventDefault(); setAddRoleUserId(m.user_id); setAddRoleSearch(m.name); setAddRoleFocused(false) }}
                                style={{ display: "block", width: "100%", textAlign: "left", padding: "8px 12px", fontSize: 13, color: "var(--ink)", background: addRoleUserId === m.user_id ? "#F4F0F8" : "transparent", border: "none", cursor: "pointer" }}>
                                {m.name}
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                      <select value={addRoleValue} onChange={e => setAddRoleValue(e.target.value)}
                        style={{ padding: "8px 10px", borderRadius: 8, border: "1px solid var(--line-2)", background: "var(--cream)", fontSize: 13, outline: "none" }}>
                        {WORSHIP_ROLE_OPTIONS.map(r => <option key={r} value={r}>{r}</option>)}
                      </select>
                      {addRoleValue === "Other" && (
                        <input type="text" placeholder="Custom role (e.g. Violin)…" value={addRoleCustom} onChange={e => setAddRoleCustom(e.target.value)}
                          style={{ padding: "8px 10px", borderRadius: 8, border: "1px solid var(--line-2)", background: "var(--cream)", fontSize: 13, outline: "none" }} />
                      )}
                      <div style={{ display: "flex", gap: 6 }}>
                        <CentralButton variant="primary" size="sm" onClick={() => handleAddRole(event.id)} disabled={!addRoleUserId || addingRole}
                          style={{ flex: 1 }}>
                          {addingRole ? "Adding…" : "Add"}
                        </CentralButton>
                        <button onClick={() => { setAddRoleToEventId(null); setAddRoleSearch(""); setAddRoleUserId(""); setAddRoleFocused(false) }}
                          style={{ padding: "8px 12px", background: "transparent", color: "var(--muted-text)", borderRadius: 8, fontSize: 12, border: "1px solid var(--line-2)", cursor: "pointer" }}>
                          Cancel
                        </button>
                      </div>
                    </div>
                  </div>
                )}

                {/* Setlist */}
                <div style={{ borderTop: "1px solid var(--line-3)" }}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 20px" }}>
                    <p style={monoStyle}>Set list</p>
                    {canManage && (
                      <label style={{ display: "inline-flex", alignItems: "center", gap: 5, padding: "5px 12px", background: "var(--plum)", color: "var(--cream-on-dark)", borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: uploadingEventId === event.id ? "not-allowed" : "pointer", opacity: uploadingEventId === event.id ? 0.6 : 1 }}>
                        <Plus className="w-3 h-3" />
                        {uploadingEventId === event.id ? "Uploading…" : "Chart"}
                        <input type="file" accept="application/pdf" style={{ display: "none" }} disabled={uploadingEventId === event.id}
                          onChange={e => { const f = e.target.files?.[0]; if (f) handleUploadChart(event.id, f); e.target.value = "" }} />
                      </label>
                    )}
                  </div>
                  {songs.length === 0 ? (
                    <p style={{ fontSize: 13, color: "var(--faint)", padding: "0 20px 16px" }}>No songs yet. Upload a chart to add one.</p>
                  ) : (
                    <div>
                      {songs.map((song, idx) => {
                        const isEditingTitle = editingSong?.songId === song.id && editingSong?.field === "title"
                        const isEditingKey = editingSong?.songId === song.id && editingSong?.field === "key"
                        const isOcr = ocrInProgress.has(song.id)
                        return (
                          <div key={song.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 20px", borderTop: "1px solid var(--line-3)" }}>
                            <span style={{ fontFamily: "var(--mono)", fontSize: 11, color: "var(--faint)", minWidth: 16 }}>{idx + 1}</span>
                            <div style={{ flex: 1, minWidth: 0 }}>
                              {isOcr ? <span style={{ fontSize: 13, color: "var(--muted-text)", fontStyle: "italic" }}>Reading…</span> : isEditingTitle || !song.title ? (
                                <input autoFocus value={isEditingTitle ? (editingSong?.value ?? "") : ""}
                                  placeholder="Song title…" onChange={e => setEditingSong({ songId: song.id, field: "title", value: e.target.value })}
                                  onFocus={() => { if (!isEditingTitle) setEditingSong({ songId: song.id, field: "title", value: "" }) }}
                                  onBlur={handleSaveInlineEdit} onKeyDown={e => { if (e.key === "Enter") handleSaveInlineEdit() }}
                                  style={{ width: "100%", border: "none", outline: "none", fontFamily: "var(--font-instrument-serif)", fontSize: 18, color: "var(--ink)", background: "transparent", borderBottom: "1px solid var(--line-2)" }} />
                              ) : (
                                <button onClick={() => setEditingSong({ songId: song.id, field: "title", value: song.title })}
                                  style={{ background: "transparent", border: "none", cursor: "pointer", fontFamily: "var(--font-instrument-serif)", fontSize: 18, color: "var(--ink)", textAlign: "left", padding: 0, width: "100%", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" as const }}>
                                  {song.title}
                                </button>
                              )}
                            </div>
                            {!isOcr && (
                              <div style={{ flexShrink: 0 }}>
                                {isEditingKey || !song.key ? (
                                  <input autoFocus={isEditingKey} value={isEditingKey ? (editingSong?.value ?? "") : ""}
                                    placeholder="Key" onChange={e => setEditingSong({ songId: song.id, field: "key", value: e.target.value })}
                                    onFocus={() => { if (!isEditingKey) setEditingSong({ songId: song.id, field: "key", value: "" }) }}
                                    onBlur={handleSaveInlineEdit} onKeyDown={e => { if (e.key === "Enter") handleSaveInlineEdit() }}
                                    style={{ width: 52, border: "none", outline: "none", fontFamily: "var(--mono)", fontSize: 12, color: "var(--plum-2)", background: "#EDE3EE", borderRadius: 8, padding: "3px 8px", textAlign: "center" as const }} />
                                ) : (
                                  <button onClick={() => setEditingSong({ songId: song.id, field: "key", value: song.key })}
                                    style={{ width: 28, height: 28, fontFamily: "var(--mono)", fontSize: 12, fontWeight: 700, color: "var(--plum-2)", background: "#EDE3EE", borderRadius: 8, border: "none", cursor: "pointer", display: "inline-flex", alignItems: "center", justifyContent: "center" }}>
                                    {song.key || "—"}
                                  </button>
                                )}
                              </div>
                            )}
                            {canManage && (
                              <IconButton dim={24} onClick={() => handleDeleteSong(event.id, song.id)} title="Delete song">
                                <Trash2 className="w-3 h-3" />
                              </IconButton>
                            )}
                          </div>
                        )
                      })}
                    </div>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ── OneTimeTeamTab ─────────────────────────────────────────────────────────────

function OneTimeTeamTab({ teamId, ministryId, userId, canManage }: { teamId: string; ministryId: string; userId: string; canManage: boolean }) {
  const supabase = createClient()
  const monoStyle: React.CSSProperties = EYEBROW_STYLE

  const [events, setEvents] = useState<{ id: string; week_date: string; event_name: string | null; roles: WorshipRoleRow[] }[]>([])
  const [songsByEvent, setSongsByEvent] = useState<Record<string, WorshipSong[]>>({})
  const [loading, setLoading] = useState(true)
  const [showAddEvent, setShowAddEvent] = useState(false)
  const [newEventDate, setNewEventDate] = useState("")
  const [newEventName, setNewEventName] = useState("")
  const [addingEvent, setAddingEvent] = useState(false)
  const [allMinistryMembers, setAllMinistryMembers] = useState<{ id: string; name: string }[]>([])

  // Add role to event
  const [addRoleToEventId, setAddRoleToEventId] = useState<string | null>(null)
  const [addRoleUserId, setAddRoleUserId] = useState("")
  const [addRoleSearch, setAddRoleSearch] = useState("")
  const [addRoleFocused, setAddRoleFocused] = useState(false)
  const [addRoleValue, setAddRoleValue] = useState(WORSHIP_ROLE_OPTIONS[0])
  const [addRoleCustom, setAddRoleCustom] = useState("")
  const [addingRole, setAddingRole] = useState(false)

  // Upload/edit songs
  const [uploadingEventId, setUploadingEventId] = useState<string | null>(null)
  const [editingSong, setEditingSong] = useState<{ songId: string; field: "title" | "key"; value: string } | null>(null)
  const [ocrInProgress, setOcrInProgress] = useState<Set<string>>(new Set())

  async function loadData() {
    setLoading(true)
    const { data: eventsData } = await supabase
      .from("worship_weeks")
      .select("id, week_date, event_name")
      .eq("team_id", teamId)
      .order("week_date")
    if (!eventsData) { setLoading(false); return }

    const eventIds = eventsData.map(e => e.id)
    const [{ data: rolesData }, { data: songsData }] = await Promise.all([
      eventIds.length > 0 ? supabase.from("worship_roles").select("id, week_id, user_id, role_name, profiles!user_id(name)").in("week_id", eventIds) : { data: [] as never[] },
      eventIds.length > 0 ? supabase.from("worship_songs").select("id, week_id, title, key, song_leader_id, order_index, chart_url").in("week_id", eventIds).order("order_index") : { data: [] as never[] },
    ])

    // Load all ministry members for role assignment
    const { data: membersData } = await supabase.from("profiles").select("id, name").eq("ministry_id", ministryId).order("name")
    setAllMinistryMembers(membersData ?? [])

    type RawRole = { id: string; week_id: string; user_id: string; role_name: string; profiles: { name: string } | { name: string }[] | null }
    const rolesByEvent: Record<string, WorshipRoleRow[]> = {}
    for (const r of (rolesData ?? []) as RawRole[]) {
      const p = Array.isArray(r.profiles) ? r.profiles[0] : r.profiles
      if (!rolesByEvent[r.week_id]) rolesByEvent[r.week_id] = []
      rolesByEvent[r.week_id].push({ id: r.id, user_id: r.user_id, user_name: p?.name ?? "Unknown", role_name: r.role_name })
    }

    type RawSong = { id: string; week_id: string; title: string; key: string; song_leader_id: string | null; order_index: number; chart_url: string | null }
    const songMap: Record<string, WorshipSong[]> = {}
    for (const s of (songsData ?? []) as RawSong[]) {
      if (!songMap[s.week_id]) songMap[s.week_id] = []
      songMap[s.week_id].push({ id: s.id, week_id: s.week_id, title: s.title, key: s.key, song_leader_id: s.song_leader_id, song_leader_name: null, order_index: s.order_index, chart_url: s.chart_url })
    }

    setEvents(eventsData.map(e => ({ id: e.id, week_date: e.week_date, event_name: e.event_name ?? null, roles: rolesByEvent[e.id] ?? [] })))
    setSongsByEvent(songMap)
    setLoading(false)
  }

  useEffect(() => { loadData() }, [teamId])

  async function handleAddEvent() {
    if (!newEventDate) return
    setAddingEvent(true)
    await supabase.from("worship_weeks").insert({ team_id: teamId, ministry_id: ministryId, week_date: newEventDate, event_name: newEventName.trim() || null, status: "draft" })
    setShowAddEvent(false); setNewEventDate(""); setNewEventName(""); setAddingEvent(false)
    await loadData()
  }

  async function handleDeleteEvent(eventId: string) {
    setEvents(prev => prev.filter(e => e.id !== eventId))
    await supabase.from("worship_songs").delete().eq("week_id", eventId)
    await supabase.from("worship_roles").delete().eq("week_id", eventId)
    await supabase.from("worship_weeks").delete().eq("id", eventId)
    await loadData()
  }

  async function handleAddRole(eventId: string) {
    if (!addRoleUserId) return
    setAddingRole(true)
    const roleName = addRoleValue === "Other" ? (addRoleCustom.trim() || "Other") : addRoleValue
    await supabase.from("worship_roles").insert({ week_id: eventId, user_id: addRoleUserId, role_name: roleName })
    setAddRoleToEventId(null); setAddRoleUserId(""); setAddRoleSearch(""); setAddRoleValue(WORSHIP_ROLE_OPTIONS[0]); setAddRoleCustom(""); setAddingRole(false)
    await loadData()
  }

  async function handleRemoveRole(roleId: string) {
    await supabase.from("worship_roles").delete().eq("id", roleId)
    setEvents(prev => prev.map(e => ({ ...e, roles: e.roles.filter(r => r.id !== roleId) })))
  }

  async function handleSaveInlineEdit() {
    if (!editingSong) return
    const { songId, field, value } = editingSong
    if (!value.trim()) { setEditingSong(null); return }
    await supabase.from("worship_songs").update({ [field]: value.trim() }).eq("id", songId)
    setSongsByEvent(prev => {
      const next = { ...prev }
      for (const eid of Object.keys(next)) next[eid] = next[eid].map(s => s.id === songId ? { ...s, [field]: value.trim() } : s)
      return next
    })
    setEditingSong(null)
  }

  async function handleUploadChart(eventId: string, file: File) {
    setUploadingEventId(eventId)
    try {
      const arrayBuffer = await file.arrayBuffer()
      const existingSongs = songsByEvent[eventId] ?? []
      const orderIndex = existingSongs.length > 0 ? Math.max(...existingSongs.map(s => s.order_index)) + 1 : 0
      const { data: inserted } = await supabase.from("worship_songs").insert({ week_id: eventId, title: "", key: "", order_index: orderIndex }).select("id").single()
      if (!inserted) return
      const songId = (inserted as { id: string }).id
      const path = `${teamId}/${eventId}/${songId}.pdf`
      const { error: upErr } = await supabase.storage.from("worship-charts").upload(path, file, { contentType: "application/pdf" })
      if (upErr) { await supabase.from("worship_songs").delete().eq("id", songId); return }
      const { data: urlData } = supabase.storage.from("worship-charts").getPublicUrl(path)
      const chartUrl = urlData.publicUrl
      await supabase.from("worship_songs").update({ chart_url: chartUrl }).eq("id", songId)
      const newSong: WorshipSong = { id: songId, week_id: eventId, title: "", key: "", song_leader_id: null, song_leader_name: null, order_index: orderIndex, chart_url: chartUrl }
      setSongsByEvent(prev => ({ ...prev, [eventId]: [...(prev[eventId] ?? []), newSong] }))
      setOcrInProgress(prev => { const next = new Set(prev); next.add(songId); return next })
      try {
        const pdfjsLib = await import("pdfjs-dist")
        pdfjsLib.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs"
        const pdf = await pdfjsLib.getDocument({ data: new Uint8Array(arrayBuffer) }).promise
        const page = await pdf.getPage(1)
        const viewport = page.getViewport({ scale: 2 })
        const canvas = document.createElement("canvas"); canvas.width = viewport.width; canvas.height = viewport.height
        const ctx = canvas.getContext("2d")
        if (ctx) {
          await page.render({ canvasContext: ctx, viewport, canvas }).promise
          const { createWorker } = await import("tesseract.js")
          const worker = await createWorker("eng")
          const result = await worker.recognize(canvas); await worker.terminate()
          const lines = result.data.text.split("\n").map((l: string) => l.trim()).filter((l: string) => l.length > 0)
          const ocrTitle = (lines[0] ?? "").split("%")[0].split("SongSelect")[0].trim()
          let ocrKey = ""
          for (const line of lines) { if (!line.includes("Key")) continue; const m = line.match(/Key\s*-\s*([A-G][b#]?)/) ?? line.match(/Key([A-G][b#]?)/); if (m) { ocrKey = m[1]; break } }
          await supabase.from("worship_songs").update({ title: ocrTitle, key: ocrKey }).eq("id", songId)
          setSongsByEvent(prev => ({ ...prev, [eventId]: (prev[eventId] ?? []).map(s => s.id === songId ? { ...s, title: ocrTitle, key: ocrKey } : s) }))
        }
      } catch { /* OCR non-blocking */ }
      setOcrInProgress(prev => { const next = new Set(prev); next.delete(songId); return next })
    } finally { setUploadingEventId(null) }
  }

  async function handleDeleteSong(eventId: string, songId: string) {
    await supabase.from("worship_songs").delete().eq("id", songId)
    setSongsByEvent(prev => ({ ...prev, [eventId]: (prev[eventId] ?? []).filter(s => s.id !== songId) }))
  }

  if (loading) return <div style={{ textAlign: "center", padding: "60px 0", color: "var(--muted-text)", fontSize: 14 }}>Loading…</div>

  const filteredForRole = allMinistryMembers.filter(m => !addRoleSearch || m.name.toLowerCase().includes(addRoleSearch.toLowerCase()))

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
        <p style={monoStyle}>Events · {events.length}</p>
        {canManage && !showAddEvent && (
          <CentralButton variant="primary" size="sm" onClick={() => setShowAddEvent(true)}>
            <Plus className="w-3.5 h-3.5" /> Add event
          </CentralButton>
        )}
      </div>

      {showAddEvent && (
        <div style={{ background: "var(--cream-panel)", border: "1px solid var(--line-2)", borderRadius: 14, padding: 20, marginBottom: 16 }}>
          <p style={{ fontFamily: "var(--font-instrument-serif)", fontSize: 17, color: "var(--ink)", marginBottom: 14 }}>New event</p>
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <div>
              <label style={{ display: "block", fontSize: 12, fontWeight: 500, color: "var(--body)", marginBottom: 4 }}>Event name</label>
              <input type="text" placeholder="e.g. Welcome Week Praise Night" value={newEventName} onChange={e => setNewEventName(e.target.value)}
                style={{ width: "100%", padding: "9px 12px", borderRadius: 10, border: "1px solid var(--line)", background: "var(--cream)", fontSize: 14, color: "var(--ink)", outline: "none", boxSizing: "border-box" as const }} />
            </div>
            <div>
              <label style={{ display: "block", fontSize: 12, fontWeight: 500, color: "var(--body)", marginBottom: 4 }}>Date</label>
              <input type="date" value={newEventDate} onChange={e => setNewEventDate(e.target.value)}
                style={{ padding: "9px 12px", borderRadius: 10, border: "1px solid var(--line)", background: "var(--cream)", fontSize: 14, color: "var(--ink)", outline: "none" }} />
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <CentralButton variant="primary" size="sm" onClick={handleAddEvent} disabled={!newEventDate || addingEvent}
                style={{ flex: 1 }}>
                {addingEvent ? "Adding…" : "Add"}
              </CentralButton>
              <button onClick={() => { setShowAddEvent(false); setNewEventDate(""); setNewEventName("") }}
                style={{ padding: "10px 16px", background: "transparent", color: "var(--muted-text)", borderRadius: 10, fontSize: 13, border: "1px solid var(--line)", cursor: "pointer" }}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {events.length === 0 && !showAddEvent ? (
        <div style={{ background: "var(--cream-panel)", border: "1.5px dashed var(--line-2)", borderRadius: 14, padding: "40px 24px", textAlign: "center" }}>
          <p style={{ fontFamily: "var(--font-instrument-serif)", fontSize: 18, color: "var(--ink)", marginBottom: 6 }}>No events yet.</p>
          <p style={{ fontSize: 13, color: "var(--muted-text)" }}>Add an event to get started.</p>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          {events.map(event => {
            const songs = [...(songsByEvent[event.id] ?? [])].sort((a, b) => a.order_index - b.order_index)
            const isAddRoleTarget = addRoleToEventId === event.id
            const assignedIds = new Set(event.roles.map(r => r.user_id))
            const availableForRole = filteredForRole.filter(m => !assignedIds.has(m.id))
            return (
              <div key={event.id} style={{ background: "var(--cream-panel)", border: "1px solid var(--line)", borderRadius: 12, overflow: "hidden" }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 20px", borderBottom: "1px solid var(--line-3)" }}>
                  <div>
                    {event.event_name && <p style={{ fontFamily: "var(--font-instrument-serif)", fontSize: 17, color: "var(--ink)", lineHeight: 1.2 }}>{event.event_name}</p>}
                    <p style={{ fontSize: 13, color: event.event_name ? "var(--muted-text)" : "var(--ink)", fontFamily: event.event_name ? "var(--font-inter)" : "var(--font-instrument-serif)", ...(event.event_name ? {} : { fontSize: 17 }) }}>
                      {new Date(event.week_date + "T12:00:00").toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })}
                    </p>
                  </div>
                  {canManage && (
                    <IconButton dim={26} onClick={() => handleDeleteEvent(event.id)} title="Delete event">
                      <Trash2 className="w-3.5 h-3.5" />
                    </IconButton>
                  )}
                </div>

                {event.roles.map(role => (
                  <div key={role.id} style={{ display: "flex", alignItems: "center", gap: 16, padding: "0 20px", minHeight: 48, borderBottom: "1px solid var(--line-3)" }}>
                    <span style={{ ...monoStyle, flexShrink: 0, width: 90, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" as const }}>{role.role_name}</span>
                    <span style={{ fontSize: 14, color: "var(--ink)", flex: 1 }}>{role.user_name}</span>
                    {canManage && <IconButton dim={24} onClick={() => handleRemoveRole(role.id)} title="Remove"><X style={{ width: 13, height: 13 }} /></IconButton>}
                  </div>
                ))}

                {canManage && !isAddRoleTarget && (
                  <button onClick={() => { setAddRoleToEventId(event.id); setAddRoleSearch(""); setAddRoleUserId(""); setAddRoleValue(WORSHIP_ROLE_OPTIONS[0]); setAddRoleCustom("") }}
                    style={{ display: "block", width: "100%", padding: "12px 20px", borderTop: event.roles.length > 0 ? "1px solid var(--line-3)" : "none", borderRight: "none", borderBottom: "none", borderLeft: "none", background: "transparent", cursor: "pointer", textAlign: "left" as const, fontSize: 14, color: "var(--body)" }}>
                    + Add person
                  </button>
                )}
                {isAddRoleTarget && (
                  <div style={{ padding: "12px 20px", borderTop: "1px solid var(--line-3)" }}>
                    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                      <div style={{ position: "relative" }}>
                        <input type="text" placeholder="Search member…" value={addRoleSearch}
                          onChange={e => { setAddRoleSearch(e.target.value); setAddRoleUserId("") }}
                          onFocus={() => setAddRoleFocused(true)} onBlur={() => setTimeout(() => setAddRoleFocused(false), 150)}
                          style={{ width: "100%", padding: "8px 10px", borderRadius: 8, border: "1px solid var(--line-2)", background: "var(--cream)", fontSize: 13, outline: "none", boxSizing: "border-box" as const }} />
                        {addRoleFocused && !addRoleUserId && availableForRole.length > 0 && (
                          <div style={{ position: "absolute", top: "100%", left: 0, right: 0, border: "1px solid var(--line-2)", borderRadius: 8, background: "var(--cream)", maxHeight: 160, overflowY: "auto", zIndex: 10, boxShadow: "0 4px 12px rgba(0,0,0,0.08)" }}>
                            {availableForRole.map(m => (
                              <button key={m.id} onMouseDown={e => { e.preventDefault(); setAddRoleUserId(m.id); setAddRoleSearch(m.name); setAddRoleFocused(false) }}
                                style={{ display: "block", width: "100%", textAlign: "left", padding: "8px 12px", fontSize: 13, color: "var(--ink)", background: addRoleUserId === m.id ? "#F4F0F8" : "transparent", border: "none", cursor: "pointer" }}>
                                {m.name}
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                      <select value={addRoleValue} onChange={e => setAddRoleValue(e.target.value)}
                        style={{ padding: "8px 10px", borderRadius: 8, border: "1px solid var(--line-2)", background: "var(--cream)", fontSize: 13, outline: "none" }}>
                        {WORSHIP_ROLE_OPTIONS.map(r => <option key={r} value={r}>{r}</option>)}
                      </select>
                      {addRoleValue === "Other" && (
                        <input type="text" placeholder="Custom role (e.g. Violin)…" value={addRoleCustom} onChange={e => setAddRoleCustom(e.target.value)}
                          style={{ padding: "8px 10px", borderRadius: 8, border: "1px solid var(--line-2)", background: "var(--cream)", fontSize: 13, outline: "none" }} />
                      )}
                      <div style={{ display: "flex", gap: 6 }}>
                        <CentralButton variant="primary" size="sm" onClick={() => handleAddRole(event.id)} disabled={!addRoleUserId || addingRole}
                          style={{ flex: 1 }}>
                          {addingRole ? "Adding…" : "Add"}
                        </CentralButton>
                        <button onClick={() => { setAddRoleToEventId(null); setAddRoleSearch(""); setAddRoleUserId(""); setAddRoleFocused(false) }}
                          style={{ padding: "8px 12px", background: "transparent", color: "var(--muted-text)", borderRadius: 8, fontSize: 12, border: "1px solid var(--line-2)", cursor: "pointer" }}>
                          Cancel
                        </button>
                      </div>
                    </div>
                  </div>
                )}

                <div style={{ borderTop: "1px solid var(--line-3)" }}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 20px" }}>
                    <p style={monoStyle}>Set list</p>
                    {canManage && (
                      <label style={{ display: "inline-flex", alignItems: "center", gap: 5, padding: "5px 12px", background: "var(--plum)", color: "var(--cream-on-dark)", borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: uploadingEventId === event.id ? "not-allowed" : "pointer", opacity: uploadingEventId === event.id ? 0.6 : 1 }}>
                        <Plus className="w-3 h-3" />
                        {uploadingEventId === event.id ? "Uploading…" : "Chart"}
                        <input type="file" accept="application/pdf" style={{ display: "none" }} disabled={uploadingEventId === event.id}
                          onChange={e => { const f = e.target.files?.[0]; if (f) handleUploadChart(event.id, f); e.target.value = "" }} />
                      </label>
                    )}
                  </div>
                  {songs.length === 0 ? (
                    <p style={{ fontSize: 13, color: "var(--faint)", padding: "0 20px 16px" }}>No songs yet. Upload a chart to add one.</p>
                  ) : (
                    <div>
                      {songs.map((song, idx) => {
                        const isEditingTitle = editingSong?.songId === song.id && editingSong?.field === "title"
                        const isEditingKey = editingSong?.songId === song.id && editingSong?.field === "key"
                        const isOcr = ocrInProgress.has(song.id)
                        return (
                          <div key={song.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 20px", borderTop: "1px solid var(--line-3)" }}>
                            <span style={{ fontFamily: "var(--mono)", fontSize: 11, color: "var(--faint)", minWidth: 16 }}>{idx + 1}</span>
                            <div style={{ flex: 1, minWidth: 0 }}>
                              {isOcr ? <span style={{ fontSize: 13, color: "var(--muted-text)", fontStyle: "italic" }}>Reading…</span> : isEditingTitle || !song.title ? (
                                <input autoFocus value={isEditingTitle ? (editingSong?.value ?? "") : ""}
                                  placeholder="Song title…" onChange={e => setEditingSong({ songId: song.id, field: "title", value: e.target.value })}
                                  onFocus={() => { if (!isEditingTitle) setEditingSong({ songId: song.id, field: "title", value: "" }) }}
                                  onBlur={handleSaveInlineEdit} onKeyDown={e => { if (e.key === "Enter") handleSaveInlineEdit() }}
                                  style={{ width: "100%", border: "none", outline: "none", fontFamily: "var(--font-instrument-serif)", fontSize: 18, color: "var(--ink)", background: "transparent", borderBottom: "1px solid var(--line-2)" }} />
                              ) : (
                                <button onClick={() => setEditingSong({ songId: song.id, field: "title", value: song.title })}
                                  style={{ background: "transparent", border: "none", cursor: "pointer", fontFamily: "var(--font-instrument-serif)", fontSize: 18, color: "var(--ink)", textAlign: "left", padding: 0, width: "100%", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" as const }}>
                                  {song.title}
                                </button>
                              )}
                            </div>
                            {!isOcr && (
                              <div style={{ flexShrink: 0 }}>
                                {isEditingKey || !song.key ? (
                                  <input autoFocus={isEditingKey} value={isEditingKey ? (editingSong?.value ?? "") : ""}
                                    placeholder="Key" onChange={e => setEditingSong({ songId: song.id, field: "key", value: e.target.value })}
                                    onFocus={() => { if (!isEditingKey) setEditingSong({ songId: song.id, field: "key", value: "" }) }}
                                    onBlur={handleSaveInlineEdit} onKeyDown={e => { if (e.key === "Enter") handleSaveInlineEdit() }}
                                    style={{ width: 52, border: "none", outline: "none", fontFamily: "var(--mono)", fontSize: 12, color: "var(--plum-2)", background: "#EDE3EE", borderRadius: 8, padding: "3px 8px", textAlign: "center" as const }} />
                                ) : (
                                  <button onClick={() => setEditingSong({ songId: song.id, field: "key", value: song.key })}
                                    style={{ width: 28, height: 28, fontFamily: "var(--mono)", fontSize: 12, fontWeight: 700, color: "var(--plum-2)", background: "#EDE3EE", borderRadius: 8, border: "none", cursor: "pointer", display: "inline-flex", alignItems: "center", justifyContent: "center" }}>
                                    {song.key || "—"}
                                  </button>
                                )}
                              </div>
                            )}
                            {canManage && (
                              <IconButton dim={24} onClick={() => handleDeleteSong(event.id, song.id)} title="Delete song">
                                <Trash2 className="w-3 h-3" />
                              </IconButton>
                            )}
                          </div>
                        )
                      })}
                    </div>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ── TechTeamTab ────────────────────────────────────────────────────────────────

function TechTeamTab({ ministryId, userId, canManage }: { ministryId: string; userId: string; canManage: boolean }) {
  const supabase = createClient()
  const monoStyle: React.CSSProperties = EYEBROW_STYLE

  type TeamInfo = { id: string; name: string; team_type: string }
  type EventWithMeta = { id: string; week_date: string; event_name: string | null; team_id: string; teamName: string; teamType: string }

  const [teams, setTeams] = useState<TeamInfo[]>([])
  const [events, setEvents] = useState<EventWithMeta[]>([])
  const [songsByEvent, setSongsByEvent] = useState<Record<string, WorshipSong[]>>({})
  const [loading, setLoading] = useState(true)

  // Slides state
  const [rawOcrBySong, setRawOcrBySong] = useState<Record<string, string>>({})
  type SlidePage = { songTitle: string; songKey: string; section: string; lyrics: string; isTitle?: boolean }
  const [slidesDeck, setSlidesDeck] = useState<SlidePage[] | null>(null)
  const [slidesGenerating, setSlidesGenerating] = useState(false)
  const [slidesOverlayOpen, setSlidesOverlayOpen] = useState(false)
  const [slidesActiveIndex, setSlidesActiveIndex] = useState(0)
  const [slidesEventLabel, setSlidesEventLabel] = useState("")

  useEffect(() => {
    if (!slidesOverlayOpen || !slidesDeck) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight" || e.key === "ArrowDown") setSlidesActiveIndex(i => Math.min(i + 1, slidesDeck.length - 1))
      else if (e.key === "ArrowLeft" || e.key === "ArrowUp") setSlidesActiveIndex(i => Math.max(i - 1, 0))
      else if (e.key === "Escape") setSlidesOverlayOpen(false)
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [slidesOverlayOpen, slidesDeck])

  async function loadData() {
    setLoading(true)
    const { data: teamsData } = await supabase.from("teams").select("id, name, team_type").eq("ministry_id", ministryId)
    const teamMap: Record<string, TeamInfo> = {}
    for (const t of teamsData ?? []) teamMap[t.id] = { id: t.id, name: t.name, team_type: t.team_type }
    setTeams(teamsData ?? [])

    const { data: weeksData } = await supabase
      .from("worship_weeks")
      .select("id, week_date, event_name, team_id")
      .eq("ministry_id", ministryId)
      .order("week_date", { ascending: false })
    if (!weeksData) { setLoading(false); return }

    const enrichedEvents: EventWithMeta[] = (weeksData as { id: string; week_date: string; event_name: string | null; team_id: string }[])
      .filter(w => teamMap[w.team_id])
      .map(w => ({
        id: w.id,
        week_date: w.week_date,
        event_name: w.event_name,
        team_id: w.team_id,
        teamName: teamMap[w.team_id]?.name ?? "",
        teamType: teamMap[w.team_id]?.team_type ?? "standard",
      }))
    setEvents(enrichedEvents)

    const eventIds = weeksData.map(w => w.id)
    if (eventIds.length > 0) {
      const { data: songsData } = await supabase
        .from("worship_songs")
        .select("id, week_id, title, key, song_leader_id, order_index, chart_url")
        .in("week_id", eventIds)
        .order("order_index")
      type RawSong = { id: string; week_id: string; title: string; key: string; song_leader_id: string | null; order_index: number; chart_url: string | null }
      const songMap: Record<string, WorshipSong[]> = {}
      for (const s of (songsData ?? []) as RawSong[]) {
        if (!songMap[s.week_id]) songMap[s.week_id] = []
        songMap[s.week_id].push({ id: s.id, week_id: s.week_id, title: s.title, key: s.key, song_leader_id: s.song_leader_id, song_leader_name: null, order_index: s.order_index, chart_url: s.chart_url })
      }
      setSongsByEvent(songMap)
    }
    setLoading(false)
  }

  useEffect(() => { loadData() }, [ministryId])

  function handleExportSlides(songs: WorshipSong[]) {
    const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    const html = `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><title>Worship Slides</title><style>*{box-sizing:border-box;margin:0;padding:0}body{background:#1a0a1c;font-family:Georgia,serif}.slide{width:100vw;height:100vh;display:flex;flex-direction:column;align-items:center;justify-content:center;background:var(--plum);page-break-after:always}.title{font-size:clamp(48px,8vw,96px);color:var(--cream-on-dark);text-align:center;font-weight:400;line-height:1.15;padding:0 10vw}.key{margin-top:28px;font-family:monospace;font-size:clamp(18px,2.5vw,28px);color:rgba(246,244,239,.55);letter-spacing:.2em;text-transform:uppercase}@media print{.slide{page-break-after:always}}</style></head><body>${songs.map(s => `<div class="slide"><p class="title">${esc(s.title)}</p><p class="key">${esc(s.key)}</p></div>`).join("")}</body></html>`
    const blob = new Blob([html], { type: "text/html" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a"); a.href = url; a.download = "worship-slides.html"
    document.body.appendChild(a); a.click(); document.body.removeChild(a); URL.revokeObjectURL(url)
  }

  async function handleGenerateSlides(songs: WorshipSong[], eventLabel: string) {
    setSlidesGenerating(true)
    setSlidesEventLabel(eventLabel)
    const allSlides: SlidePage[] = []
    for (const song of songs) {
      allSlides.push({ songTitle: song.title, songKey: song.key, section: "", lyrics: "", isTitle: true })
      let ocrText = rawOcrBySong[song.id]
      if (!ocrText && song.chart_url) {
        try {
          const buf = await fetch(song.chart_url).then(r => r.arrayBuffer())
          const pdfjsLib = await import("pdfjs-dist")
          pdfjsLib.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs"
          const pdf = await pdfjsLib.getDocument({ data: new Uint8Array(buf) }).promise
          const page = await pdf.getPage(1)
          const viewport = page.getViewport({ scale: 2 })
          const canvas = document.createElement("canvas"); canvas.width = viewport.width; canvas.height = viewport.height
          const ctx = canvas.getContext("2d")
          if (ctx) {
            await page.render({ canvasContext: ctx, viewport, canvas }).promise
            const { createWorker } = await import("tesseract.js")
            const worker = await createWorker("eng")
            const result = await worker.recognize(canvas); await worker.terminate()
            ocrText = result.data.text
            setRawOcrBySong(prev => ({ ...prev, [song.id]: ocrText }))
          }
        } catch (e) { console.error("[slides] OCR failed for", song.title, e) }
      }
      if (ocrText) {
        try {
          const res = await fetch("/api/generate-slides", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ ocrText }) })
          if (res.ok) {
            const data = await res.json()
            for (const s of (data.sections ?? [])) allSlides.push({ songTitle: song.title, songKey: song.key, section: s.section, lyrics: s.lyrics })
            continue
          }
        } catch { /* fallback */ }
      }
      allSlides.push({ songTitle: song.title, songKey: song.key, section: "", lyrics: song.title })
    }
    setSlidesDeck(allSlides); setSlidesActiveIndex(0); setSlidesOverlayOpen(true); setSlidesGenerating(false)
  }

  const sundayEvents = events.filter(e => e.teamType === "standard")
  const dgPraiseEvents = events.filter(e => e.teamType === "dg_praise")
  const oneTimeEvents = events.filter(e => e.teamType === "one_time")

  const renderEventCard = (event: EventWithMeta, showTeamName: boolean) => {
    const songs = [...(songsByEvent[event.id] ?? [])].sort((a, b) => a.order_index - b.order_index)
    const label = event.event_name ?? (showTeamName ? event.teamName : event.teamName)
    const dateStr = new Date(event.week_date + "T12:00:00").toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })
    return (
      <div key={event.id} style={{ background: "var(--cream-panel)", border: "1px solid var(--line)", borderRadius: 12, overflow: "hidden", marginBottom: 12 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 18px", borderBottom: songs.length > 0 ? "1px solid var(--line-3)" : "none" }}>
          <div>
            {event.event_name && <p style={{ fontFamily: "var(--font-instrument-serif)", fontSize: 16, color: "var(--ink)" }}>{event.event_name}</p>}
            {showTeamName && !event.event_name && <p style={{ fontFamily: "var(--font-instrument-serif)", fontSize: 16, color: "var(--ink)" }}>{event.teamName}</p>}
            <p style={{ fontSize: 15, color: event.event_name || showTeamName ? "var(--muted-text)" : "var(--ink)", marginTop: event.event_name || showTeamName ? 1 : 0, fontFamily: "var(--font-instrument-serif)" }}>{dateStr}</p>
          </div>
          {songs.length > 0 && canManage && (
            <div style={{ display: "flex", gap: 8 }}>
              <CentralButton
                variant="primary" size="sm"
                onClick={() => slidesDeck && slidesEventLabel === label ? setSlidesOverlayOpen(true) : handleGenerateSlides(songs, label)}
                disabled={slidesGenerating}>
                {slidesGenerating && slidesEventLabel === label ? "…" : "Slides"}
              </CentralButton>
              <button onClick={() => handleExportSlides(songs)}
                style={{ padding: "6px 12px", background: "transparent", color: "var(--plum)", borderRadius: 8, fontSize: 12, fontWeight: 600, border: "1px solid var(--plum)", cursor: "pointer" }}>
                Export
              </button>
            </div>
          )}
        </div>
        {songs.map((song, i) => (
          <div key={song.id} style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 18px", borderBottom: i < songs.length - 1 ? "1px solid var(--line-3)" : "none" }}>
            <span style={{ fontFamily: "var(--mono)", fontSize: 11, color: "var(--faint)", minWidth: 18 }}>{i + 1}</span>
            <span style={{ fontFamily: "var(--font-instrument-serif)", fontSize: 17, color: "var(--ink)", flex: 1 }}>{song.title || <span style={{ fontFamily: "var(--font-inter)", fontSize: 14, color: "var(--faint)" }}>Untitled</span>}</span>
            {song.key && <span style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", width: 26, height: 26, fontFamily: "var(--mono)", fontSize: 11, fontWeight: 700, color: "var(--plum-2)", background: "#EDE3EE", borderRadius: 7 }}>{song.key}</span>}
          </div>
        ))}
        {songs.length === 0 && <p style={{ fontSize: 13, color: "var(--faint)", padding: "12px 18px" }}>No songs in set.</p>}
      </div>
    )
  }

  if (loading) return <div style={{ textAlign: "center", padding: "60px 0", color: "var(--muted-text)", fontSize: 14 }}>Loading…</div>

  return (
    <div>
      {/* Slides overlay */}
      {slidesOverlayOpen && slidesDeck && (() => {
        const slide = slidesDeck[slidesActiveIndex]
        return (
          <div style={{ position: "fixed", inset: 0, zIndex: 200, background: "var(--plum)", display: "flex", flexDirection: "column" }}>
            <div style={{ position: "absolute", inset: 0, background: "radial-gradient(ellipse at 50% 55%, rgba(246,244,239,0.12) 0%, transparent 65%)", pointerEvents: "none" }} />
            <button onClick={() => setSlidesOverlayOpen(false)} style={{ position: "absolute", top: 20, right: 20, zIndex: 10, width: 36, height: 36, borderRadius: "50%", background: "rgba(246,244,239,0.12)", border: "none", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", color: "var(--cream-on-dark)" }}>
              <X className="w-5 h-5" />
            </button>
            <div onClick={() => setSlidesActiveIndex(i => Math.max(i - 1, 0))} style={{ position: "absolute", left: 0, top: 0, width: "33%", height: "100%", zIndex: 5, cursor: slidesActiveIndex > 0 ? "pointer" : "default" }} />
            <div onClick={() => setSlidesActiveIndex(i => Math.min(i + 1, slidesDeck.length - 1))} style={{ position: "absolute", right: 0, top: 0, width: "33%", height: "100%", zIndex: 5, cursor: slidesActiveIndex < slidesDeck.length - 1 ? "pointer" : "default" }} />
            <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "72px 40px 80px", textAlign: "center", position: "relative", zIndex: 6 }}>
              {slide.isTitle ? (
                <>
                  <p style={{ fontFamily: "var(--font-inter)", fontSize: 11, fontWeight: 600, letterSpacing: "0.16em", textTransform: "uppercase" as const, color: "rgba(246,244,239,0.62)", marginBottom: 20 }}>{slide.songKey ? `Key of ${slide.songKey}` : ""}</p>
                  <p style={{ fontFamily: "var(--font-instrument-serif)", fontSize: "clamp(36px,7vw,72px)", color: "var(--cream-on-dark)", lineHeight: 1.15, fontWeight: 400 }}>{slide.songTitle}</p>
                  <div style={{ width: 40, height: 1.5, background: "rgba(246,244,239,0.32)", margin: "28px auto 0" }} />
                </>
              ) : (
                <>
                  <p style={{ fontFamily: "var(--font-instrument-serif)", fontSize: 15, color: "rgba(246,244,239,0.45)", marginBottom: 6 }}>{slide.songTitle}</p>
                  {slide.section && <p style={{ fontFamily: "var(--font-inter)", fontSize: 11, fontWeight: 600, letterSpacing: "0.14em", textTransform: "uppercase" as const, color: "rgba(246,244,239,0.35)", marginBottom: 28 }}>{slide.section}</p>}
                  <p style={{ fontFamily: "var(--font-instrument-serif)", fontSize: "clamp(26px,5.5vw,52px)", color: "var(--cream-on-dark)", lineHeight: 1.35, fontWeight: 400, whiteSpace: "pre-line" as const }}>{slide.lyrics}</p>
                </>
              )}
            </div>
            <div style={{ position: "absolute", bottom: 28, left: 0, right: 0, textAlign: "center", zIndex: 6 }}>
              <span style={{ fontFamily: "var(--font-inter)", fontSize: 13, color: "rgba(246,244,239,0.4)" }}>{slidesActiveIndex + 1} / {slidesDeck.length}</span>
            </div>
          </div>
        )
      })()}

      {/* Sunday Service */}
      <div style={{ marginBottom: 36 }}>
        <p style={{ ...monoStyle, marginBottom: 16 }}>Sunday Service</p>
        {sundayEvents.length === 0 ? (
          <div style={{ background: "var(--cream-panel)", border: "1.5px dashed var(--line-2)", borderRadius: 12, padding: "28px 20px", textAlign: "center" }}>
            <p style={{ fontSize: 13, color: "var(--muted-text)" }}>No Sunday sets yet.</p>
          </div>
        ) : sundayEvents.map(e => renderEventCard(e, false))}
      </div>

      {/* DG Praise */}
      {dgPraiseEvents.length > 0 && (
        <div style={{ marginBottom: 36 }}>
          <p style={{ ...monoStyle, marginBottom: 16 }}>DG Praise</p>
          {dgPraiseEvents.map(e => renderEventCard(e, true))}
        </div>
      )}

      {/* One-Time */}
      {oneTimeEvents.length > 0 && (
        <div style={{ marginBottom: 36 }}>
          <p style={{ ...monoStyle, marginBottom: 16 }}>One-Time</p>
          {oneTimeEvents.map(e => renderEventCard(e, true))}
        </div>
      )}
    </div>
  )
}

// ── SetListPdfViewer ──────────────────────────────────────────────────────────

function SetListPdfViewer({
  song,
  canManage,
  userId,
  onClose,
  onSongUpdate,
}: {
  song: WorshipSong
  canManage: boolean
  userId: string
  onClose: () => void
  onSongUpdate: (field: "title" | "key", value: string) => void
}) {
  const supabase = createClient()
  const containerRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const renderTaskRef = useRef<{ cancel: () => void } | null>(null)
  const [pdfDoc, setPdfDoc] = useState<{ numPages: number; getPage: (n: number) => Promise<unknown> } | null>(null)
  const [numPages, setNumPages] = useState(0)
  const [currentPage, setCurrentPage] = useState(1)
  const [annotations, setAnnotations] = useState<AnnotationObj[]>([])
  const [pendingAnnotation, setPendingAnnotation] = useState<{ x: number; y: number } | null>(null)
  const [pendingText, setPendingText] = useState("")
  const [savingAnnotation, setSavingAnnotation] = useState(false)
  const [loading, setLoading] = useState(true)
  const [editingField, setEditingField] = useState<"title" | "key" | null>(null)
  const [editValue, setEditValue] = useState("")

  useEffect(() => {
    if (!song.chart_url) { setLoading(false); return }
    let cancelled = false
    async function load() {
      setLoading(true)
      const pdfjsLib = await import("pdfjs-dist")
      pdfjsLib.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs"
      try {
        const doc = await pdfjsLib.getDocument(song.chart_url!).promise
        if (!cancelled) { setPdfDoc(doc as typeof pdfDoc); setNumPages(doc.numPages); setLoading(false) }
      } catch { if (!cancelled) setLoading(false) }
    }
    load()
    return () => { cancelled = true }
  }, [song.chart_url])

  useEffect(() => {
    if (!pdfDoc || !canvasRef.current) return
    let cancelled = false
    async function render() {
      if (renderTaskRef.current) { renderTaskRef.current.cancel(); renderTaskRef.current = null }
      const page = await (pdfDoc as { getPage: (n: number) => Promise<unknown> }).getPage(currentPage) as {
        getViewport: (o: { scale: number }) => { width: number; height: number }
        render: (o: { canvasContext: CanvasRenderingContext2D; viewport: { width: number; height: number } }) => { promise: Promise<void>; cancel: () => void }
      }
      if (cancelled) return
      const canvas = canvasRef.current!
      const containerWidth = containerRef.current?.clientWidth ?? 360
      const vp1 = page.getViewport({ scale: 1 })
      const scale = (containerWidth - 32) / vp1.width
      const viewport = page.getViewport({ scale })
      canvas.width = viewport.width
      canvas.height = viewport.height
      const ctx = canvas.getContext("2d")!
      const task = page.render({ canvasContext: ctx, viewport })
      renderTaskRef.current = task
      try { await task.promise } catch { /* cancelled */ }
    }
    render()
    return () => { cancelled = true }
  }, [pdfDoc, currentPage])

  useEffect(() => {
    async function load() {
      const { data } = await supabase
        .from("worship_annotations")
        .select("annotation_data")
        .eq("chart_id", song.id)
        .single()
      setAnnotations((data?.annotation_data ?? []) as AnnotationObj[])
    }
    load()
  }, [song.id])

  async function handleSaveAnnotation() {
    if (!pendingText.trim() || !pendingAnnotation) return
    setSavingAnnotation(true)
    const newAnn: AnnotationObj = { id: crypto.randomUUID(), x: pendingAnnotation.x, y: pendingAnnotation.y, color: "#FDE68A", text: pendingText.trim() }
    const updated = [...annotations, newAnn]
    await supabase.from("worship_annotations")
      .upsert({ chart_id: song.id, user_id: userId, annotation_data: updated, updated_at: new Date().toISOString() }, { onConflict: "chart_id" })
    setAnnotations(updated)
    setPendingAnnotation(null)
    setPendingText("")
    setSavingAnnotation(false)
  }

  async function handleDeleteAnnotation(annId: string) {
    const updated = annotations.filter(a => a.id !== annId)
    await supabase.from("worship_annotations")
      .upsert({ chart_id: song.id, user_id: userId, annotation_data: updated, updated_at: new Date().toISOString() }, { onConflict: "chart_id" })
    setAnnotations(updated)
  }

  function handlePdfAreaClick(e: React.MouseEvent<HTMLDivElement>) {
    if (!canManage || pendingAnnotation || !canvasRef.current) return
    const rect = canvasRef.current.getBoundingClientRect()
    if (e.clientX < rect.left || e.clientX > rect.right || e.clientY < rect.top || e.clientY > rect.bottom) return
    const x = ((e.clientX - rect.left) / rect.width) * 100
    const y = ((e.clientY - rect.top) / rect.height) * 100
    setPendingAnnotation({ x, y })
    setPendingText("")
  }

  async function handleSaveFieldEdit() {
    if (!editingField || !editValue.trim()) { setEditingField(null); return }
    await supabase.from("worship_songs").update({ [editingField]: editValue.trim() }).eq("id", song.id)
    onSongUpdate(editingField, editValue.trim())
    setEditingField(null)
  }

  const monoStyle: React.CSSProperties = EYEBROW_STYLE

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 200, background: "var(--ink)", display: "flex", flexDirection: "column" }}>
      {/* Toolbar */}
      <div style={{ background: "#1E1825", borderBottom: "1px solid rgba(255,255,255,0.08)", padding: "14px 16px", paddingTop: 52, display: "flex", alignItems: "center", gap: 12, flexShrink: 0 }}>
        <button onClick={onClose} style={{ padding: 6, background: "transparent", border: "none", cursor: "pointer", color: "var(--muted-text)", display: "flex", alignItems: "center", flexShrink: 0 }}>
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div style={{ flex: 1, minWidth: 0 }}>
          {editingField === "title" ? (
            <input
              autoFocus
              value={editValue}
              onChange={e => setEditValue(e.target.value)}
              onBlur={handleSaveFieldEdit}
              onKeyDown={e => { if (e.key === "Enter") handleSaveFieldEdit(); if (e.key === "Escape") setEditingField(null) }}
              style={{ width: "100%", background: "transparent", border: "none", borderBottom: "1px solid rgba(255,255,255,0.2)", outline: "none", fontFamily: "var(--font-instrument-serif)", fontSize: 18, color: "var(--cream-on-dark)", padding: "2px 0" }}
            />
          ) : (
            <button onClick={canManage ? () => { setEditingField("title"); setEditValue(song.title) } : undefined}
              style={{ background: "transparent", border: "none", cursor: canManage ? "text" : "default", fontFamily: "var(--font-instrument-serif)", fontSize: 18, color: "var(--cream-on-dark)", padding: 0, textAlign: "left", maxWidth: "100%", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" as const, display: "block" }}>
              {song.title || <span style={{ color: "var(--body)" }}>Untitled</span>}
            </button>
          )}
          {editingField === "key" ? (
            <input
              autoFocus
              value={editValue}
              onChange={e => setEditValue(e.target.value)}
              onBlur={handleSaveFieldEdit}
              onKeyDown={e => { if (e.key === "Enter") handleSaveFieldEdit(); if (e.key === "Escape") setEditingField(null) }}
              style={{ background: "transparent", border: "none", borderBottom: "1px solid rgba(255,255,255,0.2)", outline: "none", ...monoStyle, color: "var(--cream-on-dark)", padding: "2px 0", width: 60 }}
            />
          ) : (
            <button onClick={canManage ? () => { setEditingField("key"); setEditValue(song.key) } : undefined}
              style={{ background: "transparent", border: "none", cursor: canManage ? "text" : "default", ...monoStyle, color: song.key ? "var(--plum)" : "var(--body)", padding: 0 }}>
              {song.key || "NO KEY"}
            </button>
          )}
        </div>
        {numPages > 1 && (
          <div style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
            <button onClick={() => setCurrentPage(p => Math.max(1, p - 1))} disabled={currentPage === 1}
              style={{ padding: 4, background: "transparent", border: "none", cursor: "pointer", color: "var(--muted-text)", opacity: currentPage === 1 ? 0.4 : 1, display: "flex" }}>
              <ChevronLeft className="w-4 h-4" />
            </button>
            <span style={{ fontSize: 12, color: "var(--muted-text)", minWidth: 36, textAlign: "center" as const }}>{currentPage}/{numPages}</span>
            <button onClick={() => setCurrentPage(p => Math.min(numPages, p + 1))} disabled={currentPage === numPages}
              style={{ padding: 4, background: "transparent", border: "none", cursor: "pointer", color: "var(--muted-text)", opacity: currentPage === numPages ? 0.4 : 1, display: "flex" }}>
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        )}
      </div>

      {/* PDF + annotation area */}
      <div ref={containerRef} style={{ flex: 1, overflowY: "auto", display: "flex", flexDirection: "column", alignItems: "center", padding: 16, background: "var(--ink)" }}
        onClick={handlePdfAreaClick}>
        {loading ? (
          <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", color: "var(--muted-text)", fontSize: 14 }}>Loading…</div>
        ) : !song.chart_url ? (
          <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", color: "var(--muted-text)", fontSize: 14 }}>No chart uploaded for this song.</div>
        ) : (
          <div style={{ position: "relative", display: "inline-block" }}>
            <canvas ref={canvasRef} style={{ display: "block", borderRadius: 6, boxShadow: "0 4px 24px rgba(0,0,0,0.5)" }} />

            {/* Saved annotations */}
            {annotations.map(ann => (
              <div key={ann.id}
                onClick={e => { e.stopPropagation(); if (canManage) handleDeleteAnnotation(ann.id) }}
                title={canManage ? "Click to delete" : undefined}
                style={{
                  position: "absolute", left: `${ann.x}%`, top: `${ann.y}%`,
                  transform: "translate(-50%, -50%)",
                  background: ann.color, borderRadius: 6, padding: "4px 8px",
                  fontSize: 11, fontWeight: 600, color: "var(--ink)",
                  boxShadow: "0 2px 8px rgba(0,0,0,0.35)",
                  maxWidth: 160, wordBreak: "break-word" as const,
                  cursor: canManage ? "pointer" : "default",
                  zIndex: 10, pointerEvents: "auto",
                }}>
                {ann.text}
              </div>
            ))}

            {/* Pending annotation input */}
            {pendingAnnotation && (
              <div
                onClick={e => e.stopPropagation()}
                style={{
                  position: "absolute", left: `${pendingAnnotation.x}%`, top: `${pendingAnnotation.y}%`,
                  transform: "translate(-50%, -50%)",
                  background: "var(--cream)", borderRadius: 10, padding: 12,
                  boxShadow: "0 4px 24px rgba(0,0,0,0.5)", zIndex: 20, width: 190,
                }}>
                <input
                  autoFocus
                  value={pendingText}
                  onChange={e => setPendingText(e.target.value)}
                  onKeyDown={e => { if (e.key === "Enter") handleSaveAnnotation(); if (e.key === "Escape") setPendingAnnotation(null) }}
                  placeholder="Add note…"
                  style={{ width: "100%", border: "none", outline: "none", fontSize: 12, color: "var(--ink)", marginBottom: 8, boxSizing: "border-box" as const }}
                />
                <div style={{ display: "flex", gap: 6 }}>
                  <CentralButton variant="primary" size="sm" onClick={handleSaveAnnotation} disabled={savingAnnotation || !pendingText.trim()}
                    style={{ flex: 1 }}>
                    Save
                  </CentralButton>
                  <button onClick={() => setPendingAnnotation(null)}
                    style={{ padding: "5px 8px", background: "#F0EDE8", color: "var(--body)", border: "none", borderRadius: 6, fontSize: 11, cursor: "pointer" }}>
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Hint bar */}
      {canManage && !loading && song.chart_url && (
        <div style={{ padding: "10px 16px", background: "#1E1825", borderTop: "1px solid rgba(255,255,255,0.06)", flexShrink: 0, textAlign: "center" }}>
          <p style={{ fontSize: 11, color: "var(--body)" }}>Tap anywhere on the chart to add a note · tap a note to delete it</p>
        </div>
      )}
    </div>
  )
}

// ── MinistryCalendar ──────────────────────────────────────────────────────────

// Planned / needs-planning status pills — semantic tokens only (DESIGN_SYSTEM §8:
// no raw traffic-light hex). Text colors are darkened for AA contrast at 10px.
const PLAN_STATUS_PILL: Record<"planned" | "needsPlanning", React.CSSProperties> = {
  planned: {
    fontSize: 10, fontWeight: 500, borderRadius: 9999, padding: "2px 8px",
    color: "var(--sage)",
    background: "color-mix(in srgb, var(--success) 15%, transparent)",
  },
  needsPlanning: {
    fontSize: 10, fontWeight: 500, borderRadius: 9999, padding: "2px 8px",
    color: "color-mix(in srgb, var(--warm-tan) 75%, var(--ink))",
    background: "color-mix(in srgb, var(--warm-tan) 12%, transparent)",
  },
}

const CATEGORY_CONFIG = {
  welcoming: { label: "Welcoming", dot: "var(--plum)", bg: "#EDE5F0", text: "var(--plum)" },
  retreat:   { label: "Retreat",   dot: "var(--body)", bg: "var(--body-bg)", text: "var(--plum)" },
  social:    { label: "Social",    dot: "var(--muted-text)", bg: "var(--cream-panel)", text: "var(--body)" },
  service:   { label: "Service",   dot: "var(--plum)", bg: "#F0EDE8", text: "var(--plum)" },
  regular:   { label: "Regular",   dot: "var(--muted-text)", bg: "#F3F0F7", text: "var(--body)" },
} as const

type EventTypeConfig = {
  label: string; icon: string; dot: string; bg: string; text: string
  budgetCategory: string | null; canHaveSubEvents: boolean; description: string
  defaultPhases: { key: string; label: string; tasks: string[] }[]
  defaultRoles: { name: string; notes: string }[]
  extraTabs: EventExtraTab[]
}

const EVENT_TYPE_CONFIGS: Record<EventType, EventTypeConfig> = {
  welcome_week: {
    label: "Welcome Week", icon: "🎉", dot: "var(--plum)", bg: "#EDE5F0", text: "var(--plum)",
    budgetCategory: "welcoming_week", canHaveSubEvents: true,
    description: "Multi-day freshman welcome — Popsicle Socials, Game Night, Sports Day, Welcoming Night, Praise Night. Plan in June; reserve all venues in June.",
    defaultPhases: [
      { key: "pre_event", label: "June Planning", tasks: [
        "Reserve venues for all five sub-events (Popsicle Social, Game Night, Sports, Welcoming Night, Praise Night)",
        "Submit space reservation requests for Pitt and CMU venues",
        "Design promotional graphics and Instagram posts",
        "Coordinate with DGL team — confirm who is cooking each night",
        "Coordinate with Praise Team for Praise Night worship",
        "Finalize food budget and assign purchasers per sub-event",
        "Plan games, icebreakers, and activities for each night",
        "Draft Welcome Week announcement",
      ]},
      { key: "day_of", label: "Week Of", tasks: [
        "Send daily reminder posts and announcements",
        "Confirm food orders and grocery runs for each night",
        "Confirm all volunteers and point-of-contact per sub-event",
        "Set up venue for each event (tables, decorations, AV)",
        "Log new folks at each event for follow-up",
      ]},
      { key: "post_event", label: "Post-Week", tasks: [
        "Compile full list of new folks for DGL follow-up",
        "Submit all reimbursement forms",
        "Post recap photos on Instagram",
        "Send thank-you messages to all volunteers",
        "CCSF debrief — what worked, what to improve",
      ]},
    ],
    defaultRoles: [
      { name: "President", notes: "Overall lead — final decision maker, coordinates all sub-events" },
      { name: "Event Coordinator (Pitt)", notes: "Space reservations, setup/teardown, cleanup crew for Pitt events" },
      { name: "Event Coordinator (CMU)", notes: "Space reservations, setup/teardown, cleanup crew for CMU events" },
      { name: "Secretary", notes: "Promotional graphics, Instagram, flyers, slideshow announcements" },
      { name: "DGL Liaison", notes: "Coordinates with DGL team for dinner cooking rotations" },
      { name: "Praise Team Liaison", notes: "Coordinates Praise Night worship with Praise Team" },
    ],
    extraTabs: ["sub_events"],
  },
  coffeehouse: {
    label: "Coffeehouse", icon: "☕", dot: "var(--warm-tan)", bg: "#FDF6EC", text: "#6B4C1E",
    budgetCategory: "coffeehouse", canHaveSubEvents: false,
    description: "Annual talent show — performances, praise, and testimony. Held at Rangos Hall (CMU). ~$123 budget for coffee and snacks.",
    defaultPhases: [
      { key: "pre_event", label: "Pre-Event", tasks: [
        "Book Rangos Hall (CMU) and reserve AV equipment",
        "Open performer sign-ups (music, spoken word, comedy, dance)",
        "Plan run-of-show: performances → praise set → testimony",
        "Design flyers and promotional graphics",
        "Post Instagram promo and reminders",
        "Coordinate sound check schedule with performers",
        "Arrange coffee and snacks (budget ~$123)",
        "Recruit MC and backstage helpers",
      ]},
      { key: "day_of", label: "Day-of", tasks: [
        "AV and stage setup at Rangos Hall",
        "Sound check per performer — vocals, instruments, backing tracks",
        "MC briefing and run-of-show walkthrough",
        "Welcome guests at the door",
        "Run the show — keep transitions tight",
        "Cleanup and load-out",
      ]},
      { key: "post_event", label: "Post-Event", tasks: [
        "Submit reimbursement form (coffee/snacks)",
        "Post photos and recap on Instagram",
        "Thank all performers and volunteers",
      ]},
    ],
    defaultRoles: [
      { name: "President", notes: "Oversees performer bookings and run-of-show coordination" },
      { name: "Secretary", notes: "Flyers, Instagram promo, announcement slides, event photography" },
      { name: "Event Coordinator", notes: "Rangos Hall booking, AV setup, sound check logistics" },
      { name: "MC / Emcee", notes: "Hosts the night and keeps the program moving" },
      { name: "Sound Tech", notes: "PA system, mic levels, backing track playback" },
      { name: "Food Lead", notes: "Coffee and snacks setup and service" },
    ],
    extraTabs: ["acts"],
  },
  turkey_bowl: {
    label: "Turkey Bowl", icon: "🏈", dot: "var(--sage)", bg: "#EEF4F1", text: "#2D5445",
    budgetCategory: "turkeybowl", canHaveSubEvents: false,
    description: "Annual flag football tournament in November. Separate men's and women's divisions. Budget ~$1,500–1,700 (shirts are the dominant cost).",
    defaultPhases: [
      { key: "pre_event", label: "Pre-Event", tasks: [
        "Reserve field location",
        "Open sign-ups for men's and women's divisions",
        "Design and order jerseys/shirts — submit order early (3–4 week lead time, ~$1,500)",
        "Confirm shirt sizes and names",
        "Organize teams and brackets for both divisions",
        "Coordinate food and cookout supplies",
        "Get equipment: footballs, cones, first aid kit",
        "Create announcement and promo graphics",
      ]},
      { key: "day_of", label: "Day-of", tasks: [
        "Field setup — cones, boundaries, end zones",
        "Distribute shirts to players",
        "Run men's division games",
        "Run women's division games",
        "Cookout — grill, serve food",
        "Award ceremony (if applicable)",
        "Cleanup",
      ]},
      { key: "post_event", label: "Post-Event", tasks: [
        "Submit reimbursement form (shirts, food)",
        "Post game photos and results on Instagram",
        "Archive final brackets and scores",
      ]},
    ],
    defaultRoles: [
      { name: "Men's Game Commissioner", notes: "Runs men's bracket — rules, scheduling, officiating" },
      { name: "Women's Game Commissioner", notes: "Runs women's bracket — rules, scheduling, officiating" },
      { name: "Shirt Coordinator", notes: "Manages jersey design, sizing, ordering — critical lead-time task" },
      { name: "Equipment Lead", notes: "Footballs, cones, first aid, field markers" },
      { name: "Food Lead", notes: "Grill, cookout, serving, cleanup" },
      { name: "Secretary", notes: "Promo graphics, Instagram, event photos" },
    ],
    extraTabs: ["teams"],
  },
  retreat: {
    label: "Retreat", icon: "⛺", dot: "var(--body)", bg: "var(--body-bg)", text: "var(--plum)",
    budgetCategory: "retreat", canHaveSubEvents: false,
    description: "Overnight or weekend retreat. Retreat leaders run the program; CCSF handles logistics support. Women's: October · Men's: February · EM: March.",
    defaultPhases: [
      { key: "pre_event", label: "6 Weeks Out", tasks: [
        "Confirm retreat dates and type (Women's / Men's / EM)",
        "Book retreat location and confirm capacity",
        "Plan transportation — identify drivers, confirm car capacity",
        "Create sign-up form with payment collection",
        "Coordinate with retreat leaders on program and session schedule",
        "Coordinate with Praise Team for worship sessions",
        "Draft packing list for attendees",
      ]},
      { key: "day_of", label: "2 Weeks Out", tasks: [
        "Confirm headcount and finalize lodge room assignments",
        "Finalize transportation roster — every rider confirmed with a driver",
        "Send packing list and logistics info to all attendees",
        "Purchase supplies, food, and any retreat materials",
        "Confirm payment collection is complete",
      ]},
      { key: "post_event", label: "Post-Retreat", tasks: [
        "Submit all reimbursement forms (food, supplies, any deposits)",
        "CCSF and retreat leaders debrief",
        "Follow up with new folks who attended",
        "Post photos recap",
      ]},
    ],
    defaultRoles: [
      { name: "Retreat Lead", notes: "Overall point of contact — final decisions on logistics and program" },
      { name: "Transportation Coordinator", notes: "Assigns every attendee a driver; confirms car capacities" },
      { name: "Program Director", notes: "Retreat leaders design and run sessions — CCSF coordinates support" },
      { name: "Worship Leader", notes: "Leads worship sessions during retreat" },
      { name: "Treasurer Liaison", notes: "Manages sign-up payments, tracks deposits, submits reimbursements" },
      { name: "Logistics Lead", notes: "Food, supplies, lodging check-in, and day-of execution" },
    ],
    extraTabs: ["transport", "program"],
  },
  appreciation_night: {
    label: "Appreciation Night", icon: "✨", dot: "#C97BB0", bg: "#FAF0F7", text: "#8A3070",
    budgetCategory: "appreciation_night", canHaveSubEvents: false,
    description: "SAN (Sisters Appreciation Night) or GAN (Guys Appreciation Night) — both held in February. Led by Event Coordinator. Costs: flowers, food, venue.",
    defaultPhases: [
      { key: "pre_event", label: "Pre-Event", tasks: [
        "Reserve venue",
        "Plan program — activities, performances, speeches",
        "Order flowers and arrange decorations",
        "Coordinate food and drinks",
        "Design and post invitation announcement",
        "Recruit helpers for setup and service",
      ]},
      { key: "day_of", label: "Day-of", tasks: [
        "Setup decorations, flowers, tables, and lighting",
        "Welcome guests at the door",
        "Run the program — MC keeps it on schedule",
        "Serve food and drinks",
        "Cleanup",
      ]},
      { key: "post_event", label: "Post-Event", tasks: [
        "Submit reimbursement form (flowers, food, venue)",
        "Post photos on Instagram",
        "Thank all volunteers and helpers",
      ]},
    ],
    defaultRoles: [
      { name: "Event Coordinator (Lead)", notes: "Overall lead — owned by Event Coordinator role on CCSF" },
      { name: "Decoration Lead", notes: "Flowers, lighting, table setup — sets the atmosphere" },
      { name: "Food Lead", notes: "Coordinates food and drinks for guests" },
      { name: "MC / Emcee", notes: "Hosts the night and runs the program" },
      { name: "Photographer", notes: "Photos and video coverage for Instagram recap" },
    ],
    extraTabs: [],
  },
  social: {
    label: "Social", icon: "🎊", dot: "var(--muted-text)", bg: "var(--cream-panel)", text: "var(--body)",
    budgetCategory: null, canHaveSubEvents: false,
    description: "Informal social events — Church Picnic, game nights, IM sports, community volunteering (Wilkinsburg Food Pantry), or any hangout.",
    defaultPhases: [
      { key: "pre_event", label: "Pre-Event", tasks: ["Reserve location or confirm venue", "Coordinate food or activity supplies", "Create announcement or invite"] },
      { key: "day_of", label: "Day-of", tasks: ["Setup", "Welcome guests", "Run activity or game", "Clean up"] },
    ],
    defaultRoles: [
      { name: "Event Lead", notes: "Point of contact and day-of coordinator" },
      { name: "Food Coordinator", notes: "Food and drinks logistics" },
    ],
    extraTabs: [],
  },
  ministry: {
    label: "Ministry Event", icon: "🙏", dot: "var(--plum)", bg: "#F3F0F7", text: "var(--body)",
    budgetCategory: null, canHaveSubEvents: false,
    description: "Prayer Meeting (PM), Bible study, outreach (campus involvement fairs), or service events.",
    defaultPhases: [
      { key: "pre_event", label: "Pre-Event", tasks: ["Prepare content, set list, or materials", "Create announcement", "Assign roles (worship lead, speaker, host)"] },
      { key: "day_of", label: "Day-of", tasks: ["Setup space", "Run the event", "Cleanup"] },
    ],
    defaultRoles: [
      { name: "Facilitator", notes: "" },
      { name: "Worship Lead", notes: "" },
    ],
    extraTabs: [],
  },
}

function getEventConfig(ev: { event_type?: EventType; category?: string }): { label: string; dot: string; bg: string; text: string; icon?: string } {
  if (ev.event_type && EVENT_TYPE_CONFIGS[ev.event_type]) return EVENT_TYPE_CONFIGS[ev.event_type]
  const cat = (ev.category ?? "regular") as keyof typeof CATEGORY_CONFIG
  return CATEGORY_CONFIG[cat] ?? CATEGORY_CONFIG.regular
}

export function MonthGrid({
  events,
  currentMonth,
  onMonthChange,
  onSelectEvent,
}: {
  events: CalendarEvent[]
  currentMonth: Date
  onMonthChange: (d: Date) => void
  onSelectEvent: (e: CalendarEvent) => void
}) {
  const year = currentMonth.getFullYear()
  const month = currentMonth.getMonth()
  const firstDayOfWeek = new Date(year, month, 1).getDay()
  const daysInMonth = new Date(year, month + 1, 0).getDate()

  const cells: (number | null)[] = [
    ...Array(firstDayOfWeek).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ]
  while (cells.length % 7 !== 0) cells.push(null)

  const today = new Date()
  const isToday = (day: number) =>
    today.getFullYear() === year && today.getMonth() === month && today.getDate() === day

  const eventsOnDay = (day: number) => {
    return events.filter((ev) => {
      const d = new Date(ev.start_date)
      return d.getFullYear() === year && d.getMonth() === month && d.getDate() === day
    })
  }

  const monthLabel = currentMonth.toLocaleDateString("en-US", { month: "long", year: "numeric" })

  return (
    <div>
      {/* Month nav */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 16, marginBottom: 12 }}>
        <button
          onClick={() => onMonthChange(new Date(year, month - 1, 1))}
          style={{ width: 28, height: 28, borderRadius: 8, border: "1px solid var(--line-2)", background: "var(--cream-panel)", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}
        >
          <ChevronLeft className="w-4 h-4 text-[var(--body)]" />
        </button>
        <span style={{ fontFamily: "var(--font-instrument-serif)", fontSize: 18, color: "var(--ink)", fontWeight: 400, minWidth: 180, textAlign: "center" }}>
          {monthLabel}
        </span>
        <button
          onClick={() => onMonthChange(new Date(year, month + 1, 1))}
          style={{ width: 28, height: 28, borderRadius: 8, border: "1px solid var(--line-2)", background: "var(--cream-panel)", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}
        >
          <ChevronRight className="w-4 h-4 text-[var(--body)]" />
        </button>
      </div>

      {/* Week header */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", marginBottom: 4 }}>
        {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => (
          <div key={d} style={{ ...MONO_STYLE, textAlign: "center", paddingBottom: 4 }}>
            {d}
          </div>
        ))}
      </div>

      {/* Grid */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", border: "1px solid var(--line-2)", borderRadius: 10, overflow: "hidden" }}>
        {cells.map((day, idx) => {
          const dayEvents = day ? eventsOnDay(day) : []
          const visible = dayEvents.slice(0, 2)
          const overflow = dayEvents.length - 2

          return (
            <div
              key={idx}
              style={{
                minHeight: 80,
                borderRight: idx % 7 !== 6 ? "1px solid var(--line-2)" : "none",
                borderBottom: idx < cells.length - 7 ? "1px solid var(--line-2)" : "none",
                background: day && isToday(day) ? "#F4F0F8" : "var(--cream-panel)",
                padding: "4px 3px 3px",
                position: "relative",
              }}
            >
              {day && (
                <>
                  <div style={{
                    textAlign: "right",
                    fontSize: 12,
                    fontWeight: isToday(day) ? 700 : 400,
                    color: isToday(day) ? "var(--plum)" : "var(--body)",
                    marginBottom: 2,
                    paddingRight: 2,
                  }}>
                    {day}
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                    {visible.map((ev) => {
                      const cfg = getEventConfig(ev)
                      return (
                        <button
                          key={ev.id}
                          onClick={() => onSelectEvent(ev)}
                          style={{
                            display: "block",
                            width: "100%",
                            textAlign: "left",
                            background: "none",
                            border: "none",
                            cursor: "pointer",
                            padding: "1px 4px 1px 6px",
                            borderLeft: `3px solid ${cfg.dot}`,
                            borderRadius: 2,
                            fontSize: 11,
                            color: "var(--ink)",
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            whiteSpace: "nowrap",
                            lineHeight: "18px",
                          }}
                          title={ev.title}
                        >
                          {ev.title}
                        </button>
                      )
                    })}
                    {overflow > 0 && (
                      <span style={{ fontSize: 10, color: "var(--muted-text)", paddingLeft: 4 }}>+{overflow} more</span>
                    )}
                  </div>
                </>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

export function TimelineView({
  events,
  onSelectEvent,
}: {
  events: CalendarEvent[]
  onSelectEvent: (e: CalendarEvent) => void
}) {
  // Group by yyyy-MM
  const groups: Record<string, CalendarEvent[]> = {}
  for (const ev of events) {
    const key = ev.start_date.slice(0, 7)
    if (!groups[key]) groups[key] = []
    groups[key].push(ev)
  }

  const monthKeys = Object.keys(groups).sort()

  if (monthKeys.length === 0) {
    return (
      <div style={{ textAlign: "center", padding: "40px 0", color: "var(--muted-text)", fontSize: 14 }}>
        No events yet.
      </div>
    )
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
      {monthKeys.map((key) => {
        const [yyyy, mm] = key.split("-")
        const monthLabel = new Date(Number(yyyy), Number(mm) - 1, 1).toLocaleDateString("en-US", { month: "long", year: "numeric" })
        return (
          <div key={key}>
            <div style={{ ...MONO_STYLE, marginBottom: 8 }}>
              {monthLabel}
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {groups[key].map((ev) => {
                const cfg = getEventConfig(ev)
                const startDate = new Date(ev.start_date)
                const endDate = new Date(ev.end_date)
                const dateStr = ev.all_day
                  ? startDate.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })
                  : startDate.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" }) +
                    " · " + startDate.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" }) +
                    " – " + endDate.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })

                return (
                  <button
                    key={ev.id}
                    onClick={() => onSelectEvent(ev)}
                    style={{
                      display: "flex",
                      alignItems: "flex-start",
                      gap: 10,
                      background: "var(--cream-panel)",
                      border: "1px solid var(--line-2)",
                      borderRadius: 10,
                      padding: "10px 12px",
                      cursor: "pointer",
                      textAlign: "left",
                      width: "100%",
                    }}
                  >
                    <div style={{ width: 8, height: 8, borderRadius: "50%", background: cfg.dot, flexShrink: 0, marginTop: 5 }} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                        <span style={{ fontWeight: 500, fontSize: 14, color: "var(--ink)" }}>{ev.title}</span>
                        <span style={{ fontSize: 11, fontWeight: 500, color: cfg.text, background: cfg.bg, padding: "1px 7px", borderRadius: 9999 }}>
                          {cfg.label}
                        </span>
                      </div>
                      <div style={{ fontSize: 12, color: "var(--muted-text)", marginTop: 2 }}>{dateStr}</div>
                      {ev.location && <div style={{ fontSize: 12, color: "var(--muted-text)", marginTop: 1 }}>{ev.location}</div>}
                    </div>
                  </button>
                )
              })}
            </div>
          </div>
        )
      })}
    </div>
  )
}

export function EventDetailPopover({
  event,
  canEdit,
  userId,
  onClose,
  onDelete,
  onPlan,
}: {
  event: CalendarEvent
  canEdit: boolean
  userId: string
  onClose: () => void
  onDelete: (id: string) => void
  onPlan: (ev: CalendarEvent) => void
}) {
  const cfg = getEventConfig(event)
  const startDate = new Date(event.start_date)
  const endDate = new Date(event.end_date)

  const dateStr = event.all_day
    ? startDate.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })
    : startDate.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" }) +
      " · " + startDate.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" }) +
      " – " + endDate.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })

  return (
    <CentralModal
      onClose={onClose}
      title={event.title}
      maxWidth={480}
      z={200}
      footer={
        <>
          {(canEdit || event.created_by === userId) && (
            <button
              onClick={() => onDelete(event.id)}
              style={{ display: "flex", alignItems: "center", gap: 6, background: "none", border: "1px solid var(--line)", borderRadius: 8, padding: "6px 12px", cursor: "pointer", fontSize: 13, color: "var(--danger)" }}
            >
              <Trash2 className="w-3.5 h-3.5" />
              Delete event
            </button>
          )}
          <CentralButton
            variant="primary" size="sm"
            onClick={() => onPlan(event)}
          >
            Plan this event →
          </CentralButton>
        </>
      }
    >
      <div style={{ marginBottom: 12 }}>
        <span style={{ fontSize: 11, fontWeight: 500, color: cfg.text, background: cfg.bg, padding: "3px 10px", borderRadius: 9999 }}>
          {cfg.label}
        </span>
      </div>
      <p style={{ fontSize: 13, color: "var(--muted-text)", margin: "0 0 6px" }}>{dateStr}</p>
      {event.location && (
        <p style={{ fontSize: 13, color: "var(--body)", margin: "0 0 12px" }}>📍 {event.location}</p>
      )}
      {event.description && (
        <p style={{ fontSize: 14, color: "var(--body)", lineHeight: 1.6, margin: 0 }}>{event.description}</p>
      )}
    </CentralModal>
  )
}

export function AddEventModal({
  ministryId,
  teamId,
  userId,
  onClose,
  onSaved,
  onDelete,
  parentEventId,
  excludeTypes,
  existing,
}: {
  ministryId: string
  teamId: string | null
  userId: string
  onClose: () => void
  onSaved: (ev: CalendarEvent) => void
  onDelete?: () => void
  parentEventId?: string | null
  excludeTypes?: EventType[]
  existing?: CalendarEvent
}) {
  const supabase = createClient()
  const isEditing = !!existing

  function parseDateStr(iso: string) {
    return iso ? iso.split("T")[0] : ""
  }
  function parseTimeStr(iso: string) {
    if (!iso) return "09:00"
    const t = iso.split("T")[1]
    if (!t) return "09:00"
    return t.slice(0, 5)
  }

  const [eventType, setEventType] = useState<EventType>(existing?.event_type ?? "social")
  const [title, setTitle] = useState(existing?.title ?? "")
  const [description, setDescription] = useState(existing?.description ?? "")
  const [location, setLocation] = useState(existing?.location ?? "")
  const [startDateStr, setStartDateStr] = useState(existing ? parseDateStr(existing.start_date) : "")
  const [startTimeStr, setStartTimeStr] = useState(existing ? parseTimeStr(existing.start_date) : "09:00")
  const [endDateStr, setEndDateStr] = useState(existing ? parseDateStr(existing.end_date) : "")
  const [endTimeStr, setEndTimeStr] = useState(existing ? parseTimeStr(existing.end_date) : "10:00")
  const [allDay, setAllDay] = useState(existing?.all_day ?? false)
  // Plan/crunch dates live on the event's event_plans row, edited here in EDIT
  // mode only (a new event's plan is seeded lazily by the overview). Crunch is
  // optional — an empty string saves as null (no crunch phase).
  const [planStartDate, setPlanStartDate] = useState("")
  const [crunchDate, setCrunchDate] = useState("")
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [deleteConfirm, setDeleteConfirm] = useState(false)
  const [deleting, setDeleting] = useState(false)

  // Seed plan/crunch from the event's plan (or the event−1mo / event−1wk defaults)
  // when editing an existing event.
  useEffect(() => {
    if (!isEditing || !existing) return
    let cancelled = false
    ;(async () => {
      const { data } = await supabase
        .from("event_plans")
        .select("plan_start_date, crunch_date")
        .eq("calendar_event_id", existing.id)
        .maybeSingle()
      if (cancelled) return
      const ev = new Date(existing.start_date)
      setPlanStartDate((data?.plan_start_date as string | null) || addMonthsYMD(ev, -1))
      setCrunchDate((data?.crunch_date as string | null) || addDaysYMD(ev, -7))
    })()
    return () => { cancelled = true }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function handleDelete() {
    if (!existing) return
    setDeleting(true)
    const { data: plan } = await supabase.from("event_plans").select("id").eq("calendar_event_id", existing.id).maybeSingle()
    if (plan) {
      await Promise.all([
        supabase.from("event_tasks").delete().eq("event_plan_id", plan.id),
        supabase.from("event_roles").delete().eq("event_plan_id", plan.id),
        supabase.from("event_notes").delete().eq("event_plan_id", plan.id),
      ])
      await supabase.from("event_plans").delete().eq("id", plan.id)
    }
    await supabase.from("calendar_events").delete().eq("id", existing.id)
    setDeleting(false)
    onDelete?.()
  }

  function eventTypeToCategory(et: EventType): string {
    const map: Record<EventType, string> = {
      welcome_week: "welcoming",
      coffeehouse: "social",
      turkey_bowl: "social",
      retreat: "retreat",
      appreciation_night: "social",
      social: "social",
      ministry: "regular",
    }
    return map[et] ?? "regular"
  }

  const availableTypes = (Object.keys(EVENT_TYPE_CONFIGS) as EventType[]).filter(t => !excludeTypes?.includes(t))
  const cfg = EVENT_TYPE_CONFIGS[eventType]

  async function handleSave() {
    if (!title.trim()) { setError("Title is required."); return }
    if (!startDateStr) { setError("Start date is required."); return }
    if (!endDateStr) { setError("End date is required."); return }

    const startTs = allDay
      ? `${startDateStr}T00:00:00+00:00`
      : `${startDateStr}T${startTimeStr}:00+00:00`
    const endTs = allDay
      ? `${endDateStr}T23:59:59+00:00`
      : `${endDateStr}T${endTimeStr}:00+00:00`

    const startDate = new Date(startTs)
    const endDate = new Date(endTs)
    const startYear = startDate.getFullYear()
    if (startYear < 2000 || startYear > 2100) { setError("Please enter a valid date."); return }
    if (endDate < startDate) { setError("End date must be after start date."); return }

    setSaving(true)
    setError(null)
    try {
      let evData: CalendarEvent | null = null

      if (isEditing && existing) {
        // Update existing event
        const { data, error: upErr } = await supabase
          .from("calendar_events")
          .update({
            title: title.trim(),
            description: description.trim() || null,
            location: location.trim() || null,
            start_date: startTs,
            end_date: endTs,
            all_day: allDay,
            category: eventTypeToCategory(eventType),
            event_type: eventType,
          })
          .eq("id", existing.id)
          .select("id, title, description, location, start_date, end_date, all_day, category, event_type, parent_event_id, linked_announcement_id, status, created_by")
          .single()
        if (upErr || !data) { setError(upErr?.message ?? "Failed to update event."); setSaving(false); return }
        evData = data as CalendarEvent

        // Persist plan/crunch dates to this event's plan row. Update first; if no
        // plan exists yet (0 rows), insert one. Crunch empty → null (no phase).
        const { data: planUpd } = await supabase
          .from("event_plans")
          .update({ plan_start_date: planStartDate || null, crunch_date: crunchDate || null })
          .eq("calendar_event_id", existing.id)
          .eq("ministry_id", ministryId)
          .select("id")
        if (!planUpd || planUpd.length === 0) {
          await supabase.from("event_plans").insert({
            ministry_id: ministryId,
            calendar_event_id: existing.id,
            created_by: userId,
            plan_start_date: planStartDate || null,
            crunch_date: crunchDate || null,
          })
        }
      } else {
        // Create new event
        const { data, error: evErr } = await supabase
          .from("calendar_events")
          .insert({
            ministry_id: ministryId,
            team_id: teamId,
            title: title.trim(),
            description: description.trim() || null,
            location: location.trim() || null,
            start_date: startTs,
            end_date: endTs,
            all_day: allDay,
            category: eventTypeToCategory(eventType),
            event_type: eventType,
            parent_event_id: parentEventId ?? null,
            created_by: userId,
          })
          .select("id, title, description, location, start_date, end_date, all_day, category, event_type, parent_event_id, linked_announcement_id, status, created_by")
          .single()

        if (evErr || !data) { setError(evErr?.message ?? "Failed to create event."); setSaving(false); return }
        evData = data as CalendarEvent

        // Auto-create event_plan and seed from template
        const { data: planData } = await supabase
          .from("event_plans")
          .insert({ ministry_id: ministryId, calendar_event_id: evData.id, created_by: userId })
          .select("id")
          .single()

        if (planData) {
          const planId = (planData as { id: string }).id
          const typeCfg = EVENT_TYPE_CONFIGS[eventType]

          if (typeCfg.defaultRoles.length > 0) {
            await supabase.from("event_roles").insert(
              typeCfg.defaultRoles.map(r => ({ event_plan_id: planId, role_name: r.name, notes: r.notes || null, created_by: userId }))
            )
          }

          const taskRows: { event_plan_id: string; title: string; phase: string; sort_order: number; completed: boolean; created_by: string }[] = []
          let sortIdx = 0
          for (const phase of typeCfg.defaultPhases) {
            for (const taskTitle of phase.tasks) {
              taskRows.push({ event_plan_id: planId, title: taskTitle, phase: phase.key, sort_order: sortIdx++, completed: false, created_by: userId })
            }
          }
          if (taskRows.length > 0) await supabase.from("event_tasks").insert(taskRows)
        }
      }

      onSaved(evData!)
    } catch (e: unknown) {
      setError((e as { message?: string }).message ?? "Failed to save event.")
    } finally {
      setSaving(false)
    }
  }

  const labelStyle: React.CSSProperties = {
    fontSize: 11, fontFamily: "var(--mono)",
    letterSpacing: "0.06em", textTransform: "uppercase", color: "var(--muted-text)", marginBottom: 4, display: "block",
  }

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 80, background: "var(--cream-panel)", display: "flex", flexDirection: "column", overflowY: "auto" }}>
      <div style={{ maxWidth: 600, width: "100%", margin: "0 auto", padding: "48px 24px 60px" }}>
        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 28 }}>
          <h2 style={{ fontFamily: "var(--font-instrument-serif)", fontSize: 28, fontWeight: 400, color: "var(--ink)", margin: 0 }}>
            {isEditing ? "Edit Event" : parentEventId ? "Add Sub-event" : "New Event"}
          </h2>
          <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", padding: 4 }}>
            <X className="w-5 h-5 text-[var(--muted-text)]" />
          </button>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 22 }}>
          {/* Event type picker — only shown when creating */}
          {!isEditing && (
            <div>
              <label style={labelStyle}>Event type</label>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))", gap: 10, marginTop: 8 }}>
                {availableTypes.map(t => {
                  const tcfg = EVENT_TYPE_CONFIGS[t]
                  const selected = eventType === t
                  return (
                    <button
                      key={t}
                      onClick={() => setEventType(t)}
                      style={{
                        padding: "12px 14px", borderRadius: 12, textAlign: "left", cursor: "pointer",
                        border: selected ? `2px solid ${tcfg.dot}` : "2px solid var(--line)",
                        background: selected ? tcfg.bg : "var(--cream-panel)",
                        transition: "border-color 0.15s, background 0.15s",
                      }}
                    >
                      <div style={{ fontSize: 20, marginBottom: 4 }}>{tcfg.icon}</div>
                      <div style={{ fontSize: 13, fontWeight: 600, color: selected ? tcfg.text : "var(--ink)" }}>{tcfg.label}</div>
                      <div style={{ fontSize: 11, color: "var(--muted-text)", marginTop: 2, lineHeight: 1.4 }}>{tcfg.description}</div>
                    </button>
                  )
                })}
              </div>
              {/* Pre-seed preview */}
              {(cfg.defaultRoles.length > 0 || cfg.defaultPhases.length > 0) && (
                <div style={{ marginTop: 12, padding: "12px 14px", background: "#F5F1E8", borderRadius: 10, fontSize: 12, color: "var(--body)" }}>
                  <span style={{ fontWeight: 600, color: "var(--plum)" }}>Pre-seeded: </span>
                  {cfg.defaultRoles.map(r => r.name).join(", ")}
                  {cfg.defaultRoles.length > 0 && cfg.defaultPhases.length > 0 && " · "}
                  {cfg.defaultPhases.reduce((n, p) => n + p.tasks.length, 0)} checklist tasks across {cfg.defaultPhases.length} phases
                </div>
              )}
            </div>
          )}

          {/* Title */}
          <FormField label="Title *">
            <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Event name" />
          </FormField>

          {/* Description */}
          <FormField label="Description">
            <Textarea style={{ minHeight: 80 }} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Optional details…" />
          </FormField>

          {/* Location */}
          <FormField label="Location">
            <Input value={location} onChange={(e) => setLocation(e.target.value)} placeholder="Room, building, or address" />
          </FormField>

          {/* All day toggle */}
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <input type="checkbox" id="allDay" checked={allDay} onChange={(e) => setAllDay(e.target.checked)} style={{ width: 16, height: 16, accentColor: "var(--plum)", cursor: "pointer" }} />
            <label htmlFor="allDay" style={{ fontSize: 14, color: "var(--body)", cursor: "pointer" }}>All day</label>
          </div>

          {/* Dates + times */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <FormField label="Start date *">
              <Input type="date" value={startDateStr} onChange={(e) => setStartDateStr(e.target.value)} />
            </FormField>
            <FormField label="Start time">
              <Input type="time" style={{ opacity: allDay ? 0.4 : 1 }} value={startTimeStr} onChange={(e) => setStartTimeStr(e.target.value)} disabled={allDay} />
            </FormField>
            <FormField label="End date *">
              <Input type="date" value={endDateStr} onChange={(e) => setEndDateStr(e.target.value)} />
            </FormField>
            <FormField label="End time">
              <Input type="time" style={{ opacity: allDay ? 0.4 : 1 }} value={endTimeStr} onChange={(e) => setEndTimeStr(e.target.value)} disabled={allDay} />
            </FormField>
          </div>

          {/* Planning window — edit mode only; persisted to the event's plan row */}
          {isEditing && (
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              <FormField label="Plan start date">
                <Input type="date" value={planStartDate} onChange={(e) => setPlanStartDate(e.target.value)} />
              </FormField>
              <FormField label={<>Crunch date <span style={{ textTransform: "none", letterSpacing: 0, fontSize: 10, color: "var(--faint)" }}>optional</span></>}>
                <Input type="date" value={crunchDate} onChange={(e) => setCrunchDate(e.target.value)} />
                {crunchDate && (
                  <button
                    type="button"
                    onClick={() => setCrunchDate("")}
                    style={{ background: "none", border: "none", padding: 0, fontSize: 12, color: "var(--muted-text)", cursor: "pointer" }}
                  >
                    Clear crunch date
                  </button>
                )}
              </FormField>
            </div>
          )}

          {error && <p style={{ fontSize: 13, color: "var(--danger)" }}>{error}</p>}

          {/* Actions */}
          {isEditing && onDelete && (
            <div style={{ borderTop: "1px solid var(--line)", paddingTop: 18, marginTop: 8 }}>
              {deleteConfirm ? (
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <span style={{ fontSize: 13, color: "var(--danger)", flex: 1 }}>This will permanently delete the event and all its planning data.</span>
                  <CentralButton variant="secondary" size="sm" onClick={() => setDeleteConfirm(false)}>Cancel</CentralButton>
                  <CentralButton variant="danger-solid" size="sm" onClick={handleDelete} disabled={deleting}>
                    {deleting ? "Deleting…" : "Delete forever"}
                  </CentralButton>
                </div>
              ) : (
                <button
                  onClick={() => setDeleteConfirm(true)}
                  style={{ display: "flex", alignItems: "center", gap: 6, background: "none", border: "none", cursor: "pointer", fontSize: 13, color: "var(--danger)", padding: 0 }}
                >
                  <Trash2 className="w-3.5 h-3.5" /> Delete event
                </button>
              )}
            </div>
          )}

          <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", marginTop: 16 }}>
            <button onClick={onClose} style={{ padding: "8px 20px", borderRadius: 8, border: "1px solid var(--line-2)", background: "var(--cream-panel)", fontSize: 14, color: "var(--body)", cursor: "pointer" }}>
              Cancel
            </button>
            <CentralButton variant="primary" size="md" onClick={handleSave} disabled={saving}>
              {saving ? (isEditing ? "Saving…" : "Creating…") : isEditing ? "Save changes" : "Create event"}
            </CentralButton>
          </div>
        </div>
      </div>
    </div>
  )
}

export function MinistryCalendar({
  ministryId,
  teamId,
  teamName,
  userId,
  canEdit,
  onOpenChat,
}: {
  ministryId: string
  teamId: string | null
  teamName: string
  userId: string
  canEdit: boolean
  onOpenChat?: (id: string, name: string, type?: string) => void
}) {
  const supabase = createClient()
  const [view, setView] = useState<"month" | "list">("list")
  // SWR-cached events + planned-event ids (shared key with StudentOrgTeamHome).
  const { data: calData, isLoading: loading, mutate: mutateCal } = useSWR(
    ministryId ? (["calendar-events", ministryId, teamId ?? "all"] as const) : null,
    fetchCalendarEventsAndPlans,
    { keepPreviousData: false },
  )
  const events = useMemo(() => calData?.events ?? [], [calData])
  const plannedEventIds = calData?.plannedIds ?? EMPTY_ID_SET
  const tableReady = calData?.tableReady ?? true
  const [currentMonth, setCurrentMonth] = useState(new Date())
  const [selectedEvent, setSelectedEvent] = useState<CalendarEvent | null>(null)
  const [showAdd, setShowAdd] = useState(false)
  const [planningEvent, setPlanningEvent] = useState<CalendarEvent | null>(null)

  async function handleDelete(id: string) {
    await supabase.from("calendar_events").delete().eq("id", id)
    void mutateCal()
  }

  // Event planning view — replaces the calendar while an event is open.
  // SubpageShell consumes the page body (cream, in-content) and supplies the
  // only horizontal inset + the canonical event title header + the mobile back
  // row. It pushes [team (closes the event), event title]; the team crumb's
  // onClick gives the mobile back row a "← {team}" target, and DesktopTopbar
  // dedupes the team crumb against the shell-resolved trail (planningEvent is
  // local to MinistryCalendar, invisible to getShellCrumbs). key={planningEvent.id}
  // re-inits the workspace to Overview per event. EventPlanWorkspace runs `bare`
  // so its own px doesn't double-pad under the shell. No onEditEvent — MinistryCalendar
  // has no edit-event flow (AddEventModal here is create-only), so the gated
  // "Edit event" button simply won't render.
  if (planningEvent) {
    return (
      <SubpageShell crumbs={[{ label: teamName, onClick: () => setPlanningEvent(null) }, { label: planningEvent.title }]} title={planningEvent.title} width="full">
        <EventPlanWorkspace
          key={planningEvent.id}
          inline
          bare
          calendarEvent={planningEvent}
          ministryId={ministryId}
          userId={userId}
          canEdit={canEdit}
          teamId={teamId}
          onClose={() => setPlanningEvent(null)}
          onOpenChat={onOpenChat}
        />
      </SubpageShell>
    )
  }

  if (!tableReady) {
    return (
      <div className="px-14 py-7">
        <div style={{ borderTop: "1px solid var(--line-2)", paddingTop: 24, marginBottom: 32 }}>
        <p style={{ fontFamily: "var(--font-instrument-serif)", fontSize: 22, fontWeight: 400, color: "var(--ink)", marginBottom: 8 }}>Ministry Calendar</p>
        <div style={{ background: "var(--cream-panel)", border: "1px dashed var(--line-2)", borderRadius: 12, padding: "24px 20px", textAlign: "center" }}>
          <p style={{ fontSize: 13, color: "var(--body)", marginBottom: 4 }}>Calendar database table not set up yet.</p>
          <p style={{ fontSize: 12, color: "var(--muted-text)" }}>Run <code style={{ background: "#EFEAE0", padding: "1px 5px", borderRadius: 4 }}>supabase/calendar_migration.sql</code> in the Supabase SQL Editor to enable this feature.</p>
        </div>
        </div>
      </div>
    )
  }

  return (
    <div className="px-14 py-7" style={{ marginBottom: 32 }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", marginBottom: 20 }}>
        <div>
          <p style={{ fontFamily: "var(--mono)", fontSize: "11px", fontWeight: 600, letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--muted-text)", marginBottom: 6 }}>
            Upcoming
          </p>
          <h2 style={{ fontFamily: "var(--font-instrument-serif)", fontSize: 30, fontWeight: 400, color: "var(--ink)", margin: 0, letterSpacing: "-0.01em" }}>
            {new Date().toLocaleDateString("en-US", { month: "long", year: "numeric" })}
          </h2>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          {/* View toggle */}
          <div style={{ display: "flex", background: "#F0EDE8", borderRadius: 8, padding: 2, gap: 2 }}>
            <button
              onClick={() => setView("month")}
              style={{
                display: "flex", alignItems: "center", gap: 4, padding: "4px 10px", borderRadius: 6,
                background: view === "month" ? "var(--cream-panel)" : "transparent",
                border: "none", cursor: "pointer", fontSize: 12, color: view === "month" ? "var(--ink)" : "var(--muted-text)",
                fontWeight: view === "month" ? 500 : 400,
                              }}
            >
              <Grid3x3 className="w-3 h-3" /> Month
            </button>
            <button
              onClick={() => setView("list")}
              style={{
                display: "flex", alignItems: "center", gap: 4, padding: "4px 10px", borderRadius: 6,
                background: view === "list" ? "var(--cream-panel)" : "transparent",
                border: "none", cursor: "pointer", fontSize: 12, color: view === "list" ? "var(--ink)" : "var(--muted-text)",
                fontWeight: view === "list" ? 500 : 400,
                              }}
            >
              <List className="w-3 h-3" /> List
            </button>
          </div>
          {canEdit && (
            <CentralButton
              variant="primary" size="sm"
              onClick={() => setShowAdd(true)}
            >
              <Plus className="w-3 h-3" /> Add event
            </CentralButton>
          )}
        </div>
      </div>

      <div style={{ display: "flex", gap: 28, alignItems: "flex-start" }}>
        {/* Calendar — left */}
        <div style={{ flex: 1, minWidth: 0 }}>
          {loading ? (
            <div style={{ textAlign: "center", padding: "32px 0", color: "var(--muted-text)", fontSize: 13 }}>Loading…</div>
          ) : view === "month" ? (
            <MonthGrid
              events={events}
              currentMonth={currentMonth}
              onMonthChange={setCurrentMonth}
              onSelectEvent={setSelectedEvent}
            />
          ) : (
            <TimelineView events={events} onSelectEvent={setSelectedEvent} />
          )}
        </div>

        {/* Events panel — right */}
        <div style={{ width: 232, flexShrink: 0, borderLeft: "1px solid var(--line-2)", paddingLeft: 20 }}>
          <p style={{ ...MONO_STYLE, margin: "0 0 10px" }}>
            Events · {events.length || 3}
          </p>

          {events.length === 0 ? (
            /* Default placeholder items when calendar isn't seeded yet */
            [
              { title: "Turkey Bowl", category: "social" as Category, date: "Nov 22" },
              { title: "Welcome Night", category: "welcoming" as Category, date: "Aug 29" },
              { title: "Coffeehouse", category: "social" as Category, date: "Nov 7" },
            ].map((item) => {
              const cfg = CATEGORY_CONFIG[item.category]
              return (
                <div key={item.title} style={{ display: "flex", flexDirection: "column", gap: 4, padding: "10px 0", borderBottom: "1px solid #F0EDE8" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
                    <span style={{ width: 7, height: 7, borderRadius: "50%", background: cfg.dot, flexShrink: 0 }} />
                    <span style={{ fontSize: 13, fontWeight: 500, color: "var(--ink)", flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{item.title}</span>
                  </div>
                  <span style={{ fontSize: 11, color: "var(--muted-text)", paddingLeft: 14 }}>{item.date}</span>
                  <span style={{ ...PLAN_STATUS_PILL.needsPlanning, marginLeft: 14, display: "inline-block", width: "fit-content" }}>
                    Needs planning
                  </span>
                </div>
              )
            })
          ) : (
            events.map((ev) => {
              const cfg = getEventConfig(ev)
              const isPlanned = plannedEventIds.has(ev.id)
              const dateStr = new Date(ev.start_date).toLocaleDateString("en-US", { month: "short", day: "numeric" })
              return (
                <div key={ev.id} style={{ display: "flex", flexDirection: "column", gap: 4, padding: "10px 0", borderBottom: "1px solid #F0EDE8" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
                    <span style={{ width: 7, height: 7, borderRadius: "50%", background: cfg.dot, flexShrink: 0 }} />
                    <span style={{ fontSize: 13, fontWeight: 500, color: "var(--ink)", flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{ev.title}</span>
                  </div>
                  <span style={{ fontSize: 11, color: "var(--muted-text)", paddingLeft: 14 }}>{dateStr}</span>
                  <div style={{ paddingLeft: 14, display: "flex", alignItems: "center", gap: 6 }}>
                    {isPlanned ? (
                      <span style={PLAN_STATUS_PILL.planned}>Planned ✓</span>
                    ) : (
                      <span style={PLAN_STATUS_PILL.needsPlanning}>Needs planning</span>
                    )}
                    {canEdit && (
                      <button
                        onClick={() => setPlanningEvent(ev)}
                        style={{ fontSize: 11, color: "var(--plum)", background: "none", border: "none", cursor: "pointer", fontWeight: 500, padding: 0, textDecoration: "underline", textDecorationColor: "transparent" }}
                        onMouseEnter={(e) => (e.currentTarget.style.textDecorationColor = "var(--plum)")}
                        onMouseLeave={(e) => (e.currentTarget.style.textDecorationColor = "transparent")}
                      >
                        {isPlanned ? "View plan" : "Plan →"}
                      </button>
                    )}
                  </div>
                </div>
              )
            })
          )}
        </div>
      </div>

      {selectedEvent && (
        <EventDetailPopover
          event={selectedEvent}
          canEdit={canEdit}
          userId={userId}
          onClose={() => setSelectedEvent(null)}
          onDelete={(id) => { handleDelete(id); setSelectedEvent(null) }}
          onPlan={(ev) => { setSelectedEvent(null); setPlanningEvent(ev) }}
        />
      )}

      {showAdd && (
        <AddEventModal
          ministryId={ministryId}
          teamId={teamId}
          userId={userId}
          onClose={() => setShowAdd(false)}
          onSaved={() => {
            void mutateCal()
            setShowAdd(false)
          }}
        />
      )}
    </div>
  )
}

// ── EventPlanWorkspace ────────────────────────────────────────────────────────

// Date helpers for the plan/crunch checklist windows. Format is "YYYY-MM-DD" in
// LOCAL time (never UTC) so day-granularity comparisons never off-by-one, and
// month/day arithmetic uses the Date constructor's own overflow normalization.
function toLocalYMD(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, "0")
  const day = String(d.getDate()).padStart(2, "0")
  return `${y}-${m}-${day}`
}
function addMonthsYMD(d: Date, n: number): string {
  return toLocalYMD(new Date(d.getFullYear(), d.getMonth() + n, d.getDate()))
}
function addDaysYMD(d: Date, n: number): string {
  return toLocalYMD(new Date(d.getFullYear(), d.getMonth(), d.getDate() + n))
}

// A single Launchpad link row on the event Overview — an ivory icon-chip, a
// serif title + subtitle, and an optional right-side metric before the chevron.
// Hover lifts the card slightly and warms the border to plum.
function LaunchpadRow({ icon: Icon, title, subtitle, right, onClick }: {
  icon: typeof Users
  title: string
  subtitle: string
  right?: ReactNode
  onClick: () => void
}) {
  return (
    <button
      onClick={onClick}
      onMouseEnter={(e) => { e.currentTarget.style.borderColor = "var(--plum)"; e.currentTarget.style.transform = "translateX(2px)" }}
      onMouseLeave={(e) => { e.currentTarget.style.borderColor = "var(--line-2)"; e.currentTarget.style.transform = "translateX(0)" }}
      style={{
        display: "flex", alignItems: "center", gap: "var(--space-6)", width: "100%", textAlign: "left",
        background: "var(--cream)", border: "1px solid var(--line-2)", borderRadius: "var(--r-card)",
        padding: "16px 18px", cursor: "pointer", transition: "border-color .15s ease, transform .15s ease",
      }}
    >
      <span style={{ width: 40, height: 40, borderRadius: 11, background: "var(--ivory)", display: "grid", placeItems: "center", flexShrink: 0 }}>
        <Icon style={{ width: 18, height: 18, color: "var(--plum)" }} />
      </span>
      <span style={{ flex: 1, minWidth: 0 }}>
        <span style={{ display: "block", fontFamily: "var(--font-instrument-serif)", fontSize: 18, fontWeight: 600, color: "var(--ink)", lineHeight: 1.2 }}>{title}</span>
        <span style={{ display: "block", fontSize: 13, color: "var(--body)", marginTop: 2 }}>{subtitle}</span>
      </span>
      <span style={{ display: "flex", alignItems: "center", gap: 12, flexShrink: 0 }}>
        {right}
        <ChevronRight style={{ width: 18, height: 18, color: "var(--faint)" }} />
      </span>
    </button>
  )
}

// Small hover-aware icon button for the checklist row actions (grip, pin, add
// subtask, promote, edit, delete). Inline styles across this file preclude CSS
// :hover, so hover is tracked in local state.
export function EventPlanWorkspace({
  calendarEvent,
  ministryId,
  userId,
  canEdit,
  canEditBudget = false,
  onClose,
  inline = false,
  bare = false,
  teamId,
  onOpenChat,
  onEditEvent,
  onOpenChild,
  refreshSignal,
}: {
  calendarEvent: CalendarEvent
  ministryId: string
  userId: string
  canEdit: boolean
  canEditBudget?: boolean
  onClose: () => void
  inline?: boolean
  // Strips EventPlanWorkspace's own px-5 md:px-14 from the status row, the section
  // strip wrapper, and the content body — used under SubpageShell, which supplies
  // the single horizontal inset. Keeps vertical rhythm.
  bare?: boolean
  teamId?: string | null
  onOpenChat?: (id: string, name: string, type?: string) => void
  onEditEvent?: () => void
  // Sub-event drill: when provided, the Sub-events tab opens a child by lifting
  // it to the parent (StudentOrgTeamHome) for a single-shell body-swap. Omitted
  // while already viewing a child, which caps nesting at one level.
  onOpenChild?: (ev: CalendarEvent) => void
  // Bumped by the parent after the Edit-event modal saves; re-fetches the plan's
  // plan_start_date / crunch_date so the overview facts + checklist windows
  // reflect edits made in the modal without a manual reload.
  refreshSignal?: number
}) {
  const supabase = createClient()
  const { setParam } = useNavState()
  const cfg = getEventConfig(calendarEvent)
  const typeCfg = EVENT_TYPE_CONFIGS[calendarEvent.event_type] ?? EVENT_TYPE_CONFIGS.social
  const extraTabs = typeCfg.extraTabs

  type ActiveSection = 'overview' | 'checklist' | 'roles' | 'notes' | EventExtraTab
  const coreTabs: ActiveSection[] = ['overview', 'checklist', 'roles', 'notes']
  const allValidTabs: ActiveSection[] = [...coreTabs, ...extraTabs]

  // Core data state
  const [plan, setPlan] = useState<EventPlan | null>(null)
  const [tasks, setTasks] = useState<EventTask[]>([])
  const [roles, setRoles] = useState<EventRole[]>([])
  const [members, setMembers] = useState<{ id: string; name: string }[]>([])

  // Assignee pool = team members ∪ anyone assigned to a role on this event, deduped by id
  const assigneePool = useMemo(() => {
    const map = new Map<string, string>(members.map(m => [m.id, m.name]))
    for (const r of roles) if (r.assigned_to && r.assigned_name) map.set(r.assigned_to, r.assigned_name)
    return [...map.entries()].map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name))
  }, [members, roles])

  // Map a raw event_tasks row (with joined assignee profile) to an EventTask.
  // Shared by the initial load, task add, and subtask add so the hierarchy /
  // pin / priority columns are mapped consistently in one place.
  function mapTask(t: Record<string, unknown>): EventTask {
    return {
      id: t.id as string,
      event_plan_id: t.event_plan_id as string,
      title: t.title as string,
      assigned_to: t.assigned_to as string | null,
      assigned_name: (t.profiles as { name?: string } | null)?.name,
      due_date: t.due_date as string | null,
      completed: t.completed as boolean,
      phase: (t.phase as string ?? "pre_event") as EventTask["phase"],
      sort_order: (t.sort_order as number) ?? 0,
      parent_id: (t.parent_id as string | null) ?? null,
      pinned: (t.pinned as boolean) ?? false,
      priority: (t.priority as EventTask["priority"]) ?? "none",
    }
  }

  // Planning chat state
  const [planningGroupId, setPlanningGroupId] = useState<string | null>(null)
  const [creatingPlanChat, setCreatingPlanChat] = useState(false)
  const [planChatError, setPlanChatError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [rsvpCount, setRsvpCount] = useState<number | null>(null)
  const [ministryBudget, setMinistryBudget] = useState<{ total: number; byFund: Record<string, number> } | null>(null)

  const [activeSection, setActiveSection] = useState<ActiveSection>(() => {
    const p = typeof window !== "undefined" ? new URLSearchParams(window.location.search).get("evtab") : null
    return (allValidTabs as string[]).includes(p ?? "") ? p as ActiveSection : 'overview'
  })
  function setActiveSectionAndUrl(s: ActiveSection) {
    setActiveSection(s)
    setParam("evtab", s)
  }

  // Overview edit state
  const [turnout, setTurnout] = useState("")
  const [budget, setBudget] = useState("")
  const [overviewNotes, setOverviewNotes] = useState("")
  const [savingOverview, setSavingOverview] = useState(false)
  // Overview click-to-edit toggles for the turnout / budget stat numbers
  const [editingTurnout, setEditingTurnout] = useState(false)
  const [editingBudget, setEditingBudget] = useState(false)

  // Task add state — newTaskSection is the date-derived checklist section the
  // inline add-row is currently active in ("" = none focused yet).
  const [newTaskTitle, setNewTaskTitle] = useState("")
  const [newTaskAssignee, setNewTaskAssignee] = useState("")
  const [newTaskDue, setNewTaskDue] = useState("")
  const [newTaskSection, setNewTaskSection] = useState<string>("")
  const [addingTask, setAddingTask] = useState(false)
  const [collapsedPhases, setCollapsedPhases] = useState<Set<string>>(new Set())

  // Plan/crunch date state — drives the checklist section windows. Display-only
  // in the overview facts now; edited via the Edit-event modal (AddEventModal).
  const [planStartDate, setPlanStartDate] = useState("")
  const [crunchDate, setCrunchDate] = useState("")

  // Task inline edit state
  const [editingTaskId, setEditingTaskId] = useState<string | null>(null)
  const [editTaskTitle, setEditTaskTitle] = useState("")
  const [editTaskAssignee, setEditTaskAssignee] = useState("")
  const [editTaskDue, setEditTaskDue] = useState("")
  const [editTaskPriority, setEditTaskPriority] = useState<EventTask["priority"]>("none")
  const [editTaskPinned, setEditTaskPinned] = useState(false)
  const [savingTaskEdit, setSavingTaskEdit] = useState(false)

  // Checklist hierarchy / interaction state
  const [childTitle, setChildTitle] = useState("")               // inline subtask input text
  const [addingChildFor, setAddingChildFor] = useState<string | null>(null) // parent id whose subtask input is open
  const [collapsedTasks, setCollapsedTasks] = useState<Set<string>>(new Set()) // parents whose children are collapsed
  const [hoveredTaskId, setHoveredTaskId] = useState<string | null>(null)
  const [dragTaskId, setDragTaskId] = useState<string | null>(null)
  const [dragOverTaskId, setDragOverTaskId] = useState<string | null>(null)
  const [dragOverSection, setDragOverSection] = useState<string | null>(null)
  const [confirmDeleteTaskId, setConfirmDeleteTaskId] = useState<string | null>(null) // row in two-step delete confirm
  const [deletingTaskId, setDeletingTaskId] = useState<string | null>(null)           // delete in flight
  // A dated task dropped onto a different date-window section — pending until the
  // user confirms the date change (see §14 / date-reseed warning).
  const [pendingSectionMove, setPendingSectionMove] = useState<{ taskId: string; sectionKey: string } | null>(null)
  const [sectionMoveBusy, setSectionMoveBusy] = useState(false)

  // Role add state
  const [newRoleName, setNewRoleName] = useState("")
  const [newRoleAssignee, setNewRoleAssignee] = useState("")
  const [newRoleNotes, setNewRoleNotes] = useState("")
  const [addingRole, setAddingRole] = useState(false)

  // Role inline edit state
  const [editingRoleId, setEditingRoleId] = useState<string | null>(null)
  const [editRoleName, setEditRoleName] = useState("")
  const [editRoleAssignee, setEditRoleAssignee] = useState("")
  const [editRoleNotes, setEditRoleNotes] = useState("")

  // Role presentation state (inline add-role form + inline assignee select)
  const [showAddRole, setShowAddRole] = useState(false)
  const [assigningRoleId, setAssigningRoleId] = useState<string | null>(null)

  // Transition Notes (cross-year institutional memory of pain points)
  const CURRENT_CLASS_YEAR = currentFiscalYear()
  const [transitionNotes, setTransitionNotes] = useState<TransitionNote[]>([])
  const [ppCategoryFilter, setPpCategoryFilter] = useState<string>("All")
  const [ppModalOpen, setPpModalOpen] = useState(false)
  const [ppTitle, setPpTitle] = useState("")
  const [ppCategory, setPpCategory] = useState("Venue")
  const [ppWatch, setPpWatch] = useState("")
  const [ppSolved, setPpSolved] = useState("")
  const [addingPp, setAddingPp] = useState(false)

  const PP_CATEGORIES = ["Venue", "Food", "Budget", "Promo", "People", "Logistics"] as const
  const PP_FILTERS = ["All", ...PP_CATEGORIES] as const

  // Group transition notes by class_year: current year first (always present,
  // even when empty), then past years descending. Cards are pre-filtered by the
  // active category chip, so counts + emptiness reflect the current filter.
  const transitionGroups = useMemo(() => {
    const filtered = ppCategoryFilter === "All"
      ? transitionNotes
      : transitionNotes.filter(n => (n.category ?? "") === ppCategoryFilter)
    const map = new Map<string, TransitionNote[]>()
    for (const n of filtered) {
      const arr = map.get(n.class_year) ?? []
      arr.push(n)
      map.set(n.class_year, arr)
    }
    map.set(CURRENT_CLASS_YEAR, map.get(CURRENT_CLASS_YEAR) ?? [])
    const years = [...map.keys()].sort((a, b) =>
      a === CURRENT_CLASS_YEAR ? -1 : b === CURRENT_CLASS_YEAR ? 1 : b.localeCompare(a)
    )
    return years.map(y => ({ year: y, notes: map.get(y) ?? [] }))
  }, [transitionNotes, ppCategoryFilter, CURRENT_CLASS_YEAR])

  // Escape closes the "Log a pain point" modal.
  useEffect(() => {
    if (!ppModalOpen) return
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setPpModalOpen(false) }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [ppModalOpen])

  const startDate = new Date(calendarEvent.start_date)
  const endDate = new Date(calendarEvent.end_date)

  useEffect(() => {
    async function init() {
      setLoading(true)

      // Fetch or create event_plan
      let { data: planData } = await supabase
        .from("event_plans")
        .select("*")
        .eq("calendar_event_id", calendarEvent.id)
        .single()

      if (!planData) {
        const { data: newPlan } = await supabase
          .from("event_plans")
          .insert({ ministry_id: ministryId, calendar_event_id: calendarEvent.id, created_by: userId })
          .select("*")
          .single()
        planData = newPlan
      }

      if (!planData) { setLoading(false); return }

      const planId = planData.id

      // Plan/crunch dates. First-time init: when plan_start_date is null, seed
      // plan-start = event − 1 month and crunch = event − 1 week (local YMD),
      // persist once, and use them. After this one-time write plan_start_date is
      // always set; a later null crunch_date means the user REMOVED the crunch phase.
      let psd = planData.plan_start_date as string | null
      let cd = planData.crunch_date as string | null
      if (!psd) {
        const eventDate = new Date(calendarEvent.start_date)
        psd = addMonthsYMD(eventDate, -1)
        cd = addDaysYMD(eventDate, -7)
        await supabase.from("event_plans").update({ plan_start_date: psd, crunch_date: cd }).eq("id", planId).eq("ministry_id", ministryId)
        planData = { ...planData, plan_start_date: psd, crunch_date: cd }
      }
      setPlanStartDate(psd ?? "")
      setCrunchDate(cd ?? "")

      setPlan(planData as EventPlan)
      setPlanningGroupId((planData as EventPlan).planning_group_id ?? null)
      setTurnout(planData.expected_turnout != null ? String(planData.expected_turnout) : "")
      setBudget(planData.budget_allocated != null ? String(planData.budget_allocated) : "")
      setOverviewNotes(planData.overview_notes ?? "")

      // Fetch tasks with assignee name
      const { data: tasksData } = await supabase
        .from("event_tasks")
        .select("*, profiles!event_tasks_assigned_to_fkey(name)")
        .eq("event_plan_id", planId)
        .order("sort_order", { ascending: true })

      setTasks((tasksData ?? []).map(mapTask))

      // Fetch roles with assignee name
      const { data: rolesData } = await supabase
        .from("event_roles")
        .select("*, profiles!event_roles_assigned_to_fkey(name)")
        .eq("event_plan_id", planId)
        .order("created_at", { ascending: true })

      setRoles((rolesData ?? []).map((r: Record<string, unknown>) => ({
        id: r.id as string,
        event_plan_id: r.event_plan_id as string,
        role_name: r.role_name as string,
        assigned_to: r.assigned_to as string | null,
        assigned_name: (r.profiles as { name?: string } | null)?.name,
        notes: r.notes as string | null,
      })))

      // Fetch Transition Notes — cross-year pain points keyed on team_id +
      // event_type so a recurring event's record accumulates across class years.
      let transitionQuery = supabase
        .from("transition_notes")
        .select("*")
        .eq("ministry_id", ministryId)
        .eq("event_type", calendarEvent.event_type)
      transitionQuery = teamId
        ? transitionQuery.eq("team_id", teamId)
        : transitionQuery.is("team_id", null)
      const { data: transitionData } = await transitionQuery.order("created_at", { ascending: false })
      setTransitionNotes((transitionData ?? []) as TransitionNote[])

      // Assignee list = the entire ministry (student org) member list — the team
      // roster is often unpopulated, and tasks should be assignable to anyone in
      // the org. assigneePool (memo) additionally unions in this event's role-assignees.
      const { data: membersData } = await supabase
        .from("profiles").select("id, name").eq("ministry_id", ministryId).order("name")
      setMembers(membersData ?? [])

      // Fetch RSVP count if linked to an announcement
      if ((calendarEvent as { linked_announcement_id?: string | null }).linked_announcement_id) {
        const { count } = await supabase
          .from("rsvps")
          .select("*", { count: "exact", head: true })
          .eq("announcement_id", (calendarEvent as { linked_announcement_id: string }).linked_announcement_id)
        setRsvpCount(count ?? 0)
      }

      // Fetch ministry budget allocation — keyed by calendar event title (matches dynamic category system)
      if (typeCfg.budgetCategory) {
        const { data: budgetData } = await getCategoryBudgetAllocation(ministryId, calendarEvent.title, currentFiscalYear())
        setMinistryBudget(budgetData)
      }

      setLoading(false)
    }
    init()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [calendarEvent.id, ministryId, userId, teamId])

  async function handleSaveOverview() {
    if (!plan) return
    setSavingOverview(true)
    const updates = {
      expected_turnout: turnout !== "" ? parseInt(turnout, 10) : null,
      budget_allocated: budget !== "" ? parseFloat(budget) : null,
      overview_notes: overviewNotes || null,
    }
    const { data } = await supabase
      .from("event_plans")
      .update(updates)
      .eq("id", plan.id)
      .select("*")
      .single()
    if (data) setPlan(data as EventPlan)
    setSavingOverview(false)
  }

  // Re-fetch plan/crunch dates when the parent bumps refreshSignal (after the
  // Edit-event modal saves). Skips the initial mount run (plan not yet loaded).
  useEffect(() => {
    if (!plan) return
    let cancelled = false
    ;(async () => {
      const { data } = await supabase
        .from("event_plans")
        .select("plan_start_date, crunch_date")
        .eq("calendar_event_id", calendarEvent.id)
        .maybeSingle()
      if (cancelled || !data) return
      setPlanStartDate((data.plan_start_date as string | null) ?? "")
      setCrunchDate((data.crunch_date as string | null) ?? "")
    })()
    return () => { cancelled = true }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshSignal])

  async function handleToggleTask(task: EventTask) {
    const newCompleted = !task.completed
    setTasks((prev) => prev.map((t) => t.id === task.id ? { ...t, completed: newCompleted, } : t))
    await supabase
      .from("event_tasks")
      .update({ completed: newCompleted, completed_at: newCompleted ? new Date().toISOString() : null })
      .eq("id", task.id)
  }

  async function handleAddTask(section: { defaultDue: string; phase: EventTask["phase"] }) {
    if (!plan || !newTaskTitle.trim()) return
    const phase = section.phase
    const due = newTaskDue || section.defaultDue || null
    const maxSort = tasks.reduce((m, t) => Math.max(m, t.sort_order), -1)
    setAddingTask(true)
    const { data } = await supabase
      .from("event_tasks")
      .insert({
        event_plan_id: plan.id,
        title: newTaskTitle.trim(),
        assigned_to: newTaskAssignee || null,
        due_date: due,
        completed: false,
        phase,
        sort_order: maxSort + 1,
        created_by: userId,
      })
      .select("*, profiles!event_tasks_assigned_to_fkey(name)")
      .single()
    if (data) setTasks((prev) => [...prev, mapTask(data as Record<string, unknown>)])
    setNewTaskTitle("")
    setNewTaskAssignee("")
    setNewTaskDue("")
    setNewTaskSection("")
    setAddingTask(false)
  }

  async function handleDeleteTask(id: string) {
    // Children cascade in the DB (parent_id ON DELETE CASCADE); drop them from
    // local state too so the UI doesn't strand orphaned child rows.
    setDeletingTaskId(id)
    await supabase.from("event_tasks").delete().eq("id", id)
    setTasks((prev) => prev.filter((t) => t.id !== id && t.parent_id !== id))
    setDeletingTaskId(null)
    setConfirmDeleteTaskId(null)
  }

  function startEditTask(task: EventTask) {
    setEditingTaskId(task.id)
    setEditTaskTitle(task.title)
    setEditTaskAssignee(task.assigned_to ?? "")
    setEditTaskDue(task.due_date ?? "")
    setEditTaskPriority(task.priority)
    setEditTaskPinned(task.pinned)
  }

  async function handleUpdateTask() {
    if (!editingTaskId || !editTaskTitle.trim()) return
    setSavingTaskEdit(true)
    const id = editingTaskId
    const editing = tasks.find((t) => t.id === id)
    const newTitle = editTaskTitle.trim()
    const newAssignee = editTaskAssignee || null
    const newDue = editTaskDue || null
    // Pin is top-level only — never persist pinned=true for a child.
    const newPinned = editing && editing.parent_id === null ? editTaskPinned : false
    await supabase
      .from("event_tasks")
      .update({ title: newTitle, assigned_to: newAssignee, due_date: newDue, priority: editTaskPriority, pinned: newPinned })
      .eq("id", id)
    const assignedName = newAssignee ? assigneePool.find(a => a.id === newAssignee)?.name : undefined
    setTasks((prev) => prev.map((t) => t.id === id ? { ...t, title: newTitle, assigned_to: newAssignee, due_date: newDue, priority: editTaskPriority, pinned: newPinned, assigned_name: assignedName } : t))
    setEditingTaskId(null)
    setSavingTaskEdit(false)
  }

  // ── Hierarchy / pin / priority / drag handlers ─────────────────────────────
  async function togglePin(task: EventTask) {
    if (!canEdit || task.parent_id !== null) return
    const np = !task.pinned
    setTasks((prev) => prev.map((t) => t.id === task.id ? { ...t, pinned: np } : t))
    await supabase.from("event_tasks").update({ pinned: np }).eq("id", task.id)
  }

  async function addChild(parent: EventTask) {
    if (!plan || !canEdit || !childTitle.trim()) return
    const maxSort = tasks.reduce((m, t) => Math.max(m, t.sort_order), -1)
    const { data } = await supabase
      .from("event_tasks")
      .insert({
        event_plan_id: plan.id,
        title: childTitle.trim(),
        assigned_to: null,
        due_date: null,
        completed: false,
        phase: parent.phase,
        sort_order: maxSort + 1,
        created_by: userId,
        parent_id: parent.id,
        priority: "none",
        pinned: false,
      })
      .select("*, profiles!event_tasks_assigned_to_fkey(name)")
      .single()
    if (data) setTasks((prev) => [...prev, mapTask(data as Record<string, unknown>)])
    setChildTitle("") // keep the input open so several subtasks can be added in a row
  }

  async function promoteTask(task: EventTask) {
    if (!canEdit || task.parent_id === null) return
    setTasks((prev) => prev.map((t) => t.id === task.id ? { ...t, parent_id: null } : t))
    await supabase.from("event_tasks").update({ parent_id: null }).eq("id", task.id)
  }

  // Make dragId a child of targetId's parent (or targetId itself). One level
  // deep: a task that already HAS children can't be nested. Inherits the new
  // parent's phase and clears pinned.
  async function nest(dragId: string, targetId: string) {
    if (!canEdit || dragId === targetId) return
    const drag = tasks.find((t) => t.id === dragId)
    const target = tasks.find((t) => t.id === targetId)
    if (!drag || !target) return
    if (tasks.some((t) => t.parent_id === dragId)) return // dragId is a parent → refuse
    const newParent = target.parent_id ?? target.id
    if (newParent === dragId) return
    const parentTask = tasks.find((t) => t.id === newParent)
    const phase = parentTask?.phase ?? drag.phase
    setTasks((prev) => prev.map((t) => t.id === dragId ? { ...t, parent_id: newParent, phase, pinned: false } : t))
    await supabase.from("event_tasks").update({ parent_id: newParent, phase, pinned: false }).eq("id", dragId)
  }

  // Drop onto a section → promote to a standalone (top-level) task in that
  // section, reseeding its due_date to the section's default so it actually
  // lands in that date window (sections are date-driven). Children inherit the
  // new phase. Callers gate the date-change warning via requestMoveToSection.
  async function moveToSection(dragId: string, sectionKey: ChecklistSection) {
    if (!canEdit) return
    const def = sectionDefs.find((s) => s.key === sectionKey)
    const drag = tasks.find((t) => t.id === dragId)
    if (!def || !drag) return
    const phase = def.phase
    const newDue = def.defaultDue || null
    const kidIds = tasks.filter((t) => t.parent_id === dragId).map((t) => t.id)
    setTasks((prev) => prev.map((t) => {
      if (t.id === dragId) return { ...t, parent_id: null, phase, due_date: newDue }
      if (kidIds.includes(t.id)) return { ...t, phase }
      return t
    }))
    await supabase.from("event_tasks").update({ parent_id: null, phase, due_date: newDue }).eq("id", dragId)
    if (kidIds.length) await supabase.from("event_tasks").update({ phase }).in("id", kidIds)
  }

  // Section-drop entry point. A DATED task moving to a DIFFERENT date-window
  // section would have its due_date overwritten — warn first (pending state). A
  // dateless task (e.g. a promoted subtask) has nothing to overwrite, so move
  // immediately.
  function requestMoveToSection(dragId: string, sectionKey: ChecklistSection) {
    if (!canEdit) return
    const drag = tasks.find((t) => t.id === dragId)
    if (!drag) return
    if (drag.due_date && sectionOf(drag) !== sectionKey) {
      setPendingSectionMove({ taskId: dragId, sectionKey })
    } else {
      moveToSection(dragId, sectionKey)
    }
  }

  async function confirmSectionMove() {
    if (!pendingSectionMove) return
    setSectionMoveBusy(true)
    await moveToSection(pendingSectionMove.taskId, pendingSectionMove.sectionKey as ChecklistSection)
    setSectionMoveBusy(false)
    setPendingSectionMove(null)
  }

  function clearDrag() {
    setDragTaskId(null)
    setDragOverTaskId(null)
    setDragOverSection(null)
  }

  async function handleAddRole() {
    if (!plan || !newRoleName.trim()) return
    setAddingRole(true)
    const { data } = await supabase
      .from("event_roles")
      .insert({
        event_plan_id: plan.id,
        role_name: newRoleName.trim(),
        assigned_to: newRoleAssignee || null,
        notes: newRoleNotes || null,
        created_by: userId,
      })
      .select("*, profiles!event_roles_assigned_to_fkey(name)")
      .single()
    if (data) {
      const d = data as Record<string, unknown>
      setRoles((prev) => [...prev, {
        id: d.id as string,
        event_plan_id: d.event_plan_id as string,
        role_name: d.role_name as string,
        assigned_to: d.assigned_to as string | null,
        assigned_name: (d.profiles as { name?: string } | null)?.name,
        notes: d.notes as string | null,
      }])
    }
    setNewRoleName("")
    setNewRoleAssignee("")
    setNewRoleNotes("")
    setAddingRole(false)
    setShowAddRole(false)
  }

  async function handleDeleteRole(id: string) {
    setRoles((prev) => prev.filter((r) => r.id !== id))
    await supabase.from("event_roles").delete().eq("id", id)
  }

  async function handleAssignRole(roleId: string, userId: string) {
    const name = members.find((m) => m.id === userId)?.name
    setRoles((prev) => prev.map((r) => r.id === roleId ? { ...r, assigned_to: userId || null, assigned_name: name } : r))
    setAssigningRoleId(null)
    await supabase.from("event_roles").update({ assigned_to: userId || null }).eq("id", roleId)
  }

  async function handleUnassignRole(roleId: string) {
    setRoles((prev) => prev.map((r) => r.id === roleId ? { ...r, assigned_to: null, assigned_name: undefined } : r))
    await supabase.from("event_roles").update({ assigned_to: null }).eq("id", roleId)
  }

  async function handleSaveRoleEdit(roleId: string) {
    const memberName = members.find((m) => m.id === editRoleAssignee)?.name
    setRoles((prev) => prev.map((r) => r.id === roleId ? {
      ...r,
      role_name: editRoleName,
      assigned_to: editRoleAssignee || null,
      assigned_name: memberName,
      notes: editRoleNotes || null,
    } : r))
    await supabase.from("event_roles").update({
      role_name: editRoleName,
      assigned_to: editRoleAssignee || null,
      notes: editRoleNotes || null,
    }).eq("id", roleId)
    setEditingRoleId(null)
  }

  async function handleCreatePlanningChat() {
    if (!plan) return
    const assignedIds = roles.filter(r => r.assigned_to).map(r => r.assigned_to as string)
    setCreatingPlanChat(true)
    setPlanChatError(null)
    const result = await createEventPlanningChatAction(plan.id, calendarEvent.title, assignedIds, userId, ministryId)
    setCreatingPlanChat(false)
    if (result.error || !result.groupId) { setPlanChatError(result.error ?? "Failed to create chat."); return }
    setPlanningGroupId(result.groupId)
    onOpenChat?.(result.groupId, `${calendarEvent.title} Planning`)
  }

  async function handleAddPainPoint() {
    if (!canEdit || !ppTitle.trim()) return
    setAddingPp(true)
    const authorName = members.find(m => m.id === userId)?.name ?? null
    const { data } = await supabase
      .from("transition_notes")
      .insert({
        ministry_id: ministryId,
        team_id: teamId ?? null,
        event_type: calendarEvent.event_type,
        class_year: CURRENT_CLASS_YEAR,
        title: ppTitle.trim(),
        category: ppCategory || null,
        watch_text: ppWatch.trim() || null,
        solved_text: ppSolved.trim() || null,
        created_by: userId,
        created_by_name: authorName,
      })
      .eq("ministry_id", ministryId)
      .select("*")
      .single()
    if (data) {
      setTransitionNotes(prev => [data as TransitionNote, ...prev])
    }
    setPpTitle("")
    setPpCategory("Venue")
    setPpWatch("")
    setPpSolved("")
    setPpCategoryFilter("All")
    setPpModalOpen(false)
    setAddingPp(false)
  }

  const incompleteTasks = tasks.filter((t) => !t.completed)

  const EXTRA_TAB_LABELS: Record<EventExtraTab, string> = {
    sub_events: "Sub-events", acts: "Acts",
    teams: "Teams", transport: "Transport", program: "Program",
  }

  // Launchpad metadata for the dynamic extra-tab rows on Overview: an icon +
  // a one-line subtitle per planning tab this event actually carries.
  const EXTRA_TAB_META: Record<EventExtraTab, { icon: typeof Users; subtitle: string }> = {
    sub_events: { icon: Calendar, subtitle: "Nights & activities inside the week" },
    acts: { icon: Sparkles, subtitle: "Performances & skits for the night" },
    teams: { icon: Layers, subtitle: "Split attendees into teams" },
    transport: { icon: Bus, subtitle: "Rides & carpools to the venue" },
    program: { icon: Clock, subtitle: "Run-of-show & schedule" },
  }

  const sections: { key: ActiveSection; label: string }[] = [
    { key: 'overview', label: 'Overview' },
    { key: 'checklist', label: 'Checklist' },
    { key: 'roles', label: 'Roles & Leads' },
    { key: 'notes', label: 'Notes' },
    ...extraTabs.map(t => ({ key: t as ActiveSection, label: EXTRA_TAB_LABELS[t] })),
  ]

  // ── Date-driven checklist sections ──────────────────────────────────────────
  // Window anchors (local YMD): plan-start … [crunch] … event day … event+2mo cap.
  const eventYMD = toLocalYMD(startDate)
  const eventPlusOneYMD = addDaysYMD(startDate, 1)
  const eventPlusTwoMonthsYMD = addMonthsYMD(startDate, 2)
  const fmtMD = (ymd: string) => new Date(ymd + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" })

  // Map a task to its section. If dated, compare day-granularity YMD strings to
  // the plan-start / crunch / event anchors; otherwise fall back to the stored
  // phase (dateless tasks never land in "crunch").
  type ChecklistSection = "planning" | "crunch" | "day_of" | "post"
  function sectionOf(task: EventTask): ChecklistSection {
    const due = task.due_date
    if (due) {
      if (due >= eventPlusOneYMD) return "post"
      if (due === eventYMD) return "day_of"
      if (crunchDate && due >= crunchDate && due < eventYMD) return "crunch"
      return "planning"
    }
    switch (task.phase) {
      case "day_of": return "day_of"
      case "post_event":
      case "followup": return "post"
      default: return "planning" // pre_event
    }
  }

  // Rendered sections in order — Crunch only appears when a crunch date is set.
  // defaultDue/phase seed the section's inline add-row so a new task lands here.
  const sectionDefs: { key: ChecklistSection; label: string; defaultDue: string; phase: EventTask["phase"] }[] = [
    { key: "planning", label: "Planning phase", defaultDue: planStartDate, phase: "pre_event" },
    ...(crunchDate ? [{ key: "crunch" as ChecklistSection, label: "Crunch phase", defaultDue: crunchDate, phase: "day_of" as EventTask["phase"] }] : []),
    { key: "day_of", label: "Day of", defaultDue: eventYMD, phase: "day_of" },
    { key: "post", label: "Post week", defaultDue: eventPlusOneYMD, phase: "post_event" },
  ]

  // ── Checklist hierarchy helpers ────────────────────────────────────────────
  const childrenOf = (id: string) => tasks.filter((t) => t.parent_id === id).sort((a, b) => a.sort_order - b.sort_order)
  const pinnedTop = tasks.filter((t) => t.parent_id === null && t.pinned)
  const pinnedIds = new Set(pinnedTop.map((t) => t.id))
  // A task lives in the top Pinned band if it's a pinned top-level task or a
  // child of one — those never appear in the date-driven sections below.
  const inBand = (t: EventTask) => (t.parent_id === null ? t.pinned : pinnedIds.has(t.parent_id ?? ""))

  // The roomy inline editor card that replaces a row while it's being edited.
  function renderTaskEditor(task: EventTask) {
    const isTop = task.parent_id === null
    const isHighPriority = editTaskPriority === "high"
    return (
      <div key={task.id} style={{ border: "1px solid var(--plum)", borderRadius: 14, padding: "16px 18px", background: "var(--cream)", marginBottom: 2 }}>
        <input
          autoFocus
          value={editTaskTitle}
          onChange={(e) => setEditTaskTitle(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter" && editTaskTitle.trim()) handleUpdateTask(); if (e.key === "Escape") setEditingTaskId(null) }}
          placeholder="Task title"
          style={{ width: "100%", background: "none", border: "none", borderBottom: "1px solid var(--line)", outline: "none", fontSize: 16, fontFamily: "var(--font-inter)", color: "var(--ink)", padding: "2px 0 8px" }}
        />
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 16, marginTop: 16 }}>
          <label style={{ display: "block" }}>
            <span style={{ ...MONO_STYLE, display: "block", marginBottom: 6 }}>Assignee</span>
            <Select size="sm" value={editTaskAssignee} onChange={(e) => setEditTaskAssignee(e.target.value)}>
              <option value="">Unassigned</option>
              {assigneePool.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
            </Select>
          </label>
          <label style={{ display: "block" }}>
            <span style={{ ...MONO_STYLE, display: "block", marginBottom: 6 }}>Due date</span>
            <Input size="sm" type="date" value={editTaskDue} min={planStartDate || undefined} max={eventPlusTwoMonthsYMD} onChange={(e) => setEditTaskDue(e.target.value)} style={{ cursor: "pointer" }} />
          </label>
          <div>
            <span style={{ ...MONO_STYLE, display: "block", marginBottom: 6 }}>Priority</span>
            <button type="button" onClick={() => setEditTaskPriority((p) => (p === "high" ? "none" : "high"))}
              style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "8px 14px", borderRadius: 999, fontSize: 12, cursor: "pointer",
                background: isHighPriority ? "var(--cream-3)" : "var(--cream-2)", border: "1px solid " + (isHighPriority ? "var(--plum)" : "var(--line-2)"), color: isHighPriority ? "var(--plum)" : "var(--body)", fontFamily: "var(--font-inter)" }}>
              <AlertCircle style={{ width: 12, height: 12 }} />
              High priority
            </button>
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 16 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <CentralButton variant="primary" size="sm" onClick={handleUpdateTask} disabled={savingTaskEdit || !editTaskTitle.trim()}>Save</CentralButton>
            <button onClick={() => setEditingTaskId(null)} style={{ fontSize: 12, color: "var(--muted-text)", background: "none", border: "none", cursor: "pointer", padding: "2px 4px" }}>Cancel</button>
          </div>
          {isTop && (
            <button type="button" onClick={() => setEditTaskPinned((p) => !p)}
              style={{ display: "flex", alignItems: "center", gap: 6, padding: "6px 12px", borderRadius: 999, fontSize: 12, cursor: "pointer",
                background: editTaskPinned ? "var(--plum)" : "var(--cream-2)", border: "1px solid " + (editTaskPinned ? "var(--plum)" : "var(--line-2)"), color: editTaskPinned ? "var(--cream-3)" : "var(--body)" }}>
              <Star style={{ width: 12, height: 12, fill: editTaskPinned ? "currentColor" : "none" }} />
              {editTaskPinned ? "Pinned" : "Pin to top"}
            </button>
          )}
        </div>
      </div>
    )
  }

  // A single checklist row (top-level or child). isChild → tighter, promote
  // action instead of pin/add-subtask, no disclosure/subcount.
  function renderTaskRow(task: EventTask, isChild: boolean) {
    if (canEdit && editingTaskId === task.id) return renderTaskEditor(task)
    const kids = childrenOf(task.id)
    const hasKids = kids.length > 0
    const doneKids = kids.filter((k) => k.completed).length
    const collapsed = collapsedTasks.has(task.id)
    const isHigh = task.priority === "high"
    const hovered = hoveredTaskId === task.id
    const isDragOver = dragOverTaskId === task.id
    const inDeleteConfirm = confirmDeleteTaskId === task.id
    const isDeleting = deletingTaskId === task.id
    const kidCount = kids.length
    return (
      <div
        key={task.id}
        draggable={canEdit}
        onDragStart={canEdit ? (e) => { setDragTaskId(task.id); e.dataTransfer.effectAllowed = "move" } : undefined}
        onDragOver={canEdit ? (e) => { e.preventDefault(); e.stopPropagation(); setDragOverTaskId(task.id); setDragOverSection(null) } : undefined}
        onDrop={canEdit ? (e) => { e.preventDefault(); e.stopPropagation(); if (dragTaskId) nest(dragTaskId, task.id); clearDrag() } : undefined}
        onDragEnd={canEdit ? clearDrag : undefined}
        onMouseEnter={() => setHoveredTaskId(task.id)}
        onMouseLeave={() => setHoveredTaskId((cur) => (cur === task.id ? null : cur))}
        style={{
          position: "relative",
          display: "flex", alignItems: "center", gap: "var(--space-4)",
          padding: isChild ? "11px 12px" : "13px 12px",
          borderBottom: "1px solid var(--line-3)",
          background: isDragOver ? "var(--cream-3)" : hovered ? "var(--cream-2)" : isHigh ? "color-mix(in srgb, var(--plum) 7%, transparent)" : "transparent",
          boxShadow: isDragOver ? "inset 0 0 0 2px var(--plum)" : "none",
          borderRadius: isDragOver ? 8 : 0,
        }}
      >
        {/* disclosure or spacer (no drag-grip gutter — rows sit flush left; the row itself stays draggable) */}
        {!isChild && hasKids ? (
          <button type="button" onClick={(e) => { e.stopPropagation(); setCollapsedTasks((prev) => { const n = new Set(prev); if (n.has(task.id)) n.delete(task.id); else n.add(task.id); return n }) }}
            style={{ background: "none", border: "none", cursor: "pointer", padding: 0, display: "grid", placeItems: "center", color: "var(--faint)", flexShrink: 0, width: 14 }}>
            <ChevronRight style={{ width: 14, height: 14, transform: collapsed ? "rotate(0deg)" : "rotate(90deg)", transition: "transform .15s ease" }} />
          </button>
        ) : (
          <span style={{ width: 14, flexShrink: 0 }} />
        )}
        {/* checkbox */}
        <button
          onClick={(e) => { e.stopPropagation(); if (canEdit) handleToggleTask(task) }}
          disabled={!canEdit}
          style={{ width: 20, height: 20, borderRadius: 6, border: "1.6px solid " + (task.completed ? "var(--plum-2)" : "var(--dashed)"), background: task.completed ? "var(--plum-2)" : "transparent", display: "grid", placeItems: "center", cursor: canEdit ? "pointer" : "default", flexShrink: 0 }}
        >
          {task.completed && <Check style={{ width: 12, height: 12, color: "var(--cream)" }} />}
        </button>
        {/* title */}
        <span style={{ flex: 1, minWidth: 0, fontSize: isChild ? 14.5 : 15.5, color: task.completed ? "var(--faint)" : "var(--ink)", textDecoration: task.completed ? "line-through" : "none", lineHeight: 1.4 }}>{task.title}</span>
        {/* subcount */}
        {!isChild && hasKids && (
          <span style={{ fontFamily: "var(--mono)", fontSize: 11, color: "var(--body)", background: "var(--ivory)", borderRadius: 999, padding: "2px 8px", whiteSpace: "nowrap", flexShrink: 0 }}>✓ {doneKids}/{kids.length}</span>
        )}
        {/* assignee */}
        {task.assigned_name && (
          <span style={{ padding: "3px 10px", borderRadius: 999, background: "var(--ivory)", fontSize: 12, color: "var(--body)", whiteSpace: "nowrap", flexShrink: 0 }}>{task.assigned_name}</span>
        )}
        {/* due */}
        {task.due_date && (
          <span style={{ fontFamily: "var(--mono)", fontSize: 11, color: "var(--muted-text)", whiteSpace: "nowrap", flexShrink: 0 }}>{fmtMD(task.due_date)}</span>
        )}
        {/* hover actions — two-step delete confirm (§14) takes over the cluster */}
        {canEdit && (
          inDeleteConfirm ? (
            <div style={{ display: "flex", alignItems: "center", gap: 8, opacity: 1, flexShrink: 0 }} onMouseDown={(e) => e.stopPropagation()}>
              {kidCount > 0 && (
                <span style={{ fontSize: 11, color: "var(--muted-text)", whiteSpace: "nowrap" }}>and {kidCount} subtask{kidCount > 1 ? "s" : ""}</span>
              )}
              <button
                onClick={(e) => { e.stopPropagation(); handleDeleteTask(task.id) }}
                disabled={isDeleting}
                style={{ fontSize: 11, fontWeight: 600, color: "var(--danger)", background: "color-mix(in srgb, var(--danger) 8%, transparent)", border: "1px solid color-mix(in srgb, var(--danger) 30%, transparent)", borderRadius: 6, padding: "3px 10px", cursor: isDeleting ? "default" : "pointer", whiteSpace: "nowrap" }}
              >
                {isDeleting ? "Deleting…" : kidCount > 0 ? `Delete +${kidCount}` : "Delete"}
              </button>
              <button
                onClick={(e) => { e.stopPropagation(); setConfirmDeleteTaskId(null) }}
                disabled={isDeleting}
                style={{ fontSize: 11, color: "var(--muted-text)", background: "none", border: "none", cursor: isDeleting ? "default" : "pointer", padding: "2px 4px" }}
              >
                Cancel
              </button>
            </div>
          ) : (
            <div style={{ display: "flex", alignItems: "center", gap: 10, opacity: hovered ? 1 : 0, transition: "opacity .12s ease", flexShrink: 0 }}>
              {isChild ? (
                <IconButton dim={24} onClick={(e) => { e.stopPropagation(); promoteTask(task) }} title="Promote to standalone task"><CornerUpLeft style={{ width: 14, height: 14 }} /></IconButton>
              ) : (
                <>
                  <IconButton dim={24} onClick={(e) => { e.stopPropagation(); togglePin(task) }} title={task.pinned ? "Unpin" : "Pin to top"} style={task.pinned ? { color: "var(--plum)" } : undefined}>
                    <Star style={{ width: 14, height: 14, fill: task.pinned ? "currentColor" : "none" }} />
                  </IconButton>
                  <IconButton dim={24} onClick={(e) => { e.stopPropagation(); setCollapsedTasks((prev) => { const n = new Set(prev); n.delete(task.id); return n }); setChildTitle(""); setAddingChildFor(task.id) }} title="Add subtask"><Plus style={{ width: 15, height: 15 }} /></IconButton>
                </>
              )}
              <IconButton dim={24} onClick={(e) => { e.stopPropagation(); startEditTask(task) }} title="Edit"><Pencil style={{ width: 14, height: 14 }} /></IconButton>
              <IconButton dim={24} onClick={(e) => { e.stopPropagation(); setEditingTaskId(null); setConfirmDeleteTaskId(task.id) }} title="Delete"><Trash2 style={{ width: 14, height: 14 }} /></IconButton>
            </div>
          )
        )}
      </div>
    )
  }

  // A top-level task plus (when expanded) its indented children block and the
  // "Add subtask" affordance / inline input.
  function renderTaskTree(task: EventTask) {
    const kids = childrenOf(task.id)
    const hasKids = kids.length > 0
    const collapsed = collapsedTasks.has(task.id)
    const showChildren = hasKids && !collapsed
    const inputOpen = addingChildFor === task.id
    return (
      <Fragment key={task.id}>
        {renderTaskRow(task, false)}
        {(showChildren || inputOpen) && (
          <div style={{ marginLeft: 30, paddingLeft: 16, borderLeft: "1px solid var(--line-2)" }}>
            {showChildren && kids.map((k) => renderTaskRow(k, true))}
            {canEdit && inputOpen && (
              <input
                autoFocus
                value={childTitle}
                onChange={(e) => setChildTitle(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") { if (childTitle.trim()) addChild(task); else setAddingChildFor(null) } if (e.key === "Escape") { setChildTitle(""); setAddingChildFor(null) } }}
                onBlur={() => { if (!childTitle.trim()) setAddingChildFor(null) }}
                placeholder="New subtask, press Enter…"
                style={{ width: "100%", boxSizing: "border-box", background: "var(--cream)", border: "1px solid var(--plum)", borderRadius: 8, outline: "none", fontSize: 14, fontFamily: "var(--font-inter)", color: "var(--ink)", padding: "9px 12px", margin: "8px 0" }}
              />
            )}
            {canEdit && showChildren && !inputOpen && (
              <button type="button" onClick={() => { setChildTitle(""); setAddingChildFor(task.id) }} onMouseEnter={(e) => { e.currentTarget.style.color = "var(--plum)" }} onMouseLeave={(e) => { e.currentTarget.style.color = "var(--muted-text)" }}
                style={{ display: "flex", alignItems: "center", gap: 6, background: "none", border: "none", cursor: "pointer", color: "var(--muted-text)", fontSize: 13, fontFamily: "var(--font-inter)", padding: "8px 0" }}>
                <Plus style={{ width: 14, height: 14 }} /> Add subtask
              </button>
            )}
          </div>
        )}
      </Fragment>
    )
  }

  const cardStyle: React.CSSProperties = {
    background: "var(--cream-panel)",
    border: "1px solid var(--line-2)",
    borderRadius: 12,
    padding: "20px 24px",
    marginBottom: 16,
  }

  const sectionHeadingStyle: React.CSSProperties = {
    fontFamily: "var(--font-instrument-serif)",
    fontSize: 20,
    fontWeight: 400,
    color: "var(--ink)",
    margin: "0 0 16px",
  }

  const chipStyle: React.CSSProperties = {
    background: "#EFEAE0",
    color: "var(--body)",
    borderRadius: 999,
    padding: "2px 8px",
    fontSize: 12,
    whiteSpace: "nowrap" as const,
  }

  return (
    <div
      style={inline
        ? {}
        : { position: "fixed", top: 0, bottom: 0, left: 0, right: 0, zIndex: 75, background: "var(--cream-panel)", overflowY: "auto" }
      }
      className={inline ? "" : "md:left-[var(--shell-offset)]"}
    >
      {/* Event-name header is provided by SubpageShell's `title` prop (canonical
          TabPageHeader rhythm) — no hand-rolled header here. */}

      {/* Underline section tabs. Under SubpageShell (bare) the strip bleeds the
          shell's md:px-14 via md:-mx-14 so its own md:pl-14 self-inset lands at the
          same 56px edge as the siblings (convention #16 — one effective inset). */}
      <div className={bare ? "md:-mx-14" : ""}>
        <PlanSubTabStrip
          tabs={sections}
          active={activeSection}
          onChange={s => setActiveSectionAndUrl(s as ActiveSection)}
        />
      </div>

      {/* Content */}
      <div className={bare ? "" : "px-5 md:px-14"} style={{ paddingTop: 24, paddingBottom: 80 }}>
        {loading ? (
          <div style={{ textAlign: "center", padding: "48px 0", color: "var(--muted-text)", fontSize: 13 }}>Loading…</div>
        ) : (
          <>
            {/* ── Overview ── */}
            {activeSection === 'overview' && (() => {
              // ── Derived overview metrics ──────────────────────────────────
              const taskTotal = tasks.length
              const taskDone = tasks.filter(t => t.completed).length
              const rolesTotal = roles.length
              const rolesAssigned = roles.filter(r => r.assigned_to).length
              const pct = taskTotal > 0 ? Math.round((taskDone / taskTotal) * 100) : 0
              const filledSegs = taskTotal > 0 ? Math.round((taskDone / taskTotal) * 5) : 0
              // Readiness status from checklist progress
              const readiness = taskTotal === 0
                ? { color: "var(--faint)", label: "No checklist yet" }
                : pct === 100 ? { color: "var(--success)", label: "Ready" }
                : pct >= 50 ? { color: "var(--sage)", label: "In progress" }
                : { color: "var(--gold)", label: "Needs attention" }
              // Identity facts — display-only. Two columns: LEFT Time + Location,
              // RIGHT Plan start + Crunch start (dates are edited in the Edit-event
              // modal, not here). Time omits when empty (all-day); Location and
              // Crunch start show a muted em-dash when unset.
              const dateOnly = startDate.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })
              const timeVal = calendarEvent.all_day ? "" :
                startDate.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" }) +
                " – " + endDate.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })
              const locationVal = calendarEvent.location?.trim() || ""
              const descVal = calendarEvent.description?.trim() || ""
              const leftFacts: { k: string; v: string; muted?: boolean }[] = [
                ...(timeVal ? [{ k: "Time", v: timeVal }] : []),
                { k: "Location", v: locationVal || "—", muted: !locationVal },
              ]
              const rightFacts: { k: string; v: string; muted?: boolean }[] = [
                { k: "Plan start", v: planStartDate ? fmtMD(planStartDate) : "—", muted: !planStartDate },
                { k: "Crunch start", v: crunchDate ? fmtMD(crunchDate) : "—", muted: !crunchDate },
              ]

              const monoLabel: React.CSSProperties = { ...MONO_STYLE, margin: 0 }
              const eyebrow: React.CSSProperties = { ...monoLabel, marginBottom: 14 }
              const bigNumber: React.CSSProperties = { fontFamily: "var(--font-instrument-serif)", fontSize: 34, fontWeight: 400, letterSpacing: -0.6, lineHeight: 1.05, marginTop: 10 }
              const bigInput: React.CSSProperties = { ...bigNumber, color: "var(--ink)", background: "transparent", border: "none", outline: "none", padding: 0, width: "100%" }
              const factKey: React.CSSProperties = { fontFamily: "var(--mono)", fontSize: "10.5px", letterSpacing: "1.2px", textTransform: "uppercase", color: "var(--muted-text)" }
              const renderFact = (f: { k: string; v: string; muted?: boolean }, keyW: number) => (
                <div key={f.k} style={{ display: "flex", alignItems: "baseline", gap: 12 }}>
                  <span style={{ ...factKey, width: keyW, flexShrink: 0 }}>{f.k}</span>
                  <span style={{ fontSize: 15, color: f.muted ? "var(--faint)" : "var(--ink)", lineHeight: 1.5 }}>{f.v}</span>
                </div>
              )

              return (
              <div style={{ display: "grid", gridTemplateColumns: "1fr 336px", gap: "var(--space-10)", alignItems: "start", marginTop: "var(--space-9)" }} className="max-md:!block">
                {/* ── LEFT column ── */}
                <section>
                  {/* Event identity header */}
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 16, paddingBottom: 24, marginBottom: "var(--space-9)", borderBottom: "1px solid var(--line)" }}>
                    <div>
                      <div style={{ fontFamily: "var(--font-instrument-serif)", fontSize: 32, fontWeight: 600, color: "var(--ink)", lineHeight: 1.1, letterSpacing: -0.4 }}>{dateOnly}</div>
                      <div style={{ display: "grid", gridTemplateColumns: "300px auto", columnGap: "var(--space-12)", rowGap: 16, marginTop: 18, justifyContent: "start" }} className="max-md:!grid-cols-1">
                        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                          {leftFacts.map(f => renderFact(f, 72))}
                        </div>
                        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                          {rightFacts.map(f => renderFact(f, 104))}
                        </div>
                      </div>
                      {descVal && (
                        <div style={{ marginTop: 16 }}>{renderFact({ k: "What", v: descVal }, 72)}</div>
                      )}
                    </div>
                    {canEdit && onEditEvent && (
                      <button
                        onClick={onEditEvent}
                        onMouseEnter={(e) => { e.currentTarget.style.borderColor = "var(--dashed)" }}
                        onMouseLeave={(e) => { e.currentTarget.style.borderColor = "var(--line-2)" }}
                        style={{ display: "inline-flex", alignItems: "center", gap: 8, flexShrink: 0, background: "var(--cream)", border: "1px solid var(--line-2)", borderRadius: "var(--r-input)", padding: "9px 15px", fontSize: 14, color: "var(--body)", cursor: "pointer", transition: "border-color .15s ease", whiteSpace: "nowrap" }}
                      >
                        <Pencil style={{ width: 14, height: 14 }} /> Edit event
                      </button>
                    )}
                  </div>

                  {/* Launchpad */}
                  <div>
                    <p style={eyebrow}>Jump into planning</p>
                    <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-4)" }}>
                      <LaunchpadRow
                        icon={ClipboardList}
                        title="Checklist"
                        subtitle="Tasks to prepare before the event"
                        onClick={() => setActiveSectionAndUrl('checklist')}
                        right={
                          <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
                            <span style={{ width: 90, height: 5, borderRadius: 99, background: "var(--line-2)", overflow: "hidden" }}>
                              <span style={{ display: "block", height: "100%", width: `${taskTotal > 0 ? (taskDone / taskTotal) * 100 : 0}%`, background: "var(--plum)" }} />
                            </span>
                            <span style={{ fontSize: 12, color: "var(--body)", whiteSpace: "nowrap" }}>{taskDone} / {taskTotal}</span>
                          </span>
                        }
                      />
                      <LaunchpadRow
                        icon={Users}
                        title="Roles & Leads"
                        subtitle="Assign who owns each part"
                        onClick={() => setActiveSectionAndUrl('roles')}
                        right={<span style={{ fontSize: 12, color: "var(--body)", whiteSpace: "nowrap" }}>{rolesAssigned} / {rolesTotal} assigned</span>}
                      />
                      {extraTabs.map(t => (
                        <LaunchpadRow
                          key={t}
                          icon={EXTRA_TAB_META[t].icon}
                          title={EXTRA_TAB_LABELS[t]}
                          subtitle={EXTRA_TAB_META[t].subtitle}
                          onClick={() => setActiveSectionAndUrl(t)}
                        />
                      ))}
                    </div>
                  </div>

                  {/* Planning notes (demoted) */}
                  <div style={{ marginTop: "var(--space-9)" }}>
                    <p style={eyebrow}>Planning notes</p>
                    {canEdit ? (
                      <textarea
                        value={overviewNotes}
                        onChange={e => setOverviewNotes(e.target.value)}
                        onBlur={handleSaveOverview}
                        placeholder="Add context, key decisions, or reminders for this event…"
                        style={{ width: "100%", minHeight: 74, background: "var(--cream-2)", border: "1px solid var(--line-2)", borderRadius: 12, padding: "15px 17px", fontSize: 14, fontFamily: "var(--font-inter)", color: "var(--ink)", lineHeight: 1.6, resize: "vertical", outline: "none", boxSizing: "border-box" }}
                      />
                    ) : overviewNotes ? (
                      <p style={{ fontSize: 14, color: "var(--body)", lineHeight: 1.7, whiteSpace: "pre-wrap" }}>{overviewNotes}</p>
                    ) : (
                      <p style={{ fontSize: 14, color: "var(--faint)", fontStyle: "italic" }}>No planning notes yet.</p>
                    )}
                  </div>
                </section>

                {/* ── RIGHT column — stat cards ── */}
                <aside style={{ display: "flex", flexDirection: "column", gap: "var(--space-6)" }} className="max-md:mt-8">
                  {/* Expected turnout */}
                  <CentralCard variant="callout" radius="var(--r-callout)" padding={22}>
                    <p style={monoLabel}>Expected turnout</p>
                    {canEdit && editingTurnout ? (
                      <input
                        type="number"
                        autoFocus
                        value={turnout}
                        onChange={(e) => setTurnout(e.target.value)}
                        onBlur={() => { handleSaveOverview(); setEditingTurnout(false) }}
                        onKeyDown={(e) => { if (e.key === "Enter") { handleSaveOverview(); setEditingTurnout(false) } }}
                        placeholder="—"
                        style={bigInput}
                      />
                    ) : (
                      <p
                        onClick={() => { if (canEdit) setEditingTurnout(true) }}
                        style={{ ...bigNumber, color: turnout ? "var(--ink)" : "var(--faint)", cursor: canEdit ? "pointer" : "default" }}
                      >{turnout || "—"}</p>
                    )}
                    <p style={{ fontSize: 13, color: "var(--muted-text)", marginTop: 4 }}>guests</p>
                    {rsvpCount !== null && (
                      <p style={{ fontSize: 12, color: "var(--body)", marginTop: 6, paddingTop: 6, borderTop: "1px solid var(--line)" }}>
                        <span style={{ fontWeight: 500, color: "var(--plum)" }}>{rsvpCount}</span> RSVPed via announcement
                      </p>
                    )}
                  </CentralCard>

                  {/* Budget */}
                  <CentralCard variant="callout" radius="var(--r-callout)" padding={22}>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                      <p style={monoLabel}>Budget</p>
                      {!canEditBudget && <span style={{ fontSize: 11, color: "var(--faint)", fontStyle: "italic" }}>Treasurer only</span>}
                    </div>
                    {canEditBudget && editingBudget ? (
                      <input
                        type="number"
                        autoFocus
                        value={budget}
                        onChange={(e) => setBudget(e.target.value)}
                        onBlur={() => { handleSaveOverview(); setEditingBudget(false) }}
                        onKeyDown={(e) => { if (e.key === "Enter") { handleSaveOverview(); setEditingBudget(false) } }}
                        placeholder="—"
                        style={bigInput}
                      />
                    ) : (
                      <p
                        onClick={() => { if (canEditBudget) setEditingBudget(true) }}
                        style={{ ...bigNumber, color: budget ? "var(--ink)" : "var(--faint)", cursor: canEditBudget ? "pointer" : "default" }}
                      >{budget ? `$${budget}` : "—"}</p>
                    )}
                    <p style={{ fontSize: 13, color: "var(--muted-text)", marginTop: 4 }}>allocated for this event</p>
                    {typeCfg.budgetCategory && (
                      <div style={{ marginTop: 16, paddingTop: 16, borderTop: "1px solid var(--line)" }}>
                        <p style={{ ...monoLabel, letterSpacing: "0.08em" }}>Ministry allocation · {calendarEvent.title}</p>
                        {ministryBudget ? (
                          <>
                            <p style={{ fontSize: 15, fontWeight: 500, color: "var(--ink)", marginTop: 6 }}>
                              ${ministryBudget.total.toFixed(2)}
                            </p>
                            <p style={{ fontSize: 12, color: "var(--body)", marginTop: 2 }}>
                              {Object.entries(ministryBudget.byFund)
                                .map(([fund, amt]) => `${fund.charAt(0).toUpperCase() + fund.slice(1)} $${amt.toFixed(2)}`)
                                .join(" · ")}
                            </p>
                          </>
                        ) : (
                          <p style={{ fontSize: 12, color: "var(--faint)", fontStyle: "italic", marginTop: 6 }}>
                            No ministry budget set
                          </p>
                        )}
                      </div>
                    )}
                  </CentralCard>

                  {/* Readiness */}
                  <CentralCard variant="callout" radius="var(--r-callout)" padding={22}>
                    <p style={monoLabel}>Readiness</p>
                    <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 12 }}>
                      <span style={{ width: 8, height: 8, borderRadius: 99, background: readiness.color, flexShrink: 0 }} />
                      <span style={{ fontSize: 14, fontWeight: 500, color: "var(--ink)" }}>{readiness.label}</span>
                    </div>
                    <div style={{ display: "flex", gap: 6, marginTop: 14 }}>
                      {Array.from({ length: 5 }).map((_, i) => (
                        <span key={i} style={{ flex: 1, height: 6, borderRadius: 99, background: i < filledSegs ? (pct === 100 ? "var(--success)" : "var(--plum)") : "var(--line-2)" }} />
                      ))}
                    </div>
                    {taskTotal > 0 && (
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginTop: 12 }}>
                        <span style={{ fontSize: 12, color: "var(--body)" }}>{taskDone} of {taskTotal} done</span>
                        <span style={{ fontFamily: "var(--font-instrument-serif)", fontSize: 18, fontWeight: 600, color: "var(--ink)" }}>{pct}%</span>
                      </div>
                    )}
                  </CentralCard>
                </aside>
              </div>
              )
            })()}

            {/* ── Checklist ── */}
            {activeSection === 'checklist' && (
              <div>
                <EventSectionHeader title="Checklist" action={<span style={{ fontSize: 13, color: "var(--muted-text)" }}>{incompleteTasks.length} of {tasks.length} remaining</span>} />

                {/* Pinned band — top-level pinned tasks (+ their children) */}
                {pinnedTop.length > 0 && (
                  <CentralCard variant="inset" radius="var(--r-callout)" padding="6px 14px 8px" style={{ marginBottom: 24 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "8px 0 6px" }}>
                      <Star style={{ width: 12, height: 12, color: "var(--plum)", fill: "currentColor" }} />
                      <span style={{ fontFamily: "var(--mono)", fontSize: 10.5, letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--plum)", fontWeight: 600 }}>Pinned</span>
                    </div>
                    {pinnedTop.map((task) => renderTaskTree(task))}
                  </CentralCard>
                )}

                {/* Date-driven sections — top-level, non-pinned tasks grouped by window */}
                {sectionDefs.map((section) => {
                  const sectionTop = tasks
                    .filter((t) => t.parent_id === null && !t.pinned && sectionOf(t) === section.key)
                    .sort((a, b) => (Number(b.priority === "high") - Number(a.priority === "high")) || (a.sort_order - b.sort_order))
                  const remaining = tasks.filter((t) => !inBand(t) && sectionOf(t) === section.key && !t.completed).length
                  const isCollapsed = collapsedPhases.has(section.key)
                  const isDropZone = dragOverSection === section.key
                  return (
                    <div
                      key={section.key}
                      style={{ marginBottom: 28 }}
                      onDragOver={canEdit ? (e) => { e.preventDefault(); setDragOverSection(section.key); setDragOverTaskId(null) } : undefined}
                      onDrop={canEdit ? (e) => { e.preventDefault(); if (dragTaskId) requestMoveToSection(dragTaskId, section.key); clearDrag() } : undefined}
                    >
                      {/* Section header */}
                      <button
                        onClick={() => setCollapsedPhases(prev => {
                          const next = new Set(prev)
                          if (next.has(section.key)) next.delete(section.key)
                          else next.add(section.key)
                          return next
                        })}
                        style={{ display: "flex", alignItems: "center", gap: 10, background: "none", border: "none", cursor: "pointer", padding: "0 0 10px", width: "100%", textAlign: "left" }}
                      >
                        <span style={{ fontFamily: "var(--mono)", fontSize: "10px", letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--muted-text)", fontWeight: 600 }}>{section.label}</span>
                        <span style={{ fontFamily: "var(--mono)", fontSize: 10.5, color: "var(--body)", background: "var(--ivory)", borderRadius: 999, padding: "2px 8px" }}>{remaining} remaining</span>
                        <ChevronRight style={{ marginLeft: "auto", width: 14, height: 14, color: "var(--faint)", transform: isCollapsed ? "rotate(0deg)" : "rotate(90deg)", transition: "transform .15s ease" }} />
                      </button>
                      <div style={{ borderTop: "1px solid var(--line)" }} />

                      {isDropZone && (
                        <div style={{ margin: "10px 0", padding: "12px", border: "1.5px dashed var(--plum)", borderRadius: 10, textAlign: "center" }}>
                          <span style={{ fontFamily: "var(--mono)", fontSize: 10.5, letterSpacing: "0.06em", textTransform: "uppercase", color: "var(--plum)" }}>Drop here to make it a standalone task</span>
                        </div>
                      )}

                      {!isCollapsed && (
                        <>
                          {sectionTop.length === 0 && !isDropZone && (
                            <p style={{ fontFamily: "var(--font-instrument-serif)", fontStyle: "italic", fontSize: 14, color: "var(--faint)", padding: "14px 4px 6px" }}>No tasks yet for this section.</p>
                          )}
                          {sectionTop.map((task) => renderTaskTree(task))}

                          {/* Inline add row per section — prefills due to the section window */}
                          {canEdit && (
                            <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "11px 12px", borderBottom: "1px dashed var(--dashed)" }}>
                              <Plus style={{ width: 14, height: 14, color: "var(--faint)", flexShrink: 0 }} />
                              <input
                                value={section.key === newTaskSection ? newTaskTitle : ""}
                                onChange={(e) => {
                                  if (section.key !== newTaskSection) { setNewTaskSection(section.key); setNewTaskDue(section.defaultDue) }
                                  setNewTaskTitle(e.target.value)
                                }}
                                onFocus={() => { if (section.key !== newTaskSection) { setNewTaskSection(section.key); setNewTaskDue(section.defaultDue) } }}
                                placeholder={`Add to ${section.label}…`}
                                style={{ flex: 1, background: "none", border: "none", outline: "none", fontSize: 15, fontFamily: "var(--font-inter)", color: "var(--ink)" }}
                                onKeyDown={(e) => { if (e.key === "Enter" && newTaskTitle.trim() && newTaskSection === section.key) handleAddTask(section) }}
                              />
                              {section.key === newTaskSection && newTaskTitle.trim() && (
                                <>
                                  <select
                                    value={newTaskAssignee}
                                    onChange={(e) => setNewTaskAssignee(e.target.value)}
                                    style={{ padding: "4px 10px", borderRadius: 999, border: "1px solid var(--line-2)", background: "var(--cream-panel)", color: "var(--body)", fontSize: 11, cursor: "pointer", fontFamily: "var(--font-inter)" }}
                                  >
                                    <option value="">Unassigned</option>
                                    {assigneePool.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
                                  </select>
                                  <input
                                    type="date"
                                    value={newTaskDue}
                                    min={planStartDate || undefined}
                                    max={eventPlusTwoMonthsYMD}
                                    onChange={(e) => setNewTaskDue(e.target.value)}
                                    style={{ padding: "4px 10px", borderRadius: 999, border: "1px solid var(--line-2)", background: "var(--cream-panel)", color: "var(--body)", fontSize: 11, fontFamily: "var(--font-inter)", cursor: "pointer" }}
                                  />
                                  <CentralButton
                                    variant="primary" size="sm"
                                    onClick={() => handleAddTask(section)}
                                    disabled={addingTask}
                                  >
                                    Add
                                  </CentralButton>
                                </>
                              )}
                            </div>
                          )}
                        </>
                      )}
                    </div>
                  )
                })}

                {/* Section-move date-change confirmation (dated task → different window) */}
                {pendingSectionMove && (
                  <CentralModal
                    onClose={() => { if (!sectionMoveBusy) setPendingSectionMove(null) }}
                    title="Change task date?"
                    maxWidth={380}
                    z={210}
                    footer={
                      <>
                        <button
                          onClick={() => setPendingSectionMove(null)}
                          disabled={sectionMoveBusy}
                          style={{ fontSize: 13, color: "var(--muted-text)", background: "none", border: "none", cursor: sectionMoveBusy ? "default" : "pointer", padding: "6px 8px" }}
                        >
                          Cancel
                        </button>
                        <button
                          onClick={confirmSectionMove}
                          disabled={sectionMoveBusy}
                          style={{ fontSize: 13, fontWeight: 600, color: "var(--cream)", background: "var(--plum)", border: "none", borderRadius: 8, padding: "8px 16px", cursor: sectionMoveBusy ? "default" : "pointer" }}
                        >
                          {sectionMoveBusy ? "Moving…" : "Continue"}
                        </button>
                      </>
                    }
                  >
                    <p style={{ fontSize: 15, lineHeight: 1.5, color: "var(--ink)", margin: 0 }}>
                      This will change this task&rsquo;s date to fit the {sectionDefs.find((s) => s.key === pendingSectionMove.sectionKey)?.label ?? "section"} window. Continue?
                    </p>
                  </CentralModal>
                )}
              </div>
            )}

            {/* ── Roles & Leads ── */}
            {activeSection === 'roles' && (() => {
              const needs = roles.filter(r => !r.assigned_to)
              const covered = roles.filter(r => r.assigned_to)
              const iconBtnBase: React.CSSProperties = { background: "none", border: "none", padding: 3, borderRadius: 6, cursor: "pointer", display: "grid", placeItems: "center", color: "var(--faint)" }

              const GroupHeader = ({ label, count, allSet }: { label: string; count?: number; allSet?: boolean }) => (
                <div style={{ display: "flex", alignItems: "center", gap: 10, margin: "28px 0 4px" }}>
                  <span style={{ fontFamily: "var(--mono)", fontSize: 11, letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--muted-text)" }}>{label}</span>
                  {allSet ? (
                    <span style={{ fontStyle: "italic", fontSize: 13, color: "var(--faint)", fontFamily: "var(--font-inter)" }}>All roles covered</span>
                  ) : (
                    <span style={{ background: "var(--ivory)", borderRadius: 999, padding: "2px 8px", fontSize: 11, color: "var(--body)", fontFamily: "var(--font-inter)" }}>{count}</span>
                  )}
                  <span style={{ flex: 1, height: 1, background: "var(--line)" }} />
                </div>
              )

              const renderRow = (role: EventRole, isLast: boolean) => {
                if (editingRoleId === role.id) {
                  return (
                    <div key={role.id} style={{ borderBottom: isLast ? "none" : "1px solid var(--line-3)" }}>
                      <div style={{ padding: "14px 8px", display: "flex", flexDirection: "column", gap: 8 }}>
                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                          <Input value={editRoleName} onChange={(e) => setEditRoleName(e.target.value)} placeholder="Role name" className="roleinput" />
                          <Select value={editRoleAssignee} onChange={(e) => setEditRoleAssignee(e.target.value)} className="roleinput">
                            <option value="">Unassigned</option>
                            {members.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
                          </Select>
                        </div>
                        <Input value={editRoleNotes} onChange={(e) => setEditRoleNotes(e.target.value)} placeholder="Notes (optional)" className="roleinput" />
                        <div style={{ display: "flex", gap: 8 }}>
                          <CentralButton variant="primary" size="sm" onClick={() => handleSaveRoleEdit(role.id)}>Save</CentralButton>
                          <button onClick={() => setEditingRoleId(null)} style={{ padding: "6px 14px", borderRadius: 10, border: "1px solid var(--line-2)", background: "none", fontSize: 13, fontFamily: "var(--font-inter)", color: "var(--body)", cursor: "pointer" }}>Cancel</button>
                        </div>
                      </div>
                    </div>
                  )
                }
                const isCovered = !!role.assigned_to
                const initials = role.assigned_name?.split(/\s+/).map(w => w[0]).join("").slice(0, 2).toUpperCase() ?? ""
                return (
                  <ListRow key={role.id} hover={false} last={isLast} className="rrow" style={{ display: "grid", gridTemplateColumns: "38px 1fr auto", gap: 16, alignItems: "center", padding: "14px 8px" }}>
                    {isCovered ? (
                      <MonogramChip initials={initials} style={{ width: 38, height: 38, fontSize: 13, fontWeight: 600 }} />
                    ) : (
                      <div style={{ width: 38, height: 38, border: "1px dashed var(--dashed)", borderRadius: 999, display: "grid", placeItems: "center" }}>
                        <Plus style={{ width: 16, height: 16, color: "var(--dashed)" }} />
                      </div>
                    )}
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontFamily: "var(--font-inter)", fontSize: 15, fontWeight: 500, color: "var(--ink)", letterSpacing: "-0.01em" }}>{role.role_name}</div>
                      {role.notes ? (
                        <div style={{ fontSize: 13, color: "var(--body)", lineHeight: 1.4, marginTop: 3 }}>{role.notes}</div>
                      ) : canEdit ? (
                        <div style={{ fontSize: 13, color: "var(--faint)", fontStyle: "italic", lineHeight: 1.4, marginTop: 3, fontFamily: "var(--font-inter)" }}>Add a note for whoever takes this on</div>
                      ) : null}
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                      {isCovered ? (
                        <>
                          <span style={{ fontSize: 14, color: "var(--ink)", whiteSpace: "nowrap", fontFamily: "var(--font-inter)" }}>{role.assigned_name}</span>
                          {canEdit && (
                            <button className="role-icon danger" title="Unassign" onClick={() => handleUnassignRole(role.id)} style={iconBtnBase}>
                              <X style={{ width: 16, height: 16 }} />
                            </button>
                          )}
                        </>
                      ) : canEdit ? (
                        assigningRoleId === role.id ? (
                          <select autoFocus defaultValue="" onChange={(e) => handleAssignRole(role.id, e.target.value)} onBlur={() => setAssigningRoleId(null)} style={{ border: "1px solid var(--plum)", borderRadius: 10, padding: "8px 11px", fontSize: 15, fontFamily: "var(--font-inter)", color: "var(--ink)", background: "var(--cream)", outline: "none" }}>
                            <option value="">Choose someone…</option>
                            {members.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
                          </select>
                        ) : (
                          <button className="assignbtn" onClick={() => setAssigningRoleId(role.id)} style={{ border: "1px dashed var(--dashed)", borderRadius: 10, padding: "8px 14px", color: "var(--plum)", background: "transparent", fontSize: 13, fontFamily: "var(--font-inter)", whiteSpace: "nowrap", cursor: "pointer" }}>+ Assign someone</button>
                        )
                      ) : null}
                      {canEdit && (
                        <>
                          <button className="role-icon" title="Edit role" onClick={() => { setShowAddRole(false); setEditingRoleId(role.id); setEditRoleName(role.role_name); setEditRoleAssignee(role.assigned_to ?? ""); setEditRoleNotes(role.notes ?? "") }} style={iconBtnBase}>
                            <Pencil style={{ width: 16, height: 16 }} />
                          </button>
                          <button className="role-icon danger" title="Delete role" onClick={() => handleDeleteRole(role.id)} style={iconBtnBase}>
                            <Trash2 style={{ width: 16, height: 16 }} />
                          </button>
                        </>
                      )}
                    </div>
                  </ListRow>
                )
              }

              return (
              <div className="rolesui">
                <style>{`
                  .rolesui .rrow{transition:background .12s}
                  .rolesui .rrow:hover{background:var(--cream-2)}
                  .rolesui .rrow:hover .role-icon{opacity:1}
                  .rolesui .role-icon{opacity:0;transition:opacity .12s}
                  .rolesui .role-icon:hover{color:var(--body)}
                  .rolesui .role-icon.danger:hover{color:var(--danger)}
                  .rolesui .assignbtn:hover{border-color:var(--plum)}
                `}</style>
                <EventSectionHeader
                  title="Roles"
                  action={canEdit ? (
                    <>
                      {planningGroupId ? (
                        <ContentActionButton
                          variant="ghost"
                          icon={<MessageCircle style={{ width: 14, height: 14 }} />}
                          label="Open planning chat"
                          onClick={() => onOpenChat?.(planningGroupId, `${calendarEvent.title} Planning`)}
                        />
                      ) : (
                        <ContentActionButton
                          variant="ghost"
                          icon={<MessageCircle style={{ width: 14, height: 14 }} />}
                          label={creatingPlanChat ? "Creating…" : "Create planning chat"}
                          onClick={handleCreatePlanningChat}
                          disabled={creatingPlanChat || covered.length === 0}
                          title={covered.length === 0 ? "Assign roles first" : "Create a group chat with all role holders"}
                        />
                      )}
                      {!showAddRole && !editingRoleId && (
                        <ContentActionButton
                          variant="primary"
                          icon={<Plus style={{ width: 14, height: 14 }} />}
                          label="Add role"
                          onClick={() => { setNewRoleName(""); setNewRoleNotes(""); setNewRoleAssignee(""); setEditingRoleId(null); setShowAddRole(true) }}
                        />
                      )}
                    </>
                  ) : undefined}
                />
                {planChatError && <p style={{ fontSize: 12, color: "var(--danger)", marginTop: 8 }}>{planChatError}</p>}

                {/* Inline add-role form */}
                {canEdit && showAddRole && (
                  <div style={{ display: "grid", gridTemplateColumns: "230px 1fr 180px auto auto", gap: 14, alignItems: "center", border: "1px dashed var(--dashed)", borderRadius: 14, padding: "14px 18px", marginTop: 20, background: "var(--cream-2)" }}>
                    <Input
                      value={newRoleName}
                      onChange={(e) => setNewRoleName(e.target.value)}
                      placeholder="Role name…"
                      className="roleinput"
                      style={{ fontWeight: 500 }}
                    />
                    <Input
                      value={newRoleNotes}
                      onChange={(e) => setNewRoleNotes(e.target.value)}
                      placeholder="What they're responsible for…"
                      className="roleinput"
                    />
                    <Select
                      value={newRoleAssignee}
                      onChange={(e) => setNewRoleAssignee(e.target.value)}
                      className="roleinput"
                    >
                      <option value="">Unassigned</option>
                      {members.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
                    </Select>
                    <CentralButton variant="primary" size="sm" onClick={handleAddRole} disabled={addingRole || !newRoleName.trim()}>Add</CentralButton>
                    <button onClick={() => setShowAddRole(false)} style={{ padding: "8px 14px", borderRadius: 10, border: "none", background: "none", fontSize: 13, fontFamily: "var(--font-inter)", color: "var(--body)", cursor: "pointer" }}>Cancel</button>
                  </div>
                )}

                {roles.length === 0 ? (
                  <p style={{ fontFamily: "var(--font-instrument-serif)", fontStyle: "italic", fontSize: 15, color: "var(--faint)", padding: "24px 0 8px" }}>
                    {canEdit ? "No roles yet — add the first one." : "No roles defined yet."}
                  </p>
                ) : (
                  <>
                    <GroupHeader label="Needs someone" count={needs.length} allSet={needs.length === 0} />
                    {needs.map((role, i) => renderRow(role, i === needs.length - 1))}
                    {covered.length > 0 && (
                      <>
                        <GroupHeader label="Covered" count={covered.length} />
                        {covered.map((role, i) => renderRow(role, i === covered.length - 1))}
                      </>
                    )}
                  </>
                )}
              </div>
              )
            })()}

            {/* ── Transition Notes (cross-year institutional memory) ── */}
            {activeSection === 'notes' && (
              <section>
                {/* Header row */}
                <EventSectionHeader
                  title="Transition Notes"
                  action={canEdit ? (
                    <button
                      onClick={() => setPpModalOpen(true)}
                      style={{ display: "inline-flex", alignItems: "center", gap: 7, background: "var(--plum)", color: "var(--cream-on-dark)", border: "none", borderRadius: 9999, padding: "9px 16px", fontSize: 13, fontWeight: 500, cursor: "pointer", fontFamily: "var(--font-inter)" }}
                    >
                      <Plus className="w-4 h-4" /> Log a pain point
                    </button>
                  ) : undefined}
                />

                {/* Category filter chips */}
                <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 22 }}>
                  {PP_FILTERS.map(cat => {
                    const active = ppCategoryFilter === cat
                    return (
                      <FilterChip
                        key={cat}
                        selected={active}
                        onClick={() => setPpCategoryFilter(cat)}
                        tone="plum"
                        style={{ fontWeight: 500 }}
                      >
                        {cat}
                      </FilterChip>
                    )
                  })}
                </div>

                {/* Year groups */}
                <div style={{ marginTop: 30, display: "flex", flexDirection: "column", gap: 36 }}>
                  {ppCategoryFilter !== "All" && transitionGroups.every(g => g.notes.length === 0) ? (
                    <p style={{ fontFamily: "var(--font-instrument-serif)", fontStyle: "italic", fontSize: 14, color: "var(--faint)" }}>
                      Nothing tagged &ldquo;{ppCategoryFilter}&rdquo; yet.
                    </p>
                  ) : transitionGroups.map(({ year, notes: yearNotes }) => {
                    const isCurrent = year === CURRENT_CLASS_YEAR
                    const showEmpty = isCurrent && ppCategoryFilter === "All" && yearNotes.length === 0
                    // Hide non-current empty groups, and current empty groups under a category filter.
                    if (yearNotes.length === 0 && !showEmpty) return null
                    return (
                      <div key={year}>
                        {/* Year header */}
                        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                          <span style={{ fontFamily: "var(--font-instrument-serif)", fontSize: 20, fontWeight: 400, color: "var(--ink)", letterSpacing: -0.2, whiteSpace: "nowrap" }}>
                            {year.replace("-", "–")}
                          </span>
                          {isCurrent && (
                            <span style={{ fontFamily: "var(--mono)", fontSize: 10, letterSpacing: "0.08em", textTransform: "uppercase", background: "var(--plum)", color: "var(--cream-on-dark)", padding: "3px 9px", borderRadius: 9999, whiteSpace: "nowrap" }}>
                              Current
                            </span>
                          )}
                          <span style={{ fontSize: 12, color: "var(--muted-text)", whiteSpace: "nowrap" }}>
                            {yearNotes.length} {yearNotes.length === 1 ? "note" : "notes"}
                          </span>
                          <span style={{ flex: 1, height: 1, background: "var(--line)" }} />
                        </div>

                        {showEmpty ? (
                          <p style={{ marginTop: 16, fontFamily: "var(--font-instrument-serif)", fontStyle: "italic", fontSize: 15, color: "var(--faint)" }}>
                            No pain points logged yet — add the first one for this class.
                          </p>
                        ) : (
                          <div style={{ marginTop: 16, display: "flex", flexDirection: "column", gap: 16 }}>
                            {yearNotes.map(pp => (
                              <CentralCard
                                key={pp.id}
                                variant="callout"
                                radius="var(--r-callout)"
                                padding="22px 22px"
                              >
                                {/* Title + category */}
                                <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12 }}>
                                  <h3 style={{ fontSize: 16.5, fontWeight: 500, color: "var(--ink)", margin: 0, lineHeight: 1.35, fontFamily: "var(--font-inter)" }}>{pp.title}</h3>
                                  {pp.category && (
                                    <span style={{ fontFamily: "var(--mono)", fontSize: 10.5, letterSpacing: "0.05em", textTransform: "uppercase", background: "var(--ivory)", border: "1px solid var(--line-2)", color: "var(--body)", padding: "3px 9px", borderRadius: 9999, whiteSpace: "nowrap", flexShrink: 0 }}>
                                      {pp.category}
                                    </span>
                                  )}
                                </div>

                                {/* Watch / Solved columns */}
                                {(pp.watch_text || pp.solved_text) && (
                                  <div style={{ display: "grid", gridTemplateColumns: pp.watch_text && pp.solved_text ? "1fr 1fr" : "1fr", gap: 20, marginTop: 16 }} className="max-md:!grid-cols-1">
                                    {pp.watch_text && (
                                      <div>
                                        <p style={{ display: "flex", alignItems: "center", gap: 6, fontFamily: "var(--mono)", fontSize: 10.5, letterSpacing: "0.06em", textTransform: "uppercase", color: "var(--muted-text)", margin: 0 }}>
                                          <AlertTriangle className="w-3.5 h-3.5" /> Watch out for
                                        </p>
                                        <p style={{ fontSize: 14, color: "var(--body)", lineHeight: 1.55, margin: "8px 0 0" }}>{pp.watch_text}</p>
                                      </div>
                                    )}
                                    {pp.solved_text && (
                                      <div style={{ borderLeft: "2px solid var(--plum)", paddingLeft: 15 }}>
                                        <p style={{ display: "flex", alignItems: "center", gap: 6, fontFamily: "var(--mono)", fontSize: 10.5, letterSpacing: "0.06em", textTransform: "uppercase", color: "var(--muted-text)", margin: 0 }}>
                                          <Check className="w-3.5 h-3.5" style={{ color: "var(--plum)" }} /> How they solved it
                                        </p>
                                        <p style={{ fontSize: 14, color: "var(--body)", lineHeight: 1.55, margin: "8px 0 0" }}>{pp.solved_text}</p>
                                      </div>
                                    )}
                                  </div>
                                )}

                                {/* Footer */}
                                <p style={{ marginTop: 16, fontSize: 12.5, color: "var(--muted-text)" }}>
                                  <span style={{ color: "var(--body)", fontWeight: 500 }}>{pp.created_by_name ?? "Someone"}</span>
                                  {" · "}{new Date(pp.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                                </p>
                              </CentralCard>
                            ))}
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              </section>
            )}

            {/* ── Log a pain point modal (§4.17 creation modal) ── */}
            {ppModalOpen && canEdit && (
              <CentralModal
                onClose={() => setPpModalOpen(false)}
                eyebrow="Log a pain point"
                title="Add to the record"
                maxWidth={560}
                footer={
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 14, flexWrap: "wrap", width: "100%" }}>
                    <span style={{ fontSize: 12, color: "var(--muted-text)" }}>
                      Adding to {CURRENT_CLASS_YEAR.replace("-", "–")} · signed as {members.find(m => m.id === userId)?.name ?? "you"}
                    </span>
                    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                      <CentralButton variant="secondary" size="sm" onClick={() => setPpModalOpen(false)}>Cancel</CentralButton>
                      <CentralButton
                        variant="primary" size="sm"
                        onClick={handleAddPainPoint}
                        disabled={addingPp || !ppTitle.trim()}
                      >
                        {addingPp ? "Adding…" : "Add to record"}
                      </CentralButton>
                    </div>
                  </div>
                }
              >
                  <p style={{ fontSize: 13.5, color: "var(--body)", lineHeight: 1.5, margin: "0 0 20px", maxWidth: 420 }}>
                    Capture what tripped this class up so the next one doesn&apos;t hit the same wall.
                  </p>

                  <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                    {/* Pain point (title) */}
                    <FormField label="Pain point">
                      <Input
                        value={ppTitle}
                        onChange={e => setPpTitle(e.target.value)}
                        placeholder="What went wrong?"
                      />
                    </FormField>

                    {/* Category + Class */}
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }} className="max-md:!grid-cols-1">
                      <FormField label="Category">
                        <Select
                          value={ppCategory}
                          onChange={e => setPpCategory(e.target.value)}
                          style={{ appearance: "none" }}
                        >
                          {PP_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                        </Select>
                      </FormField>
                      <FormField label="Class">
                        <Select
                          value={CURRENT_CLASS_YEAR}
                          disabled
                          style={{ appearance: "none", background: "var(--ivory)", color: "var(--muted-text)", cursor: "not-allowed" }}
                        >
                          <option value={CURRENT_CLASS_YEAR}>{CURRENT_CLASS_YEAR.replace("-", "–")}</option>
                        </Select>
                      </FormField>
                    </div>

                    {/* Watch */}
                    <FormField label="What to look out for">
                      <Textarea
                        value={ppWatch}
                        onChange={e => setPpWatch(e.target.value)}
                        rows={3}
                        placeholder="The trap the next class should see coming…"
                        style={{ minHeight: 76 }}
                      />
                    </FormField>

                    {/* Solved */}
                    <FormField label="How you solved it">
                      <Textarea
                        value={ppSolved}
                        onChange={e => setPpSolved(e.target.value)}
                        rows={3}
                        placeholder="What actually worked…"
                        style={{ minHeight: 76 }}
                      />
                    </FormField>
                  </div>
              </CentralModal>
            )}

            {/* ── Sub-events (Welcome Week) ── */}
            {activeSection === 'sub_events' && plan && (
              <SubEventsTab
                parentEvent={calendarEvent}
                ministryId={ministryId}
                userId={userId}
                canEdit={canEdit}
                onOpenChild={onOpenChild}
              />
            )}

            {/* ── Acts Lineup (Coffeehouse) ── */}
            {activeSection === 'acts' && plan && (
              <ActsTab
                plan={plan}
                canEdit={canEdit}
                onPlanChange={setPlan}
              />
            )}

            {/* ── Teams (Turkey Bowl) ── */}
            {activeSection === 'teams' && plan && (
              <TeamsTab
                plan={plan}
                ministryId={ministryId}
                members={members}
                canEdit={canEdit}
                onPlanChange={setPlan}
              />
            )}

            {/* ── Transport (Retreat) ── */}
            {activeSection === 'transport' && plan && (
              <TransportTab
                plan={plan}
                ministryId={ministryId}
                canEdit={canEdit}
                onPlanChange={setPlan}
              />
            )}

            {/* ── Program (Retreat) ── */}
            {activeSection === 'program' && plan && (
              <ProgramTab
                plan={plan}
                event={calendarEvent}
                members={members}
                canEdit={canEdit}
                onPlanChange={setPlan}
              />
            )}
          </>
        )}
      </div>

    </div>
  )
}

// ── SubEventsTab ──────────────────────────────────────────────────────────────

// Readiness status → dot color. Kept as a small LOCAL map so it's swappable when
// the amber ramp decision lands. Deliberately compliant/neutral for now: only
// "Ready" earns --success; everything in-flight stays neutral --muted-text
// (no --gold / --warm-tan, which are documented off-label here).
function subEventStatus(done: number, total: number): { label: string; color: string; empty?: boolean } {
  if (total === 0) return { label: "No checklist", color: "var(--muted-text)", empty: true }
  const pct = Math.round((done / total) * 100)
  if (done === total) return { label: "Ready", color: "var(--success)" }
  if (pct >= 50) return { label: "In progress", color: "var(--muted-text)" }
  return { label: "Needs attention", color: "var(--muted-text)" }
}

function SubEventsTab({
  parentEvent,
  ministryId,
  userId,
  canEdit,
  onOpenChild,
}: {
  parentEvent: CalendarEvent
  ministryId: string
  userId: string
  canEdit: boolean
  // Opening a sub-event lifts it to StudentOrgTeamHome for a single-shell
  // body-swap. Omitted when already viewing a child (nesting capped at one
  // level) — rows then render without a drill affordance.
  onOpenChild?: (ev: CalendarEvent) => void
}) {
  const supabase = createClient()
  const [subEvents, setSubEvents] = useState<CalendarEvent[]>([])
  // childId → checklist progress, batched (never N+1).
  const [readiness, setReadiness] = useState<Record<string, { done: number; total: number }>>({})
  const [loading, setLoading] = useState(true)
  const [showAdd, setShowAdd] = useState(false)
  const [hoveredId, setHoveredId] = useState<string | null>(null)

  useEffect(() => {
    async function load() {
      const { data } = await supabase
        .from("calendar_events")
        .select("id, title, description, location, start_date, end_date, all_day, category, event_type, parent_event_id, linked_announcement_id, status, created_by")
        .eq("parent_event_id", parentEvent.id)
        .order("start_date", { ascending: true })
      const rows = (data ?? []) as CalendarEvent[]
      setSubEvents(rows)

      // Batch readiness: child events → their event_plans → event_tasks
      // done/total, aggregated client-side. Two queries total (no per-row).
      // Scope the plan lookup by ministry_id (event_tasks has no ministry_id
      // column, so it's scoped transitively through these plan ids).
      const childIds = rows.map((e) => e.id)
      if (childIds.length) {
        const { data: plans } = await supabase
          .from("event_plans")
          .select("id, calendar_event_id")
          .in("calendar_event_id", childIds)
          .eq("ministry_id", ministryId)
        const planRows = (plans ?? []) as { id: string; calendar_event_id: string }[]
        const planToChild = new Map(planRows.map((p) => [p.id, p.calendar_event_id]))
        const map: Record<string, { done: number; total: number }> = {}
        childIds.forEach((id) => { map[id] = { done: 0, total: 0 } })
        if (planRows.length) {
          const { data: taskRows } = await supabase
            .from("event_tasks")
            .select("event_plan_id, completed")
            .in("event_plan_id", planRows.map((p) => p.id))
          ;((taskRows ?? []) as { event_plan_id: string; completed: boolean }[]).forEach((t) => {
            const childId = planToChild.get(t.event_plan_id)
            if (!childId) return
            map[childId].total++
            if (t.completed) map[childId].done++
          })
        }
        setReadiness(map)
      }
      setLoading(false)
    }
    load()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [parentEvent.id])

  // Day-grouped, sorted-ascending rows (query already orders by start_date).
  let lastDayKey: string | null = null
  let firstHeaderRendered = false

  return (
    <div>
      <EventSectionHeader
        title="Sub-events"
        action={canEdit ? (
          <ContentActionButton variant="primary" label="Add sub-event" onClick={() => setShowAdd(true)} />
        ) : undefined}
      />

      {loading && <p style={{ color: "var(--muted-text)", fontSize: 13 }}>Loading…</p>}
      {!loading && subEvents.length === 0 && (
        <p style={{ fontFamily: "var(--font-instrument-serif)", fontStyle: "italic", fontSize: 15, color: "var(--faint)" }}>No sub-events yet. Add the individual events that make up {parentEvent.title}.</p>
      )}

      <div>
        {subEvents.map((ev) => {
          const evCfg = getEventConfig(ev)
          const dt = new Date(ev.start_date)
          const dayKey = dt.toDateString()
          const showHeader = dayKey !== lastDayKey
          const isFirstHeader = showHeader && !firstHeaderRendered
          if (showHeader) { lastDayKey = dayKey; firstHeaderRendered = true }
          const dayLabel = `${dt.toLocaleDateString("en-US", { weekday: "short" })} · ${dt.toLocaleDateString("en-US", { month: "short" })} ${dt.getDate()}`.toUpperCase()

          const r = readiness[ev.id] ?? { done: 0, total: 0 }
          const st = subEventStatus(r.done, r.total)
          const filled = r.total > 0 ? Math.round((r.done / r.total) * 6) : 0
          const drillable = !!onOpenChild

          return (
            <Fragment key={ev.id}>
              {showHeader && (
                <div style={{ display: "flex", alignItems: "center", gap: 12, margin: isFirstHeader ? "0 0 12px" : "26px 0 12px" }}>
                  <span style={{ fontFamily: "var(--mono)", fontSize: 11, letterSpacing: "1.2px", textTransform: "uppercase", color: "var(--muted-text)", flexShrink: 0 }}>{dayLabel}</span>
                  <span style={{ flex: 1, height: 1, background: "var(--line)" }} />
                </div>
              )}

              <div
                onMouseEnter={() => setHoveredId(ev.id)}
                onMouseLeave={() => setHoveredId(null)}
                onClick={drillable ? () => onOpenChild!(ev) : undefined}
                role={drillable ? "button" : undefined}
                tabIndex={drillable ? 0 : undefined}
                onKeyDown={drillable ? (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onOpenChild!(ev) } } : undefined}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 16,
                  padding: "15px 16px",
                  border: `1px solid ${hoveredId === ev.id ? "var(--dashed)" : "var(--line)"}`,
                  borderRadius: "var(--r-card)",
                  background: "var(--cream)",
                  marginBottom: 10,
                  transition: "border-color .15s",
                  cursor: drillable ? "pointer" : "default",
                }}
              >
                {/* emoji badge — derived from event_type via getEventConfig */}
                <span style={{ width: 36, height: 36, display: "grid", placeItems: "center", background: "var(--ivory)", borderRadius: "var(--r-input)", fontSize: 20, lineHeight: 1, flexShrink: 0 }}>{evCfg.icon ?? "📅"}</span>

                {/* info */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ fontSize: 16, fontWeight: 500, color: "var(--ink)", margin: 0, letterSpacing: "-0.01em" }}>{ev.title}</p>
                  <p style={{ fontSize: 13, margin: "3px 0 0" }}>
                    {ev.location
                      ? <span style={{ color: "var(--body)" }}>{ev.location}</span>
                      : <span style={{ color: "var(--faint)", fontStyle: "italic" }}>Location TBD</span>}
                  </p>
                  {/* mobile-only compact readiness (segmented bar hidden < sm) */}
                  <div className="sm:hidden" style={{ display: "flex", alignItems: "center", gap: 7, marginTop: 8 }}>
                    <span style={{ width: 8, height: 8, borderRadius: "50%", background: st.color, flexShrink: 0 }} />
                    <span style={{ fontSize: 12, color: "var(--body)" }}>{st.label}</span>
                    {!st.empty && <span style={{ fontFamily: "var(--mono)", fontSize: 10.5, color: "var(--muted-text)", marginLeft: "auto" }}>{r.done}/{r.total}</span>}
                  </div>
                </div>

                {/* desktop readiness widget */}
                <div className="hidden sm:block" style={{ width: 190, flexShrink: 0 }}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 7 }}>
                    <span style={{ display: "flex", alignItems: "center", gap: 7, fontSize: 12, color: "var(--body)" }}>
                      <span style={{ width: 8, height: 8, borderRadius: "50%", background: st.color, flexShrink: 0 }} />
                      {st.label}
                    </span>
                    {!st.empty && <span style={{ fontFamily: "var(--mono)", fontSize: 10.5, letterSpacing: "0.4px", color: "var(--muted-text)" }}>{r.done}/{r.total}</span>}
                  </div>
                  {st.empty ? (
                    <div style={{ height: 6, borderRadius: 999, background: "var(--line-2)" }} />
                  ) : (
                    <div style={{ display: "flex", gap: 4 }}>
                      {Array.from({ length: 6 }).map((_, i) => (
                        <span key={i} style={{ flex: 1, height: 6, borderRadius: 999, background: i < filled ? "var(--plum)" : "var(--line-2)" }} />
                      ))}
                    </div>
                  )}
                </div>

                {/* drill affordance — decorative; the whole row is the click target. Omitted when nesting-capped. */}
                {drillable && (
                  <span aria-hidden style={{ width: 34, height: 34, display: "grid", placeItems: "center", borderRadius: "var(--r-input)", border: "1px solid var(--line)", color: "var(--body)", flexShrink: 0 }}>
                    <ArrowRight style={{ width: 16, height: 16 }} />
                  </span>
                )}
              </div>
            </Fragment>
          )
        })}
      </div>

      {showAdd && (
        <AddEventModal
          ministryId={ministryId}
          teamId={null}
          userId={userId}
          parentEventId={parentEvent.id}
          excludeTypes={["welcome_week"]}
          onClose={() => setShowAdd(false)}
          onSaved={(ev) => {
            setSubEvents(prev => [...prev, ev].sort((a, b) => a.start_date.localeCompare(b.start_date)))
            setShowAdd(false)
          }}
        />
      )}
    </div>
  )
}


// ── ActsTab ───────────────────────────────────────────────────────────────────

type CoffeeAct = { id: string; performer: string; type: string; duration: string; sound_check: string }

function ActsTab({
  plan,
  canEdit,
  onPlanChange,
}: {
  plan: EventPlan
  canEdit: boolean
  onPlanChange: (p: EventPlan) => void
}) {
  const supabase = createClient()
  const acts: CoffeeAct[] = (plan.type_data?.acts as CoffeeAct[] | undefined) ?? []

  async function save(newActs: CoffeeAct[]) {
    const { data } = await supabase.from("event_plans").update({ type_data: { ...plan.type_data, acts: newActs } }).eq("id", plan.id).select("*").single()
    if (data) onPlanChange(data as EventPlan)
  }

  function addAct() {
    const newActs: CoffeeAct[] = [...acts, { id: crypto.randomUUID(), performer: "", type: "Music", duration: "", sound_check: "" }]
    save(newActs)
  }

  function updateAct(id: string, field: keyof CoffeeAct, value: string) {
    const newActs = acts.map(a => a.id === id ? { ...a, [field]: value } : a)
    save(newActs)
  }

  function deleteAct(id: string) {
    save(acts.filter(a => a.id !== id))
  }

  return (
    <div>
      <EventSectionHeader
        title="Acts Lineup"
        action={canEdit ? (
          <ContentActionButton variant="primary" icon={<Plus style={{ width: 14, height: 14 }} />} label="Add act" onClick={addAct} />
        ) : undefined}
      />

      {acts.length === 0 && (
        <p style={{ fontFamily: "var(--font-instrument-serif)", fontStyle: "italic", fontSize: 15, color: "var(--faint)" }}>No acts yet. Add performers to build your lineup.</p>
      )}

      {acts.length > 0 && (
        <div style={{ display: "grid", gridTemplateColumns: "24px 1fr 110px 80px 110px 28px", gap: 10, padding: "0 4px 8px", borderBottom: "1px solid var(--line)" }}>
          {["#", "Performer", "Type", "Duration", "Sound Check", ""].map((h, i) => (
            <span key={i} style={{ fontFamily: "var(--mono)", fontSize: "10px", letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--faint)" }}>{h}</span>
          ))}
        </div>
      )}

      <div style={{ display: "flex", flexDirection: "column" }}>
        {acts.map((act, idx) => (
          <ListRow key={act.id} last={idx === acts.length - 1} style={{ display: "grid", gridTemplateColumns: "24px 1fr 110px 80px 110px 28px", gap: 10, padding: "12px 4px", alignItems: "center" }}>
            <span style={{ fontSize: 13, color: "var(--faint)", textAlign: "center" }}>{idx + 1}</span>
            {canEdit ? (
              <input value={act.performer} onChange={e => updateAct(act.id, "performer", e.target.value)} placeholder="Performer name…" style={{ background: "none", border: "none", outline: "none", fontSize: 14, fontFamily: "var(--font-inter)", color: "var(--ink)", width: "100%" }} />
            ) : (
              <span style={{ fontSize: 14, color: "var(--ink)" }}>{act.performer || <span style={{ color: "var(--faint)", fontStyle: "italic" }}>—</span>}</span>
            )}
            {canEdit ? (
              <select value={act.type} onChange={e => updateAct(act.id, "type", e.target.value)} style={{ padding: "4px 8px", borderRadius: 8, border: "1px solid var(--line-2)", background: "var(--cream-panel)", color: "var(--body)", fontSize: 12, cursor: "pointer" }}>
                {["Music", "Spoken Word", "Comedy", "Dance", "Other"].map(t => <option key={t}>{t}</option>)}
              </select>
            ) : <span style={{ fontSize: 12, color: "var(--body)" }}>{act.type}</span>}
            {canEdit ? (
              <input value={act.duration} onChange={e => updateAct(act.id, "duration", e.target.value)} placeholder="8 min" style={{ background: "none", border: "1px solid var(--line-2)", borderRadius: 8, outline: "none", fontSize: 13, fontFamily: "var(--font-inter)", color: "var(--body)", padding: "4px 8px", width: "100%", boxSizing: "border-box" }} />
            ) : <span style={{ fontSize: 12, color: "var(--body)" }}>{act.duration || "—"}</span>}
            {canEdit ? (
              <input value={act.sound_check} onChange={e => updateAct(act.id, "sound_check", e.target.value)} placeholder="5:30 PM" style={{ background: "none", border: "1px solid var(--line-2)", borderRadius: 8, outline: "none", fontSize: 13, fontFamily: "var(--font-inter)", color: "var(--body)", padding: "4px 8px", width: "100%", boxSizing: "border-box" }} />
            ) : <span style={{ fontSize: 12, color: "var(--body)" }}>{act.sound_check || "—"}</span>}
            {canEdit ? (
              <IconButton dim={24} onClick={() => deleteAct(act.id)} title="Remove act"><X className="w-3.5 h-3.5" /></IconButton>
            ) : <span />}
          </ListRow>
        ))}
      </div>
    </div>
  )
}

// ── TeamsTab ──────────────────────────────────────────────────────────────────

type TurkeyTeam = { name: string; members: string[] }
type TurkeyData = { teamA: TurkeyTeam; teamB: TurkeyTeam; commissioner: string }

function TeamsTab({
  plan,
  ministryId,
  members,
  canEdit,
  onPlanChange,
}: {
  plan: EventPlan
  ministryId: string
  members: { id: string; name: string }[]
  canEdit: boolean
  onPlanChange: (p: EventPlan) => void
}) {
  const supabase = createClient()
  const defaultTeams: TurkeyData = { teamA: { name: "Team A", members: [] }, teamB: { name: "Team B", members: [] }, commissioner: "" }
  const teamsData: TurkeyData = (plan.type_data?.turkey as TurkeyData | undefined) ?? defaultTeams

  async function save(data: TurkeyData) {
    const { data: updated } = await supabase.from("event_plans").update({ type_data: { ...plan.type_data, turkey: data } }).eq("id", plan.id).select("*").single()
    if (updated) onPlanChange(updated as EventPlan)
  }

  function updateTeamName(team: "teamA" | "teamB", name: string) {
    save({ ...teamsData, [team]: { ...teamsData[team], name } })
  }

  function addMember(team: "teamA" | "teamB", memberId: string) {
    if (!memberId || teamsData[team].members.includes(memberId)) return
    save({ ...teamsData, [team]: { ...teamsData[team], members: [...teamsData[team].members, memberId] } })
  }

  function removeMember(team: "teamA" | "teamB", memberId: string) {
    save({ ...teamsData, [team]: { ...teamsData[team], members: teamsData[team].members.filter(m => m !== memberId) } })
  }

  const renderTeam = (teamKey: "teamA" | "teamB", team: TurkeyTeam) => (
    <CentralCard variant="standard" radius="var(--r-callout)" padding={22} style={{ flex: 1 }}>
      {canEdit ? (
        <input value={team.name} onChange={e => updateTeamName(teamKey, e.target.value)} style={{ fontFamily: "var(--font-instrument-serif)", fontSize: 22, color: "var(--ink)", letterSpacing: -0.3, background: "transparent", border: "none", outline: "none", width: "100%", padding: 0, marginBottom: 14 }} />
      ) : (
        <p style={{ fontFamily: "var(--font-instrument-serif)", fontSize: 22, color: "var(--ink)", letterSpacing: -0.3, marginBottom: 14 }}>{team.name}</p>
      )}
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {team.members.map(uid => {
          const m = members.find(m => m.id === uid)
          return (
            <div key={uid} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "6px 10px", background: "var(--ivory)", borderRadius: 8 }}>
              <span style={{ fontSize: 13, color: "var(--plum-2)" }}>{m?.name ?? uid}</span>
              {canEdit && <IconButton dim={22} onClick={() => removeMember(teamKey, uid)} title="Remove"><X className="w-3 h-3" /></IconButton>}
            </div>
          )
        })}
        {canEdit && (
          <AddInlineSelect onChange={e => { addMember(teamKey, e.target.value); e.target.value = "" }} style={{ width: "auto", padding: "6px 10px", borderRadius: 8, color: "var(--muted-text)", fontSize: 12, marginTop: 4 }}>
            <option value="">+ Add member…</option>
            {members.filter(m => !teamsData.teamA.members.includes(m.id) && !teamsData.teamB.members.includes(m.id)).map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
          </AddInlineSelect>
        )}
      </div>
    </CentralCard>
  )

  return (
    <div>
      <EventSectionHeader title="Teams" />

      <div style={{ display: "flex", gap: 20, marginBottom: 24 }} className="max-md:!flex-col">
        {renderTeam("teamA", teamsData.teamA)}
        {renderTeam("teamB", teamsData.teamB)}
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <span style={{ fontSize: 14, color: "var(--body)", whiteSpace: "nowrap" }}>Commissioner:</span>
        {canEdit ? (
          <select value={teamsData.commissioner} onChange={e => save({ ...teamsData, commissioner: e.target.value })} style={{ padding: "6px 12px", borderRadius: 8, border: "1px solid var(--line-2)", background: "var(--cream-panel)", color: "var(--plum-2)", fontSize: 13, cursor: "pointer" }}>
            <option value="">Unassigned</option>
            {members.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
          </select>
        ) : (
          <span style={{ fontSize: 14, color: "var(--plum-2)" }}>{members.find(m => m.id === teamsData.commissioner)?.name ?? "—"}</span>
        )}
      </div>
    </div>
  )
}

// ── TransportTab ──────────────────────────────────────────────────────────────

type CarEntry = { id: string; driver_id: string; vehicle: string; seats: number; rider_ids: string[] }

function TransportTab({
  plan,
  ministryId,
  canEdit,
  onPlanChange,
}: {
  plan: EventPlan
  ministryId: string
  canEdit: boolean
  onPlanChange: (p: EventPlan) => void
}) {
  const supabase = createClient()
  const [members, setMembers] = useState<{ id: string; name: string }[]>([])
  const cars: CarEntry[] = (plan.type_data?.transport as CarEntry[] | undefined) ?? []

  useEffect(() => {
    supabase.from("profiles").select("id, name").eq("ministry_id", ministryId).order("name").then(({ data }) => setMembers(data ?? []))
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ministryId])

  async function save(newCars: CarEntry[]) {
    const { data } = await supabase.from("event_plans").update({ type_data: { ...plan.type_data, transport: newCars } }).eq("id", plan.id).select("*").single()
    if (data) onPlanChange(data as EventPlan)
  }

  function addCar() {
    save([...cars, { id: crypto.randomUUID(), driver_id: "", vehicle: "", seats: 4, rider_ids: [] }])
  }

  function updateCar(id: string, updates: Partial<CarEntry>) {
    save(cars.map(c => c.id === id ? { ...c, ...updates } : c))
  }

  function addRider(carId: string, riderId: string) {
    if (!riderId) return
    const car = cars.find(c => c.id === carId)
    if (!car || car.rider_ids.includes(riderId)) return
    updateCar(carId, { rider_ids: [...car.rider_ids, riderId] })
  }

  function removeRider(carId: string, riderId: string) {
    const car = cars.find(c => c.id === carId)
    if (!car) return
    updateCar(carId, { rider_ids: car.rider_ids.filter(r => r !== riderId) })
  }

  const totalSeats = cars.reduce((s, c) => s + c.seats, 0)
  const totalRiders = cars.reduce((s, c) => s + c.rider_ids.length, 0)
  const allRiderIds = cars.flatMap(c => c.rider_ids)

  return (
    <div>
      <EventSectionHeader
        title="Transport"
        action={canEdit ? (
          <ContentActionButton variant="primary" icon={<Plus style={{ width: 14, height: 14 }} />} label="Add car" onClick={addCar} />
        ) : undefined}
      />

      <div style={{ display: "flex", gap: 20, marginBottom: 24 }}>
        <div style={{ padding: "10px 18px", background: "var(--ivory)", borderRadius: 10 }}>
          <span style={{ fontSize: 22, fontWeight: 600, color: "var(--ink)", fontFamily: "var(--font-instrument-serif)" }}>{totalRiders}</span>
          <span style={{ fontSize: 13, color: "var(--muted-text)", marginLeft: 6 }}>confirmed / {totalSeats} seats</span>
        </div>
      </div>

      {cars.length === 0 && (
        <p style={{ fontFamily: "var(--font-instrument-serif)", fontStyle: "italic", fontSize: 15, color: "var(--faint)" }}>No cars added yet. Add drivers to organize carpooling.</p>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        {cars.map(car => {
          const driver = members.find(m => m.id === car.driver_id)
          const availableRiders = members.filter(m => !allRiderIds.includes(m.id) && m.id !== car.driver_id)
          return (
            <CentralCard key={car.id} variant="standard" radius="var(--r-callout)" padding="18px 22px">
              <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 14 }}>
                {canEdit ? (
                  <select value={car.driver_id} onChange={e => updateCar(car.id, { driver_id: e.target.value })} style={{ padding: "6px 10px", borderRadius: 8, border: "1px solid var(--line-2)", background: "var(--cream-panel)", color: "var(--plum-2)", fontSize: 13, cursor: "pointer", fontWeight: 500 }}>
                    <option value="">Driver…</option>
                    {members.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
                  </select>
                ) : (
                  <span style={{ fontSize: 14, fontWeight: 600, color: "var(--plum-2)" }}>{driver?.name ?? "No driver"}</span>
                )}
                {canEdit ? (
                  <input value={car.vehicle} onChange={e => updateCar(car.id, { vehicle: e.target.value })} placeholder="Vehicle (e.g. Honda CR-V)" style={{ flex: 1, background: "none", border: "1px solid var(--line-2)", borderRadius: 8, outline: "none", fontSize: 13, fontFamily: "var(--font-inter)", color: "var(--body)", padding: "6px 10px" }} />
                ) : (
                  <span style={{ fontSize: 13, color: "var(--body)" }}>{car.vehicle || "—"}</span>
                )}
                {canEdit && (
                  <input type="number" value={car.seats} onChange={e => updateCar(car.id, { seats: parseInt(e.target.value) || 4 })} min={1} max={15} style={{ width: 60, background: "none", border: "1px solid var(--line-2)", borderRadius: 8, outline: "none", fontSize: 13, padding: "6px 8px", textAlign: "center" }} />
                )}
                <span style={{ fontSize: 12, color: "var(--muted-text)" }}>{car.rider_ids.length}/{car.seats} seats</span>
                {canEdit && <IconButton dim={24} onClick={() => save(cars.filter(c => c.id !== car.id))} title="Remove car" style={{ marginLeft: "auto" }}><X className="w-3.5 h-3.5" /></IconButton>}
              </div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                {car.rider_ids.map(rid => {
                  const m = members.find(m => m.id === rid)
                  return (
                    <span key={rid} style={{ display: "flex", alignItems: "center", gap: 6, padding: "4px 10px", background: "var(--ivory)", borderRadius: 999, fontSize: 12, color: "var(--plum-2)" }}>
                      {m?.name ?? rid}
                      {canEdit && <IconButton dim={20} onClick={() => removeRider(car.id, rid)} title="Remove rider"><X style={{ width: 12, height: 12 }} /></IconButton>}
                    </span>
                  )
                })}
                {canEdit && car.rider_ids.length < car.seats && (
                  <AddInlineSelect onChange={e => { addRider(car.id, e.target.value); e.target.value = "" }} style={{ width: "auto", padding: "4px 10px", borderRadius: 999, color: "var(--muted-text)", fontSize: 12 }}>
                    <option value="">+ Add rider…</option>
                    {availableRiders.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
                  </AddInlineSelect>
                )}
              </div>
            </CentralCard>
          )
        })}
      </div>
    </div>
  )
}

// ── ProgramTab ────────────────────────────────────────────────────────────────

type ProgramSession = { id: string; time: string; title: string; leader_id: string; day_index: number }

function ProgramTab({
  plan,
  event,
  members,
  canEdit,
  onPlanChange,
}: {
  plan: EventPlan
  event: CalendarEvent
  members: { id: string; name: string }[]
  canEdit: boolean
  onPlanChange: (p: EventPlan) => void
}) {
  const supabase = createClient()
  const sessions: ProgramSession[] = (plan.type_data?.program as ProgramSession[] | undefined) ?? []

  // Generate day list from event start → end
  const days: Date[] = []
  const start = new Date(event.start_date)
  const end = new Date(event.end_date)
  for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
    days.push(new Date(d))
  }
  if (days.length === 0) days.push(start)

  async function save(newSessions: ProgramSession[]) {
    const { data } = await supabase.from("event_plans").update({ type_data: { ...plan.type_data, program: newSessions } }).eq("id", plan.id).select("*").single()
    if (data) onPlanChange(data as EventPlan)
  }

  function addSession(dayIndex: number) {
    save([...sessions, { id: crypto.randomUUID(), time: "", title: "", leader_id: "", day_index: dayIndex }])
  }

  function updateSession(id: string, updates: Partial<ProgramSession>) {
    save(sessions.map(s => s.id === id ? { ...s, ...updates } : s))
  }

  function deleteSession(id: string) {
    save(sessions.filter(s => s.id !== id))
  }

  return (
    <div>
      <EventSectionHeader title="Program" />

      {days.map((day, dayIdx) => {
        const daySessions = sessions.filter(s => s.day_index === dayIdx).sort((a, b) => a.time.localeCompare(b.time))
        const dayLabel = day.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })
        return (
          <div key={dayIdx} style={{ marginBottom: 36 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
              <p style={{ fontFamily: "var(--mono)", fontSize: "11px", letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--body)", fontWeight: 600 }}>
                Day {dayIdx + 1} — {dayLabel}
              </p>
              {canEdit && (
                <CentralButton variant="secondary" size="sm" onClick={() => addSession(dayIdx)}><Plus style={{ width: 14, height: 14 }} /> Add session</CentralButton>
              )}
            </div>
            <div style={{ borderTop: "1px solid var(--line)" }} />

            {daySessions.length === 0 && (
              <p style={{ fontFamily: "var(--font-instrument-serif)", fontStyle: "italic", fontSize: 14, color: "var(--faint)", padding: "12px 4px" }}>No sessions yet.</p>
            )}

            {daySessions.map((session, sIdx) => (
              <ListRow key={session.id} last={sIdx === daySessions.length - 1} style={{ display: "grid", gridTemplateColumns: "80px 1fr 140px 28px", gap: 12, padding: "12px 4px", alignItems: "center" }}>
                {canEdit ? (
                  <input value={session.time} onChange={e => updateSession(session.id, { time: e.target.value })} placeholder="7:00 PM" style={{ background: "none", border: "1px solid var(--line-2)", borderRadius: 8, outline: "none", fontSize: 13, fontFamily: "var(--font-inter)", color: "var(--body)", padding: "4px 8px", width: "100%", boxSizing: "border-box" }} />
                ) : (
                  <span style={{ fontSize: 13, color: "var(--muted-text)", fontWeight: 500 }}>{session.time || "—"}</span>
                )}
                {canEdit ? (
                  <input value={session.title} onChange={e => updateSession(session.id, { title: e.target.value })} placeholder="Session title…" style={{ background: "none", border: "none", outline: "none", fontSize: 14, fontFamily: "var(--font-inter)", color: "var(--ink)", width: "100%" }} />
                ) : (
                  <span style={{ fontSize: 14, color: "var(--ink)" }}>{session.title || <span style={{ color: "var(--faint)", fontStyle: "italic" }}>—</span>}</span>
                )}
                {canEdit ? (
                  <select value={session.leader_id} onChange={e => updateSession(session.id, { leader_id: e.target.value })} style={{ padding: "4px 8px", borderRadius: 8, border: "1px solid var(--line-2)", background: "var(--cream-panel)", color: "var(--body)", fontSize: 12, cursor: "pointer" }}>
                    <option value="">No leader</option>
                    {members.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
                  </select>
                ) : (
                  <span style={{ fontSize: 12, color: "var(--body)" }}>{members.find(m => m.id === session.leader_id)?.name ?? "—"}</span>
                )}
                {canEdit ? (
                  <IconButton dim={24} onClick={() => deleteSession(session.id)} title="Remove session"><X className="w-3.5 h-3.5" /></IconButton>
                ) : <span />}
              </ListRow>
            ))}
          </div>
        )
      })}
    </div>
  )
}

// ── GroupsTab ─────────────────────────────────────────────────────────────────

type GroupSessionRecord = {
  id: string
  name: string
  source_type: string
  config: Record<string, unknown>
  created_at: string
  num_groups: number
  num_people: number
}

function GroupsTab({
  teamId, ministryId, userId, canEdit, generateTrigger,
}: {
  teamId: string | null
  ministryId: string
  userId: string
  canEdit: boolean
  generateTrigger?: number
}) {
  const supabase = createClient()
  const [sessions, setSessions] = useState<GroupSessionRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [showWizard, setShowWizard] = useState(false)
  const [viewSession, setViewSession] = useState<GroupSessionRecord | null>(null)
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)

  useEffect(() => { if (generateTrigger) setShowWizard(true) }, [generateTrigger])

  const mono: React.CSSProperties = EYEBROW_STYLE

  async function loadSessions() {
    if (!teamId) { setLoading(false); return }
    setLoading(true)
    const { data: rawSessions } = await supabase
      .from("group_sessions")
      .select("id, name, source_type, config, created_at")
      .eq("team_id", teamId)
      .order("created_at", { ascending: false })

    const ids = (rawSessions ?? []).map((s: Record<string, unknown>) => s.id as string)
    let statsMap: Record<string, { num_groups: number; num_people: number }> = {}

    if (ids.length > 0) {
      const { data: gData } = await supabase
        .from("generated_groups")
        .select("id, session_id")
        .in("session_id", ids)
      const gIds = (gData ?? []).map((g: Record<string, unknown>) => g.id as string)
      const { data: mData } = gIds.length > 0
        ? await supabase.from("generated_group_members").select("group_id").in("group_id", gIds)
        : { data: [] }
      const memberCount: Record<string, number> = {}
      ;(mData ?? []).forEach((m: Record<string, unknown>) => {
        const gid = m.group_id as string
        memberCount[gid] = (memberCount[gid] ?? 0) + 1
      })
      ;(gData ?? []).forEach((g: Record<string, unknown>) => {
        const sid = g.session_id as string
        if (!statsMap[sid]) statsMap[sid] = { num_groups: 0, num_people: 0 }
        statsMap[sid].num_groups++
        statsMap[sid].num_people += memberCount[g.id as string] ?? 0
      })
    }

    setSessions((rawSessions ?? []).map((s: Record<string, unknown>) => ({
      id: s.id as string,
      name: s.name as string,
      source_type: s.source_type as string,
      config: (s.config ?? {}) as Record<string, unknown>,
      created_at: s.created_at as string,
      num_groups: statsMap[s.id as string]?.num_groups ?? 0,
      num_people: statsMap[s.id as string]?.num_people ?? 0,
    })))
    setLoading(false)
  }

  useEffect(() => { loadSessions() }, [teamId]) // eslint-disable-line react-hooks/exhaustive-deps

  async function handleDelete(session: GroupSessionRecord) {
    setConfirmDeleteId(null)
    setDeletingId(session.id)
    // If this was a confirmed SG-mode session, wipe the small group assignments too
    if (session.config.smallGroupMode === true && teamId) {
      await deleteSmallGroupAssignmentsAction(teamId)
    }
    await supabase.from("group_sessions").delete().eq("id", session.id)
    setSessions(prev => prev.filter(s => s.id !== session.id))
    setDeletingId(null)
  }

  if (viewSession) {
    return (
      <GroupSessionView
        session={viewSession}
        onBack={() => setViewSession(null)}
      />
    )
  }

  return (
    <div>
      {loading ? (
        <div style={{ padding: "48px 0", display: "flex", justifyContent: "center" }}>
          <Loader2 style={{ width: 24, height: 24, color: "var(--muted-text)" }} className="animate-spin" />
        </div>
      ) : sessions.length === 0 ? (
        <button
          onClick={canEdit ? () => setShowWizard(true) : undefined}
          disabled={!canEdit}
          style={{
            width: "100%", padding: "48px 24px", border: "1px dashed var(--dashed)",
            borderRadius: 14, background: "transparent",
            cursor: canEdit ? "pointer" : "default",
            display: "flex", flexDirection: "column", alignItems: "center", gap: 12,
          }}
        >
          <div style={{ width: 44, height: 44, borderRadius: 12, border: "1px dashed var(--dashed)", display: "flex", alignItems: "center", justifyContent: "center", color: "var(--muted-text)" }}>
            <Plus style={{ width: 20, height: 20 }} />
          </div>
          <div style={{ textAlign: "center" }}>
            <p style={{ fontSize: 15, color: "var(--body)", fontWeight: 500, margin: 0 }}>Generate your first group set</p>
            <p style={{ fontSize: 13, color: "var(--muted-text)", margin: "4px 0 0" }}>Split your ministry into balanced small groups.</p>
          </div>
        </button>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {sessions.map(session => (
            <CentralCard
              key={session.id}
              variant="standard"
              radius="var(--r-callout)"
              padding="18px 22px"
              style={{ ...(confirmDeleteId === session.id ? { border: "1px solid var(--danger)" } : {}), transition: "border-color 0.15s" }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ fontSize: 15, fontWeight: 600, color: "var(--ink)", margin: 0 }}>{session.name}</p>
                  <p style={{ fontSize: 12, color: "var(--muted-text)", margin: "4px 0 0" }}>
                    {session.num_groups} groups · {session.num_people} people · {new Date(session.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                    {session.config.smallGroupMode === true && (
                      <span style={{ marginLeft: 6, padding: "1px 7px", borderRadius: 999, background: "var(--ivory)", fontSize: 10, fontWeight: 600, color: "var(--body)", letterSpacing: "0.04em", textTransform: "uppercase" }}>SG Mode</span>
                    )}
                  </p>
                </div>
                <div style={{ display: "flex", gap: 8, flexShrink: 0 }}>
                  <button
                    onClick={() => setViewSession(session)}
                    style={{ padding: "6px 14px", border: "1px solid var(--line-2)", borderRadius: 8, background: "transparent", color: "var(--body)", fontSize: 13, fontWeight: 500, cursor: "pointer", fontFamily: "inherit" }}
                  >
                    View
                  </button>
                  {canEdit && confirmDeleteId !== session.id && (
                    <button
                      onClick={() => setConfirmDeleteId(session.id)}
                      disabled={deletingId === session.id}
                      style={{ padding: "6px 14px", border: "1px solid var(--line-2)", borderRadius: 8, background: "transparent", color: "var(--danger)", fontSize: 13, fontWeight: 500, cursor: "pointer", opacity: deletingId === session.id ? 0.5 : 1, fontFamily: "inherit" }}
                    >
                      {deletingId === session.id ? "Deleting…" : "Delete"}
                    </button>
                  )}
                </div>
              </div>

              {/* Inline confirmation row */}
              {confirmDeleteId === session.id && (
                <div style={{ marginTop: 14, paddingTop: 14, borderTop: "1px solid var(--line-3)", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ fontSize: 13, fontWeight: 600, color: "var(--danger)", margin: 0 }}>Delete this grouping?</p>
                    {session.config.smallGroupMode === true && (
                      <p style={{ fontSize: 12, color: "var(--muted-text)", margin: "3px 0 0" }}>This will also clear all small group assignments. DGLs will see the empty state until groups are re-confirmed.</p>
                    )}
                  </div>
                  <div style={{ display: "flex", gap: 8, flexShrink: 0 }}>
                    <button
                      onClick={() => setConfirmDeleteId(null)}
                      style={{ padding: "6px 14px", border: "1px solid var(--line-2)", borderRadius: 8, background: "transparent", color: "var(--body)", fontSize: 13, fontWeight: 500, cursor: "pointer", fontFamily: "inherit" }}
                    >
                      Cancel
                    </button>
                    <button
                      onClick={() => handleDelete(session)}
                      style={{ padding: "6px 14px", border: "none", borderRadius: 8, background: "var(--danger)", color: "#fff", fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}
                    >
                      Delete
                    </button>
                  </div>
                </div>
              )}
            </CentralCard>
          ))}
        </div>
      )}

      {showWizard && (
        <GroupGeneratorWizard
          teamId={teamId}
          ministryId={ministryId}
          userId={userId}
          onClose={() => setShowWizard(false)}
          onSaved={() => { setShowWizard(false); loadSessions() }}
        />
      )}
    </div>
  )
}

// ── GroupSessionView ───────────────────────────────────────────────────────────

function GroupSessionView({ session, onBack }: { session: GroupSessionRecord; onBack: () => void }) {
  const supabase = createClient()
  const [groups, setGroups] = useState<{ id: string; name: string; order_index: number; members: { id: string; name: string; graduation_year: number | null; role: string }[] }[]>([])
  const [loading, setLoading] = useState(true)

  const mono: React.CSSProperties = EYEBROW_STYLE

  // Back nav is the shell breadcrumb (§175) — "Groups" crumb returns to the list.
  useSubpageCrumbs([{ label: "Groups", onClick: onBack }, { label: session.name }])

  useEffect(() => {
    async function load() {
      const { data: gData } = await supabase
        .from("generated_groups")
        .select("id, name, order_index")
        .eq("session_id", session.id)
        .order("order_index")
      if (!gData || gData.length === 0) { setLoading(false); return }
      const gIds = gData.map((g: Record<string, unknown>) => g.id as string)
      const { data: mData } = await supabase
        .from("generated_group_members")
        .select("group_id, profiles(id, name, graduation_year, role)")
        .in("group_id", gIds)
      const membersByGroup: Record<string, { id: string; name: string; graduation_year: number | null; role: string }[]> = {}
      ;(mData ?? []).forEach((m: Record<string, unknown>) => {
        const gid = m.group_id as string
        if (!membersByGroup[gid]) membersByGroup[gid] = []
        const p = m.profiles as { id: string; name: string; graduation_year: number | null; role: string } | null
        if (p) membersByGroup[gid].push(p)
      })
      setGroups(gData.map((g: Record<string, unknown>) => ({
        id: g.id as string,
        name: g.name as string,
        order_index: g.order_index as number,
        members: membersByGroup[g.id as string] ?? [],
      })))
      setLoading(false)
    }
    load()
  }, [session.id]) // eslint-disable-line react-hooks/exhaustive-deps

  function exportCSV() {
    const rows = [["Name", "Group", "Graduation Year", "Role"]]
    for (const g of groups) {
      for (const m of g.members) {
        rows.push([m.name, g.name, String(m.graduation_year ?? ""), m.role])
      }
    }
    const csv = rows.map(r => r.map(c => `"${c.replace(/"/g, '""')}"`).join(",")).join("\n")
    const blob = new Blob([csv], { type: "text/csv" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url; a.download = `${session.name.replace(/[^a-zA-Z0-9]/g, "_")}.csv`; a.click()
    URL.revokeObjectURL(url)
  }

  const totalPeople = groups.reduce((s, g) => s + g.members.length, 0)

  return (
    <div>
      <div style={{ display: "flex", alignItems: "flex-end", gap: 16, marginBottom: 24 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <p style={mono}>Saved grouping</p>
          <h2 style={{ fontFamily: "var(--font-instrument-serif)", fontSize: 32, fontWeight: 600, margin: "4px 0 0", letterSpacing: "-0.02em", color: "var(--ink)", lineHeight: 1.1 }}>{session.name}</h2>
        </div>
        <button
          onClick={exportCSV}
          style={{ padding: "8px 16px", border: "1px solid var(--line-2)", borderRadius: 8, background: "transparent", color: "var(--body)", fontSize: 13, fontWeight: 500, cursor: "pointer", display: "flex", alignItems: "center", gap: 6, fontFamily: "inherit" }}
        >
          <Download style={{ width: 13, height: 13 }} />
          Export CSV
        </button>
      </div>
      <p style={{ fontSize: 13, color: "var(--muted-text)", marginBottom: 24 }}>
        {groups.length} groups · {totalPeople} people · Created {new Date(session.created_at).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}
      </p>

      {loading ? (
        <div style={{ padding: "40px 0", display: "flex", justifyContent: "center" }}>
          <Loader2 style={{ width: 22, height: 22, color: "var(--muted-text)" }} className="animate-spin" />
        </div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))", gap: 14 }}>
          {groups.map(g => (
            <div key={g.id} style={{ background: "var(--cream-panel)", border: "1px solid var(--line)", borderRadius: 14, padding: "18px 20px" }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
                <p style={{ fontSize: 14, fontWeight: 600, color: "var(--ink)", margin: 0 }}>{g.name}</p>
                <span style={{ fontSize: 11, color: "var(--muted-text)" }}>{g.members.length}</span>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {g.members.map(m => (
                  <div key={m.id} style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <div style={{ width: 28, height: 28, borderRadius: 7, background: "var(--plum)", flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
                      <span style={{ fontSize: 10, fontWeight: 600, color: "var(--cream-panel)" }}>
                        {m.name.split(/\s+/).map((w: string) => w[0]).join("").slice(0, 2).toUpperCase()}
                      </span>
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <p style={{ fontSize: 13, fontWeight: 500, color: "var(--ink)", margin: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{m.name}</p>
                      <p style={{ fontSize: 11, color: "var(--muted-text)", margin: 0 }}>
                        {m.graduation_year ? `'${String(m.graduation_year).slice(-2)}` : ""}{m.graduation_year && m.role ? " · " : ""}{m.role}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ── GroupGeneratorWizard ───────────────────────────────────────────────────────

function GroupGeneratorWizard({
  teamId, ministryId, userId, onClose, onSaved,
}: {
  teamId: string | null
  ministryId: string
  userId: string
  onClose: () => void
  onSaved: () => void
}) {
  const supabase = createClient()
  const [step, setStep] = useState<1 | 2 | 3>(1)

  // Step 1 state
  const [sourceType, setSourceType] = useState<"everyone" | "announcement" | "form">("everyone")
  const [sourceId, setSourceId] = useState<string>("")
  const [announcements, setAnnouncements] = useState<{ id: string; title: string; rsvp_count: number }[]>([])
  const [forms, setForms] = useState<{ id: string; title: string; response_count: number }[]>([])
  const [poolCount, setPoolCount] = useState<number | null>(null)
  const [countLoading, setCountLoading] = useState(false)

  // Step 2 state
  const [numGroups, setNumGroups] = useState(8)
  const [balanceByYear, setBalanceByYear] = useState(true)
  const [separateVisitors, setSeparateVisitors] = useState(true)
  const [hasVisitors, setHasVisitors] = useState(false)
  const [smallGroupMode, setSmallGroupMode] = useState(false)
  const [prevCSVText, setPrevCSVText] = useState("")
  const [naming, setNaming] = useState<"numeric" | "alpha">("numeric")

  // Step 3 state
  const [groups, setGroups] = useState<GeneratedGroup[]>([])
  const [sessionName, setSessionName] = useState("")
  const [generating, setGenerating] = useState(false)
  const [genError, setGenError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  // Drag state
  const [dragSource, setDragSource] = useState<{ groupIdx: number; memberIdx: number } | null>(null)
  const [dragOver, setDragOver] = useState<number | null>(null)
  const [dragError, setDragError] = useState<string | null>(null)

  // SG mode integration — DGL roster data
  const [sglChecked, setSglChecked] = useState(false)
  const [sglTeamId, setSglTeamId] = useState<string | null>(null)
  const [sglRosterConfirmed, setSglRosterConfirmed] = useState(false)
  const [sgDGLs, setSgDGLs] = useState<DGLLeader[]>([])
  const [sgGroups, setSgGroups] = useState<SGGeneratedGroup[]>([])
  const [confirmingSG, setConfirmingSG] = useState(false)
  const [sgConfirmResult, setSgConfirmResult] = useState<string | null>(null)
  const semester = useMemo(() => getSemesterLabel(), [])

  const mono: React.CSSProperties = EYEBROW_STYLE

  // Load announcements + forms on mount
  useEffect(() => {
    async function loadOptions() {
      // Load announcements with RSVP counts
      const { data: anns } = await supabase
        .from("announcements")
        .select("id, title")
        .eq("ministry_id", ministryId)
        .order("created_at", { ascending: false })
        .limit(50)

      if (anns && anns.length > 0) {
        const annIds = anns.map((a: Record<string, unknown>) => a.id as string)
        const { data: rsvpCounts } = await supabase
          .from("rsvps")
          .select("announcement_id")
          .in("announcement_id", annIds)
        const countMap: Record<string, number> = {}
        ;(rsvpCounts ?? []).forEach((r: Record<string, unknown>) => {
          const aid = r.announcement_id as string
          countMap[aid] = (countMap[aid] ?? 0) + 1
        })
        setAnnouncements(
          anns
            .map((a: Record<string, unknown>) => ({ id: a.id as string, title: a.title as string, rsvp_count: countMap[a.id as string] ?? 0 }))
            .filter(a => a.rsvp_count > 0)
        )
      }

      // Load forms via announcement_forms
      const { data: formRows } = await supabase
        .from("announcement_forms")
        .select("id, announcement_id, announcements(title)")
        .in("announcement_id", anns ? anns.map((a: Record<string, unknown>) => a.id as string) : [])
      if (formRows && formRows.length > 0) {
        const formIds = formRows.map((f: Record<string, unknown>) => f.id as string)
        const { data: respCounts } = await supabase
          .from("form_responses")
          .select("form_id")
          .in("form_id", formIds)
        const respMap: Record<string, number> = {}
        ;(respCounts ?? []).forEach((r: Record<string, unknown>) => {
          const fid = r.form_id as string
          respMap[fid] = (respMap[fid] ?? 0) + 1
        })
        setForms(
          formRows
            .map((f: Record<string, unknown>) => {
              const ann = f.announcements as { title?: string } | null
              return { id: f.id as string, title: ann?.title ?? "Untitled form", response_count: respMap[f.id as string] ?? 0 }
            })
            .filter(f => f.response_count > 0)
        )
      }
    }
    loadOptions()

    // Check if any visitors exist in ministry
    supabase.from("profiles").select("id").eq("ministry_id", ministryId).eq("role", "visitor").limit(1)
      .then(({ data }) => setHasVisitors((data ?? []).length > 0))
  }, [ministryId]) // eslint-disable-line react-hooks/exhaustive-deps

  // Update pool count when source changes
  useEffect(() => {
    async function fetchCount() {
      setCountLoading(true)
      setPoolCount(null)
      if (sourceType === "everyone") {
        const { count } = await supabase
          .from("profiles")
          .select("id", { count: "exact", head: true })
          .eq("ministry_id", ministryId)
        setPoolCount(count ?? 0)
      } else if (sourceType === "announcement" && sourceId) {
        const { count } = await supabase
          .from("rsvps")
          .select("user_id", { count: "exact", head: true })
          .eq("announcement_id", sourceId)
        setPoolCount(count ?? 0)
      } else if (sourceType === "form" && sourceId) {
        // Mirror the generate path: dedup respondents by user_id, then keep
        // only those with a profile in this ministry.
        const { data: respData } = await supabase
          .from("form_responses")
          .select("user_id")
          .eq("form_id", sourceId)
        const seen = new Set<string>()
        const userIds = ((respData ?? []) as { user_id: string }[])
          .map((r) => r.user_id)
          .filter((id) => { if (seen.has(id)) return false; seen.add(id); return true })
        if (userIds.length === 0) {
          setPoolCount(0)
        } else {
          const { count } = await supabase
            .from("profiles")
            .select("id", { count: "exact", head: true })
            .eq("ministry_id", ministryId)
            .in("id", userIds)
          setPoolCount(count ?? 0)
        }
      } else {
        setPoolCount(null)
      }
      setCountLoading(false)
    }
    fetchCount()
  }, [sourceType, sourceId, ministryId]) // eslint-disable-line react-hooks/exhaustive-deps

  // Load SGL team + roster status on mount
  useEffect(() => {
    async function loadSGL() {
      const { data: teamRow } = await supabase
        .from("teams")
        .select("id")
        .eq("ministry_id", ministryId)
        .ilike("name", "%small group leader%")
        .maybeSingle()
      if (!teamRow) { setSglChecked(true); return }
      setSglTeamId(teamRow.id)

      const { data: statusRow } = await supabase
        .from("dgl_roster_status")
        .select("confirmed")
        .eq("team_id", teamRow.id)
        .eq("semester", getSemesterLabel())
        .maybeSingle()
      const confirmed = !!statusRow?.confirmed
      setSglRosterConfirmed(confirmed)
      setSglChecked(true)
      if (!confirmed) return

      const { data: rosterRows } = await supabase
        .from("dgl_roster")
        .select("user_id")
        .eq("team_id", teamRow.id)
        .eq("semester", getSemesterLabel())
      const memberIds = (rosterRows ?? []).map((r: { user_id: string }) => r.user_id)
      if (memberIds.length === 0) return

      const { data: profileRows } = await supabase
        .from("profiles")
        .select("id, name, gender")
        .in("id", memberIds)
      setSgDGLs(
        (profileRows ?? []).map((p: { id: string; name: string; gender: string | null }) => ({
          user_id: p.id,
          user_name: p.name,
          gender: p.gender,
        }))
      )
    }
    loadSGL()
  }, [ministryId]) // eslint-disable-line react-hooks/exhaustive-deps

  function parsePrevCSV(text: string): PrevPairing[] {
    const lines = text.trim().split(/\r?\n/).slice(1) // skip header
    return lines.flatMap(line => {
      const cols = line.split(",").map(c => c.trim().replace(/^"|"$/g, ""))
      if (cols.length < 2 || !cols[0] || !cols[1]) return []
      return [{ name: cols[0], groupLabel: cols[1] }]
    })
  }

  async function handleGenerate() {
    setGenerating(true)
    setGenError(null)
    try {
      // Fetch pool client-side — avoids server-action admin client dependency
      let pool: PoolPerson[] = []

      if (sourceType === "everyone") {
        const { data, error } = await supabase
          .from("profiles")
          .select("id, name, graduation_year, role, gender")
          .eq("ministry_id", ministryId)
          .not("name", "is", null)
        if (error) throw new Error("Failed to fetch members.")
        pool = (data ?? []) as PoolPerson[]
      } else if (sourceType === "announcement" && sourceId) {
        const { data, error } = await supabase
          .from("rsvps")
          .select("user_id, profiles(id, name, graduation_year, role, gender)")
          .eq("announcement_id", sourceId)
        if (error) throw new Error("Failed to fetch RSVP list.")
        pool = ((data ?? []) as Record<string, unknown>[])
          .map((r) => {
            const p = r.profiles
            return Array.isArray(p) ? p[0] : p
          })
          .filter(Boolean) as PoolPerson[]
      } else if (sourceType === "form" && sourceId) {
        const { data: respData, error: respErr } = await supabase
          .from("form_responses")
          .select("user_id")
          .eq("form_id", sourceId)
        if (respErr) throw new Error("Failed to fetch form responses.")
        const seen = new Set<string>()
        const userIds = ((respData ?? []) as { user_id: string }[])
          .map((r) => r.user_id)
          .filter((id) => { if (seen.has(id)) return false; seen.add(id); return true })
        if (userIds.length > 0) {
          const { data, error } = await supabase
            .from("profiles")
            .select("id, name, graduation_year, role, gender")
            .eq("ministry_id", ministryId)
            .in("id", userIds)
          if (error) throw new Error("Failed to fetch profiles.")
          pool = (data ?? []) as PoolPerson[]
        }
      }

      if (pool.length === 0) {
        setGenError("No people found in this pool.")
        return
      }

      // Exclude DGLs from the pool in SG mode
      const isSGMode = smallGroupMode && sgDGLs.length > 0 && sglRosterConfirmed
      const dglIds = new Set(sgDGLs.map(d => d.user_id))
      const memberPool = isSGMode ? pool.filter(p => !dglIds.has(p.id)) : pool

      if (isSGMode) {
        const result = runSmallGroupAlgorithm(sgDGLs, memberPool, {
          balanceByYear,
          separateVisitors: separateVisitors && hasVisitors,
          prevPairings: smallGroupMode && prevCSVText.trim() ? parsePrevCSV(prevCSVText) : [],
        })
        if (result.length === 0) { setGenError("No groups generated."); return }
        setSgGroups(result)
        setGroups([])
        if (!sessionName) setSessionName(`Small Groups — ${semester}`)
        const emptyCount = result.filter(g => g.members.length === 0).length
        if (emptyCount > 0) {
          setGenError(`${emptyCount} leader group(s) have no members — there are more leaders than members in that gender.`)
        }
        setStep(3)
        return
      }

      const prevPairings = smallGroupMode && prevCSVText.trim() ? parsePrevCSV(prevCSVText) : []
      const resolvedNumGroups = Math.min(Math.max(1, numGroups), memberPool.length)
      const result = runAlgorithm(memberPool, {
        ministryId,
        sourceType,
        sourceId: sourceId || undefined,
        numGroups: resolvedNumGroups,
        balanceByYear,
        separateVisitors: separateVisitors && hasVisitors,
        smallGroupMode,
        prevPairings,
        naming,
      })

      if (result.length === 0) {
        setGenError("No groups generated.")
        return
      }
      setGroups(result)
      setSgGroups([])
      if (!sessionName) setSessionName(`Group Set — ${new Date().toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}`)
      setStep(3)
    } catch (e) {
      setGenError(e instanceof Error ? e.message : "Generation failed. Please try again.")
    } finally {
      setGenerating(false)
    }
  }

  async function handleSave() {
    if (!sessionName.trim()) return
    setSaving(true)
    try {
      const isSGMode = sgGroups.length > 0

      const { data: sessionData, error: sessionErr } = await supabase
        .from("group_sessions")
        .insert({
          team_id: teamId,
          ministry_id: ministryId,
          name: sessionName.trim(),
          source_type: sourceType,
          source_id: sourceId || null,
          config: { numGroups, balanceByYear, separateVisitors, smallGroupMode, naming },
          created_by: userId,
        })
        .select("id")
        .single()

      if (sessionErr || !sessionData) return

      const groupsToSave = isSGMode
        ? sgGroups.map(g => ({ name: g.name, members: g.members }))
        : groups

      for (let i = 0; i < groupsToSave.length; i++) {
        const g = groupsToSave[i]
        const { data: groupData } = await supabase
          .from("generated_groups")
          .insert({ session_id: sessionData.id, name: g.name, order_index: i })
          .select("id")
          .single()
        if (!groupData) continue
        if (g.members.length > 0) {
          await supabase.from("generated_group_members").insert(
            g.members.map(m => ({ group_id: groupData.id, user_id: m.id }))
          )
        }
      }

      if (isSGMode && sglTeamId) {
        setConfirmingSG(true)
        const r = await confirmSmallGroupsAction({
          teamId: sglTeamId,
          ministryId,
          semester,
          groups: sgGroups.map(g => ({
            leader_id: g.leader_id,
            leader_gender: g.leader_gender,
            name: g.name,
            paired_with_leader_id: g.pair_leader_id,
            members: g.members.map(m => ({ id: m.id })),
          })),
        })
        setConfirmingSG(false)
        if (r.error) {
          setSgConfirmResult(`Saved, but chat creation failed: ${r.error}`)
        } else {
          setSgConfirmResult(`Groups confirmed. ${r.chatResult?.created ?? 0} small group chats created, ${r.chatResult?.updated ?? 0} updated.`)
        }
        return
      }

      onSaved()
    } finally {
      setSaving(false)
    }
  }

  // Drag-and-drop handlers
  function handleDragStart(groupIdx: number, memberIdx: number) {
    setDragSource({ groupIdx, memberIdx })
  }

  function handleDrop(targetGroupIdx: number) {
    if (!dragSource) return
    if (dragSource.groupIdx === targetGroupIdx) { setDragSource(null); setDragOver(null); return }

    // In SG mode, block cross-gender drags
    if (sgGroups.length > 0) {
      const srcGender = sgGroups[dragSource.groupIdx]?.leader_gender
      const tgtGender = sgGroups[targetGroupIdx]?.leader_gender
      if (srcGender && tgtGender && srcGender !== tgtGender) {
        setDragSource(null); setDragOver(null)
        setDragError("Gender groups must be kept separate.")
        setTimeout(() => setDragError(null), 3000)
        return
      }
      const newSgGroups = sgGroups.map(g => ({ ...g, members: [...g.members] }))
      const [moved] = newSgGroups[dragSource.groupIdx].members.splice(dragSource.memberIdx, 1)
      newSgGroups[targetGroupIdx].members.push(moved)
      setSgGroups(newSgGroups)
    } else {
      const newGroups = groups.map(g => ({ ...g, members: [...g.members] }))
      const [moved] = newGroups[dragSource.groupIdx].members.splice(dragSource.memberIdx, 1)
      newGroups[targetGroupIdx].members.push(moved)
      setGroups(newGroups)
    }

    setDragSource(null)
    setDragOver(null)
  }

  const isSGModeActive = smallGroupMode && sglRosterConfirmed && sgDGLs.length > 0

  const estGroupSize = poolCount != null && numGroups > 0 && !isSGModeActive
    ? Math.ceil(poolCount / numGroups)
    : null

  const step1Ready = sourceType === "everyone" || (sourceId.length > 0)

  const STEPS = ["Pick pool", "Configure", "Preview"]
  const stepIdx = step - 1

  // Back/exit is the shell breadcrumb (§175) — "Groups" crumb closes the wizard.
  useSubpageCrumbs([{ label: "Groups", onClick: onClose }, { label: "New grouping" }])

  return (
    <AnimateIn
      className="fixed inset-0 z-[85] bg-[var(--cream-panel)] flex flex-col"
      style={{ left: 0 }}
    >
      {/* Header — full-bleed bar, inner content centered to the wizard column.
          Back/X are mobile-only; on desktop the shell breadcrumb is the exit (§175). */}
      <div style={{ padding: "22px 32px 0", borderBottom: "1px solid var(--line)", flexShrink: 0 }}>
        <div style={{ maxWidth: 680, margin: "0 auto", width: "100%" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 18 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <button
              className="md:hidden"
              onClick={step === 1 ? onClose : () => setStep(s => (s - 1) as 1 | 2 | 3)}
              style={{ width: 32, height: 32, borderRadius: 8, border: "1px solid var(--line-2)", background: "transparent", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", color: "var(--body)", flexShrink: 0 }}
            >
              <ArrowLeft style={{ width: 14, height: 14 }} />
            </button>
            <div>
              <p style={mono}>Step {step} of {STEPS.length}</p>
              <p style={{ fontFamily: "var(--font-instrument-serif)", fontSize: 28, fontWeight: 600, margin: "4px 0 0", color: "var(--ink)", letterSpacing: "-0.02em", lineHeight: 1.1 }}>
                {STEPS[stepIdx]}
              </p>
            </div>
          </div>
          <button className="md:hidden" onClick={onClose} style={{ width: 32, height: 32, borderRadius: 8, border: "1px solid var(--line-2)", background: "transparent", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", color: "var(--body)", flexShrink: 0 }}>
            <X style={{ width: 14, height: 14 }} />
          </button>
        </div>
        {/* Stepper */}
        <div style={{ display: "flex", gap: 8, paddingBottom: 0 }}>
          {STEPS.map((s, i) => (
            <div key={s} style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <div style={{
                width: 22, height: 22, borderRadius: 999,
                background: i < stepIdx ? "var(--plum)" : i === stepIdx ? "var(--ink)" : "transparent",
                border: i > stepIdx ? "1px solid var(--line-2)" : "none",
                display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: 10, color: i <= stepIdx ? "var(--cream-panel)" : "var(--muted-text)", fontWeight: 600,
              }}>
                {i < stepIdx ? <Check style={{ width: 10, height: 10 }} /> : i + 1}
              </div>
              <span style={{ fontSize: 12, color: i === stepIdx ? "var(--ink)" : "var(--muted-text)", fontWeight: i === stepIdx ? 500 : 400 }}>{s}</span>
              {i < STEPS.length - 1 && <div style={{ width: 20, height: 1, background: "var(--line)", margin: "0 4px" }} />}
            </div>
          ))}
        </div>
        </div>
      </div>

      {/* Content */}
      <div style={{ flex: 1, overflowY: "auto", padding: "28px 32px 44px" }}>

        {/* ── Step 1: Pick pool ── */}
        {step === 1 && (
          <div style={{ maxWidth: 680, margin: "0 auto" }}>
            <p style={{ fontSize: 14, color: "var(--body)", marginBottom: 24 }}>
              Choose who to draw from. The algorithm will run on this set of people.
            </p>

            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {([
                { value: "everyone", label: "Everyone in the ministry", desc: "All members, leaders, and visitors." },
                { value: "announcement", label: "People who RSVPed to an event", desc: "Anyone who RSVPed to a specific announcement." },
                { value: "form", label: "Form respondents", desc: "Anyone who submitted a response to a form." },
              ] as const).map(opt => (
                <button
                  key={opt.value}
                  onClick={() => { setSourceType(opt.value); setSourceId("") }}
                  style={{
                    display: "flex", alignItems: "flex-start", gap: 14, padding: "16px 18px",
                    border: sourceType === opt.value ? "1px solid var(--plum)" : "1px solid var(--line-2)",
                    borderRadius: 12, background: sourceType === opt.value ? "var(--cream-3)" : "var(--cream-panel)",
                    cursor: "pointer", textAlign: "left", fontFamily: "inherit",
                    boxShadow: sourceType === opt.value ? "inset 0 0 0 1px var(--plum)" : "none",
                  }}
                >
                  <div style={{
                    width: 18, height: 18, borderRadius: 999, flexShrink: 0, marginTop: 2,
                    border: "2px solid " + (sourceType === opt.value ? "var(--plum)" : "var(--dashed)"),
                    display: "flex", alignItems: "center", justifyContent: "center",
                  }}>
                    {sourceType === opt.value && <div style={{ width: 8, height: 8, borderRadius: 999, background: "var(--plum)" }} />}
                  </div>
                  <div>
                    <p style={{ fontSize: 14, fontWeight: 600, color: "var(--ink)", margin: 0 }}>{opt.label}</p>
                    <p style={{ fontSize: 12, color: "var(--body)", margin: "3px 0 0" }}>{opt.desc}</p>
                  </div>
                </button>
              ))}
            </div>

            {/* Dropdown for announcement/form */}
            {sourceType === "announcement" && (
              <div style={{ marginTop: 16 }}>
                <label style={{ ...mono, display: "block", marginBottom: 6 }}>Select event</label>
                {announcements.length === 0 ? (
                  <p style={{ fontSize: 13, color: "var(--muted-text)", fontStyle: "italic" }}>No announcements with RSVPs found.</p>
                ) : (
                  <select
                    value={sourceId}
                    onChange={e => setSourceId(e.target.value)}
                    style={{ width: "100%", padding: "10px 14px", border: "1px solid var(--line-2)", borderRadius: 10, background: "var(--cream-panel)", fontSize: 14, color: "var(--ink)", fontFamily: "inherit" }}
                  >
                    <option value="">Choose an announcement…</option>
                    {announcements.map(a => (
                      <option key={a.id} value={a.id}>{a.title} ({a.rsvp_count} RSVPs)</option>
                    ))}
                  </select>
                )}
              </div>
            )}

            {sourceType === "form" && (
              <div style={{ marginTop: 16 }}>
                <label style={{ ...mono, display: "block", marginBottom: 6 }}>Select form</label>
                {forms.length === 0 ? (
                  <p style={{ fontSize: 13, color: "var(--muted-text)", fontStyle: "italic" }}>No forms with responses found.</p>
                ) : (
                  <select
                    value={sourceId}
                    onChange={e => setSourceId(e.target.value)}
                    style={{ width: "100%", padding: "10px 14px", border: "1px solid var(--line-2)", borderRadius: 10, background: "var(--cream-panel)", fontSize: 14, color: "var(--ink)", fontFamily: "inherit" }}
                  >
                    <option value="">Choose a form…</option>
                    {forms.map(f => (
                      <option key={f.id} value={f.id}>{f.title} ({f.response_count} responses)</option>
                    ))}
                  </select>
                )}
              </div>
            )}

            {/* Pool count preview */}
            <div style={{ marginTop: 20, padding: "14px 18px", background: "var(--cream-3)", border: "1px solid var(--line)", borderRadius: 10 }}>
              {countLoading ? (
                <p style={{ fontSize: 13, color: "var(--muted-text)", margin: 0 }}>Counting…</p>
              ) : poolCount !== null ? (
                <p style={{ fontSize: 14, fontWeight: 600, color: "var(--ink)", margin: 0 }}>
                  {poolCount === 0 ? "No people in this pool" : `${poolCount} ${poolCount === 1 ? "person" : "people"} in this pool`}
                </p>
              ) : (
                <p style={{ fontSize: 13, color: "var(--muted-text)", margin: 0 }}>Select a source above to see the pool size.</p>
              )}
            </div>
          </div>
        )}

        {/* ── Step 2: Configure ── */}
        {step === 2 && (
          <div style={{ maxWidth: 680, margin: "0 auto" }}>
            {/* Num groups — replaced by DGL count in SG mode */}
            {!(smallGroupMode && sglRosterConfirmed && sgDGLs.length > 0) && (
              <div style={{ marginBottom: 28 }}>
                <label style={{ ...mono, display: "block", marginBottom: 8 }}>Number of groups</label>
                <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
                  <input
                    type="number"
                    min={1}
                    max={poolCount ?? 100}
                    value={numGroups}
                    onChange={e => setNumGroups(Math.min(Math.max(1, parseInt(e.target.value) || 1), poolCount && poolCount > 0 ? poolCount : 999))}
                    style={{ width: 80, padding: "10px 14px", border: "1px solid var(--line-2)", borderRadius: 10, background: "var(--cream-panel)", fontSize: 15, color: "var(--ink)", fontFamily: "inherit" }}
                  />
                  {estGroupSize !== null && (
                    <p style={{ fontSize: 13, color: "var(--muted-text)", margin: 0 }}>
                      ~{estGroupSize} {estGroupSize === 1 ? "person" : "people"} per group
                    </p>
                  )}
                </div>
              </div>
            )}

            {/* SG mode DGL count display */}
            {smallGroupMode && sglRosterConfirmed && sgDGLs.length > 0 && (
              <div style={{ marginBottom: 28, padding: "14px 18px", background: "var(--cream-3)", border: "1px solid var(--line)", borderRadius: 10 }}>
                <p style={{ fontSize: 14, fontWeight: 600, color: "var(--ink)", margin: "0 0 3px" }}>
                  {sgDGLs.length} group{sgDGLs.length !== 1 ? "s" : ""} — one per DGL on the {semester} roster
                </p>
                <p style={{ fontSize: 12, color: "var(--muted-text)", margin: 0 }}>Gender matching is applied automatically.</p>
              </div>
            )}

            {/* Divider */}
            <div style={{ height: 1, background: "var(--line)", margin: "0 0 24px" }} />

            {/* Diversity toggles */}
            <p style={{ ...mono, marginBottom: 16 }}>Diversity settings</p>
            <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
              <GgToggle
                checked={balanceByYear}
                onChange={setBalanceByYear}
                label="Balance by graduation year"
                desc="Distributes each graduating class evenly across groups."
              />
              {hasVisitors && (
                <GgToggle
                  checked={separateVisitors}
                  onChange={setSeparateVisitors}
                  label="Spread visitors across groups"
                  desc="Visitors are distributed evenly rather than grouped together."
                />
              )}
              {(() => {
                const sgDisabled = !sglChecked || (sglTeamId !== null && !sglRosterConfirmed)
                const sgDesc = sglTeamId !== null
                  ? "Assigns members to DGL groups by gender and year balance."
                  : "Penalizes re-grouping people who were together last time."
                return (
                  <GgToggle
                    checked={smallGroupMode}
                    onChange={setSmallGroupMode}
                    label="Small group mode"
                    desc={sgDesc}
                    disabled={sgDisabled}
                    tooltip={sglTeamId !== null ? "Confirm the DGL roster in Small Group Leaders first" : undefined}
                  />
                )
              })()}
            </div>

            {/* CSV upload — only for non-DGL small group mode */}
            {smallGroupMode && !(sglRosterConfirmed && sgDGLs.length > 0) && (
              <div style={{ marginTop: 18, padding: "16px 18px", background: "var(--cream-3)", border: "1px solid var(--line)", borderRadius: 12 }}>
                <p style={{ ...mono, marginBottom: 8 }}>Last year&apos;s groupings (CSV)</p>
                <p style={{ fontSize: 12, color: "var(--body)", margin: "0 0 10px" }}>
                  Format: <code style={{ fontFamily: "var(--mono)", background: "var(--line)", padding: "1px 5px", borderRadius: 4 }}>Name, Group</code> — one row per person. First row is header.
                </p>
                <textarea
                  value={prevCSVText}
                  onChange={e => setPrevCSVText(e.target.value)}
                  placeholder={"Name,Group\nJane Smith,Group 1\nJohn Doe,Group 2"}
                  rows={6}
                  style={{ width: "100%", padding: "10px 12px", border: "1px solid var(--line-2)", borderRadius: 8, background: "var(--cream-panel)", fontSize: 12, fontFamily: "var(--mono)", resize: "vertical", color: "var(--ink)", boxSizing: "border-box" }}
                />
              </div>
            )}

            {/* Naming — hidden in SG mode */}
            {!(smallGroupMode && sglRosterConfirmed && sgDGLs.length > 0) && (
              <>
                {/* Divider */}
                <div style={{ height: 1, background: "var(--line)", margin: "24px 0" }} />
                <p style={{ ...mono, marginBottom: 12 }}>Group naming</p>
                <div style={{ display: "flex", gap: 10 }}>
                  {([
                    { value: "numeric", label: "Group 1, 2, 3…" },
                    { value: "alpha", label: "Group A, B, C…" },
                  ] as const).map(opt => (
                    <button
                      key={opt.value}
                      onClick={() => setNaming(opt.value)}
                      style={{
                        padding: "8px 18px", borderRadius: 8, fontSize: 13, fontWeight: 500,
                        border: "1px solid " + (naming === opt.value ? "var(--plum)" : "var(--line-2)"),
                        background: naming === opt.value ? "var(--plum)" : "transparent",
                        color: naming === opt.value ? "var(--cream-panel)" : "var(--body)",
                        cursor: "pointer", fontFamily: "inherit",
                      }}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </>
            )}

            {genError && (
              <div style={{ marginTop: 18, padding: "12px 16px", background: "color-mix(in srgb, var(--danger) 6%, transparent)", border: "1px solid color-mix(in srgb, var(--danger) 20%, transparent)", borderRadius: 8 }}>
                <p style={{ fontSize: 13, color: "var(--danger)", margin: 0 }}>{genError}</p>
              </div>
            )}
          </div>
        )}

        {/* ── Step 3: Preview & adjust ── */}
        {step === 3 && (
          <div style={{ maxWidth: 1080, margin: "0 auto" }}>
            {/* Non-blocking notice carried over from generation (e.g. empty leader groups) */}
            {genError && (
              <div style={{ marginBottom: 20, padding: "12px 16px", background: "color-mix(in srgb, var(--danger) 6%, transparent)", border: "1px solid color-mix(in srgb, var(--danger) 20%, transparent)", borderRadius: 10 }}>
                <p style={{ fontSize: 13, color: "var(--danger)", margin: 0 }}>{genError}</p>
              </div>
            )}
            {/* Session name */}
            <div style={{ marginBottom: 24 }}>
              <label style={{ ...mono, display: "block", marginBottom: 6 }}>Session name</label>
              <input
                type="text"
                value={sessionName}
                onChange={e => setSessionName(e.target.value)}
                placeholder="e.g. Fall Retreat Groups 2026"
                style={{ width: "100%", maxWidth: 440, padding: "10px 14px", border: "1px solid var(--line-2)", borderRadius: 10, background: "var(--cream-panel)", fontSize: 14, color: "var(--ink)", fontFamily: "inherit", boxSizing: "border-box" }}
              />
            </div>

            {/* Success message after SG confirm */}
            {sgConfirmResult && (
              <div style={{ marginBottom: 20, padding: "12px 16px", background: "rgba(62,21,64,0.06)", border: "1px solid rgba(62,21,64,0.2)", borderRadius: 10 }}>
                <p style={{ fontSize: 13, color: "var(--plum)", fontWeight: 500, margin: 0 }}>{sgConfirmResult}</p>
                <button onClick={onSaved} style={{ fontSize: 12, color: "var(--plum)", background: "none", border: "none", padding: 0, marginTop: 8, cursor: "pointer", fontWeight: 600 }}>Done →</button>
              </div>
            )}

            {/* Cross-gender drag error */}
            {dragError && (
              <div style={{ marginBottom: 16, padding: "10px 14px", background: "color-mix(in srgb, var(--danger) 6%, transparent)", border: "1px solid color-mix(in srgb, var(--danger) 20%, transparent)", borderRadius: 8 }}>
                <p style={{ fontSize: 13, color: "var(--danger)", margin: 0 }}>{dragError}</p>
              </div>
            )}

            {/* SG mode groups */}
            {sgGroups.length > 0 ? (
              <>
                <p style={{ fontSize: 13, color: "var(--muted-text)", marginBottom: 20 }}>
                  {sgGroups.length} groups · {sgGroups.reduce((s, g) => s + g.members.length, 0)} members. Drag within same gender to adjust.
                </p>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: 12 }}>
                  {sgGroups.map((g, gIdx) => (
                    <div
                      key={gIdx}
                      onDragOver={e => { e.preventDefault(); setDragOver(gIdx) }}
                      onDragLeave={() => setDragOver(null)}
                      onDrop={() => handleDrop(gIdx)}
                      style={{
                        background: "var(--cream-panel)",
                        border: "1px solid " + (dragOver === gIdx ? "var(--plum)" : g.leader_gender === "male" ? "#B8D4F0" : g.leader_gender === "female" ? "#F0B8D4" : "var(--line)"),
                        borderRadius: 14, padding: "16px 18px", minHeight: 80,
                        transition: "border-color 0.1s",
                      }}
                    >
                      {/* Leader header */}
                      <div style={{ marginBottom: 10 }}>
                        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                          <p style={{ fontSize: 13, fontWeight: 700, color: "var(--ink)", margin: 0 }}>{g.name}</p>
                          <span style={{
                            fontSize: 10, padding: "2px 8px", borderRadius: 999, fontWeight: 500,
                            background: g.leader_gender === "male" ? "#E8F0FC" : g.leader_gender === "female" ? "#FCE8F0" : "#F0EDE8",
                            color: g.leader_gender === "male" ? "#2D5FA3" : g.leader_gender === "female" ? "#A32D5F" : "var(--muted-text)",
                          }}>
                            {g.leader_gender === "male" ? "Brothers" : g.leader_gender === "female" ? "Sisters" : "Group"}
                          </span>
                        </div>
                        <p style={{ fontSize: 11, color: "var(--muted-text)", margin: "2px 0 0" }}>DGL: {g.leader_name} · {g.members.length} members</p>
                      </div>
                      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                        {g.members.map((m, mIdx) => (
                          <div
                            key={m.id}
                            draggable
                            onDragStart={() => handleDragStart(gIdx, mIdx)}
                            onDragEnd={() => { setDragSource(null); setDragOver(null) }}
                            style={{
                              display: "flex", alignItems: "center", gap: 8, padding: "7px 8px",
                              border: "1px solid var(--line)", borderRadius: 8,
                              background: dragSource?.groupIdx === gIdx && dragSource?.memberIdx === mIdx ? "#F0EDE8" : "var(--cream-panel)",
                              cursor: "grab",
                            }}
                          >
                            <GripVertical style={{ width: 12, height: 12, color: "var(--dashed)", flexShrink: 0 }} />
                            <MonogramChip
                              initials={m.name.split(/\s+/).map((w: string) => w[0]).join("").slice(0, 2).toUpperCase()}
                              style={{ width: 24, height: 24, fontSize: 10, fontWeight: 700 }}
                            />
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <p style={{ fontSize: 12, fontWeight: 500, color: "var(--ink)", margin: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{m.name}</p>
                              <p style={{ fontSize: 10, color: "var(--muted-text)", margin: 0 }}>
                                {m.graduation_year ? `'${String(m.graduation_year).slice(-2)}` : ""}
                                {m.graduation_year && m.role ? " · " : ""}
                                {m.role}
                              </p>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </>
            ) : (
              <>
                <p style={{ fontSize: 13, color: "var(--muted-text)", marginBottom: 20 }}>
                  {groups.length} groups · {groups.reduce((s, g) => s + g.members.length, 0)} people. Drag members between groups to adjust.
                </p>

                {/* Standard groups grid */}
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: 12 }}>
                  {groups.map((g, gIdx) => (
                    <div
                      key={gIdx}
                      onDragOver={e => { e.preventDefault(); setDragOver(gIdx) }}
                      onDragLeave={() => setDragOver(null)}
                      onDrop={() => handleDrop(gIdx)}
                      style={{
                        background: "var(--cream-panel)", border: "1px solid " + (dragOver === gIdx ? "var(--plum)" : "var(--line)"),
                        borderRadius: 14, padding: "16px 18px", minHeight: 80,
                        transition: "border-color 0.1s",
                      }}
                    >
                      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
                        <p style={{ fontSize: 13, fontWeight: 700, color: "var(--ink)", margin: 0 }}>{g.name}</p>
                        <span style={{ fontSize: 11, color: "var(--muted-text)" }}>{g.members.length}</span>
                      </div>
                      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                        {g.members.map((m, mIdx) => (
                          <div
                            key={m.id}
                            draggable
                            onDragStart={() => handleDragStart(gIdx, mIdx)}
                            onDragEnd={() => { setDragSource(null); setDragOver(null) }}
                            style={{
                              display: "flex", alignItems: "center", gap: 8, padding: "7px 8px",
                              border: "1px solid var(--line)", borderRadius: 8, background: dragSource?.groupIdx === gIdx && dragSource?.memberIdx === mIdx ? "#F0EDE8" : "var(--cream-panel)",
                              cursor: "grab",
                            }}
                          >
                            <GripVertical style={{ width: 12, height: 12, color: "var(--dashed)", flexShrink: 0 }} />
                            <MonogramChip
                              initials={m.name.split(/\s+/).map((w: string) => w[0]).join("").slice(0, 2).toUpperCase()}
                              style={{ width: 24, height: 24, fontSize: 10, fontWeight: 700 }}
                            />
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <p style={{ fontSize: 12, fontWeight: 500, color: "var(--ink)", margin: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{m.name}</p>
                              <p style={{ fontSize: 10, color: "var(--muted-text)", margin: 0 }}>
                                {m.graduation_year ? `'${String(m.graduation_year).slice(-2)}` : ""}
                                {m.graduation_year && m.role ? " · " : ""}
                                {m.role}
                              </p>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        )}
      </div>

      {/* Footer */}
      <div style={{ borderTop: "1px solid var(--line)", padding: "16px 32px", flexShrink: 0, background: "var(--cream-panel)" }}>
        <div style={{ maxWidth: 680, margin: "0 auto", width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 14, minWidth: 0 }}>
          {step === 2 && (
            <button
              onClick={() => setStep(1)}
              style={{ padding: "10px 16px", border: "1px solid var(--line-2)", borderRadius: 10, background: "transparent", color: "var(--body)", fontSize: 14, fontWeight: 500, cursor: "pointer", display: "flex", alignItems: "center", gap: 7, fontFamily: "inherit", flexShrink: 0 }}
            >
              <ArrowLeft style={{ width: 13, height: 13 }} />
              Back
            </button>
          )}
          <p style={{ fontSize: 12, color: "var(--muted-text)", margin: 0 }}>
            {step === 1 && (poolCount != null ? `${poolCount} people in pool` : "")}
            {step === 2 && "You can adjust individual assignments in the next step."}
            {step === 3 && !sgConfirmResult && "Changes are not saved until you click below."}
          </p>
        </div>
        <div style={{ display: "flex", gap: 10, flexShrink: 0 }}>
          {step === 3 && !sgConfirmResult && (
            <button
              onClick={() => { setStep(2); setGroups([]); setSgGroups([]) }}
              style={{ padding: "10px 18px", border: "1px solid var(--line-2)", borderRadius: 10, background: "transparent", color: "var(--body)", fontSize: 14, fontWeight: 500, cursor: "pointer", display: "flex", alignItems: "center", gap: 7, fontFamily: "inherit" }}
            >
              <Shuffle style={{ width: 13, height: 13 }} />
              Regenerate
            </button>
          )}
          {step < 3 && (
            <CentralButton
              variant="primary" size="md"
              onClick={step === 1 ? () => setStep(2) : handleGenerate}
              disabled={(step === 1 && !step1Ready) || generating}
            >
              {generating ? <Loader2 style={{ width: 14, height: 14 }} className="animate-spin" /> : null}
              {step === 1 ? "Next" : generating ? "Generating…" : "Generate"}
            </CentralButton>
          )}
          {step === 3 && !sgConfirmResult && (
            <CentralButton
              variant="primary" size="md"
              onClick={handleSave}
              disabled={saving || confirmingSG || !sessionName.trim()}
            >
              {(saving || confirmingSG) ? <Loader2 style={{ width: 14, height: 14 }} className="animate-spin" /> : <Check style={{ width: 14, height: 14 }} />}
              {saving ? "Saving…" : confirmingSG ? "Confirming…" : sgGroups.length > 0 ? "Confirm groups" : "Save grouping"}
            </CentralButton>
          )}
        </div>
        </div>
      </div>
    </AnimateIn>
  )
}

// Shared toggle component for GroupGeneratorWizard
// Admin-tier roles (CLAUDE.md convention #2 — admin-tier). Governance separation:
// these users can't be team members unless the team's allow_admin_members is on.
const ADMIN_TIER_ROLES = ["admin", "deacon", "elder", "pastor"]
function isAdminTierRole(role: string | null | undefined): boolean {
  return !!role && ADMIN_TIER_ROLES.includes(role.toLowerCase())
}

function GgToggle({ checked, onChange, label, desc, disabled, tooltip }: {
  checked: boolean
  onChange: (v: boolean) => void
  label: string
  desc: string
  disabled?: boolean
  tooltip?: string
}) {
  return (
    <div style={{ display: "flex", alignItems: "flex-start", gap: 14, opacity: disabled ? 0.5 : 1 }} title={disabled ? tooltip : undefined}>
      <button
        role="switch"
        aria-checked={checked}
        onClick={() => !disabled && onChange(!checked)}
        style={{
          width: 36, height: 20, borderRadius: 999, flexShrink: 0,
          background: checked ? "var(--plum)" : "#D6D0C0",
          border: "none", cursor: disabled ? "not-allowed" : "pointer", position: "relative", transition: "background 0.15s", marginTop: 2,
        }}
      >
        <div style={{
          position: "absolute", top: 2, left: checked ? 18 : 2,
          width: 16, height: 16, borderRadius: 999, background: "var(--cream-panel)",
          transition: "left 0.15s",
        }} />
      </button>
      <div>
        <p style={{ fontSize: 14, fontWeight: 500, color: "var(--ink)", margin: 0 }}>{label}</p>
        <p style={{ fontSize: 12, color: "var(--muted-text)", margin: "3px 0 0" }}>{disabled && tooltip ? tooltip : desc}</p>
      </div>
    </div>
  )
}


// ── AddWorkspaceModal ─────────────────────────────────────────────────────────
//
// Preset-only "Add workspace" modal. Central no longer supports custom team
// creation — every workspace comes from a fixed preset (see workspace-presets.ts).
// This creates the team + its seed roles EMPTY (no members → no president); the
// admin assigns a president afterward in the workspace's settings.

export function AddWorkspaceModal({ ministryId, userId, ownedKeys, onClose, onCreated }: {
  ministryId: string
  userId: string
  ownedKeys: Set<string>
  onClose: () => void
  onCreated: (team: { id: string; name: string; icon: string; team_type: string }) => void
}) {
  const supabase = createClient()
  const [saving, setSaving] = useState<string | null>(null)
  const [error, setError] = useState("")

  const available = AVAILABLE_PRESETS.filter((p) => !ownedKeys.has(p.id))
  const comingSoon = WORKSPACE_PRESETS.filter((p) => p.comingSoon)

  async function handleSelect(preset: typeof WORKSPACE_PRESETS[number]) {
    if (saving) return
    setSaving(preset.id)
    setError("")
    try {
      const { data: team, error: teamErr } = await supabase
        .from("teams")
        .insert({
          ministry_id: ministryId,
          name: preset.name,
          icon: preset.emoji,
          description: preset.description,
          team_type: preset.teamType,
          created_by: userId,
          // New teams default to gov-WRITE so the creating governance admin
          // satisfies auth_can_manage_team (gov-write arm) and can seed roles +
          // add members via this client flow before a president exists. The
          // admin can dial it back to 'view'/'none' in the governance matrix.
          admin_access: "write",
        })
        .select("id")
        .single()
      if (teamErr || !team) throw teamErr ?? new Error("Could not create workspace.")

      const { error: rolesErr } = await supabase
        .from("team_roles")
        .insert(preset.roles.map((r) => ({
          team_id: team.id,
          name: r.name,
          permissions: r.permissions,
          is_president: !!r.is_president,
        })))
      if (rolesErr) throw rolesErr

      onCreated({ id: team.id, name: preset.name, icon: preset.emoji, team_type: preset.teamType })
      onClose()
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong creating the workspace.")
      setSaving(null)
    }
  }

  // §4.18: SubpageShell owns the page header (title "New workspace") + the shell
  // breadcrumb back (desktop) / mobile back row — no portal, no hand-rolled header.
  // width="centered" maxWidth 820 preserves the previous constrained card layout;
  // SubpageShell supplies the px-5 inset + max-width + bottom padding, so the body
  // wrapper only carries its own top rhythm.
  return (
    <SubpageShell
      crumbs={[{ label: "Workspace", onClick: onClose }, { label: "New workspace" }]}
      title="New workspace"
      width="centered"
      maxWidth={820}
    >
      <div className="pt-5 md:pt-8">
        {error && (
          <div className="rounded-xl px-4 py-3 text-[13px] text-[var(--plum)] font-medium mb-4" style={{ background: "color-mix(in oklab, var(--plum) 8%, transparent)" }}>{error}</div>
        )}

        <p className="text-[13px] text-[var(--muted-text)] mb-4" style={{ maxWidth: 560, lineHeight: 1.6 }}>
          Each workspace comes preset for a part of your ministry. It starts empty — you&apos;ll assign a president next.
        </p>

        {available.length === 0 && (
          <div className="rounded-2xl border border-[var(--line)] bg-[var(--cream-2)] px-4 py-5 mb-6 text-[13px] text-[var(--body)] leading-relaxed">
            You already have every available workspace. More types are coming soon.
          </div>
        )}

        {/* Available presets */}
        {available.length > 0 && (
          <div className="flex flex-col gap-3 md:grid md:gap-4 mb-6" style={{ gridTemplateColumns: "1fr 1fr" }}>
            {available.map((preset) => {
              const isSaving = saving === preset.id
              return (
                <button
                  key={preset.id}
                  onClick={() => handleSelect(preset)}
                  disabled={!!saving}
                  className="w-full bg-[var(--ivory)] rounded-2xl border border-[var(--line)] p-4 text-left hover:border-[var(--plum)] transition-all md:p-5 disabled:opacity-60"
                >
                  <div className="flex items-start gap-3">
                    <PlanLineIcon iconKey={preset.iconKey} size={40} />
                    <div className="flex-1 min-w-0">
                      <p style={{ fontFamily: "var(--font-instrument-serif)", fontSize: 20 }} className="text-[var(--ink)] leading-tight">{preset.name}</p>
                      <p className="text-[12px] text-[var(--muted-text)] mt-1">{preset.description}</p>
                    </div>
                    {isSaving && <Loader2 className="w-4 h-4 animate-spin text-[var(--plum)] mt-1" />}
                  </div>
                </button>
              )
            })}
          </div>
        )}

        {/* Coming-soon presets (disabled) */}
        {comingSoon.length > 0 && (
          <>
            <p className="text-[11px] tracking-[0.12em] uppercase text-[var(--muted-text)] mb-3">More coming soon</p>
            <div className="flex flex-col gap-3 md:grid md:gap-4" style={{ gridTemplateColumns: "1fr 1fr" }}>
              {comingSoon.map((preset) => (
                <div
                  key={preset.id}
                  className="w-full rounded-2xl border border-[var(--line)] p-4 text-left md:p-5"
                  style={{ background: "var(--cream-2)", opacity: 0.6, cursor: "not-allowed" }}
                >
                  <div className="flex items-start gap-3">
                    <PlanLineIcon iconKey={preset.iconKey} size={40} bg="var(--line)" fg="var(--muted-text)" />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p style={{ fontFamily: "var(--font-instrument-serif)", fontSize: 20 }} className="text-[var(--muted-text)] leading-tight">{preset.name}</p>
                        <span className="text-[10px] font-semibold tracking-wide uppercase bg-[var(--line)] text-[var(--muted-text)] px-2 py-0.5 rounded-full">Coming soon</span>
                      </div>
                      <p className="text-[12px] text-[var(--muted-text)] mt-1">{preset.description}</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </SubpageShell>
  )
}

// ── TeamDetailOverlay ─────────────────────────────────────────────────────────

// Pure SWR fetcher for a team's settings: its roles + members (key: ["team-settings", teamId]).
async function fetchTeamSettings([, teamId]: readonly [string, string]) {
  const supabase = createClient()
  const [{ data: rolesData }, { data: membersData }] = await Promise.all([
    supabase.from("team_roles").select("id, team_id, name, permissions, is_president").eq("team_id", teamId),
    supabase
      .from("team_members")
      .select("user_id, role_id, joined_at, profiles!user_id(name), team_roles(name)")
      .eq("team_id", teamId),
  ])
  type RawMember = {
    user_id: string
    role_id: string
    joined_at: string
    profiles: { name: string } | { name: string }[] | null
    team_roles: { name: string } | { name: string }[] | null
  }
  const roles: TeamRole[] = (rolesData ?? []).map((r) => ({ ...r, permissions: Array.isArray(r.permissions) ? r.permissions : [], is_president: !!r.is_president }))
  const members: TeamMemberDisplay[] = (membersData ?? []).map((m: RawMember) => {
    const p = Array.isArray(m.profiles) ? m.profiles[0] : m.profiles
    const r = Array.isArray(m.team_roles) ? m.team_roles[0] : m.team_roles
    return { user_id: m.user_id, name: p?.name ?? "Unknown", role_id: m.role_id, role_name: r?.name ?? "Member", joined_at: m.joined_at }
  })
  return { roles, members }
}

export function TeamDetailOverlay({ team, userId, ministryId, isAdmin, govWrite, onClose, onChanged, onOpenChat }: {
  team: Team
  userId: string
  ministryId: string
  isAdmin: boolean
  // Governance-WRITE to this specific team: the caller is a governance admin AND
  // the team's admin_access matrix grants 'write'. Mirrors the RLS
  // auth_can_manage_team — gov-view (or a non-governing admin) is read-only here.
  govWrite: boolean
  onClose: () => void
  onChanged: () => void
  onOpenChat?: (id: string, name: string, type?: string) => void
}) {
  const supabase = createClient()
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])
  const [roles, setRoles] = useState<TeamRole[]>([])
  const [members, setMembers] = useState<TeamMemberDisplay[]>([])
  const [loading, setLoading] = useState(true)
  const [showAddMember, setShowAddMember] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [ministryMembers, setMinistryMembers] = useState<{ id: string; name: string; email?: string; role?: string }[]>([])
  const [addSearch, setAddSearch] = useState("")
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [defaultRoleId, setDefaultRoleId] = useState<string>("")
  const [memberRoles, setMemberRoles] = useState<Record<string, string>>({})
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [activeRole, setActiveRole] = useState(0)
  const [hoveredMemberId, setHoveredMemberId] = useState<string | null>(null)
  const [confirmRemoveId, setConfirmRemoveId] = useState<string | null>(null)
  const [hoveredRoleId, setHoveredRoleId] = useState<string | null>(null)
  const [confirmDeleteRoleId, setConfirmDeleteRoleId] = useState<string | null>(null)
  const [roleDeleteError, setRoleDeleteError] = useState<string | null>(null)
  const [mobileRevealMemberId, setMobileRevealMemberId] = useState<string | null>(null)
  // Co-presidency — persisted per-team setting (teams.allow_co_presidency)
  const [allowCoPresidency, setAllowCoPresidency] = useState(team.allow_co_presidency)
  const [savingCoPres, setSavingCoPres] = useState(false)
  // Admin governance separation — persisted per-team (teams.allow_admin_members).
  // Off by default: admin-tier users can't be members unless this is enabled.
  const [allowAdminMembers, setAllowAdminMembers] = useState(team.allow_admin_members)
  const [savingAdminMembers, setSavingAdminMembers] = useState(false)
  // "Replace a president?" swap flow — opened when an assignment would exceed max presidents
  const [replaceCtx, setReplaceCtx] = useState<{
    mode: "change" | "add"
    targetName: string
    targetUserId?: string
    rows?: { team_id: string; user_id: string; role_id: string; added_by: string }[]
  } | null>(null)
  const [replacePickId, setReplacePickId] = useState<string | null>(null)
  const [replacing, setReplacing] = useState(false)

  const myRoleId = members.find(m => m.user_id === userId)?.role_id
  const isPresident = roles.some(r => r.id === myRoleId && r.is_president)
  const myRolePerms = roles.find(r => r.id === members.find(m => m.user_id === userId)?.role_id)?.permissions ?? []
  // Matches the RLS auth_can_manage_team exactly: this team's president, OR a
  // member whose role grants can_manage_team, OR a governance admin the matrix
  // grants WRITE on this team. Gov-view opens settings but sees it read-only.
  const canManageTeam = isPresident || myRolePerms.includes("can_manage_team") || govWrite
  // Delete parity with auth_can_manage_team (same three arms as canManageTeam):
  // president, can_manage_team member, or gov-write. UI previously omitted the
  // can_manage arm, hiding the delete button from a member RLS would authorize.
  const canDelete = canManageTeam
  const isTechTeam = /\btech\b/i.test(team.name)
  const canCreateGroupChat = isTechTeam || isAdmin || isPresident

  // President identity & limit (Phase 2a/2b)
  const presidentRole = roles.find(r => r.is_president) ?? null
  const maxPresidents = allowCoPresidency ? 2 : 1
  // Default fallback (non-president) role for demotions — last non-president role, matching the create wizard's defaultMemberRoleIdx.
  const defaultNonPresidentRole = (() => {
    for (let i = roles.length - 1; i >= 0; i--) {
      if (!roles[i].is_president) return roles[i]
    }
    return roles[0] ?? null
  })()
  // Current president members (reflects optimistically-staged role changes already applied to `members`).
  const presidentMembers = members.filter(m => roles.some(r => r.id === m.role_id && r.is_president))

  const [creatingChat, setCreatingChat] = useState(false)
  const [chatCreated, setChatCreated] = useState<{ id: string; name: string } | null>(null)

  async function handleCreateGroupChat() {
    setCreatingChat(true)
    const result = await createTeamChatAction(team.id, team.name, ministryId, userId)
    setCreatingChat(false)
    if (result.error || !result.groupId) { setError(result.error ?? "Failed to create chat."); return }
    setChatCreated({ id: result.groupId, name: team.name })
  }

  // inline team rename
  const [localTeamName, setLocalTeamName] = useState(team.name)
  const [editingTeamName, setEditingTeamName] = useState(false)
  const [teamNameDraft, setTeamNameDraft] = useState("")

  // add role
  const [addingRole, setAddingRole] = useState(false)
  const [newRoleName, setNewRoleName] = useState("")

  // rename role
  const [renamingRoleId, setRenamingRoleId] = useState<string | null>(null)
  const [renamingRoleValue, setRenamingRoleValue] = useState("")

  // Initial roles + members are SWR-cached (key shared on revisit). Because this overlay
  // mutates roles/members optimistically in many places, the SWR data is mirrored into the
  // existing local state via a populate effect rather than consumed directly.
  const { data: tsData, mutate: mutateTeamSettings } = useSWR(
    ["team-settings", team.id] as const,
    fetchTeamSettings,
  )
  useEffect(() => {
    if (!tsData) return
    setRoles(tsData.roles)
    setMembers(tsData.members)
    setLoading(false)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tsData])

  useEffect(() => {
    if (!showAddMember) return
    setSelectedIds(new Set())
    setMemberRoles({})
    setDefaultRoleId(roles[0]?.id ?? "")
    const memberIds = new Set([...members.map((m) => m.user_id)])
    supabase
      .from("profiles")
      .select("id, name, email, role")
      .eq("ministry_id", ministryId)
      .order("name")
      .then(({ data }) => {
        const seen = new Set<string>()
        setMinistryMembers(
          (data ?? []).filter((m) => {
            if (memberIds.has(m.id) || seen.has(m.id)) return false
            seen.add(m.id)
            return true
          })
        )
      })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showAddMember, members.length])

  async function handleDeleteTeam() {
    await supabase.from("teams").delete().eq("id", team.id).eq("ministry_id", ministryId)
    onChanged()
    onClose()
  }

  async function handleAddMembers() {
    if (selectedIds.size === 0) return
    if (!defaultRoleId && roles.length > 0) { setError("Select a role before adding."); return }
    let addIds = Array.from(selectedIds)
    // Belt-and-suspenders behind the picker filter: never insert admin-tier members
    // unless this team allows it. Drop them and surface a brief inline message.
    if (!allowAdminMembers) {
      const blocked = addIds.filter((uid) => isAdminTierRole(ministryMembers.find((m) => m.id === uid)?.role))
      if (blocked.length > 0) {
        addIds = addIds.filter((uid) => !blocked.includes(uid))
        setSelectedIds(new Set(addIds))
        setMemberRoles((prev) => { const r = { ...prev }; blocked.forEach((id) => delete r[id]); return r })
        setError("Admins can't be added as members of this team — enable it in team settings.")
        if (addIds.length === 0) return
      }
    }
    const rows = addIds.map((uid) => ({
      team_id: team.id,
      user_id: uid,
      role_id: memberRoles[uid] ?? defaultRoleId,
      added_by: userId,
    }))
    // President overflow guard — if adding these would exceed the max, route into the Replace flow.
    const presidentTargets = rows.filter(r => roles.some(role => role.id === r.role_id && role.is_president))
    if (presidentTargets.length > 0 && presidentMembers.length + presidentTargets.length > maxPresidents) {
      const targetName = presidentTargets
        .map(r => ministryMembers.find(mm => mm.id === r.user_id)?.name ?? "New member")
        .join(" & ")
      setReplacePickId(presidentMembers.length === 1 ? presidentMembers[0].user_id : null)
      setReplaceCtx({ mode: "add", targetName, rows })
      return
    }
    await commitAddMembers(rows)
  }

  async function commitAddMembers(rows: { team_id: string; user_id: string; role_id: string; added_by: string }[]) {
    setSaving(true)
    setError(null)
    const { error: err } = await supabase.from("team_members").insert(rows)
    if (err) { setError(err.message); setSaving(false); return }

    // Elevate newly added members to "leader" for DGL and Board teams
    const allTeamPerms = roles.flatMap(r => r.permissions)
    const isLeaderTeam = allTeamPerms.includes("can_create_dgs") || allTeamPerms.includes("can_view_dgs") ||
      (allTeamPerms.includes("can_view_finances") && allTeamPerms.includes("can_manage_members"))
    if (isLeaderTeam) {
      await elevateToLeader(rows.map(r => r.user_id), ministryId)
    }

    // Revalidate the cached settings (re-populates members via the SWR effect) and return to
    // settings — do NOT call onChanged() which closes settings.
    await mutateTeamSettings()
    setShowAddMember(false)
    setSelectedIds(new Set())
    setMemberRoles({})
    setAddSearch("")
    setSaving(false)
  }

  async function handleRemoveMember(memberId: string) {
    await supabase.from("team_members").delete().eq("team_id", team.id).eq("user_id", memberId)
    setMembers((prev) => prev.filter((m) => m.user_id !== memberId))
    // Keep the ["team-settings", team.id] SWR cache fresh so the removed member can't
    // briefly reappear via the populate effect on reopen. Optimistically drop them from
    // the cached payload (no revalidation needed — the DB delete already succeeded).
    mutateTeamSettings(
      (cur) => cur ? { ...cur, members: cur.members.filter((m) => m.user_id !== memberId) } : cur,
      { revalidate: false },
    )
    setConfirmRemoveId(null)
  }

  async function handleChangeRole(memberId: string, newRoleId: string) {
    const newRole = roles.find(r => r.id === newRoleId)
    // President overflow guard — promoting past the max routes into the Replace flow.
    if (newRole?.is_president) {
      const others = presidentMembers.filter(m => m.user_id !== memberId)
      if (others.length >= maxPresidents) {
        const target = members.find(m => m.user_id === memberId)
        setReplacePickId(others.length === 1 ? others[0].user_id : null)
        setReplaceCtx({ mode: "change", targetName: target?.name ?? "this member", targetUserId: memberId })
        return // controlled <select> reverts to the prior role since `members` is untouched
      }
    }
    // Autosave: optimistic update + immediate write.
    const snapshot = members
    setMembers(prev => prev.map(m => m.user_id === memberId ? { ...m, role_id: newRoleId, role_name: newRole?.name ?? m.role_name } : m))
    const { error: err } = await supabase.from("team_members").update({ role_id: newRoleId }).eq("team_id", team.id).eq("user_id", memberId)
    if (err) { setMembers(snapshot); setError(err.message) }
  }

  // Confirm the president swap: demote the outgoing president to the default non-president role and promote the target.
  async function confirmReplace() {
    if (!replaceCtx || !presidentRole || !defaultNonPresidentRole) return
    const outgoing = replacePickId ?? presidentMembers[0]?.user_id
    if (!outgoing) return

    if (replaceCtx.mode === "change" && replaceCtx.targetUserId) {
      // Autosave: demote the outgoing president and promote the target immediately.
      const targetUserId = replaceCtx.targetUserId
      setReplacing(true)
      setError(null)
      const snapshot = members
      setMembers(prev => prev.map(m => {
        if (m.user_id === outgoing) return { ...m, role_id: defaultNonPresidentRole.id, role_name: defaultNonPresidentRole.name }
        if (m.user_id === targetUserId) return { ...m, role_id: presidentRole.id, role_name: presidentRole.name }
        return m
      }))
      const { error: demoteErr } = await supabase.from("team_members").update({ role_id: defaultNonPresidentRole.id }).eq("team_id", team.id).eq("user_id", outgoing)
      const { error: promoteErr } = await supabase.from("team_members").update({ role_id: presidentRole.id }).eq("team_id", team.id).eq("user_id", targetUserId)
      if (demoteErr || promoteErr) { setMembers(snapshot); setError((demoteErr ?? promoteErr)!.message) }
      setReplacing(false)
      setReplaceCtx(null)
      setReplacePickId(null)
      return
    }

    // Add mode — writes are immediate, matching handleAddMembers.
    setReplacing(true)
    setError(null)
    const snapshot = members
    // Optimistic demote of the outgoing president.
    setMembers(prev => prev.map(m => m.user_id === outgoing ? { ...m, role_id: defaultNonPresidentRole.id, role_name: defaultNonPresidentRole.name } : m))
    const { error: demoteErr } = await supabase
      .from("team_members")
      .update({ role_id: defaultNonPresidentRole.id })
      .eq("team_id", team.id)
      .eq("user_id", outgoing)
    if (demoteErr) {
      setMembers(snapshot)
      setError(demoteErr.message)
      setReplacing(false)
      return
    }
    // Insert the selected members (the new president keeps the president role).
    await commitAddMembers(replaceCtx.rows ?? [])
    setReplacing(false)
    setReplaceCtx(null)
    setReplacePickId(null)
  }

  async function handleRenameTeam() {
    const val = teamNameDraft.trim()
    if (!val || val === localTeamName) { setEditingTeamName(false); return }
    await supabase.from("teams").update({ name: val }).eq("id", team.id).eq("ministry_id", ministryId)
    setLocalTeamName(val)
    setEditingTeamName(false)
  }

  async function handleToggleCoPresidency(next: boolean) {
    setAllowCoPresidency(next)
    setSavingCoPres(true)
    const { error: err } = await supabase
      .from("teams")
      .update({ allow_co_presidency: next })
      .eq("id", team.id)
      .eq("ministry_id", ministryId)
    if (err) { setAllowCoPresidency(!next); setError(err.message) }
    setSavingCoPres(false)
  }

  async function handleToggleAdminMembers(next: boolean) {
    setAllowAdminMembers(next)
    setSavingAdminMembers(true)
    const { error: err } = await supabase
      .from("teams")
      .update({ allow_admin_members: next })
      .eq("id", team.id)
      .eq("ministry_id", ministryId)
    if (err) { setAllowAdminMembers(!next); setError(err.message) }
    setSavingAdminMembers(false)
  }

  async function handleDeleteRole(roleId: string) {
    // Autosave: null out members holding this role, then delete the role immediately.
    await supabase.from("team_members").update({ role_id: null }).eq("role_id", roleId).eq("team_id", team.id)
    const { error: err } = await supabase.from("team_roles").delete().eq("id", roleId)
    if (err) { setRoleDeleteError(err.message); return }
    setRoles(prev => {
      const next = prev.filter(r => r.id !== roleId)
      setActiveRole(cur => Math.min(cur, Math.max(0, next.length - 1)))
      return next
    })
    setMembers(prev => prev.map(m => m.role_id === roleId ? { ...m, role_id: "", role_name: "No role" } : m))
    setConfirmDeleteRoleId(null)
    setRoleDeleteError(null)
  }

  async function handleAddRole() {
    const val = newRoleName.trim()
    if (!val) { setAddingRole(false); return }
    setAddingRole(false)
    setNewRoleName("")
    // Autosave: insert immediately and adopt the real row.
    const { data, error: err } = await supabase.from("team_roles")
      .insert({ team_id: team.id, name: val, permissions: [] })
      .select("id, team_id, name, permissions, is_president").single()
    if (err || !data) { setError(err?.message ?? "Failed to add role."); return }
    const newRole: TeamRole = { ...data, permissions: Array.isArray(data.permissions) ? data.permissions : [], is_president: !!data.is_president }
    setRoles(prev => { const next = [...prev, newRole]; setActiveRole(next.length - 1); return next })
  }

  async function handleRenameRole(roleId: string) {
    const val = renamingRoleValue.trim()
    if (!val) { setRenamingRoleId(null); return }
    await supabase.from("team_roles").update({ name: val }).eq("id", roleId)
    setRoles(prev => prev.map(r => r.id === roleId ? { ...r, name: val } : r))
    setRenamingRoleId(null)
  }

  const visiblePerms = getVisiblePermissions(team.name)

  // Autosave: toggling a permission writes to the role immediately (optimistic + persist).
  async function togglePermission(perm: string) {
    if (!canManageTeam) return
    const role = roles[activeRole]
    if (!role) return
    const nextPerms = role.permissions.includes(perm)
      ? role.permissions.filter(p => p !== perm)
      : [...role.permissions, perm]
    setRoles(prev => prev.map(r => r.id === role.id ? { ...r, permissions: nextPerms } : r))
    const { error: err } = await supabase.from("team_roles").update({ permissions: nextPerms }).eq("id", role.id)
    if (err) {
      setRoles(prev => prev.map(r => r.id === role.id ? { ...r, permissions: role.permissions } : r))
      setError(err.message)
    }
  }

  const filteredAdd = ministryMembers.filter((m) =>
    m.name.toLowerCase().includes(addSearch.toLowerCase()) &&
    // Governance separation: hide admin-tier candidates unless the team allows admin members.
    (allowAdminMembers || !isAdminTierRole(m.role))
  )

  const addMemberForm = (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      {/* Default role picker */}
      {roles.length > 0 && (
        <div>
          <p style={{ ...EYEBROW_STYLE, fontWeight: 400, marginBottom: 6 }}>Default role</p>
          <p style={{ fontSize: 12, color: "var(--faint)", marginBottom: 10 }}>Pre-fills for all selections — change individually below.</p>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" as const }}>
            {roles.map((r) => (
              <button
                key={r.id}
                onClick={() => setDefaultRoleId(r.id)}
                style={{
                  padding: "7px 14px", borderRadius: 999, fontSize: 13,
                  border: `1px solid ${defaultRoleId === r.id ? "var(--plum-2)" : "var(--line-2)"}`,
                  background: defaultRoleId === r.id ? "var(--plum-2)" : "var(--cream-panel)",
                  color: defaultRoleId === r.id ? "var(--cream-panel)" : "var(--body)",
                  cursor: "pointer", transition: "all 0.12s",
                }}
              >
                {r.name}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Search bar */}
      <div style={{ position: "relative" }}>
        <Search style={{ position: "absolute", left: 14, top: "50%", transform: "translateY(-50%)", width: 15, height: 15, color: "var(--muted-text)", pointerEvents: "none" }} />
        <input
          type="text"
          value={addSearch}
          onChange={(e) => setAddSearch(e.target.value)}
          placeholder="Search members…"
          style={{ width: "100%", padding: "12px 14px 12px 44px", border: "1px solid var(--line-2)", borderRadius: 10, background: "var(--cream-panel)", fontSize: 15, color: "var(--ink)", outline: "none", boxSizing: "border-box" as const }}
        />
      </div>

      {/* Member list */}
      <div>
        {filteredAdd.length === 0 ? (
          <div style={{ border: "1px dashed var(--dashed)", borderRadius: 12, padding: "32px 24px", textAlign: "center" as const }}>
            <p style={{ fontSize: 13, color: "var(--muted-text)", margin: 0 }}>No members to add.</p>
          </div>
        ) : (
          <div>
            {filteredAdd.map((member, i) => {
              const selected = selectedIds.has(member.id)
              const isLast = i === filteredAdd.length - 1
              return (
                <button
                  key={member.id}
                  onClick={() => {
                    const wasSelected = selectedIds.has(member.id)
                    setSelectedIds((prev) => {
                      const next = new Set(prev)
                      if (wasSelected) next.delete(member.id)
                      else next.add(member.id)
                      return next
                    })
                    if (wasSelected) {
                      setMemberRoles((prev) => { const r = { ...prev }; delete r[member.id]; return r })
                    } else {
                      setMemberRoles((prev) => ({ ...prev, [member.id]: defaultRoleId }))
                    }
                  }}
                  style={{
                    display: "flex", alignItems: "center", gap: 14, width: "100%",
                    padding: selected && roles.length > 1 ? "12px 0" : "14px 0",
                    borderTop: "none", borderLeft: "none", borderRight: "none",
                    borderBottom: isLast ? "none" : "1px solid var(--line-3)",
                    background: selected ? "var(--ivory)" : "transparent",
                    cursor: "pointer", textAlign: "left" as const,
                    transition: "background 0.12s",
                  }}
                >
                  <MonogramChip initials={getInitials(member.name)} className="w-9 h-9 text-[13px] font-semibold" />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ fontSize: 14, color: "var(--ink)", fontWeight: 500, lineHeight: 1.3, margin: 0 }}>{member.name}</p>
                    {selected && roles.length > 1 ? (
                      <select
                        value={memberRoles[member.id] ?? defaultRoleId}
                        onChange={(e) => {
                          e.stopPropagation()
                          setMemberRoles((prev) => ({ ...prev, [member.id]: e.target.value }))
                        }}
                        onClick={(e) => e.stopPropagation()}
                        style={{
                          marginTop: 5, fontSize: 12, padding: "4px 8px",
                          border: "1px solid #C9C0B0", borderRadius: 6,
                          background: "var(--cream-panel)", color: "var(--ink)", cursor: "pointer",
                          outline: "none", maxWidth: "100%",
                        }}
                      >
                        {roles.map((r) => (
                          <option key={r.id} value={r.id}>{r.name}</option>
                        ))}
                      </select>
                    ) : (
                      member.email && <p style={{ fontSize: 12, color: "var(--muted-text)", marginTop: 2, marginBottom: 0 }}>{member.email}</p>
                    )}
                  </div>
                  {selected && (
                    <div style={{
                      width: 20, height: 20, borderRadius: 5, background: "var(--plum)", flexShrink: 0,
                      display: "flex", alignItems: "center", justifyContent: "center",
                    }}>
                      <Check style={{ width: 11, height: 11, color: "var(--cream-panel)" }} />
                    </div>
                  )}
                </button>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )

  return (
    <SubpageShell title="Settings" crumbs={[{ label: localTeamName, onClick: onClose }, { label: "Settings" }]} width="full">

      {/* ── Mobile header — SubpageShell's `title` is desktop-only, so mobile keeps a
          self-contained header (team icon + name + inline actions). The mobile back
          row ("← {team}") is rendered by SubpageShell, so no ArrowLeft here. ── */}
      <div className="md:hidden flex items-center justify-between mb-5" style={{ paddingBottom: 14, borderBottom: "1px solid var(--line)" }}>
        {showAddMember ? (
          <button onClick={() => { setShowAddMember(false); setError(null) }} style={{ display: "flex", alignItems: "center", gap: 6, height: 34, padding: "0 14px", background: "transparent", border: "1px solid var(--line)", borderRadius: "var(--r-chip)", color: "var(--muted-text)", fontSize: 13, cursor: "pointer" }}>
            <ArrowLeft style={{ width: 13, height: 13 }} /> Back to settings
          </button>
        ) : (
          <>
            <div className="flex items-center gap-2">
              <PlanLineIcon iconKey={team.icon ?? "users"} size={22} bg="var(--plum)" fg="var(--cream)" />
              <span className="text-[14px] font-semibold text-[var(--ink)]">{localTeamName}</span>
            </div>
            <div className="flex items-center gap-2">
              {canCreateGroupChat && (chatCreated ? (
                <CentralButton
                  variant="primary" size="sm"
                  onClick={() => { onOpenChat?.(chatCreated.id, chatCreated.name); onClose() }}
                  style={{ height: 36 }}
                >
                  <MessageCircle className="w-3.5 h-3.5" /> Open chat
                </CentralButton>
              ) : (
                <button
                  onClick={handleCreateGroupChat}
                  disabled={creatingChat}
                  className="size-9 flex items-center justify-center rounded-full hover:bg-[var(--body-bg)] transition-colors"
                  style={{ border: "none", background: "transparent", cursor: creatingChat ? "not-allowed" : "pointer", opacity: creatingChat ? 0.5 : 1 }}
                >
                  <MessageCircle className="w-4 h-4 text-[var(--muted-text)]" />
                </button>
              ))}
              {canDelete && (
                <button onClick={() => setConfirmDelete(true)} className="size-9 flex items-center justify-center rounded-full hover:bg-[#FDF0F0] transition-colors">
                  <Trash2 className="w-4 h-4 text-[var(--muted-text)]" />
                </button>
              )}
            </div>
          </>
        )}
      </div>

      {error && (
        <div className="rounded-xl px-4 py-3 mb-4 text-[13px] text-[var(--plum)] font-medium" style={{ background: "color-mix(in srgb, var(--plum) 8%, transparent)" }}>{error}</div>
      )}

      {/* ── Mobile content ── */}
      <div className="md:hidden">
          {!showAddMember && (
            <>
              {loading ? <Spinner /> : (
                <div className="flex flex-col gap-6">
                  <div>
                    <PlanSectionHeader>Roles</PlanSectionHeader>
                    <div className="flex flex-col gap-2">
                      {roles.length === 0 && (
                        <p className="text-[13px] text-[var(--muted-text)] text-center py-4">No roles defined.</p>
                      )}
                      {roles.map((role) => (
                        <div key={role.id} className="bg-[var(--cream)] rounded-2xl border border-[var(--line)] p-4">
                          <p className="text-[14px] font-semibold text-[var(--ink)] mb-2">{role.name}</p>
                          {role.permissions.length > 0 ? (
                            <div className="flex flex-wrap gap-1.5">
                              {role.permissions.map((p) => (
                                <span key={p} className="text-[11px] bg-[var(--ivory)] border border-[var(--line)] text-[var(--body)] px-2 py-0.5 rounded-full">
                                  {PERMISSION_LABELS[p] ?? p}
                                </span>
                              ))}
                            </div>
                          ) : (
                            <p className="text-[12px] text-[var(--muted-text)]">No permissions assigned</p>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                  {canManageTeam && (
                    <div>
                      <PlanSectionHeader>Leadership</PlanSectionHeader>
                      <div className="bg-[var(--cream)] rounded-2xl border border-[var(--line)] p-4 flex flex-col gap-4">
                        <GgToggle
                          checked={allowCoPresidency}
                          onChange={handleToggleCoPresidency}
                          disabled={savingCoPres}
                          label="Co-presidency"
                          desc="Allow this team to have two presidents instead of one."
                        />
                        <div className="h-px bg-[var(--line)]" />
                        <GgToggle
                          checked={allowAdminMembers}
                          onChange={handleToggleAdminMembers}
                          disabled={savingAdminMembers}
                          label="Allow admins as members"
                          desc="By default admins govern teams without being members. Enable this to let an admin also be a member."
                        />
                      </div>
                    </div>
                  )}
                  <div>
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-3 flex-1 mr-3">
                        <span style={{ fontFamily: "var(--font-instrument-serif)", fontSize: "22px", fontWeight: 400, color: "var(--ink)", letterSpacing: "-0.01em" }}>Members</span>
                        <div className="flex-1 h-px bg-[var(--line)]" />
                      </div>
                      {canManageTeam && (
                        <button onClick={() => setShowAddMember(true)} className="text-[12px] font-semibold text-[var(--plum)] hover:opacity-70 flex-shrink-0">
                          + Add
                        </button>
                      )}
                    </div>
                    <div className="flex flex-col gap-1.5">
                      {members.length === 0 && <p className="text-[13px] text-[var(--muted-text)] text-center py-4">No one&apos;s here yet.</p>}
                      {members.map((m, i) => {
                        const isConfirming = confirmRemoveId === m.user_id
                        const isRevealed = mobileRevealMemberId === m.user_id
                        return (
                          <div key={m.user_id} className="flex items-center gap-3 rounded-xl border border-[var(--line)] p-3"
                            style={{ background: isConfirming ? "#FDF0F0" : "var(--cream)", transition: "background 0.1s" }}
                            onClick={() => { if (canManageTeam && m.user_id !== userId && !isConfirming) setMobileRevealMemberId(id => id === m.user_id ? null : m.user_id) }}
                          >
                            <MonogramChip initials={getInitials(m.name)} className="w-8 h-8 text-[12px] font-semibold" />
                            <div className="flex-1 min-w-0">
                              <p className="text-[14px] font-medium text-[var(--ink)] truncate">{m.name}</p>
                              {canManageTeam && roles.length > 1 && m.user_id !== userId ? (
                                <select
                                  value={m.role_id}
                                  onChange={e => { e.stopPropagation(); handleChangeRole(m.user_id, e.target.value) }}
                                  onClick={e => e.stopPropagation()}
                                  style={{ fontSize: 12, color: "var(--body)", border: "none", background: "transparent", cursor: "pointer", outline: "none", padding: 0, marginTop: 1 }}
                                >
                                  {roles.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
                                </select>
                              ) : (
                                <p className="text-[12px] text-[var(--muted-text)]">{m.role_name}</p>
                              )}
                            </div>
                            {canManageTeam && m.user_id !== userId && (
                              isConfirming ? (
                                <div style={{ display: "flex", alignItems: "center", gap: 16, flexShrink: 0 }}>
                                  <button onClick={e => { e.stopPropagation(); handleRemoveMember(m.user_id) }} style={{ width: 28, height: 28, borderRadius: 6, border: "none", background: "none", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", padding: 0, color: "var(--danger)" }}><Check className="w-4 h-4" /></button>
                                  <button onClick={e => { e.stopPropagation(); setConfirmRemoveId(null) }} style={{ width: 28, height: 28, borderRadius: 6, border: "none", background: "none", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", padding: 0, color: "var(--muted-text)" }}><X className="w-4 h-4" /></button>
                                </div>
                              ) : (
                                <button
                                  onClick={e => { e.stopPropagation(); setConfirmRemoveId(m.user_id); setMobileRevealMemberId(null) }}
                                  style={{ display: "flex", alignItems: "center", justifyContent: "center", background: "none", border: "none", cursor: "pointer", padding: 2, flexShrink: 0, color: "var(--muted-text)", opacity: isRevealed ? 1 : 0, transition: "opacity 0.15s", pointerEvents: isRevealed ? "auto" : "none" }}
                                >
                                  <X style={{ width: 14, height: 14 }} />
                                </button>
                              )
                            )}
                          </div>
                        )
                      })}
                    </div>
                  </div>
                </div>
              )}
            </>
          )}
          {showAddMember && addMemberForm}
        </div>

        {/* ── Desktop content ── */}
        {!showAddMember ? (
          <div className="hidden md:block" style={{ paddingTop: 28 }}>
            {loading ? <Spinner /> : (
              <>
                {/* Hero strip — team identity + inline rename (page title "Settings"
                    is supplied by SubpageShell, so this name stays ≤ PageTitle scale). */}
                <div style={{ display: "flex", alignItems: "center", gap: 18, marginBottom: 32 }}>
                  <PlanLineIcon iconKey={team.icon ?? "users"} size={52} bg="var(--plum)" fg="var(--cream)" />
                  <div style={{ flex: 1 }}>
                    <p style={{ fontSize: 11, letterSpacing: "0.14em", textTransform: "uppercase", color: "var(--muted-text)", marginBottom: 4 }}>Team settings</p>
                    {editingTeamName ? (
                      <input
                        autoFocus
                        value={teamNameDraft}
                        onChange={e => setTeamNameDraft(e.target.value)}
                        onKeyDown={e => { if (e.key === "Enter") handleRenameTeam(); if (e.key === "Escape") setEditingTeamName(false) }}
                        onBlur={handleRenameTeam}
                        style={{ fontFamily: "var(--font-instrument-serif)", fontSize: 25, color: "var(--ink)", lineHeight: 1.1, background: "transparent", border: "none", borderBottom: "1px solid var(--line-2)", outline: "none", padding: 0 }}
                      />
                    ) : (
                      <div
                        className="group flex items-center gap-2"
                        style={{ cursor: canManageTeam ? "text" : "default" }}
                        onClick={canManageTeam ? () => { setTeamNameDraft(localTeamName); setEditingTeamName(true) } : undefined}
                      >
                        <p style={{ fontFamily: "var(--font-instrument-serif)", fontSize: 25, color: "var(--ink)", lineHeight: 1.1 }}>{localTeamName}</p>
                        {canManageTeam && <Pencil className="opacity-0 group-hover:opacity-100 transition-opacity duration-150" style={{ width: 13, height: 13, color: "var(--muted-text)", flexShrink: 0, marginTop: 6 }} />}
                      </div>
                    )}
                    <p style={{ color: "var(--body)", fontSize: 14, marginTop: 6 }}>
                      {members.length} {members.length === 1 ? "member" : "members"} · {roles.length} {roles.length === 1 ? "role" : "roles"}
                    </p>
                  </div>
                </div>

                {/* Roles & permissions */}
                <p style={{ fontSize: 11, letterSpacing: "0.14em", textTransform: "uppercase", color: "var(--muted-text)", marginBottom: 12 }}>Roles & permissions</p>
                <div style={{ background: "var(--cream)", border: "1px solid var(--line)", borderRadius: 16, overflow: "hidden", marginBottom: 28 }}>
                  {roles.length === 0 ? (
                    <p style={{ padding: "24px", textAlign: "center", color: "var(--muted-text)", fontSize: 13 }}>No roles defined.</p>
                  ) : (
                    <div style={{ display: "grid", gridTemplateColumns: "260px 1fr" }}>
                      {/* Role left nav */}
                      <div style={{ borderRight: "1px solid var(--line)", background: "var(--ivory)" }}>
                        {roles.map((role, i) => {
                          const roleCount = members.filter(m => m.role_id === role.id).length
                          const isRoleConfirming = confirmDeleteRoleId === role.id
                          return (
                            <div
                              key={role.id}
                              onClick={() => { if (!isRoleConfirming) setActiveRole(i) }}
                              onMouseEnter={() => setHoveredRoleId(role.id)}
                              onMouseLeave={() => setHoveredRoleId(null)}
                              style={{
                                padding: "16px 20px",
                                borderBottom: i < roles.length - 1 ? "1px solid var(--line)" : "none",
                                borderLeft: activeRole === i ? "2px solid var(--plum)" : "2px solid transparent",
                                background: isRoleConfirming ? "#FDF0F0" : (activeRole === i ? "var(--cream)" : "transparent"),
                                cursor: isRoleConfirming ? "default" : "pointer",
                                transition: "background 0.1s",
                              }}
                            >
                              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                                <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
                                  <span style={{ fontFamily: "var(--font-instrument-serif)", fontSize: 19, color: "var(--ink)" }}>{role.name}</span>
                                </div>
                                <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                                  {!isRoleConfirming && (
                                    <span style={{ fontSize: 11.5, color: "var(--muted-text)" }}>{roleCount} {roleCount === 1 ? "person" : "people"}</span>
                                  )}
                                  {canManageTeam && (
                                    isRoleConfirming ? (
                                      roleDeleteError ? (
                                        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                                          <span style={{ fontSize: 11, color: "var(--danger)", maxWidth: 100 }}>{roleDeleteError}</span>
                                          <button
                                            onClick={e => { e.stopPropagation(); setConfirmDeleteRoleId(null); setRoleDeleteError(null) }}
                                            style={{ width: 22, height: 22, borderRadius: 4, border: "none", background: "none", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", padding: 0, color: "var(--muted-text)", flexShrink: 0 }}
                                          >
                                            <X style={{ width: 12, height: 12 }} />
                                          </button>
                                        </div>
                                      ) : (
                                        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                                          <button
                                            onClick={e => { e.stopPropagation(); handleDeleteRole(role.id) }}
                                            style={{ width: 28, height: 28, borderRadius: 6, border: "none", background: "none", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", padding: 0, color: "var(--danger)" }}
                                          >
                                            <Check className="w-4 h-4" />
                                          </button>
                                          <button
                                            onClick={e => { e.stopPropagation(); setConfirmDeleteRoleId(null) }}
                                            style={{ width: 28, height: 28, borderRadius: 6, border: "none", background: "none", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", padding: 0, color: "var(--muted-text)" }}
                                          >
                                            <X className="w-4 h-4" />
                                          </button>
                                        </div>
                                      )
                                    ) : (
                                      <button
                                        onClick={e => { e.stopPropagation(); setConfirmDeleteRoleId(role.id) }}
                                        style={{ display: "flex", alignItems: "center", justifyContent: "center", background: "none", border: "none", cursor: "pointer", padding: 2, color: "var(--muted-text)", opacity: hoveredRoleId === role.id ? 1 : 0, transition: "opacity 0.15s", pointerEvents: hoveredRoleId === role.id ? "auto" : "none" }}
                                      >
                                        <X style={{ width: 14, height: 14 }} />
                                      </button>
                                    )
                                  )}
                                </div>
                              </div>
                            </div>
                          )
                        })}
                        {canManageTeam && (
                          addingRole ? (
                            <div style={{ padding: "10px 20px", borderTop: roles.length > 0 ? "1px solid var(--line)" : "none" }}>
                              <input
                                autoFocus
                                value={newRoleName}
                                onChange={e => setNewRoleName(e.target.value)}
                                onKeyDown={e => { if (e.key === "Enter") handleAddRole(); if (e.key === "Escape") { setAddingRole(false); setNewRoleName("") } }}
                                onBlur={() => { if (!newRoleName.trim()) { setAddingRole(false); setNewRoleName("") } }}
                                placeholder="Role name"
                                style={{ width: "100%", fontSize: 14, background: "transparent", border: "none", borderBottom: "1px solid var(--plum)", outline: "none", padding: "2px 0", color: "var(--ink)" }}
                              />
                            </div>
                          ) : (
                            <div
                              onClick={() => { setAddingRole(true); setNewRoleName("") }}
                              style={{ padding: "13px 20px", color: "var(--plum)", fontSize: 13.5, display: "flex", alignItems: "center", gap: 8, cursor: "pointer", borderTop: roles.length > 0 ? "1px solid var(--line)" : "none" }}
                            >
                              <Plus style={{ width: 14, height: 14 }} /> Add role
                            </div>
                          )
                        )}
                      </div>

                      {/* Permission grid */}
                      <div style={{ padding: "20px 24px" }}>
                        {roles[activeRole] && (
                          <>
                            <div style={{ marginBottom: 16 }}>
                              {renamingRoleId === roles[activeRole].id ? (
                                <input
                                  autoFocus
                                  value={renamingRoleValue}
                                  onChange={e => setRenamingRoleValue(e.target.value)}
                                  onKeyDown={e => { if (e.key === "Enter") handleRenameRole(roles[activeRole].id); if (e.key === "Escape") setRenamingRoleId(null) }}
                                  onBlur={() => handleRenameRole(roles[activeRole].id)}
                                  style={{ fontFamily: "var(--font-instrument-serif)", fontSize: 26, color: "var(--ink)", background: "transparent", border: "none", borderBottom: "1px solid var(--line-2)", outline: "none", padding: 0 }}
                                />
                              ) : (
                                <div
                                  className="group flex items-center gap-1.5"
                                  style={{ cursor: canManageTeam ? "text" : "default" }}
                                  onClick={canManageTeam ? () => { setRenamingRoleId(roles[activeRole].id); setRenamingRoleValue(roles[activeRole].name) } : undefined}
                                >
                                  <p style={{ fontFamily: "var(--font-instrument-serif)", fontSize: 26, color: "var(--ink)" }}>{roles[activeRole].name}</p>
                                  {canManageTeam && <Pencil className="opacity-0 group-hover:opacity-100 transition-opacity duration-150" style={{ width: 13, height: 13, color: "var(--muted-text)", flexShrink: 0 }} />}
                                </div>
                              )}
                              <p style={{ fontSize: 12.5, color: "var(--muted-text)", marginTop: 2 }}>
                                {roles[activeRole].permissions.filter(p => visiblePerms.includes(p)).length} of {visiblePerms.length} permissions enabled
                              </p>
                            </div>
                            <div style={{ display: "flex", flexDirection: "column" }}>
                              {visiblePerms.map((perm, pi) => {
                                const on = roles[activeRole].permissions.includes(perm)
                                return (
                                  <div
                                    key={perm}
                                    onClick={() => togglePermission(perm)}
                                    style={{ display: "flex", alignItems: "center", gap: 14, padding: "13px 0", borderBottom: pi < visiblePerms.length - 1 ? "1px solid var(--line)" : "none", cursor: canManageTeam ? "pointer" : "default" }}
                                  >
                                    <p style={{ flex: 1, fontSize: 14, color: "var(--ink)", fontWeight: 500 }}>{PERMISSION_LABELS[perm]}</p>
                                    <div style={{ width: 38, height: 22, borderRadius: 999, background: on ? "var(--plum)" : "var(--line)", position: "relative", flexShrink: 0, transition: "background 0.15s" }}>
                                      <div style={{ position: "absolute", top: 3, left: on ? 19 : 3, width: 16, height: 16, borderRadius: 999, background: "var(--cream)", transition: "left 0.15s" }} />
                                    </div>
                                  </div>
                                )
                              })}
                            </div>
                          </>
                        )}
                      </div>
                    </div>
                  )}
                </div>

                {/* Co-presidency */}
                {canManageTeam && (
                  <>
                    <p style={{ fontSize: 11, letterSpacing: "0.14em", textTransform: "uppercase", color: "var(--muted-text)", marginBottom: 12 }}>Leadership</p>
                    <div style={{ background: "var(--cream)", border: "1px solid var(--line)", borderRadius: 16, padding: "18px 22px", marginBottom: 28, display: "flex", flexDirection: "column", gap: 16 }}>
                      <GgToggle
                        checked={allowCoPresidency}
                        onChange={handleToggleCoPresidency}
                        disabled={savingCoPres}
                        label="Co-presidency"
                        desc="Allow this team to have two presidents instead of one."
                      />
                      <div style={{ height: 1, background: "var(--line)" }} />
                      <GgToggle
                        checked={allowAdminMembers}
                        onChange={handleToggleAdminMembers}
                        disabled={savingAdminMembers}
                        label="Allow admins as members"
                        desc="By default admins govern teams without being members. Enable this to let an admin also be a member."
                      />
                    </div>
                  </>
                )}

                {/* Members roster — Create-chat lives in the ContentHeader action slot
                    (canonical body-action location, §3.2), alongside Add member. */}
                <div style={{ marginBottom: 12 }}>
                  <ContentHeader
                    label="Members"
                    action={
                      <>
                        {canCreateGroupChat && (chatCreated ? (
                          <ContentActionButton variant="ghost" icon={<MessageCircle style={{ width: 14, height: 14 }} />} label="Open chat" onClick={() => { onOpenChat?.(chatCreated.id, chatCreated.name); onClose() }} />
                        ) : (
                          <ContentActionButton variant="ghost" icon={<MessageCircle style={{ width: 14, height: 14 }} />} label={creatingChat ? "Creating…" : "Group chat"} onClick={handleCreateGroupChat} disabled={creatingChat} />
                        ))}
                        {canManageTeam && (
                          <ContentActionButton variant="ghost" icon={<Plus style={{ width: 14, height: 14 }} />} label="Add member" onClick={() => setShowAddMember(true)} />
                        )}
                      </>
                    }
                  />
                </div>
                <div style={{ background: "var(--cream)", border: "1px solid var(--line)", borderRadius: 16, overflow: "hidden" }}>
                  <div style={{ display: "grid", gridTemplateColumns: "44px 1.5fr 1fr 120px", padding: "10px 22px", borderBottom: "1px solid var(--line)", color: "var(--muted-text)", fontSize: 11, letterSpacing: "0.14em", textTransform: "uppercase" }}>
                    <span />
                    <span>Name</span>
                    <span>Role</span>
                    <span />
                  </div>
                  {members.length === 0 && (
                    <p style={{ padding: "24px", textAlign: "center", color: "var(--muted-text)", fontSize: 13 }}>No one&apos;s here yet.</p>
                  )}
                  {members.map((m, i) => {
                    const isConfirming = confirmRemoveId === m.user_id
                    const isHovered = hoveredMemberId === m.user_id
                    return (
                      <div
                        key={m.user_id}
                        onMouseEnter={() => setHoveredMemberId(m.user_id)}
                        onMouseLeave={() => setHoveredMemberId(null)}
                        style={{
                          display: "grid", gridTemplateColumns: "44px 1.5fr 1fr 120px",
                          alignItems: "center", padding: "13px 22px",
                          borderBottom: i < members.length - 1 ? "1px solid var(--line)" : "none",
                          background: isConfirming ? "#FDF0F0" : "transparent",
                          transition: "background 0.1s",
                        }}
                      >
                        <MonogramChip initials={getInitials(m.name)} className="w-8 h-8 text-[12px] font-semibold" />
                        <span style={{ fontSize: 13.5, color: "var(--ink)", fontWeight: 500 }}>{m.name}</span>
                        {canManageTeam && roles.length > 1 && m.user_id !== userId ? (
                          <select
                            value={m.role_id}
                            onChange={e => handleChangeRole(m.user_id, e.target.value)}
                            style={{ fontSize: 13, color: "var(--body)", border: "none", background: "transparent", cursor: "pointer", outline: "none", padding: 0 }}
                          >
                            {roles.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
                          </select>
                        ) : (
                          <span style={{ fontSize: 13, color: "var(--body)" }}>{m.role_name}</span>
                        )}
                        <div style={{ display: "flex", justifyContent: "flex-end", alignItems: "center", gap: 10 }}>
                          {canManageTeam && m.user_id !== userId && (
                            isConfirming ? (
                              <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
                                <button onClick={() => handleRemoveMember(m.user_id)} style={{ width: 28, height: 28, borderRadius: 6, border: "none", background: "none", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", padding: 0, color: "var(--danger)" }}><Check className="w-4 h-4" /></button>
                                <button onClick={() => setConfirmRemoveId(null)} style={{ width: 28, height: 28, borderRadius: 6, border: "none", background: "none", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", padding: 0, color: "var(--muted-text)" }}><X className="w-4 h-4" /></button>
                              </div>
                            ) : (
                              <button
                                onClick={() => setConfirmRemoveId(m.user_id)}
                                style={{ display: "flex", alignItems: "center", justifyContent: "center", background: "none", border: "none", cursor: "pointer", padding: 2, color: "var(--muted-text)", opacity: isHovered ? 1 : 0, transition: "opacity 0.15s" }}
                              >
                                <X style={{ width: 14, height: 14 }} />
                              </button>
                            )
                          )}
                        </div>
                      </div>
                    )
                  })}
                </div>

                {/* Danger zone — the delete confirm renders as a top-layer portal dialog. */}
                {canDelete && (
                  <div style={{ marginTop: 36 }}>
                    <p style={{ fontFamily: "var(--mono)", fontSize: 11, fontWeight: 600, letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--muted-text)", margin: "0 0 12px" }}>Danger zone</p>
                    <div style={{ height: 1, background: "var(--line)", marginBottom: 16 }} />
                    <button onClick={() => setConfirmDelete(true)} style={{ display: "flex", alignItems: "center", gap: 6, height: 36, padding: "0 18px", background: "transparent", border: "1px solid color-mix(in srgb, var(--danger) 25%, transparent)", borderRadius: "var(--r-chip)", color: "var(--danger)", fontSize: 14, cursor: "pointer" }}>
                      <Trash2 style={{ width: 14, height: 14 }} /> Delete team
                    </button>
                  </div>
                )}
              </>
            )}
          </div>
        ) : (
          <div className="hidden md:block" style={{ paddingTop: 28 }}>
            <p style={{ ...EYEBROW_STYLE, fontWeight: 400, marginBottom: 6 }}>
              TEAM SETTINGS · {team.name.toUpperCase()}
            </p>
            <p style={{ fontFamily: "var(--font-instrument-serif)", fontSize: 25, color: "var(--ink)", lineHeight: 1.1, marginBottom: 8 }}>Add members</p>
            <p style={{ fontSize: 15, color: "var(--body)", marginBottom: 32 }}>Select people from your ministry and assign them a role on this team.</p>
            {addMemberForm}
          </div>
        )}

      {/* Add-member action row (inline under SubpageShell; interim sub-view) */}
      {showAddMember && selectedIds.size > 0 && (
        <div style={{ borderTop: "1px solid var(--line)", marginTop: 20 }}
          className="py-4 pb-8 md:pb-5"
        >
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
            <p style={{ fontSize: 14, color: "var(--body)", margin: 0 }}>
              <span style={{ fontWeight: 600, color: "var(--ink)" }}>{selectedIds.size}</span> {selectedIds.size === 1 ? "member" : "members"} selected
            </p>
            <CentralButton
              variant="primary" size="md"
              onClick={handleAddMembers}
              disabled={saving}
            >
              {saving ? "Adding…" : `Add ${selectedIds.size} ${selectedIds.size === 1 ? "member" : "members"}`}
            </CentralButton>
          </div>
        </div>
      )}

      {/* Top-layer dialogs — rendered via portal so a transformed content-enter
          ancestor can't trap `position: fixed`. Delete confirm + president swap. */}
      {mounted && createPortal(
        <>
        {confirmDelete && (
          <CentralModal
            onClose={() => setConfirmDelete(false)}
            eyebrow="Danger zone"
            title="Delete this team?"
            maxWidth={420}
            footer={
              <>
                <CentralButton variant="secondary" onClick={() => setConfirmDelete(false)}>Cancel</CentralButton>
                <CentralButton variant="danger-solid" onClick={handleDeleteTeam}>Delete team</CentralButton>
              </>
            }
          >
            <p style={{ fontSize: 14, color: "var(--body)", lineHeight: 1.5, margin: 0 }}>
              <span style={{ fontWeight: 500, color: "var(--ink)" }}>{localTeamName}</span> and its roles will be permanently removed. This can&apos;t be undone.
            </p>
          </CentralModal>
        )}
        {replaceCtx && (() => {
        const isCoPres = presidentMembers.length >= 2
        const confirmDisabled = replacing || (isCoPres && !replacePickId)
        const close = () => { if (!replacing) { setReplaceCtx(null); setReplacePickId(null) } }
        const presLabel = (presidentRole?.name ?? "President")
        return (
          <CentralModal
            onClose={close}
            eyebrow={presLabel}
            title={isCoPres ? "Replace a co-president?" : `Replace the ${presLabel.toLowerCase()}?`}
            maxWidth={420}
            footer={
              <>
                <button onClick={close} disabled={replacing} style={{ height: 38, padding: "0 16px", background: "transparent", border: "1px solid var(--line)", borderRadius: 10, color: "var(--body)", fontSize: 14, cursor: replacing ? "not-allowed" : "pointer" }}>Cancel</button>
                <CentralButton variant="primary" size="md" onClick={confirmReplace} disabled={confirmDisabled} style={{ height: 38, padding: "0 20px" }}>
                  {replacing ? "Replacing…" : "Replace"}
                </CentralButton>
              </>
            }
          >
            {isCoPres ? (
              <>
                <p style={{ fontSize: 14, color: "var(--body)", lineHeight: 1.5, margin: "0 0 16px" }}>
                  There are 2 co-presidents. Which one is{" "}
                  <span style={{ fontWeight: 500, color: "var(--ink)" }}>{replaceCtx.targetName}</span> replacing?
                </p>
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {presidentMembers.map(p => {
                    const picked = replacePickId === p.user_id
                    return (
                      <button
                        key={p.user_id}
                        onClick={() => setReplacePickId(p.user_id)}
                        style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 14px", borderRadius: 12, border: `1px solid ${picked ? "var(--plum)" : "var(--line)"}`, background: picked ? "var(--ivory)" : "var(--cream)", cursor: "pointer", textAlign: "left" as const, transition: "all 0.12s" }}
                      >
                        <MonogramChip initials={getInitials(p.name)} className="w-8 h-8 text-[12px] font-semibold" />
                        <span style={{ flex: 1, fontSize: 14, fontWeight: 500, color: "var(--ink)" }}>{p.name}</span>
                        <div style={{ width: 18, height: 18, borderRadius: 999, border: `1.5px solid ${picked ? "var(--plum)" : "var(--line-2)"}`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                          {picked && <div style={{ width: 9, height: 9, borderRadius: 999, background: "var(--plum)" }} />}
                        </div>
                      </button>
                    )
                  })}
                </div>
              </>
            ) : (
              <p style={{ fontSize: 14, color: "var(--body)", lineHeight: 1.5, margin: 0 }}>
                <span style={{ fontWeight: 500, color: "var(--ink)" }}>{presidentMembers[0]?.name}</span> is the {presLabel.toLowerCase()}. Replace them with{" "}
                <span style={{ fontWeight: 500, color: "var(--ink)" }}>{replaceCtx.targetName}</span>?
              </p>
            )}
          </CentralModal>
        )
      })()}
        </>,
        document.body
      )}

    </SubpageShell>
  )
}

// ── SmallGroupLeadersTab ──────────────────────────────────────────────────────

const DGL_SLOT_LABELS: Record<DGLSlot, string> = {
  sunday_service: "Congregational Prayer / Dishes",
  wednesday_pm: "Prayer Meeting",
  friday_sg: "DG Cooking / Praise",
}

type SGGroup = {
  id: string
  name: string
  type: "brothers" | "sisters"
  leader_id: string | null
  paired_group_id: string | null
  chat_group_id: string | null
}

type SGMember = {
  id: string
  group_id: string
  user_id: string
  meal_taken: boolean
  meal_semester: string
  name: string
}

type DGLAssignmentRow = {
  id: string
  user_id: string
  week_date: string
  slot: DGLSlot
  semester: string
  published: boolean
  user_name: string
}

const SLOT_ABBR: Record<DGLAvailSlot, string> = { wednesday: "WED", friday: "FRI", sunday: "SUN" }

function SglSH({ eyebrow, title, sub, right }: { eyebrow: string; title: string; sub?: string; right?: React.ReactNode }) {
  return (
    <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12 }}>
      <div>
        <div style={MONO_STYLE}>{eyebrow}</div>
        <h2 style={{ fontFamily: "var(--font-instrument-serif)", fontSize: 22, fontWeight: 400, color: "var(--ink)", margin: "4px 0 0", letterSpacing: "-0.015em", lineHeight: 1.15 }}>{title}</h2>
        {sub && <div style={{ fontSize: 13, color: "var(--body)", marginTop: 3 }}>{sub}</div>}
      </div>
      {right && <div style={{ flexShrink: 0, marginTop: 4 }}>{right}</div>}
    </div>
  )
}

function SmallGroupLeadersTab({
  teamId,
  ministryId,
  userId,
  isPresident,
  isPastor,
  praiseTeamId,
  onOpenChat,
  onTeamSettings,
  isDesktopView,
  desktopSection,
}: {
  teamId: string
  ministryId: string
  userId: string
  isPresident: boolean
  isPastor: boolean
  praiseTeamId?: string | null
  onOpenChat?: (id: string, name: string, type?: string) => void
  onTeamSettings?: () => void
  isDesktopView?: boolean
  desktopSection?: string
}) {
  const supabase = createClient()
  const { setParam } = useNavState()
  // Unique per-mount ID so desktop + mobile instances don't collide on the same channel name
  const channelInstanceId = useRef(Math.random().toString(36).slice(2)).current
  type SGLTab = "home" | "schedule" | "bible_study"
  const validTabs: SGLTab[] = isPastor ? ["bible_study", "schedule"] : ["home", "schedule", "bible_study"]
  const defaultTab: SGLTab = isPastor ? "bible_study" : "home"
  const [activeSubTab, setActiveSubTab] = useState<SGLTab>(() => {
    const p = typeof window !== "undefined" ? new URLSearchParams(window.location.search).get("sgltab") : null
    return (validTabs.includes(p as SGLTab)) ? p as SGLTab : defaultTab
  })
  function setActiveSubTabAndUrl(t: SGLTab) {
    setActiveSubTab(t)
    setParam("sgltab", t)
  }
  const [loading, setLoading] = useState(true)
  const [semester, setSemester] = useState(() => getSemesterLabel())
  const semesterWeeks = useMemo(() => getSemesterWeeks(semester), [semester])
  const semesterDates = useMemo(() => getSemesterDates(semester), [semester])

  // Home — assignments + small groups
  const [myUpcoming, setMyUpcoming] = useState<DGLAssignmentRow[]>([])
  const [fridayPartners, setFridayPartners] = useState<Map<string, string>>(new Map()) // week_date → partner name
  const [myGroups, setMyGroups] = useState<SGGroup[]>([])
  const [groupMembers, setGroupMembers] = useState<Map<string, SGMember[]>>(new Map())
  const [pairedGroups, setPairedGroups] = useState<Map<string, SGGroup>>(new Map())
  const [pairedMembers, setPairedMembers] = useState<Map<string, SGMember[]>>(new Map())

  // Edit members for my group
  const [editingGroupId, setEditingGroupId] = useState<string | null>(null)
  const [pendingAddMemberIds, setPendingAddMemberIds] = useState<Set<string>>(new Set())
  const [pendingRemoveMemberIds, setPendingRemoveMemberIds] = useState<Set<string>>(new Set())
  const [confirmRemoveSgMemberId, setConfirmRemoveSgMemberId] = useState<string | null>(null)
  const [editMemberSearch, setEditMemberSearch] = useState("")
  const [showSgAddPicker, setShowSgAddPicker] = useState(false)
  const [sgAddPickerSearch, setSgAddPickerSearch] = useState("")
  const [allMembersForPicker, setAllMembersForPicker] = useState<{ id: string; name: string }[]>([])
  const [editSaving, setEditSaving] = useState(false)
  const [editError, setEditError] = useState<string | null>(null)

  // Roster (Home tab — president only)
  const [rosterStatus, setRosterStatus] = useState<RosterStatus | null>(null)
  const [rosterMembers, setRosterMembers] = useState<RosterMember[]>([])
  const [rosterAddMode, setRosterAddMode] = useState(false)
  const [editingRoster, setEditingRoster] = useState(false)
  const [pendingRosterIds, setPendingRosterIds] = useState<Set<string>>(new Set())
  const [ministryMemberList, setMinistryMemberList] = useState<{ id: string; name: string }[]>([])
  const [memberSearch, setMemberSearch] = useState("")
  const [confirmingRoster, setConfirmingRoster] = useState(false)
  const [rosterError, setRosterError] = useState<string | null>(null)
  const [renewalLoading, setRenewalLoading] = useState(false)

  // Schedule — semester-wide availability
  const [rosterConfirmedForSchedule, setRosterConfirmedForSchedule] = useState(false)
  const [busySet, setBusySet] = useState<Set<string>>(new Set())
  const [savingSlot, setSavingSlot] = useState<string | null>(null)
  const [allBusyMap, setAllBusyMap] = useState<Map<string, Set<string>>>(new Map())
  const [scheduleRosterMembers, setScheduleRosterMembers] = useState<{ user_id: string; name: string }[]>([])

  // Rotation assigner (president only)
  const [existingAssignments, setExistingAssignments] = useState<DGLAssignmentRow[]>([])
  const [proposedAssignments, setProposedAssignments] = useState<ProposedAssignment[]>([])
  const [flagged, setFlagged] = useState<{ week_date: string; slot: DGLSlot; reason: string }[]>([])
  const [rotationPhase, setRotationPhase] = useState<"idle" | "generated" | "saved" | "published">("idle")
  const [isGenerating, setIsGenerating] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [isPublishing, setIsPublishing] = useState(false)
  const [rotErr, setRotErr] = useState<string | null>(null)
  const [openRotMonths, setOpenRotMonths] = useState<Set<string>>(new Set())
  const [scheduleReady, setScheduleReady] = useState(false)
  const [memberReadiness, setMemberReadiness] = useState<Map<string, boolean>>(new Map())

  useEffect(() => { void init() }, [teamId, userId, semester]) // eslint-disable-line react-hooks/exhaustive-deps

  // Realtime: refresh home assignments when president publishes
  useEffect(() => {
    const channel = supabase
      .channel(`dgl-assignments-${userId}-${teamId}-${channelInstanceId}`)
      .on("postgres_changes", {
        event: "*",
        schema: "public",
        table: "dgl_assignments",
        filter: `user_id=eq.${userId}`,
      }, () => { void loadHome() })
      .subscribe()
    return () => {
      // Synchronously splice out of realtime.channels so the next supabase.channel()
      // call with the same name gets a fresh object, not the still-subscribed one.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const rt = (supabase as any).realtime as { channels: unknown[] } | undefined
      if (rt) rt.channels = rt.channels.filter((c: unknown) => c !== channel)
      channel.unsubscribe().catch(() => {})
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [teamId, userId])

  // Realtime: refresh member list when president confirms small groups
  // 150ms debounce so small_group_members writes finish before we read
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>
    const channel = supabase
      .channel(`sg-leader-${userId}-${teamId}-${channelInstanceId}`)
      .on("postgres_changes", {
        event: "*",
        schema: "public",
        table: "small_groups",
        filter: `leader_id=eq.${userId}`,
      }, () => {
        clearTimeout(timer)
        timer = setTimeout(() => { void loadHome() }, 150)
      })
      .subscribe()
    return () => {
      clearTimeout(timer)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const rt = (supabase as any).realtime as { channels: unknown[] } | undefined
      if (rt) rt.channels = rt.channels.filter((c: unknown) => c !== channel)
      channel.unsubscribe().catch(() => {})
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [teamId, userId])

  async function init() {
    setLoading(true)
    await Promise.all([loadHome(), loadSchedule()])
    setLoading(false)
  }

  async function loadHome() {
    const { data: aData } = await supabase
      .from("dgl_assignments")
      .select("*")
      .eq("team_id", teamId)
      .eq("user_id", userId)
      .eq("published", true)
      .eq("semester", semester)
      .order("week_date", { ascending: true })
    const myAssignments = (aData ?? []) as DGLAssignmentRow[]
    setMyUpcoming(myAssignments)

    // For Friday SG assignments, load the partner (the other DGL assigned to the same week_date+slot)
    const fridayWeeks = myAssignments.filter(a => a.slot === "friday_sg").map(a => a.week_date)
    if (fridayWeeks.length > 0) {
      const { data: partnerData } = await supabase
        .from("dgl_assignments")
        .select("week_date, user_id")
        .eq("team_id", teamId)
        .eq("slot", "friday_sg")
        .eq("published", true)
        .neq("user_id", userId)
        .in("week_date", fridayWeeks)
      const partnerUids = (partnerData ?? []).map((r: { user_id: string }) => r.user_id).filter(Boolean)
      let partnerNameMap = new Map<string, string>()
      if (partnerUids.length > 0) {
        const { data: pProfiles } = await supabase.from("profiles").select("id, name").in("id", partnerUids)
        partnerNameMap = new Map((pProfiles ?? []).map((p: { id: string; name: string }) => [p.id, p.name]))
      }
      const fpMap = new Map<string, string>()
      for (const r of (partnerData ?? []) as { week_date: string; user_id: string }[]) {
        const name = partnerNameMap.get(r.user_id)
        if (name) fpMap.set(r.week_date, name)
      }
      setFridayPartners(fpMap)
    } else {
      setFridayPartners(new Map())
    }

    const { data: gData } = await supabase
      .from("small_groups")
      .select("id, name, type, leader_id, paired_group_id, chat_group_id")
      .eq("team_id", teamId)
      .eq("leader_id", userId)
    const groups = (gData ?? []) as SGGroup[]
    setMyGroups(groups)

    if (groups.length > 0) {
      const gIds = groups.map(g => g.id)
      const { data: mData } = await supabase
        .from("small_group_members")
        .select("id, group_id, user_id, meal_taken, meal_semester")
        .in("group_id", gIds)
      const mRows = (mData ?? []) as Omit<SGMember, "name">[]
      const uids = mRows.map(m => m.user_id)
      let pMap = new Map<string, string>()
      if (uids.length > 0) {
        const { data: pData } = await supabase.from("profiles").select("id, name").in("id", uids)
        pMap = new Map((pData ?? []).map((p: { id: string; name: string }) => [p.id, p.name]))
      }
      const byGroup = new Map<string, SGMember[]>()
      for (const m of mRows) {
        if (!byGroup.has(m.group_id)) byGroup.set(m.group_id, [])
        byGroup.get(m.group_id)!.push({ ...m, name: pMap.get(m.user_id) ?? "Unknown" })
      }
      setGroupMembers(byGroup)

      const pairedIds = groups.map(g => g.paired_group_id).filter(Boolean) as string[]
      if (pairedIds.length > 0) {
        const { data: pgData } = await supabase.from("small_groups").select("*").in("id", pairedIds)
        const pgMap = new Map<string, SGGroup>()
        for (const pg of (pgData ?? []) as SGGroup[]) pgMap.set(pg.id, pg)
        setPairedGroups(pgMap)
        const { data: pmData } = await supabase
          .from("small_group_members")
          .select("id, group_id, user_id, meal_taken, meal_semester")
          .in("group_id", pairedIds)
        const pmRows = (pmData ?? []) as Omit<SGMember, "name">[]
        const puids = pmRows.map(m => m.user_id)
        let ppMap = new Map<string, string>()
        if (puids.length > 0) {
          const { data: ppData } = await supabase.from("profiles").select("id, name").in("id", puids)
          ppMap = new Map((ppData ?? []).map((p: { id: string; name: string }) => [p.id, p.name]))
        }
        const pmByGroup = new Map<string, SGMember[]>()
        for (const m of pmRows) {
          if (!pmByGroup.has(m.group_id)) pmByGroup.set(m.group_id, [])
          pmByGroup.get(m.group_id)!.push({ ...m, name: ppMap.get(m.user_id) ?? "Unknown" })
        }
        setPairedMembers(pmByGroup)

        // Load partner DGL's friday_sg assignments — brother/sister DGs share responsibility
        const partnerDglIds = [...pgMap.values()].map(pg => pg.leader_id).filter(Boolean) as string[]
        if (partnerDglIds.length > 0) {
          const { data: paData } = await supabase
            .from("dgl_assignments")
            .select("id, user_id, week_date, slot, semester, published")
            .eq("team_id", teamId)
            .eq("slot", "friday_sg")
            .eq("published", true)
            .eq("semester", semester)
            .in("user_id", partnerDglIds)
          if (paData && paData.length > 0) {
            const myFridayWeeks = new Set(myAssignments.filter(a => a.slot === "friday_sg").map(a => a.week_date))
            const newRows = (paData as { id: string; user_id: string; week_date: string; slot: DGLSlot; semester: string; published: boolean }[])
              .filter(r => !myFridayWeeks.has(r.week_date))
            if (newRows.length > 0) {
              const pUids = [...new Set(newRows.map(r => r.user_id))]
              const { data: pnData } = await supabase.from("profiles").select("id, name").in("id", pUids)
              const pnMap = new Map((pnData ?? []).map((p: { id: string; name: string }) => [p.id, p.name]))
              const enriched: DGLAssignmentRow[] = newRows.map(r => ({ ...r, user_name: pnMap.get(r.user_id) ?? "Partner" }))
              setMyUpcoming(prev => [...prev, ...enriched].sort((a, b) => a.week_date.localeCompare(b.week_date)))
            }
          }
        }
      }
    }

    // Load roster status + members (president sees roster section)
    await loadRosterForHome()

    // Load ministry members for pickers (president for DGL roster, any DGL for member editing)
    const { data: pData } = await supabase
      .from("profiles")
      .select("id, name")
      .eq("ministry_id", ministryId)
      .not("name", "is", null)
      .order("name")
    const allMembers = (pData ?? []) as { id: string; name: string }[]
    setAllMembersForPicker(allMembers)
    if (isPresident) setMinistryMemberList(allMembers)
  }

  async function loadRosterForHome() {
    const { data: statusRow } = await supabase
      .from("dgl_roster_status")
      .select("confirmed, confirmed_at, confirmed_by, needs_roster_renewal")
      .eq("team_id", teamId)
      .eq("semester", semester)
      .maybeSingle()

    setRosterStatus(statusRow as RosterStatus | null)
    if (!statusRow?.confirmed) { setRosterMembers([]); return }

    const { data: rosterRows } = await supabase
      .from("dgl_roster")
      .select("user_id, confirmed_at")
      .eq("team_id", teamId)
      .eq("semester", semester)

    if (!rosterRows || rosterRows.length === 0) { setRosterMembers([]); return }

    const uids = (rosterRows as { user_id: string; confirmed_at: string | null }[]).map(r => r.user_id)
    const { data: pData } = await supabase.from("profiles").select("id, name").in("id", uids)
    const nameMap = new Map((pData ?? []).map((p: { id: string; name: string }) => [p.id, p.name]))
    setRosterMembers(
      (rosterRows as { user_id: string; confirmed_at: string | null }[]).map(r => ({
        user_id: r.user_id,
        name: nameMap.get(r.user_id) ?? "Unknown",
        confirmed_at: r.confirmed_at,
      }))
    )
  }

  async function loadSchedule() {
    // Check roster status first — no grid shown if not confirmed
    const { data: statusRow } = await supabase
      .from("dgl_roster_status")
      .select("confirmed")
      .eq("team_id", teamId)
      .eq("semester", semester)
      .maybeSingle()

    const confirmed = !!statusRow?.confirmed
    setRosterConfirmedForSchedule(confirmed)
    if (!confirmed) return

    // Load all roster member IDs + names + readiness
    const { data: rosterRows } = await supabase
      .from("dgl_roster")
      .select("user_id, schedule_ready")
      .eq("team_id", teamId)
      .eq("semester", semester)
    const rosterTyped = (rosterRows ?? []) as { user_id: string; schedule_ready: boolean | null }[]
    const uids = rosterTyped.map(r => r.user_id)
    if (uids.length > 0) {
      const { data: pData } = await supabase.from("profiles").select("id, name").in("id", uids)
      const nameMap = new Map((pData ?? []).map((p: { id: string; name: string }) => [p.id, p.name]))
      setScheduleRosterMembers(uids.map(uid => ({ user_id: uid, name: nameMap.get(uid) ?? "Unknown" })))
    }
    const readinessMap = new Map<string, boolean>()
    for (const r of rosterTyped) readinessMap.set(r.user_id, r.schedule_ready ?? false)
    setMemberReadiness(readinessMap)
    setScheduleReady(readinessMap.get(userId) ?? false)

    // Load ALL availability (date-specific, all roster members)
    const { data: avData } = await supabase
      .from("dgl_availability")
      .select("user_id, week_date, slot, is_busy")
      .eq("team_id", teamId)
      .eq("semester", semester)

    const newMap = new Map<string, Set<string>>()
    const myBusy = new Set<string>()
    for (const r of (avData ?? []) as { user_id: string; week_date: string; slot: string; is_busy: boolean }[]) {
      if (!r.is_busy) continue
      const key = `${r.week_date}::${r.slot}`
      if (!newMap.has(r.user_id)) newMap.set(r.user_id, new Set())
      newMap.get(r.user_id)!.add(key)
      if (r.user_id === userId) myBusy.add(key)
    }
    setAllBusyMap(newMap)
    setBusySet(myBusy)

    if (isPresident || isPastor) await loadExistingAssignments()
  }

  async function loadExistingAssignments() {
    const { data } = await supabase
      .from("dgl_assignments")
      .select("id, user_id, week_date, slot, semester, published")
      .eq("team_id", teamId)
      .eq("semester", semester)
      .order("week_date", { ascending: true })
    if (!data) return

    const uids = [...new Set(data.map((r: { user_id: string }) => r.user_id))]
    let nameMap = new Map<string, string>()
    if (uids.length > 0) {
      const { data: pData } = await supabase.from("profiles").select("id, name").in("id", uids)
      nameMap = new Map((pData ?? []).map((p: { id: string; name: string }) => [p.id, p.name]))
    }

    const rows: DGLAssignmentRow[] = data.map((r: {
      id: string; user_id: string; week_date: string; slot: DGLSlot; semester: string; published: boolean
    }) => ({ ...r, user_name: nameMap.get(r.user_id) ?? r.user_id }))

    setExistingAssignments(rows)
    const hasPublished = rows.some(r => r.published)
    setRotationPhase(rows.length === 0 ? "idle" : hasPublished ? "published" : "saved")
  }

  async function toggleBusy(date: string, slot: DGLAvailSlot) {
    const key = `${date}::${slot}`
    const wasBusy = busySet.has(key)
    setSavingSlot(key)

    // Optimistic update
    setBusySet(prev => { const n = new Set(prev); wasBusy ? n.delete(key) : n.add(key); return n })
    setAllBusyMap(prev => {
      const n = new Map(prev)
      const s = new Set(n.get(userId) ?? [])
      wasBusy ? s.delete(key) : s.add(key)
      n.set(userId, s)
      return n
    })

    const { error } = await supabase
      .from("dgl_availability")
      .upsert(
        { user_id: userId, team_id: teamId, week_date: date, slot, is_busy: !wasBusy, semester },
        { onConflict: "user_id,team_id,week_date,slot" }
      )
    if (error) {
      // Revert on failure
      setBusySet(prev => { const n = new Set(prev); wasBusy ? n.add(key) : n.delete(key); return n })
      setAllBusyMap(prev => {
        const n = new Map(prev)
        const s = new Set(n.get(userId) ?? [])
        wasBusy ? s.add(key) : s.delete(key)
        n.set(userId, s)
        return n
      })
    }
    setSavingSlot(null)
  }

  async function handleConfirmRoster() {
    setConfirmingRoster(true)
    setRosterError(null)
    try {
      const result = await confirmDGLRosterAction(
        teamId, ministryId, Array.from(pendingRosterIds), semester, userId
      )
      if (result.error) { setRosterError(result.error); return }
      setPendingRosterIds(new Set())
      setRosterAddMode(false)
      setEditingRoster(false)
      await Promise.all([loadRosterForHome(), loadSchedule()])
    } catch (e) {
      setRosterError(e instanceof Error ? e.message : "Something went wrong. Please try again.")
    } finally {
      setConfirmingRoster(false)
    }
  }

  async function handleRosterRenewal(action: "keep" | "fresh") {
    setRenewalLoading(true)
    await handleRosterRenewalAction(teamId, ministryId, semester, action, userId)
    setRenewalLoading(false)
    await loadRosterForHome()
  }

  async function toggleMeal(member: SGMember) {
    setGroupMembers(prev => {
      const next = new Map(prev)
      const updated = next.get(member.group_id)?.map(m =>
        m.id === member.id ? { ...m, meal_taken: !m.meal_taken } : m
      )
      if (updated) next.set(member.group_id, updated)
      return next
    })
    await supabase
      .from("small_group_members")
      .update({ meal_taken: !member.meal_taken, meal_semester: semester })
      .eq("id", member.id)
  }

  async function handleSgEditSave(groupId: string) {
    setEditSaving(true)
    setEditError(null)
    const addUserIds = Array.from(pendingAddMemberIds)
    const removeUserIds = Array.from(pendingRemoveMemberIds)
    const result = await updateSmallGroupMembersAction({ smallGroupId: groupId, addUserIds, removeUserIds })
    if (result.error) {
      setEditError(result.error)
      setEditSaving(false)
      return
    }
    setEditingGroupId(null)
    setPendingAddMemberIds(new Set())
    setPendingRemoveMemberIds(new Set())
    setConfirmRemoveSgMemberId(null)
    setEditMemberSearch("")
    setShowSgAddPicker(false)
    setSgAddPickerSearch("")
    await loadHome()
    setEditSaving(false)
  }

  async function handleGenerate() {
    setIsGenerating(true)
    setRotErr(null)
    try {
      const result = await generateDGLRotationAction({
        teamId, ministryId, semester,
        weeks: semesterWeeks.map(d => d.toISOString().split("T")[0]),
      })
      if (result.error) { setRotErr(result.error); return }
      setProposedAssignments(result.assignments)
      setFlagged(result.flaggedWeeks)
      setRotationPhase("generated")
    } catch {
      setRotErr("Generation failed. Please try again.")
    } finally {
      setIsGenerating(false)
    }
  }

  async function handleSave() {
    setIsSaving(true)
    setRotErr(null)
    try {
      const result = await saveDGLRotationAction({
        teamId, ministryId, semester,
        assignments: proposedAssignments.map(a => ({
          user_id: a.user_id, week_date: a.week_date, slot: a.slot,
        })),
      })
      if (result.error) { setRotErr(result.error); return }
      setProposedAssignments([])
      setFlagged([])
      await loadExistingAssignments()
    } catch {
      setRotErr("Save failed. Please try again.")
    } finally {
      setIsSaving(false)
    }
  }

  async function handlePublish(publish: boolean) {
    setIsPublishing(true)
    await publishDGLRotationAction({ teamId, ministryId, semester, publish })
    await loadExistingAssignments()
    setIsPublishing(false)
  }

  async function handleMarkReady() {
    setScheduleReady(true)
    setMemberReadiness(prev => new Map(prev).set(userId, true))
    await supabase
      .from("dgl_roster")
      .update({ schedule_ready: true })
      .eq("team_id", teamId)
      .eq("user_id", userId)
      .eq("semester", semester)
  }

  // On desktop: section is driven by sidebar prop; on mobile: by internal activeSubTab state
  const effectiveSection = (isDesktopView && desktopSection) ? desktopSection : activeSubTab

  if (loading) return <div className="flex items-center justify-center py-20"><Spinner /></div>

  const weekDateStrings = semesterWeeks.map(d => d.toISOString().split("T")[0])
  const [semSeason, semYear] = semester.split("_")
  const semesterLabel = `${semSeason.charAt(0).toUpperCase()}${semSeason.slice(1)} ${semYear}`
  const flaggedKeys = new Set(flagged.map(f => `${f.week_date}::${f.slot}`))

  return (
    <div className={isDesktopView ? "pb-2 md:pb-0 md:flex md:flex-col md:h-full md:overflow-hidden" : ""}>
      {/* Desktop header */}
      {isDesktopView && (
        <TabPageHeader>
          <PageTitle title={effectiveSection === "bible_study" ? "Bible Study" : "Schedule"} compact />
          {onTeamSettings && (
            <IconButton dim={32} onClick={onTeamSettings} title="Team settings" className="ml-auto">
              <Settings className="w-4 h-4" />
            </IconButton>
          )}
        </TabPageHeader>
      )}

      {/* Mobile sub-tab switcher */}
      {!isDesktopView && (
        <div style={{ marginBottom: 24, display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <PlanSubTabStrip
              tabs={validTabs.map(k => ({
                key: k,
                label: k === "home" ? "Home" : k === "schedule" ? "Schedule" : "Bible Study",
              }))}
              active={activeSubTab}
              onChange={t => setActiveSubTabAndUrl(t as SGLTab)}
            />
          </div>
          {onTeamSettings && (
            <IconButton dim={32} onClick={onTeamSettings} title="Team settings" className="ml-auto">
              <Settings className="w-4 h-4" />
            </IconButton>
          )}
        </div>
      )}

      <div className={isDesktopView ? "flex-1 overflow-y-auto px-14 py-6 pb-20" : "md:px-14"}>
      {/* ── Bible Study Tab ─────────────────────────────────────────────── */}
      {effectiveSection === "bible_study" && (
        <BibleStudySubTab
          teamId={teamId}
          ministryId={ministryId}
          userId={userId}
          isPastor={isPastor}
          isPresident={isPresident}
          onOpenChat={onOpenChat}
        />
      )}

      {/* ── Home Tab ──────────────────────────────────────────────────────── */}
      {effectiveSection === "home" && !isPastor && !isDesktopView && (
        <div className="grid grid-cols-1 md:grid-cols-[1.45fr_1fr] gap-6 md:gap-9 items-start">

          {/* LEFT COLUMN — renewal banner + My Assignments */}
          <div className="flex flex-col gap-6">

          {/* June 1 renewal banner (president only) */}
          {isPresident && rosterStatus?.needs_roster_renewal && (
            <div style={{ background: "#FFF8F0", border: "1.5px solid #F59E0B", borderRadius: 14, padding: "16px 18px" }}>
              <p className="text-[14px] font-semibold text-[#92400E] mb-1">New semester — update your DGL roster?</p>
              <p className="text-[13px] text-[#92400E] mb-4">
                It&apos;s June 1. Do you want to carry over last semester&apos;s DGL roster for the fall, or start fresh?
              </p>
              <div className="flex gap-2">
                <CentralButton
                  variant="primary" size="sm"
                  onClick={() => handleRosterRenewal("keep")}
                  disabled={renewalLoading}
                  style={{ flex: 1 }}
                >
                  Keep roster
                </CentralButton>
                <button
                  onClick={() => handleRosterRenewal("fresh")}
                  disabled={renewalLoading}
                  style={{ flex: 1, padding: "8px 0", background: "transparent", color: "#92400E", border: "1.5px solid #F59E0B", borderRadius: 9, fontSize: 13, fontWeight: 600, cursor: renewalLoading ? "not-allowed" : "pointer", opacity: renewalLoading ? 0.6 : 1, fontFamily: "inherit" }}
                >
                  Start fresh
                </button>
              </div>
            </div>
          )}

          {/* My Assignments */}
          <section>
            <SglSH eyebrow="MY ASSIGNMENTS" title="What&apos;s on your plate" />
            {myUpcoming.length === 0 ? (
              <div className="mt-4 rounded-[14px] border border-dashed border-[var(--line)] p-6 text-center" style={{ background: "var(--cream-panel)" }}>
                <p className="text-[13px] text-[var(--muted-text)]">Your schedule hasn&apos;t been published yet.</p>
              </div>
            ) : (() => {
              const todayStr = new Date().toISOString().split("T")[0]
              const slotOffset: Record<string, number> = { sunday_service: 0, wednesday_pm: 3, friday_sg: 5 }
              const getDateStr = (a: DGLAssignmentRow) => {
                const sun = new Date(a.week_date + "T12:00:00")
                sun.setDate(sun.getDate() + (slotOffset[a.slot] ?? 0))
                return sun.toISOString().split("T")[0]
              }
              const firstUpcomingIdx = myUpcoming.findIndex(a => getDateStr(a) >= todayStr)
              return (
                <div className="mt-4 rounded-[14px] border border-[var(--line)] overflow-hidden" style={{ background: "var(--cream-panel)" }}>
                  {myUpcoming.map((a, i) => {
                    const sunday = new Date(a.week_date + "T12:00:00")
                    const d = new Date(sunday)
                    d.setDate(sunday.getDate() + (slotOffset[a.slot] ?? 0))
                    const dow = d.toLocaleDateString("en-US", { weekday: "short" }).toUpperCase()
                    const dayNum = d.getDate()
                    const monthStr = d.toLocaleDateString("en-US", { month: "short" }).toUpperCase()
                    const isPartnerAssignment = a.slot === "friday_sg" && a.user_id !== userId
                    const partner = a.slot === "friday_sg" && !isPartnerAssignment ? fridayPartners.get(a.week_date) : undefined
                    const subLabel = isPartnerAssignment
                      ? `Lead: ${a.user_name.split(" ")[0]}`
                      : partner
                        ? `w/ ${partner.split(" ")[0]}`
                        : `${monthStr} ${dayNum}`
                    const isPast = getDateStr(a) < todayStr
                    const isNext = i === firstUpcomingIdx
                    return (
                      <div
                        key={a.id}
                        className="flex items-center gap-4 px-5 py-4"
                        style={{
                          borderTop: i === 0 ? "none" : "1px solid var(--line-3)",
                          borderLeft: isNext ? "3px solid var(--plum)" : "3px solid transparent",
                          background: isNext ? "var(--cream-3)" : "transparent",
                          opacity: isPast ? 0.4 : 1,
                          transition: "opacity 0.15s",
                        }}
                      >
                        <div className="flex-shrink-0 flex flex-col items-center justify-center" style={{ width: 48, height: 48, borderRadius: 10, background: isNext ? "#EDE5F5" : "var(--cream-3)", border: `1px solid ${isNext ? "#C9B8D4" : "var(--line)"}` }}>
                          <span style={{ fontFamily: "var(--mono)", fontSize: 9, letterSpacing: "0.1em", color: "var(--muted-text)", textTransform: "uppercase" as const }}>{dow}</span>
                          <span style={{ fontFamily: "var(--font-instrument-serif)", fontSize: 22, color: isNext ? "var(--plum)" : "var(--plum-2)", lineHeight: 1, marginTop: 1 }}>{dayNum}</span>
                        </div>
                        <div className="flex-1 min-w-0">
                          <p style={{ fontFamily: "var(--font-instrument-serif)", fontSize: 19, color: isPast ? "var(--muted-text)" : "var(--ink)", letterSpacing: "-0.01em", textDecoration: isPast ? "line-through" : "none" }}>{DGL_SLOT_LABELS[a.slot]}</p>
                          <p style={{ ...MONO_STYLE, marginTop: 3 }}>
                            {subLabel}
                          </p>
                        </div>
                        {isNext && (
                          <span style={{ fontSize: 10, fontWeight: 600, color: "var(--plum)", background: "#EDE5F5", border: "1px solid #C9B8D4", padding: "2px 8px", borderRadius: 999, letterSpacing: "0.05em", flexShrink: 0 }}>UP NEXT</span>
                        )}
                      </div>
                    )
                  })}
                </div>
              )
            })()}
          </section>

          </div>{/* end LEFT COLUMN */}

          {/* RIGHT COLUMN — Roster + My Groups */}
          <div className="flex flex-col gap-6">

          {/* SMALL GROUP LEADER ROSTER (president only) */}
          {isPresident && (
            <section>
              <SglSH
                eyebrow={rosterStatus?.confirmed ? `${rosterMembers.length} DGLs · ${semesterLabel}` : "SGL ROSTER"}
                title="Small Group Leaders"
                right={rosterStatus?.confirmed && !rosterAddMode && !editingRoster ? (
                  <button
                    onClick={() => { setPendingRosterIds(new Set(rosterMembers.map(m => m.user_id))); setEditingRoster(true) }}
                    style={{ padding: "5px 12px", borderRadius: 8, border: "1px solid var(--line-2)", background: "transparent", color: "var(--body)", fontSize: 12, fontFamily: "inherit", cursor: "pointer" }}
                  >
                    Edit
                  </button>
                ) : undefined}
              />

              {rosterError && (
                <div className="mt-3 px-3 py-2 bg-[#FEF2F2] border border-[#FCA5A5] rounded-xl text-[13px] text-red-700">
                  {rosterError}
                </div>
              )}

              {/* Empty state — no roster yet */}
              {!rosterStatus?.confirmed && !rosterAddMode && (
                <button
                  onClick={() => setRosterAddMode(true)}
                  className="w-full mt-4"
                  style={{ background: "transparent", border: "1.5px dashed #D4CEDF", borderRadius: 14, padding: "24px 16px", textAlign: "center" as const, cursor: "pointer" }}
                >
                  <p className="text-[14px] font-semibold text-[var(--ink)] mb-1">No roster yet</p>
                  <p className="text-[13px] text-[var(--muted-text)] mb-3">Add DGLs to the {semesterLabel} roster.</p>
                  <span style={{ fontSize: 13, fontWeight: 600, color: "var(--plum)" }}>+ Add DGLs</span>
                </button>
              )}

              {/* Add / Edit mode — member picker */}
              {(rosterAddMode || editingRoster) && (
                <div className="mt-4 rounded-[14px] border border-[var(--line)] overflow-hidden" style={{ background: "var(--cream-panel)" }}>
                  <div className="px-4 pt-4 pb-3 border-b border-[var(--line-3)]">
                    <input
                      type="text"
                      placeholder="Search members…"
                      value={memberSearch}
                      onChange={e => setMemberSearch(e.target.value)}
                      style={{ width: "100%", border: "1px solid var(--line-2)", borderRadius: 10, padding: "8px 12px", fontSize: 13, fontFamily: "var(--font-inter)", outline: "none", background: "var(--cream-panel)" }}
                    />
                  </div>
                  <div style={{ maxHeight: 240, overflowY: "auto" }}>
                    {ministryMemberList
                      .filter(m => m.name.toLowerCase().includes(memberSearch.toLowerCase()))
                      .map((m, i, arr) => {
                        const selected = pendingRosterIds.has(m.id)
                        return (
                          <div
                            key={m.id}
                            onClick={() => setPendingRosterIds(prev => { const n = new Set(prev); selected ? n.delete(m.id) : n.add(m.id); return n })}
                            className={`flex items-center gap-3 px-4 py-3 cursor-pointer ${i < arr.length - 1 ? "border-b border-[var(--line-3)]" : ""}`}
                            style={{ background: selected ? "rgba(62,21,64,0.04)" : "transparent" }}
                          >
                            <MonogramChip initials={getInitials(m.name)} className="w-7 h-7 text-[12px] font-semibold" />
                            <p className="flex-1 text-[13px] text-[var(--ink)]">{m.name}</p>
                            {selected && <Check style={{ width: 14, height: 14, color: "var(--plum)" }} />}
                          </div>
                        )
                      })}
                  </div>
                  <div className="flex gap-2 px-4 py-3 border-t border-[var(--line-3)]">
                    <button
                      onClick={() => { setRosterAddMode(false); setEditingRoster(false); setPendingRosterIds(new Set()); setMemberSearch("") }}
                      style={{ flex: 1, padding: "8px 0", background: "transparent", color: "var(--body)", border: "1px solid var(--line-2)", borderRadius: 9, fontSize: 13, fontWeight: 500, cursor: "pointer", fontFamily: "inherit" }}
                    >
                      Cancel
                    </button>
                    <CentralButton
                      variant="primary" size="sm"
                      onClick={handleConfirmRoster}
                      disabled={confirmingRoster || pendingRosterIds.size === 0}
                      style={{ flex: 1 }}
                    >
                      {confirmingRoster ? "Confirming…" : `Confirm (${pendingRosterIds.size})`}
                    </CentralButton>
                  </div>
                </div>
              )}

              {/* Confirmed roster list */}
              {rosterStatus?.confirmed && !rosterAddMode && !editingRoster && (
                <div className="mt-4 rounded-[14px] border border-[var(--line)] overflow-hidden" style={{ background: "var(--cream-panel)" }}>
                  {rosterMembers.map((m, i) => (
                    <div key={m.user_id} className="flex items-center gap-3 px-4 py-3" style={{ borderTop: i === 0 ? "none" : "1px solid var(--line-3)" }}>
                      <MonogramChip initials={getInitials(m.name)} className="w-7 h-7 text-[11px] font-semibold" />
                      <p className="flex-1 text-[14px] text-[var(--ink)]">{m.name}</p>
                    </div>
                  ))}
                </div>
              )}
            </section>
          )}

          {/* My Small Groups */}
          {myGroups.map(group => {
            const members = groupMembers.get(group.id) ?? []
            const pairedGroup = group.paired_group_id ? pairedGroups.get(group.paired_group_id) : undefined
            const pairedMs = group.paired_group_id ? (pairedMembers.get(group.paired_group_id) ?? []) : []
            const isEditing = editingGroupId === group.id
            const existingUserIds = new Set(members.map(m => m.user_id))
            const addableMembers = allMembersForPicker.filter(p =>
              !existingUserIds.has(p.id) && !pendingAddMemberIds.has(p.id)
            ).filter(p => p.name.toLowerCase().includes(sgAddPickerSearch.toLowerCase()))

            return (
              <section key={group.id}>
                <SglSH
                  eyebrow="MY SMALL GROUP"
                  title={group.name}
                  sub={`${group.type.charAt(0).toUpperCase()}${group.type.slice(1)} · ${members.length} member${members.length !== 1 ? "s" : ""}`}
                  right={isEditing ? (
                    <button
                      onClick={() => { setEditingGroupId(null); setPendingAddMemberIds(new Set()); setPendingRemoveMemberIds(new Set()); setConfirmRemoveSgMemberId(null); setShowSgAddPicker(false); setSgAddPickerSearch(""); setEditError(null) }}
                      style={{ padding: "5px 12px", borderRadius: 8, border: "1px solid var(--line-2)", background: "transparent", color: "var(--body)", fontSize: 12, fontFamily: "inherit", cursor: "pointer" }}
                    >Cancel</button>
                  ) : (
                    <button
                      onClick={() => { setEditingGroupId(group.id); setEditError(null) }}
                      style={{ padding: "5px 12px", borderRadius: 8, border: "1px solid var(--line-2)", background: "transparent", color: "var(--plum)", fontSize: 12, fontFamily: "inherit", cursor: "pointer" }}
                    >Edit</button>
                  )}
                />
                <div className="mt-4 rounded-[14px] border border-[var(--line)] overflow-hidden" style={{ background: "var(--cream-panel)" }}>
                  {members.length === 0 && !pendingAddMemberIds.size ? (
                    <div className="px-4 py-5 text-center"><p className="text-[13px] text-[var(--muted-text)]">No members yet.</p></div>
                  ) : (
                    <>
                      {members.map((m, i) => {
                        const mealDone = m.meal_taken && m.meal_semester === semester
                        const isPendingRemove = pendingRemoveMemberIds.has(m.user_id)
                        const isConfirming = confirmRemoveSgMemberId === m.user_id
                        return (
                          <div key={m.id} className="flex items-center gap-3 px-4 py-3" style={{ borderTop: i === 0 ? "none" : "1px solid var(--line-3)", background: isPendingRemove || isConfirming ? "#FDF8F8" : "transparent" }}>
                            <MonogramChip initials={getInitials(m.name)} className="w-7 h-7 text-[11px] font-semibold" />
                            <p className={`flex-1 text-[14px] ${isPendingRemove ? "line-through text-[var(--danger)]" : "text-[var(--ink)]"}`}>{m.name}</p>
                            {isEditing ? (
                              isPendingRemove ? (
                                <button onClick={() => setPendingRemoveMemberIds(prev => { const n = new Set(prev); n.delete(m.user_id); return n })} style={{ fontSize: 11, fontWeight: 600, color: "var(--muted-text)", background: "none", border: "none", cursor: "pointer", padding: "2px 6px" }}>Undo</button>
                              ) : isConfirming ? (
                                <div style={{ display: "flex", gap: 8 }}>
                                  <button onClick={() => { setPendingRemoveMemberIds(prev => new Set([...prev, m.user_id])); setConfirmRemoveSgMemberId(null) }} style={{ fontSize: 11, fontWeight: 600, color: "var(--danger)", background: "none", border: "none", cursor: "pointer", padding: "2px 6px" }}>Remove</button>
                                  <button onClick={() => setConfirmRemoveSgMemberId(null)} style={{ fontSize: 11, fontWeight: 500, color: "var(--muted-text)", background: "none", border: "none", cursor: "pointer", padding: "2px 6px" }}>Keep</button>
                                </div>
                              ) : (
                                <IconButton dim={24} onClick={() => setConfirmRemoveSgMemberId(m.user_id)} title="Remove"><X style={{ width: 13, height: 13 }} /></IconButton>
                              )
                            ) : (
                              <button onClick={() => toggleMeal(m)} style={{ padding: "4px 10px", borderRadius: 8, cursor: "pointer", border: mealDone ? "none" : "1px solid var(--line-2)", background: mealDone ? "#EDE5F0" : "transparent", fontSize: 11, fontWeight: 600, color: mealDone ? "var(--plum)" : "var(--muted-text)", letterSpacing: "0.03em", textTransform: "uppercase" as const }}>
                                {mealDone ? "Meal ✓" : "Meal"}
                              </button>
                            )}
                          </div>
                        )
                      })}
                      {isEditing && Array.from(pendingAddMemberIds).map((uid) => {
                        const person = allMembersForPicker.find(p => p.id === uid)
                        if (!person) return null
                        return (
                          <div key={uid} className="flex items-center gap-3 px-4 py-3 border-t border-[var(--line-3)]" style={{ background: "rgba(62,21,64,0.03)" }}>
                            <MonogramChip initials={getInitials(person.name)} className="w-7 h-7 text-[11px] font-semibold" />
                            <p className="flex-1 text-[14px] text-[var(--ink)]">{person.name}</p>
                            <span style={{ fontSize: 9, fontWeight: 600, letterSpacing: "0.05em", color: "var(--plum)", background: "rgba(62,21,64,0.06)", border: "1px solid rgba(62,21,64,0.15)", borderRadius: 4, padding: "1px 5px", marginRight: 4 }}>ADDING</span>
                            <IconButton dim={24} onClick={() => setPendingAddMemberIds(prev => { const n = new Set(prev); n.delete(uid); return n })} title="Remove"><X style={{ width: 13, height: 13 }} /></IconButton>
                          </div>
                        )
                      })}
                    </>
                  )}
                  {isEditing && (
                    <div className="border-t border-[var(--line-3)]">
                      {showSgAddPicker ? (
                        <div className="p-3">
                          <input type="text" placeholder="Search members…" value={sgAddPickerSearch} onChange={e => setSgAddPickerSearch(e.target.value)} autoFocus style={{ width: "100%", border: "1px solid var(--line-2)", borderRadius: 10, padding: "7px 12px", fontSize: 13, fontFamily: "var(--font-inter)", outline: "none", background: "var(--cream-panel)", marginBottom: 6 }} />
                          <div style={{ maxHeight: 180, overflowY: "auto", borderRadius: 10, border: "1px solid var(--line)", background: "var(--cream-panel)" }}>
                            {addableMembers.length === 0 ? (
                              <div className="px-4 py-4 text-center"><p style={{ fontSize: 12, color: "var(--muted-text)" }}>No members to add</p></div>
                            ) : addableMembers.map((p, i) => (
                              <div key={p.id} onClick={() => { setPendingAddMemberIds(prev => new Set([...prev, p.id])); setSgAddPickerSearch(""); setShowSgAddPicker(false) }} className={`flex items-center gap-3 px-4 py-3 cursor-pointer ${i < addableMembers.length - 1 ? "border-b border-[var(--line-3)]" : ""}`}>
                                <MonogramChip initials={getInitials(p.name)} className="w-7 h-7 text-[11px] font-semibold" />
                                <p style={{ fontSize: 13, color: "var(--ink)" }}>{p.name}</p>
                              </div>
                            ))}
                          </div>
                          <button onClick={() => { setShowSgAddPicker(false); setSgAddPickerSearch("") }} style={{ marginTop: 6, fontSize: 12, color: "var(--muted-text)", background: "none", border: "none", cursor: "pointer", padding: 0 }}>Cancel</button>
                        </div>
                      ) : (
                        <button onClick={() => setShowSgAddPicker(true)} style={{ width: "100%", padding: "12px 16px", display: "flex", alignItems: "center", gap: 8, background: "transparent", border: "none", cursor: "pointer", color: "var(--plum)", fontSize: 13, fontWeight: 500, fontFamily: "var(--font-inter)" }}>
                          <Plus style={{ width: 13, height: 13 }} /> Add member
                        </button>
                      )}
                    </div>
                  )}
                </div>

                {isEditing && (
                  <div style={{ marginTop: 10 }}>
                    {editError && <div style={{ marginBottom: 8, padding: "8px 12px", background: "#FEF2F2", border: "1px solid #FCA5A5", borderRadius: 10, fontSize: 12, color: "#B91C1C" }}>{editError}</div>}
                    <p style={{ fontSize: 11, color: "var(--muted-text)", marginBottom: 8, lineHeight: 1.5 }}>Changes sync to your group chat and will reflect immediately.</p>
                    <div className="flex gap-2">
                      <button onClick={() => { setEditingGroupId(null); setPendingAddMemberIds(new Set()); setPendingRemoveMemberIds(new Set()); setConfirmRemoveSgMemberId(null); setShowSgAddPicker(false); setSgAddPickerSearch(""); setEditError(null) }} style={{ flex: 1, padding: "9px 0", background: "transparent", color: "var(--body)", border: "1px solid var(--line-2)", borderRadius: 10, fontSize: 13, fontWeight: 500, cursor: "pointer", fontFamily: "inherit" }}>Cancel</button>
                      <CentralButton variant="primary" size="sm" onClick={() => handleSgEditSave(group.id)} disabled={editSaving || (pendingAddMemberIds.size === 0 && pendingRemoveMemberIds.size === 0)} style={{ flex: 1 }}>{editSaving ? "Saving…" : "Save changes"}</CentralButton>
                    </div>
                  </div>
                )}

                {pairedGroup && (
                  <div className="mt-3">
                    <p style={{ fontSize: 11, fontWeight: 600, color: "var(--muted-text)", letterSpacing: "0.06em", textTransform: "uppercase" as const, marginBottom: 8 }}>Paired — {pairedGroup.name}</p>
                    <div className="rounded-[14px] border border-[var(--line)] overflow-hidden" style={{ background: "var(--cream-panel)" }}>
                      {pairedMs.length === 0 ? (
                        <div className="px-4 py-5 text-center"><p className="text-[13px] text-[var(--muted-text)]">No members yet.</p></div>
                      ) : pairedMs.map((m, i) => (
                        <div key={m.id} className="flex items-center gap-3 px-4 py-3" style={{ borderTop: i === 0 ? "none" : "1px solid var(--line-3)" }}>
                          <MonogramChip initials={getInitials(m.name)} className="w-7 h-7 text-[11px] font-semibold" />
                          <p className="text-[14px] text-[var(--ink)]">{m.name}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </section>
            )
          })}

          {myGroups.length === 0 && (
            <EmptyState icon={<Users className="w-6 h-6" />} title="No small group assigned yet." subtitle="Your team president will assign you to a group." />
          )}

          </div>{/* end RIGHT COLUMN */}

        </div>
      )}

      {/* ── Schedule Tab ──────────────────────────────────────────────────── */}
      {effectiveSection === "schedule" && (
        <div className="flex flex-col gap-6">

          {/* Semester selector — president/admin only */}
          {isPresident && (
            <div className="flex items-center gap-3">
              <p style={{ ...EYEBROW_STYLE, margin: 0 }}>Semester</p>
              <select
                value={semester}
                onChange={e => setSemester(e.target.value)}
                style={{ fontSize: 13, padding: "6px 12px", border: "1px solid var(--line-2)", borderRadius: 9, background: "var(--cream-panel)", color: "var(--ink)", cursor: "pointer", outline: "none", fontFamily: "inherit" }}
              >
                {getSemesterOptions().map(opt => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
            </div>
          )}

          {/* Availability Grid — hidden for pastors */}
          {!isPastor && <div>
            <SglSH eyebrow={`MY AVAILABILITY · ${semesterLabel}`} title="Mark when you&apos;re not available" sub="Changes save automatically." />

            {!rosterConfirmedForSchedule ? (
              <div className="mt-4 rounded-[14px] border border-dashed border-[var(--line)] p-6 text-center" style={{ background: "var(--cream-panel)" }}>
                <p className="text-[14px] font-semibold text-[var(--ink)] mb-1">Roster not confirmed</p>
                <p className="text-[13px] text-[var(--muted-text)]">
                  The president needs to confirm the DGL roster before availability can be set.
                </p>
              </div>
            ) : (() => {
              const today = new Date().toISOString().split("T")[0]
              // Group semesterDates by month for eyebrow headers
              const monthGroups: { label: string; dates: { date: string; slot: DGLAvailSlot }[] }[] = []
              for (const entry of semesterDates) {
                const d = new Date(entry.date + "T12:00:00")
                const label = d.toLocaleDateString("en-US", { month: "long", year: "numeric" }).toUpperCase()
                const last = monthGroups[monthGroups.length - 1]
                if (!last || last.label !== label) monthGroups.push({ label, dates: [entry] })
                else last.dates.push(entry)
              }
              const nameColW = 76
              const datColW = 44
              // President sees all rows (own row is interactive, others read-only).
              // Non-president DGL sees only their own row.
              const displayMembers = isPresident
                ? scheduleRosterMembers
                : scheduleRosterMembers.filter(m => m.user_id === userId)
              return (
                <>
                  <p className="text-[12px] text-[var(--muted-text)] mb-3 mt-3">
                    Check dates when you&apos;re <span className="font-semibold text-[var(--plum)]">not available</span>. Changes save automatically.
                  </p>
                  <div className="rounded-[14px] border border-[var(--line)] overflow-hidden" style={{ background: "var(--cream-panel)" }}>
                    <div className="overflow-x-auto">
                      <table style={{ borderCollapse: "collapse", tableLayout: "fixed", minWidth: nameColW + semesterDates.length * datColW }}>
                        <thead>
                          {/* Month eyebrow row */}
                          <tr>
                            <th style={{ width: nameColW, minWidth: nameColW, position: "sticky", left: 0, background: "var(--cream-3)", zIndex: 2, borderBottom: "1px solid var(--line)" }} />
                            {monthGroups.map(group => (
                              <th
                                key={group.label}
                                colSpan={group.dates.length}
                                style={{ padding: "6px 8px 4px", fontSize: 9, fontWeight: 700, color: "var(--muted-text)", letterSpacing: "0.08em", textTransform: "uppercase" as const, borderBottom: "1px solid var(--line)", borderLeft: "1px solid var(--line)", background: "var(--cream-3)", textAlign: "left", whiteSpace: "nowrap" }}
                              >
                                {group.label}
                              </th>
                            ))}
                          </tr>
                          {/* Date header row */}
                          <tr>
                            <th style={{ width: nameColW, minWidth: nameColW, position: "sticky", left: 0, background: "var(--cream-3)", zIndex: 2, borderBottom: "1px solid var(--line)", borderRight: "1px solid var(--line)" }} />
                            {semesterDates.map(({ date, slot }) => {
                              const [, m, d] = date.split("-")
                              const isPast = date < today
                              return (
                                <th key={`${date}::${slot}`} style={{ width: datColW, minWidth: datColW, padding: "4px 2px 5px", borderBottom: "1px solid var(--line)", textAlign: "center" }}>
                                  <div style={{ fontSize: 9, fontWeight: 700, color: isPast ? "#C5C0CC" : "var(--body)", letterSpacing: "0.04em" }}>{SLOT_ABBR[slot]}</div>
                                  <div style={{ fontSize: 9, fontWeight: 400, color: isPast ? "#C5C0CC" : "var(--muted-text)" }}>{parseInt(m)}/{parseInt(d)}</div>
                                </th>
                              )
                            })}
                          </tr>
                        </thead>
                        <tbody>
                          {displayMembers.map((member, i) => (
                            <tr key={member.user_id} style={{ borderBottom: i < displayMembers.length - 1 ? "1px solid var(--line-3)" : undefined }}>
                              <td style={{ width: nameColW, minWidth: nameColW, position: "sticky", left: 0, background: "var(--cream-panel)", zIndex: 1, padding: "7px 12px", fontSize: 12, color: "var(--body)", fontWeight: 500, whiteSpace: "nowrap", borderRight: "1px solid var(--line)" }}>
                                {member.name.split(" ")[0]}
                              </td>
                              {semesterDates.map(({ date, slot }) => {
                                const key = `${date}::${slot}`
                                const isBusy = (allBusyMap.get(member.user_id) ?? new Set()).has(key)
                                const isPast = date < today
                                const isMe = member.user_id === userId
                                const canEdit = isMe  // own row is always editable; others are read-only
                                const isSavingThis = isMe && savingSlot === key
                                return (
                                  <td key={key} style={{ width: datColW, minWidth: datColW, padding: "5px 2px", textAlign: "center" }}>
                                    {canEdit ? (
                                      <button
                                        onClick={() => toggleBusy(date, slot)}
                                        disabled={isSavingThis}
                                        style={{ width: 22, height: 22, borderRadius: 5, border: isBusy ? "none" : "1.5px solid #D4CEDF", background: isBusy ? "var(--plum)" : "transparent", cursor: isSavingThis ? "not-allowed" : "pointer", opacity: isSavingThis ? 0.4 : 1, display: "inline-flex", alignItems: "center", justifyContent: "center", transition: "all 0.15s" }}
                                      >
                                        {isBusy && <X style={{ width: 10, height: 10, color: "var(--cream-on-dark)" }} />}
                                      </button>
                                    ) : (
                                      <div style={{ width: 22, height: 22, borderRadius: 5, border: isBusy ? "none" : "1.5px solid var(--line)", background: isBusy ? (isPast ? "#D4CEDF" : "var(--line)") : "transparent", opacity: isPast ? 0.5 : 1, display: "inline-flex", alignItems: "center", justifyContent: "center" }}>
                                        {isBusy && <X style={{ width: 10, height: 10, color: "var(--muted-text)" }} />}
                                      </div>
                                    )}
                                  </td>
                                )
                              })}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                  <p className="text-[11px] text-[var(--muted-text)] mt-2">Checked = unavailable. Changes save automatically.</p>
                  {/* Done button — non-president DGLs only */}
                  {!isPresident && (
                    <div className="mt-4 flex items-center gap-3">
                      {scheduleReady ? (
                        <span style={{ fontSize: 13, color: "var(--success)", fontWeight: 500, display: "flex", alignItems: "center", gap: 6 }}>
                          <Check style={{ width: 14, height: 14 }} /> Marked as done — the president will be notified.
                        </span>
                      ) : (
                        <CentralButton
                          variant="primary" size="sm"
                          onClick={handleMarkReady}
                        >
                          Done filling out →
                        </CentralButton>
                      )}
                    </div>
                  )}
                </>
              )
            })()}
          </div>}

          {/* Pastor: read-only view of published rotation */}
          {isPastor && (
            <div>
              <SglSH eyebrow="ROTATION" title={`Published — ${semesterLabel}`} />
              {existingAssignments.filter(a => a.published).length === 0 ? (
                <div className="mt-4 rounded-[14px] border border-dashed border-[var(--line)] p-6 text-center" style={{ background: "var(--cream-panel)" }}>
                  <p className="text-[13px] text-[var(--muted-text)]">The rotation hasn&apos;t been published yet.</p>
                </div>
              ) : (
                <div className="mt-4">
                  <DGLAssignmentTable
                    assignments={existingAssignments.filter(a => a.published)}
                    flaggedKeys={new Set()}
                  />
                </div>
              )}
            </div>
          )}

          {/* Rotation Assigner (president only) */}
          {isPresident && !isPastor && (
            <div>
              <SglSH
                eyebrow="ROTATION · WED PM · FRI SG · SUN SERVICE"
                title="Rotation Assigner"
                right={rotationPhase !== "idle" ? (
                  <div className="flex items-center gap-2">
                    {(rotationPhase === "saved" || rotationPhase === "published") && (
                      <>
                        <span style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "4px 10px", borderRadius: 999, background: rotationPhase === "published" ? "rgba(62,21,64,0.08)" : "var(--body-bg)", color: "var(--plum)", fontSize: 11, fontWeight: 500, letterSpacing: "0.02em" }}>
                          {rotationPhase === "published" ? "Published" : "Draft"}
                        </span>
                        <button onClick={handleGenerate} disabled={isGenerating} style={{ padding: "6px 12px", background: "transparent", color: "var(--body)", border: "1px solid var(--line-2)", borderRadius: 8, fontSize: 12, fontWeight: 500, fontFamily: "inherit", cursor: isGenerating ? "not-allowed" : "pointer", display: "flex", alignItems: "center", gap: 5 }}>
                          <Shuffle style={{ width: 11, height: 11 }} /> Re-generate
                        </button>
                        <button onClick={() => handlePublish(rotationPhase !== "published")} disabled={isPublishing} style={{ padding: "6px 12px", background: rotationPhase === "published" ? "transparent" : "var(--plum)", color: rotationPhase === "published" ? "var(--plum)" : "var(--cream-on-dark)", border: rotationPhase === "published" ? "1px solid var(--plum)" : "none", borderRadius: 8, fontSize: 12, fontWeight: 500, fontFamily: "inherit", cursor: isPublishing ? "not-allowed" : "pointer", opacity: isPublishing ? 0.6 : 1 }}>
                          {isPublishing ? "…" : rotationPhase === "published" ? "Unpublish" : "Publish"}
                        </button>
                      </>
                    )}
                  </div>
                ) : undefined}
              />

              {/* DGL readiness summary */}
              {rosterConfirmedForSchedule && scheduleRosterMembers.length > 0 && (
                <div className="mt-4 rounded-[14px] border border-[var(--line)] overflow-hidden" style={{ background: "var(--cream-panel)" }}>
                  <div className="px-5 py-3 border-b border-[var(--line-3)]" style={{ background: "var(--cream-3)" }}>
                    <p style={{ ...MONO_STYLE, margin: 0 }}>
                      Availability Status · {scheduleRosterMembers.filter(m => memberReadiness.get(m.user_id)).length}/{scheduleRosterMembers.length} Done
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2 px-5 py-3">
                    {scheduleRosterMembers.map(m => {
                      const ready = memberReadiness.get(m.user_id) ?? false
                      return (
                        <span key={m.user_id} style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 12, padding: "4px 10px", borderRadius: 999, background: ready ? "color-mix(in srgb, var(--success) 8%, transparent)" : "var(--body-bg)", border: `1px solid ${ready ? "color-mix(in srgb, var(--success) 20%, transparent)" : "var(--line)"}`, color: ready ? "var(--success)" : "var(--muted-text)", fontWeight: ready ? 500 : 400 }}>
                          {ready && <Check style={{ width: 10, height: 10 }} />}
                          {m.name.split(" ")[0]}
                          {!ready && <span style={{ fontSize: 10, opacity: 0.6 }}>…</span>}
                        </span>
                      )
                    })}
                  </div>
                </div>
              )}

              {!rosterConfirmedForSchedule ? (
                <div className="mt-4 rounded-[14px] border border-dashed border-[var(--line)] p-6 text-center" style={{ background: "var(--cream-panel)" }}>
                  <p className="text-[14px] font-semibold text-[var(--ink)] mb-1">Roster required</p>
                  <p className="text-[13px] text-[var(--muted-text)]">
                    Confirm the DGL roster on the Home tab first to generate a rotation.
                  </p>
                </div>
              ) : (
                <>
                  {rotErr && (
                    <div className="mt-3 mb-1 px-3 py-2.5 bg-[#FEF2F2] border border-[#FCA5A5] rounded-xl text-[13px] text-red-700">
                      {rotErr}
                    </div>
                  )}

                  {rotationPhase === "idle" && (
                    <div className="mt-4 rounded-[14px] border border-dashed border-[var(--line)] p-6 text-center" style={{ background: "var(--cream-panel)" }}>
                      <p className="text-[14px] font-semibold text-[var(--ink)] mb-1">No rotation yet</p>
                      <p className="text-[13px] text-[var(--muted-text)] mb-5">
                        Generate a fair rotation from DGL availability for {semesterLabel}.
                      </p>
                      <CentralButton variant="primary" size="md" onClick={handleGenerate} disabled={isGenerating}>
                        {isGenerating ? <><Loader2 style={{ width: 14, height: 14 }} className="animate-spin" /> Generating…</> : <><Shuffle style={{ width: 14, height: 14 }} /> Generate Rotation</>}
                      </CentralButton>
                    </div>
                  )}

                  {(rotationPhase === "saved" || rotationPhase === "published") && (() => {
                    // Group weeks by month for accordions
                    const byMonth = new Map<string, DGLAssignmentRow[]>()
                    for (const a of existingAssignments) {
                      const label = new Date(a.week_date + "T12:00:00").toLocaleDateString("en-US", { month: "long", year: "numeric" })
                      if (!byMonth.has(label)) byMonth.set(label, [])
                      byMonth.get(label)!.push(a)
                    }
                    const months = [...byMonth.keys()]
                    return (
                      <div className="mt-4 flex flex-col gap-3">
                        {months.map(month => {
                          const rows = byMonth.get(month)!
                          const weekDates = [...new Set(rows.map(r => r.week_date))].sort()
                          const isOpen = openRotMonths.has(month)
                          return (
                            <div key={month} className="rounded-[14px] border border-[var(--line)] overflow-hidden" style={{ background: "var(--cream-panel)" }}>
                              <button
                                onClick={() => setOpenRotMonths(prev => { const n = new Set(prev); isOpen ? n.delete(month) : n.add(month); return n })}
                                className="w-full flex items-center gap-3 px-5 py-4 text-left"
                                style={{ background: isOpen ? "var(--cream-3)" : "transparent", border: "none", cursor: "pointer", fontFamily: "inherit" }}
                              >
                                <ChevronDown style={{ width: 15, height: 15, color: "var(--body)", flexShrink: 0, transform: isOpen ? "rotate(0deg)" : "rotate(-90deg)", transition: "transform 0.15s" }} />
                                <span style={{ fontFamily: "var(--font-instrument-serif)", fontSize: 20, color: "var(--ink)", letterSpacing: "-0.01em", flex: 1 }}>{month}</span>
                                <span style={{ fontFamily: "var(--mono)", fontSize: 10, letterSpacing: "0.1em", color: "var(--muted-text)" }}>{weekDates.length} WEEKS</span>
                              </button>
                              {isOpen && (
                                <div style={{ borderTop: "1px solid var(--line-3)" }}>
                                  <DGLAssignmentTable
                                    assignments={rows}
                                    flaggedKeys={new Set()}
                                    rosterMembers={scheduleRosterMembers}
                                    onSwap={(wd, slot, uid, name) => {
                                      setExistingAssignments(prev => prev.map(a =>
                                        a.week_date === wd && a.slot === slot ? { ...a, user_id: uid, user_name: name } : a
                                      ))
                                      if (rotationPhase === "published") {
                                        const row = existingAssignments.find(a => a.week_date === wd && a.slot === slot)
                                        if (row) void supabase.from("dgl_assignments").update({ user_id: uid }).eq("id", row.id)
                                      }
                                    }}
                                  />
                                </div>
                              )}
                            </div>
                          )
                        })}
                      </div>
                    )
                  })()}

                  {rotationPhase === "generated" && (
                    <div className="mt-4">
                      {flagged.length > 0 && (
                        <div className="mb-3 px-3 py-2.5 bg-[#FFFBEB] border border-[#FDE68A] rounded-xl">
                          <p style={{ fontSize: 12, fontWeight: 600, color: "#92400E", marginBottom: 4 }}>
                            {flagged.length} week{flagged.length !== 1 ? "s" : ""} need review
                          </p>
                          {flagged.map((f, fi) => (
                            <p key={fi} style={{ fontSize: 12, color: "#92400E" }}>
                              {new Date(f.week_date + "T12:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" })} · {DGL_SLOT_LABELS[f.slot]} — {f.reason}
                            </p>
                          ))}
                        </div>
                      )}
                      <DGLAssignmentTable
                        assignments={proposedAssignments.map(a => ({
                          id: `${a.week_date}::${a.slot}::${a.user_id}`,
                          user_id: a.user_id, week_date: a.week_date, slot: a.slot,
                          semester, published: false, user_name: a.user_name,
                        }))}
                        flaggedKeys={flaggedKeys}
                        rosterMembers={scheduleRosterMembers}
                        onSwap={(wd, slot, uid, name) => {
                          setProposedAssignments(prev => prev.map(a =>
                            a.week_date === wd && a.slot === slot ? { ...a, user_id: uid, user_name: name } : a
                          ))
                        }}
                      />
                      <div className="flex items-center justify-between mt-4">
                        <button
                          onClick={() => { setProposedAssignments([]); setFlagged([]); setRotationPhase(existingAssignments.length === 0 ? "idle" : existingAssignments.some(r => r.published) ? "published" : "saved") }}
                          style={{ padding: "9px 18px", background: "transparent", color: "var(--body)", border: "1px solid var(--line-2)", borderRadius: 9, fontSize: 13, fontWeight: 500, fontFamily: "inherit", cursor: "pointer" }}
                        >
                          Discard
                        </button>
                        <CentralButton variant="primary" size="sm" onClick={handleSave} disabled={isSaving}>
                          {isSaving ? <><Loader2 style={{ width: 13, height: 13 }} className="animate-spin" /> Saving…</> : <><Check style={{ width: 13, height: 13 }} /> Save Draft</>}
                        </CentralButton>
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
          )}
        </div>
      )}
      </div>
    </div>
  )
}

// ── Bible Study Tab ────────────────────────────────────────────────────────────

function getRecentFridays(n = 8): string[] {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const day = today.getDay()
  const daysBack = (day - 5 + 7) % 7
  const lastFriday = new Date(today)
  lastFriday.setDate(today.getDate() - daysBack)
  const result: string[] = []
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(lastFriday)
    d.setDate(lastFriday.getDate() - i * 7)
    result.push(d.toISOString().split("T")[0])
  }
  return result
}

type BSSheet = {
  id: string
  title: string
  sort_order: number
  google_doc_url: string
  pdf_url: string | null
  pastor_notes: string | null
  status: "draft" | "finalized"
  finalized_at: string | null
  created_by: string
}

type BSAnnotation = { page: number; x: number; y: number; text: string }
type BSProgress = { user_id: string; name: string; progress_note: string | null }

// Pure SWR fetcher for the Bible-study sheet LIST (key: ["bible-study-sheets", teamId]).
async function fetchBibleStudySheets([, teamId]: readonly [string, string]) {
  const supabase = createClient()
  const { data } = await supabase
    .from("bible_study_sheets")
    .select("*")
    .eq("team_id", teamId)
    .order("sort_order", { ascending: true })
  return (data ?? []) as BSSheet[]
}

function BibleStudySubTab({
  teamId, ministryId, userId, isPastor, isPresident, onOpenChat,
}: {
  teamId: string
  ministryId: string
  userId: string
  isPastor: boolean
  isPresident: boolean
  onOpenChat?: (id: string, name: string, type?: string) => void
}) {
  const supabase = createClient()

  // Sheet list (SWR-cached) + selection
  const { data: sheetsData, isLoading: loadingSheets, mutate: mutateSheets } = useSWR(
    teamId ? (["bible-study-sheets", teamId] as const) : null,
    fetchBibleStudySheets,
    { keepPreviousData: false },
  )
  const sheets = useMemo(() => sheetsData ?? [], [sheetsData])
  const [selectedSheetId, setSelectedSheetId] = useState<string | null>(null)
  const [sheet, setSheet] = useState<BSSheet | null>(null)
  const [loadingSheet, setLoadingSheet] = useState(false)

  // Create form
  const [creating, setCreating] = useState(false)
  const [newTitle, setNewTitle] = useState("")
  const [newDocUrl, setNewDocUrl] = useState("")
  const [createError, setCreateError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  // Pastor notes (auto-save)
  const [noteDraft, setNoteDraft] = useState("")
  const [savingNote, setSavingNote] = useState(false)
  const noteTimeout = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Finalize
  const [finalizeConfirm, setFinalizeConfirm] = useState(false)
  const [finalizing, setFinalizing] = useState(false)
  const [finalizeError, setFinalizeError] = useState<string | null>(null)

  // PDF rendering
  const [pdfPages, setPdfPages] = useState<HTMLCanvasElement[]>([])
  const [renderingPdf, setRenderingPdf] = useState(false)

  // Annotations
  const [annotations, setAnnotations] = useState<BSAnnotation[]>([])
  const [pendingAnnotation, setPendingAnnotation] = useState<{ page: number; x: number; y: number } | null>(null)
  const [annotationText, setAnnotationText] = useState("")
  const [savingAnnotation, setSavingAnnotation] = useState(false)
  const [hoveredAnnotation, setHoveredAnnotation] = useState<number | null>(null)

  // Progress — team-level, independent of selected sheet
  const [progress, setProgress] = useState<BSProgress[]>([])
  const [myNote, setMyNote] = useState("")
  const [editingNote, setEditingNote] = useState(false)
  const [savingProgressNote, setSavingProgressNote] = useState(false)

  // Rename tab
  const [renamingId, setRenamingId] = useState<string | null>(null)
  const [renameValue, setRenameValue] = useState("")
  const [savingRename, setSavingRename] = useState(false)

  // Delete tab
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [confirmingDeleteId, setConfirmingDeleteId] = useState<string | null>(null)

  // Share
  const [sharing, setSharing] = useState(false)
  const [shareSuccess, setShareSuccess] = useState(false)

  // Load team progress independently (sheet list is SWR-cached above)
  useEffect(() => { void loadTeamProgress() }, [teamId]) // eslint-disable-line react-hooks/exhaustive-deps

  // Side-effect (was inside loadSheets): auto-select the most recent sheet once the list resolves.
  useEffect(() => {
    if (sheetsData && sheetsData.length > 0 && !selectedSheetId) {
      setSelectedSheetId(sheetsData[sheetsData.length - 1].id)
    }
  }, [sheetsData]) // eslint-disable-line react-hooks/exhaustive-deps

  // Load individual sheet whenever selection changes
  useEffect(() => {
    if (selectedSheetId) void loadSheetById(selectedSheetId)
    else { setSheet(null) }
  }, [selectedSheetId]) // eslint-disable-line react-hooks/exhaustive-deps

  async function loadSheetById(id: string) {
    setLoadingSheet(true)
    setPdfPages([])
    setAnnotations([])
    setFinalizeConfirm(false)
    setFinalizeError(null)
    setShareSuccess(false)
    const { data } = await supabase.from("bible_study_sheets").select("*").eq("id", id).maybeSingle()
    const s = data as BSSheet | null
    setSheet(s)
    if (s) {
      setNoteDraft(s.pastor_notes ?? "")
      if (s.status === "finalized" && s.pdf_url) {
        void renderPdf(s.pdf_url)
        void loadAnnotations(s.id)
      }
    }
    setLoadingSheet(false)
  }

  async function loadTeamProgress() {
    const { data: members } = await supabase
      .from("team_members")
      .select("user_id, profiles!user_id(name)")
      .eq("team_id", teamId)
    const { data: notes } = await supabase
      .from("bible_study_team_progress")
      .select("user_id, progress_note")
      .eq("team_id", teamId)
    type NoteRow = { user_id: string; progress_note: string | null }
    const noteMap = new Map<string, string | null>(
      (notes ?? []).map((r: NoteRow) => [r.user_id, r.progress_note])
    )
    type RawMember = { user_id: string; profiles: { name: string } | { name: string }[] | null }
    const rows = (members ?? []).map((m: RawMember) => {
      const p = Array.isArray(m.profiles) ? m.profiles[0] : m.profiles
      return { user_id: m.user_id, name: p?.name ?? "Unknown", progress_note: noteMap.has(m.user_id) ? noteMap.get(m.user_id)! : null }
    })
    setProgress(rows)
    const mine = rows.find(r => r.user_id === userId)
    if (mine) setMyNote(mine.progress_note ?? "")
  }

  async function renderPdf(url: string) {
    setRenderingPdf(true)
    try {
      const pdfjsLib = await import("pdfjs-dist")
      pdfjsLib.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs"
      const pdf = await pdfjsLib.getDocument(url).promise
      const canvases: HTMLCanvasElement[] = []
      for (let i = 1; i <= pdf.numPages; i++) {
        const page = await pdf.getPage(i)
        const viewport = page.getViewport({ scale: 1.5 })
        const canvas = document.createElement("canvas")
        canvas.width = viewport.width
        canvas.height = viewport.height
        const ctx = canvas.getContext("2d")!
        await page.render({ canvasContext: ctx, viewport, canvas }).promise
        canvases.push(canvas)
      }
      setPdfPages(canvases)
    } catch {
      // PDF failed to render — link fallback shown below
    } finally {
      setRenderingPdf(false)
    }
  }

  async function loadAnnotations(sheetId: string) {
    const { data } = await supabase
      .from("bible_study_annotations")
      .select("annotations")
      .eq("sheet_id", sheetId)
      .eq("user_id", userId)
      .maybeSingle()
    setAnnotations((data?.annotations as BSAnnotation[]) ?? [])
  }

  async function saveProgressNote(note: string) {
    setSavingProgressNote(true)
    await supabase
      .from("bible_study_team_progress")
      .upsert({ team_id: teamId, user_id: userId, ministry_id: ministryId, progress_note: note, updated_at: new Date().toISOString() }, { onConflict: "team_id,user_id" })
    setSavingProgressNote(false)
    setEditingNote(false)
    void loadTeamProgress()
  }

  async function handleCreate() {
    if (!newTitle.trim()) { setCreateError("Enter a chapter name."); return }
    if (!newDocUrl.trim()) { setCreateError("Paste a Google Doc URL."); return }
    if (!newDocUrl.includes("docs.google.com/document")) { setCreateError("Please paste a Google Docs link."); return }
    setSaving(true)
    setCreateError(null)
    const { data: inserted, error } = await supabase.from("bible_study_sheets").insert({
      team_id: teamId,
      ministry_id: ministryId,
      title: newTitle.trim(),
      sort_order: sheets.length,
      google_doc_url: newDocUrl.trim(),
      status: "draft",
      created_by: userId,
    }).select().maybeSingle()
    if (error) { setCreateError(error.message); setSaving(false); return }
    setCreating(false)
    setNewTitle("")
    setNewDocUrl("")
    await mutateSheets()
    if (inserted) setSelectedSheetId(inserted.id)
    setSaving(false)
  }

  function handleNoteChange(v: string) {
    setNoteDraft(v)
    if (noteTimeout.current) clearTimeout(noteTimeout.current)
    if (!sheet) return
    noteTimeout.current = setTimeout(async () => {
      setSavingNote(true)
      await savePastorNotesAction(sheet.id, v)
      setSavingNote(false)
    }, 1200)
  }

  async function handleFinalize() {
    if (!sheet) return
    setFinalizing(true)
    setFinalizeError(null)
    const result = await finalizeBibleStudyAction(sheet.id, sheet.google_doc_url, userId)
    if (result.error) { setFinalizeError(result.error); setFinalizing(false); return }
    const updated = { ...sheet, status: "finalized" as const, pdf_url: result.publicUrl ?? null }
    setSheet(updated)
    setFinalizeConfirm(false)
    if (result.publicUrl) {
      void renderPdf(result.publicUrl)
      void loadAnnotations(sheet.id)
    }
    setFinalizing(false)
  }

  async function saveAnnotations(next: BSAnnotation[]) {
    if (!sheet) return
    setAnnotations(next)
    await supabase.from("bible_study_annotations").upsert(
      { sheet_id: sheet.id, user_id: userId, annotations: next, updated_at: new Date().toISOString() },
      { onConflict: "sheet_id,user_id" }
    )
  }

  async function handleAddAnnotation() {
    if (!pendingAnnotation || !annotationText.trim()) return
    setSavingAnnotation(true)
    await saveAnnotations([...annotations, { ...pendingAnnotation, text: annotationText.trim() }])
    setPendingAnnotation(null)
    setAnnotationText("")
    setSavingAnnotation(false)
  }

  async function handleDeleteAnnotation(idx: number) {
    await saveAnnotations(annotations.filter((_, i) => i !== idx))
  }

  async function handleRename(id: string) {
    if (!renameValue.trim()) { setRenamingId(null); return }
    setSavingRename(true)
    await supabase.from("bible_study_sheets").update({ title: renameValue.trim() }).eq("id", id)
    setSavingRename(false)
    setRenamingId(null)
    await mutateSheets()
  }

  async function handleDelete(id: string) {
    setDeletingId(id)
    await supabase.from("bible_study_sheets").delete().eq("id", id)
    setDeletingId(null)
    setConfirmingDeleteId(null)
    const nextSheets = sheets.filter(s => s.id !== id)
    if (selectedSheetId === id) {
      setSelectedSheetId(nextSheets.length > 0 ? nextSheets[nextSheets.length - 1].id : null)
    }
    setSheet(null)
    // Optimistically drop the deleted sheet, then revalidate.
    void mutateSheets(nextSheets, { revalidate: true })
  }

  async function handleShare() {
    if (!sheet?.pdf_url) return
    setSharing(true)
    const label = sheet.title

    // Find the DG church chat via small_groups.chat_group_id for this user's group
    const { data: sg } = await supabase
      .from("small_groups")
      .select("chat_group_id, groups!chat_group_id(id, name)")
      .eq("team_id", teamId)
      .eq("leader_id", userId)
      .maybeSingle()

    type SGRow = { chat_group_id: string | null; groups: { id: string; name: string } | { id: string; name: string }[] | null }
    const row = sg as SGRow | null
    const groupRaw = row?.groups
    const targetGroup = groupRaw
      ? Array.isArray(groupRaw) ? groupRaw[0] : groupRaw
      : null

    if (targetGroup?.id) {
      await supabase.from("messages").insert({
        group_id: targetGroup.id,
        sender_id: userId,
        content: `Bible Study: ${label}`,
        attachment_url: sheet.pdf_url,
        attachment_type: "application/pdf",
        attachment_name: `Bible Study — ${label}.pdf`,
        message_type: "attachment",
      })
      setShareSuccess(true)
    } else {
      setFinalizeError("No DG group chat found. Make sure your DG roster has been set up with auto-chats enabled.")
    }
    setSharing(false)
  }

  if (loadingSheets) {
    return <div style={{ display: "flex", justifyContent: "center", paddingTop: 48 }}><Loader2 className="w-5 h-5 animate-spin text-[var(--muted-text)]" /></div>
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>

      {/* ── Where We Left Off — always visible, independent of selected chapter ── */}
      {progress.length > 0 && (
        <div>
          <PlanSectionHeader>Where We Left Off</PlanSectionHeader>
          <div style={{ background: "var(--cream)", borderRadius: 14, border: "1px solid var(--line)", overflow: "hidden" }}>
            {progress.map((p, i) => {
              const isMe = p.user_id === userId
              const isLast = i === progress.length - 1
              return (
                <div key={p.user_id} style={{ borderBottom: isLast ? "none" : "1px solid #F8F6F1" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 16px" }}>
                    <MonogramChip initials={getInitials(p.name)} style={{ width: 28, height: 28, fontSize: 11, fontWeight: 600 }} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <p style={{ fontSize: 13, color: "var(--ink)", fontWeight: isMe ? 600 : 400 }}>{p.name}{isMe ? " (you)" : ""}</p>
                      {p.progress_note && !isMe && (
                        <p style={{ fontSize: 12, color: "var(--body)", marginTop: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" as const }}>{p.progress_note}</p>
                      )}
                      {isMe && !editingNote && p.progress_note && (
                        <p style={{ fontSize: 12, color: "var(--body)", marginTop: 1 }}>{p.progress_note}</p>
                      )}
                    </div>
                    {!isPastor && isMe && !editingNote && (
                      <button
                        onClick={() => setEditingNote(true)}
                        style={{ fontSize: 11, color: "var(--plum)", fontWeight: 600, background: "rgba(62,21,64,0.07)", border: "none", cursor: "pointer", padding: "4px 8px", borderRadius: 6, fontFamily: "inherit", flexShrink: 0 }}
                      >
                        {p.progress_note ? "Edit" : "Add note"}
                      </button>
                    )}
                    {!isMe && !p.progress_note && (
                      <Circle style={{ width: 13, height: 13, color: "var(--dashed)", flexShrink: 0 }} />
                    )}
                  </div>
                  {isMe && editingNote && (
                    <div style={{ padding: "0 16px 12px 56px", display: "flex", flexDirection: "column", gap: 6 }}>
                      <input
                        autoFocus
                        value={myNote}
                        onChange={e => setMyNote(e.target.value)}
                        placeholder="e.g. Finished through the intro questions"
                        maxLength={120}
                        style={{ fontSize: 12, padding: "7px 10px", borderRadius: 8, border: "1.5px solid #C4B8CC", outline: "none", fontFamily: "inherit", color: "var(--ink)", width: "100%", boxSizing: "border-box" as const }}
                      />
                      <div style={{ display: "flex", gap: 6 }}>
                        <CentralButton
                          variant="primary" size="sm"
                          onClick={() => void saveProgressNote(myNote)}
                          disabled={savingProgressNote}
                        >
                          {savingProgressNote ? "Saving…" : "Save"}
                        </CentralButton>
                        <button
                          onClick={() => { setEditingNote(false); setMyNote(progress.find(r => r.user_id === userId)?.progress_note ?? "") }}
                          style={{ fontSize: 11, padding: "5px 10px", borderRadius: 7, background: "none", border: "1px solid #C4B8CC", color: "var(--body)", cursor: "pointer", fontFamily: "inherit" }}
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* ── Chapter tab strip ─────────────────────────────────────────────── */}
      <div style={{ display: "flex", gap: 8, overflowX: "auto", scrollbarWidth: "none" as const, paddingBottom: 2, alignItems: "center" }}>
        {sheets.map(s => {
          const isActive = selectedSheetId === s.id
          const isRenaming = renamingId === s.id
          const isConfirmingDelete = confirmingDeleteId === s.id
          return (
            <div key={s.id} style={{ flexShrink: 0, position: "relative" as const }}>
              {isRenaming ? (
                <div style={{ display: "flex", alignItems: "center", gap: 4, padding: "4px 10px", border: "1.5px solid var(--plum)", borderRadius: 20, background: "var(--cream-panel)" }}>
                  <input
                    autoFocus
                    value={renameValue}
                    onChange={e => setRenameValue(e.target.value)}
                    onKeyDown={e => { if (e.key === "Enter") void handleRename(s.id); if (e.key === "Escape") setRenamingId(null) }}
                    style={{ fontSize: 13, border: "none", outline: "none", background: "transparent", fontFamily: "inherit", color: "var(--ink)", width: 120 }}
                  />
                  <button onClick={() => void handleRename(s.id)} disabled={savingRename} style={{ background: "none", border: "none", cursor: "pointer", padding: 2, color: "var(--success)", display: "flex" }}>
                    <Check style={{ width: 13, height: 13 }} />
                  </button>
                  <button onClick={() => setRenamingId(null)} style={{ background: "none", border: "none", cursor: "pointer", padding: 2, color: "var(--muted-text)", display: "flex" }}>
                    <X style={{ width: 13, height: 13 }} />
                  </button>
                </div>
              ) : isConfirmingDelete ? (
                <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "4px 10px", border: "1.5px solid #E57373", borderRadius: 20, background: "#FFF5F5" }}>
                  <span style={{ fontSize: 12, color: "var(--danger)", whiteSpace: "nowrap" as const }}>Delete?</span>
                  <button onClick={() => void handleDelete(s.id)} disabled={deletingId === s.id} style={{ background: "none", border: "none", cursor: "pointer", padding: 2, color: "var(--danger)", fontWeight: 700, fontSize: 12, fontFamily: "inherit" }}>
                    {deletingId === s.id ? "…" : "Yes"}
                  </button>
                  <button onClick={() => setConfirmingDeleteId(null)} style={{ background: "none", border: "none", cursor: "pointer", padding: 2, color: "var(--muted-text)", display: "flex" }}>
                    <X style={{ width: 12, height: 12 }} />
                  </button>
                </div>
              ) : (
                <div style={{ display: "flex", alignItems: "center", gap: isActive && isPastor ? 4 : 0 }}>
                  <button
                    onClick={() => setSelectedSheetId(s.id)}
                    style={{
                      padding: "6px 14px", borderRadius: 20, fontSize: 13,
                      fontWeight: isActive ? 600 : 400,
                      border: isActive ? "1.5px solid var(--plum)" : "1.5px solid var(--line)",
                      background: isActive ? "var(--plum)" : "transparent",
                      color: isActive ? "var(--cream-on-dark)" : "var(--body)",
                      cursor: "pointer", whiteSpace: "nowrap" as const, fontFamily: "inherit",
                    }}
                  >
                    {s.title}
                  </button>
                  {isActive && isPastor && (
                    <>
                      <button
                        onClick={() => { setRenamingId(s.id); setRenameValue(s.title) }}
                        title="Rename"
                        style={{ background: "none", border: "none", cursor: "pointer", padding: "3px", color: "var(--muted-text)", display: "flex", flexShrink: 0 }}
                      >
                        <Pencil style={{ width: 12, height: 12 }} />
                      </button>
                      <button
                        onClick={() => setConfirmingDeleteId(s.id)}
                        title="Delete"
                        style={{ background: "none", border: "none", cursor: "pointer", padding: "3px", color: "var(--dashed)", display: "flex", flexShrink: 0 }}
                      >
                        <Trash2 style={{ width: 12, height: 12 }} />
                      </button>
                    </>
                  )}
                </div>
              )}
            </div>
          )
        })}
        {isPastor && !creating && (
          <button
            onClick={() => setCreating(true)}
            style={{ padding: "5px 12px", borderRadius: 20, fontSize: 13, border: "1.5px dashed #C4B8CC", background: "transparent", color: "var(--muted-text)", cursor: "pointer", whiteSpace: "nowrap" as const, flexShrink: 0, fontFamily: "inherit" }}
          >
            + New chapter
          </button>
        )}
      </div>

      {/* Create form */}
      {creating && (
        <div style={{ background: "var(--cream)", borderRadius: 16, border: "1px solid var(--line)", padding: "20px" }}>
          <p style={{ fontSize: 14, fontWeight: 600, color: "var(--ink)", marginBottom: 12 }}>New chapter</p>
          <input
            value={newTitle}
            onChange={e => setNewTitle(e.target.value)}
            placeholder="Chapter name (e.g. Romans 1)"
            style={{ width: "100%", padding: "9px 12px", fontSize: 13, border: "1.5px solid var(--line)", borderRadius: 8, fontFamily: "inherit", color: "var(--ink)", background: "var(--cream)", outline: "none", boxSizing: "border-box" as const, marginBottom: 8 }}
          />
          <input
            type="url"
            value={newDocUrl}
            onChange={e => setNewDocUrl(e.target.value)}
            placeholder="https://docs.google.com/document/d/..."
            style={{ width: "100%", padding: "9px 12px", fontSize: 13, border: "1.5px solid var(--line)", borderRadius: 8, fontFamily: "inherit", color: "var(--ink)", background: "var(--cream)", outline: "none", boxSizing: "border-box" as const, marginBottom: 8 }}
          />
          <p style={{ fontSize: 11, color: "var(--muted-text)", marginBottom: 10 }}>Make sure the doc is set to &ldquo;Anyone with the link can view&rdquo; before finalizing.</p>
          {createError && <p style={{ fontSize: 12, color: "var(--danger)", marginBottom: 8 }}>{createError}</p>}
          <div style={{ display: "flex", gap: 8 }}>
            <CentralButton variant="primary" size="sm" onClick={handleCreate} disabled={saving} style={{ flex: 1 }}>
              {saving ? "Saving…" : "Save"}
            </CentralButton>
            <button onClick={() => { setCreating(false); setCreateError(null); setNewTitle(""); setNewDocUrl("") }} style={{ flex: 1, padding: "8px 0", background: "transparent", color: "var(--body)", border: "1.5px solid var(--line)", borderRadius: 9, fontSize: 13, cursor: "pointer", fontFamily: "inherit" }}>
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Empty state (no chapters yet) */}
      {sheets.length === 0 && !creating && (
        <div style={{ background: "var(--cream)", borderRadius: 16, border: "1.5px dashed var(--line)", padding: "32px 24px", textAlign: "center" as const }}>
          <FileText style={{ width: 32, height: 32, color: "var(--dashed)", margin: "0 auto 12px" }} />
          <p style={{ fontSize: 14, fontWeight: 600, color: "var(--ink)", marginBottom: 4 }}>No chapters yet</p>
          <p style={{ fontSize: 13, color: "var(--muted-text)", marginBottom: isPastor ? 16 : 0 }}>
            {isPastor ? "Create the first chapter to get started." : "Check back when the pastor has added the first chapter."}
          </p>
        </div>
      )}

      {/* Sheet content */}
      {loadingSheet && (
        <div style={{ display: "flex", justifyContent: "center", paddingTop: 32 }}><Loader2 className="w-5 h-5 animate-spin text-[var(--muted-text)]" /></div>
      )}
      {sheet && !loadingSheet && (
        <>
          {/* Header row: status badge + open-doc link */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{
                fontSize: 10, fontWeight: 600, letterSpacing: "0.08em", textTransform: "uppercase" as const,
                padding: "3px 8px", borderRadius: 6,
                background: sheet.status === "finalized" ? "#E8F5E9" : "#FFF8E7",
                color: sheet.status === "finalized" ? "var(--success)" : "#8A6200",
              }}>
                {sheet.status === "finalized" ? "Finalized" : "Draft"}
              </span>
            </div>
            <a
              href={sheet.google_doc_url}
              target="_blank"
              rel="noopener noreferrer"
              style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 12, color: "var(--plum)", fontWeight: 600, textDecoration: "none" }}
            >
              <ExternalLink style={{ width: 12, height: 12 }} />
              Open doc
            </a>
          </div>

          {/* DRAFT: iframe preview */}
          {sheet.status === "draft" && (
            <div style={{ background: "var(--cream)", borderRadius: 12, border: "1px solid var(--line)", overflow: "hidden" }}>
              <iframe
                src={sheet.google_doc_url.replace(/\/edit.*$/, "") + "/preview"}
                style={{ width: "100%", height: 600, border: "none", display: "block" }}
                title="Bible Study Document"
              />
            </div>
          )}

          {/* FINALIZED: pdfjs-rendered pages with annotation overlay */}
          {sheet.status === "finalized" && (
            <div>
              {renderingPdf && (
                <div style={{ display: "flex", justifyContent: "center", padding: "32px 0" }}>
                  <Loader2 className="w-5 h-5 animate-spin text-[var(--muted-text)]" />
                </div>
              )}
              {!renderingPdf && pdfPages.length === 0 && sheet.pdf_url && (
                <div style={{ background: "var(--cream)", borderRadius: 12, border: "1px solid var(--line)", padding: 20, textAlign: "center" as const }}>
                  <p style={{ fontSize: 13, color: "var(--muted-text)", marginBottom: 12 }}>PDF preview unavailable.</p>
                  <a href={sheet.pdf_url} target="_blank" rel="noopener noreferrer" style={{ fontSize: 13, color: "var(--plum)", fontWeight: 600, textDecoration: "none" }}>
                    Download PDF →
                  </a>
                </div>
              )}
              {pdfPages.map((srcCanvas, pi) => (
                <div
                  key={pi}
                  style={{ position: "relative", marginBottom: 8, cursor: "crosshair", userSelect: "none" as const }}
                  onClick={e => {
                    if (pendingAnnotation !== null) return
                    const rect = e.currentTarget.getBoundingClientRect()
                    setPendingAnnotation({ page: pi, x: (e.clientX - rect.left) / rect.width, y: (e.clientY - rect.top) / rect.height })
                    setAnnotationText("")
                  }}
                >
                  <canvas
                    width={srcCanvas.width}
                    height={srcCanvas.height}
                    style={{ display: "block", width: "100%", borderRadius: pi === 0 ? "12px 12px 0 0" : pi === pdfPages.length - 1 ? "0 0 12px 12px" : "0", border: "1px solid var(--line)" }}
                    ref={el => { if (el) el.getContext("2d")?.drawImage(srcCanvas, 0, 0) }}
                  />
                  {annotations.filter(a => a.page === pi).map((ann, ai) => {
                    const globalIdx = annotations.findIndex((a, i) => a.page === pi && i === annotations.indexOf(ann) + ai)
                    const gIdx = annotations.indexOf(ann)
                    return (
                      <div
                        key={ai}
                        style={{
                          position: "absolute", left: `${ann.x * 100}%`, top: `${ann.y * 100}%`,
                          transform: "translate(-50%, -50%)", width: 22, height: 22, borderRadius: "50%",
                          background: "var(--plum)", border: "2px solid var(--cream-on-dark)", cursor: "pointer", zIndex: 10,
                          display: "flex", alignItems: "center", justifyContent: "center",
                          fontSize: 10, fontWeight: 700, color: "var(--cream-on-dark)",
                          boxShadow: "0 1px 4px rgba(0,0,0,0.25)",
                        }}
                        onMouseEnter={() => setHoveredAnnotation(gIdx)}
                        onMouseLeave={() => setHoveredAnnotation(null)}
                        onClick={e => { e.stopPropagation(); handleDeleteAnnotation(gIdx) }}
                      >
                        {gIdx + 1}
                        {hoveredAnnotation === gIdx && (
                          <div style={{
                            position: "absolute", bottom: "calc(100% + 6px)", left: "50%", transform: "translateX(-50%)",
                            background: "var(--ink)", color: "var(--cream-on-dark)", fontSize: 11, padding: "4px 8px", borderRadius: 6,
                            whiteSpace: "nowrap" as const, maxWidth: 200, zIndex: 20, pointerEvents: "none" as const,
                          }}>
                            {ann.text}
                            <div style={{ fontSize: 10, color: "var(--faint)" }}>Click to delete</div>
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              ))}
              {pdfPages.length > 0 && (
                <p style={{ fontSize: 11, color: "var(--muted-text)", textAlign: "center" as const, marginTop: 4 }}>
                  Click anywhere on the PDF to add a personal annotation. Annotations are private to you.
                </p>
              )}
            </div>
          )}

          {/* Pending annotation input */}
          {pendingAnnotation !== null && (
            <div style={{ background: "var(--cream)", borderRadius: 14, border: "1.5px solid var(--line)", padding: 16 }}>
              <p style={{ fontSize: 13, fontWeight: 600, color: "var(--ink)", marginBottom: 8 }}>Add annotation</p>
              <textarea
                autoFocus
                value={annotationText}
                onChange={e => setAnnotationText(e.target.value)}
                onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void handleAddAnnotation() } }}
                placeholder="Type your note…"
                style={{ width: "100%", resize: "none" as const, height: 68, padding: "8px 10px", fontSize: 13, border: "1.5px solid var(--line)", borderRadius: 8, fontFamily: "inherit", color: "var(--ink)", background: "var(--cream)", outline: "none", boxSizing: "border-box" as const, marginBottom: 8 }}
              />
              <div style={{ display: "flex", gap: 8 }}>
                <CentralButton variant="primary" size="sm" onClick={handleAddAnnotation} disabled={savingAnnotation || !annotationText.trim()} style={{ flex: 1 }}>
                  {savingAnnotation ? "Saving…" : "Save note"}
                </CentralButton>
                <button onClick={() => { setPendingAnnotation(null); setAnnotationText("") }} style={{ flex: 1, padding: "8px 0", background: "transparent", color: "var(--body)", border: "1.5px solid var(--line)", borderRadius: 9, fontSize: 13, cursor: "pointer", fontFamily: "inherit" }}>
                  Cancel
                </button>
              </div>
            </div>
          )}

          {/* Pastor notes */}
          <div>
            <PlanSectionHeader>
              {isPastor ? "Your Notes to DGLs" : "Pastor Notes"}
              {savingNote && <span style={{ fontSize: 11, color: "var(--muted-text)", marginLeft: 8, fontWeight: 400 }}>Saving…</span>}
            </PlanSectionHeader>
            {isPastor ? (
              <textarea
                value={noteDraft}
                onChange={e => handleNoteChange(e.target.value)}
                placeholder="Add notes for the DGLs…"
                style={{ width: "100%", resize: "vertical" as const, minHeight: 100, padding: "10px 12px", fontSize: 13, border: "1.5px solid var(--line)", borderRadius: 10, fontFamily: "inherit", color: "var(--ink)", background: "var(--cream)", outline: "none", boxSizing: "border-box" as const }}
              />
            ) : sheet.pastor_notes ? (
              <div style={{ padding: "12px 16px", background: "var(--body-bg)", borderRadius: 10, border: "1px solid var(--line)", fontSize: 13, color: "var(--ink)", lineHeight: 1.6, whiteSpace: "pre-wrap" as const }}>
                {sheet.pastor_notes}
              </div>
            ) : (
              <p style={{ fontSize: 13, color: "var(--muted-text)" }}>No notes added yet.</p>
            )}
          </div>

          {/* Finalize (pastor, draft only) */}
          {isPastor && sheet.status === "draft" && (
            <div>
              {!finalizeConfirm ? (
                <CentralButton
                  variant="primary" size="sm"
                  onClick={() => setFinalizeConfirm(true)}
                >
                  Finalize &amp; Export PDF →
                </CentralButton>
              ) : (
                <div style={{ padding: "14px 16px", background: "var(--cream-panel)", border: "1.5px solid var(--line)", borderRadius: 12 }}>
                  <p style={{ fontSize: 13, fontWeight: 600, color: "var(--ink)", marginBottom: 4 }}>Finalize this week&apos;s study?</p>
                  <p style={{ fontSize: 12, color: "var(--muted-text)", marginBottom: 10 }}>
                    The Google Doc will be exported to PDF and locked for annotation. Ensure the doc is publicly viewable.
                  </p>
                  {finalizeError && (
                    <div style={{ display: "flex", alignItems: "flex-start", gap: 6, marginBottom: 10 }}>
                      <AlertCircle style={{ width: 13, height: 13, color: "var(--danger)", flexShrink: 0, marginTop: 1 }} />
                      <p style={{ fontSize: 12, color: "var(--danger)" }}>{finalizeError}</p>
                    </div>
                  )}
                  <div style={{ display: "flex", gap: 8 }}>
                    <CentralButton variant="primary" size="sm" onClick={handleFinalize} disabled={finalizing} style={{ flex: 1 }}>
                      {finalizing ? <><Loader2 style={{ width: 13, height: 13 }} className="animate-spin" />Exporting…</> : "Confirm"}
                    </CentralButton>
                    <button onClick={() => { setFinalizeConfirm(false); setFinalizeError(null) }} style={{ flex: 1, padding: "8px 0", background: "transparent", color: "var(--body)", border: "1.5px solid var(--line)", borderRadius: 9, fontSize: 13, cursor: "pointer", fontFamily: "inherit" }}>
                      Cancel
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Share to chat (finalized, pastor or president) */}
          {sheet.status === "finalized" && (isPastor || isPresident) && onOpenChat && (
            <div>
              {shareSuccess ? (
                <p style={{ fontSize: 13, color: "var(--success)", fontWeight: 500, display: "flex", alignItems: "center", gap: 6 }}>
                  <CheckCircle2 style={{ width: 14, height: 14 }} />
                  Shared to group chat!
                </p>
              ) : (
                <button
                  onClick={handleShare}
                  disabled={sharing}
                  style={{ display: "flex", alignItems: "center", gap: 6, padding: "9px 18px", background: "transparent", color: "var(--plum)", border: "1.5px solid var(--plum)", borderRadius: 9, fontSize: 13, fontWeight: 600, cursor: sharing ? "not-allowed" : "pointer", opacity: sharing ? 0.6 : 1, fontFamily: "inherit" }}
                >
                  <Share2 style={{ width: 13, height: 13 }} />
                  {sharing ? "Sharing…" : "Share to group chat"}
                </button>
              )}
            </div>
          )}

        </>
      )}
    </div>
  )
}

function DGLAssignmentTable({
  assignments,
  flaggedKeys,
  onSwap,
  rosterMembers,
}: {
  assignments: DGLAssignmentRow[]
  flaggedKeys: Set<string>
  onSwap?: (weekDate: string, slot: DGLSlot, newUserId: string, newUserName: string) => void
  rosterMembers?: { user_id: string; name: string }[]
}) {
  const [editingCell, setEditingCell] = useState<{ weekDate: string; slot: DGLSlot } | null>(null)
  const [hoveredCell, setHoveredCell] = useState<{ weekDate: string; slot: DGLSlot } | null>(null)

  const byWeek = new Map<string, DGLAssignmentRow[]>()
  for (const a of assignments) {
    if (!byWeek.has(a.week_date)) byWeek.set(a.week_date, [])
    byWeek.get(a.week_date)!.push(a)
  }
  const weeks = [...byWeek.keys()].sort()

  if (weeks.length === 0) return (
    <p className="text-[13px] text-[var(--muted-text)] text-center py-6">No assignments generated.</p>
  )

  return (
    <div className="flex flex-col gap-2">
      {weeks.map(wd => {
        const weekRows = byWeek.get(wd) ?? []
        const d = new Date(wd + "T12:00:00")
        const dateStr = d.toLocaleDateString("en-US", { month: "short", day: "numeric" })
        const hasFlagged = SLOTS.some(s => flaggedKeys.has(`${wd}::${s}`))
        return (
          <div key={wd} className={`rounded-[12px] border overflow-hidden ${hasFlagged ? "border-[#FDE68A]" : "border-[var(--line)]"}`} style={{ background: "var(--cream-panel)" }}>
            <div className={`px-4 py-2.5 border-b flex items-center justify-between ${hasFlagged ? "border-[#FDE68A] bg-[#FFFBEB]" : "border-[var(--line-3)]"}`} style={hasFlagged ? {} : { background: "var(--cream-3)" }}>
              <span style={{ fontSize: 12, fontWeight: 600, color: hasFlagged ? "#92400E" : "var(--body)" }}>{dateStr}</span>
              {hasFlagged && (
                <span style={{ fontSize: 10, fontWeight: 600, color: "#92400E", letterSpacing: "0.06em", textTransform: "uppercase" as const }}>
                  Needs Review
                </span>
              )}
            </div>
            {SLOTS.map((slot, si) => {
              const isFriday = slot === "friday_sg"
              const fridayRows = isFriday ? weekRows.filter(a => a.slot === "friday_sg") : []
              const r = isFriday ? undefined : weekRows.find(a => a.slot === slot)
              const isFlagged = flaggedKeys.has(`${wd}::${slot}`)
              const isEditing = !isFriday && editingCell?.weekDate === wd && editingCell?.slot === slot
              const isHovered = !isFriday && hoveredCell?.weekDate === wd && hoveredCell?.slot === slot
              return (
                <div key={slot} className={`px-4 py-2.5 flex items-center justify-between ${si < SLOTS.length - 1 ? "border-b border-[var(--line-3)]" : ""} ${isFlagged ? "bg-[#FFFBEB]" : ""}`}>
                  <span style={{ fontSize: 11, fontWeight: 600, color: isFlagged ? "#B45309" : "var(--muted-text)", letterSpacing: "0.06em", textTransform: "uppercase" as const }}>
                    {DGL_SLOT_LABELS[slot]}
                  </span>
                  {isFriday ? (
                    <span style={{ fontSize: 13, fontWeight: 500, color: fridayRows.length > 0 ? "var(--ink)" : "#F87171" }}>
                      {fridayRows.length > 0 ? fridayRows.map(r => r.user_name.split(" ")[0]).join(" + ") : "Unassigned"}
                    </span>
                  ) : isEditing && rosterMembers && rosterMembers.length > 0 ? (
                    <select
                      autoFocus
                      defaultValue={r?.user_id ?? ""}
                      onChange={e => {
                        const selected = rosterMembers.find(m => m.user_id === e.target.value)
                        if (selected && onSwap) onSwap(wd, slot, selected.user_id, selected.name)
                        setEditingCell(null)
                      }}
                      onBlur={() => setEditingCell(null)}
                      style={{ fontSize: 13, border: "1.5px solid #D4CEDF", borderRadius: 6, padding: "3px 6px", fontFamily: "inherit", background: "var(--cream)", color: "var(--ink)", maxWidth: 160 }}
                    >
                      <option value="" disabled>Select…</option>
                      {rosterMembers.map(m => (
                        <option key={m.user_id} value={m.user_id}>{m.name}</option>
                      ))}
                    </select>
                  ) : (
                    <div
                      className="flex items-center gap-1"
                      style={{ cursor: onSwap ? "pointer" : "default" }}
                      onMouseEnter={() => onSwap ? setHoveredCell({ weekDate: wd, slot }) : undefined}
                      onMouseLeave={() => setHoveredCell(null)}
                      onClick={() => onSwap ? setEditingCell({ weekDate: wd, slot }) : undefined}
                    >
                      {r ? (
                        <span style={{ fontSize: 13, fontWeight: 500, color: "var(--ink)" }}>{r.user_name}</span>
                      ) : (
                        <span style={{ fontSize: 13, color: "#F87171", fontWeight: 500 }}>Unassigned</span>
                      )}
                      {onSwap && isHovered && (
                        <Pencil style={{ width: 11, height: 11, color: "var(--muted-text)", flexShrink: 0 }} />
                      )}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )
      })}
    </div>
  )
}
