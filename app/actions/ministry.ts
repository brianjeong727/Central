"use server"

import { createClient } from "@/lib/supabase-server"
import { createAdminClient } from "@/lib/supabase-admin"

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

export async function joinMinistryByCode(
  inviteCode: string
): Promise<{ ministryName: string | null; error: string | null }> {
  const supabase = await createClient()

  const { data: { user }, error: authErr } = await supabase.auth.getUser()
  if (authErr || !user) return { ministryName: null, error: "Not authenticated." }

  const admin = createAdminClient()

  const { data: ministry, error: findErr } = await admin
    .from("ministries")
    .select("id, name, status")
    .eq("invite_code", inviteCode.trim().toUpperCase())
    .maybeSingle()

  if (findErr) return { ministryName: null, error: findErr.message }
  if (!ministry) return { ministryName: null, error: "No ministry found with that invite code." }
  if (ministry.status === "pending") return { ministryName: null, error: "This ministry is not yet active." }
  if (ministry.status === "rejected") return { ministryName: null, error: "This ministry is not available." }
  const { data: updatedRows, error: updateErr } = await admin
    .from("profiles")
    .update({ ministry_id: ministry.id })
    .eq("id", user.id)
    .select("id")

  if (updateErr) return { ministryName: null, error: updateErr.message }
  if (!updatedRows || updatedRows.length === 0) {
    return { ministryName: null, error: "Profile not found. Please sign out and sign back in, then try again." }
  }

  await admin.from("user_ministries").upsert(
    { user_id: user.id, ministry_id: ministry.id, role: "member" },
    { onConflict: "user_id,ministry_id" }
  )

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

  const { error: updateErr } = await admin
    .from("profiles")
    .update({ ministry_id: ministryId })
    .eq("id", user.id)

  if (updateErr) return { error: updateErr.message }

  await admin.from("user_ministries").upsert(
    { user_id: user.id, ministry_id: ministryId, role: "member" },
    { onConflict: "user_id,ministry_id" }
  )

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
  if (!["admin", "leader"].includes(profile.role.toLowerCase())) return { error: "Unauthorized." }

  const admin = createAdminClient()
  const { error } = await admin
    .from("ministries")
    .update({ is_public: isPublic })
    .eq("id", profile.ministry_id)

  return { error: error?.message ?? null }
}

export async function submitMinistryApplication(data: {
  name: string
  university: string
  location: string
  size: "small" | "medium" | "large"
  teams: Array<{ name: string; icon: string }>
  isPublic?: boolean
}): Promise<{ error: string | null }> {
  const supabase = await createClient()

  const { data: { user }, error: authErr } = await supabase.auth.getUser()
  if (authErr || !user) return { error: "Not authenticated." }

  const admin = createAdminClient()
  const inviteCode = await uniqueInviteCode(admin)

  const { data: ministry, error: createErr } = await admin
    .from("ministries")
    .insert({
      name: data.name.trim(),
      university: data.university.trim(),
      location: data.location.trim(),
      size: data.size,
      invite_code: inviteCode,
      created_by: user.id,
      status: "pending",
      is_public: data.isPublic ?? false,
    })
    .select("id")
    .single()

  if (createErr || !ministry) return { error: createErr?.message ?? "Failed to create application." }

  // Link user to ministry as admin
  const { data: updatedRows, error: profileErr } = await admin
    .from("profiles")
    .update({ ministry_id: ministry.id, role: "admin" })
    .eq("id", user.id)
    .select("id")

  if (profileErr) return { error: profileErr.message }
  if (!updatedRows || updatedRows.length === 0) {
    return { error: "Profile not found. Please sign out and sign back in, then try again." }
  }

  await admin.from("user_ministries").upsert(
    { user_id: user.id, ministry_id: ministry.id, role: "admin" },
    { onConflict: "user_id,ministry_id" }
  )

  // Create teams
  if (data.teams.length > 0) {
    const { error: teamsErr } = await admin.from("teams").insert(
      data.teams.map((t) => ({
        ministry_id: ministry.id,
        name: t.name,
        icon: t.icon,
        created_by: user.id,
      }))
    )
    if (teamsErr) return { error: teamsErr.message }
  }

  return { error: null }
}

