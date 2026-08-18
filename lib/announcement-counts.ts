// Public aggregate counts for announcement child rows — acknowledgments, views,
// RSVPs — read through SECURITY DEFINER batch functions instead of by selecting
// the rows.
//
// WHY these exist (the privacy fix, ratified 2026-08-19): `announcement_views`
// and `rsvps` were ministry-wide readable by every member, so anyone could diff
// them against the Directory and produce "who ignored this announcement" — the
// exact dataset the acknowledgment spec forbids, and (since an RSVP writes an
// acknowledgment) a bypass of the ack table's own-row-only SELECT. Their SELECT
// policies are now scoped (own row / show_attendees / leader), which means a
// member counting ROWS would see 0-or-1. The COUNT is still public — it is what
// makes the norm legible — so it comes from a definer function that re-applies
// `auth_ministry_id()` per row and returns nothing for another tenant.
//
// Always BATCH (`uuid[]`): the feed renders per-announcement metadata for a whole
// page, and one RPC per card is an N+1 on the main tab. A single id is just a
// one-element array.

import type { SupabaseClient } from "@supabase/supabase-js"

// The functions return (announcement_id, cnt). The column is `cnt`, not
// `count`: an OUT parameter named `count` shadows the aggregate inside a
// SQL-language body.
type CountRow = { announcement_id: string; cnt: number }

async function counts(
  supabase: SupabaseClient,
  fn: string,
  ids: string[],
): Promise<Record<string, number>> {
  if (ids.length === 0) return {}
  const { data } = await supabase.rpc(fn, { p_ids: ids })
  const map: Record<string, number> = {}
  for (const row of (data ?? []) as CountRow[]) map[row.announcement_id] = row.cnt ?? 0
  return map
}

/** How many people have acknowledged each announcement. Public by ratified decision. */
export function fetchAckCounts(supabase: SupabaseClient, ids: string[]) {
  return counts(supabase, "announcement_ack_counts", ids)
}

/** Passive open-tracking count (analytics, not a signal). */
export function fetchViewCounts(supabase: SupabaseClient, ids: string[]) {
  return counts(supabase, "announcement_view_counts", ids)
}

/** "N going" — the count only; attendee IDENTITY still rides the rsvps SELECT policy. */
export function fetchRsvpCounts(supabase: SupabaseClient, ids: string[]) {
  return counts(supabase, "announcement_rsvp_counts", ids)
}
