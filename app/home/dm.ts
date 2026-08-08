import type { createClient } from "@/lib/supabase"

/** The browser Supabase client, typed off the singleton factory. */
type BrowserClient = ReturnType<typeof createClient>

// ── Direct messages ──────────────────────────────────────────────────────────
// A DM is identified by its PAIR, not by whoever tapped "message" first. That
// identity lives in `groups.dm_key` (`least(uid,uid):greatest(uid,uid)`, unique
// per ministry — index `groups_dm_pair_uniq`), so a second DM between the same
// two people is a constraint violation rather than a race we hope not to lose.
//
// This replaced a two-hop membership query that was copy-pasted into three
// callers. It asked "which of MY dm groups is the other person also in?" — which
// silently answered "none" whenever their `group_members` row went missing, and
// the caller then made a NEW DM. Three threads accumulated between one pair that
// way. The key is derived, not looked up, so a missing membership row can no
// longer hide an existing conversation.

/** The pair key. MUST match get_or_create_dm's formula in Postgres. */
export function dmPairKey(a: string, b: string): string {
  return a < b ? `${a}:${b}` : `${b}:${a}`
}

// READ-ONLY existence check — used to decide "open the real thread" vs "open a
// draft". One hop, and it rides groups' own RLS (SELECT is gated on membership
// or authorship), so it can never reveal a DM you are not part of.
//
// Returns the group id, or null when the pair has no thread yet. Callers open a
// DRAFT on null rather than creating a group, so browsing people never leaves
// empty conversations behind — the group is born on the first send, via
// getOrCreateDm below.
export async function findExistingDm(
  supabase: BrowserClient,
  currentUserId: string,
  otherUserId: string,
): Promise<string | null> {
  if (!currentUserId || !otherUserId || currentUserId === otherUserId) return null

  const { data } = await supabase
    .from("groups")
    .select("id")
    .eq("type", "dm")
    .eq("dm_key", dmPairKey(currentUserId, otherUserId))
    .limit(1)
    .maybeSingle()

  return data?.id ?? null
}

// The ONE way a DM comes into existence. SECURITY DEFINER RPC: it re-derives the
// caller from auth.uid() and the ministry from the caller's own profile (nothing
// is trusted from here), refuses a self-DM or a cross-ministry target, and is
// idempotent — calling it twice returns the same thread.
//
// It also RE-ASSERTS both memberships on every call, so a DM whose participant
// row was lost repairs itself the next time someone opens it.
export async function getOrCreateDm(
  supabase: BrowserClient,
  otherUserId: string,
): Promise<{ groupId: string | null; error: string | null }> {
  const { data, error } = await supabase.rpc("get_or_create_dm", {
    p_other_user_id: otherUserId,
  })
  if (error) return { groupId: null, error: error.message }
  return { groupId: (data as string | null) ?? null, error: null }
}
