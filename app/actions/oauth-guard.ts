"use server"

// Native OAuth session verification — the WKWebView counterpart of the
// /auth/callback mint guard. The native Sign in with Apple path
// (lib/native-auth.ts) establishes the session client-side via
// signInWithIdToken, which never passes through the callback route — so the
// client calls this action immediately after to run the SAME policy
// (lib/oauth-account-guard.ts): flow=signup stamps the central_signup marker,
// flow=signin tears down fresh unknown mints and kills the session.
//
// It ALSO returns the post-sign-in DESTINATION. The client used to answer that
// question itself with 2-3 more phone->Supabase round trips (auth.getUser() +
// user_ministries + sometimes profiles) — each ~0.6s median / ~1.8s p90 from a
// phone — to compute something this request already had everything to answer.
// The same queries from Vercel are ~10x cheaper and run in parallel with the
// name repair, so the whole routing decision now costs the phone nothing.
//
// EVERY ARGUMENT TO THIS ACTION IS UNTRUSTED. Server Action arguments are
// entirely caller-controlled — anyone can invoke this from the console on any
// same-origin page with any `flow`, `intent` or `appleName` they like. They are
// request DATA, never a statement about who the caller is. The only trusted
// identity in this file is the `user` from supabase.auth.getUser() below, and it
// is the only thing that may ever name a row to read or write. (Same doctrine as
// the `central-mw` note in proxy.ts.)

import type { SupabaseClient, User } from "@supabase/supabase-js"
import { createClient } from "@/lib/supabase-server"
import { createAdminClient } from "@/lib/supabase-admin"
import { enforceOAuthAccountPolicy } from "@/lib/oauth-account-guard"
import { reconcileProfileName } from "@/lib/profile-name"

// NOT exported — a "use server" module may only export async functions
// (CLAUDE.md Workflow #6), so the shape is declared locally and structurally
// re-stated by the caller in lib/native-auth.ts.
type NativeOAuthVerification = {
  ok: boolean
  reason?: string
  destination?: string
}

// The safe native landing for a user with nowhere else to be. Also the fallback
// when a ROUTING read fails — a routing query must never be able to fail a
// verification the guard already approved (proxy.ts encodes the same rule for
// the same class of read: "a query ERROR must NEVER route a valid user away").
const NATIVE_FALLBACK = "/ministries"

// profiles.name is displayed ministry-wide. This is a UX guardrail, not a
// boundary — with the public anon key a user can already write their own
// user_metadata.name directly (which is exactly what the phone used to do).
const MAX_OAUTH_NAME_LEN = 80

// Trim, strip control characters and newlines, collapse runs of whitespace, cap
// length. Filtered by CODE POINT rather than a regex range so the source carries
// no control characters of its own and it needs no target-gated regex feature.
//
// Deliberately NO language filtering here: profanity policy belongs in
// reconcileProfileName (lib/profile-name.ts), the declared SINGLE writer of
// profiles.name on every OAuth path, because Google's name flows through that
// same writer and filtering only the Apple branch would fork the rule across two
// places while leaving the commoner path wide open.
function sanitizeDisplayName(raw: string | null | undefined): string | null {
  // Server Action arguments arrive as JSON — the TS type above is NOT enforced
  // at runtime, so a caller can send a number or an object. Checked explicitly
  // rather than relying on the throw that would otherwise fail closed.
  if (typeof raw !== "string" || !raw) return null
  let stripped = ""
  for (const ch of raw) {
    const code = ch.codePointAt(0) ?? 0
    // C0 controls (includes CR/LF/tab) and DEL become a space, which the
    // whitespace collapse below then folds away.
    stripped += code < 0x20 || code === 0x7f ? " " : ch
  }
  // Cap by CODE POINT, not UTF-16 unit: a plain slice can split a surrogate pair
  // and leave a lone surrogate, which jsonb then rejects.
  const capped = Array.from(stripped.replace(/\s+/g, " ").trim())
    .slice(0, MAX_OAUTH_NAME_LEN)
    .join("")
  const cleaned = capped.trim()
  return cleaned || null
}

