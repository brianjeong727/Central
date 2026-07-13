import { NextRequest, NextResponse } from "next/server"
import type { EmailOtpType } from "@supabase/supabase-js"
import { createClient } from "@/lib/supabase-server"

// Server-side session establishment for email-link flows that must NOT rely on the
// browser client's URL detection (which we disabled in lib/supabase.ts for security).
//
// Password recovery is the primary consumer: forgot-password sends a reset email whose
// redirectTo points here. Depending on the project's email template, the link arrives
// EITHER as `?token_hash=…&type=recovery` (verifyOtp form) OR as `?code=…` (PKCE form,
// what Supabase's default /auth/v1/verify endpoint appends to redirect_to). We handle
// both, set the recovery session in cookies server-side, then bounce to `next`
// (/update-password), where updateUser({ password }) runs against the cookie session.
//
// This route intentionally does NOT run the /auth/callback account-minting guard: it is
// only reachable with a valid token minted by an existing-account action (password reset),
// never a fresh sign-in.
export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url)
  const token_hash = searchParams.get("token_hash")
  const type = searchParams.get("type") as EmailOtpType | null
  const code = searchParams.get("code")
  // `next` is a server-controlled relative path; reject absolute/external values to
  // avoid an open-redirect. Default to the password-reset screen.
  const nextParam = searchParams.get("next")
  const next = nextParam && nextParam.startsWith("/") && !nextParam.startsWith("//")
    ? nextParam
    : "/update-password"

  const supabase = await createClient()

  if (token_hash && type) {
    const { error } = await supabase.auth.verifyOtp({ type, token_hash })
    if (!error) return NextResponse.redirect(new URL(next, origin))
    console.error("[auth/confirm] verifyOtp error:", error)
    return NextResponse.redirect(new URL("/login?error=recovery-failed", origin))
  }

  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code)
    if (!error) return NextResponse.redirect(new URL(next, origin))
    console.error("[auth/confirm] exchangeCodeForSession error:", error)
    return NextResponse.redirect(new URL("/login?error=recovery-failed", origin))
  }

  console.error("[auth/confirm] no token_hash/type or code in URL")
  return NextResponse.redirect(new URL("/login?error=recovery-failed", origin))
}
