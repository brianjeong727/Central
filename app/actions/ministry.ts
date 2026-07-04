"use server"

import { createClient } from "@/lib/supabase-server"
import { createAdminClient } from "@/lib/supabase-admin"
import { requireSameMinistry, requireMinistryAdmin, isAdminTier } from "./authz"
import { autoAddUserToChats, ensureMinistryChats } from "./auto-chats"
import { presetById } from "@/app/home/workspace-presets"

const ADMIN_EMAIL = "brianjeong13@gmail.com"

function generateInviteCode(): string {
  return Math.random().toString(36).substring(2, 8).toUpperCase()
}

async function uniqueInviteCode(supabase: ReturnType<typeof createAdminClient>): Promise<string> {
  let code = generateInviteCode()
  for (let i = 0; i < 5; i++) {
    const { data } = await supabase.from("ministries").select("id").eq("invite_code", code).maybeSingle()
    if (!data) break
    code = generateInviteCode()
  }
  return code
}

async function uniqueStaffCode(supabase: ReturnType<typeof createAdminClient>): Promise<string> {
  let code = generateInviteCode()
  for (let i = 0; i < 5; i++) {
    const { data } = await supabase.from("ministries").select("id").eq("staff_invite_code", code).maybeSingle()
    if (!data) break
    code = generateInviteCode()
  }
  return code
}

export async function joinMinistryByCode(
  inviteCode: string,
  adminRole?: "pastor" | "deacon" | "elder"
): Promise<{ ministryName: string | null; error: string | null; isStaffCode?: boolean }> {
  const supabase = await createClient()

  const { data: { user }, error: authErr } = await supabase.auth.getUser()
  if (authErr || !user) return { ministryName: null, error: "Not authenticated." }

  const admin = createAdminClient()
  const code = inviteCode.trim().toUpperCase()

  // Check member code first
  const { data: byMember } = await admin
    .from("ministries")
    .select("id, name, status")
    .eq("invite_code", code)
    .maybeSingle()

  // Check staff code if member code didn't match
  const { data: byStaff } = !byMember ? await admin
    .from("ministries")
    .select("id, name, status")
    .eq("staff_invite_code", code)
    .maybeSingle() : { data: null }

  const ministry = byMember ?? byStaff
  const isStaff = !byMember && !!byStaff

  if (!ministry) return { ministryName: null, error: "No ministry found with that invite code." }
  if (ministry.status === "pending") return { ministryName: null, error: "This ministry is not yet active." }
  if (ministry.status === "rejected") return { ministryName: null, error: "This ministry is not available." }
  // Catch-all — any non-active status (archived etc.) is not joinable.
  if (ministry.status !== "active") return { ministryName: null, error: "This ministry is not available." }

  // Check if user is banned from this ministry
  const { data: ban } = await admin
    .from("ministry_bans")
    .select("id")
    .eq("ministry_id", ministry.id)
    .eq("user_id", user.id)
    .maybeSingle()
  if (ban) return { ministryName: null, error: "You are not permitted to join this ministry." }

  // Staff code detected but no role chosen yet — signal the client to show the role picker
  if (isStaff && !adminRole) {
    return { ministryName: ministry.name, error: null, isStaffCode: true }
  }

  // Validated allowlist — the staff code may only grant pastor/deacon/elder
  // (permissions.md § Join Codes). Never pass the caller-supplied role through.
  const ALLOWED_STAFF_ROLES = ["pastor", "deacon", "elder"]
  if (isStaff && !ALLOWED_STAFF_ROLES.includes((adminRole ?? "").toLowerCase())) {
    return { ministryName: null, error: "Invalid staff role" }
  }

  // Fetch the caller's current profile before any write. A member-code join must
  // never carry over a previous ministry's admin role into the new one (stale-role
  // escalation) — so we resolve the role explicitly rather than leaving it untouched.
  const { data: currentProfile } = await admin
    .from("profiles")
    .select("ministry_id, role, graduation_year")
    .eq("id", user.id)
    .maybeSingle()

  if (!currentProfile) {
    return { ministryName: null, error: "Profile not found. Please sign out and sign back in, then try again." }
  }

  // Member-code join into a ministry they're already in (e.g. a pastor re-entering
  // their own member code) — no-op, so we never demote them.
  if (!isStaff && currentProfile.ministry_id === ministry.id) {
    return { ministryName: ministry.name, error: null }
  }

  // Resolve the role to write. Staff joins use the validated adminRole above.
  // Member joins default to "member", but a RETURN to a ministry the user still
  // has a membership row in restores that row's role (never the stale profile role).
  let role: string
  if (isStaff) {
    role = (adminRole as string).toLowerCase()
  } else {
    const { data: existingUm } = await admin
      .from("user_ministries")
      .select("role")
      .eq("user_id", user.id)
      .eq("ministry_id", ministry.id)
      .maybeSingle()
    role = existingUm ? (existingUm.role ?? "member") : "member"
  }

  const { data: updatedRows, error: updateErr } = await admin
    .from("profiles")
    .update({ ministry_id: ministry.id, role })
    .eq("id", user.id)
    .select("id")

  if (updateErr) return { ministryName: null, error: updateErr.message }
  if (!updatedRows || updatedRows.length === 0) {
    return { ministryName: null, error: "Profile not found. Please sign out and sign back in, then try again." }
  }

  await admin.from("user_ministries").upsert(
    { user_id: user.id, ministry_id: ministry.id, role },
    { onConflict: "user_id,ministry_id" }
  )

  await autoAddUserToChats(user.id, ministry.id, currentProfile.graduation_year ?? null, role)

  return { ministryName: ministry.name, error: null }
}