// Where a verified native sign-in lands. Mirrors app/auth/callback/route.ts's
// decision for the web flow, with the ONE deliberate native divergence noted at
// the fallback: the shell never shows marketing surfaces.
//
// `intent` is untrusted input and is only ever COMPARED against two literals —
// it never reaches a path constructor, a template, or the return value. Every
// value this can return is one of a closed set of hardcoded literals, so there
// is no open redirect to have. (The client validates the result anyway; see
// routeAfterNativeSignIn.)
//
// Uses the ADMIN client, not the RLS-bound one, and that is load-bearing rather
// than incidental: `ministries` SELECT is scoped to the caller's own ministry,
// so under RLS the `ministries!inner(status)` INNER embed silently DROPS every
// membership whose ministry row is invisible. The client-side version this
// replaced therefore UNDER-COUNTED a multi-ministry user and sent them to /home
// instead of /pick-ministry. Admin here removes an under-count; it widens
// nothing. Both filters are keyed to the server-derived user.id, the result is a
// routing enum rather than data, and every value is re-gated by proxy.ts on the
// navigation that follows. Same shape as app/auth/callback/route.ts and
// getUserMinistries, which is what /pick-ministry itself renders from.
//
// Not exported — a "use server" module may only export async functions.
async function nativeDestination(
  admin: SupabaseClient,
  user: User,
  intent: string | null | undefined
): Promise<string> {
  if (intent === "register") return "/onboarding"
  // The native/login client has always sent intent=join to plain /ministries
  // (the web callback opens the code tab instead) — kept byte-identical here so
  // moving the decision server-side changes no destination.
  if (intent === "join") return NATIVE_FALLBACK

  // Only ACTIVE ministries count toward the picker — a pending registration
  // application is in user_ministries but isn't openable (mirrors getUserMinistries).
  const { data: memberships, error: umErr } = await admin
    .from("user_ministries")
    .select("ministry_id, ministries!inner(status)")
    .eq("user_id", user.id)
    .eq("ministries.status", "active")

  if (umErr) console.warn("[oauth-guard] user_ministries query error:", umErr.message)

  const uniqueMinistries = [...new Set((memberships ?? []).map((m) => m.ministry_id))]
  if (uniqueMinistries.length > 1) return "/pick-ministry"
  if (uniqueMinistries.length === 1) return "/home"

  // user_ministries empty or missing — fall back to profiles
  const { data: profile, error: profileErr } = await admin
    .from("profiles")
    .select("ministry_id")
    .eq("id", user.id)
    .maybeSingle()

  if (profileErr) console.warn("[oauth-guard] profiles query error:", profileErr.message)
  if (profile?.ministry_id) return "/home"

  // No ministry yet — the join flow, not the marketing landing (the shell
  // never shows marketing surfaces). This is the ONE place the native
  // destination deliberately differs from the web callback's /landing.
  return NATIVE_FALLBACK
}

