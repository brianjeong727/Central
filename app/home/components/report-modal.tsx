"use client"

// Shared "Report content" modal (App Store §1.2). Used by the chat message
// context menu (target_type 'message') and the directory member sheet
// (target_type 'profile'). Lives under app/ (not components/central) because it
// imports the report/block server actions — components/central is a LEAF.

import { useState } from "react"
import { Check } from "lucide-react"
import { CentralModal, CentralButton, Textarea } from "@/components/central"
import { createReport, type ReportReason, type ReportTargetType } from "@/app/actions/reports"
import { blockUser } from "@/app/actions/blocks"

const REASONS: { value: ReportReason; label: string; sub: string }[] = [
  { value: "inappropriate", label: "Inappropriate content", sub: "Explicit, offensive, or objectionable material." },
  { value: "harassment", label: "Harassment or bullying", sub: "Targeting or threatening someone." },
  { value: "spam", label: "Spam", sub: "Unwanted, repetitive, or promotional content." },
  { value: "other", label: "Something else", sub: "Tell us what's wrong below." },
]

export function ReportModal({
  targetType,
  targetId,
  targetUserId,
  targetName,
  showBlockOption = true,
  onClose,
  onReported,
  onBlocked,
}: {
  targetType: ReportTargetType
  targetId: string
  /** Author of the target — required to offer "Report & block user". */
  targetUserId?: string | null
  targetName?: string | null
  showBlockOption?: boolean
  onClose: () => void
  onReported?: () => void
  /** Fired after a successful block so callers can refresh their block list. */
  onBlocked?: () => void
}) {
  const [reason, setReason] = useState<ReportReason | null>(null)
  const [details, setDetails] = useState("")
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)

  const canBlock = showBlockOption && !!targetUserId

  // Safety mechanism — correctness over optimism. AWAIT the write and inspect
  // { error } BEFORE showing success; a false "reported" would silently drop a
  // real report. The button spinner keeps it snappy while awaiting.
  async function submit(alsoBlock: boolean) {
    if (!reason || busy) return
    setBusy(true)
    setSubmitError(null)
    const { error: reportErr } = await createReport({ targetType, targetId, reason, details })
    if (reportErr) {
      setBusy(false)
      setSubmitError("Couldn't send your report — try again.")
      return
    }
    if (alsoBlock && targetUserId) {
      const { error: blockErr } = await blockUser(targetUserId)
      if (blockErr) {
        setBusy(false)
        setSubmitError("Your report was sent, but blocking failed — try again.")
        return
      }
      onBlocked?.()
    }
    onReported?.()
    setDone(true)
    setTimeout(onClose, 1300)
  }

  if (done) {
    return (
      <CentralModal onClose={onClose} title="Report received" eyebrow="Thank you">
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 14, padding: "16px 0 8px" }}>
          <div style={{ width: 44, height: 44, borderRadius: 999, background: "var(--ivory)", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <Check style={{ width: 20, height: 20, color: "var(--plum)" }} />
          </div>
          <p style={{ fontSize: 14, color: "var(--body)", lineHeight: 1.55, textAlign: "center", maxWidth: 320 }}>
            Thanks for letting us know. Your ministry&apos;s admins will review this report.
          </p>
        </div>
      </CentralModal>
    )
  }

  return (
    <CentralModal
      onClose={onClose}
      title="Report content"
      eyebrow="Report"
      dirty={!!reason || details.trim().length > 0}
      footer={
        <>
          {canBlock && (
            <CentralButton variant="secondary" onClick={() => submit(true)} disabled={!reason || busy}>
              Report &amp; block{targetName ? ` ${targetName.split(" ")[0]}` : " user"}
            </CentralButton>
          )}
          <CentralButton variant="primary" onClick={() => submit(false)} disabled={!reason || busy}>
            {busy ? "Sending…" : "Report"}
          </CentralButton>
        </>
      }
    >
      <p style={{ fontSize: 13.5, color: "var(--body)", lineHeight: 1.55, margin: "0 0 18px" }}>
        Why are you reporting this{targetType === "profile" ? " person" : targetType === "announcement" ? " announcement" : " message"}?
        Reports are private and reviewed by your ministry&apos;s admins.
      </p>

      {submitError && (
        <div style={{ margin: "0 0 16px", padding: "10px 14px", borderRadius: 10, background: "color-mix(in srgb, var(--danger) 8%, transparent)", border: "1px solid color-mix(in srgb, var(--danger) 30%, transparent)", fontSize: 13, color: "var(--danger)", lineHeight: 1.5 }} role="alert">
          {submitError}
        </div>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {REASONS.map((r) => {
          const selected = reason === r.value
          return (
            <button
              key={r.value}
              type="button"
              onClick={() => setReason(r.value)}
              style={{
                display: "flex", alignItems: "flex-start", gap: 12, textAlign: "left",
                padding: "13px 14px", borderRadius: 12, cursor: "pointer",
                background: selected ? "var(--ivory)" : "transparent",
                border: `1px solid ${selected ? "var(--plum)" : "var(--line)"}`,
              }}
            >
              <span style={{
                width: 18, height: 18, borderRadius: 999, flexShrink: 0, marginTop: 1,
                border: `2px solid ${selected ? "var(--plum)" : "var(--dashed)"}`,
                display: "flex", alignItems: "center", justifyContent: "center",
              }}>
                {selected && <span style={{ width: 8, height: 8, borderRadius: 999, background: "var(--plum)" }} />}
              </span>
              <span style={{ minWidth: 0 }}>
                <span style={{ display: "block", fontSize: 14, fontWeight: 500, color: "var(--ink)" }}>{r.label}</span>
                <span style={{ display: "block", fontSize: 12.5, color: "var(--muted-text)", marginTop: 2, lineHeight: 1.45 }}>{r.sub}</span>
              </span>
            </button>
          )
        })}
      </div>

      <div style={{ marginTop: 18 }}>
        <label style={{ fontFamily: "var(--mono)", fontSize: 10, letterSpacing: "1.2px", textTransform: "uppercase", color: "var(--muted-text)", display: "block", marginBottom: 8 }}>
          Details (optional)
        </label>
        <Textarea
          value={details}
          onChange={(e) => setDetails(e.target.value)}
          placeholder="Add any context that will help admins review this."
          rows={3}
        />
      </div>
    </CentralModal>
  )
}
