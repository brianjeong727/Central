"use client"

import { useState, useEffect, useRef, useCallback } from "react"
import Image from "next/image"
import useSWR, { useSWRConfig } from "swr"
import { useMinistryTimezone } from "../ministry-timezone-context"
import { instantToZoned, zonedTimeToISO, formatInZone } from "@/lib/tz"
import { dismissDelivered } from "@/lib/notification-dismiss"
import { X, Check, ImageIcon, Trash2, Bell, Calendar, MoreHorizontal, Plus, Edit3, FileText, Pin, PinOff, Eye } from "lucide-react"
import { createClient } from "@/lib/supabase"
import { logAudit } from "@/lib/audit"
import { EmptyState, MONO_STYLE, EYEBROW_STYLE } from "../components/shared"
import { PocketChrome, PocketRoundButton } from "../components/pocket-header"
import { CentralModal, TabPageHeader, PageTitle, AnnouncementsListSkeleton, FilterDropdown, CentralButton, SubpageShell, ContentActionButton, ConfirmDialog, SegmentedControl, ActionMenu, PocketFilterChip, PocketFilterChipRow, PocketCard, PocketKicker, PocketButton, PocketSwitch, PocketTag, POCKET_KICKER_STYLE, useScrollResetOn, BackChevron, POCKET_CHROME_TITLE } from "@/components/central"
import type { ActionMenuItem } from "@/components/central"
import { audienceLabel, formatDate, previewBody } from "../utils"
import { useOpenMemberProfile } from "../member-profile-context"
import { FormFillView } from "./forms-tab"
import type { AnnouncementsTabProps, AnnouncementCardProps, CreateAnnouncementModalProps, Announcement, EnrichedAnnouncement, RsvpAttendee } from "../types"
import { isLeaderRole } from "@/lib/roles"
import { announcementAsksAck, audienceOrFilter, isAnnouncementRecipient } from "@/lib/announcement-audience"
import { fetchAckCounts, fetchRsvpCounts, fetchViewCounts } from "@/lib/announcement-counts"
import { acknowledgeAnnouncement } from "@/lib/announcement-ack"
import { remindUnacknowledgedAction } from "@/app/actions/announcement-ack"

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

// Stored instant → the `YYYY-MM-DDTHH:mm` a <input type="datetime-local"> wants,
// read in the MINISTRY's zone (Convention #23).
//
// This used to build the string from new Date(iso).getHours() — the DEVICE zone —
// and the write path mirrored the mistake with new Date(value).toISOString(). So a
// leader in Pittsburgh typing 7pm stored an instant that a viewer elsewhere
// rendered as a different clock time, and editing an existing event silently
// rewrote it to whatever zone the editor happened to be in. Convention #23 exists
// because two conventions once landed in one column and the rows became
// indistinguishable; this form was still writing the second one.
function instantToDateTimeInput(iso: string | null | undefined, timeZone: string): string {
  if (!iso) return ""
  try {
    const { ymd, hhmm } = instantToZoned(iso, timeZone)
    return `${ymd}T${hhmm}`
  } catch { return "" }
}

