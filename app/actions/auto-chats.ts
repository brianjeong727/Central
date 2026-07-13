"use server"

import { createAdminClient } from "@/lib/supabase-admin"
import { getSemesterLabel } from "@/app/actions/dgl-utils"
import {
  requireMinistryMember,
  requireSameMinistry,
  requireMinistryAdmin,
  requireTeamMemberOrAdmin,
  isAdminTier,
} from "@/app/actions/authz"
import { STAFF_ROLES, isStaffRole } from "@/lib/roles"

// ── ensureMinistryChats ───────────────────────────────────────────────────────
// Creates only the central church chat (e.g. "Central Chat").
// Class-year chats are created on-demand when members join.

export async function ensureMinistryChats(
  ministryId: string,
  ministryName: string,
  createdBy: string,
): Promise<Map<string, string>> {
  // Internal helper reached via ministry join/registration flows, but exported
  // from a "use server" file → also a public endpoint. Caller must belong to
  // the ministry (the join flows set profiles.ministry_id before calling this).
  const authz = await requireSameMinistry(ministryId)
  if (authz.error !== null) return new Map()

  const admin = createAdminClient()
  const centralName = `${ministryName} Chat`

  // The central chat is now guaranteed by a DB auto-create trigger (one per
  // ministry, enforced by the `groups_one_central_per_ministry` partial unique
  // index). Identify it by the flag, never by name. This is idempotent: if the
  // trigger already made it, we simply return it and never create a duplicate.
  const { data: existing } = await admin
    .from("groups")
    .select("id, name")
    .eq("ministry_id", ministryId)
    .eq("is_central_chat", true)
    .maybeSingle()

  const chatMap = new Map<string, string>()
  if (existing) {
    chatMap.set(existing.name, existing.id)
    return chatMap
  }

  // Defensive fallback — the trigger should have created it. If somehow absent,
  // create it flagged central. Safe under the unique index because none exists here.
  const { data } = await admin
    .from("groups")
    .insert({ name: centralName, type: "church", category: "general", ministry_id: ministryId, created_by: createdBy, is_central_chat: true })
    .select("id, name")
    .single()
  if (data) chatMap.set(data.name, data.id)

  return chatMap
}

// ── autoAddUserToChats ────────────────────────────────────────────────────────
// Adds a user to their ministry's central chat and (if grade is set) grade chat.
// Respects automation_settings flags.


export async function autoAddUserToChats(
  userId: string,
  ministryId: string,
  graduationYear: number | null,
  userRole?: string | null,
): Promise<void> {
  // Caller must belong to the ministry, and may only auto-add THEMSELVES
  // unless admin-tier (the join flows always pass the caller's own id).
  const authz = await requireSameMinistry(ministryId)
  if (authz.error !== null) return
  if (userId !== authz.userId && !isAdminTier(authz.role)) return

  const admin = createAdminClient()

  const { data: ministry } = await admin
    .from("ministries")
    .select("name, automation_settings, created_by")
    .eq("id", ministryId)
    .single()

  if (!ministry) return

  const settings = (ministry.automation_settings ?? {}) as Record<string, boolean>
  const groupIdsToJoin: string[] = []
  const namesToJoin: string[] = []

  // Central chat — identified by the `is_central_chat` flag (name-independent),
  // guaranteed to exist by the DB trigger. New members are always enrolled here
  // regardless of what the chat is named, unless the automation is turned off.
  if (settings.auto_central_chat !== false) {
    const { data: central } = await admin
      .from("groups")
      .select("id")
      .eq("ministry_id", ministryId)
      .eq("is_central_chat", true)
      .maybeSingle()
    if (central) groupIdsToJoin.push(central.id)
  }

  if (settings.auto_grade_chats === true && graduationYear) {
    const className = `Class of ${graduationYear}`
    const { data: existingChat } = await admin
      .from("groups")
      .select("id")
      .eq("ministry_id", ministryId)
      .eq("name", className)
      .maybeSingle()

    if (!existingChat) {
      await admin.from("groups").insert({
        name: className,
        type: "church",
        category: "general",
        ministry_id: ministryId,
        created_by: ministry.created_by,
      })
    }
    namesToJoin.push(className)
  }

  if (settings.auto_staff_chat === true && isStaffRole(userRole)) {
    const staffChatName = `${ministry.name} Staff`
    const { data: existingStaff } = await admin
      .from("groups")
      .select("id")
      .eq("ministry_id", ministryId)
      .eq("name", staffChatName)
      .maybeSingle()

    if (!existingStaff) {
      await admin.from("groups").insert({
        name: staffChatName,
        type: "church",
        category: "general",
        ministry_id: ministryId,
        created_by: ministry.created_by,
      })
    }
    namesToJoin.push(staffChatName)
  }

  // Resolve the remaining name-based chats (grade / staff) to ids.
  if (namesToJoin.length > 0) {
    const { data: groups } = await admin
      .from("groups")
      .select("id")
      .eq("ministry_id", ministryId)
      .in("name", namesToJoin)
    for (const g of (groups ?? []) as { id: string }[]) groupIdsToJoin.push(g.id)
  }

  if (groupIdsToJoin.length === 0) return

  await admin
    .from("group_members")
    .upsert(
      groupIdsToJoin.map((id) => ({ group_id: id, user_id: userId })),
      { onConflict: "group_id,user_id", ignoreDuplicates: true }
    )
}

