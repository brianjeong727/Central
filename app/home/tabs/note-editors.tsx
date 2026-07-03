"use client"

// Collaborative note + rich-text editors, split out of plan-tab.tsx so that the
// heavy @tiptap/* and yjs runtime deps stay OUT of plan-tab's static module graph.
// plan-tab (and profile-tab) pull these in lazily via next/dynamic — users who
// never open a meeting note or edit a role description never download the editor.
// Behavior is identical to the original in-plan-tab implementation.

import { useState, useEffect, useRef, useMemo } from "react"
import {
  Bold, Italic, Underline as UnderlineIcon, Strikethrough, List, ListOrdered,
  Indent, Outdent, AlignLeft, AlignCenter, AlignRight,
} from "lucide-react"
import { useEditor, EditorContent } from "@tiptap/react"
import type { Editor } from "@tiptap/core"
import StarterKit from "@tiptap/starter-kit"
import { Underline as TiptapUnderline } from "@tiptap/extension-underline"
import { TextAlign } from "@tiptap/extension-text-align"
import { TextStyle } from "@tiptap/extension-text-style"
import { Color } from "@tiptap/extension-color"
import { Placeholder } from "@tiptap/extension-placeholder"
import * as Y from "yjs"
import Collaboration from "@tiptap/extension-collaboration"
import { createClient } from "@/lib/supabase"
import { MonogramChip } from "@/components/central"
import { getInitials } from "../utils"

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

const NOTE_COLORS = [
  "#000000", "#374151", "#6B7280",
  "#EF4444", "#F97316", "#EAB308",
  "#22C55E", "#3B82F6", "#8B5CF6",
  "#EC4899", "var(--plum)",
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
        color: active ? "var(--plum)" : "var(--body)",
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

  const div = <div style={{ width: 1, height: 14, background: "var(--line)", margin: "0 3px", flexShrink: 0 }} />
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
          <span style={{ fontSize: 12, fontWeight: 700, color: "var(--body)", lineHeight: 1 }}>A</span>
          <div style={{ width: 14, height: 2.5, borderRadius: 2, background: currentColor ?? "#374151" }} />
        </button>
        {showColors && (
          <div style={{
            position: "absolute",
            top: "calc(100% + 4px)",
            left: "50%",
            transform: "translateX(-50%)",
            background: "white",
            border: "1px solid var(--line)",
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
                  border: currentColor === c ? "2px solid var(--plum)" : "1.5px solid rgba(0,0,0,0.10)",
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
                background: "white", border: "1.5px solid var(--line)",
                cursor: "pointer", fontSize: 9, color: "var(--muted-text)",
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
interface CollabUser { userId: string; userName: string }

// ── Live collab hook ──────────────────────────────────────────────────────────
function useNoteCollab(noteId: string, userId: string, userName: string) {
  const supabase = createClient()
  const ydoc = useMemo(() => new Y.Doc(), [noteId]) // eslint-disable-line react-hooks/exhaustive-deps
  const [activeUsers, setActiveUsers] = useState<CollabUser[]>([])
  const receivedStateRef = useRef(false)
  const initDoneRef = useRef(false)
  const isApplyingRemote = useRef(false)
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null)

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
      // Emit a custom DOM event that MeetingNoteDetail listens to
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
      await channel.track({ userId, userName })
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

  return { ydoc, activeUsers, receivedStateRef, initDoneRef, channelRef, isApplyingRemote }
}

export function MeetingNoteEditor({
  noteId,
  userId,
  userName,
  initialContent,
  onSave,
  onEditorReady,
  canWrite = true,
}: {
  noteId: string
  userId: string
  userName: string
  initialContent: string
  onSave: (html: string) => Promise<void>
  onEditorReady?: (editor: Editor | null) => void
  canWrite?: boolean
}) {
  const { ydoc, activeUsers, receivedStateRef, initDoneRef, isApplyingRemote } = useNoteCollab(noteId, userId, userName)
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const lastLocalEditRef = useRef(0)
  const editorRef = useRef<Editor | null>(null)

  const editor = useEditor({
    editable: canWrite,
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
              <MonogramChip
                key={u.userId}
                title={u.userName}
                initials={getInitials(u.userName)}
                style={{ width: 22, height: 22, fontSize: 9, fontWeight: 700, border: "2px solid white", marginLeft: i === 0 ? 0 : -6 }}
              />
            ))}
          </div>
          <span style={{ fontSize: 12, color: "var(--muted-text)" }}>
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
