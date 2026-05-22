"use server"

import { createAdminClient } from "@/lib/supabase-admin"

// ── Types ─────────────────────────────────────────────────────────────────────

export type DGLSlot = "wednesday_pm" | "friday_sg" | "sunday_service"
export type DGLRole =
  | "leading_pm"
  | "pm_praise"
  | "cooking"
  | "friday_praise"
  | "congregational_prayer"
  | "dishes"

export const SLOT_ROLES: Record<DGLSlot, [DGLRole, DGLRole]> = {
  wednesday_pm:    ["leading_pm", "pm_praise"],
  friday_sg:       ["cooking", "friday_praise"],
  sunday_service:  ["congregational_prayer", "dishes"],
}

export const SLOTS: DGLSlot[] = ["wednesday_pm", "friday_sg", "sunday_service"]

export type ProposedAssignment = {
  week_date: string  // ISO date
  slot: DGLSlot
  role: DGLRole
  user_id: string
  user_name: string
  needs_review: boolean
}

export type GenerateRotationParams = {
  teamId: string
  ministryId: string
  semester: string
  weeks: string[]  // ISO date strings for each week in the semester
}

export type GenerateRotationResult = {
  assignments: ProposedAssignment[]
  flaggedWeeks: { week_date: string; slot: DGLSlot; reason: string }[]
  error?: string
}

// ── Main action ───────────────────────────────────────────────────────────────

export async function generateDGLRotationAction(
  params: GenerateRotationParams,
): Promise<GenerateRotationResult> {
  const admin = createAdminClient()

  // 1. Fetch all DGLs on the team (two-step: team_members → profiles)
  const { data: memberRows, error: mErr } = await admin
    .from("team_members")
    .select("user_id")
    .eq("team_id", params.teamId)
  if (mErr || !memberRows) return { assignments: [], flaggedWeeks: [], error: "Failed to fetch team members." }

  const memberIds = memberRows.map((r: { user_id: string }) => r.user_id)
  if (memberIds.length === 0) return { assignments: [], flaggedWeeks: [], error: "No DGLs on this team." }

  const { data: profileRows } = await admin
    .from("profiles")
    .select("id, name")
    .in("id", memberIds)
  const profiles = new Map<string, string>(
    (profileRows ?? []).map((p: { id: string; name: string }) => [p.id, p.name])
  )

  // 2. Fetch availability for this team + semester
  const { data: availRows } = await admin
    .from("dgl_availability")
    .select("user_id, week_date, slot, is_busy")
    .eq("team_id", params.teamId)
    .eq("semester", params.semester)

  // Build busy set: key = `${user_id}::${week_date}::${slot}`
  const busySet = new Set<string>(
    (availRows ?? [])
      .filter((r: { is_busy: boolean }) => r.is_busy)
      .map((r: { user_id: string; week_date: string; slot: string }) => `${r.user_id}::${r.week_date}::${r.slot}`)
  )

  // 3. Run assignment algorithm
  const assignments: ProposedAssignment[] = []
  const flaggedWeeks: GenerateRotationResult["flaggedWeeks"] = []

  // Track per-role assignment count this semester (max 1 per DGL per role)
  const roleCounts = new Map<string, Map<DGLRole, number>>()
  for (const uid of memberIds) {
    roleCounts.set(uid, new Map())
  }

  // Track total assignment counts for fairness
  const totalCounts = new Map<string, number>(memberIds.map(id => [id, 0]))

  for (const weekDate of params.weeks) {
    for (const slot of SLOTS) {
      const [role1, role2] = SLOT_ROLES[slot]

      // Filter: available (not busy) + hasn't hit max 1 per role this semester
      const available = memberIds.filter(uid => {
        const isBusy = busySet.has(`${uid}::${weekDate}::${slot}`)
        return !isBusy
      })

      // Assign role1 — filter out anyone who already has this role
      const availForRole1 = available.filter(uid => (roleCounts.get(uid)?.get(role1) ?? 0) < 1)
      // Assign role2 — filter out anyone who already has role2, and exclude person picked for role1
      const picked1 = pickFairest(availForRole1, totalCounts)

      const availForRole2 = available.filter(
        uid => uid !== picked1 && (roleCounts.get(uid)?.get(role2) ?? 0) < 1
      )
      const picked2 = pickFairest(availForRole2, totalCounts, picked1 ? [picked1] : [])

      const needsReview = !picked1 || !picked2

      if (needsReview) {
        flaggedWeeks.push({
          week_date: weekDate,
          slot,
          reason:
            !picked1 && !picked2
              ? "No available DGLs for either role."
              : `Only ${picked1 ? 1 : 0} DGL available — need 2.`,
        })
      }

      // Add whatever we have (partial or full)
      for (const [picked, role] of [[picked1, role1], [picked2, role2]] as [string | null, DGLRole][]) {
        if (!picked) continue
        assignments.push({
          week_date: weekDate,
          slot,
          role,
          user_id: picked,
          user_name: profiles.get(picked) ?? picked,
          needs_review: needsReview,
        })
        // Update counts
        const rc = roleCounts.get(picked)!
        rc.set(role, (rc.get(role) ?? 0) + 1)
        totalCounts.set(picked, (totalCounts.get(picked) ?? 0) + 1)
      }
    }
  }

  return { assignments, flaggedWeeks }
}

// Pick the available DGL with the fewest total assignments so far (fairness)
function pickFairest(
  candidates: string[],
  totalCounts: Map<string, number>,
  exclude: string[] = [],
): string | null {
  const pool = candidates.filter(c => !exclude.includes(c))
  if (pool.length === 0) return null
  pool.sort((a, b) => (totalCounts.get(a) ?? 0) - (totalCounts.get(b) ?? 0))
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
    role: a.role,
    semester: params.semester,
    published: false,
  }))

  const { error } = await admin.from("dgl_assignments").insert(rows)
  if (error) return { error: "Failed to save rotation." }
  return {}
}

export async function publishDGLRotationAction(params: {
  teamId: string
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
  return {}
}

