"use server"

import { createAdminClient } from "@/lib/supabase-admin"
import { getSemesterLabel } from "@/app/actions/dgl-utils"

// ── Constants ─────────────────────────────────────────────────────────────────

const GRADE_CHAT_NAMES: Record<string, string> = {
  freshman:    "Freshman Chat",
  sophomore:   "Sophomore Chat",
  junior:      "Junior Chat",
  senior:      "Senior Chat",
  young_adult: "Young Adult Chat",
}

const ALL_GRADE_CHATS = Object.values(GRADE_CHAT_NAMES)

// ── getMinistryAdminIds ───────────────────────────────────────────────────────
// Returns user IDs of all admins in a ministry.

async function getMinistryAdminIds(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  admin: any,
  ministryId: string,
): Promise<string[]> {
  const { data } = await admin
    .from("profiles")
    .select("id")
    .eq("ministry_id", ministryId)
    .eq("role", "admin")
  return (data ?? []).map((p: { id: string }) => p.id)
}

// ── ensureMinistryChats ───────────────────────────────────────────────────────
// Idempotent: creates the 6 standard church chats for a ministry if missing.
// Returns a name→id map for all standard chats.

export async function ensureMinistryChats(
  ministryId: string,
  ministryName: string,
  createdBy: string,
): Promise<Map<string, string>> {
  const admin = createAdminClient()
  const centralName = `${ministryName} Chat`
  const allNames = [...ALL_GRADE_CHATS, centralName]

  const { data: existing } = await admin
    .from("groups")
    .select("id, name")
    .eq("ministry_id", ministryId)
    .eq("type", "church")
    .in("name", allNames)

  const chatMap = new Map<string, string>(
    (existing ?? []).map((g: { id: string; name: string }) => [g.name, g.id])
  )

  const adminIds = await getMinistryAdminIds(admin, ministryId)

  for (const name of allNames) {
    if (!chatMap.has(name)) {
      const { data } = await admin
        .from("groups")
        .insert({ name, type: "church", ministry_id: ministryId, created_by: createdBy })
        .select("id, name")
        .single()
      if (data) {
        chatMap.set(data.name, data.id)
        if (adminIds.length > 0) {
          await admin.from("group_members").upsert(
            adminIds.map(uid => ({ group_id: data.id, user_id: uid })),
            { onConflict: "group_id,user_id", ignoreDuplicates: true }
          )
        }
      }
    }
  }

  // Ensure admins are in ALL standard chats (existing + new)
  if (adminIds.length > 0) {
    const allGroupIds = Array.from(chatMap.values())
    await admin.from("group_members").upsert(
      adminIds.flatMap(uid => allGroupIds.map(gid => ({ group_id: gid, user_id: uid }))),
      { onConflict: "group_id,user_id", ignoreDuplicates: true }
    )
  }

  return chatMap
}

// ── autoAddUserToChats ────────────────────────────────────────────────────────
// Adds a user to their ministry's central chat and (if grade is set) grade chat.
// Respects automation_settings flags.

export async function autoAddUserToChats(
  userId: string,
  ministryId: string,
  grade: string | null,
): Promise<void> {
  const admin = createAdminClient()

  const { data: ministry } = await admin
    .from("ministries")
    .select("name, automation_settings")
    .eq("id", ministryId)
    .single()

  if (!ministry) return

  const settings = (ministry.automation_settings ?? {}) as Record<string, boolean>
  const namesToJoin: string[] = []

  if (settings.auto_central_chat !== false) {
    namesToJoin.push(`${ministry.name} Chat`)
  }
  if (settings.auto_grade_chats !== false && grade && GRADE_CHAT_NAMES[grade]) {
    namesToJoin.push(GRADE_CHAT_NAMES[grade])
  }

  if (namesToJoin.length === 0) return

  const { data: groups } = await admin
    .from("groups")
    .select("id")
    .eq("ministry_id", ministryId)
    .eq("type", "church")
    .in("name", namesToJoin)

  if (!groups || groups.length === 0) return

  await admin
    .from("group_members")
    .upsert(
      groups.map((g: { id: string }) => ({ group_id: g.id, user_id: userId })),
      { onConflict: "group_id,user_id", ignoreDuplicates: true }
    )
}

// ── createPraiseTeamChatAction ────────────────────────────────────────────────
// Creates a "Praise Team · [Month Day]" church chat for a confirmed worship week.
// Deduplicates: skips if chat_group_id is already set on the week.

export async function createPraiseTeamChatAction(
  weekId: string,
  ministryId: string,
): Promise<{ groupId: string | null; skipped?: boolean; error?: string }> {
  const admin = createAdminClient()

  // Check automation setting
  const { data: ministry } = await admin
    .from("ministries")
    .select("automation_settings")
    .eq("id", ministryId)
    .single()

  const settings = ((ministry?.automation_settings ?? {}) as Record<string, boolean>)
  if (settings.auto_praise_chat === false) return { groupId: null, skipped: true }

  // Fetch the worship week
  const { data: week } = await admin
    .from("worship_weeks")
    .select("week_date, leader_id, chat_group_id")
    .eq("id", weekId)
    .single()

  if (!week) return { groupId: null, error: "Week not found." }
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
      .insert({ name: chatName, type: "church", ministry_id: ministryId, created_by: week.leader_id })
      .select("id")
      .single()
    if (groupErr || !group) return { groupId: null, error: "Failed to create praise team chat." }
    groupId = group.id
  }

  // Collect all member ids (roles + leader + admins), deduplicated
  const adminIds = await getMinistryAdminIds(admin, ministryId)
  const memberIds = Array.from(new Set([
    ...(roleRows ?? []).map((r: { user_id: string }) => r.user_id),
    ...(week.leader_id ? [week.leader_id] : []),
    ...adminIds,
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

  // Collect all relevant user ids (leaders + members + admins)
  const adminIds = await getMinistryAdminIds(admin, ministryId)
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
        .insert({ name: chatName, type: "church", ministry_id: ministryId, created_by: createdBy })
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
    const members = Array.from(new Set([sg.leader_id, ...(membersByGroup.get(sg.id) ?? []), ...adminIds]))
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
      ...adminIds,
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
  const admin = createAdminClient()

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
  const admin = createAdminClient()
  const semester = getSemesterLabel()

  // Fetch the small group to get chat_group_id
  const { data: sg, error: sgErr } = await admin
    .from("small_groups")
    .select("id, chat_group_id")
    .eq("id", params.smallGroupId)
    .single()

  if (sgErr || !sg) return { error: "Small group not found." }

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

  const admin = createAdminClient()
  const semester = getSemesterLabel()

  // Find a small group linked to this chat
  const { data: sg } = await admin
    .from("small_groups")
    .select("id")
    .eq("chat_group_id", params.chatGroupId)
    .maybeSingle()

  if (!sg) return { skipped: true }

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
  const admin = createAdminClient()
  const { error } = await admin
    .from("ministries")
    .update({ automation_settings: settings })
    .eq("id", ministryId)
  return { error: error?.message }
}
