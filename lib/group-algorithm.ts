// Client-safe group generation algorithm — no server imports, no "use server"

export type PoolPerson = {
  id: string
  name: string
  graduation_year: number | null
  role: string
  gender?: string | null
}

export type DGLLeader = {
  user_id: string
  user_name: string
  gender: string | null
}

export type SGGeneratedGroup = {
  name: string
  leader_id: string
  leader_name: string
  leader_gender: string | null
  pair_leader_id: string | null
  members: PoolPerson[]
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

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

export function runAlgorithm(
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
    const visitors: PoolPerson[] = []
    const nonVisitors: PoolPerson[] = []
    for (const p of pool) {
      if (separateVisitors && p.role.toLowerCase() === "visitor") {
        visitors.push(p)
      } else {
        nonVisitors.push(p)
      }
    }

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

    for (const [k, v] of yearBuckets) yearBuckets.set(k, shuffle(v))

    const activeKeys = [
      ...YEAR_ORDER.filter((y) => (yearBuckets.get(y) ?? []).length > 0),
      ...((yearBuckets.get("unknown") ?? []).length > 0 ? (["unknown"] as const) : []),
    ]

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

    for (const v of shuffle(visitors)) {
      const minIdx = groups.reduce(
        (mi, g, i) => (g.length < groups[mi].length ? i : mi),
        0,
      )
      groups[minIdx].push(v)
    }
  } else {
    const shuffled = shuffle(pool)
    for (let i = 0; i < shuffled.length; i++) {
      groups[i % numGroups].push(shuffled[i])
    }
  }

  // Small group mode: swap-based penalty optimization
  if (smallGroupMode && prevPairings.length > 0) {
    const nameToId = new Map<string, string>()
    for (const p of pool) nameToId.set(p.name.toLowerCase(), p.id)

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

// Distributes pool members across DGL groups, matching gender within each pool.
// Members with no gender go to the smaller gender sub-pool.
export function runSmallGroupAlgorithm(
  dgls: DGLLeader[],
  pool: PoolPerson[],
  opts: { balanceByYear: boolean; separateVisitors: boolean; prevPairings?: PrevPairing[] },
): SGGeneratedGroup[] {
  const maleDGLs = dgls.filter(d => d.gender === "male")
  const femaleDGLs = dgls.filter(d => d.gender === "female")
  const unknownDGLs = dgls.filter(d => !d.gender)

  const augMale = [...maleDGLs]
  const augFemale = [...femaleDGLs]
  for (const d of unknownDGLs) {
    if (augMale.length <= augFemale.length) augMale.push(d)
    else augFemale.push(d)
  }

  const malePool = pool.filter(p => p.gender === "male")
  const femalePool = pool.filter(p => p.gender === "female")
  const unknownPool = pool.filter(p => !p.gender)

  const augMalePool = [...malePool]
  const augFemalePool = [...femalePool]
  for (const p of unknownPool) {
    if (augMalePool.length <= augFemalePool.length) augMalePool.push(p)
    else augFemalePool.push(p)
  }

  const result: SGGeneratedGroup[] = []

  const distribute = (dglList: DGLLeader[], memberPool: PoolPerson[]) => {
    if (dglList.length === 0) return
    if (memberPool.length === 0) {
      for (const dgl of dglList) {
        result.push({
          name: `${dgl.user_name.split(" ")[0]}'s Group`,
          leader_id: dgl.user_id,
          leader_name: dgl.user_name,
          leader_gender: dgl.gender,
          pair_leader_id: null,
          members: [],
        })
      }
      return
    }

    const numGroups = Math.min(dglList.length, memberPool.length)
    const genericGroups = runAlgorithm(memberPool, {
      ministryId: "",
      sourceType: "everyone",
      numGroups,
      balanceByYear: opts.balanceByYear,
      separateVisitors: opts.separateVisitors,
      smallGroupMode: false,
      prevPairings: opts.prevPairings,
      naming: "numeric",
    })

    for (let i = 0; i < dglList.length; i++) {
      const dgl = dglList[i]
      result.push({
        name: `${dgl.user_name.split(" ")[0]}'s Group`,
        leader_id: dgl.user_id,
        leader_name: dgl.user_name,
        leader_gender: dgl.gender,
        pair_leader_id: null,
        members: genericGroups[i]?.members ?? [],
      })
    }
  }

  distribute(augMale, augMalePool)
  const maleCount = augMale.length
  distribute(augFemale, augFemalePool)

  // Pair male group i with female group i by index
  for (let i = 0; i < maleCount; i++) {
    const femaleIdx = maleCount + i
    if (femaleIdx < result.length) {
      result[i].pair_leader_id = result[femaleIdx].leader_id
      result[femaleIdx].pair_leader_id = result[i].leader_id
    }
  }

  return result
}