export async function getPublicMinistries(search?: string): Promise<{
  data: Array<{ id: string; name: string; university: string; size: string; location: string | null }> | null
  error: string | null
}> {
  const admin = createAdminClient()
  let query = admin
    .from("ministries")
    .select("id, name, university, size, location")
    .eq("is_public", true)
    .eq("status", "active")
    .order("name")

  if (search?.trim()) {
    query = query.or(`name.ilike.%${search.trim()}%,university.ilike.%${search.trim()}%`)
  }

  const { data, error } = await query
  return { data, error: error?.message ?? null }
}

export async function joinMinistryById(ministryId: string): Promise<{ error: string | null }> {
  const supabase = await createClient()
  const { data: { user }, error: authErr } = await supabase.auth.getUser()
  if (authErr || !user) return { error: "Not authenticated." }

  const admin = createAdminClient()

  const { data: ministry } = await admin
    .from("ministries")
    .select("id, status, is_public")
    .eq("id", ministryId)
    .maybeSingle()

  if (!ministry) return { error: "Ministry not found." }
  if (ministry.status !== "active") return { error: "This ministry is not currently active." }
  if (!ministry.is_public) return { error: "This ministry is not publicly joinable." }

  const { data: ban } = await admin
    .from("ministry_bans").select("id").eq("ministry_id", ministryId).eq("user_id", user.id).maybeSingle()
  if (ban) return { error: "You are not permitted to join this ministry." }

  // Same stale-role escalation guard as joinMinistryByCode — a public join must
  // never carry a previous ministry's admin role into this one.
  const { data: currentProfile } = await admin
    .from("profiles")
    .select("ministry_id, role, graduation_year")
    .eq("id", user.id)
    .maybeSingle()

  if (!currentProfile) {
    return { error: "Profile not found. Please sign out and sign back in, then try again." }
  }

  // Already in this ministry — no-op so we never demote an existing role.
  if (currentProfile.ministry_id === ministryId) {
    return { error: null }
  }

  // Restore the role from an existing membership row if this is a return;
  // otherwise it's a fresh join → "member".
  const { data: existingUm } = await admin
    .from("user_ministries")
    .select("role")
    .eq("user_id", user.id)
    .eq("ministry_id", ministryId)
    .maybeSingle()
  const role = existingUm ? (existingUm.role ?? "member") : "member"

  const { error: updateErr } = await admin
    .from("profiles")
    .update({ ministry_id: ministryId, role })
    .eq("id", user.id)

  if (updateErr) return { error: updateErr.message }

  await admin.from("user_ministries").upsert(
    { user_id: user.id, ministry_id: ministryId, role },
    { onConflict: "user_id,ministry_id" }
  )

  await autoAddUserToChats(user.id, ministryId, currentProfile.graduation_year ?? null, role)

  return { error: null }
}

export async function updateMinistryPublic(isPublic: boolean): Promise<{ error: string | null }> {
  const supabase = await createClient()
  const { data: { user }, error: authErr } = await supabase.auth.getUser()
  if (authErr || !user) return { error: "Not authenticated." }

  const { data: profile } = await supabase
    .from("profiles")
    .select("ministry_id, role")
    .eq("id", user.id)
    .maybeSingle()

  if (!profile?.ministry_id) return { error: "No ministry found." }
  if (!["admin", "deacon", "elder", "pastor"].includes(profile.role.toLowerCase())) return { error: "Unauthorized." }

  const admin = createAdminClient()
  const { error } = await admin
    .from("ministries")
    .update({ is_public: isPublic })
    .eq("id", profile.ministry_id)

  return { error: error?.message ?? null }
}

function toAbbreviation(name: string): string {
  const skip = new Set(["of", "at", "the", "a", "an", "and", "in", "for"])
  const initials = name.split(/\s+/).filter(w => !skip.has(w.toLowerCase())).map(w => w[0]?.toUpperCase() ?? "").join("")
  return initials.slice(0, 6) || name.slice(0, 4).toUpperCase()
}

