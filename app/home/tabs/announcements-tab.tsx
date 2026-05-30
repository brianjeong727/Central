"use client"

import { useState, useEffect, useRef, useCallback } from "react"
import { ChevronDown, X, Check, CheckCircle2, ImageIcon, Trash2, Bell, ArrowLeft, Calendar, MoreHorizontal, Plus, Users, Edit3, FileText, ChevronUp, Pin, PinOff } from "lucide-react"
import { createClient } from "@/lib/supabase"
import { Spinner, EmptyState, RingCrossLogo, MONO_STYLE, AnimateIn } from "../components/shared"
import { getInitials, formatRelativeTime, audienceLabel, formatDate } from "../utils"
import { DesktopTopbar } from "../components/desktop-nav"
import { FormFillView } from "./forms-tab"
import type { AnnouncementsTabProps, AnnouncementDetailProps, AnnouncementCardProps, CreateAnnouncementModalProps, Announcement, EnrichedAnnouncement, RsvpAttendee, FieldType } from "../types"

// ── Form builder types (local) ────────────────────────────────────────────────

interface DraftField {
  tempId: string
  existingId?: string
  label: string
  type: FieldType
  options: string[]
  required: boolean
}

let _tempIdCounter = 0
function newTempId() { return `draft-${++_tempIdCounter}` }

const AUDIENCE_OPTIONS = [
  { value: "all", label: "Everyone" },
  { value: "2025", label: "Class of 2025" },
  { value: "2026", label: "Class of 2026" },
  { value: "2027", label: "Class of 2027" },
  { value: "2028", label: "Class of 2028" },
  { value: "group", label: "Specific Group" },
]

type FilterType = "all" | "events" | "forms" | "pinned"

// ── Create Modal (new only) ──────────────────────────────────────────────────

