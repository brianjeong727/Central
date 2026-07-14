"use client"

import { useState, useEffect, useCallback, type ReactNode } from "react"
import { Archive, ArchiveRestore, Check, ChevronDown, ChevronLeft, ChevronRight, Edit3, FileText, Plus, Trash2 } from "lucide-react"
import { createClient } from "@/lib/supabase"
import { Spinner, EmptyState, MONO_STYLE, EYEBROW_STYLE, AnimateIn } from "../components/shared"
import { TabPageHeader, PageTitle, PlanSubTabStrip, ContentHeader, ContentActionButton, CentralButton, CentralModal, PocketFilterChip, PocketRoundButton } from "@/components/central"
import { useNavState } from "../nav-state"
import type { FormsTabProps, FieldType } from "../types"

interface FormFieldRow {
  id: string
  form_id: string
  label: string
  type: FieldType
  options: string[]
  required: boolean
  order_index: number
}

interface FormAnswerRow {
  id: string
  response_id: string
  field_id: string
  value: string | null
  values: string[]
}

interface RespondentRow {
  userId: string
  userName: string
  submittedAt: string
  answers: FormAnswerRow[]
}

// A standalone form (first-class object). 0-or-1 announcement.
interface FormListItem {
  id: string
  title: string
  announcement_id: string | null
  announcement_title: string | null
  archived: boolean
  created_at: string
  response_count: number
}

// ── Form builder draft model (colocated with forms) ───────────────────────────

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

const FIELD_TYPES: { value: FieldType; label: string }[] = [
  { value: 'text', label: 'Text' },
  { value: 'multiple_choice', label: 'Multiple' },
  { value: 'checkbox', label: 'Checkboxes' },
  { value: 'dropdown', label: 'Dropdown' },
]

// ── Form Fill View ────────────────────────────────────────────────────────────

