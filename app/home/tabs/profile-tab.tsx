"use client"

import { useState, useEffect, useRef, useMemo, useCallback } from "react"
import useSWR from "swr"
import { useRouter } from "next/navigation"
import { ChevronRight, ChevronDown, X, Check, Camera, Edit3, BookOpen, Search, ImageIcon, MoreHorizontal, Plus, Trash2, Settings } from "lucide-react"
import { createClient } from "@/lib/supabase"
import { MONO_STYLE, RingCrossLogo } from "../components/shared"
import { getInitials } from "../utils"
import { getHomeVerses } from "@/app/actions/home-verses"
import { selfLeaveMinistry } from "@/app/actions/ministry"
import { RoleDescriptionEditor } from "./plan-tab"
import { CentralButton, InsetHairline, PlanSubTabStrip, TabPageHeader, PageTitle, JournalListSkeleton } from "@/components/central"
import type { Profile, Devotional, Prayer, PrayerStatus, Verse } from "../types"

const STATUS_CONFIG: Record<string, { label: string; bg: string; text: string }> = {
  praying:  { label: "Praying",  bg: "var(--ivory)", text: "var(--plum)" },
  answered: { label: "Answered", bg: "var(--cream)", text: "var(--body)" },
  ongoing:  { label: "Ongoing",  bg: "var(--cream)", text: "var(--muted-text)" },
}

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
  const [openMenuId, setOpenMenuId] = useState<string | null>(null)

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

  function openNew() { setEditingEntry(null); setDraft({ title: "", passage: "", content: "", image_url: null }); setShowEditor(true); setOpenMenuId(null) }
  function openEdit(entry: Devotional) { setEditingEntry(entry); setDraft({ title: entry.title, passage: entry.passage, content: entry.content, image_url: entry.image_url }); setShowEditor(true); setOpenMenuId(null) }

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
    setOpenMenuId(null)
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

  return (
    <div>
      <input ref={imageInputRef} type="file" accept="image/*" className="hidden" onChange={handleImageUpload} />
      <div style={{ marginBottom: 20 }}>
        <p style={{ ...MONO_STYLE, margin: "0 0 6px" }}>Devotionals · {entries.length}</p>
        <h2 style={{ fontFamily: "var(--serif)", fontWeight: 400, fontSize: 32, color: "var(--ink)", letterSpacing: "-0.02em", lineHeight: 1.05, margin: 0 }}>Reflections</h2>
      </div>
      <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 20 }}>
        <div style={{ flex: 1, position: "relative" }}>
          <Search size={14} style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", color: "var(--muted-text)", pointerEvents: "none" }} />
          <input type="text" placeholder="Search devotionals…" value={searchQuery} onChange={e => setSearchQuery(e.target.value)} style={{ width: "100%", paddingLeft: 36, paddingRight: 12, paddingTop: 9, paddingBottom: 9, background: "var(--cream)", border: "1px solid var(--line)", borderRadius: 10, fontSize: 13, color: "var(--ink)", outline: "none", fontFamily: "inherit" }} />
        </div>
        <CentralButton onClick={openNew} style={{ padding: "9px 16px", fontSize: 13, borderRadius: 10, flexShrink: 0, whiteSpace: "nowrap" }}>
          <Plus size={14} />New entry
        </CentralButton>
      </div>

      {showEditor && (
        <div style={{ background: "var(--cream)", borderRadius: 14, border: "1px solid var(--line)", marginBottom: 20, overflow: "hidden" }}>
          <RoleDescriptionEditor
            key={editingEntry?.id ?? "new"}
            initialContent={draft.content}
            onChange={html => setDraft(d => ({ ...d, content: html }))}
            placeholder="Write your reflections here…"
          >
            <div style={{ padding: "18px 26px 0" }}>
              <input type="text" placeholder="Entry title…" value={draft.title} onChange={e => setDraft(d => ({ ...d, title: e.target.value }))} autoFocus style={{ ...inputBase, fontFamily: "var(--serif)", fontSize: 22, color: "var(--ink)", marginBottom: 6, letterSpacing: "-0.02em" }} />
              <input type="text" placeholder="Passage reference (e.g. John 3:16–17)" value={draft.passage} onChange={e => setDraft(d => ({ ...d, passage: e.target.value }))} style={{ ...inputBase, fontFamily: "var(--serif)", fontStyle: "italic", fontSize: 14, color: "var(--plum)", borderBottom: "1px solid var(--line)", marginBottom: 0, paddingBottom: 10 }} />
            </div>
          </RoleDescriptionEditor>
          <div style={{ padding: "0 26px 20px" }}>
            {draft.image_url ? (
              <div style={{ position: "relative", marginBottom: 14, display: "inline-block" }}>
                <img src={draft.image_url} alt="" style={{ maxHeight: 180, maxWidth: "100%", borderRadius: 8 }} />
                <button onClick={() => setDraft(d => ({ ...d, image_url: null }))} style={{ position: "absolute", top: 5, right: 5, background: "rgba(0,0,0,0.5)", border: "none", borderRadius: "50%", width: 20, height: 20, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}><X size={10} color="white" /></button>
              </div>
            ) : (
              <button onClick={() => imageInputRef.current?.click()} disabled={uploadingImage} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: "var(--muted-text)", background: "transparent", border: "1px dashed var(--line)", borderRadius: 8, padding: "7px 11px", cursor: "pointer", marginBottom: 14 }}>
                <ImageIcon size={12} />{uploadingImage ? "Uploading…" : "Attach photo or image"}
              </button>
            )}
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
              <CentralButton variant="secondary" onClick={() => { setShowEditor(false); setEditingEntry(null) }} style={{ padding: "7px 14px", fontSize: 13 }}>Cancel</CentralButton>
              <CentralButton onClick={handleSave} disabled={saving || !draft.title.trim()} style={{ padding: "7px 14px", fontSize: 13 }}>{saving ? "Saving…" : editingEntry ? "Update" : "Save entry"}</CentralButton>
            </div>
          </div>
        </div>
      )}

      {loading ? (
        <JournalListSkeleton />
      ) : filtered.length === 0 ? (
        <div style={{ textAlign: "center", paddingTop: 48 }}>
          <BookOpen size={28} style={{ color: "var(--faint)", margin: "0 auto 12px", display: "block" }} />
          {searchQuery.trim() ? <p style={{ fontSize: 13, color: "var(--muted-text)" }}>No entries match &ldquo;{searchQuery}&rdquo;</p> : (
            <><p style={{ fontFamily: "var(--serif)", fontSize: 17, color: "var(--ink)", marginBottom: 4 }}>No devotionals yet</p><p style={{ fontSize: 13, color: "var(--muted-text)" }}>Write your first entry to get started.</p></>
          )}
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {filtered.map((entry, idx) => {
            const isFirst = idx === 0 && !searchQuery.trim()
            const isExpanded = isFirst || expandedIds.has(entry.id) || searchQuery.trim().length > 0
            const menuOpen = openMenuId === entry.id
            return (
              <div key={entry.id} style={{ background: "var(--cream)", borderRadius: "var(--r-card)", border: "1px solid var(--line)" }}>
                <div style={{ padding: isExpanded ? "20px 20px 0" : "14px 18px", cursor: isFirst ? "default" : "pointer" }} onClick={() => { if (!isFirst) { toggleExpand(entry.id); setOpenMenuId(null) } }}>
                  <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 10 }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <h3 style={{ fontFamily: "var(--serif)", fontSize: isExpanded ? 19 : 15, fontWeight: 400, color: "var(--ink)", letterSpacing: "-0.01em", lineHeight: 1.25, margin: 0, marginBottom: entry.passage ? 3 : 0 }}>{entry.title}</h3>
                      {entry.passage && <p style={{ fontFamily: "var(--serif)", fontStyle: "italic", fontSize: 13, color: "var(--plum)", lineHeight: 1.4, margin: 0 }}>{entry.passage}</p>}
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 4, flexShrink: 0 }}>
                      <span style={{ fontFamily: "ui-monospace, monospace", fontSize: 10, color: "var(--muted-text)", letterSpacing: "0.04em", whiteSpace: "nowrap" }}>{fmtJournalDate(entry.created_at)}</span>
                      <div style={{ position: "relative" }}>
                        <button onClick={e => { e.stopPropagation(); setOpenMenuId(menuOpen ? null : entry.id) }} style={{ width: 26, height: 26, borderRadius: 6, background: menuOpen ? "var(--ivory)" : "transparent", border: "none", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", color: "var(--muted-text)" }}><MoreHorizontal size={15} /></button>
                        {menuOpen && (
                          <div style={{ position: "absolute", right: 0, top: "calc(100% + 4px)", background: "var(--cream)", border: "1px solid var(--line)", borderRadius: 9, boxShadow: "0 4px 14px rgba(19,16,26,0.10)", zIndex: 20, minWidth: 130, overflow: "hidden" }}>
                            <button onClick={e => { e.stopPropagation(); openEdit(entry) }} style={{ display: "flex", alignItems: "center", gap: 8, padding: "9px 13px", width: "100%", background: "transparent", border: "none", fontSize: 13, color: "var(--ink)", cursor: "pointer" }}><Edit3 size={13} />Edit</button>
                            <div style={{ height: 1, background: "var(--line)" }} />
                            <button onClick={e => { e.stopPropagation(); handleDelete(entry.id) }} style={{ display: "flex", alignItems: "center", gap: 8, padding: "9px 13px", width: "100%", background: "transparent", border: "none", fontSize: 13, color: "var(--danger)", cursor: "pointer" }}><Trash2 size={13} />Delete</button>
                          </div>
                        )}
                      </div>
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
  const [filterStatus, setFilterStatus] = useState<PrayerStatus | "all">("all")
  const [showEditor, setShowEditor] = useState(false)
  const [editingEntry, setEditingEntry] = useState<Prayer | null>(null)
  const [draft, setDraft] = useState({ title: "", content: "", status: "praying" as PrayerStatus })
  const [saving, setSaving] = useState(false)
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set())
  const [openMenuId, setOpenMenuId] = useState<string | null>(null)
  const [statusMenuId, setStatusMenuId] = useState<string | null>(null)

  // Report count to the parent whenever the cached list changes.
  useEffect(() => {
    if (data) onCountChange?.(data.length)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data])

  const filtered = useMemo(() => {
    let base = entries
    if (filterStatus !== "all") base = base.filter(e => e.status === filterStatus)
    if (!searchQuery.trim()) return base
    const q = searchQuery.toLowerCase()
    return base.filter(e => e.title.toLowerCase().includes(q) || e.content.toLowerCase().includes(q))
  }, [entries, searchQuery, filterStatus])

  function openNew() { setEditingEntry(null); setDraft({ title: "", content: "", status: "praying" }); setShowEditor(true); setOpenMenuId(null) }
  function openEdit(entry: Prayer) { setEditingEntry(entry); setDraft({ title: entry.title, content: entry.content, status: entry.status }); setShowEditor(true); setOpenMenuId(null) }

  async function handleSave() {
    if (!draft.title.trim()) return
    setSaving(true)
    if (editingEntry) {
      const { data: row, error } = await supabase.from("prayers").update({ title: draft.title, content: draft.content, status: draft.status }).eq("id", editingEntry.id).eq("user_id", userId).eq("ministry_id", ministryId).select().single()
      if (!error && row) mutate(curr => (curr ?? []).map(e => e.id === editingEntry.id ? (row as Prayer) : e), { revalidate: false })
    } else {
      const { data: row, error } = await supabase.from("prayers").insert({ user_id: userId, ministry_id: ministryId, title: draft.title, content: draft.content, status: draft.status }).select().single()
      if (!error && row) mutate(curr => [row as Prayer, ...(curr ?? [])], { revalidate: false })
    }
    setSaving(false); setShowEditor(false); setEditingEntry(null)
  }

  async function handleDelete(id: string) {
    const { error } = await supabase.from("prayers").delete().eq("id", id).eq("user_id", userId).eq("ministry_id", ministryId)
    if (!error) mutate(curr => (curr ?? []).filter(e => e.id !== id), { revalidate: false })
    setOpenMenuId(null)
  }

  async function updateStatus(id: string, status: PrayerStatus) {
    const { data: row, error } = await supabase.from("prayers").update({ status }).eq("id", id).eq("user_id", userId).eq("ministry_id", ministryId).select().single()
    if (!error && row) mutate(curr => (curr ?? []).map(e => e.id === id ? (row as Prayer) : e), { revalidate: false })
    setStatusMenuId(null)
  }

  function toggleExpand(id: string) { setExpandedIds(prev => { const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); return n }) }

  function StatusBadge({ status, entryId }: { status: PrayerStatus; entryId: string }) {
    const cfg = STATUS_CONFIG[status]
    const isOpen = statusMenuId === entryId
    return (
      <div style={{ position: "relative", display: "inline-block" }}>
        <button onClick={e => { e.stopPropagation(); setStatusMenuId(isOpen ? null : entryId); setOpenMenuId(null) }} style={{ padding: "2px 9px", borderRadius: 20, background: cfg.bg, color: cfg.text, fontSize: 11, fontWeight: 600, border: "1px solid var(--line)", cursor: "pointer", letterSpacing: "0.03em" }}>
          {cfg.label}
        </button>
        {isOpen && (
          <div style={{ position: "absolute", left: 0, top: "calc(100% + 4px)", background: "var(--cream)", border: "1px solid var(--line)", borderRadius: 9, boxShadow: "0 4px 14px rgba(19,16,26,0.10)", zIndex: 20, overflow: "hidden", minWidth: 130 }}>
            {(["praying", "answered", "ongoing"] as PrayerStatus[]).map(s => (
              <button key={s} onClick={e => { e.stopPropagation(); updateStatus(entryId, s) }} style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 12px", width: "100%", background: s === status ? "var(--ivory)" : "transparent", border: "none", cursor: "pointer" }}>
                <span style={{ width: 7, height: 7, borderRadius: "50%", background: STATUS_CONFIG[s].text, flexShrink: 0 }} />
                <span style={{ fontSize: 13, color: "var(--ink)" }}>{STATUS_CONFIG[s].label}</span>
              </button>
            ))}
          </div>
        )}
      </div>
    )
  }

  const inputBase: React.CSSProperties = { display: "block", width: "100%", background: "transparent", border: "none", outline: "none", fontFamily: "inherit" }

  return (
    <div>
      <div style={{ marginBottom: 20 }}>
        <p style={{ ...MONO_STYLE, margin: "0 0 6px" }}>Prayers · {entries.length}</p>
        <h2 style={{ fontFamily: "var(--serif)", fontWeight: 400, fontSize: 32, color: "var(--ink)", letterSpacing: "-0.02em", lineHeight: 1.05, margin: 0 }}>What you&apos;re praying</h2>
      </div>
      <div style={{ display: "flex", gap: 6, marginBottom: 16, flexWrap: "wrap" }}>
        {(["all", "praying", "answered", "ongoing"] as const).map(f => {
          const isActive = filterStatus === f
          const label = f === "all" ? "All" : STATUS_CONFIG[f].label
          return (
            <button key={f} onClick={() => setFilterStatus(f)} style={{ padding: "4px 12px", borderRadius: 20, border: isActive ? "none" : "1px solid var(--line-2)", background: isActive ? "var(--plum-2)" : "var(--ivory)", color: isActive ? "var(--cream)" : "var(--body)", fontSize: 12, fontWeight: isActive ? 600 : 400, cursor: "pointer", transition: "background 150ms" }}>
              {label}
            </button>
          )
        })}
      </div>
      <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 20 }}>
        <div style={{ flex: 1, position: "relative" }}>
          <Search size={14} style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", color: "var(--muted-text)", pointerEvents: "none" }} />
          <input type="text" placeholder="Search prayers…" value={searchQuery} onChange={e => setSearchQuery(e.target.value)} style={{ width: "100%", paddingLeft: 36, paddingRight: 12, paddingTop: 9, paddingBottom: 9, background: "var(--cream)", border: "1px solid var(--line)", borderRadius: 10, fontSize: 13, color: "var(--ink)", outline: "none", fontFamily: "inherit" }} />
        </div>
        <CentralButton onClick={openNew} style={{ padding: "9px 16px", fontSize: 13, borderRadius: 10, flexShrink: 0, whiteSpace: "nowrap" }}>
          <Plus size={14} />New prayer
        </CentralButton>
      </div>

      {showEditor && (
        <div style={{ background: "var(--cream)", borderRadius: 14, border: "1px solid var(--line)", marginBottom: 20, overflow: "hidden" }}>
          <RoleDescriptionEditor
            key={editingEntry?.id ?? "new"}
            initialContent={draft.content}
            onChange={html => setDraft(d => ({ ...d, content: html }))}
            placeholder="Write your prayer here…"
            minHeight={152}
          >
            <div style={{ padding: "18px 26px 0" }}>
              <input type="text" placeholder="Prayer title…" value={draft.title} onChange={e => setDraft(d => ({ ...d, title: e.target.value }))} autoFocus style={{ ...inputBase, fontFamily: "var(--serif)", fontSize: 22, color: "var(--ink)", marginBottom: 0, letterSpacing: "-0.02em", borderBottom: "1px solid var(--line)", paddingBottom: 10 }} />
            </div>
          </RoleDescriptionEditor>
          <div style={{ padding: "0 26px 20px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 18 }}>
              <span style={{ fontSize: 12, color: "var(--muted-text)" }}>Status</span>
              {(["praying", "answered", "ongoing"] as PrayerStatus[]).map(s => {
                const cfg = STATUS_CONFIG[s]; const sel = draft.status === s
                return (
                  <button key={s} onClick={() => setDraft(d => ({ ...d, status: s }))} style={{ padding: "3px 11px", borderRadius: 20, background: sel ? cfg.bg : "transparent", color: sel ? cfg.text : "var(--muted-text)", fontSize: 12, fontWeight: sel ? 600 : 400, border: sel ? "1px solid var(--line)" : "1px solid var(--line-2)", cursor: "pointer" }}>{cfg.label}</button>
                )
              })}
            </div>
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
              <CentralButton variant="secondary" onClick={() => { setShowEditor(false); setEditingEntry(null) }} style={{ padding: "7px 14px", fontSize: 13 }}>Cancel</CentralButton>
              <CentralButton onClick={handleSave} disabled={saving || !draft.title.trim()} style={{ padding: "7px 14px", fontSize: 13 }}>{saving ? "Saving…" : editingEntry ? "Update" : "Save prayer"}</CentralButton>
            </div>
          </div>
        </div>
      )}

      {loading ? (
        <JournalListSkeleton />
      ) : filtered.length === 0 ? (
        <div style={{ textAlign: "center", paddingTop: 48 }}>
          <BookOpen size={28} style={{ color: "var(--faint)", margin: "0 auto 12px", display: "block" }} />
          {searchQuery.trim() ? <p style={{ fontSize: 13, color: "var(--muted-text)" }}>No prayers match &ldquo;{searchQuery}&rdquo;</p> : (
            <><p style={{ fontFamily: "var(--serif)", fontSize: 17, color: "var(--ink)", marginBottom: 4 }}>No prayers yet</p><p style={{ fontSize: 13, color: "var(--muted-text)" }}>Record your first prayer request.</p></>
          )}
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {filtered.map((entry, idx) => {
            const isFirst = idx === 0 && !searchQuery.trim()
            const isExpanded = isFirst || expandedIds.has(entry.id) || searchQuery.trim().length > 0
            const menuOpen = openMenuId === entry.id
            const hasBody = !!(entry.content && entry.content.replace(/<[^>]*>/g, "").trim())
            return (
              <div key={entry.id} style={{ background: "var(--cream)", borderRadius: "var(--r-card)", border: "1px solid var(--line)" }}>
                <div style={{ padding: isExpanded ? (hasBody ? "18px 20px 0" : "18px 20px 16px") : "13px 18px", cursor: isFirst ? "default" : "pointer" }} onClick={() => { if (!isFirst) { toggleExpand(entry.id); setOpenMenuId(null); setStatusMenuId(null) } }}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
                    <div style={{ flex: 1, minWidth: 0, display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                      <h3 style={{ fontFamily: "var(--serif)", fontSize: 15, fontWeight: 400, color: "var(--ink)", letterSpacing: "-0.01em", lineHeight: 1.3, margin: 0 }}>{entry.title}</h3>
                      <div onClick={e => e.stopPropagation()}><StatusBadge status={entry.status} entryId={entry.id} /></div>
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 4, flexShrink: 0 }}>
                      <span style={{ fontFamily: "ui-monospace, monospace", fontSize: 10, color: "var(--muted-text)", letterSpacing: "0.04em", whiteSpace: "nowrap" }}>{fmtJournalDate(entry.created_at)}</span>
                      <div style={{ position: "relative" }}>
                        <button onClick={e => { e.stopPropagation(); setOpenMenuId(menuOpen ? null : entry.id); setStatusMenuId(null) }} style={{ width: 26, height: 26, borderRadius: 6, background: menuOpen ? "var(--ivory)" : "transparent", border: "none", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", color: "var(--muted-text)" }}><MoreHorizontal size={15} /></button>
                        {menuOpen && (
                          <div style={{ position: "absolute", right: 0, top: "calc(100% + 4px)", background: "var(--cream)", border: "1px solid var(--line)", borderRadius: 9, boxShadow: "0 4px 14px rgba(19,16,26,0.10)", zIndex: 20, minWidth: 130, overflow: "hidden" }}>
                            <button onClick={e => { e.stopPropagation(); openEdit(entry) }} style={{ display: "flex", alignItems: "center", gap: 8, padding: "9px 13px", width: "100%", background: "transparent", border: "none", fontSize: 13, color: "var(--ink)", cursor: "pointer" }}><Edit3 size={13} />Edit</button>
                            <div style={{ height: 1, background: "var(--line)" }} />
                            <button onClick={e => { e.stopPropagation(); handleDelete(entry.id) }} style={{ display: "flex", alignItems: "center", gap: 8, padding: "9px 13px", width: "100%", background: "transparent", border: "none", fontSize: 13, color: "var(--danger)", cursor: "pointer" }}><Trash2 size={13} />Delete</button>
                          </div>
                        )}
                      </div>
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
  const [openMenuId, setOpenMenuId] = useState<string | null>(null)

  const filtered = useMemo(() => {
    if (!searchQuery.trim()) return entries
    const q = searchQuery.toLowerCase()
    return entries.filter(e => e.reference.toLowerCase().includes(q) || e.verse_text.toLowerCase().includes(q) || e.note.toLowerCase().includes(q))
  }, [entries, searchQuery])

  function openNew() { setEditingEntry(null); setDraft({ reference: "", verse_text: "", note: "" }); setShowEditor(true); setOpenMenuId(null) }
  function openEdit(entry: Verse) { setEditingEntry(entry); setDraft({ reference: entry.reference, verse_text: entry.verse_text, note: entry.note }); setShowEditor(true); setOpenMenuId(null) }

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
    setOpenMenuId(null)
  }
  function toggleExpand(id: string) { setExpandedIds(prev => { const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); return n }) }
  const inputBase: React.CSSProperties = { display: "block", width: "100%", background: "transparent", border: "none", outline: "none", fontFamily: "inherit" }

  return (
    <div>
      <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 20 }}>
        <div style={{ flex: 1, position: "relative" }}>
          <Search size={14} style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", color: "var(--muted-text)", pointerEvents: "none" }} />
          <input type="text" placeholder="Search verses…" value={searchQuery} onChange={e => setSearchQuery(e.target.value)} style={{ width: "100%", paddingLeft: 36, paddingRight: 12, paddingTop: 9, paddingBottom: 9, background: "var(--cream)", border: "1px solid var(--line)", borderRadius: 10, fontSize: 13, color: "var(--ink)", outline: "none", fontFamily: "inherit" }} />
        </div>
        <CentralButton onClick={openNew} style={{ padding: "9px 16px", fontSize: 13, borderRadius: 10, flexShrink: 0, whiteSpace: "nowrap" }}>
          <Plus size={14} />Add verse
        </CentralButton>
      </div>

      {showEditor && (
        <div style={{ background: "var(--cream)", borderRadius: 14, border: "1px solid var(--line)", padding: "26px 26px 20px", marginBottom: 20 }}>
          <input type="text" placeholder="Reference (e.g. John 3:16)" value={draft.reference} onChange={e => setDraft(d => ({ ...d, reference: e.target.value }))} autoFocus style={{ ...inputBase, fontFamily: "var(--serif)", fontSize: 20, color: "var(--plum)", marginBottom: 12, letterSpacing: "-0.01em" }} />
          <textarea placeholder="Verse text…" value={draft.verse_text} onChange={e => setDraft(d => ({ ...d, verse_text: e.target.value }))} rows={3} style={{ display: "block", width: "100%", fontFamily: "var(--serif)", fontStyle: "italic", fontSize: 15, color: "var(--ink)", lineHeight: 1.7, background: "transparent", border: "none", borderBottom: "1px solid var(--line)", outline: "none", resize: "none", marginBottom: 16, paddingBottom: 12 }} />
          <textarea placeholder="Why this verse convicted you…" value={draft.note} onChange={e => setDraft(d => ({ ...d, note: e.target.value }))} rows={4} style={{ display: "block", width: "100%", fontSize: 14, color: "var(--body)", lineHeight: 1.8, background: "transparent", border: "none", outline: "none", resize: "vertical", marginBottom: 16, fontFamily: "inherit" }} />
          <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
            <CentralButton variant="secondary" onClick={() => { setShowEditor(false); setEditingEntry(null) }} style={{ padding: "7px 14px", fontSize: 13 }}>Cancel</CentralButton>
            <CentralButton onClick={handleSave} disabled={saving || !draft.reference.trim() || !draft.verse_text.trim()} style={{ padding: "7px 14px", fontSize: 13 }}>{saving ? "Saving…" : editingEntry ? "Update" : "Save verse"}</CentralButton>
          </div>
        </div>
      )}

      {loading ? (
        <JournalListSkeleton />
      ) : filtered.length === 0 ? (
        <div style={{ textAlign: "center", paddingTop: 48 }}>
          <BookOpen size={28} style={{ color: "var(--faint)", margin: "0 auto 12px", display: "block" }} />
          {searchQuery.trim() ? <p style={{ fontSize: 13, color: "var(--muted-text)" }}>No verses match &ldquo;{searchQuery}&rdquo;</p> : (
            <><p style={{ fontFamily: "var(--serif)", fontSize: 17, color: "var(--ink)", marginBottom: 4 }}>No verses saved yet</p><p style={{ fontSize: 13, color: "var(--muted-text)" }}>Save a verse that has spoken to you.</p></>
          )}
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {filtered.map((entry, idx) => {
            const isFirst = idx === 0 && !searchQuery.trim()
            const isExpanded = isFirst || expandedIds.has(entry.id) || searchQuery.trim().length > 0
            const menuOpen = openMenuId === entry.id
            const preview = entry.verse_text.length > 90 ? entry.verse_text.slice(0, 90) + "…" : entry.verse_text
            return (
              <div key={entry.id} style={{ background: "var(--cream)", borderRadius: "var(--r-card)", border: "1px solid var(--line)" }}>
                <div style={{ padding: isExpanded ? "20px 20px 0" : "14px 18px", cursor: isFirst ? "default" : "pointer" }} onClick={() => { if (!isFirst) { toggleExpand(entry.id); setOpenMenuId(null) } }}>
                  <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 10 }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <p style={{ fontFamily: "var(--serif)", fontSize: isExpanded ? 18 : 15, fontWeight: 400, color: "var(--plum)", letterSpacing: "-0.01em", margin: 0, marginBottom: !isExpanded ? 3 : 0 }}>{entry.reference}</p>
                      {!isExpanded && <p style={{ fontFamily: "var(--serif)", fontStyle: "italic", fontSize: 13, color: "var(--body)", lineHeight: 1.5, margin: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{preview}</p>}
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 4, flexShrink: 0 }}>
                      <span style={{ fontFamily: "ui-monospace, monospace", fontSize: 10, color: "var(--muted-text)", letterSpacing: "0.04em", whiteSpace: "nowrap" }}>{fmtJournalDate(entry.created_at)}</span>
                      <div style={{ position: "relative" }}>
                        <button onClick={e => { e.stopPropagation(); setOpenMenuId(menuOpen ? null : entry.id) }} style={{ width: 26, height: 26, borderRadius: 6, background: menuOpen ? "var(--ivory)" : "transparent", border: "none", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", color: "var(--muted-text)" }}><MoreHorizontal size={15} /></button>
                        {menuOpen && (
                          <div style={{ position: "absolute", right: 0, top: "calc(100% + 4px)", background: "var(--cream)", border: "1px solid var(--line)", borderRadius: 9, boxShadow: "0 4px 14px rgba(19,16,26,0.10)", zIndex: 20, minWidth: 130, overflow: "hidden" }}>
                            <button onClick={e => { e.stopPropagation(); openEdit(entry) }} style={{ display: "flex", alignItems: "center", gap: 8, padding: "9px 13px", width: "100%", background: "transparent", border: "none", fontSize: 13, color: "var(--ink)", cursor: "pointer" }}><Edit3 size={13} />Edit</button>
                            <div style={{ height: 1, background: "var(--line)" }} />
                            <button onClick={e => { e.stopPropagation(); handleDelete(entry.id) }} style={{ display: "flex", alignItems: "center", gap: 8, padding: "9px 13px", width: "100%", background: "transparent", border: "none", fontSize: 13, color: "var(--danger)", cursor: "pointer" }}><Trash2 size={13} />Delete</button>
                          </div>
                        )}
                      </div>
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
  const [journalTab, setJournalTab] = useState<JournalTabId>("devotionals")
  const [entryCount, setEntryCount] = useState(0)
  const [entryDates, setEntryDates] = useState<string[]>([])
  const [prayerCount, setPrayerCount] = useState(0)
  const [showSettingsMenu, setShowSettingsMenu] = useState(false)
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

  function VerseCard() {
    if (!homeVerse) return null
    return (
      <div style={{ marginTop: 32, padding: "20px 24px", background: "var(--cream)", border: "1px solid var(--line)", borderRadius: "var(--r-card)" }}>
        <p style={{ ...MONO_STYLE, margin: "0 0 10px" }}>Today&apos;s Verse</p>
        <p style={{ fontFamily: "var(--serif)", fontStyle: "italic", fontSize: 16, color: "var(--ink)", lineHeight: 1.75, margin: "0 0 8px" }}>&ldquo;{homeVerse.text}&rdquo;</p>
        <p style={{ fontFamily: "var(--serif)", fontSize: 13, color: "var(--plum)", margin: 0 }}>— {homeVerse.reference}</p>
      </div>
    )
  }

  return (
    <>
      {/* Settings gear + stats bar */}
      <div style={{ position: "relative", paddingTop: 4 }}>
        <div style={{ position: "absolute", top: 0, right: 0, zIndex: 10 }}>
          <button onClick={() => setShowSettingsMenu(v => !v)} style={{ width: 28, height: 28, borderRadius: 7, background: showSettingsMenu ? "var(--ivory)" : "transparent", border: "none", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", color: "var(--muted-text)" }}>
            <Settings size={14} />
          </button>
          {showSettingsMenu && (
            <div style={{ position: "absolute", right: 0, top: "calc(100% + 4px)", background: "var(--cream)", border: "1px solid var(--line)", borderRadius: 10, boxShadow: "0 4px 14px rgba(19,16,26,0.10)", zIndex: 20, padding: "12px 16px", minWidth: 210 }}>
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
      </div>

      {/* Mobile: tab strip + single column */}
      <div className="md:hidden" style={{ paddingTop: showStats ? 0 : 24, paddingBottom: 52 }}>
        <div style={{ marginBottom: 24 }}>
          <PlanSubTabStrip
            tabs={JOURNAL_TABS}
            active={journalTab}
            onChange={k => setJournalTab(k as JournalTabId)}
          />
        </div>
        {journalTab === "devotionals" && <JournalDevotionalsTab userId={userId} ministryId={ministryId} onCountChange={(n, dates) => { setEntryCount(n); setEntryDates(dates) }} />}
        {journalTab === "prayers" && <JournalPrayersTab userId={userId} ministryId={ministryId} onCountChange={n => setPrayerCount(n)} />}
        {journalTab === "verses" && <JournalVersesTab userId={userId} ministryId={ministryId} />}
        <VerseCard />
      </div>

      {/* Desktop: two-column */}
      <div className="hidden md:block">
        <div style={{ display: "grid", paddingTop: showStats ? 0 : 28, paddingBottom: 52, gridTemplateColumns: "1fr 320px", gap: 28, alignItems: "start" }}>
          <JournalDevotionalsTab userId={userId} ministryId={ministryId} onCountChange={(n, dates) => { setEntryCount(n); setEntryDates(dates) }} />
          <JournalPrayersTab userId={userId} ministryId={ministryId} onCountChange={n => setPrayerCount(n)} />
        </div>
        <VerseCard />
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

// ── Danger Zone (§4.19 editorial inline rule) ─────────────────────────────────

function DangerZone({
  ministryName,
  leaveConfirm,
  leaving,
  leaveError,
  onShowConfirm,
  onCancel,
  onConfirm,
}: {
  ministryName: string
  leaveConfirm: boolean
  leaving: boolean
  leaveError: string | null
  onShowConfirm: () => void
  onCancel: () => void
  onConfirm: () => void
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
    router.push("/join")
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

  return (
    <div className="pb-6 md:pb-0 md:flex md:flex-col md:min-h-full">

      {activeSection === "journal" && (
        <div className="pb-28 md:pb-0">
          {/* Mobile header */}
          <div className="md:hidden px-5 pt-14 pb-5">
            <p style={{ ...MONO_STYLE, marginBottom: 6 }}>Your Journal</p>
            <h1 style={{ fontFamily: "var(--serif)", fontSize: 36, color: "var(--ink)", lineHeight: 1.05, margin: "14px 0 0", fontWeight: 400 }}>Journal</h1>
            <p style={{ fontSize: 14, color: "var(--body)", marginTop: 8 }}>Your prayers, reflections, and devotionals.</p>
          </div>

          {/* Desktop header */}
          <TabPageHeader>
            <PageTitle eyebrow="Your Journal" title="Journal">
              <p style={{ fontSize: 14, color: "var(--body)", marginTop: 12, maxWidth: 560 }}>Your prayers, reflections, and devotionals.</p>
            </PageTitle>
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
                ? <img src={profile.avatar_url} alt="Profile" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                : <span style={{ fontFamily: "var(--serif)", fontSize: 20, color: "var(--cream)" }}>{getInitials(profile.name)}</span>
              }
              <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center" style={{ background: "rgba(19,16,26,0.35)" }}>
                <Camera style={{ width: 14, height: 14, color: "white" }} />
              </div>
              {uploadingAvatar && <div className="absolute inset-0 flex items-center justify-center" style={{ background: "rgba(19,16,26,0.4)" }}><div className="animate-spin" style={{ width: 18, height: 18, border: "2px solid white", borderTopColor: "transparent", borderRadius: "50%" }} /></div>}
            </label>
            <div style={{ flex: 1, minWidth: 0 }}>
              <h1 style={{ fontFamily: "var(--serif)", fontSize: 26, fontWeight: 400, letterSpacing: "-0.02em", color: "var(--ink)", margin: 0, lineHeight: 1.1 }}>{profile.name}</h1>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", marginTop: 6 }}>
                <span style={{ fontSize: 11, fontWeight: 500, color: "var(--body)", background: "var(--ivory)", border: "1px solid var(--line-2)", borderRadius: 999, padding: "2px 8px", textTransform: "capitalize" as const }}>{profile.role}</span>
                {profile.graduation_year && <span style={{ fontSize: 12, color: "var(--muted-text)" }}>Class of {profile.graduation_year}</span>}
                {currentSchoolId && schoolOptions.find(s => s.id === currentSchoolId) && <span style={{ fontSize: 12, color: "var(--muted-text)" }}>{schoolOptions.find(s => s.id === currentSchoolId)!.abbreviation}</span>}
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
            <CentralButton variant="secondary" onClick={startEdit} style={{ fontSize: 13 }}><Edit3 size={13} />Edit profile</CentralButton>
          )}
        </div>

        {/* ── Desktop: cream identity header ── */}
        <TabPageHeader style={{ gap: 24 }}>
          <label className="group relative flex-shrink-0" style={{ width: 64, height: 64, borderRadius: "999px", background: "var(--plum)", display: "grid", placeItems: "center", overflow: "hidden", cursor: uploadingAvatar ? "not-allowed" : "pointer" }} aria-label="Change profile photo">
            <input type="file" accept="image/*" style={{ position: "absolute", width: 0, height: 0, opacity: 0, overflow: "hidden" }} onChange={handleAvatarUpload} disabled={uploadingAvatar} />
            {profile.avatar_url
              ? <img src={profile.avatar_url} alt="Profile" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
              : <span style={{ fontFamily: "var(--serif)", fontSize: 26, color: "var(--cream)" }}>{getInitials(profile.name)}</span>
            }
            <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center" style={{ background: "rgba(19,16,26,0.35)" }}>
              <Camera style={{ width: 16, height: 16, color: "white" }} />
            </div>
            {uploadingAvatar && <div className="absolute inset-0 flex items-center justify-center" style={{ background: "rgba(19,16,26,0.4)" }}><div className="animate-spin" style={{ width: 20, height: 20, border: "2px solid white", borderTopColor: "transparent", borderRadius: "50%" }} /></div>}
          </label>
          <div style={{ flex: 1, minWidth: 0 }}>
            <p style={{ ...MONO_STYLE, margin: "0 0 6px" }}>Your Profile · {profile.role}</p>
            <h1 style={{ fontFamily: "var(--serif)", fontSize: 44, fontWeight: 400, letterSpacing: "-0.01em", color: "var(--ink)", margin: "0 0 10px", lineHeight: 1.05 }}>{profile.name}</h1>
            <div style={{ display: "flex", gap: 20, fontSize: 14, color: "var(--body)", flexWrap: "wrap", alignItems: "center" }}>
              {profile.graduation_year && <span>Class of {profile.graduation_year}</span>}
              {currentSchoolId && schoolOptions.find(s => s.id === currentSchoolId) && <span>{schoolOptions.find(s => s.id === currentSchoolId)!.abbreviation}</span>}
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
            <CentralButton variant="secondary" onClick={startEdit} style={{ flexShrink: 0 }}><Edit3 size={13} />Edit profile</CentralButton>
          )}
        </TabPageHeader>

        {/* ── Desktop: profile sections ── */}
        <div className="hidden md:flex md:flex-col md:flex-1 px-14 pt-6 pb-10">
          {renderProfileSections()}
          <div style={{ marginTop: "auto" }}>
            <DangerZone
              ministryName={ministryName}
              leaveConfirm={leaveConfirm}
              leaving={leaving}
              leaveError={leaveError}
              onShowConfirm={() => setLeaveConfirm(true)}
              onCancel={() => { setLeaveConfirm(false); setLeaveError(null) }}
              onConfirm={handleLeaveMinistry}
            />
          </div>
        </div>

        {/* ── Mobile: profile sections ── */}
        <div className="md:hidden px-5 pb-6">
          {renderProfileSections()}
          <DangerZone
            ministryName={ministryName}
            leaveConfirm={leaveConfirm}
            leaving={leaving}
            leaveError={leaveError}
            onShowConfirm={() => setLeaveConfirm(true)}
            onCancel={() => { setLeaveConfirm(false); setLeaveError(null) }}
            onConfirm={handleLeaveMinistry}
          />
        </div>
      </div>}
    </div>
  )
}
