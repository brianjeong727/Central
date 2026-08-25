// ─── LiveKit: the ONE server-side token/config layer ─────────────────────────
//
// Central's calls run on a LiveKit SFU rather than raw peer-to-peer WebRTC. The
// reason is the roadmap, not this phase: 1:1 audio is easy either way, but group
// video and screen sharing make every peer upload a copy of its stream to every
// other peer, which stops working around four people. Routing through an SFU
// from day one means phase 2 (video) and phase 3 (screen share) are extra track
// sources on this same path instead of a rewrite.
//
// SERVER ONLY. The API secret signs join tokens — a client that held it could
// mint itself a token for any room in the project, including chats it is not a
// member of. Nothing here may be imported from a client component.
//
// Env (all server-side, no NEXT_PUBLIC_ counterpart on purpose):
//   LIVEKIT_API_KEY     — project API key
//   LIVEKIT_API_SECRET  — project API secret (signs the JWT)
//   LIVEKIT_URL         — wss://<project>.livekit.cloud
//
// The URL is handed back to the browser alongside each minted token rather than
// exposed as a public env var: it keeps the client with exactly one source for
// "where do I connect", and it means the project can move (or go regional, or
// self-host) without a rebuild.

import "server-only"

import { AccessToken, TrackSource } from "livekit-server-sdk"

/** How long a freshly minted join token stays usable. This bounds the window to
 *  CONNECT, not the call: LiveKit keeps an established session alive after the
 *  token expires. Generous enough to survive a long ring plus a tunnel. */
const TOKEN_TTL = "2h"

export type CallKind = "audio" | "video"

export interface CallCredentials {
  token: string
  url: string
}

function env(name: string): string | null {
  const v = process.env[name]
  return v && v.trim() ? v.trim() : null
}

/** Is calling wired up in this environment? The UI hides call affordances when
 *  it is not, so a missing key reads as "this build has no calling" rather than
 *  a button that fails when pressed. */
export function livekitConfigured(): boolean {
  return !!(env("LIVEKIT_API_KEY") && env("LIVEKIT_API_SECRET") && env("LIVEKIT_URL"))
}

/**
 * Mint a join token for one participant in one room.
 *
 * `identity` is the Central profile id. LiveKit treats identity as unique within
 * a room and evicts an older session holding the same one, which is exactly the
 * behaviour we want when someone rejoins from a second device or after a crash —
 * they replace themselves instead of appearing twice.
 *
 * Publish permission is granted per SOURCE, not as a blanket `canPublish`. An
 * audio call issues a microphone-only token, so a modified client cannot start
 * publishing camera or screen into a room whose UI has no way to show it. Phase
 * 2 and 3 widen this list; nothing else about the path changes.
 */
export async function mintCallToken(opts: {
  roomName: string
  identity: string
  name: string
  kind: CallKind
}): Promise<CallCredentials> {
  const apiKey = env("LIVEKIT_API_KEY")
  const apiSecret = env("LIVEKIT_API_SECRET")
  const url = env("LIVEKIT_URL")
  if (!apiKey || !apiSecret || !url) throw new Error("livekit-not-configured")

  // Screen share is granted for EVERY call, audio ones included: sharing a
  // screen during a voice call is a normal thing to want, and the grant is not
  // what decides whether it is offered — the browser is. getDisplayMedia is
  // desktop-only, so the control is feature-detected client-side rather than
  // gated here. SCREEN_SHARE_AUDIO rides along so a shared video or song is not
  // silent for everyone watching.
  const sources = [
    TrackSource.MICROPHONE,
    TrackSource.SCREEN_SHARE,
    TrackSource.SCREEN_SHARE_AUDIO,
    ...(opts.kind === "video" ? [TrackSource.CAMERA] : []),
  ]

  const at = new AccessToken(apiKey, apiSecret, {
    identity: opts.identity,
    name: opts.name,
    ttl: TOKEN_TTL,
  })
  at.addGrant({
    room: opts.roomName,
    roomJoin: true,
    canPublish: true,
    canPublishSources: sources,
    canSubscribe: true,
    // Used for in-call side-channel messages (a raised hand, a "you're muted"
    // nudge). Costs nothing to grant and avoids a token change to add one.
    canPublishData: true,
  })

  return { token: await at.toJwt(), url }
}

/** Room names are derived from the call id, never from the chat id: a room is
 *  one CALL, so a new call in the same chat is a new room and can never inherit
 *  a stale participant from the previous one. */
export function callRoomName(callId: string): string {
  return `call-${callId}`
}
