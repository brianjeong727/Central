// Ref-counted private-broadcast topic hub for chat realtime.
//
// The DB fires AFTER INSERT/UPDATE/DELETE triggers on `messages` and
// AFTER INSERT/DELETE triggers on `message_reactions` that call
// realtime.broadcast_changes('chat:'||group_id, …) on a PRIVATE channel.
// realtime.messages RLS authorizes group members for the strict topic format
// `chat:<uuid>`. Every broadcast arrives as an event named by the operation
// (INSERT / UPDATE / DELETE) carrying { operation, schema, table, record, old_record }.
//
// Why a hub instead of each component owning its own channel:
//   home-app subscribes to `chat:{gid}` for ALL of the user's groups (to keep the
//   recent-chats sidebar live), while an open ChatScreen also wants `chat:{openGid}`
//   — the SAME topic on the SAME client socket. Two independent channels on one topic
//   fight realtime-js's per-topic join semantics. This hub keeps AT MOST ONE private
//   channel per `chat:{gid}` topic per client, fans every event out to all registered
//   listeners, and tears the channel down when the last listener leaves.
//
// Scope: the trigger broadcasts every messages INSERT/UPDATE/DELETE and every
// message_reactions INSERT/DELETE on the chat:{group_id} topic, so the hub carries
// all of them — new messages (INSERT), edits + unsends/soft-deletes (UPDATE), hard
// message deletes (DELETE), and reaction add/remove.
//
// Fallback: if a private subscribe errors (auth/RLS during rollout, flaky network),
// the hub falls back to a postgres_changes subscription for that one topic and logs
// once — and keeps RETRYING the private broadcast channel with capped exponential
// backoff (2s → 60s, forever). On a successful re-subscribe the fallback is torn
// down. Without the retry, one join timeout would pin the client to postgres_changes
// permanently — which becomes a silently dead chat once messages/message_reactions
// are dropped from the publication (the planned trim).
// TODO(post-trim): remove the fallback once messages/message_reactions are dropped
// from the postgres_changes publication (conductor owns that deploy step).

import { createClient } from "@/lib/supabase"

type SupabaseLike = ReturnType<typeof createClient>
type RealtimeChannelLike = ReturnType<SupabaseLike["channel"]>

export type ChatBroadcastEvent = {
  operation: "INSERT" | "UPDATE" | "DELETE"
  table: string
  // The new row (INSERT / UPDATE) / null on DELETE.
  record: Record<string, unknown> | null
  // The old row (DELETE) / null on INSERT/UPDATE.
  old_record: Record<string, unknown> | null
}

type Listener = (e: ChatBroadcastEvent) => void

type TopicEntry = {
  channel: RealtimeChannelLike | null
  fallback: RealtimeChannelLike | null
  listeners: Set<Listener>
  mode: "broadcast" | "fallback"
  retryTimer: ReturnType<typeof setTimeout> | null
  retryAttempt: number
}

const topics = new Map<string, TopicEntry>()

// Mode-transition counters — read by debugging/load-test tooling to prove the
// broadcast path holds (a fallback engagement at scale gates the publication trim).
let fallbackEngagements = 0
let broadcastRecoveries = 0
export function chatBroadcastStats() {
  return { fallbackEngagements, broadcastRecoveries, activeTopics: topics.size }
}

// The last access token pushed to the realtime socket. supabase-js re-auths the
// socket automatically on TOKEN_REFRESHED / SIGNED_IN (SupabaseClient wires
// realtime.setAuth into onAuthStateChange), so we only need the INITIAL push here
// for private channels — on a cookie-recovered page load the auto path may never
// fire before the first subscribe, leaving the socket on the anon apikey.
let lastAuthToken: string | null = null

async function ensureRealtimeAuth(supabase: SupabaseLike): Promise<boolean> {
  const { data } = await supabase.auth.getSession()
  const token = data.session?.access_token ?? null
  if (!token) return false
  if (token !== lastAuthToken) {
    lastAuthToken = token
    await supabase.realtime.setAuth(token)
  }
  return true
}

