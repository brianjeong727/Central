"use client"

import { Suspense, useState } from "react"
import { useSearchParams } from "next/navigation"
import Link from "next/link"
import { AlertCircle } from "lucide-react"
import { createClient, siteOrigin } from "@/lib/supabase"
import { GoogleIcon, PasswordToggle } from "../shared"

const SERIF = "var(--font-instrument-serif)"

const mono: React.CSSProperties = {
  fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
  fontSize: 11,
  letterSpacing: "0.13em",
  color: "#8A8497",
  textTransform: "uppercase",
}

const GoogleG = () => (
  <svg width={16} height={16} viewBox="0 0 24 24" aria-hidden="true" style={{ flexShrink: 0 }}>
    <path fill="#4285F4" d="M23.06 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h6.2a5.3 5.3 0 01-2.3 3.48v2.9h3.72c2.18-2 3.44-4.96 3.44-8.39z"/>
    <path fill="#34A853" d="M12 23.5c3.1 0 5.7-1.03 7.62-2.79l-3.72-2.89c-1.03.69-2.35 1.1-3.9 1.1-3 0-5.54-2.02-6.45-4.74H1.7v2.98A11.5 11.5 0 0012 23.5z"/>
    <path fill="#FBBC05" d="M5.55 14.18A6.91 6.91 0 015.18 12c0-.76.13-1.5.37-2.18V6.84H1.7A11.5 11.5 0 00.5 12c0 1.86.44 3.62 1.2 5.16l3.85-2.98z"/>
    <path fill="#EA4335" d="M12 5.07c1.69 0 3.2.58 4.4 1.72l3.3-3.3C17.7 1.6 15.1.5 12 .5 7.4.5 3.42 3.14 1.7 6.84l3.85 2.98C6.46 7.1 9 5.07 12 5.07z"/>
  </svg>
)

