"use client"

import { useState, useEffect, useRef, useMemo, useCallback } from "react"
import dynamic from "next/dynamic"
import useSWR from "swr"
import { useRouter } from "next/navigation"
import { ChevronRight, ChevronDown, X, Check, Camera, Pencil, BookOpen, Search, ImageIcon, MoreHorizontal, Plus, Trash2, Settings } from "lucide-react"
import { createClient } from "@/lib/supabase"
import { MONO_STYLE, RingCrossLogo, EmptyState } from "../components/shared"
import { getInitials } from "../utils"
import { roleLabel } from "@/app/actions/super-constants"
import { getHomeVerses } from "@/app/actions/home-verses"
import { selfLeaveMinistry } from "@/app/actions/ministry"
import { deleteMyAccount } from "@/app/actions/delete-account"
import { CentralButton, IconButton, PlanSubTabStrip, TabPageHeader, PageTitle, JournalListSkeleton, ConfirmDialog, ActionMenu, Input } from "@/components/central"
import { useNavState } from "../nav-state"
import { NotificationsSection } from "../components/notifications"
import type { Profile, Devotional, Prayer, Verse, NotificationSettings } from "../types"

// Lazy — RoleDescriptionEditor pulls in @tiptap + yjs; keep that bundle off the
// Profile tab's chunk until the user actually opens a journal editor.
const RoleDescriptionEditor = dynamic(
  () => import("./note-editors").then(m => m.RoleDescriptionEditor),
  { ssr: false, loading: () => <div style={{ minHeight: 44 }} /> },
)

const JOURNAL_TABS = [
  { key: "devotionals", label: "Devotionals" },
  { key: "prayers",     label: "Prayers" },
  { key: "verses",      label: "Verses" },
] as const

type JournalTabId = "devotionals" | "prayers" | "verses"

function fmtJournalDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
}

// ── Pure SWR fetchers (no setState — side-effects run in useEffect on data) ────
async function loadDevotionals(supabase: ReturnType<typeof createClient>, userId: string, ministryId: string): Promise<Devotional[]> {
  const { data } = await supabase.from("devotionals").select("*").eq("user_id", userId).eq("ministry_id", ministryId).order("created_at", { ascending: false })
  return (data as Devotional[]) ?? []
}

async function loadPrayers(supabase: ReturnType<typeof createClient>, userId: string, ministryId: string): Promise<Prayer[]> {
  const { data } = await supabase.from("prayers").select("*").eq("user_id", userId).eq("ministry_id", ministryId).order("created_at", { ascending: false })
  return (data as Prayer[]) ?? []
}

async function loadVerses(supabase: ReturnType<typeof createClient>, userId: string, ministryId: string): Promise<Verse[]> {
  const { data } = await supabase.from("verses").select("*").eq("user_id", userId).eq("ministry_id", ministryId).order("created_at", { ascending: false })
  return (data as Verse[]) ?? []
}

async function loadMinistrySchools(supabase: ReturnType<typeof createClient>, ministryId: string): Promise<{ id: string; name: string; abbreviation: string }[]> {
  const { data } = await supabase.from("ministry_schools").select("id, name, abbreviation").eq("ministry_id", ministryId).order("sort_order")
  return (data as { id: string; name: string; abbreviation: string }[]) ?? []
}

// ── Journal Devotionals Tab ───────────────────────────────────────────────────

