"use client"

// ─── The video stage ─────────────────────────────────────────────────────────
//
// Two layouts, chosen by how many people are in the room, because they are
// genuinely different products:
//
//   1:1   — the other person fills the screen and you are a small picture in the
//           corner. What you look at is them; your own face is a check, not a
//           subject.
//   group — an even grid, everyone the same size, active speaker ringed. Nobody
//           is the subject, so nobody gets more room.
//
// A THIRD layout takes over both of those the moment anyone shares a screen:
// the screen becomes the whole stage and the faces drop to a filmstrip. Sharing
// is an act of "look at this", so what is shared outranks who is talking.
//
// Deliberately dark (`--ink`). This is the one surface in Central that is not
// cream, and the reason is physical rather than stylistic: video is somebody
// else's light, and cream around it casts a colour on their face. Every control
// on top of it uses `--cream-on-dark` and translucent fills mixed from tokens.

import { useEffect, useRef } from "react"
import { MicOff, MonitorUp } from "lucide-react"
import { MonogramChip } from "@/components/central"
import { getInitials } from "../utils"
import type { CallPeer } from "../call-context"

/**
 * One participant's picture.
 *
 * The <video> is attached imperatively because a LiveKit track is not something
 * React can render — `attach(el)` wires the MediaStream onto the element, and
 * the effect is keyed on the track so a republish (a camera flip, a reconnect)
 * swaps cleanly instead of leaving the previous stream bound.
 */
function VideoTile({
  peer,
  mirrored,
  compact,
  showName,
  source = "camera",
}: {
  peer: CallPeer
  mirrored: boolean
  compact: boolean
  showName: boolean
  /** "screen" renders CONTAINED on a dark ground. A face may be cropped to fill
   *  its tile; somebody's slides may not — cropping a shared screen cuts off the
   *  thing they are pointing at. */
  source?: "camera" | "screen"
}) {
  const ref = useRef<HTMLVideoElement | null>(null)
  const track = source === "screen" ? peer.screen : peer.video

  useEffect(() => {
    const el = ref.current
    if (!el || !track) return
    track.attach(el)
    return () => { track.detach(el) }
  }, [track])

  return (
    <div
      style={{
        position: "relative",
        width: "100%",
        height: "100%",
        overflow: "hidden",
        borderRadius: source === "screen" ? 14 : compact ? 12 : 14,
        background: source === "screen" ? "var(--ink)" : "var(--plum-2)",
        // The speaking ring is the only thing that moves on a grid of still
        // faces, so it is what tells you who to look at.
        outline: peer.speaking ? "2px solid var(--plum)" : "none",
        outlineOffset: -2,
        transition: "outline-color var(--dur-fast) var(--ease-out)",
      }}
    >
      {track ? (
        <video
          ref={ref}
          autoPlay
          playsInline
          // Never play your OWN microphone back at yourself.
          muted={peer.isLocal}
          style={{
            width: "100%", height: "100%",
            objectFit: source === "screen" ? "contain" : "cover",
            display: "block",
            // A self-view that is not mirrored reads as someone else's footage —
            // you raise your left hand and the person on screen raises theirs.
            transform: mirrored ? "scaleX(-1)" : undefined,
          }}
        />
      ) : (
        <div style={{ width: "100%", height: "100%", display: "grid", placeItems: "center" }}>
          <MonogramChip
            initials={getInitials(peer.name)}
            className={compact ? "w-[34px] h-[34px]" : "w-[64px] h-[64px]"}
            style={{ fontSize: compact ? 13 : 22 }}
          />
        </div>
      )}

      {(showName || peer.muted) && (
        <div
          style={{
            position: "absolute", left: 8, bottom: 8, right: 8,
            display: "flex", alignItems: "center", gap: 6,
            fontSize: 12, color: "var(--cream-on-dark)",
            textShadow: "0 1px 3px var(--ink)",
            pointerEvents: "none",
          }}
        >
          {peer.muted && <MicOff size={12} style={{ flexShrink: 0 }} />}
          {showName && (
            <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {peer.isLocal ? "You" : peer.name.split(" ")[0]}
            </span>
          )}
        </div>
      )}
    </div>
  )
}

