import { createClient } from "@/lib/supabase"
import { replyPreviewLabel } from "./utils"
import type { Message, Reaction } from "./types"

// ── The chat thread cache ────────────────────────────────────────────────────
//
// Opening a conversation used to cost the same two SEQUENTIAL round trips EVERY
// time, because the thread lived in `useState` inside ChatScreen and ChatScreen
// unmounts when you close it. Measured on a warm dev server against a 60-message
// room: messages fired at +85ms, message_reactions (which needs the ids the first
// query returns) at +403ms, first paint at ~894ms — and identically again on the
// next open, and the one after that. On a phone it is the ~2s Brian sees.
//
// Round-trip LATENCY is the whole cost — a single-row `groups` select measures
// ~265ms from the same client, so per-query DB time is noise next to the ~300ms
// it takes to ask. The fix is therefore not a faster query, it is fewer asks:
//
//   1. ONE round trip instead of two. `message_reactions` is embedded into the
//      messages select (PostgREST resolves the FK), so reactions no longer wait
//      for the ids the first response carries.
//   2. ZERO round trips on reopen. This module holds the last snapshot per room
//      OUTSIDE React, so a re-opened thread paints from memory in the same frame
//      and revalidates behind the already-painted messages.
//   3. ZERO round trips on the FIRST open too, when the room was prefetched —
//      home-app warms the top rooms once the boot is quiet, and a pointerdown on
//      any row warms that one before the tap even completes.
//
// Deliberately NOT SWR: a thread is MUTATED constantly (optimistic send, edit,
// delete, realtime insert, load-older prepend). Every one of those would need a
// write-through into SWR's cache anyway, and SWR would still revalidate-on-mount
// into a spinner. A purpose-built snapshot store is smaller and lets the merge
// semantics (below) be explicit.
//
// No module-level side effects — createClient() is lazy — so this stays safely
// importable from anywhere, including modules a server component reaches.

export const THREAD_PAGE = 50

/** How many rooms keep a snapshot. Insertion-ordered Map = LRU by re-set. */
const MAX_CACHED_THREADS = 12

/** Newest messages kept per room — two pages, so a reopen paints full and can
 *  still scroll a little before it has to re-page. */
const MAX_CACHED_MESSAGES = THREAD_PAGE * 2

/** A prefetched snapshot older than this is refetched rather than trusted. */
const PREFETCH_TTL_MS = 5 * 60 * 1000

// Reactions ride along on the messages row (`message_reactions(...)`) — that
// embed is what removes the second blocking round trip. Everything else is the
// select ChatScreen has always used.
export const MESSAGE_SELECT =
  "id, group_id, sender_id, content, created_at, reply_to_id, message_type, is_edited, deleted, " +
  "attachment_url, attachment_type, attachment_name, attachment_size, poll_id, " +
  "profiles!sender_id(name, avatar_url), " +
  "reply_to:reply_to_id(id, content, attachment_type, attachment_name, profiles!sender_id(name)), " +
  "message_reactions(id, message_id, user_id, emoji)"

export type ThreadSnapshot = {
  /** Ascending (oldest → newest), exactly as ChatScreen renders them. */
  messages: Message[]
  reactions: Record<string, Reaction[]>
  /** Whether an older page exists beyond the oldest loaded message. */
  hasMore: boolean
  fetchedAt: number
}

/** An optimistic row has no server counterpart yet (see ChatScreen's send path). */
const isOptimistic = (m: Message) => m.id.startsWith("optimistic-")

const cache = new Map<string, ThreadSnapshot>()
const inflight = new Map<string, Promise<ThreadSnapshot>>()
// Bumped whenever a room is evicted. A fetch that was already in flight when the
// eviction happened must not resurrect the transcript when it lands ~200ms later —
// which is B1's failure mode again, through a narrower window. Each fetch captures
// the epoch it started under and refuses to write if it has moved.
const epochs = new Map<string, number>()

export function readThread(groupId: string | null | undefined): ThreadSnapshot | undefined {
  if (!groupId) return undefined
  return cache.get(groupId)
}

