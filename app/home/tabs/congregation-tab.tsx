"use client"

import { useState, useEffect, useCallback } from "react"
import { Plus, X, BarChart2, Archive, ChevronDown, ChevronUp } from "lucide-react"
import { createClient } from "@/lib/supabase"
import { Spinner } from "../components/shared"
import { DesktopTopbar } from "../components/desktop-nav"
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

export function CongregationTab({ userId, ministryId }: CongregationTabProps) {
  const supabase = createClient()
  const [view, setView] = useState<View>("ask")

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
                  <span style={{ fontSize: 13, fontWeight: 500, color: "#13101A" }}>{opt}</span>
                  <span style={{ fontSize: 12, color: "#8A8497" }}>{count} · {pct}%</span>
                </div>
                <div style={{ height: 6, borderRadius: 999, background: "#E5E0D2", overflow: "hidden" }}>
                  <div style={{ height: "100%", width: `${pct}%`, background: "#3E1540", borderRadius: 999, transition: "width 0.4s ease" }} />
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
          <div style={{ fontSize: 40, fontWeight: 700, color: "#3E1540", fontFamily: "var(--font-instrument-serif)", lineHeight: 1 }}>{avg}</div>
          <div style={{ fontSize: 12, color: "#8A8497", marginBottom: 12 }}>average out of 5</div>
          <div style={{ display: "flex", gap: 6 }}>
            {dist.map(({ n, count }) => (
              <div key={n} style={{ flex: 1, textAlign: "center" }}>
                <div style={{ fontSize: 16, marginBottom: 4 }}>{n}</div>
                <div style={{ height: Math.max(4, count * 10), background: "#3E1540", borderRadius: 4, opacity: count > 0 ? 1 : 0.12, minHeight: 4, transition: "height 0.4s" }} />
                <div style={{ fontSize: 11, color: "#8A8497", marginTop: 3 }}>{count}</div>
              </div>
            ))}
          </div>
        </div>
      )
    }

    // open + prayer
    const texts = resps.map(r => r.response_text).filter(Boolean) as string[]
    if (texts.length === 0) return <p style={{ fontSize: 13, color: "#8A8497", marginTop: 12 }}>No responses yet.</p>
    return (
      <div style={{ marginTop: 12, display: "flex", flexDirection: "column", gap: 8 }}>
        {texts.map((t, i) => (
          <div key={i} style={{ padding: "10px 12px", borderRadius: 8, background: "#F4F1E8", border: "1px solid #E5E0D2", fontSize: 13, color: "#13101A", lineHeight: 1.5 }}>{t}</div>
        ))}
      </div>
    )
  }

  const monoStyle: React.CSSProperties = {
    fontFamily: "ui-monospace,'SF Mono',Menlo,monospace",
    fontSize: "11px",
    letterSpacing: "0.14em",
    textTransform: "uppercase",
    color: "#8A8497",
  }

  const tabStyle = (active: boolean): React.CSSProperties => ({
    padding: "6px 14px",
    borderRadius: 999,
    fontSize: 13,
    fontWeight: active ? 600 : 400,
    background: active ? "#3E1540" : "transparent",
    color: active ? "#F6F4EF" : "#8A8497",
    border: "none",
    cursor: "pointer",
    transition: "background 0.15s, color 0.15s",
  })

  return (
    <div className="pb-28 md:pb-0">
      <DesktopTopbar crumbs={["Central", "Congregation", view === "ask" ? "Ask" : view === "responses" ? "Responses" : "Archive"]} />

      {/* Mobile header */}
      <div className="md:hidden px-5 pt-14 pb-5">
        <p style={monoStyle}>Congregation</p>
        <h1 style={{ fontFamily: "var(--font-instrument-serif)", fontSize: 36, color: "#13101A", lineHeight: 1.05, margin: "14px 0 0", fontWeight: 400 }}>
          {view === "ask" ? "Ask" : view === "responses" ? "Responses" : "Archive"}
        </h1>
        <p style={{ fontSize: 14, color: "#5A5466", marginTop: 8 }}>
          {view === "ask" ? "Send a question to your congregation." : view === "responses" ? "Anonymous responses from your congregation." : "Past questions and their results."}
        </p>
      </div>

      {/* Desktop header */}
      <div className="hidden md:block px-14 pt-11 pb-8 border-b border-[#E5E0D2]">
        <p style={monoStyle}>Congregation</p>
        <h1 style={{ fontFamily: "var(--font-instrument-serif)", fontSize: 52, color: "#13101A", lineHeight: 1.05, margin: "14px 0 0", fontWeight: 400 }}>
          {view === "ask" ? "Ask" : view === "responses" ? "Responses" : "Archive"}
        </h1>
        <p style={{ fontSize: 14, color: "#5A5466", marginTop: 12, maxWidth: 560 }}>
          {view === "ask" ? "Send a question to your congregation — responses are anonymous." : view === "responses" ? "Anonymous responses from your congregation." : "Past questions and their results."}
        </p>
      </div>

      <div className="px-5 md:px-14 pt-6 md:pt-8" style={{ maxWidth: 740 }}>

        {/* View switcher */}
        <div style={{ display: "flex", gap: 4, marginBottom: 24, padding: "4px", background: "#F4F1E8", borderRadius: 999, width: "fit-content" }}>
          <button style={tabStyle(view === "ask")} onClick={() => setView("ask")}>Ask</button>
          <button style={tabStyle(view === "responses")} onClick={() => setView("responses")}>Responses</button>
          <button style={tabStyle(view === "archive")} onClick={() => setView("archive")}>Archive</button>
        </div>

        {/* ── ASK VIEW ── */}
        {view === "ask" && (
          <div>
            {/* Active question status */}
            {loadingActive ? (
              <Spinner />
            ) : activeQuestion ? (
              <div style={{ padding: "16px", borderRadius: 12, background: "rgba(62,21,64,0.06)", border: "1.5px solid rgba(62,21,64,0.15)", marginBottom: 24 }}>
                <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12 }}>
                  <div style={{ flex: 1 }}>
                    <span style={{ ...monoStyle, color: "#3E1540", marginBottom: 6, display: "block" }}>Active · {TYPE_LABELS[activeQuestion.question_type]}</span>
                    <p style={{ fontSize: 15, fontWeight: 600, color: "#13101A", lineHeight: 1.4 }}>{activeQuestion.question_text}</p>
                    <p style={{ fontSize: 12, color: "#8A8497", marginTop: 6 }}>{activeResponseCount} response{activeResponseCount !== 1 ? "s" : ""}</p>
                  </div>
                  <button
                    onClick={handleClose}
                    disabled={closing}
                    style={{ padding: "6px 12px", fontSize: 12, fontWeight: 600, borderRadius: 8, background: "transparent", border: "1px solid #E5E0D2", color: "#9D2D2D", cursor: "pointer", flexShrink: 0 }}
                  >
                    {closing ? "Closing…" : "Close question"}
                  </button>
                </div>
                <button
                  onClick={() => setView("responses")}
                  style={{ marginTop: 12, fontSize: 12, color: "#3E1540", fontWeight: 600, background: "none", border: "none", cursor: "pointer", padding: 0, display: "flex", alignItems: "center", gap: 4 }}
                >
                  <BarChart2 className="w-3.5 h-3.5" /> View responses
                </button>
              </div>
            ) : (
              <div style={{ padding: "14px 16px", borderRadius: 12, background: "#F4F1E8", border: "1px dashed #C4C4C4", marginBottom: 24, fontSize: 13, color: "#8A8497", textAlign: "center" }}>
                No active question. Send one below.
              </div>
            )}

            {/* Create form */}
            <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              <div>
                <label style={{ ...monoStyle, display: "block", marginBottom: 6 }}>Your question</label>
                <textarea
                  value={questionText}
                  onChange={e => setQuestionText(e.target.value)}
                  placeholder="What's on your heart this week?"
                  rows={3}
                  style={{ width: "100%", padding: "10px 12px", borderRadius: 10, border: "1.5px solid #E5E0D2", background: "#FBF8F2", fontSize: 14, color: "#13101A", fontFamily: "var(--font-inter)", resize: "vertical", boxSizing: "border-box", outline: "none" }}
                />
              </div>

              <div>
                <label style={{ ...monoStyle, display: "block", marginBottom: 8 }}>Response type</label>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                  {(["poll", "scale", "open", "prayer"] as const).map((t) => (
                    <button
                      key={t}
                      onClick={() => setQuestionType(t)}
                      style={{
                        padding: "10px 12px",
                        borderRadius: 10,
                        border: `1.5px solid ${questionType === t ? "#3E1540" : "#E5E0D2"}`,
                        background: questionType === t ? "rgba(62,21,64,0.06)" : "#FBF8F2",
                        cursor: "pointer",
                        textAlign: "left",
                      }}
                    >
                      <div style={{ fontSize: 13, fontWeight: 600, color: "#13101A", marginBottom: 2 }}>{TYPE_LABELS[t]}</div>
                      <div style={{ fontSize: 11, color: "#8A8497", lineHeight: 1.3 }}>{TYPE_DESCRIPTIONS[t]}</div>
                    </button>
                  ))}
                </div>
              </div>

              {questionType === "poll" && (
                <div>
                  <label style={{ ...monoStyle, display: "block", marginBottom: 8 }}>Poll options</label>
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
                          style={{ flex: 1, padding: "8px 12px", borderRadius: 8, border: "1.5px solid #E5E0D2", background: "#FBF8F2", fontSize: 13, color: "#13101A", fontFamily: "var(--font-inter)", outline: "none" }}
                        />
                        {pollOptions.length > 2 && (
                          <button
                            onClick={() => setPollOptions(prev => prev.filter((_, j) => j !== i))}
                            style={{ width: 28, height: 28, borderRadius: 6, background: "transparent", border: "1px solid #E5E0D2", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}
                          >
                            <X className="w-3.5 h-3.5 text-[#8A8497]" />
                          </button>
                        )}
                      </div>
                    ))}
                    {pollOptions.length < 5 && (
                      <button
                        onClick={() => setPollOptions(prev => [...prev, ""])}
                        style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: "#3E1540", fontWeight: 600, background: "none", border: "none", cursor: "pointer", padding: "4px 0" }}
                      >
                        <Plus className="w-3.5 h-3.5" /> Add option
                      </button>
                    )}
                  </div>
                </div>
              )}

              {error && <p style={{ fontSize: 12, color: "#B91C1C" }}>{error}</p>}

              <button
                onClick={handleSend}
                disabled={submitting || !questionText.trim()}
                style={{
                  padding: "12px 0",
                  borderRadius: 10,
                  background: submitting || !questionText.trim() ? "#C4C4C4" : "#3E1540",
                  color: "#F6F4EF",
                  fontSize: 14,
                  fontWeight: 600,
                  border: "none",
                  cursor: submitting || !questionText.trim() ? "not-allowed" : "pointer",
                  fontFamily: "var(--font-inter)",
                  transition: "background 0.15s",
                }}
              >
                {submitting ? "Sending…" : activeQuestion ? "Replace active question" : "Send to Congregation"}
              </button>
            </div>
          </div>
        )}

        {/* ── RESPONSES VIEW ── */}
        {view === "responses" && (
          <div>
            {!activeQuestion ? (
              <div style={{ padding: "40px 0", textAlign: "center" }}>
                <p style={{ fontSize: 14, color: "#8A8497" }}>No active question. Send one from the Ask tab.</p>
              </div>
            ) : (
              <div>
                <div style={{ padding: "16px", borderRadius: 12, background: "white", border: "1px solid #E5E0D2", marginBottom: 20 }}>
                  <span style={{ ...monoStyle, color: "#3E1540", marginBottom: 6, display: "block" }}>{TYPE_LABELS[activeQuestion.question_type]}</span>
                  <p style={{ fontSize: 15, fontWeight: 600, color: "#13101A", lineHeight: 1.4, marginBottom: 4 }}>{activeQuestion.question_text}</p>
                  <p style={{ fontSize: 12, color: "#8A8497" }}>{activeResponseCount} response{activeResponseCount !== 1 ? "s" : ""}</p>

                  {loadingResponses ? (
                    <div style={{ marginTop: 12 }}><Spinner /></div>
                  ) : (
                    renderResults(activeQuestion, responses)
                  )}
                </div>

                <button
                  onClick={handleClose}
                  disabled={closing}
                  style={{ padding: "10px 16px", fontSize: 13, fontWeight: 600, borderRadius: 8, background: "transparent", border: "1px solid #E5E0D2", color: "#9D2D2D", cursor: "pointer" }}
                >
                  {closing ? "Closing…" : "Close question"}
                </button>
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
              <div style={{ padding: "40px 0", textAlign: "center" }}>
                <Archive className="w-8 h-8 text-[#C4C4C4] mx-auto mb-2" />
                <p style={{ fontSize: 14, color: "#8A8497" }}>No closed questions yet.</p>
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {archived.map((q) => (
                  <div key={q.id} style={{ borderRadius: 12, border: "1px solid #E5E0D2", background: "white", overflow: "hidden" }}>
                    <button
                      onClick={() => toggleArchived(q.id)}
                      style={{ width: "100%", padding: "14px 16px", display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12, background: "none", border: "none", cursor: "pointer", textAlign: "left" }}
                    >
                      <div style={{ flex: 1 }}>
                        <span style={{ display: "inline-block", fontSize: 10, fontWeight: 600, letterSpacing: "0.06em", textTransform: "uppercase", color: "#8A8497", marginBottom: 4 }}>
                          {TYPE_LABELS[q.question_type]} · {q.response_count} response{q.response_count !== 1 ? "s" : ""}
                        </span>
                        <p style={{ fontSize: 14, fontWeight: 500, color: "#13101A", lineHeight: 1.4 }}>{q.question_text}</p>
                      </div>
                      {q.expanded ? <ChevronUp className="w-4 h-4 text-[#8A8497] flex-shrink-0 mt-0.5" /> : <ChevronDown className="w-4 h-4 text-[#8A8497] flex-shrink-0 mt-0.5" />}
                    </button>
                    {q.expanded && (
                      <div style={{ padding: "0 16px 16px", borderTop: "1px solid #F4F1E8" }}>
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
