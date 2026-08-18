// The ONE sanctioned acknowledgment write.
//
// `announcement_acknowledgements` is INSERT-ONLY by design — you cannot un-see
// something, so the table has no UPDATE and no DELETE policy (and no UPDATE /
// DELETE grant). That makes the repo's usual `.upsert(row, { onConflict })`
// shape a hard failure on the SECOND write: supabase-js compiles it to
// `ON CONFLICT ... DO UPDATE`, which requires an UPDATE policy, so a double-tap
// (or "RSVP after already tapping Got it", or an offline replay) returns
// `42501 ... (USING expression)` on a row that is already correct. Proven live
// on `rsvps`, which has the same insert-only policy shape.
//
// So: `ignoreDuplicates: true` → `ON CONFLICT DO NOTHING`, which needs INSERT
// only — and an EMPTY result is SUCCESS, not a failed write (that is what a
// duplicate returns). Do NOT "fix" this by adding an UPDATE policy; that would
// give away insert-only, which is the whole semantic.
//
// There is deliberately no `unacknowledgeAnnouncement`. Un-RSVPing must not
// remove an acknowledgment either — the DB enforces that (no DELETE policy), and
// the UI must never offer it.

import type { SupabaseClient } from "@supabase/supabase-js"

export async function acknowledgeAnnouncement(
  supabase: SupabaseClient,
  announcementId: string,
  userId: string,
): Promise<{ error: string | null }> {
  const { error } = await supabase
    .from("announcement_acknowledgements")
    .upsert(
      { announcement_id: announcementId, user_id: userId },
      { onConflict: "announcement_id,user_id", ignoreDuplicates: true },
    )
  return { error: error ? error.message : null }
}
