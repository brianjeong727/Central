import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase-server"
import { createAdminClient } from "@/lib/supabase-admin"
import { enforceOAuthAccountPolicy } from "@/lib/oauth-account-guard"

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get("code")
  const intent = searchParams.get("intent")
  const flow = searchParams.get("flow")
  const base = origin

  console.log("[auth/callback] invoked", { code: !!code, intent, flow, url: request.url })

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

    const admin = createAdminClient()

    // Mint policy (full rationale in lib/oauth-account-guard.ts, shared with the
    // native Sign in with Apple path): flow=signup stamps the durable
    // central_signup marker; anything else — INCLUDING a missing flow param — runs
    // signin-strict and tears down fresh unknown mints. An attacker hand-crafting a
    // code-bearing redirect_to WITHOUT params must not slip through a lenient path.
    const { allowed } = await enforceOAuthAccountPolicy(admin, data.user, flow)
    if (!allowed) {
      await supabase.auth.signOut()
      return NextResponse.redirect(new URL("/login?error=no-account", base))
    }

    if (intent === "register") return NextResponse.redirect(new URL("/onboarding", base))
    if (intent === "join") return NextResponse.redirect(new URL("/ministries?tab=code", base))

    // Only ACTIVE ministries count toward the picker — a pending registration
    // application is in user_ministries but isn't openable (mirrors getUserMinistries).
    const { data: memberships, error: umErr } = await admin
      .from("user_ministries")
      .select("ministry_id, ministries!inner(status)")
      .eq("user_id", data.user.id)
      .eq("ministries.status", "active")

    if (umErr) console.warn("[auth/callback] user_ministries query error:", umErr.message)

    const uniqueMinistries = [...new Set((memberships ?? []).map((m) => m.ministry_id))]

    if (uniqueMinistries.length > 1) {
      console.log("[auth/callback] multi-ministry → pick-ministry")
      return NextResponse.redirect(new URL("/pick-ministry", base))
    }
    if (uniqueMinistries.length === 1) {
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
