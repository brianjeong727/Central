// Shared server-side authorization helpers for server actions.
//
// NOT a "use server" file on purpose — these helpers must never be callable as
// standalone server-action endpoints. They are imported by "use server" files
// and run inside the caller's request context (cookies → Supabase session).
//
// Pattern (mirrors app/actions/ministry.ts / finance-auth.ts):
//   auth.getUser() → load the CALLER's own profiles.ministry_id + role →
//   verify against the caller-supplied ids → only then act with the admin client.

import { createClient } from "@/lib/supabase-server"
import { createAdminClient } from "@/lib/supabase-admin"
import { isAdminRole } from "@/lib/roles"

export type AuthzContext = { userId: string; ministryId: string; role: string; error: null }
export type AuthzFailure = { userId: null; ministryId: null; role: null; error: string }
export type AuthzResult = AuthzContext | AuthzFailure

function deny(error: string): AuthzFailure {
  return { userId: null, ministryId: null, role: null, error }
}

export function isAdminTier(role: string | null | undefined): boolean {
  return isAdminRole(role)
}

// Caller must be authenticated and belong to a ministry.
export async function requireMinistryMember(): Promise<AuthzResult> {
  const supabase = await createClient()
  const { data: { user }, error: authErr } = await supabase.auth.getUser()
  if (authErr || !user) return deny("Not authenticated.")

  const { data: profile } = await supabase
    .from("profiles")
    .select("ministry_id, role")
    .eq("id", user.id)
    .maybeSingle()
  if (!profile?.ministry_id) return deny("No ministry found.")

  return { userId: user.id, ministryId: profile.ministry_id, role: (profile.role ?? "").toLowerCase(), error: null }
}

// Caller must belong to exactly the given ministry (no role requirement —
// for team-scoped actions where a DB/team check does the finer gating).
export async function requireSameMinistry(ministryId: string): Promise<AuthzResult> {
  const ctx = await requireMinistryMember()
  if (ctx.error !== null) return ctx
  if (ctx.ministryId !== ministryId) return deny("Not authorized.")
  return ctx
}

// Caller must belong to the given ministry AND be admin-tier.
export async function requireMinistryAdmin(ministryId: string): Promise<AuthzResult> {
  const ctx = await requireSameMinistry(ministryId)
  if (ctx.error !== null) return ctx
  if (!isAdminTier(ctx.role)) return deny("Not authorized.")
  return ctx
}

// Caller must belong to the team's ministry AND be admin-tier OR a member of
// the team. (Governance admins are a subset of admin-tier, so gov-view/write
// callers pass via the admin-tier arm.)
export async function requireTeamMemberOrAdmin(teamId: string): Promise<AuthzResult> {
  const ctx = await requireMinistryMember()
  if (ctx.error !== null) return ctx

  const admin = createAdminClient()
  const { data: team } = await admin
    .from("teams")
    .select("ministry_id")
    .eq("id", teamId)
    .maybeSingle()
  if (!team || team.ministry_id !== ctx.ministryId) return deny("Not authorized.")

  if (isAdminTier(ctx.role)) return ctx

  const { data: member } = await admin
    .from("team_members")
    .select("id")
    .eq("team_id", teamId)
    .eq("user_id", ctx.userId)
    .maybeSingle()
  if (!member) return deny("Not authorized.")

  return ctx
}
