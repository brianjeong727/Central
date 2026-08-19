"use client"

import { useState, useEffect, useRef, useMemo, useCallback } from "react"
import Image from "next/image"
import dynamic from "next/dynamic"
import useSWR from "swr"
import { useRouter } from "next/navigation"
import { ChevronRight, ChevronDown, X, Check, Camera, Pencil, BookOpen, Search, ImageIcon, MoreHorizontal, Plus, Trash2, Settings, LogOut, User as UserIcon, Bell, LifeBuoy, ShieldAlert } from "lucide-react"
import { createClient } from "@/lib/supabase"
import { MONO_STYLE, EmptyState } from "../components/shared"
import { getInitials } from "../utils"
import { roleLabel } from "@/app/actions/super-constants"
import { getHomeVerses } from "@/app/actions/home-verses"
import { selfLeaveMinistry } from "@/app/actions/ministry"
import { deleteMyAccount } from "@/app/actions/delete-account"
import { unblockUser } from "@/app/actions/blocks"
import { useBlocks } from "../use-blocks"
import { MODERATION_DEFAULTS, moderateText, type ModerationSettings } from "@/lib/moderation"
import { storagePathFromPublicUrl, removeStorageObject } from "@/lib/storage-cleanup"
import { CentralButton, IconButton, PlanSubTabStrip, TabPageHeader, PageTitle, JournalListSkeleton, ConfirmDialog, ActionMenu, Input, SerifInput, MonogramChip, PocketFilterChip, PocketCard, PocketButton, PocketTag, PocketRoundButton, PocketRow, PocketRowCard, PocketKicker, useScrollResetOn, useEdgeSwipeBack, PendingVeil } from "@/components/central"
import { PocketChrome } from "../components/pocket-header"
import { useNavState } from "../nav-state"
import { NotificationsSection } from "../components/notifications"
import { downscaleToJpeg } from "@/lib/downscale-image"
import type { Profile, Devotional, Prayer, Verse, NotificationSettings } from "../types"
import { cohortLabel, isYoungAdult } from "@/lib/cohort"
import { setYoungAdult } from "@/app/actions/auto-chats"

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

