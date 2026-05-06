import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase-server"

// Handles the OAuth redirect from Supabase after Google login.
//
// MANUAL SETUP REQUIRED in Supabase Dashboard:
//   1. Go to Authentication → Providers → Google → enable it
//   2. Paste your Google Client ID and Client Secret from Google Cloud Console
//   3. In Google Cloud Console → APIs & Services → Credentials → OAuth 2.0 Client,
//      add this as an Authorized Redirect URI:
//      https://wgqpnilaokfipocsugqo.supabase.co/auth/v1/callback

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get("code")

  if (!code) {
    return NextResponse.redirect(new URL("/login", origin))
  }

  const supabase = await createClient()
  const { data, error } = await supabase.auth.exchangeCodeForSession(code)

  if (error || !data.user) {
    return NextResponse.redirect(new URL("/login", origin))
  }

  // New Google users get a profile row via the handle_new_user trigger, but
  // ministry_id will be null until they join or register a ministry.
  const { data: profile } = await supabase
    .from("profiles")
    .select("ministry_id")
    .eq("id", data.user.id)
    .maybeSingle()

  if (profile?.ministry_id) {
    return NextResponse.redirect(new URL("/home", origin))
  }

  return NextResponse.redirect(new URL("/join", origin))
}
