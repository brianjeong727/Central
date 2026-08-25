"use client"

// ─── Calls: the ONE client-side call state ───────────────────────────────────
//
// There is at most one call at a time, app-wide, so it lives in one provider at
// the shell root rather than inside the chat screen. That is load-bearing, not
// tidiness: a call has to survive leaving the conversation it started in — you
// answer a call, then go look something up in another tab, and the call keeps
// going. State owned by ChatScreen would die the moment ChatScreen unmounted.
//
// Ringing rides the EXISTING per-chat realtime hub. The `calls` table fires the
// same generic broadcast_chat_change() trigger that messages and reactions use,
// so a new call arrives on the `chat:<group_id>` topic this client is already
// subscribed to for every room it belongs to — no new channel, no new RLS
// surface, and it inherits that hub's reconnect and fallback behaviour for free.
//
// Shape of the surrounding pieces:
//   app/actions/calls.ts        — every mutation (service-role, authorized)
//   lib/livekit.ts              — token minting (server only)
//   lib/ringtone.ts             — the audible ring
//   components/central/call-overlay.tsx / incoming-call.tsx — the UI

import {
  createContext, useCallback, useContext, useEffect, useMemo, useRef, useState,
} from "react"
// TYPE-only: the LiveKit SDK is ~200KB and nothing about it is needed until a
// call actually starts, so the runtime import happens inside connect(). Every
// session pays for the provider; only a session that calls pays for the SDK.
import type { Room, RemoteTrack, Participant, VideoTrack } from "livekit-client"

// The SDK module, captured on first connect. readPeers needs Track.Source at a
// point where it cannot await an import, and a second dynamic import() would be
// a second module instance — the enum identities would not match.
let LK: typeof import("livekit-client") | null = null
import { subscribeChatTopic } from "./chat-broadcast"
import { isNativeShell } from "@/lib/native-auth"
import { createClient } from "@/lib/supabase"
import {
  startCall as startCallAction,
  joinCall as joinCallAction,
  declineCall as declineCallAction,
  leaveCall as leaveCallAction,
} from "@/app/actions/calls"
import * as ring from "@/lib/ringtone"

export type CallKind = "audio" | "video"

/** How long an outgoing call rings before it gives up. Matches the server-side
 *  backstop in app/actions/calls.ts. */
const RING_TIMEOUT_MS = 60_000

export interface CallPeer {
  identity: string
  name: string
  speaking: boolean
  muted: boolean
  /** Their camera, when they have one published and unmuted. The TRACK itself,
   *  not a flag: a <video> can only show a track by being handed the object. */
  video: VideoTrack | null
  /** Their screen, when they are sharing one. Kept separate from `video` because
   *  the two are rendered completely differently — a face is cropped to fill its
   *  tile, a screen must never be cropped at all. */
  screen: VideoTrack | null
  isLocal: boolean
}

export interface ActiveCall {
  callId: string
  groupId: string
  /** What the call is WITH — the other person in a DM, the chat name in a group. */
  title: string
  isDM: boolean
  kind: CallKind
  outgoing: boolean
  status: "connecting" | "ringing" | "active"
  answeredAt: number | null
}

export interface IncomingCall {
  callId: string
  groupId: string
  title: string
  callerName: string
  isDM: boolean
  kind: CallKind
}

export interface LiveCallInfo {
  callId: string
  kind: CallKind
  startedBy: string
}

