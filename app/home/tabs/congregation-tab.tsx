"use client"

import { useState, useEffect, useCallback } from "react"
import { Plus, X, BarChart2, Archive, ChevronDown, ChevronUp } from "lucide-react"
import { createClient } from "@/lib/supabase"
import { Spinner, MONO_STYLE, EmptyState } from "../components/shared"
import { TabPageHeader, PageTitle, CentralButton, PlanSubTabStrip } from "@/components/central"
import type { CongregationTabProps, CongregationQuestion } from "../types"

interface Response {
  id: string
  response_text: string | null
  response_option: string | null
  response_scale: number | null
}

interface ArchivedQuestion extends CongregationQuestion {
  response_count: number
  expanded: boolean
}

type View = "ask" | "responses" | "archive"

const VIEW_TABS = [
  { key: "ask", label: "Ask" },
  { key: "responses", label: "Responses" },
  { key: "archive", label: "Archive" },
] as const

const TYPE_LABELS: Record<string, string> = {
  poll: "Poll",
  scale: "1–5 Scale",
  open: "Open-ended",
  prayer: "Prayer request",
}

const TYPE_DESCRIPTIONS: Record<string, string> = {
  poll: "Members choose from options you define",
  scale: "Members rate on a scale of 1 to 5",
  open: "Members share a short written response",
  prayer: "Members share anonymous prayer requests",
}

// Shared input chrome (textarea + poll option inputs) — §4.4 standard input.
const inputStyle: React.CSSProperties = {
  width: "100%",
  padding: "10px 12px",
  borderRadius: "var(--r-input)",
  border: "1px solid var(--line-2)",
  background: "var(--cream)",
  fontSize: 14,
  color: "var(--ink)",
  fontFamily: "var(--sans)",
  boxSizing: "border-box",
  outline: "none",
}

