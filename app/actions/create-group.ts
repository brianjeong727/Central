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
  console.log("[createGroup] SERVER ACTION called — input:", JSON.stringify(input))

  const supabase = await createClient()

  const { data: { user }, error: authErr } = await supabase.auth.getUser()
  console.log("[createGroup] auth.getUser —", user?.id ?? "NO USER", "| authErr:", authErr?.message ?? "none")

  if (authErr || !user) {
    return { group: null, error: "Not authenticated. Please sign in again." }
  }

  const insertPayload = { name: input.name, type: input.type, created_by: user.id }
  console.log("[createGroup] inserting group:", JSON.stringify(insertPayload))

  const { data: group, error: groupErr } = await supabase
    .from("groups")
    .insert(insertPayload)
    .select("id, name")
    .single()

  console.log("[createGroup] group insert — result:", group, "| error:", groupErr?.message ?? "none")

  if (groupErr || !group) {
    return { group: null, error: groupErr?.message ?? "Failed to create group." }
  }

  const uniqueIds = Array.from(new Set([user.id, ...input.memberIds]))
  console.log("[createGroup] inserting group_members for group", group.id, "— members:", uniqueIds)

  const { error: membersErr } = await supabase
    .from("group_members")
    .insert(uniqueIds.map((uid) => ({ group_id: group.id, user_id: uid })))

  console.log("[createGroup] members insert error:", membersErr?.message ?? "none")

  if (membersErr) {
    return { group: null, error: membersErr.message }
  }

  console.log("[createGroup] SUCCESS — returning group:", group)
  return { group, error: null }
}
