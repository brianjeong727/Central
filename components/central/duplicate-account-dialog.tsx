"use client"

// ─── "You may already have an account here" ──────────────────────────────────
//
// Shown at the join door when someone's name already belongs to a current or past
// member of the ministry they are joining. It is an INTERSTITIAL, not a wall:
// two real David Kims in one college ministry is not a hypothetical, so "that
// isn't me" always continues the join.
//
// The whole design rests on one thing — the MASKED EMAIL. In the overwhelmingly
// common case this person is not a stranger, they are the same person who signed
// up last term on a different address and cannot remember which. Showing them
// "b•••@pitt.edu" ends the confusion instantly, without telling anyone who is not
// yet a member who belongs to this ministry.
//
// No "replace my account" option, deliberately: we cannot prove the person
// clicking owns the existing account, and replacing would move somebody's
// messages, team roles and giving history with no undo.

import { createPortal } from "react-dom"
import { CentralModal } from "./central-modal"
import { CentralButton } from "./button"
import { MonogramChip } from "./MonogramChip"

// Local, not imported: components/central is a LEAF and must not reach into app/,
// where the shared getInitials lives. Two initials from the first and last word.
function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return "?"
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
}

export interface DuplicateAccountInfo {
  name: string
  maskedEmail: string
  avatarUrl: string | null
  graduationYear: number | null
  status: "active" | "past"
}

export function DuplicateAccountDialog({
  open,
  ministryName,
  candidate,
  busy = false,
  onSignInInstead,
  onContinueAnyway,
  onClose,
}: {
  open: boolean
  ministryName: string | null
  candidate: DuplicateAccountInfo | null
  busy?: boolean
  /** "That's me" — hand off to signing in as the existing account. */
  onSignInInstead: () => void
  /** "That isn't me" — re-run the join with the duplicate check confirmed. */
  onContinueAnyway: () => void
  onClose: () => void
}) {
  if (!open || !candidate || typeof document === "undefined") return null

  const isPast = candidate.status === "past"

  return createPortal(
    <CentralModal
      onClose={() => { if (!busy) onClose() }}
      eyebrow={isPast ? "Welcome back?" : "Already here?"}
      title={isPast ? "You've been here before" : "You may already have an account"}
      maxWidth={440}
      z={220}
      footer={
        <>
          <CentralButton variant="secondary" size="md" onClick={onContinueAnyway} disabled={busy}>
            That isn&apos;t me
          </CentralButton>
          <CentralButton variant="primary" size="md" onClick={onSignInInstead} disabled={busy}>
            {busy ? "…" : "That's me — sign in"}
          </CentralButton>
        </>
      }
    >
      <p style={{ fontSize: 14, color: "var(--body)", lineHeight: 1.55, margin: "0 0 16px" }}>
        {isPast
          ? <>Someone with your name was in {ministryName ?? "this ministry"} before. If that was you, sign in on that account instead — your messages and history are still there waiting.</>
          : <>Someone with your name is already in {ministryName ?? "this ministry"}. You can only have one account per ministry, so if this is you, sign in on that account rather than starting over.</>}
      </p>

      {/* The card. Enough to recognise yourself by and nothing more: no full
          address, no phone, no link through to the profile. */}
      <div style={{
        display: "flex", alignItems: "center", gap: 14,
        padding: "14px 16px", background: "var(--cream)",
        border: "1px solid var(--line)", borderRadius: "var(--r-card)",
      }}>
        <MonogramChip
          initials={initialsOf(candidate.name)}
          avatarUrl={candidate.avatarUrl ?? undefined}
          className="w-11 h-11 font-medium text-[12px]"
        />
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 15, fontWeight: 600, color: "var(--ink)", letterSpacing: "-0.01em" }}>
            {candidate.name}
          </div>
          <div style={{ fontSize: 13, color: "var(--muted-text)", marginTop: 2 }}>
            {candidate.maskedEmail}
            {candidate.graduationYear ? ` · Class of ${candidate.graduationYear}` : ""}
          </div>
        </div>
      </div>

      <p style={{ fontSize: 12.5, color: "var(--muted-text)", lineHeight: 1.5, margin: "14px 0 0" }}>
        Can&apos;t get into that address any more? Ask a leader in {ministryName ?? "the ministry"} —
        they can sort it out from their side.
      </p>
    </CentralModal>,
    document.body,
  )
}
