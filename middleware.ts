import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

const ADMIN_EMAIL = 'brianjeong13@gmail.com'

export async function middleware(request: NextRequest) {
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
    pathname.startsWith('/login') ||
    pathname.startsWith('/signup') ||
    pathname.startsWith('/auth/')

  // No auth — only allow public paths
  if (!user) {
    if (!isPublicPath) {
      return NextResponse.redirect(new URL('/landing', request.url))
    }
    return supabaseResponse
  }

  // Founder account — lives only in /admin, redirect everything else there
  if (user.email === ADMIN_EMAIL) {
    if (!pathname.startsWith('/admin') && !pathname.startsWith('/auth/')) {
      return NextResponse.redirect(new URL('/admin', request.url))
    }
    return supabaseResponse
  }

  // Non-admin logged-in user — bounce off auth pages and block /admin
  if (pathname.startsWith('/login') || pathname.startsWith('/signup')) {
    return NextResponse.redirect(new URL('/home', request.url))
  }
  if (pathname.startsWith('/admin')) {
    return NextResponse.redirect(new URL('/home', request.url))
  }

  // Look up ministry_id
  const { data: profile } = await supabase
    .from('profiles')
    .select('ministry_id')
    .eq('id', user.id)
    .maybeSingle()

  // No ministry yet — only allow /onboarding or /join
  if (!profile?.ministry_id) {
    if (!pathname.startsWith('/onboarding') && !pathname.startsWith('/join')) {
      return NextResponse.redirect(new URL('/onboarding', request.url))
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
    if (!pathname.startsWith('/landing') && pathname !== '/') {
      return NextResponse.redirect(new URL('/landing', request.url))
    }
    return supabaseResponse
  }

  // Status is active — block pending/join pages (onboarding allowed so existing users can register a new ministry)
  if (
    pathname.startsWith('/pending') ||
    pathname.startsWith('/join')
  ) {
    return NextResponse.redirect(new URL('/home', request.url))
  }

  return supabaseResponse
}

export const config = {
  matcher: [
    '/((?!api/|_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