export async function submitMinistryApplication(data: {
  name: string
  university: string
  universities?: string[]
  location: string
  size: "small" | "medium" | "large"
  // Preset workspace ids the admin selected during onboarding (e.g. ["dgl","finance"]).
  // Persisted on the ministry and auto-created as empty workspaces on approval.
  workspaces: string[]
  isPublic?: boolean
  founderRole?: "pastor" | "deacon" | "elder"
}): Promise<{ error: string | null }> {
  const supabase = await createClient()

  const { data: { user }, error: authErr } = await supabase.auth.getUser()
  if (authErr || !user) return { error: "Not authenticated." }

  // Registration gate — server actions are public HTTP endpoints, so the
  // /register-ministry page gate isn't enough on its own. A user who already
  // belongs to a ministry must be admin-tier to register another; users with
  // no ministry (fresh registrants) always pass.
  const { data: callerProfile } = await supabase
    .from("profiles")
    .select("ministry_id, role")
    .eq("id", user.id)
    .maybeSingle()
  if (callerProfile?.ministry_id && !["admin", "deacon", "elder", "pastor"].includes((callerProfile.role ?? "").toLowerCase())) {
    return { error: "Only ministry admins can register a new ministry." }
  }

  const admin = createAdminClient()
  const inviteCode = await uniqueInviteCode(admin)
  const staffCode = await uniqueStaffCode(admin)

  // Resolve the founder's role from validated sources only — never trust
  // unvalidated input and never read profiles.role (the DB trigger now forces
  // fresh signups to 'member', and the metadata role was previously forgeable).
  // Prefer the role picked on the admin signup form (stored in auth metadata),
  // then an explicit validated param, then default to "pastor".
  const ALLOWED_FOUNDER_ROLES = ["pastor", "deacon", "elder"]
  const picked = (user.user_metadata?.role as string | undefined)?.toLowerCase()
  const founderRole = ALLOWED_FOUNDER_ROLES.includes(picked ?? "")
    ? picked!
    : (ALLOWED_FOUNDER_ROLES.includes((data.founderRole ?? "").toLowerCase())
      ? (data.founderRole as string).toLowerCase()
      : "pastor")

  const universitiesList = data.universities && data.universities.length > 0
    ? data.universities.map(u => u.trim()).filter(Boolean)
    : [data.university.trim()].filter(Boolean)

  const { data: ministry, error: createErr } = await admin
    .from("ministries")
    .insert({
      name: data.name.trim(),
      university: universitiesList[0] ?? data.university.trim(),
      universities: universitiesList,
      location: data.location.trim(),
      size: data.size,
      invite_code: inviteCode,
      staff_invite_code: staffCode,
      created_by: user.id,
      status: "pending",
      is_public: data.isPublic ?? false,
      // Stored now, created as empty workspaces on approval (see approveMinistry).
      // Filter to known presets so a stale/garbage id can't reach approval.
      onboarding_workspaces: (data.workspaces ?? []).filter((id) => !!presetById(id)),
    })
    .select("id")
    .single()

  if (createErr || !ministry) return { error: createErr?.message ?? "Failed to create application." }

  // Link user to ministry with their specific founder role
  const { data: updatedRows, error: profileErr } = await admin
    .from("profiles")
    .update({ ministry_id: ministry.id, role: founderRole })
    .eq("id", user.id)
    .select("id")

  if (profileErr) return { error: profileErr.message }
  if (!updatedRows || updatedRows.length === 0) {
    return { error: "Profile not found. Please sign out and sign back in, then try again." }
  }

  await admin.from("user_ministries").upsert(
    { user_id: user.id, ministry_id: ministry.id, role: founderRole },
    { onConflict: "user_id,ministry_id" }
  )

  // Create standard grade + central chats for the new ministry
  await ensureMinistryChats(ministry.id, data.name.trim(), user.id)

  const { data: founderProfile } = await admin.from("profiles").select("graduation_year").eq("id", user.id).single()
  await autoAddUserToChats(user.id, ministry.id, founderProfile?.graduation_year ?? null, founderRole)

  // Workspaces are NOT created here. The selected presets are stored on the
  // ministry (onboarding_workspaces) and created as empty workspaces only once
  // the application is approved — see createOnboardingWorkspaces / approveMinistry.

  return { error: null }
}

// Create the selected onboarding workspaces as EMPTY teams (preset roles, but no
// members → no president assigned). Idempotent: only seeds if the ministry has no
// teams yet, so re-approval can't duplicate. Runs with the service-role client.
async function createOnboardingWorkspaces(
  admin: ReturnType<typeof createAdminClient>,
  ministryId: string,
  createdBy: string,
  workspaceIds: string[],
): Promise<void> {
  const ids = (workspaceIds ?? []).filter((id) => !!presetById(id))
  if (ids.length === 0) return

  // Idempotency guard — never seed a ministry that already has teams.
  const { count } = await admin
    .from("teams")
    .select("id", { count: "exact", head: true })
    .eq("ministry_id", ministryId)
  if ((count ?? 0) > 0) return

  for (const id of ids) {
    const preset = presetById(id)
    if (!preset) continue
    const { data: team, error: teamErr } = await admin
      .from("teams")
      .insert({
        ministry_id: ministryId,
        name: preset.name,
        icon: preset.emoji,
        description: preset.description,
        team_type: preset.teamType,
        created_by: createdBy,
        // Gov-WRITE by default so admins can manage onboarding-created teams
        // without first being members (consistent with AddWorkspaceModal). This
        // insert is service-role so it isn't RLS-blocked, but the column keeps
        // the resulting teams admin-manageable under Full-gov RLS.
        admin_access: "write",
      })
      .select("id")
      .single()
    if (teamErr || !team) continue
    // Seed the preset's roles (incl. the is_president role). No team_members —
    // the admin assigns the president later from the workspace's settings.
    await admin.from("team_roles").insert(
      preset.roles.map((r) => ({
        team_id: team.id,
        name: r.name,
        permissions: r.permissions,
        is_president: !!r.is_president,
      }))
    )
  }
}

