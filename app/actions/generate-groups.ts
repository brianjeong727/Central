"use server"

import { createAdminClient } from "@/lib/supabase-admin"
import { runAlgorithm } from "@/lib/group-algorithm"
import { confirmSmallGroupChatsAction } from "@/app/actions/auto-chats"
export type { PoolPerson, GeneratedGroup, PrevPairing, GenerateGroupsParams, DGLLeader, SGGeneratedGroup } from "@/lib/group-algorithm"
import type { PoolPerson, GenerateGroupsParams, SGGeneratedGroup } from "@/lib/group-algorithm"

export async function generateGroupsAction(
  params: GenerateGroupsParams,
): Promise<{ groups: ReturnType<typeof runAlgorithm>; error?: string }> {
  let admin: ReturnType<typeof createAdminClient>
  try {
    admin = createAdminClient()
  } catch {
    return { groups: [], error: "Server configuration error." }
  }

  // ── 1. Fetch pool ────────────────────────────────────────────────────────────
  let pool: PoolPerson[] = []

  try {
    if (params.sourceType === "everyone") {
      const { data } = await admin
        .from("profiles")
        .select("id, name, graduation_year, role")
        .eq("ministry_id", params.ministryId)
        .not("name", "is", null)
      pool = (data ?? []) as PoolPerson[]
    } else if (params.sourceType === "announcement" && params.sourceId) {
      const { data } = await admin
        .from("rsvps")
        .select("user_id, profiles(id, name, graduation_year, role)")
        .eq("announcement_id", params.sourceId)
      pool = ((data ?? []) as Record<string, unknown>[])
        .map((r) => {
          const p = r.profiles
          return Array.isArray(p) ? p[0] : p
        })
        .filter(Boolean) as PoolPerson[]
    } else if (params.sourceType === "form" && params.sourceId) {
      const { data: respData } = await admin
        .from("form_responses")
        .select("user_id")
        .eq("form_id", params.sourceId)
      const seen = new Set<string>()
      const userIds = ((respData ?? []) as { user_id: string }[])
        .map((r) => r.user_id)
        .filter((id) => { if (seen.has(id)) return false; seen.add(id); return true })
      if (userIds.length > 0) {
        const { data } = await admin
          .from("profiles")
          .select("id, name, graduation_year, role")
          .in("id", userIds)
        pool = (data ?? []) as PoolPerson[]
      }
    }
  } catch {
    return { groups: [], error: "Failed to fetch pool from database." }
  }

  if (pool.length === 0)
    return { groups: [], error: "No people found in this pool." }

  const numGroups = Math.min(Math.max(1, params.numGroups), pool.length)

  // ── 2. Run algorithm ─────────────────────────────────────────────────────────
  try {
    const groups = runAlgorithm(pool, { ...params, numGroups })
    return { groups }
  } catch {
    return { groups: [], error: "Failed to generate groups." }
  }
}

// Writes SG mode results to small_groups + small_group_members, then triggers chat creation.
export async function confirmSmallGroupsAction(params: {
  teamId: string
  ministryId: string
  semester: string
  groups: Array<{
    leader_id: string
    leader_gender: string | null
    name: string
    members: Array<{ id: string }>
  }>
}): Promise<{ error?: string; chatResult?: { created: number; updated: number } }> {
  try {
    const admin = createAdminClient()

    for (const g of params.groups) {
      // Find or create the small_groups row for this leader
      const { data: existing } = await admin
        .from("small_groups")
        .select("id")
        .eq("team_id", params.teamId)
        .eq("leader_id", g.leader_id)
        .maybeSingle()

      let groupId: string

      if (existing) {
        groupId = existing.id
        await admin
          .from("small_groups")
          .update({ name: g.name })
          .eq("id", groupId)
      } else {
        const groupType = g.leader_gender === "female" ? "sisters" : "brothers"
        const { data: created, error: createErr } = await admin
          .from("small_groups")
          .insert({ team_id: params.teamId, ministry_id: params.ministryId, name: g.name, leader_id: g.leader_id, type: groupType })
          .select("id")
          .single()
        if (createErr || !created) return { error: `Failed to create small group: ${createErr?.message}` }
        groupId = created.id
      }

      // Replace members
      await admin.from("small_group_members").delete().eq("group_id", groupId)

      if (g.members.length > 0) {
        const rows = g.members.map(m => ({
          group_id: groupId,
          user_id: m.id,
          meal_taken: false,
          meal_semester: params.semester,
        }))
        const { error: insertErr } = await admin.from("small_group_members").insert(rows)
        if (insertErr) return { error: `Failed to assign members: ${insertErr.message}` }
      }
    }

    const chatResult = await confirmSmallGroupChatsAction(params.teamId, params.ministryId)
    return { chatResult: { created: chatResult.created, updated: chatResult.updated } }
  } catch (e) {
    return { error: `Unexpected error: ${e instanceof Error ? e.message : String(e)}` }
  }
}