// ── retroactivelyApplyToggle ──────────────────────────────────────────────────
// Called when an admin turns ON a chat automation toggle. Backfills all existing
// members who should have been in those chats but weren't (because the toggle was off).
export async function retroactivelyApplyToggle(
  ministryId: string,
  toggleKey: string,
): Promise<{ added: number; error?: string }> {
  // Admin-tier ministry configuration.
  const authz = await requireMinistryAdmin(ministryId)
  if (authz.error !== null) return { added: 0, error: authz.error }

  const admin = createAdminClient()

  const { data: ministry } = await admin
    .from("ministries")
    .select("name, created_by")
    .eq("id", ministryId)
    .single()

  if (!ministry) return { added: 0, error: "Ministry not found." }

  if (toggleKey === "auto_central_chat") {
    const { data: profiles } = await admin
      .from("profiles").select("id").eq("ministry_id", ministryId)

    // Identify the central chat by the flag, not by name (rename-safe).
    const { data: group } = await admin
      .from("groups").select("id").eq("ministry_id", ministryId).eq("is_central_chat", true).maybeSingle()
    if (!group) return { added: 0 }

    const ids = (profiles ?? []).map((p: { id: string }) => p.id)
    if (ids.length === 0) return { added: 0 }

    await admin.from("group_members").upsert(
      ids.map((id: string) => ({ group_id: group.id, user_id: id })),
      { onConflict: "group_id,user_id", ignoreDuplicates: true }
    )
    return { added: ids.length }
  }

  if (toggleKey === "auto_grade_chats") {
    const { data: profiles } = await admin
      .from("profiles").select("id, graduation_year").eq("ministry_id", ministryId).not("graduation_year", "is", null)

    const byYear = new Map<number, string[]>()
    for (const p of profiles ?? []) {
      if (!p.graduation_year) continue
      const arr = byYear.get(p.graduation_year) ?? []
      arr.push(p.id)
      byYear.set(p.graduation_year, arr)
    }

    let totalAdded = 0
    for (const [year, ids] of byYear) {
      const className = `Class of ${year}`
      let { data: chat } = await admin
        .from("groups").select("id").eq("ministry_id", ministryId).eq("name", className).maybeSingle()
      if (!chat) {
        const { data: newChat } = await admin
          .from("groups")
          .insert({ name: className, type: "church", category: "general", ministry_id: ministryId, created_by: ministry.created_by })
          .select("id").single()
        chat = newChat
      }
      if (!chat) continue
      await admin.from("group_members").upsert(
        ids.map((id: string) => ({ group_id: chat!.id, user_id: id })),
        { onConflict: "group_id,user_id", ignoreDuplicates: true }
      )
      totalAdded += ids.length
    }
    return { added: totalAdded }
  }

  if (toggleKey === "auto_staff_chat") {
    const { data: profiles } = await admin
      .from("profiles").select("id")
      .eq("ministry_id", ministryId)
      .in("role", [...STAFF_ROLES])

    const staffChatName = `${ministry.name} Staff`
    let { data: chat } = await admin
      .from("groups").select("id").eq("ministry_id", ministryId).eq("name", staffChatName).maybeSingle()
    if (!chat) {
      const { data: newChat } = await admin
        .from("groups")
        .insert({ name: staffChatName, type: "church", category: "general", ministry_id: ministryId, created_by: ministry.created_by })
        .select("id").single()
      chat = newChat
    }
    if (!chat) return { added: 0, error: "Failed to create staff chat." }

    const ids = (profiles ?? []).map((p: { id: string }) => p.id)
    if (ids.length === 0) return { added: 0 }

    await admin.from("group_members").upsert(
      ids.map((id: string) => ({ group_id: chat!.id, user_id: id })),
      { onConflict: "group_id,user_id", ignoreDuplicates: true }
    )
    return { added: ids.length }
  }

  return { added: 0 }
}

// ── runAnnualClassMaintenance ─────────────────────────────────────────────────
// Call every June. Creates the incoming class chat, graduates the current class
// (converts "Class of {year}" from church → my type).
export async function runAnnualClassMaintenance(ministryId: string): Promise<{
  created: string | null
  graduated: string | null
  error?: string
}> {
  // Admin-tier ministry configuration.
  const authz = await requireMinistryAdmin(ministryId)
  if (authz.error !== null) return { created: null, graduated: null, error: authz.error }

  const admin = createAdminClient()
  const now = new Date()
  const currentYear = now.getFullYear()

  const { data: ministry } = await admin
    .from("ministries")
    .select("name, created_by, automation_settings")
    .eq("id", ministryId)
    .single()

  if (!ministry) return { created: null, graduated: null, error: "Ministry not found." }

  const settings = (ministry.automation_settings ?? {}) as Record<string, boolean>
  let created: string | null = null
  let graduated: string | null = null

  // Create incoming class chat (4 years out)
  if (settings.auto_grade_chats === true) {
    const incomingYear = currentYear + 4
    const incomingName = `Class of ${incomingYear}`
    const { data: existingIncoming } = await admin
      .from("groups").select("id").eq("ministry_id", ministryId).eq("name", incomingName).maybeSingle()
    if (!existingIncoming) {
      await admin.from("groups").insert({
        name: incomingName, type: "church", category: "general",
        ministry_id: ministryId, created_by: ministry.created_by,
      })
      created = incomingName
    }
  }

  // Graduate current class: convert "Class of {currentYear}" from church → my
  const graduatingName = `Class of ${currentYear}`
  const { data: graduatingChat } = await admin
    .from("groups").select("id, type").eq("ministry_id", ministryId).eq("name", graduatingName).maybeSingle()
  if (graduatingChat && graduatingChat.type === "church") {
    await admin.from("groups").update({ type: "my" }).eq("id", graduatingChat.id)
    graduated = graduatingName
  }

  return { created, graduated }
}

