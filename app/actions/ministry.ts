"use server"

import { createClient } from "@/lib/supabase-server"
import { createAdminClient } from "@/lib/supabase-admin"
import { requireSameMinistry, requireMinistryAdmin, isAdminTier } from "./authz"
import { autoAddUserToChats, ensureMinistryChats } from "./auto-chats"
import { YOUNG_ADULT } from "@/lib/cohort"

/**
 * The grade to write when a user joins a ministry, or null to leave it alone.
 *
 * Young-adult status is chosen on the SIGNUP form, but the profile row is created
 * by the handle_new_user trigger, which copies only name / email / graduation_year
 * — so the choice sits in auth metadata until the first join picks it up. An
 * existing grade on the profile always wins: a returning member who has since been
 * graduated (or who set it by hand) must not be reset by stale signup metadata.
 *
 * Only ever produces the young_adult sentinel; arbitrary metadata is never
 * written through to the column.
 */
function resolveSignupGrade(
  currentGrade: string | null | undefined,
  metadata: Record<string, unknown> | undefined,
): { write: string | null; effective: string | null } {
  // TWO DIFFERENT ANSWERS, and conflating them is a shipped bug: `write` is what
  // the join should persist (null = leave the column alone), `effective` is what
  // the person actually IS. They differ in the common case — the handle_new_user
  // trigger already copies `grade` from signup metadata, so a young adult arrives
  // here with the column ALREADY set, `write` is correctly null… and passing that
  // null on as the cohort gave autoAddUserToChats nothing to work with. Result: a
  // young adult joined, got the central chat, and was silently left out of Young
  // Adults. Returning one value made that mistake easy; returning both makes it
  // hard.
  if (currentGrade) return { write: null, effective: currentGrade }
  const fromMeta = metadata?.grade === YOUNG_ADULT ? YOUNG_ADULT : null
  return { write: fromMeta, effective: fromMeta }
}
import { presetById } from "@/app/home/workspace-presets"
import { ADMIN_ROLES, LEADER_ROLES, MEMBER_TIER, isAdminRole, isStaffRole } from "@/lib/roles"
import { SUPER_UUID } from "./super-constants"
import { generateInviteCode, lookupVariants } from "@/lib/invite-code"
import { findDuplicateInMinistry, DUPLICATE_ACCOUNT, type DuplicateCandidate } from "@/lib/duplicate-account"

