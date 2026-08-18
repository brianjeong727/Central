// ─── Open group chats — the one data module ──────────────────────────────────
//
// A chat carries `groups.is_open` = "anyone in this ministry may join". That ONE
// flag drives every surface in this feature: the browse list, the invite card, the
// Home "find your people" card, and joinability itself. Openness is a property of
// the CHAT, not a kind of message — the invite card is a RENDERING of it.
//
// WHY EVERY READ GOES THROUGH AN RPC. `groups` SELECT requires membership, so a
// non-member can read neither a group's name nor its roster — and a `count()` under
// RLS counts only VISIBLE rows (0 for a non-member), so the member count forces a
// SECURITY DEFINER function no matter what. Given that, the name lives there too and
// NOTHING is widened. Do not "simplify" this into a `.from("groups")` query:
//   • widening `groups` SELECT with `OR is_open` makes that table a second answer to
//     "what rooms exist", and every column added to it later leaks to non-members;
//   • widening `group_members` SELECT exposes the member LIST — who-is-friends-with-
//     whom for the whole tenant. The count is fine; the list is not.
//
// `open_group_card` returns ZERO ROWS for anything that is not open. That is
// load-bearing: `messages.invite_group_id` is attacker-supplied (the messages INSERT
// policy checks only the DESTINATION group), so resolving a non-open group here —
// even just to put a name on a tombstone — would turn the invite card into a
// name-and-headcount oracle for every private chat in the ministry.

import { createClient } from "@/lib/supabase"

export interface OpenGroup {
  id: string
  name: string
  avatarUrl: string | null
  memberCount: number
  isMember: boolean
  lastMessageAt: string | null
}

/** SWR key for the ministry's browsable open groups. */
export function openGroupsKey(ministryId: string) {
  return ["open-groups", ministryId] as const
}

/** SWR key for a single invite card's target. */
export function openGroupCardKey(groupId: string) {
  return ["open-group-card", groupId] as const
}

type Row = {
  id: string
  name: string | null
  avatar_url: string | null
  member_count: number | null
  is_member: boolean | null
  last_message_at?: string | null
}

function mapRow(r: Row): OpenGroup {
  return {
    id: r.id,
    name: r.name ?? "Group chat",
    avatarUrl: r.avatar_url ?? null,
    memberCount: r.member_count ?? 0,
    isMember: r.is_member ?? false,
    lastMessageAt: r.last_message_at ?? null,
  }
}

/** Every open chat in the caller's ministry, most recently active first. */
export async function fetchOpenGroups(): Promise<OpenGroup[]> {
  const supabase = createClient()
  const { data, error } = await supabase.rpc("list_open_groups", { p_limit: 100 })
  if (error) throw error
  return ((data ?? []) as Row[]).map(mapRow)
}

/**
 * Resolve ONE group for an invite card. Returns null when the target is not open
 * (or was deleted, or belongs to another ministry) — the card then renders a
 * tombstone. Null is the SAFE answer and must never be worked around.
 */
export async function fetchOpenGroupCard(groupId: string): Promise<OpenGroup | null> {
  const supabase = createClient()
  const { data, error } = await supabase.rpc("open_group_card", { p_group_id: groupId })
  if (error) throw error
  const rows = (data ?? []) as Row[]
  return rows.length ? mapRow(rows[0]) : null
}

/**
 * Join an open chat.
 *
 * A plain browser insert under RLS is correct here — the policy permits a self-add
 * only when `group_is_open()` is true, which also covers archived rooms and rooms in
 * another ministry, so there is nothing left for a server action to check. Bans are
 * handled structurally (a ban nulls the profile's ministry_id).
 *
 * MUST be `.insert()`, never `.upsert({ onConflict })`: clients hold column-level
 * UPDATE grants on `group_members` only, so an upsert's conflict path raises
 * `42501 permission denied for table group_members`. A duplicate (23505) means the
 * user is already in the chat, which is success from the caller's point of view.
 */
export async function joinOpenGroup(groupId: string, userId: string): Promise<string | null> {
  const supabase = createClient()
  const { error } = await supabase.from("group_members").insert({ group_id: groupId, user_id: userId })
  if (!error) return null
  if (error.code === "23505") return null // already a member
  if (error.code === "42501") return "This chat isn't open to join anymore."
  return error.message || "Couldn't join that chat."
}

/** Leave a chat you joined from a browse/invite surface. */
export async function leaveOpenGroup(groupId: string, userId: string): Promise<string | null> {
  const supabase = createClient()
  const { error } = await supabase
    .from("group_members")
    .delete()
    .eq("group_id", groupId)
    .eq("user_id", userId)
  return error ? error.message || "Couldn't leave that chat." : null
}
