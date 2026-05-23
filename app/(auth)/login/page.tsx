"use client"

import { Suspense, useState } from "react"
import { useSearchParams } from "next/navigation"
import Link from "next/link"
import { createClient, siteOrigin } from "@/lib/supabase"
import { RingCrossLogo } from "@/app/home/components/shared"

const SERIF = "var(--font-instrument-serif)"

const GoogleIcon = () => (
  <svg width="18" height="18" viewBox="0 0 48 48" fill="none">
    <path d="M43.6 20.5H42V20.4H24v7.2h11.3C33.9 31.6 29.4 34.4 24 34.4c-5.7 0-10.4-4.7-10.4-10.4S18.3 13.6 24 13.6c2.7 0 5.2 1 7.1 2.7l5.1-5.1C33.1 8.5 28.8 6.8 24 6.8 13.8 6.8 5.6 15 5.6 25.2S13.8 43.6 24 43.6c10.2 0 18.4-8.2 18.4-18.4 0-1.2-.1-2.4-.3-3.7z" fill="#FFC107"/>
    <path d="M7.3 15.5l5.9 4.3C14.8 16.5 19.1 13.6 24 13.6c2.7 0 5.2 1 7.1 2.7l5.1-5.1C33.1 8.5 28.8 6.8 24 6.8c-7.2 0-13.4 4.1-16.7 10.2z" fill="#FF3D00"/>
    <path d="M24 43.6c4.7 0 9-1.7 12.2-4.5l-5.6-4.7c-1.8 1.3-4.1 2-6.6 2-5.3 0-9.8-3.6-11.4-8.5l-5.9 4.6C8.4 39.3 15.7 43.6 24 43.6z" fill="#4CAF50"/>
    <path d="M43.6 20.5H42V20.4H24v7.2h11.3c-.7 2-2.1 3.7-3.8 4.9l5.6 4.7c-.4.4 6.7-4.9 6.7-13.6 0-1.2-.1-2.4-.3-3.7z" fill="#1976D2"/>
  </svg>
)

