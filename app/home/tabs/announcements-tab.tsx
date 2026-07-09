"use client"

import { useState, useEffect, useRef, useCallback } from "react"
import { createPortal } from "react-dom"
import useSWR from "swr"
import { ArrowLeft, X, Check, ImageIcon, Trash2, Bell, Calendar, MoreHorizontal, Plus, Edit3, FileText, Pin, PinOff, Users, Eye } from "lucide-react"
import { createClient } from "@/lib/supabase"
import { logAudit } from "@/lib/audit"
import { EmptyState, RingCrossLogo, MONO_STYLE, EYEBROW_STYLE } from "../components/shared"
import { TabPageHeader, PageTitle, AnnouncementsListSkeleton, FilterDropdown, CentralButton, SubpageShell, ContentActionButton, ConfirmDialog } from "@/components/central"
import { getInitials, formatRelativeTime, audienceLabel, formatDate, previewBody } from "../utils"
import { FormFillView } from "./forms-tab"
import type { AnnouncementsTabProps, AnnouncementCardProps, CreateAnnouncementModalProps, Announcement, EnrichedAnnouncement, RsvpAttendee } from "../types"

// A form that can be attached to this announcement (standalone or already ours).
interface AttachableForm {
  id: string
  title: string
  field_count: number
}

// ── Attach-a-form picker ──────────────────────────────────────────────────────
// Shared by the desktop settings rail AND the mobile single-column composer — same
// state (attachedFormId / availableForms), no data logic here. Header + hint +
// single-select list (re-select to detach); "Detach" also lives in the header.
function AttachFormSection({ attachedFormId, setAttachedFormId, availableForms, monoStyle }: {
  attachedFormId: string | null
  setAttachedFormId: (id: string | null) => void
  availableForms: AttachableForm[]
  monoStyle: React.CSSProperties
}) {
  return (
    <>
      <div className="flex items-center justify-between mb-1">
        <p style={monoStyle}>Form</p>
        {attachedFormId && (
          <button
            type="button"
            onClick={() => setAttachedFormId(null)}
            style={{ fontSize: 12, color: "var(--muted-text)", background: "transparent", border: "none", cursor: "pointer", padding: 0 }}
          >Detach</button>
        )}
      </div>
      <p className="text-[12px] text-[var(--muted-text)] mb-4">Attach a form to collect responses</p>

      {availableForms.length === 0 ? (
        <p className="text-[12px] text-[var(--muted-text)]">No forms yet — create one in the Forms tab.</p>
      ) : (
        <div className="flex flex-col gap-2">
          {availableForms.map(f => {
            const selected = attachedFormId === f.id
            return (
              <button
                key={f.id}
                type="button"
                onClick={() => setAttachedFormId(selected ? null : f.id)}
                style={{
                  display: "flex", alignItems: "center", gap: 10, padding: "10px 12px", borderRadius: 10,
                  cursor: "pointer", textAlign: "left", width: "100%",
                  border: `1px solid ${selected ? "var(--plum)" : "var(--line-2)"}`,
                  background: selected ? "var(--plum)" : "var(--ivory)",
                  color: selected ? "var(--cream-on-dark)" : "var(--ink)",
                  transition: "all 0.12s",
                }}
              >
                <span style={{
                  width: 16, height: 16, borderRadius: "50%", flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center",
                  border: `2px solid ${selected ? "var(--cream-on-dark)" : "var(--dashed)"}`,
                  background: selected ? "rgba(246,244,239,0.25)" : "transparent",
                }}>
                  {selected && <Check style={{ width: 9, height: 9, color: "var(--cream-on-dark)" }} />}
                </span>
                <span style={{ flex: 1, minWidth: 0 }}>
                  <span className="line-clamp-1" style={{ fontSize: 13, fontWeight: 500 }}>{f.title}</span>
                  <span style={{ display: "block", fontSize: 11, color: selected ? "rgba(246,244,239,0.7)" : "var(--muted-text)", marginTop: 1 }}>{f.field_count} question{f.field_count !== 1 ? "s" : ""}</span>
                </span>
              </button>
            )
          })}
        </div>
      )}
    </>
  )
}