export async function getPendingMinistries(): Promise<{
  data: Array<{
    id: string
    name: string
    university: string
    location: string | null
    size: string
    invite_code: string
    created_at: string
    created_by: string
    creatorName: string | null
    creatorEmail: string | null
    teams: Array<{ name: string; icon: string | null }>
  }> | null
  error: string | null
}> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (user?.email !== ADMIN_EMAIL) return { data: null, error: "Unauthorized" }

  const admin = createAdminClient()

  const { data: ministries, error: ministriesErr } = await admin
    .from("ministries")
    .select("id, name, university, location, size, invite_code, created_at, created_by, onboarding_workspaces")
    .eq("status", "pending")
    .order("created_at", { ascending: false })

  if (ministriesErr) return { data: null, error: ministriesErr.message }
  if (!ministries || ministries.length === 0) return { data: [], error: null }

  // Fetch creator profiles
  const creatorIds = [...new Set(ministries.map((m) => m.created_by))]
  const { data: profiles } = await admin
    .from("profiles")
    .select("id, name, email")
    .in("id", creatorIds)

  const profileMap = Object.fromEntries((profiles ?? []).map((p) => [p.id, p]))

  // Workspaces are no longer created at registration time — the selected presets
  // live on the ministry until approval. Map the stored ids → preset names/icons
  // for the approval card. (`teams` field kept for the existing admin-panel shape.)
  const result = ministries.map((m) => {
    const ids: string[] = Array.isArray(m.onboarding_workspaces) ? m.onboarding_workspaces : []
    const teams = ids
      .map((id) => {
        const p = presetById(id)
        return p ? { name: p.name, icon: p.emoji } : null
      })
      .filter((t): t is { name: string; icon: string } => t !== null)
    return {
      ...m,
      creatorName: profileMap[m.created_by]?.name ?? null,
      creatorEmail: profileMap[m.created_by]?.email ?? null,
      teams,
    }
  })

  return { data: result, error: null }
}

export async function approveMinistry(ministryId: string): Promise<{ error: string | null }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (user?.email !== ADMIN_EMAIL) return { error: "Unauthorized" }

  const admin = createAdminClient()
  const { error } = await admin
    .from("ministries")
    .update({ status: "active" })
    .eq("id", ministryId)

  if (error) return { error: error.message }

  // Seed ministry_schools from the universities array collected during onboarding
  const { data: ministry } = await admin
    .from("ministries")
    .select("universities, onboarding_workspaces, created_by")
    .eq("id", ministryId)
    .single()

  // Create the workspaces the admin selected at onboarding, empty (no president).
  const onboardingWorkspaces: string[] = Array.isArray(ministry?.onboarding_workspaces)
    ? ministry!.onboarding_workspaces
    : []
  if (ministry?.created_by) {
    await createOnboardingWorkspaces(admin, ministryId, ministry.created_by, onboardingWorkspaces)
  }

  const unis: string[] = Array.isArray(ministry?.universities) ? ministry.universities : []
  if (unis.length > 0) {
    // Only insert schools that don't already exist for this ministry
    const { data: existing } = await admin
      .from("ministry_schools")
      .select("name")
      .eq("ministry_id", ministryId)
    const existingNames = new Set((existing ?? []).map((r: { name: string }) => r.name.toLowerCase()))
    const toInsert = unis
      .filter(u => !existingNames.has(u.toLowerCase()))
      .map((u, i) => ({
        ministry_id: ministryId,
        name: u,
        abbreviation: toAbbreviation(u),
        sort_order: (existing?.length ?? 0) + i,
      }))
    if (toInsert.length > 0) {
      await admin.from("ministry_schools").insert(toInsert)
    }
  }

  return { error: null }
}

export async function rejectMinistry(ministryId: string): Promise<{ error: string | null }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (user?.email !== ADMIN_EMAIL) return { error: "Unauthorized" }

  const admin = createAdminClient()
  const { error } = await admin
    .from("ministries")
    .update({ status: "rejected" })
    .eq("id", ministryId)

  return { error: error?.message ?? null }
}