// Legacy — kept for backwards compatibility; new ministries should use submitMinistryApplication
export async function registerMinistry(data: {
  name: string
  university: string
  size: "small" | "medium" | "large"
}): Promise<{ error: string | null }> {
  const supabase = await createClient()

  const { data: { user }, error: authErr } = await supabase.auth.getUser()
  if (authErr || !user) return { error: "Not authenticated." }

  const admin = createAdminClient()
  const inviteCode = await uniqueInviteCode(admin)

  const { data: ministry, error: createErr } = await admin
    .from("ministries")
    .insert({
      name: data.name.trim(),
      university: data.university.trim(),
      size: data.size,
      invite_code: inviteCode,
      created_by: user.id,
      status: "pending",
    })
    .select("id")
    .single()

  if (createErr || !ministry) return { error: createErr?.message ?? "Failed to create ministry." }

  const { data: updatedRows, error: profileErr } = await admin
    .from("profiles")
    .update({ ministry_id: ministry.id, role: "admin" })
    .eq("id", user.id)
    .select("id")

  if (profileErr) return { error: profileErr.message }
  if (!updatedRows || updatedRows.length === 0) {
    return { error: "Profile not found. Please sign out and sign back in, then try again." }
  }

  return { error: null }
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
    .select("id, name, university, location, size, invite_code, created_at, created_by")
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

  // Fetch teams
  const ministryIds = ministries.map((m) => m.id)
  const { data: teams } = await admin
    .from("teams")
    .select("ministry_id, name, icon")
    .in("ministry_id", ministryIds)

  const teamsMap: Record<string, Array<{ name: string; icon: string | null }>> = {}
  for (const t of teams ?? []) {
    if (!teamsMap[t.ministry_id]) teamsMap[t.ministry_id] = []
    teamsMap[t.ministry_id].push({ name: t.name, icon: t.icon })
  }

  const result = ministries.map((m) => ({
    ...m,
    creatorName: profileMap[m.created_by]?.name ?? null,
    creatorEmail: profileMap[m.created_by]?.email ?? null,
    teams: teamsMap[m.id] ?? [],
  }))

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

  return { error: error?.message ?? null }
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
  if (profile.role.toLowerCase() !== "admin") return { error: "Only admins can update ministry info." }

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
  if (profile.role.toLowerCase() !== "admin") return { code: null, error: "Only admins can regenerate invite codes." }

  const admin = createAdminClient()
  const newCode = await uniqueInviteCode(admin)
  const { error } = await admin.from("ministries").update({ invite_code: newCode }).eq("id", profile.ministry_id)
  if (error) return { code: null, error: error.message }
  return { code: newCode, error: null }
}

// ─── Admin: change a member's role ──────────────────────────────────────────
export async function updateMemberRole(targetUserId: string, newRole: "member" | "leader" | "admin"): Promise<{ error: string | null }> {
  const supabase = await createClient()
  const { data: { user }, error: authErr } = await supabase.auth.getUser()
  if (authErr || !user) return { error: "Not authenticated." }

  const { data: profile } = await supabase.from("profiles").select("ministry_id, role").eq("id", user.id).maybeSingle()
  if (!profile?.ministry_id) return { error: "No ministry found." }
  if (profile.role.toLowerCase() !== "admin") return { error: "Only admins can change member roles." }

  const admin = createAdminClient()
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
  if (profile.role.toLowerCase() !== "admin") return { error: "Only admins can remove members." }

  const admin = createAdminClient()
  const { error } = await admin.from("profiles").update({ ministry_id: null, role: "member" }).eq("id", targetUserId).eq("ministry_id", profile.ministry_id)
  return { error: error?.message ?? null }
}

// ─── Admin: archive ministry ─────────────────────────────────────────────────
export async function archiveMinistry(): Promise<{ error: string | null }> {
  const supabase = await createClient()
  const { data: { user }, error: authErr } = await supabase.auth.getUser()
  if (authErr || !user) return { error: "Not authenticated." }

  const { data: profile } = await supabase.from("profiles").select("ministry_id, role").eq("id", user.id).maybeSingle()
  if (!profile?.ministry_id) return { error: "No ministry found." }
  if (profile.role.toLowerCase() !== "admin") return { error: "Only admins can archive the ministry." }

  const admin = createAdminClient()
  const { error } = await admin.from("ministries").update({ status: "archived" }).eq("id", profile.ministry_id)
  return { error: error?.message ?? null }
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
