import { createClient } from "@/lib/supabase"
import { chatRowPreview, type ReactionRowFields } from "./utils"
import type { ChatGroup } from "./types"
import type { ChatAvatarMember } from "@/components/central/chat-avatar"

// ── Shared chat-list SWR fetcher ─────────────────────────────────────────────
// Single DB round-trip via get_chat_list RPC. The mobile ChatsTab, the desktop
// ChatListPanel, AND the home-app realtime refetcher all import this one fetcher
// + the stable key ["chat-list", userId, ministryId] so SWR dedupes them to a
// single cache entry. Lives in its own tiny module (not chats-tab) so home-app
// can import it WITHOUT pulling the code-split chats-tab chunk into the main
// bundle. Pure: no side effects.
export type ChatListRow = {
  group_id: string; group_name: string; group_type: string
  group_archived: boolean | null; last_read_at: string | null
  last_msg_content: string | null; last_msg_sender_id: string | null
  last_msg_sender_name: string | null; last_msg_at: string | null
  last_msg_type: string | null; unread_count: number
  last_msg_attachment_type: string | null; last_msg_has_poll: boolean | null
  group_category: string | null
  muted: boolean | null; pinned: boolean | null
  is_central: boolean | null
  // The chat's own uploaded photo, and — for a DM — the other participant's
  // profile photo, both resolved inside get_chat_list so the list stays ONE
  // round trip. Never read either directly; go through chatChipAvatar().
  group_avatar_url: string | null
  partner_avatar_url: string | null
  /** groups.name_is_generated — the title was assembled from member first names
   *  rather than typed. Drives the member-cluster avatar; never inferred from
   *  the string (see components/central/chat-avatar.tsx). */
  name_is_generated: boolean | null
  /** Members EXCLUDING the viewer. */
  other_member_count: number | null
  /** First three of them, recency-ordered. `[]` for named chats and DMs — the
   *  SQL only pays for the cluster where one can actually render. */
  cluster_members: ChatAvatarMember[] | null
} & ReactionRowFields

// ── Dead-thread signal (deleted-account counterpart) ─────────────────────────
// get_dm_groups_with_deleted_counterpart() returns the CALLER'S OWN dm group ids
// whose counterpart(s) are ALL deleted-account tombstones. Zero arguments —
// identity is auth.uid() and the ministry boundary comes from the `groups` SELECT
// policy — and SECURITY INVOKER, so it is not a new privileged surface.
//
// It is a purely COSMETIC signal (sink + dim), so it is never allowed to fail the
// list: toDeletedDmSet swallows an error/absent result into an empty set. A hiccup
// in a display nicety must not be able to blank Messages for every consumer
// (mobile ChatsTab, desktop ChatListPanel, the home-app realtime refetcher, ⌘K).
export const DELETED_DM_RPC = "get_dm_groups_with_deleted_counterpart"
type DeletedDmRow = { group_id: string }

/** Never throws. Anything other than a clean row array degrades to "no dead DMs". */
export function toDeletedDmSet(result: unknown): Set<string> {
  const r = result as { data?: DeletedDmRow[] | null; error?: unknown } | null | undefined
  if (!r || r.error || !Array.isArray(r.data)) return new Set()
  return new Set(r.data.map((x) => x?.group_id).filter((id): id is string => typeof id === "string"))
}