const ADMIN_EMAIL = "brianjeong13@gmail.com"

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
  adminRole?: "pastor" | "deacon" | "elder",
  /** Set once the user has seen the duplicate-account interstitial and said the
   *  existing account isn't theirs. Never inferred — the interstitial has to have
   *  been shown for this to be true. */
  confirmedNotDuplicate?: boolean,
): Promise<{ ministryName: string | null; error: string | null; isStaffCode?: boolean; duplicate?: DuplicateCandidate }> {
  const supabase = await createClient()

  const { data: { user }, error: authErr } = await supabase.auth.getUser()
  if (authErr || !user) return { ministryName: null, error: "Not authenticated." }

  const admin = createAdminClient()
  // Every form the typed code could have been STORED as — Crockford-folded (a
  // generated code, so one read off a poster or heard aloud still resolves), and
  // plain-uppercase, which covers BOTH the custom codes a ministry chooses and the
  // pre-rotation base36 ones whose I/L/O do not survive folding (~40.7% of six-char
  // base36 codes contain one; without this those ministries silently lose their code
  // on the one path that still works for them — typing it). lib/invite-code.ts is
  // the single definition, so a fourth caller cannot invent a fourth rule.
  const variants = lookupVariants(inviteCode)

  const findBy = async (column: "invite_code" | "staff_invite_code") => {
    const { data } = await admin
      .from("ministries")
      .select("id, name, status, invite_code_is_custom")
      .in(column, variants)
      .maybeSingle()
    return data
  }

  // Check member code first
  const byMember = await findBy("invite_code")

  // Check staff code if member code didn't match
  const byStaff = !byMember ? await findBy("staff_invite_code") : null

  const ministry = byMember ?? byStaff
  const isStaff = !byMember && !!byStaff

  if (!ministry) return { ministryName: null, error: "No ministry found with that invite code." }
  // A CUSTOM member code never grants membership outright — it opens a request
  // (app/actions/join-requests.ts). Refusing here rather than at the call site is what
  // makes that true for every entry point: /j/, typed code, and the post-auth landing
  // all funnel through this action. The staff code is exempt because it is never
  // custom — it stays generated precisely because it hands out admin-tier roles.
  if (!isStaff && ministry.invite_code_is_custom) {
    return { ministryName: null, error: "REQUEST_REQUIRED" }
  }
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
  if (isStaff && !isStaffRole(adminRole)) {
    return { ministryName: null, error: "Invalid staff role" }
  }

  // Fetch the caller's current profile before any write. A member-code join must
  // never carry over a previous ministry's admin role into the new one (stale-role
  // escalation) — so we resolve the role explicitly rather than leaving it untouched.
  const { data: currentProfile } = await admin
    .from("profiles")
    .select("ministry_id, role, graduation_year, grade")
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

  // One account per person per ministry. This runs AFTER every other gate (code
  // valid, ministry active, not banned, not already a member) so the interstitial
  // is only ever shown to someone who would otherwise have joined right now.
  // A staff code is exempt: it is handed out deliberately by a ministry to a
  // specific person, and it is the one path where a second account with the same
  // name is plausibly intentional.
  if (!isStaff && !confirmedNotDuplicate) {
    const dup = await findDuplicateInMinistry(admin, user.id, ministry.id)
    if (dup) return { ministryName: ministry.name, error: DUPLICATE_ACCOUNT, duplicate: dup }
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

  // Adopt the young-adult choice made at signup. It rides in auth metadata (the
  // profile row is created by the handle_new_user trigger, which only copies name
  // / email / graduation_year), so this is where it first reaches the profile —
  // and it must land BEFORE autoAddUserToChats runs, since that is what decides
  // between a class chat and Young Adults.
  const signupGrade = resolveSignupGrade(currentProfile.grade, user.user_metadata)

  const { data: updatedRows, error: updateErr } = await admin
    .from("profiles")
    .update({ ministry_id: ministry.id, role, ...(signupGrade.write ? { grade: signupGrade.write } : {}) })
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

  await autoAddUserToChats(user.id, ministry.id, currentProfile.graduation_year ?? null, role, signupGrade.effective)

  return { ministryName: ministry.name, error: null }
}

// Browse listing: ALL active ministries, public and private. Private ministries
// are discoverable by name (so students can find their church) but carry
// is_public=false — the UI renders an "invite code" affordance instead of a
// Join button, and joinMinistryById still hard-blocks private joins server-side
// (code entry is the only private join path).
export async function getPublicMinistries(search?: string): Promise<{
  data: Array<{ id: string; name: string; university: string; size: string; location: string | null; is_public: boolean }> | null
  error: string | null
}> {
  // Test tenants (Brian's Sandbox, Load Test 200, Crossroads, the E2E tenants) must
  // NEVER surface in public discovery. This runs on the service-role client, so RLS is
  // not a backstop — this filter IS the boundary. The one super account is exempt so it
  // can still reach those tenants from the picker.
  //
  // Gate on `hidden_from_discovery`, NOT `is_sandbox`. They are different questions:
  // is_sandbox means "the super account may write-as inside this tenant", which is TRUE
  // of Central — a REAL ministry that must stay discoverable. Filtering on is_sandbox
  // would delist real churches that happen to be super-testable.
  //
  // `.not(…, is, true)` rather than `.eq(false)` on purpose: the column is nullable, and
  // a real ministry that registers with a NULL flag must stay VISIBLE — `.eq(false)`
  // would silently drop it (NULL ≠ false in SQL).
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  const isSuper = user?.id === SUPER_UUID

  const admin = createAdminClient()
  let query = admin
    .from("ministries")
    .select("id, name, university, size, location, is_public")
    .eq("status", "active")
    .order("is_public", { ascending: false })
    .order("name")

  if (!isSuper) query = query.not("hidden_from_discovery", "is", true)

  if (search?.trim()) {
    query = query.or(`name.ilike.%${search.trim()}%,university.ilike.%${search.trim()}%`)
  }

  const { data, error } = await query
  return { data, error: error?.message ?? null }
}

export async function joinMinistryById(
  ministryId: string,
  confirmedNotDuplicate?: boolean,
): Promise<{ error: string | null; duplicate?: DuplicateCandidate }> {
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
    .select("ministry_id, role, graduation_year, grade")
    .eq("id", user.id)
    .maybeSingle()

  if (!currentProfile) {
    return { error: "Profile not found. Please sign out and sign back in, then try again." }
  }

  // Already in this ministry — no-op so we never demote an existing role.
  if (currentProfile.ministry_id === ministryId) {
    return { error: null }
  }

  // Same one-account-per-ministry gate as the code path, in the same position:
  // after every other check, so nobody sees it who wasn't about to get in.
  if (!confirmedNotDuplicate) {
    const dup = await findDuplicateInMinistry(admin, user.id, ministryId)
    if (dup) return { error: DUPLICATE_ACCOUNT, duplicate: dup }
  }

  // Same as the code-join path: the young-adult choice made at signup lives in
  // auth metadata until a join writes it onto the profile.
  const publicJoinGrade = resolveSignupGrade(currentProfile.grade, user.user_metadata)

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
    .update({ ministry_id: ministryId, role, ...(publicJoinGrade.write ? { grade: publicJoinGrade.write } : {}) })
    .eq("id", user.id)

  if (updateErr) return { error: updateErr.message }

  await admin.from("user_ministries").upsert(
    { user_id: user.id, ministry_id: ministryId, role },
    { onConflict: "user_id,ministry_id" }
  )

  await autoAddUserToChats(user.id, ministryId, currentProfile.graduation_year ?? null, role, publicJoinGrade.effective)

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
  if (!isAdminRole(profile.role)) return { error: "Unauthorized." }

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
  if (callerProfile?.ministry_id && !isAdminRole(callerProfile.role)) {
    return { error: "Only ministry admins can register a new ministry." }
  }

  const admin = createAdminClient()

  // Duplicate-registration guard — a re-fire (double-submit, back-button, retry)
  // must not create a second pending ministry that orphans the first. If this
  // user already has a pending registration, surface it instead of inserting.
  //
  // …UNLESS that pending row is STRANDED. The ministry is inserted before the
  // founder is attached to it, so a failure between those two writes (the
  // deacon/elder role-CHECK rejection was one; a crash between them is another,
  // and the cleanup below cannot cover that) leaves a ministry with NO founder —
  // and this guard then permanently blocks the retry. "Stranded" is precisely
  // "neither link exists": the profile does not point at it AND it has no
  // user_ministries row. A legitimately-pending registration always has at
  // least one (a founder who later joined another ministry by code keeps the
  // membership row), so the test can't eat a real application.
  const { data: existingPending } = await admin
    .from("ministries")
    .select("id")
    .eq("created_by", user.id)
    .eq("status", "pending")
    .maybeSingle()
  if (existingPending) {
    const profileLinked = callerProfile?.ministry_id === existingPending.id
    const { data: existingMembership } = await admin
      .from("user_ministries")
      .select("role")
      .eq("user_id", user.id)
      .eq("ministry_id", existingPending.id)
      .maybeSingle()

    if (profileLinked || existingMembership) {
      // Real pending registration. Repair the half-link if the membership row is
      // the missing one — otherwise the founder is silently demoted to the
      // user_ministries default on their next ministry switch.
      if (profileLinked && !existingMembership) {
        await admin.from("user_ministries").upsert(
          { user_id: user.id, ministry_id: existingPending.id, role: callerProfile?.role ?? "pastor" },
          { onConflict: "user_id,ministry_id" }
        )
      }
      return { error: "You already have a pending registration — it's waiting for approval." }
    }

    // Stranded: no founder was ever attached, so nothing references this row
    // (chats/workspaces are only created after the link succeeds). Drop it and
    // let this submission proceed.
    await admin
      .from("ministries")
      .delete()
      .eq("id", existingPending.id)
      .eq("created_by", user.id)
      .eq("status", "pending")
  }

  const inviteCode = await uniqueInviteCode(admin)
  const staffCode = await uniqueStaffCode(admin)

  // Resolve the founder's role from validated sources only — never trust
  // unvalidated input and never read profiles.role (the DB trigger now forces
  // fresh signups to 'member', and the metadata role was previously forgeable).
  // Prefer the role picked on the admin signup form (stored in auth metadata),
  // then an explicit validated param, then default to "pastor".
  const picked = (user.user_metadata?.role as string | undefined)?.toLowerCase()
  const founderRole = isStaffRole(picked)
    ? picked!
    : (isStaffRole(data.founderRole)
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

  // The ministry row now exists but has no founder attached. Every failure from
  // here until BOTH link writes land must unwind it — otherwise the applicant is
  // left with a pending ministry they are not in, and the duplicate guard above
  // blocks their retry. (That is exactly how the deacon/elder role-CHECK
  // rejection stranded people: the insert succeeded, the role write did not.)
  const unwindMinistry = async () => {
    await admin.from("ministries").delete().eq("id", ministry.id).eq("status", "pending")
  }
  const priorMinistryId = callerProfile?.ministry_id ?? null
  const priorRole = callerProfile?.role ?? "member"

  // Link user to ministry with their specific founder role
  const { data: updatedRows, error: profileErr } = await admin
    .from("profiles")
    .update({ ministry_id: ministry.id, role: founderRole })
    .eq("id", user.id)
    .select("id")

  if (profileErr) {
    await unwindMinistry()
    return { error: profileErr.message }
  }
  if (!updatedRows || updatedRows.length === 0) {
    await unwindMinistry()
    return { error: "Profile not found. Please sign out and sign back in, then try again." }
  }

  const { error: membershipErr } = await admin.from("user_ministries").upsert(
    { user_id: user.id, ministry_id: ministry.id, role: founderRole },
    { onConflict: "user_id,ministry_id" }
  )
  if (membershipErr) {
    // Put the profile back where it was FIRST — profiles.ministry_id references
    // the row we're about to delete.
    await admin
      .from("profiles")
      .update({ ministry_id: priorMinistryId, role: priorRole })
      .eq("id", user.id)
    await unwindMinistry()
    return { error: membershipErr.message }
  }

  // Create standard grade + central chats for the new ministry
  await ensureMinistryChats(ministry.id, data.name.trim(), user.id)

  const { data: founderProfile } = await admin.from("profiles").select("graduation_year, grade").eq("id", user.id).single()
  await autoAddUserToChats(user.id, ministry.id, founderProfile?.graduation_year ?? null, founderRole, founderProfile?.grade ?? null)

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

  // Teams are independent of one another — seed them concurrently. Within a team
  // the roles + resources inserts both depend only on the new team id, so they
  // run in parallel too. The idempotency guard above already gated the whole set.
  await Promise.all(ids.map(async (id) => {
    const preset = presetById(id)
    if (!preset) return
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
    if (teamErr || !team) return
    // Seed the preset's roles (incl. the is_president role). No team_members —
    // the admin assigns the president later from the workspace's settings.
    // Seed Resources-tab starter content for roles that ship a guide
    // (summary + responsibilities — e.g. the board roles' real duties).
    const resourceRows = preset.roles
      .filter((r) => r.resources)
      .map((r) => ({
        team_id: team.id,
        role_name: r.name,
        summary: r.resources!.summary,
        responsibilities: r.resources!.responsibilities,
        created_by: createdBy,
        updated_by: createdBy,
        updated_at: new Date().toISOString(),
      }))
    await Promise.all([
      admin.from("team_roles").insert(
        preset.roles.map((r) => ({
          team_id: team.id,
          name: r.name,
          permissions: r.permissions,
          is_president: !!r.is_president,
        }))
      ),
      resourceRows.length > 0
        ? admin.from("team_role_descriptions").insert(resourceRows)
        : Promise.resolve(),
    ])
  }))
}

// Seed a freshly-approved ministry with starter content so the founder's first
// session isn't an empty shell: a pinned welcome announcement (member-facing
// tour of what lives here) and a "Leaders" church chat with the founder in it.
// Idempotent — each seed skips if an equivalent row already exists — and every
// insert is ministry-scoped (Convention #8). Failures must NOT fail approval:
// each seed is wrapped, logged, and skipped.
async function seedStarterContent(
  admin: ReturnType<typeof createAdminClient>,
  ministryId: string,
  ministryName: string,
  founderId: string,
): Promise<void> {
  // 1) Pinned welcome announcement — skip if the ministry already has ANY
  // announcement (a pending ministry can't post, so >0 means already seeded).
  try {
    const { count } = await admin
      .from("announcements")
      .select("id", { count: "exact", head: true })
      .eq("ministry_id", ministryId)
    if ((count ?? 0) === 0) {
      const { error } = await admin.from("announcements").insert({
        ministry_id: ministryId,
        created_by: founderId,
        title: `Welcome to ${ministryName} on Central`,
        body:
          `${ministryName} now has a home on Central — one calm place for everything happening in our ministry. ` +
          `Church chats keep the whole congregation connected, and announcements gather events and RSVPs here so nothing gets lost in a group text. ` +
          `Your profile is yours to fill in, and your journal offers a quiet corner for devotionals, prayers, and verses. ` +
          `Look around and make yourself at home — we're glad you're here.`,
        audience: "all",
        is_event: false,
        event_date: null,
        show_attendees: false,
        is_pinned: true,
        image_url: null,
        status: "published",
      })
      if (error) console.error("[approveMinistry] welcome announcement seed failed:", error.message)
    }
  } catch (e) {
    console.error("[approveMinistry] welcome announcement seed failed:", e)
  }

  // 2) "Leaders" church chat — idempotent by (ministry_id, type='church',
  // name='Leaders'); founder membership upserted either way.
  try {
    const { data: existing } = await admin
      .from("groups")
      .select("id")
      .eq("ministry_id", ministryId)
      .eq("type", "church")
      .eq("name", "Leaders")
      .maybeSingle()

    let groupId = existing?.id ?? null
    if (!groupId) {
      const { data: group, error: gErr } = await admin
        .from("groups")
        .insert({ name: "Leaders", type: "church", category: "general", ministry_id: ministryId, created_by: founderId })
        .select("id")
        .single()
      if (gErr || !group) {
        console.error("[approveMinistry] Leaders chat seed failed:", gErr?.message)
        return
      }
      groupId = group.id
    }

    const { error: mErr } = await admin.from("group_members").upsert(
      [{ group_id: groupId, user_id: founderId, last_read_at: new Date().toISOString() }],
      { onConflict: "group_id,user_id" },
    )
    if (mErr) console.error("[approveMinistry] Leaders chat membership seed failed:", mErr.message)
  } catch (e) {
    console.error("[approveMinistry] Leaders chat seed failed:", e)
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
    .select("name, universities, onboarding_workspaces, created_by")
    .eq("id", ministryId)
    .single()

  // The three seeding operations below are independent (workspaces/roles,
  // starter content, ministry_schools) and each keeps its own idempotence guard,
  // so they run concurrently to cut approval latency.
  const onboardingWorkspaces: string[] = Array.isArray(ministry?.onboarding_workspaces)
    ? ministry!.onboarding_workspaces
    : []
  const unis: string[] = Array.isArray(ministry?.universities) ? ministry.universities : []

  const seedSchools = async () => {
    if (unis.length === 0) return
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

  await Promise.all([
    // Create the workspaces the admin selected at onboarding, empty (no president),
    // plus starter content (pinned welcome announcement + "Leaders" chat) — the
    // latter never fails approval; errors are logged inside and swallowed.
    ministry?.created_by
      ? Promise.all([
          createOnboardingWorkspaces(admin, ministryId, ministry.created_by, onboardingWorkspaces),
          seedStarterContent(admin, ministryId, ministry.name ?? "your ministry", ministry.created_by),
        ])
      : Promise.resolve(),
    seedSchools(),
  ])

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
  if (!isAdminRole(profile.role)) return { error: "Only admins can update ministry info." }

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
  if (!isAdminRole(profile.role)) return { code: null, error: "Only admins can regenerate invite codes." }

  const admin = createAdminClient()
  const newCode = await uniqueInviteCode(admin)
  // Clearing invite_code_is_custom is NOT incidental. A generated code carries the
  // 32^10 entropy the whole instant-join model rests on (lib/invite-code.ts), so
  // regenerating restores instant join. Leaving the flag set would keep the ministry
  // taking requests for a code that no longer needs them — with nothing on the screen
  // to explain why people are still queuing.
  const { error } = await admin
    .from("ministries")
    .update({ invite_code: newCode, invite_code_is_custom: false })
    .eq("id", profile.ministry_id)
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
  if (!isAdminRole(profile.role)) return { code: null, error: "Only admins can regenerate staff codes." }

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
const ADMIN_TIER_ROLES: string[] = [...ADMIN_ROLES]
const LAST_ADMIN_ERROR = "This is the last admin — a ministry must keep at least one admin. Promote someone else first."

// Leaders chat membership tracks leader-tier-and-above (leader + admin-tier).
const LEADER_TIER_OR_ABOVE: string[] = [...LEADER_ROLES]

// Locate a ministry's "Leaders" general church chat (the starter-content seed).
// Tolerates absence — returns null so callers can no-op.
async function findLeadersChatId(
  admin: ReturnType<typeof createAdminClient>,
  ministryId: string,
): Promise<string | null> {
  const { data } = await admin
    .from("groups")
    .select("id")
    .eq("ministry_id", ministryId)
    .eq("type", "church")
    .eq("category", "general")
    .eq("name", "Leaders")
    .order("created_at", { ascending: true })
    .limit(1)
  return data?.[0]?.id ?? null
}

// Targeted Leaders-chat membership sync for a single role change. Promotion into
// leader-tier-or-above upserts the row; demotion out of it deletes the row.
// Fire-and-forget: never throws — a sync failure must not fail the role update.
async function syncLeadersChatMembership(
  admin: ReturnType<typeof createAdminClient>,
  ministryId: string,
  userId: string,
  newRole: string,
): Promise<void> {
  try {
    const chatId = await findLeadersChatId(admin, ministryId)
    if (!chatId) return
    if (LEADER_TIER_OR_ABOVE.includes(newRole.toLowerCase())) {
      await admin.from("group_members").upsert(
        [{ group_id: chatId, user_id: userId, last_read_at: new Date().toISOString() }],
        { onConflict: "group_id,user_id", ignoreDuplicates: true },
      )
    } else {
      await admin.from("group_members").delete().eq("group_id", chatId).eq("user_id", userId)
    }
  } catch (e) {
    console.error("[updateMemberRole] Leaders chat sync failed:", e)
  }
}

// One-shot full reconcile of the Leaders chat: adds every current leader-tier+
// member, removes everyone else. Admin-gated; exported for the settings
// automations panel / drift repair.
export async function healLeadersChat(ministryId: string): Promise<{ added: number; removed: number; error?: string }> {
  const authz = await requireMinistryAdmin(ministryId)
  if (authz.error !== null) return { added: 0, removed: 0, error: authz.error }

  const admin = createAdminClient()
  const chatId = await findLeadersChatId(admin, ministryId)
  if (!chatId) return { added: 0, removed: 0 }

  const { data: leaders } = await admin
    .from("profiles")
    .select("id")
    .eq("ministry_id", ministryId)
    .in("role", LEADER_TIER_OR_ABOVE)
  const wanted = new Set((leaders ?? []).map((p: { id: string }) => p.id))

  const { data: current } = await admin
    .from("group_members")
    .select("user_id")
    .eq("group_id", chatId)
  const have = new Set((current ?? []).map((r: { user_id: string }) => r.user_id))

  const toAdd = [...wanted].filter((id) => !have.has(id))
  const toRemove = [...have].filter((id) => !wanted.has(id))

  const now = new Date().toISOString()
  if (toAdd.length > 0) {
    await admin.from("group_members").upsert(
      toAdd.map((uid) => ({ group_id: chatId, user_id: uid, last_read_at: now })),
      { onConflict: "group_id,user_id", ignoreDuplicates: true },
    )
  }
  if (toRemove.length > 0) {
    await admin.from("group_members").delete().eq("group_id", chatId).in("user_id", toRemove)
  }
  return { added: toAdd.length, removed: toRemove.length }
}

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
  if (!isAdminRole(profile.role)) return { error: "Only admins can change member roles." }

  const admin = createAdminClient()

  // Hard-block last admin: if the new role drops the target out of admin-tier,
  // the target must not be the ministry's last admin-tier member.
  if (!ADMIN_TIER_ROLES.includes(newRole.toLowerCase())) {
    const blockErr = await lastAdminBlockError(admin, profile.ministry_id, targetUserId)
    if (blockErr) return { error: blockErr }
  }

  // The role lives in TWO places and they must move together: profiles.role is
  // what every gate reads, user_ministries.role is what setCurrentMinistry /
  // a return-join restores it FROM. Writing only profiles silently demotes the
  // member back on their next ministry switch (joinMinistryByCode already keeps
  // both in step — this path did not).
  const { data: priorRows } = await admin
    .from("profiles").select("role").eq("id", targetUserId).eq("ministry_id", profile.ministry_id).maybeSingle()
  const priorRole = priorRows?.role ?? null

  const { error } = await admin.from("profiles").update({ role: newRole }).eq("id", targetUserId).eq("ministry_id", profile.ministry_id)
  if (error) return { error: error.message }

  // Upsert (not update): a member whose profile points at this ministry IS a
  // member, even if a legacy path never wrote them a membership row.
  const { error: membershipErr } = await admin.from("user_ministries").upsert(
    { user_id: targetUserId, ministry_id: profile.ministry_id, role: newRole },
    { onConflict: "user_id,ministry_id" }
  )
  if (membershipErr) {
    // Leave the two in lockstep rather than half-applied.
    if (priorRole) {
      await admin.from("profiles").update({ role: priorRole }).eq("id", targetUserId).eq("ministry_id", profile.ministry_id)
    }
    return { error: membershipErr.message }
  }

  // Keep the Leaders chat roster in step with the new role (fire-and-forget —
  // never fails the role change).
  await syncLeadersChatMembership(admin, profile.ministry_id, targetUserId, newRole)

  return { error: null }
}

// A user who exits a ministry (leave / remove / excommunicate) must also be dropped
// from that ministry's chats. Otherwise their group_members rows linger: once their
// profile.ministry_id is nulled the roster join is RLS-invisible and they render as
// "Unknown" (and the chat name-resolution treats departed senders as non-roster).
// Message history is preserved — messages.sender_id is independent, and
// ministry_departures drives the "left" indicator on their past messages.
async function removeUserFromMinistryChats(
  admin: ReturnType<typeof createAdminClient>,
  userId: string,
  ministryId: string,
): Promise<void> {
  const { data: groups } = await admin.from("groups").select("id, type").eq("ministry_id", ministryId)
  const rows = (groups ?? []) as { id: string; type: string }[]
  if (!rows.length) return

  // A DM has no roster to fall back on. get_chat_list derives a DM's title per
  // viewer by looking up "the other member" through group_members — and the very
  // next statement deletes exactly that row, so the lookup returns nothing and the
  // title falls through to `groups.name`, which was written from the CREATOR's
  // side. Left alone, the survivor's DM with the person who just left is titled
  // with the SURVIVOR'S OWN NAME (the same failure dm-identity.mobile.spec was
  // written for, arriving by a different door).
  //
  // So stamp the departing person's name onto their DMs first. `groups.name` is
  // shared by both viewers, which is normally why it can't be trusted — but the
  // other party is on their way out of this ministry and will not see this chat
  // again, so a one-sided name is exactly right here.
  const dmIds = rows.filter((g) => g.type === "dm").map((g) => g.id)
  if (dmIds.length) {
    const { data: leaver } = await admin.from("profiles").select("name").eq("id", userId).maybeSingle()
    const leaverName = leaver?.name?.trim()
    if (leaverName) {
      const { data: theirDms } = await admin
        .from("group_members").select("group_id").eq("user_id", userId).in("group_id", dmIds)
      const ids = (theirDms ?? []).map((r: { group_id: string }) => r.group_id)
      if (ids.length) await admin.from("groups").update({ name: leaverName }).in("id", ids)
    }
  }

  await admin.from("group_members").delete().eq("user_id", userId).in("group_id", rows.map((g) => g.id))
}

// ─── Admin: remove a member from the ministry ────────────────────────────────
export async function removeMember(targetUserId: string): Promise<{ error: string | null }> {
  const supabase = await createClient()
  const { data: { user }, error: authErr } = await supabase.auth.getUser()
  if (authErr || !user) return { error: "Not authenticated." }

  if (targetUserId === user.id) return { error: "You cannot remove yourself." }

  const { data: profile } = await supabase.from("profiles").select("ministry_id, role").eq("id", user.id).maybeSingle()
  if (!profile?.ministry_id) return { error: "No ministry found." }
  if (!isAdminRole(profile.role)) return { error: "Only admins can remove members." }

  const admin = createAdminClient()

  // Hard-block last admin: removal drops the target out of admin-tier, so the
  // target must not be the ministry's last admin-tier member.
  const blockErr = await lastAdminBlockError(admin, profile.ministry_id, targetUserId)
  if (blockErr) return { error: blockErr }

  // Record the departure BEFORE the profile is detached. This is not just the
  // "left" indicator any more: `auth_shares_chat_history` keeps a departed
  // person's profile readable inside the chats they posted in, and this row is
  // what tells the UI to render that name DIMMED rather than as a current member.
  // removeMember was the one exit path that never wrote it (excommunicateMember
  // and selfLeaveMinistry always did), so an admin-removed member was the only
  // kind who came back looking like they had never left.
  await admin.from("ministry_departures").upsert(
    { user_id: targetUserId, ministry_id: profile.ministry_id },
    { onConflict: "user_id,ministry_id" }
  )

  const { error } = await admin.from("profiles").update({ ministry_id: null, role: "member" }).eq("id", targetUserId).eq("ministry_id", profile.ministry_id)
  if (error) return { error: error.message }

  // Revoke the membership record too (mirrors excommunicateMember/selfLeaveMinistry) —
  // otherwise the removed member can re-enter via setCurrentMinistry, which restores
  // their stale role from user_ministries.
  await admin.from("user_ministries").delete().eq("user_id", targetUserId).eq("ministry_id", profile.ministry_id)

  // Drop them from the ministry's chats too (else they linger as "Unknown").
  await removeUserFromMinistryChats(admin, targetUserId, profile.ministry_id)

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
  if (!isAdminRole(profile.role)) return { state: null, error: "Only admins can archive the ministry." }

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
  /** Whether the MEMBER code is custom — i.e. whether typing it opens a request
   *  instead of granting membership. The settings card has to say which, because the
   *  two behave completely differently for the person on the other end. */
  inviteCodeIsCustom: boolean
  /** Whether every member may share the code, or only leaders. Read HERE rather than
   *  from a client select: the column is deliberately ungranted to `authenticated`,
   *  so naming it in a browser query would 403 the entire request. */
  memberCanInvite: boolean
  error: string | null
}> {
  const authz = await requireMinistryAdmin(ministryId)
  if (authz.error !== null) return { inviteCode: null, staffInviteCode: null, inviteCodeIsCustom: false, memberCanInvite: true, error: authz.error }

  const admin = createAdminClient()
  const { data, error } = await admin
    .from("ministries")
    .select("invite_code, staff_invite_code, invite_code_is_custom, member_can_invite")
    .eq("id", ministryId)
    .maybeSingle()
  if (error || !data) return { inviteCode: null, staffInviteCode: null, inviteCodeIsCustom: false, memberCanInvite: true, error: error?.message ?? "Ministry not found." }
  return {
    inviteCode: data.invite_code ?? null,
    staffInviteCode: data.staff_invite_code ?? null,
    inviteCodeIsCustom: data.invite_code_is_custom === true,
    // Default TRUE on a null: members have been able to share since 2026-07-04, so an
    // unset column must never read as "revoked".
    memberCanInvite: data.member_can_invite !== false,
    error: null,
  }
}

// ─── Member: read the MEMBER invite code only ────────────────────────────────
// MOVED to app/actions/join-requests.ts (2026-08-22). There were briefly TWO
// exported functions with this name in two "use server" files — meaning two live
// POST endpoints — and only the new one consulted `member_can_invite`. A ministry
// that narrowed sharing to leaders would have seen the Home tile refuse while
// /ministries handed the same member the code, a QR and a share sheet: the flag was
// decorative. One gate needs one function.

// ─── Admin: excommunicate a member (permanent ban — can never rejoin) ───────────
export async function excommunicateMember(targetUserId: string): Promise<{ error: string | null }> {
  const supabase = await createClient()
  const { data: { user }, error: authErr } = await supabase.auth.getUser()
  if (authErr || !user) return { error: "Not authenticated." }

  if (targetUserId === user.id) return { error: "You cannot excommunicate yourself." }

  const { data: profile } = await supabase.from("profiles").select("ministry_id, role").eq("id", user.id).maybeSingle()
  if (!profile?.ministry_id) return { error: "No ministry found." }
  if (!isAdminRole(profile.role)) return { error: "Only admins can excommunicate members." }

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

  // Drop them from the ministry's chats too (else they linger as "Unknown").
  await removeUserFromMinistryChats(admin, targetUserId, targetMinistryId)

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

  // Drop them from the ministry's chats too (else they linger as "Unknown").
  await removeUserFromMinistryChats(admin, user.id, ministryId)

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
  if (!isAdminRole(profile.role)) return { data: null, error: "Unauthorized." }

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

// ─── RETIRED: the 30-day departed-member anonymiser ──────────────────────────
//
// It used to null `sender_id` on a departed member's messages and DELETE their
// `ministry_departures` row, so after 30 days they became an anonymous "Former
// Member" with no record they had ever been here.
//
// Both halves are now actively destructive. `ministry_departures` is the record
// that keeps a past member's name resolving in the chats they posted in
// (`auth_shares_chat_history`) and that tells the UI to dim it; nulling
// `sender_id` severs the only link that predicate walks. Running this once would
// have permanently erased the identity of everyone who had left — the exact thing
// this change exists to preserve, and unrecoverable afterwards.
//
// The legitimate need it half-served — "erase me" — belongs to account deletion
// (`deleteMyAccount`), which scrubs the person rather than the ministry's memory
// of them. There is no replacement action here on purpose: an exported async
// function in a "use server" file is a callable endpoint, so leaving a
// deprecated one in place would leave the destructive path reachable.

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
    const { data: elevated, error } = await admin
      .from("profiles")
      .update({ role: "leader" })
      .in("id", userIds)
      .eq("ministry_id", ministryId)
      .in("role", [...MEMBER_TIER])
      .select("id")
    if (error) return { error: error.message }

    // Mirror into user_ministries — the role lives in two places and
    // setCurrentMinistry restores from THAT one, so a profiles-only elevation
    // is undone the next time they switch ministries. Only the rows actually
    // elevated (the .in("role", MEMBER_TIER) filter skips existing leaders).
    const elevatedIds = (elevated ?? []).map((r: { id: string }) => r.id)
    if (elevatedIds.length > 0) {
      await admin.from("user_ministries").upsert(
        elevatedIds.map((id) => ({ user_id: id, ministry_id: ministryId, role: "leader" })),
        { onConflict: "user_id,ministry_id" }
      )
    }
    return { error: null }
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Failed to elevate role." }
  }
}