// Returns all active ministries the current user belongs to
export async function getUserMinistries(): Promise<{
  data: Array<{ id: string; name: string; university: string; role: string }> | null
  error: string | null
}> {
  const supabase = await createClient()
  const { data: { user }, error: authErr } = await supabase.auth.getUser()
  if (authErr || !user) return { data: null, error: "Not authenticated." }

  const admin = createAdminClient()

  // Step 1: get all (ministry_id, role) rows for this user — deduplicate by ministry_id
  const { data: rows, error: rowsErr } = await admin
    .from("user_ministries")
    .select("ministry_id, role")
    .eq("user_id", user.id)

  if (rowsErr) return { data: null, error: rowsErr.message }

  // Build a map of ministry_id → role (deduplicates multiple rows for the same ministry)
  const byMinistry = new Map<string, string>()
  for (const row of (rows ?? [])) {
    if (!byMinistry.has(row.ministry_id)) byMinistry.set(row.ministry_id, row.role)
  }

  if (byMinistry.size === 0) return { data: [], error: null }

  // Step 2: fetch ministry details in a single IN query — filter to active only
  const { data: ministries, error: mErr } = await admin
    .from("ministries")
    .select("id, name, university, status")
    .in("id", [...byMinistry.keys()])
    .eq("status", "active")

  if (mErr) return { data: null, error: mErr.message }

  return {
    data: (ministries ?? []).map((m) => ({
      id: m.id,
      name: m.name,
      university: m.university,
      role: byMinistry.get(m.id) ?? "member",
    })),
    error: null,
  }
}

// ─── Admin: update ministry name / university ────────────────────────────────
export async function updateMinistryInfo(data: { name: string; university: string }): Promise<{ error: string | null }> {
  const supabase = await createClient()
  const { data: { user }, error: authErr } = await supabase.auth.getUser()
  if (authErr || !user) return { error: "Not authenticated." }

  const { data: profile } = await supabase.from("profiles").select("ministry_id, role").eq("id", user.id).maybeSingle()
  if (!profile?.ministry_id) return { error: "No ministry found." }
  if (!["admin", "deacon", "elder", "pastor"].includes(profile.role.toLowerCase())) return { error: "Only admins can update ministry info." }

  const admin = createAdminClient()
  const { error } = await admin.from("ministries").update({ name: data.name.trim(), university: data.university.trim() }).eq("id", profile.ministry_id)
  return { error: error?.message ?? null }
}

// ─── Admin: regenerate invite code ──────────────────────────────────────────
export async function regenerateInviteCode(): Promise<{ code: string | null; error: string | null }> {
  const supabase = await createClient()
  const { data: { user }, error: authErr } = await supabase.auth.getUser()
  if (authErr || !user) return { code: null, error: "Not authenticated." }

  const { data: profile } = await supabase.from("profiles").select("ministry_id, role").eq("id", user.id).maybeSingle()
  if (!profile?.ministry_id) return { code: null, error: "No ministry found." }
  if (!["admin", "deacon", "elder", "pastor"].includes(profile.role.toLowerCase())) return { code: null, error: "Only admins can regenerate invite codes." }

  const admin = createAdminClient()
  const newCode = await uniqueInviteCode(admin)
  const { error } = await admin.from("ministries").update({ invite_code: newCode }).eq("id", profile.ministry_id)
  if (error) return { code: null, error: error.message }
  return { code: newCode, error: null }
}

// ─── Admin: regenerate staff invite code ────────────────────────────────────
export async function regenerateStaffCode(): Promise<{ code: string | null; error: string | null }> {
  const supabase = await createClient()
  const { data: { user }, error: authErr } = await supabase.auth.getUser()
  if (authErr || !user) return { code: null, error: "Not authenticated." }

  const { data: profile } = await supabase.from("profiles").select("ministry_id, role").eq("id", user.id).maybeSingle()
  if (!profile?.ministry_id) return { code: null, error: "No ministry found." }
  if (!["admin", "deacon", "elder", "pastor"].includes(profile.role.toLowerCase())) return { code: null, error: "Only admins can regenerate staff codes." }

  const admin = createAdminClient()
  const newCode = await uniqueStaffCode(admin)
  const { error } = await admin.from("ministries").update({ staff_invite_code: newCode }).eq("id", profile.ministry_id)
  if (error) return { code: null, error: error.message }
  return { code: newCode, error: null }
}

// ─── Last-admin hard block ───────────────────────────────────────────────────
// A ministry must never reach zero admin-tier members. Returns an error string
// if the target is currently admin-tier AND is the last admin-tier member of
// the ministry (so demoting/removing them would lock the ministry out).
// Returns null when the action is safe to proceed.
const ADMIN_TIER_ROLES = ["admin", "deacon", "elder", "pastor"]
const LAST_ADMIN_ERROR = "This is the last admin — a ministry must keep at least one admin. Promote someone else first."

async function lastAdminBlockError(
  admin: ReturnType<typeof createAdminClient>,
  ministryId: string,
  targetUserId: string,
): Promise<string | null> {
  const { data: target } = await admin
    .from("profiles")
    .select("role")
    .eq("id", targetUserId)
    .eq("ministry_id", ministryId)
    .maybeSingle()

  // Target isn't admin-tier (or isn't in this ministry) — no last-admin risk.
  if (!target || !ADMIN_TIER_ROLES.includes((target.role ?? "").toLowerCase())) return null

  // Count remaining admin-tier members (case-insensitive role match).
  const { count } = await admin
    .from("profiles")
    .select("id", { count: "exact", head: true })
    .eq("ministry_id", ministryId)
    .or(ADMIN_TIER_ROLES.map((r) => `role.ilike.${r}`).join(","))

  return (count ?? 0) <= 1 ? LAST_ADMIN_ERROR : null
}