// ── createPraiseTeamChatAction ────────────────────────────────────────────────
// Creates a "Praise Team · [Month Day]" church chat for a confirmed worship week.
// Deduplicates: skips if chat_group_id is already set on the week.

export async function createPraiseTeamChatAction(
  weekId: string,
  ministryId: string,
): Promise<{ groupId: string | null; skipped?: boolean; error?: string }> {
  // Caller must belong to the ministry.
  const authz = await requireSameMinistry(ministryId)
  if (authz.error !== null) return { groupId: null, error: authz.error }

  const admin = createAdminClient()

  // Check automation setting
  const { data: ministry } = await admin
    .from("ministries")
    .select("automation_settings")
    .eq("id", ministryId)
    .single()

  const settings = ((ministry?.automation_settings ?? {}) as Record<string, boolean>)
  if (settings.auto_praise_chat === false) return { groupId: null, skipped: true }

  // Fetch the worship week — scoped to this ministry (a cross-ministry weekId
  // must not be reachable).
  const { data: week } = await admin
    .from("worship_weeks")
    .select("week_date, leader_id, chat_group_id, team_id")
    .eq("id", weekId)
    .eq("ministry_id", ministryId)
    .single()

  if (!week) return { groupId: null, error: "Week not found." }

  // Non-admin callers must be members of the praise team that owns this week.
  if (!isAdminTier(authz.role) && week.team_id) {
    const { data: member } = await admin
      .from("team_members")
      .select("id")
      .eq("team_id", week.team_id)
      .eq("user_id", authz.userId)
      .maybeSingle()
    if (!member) return { groupId: null, error: "Not authorized." }
  }
  if (week.chat_group_id) return { groupId: week.chat_group_id, skipped: true }

  // Fetch assigned roles
  const { data: roleRows } = await admin
    .from("worship_roles")
    .select("user_id")
    .eq("week_id", weekId)

  if ((!roleRows || roleRows.length === 0) && !week.leader_id) return { groupId: null, skipped: true }

  // Format chat name: "Praise Team · June 1"
  const d = new Date(week.week_date + "T00:00:00Z")
  const monthDay = d.toLocaleDateString("en-US", { month: "long", day: "numeric", timeZone: "UTC" })
  const chatName = `Praise Team · ${monthDay}`

  // Dedup by name + ministry
  const { data: existing } = await admin
    .from("groups")
    .select("id")
    .eq("ministry_id", ministryId)
    .eq("name", chatName)
    .maybeSingle()

  let groupId: string

  if (existing) {
    groupId = existing.id
  } else {
    const { data: group, error: groupErr } = await admin
      .from("groups")
      .insert({ name: chatName, type: "church", category: "team", ministry_id: ministryId, created_by: week.leader_id })
      .select("id")
      .single()
    if (groupErr || !group) return { groupId: null, error: "Failed to create praise team chat." }
    groupId = group.id
  }

  // Collect all member ids (roles + leader), deduplicated
  const memberIds = Array.from(new Set([
    ...(roleRows ?? []).map((r: { user_id: string }) => r.user_id),
    ...(week.leader_id ? [week.leader_id] : []),
  ]))

  await admin
    .from("group_members")
    .upsert(
      memberIds.map(uid => ({ group_id: groupId, user_id: uid })),
      { onConflict: "group_id,user_id", ignoreDuplicates: true }
    )

  // Link back to the worship week
  await admin
    .from("worship_weeks")
    .update({ chat_group_id: groupId })
    .eq("id", weekId)

  return { groupId }
}

// ── confirmSmallGroupChatsAction ──────────────────────────────────────────────
// Creates "[LeaderFirst]'s Group" and "[L1First] + [L2First]'s Groups" church chats.
// Deduplicates by name + ministry_id. Returns counts.

