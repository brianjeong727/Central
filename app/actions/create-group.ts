"use server"

import { createClient } from "@/lib/supabase-server"

type ChurchChatCategory = "general" | "group" | "team"

interface CreateGroupInput {
  name: string
  type: "my" | "church" | "dm"
  memberIds: string[]
  createdBy: string
  // Section for church chats only (my/dm ignore it → NULL). Defaults to
  // "general" when a church chat is created without an explicit category.
  category?: ChurchChatCategory
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
  if (input.type === "church" && !["admin", "deacon", "elder", "pastor", "leader"].includes(profile.role.toLowerCase())) {
    return { group: null, error: "Only admins and leaders can create church chats." }
  }

  // Category applies to church chats only (enum-validated). my/dm carry NULL.
  const VALID_CATEGORIES: ChurchChatCategory[] = ["general", "group", "team"]
  let category: ChurchChatCategory | null = null
  if (input.type === "church") {
    category = input.category && VALID_CATEGORIES.includes(input.category) ? input.category : "general"
  }

  const { data: group, error: groupErr } = await supabase
    .from("groups")
    .insert({ name: input.name, type: input.type, created_by: user.id, ministry_id: profile.ministry_id, category })
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
