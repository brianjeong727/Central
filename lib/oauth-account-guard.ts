// ─── OAuth account-mint guard (server-only) ──────────────────────────────────
// Shared by app/auth/callback/route.ts (web OAuth PKCE flow) and
// app/actions/oauth-guard.ts (native Sign in with Apple via signInWithIdToken).
//
// "Sign in" must NEVER create an account. Both OAuth entry paths mint a
// brand-new Supabase user for an unknown identity, so a SIGN-IN that mints one
// has to undo it. A LEGITIMATE returning user has at least one durable proof of
// a real prior account: the central_signup marker, a profiles row with a
// ministry, any user_ministries membership, or an account older than 24h
// (which grandfathers every pre-marker account). A sign-in with none of those
// is a fresh unknown mint and gets torn down. Marker-based, not a 60s age
// heuristic — a retry after 60s used to sail straight through.
//
// The teardown fires ONLY on an explicit flow=signin. Every other value —
// signup, stranded, or a flow we simply lost — takes the permissive branch; see
// the function doc for why that asymmetry is the whole point and what it cost
// when it ran the other way.
//
// NOTE this guard is a UX/hygiene gate, not a security boundary: with a public
// anon key anyone can mint a bare auth user directly (signUp,
// signInWithIdToken). RLS keeps such accounts out of all tenant data; the
// guard's job is that OUR sign-in buttons never strand a user in a minted
// half-account.

import type { SupabaseClient, User } from "@supabase/supabase-js"

/**
 * Enforce the mint policy for an authenticated OAuth user.
 * - flow === "signin": signin-strict. An unknown fresh mint is deleted (auth
 *   user + orphan profile) and `allowed: false` is returned — the caller must
 *   sign the session out and reject.
 * - anything ELSE — "signup", "stranded", or a MISSING flow — stamps the durable
 *   central_signup marker (idempotent) and allows.
 *
 * ONLY AN EXPLICIT SIGN-IN MAY TEAR AN ACCOUNT DOWN. A missing flow used to run
 * signin-strict as well, on the reasoning that a code-bearing callback with no
 * params must not get the lenient path. That inverted the cost of OUR OWN
 * misconfiguration onto the user, and it did so at launch: Supabase silently
 * substitutes the bare Site URL for any redirect_to its allowlist does not
 * recognise, the allowlist held the apex while the site 307s every visitor to
 * www, so EVERY web OAuth came back to `/?code=…` with the flow marker gone.
 * proxy.ts labelled that stray code a sign-in and this function then DELETED the
 * account the person had just finished creating — on every retry, forever. It
 * was reported as "I'm trying to create an account with Google but it just
 * brings me back to the create an account page"; the loop was us.
 *
 * Absence of the marker is our bug, never a statement by the user. Only an
 * explicit sign-in actually asserts "I already have an account", so only an
 * explicit sign-in earns the destructive branch. The asymmetry is not close: an
 * extra admitted mint costs nothing (see the boundary note above — with the
 * public anon key anyone can mint a bare auth user directly, and RLS, not this,
 * is what keeps such an account out of every tenant table), while a wrong
 * teardown destroys a real person's provider identity permanently — the delete
 * unlinks Google, so that address can never "Sign in with Google" again even
 * after they re-register by email.
 */
export async function enforceOAuthAccountPolicy(
  admin: SupabaseClient,
  user: User,
  flow: string | null
): Promise<{ allowed: boolean }> {
  if (flow !== "signin") {
    // OAuth signups can't set metadata pre-mint, so stamp server-side here.
    // Email signups already carry the marker via signUp options.data.
    // NOTE this writes the marker to the DB but deliberately does NOT assign it
    // back onto the in-memory `user` — any caller that reads user.user_metadata
    // after this function still sees PRE-stamp metadata and must re-read before
    // relying on it. (Harmless for the marker itself: GoTrue merges top-level
    // user_metadata keys, so a later write that omits central_signup does not
    // drop it — verified by live probe 2026-08-18.)
    // The stamp is RETRIED once before giving up, and a failure still allows. Allowing
    // is right — a metadata write must not cost someone their signup — but an admitted
    // account that went UNMARKED is exactly the input the strict branch tears down: a
    // later explicit sign-in inside 24h, before they have joined a ministry, finds no
    // marker, no membership and no ministry_id, and deletes them. That is the failure
    // this whole file now exists to prevent, surviving in one corner. The corner also
    // grew: stranded and missing-flow mints route through here too, so a best-effort
    // write that used to carry only deliberate signups now carries nearly every one.
    const existingMeta = user.user_metadata ?? {}
    if (existingMeta.central_signup !== true) {
      const stamp = () => admin.auth.admin.updateUserById(user.id, {
        user_metadata: { ...existingMeta, central_signup: true },
      })
      let { error: stampErr } = await stamp()
      if (stampErr) {
        console.warn("[oauth-guard] central_signup stamp failed, retrying once for", user.id, stampErr)
        ;({ error: stampErr } = await stamp())
      }
      // Loud, because an unmarked account is a future wrongful teardown.
      if (stampErr) console.error("[oauth-guard] CRITICAL: central_signup stamp failed twice — account admitted UNMARKED and is deletable by a signin within 24h:", user.id, stampErr)
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
