"use server"

import { createClient } from "@/lib/supabase-server"
import { createAdminClient } from "@/lib/supabase-admin"
import { isAdminRole } from "@/lib/roles"

// Single source of truth for finance capability across budget + receipt actions.
// Status chain consumers (receipts.ts) and budget writes (budget-planning.ts) both
// gate on these. canApprove == "can edit finances / budget".

export interface FinanceCapability {
  canApprove: boolean
  canSignOff: boolean
}

// canApprove = member of a team_type='finance' team whose role permissions include
// `can_view_finances`, OR admin-tier (fallback so it's testable before a Finance
// team exists). canSignOff = `is_president` on a finance team, OR admin-tier.
export async function computeFinanceCapability(
  admin: ReturnType<typeof createAdminClient>,
  ministryId: string,
  userId: string,
  role: string,
): Promise<FinanceCapability> {
  if (isAdminRole(role)) {
    return { canApprove: true, canSignOff: true }
  }

  let canApprove = false
  let canSignOff = false

  const { data: financeTeams } = await admin
    .from("teams")
    .select("id")
    .eq("ministry_id", ministryId)
    .eq("team_type", "finance")
  const financeTeamIds = (financeTeams ?? []).map((t: { id: string }) => t.id)

  if (financeTeamIds.length > 0) {
    const { data: memberRows } = await admin
      .from("team_members")
      .select("team_id, team_roles!role_id(permissions, is_president)")
      .in("team_id", financeTeamIds)
      .eq("user_id", userId)
    for (const row of (memberRows ?? []) as { team_roles: { permissions?: string[]; is_president?: boolean } | null }[]) {
      if ((row.team_roles?.permissions ?? []).includes("can_view_finances")) canApprove = true
      if (row.team_roles?.is_president) canSignOff = true
    }
  }

  return { canApprove, canSignOff }
}

// Full identity + capability check for a given ministry. Verifies the caller is
// authenticated and belongs to `ministryId`, then computes their finance
// capability. Returns all-false (authed:false) when there is no user or the
// ministry doesn't match.
export async function getFinanceCapability(
  ministryId: string,
): Promise<{ canApprove: boolean; canSignOff: boolean; authed: boolean }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { canApprove: false, canSignOff: false, authed: false }

  const admin = createAdminClient()
  const { data: profile } = await admin
    .from("profiles")
    .select("ministry_id, role")
    .eq("id", user.id)
    .maybeSingle()
  if (!profile?.ministry_id || profile.ministry_id !== ministryId) {
    return { canApprove: false, canSignOff: false, authed: false }
  }

  const cap = await computeFinanceCapability(admin, ministryId, user.id, profile.role ?? "")
  return { canApprove: cap.canApprove, canSignOff: cap.canSignOff, authed: true }
}
