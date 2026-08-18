"use client"

// Shared client hook for the current user's OWN block list. One SWR key
// (["user-blocks", userId]) is shared across ChatScreen (message filter), the
// create-chat / DM flow (disable blocked rows), and Profile → Blocked users
// (list + unblock) so a block/unblock anywhere reflects everywhere.

import { useMemo } from "react"
import useSWR from "swr"
import { createClient } from "@/lib/supabase"

export interface BlockedUser {
  blocked_id: string
  name: string
  avatar_url: string | null
  created_at: string
}

interface BlockRow {
  blocked_id: string
  created_at: string
  profiles: { name: string | null; avatar_url: string | null } | { name: string | null; avatar_url: string | null }[] | null
}

export function useBlocks(userId: string | null) {
  const supabase = createClient()
  const { data, error, mutate, isLoading } = useSWR(
    userId ? ["user-blocks", userId] : null,
    async (): Promise<BlockedUser[]> => {
      const { data, error } = await supabase
        .from("user_blocks")
        .select("blocked_id, created_at, profiles!blocked_id(name, avatar_url)")
        .eq("blocker_id", userId as string)
        .order("created_at", { ascending: false })
      // THROW rather than degrade to an empty list. Swallowing the error made a
      // failed query indistinguishable from "you have blocked nobody", so SWR
      // never entered its error state and consumers could not tell the difference
      // — including ChatScreen, which holds its first paint until this settles
      // precisely so a blocked sender's messages cannot paint first.
      if (error) throw error
      return ((data ?? []) as BlockRow[]).map((b) => {
        const p = Array.isArray(b.profiles) ? b.profiles[0] : b.profiles
        return {
          blocked_id: b.blocked_id,
          name: p?.name ?? "Member",
          avatar_url: p?.avatar_url ?? null,
          created_at: b.created_at,
        }
      })
    },
  )

  const blocked = useMemo(() => data ?? [], [data])
  const blockedIds = useMemo(() => new Set(blocked.map((b) => b.blocked_id)), [blocked])

  // Has this query RESOLVED at least once, either way? Distinct from `isLoading`,
  // which SWR flips back to true on every error retry — so a consumer that holds
  // UI back on `isLoading` alone waits forever against a failing query, not just
  // until the first answer. ChatScreen holds its first paint on exactly this, so
  // that a blocked sender's messages can't paint before the block list is known.
  const settled = data !== undefined || error !== undefined

  return { blocked, blockedIds, mutate, isLoading, settled }
}
