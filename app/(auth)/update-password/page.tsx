"use client"

import { useState } from "react"
import Link from "next/link"
import { AlertCircle } from "lucide-react"
import { createClient } from "@/lib/supabase"
import { SplitShell, EyeButton, PocketAuthScreen, PocketBack, PocketField, PocketSubmit, PocketError,
  pocketH1, pocketSub } from "@/app/(auth)/shared"
import { EYEBROW_STYLE as mono } from "@/components/central/typography"
import { CentralButton } from "@/components/central"

const SERIF = "var(--font-instrument-serif)"
const SANS  = "var(--font-inter)"
const serif: React.CSSProperties = { fontFamily: SERIF, fontWeight: 400, color: "var(--ink)", margin: 0 }

export default function UpdatePasswordPage() {
  const [password, setPassword] = useState("")
  const [confirm, setConfirm] = useState("")
  const [showPw, setShowPw] = useState(false)
  const [showConfirm, setShowConfirm] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (password !== confirm) {
      setError("Passwords don't match.")
      return
    }
    if (password.length < 6) {
      setError("Password must be at least 6 characters.")
      return
    }
    setLoading(true)
    setError(null)
    const supabase = createClient()
    const { error } = await supabase.auth.updateUser({ password })
    if (error) {
      setError(error.message)
      setLoading(false)
      return
    }
    window.location.assign("/login")
  }

  return (<>
    {/* ── Desktop ── */}
    <div className="hidden md:block">
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
      <div style={mono}>New password · Central</div>
      <h1 style={{ ...serif, fontSize: 44, lineHeight: 1.03, letterSpacing: "-0.02em", margin: "14px 0 0" }}>
        Set a new password.
      </h1>
      <p style={{ fontSize: 16, color: "var(--body)", lineHeight: 1.6, margin: "16px 0 0" }}>
        Choose something you&apos;ll remember.
      </p>

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
          <div style={{ ...mono, marginBottom: 8 }}>New password</div>
          <div style={{ display: "flex", alignItems: "center", background: "var(--cream-panel)", border: "1px solid var(--line-2)", borderRadius: 10, padding: "0 14px" }}>
            <input
              type={showPw ? "text" : "password"} value={password} onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••" required autoComplete="new-password"
              style={{ flex: 1, border: "none", outline: "none", background: "transparent", padding: "13px 0", fontFamily: SANS, fontSize: 15, color: "var(--ink)" }}
            />
            <EyeButton show={showPw} onToggle={() => setShowPw((v) => !v)} />
          </div>
          <p style={{ fontSize: 12, color: "var(--muted-text)", marginTop: 6 }}>At least 6 characters</p>
        </label>
        <label style={{ display: "block" }}>
          <div style={{ ...mono, marginBottom: 8 }}>Confirm password</div>
          <div style={{ display: "flex", alignItems: "center", background: "var(--cream-panel)", border: "1px solid var(--line-2)", borderRadius: 10, padding: "0 14px" }}>
            <input
              type={showConfirm ? "text" : "password"} value={confirm} onChange={(e) => setConfirm(e.target.value)}
              placeholder="••••••••" required autoComplete="new-password"
              style={{ flex: 1, border: "none", outline: "none", background: "transparent", padding: "13px 0", fontFamily: SANS, fontSize: 15, color: "var(--ink)" }}
            />
            <EyeButton show={showConfirm} onToggle={() => setShowConfirm((v) => !v)} />
          </div>
        </label>
        <CentralButton
          type="submit" variant="primary" disabled={loading}
          style={{ width: "100%", padding: "15px", borderRadius: 10, fontSize: 15, marginTop: 6 }}
        >
          {loading && <div style={{ width: 15, height: 15, borderRadius: "50%", border: "2px solid color-mix(in srgb, var(--cream) 30%, transparent)", borderTopColor: "var(--cream-panel)", animation: "spin 0.7s linear infinite", flexShrink: 0 }} />}
          {loading ? "Updating…" : "Update password"}
        </CentralButton>
      </form>
    </SplitShell>
    </div>

    {/* ── Mobile ── */}
    <div className="md:hidden">
      <PocketAuthScreen>
        <PocketBack href="/login" label="Back to sign in" />
        <div style={{ marginTop: 20 }}>
          <div style={mono}>New password</div>
          <h1 style={{ ...pocketH1, marginTop: 8 }}>Set a new password.</h1>
        </div>
        <p style={{ ...pocketSub, marginTop: 14 }}>Choose something you&apos;ll remember.</p>

        <form onSubmit={handleSubmit} style={{ marginTop: 26 }}>
          {error && <PocketError msg={error}/>}
          <div style={{ display: "flex", flexDirection: "column", gap: 16, marginTop: error ? 16 : 0 }}>
            <PocketField label="New password" type={showPw ? "text" : "password"} placeholder="••••••••" value={password} onChange={(e) => setPassword(e.target.value)} required autoComplete="new-password"
              hint="At least 6 characters." trailing={<EyeButton show={showPw} onToggle={() => setShowPw((v) => !v)} />}/>
            <PocketField label="Confirm password" type={showConfirm ? "text" : "password"} placeholder="••••••••" value={confirm} onChange={(e) => setConfirm(e.target.value)} required autoComplete="new-password"
              trailing={<EyeButton show={showConfirm} onToggle={() => setShowConfirm((v) => !v)} />}/>
          </div>
          <PocketSubmit loading={loading} disabled={loading}>
            {loading ? "Updating…" : "Update password"}
          </PocketSubmit>
        </form>
      </PocketAuthScreen>
    </div>
  </>)
}
