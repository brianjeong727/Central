"use server"

import { createClient } from "@/lib/supabase-server"
import { createAdminClient } from "@/lib/supabase-admin"

const ADMIN_ROLES = ["admin", "deacon", "elder", "pastor"]

// ─── Governance roster (ministries.governance_settings) ──────────────────────
// WHO governs teams: all admin-tier users (all_admins=true) or a curated subset
// of admin-tier user ids (all_admins=false → roster_ids).
export async function updateGovernanceSettings(settings: {
  all_admins: boolean
  roster_ids: string[]
}): Promise<{ error: string | null }> {
  const supabase = await createClient()
  const { data: { user }, error: authErr } = await supabase.auth.getUser()
  if (authErr || !user) return { error: "Not authenticated." }

  const { data: profile } = await supabase.from("profiles").select("ministry_id, role").eq("id", user.id).maybeSingle()
  if (!profile?.ministry_id) return { error: "No ministry found." }
  if (!ADMIN_ROLES.includes(profile.role.toLowerCase())) return { error: "Only admins can update governance settings." }

  const all_admins = !!settings.all_admins
  const roster_ids = Array.isArray(settings.roster_ids)
    ? [...new Set(settings.roster_ids.filter((id) => typeof id === "string" && id.length > 0))]
    : []

  const admin = createAdminClient()
  const { error } = await admin
    .from("ministries")
    .update({ governance_settings: { all_admins, roster_ids } })
    .eq("id", profile.ministry_id)

  return { error: error?.message ?? null }
}

// ─── Per-team admin access (teams.admin_access) ──────────────────────────────
// WHAT governing admins get on a given team: none | view | write.
export async function updateTeamAdminAccess(
  teamId: string,
  access: "none" | "view" | "write",
): Promise<{ error: string | null }> {
  const supabase = await createClient()
  const { data: { user }, error: authErr } = await supabase.auth.getUser()
  if (authErr || !user) return { error: "Not authenticated." }

  const { data: profile } = await supabase.from("profiles").select("ministry_id, role").eq("id", user.id).maybeSingle()
  if (!profile?.ministry_id) return { error: "No ministry found." }
  if (!ADMIN_ROLES.includes(profile.role.toLowerCase())) return { error: "Only admins can update team access." }
  if (!["none", "view", "write"].includes(access)) return { error: "Invalid access level." }

  const admin = createAdminClient()
  // Verify the team belongs to the caller's ministry before mutating.
  const { data: team } = await admin
    .from("teams")
    .select("id")
    .eq("id", teamId)
    .eq("ministry_id", profile.ministry_id)
    .maybeSingle()
  if (!team) return { error: "Team not found." }

  const { error } = await admin
    .from("teams")
    .update({ admin_access: access })
    .eq("id", teamId)
    .eq("ministry_id", profile.ministry_id)

  return { error: error?.message ?? null }
}