export async function verifyNativeOAuthSession(
  flow: "signin" | "signup",
  opts?: { intent?: string | null; appleName?: string | null }
): Promise<NativeOAuthVerification> {
  // Brian sees this take 10-20s on a real device against production and it does
  // not reproduce locally, so the action reports its own phase timings on every
  // exit — permanently, one greppable line, Date.now() deltas only. Durations,
  // outcome and the normalized flow ONLY: never the email, the name, or the user
  // id. `flow` is normalized rather than interpolated raw because it is untrusted
  // caller input (a newline in it would forge a log line).
  const t0 = Date.now()
  const flowLabel = flow === "signup" ? "signup" : "signin"
  let msGetUser = 0
  let msStamp = -1
  let msGuard = 0
  let msPost = 0
  const logTiming = (outcome: string) => {
    console.log(
      `[oauth-guard] timing flow=${flowLabel} outcome=${outcome} getUser=${msGetUser}ms` +
        (msStamp >= 0 ? ` stamp=${msStamp}ms` : "") +
        ` guard=${msGuard}ms post=${msPost}ms total=${Date.now() - t0}ms`
    )
  }

  const supabase = await createClient()
  // MUST stay auth.getUser(). resolveUser()/getClaims() is ROUTING-ONLY and
  // grants nothing (see lib/auth-claims.ts) — this gate needs the full User
  // (user_metadata, created_at), and "the token verifies" is precisely not the
  // question it is asking.
  const tGetUser = Date.now()
  const { data: { user } } = await supabase.auth.getUser()
  msGetUser = Date.now() - tGetUser
  // `reason` is temporary diagnostic surfaced to the native sign-in UI: it
  // distinguishes a session the server never saw (cookie/propagation problem)
  // from a session the mint-guard deliberately tore down (unknown signin).
  if (!user) {
    logTiming("no-server-session")
    return { ok: false, reason: "no-server-session" }
  }

  const admin = createAdminClient()

  // Apple only surfaces the user's name on the FIRST authorization, and it
  // arrives in the plugin response — never in the token — so Supabase has no
  // name to store. The phone used to await supabase.auth.updateUser() just to
  // hand it over; the composed name now rides in on this call and is stamped
  // here with the admin client, one server->Supabase hop instead of a phone one.
  //
  // The id is the one from THIS request's getUser() and nothing else — `opts`
  // carries no user id and must never gain one. The only key set from caller
  // input is the hardcoded `name`, so a caller cannot smuggle central_signup in
  // through appleName.
  //
  // Stamped BEFORE the guard, for three reasons:
  //   1. Spreading the existing metadata is correct under BOTH possible GoTrue
  //      semantics. A delta-only payload ({ name } alone) would be safe only if
  //      the API merges; this shape is safe either way. For the record, GoTrue
  //      DOES merge top-level user_metadata keys — verified by live probe
  //      2026-08-18, only an explicit null deletes one — so ordering cannot cost
  //      the central_signup marker in either direction. Neither placement can
  //      lose the marker; this is the robust shape regardless.
  //   2. It reproduces the pre-change ordering exactly (client stamp -> getUser
  //      -> guard -> reconcile), so the guard sees the same metadata it saw
  //      before this diff. Lowest-risk.
  //   3. It provably cannot influence the verdict: enforceOAuthAccountPolicy
  //      reads user_metadata.central_signup, user.created_at, user_ministries
  //      and profiles — never `name`. The guard is still awaited, still
  //      sequential, and still the sole rejecter.
  // Its only effect that can outlive a rejection is a display name on an account
  // the guard then deletes, which the delete removes.
  const appleName = sanitizeDisplayName(opts?.appleName)
  if (appleName && !user.user_metadata?.name) {
    const tStamp = Date.now()
    const merged = { ...(user.user_metadata ?? {}), name: appleName }
    const { error: nameErr } = await admin.auth.admin.updateUserById(user.id, { user_metadata: merged })
    if (nameErr) console.error("[oauth-guard] name metadata stamp failed:", nameErr)
    // Keep the in-memory user in step so the guard's spread and
    // reconcileProfileName both see the name without a re-read. Without this,
    // reconcileProfileName reads a stale user, finds no name, and the Apple
    // display name silently stops landing in profiles.name.
    else user.user_metadata = merged
    msStamp = Date.now() - tStamp
  }

  const tGuard = Date.now()
  const { allowed } = await enforceOAuthAccountPolicy(admin, user, flow)
  msGuard = Date.now() - tGuard
  if (!allowed) {
    // Kill the server-side (cookie) session for the torn-down user; the client
    // also signs out locally on rejection. Never return a destination here.
    await supabase.auth.signOut()
    logTiming("guard-rejected")
    return { ok: false, reason: "guard-rejected" }
  }

  // The guard stays FIRST and sequential — it can delete the user. Everything
  // after it is independent of everything else after it, and NOTHING after it
  // may fail the verification: the guard's verdict is the only thing allowed to
  // reject. Both call sites treat a THROWN action as fatal and sign the user
  // out, so an unhandled blip in either of these would sign out a legitimate,
  // guard-APPROVED user — a regression, since the routing this replaced ran on
  // the client and tolerated query errors. Hence a .catch() on each.
  //   - reconcileProfileName: the same name repair the web callback runs
  //     (lib/profile-name.ts), and the SINGLE writer of profiles.name on every
  //     OAuth path. Runs exactly once, after the metadata stamp above, so it
  //     sees the best name we will ever have. A failed repair costs a display
  //     name, not a sign-in: proxy.ts already routes an email-prefix name to
  //     /complete-profile.
  //   - nativeDestination: routing only; on failure the user lands on the same
  //     safe native fallback a no-ministry user gets.
  const tPost = Date.now()
  const [, destination] = await Promise.all([
    reconcileProfileName(admin, user).catch((err) => {
      console.error("[oauth-guard] reconcileProfileName failed (non-fatal):", err)
    }),
    nativeDestination(admin, user, opts?.intent).catch((err) => {
      console.error("[oauth-guard] destination lookup failed (non-fatal), falling back:", err)
      return NATIVE_FALLBACK
    }),
  ])
  msPost = Date.now() - tPost

  logTiming("ok")
  return { ok: true, destination }
}
