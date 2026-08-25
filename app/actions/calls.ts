"use server"

// ─── Call lifecycle — the ONE write path for `calls` / `call_participants` ────
//
// Both tables are SELECT-only for `authenticated` (see the calls migration), so
// every mutation lands here and runs through the service-role client after an
// explicit authorization check. That is the chat_nicknames pattern, and it is
// what lets the DB stay simple: there is no client-writable state to defend, so
// the interesting rules (who may start a call, when a call ends) live in one
// readable place instead of being smeared across RLS policies.
//
// The gates mirror app/home/chat-permissions.ts (`canStartCall` / `canJoinCall`)
// and the SQL helper auth_can_start_call(). Three copies of one rule is two too
// many, but the alternatives are worse: the UI needs it to decide what to render,
// the action needs it because the UI cannot be trusted, and SQL needs it so a
// future client write path cannot bypass the action. They are kept adjacent and
// commented so a change to one is a visible change to all three.

import { createAdminClient } from "@/lib/supabase-admin"
import { createClient } from "@/lib/supabase-server"
import { isLeaderRole } from "@/lib/roles"
import { mintCallToken, callRoomName, livekitConfigured, type CallKind } from "@/lib/livekit"
import { finalizeCall, RING_TIMEOUT_MS } from "@/lib/call-lifecycle"

type Admin = ReturnType<typeof createAdminClient>

export interface CallSession {
  callId: string
  groupId: string
  roomName: string
  kind: CallKind
  status: "ringing" | "active" | "ended"
  startedBy: string
  startedAt: string
  token: string
  url: string
  /** True when startCall joined a call that was already running rather than
   *  creating one — the UI skips the "calling…" state and goes straight in. */
  joinedExisting: boolean
}

type Fail = { error: string }
type Ok<T> = T & { error?: never }

// ─── shared helpers ──────────────────────────────────────────────────────────

interface GroupRow {
  id: string
  ministry_id: string
  type: string
  archived: boolean | null
  name: string | null
}

async function loadGroup(admin: Admin, groupId: string): Promise<GroupRow | null> {
  const { data } = await admin
    .from("groups")
    .select("id, ministry_id, type, archived, name")
    .eq("id", groupId)
    .maybeSingle()
  return (data as GroupRow | null) ?? null
}

/**
 * The acting user, WITHOUT requiring them to have a ministry.
 *
 * requireMinistryMember() denies anyone whose profiles.ministry_id is NULL, and
 * there are real accounts in that state (mid-join, mid-transfer) that still hold
 * chat memberships. Because a ring travels over chat membership, those people
 * would hear a call ring and then be told "No ministry found" when they tried to
 * answer it. Membership of the chat is the boundary everywhere else in this file
 * — messages works the same way — so it is the boundary here too. Every action
 * below still checks isMemberOf() before it does anything.
 */
async function caller(): Promise<{ userId: string; role: string } | null> {
  const supabase = await createClient()
  const { data: { user }, error } = await supabase.auth.getUser()
  if (error || !user) return null
  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle()
  return { userId: user.id, role: (profile?.role ?? "").toLowerCase() }
}

async function isMemberOf(admin: Admin, groupId: string, userId: string): Promise<boolean> {
  const { data } = await admin
    .from("group_members")
    .select("user_id")
    .eq("group_id", groupId)
    .eq("user_id", userId)
    .maybeSingle()
  return !!data
}

/**
 * The start-a-call gate, asked of the DATABASE rather than re-implemented here.
 *
 * can_start_call() takes the user explicitly on purpose: the service-role
 * connection this action writes on has no `auth.uid()`, so the JWT-context
 * wrapper auth_can_start_call() would return false for every caller. Asking the
 * DB means the gate has one definition even though it is READ from three places
 * (this action, the SQL helper, and chatCapabilities() for rendering).
 */
async function mayStart(admin: Admin, groupId: string, userId: string): Promise<boolean> {
  const { data, error } = await admin.rpc("can_start_call", {
    p_group_id: groupId,
    p_user_id: userId,
  })
  if (error) return false
  return data === true
}

