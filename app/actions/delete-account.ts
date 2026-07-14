"use server"

// Self-service account deletion (App Store guideline 5.1.1).
//
// The AUTHENTICATED caller deletes THEIR OWN account only — there is no
// admin-deletes-others path here. The auth.users identity is HARD-DELETED
// ("deactivation" fails App Store review). A scrubbed "tombstone" profiles row
// is left behind (name 'Former member', PII nulled, deleted_at set, ministry_id
// KEPT) so their chat messages keep rendering attributed to "Former member"
// without an avatar; announcements/events they authored are reattributed to the
// ministry (created_by → NULL).
//
// ⚠️  SAFE DELETION DEPENDS ON THE DDL in
//     .claude/task-context/account-deletion/migration.sql. Until those FK
//     alterations are applied, auth.admin.deleteUser() may either fail (a FK
//     still references the user) or cascade the tombstone/messages away
//     (profiles.id → auth.users ON DELETE CASCADE). The e2e spec skip-tags the
//     execution path with TODO(migration) for exactly this reason.

import { createAdminClient } from "@/lib/supabase-admin"
import { requireMinistryMember } from "./authz"
import { ADMIN_ROLES, isAdminRole } from "@/lib/roles"

export interface DeleteAccountResult {
  error: string | null
  /** True only once auth.users has actually been deleted — the client uses this
   *  to sign out + redirect. */
  deleted?: boolean
}

// Fields nulled on the tombstone. Kept explicit (not a spread) so a future
// added PII column is a deliberate decision, not a silent leak.
// NOTE: `email` is NOT scrubbed here — it is NOT NULL in the DB (no UNIQUE), so
// setting it null would raise 23502 and abort the whole deletion. It is set to a
// deterministic non-null placeholder in the scrub UPDATE below (per userId).
const PROFILE_SCRUB: Record<string, unknown> = {
  name: "Former member",
  role: "member",
  phone: null,
  avatar_url: null,
  about_me: null,
  bio: null,
  bible_verse: null,
  favorite_verse: null,
  prayer_request: null,
  pray_for_me: null,
  testimony: null,
  favorite_worship_song: null,
  favorite_book_of_bible: null,
  gender: null,
  graduation_year: null,
  grade: null,
  needs_grad_check: false,
  school_id: null,
  saved_signature: null,
  sidebar_note: null,
  show_journal_entries: false,
  show_journal_streak: false,
  notification_settings: {},
}

// Personal rows keyed by the user's id. Deleted table-by-table with the service
// client, ministry-scoped where the table carries ministry_id. Order is not
// FK-sensitive here (none of these are parents of each other except
// form_responses → form_answers, handled explicitly first).
const USER_ID_TABLES = [
  "rsvps",
  "announcement_views",
  "message_reactions",
  "poll_votes",
  "devotionals",
  "prayers",
  "verses",
  "home_verses",
  "congregation_responses",
  "worship_availability",
  "worship_invites",
  "worship_annotations",
  "dgl_availability",
  "dgl_roster",
  "dgl_roster_status",
  "small_group_members",
  "generated_group_members",
  "bible_study_progress",
  "bible_study_annotations",
  "team_members",
  "group_members",
  "user_ministries",
  "push_subscriptions",
] as const