export function CreateAnnouncementModal({ userId, ministryId, existing, onClose, onSuccess }: CreateAnnouncementModalProps) {
  const supabase = createClient()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const isEditing = !!existing

  const [title, setTitle] = useState(existing?.title ?? "")
  const [body, setBody] = useState(existing?.body ?? "")
  const [audience, setAudience] = useState(existing?.audience ?? "all")
  const [isEvent, setIsEvent] = useState(existing?.is_event ?? false)
  const [showAttendees, setShowAttendees] = useState(existing?.show_attendees ?? false)
  const [imageFile, setImageFile] = useState<File | null>(null)
  const [imagePreview, setImagePreview] = useState<string | null>(existing?.image_url ?? null)
  const [submitting, setSubmitting] = useState(false)
  const [success, setSuccess] = useState(false)
  const [savedAsDraft, setSavedAsDraft] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Form builder
  const [hasForm, setHasForm] = useState(false)
  const [formFields, setFormFields] = useState<DraftField[]>([])
  const [existingFormId, setExistingFormId] = useState<string | null>(null)

  // Load existing form when editing
  useEffect(() => {
    if (!isEditing || !existing) return
    async function loadExistingForm() {
      const { data: formData } = await supabase
        .from("announcement_forms")
        .select("id")
        .eq("announcement_id", existing!.id)
        .maybeSingle()
      if (!formData) return
      setExistingFormId(formData.id)
      setHasForm(true)
      const { data: fieldData } = await supabase
        .from("form_fields")
        .select("*")
        .eq("form_id", formData.id)
        .order("order_index")
      setFormFields((fieldData ?? []).map(f => ({
        tempId: newTempId(),
        existingId: f.id,
        label: f.label,
        type: f.type as FieldType,
        options: Array.isArray(f.options) ? f.options : [],
        required: f.required ?? false,
      })))
    }
    loadExistingForm()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

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

  async function handleSubmit(e: React.FormEvent, asDraft = false) {
    e.preventDefault()
    if (!title.trim() || !body.trim()) { setError("Title and body are required."); return }
    setSubmitting(true)
    setError(null)
    const status = asDraft ? "draft" : "published"

    let imageUrl: string | null = null
    if (imageFile) {
      const ext = imageFile.name.split(".").pop()
      const fileName = `${Date.now()}.${ext}`
      const { data: uploadData, error: uploadError } = await supabase.storage
        .from("announcement-images")
        .upload(fileName, imageFile, { upsert: true })
      if (!uploadError && uploadData) {
        const { data: { publicUrl } } = supabase.storage.from("announcement-images").getPublicUrl(uploadData.path)
        imageUrl = publicUrl
      }
    } else if (imagePreview) {
      imageUrl = imagePreview
    }

    let announcementId: string
    let resultAnn: Announcement

    if (isEditing && existing) {
      const { data, error: updateError } = await supabase
        .from("announcements")
        .update({ title: title.trim(), body: body.trim(), audience, is_event: isEvent, show_attendees: showAttendees, image_url: imageUrl, status })
        .eq("id", existing.id).eq("ministry_id", ministryId).select().maybeSingle()
      if (updateError) { setError(updateError.message); setSubmitting(false); return }
      announcementId = existing.id
      resultAnn = (data ?? { ...existing, title: title.trim(), body: body.trim(), audience, is_event: isEvent, show_attendees: showAttendees, image_url: imageUrl }) as Announcement
    } else {
      const { data, error: insertError } = await supabase
        .from("announcements")
        .insert({ title: title.trim(), body: body.trim(), audience, is_event: isEvent, show_attendees: showAttendees, is_pinned: false, image_url: imageUrl, created_by: userId, ministry_id: ministryId, status })
        .select().single()
      if (insertError) { setError(insertError.message); setSubmitting(false); return }
      announcementId = data.id
      resultAnn = data as Announcement
    }

    // Sync form attachment
    if (hasForm && formFields.length > 0) {
      let formId = existingFormId
      if (!formId) {
        const { data: fd } = await supabase
          .from("announcement_forms")
          .insert({ announcement_id: announcementId, ministry_id: ministryId, created_by: userId })
          .select().single()
        formId = fd?.id ?? null
      }
      if (formId) {
        if (existingFormId) await supabase.from("form_fields").delete().eq("form_id", formId)
        await supabase.from("form_fields").insert(
          formFields.map((f, i) => ({ form_id: formId, label: f.label, type: f.type, options: f.options, required: f.required, order_index: i }))
        )
      }
    } else if (!hasForm && existingFormId) {
      await supabase.from("announcement_forms").delete().eq("id", existingFormId)
    }

    setSavedAsDraft(asDraft)
    setSuccess(true)
    setTimeout(() => { onSuccess(resultAnn); onClose() }, isEditing ? 1000 : 1200)
  }

  if (success) {
    return (
      <div className="fixed inset-0 z-[100] bg-[#FBF8F2] flex flex-col items-center justify-center gap-4 md:left-[296px]">
        <div className="w-16 h-16 rounded-full bg-[#3E1540]/10 flex items-center justify-center">
          <CheckCircle2 className="w-8 h-8 text-[#3E1540]" />
        </div>
        <div className="text-center">
          <p className="text-[16px] font-bold text-[#13101A]">{isEditing ? "Announcement updated!" : savedAsDraft ? "Draft saved!" : "Announcement posted!"}</p>
          <p className="text-[13px] text-[#8A8497] mt-1">{isEditing ? "Your changes have been saved." : savedAsDraft ? "Only leaders and admins can see this." : "Your announcement is now live."}</p>
        </div>
      </div>
    )
  }

  const monoStyle: React.CSSProperties = {
    fontFamily: "ui-monospace, ‘SF Mono’, Menlo, monospace",
    fontSize: "11px", letterSpacing: "1.4px", textTransform: "uppercase", color: "#8A8497",
  }

  return (
    <AnimateIn className="fixed inset-0 z-[60] bg-[#FBF8F2] flex flex-col md:left-[296px]">
      {/* Header */}
      <div className="flex-shrink-0 border-b border-[#E8E2D2] bg-[#FBF8F2]">
        <div className="flex items-center justify-between px-5 pt-12 pb-4 md:pt-5 md:px-10">
          <p style={monoStyle}>{isEditing ? "Edit announcement" : "New announcement · Draft"}</p>
          <button
            onClick={onClose}
            style={{ width: 30, height: 30, borderRadius: 8, border: "1px solid #E2DDCF", background: "transparent", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", flexShrink: 0 }}
          >
            <X className="w-3.5 h-3.5 text-[#5A5466]" />
          </button>
        </div>
      </div>

      {/* Mobile: scrollable single column */}
      <div className="md:hidden flex-1 overflow-y-auto min-h-0">
        <form id="ann-form" onSubmit={handleSubmit} className="px-5 py-5 flex flex-col gap-4">
          {error && <div className="rounded-xl bg-[#3E1540]/8 px-4 py-3 text-[13px] text-[#3E1540] font-medium">{error}</div>}
          <div className="bg-white rounded-2xl border border-[#ECE8DE] overflow-hidden shadow-[0_1px_3px_rgba(19,16,26,0.04)]">
            <div className="px-4 pt-4 pb-1">
              <label className="text-[10px] font-semibold text-[#8A8497] tracking-wider uppercase">Title</label>
            </div>
            <input type="text" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Announcement title…" required style={{ fontFamily: "var(--font-instrument-serif)", fontSize: "18px", letterSpacing: "-0.01em" }} className="w-full px-4 pt-1 pb-4 text-[#13101A] placeholder:text-[#C4C4C4] focus:outline-none bg-transparent border-b border-[#F2EDE8]" />
            <div className="px-4 pt-3 pb-1">
              <label className="text-[10px] font-semibold text-[#8A8497] tracking-wider uppercase">Body</label>
            </div>
            <textarea value={body} onChange={(e) => setBody(e.target.value)} placeholder="Write the full announcement here…" required rows={6} className="w-full px-4 pt-1 pb-4 text-[14px] text-[#13101A] placeholder:text-[#C4C4C4] focus:outline-none bg-transparent resize-none" style={{ lineHeight: "1.6" }} />
          </div>
          <div className="bg-white rounded-2xl border border-[#ECE8DE] overflow-hidden shadow-[0_1px_3px_rgba(19,16,26,0.04)] px-4 py-4">
            <label className="text-[10px] font-semibold text-[#8A8497] tracking-wider uppercase block mb-3">Audience</label>
            <div className="flex flex-wrap gap-2">
              {AUDIENCE_OPTIONS.map((opt) => (
                <button key={opt.value} type="button" onClick={() => setAudience(opt.value)} className={`px-3 py-1.5 rounded-full text-[12px] font-semibold border transition-all ${audience === opt.value ? "bg-[#3E1540] text-[#F6F4EF] border-[#3E1540]" : "bg-[#FBF8F2] text-[#5A5466] border-[#E5E0D2] hover:border-[#3E1540]/40"}`}>{opt.label}</button>
              ))}
            </div>
          </div>
          <div className="bg-white rounded-2xl border border-[#ECE8DE] overflow-hidden shadow-[0_1px_3px_rgba(19,16,26,0.04)] px-4 py-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-[13px] font-semibold text-[#13101A]">This is an event</p>
                <p className="text-[11px] text-[#8A8497] mt-0.5">Shows an RSVP button on the card</p>
              </div>
              <button type="button" onClick={() => setIsEvent((v) => !v)} className="relative w-11 h-6 rounded-full transition-colors duration-200 flex-shrink-0" style={{ background: isEvent ? "#3E1540" : "#E5E0D2" }}>
                <span className={`absolute top-0.5 w-5 h-5 rounded-full bg-white shadow-sm transition-all duration-200 ${isEvent ? "left-[22px]" : "left-0.5"}`} />
              </button>
            </div>
            {isEvent && (
              <div className="flex items-center justify-between mt-4 pt-3.5 border-t border-[#F2EDE8]">
                <div>
                  <p className="text-[13px] font-semibold text-[#13101A]">Show attendees publicly</p>
                  <p className="text-[11px] text-[#8A8497] mt-0.5">Members can see who&apos;s going</p>
                </div>
                <button type="button" onClick={() => setShowAttendees((v) => !v)} className="relative w-11 h-6 rounded-full transition-colors duration-200 flex-shrink-0" style={{ background: showAttendees ? "#3E1540" : "#E5E0D2" }}>
                  <span className={`absolute top-0.5 w-5 h-5 rounded-full bg-white shadow-sm transition-all duration-200 ${showAttendees ? "left-[22px]" : "left-0.5"}`} />
                </button>
              </div>
            )}
          </div>
          <div className="bg-white rounded-2xl border border-[#ECE8DE] overflow-hidden shadow-[0_1px_3px_rgba(19,16,26,0.04)]">
            <div className="px-4 pt-4 pb-3">
              <label className="text-[10px] font-semibold text-[#8A8497] tracking-wider uppercase">Image <span className="text-[#C4C4C4] normal-case font-medium">— optional</span></label>
            </div>
            {imagePreview ? (
              <div className="px-4 pb-4">
                <div className="relative rounded-xl overflow-hidden">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={imagePreview} alt="Preview" className="w-full h-44 object-cover" />
                  <button type="button" onClick={removeImage} className="absolute top-2 right-2 w-7 h-7 rounded-full bg-black/50 flex items-center justify-center hover:bg-black/70 transition-colors"><X className="w-3.5 h-3.5 text-white" /></button>
                </div>
              </div>
            ) : (
              <button type="button" onClick={() => fileInputRef.current?.click()} className="mx-4 mb-4 h-24 rounded-xl border-2 border-dashed border-[#3E1540]/20 flex flex-col items-center justify-center gap-2 text-[#8A8497] hover:border-[#3E1540]/40 hover:bg-[#FBF8F2] hover:text-[#3E1540]/70 transition-all" style={{ width: "calc(100% - 32px)" }}>
                <ImageIcon className="w-5 h-5" />
                <span className="text-[12px] font-medium">Tap to add image</span>
              </button>
            )}
            <input ref={fileInputRef} type="file" accept="image/*" onChange={handleImageChange} className="hidden" />
          </div>
        </form>
        <div className="bg-[#FBF8F2] border-t border-[#ECE8DE] px-5 py-4 flex flex-col gap-2">
          <button type="submit" form="ann-form" disabled={submitting} className="w-full bg-[#3E1540] hover:bg-[#2D0F2E] disabled:opacity-50 text-[#F6F4EF] font-bold py-4 rounded-xl active:scale-[0.97] transition-[transform,background-color] duration-150 text-[14px] tracking-wide">
            {submitting ? "Posting…" : isEditing ? "Save Changes" : "Post Announcement"}
          </button>
          {!isEditing && (
            <button type="button" disabled={submitting} onClick={e => handleSubmit(e as unknown as React.FormEvent, true)} className="w-full bg-transparent border border-[#E5E0D2] disabled:opacity-50 text-[#5A5466] font-semibold py-3 rounded-xl active:scale-[0.97] transition-[transform,background-color] duration-150 text-[13px]">
              Save as Draft
            </button>
          )}
        </div>
      </div>

      {/* Desktop: two-column editorial layout */}
      <form id="ann-form" onSubmit={handleSubmit} className="hidden md:flex flex-1 overflow-hidden">
        {/* Writing surface */}
        <div className="flex-1 flex flex-col overflow-hidden border-r border-[#E8E2D2]">
          <div className="flex-1 overflow-y-auto flex flex-col px-10 pt-8 pb-6">
            {error && <div className="mb-6 rounded-xl bg-[#3E1540]/8 px-4 py-3 text-[13px] text-[#3E1540] font-medium">{error}</div>}
            {/* Inline serif title — §4.4 */}
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="A clear, scannable headline"
              className="placeholder:text-[#8A8497]"
              style={{
                fontFamily: "var(--font-instrument-serif)", fontSize: "40px",
                letterSpacing: "-0.5px", color: "#13101A", lineHeight: 1.1,
                background: "transparent", border: "none", borderBottom: "1px solid #E2DDCF",
                outline: "none", width: "100%", paddingBottom: "16px", flexShrink: 0,
              }}
            />
            {/* 1px hairline separates title from body */}
            <div style={{ height: 1, background: "#E2DDCF", flexShrink: 0, marginTop: 0 }} />
            {/* Serif body — §4.4 */}
            <textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder="Write the full announcement here. Take all the space you need — share scripture, walk through logistics, link to sign-ups."
              className="placeholder:text-[#8A8497] flex-1"
              style={{
                fontFamily: "var(--font-instrument-serif)", fontSize: "19px", lineHeight: "1.65",
                color: "#13101A", background: "transparent", border: "none", outline: "none",
                resize: "none", width: "100%", marginTop: "20px", minHeight: "540px",
              }}
            />
          </div>
          {/* Footer — §7.3 */}
          <div className="flex-shrink-0 border-t border-[#E8E2D2] px-10 py-4 flex items-center">
            <button type="button" onClick={onClose} className="px-4 py-2 rounded-[10px] border border-[#E2DDCF] text-[13px] text-[#5A5466] hover:bg-[#F1ECDE] transition-colors">
              Cancel
            </button>
            <div className="flex-1" />
            {!isEditing && (
              <button type="button" disabled={submitting} onClick={e => handleSubmit(e as unknown as React.FormEvent, true)} className="mr-2 px-5 py-2.5 rounded-[10px] border border-[#E2DDCF] disabled:opacity-50 text-[#5A5466] font-semibold active:scale-[0.97] transition-[transform,background-color] duration-150 text-[13px] hover:bg-[#F1ECDE]">
                Save draft
              </button>
            )}
            <button type="submit" disabled={submitting} className="flex items-center gap-2 px-6 py-2.5 rounded-[10px] bg-[#2D0F2E] hover:bg-[#13101A] disabled:opacity-50 text-[#F6F4EF] font-semibold active:scale-[0.97] transition-[transform,background-color] duration-150 text-[13px]">
              {submitting ? "Posting…" : isEditing ? "Save changes" : "Publish"}
            </button>
          </div>
        </div>

        {/* Right settings rail — 280px, flat sections separated by hairlines */}
        <aside className="w-[280px] flex-shrink-0 overflow-y-auto flex flex-col">
          {/* Audience — §4.7 pills */}
          <div className="px-6 pt-7 pb-6">
            <p style={monoStyle} className="mb-3">Audience</p>
            <div className="flex flex-wrap gap-2">
              {AUDIENCE_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setAudience(opt.value)}
                  style={{
                    padding: "5px 12px", borderRadius: 999, fontSize: 12, fontWeight: 500, cursor: "pointer",
                    border: `1px solid ${audience === opt.value ? "#2D0F2E" : "#E2DDCF"}`,
                    background: audience === opt.value ? "#2D0F2E" : "#FBF8F2",
                    color: audience === opt.value ? "#FBF8F2" : "#5A5466",
                    transition: "all 0.15s",
                  }}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          <div style={{ borderTop: "1px solid #E8E2D2" }} />

          {/* Options — §4.9 toggles */}
          <div className="px-6 py-6 flex flex-col gap-5">
            <p style={monoStyle}>Options</p>
            <div className="flex items-start gap-3">
              <button
                type="button"
                onClick={() => setIsEvent((v) => !v)}
                style={{ width: 34, height: 20, borderRadius: 999, background: isEvent ? "#3E1540" : "#D6D0C0", border: "none", cursor: "pointer", position: "relative", flexShrink: 0, marginTop: 2, transition: "background 0.2s" }}
              >
                <span style={{ position: "absolute", top: 2, width: 16, height: 16, borderRadius: 999, background: "#FBF8F2", boxShadow: "0 1px 2px rgba(0,0,0,0.15)", transition: "left 0.2s", left: isEvent ? "16px" : "2px" }} />
              </button>
              <div>
                <p className="text-[13px] font-medium text-[#13101A]">This is an event</p>
                <p className="text-[12px] text-[#8A8497] mt-0.5">Adds RSVP button + calendar marker</p>
              </div>
            </div>
            {isEvent && (
              <div className="flex items-start gap-3">
                <button
                  type="button"
                  onClick={() => setShowAttendees((v) => !v)}
                  style={{ width: 34, height: 20, borderRadius: 999, background: showAttendees ? "#3E1540" : "#D6D0C0", border: "none", cursor: "pointer", position: "relative", flexShrink: 0, marginTop: 2, transition: "background 0.2s" }}
                >
                  <span style={{ position: "absolute", top: 2, width: 16, height: 16, borderRadius: 999, background: "#FBF8F2", boxShadow: "0 1px 2px rgba(0,0,0,0.15)", transition: "left 0.2s", left: showAttendees ? "16px" : "2px" }} />
                </button>
                <div>
                  <p className="text-[13px] font-medium text-[#13101A]">Show attendees publicly</p>
                  <p className="text-[12px] text-[#8A8497] mt-0.5">Members can see who&apos;s going</p>
                </div>
              </div>
            )}
          </div>

          <div style={{ borderTop: "1px solid #E8E2D2" }} />

          {/* Attachment — §4.18 dashed placeholder */}
          <div className="px-6 py-6">
            <p style={monoStyle} className="mb-3">Attachment</p>
            {imagePreview ? (
              <div className="relative rounded-[10px] overflow-hidden">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={imagePreview} alt="Preview" className="w-full h-36 object-cover" />
                <button type="button" onClick={removeImage} className="absolute top-2 right-2 w-7 h-7 rounded-full bg-black/50 flex items-center justify-center hover:bg-black/70 transition-colors">
                  <X className="w-3.5 h-3.5 text-white" />
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="w-full py-7 rounded-[10px] border border-dashed border-[#C4C0B0] bg-transparent flex flex-col items-center justify-center gap-2 text-[#5A5466] hover:border-[#3E1540]/40 hover:bg-[#F1ECDE] transition-all"
              >
                <ImageIcon className="w-4 h-4" />
                <span className="text-[12px]">Add image or file</span>
              </button>
            )}
            <input ref={fileInputRef} type="file" accept="image/*" onChange={handleImageChange} className="hidden" />
          </div>

          <div style={{ borderTop: "1px solid #E8E2D2" }} />

          {/* Form builder */}
          <div className="px-6 py-6">
            <div className="flex items-center justify-between mb-1">
              <p style={monoStyle}>Form</p>
              <button
                type="button"
                onClick={() => {
                  setHasForm(v => !v)
                  if (!hasForm && formFields.length === 0) {
                    setFormFields([{ tempId: newTempId(), label: '', type: 'text', options: [], required: false }])
                  }
                }}
                style={{ width: 34, height: 20, borderRadius: 999, background: hasForm ? "#3E1540" : "#D6D0C0", border: "none", cursor: "pointer", position: "relative", flexShrink: 0, transition: "background 0.2s" }}
              >
                <span style={{ position: "absolute", top: 2, width: 16, height: 16, borderRadius: 999, background: "#FBF8F2", boxShadow: "0 1px 2px rgba(0,0,0,0.15)", transition: "left 0.2s", left: hasForm ? "16px" : "2px" }} />
              </button>
            </div>
            <p className="text-[12px] text-[#8A8497] mb-4">Attach questions to this announcement</p>

            {hasForm && (
              <div className="flex flex-col gap-4">
                {formFields.map((field, idx) => (
                  <div key={field.tempId} style={{ border: "1px solid #E8E2D2", borderRadius: 10, padding: "12px 14px", background: "#FAFAF8" }}>
                    {/* Field label */}
                    <input
                      type="text"
                      value={field.label}
                      onChange={e => setFormFields(prev => prev.map(f => f.tempId === field.tempId ? { ...f, label: e.target.value } : f))}
                      placeholder="Question label…"
                      style={{ width: "100%", fontSize: 13, color: "#13101A", background: "transparent", border: "none", outline: "none", borderBottom: "1px solid #E2DDCF", paddingBottom: 6, marginBottom: 10 }}
                    />
                    {/* Type pills */}
                    <div className="flex flex-wrap gap-1.5 mb-3">
                      {([
                        { value: 'text', label: 'Text' },
                        { value: 'multiple_choice', label: 'Multiple' },
                        { value: 'checkbox', label: 'Checkboxes' },
                        { value: 'dropdown', label: 'Dropdown' },
                      ] as { value: FieldType; label: string }[]).map(t => (
                        <button
                          key={t.value}
                          type="button"
                          onClick={() => setFormFields(prev => prev.map(f => f.tempId === field.tempId ? { ...f, type: t.value, options: t.value !== 'text' && f.options.length === 0 ? ['Option 1'] : f.options } : f))}
                          style={{
                            padding: "3px 9px", borderRadius: 999, fontSize: 11, cursor: "pointer",
                            border: `1px solid ${field.type === t.value ? "#3E1540" : "#E2DDCF"}`,
                            background: field.type === t.value ? "#3E1540" : "transparent",
                            color: field.type === t.value ? "#F6F4EF" : "#5A5466",
                          }}
                        >{t.label}</button>
                      ))}
                    </div>

                    {/* Options for choice-based types */}
                    {field.type !== 'text' && (
                      <div className="flex flex-col gap-1.5 mb-3">
                        {field.options.map((opt, oi) => (
                          <div key={oi} className="flex items-center gap-1.5">
                            <input
                              type="text"
                              value={opt}
                              onChange={e => setFormFields(prev => prev.map(f => {
                                if (f.tempId !== field.tempId) return f
                                const opts = [...f.options]; opts[oi] = e.target.value
                                return { ...f, options: opts }
                              }))}
                              style={{ flex: 1, fontSize: 12, color: "#13101A", background: "transparent", border: "none", outline: "none", borderBottom: "1px solid #E2DDCF", paddingBottom: 3 }}
                              placeholder={`Option ${oi + 1}`}
                            />
                            <button
                              type="button"
                              onClick={() => setFormFields(prev => prev.map(f => f.tempId === field.tempId ? { ...f, options: f.options.filter((_, i) => i !== oi) } : f))}
                              style={{ width: 16, height: 16, display: "flex", alignItems: "center", justifyContent: "center", background: "transparent", border: "none", cursor: "pointer", color: "#C4C0B0", flexShrink: 0 }}
                            ><X style={{ width: 10, height: 10 }} /></button>
                          </div>
                        ))}
                        <button
                          type="button"
                          onClick={() => setFormFields(prev => prev.map(f => f.tempId === field.tempId ? { ...f, options: [...f.options, `Option ${f.options.length + 1}`] } : f))}
                          style={{ fontSize: 11, color: "#8A8497", background: "transparent", border: "none", cursor: "pointer", textAlign: "left", padding: "2px 0", marginTop: 2 }}
                        >+ Add option</button>
                      </div>
                    )}

                    {/* Row: required + reorder + delete */}
                    <div className="flex items-center justify-between">
                      <label className="flex items-center gap-1.5 cursor-pointer">
                        <input type="checkbox" checked={field.required} onChange={e => setFormFields(prev => prev.map(f => f.tempId === field.tempId ? { ...f, required: e.target.checked } : f))} className="w-3 h-3" />
                        <span style={{ fontSize: 11, color: "#8A8497" }}>Required</span>
                      </label>
                      <div className="flex items-center gap-1">
                        <button type="button" disabled={idx === 0} onClick={() => setFormFields(prev => { const a = [...prev]; [a[idx-1], a[idx]] = [a[idx], a[idx-1]]; return a })} style={{ width: 20, height: 20, display: "flex", alignItems: "center", justifyContent: "center", background: "transparent", border: "none", cursor: idx === 0 ? "default" : "pointer", color: idx === 0 ? "#D6D0C0" : "#8A8497" }}><ChevronUp style={{ width: 12, height: 12 }} /></button>
                        <button type="button" disabled={idx === formFields.length - 1} onClick={() => setFormFields(prev => { const a = [...prev]; [a[idx], a[idx+1]] = [a[idx+1], a[idx]]; return a })} style={{ width: 20, height: 20, display: "flex", alignItems: "center", justifyContent: "center", background: "transparent", border: "none", cursor: idx === formFields.length - 1 ? "default" : "pointer", color: idx === formFields.length - 1 ? "#D6D0C0" : "#8A8497" }}><ChevronDown style={{ width: 12, height: 12 }} /></button>
                        <button type="button" onClick={() => setFormFields(prev => prev.filter(f => f.tempId !== field.tempId))} style={{ width: 20, height: 20, display: "flex", alignItems: "center", justifyContent: "center", background: "transparent", border: "none", cursor: "pointer", color: "#C4C0B0", marginLeft: 2 }}><Trash2 style={{ width: 11, height: 11 }} /></button>
                      </div>
                    </div>
                  </div>
                ))}

                <button
                  type="button"
                  onClick={() => setFormFields(prev => [...prev, { tempId: newTempId(), label: '', type: 'text', options: [], required: false }])}
                  style={{ display: "flex", alignItems: "center", gap: 6, padding: "7px 12px", borderRadius: 8, border: "1px dashed #C4C0B0", background: "transparent", color: "#8A8497", fontSize: 12, cursor: "pointer" }}
                >
                  <Plus style={{ width: 12, height: 12 }} /> Add question
                </button>
              </div>
            )}
          </div>
        </aside>
      </form>
    </AnimateIn>
  )
}

// ── Inline Edit Form (shared across card types) ──────────────────────────────

function InlineEditFields({
  title, body, audience, isEvent, showAttendees,
  onTitle, onBody, onAudience, onIsEvent, onShowAttendees,
  onSave, onCancel, saving, dark,
}: {
  title: string; body: string; audience: string; isEvent: boolean; showAttendees: boolean
  onTitle: (v: string) => void; onBody: (v: string) => void
  onAudience: (v: string) => void; onIsEvent: (v: boolean) => void; onShowAttendees: (v: boolean) => void
  onSave: () => void; onCancel: () => void
  saving: boolean; dark?: boolean
}) {
  const fg = dark ? "#F6F4EF" : "#13101A"
  const fgMuted = dark ? "rgba(246,244,239,0.55)" : "#8A8497"
  const fgBody = dark ? "rgba(246,244,239,0.78)" : "#5A5466"
  const borderColor = dark ? "rgba(246,244,239,0.18)" : "#ECE8DE"
  const chipSel = dark ? "rgba(246,244,239,0.22)" : "#3E1540"
  const chipSelText = dark ? "#F6F4EF" : "#F6F4EF"
  const chipUnsel = dark ? "transparent" : "transparent"
  const chipUnselText = dark ? "rgba(246,244,239,0.45)" : "#5A5466"
  const chipBorder = dark ? "rgba(246,244,239,0.2)" : "#E5E0D2"

  return (
    <div className="flex flex-col gap-3">
      {/* Title */}
      <input
        value={title}
        onChange={e => onTitle(e.target.value)}
        placeholder="Title…"
        style={{
          fontFamily: "var(--font-instrument-serif)", fontSize: 24, lineHeight: 1.1, letterSpacing: "-0.02em",
          color: fg, background: "transparent", border: "none", outline: "none", width: "100%",
          borderBottom: `1px solid ${borderColor}`, paddingBottom: 8,
        }}
      />
      {/* Body */}
      <textarea
        value={body}
        onChange={e => onBody(e.target.value)}
        rows={4}
        placeholder="Body…"
        style={{
          fontSize: 13, lineHeight: 1.6, color: fgBody,
          background: "transparent", border: "none", outline: "none", resize: "none", width: "100%",
        }}
      />
      {/* Audience chips */}
      <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
        {AUDIENCE_OPTIONS.map(opt => (
          <button
            key={opt.value}
            type="button"
            onClick={() => onAudience(opt.value)}
            style={{
              padding: "3px 10px", borderRadius: 999, fontSize: 11, fontWeight: 500, cursor: "pointer",
              background: audience === opt.value ? chipSel : chipUnsel,
              color: audience === opt.value ? chipSelText : chipUnselText,
              border: `1px solid ${audience === opt.value ? chipSel : chipBorder}`,
            }}
          >{opt.label}</button>
        ))}
      </div>
      {/* Is Event toggle */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", paddingTop: 2 }}>
        <span style={{ fontSize: 12, color: fgMuted }}>This is an event</span>
        <button
          type="button"
          onClick={() => onIsEvent(!isEvent)}
          style={{
            width: 36, height: 20, borderRadius: 999, position: "relative", border: "none", cursor: "pointer",
            background: isEvent ? (dark ? "rgba(246,244,239,0.4)" : "#3E1540") : (dark ? "rgba(246,244,239,0.15)" : "#E5E0D2"),
          }}
        >
          <span style={{
            position: "absolute", top: 2, width: 16, height: 16, borderRadius: "50%", background: "white",
            left: isEvent ? 18 : 2, transition: "left 0.15s",
          }} />
        </button>
      </div>
      {/* Show attendees toggle — only relevant for events */}
      {isEvent && (
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", paddingTop: 2 }}>
          <span style={{ fontSize: 12, color: fgMuted }}>Show attendees publicly</span>
          <button
            type="button"
            onClick={() => onShowAttendees(!showAttendees)}
            style={{
              width: 36, height: 20, borderRadius: 999, position: "relative", border: "none", cursor: "pointer",
              background: showAttendees ? (dark ? "rgba(246,244,239,0.4)" : "#3E1540") : (dark ? "rgba(246,244,239,0.15)" : "#E5E0D2"),
            }}
          >
            <span style={{
              position: "absolute", top: 2, width: 16, height: 16, borderRadius: "50%", background: "white",
              left: showAttendees ? 18 : 2, transition: "left 0.15s",
            }} />
          </button>
        </div>
      )}
      {/* Save / Cancel */}
      <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, paddingTop: 4 }}>
        <button
          type="button"
          onClick={onCancel}
          style={{ padding: "6px 14px", borderRadius: 8, fontSize: 13, cursor: "pointer", background: "transparent", border: `1px solid ${borderColor}`, color: fgMuted }}
        >Cancel</button>
        <button
          type="button"
          onClick={onSave}
          disabled={saving || !title.trim() || !body.trim()}
          style={{
            padding: "6px 14px", borderRadius: 8, fontSize: 13, fontWeight: 500, cursor: "pointer",
            background: dark ? "rgba(246,244,239,0.22)" : "#3E1540",
            color: dark ? "#F6F4EF" : "#F6F4EF",
            border: "none", opacity: saving || !title.trim() || !body.trim() ? 0.5 : 1,
          }}
        >{saving ? "Saving…" : "Save"}</button>
      </div>
    </div>
  )
}

// ── Announcements Tab ────────────────────────────────────────────────────────

export function AnnouncementsTab({ userId, userName, userRole, userGradYear, ministryId, ministryName }: AnnouncementsTabProps) {
  const supabase = createClient()
  const [announcements, setAnnouncements] = useState<EnrichedAnnouncement[]>([])
  const [loading, setLoading] = useState(true)
  const [showCreate, setShowCreate] = useState(false)
  const [compact, setCompact] = useState(false)
  const [filter, setFilter] = useState<FilterType>("all")

  const [editingAnnouncement, setEditingAnnouncement] = useState<EnrichedAnnouncement | null>(null)

  // Form fill overlay state
  const [formFillState, setFormFillState] = useState<{ formId: string; announcementId: string; title: string } | null>(null)

  const isLeaderOrAdmin = ["leader", "admin", "deacon", "elder", "pastor"].includes(userRole.toLowerCase())

  const loadAnnouncements = useCallback(async () => {
    let annQuery = supabase
      .from("announcements")
      .select("*")
      .eq("ministry_id", ministryId)
      .order("is_pinned", { ascending: false })
      .order("is_sub_pinned", { ascending: false })
      .order("created_at", { ascending: false })

    if (!isLeaderOrAdmin) {
      const audienceFilter = userGradYear
        ? `audience.is.null,audience.eq.all,audience.eq.${userGradYear},audience.eq.group`
        : `audience.is.null,audience.eq.all,audience.eq.group`
      annQuery = annQuery.or(audienceFilter).or("status.is.null,status.eq.published")
    }

    const { data: annData } = await annQuery
    const anns: Announcement[] = annData ?? []

    if (anns.length === 0) { setAnnouncements([]); setLoading(false); return }

    const ids = anns.map((a) => a.id)
    const [{ data: viewRows }, { data: rsvpRows }, { data: formRows }] = await Promise.all([
      supabase.from("announcement_views").select("announcement_id").in("announcement_id", ids),
      supabase.from("rsvps").select("announcement_id, user_id").in("announcement_id", ids),
      supabase.from("announcement_forms").select("id, announcement_id").in("announcement_id", ids),
    ])

    supabase.from("announcement_views")
      .upsert(ids.map((id) => ({ announcement_id: id, user_id: userId })), { onConflict: "announcement_id,user_id" })
      .then()

    // Form data
    const formByAnn: Record<string, string> = {}
    for (const f of formRows ?? []) formByAnn[f.announcement_id] = f.id
    const formIds = Object.values(formByAnn)
    const respondedFormIds = new Set<string>()
    if (formIds.length > 0) {
      const { data: responseRows } = await supabase
        .from("form_responses")
        .select("form_id")
        .in("form_id", formIds)
        .eq("user_id", userId)
      for (const r of responseRows ?? []) respondedFormIds.add(r.form_id)
    }

    // Fetch names for all RSVP attendees
    const allRsvpUserIds = [...new Set((rsvpRows ?? []).map((r) => r.user_id))]
    const profileNameMap: Record<string, string> = {}
    if (allRsvpUserIds.length > 0) {
      const { data: profileRows } = await supabase
        .from("profiles")
        .select("id, name")
        .in("id", allRsvpUserIds)
        .eq("ministry_id", ministryId)
      for (const p of profileRows ?? []) profileNameMap[p.id] = p.name
    }

    const viewMap: Record<string, number> = {}
    const rsvpCountMap: Record<string, number> = {}
    const rsvpAttendeesMap: Record<string, RsvpAttendee[]> = {}
    const userRsvpSet = new Set<string>()
    for (const v of viewRows ?? []) viewMap[v.announcement_id] = (viewMap[v.announcement_id] ?? 0) + 1
    for (const r of rsvpRows ?? []) {
      rsvpCountMap[r.announcement_id] = (rsvpCountMap[r.announcement_id] ?? 0) + 1
      if (!rsvpAttendeesMap[r.announcement_id]) rsvpAttendeesMap[r.announcement_id] = []
      rsvpAttendeesMap[r.announcement_id].push({ user_id: r.user_id, name: profileNameMap[r.user_id] ?? "Unknown" })
      if (r.user_id === userId) userRsvpSet.add(r.announcement_id)
    }

    setAnnouncements(anns.map((ann) => ({
      ...ann,
      show_attendees: ann.show_attendees ?? false,
      view_count: viewMap[ann.id] ?? 0,
      rsvp_count: rsvpCountMap[ann.id] ?? 0,
      user_has_rsvped: userRsvpSet.has(ann.id),
      rsvp_attendees: rsvpAttendeesMap[ann.id] ?? [],
      has_form: !!formByAnn[ann.id],
      form_id: formByAnn[ann.id] ?? null,
      user_has_responded: formByAnn[ann.id] ? respondedFormIds.has(formByAnn[ann.id]) : false,
    })))
    setLoading(false)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId])

  useEffect(() => { loadAnnouncements() }, [loadAnnouncements])

  // True toggle: flips going state and count, and optimistically updates attendee list
  function handleRsvpToggle(announcementId: string) {
    setAnnouncements((prev) =>
      prev.map((ann) => {
        if (ann.id !== announcementId) return ann
        const wasRsvped = ann.user_has_rsvped
        const newAttendees = wasRsvped
          ? ann.rsvp_attendees.filter((a) => a.user_id !== userId)
          : [...ann.rsvp_attendees, { user_id: userId, name: userName }]
        return {
          ...ann,
          user_has_rsvped: !wasRsvped,
          rsvp_count: wasRsvped ? Math.max(0, ann.rsvp_count - 1) : ann.rsvp_count + 1,
          rsvp_attendees: newAttendees,
        }
      })
    )
  }

  function handleNewAnnouncement(newAnn: Announcement) {
    setAnnouncements((prev) => [{ ...newAnn, show_attendees: newAnn.show_attendees ?? false, view_count: 0, rsvp_count: 0, user_has_rsvped: false, rsvp_attendees: [], has_form: false, form_id: null, user_has_responded: false }, ...prev])
  }

  function handleDeleteAnnouncement(id: string) {
    setAnnouncements((prev) => prev.filter((ann) => ann.id !== id))
  }

  function handleEditSuccess(updated: Announcement) {
    setAnnouncements((prev) => prev.map((ann) => ann.id === updated.id ? { ...ann, ...updated } : ann))
  }

  function handleOpenEditor(ann: EnrichedAnnouncement) {
    setEditingAnnouncement(ann)
  }

  async function handleDesktopDelete(ann: EnrichedAnnouncement) {
    setAnnouncements((prev) => prev.filter((a) => a.id !== ann.id))
    await createClient().from("announcements").delete().eq("id", ann.id).eq("ministry_id", ministryId)
  }

  async function handlePinToggle(annId: string, currentlyPinned: boolean) {
    const client = createClient()
    if (!currentlyPinned) {
      // Unpin any currently pinned announcement before pinning this one
      await client.from("announcements").update({ is_pinned: false }).eq("ministry_id", ministryId).eq("is_pinned", true)
    }
    await client.from("announcements").update({ is_pinned: !currentlyPinned }).eq("id", annId).eq("ministry_id", ministryId)
    setAnnouncements(prev => prev.map(a =>
      a.id === annId
        ? { ...a, is_pinned: !currentlyPinned }
        : { ...a, is_pinned: currentlyPinned ? a.is_pinned : false }
    ))
  }

  async function handleSubPinToggle(annId: string, currentlySubPinned: boolean) {
    const client = createClient()
    await client.from("announcements").update({ is_sub_pinned: !currentlySubPinned }).eq("id", annId).eq("ministry_id", ministryId)
    setAnnouncements(prev => prev.map(a =>
      a.id === annId ? { ...a, is_sub_pinned: !currentlySubPinned } : a
    ))
  }

  const pinnedAnn = announcements.find(a => a.is_pinned)
  const unpinned = announcements.filter(a => !a.is_pinned)
  const desktopList = pinnedAnn ? [pinnedAnn, ...unpinned] : unpinned
  const filteredDesktop = filter === "all" ? desktopList
    : filter === "events" ? desktopList.filter(a => a.is_event)
    : filter === "forms" ? desktopList.filter(a => a.has_form)
    : desktopList.filter(a => a.is_pinned || a.is_sub_pinned)

  const FILTERS: { id: FilterType; label: string }[] = [
    { id: "all", label: "All" },
    { id: "events", label: "Events" },
    { id: "forms", label: "Forms" },
    { id: "pinned", label: "Pinned" },
  ]

  return (
    <div className="pb-28 md:pb-0">
      <DesktopTopbar
        crumbs={["Central", "Announcements"]}
        right={isLeaderOrAdmin ? (
          <button
            onClick={() => setShowCreate(true)}
            className="hidden md:flex items-center gap-1.5 px-3.5 py-1.5 bg-[#13101A] hover:bg-[#2D0F2E] text-[#F6F4EF] rounded-lg text-[12px] font-medium transition-colors"
          >
            <Plus className="w-3.5 h-3.5" />New announcement
          </button>
        ) : undefined}
      />

      {/* Mobile Header */}
      <div className="flex items-center justify-between px-5 pt-14 pb-5 md:hidden">
        <a href="/landing" className="flex items-center gap-2.5" style={{ textDecoration: "none" }}>
          <RingCrossLogo size={26} color="#3E1540" />
          <span style={{ fontFamily: "var(--font-instrument-serif)", fontSize: "28px", color: "#13101A", letterSpacing: "-0.01em", lineHeight: 1 }}>{ministryName}</span>
        </a>
      </div>
      <div className="flex items-end justify-between px-5 mb-6 md:hidden">
        <h1 style={{ fontFamily: "var(--font-instrument-serif)", fontSize: "36px", fontWeight: 400, letterSpacing: "-0.02em", color: "#13101A", lineHeight: 1.05, margin: 0 }}>Announcements</h1>
        {isLeaderOrAdmin && (
          <button onClick={() => setShowCreate(true)} className="size-9 bg-[#3E1540] rounded-xl flex items-center justify-center hover:bg-[#2D0F2E] transition-colors">
            <Plus className="w-4 h-4 text-[#F6F4EF]" />
          </button>
        )}
      </div>

      {/* Desktop Editorial Header */}
      <div className="hidden md:flex items-end justify-between px-14 pt-11 pb-8 border-b border-[#E5E0D2]" style={{ gap: "24px" }}>
        <div>
          <p style={MONO_STYLE}>{announcements.length} total · {announcements.filter(a => !a.user_has_rsvped && a.is_event).length} unread</p>
          <h1 style={{ margin: "14px 0 0", fontFamily: "var(--font-instrument-serif)", fontWeight: 400, fontSize: "52px", lineHeight: 1.05, letterSpacing: "-0.01em", color: "#13101A" }}>Announcements</h1>
          <p style={{ marginTop: "12px", color: "#5A5466", fontSize: "14px", maxWidth: "560px" }}>What the ministry is planning, praying for, and showing up to.</p>
        </div>
        <div className="flex items-center gap-2 pb-1.5">
          <div className="flex border border-[#E5E0D2] rounded-lg overflow-hidden">
            <button onClick={() => setCompact(false)} className="px-3 py-1.5 text-[12px] transition-colors" style={{ background: !compact ? "#EFEAE0" : "transparent", fontWeight: !compact ? 500 : 400, border: "none", cursor: "pointer" }}>Cards</button>
            <button onClick={() => setCompact(true)} className="px-3 py-1.5 text-[12px] transition-colors" style={{ background: compact ? "#EFEAE0" : "transparent", fontWeight: compact ? 500 : 400, border: "none", cursor: "pointer" }}>Compact</button>
          </div>
        </div>
      </div>

      {loading ? (
        <div className="px-5 md:px-14"><Spinner /></div>
      ) : announcements.length === 0 ? (
        <div className="px-5 md:px-14">
          <EmptyState icon={<Bell className="w-7 h-7" />} title="No announcements yet" subtitle={isLeaderOrAdmin ? "Post the first announcement." : "Check back soon for updates"} />
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
                featured={idx === 0}
                userId={userId}
                ministryId={ministryId}
                userRole={userRole}
                onRsvpToggle={handleRsvpToggle}
                onEdit={handleOpenEditor}
                onDelete={handleDeleteAnnouncement}
                onPinToggle={handlePinToggle}
                onSubPinToggle={handleSubPinToggle}
                onOpenForm={(formId, annId, title) => setFormFillState({ formId, announcementId: annId, title })}
              />
            ))}
          </div>

          {/* Desktop layout */}
          <div className="hidden md:block px-14 py-7">
            {/* Filter chips */}
            <div className="flex gap-2 mb-6">
              {FILTERS.map((f) => (
                <button key={f.id} onClick={() => setFilter(f.id)} style={{ padding: "7px 14px", borderRadius: 999, fontSize: "12px", fontWeight: 500, border: filter === f.id ? "1px solid #13101A" : "1px solid #E5E0D2", background: filter === f.id ? "#13101A" : "transparent", color: filter === f.id ? "#F6F4EF" : "#13101A", cursor: "pointer" }}>{f.label}</button>
              ))}
            </div>

            {/* Pinned hero strip */}
            {pinnedAnn && filter === "all" && (
              <div className="rounded-xl overflow-hidden mb-6 relative" style={{ background: "#3E1540", color: "#F6F4EF", padding: "22px 28px", }}>
                <div className="absolute rounded-full pointer-events-none" style={{ top: -80, right: 80, width: 280, height: 280, background: "radial-gradient(circle, rgba(246,244,239,0.14), transparent 60%)" }} />
                <div className="relative">
                  <div style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: "24px", alignItems: "center" }}>
                    <div>
                      <p style={{ fontSize: "11px", letterSpacing: "1px", textTransform: "uppercase", opacity: 0.6, marginBottom: "8px" }}>📌 Pinned</p>
                      <h2 className="line-clamp-2" style={{ margin: 0, fontFamily: "var(--font-instrument-serif)", fontWeight: 400, fontSize: "32px", lineHeight: 1.1 }}>{pinnedAnn.title}</h2>
                      <p style={{ marginTop: "6px", fontSize: "13px", opacity: 0.78 }} className="line-clamp-2">{pinnedAnn.body}</p>
                    </div>
                    <div className="flex gap-2.5 items-center">
                      {pinnedAnn.is_event && (
                        <button onClick={() => handleRsvpToggle(pinnedAnn.id)} style={{ background: pinnedAnn.user_has_rsvped ? "rgba(255,255,255,0.15)" : "#F6F4EF", color: pinnedAnn.user_has_rsvped ? "#F6F4EF" : "#13101A", border: 0, padding: "8px 18px", borderRadius: "8px", fontWeight: 500, fontSize: "13px", cursor: "pointer" }}>
                          {pinnedAnn.user_has_rsvped ? "Going ✓" : "RSVP"}
                        </button>
                      )}
                      {isLeaderOrAdmin && (
                        <>
                          <button onClick={() => setEditingAnnouncement(pinnedAnn)} style={{ width: 32, height: 32, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(255,255,255,0.1)", border: "1px solid rgba(255,255,255,0.2)", borderRadius: "8px", cursor: "pointer" }} title="Edit">
                            <Edit3 className="w-3.5 h-3.5 text-[#F6F4EF]" />
                          </button>
                          <button onClick={() => handleDesktopDelete(pinnedAnn)} style={{ width: 32, height: 32, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(239,68,68,0.15)", border: "1px solid rgba(239,68,68,0.3)", borderRadius: "8px", cursor: "pointer" }} title="Delete">
                            <Trash2 className="w-3.5 h-3.5 text-red-300" />
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {filteredDesktop.length === 0 ? (
              <EmptyState icon={<Bell className="w-7 h-7" />} title="No results" subtitle="Try a different filter" />
            ) : compact ? (
              /* Compact table */
              <div className="rounded-xl border border-[#E5E0D2] bg-[#FBF8F2] overflow-hidden">
                <div className="grid px-5 py-2.5 border-b border-[#E5E0D2]" style={{ gridTemplateColumns: "100px 1.5fr 1fr 100px", gap: "12px" }}>
                  {["Type", "Title", "When", "Action"].map(h => <span key={h} style={MONO_STYLE}>{h}</span>)}
                </div>
                {filteredDesktop.map((ann, i) => (
                  <div key={ann.id} style={{ borderTop: i ? "1px solid #EFEAE0" : undefined }}>
                    <div className="grid px-5 py-3.5 items-center" style={{ gridTemplateColumns: "100px 1.5fr 1fr 100px", gap: "12px" }}>
                      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                        <span style={{ fontSize: "10px", letterSpacing: "0.8px", padding: "3px 9px", borderRadius: "6px", background: "#F4F1E8", border: "1px solid #E5E0D2", textTransform: "uppercase", fontWeight: 500, width: "fit-content" }}>{ann.is_event ? "Event" : "Post"}</span>
                        {ann.status === "draft" && <span style={{ fontSize: "10px", letterSpacing: "0.8px", padding: "3px 9px", borderRadius: "6px", background: "#FFF8E1", border: "1px solid #FDE68A", textTransform: "uppercase", fontWeight: 500, color: "#B45309", width: "fit-content" }}>Draft</span>}
                      </div>
                      <div>
                        <div style={{ fontFamily: "var(--font-instrument-serif)", fontSize: "17px", lineHeight: 1.2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{ann.title}</div>
                        <div style={{ fontSize: "12px", color: "#8A8497", marginTop: "2px", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{ann.body}</div>
                      </div>
                      <div style={{ fontSize: "12px", color: "#5A5466" }}>{formatDate(ann.created_at)}</div>
                      <div className="flex justify-end items-center gap-1.5">
                        {ann.is_event && (
                          <button onClick={() => handleRsvpToggle(ann.id)} style={{ padding: "4px 10px", borderRadius: "6px", fontSize: "11px", border: "1px solid #E5E0D2", cursor: "pointer", background: ann.user_has_rsvped ? "#EFEAE0" : "transparent" }}>
                            {ann.user_has_rsvped ? "Going" : "RSVP"}
                          </button>
                        )}
                        {isLeaderOrAdmin && (
                          <>
                            <button onClick={() => handlePinToggle(ann.id, ann.is_pinned)} className="w-7 h-7 flex items-center justify-center rounded-md hover:bg-[#EFEAE0] transition-colors" title={ann.is_pinned ? "Unpin hero" : "Pin as hero"}>
                              {ann.is_pinned ? <PinOff className="w-3.5 h-3.5 text-[#3E1540]" /> : <Pin className="w-3.5 h-3.5 text-[#5A5466]" />}
                            </button>
                            <button onClick={() => handleSubPinToggle(ann.id, ann.is_sub_pinned)} className={`w-7 h-7 flex items-center justify-center rounded-md transition-colors ${ann.is_sub_pinned ? "bg-[#F1ECFF] hover:bg-[#E8E0F8]" : "hover:bg-[#EFEAE0]"}`} title={ann.is_sub_pinned ? "Remove from For You" : "Pin to For You"}>
                              <Pin className={`w-3.5 h-3.5 ${ann.is_sub_pinned ? "text-[#3E1540]" : "text-[#A09A8C]"}`} style={{ transform: "rotate(-45deg)" }} />
                            </button>
                            <button onClick={() => setEditingAnnouncement(ann)} className="w-7 h-7 flex items-center justify-center rounded-md hover:bg-[#EFEAE0] transition-colors" title="Edit"><Edit3 className="w-3.5 h-3.5 text-[#5A5466]" /></button>
                            <button onClick={() => handleDesktopDelete(ann)} className="w-7 h-7 flex items-center justify-center rounded-md hover:bg-red-50 transition-colors" title="Delete"><Trash2 className="w-3.5 h-3.5 text-red-400" /></button>
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              /* Editorial 2-col cards */
              <div className="grid gap-5" style={{ gridTemplateColumns: "1fr 1fr" }}>
                {filteredDesktop.map((ann) => (
                  <article key={ann.id} className="rounded-2xl border border-[#E5E0D2] bg-[#FBF8F2] overflow-hidden hover:shadow-[0_2px_8px_rgba(19,16,26,0.06)] transition-shadow duration-200">
                    <div style={{ padding: "26px 28px 22px" }}>
                      <div className="flex justify-between items-center mb-4">
                        <span style={MONO_STYLE}>{formatDate(ann.created_at)}</span>
                        <div style={{ display: "flex", gap: 4 }}>
                          {ann.status === "draft" && <span style={{ fontSize: "10px", letterSpacing: "0.8px", padding: "3px 9px", borderRadius: 999, background: "#FFF8E1", border: "1px solid #FDE68A", textTransform: "uppercase", fontWeight: 500, color: "#B45309" }}>Draft</span>}
                          {ann.is_pinned && <span style={{ fontSize: "10px", letterSpacing: "0.8px", padding: "3px 9px", borderRadius: 999, background: "#3E1540", textTransform: "uppercase", fontWeight: 500, color: "#F6F4EF" }}>📌 Pinned</span>}
                          {ann.is_sub_pinned && <span style={{ fontSize: "10px", letterSpacing: "0.8px", padding: "3px 9px", borderRadius: 999, background: "#F1ECFF", border: "1px solid #D8CAFF", textTransform: "uppercase", fontWeight: 500, color: "#3E1540" }}>For You</span>}
                          <span style={{ fontSize: "10px", letterSpacing: "0.8px", padding: "3px 9px", borderRadius: 999, background: "#EFEAE0", textTransform: "uppercase", fontWeight: 500, color: "#13101A" }}>{ann.is_event ? "Event" : "Post"}</span>
                        </div>
                      </div>
                      <h3 className="line-clamp-2" style={{ margin: 0, fontFamily: "var(--font-instrument-serif)", fontWeight: 400, fontSize: "28px", lineHeight: 1.1, letterSpacing: "-0.01em", color: "#13101A" }}>{ann.title}</h3>
                      <p style={{ marginTop: "14px", fontSize: "14px", color: "#5A5466", lineHeight: 1.55 }} className="line-clamp-3">{ann.body}</p>
                      <div style={{ marginTop: "22px", paddingTop: "16px", borderTop: "1px solid #EFEAE0" }}>
                        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "8px" }}>
                          <span style={{ fontSize: "12px", color: "#8A8497" }}>{ann.rsvp_count} going · {ann.view_count} views</span>
                          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                            {ann.has_form && (
                              ann.user_has_responded
                                ? <span style={{ fontSize: 12, color: "#2E7D32", fontWeight: 500, display: "flex", alignItems: "center", gap: 4 }}><FileText style={{ width: 12, height: 12 }} />Form submitted</span>
                                : <button onClick={() => setFormFillState({ formId: ann.form_id!, announcementId: ann.id, title: ann.title })} style={{ padding: "5px 12px", borderRadius: 8, border: "1px solid #3E1540", background: "transparent", color: "#3E1540", fontSize: 12, fontWeight: 500, cursor: "pointer", display: "flex", alignItems: "center", gap: 5 }}><FileText style={{ width: 11, height: 11 }} />Fill out form</button>
                            )}
                            {ann.is_event && (
                              <button onClick={() => handleRsvpToggle(ann.id)} style={{ background: ann.user_has_rsvped ? "#EFEAE0" : "transparent", color: "#13101A", border: "1px solid #13101A", padding: "8px 16px", borderRadius: 999, fontSize: "12px", fontWeight: 500, cursor: "pointer" }}>
                                {ann.user_has_rsvped ? "Going ✓" : "RSVP"}
                              </button>
                            )}
                            {isLeaderOrAdmin && (
                              <>
                                <button onClick={() => handlePinToggle(ann.id, ann.is_pinned)} className="w-8 h-8 flex items-center justify-center rounded-lg border border-[#E5E0D2] hover:bg-[#EFEAE0] transition-colors" title={ann.is_pinned ? "Unpin hero" : "Pin as hero"}>
                                  {ann.is_pinned ? <PinOff className="w-3.5 h-3.5 text-[#3E1540]" /> : <Pin className="w-3.5 h-3.5 text-[#5A5466]" />}
                                </button>
                                <button onClick={() => handleSubPinToggle(ann.id, ann.is_sub_pinned)} className={`w-8 h-8 flex items-center justify-center rounded-lg border transition-colors ${ann.is_sub_pinned ? "border-[#D8CAFF] bg-[#F1ECFF] hover:bg-[#E8E0F8]" : "border-[#E5E0D2] hover:bg-[#EFEAE0]"}`} title={ann.is_sub_pinned ? "Remove from For You" : "Pin to For You"}>
                                  <Pin className={`w-3.5 h-3.5 ${ann.is_sub_pinned ? "text-[#3E1540]" : "text-[#A09A8C]"}`} style={{ transform: "rotate(-45deg)" }} />
                                </button>
                                <button onClick={() => setEditingAnnouncement(ann)} className="w-8 h-8 flex items-center justify-center rounded-lg border border-[#E5E0D2] hover:bg-[#EFEAE0] transition-colors" title="Edit"><Edit3 className="w-3.5 h-3.5 text-[#5A5466]" /></button>
                                <button onClick={() => handleDesktopDelete(ann)} className="w-8 h-8 flex items-center justify-center rounded-lg border border-[#E5E0D2] hover:bg-red-50 hover:border-red-200 transition-colors" title="Delete"><Trash2 className="w-3.5 h-3.5 text-red-400" /></button>
                              </>
                            )}
                          </div>
                        </div>
                        {ann.is_event && ann.rsvp_attendees.length > 0 && (isLeaderOrAdmin || ann.show_attendees) && (
                          <div style={{ marginTop: 12 }}>
                            <div className="flex flex-wrap gap-1.5">
                              {ann.rsvp_attendees.slice(0, 10).map(a => (
                                <span key={a.user_id} style={{ fontSize: "11px", color: "#5A5466", background: "#F4F1E8", border: "1px solid #E5E0D2", padding: "2px 8px", borderRadius: 999 }}>{a.name.split(" ")[0]}</span>
                              ))}
                              {ann.rsvp_attendees.length > 10 && (
                                <span style={{ fontSize: "11px", color: "#8A8497", padding: "2px 4px" }}>+{ann.rsvp_attendees.length - 10} more</span>
                              )}
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  </article>
                ))}
              </div>
            )}
          </div>
        </>
      )}

      {isLeaderOrAdmin && (
        <button
          onClick={() => setShowCreate(true)}
          style={{ position: "fixed", bottom: "6.5rem", right: "max(calc(50% - 195px + 16px), 16px)" }}
          className="md:hidden w-12 h-12 bg-[#3E1540] rounded-2xl flex items-center justify-center z-40 hover:bg-[#2D0F2E] active:scale-[0.97] transition-[transform,background-color] duration-150"
          aria-label="New announcement"
        >
          <Plus className="w-6 h-6 text-[#F6F4EF]" />
        </button>
      )}

      {showCreate && (
        <CreateAnnouncementModal userId={userId} ministryId={ministryId} onClose={() => setShowCreate(false)} onSuccess={handleNewAnnouncement} />
      )}

      {editingAnnouncement && (
        <CreateAnnouncementModal userId={userId} ministryId={ministryId} existing={editingAnnouncement} onClose={() => setEditingAnnouncement(null)} onSuccess={handleEditSuccess} />
      )}

      {formFillState && (
        <FormFillView
          formId={formFillState.formId}
          announcementId={formFillState.announcementId}
          announcementTitle={formFillState.title}
          userId={userId}
          ministryId={ministryId}
          onClose={() => setFormFillState(null)}
          onSubmitted={() => {
            setAnnouncements(prev => prev.map(a => a.form_id === formFillState.formId ? { ...a, user_has_responded: true } : a))
            setFormFillState(null)
          }}
        />
      )}
    </div>
  )
}

// ── Announcement Detail ──────────────────────────────────────────────────────

export function AnnouncementDetail({ announcement, userId, userRole, onClose, onRsvpToggle }: AnnouncementDetailProps) {
  const supabase = createClient()
  const [rsvping, setRsvping] = useState(false)

  const isLeaderOrAdmin = ["leader", "admin", "deacon", "elder", "pastor"].includes(userRole.toLowerCase())

  async function handleRsvp() {
    if (rsvping) return
    setRsvping(true)
    onRsvpToggle(announcement.id)
    if (announcement.user_has_rsvped) {
      await supabase.from("rsvps").delete().eq("announcement_id", announcement.id).eq("user_id", userId)
    } else {
      await supabase.from("rsvps").upsert({ announcement_id: announcement.id, user_id: userId }, { onConflict: "announcement_id,user_id" })
    }
    setRsvping(false)
  }

  const showAttendeeList = announcement.is_event && announcement.rsvp_attendees.length > 0 && (isLeaderOrAdmin || announcement.show_attendees)

  return (
    <AnimateIn className="fixed inset-0 z-50 bg-white flex flex-col md:left-[296px]">
      <div className="max-w-[390px] mx-auto w-full h-full flex flex-col md:max-w-none">
        <div className="flex-shrink-0 flex items-center gap-3 px-5 pt-12 pb-4 md:pt-5 bg-white border-b border-[#ECE8DE]">
          <button onClick={onClose} className="w-9 h-9 rounded-full bg-[#FBF8F2] flex items-center justify-center flex-shrink-0 hover:bg-[#F2EDE0] transition-colors"><ArrowLeft className="w-4 h-4 text-[#3E1540]" /></button>
          <span className="text-[15px] font-semibold text-[#13101A]">Announcement</span>
        </div>
        <div className="flex-1 overflow-y-auto px-5 py-6">
          <div className="flex items-center gap-1.5 text-[13px] text-[#8A8497] mb-5">
            <Calendar className="w-3.5 h-3.5 flex-shrink-0" />
            <span>{formatDate(announcement.created_at)}</span>
          </div>
          <h1 style={{ fontFamily: "var(--font-instrument-serif)", fontSize: "30px", fontWeight: 400, letterSpacing: "-0.02em", color: "#13101A", lineHeight: 1.1, marginBottom: "16px" }}>{announcement.title}</h1>
          <p className="text-[14px] text-[#5A5466] leading-relaxed whitespace-pre-wrap">{announcement.body}</p>
          {showAttendeeList && (
            <div className="mt-6 pt-5 border-t border-[#EFEAE0]">
              <p className="text-[11px] font-semibold text-[#8A8497] uppercase tracking-wider mb-3">{announcement.rsvp_count} going</p>
              <div className="flex flex-wrap gap-2">
                {announcement.rsvp_attendees.map(a => (
                  <span key={a.user_id} style={{ fontSize: "12px", color: "#5A5466", background: "#F4F1E8", border: "1px solid #E5E0D2", padding: "4px 10px", borderRadius: 999 }}>{a.name.split(" ")[0]}</span>
                ))}
              </div>
            </div>
          )}
        </div>
        {announcement.is_event && (
          <div className="flex-shrink-0 bg-white border-t border-[#ECE8DE] px-5 py-4 pb-20">
            <button onClick={handleRsvp} disabled={rsvping} className={`w-full rounded-xl py-4 font-semibold text-[15px] transition-colors ${announcement.user_has_rsvped ? "bg-[#3E1540]/10 text-[#3E1540] hover:bg-[#3E1540]/15 active:scale-[0.97]" : "bg-[#3E1540] hover:bg-[#2D0F2E] text-[#F6F4EF] active:scale-[0.97]"}`}>
              {announcement.user_has_rsvped ? <span className="flex items-center justify-center gap-1.5"><Check className="w-4 h-4" />You&apos;re going — tap to undo</span> : "RSVP"}
            </button>
          </div>
        )}
      </div>
    </AnimateIn>
  )
}

// ── Announcement Card (mobile) ───────────────────────────────────────────────

export function AnnouncementCard({ announcement, isPinned, featured = false, userId, ministryId, userRole, onRsvpToggle, onEdit, onDelete, onPinToggle, onSubPinToggle, onOpenForm }: AnnouncementCardProps) {
  const supabase = createClient()
  const [rsvping, setRsvping] = useState(false)
  const [showMenu, setShowMenu] = useState(false)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [showDetail, setShowDetail] = useState(false)

  const isAdminOrLeader = ["admin", "leader", "deacon", "elder"].includes(userRole.toLowerCase())

  async function handleRsvp() {
    if (rsvping) return
    setRsvping(true)
    onRsvpToggle(announcement.id)
    if (announcement.user_has_rsvped) {
      await supabase.from("rsvps").delete().eq("announcement_id", announcement.id).eq("user_id", userId)
    } else {
      await supabase.from("rsvps").upsert({ announcement_id: announcement.id, user_id: userId }, { onConflict: "announcement_id,user_id" })
    }
    setRsvping(false)
  }

  async function handleDelete() {
    setDeleting(true)
    await supabase.from("announcements").delete().eq("id", announcement.id).eq("ministry_id", ministryId)
    onDelete(announcement.id)
  }

  // ── Featured (plum) card ──
  if (featured) {
    return (
      <>
        <div className="relative rounded-[22px] bg-[#3E1540] overflow-hidden shadow-[0_2px_8px_rgba(19,16,26,0.08)]">
          <div className="absolute -top-[70px] -right-[70px] w-[220px] h-[220px] rounded-full bg-[radial-gradient(circle,rgba(246,244,239,0.18)_0%,transparent_70%)] pointer-events-none" />

          {announcement.image_url && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={announcement.image_url} alt={announcement.title} className="w-full h-44 object-cover" />
          )}

          <div className="p-6 relative">
            <div className="flex items-start justify-between mb-3">
              <div className="flex items-center gap-2 flex-wrap">
                {isPinned && <span style={{ ...MONO_STYLE, color: "rgba(246,244,239,0.7)" }}>Pinned ·</span>}
                {!isPinned && announcement.is_sub_pinned && <span style={{ ...MONO_STYLE, color: "rgba(246,244,239,0.7)" }}>For You ·</span>}
                <span style={{ ...MONO_STYLE, color: "rgba(246,244,239,0.7)" }}>{announcement.is_event ? "Event" : formatDate(announcement.created_at)}</span>
                {announcement.audience && announcement.audience !== "all" && (
                  <span style={{ fontSize: "9px", letterSpacing: "0.1em", padding: "2px 8px", borderRadius: 999, background: "rgba(255,255,255,0.15)", color: "#F6F4EF", textTransform: "uppercase", fontWeight: 500 }}>{audienceLabel(announcement.audience)}</span>
                )}
              </div>
              <div className="flex items-center gap-2">
                {announcement.view_count > 0 && (
                  <span className="flex items-center gap-1" style={{ fontSize: "10px", color: "rgba(246,244,239,0.5)", fontWeight: 500 }}><Users className="w-3 h-3" />{announcement.view_count}</span>
                )}
                {isAdminOrLeader && (
                  <div className="relative">
                    {showMenu && <div className="fixed inset-0 z-[5]" onClick={() => setShowMenu(false)} />}
                    <button onClick={(e) => { e.stopPropagation(); setShowMenu((v) => !v) }} className="w-7 h-7 rounded-full flex items-center justify-center hover:bg-white/10 transition-colors">
                      <MoreHorizontal className="w-4 h-4 text-[rgba(246,244,239,0.6)]" />
                    </button>
                    {showMenu && (
                      <div className="absolute top-8 right-0 z-[10] bg-white rounded-xl shadow-[0_4px_14px_rgba(19,16,26,0.12)] border border-[#ECE8DE] py-1 min-w-[140px]">
                        <button onClick={() => { setShowMenu(false); onPinToggle?.(announcement.id, announcement.is_pinned) }} className="w-full flex items-center gap-2.5 px-4 py-2.5 text-[13px] font-medium text-[#13101A] hover:bg-[#FBF8F2] transition-colors text-left">
                          {announcement.is_pinned ? <PinOff className="w-3.5 h-3.5 text-[#3E1540]" /> : <Pin className="w-3.5 h-3.5 text-[#3E1540]" />}
                          {announcement.is_pinned ? "Unpin hero" : "Pin as hero"}
                        </button>
                        <button onClick={() => { setShowMenu(false); onSubPinToggle?.(announcement.id, announcement.is_sub_pinned) }} className="w-full flex items-center gap-2.5 px-4 py-2.5 text-[13px] font-medium text-[#13101A] hover:bg-[#FBF8F2] transition-colors text-left">
                          <Pin className="w-3.5 h-3.5 text-[#3E1540]" style={{ transform: "rotate(-45deg)" }} />
                          {announcement.is_sub_pinned ? "Remove from For You" : "Pin to For You"}
                        </button>
                        <button onClick={() => { setShowMenu(false); onEdit(announcement) }} className="w-full flex items-center gap-2.5 px-4 py-2.5 text-[13px] font-medium text-[#13101A] hover:bg-[#FBF8F2] transition-colors text-left"><Edit3 className="w-3.5 h-3.5 text-[#3E1540]" />Edit</button>
                        <button onClick={() => { setShowMenu(false); setShowDeleteConfirm(true) }} className="w-full flex items-center gap-2.5 px-4 py-2.5 text-[13px] font-medium text-red-500 hover:bg-red-50 transition-colors text-left"><Trash2 className="w-3.5 h-3.5" />Delete</button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>

            <h3 className="line-clamp-2" style={{ fontFamily: "var(--font-instrument-serif)", fontSize: "30px", lineHeight: 1.05, letterSpacing: "-0.02em", color: "#F6F4EF", margin: "0 0 8px" }}>{announcement.title}</h3>
            <p className="text-[13px] leading-relaxed line-clamp-3 mb-1" style={{ color: "rgba(246,244,239,0.72)" }}>{announcement.body}</p>
            <button onClick={() => setShowDetail(true)} className="text-[12px] font-medium mb-4 transition-colors" style={{ color: "rgba(246,244,239,0.5)" }}>Read more</button>

            {announcement.is_event && (
              <>
                <div className="flex items-center gap-4">
                  <button onClick={handleRsvp} disabled={rsvping} className={`font-bold py-3 px-7 rounded-full transition-all text-[14px] ${announcement.user_has_rsvped ? "bg-white/20 text-[#F6F4EF] hover:bg-white/30 active:scale-[0.97]" : "bg-[#F6F4EF] text-[#3E1540] hover:bg-white active:scale-[0.97]"}`}>
                    {announcement.user_has_rsvped ? <span className="flex items-center gap-1.5"><Check className="w-3.5 h-3.5" />Going</span> : "RSVP"}
                  </button>
                  {announcement.rsvp_count > 0 && <span className="text-[12px] font-medium" style={{ color: "rgba(246,244,239,0.5)" }}>{announcement.rsvp_count} going</span>}
                </div>
                {announcement.rsvp_attendees.length > 0 && (isAdminOrLeader || announcement.show_attendees) && (
                  <div className="mt-4 flex flex-wrap gap-1.5">
                    {announcement.rsvp_attendees.slice(0, 8).map(a => (
                      <span key={a.user_id} style={{ fontSize: "11px", color: "rgba(246,244,239,0.75)", background: "rgba(246,244,239,0.12)", border: "1px solid rgba(246,244,239,0.2)", padding: "2px 9px", borderRadius: 999 }}>{a.name.split(" ")[0]}</span>
                    ))}
                    {announcement.rsvp_attendees.length > 8 && (
                      <span style={{ fontSize: "11px", color: "rgba(246,244,239,0.45)", padding: "2px 4px" }}>+{announcement.rsvp_attendees.length - 8} more</span>
                    )}
                  </div>
                )}
              </>
            )}
            {announcement.has_form && (
              <div className="mt-3">
                {announcement.user_has_responded
                  ? <span style={{ fontSize: 12, color: "rgba(246,244,239,0.6)", display: "flex", alignItems: "center", gap: 5 }}><Check style={{ width: 12, height: 12 }} />Form submitted</span>
                  : <button onClick={() => announcement.form_id && onOpenForm(announcement.form_id, announcement.id, announcement.title)} style={{ padding: "8px 16px", borderRadius: 999, border: "1px solid rgba(246,244,239,0.4)", background: "transparent", color: "#F6F4EF", fontSize: 13, fontWeight: 500, cursor: "pointer" }}>Fill out form →</button>
                }
              </div>
            )}
          </div>

          {showDeleteConfirm && (
            <div className="absolute inset-0 z-[20] bg-[#3E1540]/95 backdrop-blur-sm rounded-[22px] flex flex-col items-center justify-center gap-3 p-7">
              <div className="w-11 h-11 rounded-full bg-white/10 flex items-center justify-center mb-1"><Trash2 className="w-5 h-5 text-red-400" /></div>
              <p className="text-[15px] font-bold text-[#F6F4EF] text-center">Delete this announcement?</p>
              <p className="text-[12px] text-center -mt-1" style={{ color: "rgba(246,244,239,0.5)" }}>This can&apos;t be undone.</p>
              <div className="flex gap-3 w-full mt-1">
                <button onClick={() => setShowDeleteConfirm(false)} disabled={deleting} className="flex-1 py-2.5 rounded-full border border-white/20 text-[13px] font-semibold text-[#F6F4EF] hover:bg-white/10 transition-colors disabled:opacity-50">Cancel</button>
                <button onClick={handleDelete} disabled={deleting} className="flex-1 py-2.5 rounded-full bg-red-500 text-white text-[13px] font-semibold hover:bg-red-600 transition-colors disabled:opacity-50">{deleting ? "Deleting…" : "Delete"}</button>
              </div>
            </div>
          )}
        </div>

        {showDetail && <AnnouncementDetail announcement={announcement} userId={userId} userRole={userRole} onClose={() => setShowDetail(false)} onRsvpToggle={onRsvpToggle} />}
      </>
    )
  }

  // ── Ivory card ──
  return (
    <>
      <div className="relative rounded-[22px] bg-white border border-[#E5E0D2] overflow-hidden shadow-[0_1px_4px_rgba(19,16,26,0.06)]">
        {announcement.image_url && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={announcement.image_url} alt={announcement.title} className="w-full h-36 object-cover" />
        )}

        <div className="p-5">
          <div className="flex items-start justify-between mb-2.5">
            <div className="flex items-center gap-2 flex-wrap">
              <span style={MONO_STYLE}>{announcement.is_event ? "Event" : formatDate(announcement.created_at)}</span>
              {announcement.audience && announcement.audience !== "all" && (
                <span style={{ fontSize: "9px", letterSpacing: "0.08em", padding: "2px 7px", borderRadius: 999, background: "#EFEAE0", color: "#5A5466", textTransform: "uppercase", fontWeight: 500 }}>{audienceLabel(announcement.audience)}</span>
              )}
            </div>
            {isAdminOrLeader && (
              <div className="relative">
                {showMenu && <div className="fixed inset-0 z-[5]" onClick={() => setShowMenu(false)} />}
                <button onClick={(e) => { e.stopPropagation(); setShowMenu((v) => !v) }} className="w-7 h-7 rounded-full flex items-center justify-center hover:bg-[#F4F1E8] transition-colors">
                  <MoreHorizontal className="w-4 h-4 text-[#8A8497]" />
                </button>
                {showMenu && (
                  <div className="absolute top-8 right-0 z-[10] bg-white rounded-xl shadow-[0_4px_14px_rgba(19,16,26,0.12)] border border-[#ECE8DE] py-1 min-w-[140px]">
                    <button onClick={() => { setShowMenu(false); onPinToggle?.(announcement.id, announcement.is_pinned) }} className="w-full flex items-center gap-2.5 px-4 py-2.5 text-[13px] font-medium text-[#13101A] hover:bg-[#FBF8F2] transition-colors text-left">
                      {announcement.is_pinned ? <PinOff className="w-3.5 h-3.5 text-[#3E1540]" /> : <Pin className="w-3.5 h-3.5 text-[#3E1540]" />}
                      {announcement.is_pinned ? "Unpin" : "Pin"}
                    </button>
                    <button onClick={() => { setShowMenu(false); onEdit(announcement) }} className="w-full flex items-center gap-2.5 px-4 py-2.5 text-[13px] font-medium text-[#13101A] hover:bg-[#FBF8F2] transition-colors text-left"><Edit3 className="w-3.5 h-3.5 text-[#3E1540]" />Edit</button>
                    <button onClick={() => { setShowMenu(false); setShowDeleteConfirm(true) }} className="w-full flex items-center gap-2.5 px-4 py-2.5 text-[13px] font-medium text-red-500 hover:bg-red-50 transition-colors text-left"><Trash2 className="w-3.5 h-3.5" />Delete</button>
                  </div>
                )}
              </div>
            )}
          </div>

          <h3 className="line-clamp-2" style={{ fontFamily: "var(--font-instrument-serif)", fontSize: "22px", lineHeight: 1.1, letterSpacing: "-0.01em", color: "#13101A", margin: "0 0 6px" }}>{announcement.title}</h3>
          <p className="text-[13px] leading-relaxed line-clamp-2 mb-1" style={{ color: "#5A5466" }}>{announcement.body}</p>
          <button onClick={() => setShowDetail(true)} className="text-[12px] font-medium text-[#8A8497] hover:text-[#3E1540] mb-4 transition-colors">Read more</button>

          {announcement.is_event && (
            <div className="pt-3 border-t border-[#EFEAE0]">
              <div className="flex items-center gap-3">
                <button onClick={handleRsvp} disabled={rsvping} className={`font-semibold py-2 px-5 rounded-full transition-all text-[13px] ${announcement.user_has_rsvped ? "bg-[#EFEAE0] text-[#5A5466] hover:bg-[#E5E0D2] active:scale-[0.97]" : "bg-[#3E1540] text-[#F6F4EF] hover:bg-[#2D0F2E] active:scale-[0.97]"}`}>
                  {announcement.user_has_rsvped ? <span className="flex items-center gap-1.5"><Check className="w-3 h-3" />Going</span> : "RSVP"}
                </button>
                {announcement.rsvp_count > 0 && <span className="text-[12px] text-[#8A8497] font-medium">{announcement.rsvp_count} going</span>}
              </div>
              {announcement.rsvp_attendees.length > 0 && (isAdminOrLeader || announcement.show_attendees) && (
                <div className="mt-2.5 flex flex-wrap gap-1.5">
                  {announcement.rsvp_attendees.slice(0, 8).map(a => (
                    <span key={a.user_id} style={{ fontSize: "11px", color: "#5A5466", background: "#F4F1E8", border: "1px solid #E5E0D2", padding: "2px 8px", borderRadius: 999 }}>{a.name.split(" ")[0]}</span>
                  ))}
                  {announcement.rsvp_attendees.length > 8 && (
                    <span style={{ fontSize: "11px", color: "#8A8497", padding: "2px 4px" }}>+{announcement.rsvp_attendees.length - 8} more</span>
                  )}
                </div>
              )}
            </div>
          )}
          {announcement.has_form && (
            <div className={`${!announcement.is_event ? "pt-3 border-t border-[#EFEAE0]" : "mt-2"}`}>
              {announcement.user_has_responded
                ? <span style={{ fontSize: 12, color: "#2E7D32", fontWeight: 500, display: "flex", alignItems: "center", gap: 5 }}><Check style={{ width: 12, height: 12 }} />Form submitted</span>
                : <button onClick={() => announcement.form_id && onOpenForm(announcement.form_id, announcement.id, announcement.title)} style={{ padding: "8px 16px", borderRadius: 999, border: "1px solid #3E1540", background: "transparent", color: "#3E1540", fontSize: 13, fontWeight: 500, cursor: "pointer" }}>Fill out form →</button>
              }
            </div>
          )}
        </div>

        {showDeleteConfirm && (
          <div className="absolute inset-0 z-[20] bg-white/95 backdrop-blur-sm rounded-[22px] flex flex-col items-center justify-center gap-3 p-7">
            <div className="w-11 h-11 rounded-full bg-red-50 flex items-center justify-center mb-1"><Trash2 className="w-5 h-5 text-red-400" /></div>
            <p className="text-[15px] font-bold text-[#13101A] text-center">Delete this announcement?</p>
            <p className="text-[12px] text-[#8A8497] text-center -mt-1">This can&apos;t be undone.</p>
            <div className="flex gap-3 w-full mt-1">
              <button onClick={() => setShowDeleteConfirm(false)} disabled={deleting} className="flex-1 py-2.5 rounded-full border border-[#E5E0D2] text-[13px] font-semibold text-[#5A5466] hover:bg-[#F4F1E8] transition-colors disabled:opacity-50">Cancel</button>
              <button onClick={handleDelete} disabled={deleting} className="flex-1 py-2.5 rounded-full bg-red-500 text-white text-[13px] font-semibold hover:bg-red-600 transition-colors disabled:opacity-50">{deleting ? "Deleting…" : "Delete"}</button>
            </div>
          </div>
        )}
      </div>

      {showDetail && <AnnouncementDetail announcement={announcement} userId={userId} userRole={userRole} onClose={() => setShowDetail(false)} onRsvpToggle={onRsvpToggle} />}
    </>
  )
}
