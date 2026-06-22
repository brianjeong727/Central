"use client"

import { Suspense, useState } from "react"
import { useSearchParams } from "next/navigation"
import Link from "next/link"
import { AlertCircle } from "lucide-react"
import { createClient, siteOrigin } from "@/lib/supabase"

const SERIF = "var(--font-instrument-serif)"
const SANS  = "var(--font-inter)"

const mono: React.CSSProperties = {
  fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
  fontSize: 11,
  letterSpacing: "0.13em",
  color: "#8A8497",
  textTransform: "uppercase",
}

const serif: React.CSSProperties = { fontFamily: SERIF, fontWeight: 400, color: "#13101A", margin: 0 }

// ── Photo panel ─────────────────────────────────────────────────
function PhotoPanel() {
  return (
    <div className="hidden md:flex" style={{
      width: "44%", minWidth: 440, position: "relative", flexShrink: 0,
      overflow: "hidden", background: "#1E0A20", color: "#FBF8F2",
      padding: "44px 56px", flexDirection: "column", justifyContent: "space-between",
    }}>
      <img src="/chapel.jpg" alt="" style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" }} />
      <div aria-hidden style={{
        position: "absolute", inset: 0, pointerEvents: "none",
        background: "linear-gradient(155deg, rgba(27,10,30,0.62) 0%, rgba(45,15,46,0.80) 58%, rgba(27,10,30,0.96) 100%)",
      }}/>
      <div aria-hidden style={{
        position: "absolute", inset: 0, opacity: 0.12, pointerEvents: "none",
        background: "radial-gradient(rgba(251,248,242,0.6) 1px, transparent 1.4px) 0 0 / 14px 14px",
      }}/>
      {/* Brand */}
      <div style={{ position: "relative", display: "flex", alignItems: "center", gap: 11 }}>
        <span style={{
          width: 36, height: 36, borderRadius: 10, display: "grid", placeItems: "center", flexShrink: 0,
          background: "rgba(253,252,248,0.12)", border: "1px solid rgba(253,252,248,0.22)",
        }}>
          <svg width="20" height="20" viewBox="0 0 100 100" fill="none">
            <circle cx="50" cy="50" r="44" stroke="#F1ECDE" strokeWidth="7"/>
            <rect x="46" y="20" width="8" height="60" fill="#F1ECDE"/>
            <rect x="20" y="46" width="60" height="8" fill="#F1ECDE"/>
          </svg>
        </span>
        <span style={{ fontFamily: SERIF, fontSize: 22, letterSpacing: "-0.01em", color: "#FBF8F2" }}>Central</span>
      </div>
      {/* Tagline + verse */}
      <div style={{ position: "relative" }}>
        <div style={{ fontFamily: SERIF, fontWeight: 600, fontSize: 46, lineHeight: 1.03, letterSpacing: "-0.02em", color: "#FBF8F2" }}>
          Your ministry,<br/>all in one place.
        </div>
        <div style={{ marginTop: 26, maxWidth: 360 }}>
          <div style={{ fontFamily: SERIF, fontStyle: "italic", fontSize: 18, lineHeight: 1.5, color: "rgba(253,252,248,0.92)" }}>
            &ldquo;And let us consider how to stir up one another to love and good works.&rdquo;
          </div>
          <div style={{ ...mono, marginTop: 12, color: "rgba(253,252,248,0.60)" }}>Hebrews 10 : 24</div>
        </div>
      </div>
    </div>
  )
}

// ── Mobile wordmark ─────────────────────────────────────────────
function Wordmark() {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
      <span style={{
        width: 32, height: 32, borderRadius: 8, background: "#3E1540",
        color: "#FBF8F2", display: "grid", placeItems: "center",
        fontFamily: SERIF, fontSize: 15, flexShrink: 0,
      }}>C</span>
      <span style={{ fontFamily: SERIF, fontSize: 22, letterSpacing: "-0.01em", color: "#13101A" }}>Central</span>
    </div>
  )
}

