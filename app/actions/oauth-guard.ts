"use server"

// Native OAuth session verification — the WKWebView counterpart of the
// /auth/callback mint guard. The native Sign in with Apple path
// (lib/native-auth.ts) establishes the session client-side via
// signInWithIdToken, which never passes through the callback route — so the
// client calls this action immediately after to run the SAME policy
// (lib/oauth-account-guard.ts): flow=signup stamps the central_signup marker,
// flow=signin tears down fresh unknown mints and kills the session.

import { createClient } from "@/lib/supabase-server"
import { createAdminClient } from "@/lib/supabase-admin"
import { enforceOAuthAccountPolicy } from "@/lib/oauth-account-guard"
import { reconcileProfileName } from "@/lib/profile-name"

export async function verifyNativeOAuthSession(
  flow: "signin" | "signup"
): Promise<{ ok: boolean; reason?: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  // `reason` is temporary diagnostic surfaced to the native sign-in UI: it
  // distinguishes a session the server never saw (cookie/propagation problem)
  // from a session the mint-guard deliberately tore down (unknown signin).
  if (!user) return { ok: false, reason: "no-server-session" }

  const admin = createAdminClient()
  const { allowed } = await enforceOAuthAccountPolicy(admin, user, flow)
  if (!allowed) {
    // Kill the server-side (cookie) session for the torn-down user; the client
    // also signs out locally on rejection.
    await supabase.auth.signOut()
    return { ok: false, reason: "guard-rejected" }
  }

  // Same name repair the web callback runs (lib/profile-name.ts). The native
  // Apple sheet stamps the name it got into user_metadata just before calling
  // this action, so by here the metadata is the best we will ever have.
  await reconcileProfileName(admin, user)

  return { ok: true }
}
