import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

const ADMIN_EMAIL = 'brianjeong13@gmail.com'

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

  const {
    data: { user },
  } = await supabase.auth.getUser()

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
    pathname.startsWith('/register-ministry')

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

  // Look up ministry_id + role (role gates /onboarding below)
  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('ministry_id, role')
    .eq('id', user.id)
    .maybeSingle()

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
  // Reuses the existing profile read (no extra query). Only a genuine "no row" (null data,
  // null error) triggers teardown — a transient query error is NOT treated as no-account.
  // The founder admin is exempt (handled by the ADMIN_EMAIL branch above, before this).
  if (!profile && !profileError) {
    // scope:'local' clears the auth cookies without a network revoke round-trip; the
    // ssr cookie adapter's setAll expires them on supabaseResponse, which we then copy
    // onto the redirect so the browser drops the session on its way to /login.
    await supabase.auth.signOut({ scope: 'local' })
    const redirect = NextResponse.redirect(new URL('/login?error=no-account', request.url))
    supabaseResponse.cookies.getAll().forEach((c) => redirect.cookies.set(c))
    return redirect
  }

  // No ministry yet — allow onboarding/public paths; everything else goes to
  // /ministries (the polished discovery destination: browse + invite code + register —
  // actionable, unlike the marketing page). /ministries is the canonical landing.
  // Fresh registrants land on /onboarding straight from signup, so it stays open here.
  if (!profile?.ministry_id) {
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
    if (['admin', 'deacon', 'elder', 'pastor'].includes((profile.role ?? '').toLowerCase())) {
      return supabaseResponse
    }
    return NextResponse.redirect(new URL('/register-ministry', request.url))
  }

  // Check ministry status
  const { data: ministry } = await supabase
    .from('ministries')
    .select('status')
    .eq('id', profile.ministry_id)
    .maybeSingle()

  const status = ministry?.status ?? 'active'

  if (status === 'pending') {
    // Check whether the user belongs to any other active ministry — if so, let
    // them switch rather than hard-locking them to the pending-status page.
    const { data: otherMemberships } = await supabase
      .from('user_ministries')
      .select('ministry_id')
      .eq('user_id', user.id)
      .neq('ministry_id', profile.ministry_id)

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

  // Allow pick-ministry for users switching between multiple ministries
  if (pathname.startsWith('/pick-ministry')) {
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
