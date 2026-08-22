// ─── Admitting a person to a ministry — the ONE write ────────────────────────
//
// NOT a "use server" file, on purpose, and for the same reason as
// app/actions/authz.ts: an exported async function in a "use server" module is a
// callable endpoint. This one takes a userId as an argument, so exporting it as an
// action would let anyone admit anyone. It is imported BY actions and only ever
// runs after the caller's own gate has passed.
//
// WHY IT EXISTS: there are now two ways into a ministry — typing a code that grants
// membership immediately (a generated, still-secret code), and an admin approving a
// request (a custom, guessable code; see lib/invite-code.ts). Those two must produce
// the SAME member. A second copy of this sequence is how one path ends up skipping
// the class-chat assignment or writing a stale role.
//
// THE TRAP THIS FIXES: the original write read the young-adult cohort off
// `user.user_metadata` of whoever called the action. That is correct when the person
// joining IS the caller, and silently wrong on approval, where the caller is the
// ADMIN — the requester would have been admitted with the approver's cohort. The
// user id is an explicit parameter here and the metadata is fetched FOR THAT USER,
// so the mistake is not available to make.

import type { SupabaseClient } from "@supabase/supabase-js"
import { YOUNG_ADULT } from "@/lib/cohort"

/**
 * The young-adult cohort, resolved into the two DIFFERENT answers the join needs.
 *
 * `write` is what to persist (null = leave the column alone); `effective` is what the
 * person actually IS. They differ in the common case — handle_new_user already copies
 * `grade` from signup metadata, so a young adult arrives with the column ALREADY set,
 * `write` is correctly null… and passing that null on as the cohort gave the chat
 * assignment nothing to work with. Result: a young adult joined, got the central chat,
 * and was silently left out of Young Adults. Returning one value made that mistake
 * easy; returning both makes it hard.
 *
 * Only ever produces the young_adult sentinel; arbitrary metadata is never written
 * through to the column.
 */
export function resolveSignupGrade(
  currentGrade: string | null | undefined,
  metadata: Record<string, unknown> | undefined,
): { write: string | null; effective: string | null } {
  if (currentGrade) return { write: null, effective: currentGrade }
  const fromMeta = metadata?.grade === YOUNG_ADULT ? YOUNG_ADULT : null
  return { write: fromMeta, effective: fromMeta }
}

export type AdmitResult = { error: string | null; role: string | null }

/**
 * Put `userId` into `ministryId` and return the role they landed on.
 *
 * `role` is resolved, never inherited: a member-code join must not carry a previous
 * ministry's admin role into the new one (stale-role escalation), so an explicit
 * `forcedRole` (the staff-code path, already validated against the allowlist by the
 * caller) wins, otherwise a RETURNING member's `user_ministries` row is restored, and
 * otherwise it is "member".
 *
 * The caller owns authorization and every product guard — status, bans, already-a-
 * member — because those differ between the two paths and their error COPY is
 * user-facing. This function owns only the write.
 */
export async function admitUserToMinistry(
  admin: SupabaseClient,
  userId: string,
  ministryId: string,
  opts: { forcedRole?: string | null; addToChats: (grade: string | null, role: string, gradYear: number | null) => Promise<void> },
): Promise<AdmitResult> {
  const { data: profile } = await admin
    .from("profiles")
    .select("ministry_id, role, graduation_year, grade")
    .eq("id", userId)
    .maybeSingle()

  if (!profile) {
    return { error: "Profile not found. Please sign out and sign back in, then try again.", role: null }
  }

  let role: string
  if (opts.forcedRole) {
    role = opts.forcedRole.toLowerCase()
  } else {
    const { data: existingUm } = await admin
      .from("user_ministries")
      .select("role")
      .eq("user_id", userId)
      .eq("ministry_id", ministryId)
      .maybeSingle()
    role = existingUm ? (existingUm.role ?? "member") : "member"
  }

  // The metadata of the USER BEING ADMITTED — see the trap note at the top. On the
  // approval path the caller is the admin, so reading the caller's would assign the
  // approver's cohort to the person being approved.
  const { data: authUser } = await admin.auth.admin.getUserById(userId)
  const signupGrade = resolveSignupGrade(profile.grade, authUser?.user?.user_metadata)

  const { data: updatedRows, error: updateErr } = await admin
    .from("profiles")
    .update({ ministry_id: ministryId, role, ...(signupGrade.write ? { grade: signupGrade.write } : {}) })
    .eq("id", userId)
    .select("id")

  if (updateErr) return { error: updateErr.message, role: null }
  if (!updatedRows || updatedRows.length === 0) {
    return { error: "Profile not found. Please sign out and sign back in, then try again.", role: null }
  }

  await admin.from("user_ministries").upsert(
    { user_id: userId, ministry_id: ministryId, role },
    { onConflict: "user_id,ministry_id" },
  )

  // Chat assignment is injected rather than imported: app/actions/auto-chats.ts is a
  // "use server" module, and importing an action into a lib that a client component
  // might transitively reach is how a service-role path ends up in a browser bundle.
  await opts.addToChats(signupGrade.effective, role, profile.graduation_year ?? null)

  return { error: null, role }
}
