import type { SupabaseClient } from "@supabase/supabase-js"

// ── The ONE local-JWT-verify path (ROUTING ONLY) ─────────────────────────────
// `getUser()` is an HTTP call to GoTrue. `getClaims()` verifies the ES256 access token
// against the JWKS with no network round trip once the key set is cached. Instrumented
// on a local production build, /home's page auth went from 250-330ms to 3-10ms.
//
// This module exists so proxy.ts (every request) and app/home/page.tsx (every /home
// render) share ONE implementation — otherwise the skew constant and the claim-shape
// assumption live in two places, which is the drift that produces an auth inconsistency
// nobody notices until it matters.
//
// ⚠️ WHERE THIS MUST NOT BE USED. `resolveUser` is for ROUTING that reads only id/email
// and grants nothing. Anything that authorises a WRITE, uses the service-role client, or
// judges whether a session is LEGITIMATE keeps `getUser()`:
//   • app/actions/oauth-guard.ts — the hardest no. It needs the full `User`, and
//     "the token verifies" is precisely not the question it is asking.
//   • app/actions/ministry.ts (the founder-email gates) — these are the REAL admin
//     gates; /admin/page.tsx has no server gate of its own, so never perf-swap them.
// What this trades away is staleness/revocation of up to the token lifetime — acceptable
// for deciding which page to render, not for deciding what may be written.

/**
 * How near expiry a token may be before this path declines it.
 *
 * Kept because it makes the intent explicit, NOT because it is load-bearing: auth-js
 * refreshes inside getClaims()→getSession() at its own EXPIRY_MARGIN_MS (90s), which is
 * WIDER than this, so in practice the near-expiry branch below is unreachable and the
 * refresh has already happened by the time we compare. Do not infer from this constant
 * that the getUser fallback is what refreshes the session — it is not.
 */
export const EXP_SKEW_SECONDS = 60

export type ClaimsUser = { id: string; email?: string | null }

/**
 * Resolve the caller: verified JWT claims when the token is comfortably valid, otherwise
 * the getUser() path. Returns null when there is no session.
 *
 * Only `sub` and `email` are taken from the claims. `email` is the GoTrue-issued
 * top-level claim — NOT the user-writable `user_metadata.email` — and is signature-checked
 * before it is returned. Any caller needing more than an id and an email must fetch it
 * rather than widen this.
 */
export async function resolveUser(supabase: SupabaseClient): Promise<ClaimsUser | null> {
  try {
    const { data: claimsData, error } = await supabase.auth.getClaims()

    // Two failure shapes, and they are NOT interchangeable. An expired or malformed
    // token THROWS (caught below) and is unremarkable — it happens constantly and the
    // fallback handles it. But an INVALID SIGNATURE or a failed JWKS fetch is RETURNED
    // in `error`, and both deserve to be seen: the first is an attack signal, the second
    // means local verification has silently degraded into a network call for everyone.
    // Falling through is still the right behaviour; discarding the reason is not.
    if (error) {
      console.error("[auth-claims] getClaims returned an error:", error.message)
    }

    const claims = claimsData?.claims as { sub?: string; email?: string; exp?: number } | undefined
    const nowSec = Math.floor(Date.now() / 1000)
    if (claims?.sub && typeof claims.exp === "number" && claims.exp - nowSec > EXP_SKEW_SECONDS) {
      return { id: claims.sub, email: claims.email ?? null }
    }
  } catch {
    // Expired / malformed token — the ordinary case. Fall through.
  }
  const {
    data: { user },
  } = await supabase.auth.getUser()
  return user ? { id: user.id, email: user.email } : null
}