// `YYYY-MM-DDTHH:mm` from the input → a true instant, interpreting the typed wall
// clock as the MINISTRY's local time, which is what the user meant.
function dateTimeInputToISO(value: string, timeZone: string): string | null {
  if (!value) return null
  const [ymd, hhmm] = value.split("T")
  if (!ymd || !hhmm) return null
  try { return zonedTimeToISO(ymd, hhmm, timeZone) } catch { return null }
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

// Feed page size — the initial announcements query is bounded to this (pinned-first);
// "Load more" grows the window by another page.
const FEED_PAGE = 30

const FILTERS: { id: FilterType; label: string }[] = [
  { id: "all", label: "All" },
  { id: "events", label: "Events" },
  { id: "forms", label: "Forms" },
  { id: "pinned", label: "Pinned" },
]

// Mobile (B3 Pocket) filter pills — All / Events / Updates.
const MOBILE_FILTERS: { id: "all" | "events" | "updates"; label: string }[] = [
  { id: "all", label: "All" },
  { id: "events", label: "Events" },
  { id: "updates", label: "Updates" },
]

// ── Create Modal (new only) ──────────────────────────────────────────────────

export function CreateAnnouncementModal({ userId, ministryId, existing, onClose, onSuccess }: CreateAnnouncementModalProps) {
  const supabase = createClient()
  const timeZone = useMinistryTimezone()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const isEditing = !!existing

  const [title, setTitle] = useState(existing?.title ?? "")
  const [body, setBody] = useState(existing?.body ?? "")
  const [audience, setAudience] = useState(existing?.audience ?? "all")
  const [isEvent, setIsEvent] = useState(existing?.is_event ?? false)
  const [eventDate, setEventDate] = useState(() => instantToDateTimeInput(existing?.event_date, timeZone))
  // Optional end. NULL-when-empty is meaningful: plenty of announcements are "we
  // start at 7" with no defined finish, so an empty field must not be coerced.
  const [eventEndDate, setEventEndDate] = useState(() => instantToDateTimeInput(existing?.event_end_date, timeZone))
  const [showAttendees, setShowAttendees] = useState(existing?.show_attendees ?? false)
  // Asks for acknowledgment. Defaults ON (ratified 2026-08-19) — every
  // announcement asks unless the author turns it off. The opt-out is the
  // pressure valve that keeps the signal meaningful: a purely informational post
  // should not spend a tap, or the tap goes reflexive and the number stops
  // carrying information. Discoverable, not prominent.
  const [requiresAck, setRequiresAck] = useState(existing?.requires_ack ?? true)
  // Feature on Home. The carousel is the church's front page, so this is offered
  // ONLY for whole-church announcements — a class-only post being "featured" to
  // everyone is the same audience leak the Home fallback had. Gating the CONTROL
  // rather than filtering later keeps the rule visible to the person deciding.
  const [featureOnHome, setFeatureOnHome] = useState(false)
  // The slide row that already exists for this announcement, if any. Editing must
  // be able to turn the toggle OFF, which means knowing what to delete.
  const [existingSlideId, setExistingSlideId] = useState<string | null>(null)
  const [imageFile, setImageFile] = useState<File | null>(null)
  const [imagePreview, setImagePreview] = useState<string | null>(existing?.image_url ?? null)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Form attachment (forms are first-class objects now — built in the Forms tab,
  // attached here). A form belongs to 0-or-1 announcement.
  const [attachedFormId, setAttachedFormId] = useState<string | null>(null)
  const [initialFormId, setInitialFormId] = useState<string | null>(null)
  const [availableForms, setAvailableForms] = useState<AttachableForm[]>([])

  // On the edit path, reflect whether this announcement is ALREADY featured, so
  // the toggle shows its real state and can be turned off.
  useEffect(() => {
    if (!isEditing || !existing) return
    let cancelled = false
    supabase
      .from("home_slides")
      .select("id")
      .eq("ministry_id", ministryId)
      .eq("announcement_id", existing.id)
      .maybeSingle()
      .then(({ data }) => {
        if (cancelled) return
        setExistingSlideId(data?.id ?? null)
        setFeatureOnHome(!!data)
      })
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isEditing, existing?.id, ministryId])

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

  async function handleSubmit(e?: React.FormEvent, asDraft = false) {
    e?.preventDefault()
    if (!title.trim() || !body.trim()) { setError("Title and body are required."); return }
    if (!asDraft && isEvent && !eventDate.trim()) { setError("Events need a date & time before publishing."); return }
    // The DB CHECK (announcements_event_end_after_start) already rejects both of
    // these, correctly — but there is no <form> in this modal, so `required` and
    // `min` on the inputs are advisory and never run. Without these guards the
    // author sees the raw Postgres string ("new row for relation ... violates
    // check constraint ...") in the error slot. Catch it where a sentence can be
    // written instead; the constraint stays as the backstop.
    if (isEvent && eventEndDate && !eventDate) { setError("Add a start time before an end time."); return }
    if (isEvent && eventDate && eventEndDate && eventEndDate < eventDate) { setError("The end time must be after the start time."); return }
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
        .update({ title: title.trim(), body: body.trim(), audience, is_event: isEvent, event_date: isEvent && eventDate ? dateTimeInputToISO(eventDate, timeZone) : null, event_end_date: isEvent && eventEndDate ? dateTimeInputToISO(eventEndDate, timeZone) : null, show_attendees: showAttendees, requires_ack: requiresAck, image_url: imageUrl, status })
        .eq("id", existing.id).eq("ministry_id", ministryId).select().maybeSingle()
      if (updateError) { setError(updateError.message); setSubmitting(false); return }
      // RLS filters rows out WITHOUT raising: a denied UPDATE returns 200 with an
      // empty body, so `updateError` is null and `data` is null. The old fallback
      // fabricated the row from local state, which meant a denied edit reported
      // success and the composer closed over changes that were never written.
      // Trust the returned row or fail loudly — never invent it.
      if (!data) { setError("You don't have permission to edit this announcement."); setSubmitting(false); return }
      announcementId = existing.id
      resultAnn = data as Announcement
    } else {
      const { data, error: insertError } = await supabase
        .from("announcements")
        .insert({ title: title.trim(), body: body.trim(), audience, is_event: isEvent, event_date: isEvent && eventDate ? dateTimeInputToISO(eventDate, timeZone) : null, event_end_date: isEvent && eventEndDate ? dateTimeInputToISO(eventEndDate, timeZone) : null, show_attendees: showAttendees, requires_ack: requiresAck, is_pinned: false, image_url: imageUrl, created_by: userId, ministry_id: ministryId, status })
        .select().single()
      if (insertError) { setError(insertError.message); setSubmitting(false); return }
      announcementId = data.id
      resultAnn = data as Announcement
    }

    // Reconcile the Featured slide. Deliberately the SAME home_slides row the
    // Curate manager writes — one mechanism, so a slide added here is editable
    // there and vice versa, rather than two paths writing the table differently.
    // Only whole-church announcements can hold one, so a narrowed audience on an
    // edit removes an existing slide even if the toggle was never touched.
    const wantsFeature = featureOnHome && audience === "all" && status === "published"
    if (wantsFeature && !existingSlideId) {
      const { data: siblings } = await supabase
        .from("home_slides")
        .select("order_index")
        .eq("ministry_id", ministryId)
      const nextOrder = siblings && siblings.length
        ? Math.max(...siblings.map((r) => (r as { order_index: number }).order_index)) + 1
        : 0
      await supabase.from("home_slides").insert({
        ministry_id: ministryId,
        slide_type: "announcement",
        announcement_id: announcementId,
        calendar_event_id: null,
        order_index: nextOrder,
        created_by: userId,
      })
    } else if (!wantsFeature && existingSlideId) {
      await supabase.from("home_slides").delete().eq("id", existingSlideId).eq("ministry_id", ministryId)
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

  // Draft-aware action affordances. A "Save draft" action is offered on a NEW
  // post and when editing an announcement that is STILL a draft (so a leader can
  // keep iterating privately); editing an already-published post shows only
  // "Save changes". Publishing a draft flips status → published (handleSubmit
  // asDraft=false), which drops it out of the mobile DRAFTS tray into the feed.
  const isDraftEditing = isEditing && existing?.status === "draft"
  const showDraftAction = !isEditing || isDraftEditing
  const publishLabel = submitting ? "Saving…" : (isEditing && !isDraftEditing) ? "Save changes" : "Publish"
  // Publish is disabled (45% plum on mobile) until there's a headline + body.
  const publishDisabled = submitting || !title.trim() || !body.trim()

  // Primary + secondary action buttons (shared by mobile + desktop headers).
  // Height is parametrized so the mobile chrome gets a ≥34px hit target while
  // desktop stays at its 28px footer size (byte-identical). Padding/line-height
  // are unchanged, so the taller mobile target doesn't visually bloat the label.
  const renderPublish = (height: number) => (
    <CentralButton
      type="button"
      variant="primary"
      disabled={submitting}
      onClick={e => handleSubmit(e as unknown as React.FormEvent, false)}
      style={{ height, padding: "0 16px", borderRadius: 9, fontSize: 13, flexShrink: 0 }}
    >
      {submitting ? "Saving…" : isEditing ? "Save changes" : "Publish"}
    </CentralButton>
  )
  // Mobile chrome passes "Save" — the full "Save draft" label crowds the one-line
  // header and truncates the title (Brian, 2026-07-15); desktop footer keeps it.
  const renderDraft = (height: number, label = "Save draft") => !isEditing ? (
    <button
      type="button"
      disabled={submitting}
      onClick={e => handleSubmit(e as unknown as React.FormEvent, true)}
      className="flex items-center justify-center transition-colors disabled:opacity-50 hover:bg-[var(--ivory)]"
      style={{ height, padding: "0 14px", borderRadius: 9, border: "1px solid var(--line)", background: "transparent", color: "var(--ink)", fontSize: 13, fontWeight: 500, cursor: submitting ? "default" : "pointer", flexShrink: 0 }}
    >
      {label}
    </button>
  ) : null

  return (
    <div className="pb-[calc(env(safe-area-inset-bottom)+24px)] md:pb-0 md:flex md:flex-col md:h-full md:overflow-hidden" style={{ background: "var(--cream)" }}>
      {/* ── Mobile header — ONE line: back · title · actions. Title drops to
          20px when sharing the row with 2+ actions (mobile §2.1) and truncates
          rather than wrapping against Save draft + Publish. ── */}
      <div className="md:hidden flex items-center gap-3 px-5 pt-6 pb-4" style={{ borderBottom: "1px solid var(--line)" }}>
        <BackChevron onClick={onClose} />
        <span className="flex-1 min-w-0" style={{ ...POCKET_CHROME_TITLE }}>{titleText}</span>
        <div className="flex items-center gap-2 flex-shrink-0">
          {/* "Save" (quiet) = save-as-draft — the full "Save draft" label crowds the
              one-line chrome and truncates the title (Brian, 2026-07-15). Publish =
              primary compact, 45% plum until headline + body exist (v2 disabled rule). */}
          {showDraftAction && (
            <PocketButton variant="quiet" surface="page" compact disabled={submitting} onClick={() => handleSubmit(undefined, true)}>Save</PocketButton>
          )}
          <PocketButton variant="primary" compact disabled={publishDisabled} onClick={() => handleSubmit(undefined, false)}>{publishLabel}</PocketButton>
        </div>
      </div>

      {/* ── Mobile: scrollable single column on cream ── */}
      <div className="md:hidden flex-1 overflow-y-auto min-h-0 px-5 py-5 flex flex-col gap-5">
        {error && <div className="rounded-xl px-4 py-3 text-[13px] text-[var(--plum)] font-medium" style={{ background: "rgba(62,21,64,0.08)" }}>{error}</div>}
        {/* Writing surface — mono kickers over a borderless serif headline + body,
            on the page bg (v2 §4 forms; prototype s.annCompose). */}
        <div className="flex flex-col">
          <p style={POCKET_KICKER_STYLE} className="mb-2.5">Headline</p>
          <input
            type="text" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="A clear, scannable headline" required
            className="placeholder:text-[var(--faint)]"
            style={{ fontFamily: "var(--serif)", fontSize: 21, fontWeight: 600, letterSpacing: "-0.01em", color: "var(--ink)", lineHeight: 1.1, background: "transparent", border: "none", borderBottom: "1px solid var(--line-3)", outline: "none", width: "100%", paddingBottom: 14 }}
          />
          <p style={POCKET_KICKER_STYLE} className="mt-[18px] mb-2.5">Body</p>
          <textarea
            value={body} onChange={(e) => setBody(e.target.value)} placeholder="Write the full announcement here…" required rows={7}
            className="placeholder:text-[var(--faint)]"
            style={{ fontFamily: "var(--serif)", fontSize: 15.5, lineHeight: 1.6, color: "var(--ink)", background: "transparent", border: "none", outline: "none", resize: "none", width: "100%" }}
          />
        </div>

        <div style={{ borderTop: "1px solid var(--line-3)" }} />

        {/* Audience — one horizontally scrollable chip rail (never wraps);
            PocketFilterChipRow breaks out of the px-5 padding edge-to-edge. */}
        <div>
          <p style={POCKET_KICKER_STYLE} className="mb-3">Audience</p>
          <PocketFilterChipRow>
            {AUDIENCE_OPTIONS.map((opt) => (
              <PocketFilterChip
                key={opt.value}
                label={opt.label}
                active={audience === opt.value}
                onClick={() => setAudience(opt.value)}
              />
            ))}
          </PocketFilterChipRow>
        </div>

        <div style={{ borderTop: "1px solid var(--line-3)" }} />

        {/* Options — 46×28 PocketSwitch rows (v2 §4 switch) */}
        <div className="flex flex-col gap-5">
          <p style={POCKET_KICKER_STYLE}>Options</p>
          <div className="flex items-center gap-3">
            <PocketSwitch checked={isEvent} onChange={setIsEvent} ariaLabel="This is an event" />
            <div>
              <p className="text-[14.5px] font-semibold text-[var(--ink)]">This is an event</p>
              <p className="text-[13px] text-[var(--muted-text)] mt-0.5">Adds RSVP button + calendar marker</p>
            </div>
          </div>
          {isEvent && (
            <div className="flex flex-col gap-5">
              <div className="flex flex-col gap-1.5">
                <p className="text-[14.5px] font-semibold text-[var(--ink)]">Starts</p>
                {/* minWidth:0 + maxWidth:100% + border-box are all load-bearing.
                    `width:100%` alone does NOT shrink a native datetime-local below
                    its INTRINSIC width, which is wider than the ~350px a 390px phone
                    leaves after the form's px-5 gutters — so the control ran off the
                    right edge. min-width:0 lets it shrink, max-width pins the
                    ceiling, and border-box keeps the 16px padding inside the 100%
                    rather than adding to it. */}
                <input
                  type="datetime-local" value={eventDate} onChange={(e) => setEventDate(e.target.value)} required
                  style={{ fontSize: 15.5, color: "var(--ink)", background: "var(--ivory)", border: "none", borderRadius: "var(--r-pocket-sm)", padding: "14px 16px", outline: "none", width: "100%", minWidth: 0, maxWidth: "100%", boxSizing: "border-box", fontFamily: "var(--serif)" }}
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <p className="text-[14.5px] font-semibold text-[var(--ink)]">Ends <span className="font-normal text-[var(--muted-text)]">· optional</span></p>
                {/* Not `required`: "starts at 7, ends whenever" is a real event.
                    `min` keeps the picker from offering an end before the start —
                    the DB CHECK rejects it anyway, and being told at write time
                    beats being told after you hit Publish. */}
                <input
                  type="datetime-local" value={eventEndDate} min={eventDate || undefined}
                  onChange={(e) => setEventEndDate(e.target.value)}
                  style={{ fontSize: 15.5, color: "var(--ink)", background: "var(--ivory)", border: "none", borderRadius: "var(--r-pocket-sm)", padding: "14px 16px", outline: "none", width: "100%", minWidth: 0, maxWidth: "100%", boxSizing: "border-box", fontFamily: "var(--serif)" }}
                />
              </div>
              <div className="flex items-center gap-3">
                <PocketSwitch checked={showAttendees} onChange={setShowAttendees} ariaLabel="Show attendees publicly" />
                <div>
                  <p className="text-[14.5px] font-semibold text-[var(--ink)]">Show attendees publicly</p>
                  <p className="text-[13px] text-[var(--muted-text)] mt-0.5">Members can see who&apos;s going</p>
                </div>
              </div>
            </div>
          )}
          {/* Feature on Home — whole-church only. Hidden rather than disabled for a
              narrower audience: the carousel is the church's front page, so a
              class-only post simply is not a candidate, and an explanation the
              author cannot act on is noise. */}
          {audience === "all" && (
            <div className="flex items-center gap-3">
              <PocketSwitch checked={featureOnHome} onChange={setFeatureOnHome} ariaLabel="Feature on Home" />
              <div>
                <p className="text-[14.5px] font-semibold text-[var(--ink)]">Feature on Home</p>
                <p className="text-[13px] text-[var(--muted-text)] mt-0.5">Shows in the Featured carousel</p>
              </div>
            </div>
          )}
          {/* Ask for acknowledgment — ON by default. Sits LAST in Options on
              purpose: the opt-out has to be findable without inviting a habit of
              switching it off. */}
          <div className="flex items-center gap-3">
            <PocketSwitch checked={requiresAck} onChange={setRequiresAck} ariaLabel="Ask for acknowledgment" />
            <div>
              <p className="text-[14.5px] font-semibold text-[var(--ink)]">Ask for acknowledgment</p>
              <p className="text-[13px] text-[var(--muted-text)] mt-0.5">People tap &ldquo;Got it&rdquo; so you can see who&apos;s seen it</p>
            </div>
          </div>
        </div>

        <div style={{ borderTop: "1px solid var(--line-3)" }} />

        {/* Attachment — dashed add-affordance (--r-pocket, 1.5px --dashed) */}
        <div>
          <p style={POCKET_KICKER_STYLE} className="mb-3">Attachment</p>
          {imagePreview ? (
            <div className="relative overflow-hidden" style={{ borderRadius: "var(--r-pocket)" }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={imagePreview} alt="Preview" className="w-full h-44 object-cover" />
              <button type="button" onClick={removeImage} className="absolute top-2 right-2 w-7 h-7 rounded-full bg-black/50 flex items-center justify-center hover:bg-black/70 transition-colors"><X className="w-3.5 h-3.5 text-[var(--cream)]" /></button>
            </div>
          ) : (
            <button type="button" onClick={() => fileInputRef.current?.click()} className="w-full flex flex-col items-center justify-center gap-2.5" style={{ padding: 34, border: "1.5px dashed var(--dashed)", borderRadius: "var(--r-pocket)", background: "transparent", cursor: "pointer" }}>
              <ImageIcon style={{ width: 22, height: 22, color: "var(--body)" }} strokeWidth={1.6} />
              <span style={{ fontFamily: "var(--serif)", fontSize: 14.5, fontWeight: 600, color: "var(--plum)" }}>Add image or file</span>
            </button>
          )}
          <input ref={fileInputRef} type="file" accept="image/*" onChange={handleImageChange} className="hidden" />
        </div>

        <div style={{ borderTop: "1px solid var(--line-3)" }} />

        {/* Attach a form — same picker as the desktop rail (pocket kicker on mobile) */}
        <div>
          <AttachFormSection
            attachedFormId={attachedFormId}
            setAttachedFormId={setAttachedFormId}
            availableForms={availableForms}
            monoStyle={POCKET_KICKER_STYLE}
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
                <div>
                  <label className="block text-[12px] font-medium text-[var(--muted-text)] mb-1.5">Ends <span className="font-normal">· optional</span></label>
                  <input
                    type="datetime-local" value={eventEndDate} min={eventDate || undefined}
                    onChange={(e) => setEventEndDate(e.target.value)}
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
            {/* Feature on Home — whole-church only (see the mobile twin). Same
                switch grammar as the attendees toggle beside it. */}
            {audience === "all" && (
              <div className="flex items-start gap-3" style={{ marginTop: 16 }}>
                <button
                  type="button"
                  onClick={() => setFeatureOnHome((v) => !v)}
                  aria-label="Feature on Home"
                  style={{ width: 34, height: 20, borderRadius: 999, background: featureOnHome ? "var(--plum)" : "var(--dashed)", border: "none", cursor: "pointer", position: "relative", flexShrink: 0, marginTop: 2, transition: "background 0.2s" }}
                >
                  <span style={{ position: "absolute", top: 2, width: 16, height: 16, borderRadius: 999, background: "var(--cream)", transition: "left 0.2s", left: featureOnHome ? "16px" : "2px" }} />
                </button>
                <div>
                  <p className="text-[13px] font-medium text-[var(--ink)]">Feature on Home</p>
                  <p className="text-[12px] text-[var(--muted-text)] mt-0.5">Shows in the Featured carousel</p>
                </div>
              </div>
            )}
            {/* Ask for acknowledgment — ON by default (see the mobile twin). */}
            <div className="flex items-start gap-3" style={{ marginTop: 16 }}>
              <button
                type="button"
                onClick={() => setRequiresAck((v) => !v)}
                aria-label="Ask for acknowledgment"
                style={{ width: 34, height: 20, borderRadius: 999, background: requiresAck ? "var(--plum)" : "var(--dashed)", border: "none", cursor: "pointer", position: "relative", flexShrink: 0, marginTop: 2, transition: "background 0.2s" }}
              >
                <span style={{ position: "absolute", top: 2, width: 16, height: 16, borderRadius: 999, background: "var(--cream)", transition: "left 0.2s", left: requiresAck ? "16px" : "2px" }} />
              </button>
              <div>
                <p className="text-[13px] font-medium text-[var(--ink)]">Ask for acknowledgment</p>
                <p className="text-[12px] text-[var(--muted-text)] mt-0.5">People tap &ldquo;Got it&rdquo; so you can see who&apos;s seen it</p>
              </div>
            </div>
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
        {renderDraft(28)}
        {renderPublish(28)}
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
// (pinned hero, compact table, editorial cards). Delegates positioning/flip to
// the shared portal-based ActionMenu so it can never clip at the viewport bottom
// or inside an overflow-hidden card ancestor.
function DesktopActionMenu({
  isPinned, isSubPinned, showPin, showSubPin,
  onPin, onSubPin, onEdit, onDelete,
}: {
  isPinned: boolean
  isSubPinned: boolean
  showPin: boolean
  showSubPin: boolean
  onPin: () => void
  onSubPin: () => void
  onEdit: () => void
  onDelete: () => void
}) {
  const items: ActionMenuItem[] = []
  if (showPin) items.push({
    key: "pin",
    label: isPinned ? "Unpin hero" : "Pin as hero",
    icon: isPinned ? <PinOff className="w-3.5 h-3.5 text-[var(--plum)]" /> : <Pin className="w-3.5 h-3.5 text-[var(--plum)]" />,
    onSelect: onPin,
  })
  if (showSubPin) items.push({
    key: "subpin",
    label: isSubPinned ? "Remove from For You" : "Pin to For You",
    icon: <Pin className="w-3.5 h-3.5 text-[var(--plum)]" style={{ transform: "rotate(-45deg)" }} />,
    onSelect: onSubPin,
  })
  items.push({ key: "edit", label: "Edit", icon: <Edit3 className="w-3.5 h-3.5 text-[var(--plum)]" />, onSelect: onEdit })
  items.push({ key: "delete", label: "Delete", tone: "danger", icon: <Trash2 className="w-3.5 h-3.5" />, onSelect: onDelete })

  return (
    <ActionMenu
      items={items}
      align="right"
      renderTrigger={({ toggle }) => (
        <button
          onClick={toggle}
          className="w-8 h-8 flex items-center justify-center rounded-lg border border-[var(--line)] hover:bg-[var(--line-3)] transition-colors"
          title="More actions"
        >
          <MoreHorizontal className="w-4 h-4 text-[var(--muted-text)]" />
        </button>
      )}
    />
  )
}

// ── Inline acknowledgment on a feed card ─────────────────────────────────────
//
// Acknowledging should not require opening the announcement — for the tier this
// is aimed at ("no food at Bible study") that is more friction than the notice
// is worth, and a loop nobody closes is worth nothing.
//
// The qualifier is the whole point: a feed card CLAMPS its body, and confirming
// you have read text that is visibly cut off is exactly the reflexive tap that
// makes the number meaningless (spec §7, "dead signal"). So the inline "Got it"
// is offered ONLY when the entire body is on screen; when it is clipped the same
// slot invites you to open it instead. That is why the clamp is MEASURED rather
// than guessed from a character count — a count guesses wrong across two
// viewports and two font sizes, and wrong here means either suppressing an
// honest tap or offering a dishonest one.

// A body preview that reports whether the clamp cut it off.
//
// `scrollHeight > clientHeight` is the browser's own answer, so it needs no
// knowledge of the clamp line count or the font. It is re-asked on every reflow
// (ResizeObserver: column width, orientation, sidebar collapse) AND after the
// webfont swap — a font change alters the text's natural height without
// changing the clamped box, so the observer alone would sleep through it.
function ClampedText({ text, className, style, onClampChange }: {
  text: string
  className?: string
  style?: React.CSSProperties
  onClampChange: (clipped: boolean) => void
}) {
  const ref = useRef<HTMLParagraphElement>(null)
  // The callback is a fresh closure every render; keeping it in a ref keeps it
  // out of the effect's deps, so the observer is attached once per text change
  // rather than torn down and rebuilt on every parent render.
  const report = useRef(onClampChange)
  // Kept fresh in an effect, never during render (a render-phase ref write is
  // unsafe under concurrent rendering — react-hooks/refs).
  useEffect(() => { report.current = onClampChange })

  useEffect(() => {
    const el = ref.current
    if (!el) return
    let cancelled = false
    let last: boolean | null = null
    const measure = () => {
      if (cancelled || !ref.current) return
      // 1px tolerance: sub-pixel line-height rounding makes an unclipped
      // paragraph report a fractional overflow on some zoom levels.
      const clipped = ref.current.scrollHeight - ref.current.clientHeight > 1
      if (clipped !== last) { last = clipped; report.current(clipped) }
    }
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    document.fonts?.ready.then(measure).catch(() => {})
    return () => { cancelled = true; ro.disconnect() }
  }, [text])

  return <p ref={ref} className={className} style={style}>{text}</p>
}

// The three states of the card control. ONE implementation of the LOGIC (which
// state applies) with two skins, because the desktop contract and the mobile
// contract genuinely differ on button grammar — what must never fork is the
// rule about when a tap is honest.
//
// Never a re-ask, never an undo: the table has no DELETE policy, so an undo
// affordance would fail at the database anyway.
// The viewer, in the only two fields the ask predicate reads.
export type AckViewer = { id: string; graduation_year?: number | null }

// Does this card show anything in its acknowledgment slot? Shared with the
// mobile card so its wrapper row is not rendered (and 14px of dead space left
// under every card) for an announcement that never asks.
//
// "Asked" is NOT re-derived here — it is `announcementAsksAck`, the same
// predicate the denominator, the detail view and Home's hold use, so a person
// can never be asked without being counted. An ALREADY-acknowledged row still
// shows its quiet confirmed state even for someone the announcement no longer
// asks (e.g. a legacy row from before the rule tightened): reporting a fact is
// not the same as making a request.
function cardShowsAck(ann: EnrichedAnnouncement, viewer: AckViewer): boolean {
  return ann.user_has_acked || announcementAsksAck(ann, viewer)
}

function AckCardAction({ ann, clipped, viewport, viewer, onAcknowledge, onOpen }: {
  ann: EnrichedAnnouncement
  clipped: boolean
  viewport: "desktop" | "mobile"
  viewer: AckViewer
  onAcknowledge: (id: string) => void
  onOpen: (id: string) => void
}) {
  if (!cardShowsAck(ann, viewer)) return null

  if (ann.user_has_acked) {
    return (
      <span style={{
        display: "inline-flex", alignItems: "center", gap: 4, whiteSpace: "nowrap",
        fontSize: viewport === "mobile" ? 13 : 12, color: "var(--muted-text)",
      }}>
        <Check style={{ width: viewport === "mobile" ? 13 : 12, height: viewport === "mobile" ? 13 : 12 }} />Acknowledged
      </span>
    )
  }

  if (clipped) {
    // Names the ask that the neutral "See announcement →" beside it cannot: an
    // acknowledgment is expected of you, and reading comes first.
    return viewport === "mobile" ? (
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); onOpen(ann.id) }}
        style={{ background: "none", border: "none", padding: 0, cursor: "pointer", fontSize: 13, fontWeight: 600, fontFamily: "var(--serif)", color: "var(--plum)" }}
      >
        Read &amp; confirm →
      </button>
    ) : (
      <button
        type="button"
        onClick={() => onOpen(ann.id)}
        className="hover:text-[var(--plum)] transition-colors"
        style={{ background: "none", border: "none", padding: 0, cursor: "pointer", fontSize: 12, color: "var(--muted-text)", whiteSpace: "nowrap" }}
      >
        Read &amp; confirm →
      </button>
    )
  }

  // Body fully visible → the tap is honest.
  return viewport === "mobile" ? (
    // Quiet (cream on the ivory card, plum text) at the sibling RSVP pill's
    // geometry — not a second plum fill. A feed is many cards, and a plum pill
    // per card would spend the one accent ten times down a screen.
    <PocketButton
      variant="quiet"
      surface="card"
      onClick={() => onAcknowledge(ann.id)}
      style={{ minHeight: 38, padding: "0 20px" }}
    >
      Got it
    </PocketButton>
  ) : (
    <CentralButton
      variant="plum-outline"
      onClick={() => onAcknowledge(ann.id)}
      style={{ padding: "8px 16px", borderRadius: 999, fontSize: 12, whiteSpace: "nowrap" }}
    >
      Got it
    </CentralButton>
  )
}

export function AnnouncementsTab({ userId, userName, userRole, userGradYear, ministryId, onOpenAnnouncement, onComposerOpenChange }: AnnouncementsTabProps) {
  const supabase = createClient()
  const openMemberProfile = useOpenMemberProfile()
  // Compose/edit is ephemeral plain state — never in the URL. A reload mid-compose
  // drops back to the underlying announcements list (Phase 2).
  const [showCreate, setShowCreate] = useState(false)
  const [compact, setCompact] = useState(false)
  const [filter, setFilter] = useState<FilterType>("all")
  // Feed is bounded to a page (pinned-first) so the initial load never fetches the
  // full announcement history; "Load more" grows the window by PAGE. keepPreviousData
  // on the SWR below keeps the current page visible while the larger page fetches.
  const [feedLimit, setFeedLimit] = useState(FEED_PAGE)
  // Mobile-only Pocket filter (All / Events / Updates) — separate from the desktop
  // FilterType (which also carries forms/pinned). Updates = non-event posts.
  const [mobileFilter, setMobileFilter] = useState<"all" | "events" | "updates">("all")
  // Land the mobile filter swap at the top (window scroll on phone width).
  useScrollResetOn([mobileFilter])

  const [editingAnnouncement, setEditingAnnouncement] = useState<EnrichedAnnouncement | null>(null)

  // Report the full-screen compose/edit surface up/down so home-app hides the
  // pill nav (§2.2). Cleanup covers unmount-while-open (URL-driven tab change).
  const composeOpen = showCreate || editingAnnouncement !== null
  useEffect(() => {
    onComposerOpenChange?.(composeOpen)
    return () => onComposerOpenChange?.(false)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [composeOpen])

  // Form fill overlay state
  const [formFillState, setFormFillState] = useState<{ formId: string; announcementId: string; title: string } | null>(null)
  // Desktop delete confirmation — routes handleDesktopDelete through ConfirmDialog.
  const [deleteConfirmAnn, setDeleteConfirmAnn] = useState<EnrichedAnnouncement | null>(null)

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

  const isLeaderOrAdmin = isLeaderRole(userRole)
  // Who the acknowledgment ask is evaluated against. Grad year is load-bearing:
  // a LEADER's feed carries every audience, including a class-only announcement
  // they are not in — and being asked for an acknowledgment that no denominator
  // counts is the same "17 of 16" bug as the author case.
  const ackViewer: AckViewer = { id: userId, graduation_year: userGradYear }

  const loadAnnouncements = useCallback(async (): Promise<EnrichedAnnouncement[]> => {
    let annQuery = supabase
      .from("announcements")
      .select("*")
      .eq("ministry_id", ministryId)
      .order("is_pinned", { ascending: false })
      .order("is_sub_pinned", { ascending: false })
      .order("created_at", { ascending: false })
      // Bound the feed (pinned-first ordering is preserved by the .order() chain,
      // so the pinned hero is always inside the first page). "Load more" raises
      // feedLimit → refetches a larger window.
      .limit(feedLimit)

    if (!isLeaderOrAdmin) {
      // ONE audience rule (lib/announcement-audience.ts) — shared with home-tab,
      // the push resolver and the acknowledgment denominator.
      annQuery = annQuery.or(audienceOrFilter(userGradYear)).or("status.is.null,status.eq.published")
    }

    const { data: annData } = await annQuery
    const anns: Announcement[] = annData ?? []

    if (anns.length === 0) return []

    const ids = anns.map((a) => a.id)
    // COUNTS come from SECURITY DEFINER batch functions, not from counting rows:
    // announcement_views and rsvps are no longer ministry-wide readable (a member
    // sees own rows, plus attendees where the author switched show_attendees on),
    // so counting rows client-side would silently collapse to 0-or-1 for members.
    // The rsvps ROW select stays — it is what still answers "did I RSVP" and
    // populates the attendee chips wherever the author chose to show them.
    const [viewMap, rsvpCountMap, { data: rsvpRows }, { data: formRows }, { data: ackRows }] = await Promise.all([
      fetchViewCounts(supabase, ids),
      fetchRsvpCounts(supabase, ids),
      supabase.from("rsvps").select("announcement_id, user_id").in("announcement_id", ids),
      supabase.from("announcement_forms").select("id, announcement_id").in("announcement_id", ids),
      // MY acknowledgments only — own-row read under RLS, which is also exactly
      // what the card needs. No ack COUNT is fetched here on purpose: the card
      // shows no count, and the leader view of who has/hasn't belongs to the
      // announcement's own screen, not to a feed row.
      supabase.from("announcement_acknowledgements").select("announcement_id").eq("user_id", userId).in("announcement_id", ids),
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

    const rsvpAttendeesMap: Record<string, RsvpAttendee[]> = {}
    const userRsvpSet = new Set<string>()
    const userAckSet = new Set((ackRows ?? []).map((r) => r.announcement_id))
    for (const r of rsvpRows ?? []) {
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
      user_has_acked: userAckSet.has(ann.id),
    }))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId, ministryId, isLeaderOrAdmin, userGradYear, feedLimit])

  // SWR cache: keyed on every param the query branches on, so revisiting the tab
  // shows cached data instantly while revalidating in the background. feedLimit is
  // in the key so "Load more" refetches; keepPreviousData holds the current page on
  // screen while the larger page loads (no flash to skeleton).
  const { data: announcements = [], isLoading: loading, mutate: mutateAnnouncements } = useSWR(
    ["announcements", ministryId, userId, isLeaderOrAdmin, userGradYear, feedLimit],
    loadAnnouncements,
    { keepPreviousData: true }
  )
  // A full page came back → there may be more history to load.
  const hasMoreAnnouncements = announcements.length >= feedLimit

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
    // Does the RSVP also satisfy an acknowledgment for THIS viewer? Same
    // predicate as the "Got it" — an author RSVPing their own event is not
    // acknowledging anything, and writing the row would push the count past its
    // own total (the author is excluded from the denominator).
    const rsvpSatisfiesAck = announcementAsksAck(current, ackViewer)

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
          // RSVP satisfies acknowledgment, so the card's ack slot must settle in
          // the same frame as the RSVP pill. Un-RSVPing never takes it back
          // (insert-only) — hence the one-way OR rather than a toggle.
          user_has_acked: ann.user_has_acked || (!wasRsvped && rsvpSatisfiesAck),
        }
      })

    mutateAnnouncements(
      async (prev) => {
        if (wasRsvped) {
          const { error } = await supabase.from("rsvps").delete().eq("announcement_id", announcementId).eq("user_id", userId)
          if (error) throw error
        } else {
          const { error } = await supabase.from("rsvps").upsert({ announcement_id: announcementId, user_id: userId }, { onConflict: "announcement_id,user_id", ignoreDuplicates: true })
          if (error) throw error
          // An RSVP is a strictly stronger signal than "I saw this", so it
          // SATISFIES acknowledgment — making someone tap twice for one
          // announcement teaches them the tap is bureaucracy. Insert-only, so
          // un-RSVPing above deliberately does NOT take it back.
          if (rsvpSatisfiesAck) await acknowledgeAnnouncement(supabase, announcementId, userId)
        }
        return applyToggle(prev)
      },
      { optimisticData: applyToggle, rollbackOnError: true, revalidate: false, populateCache: true }
    ).then(() => refreshHome())
  }

  // Which cards had their body cut off by the clamp, reported by ClampedText and
  // keyed by announcement id. State lives HERE rather than in a per-card hook
  // because the desktop cards are inline JSX inside a .map() — a hook per
  // iteration is not available, and extracting a card component to get one would
  // move ~70 lines of shipped markup for no behavioural gain.
  // Unmeasured defaults to CLIPPED at every read site (`?? true`): during the
  // first paint, before ClampedText has measured, the honest assumption is that
  // the body is cut off — a card must never offer an inline confirm it has not
  // yet earned.
  const [clippedIds, setClippedIds] = useState<Record<string, boolean>>({})
  const reportClipped = useCallback((id: string, clipped: boolean) => {
    setClippedIds((prev) => (prev[id] === clipped ? prev : { ...prev, [id]: clipped }))
  }, [])

  // Inline "Got it" from a card. Same write path as the detail view — optimistic
  // (Convention #4), ON CONFLICT DO NOTHING, an empty result is SUCCESS. There is
  // deliberately no second writer: acknowledgeAnnouncement() is the only one.
  function handleAcknowledge(announcementId: string) {
    const current = (announcements ?? []).find((a) => a.id === announcementId)
    // The control only renders when asked; the guard keeps that invariant local
    // to the write, so no future caller can route around it.
    if (!current || current.user_has_acked || !announcementAsksAck(current, ackViewer)) return

    const applyAck = (list: EnrichedAnnouncement[] | undefined): EnrichedAnnouncement[] =>
      (list ?? []).map((ann) => (ann.id === announcementId ? { ...ann, user_has_acked: true } : ann))

    mutateAnnouncements(
      async (prev) => {
        const { error } = await acknowledgeAnnouncement(supabase, announcementId, userId)
        if (error) throw new Error(error)
        return applyAck(prev)
      },
      { optimisticData: applyAck, rollbackOnError: true, revalidate: false, populateCache: true }
    ).then(() => refreshHome())
  }

  function handleNewAnnouncement(newAnn: Announcement, formMeta: { has_form: boolean; form_id: string | null }) {
    mutateAnnouncements((prev) => [{ ...newAnn, show_attendees: newAnn.show_attendees ?? false, view_count: 0, rsvp_count: 0, user_has_rsvped: false, rsvp_attendees: [], has_form: formMeta.has_form, form_id: formMeta.form_id, user_has_responded: false, user_has_acked: false }, ...(prev ?? [])], { revalidate: false })
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
    // `.select("id")` so an RLS-DENIED delete is distinguishable from a real one.
    // Postgres does not error when a policy filters the rows out — it reports
    // success with zero rows affected — so this discarded its result and then
    // wrote an audit entry claiming a deletion that never happened, while the row
    // vanished from the UI until the next revalidate. Role gating means this is
    // defense-in-depth, but an audit log that lies is worse than no audit log.
    const { data: deleted } = await createClient()
      .from("announcements").delete().eq("id", ann.id).eq("ministry_id", ministryId).select("id")
    if (!deleted || deleted.length === 0) {
      mutateAnnouncements()   // put the row back — the delete did not happen
      return
    }
    logAudit({ ministryId, actorId: userId, actorName: userName, action: "announcement.delete", entityType: "announcement", entityId: ann.id, entityLabel: ann.title })
  }

  // Home and Announcements are SEPARATE SWR caches (["home-tab", …] vs
  // ["announcements", …]), so a pin or an RSVP here left Home showing the old
  // state until it happened to revalidate — which is the "click off the page and
  // come back" the report describes. Invalidate the sibling cache by key prefix
  // rather than threading a callback through both tabs.
  const { mutate: globalMutate } = useSWRConfig()
  const refreshHome = () =>
    globalMutate((key) => Array.isArray(key) && key[0] === "home-tab", undefined, { revalidate: true })

  async function handlePinToggle(annId: string, currentlyPinned: boolean) {
    const client = createClient()
    const target = announcements.find(a => a.id === annId)
    if (!currentlyPinned) {
      // Unpin any currently pinned announcement before pinning this one
      await client.from("announcements").update({ is_pinned: false }).eq("ministry_id", ministryId).eq("is_pinned", true)
    }
    // .select("id") for the same reason as the delete/edit paths: a policy-filtered
    // UPDATE succeeds with zero rows, so without this the pill flips in the UI on a
    // write that never landed and the audit log records it as done.
    const { data: pinned } = await client.from("announcements").update({ is_pinned: !currentlyPinned }).eq("id", annId).eq("ministry_id", ministryId).select("id")
    if (!pinned || pinned.length === 0) { mutateAnnouncements(); return }
    mutateAnnouncements(prev => (prev ?? []).map(a =>
      a.id === annId
        ? { ...a, is_pinned: !currentlyPinned }
        : { ...a, is_pinned: currentlyPinned ? a.is_pinned : false }
    ), { revalidate: false })
    refreshHome()
    logAudit({ ministryId, actorId: userId, actorName: userName, action: currentlyPinned ? "announcement.unpin" : "announcement.pin", entityType: "announcement", entityId: annId, entityLabel: target?.title ?? null })
  }

  async function handleSubPinToggle(annId: string, currentlySubPinned: boolean) {
    const client = createClient()
    const target = announcements.find(a => a.id === annId)
    const { data: subPinned } = await client.from("announcements").update({ is_sub_pinned: !currentlySubPinned }).eq("id", annId).eq("ministry_id", ministryId).select("id")
    if (!subPinned || subPinned.length === 0) { mutateAnnouncements(); return }
    mutateAnnouncements(prev => (prev ?? []).map(a =>
      a.id === annId ? { ...a, is_sub_pinned: !currentlySubPinned } : a
    ), { revalidate: false })
    refreshHome()
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
    <div className="md:flex md:flex-col md:h-full md:overflow-hidden">
      {/* Mobile chrome (B3 Pocket) — title stays "Announcements" (ruling #1) + plum
          create (leader/admin) + avatar. */}
      <PocketChrome
        title="Announcements"
        action={isLeaderOrAdmin ? (
          <PocketRoundButton variant="plum" onClick={openCreate} ariaLabel="New announcement">
            <Plus style={{ width: 16, height: 16 }} strokeWidth={1.8} />
          </PocketRoundButton>
        ) : undefined}
      />

      {/* Desktop Editorial Header — title only; view toggle + create live in the
          body toolbar row below (R1: no occupants in the title row). */}
      <TabPageHeader>
        <PageTitle
          eyebrow={`${announcements.length} total · ${announcements.filter(a => !a.user_has_rsvped && a.is_event).length} unread`}
          title="Announcements"
        />
      </TabPageHeader>

      <div className="md:flex-1 md:overflow-y-auto">
      {loading ? (
        <AnnouncementsListSkeleton />
      ) : (
        <>
          {/* Desktop toolbar — always-visible content header (R2): filter + view
              toggle (ghost left group) · create (right). No occupants in the title row. */}
          <div className="hidden md:flex items-center justify-between px-14 pt-7 mb-6">
            <div className="flex items-center gap-2">
              <FilterDropdown options={FILTERS} value={filter} onSelect={(id) => setFilter(id as FilterType)} />
              {announcements.length >= 2 && (
                <SegmentedControl
                  aria-label="Announcement layout"
                  options={[{ id: "cards", label: "Cards" }, { id: "compact", label: "Compact" }]}
                  value={compact ? "compact" : "cards"}
                  onChange={(id) => setCompact(id === "compact")}
                />
              )}
            </div>
            {isLeaderOrAdmin && (
              <ContentActionButton label="New announcement" icon={<Plus style={{ width: 14, height: 14 }} />} onClick={openCreate} />
            )}
          </div>

          {announcements.length === 0 ? (
            <div className="px-5 md:px-14">
              <EmptyState icon={<Bell className="w-7 h-7" />} title="No announcements yet" subtitle={isLeaderOrAdmin ? "Post the first announcement with New announcement above." : "Check back soon for updates"} />
            </div>
          ) : (
            <>
          {/* Mobile Pocket feed — tonal cards, filter pills, pinned-first order.
              Drafts (leader-only — members never receive draft rows from the
              status-filtered query) surface in a DRAFTS tray at the very top; the
              filtered published feed follows. */}
          <div className="md:hidden" style={{ padding: "2px 20px 0" }}>
            {(() => {
              const drafts = announcements.filter((a) => a.status === "draft")
              const published = announcements.filter((a) => a.status !== "draft")
              const mobileFiltered = published.filter((a) =>
                mobileFilter === "all" ? true : mobileFilter === "events" ? a.is_event : !a.is_event
              )
              return (
                <>
                  {/* DRAFTS tray — tap a card to resume it in the composer. Always
                      shown in full (unaffected by the All/Events/Updates filter). */}
                  {drafts.length > 0 && (
                    <div style={{ marginBottom: 20 }}>
                      <PocketKicker label="Drafts" style={{ marginTop: 8 }} />
                      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                        {drafts.map((ann) => (
                          <AnnouncementCard
                            key={ann.id}
                            announcement={ann}
                            isPinned={ann.is_pinned}
                            isDraft
                            userId={userId}
                            userGradYear={userGradYear}
                            ministryId={ministryId}
                            userRole={userRole}
                            onRsvpToggle={handleRsvpToggle}
                            onEdit={handleOpenEditor}
                            onDelete={handleDeleteAnnouncement}
                            onPinToggle={handlePinToggle}
                            onSubPinToggle={handleSubPinToggle}
                            onOpenForm={(formId, annId, title) => setFormFillState({ formId, announcementId: annId, title })}
                            onOpenDetail={onOpenAnnouncement}
                            onAcknowledge={handleAcknowledge}
                          />
                        ))}
                      </div>
                    </div>
                  )}

                  <PocketFilterChipRow style={{ marginTop: 4 }}>
                    {MOBILE_FILTERS.map((f) => (
                      <PocketFilterChip key={f.id} label={f.label} active={mobileFilter === f.id} onClick={() => setMobileFilter(f.id)} />
                    ))}
                  </PocketFilterChipRow>
                  <div style={{ display: "flex", flexDirection: "column", gap: 12, marginTop: 16 }}>
                    {mobileFiltered.length === 0 ? (
                      <p style={{ fontSize: 13, color: "var(--muted-text)", padding: "8px 4px", lineHeight: 1.5 }}>
                        {mobileFilter === "events" ? "No events posted yet — event announcements show up here." : mobileFilter === "updates" ? "No updates yet — non-event posts show up here." : "No announcements yet."}
                      </p>
                    ) : mobileFiltered.map((ann) => (
                      <AnnouncementCard
                        key={ann.id}
                        announcement={ann}
                        isPinned={ann.is_pinned}
                        userId={userId}
                        userGradYear={userGradYear}
                        ministryId={ministryId}
                        userRole={userRole}
                        onRsvpToggle={handleRsvpToggle}
                        onEdit={handleOpenEditor}
                        onDelete={handleDeleteAnnouncement}
                        onPinToggle={handlePinToggle}
                        onSubPinToggle={handleSubPinToggle}
                        onOpenForm={(formId, annId, title) => setFormFillState({ formId, announcementId: annId, title })}
                        onOpenDetail={onOpenAnnouncement}
                        onAcknowledge={handleAcknowledge}
                      />
                    ))}
                  </div>
                </>
              )
            })()}
            {hasMoreAnnouncements && (
              <div style={{ display: "flex", justifyContent: "center", padding: "16px 0 4px" }}>
                <CentralButton variant="quiet" onClick={() => setFeedLimit((n) => n + FEED_PAGE)} style={{ padding: "8px 16px", fontSize: 13 }}>
                  Load more
                </CentralButton>
              </div>
            )}
          </div>

          {/* Desktop layout — the toolbar (filter · toggle · create) lives above as an always-visible content header */}
          <div className="hidden md:block px-14 pb-7">

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
                    <ClampedText
                      text={previewBody(pinnedAnn.body)}
                      className="line-clamp-2"
                      style={{ margin: 0, fontSize: "13px", color: "var(--body)", lineHeight: 1.55 }}
                      onClampChange={(c) => reportClipped(pinnedAnn.id, c)}
                    />
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
                      <AckCardAction
                        ann={pinnedAnn}
                        clipped={clippedIds[pinnedAnn.id] ?? true}
                        viewport="desktop"
                        viewer={ackViewer}
                        onAcknowledge={handleAcknowledge}
                        onOpen={onOpenAnnouncement}
                      />
                      {pinnedAnn.rsvp_count > 0 && (
                        <span style={{ fontSize: 12, color: "var(--muted-text)" }}>{pinnedAnn.rsvp_count} going</span>
                      )}
                    </div>
                  </div>
                  {isLeaderOrAdmin && (
                    <div className="flex gap-2 items-center self-start">
                      <DesktopActionMenu
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
                          {ann.is_sub_pinned && <span style={{ fontSize: "10px", letterSpacing: "0.8px", padding: "3px 9px", borderRadius: 999, background: "var(--plum-tint)", border: "1px solid color-mix(in srgb, var(--plum) 25%, var(--cream))", textTransform: "uppercase", fontWeight: 500, color: "var(--plum)" }}>For You</span>}
                          <span style={{ fontSize: "10px", letterSpacing: "0.8px", padding: "3px 9px", borderRadius: 999, background: "var(--line-3)", textTransform: "uppercase", fontWeight: 500, color: "var(--ink)" }}>{ann.is_event ? "Event" : "Post"}</span>
                        </div>
                      </div>
                      <h3 className="line-clamp-2" style={{ margin: 0, fontFamily: "var(--serif)", fontWeight: 400, fontSize: "28px", lineHeight: 1.1, letterSpacing: "-0.01em", color: "var(--ink)" }}>{ann.title}</h3>
                      <ClampedText
                        text={previewBody(ann.body)}
                        className="line-clamp-3"
                        style={{ marginTop: "14px", fontSize: "14px", color: "var(--body)", lineHeight: 1.55 }}
                        onClampChange={(c) => reportClipped(ann.id, c)}
                      />
                      <button onClick={() => onOpenAnnouncement(ann.id)} style={{ background: "none", border: "none", cursor: "pointer", padding: 0, fontSize: "12px", color: "var(--muted-text)", marginTop: 10, textAlign: "left" }} className="hover:text-[var(--plum)] transition-colors">See announcement →</button>
                      <div style={{ marginTop: "18px", paddingTop: "16px", borderTop: "1px solid var(--line-3)" }}>
                        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "8px" }}>
                          <span style={{ fontSize: "12px", color: "var(--muted-text)" }}>{ann.rsvp_count} going · {ann.view_count} views</span>
                          <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap", justifyContent: "flex-end" }}>
                            <AckCardAction
                              ann={ann}
                              clipped={clippedIds[ann.id] ?? true}
                              viewport="desktop"
                              viewer={ackViewer}
                              onAcknowledge={handleAcknowledge}
                              onOpen={onOpenAnnouncement}
                            />
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
                                <span key={a.user_id} onClick={() => openMemberProfile(a.user_id)} style={{ fontSize: "11px", color: "var(--body)", background: "var(--ivory)", border: "1px solid var(--line)", padding: "2px 8px", borderRadius: 999, cursor: "pointer" }}>{a.name.split(" ")[0]}</span>
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
            {hasMoreAnnouncements && filteredDesktop.length > 0 && (
              <div className="flex justify-center" style={{ marginTop: 28 }}>
                <CentralButton variant="secondary" onClick={() => setFeedLimit((n) => n + FEED_PAGE)} style={{ padding: "9px 22px", fontSize: "13px" }}>
                  Load more
                </CentralButton>
              </div>
            )}
          </div>
            </>
          )}
        </>
      )}
      </div>

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

export function AnnouncementCard({ announcement, userId, userGradYear, ministryId, userRole, isDraft = false, onRsvpToggle, onEdit, onDelete, onPinToggle, onOpenForm, onOpenDetail, onAcknowledge }: AnnouncementCardProps) {
  const supabase = createClient()
  const ackViewer: AckViewer = { id: userId, graduation_year: userGradYear }
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [deleting, setDeleting] = useState(false)
  // This card IS a component, so it owns its own measurement (the desktop cards
  // are inline JSX in a .map() and report up to the tab instead). Defaults to
  // CLIPPED until measured — never offer a confirm the card has not earned.
  // (An announcement with no body at all has nothing to clip — and nothing to
  // read — so it starts honest rather than permanently deferring to the detail.)
  const [bodyClipped, setBodyClipped] = useState(!!announcement.body)

  const isAdminOrLeader = isLeaderRole(userRole)

  // Persistence is owned by the parent's handleRsvpToggle (single source of truth);
  // this only triggers the optimistic toggle, which reads back via the prop.
  function handleRsvp() {
    onRsvpToggle(announcement.id)
  }

  async function handleDelete() {
    setDeleting(true)
    // See handleDesktopDelete: a policy-filtered delete succeeds with zero rows,
    // so without .select("id") the card disappears whether or not anything died.
    const { data: deleted } = await supabase
      .from("announcements").delete().eq("id", announcement.id).eq("ministry_id", ministryId).select("id")
    if (!deleted || deleted.length === 0) { setDeleting(false); return }
    onDelete(announcement.id)
  }

  // ── B3 Pocket tonal card — the ONLY AnnouncementCard consumer is the mobile
  // Pocket feed, so this is the single card design (no featured/hero variant).
  // A published card taps through to the detail view; a DRAFT card taps into the
  // composer (resume) and suppresses RSVP/form. The RSVP pill, admin kebab, and
  // form button are stop-propagation islands inside it. ──
  const eventDate = announcement.event_date ?? announcement.created_at
  const openCard = () => (isDraft ? onEdit(announcement) : onOpenDetail(announcement.id))
  return (
    <>
      <div
        role="button"
        tabIndex={0}
        onClick={openCard}
        onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); openCard() } }}
        style={{ background: "var(--ivory)", borderRadius: "var(--r-pocket)", overflow: "hidden", cursor: "pointer" }}
      >
        {announcement.image_url && (
          <div style={{ position: "relative", width: "100%", height: 144 }}>
            <Image src={announcement.image_url} alt={announcement.title} fill sizes="(max-width: 768px) 100vw, 720px" style={{ objectFit: "cover", display: "block" }} />
          </div>
        )}
        <div style={{ padding: 18 }}>
          <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 8 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", minWidth: 0 }}>
              <span style={{ fontFamily: "var(--mono)", fontSize: 10, letterSpacing: "1.4px", textTransform: "uppercase", color: announcement.is_event ? "var(--plum)" : "var(--muted-text)" }}>
                {announcement.is_event ? `Event · ${formatDate(eventDate)}` : formatDate(announcement.created_at)}
              </span>
              {isDraft && <PocketTag label="Draft" />}
              {/* Pinned had NO signifier on the phone card — desktop shows a plum
                  "📌 Pinned" pill and the detail view shows one even on mobile, so
                  the list was the only place the state was invisible. Same plum
                  fill as desktop; scaled to the card's 9–10px tag grammar. */}
              {announcement.is_pinned && (
                <span style={{ fontSize: 9, letterSpacing: "0.08em", padding: "2px 7px", borderRadius: 999, background: "var(--plum)", color: "var(--cream-on-dark)", textTransform: "uppercase", fontWeight: 500 }}>📌 Pinned</span>
              )}
              {announcement.is_sub_pinned && (
                <span style={{ fontSize: 9, letterSpacing: "0.08em", padding: "2px 7px", borderRadius: 999, background: "var(--plum-tint)", border: "1px solid color-mix(in srgb, var(--plum) 25%, var(--cream))", color: "var(--plum)", textTransform: "uppercase", fontWeight: 500 }}>For You</span>
              )}
              {announcement.audience && announcement.audience !== "all" && (
                <span style={{ fontSize: 9, letterSpacing: "0.08em", padding: "2px 7px", borderRadius: 999, background: "var(--line-3)", color: "var(--body)", textTransform: "uppercase", fontWeight: 500 }}>{audienceLabel(announcement.audience)}</span>
              )}
            </div>
            {isAdminOrLeader && (
              <div onClick={(e) => e.stopPropagation()} style={{ flexShrink: 0, marginTop: -2, marginRight: -4 }}>
                <ActionMenu
                  align="right"
                  minWidth={140}
                  renderTrigger={({ toggle }) => (
                    <button onClick={toggle} className="w-7 h-7 rounded-full flex items-center justify-center hover:bg-[var(--line-2)] transition-colors">
                      <MoreHorizontal className="w-4 h-4 text-[var(--muted-text)]" />
                    </button>
                  )}
                  items={[
                    // A draft can't be pinned (it isn't published) — resume + delete only.
                    ...(isDraft ? [] : [{
                      key: "pin",
                      label: announcement.is_pinned ? "Unpin" : "Pin",
                      icon: announcement.is_pinned ? <PinOff className="w-3.5 h-3.5 text-[var(--plum)]" /> : <Pin className="w-3.5 h-3.5 text-[var(--plum)]" />,
                      onSelect: () => onPinToggle?.(announcement.id, announcement.is_pinned),
                    }]),
                    { key: "edit", label: isDraft ? "Resume" : "Edit", icon: <Edit3 className="w-3.5 h-3.5 text-[var(--plum)]" />, onSelect: () => onEdit(announcement) },
                    { key: "delete", label: "Delete", tone: "danger", icon: <Trash2 className="w-3.5 h-3.5" />, onSelect: () => setShowDeleteConfirm(true) },
                  ]}
                />
              </div>
            )}
          </div>

          <h3 className="line-clamp-2" style={{ fontFamily: "var(--serif)", fontSize: 21, fontWeight: 600, lineHeight: 1.15, letterSpacing: "-0.01em", color: "var(--ink)", margin: "8px 0 0" }}>{announcement.title}</h3>
          {announcement.body && (
            <ClampedText
              text={previewBody(announcement.body)}
              className="line-clamp-3"
              style={{ fontSize: 13, lineHeight: 1.5, color: "var(--body)", margin: "6px 0 0" }}
              onClampChange={setBodyClipped}
            />
          )}

          {!isDraft && announcement.is_event && (
            <div style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 14 }}>
              <button
                onClick={(e) => { e.stopPropagation(); handleRsvp() }}
                style={{
                  display: "inline-flex", alignItems: "center", gap: 6, minHeight: 38, padding: "0 20px",
                  borderRadius: 999, border: "none", fontFamily: "var(--serif)", fontSize: 13.5, fontWeight: 600, cursor: "pointer",
                  background: announcement.user_has_rsvped ? "var(--line-2)" : "var(--plum)",
                  color: announcement.user_has_rsvped ? "var(--body)" : "var(--cream-on-dark)",
                }}
              >
                {announcement.user_has_rsvped ? <><Check style={{ width: 14, height: 14 }} />Going</> : "RSVP"}
              </button>
              {announcement.rsvp_count > 0 && <span style={{ fontSize: 13, color: "var(--muted-text)" }}>{announcement.rsvp_count} going</span>}
            </div>
          )}
          {!isDraft && announcement.has_form && (
            <div style={{ marginTop: 14 }} onClick={(e) => e.stopPropagation()}>
              {announcement.user_has_responded
                ? <span style={{ fontSize: 12, color: "#2E7D32", fontWeight: 500, display: "flex", alignItems: "center", gap: 5 }}><Check style={{ width: 12, height: 12 }} />Form submitted</span>
                : <button onClick={() => announcement.form_id && onOpenForm(announcement.form_id, announcement.id, announcement.title)} style={{ padding: "8px 16px", borderRadius: 999, border: "1px solid var(--plum)", background: "transparent", color: "var(--plum)", fontSize: 13, fontWeight: 500, cursor: "pointer" }}>Fill out form →</button>
              }
            </div>
          )}
          {/* Acknowledge inline — a draft is not published, so it never asks.
              The card itself is a tap-through, so this is a stopPropagation
              island like the RSVP pill and the form button above it. */}
          {!isDraft && cardShowsAck(announcement, ackViewer) && (
            <div style={{ marginTop: 14 }} onClick={(e) => e.stopPropagation()}>
              <AckCardAction
                ann={announcement}
                clipped={bodyClipped}
                viewport="mobile"
                viewer={ackViewer}
                onAcknowledge={onAcknowledge}
                onOpen={onOpenDetail}
              />
            </div>
          )}
        </div>
      </div>

      <ConfirmDialog
        open={showDeleteConfirm}
        title="Delete this announcement?"
        message="This can't be undone."
        confirmLabel="Delete"
        loading={deleting}
        onConfirm={handleDelete}
        onClose={() => setShowDeleteConfirm(false)}
      />
    </>
  )
}

