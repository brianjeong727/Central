"use client"

// ─── The in-call surface ─────────────────────────────────────────────────────
//
// Two shapes, chosen by whether there is anything to look at:
//
//   AUDIO — phone width: a full-screen cream takeover, because on a phone the
//           call IS what you are doing. Desktop: a small docked corner panel,
//           deliberately NOT a modal. An audio call is a thing you do WHILE
//           working — looking up the passage you are talking about, checking a
//           roster — and greying out the rest of Central would make people hang
//           up in order to use the app.
//
//   VIDEO — full screen on BOTH, dark. A video call is not something you do
//           alongside anything; the whole point is that you are looking. The
//           dark ground is physical rather than stylistic: video is somebody
//           else's light, and cream around it casts a colour on their face.

import { createPortal } from "react-dom"
import { useEffect, useState } from "react"
import { Mic, MicOff, PhoneOff, SwitchCamera, Video, VideoOff, Volume2 } from "lucide-react"
import { MonogramChip } from "@/components/central"
import { EYEBROW_STYLE } from "@/components/central/typography"
import { getInitials } from "../utils"
import { VideoStage } from "./video-stage"
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

interface CallOverlayProps {
  call: ActiveCall
  peers: CallPeer[]
  selfId: string
  micOn: boolean
  camOn: boolean
  facingUser: boolean
  needsAudioUnlock: boolean
  onToggleMic: () => void
  onToggleCamera: () => void
  onFlipCamera: () => void
  onHangUp: () => void
  onUnlockAudio: () => void
}

/** One round control. `lit` is the ON-and-inverted state a muted mic or a
 *  stopped camera takes — filled, dark glyph — so "off" reads at a glance
 *  instead of asking you to decode a slashed icon. */
function ControlButton({
  onClick, label, lit, dark, danger, children,
}: {
  onClick: () => void
  label: string
  lit?: boolean
  dark?: boolean
  danger?: boolean
  children: React.ReactNode
}) {
  const base = dark
    ? { idle: "color-mix(in srgb, var(--cream-on-dark) 16%, transparent)", idleFg: "var(--cream-on-dark)" }
    : { idle: "var(--cream-2)", idleFg: "var(--body)" }
  return (
    <button
      onClick={onClick}
      aria-label={label}
      aria-pressed={lit}
      className="call-btn"
      style={{
        width: 52, height: 52, borderRadius: "9999px", cursor: "pointer",
        display: "grid", placeItems: "center",
        border: danger ? "1px solid var(--danger)" : dark ? "none" : "1px solid var(--line-2)",
        background: danger ? "var(--danger)" : lit ? "var(--cream-on-dark)" : base.idle,
        color: danger ? "var(--cream-on-dark)" : lit ? "var(--ink)" : base.idleFg,
      }}
    >
      {children}
    </button>
  )
}

