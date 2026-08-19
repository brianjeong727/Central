// ─── Native Sign in with Apple (Capacitor shell) ─────────────────────────────
// In the native iOS shell the web OAuth flow can't complete: signInWithOAuth
// navigates to the provider's domain, which is outside allowNavigation, so the
// flow bounces to Safari and the session strands there instead of in the
// WKWebView. This module runs the NATIVE ASAuthorization sheet via
// @capacitor-community/apple-sign-in (dynamic import — web bundles never load
// it eagerly, mirroring lib/native-push.ts) and establishes the session
// in-webview with supabase.auth.signInWithIdToken.
//
// signInWithIdToken never touches /auth/callback, so the account-mint guard is
// re-applied via the verifyNativeOAuthSession server action (same policy
// module) immediately after the session is set.
//
// KNOWN GAP (conscious call, rls-review 2026-07-14): unlike the web flow —
// where exchange + guard + teardown run inside ONE server request — the native
// session exists for a moment BEFORE the guard runs. If the app is killed in
// that window, a signin-strict account that should have been torn down persists
// with a session. Hygiene-only: the survivor is ministry-less and RLS-walled.
// We deliberately do NOT reconcile on boot — a boot-time signin-strict pass
// could false-positive-delete a legitimate fresh signup whose marker stamp
// failed. Revisit only if orphan volume ever shows up in practice.

import { useSyncExternalStore } from "react"
import type { SupabaseClient } from "@supabase/supabase-js"
import { createClient } from "@/lib/supabase"
import { verifyNativeOAuthSession } from "@/app/actions/oauth-guard"

// Same probe as entry-splash.tsx: capacitor.config.ts appends "CentralShell"
// to the WKWebView UA.
export function isNativeShell(): boolean {
  return typeof navigator !== "undefined" && navigator.userAgent.includes("CentralShell")
}

// Hydration-safe render-time probe: the server snapshot is always false (SSR
// can't see the UA), the client snapshot re-renders once after hydration in
// the shell. Never subscribes — the UA can't change mid-session.
const noopSubscribe = () => () => {}
export function useIsNativeShell(): boolean {
  return useSyncExternalStore(noopSubscribe, isNativeShell, () => false)
}

function randomNonce(): string {
  const bytes = new Uint8Array(32)
  crypto.getRandomValues(bytes)
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("")
}

async function sha256Hex(input: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input))
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("")
}

// `destination` is computed SERVER-side by verifyNativeOAuthSession and is the
// only routing input the client needs — the phone no longer asks Supabase where
// to go (see routeAfterNativeSignIn).
export type NativeAppleResult =
  | { ok: true; destination?: string }
  | { ok: false; error: "canceled" | "unavailable" | "no-account" | "not-entitled" | "failed"; detail?: string }

// `intent` rides through to the guard action, which owns the destination
// decision for every case (register / join / ministry count / profile fallback).
export type NativeSignInOpts = { intent?: string | null }

// TEMP DIAGNOSTIC (Apple sign-in triage): the coarse error enum hides WHY the
// native flow failed. This surfaces the raw reason to the sign-in UI (native
// shell only — see the handlers) so a real-device failure is legible without a
// debuggable build. Safe to keep: better errors than a generic string.
export function nativeAuthDebugMessage(res: Extract<NativeAppleResult, { ok: false }>): string {
  return `Sign-in failed (${res.error})${res.detail ? `: ${res.detail}` : ""}`
}

/**
 * Copy for a FAILED native Google attempt. Callers must not call this for
 * `canceled` — a deliberate dismissal is the one outcome that should stay silent.
 *
 * Every other outcome has to say something. Both signup Google handlers used to
 * message only `failed` and `unavailable` and return silently otherwise, which
 * left the user staring at the same page after a tap that appeared to do nothing
 * (reported from the field 2026-08-19). `no-account` is reachable on a SIGNUP
 * flow even though the guard never rejects a signup, because signInWithGoogleNative
 * maps EVERY failed verification onto it — including `no-server-session`, a session
 * that had not propagated yet. That case is retryable, so it gets retry copy rather
 * than the misleading "you have no account".
 *
 * Unlike Apple there is deliberately NO web fallback for `unavailable`: Google
 * refuses OAuth in an embedded WebView (disallowed_useragent), so falling through
 * would trade a clear message for an opaque Google error page.
 */