function writeThread(groupId: string, snap: ThreadSnapshot): void {
  // NEVER cache an unsent row. An `optimistic-*` row is live UI state, not a fact
  // about the conversation, and caching one is self-perpetuating: on the next open
  // it is in `knownBeforeFetch`, so the "appeared after the request" rule no longer
  // rescues it, and the "still unsent" rule keeps it FOREVER — beside the real
  // server copy of the same message. "Tap send, tap back" would duplicate a message
  // permanently. Keeping them out here also restores that rule to its real job:
  // guarding live state, never cached state.
  let { messages, reactions, hasMore } = snap
  const withoutOptimistic = messages.filter((m) => !isOptimistic(m))
  if (withoutOptimistic.length !== messages.length) {
    messages = withoutOptimistic
    const live = new Set(messages.map((m) => m.id))
    reactions = Object.fromEntries(Object.entries(reactions).filter(([id]) => live.has(id)))
  }
  // A room the user paged far up in would otherwise cache every page they ever
  // scrolled to, in every room, for the session. Keep the newest slice only —
  // that is what a reopen actually paints, and history re-pages on scroll exactly
  // as it did the first time. Truncating necessarily means more exists above.
  if (messages.length > MAX_CACHED_MESSAGES) {
    messages = messages.slice(-MAX_CACHED_MESSAGES)
    const kept = new Set(messages.map((m) => m.id))
    reactions = Object.fromEntries(Object.entries(reactions).filter(([id]) => kept.has(id)))
    hasMore = true
  }
  // Re-insert so this room becomes the most-recently-used entry.
  cache.delete(groupId)
  cache.set(groupId, { ...snap, messages, reactions, hasMore })
  while (cache.size > MAX_CACHED_THREADS) {
    const oldest = cache.keys().next().value
    if (oldest === undefined) break
    cache.delete(oldest)
  }
}

/** The room's current eviction epoch. Capture at mount, pass to writeThreadIfCurrent. */
// NOTE: `writeThread` above is deliberately NOT exported. writeThreadIfCurrent is
// the only way in from outside this module, so "the epoch guard cannot be
// half-applied" is enforced by the compiler rather than by convention — which is
// what it was when the guard WAS half-applied (fetch guarded, write-through not).
export function threadEpoch(groupId: string): number {
  return epochs.get(groupId) ?? 0
}

/**
 * Write ONLY if the room has not been evicted since `epoch` was captured.
 *
 * `writeThread` has two callers — the fetch, and ChatScreen's write-through — and
 * guarding only the fetch left the sibling open: if you are removed from a room you
 * currently have OPEN, nothing closes the screen, so the eviction lands and then the
 * very next reaction, arrival or send writes the transcript straight back. Both
 * callers go through here so the guard cannot be half-applied again.
 */
export function writeThreadIfCurrent(groupId: string, snap: ThreadSnapshot, epoch: number): void {
  if ((epochs.get(groupId) ?? 0) !== epoch) return
  writeThread(groupId, snap)
}

/** Drop a room's snapshot — used when the room itself goes away (leave/delete). */
export function forgetThread(groupId: string): void {
  cache.delete(groupId)
  inflight.delete(groupId)
  epochs.set(groupId, (epochs.get(groupId) ?? 0) + 1)
}

/**
 * Drop every cached room the user is no longer a member of.
 *
 * This is the backstop for the access-loss cases the losing client cannot announce
 * for itself — being REMOVED by an admin, and a group someone else DELETES. Both
 * cascade the caller's `group_members` row away, and home-app already refetches
 * that id set on any own-membership change, so the set is the signal.
 *
 * Deliberately NOT driven off the realtime DELETE payload. Two things were
 * MEASURED against the live database rather than reasoned about, because the whole
 * eviction path turns on them:
 *   1. `payload.old` on a group_members DELETE arrives as exactly `{id}`.
 *      `group_id` never comes, so a handler reading it would silently do nothing
 *      forever. (Probe: subscribe, insert a sandbox membership, delete it.)
 *   2. The DELETE nonetheless REACHES a client subscribed with the app's own
 *      `user_id=eq.<uid>` filter — which is not obvious, since the payload does
 *      not contain `user_id` for that filter to match on. This is the fact
 *      `refreshMemberGroups` depends on; if it were false, removal-by-an-admin
 *      would never evict anything. e2e covers it so it cannot regress silently.
 *
 * Note this is NOT a replica-identity question, though it looks like one:
 * `group_members` IS `REPLICA IDENTITY FULL` (multi_tenant_migration.sql:696,
 * read_receipts_migration.sql:9), and the payload is still PK-only. The likely
 * reason — INFERENCE, not measured — is that Realtime cannot evaluate RLS against
 * a row that no longer exists. What is certain is that changing replica identity
 * would not help, and that this table is a known WAL hotspot (its writes were most
 * of the decoder's load, which is why read receipts are coalesced at all), so it is
 * the wrong place to push harder regardless.
 */
