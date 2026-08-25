"use client"

// ─── The in-call surface ─────────────────────────────────────────────────────
//
// Phone width: a full-screen cream takeover, because on a phone the call IS what
// you are doing.
//
// Desktop: a small docked panel in the corner, deliberately NOT a modal. A call
// is a thing you do WHILE working — looking up the passage you are talking
// about, checking the roster — and an audio call that greys out the rest of
// Central would make people hang up to use the app. It becomes a proper stage
// when video lands; until then there is nothing to look at, so it stays out of
// the way.

import { createPortal } from "react-dom"
import { useEffect, useState } from "react"
import { Mic, MicOff, PhoneOff, Volume2 } from "lucide-react"
import { MonogramChip } from "@/components/central"
import { EYEBROW_STYLE } from "@/components/central/typography"
import { getInitials } from "../utils"
import type { ActiveCall, CallPeer } from "../call-context"

/** Ticking call duration. The label is written from the interval callback and
 *  never computed during render — reading the clock while rendering is impure,
 *  and seeding it synchronously from an effect cascades a second render. The
 *  caller supplies the "0:00" that covers the first second. */
function useElapsed(since: number | null): string | null {
  const [label, setLabel] = useState<string | null>(null)
  useEffect(() => {
    if (!since) return
    const t = setInterval(() => {
      const secs = Math.max(0, Math.floor((Date.now() - since) / 1000))
      setLabel(`${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, "0")}`)
    }, 1000)
    return () => clearInterval(t)
  }, [since])
  return since ? label ?? "0:00" : null
}

/** "You and Sarah" · "You, Sarah and 2 others" — who is actually in the room. */
function peerLine(peers: CallPeer[], selfIdentity: string): string {
  const others = peers.filter((p) => p.identity !== selfIdentity).map((p) => p.name.split(" ")[0])
  if (others.length === 0) return "Just you so far"
  if (others.length === 1) return `You and ${others[0]}`
  if (others.length === 2) return `You, ${others[0]} and ${others[1]}`
  return `You, ${others[0]} and ${others.length - 1} others`
}

export function CallOverlay({
  call,
  peers,
  selfId,
  micOn,
  needsAudioUnlock,
  onToggleMic,
  onHangUp,
  onUnlockAudio,
}: {
  call: ActiveCall
  peers: CallPeer[]
  selfId: string
  micOn: boolean
  needsAudioUnlock: boolean
  onToggleMic: () => void
  onHangUp: () => void
  onUnlockAudio: () => void
}) {
  const elapsed = useElapsed(call.answeredAt)
  // Mounted under a dynamic({ ssr: false }) boundary, so document exists on the
  // first render — no mounted-flag round trip needed to reach createPortal.
  if (typeof document === "undefined") return null

  const status =
    call.status === "connecting" ? "Connecting"
    : call.status === "ringing" ? (call.outgoing ? "Calling" : "Ringing")
    : elapsed ?? "Connected"

  const speaking = peers.find((p) => p.speaking && p.identity !== selfId)

  return createPortal(
    <div
      className={[
        "fixed z-[250] flex flex-col",
        // phone: full takeover
        "inset-0",
        // Desktop: a docked corner panel, not a modal. Parked ABOVE the composer
        // rather than on it — the one thing in that corner is an interactive
        // control, and a call panel that swallows Send is worse than one that
        // covers a few old messages.
        "md:inset-auto md:bottom-[124px] md:right-6 md:w-[300px] md:h-auto",
      ].join(" ")}
      style={{ background: "var(--cream)" }}
      role="dialog"
      aria-label={`Call with ${call.title}`}
    >
      {/* The safe areas are the overlay's own problem: it is `fixed inset-0`, so it
          escapes the shell padding that every in-app surface inherits. Without the
          bottom inset the end-call button sits on the home indicator. */}
      <div
        className="call-panel flex-1 flex flex-col md:flex-none md:rounded-[14px] md:border md:border-[var(--line)] md:bg-[var(--cream-panel)]"
      >
        <div className="flex-1 flex flex-col items-center justify-center md:flex-none" style={{ gap: 14 }}>
          <span
            className={call.status !== "active" ? "call-ring-pulse" : undefined}
            style={{ borderRadius: "9999px", display: "inline-flex" }}
          >
            <MonogramChip
              initials={getInitials(call.title)}
              className="w-[72px] h-[72px] md:w-[56px] md:h-[56px]"
              style={{ fontSize: 24 }}
            />
          </span>

          <div className="text-center" style={{ marginTop: 4 }}>
            <div style={{ ...EYEBROW_STYLE, color: "var(--muted-text)", marginBottom: 8 }}>{status}</div>
            <h2
              style={{
                fontSize: 25, fontWeight: 600, letterSpacing: "-0.02em",
                color: "var(--ink)", lineHeight: 1.15, overflowWrap: "anywhere",
              }}
            >
              {call.title}
            </h2>
            {call.status === "active" && (
              <p style={{ fontSize: 13, color: "var(--muted-text)", marginTop: 6 }}>
                {speaking ? `${speaking.name.split(" ")[0]} is speaking` : peerLine(peers, selfId)}
              </p>
            )}
          </div>

          {needsAudioUnlock && (
            <button
              onClick={onUnlockAudio}
              className="call-btn"
              style={{
                marginTop: 6, height: 36, padding: "0 14px", borderRadius: 8,
                border: "1px solid var(--line-2)", background: "var(--cream-2)",
                color: "var(--body)", fontSize: 13, cursor: "pointer",
                display: "inline-flex", alignItems: "center", gap: 8,
              }}
            >
              <Volume2 size={14} />
              Tap to turn on sound
            </button>
          )}
        </div>

        <div className="flex items-center justify-center" style={{ gap: 18, marginTop: 36 }}>
          <button
            onClick={onToggleMic}
            aria-pressed={!micOn}
            aria-label={micOn ? "Mute microphone" : "Unmute microphone"}
            className="call-btn"
            style={{
              width: 52, height: 52, borderRadius: "9999px", cursor: "pointer",
              display: "grid", placeItems: "center",
              border: "1px solid var(--line-2)",
              // An inset fill rather than transparent: a hairline circle on cream
              // reads as an outline of nothing, and this is one of two controls on
              // an otherwise empty screen.
              background: micOn ? "var(--cream-2)" : "var(--plum-tint)",
              color: micOn ? "var(--body)" : "var(--plum)",
            }}
          >
            {micOn ? <Mic size={19} /> : <MicOff size={19} />}
          </button>

          {/* The one sanctioned solid --danger fill outside a confirm dialog:
              hanging up is the destructive confirm of a call, and it is the one
              control a person must be able to find without reading. */}
          <button
            onClick={onHangUp}
            aria-label="End call"
            className="call-btn"
            style={{
              width: 52, height: 52, borderRadius: "9999px", cursor: "pointer",
              display: "grid", placeItems: "center",
              border: "1px solid var(--danger)", background: "var(--danger)",
              color: "var(--cream-on-dark)",
            }}
          >
            <PhoneOff size={19} />
          </button>
        </div>
      </div>
    </div>,
    document.body,
  )
}
