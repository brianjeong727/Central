// ─── Conversational chat-row writes ──────────────────────────────────────────
// Pin / mute / archive / leave, fired straight from the chat list's swipe
// actions. Each is optimistic (Convention #4): patch the shared chat-list SWR
// cache first, write, roll the cache back if the write fails.
//
// These are CONVERSATIONAL writes and are deliberately NOT the same code path as
// ChatSettings, which stages every control behind an explicit Save (Convention
// #21). The two share the gate (chat-permissions.ts) and the cache key, not the
// commit semantics.
//
// Client-side module — the browser Supabase client under RLS, never a
// service-role path (Convention #5).

import { mutate as mutateGlobal } from "swr"
import { createClient } from "@/lib/supabase"
import type { ChatGroup } from "./types"

/** The one chat-list SWR key. ChatsTab, ChatListPanel and home-app all read it,
 *  so patching here updates every consumer at once. */
export function chatListKey(userId: string, ministryId: string) {
  return ["chat-list", userId, ministryId]
}

export interface ChatActionCtx {
  groupId: string
  userId: string
  ministryId: string
  /** Only needed by leaveChat, for the "<first name> left" system message. */
  userName?: string
}

function patchRow({ userId, ministryId, groupId }: ChatActionCtx, patch: Partial<ChatGroup>) {
  return mutateGlobal(
    chatListKey(userId, ministryId),
    (cur: ChatGroup[] | undefined) => cur?.map((g) => (g.id === groupId ? { ...g, ...patch } : g)),
    { revalidate: false },
  )
}

function dropRow({ userId, ministryId, groupId }: ChatActionCtx) {
  return mutateGlobal(
    chatListKey(userId, ministryId),
    (cur: ChatGroup[] | undefined) => cur?.filter((g) => g.id !== groupId),
    { revalidate: false },
  )
}

/** Pinned rooms float to the top of the list (partitionPinned in chats-tab). */
export async function setChatPinned(ctx: ChatActionCtx, pinned: boolean): Promise<string | null> {
  await patchRow(ctx, { pinned })
  const { error } = await createClient()
    .from("group_members").update({ pinned })
    .eq("group_id", ctx.groupId).eq("user_id", ctx.userId)
  if (error) {
    await patchRow(ctx, { pinned: !pinned })
    return "Couldn't update pin. Please try again."
  }
  return null
}

/**
 * `muted` is OUTPUT-ONLY — the sync_group_member_notify_mode trigger derives it
 * from notify_mode, and a CHECK asserts muted = (notify_mode = 'off'). So intent
 * is expressed as notify_mode and BOTH keys are sent together, exactly as
 * ChatSettings' handleSavePrefs does; a contradicting `muted` alone is silently
 * discarded. Unmuting returns to NULL = inherit the global notification mode,
 * rather than pinning this chat to "all".
 */
export async function setChatMuted(ctx: ChatActionCtx, muted: boolean): Promise<string | null> {
  await patchRow(ctx, { muted })
  const { error } = await createClient()
    .from("group_members").update({ notify_mode: muted ? "off" : null, muted })
    .eq("group_id", ctx.groupId).eq("user_id", ctx.userId)
  if (error) {
    await patchRow(ctx, { muted: !muted })
    return "Couldn't update notifications. Please try again."
  }
  return null
}

/** Leader-only, church chats only (chat-permissions). Reversible — unarchive is
 *  the same call with `false`, which is why this and not delete is the action
 *  the swipe exposes. */
export async function setChatArchived(ctx: ChatActionCtx, archived: boolean): Promise<string | null> {
  await patchRow(ctx, { archived })
  const { error } = await createClient()
    .from("groups").update({ archived })
    .eq("id", ctx.groupId).eq("ministry_id", ctx.ministryId)
  if (error) {
    await patchRow(ctx, { archived: !archived })
    return archived ? "Couldn't archive this chat." : "Couldn't unarchive this chat."
  }
  return null
}

/** "my" group chats only. Mirrors ChatSettings' handleLeave, including the
 *  system message, so the room reads the same however you left it. */
export async function leaveChat(ctx: ChatActionCtx): Promise<string | null> {
  const supabase = createClient()
  const first = (ctx.userName ?? "").split(" ")[0] || "Someone"
  await supabase.from("messages").insert({
    group_id: ctx.groupId, sender_id: ctx.userId, content: `${first} left`, message_type: "system",
  })
  const { error } = await supabase.from("group_members").delete()
    .eq("group_id", ctx.groupId).eq("user_id", ctx.userId)
  if (error) return "Couldn't leave this chat. Please try again."
  // Only drop the row once the delete succeeded — an optimistic removal here
  // would vanish a chat the user is still in if the write failed.
  await dropRow(ctx)
  return null
}
