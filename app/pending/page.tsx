"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { createClient } from "@/lib/supabase"
import { getMinistryCodes } from "@/app/actions/ministry"

export default function PendingPage() {
  const [ministryName, setMinistryName] = useState<string | null>(null)
  // Ministry status drives the page variant: 'pending' (default) shows the
  // under-review copy + codes; 'rejected' and any other non-active status get
  // their own explanation + CTAs (proxy routes those users here too).
  const [status, setStatus] = useState<string>("pending")
  const [inviteCode, setInviteCode] = useState<string | null>(null)
  const [staffCode, setStaffCode] = useState<string | null>(null)
  const [copied, setCopied] = useState<"member" | "staff" | null>(null)
  const [checking, setChecking] = useState(false)

  useEffect(() => {
    async function load() {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      const { data: profile } = await supabase
        .from("profiles")
        .select("ministry_id")
        .eq("id", user.id)
        .maybeSingle()

      if (!profile?.ministry_id) return

      const { data: ministry } = await supabase
        .from("ministries")
        .select("name, status")
        .eq("id", profile.ministry_id)
        .maybeSingle()

      if (ministry?.name) setMinistryName(ministry.name)
      if (ministry?.status) setStatus(ministry.status)

      // Fetch the REAL invite codes so the founder can prepare to share them.
      // Pending only — rejected/archived ministries have nothing to share.
      // Fails silently — if codes can't load, the section simply doesn't render.
      if ((ministry?.status ?? "pending") === "pending") {
        try {
          const { inviteCode: mCode, staffInviteCode: sCode } = await getMinistryCodes(profile.ministry_id)
          if (mCode) setInviteCode(mCode)
          if (sCode) setStaffCode(sCode)
        } catch {
          // ignore — don't break the page
        }
      }
    }
    load()
  }, [])

  async function copyCode(code: string, which: "member" | "staff") {
    try {
      await navigator.clipboard.writeText(code)
      setCopied(which)
      setTimeout(() => setCopied(c => (c === which ? null : c)), 1600)
    } catch {
      // clipboard unavailable — no-op
    }
  }

  async function checkStatus() {
    setChecking(true)
    // Reload — middleware will redirect to /home if now approved
    window.location.reload()
  }

  async function signOut() {
    const supabase = createClient()
    await supabase.auth.signOut()
    window.location.href = "/landing"
  }

  return (
    <div className="min-h-screen bg-[var(--cream-panel)] flex items-center justify-center px-6 py-12">
      <div className="w-full max-w-[390px] flex flex-col items-center text-center">

        {/* Logo */}
        <Link href="/" aria-label="Central — home" className="inline-flex items-center gap-2.5 mb-10 transition-opacity hover:opacity-70" style={{ textDecoration: "none", color: "inherit" }}>
          <svg width="32" height="32" viewBox="0 0 100 100" fill="none">
            <path d="M70 28 A32 32 0 1 0 70 72" stroke="var(--plum)" strokeWidth="8" strokeLinecap="round" />
            <circle cx="50" cy="50" r="6" fill="var(--plum)" />
          </svg>
          <span style={{ fontFamily: "var(--font-instrument-serif)", fontSize: "36px", color: "var(--ink)", letterSpacing: "-0.01em", lineHeight: 1 }}>
            Central
          </span>
        </Link>

        {/* Status icon */}
        <div className="w-16 h-16 rounded-full bg-[#3E1540]/10 flex items-center justify-center mb-6">
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="var(--plum)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="10" />
            <line x1="12" y1="8" x2="12" y2="12" />
            <line x1="12" y1="16" x2="12.01" y2="16" />
          </svg>
        </div>

        <h1 style={{ fontFamily: "var(--font-instrument-serif)", fontSize: "26px", color: "var(--ink)", fontWeight: 400, marginBottom: 8 }}>
          {status === "rejected"
            ? "Your registration wasn’t approved"
            : status !== "pending"
            ? "This ministry is no longer active"
            : "Application under review"}
        </h1>

        {ministryName && (
          <p className="text-[14px] font-semibold text-[var(--plum)] mb-3">{ministryName}</p>
        )}

        <p className="text-[14px] text-[var(--body)] leading-relaxed mb-8 max-w-[300px]">
          {status === "rejected"
            ? "If you think this was a mistake, reach out below — or you can browse existing ministries, or register again."
            : status !== "pending"
            ? "You can browse existing ministries to find a new home, or reach out below with any questions."
            : <>We&apos;ve received your ministry application and will review it within 24–48 hours. You&apos;ll gain full access once approved.</>}
        </p>

        {/* Real invite codes — founder can prepare to share them ahead of approval.
            Renders only when at least the member code loaded (fails silently). */}
        {inviteCode && (
          <div
            style={{
              width: "100%",
              border: "1px solid var(--line)",
              borderRadius: 14,
              background: "var(--cream)",
              padding: 18,
              marginBottom: 32,
              textAlign: "left",
            }}
          >
            <div
              style={{
                fontFamily: "var(--mono)",
                fontSize: 11,
                letterSpacing: "0.13em",
                textTransform: "uppercase",
                color: "var(--muted-text)",
                marginBottom: 14,
              }}
            >
              Your invite codes
            </div>

            {/* Member code — prominent */}
            <button
              type="button"
              onClick={() => copyCode(inviteCode, "member")}
              style={{
                width: "100%",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: 12,
                padding: "13px 15px",
                border: "1px solid var(--line)",
                borderRadius: 10,
                background: "var(--cream)",
                cursor: "pointer",
                textAlign: "left",
              }}
            >
              <span>
                <span style={{ display: "block", fontSize: 11, color: "var(--muted-text)", marginBottom: 3 }}>Member code</span>
                <span style={{ fontFamily: "var(--mono)", fontSize: 20, letterSpacing: "2px", color: "var(--ink)" }}>{inviteCode}</span>
              </span>
              <span style={{ fontSize: 12, fontWeight: 500, color: "var(--plum)", flexShrink: 0 }}>
                {copied === "member" ? "Copied" : "Copy"}
              </span>
            </button>

            {/* Staff code — secondary */}
            {staffCode && (
              <button
                type="button"
                onClick={() => copyCode(staffCode, "staff")}
                style={{
                  width: "100%",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: 12,
                  padding: "11px 15px",
                  marginTop: 10,
                  border: "1px solid var(--line)",
                  borderRadius: 10,
                  background: "var(--cream)",
                  cursor: "pointer",
                  textAlign: "left",
                }}
              >
                <span>
                  <span style={{ display: "block", fontSize: 11, color: "var(--muted-text)", marginBottom: 3 }}>Staff code</span>
                  <span style={{ fontFamily: "var(--mono)", fontSize: 15, letterSpacing: "2px", color: "var(--muted-text)" }}>{staffCode}</span>
                </span>
                <span style={{ fontSize: 12, fontWeight: 500, color: "var(--plum)", flexShrink: 0 }}>
                  {copied === "staff" ? "Copied" : "Copy"}
                </span>
              </button>
            )}

            <div style={{ fontSize: 12, color: "var(--muted-text)", marginTop: 14, lineHeight: 1.5 }}>
              Share these once you&apos;re approved — codes work as soon as your ministry is active.
            </div>
          </div>
        )}

        <div className="w-full flex flex-col gap-3">
          {status === "pending" ? (
            <>
              <button
                onClick={checkStatus}
                disabled={checking}
                className="w-full py-3.5 rounded-xl bg-[var(--plum)] hover:bg-[var(--plum-2)] disabled:opacity-60 text-[var(--cream-on-dark)] font-bold text-[14px] transition-colors"
              >
                {checking ? "Checking…" : "Check status"}
              </button>

              <button
                onClick={() => window.location.href = "/landing"}
                className="w-full py-3.5 rounded-xl border border-[#E5E0D2] text-[14px] font-semibold text-[var(--body)] hover:border-[#3E1540]/40 hover:text-[var(--plum)] transition-colors"
              >
                Back to home
              </button>
            </>
          ) : (
            <>
              <button
                onClick={() => window.location.href = "/ministries"}
                className="w-full py-3.5 rounded-xl bg-[var(--plum)] hover:bg-[var(--plum-2)] text-[var(--cream-on-dark)] font-bold text-[14px] transition-colors"
              >
                Browse ministries
              </button>

              {status === "rejected" && (
                <button
                  onClick={() => window.location.href = "/register-ministry"}
                  className="w-full py-3.5 rounded-xl border border-[#E5E0D2] text-[14px] font-semibold text-[var(--body)] hover:border-[#3E1540]/40 hover:text-[var(--plum)] transition-colors"
                >
                  Register again
                </button>
              )}
            </>
          )}

          <button
            onClick={signOut}
            className="w-full py-3.5 rounded-xl text-[13px] font-medium text-[var(--muted-text)] hover:text-[var(--plum)] transition-colors"
          >
            Sign out
          </button>
        </div>

        <p className="text-[12px] text-[var(--muted-text)] mt-8">
          Questions?{" "}
          <a href="mailto:brianjeong13@gmail.com" className="text-[var(--plum)] hover:underline">
            Contact us
          </a>
        </p>
      </div>
    </div>
  )
}