interface CallApi {
  active: ActiveCall | null
  incoming: IncomingCall | null
  /** Chats that currently have a call running, keyed by group id. Fed by the
   *  same broadcast feed as the ring, so any chat surface can show a "join the
   *  call" affordance without polling. Seeded per-chat via noteLiveCall(). */
  liveCalls: Record<string, LiveCallInfo>
  noteLiveCall: (groupId: string, info: LiveCallInfo | null) => void
  peers: CallPeer[]
  micOn: boolean
  camOn: boolean
  screenOn: boolean
  /** Whether this browser can capture a screen AT ALL. getDisplayMedia is
   *  desktop-only — no iOS Safari, no Android Chrome — so the control is hidden
   *  rather than offered and then failing. */
  canShareScreen: boolean
  /** Which way your own camera points — the self-view mirrors only for the front
   *  one, since the rear camera already shows the world the right way round. */
  facingUser: boolean
  /** Set when the browser refuses to play audio until the user asks it to. */
  needsAudioUnlock: boolean
  error: string | null
  start: (groupId: string, opts: { title: string; isDM: boolean; kind?: CallKind }) => Promise<void>
  accept: () => Promise<void>
  decline: () => Promise<void>
  hangUp: () => Promise<void>
  toggleMic: () => Promise<void>
  toggleCamera: () => Promise<void>
  toggleScreenShare: () => Promise<void>
  /** Front/back on a phone. No-op where there is only one camera. */
  flipCamera: () => Promise<void>
  unlockAudio: () => Promise<void>
  dismissError: () => void
}

const Ctx = createContext<CallApi | null>(null)

/** Always safe to call — returns an inert API when no provider is mounted, so a
 *  component can offer a call button without knowing where it renders. */
export function useCall(): CallApi {
  return useContext(Ctx) ?? INERT
}

const INERT: CallApi = {
  active: null, incoming: null, liveCalls: {}, noteLiveCall: () => {},
  peers: [], micOn: false, camOn: false, screenOn: false, canShareScreen: false,
  facingUser: true, needsAudioUnlock: false, error: null,
  start: async () => {}, accept: async () => {}, decline: async () => {}, hangUp: async () => {},
  toggleMic: async () => {}, toggleCamera: async () => {}, toggleScreenShare: async () => {},
  flipCamera: async () => {},
  unlockAudio: async () => {}, dismissError: () => {},
}

interface CallRecord {
  id: string
  group_id: string
  started_by: string
  kind: string
  status: string
}