// Self-wrapping fill modal (DESIGN_SYSTEM §4.17). Owns its own CentralModal so it
// can pass its own `dirty` guard (any answer entered) — a half-filled form isn't
// lost to a stray backdrop-click/Escape. Callers render <FormFillView title=…
// onClose=… …/> directly (no outer CentralModal). Mirrors FormBuilder's self-wrap.
export function FormFillView({ formId, userId, ministryId, announcementId, title, onClose, onSubmitted }: {
  formId: string
  userId: string
  ministryId: string
  announcementId: string
  title: string
  onClose: () => void
  onSubmitted: () => void
}) {
  const supabase = createClient()
  const [fields, setFields] = useState<FormFieldRow[]>([])
  const [loading, setLoading] = useState(true)
  const [answers, setAnswers] = useState<Record<string, string | string[]>>({})
  const [submitting, setSubmitting] = useState(false)
  const [done, setDone] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    async function load() {
      const { data } = await supabase
        .from("form_fields")
        .select("*")
        .eq("form_id", formId)
        .order("order_index")
      const fs = (data ?? []).map(f => ({ ...f, options: Array.isArray(f.options) ? f.options : [] })) as FormFieldRow[]
      setFields(fs)
      const init: Record<string, string | string[]> = {}
      for (const f of fs) init[f.id] = f.type === 'checkbox' ? [] : ''
      setAnswers(init)
      setLoading(false)
    }
    load()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [formId])

  function setSingleAnswer(fieldId: string, value: string) {
    setAnswers(prev => ({ ...prev, [fieldId]: value }))
  }

  function toggleCheckbox(fieldId: string, option: string) {
    setAnswers(prev => {
      const cur = (prev[fieldId] as string[]) ?? []
      return { ...prev, [fieldId]: cur.includes(option) ? cur.filter(o => o !== option) : [...cur, option] }
    })
  }

  async function handleSubmit() {
    for (const f of fields) {
      if (!f.required) continue
      const ans = answers[f.id]
      const fieldName = f.label?.trim() || "This field"
      if (f.type === 'checkbox') {
        if ((ans as string[]).length === 0) { setError(`"${fieldName}" requires at least one selection.`); return }
      } else if (f.type === 'multiple_choice' || f.type === 'dropdown') {
        if (!ans || (ans as string).trim() === '') { setError(`Please select an option for "${fieldName}".`); return }
      } else {
        if (!ans || (ans as string).trim() === '') { setError(`"${fieldName}" is required.`); return }
      }
    }
    setSubmitting(true)
    setError(null)

    const { data: responseData, error: responseError } = await supabase
      .from("form_responses")
      .insert({ form_id: formId, announcement_id: announcementId, ministry_id: ministryId, user_id: userId })
      .select().single()

    if (responseError) { setError(responseError.message); setSubmitting(false); return }

    if (fields.length > 0) {
      const inserts = fields.map(f => {
        const ans = answers[f.id]
        if (f.type === 'checkbox') return { response_id: responseData.id, field_id: f.id, value: null, values: ans as string[] }
        return { response_id: responseData.id, field_id: f.id, value: (ans as string).trim() || null, values: [] }
      })
      const { error: answersError } = await supabase.from("form_answers").insert(inserts)
      if (answersError) { setError(answersError.message); setSubmitting(false); return }
    }

    setDone(true)
    setTimeout(() => onSubmitted(), 1400)
  }

  const answeredCount = fields.filter(f => {
    const a = answers[f.id]
    return f.type === 'checkbox' ? (a as string[]).length > 0 : !!(a as string)?.trim()
  }).length

  // Accidental-dismiss guard: any answer entered = dirty. Cleared once submitted
  // (`done`) so the 1400ms success auto-close never trips the discard prompt.
  const dirty = !done && Object.values(answers).some(v => Array.isArray(v) ? v.length > 0 : String(v ?? "").trim() !== "")

  let body: ReactNode
  if (loading) {
    body = <div className="flex items-center justify-center" style={{ minHeight: 240 }}><Spinner /></div>
  } else if (done) {
    body = (
      <AnimateIn className="flex flex-col items-center justify-center gap-4" style={{ minHeight: 320 }}>
        <div className="w-16 h-16 rounded-full flex items-center justify-center" style={{ background: "color-mix(in srgb, var(--plum) 10%, transparent)" }}>
          <Check className="w-8 h-8 text-[var(--plum)]" />
        </div>
        <div className="text-center">
          <p className="text-[16px] font-medium text-[var(--ink)]">Response submitted!</p>
          <p className="text-[13px] text-[var(--muted-text)] mt-1">Thank you for filling out the form.</p>
        </div>
      </AnimateIn>
    )
  } else if (fields.length === 0) {
    body = (
      <div className="flex items-center justify-center" style={{ minHeight: 240 }}>
        <EmptyState variant="bordered" icon={<FileText className="w-7 h-7" />} title="No questions" subtitle="This form has no questions yet." />
      </div>
    )
  } else {
    body = (
    // Self-constrain to a readable form column + center inside the modal body.
    //
    // Editorial question groups (§1.3): mono eyebrow ("QUESTION N · REQUIRED")
    // over a serif question, quiet option rows. Plum stays SURGICAL — selection
    // reads as an ivory surface + plum border + plum dot/check, never a plum
    // flood across every chosen row.
    <AnimateIn className="flex flex-col w-full mx-auto" style={{ maxWidth: 600, gap: 32 }}>
      {error && (
        <div style={{ background: "color-mix(in srgb, var(--danger) 8%, transparent)", border: "1px solid color-mix(in srgb, var(--danger) 18%, transparent)", borderRadius: 10, padding: "10px 14px", fontSize: 13, color: "var(--danger)", fontWeight: 500 }}>{error}</div>
      )}
      {fields.map((field, i) => (
        <div key={field.id}>
          <p style={{ fontFamily: "var(--mono)", fontSize: 11, letterSpacing: "1.4px", textTransform: "uppercase", color: "var(--muted-text)", margin: 0 }}>
            Question {i + 1}{field.required ? " · Required" : ""}
          </p>
          <p style={{ fontFamily: "var(--serif)", fontSize: 19, fontWeight: 400, color: "var(--ink)", lineHeight: 1.35, margin: "6px 0 14px" }}>
            {field.label}
          </p>
          {field.type === 'text' && (
            <textarea
              value={(answers[field.id] as string) ?? ''}
              onChange={e => setSingleAnswer(field.id, e.target.value)}
              placeholder="Your answer…"
              rows={3}
              style={{
                width: '100%', padding: '12px 14px', borderRadius: "var(--r-input)",
                border: '1px solid var(--line-2)', background: 'var(--cream-2)',
                fontSize: 15, color: 'var(--ink)', outline: 'none', resize: 'vertical', lineHeight: 1.55,
                fontFamily: "var(--sans)",
              }}
            />
          )}
          {(field.type === 'multiple_choice' || field.type === 'dropdown') && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {field.options.map(opt => {
                const selected = answers[field.id] === opt
                return (
                  <button key={opt} type="button" onClick={() => setSingleAnswer(field.id, opt)} style={{
                    display: 'flex', alignItems: 'center', gap: 12, padding: '12px 14px', borderRadius: 10,
                    cursor: 'pointer', textAlign: 'left', fontSize: 14.5, transition: 'all 0.12s',
                    border: `1px solid ${selected ? 'var(--plum)' : 'var(--line-2)'}`,
                    background: selected ? 'var(--ivory)' : 'var(--cream)',
                    color: 'var(--ink)', fontWeight: selected ? 500 : 400,
                  }}>
                    <span style={{
                      width: 16, height: 16, borderRadius: '50%', flexShrink: 0,
                      border: `2px solid ${selected ? 'var(--plum)' : 'var(--dashed)'}`,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}>
                      {selected && <span style={{ width: 7, height: 7, borderRadius: '50%', background: 'var(--plum)' }} />}
                    </span>
                    {opt}
                  </button>
                )
              })}
            </div>
          )}
          {field.type === 'checkbox' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {field.options.map(opt => {
                const checked = ((answers[field.id] as string[]) ?? []).includes(opt)
                return (
                  <button key={opt} type="button" onClick={() => toggleCheckbox(field.id, opt)} style={{
                    display: 'flex', alignItems: 'center', gap: 12, padding: '12px 14px', borderRadius: 10,
                    cursor: 'pointer', textAlign: 'left', fontSize: 14.5, transition: 'all 0.12s',
                    border: `1px solid ${checked ? 'var(--plum)' : 'var(--line-2)'}`,
                    background: checked ? 'var(--ivory)' : 'var(--cream)',
                    color: 'var(--ink)', fontWeight: checked ? 500 : 400,
                  }}>
                    <span style={{
                      width: 16, height: 16, borderRadius: 4, flexShrink: 0,
                      border: `2px solid ${checked ? 'var(--plum)' : 'var(--dashed)'}`,
                      background: checked ? 'var(--plum)' : 'transparent',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      transition: 'all 0.12s',
                    }}>
                      {checked && <Check style={{ width: 10, height: 10, color: 'var(--cream)' }} />}
                    </span>
                    {opt}
                  </button>
                )
              })}
            </div>
          )}
        </div>
      ))}
      {/* Submit row — progress counter left, the view's single primary right. */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, borderTop: '1px solid var(--line)', paddingTop: 20 }}>
        <span style={{ fontFamily: "var(--mono)", fontSize: 11, letterSpacing: "1.4px", textTransform: "uppercase", color: "var(--muted-text)" }}>
          {answeredCount} of {fields.length} answered
        </span>
        <CentralButton onClick={handleSubmit} disabled={submitting}>
          {submitting ? 'Submitting…' : 'Submit response'}
        </CentralButton>
      </div>
    </AnimateIn>
    )
  }

  return (
    <CentralModal onClose={onClose} title={title} maxWidth={720} sheet dirty={dirty}>
      {body}
    </CentralModal>
  )
}

