"use client"

import { useState } from "react"
import Link from "next/link"
import { AlertCircle, CheckCircle2 } from "lucide-react"
import { createClient, siteOrigin } from "@/lib/supabase"
import { SplitShell } from "@/app/(auth)/shared"

const SERIF = "var(--font-instrument-serif)"
const SANS  = "var(--font-inter)"

const mono: React.CSSProperties = {
  fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
  fontSize: 11, letterSpacing: "0.13em", color: "var(--muted-text)", textTransform: "uppercase",
}
const serif: React.CSSProperties = { fontFamily: SERIF, fontWeight: 400, color: "var(--ink)", margin: 0 }

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
    <SplitShell topBar={<>
      <Link href="/login" style={{
        display: "inline-flex", alignItems: "center", gap: 8,
        color: "var(--body)", textDecoration: "none", marginRight: "auto", fontSize: 14,
      }}>
        <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d="M19 12H5M12 19l-7-7 7-7"/>
        </svg>
        Back to sign in
      </Link>
    </>}>
      <div style={mono}>Reset password · Central</div>
      <h1 style={{ ...serif, fontSize: 44, lineHeight: 1.03, letterSpacing: "-0.02em", margin: "14px 0 0" }}>
        Reset your password.
      </h1>
      <p style={{ fontSize: 16, color: "var(--body)", lineHeight: 1.6, margin: "16px 0 0" }}>
        We&apos;ll send a reset link to your email.
      </p>

      {sent ? (
        <div style={{ marginTop: 30, display: "flex", flexDirection: "column", alignItems: "flex-start", gap: 12 }}>
          <div style={{ width: 44, height: 44, borderRadius: "50%", background: "rgba(127,166,127,0.15)", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <CheckCircle2 size={22} color="var(--success)" />
          </div>
          <p style={{ fontSize: 16, fontWeight: 500, color: "var(--ink)", margin: 0 }}>Check your inbox</p>
          <p style={{ fontSize: 14, color: "var(--muted-text)", lineHeight: 1.55, margin: 0 }}>
            We sent a password reset link to <strong style={{ color: "var(--ink)" }}>{email}</strong>. Check your spam folder if it doesn&apos;t arrive within a minute.
          </p>
        </div>
      ) : (
        <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 22, marginTop: 30 }}>
          {error && (
            <div style={{
              borderRadius: 10, background: "rgba(159,48,48,0.08)", border: "1px solid rgba(159,48,48,0.15)",
              padding: "10px 14px", fontSize: 13, color: "var(--danger)", fontWeight: 500,
              display: "flex", alignItems: "center", gap: 8,
            }} role="alert">
              <AlertCircle size={14} style={{ flexShrink: 0 }} />
              {error}
            </div>
          )}
          <label style={{ display: "block" }}>
            <div style={{ ...mono, marginBottom: 8 }}>Email</div>
            <div style={{ display: "flex", alignItems: "center", background: "var(--cream-panel)", border: "1px solid var(--line-2)", borderRadius: 10, padding: "0 14px" }}>
              <input
                type="email" value={email} onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com" required autoComplete="email"
                style={{ flex: 1, border: "none", outline: "none", background: "transparent", padding: "13px 0", fontFamily: SANS, fontSize: 15, color: "var(--ink)" }}
              />
            </div>
          </label>
          <button
            type="submit" disabled={loading}
            style={{
              width: "100%", padding: "15px", border: "none", borderRadius: 10,
              background: "var(--plum-2)", color: "var(--cream-panel)",
              fontFamily: SANS, fontSize: 15, fontWeight: 500,
              cursor: loading ? "not-allowed" : "pointer", opacity: loading ? 0.75 : 1,
              display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
              transition: "opacity .12s", marginTop: 6,
            }}
          >
            {loading && <div style={{ width: 15, height: 15, borderRadius: "50%", border: "2px solid rgba(251,248,242,0.3)", borderTopColor: "var(--cream-panel)", animation: "spin 0.7s linear infinite", flexShrink: 0 }} />}
            {loading ? "Sending…" : "Send reset link"}
          </button>
          <p style={{ textAlign: "center", fontSize: 13, color: "var(--muted-text)", marginTop: 4 }}>
            Remember your password?{" "}
            <Link href="/login" style={{ fontWeight: 500, color: "var(--plum-2)", textDecoration: "none" }} className="hover:underline underline-offset-2">
              Sign in
            </Link>
          </p>
        </form>
      )}
    </SplitShell>
  )
}
