"use client"

import { useState, useEffect, useRef, useCallback, useMemo } from "react"
import { useRouter } from "next/navigation"
import {
  ChevronRight, ChevronDown, ChevronLeft, X, Check, Plus, Settings, Trash2,
  Edit3, ArrowLeft, Calendar, List, Grid3x3, Users, MoreHorizontal, Search,
  Bold, Italic, Underline as UnderlineIcon, Strikethrough, ListOrdered,
  Indent, Outdent, AlignLeft, AlignCenter, AlignRight, ClipboardList, Pencil,
  Shuffle, Download, GripVertical, Loader2, MessageCircle,
  FileText, ExternalLink, CheckCircle2, Circle, Share2, AlertCircle,
} from "lucide-react"
import { useEditor, EditorContent } from "@tiptap/react"
import { Editor } from "@tiptap/core"
import StarterKit from "@tiptap/starter-kit"
import { Underline as TiptapUnderline } from "@tiptap/extension-underline"
import { TextAlign } from "@tiptap/extension-text-align"
import { TextStyle } from "@tiptap/extension-text-style"
import { Color } from "@tiptap/extension-color"
import { Placeholder } from "@tiptap/extension-placeholder"
import { createClient } from "@/lib/supabase"
import { getCategoryBudgetAllocation } from "@/app/actions/budget-planning"

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
import * as Y from "yjs"
import Collaboration from "@tiptap/extension-collaboration"
import { Spinner, EmptyState, PlanLineIcon, PlanSectionHeader, AnimateIn, HeaderActionButton, sidebarItemStyle } from "../components/shared"
import { getInitials } from "../utils"
import { TabPageHeader } from "@/components/central/tab-page-header"
import { PageTitle } from "@/components/central/page-title"
import { MonogramChip } from "@/components/central"
import type {
  PlanTabProps, UserTeam, Team, CalendarEvent, EventPlan, EventTask, EventRole, EventNote,
  TeamRole, TeamMemberDisplay, DraftRole, RoleDescription, RoleLink, MeetingNote,
  WorshipWeek, WorshipRoleRow, PraiseTeamMember, WorshipSong, WorshipInvite, WorshipChart, AnnotationObj, Category, CreateStep,
  EventType, EventExtraTab, EventNewFolk,
} from "../types"

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

const TEAM_PRESETS = [
  {
    id: "dgl",
    name: "Small Group Leaders",
    icon: "📖",
    description: "Discipleship and Bible study",
    roles: [
      { name: "DGL President", permissions: ["can_create_dgs", "can_view_dgs", "can_generate_bible_study", "can_track_attendance", "can_manage_team"] },
      { name: "Leader", permissions: ["can_create_dgs", "can_view_dgs", "can_generate_bible_study", "can_track_attendance"] },
    ],
  },
  {
    id: "board",
    name: "Student Org Board",
    icon: "🏛️",
    description: "Ministry operations and administration",
    roles: [
      { name: "President", permissions: ["can_plan_events", "can_view_finances", "can_manage_members", "can_track_attendance", "can_manage_team"] },
      { name: "Secretary", permissions: ["can_plan_events", "can_manage_members", "can_track_attendance"] },
      { name: "Treasurer", permissions: ["can_view_finances", "can_plan_events"] },
      { name: "Event Coordinator", permissions: ["can_plan_events", "can_track_attendance"] },
    ],
  },
  {
    id: "praise",
    name: "Praise Team",
    icon: "🎵",
    description: "Worship and music ministry",
    comingSoon: true,
    roles: [
      { name: "President", permissions: ["can_manage_worship_set", "can_view_worship_set", "can_generate_slides", "can_manage_team", "can_manage_schedule"] },
      { name: "Worship Leader", permissions: ["can_manage_worship_set", "can_view_worship_set", "can_generate_slides", "can_manage_team"] },
      { name: "Member", permissions: ["can_view_worship_set", "can_generate_slides"] },
    ],
  },
  {
    id: "tech",
    name: "Tech Team",
    icon: "💻",
    description: "Technical support and media",
    comingSoon: true,
    roles: [{ name: "Member", permissions: ["can_view_worship_set", "can_generate_slides"] }],
  },
  {
    id: "dg_praise",
    name: "DG Praise Team",
    icon: "🎵",
    description: "Discipleship group praise and worship",
    comingSoon: true,
    teamType: "dg_praise" as const,
    roles: [
      { name: "Leader", permissions: ["can_manage_worship_set", "can_view_worship_set"] },
      { name: "Member", permissions: ["can_view_worship_set"] },
    ],
  },
  {
    id: "one_time",
    name: "One-Time Event",
    icon: "⭐",
    description: "Praise team for a one-time event (SSO, Welcome Week, etc.)",
    comingSoon: true,
    teamType: "one_time" as const,
    roles: [
      { name: "Leader", permissions: ["can_manage_worship_set", "can_view_worship_set"] },
      { name: "Member", permissions: ["can_view_worship_set"] },
    ],
  },
]



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
    <div className="bg-white rounded-2xl border border-[#ECE8DE] p-4 shadow-[0_1px_4px_rgba(19,16,26,0.06)] opacity-70">
      <div className="flex items-start gap-3">
        <PlanLineIcon iconKey={icon} bg="#ffffff" fg="#3E1540" />
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2">
            <p className="text-[14px] font-semibold text-[#13101A]">{name}</p>
            <span className="text-[10px] font-medium text-[#8A8497] bg-[#F0EDE8] px-2 py-0.5 rounded-full whitespace-nowrap flex-shrink-0 mt-0.5">
              Soon
            </span>
          </div>
          <p className="text-[13px] text-[#5A5466] mt-0.5 leading-relaxed">{desc}</p>
        </div>
      </div>
    </div>
  )
}

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
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-1.5">
        <label className="text-[12px] font-medium text-[#8A8497]">Title</label>
        <input
          value={form.title}
          onChange={e => setForm({ ...form, title: e.target.value })}
          placeholder="e.g. Officer Handbook"
          className="w-full px-3 py-2.5 rounded-xl border border-[#ECE8DE] bg-white text-[14px] text-[#13101A] placeholder:text-[#C4C4C4] focus:outline-none focus:ring-2 focus:ring-[#3E1540]/20 focus:border-[#3E1540]/40 transition-all"
        />
      </div>
      <div className="flex flex-col gap-1.5">
        <label className="text-[12px] font-medium text-[#8A8497]">Description</label>
        <input
          value={form.description}
          onChange={e => setForm({ ...form, description: e.target.value })}
          placeholder="Optional short description"
          className="w-full px-3 py-2.5 rounded-xl border border-[#ECE8DE] bg-white text-[14px] text-[#13101A] placeholder:text-[#C4C4C4] focus:outline-none focus:ring-2 focus:ring-[#3E1540]/20 focus:border-[#3E1540]/40 transition-all"
        />
      </div>
      <div className="flex flex-col gap-1.5">
        <label className="text-[12px] font-medium text-[#8A8497]">URL</label>
        <input
          value={form.url}
          onChange={e => setForm({ ...form, url: e.target.value })}
          placeholder="https://…"
          type="url"
          className="w-full px-3 py-2.5 rounded-xl border border-[#ECE8DE] bg-white text-[14px] text-[#13101A] placeholder:text-[#C4C4C4] focus:outline-none focus:ring-2 focus:ring-[#3E1540]/20 focus:border-[#3E1540]/40 transition-all"
        />
      </div>
      <div className="flex gap-2">
        <button
          onClick={onSave}
          disabled={saving || !form.title.trim() || !form.url.trim()}
          className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-[#3E1540] text-[#F6F4EF] text-[13px] font-semibold hover:bg-[#2D0F2E] active:scale-[0.97] transition-[transform,background-color] duration-150 disabled:opacity-50"
        >
          <Check className="w-3.5 h-3.5" />
          {saving ? "Saving…" : isNew ? "Add Link" : "Save"}
        </button>
        <button
          onClick={onCancel}
          className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-[#F0EDE8] text-[#5A5466] text-[13px] font-semibold hover:bg-[#E5E0D2] transition-colors"
        >
          <X className="w-3.5 h-3.5" />
          Cancel
        </button>
      </div>
    </div>
  )
}

export function RoleDescriptionEditor({
  initialContent,
  onChange,
  placeholder,
  children,
  minHeight,
}: {
  initialContent: string
  onChange: (html: string) => void
  placeholder?: string
  children?: React.ReactNode
  minHeight?: number
}) {
  const editor = useEditor({
    immediatelyRender: false,
    extensions: [
      StarterKit,
      TiptapUnderline,
      TextAlign.configure({ types: ["heading", "paragraph"] }),
      TextStyle,
      Color,
      Placeholder.configure({ placeholder: placeholder ?? "Describe this role…" }),
    ],
    content: initialContent || "",
    onUpdate: ({ editor: e }) => { onChange(e.getHTML()) },
  })

  return (
    <div className="role-description-editor">
      <TiptapToolbar editor={editor} />
      {children}
      <div style={{ padding: "14px 16px", minHeight: minHeight ? minHeight + 28 : undefined }}>
        <EditorContent editor={editor} />
      </div>
    </div>
  )
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
  const [descDraft, setDescDraft] = useState("")
  const [savingDesc, setSavingDesc] = useState(false)

  const [links, setLinks] = useState<RoleLink[]>([])
  const [addingLink, setAddingLink] = useState(false)
  const [editingLinkId, setEditingLinkId] = useState<string | null>(null)
  const [linkForm, setLinkForm] = useState({ title: "", description: "", url: "" })
  const [savingLink, setSavingLink] = useState(false)

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

  async function saveDescription() {
    if (!teamId) return
    setSavingDesc(true)
    const now = new Date().toISOString()
    if (description) {
      await supabase.from("team_role_descriptions").update({ description: descDraft.trim(), updated_by: userId, updated_at: now }).eq("id", description.id)
    } else {
      await supabase.from("team_role_descriptions").insert({ team_id: teamId, role_name: roleName, description: descDraft.trim(), created_by: userId, updated_by: userId, updated_at: now })
    }
    setSavingDesc(false)
    setEditingDesc(false)
    loadContent()
  }

  async function saveLink() {
    if (!teamId) return
    setSavingLink(true)
    const now = new Date().toISOString()
    if (editingLinkId) {
      await supabase.from("team_role_links").update({ title: linkForm.title.trim(), description: linkForm.description.trim(), url: linkForm.url.trim(), updated_by: userId, updated_at: now }).eq("id", editingLinkId)
    } else {
      await supabase.from("team_role_links").insert({ team_id: teamId, role_name: roleName, title: linkForm.title.trim(), description: linkForm.description.trim(), url: linkForm.url.trim(), created_by: userId, updated_by: userId, updated_at: now })
    }
    setSavingLink(false)
    setAddingLink(false)
    setEditingLinkId(null)
    setLinkForm({ title: "", description: "", url: "" })
    loadContent()
  }

  async function deleteLink(id: string) {
    await supabase.from("team_role_links").delete().eq("id", id)
    setLinks(prev => prev.filter(l => l.id !== id))
  }

  function startEditLink(link: RoleLink) {
    setLinkForm({ title: link.title, description: link.description, url: link.url })
    setEditingLinkId(link.id)
    setAddingLink(false)
  }

  function cancelLink() {
    setAddingLink(false)
    setEditingLinkId(null)
    setLinkForm({ title: "", description: "", url: "" })
  }

  const cardStyle: React.CSSProperties = {
    background: "#FBF8F2",
    border: "1px solid #ECE8DE",
    borderRadius: 16,
    padding: "16px 20px",
    boxShadow: "0 1px 4px rgba(19,16,26,0.06)",
  }

  return (
    <div>
      {/* Role Description */}
      <div className="mb-10">
        <div className="flex items-center justify-between mb-3">
          <span style={{ fontFamily: "var(--font-instrument-serif)", fontSize: 22, fontWeight: 400, color: "#13101A", letterSpacing: "-0.01em" }}>
            Role Description
          </span>
          {canWrite && !editingDesc && (
            <button
              onClick={() => { setDescDraft(description?.description ?? ""); setEditingDesc(true) }}
              style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 13, color: "#3E1540", background: "none", border: "none", cursor: "pointer", fontFamily: "var(--font-inter)", fontWeight: 500 }}
            >
              <Edit3 className="w-3.5 h-3.5" />
              Edit
            </button>
          )}
        </div>
        {editingDesc ? (
          <div style={{ ...cardStyle, padding: 0, overflow: "hidden" }}>
            <RoleDescriptionEditor
              initialContent={descDraft}
              onChange={setDescDraft}
              placeholder={`Describe the ${roleName} role…`}
            />
            <div className="flex gap-2" style={{ padding: "10px 16px", borderTop: "1px solid #F0EDE8" }}>
              <button
                onClick={saveDescription}
                disabled={savingDesc}
                className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-[#3E1540] text-[#F6F4EF] text-[13px] font-semibold hover:bg-[#2D0F2E] active:scale-[0.97] transition-[transform,background-color] duration-150 disabled:opacity-50"
              >
                <Check className="w-3.5 h-3.5" />
                {savingDesc ? "Saving…" : "Save"}
              </button>
              <button
                onClick={() => setEditingDesc(false)}
                className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-[#F0EDE8] text-[#5A5466] text-[13px] font-semibold hover:bg-[#E5E0D2] transition-colors"
              >
                <X className="w-3.5 h-3.5" />
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <div style={cardStyle}>
            {description?.description ? (
              <div className="role-desc-view" dangerouslySetInnerHTML={{ __html: description.description }} />
            ) : (
              <p style={{ fontFamily: "var(--font-inter)", fontSize: 14, color: "#C4C4C4", margin: 0 }}>
                {canWrite ? "No description yet. Click Edit to add one." : "No description yet."}
              </p>
            )}
          </div>
        )}
      </div>

      {/* Relevant Links */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <span style={{ fontFamily: "var(--font-instrument-serif)", fontSize: 22, fontWeight: 400, color: "#13101A", letterSpacing: "-0.01em" }}>
            Relevant Links
          </span>
          {canWrite && !addingLink && editingLinkId === null && (
            <button
              onClick={() => { setLinkForm({ title: "", description: "", url: "" }); setEditingLinkId(null); setAddingLink(true) }}
              style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 13, color: "#3E1540", background: "none", border: "none", cursor: "pointer", fontFamily: "var(--font-inter)", fontWeight: 500 }}
            >
              <Plus className="w-3.5 h-3.5" />
              Add Link
            </button>
          )}
        </div>

        {addingLink && (
          <div style={{ ...cardStyle, marginBottom: 10 }}>
            <LinkForm form={linkForm} setForm={setLinkForm} onSave={saveLink} onCancel={cancelLink} saving={savingLink} isNew />
          </div>
        )}

        {links.length === 0 && !addingLink ? (
          <div style={{ ...cardStyle, textAlign: "center", padding: "28px 20px" }}>
            <p style={{ fontFamily: "var(--font-inter)", fontSize: 14, color: "#8A8497", margin: 0 }}>
              {canWrite ? "No links yet. Add one to get started." : "No links yet."}
            </p>
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {links.map(link =>
              editingLinkId === link.id ? (
                <div key={link.id} style={cardStyle}>
                  <LinkForm form={linkForm} setForm={setLinkForm} onSave={saveLink} onCancel={cancelLink} saving={savingLink} isNew={false} />
                </div>
              ) : (
                <div key={link.id} style={cardStyle}>
                  <div className="flex items-start gap-3">
                    <div className="flex-1 min-w-0">
                      <a
                        href={link.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        style={{ fontFamily: "var(--font-inter)", fontSize: 14, fontWeight: 600, color: "#3E1540", textDecoration: "underline", textUnderlineOffset: 2, wordBreak: "break-word" }}
                      >
                        {link.title}
                      </a>
                      {link.description && (
                        <p style={{ fontFamily: "var(--font-inter)", fontSize: 13, color: "#5A5466", margin: "3px 0 0", lineHeight: 1.55 }}>
                          {link.description}
                        </p>
                      )}
                      <p style={{ fontFamily: "var(--font-inter)", fontSize: 12, color: "#8A8497", margin: "3px 0 0", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {link.url}
                      </p>
                    </div>
                    {canWrite && (
                      <div className="flex items-center gap-0.5 flex-shrink-0 mt-0.5">
                        <button
                          onClick={() => startEditLink(link)}
                          className="p-1.5 rounded-lg hover:bg-[#EFEAE0] transition-colors"
                          title="Edit link"
                        >
                          <Edit3 className="w-3.5 h-3.5 text-[#8A8497]" />
                        </button>
                        <button
                          onClick={() => deleteLink(link.id)}
                          className="p-1.5 rounded-lg hover:bg-red-50 transition-colors"
                          title="Delete link"
                        >
                          <Trash2 className="w-3.5 h-3.5 text-[#8A8497] hover:text-red-500" />
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              )
            )}
          </div>
        )}
      </div>
    </div>
  )
}

const NOTE_COLORS = [
  "#000000", "#374151", "#6B7280",
  "#EF4444", "#F97316", "#EAB308",
  "#22C55E", "#3B82F6", "#8B5CF6",
  "#EC4899", "#3E1540",
]

export function TiptapToolbar({ editor }: { editor: Editor | null }) {
  const [showColors, setShowColors] = useState(false)
  const colorRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function onDown(e: MouseEvent) {
      if (colorRef.current && !colorRef.current.contains(e.target as Node)) setShowColors(false)
    }
    document.addEventListener("mousedown", onDown)
    return () => document.removeEventListener("mousedown", onDown)
  }, [])

  if (!editor) return null

  const btn = (active: boolean, action: () => void, title: string, icon: React.ReactNode) => (
    <button
      key={title}
      type="button"
      title={title}
      onMouseDown={e => { e.preventDefault(); action() }}
      style={{
        padding: "4px 5px",
        borderRadius: 5,
        border: "none",
        background: active ? "rgba(62,21,64,0.10)" : "transparent",
        color: active ? "#3E1540" : "#5A5466",
        cursor: "pointer",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        lineHeight: 1,
      }}
    >
      {icon}
    </button>
  )

  const div = <div style={{ width: 1, height: 14, background: "#ECE8DE", margin: "0 3px", flexShrink: 0 }} />
  const currentColor = (editor.getAttributes("textStyle") as { color?: string }).color

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 1, padding: "5px 8px", borderBottom: "1px solid #F0EDE8", flexWrap: "wrap", background: "#FDFBF7" }}>
      {btn(editor.isActive("bold"),      () => editor.chain().focus().toggleBold().run(),   "Bold",          <Bold size={12} />)}
      {btn(editor.isActive("italic"),    () => editor.chain().focus().toggleItalic().run(), "Italic",        <Italic size={12} />)}
      {btn(editor.isActive("underline"), () => editor.chain().focus().toggleUnderline().run(), "Underline",  <UnderlineIcon size={12} />)}
      {btn(editor.isActive("strike"),    () => editor.chain().focus().toggleStrike().run(), "Strikethrough", <Strikethrough size={12} />)}
      {div}
      {btn(editor.isActive("heading", { level: 1 }), () => editor.chain().focus().toggleHeading({ level: 1 }).run(), "Heading 1",
        <span style={{ fontSize: 11, fontWeight: 700, lineHeight: 1 }}>H1</span>)}
      {btn(editor.isActive("heading", { level: 2 }), () => editor.chain().focus().toggleHeading({ level: 2 }).run(), "Heading 2",
        <span style={{ fontSize: 11, fontWeight: 700, lineHeight: 1 }}>H2</span>)}
      {div}
      {btn(editor.isActive("bulletList"),  () => editor.chain().focus().toggleBulletList().run(),  "Bullet List",   <List size={12} />)}
      {btn(editor.isActive("orderedList"), () => editor.chain().focus().toggleOrderedList().run(), "Ordered List",  <ListOrdered size={12} />)}
      {btn(false, () => editor.chain().focus().sinkListItem("listItem").run(),  "Indent",  <Indent size={12} />)}
      {btn(false, () => editor.chain().focus().liftListItem("listItem").run(),  "Outdent", <Outdent size={12} />)}
      {div}
      {btn(editor.isActive({ textAlign: "left" }),   () => editor.chain().focus().setTextAlign("left").run(),   "Align Left",   <AlignLeft size={12} />)}
      {btn(editor.isActive({ textAlign: "center" }), () => editor.chain().focus().setTextAlign("center").run(), "Align Center", <AlignCenter size={12} />)}
      {btn(editor.isActive({ textAlign: "right" }),  () => editor.chain().focus().setTextAlign("right").run(),  "Align Right",  <AlignRight size={12} />)}
      {div}
      {/* Color picker */}
      <div ref={colorRef} style={{ position: "relative" }}>
        <button
          type="button"
          title="Text color"
          onMouseDown={e => { e.preventDefault(); setShowColors(v => !v) }}
          style={{
            padding: "3px 5px",
            borderRadius: 5,
            border: "none",
            background: showColors ? "rgba(62,21,64,0.10)" : "transparent",
            cursor: "pointer",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: 2,
          }}
        >
          <span style={{ fontSize: 12, fontWeight: 700, color: "#5A5466", lineHeight: 1 }}>A</span>
          <div style={{ width: 14, height: 2.5, borderRadius: 2, background: currentColor ?? "#374151" }} />
        </button>
        {showColors && (
          <div style={{
            position: "absolute",
            top: "calc(100% + 4px)",
            left: "50%",
            transform: "translateX(-50%)",
            background: "white",
            border: "1px solid #ECE8DE",
            borderRadius: 8,
            boxShadow: "0 4px 14px rgba(19,16,26,0.12)",
            padding: 8,
            display: "grid",
            gridTemplateColumns: "repeat(6, 1fr)",
            gap: 4,
            zIndex: 200,
            minWidth: 136,
          }}>
            {NOTE_COLORS.map(c => (
              <button
                key={c}
                type="button"
                onMouseDown={e => { e.preventDefault(); editor.chain().focus().setColor(c).run(); setShowColors(false) }}
                style={{
                  width: 18, height: 18, borderRadius: 4,
                  background: c,
                  border: currentColor === c ? "2px solid #3E1540" : "1.5px solid rgba(0,0,0,0.10)",
                  cursor: "pointer", padding: 0,
                }}
              />
            ))}
            <button
              type="button"
              title="Remove color"
              onMouseDown={e => { e.preventDefault(); editor.chain().focus().unsetColor().run(); setShowColors(false) }}
              style={{
                width: 18, height: 18, borderRadius: 4,
                background: "white", border: "1.5px solid #ECE8DE",
                cursor: "pointer", fontSize: 9, color: "#8A8497",
                display: "flex", alignItems: "center", justifyContent: "center", padding: 0,
              }}
            >✕</button>
          </div>
        )}
      </div>
    </div>
  )
}

// ── Collab presence colors ────────────────────────────────────────────────────
const COLLAB_COLORS = ["#7C3AED", "#0EA5E9", "#10B981", "#F59E0B", "#EF4444", "#EC4899"]
function hashUserId(id: string) {
  let h = 0
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0
  return h
}

interface CollabUser { userId: string; userName: string; color: string }

// ── Live collab hook ──────────────────────────────────────────────────────────
function useNoteCollab(noteId: string, userId: string, userName: string) {
  const supabase = createClient()
  const ydoc = useMemo(() => new Y.Doc(), [noteId]) // eslint-disable-line react-hooks/exhaustive-deps
  const [activeUsers, setActiveUsers] = useState<CollabUser[]>([])
  const receivedStateRef = useRef(false)
  const initDoneRef = useRef(false)
  const isApplyingRemote = useRef(false)
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null)
  const color = COLLAB_COLORS[hashUserId(userId) % COLLAB_COLORS.length]

  useEffect(() => {
    receivedStateRef.current = false
    initDoneRef.current = false

    const channel = supabase.channel(`meeting-note-${noteId}`, {
      config: { presence: { key: userId }, broadcast: { self: false } },
    })
    channelRef.current = channel

    // Receive Y.Doc incremental updates from other clients
    channel.on("broadcast", { event: "ydoc-update" }, ({ payload }: { payload: { update: number[] } }) => {
      Y.applyUpdate(ydoc, new Uint8Array(payload.update), "remote")
    })

    // Another client requesting our full state (they just joined)
    channel.on("broadcast", { event: "request-state" }, ({ payload }: { payload: { forUserId: string } }) => {
      const state = Y.encodeStateAsUpdate(ydoc)
      channel.send({ type: "broadcast", event: "state-response", payload: { update: Array.from(state), forUserId: payload.forUserId } })
    })

    // Full state response arriving for us
    channel.on("broadcast", { event: "state-response" }, ({ payload }: { payload: { update: number[]; forUserId: string } }) => {
      if (payload.forUserId !== userId) return
      Y.applyUpdate(ydoc, new Uint8Array(payload.update), "remote")
      // If the doc has content, we don't need to init from DB
      const frag = ydoc.getXmlFragment("default")
      if (frag.length > 0) receivedStateRef.current = true
    })

    // Live title broadcast
    channel.on("broadcast", { event: "title" }, ({ payload }: { payload: { title: string; userId: string } }) => {
      if (payload.userId === userId) return
      // Emit a custom DOM event that MeetingNoteCard listens to
      window.dispatchEvent(new CustomEvent(`note-title-${noteId}`, { detail: { title: payload.title } }))
    })

    // Presence: who's viewing/editing this note
    // Guard: presence listeners cannot be added after subscribe() — skip if channel already joined
    try {
      channel.on("presence", { event: "sync" }, () => {
        const state = channel.presenceState()
        const users = (Object.values(state).flat() as unknown as CollabUser[]).filter(u => u.userId !== userId)
        setActiveUsers(users)
      })
    } catch {
      // Channel already subscribed (React Strict Mode double-invoke) — presence will sync on next mount
    }

    // Broadcast our own Y.Doc updates to others (skip remote-origin updates and when applying fallback content)
    const onYUpdate = (update: Uint8Array, origin: unknown) => {
      if (origin === "remote" || isApplyingRemote.current) return
      channel.send({ type: "broadcast", event: "ydoc-update", payload: { update: Array.from(update) } })
    }
    ydoc.on("update", onYUpdate)

    channel.subscribe(async (status: string) => {
      if (status !== "SUBSCRIBED") return
      await channel.track({ userId, userName, color })
      // Ask existing clients for their current state
      channel.send({ type: "broadcast", event: "request-state", payload: { forUserId: userId } })
    })

    return () => {
      ydoc.off("update", onYUpdate)
      channel.untrack()
      // Synchronously remove from the realtime client's channel list so that
      // the next supabase.channel() call creates a fresh (unsubscribed) channel
      // rather than returning the still-subscribed existing one (React Strict Mode issue)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const rt = (supabase as any).realtime as { channels: unknown[]; _schedulePendingDisconnect?: () => void } | undefined
      if (rt) {
        rt.channels = rt.channels.filter((c: unknown) => c !== channel)
        if (rt.channels.length === 0) rt._schedulePendingDisconnect?.()
      }
      channel.unsubscribe().catch(() => {})
      channelRef.current = null
      ydoc.destroy()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [noteId, userId, userName])

  return { ydoc, activeUsers, receivedStateRef, initDoneRef, channelRef, color, isApplyingRemote }
}

export function MeetingNoteEditor({
  noteId,
  userId,
  userName,
  initialContent,
  onSave,
  onEditorReady,
}: {
  noteId: string
  userId: string
  userName: string
  initialContent: string
  onSave: (html: string) => Promise<void>
  onEditorReady?: (editor: Editor | null) => void
}) {
  const { ydoc, activeUsers, receivedStateRef, initDoneRef, isApplyingRemote } = useNoteCollab(noteId, userId, userName)
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const lastLocalEditRef = useRef(0)
  const editorRef = useRef<Editor | null>(null)

  const editor = useEditor({
    immediatelyRender: false,
    extensions: [
      StarterKit.configure({ undoRedo: false }), // Collaboration handles undo/redo
      TiptapUnderline,
      TextAlign.configure({ types: ["heading", "paragraph"] }),
      TextStyle,
      Color,
      Placeholder.configure({ placeholder: "Start writing your meeting notes here…" }),
      Collaboration.configure({ document: ydoc }),
    ],
    onUpdate: ({ editor: e }) => {
      if (isApplyingRemote.current) return
      lastLocalEditRef.current = Date.now()
      if (saveTimer.current) clearTimeout(saveTimer.current)
      saveTimer.current = setTimeout(() => onSave(e.getHTML()), 800)
    },
  })

  // Keep editorRef current so the postgres_changes handler can access the editor
  useEffect(() => { editorRef.current = editor }, [editor])

  // Init content from DB only if no other clients sent us their state
  useEffect(() => {
    if (!editor || initDoneRef.current) return
    const timer = setTimeout(() => {
      initDoneRef.current = true
      const frag = ydoc.getXmlFragment("default")
      if (!receivedStateRef.current && frag.length === 0 && initialContent) {
        isApplyingRemote.current = true
        editor.commands.setContent(initialContent)
        isApplyingRemote.current = false
      }
    }, 700)
    return () => clearTimeout(timer)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editor])

  // Fallback: postgres_changes catches updates that broadcast missed
  useEffect(() => {
    const supabase = createClient()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const ch = supabase.channel(`db-note-${noteId}`) as any
    try {
      ch.on("postgres_changes", { event: "UPDATE", schema: "public", table: "meeting_notes", filter: `id=eq.${noteId}` },
        (payload: { new: { body?: string } }) => {
          const newBody = payload.new?.body
          const ed = editorRef.current
          if (!newBody || !ed) return
          if (Date.now() - lastLocalEditRef.current < 2000) return // user actively typing
          if (newBody === ed.getHTML()) return // already up to date
          isApplyingRemote.current = true
          ed.commands.setContent(newBody)
          isApplyingRemote.current = false
        },
      ).subscribe()
    } catch {
      // Channel already subscribed (React Strict Mode double-invoke) — skip gracefully
    }
    return () => {
      // Synchronously remove from realtime channels list before async unsubscribe
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const rt = (supabase as any).realtime as { channels: unknown[] } | undefined
      if (rt) rt.channels = rt.channels.filter((c: unknown) => c !== ch)
      ch.unsubscribe?.().catch?.(() => {})
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [noteId])

  useEffect(() => { onEditorReady?.(editor) }, [editor]) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="meeting-note-editor">
      {/* Presence bar */}
      {activeUsers.length > 0 && (
        <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "7px 20px", borderBottom: "1px solid #F0EDE8", background: "#FDFBF7" }}>
          <div style={{ display: "flex" }}>
            {activeUsers.slice(0, 4).map((u, i) => (
              <div
                key={u.userId}
                title={u.userName}
                style={{ width: 22, height: 22, borderRadius: "50%", background: u.color, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 9, fontWeight: 700, color: "white", border: "2px solid white", marginLeft: i === 0 ? 0 : -6, flexShrink: 0 }}
              >
                {getInitials(u.userName)}
              </div>
            ))}
          </div>
          <span style={{ fontSize: 12, color: "#8A8497" }}>
            {activeUsers.length === 1
              ? `${activeUsers[0].userName.split(" ")[0]} is also editing`
              : `${activeUsers.length} others are editing`}
          </span>
          {/* Live pulse dot */}
          <div style={{ width: 6, height: 6, borderRadius: "50%", background: "#22C55E", marginLeft: 2, flexShrink: 0, boxShadow: "0 0 0 2px rgba(34,197,94,0.25)" }} />
        </div>
      )}
      <div style={{ padding: "20px 32px 44px" }}>
        <EditorContent editor={editor} />
      </div>
    </div>
  )
}

export function MeetingNoteCard({
  note,
  isExpanded,
  userId,
  userName,
  onToggle,
  onSaveTitle,
  onSaveBody,
}: {
  note: MeetingNote
  isExpanded: boolean
  userId: string
  userName: string
  onToggle: () => void
  onSaveTitle: (id: string, title: string) => Promise<void>
  onSaveBody: (id: string, body: string) => Promise<void>
}) {
  const supabase = createClient()
  const [localTitle, setLocalTitle] = useState(note.title)
  const titleChannelRef = useRef<ReturnType<typeof supabase.channel> | null>(null)
  const titleSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { setLocalTitle(note.title) }, [note.id, note.title])
  const [noteEditor, setNoteEditor] = useState<Editor | null>(null)

  // Listen for remote title changes when expanded
  useEffect(() => {
    if (!isExpanded) return
    const handler = (e: Event) => {
      const { title } = (e as CustomEvent).detail
      setLocalTitle(title)
    }
    window.addEventListener(`note-title-${note.id}`, handler)
    return () => window.removeEventListener(`note-title-${note.id}`, handler)
  }, [isExpanded, note.id])

  // Get channel ref from collab hook to broadcast title - we reuse the same channel name
  function broadcastTitle(title: string) {
    // We broadcast via a temporary send - the hook's channel handles this
    // Dispatch as CustomEvent so the useNoteCollab hook can pick it up (we go through the plan-tab channel)
    const ch = supabase.channel(`meeting-note-${note.id}`)
    ch.send({ type: "broadcast", event: "title", payload: { title, userId } }).catch(() => {})
  }

  const noteDateLabel = (() => {
    const d = new Date(note.date + "T12:00:00")
    return d.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })
  })()

  if (!isExpanded) {
    return (
      <div
        onClick={onToggle}
        style={{
          background: "white",
          borderRadius: 12,
          border: "1px solid #ECE8DE",
          padding: "13px 18px",
          cursor: "pointer",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 12,
          boxShadow: "0 1px 3px rgba(19,16,26,0.04)",
        }}
      >
        <div style={{ minWidth: 0, flex: 1 }}>
          <p style={{ fontFamily: "var(--font-instrument-serif)", fontSize: 15, fontWeight: 400, color: "#13101A", margin: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {note.title || "(Untitled)"}
          </p>
          <p style={{ fontSize: 12, color: "#8A8497", margin: "2px 0 0" }}>{noteDateLabel}</p>
        </div>
        <ChevronRight size={14} style={{ color: "#C4C4C4", flexShrink: 0 }} />
      </div>
    )
  }

  return (
    <div style={{ background: "white", borderRadius: 16, border: "1px solid #ECE8DE", boxShadow: "0 2px 12px rgba(19,16,26,0.08)", overflow: "hidden" }}>
      {/* Collapse strip */}
      <div
        onClick={onToggle}
        style={{
          padding: "11px 20px",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          borderBottom: "1px solid #F0EDE8",
          cursor: "pointer",
          background: "#FDFBF7",
        }}
      >
        <span style={{ fontFamily: "ui-monospace, monospace", fontSize: 10, color: "#8A8497", letterSpacing: "0.05em", textTransform: "uppercase" }}>
          {noteDateLabel}
        </span>
        <ChevronDown size={14} style={{ color: "#C4C4C4" }} />
      </div>

      <TiptapToolbar editor={noteEditor} />

      {/* Document body */}
      <div style={{ padding: "28px 32px 0" }}>
        <input
          value={localTitle}
          onChange={e => {
            setLocalTitle(e.target.value)
            if (titleSaveTimer.current) clearTimeout(titleSaveTimer.current)
            titleSaveTimer.current = setTimeout(() => {
              broadcastTitle(e.target.value)
              onSaveTitle(note.id, e.target.value)
            }, 400)
          }}
          placeholder="Untitled"
          style={{
            fontFamily: "var(--font-instrument-serif)",
            fontSize: 26,
            fontWeight: 400,
            color: "#13101A",
            letterSpacing: "-0.02em",
            lineHeight: 1.2,
            width: "100%",
            border: "none",
            background: "transparent",
            outline: "none",
            padding: 0,
            display: "block",
          }}
        />
        <div style={{ height: 1, background: "#F0EDE8", margin: "18px 0 0" }} />
      </div>
      <MeetingNoteEditor
        key={note.id}
        noteId={note.id}
        userId={userId}
        userName={userName}
        initialContent={note.body}
        onSave={(html) => onSaveBody(note.id, html)}
        onEditorReady={setNoteEditor}
      />
    </div>
  )
}

export function MeetingNotesSection({
  teamId,
  userId,
  userName,
  canWrite,
  startNewTrigger,
}: {
  teamId: string | null
  userId: string
  userName: string
  canWrite: boolean
  startNewTrigger?: number
}) {
  const supabase = createClient()
  const [notes, setNotes] = useState<MeetingNote[]>([])
  const [loading, setLoading] = useState(true)
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set())
  const [creating, setCreating] = useState(false)

  useEffect(() => {
    if (!teamId) return
    setNotes([])
    setExpandedIds(new Set())
    setLoading(true)
    supabase
      .from("meeting_notes")
      .select("*")
      .eq("team_id", teamId)
      .order("created_at", { ascending: false })
      .then(({ data }) => {
        const rows = (data ?? []) as MeetingNote[]
        setNotes(rows)
        if (rows.length > 0) setExpandedIds(new Set([rows[0].id]))
        setLoading(false)
      })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [teamId])

  useEffect(() => {
    if (startNewTrigger) createNote()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [startNewTrigger])

  async function createNote() {
    if (!teamId || creating) return
    setCreating(true)
    const noteNumber = notes.length + 1
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
      setNotes(prev => [newNote, ...prev])
      setExpandedIds(prev => new Set([newNote.id, ...prev]))
    }
  }

  async function saveTitle(id: string, title: string) {
    await supabase.from("meeting_notes").update({ title }).eq("id", id)
    setNotes(prev => prev.map(n => n.id === id ? { ...n, title } : n))
  }

  async function saveBody(id: string, body: string) {
    await supabase.from("meeting_notes").update({ body }).eq("id", id)
    setNotes(prev => prev.map(n => n.id === id ? { ...n, body } : n))
  }

  function toggleExpand(id: string) {
    setExpandedIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  return (
    <div>

      {loading ? (
        <div style={{ textAlign: "center", padding: "32px 0", color: "#8A8497", fontSize: 13 }}>Loading…</div>
      ) : notes.length === 0 ? (
        <div style={{ borderLeft: "1px solid #E8E2D2", paddingLeft: 24, paddingTop: 4, paddingBottom: 4 }}>
          <p style={{ fontFamily: "var(--font-instrument-serif)", fontStyle: "italic", fontSize: 15, color: "#A09A8C", margin: 0 }}>
            {canWrite ? "No notes yet — start a new one." : "No notes have been created yet."}
          </p>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {notes.map(note => (
            <MeetingNoteCard
              key={note.id}
              note={note}
              isExpanded={expandedIds.has(note.id)}
              userId={userId}
              userName={userName}
              onToggle={() => toggleExpand(note.id)}
              onSaveTitle={saveTitle}
              onSaveBody={saveBody}
            />
          ))}
        </div>
      )}
    </div>
  )
}

// ── StudentOrgTeamHome ─────────────────────────────────────────────────────────
// Full redesign per design spec: plum hero → General/Plan/Roster/Resources tabs →
// General = month calendar (click → EventPlanWorkspace directly) + UP NEXT + QUICK ADD + notes timeline

export function StudentOrgTeamHome({
  teamId, teamName, teamIcon, ministryId, userId, userName, userRole, isAdmin, canEdit, canEditBudget, onTeamSettings,
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
  isAdmin: boolean
  canEdit: boolean
  canEditBudget: boolean
  onTeamSettings?: () => void
  planningEvent: CalendarEvent | null
  onPlanningEventChange: (ev: CalendarEvent | null) => void
  refreshSignal?: number
  onOpenChat?: (id: string, name: string) => void
  desktopSection?: string
  isDesktopView?: boolean
  onCalEventsChange?: (events: CalendarEvent[]) => void
  onEditEvent?: () => void
}) {
  const supabase = createClient()
  const router = useRouter()
  const [teamTab, setTeamTab] = useState<"General" | "Meeting Notes" | "Events" | "Resources" | "Groups" | "Rotations">(() => {
    const p = typeof window !== "undefined" ? new URLSearchParams(window.location.search).get("sotab") : null
    return (["General", "Meeting Notes", "Events", "Resources", "Groups", "Rotations"].includes(p ?? "") ? p : "General") as "General" | "Meeting Notes" | "Events" | "Resources" | "Groups" | "Rotations"
  })

  function setTeamTabAndUrl(tab: "General" | "Meeting Notes" | "Events" | "Resources" | "Groups" | "Rotations") {
    setTeamTab(tab)
    const sp = new URLSearchParams(window.location.search)
    sp.set("sotab", tab)
    router.replace(`?${sp.toString()}`, { scroll: false })
  }

  // On desktop: section is driven by sidebar prop; on mobile: by internal teamTab state
  const displaySection = desktopSection ?? teamTab

  // Calendar
  const [calEvents, setCalEvents] = useState<CalendarEvent[]>([])
  const [plannedIds, setPlannedIds] = useState<Set<string>>(new Set())
  const [currentMonth, setCurrentMonth] = useState(new Date())
  const [calLoading, setCalLoading] = useState(true)

  // Add / delete
  const [showAddModal, setShowAddModal] = useState(false)
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [hoveredEventId, setHoveredEventId] = useState<string | null>(null)

  // Roster
  const [roster, setRoster] = useState<{ id: string; user_id: string; name: string; role: string }[]>([])

  // Resources tab — which role's content to display
  const [resourcesRole, setResourcesRole] = useState<string | null>(null)

  // Groups tab — trigger wizard from header button
  const [groupGenerateTrigger, setGroupGenerateTrigger] = useState(0)
  // Notes tab — trigger createNote from header button
  const [notesTrigger, setNotesTrigger] = useState(0)

  useEffect(() => {
    if (!ministryId) return
    setCalLoading(true)
    const q = supabase.from("calendar_events")
      .select("id, title, description, location, start_date, end_date, all_day, category, event_type, parent_event_id, linked_announcement_id, status, created_by")
      .eq("ministry_id", ministryId).is("parent_event_id", null).order("start_date")
    const run = teamId ? q.or(`team_id.eq.${teamId},team_id.is.null`) : q
    run.then(({ data }) => { const evs = (data ?? []) as CalendarEvent[]; setCalEvents(evs); setCalLoading(false); onCalEventsChange?.(evs) })
    supabase.from("event_plans").select("calendar_event_id").eq("ministry_id", ministryId)
      .then(({ data }) => setPlannedIds(new Set((data ?? []).map((p: { calendar_event_id: string }) => p.calendar_event_id))))
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [teamId, ministryId, refreshSignal])

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
    setCalEvents(prev => prev.filter(e => e.id !== evId))
    setPlannedIds(prev => { const next = new Set(prev); next.delete(evId); return next })
    setDeleteConfirmId(null)
    setDeleting(false)
    if (planningEvent?.id === evId) onPlanningEventChange(null)
  }

  const mono: React.CSSProperties = {
    fontFamily: "ui-monospace,'SF Mono',Menlo,monospace",
    fontSize: "11px", fontWeight: 600, letterSpacing: "0.1em", textTransform: "uppercase", color: "#8A8497",
  }

  if (planningEvent) {
    if (isDesktopView) {
      const evStart = new Date(planningEvent.start_date)
      const evDateStr = evStart.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" }).toUpperCase()
      const evCfg = getEventConfig(planningEvent)
      return (
        <div>
          <TabPageHeader>
            <PageTitle
              eyebrow={`${evCfg.label.toUpperCase()} · ${evDateStr}`}
              title={planningEvent.title}
            >
              {(planningEvent.description || planningEvent.location) && (
                <p style={{ marginTop: 6, fontSize: 14, color: "var(--muted-text)" }}>
                  {[planningEvent.description, planningEvent.location].filter(Boolean).join(" · ")}
                </p>
              )}
            </PageTitle>
            {canEdit && onEditEvent && (
              <button
                onClick={onEditEvent}
                style={{ width: 32, height: 32, display: "flex", alignItems: "center", justifyContent: "center", borderRadius: 9, border: "1px solid var(--line)", background: "var(--cream)", cursor: "pointer", flexShrink: 0, marginLeft: "auto", alignSelf: "flex-start", marginTop: 4 }}
                title="Edit event"
              >
                <Pencil style={{ width: 14, height: 14, color: "var(--muted-text)" }} />
              </button>
            )}
          </TabPageHeader>
          <EventPlanWorkspace
            inline
            hideHero
            calendarEvent={planningEvent}
            ministryId={ministryId}
            userId={userId}
            canEdit={canEdit}
            canEditBudget={canEditBudget}
            teamId={teamId}
            onClose={() => onPlanningEventChange(null)}
            onOpenChat={onOpenChat}
          />
        </div>
      )
    }
    return (
      <EventPlanWorkspace
        inline
        hideHero
        calendarEvent={planningEvent}
        ministryId={ministryId}
        userId={userId}
        canEdit={canEdit}
        canEditBudget={canEditBudget}
        teamId={teamId}
        onClose={() => onPlanningEventChange(null)}
        onOpenChat={onOpenChat}
      />
    )
  }

  const userRosterRole = roster.find(m => m.user_id === userId)?.role ?? null
  const activeResourcesRole = resourcesRole ?? userRosterRole ?? "President"
  const resourcesRoles = ["President", "Treasurer", "Secretary", "Event Coordinator"]

  return (
    <>
    <div>
      {/* Mobile tab strip — desktop uses sidebar nav */}
      {!isDesktopView && (
        <div style={{ marginBottom: 24 }}>
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
      )}

      {/* Desktop section header — shared TabPageHeader + PageTitle */}
      {isDesktopView && (() => {
        const sectionMeta: Record<string, string> = {
          General: "General", "Meeting Notes": "Meeting Notes", Events: "Events",
          Resources: "Resources", Groups: "Groups", Rotations: "Rotations",
        }
        const sectionTitle = sectionMeta[displaySection] ?? displaySection
        return (
          <TabPageHeader>
            <PageTitle title={sectionTitle} compact />
            {displaySection === "Events" && canEdit && (
              <HeaderActionButton label="New Event" onClick={() => setShowAddModal(true)} />
            )}
            {displaySection === "Resources" && userRosterRole && (
              <span style={{ fontSize: 11, fontWeight: 600, color: "#3E1540", background: "#F3EAF4", borderRadius: 9999, padding: "4px 10px", letterSpacing: "0.05em", textTransform: "uppercase", whiteSpace: "nowrap", flexShrink: 0, marginLeft: "auto" }}>
                {userRosterRole}
              </span>
            )}
            {displaySection === "Meeting Notes" && canEdit && (
              <HeaderActionButton label="Start new" onClick={() => setNotesTrigger(t => t + 1)} />
            )}
            {displaySection === "Groups" && canEdit && (
              <HeaderActionButton label="Generate groups" onClick={() => setGroupGenerateTrigger(t => t + 1)} />
            )}
          </TabPageHeader>
        )
      })()}

      {/* Desktop Resources role sub-strip (replaces pill buttons) */}
      {isDesktopView && displaySection === "Resources" && (
        <PlanSubTabStrip
          tabs={resourcesRoles.map(r => ({ key: r, label: r }))}
          active={activeResourcesRole}
          onChange={setResourcesRole}
        />
      )}

      {/* ── Tab content ── */}
      <div className="px-5 md:px-14" style={{ paddingTop: 24, paddingBottom: 60 }}>

        {/* GENERAL — calendar full-width + meeting notes */}
        {displaySection === "General" && (
          <div>
            <section>
              {calLoading ? (
                <div style={{ textAlign: "center", padding: "48px 0", color: "#8A8497", fontSize: 13 }}>Loading…</div>
              ) : (
                <MonthGrid
                  events={calEvents}
                  currentMonth={currentMonth}
                  onMonthChange={setCurrentMonth}
                  onSelectEvent={(ev) => onPlanningEventChange(ev)}
                />
              )}

              <p style={{ marginTop: 10, fontSize: 12, color: "#8A8497", display: "flex", alignItems: "center", gap: 6 }}>
                <span style={{ display: "inline-block", width: 6, height: 6, borderRadius: 99, background: "#3E1540" }} />
                Click any event to open its plan — no modal in between.
              </p>
            </section>
          </div>
        )}

        {/* NOTES — meeting notes timeline */}
        {displaySection === "Meeting Notes" && (
          <div>
            {!isDesktopView && (
              <div style={{ marginBottom: 28 }}>
                <p style={mono}>Meeting Notes</p>
                <h2 style={{ fontFamily: "var(--font-instrument-serif)", fontSize: 36, margin: "6px 0 0", letterSpacing: "-0.01em", color: "#13101A" }}>Meeting Notes</h2>
              </div>
            )}
            <MeetingNotesSection teamId={teamId} userId={userId} userName={userName} canWrite={canEdit} startNewTrigger={notesTrigger} />
          </div>
        )}

        {/* PLAN — events list with Plan → links */}
        {displaySection === "Events" && (
          <div>
            {/* Mobile header + New Event (desktop header is TabPageHeader above) */}
            {!isDesktopView && (
              <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", marginBottom: 28 }}>
                <div>
                  <p style={mono}>Events & planning</p>
                  <h2 style={{ fontFamily: "var(--font-instrument-serif)", fontSize: 36, margin: "6px 0 0", letterSpacing: "-0.01em", color: "#13101A" }}>Events</h2>
                </div>
                {canEdit && (
                  <button
                    onClick={() => setShowAddModal(true)}
                    style={{ display: "flex", alignItems: "center", gap: 6, padding: "8px 16px", borderRadius: 10, border: "none", background: "#2D0F2E", color: "#F6F4EF", fontSize: 13, fontWeight: 500, cursor: "pointer", flexShrink: 0, marginBottom: 4 }}
                  >
                    <Plus className="w-3.5 h-3.5" /> New Event
                  </button>
                )}
              </div>
            )}
            {calEvents.length === 0 ? (
              <div style={{ borderLeft: "2px solid #E8E2D2", paddingLeft: 20 }}>
                <p style={{ fontFamily: "var(--font-instrument-serif)", fontStyle: "italic", fontSize: 15, color: "#A09A8C" }}>No events yet. Click &ldquo;New Event&rdquo; to get started.</p>
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                {calEvents.map(ev => {
                  const isPlanned = plannedIds.has(ev.id)
                  const dateStr = new Date(ev.start_date).toLocaleDateString("en-US", { weekday: "short", month: "long", day: "numeric" })
                  const isConfirmDelete = deleteConfirmId === ev.id
                  const isHovered = hoveredEventId === ev.id
                  return (
                    <div
                      key={ev.id}
                      onClick={() => !isConfirmDelete && onPlanningEventChange(ev)}
                      onMouseEnter={() => !isConfirmDelete && setHoveredEventId(ev.id)}
                      onMouseLeave={() => setHoveredEventId(null)}
                      style={{
                        display: "flex", alignItems: "center", gap: 16,
                        padding: "16px 20px", borderRadius: 12,
                        border: `1px solid ${isConfirmDelete ? "#F0C8C8" : "var(--line)"}`,
                        background: isConfirmDelete ? "#FEF7F7" : isHovered ? "var(--ivory)" : "var(--body-bg)",
                        cursor: isConfirmDelete ? "default" : "pointer",
                        transition: "background 120ms ease, border-color 120ms ease",
                      }}
                    >
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <p style={{ fontFamily: "var(--font-instrument-serif)", fontSize: 17, color: isConfirmDelete ? "#9F3030" : "var(--ink)", margin: 0, letterSpacing: "-0.01em" }}>{ev.title}</p>
                        <p style={{ fontSize: 12, color: isConfirmDelete ? "#C08080" : "var(--muted-text)", margin: "3px 0 0", fontFamily: "var(--sans)" }}>
                          {isConfirmDelete ? "Delete this event and all its planning data?" : `${dateStr}${ev.location ? ` · ${ev.location}` : ""}`}
                        </p>
                      </div>
                      {isConfirmDelete ? (
                        <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
                          <button
                            onClick={e => { e.stopPropagation(); setDeleteConfirmId(null) }}
                            style={{ padding: "7px 14px", borderRadius: 9, border: "1px solid var(--line)", background: "transparent", fontSize: 13, fontWeight: 500, cursor: "pointer", color: "var(--body)", fontFamily: "var(--sans)" }}
                          >
                            Cancel
                          </button>
                          <button
                            onClick={e => { e.stopPropagation(); handleDeleteEvent(ev.id) }}
                            disabled={deleting}
                            style={{ padding: "7px 14px", borderRadius: 9, border: "none", background: "#9F3030", color: "#FBF8F2", fontSize: 13, fontWeight: 500, cursor: deleting ? "not-allowed" : "pointer", opacity: deleting ? 0.6 : 1, fontFamily: "var(--sans)" }}
                          >
                            {deleting ? "Deleting…" : "Delete"}
                          </button>
                        </div>
                      ) : (
                        <div style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
                          {isPlanned && (
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--muted-text)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                              <polyline points="20 6 9 17 4 12" />
                            </svg>
                          )}
                          {canEdit && (
                            <button
                              onClick={e => { e.stopPropagation(); setDeleteConfirmId(ev.id) }}
                              style={{ background: "none", border: "none", cursor: "pointer", padding: "4px 6px", color: "var(--muted-text)", flexShrink: 0, display: "flex", alignItems: "center", opacity: isHovered ? 1 : 0, transition: "opacity 120ms" }}
                              title="Delete event"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
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

        {/* RESOURCES — role links/docs */}
        {displaySection === "Resources" && (
          <div>
            {/* Mobile header + role pills (desktop gets TabPageHeader + PlanSubTabStrip above) */}
            {!isDesktopView && (
              <>
                <div style={{ marginBottom: 20 }}>
                  <p style={mono}>Team resources</p>
                  <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", marginTop: 6, gap: 12 }}>
                    <h2 style={{ fontFamily: "var(--font-instrument-serif)", fontSize: 36, margin: 0, letterSpacing: "-0.01em", color: "#13101A" }}>Resources</h2>
                    {userRosterRole && (
                      <span style={{ fontSize: 11, fontWeight: 600, color: "#3E1540", background: "#F3EAF4", borderRadius: 9999, padding: "4px 10px", letterSpacing: "0.05em", textTransform: "uppercase", whiteSpace: "nowrap", flexShrink: 0, marginBottom: 4 }}>
                        {userRosterRole}
                      </span>
                    )}
                  </div>
                </div>
                <div style={{ display: "flex", gap: 8, marginBottom: 24, flexWrap: "wrap" }}>
                  {resourcesRoles.map(role => (
                    <button
                      key={role}
                      onClick={() => setResourcesRole(role)}
                      style={{
                        padding: "6px 14px", borderRadius: 9999, border: "1.5px solid",
                        borderColor: activeResourcesRole === role ? "#3E1540" : "#E8E2D2",
                        background: activeResourcesRole === role ? "#3E1540" : "transparent",
                        color: activeResourcesRole === role ? "#F6F4EF" : "#5A5466",
                        fontSize: 13, fontWeight: 500, cursor: "pointer", fontFamily: "var(--font-inter)",
                        transition: "border-color 150ms, background-color 150ms, color 150ms",
                      }}
                    >
                      {role}
                    </button>
                  ))}
                </div>
              </>
            )}
            <StudentOrgRoleTabContent teamId={teamId} roleName={activeResourcesRole} userId={userId} canWrite={canEdit} />
          </div>
        )}

        {/* GROUPS — group generator */}
        {displaySection === "Groups" && (
          <GroupsTab
            teamId={teamId}
            ministryId={ministryId}
            userId={userId}
            canEdit={canEdit}
            generateTrigger={groupGenerateTrigger}
          />
        )}

        {displaySection === "Rotations" && teamId && (
          <RotationsTab
            teamId={teamId}
            ministryId={ministryId}
            userId={userId}
            canEdit={canEdit || isAdmin}
          />
        )}
      </div>
    </div>

    {showAddModal && (
      <AddEventModal
        ministryId={ministryId}
        teamId={teamId}
        userId={userId}
        onClose={() => setShowAddModal(false)}
        onSaved={(newEv) => {
          const sorted = [...calEvents, newEv].sort((a, b) => new Date(a.start_date).getTime() - new Date(b.start_date).getTime())
          setCalEvents(sorted)
          onCalEventsChange?.(sorted)
          setPlannedIds(prev => new Set([...prev, newEv.id]))
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
interface CCSFRotation {
  id: string
  rotation_type: CCSFRotationType
  assigned_to: string | null
  assigned_name?: string
  week_date: string
  notes: string | null
}

function RotationsTab({ teamId, ministryId, userId, canEdit }: {
  teamId: string; ministryId: string; userId: string; canEdit: boolean
}) {
  const supabase = createClient()
  const [rotations, setRotations] = useState<CCSFRotation[]>([])
  const [roster, setRoster] = useState<{ user_id: string; name: string }[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState<string | null>(null)

  const ROTATION_TYPES: { type: CCSFRotationType; label: string }[] = [
    { type: "lockup", label: "Lock-up" },
    { type: "sunday_lunch_prayer", label: "Sunday Lunch Prayer" },
  ]

  // Generate upcoming Sundays (next 8 weeks)
  const upcomingSundays = useMemo(() => {
    const sundays: string[] = []
    const d = new Date()
    d.setDate(d.getDate() - d.getDay()) // start from this Sunday
    for (let i = 0; i < 8; i++) {
      sundays.push(d.toISOString().split("T")[0])
      d.setDate(d.getDate() + 7)
    }
    return sundays
  }, [])

  useEffect(() => {
    async function load() {
      setLoading(true)

      // Fetch roster: get user_ids from team_members, then names from profiles
      const { data: memberRows } = await supabase
        .from("team_members")
        .select("user_id")
        .eq("team_id", teamId)
      const userIds = (memberRows ?? []).map((m: { user_id: string }) => m.user_id)
      if (userIds.length > 0) {
        const { data: profileRows } = await supabase
          .from("profiles")
          .select("id, name")
          .in("id", userIds)
          .order("name")
        setRoster((profileRows ?? []).map((p: { id: string; name: string }) => ({ user_id: p.id, name: p.name })))
      }

      const { data } = await supabase
        .from("ccsf_rotations")
        .select("id, rotation_type, assigned_to, week_date, notes")
        .eq("team_id", teamId)
        .eq("ministry_id", ministryId)
        .in("week_date", upcomingSundays)
      const profileIds = [...new Set((data ?? []).map((r: { assigned_to: string | null }) => r.assigned_to).filter(Boolean))] as string[]
      let nameMap = new Map<string, string>()
      if (profileIds.length > 0) {
        const { data: pData } = await supabase.from("profiles").select("id, name").in("id", profileIds)
        nameMap = new Map((pData ?? []).map((p: { id: string; name: string }) => [p.id, p.name]))
      }
      setRotations((data ?? []).map((r: CCSFRotation) => ({ ...r, assigned_name: r.assigned_to ? nameMap.get(r.assigned_to) : undefined })))
      setLoading(false)
    }
    load()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [teamId, ministryId])

  async function handleAssign(rotationType: CCSFRotationType, weekDate: string, userId: string | null) {
    const key = `${rotationType}::${weekDate}`
    setSaving(key)
    const existing = rotations.find(r => r.rotation_type === rotationType && r.week_date === weekDate)
    if (userId === null) {
      if (existing) {
        await supabase.from("ccsf_rotations").delete().eq("id", existing.id)
        setRotations(prev => prev.filter(r => r.id !== existing.id))
      }
    } else {
      const assignedName = roster.find(m => m.user_id === userId)?.name
      if (existing) {
        await supabase.from("ccsf_rotations").update({ assigned_to: userId }).eq("id", existing.id)
        setRotations(prev => prev.map(r => r.id === existing.id ? { ...r, assigned_to: userId, assigned_name: assignedName } : r))
      } else {
        const { data } = await supabase.from("ccsf_rotations").insert({ team_id: teamId, ministry_id: ministryId, rotation_type: rotationType, assigned_to: userId, week_date: weekDate }).select().single()
        if (data) setRotations(prev => [...prev, { ...data as CCSFRotation, assigned_name: assignedName }])
      }
    }
    setSaving(null)
  }

  function getAssignment(rotationType: CCSFRotationType, weekDate: string) {
    return rotations.find(r => r.rotation_type === rotationType && r.week_date === weekDate)
  }

  const todayStr = new Date().toISOString().split("T")[0]

  if (loading) return <div style={{ textAlign: "center", padding: "40px 0", color: "#8A8497", fontSize: 14 }}>Loading…</div>

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 32 }}>
      {ROTATION_TYPES.map(({ type, label }) => (
        <div key={type}>
          <p style={{ fontFamily: "ui-monospace,'SF Mono',Menlo,monospace", fontSize: 11, fontWeight: 600, letterSpacing: "0.1em", textTransform: "uppercase", color: "#8A8497", marginBottom: 12 }}>{label}</p>
          <div style={{ background: "#FBF8F2", border: "1px solid #E8E2D2", borderRadius: 12, overflow: "hidden" }}>
            {upcomingSundays.map((weekDate, i) => {
              const assignment = getAssignment(type, weekDate)
              const key = `${type}::${weekDate}`
              const isToday = weekDate === todayStr
              const dateLabel = new Date(weekDate + "T12:00:00").toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })
              return (
                <div key={weekDate} style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 18px", borderTop: i ? "1px solid #F0EBE0" : undefined, background: isToday ? "#F9F6FF" : undefined }}>
                  <div style={{ width: 96, flexShrink: 0 }}>
                    <p style={{ fontSize: 12.5, fontWeight: isToday ? 700 : 400, color: isToday ? "#3E1540" : "#5A5466" }}>{dateLabel}</p>
                    {isToday && <p style={{ fontSize: 10.5, color: "#8A8497", marginTop: 1 }}>This week</p>}
                  </div>
                  <select
                    value={assignment?.assigned_to ?? ""}
                    disabled={saving === key}
                    onChange={e => handleAssign(type, weekDate, e.target.value || null)}
                    style={{ flex: 1, fontSize: 13, color: assignment?.assigned_to ? "#13101A" : "#C4C4C4", border: "none", outline: "none", background: "transparent", cursor: "pointer", fontFamily: "inherit" }}
                  >
                    <option value="">— Unassigned —</option>
                    {roster.map(m => <option key={m.user_id} value={m.user_id}>{m.name}</option>)}
                  </select>
                </div>
              )
            })}
          </div>
        </div>
      ))}
    </div>
  )
}

export function PlanTab({
  userId, userName, ministryId, ministryName, userTeams, allTeams, isAdmin, isDGL, isPastor,
  onTeamsChange, showCreateTeam, onShowCreateTeam, activeTeamId, onTeamCreated, onOpenChat,
  onTeamSelect,
  studentOrgSection, onStudentOrgSectionChange, studentOrgPlanningEvent, onStudentOrgPlanningEventChange, onStudentOrgCalEventsChange,
  sglSection, onSglSectionChange,
}: PlanTabProps) {
  const activeTeamName = userTeams.find(t => t.teamId === activeTeamId)?.teamName ?? (isAdmin ? ministryName : "Plan")
  const setShowCreateTeam = onShowCreateTeam
  const router = useRouter()
  const supabase = createClient()
  const [openTeam, setOpenTeam] = useState<Team | null>(null)
  const [showEditEvent, setShowEditEvent] = useState(false)
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

  function replaceParam(key: string, value: string | null) {
    const params = new URLSearchParams(window.location.search)
    if (value === null) params.delete(key)
    else params.set(key, value)
    router.replace(`/home?${params.toString()}`, { scroll: false })
  }

  function openSettings(team: Team) {
    setOpenTeam(team)
    replaceParam("view", "settings")
  }

  function closeSettings() {
    setOpenTeam(null)
    replaceParam("view", null)
  }

  // Read the initial view param once so the auto-open effect is stable across re-renders.
  const [initialViewParam] = useState(() =>
    typeof window !== 'undefined' ? new URLSearchParams(window.location.search).get('view') : null
  )
  const [didAutoOpen, setDidAutoOpen] = useState(false)

  // Auto-open settings when page is refreshed with ?view=settings in the URL.
  useEffect(() => {
    if (didAutoOpen || initialViewParam !== 'settings' || !activeTeamId) return
    const team = allTeams.find(t => t.id === activeTeamId) ?? (() => {
      const ut = userTeams.find(t => t.teamId === activeTeamId)
      if (!ut) return null
      return { id: ut.teamId, name: ut.teamName, icon: ut.teamIcon, description: ut.teamDescription, created_by: "", member_count: 0, team_type: ut.teamType } satisfies Team
    })()
    if (!team) return
    setOpenTeam(team)
    setDidAutoOpen(true)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allTeams, userTeams, activeTeamId, didAutoOpen])

  // Clear sub-page URL params when the user switches to a different team.
  const teamSwitchRef = useRef(false)
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => {
    if (!teamSwitchRef.current) { teamSwitchRef.current = true; return }
    setOpenTeam(null)
    onStudentOrgPlanningEventChange?.(null)
    // Atomic clear: remove all team-specific sub-page params in one replace call
    const params = new URLSearchParams(window.location.search)
    params.delete("view")
    params.delete("sotab")
    params.delete("ptab")
    params.delete("sgltab")
    params.delete("evtab")
    router.replace(`/home?${params.toString()}`, { scroll: false })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTeamId])

  const hasAnyPlanning = isAdmin || userTeams.length > 0

  const monoStyle: React.CSSProperties = {
    fontFamily: "ui-monospace, 'SF Mono', Menlo, monospace",
    fontSize: "11px",
    letterSpacing: "0.04em",
    textTransform: "uppercase",
    color: "#8A8497",
  }

  const activeUserTeam = userTeams.find(t => t.teamId === activeTeamId)
  const activeTeamLabel = activeTeamName.toLowerCase()
  const activeTeamPerms = activeUserTeam?.permissions ?? []
  const isStudentOrgBoard = /\b(student org|board|leadership|officer)\b/.test(activeTeamLabel) || activeTeamPerms.some(p => ["can_plan_events", "can_view_finances", "can_manage_members"].includes(p))
  const studentOrgRole = (isStudentOrgBoard ? activeUserTeam?.roleName : undefined) ?? ""
  const canEditStudentOrg = isAdmin || activeTeamPerms.includes("can_plan_events")

  // Tech Team detected by name first — before isPraiseTeam — to avoid permission overlap
  // (Tech Team shares can_view_worship_set / can_generate_slides with praise team members)
  const isTechTeam = /\btech\b/i.test(activeTeamLabel)
    && activeTeamPerms.some(p => ["can_view_worship_set", "can_generate_slides"].includes(p))

  const isPraiseTeam = !isTechTeam && (/\b(praise|worship)\b/.test(activeTeamLabel) || activeTeamPerms.some(p => ["can_manage_worship_set", "can_view_worship_set", "can_generate_slides", "can_manage_schedule"].includes(p)))
  const praiseTeamPerms = isPraiseTeam ? activeTeamPerms : []
  const canManageWorship = isAdmin || praiseTeamPerms.includes("can_manage_worship_set")
  const canManageSchedule = isAdmin || praiseTeamPerms.includes("can_manage_schedule")

  const activeTeamFull = allTeams.find(t => t.id === activeTeamId)
    ?? (activeUserTeam ? { id: activeUserTeam.teamId, name: activeUserTeam.teamName, icon: activeUserTeam.teamIcon, description: activeUserTeam.teamDescription, created_by: "", member_count: 0, team_type: activeUserTeam.teamType } : undefined)

  const isActiveTeamPresident = (activeUserTeam?.roleName ?? "").toLowerCase().includes("president")
  const canOpenTeamSettings = isAdmin || isActiveTeamPresident

  const isDGLTeam = /\b(dgl|small group|discipleship|sg)\b/.test(activeTeamLabel) || activeTeamPerms.some(p => ["can_create_dgs", "can_view_dgs"].includes(p))
  const isDGLPresident = isDGLTeam && isActiveTeamPresident

  const isDgPraiseTeam = activeTeamFull?.team_type === 'dg_praise'
  const isOneTimeTeam = activeTeamFull?.team_type === 'one_time'
  // isPraiseTeamMember: used for CreateTeamOverlay visibility
  const isPraiseTeamMember = userTeams.some(t => t.teamType === 'standard' && (/\b(praise|worship)\b/.test(t.teamName.toLowerCase()) || t.permissions.some(p => ["can_manage_worship_set","can_view_worship_set","can_manage_schedule"].includes(p))))

  return (
    <div className="pb-2 md:pb-0 md:flex md:flex-col md:h-full md:overflow-hidden">
      {/* Mobile Header */}
      <div className="flex items-center justify-between px-5 pt-14 pb-5 md:hidden">
        <div className="flex items-center gap-2.5">
          <svg width="26" height="26" viewBox="0 0 100 100" fill="none">
            <path d="M70 28 A32 32 0 1 0 70 72" stroke="#3E1540" strokeWidth="8" strokeLinecap="round" />
            <circle cx="50" cy="50" r="6" fill="#3E1540" />
          </svg>
          <span style={{ fontFamily: "var(--font-instrument-serif)", fontSize: "28px", color: "#13101A", letterSpacing: "-0.01em", lineHeight: 1 }}>{ministryName}</span>
        </div>
        {isAdmin && (
          <button onClick={() => setShowCreateTeam(true)} className="size-9 bg-[#3E1540] rounded-xl flex items-center justify-center hover:bg-[#2D0F2E] transition-colors">
            <Plus className="w-4 h-4 text-[#F6F4EF]" />
          </button>
        )}
      </div>

      {/* Mobile title */}
      <div className="flex items-end justify-between px-5 mb-5 md:hidden">
        <h1 style={{ fontFamily: "var(--font-instrument-serif)", fontSize: "36px", fontWeight: 400, letterSpacing: "-0.02em", color: "#13101A", lineHeight: 1.05, margin: 0 }}>Plan</h1>
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
        {/* Page header — hidden for student org board, DGL team (both use section-level headers), and the no-team picker screen */}
        {activeTeamId && !isStudentOrgBoard && !isDGLTeam && (
          <TabPageHeader>
            <PageTitle
              eyebrow={`PLANNING · ${ministryName.toUpperCase()}`}
              title={activeTeamName}
            />
            {activeTeamFull && canOpenTeamSettings && (
              <button
                onClick={() => openSettings(activeTeamFull)}
                className="w-8 h-8 flex items-center justify-center rounded-lg border border-[#E5E0D2] bg-[#FBF8F2] hover:bg-[#EFEAE0] transition-colors flex-shrink-0 ml-auto"
                title="Team settings"
              >
                <Settings className="w-4 h-4 text-[#5A5466]" />
              </button>
            )}
          </TabPageHeader>
        )}

        {/* Scrollable team content */}
        <div className="flex-1 overflow-y-auto">
        {!activeTeamId ? (
          /* ── Three-way branch: 0 teams → empty state | 2+ teams → picker
             (1-team case auto-entered in home-app before this renders) ── */
          userTeams.length >= 2 ? (
            /* PICKER — full-width, no sidebar */
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", padding: "72px 48px 80px" }}>
              <div style={{ width: "100%", maxWidth: 860 }}>
                <p style={{ fontFamily: "var(--mono)", fontSize: 10, letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--muted-text)", marginBottom: 14, textAlign: "center" }}>
                  PLANNING · {ministryName.toUpperCase()}
                </p>
                <h1 style={{ fontFamily: "var(--sans)", fontSize: 46, fontWeight: 700, color: "var(--ink)", letterSpacing: "-0.02em", lineHeight: 1.05, margin: "0 0 14px", textAlign: "center" }}>
                  Which team are you planning for?
                </h1>
                <p style={{ fontSize: 15, color: "var(--muted-text)", margin: "0 0 48px", lineHeight: 1.6, textAlign: "center" }}>
                  You coordinate across {userTeams.length} teams. Pick one to open its planning workspace.
                </p>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 16 }}>
                  {userTeams.map(t => {
                    const evCount = teamEventCounts[t.teamId] ?? 0
                    const secCount = getPickerSectionCount(t)
                    return (
                      <button
                        key={t.teamId}
                        onClick={() => onTeamSelect?.(t.teamId)}
                        className="text-left transition-all hover:border-[var(--plum)]"
                        style={{
                          background: "var(--ivory)",
                          border: "1px solid var(--line)",
                          borderRadius: 16,
                          padding: "28px 28px 24px",
                          cursor: "pointer",
                          display: "block",
                          width: "100%",
                        }}
                      >
                        <div style={{ marginBottom: 22 }}>
                          <PlanLineIcon iconKey={t.teamIcon ?? "users"} bg="var(--plum)" fg="var(--cream)" size={48} radius={12} />
                        </div>
                        <p style={{ fontFamily: "var(--mono)", fontSize: 10, letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--muted-text)", margin: "0 0 6px" }}>
                          {t.roleName}
                        </p>
                        <p style={{ fontFamily: "var(--sans)", fontSize: 22, fontWeight: 700, color: "var(--ink)", letterSpacing: "-0.01em", lineHeight: 1.2, margin: "0 0 18px" }}>
                          {t.teamName}
                        </p>
                        <p style={{ fontSize: 12, color: "var(--muted-text)", fontFamily: "var(--font-inter)", margin: 0 }}>
                          {evCount} upcoming event{evCount !== 1 ? "s" : ""} · {secCount} sections
                        </p>
                      </button>
                    )
                  })}
                </div>
                {isAdmin && (
                  <div style={{ display: "flex", justifyContent: "center", marginTop: 28 }}>
                    <button
                      disabled
                      title="Custom team creation coming soon"
                      style={{ display: "inline-flex", alignItems: "center", gap: 9, padding: "10px 20px", background: "transparent", color: "var(--muted-text)", border: "1px solid var(--line)", borderRadius: 999, fontSize: 13, fontFamily: "var(--font-inter)", cursor: "not-allowed", opacity: 0.45 }}
                    >
                      <Plus style={{ width: 13, height: 13 }} /> New team
                      <span style={{ fontSize: 9, padding: "2px 7px", borderRadius: 999, background: "#ECE8DE", color: "#8A8497", letterSpacing: "0.5px", textTransform: "uppercase" as const, fontWeight: 600 }}>Coming soon</span>
                    </button>
                  </div>
                )}
              </div>
            </div>
          ) : (
            /* EMPTY STATE — strictly 0 teams */
            <div className="px-14 py-7">
              <div className="flex flex-col items-center justify-center py-24 text-center">
                <div style={{ fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace", fontSize: 10, letterSpacing: "0.14em", color: "#8A8497", textTransform: "uppercase" as const, marginBottom: 12 }}>
                  {isAdmin ? "YOUR TEAMS · 0" : "NO TEAM YET"}
                </div>
                <h2 style={{ fontFamily: "var(--font-instrument-serif)", fontSize: 40, fontWeight: 400, color: "#13101A", letterSpacing: "-0.02em", margin: "0 0 12px" }}>
                  {isAdmin ? "Create your first team." : "You're not on a team yet."}
                </h2>
                <p style={{ fontSize: 14, color: "#5A5466", maxWidth: 380, lineHeight: 1.6, margin: "0 0 28px" }}>
                  {isAdmin
                    ? "Teams keep your ministry organized — Praise, Small Groups, Student Org Board, and more."
                    : "Ask a leader to add you to a team."}
                </p>
                {isAdmin && (
                  <button
                    onClick={() => setShowCreateTeam(true)}
                    style={{ display: "inline-flex", alignItems: "center", gap: 8, padding: "11px 22px", background: "#2D0F2E", color: "#FBF8F2", border: "none", borderRadius: 12, fontSize: 14, fontWeight: 500, fontFamily: "var(--font-inter)", cursor: "pointer" }}
                  >
                    <Plus style={{ width: 14, height: 14 }} /> Create a team
                  </button>
                )}
              </div>
            </div>
          )
        ) : isDgPraiseTeam && activeTeamId ? (
          <div className="px-14 py-7">
            <DgPraiseTeamTab
              teamId={activeTeamId}
              ministryId={ministryId}
              userId={userId}
              canManage={canManageWorship || isAdmin}
            />
          </div>
        ) : isOneTimeTeam && activeTeamId ? (
          <div className="px-14 py-7">
            <OneTimeTeamTab
              teamId={activeTeamId}
              ministryId={ministryId}
              userId={userId}
              canManage={canManageWorship || isAdmin}
            />
          </div>
        ) : isTechTeam ? (
          <div className="px-14 py-7">
            <TechTeamTab ministryId={ministryId} userId={userId} />
          </div>
        ) : isPraiseTeam && activeTeamId ? (
          <PraiseTeamTab
            teamId={activeTeamId}
            ministryId={ministryId}
            userId={userId}
            canManage={canManageWorship}
            canManageSchedule={canManageSchedule}
          />
        ) : isStudentOrgBoard ? (
          <StudentOrgTeamHome
              teamId={activeTeamId}
              teamName={activeTeamName}
              teamIcon={activeUserTeam?.teamIcon ?? activeTeamFull?.icon ?? "🏛️"}
              ministryId={ministryId}
              userId={userId}
              userName={userName}
              userRole={studentOrgRole}
              isAdmin={isAdmin}
              canEdit={canEditStudentOrg}
              canEditBudget={isAdmin || activeTeamPerms.includes("can_view_finances")}
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
        ) : isDGLTeam && activeTeamId ? (
          <SmallGroupLeadersTab
              teamId={activeTeamId}
              ministryId={ministryId}
              userId={userId}
              isPresident={isDGLPresident}
              isPastor={isPastor}
              onOpenChat={onOpenChat}
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
          if (!isAdmin && !perms.includes("can_plan_events")) return null
          return (
            <div className="px-14 py-7">
              <MinistryCalendar
                ministryId={ministryId}
                teamId={activeTeamId}
                userId={userId}
                canEdit={isAdmin || perms.includes("can_plan_events")}
                onOpenChat={onOpenChat}
              />
            </div>
          )
        })()}
      </div>
      </div>

      {/* Mobile content */}
      <div className="md:hidden px-5 pb-4">
        {isDgPraiseTeam && activeTeamId ? (
          <DgPraiseTeamTab
            teamId={activeTeamId}
            ministryId={ministryId}
            userId={userId}
            canManage={canManageWorship || isAdmin}
          />
        ) : isOneTimeTeam && activeTeamId ? (
          <OneTimeTeamTab
            teamId={activeTeamId}
            ministryId={ministryId}
            userId={userId}
            canManage={canManageWorship || isAdmin}
          />
        ) : isTechTeam ? (
          <TechTeamTab ministryId={ministryId} userId={userId} />
        ) : isPraiseTeam && activeTeamId ? (
          <PraiseTeamTab
            teamId={activeTeamId}
            ministryId={ministryId}
            userId={userId}
            canManage={canManageWorship}
            canManageSchedule={canManageSchedule}
          />
        ) : isStudentOrgBoard ? (
          <StudentOrgTeamHome
            teamId={activeTeamId}
            teamName={activeTeamName}
            teamIcon={activeUserTeam?.teamIcon ?? activeTeamFull?.icon ?? "🏛️"}
            ministryId={ministryId}
            userId={userId}
            userName={userName}
            userRole={studentOrgRole}
            isAdmin={isAdmin}
            canEdit={canEditStudentOrg}
            canEditBudget={isAdmin || activeTeamPerms.includes("can_view_finances")}
            onTeamSettings={activeTeamFull && canOpenTeamSettings ? () => openSettings(activeTeamFull) : undefined}
            planningEvent={studentOrgPlanningEvent ?? null}
            onPlanningEventChange={ev => onStudentOrgPlanningEventChange?.(ev)}
            onOpenChat={onOpenChat}
          />
        ) : isDGLTeam && activeTeamId ? (
          <SmallGroupLeadersTab
            teamId={activeTeamId}
            ministryId={ministryId}
            userId={userId}
            isPresident={isDGLPresident}
            isPastor={isPastor}
            onOpenChat={onOpenChat}
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
                  <div className="bg-white rounded-2xl border border-dashed border-[#ECE8DE] p-6 text-center">
                    <p className="text-[14px] font-semibold text-[#13101A]/60 mb-1">No teams yet.</p>
                    <p className="text-[13px] text-[#8A8497]">Tap + above to create your first team.</p>
                  </div>
                ) : (
                  <div className="flex flex-col gap-2">
                    {allTeams.map((team) => (
                      <button
                        key={team.id}
                        onClick={() => openSettings(team)}
                        className="w-full bg-white rounded-2xl border border-[#ECE8DE] p-4 shadow-[0_1px_4px_rgba(19,16,26,0.06)] text-left flex items-center gap-3 hover:bg-[#FDFBF7] transition-colors"
                      >
                        <PlanLineIcon iconKey={team.icon ?? "👥"} bg="#3E1540" fg="#F6F4EF" />
                        <div className="flex-1 min-w-0">
                          <p className="text-[14px] font-semibold text-[#13101A]">{team.name}</p>
                          <p className="text-[12px] text-[#8A8497]">{team.member_count} member{team.member_count !== 1 ? "s" : ""}</p>
                        </div>
                        <ChevronRight className="w-4 h-4 text-[#C4C4C4] flex-shrink-0" />
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
                  <div key={tool.name} className="bg-white rounded-2xl border border-[#ECE8DE] p-4 shadow-[0_1px_4px_rgba(19,16,26,0.06)] opacity-60 flex flex-col gap-2">
                    <PlanLineIcon iconKey={tool.icon} bg="#ffffff" fg="#3E1540" size={36} />
                    <div>
                      <p className="text-[13px] font-semibold text-[#13101A]">{tool.name}</p>
                      <p style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: "9px", color: "#8A8497", letterSpacing: "0.08em", textTransform: "uppercase", marginTop: "2px" }}>Coming soon</p>
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

      {showCreateTeam && (
        <CreateTeamOverlay
          userId={userId}
          userName={userName}
          ministryId={ministryId}
          isDGL={isDGL}
          isPraiseTeamMember={isPraiseTeamMember}
          isAdmin={isAdmin}
          onClose={() => setShowCreateTeam(false)}
          onCreated={(teamId) => { setShowCreateTeam(false); onTeamsChange(); onTeamCreated(teamId) }}
        />
      )}

      {openTeam && (
        <TeamDetailOverlay
          team={openTeam}
          userId={userId}
          ministryId={ministryId}
          isAdmin={isAdmin}
          onClose={closeSettings}
          onChanged={() => { closeSettings(); onTeamsChange() }}
          onOpenChat={onOpenChat}
        />
      )}

    </div>
  )
}

// ── PlanSubTabStrip ────────────────────────────────────────────────────────────
// Single canonical tab strip used by every team page in the Plan tab.
// Implements §4.2 exactly: underline only, no pills, no segmented backgrounds.
export function PlanSubTabStrip({
  tabs,
  active,
  onChange,
}: {
  tabs: readonly { key: string; label: string }[]
  active: string
  onChange: (key: string) => void
}) {
  return (
    // Outer div: scroll container only — no border (replaced by soft hairline below)
    <div style={{ overflowX: "auto", scrollbarWidth: "none" as const }}>
      {/* Label row: 56px left inset on desktop, aligns with TabPageHeader's px-14 */}
      <div className="md:pl-14" style={{ display: "flex", gap: 32 }}>
        {tabs.map(({ key, label }) => (
          <button
            key={key}
            onClick={() => onChange(key)}
            style={{
              padding: "12px 0 14px",
              fontSize: 15,
              fontFamily: "var(--font-inter)",
              fontWeight: active === key ? 600 : 400,
              color: active === key ? "#2D0F2E" : "#8A8497",
              border: "none",
              borderBottom: active === key ? "2px solid #3E1540" : "2px solid transparent",
              marginBottom: -1,
              background: "none",
              cursor: "pointer",
              whiteSpace: "nowrap" as const,
              outline: "none",
              flexShrink: 0,
            }}
          >
            {label}
          </button>
        ))}
      </div>
      {/* Soft inset hairline — matches InsetHairline: var(--line), 0.65 opacity, 56px inset on desktop */}
      <div className="md:mx-14" style={{ height: 1, background: "var(--line)", opacity: 0.65 }} />
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
  const PLUM = "#3E1540"
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
                          style={{
                            display: "flex", alignItems: "center", gap: 7,
                            width: "100%", padding: "5px 10px",
                            background: isEvActive ? "var(--ivory)" : "none",
                            border: "none", borderRadius: "var(--r-chip)",
                            cursor: "pointer", textAlign: "left" as const,
                            fontFamily: "var(--sans)", fontSize: 12,
                            color: isEvActive ? "var(--ink)" : "var(--muted-text)",
                            fontWeight: isEvActive ? 500 : 400,
                            transition: "background 100ms ease",
                          }}
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
  onBack,
}: {
  activeSection: string
  onSectionChange: (s: string) => void
  onBack?: () => void
}) {
  const sections = [
    { key: "bible_study", label: "Bible Study" },
    { key: "schedule", label: "Schedule" },
  ]
  return (
    <div style={{ display: "flex", flexDirection: "column", flex: 1, overflow: "hidden" }}>
      {onBack && (
        <button
          onClick={onBack}
          style={{
            display: "flex", alignItems: "center", gap: 6,
            padding: "8px 10px", margin: "6px 8px 2px",
            background: "transparent", border: "none", cursor: "pointer",
            color: "var(--muted-text)", fontSize: 11, fontFamily: "var(--mono)",
            letterSpacing: "0.06em", textTransform: "uppercase",
            borderRadius: "var(--r-chip)",
          }}
        >
          <ChevronLeft style={{ width: 12, height: 12 }} />
          All teams
        </button>
      )}
      <div className="flex-1 overflow-y-auto px-2 pt-1 pb-3">
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
    draft:     { label: "Draft",     bg: "#F3F0F7", color: "#5A5466" },
    filled:    { label: "Filled",    bg: "#F4F1E8", color: "#3E1540" },
    confirmed: { label: "Confirmed", bg: "#EDE5F0", color: "#3E1540" },
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
  const router = useRouter()
  const validPTabs = ["schedule", "setlist", "availability"] as const
  const [subTab, setSubTab] = useState<"schedule" | "setlist" | "availability">(() => {
    const p = typeof window !== "undefined" ? new URLSearchParams(window.location.search).get("ptab") : null
    return (validPTabs as readonly string[]).includes(p ?? "") ? p as "schedule" | "setlist" | "availability" : "schedule"
  })
  function setSubTabAndUrl(t: "schedule" | "setlist" | "availability") {
    setSubTab(t)
    const sp = new URLSearchParams(window.location.search)
    sp.set("ptab", t)
    router.replace(`/home?${sp.toString()}`, { scroll: false })
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

  const monoStyle: React.CSSProperties = { fontFamily: "ui-monospace,'SF Mono',Menlo,monospace", fontSize: 11, letterSpacing: "0.12em", textTransform: "uppercase", color: "#8A8497" }
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
              <button
                onClick={() => setShowAddWeek(true)}
                style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "6px 14px", background: "#3E1540", color: "#F6F4EF", borderRadius: 10, fontSize: 13, fontWeight: 600, border: "none", cursor: "pointer" }}
              >
                <Plus className="w-3.5 h-3.5" />
                Add week
              </button>
            )}
          </div>

          {/* Add week inline form */}
          {showAddWeek && (
            <div style={{ background: "#FBF8F2", border: "1px solid #E2DDCF", borderRadius: 14, padding: 20, marginBottom: 16 }}>
              <p style={{ fontFamily: "var(--font-instrument-serif)", fontSize: 17, color: "#13101A", marginBottom: 14 }}>New worship week</p>
              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                <div>
                  <label style={{ display: "block", fontSize: 12, fontWeight: 500, color: "#5A5466", marginBottom: 4 }}>Date — Sundays only</label>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 6, maxHeight: 148, overflowY: "auto", padding: "10px", background: "white", border: "1px solid #ECE8DE", borderRadius: 10 }}>
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
                            border: isSelected ? "1.5px solid #3E1540" : "1px solid #E2DDCF",
                            background: isSelected ? "#3E1540" : alreadyExists ? "#F4F1EA" : "white",
                            color: isSelected ? "#F6F4EF" : alreadyExists ? "#C5C0CC" : "#13101A",
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
                    <p style={{ fontSize: 12, color: "#DC2626", marginTop: 5 }}>{addWeekError}</p>
                  )}
                </div>
                <div>
                  <label style={{ display: "block", fontSize: 12, fontWeight: 500, color: newLeaderError ? "#DC2626" : "#5A5466", marginBottom: 4 }}>
                    Leader <span style={{ color: newLeaderError ? "#DC2626" : "#8A8497", fontWeight: 400 }}>{newLeaderError ? "— required" : "(required)"}</span>
                  </label>
                  <select value={newLeaderId} onChange={e => { setNewLeaderId(e.target.value); setNewLeaderError(false) }}
                    style={{ width: "100%", padding: "10px 12px", borderRadius: 10, border: `1px solid ${newLeaderError ? "#DC2626" : "#ECE8DE"}`, background: "#FBF8F2", fontSize: 14, color: newLeaderId ? "#13101A" : "#8A8497", outline: "none" }}>
                    <option value="">Select Worship Leader…</option>
                    {worshipLeaders.map(m => <option key={m.user_id} value={m.user_id}>{m.name}</option>)}
                  </select>
                </div>
                <div style={{ display: "flex", gap: 8 }}>
                  <button onClick={handleAddWeek} disabled={!newDate || addingWeek}
                    style={{ flex: 1, padding: 10, background: "#3E1540", color: "#F6F4EF", borderRadius: 10, fontSize: 13, fontWeight: 600, border: "none", cursor: "pointer", opacity: !newDate || addingWeek ? 0.6 : 1 }}>
                    {addingWeek ? "Adding…" : "Add"}
                  </button>
                  <button onClick={() => { setShowAddWeek(false); setNewDate(""); setNewLeaderId(""); setAddWeekError(null) }}
                    style={{ padding: "10px 16px", background: "transparent", color: "#8A8497", borderRadius: 10, fontSize: 13, border: "1px solid #ECE8DE", cursor: "pointer" }}>
                    Cancel
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Weeks list */}
          {scheduleLoading ? (
            <div style={{ textAlign: "center", padding: "40px 0", color: "#8A8497", fontSize: 14 }}>Loading…</div>
          ) : visibleWeeks.length === 0 ? (
            <div style={{ background: "#FBF8F2", border: "1.5px dashed #E2DDCF", borderRadius: 14, padding: "40px 24px", textAlign: "center" }}>
              <p style={{ fontFamily: "var(--font-instrument-serif)", fontSize: 18, color: "#13101A", marginBottom: 6 }}>No weeks scheduled yet.</p>
              <p style={{ fontSize: 13, color: "#8A8497" }}>{canManageSchedule ? "Add one to get started." : "Check back later or set your availability."}</p>
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
                  <div key={week.id} ref={isHighlighted ? (el => { if (el) { el.scrollIntoView({ behavior: "smooth", block: "start" }); setHighlightWeek(null) } }) : undefined} style={{ background: "#FBF8F2", border: isHighlighted ? "2px solid #3E1540" : "1px solid #E8E2D2", borderRadius: 12, overflow: "hidden" }}>

                    {/* ── Date / status / delete row ── */}
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, padding: "14px 20px", borderBottom: "1px solid #EFE9DA" }}>
                      <p style={{ fontFamily: "var(--font-instrument-serif)", fontSize: 17, color: "#13101A", lineHeight: 1.2, margin: 0 }}>
                        {worshipWeekDateLabel(week.week_date)}
                      </p>
                      <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
                        <WorshipStatusBadge status={week.status} onChange={canChangeStatus ? s => handleStatusChange(week.id, s) : undefined} />
                        {canManage && (
                          <button
                            onClick={() => setConfirmDeleteWeekId(confirmDeleteWeekId === week.id ? null : week.id)}
                            style={{ padding: 4, background: "transparent", border: "none", cursor: "pointer", color: "#C4C4C4", display: "flex", alignItems: "center", borderRadius: 6 }}>
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    </div>

                    {/* ── Auto-archive date (president only) ── */}
                    {canManage && (
                      <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 20px", borderBottom: "1px solid #EFE9DA" }}>
                        <span style={{ fontSize: 12, color: "#8A8497", fontFamily: "var(--font-inter)", flexShrink: 0 }}>Auto-archive</span>
                        <input
                          type="date"
                          value={week.auto_archive_date ?? ""}
                          onChange={async e => {
                            const val = e.target.value
                            setWeeks(prev => prev.map(w => w.id === week.id ? { ...w, auto_archive_date: val || null } : w))
                            await supabase.from("worship_weeks").update({ auto_archive_date: val || null }).eq("id", week.id)
                          }}
                          style={{ fontSize: 12, color: "#5A5466", border: "none", outline: "none", background: "transparent", cursor: "pointer", fontFamily: "var(--font-inter)" }}
                        />
                      </div>
                    )}

                    {/* ── Confirm delete ── */}
                    {confirmDeleteWeekId === week.id && (
                      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 20px", borderBottom: "1px solid #EFE9DA" }}>
                        <span style={{ fontSize: 13, color: "#5A5466" }}>Delete this week?</span>
                        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
                          <button onClick={() => setConfirmDeleteWeekId(null)} style={{ fontSize: 13, fontWeight: 500, color: "#8A8497", background: "none", border: "none", cursor: "pointer", padding: 0 }}>Cancel</button>
                          <button onClick={() => handleDeleteWeek(week.id)} style={{ fontSize: 13, fontWeight: 600, color: "#DC2626", background: "none", border: "none", cursor: "pointer", padding: 0 }}>Delete</button>
                        </div>
                      </div>
                    )}

                    {/* ── Leader row ── */}
                    <div style={{ display: "flex", alignItems: "center", gap: 16, padding: "0 20px", minHeight: 52 }}>
                      <span style={{ ...monoStyle, color: !week.leader_id ? "#DC2626" : undefined, flexShrink: 0, width: 80 }}>Leader</span>
                      {canManageSchedule ? (
                        <select value={week.leader_id ?? ""} onChange={e => handleLeaderChange(week.id, e.target.value)}
                          style={{ flex: 1, fontSize: 14, color: week.leader_id ? "#13101A" : "#DC2626", border: "none", outline: "none", background: "transparent", cursor: "pointer" }}>
                          <option value="">— required —</option>
                          {worshipLeaders.map(m => <option key={m.user_id} value={m.user_id}>{m.name}</option>)}
                        </select>
                      ) : (
                        <span style={{ fontSize: 14, color: week.leader_name ? "#13101A" : "#DC2626", flex: 1 }}>
                          {week.leader_name ?? "Not assigned"}
                        </span>
                      )}
                    </div>

                    {/* ── Member roster rows ── */}
                    {week.roles.length === 0 && !(canManageSchedule || isLeader) && (
                      <div style={{ padding: "13px 20px", borderTop: "1px solid #EFE9DA" }}>
                        <p style={{ fontSize: 13, color: "#8A8497", margin: 0 }}>No members assigned yet.</p>
                      </div>
                    )}
                    {week.roles.map(role => (
                      <div key={role.id} style={{ display: "flex", alignItems: "center", gap: 16, padding: "0 20px", minHeight: 52, borderTop: "1px solid #EFE9DA" }}>
                        <span style={{ ...monoStyle, flexShrink: 0, width: 80 }}>{role.role_name}</span>
                        <span style={{ fontSize: 14, color: "#13101A", flex: 1 }}>{role.user_name}</span>
                        {(canManageSchedule || isLeader) && (
                          <button onClick={() => handleRemoveMember(role.id)}
                            style={{ padding: "2px 6px", fontSize: 13, color: "#C4C4C4", background: "transparent", border: "none", cursor: "pointer", lineHeight: 1, flexShrink: 0 }}>
                            ✕
                          </button>
                        )}
                      </div>
                    ))}

                    {/* ── + Add member row ── */}
                    {(canManageSchedule || isLeader) && !isThisWeekAddTarget && (
                      <button
                        onClick={() => { setAddMemberToWeekId(week.id); setAddMemberSearch(""); setAddMemberUserId(""); setAddMemberRole("Vocals") }}
                        style={{
                          display: "block", width: "100%", padding: "14px 20px",
                          borderTop: "1px solid #EFE9DA", borderRight: "none", borderBottom: "none", borderLeft: "none",
                          background: "transparent", cursor: "pointer", textAlign: "left" as const,
                          fontSize: 14, color: "#5A5466",
                        }}
                      >
                        + Add member
                      </button>
                    )}

                    {/* ── Inline add-member form ── */}
                    {isThisWeekAddTarget && (
                      <div style={{ padding: "14px 20px", borderTop: "1px solid #EFE9DA" }}>
                        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                          <div style={{ position: "relative" }}>
                            <input type="text" placeholder="Search member…" value={addMemberSearch}
                              onChange={e => { setAddMemberSearch(e.target.value); setAddMemberUserId("") }}
                              onFocus={() => setAddMemberFocused(true)}
                              onBlur={() => setTimeout(() => setAddMemberFocused(false), 150)}
                              style={{ width: "100%", padding: "8px 10px", borderRadius: 8, border: "1px solid #E2DDCF", background: "white", fontSize: 13, color: "#13101A", outline: "none", boxSizing: "border-box" as const }} />
                            {addMemberFocused && !addMemberUserId && filteredMembers.length > 0 && (
                              <div style={{ position: "absolute", top: "100%", left: 0, right: 0, border: "1px solid #E2DDCF", borderRadius: 8, background: "white", maxHeight: 160, overflowY: "auto", zIndex: 10, boxShadow: "0 4px 12px rgba(0,0,0,0.08)" }}>
                                {filteredMembers.map(m => (
                                  <button key={m.user_id}
                                    onMouseDown={e => { e.preventDefault(); setAddMemberUserId(m.user_id); setAddMemberSearch(m.name); setAddMemberFocused(false) }}
                                    style={{ display: "block", width: "100%", textAlign: "left", padding: "8px 12px", fontSize: 13, color: "#13101A", background: addMemberUserId === m.user_id ? "#F4F0F8" : "transparent", border: "none", cursor: "pointer" }}>
                                    {m.name}
                                  </button>
                                ))}
                              </div>
                            )}
                          </div>
                          <select value={addMemberRole} onChange={e => setAddMemberRole(e.target.value)}
                            style={{ width: "100%", padding: "8px 10px", borderRadius: 8, border: "1px solid #E2DDCF", background: "white", fontSize: 13, color: "#13101A", outline: "none" }}>
                            {WORSHIP_ROLE_OPTIONS.map(r => <option key={r} value={r}>{r}</option>)}
                          </select>
                          <div style={{ display: "flex", gap: 6 }}>
                            <button onClick={() => handleAddMember(week.id)} disabled={!addMemberUserId || addingMember}
                              style={{ flex: 1, padding: 8, background: "#3E1540", color: "#F6F4EF", borderRadius: 8, fontSize: 12, fontWeight: 600, border: "none", cursor: "pointer", opacity: !addMemberUserId || addingMember ? 0.6 : 1 }}>
                              {addingMember ? "Adding…" : "Add"}
                            </button>
                            <button onClick={() => { setAddMemberToWeekId(null); setAddMemberSearch(""); setAddMemberUserId(""); setAddMemberFocused(false) }}
                              style={{ padding: "8px 12px", background: "transparent", color: "#8A8497", borderRadius: 8, fontSize: 12, border: "1px solid #E2DDCF", cursor: "pointer" }}>
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
            <div style={{ background: "#FBF8F2", border: "1.5px dashed #E2DDCF", borderRadius: 14, padding: "40px 24px", textAlign: "center" }}>
              <p style={{ fontFamily: "var(--font-instrument-serif)", fontSize: 18, color: "#13101A", marginBottom: 6 }}>No weeks scheduled yet.</p>
              <p style={{ fontSize: 13, color: "#8A8497" }}>Add a week in the Schedule tab first.</p>
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              {weeks.map(week => {
                const songs = [...(songsByWeek[week.id] ?? [])].sort((a, b) => a.order_index - b.order_index)
                const isUploadingThis = uploadingChartWeek === week.id
                return (
                  <div key={week.id} style={{ background: "#FBF8F2", border: "1px solid #E2DDCF", borderRadius: 14, overflow: "hidden" }}>
                    {/* Card header */}
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, padding: "14px 18px", borderBottom: songs.length > 0 || isUploadingThis ? "1px solid #E2DDCF" : "none" }}>
                      <p style={{ fontFamily: "var(--font-instrument-serif)", fontSize: 17, color: "#13101A", lineHeight: 1.2 }}>
                        {worshipWeekDateLabel(week.week_date)}
                      </p>
                      {canManage && (
                        <label style={{ flexShrink: 0, display: "inline-flex", alignItems: "center", gap: 6, padding: "6px 14px", background: "#3E1540", color: "#F6F4EF", borderRadius: 10, fontSize: 13, fontWeight: 600, cursor: isUploadingThis ? "not-allowed" : "pointer", opacity: isUploadingThis ? 0.6 : 1 }}>
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
                        <p style={{ fontSize: 13, color: "#C4C4C4" }}>No charts uploaded yet.</p>
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
                            <div key={song.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "12px 18px", borderBottom: idx < songs.length - 1 ? "1px solid #EFE9DA" : "none" }}>
                              {/* Position number */}
                              <span style={{ fontFamily: "ui-monospace,'SF Mono',Menlo,monospace", fontSize: 11, color: "#C4C4C4", minWidth: 16, flexShrink: 0 }}>{idx + 1}</span>

                              {/* Title */}
                              <div style={{ flex: 1, minWidth: 0 }}>
                                {isOcr ? (
                                  <span style={{ fontSize: 13, color: "#8A8497", fontStyle: "italic" }}>Reading chart…</span>
                                ) : isEditingTitle || needsTitle ? (
                                  <input
                                    autoFocus={isEditingTitle || (needsTitle && !needsKey)}
                                    value={isEditingTitle ? (editingSong?.value ?? "") : (needsTitle ? (editingSong?.songId === song.id ? (editingSong?.value ?? "") : "") : song.title)}
                                    placeholder="Song title…"
                                    onChange={e => setEditingSong({ songId: song.id, field: "title", value: e.target.value })}
                                    onFocus={() => { if (!isEditingTitle) setEditingSong({ songId: song.id, field: "title", value: "" }) }}
                                    onBlur={handleSaveInlineEdit}
                                    onKeyDown={e => { if (e.key === "Enter") handleSaveInlineEdit() }}
                                    style={{ width: "100%", border: "none", outline: "none", fontFamily: "var(--font-instrument-serif)", fontSize: 20, color: "#13101A", background: "transparent", padding: "2px 0", borderBottom: "1px solid #E2DDCF" }}
                                  />
                                ) : (
                                  <button
                                    onClick={() => song.chart_url ? setViewingChart(song) : setEditingSong({ songId: song.id, field: "title", value: song.title })}
                                    style={{ background: "transparent", border: "none", cursor: "pointer", fontFamily: "var(--font-instrument-serif)", fontSize: 20, color: "#13101A", textAlign: "left", padding: 0, width: "100%", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" as const, lineHeight: 1.2 }}
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
                                      style={{ width: 52, border: "none", outline: "none", fontFamily: "ui-monospace,'SF Mono',Menlo,monospace", fontSize: 12, color: "#2D0F2E", background: "#EDE3EE", borderRadius: 8, padding: "3px 8px", textAlign: "center" as const }}
                                    />
                                  ) : (
                                    <button
                                      onClick={() => setEditingSong({ songId: song.id, field: "key", value: song.key })}
                                      style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", width: 28, height: 28, fontFamily: "ui-monospace,'SF Mono',Menlo,monospace", fontSize: 12, fontWeight: 700, color: "#2D0F2E", background: "#EDE3EE", borderRadius: 8, border: "none", cursor: "pointer" }}
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
                                    style={{ padding: "2px 5px", background: "transparent", border: "none", cursor: idx === 0 ? "default" : "pointer", color: idx === 0 ? "#E5E0D2" : "#8A8497", fontSize: 13, lineHeight: 1 }}>↑</button>
                                  <button onClick={() => handleReorderSong(week.id, song.id, "down")} disabled={idx === songs.length - 1}
                                    style={{ padding: "2px 5px", background: "transparent", border: "none", cursor: idx === songs.length - 1 ? "default" : "pointer", color: idx === songs.length - 1 ? "#E5E0D2" : "#8A8497", fontSize: 13, lineHeight: 1 }}>↓</button>
                                  <button onClick={() => handleDeleteSong(week.id, song.id)}
                                    style={{ padding: "2px 5px", background: "transparent", border: "none", cursor: "pointer", color: "#C4C4C4", display: "flex", alignItems: "center" }}>
                                    <Trash2 className="w-3 h-3" />
                                  </button>
                                </div>
                              )}
                            </div>
                          )
                        })}
                        {isUploadingThis && (
                          <div style={{ padding: "12px 18px", borderTop: songs.length > 0 ? "1px solid #EFE9DA" : "none", display: "flex", alignItems: "center", gap: 10 }}>
                            <span style={{ fontFamily: "ui-monospace,'SF Mono',Menlo,monospace", fontSize: 11, color: "#C4C4C4", minWidth: 16 }}>—</span>
                            <span style={{ fontSize: 13, color: "#8A8497" }}>Parsing chart…</span>
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
            <div style={{ textAlign: "center", padding: "40px 0", color: "#8A8497", fontSize: 14 }}>Loading…</div>
          ) : (
            <>
              {/* My availability */}
              <div style={{ marginBottom: 32 }}>
                <p style={{ fontFamily: "var(--font-instrument-serif)", fontSize: 20, color: "#13101A", marginBottom: 14 }}>My availability</p>
                {weeks.length === 0 ? (
                  <div style={{ background: "#FBF8F2", border: "1.5px dashed #E2DDCF", borderRadius: 14, padding: "32px 24px", textAlign: "center" }}>
                    <p style={{ fontSize: 13, color: "#8A8497" }}>No weeks scheduled this month. Check the Schedule tab.</p>
                  </div>
                ) : (
                  <div style={{ background: "#FBF8F2", border: "1px solid #E2DDCF", borderRadius: 14, overflow: "hidden" }}>
                    {weeks.map((week, i) => {
                      const date = week.week_date
                      const avail = myAvailability[date]
                      const isSaving = savingAvail === date
                      return (
                        <div key={week.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, padding: "14px 18px", borderBottom: i < weeks.length - 1 ? "1px solid #E2DDCF" : "none", flexWrap: "wrap" as const }}>
                          <p style={{ fontSize: 14, color: "#13101A", flexShrink: 0 }}>{worshipWeekDateLabel(date)}</p>
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
                                    border: `1px solid ${active ? cfg.activeBorder : "#E8E2D2"}`,
                                    background: active ? cfg.activeBg : "transparent",
                                    color: active ? cfg.activeColor : "#8A8497",
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
                  <p style={{ fontFamily: "var(--font-instrument-serif)", fontSize: 20, color: "#13101A", marginBottom: 14 }}>Team availability</p>
                  <div style={{ background: "#FBF8F2", border: "1px solid #E2DDCF", borderRadius: 14, overflowX: "auto" }}>
                    <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                      <thead>
                        <tr style={{ borderBottom: "1px solid #E2DDCF" }}>
                          <th style={{ textAlign: "left", padding: "10px 16px", color: "#8A8497", fontFamily: "ui-monospace,'SF Mono',Menlo,monospace", fontWeight: 400, fontSize: 11, letterSpacing: "0.1em", textTransform: "uppercase", whiteSpace: "nowrap" as const }}>Member</th>
                          {weeks.map(w => (
                            <th key={w.id} style={{ textAlign: "center", padding: "10px 12px", color: "#8A8497", fontFamily: "ui-monospace,'SF Mono',Menlo,monospace", fontWeight: 400, fontSize: 11, letterSpacing: "0.1em", whiteSpace: "nowrap" as const }}>
                              {new Date(w.week_date + "T12:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {teamMembers.map((member, i) => (
                          <tr key={member.user_id} style={{ borderBottom: i < teamMembers.length - 1 ? "1px solid #E2DDCF" : "none" }}>
                            <td style={{ padding: "10px 16px", color: "#13101A", fontWeight: 500, whiteSpace: "nowrap" as const }}>{member.name}</td>
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
                                        : <span style={{ color: "#C4C4C4", fontSize: 13 }}>—</span>
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
  const monoStyle: React.CSSProperties = { fontFamily: "ui-monospace,'SF Mono',Menlo,monospace", fontSize: 11, letterSpacing: "0.12em", textTransform: "uppercase", color: "#8A8497" }

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

  if (loading) return <div style={{ textAlign: "center", padding: "60px 0", color: "#8A8497", fontSize: 14 }}>Loading…</div>

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
            style={{ padding: "6px 14px", background: showMembers ? "#3E1540" : "transparent", color: showMembers ? "#F6F4EF" : "#5A5466", border: "1px solid #E2DDCF", borderRadius: 10, fontSize: 13, fontWeight: 500, cursor: "pointer" }}>
            Members
          </button>
          {canManage && !showAddEvent && (
            <button onClick={() => setShowAddEvent(true)}
              style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "6px 14px", background: "#3E1540", color: "#F6F4EF", borderRadius: 10, fontSize: 13, fontWeight: 600, border: "none", cursor: "pointer" }}>
              <Plus className="w-3.5 h-3.5" /> Add event
            </button>
          )}
        </div>
      </div>

      {/* Members panel */}
      {showMembers && (
        <div style={{ background: "#FBF8F2", border: "1px solid #E2DDCF", borderRadius: 14, padding: 20, marginBottom: 24 }}>
          <p style={{ ...monoStyle, marginBottom: 14 }}>Team members</p>
          {teamMembers.length === 0 && <p style={{ fontSize: 13, color: "#8A8497", marginBottom: 12 }}>No members yet.</p>}
          {teamMembers.map(m => (
            <div key={m.user_id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "8px 0", borderBottom: "1px solid #EFE9DA" }}>
              <span style={{ fontSize: 14, color: "#13101A" }}>{m.name}</span>
              {canManage && m.user_id !== userId && (
                <button onClick={() => handleRemoveTeamMember(m.user_id)} style={{ fontSize: 12, color: "#C4C4C4", background: "none", border: "none", cursor: "pointer" }}>✕</button>
              )}
            </div>
          ))}
          {canManage && (
            <div style={{ marginTop: 14, position: "relative" }}>
              <input type="text" placeholder="Add member…" value={addMemberSearch}
                onChange={e => { setAddMemberSearch(e.target.value); setAddMemberId("") }}
                onFocus={() => setAddMemberFocused(true)}
                onBlur={() => setTimeout(() => setAddMemberFocused(false), 150)}
                style={{ width: "100%", padding: "8px 10px", borderRadius: 8, border: "1px solid #E2DDCF", background: "white", fontSize: 13, outline: "none", boxSizing: "border-box" as const }} />
              {addMemberFocused && filteredForAdd.length > 0 && (
                <div style={{ position: "absolute", top: "100%", left: 0, right: 0, border: "1px solid #E2DDCF", borderRadius: 8, background: "white", maxHeight: 160, overflowY: "auto", zIndex: 10, boxShadow: "0 4px 12px rgba(0,0,0,0.08)" }}>
                  {filteredForAdd.map(m => (
                    <button key={m.id} onMouseDown={e => { e.preventDefault(); setAddMemberId(m.id); setAddMemberSearch(m.name); setAddMemberFocused(false) }}
                      style={{ display: "block", width: "100%", textAlign: "left", padding: "8px 12px", fontSize: 13, color: "#13101A", background: addMemberId === m.id ? "#F4F0F8" : "transparent", border: "none", cursor: "pointer" }}>
                      {m.name}
                    </button>
                  ))}
                </div>
              )}
              {addMemberId && (
                <button onClick={handleAddTeamMember} disabled={addingMember}
                  style={{ marginTop: 8, padding: "8px 16px", background: "#3E1540", color: "#F6F4EF", borderRadius: 8, fontSize: 13, fontWeight: 600, border: "none", cursor: "pointer", opacity: addingMember ? 0.6 : 1 }}>
                  {addingMember ? "Adding…" : "Add"}
                </button>
              )}
            </div>
          )}
        </div>
      )}

      {/* Add event form */}
      {showAddEvent && (
        <div style={{ background: "#FBF8F2", border: "1px solid #E2DDCF", borderRadius: 14, padding: 20, marginBottom: 16 }}>
          <p style={{ fontFamily: "var(--font-instrument-serif)", fontSize: 17, color: "#13101A", marginBottom: 14 }}>New event</p>
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <div>
              <label style={{ display: "block", fontSize: 12, fontWeight: 500, color: "#5A5466", marginBottom: 4 }}>Date</label>
              <input type="date" value={newEventDate} onChange={e => setNewEventDate(e.target.value)}
                style={{ padding: "9px 12px", borderRadius: 10, border: "1px solid #ECE8DE", background: "white", fontSize: 14, color: "#13101A", outline: "none" }} />
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <button onClick={handleAddEvent} disabled={!newEventDate || addingEvent}
                style={{ flex: 1, padding: 10, background: "#3E1540", color: "#F6F4EF", borderRadius: 10, fontSize: 13, fontWeight: 600, border: "none", cursor: "pointer", opacity: !newEventDate || addingEvent ? 0.6 : 1 }}>
                {addingEvent ? "Adding…" : "Add"}
              </button>
              <button onClick={() => { setShowAddEvent(false); setNewEventDate("") }}
                style={{ padding: "10px 16px", background: "transparent", color: "#8A8497", borderRadius: 10, fontSize: 13, border: "1px solid #ECE8DE", cursor: "pointer" }}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Events list */}
      {events.length === 0 && !showAddEvent ? (
        <div style={{ background: "#FBF8F2", border: "1.5px dashed #E2DDCF", borderRadius: 14, padding: "40px 24px", textAlign: "center" }}>
          <p style={{ fontFamily: "var(--font-instrument-serif)", fontSize: 18, color: "#13101A", marginBottom: 6 }}>No events yet.</p>
          <p style={{ fontSize: 13, color: "#8A8497" }}>Add an event to get started.</p>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          {events.map(event => {
            const songs = [...(songsByEvent[event.id] ?? [])].sort((a, b) => a.order_index - b.order_index)
            const isAddRoleTarget = addRoleToEventId === event.id
            const assignedIds = new Set(event.roles.map(r => r.user_id))
            const availableMembers = teamMembers.filter(m => !assignedIds.has(m.user_id) && (!addRoleSearch || m.name.toLowerCase().includes(addRoleSearch.toLowerCase())))
            return (
              <div key={event.id} style={{ background: "#FBF8F2", border: "1px solid #E8E2D2", borderRadius: 12, overflow: "hidden" }}>
                {/* Date header */}
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 20px", borderBottom: "1px solid #EFE9DA" }}>
                  <p style={{ fontFamily: "var(--font-instrument-serif)", fontSize: 17, color: "#13101A" }}>
                    {new Date(event.week_date + "T12:00:00").toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })}
                  </p>
                  {canManage && (
                    <button onClick={() => handleDeleteEvent(event.id)} style={{ padding: 4, background: "transparent", border: "none", cursor: "pointer", color: "#C4C4C4" }}>
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>

                {/* Roles */}
                {event.roles.map(role => (
                  <div key={role.id} style={{ display: "flex", alignItems: "center", gap: 16, padding: "0 20px", minHeight: 48, borderBottom: "1px solid #EFE9DA" }}>
                    <span style={{ ...monoStyle, flexShrink: 0, width: 90, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" as const }}>{role.role_name}</span>
                    <span style={{ fontSize: 14, color: "#13101A", flex: 1 }}>{role.user_name}</span>
                    {canManage && <button onClick={() => handleRemoveRole(role.id)} style={{ padding: "2px 6px", fontSize: 13, color: "#C4C4C4", background: "transparent", border: "none", cursor: "pointer" }}>✕</button>}
                  </div>
                ))}

                {/* Add role row */}
                {canManage && !isAddRoleTarget && (
                  <button onClick={() => { setAddRoleToEventId(event.id); setAddRoleSearch(""); setAddRoleUserId(""); setAddRoleValue(WORSHIP_ROLE_OPTIONS[0]); setAddRoleCustom("") }}
                    style={{ display: "block", width: "100%", padding: "12px 20px", borderTop: event.roles.length > 0 ? "1px solid #EFE9DA" : "none", borderRight: "none", borderBottom: "none", borderLeft: "none", background: "transparent", cursor: "pointer", textAlign: "left" as const, fontSize: 14, color: "#5A5466" }}>
                    + Add person
                  </button>
                )}
                {isAddRoleTarget && (
                  <div style={{ padding: "12px 20px", borderTop: "1px solid #EFE9DA" }}>
                    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                      <div style={{ position: "relative" }}>
                        <input type="text" placeholder="Search member…" value={addRoleSearch}
                          onChange={e => { setAddRoleSearch(e.target.value); setAddRoleUserId("") }}
                          onFocus={() => setAddRoleFocused(true)} onBlur={() => setTimeout(() => setAddRoleFocused(false), 150)}
                          style={{ width: "100%", padding: "8px 10px", borderRadius: 8, border: "1px solid #E2DDCF", background: "white", fontSize: 13, outline: "none", boxSizing: "border-box" as const }} />
                        {addRoleFocused && !addRoleUserId && availableMembers.length > 0 && (
                          <div style={{ position: "absolute", top: "100%", left: 0, right: 0, border: "1px solid #E2DDCF", borderRadius: 8, background: "white", maxHeight: 160, overflowY: "auto", zIndex: 10, boxShadow: "0 4px 12px rgba(0,0,0,0.08)" }}>
                            {availableMembers.map(m => (
                              <button key={m.user_id} onMouseDown={e => { e.preventDefault(); setAddRoleUserId(m.user_id); setAddRoleSearch(m.name); setAddRoleFocused(false) }}
                                style={{ display: "block", width: "100%", textAlign: "left", padding: "8px 12px", fontSize: 13, color: "#13101A", background: addRoleUserId === m.user_id ? "#F4F0F8" : "transparent", border: "none", cursor: "pointer" }}>
                                {m.name}
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                      <select value={addRoleValue} onChange={e => setAddRoleValue(e.target.value)}
                        style={{ padding: "8px 10px", borderRadius: 8, border: "1px solid #E2DDCF", background: "white", fontSize: 13, outline: "none" }}>
                        {WORSHIP_ROLE_OPTIONS.map(r => <option key={r} value={r}>{r}</option>)}
                      </select>
                      {addRoleValue === "Other" && (
                        <input type="text" placeholder="Custom role (e.g. Violin)…" value={addRoleCustom} onChange={e => setAddRoleCustom(e.target.value)}
                          style={{ padding: "8px 10px", borderRadius: 8, border: "1px solid #E2DDCF", background: "white", fontSize: 13, outline: "none" }} />
                      )}
                      <div style={{ display: "flex", gap: 6 }}>
                        <button onClick={() => handleAddRole(event.id)} disabled={!addRoleUserId || addingRole}
                          style={{ flex: 1, padding: 8, background: "#3E1540", color: "#F6F4EF", borderRadius: 8, fontSize: 12, fontWeight: 600, border: "none", cursor: "pointer", opacity: !addRoleUserId || addingRole ? 0.6 : 1 }}>
                          {addingRole ? "Adding…" : "Add"}
                        </button>
                        <button onClick={() => { setAddRoleToEventId(null); setAddRoleSearch(""); setAddRoleUserId(""); setAddRoleFocused(false) }}
                          style={{ padding: "8px 12px", background: "transparent", color: "#8A8497", borderRadius: 8, fontSize: 12, border: "1px solid #E2DDCF", cursor: "pointer" }}>
                          Cancel
                        </button>
                      </div>
                    </div>
                  </div>
                )}

                {/* Setlist */}
                <div style={{ borderTop: "1px solid #EFE9DA" }}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 20px" }}>
                    <p style={monoStyle}>Set list</p>
                    {canManage && (
                      <label style={{ display: "inline-flex", alignItems: "center", gap: 5, padding: "5px 12px", background: "#3E1540", color: "#F6F4EF", borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: uploadingEventId === event.id ? "not-allowed" : "pointer", opacity: uploadingEventId === event.id ? 0.6 : 1 }}>
                        <Plus className="w-3 h-3" />
                        {uploadingEventId === event.id ? "Uploading…" : "Chart"}
                        <input type="file" accept="application/pdf" style={{ display: "none" }} disabled={uploadingEventId === event.id}
                          onChange={e => { const f = e.target.files?.[0]; if (f) handleUploadChart(event.id, f); e.target.value = "" }} />
                      </label>
                    )}
                  </div>
                  {songs.length === 0 ? (
                    <p style={{ fontSize: 13, color: "#C4C4C4", padding: "0 20px 16px" }}>No songs yet. Upload a chart to add one.</p>
                  ) : (
                    <div>
                      {songs.map((song, idx) => {
                        const isEditingTitle = editingSong?.songId === song.id && editingSong?.field === "title"
                        const isEditingKey = editingSong?.songId === song.id && editingSong?.field === "key"
                        const isOcr = ocrInProgress.has(song.id)
                        return (
                          <div key={song.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 20px", borderTop: "1px solid #EFE9DA" }}>
                            <span style={{ fontFamily: "ui-monospace,'SF Mono',Menlo,monospace", fontSize: 11, color: "#C4C4C4", minWidth: 16 }}>{idx + 1}</span>
                            <div style={{ flex: 1, minWidth: 0 }}>
                              {isOcr ? <span style={{ fontSize: 13, color: "#8A8497", fontStyle: "italic" }}>Reading…</span> : isEditingTitle || !song.title ? (
                                <input autoFocus value={isEditingTitle ? (editingSong?.value ?? "") : ""}
                                  placeholder="Song title…" onChange={e => setEditingSong({ songId: song.id, field: "title", value: e.target.value })}
                                  onFocus={() => { if (!isEditingTitle) setEditingSong({ songId: song.id, field: "title", value: "" }) }}
                                  onBlur={handleSaveInlineEdit} onKeyDown={e => { if (e.key === "Enter") handleSaveInlineEdit() }}
                                  style={{ width: "100%", border: "none", outline: "none", fontFamily: "var(--font-instrument-serif)", fontSize: 18, color: "#13101A", background: "transparent", borderBottom: "1px solid #E2DDCF" }} />
                              ) : (
                                <button onClick={() => setEditingSong({ songId: song.id, field: "title", value: song.title })}
                                  style={{ background: "transparent", border: "none", cursor: "pointer", fontFamily: "var(--font-instrument-serif)", fontSize: 18, color: "#13101A", textAlign: "left", padding: 0, width: "100%", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" as const }}>
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
                                    style={{ width: 52, border: "none", outline: "none", fontFamily: "ui-monospace,'SF Mono',Menlo,monospace", fontSize: 12, color: "#2D0F2E", background: "#EDE3EE", borderRadius: 8, padding: "3px 8px", textAlign: "center" as const }} />
                                ) : (
                                  <button onClick={() => setEditingSong({ songId: song.id, field: "key", value: song.key })}
                                    style={{ width: 28, height: 28, fontFamily: "ui-monospace,'SF Mono',Menlo,monospace", fontSize: 12, fontWeight: 700, color: "#2D0F2E", background: "#EDE3EE", borderRadius: 8, border: "none", cursor: "pointer", display: "inline-flex", alignItems: "center", justifyContent: "center" }}>
                                    {song.key || "—"}
                                  </button>
                                )}
                              </div>
                            )}
                            {canManage && (
                              <button onClick={() => handleDeleteSong(event.id, song.id)} style={{ padding: "2px 5px", background: "transparent", border: "none", cursor: "pointer", color: "#C4C4C4" }}>
                                <Trash2 className="w-3 h-3" />
                              </button>
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
  const monoStyle: React.CSSProperties = { fontFamily: "ui-monospace,'SF Mono',Menlo,monospace", fontSize: 11, letterSpacing: "0.12em", textTransform: "uppercase", color: "#8A8497" }

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

  if (loading) return <div style={{ textAlign: "center", padding: "60px 0", color: "#8A8497", fontSize: 14 }}>Loading…</div>

  const filteredForRole = allMinistryMembers.filter(m => !addRoleSearch || m.name.toLowerCase().includes(addRoleSearch.toLowerCase()))

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
        <p style={monoStyle}>Events · {events.length}</p>
        {canManage && !showAddEvent && (
          <button onClick={() => setShowAddEvent(true)}
            style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "6px 14px", background: "#3E1540", color: "#F6F4EF", borderRadius: 10, fontSize: 13, fontWeight: 600, border: "none", cursor: "pointer" }}>
            <Plus className="w-3.5 h-3.5" /> Add event
          </button>
        )}
      </div>

      {showAddEvent && (
        <div style={{ background: "#FBF8F2", border: "1px solid #E2DDCF", borderRadius: 14, padding: 20, marginBottom: 16 }}>
          <p style={{ fontFamily: "var(--font-instrument-serif)", fontSize: 17, color: "#13101A", marginBottom: 14 }}>New event</p>
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <div>
              <label style={{ display: "block", fontSize: 12, fontWeight: 500, color: "#5A5466", marginBottom: 4 }}>Event name</label>
              <input type="text" placeholder="e.g. Welcome Week Praise Night" value={newEventName} onChange={e => setNewEventName(e.target.value)}
                style={{ width: "100%", padding: "9px 12px", borderRadius: 10, border: "1px solid #ECE8DE", background: "white", fontSize: 14, color: "#13101A", outline: "none", boxSizing: "border-box" as const }} />
            </div>
            <div>
              <label style={{ display: "block", fontSize: 12, fontWeight: 500, color: "#5A5466", marginBottom: 4 }}>Date</label>
              <input type="date" value={newEventDate} onChange={e => setNewEventDate(e.target.value)}
                style={{ padding: "9px 12px", borderRadius: 10, border: "1px solid #ECE8DE", background: "white", fontSize: 14, color: "#13101A", outline: "none" }} />
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <button onClick={handleAddEvent} disabled={!newEventDate || addingEvent}
                style={{ flex: 1, padding: 10, background: "#3E1540", color: "#F6F4EF", borderRadius: 10, fontSize: 13, fontWeight: 600, border: "none", cursor: "pointer", opacity: !newEventDate || addingEvent ? 0.6 : 1 }}>
                {addingEvent ? "Adding…" : "Add"}
              </button>
              <button onClick={() => { setShowAddEvent(false); setNewEventDate(""); setNewEventName("") }}
                style={{ padding: "10px 16px", background: "transparent", color: "#8A8497", borderRadius: 10, fontSize: 13, border: "1px solid #ECE8DE", cursor: "pointer" }}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {events.length === 0 && !showAddEvent ? (
        <div style={{ background: "#FBF8F2", border: "1.5px dashed #E2DDCF", borderRadius: 14, padding: "40px 24px", textAlign: "center" }}>
          <p style={{ fontFamily: "var(--font-instrument-serif)", fontSize: 18, color: "#13101A", marginBottom: 6 }}>No events yet.</p>
          <p style={{ fontSize: 13, color: "#8A8497" }}>Add an event to get started.</p>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          {events.map(event => {
            const songs = [...(songsByEvent[event.id] ?? [])].sort((a, b) => a.order_index - b.order_index)
            const isAddRoleTarget = addRoleToEventId === event.id
            const assignedIds = new Set(event.roles.map(r => r.user_id))
            const availableForRole = filteredForRole.filter(m => !assignedIds.has(m.id))
            return (
              <div key={event.id} style={{ background: "#FBF8F2", border: "1px solid #E8E2D2", borderRadius: 12, overflow: "hidden" }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 20px", borderBottom: "1px solid #EFE9DA" }}>
                  <div>
                    {event.event_name && <p style={{ fontFamily: "var(--font-instrument-serif)", fontSize: 17, color: "#13101A", lineHeight: 1.2 }}>{event.event_name}</p>}
                    <p style={{ fontSize: 13, color: event.event_name ? "#8A8497" : "#13101A", fontFamily: event.event_name ? "var(--font-inter)" : "var(--font-instrument-serif)", ...(event.event_name ? {} : { fontSize: 17 }) }}>
                      {new Date(event.week_date + "T12:00:00").toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })}
                    </p>
                  </div>
                  {canManage && (
                    <button onClick={() => handleDeleteEvent(event.id)} style={{ padding: 4, background: "transparent", border: "none", cursor: "pointer", color: "#C4C4C4" }}>
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>

                {event.roles.map(role => (
                  <div key={role.id} style={{ display: "flex", alignItems: "center", gap: 16, padding: "0 20px", minHeight: 48, borderBottom: "1px solid #EFE9DA" }}>
                    <span style={{ ...monoStyle, flexShrink: 0, width: 90, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" as const }}>{role.role_name}</span>
                    <span style={{ fontSize: 14, color: "#13101A", flex: 1 }}>{role.user_name}</span>
                    {canManage && <button onClick={() => handleRemoveRole(role.id)} style={{ padding: "2px 6px", fontSize: 13, color: "#C4C4C4", background: "transparent", border: "none", cursor: "pointer" }}>✕</button>}
                  </div>
                ))}

                {canManage && !isAddRoleTarget && (
                  <button onClick={() => { setAddRoleToEventId(event.id); setAddRoleSearch(""); setAddRoleUserId(""); setAddRoleValue(WORSHIP_ROLE_OPTIONS[0]); setAddRoleCustom("") }}
                    style={{ display: "block", width: "100%", padding: "12px 20px", borderTop: event.roles.length > 0 ? "1px solid #EFE9DA" : "none", borderRight: "none", borderBottom: "none", borderLeft: "none", background: "transparent", cursor: "pointer", textAlign: "left" as const, fontSize: 14, color: "#5A5466" }}>
                    + Add person
                  </button>
                )}
                {isAddRoleTarget && (
                  <div style={{ padding: "12px 20px", borderTop: "1px solid #EFE9DA" }}>
                    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                      <div style={{ position: "relative" }}>
                        <input type="text" placeholder="Search member…" value={addRoleSearch}
                          onChange={e => { setAddRoleSearch(e.target.value); setAddRoleUserId("") }}
                          onFocus={() => setAddRoleFocused(true)} onBlur={() => setTimeout(() => setAddRoleFocused(false), 150)}
                          style={{ width: "100%", padding: "8px 10px", borderRadius: 8, border: "1px solid #E2DDCF", background: "white", fontSize: 13, outline: "none", boxSizing: "border-box" as const }} />
                        {addRoleFocused && !addRoleUserId && availableForRole.length > 0 && (
                          <div style={{ position: "absolute", top: "100%", left: 0, right: 0, border: "1px solid #E2DDCF", borderRadius: 8, background: "white", maxHeight: 160, overflowY: "auto", zIndex: 10, boxShadow: "0 4px 12px rgba(0,0,0,0.08)" }}>
                            {availableForRole.map(m => (
                              <button key={m.id} onMouseDown={e => { e.preventDefault(); setAddRoleUserId(m.id); setAddRoleSearch(m.name); setAddRoleFocused(false) }}
                                style={{ display: "block", width: "100%", textAlign: "left", padding: "8px 12px", fontSize: 13, color: "#13101A", background: addRoleUserId === m.id ? "#F4F0F8" : "transparent", border: "none", cursor: "pointer" }}>
                                {m.name}
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                      <select value={addRoleValue} onChange={e => setAddRoleValue(e.target.value)}
                        style={{ padding: "8px 10px", borderRadius: 8, border: "1px solid #E2DDCF", background: "white", fontSize: 13, outline: "none" }}>
                        {WORSHIP_ROLE_OPTIONS.map(r => <option key={r} value={r}>{r}</option>)}
                      </select>
                      {addRoleValue === "Other" && (
                        <input type="text" placeholder="Custom role (e.g. Violin)…" value={addRoleCustom} onChange={e => setAddRoleCustom(e.target.value)}
                          style={{ padding: "8px 10px", borderRadius: 8, border: "1px solid #E2DDCF", background: "white", fontSize: 13, outline: "none" }} />
                      )}
                      <div style={{ display: "flex", gap: 6 }}>
                        <button onClick={() => handleAddRole(event.id)} disabled={!addRoleUserId || addingRole}
                          style={{ flex: 1, padding: 8, background: "#3E1540", color: "#F6F4EF", borderRadius: 8, fontSize: 12, fontWeight: 600, border: "none", cursor: "pointer", opacity: !addRoleUserId || addingRole ? 0.6 : 1 }}>
                          {addingRole ? "Adding…" : "Add"}
                        </button>
                        <button onClick={() => { setAddRoleToEventId(null); setAddRoleSearch(""); setAddRoleUserId(""); setAddRoleFocused(false) }}
                          style={{ padding: "8px 12px", background: "transparent", color: "#8A8497", borderRadius: 8, fontSize: 12, border: "1px solid #E2DDCF", cursor: "pointer" }}>
                          Cancel
                        </button>
                      </div>
                    </div>
                  </div>
                )}

                <div style={{ borderTop: "1px solid #EFE9DA" }}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 20px" }}>
                    <p style={monoStyle}>Set list</p>
                    {canManage && (
                      <label style={{ display: "inline-flex", alignItems: "center", gap: 5, padding: "5px 12px", background: "#3E1540", color: "#F6F4EF", borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: uploadingEventId === event.id ? "not-allowed" : "pointer", opacity: uploadingEventId === event.id ? 0.6 : 1 }}>
                        <Plus className="w-3 h-3" />
                        {uploadingEventId === event.id ? "Uploading…" : "Chart"}
                        <input type="file" accept="application/pdf" style={{ display: "none" }} disabled={uploadingEventId === event.id}
                          onChange={e => { const f = e.target.files?.[0]; if (f) handleUploadChart(event.id, f); e.target.value = "" }} />
                      </label>
                    )}
                  </div>
                  {songs.length === 0 ? (
                    <p style={{ fontSize: 13, color: "#C4C4C4", padding: "0 20px 16px" }}>No songs yet. Upload a chart to add one.</p>
                  ) : (
                    <div>
                      {songs.map((song, idx) => {
                        const isEditingTitle = editingSong?.songId === song.id && editingSong?.field === "title"
                        const isEditingKey = editingSong?.songId === song.id && editingSong?.field === "key"
                        const isOcr = ocrInProgress.has(song.id)
                        return (
                          <div key={song.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 20px", borderTop: "1px solid #EFE9DA" }}>
                            <span style={{ fontFamily: "ui-monospace,'SF Mono',Menlo,monospace", fontSize: 11, color: "#C4C4C4", minWidth: 16 }}>{idx + 1}</span>
                            <div style={{ flex: 1, minWidth: 0 }}>
                              {isOcr ? <span style={{ fontSize: 13, color: "#8A8497", fontStyle: "italic" }}>Reading…</span> : isEditingTitle || !song.title ? (
                                <input autoFocus value={isEditingTitle ? (editingSong?.value ?? "") : ""}
                                  placeholder="Song title…" onChange={e => setEditingSong({ songId: song.id, field: "title", value: e.target.value })}
                                  onFocus={() => { if (!isEditingTitle) setEditingSong({ songId: song.id, field: "title", value: "" }) }}
                                  onBlur={handleSaveInlineEdit} onKeyDown={e => { if (e.key === "Enter") handleSaveInlineEdit() }}
                                  style={{ width: "100%", border: "none", outline: "none", fontFamily: "var(--font-instrument-serif)", fontSize: 18, color: "#13101A", background: "transparent", borderBottom: "1px solid #E2DDCF" }} />
                              ) : (
                                <button onClick={() => setEditingSong({ songId: song.id, field: "title", value: song.title })}
                                  style={{ background: "transparent", border: "none", cursor: "pointer", fontFamily: "var(--font-instrument-serif)", fontSize: 18, color: "#13101A", textAlign: "left", padding: 0, width: "100%", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" as const }}>
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
                                    style={{ width: 52, border: "none", outline: "none", fontFamily: "ui-monospace,'SF Mono',Menlo,monospace", fontSize: 12, color: "#2D0F2E", background: "#EDE3EE", borderRadius: 8, padding: "3px 8px", textAlign: "center" as const }} />
                                ) : (
                                  <button onClick={() => setEditingSong({ songId: song.id, field: "key", value: song.key })}
                                    style={{ width: 28, height: 28, fontFamily: "ui-monospace,'SF Mono',Menlo,monospace", fontSize: 12, fontWeight: 700, color: "#2D0F2E", background: "#EDE3EE", borderRadius: 8, border: "none", cursor: "pointer", display: "inline-flex", alignItems: "center", justifyContent: "center" }}>
                                    {song.key || "—"}
                                  </button>
                                )}
                              </div>
                            )}
                            {canManage && (
                              <button onClick={() => handleDeleteSong(event.id, song.id)} style={{ padding: "2px 5px", background: "transparent", border: "none", cursor: "pointer", color: "#C4C4C4" }}>
                                <Trash2 className="w-3 h-3" />
                              </button>
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

function TechTeamTab({ ministryId, userId }: { ministryId: string; userId: string }) {
  const supabase = createClient()
  const monoStyle: React.CSSProperties = { fontFamily: "ui-monospace,'SF Mono',Menlo,monospace", fontSize: 11, letterSpacing: "0.12em", textTransform: "uppercase", color: "#8A8497" }

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
    const html = `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><title>Worship Slides</title><style>*{box-sizing:border-box;margin:0;padding:0}body{background:#1a0a1c;font-family:Georgia,serif}.slide{width:100vw;height:100vh;display:flex;flex-direction:column;align-items:center;justify-content:center;background:#3E1540;page-break-after:always}.title{font-size:clamp(48px,8vw,96px);color:#F6F4EF;text-align:center;font-weight:400;line-height:1.15;padding:0 10vw}.key{margin-top:28px;font-family:monospace;font-size:clamp(18px,2.5vw,28px);color:rgba(246,244,239,.55);letter-spacing:.2em;text-transform:uppercase}@media print{.slide{page-break-after:always}}</style></head><body>${songs.map(s => `<div class="slide"><p class="title">${esc(s.title)}</p><p class="key">${esc(s.key)}</p></div>`).join("")}</body></html>`
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
      <div key={event.id} style={{ background: "#FBF8F2", border: "1px solid #E8E2D2", borderRadius: 12, overflow: "hidden", marginBottom: 12 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 18px", borderBottom: songs.length > 0 ? "1px solid #EFE9DA" : "none" }}>
          <div>
            {event.event_name && <p style={{ fontFamily: "var(--font-instrument-serif)", fontSize: 16, color: "#13101A" }}>{event.event_name}</p>}
            {showTeamName && !event.event_name && <p style={{ fontFamily: "var(--font-instrument-serif)", fontSize: 16, color: "#13101A" }}>{event.teamName}</p>}
            <p style={{ fontSize: 15, color: event.event_name || showTeamName ? "#8A8497" : "#13101A", marginTop: event.event_name || showTeamName ? 1 : 0, fontFamily: "var(--font-instrument-serif)" }}>{dateStr}</p>
          </div>
          {songs.length > 0 && (
            <div style={{ display: "flex", gap: 8 }}>
              <button
                onClick={() => slidesDeck && slidesEventLabel === label ? setSlidesOverlayOpen(true) : handleGenerateSlides(songs, label)}
                disabled={slidesGenerating}
                style={{ padding: "6px 14px", background: "#3E1540", color: "#F6F4EF", borderRadius: 8, fontSize: 12, fontWeight: 600, border: "none", cursor: slidesGenerating ? "not-allowed" : "pointer", opacity: slidesGenerating ? 0.6 : 1 }}>
                {slidesGenerating && slidesEventLabel === label ? "…" : "Slides"}
              </button>
              <button onClick={() => handleExportSlides(songs)}
                style={{ padding: "6px 12px", background: "transparent", color: "#3E1540", borderRadius: 8, fontSize: 12, fontWeight: 600, border: "1px solid #3E1540", cursor: "pointer" }}>
                Export
              </button>
            </div>
          )}
        </div>
        {songs.map((song, i) => (
          <div key={song.id} style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 18px", borderBottom: i < songs.length - 1 ? "1px solid #EFE9DA" : "none" }}>
            <span style={{ fontFamily: "ui-monospace,'SF Mono',Menlo,monospace", fontSize: 11, color: "#C4C4C4", minWidth: 18 }}>{i + 1}</span>
            <span style={{ fontFamily: "var(--font-instrument-serif)", fontSize: 17, color: "#13101A", flex: 1 }}>{song.title || <span style={{ fontFamily: "var(--font-inter)", fontSize: 14, color: "#C4C4C4" }}>Untitled</span>}</span>
            {song.key && <span style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", width: 26, height: 26, fontFamily: "ui-monospace,'SF Mono',Menlo,monospace", fontSize: 11, fontWeight: 700, color: "#2D0F2E", background: "#EDE3EE", borderRadius: 7 }}>{song.key}</span>}
          </div>
        ))}
        {songs.length === 0 && <p style={{ fontSize: 13, color: "#C4C4C4", padding: "12px 18px" }}>No songs in set.</p>}
      </div>
    )
  }

  if (loading) return <div style={{ textAlign: "center", padding: "60px 0", color: "#8A8497", fontSize: 14 }}>Loading…</div>

  return (
    <div>
      {/* Slides overlay */}
      {slidesOverlayOpen && slidesDeck && (() => {
        const slide = slidesDeck[slidesActiveIndex]
        return (
          <div style={{ position: "fixed", inset: 0, zIndex: 200, background: "#3E1540", display: "flex", flexDirection: "column" }}>
            <div style={{ position: "absolute", inset: 0, background: "radial-gradient(ellipse at 50% 55%, rgba(246,244,239,0.12) 0%, transparent 65%)", pointerEvents: "none" }} />
            <button onClick={() => setSlidesOverlayOpen(false)} style={{ position: "absolute", top: 20, right: 20, zIndex: 10, width: 36, height: 36, borderRadius: "50%", background: "rgba(246,244,239,0.12)", border: "none", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", color: "#F6F4EF" }}>
              <X className="w-5 h-5" />
            </button>
            <div onClick={() => setSlidesActiveIndex(i => Math.max(i - 1, 0))} style={{ position: "absolute", left: 0, top: 0, width: "33%", height: "100%", zIndex: 5, cursor: slidesActiveIndex > 0 ? "pointer" : "default" }} />
            <div onClick={() => setSlidesActiveIndex(i => Math.min(i + 1, slidesDeck.length - 1))} style={{ position: "absolute", right: 0, top: 0, width: "33%", height: "100%", zIndex: 5, cursor: slidesActiveIndex < slidesDeck.length - 1 ? "pointer" : "default" }} />
            <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "72px 40px 80px", textAlign: "center", position: "relative", zIndex: 6 }}>
              {slide.isTitle ? (
                <>
                  <p style={{ fontFamily: "var(--font-inter)", fontSize: 11, fontWeight: 600, letterSpacing: "0.16em", textTransform: "uppercase" as const, color: "rgba(246,244,239,0.62)", marginBottom: 20 }}>{slide.songKey ? `Key of ${slide.songKey}` : ""}</p>
                  <p style={{ fontFamily: "var(--font-instrument-serif)", fontSize: "clamp(36px,7vw,72px)", color: "#F6F4EF", lineHeight: 1.15, fontWeight: 400 }}>{slide.songTitle}</p>
                  <div style={{ width: 40, height: 1.5, background: "rgba(246,244,239,0.32)", margin: "28px auto 0" }} />
                </>
              ) : (
                <>
                  <p style={{ fontFamily: "var(--font-instrument-serif)", fontSize: 15, color: "rgba(246,244,239,0.45)", marginBottom: 6 }}>{slide.songTitle}</p>
                  {slide.section && <p style={{ fontFamily: "var(--font-inter)", fontSize: 11, fontWeight: 600, letterSpacing: "0.14em", textTransform: "uppercase" as const, color: "rgba(246,244,239,0.35)", marginBottom: 28 }}>{slide.section}</p>}
                  <p style={{ fontFamily: "var(--font-instrument-serif)", fontSize: "clamp(26px,5.5vw,52px)", color: "#F6F4EF", lineHeight: 1.35, fontWeight: 400, whiteSpace: "pre-line" as const }}>{slide.lyrics}</p>
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
          <div style={{ background: "#FBF8F2", border: "1.5px dashed #E2DDCF", borderRadius: 12, padding: "28px 20px", textAlign: "center" }}>
            <p style={{ fontSize: 13, color: "#8A8497" }}>No Sunday sets yet.</p>
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

  const monoStyle: React.CSSProperties = { fontFamily: "ui-monospace,'SF Mono',Menlo,monospace", fontSize: 11, letterSpacing: "0.08em", textTransform: "uppercase", color: "#8A8497" }

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 200, background: "#13101A", display: "flex", flexDirection: "column" }}>
      {/* Toolbar */}
      <div style={{ background: "#1E1825", borderBottom: "1px solid rgba(255,255,255,0.08)", padding: "14px 16px", paddingTop: 52, display: "flex", alignItems: "center", gap: 12, flexShrink: 0 }}>
        <button onClick={onClose} style={{ padding: 6, background: "transparent", border: "none", cursor: "pointer", color: "#8A8497", display: "flex", alignItems: "center", flexShrink: 0 }}>
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
              style={{ width: "100%", background: "transparent", border: "none", borderBottom: "1px solid rgba(255,255,255,0.2)", outline: "none", fontFamily: "var(--font-instrument-serif)", fontSize: 18, color: "#F6F4EF", padding: "2px 0" }}
            />
          ) : (
            <button onClick={canManage ? () => { setEditingField("title"); setEditValue(song.title) } : undefined}
              style={{ background: "transparent", border: "none", cursor: canManage ? "text" : "default", fontFamily: "var(--font-instrument-serif)", fontSize: 18, color: "#F6F4EF", padding: 0, textAlign: "left", maxWidth: "100%", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" as const, display: "block" }}>
              {song.title || <span style={{ color: "#5A5466" }}>Untitled</span>}
            </button>
          )}
          {editingField === "key" ? (
            <input
              autoFocus
              value={editValue}
              onChange={e => setEditValue(e.target.value)}
              onBlur={handleSaveFieldEdit}
              onKeyDown={e => { if (e.key === "Enter") handleSaveFieldEdit(); if (e.key === "Escape") setEditingField(null) }}
              style={{ background: "transparent", border: "none", borderBottom: "1px solid rgba(255,255,255,0.2)", outline: "none", ...monoStyle, color: "#F6F4EF", padding: "2px 0", width: 60 }}
            />
          ) : (
            <button onClick={canManage ? () => { setEditingField("key"); setEditValue(song.key) } : undefined}
              style={{ background: "transparent", border: "none", cursor: canManage ? "text" : "default", ...monoStyle, color: song.key ? "#3E1540" : "#5A5466", padding: 0 }}>
              {song.key || "NO KEY"}
            </button>
          )}
        </div>
        {numPages > 1 && (
          <div style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
            <button onClick={() => setCurrentPage(p => Math.max(1, p - 1))} disabled={currentPage === 1}
              style={{ padding: 4, background: "transparent", border: "none", cursor: "pointer", color: "#8A8497", opacity: currentPage === 1 ? 0.4 : 1, display: "flex" }}>
              <ChevronLeft className="w-4 h-4" />
            </button>
            <span style={{ fontSize: 12, color: "#8A8497", minWidth: 36, textAlign: "center" as const }}>{currentPage}/{numPages}</span>
            <button onClick={() => setCurrentPage(p => Math.min(numPages, p + 1))} disabled={currentPage === numPages}
              style={{ padding: 4, background: "transparent", border: "none", cursor: "pointer", color: "#8A8497", opacity: currentPage === numPages ? 0.4 : 1, display: "flex" }}>
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        )}
      </div>

      {/* PDF + annotation area */}
      <div ref={containerRef} style={{ flex: 1, overflowY: "auto", display: "flex", flexDirection: "column", alignItems: "center", padding: 16, background: "#13101A" }}
        onClick={handlePdfAreaClick}>
        {loading ? (
          <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", color: "#8A8497", fontSize: 14 }}>Loading…</div>
        ) : !song.chart_url ? (
          <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", color: "#8A8497", fontSize: 14 }}>No chart uploaded for this song.</div>
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
                  fontSize: 11, fontWeight: 600, color: "#13101A",
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
                  background: "white", borderRadius: 10, padding: 12,
                  boxShadow: "0 4px 24px rgba(0,0,0,0.5)", zIndex: 20, width: 190,
                }}>
                <input
                  autoFocus
                  value={pendingText}
                  onChange={e => setPendingText(e.target.value)}
                  onKeyDown={e => { if (e.key === "Enter") handleSaveAnnotation(); if (e.key === "Escape") setPendingAnnotation(null) }}
                  placeholder="Add note…"
                  style={{ width: "100%", border: "none", outline: "none", fontSize: 12, color: "#13101A", marginBottom: 8, boxSizing: "border-box" as const }}
                />
                <div style={{ display: "flex", gap: 6 }}>
                  <button onClick={handleSaveAnnotation} disabled={savingAnnotation || !pendingText.trim()}
                    style={{ flex: 1, padding: "5px 8px", background: "#3E1540", color: "#F6F4EF", border: "none", borderRadius: 6, fontSize: 11, fontWeight: 600, cursor: "pointer", opacity: !pendingText.trim() ? 0.5 : 1 }}>
                    Save
                  </button>
                  <button onClick={() => setPendingAnnotation(null)}
                    style={{ padding: "5px 8px", background: "#F0EDE8", color: "#5A5466", border: "none", borderRadius: 6, fontSize: 11, cursor: "pointer" }}>
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
          <p style={{ fontSize: 11, color: "#5A5466" }}>Tap anywhere on the chart to add a note · tap a note to delete it</p>
        </div>
      )}
    </div>
  )
}

// ── MinistryCalendar ──────────────────────────────────────────────────────────

const CATEGORY_CONFIG = {
  welcoming: { label: "Welcoming", dot: "#3E1540", bg: "#EDE5F0", text: "#3E1540" },
  retreat:   { label: "Retreat",   dot: "#5A5466", bg: "#F4F1E8", text: "#3E1540" },
  social:    { label: "Social",    dot: "#8A8497", bg: "#FBF8F2", text: "#5A5466" },
  service:   { label: "Service",   dot: "#3E1540", bg: "#F0EDE8", text: "#3E1540" },
  regular:   { label: "Regular",   dot: "#8A8497", bg: "#F3F0F7", text: "#5A5466" },
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
    label: "Welcome Week", icon: "🎉", dot: "#3E1540", bg: "#EDE5F0", text: "#3E1540",
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
    extraTabs: ["sub_events", "new_folks"],
  },
  coffeehouse: {
    label: "Coffeehouse", icon: "☕", dot: "#9D7B4F", bg: "#FDF6EC", text: "#6B4C1E",
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
    label: "Turkey Bowl", icon: "🏈", dot: "#5B7A6C", bg: "#EEF4F1", text: "#2D5445",
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
    label: "Retreat", icon: "⛺", dot: "#5A5466", bg: "#F4F1E8", text: "#3E1540",
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
    label: "Social", icon: "🎊", dot: "#8A8497", bg: "#FBF8F2", text: "#5A5466",
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
    label: "Ministry Event", icon: "🙏", dot: "#3E1540", bg: "#F3F0F7", text: "#5A5466",
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
          style={{ width: 28, height: 28, borderRadius: 8, border: "1px solid #E5E0D2", background: "#FBF8F2", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}
        >
          <ChevronLeft className="w-4 h-4 text-[#5A5466]" />
        </button>
        <span style={{ fontFamily: "var(--font-instrument-serif)", fontSize: 18, color: "#13101A", fontWeight: 400, minWidth: 180, textAlign: "center" }}>
          {monthLabel}
        </span>
        <button
          onClick={() => onMonthChange(new Date(year, month + 1, 1))}
          style={{ width: 28, height: 28, borderRadius: 8, border: "1px solid #E5E0D2", background: "#FBF8F2", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}
        >
          <ChevronRight className="w-4 h-4 text-[#5A5466]" />
        </button>
      </div>

      {/* Week header */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", marginBottom: 4 }}>
        {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => (
          <div key={d} style={{ fontFamily: "ui-monospace, 'SF Mono', Menlo, monospace", fontSize: 10, letterSpacing: "0.04em", textTransform: "uppercase", color: "#8A8497", textAlign: "center", paddingBottom: 4 }}>
            {d}
          </div>
        ))}
      </div>

      {/* Grid */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", border: "1px solid #E5E0D2", borderRadius: 10, overflow: "hidden" }}>
        {cells.map((day, idx) => {
          const dayEvents = day ? eventsOnDay(day) : []
          const visible = dayEvents.slice(0, 2)
          const overflow = dayEvents.length - 2

          return (
            <div
              key={idx}
              style={{
                minHeight: 80,
                borderRight: idx % 7 !== 6 ? "1px solid #E5E0D2" : "none",
                borderBottom: idx < cells.length - 7 ? "1px solid #E5E0D2" : "none",
                background: day && isToday(day) ? "#F4F0F8" : "#FBF8F2",
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
                    color: isToday(day) ? "#3E1540" : "#5A5466",
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
                            color: "#13101A",
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
                      <span style={{ fontSize: 10, color: "#8A8497", paddingLeft: 4 }}>+{overflow} more</span>
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
      <div style={{ textAlign: "center", padding: "40px 0", color: "#8A8497", fontSize: 14 }}>
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
            <div style={{ fontFamily: "ui-monospace, 'SF Mono', Menlo, monospace", fontSize: 10, letterSpacing: "0.08em", textTransform: "uppercase", color: "#8A8497", marginBottom: 8 }}>
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
                      background: "#FBF8F2",
                      border: "1px solid #E5E0D2",
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
                        <span style={{ fontWeight: 500, fontSize: 14, color: "#13101A" }}>{ev.title}</span>
                        <span style={{ fontSize: 11, fontWeight: 500, color: cfg.text, background: cfg.bg, padding: "1px 7px", borderRadius: 9999 }}>
                          {cfg.label}
                        </span>
                      </div>
                      <div style={{ fontSize: 12, color: "#8A8497", marginTop: 2 }}>{dateStr}</div>
                      {ev.location && <div style={{ fontSize: 12, color: "#8A8497", marginTop: 1 }}>{ev.location}</div>}
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
    <div
      style={{ position: "fixed", inset: 0, zIndex: 120, background: "rgba(19,16,26,0.35)", display: "flex", alignItems: "center", justifyContent: "center", padding: "20px" }}
      onClick={onClose}
    >
      <div
        style={{ background: "#FBF8F2", borderRadius: 16, padding: "24px", maxWidth: 480, width: "100%", maxHeight: 500, overflowY: "auto", boxShadow: "0 8px 40px rgba(19,16,26,0.16)" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 12 }}>
          <span style={{ fontSize: 11, fontWeight: 500, color: cfg.text, background: cfg.bg, padding: "3px 10px", borderRadius: 9999 }}>
            {cfg.label}
          </span>
          <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", padding: 0 }}>
            <X className="w-4 h-4 text-[#8A8497]" />
          </button>
        </div>
        <h2 style={{ fontFamily: "var(--font-instrument-serif)", fontSize: 24, fontWeight: 400, color: "#13101A", margin: "0 0 8px" }}>
          {event.title}
        </h2>
        <p style={{ fontSize: 13, color: "#8A8497", margin: "0 0 6px" }}>{dateStr}</p>
        {event.location && (
          <p style={{ fontSize: 13, color: "#5A5466", margin: "0 0 12px" }}>📍 {event.location}</p>
        )}
        {event.description && (
          <p style={{ fontSize: 14, color: "#5A5466", lineHeight: 1.6, margin: "0 0 16px" }}>{event.description}</p>
        )}
        <button
          onClick={() => onPlan(event)}
          style={{
            display: "flex", alignItems: "center", gap: 6,
            background: "#3E1540", color: "#F6F4EF",
            border: "none", borderRadius: 8, padding: "8px 16px",
            cursor: "pointer", fontSize: 13, fontWeight: 500,
            marginBottom: 8, width: "100%", justifyContent: "center"
          }}
        >
          Plan this event →
        </button>
        {(canEdit || event.created_by === userId) && (
          <button
            onClick={() => onDelete(event.id)}
            style={{ display: "flex", alignItems: "center", gap: 6, background: "none", border: "1px solid #ECE8DE", borderRadius: 8, padding: "6px 12px", cursor: "pointer", fontSize: 13, color: "#C0392B" }}
          >
            <Trash2 className="w-3.5 h-3.5" />
            Delete event
          </button>
        )}
      </div>
    </div>
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
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [deleteConfirm, setDeleteConfirm] = useState(false)
  const [deleting, setDeleting] = useState(false)

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

  const inputStyle: React.CSSProperties = {
    width: "100%", background: "#FBF8F2", border: "1px solid #E5E0D2", borderRadius: 8,
    padding: "8px 12px", fontSize: 14, color: "#13101A", outline: "none", boxSizing: "border-box",
  }

  const labelStyle: React.CSSProperties = {
    fontSize: 11, fontFamily: "ui-monospace, 'SF Mono', Menlo, monospace",
    letterSpacing: "0.06em", textTransform: "uppercase", color: "#8A8497", marginBottom: 4, display: "block",
  }

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 80, background: "#FBF8F2", display: "flex", flexDirection: "column", overflowY: "auto" }}>
      <div style={{ maxWidth: 600, width: "100%", margin: "0 auto", padding: "48px 24px 60px" }}>
        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 28 }}>
          <h2 style={{ fontFamily: "var(--font-instrument-serif)", fontSize: 28, fontWeight: 400, color: "#13101A", margin: 0 }}>
            {isEditing ? "Edit Event" : parentEventId ? "Add Sub-event" : "New Event"}
          </h2>
          <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", padding: 4 }}>
            <X className="w-5 h-5 text-[#8A8497]" />
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
                        border: selected ? `2px solid ${tcfg.dot}` : "2px solid #E8E2D2",
                        background: selected ? tcfg.bg : "#FBF8F2",
                        transition: "border-color 0.15s, background 0.15s",
                      }}
                    >
                      <div style={{ fontSize: 20, marginBottom: 4 }}>{tcfg.icon}</div>
                      <div style={{ fontSize: 13, fontWeight: 600, color: selected ? tcfg.text : "#13101A" }}>{tcfg.label}</div>
                      <div style={{ fontSize: 11, color: "#8A8497", marginTop: 2, lineHeight: 1.4 }}>{tcfg.description}</div>
                    </button>
                  )
                })}
              </div>
              {/* Pre-seed preview */}
              {(cfg.defaultRoles.length > 0 || cfg.defaultPhases.length > 0) && (
                <div style={{ marginTop: 12, padding: "12px 14px", background: "#F5F1E8", borderRadius: 10, fontSize: 12, color: "#5A5466" }}>
                  <span style={{ fontWeight: 600, color: "#3E1540" }}>Pre-seeded: </span>
                  {cfg.defaultRoles.map(r => r.name).join(", ")}
                  {cfg.defaultRoles.length > 0 && cfg.defaultPhases.length > 0 && " · "}
                  {cfg.defaultPhases.reduce((n, p) => n + p.tasks.length, 0)} checklist tasks across {cfg.defaultPhases.length} phases
                </div>
              )}
            </div>
          )}

          {/* Title */}
          <div>
            <label style={labelStyle}>Title *</label>
            <input style={inputStyle} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Event name" />
          </div>

          {/* Description */}
          <div>
            <label style={labelStyle}>Description</label>
            <textarea style={{ ...inputStyle, resize: "vertical", minHeight: 80 }} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Optional details…" />
          </div>

          {/* Location */}
          <div>
            <label style={labelStyle}>Location</label>
            <input style={inputStyle} value={location} onChange={(e) => setLocation(e.target.value)} placeholder="Room, building, or address" />
          </div>

          {/* All day toggle */}
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <input type="checkbox" id="allDay" checked={allDay} onChange={(e) => setAllDay(e.target.checked)} style={{ width: 16, height: 16, accentColor: "#3E1540", cursor: "pointer" }} />
            <label htmlFor="allDay" style={{ fontSize: 14, color: "#5A5466", cursor: "pointer" }}>All day</label>
          </div>

          {/* Dates + times */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <div>
              <label style={labelStyle}>Start date *</label>
              <input type="date" style={inputStyle} value={startDateStr} onChange={(e) => setStartDateStr(e.target.value)} />
            </div>
            <div>
              <label style={labelStyle}>Start time</label>
              <input type="time" style={{ ...inputStyle, opacity: allDay ? 0.4 : 1 }} value={startTimeStr} onChange={(e) => setStartTimeStr(e.target.value)} disabled={allDay} />
            </div>
            <div>
              <label style={labelStyle}>End date *</label>
              <input type="date" style={inputStyle} value={endDateStr} onChange={(e) => setEndDateStr(e.target.value)} />
            </div>
            <div>
              <label style={labelStyle}>End time</label>
              <input type="time" style={{ ...inputStyle, opacity: allDay ? 0.4 : 1 }} value={endTimeStr} onChange={(e) => setEndTimeStr(e.target.value)} disabled={allDay} />
            </div>
          </div>

          {error && <p style={{ fontSize: 13, color: "#C0392B" }}>{error}</p>}

          {/* Actions */}
          {isEditing && onDelete && (
            <div style={{ borderTop: "1px solid #E8E2D2", paddingTop: 18, marginTop: 8 }}>
              {deleteConfirm ? (
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <span style={{ fontSize: 13, color: "#9F3030", flex: 1 }}>This will permanently delete the event and all its planning data.</span>
                  <button onClick={() => setDeleteConfirm(false)} style={{ padding: "7px 14px", borderRadius: 8, border: "1px solid #E5E0D2", background: "transparent", fontSize: 13, cursor: "pointer", color: "#5A5466" }}>Cancel</button>
                  <button onClick={handleDelete} disabled={deleting} style={{ padding: "7px 14px", borderRadius: 8, border: "none", background: "#9F3030", color: "#FBF8F2", fontSize: 13, fontWeight: 500, cursor: deleting ? "not-allowed" : "pointer", opacity: deleting ? 0.6 : 1 }}>
                    {deleting ? "Deleting…" : "Delete forever"}
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => setDeleteConfirm(true)}
                  style={{ display: "flex", alignItems: "center", gap: 6, background: "none", border: "none", cursor: "pointer", fontSize: 13, color: "#C0392B", padding: 0 }}
                >
                  <Trash2 className="w-3.5 h-3.5" /> Delete event
                </button>
              )}
            </div>
          )}

          <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", marginTop: 16 }}>
            <button onClick={onClose} style={{ padding: "8px 20px", borderRadius: 8, border: "1px solid #E5E0D2", background: "#FBF8F2", fontSize: 14, color: "#5A5466", cursor: "pointer" }}>
              Cancel
            </button>
            <button onClick={handleSave} disabled={saving} style={{ padding: "8px 20px", borderRadius: 8, border: "none", background: "#3E1540", color: "#F6F4EF", fontSize: 14, fontWeight: 500, cursor: saving ? "not-allowed" : "pointer", opacity: saving ? 0.7 : 1 }}>
              {saving ? (isEditing ? "Saving…" : "Creating…") : isEditing ? "Save changes" : "Create event"}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

export function MinistryCalendar({
  ministryId,
  teamId,
  userId,
  canEdit,
  onOpenChat,
}: {
  ministryId: string
  teamId: string | null
  userId: string
  canEdit: boolean
  onOpenChat?: (id: string, name: string) => void
}) {
  const supabase = createClient()
  const [view, setView] = useState<"month" | "list">("list")
  const [events, setEvents] = useState<CalendarEvent[]>([])
  const [plannedEventIds, setPlannedEventIds] = useState<Set<string>>(new Set())
  const [currentMonth, setCurrentMonth] = useState(new Date())
  const [selectedEvent, setSelectedEvent] = useState<CalendarEvent | null>(null)
  const [showAdd, setShowAdd] = useState(false)
  const [loading, setLoading] = useState(true)
  const [tableReady, setTableReady] = useState(true)
  const [planningEvent, setPlanningEvent] = useState<CalendarEvent | null>(null)

  useEffect(() => {
    async function fetchEvents() {
      setLoading(true)
      let query = supabase
        .from("calendar_events")
        .select("id, title, description, location, start_date, end_date, all_day, category, event_type, parent_event_id, linked_announcement_id, status, created_by")
        .eq("ministry_id", ministryId)
        .order("start_date", { ascending: true })

      if (teamId) {
        query = query.or(`team_id.eq.${teamId},team_id.is.null`)
      }

      const { data, error } = await query
      if (error && error.message.includes("Could not find the table")) {
        setTableReady(false)
      } else {
        setEvents((data ?? []) as CalendarEvent[])
      }

      // Also fetch which events already have a plan
      const { data: plans } = await supabase
        .from("event_plans")
        .select("calendar_event_id")
        .eq("ministry_id", ministryId)
      if (plans) {
        setPlannedEventIds(new Set(plans.map((p: { calendar_event_id: string }) => p.calendar_event_id)))
      }

      setLoading(false)
    }
    fetchEvents()
  }, [ministryId, teamId])

  async function handleDelete(id: string) {
    setEvents((prev) => prev.filter((ev) => ev.id !== id))
    await supabase.from("calendar_events").delete().eq("id", id)
  }

  if (!tableReady) {
    return (
      <div style={{ borderTop: "1px solid #E5E0D2", paddingTop: 24, marginBottom: 32 }}>
        <p style={{ fontFamily: "var(--font-instrument-serif)", fontSize: 22, fontWeight: 400, color: "#13101A", marginBottom: 8 }}>Ministry Calendar</p>
        <div style={{ background: "#FBF8F2", border: "1px dashed #E5E0D2", borderRadius: 12, padding: "24px 20px", textAlign: "center" }}>
          <p style={{ fontSize: 13, color: "#5A5466", marginBottom: 4 }}>Calendar database table not set up yet.</p>
          <p style={{ fontSize: 12, color: "#8A8497" }}>Run <code style={{ background: "#EFEAE0", padding: "1px 5px", borderRadius: 4 }}>supabase/calendar_migration.sql</code> in the Supabase SQL Editor to enable this feature.</p>
        </div>
      </div>
    )
  }

  return (
    <div style={{ marginBottom: 32 }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", marginBottom: 20 }}>
        <div>
          <p style={{ fontFamily: "ui-monospace,'SF Mono',Menlo,monospace", fontSize: "11px", fontWeight: 600, letterSpacing: "0.1em", textTransform: "uppercase", color: "#8A8497", marginBottom: 6 }}>
            Upcoming
          </p>
          <h2 style={{ fontFamily: "var(--font-instrument-serif)", fontSize: 30, fontWeight: 400, color: "#13101A", margin: 0, letterSpacing: "-0.01em" }}>
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
                background: view === "month" ? "#FBF8F2" : "transparent",
                border: "none", cursor: "pointer", fontSize: 12, color: view === "month" ? "#13101A" : "#8A8497",
                fontWeight: view === "month" ? 500 : 400,
                boxShadow: view === "month" ? "0 1px 3px rgba(19,16,26,0.08)" : "none",
              }}
            >
              <Grid3x3 className="w-3 h-3" /> Month
            </button>
            <button
              onClick={() => setView("list")}
              style={{
                display: "flex", alignItems: "center", gap: 4, padding: "4px 10px", borderRadius: 6,
                background: view === "list" ? "#FBF8F2" : "transparent",
                border: "none", cursor: "pointer", fontSize: 12, color: view === "list" ? "#13101A" : "#8A8497",
                fontWeight: view === "list" ? 500 : 400,
                boxShadow: view === "list" ? "0 1px 3px rgba(19,16,26,0.08)" : "none",
              }}
            >
              <List className="w-3 h-3" /> List
            </button>
          </div>
          {canEdit && (
            <button
              onClick={() => setShowAdd(true)}
              style={{ display: "flex", alignItems: "center", gap: 4, background: "#3E1540", color: "#F6F4EF", border: "none", borderRadius: 8, padding: "5px 10px", fontSize: 12, cursor: "pointer", fontWeight: 500 }}
            >
              <Plus className="w-3 h-3" /> Add event
            </button>
          )}
        </div>
      </div>

      <div style={{ display: "flex", gap: 28, alignItems: "flex-start" }}>
        {/* Calendar — left */}
        <div style={{ flex: 1, minWidth: 0 }}>
          {loading ? (
            <div style={{ textAlign: "center", padding: "32px 0", color: "#8A8497", fontSize: 13 }}>Loading…</div>
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
        <div style={{ width: 232, flexShrink: 0, borderLeft: "1px solid #E5E0D2", paddingLeft: 20 }}>
          <p style={{ fontFamily: "ui-monospace,'SF Mono',Menlo,monospace", fontSize: 10, letterSpacing: "0.06em", textTransform: "uppercase", color: "#8A8497", margin: "0 0 10px" }}>
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
                    <span style={{ fontSize: 13, fontWeight: 500, color: "#13101A", flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{item.title}</span>
                  </div>
                  <span style={{ fontSize: 11, color: "#8A8497", paddingLeft: 14 }}>{item.date}</span>
                  <span style={{ marginLeft: 14, display: "inline-block", fontSize: 10, fontWeight: 500, color: "#92400E", background: "#FEF3C7", borderRadius: 9999, padding: "2px 8px", width: "fit-content" }}>
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
                    <span style={{ fontSize: 13, fontWeight: 500, color: "#13101A", flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{ev.title}</span>
                  </div>
                  <span style={{ fontSize: 11, color: "#8A8497", paddingLeft: 14 }}>{dateStr}</span>
                  <div style={{ paddingLeft: 14, display: "flex", alignItems: "center", gap: 6 }}>
                    {isPlanned ? (
                      <span style={{ fontSize: 10, fontWeight: 500, color: "#14532D", background: "#DCFCE7", borderRadius: 9999, padding: "2px 8px" }}>Planned ✓</span>
                    ) : (
                      <span style={{ fontSize: 10, fontWeight: 500, color: "#92400E", background: "#FEF3C7", borderRadius: 9999, padding: "2px 8px" }}>Needs planning</span>
                    )}
                    <button
                      onClick={() => setPlanningEvent(ev)}
                      style={{ fontSize: 11, color: "#3E1540", background: "none", border: "none", cursor: "pointer", fontWeight: 500, padding: 0, textDecoration: "underline", textDecorationColor: "transparent" }}
                      onMouseEnter={(e) => (e.currentTarget.style.textDecorationColor = "#3E1540")}
                      onMouseLeave={(e) => (e.currentTarget.style.textDecorationColor = "transparent")}
                    >
                      {isPlanned ? "View plan" : "Plan →"}
                    </button>
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
          onSaved={(ev) => {
            setEvents((prev) => [...prev, ev].sort((a, b) => a.start_date.localeCompare(b.start_date)))
            setShowAdd(false)
          }}
        />
      )}

      {planningEvent && (
        <EventPlanWorkspace
          inline
          calendarEvent={planningEvent}
          ministryId={ministryId}
          userId={userId}
          canEdit={canEdit}
          teamId={teamId}
          onClose={() => setPlanningEvent(null)}
          onOpenChat={onOpenChat}
        />
      )}
    </div>
  )
}

// ── EventPlanWorkspace ────────────────────────────────────────────────────────

export function EventPlanWorkspace({
  calendarEvent,
  ministryId,
  userId,
  canEdit,
  canEditBudget = false,
  onClose,
  inline = false,
  hideHero = false,
  teamId,
  onOpenChat,
}: {
  calendarEvent: CalendarEvent
  ministryId: string
  userId: string
  canEdit: boolean
  canEditBudget?: boolean
  onClose: () => void
  inline?: boolean
  hideHero?: boolean
  teamId?: string | null
  onOpenChat?: (id: string, name: string) => void
}) {
  const supabase = createClient()
  const router = useRouter()
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
  const [notes, setNotes] = useState<EventNote[]>([])
  const [members, setMembers] = useState<{ id: string; name: string }[]>([])

  // Planning chat state
  const [planningGroupId, setPlanningGroupId] = useState<string | null>(null)
  const [creatingPlanChat, setCreatingPlanChat] = useState(false)
  const [planChatError, setPlanChatError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [savingStatus, setSavingStatus] = useState(false)
  const [eventStatus, setEventStatus] = useState<'planning' | 'active' | 'complete'>(calendarEvent.status ?? 'planning')
  const [rsvpCount, setRsvpCount] = useState<number | null>(null)
  const [ministryBudget, setMinistryBudget] = useState<{ total: number; byFund: Record<string, number> } | null>(null)

  const [activeSection, setActiveSection] = useState<ActiveSection>(() => {
    const p = typeof window !== "undefined" ? new URLSearchParams(window.location.search).get("evtab") : null
    return (allValidTabs as string[]).includes(p ?? "") ? p as ActiveSection : 'overview'
  })
  function setActiveSectionAndUrl(s: ActiveSection) {
    setActiveSection(s)
    const sp = new URLSearchParams(window.location.search)
    sp.set("evtab", s)
    router.replace(`/home?${sp.toString()}`, { scroll: false })
  }

  // Overview edit state
  const [turnout, setTurnout] = useState("")
  const [budget, setBudget] = useState("")
  const [overviewNotes, setOverviewNotes] = useState("")
  const [savingOverview, setSavingOverview] = useState(false)

  // Task add state
  const [newTaskTitle, setNewTaskTitle] = useState("")
  const [newTaskAssignee, setNewTaskAssignee] = useState("")
  const [newTaskDue, setNewTaskDue] = useState("")
  const [newTaskPhase, setNewTaskPhase] = useState<EventTask["phase"]>("pre_event")
  const [addingTask, setAddingTask] = useState(false)
  const [collapsedPhases, setCollapsedPhases] = useState<Set<string>>(new Set())
  const [confirmDeleteTaskId, setConfirmDeleteTaskId] = useState<string | null>(null)

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

  // Note add state
  const [newNote, setNewNote] = useState("")
  const [addingNote, setAddingNote] = useState(false)

  const startDate = new Date(calendarEvent.start_date)
  const endDate = new Date(calendarEvent.end_date)
  const dateStr = calendarEvent.all_day
    ? startDate.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })
    : startDate.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" }) +
      " · " + startDate.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" }) +
      " – " + endDate.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })

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

      setPlan(planData as EventPlan)
      setPlanningGroupId((planData as EventPlan).planning_group_id ?? null)
      setTurnout(planData.expected_turnout != null ? String(planData.expected_turnout) : "")
      setBudget(planData.budget_allocated != null ? String(planData.budget_allocated) : "")
      setOverviewNotes(planData.overview_notes ?? "")

      const planId = planData.id

      // Fetch tasks with assignee name
      const { data: tasksData } = await supabase
        .from("event_tasks")
        .select("*, profiles!event_tasks_assigned_to_fkey(name)")
        .eq("event_plan_id", planId)
        .order("sort_order", { ascending: true })

      setTasks((tasksData ?? []).map((t: Record<string, unknown>) => ({
        id: t.id as string,
        event_plan_id: t.event_plan_id as string,
        title: t.title as string,
        assigned_to: t.assigned_to as string | null,
        assigned_name: (t.profiles as { name?: string } | null)?.name,
        due_date: t.due_date as string | null,
        completed: t.completed as boolean,
        phase: (t.phase as string ?? "pre_event") as EventTask["phase"],
        sort_order: (t.sort_order as number) ?? 0,
      })))

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

      // Fetch notes with created_by name
      const { data: notesData } = await supabase
        .from("event_notes")
        .select("*, profiles!event_notes_created_by_fkey(name)")
        .eq("event_plan_id", planId)
        .order("created_at", { ascending: false })

      setNotes((notesData ?? []).map((n: Record<string, unknown>) => ({
        id: n.id as string,
        event_plan_id: n.event_plan_id as string,
        content: n.content as string,
        created_by: n.created_by as string,
        created_by_name: (n.profiles as { name?: string } | null)?.name,
        created_at: n.created_at as string,
      })))

      // Fetch assignee list: team roster if teamId given, else all ministry members
      if (teamId) {
        const { data: rosterData } = await supabase
          .from("team_members")
          .select("user_id, profiles(id, name)")
          .eq("team_id", teamId)
        setMembers((rosterData ?? []).map((r: Record<string, unknown>) => {
          const p = r.profiles as { id?: string; name?: string } | null
          return { id: p?.id ?? r.user_id as string, name: p?.name ?? "Unknown" }
        }).filter(m => m.name !== "Unknown"))
      } else {
        const { data: membersData } = await supabase
          .from("profiles").select("id, name").eq("ministry_id", ministryId).order("name")
        setMembers(membersData ?? [])
      }

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

  async function handleStatusChange(newStatus: 'planning' | 'active' | 'complete') {
    setEventStatus(newStatus)
    setSavingStatus(true)
    await supabase.from("calendar_events").update({ status: newStatus }).eq("id", calendarEvent.id)
    setSavingStatus(false)
  }

  async function handleToggleTask(task: EventTask) {
    const newCompleted = !task.completed
    setTasks((prev) => prev.map((t) => t.id === task.id ? { ...t, completed: newCompleted, } : t))
    await supabase
      .from("event_tasks")
      .update({ completed: newCompleted, completed_at: newCompleted ? new Date().toISOString() : null })
      .eq("id", task.id)
  }

  async function handleAddTask(phaseOverride?: EventTask["phase"]) {
    if (!plan || !newTaskTitle.trim()) return
    const phase = phaseOverride ?? newTaskPhase
    const maxSort = tasks.filter(t => t.phase === phase).reduce((m, t) => Math.max(m, t.sort_order), -1)
    setAddingTask(true)
    const { data } = await supabase
      .from("event_tasks")
      .insert({
        event_plan_id: plan.id,
        title: newTaskTitle.trim(),
        assigned_to: newTaskAssignee || null,
        due_date: newTaskDue || null,
        completed: false,
        phase,
        sort_order: maxSort + 1,
        created_by: userId,
      })
      .select("*, profiles!event_tasks_assigned_to_fkey(name)")
      .single()
    if (data) {
      const d = data as Record<string, unknown>
      setTasks((prev) => [...prev, {
        id: d.id as string,
        event_plan_id: d.event_plan_id as string,
        title: d.title as string,
        assigned_to: d.assigned_to as string | null,
        assigned_name: (d.profiles as { name?: string } | null)?.name,
        due_date: d.due_date as string | null,
        completed: d.completed as boolean,
        phase: (d.phase as string ?? phase) as EventTask["phase"],
        sort_order: (d.sort_order as number) ?? 0,
      }])
    }
    setNewTaskTitle("")
    setNewTaskAssignee("")
    setNewTaskDue("")
    setAddingTask(false)
  }

  async function handleDeleteTask(id: string) {
    setTasks((prev) => prev.filter((t) => t.id !== id))
    await supabase.from("event_tasks").delete().eq("id", id)
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
  }

  async function handleDeleteRole(id: string) {
    setRoles((prev) => prev.filter((r) => r.id !== id))
    await supabase.from("event_roles").delete().eq("id", id)
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

  async function handleAddNote() {
    if (!plan || !newNote.trim()) return
    setAddingNote(true)
    const { data } = await supabase
      .from("event_notes")
      .insert({
        event_plan_id: plan.id,
        content: newNote.trim(),
        created_by: userId,
      })
      .select("*, profiles!event_notes_created_by_fkey(name)")
      .single()
    if (data) {
      const d = data as Record<string, unknown>
      setNotes((prev) => [{
        id: d.id as string,
        event_plan_id: d.event_plan_id as string,
        content: d.content as string,
        created_by: d.created_by as string,
        created_by_name: (d.profiles as { name?: string } | null)?.name,
        created_at: d.created_at as string,
      }, ...prev])
    }
    setNewNote("")
    setAddingNote(false)
  }

  const incompleteTasks = tasks.filter((t) => !t.completed)

  const EXTRA_TAB_LABELS: Record<EventExtraTab, string> = {
    sub_events: "Sub-events", new_folks: "New Folks", acts: "Acts",
    teams: "Teams", transport: "Transport", program: "Program",
  }

  const sections: { key: ActiveSection; label: string }[] = [
    { key: 'overview', label: 'Overview' },
    { key: 'checklist', label: 'Checklist' },
    { key: 'roles', label: 'Roles & Leads' },
    { key: 'notes', label: 'Notes' },
    ...extraTabs.map(t => ({ key: t as ActiveSection, label: EXTRA_TAB_LABELS[t] })),
  ]

  // Phase config: use typeCfg phases if available, else defaults
  const phaseConfig: { key: EventTask["phase"]; label: string }[] = typeCfg.defaultPhases.length > 0
    ? typeCfg.defaultPhases.map(p => ({ key: p.key as EventTask["phase"], label: p.label }))
    : [
        { key: "pre_event", label: "Pre-Event" },
        { key: "day_of", label: "Day-of" },
        { key: "post_event", label: "Post-Event" },
        { key: "followup", label: "Follow-up" },
      ]

  const statusColors: Record<string, { bg: string; text: string; border: string }> = {
    planning: { bg: "#F4F1E8", text: "#5A5466", border: "#E2DDCF" },
    active:   { bg: "#EEF4F1", text: "#2D5445", border: "#BFD9CF" },
    complete: { bg: "#EDE5F0", text: "#3E1540", border: "#C9B3CC" },
  }

  const inputStyle: React.CSSProperties = {
    background: "#FBF8F2",
    border: "1px solid #E5E0D2",
    borderRadius: 8,
    padding: "8px 12px",
    fontSize: 13,
    color: "#13101A",
    outline: "none",
    width: "100%",
    boxSizing: "border-box",
  }

  const selectStyle: React.CSSProperties = {
    background: "#FBF8F2",
    border: "1px solid #E5E0D2",
    borderRadius: 8,
    padding: "8px 12px",
    fontSize: 13,
    color: "#13101A",
    outline: "none",
    cursor: "pointer",
  }

  const cardStyle: React.CSSProperties = {
    background: "#FBF8F2",
    border: "1px solid #E5E0D2",
    borderRadius: 12,
    padding: "20px 24px",
    marginBottom: 16,
  }

  const sectionHeadingStyle: React.CSSProperties = {
    fontFamily: "var(--font-instrument-serif)",
    fontSize: 20,
    fontWeight: 400,
    color: "#13101A",
    margin: "0 0 16px",
  }

  const chipStyle: React.CSSProperties = {
    background: "#EFEAE0",
    color: "#5A5466",
    borderRadius: 999,
    padding: "2px 8px",
    fontSize: 12,
    whiteSpace: "nowrap" as const,
  }

  return (
    <div
      style={inline
        ? {}
        : { position: "fixed", top: 0, bottom: 0, left: 0, right: 0, zIndex: 75, background: "#FBF8F2", overflowY: "auto" }
      }
      className={inline ? "" : "md:left-[var(--shell-offset)]"}
    >
      {/* Plum hero header — hidden when the parent already renders a calm header (hideHero) */}
      {!hideHero && <div style={{ padding: inline ? "18px 0 0" : "0 24px", paddingTop: 18 }}>
        <div style={{
          position: "relative",
          borderRadius: 18,
          overflow: "hidden",
          background: "radial-gradient(120% 100% at 0% 0%, #4A1B4D 0%, #2D0F2E 55%, #1B0A1E 100%)",
          color: "#FBF8F2",
          padding: "30px 36px 32px",
        }}>
          {/* Dot texture */}
          <div style={{ position: "absolute", inset: 0, opacity: 0.18, background: "radial-gradient(rgba(251,248,242,0.6) 1px, transparent 1.4px) 0 0 / 14px 14px", pointerEvents: "none" }} />
          <div style={{ position: "relative", display: "flex", alignItems: "center", gap: 24 }}>
            {/* Initial chip */}
            <span style={{ width: 92, height: 92, borderRadius: 18, background: "rgba(251,248,242,0.08)", border: "1px solid rgba(251,248,242,0.18)", display: "grid", placeItems: "center", fontFamily: "var(--font-instrument-serif)", fontSize: 46, color: "#FBF8F2", flexShrink: 0 }}>
              {calendarEvent.title.charAt(0).toUpperCase()}
            </span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                <span style={{ fontSize: 18 }}>{typeCfg.icon}</span>
                <span style={{ fontFamily: "ui-monospace,'SF Mono',Menlo,monospace", fontSize: "11px", letterSpacing: "0.1em", textTransform: "uppercase", color: "rgba(251,248,242,0.65)" }}>
                  {typeCfg.label.toUpperCase()} · {dateStr}
                </span>
              </div>
              <h1 style={{ fontFamily: "var(--font-instrument-serif)", fontSize: "clamp(36px,4vw,56px)", lineHeight: 1, margin: "0 0 0", letterSpacing: -0.6, color: "#FBF8F2", fontWeight: 400 }}>
                {calendarEvent.title}
              </h1>
              {(calendarEvent.description || calendarEvent.location) && (
                <div style={{ fontSize: 15, color: "rgba(251,248,242,0.78)", marginTop: 10 }}>
                  {[calendarEvent.description, calendarEvent.location].filter(Boolean).join(" · ")}
                </div>
              )}
              {/* Status selector */}
              <div style={{ display: "flex", gap: 6, marginTop: 14 }}>
                {(['planning', 'active', 'complete'] as const).map(s => {
                  const sc = statusColors[s]
                  return (
                    <button
                      key={s}
                      onClick={() => handleStatusChange(s)}
                      disabled={savingStatus}
                      style={{
                        padding: "4px 12px", borderRadius: 999, fontSize: 12, fontWeight: 500, cursor: "pointer",
                        background: eventStatus === s ? sc.bg : "rgba(251,248,242,0.08)",
                        color: eventStatus === s ? sc.text : "rgba(251,248,242,0.55)",
                        border: eventStatus === s ? `1px solid ${sc.border}` : "1px solid transparent",
                        transition: "all 0.15s",
                      }}
                    >
                      {s.charAt(0).toUpperCase() + s.slice(1)}
                    </button>
                  )
                })}
              </div>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 8, alignItems: "flex-end", flexShrink: 0 }}>
              <button
                onClick={onClose}
                style={{ background: "none", border: "none", cursor: "pointer", color: "rgba(251,248,242,0.55)", fontSize: 13, fontFamily: "var(--font-inter)", padding: 0 }}
              >
                ← Back to calendar
              </button>
            </div>
          </div>
        </div>
      </div>}

      {/* Underline section tabs */}
      <div style={{ marginTop: hideHero ? 0 : 22, marginBottom: 24 }}>
        <PlanSubTabStrip
          tabs={sections}
          active={activeSection}
          onChange={s => setActiveSectionAndUrl(s as ActiveSection)}
        />
      </div>

      {/* Content */}
      <div className="px-5 md:px-14" style={{ paddingTop: 24, paddingBottom: 80 }}>
        {loading ? (
          <div style={{ textAlign: "center", padding: "48px 0", color: "#8A8497", fontSize: 13 }}>Loading…</div>
        ) : (
          <>
            {/* ── Overview ── */}
            {activeSection === 'overview' && (
              <div style={{ display: "grid", gridTemplateColumns: "1.5fr 1fr", gap: 28, alignItems: "start" }} className="max-md:!block">
                {/* Left: planning details */}
                <section>
                  <p style={{ fontFamily: "ui-monospace,'SF Mono',Menlo,monospace", fontSize: "11px", letterSpacing: "0.1em", textTransform: "uppercase", color: "#8A8497", marginBottom: 0 }}>
                    Event Brief
                  </p>
                  <h2 style={{ fontFamily: "var(--font-instrument-serif)", fontSize: 36, margin: "6px 0 0", letterSpacing: -0.4, color: "#13101A", fontWeight: 400 }}>
                    Planning Details
                  </h2>
                  {calendarEvent.description && (
                    <p style={{ fontSize: 15, color: "#5A5466", lineHeight: 1.7, marginTop: 16, maxWidth: 540 }}>
                      {calendarEvent.description}
                    </p>
                  )}
                  <div style={{ marginTop: 28, display: "grid", gridTemplateColumns: "120px 1fr", rowGap: 14, columnGap: 24, fontSize: 14 }}>
                    <span style={{ color: "#8A8497" }}>When</span>
                    <span style={{ color: "#13101A" }}>{dateStr}</span>
                    {calendarEvent.location && (
                      <>
                        <span style={{ color: "#8A8497" }}>Where</span>
                        <span style={{ color: "#13101A" }}>{calendarEvent.location}</span>
                      </>
                    )}
                  </div>

                  {/* Planning notes */}
                  <div style={{ marginTop: 28 }}>
                    <p style={{ fontFamily: "ui-monospace,'SF Mono',Menlo,monospace", fontSize: "10px", letterSpacing: "0.1em", textTransform: "uppercase", color: "#8A8497", marginBottom: 10 }}>Planning Notes</p>
                    {canEdit ? (
                      <textarea
                        value={overviewNotes}
                        onChange={e => setOverviewNotes(e.target.value)}
                        onBlur={handleSaveOverview}
                        placeholder="Add context, key decisions, or reminders for this event…"
                        rows={4}
                        style={{ width: "100%", background: "#F4F1E8", border: "1px solid #E8E2D2", borderRadius: 10, padding: "12px 14px", fontSize: 14, fontFamily: "var(--font-inter)", color: "#13101A", lineHeight: 1.6, resize: "vertical", outline: "none", boxSizing: "border-box" }}
                      />
                    ) : overviewNotes ? (
                      <p style={{ fontSize: 14, color: "#5A5466", lineHeight: 1.7, whiteSpace: "pre-wrap" }}>{overviewNotes}</p>
                    ) : (
                      <p style={{ fontSize: 14, color: "#A09A8C", fontStyle: "italic" }}>No planning notes yet.</p>
                    )}
                  </div>
                </section>

                {/* Right: stat cards */}
                <aside style={{ display: "flex", flexDirection: "column", gap: 18 }} className="max-md:mt-6">
                  {/* Expected Turnout */}
                  <div style={{ padding: 22, border: "1px solid #E8E2D2", borderRadius: 14, background: "#FBF8F2" }}>
                    <p style={{ fontFamily: "ui-monospace,'SF Mono',Menlo,monospace", fontSize: "10px", letterSpacing: "0.1em", textTransform: "uppercase", color: "#8A8497" }}>Expected Turnout</p>
                    {canEdit ? (
                      <input
                        type="number"
                        value={turnout}
                        onChange={(e) => setTurnout(e.target.value)}
                        onBlur={handleSaveOverview}
                        placeholder="—"
                        style={{ fontFamily: "var(--font-instrument-serif)", fontSize: 40, color: "#13101A", letterSpacing: -0.6, background: "transparent", border: "none", outline: "none", padding: 0, marginTop: 10, width: "100%" }}
                      />
                    ) : (
                      <p style={{ fontFamily: "var(--font-instrument-serif)", fontSize: 40, color: "#13101A", letterSpacing: -0.6, marginTop: 10 }}>{turnout || "—"}</p>
                    )}
                    <p style={{ fontSize: 13, color: "#8A8497", marginTop: 4 }}>guests</p>
                    {rsvpCount !== null && (
                      <p style={{ fontSize: 12, color: "#5A5466", marginTop: 6, paddingTop: 6, borderTop: "1px solid #E8E2D2" }}>
                        <span style={{ fontWeight: 600, color: "#3E1540" }}>{rsvpCount}</span> RSVPed via announcement
                      </p>
                    )}
                  </div>
                  {/* Budget */}
                  <div style={{ padding: 22, border: "1px solid #E8E2D2", borderRadius: 14, background: "#FBF8F2" }}>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                      <p style={{ fontFamily: "ui-monospace,'SF Mono',Menlo,monospace", fontSize: "10px", letterSpacing: "0.1em", textTransform: "uppercase", color: "#8A8497", margin: 0 }}>Budget</p>
                      {!canEditBudget && <span style={{ fontSize: 11, color: "#A09A8C", fontStyle: "italic" }}>Treasurer only</span>}
                    </div>
                    {canEditBudget ? (
                      <input
                        type="number"
                        value={budget}
                        onChange={(e) => setBudget(e.target.value)}
                        onBlur={handleSaveOverview}
                        placeholder="—"
                        style={{ fontFamily: "var(--font-instrument-serif)", fontSize: 40, color: "#13101A", letterSpacing: -0.6, background: "transparent", border: "none", outline: "none", padding: 0, marginTop: 10, width: "100%" }}
                      />
                    ) : (
                      <p style={{ fontFamily: "var(--font-instrument-serif)", fontSize: 40, color: "#13101A", letterSpacing: -0.6, marginTop: 10 }}>{budget ? `$${budget}` : "—"}</p>
                    )}
                    <p style={{ fontSize: 13, color: "#8A8497", marginTop: 4 }}>allocated for this event</p>
                    {typeCfg.budgetCategory && (
                      <div style={{ marginTop: 12, paddingTop: 12, borderTop: "1px solid #E8E2D2" }}>
                        <p style={{ fontFamily: "ui-monospace,'SF Mono',Menlo,monospace", fontSize: "10px", letterSpacing: "0.08em", textTransform: "uppercase", color: "#8A8497", margin: 0 }}>
                          Ministry Allocation · {calendarEvent.title}
                        </p>
                        {ministryBudget ? (
                          <>
                            <p style={{ fontSize: 14, fontWeight: 500, color: "#13101A", marginTop: 6 }}>
                              ${ministryBudget.total.toFixed(2)} total
                            </p>
                            <p style={{ fontSize: 12, color: "#5A5466", marginTop: 2 }}>
                              {Object.entries(ministryBudget.byFund)
                                .map(([fund, amt]) => `${fund.charAt(0).toUpperCase() + fund.slice(1)} $${amt.toFixed(2)}`)
                                .join(" · ")}
                            </p>
                          </>
                        ) : (
                          <p style={{ fontSize: 12, color: "#A09A8C", fontStyle: "italic", marginTop: 6 }}>
                            No ministry budget set
                          </p>
                        )}
                      </div>
                    )}
                  </div>
                  {/* Readiness */}
                  {(() => {
                    const total = tasks.length
                    const done = tasks.filter(t => t.completed).length
                    const pct = total > 0 ? Math.round((done / total) * 100) : 0
                    const onTrack = total === 0 || pct >= 50
                    return (
                      <div style={{ padding: 22, background: "#F1ECDE", borderColor: "#E2DDCF", border: "1px solid #E2DDCF", borderRadius: 14 }}>
                        <p style={{ fontFamily: "ui-monospace,'SF Mono',Menlo,monospace", fontSize: "10px", letterSpacing: "0.1em", textTransform: "uppercase", color: "#8A8497" }}>Readiness</p>
                        <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 12 }}>
                          <span style={{ width: 8, height: 8, borderRadius: 99, background: onTrack ? "#7FA67F" : "#D4855C", flexShrink: 0 }} />
                          <span style={{ fontSize: 14, fontWeight: 500, color: "#13101A" }}>{total === 0 ? "No tasks yet" : onTrack ? "On track" : "Needs attention"}</span>
                        </div>
                        {total > 0 && (
                          <>
                            <div style={{ display: "flex", gap: 6, marginTop: 12 }}>
                              {Array.from({ length: Math.min(total, 4) }).map((_, i) => (
                                <span key={i} style={{ flex: 1, height: 4, borderRadius: 99, background: i < done ? "#3E1540" : "#E2DDCF" }} />
                              ))}
                            </div>
                            <div style={{ display: "flex", justifyContent: "space-between", marginTop: 10, fontSize: 12, color: "#5A5466" }}>
                              <span>{done} of {total} done</span>
                              <span>{pct}%</span>
                            </div>
                          </>
                        )}
                      </div>
                    )
                  })()}
                </aside>
              </div>
            )}

            {/* ── Checklist ── */}
            {activeSection === 'checklist' && (
              <div>
                <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 28 }}>
                  <div>
                    <p style={{ fontFamily: "ui-monospace,'SF Mono',Menlo,monospace", fontSize: "11px", letterSpacing: "0.1em", textTransform: "uppercase", color: "#8A8497" }}>To Prepare</p>
                    <h2 style={{ fontFamily: "var(--font-instrument-serif)", fontSize: 36, margin: "6px 0 0", letterSpacing: -0.4, color: "#13101A", fontWeight: 400 }}>Checklist</h2>
                  </div>
                  <span style={{ fontSize: 13, color: "#8A8497" }}>{incompleteTasks.length} of {tasks.length} remaining</span>
                </div>

                {/* Phase-grouped task list */}
                {phaseConfig.map((phase) => {
                  const phaseTasks = tasks.filter(t => t.phase === phase.key)
                  const phaseIncomplete = phaseTasks.filter(t => !t.completed).length
                  const isCollapsed = collapsedPhases.has(phase.key)
                  return (
                    <div key={phase.key} style={{ marginBottom: 28 }}>
                      {/* Phase header */}
                      <button
                        onClick={() => setCollapsedPhases(prev => {
                          const next = new Set(prev)
                          if (next.has(phase.key)) next.delete(phase.key)
                          else next.add(phase.key)
                          return next
                        })}
                        style={{ display: "flex", alignItems: "center", gap: 10, background: "none", border: "none", cursor: "pointer", padding: "0 0 10px", width: "100%", textAlign: "left" }}
                      >
                        <span style={{ fontFamily: "ui-monospace,'SF Mono',Menlo,monospace", fontSize: "10px", letterSpacing: "0.1em", textTransform: "uppercase", color: "#8A8497", fontWeight: 600 }}>{phase.label}</span>
                        {phaseTasks.length > 0 && (
                          <span style={{ fontSize: 11, color: phaseIncomplete > 0 ? "#5A5466" : "#7FA67F", background: phaseIncomplete > 0 ? "#EFEAE0" : "#EEF4F1", borderRadius: 999, padding: "1px 7px" }}>
                            {phaseIncomplete > 0 ? `${phaseIncomplete} remaining` : "All done"}
                          </span>
                        )}
                        <span style={{ marginLeft: "auto", color: "#A09A8C", fontSize: 12 }}>{isCollapsed ? "▸" : "▾"}</span>
                      </button>
                      <div style={{ borderTop: "1px solid #E8E2D2" }} />

                      {!isCollapsed && (
                        <>
                          {phaseTasks.length === 0 && (
                            <p style={{ fontFamily: "var(--font-instrument-serif)", fontStyle: "italic", fontSize: 14, color: "#A09A8C", padding: "14px 4px 6px" }}>No tasks yet for this phase.</p>
                          )}
                          {phaseTasks.map((task, i) => (
                            <div key={task.id} style={{ display: "flex", alignItems: "center", gap: 12, padding: "13px 4px", borderBottom: i === phaseTasks.length - 1 && !canEdit ? "none" : "1px solid #F0EBE0" }}>
                              <button
                                onClick={() => handleToggleTask(task)}
                                style={{ width: 18, height: 18, borderRadius: 5, border: "1.5px solid " + (task.completed ? "#3E1540" : "#C4C0B0"), background: task.completed ? "#3E1540" : "transparent", display: "grid", placeItems: "center", cursor: "pointer", flexShrink: 0 }}
                              >
                                {task.completed && <Check className="w-2.5 h-2.5 text-white" />}
                              </button>
                              <span style={{ flex: 1, fontSize: 14, color: task.completed ? "#A09A8C" : "#13101A", textDecoration: task.completed ? "line-through" : "none", lineHeight: 1.4 }}>{task.title}</span>
                              {task.assigned_name && (
                                <span style={{ padding: "4px 10px", borderRadius: 999, background: "#F1ECDE", border: "1px solid #E8E2D2", fontSize: 12, color: "#2D0F2E", whiteSpace: "nowrap" }}>{task.assigned_name}</span>
                              )}
                              {task.due_date && (
                                <span style={{ fontSize: 12, color: "#8A8497", whiteSpace: "nowrap" }}>
                                  {new Date(task.due_date + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                                </span>
                              )}
                              {canEdit && (
                                confirmDeleteTaskId === task.id ? (
                                  <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                                    <button
                                      onClick={() => { handleDeleteTask(task.id); setConfirmDeleteTaskId(null) }}
                                      style={{ fontSize: 11, fontWeight: 600, color: "#9F3030", background: "#FEF2F2", border: "1px solid #FECACA", borderRadius: 6, padding: "2px 8px", cursor: "pointer", whiteSpace: "nowrap" }}
                                    >
                                      Delete
                                    </button>
                                    <button
                                      onClick={() => setConfirmDeleteTaskId(null)}
                                      style={{ fontSize: 11, color: "#8A8497", background: "none", border: "none", cursor: "pointer", padding: "2px 4px" }}
                                    >
                                      Cancel
                                    </button>
                                  </div>
                                ) : (
                                  <button onClick={() => setConfirmDeleteTaskId(task.id)} style={{ background: "none", border: "none", cursor: "pointer", padding: 0, color: "#C4C4C4" }}>
                                    <X className="w-3.5 h-3.5" />
                                  </button>
                                )
                              )}
                            </div>
                          ))}

                          {/* Inline add row per phase */}
                          {canEdit && (
                            <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 4px", borderBottom: "1px dashed #D8D2C0" }}>
                              <span style={{ color: "#B0A898", fontSize: 13 }}>+</span>
                              <input
                                value={phase.key === newTaskPhase ? newTaskTitle : ""}
                                onChange={(e) => { setNewTaskPhase(phase.key); setNewTaskTitle(e.target.value) }}
                                onFocus={() => setNewTaskPhase(phase.key)}
                                placeholder={`Add to ${phase.label}…`}
                                style={{ flex: 1, background: "none", border: "none", outline: "none", fontSize: 14, fontFamily: "var(--font-inter)", color: "#13101A" }}
                                onKeyDown={(e) => { if (e.key === "Enter" && newTaskTitle.trim() && newTaskPhase === phase.key) handleAddTask(phase.key) }}
                              />
                              {phase.key === newTaskPhase && newTaskTitle.trim() && (
                                <>
                                  <select
                                    value={newTaskAssignee}
                                    onChange={(e) => setNewTaskAssignee(e.target.value)}
                                    style={{ padding: "4px 10px", borderRadius: 999, border: "1px solid #E2DDCF", background: "#FBF8F2", color: "#5A5466", fontSize: 11, cursor: "pointer", fontFamily: "var(--font-inter)" }}
                                  >
                                    <option value="">Unassigned</option>
                                    {members.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
                                  </select>
                                  <input
                                    type="date"
                                    value={newTaskDue}
                                    onChange={(e) => setNewTaskDue(e.target.value)}
                                    style={{ padding: "4px 10px", borderRadius: 999, border: "1px solid #E2DDCF", background: "#FBF8F2", color: "#5A5466", fontSize: 11, fontFamily: "var(--font-inter)", cursor: "pointer" }}
                                  />
                                  <button
                                    onClick={() => handleAddTask(phase.key)}
                                    disabled={addingTask}
                                    style={{ padding: "5px 12px", borderRadius: 999, border: "none", background: "#2D0F2E", color: "#FBF8F2", fontSize: 12, cursor: addingTask ? "not-allowed" : "pointer", fontWeight: 500, opacity: addingTask ? 0.5 : 1 }}
                                  >
                                    Add
                                  </button>
                                </>
                              )}
                            </div>
                          )}
                        </>
                      )}
                    </div>
                  )
                })}
              </div>
            )}

            {/* ── Roles & Leads ── */}
            {activeSection === 'roles' && (
              <div>
                <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between" }}>
                  <div>
                    <p style={{ fontFamily: "ui-monospace,'SF Mono',Menlo,monospace", fontSize: "11px", letterSpacing: "0.1em", textTransform: "uppercase", color: "#8A8497" }}>{"Who's Responsible"}</p>
                    <h2 style={{ fontFamily: "var(--font-instrument-serif)", fontSize: 36, margin: "6px 0 0", letterSpacing: -0.4, color: "#13101A", fontWeight: 400 }}>Roles &amp; Leads</h2>
                  </div>
                  {canEdit && (
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      {planningGroupId ? (
                        <button
                          onClick={() => onOpenChat?.(planningGroupId, `${calendarEvent.title} Planning`)}
                          style={{ display: "flex", alignItems: "center", gap: 6, padding: "8px 14px", borderRadius: 10, border: "none", background: "#2D0F2E", color: "#FBF8F2", fontSize: 13, cursor: "pointer", fontWeight: 500 }}
                        >
                          <MessageCircle style={{ width: 13, height: 13 }} /> Open planning chat
                        </button>
                      ) : (
                        <button
                          onClick={handleCreatePlanningChat}
                          disabled={creatingPlanChat || roles.filter(r => r.assigned_to).length === 0}
                          title={roles.filter(r => r.assigned_to).length === 0 ? "Assign roles first" : "Create a group chat with all role holders"}
                          style={{ display: "flex", alignItems: "center", gap: 6, padding: "8px 14px", borderRadius: 10, border: "1px solid #3E1540", color: "#3E1540", background: "transparent", fontSize: 13, cursor: creatingPlanChat ? "not-allowed" : "pointer", fontWeight: 500, opacity: roles.filter(r => r.assigned_to).length === 0 ? 0.4 : 1 }}
                        >
                          <MessageCircle style={{ width: 13, height: 13 }} />
                          {creatingPlanChat ? "Creating…" : "Create planning chat"}
                        </button>
                      )}
                      <button
                        onClick={() => { setNewRoleName(""); setNewRoleNotes(""); setNewRoleAssignee(""); setAddingRole(false) }}
                        style={{ padding: "8px 14px", borderRadius: 10, border: "1px solid #3E1540", color: "#3E1540", background: "transparent", fontSize: 13, cursor: "pointer", fontWeight: 500, display: "flex", alignItems: "center", gap: 6 }}
                      >
                        + Add role
                      </button>
                    </div>
                  )}
                </div>
                {planChatError && <p style={{ fontSize: 12, color: "#C44B4B", marginTop: 8 }}>{planChatError}</p>}

                {/* Roles rows */}
                <div style={{ marginTop: 28 }}>
                  {roles.length === 0 && !canEdit && (
                    <p style={{ fontFamily: "var(--font-instrument-serif)", fontStyle: "italic", fontSize: 15, color: "#A09A8C", padding: "8px 0" }}>No roles defined yet.</p>
                  )}
                  {roles.map((role, i) => (
                    <div key={role.id} style={{ borderBottom: i === roles.length - 1 ? "none" : "1px solid #E8E2D2" }}>
                      {editingRoleId === role.id ? (
                        <div style={{ padding: "18px 4px", display: "flex", flexDirection: "column", gap: 8 }}>
                          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                            <input value={editRoleName} onChange={(e) => setEditRoleName(e.target.value)} placeholder="Role name" style={inputStyle} />
                            <select value={editRoleAssignee} onChange={(e) => setEditRoleAssignee(e.target.value)} style={{ ...selectStyle, width: "100%" }}>
                              <option value="">Unassigned</option>
                              {members.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
                            </select>
                          </div>
                          <input value={editRoleNotes} onChange={(e) => setEditRoleNotes(e.target.value)} placeholder="Notes (optional)" style={inputStyle} />
                          <div style={{ display: "flex", gap: 8 }}>
                            <button onClick={() => handleSaveRoleEdit(role.id)} style={{ padding: "6px 14px", borderRadius: 8, border: "none", background: "#2D0F2E", color: "#F6F4EF", fontSize: 12, fontWeight: 500, cursor: "pointer" }}>Save</button>
                            <button onClick={() => setEditingRoleId(null)} style={{ padding: "6px 14px", borderRadius: 8, border: "1px solid #E5E0D2", background: "none", fontSize: 12, color: "#5A5466", cursor: "pointer" }}>Cancel</button>
                          </div>
                        </div>
                      ) : (
                        <div style={{ display: "grid", gridTemplateColumns: "200px 1fr 220px", alignItems: "center", gap: 18, padding: "18px 4px" }}>
                          <div style={{ fontFamily: "var(--font-instrument-serif)", fontSize: 20, color: "#13101A", letterSpacing: -0.2 }}>{role.role_name}</div>
                          <div style={{ fontSize: 13, color: "#5A5466", lineHeight: 1.5 }}>
                            {role.notes || <span style={{ color: "#A09A8C", fontStyle: "italic" }}>Add a note for whoever takes this on</span>}
                          </div>
                          <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
                            {role.assigned_name ? (
                              <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "6px 12px 6px 6px", borderRadius: 999, background: "#F1ECDE", border: "1px solid #E2DDCF" }}>
                                <span style={{ width: 24, height: 24, borderRadius: 999, background: "#3E1540", color: "#FBF8F2", fontSize: 11, display: "grid", placeItems: "center", fontWeight: 600 }}>
                                  {role.assigned_name.split(" ").map((s: string) => s[0]).join("")}
                                </span>
                                <span style={{ fontSize: 13 }}>{role.assigned_name}</span>
                              </div>
                            ) : (
                              <button
                                onClick={() => canEdit ? (setEditingRoleId(role.id), setEditRoleName(role.role_name), setEditRoleAssignee(""), setEditRoleNotes(role.notes ?? "")) : undefined}
                                style={{ padding: "8px 14px", borderRadius: 999, border: "1px dashed #C4C0B0", background: "transparent", color: "#8A8497", fontSize: 13, fontFamily: "var(--font-inter)", cursor: canEdit ? "pointer" : "default" }}
                              >+ Assign someone</button>
                            )}
                            {canEdit && role.assigned_name && (
                              <button onClick={() => { setEditingRoleId(role.id); setEditRoleName(role.role_name); setEditRoleAssignee(role.assigned_to ?? ""); setEditRoleNotes(role.notes ?? "") }} style={{ background: "none", border: "none", cursor: "pointer", padding: "4px", color: "#8A8497" }}>
                                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" /><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" /></svg>
                              </button>
                            )}
                            {canEdit && (
                              <button onClick={() => handleDeleteRole(role.id)} style={{ background: "none", border: "none", cursor: "pointer", padding: "4px", color: "#C4C4C4" }}>
                                <X className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  ))}

                  {/* Inline add role row */}
                  {canEdit && (
                    <div style={{ border: "1px dashed #C4C0B0", borderRadius: 12, padding: "14px 16px", marginTop: 16, display: "flex", gap: 12, alignItems: "center", background: "#F8F4EA" }}>
                      <input
                        value={newRoleName}
                        onChange={(e) => setNewRoleName(e.target.value)}
                        placeholder="Role name…"
                        style={{ flex: "0 0 160px", background: "none", border: "none", outline: "none", fontSize: 15, color: "#13101A", fontFamily: "var(--font-inter)", fontWeight: 500 }}
                      />
                      <input
                        value={newRoleNotes}
                        onChange={(e) => setNewRoleNotes(e.target.value)}
                        placeholder="Add a note…"
                        style={{ flex: 1, background: "none", border: "none", outline: "none", fontSize: 13, color: "#5A5466", fontFamily: "var(--font-inter)" }}
                      />
                      <select
                        value={newRoleAssignee}
                        onChange={(e) => setNewRoleAssignee(e.target.value)}
                        style={{ padding: "6px 12px", borderRadius: 999, border: "1px solid #E2DDCF", background: "#FBF8F2", color: "#5A5466", fontSize: 12, cursor: "pointer", fontFamily: "var(--font-inter)" }}
                      >
                        <option value="">Unassigned</option>
                        {members.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
                      </select>
                      <button
                        onClick={handleAddRole}
                        disabled={addingRole || !newRoleName.trim()}
                        style={{ padding: "8px 16px", borderRadius: 999, border: "none", background: "#2D0F2E", color: "#FBF8F2", fontSize: 13, fontWeight: 500, cursor: addingRole || !newRoleName.trim() ? "not-allowed" : "pointer", opacity: addingRole || !newRoleName.trim() ? 0.5 : 1 }}
                      >
                        Add
                      </button>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* ── Transition Notes ── */}
            {activeSection === 'notes' && (
              <div style={{ display: "grid", gridTemplateColumns: "1.4fr 1fr", gap: 36, alignItems: "start" }} className="max-md:!block">
                {/* Left: institutional memory notes */}
                <section>
                  <p style={{ fontFamily: "ui-monospace,'SF Mono',Menlo,monospace", fontSize: "11px", letterSpacing: "0.1em", textTransform: "uppercase", color: "#8A8497" }}>
                    Institutional Memory — Never Deleted
                  </p>
                  <h2 style={{ fontFamily: "var(--font-instrument-serif)", fontSize: 36, margin: "6px 0 0", letterSpacing: -0.4, color: "#13101A", fontWeight: 400 }}>Transition Notes</h2>
                  <p style={{ fontSize: 14, color: "#5A5466", marginTop: 12, maxWidth: 480, lineHeight: 1.6 }}>
                    Wisdom from past leaders. Add what you learned so the next class doesn&apos;t have to find it the hard way.
                  </p>

                  <div style={{ marginTop: 28, display: "flex", flexDirection: "column", gap: 18 }}>
                    {notes.length === 0 && (
                      <p style={{ fontFamily: "var(--font-instrument-serif)", fontStyle: "italic", fontSize: 15, color: "#A09A8C" }}>No notes yet. Be the first to leave wisdom for future leaders.</p>
                    )}
                    {notes.map((note) => (
                      <article key={note.id} style={{ position: "relative", paddingLeft: 22, borderLeft: "2px solid #3E1540" }}>
                        <p style={{ fontFamily: "var(--font-instrument-serif)", fontStyle: "italic", fontSize: 19, lineHeight: 1.45, color: "#13101A" }}>&ldquo;{note.content}&rdquo;</p>
                        <p style={{ marginTop: 10, fontSize: 13, color: "#8A8497" }}>
                          <span style={{ color: "#2D0F2E", fontWeight: 500 }}>{note.created_by_name ?? "Someone"}</span>
                          {" · "}{new Date(note.created_at).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}
                        </p>
                      </article>
                    ))}
                  </div>
                </section>

                {/* Right: leave a note */}
                <aside className="max-md:mt-6">
                  <div style={{ padding: 22, background: "#F1ECDE", border: "1px solid #E2DDCF", borderRadius: 14 }}>
                    <p style={{ fontFamily: "ui-monospace,'SF Mono',Menlo,monospace", fontSize: "10px", letterSpacing: "0.1em", textTransform: "uppercase", color: "#8A8497" }}>Leave a Note</p>
                    <textarea
                      value={newNote}
                      onChange={(e) => setNewNote(e.target.value)}
                      placeholder="What should the next leader know before this event?"
                      rows={5}
                      style={{ marginTop: 12, width: "100%", minHeight: 140, padding: 14, border: "1px solid #E2DDCF", borderRadius: 10, background: "#FBF8F2", fontFamily: "var(--font-instrument-serif)", fontStyle: "italic", fontSize: 15, color: "#13101A", outline: "none", resize: "vertical", boxSizing: "border-box" }}
                    />
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 14 }}>
                      <span style={{ fontSize: 12, color: "#8A8497" }}>Signed as {members.find(m => m.id === userId)?.name ?? "you"}</span>
                      <button
                        onClick={handleAddNote}
                        disabled={addingNote || !newNote.trim()}
                        style={{ padding: "10px 18px", borderRadius: 10, border: "none", background: "#2D0F2E", color: "#FBF8F2", fontSize: 13, fontWeight: 500, cursor: addingNote || !newNote.trim() ? "not-allowed" : "pointer", opacity: addingNote || !newNote.trim() ? 0.5 : 1 }}
                      >
                        {addingNote ? "Adding…" : "Add to record"}
                      </button>
                    </div>
                  </div>
                </aside>
              </div>
            )}

            {/* ── Sub-events (Welcome Week) ── */}
            {activeSection === 'sub_events' && plan && (
              <SubEventsTab
                parentEvent={calendarEvent}
                ministryId={ministryId}
                userId={userId}
                canEdit={canEdit}
              />
            )}

            {/* ── New Folks (Welcome Week) ── */}
            {activeSection === 'new_folks' && plan && (
              <NewFolksTab
                planId={plan.id}
                ministryId={ministryId}
                canEdit={canEdit}
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

function SubEventsTab({
  parentEvent,
  ministryId,
  userId,
  canEdit,
}: {
  parentEvent: CalendarEvent
  ministryId: string
  userId: string
  canEdit: boolean
}) {
  const supabase = createClient()
  const [subEvents, setSubEvents] = useState<CalendarEvent[]>([])
  const [loading, setLoading] = useState(true)
  const [showAdd, setShowAdd] = useState(false)
  const [planningChild, setPlanningChild] = useState<CalendarEvent | null>(null)

  useEffect(() => {
    async function load() {
      const { data } = await supabase
        .from("calendar_events")
        .select("id, title, description, location, start_date, end_date, all_day, category, event_type, parent_event_id, linked_announcement_id, status, created_by")
        .eq("parent_event_id", parentEvent.id)
        .order("start_date", { ascending: true })
      setSubEvents((data ?? []) as CalendarEvent[])
      setLoading(false)
    }
    load()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [parentEvent.id])

  if (planningChild) {
    return (
      <div>
        <button onClick={() => setPlanningChild(null)} style={{ background: "none", border: "none", cursor: "pointer", color: "#5A5466", fontSize: 13, padding: "0 0 16px", display: "flex", alignItems: "center", gap: 6 }}>
          ← Back to {parentEvent.title}
        </button>
        <EventPlanWorkspace
          inline
          hideHero
          calendarEvent={planningChild}
          ministryId={ministryId}
          userId={userId}
          canEdit={canEdit}
          onClose={() => setPlanningChild(null)}
        />
      </div>
    )
  }

  return (
    <div>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 28 }}>
        <div>
          <p style={{ fontFamily: "ui-monospace,'SF Mono',Menlo,monospace", fontSize: "11px", letterSpacing: "0.1em", textTransform: "uppercase", color: "#8A8497" }}>Welcome Week</p>
          <h2 style={{ fontFamily: "var(--font-instrument-serif)", fontSize: 36, margin: "6px 0 0", letterSpacing: -0.4, color: "#13101A", fontWeight: 400 }}>Sub-events</h2>
        </div>
        {canEdit && (
          <button onClick={() => setShowAdd(true)} style={{ padding: "8px 16px", borderRadius: 10, border: "1px solid #3E1540", color: "#3E1540", background: "transparent", fontSize: 13, cursor: "pointer", fontWeight: 500 }}>
            + Add sub-event
          </button>
        )}
      </div>

      {loading && <p style={{ color: "#8A8497", fontSize: 13 }}>Loading…</p>}
      {!loading && subEvents.length === 0 && (
        <p style={{ fontFamily: "var(--font-instrument-serif)", fontStyle: "italic", fontSize: 15, color: "#A09A8C" }}>No sub-events yet. Add the individual events that make up Welcome Week.</p>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {subEvents.map(ev => {
          const evCfg = getEventConfig(ev)
          const d = new Date(ev.start_date).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })
          return (
            <button
              key={ev.id}
              onClick={() => setPlanningChild(ev)}
              style={{ display: "flex", alignItems: "center", gap: 16, padding: "16px 20px", border: "1px solid #E8E2D2", borderRadius: 12, background: "#FBF8F2", cursor: "pointer", textAlign: "left", width: "100%" }}
            >
              <span style={{ fontSize: 22 }}>{evCfg.icon ?? "📅"}</span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{ fontSize: 15, fontWeight: 500, color: "#13101A", margin: 0 }}>{ev.title}</p>
                <p style={{ fontSize: 12, color: "#8A8497", margin: "3px 0 0" }}>{d}{ev.location ? ` · ${ev.location}` : ""}</p>
              </div>
              <span style={{ fontSize: 12, padding: "3px 10px", borderRadius: 999, background: ev.status === "complete" ? "#EDE5F0" : ev.status === "active" ? "#EEF4F1" : "#F4F1E8", color: ev.status === "complete" ? "#3E1540" : ev.status === "active" ? "#2D5445" : "#5A5466" }}>
                {ev.status.charAt(0).toUpperCase() + ev.status.slice(1)}
              </span>
              <span style={{ color: "#A09A8C", fontSize: 14 }}>→</span>
            </button>
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

// ── NewFolksTab ───────────────────────────────────────────────────────────────

function NewFolksTab({
  planId,
  ministryId,
  canEdit,
}: {
  planId: string
  ministryId: string
  canEdit: boolean
}) {
  const supabase = createClient()
  const [folks, setFolks] = useState<EventNewFolk[]>([])
  const [dgls, setDgls] = useState<{ id: string; name: string }[]>([])
  const [loading, setLoading] = useState(true)
  const [newName, setNewName] = useState("")
  const [newContact, setNewContact] = useState("")
  const [newNotes, setNewNotes] = useState("")
  const [adding, setAdding] = useState(false)

  useEffect(() => {
    async function load() {
      const [{ data: folkData }, { data: dglData }] = await Promise.all([
        supabase.from("event_new_folks").select("*, profiles!event_new_folks_assigned_dgl_id_fkey(name)").eq("event_plan_id", planId).order("created_at", { ascending: true }),
        supabase.from("profiles").select("id, name").eq("ministry_id", ministryId).order("name"),
      ])
      setFolks((folkData ?? []).map((f: Record<string, unknown>) => ({
        id: f.id as string, event_plan_id: f.event_plan_id as string,
        ministry_id: f.ministry_id as string, name: f.name as string,
        contact: f.contact as string | null, notes: f.notes as string | null,
        assigned_dgl_id: f.assigned_dgl_id as string | null,
        assigned_dgl_name: (f.profiles as { name?: string } | null)?.name,
        created_at: f.created_at as string,
      })))
      setDgls((dglData ?? []) as { id: string; name: string }[])
      setLoading(false)
    }
    load()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [planId])

  async function handleAdd() {
    if (!newName.trim()) return
    setAdding(true)
    const { data } = await supabase.from("event_new_folks").insert({
      event_plan_id: planId, ministry_id: ministryId,
      name: newName.trim(), contact: newContact.trim() || null, notes: newNotes.trim() || null,
    }).select("*, profiles!event_new_folks_assigned_dgl_id_fkey(name)").single()
    if (data) {
      const d = data as Record<string, unknown>
      setFolks(prev => [...prev, {
        id: d.id as string, event_plan_id: planId, ministry_id: ministryId,
        name: d.name as string, contact: d.contact as string | null,
        notes: d.notes as string | null, assigned_dgl_id: null, created_at: d.created_at as string,
      }])
    }
    setNewName(""); setNewContact(""); setNewNotes("")
    setAdding(false)
  }

  async function handleAssignDGL(folkId: string, dglId: string) {
    const dgl = dgls.find(d => d.id === dglId)
    setFolks(prev => prev.map(f => f.id === folkId ? { ...f, assigned_dgl_id: dglId || null, assigned_dgl_name: dgl?.name } : f))
    await supabase.from("event_new_folks").update({ assigned_dgl_id: dglId || null }).eq("id", folkId)
  }

  async function handleDelete(id: string) {
    setFolks(prev => prev.filter(f => f.id !== id))
    await supabase.from("event_new_folks").delete().eq("id", id)
  }

  return (
    <div>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 28 }}>
        <div>
          <p style={{ fontFamily: "ui-monospace,'SF Mono',Menlo,monospace", fontSize: "11px", letterSpacing: "0.1em", textTransform: "uppercase", color: "#8A8497" }}>Follow Up</p>
          <h2 style={{ fontFamily: "var(--font-instrument-serif)", fontSize: 36, margin: "6px 0 0", letterSpacing: -0.4, color: "#13101A", fontWeight: 400 }}>New Folks</h2>
        </div>
        <span style={{ fontSize: 13, color: "#8A8497" }}>{folks.length} people tracked</span>
      </div>

      {loading && <p style={{ color: "#8A8497", fontSize: 13 }}>Loading…</p>}

      {/* Table header */}
      {folks.length > 0 && (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 130px 1fr 160px 28px", gap: 12, padding: "0 4px 8px", borderBottom: "1px solid #E8E2D2" }}>
          {["Name", "Contact", "Notes", "Assigned DGL", ""].map(h => (
            <span key={h} style={{ fontFamily: "ui-monospace,'SF Mono',Menlo,monospace", fontSize: "10px", letterSpacing: "0.1em", textTransform: "uppercase", color: "#A09A8C" }}>{h}</span>
          ))}
        </div>
      )}

      <div style={{ display: "flex", flexDirection: "column" }}>
        {!loading && folks.length === 0 && (
          <p style={{ fontFamily: "var(--font-instrument-serif)", fontStyle: "italic", fontSize: 15, color: "#A09A8C", padding: "16px 0" }}>No new folks tracked yet. Add people you met during Welcome Week.</p>
        )}
        {folks.map(folk => (
          <div key={folk.id} style={{ display: "grid", gridTemplateColumns: "1fr 130px 1fr 160px 28px", gap: 12, padding: "12px 4px", borderBottom: "1px solid #F0EBE0", alignItems: "center" }}>
            <span style={{ fontSize: 14, color: "#13101A", fontWeight: 500 }}>{folk.name}</span>
            <span style={{ fontSize: 13, color: "#5A5466" }}>{folk.contact ?? <span style={{ color: "#A09A8C", fontStyle: "italic" }}>—</span>}</span>
            <span style={{ fontSize: 13, color: "#5A5466" }}>{folk.notes ?? <span style={{ color: "#A09A8C", fontStyle: "italic" }}>—</span>}</span>
            <select
              value={folk.assigned_dgl_id ?? ""}
              onChange={(e) => canEdit && handleAssignDGL(folk.id, e.target.value)}
              disabled={!canEdit}
              style={{ padding: "4px 8px", borderRadius: 8, border: "1px solid #E2DDCF", background: "#FBF8F2", color: folk.assigned_dgl_id ? "#2D0F2E" : "#A09A8C", fontSize: 12, cursor: canEdit ? "pointer" : "default" }}
            >
              <option value="">Unassigned</option>
              {dgls.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
            </select>
            {canEdit ? (
              <button onClick={() => handleDelete(folk.id)} style={{ background: "none", border: "none", cursor: "pointer", color: "#C4C4C4", padding: 0 }}><X className="w-3.5 h-3.5" /></button>
            ) : <span />}
          </div>
        ))}
      </div>

      {/* Add row */}
      {canEdit && (
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 16, padding: "12px 16px", border: "1px dashed #C4C0B0", borderRadius: 12, background: "#F8F4EA" }}>
          <input value={newName} onChange={e => setNewName(e.target.value)} placeholder="Name…" style={{ flex: "0 0 140px", background: "none", border: "none", outline: "none", fontSize: 14, fontFamily: "var(--font-inter)", color: "#13101A" }} />
          <input value={newContact} onChange={e => setNewContact(e.target.value)} placeholder="Contact (optional)" style={{ flex: "0 0 140px", background: "none", border: "none", outline: "none", fontSize: 13, fontFamily: "var(--font-inter)", color: "#5A5466" }} />
          <input value={newNotes} onChange={e => setNewNotes(e.target.value)} placeholder="Notes (optional)" style={{ flex: 1, background: "none", border: "none", outline: "none", fontSize: 13, fontFamily: "var(--font-inter)", color: "#5A5466" }} />
          <button onClick={handleAdd} disabled={adding || !newName.trim()} style={{ padding: "7px 14px", borderRadius: 999, border: "none", background: "#2D0F2E", color: "#FBF8F2", fontSize: 12, fontWeight: 500, cursor: adding || !newName.trim() ? "not-allowed" : "pointer", opacity: adding || !newName.trim() ? 0.5 : 1 }}>Add</button>
        </div>
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
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 28 }}>
        <div>
          <p style={{ fontFamily: "ui-monospace,'SF Mono',Menlo,monospace", fontSize: "11px", letterSpacing: "0.1em", textTransform: "uppercase", color: "#8A8497" }}>Performance Order</p>
          <h2 style={{ fontFamily: "var(--font-instrument-serif)", fontSize: 36, margin: "6px 0 0", letterSpacing: -0.4, color: "#13101A", fontWeight: 400 }}>Acts Lineup</h2>
        </div>
        {canEdit && (
          <button onClick={addAct} style={{ padding: "8px 16px", borderRadius: 10, border: "1px solid #3E1540", color: "#3E1540", background: "transparent", fontSize: 13, cursor: "pointer", fontWeight: 500 }}>+ Add act</button>
        )}
      </div>

      {acts.length === 0 && (
        <p style={{ fontFamily: "var(--font-instrument-serif)", fontStyle: "italic", fontSize: 15, color: "#A09A8C" }}>No acts yet. Add performers to build your lineup.</p>
      )}

      {acts.length > 0 && (
        <div style={{ display: "grid", gridTemplateColumns: "24px 1fr 110px 80px 110px 28px", gap: 10, padding: "0 4px 8px", borderBottom: "1px solid #E8E2D2" }}>
          {["#", "Performer", "Type", "Duration", "Sound Check", ""].map((h, i) => (
            <span key={i} style={{ fontFamily: "ui-monospace,'SF Mono',Menlo,monospace", fontSize: "10px", letterSpacing: "0.1em", textTransform: "uppercase", color: "#A09A8C" }}>{h}</span>
          ))}
        </div>
      )}

      <div style={{ display: "flex", flexDirection: "column" }}>
        {acts.map((act, idx) => (
          <div key={act.id} style={{ display: "grid", gridTemplateColumns: "24px 1fr 110px 80px 110px 28px", gap: 10, padding: "12px 4px", borderBottom: "1px solid #F0EBE0", alignItems: "center" }}>
            <span style={{ fontSize: 13, color: "#A09A8C", textAlign: "center" }}>{idx + 1}</span>
            {canEdit ? (
              <input value={act.performer} onChange={e => updateAct(act.id, "performer", e.target.value)} placeholder="Performer name…" style={{ background: "none", border: "none", outline: "none", fontSize: 14, fontFamily: "var(--font-inter)", color: "#13101A", width: "100%" }} />
            ) : (
              <span style={{ fontSize: 14, color: "#13101A" }}>{act.performer || <span style={{ color: "#A09A8C", fontStyle: "italic" }}>—</span>}</span>
            )}
            {canEdit ? (
              <select value={act.type} onChange={e => updateAct(act.id, "type", e.target.value)} style={{ padding: "4px 8px", borderRadius: 8, border: "1px solid #E2DDCF", background: "#FBF8F2", color: "#5A5466", fontSize: 12, cursor: "pointer" }}>
                {["Music", "Spoken Word", "Comedy", "Dance", "Other"].map(t => <option key={t}>{t}</option>)}
              </select>
            ) : <span style={{ fontSize: 12, color: "#5A5466" }}>{act.type}</span>}
            {canEdit ? (
              <input value={act.duration} onChange={e => updateAct(act.id, "duration", e.target.value)} placeholder="8 min" style={{ background: "none", border: "1px solid #E2DDCF", borderRadius: 8, outline: "none", fontSize: 13, fontFamily: "var(--font-inter)", color: "#5A5466", padding: "4px 8px", width: "100%", boxSizing: "border-box" }} />
            ) : <span style={{ fontSize: 12, color: "#5A5466" }}>{act.duration || "—"}</span>}
            {canEdit ? (
              <input value={act.sound_check} onChange={e => updateAct(act.id, "sound_check", e.target.value)} placeholder="5:30 PM" style={{ background: "none", border: "1px solid #E2DDCF", borderRadius: 8, outline: "none", fontSize: 13, fontFamily: "var(--font-inter)", color: "#5A5466", padding: "4px 8px", width: "100%", boxSizing: "border-box" }} />
            ) : <span style={{ fontSize: 12, color: "#5A5466" }}>{act.sound_check || "—"}</span>}
            {canEdit ? (
              <button onClick={() => deleteAct(act.id)} style={{ background: "none", border: "none", cursor: "pointer", color: "#C4C4C4", padding: 0 }}><X className="w-3.5 h-3.5" /></button>
            ) : <span />}
          </div>
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
    <div style={{ flex: 1, padding: 22, border: "1px solid #E8E2D2", borderRadius: 14, background: "#FBF8F2" }}>
      {canEdit ? (
        <input value={team.name} onChange={e => updateTeamName(teamKey, e.target.value)} style={{ fontFamily: "var(--font-instrument-serif)", fontSize: 22, color: "#13101A", letterSpacing: -0.3, background: "transparent", border: "none", outline: "none", width: "100%", padding: 0, marginBottom: 14 }} />
      ) : (
        <p style={{ fontFamily: "var(--font-instrument-serif)", fontSize: 22, color: "#13101A", letterSpacing: -0.3, marginBottom: 14 }}>{team.name}</p>
      )}
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {team.members.map(uid => {
          const m = members.find(m => m.id === uid)
          return (
            <div key={uid} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "6px 10px", background: "#F1ECDE", borderRadius: 8 }}>
              <span style={{ fontSize: 13, color: "#2D0F2E" }}>{m?.name ?? uid}</span>
              {canEdit && <button onClick={() => removeMember(teamKey, uid)} style={{ background: "none", border: "none", cursor: "pointer", color: "#C4C4C4", padding: 0 }}><X className="w-3 h-3" /></button>}
            </div>
          )
        })}
        {canEdit && (
          <select onChange={e => { addMember(teamKey, e.target.value); e.target.value = "" }} style={{ padding: "6px 10px", borderRadius: 8, border: "1px dashed #C4C0B0", background: "#F8F4EA", color: "#8A8497", fontSize: 12, cursor: "pointer", marginTop: 4 }}>
            <option value="">+ Add member…</option>
            {members.filter(m => !teamsData.teamA.members.includes(m.id) && !teamsData.teamB.members.includes(m.id)).map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
          </select>
        )}
      </div>
    </div>
  )

  return (
    <div>
      <div style={{ marginBottom: 28 }}>
        <p style={{ fontFamily: "ui-monospace,'SF Mono',Menlo,monospace", fontSize: "11px", letterSpacing: "0.1em", textTransform: "uppercase", color: "#8A8497" }}>Turkey Bowl</p>
        <h2 style={{ fontFamily: "var(--font-instrument-serif)", fontSize: 36, margin: "6px 0 0", letterSpacing: -0.4, color: "#13101A", fontWeight: 400 }}>Teams</h2>
      </div>

      <div style={{ display: "flex", gap: 20, marginBottom: 24 }} className="max-md:!flex-col">
        {renderTeam("teamA", teamsData.teamA)}
        {renderTeam("teamB", teamsData.teamB)}
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <span style={{ fontSize: 14, color: "#5A5466", whiteSpace: "nowrap" }}>Commissioner:</span>
        {canEdit ? (
          <select value={teamsData.commissioner} onChange={e => save({ ...teamsData, commissioner: e.target.value })} style={{ padding: "6px 12px", borderRadius: 8, border: "1px solid #E2DDCF", background: "#FBF8F2", color: "#2D0F2E", fontSize: 13, cursor: "pointer" }}>
            <option value="">Unassigned</option>
            {members.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
          </select>
        ) : (
          <span style={{ fontSize: 14, color: "#2D0F2E" }}>{members.find(m => m.id === teamsData.commissioner)?.name ?? "—"}</span>
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
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 28 }}>
        <div>
          <p style={{ fontFamily: "ui-monospace,'SF Mono',Menlo,monospace", fontSize: "11px", letterSpacing: "0.1em", textTransform: "uppercase", color: "#8A8497" }}>Retreat Logistics</p>
          <h2 style={{ fontFamily: "var(--font-instrument-serif)", fontSize: 36, margin: "6px 0 0", letterSpacing: -0.4, color: "#13101A", fontWeight: 400 }}>Transport</h2>
        </div>
        {canEdit && <button onClick={addCar} style={{ padding: "8px 16px", borderRadius: 10, border: "1px solid #3E1540", color: "#3E1540", background: "transparent", fontSize: 13, cursor: "pointer", fontWeight: 500 }}>+ Add car</button>}
      </div>

      <div style={{ display: "flex", gap: 20, marginBottom: 24 }}>
        <div style={{ padding: "10px 18px", background: "#F1ECDE", borderRadius: 10 }}>
          <span style={{ fontSize: 22, fontWeight: 600, color: "#13101A", fontFamily: "var(--font-instrument-serif)" }}>{totalRiders}</span>
          <span style={{ fontSize: 13, color: "#8A8497", marginLeft: 6 }}>confirmed / {totalSeats} seats</span>
        </div>
      </div>

      {cars.length === 0 && (
        <p style={{ fontFamily: "var(--font-instrument-serif)", fontStyle: "italic", fontSize: 15, color: "#A09A8C" }}>No cars added yet. Add drivers to organize carpooling.</p>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        {cars.map(car => {
          const driver = members.find(m => m.id === car.driver_id)
          const availableRiders = members.filter(m => !allRiderIds.includes(m.id) && m.id !== car.driver_id)
          return (
            <div key={car.id} style={{ padding: "18px 20px", border: "1px solid #E8E2D2", borderRadius: 14, background: "#FBF8F2" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 14 }}>
                {canEdit ? (
                  <select value={car.driver_id} onChange={e => updateCar(car.id, { driver_id: e.target.value })} style={{ padding: "6px 10px", borderRadius: 8, border: "1px solid #E2DDCF", background: "#FBF8F2", color: "#2D0F2E", fontSize: 13, cursor: "pointer", fontWeight: 500 }}>
                    <option value="">Driver…</option>
                    {members.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
                  </select>
                ) : (
                  <span style={{ fontSize: 14, fontWeight: 600, color: "#2D0F2E" }}>{driver?.name ?? "No driver"}</span>
                )}
                {canEdit ? (
                  <input value={car.vehicle} onChange={e => updateCar(car.id, { vehicle: e.target.value })} placeholder="Vehicle (e.g. Honda CR-V)" style={{ flex: 1, background: "none", border: "1px solid #E2DDCF", borderRadius: 8, outline: "none", fontSize: 13, fontFamily: "var(--font-inter)", color: "#5A5466", padding: "6px 10px" }} />
                ) : (
                  <span style={{ fontSize: 13, color: "#5A5466" }}>{car.vehicle || "—"}</span>
                )}
                {canEdit && (
                  <input type="number" value={car.seats} onChange={e => updateCar(car.id, { seats: parseInt(e.target.value) || 4 })} min={1} max={15} style={{ width: 60, background: "none", border: "1px solid #E2DDCF", borderRadius: 8, outline: "none", fontSize: 13, padding: "6px 8px", textAlign: "center" }} />
                )}
                <span style={{ fontSize: 12, color: "#8A8497" }}>{car.rider_ids.length}/{car.seats} seats</span>
                {canEdit && <button onClick={() => save(cars.filter(c => c.id !== car.id))} style={{ marginLeft: "auto", background: "none", border: "none", cursor: "pointer", color: "#C4C4C4" }}><X className="w-3.5 h-3.5" /></button>}
              </div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                {car.rider_ids.map(rid => {
                  const m = members.find(m => m.id === rid)
                  return (
                    <span key={rid} style={{ display: "flex", alignItems: "center", gap: 6, padding: "4px 10px", background: "#F1ECDE", borderRadius: 999, fontSize: 12, color: "#2D0F2E" }}>
                      {m?.name ?? rid}
                      {canEdit && <button onClick={() => removeRider(car.id, rid)} style={{ background: "none", border: "none", cursor: "pointer", color: "#A09A8C", padding: 0, lineHeight: 1 }}>×</button>}
                    </span>
                  )
                })}
                {canEdit && car.rider_ids.length < car.seats && (
                  <select onChange={e => { addRider(car.id, e.target.value); e.target.value = "" }} style={{ padding: "4px 10px", borderRadius: 999, border: "1px dashed #C4C0B0", background: "#F8F4EA", color: "#8A8497", fontSize: 12, cursor: "pointer" }}>
                    <option value="">+ Add rider…</option>
                    {availableRiders.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
                  </select>
                )}
              </div>
            </div>
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
      <div style={{ marginBottom: 28 }}>
        <p style={{ fontFamily: "ui-monospace,'SF Mono',Menlo,monospace", fontSize: "11px", letterSpacing: "0.1em", textTransform: "uppercase", color: "#8A8497" }}>Retreat Schedule</p>
        <h2 style={{ fontFamily: "var(--font-instrument-serif)", fontSize: 36, margin: "6px 0 0", letterSpacing: -0.4, color: "#13101A", fontWeight: 400 }}>Program</h2>
      </div>

      {days.map((day, dayIdx) => {
        const daySessions = sessions.filter(s => s.day_index === dayIdx).sort((a, b) => a.time.localeCompare(b.time))
        const dayLabel = day.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })
        return (
          <div key={dayIdx} style={{ marginBottom: 36 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
              <p style={{ fontFamily: "ui-monospace,'SF Mono',Menlo,monospace", fontSize: "11px", letterSpacing: "0.1em", textTransform: "uppercase", color: "#5A5466", fontWeight: 600 }}>
                Day {dayIdx + 1} — {dayLabel}
              </p>
              {canEdit && (
                <button onClick={() => addSession(dayIdx)} style={{ padding: "4px 10px", borderRadius: 8, border: "1px solid #3E1540", color: "#3E1540", background: "transparent", fontSize: 12, cursor: "pointer" }}>+ Add session</button>
              )}
            </div>
            <div style={{ borderTop: "1px solid #E8E2D2" }} />

            {daySessions.length === 0 && (
              <p style={{ fontFamily: "var(--font-instrument-serif)", fontStyle: "italic", fontSize: 14, color: "#A09A8C", padding: "12px 4px" }}>No sessions yet.</p>
            )}

            {daySessions.map(session => (
              <div key={session.id} style={{ display: "grid", gridTemplateColumns: "80px 1fr 140px 28px", gap: 12, padding: "12px 4px", borderBottom: "1px solid #F0EBE0", alignItems: "center" }}>
                {canEdit ? (
                  <input value={session.time} onChange={e => updateSession(session.id, { time: e.target.value })} placeholder="7:00 PM" style={{ background: "none", border: "1px solid #E2DDCF", borderRadius: 8, outline: "none", fontSize: 13, fontFamily: "var(--font-inter)", color: "#5A5466", padding: "4px 8px", width: "100%", boxSizing: "border-box" }} />
                ) : (
                  <span style={{ fontSize: 13, color: "#8A8497", fontWeight: 500 }}>{session.time || "—"}</span>
                )}
                {canEdit ? (
                  <input value={session.title} onChange={e => updateSession(session.id, { title: e.target.value })} placeholder="Session title…" style={{ background: "none", border: "none", outline: "none", fontSize: 14, fontFamily: "var(--font-inter)", color: "#13101A", width: "100%" }} />
                ) : (
                  <span style={{ fontSize: 14, color: "#13101A" }}>{session.title || <span style={{ color: "#A09A8C", fontStyle: "italic" }}>—</span>}</span>
                )}
                {canEdit ? (
                  <select value={session.leader_id} onChange={e => updateSession(session.id, { leader_id: e.target.value })} style={{ padding: "4px 8px", borderRadius: 8, border: "1px solid #E2DDCF", background: "#FBF8F2", color: "#5A5466", fontSize: 12, cursor: "pointer" }}>
                    <option value="">No leader</option>
                    {members.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
                  </select>
                ) : (
                  <span style={{ fontSize: 12, color: "#5A5466" }}>{members.find(m => m.id === session.leader_id)?.name ?? "—"}</span>
                )}
                {canEdit ? (
                  <button onClick={() => deleteSession(session.id)} style={{ background: "none", border: "none", cursor: "pointer", color: "#C4C4C4", padding: 0 }}><X className="w-3.5 h-3.5" /></button>
                ) : <span />}
              </div>
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

  const mono: React.CSSProperties = {
    fontFamily: "ui-monospace,'SF Mono',Menlo,monospace",
    fontSize: 11, letterSpacing: "0.1em", textTransform: "uppercase", color: "#8A8497",
  }

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
          <Loader2 style={{ width: 24, height: 24, color: "#8A8497" }} className="animate-spin" />
        </div>
      ) : sessions.length === 0 ? (
        <button
          onClick={canEdit ? () => setShowWizard(true) : undefined}
          disabled={!canEdit}
          style={{
            width: "100%", padding: "48px 24px", border: "1px dashed #C4C0B0",
            borderRadius: 14, background: "transparent",
            cursor: canEdit ? "pointer" : "default",
            display: "flex", flexDirection: "column", alignItems: "center", gap: 12,
          }}
        >
          <div style={{ width: 44, height: 44, borderRadius: 12, border: "1px dashed #C4C0B0", display: "flex", alignItems: "center", justifyContent: "center", color: "#8A8497" }}>
            <Plus style={{ width: 20, height: 20 }} />
          </div>
          <div style={{ textAlign: "center" }}>
            <p style={{ fontSize: 15, color: "#5A5466", fontWeight: 500, margin: 0 }}>Generate your first group set</p>
            <p style={{ fontSize: 13, color: "#8A8497", margin: "4px 0 0" }}>Split your ministry into balanced small groups.</p>
          </div>
        </button>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {sessions.map(session => (
            <div
              key={session.id}
              style={{ background: "#FBF8F2", border: "1px solid " + (confirmDeleteId === session.id ? "#9F3030" : "#E8E2D2"), borderRadius: 14, padding: "18px 22px", transition: "border-color 0.15s" }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ fontSize: 15, fontWeight: 600, color: "#13101A", margin: 0 }}>{session.name}</p>
                  <p style={{ fontSize: 12, color: "#8A8497", margin: "4px 0 0" }}>
                    {session.num_groups} groups · {session.num_people} people · {new Date(session.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                    {session.config.smallGroupMode === true && (
                      <span style={{ marginLeft: 6, padding: "1px 7px", borderRadius: 999, background: "#F0EDE8", fontSize: 10, fontWeight: 600, color: "#5A5466", letterSpacing: "0.04em", textTransform: "uppercase" }}>SG Mode</span>
                    )}
                  </p>
                </div>
                <div style={{ display: "flex", gap: 8, flexShrink: 0 }}>
                  <button
                    onClick={() => setViewSession(session)}
                    style={{ padding: "6px 14px", border: "1px solid #E2DDCF", borderRadius: 8, background: "transparent", color: "#5A5466", fontSize: 13, fontWeight: 500, cursor: "pointer", fontFamily: "inherit" }}
                  >
                    View
                  </button>
                  {canEdit && confirmDeleteId !== session.id && (
                    <button
                      onClick={() => setConfirmDeleteId(session.id)}
                      disabled={deletingId === session.id}
                      style={{ padding: "6px 14px", border: "1px solid #E2DDCF", borderRadius: 8, background: "transparent", color: "#9F3030", fontSize: 13, fontWeight: 500, cursor: "pointer", opacity: deletingId === session.id ? 0.5 : 1, fontFamily: "inherit" }}
                    >
                      {deletingId === session.id ? "Deleting…" : "Delete"}
                    </button>
                  )}
                </div>
              </div>

              {/* Inline confirmation row */}
              {confirmDeleteId === session.id && (
                <div style={{ marginTop: 14, paddingTop: 14, borderTop: "1px solid #F0EDE8", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ fontSize: 13, fontWeight: 600, color: "#9F3030", margin: 0 }}>Delete this grouping?</p>
                    {session.config.smallGroupMode === true && (
                      <p style={{ fontSize: 12, color: "#8A8497", margin: "3px 0 0" }}>This will also clear all small group assignments. DGLs will see the empty state until groups are re-confirmed.</p>
                    )}
                  </div>
                  <div style={{ display: "flex", gap: 8, flexShrink: 0 }}>
                    <button
                      onClick={() => setConfirmDeleteId(null)}
                      style={{ padding: "6px 14px", border: "1px solid #E2DDCF", borderRadius: 8, background: "transparent", color: "#5A5466", fontSize: 13, fontWeight: 500, cursor: "pointer", fontFamily: "inherit" }}
                    >
                      Cancel
                    </button>
                    <button
                      onClick={() => handleDelete(session)}
                      style={{ padding: "6px 14px", border: "none", borderRadius: 8, background: "#9F3030", color: "#fff", fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}
                    >
                      Delete
                    </button>
                  </div>
                </div>
              )}
            </div>
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

  const mono: React.CSSProperties = {
    fontFamily: "ui-monospace,'SF Mono',Menlo,monospace",
    fontSize: 11, letterSpacing: "0.1em", textTransform: "uppercase", color: "#8A8497",
  }

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
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 28 }}>
        <button
          onClick={onBack}
          style={{ width: 34, height: 34, borderRadius: 8, border: "1px solid #E2DDCF", background: "transparent", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", color: "#5A5466", flexShrink: 0 }}
        >
          <ArrowLeft style={{ width: 14, height: 14 }} />
        </button>
        <div style={{ flex: 1, minWidth: 0 }}>
          <p style={mono}>Saved grouping</p>
          <h2 style={{ fontFamily: "var(--font-instrument-serif)", fontSize: 28, margin: "2px 0 0", letterSpacing: "-0.01em", color: "#13101A" }}>{session.name}</h2>
        </div>
        <button
          onClick={exportCSV}
          style={{ padding: "8px 16px", border: "1px solid #E2DDCF", borderRadius: 8, background: "transparent", color: "#5A5466", fontSize: 13, fontWeight: 500, cursor: "pointer", display: "flex", alignItems: "center", gap: 6, fontFamily: "inherit" }}
        >
          <Download style={{ width: 13, height: 13 }} />
          Export CSV
        </button>
      </div>
      <p style={{ fontSize: 13, color: "#8A8497", marginBottom: 24 }}>
        {groups.length} groups · {totalPeople} people · Created {new Date(session.created_at).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}
      </p>

      {loading ? (
        <div style={{ padding: "40px 0", display: "flex", justifyContent: "center" }}>
          <Loader2 style={{ width: 22, height: 22, color: "#8A8497" }} className="animate-spin" />
        </div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))", gap: 14 }}>
          {groups.map(g => (
            <div key={g.id} style={{ background: "#FBF8F2", border: "1px solid #E8E2D2", borderRadius: 14, padding: "18px 20px" }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
                <p style={{ fontSize: 14, fontWeight: 600, color: "#13101A", margin: 0 }}>{g.name}</p>
                <span style={{ fontSize: 11, color: "#8A8497" }}>{g.members.length}</span>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {g.members.map(m => (
                  <div key={m.id} style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <div style={{ width: 28, height: 28, borderRadius: 7, background: "#3E1540", flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
                      <span style={{ fontSize: 10, fontWeight: 600, color: "#FBF8F2" }}>
                        {m.name.split(/\s+/).map((w: string) => w[0]).join("").slice(0, 2).toUpperCase()}
                      </span>
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <p style={{ fontSize: 13, fontWeight: 500, color: "#13101A", margin: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{m.name}</p>
                      <p style={{ fontSize: 11, color: "#8A8497", margin: 0 }}>
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

  const mono: React.CSSProperties = {
    fontFamily: "ui-monospace,'SF Mono',Menlo,monospace",
    fontSize: 11, letterSpacing: "0.1em", textTransform: "uppercase", color: "#8A8497",
  }

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
        const { count } = await supabase
          .from("form_responses")
          .select("user_id", { count: "exact", head: true })
          .eq("form_id", sourceId)
        setPoolCount(count ?? 0)
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
        })
        if (result.length === 0) { setGenError("No groups generated."); return }
        setSgGroups(result)
        setGroups([])
        if (!sessionName) setSessionName(`Small Groups — ${semester}`)
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

  return (
    <AnimateIn
      className="fixed inset-0 z-[85] bg-[#FBF8F2] flex flex-col"
      style={{ left: 0 }}
    >
      {/* Header */}
      <div style={{ padding: "20px 32px 0", borderBottom: "1px solid #E8E2D2", flexShrink: 0 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <button
              onClick={step === 1 ? onClose : () => setStep(s => (s - 1) as 1 | 2 | 3)}
              style={{ width: 32, height: 32, borderRadius: 8, border: "1px solid #E2DDCF", background: "transparent", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", color: "#5A5466" }}
            >
              <ArrowLeft style={{ width: 14, height: 14 }} />
            </button>
            <div>
              <p style={mono}>Step {step} of {STEPS.length}</p>
              <p style={{ fontFamily: "var(--font-instrument-serif)", fontSize: 22, margin: "2px 0 0", color: "#13101A", letterSpacing: "-0.01em" }}>
                {STEPS[stepIdx]}
              </p>
            </div>
          </div>
          <button onClick={onClose} style={{ width: 32, height: 32, borderRadius: 8, border: "1px solid #E2DDCF", background: "transparent", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", color: "#5A5466" }}>
            <X style={{ width: 14, height: 14 }} />
          </button>
        </div>
        {/* Stepper */}
        <div style={{ display: "flex", gap: 8, paddingBottom: 0 }}>
          {STEPS.map((s, i) => (
            <div key={s} style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <div style={{
                width: 22, height: 22, borderRadius: 999,
                background: i < stepIdx ? "#3E1540" : i === stepIdx ? "#13101A" : "transparent",
                border: i > stepIdx ? "1px solid #E2DDCF" : "none",
                display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: 10, color: i <= stepIdx ? "#FBF8F2" : "#8A8497", fontWeight: 600,
              }}>
                {i < stepIdx ? <Check style={{ width: 10, height: 10 }} /> : i + 1}
              </div>
              <span style={{ fontSize: 12, color: i === stepIdx ? "#13101A" : "#8A8497", fontWeight: i === stepIdx ? 500 : 400 }}>{s}</span>
              {i < STEPS.length - 1 && <div style={{ width: 20, height: 1, background: "#E8E2D2", margin: "0 4px" }} />}
            </div>
          ))}
        </div>
      </div>

      {/* Content */}
      <div style={{ flex: 1, overflowY: "auto", padding: "28px 32px 40px" }}>

        {/* ── Step 1: Pick pool ── */}
        {step === 1 && (
          <div style={{ maxWidth: 560 }}>
            <p style={{ fontSize: 14, color: "#5A5466", marginBottom: 24 }}>
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
                    border: sourceType === opt.value ? "1px solid #3E1540" : "1px solid #E2DDCF",
                    borderRadius: 12, background: sourceType === opt.value ? "#F6F2E8" : "#FBF8F2",
                    cursor: "pointer", textAlign: "left", fontFamily: "inherit",
                    boxShadow: sourceType === opt.value ? "inset 0 0 0 1px #3E1540" : "none",
                  }}
                >
                  <div style={{
                    width: 18, height: 18, borderRadius: 999, flexShrink: 0, marginTop: 2,
                    border: "2px solid " + (sourceType === opt.value ? "#3E1540" : "#C4C0B0"),
                    display: "flex", alignItems: "center", justifyContent: "center",
                  }}>
                    {sourceType === opt.value && <div style={{ width: 8, height: 8, borderRadius: 999, background: "#3E1540" }} />}
                  </div>
                  <div>
                    <p style={{ fontSize: 14, fontWeight: 600, color: "#13101A", margin: 0 }}>{opt.label}</p>
                    <p style={{ fontSize: 12, color: "#5A5466", margin: "3px 0 0" }}>{opt.desc}</p>
                  </div>
                </button>
              ))}
            </div>

            {/* Dropdown for announcement/form */}
            {sourceType === "announcement" && (
              <div style={{ marginTop: 16 }}>
                <label style={{ ...mono, display: "block", marginBottom: 6 }}>Select event</label>
                {announcements.length === 0 ? (
                  <p style={{ fontSize: 13, color: "#8A8497", fontStyle: "italic" }}>No announcements with RSVPs found.</p>
                ) : (
                  <select
                    value={sourceId}
                    onChange={e => setSourceId(e.target.value)}
                    style={{ width: "100%", padding: "10px 14px", border: "1px solid #E2DDCF", borderRadius: 10, background: "#FBF8F2", fontSize: 14, color: "#13101A", fontFamily: "inherit" }}
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
                  <p style={{ fontSize: 13, color: "#8A8497", fontStyle: "italic" }}>No forms with responses found.</p>
                ) : (
                  <select
                    value={sourceId}
                    onChange={e => setSourceId(e.target.value)}
                    style={{ width: "100%", padding: "10px 14px", border: "1px solid #E2DDCF", borderRadius: 10, background: "#FBF8F2", fontSize: 14, color: "#13101A", fontFamily: "inherit" }}
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
            <div style={{ marginTop: 20, padding: "14px 18px", background: "#F6F2E8", border: "1px solid #E8E2D2", borderRadius: 10 }}>
              {countLoading ? (
                <p style={{ fontSize: 13, color: "#8A8497", margin: 0 }}>Counting…</p>
              ) : poolCount !== null ? (
                <p style={{ fontSize: 14, fontWeight: 600, color: "#13101A", margin: 0 }}>
                  {poolCount === 0 ? "No people in this pool" : `${poolCount} ${poolCount === 1 ? "person" : "people"} in this pool`}
                </p>
              ) : (
                <p style={{ fontSize: 13, color: "#8A8497", margin: 0 }}>Select a source above to see the pool size.</p>
              )}
            </div>
          </div>
        )}

        {/* ── Step 2: Configure ── */}
        {step === 2 && (
          <div style={{ maxWidth: 520 }}>
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
                    onChange={e => setNumGroups(Math.max(1, parseInt(e.target.value) || 1))}
                    style={{ width: 80, padding: "10px 14px", border: "1px solid #E2DDCF", borderRadius: 10, background: "#FBF8F2", fontSize: 15, color: "#13101A", fontFamily: "inherit" }}
                  />
                  {estGroupSize !== null && (
                    <p style={{ fontSize: 13, color: "#8A8497", margin: 0 }}>
                      ~{estGroupSize} {estGroupSize === 1 ? "person" : "people"} per group
                    </p>
                  )}
                </div>
              </div>
            )}

            {/* SG mode DGL count display */}
            {smallGroupMode && sglRosterConfirmed && sgDGLs.length > 0 && (
              <div style={{ marginBottom: 28, padding: "14px 18px", background: "#F6F2E8", border: "1px solid #E8E2D2", borderRadius: 10 }}>
                <p style={{ fontSize: 14, fontWeight: 600, color: "#13101A", margin: "0 0 3px" }}>
                  {sgDGLs.length} group{sgDGLs.length !== 1 ? "s" : ""} — one per DGL on the {semester} roster
                </p>
                <p style={{ fontSize: 12, color: "#8A8497", margin: 0 }}>Gender matching is applied automatically.</p>
              </div>
            )}

            {/* Divider */}
            <div style={{ height: 1, background: "#E8E2D2", margin: "0 0 24px" }} />

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
              <div style={{ marginTop: 18, padding: "16px 18px", background: "#F6F2E8", border: "1px solid #E8E2D2", borderRadius: 12 }}>
                <p style={{ ...mono, marginBottom: 8 }}>Last year&apos;s groupings (CSV)</p>
                <p style={{ fontSize: 12, color: "#5A5466", margin: "0 0 10px" }}>
                  Format: <code style={{ fontFamily: "ui-monospace,monospace", background: "#ECE8DE", padding: "1px 5px", borderRadius: 4 }}>Name, Group</code> — one row per person. First row is header.
                </p>
                <textarea
                  value={prevCSVText}
                  onChange={e => setPrevCSVText(e.target.value)}
                  placeholder={"Name,Group\nJane Smith,Group 1\nJohn Doe,Group 2"}
                  rows={6}
                  style={{ width: "100%", padding: "10px 12px", border: "1px solid #E2DDCF", borderRadius: 8, background: "#FBF8F2", fontSize: 12, fontFamily: "ui-monospace,monospace", resize: "vertical", color: "#13101A", boxSizing: "border-box" }}
                />
              </div>
            )}

            {/* Naming — hidden in SG mode */}
            {!(smallGroupMode && sglRosterConfirmed && sgDGLs.length > 0) && (
              <>
                {/* Divider */}
                <div style={{ height: 1, background: "#E8E2D2", margin: "24px 0" }} />
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
                        border: "1px solid " + (naming === opt.value ? "#3E1540" : "#E2DDCF"),
                        background: naming === opt.value ? "#3E1540" : "transparent",
                        color: naming === opt.value ? "#FBF8F2" : "#5A5466",
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
              <div style={{ marginTop: 18, padding: "12px 16px", background: "rgba(159,48,48,0.06)", border: "1px solid rgba(159,48,48,0.2)", borderRadius: 8 }}>
                <p style={{ fontSize: 13, color: "#9F3030", margin: 0 }}>{genError}</p>
              </div>
            )}
          </div>
        )}

        {/* ── Step 3: Preview & adjust ── */}
        {step === 3 && (
          <div>
            {/* Session name */}
            <div style={{ marginBottom: 24 }}>
              <label style={{ ...mono, display: "block", marginBottom: 6 }}>Session name</label>
              <input
                type="text"
                value={sessionName}
                onChange={e => setSessionName(e.target.value)}
                placeholder="e.g. Fall Retreat Groups 2026"
                style={{ width: "100%", maxWidth: 440, padding: "10px 14px", border: "1px solid #E2DDCF", borderRadius: 10, background: "#FBF8F2", fontSize: 14, color: "#13101A", fontFamily: "inherit", boxSizing: "border-box" }}
              />
            </div>

            {/* Success message after SG confirm */}
            {sgConfirmResult && (
              <div style={{ marginBottom: 20, padding: "12px 16px", background: "rgba(62,21,64,0.06)", border: "1px solid rgba(62,21,64,0.2)", borderRadius: 10 }}>
                <p style={{ fontSize: 13, color: "#3E1540", fontWeight: 500, margin: 0 }}>{sgConfirmResult}</p>
                <button onClick={onSaved} style={{ fontSize: 12, color: "#3E1540", background: "none", border: "none", padding: 0, marginTop: 8, cursor: "pointer", fontWeight: 600 }}>Done →</button>
              </div>
            )}

            {/* Cross-gender drag error */}
            {dragError && (
              <div style={{ marginBottom: 16, padding: "10px 14px", background: "rgba(159,48,48,0.06)", border: "1px solid rgba(159,48,48,0.2)", borderRadius: 8 }}>
                <p style={{ fontSize: 13, color: "#9F3030", margin: 0 }}>{dragError}</p>
              </div>
            )}

            {/* SG mode groups */}
            {sgGroups.length > 0 ? (
              <>
                <p style={{ fontSize: 13, color: "#8A8497", marginBottom: 20 }}>
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
                        background: "#FBF8F2",
                        border: "1px solid " + (dragOver === gIdx ? "#3E1540" : g.leader_gender === "male" ? "#B8D4F0" : g.leader_gender === "female" ? "#F0B8D4" : "#E8E2D2"),
                        borderRadius: 14, padding: "16px 18px", minHeight: 80,
                        transition: "border-color 0.1s",
                      }}
                    >
                      {/* Leader header */}
                      <div style={{ marginBottom: 10 }}>
                        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                          <p style={{ fontSize: 13, fontWeight: 700, color: "#13101A", margin: 0 }}>{g.name}</p>
                          <span style={{
                            fontSize: 10, padding: "2px 8px", borderRadius: 999, fontWeight: 500,
                            background: g.leader_gender === "male" ? "#E8F0FC" : g.leader_gender === "female" ? "#FCE8F0" : "#F0EDE8",
                            color: g.leader_gender === "male" ? "#2D5FA3" : g.leader_gender === "female" ? "#A32D5F" : "#8A8497",
                          }}>
                            {g.leader_gender === "male" ? "Brothers" : g.leader_gender === "female" ? "Sisters" : "Group"}
                          </span>
                        </div>
                        <p style={{ fontSize: 11, color: "#8A8497", margin: "2px 0 0" }}>DGL: {g.leader_name} · {g.members.length} members</p>
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
                              border: "1px solid #E8E2D2", borderRadius: 8,
                              background: dragSource?.groupIdx === gIdx && dragSource?.memberIdx === mIdx ? "#F0EDE8" : "#FBF8F2",
                              cursor: "grab",
                            }}
                          >
                            <GripVertical style={{ width: 12, height: 12, color: "#C4C0B0", flexShrink: 0 }} />
                            <div style={{ width: 24, height: 24, borderRadius: 6, background: "#3E1540", flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
                              <span style={{ fontSize: 9, fontWeight: 700, color: "#FBF8F2" }}>
                                {m.name.split(/\s+/).map((w: string) => w[0]).join("").slice(0, 2).toUpperCase()}
                              </span>
                            </div>
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <p style={{ fontSize: 12, fontWeight: 500, color: "#13101A", margin: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{m.name}</p>
                              <p style={{ fontSize: 10, color: "#8A8497", margin: 0 }}>
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
                <p style={{ fontSize: 13, color: "#8A8497", marginBottom: 20 }}>
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
                        background: "#FBF8F2", border: "1px solid " + (dragOver === gIdx ? "#3E1540" : "#E8E2D2"),
                        borderRadius: 14, padding: "16px 18px", minHeight: 80,
                        transition: "border-color 0.1s",
                      }}
                    >
                      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
                        <p style={{ fontSize: 13, fontWeight: 700, color: "#13101A", margin: 0 }}>{g.name}</p>
                        <span style={{ fontSize: 11, color: "#8A8497" }}>{g.members.length}</span>
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
                              border: "1px solid #E8E2D2", borderRadius: 8, background: dragSource?.groupIdx === gIdx && dragSource?.memberIdx === mIdx ? "#F0EDE8" : "#FBF8F2",
                              cursor: "grab",
                            }}
                          >
                            <GripVertical style={{ width: 12, height: 12, color: "#C4C0B0", flexShrink: 0 }} />
                            <div style={{ width: 24, height: 24, borderRadius: 6, background: "#3E1540", flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
                              <span style={{ fontSize: 9, fontWeight: 700, color: "#FBF8F2" }}>
                                {m.name.split(/\s+/).map((w: string) => w[0]).join("").slice(0, 2).toUpperCase()}
                              </span>
                            </div>
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <p style={{ fontSize: 12, fontWeight: 500, color: "#13101A", margin: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{m.name}</p>
                              <p style={{ fontSize: 10, color: "#8A8497", margin: 0 }}>
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
      <div style={{ borderTop: "1px solid #E8E2D2", padding: "16px 32px", display: "flex", alignItems: "center", justifyContent: "space-between", flexShrink: 0, background: "#FBF8F2" }}>
        <p style={{ fontSize: 12, color: "#8A8497", margin: 0 }}>
          {step === 1 && (poolCount != null ? `${poolCount} people in pool` : "")}
          {step === 2 && "You can adjust individual assignments in the next step."}
          {step === 3 && !sgConfirmResult && "Changes are not saved until you click below."}
        </p>
        <div style={{ display: "flex", gap: 10 }}>
          {step === 3 && !sgConfirmResult && (
            <button
              onClick={() => { setStep(2); setGroups([]); setSgGroups([]) }}
              style={{ padding: "10px 18px", border: "1px solid #E2DDCF", borderRadius: 10, background: "transparent", color: "#5A5466", fontSize: 14, fontWeight: 500, cursor: "pointer", display: "flex", alignItems: "center", gap: 7, fontFamily: "inherit" }}
            >
              <Shuffle style={{ width: 13, height: 13 }} />
              Regenerate
            </button>
          )}
          {step < 3 && (
            <button
              onClick={step === 1 ? () => setStep(2) : handleGenerate}
              disabled={(step === 1 && !step1Ready) || generating}
              style={{
                padding: "10px 22px", background: "#2D0F2E", color: "#FBF8F2",
                borderRadius: 10, fontSize: 14, fontWeight: 600, border: "none",
                cursor: generating || (step === 1 && !step1Ready) ? "not-allowed" : "pointer",
                opacity: (step === 1 && !step1Ready) ? 0.5 : 1,
                display: "flex", alignItems: "center", gap: 8, fontFamily: "inherit",
              }}
            >
              {generating ? <Loader2 style={{ width: 14, height: 14 }} className="animate-spin" /> : null}
              {step === 1 ? "Next" : generating ? "Generating…" : "Generate"}
            </button>
          )}
          {step === 3 && !sgConfirmResult && (
            <button
              onClick={handleSave}
              disabled={saving || confirmingSG || !sessionName.trim()}
              style={{
                padding: "10px 22px", background: "#2D0F2E", color: "#FBF8F2",
                borderRadius: 10, fontSize: 14, fontWeight: 600, border: "none",
                cursor: saving || confirmingSG || !sessionName.trim() ? "not-allowed" : "pointer",
                opacity: !sessionName.trim() ? 0.5 : 1,
                display: "flex", alignItems: "center", gap: 8, fontFamily: "inherit",
              }}
            >
              {(saving || confirmingSG) ? <Loader2 style={{ width: 14, height: 14 }} className="animate-spin" /> : <Check style={{ width: 14, height: 14 }} />}
              {saving ? "Saving…" : confirmingSG ? "Confirming…" : sgGroups.length > 0 ? "Confirm groups" : "Save grouping"}
            </button>
          )}
        </div>
      </div>
    </AnimateIn>
  )
}

// Shared toggle component for GroupGeneratorWizard
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
          background: checked ? "#3E1540" : "#D6D0C0",
          border: "none", cursor: disabled ? "not-allowed" : "pointer", position: "relative", transition: "background 0.15s", marginTop: 2,
        }}
      >
        <div style={{
          position: "absolute", top: 2, left: checked ? 18 : 2,
          width: 16, height: 16, borderRadius: 999, background: "#FBF8F2",
          transition: "left 0.15s",
        }} />
      </button>
      <div>
        <p style={{ fontSize: 14, fontWeight: 500, color: "#13101A", margin: 0 }}>{label}</p>
        <p style={{ fontSize: 12, color: "#8A8497", margin: "3px 0 0" }}>{disabled && tooltip ? tooltip : desc}</p>
      </div>
    </div>
  )
}

// ── CreateTeamOverlay ─────────────────────────────────────────────────────────

export function CreateTeamOverlay({ userId, userName, ministryId, isDGL, isPraiseTeamMember, isAdmin, onClose, onCreated }: {
  userId: string
  userName: string
  ministryId: string
  isDGL?: boolean
  isPraiseTeamMember?: boolean
  isAdmin?: boolean
  onClose: () => void
  onCreated: (teamId: string) => void
}) {
  const supabase = createClient()
  const [step, setStep] = useState<CreateStep>("preset")
  const [selectedTeamType, setSelectedTeamType] = useState<'standard' | 'dg_praise' | 'one_time'>('standard')
  const [teamName, setTeamName] = useState("")
  const [teamIcon, setTeamIcon] = useState("👥")
  const [teamDesc, setTeamDesc] = useState("")
  const [roles, setRoles] = useState<DraftRole[]>([{ name: "Member", permissions: [] }])
  const [editingRoleIdx, setEditingRoleIdx] = useState<number | null>(null)
  const [ministryMembers, setMinistryMembers] = useState<{ id: string; name: string }[]>([])
  const [memberSearch, setMemberSearch] = useState("")
  const [selectedMembers, setSelectedMembers] = useState<{ userId: string; roleIdx: number }[]>([])
  const [presidentPick, setPresidentPick] = useState<string | null>(null)
  const [presidentPick2, setPresidentPick2] = useState<string | null>(null)
  const [coPresidency, setCoPresidency] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Index of the first "president" role (case-insensitive). -1 if none.
  const presidentRoleIdx = roles.findIndex((r) => r.name.toLowerCase().includes("president"))
  // Default role for new members: last non-president role, or 0 if all are president.
  const defaultMemberRoleIdx = (() => {
    for (let i = roles.length - 1; i >= 0; i--) {
      if (!roles[i].name.toLowerCase().includes("president")) return i
    }
    return 0
  })()

  useEffect(() => {
    if (step !== "members") return
    supabase
      .from("profiles")
      .select("id, name")
      .eq("ministry_id", ministryId)
      .neq("id", userId)
      .order("name")
      .then(({ data }) => setMinistryMembers(data ?? []))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step])

  function applyPreset(preset: typeof TEAM_PRESETS[0]) {
    setTeamName(preset.name)
    setTeamIcon(preset.icon)
    setTeamDesc(preset.description)
    setRoles(preset.roles.map((r) => ({ name: r.name, permissions: [...r.permissions] })))
    setSelectedTeamType((preset as { teamType?: 'standard' | 'dg_praise' | 'one_time' }).teamType ?? 'standard')
    setStep("customize")
  }

  function addRole() {
    const next = [...roles, { name: "", permissions: [] }]
    setRoles(next)
    setEditingRoleIdx(next.length - 1)
  }

  function updateRoleName(idx: number, name: string) {
    setRoles((prev) => prev.map((r, i) => (i === idx ? { ...r, name } : r)))
  }

  function toggleRolePermission(idx: number, perm: string) {
    setRoles((prev) =>
      prev.map((r, i) =>
        i === idx
          ? { ...r, permissions: r.permissions.includes(perm) ? r.permissions.filter((p) => p !== perm) : [...r.permissions, perm] }
          : r
      )
    )
  }

  function removeRole(idx: number) {
    setRoles((prev) => prev.filter((_, i) => i !== idx))
    setSelectedMembers((prev) =>
      prev.filter((m) => m.roleIdx !== idx).map((m) => ({ ...m, roleIdx: m.roleIdx > idx ? m.roleIdx - 1 : m.roleIdx }))
    )
    if (editingRoleIdx === idx) setEditingRoleIdx(null)
  }

  function toggleMemberSelection(memberId: string) {
    setSelectedMembers((prev) => {
      const exists = prev.find((m) => m.userId === memberId)
      return exists ? prev.filter((m) => m.userId !== memberId) : [...prev, { userId: memberId, roleIdx: defaultMemberRoleIdx }]
    })
  }

  function updateMemberRole(memberId: string, roleIdx: number) {
    setSelectedMembers((prev) => prev.map((m) => (m.userId === memberId ? { ...m, roleIdx } : m)))
  }

  async function handleSave() {
    if (!teamName.trim()) { setError("Team name is required."); return }
    if (roles.some((r) => !r.name.trim())) { setError("All roles need a name."); return }
    if (presidentRoleIdx >= 0 && (!presidentPick || (coPresidency && !presidentPick2))) { setError(coPresidency ? "Please select both co-presidents." : "Please select a president."); return }
    setSaving(true)
    setError(null)

    const { data: team, error: teamErr } = await supabase
      .from("teams")
      .insert({ name: teamName.trim(), icon: teamIcon, description: teamDesc.trim() || null, ministry_id: ministryId, created_by: userId, team_type: selectedTeamType })
      .select("id")
      .single()

    if (teamErr || !team) { setError(teamErr?.message ?? "Failed to create team."); setSaving(false); return }

    const { data: createdRoles, error: rolesErr } = await supabase
      .from("team_roles")
      .insert(roles.map((r) => ({ team_id: team.id, name: r.name.trim(), permissions: r.permissions })))
      .select("id")

    if (rolesErr || !createdRoles) { setError(rolesErr?.message ?? "Failed to create roles."); setSaving(false); return }

    // Creator always added with default non-president role.
    // President is whoever was explicitly picked from the ministry.
    const allMembersMap = new Map<string, number>()
    allMembersMap.set(userId, defaultMemberRoleIdx)
    if (presidentPick) allMembersMap.set(presidentPick, presidentRoleIdx >= 0 ? presidentRoleIdx : 0)
    if (coPresidency && presidentPick2) allMembersMap.set(presidentPick2, presidentRoleIdx >= 0 ? presidentRoleIdx : 0)
    for (const m of selectedMembers) {
      if (!allMembersMap.has(m.userId)) allMembersMap.set(m.userId, m.roleIdx)
    }

    const { error: membersErr } = await supabase.from("team_members").insert(
      Array.from(allMembersMap.entries()).map(([user_id, roleIdx]) => ({
        team_id: team.id,
        user_id,
        role_id: createdRoles[roleIdx]?.id ?? createdRoles[0].id,
        added_by: userId,
      }))
    )
    if (membersErr) { setError(membersErr.message); setSaving(false); return }

    // Elevate all initial members to "leader" role for DGL and Board teams
    const allPerms = roles.flatMap(r => r.permissions)
    const isLeaderTeam = allPerms.includes("can_create_dgs") || allPerms.includes("can_view_dgs") ||
      (allPerms.includes("can_view_finances") && allPerms.includes("can_manage_members"))
    if (isLeaderTeam) {
      await elevateToLeader(Array.from(allMembersMap.keys()), ministryId)
    }

    onCreated(team.id)
  }

  const filteredMembers = ministryMembers.filter((m) =>
    m.name.toLowerCase().includes(memberSearch.toLowerCase()) &&
    m.id !== presidentPick &&
    m.id !== presidentPick2
  )

  const canAdvance = teamName.trim() !== "" && roles.every((r) => r.name.trim() !== "")

  const STEPS = ["Choose a shape", "Customize", "Invite"]
  const stepIndex = step === "preset" ? 0 : step === "customize" ? 1 : 2

  return (
    <AnimateIn className="fixed inset-0 z-[70] bg-[#FBF8F2] max-w-[390px] mx-auto flex flex-col md:left-[var(--shell-offset)] md:max-w-none">
      {/* Header */}
      <div className="flex items-center justify-between px-5 pt-12 pb-4 md:pt-5 border-b border-[#ECE8DE] bg-[#FBF8F2]">
        <button
          onClick={step === "preset" ? onClose : () => setStep(step === "members" ? "customize" : "preset")}
          className="flex items-center gap-1.5 text-[13px] text-[#8A8497] hover:text-[#3E1540] transition-colors"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          {step === "preset" ? "Cancel" : "Back"}
        </button>
        <span className="text-[14px] font-semibold text-[#13101A]">
          {step === "preset" ? "New Team" : step === "customize" ? "Customize" : "Add Members"}
        </span>
        <div className="w-14 flex justify-end">
          {step === "customize" && (
            <button
              onClick={() => setStep("members")}
              disabled={!canAdvance}
              className="text-[13px] font-semibold text-[#3E1540] disabled:opacity-30"
            >
              Next
            </button>
          )}
          {step === "members" && (
            <button onClick={handleSave} disabled={saving || (presidentRoleIdx >= 0 && (!presidentPick || (coPresidency && !presidentPick2)))} className="text-[13px] font-semibold text-[#3E1540] disabled:opacity-30">
              {saving ? "Saving…" : "Create"}
            </button>
          )}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-5 py-5 md:px-10 md:py-8 md:max-w-[900px] md:mx-auto md:w-full">
        {error && (
          <div className="rounded-xl bg-[#3E1540]/8 px-4 py-3 text-[13px] text-[#3E1540] font-medium mb-4">{error}</div>
        )}

        {/* Desktop: serif hero + stepper */}
        <div className="hidden md:block mb-8">
          <p className="text-[11px] tracking-[0.14em] uppercase text-[#8A8497] mb-2">Step {stepIndex + 1} of {STEPS.length}</p>
          <h1 style={{ fontFamily: "var(--font-instrument-serif)", fontSize: 44, lineHeight: 1, color: "#13101A", fontWeight: 400, marginBottom: 8 }}>
            {step === "preset" && "Pick the shape it should take."}
            {step === "customize" && "Tune the details."}
            {step === "members" && "Bring people in."}
          </h1>
          {step === "preset" && (
            <p style={{ fontSize: 14, color: "#5A5466", maxWidth: 560, lineHeight: 1.6 }}>
              Start from a preset that fits your ministry. You can rename it, add or remove roles, and adjust permissions — nothing here is locked in.
            </p>
          )}
          {step === "members" && (
            <p style={{ fontSize: 14, color: "#5A5466" }}>Add members now, or skip and invite later.</p>
          )}
          {/* Stepper */}
          <div style={{ display: "flex", gap: 28, marginTop: 22 }}>
            {STEPS.map((s, i) => (
              <div key={s} style={{ display: "flex", alignItems: "center", gap: 10, opacity: i === stepIndex ? 1 : 0.45 }}>
                <div style={{
                  width: 22, height: 22, borderRadius: 999,
                  background: i < stepIndex ? "#3E1540" : i === stepIndex ? "#13101A" : "transparent",
                  border: i > stepIndex ? "1px solid #ECE8DE" : "none",
                  color: "#F6F4EF", display: "flex", alignItems: "center", justifyContent: "center",
                  fontSize: 11,
                }}>
                  {i < stepIndex ? <Check className="w-3 h-3" /> : i + 1}
                </div>
                <span style={{ fontSize: 13, color: "#13101A" }}>{s}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Step 1: Preset picker */}
        {step === "preset" && (
          <div>
            {/* Mobile intro */}
            <p className="md:hidden text-[13px] text-[#8A8497] mb-3">Start with a preset or build from scratch.</p>

            {/* Desktop: 2-col grid; mobile: stack */}
            <div className="flex flex-col gap-3 md:grid md:gap-4" style={{ gridTemplateColumns: "1fr 1fr" }}>
              {TEAM_PRESETS.map((preset) => {
                const disabled = (preset as { comingSoon?: boolean }).comingSoon
                return disabled ? (
                  <div
                    key={preset.id}
                    className="w-full rounded-2xl border border-[#ECE8DE] p-4 text-left md:p-5"
                    style={{ background: "#F8F6F2", opacity: 0.6, cursor: "not-allowed" }}
                  >
                    <div className="flex items-start gap-3 mb-2">
                      <span className="text-[22px] mt-0.5 grayscale">{preset.icon}</span>
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <p style={{ fontFamily: "var(--font-instrument-serif)", fontSize: 20 }} className="text-[#8A8497] leading-tight">{preset.name}</p>
                          <span className="text-[10px] font-semibold tracking-wide uppercase bg-[#ECE8DE] text-[#8A8497] px-2 py-0.5 rounded-full">Coming soon</span>
                        </div>
                        <p className="text-[12px] text-[#C4C0B0] mt-1">{preset.description}</p>
                      </div>
                    </div>
                  </div>
                ) : (
                <button
                  key={preset.id}
                  onClick={() => applyPreset(preset)}
                  className="w-full bg-white rounded-2xl border border-[#ECE8DE] p-4 text-left hover:border-[#3E1540]/40 hover:bg-[#FDFBF7] transition-all shadow-[0_1px_4px_rgba(19,16,26,0.06)] md:p-5"
                  style={{ boxShadow: "none" }}
                >
                  <div className="flex items-start gap-3 mb-2">
                    <span className="text-[22px] mt-0.5">{preset.icon}</span>
                    <div className="flex-1">
                      <p style={{ fontFamily: "var(--font-instrument-serif)", fontSize: 20 }} className="text-[#13101A] leading-tight">{preset.name}</p>
                      <p className="text-[12px] text-[#8A8497] mt-1">{preset.description}</p>
                    </div>
                  </div>
                  <div className="mt-3 pt-3 border-t border-[#ECE8DE]">
                    <p className="text-[10px] tracking-[0.12em] uppercase text-[#8A8497] mb-2">Roles · {preset.roles.length}</p>
                    <div className="flex flex-wrap gap-1.5">
                      {preset.roles.map((r) => (
                        <span key={r.name} className="text-[11px] bg-[#FBF8F2] border border-[#ECE8DE] text-[#5A5466] px-2 py-0.5 rounded-full">
                          {r.name}
                        </span>
                      ))}
                    </div>
                  </div>
                </button>
                )
              })}
            </div>

            {/* Desktop: footer nav */}
            <div className="hidden md:flex justify-end mt-8 pt-6 border-t border-[#ECE8DE]">
              <p className="text-[12px] text-[#8A8497] flex-1 self-center">You can change everything later.</p>
            </div>
          </div>
        )}

        {/* Step 2: Customize */}
        {step === "customize" && (
          <div className="flex flex-col gap-5">
            <div className="flex gap-3">
              <div className="flex flex-col gap-1.5">
                <label className="text-[12px] font-medium text-[#5A5466]">Icon</label>
                <input
                  type="text"
                  value={teamIcon}
                  onChange={(e) => setTeamIcon(e.target.value.slice(-2) || "👥")}
                  className="w-14 h-12 text-center text-[20px] rounded-xl border border-[#ECE8DE] bg-[#FBF8F2] focus:outline-none focus:ring-2 focus:ring-[#3E1540]/20"
                />
              </div>
              <div className="flex-1 flex flex-col gap-1.5">
                <label className="text-[12px] font-medium text-[#5A5466]">Team name</label>
                <input
                  type="text"
                  value={teamName}
                  onChange={(e) => setTeamName(e.target.value)}
                  placeholder="e.g. Praise Team"
                  className="w-full h-12 px-4 rounded-xl border border-[#ECE8DE] bg-[#FBF8F2] text-[14px] text-[#13101A] placeholder:text-[#C4C4C4] focus:outline-none focus:ring-2 focus:ring-[#3E1540]/20"
                />
              </div>
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-[12px] font-medium text-[#5A5466]">Description (optional)</label>
              <input
                type="text"
                value={teamDesc}
                onChange={(e) => setTeamDesc(e.target.value)}
                placeholder="What does this team do?"
                className="w-full px-4 py-3 rounded-xl border border-[#ECE8DE] bg-[#FBF8F2] text-[14px] text-[#13101A] placeholder:text-[#C4C4C4] focus:outline-none focus:ring-2 focus:ring-[#3E1540]/20"
              />
            </div>

            <div>
              <div className="flex items-center justify-between mb-3">
                <label className="text-[12px] font-medium text-[#5A5466]">Roles</label>
                <button onClick={addRole} className="text-[12px] font-semibold text-[#3E1540] hover:opacity-70 transition-opacity">
                  + Add role
                </button>
              </div>
              <div className="flex flex-col gap-2">
                {roles.map((role, idx) => (
                  <div key={idx} className="bg-white rounded-2xl border border-[#ECE8DE] overflow-hidden">
                    <div
                      className="flex items-center gap-3 px-4 py-3 cursor-pointer"
                      onClick={() => setEditingRoleIdx(editingRoleIdx === idx ? null : idx)}
                    >
                      <input
                        type="text"
                        value={role.name}
                        onChange={(e) => { e.stopPropagation(); updateRoleName(idx, e.target.value) }}
                        onClick={(e) => e.stopPropagation()}
                        placeholder="Role name"
                        className="flex-1 text-[14px] font-semibold text-[#13101A] bg-transparent focus:outline-none placeholder:text-[#C4C4C4] placeholder:font-normal"
                      />
                      <div className="flex items-center gap-2 flex-shrink-0">
                        <span className="text-[11px] text-[#8A8497]">{role.permissions.length} perms</span>
                        <ChevronDown className={`w-3.5 h-3.5 text-[#C4C4C4] transition-transform ${editingRoleIdx === idx ? "rotate-180" : ""}`} />
                        {roles.length > 1 && (
                          <button onClick={(e) => { e.stopPropagation(); removeRole(idx) }}>
                            <X className="w-3.5 h-3.5 text-[#C4C4C4] hover:text-[#3E1540] transition-colors" />
                          </button>
                        )}
                      </div>
                    </div>
                    {editingRoleIdx === idx && (
                      <div className="border-t border-[#ECE8DE] px-4 py-3">
                        <div className="flex flex-wrap gap-2">
                          {ALL_PERMISSIONS.map((perm) => {
                            const active = role.permissions.includes(perm)
                            return (
                              <button
                                key={perm}
                                onClick={() => toggleRolePermission(idx, perm)}
                                className={`text-[11px] font-medium px-2.5 py-1 rounded-full border transition-all ${
                                  active
                                    ? "bg-[#3E1540] border-[#3E1540] text-[#F6F4EF]"
                                    : "bg-[#FBF8F2] border-[#ECE8DE] text-[#5A5466] hover:border-[#3E1540]/30"
                                }`}
                              >
                                {PERMISSION_LABELS[perm]}
                              </button>
                            )
                          })}
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Step 3: Members */}
        {step === "members" && (
          <div className="flex flex-col gap-4">
            <p className="text-[13px] text-[#8A8497]">Select {coPresidency ? "two co-presidents" : "a president"}, then add other members.</p>

            {/* ── Required: President picker ── */}
            {presidentRoleIdx >= 0 && (
              <div className="rounded-xl border-2 border-[#3E1540]/25 bg-[#F8F5FF] p-3 flex flex-col gap-2.5">
                <div className="flex items-center gap-2">
                  <span className="text-[11px] font-semibold text-[#3E1540] uppercase tracking-wider">{roles[presidentRoleIdx].name}</span>
                  <span className="text-[10px] font-medium text-[#EF4444] bg-red-50 border border-red-100 px-1.5 py-0.5 rounded-full">Required</span>
                  <div className="ml-auto flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => { setCoPresidency(v => !v); setPresidentPick2(null) }}
                      className="flex items-center gap-1.5 text-[11px] text-[#5A5466] hover:text-[#3E1540] transition-colors"
                    >
                      <span className={`w-3.5 h-3.5 rounded-[3px] border flex items-center justify-center flex-shrink-0 transition-colors ${coPresidency ? "bg-[#3E1540] border-[#3E1540]" : "border-[#C4C4C4]"}`}>
                        {coPresidency && <Check className="w-2.5 h-2.5 text-white" />}
                      </span>
                      Co-presidency
                    </button>
                  </div>
                </div>
                {/* First president */}
                {presidentPick ? (
                  <div className="flex items-center gap-3 bg-[#3E1540] rounded-lg px-3 py-2.5">
                    <span className="flex-1 text-[14px] font-medium text-[#F6F4EF]">
                      {ministryMembers.find(m => m.id === presidentPick)?.name ?? "Unknown"}
                    </span>
                    <button onClick={() => setPresidentPick(null)} className="text-[#F6F4EF]/60 hover:text-[#F6F4EF] transition-colors">
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ) : (
                  <select
                    value=""
                    onChange={e => { if (e.target.value) setPresidentPick(e.target.value) }}
                    className="w-full bg-white border border-[#ECE8DE] rounded-lg px-3 py-2.5 text-[13px] text-[#13101A] focus:outline-none focus:ring-2 focus:ring-[#3E1540]/20"
                  >
                    <option value="" disabled>Select a person…</option>
                    {ministryMembers.filter(m => m.id !== presidentPick2).map(m => (
                      <option key={m.id} value={m.id}>{m.name}</option>
                    ))}
                  </select>
                )}
                {/* Second president (co-presidency only) */}
                {coPresidency && (
                  presidentPick2 ? (
                    <div className="flex items-center gap-3 bg-[#3E1540] rounded-lg px-3 py-2.5">
                      <span className="flex-1 text-[14px] font-medium text-[#F6F4EF]">
                        {ministryMembers.find(m => m.id === presidentPick2)?.name ?? "Unknown"}
                      </span>
                      <button onClick={() => setPresidentPick2(null)} className="text-[#F6F4EF]/60 hover:text-[#F6F4EF] transition-colors">
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ) : (
                    <select
                      value=""
                      onChange={e => { if (e.target.value) setPresidentPick2(e.target.value) }}
                      className="w-full bg-white border border-[#ECE8DE] rounded-lg px-3 py-2.5 text-[13px] text-[#13101A] focus:outline-none focus:ring-2 focus:ring-[#3E1540]/20"
                    >
                      <option value="" disabled>Select second person…</option>
                      {ministryMembers.filter(m => m.id !== presidentPick).map(m => (
                        <option key={m.id} value={m.id}>{m.name}</option>
                      ))}
                    </select>
                  )
                )}
              </div>
            )}

            {/* Creator row — always added with non-president role */}
            <div className="flex items-center gap-3 bg-[#F4F1E8] rounded-xl border border-[#ECE8DE] p-3">
              <div className="w-5 h-5 rounded-md bg-[#3E1540] border-[#3E1540] border-2 flex items-center justify-center flex-shrink-0">
                <Check className="w-3 h-3 text-white" />
              </div>
              <span className="flex-1 text-[14px] font-medium text-[#13101A]">
                {userName} <span className="text-[#8A8497] font-normal">(you)</span>
              </span>
              <span className="text-[12px] text-[#5A5466] font-medium">
                {roles[defaultMemberRoleIdx]?.name ?? roles[0]?.name}
              </span>
            </div>

            <div className="relative">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-[#C4C4C4]" />
              <input
                type="text"
                value={memberSearch}
                onChange={(e) => setMemberSearch(e.target.value)}
                placeholder="Search members…"
                className="w-full pl-10 pr-4 py-3 rounded-xl bg-[#FBF8F2] border border-[#ECE8DE] text-[13px] placeholder:text-[#C4C4C4] focus:outline-none focus:ring-2 focus:ring-[#3E1540]/20"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              {filteredMembers.length === 0 && (
                <p className="text-[13px] text-[#8A8497] text-center py-6">No other members to add.</p>
              )}
              {filteredMembers.map((member) => {
                const sel = selectedMembers.find((m) => m.userId === member.id)
                const assignableRoles = roles
                  .map((r, i) => ({ ...r, i }))
                  .filter(({ name }) => !name.toLowerCase().includes("president"))
                return (
                  <div key={member.id} className="flex items-center gap-3 bg-white rounded-xl border border-[#ECE8DE] p-3">
                    <button
                      onClick={() => toggleMemberSelection(member.id)}
                      className={`w-5 h-5 rounded-md border-2 flex items-center justify-center flex-shrink-0 transition-colors ${
                        sel ? "bg-[#3E1540] border-[#3E1540]" : "border-[#C4C4C4]"
                      }`}
                    >
                      {sel && <Check className="w-3 h-3 text-white" />}
                    </button>
                    <span className="flex-1 text-[14px] font-medium text-[#13101A]">{member.name}</span>
                    {sel && assignableRoles.length > 1 && (
                      <select
                        value={sel.roleIdx}
                        onChange={(e) => updateMemberRole(member.id, Number(e.target.value))}
                        className="text-[12px] text-[#5A5466] bg-[#FBF8F2] border border-[#ECE8DE] rounded-lg px-2 py-1 focus:outline-none"
                      >
                        {assignableRoles.map(({ name, i }) => (
                          <option key={i} value={i}>{name || `Role ${i + 1}`}</option>
                        ))}
                      </select>
                    )}
                    {sel && assignableRoles.length <= 1 && (
                      <span className="text-[12px] text-[#8A8497]">{assignableRoles[0]?.name ?? roles[0].name}</span>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        )}
      </div>
    </AnimateIn>
  )
}

// ── TeamDetailOverlay ─────────────────────────────────────────────────────────

export function TeamDetailOverlay({ team, userId, ministryId, isAdmin, onClose, onChanged, onOpenChat }: {
  team: Team
  userId: string
  ministryId: string
  isAdmin: boolean
  onClose: () => void
  onChanged: () => void
  onOpenChat?: (id: string, name: string) => void
}) {
  const supabase = createClient()
  const [roles, setRoles] = useState<TeamRole[]>([])
  const [savedPerms, setSavedPerms] = useState<Record<string, string[]>>({})
  const [savingPerms, setSavingPerms] = useState(false)
  const [draftRoleIds, setDraftRoleIds] = useState<Set<string>>(new Set())
  const [pendingDeleteRoleIds, setPendingDeleteRoleIds] = useState<Set<string>>(new Set())
  const [members, setMembers] = useState<TeamMemberDisplay[]>([])
  const [loading, setLoading] = useState(true)
  const [showAddMember, setShowAddMember] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [ministryMembers, setMinistryMembers] = useState<{ id: string; name: string; email?: string }[]>([])
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
  // Pending member role changes — staged until Save
  const [pendingMemberRoles, setPendingMemberRoles] = useState<Record<string, string>>({})
  const [savedMsg, setSavedMsg] = useState<string | null>(null)

  const isPresident = members.some(m => m.user_id === userId && m.role_name.toLowerCase().includes("president"))
  const canDelete = isAdmin || isPresident
  const myRolePerms = roles.find(r => r.id === members.find(m => m.user_id === userId)?.role_id)?.permissions ?? []
  const canManageTeam = isAdmin || myRolePerms.includes("can_manage_team")
  const isTechTeam = /\btech\b/i.test(team.name)
  const canCreateGroupChat = isTechTeam || isAdmin || isPresident

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

  useEffect(() => {
    async function load() {
      const [{ data: rolesData }, { data: membersData }] = await Promise.all([
        supabase.from("team_roles").select("id, team_id, name, permissions").eq("team_id", team.id),
        supabase
          .from("team_members")
          .select("user_id, role_id, joined_at, profiles!user_id(name), team_roles(name)")
          .eq("team_id", team.id),
      ])
      type RawMember = {
        user_id: string
        role_id: string
        joined_at: string
        profiles: { name: string } | { name: string }[] | null
        team_roles: { name: string } | { name: string }[] | null
      }
      const parsedRoles = (rolesData ?? []).map((r) => ({ ...r, permissions: Array.isArray(r.permissions) ? r.permissions : [] }))
      setRoles(parsedRoles)
      setSavedPerms(Object.fromEntries(parsedRoles.map(r => [r.id, r.permissions])))
      setMembers(
        (membersData ?? []).map((m: RawMember) => {
          const p = Array.isArray(m.profiles) ? m.profiles[0] : m.profiles
          const r = Array.isArray(m.team_roles) ? m.team_roles[0] : m.team_roles
          return { user_id: m.user_id, name: p?.name ?? "Unknown", role_id: m.role_id, role_name: r?.name ?? "Member", joined_at: m.joined_at }
        })
      )
      setLoading(false)
    }
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [team.id])

  useEffect(() => {
    if (!showAddMember) return
    setSelectedIds(new Set())
    setMemberRoles({})
    setDefaultRoleId(roles[0]?.id ?? "")
    const memberIds = new Set([...members.map((m) => m.user_id)])
    supabase
      .from("profiles")
      .select("id, name, email")
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
    await supabase.from("teams").delete().eq("id", team.id)
    onChanged()
    onClose()
  }

  async function handleAddMembers() {
    if (selectedIds.size === 0) return
    if (!defaultRoleId && roles.length > 0) { setError("Select a role before adding."); return }
    setSaving(true)
    setError(null)
    const rows = Array.from(selectedIds).map((uid) => ({
      team_id: team.id,
      user_id: uid,
      role_id: memberRoles[uid] ?? defaultRoleId,
      added_by: userId,
    }))
    const { error: err } = await supabase.from("team_members").insert(rows)
    if (err) { setError(err.message); setSaving(false); return }

    // Elevate newly added members to "leader" for DGL and Board teams
    const allTeamPerms = roles.flatMap(r => r.permissions)
    const isLeaderTeam = allTeamPerms.includes("can_create_dgs") || allTeamPerms.includes("can_view_dgs") ||
      (allTeamPerms.includes("can_view_finances") && allTeamPerms.includes("can_manage_members"))
    if (isLeaderTeam) {
      await elevateToLeader(Array.from(selectedIds), ministryId)
    }

    // Reload members locally and return to settings — do NOT call onChanged() which closes settings
    const { data: membersData } = await supabase
      .from("team_members")
      .select("user_id, role_id, joined_at, profiles!user_id(name), team_roles(name)")
      .eq("team_id", team.id)
    type RawMember = { user_id: string; role_id: string; joined_at: string; profiles: { name: string } | { name: string }[] | null; team_roles: { name: string } | { name: string }[] | null }
    setMembers(
      (membersData ?? []).map((m: RawMember) => {
        const p = Array.isArray(m.profiles) ? m.profiles[0] : m.profiles
        const r = Array.isArray(m.team_roles) ? m.team_roles[0] : m.team_roles
        return { user_id: m.user_id, name: p?.name ?? "Unknown", role_id: m.role_id, role_name: r?.name ?? "Member", joined_at: m.joined_at }
      })
    )
    setShowAddMember(false)
    setSelectedIds(new Set())
    setMemberRoles({})
    setAddSearch("")
    setSaving(false)
  }

  async function handleRemoveMember(memberId: string) {
    await supabase.from("team_members").delete().eq("team_id", team.id).eq("user_id", memberId)
    setMembers((prev) => prev.filter((m) => m.user_id !== memberId))
    setConfirmRemoveId(null)
  }

  function handleChangeRole(memberId: string, newRoleId: string) {
    const newRole = roles.find(r => r.id === newRoleId)
    // Stage the change — persisted on Save
    setPendingMemberRoles(prev => ({ ...prev, [memberId]: newRoleId }))
    setMembers(prev => prev.map(m => m.user_id === memberId ? { ...m, role_id: newRoleId, role_name: newRole?.name ?? m.role_name } : m))
  }

  async function handleRenameTeam() {
    const val = teamNameDraft.trim()
    if (!val || val === localTeamName) { setEditingTeamName(false); return }
    await supabase.from("teams").update({ name: val }).eq("id", team.id)
    setLocalTeamName(val)
    setEditingTeamName(false)
  }

  function handleDeleteRole(roleId: string) {
    if (draftRoleIds.has(roleId)) {
      // Draft (not yet in DB): just remove from local state
      setRoles(prev => {
        const next = prev.filter(r => r.id !== roleId)
        setActiveRole(cur => Math.min(cur, Math.max(0, next.length - 1)))
        return next
      })
      setDraftRoleIds(prev => { const n = new Set(prev); n.delete(roleId); return n })
    } else if (pendingDeleteRoleIds.has(roleId)) {
      // Already staged: toggle off (un-stage)
      setPendingDeleteRoleIds(prev => { const n = new Set(prev); n.delete(roleId); return n })
    } else {
      // Existing: mark as pending delete (stays visible, committed on Save)
      setPendingDeleteRoleIds(prev => new Set([...prev, roleId]))
    }
    setConfirmDeleteRoleId(null)
    setRoleDeleteError(null)
  }

  function handleAddRole() {
    const val = newRoleName.trim()
    if (!val) { setAddingRole(false); return }
    const tempId = `draft-${Date.now()}`
    const newRole: TeamRole = { id: tempId, team_id: team.id, name: val, permissions: [] }
    setRoles(prev => { const next = [...prev, newRole]; setActiveRole(next.length - 1); return next })
    setDraftRoleIds(prev => new Set([...prev, tempId]))
    setAddingRole(false)
    setNewRoleName("")
  }

  async function handleRenameRole(roleId: string) {
    const val = renamingRoleValue.trim()
    if (!val) { setRenamingRoleId(null); return }
    await supabase.from("team_roles").update({ name: val }).eq("id", roleId)
    setRoles(prev => prev.map(r => r.id === roleId ? { ...r, name: val } : r))
    setRenamingRoleId(null)
  }

  const visiblePerms = getVisiblePermissions(team.name)

  const hasChanges =
    draftRoleIds.size > 0 ||
    pendingDeleteRoleIds.size > 0 ||
    Object.keys(pendingMemberRoles).length > 0 ||
    roles.some(r => {
      if (draftRoleIds.has(r.id)) return false
      const saved = savedPerms[r.id]
      if (saved === undefined) return false
      return JSON.stringify([...r.permissions].sort()) !== JSON.stringify([...saved].sort())
    })

  function togglePermission(perm: string) {
    if (!canManageTeam) return
    setRoles(prev => prev.map((r, i) =>
      i === activeRole
        ? { ...r, permissions: r.permissions.includes(perm) ? r.permissions.filter(p => p !== perm) : [...r.permissions, perm] }
        : r
    ))
  }

  async function handleSaveChanges() {
    setSavingPerms(true)
    const snapRoles = [...roles]
    const snapDrafts = new Set(draftRoleIds)
    const snapDeletes = new Set(pendingDeleteRoleIds)

    // 1. Delete pending-delete roles
    if (snapDeletes.size > 0) {
      const ids = [...snapDeletes]
      await Promise.all(ids.map(id =>
        supabase.from("team_members").update({ role_id: null }).eq("role_id", id).eq("team_id", team.id)
      ))
      await Promise.all(ids.map(id => supabase.from("team_roles").delete().eq("id", id)))
      setRoles(prev => {
        const next = prev.filter(r => !snapDeletes.has(r.id))
        setActiveRole(cur => Math.min(cur, Math.max(0, next.length - 1)))
        return next
      })
      setSavedPerms(prev => { const next = { ...prev }; ids.forEach(id => delete next[id]); return next })
      setMembers(prev => prev.map(m => snapDeletes.has(m.role_id ?? "") ? { ...m, role_id: "", role_name: "No role" } : m))
      setPendingDeleteRoleIds(new Set())
    }

    // 2. Insert draft roles
    if (snapDrafts.size > 0) {
      const idMap: Record<string, string> = {}
      for (const dr of snapRoles.filter(r => snapDrafts.has(r.id))) {
        const { data } = await supabase.from("team_roles")
          .insert({ team_id: team.id, name: dr.name, permissions: dr.permissions })
          .select("id, team_id, name, permissions").single()
        if (data) idMap[dr.id] = data.id
      }
      setRoles(prev => prev.map(r => idMap[r.id] ? { ...r, id: idMap[r.id] } : r))
      setSavedPerms(prev => {
        const next = { ...prev }
        for (const [tmp, real] of Object.entries(idMap)) {
          delete next[tmp]
          next[real] = snapRoles.find(r => r.id === tmp)?.permissions ?? []
        }
        return next
      })
      setDraftRoleIds(new Set())
    }

    // 3. Save permission edits for existing roles
    const toSave = snapRoles.filter(r => {
      if (snapDrafts.has(r.id) || snapDeletes.has(r.id)) return false
      const saved = savedPerms[r.id]
      if (saved === undefined) return false
      return JSON.stringify([...r.permissions].sort()) !== JSON.stringify([...saved].sort())
    })
    await Promise.all(toSave.map(r => supabase.from("team_roles").update({ permissions: r.permissions }).eq("id", r.id)))
    setSavedPerms(prev => {
      const next = { ...prev }
      toSave.forEach(r => { next[r.id] = r.permissions })
      return next
    })

    // 4. Save staged member role changes
    const snapMemberRoles = { ...pendingMemberRoles }
    if (Object.keys(snapMemberRoles).length > 0) {
      await Promise.all(
        Object.entries(snapMemberRoles).map(([uid, roleId]) =>
          supabase.from("team_members").update({ role_id: roleId }).eq("team_id", team.id).eq("user_id", uid)
        )
      )
      setPendingMemberRoles({})
    }

    setSavingPerms(false)
    setSavedMsg("Changes saved")
    setTimeout(() => setSavedMsg(null), 3000)
  }

  function handleDiscardChanges() {
    const surviving = roles
      .filter(r => !draftRoleIds.has(r.id))
      .map(r => savedPerms[r.id] !== undefined ? { ...r, permissions: [...savedPerms[r.id]] } : r)
    setRoles(surviving)
    setActiveRole(cur => Math.min(cur, Math.max(0, surviving.length - 1)))
    setDraftRoleIds(new Set())
    setPendingDeleteRoleIds(new Set())
    setPendingMemberRoles({})
  }

  const filteredAdd = ministryMembers.filter((m) =>
    m.name.toLowerCase().includes(addSearch.toLowerCase())
  )

  const addMemberForm = (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      {/* Default role picker */}
      {roles.length > 0 && (
        <div>
          <p style={{ fontFamily: "ui-monospace,'SF Mono',Menlo,monospace", fontSize: 11, fontWeight: 400, color: "#8A8497", textTransform: "uppercase" as const, letterSpacing: "1.4px", marginBottom: 6 }}>Default role</p>
          <p style={{ fontSize: 12, color: "#A09A8C", marginBottom: 10 }}>Pre-fills for all selections — change individually below.</p>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" as const }}>
            {roles.map((r) => (
              <button
                key={r.id}
                onClick={() => setDefaultRoleId(r.id)}
                style={{
                  padding: "7px 14px", borderRadius: 999, fontSize: 13,
                  border: `1px solid ${defaultRoleId === r.id ? "#2D0F2E" : "#E2DDCF"}`,
                  background: defaultRoleId === r.id ? "#2D0F2E" : "#FBF8F2",
                  color: defaultRoleId === r.id ? "#FBF8F2" : "#5A5466",
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
        <Search style={{ position: "absolute", left: 14, top: "50%", transform: "translateY(-50%)", width: 15, height: 15, color: "#8A8497", pointerEvents: "none" }} />
        <input
          type="text"
          value={addSearch}
          onChange={(e) => setAddSearch(e.target.value)}
          placeholder="Search members…"
          style={{ width: "100%", padding: "12px 14px 12px 44px", border: "1px solid #E2DDCF", borderRadius: 10, background: "#FBF8F2", fontSize: 15, color: "#13101A", outline: "none", boxSizing: "border-box" as const }}
        />
      </div>

      {/* Member list */}
      <div>
        {filteredAdd.length === 0 ? (
          <div style={{ border: "1px dashed #C4C0B0", borderRadius: 12, padding: "32px 24px", textAlign: "center" as const }}>
            <p style={{ fontSize: 13, color: "#8A8497", margin: 0 }}>No members to add.</p>
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
                    borderBottom: isLast ? "none" : "1px solid #EFE9DA",
                    background: selected ? "#F1ECDE" : "transparent",
                    cursor: "pointer", textAlign: "left" as const,
                    transition: "background 0.12s",
                  }}
                >
                  <MonogramChip initials={getInitials(member.name)} className="w-9 h-9 text-[13px] font-semibold" />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ fontSize: 14, color: "#13101A", fontWeight: 500, lineHeight: 1.3, margin: 0 }}>{member.name}</p>
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
                          background: "#FBF8F2", color: "#13101A", cursor: "pointer",
                          outline: "none", maxWidth: "100%",
                        }}
                      >
                        {roles.map((r) => (
                          <option key={r.id} value={r.id}>{r.name}</option>
                        ))}
                      </select>
                    ) : (
                      member.email && <p style={{ fontSize: 12, color: "#8A8497", marginTop: 2, marginBottom: 0 }}>{member.email}</p>
                    )}
                  </div>
                  {selected && (
                    <div style={{
                      width: 20, height: 20, borderRadius: 5, background: "#3E1540", flexShrink: 0,
                      display: "flex", alignItems: "center", justifyContent: "center",
                    }}>
                      <Check style={{ width: 11, height: 11, color: "#FBF8F2" }} />
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
    <AnimateIn className="fixed inset-0 z-[70] bg-[#FBF8F2] max-w-[390px] mx-auto flex flex-col md:left-[var(--shell-offset)] md:max-w-none">

      {/* ── Mobile header ── */}
      <div className="md:hidden flex items-center justify-between px-5 pt-12 pb-4 border-b border-[#ECE8DE] bg-[#FBF8F2]">
        <button
          onClick={showAddMember ? () => { setShowAddMember(false); setError(null) } : confirmDelete ? () => setConfirmDelete(false) : onClose}
          className="size-9 bg-white border border-[#ECE8DE] rounded-full flex items-center justify-center hover:bg-[#F2EDE0] transition-colors flex-shrink-0 shadow-[0_1px_3px_rgba(19,16,26,0.05)]"
        >
          <ArrowLeft className="w-4 h-4 text-[#13101A]" />
        </button>
        <div className="flex items-center gap-2">
          {!showAddMember && (confirmDelete
            ? <span className="text-[18px]">⚠️</span>
            : <PlanLineIcon iconKey={team.icon ?? "users"} size={22} bg="#3E1540" fg="#FBF8F2" />
          )}
          <span className="text-[14px] font-semibold text-[#13101A]">
            {showAddMember ? "Add Member" : confirmDelete ? "Delete team?" : team.name}
          </span>
        </div>
        <div className="flex justify-end">
          {!showAddMember && (
            confirmDelete ? (
              <button
                onClick={handleDeleteTeam}
                style={{ height: 34, padding: "0 14px", background: "#9F3030", color: "#FBF8F2", borderRadius: 8, fontSize: 13, fontWeight: 600, border: "none", cursor: "pointer" }}
              >
                Delete
              </button>
            ) : savedMsg ? (
              <span style={{ fontSize: 13, color: "#5A5466" }}>{savedMsg}</span>
            ) : hasChanges ? (
              <button
                onClick={handleSaveChanges}
                disabled={savingPerms}
                style={{ height: 34, padding: "0 14px", background: "#2D0F2E", color: "#FBF8F2", borderRadius: 8, fontSize: 13, fontWeight: 600, border: "none", cursor: savingPerms ? "not-allowed" : "pointer", opacity: savingPerms ? 0.6 : 1 }}
              >
                {savingPerms ? "Saving…" : "Save"}
              </button>
            ) : (
              <div className="flex items-center gap-2">
                {canCreateGroupChat && (
                  chatCreated ? (
                    <button
                      onClick={() => { onOpenChat?.(chatCreated.id, chatCreated.name); onClose() }}
                      className="flex items-center gap-1.5 px-3 h-9 rounded-xl text-[13px] font-semibold text-white"
                      style={{ background: "#2D0F2E", border: "none", cursor: "pointer" }}
                    >
                      <MessageCircle className="w-3.5 h-3.5" /> Open chat
                    </button>
                  ) : (
                    <button
                      onClick={handleCreateGroupChat}
                      disabled={creatingChat}
                      className="size-9 flex items-center justify-center rounded-full hover:bg-[#F4F1E8] transition-colors"
                      style={{ border: "none", background: "transparent", cursor: creatingChat ? "not-allowed" : "pointer", opacity: creatingChat ? 0.5 : 1 }}
                    >
                      <MessageCircle className="w-4 h-4 text-[#8A8497]" />
                    </button>
                  )
                )}
                {canDelete && (
                  <button onClick={() => setConfirmDelete(true)} className="size-9 flex items-center justify-center rounded-full hover:bg-red-50 transition-colors">
                    <Trash2 className="w-4 h-4 text-[#8A8497]" />
                  </button>
                )}
              </div>
            )
          )}
        </div>
      </div>

      {/* ── Desktop settings header ── */}
      <div className="hidden md:flex h-12 px-7 items-center gap-4 flex-shrink-0" style={{ borderBottom: "1px solid var(--line)", background: "var(--cream)" }}>
        <div className="flex items-center gap-1.5 text-[12px]" style={{ flex: 1 }}>
          <span style={{ color: "var(--muted-text)" }}>Central</span>
          <span style={{ color: "var(--line-2)" }}>/</span>
          <span style={{ color: "var(--muted-text)" }}>Planning</span>
          <span style={{ color: "var(--line-2)" }}>/</span>
          <span style={{ color: "var(--muted-text)" }}>{team.name}</span>
          <span style={{ color: "var(--line-2)" }}>/</span>
          <span style={{ color: "var(--ink)", fontWeight: 500 }}>{showAddMember ? "Add member" : "Settings"}</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          {showAddMember ? (
            <>
              <button onClick={() => { setShowAddMember(false); setError(null) }} style={{ display: "flex", alignItems: "center", gap: 6, height: 34, padding: "0 14px", background: "transparent", border: "1px solid #ECE8DE", borderRadius: 8, color: "#8A8497", fontSize: 13, cursor: "pointer" }}>
                <ArrowLeft style={{ width: 13, height: 13 }} /> Back to settings
              </button>
              <button onClick={onClose} style={{ width: 34, height: 34, display: "flex", alignItems: "center", justifyContent: "center", background: "white", border: "1px solid #ECE8DE", borderRadius: 8, cursor: "pointer", color: "#5A5466" }}>
                <X style={{ width: 15, height: 15 }} />
              </button>
            </>
          ) : confirmDelete ? (
            <>
              <button onClick={() => setConfirmDelete(false)} style={{ height: 34, padding: "0 14px", background: "transparent", border: "1px solid #ECE8DE", borderRadius: 8, color: "#5A5466", fontSize: 13, cursor: "pointer" }}>Cancel</button>
              <button onClick={handleDeleteTeam} style={{ height: 34, padding: "0 14px", background: "#9F3030", color: "#FBF8F2", borderRadius: 8, fontSize: 13, fontWeight: 600, border: "none", cursor: "pointer" }}>Delete team</button>
            </>
          ) : savedMsg ? (
            <span style={{ fontSize: 13, color: "#5A5466" }}>{savedMsg}</span>
          ) : hasChanges ? (
            <>
              <button onClick={handleDiscardChanges} style={{ height: 34, padding: "0 14px", background: "transparent", border: "1px solid #ECE8DE", borderRadius: 8, color: "#5A5466", fontSize: 13, cursor: "pointer" }}>Discard</button>
              <button onClick={handleSaveChanges} disabled={savingPerms} style={{ height: 34, padding: "0 20px", background: "#2D0F2E", color: "#FBF8F2", borderRadius: 8, fontSize: 13, fontWeight: 600, border: "none", cursor: savingPerms ? "not-allowed" : "pointer", opacity: savingPerms ? 0.6 : 1 }}>
                {savingPerms ? "Saving…" : "Save changes"}
              </button>
            </>
          ) : (
            <>
              {canCreateGroupChat && (chatCreated ? (
                <button onClick={() => { onOpenChat?.(chatCreated.id, chatCreated.name); onClose() }} style={{ display: "flex", alignItems: "center", gap: 6, height: 34, padding: "0 14px", background: "#2D0F2E", color: "#FBF8F2", borderRadius: 8, fontSize: 13, fontWeight: 600, border: "none", cursor: "pointer" }}>
                  <MessageCircle style={{ width: 13, height: 13 }} /> Open chat
                </button>
              ) : (
                <button onClick={handleCreateGroupChat} disabled={creatingChat} style={{ display: "flex", alignItems: "center", gap: 6, height: 34, padding: "0 14px", background: "transparent", border: "1px solid #E8E2D2", borderRadius: 8, color: "#5A5466", fontSize: 13, cursor: creatingChat ? "not-allowed" : "pointer", opacity: creatingChat ? 0.6 : 1 }}>
                  <MessageCircle style={{ width: 13, height: 13 }} /> {creatingChat ? "Creating…" : "Group chat"}
                </button>
              ))}
              {canDelete && (
                <button onClick={() => setConfirmDelete(true)} style={{ display: "flex", alignItems: "center", gap: 6, height: 34, padding: "0 14px", background: "transparent", border: "1px solid rgba(176,65,62,0.25)", borderRadius: 8, color: "#B0413E", fontSize: 13, cursor: "pointer" }}>
                  <Trash2 style={{ width: 13, height: 13 }} /> Delete team
                </button>
              )}
              <button onClick={onClose} style={{ width: 34, height: 34, display: "flex", alignItems: "center", justifyContent: "center", background: "white", border: "1px solid #ECE8DE", borderRadius: 8, cursor: "pointer", color: "#5A5466" }} title="Close settings">
                <X style={{ width: 15, height: 15 }} />
              </button>
            </>
          )}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        {error && (
          <div className="mx-5 mt-4 rounded-xl bg-[#3E1540]/8 px-4 py-3 text-[13px] text-[#3E1540] font-medium">{error}</div>
        )}

        {/* ── Mobile content ── */}
        <div className="md:hidden px-5 py-5">
          {!showAddMember && (
            <>
              {loading ? <Spinner /> : (
                <div className="flex flex-col gap-6">
                  <div>
                    <PlanSectionHeader>Roles</PlanSectionHeader>
                    <div className="flex flex-col gap-2">
                      {roles.length === 0 && (
                        <p className="text-[13px] text-[#8A8497] text-center py-4">No roles defined.</p>
                      )}
                      {roles.map((role) => (
                        <div key={role.id} className="bg-white rounded-2xl border border-[#ECE8DE] p-4">
                          <p className="text-[14px] font-semibold text-[#13101A] mb-2">{role.name}</p>
                          {role.permissions.length > 0 ? (
                            <div className="flex flex-wrap gap-1.5">
                              {role.permissions.map((p) => (
                                <span key={p} className="text-[11px] bg-[#FBF8F2] border border-[#ECE8DE] text-[#5A5466] px-2 py-0.5 rounded-full">
                                  {PERMISSION_LABELS[p] ?? p}
                                </span>
                              ))}
                            </div>
                          ) : (
                            <p className="text-[12px] text-[#8A8497]">No permissions assigned</p>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                  <div>
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-3 flex-1 mr-3">
                        <span style={{ fontFamily: "var(--font-instrument-serif)", fontSize: "22px", fontWeight: 400, color: "#13101A", letterSpacing: "-0.01em" }}>Members</span>
                        <div className="flex-1 h-px bg-[#ECE8DE]" />
                      </div>
                      {(isAdmin || isPresident) && (
                        <button onClick={() => setShowAddMember(true)} className="text-[12px] font-semibold text-[#3E1540] hover:opacity-70 flex-shrink-0">
                          + Add
                        </button>
                      )}
                    </div>
                    <div className="flex flex-col gap-1.5">
                      {members.length === 0 && <p className="text-[13px] text-[#8A8497] text-center py-4">No one&apos;s here yet.</p>}
                      {members.map((m, i) => {
                        const isConfirming = confirmRemoveId === m.user_id
                        const isRevealed = mobileRevealMemberId === m.user_id
                        return (
                          <div key={m.user_id} className="flex items-center gap-3 rounded-xl border border-[#ECE8DE] p-3"
                            style={{ background: isConfirming ? "#FDF0F0" : "white", transition: "background 0.1s" }}
                            onClick={() => { if ((isAdmin || isPresident) && m.user_id !== userId && !isConfirming) setMobileRevealMemberId(id => id === m.user_id ? null : m.user_id) }}
                          >
                            <MonogramChip initials={getInitials(m.name)} className="w-8 h-8 text-[12px] font-semibold" />
                            <div className="flex-1 min-w-0">
                              <p className="text-[14px] font-medium text-[#13101A] truncate">{m.name}</p>
                              {(isAdmin || isPresident) && roles.length > 1 && m.user_id !== userId ? (
                                <select
                                  value={m.role_id}
                                  onChange={e => { e.stopPropagation(); handleChangeRole(m.user_id, e.target.value) }}
                                  onClick={e => e.stopPropagation()}
                                  style={{ fontSize: 12, color: "#5A5466", border: "none", background: "transparent", cursor: "pointer", outline: "none", padding: 0, marginTop: 1 }}
                                >
                                  {roles.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
                                </select>
                              ) : (
                                <p className="text-[12px] text-[#8A8497]">{m.role_name}</p>
                              )}
                            </div>
                            {(isAdmin || isPresident) && m.user_id !== userId && (
                              isConfirming ? (
                                <div style={{ display: "flex", alignItems: "center", gap: 16, flexShrink: 0 }}>
                                  <button onClick={e => { e.stopPropagation(); handleRemoveMember(m.user_id) }} style={{ width: 28, height: 28, borderRadius: 6, border: "none", background: "none", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", padding: 0, color: "#9F3030" }}><Check className="w-4 h-4" /></button>
                                  <button onClick={e => { e.stopPropagation(); setConfirmRemoveId(null) }} style={{ width: 28, height: 28, borderRadius: 6, border: "none", background: "none", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", padding: 0, color: "#8A8497" }}><X className="w-4 h-4" /></button>
                                </div>
                              ) : (
                                <button
                                  onClick={e => { e.stopPropagation(); setConfirmRemoveId(m.user_id); setMobileRevealMemberId(null) }}
                                  style={{ display: "flex", alignItems: "center", justifyContent: "center", background: "none", border: "none", cursor: "pointer", padding: 2, flexShrink: 0, color: "#8A8497", opacity: isRevealed ? 1 : 0, transition: "opacity 0.15s", pointerEvents: isRevealed ? "auto" : "none" }}
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
          <div className="hidden md:block px-10 py-8">
            {loading ? <Spinner /> : (
              <>
                {/* Hero strip */}
                <div style={{ display: "flex", alignItems: "center", gap: 20, marginBottom: 32 }}>
                  <PlanLineIcon iconKey={team.icon ?? "users"} size={76} bg="#3E1540" fg="#F6F4EF" />
                  <div style={{ flex: 1 }}>
                    <p style={{ fontSize: 11, letterSpacing: "0.14em", textTransform: "uppercase", color: "#8A8497", marginBottom: 4 }}>Team settings</p>
                    {editingTeamName ? (
                      <input
                        autoFocus
                        value={teamNameDraft}
                        onChange={e => setTeamNameDraft(e.target.value)}
                        onKeyDown={e => { if (e.key === "Enter") handleRenameTeam(); if (e.key === "Escape") setEditingTeamName(false) }}
                        onBlur={handleRenameTeam}
                        style={{ fontFamily: "var(--font-instrument-serif)", fontSize: 44, color: "#13101A", lineHeight: 1.1, background: "transparent", border: "none", borderBottom: "1px solid #E2DDCF", outline: "none", padding: 0 }}
                      />
                    ) : (
                      <div
                        className="group flex items-center gap-2"
                        style={{ cursor: canManageTeam ? "text" : "default" }}
                        onClick={canManageTeam ? () => { setTeamNameDraft(localTeamName); setEditingTeamName(true) } : undefined}
                      >
                        <p style={{ fontFamily: "var(--font-instrument-serif)", fontSize: 44, color: "#13101A", lineHeight: 1.1 }}>{localTeamName}</p>
                        {canManageTeam && <Pencil className="opacity-0 group-hover:opacity-100 transition-opacity duration-150" style={{ width: 13, height: 13, color: "#8A8497", flexShrink: 0, marginTop: 6 }} />}
                      </div>
                    )}
                    <p style={{ color: "#5A5466", fontSize: 14, marginTop: 6 }}>
                      {members.length} {members.length === 1 ? "member" : "members"} · {roles.length} {roles.length === 1 ? "role" : "roles"}
                    </p>
                  </div>
                </div>

                {/* Roles & permissions */}
                <p style={{ fontSize: 11, letterSpacing: "0.14em", textTransform: "uppercase", color: "#8A8497", marginBottom: 12 }}>Roles & permissions</p>
                <div style={{ background: "white", border: "1px solid #ECE8DE", borderRadius: 16, overflow: "hidden", marginBottom: 28 }}>
                  {roles.length === 0 ? (
                    <p style={{ padding: "24px", textAlign: "center", color: "#8A8497", fontSize: 13 }}>No roles defined.</p>
                  ) : (
                    <div style={{ display: "grid", gridTemplateColumns: "260px 1fr" }}>
                      {/* Role left nav */}
                      <div style={{ borderRight: "1px solid #ECE8DE", background: "#FBF8F2" }}>
                        {roles.map((role, i) => {
                          const roleCount = members.filter(m => m.role_id === role.id).length
                          const isRoleConfirming = confirmDeleteRoleId === role.id
                          const isPendingDelete = pendingDeleteRoleIds.has(role.id)
                          const isDraft = draftRoleIds.has(role.id)
                          return (
                            <div
                              key={role.id}
                              onClick={() => { if (!isRoleConfirming) setActiveRole(i) }}
                              onMouseEnter={() => setHoveredRoleId(role.id)}
                              onMouseLeave={() => setHoveredRoleId(null)}
                              style={{
                                padding: "16px 20px",
                                borderBottom: i < roles.length - 1 ? "1px solid #ECE8DE" : "none",
                                borderLeft: isPendingDelete ? "2px solid #9F3030" : (activeRole === i ? "2px solid #3E1540" : "2px solid transparent"),
                                background: isPendingDelete ? "#FDF0F0" : (isRoleConfirming ? "#FDF0F0" : (activeRole === i ? "white" : "transparent")),
                                cursor: isRoleConfirming ? "default" : "pointer",
                                transition: "background 0.1s",
                                opacity: isPendingDelete ? 0.6 : 1,
                              }}
                            >
                              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                                <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
                                  <span style={{ fontFamily: "var(--font-instrument-serif)", fontSize: 19, color: isPendingDelete ? "#9F3030" : "#13101A", textDecoration: isPendingDelete ? "line-through" : "none" }}>{role.name}</span>
                                  {isDraft && <span style={{ fontSize: 10, fontWeight: 600, letterSpacing: "0.05em", color: "#2F7A3E", background: "#E8F5EB", border: "1px solid #C2E0C8", borderRadius: 4, padding: "1px 5px" }}>NEW</span>}
                                  {isPendingDelete && <span style={{ fontSize: 10, fontWeight: 600, letterSpacing: "0.05em", color: "#9F3030", background: "#FDF0F0", border: "1px solid #F0C8C8", borderRadius: 4, padding: "1px 5px" }}>REMOVING</span>}
                                </div>
                                <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                                  {!isRoleConfirming && (
                                    <span style={{ fontSize: 11.5, color: "#8A8497" }}>{roleCount} {roleCount === 1 ? "person" : "people"}</span>
                                  )}
                                  {canManageTeam && (
                                    isRoleConfirming ? (
                                      roleDeleteError ? (
                                        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                                          <span style={{ fontSize: 11, color: "#9F3030", maxWidth: 100 }}>{roleDeleteError}</span>
                                          <button
                                            onClick={e => { e.stopPropagation(); setConfirmDeleteRoleId(null); setRoleDeleteError(null) }}
                                            style={{ width: 22, height: 22, borderRadius: 4, border: "none", background: "none", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", padding: 0, color: "#8A8497", flexShrink: 0 }}
                                          >
                                            <X style={{ width: 12, height: 12 }} />
                                          </button>
                                        </div>
                                      ) : (
                                        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                                          <button
                                            onClick={e => { e.stopPropagation(); handleDeleteRole(role.id) }}
                                            style={{ width: 28, height: 28, borderRadius: 6, border: "none", background: "none", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", padding: 0, color: "#9F3030" }}
                                          >
                                            <Check className="w-4 h-4" />
                                          </button>
                                          <button
                                            onClick={e => { e.stopPropagation(); setConfirmDeleteRoleId(null) }}
                                            style={{ width: 28, height: 28, borderRadius: 6, border: "none", background: "none", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", padding: 0, color: "#8A8497" }}
                                          >
                                            <X className="w-4 h-4" />
                                          </button>
                                        </div>
                                      )
                                    ) : (
                                      <button
                                        onClick={e => { e.stopPropagation(); isPendingDelete ? handleDeleteRole(role.id) : setConfirmDeleteRoleId(role.id) }}
                                        style={{ display: "flex", alignItems: "center", justifyContent: "center", background: "none", border: "none", cursor: "pointer", padding: 2, color: isPendingDelete ? "#9F3030" : "#8A8497", opacity: (hoveredRoleId === role.id || isPendingDelete) ? 1 : 0, transition: "opacity 0.15s", pointerEvents: (hoveredRoleId === role.id || isPendingDelete) ? "auto" : "none" }}
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
                            <div style={{ padding: "10px 20px", borderTop: roles.length > 0 ? "1px solid #ECE8DE" : "none" }}>
                              <input
                                autoFocus
                                value={newRoleName}
                                onChange={e => setNewRoleName(e.target.value)}
                                onKeyDown={e => { if (e.key === "Enter") handleAddRole(); if (e.key === "Escape") { setAddingRole(false); setNewRoleName("") } }}
                                onBlur={() => { if (!newRoleName.trim()) { setAddingRole(false); setNewRoleName("") } }}
                                placeholder="Role name"
                                style={{ width: "100%", fontSize: 14, background: "transparent", border: "none", borderBottom: "1px solid #3E1540", outline: "none", padding: "2px 0", color: "#13101A" }}
                              />
                            </div>
                          ) : (
                            <div
                              onClick={() => { setAddingRole(true); setNewRoleName("") }}
                              style={{ padding: "13px 20px", color: "#3E1540", fontSize: 13.5, display: "flex", alignItems: "center", gap: 8, cursor: "pointer", borderTop: roles.length > 0 ? "1px solid #ECE8DE" : "none" }}
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
                                  style={{ fontFamily: "var(--font-instrument-serif)", fontSize: 26, color: "#13101A", background: "transparent", border: "none", borderBottom: "1px solid #E2DDCF", outline: "none", padding: 0 }}
                                />
                              ) : (
                                <div
                                  className="group flex items-center gap-1.5"
                                  style={{ cursor: canManageTeam ? "text" : "default" }}
                                  onClick={canManageTeam ? () => { setRenamingRoleId(roles[activeRole].id); setRenamingRoleValue(roles[activeRole].name) } : undefined}
                                >
                                  <p style={{ fontFamily: "var(--font-instrument-serif)", fontSize: 26, color: "#13101A" }}>{roles[activeRole].name}</p>
                                  {canManageTeam && <Pencil className="opacity-0 group-hover:opacity-100 transition-opacity duration-150" style={{ width: 13, height: 13, color: "#8A8497", flexShrink: 0 }} />}
                                </div>
                              )}
                              <p style={{ fontSize: 12.5, color: "#8A8497", marginTop: 2 }}>
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
                                    style={{ display: "flex", alignItems: "center", gap: 14, padding: "13px 0", borderBottom: pi < visiblePerms.length - 1 ? "1px solid #ECE8DE" : "none", cursor: canManageTeam ? "pointer" : "default" }}
                                  >
                                    <p style={{ flex: 1, fontSize: 14, color: "#13101A", fontWeight: 500 }}>{PERMISSION_LABELS[perm]}</p>
                                    <div style={{ width: 38, height: 22, borderRadius: 999, background: on ? "#3E1540" : "#ECE8DE", position: "relative", flexShrink: 0, transition: "background 0.15s" }}>
                                      <div style={{ position: "absolute", top: 3, left: on ? 19 : 3, width: 16, height: 16, borderRadius: 999, background: "white", boxShadow: "0 1px 3px rgba(0,0,0,0.15)", transition: "left 0.15s" }} />
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

                {/* Members roster */}
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
                  <p style={{ fontSize: 11, letterSpacing: "0.14em", textTransform: "uppercase", color: "#8A8497" }}>Members</p>
                  {(isAdmin || isPresident) && (
                    <button
                      onClick={() => setShowAddMember(true)}
                      style={{ display: "flex", alignItems: "center", gap: 6, height: 34, padding: "0 14px", background: "#3E1540", border: "none", borderRadius: 8, color: "#F6F4EF", fontSize: 13, fontWeight: 600, cursor: "pointer" }}
                    >
                      + Add member
                    </button>
                  )}
                </div>
                <div style={{ background: "white", border: "1px solid #ECE8DE", borderRadius: 16, overflow: "hidden" }}>
                  <div style={{ display: "grid", gridTemplateColumns: "44px 1.5fr 1fr 120px", padding: "10px 22px", borderBottom: "1px solid #ECE8DE", color: "#8A8497", fontSize: 11, letterSpacing: "0.14em", textTransform: "uppercase" }}>
                    <span />
                    <span>Name</span>
                    <span>Role</span>
                    <span />
                  </div>
                  {members.length === 0 && (
                    <p style={{ padding: "24px", textAlign: "center", color: "#8A8497", fontSize: 13 }}>No one&apos;s here yet.</p>
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
                          borderBottom: i < members.length - 1 ? "1px solid #ECE8DE" : "none",
                          background: isConfirming ? "#FDF0F0" : "transparent",
                          transition: "background 0.1s",
                        }}
                      >
                        <MonogramChip initials={getInitials(m.name)} className="w-8 h-8 text-[12px] font-semibold" />
                        <span style={{ fontSize: 13.5, color: "#13101A", fontWeight: 500 }}>{m.name}</span>
                        {(isAdmin || isPresident) && roles.length > 1 && m.user_id !== userId ? (
                          <select
                            value={m.role_id}
                            onChange={e => handleChangeRole(m.user_id, e.target.value)}
                            style={{ fontSize: 13, color: "#5A5466", border: "none", background: "transparent", cursor: "pointer", outline: "none", padding: 0 }}
                          >
                            {roles.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
                          </select>
                        ) : (
                          <span style={{ fontSize: 13, color: "#5A5466" }}>{m.role_name}</span>
                        )}
                        <div style={{ display: "flex", justifyContent: "flex-end", alignItems: "center", gap: 10 }}>
                          {(isAdmin || isPresident) && m.user_id !== userId && (
                            isConfirming ? (
                              <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
                                <button onClick={() => handleRemoveMember(m.user_id)} style={{ width: 28, height: 28, borderRadius: 6, border: "none", background: "none", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", padding: 0, color: "#9F3030" }}><Check className="w-4 h-4" /></button>
                                <button onClick={() => setConfirmRemoveId(null)} style={{ width: 28, height: 28, borderRadius: 6, border: "none", background: "none", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", padding: 0, color: "#8A8497" }}><X className="w-4 h-4" /></button>
                              </div>
                            ) : (
                              <button
                                onClick={() => setConfirmRemoveId(m.user_id)}
                                style={{ display: "flex", alignItems: "center", justifyContent: "center", background: "none", border: "none", cursor: "pointer", padding: 2, color: "#8A8497", opacity: isHovered ? 1 : 0, transition: "opacity 0.15s" }}
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
              </>
            )}
          </div>
        ) : (
          <div className="hidden md:block px-10 py-8">
            <p style={{ fontFamily: "ui-monospace,'SF Mono',Menlo,monospace", fontSize: 11, fontWeight: 400, color: "#8A8497", textTransform: "uppercase", letterSpacing: "1.4px", marginBottom: 6 }}>
              TEAM SETTINGS · {team.name.toUpperCase()}
            </p>
            <p style={{ fontFamily: "var(--font-instrument-serif)", fontSize: 44, color: "#13101A", lineHeight: 1.1, marginBottom: 8 }}>Add members</p>
            <p style={{ fontSize: 15, color: "#5A5466", marginBottom: 32 }}>Select people from your ministry and assign them a role on this team.</p>
            {addMemberForm}
          </div>
        )}
      </div>

      {/* Sticky action footer — add members */}
      {showAddMember && selectedIds.size > 0 && (
        <div style={{ flexShrink: 0, background: "#FBF8F2", borderTop: "1px solid #E8E2D2" }}
          className="px-5 md:px-10 py-4 pb-8 md:pb-5"
        >
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
            <p style={{ fontSize: 14, color: "#5A5466", margin: 0 }}>
              <span style={{ fontWeight: 600, color: "#13101A" }}>{selectedIds.size}</span> {selectedIds.size === 1 ? "member" : "members"} selected
            </p>
            <button
              onClick={handleAddMembers}
              disabled={saving}
              style={{ padding: "10px 22px", background: "#2D0F2E", color: "#FBF8F2", borderRadius: 10, fontSize: 14, fontWeight: 600, border: "none", cursor: saving ? "not-allowed" : "pointer", opacity: saving ? 0.6 : 1 }}
            >
              {saving ? "Adding…" : `Add ${selectedIds.size} ${selectedIds.size === 1 ? "member" : "members"}`}
            </button>
          </div>
        </div>
      )}

    </AnimateIn>
  )
}

// ── QuickCreateTeamModal — 3-step design-system-aligned wizard ────────────────

// SVG paths for the icon picker grid (Lucide-stroked, 24×24 viewBox)
const WIZARD_ICON_OPTIONS = [
  { key: "users",    d: "M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M22 21v-2a4 4 0 0 0-3-3.87M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zm7-8a4 4 0 0 1 0 7.75" },
  { key: "music",    d: "M9 18V5l12-2v13M9 18a3 3 0 1 1-6 0 3 3 0 0 1 6 0zm12-2a3 3 0 1 1-6 0 3 3 0 0 1 6 0z" },
  { key: "book",     d: "M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2zM22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z" },
  { key: "slides",   d: "M3 5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2zM8 21h8M12 17v4" },
  { key: "chat",     d: "M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" },
  { key: "plan",     d: "M9 11l3 3L22 4M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" },
  { key: "calendar", d: "M3 6a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2zM3 10h18M8 2v4M16 2v4" },
  { key: "globe",    d: "M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zM2 12h20M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" },
  { key: "sparkle",  d: "M12 3v6M12 15v6M3 12h6M15 12h6M6.4 6.4l3.2 3.2M14.4 14.4l3.2 3.2M6.4 17.6l3.2-3.2M14.4 9.6l3.2-3.2" },
  { key: "clipboard",d: "M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2M9 2h6a1 1 0 0 1 1 1v2a1 1 0 0 1-1 1H9a1 1 0 0 1-1-1V3a1 1 0 0 1 1-1z" },
]

// Step 1 preset display data (icon keys, no emojis)
const WIZARD_PRESETS_DISPLAY = [
  { id: "board",     iconKey: "book",     label: "Student Org Board",   desc: "Event planning, finances, attendance, member management.", restricted: false, comingSoon: false },
  { id: "dgl",       iconKey: "users",    label: "Small Group Leaders", desc: "Discipleship groups, bible study, attendance.",            restricted: false, comingSoon: false },
  { id: "praise",    iconKey: "music",    label: "Praise Team",         desc: "Worship scheduling, set lists, slides, charts.",          restricted: false, comingSoon: true  },
  { id: "tech",      iconKey: "slides",   label: "Tech Team",           desc: "Slides, A/V, and worship set viewing.",                   restricted: false, comingSoon: true  },
  { id: "dg_praise", iconKey: "music",    label: "DG Praise Team",      desc: "Lightweight praise team for a discipleship group.",        restricted: true,  comingSoon: true  },
  { id: "one_time",  iconKey: "music",    label: "One-Time Event",      desc: "Praise team for a one-time event (SSO, Welcome Week…).",  restricted: true,  comingSoon: true  },
]

const WIZARD_MONO = {
  fontFamily: "ui-monospace,'SF Mono',Menlo,monospace" as const,
  fontSize: 11,
  letterSpacing: "0.12em",
  textTransform: "uppercase" as const,
  color: "#8A8497",
}

export function QuickCreateTeamModal({ userId, ministryId, isAdmin, isDGL, isPraiseTeamMember, onClose, onCreated }: {
  userId: string
  ministryId: string
  isAdmin?: boolean
  isDGL?: boolean
  isPraiseTeamMember?: boolean
  onClose: () => void
  onCreated: (teamId: string) => void
}) {
  const supabase = createClient()
  const [step, setStep] = useState<1 | 2 | 3>(1)
  const [name, setName] = useState("")
  const [iconKey, setIconKey] = useState("users")
  const [selectedPresetId, setSelectedPresetId] = useState<string | null>(null)
  const [roles, setRoles] = useState<Array<{ name: string; permissions: string[] }>>([])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // President picker state
  const [presidentPick, setPresidentPick] = useState<string | null>(null)
  const [presidentPick2, setPresidentPick2] = useState<string | null>(null)
  const [coPresidency, setCoPresidency] = useState(false)
  const [ministryMembers, setMinistryMembers] = useState<{ id: string; name: string }[]>([])

  // Index of the first "president" role — drives the required picker in step 3
  const presidentRoleIdx = roles.findIndex(r => r.name.toLowerCase().includes("president"))
  const defaultMemberRoleIdx = (() => {
    for (let i = roles.length - 1; i >= 0; i--) {
      if (!roles[i].name.toLowerCase().includes("president")) return i
    }
    return 0
  })()

  useEffect(() => {
    if (step !== 3 || presidentRoleIdx < 0) return
    supabase
      .from("profiles")
      .select("id, name")
      .eq("ministry_id", ministryId)
      .neq("id", userId)
      .order("name")
      .then(({ data }) => setMinistryMembers(data ?? []))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, presidentRoleIdx])

  function applyPreset(presetId: string) {
    const display = WIZARD_PRESETS_DISPLAY.find(p => p.id === presetId)
    const data    = TEAM_PRESETS.find(p => p.id === presetId)
    if (display) { if (!name.trim()) setName(display.label); setIconKey(display.iconKey) }
    if (data) setRoles(data.roles.map(r => ({ name: r.name, permissions: [...r.permissions] })))
    // Reset president picks when preset changes
    setPresidentPick(null); setPresidentPick2(null); setCoPresidency(false)
  }

  function toggleRolePermission(ri: number, perm: string) {
    setRoles(prev => prev.map((r, i) => {
      if (i !== ri) return r
      return { ...r, permissions: r.permissions.includes(perm) ? r.permissions.filter(p => p !== perm) : [...r.permissions, perm] }
    }))
  }

  function getVisiblePerms(): string[] {
    if (!selectedPresetId) return ALL_PERMISSIONS
    const map: Record<string, string[]> = { praise: TEAM_PERMISSION_FILTERS.praise, board: TEAM_PERMISSION_FILTERS.student_org, dgl: TEAM_PERMISSION_FILTERS.small_group }
    return map[selectedPresetId] ?? ALL_PERMISSIONS
  }

  async function handleCreate() {
    if (presidentRoleIdx >= 0 && (!presidentPick || (coPresidency && !presidentPick2))) {
      setError(coPresidency ? "Please select both co-presidents." : "Please select a president.")
      setSaving(false)
      return
    }
    setSaving(true); setError(null)
    const presetData = TEAM_PRESETS.find(p => p.id === selectedPresetId)
    const teamType = (presetData as { teamType?: string } | undefined)?.teamType ?? "standard"
    const { data: team, error: tErr } = await supabase
      .from("teams").insert({ name: name.trim(), icon: iconKey, ministry_id: ministryId, created_by: userId, team_type: teamType })
      .select("id").single()
    if (tErr || !team) { setError(tErr?.message ?? "Failed to create team."); setSaving(false); return }

    const createdRoleIds: string[] = []
    for (let i = 0; i < roles.length; i++) {
      const { data: role, error: rErr } = await supabase
        .from("team_roles").insert({ team_id: team.id, name: roles[i].name, permissions: roles[i].permissions })
        .select("id").single()
      if (rErr || !role) { setError(rErr?.message ?? "Failed to create role."); setSaving(false); return }
      createdRoleIds.push(role.id)
    }
    if (createdRoleIds.length === 0) {
      const { data: admin, error: aErr } = await supabase
        .from("team_roles").insert({ team_id: team.id, name: "Admin", permissions: ALL_PERMISSIONS })
        .select("id").single()
      if (aErr || !admin) { setError(aErr?.message ?? "Failed to create role."); setSaving(false); return }
      createdRoleIds.push(admin.id)
    }

    // Build member map: creator gets default non-president role; picked president(s) get president role
    const memberRoleMap = new Map<string, string>()
    const creatorRoleId = createdRoleIds[defaultMemberRoleIdx] ?? createdRoleIds[0]
    const presidentRoleId = presidentRoleIdx >= 0 ? (createdRoleIds[presidentRoleIdx] ?? createdRoleIds[0]) : createdRoleIds[0]
    memberRoleMap.set(userId, creatorRoleId)
    if (presidentPick) memberRoleMap.set(presidentPick, presidentRoleId)
    if (coPresidency && presidentPick2) memberRoleMap.set(presidentPick2, presidentRoleId)

    const { error: mErr } = await supabase.from("team_members").insert(
      Array.from(memberRoleMap.entries()).map(([user_id, role_id]) => ({ team_id: team.id, user_id, role_id, added_by: userId }))
    )
    if (mErr) { setError(mErr.message); setSaving(false); return }

    // Elevate all initial members to "leader" for DGL and Board teams
    if (selectedPresetId === "dgl" || selectedPresetId === "board") {
      await elevateToLeader(Array.from(memberRoleMap.keys()), ministryId)
    }

    // For DGL teams, auto-seed the semester roster with the picked presidents
    if (selectedPresetId === "dgl" && (presidentPick || presidentPick2)) {
      const rosterIds = [presidentPick, coPresidency ? presidentPick2 : null].filter(Boolean) as string[]
      await confirmDGLRosterAction(team.id, ministryId, rosterIds, getSemesterLabel(), userId)
    }

    onCreated(team.id)
  }

  const visiblePerms = getVisiblePerms()
  const selectedDisplay = WIZARD_PRESETS_DISPLAY.find(p => p.id === selectedPresetId)
  const topRoleName = roles[0]?.name ?? "Admin"

  const stepTitles = { 1: "Choose a template", 2: "Name your team", 3: "Review & create" } as const

  return (
    <div
      className="fixed inset-0 z-[80] flex items-center justify-center animate-backdrop-in"
      style={{ background: "rgba(20,16,26,0.32)" }}
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className="animate-dialog-in" style={{ width: 640, maxHeight: "92vh", display: "flex", flexDirection: "column", background: "#FBF8F2", border: "1px solid #E2DDCF", borderRadius: 18, boxShadow: "0 30px 80px rgba(20,16,26,0.18)", overflow: "hidden" }}>

        {/* Modal header */}
        <div style={{ padding: "22px 28px 0", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          {step > 1 ? (
            <button onClick={() => setStep(s => (s - 1) as 1 | 2 | 3)} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, color: "#5A5466", background: "none", border: "none", cursor: "pointer", padding: 0, fontFamily: "inherit" }}>
              <ArrowLeft style={{ width: 14, height: 14 }} /> Back
            </button>
          ) : <span />}
          <button onClick={onClose} style={{ width: 28, height: 28, borderRadius: 8, border: "1px solid #E2DDCF", background: "transparent", color: "#5A5466", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <X style={{ width: 14, height: 14 }} />
          </button>
        </div>

        <div style={{ padding: "12px 32px 0", display: "flex", alignItems: "baseline", justifyContent: "space-between" }}>
          <div>
            <div style={WIZARD_MONO}>NEW TEAM</div>
            <h2 style={{ fontFamily: "var(--font-instrument-serif)", fontSize: 34, margin: "6px 0 0", letterSpacing: "-0.4px", color: "#13101A", fontWeight: 400, lineHeight: 1.1 }}>
              {stepTitles[step]}
            </h2>
          </div>
          <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 6 }}>
            <span style={{ ...WIZARD_MONO, fontSize: 10, letterSpacing: "0.08em" }}>STEP {step} OF 3</span>
            <div style={{ display: "flex", gap: 4 }}>
              {[1, 2, 3].map(i => <span key={i} style={{ width: 22, height: 3, borderRadius: 99, background: i <= step ? "#3E1540" : "#E2DDCF" }} />)}
            </div>
          </div>
        </div>

        {/* Body */}
        <div style={{ flex: 1, overflowY: "auto", padding: "24px 32px 28px" }}>

          {/* ── Step 1: Choose a template ── */}
          {step === 1 && (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {WIZARD_PRESETS_DISPLAY.filter(p => {
                if (p.restricted) return isAdmin || isDGL || isPraiseTeamMember
                return !!isAdmin
              }).map(p => {
                const on = selectedPresetId === p.id
                const roleCount = TEAM_PRESETS.find(t => t.id === p.id)?.roles.length ?? 0
                const iconOpt = WIZARD_ICON_OPTIONS.find(o => o.key === p.iconKey)
                if (p.comingSoon) {
                  return (
                    <div key={p.id} style={{
                      display: "flex", alignItems: "center", gap: 14, padding: "16px 18px", borderRadius: 12,
                      border: "1px solid #E8E2D2", background: "#F8F6F2",
                      opacity: 0.55, cursor: "not-allowed",
                    }}>
                      <span style={{ width: 40, height: 40, borderRadius: 10, flexShrink: 0, background: "#EDE9E0", color: "#A09A8C", display: "grid", placeItems: "center" }}>
                        {iconOpt && <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d={iconOpt.d}/></svg>}
                      </span>
                      <span style={{ flex: 1, minWidth: 0 }}>
                        <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
                          <span style={{ fontSize: 14, fontWeight: 600, color: "#8A8497" }}>{p.label}</span>
                          <span style={{ fontSize: 10, padding: "2px 8px", borderRadius: 999, background: "#ECE8DE", color: "#8A8497", letterSpacing: "0.4px", textTransform: "uppercase" as const, fontWeight: 600 }}>Coming soon</span>
                        </span>
                        <span style={{ display: "block", fontSize: 12.5, color: "#C4C0B0", marginTop: 3 }}>{p.desc}</span>
                      </span>
                    </div>
                  )
                }
                return (
                  <button key={p.id} onClick={() => setSelectedPresetId(p.id)} style={{
                    display: "flex", alignItems: "center", gap: 14, padding: "16px 18px", borderRadius: 12,
                    textAlign: "left" as const, width: "100%", cursor: "pointer", fontFamily: "inherit",
                    border: "1px solid " + (on ? "#3E1540" : "#E8E2D2"),
                    background: on ? "#F6F2E8" : "#FBF8F2",
                    boxShadow: on ? "inset 0 0 0 1px #3E1540" : "none",
                    transition: "border-color 0.1s, background 0.1s",
                  }}>
                    <span style={{ width: 40, height: 40, borderRadius: 10, flexShrink: 0, background: on ? "#3E1540" : "#F1ECDE", color: on ? "#FBF8F2" : "#3E1540", display: "grid", placeItems: "center" }}>
                      {iconOpt && <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d={iconOpt.d}/></svg>}
                    </span>
                    <span style={{ flex: 1, minWidth: 0 }}>
                      <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <span style={{ fontSize: 14, fontWeight: 600, color: "#13101A" }}>{p.label}</span>
                        <span style={{ fontSize: 10, padding: "2px 8px", borderRadius: 999, background: "#F1ECDE", color: "#8A8497", letterSpacing: "0.4px", textTransform: "uppercase" as const, fontWeight: 500 }}>{roleCount} roles</span>
                      </span>
                      <span style={{ display: "block", fontSize: 12.5, color: "#5A5466", marginTop: 3 }}>{p.desc}</span>
                    </span>
                    <span style={{ width: 18, height: 18, borderRadius: 99, flexShrink: 0, border: "1.5px solid " + (on ? "#3E1540" : "#C4C0B0"), background: on ? "#3E1540" : "transparent", display: "grid", placeItems: "center" }}>
                      {on && <span style={{ width: 7, height: 7, borderRadius: 99, background: "#FBF8F2" }} />}
                    </span>
                  </button>
                )
              })}
            </div>
          )}

          {/* ── Step 2: Name your team ── */}
          {step === 2 && (
            <>
              {/* Live preview tile */}
              <div style={{ display: "flex", alignItems: "center", gap: 16, padding: "18px 22px", border: "1px solid #E8E2D2", borderRadius: 14, background: "#F6F2E8", marginBottom: 28 }}>
                <PlanLineIcon iconKey={iconKey} size={52} bg="#3E1540" fg="#FBF8F2" />
                <div>
                  <div style={WIZARD_MONO}>PREVIEW</div>
                  <div style={{ fontFamily: "var(--font-instrument-serif)", fontSize: 22, color: "#13101A", marginTop: 4, letterSpacing: "-0.2px", fontWeight: 400, lineHeight: 1.1 }}>
                    {name || selectedDisplay?.label || "Your Team"}
                  </div>
                  <div style={{ fontSize: 12, color: "#8A8497", marginTop: 3 }}>
                    {roles.length} role{roles.length !== 1 ? "s" : ""} · You will be {topRoleName}
                  </div>
                </div>
              </div>

              <label style={{ display: "block", marginBottom: 24 }}>
                <div style={WIZARD_MONO}>TEAM NAME</div>
                <input
                  autoFocus
                  value={name}
                  onChange={e => { setName(e.target.value); setError(null) }}
                  onKeyDown={e => { if (e.key === "Escape") onClose() }}
                  placeholder={selectedDisplay?.label ?? "e.g. Media Team"}
                  style={{
                    width: "100%", padding: "11px 14px", marginTop: 8,
                    border: "1px solid " + (error ? "#9F3030" : "#E2DDCF"), borderRadius: 10,
                    background: "#FBF8F2", fontSize: 15, fontFamily: "inherit", color: "#13101A",
                    outline: "none", boxSizing: "border-box" as const,
                  }}
                />
                {error && <p style={{ fontSize: 12, color: "#9F3030", marginTop: 6 }}>{error}</p>}
              </label>

              <div>
                <div style={WIZARD_MONO}>ICON</div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(10, 1fr)", gap: 8, marginTop: 10 }}>
                  {WIZARD_ICON_OPTIONS.map(opt => (
                    <button key={opt.key} onClick={() => setIconKey(opt.key)} style={{
                      aspectRatio: "1", borderRadius: 10, cursor: "pointer", padding: 8,
                      border: "1px solid " + (iconKey === opt.key ? "#3E1540" : "#E2DDCF"),
                      background: iconKey === opt.key ? "#3E1540" : "#FBF8F2",
                      color: iconKey === opt.key ? "#FBF8F2" : "#5A5466",
                      boxShadow: iconKey === opt.key ? "0 0 0 3px #F6F2E8 inset" : "none",
                      display: "grid", placeItems: "center",
                      transition: "border-color 0.1s, background 0.1s",
                    }}>
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                        <path d={opt.d}/>
                      </svg>
                    </button>
                  ))}
                </div>
                <p style={{ fontSize: 11.5, color: "#8A8497", marginTop: 8 }}>One small, monochromatic mark — keeps the sidebar legible.</p>
              </div>
            </>
          )}

          {/* ── Step 3: Review & create ── */}
          {step === 3 && (
            <>
              {/* Identity summary */}
              <div style={{ display: "flex", alignItems: "center", gap: 16, padding: "18px 22px", border: "1px solid #E8E2D2", borderRadius: 14, background: "#FBF8F2", marginBottom: 24 }}>
                <PlanLineIcon iconKey={iconKey} size={52} bg="#3E1540" fg="#FBF8F2" />
                <div style={{ flex: 1 }}>
                  <div style={{ fontFamily: "var(--font-instrument-serif)", fontSize: 22, color: "#13101A", letterSpacing: "-0.2px", fontWeight: 400 }}>{name}</div>
                  <div style={{ fontSize: 12, color: "#8A8497", marginTop: 2 }}>
                    {selectedDisplay ? `Based on ${selectedDisplay.label}` : "Custom"} · {roles.length} role{roles.length !== 1 ? "s" : ""}
                  </div>
                </div>
                <button onClick={() => setStep(2)} style={{ padding: "8px 14px", borderRadius: 10, border: "1px solid #E2DDCF", background: "transparent", color: "#5A5466", fontSize: 13, cursor: "pointer", fontFamily: "inherit", display: "flex", alignItems: "center", gap: 6 }}>
                  <Edit3 style={{ width: 13, height: 13 }} /> Edit
                </button>
              </div>

              {/* ── President picker (required when preset has a president role) ── */}
              {presidentRoleIdx >= 0 && (
                <div style={{ border: "2px solid rgba(62,21,64,0.2)", borderRadius: 14, background: "#F8F5FF", padding: "16px 18px", marginBottom: 24 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
                    <span style={{ ...WIZARD_MONO, color: "#3E1540" }}>{roles[presidentRoleIdx].name}</span>
                    <span style={{ fontSize: 10, padding: "2px 8px", borderRadius: 999, background: "#FEE2E2", color: "#9F3030", border: "1px solid #FECACA", fontWeight: 600, letterSpacing: "0.3px", textTransform: "uppercase" as const }}>Required</span>
                    <div style={{ marginLeft: "auto" }}>
                      <button
                        type="button"
                        onClick={() => { setCoPresidency(v => !v); setPresidentPick2(null) }}
                        style={{ display: "flex", alignItems: "center", gap: 6, background: "none", border: "none", cursor: "pointer", fontSize: 12, color: "#5A5466", fontFamily: "inherit", padding: 0 }}
                      >
                        <span style={{ width: 14, height: 14, borderRadius: 3, border: `1px solid ${coPresidency ? "#3E1540" : "#C4C4C4"}`, background: coPresidency ? "#3E1540" : "transparent", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, transition: "all 0.1s" }}>
                          {coPresidency && <Check style={{ width: 9, height: 9, color: "#fff" }} />}
                        </span>
                        Co-presidency
                      </button>
                    </div>
                  </div>
                  <p style={{ fontSize: 12, color: "#5A5466", marginBottom: 10, lineHeight: 1.5 }}>
                    You will remain in your ministry role. Pick who holds this position from your ministry.
                  </p>
                  {/* First president */}
                  {presidentPick ? (
                    <div style={{ display: "flex", alignItems: "center", gap: 10, background: "#3E1540", borderRadius: 10, padding: "10px 14px", marginBottom: coPresidency ? 8 : 0 }}>
                      <span style={{ flex: 1, fontSize: 14, fontWeight: 500, color: "#F6F4EF" }}>{ministryMembers.find(m => m.id === presidentPick)?.name ?? "Unknown"}</span>
                      <button onClick={() => setPresidentPick(null)} style={{ background: "none", border: "none", cursor: "pointer", color: "rgba(246,244,239,0.6)", padding: 0, display: "flex" }}>
                        <X style={{ width: 14, height: 14 }} />
                      </button>
                    </div>
                  ) : (
                    <select
                      value=""
                      onChange={e => { if (e.target.value) setPresidentPick(e.target.value) }}
                      style={{ width: "100%", padding: "10px 12px", borderRadius: 10, border: "1px solid #E2DDCF", background: "#fff", fontSize: 13, color: "#13101A", fontFamily: "inherit", marginBottom: coPresidency ? 8 : 0 }}
                    >
                      <option value="" disabled>Select a person…</option>
                      {ministryMembers.filter(m => m.id !== presidentPick2).map(m => (
                        <option key={m.id} value={m.id}>{m.name}</option>
                      ))}
                    </select>
                  )}
                  {/* Second president (co-presidency) */}
                  {coPresidency && (
                    presidentPick2 ? (
                      <div style={{ display: "flex", alignItems: "center", gap: 10, background: "#3E1540", borderRadius: 10, padding: "10px 14px" }}>
                        <span style={{ flex: 1, fontSize: 14, fontWeight: 500, color: "#F6F4EF" }}>{ministryMembers.find(m => m.id === presidentPick2)?.name ?? "Unknown"}</span>
                        <button onClick={() => setPresidentPick2(null)} style={{ background: "none", border: "none", cursor: "pointer", color: "rgba(246,244,239,0.6)", padding: 0, display: "flex" }}>
                          <X style={{ width: 14, height: 14 }} />
                        </button>
                      </div>
                    ) : (
                      <select
                        value=""
                        onChange={e => { if (e.target.value) setPresidentPick2(e.target.value) }}
                        style={{ width: "100%", padding: "10px 12px", borderRadius: 10, border: "1px solid #E2DDCF", background: "#fff", fontSize: 13, color: "#13101A", fontFamily: "inherit" }}
                      >
                        <option value="" disabled>Select second person…</option>
                        {ministryMembers.filter(m => m.id !== presidentPick).map(m => (
                          <option key={m.id} value={m.id}>{m.name}</option>
                        ))}
                      </select>
                    )
                  )}
                </div>
              )}

              {/* Roles header */}
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
                <div style={WIZARD_MONO}>ROLES · {roles.length}</div>
                {selectedPresetId === "custom" && (
                  <button onClick={() => setRoles(prev => [...prev, { name: "New Role", permissions: [] }])} style={{ background: "none", border: "none", color: "#3E1540", fontSize: 13, fontFamily: "inherit", cursor: "pointer", display: "flex", alignItems: "center", gap: 4 }}>
                    <Plus style={{ width: 13, height: 13 }} /> Add role
                  </button>
                )}
              </div>

              {selectedPresetId === "custom" && roles.length === 0 && (
                <button onClick={() => setRoles([{ name: "New Role", permissions: [] }])} style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 6, width: "100%", padding: "12px 0", borderRadius: 10, border: "1px dashed #C4C0B0", background: "none", cursor: "pointer", fontSize: 13, color: "#8A8497", fontFamily: "inherit" }}>
                  <Plus style={{ width: 13, height: 13 }} /> Add first role
                </button>
              )}

              {roles.map((role, ri) => (
                <div key={ri} style={{ padding: "14px 0", borderTop: ri > 0 ? "1px solid #EFE9DA" : "none" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
                    {selectedPresetId === "custom" ? (
                      <input
                        value={role.name}
                        onChange={e => setRoles(prev => prev.map((r, i) => i === ri ? { ...r, name: e.target.value } : r))}
                        style={{ fontFamily: "var(--font-instrument-serif)", fontSize: 18, fontWeight: 400, color: "#13101A", border: "none", background: "transparent", outline: "none", padding: 0, flex: 1 }}
                      />
                    ) : (
                      <span style={{ fontFamily: "var(--font-instrument-serif)", fontSize: 18, color: "#13101A" }}>{role.name}</span>
                    )}
                    {ri === defaultMemberRoleIdx && <span style={{ fontSize: 10, padding: "2px 8px", borderRadius: 999, background: "#2D0F2E", color: "#FBF8F2", letterSpacing: "0.4px", textTransform: "uppercase" as const, fontWeight: 600 }}>You</span>}
                    {ri === presidentRoleIdx && presidentRoleIdx !== defaultMemberRoleIdx && presidentPick && <span style={{ fontSize: 10, padding: "2px 8px", borderRadius: 999, background: "#3E1540", color: "#FBF8F2", letterSpacing: "0.4px", textTransform: "uppercase" as const, fontWeight: 600 }}>{ministryMembers.find(m => m.id === presidentPick)?.name?.split(" ")[0] ?? "Selected"}</span>}
                    <span style={{ flex: 1 }} />
                    <span style={{ fontSize: 12, color: "#8A8497" }}>{role.permissions.length} permission{role.permissions.length !== 1 ? "s" : ""}</span>
                    {selectedPresetId === "custom" && (
                      <button onClick={() => setRoles(prev => prev.filter((_, i) => i !== ri))} style={{ width: 26, height: 26, borderRadius: 6, border: "none", background: "transparent", color: "#8A8497", cursor: "pointer", display: "grid", placeItems: "center" }}>
                        <X style={{ width: 13, height: 13 }} />
                      </button>
                    )}
                  </div>
                  <div style={{ display: "flex", flexWrap: "wrap" as const, gap: 6 }}>
                    {visiblePerms.map(perm => {
                      const active = role.permissions.includes(perm)
                      return (
                        <button key={perm} onClick={() => toggleRolePermission(ri, perm)} style={{
                          padding: "5px 11px", borderRadius: 999, fontSize: 12, cursor: "pointer", fontFamily: "inherit",
                          border: "1px solid " + (active ? "#C8C0D8" : "#E8E2D2"),
                          background: active ? "#F1ECDE" : "#FBF8F2",
                          color: active ? "#2D0F2E" : "#A09A8C",
                          transition: "all 0.1s",
                        }}>
                          {PERMISSION_LABELS[perm] ?? perm}
                        </button>
                      )
                    })}
                  </div>
                </div>
              ))}

              {error && <p style={{ fontSize: 12, color: "#9F3030", marginTop: 16 }}>{error}</p>}
            </>
          )}
        </div>

        {/* Footer */}
        <div style={{ padding: "16px 28px 22px", borderTop: "1px solid #E8E2D2", display: "flex", alignItems: "center", justifyContent: "space-between", background: "#FBF8F2" }}>
          {step === 1 && (
            <>
              <span style={{ fontSize: 12, color: "#8A8497" }}>Templates pre-fill icon, roles, and permissions. You can change anything next.</span>
              <button
                disabled={!selectedPresetId}
                onClick={() => { if (selectedPresetId) { applyPreset(selectedPresetId); setStep(2) } }}
                style={{ padding: "11px 22px", background: "#2D0F2E", color: "#FBF8F2", border: "none", borderRadius: 10, fontSize: 14, fontWeight: 500, fontFamily: "inherit", display: "flex", alignItems: "center", gap: 8, cursor: selectedPresetId ? "pointer" : "not-allowed", opacity: selectedPresetId ? 1 : 0.45 }}
              >
                Continue <ChevronRight style={{ width: 14, height: 14 }} />
              </button>
            </>
          )}
          {step === 2 && (
            <>
              <span style={{ fontSize: 12, color: "#8A8497" }}>
                Based on <span style={{ color: "#2D0F2E", fontWeight: 500 }}>{selectedDisplay?.label ?? "custom"}</span>
              </span>
              <button
                onClick={() => { if (!name.trim()) { setError("Team name is required."); return }; setError(null); setStep(3) }}
                style={{ padding: "11px 22px", background: "#2D0F2E", color: "#FBF8F2", border: "none", borderRadius: 10, fontSize: 14, fontWeight: 500, fontFamily: "inherit", cursor: "pointer", display: "flex", alignItems: "center", gap: 8 }}
              >
                Continue <ChevronRight style={{ width: 14, height: 14 }} />
              </button>
            </>
          )}
          {step === 3 && (
            <>
              <span style={{ fontSize: 12, color: "#8A8497" }}>You can edit roles & permissions any time from team settings.</span>
              <button
                onClick={handleCreate}
                disabled={saving || (presidentRoleIdx >= 0 && (!presidentPick || (coPresidency && !presidentPick2)))}
                style={{ padding: "11px 24px", background: "#2D0F2E", color: "#FBF8F2", border: "none", borderRadius: 10, fontSize: 14, fontWeight: 500, fontFamily: "inherit", cursor: (saving || (presidentRoleIdx >= 0 && (!presidentPick || (coPresidency && !presidentPick2)))) ? "not-allowed" : "pointer", opacity: (saving || (presidentRoleIdx >= 0 && (!presidentPick || (coPresidency && !presidentPick2)))) ? 0.45 : 1, display: "flex", alignItems: "center", gap: 8 }}
              >
                {saving ? "Creating…" : <><Check style={{ width: 14, height: 14 }} /> Create team</>}
              </button>
            </>
          )}
        </div>

      </div>
    </div>
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
        <div style={{ fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace", fontSize: 10, letterSpacing: "0.12em", color: "#8A8497", textTransform: "uppercase" as const }}>{eyebrow}</div>
        <h2 style={{ fontFamily: "var(--font-instrument-serif)", fontSize: 22, fontWeight: 400, color: "#13101A", margin: "4px 0 0", letterSpacing: "-0.015em", lineHeight: 1.15 }}>{title}</h2>
        {sub && <div style={{ fontSize: 13, color: "#5A5466", marginTop: 3 }}>{sub}</div>}
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
  isDesktopView,
  desktopSection,
}: {
  teamId: string
  ministryId: string
  userId: string
  isPresident: boolean
  isPastor: boolean
  praiseTeamId?: string | null
  onOpenChat?: (id: string, name: string) => void
  isDesktopView?: boolean
  desktopSection?: string
}) {
  const supabase = createClient()
  const router = useRouter()
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
    const sp = new URLSearchParams(window.location.search)
    sp.set("sgltab", t)
    router.replace(`/home?${sp.toString()}`, { scroll: false })
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
        </TabPageHeader>
      )}

      {/* Mobile sub-tab switcher */}
      {!isDesktopView && (
        <div style={{ marginBottom: 24 }}>
          <PlanSubTabStrip
            tabs={validTabs.map(k => ({
              key: k,
              label: k === "home" ? "Home" : k === "schedule" ? "Schedule" : "Bible Study",
            }))}
            active={activeSubTab}
            onChange={t => setActiveSubTabAndUrl(t as SGLTab)}
          />
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
                <button
                  onClick={() => handleRosterRenewal("keep")}
                  disabled={renewalLoading}
                  style={{ flex: 1, padding: "8px 0", background: "#3E1540", color: "#F6F4EF", border: "none", borderRadius: 9, fontSize: 13, fontWeight: 600, cursor: renewalLoading ? "not-allowed" : "pointer", opacity: renewalLoading ? 0.6 : 1, fontFamily: "inherit" }}
                >
                  Keep roster
                </button>
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
              <div className="mt-4 rounded-[14px] border border-dashed border-[#E8E2D2] p-6 text-center" style={{ background: "#FBF8F2" }}>
                <p className="text-[13px] text-[#8A8497]">Your schedule hasn&apos;t been published yet.</p>
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
                <div className="mt-4 rounded-[14px] border border-[#E8E2D2] overflow-hidden" style={{ background: "#FBF8F2" }}>
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
                          borderTop: i === 0 ? "none" : "1px solid #EFE9DA",
                          borderLeft: isNext ? "3px solid #3E1540" : "3px solid transparent",
                          background: isNext ? "#F6F2E8" : "transparent",
                          opacity: isPast ? 0.4 : 1,
                          transition: "opacity 0.15s",
                        }}
                      >
                        <div className="flex-shrink-0 flex flex-col items-center justify-center" style={{ width: 48, height: 48, borderRadius: 10, background: isNext ? "#EDE5F5" : "#F6F2E8", border: `1px solid ${isNext ? "#C9B8D4" : "#E8E2D2"}` }}>
                          <span style={{ fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace", fontSize: 9, letterSpacing: "0.1em", color: "#8A8497", textTransform: "uppercase" as const }}>{dow}</span>
                          <span style={{ fontFamily: "var(--font-instrument-serif)", fontSize: 22, color: isNext ? "#3E1540" : "#2D0F2E", lineHeight: 1, marginTop: 1 }}>{dayNum}</span>
                        </div>
                        <div className="flex-1 min-w-0">
                          <p style={{ fontFamily: "var(--font-instrument-serif)", fontSize: 19, color: isPast ? "#8A8497" : "#13101A", letterSpacing: "-0.01em", textDecoration: isPast ? "line-through" : "none" }}>{DGL_SLOT_LABELS[a.slot]}</p>
                          <p style={{ fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace", fontSize: 10, letterSpacing: "0.1em", color: "#8A8497", textTransform: "uppercase" as const, marginTop: 3 }}>
                            {subLabel}
                          </p>
                        </div>
                        {isNext && (
                          <span style={{ fontSize: 10, fontWeight: 600, color: "#3E1540", background: "#EDE5F5", border: "1px solid #C9B8D4", padding: "2px 8px", borderRadius: 999, letterSpacing: "0.05em", flexShrink: 0 }}>UP NEXT</span>
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
                    style={{ padding: "5px 12px", borderRadius: 8, border: "1px solid #E2DDCF", background: "transparent", color: "#5A5466", fontSize: 12, fontFamily: "inherit", cursor: "pointer" }}
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
                  <p className="text-[14px] font-semibold text-[#13101A] mb-1">No roster yet</p>
                  <p className="text-[13px] text-[#8A8497] mb-3">Add DGLs to the {semesterLabel} roster.</p>
                  <span style={{ fontSize: 13, fontWeight: 600, color: "#3E1540" }}>+ Add DGLs</span>
                </button>
              )}

              {/* Add / Edit mode — member picker */}
              {(rosterAddMode || editingRoster) && (
                <div className="mt-4 rounded-[14px] border border-[#E8E2D2] overflow-hidden" style={{ background: "#FBF8F2" }}>
                  <div className="px-4 pt-4 pb-3 border-b border-[#EFE9DA]">
                    <input
                      type="text"
                      placeholder="Search members…"
                      value={memberSearch}
                      onChange={e => setMemberSearch(e.target.value)}
                      style={{ width: "100%", border: "1px solid #E2DDCF", borderRadius: 10, padding: "8px 12px", fontSize: 13, fontFamily: "var(--font-inter)", outline: "none", background: "#FBF8F2" }}
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
                            className={`flex items-center gap-3 px-4 py-3 cursor-pointer ${i < arr.length - 1 ? "border-b border-[#EFE9DA]" : ""}`}
                            style={{ background: selected ? "rgba(62,21,64,0.04)" : "transparent" }}
                          >
                            <div className="w-7 h-7 rounded-full flex items-center justify-center text-[12px] font-semibold flex-shrink-0" style={{ background: "var(--plum)", color: "var(--cream)" }}>
                              {getInitials(m.name)}
                            </div>
                            <p className="flex-1 text-[13px] text-[#13101A]">{m.name}</p>
                            {selected && <Check style={{ width: 14, height: 14, color: "#3E1540" }} />}
                          </div>
                        )
                      })}
                  </div>
                  <div className="flex gap-2 px-4 py-3 border-t border-[#EFE9DA]">
                    <button
                      onClick={() => { setRosterAddMode(false); setEditingRoster(false); setPendingRosterIds(new Set()); setMemberSearch("") }}
                      style={{ flex: 1, padding: "8px 0", background: "transparent", color: "#5A5466", border: "1px solid #E2DDCF", borderRadius: 9, fontSize: 13, fontWeight: 500, cursor: "pointer", fontFamily: "inherit" }}
                    >
                      Cancel
                    </button>
                    <button
                      onClick={handleConfirmRoster}
                      disabled={confirmingRoster || pendingRosterIds.size === 0}
                      style={{ flex: 1, padding: "8px 0", background: "#3E1540", color: "#F6F4EF", border: "none", borderRadius: 9, fontSize: 13, fontWeight: 600, cursor: (confirmingRoster || pendingRosterIds.size === 0) ? "not-allowed" : "pointer", opacity: (confirmingRoster || pendingRosterIds.size === 0) ? 0.6 : 1, fontFamily: "inherit" }}
                    >
                      {confirmingRoster ? "Confirming…" : `Confirm (${pendingRosterIds.size})`}
                    </button>
                  </div>
                </div>
              )}

              {/* Confirmed roster list */}
              {rosterStatus?.confirmed && !rosterAddMode && !editingRoster && (
                <div className="mt-4 rounded-[14px] border border-[#E8E2D2] overflow-hidden" style={{ background: "#FBF8F2" }}>
                  {rosterMembers.map((m, i) => (
                    <div key={m.user_id} className="flex items-center gap-3 px-4 py-3" style={{ borderTop: i === 0 ? "none" : "1px solid #EFE9DA" }}>
                      <div className="w-7 h-7 rounded-full flex items-center justify-center text-[11px] font-semibold flex-shrink-0" style={{ background: "var(--plum)", color: "var(--cream)" }}>
                        {getInitials(m.name)}
                      </div>
                      <p className="flex-1 text-[14px] text-[#13101A]">{m.name}</p>
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
                      style={{ padding: "5px 12px", borderRadius: 8, border: "1px solid #E2DDCF", background: "transparent", color: "#5A5466", fontSize: 12, fontFamily: "inherit", cursor: "pointer" }}
                    >Cancel</button>
                  ) : (
                    <button
                      onClick={() => { setEditingGroupId(group.id); setEditError(null) }}
                      style={{ padding: "5px 12px", borderRadius: 8, border: "1px solid #E2DDCF", background: "transparent", color: "#3E1540", fontSize: 12, fontFamily: "inherit", cursor: "pointer" }}
                    >Edit</button>
                  )}
                />
                <div className="mt-4 rounded-[14px] border border-[#E8E2D2] overflow-hidden" style={{ background: "#FBF8F2" }}>
                  {members.length === 0 && !pendingAddMemberIds.size ? (
                    <div className="px-4 py-5 text-center"><p className="text-[13px] text-[#8A8497]">No members yet.</p></div>
                  ) : (
                    <>
                      {members.map((m, i) => {
                        const mealDone = m.meal_taken && m.meal_semester === semester
                        const isPendingRemove = pendingRemoveMemberIds.has(m.user_id)
                        const isConfirming = confirmRemoveSgMemberId === m.user_id
                        return (
                          <div key={m.id} className="flex items-center gap-3 px-4 py-3" style={{ borderTop: i === 0 ? "none" : "1px solid #EFE9DA", background: isPendingRemove || isConfirming ? "#FDF8F8" : "transparent" }}>
                            <div className="w-7 h-7 rounded-full flex items-center justify-center text-[11px] font-semibold flex-shrink-0" style={{ background: "var(--plum)", color: "var(--cream)" }}>{getInitials(m.name)}</div>
                            <p className={`flex-1 text-[14px] ${isPendingRemove ? "line-through text-[#9F3030]" : "text-[#13101A]"}`}>{m.name}</p>
                            {isEditing ? (
                              isPendingRemove ? (
                                <button onClick={() => setPendingRemoveMemberIds(prev => { const n = new Set(prev); n.delete(m.user_id); return n })} style={{ fontSize: 11, fontWeight: 600, color: "#8A8497", background: "none", border: "none", cursor: "pointer", padding: "2px 6px" }}>Undo</button>
                              ) : isConfirming ? (
                                <div style={{ display: "flex", gap: 8 }}>
                                  <button onClick={() => { setPendingRemoveMemberIds(prev => new Set([...prev, m.user_id])); setConfirmRemoveSgMemberId(null) }} style={{ fontSize: 11, fontWeight: 600, color: "#9F3030", background: "none", border: "none", cursor: "pointer", padding: "2px 6px" }}>Remove</button>
                                  <button onClick={() => setConfirmRemoveSgMemberId(null)} style={{ fontSize: 11, fontWeight: 500, color: "#8A8497", background: "none", border: "none", cursor: "pointer", padding: "2px 6px" }}>Keep</button>
                                </div>
                              ) : (
                                <button onClick={() => setConfirmRemoveSgMemberId(m.user_id)} style={{ display: "flex", alignItems: "center", justifyContent: "center", background: "none", border: "none", cursor: "pointer", padding: 4, color: "#C4C4C4" }}><X style={{ width: 13, height: 13 }} /></button>
                              )
                            ) : (
                              <button onClick={() => toggleMeal(m)} style={{ padding: "4px 10px", borderRadius: 8, cursor: "pointer", border: mealDone ? "none" : "1px solid #E2DDCF", background: mealDone ? "#EDE5F0" : "transparent", fontSize: 11, fontWeight: 600, color: mealDone ? "#3E1540" : "#8A8497", letterSpacing: "0.03em", textTransform: "uppercase" as const }}>
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
                          <div key={uid} className="flex items-center gap-3 px-4 py-3 border-t border-[#EFE9DA]" style={{ background: "rgba(62,21,64,0.03)" }}>
                            <div className="w-7 h-7 rounded-full flex items-center justify-center text-[11px] font-semibold flex-shrink-0" style={{ background: "var(--plum)", color: "var(--cream)" }}>{getInitials(person.name)}</div>
                            <p className="flex-1 text-[14px] text-[#13101A]">{person.name}</p>
                            <span style={{ fontSize: 9, fontWeight: 600, letterSpacing: "0.05em", color: "#3E1540", background: "rgba(62,21,64,0.06)", border: "1px solid rgba(62,21,64,0.15)", borderRadius: 4, padding: "1px 5px", marginRight: 4 }}>ADDING</span>
                            <button onClick={() => setPendingAddMemberIds(prev => { const n = new Set(prev); n.delete(uid); return n })} style={{ display: "flex", alignItems: "center", justifyContent: "center", background: "none", border: "none", cursor: "pointer", padding: 4, color: "#C4C4C4" }}><X style={{ width: 13, height: 13 }} /></button>
                          </div>
                        )
                      })}
                    </>
                  )}
                  {isEditing && (
                    <div className="border-t border-[#EFE9DA]">
                      {showSgAddPicker ? (
                        <div className="p-3">
                          <input type="text" placeholder="Search members…" value={sgAddPickerSearch} onChange={e => setSgAddPickerSearch(e.target.value)} autoFocus style={{ width: "100%", border: "1px solid #E2DDCF", borderRadius: 10, padding: "7px 12px", fontSize: 13, fontFamily: "var(--font-inter)", outline: "none", background: "#FBF8F2", marginBottom: 6 }} />
                          <div style={{ maxHeight: 180, overflowY: "auto", borderRadius: 10, border: "1px solid #E8E2D2", background: "#FBF8F2" }}>
                            {addableMembers.length === 0 ? (
                              <div className="px-4 py-4 text-center"><p style={{ fontSize: 12, color: "#8A8497" }}>No members to add</p></div>
                            ) : addableMembers.map((p, i) => (
                              <div key={p.id} onClick={() => { setPendingAddMemberIds(prev => new Set([...prev, p.id])); setSgAddPickerSearch(""); setShowSgAddPicker(false) }} className={`flex items-center gap-3 px-4 py-3 cursor-pointer ${i < addableMembers.length - 1 ? "border-b border-[#EFE9DA]" : ""}`}>
                                <div className="w-7 h-7 rounded-full flex items-center justify-center text-[11px] font-semibold flex-shrink-0" style={{ background: "var(--plum)", color: "var(--cream)" }}>{getInitials(p.name)}</div>
                                <p style={{ fontSize: 13, color: "#13101A" }}>{p.name}</p>
                              </div>
                            ))}
                          </div>
                          <button onClick={() => { setShowSgAddPicker(false); setSgAddPickerSearch("") }} style={{ marginTop: 6, fontSize: 12, color: "#8A8497", background: "none", border: "none", cursor: "pointer", padding: 0 }}>Cancel</button>
                        </div>
                      ) : (
                        <button onClick={() => setShowSgAddPicker(true)} style={{ width: "100%", padding: "12px 16px", display: "flex", alignItems: "center", gap: 8, background: "transparent", border: "none", cursor: "pointer", color: "#3E1540", fontSize: 13, fontWeight: 500, fontFamily: "var(--font-inter)" }}>
                          <Plus style={{ width: 13, height: 13 }} /> Add member
                        </button>
                      )}
                    </div>
                  )}
                </div>

                {isEditing && (
                  <div style={{ marginTop: 10 }}>
                    {editError && <div style={{ marginBottom: 8, padding: "8px 12px", background: "#FEF2F2", border: "1px solid #FCA5A5", borderRadius: 10, fontSize: 12, color: "#B91C1C" }}>{editError}</div>}
                    <p style={{ fontSize: 11, color: "#8A8497", marginBottom: 8, lineHeight: 1.5 }}>Changes sync to your group chat and will reflect immediately.</p>
                    <div className="flex gap-2">
                      <button onClick={() => { setEditingGroupId(null); setPendingAddMemberIds(new Set()); setPendingRemoveMemberIds(new Set()); setConfirmRemoveSgMemberId(null); setShowSgAddPicker(false); setSgAddPickerSearch(""); setEditError(null) }} style={{ flex: 1, padding: "9px 0", background: "transparent", color: "#5A5466", border: "1px solid #E2DDCF", borderRadius: 10, fontSize: 13, fontWeight: 500, cursor: "pointer", fontFamily: "inherit" }}>Cancel</button>
                      <button onClick={() => handleSgEditSave(group.id)} disabled={editSaving || (pendingAddMemberIds.size === 0 && pendingRemoveMemberIds.size === 0)} style={{ flex: 1, padding: "9px 0", background: "#3E1540", color: "#F6F4EF", border: "none", borderRadius: 10, fontSize: 13, fontWeight: 600, cursor: editSaving || (pendingAddMemberIds.size === 0 && pendingRemoveMemberIds.size === 0) ? "not-allowed" : "pointer", opacity: editSaving || (pendingAddMemberIds.size === 0 && pendingRemoveMemberIds.size === 0) ? 0.6 : 1, fontFamily: "inherit" }}>{editSaving ? "Saving…" : "Save changes"}</button>
                    </div>
                  </div>
                )}

                {pairedGroup && (
                  <div className="mt-3">
                    <p style={{ fontSize: 11, fontWeight: 600, color: "#8A8497", letterSpacing: "0.06em", textTransform: "uppercase" as const, marginBottom: 8 }}>Paired — {pairedGroup.name}</p>
                    <div className="rounded-[14px] border border-[#E8E2D2] overflow-hidden" style={{ background: "#FBF8F2" }}>
                      {pairedMs.length === 0 ? (
                        <div className="px-4 py-5 text-center"><p className="text-[13px] text-[#8A8497]">No members yet.</p></div>
                      ) : pairedMs.map((m, i) => (
                        <div key={m.id} className="flex items-center gap-3 px-4 py-3" style={{ borderTop: i === 0 ? "none" : "1px solid #EFE9DA" }}>
                          <div className="w-7 h-7 rounded-full flex items-center justify-center text-[11px] font-semibold flex-shrink-0" style={{ background: "var(--plum)", color: "var(--cream)" }}>{getInitials(m.name)}</div>
                          <p className="text-[14px] text-[#13101A]">{m.name}</p>
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
              <p style={{ fontFamily: "ui-monospace,'SF Mono',Menlo,monospace", fontSize: 11, color: "#8A8497", textTransform: "uppercase", letterSpacing: "0.1em", margin: 0 }}>Semester</p>
              <select
                value={semester}
                onChange={e => setSemester(e.target.value)}
                style={{ fontSize: 13, padding: "6px 12px", border: "1px solid #E2DDCF", borderRadius: 9, background: "#FBF8F2", color: "#13101A", cursor: "pointer", outline: "none", fontFamily: "inherit" }}
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
              <div className="mt-4 rounded-[14px] border border-dashed border-[#E8E2D2] p-6 text-center" style={{ background: "#FBF8F2" }}>
                <p className="text-[14px] font-semibold text-[#13101A] mb-1">Roster not confirmed</p>
                <p className="text-[13px] text-[#8A8497]">
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
                  <p className="text-[12px] text-[#8A8497] mb-3 mt-3">
                    Check dates when you&apos;re <span className="font-semibold text-[#3E1540]">not available</span>. Changes save automatically.
                  </p>
                  <div className="rounded-[14px] border border-[#E8E2D2] overflow-hidden" style={{ background: "#FBF8F2" }}>
                    <div className="overflow-x-auto">
                      <table style={{ borderCollapse: "collapse", tableLayout: "fixed", minWidth: nameColW + semesterDates.length * datColW }}>
                        <thead>
                          {/* Month eyebrow row */}
                          <tr>
                            <th style={{ width: nameColW, minWidth: nameColW, position: "sticky", left: 0, background: "#F6F2E8", zIndex: 2, borderBottom: "1px solid #E8E2D2" }} />
                            {monthGroups.map(group => (
                              <th
                                key={group.label}
                                colSpan={group.dates.length}
                                style={{ padding: "6px 8px 4px", fontSize: 9, fontWeight: 700, color: "#8A8497", letterSpacing: "0.08em", textTransform: "uppercase" as const, borderBottom: "1px solid #E8E2D2", borderLeft: "1px solid #E8E2D2", background: "#F6F2E8", textAlign: "left", whiteSpace: "nowrap" }}
                              >
                                {group.label}
                              </th>
                            ))}
                          </tr>
                          {/* Date header row */}
                          <tr>
                            <th style={{ width: nameColW, minWidth: nameColW, position: "sticky", left: 0, background: "#F6F2E8", zIndex: 2, borderBottom: "1px solid #E8E2D2", borderRight: "1px solid #E8E2D2" }} />
                            {semesterDates.map(({ date, slot }) => {
                              const [, m, d] = date.split("-")
                              const isPast = date < today
                              return (
                                <th key={`${date}::${slot}`} style={{ width: datColW, minWidth: datColW, padding: "4px 2px 5px", borderBottom: "1px solid #E8E2D2", textAlign: "center" }}>
                                  <div style={{ fontSize: 9, fontWeight: 700, color: isPast ? "#C5C0CC" : "#5A5466", letterSpacing: "0.04em" }}>{SLOT_ABBR[slot]}</div>
                                  <div style={{ fontSize: 9, fontWeight: 400, color: isPast ? "#C5C0CC" : "#8A8497" }}>{parseInt(m)}/{parseInt(d)}</div>
                                </th>
                              )
                            })}
                          </tr>
                        </thead>
                        <tbody>
                          {displayMembers.map((member, i) => (
                            <tr key={member.user_id} style={{ borderBottom: i < displayMembers.length - 1 ? "1px solid #EFE9DA" : undefined }}>
                              <td style={{ width: nameColW, minWidth: nameColW, position: "sticky", left: 0, background: "#FBF8F2", zIndex: 1, padding: "7px 12px", fontSize: 12, color: "#5A5466", fontWeight: 500, whiteSpace: "nowrap", borderRight: "1px solid #E8E2D2" }}>
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
                                        style={{ width: 22, height: 22, borderRadius: 5, border: isBusy ? "none" : "1.5px solid #D4CEDF", background: isBusy ? "#3E1540" : "transparent", cursor: isSavingThis ? "not-allowed" : "pointer", opacity: isSavingThis ? 0.4 : 1, display: "inline-flex", alignItems: "center", justifyContent: "center", transition: "all 0.15s" }}
                                      >
                                        {isBusy && <X style={{ width: 10, height: 10, color: "#F6F4EF" }} />}
                                      </button>
                                    ) : (
                                      <div style={{ width: 22, height: 22, borderRadius: 5, border: isBusy ? "none" : "1.5px solid #ECE8DE", background: isBusy ? (isPast ? "#D4CEDF" : "#ECE8DE") : "transparent", opacity: isPast ? 0.5 : 1, display: "inline-flex", alignItems: "center", justifyContent: "center" }}>
                                        {isBusy && <X style={{ width: 10, height: 10, color: "#8A8497" }} />}
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
                  <p className="text-[11px] text-[#8A8497] mt-2">Checked = unavailable. Changes save automatically.</p>
                  {/* Done button — non-president DGLs only */}
                  {!isPresident && (
                    <div className="mt-4 flex items-center gap-3">
                      {scheduleReady ? (
                        <span style={{ fontSize: 13, color: "#2E7D32", fontWeight: 500, display: "flex", alignItems: "center", gap: 6 }}>
                          <Check style={{ width: 14, height: 14 }} /> Marked as done — the president will be notified.
                        </span>
                      ) : (
                        <button
                          onClick={handleMarkReady}
                          style={{ padding: "9px 18px", background: "#2D0F2E", color: "#F6F4EF", border: "none", borderRadius: 10, fontSize: 13, fontWeight: 500, cursor: "pointer", fontFamily: "inherit" }}
                        >
                          Done filling out →
                        </button>
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
                <div className="mt-4 rounded-[14px] border border-dashed border-[#E8E2D2] p-6 text-center" style={{ background: "#FBF8F2" }}>
                  <p className="text-[13px] text-[#8A8497]">The rotation hasn&apos;t been published yet.</p>
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
                        <span style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "4px 10px", borderRadius: 999, background: rotationPhase === "published" ? "rgba(62,21,64,0.08)" : "#F4F1E8", color: "#3E1540", fontSize: 11, fontWeight: 500, letterSpacing: "0.02em" }}>
                          {rotationPhase === "published" ? "Published" : "Draft"}
                        </span>
                        <button onClick={handleGenerate} disabled={isGenerating} style={{ padding: "6px 12px", background: "transparent", color: "#5A5466", border: "1px solid #E2DDCF", borderRadius: 8, fontSize: 12, fontWeight: 500, fontFamily: "inherit", cursor: isGenerating ? "not-allowed" : "pointer", display: "flex", alignItems: "center", gap: 5 }}>
                          <Shuffle style={{ width: 11, height: 11 }} /> Re-generate
                        </button>
                        <button onClick={() => handlePublish(rotationPhase !== "published")} disabled={isPublishing} style={{ padding: "6px 12px", background: rotationPhase === "published" ? "transparent" : "#3E1540", color: rotationPhase === "published" ? "#3E1540" : "#F6F4EF", border: rotationPhase === "published" ? "1px solid #3E1540" : "none", borderRadius: 8, fontSize: 12, fontWeight: 500, fontFamily: "inherit", cursor: isPublishing ? "not-allowed" : "pointer", opacity: isPublishing ? 0.6 : 1 }}>
                          {isPublishing ? "…" : rotationPhase === "published" ? "Unpublish" : "Publish"}
                        </button>
                      </>
                    )}
                  </div>
                ) : undefined}
              />

              {/* DGL readiness summary */}
              {rosterConfirmedForSchedule && scheduleRosterMembers.length > 0 && (
                <div className="mt-4 rounded-[14px] border border-[#E8E2D2] overflow-hidden" style={{ background: "#FBF8F2" }}>
                  <div className="px-5 py-3 border-b border-[#EFE9DA]" style={{ background: "#F6F2E8" }}>
                    <p style={{ fontFamily: "ui-monospace,'SF Mono',Menlo,monospace", fontSize: 10, letterSpacing: "0.1em", color: "#8A8497", textTransform: "uppercase", margin: 0 }}>
                      Availability Status · {scheduleRosterMembers.filter(m => memberReadiness.get(m.user_id)).length}/{scheduleRosterMembers.length} Done
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2 px-5 py-3">
                    {scheduleRosterMembers.map(m => {
                      const ready = memberReadiness.get(m.user_id) ?? false
                      return (
                        <span key={m.user_id} style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 12, padding: "4px 10px", borderRadius: 999, background: ready ? "rgba(46,125,50,0.08)" : "#F4F1E8", border: `1px solid ${ready ? "rgba(46,125,50,0.2)" : "#E8E2D2"}`, color: ready ? "#2E7D32" : "#8A8497", fontWeight: ready ? 500 : 400 }}>
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
                <div className="mt-4 rounded-[14px] border border-dashed border-[#E8E2D2] p-6 text-center" style={{ background: "#FBF8F2" }}>
                  <p className="text-[14px] font-semibold text-[#13101A] mb-1">Roster required</p>
                  <p className="text-[13px] text-[#8A8497]">
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
                    <div className="mt-4 rounded-[14px] border border-dashed border-[#E8E2D2] p-6 text-center" style={{ background: "#FBF8F2" }}>
                      <p className="text-[14px] font-semibold text-[#13101A] mb-1">No rotation yet</p>
                      <p className="text-[13px] text-[#8A8497] mb-5">
                        Generate a fair rotation from DGL availability for {semesterLabel}.
                      </p>
                      <button onClick={handleGenerate} disabled={isGenerating} style={{ padding: "10px 22px", background: "#3E1540", color: "#F6F4EF", border: "none", borderRadius: 10, fontSize: 14, fontWeight: 500, fontFamily: "inherit", cursor: isGenerating ? "not-allowed" : "pointer", opacity: isGenerating ? 0.6 : 1, display: "inline-flex", alignItems: "center", gap: 8 }}>
                        {isGenerating ? <><Loader2 style={{ width: 14, height: 14 }} className="animate-spin" /> Generating…</> : <><Shuffle style={{ width: 14, height: 14 }} /> Generate Rotation</>}
                      </button>
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
                            <div key={month} className="rounded-[14px] border border-[#E8E2D2] overflow-hidden" style={{ background: "#FBF8F2" }}>
                              <button
                                onClick={() => setOpenRotMonths(prev => { const n = new Set(prev); isOpen ? n.delete(month) : n.add(month); return n })}
                                className="w-full flex items-center gap-3 px-5 py-4 text-left"
                                style={{ background: isOpen ? "#F6F2E8" : "transparent", border: "none", cursor: "pointer", fontFamily: "inherit" }}
                              >
                                <ChevronDown style={{ width: 15, height: 15, color: "#5A5466", flexShrink: 0, transform: isOpen ? "rotate(0deg)" : "rotate(-90deg)", transition: "transform 0.15s" }} />
                                <span style={{ fontFamily: "var(--font-instrument-serif)", fontSize: 20, color: "#13101A", letterSpacing: "-0.01em", flex: 1 }}>{month}</span>
                                <span style={{ fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace", fontSize: 10, letterSpacing: "0.1em", color: "#8A8497" }}>{weekDates.length} WEEKS</span>
                              </button>
                              {isOpen && (
                                <div style={{ borderTop: "1px solid #EFE9DA" }}>
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
                          style={{ padding: "9px 18px", background: "transparent", color: "#5A5466", border: "1px solid #E2DDCF", borderRadius: 9, fontSize: 13, fontWeight: 500, fontFamily: "inherit", cursor: "pointer" }}
                        >
                          Discard
                        </button>
                        <button onClick={handleSave} disabled={isSaving} style={{ padding: "9px 20px", background: "#3E1540", color: "#F6F4EF", border: "none", borderRadius: 9, fontSize: 13, fontWeight: 500, fontFamily: "inherit", cursor: isSaving ? "not-allowed" : "pointer", opacity: isSaving ? 0.6 : 1, display: "flex", alignItems: "center", gap: 8 }}>
                          {isSaving ? <><Loader2 style={{ width: 13, height: 13 }} className="animate-spin" /> Saving…</> : <><Check style={{ width: 13, height: 13 }} /> Save Draft</>}
                        </button>
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

function BibleStudySubTab({
  teamId, ministryId, userId, isPastor, isPresident, onOpenChat,
}: {
  teamId: string
  ministryId: string
  userId: string
  isPastor: boolean
  isPresident: boolean
  onOpenChat?: (id: string, name: string) => void
}) {
  const supabase = createClient()

  // Sheet list + selection
  const [sheets, setSheets] = useState<BSSheet[]>([])
  const [selectedSheetId, setSelectedSheetId] = useState<string | null>(null)
  const [sheet, setSheet] = useState<BSSheet | null>(null)
  const [loadingSheets, setLoadingSheets] = useState(true)
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

  // Load sheet list once on mount; load team progress independently
  useEffect(() => { void loadSheets() }, [teamId]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { void loadTeamProgress() }, [teamId]) // eslint-disable-line react-hooks/exhaustive-deps

  // Load individual sheet whenever selection changes
  useEffect(() => {
    if (selectedSheetId) void loadSheetById(selectedSheetId)
    else { setSheet(null) }
  }, [selectedSheetId]) // eslint-disable-line react-hooks/exhaustive-deps

  async function loadSheets() {
    setLoadingSheets(true)
    const { data } = await supabase
      .from("bible_study_sheets")
      .select("*")
      .eq("team_id", teamId)
      .order("sort_order", { ascending: true })
    const list = (data ?? []) as BSSheet[]
    setSheets(list)
    if (list.length > 0 && !selectedSheetId) setSelectedSheetId(list[list.length - 1].id)
    setLoadingSheets(false)
  }

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
    await loadSheets()
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
    await loadSheets()
  }

  async function handleDelete(id: string) {
    setDeletingId(id)
    await supabase.from("bible_study_sheets").delete().eq("id", id)
    setDeletingId(null)
    setConfirmingDeleteId(null)
    const nextSheets = sheets.filter(s => s.id !== id)
    setSheets(nextSheets)
    if (selectedSheetId === id) {
      setSelectedSheetId(nextSheets.length > 0 ? nextSheets[nextSheets.length - 1].id : null)
    }
    setSheet(null)
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
    return <div style={{ display: "flex", justifyContent: "center", paddingTop: 48 }}><Loader2 className="w-5 h-5 animate-spin text-[#8A8497]" /></div>
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>

      {/* ── Where We Left Off — always visible, independent of selected chapter ── */}
      {progress.length > 0 && (
        <div>
          <PlanSectionHeader>Where We Left Off</PlanSectionHeader>
          <div style={{ background: "white", borderRadius: 14, border: "1px solid #E8E2D2", overflow: "hidden" }}>
            {progress.map((p, i) => {
              const isMe = p.user_id === userId
              const isLast = i === progress.length - 1
              return (
                <div key={p.user_id} style={{ borderBottom: isLast ? "none" : "1px solid #F8F6F1" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 16px" }}>
                    <div style={{ width: 28, height: 28, borderRadius: "50%", background: "var(--plum)", color: "var(--cream)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 600, flexShrink: 0 }}>
                      {getInitials(p.name)}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <p style={{ fontSize: 13, color: "#13101A", fontWeight: isMe ? 600 : 400 }}>{p.name}{isMe ? " (you)" : ""}</p>
                      {p.progress_note && !isMe && (
                        <p style={{ fontSize: 12, color: "#5A5466", marginTop: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" as const }}>{p.progress_note}</p>
                      )}
                      {isMe && !editingNote && p.progress_note && (
                        <p style={{ fontSize: 12, color: "#5A5466", marginTop: 1 }}>{p.progress_note}</p>
                      )}
                    </div>
                    {!isPastor && isMe && !editingNote && (
                      <button
                        onClick={() => setEditingNote(true)}
                        style={{ fontSize: 11, color: "#3E1540", fontWeight: 600, background: "rgba(62,21,64,0.07)", border: "none", cursor: "pointer", padding: "4px 8px", borderRadius: 6, fontFamily: "inherit", flexShrink: 0 }}
                      >
                        {p.progress_note ? "Edit" : "Add note"}
                      </button>
                    )}
                    {!isMe && !p.progress_note && (
                      <Circle style={{ width: 13, height: 13, color: "#C4C0B0", flexShrink: 0 }} />
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
                        style={{ fontSize: 12, padding: "7px 10px", borderRadius: 8, border: "1.5px solid #C4B8CC", outline: "none", fontFamily: "inherit", color: "#13101A", width: "100%", boxSizing: "border-box" as const }}
                      />
                      <div style={{ display: "flex", gap: 6 }}>
                        <button
                          onClick={() => void saveProgressNote(myNote)}
                          disabled={savingProgressNote}
                          style={{ fontSize: 11, fontWeight: 600, padding: "5px 12px", borderRadius: 7, background: "#3E1540", color: "white", border: "none", cursor: savingProgressNote ? "not-allowed" : "pointer", opacity: savingProgressNote ? 0.6 : 1, fontFamily: "inherit" }}
                        >
                          {savingProgressNote ? "Saving…" : "Save"}
                        </button>
                        <button
                          onClick={() => { setEditingNote(false); setMyNote(progress.find(r => r.user_id === userId)?.progress_note ?? "") }}
                          style={{ fontSize: 11, padding: "5px 10px", borderRadius: 7, background: "none", border: "1px solid #C4B8CC", color: "#5A5466", cursor: "pointer", fontFamily: "inherit" }}
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
                <div style={{ display: "flex", alignItems: "center", gap: 4, padding: "4px 10px", border: "1.5px solid #3E1540", borderRadius: 20, background: "#FBF8F2" }}>
                  <input
                    autoFocus
                    value={renameValue}
                    onChange={e => setRenameValue(e.target.value)}
                    onKeyDown={e => { if (e.key === "Enter") void handleRename(s.id); if (e.key === "Escape") setRenamingId(null) }}
                    style={{ fontSize: 13, border: "none", outline: "none", background: "transparent", fontFamily: "inherit", color: "#13101A", width: 120 }}
                  />
                  <button onClick={() => void handleRename(s.id)} disabled={savingRename} style={{ background: "none", border: "none", cursor: "pointer", padding: 2, color: "#2E7D32", display: "flex" }}>
                    <Check style={{ width: 13, height: 13 }} />
                  </button>
                  <button onClick={() => setRenamingId(null)} style={{ background: "none", border: "none", cursor: "pointer", padding: 2, color: "#8A8497", display: "flex" }}>
                    <X style={{ width: 13, height: 13 }} />
                  </button>
                </div>
              ) : isConfirmingDelete ? (
                <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "4px 10px", border: "1.5px solid #E57373", borderRadius: 20, background: "#FFF5F5" }}>
                  <span style={{ fontSize: 12, color: "#9F3030", whiteSpace: "nowrap" as const }}>Delete?</span>
                  <button onClick={() => void handleDelete(s.id)} disabled={deletingId === s.id} style={{ background: "none", border: "none", cursor: "pointer", padding: 2, color: "#9F3030", fontWeight: 700, fontSize: 12, fontFamily: "inherit" }}>
                    {deletingId === s.id ? "…" : "Yes"}
                  </button>
                  <button onClick={() => setConfirmingDeleteId(null)} style={{ background: "none", border: "none", cursor: "pointer", padding: 2, color: "#8A8497", display: "flex" }}>
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
                      border: isActive ? "1.5px solid #3E1540" : "1.5px solid #E8E2D2",
                      background: isActive ? "#3E1540" : "transparent",
                      color: isActive ? "#F6F4EF" : "#5A5466",
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
                        style={{ background: "none", border: "none", cursor: "pointer", padding: "3px", color: "#8A8497", display: "flex", flexShrink: 0 }}
                      >
                        <Pencil style={{ width: 12, height: 12 }} />
                      </button>
                      <button
                        onClick={() => setConfirmingDeleteId(s.id)}
                        title="Delete"
                        style={{ background: "none", border: "none", cursor: "pointer", padding: "3px", color: "#C4C0B0", display: "flex", flexShrink: 0 }}
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
            style={{ padding: "5px 12px", borderRadius: 20, fontSize: 13, border: "1.5px dashed #C4B8CC", background: "transparent", color: "#8A8497", cursor: "pointer", whiteSpace: "nowrap" as const, flexShrink: 0, fontFamily: "inherit" }}
          >
            + New chapter
          </button>
        )}
      </div>

      {/* Create form */}
      {creating && (
        <div style={{ background: "white", borderRadius: 16, border: "1px solid #E8E2D2", padding: "20px" }}>
          <p style={{ fontSize: 14, fontWeight: 600, color: "#13101A", marginBottom: 12 }}>New chapter</p>
          <input
            value={newTitle}
            onChange={e => setNewTitle(e.target.value)}
            placeholder="Chapter name (e.g. Romans 1)"
            style={{ width: "100%", padding: "9px 12px", fontSize: 13, border: "1.5px solid #E8E2D2", borderRadius: 8, fontFamily: "inherit", color: "#13101A", background: "#FDFBF7", outline: "none", boxSizing: "border-box" as const, marginBottom: 8 }}
          />
          <input
            type="url"
            value={newDocUrl}
            onChange={e => setNewDocUrl(e.target.value)}
            placeholder="https://docs.google.com/document/d/..."
            style={{ width: "100%", padding: "9px 12px", fontSize: 13, border: "1.5px solid #E8E2D2", borderRadius: 8, fontFamily: "inherit", color: "#13101A", background: "#FDFBF7", outline: "none", boxSizing: "border-box" as const, marginBottom: 8 }}
          />
          <p style={{ fontSize: 11, color: "#8A8497", marginBottom: 10 }}>Make sure the doc is set to &ldquo;Anyone with the link can view&rdquo; before finalizing.</p>
          {createError && <p style={{ fontSize: 12, color: "#9F3030", marginBottom: 8 }}>{createError}</p>}
          <div style={{ display: "flex", gap: 8 }}>
            <button onClick={handleCreate} disabled={saving} style={{ flex: 1, padding: "8px 0", background: "#3E1540", color: "#F6F4EF", border: "none", borderRadius: 9, fontSize: 13, fontWeight: 600, cursor: saving ? "not-allowed" : "pointer", opacity: saving ? 0.6 : 1, fontFamily: "inherit" }}>
              {saving ? "Saving…" : "Save"}
            </button>
            <button onClick={() => { setCreating(false); setCreateError(null); setNewTitle(""); setNewDocUrl("") }} style={{ flex: 1, padding: "8px 0", background: "transparent", color: "#5A5466", border: "1.5px solid #E8E2D2", borderRadius: 9, fontSize: 13, cursor: "pointer", fontFamily: "inherit" }}>
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Empty state (no chapters yet) */}
      {sheets.length === 0 && !creating && (
        <div style={{ background: "white", borderRadius: 16, border: "1.5px dashed #E8E2D2", padding: "32px 24px", textAlign: "center" as const }}>
          <FileText style={{ width: 32, height: 32, color: "#C4C0B0", margin: "0 auto 12px" }} />
          <p style={{ fontSize: 14, fontWeight: 600, color: "#13101A", marginBottom: 4 }}>No chapters yet</p>
          <p style={{ fontSize: 13, color: "#8A8497", marginBottom: isPastor ? 16 : 0 }}>
            {isPastor ? "Create the first chapter to get started." : "Check back when the pastor has added the first chapter."}
          </p>
        </div>
      )}

      {/* Sheet content */}
      {loadingSheet && (
        <div style={{ display: "flex", justifyContent: "center", paddingTop: 32 }}><Loader2 className="w-5 h-5 animate-spin text-[#8A8497]" /></div>
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
                color: sheet.status === "finalized" ? "#2E7D32" : "#8A6200",
              }}>
                {sheet.status === "finalized" ? "Finalized" : "Draft"}
              </span>
            </div>
            <a
              href={sheet.google_doc_url}
              target="_blank"
              rel="noopener noreferrer"
              style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 12, color: "#3E1540", fontWeight: 600, textDecoration: "none" }}
            >
              <ExternalLink style={{ width: 12, height: 12 }} />
              Open doc
            </a>
          </div>

          {/* DRAFT: iframe preview */}
          {sheet.status === "draft" && (
            <div style={{ background: "white", borderRadius: 12, border: "1px solid #E8E2D2", overflow: "hidden" }}>
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
                  <Loader2 className="w-5 h-5 animate-spin text-[#8A8497]" />
                </div>
              )}
              {!renderingPdf && pdfPages.length === 0 && sheet.pdf_url && (
                <div style={{ background: "white", borderRadius: 12, border: "1px solid #E8E2D2", padding: 20, textAlign: "center" as const }}>
                  <p style={{ fontSize: 13, color: "#8A8497", marginBottom: 12 }}>PDF preview unavailable.</p>
                  <a href={sheet.pdf_url} target="_blank" rel="noopener noreferrer" style={{ fontSize: 13, color: "#3E1540", fontWeight: 600, textDecoration: "none" }}>
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
                    style={{ display: "block", width: "100%", borderRadius: pi === 0 ? "12px 12px 0 0" : pi === pdfPages.length - 1 ? "0 0 12px 12px" : "0", border: "1px solid #E8E2D2" }}
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
                          background: "#3E1540", border: "2px solid #F6F4EF", cursor: "pointer", zIndex: 10,
                          display: "flex", alignItems: "center", justifyContent: "center",
                          fontSize: 10, fontWeight: 700, color: "#F6F4EF",
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
                            background: "#13101A", color: "#F6F4EF", fontSize: 11, padding: "4px 8px", borderRadius: 6,
                            whiteSpace: "nowrap" as const, maxWidth: 200, zIndex: 20, pointerEvents: "none" as const,
                          }}>
                            {ann.text}
                            <div style={{ fontSize: 10, color: "#A09A8C" }}>Click to delete</div>
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              ))}
              {pdfPages.length > 0 && (
                <p style={{ fontSize: 11, color: "#8A8497", textAlign: "center" as const, marginTop: 4 }}>
                  Click anywhere on the PDF to add a personal annotation. Annotations are private to you.
                </p>
              )}
            </div>
          )}

          {/* Pending annotation input */}
          {pendingAnnotation !== null && (
            <div style={{ background: "white", borderRadius: 14, border: "1.5px solid #E8E2D2", padding: 16, boxShadow: "0 2px 8px rgba(0,0,0,0.08)" }}>
              <p style={{ fontSize: 13, fontWeight: 600, color: "#13101A", marginBottom: 8 }}>Add annotation</p>
              <textarea
                autoFocus
                value={annotationText}
                onChange={e => setAnnotationText(e.target.value)}
                onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void handleAddAnnotation() } }}
                placeholder="Type your note…"
                style={{ width: "100%", resize: "none" as const, height: 68, padding: "8px 10px", fontSize: 13, border: "1.5px solid #E8E2D2", borderRadius: 8, fontFamily: "inherit", color: "#13101A", background: "#FDFBF7", outline: "none", boxSizing: "border-box" as const, marginBottom: 8 }}
              />
              <div style={{ display: "flex", gap: 8 }}>
                <button onClick={handleAddAnnotation} disabled={savingAnnotation || !annotationText.trim()} style={{ flex: 1, padding: "8px 0", background: "#3E1540", color: "#F6F4EF", border: "none", borderRadius: 9, fontSize: 13, fontWeight: 600, cursor: (!annotationText.trim() || savingAnnotation) ? "not-allowed" : "pointer", opacity: (!annotationText.trim() || savingAnnotation) ? 0.6 : 1, fontFamily: "inherit" }}>
                  {savingAnnotation ? "Saving…" : "Save note"}
                </button>
                <button onClick={() => { setPendingAnnotation(null); setAnnotationText("") }} style={{ flex: 1, padding: "8px 0", background: "transparent", color: "#5A5466", border: "1.5px solid #E8E2D2", borderRadius: 9, fontSize: 13, cursor: "pointer", fontFamily: "inherit" }}>
                  Cancel
                </button>
              </div>
            </div>
          )}

          {/* Pastor notes */}
          <div>
            <PlanSectionHeader>
              {isPastor ? "Your Notes to DGLs" : "Pastor Notes"}
              {savingNote && <span style={{ fontSize: 11, color: "#8A8497", marginLeft: 8, fontWeight: 400 }}>Saving…</span>}
            </PlanSectionHeader>
            {isPastor ? (
              <textarea
                value={noteDraft}
                onChange={e => handleNoteChange(e.target.value)}
                placeholder="Add notes for the DGLs…"
                style={{ width: "100%", resize: "vertical" as const, minHeight: 100, padding: "10px 12px", fontSize: 13, border: "1.5px solid #E8E2D2", borderRadius: 10, fontFamily: "inherit", color: "#13101A", background: "white", outline: "none", boxSizing: "border-box" as const }}
              />
            ) : sheet.pastor_notes ? (
              <div style={{ padding: "12px 16px", background: "#F4F1E8", borderRadius: 10, border: "1px solid #E8E2D2", fontSize: 13, color: "#13101A", lineHeight: 1.6, whiteSpace: "pre-wrap" as const }}>
                {sheet.pastor_notes}
              </div>
            ) : (
              <p style={{ fontSize: 13, color: "#8A8497" }}>No notes added yet.</p>
            )}
          </div>

          {/* Finalize (pastor, draft only) */}
          {isPastor && sheet.status === "draft" && (
            <div>
              {!finalizeConfirm ? (
                <button
                  onClick={() => setFinalizeConfirm(true)}
                  style={{ padding: "10px 24px", background: "#2D0F2E", color: "#F6F4EF", border: "none", borderRadius: 10, fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}
                >
                  Finalize &amp; Export PDF →
                </button>
              ) : (
                <div style={{ padding: "14px 16px", background: "#FBF8F2", border: "1.5px solid #E8E2D2", borderRadius: 12 }}>
                  <p style={{ fontSize: 13, fontWeight: 600, color: "#13101A", marginBottom: 4 }}>Finalize this week&apos;s study?</p>
                  <p style={{ fontSize: 12, color: "#8A8497", marginBottom: 10 }}>
                    The Google Doc will be exported to PDF and locked for annotation. Ensure the doc is publicly viewable.
                  </p>
                  {finalizeError && (
                    <div style={{ display: "flex", alignItems: "flex-start", gap: 6, marginBottom: 10 }}>
                      <AlertCircle style={{ width: 13, height: 13, color: "#9F3030", flexShrink: 0, marginTop: 1 }} />
                      <p style={{ fontSize: 12, color: "#9F3030" }}>{finalizeError}</p>
                    </div>
                  )}
                  <div style={{ display: "flex", gap: 8 }}>
                    <button onClick={handleFinalize} disabled={finalizing} style={{ flex: 1, padding: "8px 0", background: "#3E1540", color: "#F6F4EF", border: "none", borderRadius: 9, fontSize: 13, fontWeight: 600, cursor: finalizing ? "not-allowed" : "pointer", opacity: finalizing ? 0.6 : 1, fontFamily: "inherit", display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}>
                      {finalizing ? <><Loader2 style={{ width: 13, height: 13 }} className="animate-spin" />Exporting…</> : "Confirm"}
                    </button>
                    <button onClick={() => { setFinalizeConfirm(false); setFinalizeError(null) }} style={{ flex: 1, padding: "8px 0", background: "transparent", color: "#5A5466", border: "1.5px solid #E8E2D2", borderRadius: 9, fontSize: 13, cursor: "pointer", fontFamily: "inherit" }}>
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
                <p style={{ fontSize: 13, color: "#2E7D32", fontWeight: 500, display: "flex", alignItems: "center", gap: 6 }}>
                  <CheckCircle2 style={{ width: 14, height: 14 }} />
                  Shared to group chat!
                </p>
              ) : (
                <button
                  onClick={handleShare}
                  disabled={sharing}
                  style={{ display: "flex", alignItems: "center", gap: 6, padding: "9px 18px", background: "transparent", color: "#3E1540", border: "1.5px solid #3E1540", borderRadius: 9, fontSize: 13, fontWeight: 600, cursor: sharing ? "not-allowed" : "pointer", opacity: sharing ? 0.6 : 1, fontFamily: "inherit" }}
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
    <p className="text-[13px] text-[#8A8497] text-center py-6">No assignments generated.</p>
  )

  return (
    <div className="flex flex-col gap-2">
      {weeks.map(wd => {
        const weekRows = byWeek.get(wd) ?? []
        const d = new Date(wd + "T12:00:00")
        const dateStr = d.toLocaleDateString("en-US", { month: "short", day: "numeric" })
        const hasFlagged = SLOTS.some(s => flaggedKeys.has(`${wd}::${s}`))
        return (
          <div key={wd} className={`rounded-[12px] border overflow-hidden ${hasFlagged ? "border-[#FDE68A]" : "border-[#E8E2D2]"}`} style={{ background: "#FBF8F2" }}>
            <div className={`px-4 py-2.5 border-b flex items-center justify-between ${hasFlagged ? "border-[#FDE68A] bg-[#FFFBEB]" : "border-[#EFE9DA]"}`} style={hasFlagged ? {} : { background: "#F6F2E8" }}>
              <span style={{ fontSize: 12, fontWeight: 600, color: hasFlagged ? "#92400E" : "#5A5466" }}>{dateStr}</span>
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
                <div key={slot} className={`px-4 py-2.5 flex items-center justify-between ${si < SLOTS.length - 1 ? "border-b border-[#EFE9DA]" : ""} ${isFlagged ? "bg-[#FFFBEB]" : ""}`}>
                  <span style={{ fontSize: 11, fontWeight: 600, color: isFlagged ? "#B45309" : "#8A8497", letterSpacing: "0.06em", textTransform: "uppercase" as const }}>
                    {DGL_SLOT_LABELS[slot]}
                  </span>
                  {isFriday ? (
                    <span style={{ fontSize: 13, fontWeight: 500, color: fridayRows.length > 0 ? "#13101A" : "#F87171" }}>
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
                      style={{ fontSize: 13, border: "1.5px solid #D4CEDF", borderRadius: 6, padding: "3px 6px", fontFamily: "inherit", background: "white", color: "#13101A", maxWidth: 160 }}
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
                        <span style={{ fontSize: 13, fontWeight: 500, color: "#13101A" }}>{r.user_name}</span>
                      ) : (
                        <span style={{ fontSize: 13, color: "#F87171", fontWeight: 500 }}>Unassigned</span>
                      )}
                      {onSwap && isHovered && (
                        <Pencil style={{ width: 11, height: 11, color: "#8A8497", flexShrink: 0 }} />
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
