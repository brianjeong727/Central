"use server"

import { createClient } from "@/lib/supabase-server"
import { createAdminClient } from "@/lib/supabase-admin"
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
  } else if (!isChatManageRole(profile.role)) {
    return { error: "Insufficient permissions." }
  }

  // The ministry-wide central chat can never be deleted. Surface a friendly
  // message before hitting the DB (a BEFORE DELETE trigger is the hard backstop).
  if (group.is_central_chat) return { error: "The ministry chat can't be deleted." }

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
