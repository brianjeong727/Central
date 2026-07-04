"use server"

import { createAdminClient } from "@/lib/supabase-admin"
import { requireTeamMemberOrAdmin } from "@/app/actions/authz"

// ── Types ─────────────────────────────────────────────────────────────────────

export type RosterMember = {
  user_id: string
  name: string
  confirmed_at: string | null
}

export type RosterStatus = {
  confirmed: boolean
  confirmed_at: string | null
  confirmed_by: string | null
  needs_roster_renewal: boolean
}

// ── getDGLRosterAction ────────────────────────────────────────────────────────

export async function getDGLRosterAction(
  teamId: string,
  semester: string,
): Promise<{ status: RosterStatus | null; members: RosterMember[] }> {
  // Caller must be admin-tier or a member of this team, in this ministry.
  const authz = await requireTeamMemberOrAdmin(teamId)
  if (authz.error !== null) return { status: null, members: [] }

  const admin = createAdminClient()

  const { data: statusRow } = await admin
    .from("dgl_roster_status")
    .select("confirmed, confirmed_at, confirmed_by, needs_roster_renewal")
    .eq("team_id", teamId)
    .eq("semester", semester)
    .maybeSingle()

  if (!statusRow?.confirmed) {
    return { status: statusRow as RosterStatus | null, members: [] }
  }

  const { data: rosterRows } = await admin
    .from("dgl_roster")
    .select("user_id, confirmed_at")
    .eq("team_id", teamId)
    .eq("semester", semester)

  if (!rosterRows || rosterRows.length === 0) {
    return { status: statusRow as RosterStatus, members: [] }
  }

  const uids = rosterRows.map((r: { user_id: string }) => r.user_id)
  const { data: profiles } = await admin
    .from("profiles")
    .select("id, name")
    .in("id", uids)
  const nameMap = new Map((profiles ?? []).map((p: { id: string; name: string }) => [p.id, p.name]))

  return {
    status: statusRow as RosterStatus,
    members: rosterRows.map((r: { user_id: string; confirmed_at: string | null }) => ({
      user_id: r.user_id,
      name: nameMap.get(r.user_id) ?? "Unknown",
      confirmed_at: r.confirmed_at,
    })),
  }
}

// ── confirmDGLRosterAction ────────────────────────────────────────────────────
// Replaces the roster for the given team+semester with the given userIds.

export async function confirmDGLRosterAction(
  teamId: string,
  ministryId: string,
  userIds: string[],
  semester: string,
  presidentId: string,
): Promise<{ error?: string }> {
  if (userIds.length === 0) return { error: "Select at least one DGL." }

  // Caller must be admin-tier or a member of this team, in this ministry.
  const authz = await requireTeamMemberOrAdmin(teamId)
  if (authz.error !== null) return { error: authz.error }
  if (authz.ministryId !== ministryId) return { error: "Not authorized." }

  try {
    const admin = createAdminClient()
    const now = new Date().toISOString()

    // Delete old roster rows for this semester
    const { error: delErr } = await admin.from("dgl_roster").delete()
      .eq("team_id", teamId)
      .eq("semester", semester)
    if (delErr) return { error: `Failed to clear roster: ${delErr.message}` }

    // Insert new rows
    const { error: insertErr } = await admin.from("dgl_roster").insert(
      userIds.map(uid => ({
        team_id: teamId,
        ministry_id: ministryId,
        user_id: uid,
        semester,
        confirmed_at: now,
        added_by: presidentId,
      }))
    )
    if (insertErr) return { error: `Failed to save roster: ${insertErr.message}` }

    // Upsert status
    const { error: statusErr } = await admin.from("dgl_roster_status").upsert(
      {
        team_id: teamId,
        ministry_id: ministryId,
        semester,
        confirmed: true,
        confirmed_at: now,
        confirmed_by: presidentId,
        needs_roster_renewal: false,
      },
      { onConflict: "team_id,semester" }
    )
    if (statusErr) return { error: `Failed to update roster status: ${statusErr.message}` }

    return {}
  } catch (e) {
    return { error: `Unexpected error: ${e instanceof Error ? e.message : String(e)}` }
  }
}

// ── handleRosterRenewalAction ─────────────────────────────────────────────────
// Called when president responds to the June 1 renewal banner.
// action = 'keep': copy spring rows → fall of same year
// action = 'fresh': clear fall roster, set not confirmed

export async function handleRosterRenewalAction(
  teamId: string,
  ministryId: string,
  currentSemester: string,
  action: "keep" | "fresh",
  presidentId: string,
): Promise<{ error?: string }> {
  // Caller must be admin-tier or a member of this team, in this ministry.
  const authz = await requireTeamMemberOrAdmin(teamId)
  if (authz.error !== null) return { error: authz.error }
  if (authz.ministryId !== ministryId) return { error: "Not authorized." }

  const admin = createAdminClient()

  // currentSemester at June 1 is "summer_YEAR"
  const [, yearStr] = currentSemester.split("_")
  const year = parseInt(yearStr, 10)
  const prevSpring = `spring_${year}`
  const nextFall = `fall_${year}`
  const now = new Date().toISOString()

  // Clear the renewal flag regardless of action
  await admin.from("dgl_roster_status")
    .update({ needs_roster_renewal: false })
    .eq("team_id", teamId)
    .eq("semester", currentSemester)

  if (action === "keep") {
    // Fetch spring roster
    const { data: springRows } = await admin
      .from("dgl_roster")
      .select("user_id")
      .eq("team_id", teamId)
      .eq("semester", prevSpring)

    if (springRows && springRows.length > 0) {
      const userIds = springRows.map((r: { user_id: string }) => r.user_id)

      // Delete existing fall roster rows
      await admin.from("dgl_roster").delete()
        .eq("team_id", teamId)
        .eq("semester", nextFall)

      // Insert fall roster from spring
      await admin.from("dgl_roster").insert(
        userIds.map((uid: string) => ({
          team_id: teamId,
          ministry_id: ministryId,
          user_id: uid,
          semester: nextFall,
          confirmed_at: now,
          added_by: presidentId,
        }))
      )

      // Upsert fall roster status as confirmed
      await admin.from("dgl_roster_status").upsert(
        {
          team_id: teamId,
          ministry_id: ministryId,
          semester: nextFall,
          confirmed: true,
          confirmed_at: now,
          confirmed_by: presidentId,
          needs_roster_renewal: false,
        },
        { onConflict: "team_id,semester" }
      )
    }
  } else {
    // "fresh" — clear fall roster, mark not confirmed
    await admin.from("dgl_roster").delete()
      .eq("team_id", teamId)
      .eq("semester", nextFall)

    await admin.from("dgl_roster_status").upsert(
      {
        team_id: teamId,
        ministry_id: ministryId,
        semester: nextFall,
        confirmed: false,
        confirmed_at: null,
        confirmed_by: null,
        needs_roster_renewal: false,
      },
      { onConflict: "team_id,semester" }
    )
  }

  return {}
}