export async function confirmSmallGroupChatsAction(
  teamId: string,
  ministryId: string,
): Promise<{ created: number; updated: number; error?: string }> {
  // Caller must be admin-tier or a member of this team, in this ministry.
  const authz = await requireTeamMemberOrAdmin(teamId)
  if (authz.error !== null) return { created: 0, updated: 0, error: authz.error }
  if (authz.ministryId !== ministryId) return { created: 0, updated: 0, error: "Not authorized." }

  try {
  const admin = createAdminClient()

  // Check automation setting
  const { data: ministry } = await admin
    .from("ministries")
    .select("created_by, automation_settings")
    .eq("id", ministryId)
    .single()

  const settings = ((ministry?.automation_settings ?? {}) as Record<string, boolean>)
  if (settings.auto_sg_chats === false) return { created: 0, updated: 0 }

  const createdBy = ministry?.created_by ?? ""

  // Fetch all small groups for this team
  const { data: smallGroups, error: sgErr } = await admin
    .from("small_groups")
    .select("id, name, leader_id, paired_group_id")
    .eq("team_id", teamId)

  if (sgErr) return { created: 0, updated: 0, error: `Failed to fetch small groups: ${sgErr.message}` }
  if (!smallGroups || smallGroups.length === 0) return { created: 0, updated: 0, error: "No small groups found for this team." }

  const groupIds = smallGroups.map((g: { id: string }) => g.id)
  const leaderIds = smallGroups
    .map((g: { leader_id: string | null }) => g.leader_id)
    .filter(Boolean) as string[]

  const { data: memberRows } = await admin
    .from("small_group_members")
    .select("group_id, user_id")
    .in("group_id", groupIds)

  const allUserIds = Array.from(new Set([
    ...leaderIds,
    ...(memberRows ?? []).map((r: { user_id: string }) => r.user_id),
  ]))

  // Fetch profiles for name lookup
  const { data: profileRows } = await admin
    .from("profiles")
    .select("id, name")
    .in("id", allUserIds)

  const profileMap = new Map<string, string>(
    (profileRows ?? []).map((p: { id: string; name: string }) => [p.id, p.name])
  )

  // Build member lookup: groupId → user_ids[]
  const membersByGroup = new Map<string, string[]>()
  for (const r of (memberRows ?? []) as { group_id: string; user_id: string }[]) {
    const arr = membersByGroup.get(r.group_id) ?? []
    arr.push(r.user_id)
    membersByGroup.set(r.group_id, arr)
  }

  // Build id → small group lookup
  const sgById = new Map(
    smallGroups.map((g: { id: string; leader_id: string | null; paired_group_id: string | null }) => [g.id, g])
  )

  function firstName(name: string) {
    return name.split(" ")[0]
  }

  async function upsertChat(chatName: string, memberIds: string[]): Promise<{ result: "created" | "updated" | "error"; groupId: string | null }> {
    const { data: existing } = await admin
      .from("groups")
      .select("id")
      .eq("ministry_id", ministryId)
      .eq("name", chatName)
      .maybeSingle()

    let groupId: string

    if (existing) {
      groupId = existing.id
      // Sync members: insert missing, don't remove existing
      await admin
        .from("group_members")
        .upsert(
          memberIds.map(uid => ({ group_id: groupId, user_id: uid })),
          { onConflict: "group_id,user_id", ignoreDuplicates: true }
        )
      return { result: "updated", groupId }
    } else {
      const { data: group, error } = await admin
        .from("groups")
        .insert({ name: chatName, type: "church", category: "group", ministry_id: ministryId, created_by: createdBy })
        .select("id")
        .single()
      if (error || !group) return { result: "error", groupId: null }
      groupId = group.id
      await admin
        .from("group_members")
        .upsert(
          memberIds.map(uid => ({ group_id: groupId, user_id: uid })),
          { onConflict: "group_id,user_id", ignoreDuplicates: true }
        )
      return { result: "created", groupId }
    }
  }

  let created = 0
  let updated = 0
  const pairedSeen = new Set<string>()

  for (const sg of smallGroups as { id: string; leader_id: string | null; paired_group_id: string | null }[]) {
    if (!sg.leader_id) continue
    const leaderName = profileMap.get(sg.leader_id)
    if (!leaderName) continue

    // Individual group chat
    const chatName = `${firstName(leaderName)}'s Group`
    const members = Array.from(new Set([sg.leader_id, ...(membersByGroup.get(sg.id) ?? [])]))
    const { result, groupId: chatGroupId } = await upsertChat(chatName, members)
    if (result === "created") created++
    else if (result === "updated") updated++

    // Save chat_group_id back to small_groups for bidirectional sync
    if (chatGroupId) {
      await admin.from("small_groups").update({ chat_group_id: chatGroupId }).eq("id", sg.id)
    }

    // Paired group chat (process each pair only once)
    if (!sg.paired_group_id) continue
    const pairKey = [sg.id, sg.paired_group_id].sort().join("::")
    if (pairedSeen.has(pairKey)) continue
    pairedSeen.add(pairKey)

    const paired = sgById.get(sg.paired_group_id)
    if (!paired || !paired.leader_id) continue
    const pairedLeaderName = profileMap.get(paired.leader_id)
    if (!pairedLeaderName) continue

    const pairedChatName = `${firstName(leaderName)} + ${firstName(pairedLeaderName)}'s Groups`
    const pairedMembers = Array.from(new Set([
      sg.leader_id,
      paired.leader_id,
      ...(membersByGroup.get(sg.id) ?? []),
      ...(membersByGroup.get(sg.paired_group_id) ?? []),
    ]))
    const { result: pairedResult } = await upsertChat(pairedChatName, pairedMembers)
    if (pairedResult === "created") created++
    else if (pairedResult === "updated") updated++
  }

  return { created, updated }
  } catch (e) {
    return { created: 0, updated: 0, error: e instanceof Error ? e.message : "Unexpected error creating group chats." }
  }
}