export function googleNativeFailureMessage(res: Extract<NativeAppleResult, { ok: false }>): string {
  if (res.error === "unavailable" || res.error === "not-entitled") {
    return "Google sign-in needs the latest app version — update Central and try again."
  }
  if (res.error === "no-account") {
    return `We couldn't finish setting up your account — please try again.${res.detail ? ` (${res.detail})` : ""}`
  }
  return `Google sign-in didn't complete — please try again.${res.detail ? ` (${res.detail})` : ""}`
}

export async function signInWithAppleNative(flow: "signin" | "signup", opts?: NativeSignInOpts): Promise<NativeAppleResult> {
  // Android has no ASAuthorization sheet. The plugin's Android path falls back to
  // Apple's WEB flow keyed on `clientId`, and the value below is the iOS BUNDLE ID
  // — not a Services ID — so it would fail with an opaque invalid_client rather
  // than doing anything useful. Report `unavailable` instead, which every call
  // site already routes to webAppleOAuth(): the real Apple web flow, which
  // completes in-WebView because appleid.apple.com is in allowNavigation.
  if (isAndroidShell()) return { ok: false, error: "unavailable" }

  let SignInWithApple: typeof import("@capacitor-community/apple-sign-in").SignInWithApple
  try {
    ;({ SignInWithApple } = await import("@capacitor-community/apple-sign-in"))
  } catch {
    // Plugin missing from this binary (e.g. an old TestFlight build) — caller
    // falls back to the web OAuth flow, which capacitor.config.ts allows
    // in-webview via appleid.apple.com in allowNavigation.
    return { ok: false, error: "unavailable" }
  }

  // Apple requires the SHA-256 of the nonce on the authorization request; the
  // RAW nonce goes to Supabase, which hashes it and compares against the
  // token's nonce claim.
  const rawNonce = randomNonce()
  const hashedNonce = await sha256Hex(rawNonce)

  let authorization: Awaited<ReturnType<typeof SignInWithApple.authorize>>
  try {
    authorization = await SignInWithApple.authorize({
      // clientId/redirectURI are required by the plugin's option type but only
      // used by its web/Android paths; iOS uses the app's own identity.
      clientId: "app.joincentral",
      redirectURI: "https://www.joincentral.app/auth/callback",
      scopes: "email name",
      nonce: hashedNonce,
    })
  } catch (err) {
    // Distinguish the three real cases — swallowing everything as "canceled"
    // once made a binary without the native plugin look like a dead button.
    const msg = err instanceof Error ? err.message : String(err)
    console.error("[native-auth] authorize failed:", msg)
    // Capacitor's UNIMPLEMENTED: the JS bundle (remote) is newer than the
    // installed binary — no native module. Fall back to the web OAuth flow.
    if (/not implemented|unimplemented/i.test(msg)) return { ok: false, error: "unavailable", detail: msg }
    // ASAuthorizationError 1001 = user dismissed the sheet — genuinely silent.
    if (/1001|cancel/i.test(msg)) return { ok: false, error: "canceled", detail: msg }
    // 1000 = ASAuthorizationError.unknown. In practice it means the RUNNING
    // BINARY is not entitled for Sign in with Apple — the capability is missing
    // from the App ID / provisioning profile it was signed with (the
    // entitlements FILE alone is inert). It is not transient, so "please try
    // again" is the wrong thing to say: retrying can never fix it. The web
    // OAuth flow is still entitled, so fall back there rather than dead-end.
    if (/error 1000|\b1000\b/.test(msg)) return { ok: false, error: "not-entitled", detail: msg }
    // Everything else (1004 = request failed, network) is genuinely retryable.
    return { ok: false, error: "failed", detail: `authorize threw: ${msg}` }
  }

  const identityToken = authorization.response?.identityToken
  if (!identityToken) return { ok: false, error: "failed", detail: "authorize returned no identityToken" }

  const supabase = createClient()
  const { data, error } = await supabase.auth.signInWithIdToken({
    provider: "apple",
    token: identityToken,
    nonce: rawNonce,
  })
  if (error || !data?.user) {
    console.error("[native-auth] signInWithIdToken failed:", error)
    const detail = error
      ? `signInWithIdToken: ${[error.status, error.code, error.message].filter(Boolean).join(" ")}`
      : "signInWithIdToken returned no user"
    return { ok: false, error: "failed", detail }
  }

  // Apple only surfaces the user's name on the FIRST authorization, and it
  // arrives in the plugin response — never in the token — so Supabase has no
  // name to store and handle_new_user falls back to the email prefix (an opaque
  // string for private-relay addresses). It still gets stamped into
  // user_metadata so it is durable, and the profiles row is still written by
  // reconcileProfileName inside verifyNativeOAuthSession — the SINGLE writer of
  // that column on every OAuth path (web + native), and the only one that knows
  // not to stomp a name the user set themselves.
  //
  // What changed: the stamp used to be an AWAITED supabase.auth.updateUser()
  // from the PHONE, purely so the action could read the name back a moment
  // later. It now rides along as `appleName` and is stamped server-side with the
  // admin client, in the same order, one Vercel→Supabase hop instead of a
  // ~0.6s-median phone→Supabase one.
  const fullName = [authorization.response?.givenName, authorization.response?.familyName]
    .filter(Boolean).join(" ").trim()

  let verified: { ok: boolean; reason?: string; destination?: string }
  try {
    verified = await verifyNativeOAuthSession(flow, { intent: opts?.intent, appleName: fullName || null })
  } catch (err) {
    // The guard runs as a Server Action POST to the current page. If anything
    // redirects/breaks that request (see proxy.ts's Server-Action bypass), the
    // call throws — never let that strand a half-established session silently.
    const msg = err instanceof Error ? err.message : String(err)
    await supabase.auth.signOut()
    return { ok: false, error: "failed", detail: `verify action threw: ${msg}` }
  }
  if (!verified.ok) {
    // Torn down server-side; clear the local session too.
    await supabase.auth.signOut()
    return { ok: false, error: "no-account", detail: verified.reason }
  }
  return { ok: true, destination: verified.destination }
}