/** The live call for a chat, if any — after retiring one that rang unanswered
 *  past the timeout. Returns null when the chat is free to host a new call. */
async function liveCall(admin: Admin, groupId: string) {
  const { data } = await admin
    .from("calls")
    .select("id, group_id, ministry_id, room_name, kind, status, started_by, started_at, answered_at")
    .eq("group_id", groupId)
    .neq("status", "ended")
    .maybeSingle()
  if (!data) return null

  const stale =
    data.status === "ringing" && Date.now() - new Date(data.started_at).getTime() > RING_TIMEOUT_MS
  if (stale) {
    await finalizeCall(admin, data.id, "missed")
    return null
  }
  return data
}

async function credentialsFor(
  roomName: string,
  userId: string,
  kind: CallKind,
  admin: Admin,
): Promise<{ token: string; url: string }> {
  const { data: profile } = await admin.from("profiles").select("name").eq("id", userId).maybeSingle()
  return mintCallToken({
    roomName,
    identity: userId,
    name: profile?.name || "Someone",
    kind,
  })
}

// ─── actions ─────────────────────────────────────────────────────────────────

/** Is calling available in this deployment at all? Lets the UI hide every call
 *  affordance when LiveKit is unconfigured instead of failing on press. */
export async function callingAvailable(): Promise<boolean> {
  return livekitConfigured()
}

/**
 * Start a call in a chat — or join the one already running there.
 *
 * Returning the live call instead of erroring is deliberate: two people pressing
 * call at the same moment is a normal thing to do, and "you are now both in the
 * same room" is the only outcome either of them wanted. The partial unique index
 * calls_one_live_per_group makes that race resolve in the database rather than
 * in a check-then-insert window.
 */
export async function startCall(
  groupId: string,
  kind: CallKind = "audio",
): Promise<Ok<CallSession> | Fail> {
  if (!livekitConfigured()) return { error: "Calling isn't set up yet." }

  const ctx = await caller()
  if (!ctx) return { error: "Not authenticated." }

  const admin = createAdminClient()
  const group = await loadGroup(admin, groupId)
  if (!group) return { error: "Not authorized." }

  // Membership of the chat — NOT profiles.ministry_id — is the boundary here,
  // mirroring the messages SELECT policy and the realtime chat-topic policy.
  // Central has live members of chats outside their own ministry; gating on the
  // caller's ministry would let them hear the ring and then fail to join.
  if (!(await isMemberOf(admin, groupId, ctx.userId))) return { error: "Not authorized." }

  const existing = await liveCall(admin, groupId)
  if (existing) return joinCall(existing.id)

  // The one product rule the SQL gate deliberately does not carry: a DM whose
  // other side is a scrubbed tombstone has nobody on the end of it. The UI hides
  // the button; this stops a direct action call from ringing into the void.
  if (group.type === "dm") {
    const { data: others } = await admin
      .from("group_members")
      .select("user_id, profiles!user_id(deleted_at)")
      .eq("group_id", groupId)
      .neq("user_id", ctx.userId)
    const partnerGone = ((others ?? []) as unknown as { profiles: { deleted_at: string | null } | null }[])
      .some((o) => !!o.profiles?.deleted_at)
    if (partnerGone) return { error: "That account was deleted." }
  }

  if (!(await mayStart(admin, groupId, ctx.userId))) {
    return {
      error:
        group.type === "church"
          ? "Only leaders can start a call in a church chat."
          : "Not authorized.",
    }
  }

  const callId = crypto.randomUUID()
  const roomName = callRoomName(callId)
  const { data: created, error: insErr } = await admin
    .from("calls")
    .insert({
      id: callId,
      ministry_id: group.ministry_id,
      group_id: groupId,
      started_by: ctx.userId,
      room_name: roomName,
      kind,
      status: "ringing",
    })
    .select("id, started_at")
    .maybeSingle()

  // 23505 = the one-live-call-per-group index. Someone beat us by milliseconds;
  // join whatever they created.
  if (insErr?.code === "23505") {
    const raced = await liveCall(admin, groupId)
    if (raced) return joinCall(raced.id)
    return { error: "Couldn't start the call." }
  }
  if (insErr || !created) return { error: "Couldn't start the call." }

  // The caller is in the room from the moment it exists — they are the one
  // waiting, and a call with nobody in it has nothing to answer.
  //
  // The error is checked rather than ignored because this row is what leaveCall
  // counts. If it silently went missing, `stillIn` would be 0 for everyone and
  // the FIRST person to hang up would end a group call for the whole room.
  const { error: partErr } = await admin.from("call_participants").insert({
    call_id: callId,
    user_id: ctx.userId,
    group_id: groupId,
    ministry_id: group.ministry_id,
    state: "joined",
    joined_at: new Date().toISOString(),
  })
  if (partErr) {
    await finalizeCall(admin, callId, "failed")
    return { error: "Couldn't start the call." }
  }

  const creds = await credentialsFor(roomName, ctx.userId, kind, admin)
  return {
    callId,
    groupId,
    roomName,
    kind,
    status: "ringing",
    startedBy: ctx.userId,
    startedAt: created.started_at,
    joinedExisting: false,
    ...creds,
  }
}