// ── Announcement Detail View (in-shell overlay) ──────────────────────────────

const DETAIL_SERIF = "var(--serif)"
const DETAIL_SANS = "var(--font-inter)"
const DETAIL_MONO = EYEBROW_STYLE

// ── Detail date-part helpers ─────────────────────────────────────────────────
// EVENT parts take the ministry zone (Convention #23): event_date is a true
// instant, so a bare toLocale* printed the VIEWER's clock — a student home for
// the summer saw a different start time than the one the event actually starts
// at. `posted` deliberately stays device-local: when something was published is
// a fact about the reader's own timeline, not about the ministry's calendar.
function detailWeekday(dateStr: string, timeZone: string): string {
  return formatInZone(dateStr, timeZone, { weekday: "long" })
}
function detailMonthDay(dateStr: string, timeZone: string): string {
  return formatInZone(dateStr, timeZone, { month: "short", day: "numeric" })
}
function detailTime(dateStr: string, timeZone: string, endStr?: string | null): string {
  const start = formatInZone(dateStr, timeZone, { hour: "numeric", minute: "2-digit", hour12: true })
  if (!endStr) return start
  const end = formatInZone(endStr, timeZone, { hour: "numeric", minute: "2-digit", hour12: true })
  // Same clock time start and end is a zero-length event, which reads as a
  // mistake rather than information — show the single time instead of "7 – 7".
  if (end === start) return start
  // A multi-DAY event needs the end's date too, or "7:00 PM – 2:00 AM" silently
  // claims it ends the same night.
  const sameDay = formatInZone(dateStr, timeZone, { year: "numeric", month: "short", day: "numeric" })
    === formatInZone(endStr, timeZone, { year: "numeric", month: "short", day: "numeric" })
  return sameDay
    ? `${start} – ${end}`
    : `${start} – ${formatInZone(endStr, timeZone, { month: "short", day: "numeric" })}, ${end}`
}
function detailPosted(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
}