// ─── Admin: change a member's role ──────────────────────────────────────────
export async function updateMemberRole(targetUserId: string, newRole: "visitor" | "member" | "leader" | "admin" | "deacon" | "elder" | "pastor"): Promise<{ error: string | null }> {
  const supabase = await createClient()
  const { data: { user }, error: authErr } = await supabase.auth.getUser()
  if (authErr || !user) return { error: "Not authenticated." }

  // Self-target guard (mirrors removeMember/excommunicateMember) — a lone admin
  // must not be able to self-demote and lock the ministry out.
  if (targetUserId === user.id) return { error: "You cannot change your own role." }

  const { data: profile } = await supabase.from("profiles").select("ministry_id, role").eq("id", user.id).maybeSingle()
  if (!profile?.ministry_id) return { error: "No ministry found." }
  if (!["admin", "deacon", "elder", "pastor"].includes(profile.role.toLowerCase())) return { error: "Only admins can change member roles." }

  const admin = createAdminClient()

  // Hard-block last admin: if the new role drops the target out of admin-tier,
  // the target must not be the ministry's last admin-tier member.
  if (!ADMIN_TIER_ROLES.includes(newRole.toLowerCase())) {
    const blockErr = await lastAdminBlockError(admin, profile.ministry_id, targetUserId)
    if (blockErr) return { error: blockErr }
  }

  const { error } = await admin.from("profiles").update({ role: newRole }).eq("id", targetUserId).eq("ministry_id", profile.ministry_id)
  return { error: error?.message ?? null }
}

// ─── Admin: remove a member from the ministry ────────────────────────────────
export async function removeMember(targetUserId: string): Promise<{ error: string | null }> {
  const supabase = await createClient()
  const { data: { user }, error: authErr } = await supabase.auth.getUser()
  if (authErr || !user) return { error: "Not authenticated." }

  if (targetUserId === user.id) return { error: "You cannot remove yourself." }

  const { data: profile } = await supabase.from("profiles").select("ministry_id, role").eq("id", user.id).maybeSingle()
  if (!profile?.ministry_id) return { error: "No ministry found." }
  if (!["admin", "deacon", "elder", "pastor"].includes(profile.role.toLowerCase())) return { error: "Only admins can remove members." }

  const admin = createAdminClient()

  // Hard-block last admin: removal drops the target out of admin-tier, so the
  // target must not be the ministry's last admin-tier member.
  const blockErr = await lastAdminBlockError(admin, profile.ministry_id, targetUserId)
  if (blockErr) return { error: blockErr }

  const { error } = await admin.from("profiles").update({ ministry_id: null, role: "member" }).eq("id", targetUserId).eq("ministry_id", profile.ministry_id)
  if (error) return { error: error.message }

  // Revoke the membership record too (mirrors excommunicateMember/selfLeaveMinistry) —
  // otherwise the removed member can re-enter via setCurrentMinistry, which restores
  // their stale role from user_ministries.
  await admin.from("user_ministries").delete().eq("user_id", targetUserId).eq("ministry_id", profile.ministry_id)

  return { error: null }
}

// ─── Admin: archive ministry (two-step, second-admin confirmation) ───────────
// Q4: archiving requires TWO distinct admins. The first admin's call records a
// request (archive_requested_by/_at, status stays active); a DIFFERENT admin's
// call completes it (status → archived). The requester can never self-confirm.
export async function archiveMinistry(): Promise<{ state: "requested" | "archived" | null; error: string | null }> {
  const supabase = await createClient()
  const { data: { user }, error: authErr } = await supabase.auth.getUser()
  if (authErr || !user) return { state: null, error: "Not authenticated." }

  const { data: profile } = await supabase.from("profiles").select("ministry_id, role").eq("id", user.id).maybeSingle()
  if (!profile?.ministry_id) return { state: null, error: "No ministry found." }
  if (!["admin", "deacon", "elder", "pastor"].includes(profile.role.toLowerCase())) return { state: null, error: "Only admins can archive the ministry." }

  const admin = createAdminClient()
  const { data: ministry } = await admin
    .from("ministries")
    .select("archive_requested_by")
    .eq("id", profile.ministry_id)
    .maybeSingle()
  if (!ministry) return { state: null, error: "Ministry not found." }

  // Step 1 — no pending request: record this admin's request. Status stays active.
  if (!ministry.archive_requested_by) {
    const { error } = await admin
      .from("ministries")
      .update({ archive_requested_by: user.id, archive_requested_at: new Date().toISOString() })
      .eq("id", profile.ministry_id)
    if (error) return { state: null, error: error.message }
    return { state: "requested", error: null }
  }

  // The requester cannot confirm their own request.
  if (ministry.archive_requested_by === user.id) {
    return { state: null, error: "You've already requested archiving — a different admin must confirm." }
  }

  // Step 2 — a SECOND admin confirms: flip to archived and clear the request.
  const { error } = await admin
    .from("ministries")
    .update({ status: "archived", archive_requested_by: null, archive_requested_at: null })
    .eq("id", profile.ministry_id)
  if (error) return { state: null, error: error.message }
  return { state: "archived", error: null }
}