// Pure row → ChatGroup mapping, shared by the CLIENT fetcher below and the SERVER
// boot fetch in app/home/page.tsx. Extracted rather than duplicated because the two
// must produce byte-identical shapes: the server result seeds the same SWR cache the
// client fetcher later revalidates, and any drift between them would show up as the
// list visibly rearranging itself a beat after first paint.
//
// That is also why the dead-DM ORDERING lives here and not in fetchChatList: the
// fetcher is not the only producer. Sorting in the fetcher would leave the SSR seed
// in plain recency order and the list would visibly reshuffle on hydration.
//
// Deliberately kept in this module (which has no module-level side effects — the
// browser client is created lazily inside createClient()) so a SERVER component can
// import it without pulling a browser client into the server graph.
export function mapChatListRows(
  rows: ChatListRow[],
  deletedDmIds?: ReadonlySet<string>,
  // The viewer, so a reaction preview can say "You" / "your message". Threaded from
  // BOTH callers (client fetcher below, SSR boot in app/home/page.tsx) — they must
  // stay in lockstep or the sentence changes on hydration.
  viewerId?: string | null,
): ChatGroup[] {
  // get_chat_list surfaces groups.is_central_chat directly (row.is_central), so the
  // previously-required follow-up groups lookup is gone. Used only to flag the
  // solid-plum monogram chip in the mobile Pocket list.
  const groups = (rows ?? []).map((row) => {
    // Message-or-reaction, decided in ONE shared place (app/home/utils.ts). Unread
    // counts are untouched by this — a reaction never adds to the badge.
    const preview = chatRowPreview(row, viewerId)
    return {
      id: row.group_id,
      name: row.group_name,
      type: row.group_type,
      archived: row.group_archived ?? false,
      last_message: preview.label || null,
      last_sender: preview.senderName,
      last_message_time: preview.at,
      unread_count: Number(row.unread_count),
      category: (row.group_category ?? null) as ChatGroup["category"],
      muted: row.muted ?? false,
      pinned: row.pinned ?? false,
      is_central_chat: row.is_central ?? false,
      counterpart_deleted: deletedDmIds?.has(row.group_id) ?? false,
      // Carried RAW onto the ChatGroup — the DM-vs-group choice is made once, at
      // render, by chatChipAvatar() (app/home/chat-avatar.ts). Collapsing them to
      // a single field here would put a second derivation point in the codebase,
      // which is exactly what the W1 policy gap makes unsafe. The RPC spelling is
      // kept verbatim (NOT renamed to a plain `avatar_url`) so any consumer that
      // reads the group photo without the resolver trips check-chat-avatar.sh.
      group_avatar_url: row.group_avatar_url ?? null,
      partner_avatar_url: row.partner_avatar_url ?? null,
      name_is_generated: row.name_is_generated ?? false,
      other_member_count: Number(row.other_member_count ?? 0),
      cluster_members: row.cluster_members ?? [],
    }
  }) as ChatGroup[]

  // Dead threads (the other person deleted their account) sink BELOW every live
  // conversation; recency orders each partition exactly as before. Pinning is
  // deliberately NOT considered here — partitionPinned (chat-shared.ts) floats
  // pinned rooms at render time, so an explicitly pinned dead DM still sits first.
  // An explicit user act outranks an automatic de-prioritisation.
  groups.sort((a, b) => {
    if (!!a.counterpart_deleted !== !!b.counterpart_deleted) return a.counterpart_deleted ? 1 : -1
    // Then by most recent message first (nulls last)
    if (!a.last_message_time && !b.last_message_time) return 0
    if (!a.last_message_time) return 1
    if (!b.last_message_time) return -1
    return b.last_message_time.localeCompare(a.last_message_time)
  })

  return groups
}

export async function fetchChatList([, userId, ministryId]: [string, string, string]): Promise<ChatGroup[]> {
  const supabase = createClient()
  // PARALLEL, never sequential: awaiting the dead-DM set after the list would
  // double list latency for a cosmetic sort. The second call also cannot reject
  // into Promise.all — its rejection handler degrades it to null, which
  // toDeletedDmSet reads as "no dead DMs".
  const [listResult, deletedResult] = await Promise.all([
    supabase.rpc("get_chat_list", { p_user_id: userId, p_ministry_id: ministryId }),
    supabase.rpc(DELETED_DM_RPC).then((r) => r, () => null),
  ])
  // Propagate transient RPC failures so SWR enters its error/retry state and
  // keepPreviousData keeps the last good list — instead of swallowing the error
  // and caching `[]`, which poisons every consumer until a manual refresh.
  // (Only the LIST's own failure earns that; see above.)
  if (listResult.error) throw listResult.error

  return mapChatListRows((listResult.data ?? []) as ChatListRow[], toDeletedDmSet(deletedResult), userId)
}