export function JournalDevotionalsTab({ userId, ministryId, onCountChange }: { userId: string; ministryId: string; onCountChange?: (n: number, dates: string[]) => void }) {
  const supabase = createClient()
  const imageInputRef = useRef<HTMLInputElement>(null)
  const { data, isLoading: loading, mutate } = useSWR(
    ["devotionals", userId, ministryId],
    () => loadDevotionals(supabase, userId, ministryId)
  )
  const entries = useMemo(() => data ?? [], [data])
  const [searchQuery, setSearchQuery] = useState("")
  const [showEditor, setShowEditor] = useState(false)
  const [editingEntry, setEditingEntry] = useState<Devotional | null>(null)
  const [draft, setDraft] = useState({ title: "", passage: "", content: "", image_url: null as string | null })
  const [saving, setSaving] = useState(false)
  const [uploadingImage, setUploadingImage] = useState(false)
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set())
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)

  // Report count + entry dates to the parent whenever the cached list changes.
  useEffect(() => {
    if (data) onCountChange?.(data.length, data.map((d) => d.created_at))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data])

  const filtered = useMemo(() => {
    if (!searchQuery.trim()) return entries
    const q = searchQuery.toLowerCase()
    return entries.filter(e => e.title.toLowerCase().includes(q) || e.passage.toLowerCase().includes(q) || e.content.toLowerCase().includes(q))
  }, [entries, searchQuery])

  function openNew() { setEditingEntry(null); setDraft({ title: "", passage: "", content: "", image_url: null }); setShowEditor(true) }
  function openEdit(entry: Devotional) { setEditingEntry(entry); setDraft({ title: entry.title, passage: entry.passage, content: entry.content, image_url: entry.image_url }); setShowEditor(true) }

  async function handleSave() {
    if (!draft.title.trim()) return
    setSaving(true)
    if (editingEntry) {
      const { data: row, error } = await supabase.from("devotionals").update({ title: draft.title, passage: draft.passage, content: draft.content, image_url: draft.image_url }).eq("id", editingEntry.id).eq("user_id", userId).eq("ministry_id", ministryId).select().single()
      if (!error && row) mutate(curr => (curr ?? []).map(e => e.id === editingEntry.id ? (row as Devotional) : e), { revalidate: false })
    } else {
      const { data: row, error } = await supabase.from("devotionals").insert({ user_id: userId, ministry_id: ministryId, title: draft.title, passage: draft.passage, content: draft.content, image_url: draft.image_url }).select().single()
      if (!error && row) mutate(curr => [row as Devotional, ...(curr ?? [])], { revalidate: false })
    }
    setSaving(false); setShowEditor(false); setEditingEntry(null)
  }

  async function handleDelete(id: string) {
    const { error } = await supabase.from("devotionals").delete().eq("id", id).eq("user_id", userId).eq("ministry_id", ministryId)
    if (!error) mutate(curr => (curr ?? []).filter(e => e.id !== id), { revalidate: false })
  }

  async function handleImageUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]; if (!file) return
    setUploadingImage(true)
    const ext = file.name.split(".").pop()
    const { data: uploadData, error } = await supabase.storage.from("devotionals").upload(`${userId}/${Date.now()}.${ext}`, file, { upsert: false })
    if (!error && uploadData) { const { data: { publicUrl } } = supabase.storage.from("devotionals").getPublicUrl(uploadData.path); setDraft(d => ({ ...d, image_url: publicUrl })) }
    setUploadingImage(false); if (imageInputRef.current) imageInputRef.current.value = ""
  }

  function toggleExpand(id: string) { setExpandedIds(prev => { const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); return n }) }
  const inputBase: React.CSSProperties = { display: "block", width: "100%", background: "transparent", border: "none", outline: "none", fontFamily: "inherit" }

  if (showEditor) {
    return (
      <JournalEditorShell
        eyebrow={editingEntry ? "Edit devotional" : "New devotional"}
        onCancel={() => { setShowEditor(false); setEditingEntry(null) }}
        onSave={handleSave}
        saving={saving}
        canSave={!!draft.title.trim()}
        saveLabel={editingEntry ? "Update" : "Save entry"}
      >
        <input ref={imageInputRef} type="file" accept="image/*" className="hidden" onChange={handleImageUpload} />
        <RoleDescriptionEditor
          key={editingEntry?.id ?? "new"}
          initialContent={draft.content}
          onChange={html => setDraft(d => ({ ...d, content: html }))}
          placeholder="Write your reflections here…"
          minHeight={340}
        >
          <div style={{ paddingBottom: 4 }}>
            <input type="text" placeholder="Entry title…" value={draft.title} onChange={e => setDraft(d => ({ ...d, title: e.target.value }))} autoFocus style={{ ...inputBase, fontFamily: "var(--serif)", fontSize: 28, color: "var(--ink)", marginBottom: 6, letterSpacing: "-0.02em" }} />
            <input type="text" placeholder="Passage reference (e.g. John 3:16–17)" value={draft.passage} onChange={e => setDraft(d => ({ ...d, passage: e.target.value }))} style={{ ...inputBase, fontFamily: "var(--serif)", fontStyle: "italic", fontSize: 14, color: "var(--plum)", borderBottom: "1px solid var(--line)", marginBottom: 0, paddingBottom: 10 }} />
          </div>
        </RoleDescriptionEditor>
        <div style={{ paddingTop: 16 }}>
          {draft.image_url ? (
            <div style={{ position: "relative", display: "inline-block" }}>
              <img src={draft.image_url} alt="" style={{ maxHeight: 220, maxWidth: "100%", borderRadius: 8 }} />
              <button onClick={() => setDraft(d => ({ ...d, image_url: null }))} style={{ position: "absolute", top: 5, right: 5, background: "color-mix(in srgb, var(--ink) 50%, transparent)", border: "none", borderRadius: "50%", width: 20, height: 20, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}><X size={10} color="var(--cream-on-dark)" /></button>
            </div>
          ) : (
            <button onClick={() => imageInputRef.current?.click()} disabled={uploadingImage} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: "var(--muted-text)", background: "transparent", border: "1px dashed var(--line)", borderRadius: 8, padding: "7px 11px", cursor: "pointer" }}>
              <ImageIcon size={12} />{uploadingImage ? "Uploading…" : "Attach photo or image"}
            </button>
          )}
        </div>
      </JournalEditorShell>
    )
  }

  return (
    <div>
      <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 20 }}>
        <div style={{ flex: 1, position: "relative" }}>
          <Search size={14} style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", color: "var(--muted-text)", pointerEvents: "none" }} />
          <input type="text" placeholder="Search devotionals…" value={searchQuery} onChange={e => setSearchQuery(e.target.value)} style={{ width: "100%", paddingLeft: 36, paddingRight: 12, paddingTop: 9, paddingBottom: 9, background: "var(--cream)", border: "1px solid var(--line)", borderRadius: 10, fontSize: 13, color: "var(--ink)", outline: "none", fontFamily: "inherit" }} />
        </div>
        <CentralButton variant="create" size="sm" onClick={openNew} style={{ flexShrink: 0, whiteSpace: "nowrap" }}>
          <Plus size={14} />New entry
        </CentralButton>
      </div>

      {loading ? (
        <JournalListSkeleton />
      ) : filtered.length === 0 ? (
        searchQuery.trim() ? (
          <EmptyState icon={<Search className="w-7 h-7" />} title="No matches" subtitle={`No entries match “${searchQuery}”`} />
        ) : (
          <EmptyState icon={<BookOpen className="w-7 h-7" />} title="No devotionals yet" subtitle="Write your first entry to get started." />
        )
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {filtered.map((entry, idx) => {
            const isFirst = idx === 0 && !searchQuery.trim()
            const isExpanded = isFirst || expandedIds.has(entry.id) || searchQuery.trim().length > 0
            return (
              <div key={entry.id} style={{ background: "var(--cream)", borderRadius: "var(--r-card)", border: "1px solid var(--line)" }}>
                <div style={{ padding: isExpanded ? "20px 20px 0" : "14px 18px", cursor: isFirst ? "default" : "pointer" }} onClick={() => { if (!isFirst) { toggleExpand(entry.id) } }}>
                  <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 10 }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <h3 style={{ fontFamily: "var(--serif)", fontSize: isExpanded ? 19 : 15, fontWeight: 400, color: "var(--ink)", letterSpacing: "-0.01em", lineHeight: 1.25, margin: 0, marginBottom: entry.passage ? 3 : 0 }}>{entry.title}</h3>
                      {entry.passage && <p style={{ fontFamily: "var(--serif)", fontStyle: "italic", fontSize: 13, color: "var(--plum)", lineHeight: 1.4, margin: 0 }}>{entry.passage}</p>}
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 4, flexShrink: 0 }}>
                      <span style={{ fontFamily: "ui-monospace, monospace", fontSize: 10, color: "var(--muted-text)", letterSpacing: "0.04em", whiteSpace: "nowrap" }}>{fmtJournalDate(entry.created_at)}</span>
                      <ActionMenu
                        align="right"
                        minWidth={130}
                        renderTrigger={({ open, toggle }) => (
                          <IconButton dim={26} active={open} onClick={toggle}><MoreHorizontal size={15} /></IconButton>
                        )}
                        items={[
                          { key: "edit", label: "Edit", icon: <Pencil size={13} />, onSelect: () => openEdit(entry) },
                          { key: "delete", label: "Delete", tone: "danger", icon: <Trash2 size={13} />, onSelect: () => setConfirmDeleteId(entry.id) },
                        ]}
                      />
                      {!isFirst && <span style={{ color: "var(--muted-text)", display: "flex" }}>{isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}</span>}
                    </div>
                  </div>
                </div>
                {isExpanded && (
                  <div style={{ padding: "12px 20px 20px" }}>
                    {entry.content && <div className="role-desc-view" dangerouslySetInnerHTML={{ __html: entry.content }} style={{ marginBottom: entry.image_url ? 14 : 0 }} />}
                    {entry.image_url && <img src={entry.image_url} alt="" style={{ maxWidth: "100%", maxHeight: 320, borderRadius: 8, objectFit: "cover", display: "block" }} />}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
      <ConfirmDialog
        open={!!confirmDeleteId}
        title="Delete this devotional?"
        confirmLabel="Delete"
        onConfirm={() => { const id = confirmDeleteId; setConfirmDeleteId(null); if (id) handleDelete(id) }}
        onClose={() => setConfirmDeleteId(null)}
      />
    </div>
  )
}

// ── Journal Prayers Tab ───────────────────────────────────────────────────────

export function JournalPrayersTab({ userId, ministryId, onCountChange }: { userId: string; ministryId: string; onCountChange?: (n: number) => void }) {
  const supabase = createClient()
  const { data, isLoading: loading, mutate } = useSWR(
    ["prayers", userId, ministryId],
    () => loadPrayers(supabase, userId, ministryId)
  )
  const entries = useMemo(() => data ?? [], [data])
  const [searchQuery, setSearchQuery] = useState("")
  const [showEditor, setShowEditor] = useState(false)
  const [editingEntry, setEditingEntry] = useState<Prayer | null>(null)
  const [draft, setDraft] = useState({ title: "", content: "" })
  const [saving, setSaving] = useState(false)
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set())
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)

  // Report count to the parent whenever the cached list changes.
  useEffect(() => {
    if (data) onCountChange?.(data.length)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data])

  const filtered = useMemo(() => {
    if (!searchQuery.trim()) return entries
    const q = searchQuery.toLowerCase()
    return entries.filter(e => e.title.toLowerCase().includes(q) || e.content.toLowerCase().includes(q))
  }, [entries, searchQuery])

  function openNew() { setEditingEntry(null); setDraft({ title: "", content: "" }); setShowEditor(true) }
  function openEdit(entry: Prayer) { setEditingEntry(entry); setDraft({ title: entry.title, content: entry.content }); setShowEditor(true) }

  async function handleSave() {
    if (!draft.title.trim()) return
    setSaving(true)
    if (editingEntry) {
      const { data: row, error } = await supabase.from("prayers").update({ title: draft.title, content: draft.content }).eq("id", editingEntry.id).eq("user_id", userId).eq("ministry_id", ministryId).select().single()
      if (!error && row) mutate(curr => (curr ?? []).map(e => e.id === editingEntry.id ? (row as Prayer) : e), { revalidate: false })
    } else {
      const { data: row, error } = await supabase.from("prayers").insert({ user_id: userId, ministry_id: ministryId, title: draft.title, content: draft.content }).select().single()
      if (!error && row) mutate(curr => [row as Prayer, ...(curr ?? [])], { revalidate: false })
    }
    setSaving(false); setShowEditor(false); setEditingEntry(null)
  }

  async function handleDelete(id: string) {
    const { error } = await supabase.from("prayers").delete().eq("id", id).eq("user_id", userId).eq("ministry_id", ministryId)
    if (!error) mutate(curr => (curr ?? []).filter(e => e.id !== id), { revalidate: false })
  }

  function toggleExpand(id: string) { setExpandedIds(prev => { const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); return n }) }

  const inputBase: React.CSSProperties = { display: "block", width: "100%", background: "transparent", border: "none", outline: "none", fontFamily: "inherit" }

  if (showEditor) {
    return (
      <JournalEditorShell
        eyebrow={editingEntry ? "Edit prayer" : "New prayer"}
        onCancel={() => { setShowEditor(false); setEditingEntry(null) }}
        onSave={handleSave}
        saving={saving}
        canSave={!!draft.title.trim()}
        saveLabel={editingEntry ? "Update" : "Save prayer"}
      >
        <RoleDescriptionEditor
          key={editingEntry?.id ?? "new"}
          initialContent={draft.content}
          onChange={html => setDraft(d => ({ ...d, content: html }))}
          placeholder="Write your prayer here…"
          minHeight={340}
        >
          <div style={{ paddingBottom: 4 }}>
            <input type="text" placeholder="Prayer title…" value={draft.title} onChange={e => setDraft(d => ({ ...d, title: e.target.value }))} autoFocus style={{ ...inputBase, fontFamily: "var(--serif)", fontSize: 28, color: "var(--ink)", marginBottom: 0, letterSpacing: "-0.02em", borderBottom: "1px solid var(--line)", paddingBottom: 10 }} />
          </div>
        </RoleDescriptionEditor>
      </JournalEditorShell>
    )
  }

  return (
    <div>
      <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 20 }}>
        <div style={{ flex: 1, position: "relative" }}>
          <Search size={14} style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", color: "var(--muted-text)", pointerEvents: "none" }} />
          <input type="text" placeholder="Search prayers…" value={searchQuery} onChange={e => setSearchQuery(e.target.value)} style={{ width: "100%", paddingLeft: 36, paddingRight: 12, paddingTop: 9, paddingBottom: 9, background: "var(--cream)", border: "1px solid var(--line)", borderRadius: 10, fontSize: 13, color: "var(--ink)", outline: "none", fontFamily: "inherit" }} />
        </div>
        <CentralButton variant="create" size="sm" onClick={openNew} style={{ flexShrink: 0, whiteSpace: "nowrap" }}>
          <Plus size={14} />New prayer
        </CentralButton>
      </div>


      {loading ? (
        <JournalListSkeleton />
      ) : filtered.length === 0 ? (
        searchQuery.trim() ? (
          <EmptyState icon={<Search className="w-7 h-7" />} title="No matches" subtitle={`No prayers match “${searchQuery}”`} />
        ) : (
          <EmptyState icon={<BookOpen className="w-7 h-7" />} title="No prayers yet" subtitle="Record your first prayer request." />
        )
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {filtered.map((entry, idx) => {
            const isFirst = idx === 0 && !searchQuery.trim()
            const isExpanded = isFirst || expandedIds.has(entry.id) || searchQuery.trim().length > 0
            const hasBody = !!(entry.content && entry.content.replace(/<[^>]*>/g, "").trim())
            return (
              <div key={entry.id} style={{ background: "var(--cream)", borderRadius: "var(--r-card)", border: "1px solid var(--line)" }}>
                <div style={{ padding: isExpanded ? (hasBody ? "18px 20px 0" : "18px 20px 16px") : "13px 18px", cursor: isFirst ? "default" : "pointer" }} onClick={() => { if (!isFirst) { toggleExpand(entry.id) } }}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
                    <div style={{ flex: 1, minWidth: 0, display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                      <h3 style={{ fontFamily: "var(--serif)", fontSize: 15, fontWeight: 400, color: "var(--ink)", letterSpacing: "-0.01em", lineHeight: 1.3, margin: 0 }}>{entry.title}</h3>
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 4, flexShrink: 0 }}>
                      <span style={{ fontFamily: "ui-monospace, monospace", fontSize: 10, color: "var(--muted-text)", letterSpacing: "0.04em", whiteSpace: "nowrap" }}>{fmtJournalDate(entry.created_at)}</span>
                      <ActionMenu
                        align="right"
                        minWidth={130}
                        renderTrigger={({ open, toggle }) => (
                          <IconButton dim={26} active={open} onClick={toggle}><MoreHorizontal size={15} /></IconButton>
                        )}
                        items={[
                          { key: "edit", label: "Edit", icon: <Pencil size={13} />, onSelect: () => openEdit(entry) },
                          { key: "delete", label: "Delete", tone: "danger", icon: <Trash2 size={13} />, onSelect: () => setConfirmDeleteId(entry.id) },
                        ]}
                      />
                      {!isFirst && <span style={{ color: "var(--muted-text)", display: "flex" }}>{isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}</span>}
                    </div>
                  </div>
                </div>
                {isExpanded && hasBody && (
                  <div style={{ padding: "12px 20px 18px" }}>
                    <div className="role-desc-view" dangerouslySetInnerHTML={{ __html: entry.content! }} />
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
      <ConfirmDialog
        open={!!confirmDeleteId}
        title="Delete this prayer?"
        confirmLabel="Delete"
        onConfirm={() => { const id = confirmDeleteId; setConfirmDeleteId(null); if (id) handleDelete(id) }}
        onClose={() => setConfirmDeleteId(null)}
      />
    </div>
  )
}

// ── Journal Verses Tab ────────────────────────────────────────────────────────

export function JournalVersesTab({ userId, ministryId }: { userId: string; ministryId: string }) {
  const supabase = createClient()
  const { data, isLoading: loading, mutate } = useSWR(
    ["verses", userId, ministryId],
    () => loadVerses(supabase, userId, ministryId)
  )
  const entries = useMemo(() => data ?? [], [data])
  const [searchQuery, setSearchQuery] = useState("")
  const [showEditor, setShowEditor] = useState(false)
  const [editingEntry, setEditingEntry] = useState<Verse | null>(null)
  const [draft, setDraft] = useState({ reference: "", verse_text: "", note: "" })
  const [saving, setSaving] = useState(false)
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set())
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)

  const filtered = useMemo(() => {
    if (!searchQuery.trim()) return entries
    const q = searchQuery.toLowerCase()
    return entries.filter(e => e.reference.toLowerCase().includes(q) || e.verse_text.toLowerCase().includes(q) || e.note.toLowerCase().includes(q))
  }, [entries, searchQuery])

  function openNew() { setEditingEntry(null); setDraft({ reference: "", verse_text: "", note: "" }); setShowEditor(true) }
  function openEdit(entry: Verse) { setEditingEntry(entry); setDraft({ reference: entry.reference, verse_text: entry.verse_text, note: entry.note }); setShowEditor(true) }

  async function handleSave() {
    if (!draft.reference.trim() || !draft.verse_text.trim()) return
    setSaving(true)
    if (editingEntry) {
      const { data: row, error } = await supabase.from("verses").update({ reference: draft.reference, verse_text: draft.verse_text, note: draft.note }).eq("id", editingEntry.id).eq("user_id", userId).eq("ministry_id", ministryId).select().single()
      if (!error && row) mutate(curr => (curr ?? []).map(e => e.id === editingEntry.id ? (row as Verse) : e), { revalidate: false })
    } else {
      const { data: row, error } = await supabase.from("verses").insert({ user_id: userId, ministry_id: ministryId, reference: draft.reference, verse_text: draft.verse_text, note: draft.note }).select().single()
      if (!error && row) mutate(curr => [row as Verse, ...(curr ?? [])], { revalidate: false })
    }
    setSaving(false); setShowEditor(false); setEditingEntry(null)
  }

  async function handleDelete(id: string) {
    const { error } = await supabase.from("verses").delete().eq("id", id).eq("user_id", userId).eq("ministry_id", ministryId)
    if (!error) mutate(curr => (curr ?? []).filter(e => e.id !== id), { revalidate: false })
  }
  function toggleExpand(id: string) { setExpandedIds(prev => { const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); return n }) }
  const inputBase: React.CSSProperties = { display: "block", width: "100%", background: "transparent", border: "none", outline: "none", fontFamily: "inherit" }

  if (showEditor) {
    return (
      <JournalEditorShell
        eyebrow={editingEntry ? "Edit verse" : "New verse"}
        onCancel={() => { setShowEditor(false); setEditingEntry(null) }}
        onSave={handleSave}
        saving={saving}
        canSave={!!draft.reference.trim() && !!draft.verse_text.trim()}
        saveLabel={editingEntry ? "Update" : "Save verse"}
      >
        <input type="text" placeholder="Reference (e.g. John 3:16)" value={draft.reference} onChange={e => setDraft(d => ({ ...d, reference: e.target.value }))} autoFocus style={{ ...inputBase, fontFamily: "var(--serif)", fontSize: 24, color: "var(--plum)", marginBottom: 14, letterSpacing: "-0.01em" }} />
        <textarea placeholder="Verse text…" value={draft.verse_text} onChange={e => setDraft(d => ({ ...d, verse_text: e.target.value }))} rows={4} style={{ display: "block", width: "100%", fontFamily: "var(--serif)", fontStyle: "italic", fontSize: 17, color: "var(--ink)", lineHeight: 1.7, background: "transparent", border: "none", borderBottom: "1px solid var(--line)", outline: "none", resize: "none", marginBottom: 18, paddingBottom: 14 }} />
        <textarea placeholder="Why this verse convicted you…" value={draft.note} onChange={e => setDraft(d => ({ ...d, note: e.target.value }))} rows={8} style={{ display: "block", width: "100%", fontSize: 15, color: "var(--body)", lineHeight: 1.8, background: "transparent", border: "none", outline: "none", resize: "vertical", minHeight: 200, fontFamily: "inherit" }} />
      </JournalEditorShell>
    )
  }

  return (
    <div>
      <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 20 }}>
        <div style={{ flex: 1, position: "relative" }}>
          <Search size={14} style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", color: "var(--muted-text)", pointerEvents: "none" }} />
          <input type="text" placeholder="Search verses…" value={searchQuery} onChange={e => setSearchQuery(e.target.value)} style={{ width: "100%", paddingLeft: 36, paddingRight: 12, paddingTop: 9, paddingBottom: 9, background: "var(--cream)", border: "1px solid var(--line)", borderRadius: 10, fontSize: 13, color: "var(--ink)", outline: "none", fontFamily: "inherit" }} />
        </div>
        <CentralButton variant="create" size="sm" onClick={openNew} style={{ flexShrink: 0, whiteSpace: "nowrap" }}>
          <Plus size={14} />Add verse
        </CentralButton>
      </div>

      {loading ? (
        <JournalListSkeleton />
      ) : filtered.length === 0 ? (
        searchQuery.trim() ? (
          <EmptyState icon={<Search className="w-7 h-7" />} title="No matches" subtitle={`No verses match “${searchQuery}”`} />
        ) : (
          <EmptyState icon={<BookOpen className="w-7 h-7" />} title="No verses saved yet" subtitle="Save a verse that has spoken to you." />
        )
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {filtered.map((entry, idx) => {
            const isFirst = idx === 0 && !searchQuery.trim()
            const isExpanded = isFirst || expandedIds.has(entry.id) || searchQuery.trim().length > 0
            const preview = entry.verse_text.length > 90 ? entry.verse_text.slice(0, 90) + "…" : entry.verse_text
            return (
              <div key={entry.id} style={{ background: "var(--cream)", borderRadius: "var(--r-card)", border: "1px solid var(--line)" }}>
                <div style={{ padding: isExpanded ? "20px 20px 0" : "14px 18px", cursor: isFirst ? "default" : "pointer" }} onClick={() => { if (!isFirst) { toggleExpand(entry.id) } }}>
                  <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 10 }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <p style={{ fontFamily: "var(--serif)", fontSize: isExpanded ? 18 : 15, fontWeight: 400, color: "var(--plum)", letterSpacing: "-0.01em", margin: 0, marginBottom: !isExpanded ? 3 : 0 }}>{entry.reference}</p>
                      {!isExpanded && <p style={{ fontFamily: "var(--serif)", fontStyle: "italic", fontSize: 13, color: "var(--body)", lineHeight: 1.5, margin: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{preview}</p>}
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 4, flexShrink: 0 }}>
                      <span style={{ fontFamily: "ui-monospace, monospace", fontSize: 10, color: "var(--muted-text)", letterSpacing: "0.04em", whiteSpace: "nowrap" }}>{fmtJournalDate(entry.created_at)}</span>
                      <ActionMenu
                        align="right"
                        minWidth={130}
                        renderTrigger={({ open, toggle }) => (
                          <IconButton dim={26} active={open} onClick={toggle}><MoreHorizontal size={15} /></IconButton>
                        )}
                        items={[
                          { key: "edit", label: "Edit", icon: <Pencil size={13} />, onSelect: () => openEdit(entry) },
                          { key: "delete", label: "Delete", tone: "danger", icon: <Trash2 size={13} />, onSelect: () => setConfirmDeleteId(entry.id) },
                        ]}
                      />
                      {!isFirst && <span style={{ color: "var(--muted-text)", display: "flex" }}>{isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}</span>}
                    </div>
                  </div>
                </div>
                {isExpanded && (
                  <div style={{ padding: "14px 20px 20px" }}>
                    <p style={{ fontFamily: "var(--serif)", fontStyle: "italic", fontSize: 16, color: "var(--ink)", lineHeight: 1.75, margin: 0, marginBottom: entry.note ? 16 : 0 }}>
                      &ldquo;{entry.verse_text}&rdquo;
                    </p>
                    {entry.note && (
                      <div style={{ paddingTop: 14, borderTop: "1px solid var(--line)" }}>
                        <p style={{ fontFamily: "ui-monospace, monospace", fontSize: 10, color: "var(--muted-text)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 6, marginTop: 0 }}>Reflection</p>
                        <p style={{ fontSize: 14, color: "var(--body)", lineHeight: 1.8, whiteSpace: "pre-wrap", margin: 0 }}>{entry.note}</p>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
      <ConfirmDialog
        open={!!confirmDeleteId}
        title="Delete this verse?"
        confirmLabel="Delete"
        onConfirm={() => { const id = confirmDeleteId; setConfirmDeleteId(null); if (id) handleDelete(id) }}
        onClose={() => setConfirmDeleteId(null)}
      />
    </div>
  )
}

// Full-body editor sub-page shell — header (eyebrow + Cancel/Save) over the editor
// body. Each journal tab early-returns this in place of its list while adding/editing.
function JournalEditorShell({ eyebrow, onCancel, onSave, saving, canSave, saveLabel, children }: {
  eyebrow: string
  onCancel: () => void
  onSave: () => void
  saving: boolean
  canSave: boolean
  saveLabel: string
  children: React.ReactNode
}) {
  return (
    <div style={{ paddingBottom: 52 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, marginBottom: 24 }}>
        <p style={{ ...MONO_STYLE, margin: 0 }}>{eyebrow}</p>
        <div style={{ display: "flex", gap: 8 }}>
          <CentralButton variant="secondary" size="sm" onClick={onCancel}>Cancel</CentralButton>
          <CentralButton size="sm" onClick={onSave} disabled={saving || !canSave}>{saving ? "Saving…" : saveLabel}</CentralButton>
        </div>
      </div>
      {children}
    </div>
  )
}

// Self-contained gear + display-settings popover, rendered in the Journal header.
function JournalSettingsMenu({ showEntries, showStreak, onToggleEntries, onToggleStreak }: {
  showEntries: boolean
  showStreak: boolean
  onToggleEntries: (v: boolean) => void
  onToggleStreak: (v: boolean) => void
}) {
  const [open, setOpen] = useState(false)
  return (
    <div style={{ position: "relative", flexShrink: 0 }}>
      <IconButton active={open} onClick={() => setOpen(v => !v)}><Settings size={14} /></IconButton>
      {open && (
        <div style={{ position: "absolute", right: 0, top: "calc(100% + 4px)", background: "var(--cream-panel)", border: "1px solid var(--line)", borderRadius: 10, zIndex: 20, padding: "12px 16px", minWidth: 210 }}>
          <p style={{ ...MONO_STYLE, margin: "0 0 12px" }}>Display settings</p>
          <label style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, marginBottom: 12, cursor: "pointer" }}>
            <span style={{ fontSize: 13, color: "var(--ink)" }}>Show entry count</span>
            <input type="checkbox" checked={showEntries} onChange={e => onToggleEntries(e.target.checked)} style={{ cursor: "pointer", width: 16, height: 16, accentColor: "var(--plum)" }} />
          </label>
          <label style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, cursor: "pointer" }}>
            <span style={{ fontSize: 13, color: "var(--ink)" }}>Show streak</span>
            <input type="checkbox" checked={showStreak} onChange={e => onToggleStreak(e.target.checked)} style={{ cursor: "pointer", width: 16, height: 16, accentColor: "var(--plum)" }} />
          </label>
        </div>
      )}
    </div>
  )
}

// ── Journal Section ───────────────────────────────────────────────────────────

export function JournalSection({
  userId,
  ministryId,
  showEntries,
  showStreak,
  onToggleEntries,
  onToggleStreak,
}: {
  userId: string
  ministryId: string
  showEntries: boolean
  showStreak: boolean
  onToggleEntries: (v: boolean) => void
  onToggleStreak: (v: boolean) => void
}) {
  const { setParam } = useNavState()
  // Journal subtab is URL-synced (?jtab) so it persists across reload (Convention #12).
  const [journalTab, setJournalTab] = useState<JournalTabId>(() => {
    if (typeof window === "undefined") return "devotionals"
    const p = new URLSearchParams(window.location.search).get("jtab")
    return (["devotionals", "prayers", "verses"] as const).includes(p as JournalTabId) ? p as JournalTabId : "devotionals"
  })
  function changeJournalTab(t: JournalTabId) {
    setJournalTab(t)
    setParam("jtab", t === "devotionals" ? null : t)
  }
  const [entryCount, setEntryCount] = useState(0)
  const [entryDates, setEntryDates] = useState<string[]>([])
  const [prayerCount, setPrayerCount] = useState(0)
  const [homeVerse, setHomeVerse] = useState<{ reference: string; text: string } | null>(null)

  useEffect(() => {
    getHomeVerses(ministryId).then(verses => {
      if (verses.length > 0) {
        const now = new Date()
        const start = new Date(now.getFullYear(), 0, 0)
        const dayOfYear = Math.floor((now.getTime() - start.getTime()) / 86400000)
        const v = verses[dayOfYear % verses.length]
        setHomeVerse({ reference: v.reference, text: v.text })
      }
    })
  }, [ministryId])

  function computeStreak(dates: string[]): number {
    if (dates.length === 0) return 0
    const daySet = new Set(dates.map(d => d.slice(0, 10)))
    const today = new Date()
    const todayKey = today.toISOString().slice(0, 10)
    const startOffset = daySet.has(todayKey) ? 0 : 1
    let streak = 0
    for (let i = startOffset; i < 365; i++) {
      const d = new Date(today)
      d.setDate(d.getDate() - i)
      if (daySet.has(d.toISOString().slice(0, 10))) streak++
      else break
    }
    return streak
  }

  const streak = computeStreak(entryDates)
  const showStats = showEntries || showStreak

  const statsItems = [
    ...(showEntries ? [{ label: "Entries", value: entryCount }] : []),
    { label: "Prayers", value: prayerCount },
    ...(showStreak ? [{ label: "Streak", value: streak }] : []),
  ]

  // A computed node (not a nested component) so it isn't re-created during
  // render — avoids react-hooks/static-components. Rendered in both the mobile
  // and desktop branches (only one is visible at a time).
  const verseCard = homeVerse ? (
    <div style={{ marginTop: 32, padding: "20px 24px", background: "var(--cream)", border: "1px solid var(--line)", borderRadius: "var(--r-card)" }}>
      <p style={{ ...MONO_STYLE, margin: "0 0 10px" }}>Today&apos;s Verse</p>
      <p style={{ fontFamily: "var(--serif)", fontStyle: "italic", fontSize: 16, color: "var(--ink)", lineHeight: 1.75, margin: "0 0 8px" }}>&ldquo;{homeVerse.text}&rdquo;</p>
      <p style={{ fontFamily: "var(--serif)", fontSize: 13, color: "var(--plum)", margin: 0 }}>— {homeVerse.reference}</p>
    </div>
  ) : null

  return (
    <>
      {/* Stats bar (the display-settings gear now lives in the Journal header) */}
      {showStats && (
        <div style={{ display: "flex", background: "var(--cream)", border: "1px solid var(--line)", borderRadius: 12, overflow: "hidden", marginBottom: 24 }}>
          {statsItems.map((item, i) => (
            <div key={item.label} style={{ flex: 1, padding: "14px 16px", textAlign: "center", borderRight: i < statsItems.length - 1 ? "1px solid var(--line)" : "none" }}>
              <p style={{ ...MONO_STYLE, margin: "0 0 4px" }}>{item.label}</p>
              <p style={{ fontFamily: "var(--serif)", fontSize: 22, color: "var(--ink)", margin: 0, lineHeight: 1 }}>{item.value}</p>
            </div>
          ))}
        </div>
      )}

      {/* Mobile: tab strip + single column */}
      <div className="md:hidden" style={{ paddingTop: showStats ? 0 : 24, paddingBottom: 52 }}>
        <div style={{ marginBottom: 24 }}>
          <PlanSubTabStrip
            tabs={JOURNAL_TABS}
            active={journalTab}
            onChange={k => changeJournalTab(k as JournalTabId)}
          />
        </div>
        {journalTab === "devotionals" && <JournalDevotionalsTab userId={userId} ministryId={ministryId} onCountChange={(n, dates) => { setEntryCount(n); setEntryDates(dates) }} />}
        {journalTab === "prayers" && <JournalPrayersTab userId={userId} ministryId={ministryId} onCountChange={n => setPrayerCount(n)} />}
        {journalTab === "verses" && <JournalVersesTab userId={userId} ministryId={ministryId} />}
        {verseCard}
      </div>

      {/* Desktop: tab strip + single full-width column. The strip breaks out of the
          parent px-14 wrapper (-mx-14) so it runs full-bleed and its internal md:pl-14
          re-insets the labels to align with the px-14 content below (§4.2 / convention #16). */}
      <div className="hidden md:block" style={{ paddingTop: showStats ? 0 : 4, paddingBottom: 52 }}>
        <div className="-mx-14" style={{ marginBottom: 28 }}>
          <PlanSubTabStrip tabs={JOURNAL_TABS} active={journalTab} onChange={k => changeJournalTab(k as JournalTabId)} />
        </div>
        {journalTab === "devotionals" && <JournalDevotionalsTab userId={userId} ministryId={ministryId} onCountChange={(n, dates) => { setEntryCount(n); setEntryDates(dates) }} />}
        {journalTab === "prayers" && <JournalPrayersTab userId={userId} ministryId={ministryId} onCountChange={n => setPrayerCount(n)} />}
        {journalTab === "verses" && <JournalVersesTab userId={userId} ministryId={ministryId} />}
        {verseCard}
      </div>
    </>
  )
}

// ── Profile field config ──────────────────────────────────────────────────────

type ProfileDraftField = "phone" | "graduation_year" | "bio" | "testimony" | "favorite_verse" | "favorite_worship_song" | "favorite_book_of_bible" | "prayer_request"

const PROFILE_SECTIONS: {
  id: string
  label: string
  fields: { key: ProfileDraftField; label: string; placeholder: string; multiline: boolean; inputType?: string }[]
}[] = [
  {
    id: "contact",
    label: "Contact",
    fields: [
      { key: "graduation_year", label: "Graduation year", placeholder: "e.g. 2027", multiline: false, inputType: "number" },
      { key: "phone", label: "Phone", placeholder: "Your phone number", multiline: false, inputType: "tel" },
    ],
  },
  {
    id: "about",
    label: "About",
    fields: [
      { key: "bio", label: "Bio", placeholder: "Write a short bio…", multiline: true },
    ],
  },
  {
    id: "faith",
    label: "Faith",
    fields: [
      { key: "testimony", label: "Testimony", placeholder: "Share your faith story…", multiline: true },
      { key: "favorite_verse", label: "Favorite verse", placeholder: "e.g. Philippians 4:13", multiline: false },
      { key: "favorite_worship_song", label: "Favorite worship song", placeholder: "A song that moves you", multiline: false },
      { key: "favorite_book_of_bible", label: "Favorite book of the Bible", placeholder: "e.g. Psalms", multiline: false },
    ],
  },
  {
    id: "prayer",
    label: "Prayer",
    fields: [
      { key: "prayer_request", label: "Prayer request", placeholder: "Share what you'd like prayer for…", multiline: true },
    ],
  },
]

// ── Danger Zone (§4.20 editorial inline rule) ─────────────────────────────────

function DangerZone({
  ministryName,
  leaveConfirm,
  leaving,
  leaveError,
  onShowConfirm,
  onCancel,
  onConfirm,
  email,
  onAccountDeleted,
}: {
  ministryName: string
  leaveConfirm: boolean
  leaving: boolean
  leaveError: string | null
  onShowConfirm: () => void
  onCancel: () => void
  onConfirm: () => void
  email: string
  onAccountDeleted: () => void
}) {
  return (
    <div style={{ paddingTop: 48 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 24 }}>
        <div style={{ flex: 1, height: 1, background: "var(--line)" }} />
        <span style={{ fontFamily: "ui-monospace, 'SF Mono', Menlo, monospace", fontSize: 10, letterSpacing: "1.4px", textTransform: "uppercase" as const, color: "var(--danger)" }}>Danger Zone</span>
        <div style={{ flex: 1, height: 1, background: "var(--line)" }} />
      </div>
      <div style={{ display: "flex", alignItems: "flex-start", gap: 24, flexWrap: "wrap" }}>
        <div style={{ flex: 1, minWidth: 200 }}>
          <p style={{ fontFamily: "var(--serif)", fontSize: 20, fontWeight: 400, color: "var(--ink)", margin: "0 0 6px" }}>Leave {ministryName}</p>
          <p style={{ fontSize: 13, color: "var(--body)", margin: 0, lineHeight: 1.55 }}>
            Your messages remain visible until an admin runs cleanup. You can rejoin with an invite code.
          </p>
          {leaveError && <p style={{ fontSize: 12, color: "var(--danger)", margin: "6px 0 0" }}>{leaveError}</p>}
        </div>
        {!leaveConfirm ? (
          <CentralButton variant="destructive" onClick={onShowConfirm} style={{ flexShrink: 0 }}>Leave</CentralButton>
        ) : (
          <div style={{ display: "flex", gap: 8, flexShrink: 0 }}>
            <CentralButton variant="destructive" onClick={onConfirm} disabled={leaving}>{leaving ? "Leaving…" : "Confirm"}</CentralButton>
            <CentralButton variant="secondary" onClick={onCancel} disabled={leaving}>Cancel</CentralButton>
          </div>
        )}
      </div>
      <DeleteAccountSection email={email} onDeleted={onAccountDeleted} />
    </div>
  )
}

// ── Delete Account (§4.20 danger zone; navigate-to-confirm, no modal) ─────────
// Self-contained: manages its own idle → confirm → deleting flow, calls the
// self-delete server action, then signs the user out and lands them on "/".
// The confirm step is a full in-place surface swap (not a modal), gated on the
// user retyping their exact email — the client-side match only enables the
// button; the SERVER re-verifies the email before doing anything.

function DeleteAccountSection({ email, onDeleted }: { email: string; onDeleted: () => void }) {
  const [phase, setPhase] = useState<"idle" | "confirm">("idle")
  const [typed, setTyped] = useState("")
  const [deleting, setDeleting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const emailMatches = typed.trim().toLowerCase() === (email ?? "").trim().toLowerCase() && typed.length > 0

  async function handleDelete() {
    if (!emailMatches) return
    setDeleting(true)
    setError(null)
    const { error: err, deleted } = await deleteMyAccount(typed)
    if (err || !deleted) {
      setError(err ?? "Something went wrong. Please try again.")
      setDeleting(false)
      return
    }
    // Success: sign out + leave the app entirely.
    onDeleted()
  }

  if (phase === "idle") {
    return (
      <div style={{ display: "flex", alignItems: "flex-start", gap: 24, flexWrap: "wrap", marginTop: 28 }}>
        <div style={{ flex: 1, minWidth: 200 }}>
          <p style={{ fontFamily: "var(--serif)", fontSize: 20, fontWeight: 400, color: "var(--ink)", margin: "0 0 6px" }}>Delete your account</p>
          <p style={{ fontSize: 13, color: "var(--body)", margin: 0, lineHeight: 1.55 }}>
            Permanently deletes your login and personal data — profile, journal, RSVPs, and form responses. Messages you sent stay in their chats, shown as “Former member.” This can’t be undone.
          </p>
        </div>
        <CentralButton variant="destructive" onClick={() => setPhase("confirm")} style={{ flexShrink: 0 }}>Delete account</CentralButton>
      </div>
    )
  }

  return (
    <div style={{ marginTop: 28, border: "1px solid var(--danger)", borderRadius: 12, padding: "20px 22px", background: "var(--cream)" }}>
      <p style={{ fontFamily: "var(--serif)", fontSize: 20, fontWeight: 400, color: "var(--ink)", margin: "0 0 6px" }}>Delete your account?</p>
      <p style={{ fontSize: 13, color: "var(--body)", margin: "0 0 16px", lineHeight: 1.55 }}>
        This permanently deletes your login and personal data. It can’t be undone. Type your email <strong style={{ color: "var(--ink)" }}>{email}</strong> to confirm.
      </p>
      <Input
        type="email"
        autoComplete="off"
        placeholder="you@university.edu"
        value={typed}
        onChange={(e) => setTyped(e.target.value)}
        disabled={deleting}
        style={{ width: "100%", maxWidth: 320, marginBottom: 14 }}
      />
      {error && <p style={{ fontSize: 12, color: "var(--danger)", margin: "0 0 12px" }}>{error}</p>}
      <div style={{ display: "flex", gap: 8 }}>
        <CentralButton variant="danger-solid" onClick={handleDelete} disabled={deleting || !emailMatches}>
          {deleting ? "Deleting…" : "Permanently delete"}
        </CentralButton>
        <CentralButton variant="secondary" onClick={() => { setPhase("idle"); setTyped(""); setError(null) }} disabled={deleting}>Cancel</CentralButton>
      </div>
    </div>
  )
}

// ── Profile Tab ───────────────────────────────────────────────────────────────

export function ProfileTab({
  userId,
  initialProfile,
  ministryName,
  isAdmin,
  ministryIsPublic: initialMinistryIsPublic,
  onLogout,
  onAvatarChange,
  activeSection,
  onSectionChange,
}: {
  userId: string
  initialProfile: Profile
  ministryName: string
  isAdmin?: boolean
  ministryIsPublic?: boolean
  onLogout: () => void
  onAvatarChange?: (url: string) => void
  activeSection: "spiritual-profile" | "journal"
  onSectionChange: (s: "spiritual-profile" | "journal") => void
}) {
  const supabase = createClient()
  const router = useRouter()
  const [profile, setProfile] = useState<Profile>(initialProfile)
  const [editing, setEditing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [leaveConfirm, setLeaveConfirm] = useState(false)
  const [leaving, setLeaving] = useState(false)
  const [leaveError, setLeaveError] = useState<string | null>(null)
  const [uploadingAvatar, setUploadingAvatar] = useState(false)
  const [avatarError, setAvatarError] = useState<string | null>(null)
  const [draft, setDraft] = useState<Record<ProfileDraftField, string>>({
    graduation_year: String(initialProfile.graduation_year ?? ""),
    phone: initialProfile.phone ?? "",
    bio: initialProfile.bio ?? "",
    testimony: initialProfile.testimony ?? "",
    favorite_verse: initialProfile.favorite_verse ?? "",
    favorite_worship_song: initialProfile.favorite_worship_song ?? "",
    favorite_book_of_bible: initialProfile.favorite_book_of_bible ?? "",
    prayer_request: initialProfile.prayer_request ?? "",
  })
  const { data: schoolData } = useSWR(
    initialProfile.ministry_id ? ["ministry-schools", initialProfile.ministry_id] : null,
    () => loadMinistrySchools(supabase, initialProfile.ministry_id!)
  )
  const schoolOptions = useMemo(() => schoolData ?? [], [schoolData])
  const [currentSchoolId, setCurrentSchoolId] = useState<string | null>(initialProfile.school_id ?? null)

  async function handleSchoolChange(schoolId: string) {
    const newId = schoolId === "" ? null : schoolId
    setCurrentSchoolId(newId)
    await supabase.from("profiles").update({ school_id: newId }).eq("id", userId).eq("ministry_id", initialProfile.ministry_id ?? "")
    setProfile(p => ({ ...p, school_id: newId }))
  }

  const startEdit = () => {
    setDraft({
      graduation_year: String(profile.graduation_year ?? ""),
      phone: profile.phone ?? "",
      bio: profile.bio ?? "",
      testimony: profile.testimony ?? "",
      favorite_verse: profile.favorite_verse ?? "",
      favorite_worship_song: profile.favorite_worship_song ?? "",
      favorite_book_of_bible: profile.favorite_book_of_bible ?? "",
      prayer_request: profile.prayer_request ?? "",
    })
    setEditing(true)
  }

  const cancelEdit = () => setEditing(false)

  const saveEdit = useCallback(async () => {
    setSaving(true)
    const { data, error } = await supabase
      .from("profiles")
      .update({
        graduation_year: draft.graduation_year ? parseInt(draft.graduation_year) : null,
        phone: draft.phone || null,
        bio: draft.bio || null,
        testimony: draft.testimony || null,
        favorite_verse: draft.favorite_verse || null,
        favorite_worship_song: draft.favorite_worship_song || null,
        favorite_book_of_bible: draft.favorite_book_of_bible || null,
        prayer_request: draft.prayer_request || null,
      })
      .eq("id", userId)
      .eq("ministry_id", initialProfile.ministry_id ?? "")
      .select()
      .single()
    if (!error && data) setProfile(data as Profile)
    setSaving(false)
    setEditing(false)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft, initialProfile.ministry_id, userId])

  async function handleToggleEntries(v: boolean) {
    await supabase.from("profiles").update({ show_journal_entries: v }).eq("id", userId).eq("ministry_id", initialProfile.ministry_id ?? "")
    setProfile(p => ({ ...p, show_journal_entries: v }))
  }

  async function handleToggleStreak(v: boolean) {
    await supabase.from("profiles").update({ show_journal_streak: v }).eq("id", userId).eq("ministry_id", initialProfile.ministry_id ?? "")
    setProfile(p => ({ ...p, show_journal_streak: v }))
  }

  async function handleLeaveMinistry() {
    setLeaving(true)
    setLeaveError(null)
    const { error } = await selfLeaveMinistry()
    if (error) { setLeaveError(error); setLeaving(false); return }
    router.push("/ministries")
  }

  async function handleAccountDeleted() {
    // The auth identity is already gone; clear any local session and leave the
    // app entirely (full reload resets all in-memory state).
    await supabase.auth.signOut()
    window.location.assign("/")
  }

  async function handleAvatarUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setUploadingAvatar(true)
    setAvatarError(null)
    const raw = file.name.split(".").pop()?.toLowerCase()
    const ext = raw && raw !== file.name.toLowerCase() ? raw : "png"
    const fileName = `${userId}.${ext}`
    const { data: uploadData, error } = await supabase.storage
      .from("profile-images")
      .upload(fileName, file, { upsert: true, contentType: file.type || "image/png" })
    if (error) { setAvatarError(error.message); setUploadingAvatar(false); e.target.value = ""; return }
    if (uploadData) {
      const { data: { publicUrl } } = supabase.storage.from("profile-images").getPublicUrl(uploadData.path)
      await supabase.from("profiles").update({ avatar_url: publicUrl }).eq("id", userId).eq("ministry_id", initialProfile.ministry_id ?? "")
      setProfile(p => ({ ...p, avatar_url: publicUrl }))
      onAvatarChange?.(publicUrl)
    }
    setUploadingAvatar(false)
    e.target.value = ""
  }

  function getFieldValue(key: ProfileDraftField): string {
    const val = ((profile as unknown) as Record<string, string | number | null | undefined>)[key]
    if (val == null) return ""
    return String(val)
  }

  const monoFieldLabel: React.CSSProperties = {
    ...MONO_STYLE,
    margin: 0,
    marginBottom: 4,
  }

  function renderProfileSections() {
    const hasAnyContent = PROFILE_SECTIONS.some(s => s.fields.some(f => !!getFieldValue(f.key).trim()))
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
        {PROFILE_SECTIONS.map(section => {
          const filledFields = section.fields.filter(f => !!getFieldValue(f.key).trim())
          if (!editing && filledFields.length === 0) return null
          const fieldsToRender = editing ? section.fields : filledFields
          return (
            <div key={section.id}>
              <p style={{ ...MONO_STYLE, marginBottom: 10, marginTop: 0 }}>{section.label}</p>
              <div style={{ border: "1px solid var(--line)", borderRadius: 12, overflow: "hidden", background: "var(--cream)" }}>
                {fieldsToRender.map((field, i) => (
                  <div key={field.key} style={{ padding: "14px 18px", borderTop: i > 0 ? "1px solid var(--line)" : "none" }}>
                    {editing ? (
                      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
                        <p style={monoFieldLabel}>{field.label}</p>
                        <p style={{ ...monoFieldLabel, color: "var(--muted-text)", marginBottom: 0 }}>Optional</p>
                      </div>
                    ) : (
                      <p style={monoFieldLabel}>{field.label}</p>
                    )}
                    {editing ? (
                      field.multiline ? (
                        <textarea
                          value={draft[field.key]}
                          onChange={e => setDraft(d => ({ ...d, [field.key]: e.target.value }))}
                          placeholder={field.placeholder}
                          rows={field.key === "testimony" ? 5 : 3}
                          style={{ display: "block", width: "100%", fontSize: 14, color: "var(--ink)", lineHeight: 1.65, background: "transparent", border: "none", outline: "none", resize: "vertical", fontFamily: "inherit", padding: 0, boxSizing: "border-box" }}
                        />
                      ) : (
                        <input
                          type={field.inputType ?? "text"}
                          value={draft[field.key]}
                          onChange={e => setDraft(d => ({ ...d, [field.key]: e.target.value }))}
                          placeholder={field.placeholder}
                          style={{ display: "block", width: "100%", fontSize: 14, color: "var(--ink)", background: "transparent", border: "none", outline: "none", fontFamily: "inherit", padding: 0 }}
                        />
                      )
                    ) : (
                      <p style={{ fontSize: 14, color: "var(--ink)", lineHeight: 1.65, whiteSpace: "pre-wrap", margin: 0 }}>
                        {getFieldValue(field.key)}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )
        })}

        {editing && schoolOptions.length > 0 && (
          <div>
            <p style={{ ...MONO_STYLE, marginBottom: 10, marginTop: 0 }}>School</p>
            <div style={{ border: "1px solid var(--line)", borderRadius: 12, overflow: "hidden", background: "var(--cream)" }}>
              <div style={{ padding: "14px 18px" }}>
                <select
                  value={currentSchoolId ?? ""}
                  onChange={e => handleSchoolChange(e.target.value)}
                  style={{ width: "100%", fontSize: 14, color: "var(--ink)", background: "transparent", border: "none", outline: "none", cursor: "pointer", fontFamily: "inherit", padding: 0 }}
                >
                  <option value="">Other / Not a student</option>
                  {schoolOptions.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              </div>
            </div>
          </div>
        )}

        {!editing && !hasAnyContent && (
          <div style={{ textAlign: "center", padding: "40px 0 24px" }}>
            <p style={{ fontFamily: "var(--serif)", fontSize: 17, color: "var(--ink)", marginBottom: 4, marginTop: 0 }}>Nothing here yet</p>
            <p style={{ fontSize: 13, color: "var(--muted-text)", margin: 0 }}>Edit your profile to share details with your community.</p>
          </div>
        )}
      </div>
    )
  }

  // Journal desktop header: suppress its terminating hairline ONLY when the
  // sub-tab strip follows immediately. When stats are on, JournalSection renders
  // a Stats bar BETWEEN the header and the strip, so the header must keep its
  // hairline (otherwise nothing terminates the header above the stats bar).
  const journalShowStats = (profile.show_journal_entries ?? false) || (profile.show_journal_streak ?? false)

  return (
    <div className="pb-6 md:pb-0 md:flex md:flex-col md:min-h-full">

      {activeSection === "journal" && (
        <div className="pb-28 md:pb-0">
          {/* Mobile header — compact, gear inline right.
              NB: Tailwind flex CLASSES, not inline display:flex — an inline display
              would override md:hidden and leak the mobile header onto desktop. */}
          <div className="md:hidden flex items-center justify-between gap-3 px-5 pt-14 pb-3">
            <h1 style={{ fontFamily: "var(--serif)", fontSize: 25, fontWeight: 600, letterSpacing: "-0.02em", color: "var(--ink)", lineHeight: 1.05, margin: 0 }}>Journal</h1>
            <JournalSettingsMenu showEntries={profile.show_journal_entries ?? false} showStreak={profile.show_journal_streak ?? false} onToggleEntries={handleToggleEntries} onToggleStreak={handleToggleStreak} />
          </div>

          {/* Desktop header — landing tier (R1), gear in the right slot; the
              Journal sub-tab strip below is the single terminating hairline. */}
          <TabPageHeader noBottomHairline={!journalShowStats}>
            <PageTitle eyebrow="Personal · Only you can see this" title="Journal" />
            <div style={{ marginLeft: "auto" }}>
              <JournalSettingsMenu showEntries={profile.show_journal_entries ?? false} showStreak={profile.show_journal_streak ?? false} onToggleEntries={handleToggleEntries} onToggleStreak={handleToggleStreak} />
            </div>
          </TabPageHeader>

          <div className="px-5 md:px-14">
            <JournalSection
              userId={userId}
              ministryId={initialProfile.ministry_id ?? ""}
              showEntries={profile.show_journal_entries ?? false}
              showStreak={profile.show_journal_streak ?? false}
              onToggleEntries={handleToggleEntries}
              onToggleStreak={handleToggleStreak}
            />
          </div>
        </div>
      )}

      {activeSection === "spiritual-profile" && <div className="md:flex md:flex-col md:flex-1">

        {/* ── Mobile: top bar ── */}
        <div className="flex items-center gap-2.5 px-5 pt-14 pb-3 md:hidden">
          <a href="/landing" className="flex items-center gap-2.5" style={{ textDecoration: "none" }}>
            <RingCrossLogo size={26} color="var(--plum)" />
            <span style={{ fontFamily: "var(--serif)", fontSize: 28, color: "var(--ink)", letterSpacing: "-0.01em", lineHeight: 1 }}>{ministryName}</span>
          </a>
        </div>

        {/* ── Mobile: cream identity block ── */}
        <div className="md:hidden px-5 pb-6">
          <div style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: 16 }}>
            <label className="group relative flex-shrink-0" style={{ width: 56, height: 56, borderRadius: "50%", background: "var(--plum)", display: "grid", placeItems: "center", overflow: "hidden", cursor: uploadingAvatar ? "not-allowed" : "pointer" }} aria-label="Change profile photo">
              <input type="file" accept="image/*" style={{ position: "absolute", width: 0, height: 0, opacity: 0, overflow: "hidden" }} onChange={handleAvatarUpload} disabled={uploadingAvatar} />
              {profile.avatar_url
                ? <img src={profile.avatar_url} alt="Profile" loading="lazy" decoding="async" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                : <span style={{ fontFamily: "var(--serif)", fontSize: 20, color: "var(--cream)" }}>{getInitials(profile.name)}</span>
              }
              <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center" style={{ background: "color-mix(in srgb, var(--ink) 35%, transparent)" }}>
                <Camera style={{ width: 14, height: 14, color: "white" }} />
              </div>
              {uploadingAvatar && <div className="absolute inset-0 flex items-center justify-center" style={{ background: "color-mix(in srgb, var(--ink) 40%, transparent)" }}><div className="animate-spin" style={{ width: 18, height: 18, border: "2px solid white", borderTopColor: "transparent", borderRadius: "50%" }} /></div>}
            </label>
            <div style={{ flex: 1, minWidth: 0 }}>
              <h1 style={{ fontFamily: "var(--serif)", fontSize: 26, fontWeight: 400, letterSpacing: "-0.02em", color: "var(--ink)", margin: 0, lineHeight: 1.1 }}>{profile.name}</h1>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", marginTop: 6 }}>
                <span style={{ fontSize: 11, fontWeight: 500, color: "var(--body)", background: "var(--ivory)", border: "1px solid var(--line-2)", borderRadius: 999, padding: "2px 8px", textTransform: "capitalize" as const }}>{roleLabel(profile.role, null)}</span>
                {profile.graduation_year && <span style={{ fontSize: 12, color: "var(--muted-text)" }}>Class of {profile.graduation_year}</span>}
                {currentSchoolId && schoolOptions.find(s => s.id === currentSchoolId)?.abbreviation && <span style={{ fontSize: 12, color: "var(--muted-text)" }}>{schoolOptions.find(s => s.id === currentSchoolId)!.abbreviation}</span>}
              </div>
            </div>
          </div>
          <p style={{ fontSize: 12, color: "var(--muted-text)", margin: "0 0 14px" }}>{profile.email}</p>
          {avatarError && <p style={{ fontSize: 11, color: "var(--danger)", margin: "0 0 10px" }}>{avatarError}</p>}
          {editing ? (
            <div style={{ display: "flex", gap: 8 }}>
              <CentralButton variant="secondary" onClick={cancelEdit} style={{ fontSize: 13 }}><X size={12} />Cancel</CentralButton>
              <CentralButton onClick={saveEdit} disabled={saving} style={{ fontSize: 13 }}><Check size={12} />{saving ? "Saving…" : "Save"}</CentralButton>
            </div>
          ) : (
            <CentralButton variant="secondary" onClick={startEdit} style={{ fontSize: 13 }}><Pencil size={13} />Edit profile</CentralButton>
          )}
        </div>

        {/* ── Desktop: page-title header (R1 — mono eyebrow + serif H1) ──
            Title / gear only; no buttons. Edit / Save / Cancel live in the
            identity card below (R1/R2, ratified 2026-07-09). */}
        <TabPageHeader>
          <PageTitle eyebrow="Your profile" title="Profile" />
        </TabPageHeader>

        {/* ── Desktop: identity card — avatar + name + email; Edit / Save / Cancel
            right-aligned inside the card. */}
        <div className="hidden md:block px-14 pt-8">
          <div style={{ display: "flex", alignItems: "center", gap: 24, background: "var(--cream)", border: "1px solid var(--line)", borderRadius: "var(--r-card)", padding: "24px 28px" }}>
            <label className="group relative flex-shrink-0" style={{ width: 64, height: 64, borderRadius: "999px", background: "var(--plum)", display: "grid", placeItems: "center", overflow: "hidden", cursor: uploadingAvatar ? "not-allowed" : "pointer" }} aria-label="Change profile photo">
              <input type="file" accept="image/*" style={{ position: "absolute", width: 0, height: 0, opacity: 0, overflow: "hidden" }} onChange={handleAvatarUpload} disabled={uploadingAvatar} />
              {profile.avatar_url
                ? <img src={profile.avatar_url} alt="Profile" loading="lazy" decoding="async" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                : <span style={{ fontFamily: "var(--serif)", fontSize: 26, color: "var(--cream)" }}>{getInitials(profile.name)}</span>
              }
              <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center" style={{ background: "color-mix(in srgb, var(--ink) 35%, transparent)" }}>
                <Camera style={{ width: 16, height: 16, color: "white" }} />
              </div>
              {uploadingAvatar && <div className="absolute inset-0 flex items-center justify-center" style={{ background: "color-mix(in srgb, var(--ink) 40%, transparent)" }}><div className="animate-spin" style={{ width: 20, height: 20, border: "2px solid white", borderTopColor: "transparent", borderRadius: "50%" }} /></div>}
            </label>
            <div style={{ flex: 1, minWidth: 0 }}>
              <p style={{ ...MONO_STYLE, margin: "0 0 6px" }}>{roleLabel(profile.role, null)}</p>
              <h1 style={{ fontFamily: "var(--serif)", fontSize: 32, fontWeight: 400, letterSpacing: "-0.01em", color: "var(--ink)", margin: "0 0 8px", lineHeight: 1.05 }}>{profile.name}</h1>
              <div style={{ display: "flex", gap: 20, fontSize: 14, color: "var(--body)", flexWrap: "wrap", alignItems: "center" }}>
                {profile.graduation_year && <span>Class of {profile.graduation_year}</span>}
                {currentSchoolId && schoolOptions.find(s => s.id === currentSchoolId)?.abbreviation && <span>{schoolOptions.find(s => s.id === currentSchoolId)!.abbreviation}</span>}
                <span style={{ color: "var(--muted-text)" }}>{profile.email}</span>
              </div>
              {avatarError && <p style={{ fontSize: 11, color: "var(--danger)", margin: "6px 0 0" }}>{avatarError}</p>}
            </div>
            {editing ? (
              <div style={{ display: "flex", gap: 8, flexShrink: 0 }}>
                <CentralButton variant="secondary" onClick={cancelEdit}><X size={13} />Cancel</CentralButton>
                <CentralButton onClick={saveEdit} disabled={saving}><Check size={13} />{saving ? "Saving…" : "Save"}</CentralButton>
              </div>
            ) : (
              <CentralButton variant="secondary" onClick={startEdit} style={{ flexShrink: 0 }}><Pencil size={13} />Edit profile</CentralButton>
            )}
          </div>
        </div>

        {/* ── Desktop: profile sections ── */}
        <div className="hidden md:flex md:flex-col md:flex-1 px-14 pt-6 pb-10">
          {renderProfileSections()}
          <div style={{ marginTop: 24 }}>
            <NotificationsSection
              userId={userId}
              ministryId={initialProfile.ministry_id ?? ""}
              notificationSettings={profile.notification_settings}
              onSettingsChange={(s: NotificationSettings) => setProfile(p => ({ ...p, notification_settings: s }))}
            />
          </div>
          <div style={{ marginTop: "auto" }}>
            <DangerZone
              ministryName={ministryName}
              leaveConfirm={leaveConfirm}
              leaving={leaving}
              leaveError={leaveError}
              onShowConfirm={() => setLeaveConfirm(true)}
              onCancel={() => { setLeaveConfirm(false); setLeaveError(null) }}
              onConfirm={handleLeaveMinistry}
              email={profile.email ?? ""}
              onAccountDeleted={handleAccountDeleted}
            />
          </div>
        </div>

        {/* ── Mobile: profile sections ── */}
        <div className="md:hidden px-5 pb-6">
          {renderProfileSections()}
          <div style={{ marginTop: 24, marginBottom: 24 }}>
            <NotificationsSection
              userId={userId}
              ministryId={initialProfile.ministry_id ?? ""}
              notificationSettings={profile.notification_settings}
              onSettingsChange={(s: NotificationSettings) => setProfile(p => ({ ...p, notification_settings: s }))}
            />
          </div>
          <DangerZone
            ministryName={ministryName}
            leaveConfirm={leaveConfirm}
            leaving={leaving}
            leaveError={leaveError}
            onShowConfirm={() => setLeaveConfirm(true)}
            onCancel={() => { setLeaveConfirm(false); setLeaveError(null) }}
            onConfirm={handleLeaveMinistry}
            email={profile.email ?? ""}
            onAccountDeleted={handleAccountDeleted}
          />
        </div>
      </div>}
    </div>
  )
}