export function retainThreads(memberGroupIds: ReadonlySet<string>): void {
  for (const id of [...cache.keys()]) {
    if (!memberGroupIds.has(id)) forgetThread(id)
  }
}

// ── Row → Message ────────────────────────────────────────────────────────────
// Pure. This used to live inside ChatScreen as a useCallback whose side effect
// populated the sender-name/avatar caches; it is hoisted here so the SAME
// transform can run in a `useState` initializer (instant paint from cache) and in
// a prefetch that has no component at all. ChatScreen now populates those caches
// from `messages` in an effect, which covers every route a message arrives by.
/* eslint-disable @typescript-eslint/no-explicit-any */
export function enrichMessageRows(rows: unknown[]): Message[] {
  return (rows as any[]).map((m: any): Message => {
    const isSystem = m.message_type === "system"
    const p = isSystem ? null : (Array.isArray(m.profiles) ? m.profiles[0] : m.profiles)
    const name = p?.name ?? (isSystem ? "" : "Unknown")
    const avatarUrl = p?.avatar_url ?? null

    const replyRaw = m.reply_to ?? null
    const replyProfile = replyRaw?.profiles
      ? (Array.isArray(replyRaw.profiles) ? replyRaw.profiles[0] : replyRaw.profiles)
      : null

    return {
      id: m.id, group_id: m.group_id, sender_id: m.sender_id,
      content: m.content, created_at: m.created_at, sender_name: name,
      sender_avatar_url: avatarUrl,
      reply_to_id: m.reply_to_id ?? null,
      reply_to_content: replyPreviewLabel(replyRaw?.content, replyRaw?.attachment_type, replyRaw?.attachment_name),
      reply_to_sender: (replyProfile as { name: string } | null)?.name ?? null,
      message_type: m.message_type ?? "user",
      is_edited: m.is_edited ?? false,
      deleted: m.deleted ?? false,
      attachment_url: m.attachment_url ?? null,
      attachment_type: m.attachment_type ?? null,
      attachment_name: m.attachment_name ?? null,
      attachment_size: m.attachment_size ?? null,
      poll_id: m.poll_id ?? null,
    }
  })
}

/** Pull the embedded `message_reactions` off the rows into the map ChatScreen keeps. */
export function reactionsFromRows(rows: unknown[]): Record<string, Reaction[]> {
  const map: Record<string, Reaction[]> = {}
  for (const row of rows as any[]) {
    const rx = row?.message_reactions
    if (!Array.isArray(rx) || rx.length === 0) continue
    map[row.id] = rx.map((r: any) => ({
      id: r.id, message_id: r.message_id ?? row.id, user_id: r.user_id, emoji: r.emoji,
    }))
  }
  return map
}
/* eslint-enable @typescript-eslint/no-explicit-any */

// ── Fetch ────────────────────────────────────────────────────────────────────

/** The newest page of a thread, in ONE round trip. Deduped per room. */
export function fetchThread(groupId: string): Promise<ThreadSnapshot> {
  const running = inflight.get(groupId)
  if (running) return running

  const startedAt = epochs.get(groupId) ?? 0
  const p = (async (): Promise<ThreadSnapshot> => {
    const supabase = createClient()
    const { data, error } = await supabase
      .from("messages")
      .select(MESSAGE_SELECT)
      .eq("group_id", groupId)
      .order("created_at", { ascending: false })
      .limit(THREAD_PAGE)
    if (error) throw error

    const rows = [...(data ?? [])].reverse()
    const snap: ThreadSnapshot = {
      messages: enrichMessageRows(rows),
      reactions: reactionsFromRows(rows),
      hasMore: (data ?? []).length === THREAD_PAGE,
      fetchedAt: Date.now(),
    }
    // Evicted while this was in flight (the user left, or was removed) — hand the
    // result back to whoever asked, but do NOT put it back in the cache.
    writeThreadIfCurrent(groupId, snap, startedAt)
    return snap
  })()
    .finally(() => { inflight.delete(groupId) })

  inflight.set(groupId, p)
  return p
}

/**
 * Warm a room in the background. Fire-and-forget and idempotent: a room that is
 * already cached-and-fresh, or already being fetched, costs nothing. A failure is
 * a silent no-op — a warm that doesn't land just means the open pays for itself,
 * exactly as it did before.
 */
export function prefetchThread(groupId: string | null | undefined): void {
  if (!groupId) return
  if (inflight.has(groupId)) return
  const existing = cache.get(groupId)
  if (existing && Date.now() - existing.fetchedAt < PREFETCH_TTL_MS) return
  void fetchThread(groupId).catch(() => {})
}