function LoginContent() {
  const searchParams = useSearchParams()
  const intent = searchParams.get("intent")
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [showPw, setShowPw] = useState(false)
  const [keepSignedIn, setKeepSignedIn] = useState(true)
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

  return (
    <div style={{
      minHeight: "100svh",
      display: "flex",
      flexDirection: "column",
      background: "#FBF8F2",
      fontFamily: "var(--font-inter)",
      color: "#13101A",
      position: "relative",
    }}>
      {/* Faint dot texture fading out at top */}
      <div aria-hidden style={{
        position: "absolute",
        top: 0, left: 0, right: 0,
        height: 320,
        opacity: 0.45,
        pointerEvents: "none",
        backgroundImage: "radial-gradient(rgba(62,21,64,0.10) 1px, transparent 1.4px)",
        backgroundSize: "18px 18px",
        maskImage: "linear-gradient(to bottom, #000 0%, transparent 100%)",
        WebkitMaskImage: "linear-gradient(to bottom, #000 0%, transparent 100%)",
      }}/>

      {/* Top bar */}
      <div style={{
        position: "relative",
        padding: "24px 32px",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        flexWrap: "wrap",
        gap: 12,
      }}>
        {/* Wordmark */}
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{
            width: 32, height: 32, borderRadius: 8,
            background: "#3E1540", color: "#FBF8F2",
            display: "grid", placeItems: "center",
            fontFamily: SERIF, fontSize: 15,
            flexShrink: 0,
          }}>C</span>
          <span style={{ fontFamily: SERIF, fontSize: 22, letterSpacing: "-0.01em", color: "#13101A" }}>
            Central
          </span>
        </div>

        <p style={{ fontSize: 13, color: "#5A5466", margin: 0 }}>
          New to Central?{" "}
          <Link
            href={intent ? `/signup?intent=${intent}` : "/signup"}
            style={{ color: "#2D0F2E", fontWeight: 500, textDecoration: "none" }}
          >
            Create an account
          </Link>
        </p>
      </div>

      {/* Centered form */}
      <div style={{
        position: "relative",
        flex: 1,
        display: "grid",
        placeItems: "center",
        padding: "0 24px 32px",
      }}>
        <div style={{ width: "100%", maxWidth: 420 }}>

          {/* Eyebrow + headline */}
          <div style={{ textAlign: "center", marginBottom: 36 }}>
            <div style={mono}>Sign in · Central</div>
            <h1 style={{
              fontFamily: SERIF,
              fontWeight: 400,
              fontSize: "clamp(40px, 5vw, 56px)",
              letterSpacing: "-0.02em",
              lineHeight: 1.04,
              color: "#13101A",
              margin: "10px 0 12px",
            }}>
              Welcome back.
            </h1>
            <p style={{ fontSize: 15, color: "#5A5466", margin: 0 }}>
              Sign in to continue to your ministry workspace.
            </p>
          </div>

          {/* Form — left-aligned */}
          <div style={{ textAlign: "left", display: "flex", flexDirection: "column", gap: 16 }}>

            {/* Google */}
            <button
              type="button"
              onClick={handleGoogleLogin}
              style={{
                width: "100%",
                padding: "13px 18px",
                borderRadius: 12,
                background: "#FBF8F2",
                border: "1px solid #E2DDCF",
                color: "#13101A",
                fontSize: 15,
                fontWeight: 500,
                fontFamily: "var(--font-inter)",
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: 12,
                transition: "background 150ms",
              }}
              onMouseEnter={e => (e.currentTarget.style.background = "#F4F1E8")}
              onMouseLeave={e => (e.currentTarget.style.background = "#FBF8F2")}
            >
              <GoogleG /> Continue with Google
            </button>

            {/* Divider */}
            <div style={{ display: "flex", alignItems: "center", gap: 14, color: "#A09A8C" }}>
              <span style={{ flex: 1, height: 1, background: "#E8E2D2" }}/>
              <span style={{ ...mono, color: "#A09A8C", textTransform: "lowercase", letterSpacing: "0.06em" }}>or</span>
              <span style={{ flex: 1, height: 1, background: "#E8E2D2" }}/>
            </div>

            {/* Error */}
            {error && (
              <div style={{
                borderRadius: 12,
                background: "rgba(220,38,38,0.08)",
                padding: "10px 14px",
                fontSize: 13,
                color: "#B91C1C",
                fontWeight: 500,
                display: "flex",
                alignItems: "center",
                gap: 8,
              }} role="alert">
                <AlertCircle size={14} style={{ flexShrink: 0 }} />
                {error}
              </div>
            )}

            <form onSubmit={handleLogin} style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              {/* Email field */}
              <label style={{ display: "block" }}>
                <div style={{ ...mono, marginBottom: 8, display: "block" }}>Email</div>
                <div style={{
                  display: "flex", alignItems: "center",
                  background: "#FBF8F2", border: "1px solid #E2DDCF", borderRadius: 10,
                  padding: "0 14px",
                }}>
                  <input
                    type="email"
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                    placeholder="you@example.com"
                    required
                    autoComplete="email"
                    style={{
                      flex: 1, border: "none", outline: "none", background: "transparent",
                      padding: "13px 0",
                      fontFamily: "var(--font-inter)", fontSize: 15, color: "#13101A",
                    }}
                  />
                </div>
              </label>

              {/* Password field */}
              <label style={{ display: "block" }}>
                <div style={{
                  display: "flex", alignItems: "baseline",
                  justifyContent: "space-between", marginBottom: 8,
                }}>
                  <span style={mono}>Password</span>
                  <Link href="/forgot-password" style={{ fontSize: 12, color: "#3E1540", fontWeight: 500, textDecoration: "none" }}>
                    Forgot password?
                  </Link>
                </div>
                <div style={{
                  display: "flex", alignItems: "center",
                  background: "#FBF8F2", border: "1px solid #E2DDCF", borderRadius: 10,
                  padding: "0 14px",
                  position: "relative",
                }}>
                  <input
                    type={showPw ? "text" : "password"}
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    placeholder="••••••••"
                    required
                    autoComplete="current-password"
                    style={{
                      flex: 1, border: "none", outline: "none", background: "transparent",
                      padding: "13px 0",
                      fontFamily: "var(--font-inter)", fontSize: 15, color: "#13101A",
                      paddingRight: 8,
                    }}
                  />
                  <PasswordToggle show={showPw} onToggle={() => setShowPw(v => !v)} />
                </div>
              </label>

              {/* Keep me signed in */}
              <button
                type="button"
                onClick={() => setKeepSignedIn(v => !v)}
                style={{
                  display: "flex", alignItems: "center", gap: 10,
                  background: "none", border: "none", padding: 0, cursor: "pointer",
                  color: "#5A5466", fontSize: 13, fontFamily: "var(--font-inter)",
                  marginTop: 2, textAlign: "left",
                }}
              >
                <span style={{
                  width: 18, height: 18, borderRadius: 5, flexShrink: 0,
                  border: keepSignedIn ? "1.5px solid #3E1540" : "1.5px solid #C8C2B8",
                  background: keepSignedIn ? "#3E1540" : "transparent",
                  display: "grid", placeItems: "center",
                  transition: "all 150ms",
                }}>
                  {keepSignedIn && (
                    <svg width={11} height={11} viewBox="0 0 12 12" fill="none" stroke="#FBF8F2" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="1.5,6.5 4.5,9.5 10.5,2.5"/>
                    </svg>
                  )}
                </span>
                Keep me signed in
              </button>

              {/* Submit */}
              <button
                type="submit"
                disabled={loading}
                style={{
                  width: "100%",
                  padding: "14px 22px",
                  borderRadius: 12,
                  border: "none",
                  background: "#2D0F2E",
                  color: "#FBF8F2",
                  fontSize: 15,
                  fontWeight: 500,
                  fontFamily: "var(--font-inter)",
                  cursor: loading ? "not-allowed" : "pointer",
                  letterSpacing: "0.01em",
                  opacity: loading ? 0.7 : 1,
                  marginTop: 8,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 8,
                  transition: "opacity 150ms",
                }}
              >
                {loading && <div style={{ width: 15, height: 15, borderRadius: "50%", border: "2px solid rgba(246,244,239,0.3)", borderTopColor: "#FBF8F2", animation: "spin 0.7s linear infinite", flexShrink: 0 }} />}
                {loading ? "Signing in…" : "Sign in"}
              </button>
            </form>
          </div>
        </div>
      </div>

      {/* Footer — verse + legal */}
      <div style={{
        position: "relative",
        padding: "20px 32px 28px",
        borderTop: "1px solid #E8E2D2",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 24,
        flexWrap: "wrap",
      }}>
        <div style={{
          fontFamily: SERIF,
          fontStyle: "italic",
          fontSize: 15,
          color: "#2D0F2E",
          lineHeight: 1.4,
          maxWidth: 540,
        }}>
          &ldquo;For where two or three gather in my name, there am I with them.&rdquo;
          <span style={{ ...mono, marginLeft: 12, position: "relative", top: -2, fontStyle: "normal" }}>
            Matt 18 : 20
          </span>
        </div>
        <div style={{ fontSize: 12, color: "#A09A8C", whiteSpace: "nowrap" }}>
          © Central&nbsp;·&nbsp;
          <a href="#" style={{ color: "#5A5466", textDecoration: "none" }}>Terms</a>
          {" · "}
          <a href="#" style={{ color: "#5A5466", textDecoration: "none" }}>Privacy</a>
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