/** Answer, or walk into a call already in progress. Needs only membership —
 *  see the asymmetry note in chat-permissions.ts. */
export async function joinCall(callId: string): Promise<Ok<CallSession> | Fail> {
  if (!livekitConfigured()) return { error: "Calling isn't set up yet." }

  const ctx = await caller()
  if (!ctx) return { error: "Not authenticated." }

  const admin = createAdminClient()
  const { data: call } = await admin
    .from("calls")
    .select("id, group_id, ministry_id, room_name, kind, status, started_by, started_at")
    .eq("id", callId)
    .maybeSingle()
  if (!call) return { error: "Not authorized." }
  if (call.status === "ended") return { error: "That call already ended." }
  if (!(await isMemberOf(admin, call.group_id, ctx.userId))) return { error: "Not authorized." }

  const now = new Date().toISOString()
  await admin.from("call_participants").upsert(
    {
      call_id: callId,
      user_id: ctx.userId,
      group_id: call.group_id,
      ministry_id: call.ministry_id,
      state: "joined",
      joined_at: now,
      left_at: null,
    },
    { onConflict: "call_id,user_id" },
  )

  // First answer flips the call live. Guarded on status so a third person
  // joining an established call doesn't rewrite answered_at and shorten the
  // duration the summary line reports.
  if (call.status === "ringing" && ctx.userId !== call.started_by) {
    await admin
      .from("calls")
      .update({ status: "active", answered_at: now })
      .eq("id", callId)
      .eq("status", "ringing")
  }

  const creds = await credentialsFor(call.room_name, ctx.userId, call.kind as CallKind, admin)
  return {
    callId,
    groupId: call.group_id,
    roomName: call.room_name,
    kind: call.kind as CallKind,
    status: call.status === "ringing" ? "active" : (call.status as "active"),
    startedBy: call.started_by,
    startedAt: call.started_at,
    joinedExisting: true,
    ...creds,
  }
}

/**
 * Decline a ringing call.
 *
 * In a two-person chat that ends the call — there is nobody else it could still
 * be for. In a group it only silences YOUR ring: the others are still talking,
 * and hanging up on them because one person is busy would be wrong.
 */