// ─── Admin: cancel a pending archive request ─────────────────────────────────
export async function cancelArchiveRequest(ministryId: string): Promise<{ error: string | null }> {
  const authz = await requireMinistryAdmin(ministryId)
  if (authz.error !== null) return { error: authz.error }

  const admin = createAdminClient()
  const { error } = await admin
    .from("ministries")
    .update({ archive_requested_by: null, archive_requested_at: null })
    .eq("id", ministryId)
  return { error: error?.message ?? null }
}

// ─── Admin: read invite codes (scoped server action) ─────────────────────────
// The invite_code/staff_invite_code columns are revoked from `authenticated`
// (Q2 SELECT-narrow migration) — clients can no longer read them directly.
// Admins of the ministry read them via this service-role action instead.
export async function getMinistryCodes(ministryId: string): Promise<{
  inviteCode: string | null
  staffInviteCode: string | null
  error: string | null
}> {
  const authz = await requireMinistryAdmin(ministryId)
  if (authz.error !== null) return { inviteCode: null, staffInviteCode: null, error: authz.error }

  const admin = createAdminClient()
  const { data, error } = await admin
    .from("ministries")
    .select("invite_code, staff_invite_code")
    .eq("id", ministryId)
    .maybeSingle()
  if (error || !data) return { inviteCode: null, staffInviteCode: null, error: error?.message ?? "Ministry not found." }
  return { inviteCode: data.invite_code ?? null, staffInviteCode: data.staff_invite_code ?? null, error: null }
}

// ─── Admin: excommunicate a member (permanent ban — can never rejoin) ───────────
export async function excommunicateMember(targetUserId: string): Promise<{ error: string | null }> {
  const supabase = await createClient()
  const { data: { user }, error: authErr } = await supabase.auth.getUser()
  if (authErr || !user) return { error: "Not authenticated." }

  if (targetUserId === user.id) return { error: "You cannot excommunicate yourself." }

  const { data: profile } = await supabase.from("profiles").select("ministry_id, role").eq("id", user.id).maybeSingle()
  if (!profile?.ministry_id) return { error: "No ministry found." }
  if (!["admin", "deacon", "elder", "pastor"].includes(profile.role.toLowerCase())) return { error: "Only admins can excommunicate members." }

  const admin = createAdminClient()

  const targetMinistryId = profile.ministry_id

  // Hard-block last admin: excommunication drops the target out of admin-tier,
  // so the target must not be the ministry's last admin-tier member. Runs
  // before the ban insert so a blocked action mutates nothing.
  const blockErr = await lastAdminBlockError(admin, targetMinistryId, targetUserId)
  if (blockErr) return { error: blockErr }

  // Insert the ban record first
  const { error: banErr } = await admin.from("ministry_bans").upsert(
    { ministry_id: targetMinistryId, user_id: targetUserId, banned_by: user.id },
    { onConflict: "ministry_id,user_id" }
  )
  if (banErr) return { error: banErr.message }

  // Record the departure so chats show the "left" indicator
  await admin.from("ministry_departures").upsert(
    { user_id: targetUserId, ministry_id: targetMinistryId },
    { onConflict: "user_id,ministry_id" }
  )

  // Remove from the ministry
  await admin.from("profiles").update({ ministry_id: null, role: "member" }).eq("id", targetUserId).eq("ministry_id", targetMinistryId)
  await admin.from("user_ministries").delete().eq("user_id", targetUserId).eq("ministry_id", targetMinistryId)

  return { error: null }
}

// ─── Member: voluntarily leave the ministry ──────────────────────────────────
export async function selfLeaveMinistry(): Promise<{ error: string | null }> {
  const supabase = await createClient()
  const { data: { user }, error: authErr } = await supabase.auth.getUser()
  if (authErr || !user) return { error: "Not authenticated." }

  const { data: profile } = await supabase.from("profiles").select("ministry_id").eq("id", user.id).maybeSingle()
  if (!profile?.ministry_id) return { error: "You are not in a ministry." }

  const admin = createAdminClient()
  const ministryId = profile.ministry_id

  // Record the departure so chats show the "left" indicator
  await admin.from("ministry_departures").upsert(
    { user_id: user.id, ministry_id: ministryId },
    { onConflict: "user_id,ministry_id" }
  )

  // Remove from the ministry
  await admin.from("profiles").update({ ministry_id: null, role: "member" }).eq("id", user.id)
  await admin.from("user_ministries").delete().eq("user_id", user.id).eq("ministry_id", ministryId)

  return { error: null }
}