// ── Google button ───────────────────────────────────────────────
function GoogleButton({ onClick }: { onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} style={{
      width: "100%", padding: "13px 18px", borderRadius: 12,
      background: "#FBF8F2", border: "1px solid #E2DDCF", color: "#13101A",
      fontSize: 15, fontWeight: 500, fontFamily: SANS, cursor: "pointer",
      display: "flex", alignItems: "center", justifyContent: "center", gap: 12,
      transition: "background .15s",
    }} className="hover:bg-[#F1ECDE]">
      <svg width={16} height={16} viewBox="0 0 24 24" aria-hidden style={{ flexShrink: 0 }}>
        <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.27-4.74 3.27-8.1z"/>
        <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84A11 11 0 0 0 12 23z"/>
        <path fill="#FBBC05" d="M5.84 14.1a6.6 6.6 0 0 1 0-4.2V7.06H2.18a11 11 0 0 0 0 9.88l3.66-2.84z"/>
        <path fill="#EA4335" d="M12 4.75c1.61 0 3.06.55 4.2 1.64l3.15-3.15A11 11 0 0 0 12 .98 11 11 0 0 0 2.18 7.06l3.66 2.84C6.71 6.68 9.14 4.75 12 4.75z"/>
      </svg>
      Continue with Google
    </button>
  )
}

// ── OR divider ──────────────────────────────────────────────────
function OrDivider() {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 16, margin: "22px 0", color: "#A09A8C" }}>
      <span style={{ flex: 1, height: 1, background: "#E8E2D2" }}/>
      <span style={{ ...mono, color: "#A09A8C", textTransform: "lowercase", letterSpacing: "0.06em" }}>or</span>
      <span style={{ flex: 1, height: 1, background: "#E8E2D2" }}/>
    </div>
  )
}

// ── Eye toggle ──────────────────────────────────────────────────
function EyeButton({ show, onToggle }: { show: boolean; onToggle: () => void }) {
  return (
    <button type="button" onClick={onToggle} aria-label={show ? "Hide password" : "Show password"}
      style={{ background: "transparent", border: "none", cursor: "pointer", padding: 4, color: "#8A8497", display: "grid", placeItems: "center", marginRight: -4, flexShrink: 0 }}>
      {show
        ? <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0112 20c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19M1 1l22 22"/></svg>
        : <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8S1 12 1 12z"/><circle cx="12" cy="12" r="3"/></svg>
      }
    </button>
  )
}

