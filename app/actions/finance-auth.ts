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
  // Read-only finance oversight (the finance deacon). canApprove/canSignOff both
  // imply canView; canView alone (via `can_audit_finances`) grants VIEW only.
  canView: boolean
}

// canApprove = member of a team_type='finance' team whose role permissions include
// `can_view_finances`, OR admin-tier (fallback so it's testable before a Finance
// team exists). canSignOff = `is_president` on a finance team, OR admin-tier.
// canView = canApprove || canSignOff || admin-tier || a role granting
// `can_audit_finances` (read-only oversight — never approve/sign-off/write).
export async function computeFinanceCapability(
  admin: ReturnType<typeof createAdminClient>,
  ministryId: string,
  userId: string,
  role: string,
): Promise<FinanceCapability> {
  if (isAdminRole(role)) {
    return { canApprove: true, canSignOff: true, canView: true }
  }

  let canApprove = false
  let canSignOff = false
  let canView = false

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
      const perms = row.team_roles?.permissions ?? []
      if (perms.includes("can_view_finances")) { canApprove = true; canView = true }
      if (perms.includes("can_audit_finances")) canView = true
      if (row.team_roles?.is_president) { canSignOff = true; canView = true }
    }
  }

  return { canApprove, canSignOff, canView }
}

// Full identity + capability check for a given ministry. Verifies the caller is
// authenticated and belongs to `ministryId`, then computes their finance
// capability. Returns all-false (authed:false) when there is no user or the
// ministry doesn't match.
export async function getFinanceCapability(
  ministryId: string,
): Promise<{ canApprove: boolean; canSignOff: boolean; canView: boolean; authed: boolean }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { canApprove: false, canSignOff: false, canView: false, authed: false }

  const admin = createAdminClient()
  const { data: profile } = await admin
    .from("profiles")
    .select("ministry_id, role")
    .eq("id", user.id)
    .maybeSingle()
  if (!profile?.ministry_id || profile.ministry_id !== ministryId) {
    return { canApprove: false, canSignOff: false, canView: false, authed: false }
  }

  const cap = await computeFinanceCapability(admin, ministryId, user.id, profile.role ?? "")
  return { canApprove: cap.canApprove, canSignOff: cap.canSignOff, canView: cap.canView, authed: true }
}