// ── Form Builder (CentralModal — DESIGN_SYSTEM §4.17) ─────────────────────────

// A first-class form editor. Renders inside a large CentralModal (maxWidth 720,
// mobile bottom-sheet); Save lives in the modal footer. Once a form has ≥1
// response its FIELDS lock (edits/add/delete/reorder disabled); the title stays
// editable.
export function FormBuilder({ ministryId, userId, formId, onDone }: {
  ministryId: string
  userId: string
  formId?: string | null
  onDone: () => void
}) {
  const supabase = createClient()
  const isEditing = !!formId

  const [title, setTitle] = useState("")
  const [fields, setFields] = useState<DraftField[]>(
    formId ? [] : [{ tempId: newTempId(), label: '', type: 'text', options: [], required: false }]
  )
  const [locked, setLocked] = useState(false)
  const [loading, setLoading] = useState(!!formId)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // Snapshot of the loaded {title, fields} for an existing form — the baseline
  // the accidental-dismiss guard diffs against. Null for a new form (no baseline).
  const [initialSnapshot, setInitialSnapshot] = useState<string | null>(null)

  // Load existing form (title + fields) + lock if it already has responses.
  useEffect(() => {
    if (!formId) return
    async function load() {
      const { data: formRow } = await supabase
        .from("announcement_forms")
        .select("title")
        .eq("id", formId!)
        .eq("ministry_id", ministryId)
        .maybeSingle()
      const loadedTitle = formRow?.title ?? ""
      setTitle(loadedTitle)

      const { data: fieldData } = await supabase
        .from("form_fields")
        .select("*")
        .eq("form_id", formId!)
        .order("order_index")
      const loadedFields: DraftField[] = (fieldData ?? []).map(f => ({
        tempId: newTempId(),
        existingId: f.id,
        label: f.label,
        type: f.type as FieldType,
        options: Array.isArray(f.options) ? f.options : [],
        required: f.required ?? false,
      }))
      setFields(loadedFields)
      // tempIds are baked into the baseline and preserved across edits, so an
      // untouched form diffs equal; edits/reorders/add/delete diff as dirty.
      setInitialSnapshot(JSON.stringify({ title: loadedTitle, fields: loadedFields }))

      const { count } = await supabase
        .from("form_responses")
        .select("id", { count: "exact", head: true })
        .eq("form_id", formId!)
      setLocked((count ?? 0) >= 1)
      setLoading(false)
    }
    load()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [formId])

  async function handleSave() {
    if (!title.trim()) { setError("Give the form a title before saving."); return }
    if (!isEditing && fields.length === 0) { setError("Add at least one question."); return }
    setSaving(true)
    setError(null)

    let savedId = formId ?? null
    if (!savedId) {
      const { data, error: insertError } = await supabase
        .from("announcement_forms")
        .insert({ ministry_id: ministryId, title: title.trim(), announcement_id: null, created_by: userId })
        .select("id").single()
      if (insertError || !data) { setError(insertError?.message ?? "Could not create the form."); setSaving(false); return }
      savedId = data.id
    } else {
      const { error: updateError } = await supabase
        .from("announcement_forms")
        .update({ title: title.trim() })
        .eq("id", savedId).eq("ministry_id", ministryId)
      if (updateError) { setError(updateError.message); setSaving(false); return }
    }

    // Fields are immutable once the form has responses. `locked` is only known as
    // of load — re-query the live count for an existing form just before the
    // destructive rewrite (TOCTOU): a response arriving mid-edit must NOT get its
    // answers cascade-deleted. New forms (formId null) can't have responses yet.
    let effectiveLocked = locked
    if (formId) {
      const { count: liveCount } = await supabase
        .from("form_responses")
        .select("id", { count: "exact", head: true })
        .eq("form_id", formId)
      if ((liveCount ?? 0) >= 1) effectiveLocked = true
    }

    if (!effectiveLocked) {
      await supabase.from("form_fields").delete().eq("form_id", savedId)
      if (fields.length > 0) {
        const { error: fieldError } = await supabase.from("form_fields").insert(
          fields.map((f, i) => ({ form_id: savedId, label: f.label, type: f.type, options: f.options, required: f.required, order_index: i }))
        )
        if (fieldError) { setError(fieldError.message); setSaving(false); return }
      }
    } else if (!locked) {
      // Became locked mid-edit (a response landed after load): the title rename
      // above still persisted, but the existing fields are left untouched. Lock the
      // editor, surface the notice, and stay on the page so the change is visible —
      // do NOT navigate away as if the field edits had been saved.
      setLocked(true)
      setError("A response just arrived — this form's questions are now locked, so your question edits weren't saved. The title change was saved.")
      setSaving(false)
      return
    }

    setSaving(false)
    onDone()
  }

  const titleText = isEditing ? "Edit form" : "New form"

  // Unsaved-edits guard: while saving, force clean so save→close never prompts.
  // Existing form → diff against the loaded baseline; new form → any typed title
  // or question label counts as dirty.
  const dirty = saving
    ? false
    : initialSnapshot !== null
      ? JSON.stringify({ title, fields }) !== initialSnapshot
      : title.trim() !== "" || fields.some(f => f.label.trim() !== "")

  const SaveButton = (
    <CentralButton
      type="button"
      variant="primary"
      disabled={saving}
      onClick={handleSave}
      style={{ height: 28, padding: "0 16px", borderRadius: 9, fontSize: 13, flexShrink: 0 }}
    >
      {saving ? "Saving…" : isEditing ? "Save changes" : "Create form"}
    </CentralButton>
  )

  return (
    <CentralModal onClose={onDone} title={titleText} footer={SaveButton} maxWidth={720} sheet dirty={dirty}>
      {loading ? (
        <div className="flex items-center justify-center" style={{ minHeight: 240 }}><Spinner /></div>
      ) : (
        <div className="flex flex-col gap-6">
            {error && (
              <div style={{ background: "color-mix(in srgb, var(--plum) 8%, transparent)", borderRadius: 10, padding: "10px 14px", fontSize: 13, color: "var(--plum)", fontWeight: 500 }}>{error}</div>
            )}

            {locked && (
              <div style={{ background: "var(--ivory)", border: "1px solid var(--line)", borderRadius: 10, padding: "12px 14px", fontSize: 13, color: "var(--body)", lineHeight: 1.5 }}>
                This form has responses — its questions are locked. You can still rename it or archive it.
              </div>
            )}

            {/* Title */}
            <div>
              <p style={EYEBROW_STYLE} className="mb-3">Form title</p>
              <input
                type="text"
                value={title}
                onChange={e => setTitle(e.target.value)}
                placeholder="e.g. Retreat sign-up"
                className="placeholder:text-[var(--faint)]"
                style={{ fontFamily: "var(--font-instrument-serif)", fontSize: 26, fontWeight: 600, letterSpacing: "-0.02em", color: "var(--ink)", lineHeight: 1.1, background: "transparent", border: "none", borderBottom: "1px solid var(--line-2)", outline: "none", width: "100%", paddingBottom: 12 }}
              />
            </div>

            {/* Questions */}
            <div className="flex flex-col gap-4">
              <p style={EYEBROW_STYLE}>Questions</p>
              {fields.map((field, idx) => (
                <div key={field.tempId} style={{ border: "1px solid var(--line)", borderRadius: 10, padding: "12px 14px", background: "var(--ivory)", opacity: locked ? 0.7 : 1 }}>
                  {/* Field label */}
                  <input
                    type="text"
                    value={field.label}
                    disabled={locked}
                    onChange={e => setFields(prev => prev.map(f => f.tempId === field.tempId ? { ...f, label: e.target.value } : f))}
                    placeholder="Question label…"
                    style={{ width: "100%", fontSize: 13, color: "var(--ink)", background: "transparent", border: "none", outline: "none", borderBottom: "1px solid var(--line-2)", paddingBottom: 6, marginBottom: 10 }}
                  />
                  {/* Type pills */}
                  <div className="flex flex-wrap gap-1.5 mb-3">
                    {FIELD_TYPES.map(t => (
                      <button
                        key={t.value}
                        type="button"
                        disabled={locked}
                        onClick={() => setFields(prev => prev.map(f => f.tempId === field.tempId ? { ...f, type: t.value, options: t.value !== 'text' && f.options.length === 0 ? ['Option 1'] : f.options } : f))}
                        style={{
                          padding: "3px 9px", borderRadius: 999, fontSize: 11, cursor: locked ? "default" : "pointer",
                          border: `1px solid ${field.type === t.value ? "var(--plum)" : "var(--line-2)"}`,
                          background: field.type === t.value ? "var(--plum)" : "transparent",
                          color: field.type === t.value ? "var(--cream)" : "var(--body)",
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
                            disabled={locked}
                            onChange={e => setFields(prev => prev.map(f => {
                              if (f.tempId !== field.tempId) return f
                              const opts = [...f.options]; opts[oi] = e.target.value
                              return { ...f, options: opts }
                            }))}
                            style={{ flex: 1, fontSize: 12, color: "var(--ink)", background: "transparent", border: "none", outline: "none", borderBottom: "1px solid var(--line-2)", paddingBottom: 3 }}
                            placeholder={`Option ${oi + 1}`}
                          />
                          {!locked && (
                            <button
                              type="button"
                              onClick={() => setFields(prev => prev.map(f => f.tempId === field.tempId ? { ...f, options: f.options.filter((_, i) => i !== oi) } : f))}
                              style={{ width: 16, height: 16, display: "flex", alignItems: "center", justifyContent: "center", background: "transparent", border: "none", cursor: "pointer", color: "var(--dashed)", flexShrink: 0 }}
                            ><Trash2 style={{ width: 11, height: 11 }} /></button>
                          )}
                        </div>
                      ))}
                      {!locked && (
                        <button
                          type="button"
                          onClick={() => setFields(prev => prev.map(f => f.tempId === field.tempId ? { ...f, options: [...f.options, `Option ${f.options.length + 1}`] } : f))}
                          style={{ fontSize: 11, color: "var(--muted-text)", background: "transparent", border: "none", cursor: "pointer", textAlign: "left", padding: "2px 0", marginTop: 2 }}
                        >+ Add option</button>
                      )}
                    </div>
                  )}

                  {/* Row: required + reorder + delete */}
                  <div className="flex items-center justify-between">
                    <label className="flex items-center gap-1.5" style={{ cursor: locked ? "default" : "pointer" }}>
                      <input type="checkbox" disabled={locked} checked={field.required} onChange={e => setFields(prev => prev.map(f => f.tempId === field.tempId ? { ...f, required: e.target.checked } : f))} className="w-3 h-3" />
                      <span style={{ fontSize: 11, color: "var(--muted-text)" }}>Required</span>
                    </label>
                    {!locked && (
                      <div className="flex items-center gap-1">
                        <button type="button" disabled={idx === 0} onClick={() => setFields(prev => { const a = [...prev]; [a[idx-1], a[idx]] = [a[idx], a[idx-1]]; return a })} style={{ width: 20, height: 20, display: "flex", alignItems: "center", justifyContent: "center", background: "transparent", border: "none", cursor: idx === 0 ? "default" : "pointer", color: idx === 0 ? "var(--dashed)" : "var(--muted-text)" }}><ChevronLeft style={{ width: 12, height: 12, transform: "rotate(90deg)" }} /></button>
                        <button type="button" disabled={idx === fields.length - 1} onClick={() => setFields(prev => { const a = [...prev]; [a[idx], a[idx+1]] = [a[idx+1], a[idx]]; return a })} style={{ width: 20, height: 20, display: "flex", alignItems: "center", justifyContent: "center", background: "transparent", border: "none", cursor: idx === fields.length - 1 ? "default" : "pointer", color: idx === fields.length - 1 ? "var(--dashed)" : "var(--muted-text)" }}><ChevronDown style={{ width: 12, height: 12 }} /></button>
                        <button type="button" onClick={() => setFields(prev => prev.filter(f => f.tempId !== field.tempId))} style={{ width: 20, height: 20, display: "flex", alignItems: "center", justifyContent: "center", background: "transparent", border: "none", cursor: "pointer", color: "var(--dashed)", marginLeft: 2 }}><Trash2 style={{ width: 11, height: 11 }} /></button>
                      </div>
                    )}
                  </div>
                </div>
              ))}

              {!locked && (
                <button
                  type="button"
                  onClick={() => setFields(prev => [...prev, { tempId: newTempId(), label: '', type: 'text', options: [], required: false }])}
                  style={{ display: "flex", alignItems: "center", gap: 6, padding: "9px 14px", borderRadius: 8, border: "1px dashed var(--dashed)", background: "transparent", color: "var(--muted-text)", fontSize: 12, cursor: "pointer", width: "fit-content" }}
                >
                  <Plus style={{ width: 12, height: 12 }} /> Add question
                </button>
              )}
            </div>
        </div>
      )}
    </CentralModal>
  )
}

// ── Form Responses View ───────────────────────────────────────────────────────

export function FormResponsesView({ formId, title, onClose }: {
  formId: string
  title: string
  onClose: () => void
}) {
  const supabase = createClient()
  const [fields, setFields] = useState<FormFieldRow[]>([])
  const [respondents, setRespondents] = useState<RespondentRow[]>([])
  const [loading, setLoading] = useState(true)
  const [subTab, setSubTab] = useState<'responses' | 'summary'>('responses')
  const [expandedUserId, setExpandedUserId] = useState<string | null>(null)

  useEffect(() => {
    async function load() {
      const { data: fieldData } = await supabase
        .from("form_fields")
        .select("*")
        .eq("form_id", formId)
        .order("order_index")
      const fs = (fieldData ?? []).map(f => ({ ...f, options: Array.isArray(f.options) ? f.options : [] })) as FormFieldRow[]
      setFields(fs)

      type RawResponse = { id: string; user_id: string; submitted_at: string }
      const { data: responseData } = await supabase
        .from("form_responses")
        .select("id, user_id, submitted_at")
        .eq("form_id", formId)
        .order("submitted_at", { ascending: false })

      const responses = (responseData ?? []) as RawResponse[]
      const responseIds = responses.map(r => r.id)
      const userIds = [...new Set(responses.map(r => r.user_id))]

      const profileMap: Record<string, string> = {}
      if (userIds.length > 0) {
        const { data: profileData } = await supabase
          .from("profiles")
          .select("id, name")
          .in("id", userIds)
        for (const p of profileData ?? []) profileMap[p.id] = p.name
      }

      let allAnswers: FormAnswerRow[] = []
      if (responseIds.length > 0) {
        const { data: answerData } = await supabase
          .from("form_answers")
          .select("*")
          .in("response_id", responseIds)
        allAnswers = (answerData ?? []).map(a => ({ ...a, values: Array.isArray(a.values) ? a.values : [] })) as FormAnswerRow[]
      }

      const byResponse: Record<string, FormAnswerRow[]> = {}
      for (const a of allAnswers) {
        if (!byResponse[a.response_id]) byResponse[a.response_id] = []
        byResponse[a.response_id].push(a)
      }

      setRespondents(responses.map(r => ({
        userId: r.user_id,
        userName: profileMap[r.user_id] ?? 'Unknown',
        submittedAt: r.submitted_at,
        answers: byResponse[r.id] ?? [],
      })))
      setLoading(false)
    }
    load()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [formId])

  const summaryByField = fields.map(f => {
    const counts: Record<string, number> = {}
    const textAnswers: string[] = []
    for (const resp of respondents) {
      const ans = resp.answers.find(a => a.field_id === f.id)
      if (!ans) continue
      if (f.type === 'checkbox') {
        for (const v of ans.values) counts[v] = (counts[v] ?? 0) + 1
      } else if (f.type === 'multiple_choice' || f.type === 'dropdown') {
        if (ans.value) counts[ans.value] = (counts[ans.value] ?? 0) + 1
      } else {
        if (ans.value?.trim()) textAnswers.push(ans.value.trim())
      }
    }
    return { field: f, counts, textAnswers, maxCount: Math.max(...Object.values(counts), 1) }
  })

  const SUBTABS = [
    { key: 'responses', label: 'Responses' },
    { key: 'summary', label: 'Summary' },
  ] as const

  return (
    <>
      {/* Mobile header — compact, with back */}
      <div className="md:hidden px-5 pt-6 pb-5">
        <button
          onClick={onClose}
          style={{ display: 'inline-flex', alignItems: 'center', gap: 4, background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--body)', fontSize: 13, fontWeight: 500, padding: 0, marginBottom: 10 }}
        >
          <ChevronLeft className="w-4 h-4" /> Back
        </button>
        <p style={MONO_STYLE}>Responses · {loading ? '…' : respondents.length}</p>
        <h1 className="line-clamp-2" style={{ fontFamily: "var(--serif)", fontSize: 26, fontWeight: 600, letterSpacing: "-0.02em", color: "var(--ink)", lineHeight: 1.1, margin: "8px 0 0" }}>
          {title}
        </h1>
      </div>

      {/* Desktop header — back is the shell breadcrumb (§3.2 Zone A); no in-header
          back. Sub-tab strip below is the single terminating hairline (R1). */}
      <TabPageHeader noBottomHairline>
        <PageTitle eyebrow={`Responses · ${loading ? '…' : respondents.length}`} title={title} compact />
      </TabPageHeader>

      {/* Subtabs — desktop (root sibling, outside the padded content wrapper) */}
      <div className="hidden md:block">
        <PlanSubTabStrip
          tabs={SUBTABS}
          active={subTab}
          onChange={k => setSubTab(k as 'responses' | 'summary')}
        />
      </div>

      <div className="md:flex-1 md:overflow-y-auto">
        {/* Subtabs — mobile: exclusive filter → Pocket chip row (§3.4) */}
        <div className="md:hidden px-5 pt-1 flex gap-2">
          {SUBTABS.map(t => (
            <PocketFilterChip key={t.key} label={t.label} active={subTab === t.key} onClick={() => setSubTab(t.key)} />
          ))}
        </div>

        {loading ? (
          <div className="px-5 md:px-14 py-6 flex items-center justify-center"><Spinner /></div>
        ) : subTab === 'responses' ? (
          <div className="px-5 md:px-14 py-6">
            {respondents.length === 0 ? (
              <EmptyState variant="bordered" icon={<FileText className="w-7 h-7" />} title="No responses yet" subtitle="Responses will appear here once people submit." />
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {respondents.map(resp => {
                  const isExpanded = expandedUserId === resp.userId
                  return (
                    <div key={resp.userId} className="border-0 bg-[var(--ivory)] rounded-[var(--r-pocket)] md:border md:border-[var(--line)] md:bg-[var(--cream)] md:rounded-[12px]" style={{ overflow: 'hidden' }}>
                      <button
                        onClick={() => setExpandedUserId(isExpanded ? null : resp.userId)}
                        style={{
                          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                          width: '100%', padding: '14px 16px', background: 'transparent', border: 'none', cursor: 'pointer', textAlign: 'left',
                        }}
                      >
                        <div>
                          <p style={{ fontSize: 14, fontWeight: 500, color: 'var(--ink)', margin: 0 }}>{resp.userName}</p>
                          <p style={{ fontSize: 11, color: 'var(--muted-text)', margin: '2px 0 0' }}>{new Date(resp.submittedAt).toLocaleDateString()}</p>
                        </div>
                        <ChevronDown style={{ width: 16, height: 16, color: 'var(--muted-text)', transform: isExpanded ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s', flexShrink: 0 }} />
                      </button>
                      {isExpanded && (
                        <div style={{ borderTop: '1px solid var(--line)', padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 12 }}>
                          {fields.map(f => {
                            const ans = resp.answers.find(a => a.field_id === f.id)
                            const display = f.type === 'checkbox'
                              ? (ans?.values ?? []).join(', ') || '—'
                              : ans?.value || '—'
                            return (
                              <div key={f.id}>
                                <p style={{ fontSize: 10, color: 'var(--muted-text)', marginBottom: 3, letterSpacing: '0.8px', textTransform: 'uppercase' }}>{f.label}</p>
                                <p style={{ fontSize: 13, color: 'var(--ink)', lineHeight: 1.5, margin: 0 }}>{display}</p>
                              </div>
                            )
                          })}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        ) : (
          <div className="px-5 md:px-14 py-6" style={{ display: 'flex', flexDirection: 'column', gap: 32 }}>
            {respondents.length === 0 ? (
              <EmptyState variant="bordered" icon={<FileText className="w-7 h-7" />} title="No responses yet" subtitle="The summary will appear once people submit." />
            ) : summaryByField.map(({ field, counts, textAnswers }) => (
              <div key={field.id}>
                <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--ink)', marginBottom: 14 }}>{field.label}</p>
                {field.type === 'text' ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {textAnswers.length === 0 ? (
                      <p style={{ fontSize: 13, color: 'var(--muted-text)' }}>No text responses</p>
                    ) : textAnswers.map((ans, i) => (
                      <div key={i} style={{ padding: '8px 12px', background: 'var(--body-bg)', borderRadius: 8, fontSize: 13, color: 'var(--body)', lineHeight: 1.5 }}>{ans}</div>
                    ))}
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                    {field.options.map(opt => {
                      const count = counts[opt] ?? 0
                      const pct = respondents.length > 0 ? (count / respondents.length) * 100 : 0
                      return (
                        <div key={opt}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 5 }}>
                            <span style={{ fontSize: 13, color: 'var(--ink)' }}>{opt}</span>
                            <span style={{ fontSize: 12, color: 'var(--muted-text)', fontWeight: 500 }}>{count} / {respondents.length}</span>
                          </div>
                          <div style={{ height: 8, borderRadius: 999, background: 'var(--line)', overflow: 'hidden' }}>
                            <div style={{ height: '100%', width: `${pct}%`, background: 'var(--plum)', borderRadius: 999, transition: 'width 0.4s ease' }} />
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </>
  )
}

// ── Status pill ───────────────────────────────────────────────────────────────

function StatusPill({ item }: { item: FormListItem }) {
  const base = { fontSize: 10, letterSpacing: "0.8px", padding: "3px 9px", borderRadius: 999, textTransform: "uppercase" as const, fontWeight: 500 as const, whiteSpace: "nowrap" as const }
  if (item.archived) {
    return <span style={{ ...base, background: "var(--line-3)", color: "var(--muted-text)" }}>Archived</span>
  }
  if (!item.announcement_id) {
    return <span style={{ ...base, background: "var(--ivory)", border: "1px solid var(--line)", color: "var(--body)" }}>Draft</span>
  }
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 6, minWidth: 0 }}>
      <span style={{ ...base, background: "var(--plum)", color: "var(--cream)" }}>Attached</span>
      {item.announcement_title && (
        <span className="line-clamp-1" style={{ fontSize: 12, color: "var(--muted-text)" }}>· {item.announcement_title}</span>
      )}
    </span>
  )
}

// ── Forms Tab ─────────────────────────────────────────────────────────────────

// Only Responses is still a body-swap page (URL ?fresp). Create/Edit (builder)
// and Fill are now CentralModals — no URL param, no breadcrumb detail crumb.
type FormsView =
  | { mode: "list" }
  | { mode: "responses"; formId: string; title: string }

function initialFormsView(): FormsView {
  if (typeof window === "undefined") return { mode: "list" }
  const p = new URLSearchParams(window.location.search)
  const fresp = p.get("fresp")
  if (fresp) return { mode: "responses", formId: fresp, title: "" }
  return { mode: "list" }
}

export function FormsTab({ ministryId, userId, onViewChange }: FormsTabProps) {
  const supabase = createClient()
  const { setParams } = useNavState()
  const [loading, setLoading] = useState(true)
  const [items, setItems] = useState<FormListItem[]>([])
  const [showArchived, setShowArchived] = useState(false)
  const [confirmingDeleteId, setConfirmingDeleteId] = useState<string | null>(null)
  const [view, setView] = useState<FormsView>(initialFormsView)
  // Builder is a CentralModal overlaid on the list — component state, no URL.
  const [builder, setBuilder] = useState<{ formId: string | null } | null>(null)

  function openBuilder(formId: string | null) {
    setBuilder({ formId })
  }

  function closeBuilder() {
    setBuilder(null)
    load()
  }

  function openResponses(formId: string, title: string) {
    setView({ mode: "responses", formId, title })
    setParams({ fresp: formId })
    onViewChange?.("detail", title)
  }

  function backToList() {
    setView({ mode: "list" })
    setParams({ fresp: null })
    onViewChange?.("list")
    load()
  }

  // Lift the URL-restored initial view to the shell breadcrumb on mount.
  // (For a restored ?fresp the title is unknown until items load — the
  // backfill effect below announces the detail crumb then.)
  useEffect(() => {
    if (view.mode === "list") onViewChange?.("list")
    else if (view.mode === "responses" && view.title) onViewChange?.("detail", view.title)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Backfill the responses-view title from items for a URL-restored ?fresp,
  // and lift the detail view + title to the shell the same moment.
  useEffect(() => {
    if (view.mode !== "responses" || view.title !== "") return
    const match = items.find(i => i.id === view.formId)
    if (match) {
      setView(prev => prev.mode === "responses" && prev.title === "" ? { ...prev, title: match.title } : prev)
      onViewChange?.("detail", match.title)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view, items])

  const load = useCallback(async () => {
    const { data: forms } = await supabase
      .from("announcement_forms")
      .select("id, title, announcement_id, archived, created_at")
      .eq("ministry_id", ministryId)
      .order("created_at", { ascending: false })

    if (!forms || forms.length === 0) { setItems([]); setLoading(false); return }

    const formIds = forms.map(f => f.id)
    const announcementIds = [...new Set(forms.map(f => f.announcement_id).filter((v): v is string => !!v))]

    const [{ data: annData }, { data: countData }] = await Promise.all([
      announcementIds.length > 0
        ? supabase.from("announcements").select("id, title").in("id", announcementIds)
        : Promise.resolve({ data: null }),
      supabase.from("form_responses").select("form_id").in("form_id", formIds),
    ])

    const annTitleById: Record<string, string> = {}
    for (const a of annData ?? []) annTitleById[a.id] = a.title

    const responseCounts: Record<string, number> = {}
    for (const r of countData ?? []) responseCounts[r.form_id] = (responseCounts[r.form_id] ?? 0) + 1

    setItems(forms.map(f => ({
      id: f.id,
      title: f.title ?? "Untitled form",
      announcement_id: f.announcement_id,
      announcement_title: f.announcement_id ? (annTitleById[f.announcement_id] ?? null) : null,
      archived: !!f.archived,
      created_at: f.created_at,
      response_count: responseCounts[f.id] ?? 0,
    })))
    setLoading(false)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ministryId])

  useEffect(() => { load() }, [load])

  async function toggleArchive(item: FormListItem) {
    setItems(prev => prev.map(i => i.id === item.id ? { ...i, archived: !i.archived } : i))
    await supabase.from("announcement_forms").update({ archived: !item.archived }).eq("id", item.id).eq("ministry_id", ministryId)
  }

  async function deleteForm(item: FormListItem) {
    setConfirmingDeleteId(null)
    setItems(prev => prev.filter(i => i.id !== item.id))
    await supabase.from("announcement_forms").delete().eq("id", item.id).eq("ministry_id", ministryId)
  }

  // ── Body-swap dispatch (Responses only; builder is a modal overlay below) ──
  if (view.mode === "responses") {
    return (
      <div className="pb-28 md:pb-0 md:flex md:flex-col md:h-full md:overflow-hidden">
        <FormResponsesView formId={view.formId} title={view.title} onClose={backToList} />
      </div>
    )
  }

  const activeItems = items.filter(i => !i.archived)
  const archivedItems = items.filter(i => i.archived)

  function FormCard({ item }: { item: FormListItem }) {
    const confirming = confirmingDeleteId === item.id
    const canViewResponses = item.response_count > 0
    return (
      <div className="flex flex-col border-0 bg-[var(--ivory)] rounded-[var(--r-pocket)] md:border md:border-[var(--line)] md:bg-[var(--cream)] md:rounded-[14px]" style={{ padding: '18px 20px', gap: 14 }}>
        <div className="flex items-start justify-between gap-4">
          <div style={{ flex: 1, minWidth: 0 }}>
            <h3 className="line-clamp-2" style={{ fontFamily: 'var(--serif)', fontSize: 20, color: 'var(--ink)', lineHeight: 1.15, margin: 0, fontWeight: 400 }}>{item.title}</h3>
            <div className="flex items-center gap-2.5 flex-wrap" style={{ marginTop: 8, minWidth: 0 }}>
              <StatusPill item={item} />
              <span style={{ fontSize: 13, color: 'var(--muted-text)' }}>
                {item.response_count} response{item.response_count !== 1 ? 's' : ''}
              </span>
            </div>
          </div>
        </div>

        {confirming ? (
          <div className="flex items-center justify-end gap-2">
            <span style={{ fontSize: 13, color: 'var(--body)', marginRight: 'auto' }}>Delete this form and its responses?</span>
            <button onClick={() => setConfirmingDeleteId(null)} style={{ padding: '6px 14px', borderRadius: 8, fontSize: 13, cursor: 'pointer', background: 'transparent', border: '1px solid var(--line)', color: 'var(--body)' }}>Cancel</button>
            <button onClick={() => deleteForm(item)} style={{ padding: '6px 14px', borderRadius: 8, fontSize: 13, fontWeight: 500, cursor: 'pointer', background: 'var(--danger)', color: 'var(--cream)', border: 'none' }}>Delete</button>
          </div>
        ) : (
          <div className="flex items-center justify-end gap-1.5 flex-wrap">
            {canViewResponses && (
              <button
                onClick={() => openResponses(item.id, item.title)}
                style={{ display: 'flex', alignItems: 'center', gap: 3, fontSize: 13, fontWeight: 500, color: 'var(--plum)', background: 'transparent', border: 'none', cursor: 'pointer', padding: '6px 8px', marginRight: 'auto' }}
              >
                View responses
                <ChevronRight style={{ width: 15, height: 15 }} />
              </button>
            )}
            <button onClick={() => openBuilder(item.id)} title="Edit" className="w-8 h-8 flex items-center justify-center rounded-lg border border-[var(--line)] hover:bg-[var(--line-3)] transition-colors">
              <Edit3 className="w-3.5 h-3.5" style={{ color: 'var(--body)' }} />
            </button>
            <button onClick={() => toggleArchive(item)} title={item.archived ? 'Unarchive' : 'Archive'} className="w-8 h-8 flex items-center justify-center rounded-lg border border-[var(--line)] hover:bg-[var(--line-3)] transition-colors">
              {item.archived ? <ArchiveRestore className="w-3.5 h-3.5" style={{ color: 'var(--body)' }} /> : <Archive className="w-3.5 h-3.5" style={{ color: 'var(--body)' }} />}
            </button>
            <button onClick={() => setConfirmingDeleteId(item.id)} title="Delete" className="w-8 h-8 flex items-center justify-center rounded-lg border border-[var(--line)] hover:bg-[color-mix(in_srgb,var(--danger)_8%,transparent)] hover:border-[color-mix(in_srgb,var(--danger)_25%,transparent)] transition-colors">
              <Trash2 className="w-3.5 h-3.5 text-[var(--danger)]" />
            </button>
          </div>
        )}
      </div>
    )
  }

  return (
    <>
    <div className="pb-28 md:pb-0 md:flex md:flex-col md:h-full md:overflow-hidden">
      {/* Mobile header — compact */}
      <div className="md:hidden px-5 pt-6 pb-5 flex items-end justify-between">
        <div>
          <p style={MONO_STYLE}>Forms</p>
          <h1 style={{ fontFamily: "var(--serif)", fontSize: 30, fontWeight: 600, letterSpacing: "-0.02em", color: "var(--ink)", lineHeight: 1.05, margin: "8px 0 0" }}>Forms</h1>
        </div>
        <PocketRoundButton variant="plum" onClick={() => openBuilder(null)} ariaLabel="Create form">
          <Plus style={{ width: 16, height: 16 }} strokeWidth={1.8} />
        </PocketRoundButton>
      </div>

      <TabPageHeader>
        <PageTitle
          eyebrow={items.length ? `${items.length} forms · ${items.reduce((s, i) => s + i.response_count, 0)} responses` : "Forms"}
          title="Forms"
        />
      </TabPageHeader>

      <div className="md:flex-1 md:overflow-y-auto">
        {loading ? (
          <div className="px-5 md:px-14 py-6"><Spinner /></div>
        ) : (
          <div className="px-5 md:px-14 py-6 flex flex-col gap-5">
            {/* Body content header — the create CTA lives here (Convention #15).
                Desktop only: on mobile the single create is the chrome-row "+"
                (one create per screen, §3.3) — so gate the whole row md:block. */}
            <div className="hidden md:block">
              <ContentHeader
                label="Your forms"
                action={<ContentActionButton label="Create form" icon={<Plus className="w-4 h-4" />} onClick={() => openBuilder(null)} />}
              />
            </div>

            {items.length === 0 ? (
              <EmptyState icon={<FileText className="w-7 h-7" />} title="No forms yet" subtitle="Create a form, then attach it to an announcement to collect responses." />
            ) : (
              <>
                {activeItems.length === 0 ? (
                  <p style={{ fontSize: 13, color: 'var(--muted-text)' }}>No active forms.</p>
                ) : (
                  <div className="flex flex-col gap-3">
                    {activeItems.map(item => <FormCard key={item.id} item={item} />)}
                  </div>
                )}

                {archivedItems.length > 0 && (
                  <div className="flex flex-col gap-3">
                    <button
                      onClick={() => setShowArchived(v => !v)}
                      style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'transparent', border: 'none', cursor: 'pointer', padding: 0, ...EYEBROW_STYLE }}
                    >
                      <ChevronDown style={{ width: 13, height: 13, transform: showArchived ? 'none' : 'rotate(-90deg)', transition: 'transform 0.15s' }} />
                      Archived · {archivedItems.length}
                    </button>
                    {showArchived && (
                      <div className="flex flex-col gap-3">
                        {archivedItems.map(item => <FormCard key={item.id} item={item} />)}
                      </div>
                    )}
                  </div>
                )}
              </>
            )}
          </div>
        )}
      </div>
    </div>

    {builder && (
      <FormBuilder ministryId={ministryId} userId={userId} formId={builder.formId} onDone={closeBuilder} />
    )}
    </>
  )
}