// ── respondToGradCheck ────────────────────────────────────────────────────────
// Handles the senior graduation banner response.
// graduated=true → moves to Young Adult Chat; graduated=false → clears flag only.

export async function respondToGradCheck(
  userId: string,
  graduated: boolean,
): Promise<{ error?: string }> {
  // A user may only respond for THEMSELVES; admins may respond for a member of
  // their own ministry. Nobody can flip another user's grad status otherwise.
  const authz = await requireMinistryMember()
  if (authz.error !== null) return { error: authz.error }

  const admin = createAdminClient()

  if (userId !== authz.userId) {
    if (!isAdminTier(authz.role)) return { error: "Not authorized." }
    const { data: target } = await admin
      .from("profiles")
      .select("ministry_id")
      .eq("id", userId)
      .maybeSingle()
    if (!target || target.ministry_id !== authz.ministryId) return { error: "Not authorized." }
  }

  if (graduated) {
    // Fetch user's ministry_id
    const { data: profile } = await admin
      .from("profiles")
      .select("ministry_id")
      .eq("id", userId)
      .single()

    if (profile?.ministry_id) {
      // Swap group_members: Senior Chat → Young Adult Chat
      const { data: chats } = await admin
        .from("groups")
        .select("id, name")
        .eq("ministry_id", profile.ministry_id)
        .eq("type", "church")
        .in("name", ["Senior Chat", "Young Adult Chat"])

      const seniorChat = (chats ?? []).find((g: { name: string }) => g.name === "Senior Chat")
      const youngAdultChat = (chats ?? []).find((g: { name: string }) => g.name === "Young Adult Chat")

      if (seniorChat) {
        await admin.from("group_members").delete()
          .eq("group_id", seniorChat.id)
          .eq("user_id", userId)
      }
      if (youngAdultChat) {
        await admin.from("group_members").upsert(
          [{ group_id: youngAdultChat.id, user_id: userId }],
          { onConflict: "group_id,user_id", ignoreDuplicates: true }
        )
      }
    }

    const { error } = await admin
      .from("profiles")
      .update({ grade: "young_adult", needs_grad_check: false, grade_updated_at: new Date().toISOString() })
      .eq("id", userId)

    return { error: error?.message }
  } else {
    const { error } = await admin
      .from("profiles")
      .update({ needs_grad_check: false })
      .eq("id", userId)

    return { error: error?.message }
  }
}

// ── updateSmallGroupMembersAction ─────────────────────────────────────────────
// Updates small_group_members for a DGL's group, then syncs adds/removes to the
// linked group chat (if chat_group_id is set on the small_groups row).

export async function updateSmallGroupMembersAction(params: {
  smallGroupId: string
  addUserIds: string[]
  removeUserIds: string[]
}): Promise<{ error?: string }> {
  const authz = await requireMinistryMember()
  if (authz.error !== null) return { error: authz.error }

  const admin = createAdminClient()
  const semester = getSemesterLabel()

  // Fetch the small group to get chat_group_id — and its ministry/team so the
  // caller can be verified against it.
  const { data: sg, error: sgErr } = await admin
    .from("small_groups")
    .select("id, chat_group_id, ministry_id, team_id")
    .eq("id", params.smallGroupId)
    .single()

  if (sgErr || !sg) return { error: "Small group not found." }
  if (sg.ministry_id !== authz.ministryId) return { error: "Not authorized." }

  // Non-admin callers must be members of the team that owns this small group.
  if (!isAdminTier(authz.role)) {
    const { data: member } = await admin
      .from("team_members")
      .select("id")
      .eq("team_id", sg.team_id)
      .eq("user_id", authz.userId)
      .maybeSingle()
    if (!member) return { error: "Not authorized." }
  }

  // Only users who belong to this ministry may be added.
  if (params.addUserIds.length > 0) {
    const { data: validProfiles } = await admin
      .from("profiles")
      .select("id")
      .in("id", params.addUserIds)
      .eq("ministry_id", authz.ministryId)
    const validIds = new Set((validProfiles ?? []).map((p: { id: string }) => p.id))
    params = { ...params, addUserIds: params.addUserIds.filter(id => validIds.has(id)) }
  }

  // Remove members from small_group_members
  if (params.removeUserIds.length > 0) {
    const { error } = await admin
      .from("small_group_members")
      .delete()
      .eq("group_id", params.smallGroupId)
      .in("user_id", params.removeUserIds)
    if (error) return { error: `Failed to remove members: ${error.message}` }
  }

  // Add members to small_group_members
  if (params.addUserIds.length > 0) {
    const { error } = await admin
      .from("small_group_members")
      .upsert(
        params.addUserIds.map(uid => ({
          group_id: params.smallGroupId,
          user_id: uid,
          meal_taken: false,
          meal_semester: semester,
        })),
        { onConflict: "group_id,user_id", ignoreDuplicates: true }
      )
    if (error) return { error: `Failed to add members: ${error.message}` }
  }

  // Sync to linked group chat
  if (sg.chat_group_id) {
    if (params.removeUserIds.length > 0) {
      await admin
        .from("group_members")
        .delete()
        .eq("group_id", sg.chat_group_id)
        .in("user_id", params.removeUserIds)
    }
    if (params.addUserIds.length > 0) {
      await admin
        .from("group_members")
        .upsert(
          params.addUserIds.map(uid => ({ group_id: sg.chat_group_id, user_id: uid })),
          { onConflict: "group_id,user_id", ignoreDuplicates: true }
        )
    }
  }

  return {}
}