// ── Native Google sign-in ─────────────────────────────────────────────────────
// Same architecture as Apple: native sheet (GoogleSignIn SDK via
// @capgo/capacitor-social-login) → signInWithIdToken → the same mint guard.
// Google's web OAuth flow cannot run in an app WebView (disallowed_useragent) on
// EITHER platform, so native is the ONLY way the shell gets a Google button.
//
// The two platforms need DIFFERENT client IDs, and the Android rule is
// counter-intuitive:
//   • iOS     → the iOS OAuth client ID, passed as iOSClientId.
//   • Android → the WEB OAuth client ID, passed as webClientId. The ANDROID
//     OAuth client still has to exist in Google Cloud (keyed to the package name
//     + signing-cert SHA-1) so Google will honor the request at all, but its ID
//     is never named here — Android's Credential Manager mints an idToken whose
//     `aud` is the WEB client, which is also what Supabase's Google provider
//     validates against. Passing the Android client ID yields a token Supabase
//     rejects with a confusing audience-mismatch error.
//
// Each platform is gated on ITS OWN id, so configuring one never half-enables the
// other — the button hides on a platform whose id is absent.

function googleClientIdForPlatform(): { iOSClientId?: string; webClientId?: string } | null {
  const iOSClientId = process.env.NEXT_PUBLIC_GOOGLE_IOS_CLIENT_ID
  const webClientId = process.env.NEXT_PUBLIC_GOOGLE_WEB_CLIENT_ID
  if (isAndroidShell()) return webClientId ? { webClientId } : null
  return iOSClientId ? { iOSClientId } : null
}

// Android's Chrome WebView UA contains "Android"; iOS's WKWebView never does.
// Read from the UA rather than Capacitor.getPlatform() so this stays SYNCHRONOUS —
// googleNativeConfigured() is called at render time to decide whether to show the
// button, and an async probe there would flash a button that then disappears.
function isAndroidShell(): boolean {
  return isNativeShell() && typeof navigator !== "undefined" && /Android/i.test(navigator.userAgent)
}

export function googleNativeConfigured(): boolean {
  return googleClientIdForPlatform() !== null
}

let googleInitialized = false

