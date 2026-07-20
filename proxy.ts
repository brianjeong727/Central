import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'
import { isMemberTier } from '@/lib/roles'

const ADMIN_EMAIL = 'brianjeong13@gmail.com'

// ── Signed routing-cache cookie (central-mw) ────────────────────────────────
// Caches ONLY routing data (ministry_id, role, ministry status, profile-complete)
// for a short TTL so the hot middleware path can skip the profiles+ministries round
// trip. The value is HMAC-SHA256 signed with the server-only service-role key.
// It is NEVER an authorization signal — RLS remains the enforcement layer; this
// cookie only decides WHERE to route a request. On any signature/uid/exp mismatch
// it is treated as absent (a cache miss → fresh query).
const MW_COOKIE = 'central-mw'
const MW_TTL_SECONDS = 5 * 60
// Refresh the auth token (getUser round trip) once it's within this many seconds of
// expiry, so a fast-path request never rides an about-to-expire JWT.
const EXP_SKEW_SECONDS = 60

type MwPayload = { uid: string; mid: string | null; role: string; status: string; pc: boolean; exp: number }

function b64urlEncode(bytes: Uint8Array): string {
  let bin = ''
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i])
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}
function b64urlDecode(str: string): Uint8Array {
  const b64 = str.replace(/-/g, '+').replace(/_/g, '/')
  const bin = atob(b64)
  const bytes = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
  return bytes
}
async function mwHmac(body: string, key: string): Promise<string> {
  const enc = new TextEncoder()
  const cryptoKey = await crypto.subtle.importKey('raw', enc.encode(key), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  const sig = await crypto.subtle.sign('HMAC', cryptoKey, enc.encode(body))
  return b64urlEncode(new Uint8Array(sig))
}
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let r = 0
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return r === 0
}
async function encodeMw(payload: MwPayload, key: string): Promise<string> {
  const body = b64urlEncode(new TextEncoder().encode(JSON.stringify(payload)))
  return `${body}.${await mwHmac(body, key)}`
}
async function decodeMw(raw: string, key: string): Promise<MwPayload | null> {
  const dot = raw.indexOf('.')
  if (dot < 1) return null
  const body = raw.slice(0, dot)
  const sig = raw.slice(dot + 1)
  if (!timingSafeEqual(sig, await mwHmac(body, key))) return null
  try {
    const p = JSON.parse(new TextDecoder().decode(b64urlDecode(body))) as MwPayload
    if (typeof p.exp !== 'number' || p.exp < Math.floor(Date.now() / 1000)) return null
    return p
  } catch {
    return null
  }
}