// ── syncSmallGroupFromChatAction ──────────────────────────────────────────────
// Called when ChatSettings saves member changes on a church chat.
// Finds the linked small_group by chat_group_id, then syncs the same
// adds/removes to small_group_members.

export async function syncSmallGroupFromChatAction(params: {
  chatGroupId: string
  addUserIds: string[]
  removeUserIds: string[]
}): Promise<{ skipped?: boolean; error?: string }> {
  if (params.addUserIds.length === 0 && params.removeUserIds.length === 0) return { skipped: true }

  // Caller must belong to the linked small group's ministry. (Chat managers may
  // not be members of the owning team — the finer chat-management gate lives in
  // ChatSettings; this blocks cross-ministry callers.)
  const authz = await requireMinistryMember()
  if (authz.error !== null) return { error: authz.error }

  const admin = createAdminClient()
  const semester = getSemesterLabel()

  // Find a small group linked to this chat
  const { data: sg } = await admin
    .from("small_groups")
    .select("id, ministry_id")
    .eq("chat_group_id", params.chatGroupId)
    .maybeSingle()

  if (!sg) return { skipped: true }
  if (sg.ministry_id !== authz.ministryId) return { error: "Not authorized." }

  // Only users who belong to this ministry may be added.
  if (params.addUserIds.length > 0) {
    const { data: validProfiles } = await admin
      .from("profiles")
      .select("id")
      .in("id", params.addUserIds)
      .eq("ministry_id", authz.ministryId)
    const validIds = new Set((validProfiles ?? []).map((p: { id: string }) => p.id))
    params = { ...params, addUserIds: params.addUserIds.filter(id => validIds.has(id)) }
  }

  if (params.removeUserIds.length > 0) {
    await admin
      .from("small_group_members")
      .delete()
      .eq("group_id", sg.id)
      .in("user_id", params.removeUserIds)
  }

  if (params.addUserIds.length > 0) {
    await admin
      .from("small_group_members")
      .upsert(
        params.addUserIds.map(uid => ({
          group_id: sg.id,
          user_id: uid,
          meal_taken: false,
          meal_semester: semester,
        })),
        { onConflict: "group_id,user_id", ignoreDuplicates: true }
      )
  }

  return {}
}

// ── updateAutomationSettings ──────────────────────────────────────────────────

export async function updateAutomationSettings(
  ministryId: string,
  settings: Record<string, boolean>,
): Promise<{ error?: string }> {
  // Admin-tier ministry configuration.
  const authz = await requireMinistryAdmin(ministryId)
  if (authz.error !== null) return { error: authz.error }

  const admin = createAdminClient()
  const { error } = await admin
    .from("ministries")
    .update({ automation_settings: settings })
    .eq("id", ministryId)
  return { error: error?.message }
}

// ── archiveToggleChats ────────────────────────────────────────────────────────
// Called when an admin turns OFF a chat automation. Archives the associated chats.
// auto_staff_chat  → archives "${ministry.name} Staff"
// auto_grade_chats → archives all "Class of {year}" church groups
// Other keys       → no-op (central chat is too critical; SG chats too deeply linked to teams)

export async function archiveToggleChats(
  ministryId: string,
  key: string,
): Promise<{ archived: number; error?: string }> {
  // Admin-tier ministry configuration.
  const authz = await requireMinistryAdmin(ministryId)
  if (authz.error !== null) return { archived: 0, error: authz.error }

  const admin = createAdminClient()

  const { data: ministry } = await admin
    .from("ministries")
    .select("name")
    .eq("id", ministryId)
    .single()

  if (!ministry) return { archived: 0, error: "Ministry not found." }

  if (key === "auto_staff_chat") {
    const staffChatName = `${ministry.name} Staff`
    const { error } = await admin
      .from("groups")
      .update({ archived: true })
      .eq("ministry_id", ministryId)
      .eq("name", staffChatName)
      .eq("type", "church")
    if (error) return { archived: 0, error: error.message }
    return { archived: 1 }
  }

  if (key === "auto_grade_chats") {
    const { data: chats, error: fetchErr } = await admin
      .from("groups")
      .select("id")
      .eq("ministry_id", ministryId)
      .eq("type", "church")
      .eq("archived", false)
      .like("name", "Class of %")
    if (fetchErr) return { archived: 0, error: fetchErr.message }
    if (!chats || chats.length === 0) return { archived: 0 }
    const ids = chats.map((g: { id: string }) => g.id)
    const { error: archiveErr } = await admin
      .from("groups")
      .update({ archived: true })
      .in("id", ids)
    if (archiveErr) return { archived: 0, error: archiveErr.message }
    return { archived: ids.length }
  }

  // auto_central_chat, auto_sg_chats, auto_praise_chat, auto_archive_praise — no-op
  return { archived: 0 }
}

