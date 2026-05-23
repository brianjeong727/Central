"use client"

import { Suspense, useState } from "react"
import { useSearchParams } from "next/navigation"
import Link from "next/link"
import { createClient, siteOrigin } from "@/lib/supabase"
import { RingCrossLogo } from "@/app/home/components/shared"

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

    if (intent === "register") {
      window.location.assign("/onboarding")
      return
    }

    if (intent === "join") {
      window.location.assign("/ministries")
      return
    }

    // Browser client always has the session immediately after signInWithPassword.
    // Query user_ministries directly so multi-ministry detection is reliable.
    const { data: { user: me } } = await supabase.auth.getUser()
    if (me) {
      const { data: memberships } = await supabase
        .from("user_ministries")
        .select("ministry_id")
        .eq("user_id", me.id)

      const uniqueMinistries = [...new Set((memberships ?? []).map((m: { ministry_id: string }) => m.ministry_id))]
      if (uniqueMinistries.length > 1) { window.location.assign("/pick-ministry"); return }
      if (uniqueMinistries.length === 1) { window.location.assign("/home"); return }

      // user_ministries empty or table missing — fall back to profiles
      const { data: profile } = await supabase.from("profiles").select("ministry_id").eq("id", me.id).maybeSingle()
      if (profile?.ministry_id) { window.location.assign("/home"); return }
    }

    // No ministry affiliation — return to landing so they can choose join or register
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
    <div className="min-h-screen bg-[#FBF8F2] flex items-center justify-center px-6">
      <div className="w-full max-w-[390px]">

        {/* Logo */}
        <div className="flex flex-col items-center mb-10">
          <div className="flex items-center gap-2.5 mb-3">
            <RingCrossLogo size={32} />
            <span style={{ fontFamily: "var(--font-instrument-serif)", fontSize: "36px", color: "#13101A", letterSpacing: "-0.01em", lineHeight: 1 }}>
              Central
            </span>
          </div>
          <p className="text-[13px] text-[#8A8497]">College ministry community</p>
        </div>

        {/* Form card */}
        <div className="bg-white rounded-2xl border border-[#ECE8DE] p-6 shadow-[0_2px_8px_rgba(19,16,26,0.06)]">
          <h2 style={{ fontFamily: "var(--font-instrument-serif)", fontSize: 26, fontWeight: 400, color: "#13101A", lineHeight: 1.1, marginBottom: 4 }}>Welcome back</h2>
          <p className="text-[13px] text-[#8A8497] mb-6">Sign in to your account</p>

          {/* Google OAuth */}
          <button
            type="button"
            onClick={handleGoogleLogin}
            className="w-full flex items-center justify-center gap-3 px-4 py-3 rounded-xl border border-[#ECE8DE] bg-white hover:bg-[#EDE8E0] active:scale-[0.97] transition-[transform,background-color] duration-150 text-[14px] font-medium text-[#13101A] mb-4"
          >
            <svg width="18" height="18" viewBox="0 0 48 48" fill="none">
              <path d="M43.6 20.5H42V20.4H24v7.2h11.3C33.9 31.6 29.4 34.4 24 34.4c-5.7 0-10.4-4.7-10.4-10.4S18.3 13.6 24 13.6c2.7 0 5.2 1 7.1 2.7l5.1-5.1C33.1 8.5 28.8 6.8 24 6.8 13.8 6.8 5.6 15 5.6 25.2S13.8 43.6 24 43.6c10.2 0 18.4-8.2 18.4-18.4 0-1.2-.1-2.4-.3-3.7z" fill="#FFC107"/>
              <path d="M7.3 15.5l5.9 4.3C14.8 16.5 19.1 13.6 24 13.6c2.7 0 5.2 1 7.1 2.7l5.1-5.1C33.1 8.5 28.8 6.8 24 6.8c-7.2 0-13.4 4.1-16.7 10.2z" fill="#FF3D00"/>
              <path d="M24 43.6c4.7 0 9-1.7 12.2-4.5l-5.6-4.7c-1.8 1.3-4.1 2-6.6 2-5.3 0-9.8-3.6-11.4-8.5l-5.9 4.6C8.4 39.3 15.7 43.6 24 43.6z" fill="#4CAF50"/>
              <path d="M43.6 20.5H42V20.4H24v7.2h11.3c-.7 2-2.1 3.7-3.8 4.9l5.6 4.7c-.4.4 6.7-4.9 6.7-13.6 0-1.2-.1-2.4-.3-3.7z" fill="#1976D2"/>
            </svg>
            Continue with Google
          </button>

          {/* Divider */}
          <div className="flex items-center gap-3 mb-4">
            <div className="flex-1 h-px bg-[#ECE8DE]" />
            <span className="text-[12px] text-[#C4C4C4] font-medium">or</span>
            <div className="flex-1 h-px bg-[#ECE8DE]" />
          </div>

          <form onSubmit={handleLogin} className="flex flex-col gap-4">
            {error && (
              <div className="rounded-xl bg-[#3E1540]/8 px-4 py-3 text-[13px] text-[#3E1540] font-medium">
                {error}
              </div>
            )}

            <div className="flex flex-col gap-1.5">
              <label className="text-[12px] font-medium text-[#5A5466]">Email</label>
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

            <div className="flex flex-col gap-1.5">
              <label className="text-[12px] font-medium text-[#5A5466]">Password</label>
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
              className="w-full bg-[#3E1540] hover:bg-[#2D0F2E] disabled:opacity-50 text-white font-bold py-3.5 rounded-xl active:scale-[0.97] transition-[transform,background-color] duration-150 text-[14px] mt-1"
            >
              {loading ? "Signing in…" : "Sign in"}
            </button>
          </form>
        </div>

        <p className="text-center text-[13px] text-[#8A8497] mt-5">
          Don&apos;t have an account?{" "}
          <Link href="/signup" className="font-semibold text-[#3E1540] hover:underline underline-offset-2">
            Sign up
          </Link>
        </p>

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
