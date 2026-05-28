"use client"

import { Suspense, useState } from "react"
import Link from "next/link"
import { useSearchParams } from "next/navigation"
import { createClient, siteOrigin } from "@/lib/supabase"
import { RingCrossLogo, Spinner } from "@/app/home/components/shared"
import { GoogleIcon, PasswordToggle } from "../shared"

const SERIF = "var(--font-instrument-serif)"

type View = "role-choice" | "admin" | "member"

const GRADES = [
  { value: "freshman",    label: "Freshman" },
  { value: "sophomore",   label: "Sophomore" },
  { value: "junior",      label: "Junior" },
  { value: "senior",      label: "Senior" },
  { value: "young_adult", label: "Young Adult" },
] as const

const GENDERS = [
  { value: "male",   label: "Male" },
  { value: "female", label: "Female" },
] as const

const FOUNDER_ROLES = [
  { value: "pastor" as const, label: "Pastor",  desc: "Senior leader" },
  { value: "deacon" as const, label: "Deacon",  desc: "Servant leader" },
  { value: "elder"  as const, label: "Elder",   desc: "Elder board" },
]

const pillBase: React.CSSProperties = {
  fontFamily: "var(--font-inter)", borderRadius: 999, cursor: "pointer", transition: "all 0.15s",
}
const pillActive: React.CSSProperties = {
  ...pillBase, fontWeight: 600, border: "1.5px solid #3E1540", background: "#3E1540", color: "#F6F4EF",
}
const pillInactive: React.CSSProperties = {
  ...pillBase, fontWeight: 400, border: "1px solid #E2DDCF", background: "#FBF8F2", color: "#5A5466",
}

const inputClass = "w-full px-4 py-3 rounded-xl border border-[#ECE8DE] bg-[#FBF8F2] text-[14px] text-[#13101A] placeholder:text-[#C4C4C4] focus:outline-none focus:ring-2 focus:ring-[#3E1540]/20 focus:border-[#3E1540]/40 transition-all"

// ── Left brand panel shared across all views ──────────────────────────────
function BrandPanel() {
  return (
    <div className="hidden md:flex" style={{
      width: "42%", flexShrink: 0, background: "#3E1540",
      flexDirection: "column", justifyContent: "space-between",
      padding: "52px 56px", position: "relative", overflow: "hidden",
    }}>
      <div aria-hidden style={{ position: "absolute", inset: 0, backgroundImage: "radial-gradient(circle, rgba(246,244,239,0.1) 1px, transparent 1px)", backgroundSize: "22px 22px", pointerEvents: "none" }} />
      <div aria-hidden style={{ position: "absolute", inset: 0, background: "radial-gradient(circle at 80% 20%, rgba(246,244,239,0.07) 0%, transparent 50%)", pointerEvents: "none" }} />

      <div style={{ display: "flex", alignItems: "center", gap: 10, position: "relative" }}>
        <RingCrossLogo size={26} color="#F6F4EF" />
        <span style={{ fontFamily: SERIF, fontSize: 22, color: "#F6F4EF", letterSpacing: "-0.01em" }}>Central</span>
      </div>

      <div style={{ position: "relative" }}>
        <h2 style={{ fontFamily: SERIF, fontSize: 48, fontWeight: 400, color: "#F6F4EF", lineHeight: 1.05, letterSpacing: "-0.02em", margin: "0 0 36px" }}>
          Your ministry, all in one place.
        </h2>
        <p style={{ fontFamily: SERIF, fontStyle: "italic", fontSize: 15, color: "rgba(246,244,239,0.6)", lineHeight: 1.7, margin: "0 0 10px" }}>
          &ldquo;And let us consider how to stir up one another to love and good works.&rdquo;
        </p>
        <p style={{ fontSize: 10, letterSpacing: "0.2em", textTransform: "uppercase", color: "rgba(246,244,239,0.35)" }}>
          Hebrews 10 : 24
        </p>
      </div>
    </div>
  )
}

// ── Mobile logo ────────────────────────────────────────────────────────────
function MobileLogo() {
  return (
    <div className="flex flex-col items-center mb-10 md:hidden">
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
        <RingCrossLogo size={28} color="#3E1540" />
        <span style={{ fontFamily: SERIF, fontSize: 32, color: "#13101A", letterSpacing: "-0.01em" }}>Central</span>
      </div>
      <p style={{ fontSize: 13, color: "#8A8497" }}>College ministry community</p>
    </div>
  )
}

