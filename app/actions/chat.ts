"use server"

import { createClient } from "@/lib/supabase-server"
import { createAdminClient } from "@/lib/supabase-admin"

export async function deleteGroup(groupId: string): Promise<{ error: string | null }> {
  const supabase = await createClient()
  const { data: { user }, error: authErr } = await supabase.auth.getUser()
  if (authErr || !user) return { error: "Not authenticated." }

  // Verify the caller is admin or leader
  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single()
  if (!profile || !["admin", "leader"].includes(profile.role.toLowerCase())) {
    return { error: "Insufficient permissions." }
  }

  const admin = createAdminClient()

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
