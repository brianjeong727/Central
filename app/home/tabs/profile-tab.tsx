"use client"

import { useState, useEffect, useRef, useMemo, useCallback } from "react"
import { ChevronRight, ChevronDown, X, Check, ArrowLeft, Camera, Edit3, BookOpen, Search, ImageIcon, LogOut, MoreHorizontal, Plus, Trash2 } from "lucide-react"
import { createClient } from "@/lib/supabase"
import { updateMinistryPublic } from "@/app/actions/ministry"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Spinner, MONO_STYLE, RingCrossLogo } from "../components/shared"
import { getInitials, getAvatarColor } from "../utils"
import { DesktopTopbar } from "../components/desktop-nav"
import { RoleDescriptionEditor } from "./plan-tab"
import type { Profile, Devotional, Prayer, PrayerStatus, Verse } from "../types"

const STATUS_CONFIG: Record<string, { label: string; bg: string; text: string }> = {
  praying:  { label: "Praying",  bg: "#EDE5F0", text: "#3E1540" },
  answered: { label: "Answered", bg: "#F4F1E8", text: "#3E1540" },
  ongoing:  { label: "Ongoing",  bg: "#FBF8F2", text: "#5A5466" },
}

function fmtJournalDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
}

export function JournalDevotionalsTab({ userId, ministryId }: { userId: string; ministryId: string }) {
  const supabase = createClient()
  const imageInputRef = useRef<HTMLInputElement>(null)
  const [entries, setEntries] = useState<Devotional[]>([])
  const [loading, setLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState("")
  const [showEditor, setShowEditor] = useState(false)
  const [editingEntry, setEditingEntry] = useState<Devotional | null>(null)
  const [draft, setDraft] = useState({ title: "", passage: "", content: "", image_url: null as string | null })
  const [saving, setSaving] = useState(false)
  const [uploadingImage, setUploadingImage] = useState(false)
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set())
  const [openMenuId, setOpenMenuId] = useState<string | null>(null)

  useEffect(() => {
    async function load() {
      setLoading(true)
      const { data } = await supabase.from("devotionals").select("*").eq("user_id", userId).eq("ministry_id", ministryId).order("created_at", { ascending: false })
      if (data) setEntries(data)
      setLoading(false)
    }
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId, ministryId])

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
      const { data, error } = await supabase.from("devotionals").update({ title: draft.title, passage: draft.passage, content: draft.content, image_url: draft.image_url }).eq("id", editingEntry.id).eq("user_id", userId).eq("ministry_id", ministryId).select().single()
      if (!error && data) setEntries(prev => prev.map(e => e.id === editingEntry.id ? (data as Devotional) : e))
    } else {
      const { data, error } = await supabase.from("devotionals").insert({ user_id: userId, ministry_id: ministryId, title: draft.title, passage: draft.passage, content: draft.content, image_url: draft.image_url }).select().single()
      if (!error && data) setEntries(prev => [data as Devotional, ...prev])
    }
    setSaving(false); setShowEditor(false); setEditingEntry(null)
  }

  async function handleDelete(id: string) {
    const { error } = await supabase.from("devotionals").delete().eq("id", id).eq("user_id", userId).eq("ministry_id", ministryId)
    if (!error) setEntries(prev => prev.filter(e => e.id !== id))
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
      <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 20 }}>
        <div style={{ flex: 1, position: "relative" }}>
          <Search size={14} style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", color: "#8A8497", pointerEvents: "none" }} />
          <input type="text" placeholder="Search devotionals…" value={searchQuery} onChange={e => setSearchQuery(e.target.value)} style={{ width: "100%", paddingLeft: 36, paddingRight: 12, paddingTop: 9, paddingBottom: 9, background: "#FBF8F2", border: "1px solid #ECE8DE", borderRadius: 10, fontSize: 13, color: "#13101A", outline: "none", fontFamily: "inherit" }} />
        </div>
        <button onClick={openNew} style={{ display: "flex", alignItems: "center", gap: 6, padding: "9px 16px", background: "#3E1540", color: "#F6F4EF", borderRadius: 10, border: "none", fontSize: 13, fontWeight: 500, cursor: "pointer", flexShrink: 0, whiteSpace: "nowrap" }}>
          <Plus size={14} />New entry
        </button>
      </div>

      {showEditor && (
        <div style={{ background: "white", borderRadius: 16, border: "1px solid #ECE8DE", marginBottom: 20, boxShadow: "0 2px 12px rgba(19,16,26,0.06)", overflow: "hidden" }}>
          <RoleDescriptionEditor
            key={editingEntry?.id ?? "new"}
            initialContent={draft.content}
            onChange={html => setDraft(d => ({ ...d, content: html }))}
            placeholder="Write your reflections here…"
          >
            <div style={{ padding: "18px 26px 0" }}>
              <input type="text" placeholder="Entry title…" value={draft.title} onChange={e => setDraft(d => ({ ...d, title: e.target.value }))} autoFocus style={{ ...inputBase, fontFamily: "var(--font-instrument-serif)", fontSize: 22, color: "#13101A", marginBottom: 6, letterSpacing: "-0.02em" }} />
              <input type="text" placeholder="Passage reference (e.g. John 3:16–17)" value={draft.passage} onChange={e => setDraft(d => ({ ...d, passage: e.target.value }))} style={{ ...inputBase, fontFamily: "var(--font-instrument-serif)", fontStyle: "italic", fontSize: 14, color: "#3E1540", borderBottom: "1px solid #F0EDE8", marginBottom: 0, paddingBottom: 10 }} />
            </div>
          </RoleDescriptionEditor>
          <div style={{ padding: "0 26px 20px" }}>
            {draft.image_url ? (
              <div style={{ position: "relative", marginBottom: 14, display: "inline-block" }}>
                <img src={draft.image_url} alt="" style={{ maxHeight: 180, maxWidth: "100%", borderRadius: 8 }} />
                <button onClick={() => setDraft(d => ({ ...d, image_url: null }))} style={{ position: "absolute", top: 5, right: 5, background: "rgba(0,0,0,0.5)", border: "none", borderRadius: "50%", width: 20, height: 20, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}><X size={10} color="white" /></button>
              </div>
            ) : (
              <button onClick={() => imageInputRef.current?.click()} disabled={uploadingImage} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: "#8A8497", background: "transparent", border: "1px dashed #D4CFC7", borderRadius: 7, padding: "7px 11px", cursor: "pointer", marginBottom: 14 }}>
                <ImageIcon size={12} />{uploadingImage ? "Uploading…" : "Attach photo or image"}
              </button>
            )}
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
              <button onClick={() => { setShowEditor(false); setEditingEntry(null) }} style={{ padding: "7px 14px", borderRadius: 8, border: "1px solid #ECE8DE", background: "transparent", fontSize: 13, color: "#5A5466", cursor: "pointer" }}>Cancel</button>
              <button onClick={handleSave} disabled={saving || !draft.title.trim()} style={{ padding: "7px 14px", borderRadius: 8, background: "#3E1540", color: "#F6F4EF", border: "none", fontSize: 13, fontWeight: 500, cursor: "pointer", opacity: saving || !draft.title.trim() ? 0.5 : 1 }}>{saving ? "Saving…" : editingEntry ? "Update" : "Save entry"}</button>
            </div>
          </div>
        </div>
      )}

      {loading ? (
        <Spinner />
      ) : filtered.length === 0 ? (
        <div style={{ textAlign: "center", paddingTop: 48 }}>
          <BookOpen size={28} style={{ color: "#C4C4C4", margin: "0 auto 12px" }} />
          {searchQuery.trim() ? <p style={{ fontSize: 13, color: "#8A8497" }}>No entries match &ldquo;{searchQuery}&rdquo;</p> : (
            <><p style={{ fontFamily: "var(--font-instrument-serif)", fontSize: 17, color: "#13101A", marginBottom: 4 }}>No devotionals yet</p><p style={{ fontSize: 13, color: "#8A8497" }}>Write your first entry to get started.</p></>
          )}
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {filtered.map((entry, idx) => {
            const isFirst = idx === 0 && !searchQuery.trim()
            const isExpanded = isFirst || expandedIds.has(entry.id) || searchQuery.trim().length > 0
            const menuOpen = openMenuId === entry.id
            return (
              <div key={entry.id} style={{ background: "white", borderRadius: 14, border: "1px solid #ECE8DE", boxShadow: "0 1px 3px rgba(19,16,26,0.04)" }}>
                <div style={{ padding: isExpanded ? "20px 20px 0" : "14px 18px", cursor: isFirst ? "default" : "pointer" }} onClick={() => { if (!isFirst) { toggleExpand(entry.id); setOpenMenuId(null) } }}>
                  <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 10 }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <h3 style={{ fontFamily: "var(--font-instrument-serif)", fontSize: isExpanded ? 19 : 15, fontWeight: 400, color: "#13101A", letterSpacing: "-0.01em", lineHeight: 1.25, margin: 0, marginBottom: entry.passage ? 3 : 0 }}>{entry.title}</h3>
                      {entry.passage && <p style={{ fontFamily: "var(--font-instrument-serif)", fontStyle: "italic", fontSize: 13, color: "#3E1540", lineHeight: 1.4, margin: 0 }}>{entry.passage}</p>}
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 4, flexShrink: 0 }}>
                      <span style={{ fontFamily: "ui-monospace, monospace", fontSize: 10, color: "#8A8497", letterSpacing: "0.04em", whiteSpace: "nowrap" }}>{fmtJournalDate(entry.created_at)}</span>
                      <div style={{ position: "relative" }}>
                        <button onClick={e => { e.stopPropagation(); setOpenMenuId(menuOpen ? null : entry.id) }} style={{ width: 26, height: 26, borderRadius: 6, background: menuOpen ? "#F4F1E8" : "transparent", border: "none", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", color: "#8A8497" }}><MoreHorizontal size={15} /></button>
                        {menuOpen && (
                          <div style={{ position: "absolute", right: 0, top: "calc(100% + 4px)", background: "white", border: "1px solid #ECE8DE", borderRadius: 9, boxShadow: "0 4px 14px rgba(19,16,26,0.10)", zIndex: 20, minWidth: 130, overflow: "hidden" }}>
                            <button onClick={e => { e.stopPropagation(); openEdit(entry) }} style={{ display: "flex", alignItems: "center", gap: 8, padding: "9px 13px", width: "100%", background: "transparent", border: "none", fontSize: 13, color: "#13101A", cursor: "pointer" }}><Edit3 size={13} />Edit</button>
                            <div style={{ height: 1, background: "#F0EDE8" }} />
                            <button onClick={e => { e.stopPropagation(); handleDelete(entry.id) }} style={{ display: "flex", alignItems: "center", gap: 8, padding: "9px 13px", width: "100%", background: "transparent", border: "none", fontSize: 13, color: "#EF4444", cursor: "pointer" }}><Trash2 size={13} />Delete</button>
                          </div>
                        )}
                      </div>
                      {!isFirst && <span style={{ color: "#C4C4C4", display: "flex" }}>{isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}</span>}
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

export function JournalPrayersTab({ userId, ministryId }: { userId: string; ministryId: string }) {
  const supabase = createClient()
  const [entries, setEntries] = useState<Prayer[]>([])
  const [loading, setLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState("")
  const [showEditor, setShowEditor] = useState(false)
  const [editingEntry, setEditingEntry] = useState<Prayer | null>(null)
  const [draft, setDraft] = useState({ title: "", content: "", status: "praying" as PrayerStatus })
  const [saving, setSaving] = useState(false)
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set())
  const [openMenuId, setOpenMenuId] = useState<string | null>(null)
  const [statusMenuId, setStatusMenuId] = useState<string | null>(null)

  useEffect(() => {
    async function load() {
      setLoading(true)
      const { data } = await supabase.from("prayers").select("*").eq("user_id", userId).eq("ministry_id", ministryId).order("created_at", { ascending: false })
      if (data) setEntries(data)
      setLoading(false)
    }
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId, ministryId])

  const filtered = useMemo(() => {
    if (!searchQuery.trim()) return entries
    const q = searchQuery.toLowerCase()
    return entries.filter(e => e.title.toLowerCase().includes(q) || e.content.toLowerCase().includes(q))
  }, [entries, searchQuery])

  function openNew() { setEditingEntry(null); setDraft({ title: "", content: "", status: "praying" }); setShowEditor(true); setOpenMenuId(null) }
  function openEdit(entry: Prayer) { setEditingEntry(entry); setDraft({ title: entry.title, content: entry.content, status: entry.status }); setShowEditor(true); setOpenMenuId(null) }

  async function handleSave() {
    if (!draft.title.trim()) return
    setSaving(true)
    if (editingEntry) {
      const { data, error } = await supabase.from("prayers").update({ title: draft.title, content: draft.content, status: draft.status }).eq("id", editingEntry.id).eq("user_id", userId).eq("ministry_id", ministryId).select().single()
      if (!error && data) setEntries(prev => prev.map(e => e.id === editingEntry.id ? (data as Prayer) : e))
    } else {
      const { data, error } = await supabase.from("prayers").insert({ user_id: userId, ministry_id: ministryId, title: draft.title, content: draft.content, status: draft.status }).select().single()
      if (!error && data) setEntries(prev => [data as Prayer, ...prev])
    }
    setSaving(false); setShowEditor(false); setEditingEntry(null)
  }

  async function handleDelete(id: string) {
    const { error } = await supabase.from("prayers").delete().eq("id", id).eq("user_id", userId).eq("ministry_id", ministryId)
    if (!error) setEntries(prev => prev.filter(e => e.id !== id))
    setOpenMenuId(null)
  }

  async function updateStatus(id: string, status: PrayerStatus) {
    const { data, error } = await supabase.from("prayers").update({ status }).eq("id", id).eq("user_id", userId).eq("ministry_id", ministryId).select().single()
    if (!error && data) setEntries(prev => prev.map(e => e.id === id ? (data as Prayer) : e))
    setStatusMenuId(null)
  }

  function toggleExpand(id: string) { setExpandedIds(prev => { const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); return n }) }

  function StatusBadge({ status, entryId }: { status: PrayerStatus; entryId: string }) {
    const cfg = STATUS_CONFIG[status]
    const isOpen = statusMenuId === entryId
    return (
      <div style={{ position: "relative", display: "inline-block" }}>
        <button onClick={e => { e.stopPropagation(); setStatusMenuId(isOpen ? null : entryId); setOpenMenuId(null) }} style={{ padding: "2px 9px", borderRadius: 20, background: cfg.bg, color: cfg.text, fontSize: 11, fontWeight: 600, border: "none", cursor: "pointer", letterSpacing: "0.03em" }}>
          {cfg.label}
        </button>
        {isOpen && (
          <div style={{ position: "absolute", left: 0, top: "calc(100% + 4px)", background: "white", border: "1px solid #ECE8DE", borderRadius: 9, boxShadow: "0 4px 14px rgba(19,16,26,0.10)", zIndex: 20, overflow: "hidden", minWidth: 130 }}>
            {(["praying", "answered", "ongoing"] as PrayerStatus[]).map(s => (
              <button key={s} onClick={e => { e.stopPropagation(); updateStatus(entryId, s) }} style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 12px", width: "100%", background: s === status ? "#F8F5FF" : "transparent", border: "none", cursor: "pointer" }}>
                <span style={{ width: 7, height: 7, borderRadius: "50%", background: STATUS_CONFIG[s].text, flexShrink: 0 }} />
                <span style={{ fontSize: 13, color: "#13101A" }}>{STATUS_CONFIG[s].label}</span>
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
      <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 20 }}>
        <div style={{ flex: 1, position: "relative" }}>
          <Search size={14} style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", color: "#8A8497", pointerEvents: "none" }} />
          <input type="text" placeholder="Search prayers…" value={searchQuery} onChange={e => setSearchQuery(e.target.value)} style={{ width: "100%", paddingLeft: 36, paddingRight: 12, paddingTop: 9, paddingBottom: 9, background: "#FBF8F2", border: "1px solid #ECE8DE", borderRadius: 10, fontSize: 13, color: "#13101A", outline: "none", fontFamily: "inherit" }} />
        </div>
        <button onClick={openNew} style={{ display: "flex", alignItems: "center", gap: 6, padding: "9px 16px", background: "#3E1540", color: "#F6F4EF", borderRadius: 10, border: "none", fontSize: 13, fontWeight: 500, cursor: "pointer", flexShrink: 0, whiteSpace: "nowrap" }}>
          <Plus size={14} />New prayer
        </button>
      </div>

      {showEditor && (
        <div style={{ background: "white", borderRadius: 16, border: "1px solid #ECE8DE", marginBottom: 20, boxShadow: "0 2px 12px rgba(19,16,26,0.06)", overflow: "hidden" }}>
          <RoleDescriptionEditor
            key={editingEntry?.id ?? "new"}
            initialContent={draft.content}
            onChange={html => setDraft(d => ({ ...d, content: html }))}
            placeholder="Write your prayer here…"
            minHeight={152}
          >
            <div style={{ padding: "18px 26px 0" }}>
              <input type="text" placeholder="Prayer title…" value={draft.title} onChange={e => setDraft(d => ({ ...d, title: e.target.value }))} autoFocus style={{ ...inputBase, fontFamily: "var(--font-instrument-serif)", fontSize: 22, color: "#13101A", marginBottom: 0, letterSpacing: "-0.02em", borderBottom: "1px solid #F0EDE8", paddingBottom: 10 }} />
            </div>
          </RoleDescriptionEditor>
          <div style={{ padding: "0 26px 20px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 18 }}>
              <span style={{ fontSize: 12, color: "#8A8497" }}>Status</span>
              {(["praying", "answered", "ongoing"] as PrayerStatus[]).map(s => {
                const cfg = STATUS_CONFIG[s]; const sel = draft.status === s
                return (
                  <button key={s} onClick={() => setDraft(d => ({ ...d, status: s }))} style={{ padding: "3px 11px", borderRadius: 20, background: sel ? cfg.bg : "transparent", color: sel ? cfg.text : "#8A8497", fontSize: 12, fontWeight: sel ? 600 : 400, border: sel ? "none" : "1px solid #ECE8DE", cursor: "pointer" }}>{cfg.label}</button>
                )
              })}
            </div>
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
              <button onClick={() => { setShowEditor(false); setEditingEntry(null) }} style={{ padding: "7px 14px", borderRadius: 8, border: "1px solid #ECE8DE", background: "transparent", fontSize: 13, color: "#5A5466", cursor: "pointer" }}>Cancel</button>
              <button onClick={handleSave} disabled={saving || !draft.title.trim()} style={{ padding: "7px 14px", borderRadius: 8, background: "#3E1540", color: "#F6F4EF", border: "none", fontSize: 13, fontWeight: 500, cursor: "pointer", opacity: saving || !draft.title.trim() ? 0.5 : 1 }}>{saving ? "Saving…" : editingEntry ? "Update" : "Save prayer"}</button>
            </div>
          </div>
        </div>
      )}

      {loading ? (
        <Spinner />
      ) : filtered.length === 0 ? (
        <div style={{ textAlign: "center", paddingTop: 48 }}>
          <BookOpen size={28} style={{ color: "#C4C4C4", margin: "0 auto 12px" }} />
          {searchQuery.trim() ? <p style={{ fontSize: 13, color: "#8A8497" }}>No prayers match &ldquo;{searchQuery}&rdquo;</p> : (
            <><p style={{ fontFamily: "var(--font-instrument-serif)", fontSize: 17, color: "#13101A", marginBottom: 4 }}>No prayers yet</p><p style={{ fontSize: 13, color: "#8A8497" }}>Record your first prayer request.</p></>
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
              <div key={entry.id} style={{ background: "white", borderRadius: 14, border: "1px solid #ECE8DE", boxShadow: "0 1px 3px rgba(19,16,26,0.04)" }}>
                <div style={{ padding: isExpanded ? (hasBody ? "18px 20px 0" : "18px 20px 16px") : "13px 18px", cursor: isFirst ? "default" : "pointer" }} onClick={() => { if (!isFirst) { toggleExpand(entry.id); setOpenMenuId(null); setStatusMenuId(null) } }}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
                    <div style={{ flex: 1, minWidth: 0, display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                      <h3 style={{ fontFamily: "var(--font-instrument-serif)", fontSize: 15, fontWeight: 400, color: "#13101A", letterSpacing: "-0.01em", lineHeight: 1.3, margin: 0 }}>{entry.title}</h3>
                      <div onClick={e => e.stopPropagation()}><StatusBadge status={entry.status} entryId={entry.id} /></div>
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 4, flexShrink: 0 }}>
                      <span style={{ fontFamily: "ui-monospace, monospace", fontSize: 10, color: "#8A8497", letterSpacing: "0.04em", whiteSpace: "nowrap" }}>{fmtJournalDate(entry.created_at)}</span>
                      <div style={{ position: "relative" }}>
                        <button onClick={e => { e.stopPropagation(); setOpenMenuId(menuOpen ? null : entry.id); setStatusMenuId(null) }} style={{ width: 26, height: 26, borderRadius: 6, background: menuOpen ? "#F4F1E8" : "transparent", border: "none", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", color: "#8A8497" }}><MoreHorizontal size={15} /></button>
                        {menuOpen && (
                          <div style={{ position: "absolute", right: 0, top: "calc(100% + 4px)", background: "white", border: "1px solid #ECE8DE", borderRadius: 9, boxShadow: "0 4px 14px rgba(19,16,26,0.10)", zIndex: 20, minWidth: 130, overflow: "hidden" }}>
                            <button onClick={e => { e.stopPropagation(); openEdit(entry) }} style={{ display: "flex", alignItems: "center", gap: 8, padding: "9px 13px", width: "100%", background: "transparent", border: "none", fontSize: 13, color: "#13101A", cursor: "pointer" }}><Edit3 size={13} />Edit</button>
                            <div style={{ height: 1, background: "#F0EDE8" }} />
                            <button onClick={e => { e.stopPropagation(); handleDelete(entry.id) }} style={{ display: "flex", alignItems: "center", gap: 8, padding: "9px 13px", width: "100%", background: "transparent", border: "none", fontSize: 13, color: "#EF4444", cursor: "pointer" }}><Trash2 size={13} />Delete</button>
                          </div>
                        )}
                      </div>
                      {!isFirst && <span style={{ color: "#C4C4C4", display: "flex" }}>{isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}</span>}
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

export function JournalVersesTab({ userId, ministryId }: { userId: string; ministryId: string }) {
  const supabase = createClient()
  const [entries, setEntries] = useState<Verse[]>([])
  const [loading, setLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState("")
  const [showEditor, setShowEditor] = useState(false)
  const [editingEntry, setEditingEntry] = useState<Verse | null>(null)
  const [draft, setDraft] = useState({ reference: "", verse_text: "", note: "" })
  const [saving, setSaving] = useState(false)
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set())
  const [openMenuId, setOpenMenuId] = useState<string | null>(null)

  useEffect(() => {
    async function load() {
      setLoading(true)
      const { data } = await supabase.from("verses").select("*").eq("user_id", userId).eq("ministry_id", ministryId).order("created_at", { ascending: false })
      if (data) setEntries(data)
      setLoading(false)
    }
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId, ministryId])

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
      const { data, error } = await supabase.from("verses").update({ reference: draft.reference, verse_text: draft.verse_text, note: draft.note }).eq("id", editingEntry.id).eq("user_id", userId).eq("ministry_id", ministryId).select().single()
      if (!error && data) setEntries(prev => prev.map(e => e.id === editingEntry.id ? (data as Verse) : e))
    } else {
      const { data, error } = await supabase.from("verses").insert({ user_id: userId, ministry_id: ministryId, reference: draft.reference, verse_text: draft.verse_text, note: draft.note }).select().single()
      if (!error && data) setEntries(prev => [data as Verse, ...prev])
    }
    setSaving(false); setShowEditor(false); setEditingEntry(null)
  }

  async function handleDelete(id: string) {
    const { error } = await supabase.from("verses").delete().eq("id", id).eq("user_id", userId).eq("ministry_id", ministryId)
    if (!error) setEntries(prev => prev.filter(e => e.id !== id))
    setOpenMenuId(null)
  }
  function toggleExpand(id: string) { setExpandedIds(prev => { const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); return n }) }
  const inputBase: React.CSSProperties = { display: "block", width: "100%", background: "transparent", border: "none", outline: "none", fontFamily: "inherit" }

  return (
    <div>
      <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 20 }}>
        <div style={{ flex: 1, position: "relative" }}>
          <Search size={14} style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", color: "#8A8497", pointerEvents: "none" }} />
          <input type="text" placeholder="Search verses…" value={searchQuery} onChange={e => setSearchQuery(e.target.value)} style={{ width: "100%", paddingLeft: 36, paddingRight: 12, paddingTop: 9, paddingBottom: 9, background: "#FBF8F2", border: "1px solid #ECE8DE", borderRadius: 10, fontSize: 13, color: "#13101A", outline: "none", fontFamily: "inherit" }} />
        </div>
        <button onClick={openNew} style={{ display: "flex", alignItems: "center", gap: 6, padding: "9px 16px", background: "#3E1540", color: "#F6F4EF", borderRadius: 10, border: "none", fontSize: 13, fontWeight: 500, cursor: "pointer", flexShrink: 0, whiteSpace: "nowrap" }}>
          <Plus size={14} />Add verse
        </button>
      </div>

      {showEditor && (
        <div style={{ background: "white", borderRadius: 16, border: "1px solid #ECE8DE", padding: "26px 26px 20px", marginBottom: 20, boxShadow: "0 2px 12px rgba(19,16,26,0.06)" }}>
          <input type="text" placeholder="Reference (e.g. John 3:16)" value={draft.reference} onChange={e => setDraft(d => ({ ...d, reference: e.target.value }))} autoFocus style={{ ...inputBase, fontFamily: "var(--font-instrument-serif)", fontSize: 20, color: "#3E1540", marginBottom: 12, letterSpacing: "-0.01em" }} />
          <textarea placeholder="Verse text…" value={draft.verse_text} onChange={e => setDraft(d => ({ ...d, verse_text: e.target.value }))} rows={3} style={{ display: "block", width: "100%", fontFamily: "var(--font-instrument-serif)", fontStyle: "italic", fontSize: 15, color: "#13101A", lineHeight: 1.7, background: "transparent", border: "none", borderBottom: "1px solid #ECE8DE", outline: "none", resize: "none", marginBottom: 16, paddingBottom: 12 }} />
          <textarea placeholder="Why this verse convicted you…" value={draft.note} onChange={e => setDraft(d => ({ ...d, note: e.target.value }))} rows={4} style={{ display: "block", width: "100%", fontSize: 14, color: "#5A5466", lineHeight: 1.8, background: "transparent", border: "none", outline: "none", resize: "vertical", marginBottom: 16, fontFamily: "inherit" }} />
          <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
            <button onClick={() => { setShowEditor(false); setEditingEntry(null) }} style={{ padding: "7px 14px", borderRadius: 8, border: "1px solid #ECE8DE", background: "transparent", fontSize: 13, color: "#5A5466", cursor: "pointer" }}>Cancel</button>
            <button onClick={handleSave} disabled={saving || !draft.reference.trim() || !draft.verse_text.trim()} style={{ padding: "7px 14px", borderRadius: 8, background: "#3E1540", color: "#F6F4EF", border: "none", fontSize: 13, fontWeight: 500, cursor: "pointer", opacity: saving || !draft.reference.trim() || !draft.verse_text.trim() ? 0.5 : 1 }}>{saving ? "Saving…" : editingEntry ? "Update" : "Save verse"}</button>
          </div>
        </div>
      )}

      {loading ? (
        <Spinner />
      ) : filtered.length === 0 ? (
        <div style={{ textAlign: "center", paddingTop: 48 }}>
          <BookOpen size={28} style={{ color: "#C4C4C4", margin: "0 auto 12px" }} />
          {searchQuery.trim() ? <p style={{ fontSize: 13, color: "#8A8497" }}>No verses match &ldquo;{searchQuery}&rdquo;</p> : (
            <><p style={{ fontFamily: "var(--font-instrument-serif)", fontSize: 17, color: "#13101A", marginBottom: 4 }}>No verses saved yet</p><p style={{ fontSize: 13, color: "#8A8497" }}>Save a verse that has spoken to you.</p></>
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
              <div key={entry.id} style={{ background: "white", borderRadius: 14, border: "1px solid #ECE8DE", boxShadow: "0 1px 3px rgba(19,16,26,0.04)" }}>
                <div style={{ padding: isExpanded ? "20px 20px 0" : "14px 18px", cursor: isFirst ? "default" : "pointer" }} onClick={() => { if (!isFirst) { toggleExpand(entry.id); setOpenMenuId(null) } }}>
                  <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 10 }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <p style={{ fontFamily: "var(--font-instrument-serif)", fontSize: isExpanded ? 18 : 15, fontWeight: 400, color: "#3E1540", letterSpacing: "-0.01em", margin: 0, marginBottom: !isExpanded ? 3 : 0 }}>{entry.reference}</p>
                      {!isExpanded && <p style={{ fontFamily: "var(--font-instrument-serif)", fontStyle: "italic", fontSize: 13, color: "#5A5466", lineHeight: 1.5, margin: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{preview}</p>}
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 4, flexShrink: 0 }}>
                      <span style={{ fontFamily: "ui-monospace, monospace", fontSize: 10, color: "#8A8497", letterSpacing: "0.04em", whiteSpace: "nowrap" }}>{fmtJournalDate(entry.created_at)}</span>
                      <div style={{ position: "relative" }}>
                        <button onClick={e => { e.stopPropagation(); setOpenMenuId(menuOpen ? null : entry.id) }} style={{ width: 26, height: 26, borderRadius: 6, background: menuOpen ? "#F4F1E8" : "transparent", border: "none", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", color: "#8A8497" }}><MoreHorizontal size={15} /></button>
                        {menuOpen && (
                          <div style={{ position: "absolute", right: 0, top: "calc(100% + 4px)", background: "white", border: "1px solid #ECE8DE", borderRadius: 9, boxShadow: "0 4px 14px rgba(19,16,26,0.10)", zIndex: 20, minWidth: 130, overflow: "hidden" }}>
                            <button onClick={e => { e.stopPropagation(); openEdit(entry) }} style={{ display: "flex", alignItems: "center", gap: 8, padding: "9px 13px", width: "100%", background: "transparent", border: "none", fontSize: 13, color: "#13101A", cursor: "pointer" }}><Edit3 size={13} />Edit</button>
                            <div style={{ height: 1, background: "#F0EDE8" }} />
                            <button onClick={e => { e.stopPropagation(); handleDelete(entry.id) }} style={{ display: "flex", alignItems: "center", gap: 8, padding: "9px 13px", width: "100%", background: "transparent", border: "none", fontSize: 13, color: "#EF4444", cursor: "pointer" }}><Trash2 size={13} />Delete</button>
                          </div>
                        )}
                      </div>
                      {!isFirst && <span style={{ color: "#C4C4C4", display: "flex" }}>{isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}</span>}
                    </div>
                  </div>
                </div>
                {isExpanded && (
                  <div style={{ padding: "14px 20px 20px" }}>
                    <p style={{ fontFamily: "var(--font-instrument-serif)", fontStyle: "italic", fontSize: 16, color: "#13101A", lineHeight: 1.75, margin: 0, marginBottom: entry.note ? 16 : 0 }}>
                      &ldquo;{entry.verse_text}&rdquo;
                    </p>
                    {entry.note && (
                      <div style={{ paddingTop: 14, borderTopWidth: 1, borderTopStyle: "solid", borderTopColor: "#F5F2EC" }}>
                        <p style={{ fontFamily: "ui-monospace, monospace", fontSize: 10, color: "#8A8497", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 6, marginTop: 0 }}>Reflection</p>
                        <p style={{ fontSize: 14, color: "#5A5466", lineHeight: 1.8, whiteSpace: "pre-wrap", margin: 0 }}>{entry.note}</p>
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

export function JournalSection({ userId, ministryId }: { userId: string; ministryId: string }) {
  const [journalTab, setJournalTab] = useState<'devotionals' | 'prayers' | 'verses'>('devotionals')
  const tabs: { id: 'devotionals' | 'prayers' | 'verses'; label: string }[] = [
    { id: 'devotionals', label: 'Devotionals' },
    { id: 'prayers', label: 'Prayers' },
    { id: 'verses', label: 'Verses' },
  ]
  return (
    <>
      {/* ── Mobile: tab strip + single column ── */}
      <div className="md:hidden" style={{ padding: "24px 24px 52px" }}>
        <div style={{ display: "flex", gap: 0, marginBottom: 24, borderBottomWidth: 1, borderBottomStyle: "solid", borderBottomColor: "#ECE8DE" }}>
          {tabs.map(t => (
            <button key={t.id} onClick={() => setJournalTab(t.id)} style={{ padding: "8px 18px", background: "transparent", border: "none", borderBottomWidth: 2, borderBottomStyle: "solid", borderBottomColor: journalTab === t.id ? "#3E1540" : "transparent", color: journalTab === t.id ? "#3E1540" : "#8A8497", fontSize: 13, fontWeight: journalTab === t.id ? 600 : 400, cursor: "pointer", marginBottom: -1, letterSpacing: "-0.01em" }}>
              {t.label}
            </button>
          ))}
        </div>
        {journalTab === 'devotionals' && <JournalDevotionalsTab userId={userId} ministryId={ministryId} />}
        {journalTab === 'prayers' && <JournalPrayersTab userId={userId} ministryId={ministryId} />}
        {journalTab === 'verses' && <JournalVersesTab userId={userId} ministryId={ministryId} />}
      </div>

      {/* ── Desktop: two-column (devotionals left, prayers right) ── */}
      <div className="hidden md:grid" style={{ padding: "28px 28px 52px", gridTemplateColumns: "1fr 320px", gap: 28, alignItems: "start" }}>
        <JournalDevotionalsTab userId={userId} ministryId={ministryId} />
        <JournalPrayersTab userId={userId} ministryId={ministryId} />
      </div>
    </>
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
  onAvatarChange?: (url: string) => void
  activeSection: "spiritual-profile" | "journal"
  onSectionChange: (s: "spiritual-profile" | "journal") => void
}) {
  const supabase = createClient()
  const [profile, setProfile] = useState<Profile>(initialProfile)
  const [ministryIsPublic, setMinistryIsPublic] = useState(initialMinistryIsPublic ?? false)
  const [togglingPublic, setTogglingPublic] = useState(false)
  const [editing, setEditing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [uploadingAvatar, setUploadingAvatar] = useState(false)
  const [avatarError, setAvatarError] = useState<string | null>(null)
  const [draft, setDraft] = useState({
    about_me: initialProfile.about_me ?? "",
    bible_verse: initialProfile.bible_verse ?? "",
    prayer_request: initialProfile.prayer_request ?? "",
    pray_for_me: initialProfile.pray_for_me ?? "",
  })

  async function handleTogglePublic() {
    if (!isAdmin || togglingPublic) return
    setTogglingPublic(true)
    const next = !ministryIsPublic
    const { error } = await updateMinistryPublic(next)
    if (!error) setMinistryIsPublic(next)
    setTogglingPublic(false)
  }

  const startEdit = () => {
    setDraft({
      about_me: profile.about_me ?? "",
      bible_verse: profile.bible_verse ?? "",
      prayer_request: profile.prayer_request ?? "",
      pray_for_me: profile.pray_for_me ?? "",
    })
    setEditing(true)
  }

  const cancelEdit = () => setEditing(false)

  const saveEdit = useCallback(async () => {
    setSaving(true)
    const { data, error } = await supabase
      .from("profiles")
      .update({
        about_me: draft.about_me || null,
        bible_verse: draft.bible_verse || null,
        prayer_request: draft.prayer_request || null,
        pray_for_me: draft.pray_for_me || null,
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

  async function handleAvatarUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setUploadingAvatar(true)
    setAvatarError(null)
    // Derive extension; default to png for extensionless files (e.g. iOS share)
    const raw = file.name.split(".").pop()?.toLowerCase()
    const ext = raw && raw !== file.name.toLowerCase() ? raw : "png"
    const fileName = `${userId}.${ext}`
    const { data: uploadData, error } = await supabase.storage
      .from("profile-images")
      .upload(fileName, file, { upsert: true, contentType: file.type || "image/png" })
    if (error) {
      setAvatarError(error.message)
      setUploadingAvatar(false)
      e.target.value = ""
      return
    }
    if (uploadData) {
      const { data: { publicUrl } } = supabase.storage
        .from("profile-images")
        .getPublicUrl(uploadData.path)
      await supabase.from("profiles").update({ avatar_url: publicUrl }).eq("id", userId).eq("ministry_id", initialProfile.ministry_id ?? "")
      setProfile((p) => ({ ...p, avatar_url: publicUrl }))
      onAvatarChange?.(publicUrl)
    }
    setUploadingAvatar(false)
    e.target.value = ""
  }

  const fields = [
    { key: "about_me" as const, label: "About me", placeholder: "Tell the community about yourself…" },
    { key: "bible_verse" as const, label: "Current Bible verse", placeholder: "What verse are you meditating on?" },
    { key: "prayer_request" as const, label: "Prayer request", placeholder: "Share what you'd like prayer for…" },
    { key: "pray_for_me" as const, label: "How to pray for me this week", placeholder: "Specific ways others can intercede…" },
  ]

  function FieldCard({ fieldKey, label, placeholder }: { fieldKey: keyof typeof draft; label: string; placeholder: string }) {
    return (
      <div className="bg-white rounded-2xl border border-[#ECE8DE] p-5 shadow-[0_1px_3px_rgba(19,16,26,0.04)] md:rounded-xl md:border-[#E5E0D2] md:bg-[#FBF8F2]">
        <div style={MONO_STYLE}>{fieldKey === "about_me" ? "About" : fieldKey === "bible_verse" ? "Verse" : "Prayer"}</div>
        <p style={{ fontFamily: "var(--font-instrument-serif)", fontSize: "15px", color: "#3E1540", fontWeight: 400, marginTop: "4px", marginBottom: "8px", letterSpacing: "-0.01em" }}>
          {label}
        </p>
        {editing ? (
          <textarea
            value={draft[fieldKey]}
            onChange={(e) => setDraft((d) => ({ ...d, [fieldKey]: e.target.value }))}
            placeholder={placeholder}
            rows={3}
            className="w-full text-[13px] text-[#5A5466] leading-relaxed bg-transparent resize-none focus:outline-none placeholder:text-[#C4C4C4]"
          />
        ) : (
          <p className="text-[14px] text-[#5A5466] leading-relaxed whitespace-pre-wrap">
            {profile[fieldKey] || <span className="text-[#C4C4C4] italic text-[13px]">{placeholder}</span>}
          </p>
        )}
      </div>
    )
  }

  return (
    <div className="pb-6 md:pb-0">

      {/* Desktop Topbar */}
      <DesktopTopbar
        crumbs={["Central", "Profile"]}
        right={
          activeSection === "spiritual-profile" ? (
            <div className="hidden md:flex items-center gap-2">
              {editing ? (
                <>
                  <button onClick={cancelEdit} className="flex items-center gap-1.5 px-3.5 py-1.5 border border-[#E5E0D2] rounded-lg text-[12px] text-[#5A5466] hover:bg-[#F4F1E8] transition-colors">
                    <X className="w-3.5 h-3.5" />Cancel
                  </button>
                  <button onClick={saveEdit} disabled={saving} className="flex items-center gap-1.5 px-3.5 py-1.5 bg-[#13101A] text-[#F6F4EF] rounded-lg text-[12px] font-medium hover:bg-[#2D0F2E] transition-colors disabled:opacity-60">
                    <Check className="w-3.5 h-3.5" />{saving ? "Saving…" : "Save"}
                  </button>
                </>
              ) : (
                <button onClick={startEdit} className="flex items-center gap-1.5 px-3.5 py-1.5 bg-[#13101A] text-[#F6F4EF] rounded-lg text-[12px] font-medium hover:bg-[#2D0F2E] transition-colors">
                  <Edit3 className="w-3.5 h-3.5" />Edit profile
                </button>
              )}
            </div>
          ) : null
        }
      />

      {/* Mobile header */}
      <div className="flex items-center gap-2.5 px-5 pt-14 pb-5 md:hidden">
        <a href="/landing" className="flex items-center gap-2.5" style={{ textDecoration: "none" }}>
          <RingCrossLogo size={26} />
          <span style={{ fontFamily: "var(--font-instrument-serif)", fontSize: "28px", color: "#13101A", letterSpacing: "-0.01em", lineHeight: 1 }}>{ministryName}</span>
        </a>
      </div>

      {/* ── Desktop: hero ── */}
      <div className="hidden md:block px-7 pt-7 pb-0">
        <div
          className="relative overflow-hidden rounded-2xl text-[#F6F4EF]"
          style={{
            background: "linear-gradient(135deg, #4A1B4D 0%, #3E1540 60%, #1A0820 100%)",
            padding: "40px 40px 36px",
            display: "grid", gridTemplateColumns: "auto 1fr", gap: "32px", alignItems: "center",
          }}
        >
          <div className="absolute rounded-full pointer-events-none" style={{ top: -120, right: 100, width: 380, height: 380, background: "radial-gradient(circle, rgba(246,244,239,0.14), transparent 60%)" }} />
          <div className="absolute inset-0 pointer-events-none" style={{ opacity: 0.06, backgroundImage: "radial-gradient(circle, white 1px, transparent 1px)", backgroundSize: "16px 16px" }} />

          {/* Avatar — label wraps input for reliable iOS file picker */}
          <label
            className="relative group flex-shrink-0"
            style={{ width: 110, height: 110, borderRadius: 22, background: "rgba(255,255,255,0.1)", border: "1px solid rgba(255,255,255,0.2)", display: "grid", placeItems: "center", overflow: "hidden", cursor: uploadingAvatar ? "not-allowed" : "pointer" }}
            aria-label="Change profile photo"
          >
            <input
              type="file"
              accept="image/*"
              style={{ position: "absolute", width: 0, height: 0, opacity: 0, overflow: "hidden" }}
              onChange={handleAvatarUpload}
              disabled={uploadingAvatar}
            />
            {profile.avatar_url ? (
              <img src={profile.avatar_url} alt="Profile" className="w-full h-full object-cover" />
            ) : (
              <span style={{ fontFamily: "var(--font-instrument-serif)", fontSize: "44px" }}>{getInitials(profile.name)}</span>
            )}
            <div className="absolute inset-0 bg-black/30 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
              <Camera className="w-6 h-6 text-white" />
            </div>
            {uploadingAvatar && (
              <div className="absolute inset-0 bg-black/40 flex items-center justify-center">
                <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
              </div>
            )}
          </label>

          {/* Name + details */}
          <div className="relative">
            {avatarError && (
              <p style={{ fontSize: 11, color: "#FCA5A5", marginBottom: 6, maxWidth: 220 }}>{avatarError}</p>
            )}
            <h1 style={{ margin: 0, fontFamily: "var(--font-instrument-serif)", fontWeight: 400, fontSize: "52px", lineHeight: 1, letterSpacing: "-0.01em" }}>
              {profile.name}
            </h1>
            <div style={{ marginTop: 12, display: "flex", gap: 24, color: "rgba(246,244,239,0.85)", fontSize: 13.5 }}>
              <div>
                <span style={{ color: "rgba(246,244,239,0.55)" }}>Role · </span>
                {profile.role.charAt(0).toUpperCase() + profile.role.slice(1)}
              </div>
              {profile.graduation_year && (
                <div>
                  <span style={{ color: "rgba(246,244,239,0.55)" }}>Class · </span>
                  {profile.graduation_year}
                </div>
              )}
              <div style={{ opacity: 0.7, fontSize: 13 }}>{profile.email}</div>
            </div>
            {profile.pray_for_me && (
              <div style={{ marginTop: "22px", paddingTop: "18px", borderTop: "1px solid rgba(255,255,255,0.12)", maxWidth: "480px" }}>
                <div style={{ fontSize: "10px", letterSpacing: "1.2px", textTransform: "uppercase", opacity: 0.6, marginBottom: "6px" }}>This week</div>
                <div style={{ fontFamily: "var(--font-instrument-serif)", fontStyle: "italic", fontSize: "17px", lineHeight: 1.4, opacity: 0.92 }}>
                  &ldquo;{profile.pray_for_me}&rdquo;
                </div>
              </div>
            )}
          </div>

        </div>
      </div>


      {/* Mobile identity card */}
      <div className="md:hidden px-5">
        <div className="rounded-2xl overflow-hidden border border-[#ECE8DE] shadow-[0_2px_8px_rgba(19,16,26,0.06)] mb-5">
          <div className="bg-[#3E1540] px-6 pt-8 pb-8 relative overflow-hidden">
            <div className="absolute -top-[70px] left-1/2 -translate-x-1/2 w-[300px] h-[300px] rounded-full bg-[radial-gradient(circle,rgba(246,244,239,0.16)_0%,transparent_65%)]" />
            <div className="relative z-10 flex flex-col items-center gap-4">
              <label
                className="relative w-24 h-24 rounded-full overflow-hidden bg-[#3E1540] border-[3px] border-white/20 group flex-shrink-0"
                style={{ cursor: uploadingAvatar ? "not-allowed" : "pointer", display: "block" }}
                aria-label="Change profile photo"
              >
                <input
                  type="file"
                  accept="image/*"
                  style={{ position: "absolute", width: 0, height: 0, opacity: 0, overflow: "hidden" }}
                  onChange={handleAvatarUpload}
                  disabled={uploadingAvatar}
                />
                {profile.avatar_url ? (
                  <img src={profile.avatar_url} alt="Profile" className="w-full h-full object-cover" />
                ) : (
                  <span className="flex items-center justify-center w-full h-full text-[#F6F4EF]" style={{ fontFamily: "var(--font-instrument-serif)", fontSize: "32px", fontWeight: 400 }}>
                    {getInitials(profile.name)}
                  </span>
                )}
                <div className="absolute inset-0 bg-black/30 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                  <Camera className="w-5 h-5 text-white" />
                </div>
                {uploadingAvatar && (
                  <div className="absolute inset-0 bg-black/40 flex items-center justify-center">
                    <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  </div>
                )}
              </label>
              <div className="text-center">
                {avatarError && (
                  <p style={{ fontSize: 11, color: "#FCA5A5", marginBottom: 6 }}>{avatarError}</p>
                )}
                <h2 style={{ fontFamily: "var(--font-instrument-serif)", fontSize: "26px", color: "#F6F4EF", letterSpacing: "-0.02em", lineHeight: 1.1, marginBottom: "10px" }}>{profile.name}</h2>
                <div className="flex items-center justify-center gap-2 flex-wrap mb-2">
                  <span className="text-[10px] bg-white/15 text-[#F6F4EF] font-semibold px-2.5 py-1 rounded-full uppercase tracking-wide">{profile.role}</span>
                  {profile.graduation_year && <span className="text-[12px] text-[#8A8497] font-medium">Class of {profile.graduation_year}</span>}
                </div>
                <p className="text-[12px] text-[#8A8497]">{profile.email}</p>
              </div>
            </div>
          </div>
          <div className="px-4 py-2.5 bg-[#FDFBF7] border-t border-[#ECE8DE] flex items-center justify-between gap-2">
            <div className="flex gap-1">
              <button
                style={{ padding: "4px 10px", borderRadius: 6, fontSize: 10, fontWeight: 600, background: "#3E1540", color: "#F6F4EF", border: "none", letterSpacing: "0.08em", textTransform: "uppercase" as const }}
              >
                Profile
              </button>
            </div>
            {activeSection === "spiritual-profile" && (
              <div className="flex items-center gap-2">
                {editing ? (
                  <>
                    <button onClick={cancelEdit} className="w-8 h-8 rounded-full bg-[#F2EDE0] flex items-center justify-center hover:bg-[#ECE8DE] transition-colors">
                      <X className="w-3.5 h-3.5 text-[#5A5466]" />
                    </button>
                    <button onClick={saveEdit} disabled={saving} className="flex items-center gap-1.5 bg-[#3E1540] text-white text-[12px] font-semibold px-4 py-1.5 rounded-full hover:bg-[#2D0F2E] transition-colors disabled:opacity-60">
                      <Check className="w-3 h-3" />{saving ? "Saving…" : "Save"}
                    </button>
                  </>
                ) : (
                  <button onClick={startEdit} className="flex items-center gap-1.5 text-[#3E1540] text-[12px] font-semibold px-4 py-1.5 rounded-full border border-[#3E1540]/25 bg-[#3E1540]/5 hover:bg-[#3E1540]/10 transition-colors">
                    <Edit3 className="w-3 h-3" />Edit
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── Field cards ── */}
      {/* Desktop: 2x2 grid */}
      <div className="hidden md:grid px-7 py-6 gap-4" style={{ gridTemplateColumns: "1fr 1fr" }}>
        {fields.map(({ key, label, placeholder }) => (
          <FieldCard key={key} fieldKey={key} label={label} placeholder={placeholder} />
        ))}
      </div>

      {/* Mobile: stacked sections */}
      <div className="md:hidden px-5 pb-6">
          <div className="mb-5">
            <p className="mb-3 ml-0.5" style={{ fontFamily: "var(--font-instrument-serif)", fontSize: "19px", color: "#13101A", fontWeight: 400, letterSpacing: "-0.01em", lineHeight: 1 }}>Your story</p>
            <div className="flex flex-col gap-3">
              {fields.slice(0, 2).map(({ key, label, placeholder }) => (
                <div key={key} className="bg-white rounded-2xl border border-[#ECE8DE] p-5 shadow-[0_1px_3px_rgba(19,16,26,0.04)]">
                  <p style={{ fontFamily: "var(--font-instrument-serif)", fontSize: "15px", color: "#3E1540", fontWeight: 400, marginBottom: "8px", letterSpacing: "-0.01em" }}>{label}</p>
                  {editing ? (
                    <textarea value={draft[key]} onChange={(e) => setDraft((d) => ({ ...d, [key]: e.target.value }))} placeholder={placeholder} rows={3} className="w-full text-[13px] text-[#5A5466] leading-relaxed bg-transparent resize-none focus:outline-none placeholder:text-[#C4C4C4]" />
                  ) : (
                    <p className="text-[14px] text-[#5A5466] leading-relaxed whitespace-pre-wrap">{profile[key] || <span className="text-[#C4C4C4] italic text-[13px]">{placeholder}</span>}</p>
                  )}
                </div>
              ))}
            </div>
          </div>
          <div className="mb-6">
            <p className="mb-3 ml-0.5" style={{ fontFamily: "var(--font-instrument-serif)", fontSize: "19px", color: "#13101A", fontWeight: 400, letterSpacing: "-0.01em", lineHeight: 1 }}>Prayer</p>
            <div className="flex flex-col gap-3">
              {fields.slice(2).map(({ key, label, placeholder }) => (
                <div key={key} className="bg-white rounded-2xl border border-[#ECE8DE] p-5 shadow-[0_1px_3px_rgba(19,16,26,0.04)]">
                  <p style={{ fontFamily: "var(--font-instrument-serif)", fontSize: "15px", color: "#3E1540", fontWeight: 400, marginBottom: "8px", letterSpacing: "-0.01em" }}>{label}</p>
                  {editing ? (
                    <textarea value={draft[key]} onChange={(e) => setDraft((d) => ({ ...d, [key]: e.target.value }))} placeholder={placeholder} rows={3} className="w-full text-[13px] text-[#5A5466] leading-relaxed bg-transparent resize-none focus:outline-none placeholder:text-[#C4C4C4]" />
                  ) : (
                    <p className="text-[14px] text-[#5A5466] leading-relaxed whitespace-pre-wrap">{profile[key] || <span className="text-[#C4C4C4] italic text-[13px]">{placeholder}</span>}</p>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
    </div>
  )
}