function emit(groupId: string, e: ChatBroadcastEvent) {
  const entry = topics.get(groupId)
  if (!entry) return
  entry.listeners.forEach((l) => {
    try {
      l(e)
    } catch {
      /* a listener throw must never break sibling listeners */
    }
  })
}

function startBroadcast(supabase: SupabaseLike, groupId: string, entry: TopicEntry) {
  const channel = supabase
    .channel(`chat:${groupId}`, { config: { private: true } })
    .on("broadcast", { event: "INSERT" }, (msg) => {
      const p = (msg as { payload?: { table?: string; record?: Record<string, unknown> } }).payload
      if (!p?.table) return
      emit(groupId, { operation: "INSERT", table: p.table, record: p.record ?? null, old_record: null })
    })
    .on("broadcast", { event: "UPDATE" }, (msg) => {
      const p = (msg as { payload?: { table?: string; record?: Record<string, unknown> } }).payload
      if (!p?.table) return
      emit(groupId, { operation: "UPDATE", table: p.table, record: p.record ?? null, old_record: null })
    })
    .on("broadcast", { event: "DELETE" }, (msg) => {
      const p = (msg as { payload?: { table?: string; old_record?: Record<string, unknown> } }).payload
      if (!p?.table) return
      emit(groupId, { operation: "DELETE", table: p.table, record: null, old_record: p.old_record ?? null })
    })
    .subscribe((status) => {
      // Ignore callbacks from a channel whose entry has since been replaced/torn down.
      if (topics.get(groupId) !== entry) return
      if (status === "SUBSCRIBED") {
        // Healthy broadcast. Cancel any pending retry and, if we got here via a
        // retry, retire the fallback.
        if (entry.retryTimer) {
          clearTimeout(entry.retryTimer)
          entry.retryTimer = null
        }
        if (entry.fallback) {
          supabase.removeChannel(entry.fallback)
          entry.fallback = null
          broadcastRecoveries++
          console.info(`[chat-broadcast] chat:${groupId} broadcast recovered — fallback retired`)
        }
        entry.mode = "broadcast"
        entry.retryAttempt = 0
        return
      }
      if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
        if (entry.channel) {
          supabase.removeChannel(entry.channel)
          entry.channel = null
        }
        if (entry.mode === "broadcast") {
          // First failure for this topic: engage the fallback so no events are missed.
          console.warn(`[chat-broadcast] chat:${groupId} broadcast failed (${status}) — falling back to postgres_changes, will retry broadcast`)
          entry.mode = "fallback"
          fallbackEngagements++
          if (entry.listeners.size > 0) startFallback(supabase, groupId, entry)
        }
        // Whether first failure or a failed retry: keep trying the private channel.
        scheduleBroadcastRetry(supabase, groupId, entry)
      }
    })
  entry.channel = channel
}

// Capped exponential backoff (2s, 4s, 8s, … 60s), retrying forever while listeners
// remain. Guards mirror the initial-subscribe generation guard so a torn-down or
// replaced entry never resurrects a channel.
function scheduleBroadcastRetry(supabase: SupabaseLike, groupId: string, entry: TopicEntry) {
  if (entry.retryTimer) return
  const delay = Math.min(2000 * 2 ** entry.retryAttempt, 60_000)
  entry.retryAttempt++
  entry.retryTimer = setTimeout(() => {
    entry.retryTimer = null
    void (async () => {
      if (topics.get(groupId) !== entry) return
      if (entry.listeners.size === 0) return
      if (entry.channel) return // something else already restarted it
      const authed = await ensureRealtimeAuth(supabase)
      if (topics.get(groupId) !== entry || entry.listeners.size === 0 || entry.channel) return
      if (!authed) {
        scheduleBroadcastRetry(supabase, groupId, entry)
        return
      }
      startBroadcast(supabase, groupId, entry)
    })()
  }, delay)
}

