// ─── OAuth account-mint guard (server-only) ──────────────────────────────────
// Shared by app/auth/callback/route.ts (web OAuth PKCE flow) and
// app/actions/oauth-guard.ts (native Sign in with Apple via signInWithIdToken).
//
// "Sign in" must NEVER create an account. Both OAuth entry paths mint a
// brand-new Supabase user for an unknown identity; only our own signup entry
// points ever declare flow=signup, and minting there is legitimate
// registration. A LEGITIMATE returning user has at least one durable proof of
// a real prior account: the central_signup marker, a profiles row with a
// ministry, any user_ministries membership, or an account older than 24h
// (which grandfathers every pre-marker account). Anything else is a fresh
// unknown mint and gets torn down. Marker-based, not a 60s age heuristic — a
// retry after 60s used to sail straight through.
//
// NOTE this guard is a UX/hygiene gate, not a security boundary: with a public
// anon key anyone can mint a bare auth user directly (signUp,
// signInWithIdToken). RLS keeps such accounts out of all tenant data; the
// guard's job is that OUR sign-in buttons never strand a user in a minted
// half-account.

import type { SupabaseClient, User } from "@supabase/supabase-js"

/**
 * Enforce the mint policy for an authenticated OAuth user.
 * - flow === "signup": stamp the durable central_signup marker (idempotent).
 * - anything else (including a missing flow) runs signin-strict: unknown fresh
 *   mints are deleted (auth user + orphan profile) and `allowed: false` is
 *   returned — the caller must sign the session out and reject.
 */
export async function enforceOAuthAccountPolicy(
  admin: SupabaseClient,
  user: User,
  flow: string | null
): Promise<{ allowed: boolean }> {
  if (flow === "signup") {
    // OAuth signups can't set metadata pre-mint, so stamp server-side here.
    // Email signups already carry the marker via signUp options.data.
    const existingMeta = user.user_metadata ?? {}
    if (existingMeta.central_signup !== true) {
      const { error: stampErr } = await admin.auth.admin.updateUserById(user.id, {
        user_metadata: { ...existingMeta, central_signup: true },
      })
      if (stampErr) console.error("[oauth-guard] failed to stamp central_signup marker for", user.id, stampErr)
    }
    return { allowed: true }
  }

  const hasMarker = user.user_metadata?.central_signup === true
  const olderThan24h = new Date(user.created_at).getTime() < Date.now() - 24 * 60 * 60 * 1000
  let legitimate = hasMarker || olderThan24h

  if (!legitimate) {
    const { data: um } = await admin
      .from("user_ministries").select("user_id").eq("user_id", user.id).limit(1)
    if (um && um.length > 0) legitimate = true
  }
  if (!legitimate) {
    const { data: prof } = await admin
      .from("profiles").select("ministry_id").eq("id", user.id).maybeSingle()
    if (prof?.ministry_id) legitimate = true
  }

  if (legitimate) return { allowed: true }

  console.warn("[oauth-guard] signin for unknown account → deleting & rejecting:", user.email)
  const { error: delErr } = await admin.auth.admin.deleteUser(user.id)
  if (delErr) {
    // Delete FAILED — the auth user persists (this is exactly how the prior
    // incident admitted an orphan: an unchecked failure). Log loudly.
    console.error("[oauth-guard] CRITICAL: deleteUser failed for minted user", user.id, user.email, delErr)
  }
  // The profiles→auth.users FK was dropped 2026-07-12, so deleteUser no longer
  // cascades the auto-created profile (handle_new_user trigger fires on every
  // mint). Delete it directly on every rejection — otherwise an orphan profile
  // is left behind whether or not the auth delete succeeded.
  const { error: profDelErr } = await admin.from("profiles").delete().eq("id", user.id)
  if (profDelErr) console.error("[oauth-guard] failed to delete orphan profile for", user.id, profDelErr)

  return { allowed: false }
}
