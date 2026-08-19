import { NextRequest, NextResponse } from "next/server"
import { inviteReturnPath, codeFromReturnPath } from "@/lib/invite-code"
import { createClient } from "@/lib/supabase-server"
import { createAdminClient } from "@/lib/supabase-admin"
import { enforceOAuthAccountPolicy } from "@/lib/oauth-account-guard"
import { reconcileProfileName } from "@/lib/profile-name"

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get("code")
  const intent = searchParams.get("intent")
  const flow = searchParams.get("flow")
  // Landing HINT only — never a credential. inviteReturnPath returns null for
  // anything that is not a well-formed code, so a caller-supplied value can never be
  // concatenated into a redirect path (no //evil.com, no ../, no CRLF).
  const invite = searchParams.get("invite")
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
      // Carry the invite context through the rejection. This used to redirect to a
      // BARE /login?error=no-account, which threw away the very thing the user was
      // in the middle of: the banner's "Create your account" CTA rebuilds its href
      // from THIS url, so a scanned-invite user was dropped on a context-free
      // signup page — the role-choice screen, with no code attached — and every
      // retry returned them to what looked like the start. Reported from the field
      // 2026-08-19 as "an endless loop back to the create an account page".
      //
      // `intent` is untrusted, so it is COMPARED against the two literals rather
      // than reflected; `invite` goes through inviteReturnPath, which returns null
      // for anything malformed, so neither can smuggle a path in.
      const rejected = new URL("/login", base)
      rejected.searchParams.set("error", "no-account")
      if (intent === "join" || intent === "register") rejected.searchParams.set("intent", intent)
      const rejectedInvite = inviteReturnPath(invite)
      if (rejectedInvite) rejected.searchParams.set("invite", codeFromReturnPath(rejectedInvite))
      return NextResponse.redirect(rejected)
    }

    // The mint is legitimate — make sure the display name is the provider's real
    // one and not handle_new_user's email-prefix fallback (lib/profile-name.ts).
    // Runs on sign-IN too, so accounts minted before this existed self-repair.
    await reconcileProfileName(admin, data.user)

    if (intent === "register") return NextResponse.redirect(new URL("/onboarding", base))
    // A valid invite is honoured on its own — not every path that carries one also
    // carries intent=join, and the email-OTP landing already returns on the invite
    // alone. Gating on intent here would make the two disagree.
    const invitePath = inviteReturnPath(invite)
    if (invitePath) return NextResponse.redirect(new URL(invitePath, base))
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