// ── createTeamChatAction ──────────────────────────────────────────────────────
// Creates a group chat named "<Team Name>" with all current team members.
// Idempotent: if a group with that exact name already exists in the ministry,
// adds any missing members and returns the existing group id.

export async function createTeamChatAction(
  teamId: string,
  teamName: string,
  ministryId: string,
  createdBy: string,
): Promise<{ groupId: string | null; error?: string }> {
  // Caller must be admin-tier or a member of this team, in this ministry.
  const authz = await requireTeamMemberOrAdmin(teamId)
  if (authz.error !== null) return { groupId: null, error: authz.error }
  if (authz.ministryId !== ministryId) return { groupId: null, error: "Not authorized." }

  const admin = createAdminClient()

  const { data: memberRows } = await admin
    .from("team_members")
    .select("user_id")
    .eq("team_id", teamId)

  const memberIds: string[] = (memberRows ?? []).map((r: { user_id: string }) => r.user_id)
  if (memberIds.length === 0) return { groupId: null, error: "Team has no members." }

  const chatName = `${teamName}`

  // Dedup by the team link first (the canonical key for a team chat), then fall
  // back to name — so a manual create converges on any auto-created team chat.
  const { data: linked } = await admin
    .from("groups")
    .select("id")
    .eq("ministry_id", ministryId)
    .eq("linked_team_id", teamId)
    .order("created_at", { ascending: true })
    .limit(1)
  let existing = linked?.[0] ?? null
  if (!existing) {
    const { data: byName } = await admin
      .from("groups")
      .select("id")
      .eq("ministry_id", ministryId)
      .eq("name", chatName)
      .maybeSingle()
    existing = byName ?? null
  }

  let groupId: string

  if (existing) {
    groupId = existing.id
    // Backfill the section + team link onto a pre-existing name-matched chat.
    await admin
      .from("groups")
      .update({ category: "team", linked_team_id: teamId })
      .eq("id", groupId)
      .eq("ministry_id", ministryId)
  } else {
    const { data: group, error: gErr } = await admin
      .from("groups")
      .insert({ name: chatName, type: "church", category: "team", linked_team_id: teamId, ministry_id: ministryId, created_by: createdBy })
      .select("id")
      .single()
    if (gErr || !group) return { groupId: null, error: "Failed to create group chat." }
    groupId = group.id
  }

  // Add all team members (upsert so existing members are preserved)
  const now = new Date().toISOString()
  await admin
    .from("group_members")
    .upsert(
      memberIds.map(uid => ({ group_id: groupId, user_id: uid, last_read_at: now })),
      { onConflict: "group_id,user_id" },
    )

  return { groupId }
}

// ── createEventPlanningChatAction ─────────────────────────────────────────────
// Creates (or reopens) a church group chat named "[Event Name] Planning" with
// all people assigned roles on this event plan + the creator.
export async function createEventPlanningChatAction(
  eventPlanId: string,
  eventTitle: string,
  assignedUserIds: string[],
  createdBy: string,
  ministryId: string,
): Promise<{ groupId: string | null; created: boolean; error?: string }> {
  // Caller must belong to the ministry; the chat creator is always the caller.
  const authz = await requireSameMinistry(ministryId)
  if (authz.error !== null) return { groupId: null, created: false, error: authz.error }

  const admin = createAdminClient()

  // Only users who belong to this ministry may be added to the planning chat.
  const candidateIds = [...new Set([...assignedUserIds, authz.userId])]
  const { data: validProfiles } = await admin
    .from("profiles")
    .select("id")
    .in("id", candidateIds)
    .eq("ministry_id", ministryId)
  const validIds = new Set((validProfiles ?? []).map((p: { id: string }) => p.id))
  const memberIds = candidateIds.filter(id => validIds.has(id))

  // Event plan lookup scoped to this ministry — a cross-ministry planId is unreachable.
  const { data: planRow } = await admin
    .from("event_plans")
    .select("planning_group_id")
    .eq("id", eventPlanId)
    .eq("ministry_id", ministryId)
    .single()

  const now = new Date().toISOString()

  if (planRow?.planning_group_id) {
    await admin.from("group_members").upsert(
      memberIds.map(uid => ({ group_id: planRow.planning_group_id, user_id: uid, last_read_at: now })),
      { onConflict: "group_id,user_id" },
    )
    return { groupId: planRow.planning_group_id as string, created: false }
  }

  const chatName = `${eventTitle} Planning`
  const { data: group, error: gErr } = await admin
    .from("groups")
    // created_by comes from the verified session, never the caller-supplied param.
    .insert({ name: chatName, type: "church", category: "team", ministry_id: ministryId, created_by: authz.userId })
    .select("id")
    .single()
  if (gErr || !group) return { groupId: null, created: false, error: "Failed to create group chat." }

  await admin.from("group_members").upsert(
    memberIds.map(uid => ({ group_id: group.id, user_id: uid, last_read_at: now })),
    { onConflict: "group_id,user_id" },
  )
  await admin.from("event_plans").update({ planning_group_id: group.id }).eq("id", eventPlanId).eq("ministry_id", ministryId)

  return { groupId: group.id as string, created: true }
}