// Convert a stored ISO timestamp to the local `YYYY-MM-DDTHH:mm` value a
// <input type="datetime-local"> expects (local time, not UTC).
function isoToLocalInput(iso: string | null | undefined): string {
  if (!iso) return ""
  const d = new Date(iso)
  if (isNaN(d.getTime())) return ""
  const pad = (n: number) => String(n).padStart(2, "0")
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

const AUDIENCE_OPTIONS = [
  { value: "all", label: "Everyone" },
  { value: "2025", label: "Class of 2025" },
  { value: "2026", label: "Class of 2026" },
  { value: "2027", label: "Class of 2027" },
  { value: "2028", label: "Class of 2028" },
  { value: "group", label: "Specific Group" },
]

// Draft status pill — derived from the --gold semantic accent (R10 status layer),
// never an invented traffic-light hex. borderRadius is applied inline per call site.
const DRAFT_PILL_STYLE: React.CSSProperties = {
  fontSize: "10px", letterSpacing: "0.8px", padding: "3px 9px", textTransform: "uppercase", fontWeight: 500,
  background: "color-mix(in srgb, var(--gold) 13%, var(--cream))",
  border: "1px solid color-mix(in srgb, var(--gold) 30%, var(--cream))",
  color: "color-mix(in srgb, var(--gold) 65%, var(--ink))",
}

type FilterType = "all" | "events" | "forms" | "pinned"

const FILTERS: { id: FilterType; label: string }[] = [
  { id: "all", label: "All" },
  { id: "events", label: "Events" },
  { id: "forms", label: "Forms" },
  { id: "pinned", label: "Pinned" },
]

// ── Create Modal (new only) ──────────────────────────────────────────────────

export function CreateAnnouncementModal({ userId, ministryId, existing, onClose, onSuccess }: CreateAnnouncementModalProps) {
  const supabase = createClient()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const isEditing = !!existing

  const [title, setTitle] = useState(existing?.title ?? "")
  const [body, setBody] = useState(existing?.body ?? "")
  const [audience, setAudience] = useState(existing?.audience ?? "all")
  const [isEvent, setIsEvent] = useState(existing?.is_event ?? false)
  const [eventDate, setEventDate] = useState(isoToLocalInput(existing?.event_date))
  const [showAttendees, setShowAttendees] = useState(existing?.show_attendees ?? false)
  const [imageFile, setImageFile] = useState<File | null>(null)
  const [imagePreview, setImagePreview] = useState<string | null>(existing?.image_url ?? null)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Form attachment (forms are first-class objects now — built in the Forms tab,
  // attached here). A form belongs to 0-or-1 announcement.
  const [attachedFormId, setAttachedFormId] = useState<string | null>(null)
  const [initialFormId, setInitialFormId] = useState<string | null>(null)
  const [availableForms, setAvailableForms] = useState<AttachableForm[]>([])

  // Load attachable forms: unarchived + (unattached OR already attached to THIS
  // announcement when editing). Prime the current attachment on the edit path.
  useEffect(() => {
    async function loadForms() {
      let q = supabase
        .from("announcement_forms")
        .select("id, title, announcement_id")
        .eq("ministry_id", ministryId)
        .eq("archived", false)
      if (isEditing && existing) q = q.or(`announcement_id.is.null,announcement_id.eq.${existing.id}`)
      else q = q.is("announcement_id", null)
      const { data: forms } = await q
      const formList = forms ?? []

      const formIds = formList.map(f => f.id)
      const fieldCounts: Record<string, number> = {}
      if (formIds.length > 0) {
        const { data: fieldRows } = await supabase.from("form_fields").select("form_id").in("form_id", formIds)
        for (const r of fieldRows ?? []) fieldCounts[r.form_id] = (fieldCounts[r.form_id] ?? 0) + 1
      }

      setAvailableForms(formList.map(f => ({ id: f.id, title: f.title ?? "Untitled form", field_count: fieldCounts[f.id] ?? 0 })))

      if (isEditing && existing) {
        const current = formList.find(f => f.announcement_id === existing.id)
        setAttachedFormId(current?.id ?? null)
        setInitialFormId(current?.id ?? null)
      }
    }
    loadForms()
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
    if (!asDraft && isEvent && !eventDate.trim()) { setError("Events need a date & time before publishing."); return }
    setSubmitting(true)
    setError(null)
    const status = asDraft ? "draft" : "published"

    let imageUrl: string | null = null
    if (imageFile) {
      const ext = imageFile.name.split(".").pop()
      // Ministry-scoped path — matches the `announcement_images_insert` storage
      // RLS policy (announcements/<ministry_id>/…). A bucket-root path is denied.
      const fileName = `announcements/${ministryId}/${Date.now()}.${ext}`
      const { data: uploadData, error: uploadError } = await supabase.storage
        .from("announcement-images")
        .upload(fileName, imageFile, { upsert: false })
      if (uploadError || !uploadData) {
        // Surface the failure instead of silently publishing with no image.
        setError(`Image upload failed: ${uploadError?.message ?? "unknown error"}`)
        setSubmitting(false)
        return
      }
      const { data: { publicUrl } } = supabase.storage.from("announcement-images").getPublicUrl(uploadData.path)
      imageUrl = publicUrl
    } else if (imagePreview) {
      imageUrl = imagePreview
    }

    let announcementId: string
    let resultAnn: Announcement

    if (isEditing && existing) {
      const { data, error: updateError } = await supabase
        .from("announcements")
        .update({ title: title.trim(), body: body.trim(), audience, is_event: isEvent, event_date: isEvent && eventDate ? new Date(eventDate).toISOString() : null, show_attendees: showAttendees, image_url: imageUrl, status })
        .eq("id", existing.id).eq("ministry_id", ministryId).select().maybeSingle()
      if (updateError) { setError(updateError.message); setSubmitting(false); return }
      announcementId = existing.id
      resultAnn = (data ?? { ...existing, title: title.trim(), body: body.trim(), audience, is_event: isEvent, event_date: isEvent && eventDate ? new Date(eventDate).toISOString() : null, show_attendees: showAttendees, image_url: imageUrl }) as Announcement
    } else {
      const { data, error: insertError } = await supabase
        .from("announcements")
        .insert({ title: title.trim(), body: body.trim(), audience, is_event: isEvent, event_date: isEvent && eventDate ? new Date(eventDate).toISOString() : null, show_attendees: showAttendees, is_pinned: false, image_url: imageUrl, created_by: userId, ministry_id: ministryId, status })
        .select().single()
      if (insertError) { setError(insertError.message); setSubmitting(false); return }
      announcementId = data.id
      resultAnn = data as Announcement
    }

    // Reconcile the form attachment by flipping announcement_forms.announcement_id.
    // No form_fields writes here — fields are owned by the Forms-tab builder.
    if (attachedFormId !== initialFormId) {
      // Detach the previously-attached form unconditionally.
      if (initialFormId) {
        await supabase.from("announcement_forms").update({ announcement_id: null }).eq("id", initialFormId).eq("ministry_id", ministryId)
      }
      // Attach the newly-picked form ONLY if it's still unattached (TOCTOU guard):
      // the `.is("announcement_id", null)` predicate + affected-row check catches a
      // form that was grabbed by another announcement between load and save.
      if (attachedFormId) {
        const { data: attached } = await supabase
          .from("announcement_forms")
          .update({ announcement_id: announcementId })
          .eq("id", attachedFormId).eq("ministry_id", ministryId).is("announcement_id", null)
          .select("id")
        if (!attached || attached.length === 0) {
          setError("That form was just attached to another announcement — pick another.")
          setSubmitting(false)
          return
        }
      }
    }

    onSuccess(resultAnn, { has_form: attachedFormId != null, form_id: attachedFormId })
    onClose()
  }

  const monoStyle = EYEBROW_STYLE
  const titleText = isEditing ? "Edit announcement" : "New announcement"

  // Primary + secondary action buttons (shared by mobile + desktop headers).
  const PublishButton = (
    <CentralButton
      type="button"
      variant="primary"
      disabled={submitting}
      onClick={e => handleSubmit(e as unknown as React.FormEvent, false)}
      style={{ height: 28, padding: "0 16px", borderRadius: 9, fontSize: 13, flexShrink: 0 }}
    >
      {submitting ? "Saving…" : isEditing ? "Save changes" : "Publish"}
    </CentralButton>
  )
  const DraftButton = !isEditing ? (
    <button
      type="button"
      disabled={submitting}
      onClick={e => handleSubmit(e as unknown as React.FormEvent, true)}
      className="flex items-center justify-center transition-colors disabled:opacity-50 hover:bg-[var(--ivory)]"
      style={{ height: 28, padding: "0 14px", borderRadius: 9, border: "1px solid var(--line)", background: "transparent", color: "var(--ink)", fontSize: 13, fontWeight: 500, cursor: submitting ? "default" : "pointer", flexShrink: 0 }}
    >
      Save draft
    </button>
  ) : null

  return (
    <div className="pb-28 md:pb-0 md:flex md:flex-col md:h-full md:overflow-hidden" style={{ background: "var(--cream)" }}>
      {/* ── Mobile header — safe-area inset, back affordance ── */}
      <div className="md:hidden flex items-center gap-3 px-5 pt-12 pb-4" style={{ borderBottom: "1px solid var(--line)" }}>
        <button onClick={onClose} aria-label="Back" className="w-9 h-9 flex items-center justify-center rounded-xl -ml-1 hover:bg-[var(--ivory)] transition-colors">
          <ArrowLeft className="w-5 h-5" style={{ color: "var(--plum)" }} />
        </button>
        <span style={{ fontFamily: "var(--serif)", fontSize: 24, fontWeight: 600, letterSpacing: "-0.02em", color: "var(--ink)", lineHeight: 1.05 }}>{titleText}</span>
        <div className="flex items-center gap-2 ml-auto">
          {DraftButton}
          {PublishButton}
        </div>
      </div>

      {/* ── Mobile: scrollable single column on cream ── */}
      <div className="md:hidden flex-1 overflow-y-auto min-h-0 px-5 py-5 flex flex-col gap-5">
        {error && <div className="rounded-xl px-4 py-3 text-[13px] text-[var(--plum)] font-medium" style={{ background: "rgba(62,21,64,0.08)" }}>{error}</div>}
        {/* Writing surface */}
        <div className="flex flex-col">
          <input
            type="text" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="A clear, scannable headline" required
            className="placeholder:text-[var(--faint)]"
            style={{ fontFamily: "var(--font-instrument-serif)", fontSize: 26, fontWeight: 600, letterSpacing: "-0.02em", color: "var(--ink)", lineHeight: 1.1, background: "transparent", border: "none", borderBottom: "1px solid var(--line-2)", outline: "none", width: "100%", paddingBottom: 12 }}
          />
          <textarea
            value={body} onChange={(e) => setBody(e.target.value)} placeholder="Write the full announcement here…" required rows={8}
            className="placeholder:text-[var(--faint)]"
            style={{ fontFamily: "var(--font-instrument-serif)", fontSize: 17, lineHeight: 1.6, color: "var(--ink)", background: "transparent", border: "none", outline: "none", resize: "none", width: "100%", marginTop: 16 }}
          />
        </div>

        <div style={{ borderTop: "1px solid var(--line)" }} />

        {/* Audience */}
        <div>
          <p style={monoStyle} className="mb-3">Audience</p>
          <div className="flex flex-wrap gap-2">
            {AUDIENCE_OPTIONS.map((opt) => (
              <button
                key={opt.value} type="button" onClick={() => setAudience(opt.value)}
                style={{
                  padding: "6px 12px", borderRadius: 999, fontSize: 12, fontWeight: 500, cursor: "pointer",
                  border: `1px solid ${audience === opt.value ? "var(--plum)" : "var(--line)"}`,
                  background: audience === opt.value ? "var(--plum)" : "var(--ivory)",
                  color: audience === opt.value ? "var(--cream)" : "var(--body)",
                  transition: "all 0.15s",
                }}
              >{opt.label}</button>
            ))}
          </div>
        </div>

        <div style={{ borderTop: "1px solid var(--line)" }} />

        {/* Options */}
        <div className="flex flex-col gap-5">
          <p style={monoStyle}>Options</p>
          <div className="flex items-start gap-3">
            <button type="button" onClick={() => setIsEvent((v) => !v)} style={{ width: 34, height: 20, borderRadius: 999, background: isEvent ? "var(--plum)" : "var(--dashed)", border: "none", cursor: "pointer", position: "relative", flexShrink: 0, marginTop: 2, transition: "background 0.2s" }}>
              <span style={{ position: "absolute", top: 2, width: 16, height: 16, borderRadius: 999, background: "var(--cream)", transition: "left 0.2s", left: isEvent ? "16px" : "2px" }} />
            </button>
            <div>
              <p className="text-[13px] font-medium text-[var(--ink)]">This is an event</p>
              <p className="text-[12px] text-[var(--muted-text)] mt-0.5">Adds RSVP button + calendar marker</p>
            </div>
          </div>
          {isEvent && (
            <div className="flex flex-col gap-5">
              <div className="flex flex-col gap-1.5">
                <p className="text-[13px] font-medium text-[var(--ink)]">Event date &amp; time</p>
                <input
                  type="datetime-local" value={eventDate} onChange={(e) => setEventDate(e.target.value)} required
                  style={{ fontSize: 13, color: "var(--ink)", background: "var(--ivory)", border: "1px solid var(--line)", borderRadius: "var(--r-input)", padding: "8px 10px", outline: "none", width: "100%", fontFamily: "inherit" }}
                />
              </div>
              <div className="flex items-start gap-3">
                <button type="button" onClick={() => setShowAttendees((v) => !v)} style={{ width: 34, height: 20, borderRadius: 999, background: showAttendees ? "var(--plum)" : "var(--dashed)", border: "none", cursor: "pointer", position: "relative", flexShrink: 0, marginTop: 2, transition: "background 0.2s" }}>
                  <span style={{ position: "absolute", top: 2, width: 16, height: 16, borderRadius: 999, background: "var(--cream)", transition: "left 0.2s", left: showAttendees ? "16px" : "2px" }} />
                </button>
                <div>
                  <p className="text-[13px] font-medium text-[var(--ink)]">Show attendees publicly</p>
                  <p className="text-[12px] text-[var(--muted-text)] mt-0.5">Members can see who&apos;s going</p>
                </div>
              </div>
            </div>
          )}
        </div>

        <div style={{ borderTop: "1px solid var(--line)" }} />

        {/* Attachment */}
        <div>
          <p style={monoStyle} className="mb-3">Attachment</p>
          {imagePreview ? (
            <div className="relative rounded-[10px] overflow-hidden">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={imagePreview} alt="Preview" className="w-full h-44 object-cover" />
              <button type="button" onClick={removeImage} className="absolute top-2 right-2 w-7 h-7 rounded-full bg-black/50 flex items-center justify-center hover:bg-black/70 transition-colors"><X className="w-3.5 h-3.5 text-[var(--cream)]" /></button>
            </div>
          ) : (
            <button type="button" onClick={() => fileInputRef.current?.click()} className="w-full py-7 rounded-[10px] flex flex-col items-center justify-center gap-2 text-[var(--body)] transition-all" style={{ border: "1px dashed var(--dashed)", background: "transparent" }}>
              <ImageIcon className="w-5 h-5" />
              <span className="text-[12px]">Add image or file</span>
            </button>
          )}
          <input ref={fileInputRef} type="file" accept="image/*" onChange={handleImageChange} className="hidden" />
        </div>

        <div style={{ borderTop: "1px solid var(--line)" }} />

        {/* Attach a form — same picker as the desktop rail */}
        <div>
          <AttachFormSection
            attachedFormId={attachedFormId}
            setAttachedFormId={setAttachedFormId}
            availableForms={availableForms}
            monoStyle={monoStyle}
          />
        </div>
      </div>

      {/* ── Desktop: two-column editorial layout, all on cream ── */}
      <div className="hidden md:flex flex-1 overflow-hidden min-h-0">
        {/* Writing surface */}
        <div className="flex-1 flex flex-col overflow-hidden min-h-0" style={{ borderRight: "1px solid var(--line)" }}>
          <div className="flex-1 overflow-y-auto min-h-0 flex flex-col px-14 pt-5 pb-6">
            {error && <div className="mb-6 rounded-xl px-4 py-3 text-[13px] text-[var(--plum)] font-medium" style={{ background: "rgba(62,21,64,0.08)" }}>{error}</div>}
            {/* Inline serif title — §4.4 */}
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="A clear, scannable headline"
              className="placeholder:text-[var(--faint)]"
              style={{
                fontFamily: "var(--font-instrument-serif)", fontSize: "36px", fontWeight: 600,
                letterSpacing: "-0.02em", color: "var(--ink)", lineHeight: 1.15,
                background: "transparent", border: "none", borderBottom: "1px solid var(--line-2)",
                outline: "none", width: "100%", paddingBottom: "16px", flexShrink: 0,
              }}
            />
            {/* Serif body — §4.4 */}
            <textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder="Write the full announcement here. Take all the space you need — share scripture, walk through logistics, link to sign-ups."
              className="placeholder:text-[var(--faint)] flex-1"
              style={{
                fontFamily: "var(--font-instrument-serif)", fontSize: "19px", lineHeight: "1.65",
                color: "var(--ink)", background: "transparent", border: "none", outline: "none",
                resize: "none", width: "100%", marginTop: "22px", minHeight: "540px",
              }}
            />
          </div>
        </div>

        {/* Right settings rail — 280px, flat sections separated by hairlines */}
        <aside className="w-[280px] flex-shrink-0 overflow-y-auto min-h-0 flex flex-col">
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
                    border: `1px solid ${audience === opt.value ? "var(--plum-2)" : "var(--line)"}`,
                    background: audience === opt.value ? "var(--plum-2)" : "var(--ivory)",
                    color: audience === opt.value ? "var(--cream)" : "var(--body)",
                    transition: "all 0.15s",
                  }}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          <div style={{ borderTop: "1px solid var(--line)", marginLeft: "24px", marginRight: "24px" }} />

          {/* Options — §4.9 toggles */}
          <div className="px-6 py-6 flex flex-col gap-5">
            <p style={monoStyle}>Options</p>
            <div className="flex items-start gap-3">
              <button
                type="button"
                onClick={() => setIsEvent((v) => !v)}
                style={{ width: 34, height: 20, borderRadius: 999, background: isEvent ? "var(--plum)" : "var(--dashed)", border: "none", cursor: "pointer", position: "relative", flexShrink: 0, marginTop: 2, transition: "background 0.2s" }}
              >
                <span style={{ position: "absolute", top: 2, width: 16, height: 16, borderRadius: 999, background: "var(--cream)", transition: "left 0.2s", left: isEvent ? "16px" : "2px" }} />
              </button>
              <div>
                <p className="text-[13px] font-medium text-[var(--ink)]">This is an event</p>
                <p className="text-[12px] text-[var(--muted-text)] mt-0.5">Adds RSVP button + calendar marker</p>
              </div>
            </div>
            {isEvent && (
              <div className="flex flex-col gap-5">
                <div className="flex flex-col gap-1.5">
                  <p className="text-[13px] font-medium text-[var(--ink)]">Event date &amp; time</p>
                  <input
                    type="datetime-local" value={eventDate} onChange={(e) => setEventDate(e.target.value)} required
                    style={{ fontSize: 13, color: "var(--ink)", background: "var(--ivory)", border: "1px solid var(--line)", borderRadius: "var(--r-input)", padding: "8px 10px", outline: "none", width: "100%", fontFamily: "inherit" }}
                  />
                </div>
                <div className="flex items-start gap-3">
                  <button
                    type="button"
                    onClick={() => setShowAttendees((v) => !v)}
                    style={{ width: 34, height: 20, borderRadius: 999, background: showAttendees ? "var(--plum)" : "var(--dashed)", border: "none", cursor: "pointer", position: "relative", flexShrink: 0, marginTop: 2, transition: "background 0.2s" }}
                  >
                    <span style={{ position: "absolute", top: 2, width: 16, height: 16, borderRadius: 999, background: "var(--cream)", transition: "left 0.2s", left: showAttendees ? "16px" : "2px" }} />
                  </button>
                  <div>
                    <p className="text-[13px] font-medium text-[var(--ink)]">Show attendees publicly</p>
                    <p className="text-[12px] text-[var(--muted-text)] mt-0.5">Members can see who&apos;s going</p>
                  </div>
                </div>
              </div>
            )}
          </div>

          <div style={{ borderTop: "1px solid var(--line)", marginLeft: "24px", marginRight: "24px" }} />

          {/* Attachment — §4.19 dashed placeholder */}
          <div className="px-6 py-6">
            <p style={monoStyle} className="mb-3">Attachment</p>
            {imagePreview ? (
              <div className="relative rounded-[10px] overflow-hidden">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={imagePreview} alt="Preview" className="w-full h-36 object-cover" />
                <button type="button" onClick={removeImage} className="absolute top-2 right-2 w-7 h-7 rounded-full bg-black/50 flex items-center justify-center hover:bg-black/70 transition-colors">
                  <X className="w-3.5 h-3.5 text-[var(--cream)]" />
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="w-full rounded-[10px] bg-transparent flex flex-col items-center justify-center gap-2 text-[var(--body)] hover:bg-[var(--ivory)] transition-all"
                style={{ border: "1px dashed var(--dashed)", paddingTop: 14, paddingBottom: 14 }}
              >
                <ImageIcon className="w-4 h-4" />
                <span className="text-[12px]">Add image or file</span>
              </button>
            )}
            <input ref={fileInputRef} type="file" accept="image/*" onChange={handleImageChange} className="hidden" />
          </div>

          <div style={{ borderTop: "1px solid var(--line)", marginLeft: "24px", marginRight: "24px" }} />

          {/* Attach a form — forms are built in the Forms tab and attached here */}
          <div className="px-6 py-6">
            <AttachFormSection
              attachedFormId={attachedFormId}
              setAttachedFormId={setAttachedFormId}
              availableForms={availableForms}
              monoStyle={monoStyle}
            />
          </div>
        </aside>
      </div>

      {/* ── Desktop footer — relocated Save draft + Publish actions ── */}
      <div className="hidden md:flex items-center justify-end gap-3 px-14 py-4 flex-shrink-0" style={{ borderTop: "1px solid var(--line)" }}>
        {DraftButton}
        {PublishButton}
      </div>
    </div>
  )
}

// ── Inline Edit Form (shared across card types) ──────────────────────────────

function InlineEditFields({
  title, body, audience, isEvent, eventDate, showAttendees,
  onTitle, onBody, onAudience, onIsEvent, onEventDate, onShowAttendees,
  onSave, onCancel, saving, dark,
}: {
  title: string; body: string; audience: string; isEvent: boolean; eventDate: string; showAttendees: boolean
  onTitle: (v: string) => void; onBody: (v: string) => void
  onAudience: (v: string) => void; onIsEvent: (v: boolean) => void; onEventDate: (v: string) => void; onShowAttendees: (v: boolean) => void
  onSave: () => void; onCancel: () => void
  saving: boolean; dark?: boolean
}) {
  const fg = dark ? "var(--cream-on-dark)" : "var(--ink)"
  const fgMuted = dark ? "rgba(246,244,239,0.55)" : "var(--muted-text)"
  const fgBody = dark ? "rgba(246,244,239,0.78)" : "var(--body)"
  const borderColor = dark ? "rgba(246,244,239,0.18)" : "var(--line)"
  const chipSel = dark ? "rgba(246,244,239,0.22)" : "var(--plum)"
  const chipSelText = dark ? "var(--cream-on-dark)" : "var(--cream)"
  const chipUnsel = dark ? "transparent" : "transparent"
  const chipUnselText = dark ? "rgba(246,244,239,0.45)" : "var(--body)"
  const chipBorder = dark ? "rgba(246,244,239,0.2)" : "var(--line)"

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
            background: isEvent ? (dark ? "rgba(246,244,239,0.4)" : "var(--plum)") : (dark ? "rgba(246,244,239,0.15)" : "var(--line)"),
          }}
        >
          <span style={{
            position: "absolute", top: 2, width: 16, height: 16, borderRadius: "50%", background: "var(--cream)",
            left: isEvent ? 18 : 2, transition: "left 0.15s",
          }} />
        </button>
      </div>
      {/* Event date + show attendees — only relevant for events */}
      {isEvent && (
        <div style={{ display: "flex", flexDirection: "column", gap: 6, paddingTop: 2 }}>
          <span style={{ fontSize: 12, color: fgMuted }}>Event date &amp; time</span>
          <input
            type="datetime-local" value={eventDate} onChange={(e) => onEventDate(e.target.value)} required
            style={{ fontSize: 12, color: fg, background: "transparent", border: `1px solid ${borderColor}`, borderRadius: "var(--r-input)", padding: "7px 9px", outline: "none", width: "100%", fontFamily: "inherit" }}
          />
        </div>
      )}
      {isEvent && (
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", paddingTop: 2 }}>
          <span style={{ fontSize: 12, color: fgMuted }}>Show attendees publicly</span>
          <button
            type="button"
            onClick={() => onShowAttendees(!showAttendees)}
            style={{
              width: 36, height: 20, borderRadius: 999, position: "relative", border: "none", cursor: "pointer",
              background: showAttendees ? (dark ? "rgba(246,244,239,0.4)" : "var(--plum)") : (dark ? "rgba(246,244,239,0.15)" : "var(--line)"),
            }}
          >
            <span style={{
              position: "absolute", top: 2, width: 16, height: 16, borderRadius: "50%", background: "var(--cream)",
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
            background: dark ? "rgba(246,244,239,0.22)" : "var(--plum)",
            color: dark ? "var(--cream-on-dark)" : "var(--cream)",
            border: "none", opacity: saving || !title.trim() || !body.trim() ? 0.5 : 1,
          }}
        >{saving ? "Saving…" : "Save"}</button>
      </div>
    </div>
  )
}