function startFallback(supabase: SupabaseLike, groupId: string, entry: TopicEntry) {
  const channel = supabase
    .channel(`chat-fallback:${groupId}`)
    .on(
      "postgres_changes",
      { event: "INSERT", schema: "public", table: "messages", filter: `group_id=eq.${groupId}` },
      (payload) => emit(groupId, { operation: "INSERT", table: "messages", record: payload.new as Record<string, unknown>, old_record: null }),
    )
    .on(
      "postgres_changes",
      { event: "UPDATE", schema: "public", table: "messages", filter: `group_id=eq.${groupId}` },
      (payload) => emit(groupId, { operation: "UPDATE", table: "messages", record: payload.new as Record<string, unknown>, old_record: null }),
    )
    .on(
      "postgres_changes",
      { event: "DELETE", schema: "public", table: "messages", filter: `group_id=eq.${groupId}` },
      (payload) => emit(groupId, { operation: "DELETE", table: "messages", record: null, old_record: payload.old as Record<string, unknown> }),
    )
    .on(
      "postgres_changes",
      { event: "INSERT", schema: "public", table: "message_reactions", filter: `group_id=eq.${groupId}` },
      (payload) => emit(groupId, { operation: "INSERT", table: "message_reactions", record: payload.new as Record<string, unknown>, old_record: null }),
    )
    .on(
      "postgres_changes",
      { event: "DELETE", schema: "public", table: "message_reactions", filter: `group_id=eq.${groupId}` },
      (payload) => emit(groupId, { operation: "DELETE", table: "message_reactions", record: null, old_record: payload.old as Record<string, unknown> }),
    )
    .subscribe()
  entry.fallback = channel
}

/**
 * Register a listener for the `chat:{groupId}` private broadcast topic. Returns an
 * unsubscribe fn. The underlying private channel is created once per topic and shared
 * across all listeners (ref-counted); it is torn down when the last listener leaves.
 */
export function subscribeChatTopic(groupId: string, listener: Listener): () => void {
  const supabase = createClient()
  // Idempotent per topic: if an entry already exists (even one whose async
  // auth→subscribe continuation hasn't resolved yet), REUSE it — never create a
  // second channel for the same topic.
  let entry = topics.get(groupId)
  if (!entry) {
    // Capture THIS entry; the async continuation below is guarded on its identity so a
    // stale continuation (from a torn-down/replaced entry after a rapid unsubscribe→
    // resubscribe — StrictMode double-mount, fast chat switching) becomes a no-op and
    // never attaches a duplicate channel.
    const createdEntry: TopicEntry = { channel: null, fallback: null, listeners: new Set(), mode: "broadcast", retryTimer: null, retryAttempt: 0 }
    entry = createdEntry
    topics.set(groupId, createdEntry)
    // Auth is async (getSession); create the channel only after the socket carries
    // the user JWT.
    void (async () => {
      const authed = await ensureRealtimeAuth(supabase)
      // Generation guard: bail if this entry was torn down or replaced while we awaited,
      // if every listener has since left, or if a channel was already started for it.
      if (topics.get(groupId) !== createdEntry) return
      if (createdEntry.listeners.size === 0) return
      if (createdEntry.channel || createdEntry.fallback) return
      if (!authed) {
        // No session yet (e.g. cookie recovery race) — serve via fallback and keep
        // retrying broadcast; the session usually appears moments later.
        createdEntry.mode = "fallback"
        fallbackEngagements++
        startFallback(supabase, groupId, createdEntry)
        scheduleBroadcastRetry(supabase, groupId, createdEntry)
        return
      }
      startBroadcast(supabase, groupId, createdEntry)
    })()
  }
  entry.listeners.add(listener)

  return () => {
    const e = topics.get(groupId)
    if (!e) return
    e.listeners.delete(listener)
    if (e.listeners.size === 0) {
      if (e.retryTimer) {
        clearTimeout(e.retryTimer)
        e.retryTimer = null
      }
      if (e.channel) supabase.removeChannel(e.channel)
      if (e.fallback) supabase.removeChannel(e.fallback)
      topics.delete(groupId)
    }
  }
}