export async function declineCall(callId: string): Promise<{ ok: true } | Fail> {
  const ctx = await caller()
  if (!ctx) return { error: "Not authenticated." }

  const admin = createAdminClient()
  const { data: call } = await admin
    .from("calls")
    .select("id, group_id, ministry_id, status")
    .eq("id", callId)
    .maybeSingle()
  if (!call) return { error: "Not authorized." }
  if (!(await isMemberOf(admin, call.group_id, ctx.userId))) return { error: "Not authorized." }

  await admin.from("call_participants").upsert(
    {
      call_id: callId,
      user_id: ctx.userId,
      group_id: call.group_id,
      ministry_id: call.ministry_id,
      state: "declined",
      left_at: new Date().toISOString(),
    },
    { onConflict: "call_id,user_id" },
  )

  const { count } = await admin
    .from("group_members")
    .select("user_id", { count: "exact", head: true })
    .eq("group_id", call.group_id)
  if ((count ?? 0) <= 2) await finalizeCall(admin, callId, "declined")

  return { ok: true }
}

/**
 * Hang up. Ends the call outright in a two-person chat, or when you were the
 * last one still in it; otherwise the room keeps going without you.
 *
 * `reason` lets the caller's own client report an unanswered ring as missed
 * rather than completed, which is what the in-chat summary line reads from.
 */
export async function leaveCall(
  callId: string,
  reason: "completed" | "missed" | "cancelled" = "completed",
): Promise<{ ok: true; ended: boolean } | Fail> {
  const ctx = await caller()
  if (!ctx) return { error: "Not authenticated." }

  const admin = createAdminClient()
  const { data: call } = await admin
    .from("calls")
    .select("id, group_id, ministry_id, status, started_by, answered_at")
    .eq("id", callId)
    .maybeSingle()
  if (!call) return { error: "Not authorized." }
  if (!(await isMemberOf(admin, call.group_id, ctx.userId))) return { error: "Not authorized." }
  if (call.status === "ended") return { ok: true, ended: true }

  await admin
    .from("call_participants")
    .update({ state: "left", left_at: new Date().toISOString() })
    .eq("call_id", callId)
    .eq("user_id", ctx.userId)

  const { count: memberCount } = await admin
    .from("group_members")
    .select("user_id", { count: "exact", head: true })
    .eq("group_id", call.group_id)
  const { count: stillIn } = await admin
    .from("call_participants")
    .select("user_id", { count: "exact", head: true })
    .eq("call_id", callId)
    .eq("state", "joined")

  // A ringing call the starter abandons is a cancelled call, however it is
  // labelled by the client — nobody ever picked up.
  const unanswered = !call.answered_at
  const shouldEnd = (memberCount ?? 0) <= 2 || (stillIn ?? 0) === 0

  if (shouldEnd) {
    await finalizeCall(admin, callId, unanswered ? (reason === "completed" ? "missed" : reason) : "completed")
    return { ok: true, ended: true }
  }
  return { ok: true, ended: false }
}

/** End the call for everyone. The person who started it, or any leader in the
 *  chat — the same shape as church-chat moderation. */
export async function endCallForAll(callId: string): Promise<{ ok: true } | Fail> {
  const ctx = await caller()
  if (!ctx) return { error: "Not authenticated." }

  const admin = createAdminClient()
  const { data: call } = await admin
    .from("calls")
    .select("id, group_id, ministry_id, started_by")
    .eq("id", callId)
    .maybeSingle()
  if (!call) return { error: "Not authorized." }
  if (!(await isMemberOf(admin, call.group_id, ctx.userId))) return { error: "Not authorized." }
  if (call.started_by !== ctx.userId && !isLeaderRole(ctx.role)) return { error: "Not authorized." }

  await finalizeCall(admin, callId, "completed")
  return { ok: true }
}

/** The live call in a chat, for rendering the "join the call in progress" bar.
 *  Read-only and membership-checked; returns no credentials. */
export async function getLiveCall(
  groupId: string,
): Promise<{ callId: string; startedBy: string; kind: CallKind; status: string } | null> {
  const ctx = await caller()
  if (!ctx) return null

  const admin = createAdminClient()
  if (!(await isMemberOf(admin, groupId, ctx.userId))) return null
  const call = await liveCall(admin, groupId)
  if (!call) return null
  return {
    callId: call.id,
    startedBy: call.started_by,
    kind: call.kind as CallKind,
    status: call.status,
  }
}
