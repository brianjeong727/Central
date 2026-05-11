"use client"

import { useState, useEffect, useRef, useCallback, useMemo } from "react"
import {
  ChevronRight, ChevronDown, ChevronLeft, X, Check, Plus, Settings, Trash2,
  Edit3, ArrowLeft, Calendar, List, Grid3x3, Users, MoreHorizontal, Search,
  Bold, Italic, Underline as UnderlineIcon, Strikethrough, ListOrdered,
  Indent, Outdent, AlignLeft, AlignCenter, AlignRight, ClipboardList, Pencil,
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
import * as Y from "yjs"
import Collaboration from "@tiptap/extension-collaboration"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Spinner, EmptyState, PlanLineIcon, PlanSectionHeader } from "../components/shared"
import { getInitials, getAvatarColor } from "../utils"
import { DesktopTopbar } from "../components/desktop-nav"
import type {
  PlanTabProps, UserTeam, Team, CalendarEvent, EventPlan, EventTask, EventRole, EventNote,
  TeamRole, TeamMemberDisplay, DraftRole, RoleDescription, RoleLink, MeetingNote,
  WorshipWeek, WorshipRoleRow, PraiseTeamMember, WorshipSong, WorshipInvite, WorshipChart, AnnotationObj, Category, CreateStep,
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

const TEAM_PRESETS = [
  {
    id: "praise",
    name: "Praise Team",
    icon: "🎵",
    description: "Worship and music ministry",
    roles: [
      { name: "President", permissions: ["can_manage_worship_set", "can_view_worship_set", "can_generate_slides", "can_manage_team", "can_manage_schedule"] },
      { name: "Worship Leader", permissions: ["can_manage_worship_set", "can_view_worship_set", "can_generate_slides", "can_manage_team"] },
      { name: "Member", permissions: ["can_view_worship_set", "can_generate_slides"] },
    ],
  },
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
    id: "tech",
    name: "Tech Team",
    icon: "💻",
    description: "Technical support and media",
    roles: [{ name: "Member", permissions: ["can_view_worship_set", "can_generate_slides"] }],
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
          className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-[#3E1540] text-[#F6F4EF] text-[13px] font-semibold hover:bg-[#2D0F2E] transition-colors disabled:opacity-50"
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
                className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-[#3E1540] text-[#F6F4EF] text-[13px] font-semibold hover:bg-[#2D0F2E] transition-colors disabled:opacity-50"
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
    channel.on("presence", { event: "sync" }, () => {
      const state = channel.presenceState()
      const users = (Object.values(state).flat() as unknown as CollabUser[]).filter(u => u.userId !== userId)
      setActiveUsers(users)
    })

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
      channel.unsubscribe()
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
    return () => { supabase.removeChannel(ch) }
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
}: {
  teamId: string | null
  userId: string
  userName: string
  canWrite: boolean
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
    <div className="mt-14">
      <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", marginBottom: 20 }}>
        <div>
          <p style={{ fontFamily: "ui-monospace,'SF Mono',Menlo,monospace", fontSize: "11px", fontWeight: 600, letterSpacing: "0.1em", textTransform: "uppercase", color: "#8A8497", marginBottom: 6 }}>
            Meeting Notes · Weekly
          </p>
          <h2 style={{ fontFamily: "var(--font-instrument-serif)", fontSize: 30, fontWeight: 400, color: "#13101A", margin: 0, letterSpacing: "-0.01em" }}>
            What we&apos;ve discussed
          </h2>
        </div>
        {canWrite && (
          <button
            onClick={createNote}
            disabled={creating}
            style={{ display: "flex", alignItems: "center", gap: 6, padding: "7px 14px", borderRadius: 10, border: "1px solid #3E1540", background: "transparent", color: "#3E1540", fontSize: 13, fontWeight: 500, cursor: creating ? "default" : "pointer", fontFamily: "var(--font-inter)", opacity: creating ? 0.5 : 1 }}
          >
            <Plus className="w-3.5 h-3.5" />
            {creating ? "Creating…" : "Start new"}
          </button>
        )}
      </div>

      {loading ? (
        <div style={{ textAlign: "center", padding: "32px 0", color: "#8A8497", fontSize: 13 }}>Loading…</div>
      ) : notes.length === 0 ? (
        <div style={{ borderLeft: "1px solid #E8E2D2", paddingLeft: 24, paddingTop: 4, paddingBottom: 4 }}>
          <p style={{ fontFamily: "var(--font-instrument-serif)", fontStyle: "italic", fontSize: 15, color: "#A09A8C", margin: 0 }}>
            {canWrite ? "No notes yet — start a new one above." : "No notes have been created yet."}
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
  teamId, teamName, teamIcon, ministryId, userId, userName, userRole, isAdmin, canEdit, onTeamSettings,
  planningEvent, onPlanningEventChange,
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
  onTeamSettings?: () => void
  planningEvent: CalendarEvent | null
  onPlanningEventChange: (ev: CalendarEvent | null) => void
}) {
  const supabase = createClient()
  const [teamTab, setTeamTab] = useState<"General" | "Plan" | "Roster" | "Resources">("General")

  // Calendar
  const [calEvents, setCalEvents] = useState<CalendarEvent[]>([])
  const [plannedIds, setPlannedIds] = useState<Set<string>>(new Set())
  const [currentMonth, setCurrentMonth] = useState(new Date())
  const [calLoading, setCalLoading] = useState(true)

  // Quick add
  const [quickTitle, setQuickTitle] = useState("")
  const [quickDate, setQuickDate] = useState("")
  const [quickCategory, setQuickCategory] = useState<Category>("regular")
  const [creatingEvent, setCreatingEvent] = useState(false)

  // Roster
  const [roster, setRoster] = useState<{ id: string; user_id: string; name: string; role: string }[]>([])

  useEffect(() => {
    if (!ministryId) return
    setCalLoading(true)
    const q = supabase.from("calendar_events")
      .select("id, title, description, location, start_date, end_date, all_day, category, created_by")
      .eq("ministry_id", ministryId).order("start_date")
    const run = teamId ? q.or(`team_id.eq.${teamId},team_id.is.null`) : q
    run.then(({ data }) => { setCalEvents((data ?? []) as CalendarEvent[]); setCalLoading(false) })
    supabase.from("event_plans").select("calendar_event_id").eq("ministry_id", ministryId)
      .then(({ data }) => setPlannedIds(new Set((data ?? []).map((p: { calendar_event_id: string }) => p.calendar_event_id))))
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [teamId, ministryId])

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
  const upNext = calEvents.find(ev => new Date(ev.start_date) >= now)

  async function handleQuickCreate() {
    if (!quickTitle.trim() || !quickDate) return
    setCreatingEvent(true)
    const { data: newEv } = await supabase.from("calendar_events").insert({
      ministry_id: ministryId,
      ...(teamId ? { team_id: teamId } : {}),
      title: quickTitle.trim(),
      start_date: new Date(quickDate + "T12:00:00").toISOString(),
      end_date: new Date(quickDate + "T12:00:00").toISOString(),
      all_day: true,
      category: quickCategory,
      created_by: userId,
    }).select("id, title, description, location, start_date, end_date, all_day, category, created_by").single()
    setCreatingEvent(false)
    if (newEv) {
      const sorted = [...calEvents, newEv as CalendarEvent].sort((a, b) => new Date(a.start_date).getTime() - new Date(b.start_date).getTime())
      setCalEvents(sorted)
      setQuickTitle(""); setQuickDate("")
      onPlanningEventChange(newEv as CalendarEvent)
    }
  }

  const mono: React.CSSProperties = {
    fontFamily: "ui-monospace,'SF Mono',Menlo,monospace",
    fontSize: "11px", fontWeight: 600, letterSpacing: "0.1em", textTransform: "uppercase", color: "#8A8497",
  }

  if (planningEvent) {
    return (
      <EventPlanWorkspace
        inline
        hideHero
        calendarEvent={planningEvent}
        ministryId={ministryId}
        userId={userId}
        canEdit={canEdit}
        onClose={() => onPlanningEventChange(null)}
      />
    )
  }

  return (
    <div>
      {/* ── Underline tabs: General / Plan / Roster / Resources ── */}
      <div style={{ paddingLeft: 56, borderBottom: "1px solid #E8E2D2", display: "flex", gap: 32 }}>
        {(["General", "Plan", "Roster", "Resources"] as const).map(t => (
          <button
            key={t}
            onClick={() => setTeamTab(t)}
            style={{
              padding: "12px 0 14px", fontSize: 15, fontFamily: "var(--font-inter)",
              color: teamTab === t ? "#2D0F2E" : "#8A8497",
              fontWeight: teamTab === t ? 600 : 400,
              borderBottom: teamTab === t ? "2px solid #3E1540" : "2px solid transparent",
              marginBottom: -1, background: "none", border: "none",
              cursor: "pointer",
            }}
          >{t}</button>
        ))}
      </div>

      {/* ── Tab content ── */}
      <div style={{ padding: "30px 56px 60px" }}>

        {/* GENERAL — calendar + sidebar + meeting notes */}
        {teamTab === "General" && (
          <div>
            <section style={{ display: "grid", gridTemplateColumns: "1.6fr 1fr", gap: 32 }}>
              {/* Left: month calendar */}
              <div>
                <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 18 }}>
                  <div>
                    <p style={mono}>Upcoming</p>
                    <h2 style={{ fontFamily: "var(--font-instrument-serif)", fontSize: 32, margin: "4px 0 0", letterSpacing: "-0.01em", color: "#13101A" }}>
                      {currentMonth.toLocaleDateString("en-US", { month: "long", year: "numeric" })}
                    </h2>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 14, fontSize: 12, color: "#8A8497" }}>
                    {[{ label: "Ministry", color: "#3E1540" }, { label: "Social", color: "#9D7B4F" }, { label: "Outreach", color: "#5B7A6C" }].map(({ label, color }) => (
                      <span key={label} style={{ display: "flex", alignItems: "center", gap: 5 }}>
                        <span style={{ display: "inline-block", width: 8, height: 8, borderRadius: 99, background: color }} />{label}
                      </span>
                    ))}
                  </div>
                </div>

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
              </div>

              {/* Right: UP NEXT + QUICK ADD */}
              <aside style={{ display: "flex", flexDirection: "column", gap: 18 }}>
                <p style={mono}>Up next</p>

                {upNext ? (
                  <button
                    onClick={() => onPlanningEventChange(upNext)}
                    style={{ position: "relative", textAlign: "left", border: "none", padding: 0, cursor: "pointer", borderRadius: 16, overflow: "hidden", background: "radial-gradient(120% 100% at 0% 0%, #4A1B4D 0%, #2D0F2E 55%, #1B0A1E 100%)", color: "#FBF8F2" }}
                  >
                    <div style={{ position: "absolute", inset: 0, opacity: 0.14, background: "radial-gradient(rgba(251,248,242,0.6) 1px, transparent 1.4px) 0 0 / 14px 14px" }} />
                    <div style={{ position: "relative", padding: "22px 22px 20px" }}>
                      <p style={{ ...mono, color: "rgba(251,248,242,0.65)" }}>
                        {new Date(upNext.start_date).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" }).toUpperCase()} · {upNext.category.toUpperCase()}
                      </p>
                      <p style={{ fontFamily: "var(--font-instrument-serif)", fontSize: 30, marginTop: 6, letterSpacing: "-0.01em", color: "#FBF8F2" }}>{upNext.title}</p>
                      {upNext.location && <p style={{ fontSize: 13, color: "rgba(251,248,242,0.72)", marginTop: 6 }}>{upNext.location}</p>}
                      <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 16 }}>
                        <span style={{ padding: "4px 10px", borderRadius: 999, background: "rgba(251,248,242,0.12)", fontSize: 11 }}>
                          {plannedIds.has(upNext.id) ? "Plan exists" : "Needs planning"}
                        </span>
                        <span style={{ fontSize: 11, color: "rgba(251,248,242,0.55)" }}>
                          {Math.max(0, Math.ceil((new Date(upNext.start_date).getTime() - now.getTime()) / 86400000))} days out
                        </span>
                      </div>
                      <div style={{ marginTop: 18, padding: "10px 14px", borderRadius: 10, background: "#FBF8F2", color: "#2D0F2E", fontSize: 13, fontWeight: 500, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                        Open plan <ChevronRight className="w-3.5 h-3.5" />
                      </div>
                    </div>
                  </button>
                ) : (
                  <div style={{ padding: 20, border: "1px dashed #E8E2D2", borderRadius: 16, textAlign: "center" }}>
                    <p style={{ fontFamily: "var(--font-instrument-serif)", fontStyle: "italic", fontSize: 14, color: "#A09A8C", margin: 0 }}>No upcoming events</p>
                  </div>
                )}

                {canEdit && (
                  <div style={{ padding: 18, border: "1px solid #E8E2D2", borderRadius: 14, background: "#FBF8F2" }}>
                    <p style={mono}>Quick add</p>
                    <input
                      value={quickTitle}
                      onChange={e => setQuickTitle(e.target.value)}
                      placeholder="Event name"
                      style={{ marginTop: 12, width: "100%", padding: "10px 12px", border: "1px solid #E2DDCF", borderRadius: 10, background: "#FBF8F2", fontSize: 14, fontFamily: "var(--font-inter)", outline: "none", boxSizing: "border-box" }}
                    />
                    <div style={{ display: "flex", gap: 6, marginTop: 8 }}>
                      <input
                        type="date"
                        value={quickDate}
                        onChange={e => setQuickDate(e.target.value)}
                        style={{ flex: 1, padding: "8px 10px", borderRadius: 8, border: "1px solid #E2DDCF", background: "#FBF8F2", fontSize: 12, color: quickDate ? "#5A5466" : "#A09A8C", fontFamily: "var(--font-inter)", outline: "none" }}
                      />
                      <select
                        value={quickCategory}
                        onChange={e => setQuickCategory(e.target.value as Category)}
                        style={{ flex: 1, padding: "8px 10px", borderRadius: 8, border: "1px solid #E2DDCF", background: "#FBF8F2", fontSize: 12, color: "#5A5466", fontFamily: "var(--font-inter)", outline: "none", cursor: "pointer" }}
                      >
                        <option value="ministry">Ministry</option>
                        <option value="social">Social</option>
                        <option value="outreach">Outreach</option>
                        <option value="welcoming">Welcoming</option>
                        <option value="workshop">Workshop</option>
                      </select>
                    </div>
                    <button
                      onClick={handleQuickCreate}
                      disabled={creatingEvent || !quickTitle.trim() || !quickDate}
                      style={{ marginTop: 12, width: "100%", padding: "10px 14px", borderRadius: 10, border: "none", background: "#2D0F2E", color: "#FBF8F2", fontSize: 13, fontWeight: 500, cursor: creatingEvent || !quickTitle.trim() || !quickDate ? "not-allowed" : "pointer", opacity: creatingEvent || !quickTitle.trim() || !quickDate ? 0.5 : 1 }}
                    >
                      {creatingEvent ? "Creating…" : "Create & open plan"}
                    </button>
                    <p style={{ fontSize: 11, color: "#8A8497", marginTop: 8, textAlign: "center" }}>Drops you straight into Overview — no modal.</p>
                  </div>
                )}
              </aside>
            </section>

            {/* Meeting notes timeline */}
            <MeetingNotesSection teamId={teamId} userId={userId} userName={userName} canWrite={canEdit} />
          </div>
        )}

        {/* PLAN — events list with Plan → links */}
        {teamTab === "Plan" && (
          <div>
            <div style={{ marginBottom: 28 }}>
              <p style={mono}>Events & planning</p>
              <h2 style={{ fontFamily: "var(--font-instrument-serif)", fontSize: 36, margin: "6px 0 0", letterSpacing: "-0.01em", color: "#13101A" }}>Event Plans</h2>
            </div>
            {calEvents.length === 0 ? (
              <div style={{ borderLeft: "2px solid #E8E2D2", paddingLeft: 20 }}>
                <p style={{ fontFamily: "var(--font-instrument-serif)", fontStyle: "italic", fontSize: 15, color: "#A09A8C" }}>No events yet. Use Quick Add on the General tab to create one.</p>
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                {calEvents.map(ev => {
                  const isPlanned = plannedIds.has(ev.id)
                  const dateStr = new Date(ev.start_date).toLocaleDateString("en-US", { weekday: "short", month: "long", day: "numeric" })
                  return (
                    <div key={ev.id} style={{ display: "flex", alignItems: "center", gap: 18, padding: "18px 20px", border: "1px solid #E8E2D2", borderRadius: 14, background: "#FBF8F2" }}>
                      <span style={{ width: 8, height: 8, borderRadius: 99, background: CATEGORY_CONFIG[ev.category]?.dot ?? "#3E1540", flexShrink: 0 }} />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <p style={{ fontFamily: "var(--font-instrument-serif)", fontSize: 18, color: "#13101A", margin: 0, letterSpacing: "-0.01em" }}>{ev.title}</p>
                        <p style={{ fontSize: 13, color: "#8A8497", margin: "3px 0 0" }}>{dateStr}{ev.location ? ` · ${ev.location}` : ""}</p>
                      </div>
                      <span style={{ fontSize: 11, fontWeight: 500, color: isPlanned ? "#14532D" : "#92400E", background: isPlanned ? "#DCFCE7" : "#FEF3C7", borderRadius: 9999, padding: "3px 10px", whiteSpace: "nowrap" }}>
                        {isPlanned ? "Planned ✓" : "Needs planning"}
                      </span>
                      <button
                        onClick={() => onPlanningEventChange(ev)}
                        style={{ padding: "8px 16px", borderRadius: 10, border: "1px solid #3E1540", background: "transparent", color: "#3E1540", fontSize: 13, fontWeight: 500, cursor: "pointer", whiteSpace: "nowrap", flexShrink: 0 }}
                      >
                        {isPlanned ? "View plan →" : "Plan →"}
                      </button>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )}

        {/* ROSTER — team member list */}
        {teamTab === "Roster" && (
          <div>
            <div style={{ marginBottom: 28 }}>
              <p style={mono}>Team members</p>
              <h2 style={{ fontFamily: "var(--font-instrument-serif)", fontSize: 36, margin: "6px 0 0", letterSpacing: "-0.01em", color: "#13101A" }}>Roster</h2>
            </div>
            {roster.length === 0 ? (
              <p style={{ fontFamily: "var(--font-instrument-serif)", fontStyle: "italic", fontSize: 15, color: "#A09A8C" }}>No members yet.</p>
            ) : (
              <div style={{ display: "flex", flexDirection: "column" }}>
                {roster.map((m, i) => (
                  <div key={m.id} style={{ display: "flex", alignItems: "center", gap: 16, padding: "16px 0", borderBottom: i < roster.length - 1 ? "1px solid #F0EDE8" : undefined }}>
                    <div style={{ width: 38, height: 38, borderRadius: 10, background: "#3E1540", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                      <span style={{ fontFamily: "var(--font-instrument-serif)", fontSize: 15, color: "#F6F4EF" }}>{m.name.split(/\s+/).map((w: string) => w[0]).join("").slice(0, 2).toUpperCase()}</span>
                    </div>
                    <p style={{ flex: 1, fontSize: 15, fontWeight: 500, color: "#13101A", margin: 0 }}>{m.name}</p>
                    <span style={{ padding: "3px 12px", borderRadius: 999, background: "rgba(62,21,64,0.08)", color: "#3E1540", fontSize: 12, fontWeight: 500 }}>{m.role}</span>
                    {m.user_id === userId && <span style={{ fontSize: 11, color: "#8A8497" }}>you</span>}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* RESOURCES — role links/docs */}
        {teamTab === "Resources" && (
          <div>
            <div style={{ marginBottom: 28 }}>
              <p style={mono}>Team resources</p>
              <h2 style={{ fontFamily: "var(--font-instrument-serif)", fontSize: 36, margin: "6px 0 0", letterSpacing: "-0.01em", color: "#13101A" }}>Resources</h2>
            </div>
            <StudentOrgRoleTabContent teamId={teamId} roleName="General" userId={userId} canWrite={canEdit} />
          </div>
        )}
      </div>
    </div>
  )
}

export function PlanTab({ userId, userName, ministryId, ministryName, userTeams, allTeams, isAdmin, onTeamsChange, showCreateTeam, onShowCreateTeam, activeTeamId, onTeamCreated }: PlanTabProps) {
  const activeTeamName = userTeams.find(t => t.teamId === activeTeamId)?.teamName ?? (isAdmin ? ministryName : "Plan")
  const setShowCreateTeam = onShowCreateTeam
  const [openTeam, setOpenTeam] = useState<Team | null>(null)
  const [studentOrgPlanningEvent, setStudentOrgPlanningEvent] = useState<CalendarEvent | null>(null)
  // Reset per-team transient state whenever the active team changes.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { setOpenTeam(null); setStudentOrgPlanningEvent(null) }, [activeTeamId])

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

  const isPraiseTeam = /\b(praise|worship)\b/.test(activeTeamLabel) || activeTeamPerms.some(p => ["can_manage_worship_set", "can_view_worship_set", "can_generate_slides", "can_manage_schedule"].includes(p))
  const praiseTeamPerms = isPraiseTeam ? activeTeamPerms : []
  const canManageWorship = isAdmin || praiseTeamPerms.includes("can_manage_worship_set")
  const canManageSchedule = isAdmin || praiseTeamPerms.includes("can_manage_schedule")

  const activeTeamFull = allTeams.find(t => t.id === activeTeamId)
    ?? (activeUserTeam ? { id: activeUserTeam.teamId, name: activeUserTeam.teamName, icon: activeUserTeam.teamIcon, description: activeUserTeam.teamDescription, created_by: "", member_count: 0 } : undefined)

  const isActiveTeamPresident = (activeUserTeam?.roleName ?? "").toLowerCase().includes("president")
  const canOpenTeamSettings = isAdmin || isActiveTeamPresident

  return (
    <div className="pb-2 md:pb-0">
      {/* Desktop Topbar */}
      <DesktopTopbar crumbs={["Central", "Plan"]} />

      {/* Mobile Header */}
      <div className="flex items-center justify-between px-5 pt-14 pb-5 md:hidden">
        <div className="flex items-center gap-2.5">
          <svg width="26" height="26" viewBox="0 0 100 100" fill="none">
            <circle cx="50" cy="50" r="44" stroke="#3E1540" strokeWidth="6" />
            <rect x="47" y="22" width="6" height="56" fill="#3E1540" />
            <rect x="22" y="47" width="56" height="6" fill="#3E1540" />
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

      {/* Desktop Editorial Header — swaps to event header when an event plan is open */}
      <div className="hidden md:flex items-start justify-between px-14 pt-11 pb-8 border-b border-[#E5E0D2]">
        {isStudentOrgBoard && studentOrgPlanningEvent ? (() => {
          const ev = studentOrgPlanningEvent
          const evStart = new Date(ev.start_date)
          const evDateStr = evStart.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })
          const evCfg = CATEGORY_CONFIG[ev.category]
          const evDesc = [ev.description, ev.location].filter(Boolean).join(" · ")
          return (
            <>
              <div>
                <button
                  onClick={() => setStudentOrgPlanningEvent(null)}
                  style={{ background: "none", border: "none", cursor: "pointer", padding: 0, fontFamily: "var(--font-inter)", fontSize: "12px", color: "#8A8497", display: "flex", alignItems: "center", gap: 4 }}
                >
                  <ArrowLeft className="w-3 h-3" /> Back to calendar
                </button>
                <p style={{ ...monoStyle, marginTop: 12 }}>{evCfg.label.toUpperCase()} · {evDateStr.toUpperCase()}</p>
                <h1 style={{ margin: "14px 0 0", fontFamily: "var(--font-instrument-serif)", fontWeight: 400, fontSize: "52px", lineHeight: 1.05, letterSpacing: "-0.01em", color: "#13101A" }}>
                  {ev.title}
                </h1>
                {evDesc && <p style={{ marginTop: "12px", color: "#5A5466", fontSize: "14px", maxWidth: "560px" }}>{evDesc}</p>}
              </div>
              {canEditStudentOrg && (
                <button
                  className="w-8 h-8 flex items-center justify-center rounded-lg border border-[#E5E0D2] bg-[#FBF8F2] hover:bg-[#EFEAE0] transition-colors flex-shrink-0"
                  title="Edit event"
                >
                  <Pencil className="w-3.5 h-3.5 text-[#5A5466]" />
                </button>
              )}
            </>
          )
        })() : (
          <>
            <div>
              <p style={monoStyle}>{new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })}</p>
              <h1 style={{ margin: "14px 0 0", fontFamily: "var(--font-instrument-serif)", fontWeight: 400, fontSize: "52px", lineHeight: 1.05, letterSpacing: "-0.01em", color: "#13101A" }}>
                {activeTeamName}
              </h1>
              <p style={{ marginTop: "12px", color: "#5A5466", fontSize: "14px", maxWidth: "560px" }}>
                The week as it stands. Groups to prepare, people to thank.
              </p>
            </div>
            {activeTeamFull && canOpenTeamSettings && (
              <button
                onClick={() => setOpenTeam(activeTeamFull)}
                className="w-8 h-8 flex items-center justify-center rounded-lg border border-[#E5E0D2] bg-[#FBF8F2] hover:bg-[#EFEAE0] transition-colors flex-shrink-0"
                title="Team settings"
              >
                <Settings className="w-4 h-4 text-[#5A5466]" />
              </button>
            )}
          </>
        )}
      </div>

      {/* Desktop content */}
      <div className="hidden md:block">
        {isPraiseTeam && activeTeamId ? (
          <div className="px-14 py-7">
            <PraiseTeamTab
              teamId={activeTeamId}
              ministryId={ministryId}
              userId={userId}
              canManage={canManageWorship}
              canManageSchedule={canManageSchedule}
            />
          </div>
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
            onTeamSettings={activeTeamFull && canOpenTeamSettings ? () => setOpenTeam(activeTeamFull) : undefined}
            planningEvent={studentOrgPlanningEvent}
            onPlanningEventChange={setStudentOrgPlanningEvent}
          />
        ) : (
          <div className="px-14 py-7">
            {(() => {
              const perms = activeUserTeam?.permissions ?? []
              const showCalendar = isAdmin || perms.includes("can_plan_events")
              if (!showCalendar) return null
              return (
                <MinistryCalendar
                  ministryId={ministryId}
                  teamId={activeTeamId}
                  userId={userId}
                  canEdit={isAdmin || perms.includes("can_plan_events")}
                />
              )
            })()}
          </div>
        )}
      </div>

      {/* Mobile content */}
      <div className="md:hidden px-5 pb-4">
        {isPraiseTeam && activeTeamId ? (
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
            onTeamSettings={activeTeamFull && canOpenTeamSettings ? () => setOpenTeam(activeTeamFull) : undefined}
            planningEvent={studentOrgPlanningEvent}
            onPlanningEventChange={setStudentOrgPlanningEvent}
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
                        onClick={() => setOpenTeam(team)}
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
          onClose={() => setOpenTeam(null)}
          onChanged={() => { setOpenTeam(null); onTeamsChange() }}
        />
      )}
    </div>
  )
}

// ── PraiseTeamTab ─────────────────────────────────────────────────────────────

const WORSHIP_ROLE_OPTIONS = ["Vocals", "Keys", "Guitar", "Bass", "Drums", "Other"]

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
  const [subTab, setSubTab] = useState<"schedule" | "setlist" | "slides" | "availability">("schedule")

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

  // Slides state
  const [slidesWeekId, setSlidesWeekId] = useState<string | null>(null)
  const [rawOcrBySong, setRawOcrBySong] = useState<Record<string, string>>({})
  type SlidePage = { songTitle: string; songKey: string; section: string; lyrics: string; isTitle?: boolean }
  const [slidesDeck, setSlidesDeck] = useState<SlidePage[] | null>(null)
  const [slidesGenerating, setSlidesGenerating] = useState(false)
  const [slidesOverlayOpen, setSlidesOverlayOpen] = useState(false)
  const [slidesActiveIndex, setSlidesActiveIndex] = useState(0)

  // Generation counter to cancel stale loadSchedule results
  const loadScheduleGenRef = useRef(0)

  // Week delete confirmation
  const [confirmDeleteWeekId, setConfirmDeleteWeekId] = useState<string | null>(null)

  const now = new Date()
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split("T")[0]
  const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().split("T")[0]

  const monoStyle: React.CSSProperties = { fontFamily: "ui-monospace,'SF Mono',Menlo,monospace", fontSize: 11, letterSpacing: "0.12em", textTransform: "uppercase", color: "#8A8497" }
  const subTabStyle = (active: boolean): React.CSSProperties => ({
    padding: "12px 16px", fontSize: 14, fontFamily: "var(--font-inter)", fontWeight: active ? 600 : 400,
    color: active ? "#3E1540" : "#8A8497", boxShadow: active ? "inset 0 -2px 0 0 #3E1540" : "none",
    background: "none", border: "none", cursor: "pointer", whiteSpace: "nowrap" as const, outline: "none",
  })

  async function loadSchedule() {
    const gen = ++loadScheduleGenRef.current
    setScheduleLoading(true)
    const { data: weeksData } = await supabase
      .from("worship_weeks")
      .select("id, week_date, leader_id, status, profiles!leader_id(name)")
      .eq("team_id", teamId)
      .gte("week_date", monthStart)
      .lte("week_date", monthEnd)
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
      return { id: raw.id, week_date: raw.week_date, leader_id: raw.leader_id, leader_name: p?.name ?? null, status: raw.status as WorshipWeek["status"], roles: rolesByWeek[raw.id] ?? [] }
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

  // Set default week for slides/charts tabs once weeks are loaded
  useEffect(() => {
    if (weeks.length === 0) return
    const todayStr = new Date().toISOString().split("T")[0]
    const upcoming = weeks.find(w => w.week_date >= todayStr) ?? weeks[0]
    setSlidesWeekId(prev => prev ?? upcoming.id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [weeks])

  useEffect(() => {
    if (subTab === "availability") loadAvailability()
    if (["setlist", "slides"].includes(subTab)) loadSetList()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [subTab, teamId])

  async function handleAddWeek() {
    if (!newDate) return
    if (!newLeaderId) { setNewLeaderError(true); return }
    setNewLeaderError(false)
    setAddingWeek(true)
    const { error } = await supabase.from("worship_weeks").insert({ team_id: teamId, ministry_id: ministryId, week_date: newDate, leader_id: newLeaderId, status: "draft" })
    if (!error) { setShowAddWeek(false); setNewDate(""); setNewLeaderId(""); await loadSchedule() }
    setAddingWeek(false)
  }

  async function handleAddMember(weekId: string) {
    if (!addMemberUserId) return
    setAddingMember(true)
    const { error } = await supabase.from("worship_roles").insert({ week_id: weekId, user_id: addMemberUserId, role_name: addMemberRole })
    if (!error) { setAddMemberToWeekId(null); setAddMemberUserId(""); setAddMemberRole("Vocals"); setAddMemberSearch(""); await loadSchedule() }
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
        setRawOcrBySong(prev => ({ ...prev, [songId]: rawText }))

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

  function handleExportSlides(songs: WorshipSong[]) {
    const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>Worship Slides</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { background: #1a0a1c; font-family: Georgia, serif; }
  .slide { width: 100vw; height: 100vh; display: flex; flex-direction: column; align-items: center; justify-content: center; background: #3E1540; page-break-after: always; }
  .title { font-size: clamp(48px, 8vw, 96px); color: #F6F4EF; text-align: center; font-weight: 400; line-height: 1.15; padding: 0 10vw; }
  .key { margin-top: 28px; font-family: monospace; font-size: clamp(18px, 2.5vw, 28px); color: rgba(246,244,239,0.55); letter-spacing: 0.2em; text-transform: uppercase; }
  @media print { .slide { page-break-after: always; } }
</style>
</head>
<body>
${songs.map(s => `  <div class="slide"><p class="title">${esc(s.title)}</p><p class="key">${esc(s.key)}</p></div>`).join("\n")}
</body>
</html>`
    const blob = new Blob([html], { type: "text/html" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = "worship-slides.html"
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }

  async function handleGenerateSlides(songs: WorshipSong[]) {
    setSlidesGenerating(true)
    const allSlides: SlidePage[] = []

    for (const song of songs) {
      // Title slide for this song
      allSlides.push({ songTitle: song.title, songKey: song.key, section: "", lyrics: "", isTitle: true })

      let ocrText = rawOcrBySong[song.id]

      // If no cached OCR text but chart is available, re-fetch and OCR the PDF
      if (!ocrText && song.chart_url) {
        try {
          const buf = await fetch(song.chart_url).then(r => r.arrayBuffer())
          const pdfjsLib = await import("pdfjs-dist")
          pdfjsLib.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs"
          const pdf = await pdfjsLib.getDocument({ data: new Uint8Array(buf) }).promise
          const page = await pdf.getPage(1)
          const viewport = page.getViewport({ scale: 2 })
          const canvas = document.createElement("canvas")
          canvas.width = viewport.width
          canvas.height = viewport.height
          const ctx = canvas.getContext("2d")
          if (ctx) {
            await page.render({ canvasContext: ctx, viewport, canvas }).promise
            const { createWorker } = await import("tesseract.js")
            const worker = await createWorker("eng")
            const result = await worker.recognize(canvas)
            await worker.terminate()
            ocrText = result.data.text
            setRawOcrBySong(prev => ({ ...prev, [song.id]: ocrText }))
          }
        } catch (e) { console.error("[slides] OCR failed for", song.title, e) }
      }

      if (ocrText) {
        try {
          const res = await fetch("/api/generate-slides", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ ocrText }),
          })
          if (res.ok) {
            const data = await res.json()
            for (const s of (data.sections ?? [])) {
              allSlides.push({ songTitle: song.title, songKey: song.key, section: s.section, lyrics: s.lyrics })
            }
            continue
          } else {
            const errBody = await res.text().catch(() => "")
            console.error("[slides] generate-slides returned", res.status, errBody)
          }
        } catch (e) { console.error("[slides] fetch generate-slides failed", e) }
      }

      // Fallback: single title slide
      allSlides.push({ songTitle: song.title, songKey: song.key, section: "", lyrics: song.title })
    }

    setSlidesDeck(allSlides)
    setSlidesActiveIndex(0)
    setSlidesOverlayOpen(true)
    setSlidesGenerating(false)
  }

  // Keyboard navigation for the slides overlay
  useEffect(() => {
    if (!slidesOverlayOpen || !slidesDeck) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight" || e.key === "ArrowDown") {
        setSlidesActiveIndex(i => Math.min(i + 1, slidesDeck.length - 1))
      } else if (e.key === "ArrowLeft" || e.key === "ArrowUp") {
        setSlidesActiveIndex(i => Math.max(i - 1, 0))
      } else if (e.key === "Escape") {
        setSlidesOverlayOpen(false)
      }
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [slidesOverlayOpen, slidesDeck])

  const visibleWeeks = weeks
  const worshipLeaders = teamMembers.filter(m => m.role_name === "Worship Leader")
  const weekDates = weeks.map(w => w.week_date)
  const monthLabel = now.toLocaleDateString("en-US", { month: "long", year: "numeric" })

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

      {/* ── Slides full-screen overlay ── */}
      {slidesOverlayOpen && slidesDeck && (() => {
        const slide = slidesDeck[slidesActiveIndex]
        return (
          <div style={{ position: "fixed", inset: 0, zIndex: 200, background: "#3E1540", display: "flex", flexDirection: "column" }}>
            {/* Radial glow */}
            <div style={{ position: "absolute", inset: 0, background: "radial-gradient(ellipse at 50% 55%, rgba(246,244,239,0.12) 0%, transparent 65%)", pointerEvents: "none" }} />

            {/* Close button */}
            <button
              onClick={() => setSlidesOverlayOpen(false)}
              style={{ position: "absolute", top: 20, right: 20, zIndex: 10, width: 36, height: 36, borderRadius: "50%", background: "rgba(246,244,239,0.12)", border: "none", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", color: "#F6F4EF" }}
            >
              <X className="w-5 h-5" />
            </button>

            {/* Left tap zone */}
            <div
              onClick={() => setSlidesActiveIndex(i => Math.max(i - 1, 0))}
              style={{ position: "absolute", left: 0, top: 0, width: "33%", height: "100%", zIndex: 5, cursor: slidesActiveIndex > 0 ? "pointer" : "default" }}
            />
            {/* Right tap zone */}
            <div
              onClick={() => setSlidesActiveIndex(i => Math.min(i + 1, slidesDeck.length - 1))}
              style={{ position: "absolute", right: 0, top: 0, width: "33%", height: "100%", zIndex: 5, cursor: slidesActiveIndex < slidesDeck.length - 1 ? "pointer" : "default" }}
            />

            {/* Slide content */}
            <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "72px 40px 80px", textAlign: "center", position: "relative", zIndex: 6 }}>
              {slide.isTitle ? (
                /* ── Title slide ── */
                <>
                  <p style={{ fontFamily: "var(--font-inter)", fontSize: 11, fontWeight: 600, letterSpacing: "0.16em", textTransform: "uppercase" as const, color: "rgba(246,244,239,0.62)", marginBottom: 20 }}>
                    {slide.songKey ? `Key of ${slide.songKey}` : ""}
                  </p>
                  <p style={{ fontFamily: "var(--font-instrument-serif)", fontSize: "clamp(36px,7vw,72px)", color: "#F6F4EF", lineHeight: 1.15, fontWeight: 400 }}>
                    {slide.songTitle}
                  </p>
                  <div style={{ width: 40, height: 1.5, background: "rgba(246,244,239,0.32)", margin: "28px auto 0" }} />
                </>
              ) : (
                /* ── Lyric slide ── */
                <>
                  <p style={{ fontFamily: "var(--font-instrument-serif)", fontSize: 15, color: "rgba(246,244,239,0.45)", marginBottom: 6, letterSpacing: "0.01em" }}>{slide.songTitle}</p>
                  {slide.section && (
                    <p style={{ fontFamily: "var(--font-inter)", fontSize: 11, fontWeight: 600, letterSpacing: "0.14em", textTransform: "uppercase" as const, color: "rgba(246,244,239,0.35)", marginBottom: 28 }}>{slide.section}</p>
                  )}
                  <p style={{ fontFamily: "var(--font-instrument-serif)", fontSize: "clamp(26px,5.5vw,52px)", color: "#F6F4EF", lineHeight: 1.35, fontWeight: 400, whiteSpace: "pre-line" as const }}>
                    {slide.lyrics}
                  </p>
                </>
              )}
            </div>

            {/* Counter */}
            <div style={{ position: "absolute", bottom: 28, left: 0, right: 0, textAlign: "center", zIndex: 6 }}>
              <span style={{ fontFamily: "var(--font-inter)", fontSize: 13, color: "rgba(246,244,239,0.4)", letterSpacing: "0.04em" }}>
                {slidesActiveIndex + 1} / {slidesDeck.length}
              </span>
            </div>
          </div>
        )
      })()}

      {/* Sub-tabs */}
      <div style={{ borderBottom: "1px solid #ECE8DE", marginBottom: 24, display: "flex", overflowX: "auto", scrollbarWidth: "none" }}>
        <button style={subTabStyle(subTab === "schedule")} onClick={() => setSubTab("schedule")}>Schedule</button>
        <button style={subTabStyle(subTab === "setlist")} onClick={() => setSubTab("setlist")}>Set List</button>
        <button style={subTabStyle(subTab === "slides")} onClick={() => setSubTab("slides")}>Slides</button>
        <button style={subTabStyle(subTab === "availability")} onClick={() => setSubTab("availability")}>Availability</button>
      </div>

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
                  <label style={{ display: "block", fontSize: 12, fontWeight: 500, color: "#5A5466", marginBottom: 4 }}>Date</label>
                  <input type="date" value={newDate} onChange={e => setNewDate(e.target.value)}
                    style={{ width: "100%", padding: "10px 12px", borderRadius: 10, border: "1px solid #ECE8DE", background: "#FBF8F2", fontSize: 14, color: "#13101A", outline: "none", boxSizing: "border-box" as const }} />
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
                  <button onClick={() => { setShowAddWeek(false); setNewDate(""); setNewLeaderId("") }}
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
                return (
                  <div key={week.id} style={{ background: "#FBF8F2", border: "1px solid #E8E2D2", borderRadius: 12, overflow: "hidden" }}>

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

      {/* ── Slides ── */}
      {subTab === "slides" && (() => {
        const todayStr = new Date().toISOString().split("T")[0]
        const slidesSongs = (songsByWeek[slidesWeekId ?? ""] ?? []).sort((a, b) => a.order_index - b.order_index)
        return (
          <div>
            {/* Week selector */}
            {weeks.length > 1 && (
              <div style={{ marginBottom: 20 }}>
                <label style={{ display: "block", fontSize: 12, fontWeight: 500, color: "#5A5466", marginBottom: 6 }}>Week</label>
                <select
                  value={slidesWeekId ?? ""}
                  onChange={e => { setSlidesWeekId(e.target.value); setSlidesDeck(null) }}
                  style={{ padding: "9px 12px", borderRadius: 10, border: "1px solid #ECE8DE", background: "#FBF8F2", fontSize: 14, color: "#13101A", outline: "none" }}
                >
                  {weeks.map(w => (
                    <option key={w.id} value={w.id}>{worshipWeekDateLabel(w.week_date)}{w.week_date < todayStr ? " (past)" : ""}</option>
                  ))}
                </select>
              </div>
            )}

            {songsLoading ? (
              <div style={{ textAlign: "center", padding: "40px 0", color: "#8A8497", fontSize: 14 }}>Loading…</div>
            ) : slidesSongs.length === 0 ? (
              <div style={{ background: "#FBF8F2", border: "1.5px dashed #E2DDCF", borderRadius: 14, padding: "40px 24px", textAlign: "center" }}>
                <p style={{ fontFamily: "var(--font-instrument-serif)", fontSize: 18, color: "#13101A", marginBottom: 6 }}>No songs in the set list yet.</p>
                <p style={{ fontSize: 13, color: "#8A8497" }}>Add songs in the Set List tab first.</p>
              </div>
            ) : (
              <div>
                {/* Song list preview */}
                <div style={{ background: "#FBF8F2", border: "1px solid #E2DDCF", borderRadius: 14, overflow: "hidden", marginBottom: 16 }}>
                  {slidesSongs.map((song, i) => (
                    <div key={song.id} style={{ display: "flex", alignItems: "center", gap: 12, padding: "13px 18px", borderBottom: i < slidesSongs.length - 1 ? "1px solid #EFE9DA" : "none" }}>
                      <span style={{ fontFamily: "ui-monospace,'SF Mono',Menlo,monospace", fontSize: 11, color: "#C4C4C4", minWidth: 18 }}>{i + 1}</span>
                      <span style={{ fontFamily: "var(--font-instrument-serif)", fontSize: 18, color: "#13101A", flex: 1 }}>{song.title || <span style={{ fontFamily: "var(--font-inter)", fontSize: 14, color: "#C4C4C4" }}>Untitled</span>}</span>
                      {song.key && <span style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", width: 28, height: 28, fontFamily: "ui-monospace,'SF Mono',Menlo,monospace", fontSize: 12, fontWeight: 700, color: "#2D0F2E", background: "#EDE3EE", borderRadius: 8 }}>{song.key}</span>}
                      {!rawOcrBySong[song.id] && !song.chart_url && (
                        <span style={{ fontSize: 11, color: "#C4C4C4" }}>no chart</span>
                      )}
                    </div>
                  ))}
                </div>
                <div style={{ display: "flex", gap: 10 }}>
                  {canManage && (
                    <button
                      onClick={() => slidesDeck ? setSlidesOverlayOpen(true) : handleGenerateSlides(slidesSongs)}
                      disabled={slidesGenerating}
                      style={{ flex: 1, padding: "11px 0", background: slidesGenerating ? "#8A8497" : "#3E1540", color: "#F6F4EF", borderRadius: 12, fontSize: 14, fontWeight: 600, border: "none", cursor: slidesGenerating ? "not-allowed" : "pointer" }}
                    >
                      {slidesGenerating ? "Generating…" : slidesDeck ? "View slides" : "Generate slides"}
                    </button>
                  )}
                  {canManage && (
                    <button
                      onClick={() => handleExportSlides(slidesSongs)}
                      style={{ padding: "11px 18px", background: "transparent", color: "#3E1540", borderRadius: 12, fontSize: 14, fontWeight: 600, border: "1.5px solid #3E1540", cursor: "pointer" }}
                    >
                      Export HTML
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>
        )
      })()}

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
                      const cfg = CATEGORY_CONFIG[ev.category]
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
                const cfg = CATEGORY_CONFIG[ev.category]
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
  const cfg = CATEGORY_CONFIG[event.category]
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
}: {
  ministryId: string
  teamId: string | null
  userId: string
  onClose: () => void
  onSaved: (ev: CalendarEvent) => void
}) {
  const supabase = createClient()
  const [title, setTitle] = useState("")
  const [description, setDescription] = useState("")
  const [location, setLocation] = useState("")
  const [startDateStr, setStartDateStr] = useState("")
  const [startTimeStr, setStartTimeStr] = useState("09:00")
  const [endDateStr, setEndDateStr] = useState("")
  const [endTimeStr, setEndTimeStr] = useState("10:00")
  const [allDay, setAllDay] = useState(false)
  const [category, setCategory] = useState<Category>("regular")
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

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

    setSaving(true)
    setError(null)
    try {
      const { data, error: dbErr } = await supabase
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
          category,
          created_by: userId,
        })
        .select("id, title, description, location, start_date, end_date, all_day, category, created_by")
        .single()

      if (dbErr) {
        setError(dbErr.message)
        setSaving(false)
        return
      }
      onSaved(data as CalendarEvent)
    } catch (e: unknown) {
      setError((e as { message?: string }).message ?? "Failed to save event.")
    } finally {
      setSaving(false)
    }
  }

  const inputStyle: React.CSSProperties = {
    width: "100%",
    background: "#FBF8F2",
    border: "1px solid #E5E0D2",
    borderRadius: 8,
    padding: "8px 12px",
    fontSize: 14,
    color: "#13101A",
    outline: "none",
    boxSizing: "border-box",
  }

  const labelStyle: React.CSSProperties = {
    fontSize: 11,
    fontFamily: "ui-monospace, 'SF Mono', Menlo, monospace",
    letterSpacing: "0.06em",
    textTransform: "uppercase",
    color: "#8A8497",
    marginBottom: 4,
    display: "block",
  }

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 80, background: "#FBF8F2", display: "flex", flexDirection: "column", overflowY: "auto" }}>
      <div style={{ maxWidth: 560, width: "100%", margin: "0 auto", padding: "48px 24px 40px" }}>
        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 28 }}>
          <h2 style={{ fontFamily: "var(--font-instrument-serif)", fontSize: 28, fontWeight: 400, color: "#13101A", margin: 0 }}>
            Add Event
          </h2>
          <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", padding: 4 }}>
            <X className="w-5 h-5 text-[#8A8497]" />
          </button>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
          {/* Title */}
          <div>
            <label style={labelStyle}>Title *</label>
            <input style={inputStyle} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Event name" />
          </div>

          {/* Description */}
          <div>
            <label style={labelStyle}>Description</label>
            <textarea
              style={{ ...inputStyle, resize: "vertical", minHeight: 80 }}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Optional details…"
            />
          </div>

          {/* Location */}
          <div>
            <label style={labelStyle}>Location</label>
            <input style={inputStyle} value={location} onChange={(e) => setLocation(e.target.value)} placeholder="Room, building, or address" />
          </div>

          {/* All day toggle */}
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <input
              type="checkbox"
              id="allDay"
              checked={allDay}
              onChange={(e) => setAllDay(e.target.checked)}
              style={{ width: 16, height: 16, accentColor: "#3E1540", cursor: "pointer" }}
            />
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

          {/* Category picker */}
          <div>
            <label style={labelStyle}>Category</label>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {(Object.keys(CATEGORY_CONFIG) as Category[]).map((cat) => {
                const cfg = CATEGORY_CONFIG[cat]
                return (
                  <button
                    key={cat}
                    onClick={() => setCategory(cat)}
                    style={{
                      padding: "5px 14px",
                      borderRadius: 9999,
                      fontSize: 13,
                      fontWeight: 500,
                      cursor: "pointer",
                      border: category === cat ? `2px solid ${cfg.dot}` : "2px solid transparent",
                      background: cfg.bg,
                      color: cfg.text,
                      transition: "border-color 0.15s",
                    }}
                  >
                    {cfg.label}
                  </button>
                )
              })}
            </div>
          </div>

          {error && <p style={{ fontSize: 13, color: "#C0392B" }}>{error}</p>}

          {/* Actions */}
          <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", marginTop: 8 }}>
            <button
              onClick={onClose}
              style={{ padding: "8px 20px", borderRadius: 8, border: "1px solid #E5E0D2", background: "#FBF8F2", fontSize: 14, color: "#5A5466", cursor: "pointer" }}
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={saving}
              style={{ padding: "8px 20px", borderRadius: 8, border: "none", background: "#3E1540", color: "#F6F4EF", fontSize: 14, fontWeight: 500, cursor: saving ? "not-allowed" : "pointer", opacity: saving ? 0.7 : 1 }}
            >
              {saving ? "Saving…" : "Save event"}
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
}: {
  ministryId: string
  teamId: string | null
  userId: string
  canEdit: boolean
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
        .select("id, title, description, location, start_date, end_date, all_day, category, created_by")
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
              const cfg = CATEGORY_CONFIG[ev.category]
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
          onClose={() => setPlanningEvent(null)}
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
  onClose,
  inline = false,
  hideHero = false,
}: {
  calendarEvent: CalendarEvent
  ministryId: string
  userId: string
  canEdit: boolean
  onClose: () => void
  inline?: boolean
  hideHero?: boolean
}) {
  const supabase = createClient()
  const cfg = CATEGORY_CONFIG[calendarEvent.category]

  // Core data state
  const [plan, setPlan] = useState<EventPlan | null>(null)
  const [tasks, setTasks] = useState<EventTask[]>([])
  const [roles, setRoles] = useState<EventRole[]>([])
  const [notes, setNotes] = useState<EventNote[]>([])
  const [members, setMembers] = useState<{ id: string; name: string }[]>([])
  const [loading, setLoading] = useState(true)
  const [activeSection, setActiveSection] = useState<'overview' | 'checklist' | 'roles' | 'notes'>('overview')

  // Overview edit state
  const [turnout, setTurnout] = useState("")
  const [budget, setBudget] = useState("")
  const [overviewNotes, setOverviewNotes] = useState("")
  const [savingOverview, setSavingOverview] = useState(false)

  // Task add state
  const [newTaskTitle, setNewTaskTitle] = useState("")
  const [newTaskAssignee, setNewTaskAssignee] = useState("")
  const [newTaskDue, setNewTaskDue] = useState("")
  const [addingTask, setAddingTask] = useState(false)

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
      setTurnout(planData.expected_turnout != null ? String(planData.expected_turnout) : "")
      setBudget(planData.budget_allocated != null ? String(planData.budget_allocated) : "")
      setOverviewNotes(planData.overview_notes ?? "")

      const planId = planData.id

      // Fetch tasks with assignee name
      const { data: tasksData } = await supabase
        .from("event_tasks")
        .select("*, profiles!event_tasks_assigned_to_fkey(name)")
        .eq("event_plan_id", planId)
        .order("created_at", { ascending: true })

      setTasks((tasksData ?? []).map((t: Record<string, unknown>) => ({
        id: t.id as string,
        event_plan_id: t.event_plan_id as string,
        title: t.title as string,
        assigned_to: t.assigned_to as string | null,
        assigned_name: (t.profiles as { name?: string } | null)?.name,
        due_date: t.due_date as string | null,
        completed: t.completed as boolean,
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

      // Fetch ministry members for dropdowns
      const { data: membersData } = await supabase
        .from("profiles")
        .select("id, name")
        .eq("ministry_id", ministryId)
        .order("name")

      setMembers(membersData ?? [])
      setLoading(false)
    }
    init()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [calendarEvent.id, ministryId, userId])

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

  async function handleToggleTask(task: EventTask) {
    const newCompleted = !task.completed
    setTasks((prev) => prev.map((t) => t.id === task.id ? { ...t, completed: newCompleted, } : t))
    await supabase
      .from("event_tasks")
      .update({ completed: newCompleted, completed_at: newCompleted ? new Date().toISOString() : null })
      .eq("id", task.id)
  }

  async function handleAddTask() {
    if (!plan || !newTaskTitle.trim()) return
    setAddingTask(true)
    const { data } = await supabase
      .from("event_tasks")
      .insert({
        event_plan_id: plan.id,
        title: newTaskTitle.trim(),
        assigned_to: newTaskAssignee || null,
        due_date: newTaskDue || null,
        completed: false,
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
  const completedTasks = tasks.filter((t) => t.completed)

  const sections: { key: 'overview' | 'checklist' | 'roles' | 'notes'; label: string }[] = [
    { key: 'overview', label: 'Overview' },
    { key: 'checklist', label: 'Checklist' },
    { key: 'roles', label: 'Roles & Leads' },
    { key: 'notes', label: 'Notes' },
  ]

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
        ? { background: "#FBF8F2", minHeight: "100%" }
        : { position: "fixed", top: 0, bottom: 0, left: 0, right: 0, zIndex: 75, background: "#FBF8F2", overflowY: "auto" }
      }
      className={inline ? "" : "md:left-[296px]"}
    >
      {/* Plum hero header — hidden when the parent already renders a calm header (hideHero) */}
      {!hideHero && <div style={{ padding: inline ? "18px 56px 0" : "0 24px", paddingTop: 18 }}>
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
              <div style={{ fontFamily: "ui-monospace,'SF Mono',Menlo,monospace", fontSize: "11px", letterSpacing: "0.1em", textTransform: "uppercase", color: "rgba(251,248,242,0.65)", marginBottom: 0 }}>
                {cfg.label.toUpperCase()} · {dateStr}
              </div>
              <h1 style={{ fontFamily: "var(--font-instrument-serif)", fontSize: "clamp(36px,4vw,56px)", lineHeight: 1, margin: "8px 0 0", letterSpacing: -0.6, color: "#FBF8F2", fontWeight: 400 }}>
                {calendarEvent.title}
              </h1>
              {(calendarEvent.description || calendarEvent.location) && (
                <div style={{ fontSize: 15, color: "rgba(251,248,242,0.78)", marginTop: 10 }}>
                  {[calendarEvent.description, calendarEvent.location].filter(Boolean).join(" · ")}
                </div>
              )}
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 8, alignItems: "flex-end", flexShrink: 0 }}>
              <button style={{ padding: "8px 14px", borderRadius: 10, border: "1px solid rgba(251,248,242,0.25)", background: "rgba(251,248,242,0.08)", color: "#FBF8F2", fontSize: 13, fontFamily: "var(--font-inter)", cursor: "pointer", display: "flex", alignItems: "center", gap: 6 }}>
                ✎ Edit event
              </button>
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
      <div style={{ borderBottom: "1px solid #E8E2D2", zIndex: inline ? undefined : 10, padding: inline ? "0 56px" : "0 24px", marginTop: 22 }}>
        <div style={{ display: "flex", gap: 32 }}>
          {sections.map((s) => (
            <button
              key={s.key}
              onClick={() => setActiveSection(s.key)}
              style={{
                padding: "12px 0 14px",
                border: "none",
                borderBottom: activeSection === s.key ? "2px solid #3E1540" : "2px solid transparent",
                cursor: "pointer",
                fontSize: 15,
                fontWeight: activeSection === s.key ? 600 : 400,
                color: activeSection === s.key ? "#2D0F2E" : "#8A8497",
                background: "transparent",
                marginBottom: -1,
                fontFamily: "var(--font-inter)",
              }}
            >
              {s.label}
            </button>
          ))}
        </div>
      </div>

      {/* Content */}
      <div style={{ padding: inline ? "36px 56px 80px" : "24px 24px 80px" }}>
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
                  </div>
                  {/* Budget */}
                  <div style={{ padding: 22, border: "1px solid #E8E2D2", borderRadius: 14, background: "#FBF8F2" }}>
                    <p style={{ fontFamily: "ui-monospace,'SF Mono',Menlo,monospace", fontSize: "10px", letterSpacing: "0.1em", textTransform: "uppercase", color: "#8A8497" }}>Budget</p>
                    {canEdit ? (
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
                    <p style={{ fontSize: 13, color: "#8A8497", marginTop: 4 }}>allocated</p>
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
              <div style={{ maxWidth: 820 }}>
                <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between" }}>
                  <div>
                    <p style={{ fontFamily: "ui-monospace,'SF Mono',Menlo,monospace", fontSize: "11px", letterSpacing: "0.1em", textTransform: "uppercase", color: "#8A8497" }}>To Prepare</p>
                    <h2 style={{ fontFamily: "var(--font-instrument-serif)", fontSize: 36, margin: "6px 0 0", letterSpacing: -0.4, color: "#13101A", fontWeight: 400 }}>Checklist</h2>
                  </div>
                  <span style={{ fontSize: 13, color: "#8A8497" }}>{incompleteTasks.length} of {tasks.length} remaining</span>
                </div>

                {/* Inline add row — dashed border style */}
                {canEdit && (
                  <div style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 28, padding: "14px 16px", border: "1px dashed #C4C0B0", borderRadius: 12, background: "#F8F4EA" }}>
                    <span style={{ color: "#8A8497", display: "flex" }}>+</span>
                    <input
                      value={newTaskTitle}
                      onChange={(e) => setNewTaskTitle(e.target.value)}
                      placeholder="Add a task…"
                      style={{ flex: 1, background: "none", border: "none", outline: "none", fontSize: 15, fontFamily: "var(--font-inter)", color: "#13101A" }}
                      onKeyDown={(e) => { if (e.key === "Enter") handleAddTask() }}
                    />
                    <select
                      value={newTaskAssignee}
                      onChange={(e) => setNewTaskAssignee(e.target.value)}
                      style={{ padding: "6px 12px", borderRadius: 999, border: "1px solid #E2DDCF", background: "#FBF8F2", color: "#5A5466", fontSize: 12, cursor: "pointer", fontFamily: "var(--font-inter)" }}
                    >
                      <option value="">Unassigned</option>
                      {members.map((m) => (
                        <option key={m.id} value={m.id}>{m.name}</option>
                      ))}
                    </select>
                    <input
                      type="date"
                      value={newTaskDue}
                      onChange={(e) => setNewTaskDue(e.target.value)}
                      style={{ padding: "6px 12px", borderRadius: 999, border: "1px solid #E2DDCF", background: "#FBF8F2", color: "#5A5466", fontSize: 12, fontFamily: "var(--font-inter)", cursor: "pointer" }}
                    />
                    <button
                      onClick={handleAddTask}
                      disabled={addingTask || !newTaskTitle.trim()}
                      style={{ padding: "8px 16px", borderRadius: 999, border: "none", background: "#2D0F2E", color: "#FBF8F2", fontSize: 13, cursor: addingTask || !newTaskTitle.trim() ? "not-allowed" : "pointer", fontWeight: 500, opacity: addingTask || !newTaskTitle.trim() ? 0.5 : 1 }}
                    >
                      Add
                    </button>
                  </div>
                )}

                {/* Task rows */}
                <div style={{ marginTop: 22, display: "flex", flexDirection: "column" }}>
                  {tasks.length === 0 && (
                    <p style={{ fontFamily: "var(--font-instrument-serif)", fontStyle: "italic", fontSize: 15, color: "#A09A8C", padding: "24px 0" }}>No tasks yet.</p>
                  )}
                  {tasks.map((task, i) => (
                    <div key={task.id} style={{ display: "flex", alignItems: "center", gap: 14, padding: "14px 4px", borderBottom: i === tasks.length - 1 ? "none" : "1px solid #E8E2D2" }}>
                      <button
                        onClick={() => handleToggleTask(task)}
                        style={{ width: 18, height: 18, borderRadius: 5, border: "1.5px solid " + (task.completed ? "#3E1540" : "#C4C0B0"), background: task.completed ? "#3E1540" : "transparent", display: "grid", placeItems: "center", cursor: "pointer", flexShrink: 0 }}
                      >
                        {task.completed && <Check className="w-2.5 h-2.5 text-white" />}
                      </button>
                      <span style={{ flex: 1, fontSize: 15, color: task.completed ? "#A09A8C" : "#13101A", textDecoration: task.completed ? "line-through" : "none", lineHeight: 1.4 }}>{task.title}</span>
                      {task.assigned_name && (
                        <span style={{ padding: "5px 12px", borderRadius: 999, background: "#F1ECDE", border: "1px solid #E8E2D2", fontSize: 12, color: "#2D0F2E", whiteSpace: "nowrap" }}>{task.assigned_name}</span>
                      )}
                      {task.due_date && (
                        <span style={{ fontSize: 13, color: "#8A8497", width: 64, textAlign: "right", whiteSpace: "nowrap" }}>
                          {new Date(task.due_date + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                        </span>
                      )}
                      {canEdit && (
                        <button onClick={() => handleDeleteTask(task.id)} style={{ background: "none", border: "none", cursor: "pointer", padding: 0, color: "#C4C4C4" }}>
                          <X className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* ── Roles & Leads ── */}
            {activeSection === 'roles' && (
              <div style={{ maxWidth: 820 }}>
                <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between" }}>
                  <div>
                    <p style={{ fontFamily: "ui-monospace,'SF Mono',Menlo,monospace", fontSize: "11px", letterSpacing: "0.1em", textTransform: "uppercase", color: "#8A8497" }}>{"Who's Responsible"}</p>
                    <h2 style={{ fontFamily: "var(--font-instrument-serif)", fontSize: 36, margin: "6px 0 0", letterSpacing: -0.4, color: "#13101A", fontWeight: 400 }}>Roles &amp; Leads</h2>
                  </div>
                  {canEdit && (
                    <button
                      onClick={() => { setNewRoleName(""); setNewRoleNotes(""); setNewRoleAssignee(""); setAddingRole(false) }}
                      style={{ padding: "8px 14px", borderRadius: 10, border: "1px solid #3E1540", color: "#3E1540", background: "transparent", fontSize: 13, cursor: "pointer", fontWeight: 500, display: "flex", alignItems: "center", gap: 6 }}
                    >
                      + Add role
                    </button>
                  )}
                </div>

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
          </>
        )}
      </div>
    </div>
  )
}

// ── CreateTeamOverlay ─────────────────────────────────────────────────────────

export function CreateTeamOverlay({ userId, userName, ministryId, onClose, onCreated }: {
  userId: string
  userName: string
  ministryId: string
  onClose: () => void
  onCreated: (teamId: string) => void
}) {
  const supabase = createClient()
  const [step, setStep] = useState<CreateStep>("preset")
  const [teamName, setTeamName] = useState("")
  const [teamIcon, setTeamIcon] = useState("👥")
  const [teamDesc, setTeamDesc] = useState("")
  const [roles, setRoles] = useState<DraftRole[]>([{ name: "Member", permissions: [] }])
  const [editingRoleIdx, setEditingRoleIdx] = useState<number | null>(null)
  const [ministryMembers, setMinistryMembers] = useState<{ id: string; name: string }[]>([])
  const [memberSearch, setMemberSearch] = useState("")
  const [selectedMembers, setSelectedMembers] = useState<{ userId: string; roleIdx: number }[]>([])
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
    setSaving(true)
    setError(null)

    const { data: team, error: teamErr } = await supabase
      .from("teams")
      .insert({ name: teamName.trim(), icon: teamIcon, description: teamDesc.trim() || null, ministry_id: ministryId, created_by: userId })
      .select("id")
      .single()

    if (teamErr || !team) { setError(teamErr?.message ?? "Failed to create team."); setSaving(false); return }

    const { data: createdRoles, error: rolesErr } = await supabase
      .from("team_roles")
      .insert(roles.map((r) => ({ team_id: team.id, name: r.name.trim(), permissions: r.permissions })))
      .select("id")

    if (rolesErr || !createdRoles) { setError(rolesErr?.message ?? "Failed to create roles."); setSaving(false); return }

    // Build members list — always include creator as president (or first role), then others
    const creatorRoleIdx = presidentRoleIdx >= 0 ? presidentRoleIdx : 0
    const creatorAlreadySelected = selectedMembers.some((m) => m.userId === userId)
    const allMembers = creatorAlreadySelected
      ? selectedMembers
      : [{ userId, roleIdx: creatorRoleIdx }, ...selectedMembers]

    const { error: membersErr } = await supabase.from("team_members").insert(
      allMembers.map((m) => ({
        team_id: team.id,
        user_id: m.userId,
        role_id: createdRoles[m.roleIdx]?.id ?? createdRoles[0].id,
        added_by: userId,
      }))
    )
    if (membersErr) { setError(membersErr.message); setSaving(false); return }

    onCreated(team.id)
  }

  const filteredMembers = ministryMembers.filter((m) =>
    m.name.toLowerCase().includes(memberSearch.toLowerCase())
  )

  const canAdvance = teamName.trim() !== "" && roles.every((r) => r.name.trim() !== "")

  const STEPS = ["Choose a shape", "Customize", "Invite"]
  const stepIndex = step === "preset" ? 0 : step === "customize" ? 1 : 2

  return (
    <div className="fixed inset-0 z-[70] bg-[#FBF8F2] max-w-[390px] mx-auto flex flex-col md:left-[296px] md:max-w-none">
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
            <button onClick={handleSave} disabled={saving} className="text-[13px] font-semibold text-[#3E1540] disabled:opacity-30">
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
              {TEAM_PRESETS.map((preset) => (
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
              ))}
            </div>

            <button
              onClick={() => { setTeamName(""); setTeamIcon("👥"); setTeamDesc(""); setRoles([{ name: "Member", permissions: [] }]); setStep("customize") }}
              className="w-full mt-3 bg-transparent rounded-2xl border border-dashed border-[#ECE8DE] p-4 text-left hover:border-[#3E1540]/30 hover:bg-[#FDFBF7] transition-all flex items-center gap-3 md:mt-4"
            >
              <div className="w-8 h-8 rounded-lg border border-dashed border-[#C4C4C4] flex items-center justify-center text-[#8A8497] flex-shrink-0">
                <Plus className="w-4 h-4" />
              </div>
              <div>
                <p style={{ fontFamily: "var(--font-instrument-serif)", fontSize: 17 }} className="text-[#13101A]">Start from scratch</p>
                <p className="text-[12px] text-[#8A8497] mt-0.5">Build custom roles and permissions</p>
              </div>
            </button>

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
            <p className="text-[13px] text-[#8A8497]">Add members now, or share the invite code later.</p>

            {/* Creator row — always shown, always president */}
            <div className="flex items-center gap-3 bg-[#F4F1E8] rounded-xl border border-[#ECE8DE] p-3">
              <div className="w-5 h-5 rounded-md bg-[#3E1540] border-[#3E1540] border-2 flex items-center justify-center flex-shrink-0">
                <Check className="w-3 h-3 text-white" />
              </div>
              <span className="flex-1 text-[14px] font-medium text-[#13101A]">
                {userName} <span className="text-[#8A8497] font-normal">(you)</span>
              </span>
              <span className="text-[12px] text-[#5A5466] font-medium">
                {presidentRoleIdx >= 0 ? roles[presidentRoleIdx].name : roles[0]?.name}
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
                <p className="text-[13px] text-[#8A8497] text-center py-6">No members found.</p>
              )}
              {filteredMembers.map((member) => {
                const sel = selectedMembers.find((m) => m.userId === member.id)
                // Roles available to non-creator members: exclude president roles
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
    </div>
  )
}

// ── TeamDetailOverlay ─────────────────────────────────────────────────────────

export function TeamDetailOverlay({ team, userId, ministryId, isAdmin, onClose, onChanged }: {
  team: Team
  userId: string
  ministryId: string
  isAdmin: boolean
  onClose: () => void
  onChanged: () => void
}) {
  const supabase = createClient()
  const [roles, setRoles] = useState<TeamRole[]>([])
  const [members, setMembers] = useState<TeamMemberDisplay[]>([])
  const [loading, setLoading] = useState(true)
  const [showAddMember, setShowAddMember] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [ministryMembers, setMinistryMembers] = useState<{ id: string; name: string; email?: string }[]>([])
  const [addSearch, setAddSearch] = useState("")
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [selectedRoleId, setSelectedRoleId] = useState<string>("")
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [activeRole, setActiveRole] = useState(0)
  const [hoveredMemberId, setHoveredMemberId] = useState<string | null>(null)
  const [confirmRemoveId, setConfirmRemoveId] = useState<string | null>(null)

  const isPresident = members.some(m => m.user_id === userId && m.role_name.toLowerCase().includes("president"))
  const canDelete = isAdmin || isPresident
  const myRolePerms = roles.find(r => r.id === members.find(m => m.user_id === userId)?.role_id)?.permissions ?? []
  const canManageTeam = isAdmin || myRolePerms.includes("can_manage_team")

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
      setRoles((rolesData ?? []).map((r) => ({ ...r, permissions: Array.isArray(r.permissions) ? r.permissions : [] })))
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
    setSelectedRoleId(roles[0]?.id ?? "")
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
    if (!selectedRoleId) { setError("This team has no roles. Delete the team and recreate it."); return }
    setSaving(true)
    setError(null)
    const { error: err } = await supabase.from("team_members").insert(
      Array.from(selectedIds).map((uid) => ({ team_id: team.id, user_id: uid, role_id: selectedRoleId, added_by: userId }))
    )
    if (err) { setError(err.message); setSaving(false); return }
    setShowAddMember(false)
    setSelectedIds(new Set())
    setAddSearch("")
    setSaving(false)
    onChanged()
  }

  async function handleRemoveMember(memberId: string) {
    await supabase.from("team_members").delete().eq("team_id", team.id).eq("user_id", memberId)
    setMembers((prev) => prev.filter((m) => m.user_id !== memberId))
    setConfirmRemoveId(null)
  }

  async function handleRenameTeam() {
    const val = teamNameDraft.trim()
    if (!val || val === localTeamName) { setEditingTeamName(false); return }
    await supabase.from("teams").update({ name: val }).eq("id", team.id)
    setLocalTeamName(val)
    setEditingTeamName(false)
  }

  async function handleDeleteRole(roleId: string) {
    await supabase.from("team_roles").delete().eq("id", roleId)
    setRoles(prev => {
      const next = prev.filter(r => r.id !== roleId)
      setActiveRole(cur => Math.min(cur, Math.max(0, next.length - 1)))
      return next
    })
  }

  async function handleAddRole() {
    const val = newRoleName.trim()
    if (!val) { setAddingRole(false); return }
    const { data } = await supabase.from("team_roles")
      .insert({ team_id: team.id, name: val, permissions: [] })
      .select("id, team_id, name, permissions").single()
    if (data) {
      const newRole = { ...data, permissions: [] as string[] }
      setRoles(prev => { const next = [...prev, newRole]; setActiveRole(next.length - 1); return next })
    }
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

  const filteredAdd = ministryMembers.filter((m) =>
    m.name.toLowerCase().includes(addSearch.toLowerCase())
  )

  const addMemberForm = (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      {/* Role picker */}
      {roles.length > 1 && (
        <div>
          <p style={{ fontFamily: "ui-monospace,'SF Mono',Menlo,monospace", fontSize: 11, fontWeight: 400, color: "#8A8497", textTransform: "uppercase" as const, letterSpacing: "1.4px", marginBottom: 10 }}>Assign Role</p>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" as const }}>
            {roles.map((r) => (
              <button
                key={r.id}
                onClick={() => setSelectedRoleId(r.id)}
                style={{
                  padding: "7px 14px", borderRadius: 999, fontSize: 13,
                  border: `1px solid ${selectedRoleId === r.id ? "#2D0F2E" : "#E2DDCF"}`,
                  background: selectedRoleId === r.id ? "#2D0F2E" : "#FBF8F2",
                  color: selectedRoleId === r.id ? "#FBF8F2" : "#5A5466",
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
                  onClick={() => setSelectedIds((prev) => {
                    const next = new Set(prev)
                    if (next.has(member.id)) next.delete(member.id)
                    else next.add(member.id)
                    return next
                  })}
                  style={{
                    display: "flex", alignItems: "center", gap: 14, width: "100%",
                    minHeight: 52, padding: "14px 0",
                    borderTop: "none", borderLeft: "none", borderRight: "none",
                    borderBottom: isLast ? "none" : "1px solid #EFE9DA",
                    background: selected ? "#F1ECDE" : "transparent",
                    cursor: "pointer", textAlign: "left" as const,
                    transition: "background 0.12s",
                  }}
                >
                  <div style={{
                    width: 36, height: 36, borderRadius: 9, flexShrink: 0,
                    background: i % 2 === 0 ? "#3E1540" : "#13101A",
                    display: "flex", alignItems: "center", justifyContent: "center",
                    color: "#FBF8F2", fontSize: 13, fontWeight: 600,
                  }}>
                    {getInitials(member.name)}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ fontSize: 14, color: "#13101A", fontWeight: 500, lineHeight: 1.3, margin: 0 }}>{member.name}</p>
                    {member.email && <p style={{ fontSize: 12, color: "#8A8497", marginTop: 2, marginBottom: 0 }}>{member.email}</p>}
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
    <div className="fixed inset-0 z-[70] bg-[#FBF8F2] max-w-[390px] mx-auto flex flex-col md:left-[296px] md:max-w-none">

      {/* ── Mobile header ── */}
      <div className="md:hidden flex items-center justify-between px-5 pt-12 pb-4 border-b border-[#ECE8DE] bg-[#FBF8F2]">
        <button
          onClick={showAddMember ? () => { setShowAddMember(false); setError(null) } : onClose}
          className="size-9 bg-white border border-[#ECE8DE] rounded-full flex items-center justify-center hover:bg-[#F2EDE0] transition-colors flex-shrink-0 shadow-[0_1px_3px_rgba(19,16,26,0.05)]"
        >
          <ArrowLeft className="w-4 h-4 text-[#13101A]" />
        </button>
        <div className="flex items-center gap-2">
          {!showAddMember && <span className="text-[18px]">{team.icon ?? "👥"}</span>}
          <span className="text-[14px] font-semibold text-[#13101A]">
            {showAddMember ? "Add Member" : team.name}
          </span>
        </div>
        <div className="w-9 flex justify-end">
          {!showAddMember && canDelete && (
            <button onClick={() => setConfirmDelete(true)} className="size-9 flex items-center justify-center rounded-full hover:bg-red-50 transition-colors">
              <Trash2 className="w-4 h-4 text-[#8A8497] hover:text-red-500" />
            </button>
          )}
        </div>
      </div>

      {/* ── Desktop topbar ── */}
      <DesktopTopbar
        crumbs={showAddMember
          ? ["Central", "Plan", team.name, "Settings", "Add member"]
          : ["Central", "Plan", team.name, "Settings"]
        }
        right={
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            {canDelete && !showAddMember && (
              <button
                onClick={() => setConfirmDelete(true)}
                style={{ display: "flex", alignItems: "center", gap: 6, height: 34, padding: "0 14px", background: "transparent", border: "1px solid rgba(176,65,62,0.25)", borderRadius: 8, color: "#B0413E", fontSize: 13, cursor: "pointer" }}
              >
                <Trash2 style={{ width: 13, height: 13 }} /> Delete team
              </button>
            )}
            {showAddMember && (
              <button
                onClick={() => { setShowAddMember(false); setError(null) }}
                style={{ display: "flex", alignItems: "center", gap: 6, height: 34, padding: "0 14px", background: "transparent", border: "1px solid #ECE8DE", borderRadius: 8, color: "#8A8497", fontSize: 13, cursor: "pointer" }}
              >
                <ArrowLeft style={{ width: 13, height: 13 }} /> Back to settings
              </button>
            )}
            <button
              onClick={onClose}
              style={{ width: 34, height: 34, display: "flex", alignItems: "center", justifyContent: "center", background: "white", border: "1px solid #ECE8DE", borderRadius: 8, cursor: "pointer", color: "#5A5466" }}
              title="Close settings"
            >
              <X style={{ width: 15, height: 15 }} />
            </button>
          </div>
        }
      />

      {confirmDelete && (
        <div className="mx-5 mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 flex items-center justify-between gap-3">
          <span className="text-[13px] text-red-700 font-medium">Delete this team?</span>
          <div className="flex gap-2">
            <button onClick={() => setConfirmDelete(false)} className="text-[12px] font-semibold text-[#8A8497] hover:text-[#13101A]">Cancel</button>
            <button onClick={handleDeleteTeam} className="text-[12px] font-semibold text-red-600 hover:text-red-800">Delete</button>
          </div>
        </div>
      )}

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
                      {isAdmin && (
                        <button onClick={() => setShowAddMember(true)} className="text-[12px] font-semibold text-[#3E1540] hover:opacity-70 flex-shrink-0">
                          + Add
                        </button>
                      )}
                    </div>
                    <div className="flex flex-col gap-1.5">
                      {members.length === 0 && <p className="text-[13px] text-[#8A8497] text-center py-4">No one&apos;s here yet.</p>}
                      {members.map((m, i) => {
                        const isConfirming = confirmRemoveId === m.user_id
                        return (
                          <div key={m.user_id} className="flex items-center gap-3 rounded-xl border border-[#ECE8DE] p-3"
                            style={{ background: isConfirming ? "#FDF0F0" : "white", transition: "background 0.1s" }}
                          >
                            <div style={{ width: 32, height: 32, borderRadius: 9, flexShrink: 0, background: i % 2 === 0 ? "#3E1540" : "#13101A", display: "flex", alignItems: "center", justifyContent: "center", color: "#FBF8F2", fontSize: 12, fontWeight: 600 }}>
                              {getInitials(m.name)}
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-[14px] font-medium text-[#13101A] truncate">{m.name}</p>
                              <p className="text-[12px] text-[#8A8497]">{m.role_name}</p>
                            </div>
                            {isAdmin && m.user_id !== userId && (
                              isConfirming ? (
                                <div style={{ display: "flex", alignItems: "center", gap: 12, flexShrink: 0 }}>
                                  <button onClick={() => setConfirmRemoveId(null)} style={{ fontSize: 13, color: "#8A8497", background: "none", border: "none", cursor: "pointer", padding: 0 }}>Cancel</button>
                                  <button onClick={() => handleRemoveMember(m.user_id)} style={{ fontSize: 13, color: "#9F3030", fontWeight: 500, background: "none", border: "none", cursor: "pointer", padding: 0 }}>Remove</button>
                                </div>
                              ) : (
                                <button onClick={() => setConfirmRemoveId(m.user_id)} style={{ fontSize: 13, color: "#8A8497", background: "none", border: "none", cursor: "pointer", padding: 0, flexShrink: 0 }}>
                                  Remove
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
                  <div style={{ width: 76, height: 76, borderRadius: 20, background: "#3E1540", color: "#F6F4EF", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 32, flexShrink: 0 }}>
                    {team.icon ?? "👥"}
                  </div>
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
                          return (
                            <div
                              key={role.id}
                              onClick={() => setActiveRole(i)}
                              style={{
                                padding: "16px 20px",
                                borderBottom: i < roles.length - 1 ? "1px solid #ECE8DE" : "none",
                                borderLeft: activeRole === i ? "2px solid #3E1540" : "2px solid transparent",
                                background: activeRole === i ? "white" : "transparent",
                                cursor: "pointer",
                              }}
                            >
                              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                                <span style={{ fontFamily: "var(--font-instrument-serif)", fontSize: 19, color: "#13101A" }}>{role.name}</span>
                                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                                  <span style={{ fontSize: 11.5, color: "#8A8497" }}>{roleCount} {roleCount === 1 ? "person" : "people"}</span>
                                  {canManageTeam && (
                                    <button
                                      onClick={e => { e.stopPropagation(); handleDeleteRole(role.id) }}
                                      style={{ width: 22, height: 22, display: "flex", alignItems: "center", justifyContent: "center", background: "transparent", border: "none", borderRadius: 4, cursor: "pointer", color: "#C4C4C4", flexShrink: 0 }}
                                      title="Delete role"
                                    >
                                      <Trash2 style={{ width: 12, height: 12 }} />
                                    </button>
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
                            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 16 }}>
                              <div style={{ flex: 1, minWidth: 0, marginRight: 12 }}>
                                {renamingRoleId === roles[activeRole].id ? (
                                  <input
                                    autoFocus
                                    value={renamingRoleValue}
                                    onChange={e => setRenamingRoleValue(e.target.value)}
                                    onKeyDown={e => { if (e.key === "Enter") handleRenameRole(roles[activeRole].id); if (e.key === "Escape") setRenamingRoleId(null) }}
                                    onBlur={() => handleRenameRole(roles[activeRole].id)}
                                    style={{ fontFamily: "var(--font-instrument-serif)", fontSize: 26, color: "#13101A", background: "transparent", border: "none", borderBottom: "2px solid #3E1540", outline: "none", padding: 0, width: "100%" }}
                                  />
                                ) : (
                                  <p style={{ fontFamily: "var(--font-instrument-serif)", fontSize: 26, color: "#13101A" }}>{roles[activeRole].name}</p>
                                )}
                                <p style={{ fontSize: 12.5, color: "#8A8497", marginTop: 2 }}>
                                  {roles[activeRole].permissions.length} of {ALL_PERMISSIONS.length} permissions enabled
                                </p>
                              </div>
                              {canManageTeam && renamingRoleId !== roles[activeRole].id && (
                                <button
                                  onClick={() => { setRenamingRoleId(roles[activeRole].id); setRenamingRoleValue(roles[activeRole].name) }}
                                  style={{ display: "flex", alignItems: "center", gap: 6, height: 32, padding: "0 12px", background: "transparent", border: "1px solid #ECE8DE", borderRadius: 7, color: "#8A8497", fontSize: 12, cursor: "pointer", flexShrink: 0 }}
                                >
                                  <Pencil style={{ width: 11, height: 11 }} /> Rename
                                </button>
                              )}
                            </div>
                            <div style={{ display: "flex", flexDirection: "column" }}>
                              {ALL_PERMISSIONS.map((perm, pi) => {
                                const on = roles[activeRole].permissions.includes(perm)
                                return (
                                  <div key={perm} style={{ display: "flex", alignItems: "center", gap: 14, padding: "13px 0", borderBottom: pi < ALL_PERMISSIONS.length - 1 ? "1px solid #ECE8DE" : "none" }}>
                                    <p style={{ flex: 1, fontSize: 14, color: "#13101A", fontWeight: 500 }}>{PERMISSION_LABELS[perm]}</p>
                                    <div style={{ width: 38, height: 22, borderRadius: 999, background: on ? "#3E1540" : "#ECE8DE", position: "relative", flexShrink: 0 }}>
                                      <div style={{ position: "absolute", top: 3, left: on ? 19 : 3, width: 16, height: 16, borderRadius: 999, background: "white", boxShadow: "0 1px 3px rgba(0,0,0,0.15)" }} />
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
                  {isAdmin && (
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
                        <div style={{ width: 32, height: 32, borderRadius: 9, background: i % 2 === 0 ? "#3E1540" : "#13101A", display: "flex", alignItems: "center", justifyContent: "center", color: "#FBF8F2", fontSize: 12, fontWeight: 600 }}>
                          {getInitials(m.name)}
                        </div>
                        <span style={{ fontSize: 13.5, color: "#13101A", fontWeight: 500 }}>{m.name}</span>
                        <span style={{ fontSize: 13, color: "#5A5466" }}>{m.role_name}</span>
                        <div style={{ display: "flex", justifyContent: "flex-end", alignItems: "center", gap: 10 }}>
                          {isAdmin && m.user_id !== userId && (
                            isConfirming ? (
                              <>
                                <button onClick={() => setConfirmRemoveId(null)} style={{ fontSize: 13, color: "#8A8497", background: "none", border: "none", cursor: "pointer", padding: 0 }}>Cancel</button>
                                <button onClick={() => handleRemoveMember(m.user_id)} style={{ fontSize: 13, color: "#9F3030", fontWeight: 500, background: "none", border: "none", cursor: "pointer", padding: 0 }}>Remove</button>
                              </>
                            ) : (
                              <button
                                onClick={() => setConfirmRemoveId(m.user_id)}
                                style={{ fontSize: 13, color: "#8A8497", background: "none", border: "none", cursor: "pointer", padding: 0, opacity: isHovered ? 1 : 0, transition: "opacity 0.15s" }}
                              >
                                Remove
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

      {/* Sticky action footer */}
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
    </div>
  )
}
