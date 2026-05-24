"use server"

import { createAdminClient } from "@/lib/supabase-admin"
import { SLOTS } from "./dgl-constants"
import type { DGLSlot, ProposedAssignment } from "./dgl-constants"

export type GenerateRotationParams = {
  teamId: string
  ministryId: string
  semester: string
  weeks: string[]  // ISO date strings for each week in the semester (anchor Sundays)
}

export type GenerateRotationResult = {
  assignments: ProposedAssignment[]
  flaggedWeeks: { week_date: string; slot: DGLSlot; reason: string }[]
  error?: string
}

type DGLPair = { a: string; b: string; aName: string; bName: string }

// Maps a rotation slot + its anchor Sunday to the specific date and avail slot key
const SLOT_TO_AVAIL = {
  wednesday_pm:   { dayOffset: -4, availSlot: "wednesday" },
  friday_sg:      { dayOffset: -2, availSlot: "friday" },
  sunday_service: { dayOffset:  0, availSlot: "sunday" },
}

function dateForSlot(sundayStr: string, slot: DGLSlot): string {
  const [y, m, d] = sundayStr.split("-").map(Number)
  const dt = new Date(y, m - 1, d)
  dt.setDate(dt.getDate() + SLOT_TO_AVAIL[slot].dayOffset)
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}-${String(dt.getDate()).padStart(2, "0")}`
}

// ── Main action ───────────────────────────────────────────────────────────────

export async function generateDGLRotationAction(
  params: GenerateRotationParams,
): Promise<GenerateRotationResult> {
  try {
    const admin = createAdminClient()

    // 1. Fetch confirmed roster for this team+semester
    const { data: rosterStatus } = await admin
      .from("dgl_roster_status")
      .select("confirmed")
      .eq("team_id", params.teamId)
      .eq("semester", params.semester)
      .maybeSingle()

    if (!rosterStatus?.confirmed) {
      return { assignments: [], flaggedWeeks: [], error: "Confirm the DGL roster on the Home tab before generating assignments." }
    }

    const { data: rosterRows, error: rErr } = await admin
      .from("dgl_roster")
      .select("user_id")
      .eq("team_id", params.teamId)
      .eq("semester", params.semester)
    if (rErr || !rosterRows) return { assignments: [], flaggedWeeks: [], error: "Failed to fetch roster." }

    const memberIds = rosterRows.map((r: { user_id: string }) => r.user_id)
    if (memberIds.length === 0) return { assignments: [], flaggedWeeks: [], error: "No DGLs in the roster for this semester." }

    const { data: profileRows } = await admin
      .from("profiles")
      .select("id, name")
      .in("id", memberIds)
    const profiles = new Map<string, string>(
      (profileRows ?? []).map((p: { id: string; name: string }) => [p.id, p.name])
    )

    // 2. Fetch DGL pairs from small_groups (leader_id ↔ paired leader_id)
    const { data: sgRows } = await admin
      .from("small_groups")
      .select("id, leader_id, paired_group_id")
      .eq("team_id", params.teamId)
      .not("paired_group_id", "is", null)

    // Build pairs list (deduplicated — each pair appears once)
    const pairs: DGLPair[] = []
    const pairedSet = new Set<string>()
    const leaderByGroupId = new Map<string, string>()
    for (const sg of (sgRows ?? []) as { id: string; leader_id: string; paired_group_id: string }[]) {
      leaderByGroupId.set(sg.id, sg.leader_id)
    }
    for (const sg of (sgRows ?? []) as { id: string; leader_id: string; paired_group_id: string }[]) {
      const pairKey = [sg.leader_id, sg.paired_group_id].sort().join("::")
      if (pairedSet.has(pairKey)) continue
      pairedSet.add(pairKey)
      const pairedLeaderId = leaderByGroupId.get(sg.paired_group_id)
      if (!pairedLeaderId) continue
      // Only include pairs where both DGLs are in the current roster
      if (!memberIds.includes(sg.leader_id) || !memberIds.includes(pairedLeaderId)) continue
      pairs.push({
        a: sg.leader_id,
        b: pairedLeaderId,
        aName: profiles.get(sg.leader_id) ?? sg.leader_id,
        bName: profiles.get(pairedLeaderId) ?? pairedLeaderId,
      })
    }

    // 3. Fetch date-specific availability
    const { data: availRows } = await admin
      .from("dgl_availability")
      .select("user_id, week_date, slot, is_busy")
      .eq("team_id", params.teamId)
      .eq("semester", params.semester)

    // Build busy set: key = `${user_id}::${week_date}::${availSlot}` (e.g. "uid::2026-01-14::wednesday")
    const busySet = new Set<string>(
      (availRows ?? [])
        .filter((r: { is_busy: boolean }) => r.is_busy)
        .map((r: { user_id: string; week_date: string; slot: string }) => `${r.user_id}::${r.week_date}::${r.slot}`)
    )

    // 4. Run assignment algorithm
    const assignments: ProposedAssignment[] = []
    const flaggedWeeks: GenerateRotationResult["flaggedWeeks"] = []

    // slotCounts[uid][slot] = times this person has been assigned to this slot.
    const slotCounts = new Map<string, Map<DGLSlot, number>>()
    for (const uid of memberIds) slotCounts.set(uid, new Map())

    // totalCounts drives fairness (fewest-assigned gets priority).
    const totalCounts = new Map<string, number>(memberIds.map(id => [id, 0]))

    // pairCounts[pairKey] = times this pair has been assigned to friday_sg.
    const pairCounts = new Map<string, number>()

    for (const weekDate of params.weeks) {
      for (const slot of SLOTS) {
        const specificDate = dateForSlot(weekDate, slot)
        const availSlot = SLOT_TO_AVAIL[slot].availSlot

        if (slot === "friday_sg" && pairs.length > 0) {
          // ── Friday: assign a PAIR, not an individual ──────────────────────
          const availablePairs = pairs.filter(p =>
            !busySet.has(`${p.a}::${specificDate}::${availSlot}`) &&
            !busySet.has(`${p.b}::${specificDate}::${availSlot}`)
          )

          const needsReview = availablePairs.length === 0
          if (needsReview) {
            flaggedWeeks.push({ week_date: weekDate, slot, reason: "No available DGL pair." })
          }

          const pool = availablePairs.length > 0 ? availablePairs : pairs
          const picked = pickFairestPair(pool, totalCounts, pairCounts)
          if (picked) {
            const pk = [picked.a, picked.b].sort().join("::")
            pairCounts.set(pk, (pairCounts.get(pk) ?? 0) + 1)
            for (const [uid, name] of [[picked.a, picked.aName], [picked.b, picked.bName]] as [string, string][]) {
              assignments.push({ week_date: weekDate, slot, user_id: uid, user_name: name, needs_review: needsReview })
              const sc = slotCounts.get(uid)!
              sc.set(slot, (sc.get(slot) ?? 0) + 1)
              totalCounts.set(uid, (totalCounts.get(uid) ?? 0) + 1)
            }
          }
        } else {
          // ── Other slots (and friday fallback if no pairs configured) ──────
          const available = memberIds.filter(uid => !busySet.has(`${uid}::${specificDate}::${availSlot}`))

          if (available.length === 0) {
            flaggedWeeks.push({ week_date: weekDate, slot, reason: "No available DGLs." })
          }

          const picked = pickFairest(available.length > 0 ? available : memberIds, totalCounts, slotCounts, slot)
          if (picked) {
            assignments.push({
              week_date: weekDate, slot,
              user_id: picked,
              user_name: profiles.get(picked) ?? picked,
              needs_review: available.length === 0,
            })
            const sc = slotCounts.get(picked)!
            sc.set(slot, (sc.get(slot) ?? 0) + 1)
            totalCounts.set(picked, (totalCounts.get(picked) ?? 0) + 1)
          }
        }
      }
    }

    return { assignments, flaggedWeeks }
  } catch (e) {
    return { assignments: [], flaggedWeeks: [], error: `Unexpected error: ${e instanceof Error ? e.message : String(e)}` }
  }
}

// Picks the pair with fewest total Friday assignments (sum of both counts), ties broken by min individual count.
function pickFairestPair(
  candidates: DGLPair[],
  totalCounts: Map<string, number>,
  pairCounts: Map<string, number>,
): DGLPair | null {
  if (candidates.length === 0) return null
  const pool = [...candidates]
  pool.sort((p1, p2) => {
    const pk1 = [p1.a, p1.b].sort().join("::")
    const pk2 = [p2.a, p2.b].sort().join("::")
    const pc1 = pairCounts.get(pk1) ?? 0
    const pc2 = pairCounts.get(pk2) ?? 0
    if (pc1 !== pc2) return pc1 - pc2
    const total1 = (totalCounts.get(p1.a) ?? 0) + (totalCounts.get(p1.b) ?? 0)
    const total2 = (totalCounts.get(p2.a) ?? 0) + (totalCounts.get(p2.b) ?? 0)
    return total1 - total2
  })
  return pool[0]
}

// Primary sort: fewest times in this specific slot (avoid back-to-back same slot).
// Secondary: fewest total assignments (fairness). No hard cap on repeats.
function pickFairest(
  candidates: string[],
  totalCounts: Map<string, number>,
  slotCounts: Map<string, Map<DGLSlot, number>>,
  slot: DGLSlot,
): string | null {
  if (candidates.length === 0) return null
  const pool = [...candidates]
  pool.sort((a, b) => {
    const aSlot = slotCounts.get(a)?.get(slot) ?? 0
    const bSlot = slotCounts.get(b)?.get(slot) ?? 0
    if (aSlot !== bSlot) return aSlot - bSlot
    return (totalCounts.get(a) ?? 0) - (totalCounts.get(b) ?? 0)
  })
  return pool[0]
}

// ── Publish action ────────────────────────────────────────────────────────────

export async function saveDGLRotationAction(params: {
  teamId: string
  ministryId: string
  semester: string
  assignments: Omit<ProposedAssignment, "user_name" | "needs_review">[]
}): Promise<{ error?: string }> {
  const admin = createAdminClient()

  // Delete existing unpublished assignments for this team+semester before saving
  await admin
    .from("dgl_assignments")
    .delete()
    .eq("team_id", params.teamId)
    .eq("semester", params.semester)
    .eq("published", false)

  if (params.assignments.length === 0) return {}

  const rows = params.assignments.map(a => ({
    team_id: params.teamId,
    ministry_id: params.ministryId,
    user_id: a.user_id,
    week_date: a.week_date,
    slot: a.slot,
    semester: params.semester,
    published: false,
  }))

  const { error } = await admin.from("dgl_assignments").insert(rows)
  if (error) return { error: "Failed to save rotation." }
  return {}
}

export async function publishDGLRotationAction(params: {
  teamId: string
  ministryId: string
  semester: string
  publish: boolean
}): Promise<{ error?: string }> {
  const admin = createAdminClient()
  const { error } = await admin
    .from("dgl_assignments")
    .update({ published: params.publish })
    .eq("team_id", params.teamId)
    .eq("semester", params.semester)
  if (error) return { error: "Failed to update publish status." }

  if (params.publish) {
    await autoCreateDGDinnerForms(admin, params.teamId, params.ministryId, params.semester)
  }

  return {}
}

// Computes Friday ISO date from an anchor Sunday string
function fridayFromSunday(sundayStr: string): string {
  const [y, m, d] = sundayStr.split("-").map(Number)
  const dt = new Date(y, m - 1, d)
  dt.setDate(dt.getDate() - 2)
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}-${String(dt.getDate()).padStart(2, "0")}`
}

