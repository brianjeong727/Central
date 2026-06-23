"use client"

import { useState, useEffect, useCallback } from "react"
import { Check, ChevronDown, FileText, X } from "lucide-react"
import { createClient } from "@/lib/supabase"
import { Spinner, EmptyState, MONO_STYLE, AnimateIn } from "../components/shared"
import { TabPageHeader, PageTitle } from "@/components/central"
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

interface AnnouncementWithForm {
  id: string
  title: string
  body: string
  created_at: string
  form_id: string
  user_has_responded: boolean
  response_count?: number
}

// ── Form Fill View ────────────────────────────────────────────────────────────

export function FormFillView({ formId, announcementTitle, userId, ministryId, announcementId, onClose, onSubmitted }: {
  formId: string
  announcementTitle: string
  userId: string
  ministryId: string
  announcementId: string
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

  if (done) {
    return (
      <AnimateIn className="fixed inset-0 z-[100] bg-[#FBF8F2] flex flex-col items-center justify-center gap-4 md:left-[var(--shell-offset)]">
        <div className="w-16 h-16 rounded-full bg-[#3E1540]/10 flex items-center justify-center">
          <Check className="w-8 h-8 text-[#3E1540]" />
        </div>
        <div className="text-center">
          <p className="text-[16px] font-bold text-[#13101A]">Response submitted!</p>
          <p className="text-[13px] text-[#8A8497] mt-1">Thank you for filling out the form.</p>
        </div>
      </AnimateIn>
    )
  }

  return (
    <AnimateIn className="fixed inset-0 z-[100] bg-[#FBF8F2] flex flex-col md:left-[var(--shell-offset)]">
      <div className="flex-shrink-0 border-b border-[#E8E2D2]">
        <div className="flex items-center justify-between px-5 pt-12 pb-4 md:pt-5 md:px-10">
          <div>
            <p style={MONO_STYLE}>Form</p>
            <p className="text-[15px] font-semibold text-[#13101A] mt-0.5 line-clamp-1">{announcementTitle}</p>
          </div>
          <button onClick={onClose} style={{ width: 30, height: 30, borderRadius: 8, border: "1px solid #E2DDCF", background: "transparent", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", flexShrink: 0 }}>
            <X className="w-3.5 h-3.5 text-[#5A5466]" />
          </button>
        </div>
      </div>

      {loading ? (
        <div className="flex-1 flex items-center justify-center"><Spinner /></div>
      ) : fields.length === 0 ? (
        <div className="flex-1 flex items-center justify-center">
          <EmptyState icon={<FileText className="w-7 h-7" />} title="No questions" subtitle="This form has no questions yet." />
        </div>
      ) : (
        <>
          <div className="flex-1 overflow-y-auto">
            <div className="max-w-[640px] mx-auto px-5 md:px-10 py-6 flex flex-col gap-6">
              {error && (
                <div style={{ background: "rgba(62,21,64,0.07)", borderRadius: 10, padding: "10px 14px", fontSize: 13, color: "#3E1540", fontWeight: 500 }}>{error}</div>
              )}
              {fields.map(field => (
                <div key={field.id}>
                  <p style={{ fontSize: 14, fontWeight: 500, color: "#13101A", marginBottom: 10 }}>
                    {field.label}
                    {field.required && <span style={{ color: "#9D2D2D", marginLeft: 4 }}>*</span>}
                  </p>
                  {field.type === 'text' && (
                    <textarea
                      value={(answers[field.id] as string) ?? ''}
                      onChange={e => setSingleAnswer(field.id, e.target.value)}
                      placeholder="Your answer…"
                      rows={3}
                      style={{
                        width: '100%', padding: '10px 12px', borderRadius: 10,
                        border: '1px solid #E2DDCF', background: '#FBF8F2',
                        fontSize: 14, color: '#13101A', outline: 'none', resize: 'vertical', lineHeight: 1.55,
                      }}
                    />
                  )}
                  {(field.type === 'multiple_choice' || field.type === 'dropdown') && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                      {field.options.map(opt => {
                        const selected = answers[field.id] === opt
                        return (
                          <button key={opt} type="button" onClick={() => setSingleAnswer(field.id, opt)} style={{
                            display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', borderRadius: 10,
                            cursor: 'pointer', textAlign: 'left', fontSize: 14, transition: 'all 0.12s',
                            border: `1px solid ${selected ? '#3E1540' : '#E2DDCF'}`,
                            background: selected ? '#3E1540' : '#FBF8F2',
                            color: selected ? '#F6F4EF' : '#13101A',
                          }}>
                            <span style={{
                              width: 16, height: 16, borderRadius: '50%', flexShrink: 0, display: 'inline-block',
                              border: `2px solid ${selected ? '#F6F4EF' : '#C4C0B0'}`,
                              background: selected ? 'rgba(246,244,239,0.25)' : 'transparent',
                            }} />
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
                            display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', borderRadius: 10,
                            cursor: 'pointer', textAlign: 'left', fontSize: 14, transition: 'all 0.12s',
                            border: `1px solid ${checked ? '#3E1540' : '#E2DDCF'}`,
                            background: checked ? '#3E1540' : '#FBF8F2',
                            color: checked ? '#F6F4EF' : '#13101A',
                          }}>
                            <span style={{
                              width: 16, height: 16, borderRadius: 3, flexShrink: 0,
                              border: `2px solid ${checked ? '#F6F4EF' : '#C4C0B0'}`,
                              background: checked ? 'rgba(246,244,239,0.25)' : 'transparent',
                              display: 'flex', alignItems: 'center', justifyContent: 'center',
                            }}>
                              {checked && <Check style={{ width: 10, height: 10, color: '#F6F4EF' }} />}
                            </span>
                            {opt}
                          </button>
                        )
                      })}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
          <div className="flex-shrink-0 border-t border-[#E8E2D2] px-5 md:px-10 py-4">
            <div className="max-w-[640px] mx-auto">
              <button
                onClick={handleSubmit}
                disabled={submitting}
                style={{
                  width: '100%', padding: '14px', borderRadius: 10, background: '#2D0F2E',
                  color: '#F6F4EF', fontSize: 14, fontWeight: 600, border: 'none',
                  cursor: submitting ? 'not-allowed' : 'pointer', opacity: submitting ? 0.6 : 1,
                }}
              >
                {submitting ? 'Submitting…' : 'Submit Response'}
              </button>
            </div>
          </div>
        </>
      )}
    </AnimateIn>
  )
}

// ── Form Responses View ───────────────────────────────────────────────────────

export function FormResponsesView({ formId, announcementTitle, onClose }: {
  formId: string
  announcementTitle: string
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

  return (
    <AnimateIn className="fixed inset-0 z-[100] bg-[#FBF8F2] flex flex-col md:left-[var(--shell-offset)]">
      <div className="flex-shrink-0 border-b border-[#E8E2D2]">
        <div className="flex items-center justify-between px-5 pt-12 pb-3 md:pt-5 md:px-10">
          <div>
            <p style={MONO_STYLE}>Responses · {loading ? '…' : respondents.length}</p>
            <p className="text-[15px] font-semibold text-[#13101A] mt-0.5 line-clamp-1">{announcementTitle}</p>
          </div>
          <button onClick={onClose} style={{ width: 30, height: 30, borderRadius: 8, border: "1px solid #E2DDCF", background: "transparent", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", flexShrink: 0 }}>
            <X className="w-3.5 h-3.5 text-[#5A5466]" />
          </button>
        </div>
        <div style={{ display: 'flex', gap: 20, paddingLeft: 20, paddingRight: 20 }} className="md:!px-10">
          {(['responses', 'summary'] as const).map(t => (
            <button key={t} onClick={() => setSubTab(t)} style={{
              padding: '8px 0', fontSize: 13, fontWeight: 500, cursor: 'pointer',
              background: 'transparent', border: 'none',
              borderBottom: subTab === t ? '2px solid #3E1540' : '2px solid transparent',
              color: subTab === t ? '#13101A' : '#8A8497', transition: 'all 0.15s',
              textTransform: 'capitalize',
            }}>
              {t.charAt(0).toUpperCase() + t.slice(1)}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="flex-1 flex items-center justify-center"><Spinner /></div>
      ) : (
        <div className="flex-1 overflow-y-auto">
          {subTab === 'responses' ? (
            <div className="max-w-[640px] mx-auto px-5 md:px-10 py-6">
              {respondents.length === 0 ? (
                <EmptyState icon={<FileText className="w-7 h-7" />} title="No responses yet" subtitle="Responses will appear here once people submit." />
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {respondents.map(resp => {
                    const isExpanded = expandedUserId === resp.userId
                    return (
                      <div key={resp.userId} style={{ border: '1px solid #E8E2D2', borderRadius: 12, background: '#FBF8F2', overflow: 'hidden' }}>
                        <button
                          onClick={() => setExpandedUserId(isExpanded ? null : resp.userId)}
                          style={{
                            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                            width: '100%', padding: '14px 16px', background: 'transparent', border: 'none', cursor: 'pointer', textAlign: 'left',
                          }}
                        >
                          <div>
                            <p style={{ fontSize: 14, fontWeight: 500, color: '#13101A', margin: 0 }}>{resp.userName}</p>
                            <p style={{ fontSize: 11, color: '#8A8497', margin: '2px 0 0' }}>{new Date(resp.submittedAt).toLocaleDateString()}</p>
                          </div>
                          <ChevronDown style={{ width: 16, height: 16, color: '#8A8497', transform: isExpanded ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s', flexShrink: 0 }} />
                        </button>
                        {isExpanded && (
                          <div style={{ borderTop: '1px solid #EFEAE0', padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 12 }}>
                            {fields.map(f => {
                              const ans = resp.answers.find(a => a.field_id === f.id)
                              const display = f.type === 'checkbox'
                                ? (ans?.values ?? []).join(', ') || '—'
                                : ans?.value || '—'
                              return (
                                <div key={f.id}>
                                  <p style={{ fontSize: 10, color: '#8A8497', marginBottom: 3, letterSpacing: '0.8px', textTransform: 'uppercase' }}>{f.label}</p>
                                  <p style={{ fontSize: 13, color: '#13101A', lineHeight: 1.5, margin: 0 }}>{display}</p>
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
            <div className="max-w-[640px] mx-auto px-5 md:px-10 py-6" style={{ display: 'flex', flexDirection: 'column', gap: 32 }}>
              {respondents.length === 0 ? (
                <EmptyState icon={<FileText className="w-7 h-7" />} title="No responses yet" subtitle="The summary will appear once people submit." />
              ) : summaryByField.map(({ field, counts, textAnswers, maxCount }) => (
                <div key={field.id}>
                  <p style={{ fontSize: 13, fontWeight: 600, color: '#13101A', marginBottom: 14 }}>{field.label}</p>
                  {field.type === 'text' ? (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                      {textAnswers.length === 0 ? (
                        <p style={{ fontSize: 13, color: '#8A8497' }}>No text responses</p>
                      ) : textAnswers.map((ans, i) => (
                        <div key={i} style={{ padding: '8px 12px', background: '#F4F1E8', borderRadius: 8, fontSize: 13, color: '#5A5466', lineHeight: 1.5 }}>{ans}</div>
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
                              <span style={{ fontSize: 13, color: '#13101A' }}>{opt}</span>
                              <span style={{ fontSize: 12, color: '#8A8497', fontWeight: 500 }}>{count} / {respondents.length}</span>
                            </div>
                            <div style={{ height: 8, borderRadius: 999, background: '#EFEAE0', overflow: 'hidden' }}>
                              <div style={{ height: '100%', width: `${pct}%`, background: '#3E1540', borderRadius: 999, transition: 'width 0.4s ease' }} />
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
      )}
    </AnimateIn>
  )
}

// ── Forms Tab ─────────────────────────────────────────────────────────────────

export function FormsTab({ userId, userRole, ministryId }: FormsTabProps) {
  const supabase = createClient()
  const [loading, setLoading] = useState(true)
  const [items, setItems] = useState<AnnouncementWithForm[]>([])
  const [fillState, setFillState] = useState<{ formId: string; announcementId: string; title: string } | null>(null)
  const [responsesState, setResponsesState] = useState<{ formId: string; title: string } | null>(null)

  const isAdmin = ['admin', 'leader', 'deacon', 'elder'].includes(userRole.toLowerCase())

  const load = useCallback(async () => {
    const { data: forms } = await supabase
      .from("announcement_forms")
      .select("id, announcement_id")
      .eq("ministry_id", ministryId)

    if (!forms || forms.length === 0) { setItems([]); setLoading(false); return }

    const announcementIds = forms.map(f => f.announcement_id)
    const formByAnn: Record<string, string> = {}
    for (const f of forms) formByAnn[f.announcement_id] = f.id

    const { data: annData } = await supabase
      .from("announcements")
      .select("id, title, body, created_at")
      .in("id", announcementIds)
      .order("created_at", { ascending: false })

    const formIds = forms.map(f => f.id)
    const { data: responseData } = await supabase
      .from("form_responses")
      .select("form_id")
      .in("form_id", formIds)
      .eq("user_id", userId)
    const respondedSet = new Set<string>((responseData ?? []).map(r => r.form_id))

    let responseCounts: Record<string, number> = {}
    if (isAdmin) {
      const { data: countData } = await supabase
        .from("form_responses")
        .select("form_id")
        .in("form_id", formIds)
      for (const r of countData ?? []) responseCounts[r.form_id] = (responseCounts[r.form_id] ?? 0) + 1
    }

    setItems((annData ?? []).map(ann => ({
      id: ann.id,
      title: ann.title,
      body: ann.body,
      created_at: ann.created_at,
      form_id: formByAnn[ann.id],
      user_has_responded: respondedSet.has(formByAnn[ann.id]),
      response_count: isAdmin ? (responseCounts[formByAnn[ann.id]] ?? 0) : undefined,
    })))
    setLoading(false)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId, ministryId, isAdmin])

  useEffect(() => { load() }, [load])

  return (
    <div className="pb-28 md:pb-0 md:flex md:flex-col md:h-full md:overflow-hidden">
      {/* Mobile header */}
      <div className="md:hidden px-5 pt-14 pb-5">
        <p style={MONO_STYLE}>Forms</p>
        <h1 style={{ fontFamily: "var(--serif)", fontSize: 36, color: "var(--ink)", lineHeight: 1.05, margin: "14px 0 0", fontWeight: 400 }}>Forms</h1>
        <p style={{ fontSize: 14, color: "var(--body)", marginTop: 8 }}>Announcements that include a form for you to fill out.</p>
      </div>

      <TabPageHeader>
        <PageTitle eyebrow={`${items.length} form${items.length !== 1 ? 's' : ''} attached`} title="Forms">
          <p style={{ fontSize: 14, color: "var(--body)", marginTop: 12, maxWidth: 560 }}>Announcements that include a form to fill out.</p>
        </PageTitle>
      </TabPageHeader>

      <div className="md:flex-1 md:overflow-y-auto">
        {loading ? (
          <div className="px-5 md:px-14"><Spinner /></div>
        ) : items.length === 0 ? (
          <div className="px-5 md:px-14">
            <EmptyState icon={<FileText className="w-7 h-7" />} title="No forms yet" subtitle="When a form is attached to an announcement it appears here." />
          </div>
        ) : (
          <div className="px-5 md:px-14 py-6 flex flex-col gap-3">
            {items.map(item => (
              <div key={item.id} style={{ border: '1px solid var(--line)', borderRadius: 14, background: 'var(--cream)', padding: '18px 20px' }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16 }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <h3 style={{ fontFamily: 'var(--serif)', fontSize: 20, color: 'var(--ink)', lineHeight: 1.1, margin: 0, fontWeight: 400 }}>{item.title}</h3>
                    <p style={{ fontSize: 13, color: 'var(--muted-text)', marginTop: 4, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.body}</p>
                  </div>
                  {item.user_has_responded ? (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 5, flexShrink: 0, color: '#2E7D32', fontSize: 13, fontWeight: 500 }}>
                      <Check style={{ width: 14, height: 14 }} />
                      Submitted
                    </div>
                  ) : (
                    <button
                      onClick={() => setFillState({ formId: item.form_id, announcementId: item.id, title: item.title })}
                      style={{
                        flexShrink: 0, padding: '7px 14px', borderRadius: 8, border: '1px solid var(--plum)',
                        background: 'transparent', color: 'var(--plum)', fontSize: 13, fontWeight: 500, cursor: 'pointer', whiteSpace: 'nowrap',
                      }}
                    >
                      Fill out form
                    </button>
                  )}
                </div>
                {isAdmin && item.response_count !== undefined && (
                  <div style={{ marginTop: 12, paddingTop: 12, borderTop: '1px solid var(--line-3)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <span style={{ fontSize: 12, color: 'var(--muted-text)' }}>{item.response_count} response{item.response_count !== 1 ? 's' : ''}</span>
                    <button
                      onClick={() => setResponsesState({ formId: item.form_id, title: item.title })}
                      style={{ fontSize: 13, fontWeight: 500, color: 'var(--plum)', background: 'transparent', border: 'none', cursor: 'pointer' }}
                    >
                      View responses →
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {fillState && (
        <FormFillView
          formId={fillState.formId}
          announcementId={fillState.announcementId}
          announcementTitle={fillState.title}
          userId={userId}
          ministryId={ministryId}
          onClose={() => setFillState(null)}
          onSubmitted={() => {
            setItems(prev => prev.map(i => i.form_id === fillState.formId ? { ...i, user_has_responded: true } : i))
            setFillState(null)
          }}
        />
      )}

      {responsesState && (
        <FormResponsesView
          formId={responsesState.formId}
          announcementTitle={responsesState.title}
          onClose={() => setResponsesState(null)}
        />
      )}
    </div>
  )
}
