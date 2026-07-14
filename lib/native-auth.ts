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

export type NativeAppleResult =
  | { ok: true }
  | { ok: false; error: "canceled" | "unavailable" | "no-account" | "failed" }

export async function signInWithAppleNative(flow: "signin" | "signup"): Promise<NativeAppleResult> {
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
  } catch {
    // The native sheet was dismissed (or denied) — not an error state.
    return { ok: false, error: "canceled" }
  }

  const identityToken = authorization.response?.identityToken
  if (!identityToken) return { ok: false, error: "failed" }

  const supabase = createClient()
  const { data, error } = await supabase.auth.signInWithIdToken({
    provider: "apple",
    token: identityToken,
    nonce: rawNonce,
  })
  if (error || !data?.user) {
    console.error("[native-auth] signInWithIdToken failed:", error)
    return { ok: false, error: "failed" }
  }

  // Apple only surfaces the user's name on the FIRST authorization, and it
  // arrives in the plugin response — never in the token — so the
  // handle_new_user trigger falls back to the email prefix (an opaque string
  // for private-relay addresses). Backfill both metadata and the profile row.
  const fullName = [authorization.response?.givenName, authorization.response?.familyName]
    .filter(Boolean).join(" ").trim()
  if (fullName && !data.user.user_metadata?.name) {
    try {
      await supabase.auth.updateUser({ data: { name: fullName } })
      await supabase.from("profiles").update({ name: fullName }).eq("id", data.user.id)
    } catch (err) {
      console.error("[native-auth] name backfill failed:", err)
    }
  }

  const { ok } = await verifyNativeOAuthSession(flow)
  if (!ok) {
    // Torn down server-side; clear the local session too.
    await supabase.auth.signOut()
    return { ok: false, error: "no-account" }
  }
  return { ok: true }
}

// Post-sign-in routing for the native path — mirrors the email login flow in
// app/(auth)/login/page.tsx (only ACTIVE ministries count toward the picker;
// a pending registration application isn't openable).
export async function routeAfterNativeSignIn(supabase: SupabaseClient): Promise<void> {
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
