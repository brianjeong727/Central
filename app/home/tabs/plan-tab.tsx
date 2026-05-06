"use client"

import { useState, useEffect, useRef, useCallback } from "react"
import {
  ChevronRight, ChevronDown, ChevronLeft, X, Check, Plus, Settings, Trash2,
  Edit3, ArrowLeft, Calendar, List, Grid3x3, Users, MoreHorizontal, Search,
  Bold, Italic, Underline as UnderlineIcon, Strikethrough, ListOrdered,
  Indent, Outdent, AlignLeft, AlignCenter, AlignRight, ClipboardList,
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
}

const ALL_PERMISSIONS = Object.keys(PERMISSION_LABELS)

const TEAM_PRESETS = [
  {
    id: "praise",
    name: "Praise Team",
    icon: "🎵",
    description: "Worship and music ministry",
    roles: [
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
}: {
  initialContent: string
  onChange: (html: string) => void
  placeholder?: string
  children?: React.ReactNode
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
      <div style={{ padding: "14px 16px" }}>
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

export function MeetingNoteEditor({
  initialContent,
  onSave,
  onEditorReady,
}: {
  initialContent: string
  onSave: (html: string) => Promise<void>
  onEditorReady?: (editor: Editor | null) => void
}) {
  const lastSavedRef = useRef(initialContent)

  const editor = useEditor({
    immediatelyRender: false,
    extensions: [
      StarterKit,
      TiptapUnderline,
      TextAlign.configure({ types: ["heading", "paragraph"] }),
      TextStyle,
      Color,
      Placeholder.configure({ placeholder: "Start writing your meeting notes here…" }),
    ],
    content: initialContent || "",
    onBlur: ({ editor: e }) => {
      const html = e.getHTML()
      if (html !== lastSavedRef.current) {
        lastSavedRef.current = html
        onSave(html)
      }
    },
  })

  useEffect(() => { onEditorReady?.(editor) }, [editor])

  return (
    <div className="meeting-note-editor">
      <div style={{ padding: "20px 32px 44px" }}>
        <EditorContent editor={editor} />
      </div>
    </div>
  )
}

export function MeetingNoteCard({
  note,
  isExpanded,
  onToggle,
  onSaveTitle,
  onSaveBody,
}: {
  note: MeetingNote
  isExpanded: boolean
  onToggle: () => void
  onSaveTitle: (id: string, title: string) => Promise<void>
  onSaveBody: (id: string, body: string) => Promise<void>
}) {
  const [localTitle, setLocalTitle] = useState(note.title)
  useEffect(() => { setLocalTitle(note.title) }, [note.id, note.title])
  const [noteEditor, setNoteEditor] = useState<Editor | null>(null)

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
          onChange={e => setLocalTitle(e.target.value)}
          onBlur={() => { if (localTitle !== note.title) onSaveTitle(note.id, localTitle) }}
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
  canWrite,
}: {
  teamId: string | null
  userId: string
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
    <div className="mt-10">
      <div className="flex items-center justify-between mb-3">
        <span style={{ fontFamily: "var(--font-instrument-serif)", fontSize: 22, fontWeight: 400, color: "#13101A", letterSpacing: "-0.01em" }}>
          Meeting Notes
        </span>
        {canWrite && (
          <button
            onClick={createNote}
            disabled={creating}
            style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 13, color: "#3E1540", background: "none", border: "none", cursor: creating ? "default" : "pointer", fontFamily: "var(--font-inter)", fontWeight: 500, opacity: creating ? 0.5 : 1 }}
          >
            <Plus className="w-3.5 h-3.5" />
            {creating ? "Creating…" : "Create"}
          </button>
        )}
      </div>

      {loading ? (
        <div style={{ textAlign: "center", padding: "32px 0", color: "#8A8497", fontSize: 13 }}>Loading…</div>
      ) : notes.length === 0 ? (
        <div style={{ background: "#FBF8F2", border: "1px solid #ECE8DE", borderRadius: 14, padding: "32px 20px", textAlign: "center" }}>
          <p style={{ fontFamily: "var(--font-instrument-serif)", fontSize: 17, fontWeight: 400, color: "#13101A", margin: "0 0 6px" }}>No meeting notes yet.</p>
          <p style={{ fontSize: 13, color: "#8A8497", margin: 0 }}>
            {canWrite ? "Create your first note to get started." : "No notes have been created yet."}
          </p>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {notes.map(note => (
            <MeetingNoteCard
              key={note.id}
              note={note}
              isExpanded={expandedIds.has(note.id)}
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

export function PlanTab({ userId, ministryId, ministryName, userTeams, allTeams, isAdmin, onTeamsChange, showCreateTeam, onShowCreateTeam, activeTeamId, onTeamCreated }: PlanTabProps) {
  const activeTeamName = userTeams.find(t => t.teamId === activeTeamId)?.teamName ?? (isAdmin ? ministryName : "Plan")
  const setShowCreateTeam = onShowCreateTeam
  const [openTeam, setOpenTeam] = useState<Team | null>(null)
  const [studentOrgTab, setStudentOrgTab] = useState("General")
  useEffect(() => { setStudentOrgTab("General"); setOpenTeam(null) }, [activeTeamId])

  const hasAnyPlanning = isAdmin || userTeams.length > 0

  const monoStyle: React.CSSProperties = {
    fontFamily: "ui-monospace, 'SF Mono', Menlo, monospace",
    fontSize: "11px",
    letterSpacing: "0.04em",
    textTransform: "uppercase",
    color: "#8A8497",
  }

  const teamsToShow = isAdmin ? allTeams : userTeams.map(t => ({ id: t.teamId, name: t.teamName, icon: t.teamIcon, description: t.teamDescription, created_by: "", member_count: 0 }))

  const isStudentOrgBoard = activeTeamName === "Student Org Board"
  const studentOrgUserTeam = isStudentOrgBoard ? userTeams.find(t => t.teamId === activeTeamId) : null
  const studentOrgRole = studentOrgUserTeam?.roleName ?? ""

  const isPraiseTeam = activeTeamName === "Praise Team"
  const praiseTeamPerms = isPraiseTeam ? (userTeams.find(t => t.teamId === activeTeamId)?.permissions ?? []) : []
  const canManageWorship = isAdmin || praiseTeamPerms.includes("can_manage_worship_set")
  const studentOrgTabs: string[] = (() => {
    if (!isStudentOrgBoard) return []
    if (isAdmin || studentOrgRole === "President") return ["General", "President", "Treasurer", "Secretary", "Event Coordinator"]
    if (studentOrgRole === "Treasurer") return ["General", "Treasurer"]
    if (studentOrgRole === "Secretary") return ["General", "Secretary"]
    if (studentOrgRole === "Event Coordinator") return ["General", "Event Coordinator"]
    return ["General"]
  })()

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

      {/* Desktop Editorial Header */}
      <div className="hidden md:flex items-start justify-between px-14 pt-11 pb-8 border-b border-[#E5E0D2]">
        <div>
          <p style={monoStyle}>{new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })}</p>
          <h1 style={{ margin: "14px 0 0", fontFamily: "var(--font-instrument-serif)", fontWeight: 400, fontSize: "52px", lineHeight: 1.05, letterSpacing: "-0.01em", color: "#13101A" }}>
            {activeTeamName}
          </h1>
          <p style={{ marginTop: "12px", color: "#5A5466", fontSize: "14px", maxWidth: "560px" }}>
            The week as it stands. Groups to prepare, people to thank.
          </p>
        </div>
        {(() => {
          const activeUserTeam = userTeams.find(t => t.teamId === activeTeamId)
          const activeTeamFull: Team | undefined = allTeams.find(t => t.id === activeTeamId)
            ?? (activeUserTeam ? { id: activeUserTeam.teamId, name: activeUserTeam.teamName, icon: activeUserTeam.teamIcon, description: activeUserTeam.teamDescription, created_by: "", member_count: 0 } : undefined)
          if (!activeTeamFull) return null
          return (
            <button
              onClick={() => setOpenTeam(activeTeamFull)}
              className="w-8 h-8 flex items-center justify-center rounded-lg border border-[#E5E0D2] bg-[#FBF8F2] hover:bg-[#EFEAE0] transition-colors flex-shrink-0"
              title="Team settings"
            >
              <Settings className="w-4 h-4 text-[#5A5466]" />
            </button>
          )
        })()}
      </div>

      {/* Desktop content */}
      <div className="hidden md:block">
        {isStudentOrgBoard && studentOrgTabs.length > 0 && (
          <div style={{ borderBottom: "1px solid #ECE8DE", overflowX: "auto", paddingLeft: "56px" }}>
            <div style={{ display: "flex" }}>
              {studentOrgTabs.map(tab => (
                <button
                  key={tab}
                  onClick={() => setStudentOrgTab(tab)}
                  style={{
                    padding: "12px 16px",
                    fontSize: 14,
                    fontFamily: "var(--font-inter)",
                    fontWeight: studentOrgTab === tab ? 600 : 400,
                    color: studentOrgTab === tab ? "#3E1540" : "#8A8497",
                    boxShadow: studentOrgTab === tab ? "inset 0 -2px 0 0 #3E1540" : "none",
                    background: "none",
                    border: "none",
                    cursor: "pointer",
                    whiteSpace: "nowrap",
                    outline: "none",
                  }}
                >
                  {tab}
                </button>
              ))}
            </div>
          </div>
        )}
        <div className="px-14 py-7">
          {(() => {
            if (isPraiseTeam && activeTeamId) {
              return (
                <PraiseTeamTab
                  teamId={activeTeamId}
                  ministryId={ministryId}
                  userId={userId}
                  canManage={canManageWorship}
                />
              )
            }
            if (isStudentOrgBoard) {
              const activeUserTeam = userTeams.find(t => t.teamId === activeTeamId)
              const perms = activeUserTeam?.permissions ?? []
              const canEdit = isAdmin || perms.includes('can_plan_events')
              if (studentOrgTab === "General") {
                return (
                  <>
                    <MinistryCalendar
                      ministryId={ministryId}
                      teamId={activeTeamId}
                      userId={userId}
                      canEdit={canEdit}
                    />
                    <MeetingNotesSection
                      teamId={activeTeamId}
                      userId={userId}
                      canWrite={isAdmin || !!studentOrgUserTeam}
                    />
                  </>
                )
              }
              const canWrite = studentOrgRole === "President" || studentOrgRole === studentOrgTab
              return (
                <StudentOrgRoleTabContent
                  teamId={activeTeamId}
                  roleName={studentOrgTab}
                  userId={userId}
                  canWrite={canWrite}
                />
              )
            }
            const activeUserTeam = userTeams.find(t => t.teamId === activeTeamId)
            const perms = activeUserTeam?.permissions ?? []
            const showCalendar = perms.includes('can_plan_events')
            if (!showCalendar) return null
            const canEdit = isAdmin || perms.includes('can_plan_events')
            return (
              <MinistryCalendar
                ministryId={ministryId}
                teamId={activeTeamId}
                userId={userId}
                canEdit={canEdit}
              />
            )
          })()}
        </div>
      </div>

      {/* Mobile content */}
      <div className="md:hidden px-5 pb-4">
        {/* Praise Team — replaces default mobile content */}
        {isPraiseTeam && activeTeamId ? (
          <PraiseTeamTab
            teamId={activeTeamId}
            ministryId={ministryId}
            userId={userId}
            canManage={canManageWorship}
          />
        ) : (
        <>
        {/* Student Org Board tabs — mobile */}
        {isStudentOrgBoard && studentOrgTabs.length > 0 && (
          <div className="mb-6">
            <div style={{ borderBottom: "1px solid #ECE8DE", marginLeft: -20, marginRight: -20, paddingLeft: 20, overflowX: "auto" }}>
              <div style={{ display: "flex" }}>
                {studentOrgTabs.map(tab => (
                  <button
                    key={tab}
                    onClick={() => setStudentOrgTab(tab)}
                    style={{
                      padding: "12px 16px",
                      fontSize: 14,
                      fontFamily: "var(--font-inter)",
                      fontWeight: studentOrgTab === tab ? 600 : 400,
                      color: studentOrgTab === tab ? "#3E1540" : "#8A8497",
                      boxShadow: studentOrgTab === tab ? "inset 0 -2px 0 0 #3E1540" : "none",
                      background: "none",
                      border: "none",
                      cursor: "pointer",
                      whiteSpace: "nowrap",
                      outline: "none",
                    }}
                  >
                    {tab}
                  </button>
                ))}
              </div>
            </div>
            <div className="pt-5">
              {studentOrgTab === "General" ? (
                <>
                  <MinistryCalendar
                    ministryId={ministryId}
                    teamId={activeTeamId}
                    userId={userId}
                    canEdit={isAdmin || (userTeams.find(t => t.teamId === activeTeamId)?.permissions?.includes('can_plan_events') ?? false)}
                  />
                  <MeetingNotesSection
                    teamId={activeTeamId}
                    userId={userId}
                    canWrite={isAdmin || !!studentOrgUserTeam}
                  />
                </>
              ) : (
                <StudentOrgRoleTabContent
                  teamId={activeTeamId}
                  roleName={studentOrgTab}
                  userId={userId}
                  canWrite={studentOrgRole === "President" || studentOrgRole === studentOrgTab}
                />
              )}
            </div>
          </div>
        )}
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
            {[
              { icon: "set", name: "Set" },
              { icon: "sparkle", name: "Slides" },
              { icon: "calendar", name: "Schedule" },
              { icon: "book", name: "Bible Study" },
            ].map((tool) => (
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
          <EmptyState
            icon={<ClipboardList className="w-6 h-6" />}
            title="You're not on a team yet."
            subtitle="Ask a leader to add you."
          />
        )}
        </>
        )}
      </div>

      {showCreateTeam && (
        <CreateTeamOverlay
          userId={userId}
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
    filled:    { label: "Filled",    bg: "#FFF7E6", color: "#C9A34B" },
    confirmed: { label: "Confirmed", bg: "#EDFAF3", color: "#2D7A4F" },
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

export function PraiseTeamTab({ teamId, ministryId, userId, canManage }: { teamId: string; ministryId: string; userId: string; canManage: boolean }) {
  const supabase = createClient()
  const [subTab, setSubTab] = useState<"schedule" | "setlist" | "slides" | "charts" | "availability">("schedule")

  // Schedule state
  const [weeks, setWeeks] = useState<WorshipWeek[]>([])
  const [scheduleLoading, setScheduleLoading] = useState(true)
  const [teamMembers, setTeamMembers] = useState<PraiseTeamMember[]>([])

  // Add week form
  const [showAddWeek, setShowAddWeek] = useState(false)
  const [newDate, setNewDate] = useState("")
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

  // Set List state
  const [songsByWeek, setSongsByWeek] = useState<Record<string, WorshipSong[]>>({})
  const [songsLoading, setSongsLoading] = useState(false)
  const [expandedWeeks, setExpandedWeeks] = useState<Set<string>>(new Set())
  const [addSongToWeekId, setAddSongToWeekId] = useState<string | null>(null)
  const [newSongTitle, setNewSongTitle] = useState("")
  const [newSongKey, setNewSongKey] = useState("G")
  const [newSongLeaderId, setNewSongLeaderId] = useState("")
  const [addingSong, setAddingSong] = useState(false)

  // Invites state
  const [invitesByWeek, setInvitesByWeek] = useState<Record<string, WorshipInvite[]>>({})
  const [sendingInvites, setSendingInvites] = useState<string | null>(null)
  const [myPendingInvites, setMyPendingInvites] = useState<Array<{ id: string; week_id: string; week_date: string }>>([])
  const [respondingInvite, setRespondingInvite] = useState<string | null>(null)

  // Slides state
  const [slidesWeekId, setSlidesWeekId] = useState<string | null>(null)
  const [slideIndex, setSlideIndex] = useState(0)
  const [slideDeckActive, setSlideDeckActive] = useState(false)

  // Charts state
  const [chartsWeekId, setChartsWeekId] = useState<string | null>(null)
  const [chartsBySong, setChartsBySong] = useState<Record<string, WorshipChart | null>>({})
  const [chartsLoading, setChartsLoading] = useState(false)
  const [annotationsBySong, setAnnotationsBySong] = useState<Record<string, AnnotationObj[]>>({})
  const [annotationChartId, setAnnotationChartId] = useState<Record<string, string>>({})
  const [uploadingChart, setUploadingChart] = useState<string | null>(null)
  const [pendingAnnotation, setPendingAnnotation] = useState<{ songId: string; x: number; y: number } | null>(null)
  const [pendingAnnotationText, setPendingAnnotationText] = useState("")
  const [pendingAnnotationColor, setPendingAnnotationColor] = useState("#FDE68A")
  const [savingAnnotation, setSavingAnnotation] = useState(false)
  const [hoveredAnnotationId, setHoveredAnnotationId] = useState<string | null>(null)

  const now = new Date()
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split("T")[0]
  const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().split("T")[0]

  const monoStyle: React.CSSProperties = { fontFamily: "ui-monospace,'SF Mono',Menlo,monospace", fontSize: 10, letterSpacing: "0.05em", textTransform: "uppercase", color: "#8A8497" }
  const subTabStyle = (active: boolean): React.CSSProperties => ({
    padding: "12px 16px", fontSize: 14, fontFamily: "var(--font-inter)", fontWeight: active ? 600 : 400,
    color: active ? "#3E1540" : "#8A8497", boxShadow: active ? "inset 0 -2px 0 0 #3E1540" : "none",
    background: "none", border: "none", cursor: "pointer", whiteSpace: "nowrap" as const, outline: "none",
  })

  async function loadSchedule() {
    setScheduleLoading(true)
    const { data: weeksData } = await supabase
      .from("worship_weeks")
      .select("id, week_date, leader_id, status, profiles!leader_id(name)")
      .eq("team_id", teamId)
      .gte("week_date", monthStart)
      .lte("week_date", monthEnd)
      .order("week_date")

    if (!weeksData) { setScheduleLoading(false); return }

    const weekIds = weeksData.map(w => w.id)
    const { data: rolesData } = weekIds.length > 0
      ? await supabase.from("worship_roles").select("id, week_id, user_id, role_name, profiles!user_id(name)").in("week_id", weekIds)
      : { data: [] as { id: string; week_id: string; user_id: string; role_name: string; profiles: { name: string } | { name: string }[] | null }[] }

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
      .select("user_id, profiles!user_id(name)")
      .eq("team_id", teamId)
    type Raw = { user_id: string; profiles: { name: string } | { name: string }[] | null }
    setTeamMembers((data ?? []).map((m: Raw) => {
      const p = Array.isArray(m.profiles) ? m.profiles[0] : m.profiles
      return { user_id: m.user_id, name: p?.name ?? "Unknown" }
    }))
  }

  async function loadAvailability() {
    setAvailLoading(true)
    if (canManage) {
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
    } else {
      const { data } = await supabase
        .from("worship_availability")
        .select("week_date, status")
        .eq("team_id", teamId)
        .eq("user_id", userId)
        .gte("week_date", monthStart)
        .lte("week_date", monthEnd)
      const mine: Record<string, AvailStatus> = {}
      for (const row of data ?? []) mine[row.week_date] = (row.status ?? "available") as AvailStatus
      setMyAvailability(mine)
    }
    setAvailLoading(false)
  }

  useEffect(() => {
    loadSchedule()
    loadTeamMembers()
    loadMyPendingInvites()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [teamId])

  // Set default week for slides/charts tabs once weeks are loaded
  useEffect(() => {
    if (weeks.length === 0) return
    const todayStr = new Date().toISOString().split("T")[0]
    const upcoming = weeks.find(w => w.week_date >= todayStr) ?? weeks[0]
    setSlidesWeekId(prev => prev ?? upcoming.id)
    setChartsWeekId(prev => prev ?? upcoming.id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [weeks])

  useEffect(() => {
    if (subTab === "availability") loadAvailability()
    if (["setlist", "slides", "charts"].includes(subTab)) loadSetList()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [subTab, teamId])

  useEffect(() => {
    if (subTab === "charts" && chartsWeekId) loadCharts(chartsWeekId)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [subTab, chartsWeekId])

  async function handleAddWeek() {
    if (!newDate) return
    setAddingWeek(true)
    const { error } = await supabase.from("worship_weeks").insert({ team_id: teamId, ministry_id: ministryId, week_date: newDate, leader_id: newLeaderId || null, status: "draft" })
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

  async function handleSetAvailability(weekDate: string, status: AvailStatus) {
    setSavingAvail(weekDate)
    const { error } = await supabase.from("worship_availability")
      .upsert(
        { team_id: teamId, user_id: userId, week_date: weekDate, status, is_available: status === "available" },
        { onConflict: "team_id,user_id,week_date" }
      )
    if (!error) {
      setMyAvailability(prev => ({ ...prev, [weekDate]: status }))
      if (canManage) setAllAvailability(prev => ({ ...prev, [userId]: { ...(prev[userId] ?? {}), [weekDate]: status } }))
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
      .select("id, week_id, title, key, song_leader_id, order_index, profiles!song_leader_id(name)")
      .in("week_id", ids)
      .order("order_index")
    type RawSong = { id: string; week_id: string; title: string; key: string; song_leader_id: string | null; order_index: number; profiles: { name: string } | { name: string }[] | null }
    const songMap: Record<string, WorshipSong[]> = {}
    for (const s of ((songsData ?? []) as RawSong[])) {
      const p = Array.isArray(s.profiles) ? s.profiles[0] : s.profiles
      if (!songMap[s.week_id]) songMap[s.week_id] = []
      songMap[s.week_id].push({ id: s.id, week_id: s.week_id, title: s.title, key: s.key, song_leader_id: s.song_leader_id, song_leader_name: p?.name ?? null, order_index: s.order_index })
    }
    setSongsByWeek(songMap)

    const { data: invitesData } = await supabase
      .from("worship_invites")
      .select("id, week_id, user_id, status, sent_at, responded_at, profiles!user_id(name)")
      .in("week_id", ids)
    type RawInvite = { id: string; week_id: string; user_id: string; status: string; sent_at: string; responded_at: string | null; profiles: { name: string } | { name: string }[] | null }
    const inviteMap: Record<string, WorshipInvite[]> = {}
    for (const inv of ((invitesData ?? []) as RawInvite[])) {
      const p = Array.isArray(inv.profiles) ? inv.profiles[0] : inv.profiles
      if (!inviteMap[inv.week_id]) inviteMap[inv.week_id] = []
      inviteMap[inv.week_id].push({ id: inv.id, week_id: inv.week_id, user_id: inv.user_id, user_name: p?.name ?? "Unknown", status: inv.status as WorshipInvite["status"], sent_at: inv.sent_at, responded_at: inv.responded_at })
    }
    setInvitesByWeek(inviteMap)
    setSongsLoading(false)
  }

  async function loadMyPendingInvites() {
    const today = new Date().toISOString().split("T")[0]
    const { data } = await supabase
      .from("worship_invites")
      .select("id, week_id, worship_weeks!week_id(week_date, team_id)")
      .eq("user_id", userId)
      .eq("status", "pending")
    type RawPending = { id: string; week_id: string; worship_weeks: { week_date: string; team_id: string } | null }
    const upcoming = ((data ?? []) as unknown as RawPending[])
      .filter(inv => inv.worship_weeks && inv.worship_weeks.team_id === teamId && inv.worship_weeks.week_date >= today)
      .map(inv => ({ id: inv.id, week_id: inv.week_id, week_date: inv.worship_weeks!.week_date }))
    setMyPendingInvites(upcoming)
  }

  async function handleAddSong(weekId: string) {
    if (!newSongTitle.trim()) return
    setAddingSong(true)
    const songs = songsByWeek[weekId] ?? []
    const nextIndex = songs.length > 0 ? Math.max(...songs.map(s => s.order_index)) + 1 : 0
    const { data, error } = await supabase.from("worship_songs")
      .insert({ week_id: weekId, title: newSongTitle.trim(), key: newSongKey, song_leader_id: newSongLeaderId || null, order_index: nextIndex })
      .select("id").single()
    if (!error && data) {
      const leaderName = teamMembers.find(m => m.user_id === newSongLeaderId)?.name ?? null
      setSongsByWeek(prev => ({
        ...prev,
        [weekId]: [...(prev[weekId] ?? []), { id: data.id, week_id: weekId, title: newSongTitle.trim(), key: newSongKey, song_leader_id: newSongLeaderId || null, song_leader_name: leaderName, order_index: nextIndex }],
      }))
      setAddSongToWeekId(null); setNewSongTitle(""); setNewSongKey("G"); setNewSongLeaderId("")
    }
    setAddingSong(false)
  }

  async function handleDeleteSong(weekId: string, songId: string) {
    await supabase.from("worship_songs").delete().eq("id", songId)
    setSongsByWeek(prev => ({ ...prev, [weekId]: (prev[weekId] ?? []).filter(s => s.id !== songId) }))
  }

  async function handleMoveSong(weekId: string, songId: string, direction: "up" | "down") {
    const songs = [...(songsByWeek[weekId] ?? [])].sort((a, b) => a.order_index - b.order_index)
    const idx = songs.findIndex(s => s.id === songId)
    if (direction === "up" && idx === 0) return
    if (direction === "down" && idx === songs.length - 1) return
    const swapIdx = direction === "up" ? idx - 1 : idx + 1
    const [a, b] = [songs[idx], songs[swapIdx]]
    await Promise.all([
      supabase.from("worship_songs").update({ order_index: b.order_index }).eq("id", a.id),
      supabase.from("worship_songs").update({ order_index: a.order_index }).eq("id", b.id),
    ])
    setSongsByWeek(prev => ({
      ...prev,
      [weekId]: songs.map(s => s.id === a.id ? { ...s, order_index: b.order_index } : s.id === b.id ? { ...s, order_index: a.order_index } : s).sort((x, y) => x.order_index - y.order_index),
    }))
  }

  async function handleSendInvites(weekId: string) {
    const week = weeks.find(w => w.id === weekId)
    if (!week) return
    setSendingInvites(weekId)
    const existingUserIds = new Set((invitesByWeek[weekId] ?? []).map(inv => inv.user_id))
    const toInvite = week.roles.filter(r => !existingUserIds.has(r.user_id))
    if (toInvite.length === 0) { setSendingInvites(null); return }
    const rows = toInvite.map(r => ({ week_id: weekId, user_id: r.user_id, status: "pending", sent_at: new Date().toISOString() }))
    const { data } = await supabase.from("worship_invites").insert(rows)
      .select("id, week_id, user_id, status, sent_at, responded_at, profiles!user_id(name)")
    type RawInvite = { id: string; week_id: string; user_id: string; status: string; sent_at: string; responded_at: string | null; profiles: { name: string } | { name: string }[] | null }
    if (data) {
      const newInvites: WorshipInvite[] = ((data as unknown) as RawInvite[]).map(inv => {
        const p = Array.isArray(inv.profiles) ? inv.profiles[0] : inv.profiles
        return { id: inv.id, week_id: inv.week_id, user_id: inv.user_id, user_name: p?.name ?? "Unknown", status: inv.status as WorshipInvite["status"], sent_at: inv.sent_at, responded_at: inv.responded_at }
      })
      setInvitesByWeek(prev => ({ ...prev, [weekId]: [...(prev[weekId] ?? []), ...newInvites] }))
    }
    setSendingInvites(null)
  }

  async function handleRespondToInvite(inviteId: string, status: "accepted" | "declined") {
    setRespondingInvite(inviteId)
    const { error } = await supabase.from("worship_invites")
      .update({ status, responded_at: new Date().toISOString() })
      .eq("id", inviteId)
      .eq("user_id", userId)
    if (!error) {
      setMyPendingInvites(prev => prev.filter(inv => inv.id !== inviteId))
      const now2 = new Date().toISOString()
      setInvitesByWeek(prev => {
        const next = { ...prev }
        for (const wid in next) next[wid] = next[wid].map(inv => inv.id === inviteId ? { ...inv, status, responded_at: now2 } : inv)
        return next
      })
    }
    setRespondingInvite(null)
  }

  async function loadCharts(weekId: string) {
    setChartsLoading(true)
    const { data: songRows } = await supabase
      .from("worship_songs").select("id").eq("week_id", weekId).order("order_index")
    const songIds = (songRows ?? []).map(s => s.id)
    if (songIds.length === 0) { setChartsLoading(false); return }

    const { data: chartsData } = await supabase
      .from("worship_charts").select("id, song_id, chart_url, uploaded_by, created_at").in("song_id", songIds)
    const cBySong: Record<string, WorshipChart | null> = {}
    const cIdBySong: Record<string, string> = {}
    for (const id of songIds) cBySong[id] = null
    for (const c of (chartsData ?? []) as WorshipChart[]) { cBySong[c.song_id] = c; cIdBySong[c.song_id] = c.id }
    setChartsBySong(cBySong)
    setAnnotationChartId(cIdBySong)

    const chartIds = Object.values(cIdBySong)
    if (chartIds.length > 0) {
      const { data: annData } = await supabase
        .from("worship_annotations").select("chart_id, annotation_data").in("chart_id", chartIds)
      const aBySong: Record<string, AnnotationObj[]> = {}
      for (const row of annData ?? []) {
        const songId = Object.keys(cIdBySong).find(sid => cIdBySong[sid] === row.chart_id)
        if (songId) aBySong[songId] = (row.annotation_data ?? []) as AnnotationObj[]
      }
      setAnnotationsBySong(aBySong)
    }
    setChartsLoading(false)
  }

  async function handleUploadChart(songId: string, file: File) {
    setUploadingChart(songId)
    const ext = file.name.split(".").pop()?.toLowerCase() ?? "bin"
    const path = `${teamId}/${songId}/${Date.now()}.${ext}`
    const { error: upErr } = await supabase.storage.from("worship-charts").upload(path, file, { upsert: true })
    if (upErr) { setUploadingChart(null); return }
    const { data: urlData } = supabase.storage.from("worship-charts").getPublicUrl(path)
    const { data, error } = await supabase.from("worship_charts")
      .upsert({ song_id: songId, chart_url: urlData.publicUrl, uploaded_by: userId }, { onConflict: "song_id" })
      .select("id, song_id, chart_url, uploaded_by, created_at").single()
    if (!error && data) {
      const chart = data as WorshipChart
      setChartsBySong(prev => ({ ...prev, [songId]: chart }))
      setAnnotationChartId(prev => ({ ...prev, [songId]: chart.id }))
    }
    setUploadingChart(null)
  }

  function handleChartClick(e: React.MouseEvent<HTMLDivElement>, songId: string) {
    if (pendingAnnotation) return
    const rect = e.currentTarget.getBoundingClientRect()
    const x = ((e.clientX - rect.left) / rect.width) * 100
    const y = ((e.clientY - rect.top) / rect.height) * 100
    setPendingAnnotation({ songId, x, y })
    setPendingAnnotationText("")
  }

  async function handleSaveAnnotation(songId: string) {
    if (!pendingAnnotationText.trim() || !pendingAnnotation) { setPendingAnnotation(null); return }
    const chartId = annotationChartId[songId]
    if (!chartId) return
    setSavingAnnotation(true)
    const newAnn: AnnotationObj = {
      id: crypto.randomUUID(),
      x: pendingAnnotation.x,
      y: pendingAnnotation.y,
      color: pendingAnnotationColor,
      text: pendingAnnotationText.trim(),
    }
    const updated = [...(annotationsBySong[songId] ?? []), newAnn]
    const { error } = await supabase.from("worship_annotations")
      .upsert({ chart_id: chartId, user_id: userId, annotation_data: updated, updated_at: new Date().toISOString() }, { onConflict: "chart_id" })
    if (!error) setAnnotationsBySong(prev => ({ ...prev, [songId]: updated }))
    setPendingAnnotation(null)
    setPendingAnnotationText("")
    setSavingAnnotation(false)
  }

  async function handleDeleteAnnotation(songId: string, annId: string) {
    const chartId = annotationChartId[songId]
    if (!chartId) return
    const updated = (annotationsBySong[songId] ?? []).filter(a => a.id !== annId)
    await supabase.from("worship_annotations")
      .upsert({ chart_id: chartId, user_id: userId, annotation_data: updated, updated_at: new Date().toISOString() }, { onConflict: "chart_id" })
    setAnnotationsBySong(prev => ({ ...prev, [songId]: updated }))
    setHoveredAnnotationId(null)
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

  const visibleWeeks = canManage ? weeks : weeks.filter(w => w.roles.some(r => r.user_id === userId))
  const weekDates = weeks.map(w => w.week_date)
  const monthLabel = now.toLocaleDateString("en-US", { month: "long", year: "numeric" })

  return (
    <div>
      {/* Pending invite banners */}
      {myPendingInvites.length > 0 && (
        <div style={{ marginBottom: 20 }}>
          {myPendingInvites.map(inv => (
            <div key={inv.id} style={{ background: "#F4F0F8", border: "1px solid #D4C5E0", borderRadius: 14, padding: "14px 16px", marginBottom: 8 }}>
              <p style={{ fontSize: 13, fontWeight: 600, color: "#3E1540", marginBottom: 10 }}>
                You&apos;re invited to serve on {worshipWeekDateLabel(inv.week_date)}
              </p>
              <div style={{ display: "flex", gap: 8 }}>
                <button
                  onClick={() => handleRespondToInvite(inv.id, "accepted")}
                  disabled={respondingInvite === inv.id}
                  style={{ flex: 1, padding: "8px 0", background: "#3E1540", color: "#F6F4EF", borderRadius: 8, fontSize: 13, fontWeight: 600, border: "none", cursor: "pointer", opacity: respondingInvite === inv.id ? 0.6 : 1 }}
                >
                  Accept
                </button>
                <button
                  onClick={() => handleRespondToInvite(inv.id, "declined")}
                  disabled={respondingInvite === inv.id}
                  style={{ flex: 1, padding: "8px 0", background: "transparent", color: "#8A8497", borderRadius: 8, fontSize: 13, fontWeight: 500, border: "1px solid #ECE8DE", cursor: "pointer", opacity: respondingInvite === inv.id ? 0.6 : 1 }}
                >
                  Decline
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Sub-tabs */}
      <div style={{ borderBottom: "1px solid #ECE8DE", marginBottom: 24, display: "flex", overflowX: "auto", scrollbarWidth: "none" }}>
        <button style={subTabStyle(subTab === "schedule")} onClick={() => setSubTab("schedule")}>Schedule</button>
        <button style={subTabStyle(subTab === "setlist")} onClick={() => setSubTab("setlist")}>Set List</button>
        <button style={subTabStyle(subTab === "slides")} onClick={() => setSubTab("slides")}>Slides</button>
        <button style={subTabStyle(subTab === "charts")} onClick={() => setSubTab("charts")}>Charts</button>
        <button style={subTabStyle(subTab === "availability")} onClick={() => setSubTab("availability")}>Availability</button>
      </div>

      {/* ── Schedule ── */}
      {subTab === "schedule" && (
        <div>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
            <p style={{ ...monoStyle, fontSize: 11 }}>{monthLabel}</p>
            {canManage && !showAddWeek && (
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
            <div style={{ background: "white", border: "1px solid #ECE8DE", borderRadius: 16, padding: 20, marginBottom: 16, boxShadow: "0 2px 8px rgba(19,16,26,0.06)" }}>
              <p style={{ fontFamily: "var(--font-instrument-serif)", fontSize: 17, color: "#13101A", marginBottom: 14 }}>New worship week</p>
              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                <div>
                  <label style={{ display: "block", fontSize: 12, fontWeight: 500, color: "#5A5466", marginBottom: 4 }}>Date</label>
                  <input type="date" value={newDate} onChange={e => setNewDate(e.target.value)}
                    style={{ width: "100%", padding: "10px 12px", borderRadius: 10, border: "1px solid #ECE8DE", background: "#FBF8F2", fontSize: 14, color: "#13101A", outline: "none", boxSizing: "border-box" as const }} />
                </div>
                <div>
                  <label style={{ display: "block", fontSize: 12, fontWeight: 500, color: "#5A5466", marginBottom: 4 }}>Leader <span style={{ color: "#8A8497", fontWeight: 400 }}>(optional)</span></label>
                  <select value={newLeaderId} onChange={e => setNewLeaderId(e.target.value)}
                    style={{ width: "100%", padding: "10px 12px", borderRadius: 10, border: "1px solid #ECE8DE", background: "#FBF8F2", fontSize: 14, color: "#13101A", outline: "none" }}>
                    <option value="">Unassigned</option>
                    {teamMembers.map(m => <option key={m.user_id} value={m.user_id}>{m.name}</option>)}
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
            <div style={{ background: "white", border: "1.5px dashed #ECE8DE", borderRadius: 16, padding: "40px 24px", textAlign: "center" }}>
              <p style={{ fontFamily: "var(--font-instrument-serif)", fontSize: 18, color: "#13101A", marginBottom: 6 }}>No weeks scheduled yet.</p>
              <p style={{ fontSize: 13, color: "#8A8497" }}>{canManage ? "Add one to get started." : "Check back later or set your availability."}</p>
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
                  <div key={week.id} style={{ background: "white", border: "1px solid #ECE8DE", borderRadius: 16, boxShadow: "0 2px 8px rgba(19,16,26,0.06)", overflow: "hidden" }}>
                    {/* Card header */}
                    <div style={{ padding: "16px 18px", borderBottom: "1px solid #ECE8DE" }}>
                      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 8, marginBottom: 10 }}>
                        <p style={{ fontFamily: "var(--font-instrument-serif)", fontSize: 17, color: "#13101A", lineHeight: 1.2 }}>
                          {worshipWeekDateLabel(week.week_date)}
                        </p>
                        <WorshipStatusBadge status={week.status} onChange={canChangeStatus ? s => handleStatusChange(week.id, s) : undefined} />
                      </div>
                      {/* Leader row */}
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <span style={monoStyle}>Leader</span>
                        {canManage ? (
                          <select value={week.leader_id ?? ""} onChange={e => handleLeaderChange(week.id, e.target.value)}
                            style={{ flex: 1, fontSize: 13, color: "#13101A", border: "none", outline: "none", background: "transparent", cursor: "pointer" }}>
                            <option value="">Unassigned</option>
                            {teamMembers.map(m => <option key={m.user_id} value={m.user_id}>{m.name}</option>)}
                          </select>
                        ) : (
                          <span style={{ fontSize: 13, color: "#13101A" }}>{week.leader_name ?? "Unassigned"}</span>
                        )}
                      </div>
                    </div>

                    {/* Roster */}
                    <div style={{ padding: "12px 18px" }}>
                      {week.roles.length === 0 ? (
                        <p style={{ fontSize: 13, color: "#8A8497", paddingBottom: 4 }}>No members assigned yet.</p>
                      ) : (
                        <div style={{ display: "flex", flexDirection: "column", gap: 7, marginBottom: 2 }}>
                          {week.roles.map(role => (
                            <div key={role.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                                <span style={{ ...monoStyle, minWidth: 52 }}>{role.role_name}</span>
                                <span style={{ fontSize: 13, color: "#13101A" }}>{role.user_name}</span>
                              </div>
                              {canManage && (
                                <button onClick={() => handleRemoveMember(role.id)}
                                  style={{ padding: "1px 6px", fontSize: 12, color: "#C4C4C4", background: "transparent", border: "none", cursor: "pointer", lineHeight: 1 }}>
                                  ✕
                                </button>
                              )}
                            </div>
                          ))}
                        </div>
                      )}

                      {canManage && !isThisWeekAddTarget && (
                        <button onClick={() => { setAddMemberToWeekId(week.id); setAddMemberSearch(""); setAddMemberUserId(""); setAddMemberRole("Vocals") }}
                          style={{ marginTop: 10, fontSize: 13, color: "#3E1540", fontWeight: 500, background: "transparent", border: "none", cursor: "pointer", padding: 0 }}>
                          + Add member
                        </button>
                      )}

                      {/* Inline add-member form */}
                      {isThisWeekAddTarget && (
                        <div style={{ marginTop: 12, padding: 14, background: "#FBF8F2", borderRadius: 10, border: "1px solid #ECE8DE" }}>
                          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                            <div style={{ position: "relative" }}>
                              <input type="text" placeholder="Search member…" value={addMemberSearch}
                                onChange={e => { setAddMemberSearch(e.target.value); setAddMemberUserId("") }}
                                onFocus={() => setAddMemberFocused(true)}
                                onBlur={() => setTimeout(() => setAddMemberFocused(false), 150)}
                                style={{ width: "100%", padding: "8px 10px", borderRadius: 8, border: "1px solid #ECE8DE", background: "white", fontSize: 13, color: "#13101A", outline: "none", boxSizing: "border-box" as const }} />
                              {addMemberFocused && !addMemberUserId && filteredMembers.length > 0 && (
                                <div style={{ position: "absolute", top: "100%", left: 0, right: 0, border: "1px solid #ECE8DE", borderRadius: 8, background: "white", maxHeight: 160, overflowY: "auto", zIndex: 10, boxShadow: "0 4px 12px rgba(0,0,0,0.08)" }}>
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
                              style={{ width: "100%", padding: "8px 10px", borderRadius: 8, border: "1px solid #ECE8DE", background: "white", fontSize: 13, color: "#13101A", outline: "none" }}>
                              {WORSHIP_ROLE_OPTIONS.map(r => <option key={r} value={r}>{r}</option>)}
                            </select>
                            <div style={{ display: "flex", gap: 6 }}>
                              <button onClick={() => handleAddMember(week.id)} disabled={!addMemberUserId || addingMember}
                                style={{ flex: 1, padding: 8, background: "#3E1540", color: "#F6F4EF", borderRadius: 8, fontSize: 12, fontWeight: 600, border: "none", cursor: "pointer", opacity: !addMemberUserId || addingMember ? 0.6 : 1 }}>
                                {addingMember ? "Adding…" : "Add"}
                              </button>
                              <button onClick={() => { setAddMemberToWeekId(null); setAddMemberSearch(""); setAddMemberUserId(""); setAddMemberFocused(false) }}
                                style={{ padding: "8px 12px", background: "transparent", color: "#8A8497", borderRadius: 8, fontSize: 12, border: "1px solid #ECE8DE", cursor: "pointer" }}>
                                Cancel
                              </button>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
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
          {songsLoading ? (
            <div style={{ textAlign: "center", padding: "40px 0", color: "#8A8497", fontSize: 14 }}>Loading…</div>
          ) : weeks.length === 0 ? (
            <div style={{ background: "white", border: "1.5px dashed #ECE8DE", borderRadius: 16, padding: "40px 24px", textAlign: "center" }}>
              <p style={{ fontFamily: "var(--font-instrument-serif)", fontSize: 18, color: "#13101A", marginBottom: 6 }}>No weeks scheduled yet.</p>
              <p style={{ fontSize: 13, color: "#8A8497" }}>Add a week in the Schedule tab first.</p>
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              {weeks.map(week => {
                const songs = (songsByWeek[week.id] ?? []).sort((a, b) => a.order_index - b.order_index)
                const invites = invitesByWeek[week.id] ?? []
                const isExpanded = expandedWeeks.has(week.id)
                const isAddingThisWeek = addSongToWeekId === week.id
                const isLeader = week.leader_id === userId
                const canEditSongs = canManage || isLeader
                const uninvitedRoles = week.roles.filter(r => !invites.find(inv => inv.user_id === r.user_id))

                return (
                  <div key={week.id} style={{ background: "white", border: "1px solid #ECE8DE", borderRadius: 16, boxShadow: "0 2px 8px rgba(19,16,26,0.06)", overflow: "hidden" }}>
                    {/* Card header — collapse toggle */}
                    <button
                      onClick={() => setExpandedWeeks(prev => { const next = new Set(prev); isExpanded ? next.delete(week.id) : next.add(week.id); return next })}
                      style={{ width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between", padding: "16px 18px", background: "none", border: "none", cursor: "pointer", textAlign: "left" as const }}
                    >
                      <div>
                        <p style={{ fontFamily: "var(--font-instrument-serif)", fontSize: 17, color: "#13101A", lineHeight: 1.2 }}>
                          {worshipWeekDateLabel(week.week_date)}
                        </p>
                        {!isExpanded && (
                          <p style={{ fontSize: 12, color: "#8A8497", marginTop: 2 }}>
                            {songs.length === 0 ? "No songs yet" : `${songs.length} song${songs.length !== 1 ? "s" : ""}`}
                          </p>
                        )}
                      </div>
                      <ChevronDown style={{ width: 18, height: 18, color: "#8A8497", transform: isExpanded ? "rotate(180deg)" : "none", transition: "transform 0.2s", flexShrink: 0 }} />
                    </button>

                    {isExpanded && (
                      <div style={{ borderTop: "1px solid #ECE8DE" }}>
                        {/* Songs section */}
                        <div style={{ padding: "14px 18px" }}>
                          <p style={monoStyle}>Song list</p>
                          {songs.length === 0 ? (
                            <p style={{ fontSize: 13, color: "#8A8497", marginTop: 8 }}>No songs added yet.</p>
                          ) : (
                            <div style={{ marginTop: 10, display: "flex", flexDirection: "column", gap: 8 }}>
                              {songs.map((song, i) => (
                                <div key={song.id} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                                  {/* Reorder arrows */}
                                  {canEditSongs && (
                                    <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
                                      <button
                                        onClick={() => handleMoveSong(week.id, song.id, "up")}
                                        disabled={i === 0}
                                        style={{ padding: "1px 4px", background: "transparent", border: "none", cursor: i === 0 ? "default" : "pointer", opacity: i === 0 ? 0.25 : 0.6, lineHeight: 1 }}
                                        title="Move up"
                                      >
                                        <ChevronDown style={{ width: 13, height: 13, color: "#5A5466", transform: "rotate(180deg)" }} />
                                      </button>
                                      <button
                                        onClick={() => handleMoveSong(week.id, song.id, "down")}
                                        disabled={i === songs.length - 1}
                                        style={{ padding: "1px 4px", background: "transparent", border: "none", cursor: i === songs.length - 1 ? "default" : "pointer", opacity: i === songs.length - 1 ? 0.25 : 0.6, lineHeight: 1 }}
                                        title="Move down"
                                      >
                                        <ChevronDown style={{ width: 13, height: 13, color: "#5A5466" }} />
                                      </button>
                                    </div>
                                  )}
                                  {/* Song info */}
                                  <div style={{ flex: 1, minWidth: 0 }}>
                                    <span style={{ fontSize: 14, color: "#13101A", fontWeight: 500 }}>{song.title}</span>
                                    {song.song_leader_name && (
                                      <span style={{ fontSize: 12, color: "#8A8497", marginLeft: 6 }}>— {song.song_leader_name}</span>
                                    )}
                                  </div>
                                  {/* Key badge */}
                                  <span style={{ fontSize: 11, fontWeight: 700, color: "#3E1540", background: "#F4F0F8", borderRadius: 6, padding: "2px 8px", flexShrink: 0 }}>{song.key}</span>
                                  {/* Delete */}
                                  {canEditSongs && (
                                    <button onClick={() => handleDeleteSong(week.id, song.id)}
                                      style={{ padding: "2px 5px", fontSize: 12, color: "#C4C4C4", background: "transparent", border: "none", cursor: "pointer", lineHeight: 1, flexShrink: 0 }}>
                                      ✕
                                    </button>
                                  )}
                                </div>
                              ))}
                            </div>
                          )}

                          {/* Add song */}
                          {canEditSongs && !isAddingThisWeek && (
                            <button
                              onClick={() => { setAddSongToWeekId(week.id); setNewSongTitle(""); setNewSongKey("G"); setNewSongLeaderId("") }}
                              style={{ marginTop: 12, fontSize: 13, color: "#3E1540", fontWeight: 500, background: "transparent", border: "none", cursor: "pointer", padding: 0 }}
                            >
                              + Add song
                            </button>
                          )}

                          {isAddingThisWeek && (
                            <div style={{ marginTop: 12, padding: 14, background: "#FBF8F2", borderRadius: 10, border: "1px solid #ECE8DE" }}>
                              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                                <input
                                  type="text"
                                  placeholder="Song title"
                                  value={newSongTitle}
                                  onChange={e => setNewSongTitle(e.target.value)}
                                  style={{ width: "100%", padding: "8px 10px", borderRadius: 8, border: "1px solid #ECE8DE", background: "white", fontSize: 13, color: "#13101A", outline: "none", boxSizing: "border-box" as const }}
                                />
                                <div style={{ display: "flex", gap: 8 }}>
                                  <select value={newSongKey} onChange={e => setNewSongKey(e.target.value)}
                                    style={{ flex: 1, padding: "8px 10px", borderRadius: 8, border: "1px solid #ECE8DE", background: "white", fontSize: 13, color: "#13101A", outline: "none" }}>
                                    {["G", "A", "Bb", "C", "D", "E", "F", "Ab", "Eb"].map(k => <option key={k} value={k}>{k}</option>)}
                                  </select>
                                  <select value={newSongLeaderId} onChange={e => setNewSongLeaderId(e.target.value)}
                                    style={{ flex: 2, padding: "8px 10px", borderRadius: 8, border: "1px solid #ECE8DE", background: "white", fontSize: 13, color: "#13101A", outline: "none" }}>
                                    <option value="">No song leader</option>
                                    {teamMembers.map(m => <option key={m.user_id} value={m.user_id}>{m.name}</option>)}
                                  </select>
                                </div>
                                <div style={{ display: "flex", gap: 6 }}>
                                  <button onClick={() => handleAddSong(week.id)} disabled={!newSongTitle.trim() || addingSong}
                                    style={{ flex: 1, padding: 8, background: "#3E1540", color: "#F6F4EF", borderRadius: 8, fontSize: 12, fontWeight: 600, border: "none", cursor: "pointer", opacity: !newSongTitle.trim() || addingSong ? 0.6 : 1 }}>
                                    {addingSong ? "Adding…" : "Add"}
                                  </button>
                                  <button onClick={() => setAddSongToWeekId(null)}
                                    style={{ padding: "8px 12px", background: "transparent", color: "#8A8497", borderRadius: 8, fontSize: 12, border: "1px solid #ECE8DE", cursor: "pointer" }}>
                                    Cancel
                                  </button>
                                </div>
                              </div>
                            </div>
                          )}
                        </div>

                        {/* Divider */}
                        <div style={{ height: 1, background: "#ECE8DE", margin: "0 18px" }} />

                        {/* Invites section */}
                        <div style={{ padding: "14px 18px" }}>
                          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
                            <p style={monoStyle}>Invites</p>
                            {canManage && week.roles.length > 0 && uninvitedRoles.length > 0 && (
                              <button
                                onClick={() => handleSendInvites(week.id)}
                                disabled={sendingInvites === week.id}
                                style={{ fontSize: 12, fontWeight: 600, color: "#3E1540", background: "#F4F0F8", border: "none", borderRadius: 8, padding: "5px 12px", cursor: "pointer", opacity: sendingInvites === week.id ? 0.6 : 1 }}
                              >
                                {sendingInvites === week.id ? "Sending…" : `Send invites (${uninvitedRoles.length})`}
                              </button>
                            )}
                          </div>
                          {week.roles.length === 0 ? (
                            <p style={{ fontSize: 13, color: "#8A8497" }}>No members assigned. Add members in the Schedule tab.</p>
                          ) : (
                            <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
                              {week.roles.map(role => {
                                const invite = invites.find(inv => inv.user_id === role.user_id)
                                const statusCfg = invite ? ({
                                  pending:  { label: "Pending",  bg: "#FFF7E6", color: "#C9A34B" },
                                  accepted: { label: "Accepted", bg: "#EDFAF3", color: "#2D7A4F" },
                                  declined: { label: "Declined", bg: "#FEF2F2", color: "#B91C1C" },
                                } as const)[invite.status] : null
                                return (
                                  <div key={role.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                                    <div>
                                      <span style={{ fontSize: 13, color: "#13101A" }}>{role.user_name}</span>
                                      <span style={{ fontSize: 11, color: "#8A8497", marginLeft: 6 }}>{role.role_name}</span>
                                    </div>
                                    {statusCfg ? (
                                      <span style={{ fontSize: 11, fontWeight: 600, borderRadius: 20, padding: "3px 9px", background: statusCfg.bg, color: statusCfg.color, flexShrink: 0 }}>
                                        {statusCfg.label}
                                      </span>
                                    ) : (
                                      <span style={{ fontSize: 11, color: "#C4C4C4", flexShrink: 0 }}>Not invited</span>
                                    )}
                                  </div>
                                )
                              })}
                            </div>
                          )}
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

      {/* ── Slides ── */}
      {subTab === "slides" && (() => {
        const todayStr = new Date().toISOString().split("T")[0]
        const slidesWeek = weeks.find(w => w.id === slidesWeekId)
        const slidesSongs = (songsByWeek[slidesWeekId ?? ""] ?? []).sort((a, b) => a.order_index - b.order_index)
        const canGenerate = canManage
        const currentSlide = slidesSongs[slideIndex]
        return (
          <div>
            {/* Week selector */}
            {weeks.length > 1 && (
              <div style={{ marginBottom: 20 }}>
                <label style={{ display: "block", fontSize: 12, fontWeight: 500, color: "#5A5466", marginBottom: 6 }}>Week</label>
                <select
                  value={slidesWeekId ?? ""}
                  onChange={e => { setSlidesWeekId(e.target.value); setSlideIndex(0); setSlideDeckActive(false) }}
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
              <div style={{ background: "white", border: "1.5px dashed #ECE8DE", borderRadius: 16, padding: "40px 24px", textAlign: "center" }}>
                <p style={{ fontFamily: "var(--font-instrument-serif)", fontSize: 18, color: "#13101A", marginBottom: 6 }}>No songs in the set list yet.</p>
                <p style={{ fontSize: 13, color: "#8A8497" }}>Add songs in the Set List tab first.</p>
              </div>
            ) : !slideDeckActive ? (
              /* Song list preview + generate button */
              <div>
                <div style={{ background: "white", border: "1px solid #ECE8DE", borderRadius: 16, overflow: "hidden", boxShadow: "0 2px 8px rgba(19,16,26,0.06)", marginBottom: 16 }}>
                  {slidesSongs.map((song, i) => (
                    <div key={song.id} style={{ display: "flex", alignItems: "center", gap: 12, padding: "13px 18px", borderBottom: i < slidesSongs.length - 1 ? "1px solid #ECE8DE" : "none" }}>
                      <span style={{ fontFamily: "ui-monospace,'SF Mono',Menlo,monospace", fontSize: 11, color: "#C4C4C4", minWidth: 18 }}>{i + 1}</span>
                      <span style={{ fontSize: 14, color: "#13101A", flex: 1 }}>{song.title}</span>
                      <span style={{ fontSize: 11, fontWeight: 700, color: "#3E1540", background: "#F4F0F8", borderRadius: 6, padding: "2px 8px" }}>{song.key}</span>
                    </div>
                  ))}
                </div>
                <div style={{ display: "flex", gap: 10 }}>
                  {canGenerate && (
                    <button
                      onClick={() => { setSlideDeckActive(true); setSlideIndex(0) }}
                      style={{ flex: 1, padding: "11px 0", background: "#3E1540", color: "#F6F4EF", borderRadius: 12, fontSize: 14, fontWeight: 600, border: "none", cursor: "pointer" }}
                    >
                      Generate slides
                    </button>
                  )}
                  {canGenerate && (
                    <button
                      onClick={() => handleExportSlides(slidesSongs)}
                      style={{ padding: "11px 18px", background: "transparent", color: "#3E1540", borderRadius: 12, fontSize: 14, fontWeight: 600, border: "1.5px solid #3E1540", cursor: "pointer" }}
                    >
                      Export HTML
                    </button>
                  )}
                </div>
              </div>
            ) : (
              /* Slide viewer */
              <div>
                {/* Slide card */}
                <div style={{ background: "#3E1540", borderRadius: 20, padding: "60px 32px", textAlign: "center", marginBottom: 16, minHeight: 280, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", position: "relative", boxShadow: "0 8px 32px rgba(62,21,64,0.25)" }}>
                  {/* Radial gold glow */}
                  <div style={{ position: "absolute", inset: 0, borderRadius: 20, background: "radial-gradient(ellipse at 50% 60%, rgba(201,163,75,0.18) 0%, transparent 70%)", pointerEvents: "none" }} />
                  <p style={{ fontFamily: "var(--font-instrument-serif)", fontSize: "clamp(28px,8vw,52px)", color: "#F6F4EF", lineHeight: 1.2, fontWeight: 400, position: "relative" }}>
                    {currentSlide?.title ?? ""}
                  </p>
                  <p style={{ fontFamily: "ui-monospace,'SF Mono',Menlo,monospace", fontSize: 16, color: "rgba(246,244,239,0.55)", letterSpacing: "0.2em", textTransform: "uppercase", marginTop: 20, position: "relative" }}>
                    {currentSlide?.key ?? ""}
                  </p>
                </div>

                {/* Nav controls */}
                <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                  <button
                    onClick={() => setSlideIndex(i => Math.max(0, i - 1))}
                    disabled={slideIndex === 0}
                    style={{ flex: 1, padding: "10px 0", background: "white", border: "1px solid #ECE8DE", borderRadius: 10, fontSize: 13, fontWeight: 500, color: slideIndex === 0 ? "#C4C4C4" : "#13101A", cursor: slideIndex === 0 ? "default" : "pointer" }}
                  >
                    ← Prev
                  </button>
                  <span style={{ fontSize: 13, color: "#8A8497", whiteSpace: "nowrap" as const }}>{slideIndex + 1} / {slidesSongs.length}</span>
                  <button
                    onClick={() => setSlideIndex(i => Math.min(slidesSongs.length - 1, i + 1))}
                    disabled={slideIndex === slidesSongs.length - 1}
                    style={{ flex: 1, padding: "10px 0", background: "white", border: "1px solid #ECE8DE", borderRadius: 10, fontSize: 13, fontWeight: 500, color: slideIndex === slidesSongs.length - 1 ? "#C4C4C4" : "#13101A", cursor: slideIndex === slidesSongs.length - 1 ? "default" : "pointer" }}
                  >
                    Next →
                  </button>
                </div>
                <div style={{ display: "flex", gap: 10, marginTop: 12 }}>
                  <button
                    onClick={() => setSlideDeckActive(false)}
                    style={{ flex: 1, padding: "9px 0", background: "transparent", color: "#8A8497", borderRadius: 10, fontSize: 13, border: "1px solid #ECE8DE", cursor: "pointer" }}
                  >
                    Back to list
                  </button>
                  <button
                    onClick={() => handleExportSlides(slidesSongs)}
                    style={{ flex: 1, padding: "9px 0", background: "transparent", color: "#3E1540", borderRadius: 10, fontSize: 13, fontWeight: 600, border: "1.5px solid #3E1540", cursor: "pointer" }}
                  >
                    Export HTML
                  </button>
                </div>
              </div>
            )}
          </div>
        )
      })()}

      {/* ── Charts ── */}
      {subTab === "charts" && (() => {
        const todayStr = new Date().toISOString().split("T")[0]
        const chartsWeek = weeks.find(w => w.id === chartsWeekId)
        const chartsSongs = (songsByWeek[chartsWeekId ?? ""] ?? []).sort((a, b) => a.order_index - b.order_index)
        const isChartsLeader = chartsWeek?.leader_id === userId
        const canAnnotate = canManage || isChartsLeader
        const ANNOTATION_COLORS = ["#FDE68A", "#FCA5A5", "#86EFAC", "#7DD3FC", "#C4B5FD"]
        return (
          <div>
            {/* Week selector */}
            {weeks.length > 1 && (
              <div style={{ marginBottom: 20 }}>
                <label style={{ display: "block", fontSize: 12, fontWeight: 500, color: "#5A5466", marginBottom: 6 }}>Week</label>
                <select
                  value={chartsWeekId ?? ""}
                  onChange={e => { setChartsWeekId(e.target.value); setPendingAnnotation(null) }}
                  style={{ padding: "9px 12px", borderRadius: 10, border: "1px solid #ECE8DE", background: "#FBF8F2", fontSize: 14, color: "#13101A", outline: "none" }}
                >
                  {weeks.map(w => (
                    <option key={w.id} value={w.id}>{worshipWeekDateLabel(w.week_date)}{w.week_date < todayStr ? " (past)" : ""}</option>
                  ))}
                </select>
              </div>
            )}

            {chartsLoading ? (
              <div style={{ textAlign: "center", padding: "40px 0", color: "#8A8497", fontSize: 14 }}>Loading…</div>
            ) : chartsSongs.length === 0 ? (
              <div style={{ background: "white", border: "1.5px dashed #ECE8DE", borderRadius: 16, padding: "40px 24px", textAlign: "center" }}>
                <p style={{ fontFamily: "var(--font-instrument-serif)", fontSize: 18, color: "#13101A", marginBottom: 6 }}>No songs in the set list yet.</p>
                <p style={{ fontSize: 13, color: "#8A8497" }}>Add songs in the Set List tab first.</p>
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
                {chartsSongs.map(song => {
                  const chart = chartsBySong[song.id]
                  const annotations = annotationsBySong[song.id] ?? []
                  const isPdf = chart?.chart_url.toLowerCase().includes(".pdf") || chart?.chart_url.toLowerCase().includes("application/pdf")
                  const isUploading = uploadingChart === song.id
                  const isPending = pendingAnnotation?.songId === song.id

                  return (
                    <div key={song.id} style={{ background: "white", border: "1px solid #ECE8DE", borderRadius: 16, boxShadow: "0 2px 8px rgba(19,16,26,0.06)", overflow: "hidden" }}>
                      {/* Song header */}
                      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 18px", borderBottom: "1px solid #ECE8DE" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                          <span style={{ fontSize: 14, fontWeight: 600, color: "#13101A" }}>{song.title}</span>
                          <span style={{ fontSize: 11, fontWeight: 700, color: "#3E1540", background: "#F4F0F8", borderRadius: 6, padding: "2px 8px" }}>{song.key}</span>
                        </div>
                        {/* Upload button (only if no chart, or replace) */}
                        <label style={{ fontSize: 12, fontWeight: 600, color: chart ? "#8A8497" : "#3E1540", background: chart ? "transparent" : "#F4F0F8", border: chart ? "1px solid #ECE8DE" : "none", borderRadius: 8, padding: "5px 12px", cursor: isUploading ? "not-allowed" : "pointer", opacity: isUploading ? 0.6 : 1 }}>
                          {isUploading ? "Uploading…" : chart ? "Replace" : "Upload chart"}
                          <input type="file" accept="image/*,.pdf" style={{ display: "none" }}
                            onChange={e => { const f = e.target.files?.[0]; if (f) handleUploadChart(song.id, f); e.target.value = "" }}
                            disabled={isUploading}
                          />
                        </label>
                      </div>

                      {/* Chart display + annotation layer */}
                      {chart ? (
                        <div style={{ position: "relative" }}>
                          {/* Chart */}
                          <div
                            style={{ position: "relative", cursor: canAnnotate && !isPending ? "crosshair" : "default", userSelect: "none" as const }}
                            onClick={canAnnotate ? e => handleChartClick(e, song.id) : undefined}
                          >
                            {isPdf ? (
                              <embed src={chart.chart_url} type="application/pdf" style={{ width: "100%", height: 520, display: "block", border: "none" }} />
                            ) : (
                              <img src={chart.chart_url} alt={`${song.title} chart`} style={{ width: "100%", display: "block", maxHeight: 600, objectFit: "contain", background: "#FAFAFA" }} />
                            )}

                            {/* Saved annotations */}
                            {annotations.map(ann => (
                              <div
                                key={ann.id}
                                onMouseEnter={() => setHoveredAnnotationId(ann.id)}
                                onMouseLeave={() => setHoveredAnnotationId(null)}
                                onClick={e => { e.stopPropagation(); if (canAnnotate) handleDeleteAnnotation(song.id, ann.id) }}
                                style={{
                                  position: "absolute",
                                  left: `${ann.x}%`,
                                  top: `${ann.y}%`,
                                  transform: "translate(-50%, -50%)",
                                  background: ann.color,
                                  borderRadius: 8,
                                  padding: "5px 10px",
                                  fontSize: 12,
                                  fontWeight: 600,
                                  color: "#13101A",
                                  boxShadow: "0 2px 8px rgba(19,16,26,0.18)",
                                  cursor: canAnnotate ? "pointer" : "default",
                                  maxWidth: 160,
                                  wordBreak: "break-word" as const,
                                  zIndex: 5,
                                  opacity: hoveredAnnotationId === ann.id && canAnnotate ? 0.7 : 1,
                                  transition: "opacity 0.15s",
                                }}
                                title={canAnnotate ? "Click to remove" : undefined}
                              >
                                {ann.text}
                                {hoveredAnnotationId === ann.id && canAnnotate && (
                                  <span style={{ marginLeft: 6, color: "#5A5466", fontSize: 11 }}>✕</span>
                                )}
                              </div>
                            ))}

                            {/* Pending annotation input */}
                            {isPending && (
                              <div
                                onClick={e => e.stopPropagation()}
                                style={{ position: "absolute", left: `${pendingAnnotation!.x}%`, top: `${pendingAnnotation!.y}%`, transform: "translate(-50%, -50%)", zIndex: 20, background: "white", border: "1.5px solid #3E1540", borderRadius: 10, padding: 10, boxShadow: "0 4px 16px rgba(19,16,26,0.18)", minWidth: 180 }}
                              >
                                <input
                                  autoFocus
                                  type="text"
                                  placeholder="Annotation text…"
                                  value={pendingAnnotationText}
                                  onChange={e => setPendingAnnotationText(e.target.value)}
                                  onKeyDown={e => { if (e.key === "Enter") handleSaveAnnotation(song.id); if (e.key === "Escape") setPendingAnnotation(null) }}
                                  style={{ width: "100%", padding: "6px 8px", borderRadius: 6, border: "1px solid #ECE8DE", fontSize: 13, color: "#13101A", outline: "none", boxSizing: "border-box" as const, marginBottom: 8 }}
                                />
                                {/* Color picker */}
                                <div style={{ display: "flex", gap: 5, marginBottom: 8 }}>
                                  {ANNOTATION_COLORS.map(c => (
                                    <button key={c} onClick={() => setPendingAnnotationColor(c)}
                                      style={{ width: 20, height: 20, borderRadius: "50%", background: c, border: pendingAnnotationColor === c ? "2.5px solid #3E1540" : "1.5px solid transparent", cursor: "pointer" }} />
                                  ))}
                                </div>
                                <div style={{ display: "flex", gap: 6 }}>
                                  <button onClick={() => handleSaveAnnotation(song.id)} disabled={!pendingAnnotationText.trim() || savingAnnotation}
                                    style={{ flex: 1, padding: "6px 0", background: "#3E1540", color: "#F6F4EF", borderRadius: 7, fontSize: 12, fontWeight: 600, border: "none", cursor: "pointer", opacity: !pendingAnnotationText.trim() || savingAnnotation ? 0.6 : 1 }}>
                                    {savingAnnotation ? "Saving…" : "Save"}
                                  </button>
                                  <button onClick={() => setPendingAnnotation(null)}
                                    style={{ padding: "6px 10px", background: "transparent", color: "#8A8497", borderRadius: 7, fontSize: 12, border: "1px solid #ECE8DE", cursor: "pointer" }}>
                                    Cancel
                                  </button>
                                </div>
                              </div>
                            )}
                          </div>

                          {/* Annotation hint */}
                          {canAnnotate && !isPending && (
                            <p style={{ fontSize: 11, color: "#8A8497", padding: "8px 18px", borderTop: "1px solid #ECE8DE" }}>
                              Click anywhere on the chart to add an annotation. Click an annotation to remove it.
                            </p>
                          )}
                        </div>
                      ) : (
                        /* No chart uploaded yet */
                        <div style={{ padding: "36px 24px", textAlign: "center" }}>
                          <p style={{ fontSize: 13, color: "#8A8497" }}>No chart uploaded yet. Upload a PDF or image above.</p>
                        </div>
                      )}
                    </div>
                  )
                })}
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
              <div style={{ marginBottom: canManage ? 32 : 0 }}>
                <p style={{ fontFamily: "var(--font-instrument-serif)", fontSize: 20, color: "#13101A", marginBottom: 14 }}>My availability</p>
                {weekDates.length === 0 ? (
                  <div style={{ background: "white", border: "1.5px dashed #ECE8DE", borderRadius: 16, padding: "32px 24px", textAlign: "center" }}>
                    <p style={{ fontSize: 13, color: "#8A8497" }}>No weeks scheduled this month. Check the Schedule tab.</p>
                  </div>
                ) : (
                  <div style={{ background: "white", border: "1px solid #ECE8DE", borderRadius: 16, overflow: "hidden", boxShadow: "0 2px 8px rgba(19,16,26,0.06)" }}>
                    {weekDates.map((date, i) => {
                      const avail = myAvailability[date]
                      const isSaving = savingAvail === date
                      return (
                        <div key={date} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, padding: "14px 18px", borderBottom: i < weekDates.length - 1 ? "1px solid #ECE8DE" : "none", flexWrap: "wrap" as const }}>
                          <p style={{ fontSize: 14, color: "#13101A", flexShrink: 0 }}>{worshipWeekDateLabel(date)}</p>
                          <div style={{ display: "flex", gap: 6, opacity: isSaving ? 0.5 : 1, pointerEvents: isSaving ? "none" : "auto" }}>
                            {(["available", "busy", "unsure"] as AvailStatus[]).map(s => {
                              const active = avail === s
                              const cfg = {
                                available: { label: "Available", activeBg: "#EDFAF3", activeColor: "#2D7A4F", activeBorder: "#6EE7B7" },
                                busy:      { label: "Busy",      activeBg: "#FEF2F2", activeColor: "#B91C1C", activeBorder: "#FCA5A5" },
                                unsure:    { label: "Unsure",    activeBg: "#FFFBEB", activeColor: "#92400E", activeBorder: "#FCD34D" },
                              }[s]
                              return (
                                <button key={s} onClick={() => handleSetAvailability(date, s)}
                                  style={{
                                    padding: "5px 12px", borderRadius: 20, fontSize: 12, fontWeight: 600,
                                    border: `1px solid ${active ? cfg.activeBorder : "#ECE8DE"}`,
                                    background: active ? cfg.activeBg : "white",
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

              {/* Manager view: all members' availability */}
              {canManage && weekDates.length > 0 && teamMembers.length > 0 && (
                <div>
                  <p style={{ fontFamily: "var(--font-instrument-serif)", fontSize: 20, color: "#13101A", marginBottom: 14 }}>Team availability</p>
                  <div style={{ background: "white", border: "1px solid #ECE8DE", borderRadius: 16, overflowX: "auto", boxShadow: "0 2px 8px rgba(19,16,26,0.06)" }}>
                    <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                      <thead>
                        <tr style={{ borderBottom: "1px solid #ECE8DE" }}>
                          <th style={{ textAlign: "left", padding: "10px 16px", color: "#8A8497", fontWeight: 500, fontSize: 11, whiteSpace: "nowrap" as const }}>Member</th>
                          {weekDates.map(d => (
                            <th key={d} style={{ textAlign: "center", padding: "10px 12px", color: "#8A8497", fontWeight: 500, fontSize: 11, whiteSpace: "nowrap" as const }}>
                              {new Date(d + "T12:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {teamMembers.map((member, i) => (
                          <tr key={member.user_id} style={{ borderBottom: i < teamMembers.length - 1 ? "1px solid #ECE8DE" : "none" }}>
                            <td style={{ padding: "10px 16px", color: "#13101A", fontWeight: 500, whiteSpace: "nowrap" as const }}>{member.name}</td>
                            {weekDates.map(d => {
                              const a = allAvailability[member.user_id]?.[d]
                              return (
                                <td key={d} style={{ textAlign: "center", padding: "10px 12px" }}>
                                  {a === "available"
                                    ? <span style={{ display: "inline-block", width: 20, height: 20, borderRadius: "50%", background: "#EDFAF3", color: "#2D7A4F", lineHeight: "20px", fontSize: 11, fontWeight: 700, textAlign: "center" as const }}>✓</span>
                                    : a === "busy"
                                      ? <span style={{ display: "inline-block", width: 20, height: 20, borderRadius: "50%", background: "#FEF2F2", color: "#B91C1C", lineHeight: "20px", fontSize: 11, fontWeight: 700, textAlign: "center" as const }}>✕</span>
                                      : a === "unsure"
                                        ? <span style={{ display: "inline-block", width: 20, height: 20, borderRadius: "50%", background: "#FFFBEB", color: "#92400E", lineHeight: "20px", fontSize: 11, fontWeight: 700, textAlign: "center" as const }}>?</span>
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

// ── MinistryCalendar ──────────────────────────────────────────────────────────

const CATEGORY_CONFIG = {
  welcoming: { label: "Welcoming", dot: "#16A34A", bg: "#DCFCE7", text: "#14532D" },
  retreat:   { label: "Retreat",   dot: "#2563EB", bg: "#DBEAFE", text: "#1E3A8A" },
  social:    { label: "Social",    dot: "#C9A34B", bg: "#FEF3C7", text: "#92400E" },
  service:   { label: "Service",   dot: "#7C3AED", bg: "#EDE9FE", text: "#4C1D95" },
  regular:   { label: "Regular",   dot: "#6B7280", bg: "#F3F4F6", text: "#374151" },
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
    <div style={{ borderTop: "1px solid #E5E0D2", paddingTop: 24, marginBottom: 32 }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
        <span style={{ fontFamily: "var(--font-instrument-serif)", fontSize: 22, fontWeight: 400, color: "#13101A" }}>
          Ministry Calendar
        </span>
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
}: {
  calendarEvent: CalendarEvent
  ministryId: string
  userId: string
  canEdit: boolean
  onClose: () => void
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
      style={{ position: "fixed", top: 0, bottom: 0, left: 0, right: 0, zIndex: 75, background: "#FBF8F2", overflowY: "auto" }}
      className="md:left-[296px]"
    >
      {/* Header */}
      <div style={{ position: "sticky", top: 0, background: "#FBF8F2", borderBottom: "1px solid #E5E0D2", zIndex: 10, padding: "0 24px" }}>
        <div style={{ maxWidth: 720, margin: "0 auto" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12, paddingTop: 48, paddingBottom: 16 }}>
            <button
              onClick={onClose}
              style={{ background: "none", border: "none", cursor: "pointer", padding: "4px 8px 4px 0", display: "flex", alignItems: "center", gap: 6, color: "#5A5466", fontSize: 13 }}
            >
              ← Back
            </button>
            <div style={{ flex: 1 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 2 }}>
                <h1 style={{ fontFamily: "var(--font-instrument-serif)", fontSize: 28, fontWeight: 400, color: "#13101A", margin: 0 }}>
                  {calendarEvent.title}
                </h1>
                <span style={{ fontSize: 11, fontWeight: 500, color: cfg.text, background: cfg.bg, padding: "3px 10px", borderRadius: 9999, flexShrink: 0 }}>
                  {cfg.label}
                </span>
              </div>
              <p style={{ fontSize: 13, color: "#8A8497", margin: 0 }}>
                {dateStr}{calendarEvent.location ? ` · ${calendarEvent.location}` : ""}
              </p>
            </div>
          </div>

          {/* Section tabs */}
          <div style={{ display: "flex", gap: 4, paddingBottom: 12 }}>
            {sections.map((s) => (
              <button
                key={s.key}
                onClick={() => setActiveSection(s.key)}
                style={{
                  padding: "6px 14px",
                  borderRadius: 999,
                  border: "none",
                  cursor: "pointer",
                  fontSize: 13,
                  fontWeight: activeSection === s.key ? 500 : 400,
                  background: activeSection === s.key ? "#3E1540" : "transparent",
                  color: activeSection === s.key ? "#F6F4EF" : "#8A8497",
                  transition: "background 0.15s, color 0.15s",
                }}
              >
                {s.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Content */}
      <div style={{ maxWidth: 720, margin: "0 auto", padding: "24px 24px 80px" }}>
        {loading ? (
          <div style={{ textAlign: "center", padding: "48px 0", color: "#8A8497", fontSize: 13 }}>Loading…</div>
        ) : (
          <>
            {/* ── Overview ── */}
            {activeSection === 'overview' && (
              <div>
                {/* Event info block */}
                <div style={{ ...cardStyle, background: "#F4F0F8", border: "1px solid #DDD5E8" }}>
                  <p style={{ fontSize: 14, color: "#5A5466", margin: "0 0 4px" }}><strong style={{ color: "#13101A" }}>Date</strong> · {dateStr}</p>
                  {calendarEvent.location && (
                    <p style={{ fontSize: 14, color: "#5A5466", margin: "0 0 4px" }}><strong style={{ color: "#13101A" }}>Location</strong> · {calendarEvent.location}</p>
                  )}
                  {calendarEvent.description && (
                    <p style={{ fontSize: 14, color: "#5A5466", margin: "4px 0 0", lineHeight: 1.6 }}>{calendarEvent.description}</p>
                  )}
                </div>

                {/* Editable fields */}
                <div style={cardStyle}>
                  <p style={sectionHeadingStyle}>Planning Details</p>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 12 }}>
                    <div>
                      <label style={{ fontSize: 12, color: "#8A8497", display: "block", marginBottom: 4 }}>Expected turnout</label>
                      <input
                        type="number"
                        value={turnout}
                        onChange={(e) => setTurnout(e.target.value)}
                        placeholder="e.g. 80"
                        style={inputStyle}
                      />
                    </div>
                    <div>
                      <label style={{ fontSize: 12, color: "#8A8497", display: "block", marginBottom: 4 }}>Budget allocated ($)</label>
                      <input
                        type="number"
                        value={budget}
                        onChange={(e) => setBudget(e.target.value)}
                        placeholder="e.g. 500"
                        style={inputStyle}
                      />
                    </div>
                  </div>
                  <div style={{ marginBottom: 12 }}>
                    <label style={{ fontSize: 12, color: "#8A8497", display: "block", marginBottom: 4 }}>Overview notes</label>
                    <textarea
                      value={overviewNotes}
                      onChange={(e) => setOverviewNotes(e.target.value)}
                      placeholder="High-level notes about this event..."
                      rows={4}
                      style={{ ...inputStyle, resize: "vertical", lineHeight: 1.5 }}
                    />
                  </div>
                  {canEdit && (
                    <button
                      onClick={handleSaveOverview}
                      disabled={savingOverview}
                      style={{ padding: "8px 20px", borderRadius: 8, border: "none", background: "#3E1540", color: "#F6F4EF", fontSize: 13, fontWeight: 500, cursor: savingOverview ? "not-allowed" : "pointer", opacity: savingOverview ? 0.7 : 1 }}
                    >
                      {savingOverview ? "Saving…" : "Save"}
                    </button>
                  )}
                </div>
              </div>
            )}

            {/* ── Checklist ── */}
            {activeSection === 'checklist' && (
              <div style={cardStyle}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
                  <p style={sectionHeadingStyle}>Checklist</p>
                  <span style={{ fontSize: 12, color: "#8A8497" }}>{incompleteTasks.length} remaining</span>
                </div>

                {/* Add task form */}
                {canEdit && (
                  <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 20, padding: "16px", background: "#F4F0F8", borderRadius: 10 }}>
                    <input
                      value={newTaskTitle}
                      onChange={(e) => setNewTaskTitle(e.target.value)}
                      placeholder="New task..."
                      style={inputStyle}
                      onKeyDown={(e) => { if (e.key === "Enter") handleAddTask() }}
                    />
                    <div style={{ display: "flex", gap: 8 }}>
                      <select
                        value={newTaskAssignee}
                        onChange={(e) => setNewTaskAssignee(e.target.value)}
                        style={{ ...selectStyle, flex: 1 }}
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
                        style={{ ...inputStyle, width: "auto" }}
                      />
                      <button
                        onClick={handleAddTask}
                        disabled={addingTask || !newTaskTitle.trim()}
                        style={{ padding: "8px 16px", borderRadius: 8, border: "none", background: "#3E1540", color: "#F6F4EF", fontSize: 13, fontWeight: 500, cursor: addingTask || !newTaskTitle.trim() ? "not-allowed" : "pointer", opacity: addingTask || !newTaskTitle.trim() ? 0.6 : 1, whiteSpace: "nowrap" }}
                      >
                        Add
                      </button>
                    </div>
                  </div>
                )}

                {/* Incomplete tasks */}
                {incompleteTasks.length === 0 && completedTasks.length === 0 && (
                  <p style={{ fontSize: 13, color: "#8A8497", textAlign: "center", padding: "16px 0" }}>No tasks yet.</p>
                )}
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {incompleteTasks.map((task) => (
                    <div key={task.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 12px", border: "1px solid #E5E0D2", borderRadius: 8 }}>
                      <input
                        type="checkbox"
                        checked={task.completed}
                        onChange={() => handleToggleTask(task)}
                        style={{ width: 16, height: 16, cursor: "pointer", accentColor: "#3E1540", flexShrink: 0 }}
                      />
                      <span style={{ flex: 1, fontSize: 14, color: "#13101A" }}>{task.title}</span>
                      {task.assigned_name && (
                        <span style={chipStyle}>{task.assigned_name}</span>
                      )}
                      {task.due_date && (
                        <span style={{ fontSize: 12, color: "#8A8497", whiteSpace: "nowrap" }}>
                          {new Date(task.due_date + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                        </span>
                      )}
                      {canEdit && (
                        <button
                          onClick={() => handleDeleteTask(task.id)}
                          style={{ background: "none", border: "none", cursor: "pointer", padding: 0, flexShrink: 0, color: "#C4C4C4" }}
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  ))}
                </div>

                {/* Completed tasks */}
                {completedTasks.length > 0 && (
                  <div style={{ marginTop: 20 }}>
                    <div style={{ borderTop: "1px solid #E5E0D2", paddingTop: 16, marginBottom: 8 }}>
                      <span style={{ fontSize: 11, color: "#8A8497", textTransform: "uppercase", letterSpacing: "0.05em", fontWeight: 500 }}>Completed</span>
                    </div>
                    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                      {completedTasks.map((task) => (
                        <div key={task.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 12px", border: "1px solid #E5E0D2", borderRadius: 8, opacity: 0.5 }}>
                          <input
                            type="checkbox"
                            checked={task.completed}
                            onChange={() => handleToggleTask(task)}
                            style={{ width: 16, height: 16, cursor: "pointer", accentColor: "#3E1540", flexShrink: 0 }}
                          />
                          <span style={{ flex: 1, fontSize: 14, color: "#13101A", textDecoration: "line-through" }}>{task.title}</span>
                          {task.assigned_name && (
                            <span style={chipStyle}>{task.assigned_name}</span>
                          )}
                          {task.due_date && (
                            <span style={{ fontSize: 12, color: "#8A8497", whiteSpace: "nowrap" }}>
                              {new Date(task.due_date + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                            </span>
                          )}
                          {canEdit && (
                            <button
                              onClick={() => handleDeleteTask(task.id)}
                              style={{ background: "none", border: "none", cursor: "pointer", padding: 0, flexShrink: 0, color: "#C4C4C4" }}
                            >
                              <X className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* ── Roles & Leads ── */}
            {activeSection === 'roles' && (
              <div style={cardStyle}>
                <p style={sectionHeadingStyle}>Roles & Leads</p>

                {roles.length === 0 && (
                  <p style={{ fontSize: 13, color: "#8A8497", textAlign: "center", padding: "16px 0" }}>No roles defined yet.</p>
                )}

                {/* Roles table */}
                <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 16 }}>
                  {roles.map((role) => (
                    <div key={role.id}>
                      {editingRoleId === role.id ? (
                        <div style={{ border: "1px solid #3E1540", borderRadius: 8, padding: "12px" }}>
                          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 8 }}>
                            <input
                              value={editRoleName}
                              onChange={(e) => setEditRoleName(e.target.value)}
                              placeholder="Role name"
                              style={inputStyle}
                            />
                            <select
                              value={editRoleAssignee}
                              onChange={(e) => setEditRoleAssignee(e.target.value)}
                              style={{ ...selectStyle, width: "100%" }}
                            >
                              <option value="">Unassigned</option>
                              {members.map((m) => (
                                <option key={m.id} value={m.id}>{m.name}</option>
                              ))}
                            </select>
                          </div>
                          <input
                            value={editRoleNotes}
                            onChange={(e) => setEditRoleNotes(e.target.value)}
                            placeholder="Notes (optional)"
                            style={{ ...inputStyle, marginBottom: 8 }}
                          />
                          <div style={{ display: "flex", gap: 8 }}>
                            <button
                              onClick={() => handleSaveRoleEdit(role.id)}
                              style={{ padding: "6px 14px", borderRadius: 8, border: "none", background: "#3E1540", color: "#F6F4EF", fontSize: 12, fontWeight: 500, cursor: "pointer" }}
                            >
                              Save
                            </button>
                            <button
                              onClick={() => setEditingRoleId(null)}
                              style={{ padding: "6px 14px", borderRadius: 8, border: "1px solid #E5E0D2", background: "none", fontSize: 12, color: "#5A5466", cursor: "pointer" }}
                            >
                              Cancel
                            </button>
                          </div>
                        </div>
                      ) : (
                        <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 12px", border: "1px solid #E5E0D2", borderRadius: 8 }}>
                          <div style={{ flex: 1 }}>
                            <span style={{ fontSize: 14, fontWeight: 500, color: "#13101A" }}>{role.role_name}</span>
                            {role.notes && (
                              <p style={{ fontSize: 12, color: "#8A8497", margin: "2px 0 0" }}>{role.notes}</p>
                            )}
                          </div>
                          {role.assigned_name ? (
                            <span style={chipStyle}>{role.assigned_name}</span>
                          ) : (
                            <span style={{ ...chipStyle, color: "#C4C4C4" }}>Unassigned</span>
                          )}
                          {canEdit && (
                            <div style={{ display: "flex", gap: 6 }}>
                              <button
                                onClick={() => {
                                  setEditingRoleId(role.id)
                                  setEditRoleName(role.role_name)
                                  setEditRoleAssignee(role.assigned_to ?? "")
                                  setEditRoleNotes(role.notes ?? "")
                                }}
                                style={{ background: "none", border: "none", cursor: "pointer", padding: 0, color: "#8A8497" }}
                              >
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                  <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                                  <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                                </svg>
                              </button>
                              <button
                                onClick={() => handleDeleteRole(role.id)}
                                style={{ background: "none", border: "none", cursor: "pointer", padding: 0, color: "#C4C4C4" }}
                              >
                                <X className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  ))}
                </div>

                {/* Add role form */}
                {canEdit && (
                  <div style={{ borderTop: "1px solid #E5E0D2", paddingTop: 16 }}>
                    <p style={{ fontSize: 12, color: "#8A8497", margin: "0 0 8px" }}>Add a role</p>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 8 }}>
                      <input
                        value={newRoleName}
                        onChange={(e) => setNewRoleName(e.target.value)}
                        placeholder="Role name"
                        style={inputStyle}
                      />
                      <select
                        value={newRoleAssignee}
                        onChange={(e) => setNewRoleAssignee(e.target.value)}
                        style={{ ...selectStyle, width: "100%" }}
                      >
                        <option value="">Unassigned</option>
                        {members.map((m) => (
                          <option key={m.id} value={m.id}>{m.name}</option>
                        ))}
                      </select>
                    </div>
                    <div style={{ display: "flex", gap: 8 }}>
                      <input
                        value={newRoleNotes}
                        onChange={(e) => setNewRoleNotes(e.target.value)}
                        placeholder="Notes (optional)"
                        style={{ ...inputStyle, flex: 1 }}
                      />
                      <button
                        onClick={handleAddRole}
                        disabled={addingRole || !newRoleName.trim()}
                        style={{ padding: "8px 16px", borderRadius: 8, border: "none", background: "#3E1540", color: "#F6F4EF", fontSize: 13, fontWeight: 500, cursor: addingRole || !newRoleName.trim() ? "not-allowed" : "pointer", opacity: addingRole || !newRoleName.trim() ? 0.6 : 1, whiteSpace: "nowrap" }}
                      >
                        Add
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* ── Transition Notes ── */}
            {activeSection === 'notes' && (
              <div style={cardStyle}>
                <div style={{ marginBottom: 16 }}>
                  <p style={sectionHeadingStyle}>Transition Notes</p>
                  <p style={{ fontSize: 13, color: "#8A8497", margin: "-8px 0 0" }}>Institutional memory — never deleted</p>
                </div>

                {/* Add note form */}
                {canEdit && (
                  <div style={{ marginBottom: 20, padding: "16px", background: "#F4F0F8", borderRadius: 10 }}>
                    <textarea
                      value={newNote}
                      onChange={(e) => setNewNote(e.target.value)}
                      placeholder="Write a note for future leaders..."
                      rows={3}
                      style={{ ...inputStyle, resize: "vertical", lineHeight: 1.5, marginBottom: 8 }}
                    />
                    <button
                      onClick={handleAddNote}
                      disabled={addingNote || !newNote.trim()}
                      style={{ padding: "7px 16px", borderRadius: 8, border: "none", background: "#3E1540", color: "#F6F4EF", fontSize: 13, fontWeight: 500, cursor: addingNote || !newNote.trim() ? "not-allowed" : "pointer", opacity: addingNote || !newNote.trim() ? 0.6 : 1 }}
                    >
                      {addingNote ? "Adding…" : "Add note"}
                    </button>
                  </div>
                )}

                {notes.length === 0 && (
                  <p style={{ fontSize: 13, color: "#8A8497", textAlign: "center", padding: "16px 0" }}>No notes yet. Add institutional knowledge for future leaders.</p>
                )}

                <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                  {notes.map((note) => (
                    <div key={note.id} style={{ borderBottom: "1px solid #E5E0D2", paddingBottom: 16 }}>
                      <p style={{ fontSize: 14, color: "#5A5466", lineHeight: 1.6, margin: "0 0 8px", whiteSpace: "pre-wrap" }}>{note.content}</p>
                      <p style={{ fontSize: 12, color: "#8A8497", margin: 0 }}>
                        {note.created_by_name ?? "Someone"} · {new Date(note.created_at).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}

// ── CreateTeamOverlay ─────────────────────────────────────────────────────────

export function CreateTeamOverlay({ userId, ministryId, onClose, onCreated }: {
  userId: string
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
      return exists ? prev.filter((m) => m.userId !== memberId) : [...prev, { userId: memberId, roleIdx: 0 }]
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

    // Build members list — always include creator, then any additionally selected members
    const creatorAlreadySelected = selectedMembers.some((m) => m.userId === userId)
    const allMembers = creatorAlreadySelected
      ? selectedMembers
      : [{ userId, roleIdx: 0 }, ...selectedMembers]

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

      <div className="flex-1 overflow-y-auto px-5 py-5">
        {error && (
          <div className="rounded-xl bg-[#3E1540]/8 px-4 py-3 text-[13px] text-[#3E1540] font-medium mb-4">{error}</div>
        )}

        {/* Step 1: Preset picker */}
        {step === "preset" && (
          <div className="flex flex-col gap-3">
            <p className="text-[13px] text-[#8A8497] mb-1">Start with a preset or build from scratch.</p>
            {TEAM_PRESETS.map((preset) => (
              <button
                key={preset.id}
                onClick={() => applyPreset(preset)}
                className="w-full bg-white rounded-2xl border border-[#ECE8DE] p-4 text-left hover:border-[#3E1540]/30 hover:bg-[#FDFBF7] transition-all shadow-[0_1px_4px_rgba(19,16,26,0.06)]"
              >
                <div className="flex items-center gap-3 mb-2">
                  <span className="text-[22px]">{preset.icon}</span>
                  <p className="text-[14px] font-bold text-[#13101A]">{preset.name}</p>
                </div>
                <p className="text-[12px] text-[#8A8497] mb-3">{preset.description}</p>
                <div className="flex flex-wrap gap-1.5">
                  {preset.roles.map((r) => (
                    <span key={r.name} className="text-[11px] bg-[#FBF8F2] border border-[#ECE8DE] text-[#5A5466] px-2 py-0.5 rounded-full">
                      {r.name}
                    </span>
                  ))}
                </div>
              </button>
            ))}
            <button
              onClick={() => { setTeamName(""); setTeamIcon("👥"); setTeamDesc(""); setRoles([{ name: "Member", permissions: [] }]); setStep("customize") }}
              className="w-full bg-white rounded-2xl border border-dashed border-[#ECE8DE] p-4 text-center hover:border-[#3E1540]/30 hover:bg-[#FDFBF7] transition-all"
            >
              <p className="text-[14px] font-semibold text-[#5A5466]">Start from scratch</p>
              <p className="text-[12px] text-[#8A8497] mt-0.5">Build custom roles and permissions</p>
            </button>
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
                    {sel && roles.length > 1 && (
                      <select
                        value={sel.roleIdx}
                        onChange={(e) => updateMemberRole(member.id, Number(e.target.value))}
                        className="text-[12px] text-[#5A5466] bg-[#FBF8F2] border border-[#ECE8DE] rounded-lg px-2 py-1 focus:outline-none"
                      >
                        {roles.map((r, i) => (
                          <option key={i} value={i}>{r.name || `Role ${i + 1}`}</option>
                        ))}
                      </select>
                    )}
                    {sel && roles.length === 1 && (
                      <span className="text-[12px] text-[#8A8497]">{roles[0].name}</span>
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
  const [ministryMembers, setMinistryMembers] = useState<{ id: string; name: string }[]>([])
  const [addSearch, setAddSearch] = useState("")
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [selectedRoleId, setSelectedRoleId] = useState<string>("")
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

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
      .select("id, name")
      .eq("ministry_id", ministryId)
      .order("name")
      .then(({ data }) => setMinistryMembers((data ?? []).filter((m) => !memberIds.has(m.id))))
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
  }

  const filteredAdd = ministryMembers.filter((m) =>
    m.name.toLowerCase().includes(addSearch.toLowerCase())
  )

  return (
    <div className="fixed inset-0 z-[70] bg-[#FBF8F2] max-w-[390px] mx-auto flex flex-col md:left-[296px] md:max-w-none">
      <div className="flex items-center justify-between px-5 pt-12 pb-4 md:pt-5 border-b border-[#ECE8DE] bg-[#FBF8F2]">
        <button
          onClick={showAddMember ? () => { setShowAddMember(false); setError(null) } : onClose}
          className="flex items-center gap-1.5 text-[13px] text-[#8A8497] hover:text-[#3E1540] transition-colors"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          {showAddMember ? "Back" : "Teams"}
        </button>
        <div className="flex items-center gap-2">
          {!showAddMember && <span className="text-[18px]">{team.icon ?? "👥"}</span>}
          <span className="text-[14px] font-semibold text-[#13101A]">
            {showAddMember ? "Add Member" : team.name}
          </span>
        </div>
        <div className="w-14 flex justify-end">
          {!showAddMember && isAdmin && (
            <button onClick={() => setConfirmDelete(true)} className="text-[#8A8497] hover:text-red-500 transition-colors">
              <Trash2 className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      {confirmDelete && (
        <div className="mx-5 mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 flex items-center justify-between gap-3">
          <span className="text-[13px] text-red-700 font-medium">Delete this team?</span>
          <div className="flex gap-2">
            <button onClick={() => setConfirmDelete(false)} className="text-[12px] font-semibold text-[#8A8497] hover:text-[#13101A]">Cancel</button>
            <button onClick={handleDeleteTeam} className="text-[12px] font-semibold text-red-600 hover:text-red-800">Delete</button>
          </div>
        </div>
      )}

      <div className="flex-1 overflow-y-auto px-5 py-5">
        {error && (
          <div className="rounded-xl bg-[#3E1540]/8 px-4 py-3 text-[13px] text-[#3E1540] font-medium mb-4">{error}</div>
        )}

        {!showAddMember && (
          <>
            {loading ? <Spinner /> : (
              <div className="flex flex-col gap-6">
                {/* Roles */}
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

                {/* Members */}
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-3 flex-1 mr-3">
                      <span style={{ fontFamily: "var(--font-instrument-serif)", fontSize: "22px", fontWeight: 400, color: "#13101A", letterSpacing: "-0.01em" }}>
                        Members
                      </span>
                      <div className="flex-1 h-px bg-[#ECE8DE]" />
                    </div>
                    <button
                      onClick={() => setShowAddMember(true)}
                      className="text-[12px] font-semibold text-[#3E1540] hover:opacity-70 flex-shrink-0"
                    >
                      + Add
                    </button>
                  </div>
                  <div className="flex flex-col gap-1.5">
                    {members.length === 0 && (
                      <p className="text-[13px] text-[#8A8497] text-center py-4">No one&apos;s here yet.</p>
                    )}
                    {members.map((m) => (
                      <div key={m.user_id} className="flex items-center gap-3 bg-white rounded-xl border border-[#ECE8DE] p-3">
                        <div className={`w-8 h-8 rounded-xl flex items-center justify-center text-[12px] font-bold text-[#F6F4EF] flex-shrink-0 ${getAvatarColor(m.name)}`}>
                          {getInitials(m.name)}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-[14px] font-medium text-[#13101A] truncate">{m.name}</p>
                          <p className="text-[12px] text-[#8A8497]">{m.role_name}</p>
                        </div>
                        {isAdmin && m.user_id !== userId && (
                          <button onClick={() => handleRemoveMember(m.user_id)} className="text-[#C4C4C4] hover:text-[#3E1540] transition-colors">
                            <X className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </>
        )}

        {showAddMember && (
          <div className="flex flex-col gap-4 pb-24">
            {/* Role picker — single role applies to all selected */}
            {roles.length > 1 && (
              <div className="flex flex-col gap-2">
                <label className="text-[12px] font-medium text-[#5A5466]">Assign role</label>
                <div className="flex gap-2 flex-wrap">
                  {roles.map((r) => (
                    <button
                      key={r.id}
                      onClick={() => setSelectedRoleId(r.id)}
                      className={`text-[12px] font-semibold px-3 py-1.5 rounded-xl border transition-all ${
                        selectedRoleId === r.id
                          ? "bg-[#3E1540] border-[#3E1540] text-[#F6F4EF]"
                          : "bg-white border-[#ECE8DE] text-[#5A5466] hover:border-[#3E1540]/30"
                      }`}
                    >
                      {r.name}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Selected chips */}
            {selectedIds.size > 0 && (
              <div className="flex flex-wrap gap-2">
                {ministryMembers.filter((m) => selectedIds.has(m.id)).map((m) => (
                  <button
                    key={m.id}
                    onClick={() => setSelectedIds((prev) => { const next = new Set(prev); next.delete(m.id); return next })}
                    className="flex items-center gap-1.5 bg-[#3E1540] text-white px-3 py-1.5 rounded-full text-[12px] font-semibold hover:bg-[#2D0F2E] transition-colors"
                  >
                    {m.name.split(" ")[0]}
                    <X className="w-3 h-3 opacity-70" />
                  </button>
                ))}
              </div>
            )}

            {/* Search */}
            <div className="relative">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-[#C4C4C4]" />
              <input
                type="text"
                value={addSearch}
                onChange={(e) => setAddSearch(e.target.value)}
                placeholder="Search members…"
                className="w-full pl-10 pr-4 py-3 rounded-xl bg-[#FBF8F2] border border-[#ECE8DE] text-[13px] placeholder:text-[#C4C4C4] focus:outline-none focus:ring-2 focus:ring-[#3E1540]/20"
              />
            </div>

            {/* Member list */}
            <div className="flex flex-col gap-1.5">
              {filteredAdd.length === 0 && (
                <p className="text-[13px] text-[#8A8497] text-center py-6">No members to add.</p>
              )}
              {filteredAdd.map((member) => {
                const selected = selectedIds.has(member.id)
                return (
                  <button
                    key={member.id}
                    onClick={() => setSelectedIds((prev) => {
                      const next = new Set(prev)
                      if (next.has(member.id)) next.delete(member.id)
                      else next.add(member.id)
                      return next
                    })}
                    className={`flex items-center gap-3 rounded-xl border p-3 text-left transition-all ${
                      selected ? "bg-[#3E1540]/5 border-[#3E1540]/30" : "bg-white border-[#ECE8DE] hover:bg-[#FDFBF7]"
                    }`}
                  >
                    <div className={`w-8 h-8 rounded-xl flex items-center justify-center text-[12px] font-bold text-[#F6F4EF] flex-shrink-0 ${getAvatarColor(member.name)}`}>
                      {getInitials(member.name)}
                    </div>
                    <span className="flex-1 text-[14px] font-medium text-[#13101A]">{member.name}</span>
                    {selected && <Check className="w-4 h-4 text-[#3E1540]" />}
                  </button>
                )
              })}
            </div>
          </div>
        )}
      </div>

      {/* Sticky add button */}
      {showAddMember && selectedIds.size > 0 && (
        <div className="flex-shrink-0 px-5 pb-8 pt-3 bg-[#FBF8F2] border-t border-[#ECE8DE]">
          <button
            onClick={handleAddMembers}
            disabled={saving}
            className="w-full py-3.5 rounded-2xl bg-[#3E1540] text-[#F6F4EF] text-[15px] font-semibold hover:bg-[#2D0F2E] transition-colors disabled:opacity-50"
          >
            {saving ? "Adding…" : `Add ${selectedIds.size} ${selectedIds.size === 1 ? "member" : "members"}`}
          </button>
        </div>
      )}
    </div>
  )
}