export async function signInWithGoogleNative(flow: "signin" | "signup", opts?: NativeSignInOpts): Promise<NativeAppleResult> {
  const googleConfig = googleClientIdForPlatform()
  if (!googleConfig) return { ok: false, error: "unavailable" }

  let SocialLogin: typeof import("@capgo/capacitor-social-login").SocialLogin
  try {
    ;({ SocialLogin } = await import("@capgo/capacitor-social-login"))
  } catch {
    return { ok: false, error: "unavailable" }
  }

  let idToken: string | null | undefined
  try {
    if (!googleInitialized) {
      await SocialLogin.initialize({ google: googleConfig })
      googleInitialized = true
    }
    const { result } = await SocialLogin.login({
      provider: "google",
      options: {
        scopes: ["email", "profile"],
        // ALWAYS show the account chooser. Without this the plugin takes its
        // `hasPreviousSignIn() && !forceAuthCode` branch and calls
        // restorePreviousSignIn(), silently re-authenticating whoever signed in
        // last — so a second Google account is unreachable, "Sign up with Google"
        // signs you into the existing account instead of making a new one, and a
        // shared or handed-over phone signs in the wrong person with no way to
        // switch. Silent restore is right for a launch-time session refresh; it is
        // wrong for an explicit button tap, which is a request to CHOOSE.
        forcePrompt: true,
      },
    })
    idToken = "idToken" in result ? result.idToken : null
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error("[native-auth] google login failed:", msg)
    if (/not implemented|unimplemented/i.test(msg)) return { ok: false, error: "unavailable" }
    if (/cancel|-5\b|user closed/i.test(msg)) return { ok: false, error: "canceled" }
    return { ok: false, error: "failed" }
  }
  if (!idToken) return { ok: false, error: "failed" }

  const supabase = createClient()
  const { data, error } = await supabase.auth.signInWithIdToken({ provider: "google", token: idToken })
  if (error || !data?.user) {
    console.error("[native-auth] google signInWithIdToken failed:", error)
    return { ok: false, error: "failed" }
  }

  let verified: { ok: boolean; reason?: string; destination?: string }
  try {
    // Google's own metadata already carries the name — no appleName to hand over.
    verified = await verifyNativeOAuthSession(flow, { intent: opts?.intent })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    await supabase.auth.signOut()
    return { ok: false, error: "failed", detail: `verify action threw: ${msg}` }
  }
  if (!verified.ok) {
    await supabase.auth.signOut()
    return { ok: false, error: "no-account", detail: verified.reason }
  }
  return { ok: true, destination: verified.destination }
}

// A destination is only navigable if it is a SAME-ORIGIN RELATIVE PATH: it must
// start with exactly one "/". The server only ever returns hardcoded literals
// today, but this value now crosses a trust boundary (a Server Action response),
// and in a WKWebView both failure modes are live navigation risks rather than
// theoretical ones: "//evil.host" is a protocol-relative ABSOLUTE url, and
// location.assign("javascript:…") actually EXECUTES. The backslash case is
// checked too because browsers normalize "/\\host" to "//host". A rejected
// value is IGNORED, not navigated to — the caller falls through to the query
// fallback, which can only produce literals of its own.
function isSafeDestination(dest: string | null | undefined): dest is string {
  if (!dest) return false
  if (!dest.startsWith("/")) return false
  return dest[1] !== "/" && dest[1] !== "\\"
}

// Post-sign-in navigation for the native path.
//
// On the OAuth path `destination` is ALWAYS supplied — verifyNativeOAuthSession
// computed it server-side — so this makes ZERO Supabase round trips and is a
// plain navigation. The query path below is the defensive fallback: it covers a
// missing or non-navigable destination, and it is the LIVE path for the one
// caller that has no guard action to ride on — the in-app email-OTP verification
// in app/(auth)/signup/page.tsx, which mints its session with verifyOtp and
// never touches the OAuth guard.
//
// The query fallback mirrors the email login flow in app/(auth)/login/page.tsx
// (only ACTIVE ministries count toward the picker; a pending registration
// application isn't openable) — the same logic nativeDestination now runs
// server-side.
export async function routeAfterNativeSignIn(supabase: SupabaseClient, destination?: string | null): Promise<void> {
  if (isSafeDestination(destination)) { window.location.assign(destination); return }
  if (destination) console.error("[native-auth] refusing non-relative destination; falling back")

  const { data: { user: me } } = await supabase.auth.getUser()
  if (me) {
    const { data: memberships } = await supabase
      .from("user_ministries")
      .select("ministry_id, ministries!inner(status)")
      .eq("user_id", me.id)
      .eq("ministries.status", "active")
    const uniqueMinistries = [...new Set((memberships ?? []).map((m: { ministry_id: string }) => m.ministry_id))]
    if (uniqueMinistries.length > 1) { window.location.assign("/pick-ministry"); return }
    if (uniqueMinistries.length === 1) { window.location.assign("/home"); return }
    const { data: profile } = await supabase.from("profiles").select("ministry_id").eq("id", me.id).maybeSingle()
    if (profile?.ministry_id) { window.location.assign("/home"); return }
    // No ministry yet — the join flow, not the marketing landing (the shell
    // never shows marketing surfaces).
    window.location.assign("/ministries")
    return
  }
  window.location.assign("/login")
}
