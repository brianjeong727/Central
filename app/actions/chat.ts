"use server"

import { createClient } from "@/lib/supabase-server"
import { createAdminClient } from "@/lib/supabase-admin"
import { removeStorageFolder } from "@/lib/storage-cleanup"
import { isChatManageRole, isLeaderRole } from "@/lib/roles"

export async function deleteGroup(groupId: string): Promise<{ error: string | null }> {
  const supabase = await createClient()
  const { data: { user }, error: authErr } = await supabase.auth.getUser()
  if (authErr || !user) return { error: "Not authenticated." }

  const { data: profile } = await supabase
    .from("profiles")
    .select("ministry_id, role")
    .eq("id", user.id)
    .single()
  if (!profile?.ministry_id) return { error: "Insufficient permissions." }

  const admin = createAdminClient()

  const { data: group } = await admin
    .from("groups")
    .select("id, type, is_central_chat")
    .eq("id", groupId)
    .eq("ministry_id", profile.ministry_id)
    .maybeSingle()
  if (!group) return { error: "Chat not found in your ministry." }

  // Church chats: management moved to "in-chat leader-or-above" — the caller must
  // be leader-tier (incl. pastor) AND a member of THIS chat (mirrors the groups
  // UPDATE / group_members RLS). My/DM chats keep the legacy isChatManageRole gate.
  if (group.type === "church") {
    if (!isLeaderRole(profile.role)) return { error: "Insufficient permissions." }
    const { data: membership } = await admin
      .from("group_members")
      .select("user_id")
      .eq("group_id", groupId)
      .eq("user_id", user.id)
      .maybeSingle()
    if (!membership) return { error: "Insufficient permissions." }
  } else if (group.type === "dm") {
    // A DM is normally undeletable by ANYONE — the rule protects the other
    // participant's copy of the thread. The single exception is a DM whose other
    // side is a deleted account: there is nobody left to protect, and its owner
    // is otherwise stuck with a conversation they can never clear. Gate is
    // membership + "the other member is a tombstone", NOT a role — an ordinary
    // member must be able to clear their own dead DM. Mirrors chatCapabilities'
    // `deadDM`, and is the authority: the client value is never trusted.
    // Two reads rather than a `profiles!user_id(...)` embed: a second FK between
    // these tables would silently change the embed's shape, and this is a
    // permission gate — it must fail closed, not fail interestingly.
    const { data: dmMembers } = await admin
      .from("group_members")
      .select("user_id")
      .eq("group_id", groupId)
    const memberIds = (dmMembers ?? []).map((r: { user_id: string }) => r.user_id)
    if (!memberIds.includes(user.id)) return { error: "Insufficient permissions." }
    const otherIds = memberIds.filter((id) => id !== user.id)
    // `otherIds.length > 0` guards the degenerate one-row DM, where "every other
    // participant is deleted" would otherwise be vacuously true.
    if (otherIds.length === 0) return { error: "Insufficient permissions." }
    const { data: others } = await admin
      .from("profiles")
      .select("id, deleted_at")
      .in("id", otherIds)
    const rows = (others ?? []) as { id: string; deleted_at: string | null }[]
    if (rows.length !== otherIds.length || !rows.every((r) => r.deleted_at)) {
      return { error: "Insufficient permissions." }
    }
  } else if (!isChatManageRole(profile.role)) {
    return { error: "Insufficient permissions." }
  }

  // The ministry-wide central chat can never be deleted. Surface a friendly
  // message before hitting the DB (a BEFORE DELETE trigger is the hard backstop).
  if (group.is_central_chat) return { error: "The ministry chat can't be deleted." }

  // Sweep the chat's attachments BEFORE the messages go: the rows are the only
  // record of the object keys, and `chat-attachments` is a PUBLIC bucket, so
  // anything left here keeps serving its URL forever. Uploads are keyed
  // `${groupId}/…`, so the whole folder belongs to this chat. `.remove()` matches
  // exact names, not prefixes — hence the list-then-remove sweep. Service-role
  // client, so no DELETE policy is involved. Best-effort: a storage failure must
  // not block the chat deletion the caller is authorised for.
  //
  // Known gap: a message FORWARDED out of this chat still points at these keys,
  // so its image breaks. Accepted — the alternative is keeping every object of a
  // deleted chat alive forever, and a forward pointing into a chat that no longer
  // exists cannot be repaired from here anyway.
  await removeStorageFolder(admin, "chat-attachments", groupId, "chat delete sweep")

  // Delete in FK-safe order
  const { data: msgs } = await admin.from("messages").select("id").eq("group_id", groupId)
  const msgIds = (msgs ?? []).map((m: { id: string }) => m.id)
  if (msgIds.length > 0) {
    await admin.from("message_reactions").delete().in("message_id", msgIds)
  }
  await admin.from("messages").delete().eq("group_id", groupId)
  await admin.from("group_members").delete().eq("group_id", groupId)
  await admin.from("groups").delete().eq("id", groupId)

  return { error: null }
}