export function CallProvider({
  userId,
  memberGroupKey,
  children,
}: {
  userId: string
  /** Sorted comma-joined ids of every chat the user belongs to. Same key
   *  home-app uses to scope its own subscriptions; changes only when the SET
   *  changes, so this effect does not churn. */
  memberGroupKey: string
  children: React.ReactNode
}) {
  const supabase = useMemo(() => createClient(), [])

  // Calling is OFF inside the installed native shell, and this is the choke
  // point rather than just the button: the ring arrives over realtime whatever
  // the UI offers, and answering one calls getUserMedia. The shipped binary has
  // no microphone usage string, and iOS TERMINATES an app that reaches for a
  // TCC-protected resource without one — so a ring the user can answer is a
  // crash. The plist and manifest changes are committed but only reach a device
  // in a NEW BINARY; a web deploy cannot carry them. Delete this with the build
  // that ships them.
  const blocked = useMemo(() => isNativeShell(), [])

  // Feature-detected rather than sniffed: if iOS ever ships getDisplayMedia the
  // button simply starts appearing, with nothing to remember to change.
  const canShareScreen = useMemo(
    () => typeof navigator !== "undefined" &&
      typeof navigator.mediaDevices?.getDisplayMedia === "function",
    [],
  )

  const [active, setActive] = useState<ActiveCall | null>(null)
  const [incoming, setIncoming] = useState<IncomingCall | null>(null)
  const [liveCalls, setLiveCalls] = useState<Record<string, LiveCallInfo>>({})
  const [peers, setPeers] = useState<CallPeer[]>([])
  const [micOn, setMicOn] = useState(true)
  const [camOn, setCamOn] = useState(false)
  const [screenOn, setScreenOn] = useState(false)
  const [facingUser, setFacingUser] = useState(true)
  const facing = useRef<"user" | "environment">("user")
  const [needsAudioUnlock, setNeedsAudioUnlock] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const roomRef = useRef<Room | null>(null)
  const audioHost = useRef<HTMLDivElement | null>(null)
  const ringTimeout = useRef<ReturnType<typeof setTimeout> | null>(null)
  // Read inside realtime callbacks, which close over their first render.
  const activeRef = useRef<ActiveCall | null>(null)
  const incomingRef = useRef<IncomingCall | null>(null)
  activeRef.current = active
  incomingRef.current = incoming

  // ── audio sink ─────────────────────────────────────────────────────────────
  // Remote audio elements are parked in a detached, hidden host rather than
  // rendered through React: their lifecycle is the track's, not a component's,
  // and re-rendering must never detach a live <audio> mid-sentence.
  useEffect(() => {
    const host = document.createElement("div")
    host.style.display = "none"
    host.setAttribute("data-call-audio", "")
    document.body.appendChild(host)
    audioHost.current = host
    return () => { host.remove(); audioHost.current = null }
  }, [])

  const noteLiveCall = useCallback((groupId: string, info: LiveCallInfo | null) => {
    setLiveCalls((m) => {
      if (!info) {
        if (!(groupId in m)) return m
        const next = { ...m }
        delete next[groupId]
        return next
      }
      if (m[groupId]?.callId === info.callId) return m
      return { ...m, [groupId]: info }
    })
  }, [])

  const teardown = useCallback(() => {
    ring.stop()
    if (ringTimeout.current) { clearTimeout(ringTimeout.current); ringTimeout.current = null }
    const room = roomRef.current
    roomRef.current = null
    if (room) { try { room.disconnect() } catch { /* already gone */ } }
    if (audioHost.current) audioHost.current.replaceChildren()
    setActive(null)
    setPeers([])
    setMicOn(true)
    setCamOn(false)
    setScreenOn(false)
    facing.current = "user"
    setFacingUser(true)
    setNeedsAudioUnlock(false)
  }, [])

  useEffect(() => () => { teardown() }, [teardown])

  const readPeers = useCallback((room: Room) => {
    const all: Participant[] = [room.localParticipant, ...Array.from(room.remoteParticipants.values())]
    const cam = LK?.Track.Source.Camera
    const scr = LK?.Track.Source.ScreenShare
    setPeers(
      all.map((p) => {
        // A muted camera publication still exists — it just has nothing to show.
        // Treating it as "no video" is what makes the tile fall back to the
        // monogram instead of holding a frozen last frame.
        const pub = cam ? p.getTrackPublication(cam) : undefined
        const video = pub && !pub.isMuted ? (pub.videoTrack ?? null) : null
        const spub = scr ? p.getTrackPublication(scr) : undefined
        const screen = spub && !spub.isMuted ? (spub.videoTrack ?? null) : null
        return {
          identity: p.identity,
          name: p.name || "Someone",
          speaking: p.isSpeaking,
          muted: !p.isMicrophoneEnabled,
          video: video ?? null,
          screen: screen ?? null,
          isLocal: p === room.localParticipant,
        }
      }),
    )
  }, [])

  /** Connect to the LiveKit room and wire every event we render from. */
  const connect = useCallback(
    async (url: string, token: string, kind: CallKind) => {
      LK = await import("livekit-client")
      const { Room, RoomEvent, Track } = LK
      const room = new Room({ adaptiveStream: true, dynacast: true })
      roomRef.current = room

      room
        .on(RoomEvent.TrackSubscribed, (track: RemoteTrack) => {
          // Audio is attached by hand into a detached host, deliberately outside
          // React: an <audio> element's lifetime is the track's, and a re-render
          // must never be able to detach one mid-sentence. VIDEO is the opposite
          // — it has to live in the layout — so it goes through readPeers and is
          // attached by the tile that renders it.
          if (track.kind !== Track.Kind.Audio) { readPeers(room); return }
          const el = track.attach()
          el.autoplay = true
          audioHost.current?.appendChild(el)
        })
        .on(RoomEvent.TrackUnsubscribed, (track: RemoteTrack) => {
          if (track.kind !== Track.Kind.Audio) { readPeers(room); return }
          track.detach().forEach((el) => el.remove())
        })
        .on(RoomEvent.TrackPublished, () => readPeers(room))
        .on(RoomEvent.TrackUnpublished, () => readPeers(room))
        .on(RoomEvent.LocalTrackUnpublished, () => {
          // The browser has its own "Stop sharing" bar, and it is the one most
          // people actually use. Reading the state back off the room is what
          // keeps our button from claiming a share that already ended.
          setScreenOn(room.localParticipant.isScreenShareEnabled)
          readPeers(room)
        })
        .on(RoomEvent.ParticipantConnected, () => {
          // Someone picked up — stop the ringback and start counting.
          ring.stop()
          if (ringTimeout.current) { clearTimeout(ringTimeout.current); ringTimeout.current = null }
          setActive((c) => (c ? { ...c, status: "active", answeredAt: c.answeredAt ?? Date.now() } : c))
          readPeers(room)
        })
        .on(RoomEvent.ParticipantDisconnected, () => readPeers(room))
        .on(RoomEvent.ActiveSpeakersChanged, () => readPeers(room))
        .on(RoomEvent.TrackMuted, () => readPeers(room))
        .on(RoomEvent.TrackUnmuted, () => readPeers(room))
        .on(RoomEvent.LocalTrackPublished, () => readPeers(room))
        .on(RoomEvent.AudioPlaybackStatusChanged, () => setNeedsAudioUnlock(!room.canPlaybackAudio))
        .on(RoomEvent.Disconnected, () => { teardown() })

      await room.connect(url, token)
      await room.localParticipant.setMicrophoneEnabled(true)
      setMicOn(true)
      if (kind === "video") {
        await room.localParticipant.setCameraEnabled(true, { facingMode: facing.current })
        setCamOn(true)
      }
      setNeedsAudioUnlock(!room.canPlaybackAudio)
      readPeers(room)

      // Joining a room that already has people in it IS an answered call.
      if (room.remoteParticipants.size > 0) {
        ring.stop()
        setActive((c) => (c ? { ...c, status: "active", answeredAt: c.answeredAt ?? Date.now() } : c))
      }
      return room
    },
    [readPeers, teardown],
  )

  // ── start ──────────────────────────────────────────────────────────────────
  const start = useCallback(
    async (groupId: string, opts: { title: string; isDM: boolean; kind?: CallKind }) => {
      if (blocked || activeRef.current) return
      const kind = opts.kind ?? "audio"
      ring.primeAudio()
      setActive({
        callId: "", groupId, title: opts.title, isDM: opts.isDM, kind,
        outgoing: true, status: "connecting", answeredAt: null,
      })

      const res = await startCallAction(groupId, kind)
      if ("error" in res && res.error) {
        setActive(null)
        setError(res.error)
        return
      }
      const s = res as Exclude<typeof res, { error: string }>

      setActive({
        callId: s.callId, groupId, title: opts.title, isDM: opts.isDM, kind,
        outgoing: !s.joinedExisting,
        status: s.joinedExisting ? "active" : "ringing",
        answeredAt: s.joinedExisting ? Date.now() : null,
      })

      try {
        await connect(s.url, s.token, kind)
      } catch {
        setError(kind === "video"
          ? "Couldn't reach the call. Check your camera and microphone permissions."
          : "Couldn't reach the call. Check your microphone permission.")
        await leaveCallAction(s.callId, "cancelled").catch(() => {})
        teardown()
        return
      }

      if (!s.joinedExisting) {
        ring.startRingback()
        ringTimeout.current = setTimeout(() => {
          const cur = activeRef.current
          if (cur && cur.status !== "active") {
            void leaveCallAction(cur.callId, "missed").catch(() => {})
            teardown()
          }
        }, RING_TIMEOUT_MS)
      }
    },
    [connect, teardown, blocked],
  )

  // ── answer / decline ───────────────────────────────────────────────────────
  const accept = useCallback(async () => {
    const call = incomingRef.current
    if (blocked || !call) return
    ring.stop()
    setIncoming(null)
    setActive({
      callId: call.callId, groupId: call.groupId, title: call.title, isDM: call.isDM,
      kind: call.kind, outgoing: false, status: "connecting", answeredAt: null,
    })

    const res = await joinCallAction(call.callId)
    if ("error" in res && res.error) {
      setActive(null)
      setError(res.error)
      return
    }
    const s = res as Exclude<typeof res, { error: string }>
    setActive((c) => (c ? { ...c, status: "active", answeredAt: Date.now() } : c))
    try {
      await connect(s.url, s.token, call.kind)
    } catch {
      setError(call.kind === "video"
        ? "Couldn't join the call. Check your camera and microphone permissions."
        : "Couldn't join the call. Check your microphone permission.")
      await leaveCallAction(s.callId).catch(() => {})
      teardown()
    }
  }, [connect, teardown, blocked])

  const decline = useCallback(async () => {
    const call = incomingRef.current
    if (!call) return
    ring.stop()
    setIncoming(null)
    await declineCallAction(call.callId).catch(() => {})
  }, [])

  const hangUp = useCallback(async () => {
    const call = activeRef.current
    teardown()
    if (call?.callId) {
      await leaveCallAction(call.callId, call.status === "active" ? "completed" : "cancelled").catch(() => {})
    }
  }, [teardown])

  const toggleMic = useCallback(async () => {
    const room = roomRef.current
    if (!room) return
    const next = !room.localParticipant.isMicrophoneEnabled
    await room.localParticipant.setMicrophoneEnabled(next)
    setMicOn(next)
  }, [])

  const toggleCamera = useCallback(async () => {
    const room = roomRef.current
    if (!room) return
    const next = !room.localParticipant.isCameraEnabled
    await room.localParticipant.setCameraEnabled(next, next ? { facingMode: facing.current } : undefined)
    setCamOn(next)
    readPeers(room)
  }, [readPeers])

  /** Flip front/back by REPUBLISHING with the other facingMode rather than
   *  switching device ids: on a phone the useful axis is which way the camera
   *  points, and enumerateDevices labels are unreliable (and empty until a
   *  permission has already been granted). */
  const flipCamera = useCallback(async () => {
    const room = roomRef.current
    if (!room || !room.localParticipant.isCameraEnabled) return
    facing.current = facing.current === "user" ? "environment" : "user"
    setFacingUser(facing.current === "user")
    try {
      await room.localParticipant.setCameraEnabled(false)
      await room.localParticipant.setCameraEnabled(true, { facingMode: facing.current })
    } catch {
      // Single-camera device: put the original back rather than leaving the
      // call with no picture at all.
      facing.current = facing.current === "user" ? "environment" : "user"
      setFacingUser(facing.current === "user")
      await room.localParticipant.setCameraEnabled(true, { facingMode: facing.current }).catch(() => {})
    }
    readPeers(room)
  }, [readPeers])

  const toggleScreenShare = useCallback(async () => {
    const room = roomRef.current
    if (!room) return
    const next = !room.localParticipant.isScreenShareEnabled
    try {
      // audio: true carries the tab's sound, so a shared clip or song is not
      // silent for everyone watching it.
      await room.localParticipant.setScreenShareEnabled(next, { audio: true })
    } catch {
      // The picker was dismissed, or the OS refused. Not an error worth a toast:
      // the person pressed a button and then changed their mind.
    }
    setScreenOn(room.localParticipant.isScreenShareEnabled)
    readPeers(room)
  }, [readPeers])

  const unlockAudio = useCallback(async () => {
    const room = roomRef.current
    if (!room) return
    try { await room.startAudio(); setNeedsAudioUnlock(!room.canPlaybackAudio) } catch { /* still blocked */ }
  }, [])

  // ── the ring feed ──────────────────────────────────────────────────────────
  useEffect(() => {
    if (blocked || !userId || !memberGroupKey) return
    const groupIds = memberGroupKey.split(",").filter(Boolean)

    const onCall = async (rec: CallRecord) => {
      // Someone ended a call I am in or being rung by.
      if (rec.status === "ended") {
        noteLiveCall(rec.group_id, null)
        if (activeRef.current?.callId === rec.id) teardown()
        if (incomingRef.current?.callId === rec.id) { ring.stop(); setIncoming(null) }
        return
      }
      noteLiveCall(rec.group_id, {
        callId: rec.id,
        kind: (rec.kind as CallKind) ?? "audio",
        startedBy: rec.started_by,
      })
      if (rec.started_by === userId) return          // my own call, already handled
      if (activeRef.current || incomingRef.current) return  // already busy
      if (rec.status !== "ringing") return           // a group call already in progress doesn't ring

      // The broadcast payload is the raw row, so it has no display copy. Two
      // small reads, both RLS-checked by membership.
      const [{ data: group }, { data: caller }] = await Promise.all([
        supabase.from("groups").select("name, type").eq("id", rec.group_id).maybeSingle(),
        supabase.from("profiles").select("name").eq("id", rec.started_by).maybeSingle(),
      ])
      if (!group) return
      const isDM = group.type === "dm"
      const callerName = caller?.name || "Someone"

      ring.startRing()
      setIncoming({
        callId: rec.id,
        groupId: rec.group_id,
        // A DM's stored name is generated; the person calling IS the title.
        title: isDM ? callerName : group.name || "Chat",
        callerName,
        isDM,
        kind: (rec.kind as CallKind) ?? "audio",
      })
    }

    const unsubs = groupIds.map((gid) =>
      subscribeChatTopic(gid, (e) => {
        if (e.table !== "calls" || !e.record) return
        if (e.operation === "INSERT" || e.operation === "UPDATE") {
          void onCall(e.record as unknown as CallRecord)
        }
      }),
    )

    // Catch up on anything already live. A broadcast is never replayed, so a call
    // that started while this client was booting — or during the handshake that
    // joins these topics — would otherwise be invisible: the phone would sit
    // silent through a call that is genuinely ringing for everyone else. One
    // query, RLS-scoped to rooms the user belongs to.
    let cancelled = false
    void (async () => {
      const { data } = await supabase
        .from("calls")
        .select("id, group_id, started_by, kind, status")
        .in("group_id", groupIds)
        .neq("status", "ended")
      if (cancelled) return
      for (const rec of (data ?? []) as CallRecord[]) void onCall(rec)
    })()

    return () => { cancelled = true; unsubs.forEach((u) => u()) }
  }, [blocked, userId, memberGroupKey, supabase, teardown, noteLiveCall])

  // An unanswered incoming ring gives up on its own, so a missed call does not
  // leave a ringing screen the user has to dismiss.
  useEffect(() => {
    if (!incoming) return
    const t = setTimeout(() => { ring.stop(); setIncoming(null) }, RING_TIMEOUT_MS)
    return () => clearTimeout(t)
  }, [incoming])

  const api = useMemo<CallApi>(
    () => ({
      active, incoming, liveCalls, noteLiveCall, peers, micOn, camOn, screenOn, canShareScreen,
      facingUser, needsAudioUnlock, error,
      start, accept, decline, hangUp, toggleMic, toggleCamera, toggleScreenShare, flipCamera, unlockAudio,
      dismissError: () => setError(null),
    }),
    [active, incoming, liveCalls, noteLiveCall, peers, micOn, camOn, screenOn, canShareScreen,
     facingUser, needsAudioUnlock, error, start, accept, decline, hangUp, toggleMic, toggleCamera,
     toggleScreenShare, flipCamera, unlockAudio],
  )

  return <Ctx.Provider value={api}>{children}</Ctx.Provider>
}
