import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

const ADMIN_EMAIL = 'brianjeong13@gmail.com'

export async function proxy(request: NextRequest) {
  // API routes are always public — pass through before any auth check.
  // The matcher pattern should exclude /api/ but Turbopack doesn't reliably honor it.
  if (request.nextUrl.pathname.startsWith('/api/')) {
    return NextResponse.next({ request })
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

  const isPublicPath =
    pathname === '/' ||
    pathname.startsWith('/landing') ||
    pathname.startsWith('/ministries') ||
    pathname.startsWith('/login') ||
    pathname.startsWith('/signup') ||
    pathname.startsWith('/forgot-password') ||
    pathname.startsWith('/update-password') ||
    pathname.startsWith('/auth/') ||
    pathname.startsWith('/api/calendar/')

  // No auth — gate protected paths to login/signup
  if (!user) {
    if (pathname.startsWith('/onboarding')) {
      return NextResponse.redirect(new URL('/signup?intent=register', request.url))
    }
    if (pathname.startsWith('/join')) {
      return NextResponse.redirect(new URL('/login?intent=join', request.url))
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

  // Any authenticated user can reach /onboarding to register a ministry
  if (pathname.startsWith('/onboarding')) {
    return supabaseResponse
  }

  // Look up ministry_id
  const { data: profile } = await supabase
    .from('profiles')
    .select('ministry_id')
    .eq('id', user.id)
    .maybeSingle()

  // No ministry yet — allow join/onboarding/public paths, otherwise send to landing
  if (!profile?.ministry_id) {
    if (!pathname.startsWith('/join') && !isPublicPath) {
      return NextResponse.redirect(new URL('/landing', request.url))
    }
    return supabaseResponse
  }

  // Check ministry status
  const { data: ministry } = await supabase
    .from('ministries')
    .select('status')
    .eq('id', profile.ministry_id)
    .maybeSingle()

  const status = ministry?.status ?? 'active'

  if (status === 'pending') {
    if (!pathname.startsWith('/pending') && !pathname.startsWith('/landing') && pathname !== '/') {
      return NextResponse.redirect(new URL('/pending', request.url))
    }
    return supabaseResponse
  }

  if (status === 'rejected') {
    const allowedForRejected = pathname.startsWith('/landing') || pathname.startsWith('/join') || pathname.startsWith('/onboarding') || pathname === '/'
    if (!allowedForRejected) {
      return NextResponse.redirect(new URL('/landing', request.url))
    }
    return supabaseResponse
  }

  // Active ministry — block pending page only; /join and /onboarding stay open for multi-ministry users
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
