import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase-server"
import { createAdminClient } from "@/lib/supabase-admin"

function redirectBase(): string {
  return (process.env.NEXT_PUBLIC_SITE_URL ?? "").replace(/\/$/, "")
}

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get("code")
  const intent = searchParams.get("intent")
  const base = redirectBase() || origin

  console.log("[auth/callback] invoked", { code: !!code, intent, url: request.url })

  if (!code) {
    console.error("[auth/callback] no code in URL")
    return NextResponse.redirect(new URL("/login", base))
  }

  try {
    const supabase = await createClient()
    const { data, error } = await supabase.auth.exchangeCodeForSession(code)

    if (error) {
      console.error("[auth/callback] exchangeCodeForSession error:", error)
      return NextResponse.redirect(new URL("/login", base))
    }

    if (!data?.user) {
      console.error("[auth/callback] no user after exchange, data:", data)
      return NextResponse.redirect(new URL("/login", base))
    }

    console.log("[auth/callback] user authenticated:", data.user.email)

    if (intent === "register") return NextResponse.redirect(new URL("/onboarding", base))
    if (intent === "join") return NextResponse.redirect(new URL("/join", base))

    const admin = createAdminClient()

    const { data: memberships, error: umErr } = await admin
      .from("user_ministries")
      .select("ministry_id")
      .eq("user_id", data.user.id)

    if (umErr) console.warn("[auth/callback] user_ministries query error:", umErr.message)

    if (memberships && memberships.length > 1) {
      console.log("[auth/callback] multi-ministry → pick-ministry")
      return NextResponse.redirect(new URL("/pick-ministry", base))
    }
    if (memberships && memberships.length === 1) {
      console.log("[auth/callback] single ministry → home")
      return NextResponse.redirect(new URL("/home", base))
    }

    // user_ministries empty or missing — fall back to profiles
    const { data: profile, error: profileErr } = await admin
      .from("profiles")
      .select("ministry_id")
      .eq("id", data.user.id)
      .maybeSingle()

    if (profileErr) console.warn("[auth/callback] profiles query error:", profileErr.message)

    if (profile?.ministry_id) {
      console.log("[auth/callback] profile has ministry_id → home")
      return NextResponse.redirect(new URL("/home", base))
    }

    console.log("[auth/callback] no ministry → landing")
    return NextResponse.redirect(new URL("/landing", base))

  } catch (err) {
    console.error("[auth/callback] unexpected error:", err)
    return NextResponse.redirect(new URL("/login", base))
  }
}