export async function proxy(request: NextRequest) {
  // API routes are always public — pass through before any auth check.
  // The matcher pattern should exclude /api/ but Turbopack doesn't reliably honor it.
  if (request.nextUrl.pathname.startsWith('/api/')) {
    return NextResponse.next({ request })
  }

  // Stranded OAuth code recovery. Supabase drops the `?code=` on the Site URL root
  // (`/?code=…`) rather than our /auth/callback when the provider round-trip resolves
  // to the bare origin. With detectSessionInUrl OFF the browser correctly refuses to
  // redeem it — but the user is left dumped on the marketing page with a cryptic code
  // and no verdict. Forward any code-bearing root request into the guarded callback so
  // the real exchange + unknown-mint teardown runs and the user lands on /login with a
  // proper message. flow=signin: a stranded code is always a sign-in return (register
  // uses intent=register, preserved if present).
  if (
    (request.nextUrl.pathname === '/' || request.nextUrl.pathname === '/landing') &&
    request.nextUrl.searchParams.has('code')
  ) {
    const cb = new URL('/auth/callback', request.url)
    cb.search = request.nextUrl.search
    if (!cb.searchParams.has('flow')) cb.searchParams.set('flow', 'signin')
    return NextResponse.redirect(cb)
  }

  let supabaseResponse = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          )
          supabaseResponse = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  // Auth — verify the JWT LOCALLY first (ES256 via JWKS, no network round trip).
  // getClaims() decodes + signature-checks the access token against the cached JWKS;
  // only when the token is missing / invalid / expired / near expiry do we fall back
  // to the getUser() refresh path (which also keeps server-side token refresh working
  // ~once/hour/user). email + id come from the verified claims (sub, email).
  let user: { id: string; email?: string | null } | null = null
  try {
    const { data: claimsData } = await supabase.auth.getClaims()
    const claims = claimsData?.claims as { sub?: string; email?: string; exp?: number } | undefined
    const nowSec = Math.floor(Date.now() / 1000)
    if (claims?.sub && typeof claims.exp === 'number' && claims.exp - nowSec > EXP_SKEW_SECONDS) {
      user = { id: claims.sub, email: claims.email ?? null }
    }
  } catch {
    // Any verification error → fall through to the getUser refresh path below.
  }
  if (!user) {
    const {
      data: { user: refreshed },
    } = await supabase.auth.getUser()
    user = refreshed ? { id: refreshed.id, email: refreshed.email } : null
  }

  const { pathname } = request.nextUrl

  // /join is retired (2026-07-12) — its join-by-code flow now lives on /ministries.
  // Redirect old links/bookmarks to the code tab so they never 404. Universal (runs
  // before the auth branches) since a logged-out user may still hit a stale link.
  if (pathname === '/join' || pathname.startsWith('/join/')) {
    return NextResponse.redirect(new URL('/ministries?tab=code', request.url))
  }

  // Native shell (Capacitor iOS) must never see the marketing landing page. The shell's
  // WebView User-Agent carries "CentralShell" (capacitor.config.ts ios.appendUserAgent).
  // When such a request hits the landing page (/), redirect server-side — signed-in →
  // /home (subsequent middleware passes route founders/no-ministry/pending onward),
  // signed-out → /login — so the shell never receives the marketing HTML at all. Only
  // "/" is intercepted; /login and every other auth route pass through untouched, so
  // in-app navigation inside the shell is unaffected.
  const isNativeShell = (request.headers.get('user-agent') ?? '').includes('CentralShell')
  if (isNativeShell && pathname === '/') {
    return NextResponse.redirect(new URL(user ? '/home' : '/login', request.url))
  }

  const isPublicPath =
    pathname === '/' ||
    pathname.startsWith('/landing') ||
    pathname.startsWith('/ministries') ||
    pathname.startsWith('/login') ||
    pathname.startsWith('/signup') ||
    pathname.startsWith('/forgot-password') ||
    pathname.startsWith('/update-password') ||
    pathname.startsWith('/auth/') ||
    pathname.startsWith('/api/calendar/') ||
    pathname.startsWith('/register-ministry') ||
    pathname.startsWith('/privacy') ||
    pathname.startsWith('/terms') ||
    pathname.startsWith('/support')

  // No auth — gate protected paths to login/signup
  if (!user) {
    if (pathname.startsWith('/onboarding')) {
      return NextResponse.redirect(new URL('/signup?intent=register', request.url))
    }
    if (!isPublicPath) {
      return NextResponse.redirect(new URL('/landing', request.url))
    }
    return supabaseResponse
  }

  // Founder account — always redirect to /admin
  if (user.email?.toLowerCase() === ADMIN_EMAIL.toLowerCase()) {
    if (!pathname.startsWith('/admin') && !pathname.startsWith('/auth/')) {
      return NextResponse.redirect(new URL('/admin', request.url))
    }
    return supabaseResponse
  }

  // Logged-in non-admin — bounce off auth/admin pages
  if (pathname.startsWith('/login') || pathname.startsWith('/signup')) {
    return NextResponse.redirect(new URL('/home', request.url))
  }
  if (pathname.startsWith('/admin')) {
    return NextResponse.redirect(new URL('/home', request.url))
  }

  // ── Routing data: ministry_id, role, ministry status, profile-completeness ──
  // Served from the signed central-mw cookie when present (skips the DB round trip),
  // else ONE joined profiles×ministries query. The cookie is ROUTING ONLY — never an
  // authorization signal (RLS enforces access); it caches for MW_TTL_SECONDS.
  const mwKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  let mid: string | null = null
  let role = ''
  let status = 'active'
  let profileComplete = true
  let fromCache = false

  const cachedRaw = mwKey ? request.cookies.get(MW_COOKIE)?.value : undefined
  if (mwKey && cachedRaw) {
    const cached = await decodeMw(cachedRaw, mwKey)
    // uid-mismatch (a different account on this browser) ⇒ treat as a miss.
    if (cached && cached.uid === user.id) {
      mid = cached.mid
      role = cached.role
      status = cached.status
      profileComplete = cached.pc
      fromCache = true
    }
  }

  if (!fromCache) {
    type ProfileRow = { ministry_id: string | null; role: string | null; gender: string | null; graduation_year: number | null }
    // Primary: ONE joined query. The embed MUST be FK-qualified — profiles↔ministries has
    // TWO relationships (profiles_ministry_id_fkey + ministries_archive_requested_by_fkey),
    // so the unqualified `ministries(status)` shorthand is ambiguous (PGRST201) and would
    // fail every request. LEFT join so a no-ministry user still returns a row (an inner
    // join would drop them and falsely trip the no-account teardown below).
    const joined = await supabase
      .from('profiles')
      .select('ministry_id, role, gender, graduation_year, ministries!profiles_ministry_id_fkey(status)')
      .eq('id', user.id)
      .maybeSingle()

    let profRow: ProfileRow | null = null
    let profErr = joined.error
    let resolvedStatus: string | null = null
    const readErrored = !!joined.error

    if (joined.data) {
      profRow = joined.data as ProfileRow
      const m = Array.isArray(joined.data.ministries) ? joined.data.ministries[0] : joined.data.ministries
      resolvedStatus = (m as { status?: string } | null)?.status ?? null
    } else if (joined.error) {
      // DEFENSIVE DEGRADATION — a query ERROR (embed change, transient DB blip) must NEVER
      // route a valid user away. Fall back to two plain (embed-free) queries instead of
      // treating the user as profile-less. We only ever teardown / misroute on a genuine
      // "no row", never on an error.
      const p = await supabase
        .from('profiles')
        .select('ministry_id, role, gender, graduation_year')
        .eq('id', user.id)
        .maybeSingle()
      profRow = p.data as ProfileRow | null
      profErr = p.error
      if (p.data?.ministry_id) {
        const ms = await supabase.from('ministries').select('status').eq('id', p.data.ministry_id).maybeSingle()
        resolvedStatus = ms.data?.status ?? null
      }
    }

    // SECURITY BACKSTOP — kill sessions of accounts that have NO profiles row.
    //
    // handle_new_user() creates a profiles row via an AFTER INSERT trigger on auth.users,
    // in the SAME transaction that mints the auth user — so a legitimately-signed-up user
    // ALWAYS has a profile row the instant their session is valid (there is no honest
    // "authed but profile-less" window mid-signup). Therefore an authenticated request
    // whose user has no profile row is a deleted account, or an illegitimate mint that
    // slipped past /auth/callback (e.g. via the OAuth URL-detection bypass before it was
    // fixed) whose profile was torn down. Sign it out and bounce to login.
    //
    // Only a genuine "no row" (null data, null error) triggers teardown — a transient
    // query error is NOT treated as no-account. The founder admin is exempt (handled by
    // the ADMIN_EMAIL branch above). Runs only on a cache MISS.
    if (!profRow && !profErr) {
      // scope:'local' clears the auth cookies without a network revoke round-trip; the
      // ssr cookie adapter's setAll expires them on supabaseResponse, which we then copy
      // onto the redirect so the browser drops the session on its way to /login.
      await supabase.auth.signOut({ scope: 'local' })
      const redirect = NextResponse.redirect(new URL('/login?error=no-account', request.url))
      supabaseResponse.cookies.getAll().forEach((c) => redirect.cookies.set(c))
      redirect.cookies.delete(MW_COOKIE)
      return redirect
    }

    mid = profRow?.ministry_id ?? null
    role = profRow?.role ?? ''
    status = resolvedStatus ?? 'active'
    // "Complete" = the completeness gate would NOT fire (admin-tier is always complete;
    // member/visitor need gender + graduation_year).
    profileComplete = !(isMemberTier(role) && (!profRow?.gender || profRow?.graduation_year == null))

    // Cache ONLY the settled steady state (active ministry + complete profile) AND only
    // when the read was clean (never cache a degraded/errored read — it re-queries next
    // request). Every transient/onboarding state (no ministry, pending/rejected status,
    // incomplete profile) is intentionally NOT cached, so those users re-evaluate on the
    // very next request and a state change (join a ministry, complete a profile, ministry
    // approval) takes effect immediately instead of lingering behind the TTL.
    if (mwKey && !readErrored && !profErr && mid && status === 'active' && profileComplete) {
      const value = await encodeMw(
        { uid: user.id, mid, role, status, pc: profileComplete, exp: Math.floor(Date.now() / 1000) + MW_TTL_SECONDS },
        mwKey,
      )
      supabaseResponse.cookies.set(MW_COOKIE, value, {
        httpOnly: true,
        secure: request.nextUrl.protocol === 'https:',
        sameSite: 'lax',
        path: '/',
        maxAge: MW_TTL_SECONDS,
      })
    }
  }

  // /complete-profile must stay reachable for any authed user with a profile,
  // regardless of ministry state — else the no-ministry/status branches below
  // redirect it away and the completeness gate loops forever.
  if (pathname.startsWith('/complete-profile')) return supabaseResponse

  // Profile-completeness gate — member/visitor-tier users must have gender +
  // graduation_year. Email's member signup form collects both (persisted via the
  // handle_new_user metadata trigger); OAuth (web) and native signInWithIdToken
  // collect neither and never pass through /auth/callback, so proxy is the only
  // durable chokepoint. Admin-tier is exempt (email admin signup never asked either).
  // /complete-profile is exempt (or it loops); /onboarding + /register-ministry are
  // exempt so a fresh registrant (role='member' until the wizard self-promotes) is
  // not diverted out of the registration flow. (On a cache hit profileComplete is
  // already true — we never cache an incomplete profile — so this only does real work
  // on a miss.)
  const gateExempt =
    pathname.startsWith('/complete-profile') ||
    pathname.startsWith('/onboarding') ||
    pathname.startsWith('/register-ministry') ||
    pathname.startsWith('/login') ||
    pathname.startsWith('/signup') ||
    pathname.startsWith('/forgot-password') ||
    pathname.startsWith('/update-password') ||
    pathname.startsWith('/auth/') ||
    pathname === '/' ||
    pathname.startsWith('/landing') ||
    pathname.startsWith('/privacy') ||
    pathname.startsWith('/terms') ||
    pathname.startsWith('/support')

  if (isMemberTier(role) && !profileComplete && !gateExempt) {
    const nextPath = pathname + (request.nextUrl.search || '')
    const url = new URL('/complete-profile', request.url)
    if (nextPath && nextPath !== '/complete-profile') url.searchParams.set('next', nextPath)
    const gateRedirect = NextResponse.redirect(url)
    supabaseResponse.cookies.getAll().forEach((c) => gateRedirect.cookies.set(c))
    return gateRedirect
  }

  // No ministry yet — allow onboarding/public paths; everything else goes to
  // /ministries (the polished discovery destination: browse + invite code + register —
  // actionable, unlike the marketing page). /ministries is the canonical landing.
  // Fresh registrants land on /onboarding straight from signup, so it stays open here.
  if (!mid) {
    if (!pathname.startsWith('/onboarding') && !isPublicPath) {
      return NextResponse.redirect(new URL('/ministries', request.url))
    }
    return supabaseResponse
  }

  // /onboarding gate — the wizard can self-promote a user to a founder role, so
  // for users who already belong to a ministry it's admin-tier only. Non-admin
  // members are bounced to the /register-ministry gate card. Runs BEFORE the
  // ministry-status branches so pending/rejected FOUNDERS (who hold admin-tier
  // roles) keep their ability to reach /onboarding.
  if (pathname.startsWith('/onboarding')) {
    if (['admin', 'deacon', 'elder', 'pastor'].includes(role.toLowerCase())) {
      return supabaseResponse
    }
    return NextResponse.redirect(new URL('/register-ministry', request.url))
  }

  if (status === 'pending') {
    // Check whether the user belongs to any other active ministry — if so, let
    // them switch rather than hard-locking them to the pending-status page.
    const { data: otherMemberships } = await supabase
      .from('user_ministries')
      .select('ministry_id')
      .eq('user_id', user.id)
      .neq('ministry_id', mid)

    let hasActiveMinistry = false
    if (otherMemberships && otherMemberships.length > 0) {
      const otherIds = otherMemberships.map((m: { ministry_id: string }) => m.ministry_id)
      const { data: active } = await supabase
        .from('ministries')
        .select('id')
        .in('id', otherIds)
        .eq('status', 'active')
        .limit(1)
        .maybeSingle()
      hasActiveMinistry = !!active
    }

    if (hasActiveMinistry) {
      // Route to pick-ministry so they can switch back to their active church
      if (pathname.startsWith('/pick-ministry') || pathname.startsWith('/pending') || pathname.startsWith('/landing') || pathname === '/') {
        return supabaseResponse
      }
      return NextResponse.redirect(new URL('/pick-ministry', request.url))
    }

    // /ministries stays open — a pending registrant may want to join an existing
    // ministry instead of waiting (previously they had to sign out first).
    if (!pathname.startsWith('/pending') && !pathname.startsWith('/landing') && !pathname.startsWith('/ministries') && pathname !== '/') {
      return NextResponse.redirect(new URL('/pending', request.url))
    }
    return supabaseResponse
  }

  // Rejected/inactive land on /pending (the ministry-status page renders a
  // status-specific explanation + CTAs) — never a silent bounce to marketing.
  if (status === 'rejected') {
    // /register-ministry must stay reachable — /pending's "Register again" CTA
    // points there (its page then routes admin-tier founders to /onboarding).
    const allowedForRejected = pathname.startsWith('/pending') || pathname.startsWith('/landing') || pathname.startsWith('/ministries') || pathname.startsWith('/onboarding') || pathname.startsWith('/register-ministry') || pathname === '/'
    if (!allowedForRejected) {
      return NextResponse.redirect(new URL('/pending', request.url))
    }
    return supabaseResponse
  }

  // Fail closed: 'archived' and ANY other non-active status must never reach
  // /home — treat exactly like 'rejected' (only pending/rejected have their own
  // branches above; everything else that isn't 'active' lands here).
  if (status !== 'active') {
    const allowedForInactive = pathname.startsWith('/pending') || pathname.startsWith('/landing') || pathname.startsWith('/ministries') || pathname.startsWith('/onboarding') || pathname.startsWith('/register-ministry') || pathname === '/'
    if (!allowedForInactive) {
      return NextResponse.redirect(new URL('/pending', request.url))
    }
    return supabaseResponse
  }

  // Active ministry — block pending page only; /ministries and /onboarding stay open for multi-ministry users
  if (pathname.startsWith('/pending')) {
    return NextResponse.redirect(new URL('/home', request.url))
  }

  // Allow pick-ministry for users switching between multiple ministries. A ministry
  // switch happens here, so drop the routing cache — the new ministry then takes effect
  // on the very next request instead of lingering behind the TTL (spec 2a staleness note).
  if (pathname.startsWith('/pick-ministry')) {
    supabaseResponse.cookies.delete(MW_COOKIE)
    return supabaseResponse
  }

  // Redirect vanity paths to their tab equivalents
  const TAB_REDIRECTS: Record<string, string> = {
    '/announcements': '/home?tab=announcements',
    '/forms': '/home?tab=forms',
    '/settings': '/home?tab=settings',
    '/church-settings': '/home?tab=settings',
    '/network': '/home?tab=network',
    '/profile': '/home?tab=profile',
    '/messages': '/home?tab=chats',
    '/events': '/home?tab=announcements',
  }
  if (TAB_REDIRECTS[pathname]) {
    return NextResponse.redirect(new URL(TAB_REDIRECTS[pathname], request.url))
  }

  return supabaseResponse
}

export const config = {
  matcher: [
    '/((?!api/|_next/static|_next/image|favicon.ico|manifest\\.json|sw\\.js|.*\\.(?:svg|png|jpg|jpeg|gif|webp|mjs)$).*)',
  ],
}