// ── syncTeamChat ──────────────────────────────────────────────────────────────
// Team chats MIRROR team_members (roster is the source of truth). This reconciles
// a single team's linked chat:
//   • If no linked chat exists, one is created ONLY when the ministry's
//     `auto_team_chats` automation is ON (missing key = OFF — no surprise creation).
//   • If a linked chat exists (created here or via createTeamChatAction), its
//     membership is reconciled to EXACTLY match team_members: missing members are
//     added, members no longer on the roster are removed. Removing a member only
//     deletes their group_members row — their messages persist.
// Called on team create and after every team-roster mutation. Idempotent.
const TEAM_CHAT_TOGGLE = "auto_team_chats"

async function findLinkedTeamChat(
  admin: ReturnType<typeof createAdminClient>,
  ministryId: string,
  teamId: string,
): Promise<string | null> {
  const { data } = await admin
    .from("groups")
    .select("id")
    .eq("ministry_id", ministryId)
    .eq("linked_team_id", teamId)
    .order("created_at", { ascending: true })
    .limit(1)
  return data?.[0]?.id ?? null
}

export async function syncTeamChat(
  teamId: string,
  ministryId: string,
): Promise<{ groupId: string | null; created?: boolean; skipped?: boolean; error?: string }> {
  // Caller must be admin-tier or a member of this team, in this ministry.
  const authz = await requireTeamMemberOrAdmin(teamId)
  if (authz.error !== null) return { groupId: null, error: authz.error }
  if (authz.ministryId !== ministryId) return { groupId: null, error: "Not authorized." }

  const admin = createAdminClient()

  // Team must exist in this ministry (defense-in-depth beyond the authz check).
  const { data: team } = await admin
    .from("teams")
    .select("id, name")
    .eq("id", teamId)
    .eq("ministry_id", ministryId)
    .maybeSingle()
  if (!team) return { groupId: null, error: "Team not found." }

  let groupId = await findLinkedTeamChat(admin, ministryId, teamId)
  let created = false

  if (!groupId) {
    // No linked chat — create one only if the automation is enabled.
    const { data: ministry } = await admin
      .from("ministries")
      .select("automation_settings")
      .eq("id", ministryId)
      .single()
    const settings = ((ministry?.automation_settings ?? {}) as Record<string, boolean>)
    if (settings[TEAM_CHAT_TOGGLE] !== true) return { groupId: null, skipped: true }

    const { data: group, error: gErr } = await admin
      .from("groups")
      .insert({
        name: team.name,
        type: "church",
        category: "team",
        linked_team_id: teamId,
        ministry_id: ministryId,
        created_by: authz.userId,
      })
      .select("id")
      .single()
    if (gErr || !group) return { groupId: null, error: gErr?.message ?? "Failed to create team chat." }
    groupId = group.id
    created = true
  }

  // Reconcile group_members to exactly match team_members.
  const { data: teamMembers } = await admin
    .from("team_members")
    .select("user_id")
    .eq("team_id", teamId)
  const wanted = new Set((teamMembers ?? []).map((r: { user_id: string }) => r.user_id))

  const { data: chatMembers } = await admin
    .from("group_members")
    .select("user_id")
    .eq("group_id", groupId)
  const have = new Set((chatMembers ?? []).map((r: { user_id: string }) => r.user_id))

  const toAdd = [...wanted].filter((id) => !have.has(id))
  const toRemove = [...have].filter((id) => !wanted.has(id))

  const now = new Date().toISOString()
  if (toAdd.length > 0) {
    await admin.from("group_members").upsert(
      toAdd.map((uid) => ({ group_id: groupId, user_id: uid, last_read_at: now })),
      { onConflict: "group_id,user_id", ignoreDuplicates: true },
    )
  }
  if (toRemove.length > 0) {
    // group_members has no ministry_id column; the group is already ministry-scoped.
    await admin.from("group_members").delete().eq("group_id", groupId).in("user_id", toRemove)
  }

  return { groupId, created }
}

// ── backfillTeamChats ─────────────────────────────────────────────────────────
// Runs when the `auto_team_chats` automation is turned ON: creates + populates a
// linked chat for every team that doesn't already have one. Idempotent — teams
// with an existing linked chat are only re-synced, not duplicated.
export async function backfillTeamChats(ministryId: string): Promise<{ created: number; error?: string }> {
  // Admin-tier ministry configuration.
  const authz = await requireMinistryAdmin(ministryId)
  if (authz.error !== null) return { created: 0, error: authz.error }

  const admin = createAdminClient()
  const { data: teams } = await admin
    .from("teams")
    .select("id")
    .eq("ministry_id", ministryId)

  let created = 0
  for (const t of (teams ?? []) as { id: string }[]) {
    const res = await syncTeamChat(t.id, ministryId)
    if (res.created) created++
  }
  return { created }
}
