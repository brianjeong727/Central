"use client"

import { Suspense, useState } from "react"
import { useSearchParams } from "next/navigation"
import Link from "next/link"
import { AlertCircle } from "lucide-react"
import { createClient, siteOrigin } from "@/lib/supabase"
import { SplitShell, GoogleButton, GoogleGlyph, AppleButton, AppleGlyph, OrDivider, EyeButton } from "@/app/(auth)/shared"
import { isNativeShell, useIsNativeShell, signInWithAppleNative, signInWithGoogleNative, googleNativeConfigured, routeAfterNativeSignIn } from "@/lib/native-auth"
import { RingCrossLogo } from "@/app/home/components/shared"
import { EntrySplash } from "@/app/home/components/entry-splash"
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
      : searchParams.get("error") === "recovery-failed"
      ? "That password reset link is invalid or expired — request a new one."
      : null
  )
  const [loading, setLoading] = useState(false)
  // Mobile is a two-step flow (welcome → sign-in form). If we arrived with an
  // ?error=… (error state already set), jump straight to the form so it's visible.
  const [mobileStep, setMobileStep] = useState<"welcome" | "form">(
    searchParams.get("error") ? "form" : "welcome"
  )
  // Google's web-OAuth flow can't run inside the WKWebView (Google blocks
  // embedded webviews), so the shell uses the NATIVE Google sheet instead —
  // shown only once the iOS OAuth client ID is configured. Until then the
  // shell shows Apple + email only; the web always keeps all providers.
  const nativeShell = useIsNativeShell()
  const googleInShell = googleNativeConfigured()

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
    if (isNativeShell()) {
      setError(null)
      const res = await signInWithGoogleNative("signin")
      if (!res.ok) {
        if (res.error === "no-account") setError("No Central account exists for that Google email yet — create an account first.")
        else if (res.error === "failed") setError("Google sign-in didn't complete — please try again.")
        else if (res.error === "unavailable") setError("Google sign-in needs the latest app version — update Central and try again.")
        else return // canceled — no error surface
        setMobileStep("form")
        return
      }
      if (intent === "register") { window.location.assign("/onboarding"); return }
      if (intent === "join") { window.location.assign("/ministries"); return }
      await routeAfterNativeSignIn(createClient())
      return
    }
    const supabase = createClient()
    await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: siteOrigin() + "/auth/callback?flow=signin" + (intent ? `&intent=${intent}` : "") },
    })
  }

  async function handleAppleLogin() {
    if (isNativeShell()) {
      setError(null)
      const res = await signInWithAppleNative("signin")
      if (!res.ok) {
        if (res.error === "unavailable") { await webAppleOAuth(); return }
        if (res.error === "no-account") setError("No Central account exists for that Apple ID yet — create an account first.")
        else if (res.error === "failed") setError("Apple sign-in didn't complete — make sure this device is signed in to an Apple ID (Settings), then try again.")
        else return // canceled — no error surface
        // The mobile welcome step has no error banner — surface it on the form step.
        setMobileStep("form")
        return
      }
      if (intent === "register") { window.location.assign("/onboarding"); return }
      if (intent === "join") { window.location.assign("/ministries"); return }
      await routeAfterNativeSignIn(createClient())
      return
    }
    await webAppleOAuth()
  }

  async function webAppleOAuth() {
    const supabase = createClient()
    await supabase.auth.signInWithOAuth({
      provider: "apple",
      options: { redirectTo: siteOrigin() + "/auth/callback?flow=signin" + (intent ? `&intent=${intent}` : "") },
    })
  }

  const signupHref = intent ? `/signup?intent=${intent}` : "/signup"

  // ── Mobile-only styles (Pocket idiom — KEEP per ratified reconciliation) ──
  const pillBase: React.CSSProperties = {
    display: "flex", alignItems: "center", justifyContent: "center", gap: 9,
    borderRadius: 999, fontSize: 14.5, fontWeight: 600, border: "none",
    minHeight: 50, padding: "0 22px", width: "100%", cursor: "pointer", fontFamily: "var(--serif)",
  }
  const pillPrimary: React.CSSProperties = { ...pillBase, background: "var(--plum)", color: "var(--cream)" }
  const pillCard: React.CSSProperties = { ...pillBase, background: "var(--ivory)", color: "var(--ink)" }
  const fieldLabel: React.CSSProperties = {
    display: "block", fontFamily: "var(--mono)", fontSize: 10, letterSpacing: "1.4px",
    color: "var(--muted-text)", textTransform: "uppercase", marginBottom: 7, paddingLeft: 4,
  }
  const fieldBox: React.CSSProperties = {
    display: "flex", alignItems: "center", width: "100%", minHeight: 52,
    border: "none", borderRadius: 16, background: "var(--ivory)", padding: "0 18px",
  }
  const fieldInput: React.CSSProperties = {
    flex: 1, minWidth: 0, border: "none", outline: "none", background: "transparent",
    fontSize: 16, fontFamily: "var(--serif)", color: "var(--ink)", padding: "14px 0",
  }
  const mH1: React.CSSProperties = {
    fontFamily: "var(--serif)", fontSize: 30, fontWeight: 600, letterSpacing: "-0.025em",
    lineHeight: 1.08, color: "var(--ink)", margin: 0,
  }
  const mSub: React.CSSProperties = { fontSize: 14.5, color: "var(--body)", lineHeight: 1.55 }
  const createAccount = (
    <div style={{ textAlign: "center", fontSize: 13.5, color: "var(--muted-text)", marginTop: 6 }}>
      New here? <Link href={signupHref} style={{ color: "var(--plum)", fontWeight: 500, textDecoration: "none" }}>Create an account</Link>
    </div>
  )

  return (
    <>
    <EntrySplash />

    {/* ── Desktop (≥768px) — unchanged SplitShell ── */}
    <div className="hidden md:block">
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

      <div style={{ marginTop: 30, display: "flex", flexDirection: "column", gap: 10 }}>
        <AppleButton onClick={handleAppleLogin} />
        {(!nativeShell || googleInShell) && <GoogleButton onClick={handleGoogleLogin} />}
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
    </div>

    {/* ── Mobile (<768px) — two-step Pocket entry flow ── */}
    <div className="md:hidden">
      {mobileStep === "welcome" ? (
        // height:100dvh (not minHeight) so the step is EXACTLY the viewport and never
        // grows taller than the screen. In the native WKWebView dvh == svh == lvh (no
        // dynamic browser chrome) so this is a stable, exact fit; on web mobile it
        // tracks the live viewport. overflowY:auto + the cluster's `flex:1 0 auto`
        // (grow, never shrink) means: tall viewports fill with no scroll; only short
        // viewports (content > screen) scroll instead of clipping.
        <div className="max-w-[390px] mx-auto w-full" style={{
          height: "100dvh", overflowY: "auto", background: "var(--cream)", display: "flex", flexDirection: "column",
          padding: "calc(env(safe-area-inset-top) + 24px) 24px calc(env(safe-area-inset-bottom) + 24px)",
        }}>
          <div style={{ flex: "1 0 auto", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", textAlign: "center" }}>
            <RingCrossLogo size={58} color="var(--plum)" />
            <div style={{ fontFamily: "var(--serif)", fontSize: 40, fontWeight: 600, letterSpacing: "-0.03em", color: "var(--ink)", marginTop: 14 }}>Central</div>
            <div style={{ ...mSub, marginTop: 6 }}>One home for your ministry.</div>
            <div style={{ textAlign: "center", marginTop: 40 }}>
              <p style={{ fontFamily: "var(--serif)", fontStyle: "italic", fontSize: 15, color: "var(--body)", margin: 0 }}>&ldquo;Be still, and know that I am God.&rdquo;</p>
              <span style={{ display: "block", marginTop: 6, fontFamily: "var(--mono)", fontSize: 9, letterSpacing: "1.4px", color: "var(--faint)", textTransform: "uppercase" }}>Psalm 46 : 10</span>
            </div>
          </div>
          <div style={{ flexShrink: 0, display: "flex", flexDirection: "column", gap: 10 }}>
            {/* B3 ivory pills; glyphs keep brand marks single-sourced in shared.tsx. */}
            <button type="button" onClick={handleAppleLogin} style={pillCard}>
              <AppleGlyph size={18} />
              Continue with Apple
            </button>
            {(!nativeShell || googleInShell) && (
              <button type="button" onClick={handleGoogleLogin} style={pillCard}>
                <GoogleGlyph size={18} />
                Continue with Google
              </button>
            )}
            <button type="button" onClick={() => setMobileStep("form")} style={pillPrimary}>Continue with email</button>
            {createAccount}
          </div>
        </div>
      ) : (
        // Same exact-fit story as the welcome step (see note above): height:100dvh +
        // overflowY:auto so the short sign-in form fits with no scroll on a normal
        // phone, and only scrolls on very short viewports.
        <div className="max-w-[390px] mx-auto w-full" style={{
          height: "100dvh", overflowY: "auto", background: "var(--cream)", display: "flex", flexDirection: "column",
          padding: "env(safe-area-inset-top) 24px calc(env(safe-area-inset-bottom) + 24px)",
        }}>
          <button type="button" onClick={() => setMobileStep("welcome")} style={{
            display: "flex", alignItems: "center", gap: 6, alignSelf: "flex-start",
            background: "none", border: "none", color: "var(--muted-text)", fontSize: 14,
            padding: "14px 0 4px", cursor: "pointer", fontFamily: "var(--serif)",
          }}>
            <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M19 12H5M12 19l-7-7 7-7"/></svg>
            Back
          </button>
          <div style={{ marginTop: 26 }}>
            <div style={mono}>Sign in</div>
            <h1 style={{ ...mH1, marginTop: 8 }}>Welcome back.</h1>
          </div>

          {error && (
            <div style={{
              borderRadius: 10, background: "color-mix(in srgb, var(--danger) 8%, transparent)",
              border: "1px solid color-mix(in srgb, var(--danger) 18%, transparent)",
              padding: "10px 14px", fontSize: 13, color: "var(--danger)", fontWeight: 500,
              display: "flex", alignItems: "flex-start", gap: 8, marginTop: 22,
            }} role="alert">
              <AlertCircle size={14} style={{ flexShrink: 0, marginTop: 1 }} />
              {error}
            </div>
          )}

          <form onSubmit={handleLogin}>
            <div style={{ marginTop: 26 }}>
              <label style={{ display: "block" }}>
                <span style={fieldLabel}>Email</span>
                <div style={fieldBox}>
                  <input
                    type="email" value={email} onChange={e => setEmail(e.target.value)}
                    placeholder="you@university.edu" required autoComplete="email"
                    style={fieldInput}
                  />
                </div>
              </label>
            </div>
            <div style={{ marginTop: 16 }}>
              <label style={{ display: "block" }}>
                <span style={fieldLabel}>Password</span>
                <div style={fieldBox}>
                  <input
                    type={showPw ? "text" : "password"} value={password} onChange={e => setPassword(e.target.value)}
                    placeholder="••••••••" required autoComplete="current-password"
                    style={fieldInput}
                  />
                  <EyeButton show={showPw} onToggle={() => setShowPw(v => !v)} />
                </div>
              </label>
            </div>
            <div style={{ textAlign: "right", marginTop: 12 }}>
              <Link href="/forgot-password" style={{ fontSize: 13, color: "var(--plum)", textDecoration: "none" }}>Forgot password?</Link>
            </div>
            <button type="submit" disabled={loading} style={{ ...pillPrimary, marginTop: 24, opacity: loading ? 0.7 : 1, cursor: loading ? "not-allowed" : "pointer" }}>
              {loading && (
                <div style={{ width: 15, height: 15, borderRadius: "50%", border: "2px solid color-mix(in srgb, var(--cream) 30%, transparent)", borderTopColor: "var(--cream)", animation: "spin 0.7s linear infinite", flexShrink: 0 }} />
              )}
              {loading ? "Signing in…" : "Sign in"}
            </button>
          </form>
          <div style={{ marginTop: 12 }}>{createAccount}</div>
        </div>
      )}
    </div>
    </>
  )
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginContent />
    </Suspense>
  )
}
