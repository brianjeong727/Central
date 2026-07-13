"use client"

import { useState, useEffect, useCallback } from "react"
import { useNavState } from "../nav-state"
import { Plus, X, BarChart2, ChevronLeft } from "lucide-react"
import { createClient } from "@/lib/supabase"
import { Spinner, MONO_STYLE, EmptyState } from "../components/shared"
import { TabPageHeader, PageTitle, CentralButton, ContentActionButton, ContentHeader } from "@/components/central"
import type { CongregationTabProps, CongregationQuestion } from "../types"

interface Response {
  id: string
  response_text: string | null
  response_option: string | null
  response_scale: number | null
}

interface QuestionEntry extends CongregationQuestion {
  response_count: number
}

type View = "list" | "create" | "detail"

const TYPE_LABELS: Record<string, string> = {
  poll: "Poll",
  scale: "1–10 Scale",
  open: "Open-ended",
  prayer: "Prayer request",
}

const TYPE_DESCRIPTIONS: Record<string, string> = {
  poll: "Members choose from options you define",
  scale: "Members rate on a scale of 1 to 10",
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
  const { setParam } = useNavState()

  // ── View + selection state ──
  // Only the detail/responses view is URL-synced (?cq=<id>) so it survives reload
  // (Convention #12). The create view is ephemeral plain state — a reload mid-create
  // drops back to the list (Phase 2). Absence of ?cq → list, never create.
  const [view, setViewState] = useState<View>(() => {
    if (typeof window === "undefined") return "list"
    return new URLSearchParams(window.location.search).get("cq") ? "detail" : "list"
  })
  const [selectedQuestionId, setSelectedQuestionId] = useState<string | null>(() => {
    if (typeof window === "undefined") return null
    return new URLSearchParams(window.location.search).get("cq")
  })

  // detail writes ?cq (read view, persists); list + create clear it (create adds no param).
  function goTo(v: View, questionId: string | null = null) {
    setViewState(v)
    setSelectedQuestionId(v === "detail" ? questionId : null)
    onViewChange?.(v)
    setParam("cq", v === "detail" && questionId ? questionId : null)
  }

  // Propagate the URL-derived initial view to the shell breadcrumb on mount.
  useEffect(() => { onViewChange?.(view) }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // ── List state ──
  const [questions, setQuestions] = useState<QuestionEntry[]>([])
  const [loadingList, setLoadingList] = useState(true)
  const [archivingId, setArchivingId] = useState<string | null>(null)

  // ── Create form state ──
  const [questionText, setQuestionText] = useState("")
  const [questionType, setQuestionType] = useState<"poll" | "scale" | "open" | "prayer">("poll")
  const [pollOptions, setPollOptions] = useState(["", ""])
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // ── Detail state ──
  const [responses, setResponses] = useState<Response[]>([])
  const [loadingResponses, setLoadingResponses] = useState(false)

  const loadList = useCallback(async () => {
    setLoadingList(true)
    // Single query — the embedded aggregate replaces one count query per question (N+1).
    const { data } = await supabase
      .from("congregation_questions")
      .select("*, congregation_responses(count)")
      .eq("ministry_id", ministryId)
      .order("created_at", { ascending: false })
    const withCounts: QuestionEntry[] = (data ?? []).map(({ congregation_responses, ...q }) => ({
      ...q,
      response_count: congregation_responses?.[0]?.count ?? 0,
    }))
    setQuestions(withCounts)
    setLoadingList(false)
  }, [ministryId]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { loadList() }, [loadList]) // eslint-disable-line react-hooks/set-state-in-effect

  // Load responses for the selected question when entering detail view.
  useEffect(() => {
    if (view !== "detail" || !selectedQuestionId) return
    setLoadingResponses(true) // eslint-disable-line react-hooks/set-state-in-effect
    supabase
      .from("congregation_responses")
      .select("id, response_text, response_option, response_scale")
      .eq("question_id", selectedQuestionId)
      .then(({ data }) => {
        setResponses(data ?? [])
        setLoadingResponses(false)
      })
  }, [view, selectedQuestionId]) // eslint-disable-line react-hooks/exhaustive-deps

  const selectedQuestion = questions.find(q => q.id === selectedQuestionId) ?? null

  async function handleSend() {
    if (!questionText.trim()) { setError("Enter a question first."); return }
    if (questionType === "poll") {
      const filled = pollOptions.filter(o => o.trim())
      if (filled.length < 2) { setError("Add at least two poll options."); return }
    }
    setSubmitting(true)
    setError(null)

    // Deactivate any existing active question (only one live at a time).
    const active = questions.find(q => q.is_active)
    const closedAt = new Date().toISOString()
    let closeErr: unknown = null
    if (active) {
      const { error } = await supabase
        .from("congregation_questions")
        .update({ is_active: false, closed_at: closedAt })
        .eq("id", active.id)
        .eq("ministry_id", ministryId)
      closeErr = error
    }

    const { data: inserted, error: insertErr } = await supabase
      .from("congregation_questions")
      .insert({
        ministry_id: ministryId,
        created_by: userId,
        question_text: questionText.trim(),
        question_type: questionType,
        options: questionType === "poll" ? pollOptions.filter(o => o.trim()) : null,
        is_active: true,
      })
      .select()
      .single()

    if (insertErr) { setError(insertErr.message); setSubmitting(false); return }

    setQuestionText("")
    setPollOptions(["", ""])
    setQuestionType("poll")
    setSubmitting(false)
    // Patch the list locally instead of refetching everything: prepend the new
    // question (0 responses) and mark the previously-active one archived.
    setQuestions(prev => [
      { ...(inserted as CongregationQuestion), response_count: 0 },
      ...prev.map(q =>
        active && !closeErr && q.id === active.id ? { ...q, is_active: false, closed_at: closedAt } : q
      ),
    ])
    goTo("list")
  }

  // Archive = set is_active:false + closed_at:now() on the live question.
  async function handleArchive(id: string) {
    setArchivingId(id)
    const closedAt = new Date().toISOString()
    const { error: err } = await supabase
      .from("congregation_questions")
      .update({ is_active: false, closed_at: closedAt })
      .eq("id", id)
      .eq("ministry_id", ministryId)
    setArchivingId(null)
    // Patch just the archived row locally — no full refetch.
    if (!err) setQuestions(prev => prev.map(q => (q.id === id ? { ...q, is_active: false, closed_at: closedAt } : q)))
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
      const dist = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(n => ({ n, count: scores.filter(s => s === n).length }))
      return (
        <div style={{ marginTop: 12 }}>
          <div style={{ fontSize: 40, fontWeight: 400, color: "var(--plum-2)", fontFamily: "var(--serif)", letterSpacing: "-0.5px", lineHeight: 1 }}>{avg}</div>
          <div style={{ fontSize: 12, color: "var(--muted-text)", marginBottom: 12 }}>average out of 10</div>
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
      {/* Mobile header — title only; the create lives in the Questions content header below */}
      {view === "list" && (
        <div className="md:hidden px-5 pt-14 pb-5">
          <p style={{ ...MONO_STYLE, margin: 0 }}>Congregation Pulse</p>
          <h1 style={{ fontFamily: "var(--serif)", fontSize: 30, fontWeight: 600, letterSpacing: "-0.02em", color: "var(--ink)", lineHeight: 1.05, margin: "8px 0 0" }}>
            Congregation
          </h1>
          <p style={{ fontSize: 14, color: "var(--body)", marginTop: 8 }}>
            Ask your congregation — responses are anonymous.
          </p>
        </div>
      )}

      {/* Desktop header — landing tier (R1); no create in the title row */}
      <TabPageHeader>
        <PageTitle eyebrow="Congregation Pulse" title="Congregation" />
      </TabPageHeader>

      <div
        className={`px-5 md:px-14 ${view === "list" ? "pt-5" : "pt-14"} md:pt-7`}
      >
        {/* ── LIST VIEW ── */}
        {view === "list" && (
          <>
            {/* Content header — the create CTA lives here (Zone C, R2), never in the title row */}
            <div style={{ marginBottom: 20 }}>
              <ContentHeader
                label="Questions"
                action={<ContentActionButton label="New question" icon={<Plus style={{ width: 14, height: 14 }} />} onClick={() => goTo("create")} />}
              />
            </div>
            {loadingList ? (
              <Spinner />
            ) : questions.length === 0 ? (
              <EmptyState
                icon={<BarChart2 className="w-5 h-5" />}
                title="No questions yet"
                subtitle="Ask your first question with New question above."
              />
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {questions.map((q) => (
                  <div
                    key={q.id}
                    style={{
                      borderRadius: "var(--r-card)",
                      border: "1px solid var(--line)",
                      background: "var(--cream)",
                      padding: "14px 16px",
                      display: "flex",
                      flexDirection: "column",
                      gap: 8,
                    }}
                  >
                    <span style={{ ...MONO_STYLE, color: q.is_active ? "var(--plum)" : "var(--muted-text)" }}>
                      {q.is_active ? "Active" : "Archived"} · {TYPE_LABELS[q.question_type]}
                    </span>
                    <p style={{ fontSize: 14, fontWeight: 400, color: "var(--ink)", lineHeight: 1.4, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                      {q.question_text}
                    </p>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
                      <span style={{ fontSize: 12, color: "var(--muted-text)" }}>
                        {q.response_count} response{q.response_count !== 1 ? "s" : ""}
                      </span>
                      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                        <CentralButton
                          variant="ghost"
                          onClick={() => goTo("detail", q.id)}
                          style={{ color: "var(--plum)", fontWeight: 500 }}
                        >
                          <BarChart2 className="w-3.5 h-3.5" /> See responses
                        </CentralButton>
                        {q.is_active && (
                          <CentralButton
                            variant="secondary"
                            onClick={() => handleArchive(q.id)}
                            disabled={archivingId === q.id}
                            style={{ padding: "6px 12px", fontSize: 12 }}
                          >
                            {archivingId === q.id ? "Archiving…" : "Archive"}
                          </CentralButton>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </>
        )}

        {/* ── CREATE VIEW ── */}
        {view === "create" && (
          <div>
            <CentralButton variant="ghost" onClick={() => goTo("list")} style={{ marginBottom: 16, color: "var(--body)" }}>
              <ChevronLeft className="w-4 h-4" /> Back
            </CentralButton>

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
                          background: selected ? "var(--plum-tint)" : "var(--cream)",
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
                {submitting ? "Sending…" : "Send to Congregation"}
              </CentralButton>
            </div>
          </div>
        )}

        {/* ── DETAIL VIEW ── */}
        {view === "detail" && (
          <div>
            <CentralButton variant="ghost" onClick={() => goTo("list")} style={{ marginBottom: 16, color: "var(--body)" }}>
              <X className="w-4 h-4" /> Back
            </CentralButton>

            {loadingList && !selectedQuestion ? (
              <Spinner />
            ) : !selectedQuestion ? (
              <EmptyState
                icon={<BarChart2 className="w-5 h-5" />}
                title="Question not found"
                subtitle="It may have been removed."
              />
            ) : (
              <div style={{ padding: 16, borderRadius: "var(--r-card)", background: "var(--cream)", border: "1px solid var(--line)" }}>
                <span style={{ ...MONO_STYLE, color: selectedQuestion.is_active ? "var(--plum)" : "var(--muted-text)", marginBottom: 6, display: "block" }}>
                  {selectedQuestion.is_active ? "Active" : "Archived"} · {TYPE_LABELS[selectedQuestion.question_type]}
                </span>
                <p style={{ fontSize: 15, fontWeight: 500, color: "var(--ink)", lineHeight: 1.4, marginBottom: 4 }}>{selectedQuestion.question_text}</p>
                <p style={{ fontSize: 12, color: "var(--muted-text)" }}>
                  {selectedQuestion.response_count} response{selectedQuestion.response_count !== 1 ? "s" : ""}
                </p>

                {loadingResponses ? (
                  <div style={{ marginTop: 12 }}><Spinner /></div>
                ) : (
                  renderResults(selectedQuestion, responses)
                )}
              </div>
            )}
          </div>
        )}
      </div>{/* end content */}
    </div>
  )
}
