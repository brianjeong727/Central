import { createBrowserClient } from '@supabase/ssr'
import type { SupabaseClient } from '@supabase/supabase-js'

let client: SupabaseClient | null = null

export function createClient(): SupabaseClient {
  if (client) return client

  client = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )

  // SECURITY — the browser must NEVER self-establish a session from URL artifacts.
  //
  // The live incident: Google OAuth (and any auth redirect) can land tokens/`?code=`
  // on a page other than our /auth/callback route — Supabase's Site-URL fallback drops
  // them on the site root when a redirect URL isn't allowlisted. With detectSessionInUrl
  // ON, @supabase/ssr's client (PKCE) silently exchanges that code CLIENT-SIDE and mints
  // a session, entirely bypassing the /auth/callback guard that deletes unknown Google
  // sign-ins. Result: nonexistent accounts signed straight in with zero server checks.
  //
  // We turn URL detection OFF so sessions are established ONLY by our server routes
  // (exchangeCodeForSession in /auth/callback + /auth/confirm) or password sign-in.
  //
  // Why the mutation instead of an option: @supabase/ssr 0.9.0's createBrowserClient
  // HARDCODES `detectSessionInUrl: isBrowser()` in the auth object it forwards to
  // createClient — AFTER spreading any `options.auth` we pass — so the option cannot be
  // overridden through the public constructor. We set the GoTrueClient field directly.
  // This is safe timing-wise: the constructor kicks off initialize() which reaches the
  // `detectSessionInUrl` read only behind an async lock (navigatorLock awaits a microtask
  // before acquiring), so this synchronous assignment always lands first. With the flag
  // off, _initialize() skips URL detection and falls through to _recoverAndRefresh(), so
  // cookie/storage-based session recovery is UNAFFECTED. flowType is already "pkce"
  // (also hardcoded by createBrowserClient), which is what we want.
  ;(client.auth as unknown as { detectSessionInUrl: boolean }).detectSessionInUrl = false

  return client
}

export function siteOrigin(): string {
  return window.location.origin
}