export function CongregationTab({ userId, ministryId, onViewChange }: CongregationTabProps) {
  const supabase = createClient()
  const [view, setViewState] = useState<View>("ask")
  function setView(v: View) { setViewState(v); onViewChange?.(v) }

  // Active question
  const [activeQuestion, setActiveQuestion] = useState<CongregationQuestion | null>(null)
  const [activeResponseCount, setActiveResponseCount] = useState(0)
  const [loadingActive, setLoadingActive] = useState(true)

  // Create form
  const [questionText, setQuestionText] = useState("")
  const [questionType, setQuestionType] = useState<"poll" | "scale" | "open" | "prayer">("poll")
  const [pollOptions, setPollOptions] = useState(["", ""])
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Responses view
  const [responses, setResponses] = useState<Response[]>([])
  const [loadingResponses, setLoadingResponses] = useState(false)
  const [closing, setClosing] = useState(false)

  // Archive view
  const [archived, setArchived] = useState<ArchivedQuestion[]>([])
  const [loadingArchive, setLoadingArchive] = useState(false)
  const [archivedResponses, setArchivedResponses] = useState<Record<string, Response[]>>({})
  const [loadingArchivedResponses, setLoadingArchivedResponses] = useState<Record<string, boolean>>({})

  const loadActive = useCallback(async () => {
    setLoadingActive(true)
    const { data } = await supabase
      .from("congregation_questions")
      .select("*")
      .eq("ministry_id", ministryId)
      .eq("is_active", true)
      .maybeSingle()
    setActiveQuestion(data ?? null)

    if (data) {
      const { count } = await supabase
        .from("congregation_responses")
        .select("*", { count: "exact", head: true })
        .eq("question_id", data.id)
      setActiveResponseCount(count ?? 0)
    } else {
      setActiveResponseCount(0)
    }
    setLoadingActive(false)
  }, [ministryId]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { loadActive() }, [loadActive])

  useEffect(() => {
    if (view !== "responses" || !activeQuestion) return
    setLoadingResponses(true)
    supabase
      .from("congregation_responses")
      .select("id, response_text, response_option, response_scale")
      .eq("question_id", activeQuestion.id)
      .then(({ data }) => {
        setResponses(data ?? [])
        setLoadingResponses(false)
      })
  }, [view, activeQuestion]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (view !== "archive") return
    setLoadingArchive(true)
    supabase
      .from("congregation_questions")
      .select("*")
      .eq("ministry_id", ministryId)
      .eq("is_active", false)
      .not("closed_at", "is", null)
      .order("closed_at", { ascending: false })
      .then(async ({ data }) => {
        const questions = data ?? []
        const withCounts: ArchivedQuestion[] = await Promise.all(
          questions.map(async (q) => {
            const { count } = await supabase
              .from("congregation_responses")
              .select("*", { count: "exact", head: true })
              .eq("question_id", q.id)
            return { ...q, response_count: count ?? 0, expanded: false }
          })
        )
        setArchived(withCounts)
        setLoadingArchive(false)
      })
  }, [view, ministryId]) // eslint-disable-line react-hooks/exhaustive-deps

  async function handleSend() {
    if (!questionText.trim()) { setError("Enter a question first."); return }
    if (questionType === "poll") {
      const filled = pollOptions.filter(o => o.trim())
      if (filled.length < 2) { setError("Add at least two poll options."); return }
    }
    setSubmitting(true)
    setError(null)

    // Deactivate any existing active question
    if (activeQuestion) {
      await supabase
        .from("congregation_questions")
        .update({ is_active: false, closed_at: new Date().toISOString() })
        .eq("id", activeQuestion.id)
    }

    const { error: insertErr } = await supabase
      .from("congregation_questions")
      .insert({
        ministry_id: ministryId,
        created_by: userId,
        question_text: questionText.trim(),
        question_type: questionType,
        options: questionType === "poll" ? pollOptions.filter(o => o.trim()) : null,
        is_active: true,
      })

    if (insertErr) { setError(insertErr.message); setSubmitting(false); return }

    setQuestionText("")
    setPollOptions(["", ""])
    setQuestionType("poll")
    setSubmitting(false)
    await loadActive()
  }

  async function handleClose() {
    if (!activeQuestion) return
    setClosing(true)
    await supabase
      .from("congregation_questions")
      .update({ is_active: false, closed_at: new Date().toISOString() })
      .eq("id", activeQuestion.id)
    setActiveQuestion(null)
    setActiveResponseCount(0)
    setClosing(false)
    if (view === "responses") setView("ask")
  }

  async function toggleArchived(id: string) {
    setArchived(prev => prev.map(q => q.id === id ? { ...q, expanded: !q.expanded } : q))
    const q = archived.find(a => a.id === id)
    if (!q || archivedResponses[id] || !q.expanded === false) return
    setLoadingArchivedResponses(prev => ({ ...prev, [id]: true }))
    const { data } = await supabase
      .from("congregation_responses")
      .select("id, response_text, response_option, response_scale")
      .eq("question_id", id)
    setArchivedResponses(prev => ({ ...prev, [id]: data ?? [] }))
    setLoadingArchivedResponses(prev => ({ ...prev, [id]: false }))
  }

  function renderResults(q: CongregationQuestion, resps: Response[]) {
    if (q.question_type === "poll" && q.options) {
      const total = resps.length
      return (
        <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 12 }}>
          {q.options.map((opt) => {
            const count = resps.filter(r => r.response_option === opt).length
            const pct = total > 0 ? Math.round((count / total) * 100) : 0
            return (
              <div key={opt}>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                  <span style={{ fontSize: 13, fontWeight: 500, color: "var(--ink)" }}>{opt}</span>
                  <span style={{ fontSize: 12, color: "var(--muted-text)" }}>{count} · {pct}%</span>
                </div>
                <div style={{ height: 6, borderRadius: 999, background: "var(--line)", overflow: "hidden" }}>
                  <div style={{ height: "100%", width: `${pct}%`, background: "var(--plum)", borderRadius: 999, transition: "width 0.4s ease" }} />
                </div>
              </div>
            )
          })}
        </div>
      )
    }

    if (q.question_type === "scale") {
      const scores = resps.map(r => r.response_scale).filter(Boolean) as number[]
      const avg = scores.length > 0 ? (scores.reduce((a, b) => a + b, 0) / scores.length).toFixed(1) : "—"
      const dist = [1, 2, 3, 4, 5].map(n => ({ n, count: scores.filter(s => s === n).length }))
      return (
        <div style={{ marginTop: 12 }}>
          <div style={{ fontSize: 40, fontWeight: 400, color: "var(--plum-2)", fontFamily: "var(--serif)", letterSpacing: "-0.5px", lineHeight: 1 }}>{avg}</div>
          <div style={{ fontSize: 12, color: "var(--muted-text)", marginBottom: 12 }}>average out of 5</div>
          <div style={{ display: "flex", gap: 6 }}>
            {dist.map(({ n, count }) => (
              <div key={n} style={{ flex: 1, textAlign: "center" }}>
                <div style={{ fontSize: 16, marginBottom: 4, color: "var(--body)" }}>{n}</div>
                <div style={{ height: Math.max(4, count * 10), background: "var(--plum)", borderRadius: 4, opacity: count > 0 ? 1 : 0.12, minHeight: 4, transition: "height 0.4s" }} />
                <div style={{ fontSize: 11, color: "var(--muted-text)", marginTop: 3 }}>{count}</div>
              </div>
            ))}
          </div>
        </div>
      )
    }

    // open + prayer
    const texts = resps.map(r => r.response_text).filter(Boolean) as string[]
    if (texts.length === 0) return <p style={{ fontSize: 13, color: "var(--muted-text)", marginTop: 12 }}>No responses yet.</p>
    return (
      <div style={{ marginTop: 12, display: "flex", flexDirection: "column", gap: 8 }}>
        {texts.map((t, i) => (
          <div key={i} style={{ padding: "10px 12px", borderRadius: "var(--r-chip)", background: "var(--cream-2)", border: "1px solid var(--line)", fontSize: 13, color: "var(--ink)", lineHeight: 1.5 }}>{t}</div>
        ))}
      </div>
    )
  }

  return (
    <div className="pb-28 md:pb-0">
      {/* Mobile header */}
      <div className="md:hidden px-5 pt-14 pb-3">
        <p style={{ ...MONO_STYLE, margin: 0 }}>Congregation</p>
        <h1 style={{ fontFamily: "var(--serif)", fontSize: 30, fontWeight: 600, letterSpacing: "-0.02em", color: "var(--ink)", lineHeight: 1.05, margin: "8px 0 0" }}>
          Congregation
        </h1>
        <p style={{ fontSize: 14, color: "var(--body)", marginTop: 8 }}>
          Ask your congregation — responses are anonymous.
        </p>
      </div>

      {/* Desktop header */}
      <TabPageHeader>
        <PageTitle title="Congregation" compact />
      </TabPageHeader>

      {/* Desktop sub-tabs — sibling of the header, no horizontal padding (§4.2) */}
      <div className="hidden md:block">
        <PlanSubTabStrip tabs={VIEW_TABS} active={view} onChange={k => setView(k as View)} />
      </div>

      <div className="px-5 md:px-14 pt-5 md:pt-7" style={{ maxWidth: 760 }}>

        {/* Mobile sub-tabs */}
        <div className="md:hidden" style={{ marginBottom: 20 }}>
          <PlanSubTabStrip tabs={VIEW_TABS} active={view} onChange={k => setView(k as View)} />
        </div>

        {/* ── ASK VIEW ── */}
        {view === "ask" && (
          <div>
            {/* Active question status */}
            {loadingActive ? (
              <Spinner />
            ) : activeQuestion ? (
              <div style={{ padding: 16, borderRadius: "var(--r-card)", background: "var(--ivory)", border: "1px solid var(--line-2)", marginBottom: 24 }}>
                <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12 }}>
                  <div style={{ flex: 1 }}>
                    <span style={{ ...MONO_STYLE, color: "var(--plum)", marginBottom: 6, display: "block" }}>Active · {TYPE_LABELS[activeQuestion.question_type]}</span>
                    <p style={{ fontSize: 15, fontWeight: 500, color: "var(--ink)", lineHeight: 1.4 }}>{activeQuestion.question_text}</p>
                    <p style={{ fontSize: 12, color: "var(--muted-text)", marginTop: 6 }}>{activeResponseCount} response{activeResponseCount !== 1 ? "s" : ""}</p>
                  </div>
                  <CentralButton
                    variant="destructive"
                    onClick={handleClose}
                    disabled={closing}
                    style={{ flexShrink: 0, padding: "6px 12px", fontSize: 12 }}
                  >
                    {closing ? "Closing…" : "Close question"}
                  </CentralButton>
                </div>
                <CentralButton
                  variant="ghost"
                  onClick={() => setView("responses")}
                  style={{ marginTop: 12, color: "var(--plum)", fontWeight: 500 }}
                >
                  <BarChart2 className="w-3.5 h-3.5" /> View responses
                </CentralButton>
              </div>
            ) : (
              <div style={{ padding: "14px 16px", borderRadius: "var(--r-card)", background: "var(--cream-2)", border: "1px dashed var(--dashed)", marginBottom: 24, fontSize: 13, color: "var(--muted-text)", textAlign: "center" }}>
                No active question. Send one below.
              </div>
            )}

            {/* Create form */}
            <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              <div>
                <label style={{ ...MONO_STYLE, display: "block", marginBottom: 6 }}>Your question</label>
                <textarea
                  value={questionText}
                  onChange={e => setQuestionText(e.target.value)}
                  placeholder="What's on your heart this week?"
                  rows={3}
                  style={{ ...inputStyle, resize: "vertical" }}
                />
              </div>

              <div>
                <label style={{ ...MONO_STYLE, display: "block", marginBottom: 8 }}>Response type</label>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                  {(["poll", "scale", "open", "prayer"] as const).map((t) => {
                    const selected = questionType === t
                    return (
                      <button
                        key={t}
                        onClick={() => setQuestionType(t)}
                        style={{
                          padding: "10px 12px",
                          borderRadius: "var(--r-input)",
                          border: `1px solid ${selected ? "var(--plum)" : "var(--line-2)"}`,
                          background: selected ? "var(--ivory)" : "var(--cream)",
                          cursor: "pointer",
                          textAlign: "left",
                          transition: "border-color var(--dur-fast) var(--ease-out), background var(--dur-fast) var(--ease-out)",
                        }}
                      >
                        <div style={{ fontSize: 13, fontWeight: 500, color: "var(--ink)", marginBottom: 2 }}>{TYPE_LABELS[t]}</div>
                        <div style={{ fontSize: 11, color: "var(--muted-text)", lineHeight: 1.3 }}>{TYPE_DESCRIPTIONS[t]}</div>
                      </button>
                    )
                  })}
                </div>
              </div>

              {questionType === "poll" && (
                <div>
                  <label style={{ ...MONO_STYLE, display: "block", marginBottom: 8 }}>Poll options</label>
                  <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                    {pollOptions.map((opt, i) => (
                      <div key={i} style={{ display: "flex", gap: 8, alignItems: "center" }}>
                        <input
                          value={opt}
                          onChange={e => {
                            const updated = [...pollOptions]
                            updated[i] = e.target.value
                            setPollOptions(updated)
                          }}
                          placeholder={`Option ${i + 1}`}
                          style={{ ...inputStyle, padding: "8px 12px", fontSize: 13 }}
                        />
                        {pollOptions.length > 2 && (
                          <button
                            onClick={() => setPollOptions(prev => prev.filter((_, j) => j !== i))}
                            aria-label="Remove option"
                            style={{ width: 30, height: 30, borderRadius: "var(--r-chip)", background: "transparent", border: "1px solid var(--line-2)", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, color: "var(--muted-text)" }}
                          >
                            <X className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    ))}
                    {pollOptions.length < 5 && (
                      <CentralButton
                        variant="ghost"
                        onClick={() => setPollOptions(prev => [...prev, ""])}
                        style={{ color: "var(--plum)", fontWeight: 500, padding: "4px 0" }}
                      >
                        <Plus className="w-3.5 h-3.5" /> Add option
                      </CentralButton>
                    )}
                  </div>
                </div>
              )}

              {error && <p style={{ fontSize: 12, color: "var(--danger)" }}>{error}</p>}

              <CentralButton
                onClick={handleSend}
                disabled={submitting || !questionText.trim()}
                style={{ width: "100%", padding: "12px 0" }}
              >
                {submitting ? "Sending…" : activeQuestion ? "Replace active question" : "Send to Congregation"}
              </CentralButton>
            </div>
          </div>
        )}

        {/* ── RESPONSES VIEW ── */}
        {view === "responses" && (
          <div>
            {!activeQuestion ? (
              <EmptyState
                icon={<BarChart2 className="w-5 h-5" />}
                title="No active question"
                subtitle="Send one from the Ask tab."
              />
            ) : (
              <div>
                <div style={{ padding: 16, borderRadius: "var(--r-card)", background: "var(--cream)", border: "1px solid var(--line)", marginBottom: 20 }}>
                  <span style={{ ...MONO_STYLE, color: "var(--plum)", marginBottom: 6, display: "block" }}>{TYPE_LABELS[activeQuestion.question_type]}</span>
                  <p style={{ fontSize: 15, fontWeight: 500, color: "var(--ink)", lineHeight: 1.4, marginBottom: 4 }}>{activeQuestion.question_text}</p>
                  <p style={{ fontSize: 12, color: "var(--muted-text)" }}>{activeResponseCount} response{activeResponseCount !== 1 ? "s" : ""}</p>

                  {loadingResponses ? (
                    <div style={{ marginTop: 12 }}><Spinner /></div>
                  ) : (
                    renderResults(activeQuestion, responses)
                  )}
                </div>

                <CentralButton variant="destructive" onClick={handleClose} disabled={closing}>
                  {closing ? "Closing…" : "Close question"}
                </CentralButton>
              </div>
            )}
          </div>
        )}

        {/* ── ARCHIVE VIEW ── */}
        {view === "archive" && (
          <div>
            {loadingArchive ? (
              <Spinner />
            ) : archived.length === 0 ? (
              <EmptyState
                icon={<Archive className="w-5 h-5" />}
                title="No closed questions yet"
                subtitle="Questions you close will be archived here."
              />
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {archived.map((q) => (
                  <div key={q.id} style={{ borderRadius: "var(--r-card)", border: "1px solid var(--line)", background: "var(--cream)", overflow: "hidden" }}>
                    <button
                      onClick={() => toggleArchived(q.id)}
                      style={{ width: "100%", padding: "14px 16px", display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12, background: "none", border: "none", cursor: "pointer", textAlign: "left" }}
                    >
                      <div style={{ flex: 1 }}>
                        <span style={{ ...MONO_STYLE, display: "block", marginBottom: 4 }}>
                          {TYPE_LABELS[q.question_type]} · {q.response_count} response{q.response_count !== 1 ? "s" : ""}
                        </span>
                        <p style={{ fontSize: 14, fontWeight: 500, color: "var(--ink)", lineHeight: 1.4 }}>{q.question_text}</p>
                      </div>
                      {q.expanded ? <ChevronUp className="w-4 h-4 flex-shrink-0 mt-0.5" style={{ color: "var(--muted-text)" }} /> : <ChevronDown className="w-4 h-4 flex-shrink-0 mt-0.5" style={{ color: "var(--muted-text)" }} />}
                    </button>
                    {q.expanded && (
                      <div style={{ padding: "0 16px 16px", borderTop: "1px solid var(--line-3)" }}>
                        {loadingArchivedResponses[q.id] ? (
                          <div style={{ paddingTop: 12 }}><Spinner /></div>
                        ) : (
                          renderResults(q, archivedResponses[q.id] ?? [])
                        )}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>{/* end content */}
    </div>
  )
}
