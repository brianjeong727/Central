"use server"

import { createClient } from "@/lib/supabase-server"

interface CreateGroupInput {
  name: string
  type: "my" | "church" | "dm"
  memberIds: string[]
  createdBy: string
}

interface CreateGroupResult {
  group: { id: string; name: string } | null
  error: string | null
}

export async function createGroup(input: CreateGroupInput): Promise<CreateGroupResult> {
  const supabase = await createClient()

  const { data: { user }, error: authErr } = await supabase.auth.getUser()
  if (authErr || !user) return { group: null, error: "Not authenticated. Please sign in again." }

  const { data: profile, error: profileErr } = await supabase
    .from("profiles")
    .select("ministry_id, role")
    .eq("id", user.id)
    .single()

  if (profileErr || !profile?.ministry_id) {
    return { group: null, error: "You must be part of a ministry to create a chat." }
  }
  if (input.type === "church" && !["admin", "leader"].includes(profile.role.toLowerCase())) {
    return { group: null, error: "Only admins and leaders can create church chats." }
  }

  const { data: group, error: groupErr } = await supabase
    .from("groups")
    .insert({ name: input.name, type: input.type, created_by: user.id, ministry_id: profile.ministry_id })
    .select("id, name")
    .single()

  if (groupErr || !group) return { group: null, error: groupErr?.message ?? "Failed to create group." }

  const uniqueIds = Array.from(new Set([user.id, ...input.memberIds]))
  const { error: membersErr } = await supabase
    .from("group_members")
    .insert(uniqueIds.map((uid) => ({ group_id: group.id, user_id: uid })))

  if (membersErr) return { group: null, error: membersErr.message }

  return { group, error: null }
}
