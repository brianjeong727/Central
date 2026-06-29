"use client"

import { useState } from "react"
import Link from "next/link"
import { AlertCircle, CheckCircle2 } from "lucide-react"
import { createClient, siteOrigin } from "@/lib/supabase"
import { RingCrossLogo } from "@/app/home/components/shared"

const SERIF = "var(--font-instrument-serif)"

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("")
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [sent, setSent] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError(null)
    const supabase = createClient()
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: siteOrigin() + "/update-password",
    })
    if (error) {
      setError(error.message)
      setLoading(false)
      return
    }
    setSent(true)
    setLoading(false)
  }

  return (
    <div style={{ minHeight: "100svh", display: "flex", fontFamily: "var(--font-inter)" }}>

      {/* ── Left brand panel (desktop only) ── */}
      <div className="hidden md:flex" style={{
        width: "42%", flexShrink: 0, background: "var(--plum)",
        flexDirection: "column", justifyContent: "space-between",
        padding: "52px 56px", position: "relative", overflow: "hidden",
      }}>
        <div aria-hidden style={{ position: "absolute", inset: 0, backgroundImage: "radial-gradient(circle, rgba(246,244,239,0.1) 1px, transparent 1px)", backgroundSize: "22px 22px", pointerEvents: "none" }} />
        <div aria-hidden style={{ position: "absolute", inset: 0, background: "radial-gradient(circle at 80% 20%, rgba(246,244,239,0.07) 0%, transparent 50%)", pointerEvents: "none" }} />

        <Link href="/" aria-label="Central — home" className="transition-opacity hover:opacity-70" style={{ display: "inline-flex", alignItems: "center", gap: 10, position: "relative", textDecoration: "none", color: "inherit" }}>
          <RingCrossLogo size={26} color="#F6F4EF" />
          <span style={{ fontFamily: SERIF, fontSize: 22, color: "#F6F4EF", letterSpacing: "-0.01em" }}>Central</span>
        </Link>

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
          <Link href="/" aria-label="Central — home" className="transition-opacity hover:opacity-70" style={{ display: "inline-flex", alignItems: "center", gap: 10, marginBottom: 6, textDecoration: "none", color: "inherit" }}>
            <RingCrossLogo size={28} color="var(--plum)" />
            <span style={{ fontFamily: SERIF, fontSize: 32, color: "var(--ink)", letterSpacing: "-0.01em" }}>Central</span>
          </Link>
          <p style={{ fontSize: 13, color: "var(--muted-text)" }}>College ministry community</p>
        </div>

        <div style={{ width: "100%", maxWidth: 400 }}>

          <div className="hidden md:block" style={{ marginBottom: 32 }}>
            <h1 style={{ fontFamily: SERIF, fontSize: 36, fontWeight: 400, color: "var(--ink)", letterSpacing: "-0.02em", lineHeight: 1.1, margin: "0 0 6px" }}>
              Reset your password
            </h1>
            <p style={{ fontSize: 14, color: "var(--muted-text)" }}>We&apos;ll send a reset link to your email.</p>
          </div>

          <div style={{ background: "#fff", borderRadius: 20, border: "1px solid var(--line)", padding: "28px 28px 24px", boxShadow: "0 2px 12px rgba(19,16,26,0.07)" }}>

            <div className="md:hidden" style={{ marginBottom: 20 }}>
              <h2 style={{ fontFamily: SERIF, fontSize: 26, fontWeight: 400, color: "var(--ink)", margin: "0 0 3px" }}>Reset your password</h2>
              <p style={{ fontSize: 13, color: "var(--muted-text)" }}>We&apos;ll send a reset link to your email.</p>
            </div>

            {sent ? (
              <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 12, padding: "8px 0 4px", textAlign: "center" }}>
                <div style={{ width: 44, height: 44, borderRadius: "50%", background: "rgba(34,197,94,0.1)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <CheckCircle2 size={22} color="#16a34a" />
                </div>
                <p style={{ fontSize: 15, fontWeight: 600, color: "var(--ink)", margin: 0 }}>Check your inbox</p>
                <p style={{ fontSize: 13, color: "var(--muted-text)", lineHeight: 1.5, margin: 0 }}>
                  We sent a password reset link to <strong style={{ color: "var(--ink)" }}>{email}</strong>. Check your spam folder if it doesn&apos;t arrive within a minute.
                </p>
              </div>
            ) : (
              <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                {error && (
                  <div style={{ borderRadius: 12, background: "rgba(220,38,38,0.08)", padding: "10px 14px", fontSize: 13, color: "#B91C1C", fontWeight: 500, display: "flex", alignItems: "center", gap: 8 }}>
                    <AlertCircle size={14} style={{ flexShrink: 0 }} />
                    {error}
                  </div>
                )}

                <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
                  <label style={{ fontSize: 12, fontWeight: 600, color: "var(--body)", letterSpacing: "0.02em" }}>Email</label>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@example.com"
                    required
                    autoComplete="email"
                    className="w-full px-4 py-3 rounded-xl border border-[var(--line)] bg-[#FBF8F2] text-[14px] text-[var(--ink)] placeholder:text-[#C4C4C4] focus:outline-none focus:ring-2 focus:ring-[#3E1540]/20 focus:border-[#3E1540]/40 transition-all"
                  />
                </div>

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full bg-[var(--plum)] hover:bg-[var(--plum-2)] disabled:opacity-50 text-white font-semibold py-3.5 rounded-xl active:scale-[0.97] transition-[transform,background-color] duration-150 text-[14px]"
                  style={{ marginTop: 4 }}
                >
                  {loading ? "Sending…" : "Send reset link"}
                </button>
              </form>
            )}
          </div>

          <p style={{ textAlign: "center", fontSize: 13, color: "var(--muted-text)", marginTop: 20 }}>
            Remember your password?{" "}
            <Link href="/login" style={{ fontWeight: 600, color: "var(--plum)", textDecoration: "none" }} className="hover:underline underline-offset-2">
              Sign in
            </Link>
          </p>
        </div>
      </div>
    </div>
  )
}
