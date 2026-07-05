"use server"

import { createClient } from "@/lib/supabase-server"
import { createAdminClient } from "@/lib/supabase-admin"
import { SUPER_UUID, CENTRAL_MINISTRY_ID, HOME_ROLE, MINISTRY_ROLES } from "./super-constants"

// Switch the super account's ministry role to test the real gates + RLS.
// The privileged write uses the service-role client (a user can't change their
// own role under RLS) — safe because it's gated on the verified super identity
// AND confined to sandbox ministries (is_sandbox = true).
export async function switchMinistryRole(role: string): Promise<{ error: string | null }> {
  try {
    const supabase = await createClient()
    const { data: { user }, error: authErr } = await supabase.auth.getUser()
    if (authErr || !user) return { error: "not authorized" }
    if (user.id !== SUPER_UUID) return { error: "not authorized" }

    if (!(MINISTRY_ROLES as readonly string[]).includes(role)) {
      return { error: "invalid role" }
    }

    const admin = createAdminClient()

    // Guardrail: the super's current ministry must be a sandbox. This is what
    // confines write-as to sandbox ministries only.
    const { data: profile, error: profileErr } = await admin
      .from("profiles")
      .select("ministry_id")
      .eq("id", SUPER_UUID)
      .maybeSingle()
    if (profileErr) return { error: profileErr.message }
    if (!profile?.ministry_id) return { error: "super has no ministry" }

    const { data: ministry, error: ministryErr } = await admin
      .from("ministries")
      .select("is_sandbox")
      .eq("id", profile.ministry_id)
      .maybeSingle()
    if (ministryErr) return { error: ministryErr.message }
    if (!ministry?.is_sandbox) return { error: "current ministry is not a sandbox" }

    const { error: updateErr } = await admin
      .from("profiles")
      .update({ role })
      .eq("id", SUPER_UUID)
    if (updateErr) return { error: updateErr.message }

    return { error: null }
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Failed to switch role." }
  }
}

// Sandbox teams (+ their roles) for the workspace-role picker in the switcher chip.
// Super-gated. Reads via the admin client so the picker is unaffected by whatever
// role the super is currently acting as.
export type SandboxTeamRole = { id: string; name: string; is_president: boolean }
export type SandboxTeam = { id: string; name: string; icon: string | null; roles: SandboxTeamRole[] }

export async function getSandboxTeams(): Promise<{ teams: SandboxTeam[]; error: string | null }> {
  try {
    const supabase = await createClient()
    const { data: { user }, error: authErr } = await supabase.auth.getUser()
    if (authErr || !user) return { teams: [], error: "not authorized" }
    if (user.id !== SUPER_UUID) return { teams: [], error: "not authorized" }

    const admin = createAdminClient()
    const { data, error } = await admin
      .from("teams")
      .select("id, name, icon, team_roles ( id, name, is_president )")
      .eq("ministry_id", CENTRAL_MINISTRY_ID)
      .order("name", { ascending: true })
    if (error) return { teams: [], error: error.message }

    const teams: SandboxTeam[] = (data ?? []).map((t: {
      id: string; name: string; icon: string | null
      team_roles: { id: string; name: string; is_president: boolean }[] | null
    }) => ({
      id: t.id,
      name: t.name,
      icon: t.icon,
      roles: (t.team_roles ?? []).map((r) => ({
        id: r.id,
        name: r.name,
        is_president: !!r.is_president,
      })),
    }))

    return { teams, error: null }
  } catch (e) {
    return { teams: [], error: e instanceof Error ? e.message : "Failed to load teams." }
  }
}

// "Become" a specific team-role of a sandbox workspace so the super holds the real
// team permissions (can_plan_events, governance, finance capability) for testing.
// Delete-then-insert avoids the UNIQUE(team_id,user_id) conflict AND guarantees the
// resulting row is flagged via_super_switch=true (so reset strips it cleanly).
export async function switchWorkspaceRole(teamId: string, roleId: string): Promise<{ error: string | null }> {
  try {
    const supabase = await createClient()
    const { data: { user }, error: authErr } = await supabase.auth.getUser()
    if (authErr || !user) return { error: "not authorized" }
    if (user.id !== SUPER_UUID) return { error: "not authorized" }
    if (!teamId || !roleId) return { error: "invalid team or role" }

    const admin = createAdminClient()

    // Guardrail: the team must belong to a sandbox ministry. Confines write-as to
    // sandbox workspaces only.
    const { data: team, error: teamErr } = await admin
      .from("teams")
      .select("id, ministry_id, ministries!inner ( is_sandbox )")
      .eq("id", teamId)
      .maybeSingle<{ id: string; ministry_id: string; ministries: { is_sandbox: boolean } }>()
    if (teamErr) return { error: teamErr.message }
    if (!team) return { error: "team not found" }
    if (!team.ministries?.is_sandbox) return { error: "team is not in a sandbox ministry" }

    // The role must belong to this team.
    const { data: role, error: roleErr } = await admin
      .from("team_roles")
      .select("id")
      .eq("id", roleId)
      .eq("team_id", teamId)
      .maybeSingle()
    if (roleErr) return { error: roleErr.message }
    if (!role) return { error: "role does not belong to this team" }

    // Delete-then-insert: clears any prior row for (team, super) and re-adds one
    // that is flagged switcher-temp.
    const { error: delErr } = await admin
      .from("team_members")
      .delete()
      .eq("team_id", teamId)
      .eq("user_id", SUPER_UUID)
    if (delErr) return { error: delErr.message }

    const { error: insErr } = await admin
      .from("team_members")
      .insert({
        team_id: teamId,
        user_id: SUPER_UUID,
        role_id: roleId,
        added_by: SUPER_UUID,
        via_super_switch: true,
      })
    if (insErr) return { error: insErr.message }

    return { error: null }
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Failed to switch workspace role." }
  }
}

// Return the super account to its home state (pastor of the Central sandbox) and
// strip every switcher-added team membership. Legit memberships (not flagged) stay.
export async function resetToSuper(): Promise<{ error: string | null }> {
  try {
    const supabase = await createClient()
    const { data: { user }, error: authErr } = await supabase.auth.getUser()
    if (authErr || !user) return { error: "not authorized" }
    if (user.id !== SUPER_UUID) return { error: "not authorized" }

    const admin = createAdminClient()
    const { error: updateErr } = await admin
      .from("profiles")
      .update({ role: HOME_ROLE, ministry_id: CENTRAL_MINISTRY_ID })
      .eq("id", SUPER_UUID)
    if (updateErr) return { error: updateErr.message }

    const { error: delErr } = await admin
      .from("team_members")
      .delete()
      .eq("user_id", SUPER_UUID)
      .eq("via_super_switch", true)
    if (delErr) return { error: delErr.message }

    return { error: null }
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Failed to reset." }
  }
}