function SignupContent() {
  const searchParams = useSearchParams()
  const intent = searchParams.get("intent")

  const [view, setView] = useState<View>(intent === "register" ? "admin" : "role-choice")

  // ── Admin form state ──
  const [adminName, setAdminName] = useState("")
  const [adminEmail, setAdminEmail] = useState("")
  const [adminPassword, setAdminPassword] = useState("")
  const [adminShowPw, setAdminShowPw] = useState(false)
  const [founderRole, setFounderRole] = useState<"pastor" | "deacon" | "elder" | "">("")
  const [adminError, setAdminError] = useState<string | null>(null)
  const [adminLoading, setAdminLoading] = useState(false)

  // ── Member form state ──
  const [memberName, setMemberName] = useState("")
  const [memberEmail, setMemberEmail] = useState("")
  const [memberPassword, setMemberPassword] = useState("")
  const [memberShowPw, setMemberShowPw] = useState(false)
  const [grade, setGrade] = useState("")
  const [gender, setGender] = useState("")
  const [memberError, setMemberError] = useState<string | null>(null)
  const [memberLoading, setMemberLoading] = useState(false)

  // ── Admin signup ──
  async function handleAdminSignup(e: React.FormEvent) {
    e.preventDefault()
    if (!founderRole) return
    setAdminLoading(true)
    setAdminError(null)
    const supabase = createClient()
    const { error } = await supabase.auth.signUp({
      email: adminEmail,
      password: adminPassword,
      options: { data: { name: adminName, role: founderRole } },
    })
    if (error) { setAdminError(error.message); setAdminLoading(false); return }
    window.location.replace("/onboarding")
  }

  async function handleAdminGoogle() {
    const supabase = createClient()
    await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: siteOrigin() + "/auth/callback?intent=register" },
    })
  }

  // ── Member signup ──
  async function handleMemberSignup(e: React.FormEvent) {
    e.preventDefault()
    setMemberLoading(true)
    setMemberError(null)
    const supabase = createClient()
    const { error } = await supabase.auth.signUp({
      email: memberEmail,
      password: memberPassword,
      options: { data: { name: memberName, grade, gender } },
    })
    if (error) { setMemberError(error.message); setMemberLoading(false); return }
    window.location.replace("/join")
  }

  async function handleMemberGoogle() {
    const supabase = createClient()
    await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: siteOrigin() + "/auth/callback" },
    })
  }

  const requiredStar = <span style={{ color: "#B91C1C" }}> *</span>

  // ════════════════════════════════════════════════════════
  // View: role-choice
  // ════════════════════════════════════════════════════════
  if (view === "role-choice") {
    return (
      <div style={{ minHeight: "100svh", display: "flex", fontFamily: "var(--font-inter)" }}>
        <BrandPanel />

        <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", background: "#FBF8F2", padding: "48px 24px" }}>
          <MobileLogo />

          <div style={{ width: "100%", maxWidth: 400 }}>
            <div className="hidden md:block" style={{ marginBottom: 32 }}>
              <h1 style={{ fontFamily: SERIF, fontSize: 36, fontWeight: 400, color: "#13101A", letterSpacing: "-0.02em", lineHeight: 1.1, margin: "0 0 6px" }}>
                Get started with Central
              </h1>
              <p style={{ fontSize: 14, color: "#8A8497" }}>How are you joining Central?</p>
            </div>

            <div className="md:hidden" style={{ marginBottom: 24 }}>
              <h2 style={{ fontFamily: SERIF, fontSize: 28, fontWeight: 400, color: "#13101A", margin: "0 0 4px" }}>How are you joining?</h2>
              <p style={{ fontSize: 13, color: "#8A8497" }}>Select one to continue</p>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              {/* Register a church card */}
              <button
                type="button"
                onClick={() => setView("admin")}
                style={{
                  textAlign: "left", cursor: "pointer",
                  padding: "22px 22px", borderRadius: 16,
                  border: "1.5px solid #E8E2D2", background: "#fff",
                  boxShadow: "0 1px 4px rgba(19,16,26,0.05)",
                  transition: "all 0.15s",
                }}
                className="hover:border-[#3E1540] hover:shadow-[0_2px_10px_rgba(62,21,64,0.1)] active:scale-[0.98]"
              >
                <div style={{ display: "flex", alignItems: "flex-start", gap: 16 }}>
                  <div style={{
                    width: 44, height: 44, borderRadius: 12, background: "#3E1540",
                    display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
                  }}>
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#F6F4EF" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
                      <polyline points="9 22 9 12 15 12 15 22" />
                    </svg>
                  </div>
                  <div style={{ flex: 1 }}>
                    <p style={{ fontSize: 15, fontWeight: 700, color: "#13101A", margin: "0 0 4px" }}>Register a church</p>
                    <p style={{ fontSize: 13, color: "#8A8497", margin: 0, lineHeight: 1.5 }}>I&apos;m a pastor, deacon, or elder starting a new ministry on Central</p>
                  </div>
                  <svg width="7" height="12" viewBox="0 0 7 12" fill="none" style={{ marginTop: 4, flexShrink: 0 }}>
                    <path d="M1 1l5 5-5 5" stroke="#C4C4C4" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </div>
              </button>

              {/* Join a ministry card */}
              <button
                type="button"
                onClick={() => setView("member")}
                style={{
                  textAlign: "left", cursor: "pointer",
                  padding: "22px 22px", borderRadius: 16,
                  border: "1.5px solid #E8E2D2", background: "#fff",
                  boxShadow: "0 1px 4px rgba(19,16,26,0.05)",
                  transition: "all 0.15s",
                }}
                className="hover:border-[#3E1540] hover:shadow-[0_2px_10px_rgba(62,21,64,0.1)] active:scale-[0.98]"
              >
                <div style={{ display: "flex", alignItems: "flex-start", gap: 16 }}>
                  <div style={{
                    width: 44, height: 44, borderRadius: 12, background: "#F4F1E8",
                    display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
                  }}>
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#3E1540" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                      <circle cx="9" cy="7" r="4" />
                      <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
                      <path d="M16 3.13a4 4 0 0 1 0 7.75" />
                    </svg>
                  </div>
                  <div style={{ flex: 1 }}>
                    <p style={{ fontSize: 15, fontWeight: 700, color: "#13101A", margin: "0 0 4px" }}>Join a ministry</p>
                    <p style={{ fontSize: 13, color: "#8A8497", margin: 0, lineHeight: 1.5 }}>I&apos;m a student or member looking to join an existing ministry</p>
                  </div>
                  <svg width="7" height="12" viewBox="0 0 7 12" fill="none" style={{ marginTop: 4, flexShrink: 0 }}>
                    <path d="M1 1l5 5-5 5" stroke="#C4C4C4" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </div>
              </button>
            </div>

            <p style={{ textAlign: "center", fontSize: 13, color: "#8A8497", marginTop: 24 }}>
              Already have an account?{" "}
              <Link href="/login" style={{ fontWeight: 600, color: "#3E1540", textDecoration: "none" }} className="hover:underline underline-offset-2">
                Sign in
              </Link>
            </p>
          </div>
        </div>
      </div>
    )
  }

  // ════════════════════════════════════════════════════════
  // View: admin
  // ════════════════════════════════════════════════════════
  if (view === "admin") {
    return (
      <div style={{ minHeight: "100svh", display: "flex", fontFamily: "var(--font-inter)" }}>
        <BrandPanel />

        <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", background: "#FBF8F2", padding: "48px 24px" }}>
          <MobileLogo />

          <div style={{ width: "100%", maxWidth: 400 }}>

            <div className="hidden md:block" style={{ marginBottom: 32 }}>
              {intent !== "register" && (
                <button
                  type="button"
                  onClick={() => setView("role-choice")}
                  style={{ background: "none", border: "none", cursor: "pointer", fontSize: 13, color: "#8A8497", padding: 0, marginBottom: 16, display: "flex", alignItems: "center", gap: 4 }}
                >
                  ← Back
                </button>
              )}
              <h1 style={{ fontFamily: SERIF, fontSize: 36, fontWeight: 400, color: "#13101A", letterSpacing: "-0.02em", lineHeight: 1.1, margin: "0 0 6px" }}>
                Register your church
              </h1>
              <p style={{ fontSize: 14, color: "#8A8497" }}>Create your admin account to get started</p>
            </div>

            <div style={{ background: "#fff", borderRadius: 20, border: "1px solid #E8E2D2", padding: "28px 28px 24px", boxShadow: "0 2px 12px rgba(19,16,26,0.07)" }}>

              <div className="md:hidden" style={{ marginBottom: 20 }}>
                {intent !== "register" && (
                  <button
                    type="button"
                    onClick={() => setView("role-choice")}
                    style={{ background: "none", border: "none", cursor: "pointer", fontSize: 13, color: "#8A8497", padding: 0, marginBottom: 12, display: "flex", alignItems: "center", gap: 4 }}
                  >
                    ← Back
                  </button>
                )}
                <h2 style={{ fontFamily: SERIF, fontSize: 26, fontWeight: 400, color: "#13101A", margin: "0 0 3px" }}>Register your church</h2>
                <p style={{ fontSize: 13, color: "#8A8497" }}>Create your admin account</p>
              </div>

              {/* Google */}
              <button
                type="button"
                onClick={handleAdminGoogle}
                className="w-full flex items-center justify-center gap-3 py-3 rounded-xl border border-[#ECE8DE] bg-white hover:bg-[#F4F1E8] active:scale-[0.97] transition-[transform,background-color] duration-150 text-[14px] font-medium text-[#13101A]"
                style={{ marginBottom: 16 }}
              >
                <GoogleIcon />
                Continue with Google
              </button>

              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16 }}>
                <div style={{ flex: 1, height: 1, background: "#ECE8DE" }} />
                <span style={{ fontSize: 11, color: "#C4C4C4", fontWeight: 500, letterSpacing: "0.04em" }}>or</span>
                <div style={{ flex: 1, height: 1, background: "#ECE8DE" }} />
              </div>

              <form onSubmit={handleAdminSignup} style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                {adminError && (
                  <div style={{ borderRadius: 12, background: "rgba(220,38,38,0.08)", padding: "10px 14px", fontSize: 13, color: "#B91C1C", fontWeight: 500, display: "flex", alignItems: "center", gap: 8 }} role="alert">
                    <span style={{ flexShrink: 0 }}>⚠</span>
                    {adminError}
                  </div>
                )}

                <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
                  <label style={{ fontSize: 12, fontWeight: 600, color: "#5A5466", letterSpacing: "0.02em" }}>Full name</label>
                  <input type="text" value={adminName} onChange={(e) => setAdminName(e.target.value)}
                    placeholder="Pastor John Smith" required autoComplete="name" className={inputClass} />
                </div>

                <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
                  <label style={{ fontSize: 12, fontWeight: 600, color: "#5A5466", letterSpacing: "0.02em" }}>Email</label>
                  <input type="email" value={adminEmail} onChange={(e) => setAdminEmail(e.target.value)}
                    placeholder="you@example.com" required autoComplete="email" className={inputClass} />
                </div>

                <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
                  <label style={{ fontSize: 12, fontWeight: 600, color: "#5A5466", letterSpacing: "0.02em" }}>Password</label>
                  <div style={{ position: "relative" }}>
                    <input
                      type={adminShowPw ? "text" : "password"}
                      value={adminPassword}
                      onChange={(e) => setAdminPassword(e.target.value)}
                      placeholder="••••••••"
                      required
                      minLength={6}
                      autoComplete="new-password"
                      className={inputClass + " pr-10"}
                    />
                    <PasswordToggle show={adminShowPw} onToggle={() => setAdminShowPw((v) => !v)} />
                  </div>
                  <p style={{ fontSize: 11, color: "#8A8497", marginTop: 2 }}>At least 6 characters</p>
                </div>

                {/* Role selector */}
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  <label style={{ fontSize: 12, fontWeight: 600, color: "#5A5466", letterSpacing: "0.02em" }}>
                    Your role{requiredStar}
                  </label>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8 }}>
                    {FOUNDER_ROLES.map(({ value, label, desc }) => {
                      const sel = founderRole === value
                      return (
                        <button
                          key={value}
                          type="button"
                          onClick={() => setFounderRole(value)}
                          style={{
                            padding: "12px 10px", borderRadius: 10, textAlign: "center", cursor: "pointer",
                            border: sel ? "2px solid #3E1540" : "1.5px solid #ECE8DE",
                            background: sel ? "#3E1540" : "white",
                            transition: "all 0.15s",
                          }}
                        >
                          <p style={{ fontSize: 13, fontWeight: 700, color: sel ? "#F6F4EF" : "#13101A", margin: "0 0 2px" }}>{label}</p>
                          <p style={{ fontSize: 10, color: sel ? "rgba(246,244,239,0.65)" : "#8A8497", margin: 0 }}>{desc}</p>
                        </button>
                      )
                    })}
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={adminLoading || !founderRole}
                  className="w-full bg-[#3E1540] hover:bg-[#2D0F2E] disabled:opacity-50 text-white font-semibold py-3.5 rounded-xl active:scale-[0.97] transition-[transform,background-color] duration-150 text-[14px] flex items-center justify-center gap-2"
                  style={{ marginTop: 4 }}
                >
                  {adminLoading && <Spinner />}
                  {adminLoading ? "Creating account…" : "Create account"}
                </button>

                {!founderRole && !adminLoading && (
                  <p style={{ fontSize: 12, color: "#8A8497", textAlign: "center", marginTop: 2 }}>
                    Select your role to continue
                  </p>
                )}
              </form>
            </div>

            {/* Not an admin link */}
            <p style={{ textAlign: "center", fontSize: 13, color: "#8A8497", marginTop: 16 }}>
              Not a pastor, deacon, or elder?{" "}
              <Link href="/not-admin" style={{ fontWeight: 600, color: "#3E1540", textDecoration: "none" }} className="hover:underline underline-offset-2">
                See who can register →
              </Link>
            </p>

            <p style={{ textAlign: "center", fontSize: 13, color: "#8A8497", marginTop: 10 }}>
              Already have an account?{" "}
              <Link href="/login?intent=register" style={{ fontWeight: 600, color: "#3E1540", textDecoration: "none" }} className="hover:underline underline-offset-2">
                Sign in
              </Link>
            </p>
          </div>
        </div>
      </div>
    )
  }

  // ════════════════════════════════════════════════════════
  // View: member
  // ════════════════════════════════════════════════════════
  return (
    <div style={{ minHeight: "100svh", display: "flex", fontFamily: "var(--font-inter)" }}>
      <BrandPanel />

      <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", background: "#FBF8F2", padding: "48px 24px" }}>
        <MobileLogo />

        <div style={{ width: "100%", maxWidth: 400 }}>

          <div className="hidden md:block" style={{ marginBottom: 32 }}>
            <button
              type="button"
              onClick={() => setView("role-choice")}
              style={{ background: "none", border: "none", cursor: "pointer", fontSize: 13, color: "#8A8497", padding: 0, marginBottom: 16, display: "flex", alignItems: "center", gap: 4 }}
            >
              ← Back
            </button>
            <h1 style={{ fontFamily: SERIF, fontSize: 36, fontWeight: 400, color: "#13101A", letterSpacing: "-0.02em", lineHeight: 1.1, margin: "0 0 6px" }}>
              Create your account
            </h1>
            <p style={{ fontSize: 14, color: "#8A8497" }}>Get started with Central in minutes</p>
          </div>

          <div style={{ background: "#fff", borderRadius: 20, border: "1px solid #E8E2D2", padding: "28px 28px 24px", boxShadow: "0 2px 12px rgba(19,16,26,0.07)" }}>

            <div className="md:hidden" style={{ marginBottom: 20 }}>
              <button
                type="button"
                onClick={() => setView("role-choice")}
                style={{ background: "none", border: "none", cursor: "pointer", fontSize: 13, color: "#8A8497", padding: 0, marginBottom: 12, display: "flex", alignItems: "center", gap: 4 }}
              >
                ← Back
              </button>
              <h2 style={{ fontFamily: SERIF, fontSize: 26, fontWeight: 400, color: "#13101A", margin: "0 0 3px" }}>Create an account</h2>
              <p style={{ fontSize: 13, color: "#8A8497" }}>Join the Central community</p>
            </div>

            {/* Google */}
            <button
              type="button"
              onClick={handleMemberGoogle}
              className="w-full flex items-center justify-center gap-3 py-3 rounded-xl border border-[#ECE8DE] bg-white hover:bg-[#F4F1E8] active:scale-[0.97] transition-[transform,background-color] duration-150 text-[14px] font-medium text-[#13101A]"
              style={{ marginBottom: 16 }}
            >
              <GoogleIcon />
              Continue with Google
            </button>

            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16 }}>
              <div style={{ flex: 1, height: 1, background: "#ECE8DE" }} />
              <span style={{ fontSize: 11, color: "#C4C4C4", fontWeight: 500, letterSpacing: "0.04em" }}>or</span>
              <div style={{ flex: 1, height: 1, background: "#ECE8DE" }} />
            </div>

            <form onSubmit={handleMemberSignup} style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              {memberError && (
                <div style={{ borderRadius: 12, background: "rgba(220,38,38,0.08)", padding: "10px 14px", fontSize: 13, color: "#B91C1C", fontWeight: 500, display: "flex", alignItems: "center", gap: 8 }} role="alert">
                  <span style={{ flexShrink: 0 }}>⚠</span>
                  {memberError}
                </div>
              )}

              <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
                <label style={{ fontSize: 12, fontWeight: 600, color: "#5A5466", letterSpacing: "0.02em" }}>Full name</label>
                <input type="text" value={memberName} onChange={(e) => setMemberName(e.target.value)}
                  placeholder="Brian Jeong" required autoComplete="name" className={inputClass} />
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                <label style={{ fontSize: 12, fontWeight: 600, color: "#5A5466", letterSpacing: "0.02em" }}>
                  Gender{requiredStar}
                </label>
                <p style={{ fontSize: 11, color: "#8A8497", margin: "-4px 0 0" }}>Helps us place you in the right small group.</p>
                <div style={{ display: "flex", gap: 7 }}>
                  {GENDERS.map(({ value, label }) => (
                    <button
                      key={value}
                      type="button"
                      onClick={() => setGender(value)}
                      style={{ ...(gender === value ? pillActive : pillInactive), padding: "6px 20px", fontSize: 13 }}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
                <label style={{ fontSize: 12, fontWeight: 600, color: "#5A5466", letterSpacing: "0.02em" }}>Email</label>
                <input type="email" value={memberEmail} onChange={(e) => setMemberEmail(e.target.value)}
                  placeholder="you@example.com" required autoComplete="email" className={inputClass} />
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
                <label style={{ fontSize: 12, fontWeight: 600, color: "#5A5466", letterSpacing: "0.02em" }}>Password</label>
                <div style={{ position: "relative" }}>
                  <input
                    type={memberShowPw ? "text" : "password"}
                    value={memberPassword}
                    onChange={(e) => setMemberPassword(e.target.value)}
                    placeholder="••••••••"
                    required
                    minLength={6}
                    autoComplete="new-password"
                    className={inputClass + " pr-10"}
                  />
                  <PasswordToggle show={memberShowPw} onToggle={() => setMemberShowPw((v) => !v)} />
                </div>
                <p style={{ fontSize: 11, color: "#8A8497", marginTop: 2 }}>At least 6 characters</p>
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                <label style={{ fontSize: 12, fontWeight: 600, color: "#5A5466", letterSpacing: "0.02em" }}>
                  Year{requiredStar}
                </label>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 7 }}>
                  {GRADES.map(({ value, label }) => (
                    <button
                      key={value}
                      type="button"
                      onClick={() => setGrade(value)}
                      style={{ ...(grade === value ? pillActive : pillInactive), padding: "6px 14px", fontSize: 13 }}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>

              <button
                type="submit"
                disabled={memberLoading || !grade || !gender}
                className="w-full bg-[#3E1540] hover:bg-[#2D0F2E] disabled:opacity-50 text-white font-semibold py-3.5 rounded-xl active:scale-[0.97] transition-[transform,background-color] duration-150 text-[14px] flex items-center justify-center gap-2"
                style={{ marginTop: 4 }}
              >
                {memberLoading && <Spinner />}
                {memberLoading ? "Creating account…" : "Create account"}
              </button>

              {(!grade || !gender) && !memberLoading && (
                <p style={{ fontSize: 12, color: "#8A8497", textAlign: "center", marginTop: 2 }}>
                  Select your year and gender to continue
                </p>
              )}
            </form>
          </div>

          <p style={{ textAlign: "center", fontSize: 13, color: "#8A8497", marginTop: 20 }}>
            Already have an account?{" "}
            <Link href="/login" style={{ fontWeight: 600, color: "#3E1540", textDecoration: "none" }} className="hover:underline underline-offset-2">
              Sign in
            </Link>
          </p>
        </div>
      </div>
    </div>
  )
}

export default function SignupPage() {
  return (
    <Suspense>
      <SignupContent />
    </Suspense>
  )
}
