"use client"

import { useState, useEffect, useRef, useCallback } from "react"
import { ChevronRight, ChevronDown, X, Check, CheckCircle2, ImageIcon, Trash2, Bell, ArrowLeft, Calendar, File, MoreHorizontal, Plus, Users, Edit3 } from "lucide-react"
import { createClient } from "@/lib/supabase"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Spinner, EmptyState } from "../components/shared"
import { getInitials, getAvatarColor, formatRelativeTime, audienceLabel, formatDate } from "../utils"
import { DesktopTopbar } from "../components/desktop-nav"
import type { AnnouncementsTabProps, AnnouncementDetailProps, AnnouncementCardProps, CreateAnnouncementModalProps, Announcement, EnrichedAnnouncement } from "../types"

const AUDIENCE_OPTIONS = [
  { value: "all", label: "Everyone" },
  { value: "2025", label: "Class of 2025" },
  { value: "2026", label: "Class of 2026" },
  { value: "2027", label: "Class of 2027" },
  { value: "2028", label: "Class of 2028" },
  { value: "group", label: "Specific Group" },
]

export function CreateAnnouncementModal({ userId, ministryId, existing, onClose, onSuccess }: CreateAnnouncementModalProps) {
  const supabase = createClient()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const isEditing = !!existing

  const [title, setTitle] = useState(existing?.title ?? "")
  const [body, setBody] = useState(existing?.body ?? "")
  const [audience, setAudience] = useState(existing?.audience ?? "all")
  const [isEvent, setIsEvent] = useState(existing?.is_event ?? false)
  const [imageFile, setImageFile] = useState<File | null>(null)
  const [imagePreview, setImagePreview] = useState<string | null>(existing?.image_url ?? null)
  const [submitting, setSubmitting] = useState(false)
  const [success, setSuccess] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function handleImageChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setImageFile(file)
    setImagePreview(URL.createObjectURL(file))
  }

  function removeImage() {
    setImageFile(null)
    setImagePreview(null)
    if (fileInputRef.current) fileInputRef.current.value = ""
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!title.trim() || !body.trim()) {
      setError("Title and body are required.")
      return
    }

    setSubmitting(true)
    setError(null)

    // Resolve image URL
    let imageUrl: string | null = null
    if (imageFile) {
      // New file picked — upload it
      const ext = imageFile.name.split(".").pop()
      const fileName = `${Date.now()}.${ext}`
      const { data: uploadData, error: uploadError } = await supabase.storage
        .from("announcement-images")
        .upload(fileName, imageFile, { upsert: true })

      if (!uploadError && uploadData) {
        const { data: { publicUrl } } = supabase.storage
          .from("announcement-images")
          .getPublicUrl(uploadData.path)
        imageUrl = publicUrl
      }
    } else if (imagePreview) {
      // No new file but preview is still set — keep existing URL
      imageUrl = imagePreview
    }
    // else imageUrl stays null (removed or never set)

    if (isEditing && existing) {
      const { data, error: updateError } = await supabase
        .from("announcements")
        .update({
          title: title.trim(),
          body: body.trim(),
          audience,
          is_event: isEvent,
          image_url: imageUrl,
        })
        .eq("id", existing.id)
        .select()
        .maybeSingle()

      if (updateError) {
        setError(updateError.message)
        setSubmitting(false)
        return
      }

      setSuccess(true)
      setTimeout(() => {
        // data may be null with maybeSingle(); fall back to merging existing fields
        onSuccess((data ?? { ...existing, title: title.trim(), body: body.trim(), audience, is_event: isEvent, image_url: imageUrl }) as Announcement)
        onClose()
      }, 1000)
    } else {
      const { data, error: insertError } = await supabase
        .from("announcements")
        .insert({
          title: title.trim(),
          body: body.trim(),
          audience,
          is_event: isEvent,
          is_pinned: false,
          image_url: imageUrl,
          created_by: userId,
          ministry_id: ministryId,
        })
        .select()
        .single()

      if (insertError) {
        setError(insertError.message)
        setSubmitting(false)
        return
      }

      setSuccess(true)
      setTimeout(() => {
        onSuccess(data as Announcement)
        onClose()
      }, 1200)
    }
  }

  // Success screen
  if (success) {
    return (
      <div className="fixed inset-0 z-[100] bg-white flex flex-col items-center justify-center gap-4 md:left-[296px]">
        <div className="w-16 h-16 rounded-full bg-[#3E1540]/15 flex items-center justify-center">
          <CheckCircle2 className="w-8 h-8 text-[#3E1540]" />
        </div>
        <div className="text-center">
          <p className="text-[16px] font-bold text-foreground">
            {isEditing ? "Announcement updated!" : "Announcement posted!"}
          </p>
          <p className="text-[13px] text-muted-foreground mt-1">
            {isEditing ? "Your changes have been saved." : "Your announcement is now live."}
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="fixed inset-0 z-[60] bg-white flex flex-col md:bg-black/20 md:backdrop-blur-sm md:items-center md:justify-center">
    <div className="flex flex-col w-full h-full bg-white md:h-auto md:max-h-[88vh] md:max-w-[560px] md:rounded-2xl md:shadow-2xl md:overflow-hidden">

      {/* ── Top nav bar ── */}
      <div className="flex items-center gap-3 px-5 pt-12 pb-4 md:pt-5 border-b border-[#ECE8DE] bg-white flex-shrink-0">
        <button
          onClick={onClose}
          className="w-9 h-9 rounded-full bg-muted/60 flex items-center justify-center hover:bg-muted transition-colors flex-shrink-0"
        >
          <X className="w-4 h-4 text-foreground" />
        </button>
        <h1 className="text-[17px] font-bold text-foreground tracking-tight">
          {isEditing ? "Edit Announcement" : "New Announcement"}
        </h1>
      </div>

      {/* ── Scrollable form fields ── */}
      <div className="flex-1 overflow-y-auto min-h-0">
        <form
          id="ann-form"
          onSubmit={handleSubmit}
          className="px-5 py-6 flex flex-col gap-5"
        >
          {error && (
            <div className="rounded-xl bg-destructive/8 px-4 py-3 text-[13px] text-destructive font-medium">
              {error}
            </div>
          )}

          {/* Title */}
          <div className="flex flex-col gap-1.5">
            <label className="text-[12px] font-medium text-[#8A8497]">Title</label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Announcement title…"
              required
              className="w-full px-4 py-3 rounded-xl border border-[#EFEFEF] bg-[#FBF8F2] text-[14px] text-[#13101A] placeholder:text-[#C4C4C4] focus:outline-none focus:ring-2 focus:ring-[#3E1540]/20 focus:border-[#3E1540]/40 transition-all"
            />
          </div>

          {/* Body */}
          <div className="flex flex-col gap-1.5">
            <label className="text-[12px] font-medium text-[#8A8497]">Body</label>
            <textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder="Write the full announcement here…"
              required
              rows={5}
              className="w-full px-4 py-3 rounded-xl border border-[#EFEFEF] bg-[#FBF8F2] text-[14px] text-[#13101A] placeholder:text-[#C4C4C4] focus:outline-none focus:ring-2 focus:ring-[#3E1540]/20 focus:border-[#3E1540]/40 transition-all resize-none"
            />
          </div>

          {/* Audience */}
          <div className="flex flex-col gap-2.5">
            <label className="text-[12px] font-medium text-[#8A8497]">Audience</label>
            <div className="flex flex-wrap gap-2">
              {AUDIENCE_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setAudience(opt.value)}
                  className={`px-3 py-1.5 rounded-full text-[12px] font-semibold border transition-all ${
                    audience === opt.value
                      ? "bg-[#3E1540] text-white border-[#3E1540]"
                      : "bg-white text-muted-foreground border-[#E5E3F0] hover:border-[#3E1540]/40"
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          {/* Is Event toggle */}
          <div className="flex items-center justify-between bg-[#3E1540]/4 rounded-xl px-4 py-3.5">
            <div>
              <p className="text-[13px] font-semibold text-foreground">This is an event</p>
              <p className="text-[11px] text-muted-foreground/60 mt-0.5">Shows an RSVP button on the card</p>
            </div>
            <button
              type="button"
              onClick={() => setIsEvent((v) => !v)}
              className={`relative w-11 h-6 rounded-full transition-colors duration-200 flex-shrink-0 ${
                isEvent ? "bg-[#3E1540]" : "bg-muted-foreground/20"
              }`}
            >
              <span
                className={`absolute top-0.5 w-5 h-5 rounded-full bg-white shadow-sm transition-all duration-200 ${
                  isEvent ? "left-[22px]" : "left-0.5"
                }`}
              />
            </button>
          </div>

          {/* Image upload */}
          <div className="flex flex-col gap-2">
            <label className="text-[12px] font-medium text-[#8A8497]">
              Image <span className="text-[#C4C4C4]">(optional)</span>
            </label>
            {imagePreview ? (
              <div className="relative rounded-xl overflow-hidden">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={imagePreview} alt="Preview" className="w-full h-44 object-cover" />
                <button
                  type="button"
                  onClick={removeImage}
                  className="absolute top-2 right-2 w-7 h-7 rounded-full bg-black/50 flex items-center justify-center hover:bg-black/70 transition-colors"
                >
                  <X className="w-3.5 h-3.5 text-white" />
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="w-full h-24 rounded-xl border-2 border-dashed border-[#3E1540]/20 flex flex-col items-center justify-center gap-2 text-muted-foreground/50 hover:border-[#3E1540]/40 hover:text-[#3E1540]/60 transition-all"
              >
                <ImageIcon className="w-6 h-6" />
                <span className="text-[12px] font-medium">Tap to add image</span>
              </button>
            )}
            <input ref={fileInputRef} type="file" accept="image/*" onChange={handleImageChange} className="hidden" />
          </div>
        </form>
      </div>

      {/* ── Sticky submit button — always visible at the bottom ── */}
      <div className="bg-white border-t border-[#ECE8DE] px-5 py-4">
        <button
          type="submit"
          form="ann-form"
          disabled={submitting}
          className="w-full bg-[#3E1540] hover:bg-[#2D0F2E] disabled:opacity-60 text-white font-bold py-4 rounded-xl transition-colors text-[14px] tracking-wide"
        >
          {submitting
            ? isEditing ? "Saving…" : "Posting…"
            : isEditing ? "Save Changes" : "Post Announcement"}
        </button>
      </div>

    </div>
    </div>
  )
}

export function AnnouncementsTab({ userId, userRole, userGradYear, ministryId, ministryName }: AnnouncementsTabProps) {
  const supabase = createClient()
  const [announcements, setAnnouncements] = useState<EnrichedAnnouncement[]>([])
  const [loading, setLoading] = useState(true)
  const [showCreate, setShowCreate] = useState(false)
  const [editingAnn, setEditingAnn] = useState<EnrichedAnnouncement | null>(null)
  const [compact, setCompact] = useState(false)

  const isLeaderOrAdmin = ["leader", "admin"].includes(userRole.toLowerCase())

  const loadAnnouncements = useCallback(async () => {
    let annQuery = supabase
      .from("announcements")
      .select("*")
      .eq("ministry_id", ministryId)
      .order("is_pinned", { ascending: false })
      .order("created_at", { ascending: false })

    if (!isLeaderOrAdmin) {
      const audienceFilter = userGradYear
        ? `audience.is.null,audience.eq.all,audience.eq.${userGradYear},audience.eq.group`
        : `audience.is.null,audience.eq.all,audience.eq.group`
      annQuery = annQuery.or(audienceFilter)
    }

    const { data: annData } = await annQuery

    const anns: Announcement[] = annData ?? []

    if (anns.length === 0) {
      setAnnouncements([])
      setLoading(false)
      return
    }

    const ids = anns.map((a) => a.id)

    // Fetch view counts, RSVP data in parallel
    const [{ data: viewRows }, { data: rsvpRows }] = await Promise.all([
      supabase.from("announcement_views").select("announcement_id").in("announcement_id", ids),
      supabase.from("rsvps").select("announcement_id, user_id").in("announcement_id", ids),
    ])

    // Record current user's views (upsert — unique on announcement_id + user_id)
    supabase
      .from("announcement_views")
      .upsert(
        ids.map((id) => ({ announcement_id: id, user_id: userId })),
        { onConflict: "announcement_id,user_id" }
      )
      .then() // fire and forget

    // Build lookup maps
    const viewMap: Record<string, number> = {}
    const rsvpCountMap: Record<string, number> = {}
    const userRsvpSet = new Set<string>()

    for (const v of viewRows ?? []) {
      viewMap[v.announcement_id] = (viewMap[v.announcement_id] ?? 0) + 1
    }
    for (const r of rsvpRows ?? []) {
      rsvpCountMap[r.announcement_id] = (rsvpCountMap[r.announcement_id] ?? 0) + 1
      if (r.user_id === userId) userRsvpSet.add(r.announcement_id)
    }

    const enriched: EnrichedAnnouncement[] = anns.map((ann) => ({
      ...ann,
      view_count: viewMap[ann.id] ?? 0,
      rsvp_count: rsvpCountMap[ann.id] ?? 0,
      user_has_rsvped: userRsvpSet.has(ann.id),
    }))

    setAnnouncements(enriched)
    setLoading(false)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId])

  useEffect(() => {
    loadAnnouncements()
  }, [loadAnnouncements])

  function handleRsvpToggle(announcementId: string) {
    setAnnouncements((prev) =>
      prev.map((ann) =>
        ann.id === announcementId
          ? {
              ...ann,
              user_has_rsvped: true,
              rsvp_count: ann.rsvp_count + 1,
            }
          : ann
      )
    )
  }

  function handleNewAnnouncement(newAnn: Announcement) {
    const enriched: EnrichedAnnouncement = {
      ...newAnn,
      view_count: 0,
      rsvp_count: 0,
      user_has_rsvped: false,
    }
    setAnnouncements((prev) => [enriched, ...prev])
  }

  function handleDeleteAnnouncement(id: string) {
    setAnnouncements((prev) => prev.filter((ann) => ann.id !== id))
  }

  async function handleDesktopDelete(ann: EnrichedAnnouncement) {
    const supabase = createClient()
    setAnnouncements((prev) => prev.filter((a) => a.id !== ann.id))
    await supabase.from("announcements").delete().eq("id", ann.id)
  }

  function handleEditSuccess(updated: Announcement) {
    setAnnouncements((prev) =>
      prev.map((ann) =>
        ann.id === updated.id ? { ...ann, ...updated } : ann
      )
    )
  }

  const monoStyle: React.CSSProperties = {
    fontFamily: "ui-monospace, 'SF Mono', Menlo, monospace",
    fontSize: "11px",
    letterSpacing: "0.04em",
    textTransform: "uppercase",
    color: "#8A8497",
  }

  const pinnedAnn = announcements.find(a => a.is_pinned)
  const unpinned = announcements.filter(a => !a.is_pinned)

  return (
    <div className="pb-2 md:pb-0">
      {/* Desktop Topbar */}
      <DesktopTopbar
        crumbs={["Central", "Announcements"]}
        right={isLeaderOrAdmin ? (
          <button
            onClick={() => setShowCreate(true)}
            className="hidden md:flex items-center gap-1.5 px-3.5 py-1.5 bg-[#13101A] hover:bg-[#2D0F2E] text-[#F6F4EF] rounded-lg text-[12px] font-medium transition-colors"
          >
            <Plus className="w-3.5 h-3.5" />
            New announcement
          </button>
        ) : undefined}
      />

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
      </div>

      {/* Mobile title */}
      <div className="flex items-end justify-between px-5 mb-6 md:hidden">
        <h1 style={{ fontFamily: "var(--font-instrument-serif)", fontSize: "36px", fontWeight: 400, letterSpacing: "-0.02em", color: "#13101A", lineHeight: 1.05, margin: 0 }}>Announcements</h1>
        {isLeaderOrAdmin && (
          <button onClick={() => setShowCreate(true)} className="size-9 bg-[#3E1540] rounded-xl flex items-center justify-center hover:bg-[#2D0F2E] transition-colors">
            <Plus className="w-4 h-4 text-white" />
          </button>
        )}
      </div>

      {/* Desktop Editorial Header */}
      <div className="hidden md:flex items-end justify-between px-14 pt-11 pb-8 border-b border-[#E5E0D2]" style={{ gap: "24px" }}>
        <div>
          <p style={monoStyle}>{announcements.length} total · {announcements.filter(a => !a.user_has_rsvped && a.is_event).length} unread</p>
          <h1 style={{ margin: "14px 0 0", fontFamily: "var(--font-instrument-serif)", fontWeight: 400, fontSize: "52px", lineHeight: 1.05, letterSpacing: "-0.01em", color: "#13101A" }}>
            Announcements
          </h1>
          <p style={{ marginTop: "12px", color: "#5A5466", fontSize: "14px", maxWidth: "560px" }}>
            What the ministry is planning, praying for, and showing up to.
          </p>
        </div>
        <div className="flex items-center gap-2 pb-1.5">
          {/* Cards/Compact toggle */}
          <div className="flex border border-[#E5E0D2] rounded-lg overflow-hidden">
            <button
              onClick={() => setCompact(false)}
              className="px-3 py-1.5 text-[12px] transition-colors"
              style={{ background: !compact ? "#EFEAE0" : "transparent", fontWeight: !compact ? 500 : 400, border: "none", cursor: "pointer" }}
            >
              Cards
            </button>
            <button
              onClick={() => setCompact(true)}
              className="px-3 py-1.5 text-[12px] transition-colors"
              style={{ background: compact ? "#EFEAE0" : "transparent", fontWeight: compact ? 500 : 400, border: "none", cursor: "pointer" }}
            >
              Compact
            </button>
          </div>
        </div>
      </div>

      {loading ? (
        <div className="px-5 md:px-14"><Spinner /></div>
      ) : announcements.length === 0 ? (
        <div className="px-5 md:px-14">
          <EmptyState
            icon={<Bell className="w-7 h-7" />}
            title="No announcements yet"
            subtitle={isLeaderOrAdmin ? "Nothing announced yet." : "Check back soon for updates"}
          />
        </div>
      ) : (
        <>
          {/* Mobile card list */}
          <div className="md:hidden px-5 pb-4 flex flex-col gap-4">
            {announcements.map((ann, idx) => (
              <AnnouncementCard
                key={ann.id}
                announcement={ann}
                isPinned={ann.is_pinned && idx === 0}
                userId={userId}
                userRole={userRole}
                onRsvpToggle={handleRsvpToggle}
                onEdit={(a) => setEditingAnn(a)}
                onDelete={handleDeleteAnnouncement}
              />
            ))}
          </div>

          {/* Desktop layout */}
          <div className="hidden md:block px-14 py-7">
            {/* Filter chips */}
            <div className="flex gap-2 mb-6">
              {["All", "Events", "Prayer", "Pinned"].map((t, i) => (
                <button key={t} style={{
                  padding: "7px 14px", borderRadius: 999, fontSize: "12px", fontWeight: 500,
                  border: i === 0 ? "1px solid #13101A" : "1px solid #E5E0D2",
                  background: i === 0 ? "#13101A" : "transparent",
                  color: i === 0 ? "#F6F4EF" : "#13101A", cursor: "pointer",
                }}>{t}</button>
              ))}
            </div>

            {/* Pinned hero strip */}
            {pinnedAnn && (
              <div
                className="rounded-xl overflow-hidden mb-6 relative"
                style={{ background: "#3E1540", color: "#F6F4EF", padding: "22px 28px", display: "grid", gridTemplateColumns: "1fr auto", gap: "24px", alignItems: "center" }}
              >
                <div className="absolute rounded-full pointer-events-none" style={{ top: -80, right: 80, width: 280, height: 280, background: "radial-gradient(circle, rgba(201,163,75,0.18), transparent 60%)" }} />
                <div className="relative">
                  <p style={{ fontSize: "11px", letterSpacing: "1px", textTransform: "uppercase", opacity: 0.75, marginBottom: "8px" }}>📌 Pinned</p>
                  <h2 style={{ margin: 0, fontFamily: "var(--font-instrument-serif)", fontWeight: 400, fontSize: "32px", lineHeight: 1.1 }}>{pinnedAnn.title}</h2>
                  <p style={{ marginTop: "6px", fontSize: "13px", opacity: 0.78 }} className="line-clamp-2">{pinnedAnn.body}</p>
                </div>
                <div className="flex gap-2.5 relative items-center">
                  {pinnedAnn.is_event && (
                    <button
                      onClick={() => handleRsvpToggle(pinnedAnn.id)}
                      style={{ background: pinnedAnn.user_has_rsvped ? "rgba(255,255,255,0.15)" : "#F6F4EF", color: pinnedAnn.user_has_rsvped ? "#F6F4EF" : "#13101A", border: 0, padding: "8px 18px", borderRadius: "8px", fontWeight: 500, fontSize: "13px", cursor: "pointer" }}
                    >
                      {pinnedAnn.user_has_rsvped ? "Going ✓" : "RSVP"}
                    </button>
                  )}
                  {isLeaderOrAdmin && (
                    <>
                      <button
                        onClick={() => setEditingAnn(pinnedAnn)}
                        style={{ width: 32, height: 32, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(255,255,255,0.1)", border: "1px solid rgba(255,255,255,0.2)", borderRadius: "8px", cursor: "pointer" }}
                        title="Edit"
                      >
                        <Edit3 className="w-3.5 h-3.5 text-[#F6F4EF]" />
                      </button>
                      <button
                        onClick={() => handleDesktopDelete(pinnedAnn)}
                        style={{ width: 32, height: 32, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(239,68,68,0.15)", border: "1px solid rgba(239,68,68,0.3)", borderRadius: "8px", cursor: "pointer" }}
                        title="Delete"
                      >
                        <Trash2 className="w-3.5 h-3.5 text-red-300" />
                      </button>
                    </>
                  )}
                </div>
              </div>
            )}

            {compact ? (
              /* Compact table */
              <div className="rounded-xl border border-[#E5E0D2] bg-[#FBF8F2] overflow-hidden">
                <div className="grid px-5 py-2.5 border-b border-[#E5E0D2]" style={{ gridTemplateColumns: "100px 1.5fr 1fr 100px", gap: "12px" }}>
                  {["Type", "Title", "When", "Action"].map(h => (
                    <span key={h} style={{ fontFamily: "ui-monospace, 'SF Mono', Menlo, monospace", fontSize: "10px", letterSpacing: "0.06em", textTransform: "uppercase", color: "#8A8497" }}>{h}</span>
                  ))}
                </div>
                {(pinnedAnn ? [pinnedAnn, ...unpinned] : unpinned).map((ann, i) => (
                  <div key={ann.id} className="grid px-5 py-3.5 items-center" style={{ gridTemplateColumns: "100px 1.5fr 1fr 100px", gap: "12px", borderTop: i ? "1px solid #EFEAE0" : undefined }}>
                    <span style={{ fontSize: "10px", letterSpacing: "0.8px", padding: "3px 9px", borderRadius: "6px", background: "#F4F1E8", border: "1px solid #E5E0D2", textTransform: "uppercase", fontWeight: 500, width: "fit-content" }}>
                      {ann.is_event ? "Event" : "Post"}
                    </span>
                    <div>
                      <div style={{ fontFamily: "var(--font-instrument-serif)", fontSize: "17px", lineHeight: 1.2 }}>{ann.title}</div>
                      <div style={{ fontSize: "12px", color: "#8A8497", marginTop: "2px", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }} className="line-clamp-1">{ann.body}</div>
                    </div>
                    <div style={{ fontSize: "12px", color: "#5A5466" }}>{formatDate(ann.created_at)}</div>
                    <div className="flex justify-end items-center gap-1.5">
                      {ann.is_event && (
                        <button
                          onClick={() => handleRsvpToggle(ann.id)}
                          style={{ padding: "4px 10px", borderRadius: "6px", fontSize: "11px", border: "1px solid #E5E0D2", cursor: "pointer", background: ann.user_has_rsvped ? "#EFEAE0" : "transparent" }}
                        >
                          {ann.user_has_rsvped ? "Going" : "RSVP"}
                        </button>
                      )}
                      {isLeaderOrAdmin && (
                        <>
                          <button
                            onClick={() => setEditingAnn(ann)}
                            className="w-7 h-7 flex items-center justify-center rounded-md hover:bg-[#EFEAE0] transition-colors"
                            title="Edit"
                          >
                            <Edit3 className="w-3.5 h-3.5 text-[#5A5466]" />
                          </button>
                          <button
                            onClick={() => handleDesktopDelete(ann)}
                            className="w-7 h-7 flex items-center justify-center rounded-md hover:bg-red-50 transition-colors"
                            title="Delete"
                          >
                            <Trash2 className="w-3.5 h-3.5 text-red-400" />
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              /* Editorial 2-col cards */
              <div className="grid gap-5" style={{ gridTemplateColumns: "1fr 1fr" }}>
                {(pinnedAnn ? [pinnedAnn, ...unpinned] : unpinned).map((ann) => (
                  <article key={ann.id} className="rounded-2xl border border-[#E5E0D2] bg-[#FBF8F2] overflow-hidden">
                    <div style={{ padding: "26px 28px 22px" }}>
                      <div className="flex justify-between items-center mb-4">
                        <span style={monoStyle}>{formatDate(ann.created_at)}</span>
                        <span style={{ fontSize: "10px", letterSpacing: "0.8px", padding: "3px 9px", borderRadius: 999, background: "#EFEAE0", textTransform: "uppercase", fontWeight: 500 }}>
                          {ann.is_event ? "Event" : "Post"}
                        </span>
                      </div>
                      <h3 style={{ margin: 0, fontFamily: "var(--font-instrument-serif)", fontWeight: 400, fontSize: "28px", lineHeight: 1.1, letterSpacing: "-0.01em", color: "#13101A" }}>{ann.title}</h3>
                      <p style={{ marginTop: "14px", fontSize: "14px", color: "#5A5466", lineHeight: 1.55 }} className="line-clamp-3">{ann.body}</p>
                      <div style={{ marginTop: "22px", paddingTop: "16px", borderTop: "1px solid #EFEAE0", display: "flex", alignItems: "center", justifyContent: "space-between", gap: "8px" }}>
                        <span style={{ fontSize: "12px", color: "#8A8497" }}>{ann.rsvp_count} going · {ann.view_count} views</span>
                        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                          {ann.is_event && (
                            <button
                              onClick={() => handleRsvpToggle(ann.id)}
                              style={{ background: ann.user_has_rsvped ? "#EFEAE0" : "transparent", color: "#13101A", border: "1px solid #13101A", padding: "8px 16px", borderRadius: 999, fontSize: "12px", fontWeight: 500, cursor: "pointer" }}
                            >
                              {ann.user_has_rsvped ? "Going ✓" : "RSVP"}
                            </button>
                          )}
                          {isLeaderOrAdmin && (
                            <>
                              <button
                                onClick={() => setEditingAnn(ann)}
                                className="w-8 h-8 flex items-center justify-center rounded-lg border border-[#E5E0D2] hover:bg-[#EFEAE0] transition-colors"
                                title="Edit"
                              >
                                <Edit3 className="w-3.5 h-3.5 text-[#5A5466]" />
                              </button>
                              <button
                                onClick={() => handleDesktopDelete(ann)}
                                className="w-8 h-8 flex items-center justify-center rounded-lg border border-[#E5E0D2] hover:bg-red-50 hover:border-red-200 transition-colors"
                                title="Delete"
                              >
                                <Trash2 className="w-3.5 h-3.5 text-red-400" />
                              </button>
                            </>
                          )}
                        </div>
                      </div>
                    </div>
                  </article>
                ))}
              </div>
            )}
          </div>
        </>
      )}

      {/* FAB — mobile only */}
      {isLeaderOrAdmin && (
        <button
          onClick={() => setShowCreate(true)}
          style={{ position: "fixed", bottom: "6.5rem", right: "max(calc(50% - 195px + 16px), 16px)" }}
          className="md:hidden w-12 h-12 bg-[#3E1540] rounded-2xl flex items-center justify-center z-40 hover:bg-[#2D0F2E] active:scale-95 transition-all"
          aria-label="New announcement"
        >
          <Plus className="w-6 h-6 text-white" />
        </button>
      )}

      {showCreate && (
        <CreateAnnouncementModal userId={userId} ministryId={ministryId} onClose={() => setShowCreate(false)} onSuccess={handleNewAnnouncement} />
      )}
      {editingAnn && (
        <CreateAnnouncementModal
          userId={userId} ministryId={ministryId} existing={editingAnn}
          onClose={() => setEditingAnn(null)}
          onSuccess={(updated) => { handleEditSuccess(updated); setEditingAnn(null) }}
        />
      )}
    </div>
  )
}

export function AnnouncementDetail({ announcement, userId, onClose, onRsvpToggle }: AnnouncementDetailProps) {
  const supabase = createClient()
  const [rsvping, setRsvping] = useState(false)

  async function handleRsvp() {
    if (announcement.user_has_rsvped || rsvping) return
    setRsvping(true)
    onRsvpToggle(announcement.id)
    await supabase.from("rsvps").upsert(
      { announcement_id: announcement.id, user_id: userId },
      { onConflict: "announcement_id,user_id" }
    )
    setRsvping(false)
  }

  const formattedDate = formatDate(announcement.created_at)

  return (
    <div className="fixed inset-0 z-50 bg-white flex flex-col md:left-[296px]">
    <div className="max-w-[390px] mx-auto w-full h-full flex flex-col md:max-w-none">

      {/* Header — never grows/shrinks, sits at top */}
      <div className="flex-shrink-0 flex items-center gap-3 px-5 pt-12 pb-4 md:pt-5 bg-white border-b border-[#ECE8DE]">
        <button
          onClick={onClose}
          className="w-9 h-9 rounded-full bg-[#FBF8F2] flex items-center justify-center flex-shrink-0 hover:bg-[#F2EDE0] transition-colors"
        >
          <ArrowLeft className="w-4 h-4 text-[#3E1540]" />
        </button>
        <span className="text-[15px] font-semibold text-[#13101A]">Announcement</span>
      </div>

      {/* Content — takes all remaining space, scrollable */}
      <div className="flex-1 overflow-y-auto px-5 py-6">
        <div className="flex items-center gap-1.5 text-[13px] text-[#8A8497] mb-5">
          <Calendar className="w-3.5 h-3.5 flex-shrink-0" />
          <span>{formattedDate}</span>
        </div>
        <h1 style={{ fontFamily: "var(--font-instrument-serif)", fontSize: "30px", fontWeight: 400, letterSpacing: "-0.02em", color: "#13101A", lineHeight: 1.1, marginBottom: "16px" }}>
          {announcement.title}
        </h1>
        <p className="text-[14px] text-[#374151] leading-relaxed whitespace-pre-wrap">
          {announcement.body}
        </p>
      </div>

      {/* RSVP bar — pinned to bottom, never floats */}
      {announcement.is_event && (
        <div className="flex-shrink-0 bg-white border-t border-[#ECE8DE] px-5 py-4 pb-20">
          <button
            onClick={handleRsvp}
            disabled={announcement.user_has_rsvped || rsvping}
            className={`w-full rounded-xl py-4 font-semibold text-[15px] transition-colors ${
              announcement.user_has_rsvped
                ? "bg-[#3E1540]/10 text-[#3E1540] cursor-default"
                : "bg-[#3E1540] hover:bg-[#2D0F2E] text-white"
            }`}
          >
            {announcement.user_has_rsvped ? (
              <span className="flex items-center justify-center gap-1.5">
                <Check className="w-4 h-4" />
                You&apos;re going!
              </span>
            ) : (
              "RSVP"
            )}
          </button>
        </div>
      )}

    </div>
    </div>
  )
}

export function AnnouncementCard({ announcement, isPinned, userId, userRole, onRsvpToggle, onEdit, onDelete }: AnnouncementCardProps) {
  const supabase = createClient()
  const [rsvping, setRsvping] = useState(false)
  const [showMenu, setShowMenu] = useState(false)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [showDetail, setShowDetail] = useState(false)

  const isAdminOrLeader = ["admin", "leader"].includes(userRole.toLowerCase())

  async function handleRsvp() {
    if (announcement.user_has_rsvped || rsvping) return
    setRsvping(true)
    onRsvpToggle(announcement.id)
    await supabase.from("rsvps").upsert(
      { announcement_id: announcement.id, user_id: userId },
      { onConflict: "announcement_id,user_id" }
    )
    setRsvping(false)
  }

  async function handleDelete() {
    setDeleting(true)
    await supabase.from("announcements").delete().eq("id", announcement.id)
    onDelete(announcement.id)
  }

  return (
    <>
    <div className="relative rounded-[22px] bg-[#3E1540] overflow-hidden shadow-[0_2px_8px_rgba(19,16,26,0.08)]">
      {/* Radial accent glow */}
      <div className="absolute -top-[70px] -right-[70px] w-[220px] h-[220px] rounded-full bg-[radial-gradient(circle,rgba(201,163,75,0.28)_0%,transparent_70%)] pointer-events-none" />

      {/* Optional image */}
      {announcement.image_url && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={announcement.image_url}
          alt={announcement.title}
          className="w-full h-44 object-cover"
        />
      )}

      <div className="p-6 relative">
        {/* Top row: kicker + admin menu */}
        <div className="flex items-start justify-between mb-3">
          <div className="flex items-center gap-2">
            {isPinned && (
              <span className="text-[10px] font-bold tracking-[.18em] uppercase text-[#C9A34B]">Pinned ·</span>
            )}
            <span className="text-[10px] font-bold tracking-[.22em] uppercase text-[#9E85A0]">
              {announcement.is_event ? "Event" : formatDate(announcement.created_at)}
            </span>
            {announcement.audience && announcement.audience !== "all" && (
              <span className="px-2 py-0.5 bg-[#C9A34B] text-[#13101A] rounded-full text-[9px] font-bold tracking-[.1em] uppercase">
                {audienceLabel(announcement.audience)}
              </span>
            )}
          </div>

          <div className="flex items-center gap-2">
            {announcement.view_count > 0 && (
              <span className="flex items-center gap-1 text-[10px] text-[#9E85A0] font-medium">
                <Users className="w-3 h-3" />
                {announcement.view_count}
              </span>
            )}
            {isAdminOrLeader && (
              <div className="relative">
                {showMenu && (
                  <div className="fixed inset-0 z-[5]" onClick={() => setShowMenu(false)} />
                )}
                <button
                  onClick={(e) => { e.stopPropagation(); setShowMenu((v) => !v) }}
                  className="w-7 h-7 rounded-full flex items-center justify-center hover:bg-white/10 transition-colors"
                >
                  <MoreHorizontal className="w-4 h-4 text-[#9E85A0]" />
                </button>
                {showMenu && (
                  <div className="absolute top-8 right-0 z-[10] bg-white rounded-xl shadow-lg border border-[#ECE8DE] py-1 min-w-[140px]">
                    <button
                      onClick={() => { setShowMenu(false); onEdit(announcement) }}
                      className="w-full flex items-center gap-2.5 px-4 py-2.5 text-[13px] font-medium text-[#13101A] hover:bg-[#FBF8F2] transition-colors text-left"
                    >
                      <Edit3 className="w-3.5 h-3.5 text-[#3E1540]" />
                      Edit
                    </button>
                    <button
                      onClick={() => { setShowMenu(false); setShowDeleteConfirm(true) }}
                      className="w-full flex items-center gap-2.5 px-4 py-2.5 text-[13px] font-medium text-red-500 hover:bg-red-50 transition-colors text-left"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      Delete
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        <h3
          style={{ fontFamily: "var(--font-instrument-serif)", fontSize: "30px", lineHeight: 1.05, letterSpacing: "-0.02em", color: "#F6F4EF", margin: "0 0 8px" }}
        >
          {announcement.title}
        </h3>
        <p className="text-[13px] text-[#CFB8D1] leading-relaxed line-clamp-3 md:line-clamp-5 mb-1">
          {announcement.body}
        </p>
        <button
          onClick={() => setShowDetail(true)}
          className="text-[12px] font-medium text-[#9E85A0] hover:text-[#CFB8D1] transition-colors mb-4"
        >
          Read more
        </button>

        {/* RSVP section */}
        {announcement.is_event && (
          <div className="flex items-center gap-4">
            <button
              onClick={handleRsvp}
              disabled={announcement.user_has_rsvped || rsvping}
              className={`font-bold py-3 px-7 rounded-full transition-all text-[14px] ${
                announcement.user_has_rsvped
                  ? "bg-white/20 text-[#F6F4EF] cursor-default"
                  : "bg-[#F6F4EF] text-[#3E1540] hover:bg-white active:scale-[0.98]"
              }`}
            >
              {announcement.user_has_rsvped ? (
                <span className="flex items-center gap-1.5">
                  <Check className="w-3.5 h-3.5" />
                  You&apos;re going!
                </span>
              ) : (
                "RSVP"
              )}
            </button>

            {announcement.rsvp_count > 0 && (
              <span className="text-[12px] text-[#9E85A0] font-medium">
                {announcement.rsvp_count} going
              </span>
            )}
          </div>
        )}
      </div>

      {/* Delete confirmation overlay */}
      {showDeleteConfirm && (
        <div className="absolute inset-0 z-[20] bg-[#3E1540]/95 backdrop-blur-sm rounded-[22px] flex flex-col items-center justify-center gap-3 p-7">
          <div className="w-11 h-11 rounded-full bg-white/10 flex items-center justify-center mb-1">
            <Trash2 className="w-5 h-5 text-red-400" />
          </div>
          <p className="text-[15px] font-bold text-[#F6F4EF] text-center">Delete this announcement?</p>
          <p className="text-[12px] text-[#9E85A0] text-center -mt-1">This can&apos;t be undone.</p>
          <div className="flex gap-3 w-full mt-1">
            <button
              onClick={() => setShowDeleteConfirm(false)}
              disabled={deleting}
              className="flex-1 py-2.5 rounded-full border border-white/20 text-[13px] font-semibold text-[#F6F4EF] hover:bg-white/10 transition-colors disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              onClick={handleDelete}
              disabled={deleting}
              className="flex-1 py-2.5 rounded-full bg-red-500 text-white text-[13px] font-semibold hover:bg-red-600 transition-colors disabled:opacity-60"
            >
              {deleting ? "Deleting…" : "Delete"}
            </button>
          </div>
        </div>
      )}
    </div>

    {/* Full-screen detail page */}
    {showDetail && (
      <AnnouncementDetail
        announcement={announcement}
        userId={userId}
        onClose={() => setShowDetail(false)}
        onRsvpToggle={onRsvpToggle}
      />
    )}
    </>
  )
}
