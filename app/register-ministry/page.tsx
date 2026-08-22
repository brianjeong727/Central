import { redirect } from "next/navigation"
import Link from "next/link"
import { createClient } from "@/lib/supabase-server"
import { RingCrossLogo } from "@/app/home/components/shared"
import { isAdminRole } from "@/lib/roles"

export default async function RegisterMinistryPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  // Not logged in → admin signup flow
  if (!user) {
    redirect("/signup?intent=register")
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("role, ministry_id")
    .eq("id", user.id)
    .maybeSingle()

  const role = (profile?.role ?? "member").toLowerCase()
  const isAdminTier = isAdminRole(role)
  const hasMinistry = !!profile?.ministry_id

  // Admin-tier → registration wizard
  if (isAdminTier) {
    redirect("/onboarding")
  }

  // NO MINISTRY → the wizard, whatever the role says.
  //
  // This gate was written for "you belong to a ministry as a member", and every
  // fresh signup is role='member' with no ministry — so it was catching exactly
  // the people the page exists for, and catching them in a LOOP: /ministries →
  // "Register your ministry" → this card → its "Back to my ministry" button →
  // /home → proxy sees no ministry → /ministries. Every button led back to the
  // same page, which is precisely how it was reported.
  //
  // Nothing downstream needs the role to be admin first: proxy.ts already lets a
  // user with no ministry into /onboarding, and the wizard self-promotes the
  // registrant to a founder role when it completes. The role check was the only
  // thing standing between a new person and the product.
  if (!hasMinistry) {
    redirect("/onboarding")
  }

  // A member OF AN EXISTING MINISTRY asking to register another one — the case
  // this card was actually written for, and where "Back to my ministry" resolves.
  const SERIF = "var(--font-instrument-serif)"
  const SANS  = "var(--font-inter), system-ui, sans-serif"

  return (
    <div style={{
      minHeight: "100svh", background: "#FDFCF8",
      display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
      fontFamily: SANS, padding: "40px 24px",
    }}>
      {/* Brand */}
      <Link href="/" aria-label="Central — home" className="transition-opacity hover:opacity-70" style={{ display: "inline-flex", alignItems: "center", gap: 10, marginBottom: 48, textDecoration: "none", color: "inherit" }}>
        <span style={{
          width: 36, height: 36, borderRadius: 10, background: "var(--plum-2)",
          display: "grid", placeItems: "center", flexShrink: 0,
        }}>
          <RingCrossLogo size={20} color="var(--ivory)"/>
        </span>
        <span style={{ fontFamily: SERIF, fontSize: 22, letterSpacing: "-0.01em", color: "var(--ink)" }}>Central</span>
      </Link>

      {/* Card */}
      <div style={{
        width: "100%", maxWidth: 420,
        background: "#FDFCF8", border: "1px solid var(--line)", borderRadius: 16,
        padding: "36px 32px 32px",
        textAlign: "center",
      }}>
        {/* Icon */}
        <div style={{
          width: 52, height: 52, borderRadius: "50%", background: "var(--ivory)",
          display: "grid", placeItems: "center", margin: "0 auto 20px",
        }}>
          <svg width={22} height={22} viewBox="0 0 24 24" fill="none" stroke="var(--plum)" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>
          </svg>
        </div>

        <h1 style={{
          fontFamily: SERIF, fontWeight: 600, fontSize: 26, letterSpacing: "-0.02em",
          color: "var(--ink)", margin: "0 0 12px", lineHeight: 1.15,
        }}>
          Only ministry admins can register.
        </h1>
        <p style={{ fontSize: 15, color: "var(--body)", lineHeight: 1.6, margin: "0 0 28px" }}>
          You&apos;re signed in as a member account. Ministry registration requires an admin account — ask your ministry leader for access, or create a separate admin account.
        </p>

        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <Link href="/home" style={{
            display: "block", padding: "13px 20px", borderRadius: 10,
            background: "var(--plum)", color: "var(--cream)",
            fontSize: 15, fontWeight: 500, textDecoration: "none",
            textAlign: "center",
          }}>
            Back to my ministry
          </Link>
          <Link href="/signup?intent=register" style={{
            display: "block", padding: "13px 20px", borderRadius: 10,
            border: "1px solid var(--line-2)", color: "var(--body)",
            fontSize: 14, textDecoration: "none", textAlign: "center",
          }}>
            Create a new admin account
          </Link>
        </div>
      </div>
    </div>
  )
}