// ── Merge ────────────────────────────────────────────────────────────────────

/**
 * Swap an optimistic row's id for the real one the insert returned.
 *
 * If the real row is ALREADY present, drop the optimistic row instead of renaming
 * it — renaming would leave two rows sharing one id (and one React key). That is
 * reachable: the mount revalidation can return the row before the insert promise
 * resolves, because the draft-DM path issues the INSERT and only then the SELECT.
 *
 * (It is NOT reachable via realtime — a client ignores its own inserts, see the
 * `raw.sender_id === userId` early return in ChatScreen's INSERT handler. The
 * revalidation is the only producer.)
 *
 * Lives here, and is used by EVERY send path — text, poll, GIF, attachment,
 * caption — because it was first fixed on the text path alone, which left the
 * attachment path broken for exactly the case that triggers it: sending a photo as
 * the first message of a brand-new DM.
 */
export function replaceOptimistic(list: Message[], optimisticId: string, realId: string): Message[] {
  if (list.some((m) => m.id === realId)) return list.filter((m) => m.id !== optimisticId)
  return list.map((m) => (m.id === optimisticId ? { ...m, id: realId } : m))
}

/**
 * Reconcile a freshly-fetched newest-50 window against what is already on screen.
 *
 * THE SERVER WINS FOR THE TIME RANGE IT REPORTS ON (ratified by Brian, this task):
 *
 *   keep a cached message if:
 *     · the server just returned it        → use the server copy
 *     · it APPEARED AFTER the request went out → keep (live arrival / new send)
 *     · it is an unsent message of yours   → keep (optimistic-*)
 *     · it is OLDER than the newest page   → keep (scrollback)
 *   otherwise                              → DROP
 *
 * "Appeared after the request went out" is answered by IDENTITY, not by a clock:
 * `knownBeforeFetch` is the set of message ids that were already on screen when
 * the query was issued, so anything outside it necessarily arrived afterwards and
 * could not have been in the response.
 *
 * Two clock-based anchors were tried first and BOTH are unsafe, which is why this
 * takes an id set instead:
 *   - a client-stamped request time compares a LOCAL clock against server
 *     `created_at` values, so a device running a few hundred ms fast silently
 *     drops a live message that arrived mid-fetch — the exact case it was added
 *     for. It also loses the first message of a brand-new DM, whose optimistic row
 *     predates the request and whose real id has already been swapped in.
 *   - the newest RETURNED row is on the right clock but cannot distinguish "created
 *     after the query" from "deleted before it", so a hard-deleted newest message
 *     resurrects permanently.
 * The id set has neither failure: it is exact, and it needs no clock at all.
 *
 * Dropping is not an optimisation, it is the correctness half. Two things depend
 * on it, both found by review of the first cut:
 *   - RLS reports "you can see nothing here" as an EMPTY ARRAY, not an error. The
 *     earlier `if (server.length === 0) return local` therefore kept painting the
 *     transcript of a room the user had just left or been removed from, and the
 *     write-through then re-stamped it fresh so it never expired either.
 *   - Messages are HARD-deleted (a deleted poll, a deleted group). A row the
 *     server omits from inside its own window is gone, and keeping it resurrected
 *     deleted content for the rest of the session.
 * An empty response now clears everything except your own unsent rows — correct
 * for revocation and for an all-deleted room alike, while an empty room with a
 * send in flight still shows the send.
 */
export function mergeThread(
  local: Message[],
  server: Message[],
  knownBeforeFetch: ReadonlySet<string>,
): Message[] {
  if (local.length === 0) return server

  const serverIds = new Set(server.map((m) => m.id))
  // With an empty window there is no range to be older than — nothing survives on
  // scrollback grounds, which is exactly what makes revocation clear the room.
  const windowStart = server.length > 0 ? server[0].created_at : null

  const kept = local.filter((m) => {
    if (serverIds.has(m.id)) return false            // the server copy replaces it
    if (!knownBeforeFetch.has(m.id)) return true     // appeared after the request
    if (isOptimistic(m)) return true                 // yours, not yet acknowledged
    if (windowStart !== null && m.created_at < windowStart) return true // scrollback
    return false                                     // deleted, or no longer visible
  })

  return [...kept, ...server].sort((a, b) =>
    a.created_at === b.created_at ? a.id.localeCompare(b.id) : a.created_at.localeCompare(b.created_at),
  )
}
