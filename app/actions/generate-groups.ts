"use server"

import { createAdminClient } from "@/lib/supabase-admin"

export type PoolPerson = {
  id: string
  name: string
  graduation_year: number | null
  role: string
}

export type GeneratedGroup = {
  name: string
  members: PoolPerson[]
}

export type PrevPairing = { name: string; groupLabel: string }

export type GenerateGroupsParams = {
  ministryId: string
  sourceType: "everyone" | "announcement" | "form"
  sourceId?: string
  numGroups: number
  balanceByYear: boolean
  separateVisitors: boolean
  smallGroupMode: boolean
  prevPairings?: PrevPairing[]
  naming: "numeric" | "alpha"
}

export async function generateGroupsAction(
  params: GenerateGroupsParams,
): Promise<{ groups: GeneratedGroup[]; error?: string }> {
  const admin = createAdminClient()

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
      // form_responses.user_id → auth.users, not profiles — must do two-step lookup
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

// ── Algorithm ────────────────────────────────────────────────────────────────

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

function runAlgorithm(
  pool: PoolPerson[],
  opts: GenerateGroupsParams & { numGroups: number },
): GeneratedGroup[] {
  const {
    numGroups,
    balanceByYear,
    separateVisitors,
    smallGroupMode,
    prevPairings = [],
    naming,
  } = opts

  const groupNames = Array.from({ length: numGroups }, (_, i) =>
    naming === "alpha"
      ? `Group ${String.fromCharCode(65 + i)}`
      : `Group ${i + 1}`,
  )

  const groups: PoolPerson[][] = Array.from({ length: numGroups }, () => [])

  if (balanceByYear) {
    // Separate visitors from members if toggle is on
    const visitors: PoolPerson[] = []
    const nonVisitors: PoolPerson[] = []
    for (const p of pool) {
      if (separateVisitors && p.role.toLowerCase() === "visitor") {
        visitors.push(p)
      } else {
        nonVisitors.push(p)
      }
    }

    // Bucket non-visitors by graduation year
    const YEAR_ORDER = [2025, 2026, 2027, 2028]
    const yearBuckets = new Map<number | "unknown", PoolPerson[]>()
    YEAR_ORDER.forEach((y) => yearBuckets.set(y, []))
    yearBuckets.set("unknown", [])

    for (const p of nonVisitors) {
      const y = p.graduation_year
      if (y && YEAR_ORDER.includes(y)) {
        yearBuckets.get(y)!.push(p)
      } else {
        yearBuckets.get("unknown")!.push(p)
      }
    }

    // Shuffle within each bucket
    for (const [k, v] of yearBuckets) yearBuckets.set(k, shuffle(v))

    // Active buckets in order
    const activeKeys = [
      ...YEAR_ORDER.filter((y) => (yearBuckets.get(y) ?? []).length > 0),
      ...((yearBuckets.get("unknown") ?? []).length > 0 ? (["unknown"] as const) : []),
    ]

    // Round-robin: one from each year per pass
    let gIdx = 0
    let anyLeft = true
    while (anyLeft) {
      anyLeft = false
      for (const key of activeKeys) {
        const bucket = yearBuckets.get(key)!
        if (bucket.length > 0) {
          groups[gIdx % numGroups].push(bucket.shift()!)
          gIdx++
          anyLeft = true
        }
      }
    }

    // Distribute visitors evenly — one at a time into the smallest group
    for (const v of shuffle(visitors)) {
      const minIdx = groups.reduce(
        (mi, g, i) => (g.length < groups[mi].length ? i : mi),
        0,
      )
      groups[minIdx].push(v)
    }
  } else {
    // Simple shuffle + round-robin
    const shuffled = shuffle(pool)
    for (let i = 0; i < shuffled.length; i++) {
      groups[i % numGroups].push(shuffled[i])
    }
  }

  // ── Small group mode: swap-based penalty optimization ─────────────────────
  if (smallGroupMode && prevPairings.length > 0) {
    // Build a name→userId lookup from the current pool
    const nameToId = new Map<string, string>()
    for (const p of pool) nameToId.set(p.name.toLowerCase(), p.id)

    // Build pair penalty map from previous groupings
    const pairPenalty = new Map<string, number>()
    const prevByGroup = new Map<string, string[]>()
    for (const { name, groupLabel } of prevPairings) {
      const uid = nameToId.get(name.toLowerCase())
      if (!uid) continue
      if (!prevByGroup.has(groupLabel)) prevByGroup.set(groupLabel, [])
      prevByGroup.get(groupLabel)!.push(uid)
    }
    const pairKey = (a: string, b: string) => [a, b].sort().join("|")
    for (const members of prevByGroup.values()) {
      for (let i = 0; i < members.length; i++) {
        for (let j = i + 1; j < members.length; j++) {
          const k = pairKey(members[i], members[j])
          pairPenalty.set(k, (pairPenalty.get(k) ?? 0) + 1)
        }
      }
    }

    const groupScore = (g: PoolPerson[]) => {
      let s = 0
      for (let i = 0; i < g.length; i++)
        for (let j = i + 1; j < g.length; j++)
          s += pairPenalty.get(pairKey(g[i].id, g[j].id)) ?? 0
      return s
    }
    const totalScore = () => groups.reduce((s, g) => s + groupScore(g), 0)

    // Swap optimization: up to 60 passes, stop early if no improvement
    for (let pass = 0; pass < 60; pass++) {
      let improved = false
      for (let gi = 0; gi < groups.length; gi++) {
        for (let pi = 0; pi < groups[gi].length; pi++) {
          for (let gj = gi + 1; gj < groups.length; gj++) {
            for (let pj = 0; pj < groups[gj].length; pj++) {
              const before = totalScore()
              ;[groups[gi][pi], groups[gj][pj]] = [groups[gj][pj], groups[gi][pi]]
              if (totalScore() < before) {
                improved = true
              } else {
                ;[groups[gi][pi], groups[gj][pj]] = [groups[gj][pj], groups[gi][pi]]
              }
            }
          }
        }
      }
      if (!improved) break
    }
  }

  return groups.map((members, i) => ({ name: groupNames[i], members }))
}