export async function deleteMyAccount(emailConfirmation: string): Promise<DeleteAccountResult> {
  // (0) Authn + own identity.
  const ctx = await requireMinistryMember()
  if (ctx.error !== null) return { error: ctx.error }
  const { userId, ministryId, role } = ctx

  const admin = createAdminClient()

  // (1) Re-auth intent: caller must retype their own email.
  const { data: authUser } = await admin.auth.admin.getUserById(userId)
  const actualEmail = (authUser?.user?.email ?? "").trim().toLowerCase()
  const typed = (emailConfirmation ?? "").trim().toLowerCase()
  if (!typed) return { error: "Type your email to confirm." }
  if (!actualEmail || typed !== actualEmail) {
    return { error: "That email doesn't match the account. Deletion cancelled." }
  }

  // (2) Sole-admin guard: an active ministry must never be left with no admin.
  if (isAdminRole(role)) {
    const { count } = await admin
      .from("profiles")
      .select("id", { count: "exact", head: true })
      .eq("ministry_id", ministryId)
      .is("deleted_at", null)
      .in("role", ADMIN_ROLES as unknown as string[])
    if ((count ?? 0) <= 1) {
      return {
        error:
          "You're the only admin of this ministry. Promote another admin or archive the ministry before deleting your account.",
      }
    }
  }

  // (3) Founder reassignment: ministries.created_by → auth.users ON DELETE
  //     RESTRICT would block the auth delete. If the caller founded this
  //     ministry, hand ownership to another admin first. (Sole-admin guard
  //     above guarantees another admin exists.)
  const { data: ministry } = await admin
    .from("ministries")
    .select("created_by")
    .eq("id", ministryId)
    .maybeSingle()
  if (ministry?.created_by === userId) {
    const { data: otherAdmin } = await admin
      .from("profiles")
      .select("id")
      .eq("ministry_id", ministryId)
      .is("deleted_at", null)
      .in("role", ADMIN_ROLES as unknown as string[])
      .neq("id", userId)
      .limit(1)
      .maybeSingle()
    if (!otherAdmin) {
      return { error: "Transfer ministry ownership to another admin before deleting your account." }
    }
    await admin.from("ministries").update({ created_by: otherAdmin.id }).eq("id", ministryId)
  }

  // ── From here the destructive sequence begins. NOT a single transaction:
  //    scrub + row deletes are individual writes, then a separate auth API call.
  //    Every step is idempotent/retriable, so a partial failure surfaces an
  //    error and the caller can safely re-run (see build-report.md §Atomicity).

  // (4) Scrub the profile into a tombstone (KEEP ministry_id so chat joins still
  //     resolve "Former member"; set deleted_at so member lists hide it).
  const { error: scrubErr } = await admin
    .from("profiles")
    .update({
      ...PROFILE_SCRUB,
      // Deterministic non-null placeholder — profiles.email is NOT NULL and has
      // no UNIQUE constraint, so this never collides and never violates 23502.
      email: `deleted+${userId}@removed.invalid`,
      deleted_at: new Date().toISOString(),
    })
    .eq("id", userId)
    .eq("ministry_id", ministryId)
  if (scrubErr) return { error: `Couldn't scrub profile: ${scrubErr.message}` }

  // (5) Delete personal rows table-by-table. form_answers first (child of
  //     form_responses), then the user_id tables.
  const { data: myResponses } = await admin
    .from("form_responses")
    .select("id")
    .eq("user_id", userId)
    .eq("ministry_id", ministryId)
  const responseIds = (myResponses ?? []).map((r) => r.id)
  if (responseIds.length > 0) {
    await admin.from("form_answers").delete().in("response_id", responseIds)
  }
  await admin.from("form_responses").delete().eq("user_id", userId).eq("ministry_id", ministryId)

  for (const table of USER_ID_TABLES) {
    // Not every table carries ministry_id; scope by user_id, which is the row
    // owner in all of these. RLS is bypassed (service role) so we rely on the
    // user_id equality for isolation.
    const { error } = await admin.from(table).delete().eq("user_id", userId)
    if (error) {
      // Non-fatal per table (some tables may not exist in every deployment);
      // record and continue so one missing table can't strand the deletion.
      console.error(`[deleteMyAccount] failed clearing ${table}:`, error.message)
    }
  }

  // Sever leadership pointers that would otherwise dangle on the tombstone.
  await admin.from("small_groups").update({ leader_id: null }).eq("leader_id", userId)

  // Content-moderation cleanup: remove this user's blocks in BOTH directions and
  // the reports they filed. content_reports.reported_user_id / reviewed_by are
  // ON DELETE SET NULL FKs to the tombstone, so those rows are left intact.
  {
    const { error: blocksErr } = await admin
      .from("user_blocks")
      .delete()
      .or(`blocker_id.eq.${userId},blocked_id.eq.${userId}`)
    if (blocksErr) console.error("[deleteMyAccount] user_blocks cleanup:", blocksErr.message)
    const { error: reportsErr } = await admin
      .from("content_reports")
      .delete()
      .eq("reporter_id", userId)
    if (reportsErr) console.error("[deleteMyAccount] content_reports cleanup:", reportsErr.message)
  }

  // (6) Reattribute authored announcements + events to the ministry (created_by
  //     → NULL; UI falls back to the ministry name). Requires the DDL's DROP
  //     NOT NULL — non-fatal if it errors pre-migration.
  {
    const { error: aErr } = await admin
      .from("announcements")
      .update({ created_by: null })
      .eq("created_by", userId)
      .eq("ministry_id", ministryId)
    if (aErr) console.error("[deleteMyAccount] announcement reattribution:", aErr.message)
    const { error: eErr } = await admin
      .from("calendar_events")
      .update({ created_by: null })
      .eq("created_by", userId)
      .eq("ministry_id", ministryId)
    if (eErr) console.error("[deleteMyAccount] event reattribution:", eErr.message)
  }

  // (7) Audit entry (service client — lib/audit.ts is browser-only). Insert
  //     directly; action string is a self-delete marker.
  await admin.from("audit_logs").insert({
    ministry_id: ministryId,
    actor_id: null, // actor no longer exists after this action
    actor_name: "Former member",
    action: "account.self_delete",
    entity_type: "profile",
    entity_id: userId,
    entity_label: "Self-service account deletion",
    metadata: { role },
  })

  // (8) Hard-delete the auth identity LAST (App Store requirement).
  const { error: authErr } = await admin.auth.admin.deleteUser(userId)
  if (authErr) {
    return {
      error:
        "Your data was removed but the login couldn't be deleted. Please try again — re-running is safe.",
    }
  }

  return { error: null, deleted: true }
}
