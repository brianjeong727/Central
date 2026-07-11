"use client"

import { Suspense, useState } from "react"
import { useSearchParams } from "next/navigation"
import Link from "next/link"
import { AlertCircle } from "lucide-react"
import { createClient, siteOrigin } from "@/lib/supabase"
import { SplitShell, GoogleButton, OrDivider, EyeButton } from "@/app/(auth)/shared"
import { EYEBROW_STYLE as mono } from "@/components/central/typography"
import { CentralButton } from "@/components/central"

const SERIF = "var(--font-instrument-serif)"
const SANS  = "var(--font-inter)"
const serif: React.CSSProperties = { fontFamily: SERIF, fontWeight: 400, color: "var(--ink)", margin: 0 }

function LoginContent() {
  const searchParams = useSearchParams()
  const intent = searchParams.get("intent")
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [showPw, setShowPw] = useState(false)
  const [error, setError] = useState<string | null>(
    searchParams.get("error") === "no-account"
      ? "No Central account exists for that Google email yet — create an account first."
      : null
  )
  const [loading, setLoading] = useState(false)

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError(null)

    const supabase = createClient()
    const { error } = await supabase.auth.signInWithPassword({ email, password })

    if (error) {
      if (error.message.toLowerCase().includes("email not confirmed")) {
        setError("This account's email isn't confirmed yet — check your inbox for the confirmation link.")
      } else {
        setError(error.message)
      }
      setLoading(false)
      return
    }

    if (intent === "register") { window.location.assign("/onboarding"); return }
    if (intent === "join") { window.location.assign("/ministries"); return }

    const { data: { user: me } } = await supabase.auth.getUser()
    if (me) {
      // Only ACTIVE ministries count toward the picker. A pending registration
      // application lives in user_ministries too, but it isn't a ministry you can open —
      // without this filter a single-ministry admin who registered a second (pending)
      // ministry is wrongly offered the picker. Mirrors getUserMinistries' active filter.
      const { data: memberships } = await supabase
        .from("user_ministries")
        .select("ministry_id, ministries!inner(status)")
        .eq("user_id", me.id)
        .eq("ministries.status", "active")
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
      options: { redirectTo: siteOrigin() + "/auth/callback?flow=signin" + (intent ? `&intent=${intent}` : "") },
    })
  }

  const signupHref = intent ? `/signup?intent=${intent}` : "/signup"

  return (
    <SplitShell topBar={<>
      <Link href="/" style={{
        display: "inline-flex", alignItems: "center", gap: 8,
        color: "var(--body)", textDecoration: "none", marginRight: "auto", fontSize: 14,
      }}>
        <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d="M19 12H5M12 19l-7-7 7-7"/>
        </svg>
        Back
      </Link>
      <span>
        New to Central?{" "}
        <Link href={signupHref} style={{ color: "var(--plum-2)", fontWeight: 500, textDecoration: "none" }} className="hover:underline underline-offset-2">
          Create an account
        </Link>
      </span>
    </>}>
      <div style={mono}>Sign in · Central</div>
      <h1 style={{ ...serif, fontSize: 44, lineHeight: 1.03, letterSpacing: "-0.02em", margin: "14px 0 0" }}>
        Welcome back.
      </h1>
      <p style={{ fontSize: 16, color: "var(--body)", lineHeight: 1.6, margin: "16px 0 0" }}>
        Sign in to continue to your ministry workspace.
      </p>

      <div style={{ marginTop: 30 }}>
        <GoogleButton onClick={handleGoogleLogin} />
      </div>

      <div style={{ margin: "22px 0" }}>
        <OrDivider />
      </div>

      {error && (
        <div style={{
          borderRadius: 10, background: "color-mix(in srgb, var(--danger) 8%, transparent)", border: "1px solid color-mix(in srgb, var(--danger) 18%, transparent)",
          padding: "10px 14px", fontSize: 13, color: "var(--danger)", fontWeight: 500,
          display: "flex", alignItems: "flex-start", gap: 8, marginBottom: 18,
        }} role="alert">
          <AlertCircle size={14} style={{ flexShrink: 0, marginTop: 1 }} />
          {error}
        </div>
      )}

      <form onSubmit={handleLogin} style={{ display: "flex", flexDirection: "column", gap: 22 }}>
        <label style={{ display: "block" }}>
          <div style={{ ...mono, marginBottom: 8 }}>Email</div>
          <div style={{ display: "flex", alignItems: "center", background: "var(--cream-panel)", border: "1px solid var(--line-2)", borderRadius: 10, padding: "0 14px" }}>
            <input
              type="email" value={email} onChange={e => setEmail(e.target.value)}
              placeholder="you@university.edu" required autoComplete="email"
              style={{ flex: 1, border: "none", outline: "none", background: "transparent", padding: "13px 0", fontFamily: SANS, fontSize: 15, color: "var(--ink)" }}
            />
          </div>
        </label>

        <label style={{ display: "block" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 8 }}>
            <span style={mono}>Password</span>
            <Link href="/forgot-password" style={{ fontSize: 13, color: "var(--plum-2)", fontWeight: 500, textDecoration: "none" }} className="hover:underline underline-offset-2">
              Forgot password?
            </Link>
          </div>
          <div style={{ display: "flex", alignItems: "center", background: "var(--cream-panel)", border: "1px solid var(--line-2)", borderRadius: 10, padding: "0 14px" }}>
            <input
              type={showPw ? "text" : "password"} value={password} onChange={e => setPassword(e.target.value)}
              placeholder="••••••••" required autoComplete="current-password"
              style={{ flex: 1, border: "none", outline: "none", background: "transparent", padding: "13px 0", fontFamily: SANS, fontSize: 15, color: "var(--ink)" }}
            />
            <EyeButton show={showPw} onToggle={() => setShowPw(v => !v)} />
          </div>
        </label>

        <CentralButton
          type="submit" variant="primary" disabled={loading}
          style={{ width: "100%", padding: "15px", borderRadius: 10, fontSize: 15, marginTop: 6 }}
        >
          {loading && (
            <div style={{ width: 15, height: 15, borderRadius: "50%", border: "2px solid color-mix(in srgb, var(--cream) 30%, transparent)", borderTopColor: "var(--cream-panel)", animation: "spin 0.7s linear infinite", flexShrink: 0 }} />
          )}
          {loading ? "Signing in…" : "Sign in"}
        </CentralButton>
      </form>
    </SplitShell>
  )
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginContent />
    </Suspense>
  )
}
