"use server"

import { createAdminClient } from "@/lib/supabase-admin"
import { runAlgorithm } from "@/lib/group-algorithm"
export type { PoolPerson, GeneratedGroup, PrevPairing, GenerateGroupsParams } from "@/lib/group-algorithm"
import type { PoolPerson, GenerateGroupsParams } from "@/lib/group-algorithm"

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