function LoginContent() {
  const searchParams = useSearchParams()
  const intent = searchParams.get("intent")
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [showPw, setShowPw] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError(null)

    const supabase = createClient()
    const { error } = await supabase.auth.signInWithPassword({ email, password })

    if (error) {
      if (error.message.toLowerCase().includes("email not confirmed")) {
        setError("This account's email isn't confirmed. Please sign up again to create a new account.")
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

  const backHref = intent ? `/signup?intent=${intent}` : "/signup"

  return (
    <div style={{ display: "flex", height: "100svh", overflow: "hidden", background: "#FBF8F2", fontFamily: SANS, color: "#13101A" }}>
      <PhotoPanel />

      <div style={{ flex: 1, overflowY: "auto", display: "flex", flexDirection: "column" }}>
        {/* Top bar */}
        <div
          className="px-6 md:px-12"
          style={{ display: "flex", alignItems: "center", paddingTop: 26, minHeight: 64, gap: 6, fontSize: 14, color: "#5A5466" }}
        >
          <Link href={backHref} style={{
            display: "inline-flex", alignItems: "center", gap: 8,
            color: "#5A5466", textDecoration: "none", marginRight: "auto", fontSize: 14,
          }}>
            <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="M19 12H5M12 19l-7-7 7-7"/>
            </svg>
            Back
          </Link>
          <span>
            New to Central?{" "}
            <Link href={backHref} style={{ color: "#2D0F2E", fontWeight: 500, textDecoration: "none" }} className="hover:underline underline-offset-2">
              Create an account
            </Link>
          </span>
        </div>

        {/* Form body */}
        <div
          className="px-6 md:px-14"
          style={{ flex: 1, display: "flex", flexDirection: "column", justifyContent: "center", alignItems: "center", padding: "24px 56px 48px" }}
        >
          <div style={{ width: "100%", maxWidth: 460 }}>
            {/* Mobile wordmark */}
            <div className="md:hidden" style={{ marginBottom: 36 }}>
              <Wordmark />
            </div>

            <div style={mono}>Sign in · Central</div>
            <h1 style={{ ...serif, fontSize: 44, lineHeight: 1.03, letterSpacing: "-0.02em", margin: "14px 0 0" }}>
              Welcome back.
            </h1>
            <p style={{ fontSize: 16, color: "#5A5466", lineHeight: 1.6, margin: "16px 0 0" }}>
              Sign in to continue to your ministry workspace.
            </p>

            <div style={{ marginTop: 30 }}>
              <GoogleButton onClick={handleGoogleLogin} />
            </div>

            <OrDivider />

            {error && (
              <div style={{
                borderRadius: 10, background: "rgba(220,38,38,0.08)", border: "1px solid rgba(220,38,38,0.15)",
                padding: "10px 14px", fontSize: 13, color: "#B91C1C", fontWeight: 500,
                display: "flex", alignItems: "flex-start", gap: 8, marginBottom: 18,
              }} role="alert">
                <AlertCircle size={14} style={{ flexShrink: 0, marginTop: 1 }} />
                {error}
              </div>
            )}

            <form onSubmit={handleLogin} style={{ display: "flex", flexDirection: "column", gap: 22 }}>
              {/* Email */}
              <label style={{ display: "block" }}>
                <div style={{ ...mono, marginBottom: 8 }}>Email</div>
                <div style={{ display: "flex", alignItems: "center", background: "#FBF8F2", border: "1px solid #E2DDCF", borderRadius: 10, padding: "0 14px" }}>
                  <input
                    type="email" value={email} onChange={e => setEmail(e.target.value)}
                    placeholder="you@university.edu" required autoComplete="email"
                    style={{
                      flex: 1, border: "none", outline: "none", background: "transparent",
                      padding: "13px 0", fontFamily: SANS, fontSize: 15, color: "#13101A",
                    }}
                  />
                </div>
              </label>

              {/* Password */}
              <label style={{ display: "block" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 8 }}>
                  <span style={mono}>Password</span>
                  <Link href="/forgot-password" style={{ fontSize: 13, color: "#2D0F2E", fontWeight: 500, textDecoration: "none" }} className="hover:underline underline-offset-2">
                    Forgot password?
                  </Link>
                </div>
                <div style={{ display: "flex", alignItems: "center", background: "#FBF8F2", border: "1px solid #E2DDCF", borderRadius: 10, padding: "0 14px" }}>
                  <input
                    type={showPw ? "text" : "password"} value={password} onChange={e => setPassword(e.target.value)}
                    placeholder="••••••••" required autoComplete="current-password"
                    style={{
                      flex: 1, border: "none", outline: "none", background: "transparent",
                      padding: "13px 0", fontFamily: SANS, fontSize: 15, color: "#13101A",
                    }}
                  />
                  <EyeButton show={showPw} onToggle={() => setShowPw(v => !v)} />
                </div>
              </label>

              {/* Submit */}
              <button
                type="submit" disabled={loading}
                style={{
                  width: "100%", padding: "15px", border: "none", borderRadius: 10,
                  background: "#2D0F2E", color: "#FBF8F2",
                  fontFamily: SANS, fontSize: 15, fontWeight: 500,
                  cursor: loading ? "not-allowed" : "pointer",
                  opacity: loading ? 0.75 : 1,
                  display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
                  transition: "opacity .12s",
                  marginTop: 6,
                }}
              >
                {loading && (
                  <div style={{ width: 15, height: 15, borderRadius: "50%", border: "2px solid rgba(251,248,242,0.3)", borderTopColor: "#FBF8F2", animation: "spin 0.7s linear infinite", flexShrink: 0 }} />
                )}
                {loading ? "Signing in…" : "Sign in"}
              </button>
            </form>
          </div>
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
