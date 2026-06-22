import { redirect } from "next/navigation"
import Link from "next/link"
import { createClient } from "@/lib/supabase-server"
import { RingCrossLogo } from "@/app/home/components/shared"

export default async function RegisterMinistryPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  // Not logged in → admin signup flow
  if (!user) {
    redirect("/signup?intent=register")
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle()

  const role = (profile?.role ?? "member").toLowerCase()
  const isAdminTier = ["admin", "deacon", "elder", "pastor"].includes(role)

  // Admin-tier → registration wizard
  if (isAdminTier) {
    redirect("/onboarding")
  }

  // Non-admin logged-in user — show gated message
  const SERIF = "var(--font-instrument-serif)"
  const SANS  = "var(--font-inter), system-ui, sans-serif"

  return (
    <div style={{
      minHeight: "100svh", background: "#FDFCF8",
      display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
      fontFamily: SANS, padding: "40px 24px",
    }}>
      {/* Brand */}
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 48 }}>
        <span style={{
          width: 36, height: 36, borderRadius: 10, background: "#2D0F2E",
          display: "grid", placeItems: "center", flexShrink: 0,
        }}>
          <RingCrossLogo size={20} color="#F1ECDE"/>
        </span>
        <span style={{ fontFamily: SERIF, fontSize: 22, letterSpacing: "-0.01em", color: "#13101A" }}>Central</span>
      </div>

      {/* Card */}
      <div style={{
        width: "100%", maxWidth: 420,
        background: "#FDFCF8", border: "1px solid #E8E2D2", borderRadius: 16,
        padding: "36px 32px 32px",
        textAlign: "center",
      }}>
        {/* Icon */}
        <div style={{
          width: 52, height: 52, borderRadius: "50%", background: "#F1ECDE",
          display: "grid", placeItems: "center", margin: "0 auto 20px",
        }}>
          <svg width={22} height={22} viewBox="0 0 24 24" fill="none" stroke="#3E1540" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>
          </svg>
        </div>

        <h1 style={{
          fontFamily: SERIF, fontWeight: 600, fontSize: 26, letterSpacing: "-0.02em",
          color: "#13101A", margin: "0 0 12px", lineHeight: 1.15,
        }}>
          Only ministry admins can register.
        </h1>
        <p style={{ fontSize: 15, color: "#5A5466", lineHeight: 1.6, margin: "0 0 28px" }}>
          You&apos;re signed in as a member account. Ministry registration requires an admin account — ask your ministry leader for access, or create a separate admin account.
        </p>

        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <Link href="/home" style={{
            display: "block", padding: "13px 20px", borderRadius: 10,
            background: "#2D0F2E", color: "#FDFCF8",
            fontSize: 15, fontWeight: 500, textDecoration: "none",
            textAlign: "center",
          }}>
            Back to my ministry
          </Link>
          <Link href="/signup?intent=register" style={{
            display: "block", padding: "13px 20px", borderRadius: 10,
            border: "1px solid #E2DDCF", color: "#5A5466",
            fontSize: 14, textDecoration: "none", textAlign: "center",
          }}>
            Create a new admin account
          </Link>
        </div>
      </div>
    </div>
  )
}
