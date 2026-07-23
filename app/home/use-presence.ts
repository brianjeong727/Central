"use client"

import { useEffect, useState } from "react"
import { createClient } from "@/lib/supabase"

// ── Ministry-wide online presence ─────────────────────────────────────────────
// Every session with the app open joins `presence-{ministryId}` (presence key =
// own profile id) and tracks itself; the returned set is every profile id
// currently live on the channel. Ephemeral realtime state — nothing touches the
// DB. Consumed by the Directory surfaces to paint the online dot.
export function useMinistryPresence(ministryId: string | null | undefined, userId: string | null | undefined): Set<string> {
  const supabase = createClient()
  const [onlineIds, setOnlineIds] = useState<Set<string>>(() => new Set())

  useEffect(() => {
    if (!ministryId || !userId) return

    const channel = supabase.channel(`presence-${ministryId}`, {
      config: { presence: { key: userId } },
    })

    // Guard: presence listeners cannot be added after subscribe() — skip if
    // channel already joined (React Strict Mode double-invoke)
    try {
      channel.on("presence", { event: "sync" }, () => {
        const ids = Object.keys(channel.presenceState())
        // Only swap state when membership actually changed — presence syncs are
        // chatty and home-app re-renders are not free.
        setOnlineIds((prev) => {
          if (prev.size === ids.length && ids.every((id) => prev.has(id))) return prev
          return new Set(ids)
        })
      })
    } catch {
      // Already subscribed — presence will sync on next mount
    }

    channel.subscribe(async (status: string) => {
      if (status !== "SUBSCRIBED") return
      await channel.track({ userId })
    })

    return () => {
      channel.untrack()
      // Synchronously remove from the realtime client's channel list so that
      // the next supabase.channel() call creates a fresh (unsubscribed) channel
      // rather than returning the still-subscribed existing one (React Strict Mode issue)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const rt = (supabase as any).realtime as { channels: unknown[]; _schedulePendingDisconnect?: () => void } | undefined
      if (rt) {
        rt.channels = rt.channels.filter((c: unknown) => c !== channel)
        if (rt.channels.length === 0) rt._schedulePendingDisconnect?.()
      }
      channel.unsubscribe().catch(() => {})
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ministryId, userId])

  return onlineIds
}