export function VideoStage({
  peers,
  selfId,
  facingUser,
}: {
  peers: CallPeer[]
  selfId: string
  /** Only a front-facing camera gets mirrored; the rear one is already the way
   *  the world looks. */
  facingUser: boolean
}) {
  const me = peers.find((p) => p.isLocal || p.identity === selfId)
  const others = peers.filter((p) => p !== me)

  // ── someone is sharing — the screen IS the stage ───────────────────────────
  const sharer = peers.find((p) => p.screen)
  if (sharer) {
    const iAmSharing = sharer === me
    return (
      <div
        style={{
          position: "absolute", inset: 0,
          padding: "calc(env(safe-area-inset-top, 0px) + 72px) 12px 120px",
          display: "flex", flexDirection: "column", gap: 10,
        }}
      >
        <div style={{ flex: 1, minHeight: 0, position: "relative" }}>
          {iAmSharing ? (
            // Deliberately NOT your own screen played back to you. If the thing
            // being shared is the browser window holding this call, a self-view
            // is an infinite corridor of itself — and you can already see your
            // own screen by looking at it.
            <div
              style={{
                width: "100%", height: "100%", borderRadius: 14,
                background: "var(--plum-2)",
                display: "grid", placeItems: "center", textAlign: "center",
                padding: 24,
              }}
            >
              <div>
                <MonitorUp size={30} style={{ color: "var(--cream-on-dark)", opacity: 0.9 }} />
                <div style={{ marginTop: 12, fontSize: 15, color: "var(--cream-on-dark)" }}>
                  You&rsquo;re sharing your screen
                </div>
                <div style={{ marginTop: 4, fontSize: 13, color: "var(--cream-on-dark)", opacity: 0.65 }}>
                  Everyone on the call can see it
                </div>
              </div>
            </div>
          ) : (
            <VideoTile peer={sharer} mirrored={false} compact={false} showName={false} source="screen" />
          )}
          {!iAmSharing && (
            <div
              style={{
                position: "absolute", left: "50%", top: 10, transform: "translateX(-50%)",
                padding: "4px 12px", borderRadius: 999,
                // A dark chip is invisible on a dark stage, and a CONTAINED video
                // is letterboxed — so a corner-anchored label lands in the black
                // margin beside the picture rather than on it. Centred and lightly
                // filled, it reads as a caption for the stage either way.
                background: "color-mix(in srgb, var(--cream-on-dark) 16%, transparent)",
                color: "var(--cream-on-dark)", fontSize: 12,
                whiteSpace: "nowrap", pointerEvents: "none",
              }}
            >
              {sharer.name.split(" ")[0]} is sharing
            </div>
          )}
        </div>

        {/* Faces, demoted to a strip. Still here because a shared screen with no
            people on it is a screen recording, not a call. */}
        <div style={{ display: "flex", justifyContent: "center", gap: 8, height: 84, flexShrink: 0, overflowX: "auto" }}>
          {(me ? [me, ...others] : others).map((p) => (
            <div key={p.identity} style={{ width: 64, flexShrink: 0 }}>
              <VideoTile peer={p} mirrored={p === me && facingUser} compact showName={false} />
            </div>
          ))}
        </div>
      </div>
    )
  }

  // ── 1:1 — them full-bleed, you in the corner ───────────────────────────────
  if (others.length === 1) {
    return (
      <div style={{ position: "absolute", inset: 0 }}>
        <VideoTile peer={others[0]} mirrored={false} compact={false} showName={false} />
        {me && (
          <div
            style={{
              position: "absolute",
              // Clears the status line at the top; the controls own the bottom.
              top: "calc(env(safe-area-inset-top, 0px) + 76px)",
              right: 16,
              width: 96, height: 132,
              boxShadow: "0 2px 10px color-mix(in srgb, var(--ink) 45%, transparent)",
              borderRadius: 12,
              overflow: "hidden",
            }}
          >
            <VideoTile peer={me} mirrored={facingUser} compact showName={false} />
          </div>
        )}
      </div>
    )
  }

  // ── group — one even grid, you included ────────────────────────────────────
  // Columns from a count, not a breakpoint: what makes a face too small is how
  // many are sharing the screen, and that is the same number on any device.
  const all = me ? [me, ...others] : others
  const cols = all.length <= 2 ? 1 : all.length <= 6 ? 2 : 3

  return (
    <div
      style={{
        position: "absolute", inset: 0,
        padding: "calc(env(safe-area-inset-top, 0px) + 72px) 12px 120px",
        display: "grid",
        gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`,
        gap: 8,
        alignContent: "center",
      }}
    >
      {all.map((p) => (
        <div key={p.identity} style={{ aspectRatio: "3 / 4", minHeight: 0 }}>
          <VideoTile peer={p} mirrored={p === me && facingUser} compact={all.length > 4} showName />
        </div>
      ))}
    </div>
  )
}