// ── Announcements Tab ────────────────────────────────────────────────────────

// Desktop ⋯ overflow menu — one helper reused by all three desktop layouts
// (pinned hero, compact table, editorial cards). Matches the hand-rolled
// absolute-dropdown + fixed-backdrop shape used by the mobile AnnouncementCard.
function DesktopActionMenu({
  open, onToggle, onClose, isPinned, isSubPinned, showPin, showSubPin,
  onPin, onSubPin, onEdit, onDelete,
}: {
  open: boolean
  onToggle: () => void
  onClose: () => void
  isPinned: boolean
  isSubPinned: boolean
  showPin: boolean
  showSubPin: boolean
  onPin: () => void
  onSubPin: () => void
  onEdit: () => void
  onDelete: () => void
}) {
  const item = "w-full flex items-center gap-2.5 px-4 py-2.5 text-[13px] font-medium hover:bg-[var(--cream-2)] transition-colors text-left"
  const triggerRef = useRef<HTMLButtonElement>(null)
  // Fixed-position anchor measured from the trigger so the portaled panel hugs
  // the trigger's right edge and escapes every overflow-hidden ancestor.
  const [pos, setPos] = useState<{ top: number; right: number } | null>(null)

  const measure = useCallback(() => {
    const r = triggerRef.current?.getBoundingClientRect()
    if (r) setPos({ top: r.bottom + 4, right: window.innerWidth - r.right })
  }, [])

  // While open, keep the panel anchored and dismiss on scroll/resize so a stale
  // fixed menu never floats away from its trigger as the list scrolls.
  useEffect(() => {
    if (!open) return
    measure()
    const onScroll = () => onClose()
    const onResize = () => onClose()
    window.addEventListener("scroll", onScroll, true)
    window.addEventListener("resize", onResize)
    return () => {
      window.removeEventListener("scroll", onScroll, true)
      window.removeEventListener("resize", onResize)
    }
  }, [open, measure, onClose])

  return (
    <>
      <button
        ref={triggerRef}
        onClick={(e) => { e.stopPropagation(); onToggle() }}
        className="w-8 h-8 flex items-center justify-center rounded-lg border border-[var(--line)] hover:bg-[var(--line-3)] transition-colors"
        title="More actions"
      >
        <MoreHorizontal className="w-4 h-4 text-[var(--muted-text)]" />
      </button>
      {open && pos && typeof document !== "undefined" && createPortal(
        <>
          <div className="fixed inset-0 z-[200]" onClick={onClose} />
          <div
            className="fixed z-[201] bg-[var(--cream-panel)] rounded-xl border border-[var(--line)] py-1 min-w-[176px]"
            style={{ top: pos.top, right: pos.right }}
            onClick={(e) => e.stopPropagation()}
          >
            {showPin && (
              <button onClick={() => { onClose(); onPin() }} className={`${item} text-[var(--ink)]`}>
                {isPinned ? <PinOff className="w-3.5 h-3.5 text-[var(--plum)]" /> : <Pin className="w-3.5 h-3.5 text-[var(--plum)]" />}
                {isPinned ? "Unpin hero" : "Pin as hero"}
              </button>
            )}
            {showSubPin && (
              <button onClick={() => { onClose(); onSubPin() }} className={`${item} text-[var(--ink)]`}>
                <Pin className="w-3.5 h-3.5 text-[var(--plum)]" style={{ transform: "rotate(-45deg)" }} />
                {isSubPinned ? "Remove from For You" : "Pin to For You"}
              </button>
            )}
            <button onClick={() => { onClose(); onEdit() }} className={`${item} text-[var(--ink)]`}>
              <Edit3 className="w-3.5 h-3.5 text-[var(--plum)]" />Edit
            </button>
            <button onClick={() => { onClose(); onDelete() }} className={`${item} text-[var(--danger)] hover:bg-[color-mix(in_srgb,var(--danger)_8%,transparent)]`}>
              <Trash2 className="w-3.5 h-3.5" />Delete
            </button>
          </div>
        </>,
        document.body
      )}
    </>
  )
}