// Acknowledgment progress — one hairline track, plum fill. Plum is the accent,
// used surgically (§0/§1.1): this is the one place the ask is quantified, and it
// is never a red/amber "you're behind" signal.
function AckProgress({ pct }: { pct: number }) {
  return (
    <div style={{ height: 4, borderRadius: 999, background: "var(--line-2)", marginTop: 14, overflow: "hidden" }}>
      <div style={{ width: `${pct}%`, height: "100%", borderRadius: 999, background: "var(--plum)", transition: "width 0.24s ease-out" }} />
    </div>
  )
}

interface DetailAnnouncement {
  id: string
  title: string
  body: string
  created_at: string
  event_date: string | null
  event_end_date: string | null
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
  created_by: string | null
  // Acknowledgment (spec 2026-08-19). `requires_ack` defaults TRUE for new
  // announcements; the author can opt out per announcement. The COUNT is public
  // by ratified decision — members see "3 of 18" too, because seeing that others
  // acknowledge is how the expectation is learned. The ROSTER of who has not is
  // leader-tier only, always.
  requires_ack: boolean
  ack_count: number
  ack_total: number
  user_has_acked: boolean
  /** Does it ask THIS viewer? Not the same as `requires_ack`: the author (and
   *  anyone outside the audience) is excluded from the denominator, so asking
   *  them would let the count exceed its own total — "17 of 16". Same predicate
   *  as the feed card and Home's hold. */
  asks_ack: boolean
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
  // Event parts render in the MINISTRY's zone, never the device's (Convention #23).
  const detailZone = useMinistryTimezone()
  const openMemberProfile = useOpenMemberProfile()
  const [ann, setAnn] = useState<DetailAnnouncement | null>(null)
  const [loading, setLoading] = useState(true)
  const [rsvping, setRsvping] = useState(false)
  const [formFillOpen, setFormFillOpen] = useState(false)
  // Non-acknowledger roster — LEADER-TIER ONLY, and fetched only when opened, so
  // a member's payload never contains it (spec §5: exposing non-acknowledgers to
  // members is shaming, and is the failure mode that would make people resent
  // the feature).
  const [rosterOpen, setRosterOpen] = useState(false)
  const [roster, setRoster] = useState<{ id: string; name: string }[] | null>(null)
  const [nudging, setNudging] = useState(false)
  const [nudgeNote, setNudgeNote] = useState<string | null>(null)
  // Acknowledging here changes what Home shows (an un-acknowledged announcement
  // HOLDS the Up Next slot) AND what the feed card shows (the inline "Got it"
  // must not still be offering itself on a card you just acknowledged). Both are
  // sibling SWR caches — invalidate by key prefix, the same way the list tab
  // does after a pin or an RSVP.
  const { mutate: globalMutate } = useSWRConfig()
  const refreshHome = () => {
    globalMutate((key) => Array.isArray(key) && key[0] === "home-tab", undefined, { revalidate: true })
    globalMutate((key) => Array.isArray(key) && key[0] === "announcements", undefined, { revalidate: true })
  }