// ─── Admin: list banned members ──────────────────────────────────────────────
export async function getBannedMembers(ministryId: string): Promise<{
  data: Array<{ user_id: string; name: string | null; email: string | null; created_at: string }> | null
  error: string | null
}> {
  const supabase = await createClient()
  const { data: { user }, error: authErr } = await supabase.auth.getUser()
  if (authErr || !user) return { data: null, error: "Not authenticated." }

  const { data: profile } = await supabase.from("profiles").select("ministry_id, role").eq("id", user.id).maybeSingle()
  if (!profile?.ministry_id) return { data: null, error: "No ministry found." }
  if (!["admin", "deacon", "elder", "pastor"].includes(profile.role.toLowerCase())) return { data: null, error: "Unauthorized." }

  const admin = createAdminClient()
  const { data: bans, error: bansErr } = await admin
    .from("ministry_bans")
    .select("user_id, created_at")
    .eq("ministry_id", ministryId)
    .order("created_at", { ascending: false })

  if (bansErr) return { data: null, error: bansErr.message }
  if (!bans || bans.length === 0) return { data: [], error: null }

  const userIds = bans.map(b => b.user_id)
  const { data: profiles } = await admin.from("profiles").select("id, name, email").in("id", userIds)
  const profileMap = Object.fromEntries((profiles ?? []).map(p => [p.id, p]))

  return {
    data: bans.map(b => ({
      user_id: b.user_id,
      name: profileMap[b.user_id]?.name ?? null,
      email: profileMap[b.user_id]?.email ?? null,
      created_at: b.created_at,
    })),
    error: null,
  }
}

// Sets the user's currently active ministry
export async function setCurrentMinistry(ministryId: string): Promise<{ error: string | null }> {
  const supabase = await createClient()
  const { data: { user }, error: authErr } = await supabase.auth.getUser()
  if (authErr || !user) return { error: "Not authenticated." }

  const admin = createAdminClient()

  // Verify membership — use limit(1) to be safe against duplicate rows
  const { data: rows, error: memErr } = await admin
    .from("user_ministries")
    .select("role")
    .eq("user_id", user.id)
    .eq("ministry_id", ministryId)
    .limit(1)

  if (memErr || !rows || rows.length === 0) return { error: "You are not a member of this ministry." }

  const { error } = await admin
    .from("profiles")
    .update({ ministry_id: ministryId, role: rows[0].role })
    .eq("id", user.id)

  return { error: error?.message ?? null }
}

// ─── Admin: clean up departed members after 30 days ─────────────────────────
// Nulls sender_id on their messages (shows "Former Member") and removes the
// departure record. Never touches profiles or auth.users.
export async function runDepartedMemberCleanup(ministryId: string): Promise<{ cleaned: number; error: string | null }> {
  const supabase = await createClient()
  const { data: { user }, error: authErr } = await supabase.auth.getUser()
  if (authErr || !user) return { cleaned: 0, error: "Not authenticated." }

  const { data: profile } = await supabase.from("profiles").select("ministry_id, role").eq("id", user.id).maybeSingle()
  if (!profile?.ministry_id) return { cleaned: 0, error: "No ministry found." }
  if (!["admin", "deacon", "elder", "pastor"].includes(profile.role.toLowerCase())) return { cleaned: 0, error: "Unauthorized." }

  const admin = createAdminClient()
  const cutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()

  const { data: expired } = await admin
    .from("ministry_departures")
    .select("user_id")
    .eq("ministry_id", ministryId)
    .lt("left_at", cutoff)

  if (!expired || expired.length === 0) return { cleaned: 0, error: null }

  const userIds = expired.map((d: { user_id: string }) => d.user_id)

  // Get all group IDs for this ministry
  const { data: groups } = await admin.from("groups").select("id").eq("ministry_id", ministryId)
  const groupIds = (groups ?? []).map((g: { id: string }) => g.id)

  // Null out sender_id on messages so they display as "Former Member"
  if (groupIds.length > 0) {
    await admin
      .from("messages")
      .update({ sender_id: null })
      .in("sender_id", userIds)
      .in("group_id", groupIds)
  }

  // Remove departure records — "left" indicator disappears, cleanup is done
  await admin.from("ministry_departures").delete().eq("ministry_id", ministryId).in("user_id", userIds)

  return { cleaned: userIds.length, error: null }
}

// Elevate members/visitors on a leader-tier team (DGL, Board) to "leader" role.
// Never downgrades admins or existing leaders.
export async function elevateToLeader(userIds: string[], ministryId: string): Promise<{ error: string | null }> {
  if (userIds.length === 0) return { error: null }

  // Caller must belong to this ministry AND be admin-tier or a team manager
  // (president / can_manage_team) — the only people who can add team members,
  // which is the sole legitimate trigger for this elevation.
  const authz = await requireSameMinistry(ministryId)
  if (authz.error !== null) return { error: authz.error }

  try {
    const admin = createAdminClient()

    if (!isAdminTier(authz.role)) {
      const { data: managerRows } = await admin
        .from("team_members")
        .select("team_id, teams!inner(ministry_id), team_roles!role_id(is_president, permissions)")
        .eq("user_id", authz.userId)
        .eq("teams.ministry_id", ministryId)
      const isTeamManager = ((managerRows ?? []) as { team_roles: { is_president?: boolean; permissions?: string[] } | null }[])
        .some(r => r.team_roles?.is_president || (r.team_roles?.permissions ?? []).includes("can_manage_team"))
      if (!isTeamManager) return { error: "Not authorized." }
    }
    const { error } = await admin
      .from("profiles")
      .update({ role: "leader" })
      .in("id", userIds)
      .eq("ministry_id", ministryId)
      .in("role", ["member", "visitor"])
    return { error: error?.message ?? null }
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Failed to elevate role." }
  }
}