export function AnnouncementsTab({ userId, userName, userRole, userGradYear, ministryId, ministryName, onOpenAnnouncement }: AnnouncementsTabProps) {
  const supabase = createClient()
  // Compose/edit is ephemeral plain state — never in the URL. A reload mid-compose
  // drops back to the underlying announcements list (Phase 2).
  const [showCreate, setShowCreate] = useState(false)
  const [compact, setCompact] = useState(false)
  const [filter, setFilter] = useState<FilterType>("all")

  const [editingAnnouncement, setEditingAnnouncement] = useState<EnrichedAnnouncement | null>(null)

  // Form fill overlay state
  const [formFillState, setFormFillState] = useState<{ formId: string; announcementId: string; title: string } | null>(null)
  // Desktop delete confirmation — routes handleDesktopDelete through ConfirmDialog.
  const [deleteConfirmAnn, setDeleteConfirmAnn] = useState<EnrichedAnnouncement | null>(null)
  // Which desktop row's ⋯ overflow menu is open (announcement id).
  const [openMenuId, setOpenMenuId] = useState<string | null>(null)

  function openCreate() {
    setEditingAnnouncement(null)
    setShowCreate(true)
  }

  function openEdit(ann: EnrichedAnnouncement) {
    setShowCreate(false)
    setEditingAnnouncement(ann)
  }

  function closeCompose() {
    setShowCreate(false)
    setEditingAnnouncement(null)
  }

  const isLeaderOrAdmin = ["leader", "admin", "deacon", "elder", "pastor"].includes(userRole.toLowerCase())

  const loadAnnouncements = useCallback(async (): Promise<EnrichedAnnouncement[]> => {
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

    if (anns.length === 0) return []

    const ids = anns.map((a) => a.id)
    const [{ data: viewRows }, { data: rsvpRows }, { data: formRows }] = await Promise.all([
      supabase.from("announcement_views").select("announcement_id").in("announcement_id", ids),
      supabase.from("rsvps").select("announcement_id, user_id").in("announcement_id", ids),
      supabase.from("announcement_forms").select("id, announcement_id").in("announcement_id", ids),
    ])

    // A "view" means the user OPENED the announcement — recorded on detail open
    // (see AnnouncementDetailView). We deliberately do NOT mark every announcement
    // viewed just because it rendered in the feed: that was a per-load write storm
    // (one upsert per announcement per feed load per user) and made view_count
    // measure "appeared in feed" instead of "was opened".

    // Build the cross-row lookups that the next two queries depend on, then run
    // both in parallel — form_responses (needs formIds) and profiles (needs
    // rsvp user ids) are independent of each other.
    const formByAnn: Record<string, string> = {}
    for (const f of formRows ?? []) formByAnn[f.announcement_id] = f.id
    const formIds = Object.values(formByAnn)
    const allRsvpUserIds = [...new Set((rsvpRows ?? []).map((r) => r.user_id))]

    const [{ data: responseRows }, { data: profileRows }] = await Promise.all([
      formIds.length > 0
        ? supabase
            .from("form_responses")
            .select("form_id")
            .in("form_id", formIds)
            .eq("user_id", userId)
        : Promise.resolve({ data: null }),
      allRsvpUserIds.length > 0
        ? supabase
            .from("profiles")
            .select("id, name")
            .in("id", allRsvpUserIds)
            .eq("ministry_id", ministryId)
        : Promise.resolve({ data: null }),
    ])

    const respondedFormIds = new Set<string>()
    for (const r of responseRows ?? []) respondedFormIds.add(r.form_id)

    const profileNameMap: Record<string, string> = {}
    for (const p of profileRows ?? []) profileNameMap[p.id] = p.name

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

    return anns.map((ann) => ({
      ...ann,
      show_attendees: ann.show_attendees ?? false,
      view_count: viewMap[ann.id] ?? 0,
      rsvp_count: rsvpCountMap[ann.id] ?? 0,
      user_has_rsvped: userRsvpSet.has(ann.id),
      rsvp_attendees: rsvpAttendeesMap[ann.id] ?? [],
      has_form: !!formByAnn[ann.id],
      form_id: formByAnn[ann.id] ?? null,
      user_has_responded: formByAnn[ann.id] ? respondedFormIds.has(formByAnn[ann.id]) : false,
    }))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId, ministryId, isLeaderOrAdmin, userGradYear])

  // SWR cache: keyed on every param the query branches on, so revisiting the tab
  // shows cached data instantly while revalidating in the background.
  const { data: announcements = [], isLoading: loading, mutate: mutateAnnouncements } = useSWR(
    ["announcements", ministryId, userId, isLeaderOrAdmin, userGradYear],
    loadAnnouncements
  )

  // True toggle: flips going state and count, optimistically updates the attendee
  // list, AND persists to the rsvps table. Used by the desktop RSVP buttons and
  // passed to the mobile AnnouncementCard as onRsvpToggle (single source of truth).
  // SWR optimistic mutate: `optimisticData` flips the cache instantly, the DB
  // write runs inside the async updater, and `rollbackOnError` reverts the cache
  // if the write throws. revalidate:false keeps the cache from refetching over
  // the optimistic edit. Mirrors the canonical rsvps write (delete on un-RSVP /
  // upsert on RSVP); rsvps has no ministry_id column — ministry scoping is
  // enforced by the table's RLS join to announcements (correct exception to #8).
  function handleRsvpToggle(announcementId: string) {
    const current = (announcements ?? []).find((a) => a.id === announcementId)
    if (!current) return
    const wasRsvped = current.user_has_rsvped

    const applyToggle = (list: EnrichedAnnouncement[] | undefined): EnrichedAnnouncement[] =>
      (list ?? []).map((ann) => {
        if (ann.id !== announcementId) return ann
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

    mutateAnnouncements(
      async (prev) => {
        if (wasRsvped) {
          const { error } = await supabase.from("rsvps").delete().eq("announcement_id", announcementId).eq("user_id", userId)
          if (error) throw error
        } else {
          const { error } = await supabase.from("rsvps").upsert({ announcement_id: announcementId, user_id: userId }, { onConflict: "announcement_id,user_id" })
          if (error) throw error
        }
        return applyToggle(prev)
      },
      { optimisticData: applyToggle, rollbackOnError: true, revalidate: false, populateCache: true }
    )
  }

  function handleNewAnnouncement(newAnn: Announcement, formMeta: { has_form: boolean; form_id: string | null }) {
    mutateAnnouncements((prev) => [{ ...newAnn, show_attendees: newAnn.show_attendees ?? false, view_count: 0, rsvp_count: 0, user_has_rsvped: false, rsvp_attendees: [], has_form: formMeta.has_form, form_id: formMeta.form_id, user_has_responded: false }, ...(prev ?? [])], { revalidate: false })
    logAudit({ ministryId, actorId: userId, actorName: userName, action: "announcement.create", entityType: "announcement", entityId: newAnn.id, entityLabel: newAnn.title })
  }

  function handleDeleteAnnouncement(id: string) {
    const target = announcements.find(a => a.id === id)
    mutateAnnouncements((prev) => (prev ?? []).filter((ann) => ann.id !== id), { revalidate: false })
    logAudit({ ministryId, actorId: userId, actorName: userName, action: "announcement.delete", entityType: "announcement", entityId: id, entityLabel: target?.title ?? null })
  }

  function handleEditSuccess(updated: Announcement, formMeta: { has_form: boolean; form_id: string | null }) {
    mutateAnnouncements((prev) => (prev ?? []).map((ann) => ann.id === updated.id ? { ...ann, ...updated, has_form: formMeta.has_form, form_id: formMeta.form_id } : ann), { revalidate: false })
    logAudit({ ministryId, actorId: userId, actorName: userName, action: "announcement.edit", entityType: "announcement", entityId: updated.id, entityLabel: updated.title })
  }

  function handleOpenEditor(ann: EnrichedAnnouncement) {
    openEdit(ann)
  }

  async function handleDesktopDelete(ann: EnrichedAnnouncement) {
    mutateAnnouncements((prev) => (prev ?? []).filter((a) => a.id !== ann.id), { revalidate: false })
    await createClient().from("announcements").delete().eq("id", ann.id).eq("ministry_id", ministryId)
    logAudit({ ministryId, actorId: userId, actorName: userName, action: "announcement.delete", entityType: "announcement", entityId: ann.id, entityLabel: ann.title })
  }

  async function handlePinToggle(annId: string, currentlyPinned: boolean) {
    const client = createClient()
    const target = announcements.find(a => a.id === annId)
    if (!currentlyPinned) {
      // Unpin any currently pinned announcement before pinning this one
      await client.from("announcements").update({ is_pinned: false }).eq("ministry_id", ministryId).eq("is_pinned", true)
    }
    await client.from("announcements").update({ is_pinned: !currentlyPinned }).eq("id", annId).eq("ministry_id", ministryId)
    mutateAnnouncements(prev => (prev ?? []).map(a =>
      a.id === annId
        ? { ...a, is_pinned: !currentlyPinned }
        : { ...a, is_pinned: currentlyPinned ? a.is_pinned : false }
    ), { revalidate: false })
    logAudit({ ministryId, actorId: userId, actorName: userName, action: currentlyPinned ? "announcement.unpin" : "announcement.pin", entityType: "announcement", entityId: annId, entityLabel: target?.title ?? null })
  }

  async function handleSubPinToggle(annId: string, currentlySubPinned: boolean) {
    const client = createClient()
    const target = announcements.find(a => a.id === annId)
    await client.from("announcements").update({ is_sub_pinned: !currentlySubPinned }).eq("id", annId).eq("ministry_id", ministryId)
    mutateAnnouncements(prev => (prev ?? []).map(a =>
      a.id === annId ? { ...a, is_sub_pinned: !currentlySubPinned } : a
    ), { revalidate: false })
    logAudit({ ministryId, actorId: userId, actorName: userName, action: currentlySubPinned ? "announcement.unsubpin" : "announcement.subpin", entityType: "announcement", entityId: annId, entityLabel: target?.title ?? null })
  }

  const pinnedAnn = announcements.find(a => a.is_pinned)
  const unpinned = announcements.filter(a => !a.is_pinned)
  // pinnedAnn always lives in the banner; the list below only shows unpinned
  const desktopList = unpinned
  const filteredDesktop = filter === "all"
    ? desktopList
    : filter === "events"
      ? [...(pinnedAnn?.is_event ? [pinnedAnn] : []), ...desktopList.filter(a => a.is_event)]
      : filter === "forms"
        ? [...(pinnedAnn?.has_form ? [pinnedAnn] : []), ...desktopList.filter(a => a.has_form)]
        : desktopList.filter(a => a.is_sub_pinned) // "pinned" chip = For You items; hero already shows the pinned one

  // Body swap: compose page replaces the list (DirectoryTab pattern) — no overlay.
  if (showCreate || editingAnnouncement) {
    return (
      <CreateAnnouncementModal
        userId={userId}
        ministryId={ministryId}
        existing={editingAnnouncement ?? undefined}
        onClose={closeCompose}
        onSuccess={editingAnnouncement ? handleEditSuccess : handleNewAnnouncement}
      />
    )
  }

  // Fill-out-form is a self-wrapping CentralModal (FormFillView owns it) overlaid
  // on the feed (DESIGN_SYSTEM §4.17) — X / backdrop / Escape close it (guarded by
  // its own `dirty` prompt once answered); the feed stays mounted underneath.
  const closeFill = () => setFormFillState(null)

  return (
    <>
    <div className="pb-28 md:pb-0 md:flex md:flex-col md:h-full md:overflow-hidden">
      {/* Mobile Header */}
      <div className="flex items-center justify-between px-5 pt-14 pb-5 md:hidden">
        <a href="/landing" className="flex items-center gap-2.5" style={{ textDecoration: "none" }}>
          <RingCrossLogo size={26} color="var(--plum)" />
          <span style={{ fontFamily: "var(--serif)", fontSize: "28px", color: "var(--ink)", letterSpacing: "-0.01em", lineHeight: 1 }}>{ministryName}</span>
        </a>
      </div>
      <div className="flex items-end justify-between px-5 mb-6 md:hidden">
        <h1 style={{ fontFamily: "var(--serif)", fontSize: "36px", fontWeight: 400, letterSpacing: "-0.02em", color: "var(--ink)", lineHeight: 1.05, margin: 0 }}>Announcements</h1>
        {isLeaderOrAdmin && (
          <button onClick={openCreate} className="size-9 bg-[var(--plum)] rounded-xl flex items-center justify-center hover:bg-[var(--plum-2)] transition-colors">
            <Plus className="w-4 h-4 text-[var(--cream)]" />
          </button>
        )}
      </div>

      {/* Desktop Editorial Header */}
      <TabPageHeader>
        <PageTitle
          eyebrow={`${announcements.length} total · ${announcements.filter(a => !a.user_has_rsvped && a.is_event).length} unread`}
          title="Announcements"
        />
        {/* Header right slot now holds only the Cards/Compact view toggle; the
            create CTA moved into the body toolbar row (Filter ↔ New). */}
        <div className="flex items-center gap-2 pb-1.5 ml-auto">
          <div className="flex border border-[var(--line)] rounded-lg overflow-hidden">
            <button onClick={() => setCompact(false)} className="px-3 py-1.5 text-[12px] transition-colors" style={{ background: !compact ? "var(--line-3)" : "transparent", fontWeight: !compact ? 500 : 400, border: "none", cursor: "pointer" }}>Cards</button>
            <button onClick={() => setCompact(true)} className="px-3 py-1.5 text-[12px] transition-colors" style={{ background: compact ? "var(--line-3)" : "transparent", fontWeight: compact ? 500 : 400, border: "none", cursor: "pointer" }}>Compact</button>
          </div>
        </div>
      </TabPageHeader>

      <div className="md:flex-1 md:overflow-y-auto">
      {loading ? (
        <AnnouncementsListSkeleton />
      ) : announcements.length === 0 ? (
        <div className="px-5 md:px-14">
          <EmptyState icon={<Bell className="w-7 h-7" />} title="No announcements yet" subtitle={isLeaderOrAdmin ? "Post the first announcement." : "Check back soon for updates"} />
          {/* Desktop create for the empty feed (mobile keeps the header + button);
              the toolbar's New button only renders once items exist. */}
          {isLeaderOrAdmin && (
            <div className="hidden md:flex justify-center mt-6">
              <ContentActionButton label="New announcement" icon={<Plus style={{ width: 14, height: 14 }} />} onClick={openCreate} />
            </div>
          )}
        </div>
      ) : (
        <>
          {/* Mobile card list */}
          <div className="md:hidden px-5 pb-4 flex flex-col gap-4">
            {announcements.map((ann) => (
              <AnnouncementCard
                key={ann.id}
                announcement={ann}
                isPinned={ann.is_pinned}
                featured={ann.is_pinned}
                userId={userId}
                ministryId={ministryId}
                userRole={userRole}
                onRsvpToggle={handleRsvpToggle}
                onEdit={handleOpenEditor}
                onDelete={handleDeleteAnnouncement}
                onPinToggle={handlePinToggle}
                onSubPinToggle={handleSubPinToggle}
                onOpenForm={(formId, annId, title) => setFormFillState({ formId, announcementId: annId, title })}
                onOpenDetail={onOpenAnnouncement}
              />
            ))}
          </div>

          {/* Desktop layout */}
          <div className="hidden md:block px-14 py-7">
            {/* Toolbar row: filter dropdown (left) · create CTA (right) */}
            <div className="flex items-center justify-between mb-6">
              <FilterDropdown options={FILTERS} value={filter} onSelect={(id) => setFilter(id as FilterType)} />
              {isLeaderOrAdmin && (
                <ContentActionButton label="New announcement" icon={<Plus style={{ width: 14, height: 14 }} />} onClick={openCreate} />
              )}
            </div>

            {/* Pinned hero strip — UpNextCard emphasis treatment */}
            {pinnedAnn && filter === "all" && (
              <div className="mb-6" style={{ background: "var(--ivory)", border: "1px solid var(--line-2)", borderRadius: "var(--r-callout)", padding: "40px 40px" }}>
                <div style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: "40px", alignItems: "center" }}>
                  <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                    <p style={{ display: "flex", alignItems: "center", gap: 6, margin: 0 }}>
                      <span style={{ width: 7, height: 7, borderRadius: "50%", background: "var(--plum)", display: "inline-block", flexShrink: 0 }} />
                      <span style={{ ...EYEBROW_STYLE, color: "var(--plum)" }}>Pinned</span>
                    </p>
                    <h2 className="line-clamp-2" style={{ margin: 0, fontFamily: "var(--serif)", fontWeight: 400, fontSize: "40px", lineHeight: 1.05, letterSpacing: "-0.01em", color: "var(--ink)" }}>{pinnedAnn.title}</h2>
                    <p style={{ margin: 0, fontSize: "13px", color: "var(--body)", lineHeight: 1.55 }} className="line-clamp-2">{previewBody(pinnedAnn.body)}</p>
                    {/* Actions row */}
                    <div className="flex items-center gap-2.5 flex-wrap">
                      <CentralButton variant="secondary" onClick={() => onOpenAnnouncement(pinnedAnn.id)} style={{ padding: "9px 20px", borderRadius: "9px", fontSize: "13px" }}>
                        {pinnedAnn.is_event ? "See details" : "See announcement"}
                      </CentralButton>
                      {pinnedAnn.is_event && (
                        <CentralButton variant={pinnedAnn.user_has_rsvped ? "plum-outline" : "primary"} onClick={() => handleRsvpToggle(pinnedAnn.id)} style={{ padding: "9px 20px", borderRadius: "9px", fontSize: "13px" }}>
                          {pinnedAnn.user_has_rsvped ? "Going ✓" : "RSVP"}
                        </CentralButton>
                      )}
                      {pinnedAnn.rsvp_count > 0 && (
                        <span style={{ fontSize: 12, color: "var(--muted-text)" }}>{pinnedAnn.rsvp_count} going</span>
                      )}
                    </div>
                  </div>
                  {isLeaderOrAdmin && (
                    <div className="flex gap-2 items-center self-start">
                      <DesktopActionMenu
                        open={openMenuId === pinnedAnn.id}
                        onToggle={() => setOpenMenuId((id) => (id === pinnedAnn.id ? null : pinnedAnn.id))}
                        onClose={() => setOpenMenuId(null)}
                        isPinned={pinnedAnn.is_pinned}
                        isSubPinned={pinnedAnn.is_sub_pinned}
                        showPin
                        showSubPin={false}
                        onPin={() => handlePinToggle(pinnedAnn.id, pinnedAnn.is_pinned)}
                        onSubPin={() => handleSubPinToggle(pinnedAnn.id, pinnedAnn.is_sub_pinned)}
                        onEdit={() => openEdit(pinnedAnn)}
                        onDelete={() => setDeleteConfirmAnn(pinnedAnn)}
                      />
                    </div>
                  )}
                </div>
              </div>
            )}

            {filteredDesktop.length === 0 ? (
              <EmptyState icon={<Bell className="w-7 h-7" />} title="No results" subtitle="Try a different filter" />
            ) : compact ? (
              /* Compact table */
              <div className="rounded-xl border border-[var(--line)] bg-[var(--cream)] overflow-hidden">
                <div className="grid px-5 py-2.5 border-b border-[var(--line)]" style={{ gridTemplateColumns: "100px 1.5fr 1fr 100px", gap: "12px" }}>
                  {["Type", "Title", "When", "Action"].map(h => <span key={h} style={MONO_STYLE}>{h}</span>)}
                </div>
                {filteredDesktop.map((ann, i) => (
                  <div key={ann.id} style={{ borderTop: i ? "1px solid var(--line-3)" : undefined }}>
                    <div className="grid px-5 py-3.5 items-center" style={{ gridTemplateColumns: "100px 1.5fr 1fr 100px", gap: "12px" }}>
                      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                        <span style={{ fontSize: "10px", letterSpacing: "0.8px", padding: "3px 9px", borderRadius: "6px", background: "var(--ivory)", border: "1px solid var(--line)", textTransform: "uppercase", fontWeight: 500, width: "fit-content" }}>{ann.is_event ? "Event" : "Post"}</span>
                        {ann.status === "draft" && <span style={{ ...DRAFT_PILL_STYLE, borderRadius: "6px", width: "fit-content" }}>Draft</span>}
                      </div>
                      <div
                        onClick={() => onOpenAnnouncement(ann.id)}
                        style={{ cursor: "pointer" }}
                        title="See announcement"
                      >
                        <div style={{ fontFamily: "var(--serif)", fontSize: "17px", lineHeight: 1.2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{ann.title}</div>
                        <div style={{ fontSize: "12px", color: "var(--muted-text)", marginTop: "2px", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{previewBody(ann.body)}</div>
                      </div>
                      <div style={{ fontSize: "12px", color: "var(--body)" }}>{formatDate(ann.created_at)}</div>
                      <div className="flex justify-end items-center gap-1.5">
                        <button onClick={() => onOpenAnnouncement(ann.id)} style={{ fontSize: "11px", color: "var(--muted-text)", background: "none", border: "none", cursor: "pointer", padding: "4px 6px", whiteSpace: "nowrap" }} className="hover:text-[var(--plum)] transition-colors">See →</button>
                        {ann.is_event && (
                          <CentralButton variant={ann.user_has_rsvped ? "plum-outline" : "primary"} onClick={() => handleRsvpToggle(ann.id)} style={{ padding: "4px 10px", borderRadius: "6px", fontSize: "11px" }}>
                            {ann.user_has_rsvped ? "Going" : "RSVP"}
                          </CentralButton>
                        )}
                        {isLeaderOrAdmin && (
                          <DesktopActionMenu
                            open={openMenuId === ann.id}
                            onToggle={() => setOpenMenuId((id) => (id === ann.id ? null : ann.id))}
                            onClose={() => setOpenMenuId(null)}
                            isPinned={ann.is_pinned}
                            isSubPinned={ann.is_sub_pinned}
                            showPin
                            showSubPin
                            onPin={() => handlePinToggle(ann.id, ann.is_pinned)}
                            onSubPin={() => handleSubPinToggle(ann.id, ann.is_sub_pinned)}
                            onEdit={() => openEdit(ann)}
                            onDelete={() => setDeleteConfirmAnn(ann)}
                          />
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
                  <article key={ann.id} className="rounded-2xl border border-[var(--line)] bg-[var(--cream)] overflow-hidden">
                    <div style={{ padding: "26px 28px 22px" }}>
                      <div className="flex justify-between items-center mb-4">
                        <span style={MONO_STYLE}>{formatDate(ann.created_at)}</span>
                        <div style={{ display: "flex", gap: 4 }}>
                          {ann.status === "draft" && <span style={{ ...DRAFT_PILL_STYLE, borderRadius: 999 }}>Draft</span>}
                          {ann.is_pinned && <span style={{ fontSize: "10px", letterSpacing: "0.8px", padding: "3px 9px", borderRadius: 999, background: "var(--plum)", textTransform: "uppercase", fontWeight: 500, color: "var(--cream)" }}>📌 Pinned</span>}
                          {ann.is_sub_pinned && <span style={{ fontSize: "10px", letterSpacing: "0.8px", padding: "3px 9px", borderRadius: 999, background: "#F1ECFF", border: "1px solid #D8CAFF", textTransform: "uppercase", fontWeight: 500, color: "var(--plum)" }}>For You</span>}
                          <span style={{ fontSize: "10px", letterSpacing: "0.8px", padding: "3px 9px", borderRadius: 999, background: "var(--line-3)", textTransform: "uppercase", fontWeight: 500, color: "var(--ink)" }}>{ann.is_event ? "Event" : "Post"}</span>
                        </div>
                      </div>
                      <h3 className="line-clamp-2" style={{ margin: 0, fontFamily: "var(--serif)", fontWeight: 400, fontSize: "28px", lineHeight: 1.1, letterSpacing: "-0.01em", color: "var(--ink)" }}>{ann.title}</h3>
                      <p style={{ marginTop: "14px", fontSize: "14px", color: "var(--body)", lineHeight: 1.55 }} className="line-clamp-3">{previewBody(ann.body)}</p>
                      <button onClick={() => onOpenAnnouncement(ann.id)} style={{ background: "none", border: "none", cursor: "pointer", padding: 0, fontSize: "12px", color: "var(--muted-text)", marginTop: 10, textAlign: "left" }} className="hover:text-[var(--plum)] transition-colors">See announcement →</button>
                      <div style={{ marginTop: "18px", paddingTop: "16px", borderTop: "1px solid var(--line-3)" }}>
                        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "8px" }}>
                          <span style={{ fontSize: "12px", color: "var(--muted-text)" }}>{ann.rsvp_count} going · {ann.view_count} views</span>
                          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                            {ann.has_form && (
                              ann.user_has_responded
                                ? <span style={{ fontSize: 12, color: "#2E7D32", fontWeight: 500, display: "flex", alignItems: "center", gap: 4 }}><FileText style={{ width: 12, height: 12 }} />Form submitted</span>
                                : <button onClick={() => setFormFillState({ formId: ann.form_id!, announcementId: ann.id, title: ann.title })} style={{ padding: "5px 12px", borderRadius: 8, border: "1px solid var(--plum)", background: "transparent", color: "var(--plum)", fontSize: 12, fontWeight: 500, cursor: "pointer", display: "flex", alignItems: "center", gap: 5 }}><FileText style={{ width: 11, height: 11 }} />Fill out form</button>
                            )}
                            {ann.is_event && (
                              <CentralButton variant={ann.user_has_rsvped ? "plum-outline" : "primary"} onClick={() => handleRsvpToggle(ann.id)} style={{ padding: "8px 16px", borderRadius: 999, fontSize: "12px" }}>
                                {ann.user_has_rsvped ? "Going ✓" : "RSVP"}
                              </CentralButton>
                            )}
                            {isLeaderOrAdmin && (
                              <DesktopActionMenu
                                open={openMenuId === ann.id}
                                onToggle={() => setOpenMenuId((id) => (id === ann.id ? null : ann.id))}
                                onClose={() => setOpenMenuId(null)}
                                isPinned={ann.is_pinned}
                                isSubPinned={ann.is_sub_pinned}
                                showPin
                                showSubPin
                                onPin={() => handlePinToggle(ann.id, ann.is_pinned)}
                                onSubPin={() => handleSubPinToggle(ann.id, ann.is_sub_pinned)}
                                onEdit={() => openEdit(ann)}
                                onDelete={() => setDeleteConfirmAnn(ann)}
                              />
                            )}
                          </div>
                        </div>
                        {ann.is_event && ann.rsvp_attendees.length > 0 && (isLeaderOrAdmin || ann.show_attendees) && (
                          <div style={{ marginTop: 12 }}>
                            <div className="flex flex-wrap gap-1.5">
                              {ann.rsvp_attendees.slice(0, 10).map(a => (
                                <span key={a.user_id} style={{ fontSize: "11px", color: "var(--body)", background: "var(--ivory)", border: "1px solid var(--line)", padding: "2px 8px", borderRadius: 999 }}>{a.name.split(" ")[0]}</span>
                              ))}
                              {ann.rsvp_attendees.length > 10 && (
                                <span style={{ fontSize: "11px", color: "var(--muted-text)", padding: "2px 4px" }}>+{ann.rsvp_attendees.length - 10} more</span>
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
      </div>

      {isLeaderOrAdmin && (
        <button
          onClick={openCreate}
          style={{ position: "fixed", bottom: "6.5rem", right: "max(calc(50% - 195px + 16px), 16px)" }}
          className="md:hidden w-12 h-12 bg-[var(--plum)] rounded-2xl flex items-center justify-center z-40 hover:bg-[var(--plum-2)] active:scale-[0.97] transition-[transform,background-color] duration-150"
          aria-label="New announcement"
        >
          <Plus className="w-6 h-6 text-[var(--cream)]" />
        </button>
      )}
    </div>

    {formFillState && (
      <FormFillView
        title={formFillState.title}
        onClose={closeFill}
        formId={formFillState.formId}
        announcementId={formFillState.announcementId}
        userId={userId}
        ministryId={ministryId}
        onSubmitted={() => {
          mutateAnnouncements(prev => (prev ?? []).map(a => a.form_id === formFillState.formId ? { ...a, user_has_responded: true } : a), { revalidate: false })
          setFormFillState(null)
        }}
      />
    )}

    <ConfirmDialog
      open={deleteConfirmAnn !== null}
      title="Delete announcement?"
      message="This permanently removes it for everyone."
      confirmLabel="Delete"
      onConfirm={() => { const a = deleteConfirmAnn; setDeleteConfirmAnn(null); if (a) handleDesktopDelete(a) }}
      onClose={() => setDeleteConfirmAnn(null)}
    />
    </>
  )
}

// ── Announcement Card (mobile) ───────────────────────────────────────────────

export function AnnouncementCard({ announcement, isPinned, featured = false, ministryId, userRole, onRsvpToggle, onEdit, onDelete, onPinToggle, onSubPinToggle, onOpenForm, onOpenDetail }: AnnouncementCardProps) {
  const supabase = createClient()
  const [showMenu, setShowMenu] = useState(false)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [deleting, setDeleting] = useState(false)

  const isAdminOrLeader = ["admin", "leader", "deacon", "elder", "pastor"].includes(userRole.toLowerCase())

  // Persistence is owned by the parent's handleRsvpToggle (single source of truth);
  // this only triggers the optimistic toggle, which reads back via the prop.
  function handleRsvp() {
    onRsvpToggle(announcement.id)
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
        <div className="relative rounded-[22px] bg-[var(--plum)] overflow-hidden">
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
                  <span style={{ fontSize: "9px", letterSpacing: "0.1em", padding: "2px 8px", borderRadius: 999, background: "rgba(255,255,255,0.15)", color: "var(--cream-on-dark)", textTransform: "uppercase", fontWeight: 500 }}>{audienceLabel(announcement.audience)}</span>
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
                      <div className="absolute top-8 right-0 z-[10] bg-[var(--cream-panel)] rounded-xl border border-[var(--line)] py-1 min-w-[140px]">
                        <button onClick={() => { setShowMenu(false); onPinToggle?.(announcement.id, announcement.is_pinned) }} className="w-full flex items-center gap-2.5 px-4 py-2.5 text-[13px] font-medium text-[var(--ink)] hover:bg-[var(--cream-2)] transition-colors text-left">
                          {announcement.is_pinned ? <PinOff className="w-3.5 h-3.5 text-[var(--plum)]" /> : <Pin className="w-3.5 h-3.5 text-[var(--plum)]" />}
                          {announcement.is_pinned ? "Unpin hero" : "Pin as hero"}
                        </button>
                        <button onClick={() => { setShowMenu(false); onSubPinToggle?.(announcement.id, announcement.is_sub_pinned) }} className="w-full flex items-center gap-2.5 px-4 py-2.5 text-[13px] font-medium text-[var(--ink)] hover:bg-[var(--cream-2)] transition-colors text-left">
                          <Pin className="w-3.5 h-3.5 text-[var(--plum)]" style={{ transform: "rotate(-45deg)" }} />
                          {announcement.is_sub_pinned ? "Remove from For You" : "Pin to For You"}
                        </button>
                        <button onClick={() => { setShowMenu(false); onEdit(announcement) }} className="w-full flex items-center gap-2.5 px-4 py-2.5 text-[13px] font-medium text-[var(--ink)] hover:bg-[var(--cream-2)] transition-colors text-left"><Edit3 className="w-3.5 h-3.5 text-[var(--plum)]" />Edit</button>
                        <button onClick={() => { setShowMenu(false); setShowDeleteConfirm(true) }} className="w-full flex items-center gap-2.5 px-4 py-2.5 text-[13px] font-medium text-[var(--danger)] hover:bg-[color-mix(in_srgb,var(--danger)_8%,transparent)] transition-colors text-left"><Trash2 className="w-3.5 h-3.5" />Delete</button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>

            <h3 className="line-clamp-2" style={{ fontFamily: "var(--font-instrument-serif)", fontSize: "30px", lineHeight: 1.05, letterSpacing: "-0.02em", color: "var(--cream-on-dark)", margin: "0 0 8px" }}>{announcement.title}</h3>
            <p className="text-[13px] leading-relaxed line-clamp-3 mb-1" style={{ color: "rgba(246,244,239,0.72)" }}>{previewBody(announcement.body)}</p>
            <button onClick={() => onOpenDetail(announcement.id)} className="text-[12px] font-medium mb-4 transition-colors" style={{ background: "none", border: "none", cursor: "pointer", padding: 0, color: "rgba(246,244,239,0.5)" }}>See announcement →</button>

            {announcement.is_event && (
              <>
                <div className="flex items-center gap-4">
                  <button onClick={handleRsvp} className={`font-medium py-3 px-7 rounded-full transition-all text-[14px] ${announcement.user_has_rsvped ? "bg-white/20 text-[var(--cream-on-dark)] hover:bg-white/30 active:scale-[0.97]" : "bg-[var(--cream-on-dark)] text-[var(--plum)] hover:bg-white active:scale-[0.97]"}`}>
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
                  : <button onClick={() => announcement.form_id && onOpenForm(announcement.form_id, announcement.id, announcement.title)} style={{ padding: "8px 16px", borderRadius: 999, border: "1px solid rgba(246,244,239,0.4)", background: "transparent", color: "var(--cream-on-dark)", fontSize: 13, fontWeight: 500, cursor: "pointer" }}>Fill out form →</button>
                }
              </div>
            )}
          </div>

          {showDeleteConfirm && (
            <div className="absolute inset-0 z-[20] bg-[#3E1540]/95 backdrop-blur-sm rounded-[22px] flex flex-col items-center justify-center gap-3 p-7">
              <div className="w-11 h-11 rounded-full bg-white/10 flex items-center justify-center mb-1"><Trash2 className="w-5 h-5 text-[var(--cream-on-dark)]" /></div>
              <p className="text-[15px] font-medium text-[var(--cream-on-dark)] text-center">Delete this announcement?</p>
              <p className="text-[12px] text-center -mt-1" style={{ color: "rgba(246,244,239,0.5)" }}>This can&apos;t be undone.</p>
              <div className="flex gap-3 w-full mt-1">
                <button onClick={() => setShowDeleteConfirm(false)} disabled={deleting} className="flex-1 py-2.5 rounded-full border border-white/20 text-[13px] font-medium text-[var(--cream-on-dark)] hover:bg-white/10 transition-colors disabled:opacity-50">Cancel</button>
                <button onClick={handleDelete} disabled={deleting} className="flex-1 py-2.5 rounded-full text-[13px] font-medium transition-colors disabled:opacity-50 hover:brightness-95" style={{ background: "var(--danger)", color: "var(--cream)" }}>{deleting ? "Deleting…" : "Delete"}</button>
              </div>
            </div>
          )}
        </div>

      </>
    )
  }

  // ── Ivory card ──
  return (
    <>
      <div className="relative rounded-[22px] bg-[var(--cream)] border border-[var(--line)] overflow-hidden">
        {announcement.image_url && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={announcement.image_url} alt={announcement.title} className="w-full h-36 object-cover" />
        )}

        <div className="p-5">
          <div className="flex items-start justify-between mb-2.5">
            <div className="flex items-center gap-2 flex-wrap">
              <span style={MONO_STYLE}>{announcement.is_event ? "Event" : formatDate(announcement.created_at)}</span>
              {announcement.audience && announcement.audience !== "all" && (
                <span style={{ fontSize: "9px", letterSpacing: "0.08em", padding: "2px 7px", borderRadius: 999, background: "var(--line-3)", color: "var(--body)", textTransform: "uppercase", fontWeight: 500 }}>{audienceLabel(announcement.audience)}</span>
              )}
            </div>
            {isAdminOrLeader && (
              <div className="relative">
                {showMenu && <div className="fixed inset-0 z-[5]" onClick={() => setShowMenu(false)} />}
                <button onClick={(e) => { e.stopPropagation(); setShowMenu((v) => !v) }} className="w-7 h-7 rounded-full flex items-center justify-center hover:bg-[var(--ivory)] transition-colors">
                  <MoreHorizontal className="w-4 h-4 text-[var(--muted-text)]" />
                </button>
                {showMenu && (
                  <div className="absolute top-8 right-0 z-[10] bg-[var(--cream-panel)] rounded-xl border border-[var(--line)] py-1 min-w-[140px]">
                    <button onClick={() => { setShowMenu(false); onPinToggle?.(announcement.id, announcement.is_pinned) }} className="w-full flex items-center gap-2.5 px-4 py-2.5 text-[13px] font-medium text-[var(--ink)] hover:bg-[var(--cream-2)] transition-colors text-left">
                      {announcement.is_pinned ? <PinOff className="w-3.5 h-3.5 text-[var(--plum)]" /> : <Pin className="w-3.5 h-3.5 text-[var(--plum)]" />}
                      {announcement.is_pinned ? "Unpin" : "Pin"}
                    </button>
                    <button onClick={() => { setShowMenu(false); onEdit(announcement) }} className="w-full flex items-center gap-2.5 px-4 py-2.5 text-[13px] font-medium text-[var(--ink)] hover:bg-[var(--cream-2)] transition-colors text-left"><Edit3 className="w-3.5 h-3.5 text-[var(--plum)]" />Edit</button>
                    <button onClick={() => { setShowMenu(false); setShowDeleteConfirm(true) }} className="w-full flex items-center gap-2.5 px-4 py-2.5 text-[13px] font-medium text-[var(--danger)] hover:bg-[color-mix(in_srgb,var(--danger)_8%,transparent)] transition-colors text-left"><Trash2 className="w-3.5 h-3.5" />Delete</button>
                  </div>
                )}
              </div>
            )}
          </div>

          <h3 className="line-clamp-2" style={{ fontFamily: "var(--serif)", fontSize: "22px", lineHeight: 1.1, letterSpacing: "-0.01em", color: "var(--ink)", margin: "0 0 6px" }}>{announcement.title}</h3>
          <p className="text-[13px] leading-relaxed line-clamp-3 mb-1" style={{ color: "var(--body)" }}>{previewBody(announcement.body)}</p>
          <button onClick={() => onOpenDetail(announcement.id)} style={{ background: "none", border: "none", cursor: "pointer", padding: 0, fontSize: "12px", color: "var(--muted-text)", marginBottom: "16px" }} className="hover:text-[var(--plum)] transition-colors text-left">See announcement →</button>

          {announcement.is_event && (
            <div className="pt-3 border-t border-[var(--line-3)]">
              <div className="flex items-center gap-3">
                <button onClick={handleRsvp} className={`font-medium py-2 px-5 rounded-full transition-all text-[13px] ${announcement.user_has_rsvped ? "bg-[var(--line-3)] text-[var(--body)] hover:bg-[var(--line)] active:scale-[0.97]" : "bg-[var(--plum)] text-[var(--cream)] hover:bg-[var(--plum-2)] active:scale-[0.97]"}`}>
                  {announcement.user_has_rsvped ? <span className="flex items-center gap-1.5"><Check className="w-3 h-3" />Going</span> : "RSVP"}
                </button>
                {announcement.rsvp_count > 0 && <span className="text-[12px] text-[var(--muted-text)] font-medium">{announcement.rsvp_count} going</span>}
              </div>
              {announcement.rsvp_attendees.length > 0 && (isAdminOrLeader || announcement.show_attendees) && (
                <div className="mt-2.5 flex flex-wrap gap-1.5">
                  {announcement.rsvp_attendees.slice(0, 8).map(a => (
                    <span key={a.user_id} style={{ fontSize: "11px", color: "var(--body)", background: "var(--ivory)", border: "1px solid var(--line)", padding: "2px 8px", borderRadius: 999 }}>{a.name.split(" ")[0]}</span>
                  ))}
                  {announcement.rsvp_attendees.length > 8 && (
                    <span style={{ fontSize: "11px", color: "var(--muted-text)", padding: "2px 4px" }}>+{announcement.rsvp_attendees.length - 8} more</span>
                  )}
                </div>
              )}
            </div>
          )}
          {announcement.has_form && (
            <div className={`${!announcement.is_event ? "pt-3 border-t border-[var(--line-3)]" : "mt-2"}`}>
              {announcement.user_has_responded
                ? <span style={{ fontSize: 12, color: "#2E7D32", fontWeight: 500, display: "flex", alignItems: "center", gap: 5 }}><Check style={{ width: 12, height: 12 }} />Form submitted</span>
                : <button onClick={() => announcement.form_id && onOpenForm(announcement.form_id, announcement.id, announcement.title)} style={{ padding: "8px 16px", borderRadius: 999, border: "1px solid var(--plum)", background: "transparent", color: "var(--plum)", fontSize: 13, fontWeight: 500, cursor: "pointer" }}>Fill out form →</button>
              }
            </div>
          )}
        </div>

        {showDeleteConfirm && (
          <div className="absolute inset-0 z-[20] bg-[var(--cream)]/95 backdrop-blur-sm rounded-[22px] flex flex-col items-center justify-center gap-3 p-7">
            <div className="w-11 h-11 rounded-full bg-[color-mix(in_srgb,var(--danger)_8%,transparent)] flex items-center justify-center mb-1"><Trash2 className="w-5 h-5 text-[var(--danger)]" /></div>
            <p className="text-[15px] font-medium text-[var(--ink)] text-center">Delete this announcement?</p>
            <p className="text-[12px] text-[var(--muted-text)] text-center -mt-1">This can&apos;t be undone.</p>
            <div className="flex gap-3 w-full mt-1">
              <button onClick={() => setShowDeleteConfirm(false)} disabled={deleting} className="flex-1 py-2.5 rounded-full border border-[var(--line)] text-[13px] font-medium text-[var(--body)] hover:bg-[var(--ivory)] transition-colors disabled:opacity-50">Cancel</button>
              <button onClick={handleDelete} disabled={deleting} className="flex-1 py-2.5 rounded-full text-[13px] font-medium transition-colors disabled:opacity-50 hover:brightness-95" style={{ background: "var(--danger)", color: "var(--cream)" }}>{deleting ? "Deleting…" : "Delete"}</button>
            </div>
          </div>
        )}
      </div>

    </>
  )
}

// ── Announcement Detail View (in-shell overlay) ──────────────────────────────

const DETAIL_SERIF = "var(--serif)"
const DETAIL_SANS = "var(--font-inter)"
const DETAIL_MONO = EYEBROW_STYLE

// ── Detail date-part helpers (sync, local) ───────────────────────────────────
function detailWeekday(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString("en-US", { weekday: "long" })
}
function detailMonthDay(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString("en-US", { month: "short", day: "numeric" })
}
function detailTime(dateStr: string): string {
  return new Date(dateStr).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true })
}
function detailPosted(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
}

interface DetailAnnouncement {
  id: string
  title: string
  body: string
  created_at: string
  event_date: string | null
  is_pinned: boolean
  is_event: boolean
  image_url: string | null
  audience: string | null
  show_attendees: boolean
  view_count: number
  rsvp_count: number
  user_has_rsvped: boolean
  rsvp_attendees: { user_id: string; name: string }[]
  has_form: boolean
  form_id: string | null
  user_has_responded: boolean
}

export function AnnouncementDetailView({
  announcementId,
  userId,
  ministryId,
  userRole,
  userName,
  onGoToList,
}: {
  announcementId: string
  userId: string
  ministryId: string
  userRole: string
  userName: string
  // Navigates to the Announcements list AND closes the detail (one atomic URL
  // update upstream). Wired to the "Announcements" breadcrumb crumb + mobile back.
  onGoToList: () => void
}) {
  const supabase = createClient()
  const [ann, setAnn] = useState<DetailAnnouncement | null>(null)
  const [loading, setLoading] = useState(true)
  const [rsvping, setRsvping] = useState(false)
  const [formFillOpen, setFormFillOpen] = useState(false)

  useEffect(() => {
    async function load() {
      const { data: annData } = await supabase
        .from("announcements")
        .select("*")
        .eq("id", announcementId)
        .eq("ministry_id", ministryId)
        .maybeSingle()

      if (!annData) { setLoading(false); return }

      const [{ data: viewRows }, { data: rsvpRows }, { data: formData }] = await Promise.all([
        supabase.from("announcement_views").select("user_id").eq("announcement_id", announcementId),
        supabase.from("rsvps").select("user_id").eq("announcement_id", announcementId),
        supabase.from("announcement_forms").select("id").eq("announcement_id", announcementId).maybeSingle(),
      ])

      supabase.from("announcement_views")
        .upsert({ announcement_id: announcementId, user_id: userId }, { onConflict: "announcement_id,user_id" })
        .then()

      const rsvpUserIds = (rsvpRows ?? []).map((r: { user_id: string }) => r.user_id)
      const userHasRsvped = rsvpUserIds.includes(userId)

      let rsvpAttendees: { user_id: string; name: string }[] = []
      if (rsvpUserIds.length > 0) {
        const { data: profileRows } = await supabase
          .from("profiles").select("id, name").in("id", rsvpUserIds).eq("ministry_id", ministryId)
        rsvpAttendees = (profileRows ?? []).map((p: { id: string; name: string }) => ({ user_id: p.id, name: p.name }))
      }

      let userHasResponded = false
      if (formData?.id) {
        const { data: respRow } = await supabase
          .from("form_responses").select("id").eq("form_id", formData.id).eq("user_id", userId).maybeSingle()
        userHasResponded = !!respRow
      }

      setAnn({
        ...annData,
        view_count: (viewRows ?? []).length,
        rsvp_count: rsvpUserIds.length,
        user_has_rsvped: userHasRsvped,
        rsvp_attendees: rsvpAttendees,
        has_form: !!formData,
        form_id: formData?.id ?? null,
        user_has_responded: userHasResponded,
      })
      setLoading(false)
    }
    load()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [announcementId])

  async function handleRsvp() {
    if (!ann || rsvping) return
    setRsvping(true)
    if (ann.user_has_rsvped) {
      await supabase.from("rsvps").delete().eq("announcement_id", ann.id).eq("user_id", userId)
      setAnn((prev) => prev ? { ...prev, user_has_rsvped: false, rsvp_count: Math.max(0, prev.rsvp_count - 1), rsvp_attendees: prev.rsvp_attendees.filter((a) => a.user_id !== userId) } : prev)
    } else {
      await supabase.from("rsvps").upsert({ announcement_id: ann.id, user_id: userId }, { onConflict: "announcement_id,user_id" })
      setAnn((prev) => prev ? { ...prev, user_has_rsvped: true, rsvp_count: prev.rsvp_count + 1, rsvp_attendees: [...prev.rsvp_attendees, { user_id: userId, name: userName }] } : prev)
    }
    setRsvping(false)
  }

  const isLeaderOrAdmin = ["leader", "admin", "deacon", "elder", "pastor"].includes(userRole.toLowerCase())
  const showAttendees = ann?.is_event && ann.rsvp_attendees.length > 0 && (isLeaderOrAdmin || ann.show_attendees)

  const monoStyle = EYEBROW_STYLE

  function DetailContent() {
    if (loading) return (
      <div className="flex items-center justify-center" style={{ minHeight: 240 }}>
        <div style={{ width: 20, height: 20, borderRadius: "50%", border: "2px solid var(--line)", borderTopColor: "var(--plum)", animation: "spin 0.7s linear infinite" }} />
      </div>
    )
    if (!ann) return (
      <div className="flex flex-col items-center justify-center gap-3" style={{ minHeight: 240 }}>
        <p className="text-[15px] font-medium text-[var(--ink)]">Announcement not found.</p>
        <button onClick={onGoToList} className="text-[13px] text-[var(--body)] bg-transparent border-none cursor-pointer">← Back to announcements</button>
      </div>
    )
    // Adaptive: an aside rail appears only when there's an event or a form.
    const hasAside = ann.is_event || ann.has_form
    // The form's button takes the loud (primary) fill only when it's the lone
    // action; if an event already owns the primary RSVP, the form drops to outline.
    const formIsPrimary = !ann.is_event
    const eyebrowSrc = ann.is_event && ann.event_date ? ann.event_date : ann.created_at

    const eyebrowRow = (
      <div className="flex flex-wrap items-center gap-2.5">
        <span style={monoStyle}>{formatDate(eyebrowSrc)}</span>
        {ann.audience && ann.audience !== "all" && (
          <span style={{ ...monoStyle, background: "var(--ivory)", border: "1px solid var(--line-2)", padding: "2px 8px", borderRadius: 999 }}>{audienceLabel(ann.audience)}</span>
        )}
        {ann.is_pinned && <span style={{ ...monoStyle, color: "var(--plum)" }}>📌 Pinned</span>}
      </div>
    )

    // ── Aside modules (event / form / posted) — each flush, top hairline ──
    const asideModules: React.ReactNode[] = []
    if (ann.is_event) {
      asideModules.push(
        <div key="event">
          <div style={{ ...monoStyle }}>Event</div>
          {ann.event_date && (
            <>
              <div style={{ fontFamily: DETAIL_SANS, fontSize: 15, fontWeight: 500, color: "var(--ink)", marginTop: 14 }}>{detailWeekday(ann.event_date)}</div>
              <div style={{ fontFamily: DETAIL_SERIF, fontSize: 42, fontWeight: 600, letterSpacing: "-0.02em", lineHeight: 1, color: "var(--ink)", marginTop: 4 }}>{detailMonthDay(ann.event_date)}</div>
              <div style={{ fontFamily: DETAIL_SANS, fontSize: 18, color: "var(--ink)", marginTop: 9 }}>{detailTime(ann.event_date)}</div>
            </>
          )}
          <CentralButton
            variant={ann.user_has_rsvped ? "plum-outline" : "primary"}
            onClick={handleRsvp}
            disabled={rsvping}
            style={{ width: "100%", marginTop: 18 }}
          >
            {ann.user_has_rsvped ? <><Check style={{ width: 15, height: 15 }} />Going — tap to undo</> : "RSVP"}
          </CentralButton>
          <div style={{ fontSize: 13, color: "var(--faint)", marginTop: 12, textAlign: "center" }}>{ann.rsvp_count} going</div>
          {showAttendees && (
            <div className="flex flex-wrap justify-center gap-1.5" style={{ marginTop: 12 }}>
              {ann.rsvp_attendees.map((a) => <span key={a.user_id} style={{ fontSize: 12, color: "var(--body)", background: "var(--ivory)", border: "1px solid var(--line-2)", padding: "4px 10px", borderRadius: 999 }}>{a.name.split(" ")[0]}</span>)}
            </div>
          )}
        </div>
      )
    }
    if (ann.has_form) {
      asideModules.push(
        <div key="form">
          <div style={{ ...monoStyle }}>Form</div>
          <div style={{ fontFamily: DETAIL_SERIF, fontSize: 19, fontWeight: 500, color: "var(--ink)", marginTop: 12 }}>Includes a form</div>
          {ann.user_has_responded ? (
            <div className="flex items-center gap-1.5 text-[13px] font-medium" style={{ color: "#5B7A6C", marginTop: 14 }}><FileText className="w-3.5 h-3.5" />Form submitted</div>
          ) : (
            <CentralButton
              variant={formIsPrimary ? "primary" : "plum-outline"}
              onClick={() => setFormFillOpen(true)}
              style={{ width: "100%", marginTop: 18 }}
            >
              <FileText style={{ width: 14, height: 14 }} />Fill out form
            </CentralButton>
          )}
        </div>
      )
    }
    asideModules.push(
      <div key="posted">
        <div style={{ ...monoStyle }}>Posted</div>
        <div style={{ fontFamily: DETAIL_SANS, fontSize: 14, color: "var(--body)", marginTop: 10, lineHeight: 1.55 }}>
          {detailPosted(ann.created_at)}<br />{ann.view_count} {ann.view_count === 1 ? "view" : "views"}
        </div>
      </div>
    )

    return (
      // SubpageShell owns scroll + horizontal inset (px-5 md:px-14) + vertical
      // padding. No own scroll wrapper / px inset here — that would double both.
      <>
        {/* Image banner — full-bleed: negate the shell's horizontal inset and
            top padding so it hugs the edges; keeps its bottom hairline. */}
        {ann.image_url && (
          <div className="-mx-5 md:-mx-14 -mt-7" style={{ borderBottom: "1px solid var(--line)" }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={ann.image_url} alt={ann.title} className="w-full h-48 md:h-[300px] object-cover block" />
          </div>
        )}
        {/* Body — single column, or 1.7fr / 1fr when an aside is present.
            Horizontal inset comes from SubpageShell; keep only vertical py + gaps. */}
        <div className={`py-6 md:py-11 ${hasAside ? "grid grid-cols-1 md:grid-cols-[1.7fr_1fr] gap-9 md:gap-[60px] items-start" : ""}`}>
          {/* Main */}
          <div className="min-w-0">
            {eyebrowRow}
            <h1 style={{ fontFamily: DETAIL_SERIF, fontWeight: 600, fontSize: "clamp(28px, 5vw, 46px)", letterSpacing: "-0.02em", lineHeight: 1.02, color: "var(--ink)", margin: "13px 0 0" }}>{ann.title}</h1>
            <div style={{ fontFamily: DETAIL_SANS, fontSize: 16, lineHeight: 1.75, color: "var(--body)", marginTop: 26, maxWidth: 640, whiteSpace: "pre-wrap" }}>{ann.body}</div>
            {/* No aside → posted/views anchor the bottom of the single column */}
            {!hasAside && (
              <div style={{ display: "flex", alignItems: "center", gap: 9, marginTop: 34, paddingTop: 22, borderTop: "1px solid var(--line)", fontSize: 14, color: "var(--faint)" }}>
                Posted {detailPosted(ann.created_at)} · {ann.view_count} {ann.view_count === 1 ? "view" : "views"}
              </div>
            )}
          </div>
          {/* Aside rail — event / form / posted modules */}
          {hasAside && (
            <aside className="flex flex-col">
              {asideModules.map((mod, i) => (
                <div key={i} style={{ padding: i === 0 ? "0 0 24px" : "24px 0", borderTop: i === 0 ? "none" : "1px solid var(--line)" }}>
                  {mod}
                </div>
              ))}
            </aside>
          )}
        </div>
      </>
    )
  }

  // In-content subpage (DESIGN_SYSTEM §4.18) — the shell breadcrumb is the back
  // affordance; no standalone X. The "Announcements" crumb routes to the list AND
  // closes the detail (one atomic URL update upstream). Cream-on-cream, no shadow.
  // Filling out the form is a self-wrapping CentralModal (FormFillView owns it,
  // §4.17) overlaid on the detail — the detail stays mounted underneath; X /
  // backdrop / Escape close it (guarded by its own `dirty` prompt once answered).
  const closeForm = () => setFormFillOpen(false)
  const title = ann?.title || "Announcement"
  const formOpen = formFillOpen && !!ann?.form_id
  const crumbs = [
    { label: "Announcements", onClick: onGoToList },
    { label: title },
  ]

  return (
    <SubpageShell crumbs={crumbs} width="full">
      <DetailContent />

      {formOpen && (
        <FormFillView
          title={title}
          onClose={closeForm}
          formId={ann!.form_id!}
          announcementId={ann!.id}
          userId={userId}
          ministryId={ministryId}
          onSubmitted={() => { setAnn((prev) => prev ? { ...prev, user_has_responded: true } : prev); setFormFillOpen(false) }}
        />
      )}

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </SubpageShell>
  )
}
