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
  const { data, mutate, isLoading } = useSWR(
    userId ? ["user-blocks", userId] : null,
    async (): Promise<BlockedUser[]> => {
      const { data } = await supabase
        .from("user_blocks")
        .select("blocked_id, created_at, profiles!blocked_id(name, avatar_url)")
        .eq("blocker_id", userId as string)
        .order("created_at", { ascending: false })
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

  return { blocked, blockedIds, mutate, isLoading }
}