// Entry-card + search surfaces switch on viewport: mobile uses borderless tonal
// --ivory (mobile spec §1.1/§3.1/§3.6); desktop keeps the hairline card language.
function journalCardStyle(mobile: boolean): React.CSSProperties {
  return mobile
    ? { background: "var(--ivory)", borderRadius: "var(--r-pocket)" }
    : { background: "var(--cream)", borderRadius: "var(--r-card)", border: "1px solid var(--line)" }
}
function journalSearchStyle(mobile: boolean): React.CSSProperties {
  return {
    width: "100%", paddingLeft: 36, paddingRight: 12, paddingTop: 9, paddingBottom: 9,
    fontSize: 13, color: "var(--ink)", outline: "none", fontFamily: "inherit",
    ...(mobile
      ? { background: "var(--ivory)", border: "none", borderRadius: "var(--r-pocket-sm)" }
      : { background: "var(--cream)", border: "1px solid var(--line)", borderRadius: 10 }),
  }
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

export function JournalDevotionalsTab({ userId, ministryId, onCountChange, mobile = false }: { userId: string; ministryId: string; onCountChange?: (n: number, dates: string[]) => void; mobile?: boolean }) {
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
      // Photo REPLACE: the upload is upsert:false with a timestamped key, so a
      // new photo does not overwrite the old one — without this every edit
      // accumulates another publicly-readable object. The PERSISTED url (not the
      // draft) is the old one, and only if the entry is actually changing photo.
      // Removed BEFORE the row update: a failed update then shows a broken image
      // the user can fix, whereas removing after a successful update risks a live
      // public file with no pointer left anywhere (lib/storage-cleanup.ts).
      if (editingEntry.image_url && editingEntry.image_url !== draft.image_url) {
        const oldPath = storagePathFromPublicUrl(editingEntry.image_url, "devotionals", userId)
        await removeStorageObject(supabase, "devotionals", oldPath, "journal photo replace")
      }
      const { data: row, error } = await supabase.from("devotionals").update({ title: draft.title, passage: draft.passage, content: draft.content, image_url: draft.image_url }).eq("id", editingEntry.id).eq("user_id", userId).eq("ministry_id", ministryId).select().single()
      if (!error && row) mutate(curr => (curr ?? []).map(e => e.id === editingEntry.id ? (row as Devotional) : e), { revalidate: false })
    } else {
      const { data: row, error } = await supabase.from("devotionals").insert({ user_id: userId, ministry_id: ministryId, title: draft.title, passage: draft.passage, content: draft.content, image_url: draft.image_url }).select().single()
      if (!error && row) mutate(curr => [row as Devotional, ...(curr ?? [])], { revalidate: false })
    }
    setSaving(false); setShowEditor(false); setEditingEntry(null)
  }

  async function handleDelete(id: string) {
    // Remove the photo BEFORE the row: the row is the only record of the path,
    // and the bucket is public. The folder-scoped DELETE policy on `devotionals`
    // matches the `${userId}/…` upload path, so the owner can do this directly.
    const entry = entries.find(e => e.id === id)
    if (entry?.image_url) {
      const path = storagePathFromPublicUrl(entry.image_url, "devotionals", userId)
      await removeStorageObject(supabase, "devotionals", path, "journal entry delete")
    }
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
  // Mobile → borderless tonal --ivory (spec §1.1/§3.1); desktop → hairline card.
  const cardStyle = journalCardStyle(mobile)
  const searchStyle = journalSearchStyle(mobile)

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
          <input type="text" placeholder="Search devotionals…" value={searchQuery} onChange={e => setSearchQuery(e.target.value)} style={searchStyle} />
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
              <div key={entry.id} style={cardStyle}>
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

export function JournalPrayersTab({ userId, ministryId, onCountChange, mobile = false }: { userId: string; ministryId: string; onCountChange?: (n: number) => void; mobile?: boolean }) {
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
  const cardStyle = journalCardStyle(mobile)
  const searchStyle = journalSearchStyle(mobile)

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
          <input type="text" placeholder="Search prayers…" value={searchQuery} onChange={e => setSearchQuery(e.target.value)} style={searchStyle} />
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
              <div key={entry.id} style={cardStyle}>
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

export function JournalVersesTab({ userId, ministryId, mobile = false }: { userId: string; ministryId: string; mobile?: boolean }) {
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
  const cardStyle = journalCardStyle(mobile)
  const searchStyle = journalSearchStyle(mobile)

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
          <input type="text" placeholder="Search verses…" value={searchQuery} onChange={e => setSearchQuery(e.target.value)} style={searchStyle} />
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
              <div key={entry.id} style={cardStyle}>
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

  // Computed nodes (not nested components) so they aren't re-created during
  // render — avoids react-hooks/static-components. Each takes `mobile` so the
  // phone-width branch renders borderless tonal --ivory (spec §1.1) while
  // desktop keeps the hairline card language. Called as functions (lowercase),
  // never as JSX elements.
  function statsBarNode(mobile: boolean) {
    if (!showStats) return null
    const divider = mobile ? "var(--line-3)" : "var(--line)"
    return (
      <div style={{ display: "flex", background: mobile ? "var(--ivory)" : "var(--cream)", border: mobile ? "none" : "1px solid var(--line)", borderRadius: mobile ? "var(--r-pocket)" : 12, overflow: "hidden", marginBottom: 24 }}>
        {statsItems.map((item, i) => (
          <div key={item.label} style={{ flex: 1, padding: "14px 16px", textAlign: "center", borderRight: i < statsItems.length - 1 ? `1px solid ${divider}` : "none" }}>
            <p style={{ ...MONO_STYLE, margin: "0 0 4px" }}>{item.label}</p>
            <p style={{ fontFamily: "var(--serif)", fontSize: 22, color: "var(--ink)", margin: 0, lineHeight: 1 }}>{item.value}</p>
          </div>
        ))}
      </div>
    )
  }
  function verseCardNode(mobile: boolean) {
    if (!homeVerse) return null
    return (
      <div style={{ marginTop: 32, padding: "20px 24px", background: mobile ? "var(--ivory)" : "var(--cream)", border: mobile ? "none" : "1px solid var(--line)", borderRadius: mobile ? "var(--r-pocket)" : "var(--r-card)" }}>
        <p style={{ ...MONO_STYLE, margin: "0 0 10px" }}>Today&apos;s Verse</p>
        <p style={{ fontFamily: "var(--serif)", fontStyle: "italic", fontSize: 16, color: "var(--ink)", lineHeight: 1.75, margin: "0 0 8px" }}>&ldquo;{homeVerse.text}&rdquo;</p>
        <p style={{ fontFamily: "var(--serif)", fontSize: 13, color: "var(--plum)", margin: 0 }}>— {homeVerse.reference}</p>
      </div>
    )
  }

  return (
    <>
      {/* Mobile: PocketFilterChip filters + single column (hub-and-spoke — no
          tab strip at phone width). Stats + verse cards render borderless tonal.
          NO paddingTop — the chrome row owns the gap below the title
          (POCKET_CHROME_PAD_Y, Convention #27). This carried `showStats ? 0 : 24`,
          sized for the old hand-rolled header whose `pb-5` it was compensating for;
          against PocketChrome the two stacked and the chips opened at 80px while
          every sibling screen starts its body at 56. */}
      <div className="md:hidden" style={{ paddingBottom: 52 }}>
        {statsBarNode(true)}
        <div style={{ display: "flex", gap: 8, marginBottom: 24 }}>
          {JOURNAL_TABS.map(t => (
            <PocketFilterChip key={t.key} label={t.label} active={journalTab === t.key} onClick={() => changeJournalTab(t.key)} />
          ))}
        </div>
        {journalTab === "devotionals" && <JournalDevotionalsTab userId={userId} ministryId={ministryId} mobile onCountChange={(n, dates) => { setEntryCount(n); setEntryDates(dates) }} />}
        {journalTab === "prayers" && <JournalPrayersTab userId={userId} ministryId={ministryId} mobile onCountChange={n => setPrayerCount(n)} />}
        {journalTab === "verses" && <JournalVersesTab userId={userId} ministryId={ministryId} mobile />}
        {verseCardNode(true)}
      </div>

      {/* Desktop: tab strip + single full-width column. The strip breaks out of the
          parent px-14 wrapper (-mx-14) so it runs full-bleed and its internal md:pl-14
          re-insets the labels to align with the px-14 content below (§4.2 / convention #16). */}
      <div className="hidden md:block" style={{ paddingTop: showStats ? 0 : 4, paddingBottom: 52 }}>
        {statsBarNode(false)}
        <div className="-mx-14" style={{ marginBottom: 28 }}>
          <PlanSubTabStrip tabs={JOURNAL_TABS} active={journalTab} onChange={k => changeJournalTab(k as JournalTabId)} />
        </div>
        {journalTab === "devotionals" && <JournalDevotionalsTab userId={userId} ministryId={ministryId} onCountChange={(n, dates) => { setEntryCount(n); setEntryDates(dates) }} />}
        {journalTab === "prayers" && <JournalPrayersTab userId={userId} ministryId={ministryId} onCountChange={n => setPrayerCount(n)} />}
        {journalTab === "verses" && <JournalVersesTab userId={userId} ministryId={ministryId} />}
        {verseCardNode(false)}
      </div>
    </>
  )
}

// ── Profile field config ──────────────────────────────────────────────────────

type ProfileDraftField = "name" | "phone" | "graduation_year" | "bio" | "testimony" | "favorite_verse" | "favorite_worship_song" | "favorite_book_of_bible" | "prayer_request"

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

// ── Account & support cluster ─────────────────────────────────────────────────
// Blocked users (list + unblock), switch ministry, contact & support, privacy —
// sits below Notifications and above Sign out / Danger Zone. Same on mobile +
// desktop (both call renderProfileSections' siblings).
function AccountLinksSection({ userId, mobile = false }: { userId: string; mobile?: boolean }) {
  const { blocked, mutate } = useBlocks(userId)
  const [showBlocked, setShowBlocked] = useState(false)
  // Switching ministry is a FULL document navigation, so the tap used to land on
  // a screen that then sat inert for the whole round trip. Set on click and
  // NEVER cleared — the page is navigating, and clearing it would flash the
  // settings list back for the last frame.
  const [switching, setSwitching] = useState(false)

  // Mobile → borderless tonal --ivory card + --line-3 row dividers (spec §1.1);
  // desktop keeps the hairline cream card language.
  const cardBorder: React.CSSProperties = mobile
    ? { borderRadius: "var(--r-pocket)", overflow: "hidden", background: "var(--ivory)" }
    : { border: "1px solid var(--line)", borderRadius: 12, overflow: "hidden", background: "var(--cream)" }
  const hair = mobile ? "var(--line-3)" : "var(--line)"
  // Press ground: this card is --ivory on mobile and --cream on desktop, and the
  // press tint has to step DOWN from whichever it is (see .press-row in
  // app/globals.css). Desktop additionally gets the ratified §8.3 row hover.
  const pressRow = mobile ? "press-row press-row-ivory" : "press-row"
  // No `background` here on purpose: `.press-row` (app/globals.css) supplies the
  // transparent default so its :active press tint can win — an inline background
  // would beat any stylesheet rule and the row would never acknowledge a tap.
  const rowBase: React.CSSProperties = { display: "flex", alignItems: "center", gap: 12, padding: "14px 18px", width: "100%", textAlign: "left", border: "none", cursor: "pointer", color: "var(--ink)" }
  const label: React.CSSProperties = { flex: 1, minWidth: 0, fontSize: 14, fontWeight: 500, color: "var(--ink)" }
  const right: React.CSSProperties = { fontSize: 13, color: "var(--muted-text)", flexShrink: 0 }

  async function handleUnblock(id: string) {
    mutate(blocked.filter((b) => b.blocked_id !== id), { revalidate: false })
    await unblockUser(id)
    mutate()
  }

  return (
    <div>
      {switching && <PendingVeil label="One moment…" />}
      <p style={{ ...MONO_STYLE, marginBottom: 10, marginTop: 0 }}>Account &amp; support</p>
      <div style={cardBorder}>
        {/* Blocked users */}
        <button type="button" className={pressRow} onClick={() => setShowBlocked((v) => !v)} style={rowBase}>
          <span style={label}>Blocked users</span>
          <span style={right}>{blocked.length}</span>
          {showBlocked ? <ChevronDown size={16} style={{ color: "var(--muted-text)" }} /> : <ChevronRight size={16} style={{ color: "var(--muted-text)" }} />}
        </button>
        {showBlocked && (
          <div style={{ borderTop: `1px solid ${hair}`, padding: blocked.length ? "6px 0" : "14px 18px" }}>
            {blocked.length === 0 ? (
              <p style={{ fontSize: 13, color: "var(--muted-text)", margin: 0 }}>You haven&apos;t blocked anyone.</p>
            ) : (
              blocked.map((b) => (
                <div key={b.blocked_id} style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 18px" }}>
                  <MonogramChip initials={(b.name || "?").charAt(0).toUpperCase()} avatarUrl={b.avatar_url} className="w-8 h-8 text-[11px] font-medium" />
                  <span style={{ flex: 1, minWidth: 0, fontSize: 14, color: "var(--ink)" }}>{b.name}</span>
                  <CentralButton variant="secondary" size="sm" onClick={() => handleUnblock(b.blocked_id)}>Unblock</CentralButton>
                </div>
              ))
            )}
          </div>
        )}

        {/* Switch ministry — stays an <a> (real href: middle-click / open-in-new-tab
            still work, and it is the fallback if JS hasn't hydrated), but the click
            is intercepted to raise the veil BEFORE the same navigation runs. */}
        <a
          href="/ministries"
          className={pressRow}
          onClick={(e) => {
            if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return
            e.preventDefault()
            setSwitching(true)
            window.location.assign("/ministries")
          }}
          style={{ ...rowBase, borderTop: `1px solid ${hair}`, textDecoration: "none" }}
        >
          <span style={label}>Switch ministry</span>
          <ChevronRight size={16} style={{ color: "var(--muted-text)" }} />
        </a>

        {/* Contact & support */}
        <a href="mailto:team@joincentral.app" className={pressRow} style={{ ...rowBase, borderTop: `1px solid ${hair}`, textDecoration: "none" }}>
          <span style={label}>Contact &amp; support</span>
          <span style={right}>team@joincentral.app</span>
        </a>

        {/* Privacy policy */}
        <a href="/privacy" className={pressRow} style={{ ...rowBase, borderTop: `1px solid ${hair}`, textDecoration: "none" }}>
          <span style={label}>Privacy policy</span>
          <ChevronRight size={16} style={{ color: "var(--muted-text)" }} />
        </a>

        {/* Terms of service */}
        <a href="/terms" className={pressRow} style={{ ...rowBase, borderTop: `1px solid ${hair}`, textDecoration: "none" }}>
          <span style={label}>Terms of service</span>
          <ChevronRight size={16} style={{ color: "var(--muted-text)" }} />
        </a>
      </div>
    </div>
  )
}

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
  mobile = false,
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
  mobile?: boolean
}) {
  // Mobile: the Danger zone is its own settings subpage — tonal cards, not the
  // inline editorial rule. Each action is a full-width destructiveOutline button
  // under its own card (mobile_design_system §5: destructive never filled).
  if (mobile) {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <div style={{ background: "var(--ivory)", borderRadius: "var(--r-pocket)", padding: "18px 20px" }}>
          <p style={{ fontSize: 15.5, fontWeight: 600, letterSpacing: "-0.01em", color: "var(--ink)", margin: "0 0 6px" }}>Leave {ministryName}</p>
          <p style={{ fontSize: 13, color: "var(--muted-text)", margin: "0 0 16px", lineHeight: 1.5 }}>
            Your messages remain visible until an admin runs cleanup. You can rejoin with an invite code.
          </p>
          {leaveError && <p style={{ fontSize: 12, color: "var(--danger)", margin: "0 0 12px" }}>{leaveError}</p>}
          {!leaveConfirm ? (
            <PocketButton variant="destructiveOutline" onClick={onShowConfirm} style={{ width: "100%" }}>Leave</PocketButton>
          ) : (
            <div style={{ display: "flex", gap: 8 }}>
              <PocketButton variant="destructiveOutline" onClick={onConfirm} disabled={leaving} style={{ flex: 1, opacity: leaving ? 0.45 : 1 }}>{leaving ? "Leaving…" : "Confirm leave"}</PocketButton>
              <PocketButton variant="quiet" surface="card" onClick={onCancel} disabled={leaving} style={{ flex: 1 }}>Cancel</PocketButton>
            </div>
          )}
        </div>
        <DeleteAccountSection email={email} onDeleted={onAccountDeleted} mobile />
      </div>
    )
  }
  const hair = "var(--line)"
  return (
    <div style={{ paddingTop: 48 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 24 }}>
        <div style={{ flex: 1, height: 1, background: hair }} />
        <span style={{ fontFamily: "ui-monospace, 'SF Mono', Menlo, monospace", fontSize: 10, letterSpacing: "1.4px", textTransform: "uppercase" as const, color: "var(--danger)" }}>Danger Zone</span>
        <div style={{ flex: 1, height: 1, background: hair }} />
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
      <DeleteAccountSection email={email} onDeleted={onAccountDeleted} mobile={mobile} />
    </div>
  )
}

