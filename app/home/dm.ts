import type { createClient } from "@/lib/supabase"

/** The browser Supabase client, typed off the singleton factory. */
type BrowserClient = ReturnType<typeof createClient>

// ── Direct-message lookup ────────────────────────────────────────────────────
// The "do these two people already share a DM?" query, extracted because it was
// copy-pasted verbatim into the directory member detail and the member sheet —
// and chat search would have been a third copy.
//
// Two hops, not a join: fetch MY dm memberships, then ask whether the other user
// is in any of them. `groups!inner(type)` keeps the first hop to one round-trip,
// and both hops ride group_members' own RLS (you can only see memberships of
// groups you belong to), so this can never reveal a DM you are not part of.
//
// Returns the group id of the existing DM, or null when there isn't one — the
// caller decides what "none" means. Every caller now opens a DRAFT rather than
// creating a group, so browsing people never leaves empty conversations behind.
export async function findExistingDm(
  supabase: BrowserClient,
  currentUserId: string,
  otherUserId: string,
): Promise<string | null> {
  if (!currentUserId || !otherUserId || currentUserId === otherUserId) return null

  const { data: myGroups } = await supabase
    .from("group_members")
    .select("group_id, groups!inner(type)")
    .eq("user_id", currentUserId)

  const myDmGroupIds = (myGroups ?? [])
    .filter((m: { groups: { type: string } | { type: string }[] | null }) => {
      const g = Array.isArray(m.groups) ? m.groups[0] : m.groups
      return g?.type === "dm"
    })
    .map((m: { group_id: string }) => m.group_id)

  if (myDmGroupIds.length === 0) return null

  const { data: shared } = await supabase
    .from("group_members")
    .select("group_id")
    .eq("user_id", otherUserId)
    .in("group_id", myDmGroupIds)
    .limit(1)

  return shared && shared.length > 0 ? shared[0].group_id : null
}
