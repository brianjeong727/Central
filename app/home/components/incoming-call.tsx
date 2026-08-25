"use client"

// ─── Incoming call ───────────────────────────────────────────────────────────
//
// The surface that appears when someone rings you. One component, two grammars,
// driven by whether the chat is a DM:
//
//   DM    — a person is calling YOU. Answer / Decline, and the title is their name.
//   group — someone opened a room. Join / Not now, and the title is the chat.
//
// The difference is real and worth encoding: declining a DM hangs the call up
// (there is nobody else it was for), while dismissing a group call just closes
// this card and leaves everyone else talking. app/actions/calls.ts enforces the
// same split server-side; this only chooses the words.
//
// Sits above every other layer except the pending veil, because a ringing phone
// that a modal can bury is a missed call.

import { createPortal } from "react-dom"
import { Phone, PhoneOff } from "lucide-react"
import { MonogramChip } from "@/components/central"
import { EYEBROW_STYLE } from "@/components/central/typography"
import { getInitials } from "../utils"
import type { IncomingCall as IncomingCallData } from "../call-context"

export function IncomingCall({
  call,
  onAccept,
  onDecline,
}: {
  call: IncomingCallData
  onAccept: () => void
  onDecline: () => void
}) {
  // Mounted under a dynamic({ ssr: false }) boundary, so document exists on the
  // first render — no mounted-flag round trip needed to reach createPortal.
  if (typeof document === "undefined") return null

  const isDM = call.isDM
  const acceptLabel = isDM ? "Answer" : "Join"
  const declineLabel = isDM ? "Decline" : "Not now"
  // The eyebrow says WHAT is happening, the title says WHO/WHERE, the sub says the
  // one thing neither covers. An earlier pass had the eyebrow and the sub both
  // reading "incoming call", which is a wasted line on a card with four.
  const sub = isDM
    ? call.kind === "video" ? "Video call" : "Audio call"
    : `${call.callerName} started a call`
  // In a DM the avatar is the caller; in a group the chat has no single face, so
  // the caller's initials still identify who to expect on the other end.
  const initials = getInitials(isDM ? call.title : call.callerName)

  return createPortal(
    <div
      className="fixed inset-0 z-[260] flex items-center justify-center px-5 animate-backdrop-in"
      style={{ background: "var(--veil)" }}
      role="dialog"
      aria-modal="true"
      aria-label={`${sub} — ${call.title}`}
    >
      <div
        className="animate-dialog-in w-full"
        style={{
          maxWidth: 360,
          background: "var(--cream-panel)",
          border: "1px solid var(--line)",
          borderRadius: "var(--r-hero)",
          padding: "36px 28px 28px",
          textAlign: "center",
        }}
      >
        <div className="flex justify-center" style={{ marginBottom: 18 }}>
          <span className="call-ring-pulse" style={{ borderRadius: "9999px", display: "inline-flex" }}>
            <MonogramChip
              initials={initials}
              className="w-[72px] h-[72px]"
              style={{ fontSize: 24 }}
            />
          </span>
        </div>

        <div style={{ ...EYEBROW_STYLE, color: "var(--muted-text)", marginBottom: 10 }}>
          Incoming
        </div>

        <h2
          style={{
            fontSize: 25, fontWeight: 600, letterSpacing: "-0.02em",
            color: "var(--ink)", lineHeight: 1.15, marginBottom: 6,
            overflowWrap: "anywhere",
          }}
        >
          {call.title}
        </h2>
        <p style={{ fontSize: 14, color: "var(--muted-text)", marginBottom: 28 }}>{sub}</p>

        <div className="flex items-center gap-3">
          {/* Danger read ONLY in a DM, where declining genuinely hangs up on the
              person calling. In a group "Not now" closes this card and nothing
              else — the call carries on without you — so it is an ordinary
              secondary action and colouring it red would be a lie. */}
          <button
            onClick={onDecline}
            className="call-btn"
            style={{
              flex: 1, height: 48, borderRadius: 10,
              border: `1px solid ${isDM ? "var(--danger)" : "var(--line-2)"}`,
              background: "transparent",
              color: isDM ? "var(--danger)" : "var(--body)", fontSize: 15,
              display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 8,
              cursor: "pointer",
            }}
          >
            {isDM && <PhoneOff size={16} />}
            {declineLabel}
          </button>
          <button
            onClick={onAccept}
            className="call-btn"
            style={{
              flex: 1, height: 48, borderRadius: 10,
              border: "1px solid var(--plum)", background: "var(--plum)",
              color: "var(--cream-on-dark)", fontSize: 15,
              display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 8,
              cursor: "pointer",
            }}
          >
            <Phone size={16} />
            {acceptLabel}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  )
}
