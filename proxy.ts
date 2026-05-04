import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

export async function proxy(request: NextRequest) {
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

  // Refresh session — must not use getSession() here per Supabase docs
  const {
    data: { user },
  } = await supabase.auth.getUser()

  const { pathname } = request.nextUrl
  const isAuthPage = pathname.startsWith('/login') || pathname.startsWith('/signup')
  const isHomePage = pathname.startsWith('/home')

  // Unauthenticated user trying to access a protected page
  if (!user && !isAuthPage) {
    return NextResponse.redirect(new URL('/login', request.url))
  }

  // Authenticated user on /login → send home (no reason to see the login form)
  // /signup is intentionally excluded: authenticated users may reach it via the
  // "Sign up" link on /join, and blocking it creates a redirect loop.
  if (user && pathname.startsWith('/login')) {
    return NextResponse.redirect(new URL('/home', request.url))
  }

  // Authenticated user accessing /home without a ministry → send to /join
  // /join itself is always accessible to authenticated users regardless of ministry status.
  if (user && isHomePage) {
    const { data: profile } = await supabase
      .from('profiles')
      .select('ministry_id')
      .eq('id', user.id)
      .maybeSingle()

    if (!profile?.ministry_id) {
      return NextResponse.redirect(new URL('/join', request.url))
    }
  }

  return supabaseResponse
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