export function CallOverlay(props: CallOverlayProps) {
  const {
    call, peers, selfId, micOn, camOn, facingUser, needsAudioUnlock,
    onToggleMic, onToggleCamera, onFlipCamera, onHangUp, onUnlockAudio,
  } = props
  const elapsed = useElapsed(call.answeredAt)
  // Mounted under a dynamic({ ssr: false }) boundary, so document exists on the
  // first render — no mounted-flag round trip needed to reach createPortal.
  if (typeof document === "undefined") return null

  const status =
    call.status === "connecting" ? "Connecting"
    : call.status === "ringing" ? (call.outgoing ? "Calling" : "Ringing")
    : elapsed ?? "Connected"

  const speaking = peers.find((p) => p.speaking && p.identity !== selfId)
  // The surface follows the PICTURE, not the call's declared kind. Turning your
  // camera on during an audio call has to put you on the video stage — otherwise
  // the control publishes a track to everyone else and shows you nothing, and
  // the audio panel has no place to render the face that just appeared.
  const isVideo = call.kind === "video" || peers.some((p) => p.video)

  const unlockButton = needsAudioUnlock && (
    <button
      onClick={onUnlockAudio}
      className="call-btn"
      style={{
        height: 36, padding: "0 14px", borderRadius: 8,
        border: isVideo ? "none" : "1px solid var(--line-2)",
        background: isVideo ? "color-mix(in srgb, var(--cream-on-dark) 16%, transparent)" : "var(--cream-2)",
        color: isVideo ? "var(--cream-on-dark)" : "var(--body)",
        fontSize: 13, cursor: "pointer",
        display: "inline-flex", alignItems: "center", gap: 8,
      }}
    >
      <Volume2 size={14} />
      Tap to turn on sound
    </button>
  )

  // ── video ──────────────────────────────────────────────────────────────────
  if (isVideo) {
    return createPortal(
      <div
        className="fixed inset-0 z-[250]"
        style={{ background: "var(--ink)" }}
        role="dialog"
        aria-label={`Video call with ${call.title}`}
      >
        <VideoStage peers={peers} selfId={selfId} facingUser={facingUser} />

        {/* Status, over a scrim so it stays legible on a bright frame. */}
        <div
          style={{
            position: "absolute", top: 0, left: 0, right: 0,
            padding: "calc(env(safe-area-inset-top, 0px) + 14px) 20px 28px",
            background: "linear-gradient(to bottom, color-mix(in srgb, var(--ink) 62%, transparent), transparent)",
            pointerEvents: "none",
            textAlign: "center",
          }}
        >
          <div style={{ ...EYEBROW_STYLE, color: "var(--cream-on-dark)", opacity: 0.75 }}>{status}</div>
          <div
            style={{
              fontSize: 19, fontWeight: 600, letterSpacing: "-0.02em",
              color: "var(--cream-on-dark)", marginTop: 4, overflowWrap: "anywhere",
            }}
          >
            {call.title}
          </div>
        </div>

        <div
          style={{
            position: "absolute", left: 0, right: 0, bottom: 0,
            padding: "36px 20px calc(env(safe-area-inset-bottom, 0px) + 28px)",
            background: "linear-gradient(to top, color-mix(in srgb, var(--ink) 72%, transparent), transparent)",
            display: "flex", flexDirection: "column", alignItems: "center", gap: 14,
          }}
        >
          {unlockButton}
          <div className="flex items-center justify-center" style={{ gap: 14 }}>
            <ControlButton onClick={onToggleMic} label={micOn ? "Mute microphone" : "Unmute microphone"} lit={!micOn} dark>
              {micOn ? <Mic size={19} /> : <MicOff size={19} />}
            </ControlButton>
            <ControlButton onClick={onToggleCamera} label={camOn ? "Turn camera off" : "Turn camera on"} lit={!camOn} dark>
              {camOn ? <Video size={19} /> : <VideoOff size={19} />}
            </ControlButton>
            {/* Only where there is a second camera to flip TO, and only while
                one is actually running. */}
            {camOn && (
              <span className="md:hidden">
                <ControlButton onClick={onFlipCamera} label="Switch camera" dark>
                  <SwitchCamera size={19} />
                </ControlButton>
              </span>
            )}
            <ControlButton onClick={onHangUp} label="End call" danger dark>
              <PhoneOff size={19} />
            </ControlButton>
          </div>
        </div>
      </div>,
      document.body,
    )
  }

  // ── audio ──────────────────────────────────────────────────────────────────
  return createPortal(
    <div
      className={[
        "fixed z-[250] flex flex-col",
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
      <div className="call-panel flex-1 flex flex-col md:flex-none md:rounded-[14px] md:border md:border-[var(--line)] md:bg-[var(--cream-panel)]">
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

          {needsAudioUnlock && <span style={{ marginTop: 6 }}>{unlockButton}</span>}
        </div>

        <div className="flex items-center justify-center" style={{ gap: 18, marginTop: 36 }}>
          <ControlButton onClick={onToggleMic} label={micOn ? "Mute microphone" : "Unmute microphone"} lit={!micOn}>
            {micOn ? <Mic size={19} /> : <MicOff size={19} />}
          </ControlButton>
          {/* Turning your camera on promotes an audio call to a video one — the
              surface switches to the stage the moment a picture exists, so the
              other side can answer with theirs without anyone hanging up and
              ringing back. */}
          <ControlButton onClick={onToggleCamera} label={camOn ? "Turn camera off" : "Turn camera on"} lit={!camOn && false}>
            {camOn ? <Video size={19} /> : <VideoOff size={19} />}
          </ControlButton>
          {/* The one sanctioned solid --danger fill outside a confirm dialog:
              hanging up is the destructive confirm of a call, and it is the one
              control a person must be able to find without reading. */}
          <ControlButton onClick={onHangUp} label="End call" danger>
            <PhoneOff size={19} />
          </ControlButton>
        </div>
      </div>
    </div>,
    document.body,
  )
}
