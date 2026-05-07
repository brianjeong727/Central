import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase-server"
import { createAdminClient } from "@/lib/supabase-admin"

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get("code")
  const intent = searchParams.get("intent")

  if (!code) {
    return NextResponse.redirect(new URL("/login", origin))
  }

  const supabase = await createClient()
  const { data, error } = await supabase.auth.exchangeCodeForSession(code)

  if (error || !data.user) {
    return NextResponse.redirect(new URL("/login", origin))
  }

  if (intent === "register") {
    return NextResponse.redirect(new URL("/onboarding", origin))
  }

  if (intent === "join") {
    return NextResponse.redirect(new URL("/join", origin))
  }

  const admin = createAdminClient()

  // Try user_ministries table (may not exist yet)
  const { data: memberships, error: umErr } = await admin
    .from("user_ministries")
    .select("ministry_id, ministries!inner(status)")
    .eq("user_id", data.user.id)
    .eq("ministries.status", "active")

  if (!umErr && memberships) {
    if (memberships.length > 1) return NextResponse.redirect(new URL("/pick-ministry", origin))
    if (memberships.length === 1) return NextResponse.redirect(new URL("/home", origin))
  }

  // Fallback: check profiles.ministry_id directly
  const { data: profile } = await admin
    .from("profiles")
    .select("ministry_id")
    .eq("id", data.user.id)
    .maybeSingle()

  if (profile?.ministry_id) {
    return NextResponse.redirect(new URL("/home", origin))
  }

  // No ministry — return to landing
  return NextResponse.redirect(new URL("/landing", origin))
}
