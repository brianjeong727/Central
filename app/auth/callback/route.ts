import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase-server"
import { createAdminClient } from "@/lib/supabase-admin"

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

    // flow=signup mints new accounts legitimately (email confirmation links AND
    // Google "Register" both arrive here). Stamp a durable marker on the user so a
    // later flow=signin retry can recognize this as a real Central account. Email
    // signups already carry the marker via signUp options.data; OAuth signups can't
    // set metadata pre-mint, so we stamp server-side here. Idempotent.
    if (flow === "signup") {
      const existingMeta = data.user.user_metadata ?? {}
      if (existingMeta.central_signup !== true) {
        const { error: stampErr } = await admin.auth.admin.updateUserById(data.user.id, {
          user_metadata: { ...existingMeta, central_signup: true },
        })
        if (stampErr) console.error("[auth/callback] failed to stamp central_signup marker for", data.user.id, stampErr)
      }
    }

    // Google "Sign in" must NEVER create an account. signInWithOAuth mints a
    // brand-new Supabase user for an unknown Google identity; the /login entry tags
    // itself flow=signin. A LEGITIMATE returning user has at least one durable proof
    // of a real prior account: the central_signup marker, a profiles row with a
    // ministry, any user_ministries membership, or an account older than 24h (which
    // grandfathers every pre-marker account). Anything else is a fresh unknown mint
    // and gets torn down. Marker-based, not a 60s age heuristic — a retry after 60s
    // used to sail straight through.
    // Anything that is NOT an explicit flow=signup is treated as signin-strict — including
    // a MISSING flow param. Only our own signup entry points ever send flow=signup, and
    // minting there is legitimate registration. An attacker hand-crafting a code-bearing
    // redirect_to WITHOUT params must not slip through the lenient (mint-allowed) path;
    // flow-less callbacks now run the same unknown-mint teardown as flow=signin.
    if (flow !== "signup") {
      const hasMarker = data.user.user_metadata?.central_signup === true
      const olderThan24h = new Date(data.user.created_at).getTime() < Date.now() - 24 * 60 * 60 * 1000
      let legitimate = hasMarker || olderThan24h

      if (!legitimate) {
        const { data: um } = await admin
          .from("user_ministries").select("user_id").eq("user_id", data.user.id).limit(1)
        if (um && um.length > 0) legitimate = true
      }
      if (!legitimate) {
        const { data: prof } = await admin
          .from("profiles").select("ministry_id").eq("id", data.user.id).maybeSingle()
        if (prof?.ministry_id) legitimate = true
      }

      if (!legitimate) {
        console.warn("[auth/callback] flow=signin for unknown account → deleting & rejecting:", data.user.email)
        const { error: delErr } = await admin.auth.admin.deleteUser(data.user.id)
        if (delErr) {
          // Delete FAILED — the auth user persists (this is exactly how the prior
          // incident admitted an orphan: an unchecked failure). Log loudly.
          console.error("[auth/callback] CRITICAL: deleteUser failed for minted user", data.user.id, data.user.email, delErr)
        }
        // The profiles→auth.users FK was dropped 2026-07-12, so deleteUser no longer
        // cascades the auto-created profile (handle_new_user trigger fires on every
        // mint). Delete it directly on every rejection — otherwise an orphan profile
        // is left behind whether or not the auth delete succeeded.
        const { error: profDelErr } = await admin.from("profiles").delete().eq("id", data.user.id)
        if (profDelErr) console.error("[auth/callback] failed to delete orphan profile for", data.user.id, profDelErr)

        await supabase.auth.signOut()
        return NextResponse.redirect(new URL("/login?error=no-account", base))
      }
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
