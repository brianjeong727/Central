"use client"

import { useState } from "react"
import { AlertCircle } from "lucide-react"
import { createClient } from "@/lib/supabase"
import { RingCrossLogo } from "@/app/home/components/shared"
import { EyeButton } from "../shared"

const SERIF = "var(--font-instrument-serif)"

const inputClass = "w-full px-4 py-3 rounded-xl border border-[#ECE8DE] bg-[#FBF8F2] text-[14px] text-[#13101A] placeholder:text-[#C4C4C4] focus:outline-none focus:ring-2 focus:ring-[#3E1540]/20 focus:border-[#3E1540]/40 transition-all"

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

  return (
    <div style={{ minHeight: "100svh", display: "flex", fontFamily: "var(--font-inter)" }}>

      {/* ── Left brand panel (desktop only) ── */}
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

          <div className="hidden md:block" style={{ marginBottom: 32 }}>
            <h1 style={{ fontFamily: SERIF, fontSize: 36, fontWeight: 400, color: "#13101A", letterSpacing: "-0.02em", lineHeight: 1.1, margin: "0 0 6px" }}>
              Set a new password
            </h1>
            <p style={{ fontSize: 14, color: "#8A8497" }}>Choose something you&apos;ll remember.</p>
          </div>

          <div style={{ background: "#fff", borderRadius: 20, border: "1px solid #E8E2D2", padding: "28px 28px 24px", boxShadow: "0 2px 12px rgba(19,16,26,0.07)" }}>

            <div className="md:hidden" style={{ marginBottom: 20 }}>
              <h2 style={{ fontFamily: SERIF, fontSize: 26, fontWeight: 400, color: "#13101A", margin: "0 0 3px" }}>Set a new password</h2>
              <p style={{ fontSize: 13, color: "#8A8497" }}>Choose something you&apos;ll remember.</p>
            </div>

            <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              {error && (
                <div style={{ borderRadius: 12, background: "rgba(220,38,38,0.08)", padding: "10px 14px", fontSize: 13, color: "#B91C1C", fontWeight: 500, display: "flex", alignItems: "center", gap: 8 }}>
                  <AlertCircle size={14} style={{ flexShrink: 0 }} />
                  {error}
                </div>
              )}

              <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
                <label style={{ fontSize: 12, fontWeight: 600, color: "#5A5466", letterSpacing: "0.02em" }}>New password</label>
                <div style={{ position: "relative" }}>
                  <input
                    type={showPw ? "text" : "password"}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    required
                    autoComplete="new-password"
                    className={inputClass + " pr-10"}
                  />
                  <div style={{ position: "absolute", right: 8, top: "50%", transform: "translateY(-50%)" }}>
                    <EyeButton show={showPw} onToggle={() => setShowPw((v) => !v)} />
                  </div>
                </div>
                <p style={{ fontSize: 11, color: "#8A8497", marginTop: 2 }}>At least 6 characters</p>
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
                <label style={{ fontSize: 12, fontWeight: 600, color: "#5A5466", letterSpacing: "0.02em" }}>Confirm password</label>
                <div style={{ position: "relative" }}>
                  <input
                    type={showConfirm ? "text" : "password"}
                    value={confirm}
                    onChange={(e) => setConfirm(e.target.value)}
                    placeholder="••••••••"
                    required
                    autoComplete="new-password"
                    className={inputClass + " pr-10"}
                  />
                  <div style={{ position: "absolute", right: 8, top: "50%", transform: "translateY(-50%)" }}>
                    <EyeButton show={showConfirm} onToggle={() => setShowConfirm((v) => !v)} />
                  </div>
                </div>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full bg-[#3E1540] hover:bg-[#2D0F2E] disabled:opacity-50 text-white font-semibold py-3.5 rounded-xl active:scale-[0.97] transition-[transform,background-color] duration-150 text-[14px]"
                style={{ marginTop: 4 }}
              >
                {loading ? "Updating…" : "Update password"}
              </button>
            </form>
          </div>
        </div>
      </div>
    </div>
  )
}