  useEffect(() => {
    async function load() {
      const { data: annData } = await supabase
        .from("announcements")
        .select("*")
        .eq("id", announcementId)
        .eq("ministry_id", ministryId)
        .maybeSingle()

      if (!annData) { setLoading(false); return }

      // Counts through the SECURITY DEFINER batch functions (see
      // lib/announcement-counts.ts) — views and rsvps are no longer readable
      // ministry-wide, so counting rows here would report 0-or-1 to a member.
      // The rsvps ROW read stays for "did I RSVP" + the attendee chips.
      const [viewCounts, rsvpCounts, ackCounts, { data: rsvpRows }, { data: formData }, { data: ackRows }] = await Promise.all([
        fetchViewCounts(supabase, [announcementId]),
        fetchRsvpCounts(supabase, [announcementId]),
        fetchAckCounts(supabase, [announcementId]),
        supabase.from("rsvps").select("user_id").eq("announcement_id", announcementId),
        supabase.from("announcement_forms").select("id").eq("announcement_id", announcementId).maybeSingle(),
        // Own row for a member (RLS), every row for a leader — so this answers
        // "have I acknowledged" for everyone and seeds the roster for leaders.
        supabase.from("announcement_acknowledgements").select("user_id").eq("announcement_id", announcementId),
      ])

      supabase.from("announcement_views")
        .upsert({ announcement_id: announcementId, user_id: userId }, { onConflict: "announcement_id,user_id", ignoreDuplicates: true })
        .then()

      // Reading it takes its notification back down — same reason as a chat: a
      // push still sitting in the tray for something you have already opened is
      // the app telling you something untrue. Best-effort and silent.
      void dismissDelivered(`announcement-${announcementId}`)

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

      // The DENOMINATOR of "142 of 180": the announcement's audience, minus the
      // author, minus tombstoned accounts. Derived from the ONE audience helper
      // (lib/announcement-audience.ts) that the push resolver uses, so the number
      // shown can never disagree with the set that was actually notified. Only
      // fetched when the announcement actually asks.
      let ackTotal = 0
      let asksAck = false
      if (annData.requires_ack) {
        const { data: audienceRows } = await supabase
          .from("profiles")
          .select("id, graduation_year, deleted_at")
          .eq("ministry_id", ministryId)
          .is("deleted_at", null)
        ackTotal = (audienceRows ?? []).filter((p: { id: string; graduation_year: number | null; deleted_at: string | null }) =>
          isAnnouncementRecipient(p, annData)
        ).length
        // Whether I am ASKED is read off the very rows that make the TOTAL, so
        // the two cannot disagree — asked if and only if counted. (The author
        // was previously asked while being excluded from the total, which let
        // one tap push a 16-person audience to "17 of 16".)
        const me = (audienceRows ?? []).find((p: { id: string }) => p.id === userId)
        asksAck = !!me && announcementAsksAck(annData, me)
      }

      setAnn({
        ...annData,
        ack_count: ackCounts[announcementId] ?? 0,
        ack_total: ackTotal,
        asks_ack: asksAck,
        user_has_acked: (ackRows ?? []).some((r: { user_id: string }) => r.user_id === userId),
        view_count: viewCounts[announcementId] ?? 0,
        rsvp_count: rsvpCounts[announcementId] ?? 0,
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
      await supabase.from("rsvps").upsert({ announcement_id: ann.id, user_id: userId }, { onConflict: "announcement_id,user_id", ignoreDuplicates: true })
      setAnn((prev) => prev ? { ...prev, user_has_rsvped: true, rsvp_count: prev.rsvp_count + 1, rsvp_attendees: [...prev.rsvp_attendees, { user_id: userId, name: userName }] } : prev)
      // RSVP satisfies acknowledgment (the SECOND of the two RSVP writers — the
      // feed's handleRsvpToggle is the other). Insert-only: the un-RSVP branch
      // above must never take it back.
      await acknowledgeAck()
    }
    setRsvping(false)
  }

  // The ONE ack write from this screen: "Got it", and the RSVP path above.
  // Optimistic (Convention #4) and rolled back on failure; an already-acked row
  // comes back as an empty success, never an error (see lib/announcement-ack.ts).
  async function acknowledgeAck() {
    // Also the guard for the RSVP path below — RSVPing your own event must not
    // write you into a numerator that excludes you.
    if (!ann || ann.user_has_acked || !ann.asks_ack) return
    const revert = ann
    setAnn((prev) => prev ? { ...prev, user_has_acked: true, ack_count: prev.ack_count + 1 } : prev)
    const { error } = await acknowledgeAnnouncement(supabase, revert.id, userId)
    if (error) { setAnn((prev) => prev ? { ...prev, user_has_acked: revert.user_has_acked, ack_count: revert.ack_count } : prev); return }
    setRoster(null) // the leader roster is now stale
    refreshHome()
  }

  const isLeaderOrAdmin = isLeaderRole(userRole)
  const showAttendees = ann?.is_event && ann.rsvp_attendees.length > 0 && (isLeaderOrAdmin || ann.show_attendees)

  // Who hasn't acknowledged: the audience (shared helper) minus the ack rows a
  // leader can read. Tombstoned accounts are excluded by the helper — a deleted
  // account would otherwise sit in the list forever and be pushed to.
  async function openRoster() {
    if (!ann || !isLeaderOrAdmin) return
    setRosterOpen(true)
    setNudgeNote(null)
    if (roster) return
    const [{ data: profileRows }, { data: ackRows }] = await Promise.all([
      supabase.from("profiles").select("id, name, graduation_year, deleted_at").eq("ministry_id", ministryId).is("deleted_at", null).order("name"),
      supabase.from("announcement_acknowledgements").select("user_id").eq("announcement_id", ann.id),
    ])
    const acked = new Set((ackRows ?? []).map((r: { user_id: string }) => r.user_id))
    setRoster(
      (profileRows ?? [])
        .filter((p: { id: string; graduation_year: number | null; deleted_at: string | null }) => isAnnouncementRecipient(p, ann) && !acked.has(p.id))
        .map((p: { id: string; name: string }) => ({ id: p.id, name: p.name })),
    )
  }

  async function handleNudge() {
    if (!ann || nudging) return
    setNudging(true)
    setNudgeNote(null)
    const res = await remindUnacknowledgedAction(ann.id)
    setNudgeNote("error" in res ? res.error : `Reminded ${res.sent} ${res.sent === 1 ? "person" : "people"}.`)
    setNudging(false)
  }

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
    // Adaptive: an aside rail appears only when there's an event, a form, or an
    // acknowledgment ask (the "Got it" primary is an aside module like RSVP).
    const hasAside = ann.is_event || ann.has_form || ann.requires_ack
    // "142 of 180 acknowledged" — public by ratified decision: the aggregate is
    // what makes the norm legible. The ROSTER behind it is leader-tier only.
    const ackPct = ann.ack_total > 0 ? Math.min(100, Math.round((ann.ack_count / ann.ack_total) * 100)) : 0
    const ackLine = `${ann.ack_count} of ${ann.ack_total} acknowledged`
    // The form's button takes the loud (primary) fill only when it's the lone
    // action; if an event already owns the primary RSVP, the form drops to outline.
    const formIsPrimary = !ann.is_event
    const eyebrowSrc = ann.is_event && ann.event_date ? ann.event_date : ann.created_at

    const eyebrowRow = (
      <>
        {/* Mobile — pocket 10px kicker, borderless tonal chip */}
        <div className="md:hidden flex flex-wrap items-center gap-2.5">
          <span style={POCKET_KICKER_STYLE}>{formatDate(eyebrowSrc)}</span>
          {ann.audience && ann.audience !== "all" && (
            <span style={{ ...POCKET_KICKER_STYLE, background: "var(--line-2)", padding: "2px 8px", borderRadius: 999 }}>{audienceLabel(ann.audience)}</span>
          )}
          {ann.is_pinned && <span style={{ ...POCKET_KICKER_STYLE, color: "var(--plum)" }}>📌 Pinned</span>}
        </div>
        {/* Desktop — unchanged editorial eyebrow */}
        <div className="hidden md:flex flex-wrap items-center gap-2.5">
          <span style={monoStyle}>{formatDate(eyebrowSrc)}</span>
          {ann.audience && ann.audience !== "all" && (
            <span style={{ ...monoStyle, background: "var(--ivory)", border: "1px solid var(--line-2)", padding: "2px 8px", borderRadius: 999 }}>{audienceLabel(ann.audience)}</span>
          )}
          {ann.is_pinned && <span style={{ ...monoStyle, color: "var(--plum)" }}>📌 Pinned</span>}
        </div>
      </>
    )

    // ── Aside modules (event / form / posted) — each flush, top hairline ──
    const asideModules: React.ReactNode[] = []
    if (ann.is_event) {
      asideModules.push(
        <div key="event">
          <div style={{ ...monoStyle }}>Event</div>
          {ann.event_date && (
            <>
              <div style={{ fontFamily: DETAIL_SANS, fontSize: 15, fontWeight: 500, color: "var(--ink)", marginTop: 14 }}>{detailWeekday(ann.event_date, detailZone)}</div>
              <div style={{ fontFamily: DETAIL_SERIF, fontSize: 42, fontWeight: 600, letterSpacing: "-0.02em", lineHeight: 1, color: "var(--ink)", marginTop: 4 }}>{detailMonthDay(ann.event_date, detailZone)}</div>
              <div style={{ fontFamily: DETAIL_SANS, fontSize: 18, color: "var(--ink)", marginTop: 9 }}>{detailTime(ann.event_date, detailZone, ann.event_end_date)}</div>
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
          <div style={{ fontSize: 13, color: "var(--muted-text)", marginTop: 12, textAlign: "center" }}>{ann.rsvp_count} going</div>
          {showAttendees && (
            <div className="flex flex-wrap justify-center gap-1.5" style={{ marginTop: 12 }}>
              {ann.rsvp_attendees.map((a) => <span key={a.user_id} onClick={() => openMemberProfile(a.user_id)} style={{ fontSize: 12, color: "var(--body)", background: "var(--ivory)", border: "1px solid var(--line-2)", padding: "4px 10px", borderRadius: 999, cursor: "pointer" }}>{a.name.split(" ")[0]}</span>)}
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
    if (ann.requires_ack) {
      asideModules.push(
        <div key="ack">
          <div style={{ ...monoStyle }}>Acknowledgment</div>
          {ann.user_has_acked ? (
            // Quiet confirmed state. It never asks again and NEVER offers to undo:
            // a reversible acknowledgment is not a signal, it is a preference —
            // and the table has no DELETE policy, so an undo would fail anyway.
            <div className="flex items-center gap-1.5 text-[13px] font-medium" style={{ color: "var(--muted-text)", marginTop: 14 }}>
              <Check className="w-3.5 h-3.5" />Acknowledged
            </div>
          ) : ann.asks_ack ? (
            <CentralButton variant="primary" onClick={acknowledgeAck} style={{ width: "100%", marginTop: 18 }}>
              Got it
            </CentralButton>
          ) : null}
          {/* Someone the announcement does not ask — its AUTHOR, or a leader
              outside the class it went to — still sees the progress and (if
              leader-tier) the roster below. They just are not asked to confirm
              receipt of a notice that does not count them. */}
          <AckProgress pct={ackPct} />
          {isLeaderOrAdmin ? (
            <button
              type="button"
              onClick={openRoster}
              style={{ fontSize: 13, color: "var(--body)", background: "transparent", border: "none", padding: 0, marginTop: 10, cursor: "pointer", textAlign: "center", width: "100%" }}
            >
              {ackLine} ›
            </button>
          ) : (
            <div style={{ fontSize: 13, color: "var(--muted-text)", marginTop: 10, textAlign: "center" }}>{ackLine}</div>
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

    // ── Mobile aside — each module as a tonal borderless PocketCard (§1.1),
    //    10px pocket kicker, event date scaled to the 22px stat-number tier ──
    const asideModulesMobile: React.ReactNode[] = []
    if (ann.is_event) {
      asideModulesMobile.push(
        <PocketCard key="event">
          <div style={POCKET_KICKER_STYLE}>Event</div>
          {ann.event_date && (
            <>
              <div style={{ fontFamily: DETAIL_SANS, fontSize: 15, fontWeight: 500, color: "var(--ink)", marginTop: 12 }}>{detailWeekday(ann.event_date, detailZone)}</div>
              <div style={{ fontFamily: DETAIL_SERIF, fontSize: 22, fontWeight: 600, letterSpacing: "-0.02em", lineHeight: 1, color: "var(--ink)", marginTop: 4 }}>{detailMonthDay(ann.event_date, detailZone)}</div>
              <div style={{ fontFamily: DETAIL_SANS, fontSize: 15, color: "var(--ink)", marginTop: 8 }}>{detailTime(ann.event_date, detailZone, ann.event_end_date)}</div>
            </>
          )}
          <CentralButton
            variant={ann.user_has_rsvped ? "plum-outline" : "primary"}
            onClick={handleRsvp}
            disabled={rsvping}
            style={{ width: "100%", marginTop: 16 }}
          >
            {ann.user_has_rsvped ? <><Check style={{ width: 15, height: 15 }} />Going — tap to undo</> : "RSVP"}
          </CentralButton>
          <div style={{ fontSize: 13, color: "var(--muted-text)", marginTop: 12, textAlign: "center" }}>{ann.rsvp_count} going</div>
          {showAttendees && (
            <div className="flex flex-wrap justify-center gap-1.5" style={{ marginTop: 12 }}>
              {ann.rsvp_attendees.map((a) => <span key={a.user_id} onClick={() => openMemberProfile(a.user_id)} style={{ fontSize: 12, fontWeight: 600, color: "var(--body)", background: "var(--pocket-track)", padding: "6px 12px", borderRadius: 999, cursor: "pointer" }}>{a.name.split(" ")[0]}</span>)}
            </div>
          )}
        </PocketCard>
      )
    }
    if (ann.has_form) {
      asideModulesMobile.push(
        <PocketCard key="form">
          <div style={POCKET_KICKER_STYLE}>Form</div>
          <div style={{ fontFamily: DETAIL_SERIF, fontSize: 18, fontWeight: 500, color: "var(--ink)", marginTop: 10 }}>Includes a form</div>
          {ann.user_has_responded ? (
            <div className="flex items-center gap-1.5 text-[13px] font-medium" style={{ color: "var(--sage)", marginTop: 14 }}><FileText className="w-3.5 h-3.5" />Form submitted</div>
          ) : (
            <CentralButton
              variant={formIsPrimary ? "primary" : "plum-outline"}
              onClick={() => setFormFillOpen(true)}
              style={{ width: "100%", marginTop: 16 }}
            >
              <FileText style={{ width: 14, height: 14 }} />Fill out form
            </CentralButton>
          )}
        </PocketCard>
      )
    }
    if (ann.requires_ack) {
      asideModulesMobile.push(
        <PocketCard key="ack">
          <div style={POCKET_KICKER_STYLE}>Acknowledgment</div>
          {ann.user_has_acked ? (
            <div className="flex items-center gap-1.5 text-[13px] font-medium" style={{ color: "var(--muted-text)", marginTop: 14 }}>
              <Check className="w-3.5 h-3.5" />Acknowledged
            </div>
          ) : ann.asks_ack ? (
            <CentralButton variant="primary" onClick={acknowledgeAck} style={{ width: "100%", marginTop: 16 }}>
              Got it
            </CentralButton>
          ) : null}
          <AckProgress pct={ackPct} />
          {isLeaderOrAdmin ? (
            <button
              type="button"
              onClick={openRoster}
              style={{ fontSize: 13, color: "var(--body)", background: "transparent", border: "none", padding: 0, marginTop: 10, cursor: "pointer", textAlign: "center", width: "100%" }}
            >
              {ackLine} ›
            </button>
          ) : (
            <div style={{ fontSize: 13, color: "var(--muted-text)", marginTop: 10, textAlign: "center" }}>{ackLine}</div>
          )}
        </PocketCard>
      )
    }
    asideModulesMobile.push(
      <PocketCard key="posted">
        <div style={POCKET_KICKER_STYLE}>Posted</div>
        <div style={{ fontFamily: DETAIL_SANS, fontSize: 14, color: "var(--body)", marginTop: 8, lineHeight: 1.55 }}>
          {detailPosted(ann.created_at)}<br />{ann.view_count} {ann.view_count === 1 ? "view" : "views"}
        </div>
      </PocketCard>
    )

    return (
      // SubpageShell owns scroll + horizontal inset (px-5 md:px-14) + vertical
      // padding. No own scroll wrapper / px inset here — that would double both.
      <>
        {/* Image banner — full-bleed: negate the shell's horizontal inset and
            top padding so it hugs the edges; keeps its bottom hairline. */}
        {ann.image_url && (
          <div className="-mx-5 md:-mx-14 -mt-7 relative h-48 md:h-[300px]" style={{ borderBottom: "1px solid var(--line)" }}>
            <Image src={ann.image_url} alt={ann.title} fill sizes="(max-width: 768px) 100vw, 900px" className="object-cover block" />
          </div>
        )}
        {/* Body — single column, or 1.7fr / 1fr when an aside is present.
            Horizontal inset comes from SubpageShell; keep only vertical py + gaps. */}
        {/* No mobile top padding: SubpageShell already adds `pt-4` under a
            back-label chrome row, and stacking this wrapper's `py-6` on top put
            the date kicker 96px down against ~72 on comparable subpages — the
            same "wrapper adds a gap the chrome already owns" bug as Church
            Settings. Desktop `md:py-11` is unchanged. */}
        <div className={`pb-6 md:py-11 ${hasAside ? "grid grid-cols-1 md:grid-cols-[1.7fr_1fr] gap-9 md:gap-[60px] items-start" : ""}`}>
          {/* Main */}
          <div className="min-w-0">
            {eyebrowRow}
            {/* clamp lower bound 26px caps the mobile H1 at the pocket editorial
                tier; desktop (≥768px, 5vw≥38px) never hits the lower bound so it
                stays byte-identical up to 46px. */}
            <h1 style={{ fontFamily: DETAIL_SERIF, fontWeight: 600, fontSize: "clamp(26px, 5vw, 46px)", letterSpacing: "-0.02em", lineHeight: 1.02, color: "var(--ink)", margin: "13px 0 0" }}>{ann.title}</h1>
            {/* Reading body — mobile is serif 17 on --ink (v2 §5 Announcements
                detail); desktop keeps its editorial sans 16 on --body (unchanged). */}
            <div className="md:hidden" style={{ fontFamily: DETAIL_SERIF, fontSize: 17, lineHeight: 1.65, color: "var(--ink)", marginTop: 20, whiteSpace: "pre-wrap" }}>{ann.body}</div>
            <div className="hidden md:block" style={{ fontFamily: DETAIL_SANS, fontSize: 16, lineHeight: 1.75, color: "var(--body)", marginTop: 26, maxWidth: 640, whiteSpace: "pre-wrap" }}>{ann.body}</div>
            {/* No aside → posted/views anchor the bottom of the single column */}
            {!hasAside && (
              <div style={{ display: "flex", alignItems: "center", gap: 9, marginTop: 34, paddingTop: 22, borderTop: "1px solid var(--line)", fontSize: 14, color: "var(--muted-text)" }}>
                Posted {detailPosted(ann.created_at)} · {ann.view_count} {ann.view_count === 1 ? "view" : "views"}
              </div>
            )}
          </div>
          {/* Aside rail — event / form / posted modules. Desktop keeps the
              hairline-divided rail; mobile renders each module as a tonal
              borderless PocketCard (§1.1). Duplicated by design (small aside). */}
          {hasAside && (
            <>
              <aside className="hidden md:flex flex-col">
                {asideModules.map((mod, i) => (
                  <div key={i} style={{ padding: i === 0 ? "0 0 24px" : "24px 0", borderTop: i === 0 ? "none" : "1px solid var(--line)" }}>
                    {mod}
                  </div>
                ))}
              </aside>
              <aside className="md:hidden flex flex-col gap-3">
                {asideModulesMobile}
              </aside>
            </>
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

      {/* Who hasn't acknowledged — LEADER-TIER ONLY. One action: remind everyone
          who hasn't. Deliberately no per-person selection: picking individuals
          turns a reach tool into micro-management. The 2-per-announcement /
          24h-apart cap is enforced SERVER-side; this surface only reports it. */}
      {rosterOpen && isLeaderOrAdmin && ann && (
        <CentralModal
          onClose={() => setRosterOpen(false)}
          eyebrow="Acknowledgment"
          title={`${ann.ack_count} of ${ann.ack_total} acknowledged`}
          sheet
          footer={
            <div className="flex items-center gap-3">
              {nudgeNote && <span style={{ fontSize: 12.5, color: "var(--muted-text)" }}>{nudgeNote}</span>}
              <CentralButton
                variant="primary"
                onClick={handleNudge}
                disabled={nudging || (roster?.length ?? 0) === 0}
              >
                {nudging ? "Sending…" : `Remind the ${roster?.length ?? ""} who haven't`.trim()}
              </CentralButton>
            </div>
          }
        >
          {roster === null ? (
            <p style={{ fontSize: 13, color: "var(--muted-text)" }}>Loading…</p>
          ) : roster.length === 0 ? (
            <p style={{ fontSize: 13, color: "var(--muted-text)" }}>Everyone has acknowledged this.</p>
          ) : (
            <div className="flex flex-wrap gap-1.5">
              {roster.map((p) => (
                <span key={p.id} style={{ fontSize: 12.5, color: "var(--body)", background: "var(--ivory)", border: "1px solid var(--line-2)", padding: "4px 10px", borderRadius: 999 }}>{p.name}</span>
              ))}
            </div>
          )}
        </CentralModal>
      )}

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </SubpageShell>
  )
}