function formatFridayLabel(fridayDate: string): string {
  const [y, m, d] = fridayDate.split("-").map(Number)
  const dt = new Date(y, m - 1, d)
  return dt.toLocaleDateString("en-US", { month: "short", day: "numeric" })
}

async function autoCreateDGDinnerForms(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  admin: any,
  teamId: string,
  ministryId: string,
  semester: string,
) {
  // 1. Fetch all published friday_sg assignments
  const { data: assignments } = await admin
    .from("dgl_assignments")
    .select("user_id, week_date")
    .eq("team_id", teamId)
    .eq("semester", semester)
    .eq("slot", "friday_sg")
    .eq("published", true)

  if (!assignments?.length) return

  // 2. Group by week_date → get pair of DGL IDs per Sunday anchor
  const byWeek = new Map<string, string[]>()
  for (const row of assignments as { user_id: string; week_date: string }[]) {
    const list = byWeek.get(row.week_date) ?? []
    list.push(row.user_id)
    byWeek.set(row.week_date, list)
  }

  // 3. Find Treasurer name for this ministry
  const { data: treasurerRows } = await admin
    .from("team_members")
    .select("profiles!user_id(name), team_roles!role_id(permissions), teams!team_id(ministry_id)")
    .eq("teams.ministry_id", ministryId)
  let treasurerName = "Treasurer"
  if (treasurerRows) {
    for (const row of treasurerRows as Record<string, unknown>[]) {
      const perms = (row.team_roles as { permissions?: string[] } | null)?.permissions ?? []
      if (perms.includes("can_view_finances")) {
        treasurerName = (row.profiles as { name?: string } | null)?.name ?? "Treasurer"
        break
      }
    }
  }

  // 4. Upsert one form per Friday
  const { upsertDGDinnerForms } = await import("./reimbursements")
  const forms = Array.from(byWeek.entries()).map(([sundayDate, dglIds]) => {
    const fridayDate = fridayFromSunday(sundayDate)
    return {
      fridayDate,
      assignedDglIds: dglIds,
      treasurerName,
      expensePurpose: `DG Dinner – ${formatFridayLabel(fridayDate)}`,
    }
  })

  await upsertDGDinnerForms({ ministryId, forms })
}