function LoginContent() {
  const searchParams = useSearchParams()
  const intent = searchParams.get("intent")
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError(null)

    const supabase = createClient()
    const { error } = await supabase.auth.signInWithPassword({ email, password })

    if (error) {
      setError(error.message)
      setLoading(false)
      return
    }

    if (intent === "register") { window.location.assign("/onboarding"); return }
    if (intent === "join") { window.location.assign("/ministries"); return }

    const { data: { user: me } } = await supabase.auth.getUser()
    if (me) {
      const { data: memberships } = await supabase
        .from("user_ministries")
        .select("ministry_id")
        .eq("user_id", me.id)
      const uniqueMinistries = [...new Set((memberships ?? []).map((m: { ministry_id: string }) => m.ministry_id))]
      if (uniqueMinistries.length > 1) { window.location.assign("/pick-ministry"); return }
      if (uniqueMinistries.length === 1) { window.location.assign("/home"); return }
      const { data: profile } = await supabase.from("profiles").select("ministry_id").eq("id", me.id).maybeSingle()
      if (profile?.ministry_id) { window.location.assign("/home"); return }
    }
    window.location.assign("/landing")
  }

  async function handleGoogleLogin() {
    const supabase = createClient()
    await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: siteOrigin() + "/auth/callback" + (intent ? `?intent=${intent}` : "") },
    })
  }

  return (
    <div style={{ minHeight: "100svh", display: "flex", fontFamily: "var(--font-inter)" }}>

      {/* ── Left brand panel (desktop only) ── */}
      <div className="hidden md:flex" style={{
        width: "42%", flexShrink: 0, background: "#3E1540",
        flexDirection: "column", justifyContent: "space-between",
        padding: "52px 56px", position: "relative", overflow: "hidden",
      }}>
        {/* Subtle dot grid */}
        <div aria-hidden style={{ position: "absolute", inset: 0, backgroundImage: "radial-gradient(circle, rgba(246,244,239,0.1) 1px, transparent 1px)", backgroundSize: "22px 22px", pointerEvents: "none" }} />
        <div aria-hidden style={{ position: "absolute", inset: 0, background: "radial-gradient(circle at 80% 20%, rgba(246,244,239,0.07) 0%, transparent 50%)", pointerEvents: "none" }} />

        {/* Logo */}
        <div style={{ display: "flex", alignItems: "center", gap: 10, position: "relative" }}>
          <RingCrossLogo size={26} color="#F6F4EF" />
          <span style={{ fontFamily: SERIF, fontSize: 22, color: "#F6F4EF", letterSpacing: "-0.01em" }}>Central</span>
        </div>

        {/* Main brand text */}
        <div style={{ position: "relative" }}>
          <h2 style={{ fontFamily: SERIF, fontSize: 48, fontWeight: 400, color: "#F6F4EF", lineHeight: 1.05, letterSpacing: "-0.02em", margin: "0 0 36px" }}>
            One place for your ministry to gather.
          </h2>
          <p style={{ fontFamily: SERIF, fontStyle: "italic", fontSize: 15, color: "rgba(246,244,239,0.6)", lineHeight: 1.7, margin: "0 0 10px" }}>
            &ldquo;For where two or three gather in my name, there am I with them.&rdquo;
          </p>
          <p style={{ fontSize: 10, letterSpacing: "0.2em", textTransform: "uppercase", color: "rgba(246,244,239,0.35)" }}>
            Matthew 18 : 20
          </p>
        </div>
      </div>

      {/* ── Form panel ── */}
      <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", background: "#FBF8F2", padding: "48px 24px" }}>

        {/* Mobile logo */}
        <div className="flex flex-col items-center mb-10 md:hidden">
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
            <RingCrossLogo size={28} color="#3E1540" />
            <span style={{ fontFamily: SERIF, fontSize: 32, color: "#13101A", letterSpacing: "-0.01em" }}>Central</span>
          </div>
          <p style={{ fontSize: 13, color: "#8A8497" }}>College ministry community</p>
        </div>

        <div style={{ width: "100%", maxWidth: 400 }}>

          {/* Desktop heading */}
          <div className="hidden md:block" style={{ marginBottom: 32 }}>
            <h1 style={{ fontFamily: SERIF, fontSize: 36, fontWeight: 400, color: "#13101A", letterSpacing: "-0.02em", lineHeight: 1.1, margin: "0 0 6px" }}>
              Welcome back
            </h1>
            <p style={{ fontSize: 14, color: "#8A8497" }}>Sign in to continue to Central</p>
          </div>

          {/* Card */}
          <div style={{ background: "#fff", borderRadius: 20, border: "1px solid #E8E2D2", padding: "28px 28px 24px", boxShadow: "0 2px 12px rgba(19,16,26,0.07)" }}>

            {/* Mobile heading */}
            <div className="md:hidden" style={{ marginBottom: 20 }}>
              <h2 style={{ fontFamily: SERIF, fontSize: 26, fontWeight: 400, color: "#13101A", margin: "0 0 3px" }}>Welcome back</h2>
              <p style={{ fontSize: 13, color: "#8A8497" }}>Sign in to your account</p>
            </div>

            {/* Google */}
            <button
              type="button"
              onClick={handleGoogleLogin}
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

            <form onSubmit={handleLogin} style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              {error && (
                <div style={{ borderRadius: 12, background: "rgba(62,21,64,0.08)", padding: "10px 14px", fontSize: 13, color: "#3E1540", fontWeight: 500 }}>
                  {error}
                </div>
              )}

              <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
                <label style={{ fontSize: 12, fontWeight: 600, color: "#5A5466", letterSpacing: "0.02em" }}>Email</label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  required
                  autoComplete="email"
                  className="w-full px-4 py-3 rounded-xl border border-[#ECE8DE] bg-[#FBF8F2] text-[14px] text-[#13101A] placeholder:text-[#C4C4C4] focus:outline-none focus:ring-2 focus:ring-[#3E1540]/20 focus:border-[#3E1540]/40 transition-all"
                />
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
                <label style={{ fontSize: 12, fontWeight: 600, color: "#5A5466", letterSpacing: "0.02em" }}>Password</label>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  required
                  autoComplete="current-password"
                  className="w-full px-4 py-3 rounded-xl border border-[#ECE8DE] bg-[#FBF8F2] text-[14px] text-[#13101A] placeholder:text-[#C4C4C4] focus:outline-none focus:ring-2 focus:ring-[#3E1540]/20 focus:border-[#3E1540]/40 transition-all"
                />
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full bg-[#3E1540] hover:bg-[#2D0F2E] disabled:opacity-50 text-white font-semibold py-3.5 rounded-xl active:scale-[0.97] transition-[transform,background-color] duration-150 text-[14px]"
                style={{ marginTop: 4 }}
              >
                {loading ? "Signing in…" : "Sign in"}
              </button>
            </form>
          </div>

          <p style={{ textAlign: "center", fontSize: 13, color: "#8A8497", marginTop: 20 }}>
            Don&apos;t have an account?{" "}
            <Link href={intent ? `/signup?intent=${intent}` : "/signup"} style={{ fontWeight: 600, color: "#3E1540", textDecoration: "none" }}
              className="hover:underline underline-offset-2">
              Sign up
            </Link>
          </p>
        </div>
      </div>
    </div>
  )
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginContent />
    </Suspense>
  )
}
