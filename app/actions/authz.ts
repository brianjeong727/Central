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
import { isAdminRole, isLeaderRole } from "@/lib/roles"

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

// Caller must belong to the given ministry AND be leader-tier (leader + admin,
// deacon, elder, pastor). Exactly the DB's auth_is_admin_or_leader() and exactly
// lib/roles.ts's isLeaderRole — the three must stay in lockstep, since a gate the
// action allows but RLS refuses (or vice versa) is the failure mode that matters.
export async function requireMinistryLeader(ministryId: string): Promise<AuthzResult> {
  const ctx = await requireSameMinistry(ministryId)
  if (ctx.error !== null) return ctx
  if (!isLeaderRole(ctx.role)) return deny("Not authorized.")
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

// Caller may PLAN a specific event: belongs to the plan's ministry AND is
// leader/admin-tier OR holds `can_plan_events` on any of their team roles.
// This is the single source of truth for "can plan this event" — it mirrors the
// event_confirmations INSERT RLS and the plan-tab `canEdit` gate, and is shared
// by the confirmation actions (event-confirmations.ts) and the planning-chat
// actions (auto-chats.ts) so a legit planner is never blocked by one but not the
// other. The `can_plan_events` arm is not plan-scoped (verbatim mirror of the
// write RLS); the same-ministry check above provides tenant isolation.
export async function requirePlanPlanner(eventPlanId: string): Promise<AuthzResult> {
  const ctx = await requireMinistryMember()
  if (ctx.error !== null) return ctx

  const admin = createAdminClient()
  const { data: plan } = await admin
    .from("event_plans")
    .select("ministry_id")
    .eq("id", eventPlanId)
    .maybeSingle()
  if (!plan || plan.ministry_id !== ctx.ministryId) return deny("Not authorized.")

  return (await hasCanPlanEvents(admin, ctx)) ? ctx : deny("Not authorized.")
}

// The plan-AGNOSTIC half of requirePlanPlanner: admin-tier/leader OR holds
// `can_plan_events` on any team role. Deliberately carries NO tenant check —
// it is only ever the second half of a gate whose caller has already proven
// same-ministry (requirePlanPlanner via the plan row; the callers below via the
// block's / plan's / team's own ministry_id).
//
// Exported because three actions (season-rollover, event-blocks, event-templates)
// need this arm without a plan id, and each had hand-rolled a byte-identical
// private copy — four copies of one authorization predicate, so a tightening in
// one silently left three open (found by the 2026-08-04 audit).
export async function hasCanPlanEvents(
  admin: ReturnType<typeof createAdminClient>,
  ctx: AuthzContext,
): Promise<boolean> {
  if (isLeaderRole(ctx.role)) return true
  const { data: memberships } = await admin
    .from("team_members")
    .select("id, team_roles!role_id(permissions)")
    .eq("user_id", ctx.userId)
  return ((memberships ?? []) as { team_roles: { permissions?: string[] } | null }[]).some(
    (m) => (m.team_roles?.permissions ?? []).includes("can_plan_events"),
  )
}
