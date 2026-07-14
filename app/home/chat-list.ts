import { createClient } from "@/lib/supabase"
import { chatPreviewLabel } from "./utils"
import type { ChatGroup } from "./types"

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
}

export async function fetchChatList([, userId, ministryId]: [string, string, string]): Promise<ChatGroup[]> {
  const supabase = createClient()
  const { data, error } = await supabase.rpc("get_chat_list", {
    p_user_id: userId,
    p_ministry_id: ministryId,
  })
  // Propagate transient RPC failures so SWR enters its error/retry state and
  // keepPreviousData keeps the last good list — instead of swallowing the error
  // and caching `[]`, which poisons every consumer until a manual refresh.
  if (error) throw error

  // The get_chat_list RPC doesn't surface groups.is_central_chat, so resolve the
  // ministry-wide central chat with one tiny additive lookup (indexed on
  // ministry_id, returns ≤1 row; RLS-scoped to the caller's memberships). Used
  // only to flag the solid-plum monogram chip in the mobile Pocket list.
  const { data: centralRows } = await supabase
    .from("groups")
    .select("id")
    .eq("ministry_id", ministryId)
    .eq("is_central_chat", true)
  const centralIds = new Set(((centralRows ?? []) as { id: string }[]).map((r) => r.id))

  const groups = ((data ?? []) as ChatListRow[]).map((row) => ({
    id: row.group_id,
    name: row.group_name,
    type: row.group_type,
    archived: row.group_archived ?? false,
    last_message: chatPreviewLabel(row.last_msg_content, row.last_msg_attachment_type, row.last_msg_has_poll) || null,
    last_sender: row.last_msg_sender_name ?? null,
    last_message_time: row.last_msg_at ?? null,
    unread_count: Number(row.unread_count),
    category: (row.group_category ?? null) as ChatGroup["category"],
    muted: row.muted ?? false,
    pinned: row.pinned ?? false,
    is_central_chat: centralIds.has(row.group_id),
  })) as ChatGroup[]

  // Sort by most recent message first (nulls last)
  groups.sort((a, b) => {
    if (!a.last_message_time && !b.last_message_time) return 0
    if (!a.last_message_time) return 1
    if (!b.last_message_time) return -1
    return b.last_message_time.localeCompare(a.last_message_time)
  })

  return groups
}