// ── Delete Account (§4.20 danger zone; navigate-to-confirm, no modal) ─────────
// Self-contained: manages its own idle → confirm → deleting flow, calls the
// self-delete server action, then signs the user out and lands them on "/".
// The confirm step is a full in-place surface swap (not a modal), gated on the
// user retyping their exact email — the client-side match only enables the
// button; the SERVER re-verifies the email before doing anything.

function DeleteAccountSection({ email, onDeleted, mobile = false }: { email: string; onDeleted: () => void; mobile?: boolean }) {
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
    if (mobile) {
      return (
        <div style={{ background: "var(--ivory)", borderRadius: "var(--r-pocket)", padding: "18px 20px" }}>
          <p style={{ fontSize: 15.5, fontWeight: 600, letterSpacing: "-0.01em", color: "var(--ink)", margin: "0 0 6px" }}>Delete your account</p>
          <p style={{ fontSize: 13, color: "var(--muted-text)", margin: "0 0 16px", lineHeight: 1.5 }}>
            Permanently deletes your login and personal data — profile, journal, RSVPs, and form responses. Messages you sent stay in their chats, shown as “Former member.” This can’t be undone.
          </p>
          <PocketButton variant="destructiveOutline" onClick={() => setPhase("confirm")} style={{ width: "100%" }}>Delete account</PocketButton>
        </div>
      )
    }
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

  if (mobile) {
    return (
      <div style={{ background: "var(--ivory)", border: "1.5px solid var(--danger)", borderRadius: "var(--r-pocket)", padding: "18px 20px" }}>
        <p style={{ fontSize: 15.5, fontWeight: 600, letterSpacing: "-0.01em", color: "var(--ink)", margin: "0 0 6px" }}>Delete your account?</p>
        <p style={{ fontSize: 13, color: "var(--muted-text)", margin: "0 0 14px", lineHeight: 1.5 }}>
          This can’t be undone. Type your email <strong style={{ color: "var(--ink)" }}>{email}</strong> to confirm.
        </p>
        <Input
          type="email"
          autoComplete="off"
          placeholder="you@university.edu"
          value={typed}
          onChange={(e) => setTyped(e.target.value)}
          disabled={deleting}
          style={{ width: "100%", marginBottom: 12 }}
        />
        {error && <p style={{ fontSize: 12, color: "var(--danger)", margin: "0 0 12px" }}>{error}</p>}
        <div style={{ display: "flex", gap: 8 }}>
          <PocketButton variant="destructiveOutline" onClick={handleDelete} disabled={deleting || !emailMatches} style={{ flex: 1, opacity: (deleting || !emailMatches) ? 0.45 : 1 }}>{deleting ? "Deleting…" : "Delete"}</PocketButton>
          <PocketButton variant="quiet" surface="card" onClick={() => { setPhase("idle"); setTyped(""); setError(null) }} disabled={deleting} style={{ flex: 1 }}>Cancel</PocketButton>
        </div>
      </div>
    )
  }
  return (
    <div style={{ marginTop: 28, border: "1px solid var(--danger)", borderRadius: mobile ? "var(--r-pocket)" : 12, padding: "20px 22px", background: mobile ? "var(--ivory)" : "var(--cream)" }}>
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

// Mobile settings hub. The gear on the profile chrome opens a sections list;
// each row drills into its detail (mirrors the Church-Settings hub, settings-tab.tsx).
type ProfileSettingsView = "hub" | "notifications" | "account" | "danger"
const SETTINGS_LABELS: Record<ProfileSettingsView, string> = {
  hub: "Settings",
  notifications: "Notifications",
  account: "Account & support",
  danger: "Danger zone",
}
// 40px tonal chip holding a settings glyph — the leading element in the hub rows
// (mirrors settings-tab.tsx SettingsIconChip).
function SettingsIconChip({ icon }: { icon: React.ReactNode }) {
  return (
    <span style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", width: 40, height: 40, borderRadius: 14, background: "var(--line-2)", color: "var(--plum)", flexShrink: 0 }}>
      {icon}
    </span>
  )
}

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
  /** null when the photo is REMOVED — the shell avatar must fall back to
   *  initials, not keep rendering a deleted image. */
  onAvatarChange?: (url: string | null) => void
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
  // Mobile settings hub (gear → sections → subpage). null = on the profile;
  // "hub" = the section list; a key = one drilled section. URL-synced (?pset,
  // folded — resets on tab leave). Desktop never sets this (settings stay inline).
  const { setParam: setNavParam } = useNavState()
  const [settingsView, setSettingsView] = useState<ProfileSettingsView | null>(() => {
    if (typeof window === "undefined") return null
    const p = new URLSearchParams(window.location.search).get("pset")
    return (["hub", "notifications", "account", "danger"] as const).includes(p as ProfileSettingsView) ? (p as ProfileSettingsView) : null
  })
  const openSettings = (v: ProfileSettingsView) => { setSettingsView(v); setNavParam("pset", v) }
  const closeSettings = () => { setSettingsView(null); setNavParam("pset", null) }
  useScrollResetOn([settingsView])
  // Edge-swipe-back mirrors the chrome chevron (Convention #22): from a section →
  // hub, from the hub → profile.
  const settingsSwipeRef = useEdgeSwipeBack<HTMLDivElement>(settingsView === "hub" ? closeSettings : () => openSettings("hub"))
  // Journal is a PUSHED screen off the profile root on mobile (desktop keeps it as
  // a sidebar section, where `back` is never rendered). Same handler as its chrome
  // chevron, per Convention #22.
  const backToProfileRoot = useCallback(() => onSectionChange("spiritual-profile"), [onSectionChange])
  const journalSwipeRef = useEdgeSwipeBack<HTMLDivElement>(backToProfileRoot)
  useScrollResetOn([activeSection])
  const [uploadingAvatar, setUploadingAvatar] = useState(false)
  const [avatarError, setAvatarError] = useState<string | null>(null)
  const [draft, setDraft] = useState<Record<ProfileDraftField, string>>({
    name: initialProfile.name ?? "",
    graduation_year: String(initialProfile.graduation_year ?? ""),
    phone: initialProfile.phone ?? "",
    bio: initialProfile.bio ?? "",
    testimony: initialProfile.testimony ?? "",
    favorite_verse: initialProfile.favorite_verse ?? "",
    favorite_worship_song: initialProfile.favorite_worship_song ?? "",
    favorite_book_of_bible: initialProfile.favorite_book_of_bible ?? "",
    prayer_request: initialProfile.prayer_request ?? "",
  })
  // Inline error under the name field — currently only the moderation refusal.
  const [nameError, setNameError] = useState<string | null>(null)
  const { data: schoolData } = useSWR(
    initialProfile.ministry_id ? ["ministry-schools", initialProfile.ministry_id] : null,
    () => loadMinistrySchools(supabase, initialProfile.ministry_id!)
  )
  // Ministry moderation config — same SWR shape + key as the chat composer
  // (chats-tab), so the two share one cache entry and can never disagree about
  // the rules. Falls back to MODERATION_DEFAULTS until loaded.
  const { data: modSettings, mutate: mutateModSettings } = useSWR(
    initialProfile.ministry_id ? ["moderation-settings", initialProfile.ministry_id] : null,
    async () => {
      const { data } = await supabase.from("ministries").select("moderation_settings").eq("id", initialProfile.ministry_id!).maybeSingle()
      return { ...MODERATION_DEFAULTS, ...(data?.moderation_settings ?? {}) } as ModerationSettings
    }
  )
  const schoolOptions = useMemo(() => schoolData ?? [], [schoolData])
  const [currentSchoolId, setCurrentSchoolId] = useState<string | null>(initialProfile.school_id ?? null)

  async function handleSchoolChange(schoolId: string) {
    const newId = schoolId === "" ? null : schoolId
    setCurrentSchoolId(newId)
    await supabase.from("profiles").update({ school_id: newId }).eq("id", userId).eq("ministry_id", initialProfile.ministry_id ?? "")
    setProfile(p => ({ ...p, school_id: newId }))
  }

  const [draftYoungAdult, setDraftYoungAdult] = useState(false)

  const startEdit = () => {
    setDraftYoungAdult(isYoungAdult(profile.grade))
    setDraft({
      name: profile.name ?? "",
      graduation_year: String(profile.graduation_year ?? ""),
      phone: profile.phone ?? "",
      bio: profile.bio ?? "",
      testimony: profile.testimony ?? "",
      favorite_verse: profile.favorite_verse ?? "",
      favorite_worship_song: profile.favorite_worship_song ?? "",
      favorite_book_of_bible: profile.favorite_book_of_bible ?? "",
      prayer_request: profile.prayer_request ?? "",
    })
    setNameError(null)
    setEditing(true)
  }

  const cancelEdit = () => { setNameError(null); setEditing(false) }

  // The display name is what the whole ministry sees, and unlike every other
  // field on this screen it may never be blank — a nameless row renders as an
  // empty monogram everywhere it appears. Save is gated on it rather than
  // silently reverting, which would look like the edit simply didn't take.
  const nameValid = draft.name.trim().length >= 2

  const saveEdit = useCallback(async () => {
    const name = draft.name.trim()
    if (name.length < 2) return
    // Moderation — the display name is the most public label a user sets (every
    // message, every roster row, the directory), so it runs the SAME filter the
    // chat composer runs, with the same ministry settings. Two deliberate
    // differences from the composer:
    //   • Room SCOPE is not consulted. `scopeApplies` answers "does this ROOM
    //     get filtered"; a name belongs to no room and renders inside every one
    //     of them, so `enabled` is the only honest gate.
    //   • A flagged name is REFUSED, never asterisked — silently starring
    //     someone's own name is worse than telling them no (same call
    //     `chat-nicknames.ts` makes for a nickname).
    // This is a UX guardrail, not an enforcement boundary: `profiles` UPDATE RLS
    // permits a user to write their own `name` directly through the API.
    //   • It must not SKIP when the settings SWR hasn't resolved. `modSettings?.enabled`
    //     silently no-ops on the realistic fast path — open Edit, type, Save — and a
    //     filter that quietly doesn't run is WORSE than no filter, because it reads as
    //     protection. The composer tolerates that (many sends, over a cache that warms
    //     in milliseconds); a name is saved once, deliberately, and often immediately.
    //     So resolve the settings HERE when they aren't loaded, falling back to
    //     MODERATION_DEFAULTS (enabled: true) only if that read fails.
    let settings = modSettings
    if (!settings) {
      settings = await mutateModSettings().catch(() => undefined) ?? MODERATION_DEFAULTS
    }
    if (settings.enabled) {
      const { flaggedCount } = moderateText(name, { strictness: settings.strictness, behavior: settings.behavior })
      if (flaggedCount > 0) {
        setNameError("That name was blocked by the ministry's language filter. Try another.")
        return
      }
    }
    setNameError(null)
    setSaving(true)
    // Cohort change is its own server action, not a column on this update: moving
    // between "Class of X" and Young Adults also moves CHAT MEMBERSHIP, and a bare
    // profiles write would leave someone labelled a young adult while still sitting
    // in their class chat — the exact split that made the graduation flow look like
    // it worked for months. Staged behind Save like every other field here
    // (Convention #21), applied only when it actually changed.
    const wasYoungAdult = isYoungAdult(profile.grade)
    if (draftYoungAdult !== wasYoungAdult) {
      const res = await setYoungAdult(draftYoungAdult)
      if (res?.error) { setNameError(res.error); setSaving(false); return }
      setProfile(prev => ({ ...prev, grade: draftYoungAdult ? "young_adult" : null }))
    }
    const { data, error } = await supabase
      .from("profiles")
      .update({
        name,
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
    // draftYoungAdult + profile.grade are REQUIRED here. Without them this
    // callback closes over the value they had when Edit was opened, so ticking
    // "I'm a young adult" set aria-pressed, showed no error, and saved nothing —
    // the comparison below ran against a stale `false` every time. The
    // exhaustive-deps disable was hiding exactly that.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft, draftYoungAdult, profile.grade, initialProfile.ministry_id, userId, modSettings, mutateModSettings])

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
    // The extension lands inside the STORAGE KEY, and the key is what the RLS
    // policy matches on — so it cannot be whatever the user's filename happened to
    // end with. `photo.tar.gz` gave `gz`; a name ending in a 40-character token
    // gave a 40-character extension. Clamp to a known image set, defaulting to the
    // format the bytes are actually converted to below.
    const raw = file.name.split(".").pop()?.toLowerCase()
    const candidate = raw && raw !== file.name.toLowerCase() ? raw : ""
    const ALLOWED_EXT = ["jpg", "jpeg", "png", "webp", "gif", "heic", "heif", "avif"]
    const ext = ALLOWED_EXT.includes(candidate) ? candidate : "jpg"
    const fileName = `${userId}.${ext}`
    // Downscale to a 512px JPEG before upload; on decode failure keep the raw file.
    // Path stays identical — Supabase serves the stored contentType, so a .png path
    // holding JPEG bytes resolves correctly.
    let uploadBody: Blob | File = file
    let uploadContentType = file.type || "image/png"
    try {
      uploadBody = await downscaleToJpeg(file)
      uploadContentType = "image/jpeg"
    } catch {
      uploadBody = file
      uploadContentType = file.type || "image/png"
    }
    const { data: uploadData, error } = await supabase.storage
      .from("profile-images")
      .upload(fileName, uploadBody, { upsert: true, contentType: uploadContentType })
    if (error) { setAvatarError(error.message); setUploadingAvatar(false); e.target.value = ""; return }
    if (uploadData) {
      const { data: { publicUrl } } = supabase.storage.from("profile-images").getPublicUrl(uploadData.path)
      // The stored path is `{userId}.{ext}`, so every upload overwrites the SAME
      // object at the SAME URL. The bytes changed; the URL did not — and every
      // consumer is keyed on the URL. React sees an identical string and skips the
      // re-render, next/image serves its optimized copy, the browser serves its
      // cached one. The upload worked and the user saw their old photo, which is
      // indistinguishable from "you can't change it". A version stamp makes each
      // upload a distinct URL, which is what actually forces the update.
      // If the extension changed, the OLD object is now unreferenced — publicly
      // live with nothing pointing at it, which is the invisible leak
      // lib/storage-cleanup.ts rule 2 exists to prevent. Reachable without the
      // user changing file type at all, since an extensionless pick now defaults
      // to `jpg` where it used to default to `png`. Best-effort: the new photo is
      // already stored, so a failed sweep must not fail the upload.
      const previous = storagePathFromPublicUrl(profile.avatar_url, "profile-images")
      if (previous && previous !== uploadData.path && !previous.includes("/") && previous.startsWith(`${userId}.`)) {
        await removeStorageObject(supabase, "profile-images", previous, "avatar extension change")
      }

      const versioned = `${publicUrl}?v=${Date.now()}`
      // Checked, not fire-and-forget: if this write fails the object HAS been
      // replaced but the column still holds the old `?v=`, so the user sees their
      // previous photo after a successful-looking upload — verbatim the symptom
      // this whole change exists to fix.
      const { error: pointerErr } = await supabase.from("profiles")
        .update({ avatar_url: versioned }).eq("id", userId).eq("ministry_id", initialProfile.ministry_id ?? "")
      if (pointerErr) {
        setAvatarError("Couldn't save your new photo. Please try again.")
        setUploadingAvatar(false)
        e.target.value = ""
        return
      }
      setProfile(p => ({ ...p, avatar_url: versioned }))
      onAvatarChange?.(versioned)
    }
    setUploadingAvatar(false)
    e.target.value = ""
  }

  async function handleAvatarRemove() {
    if (!profile.avatar_url || uploadingAvatar) return
    setUploadingAvatar(true)
    setAvatarError(null)

    // Assert the shape rather than trusting a string that came out of a URL:
    // root-level, own uid. Same guard delete-account.ts uses for this bucket. A
    // profile can legitimately point at a URL that is NOT its own object (an
    // OAuth photo, or a sandbox fixture aliasing someone else's file) — those
    // parse to null or fail the guard, and the column is simply cleared.
    const parsed = storagePathFromPublicUrl(profile.avatar_url, "profile-images")
    const ownPath = parsed && !parsed.includes("/") && parsed.startsWith(`${userId}.`) ? parsed : null

    // REMOVE FIRST, then drop the pointer (lib/storage-cleanup.ts rule 2). This
    // bucket is PUBLIC: clearing the column first and failing the delete leaves a
    // live public face photo with nothing pointing at it — invisible, permanent,
    // unretryable. Failing this way round leaves the photo AND the button, so the
    // user can just try again.
    if (ownPath) {
      // Judged on rows removed, NEVER on `error` — an RLS-denied remove returns
      // `{ error: null, data: [] }`, HTTP 200, file untouched (rule 1). The first
      // cut of this handler discarded the result entirely and would have reported
      // success while the photo survived — the very bug being fixed here.
      const removed = await removeStorageObject(supabase, "profile-images", ownPath, "profile avatar remove")
      if (!removed) {
        setAvatarError("Couldn't remove your photo. Please try again.")
        setUploadingAvatar(false)
        return
      }
    }

    const { error } = await supabase.from("profiles")
      .update({ avatar_url: null }).eq("id", userId).eq("ministry_id", initialProfile.ministry_id ?? "")
    if (error) { setAvatarError("Couldn't remove your photo. Please try again."); setUploadingAvatar(false); return }
    setProfile(p => ({ ...p, avatar_url: null }))
    onAvatarChange?.(null)
    setUploadingAvatar(false)
  }

  // One tap, no modal — matches the chat photo-removal precedent (CLAUDE.md:
  // re-uploading is easy, so a confirm dialog costs more than the mistake does).
  // Rendered only when there IS a photo, so it never sits dead next to initials.
  function removePhotoButton(compact: boolean) {
    if (!profile.avatar_url || editing) return null
    return (
      <button
        type="button"
        onClick={handleAvatarRemove}
        disabled={uploadingAvatar}
        style={{
          background: "none", border: "none", padding: 0, marginTop: 6,
          color: "var(--muted-text)", fontSize: compact ? 12 : 12.5,
          cursor: uploadingAvatar ? "not-allowed" : "pointer",
          WebkitTapHighlightColor: "transparent",
        }}
      >
        Remove photo
      </button>
    )
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

  function renderProfileSections(mobile: boolean) {
    // Mobile → borderless tonal --ivory card, --line-3 field dividers (spec
    // §1.1/§3.1); desktop keeps the hairline cream card language.
    const sectionCard: React.CSSProperties = mobile
      ? { borderRadius: "var(--r-pocket)", overflow: "hidden", background: "var(--ivory)" }
      : { border: "1px solid var(--line)", borderRadius: 12, overflow: "hidden", background: "var(--cream)" }
    const fieldDivider = mobile ? "var(--line-3)" : "var(--line)"
    const hasAnyContent = PROFILE_SECTIONS.some(s => s.fields.some(f => !!getFieldValue(f.key).trim()))
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
        {PROFILE_SECTIONS.map(section => {
          // A young adult has no graduating class, so the year field is removed
          // rather than left blank for them to wonder about.
          const applicable = draftYoungAdult
            ? section.fields.filter(f => f.key !== "graduation_year")
            : section.fields
          const filledFields = applicable.filter(f => !!getFieldValue(f.key).trim())
          if (!editing && filledFields.length === 0 && !(section.id === "contact" && isYoungAdult(profile.grade))) return null
          const fieldsToRender = editing ? applicable : filledFields
          return (
            <div key={section.id}>
              <p style={{ ...MONO_STYLE, marginBottom: 10, marginTop: 0 }}>{section.label}</p>
              <div style={sectionCard}>
                {fieldsToRender.map((field, i) => (
                  <div key={field.key} style={{ padding: "14px 18px", borderTop: i > 0 ? `1px solid ${fieldDivider}` : "none" }}>
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
                {section.id === "contact" && (editing || isYoungAdult(profile.grade)) && (
                  <div style={{ padding: "14px 18px", borderTop: `1px solid ${fieldDivider}` }}>
                    <p style={monoFieldLabel}>Stage</p>
                    {editing ? (
                      <button
                        type="button"
                        onClick={() => setDraftYoungAdult(v => !v)}
                        aria-pressed={draftYoungAdult}
                        style={{ display: "flex", alignItems: "center", gap: 10, width: "100%", textAlign: "left", background: "none", border: "none", padding: 0, cursor: "pointer", minHeight: 32 }}
                      >
                        <span aria-hidden style={{
                          width: 18, height: 18, flexShrink: 0, borderRadius: 5,
                          border: `1px solid ${draftYoungAdult ? "var(--plum)" : "var(--line-2)"}`,
                          background: draftYoungAdult ? "var(--plum)" : "transparent",
                          display: "inline-flex", alignItems: "center", justifyContent: "center",
                          color: "var(--cream)", fontSize: 11, lineHeight: 1,
                        }}>{draftYoungAdult ? "\u2713" : ""}</span>
                        <span style={{ display: "flex", flexDirection: "column", gap: 1, minWidth: 0 }}>
                          <span style={{ fontSize: 14, color: "var(--ink)" }}>I&rsquo;m a young adult</span>
                          <span style={{ fontSize: 12, color: "var(--muted-text)" }}>
                            Moves you to the Young Adults chat.
                          </span>
                        </span>
                      </button>
                    ) : (
                      <p style={{ fontSize: 14, color: "var(--ink)", margin: 0 }}>Young Adult</p>
                    )}
                  </div>
                )}
              </div>
            </div>
          )
        })}

        {editing && schoolOptions.length > 0 && (
          <div>
            <p style={{ ...MONO_STYLE, marginBottom: 10, marginTop: 0 }}>School</p>
            <div style={sectionCard}>
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
          mobile ? (
            <EmptyState
              variant="quiet"
              icon={<UserIcon className="w-5 h-5" strokeWidth={1.6} />}
              title="Your profile is empty"
              subtitle="Edit your profile to share details with your community."
            />
          ) : (
            <div style={{ textAlign: "center", padding: "40px 0 24px" }}>
              <p style={{ fontFamily: "var(--serif)", fontSize: 17, color: "var(--ink)", marginBottom: 4, marginTop: 0 }}>Nothing here yet</p>
              <p style={{ fontSize: 13, color: "var(--muted-text)", margin: 0 }}>Edit your profile to share details with your community.</p>
            </div>
          )
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
        <div ref={journalSwipeRef}>
          {/* Mobile chrome — Journal is a pushed screen off the profile root, so it
              carries the one back chevron (Convention #22) and the shared chrome
              rhythm/type (Convention #27). It used to be a hand-rolled row: serif 25
              title, `pt-6 pb-5`, and no way back — the section was reachable only
              from the desktop sidebar or a hand-typed ?section=journal. */}
          <PocketChrome
            title="Journal"
            back={backToProfileRoot}
            action={<JournalSettingsMenu showEntries={profile.show_journal_entries ?? false} showStreak={profile.show_journal_streak ?? false} onToggleEntries={handleToggleEntries} onToggleStreak={handleToggleStreak} />}
          />

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

        {/* ── Mobile: profile chrome + identity — hidden while in the settings drill.
            The chrome's action slot carries the settings gear (Cancel while editing).
            Editing swaps the title to "Edit profile" + Cancel/Save (§1). ── */}
        {settingsView === null && (<>
        <PocketChrome
          title={editing ? "Edit profile" : "Profile"}
          // No chevron on the root: Profile is a pill TAB ROOT now, and a tab root
          // has no level to go up to (§3 — sub-screens get the chevron, roots don't).
          // It carried `onBack` → Home back when Profile was a subpage reached from
          // the chrome avatar. While EDITING the chrome's own Cancel action exits the
          // form, so a chevron there would just be a second cancel.
          back={undefined}
          action={editing
            ? <PocketButton variant="quiet" compact surface="page" onClick={cancelEdit}>Cancel</PocketButton>
            : <PocketRoundButton ariaLabel="Settings" onClick={() => openSettings("hub")}><Settings size={16} /></PocketRoundButton>}
          action2={editing ? <PocketButton variant="primary" compact onClick={saveEdit} disabled={saving || !nameValid}>{saving ? "Saving…" : "Save"}</PocketButton> : undefined}
        />

        {/* ── Mobile: identity card (tonal ivory). Edit is a quiet plum action tucked
            into the card's top-right corner — no dedicated button row. ── */}
        <div className="md:hidden px-5 pb-2">
          <PocketCard padding="20px">
            <div style={{ display: "flex", alignItems: "center", gap: 16, position: "relative" }}>
              <label className="group relative flex-shrink-0" style={{ width: 56, height: 56, borderRadius: "50%", background: "var(--plum)", display: "grid", placeItems: "center", overflow: "hidden", cursor: uploadingAvatar ? "not-allowed" : "pointer" }} aria-label="Change profile photo">
                <input type="file" accept="image/*" style={{ position: "absolute", width: 0, height: 0, opacity: 0, overflow: "hidden" }} onChange={handleAvatarUpload} disabled={uploadingAvatar} />
                {profile.avatar_url
                  ? <Image src={profile.avatar_url} alt="Profile" fill sizes="56px" style={{ objectFit: "cover" }} />
                  : <span style={{ fontFamily: "var(--serif)", fontSize: 19, fontWeight: 600, color: "var(--cream-on-dark)" }}>{getInitials(profile.name)}</span>
                }
                <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center" style={{ background: "color-mix(in srgb, var(--ink) 35%, transparent)" }}>
                  <Camera style={{ width: 14, height: 14, color: "white" }} />
                </div>
                {uploadingAvatar && <div className="absolute inset-0 flex items-center justify-center" style={{ background: "color-mix(in srgb, var(--ink) 40%, transparent)" }}><div className="animate-spin" style={{ width: 18, height: 18, border: "2px solid white", borderTopColor: "transparent", borderRadius: "50%" }} /></div>}
              </label>
              {/* Sibling of the avatar, never inside the <label> — nesting it there
                  makes every tap open the file picker instead of removing. */}
              <div style={{ flex: 1, minWidth: 0, paddingRight: !editing ? 40 : 0 }}>
                {editing ? (
                  <>
                    <SerifInput
                      value={draft.name}
                      onChange={(e) => { setDraft(d => ({ ...d, name: e.target.value })); if (nameError) setNameError(null) }}
                      fontSize={22}
                      aria-label="Your name"
                      placeholder="Your name"
                      autoComplete="name"
                      maxLength={80}
                      style={{ letterSpacing: "-0.01em", lineHeight: 1.15 }}
                    />
                    {/* Same copy as desktop — without it the disabled Save at the
                        top of the chrome has no explanation at phone width. 12.5
                        is the mobile ramp's off-ramp/hint size (PocketField), not
                        desktop's 12. */}
                    {!nameValid && (
                      <p style={{ fontSize: 12.5, color: "var(--muted-text)", margin: "6px 0 0" }}>
                        Enter your name — this is what your ministry sees.
                      </p>
                    )}
                    {nameError && (
                      <p style={{ fontSize: 12.5, color: "var(--danger)", margin: "6px 0 0" }}>{nameError}</p>
                    )}
                  </>
                ) : (
                  <h1 style={{ fontFamily: "var(--serif)", fontSize: 22, fontWeight: 600, letterSpacing: "-0.01em", color: "var(--ink)", margin: 0, lineHeight: 1.15, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{profile.name}</h1>
                )}
                <div style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 6, minWidth: 0 }}>
                  <PocketTag label={roleLabel(profile.role, null)} variant="role" />
                  <span style={{ fontSize: 13, color: "var(--muted-text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{profile.email}</span>
                </div>
                {removePhotoButton(true)}
                {(cohortLabel(profile.grade, profile.graduation_year) || (currentSchoolId && schoolOptions.find(s => s.id === currentSchoolId)?.abbreviation)) && (
                  <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center", marginTop: 5 }}>
                    {cohortLabel(profile.grade, profile.graduation_year) && <span style={{ fontSize: 12, color: "var(--muted-text)" }}>{cohortLabel(profile.grade, profile.graduation_year)}</span>}
                    {currentSchoolId && schoolOptions.find(s => s.id === currentSchoolId)?.abbreviation && <span style={{ fontSize: 12, color: "var(--muted-text)" }}>{schoolOptions.find(s => s.id === currentSchoolId)!.abbreviation}</span>}
                  </div>
                )}
              </div>
              {!editing && (
                <button onClick={startEdit} aria-label="Edit profile" style={{ position: "absolute", top: 0, right: 0, display: "inline-flex", alignItems: "center", gap: 4, background: "none", border: "none", cursor: "pointer", color: "var(--plum)", fontSize: 12.5, fontWeight: 600, padding: 0, WebkitTapHighlightColor: "transparent" }}>
                  <Pencil size={12.5} />Edit
                </button>
              )}
            </div>
            {avatarError && <p style={{ fontSize: 11, color: "var(--danger)", margin: "10px 0 0" }}>{avatarError}</p>}
          </PocketCard>
        </div>

        {/* ── Mobile: Journal — the ONE hub row on the profile root (§3 hub-and-spoke).
            Journal's phone-width UI has existed since the Pocket build but had no
            entry point at this width: `onSectionChange` was wired only in
            desktop-nav.tsx, so on a phone it was reachable solely by hand-typing
            ?section=journal. It stays a pushed screen rather than a pill tab —
            it's private and low-frequency next to the four ministry surfaces —
            and it sits above ABOUT/FAITH/PRAYER because it's a destination, not
            a field. Hidden while editing (the root is a form then) and while the
            settings drill is up (this whole block is inside that guard). ── */}
        {!editing && (
          <div className="md:hidden px-5" style={{ paddingTop: 10 }}>
            <PocketKicker label="Personal" />
            <PocketRowCard>
              <PocketRow
                leading={<SettingsIconChip icon={<BookOpen size={17} strokeWidth={2} />} />}
                title="Journal"
                sub="Devotionals, prayers & verses"
                chevron
                isLast
                onClick={() => onSectionChange("journal")}
              />
            </PocketRowCard>
          </div>
        )}
        </>)}

        {/* ── Mobile: settings drill (gear → hub → section). md:hidden; desktop keeps
            settings inline and never sets settingsView. Edge-swipe-back = the chevron. ── */}
        {settingsView !== null && (
          <div className="md:hidden" ref={settingsSwipeRef}>
            <PocketChrome
              title={SETTINGS_LABELS[settingsView]}
              back={settingsView === "hub" ? closeSettings : () => openSettings("hub")}
            />
            {settingsView === "hub" ? (
              <div className="px-5 pt-2 pb-6">
                <PocketKicker label="Settings" />
                <PocketRowCard>
                  <PocketRow leading={<SettingsIconChip icon={<Bell size={17} strokeWidth={2} />} />} title="Notifications" chevron onClick={() => openSettings("notifications")} />
                  <PocketRow leading={<SettingsIconChip icon={<LifeBuoy size={17} strokeWidth={2} />} />} title="Account & support" chevron onClick={() => openSettings("account")} />
                  <PocketRow leading={<SettingsIconChip icon={<ShieldAlert size={17} strokeWidth={2} />} />} title="Danger zone" chevron isLast onClick={() => openSettings("danger")} />
                </PocketRowCard>
                {/* Sign out — neutral action, kept OUT of the red Danger zone. */}
                <PocketButton variant="quiet" surface="page" onClick={onLogout} style={{ width: "100%", marginTop: 24 }}>
                  <LogOut size={14} />Sign out
                </PocketButton>
              </div>
            ) : (
              <div className="px-5 pt-2 pb-6">
                {settingsView === "notifications" && (
                  <NotificationsSection
                    userId={userId}
                    ministryId={initialProfile.ministry_id ?? ""}
                    notificationSettings={profile.notification_settings}
                    onSettingsChange={(s: NotificationSettings) => setProfile(p => ({ ...p, notification_settings: s }))}
                    mobile
                  />
                )}
                {settingsView === "account" && <AccountLinksSection userId={userId} mobile />}
                {settingsView === "danger" && (
                  <DangerZone
                    mobile
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
                )}
              </div>
            )}
          </div>
        )}

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
                ? <Image src={profile.avatar_url} alt="Profile" fill sizes="64px" style={{ objectFit: "cover" }} />
                : <span style={{ fontFamily: "var(--serif)", fontSize: 26, color: "var(--cream)" }}>{getInitials(profile.name)}</span>
              }
              <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center" style={{ background: "color-mix(in srgb, var(--ink) 35%, transparent)" }}>
                <Camera style={{ width: 16, height: 16, color: "white" }} />
              </div>
              {uploadingAvatar && <div className="absolute inset-0 flex items-center justify-center" style={{ background: "color-mix(in srgb, var(--ink) 40%, transparent)" }}><div className="animate-spin" style={{ width: 20, height: 20, border: "2px solid white", borderTopColor: "transparent", borderRadius: "50%" }} /></div>}
            </label>
            <div style={{ flex: 1, minWidth: 0 }}>
              <p style={{ ...MONO_STYLE, margin: "0 0 6px" }}>{roleLabel(profile.role, null)}</p>
              {editing ? (
                <div style={{ margin: "0 0 8px" }}>
                  <SerifInput
                    value={draft.name}
                    onChange={(e) => { setDraft(d => ({ ...d, name: e.target.value })); if (nameError) setNameError(null) }}
                    fontSize={32}
                    aria-label="Your name"
                    placeholder="Your name"
                    autoComplete="name"
                    maxLength={80}
                    style={{ fontWeight: 400, letterSpacing: "-0.01em", lineHeight: 1.05 }}
                  />
                  {!nameValid && (
                    <p style={{ fontSize: 12, color: "var(--muted-text)", margin: "6px 0 0" }}>
                      Enter your name — this is what your ministry sees.
                    </p>
                  )}
                  {nameError && (
                    <p style={{ fontSize: 12, color: "var(--danger)", margin: "6px 0 0" }}>{nameError}</p>
                  )}
                </div>
              ) : (
                <h1 style={{ fontFamily: "var(--serif)", fontSize: 32, fontWeight: 400, letterSpacing: "-0.01em", color: "var(--ink)", margin: "0 0 8px", lineHeight: 1.05 }}>{profile.name}</h1>
              )}
              <div style={{ display: "flex", gap: 20, fontSize: 14, color: "var(--body)", flexWrap: "wrap", alignItems: "center" }}>
                {cohortLabel(profile.grade, profile.graduation_year) && <span>{cohortLabel(profile.grade, profile.graduation_year)}</span>}
                {currentSchoolId && schoolOptions.find(s => s.id === currentSchoolId)?.abbreviation && <span>{schoolOptions.find(s => s.id === currentSchoolId)!.abbreviation}</span>}
                <span style={{ color: "var(--muted-text)" }}>{profile.email}</span>
              </div>
              {removePhotoButton(false)}
              {avatarError && <p style={{ fontSize: 11, color: "var(--danger)", margin: "6px 0 0" }}>{avatarError}</p>}
            </div>
            {editing ? (
              <div style={{ display: "flex", gap: 8, flexShrink: 0 }}>
                <CentralButton variant="secondary" onClick={cancelEdit}><X size={13} />Cancel</CentralButton>
                <CentralButton onClick={saveEdit} disabled={saving || !nameValid}><Check size={13} />{saving ? "Saving…" : "Save"}</CentralButton>
              </div>
            ) : (
              <CentralButton variant="secondary" onClick={startEdit} style={{ flexShrink: 0 }}><Pencil size={13} />Edit profile</CentralButton>
            )}
          </div>
        </div>

        {/* ── Desktop: profile sections ── */}
        <div className="hidden md:flex md:flex-col md:flex-1 px-14 pt-6 pb-10">
          {renderProfileSections(false)}
          <div style={{ marginTop: 24 }}>
            <NotificationsSection
              userId={userId}
              ministryId={initialProfile.ministry_id ?? ""}
              notificationSettings={profile.notification_settings}
              onSettingsChange={(s: NotificationSettings) => setProfile(p => ({ ...p, notification_settings: s }))}
            />
          </div>
          <div style={{ marginTop: 24 }}>
            <AccountLinksSection userId={userId} />
          </div>
          <div style={{ marginTop: "auto" }}>
            <DangerZone
              mobile={false}
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

        {/* ── Mobile: profile content — About / Faith / Prayer only. Notifications,
            Account & support, Sign out, and Danger zone moved into the gear → settings
            hub above (§ Profile). Hidden while in the settings drill. ── */}
        {settingsView === null && (
        <div className="md:hidden px-5 pb-6" style={{ paddingTop: 24 }}>
          {renderProfileSections(true)}
        </div>
        )}
      </div>}
    </div>
  )
}
