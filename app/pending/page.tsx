"use client"

import { useEffect, useState } from "react"
import { createClient } from "@/lib/supabase"

export default function PendingPage() {
  const [ministryName, setMinistryName] = useState<string | null>(null)
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
        .select("name")
        .eq("id", profile.ministry_id)
        .maybeSingle()

      if (ministry?.name) setMinistryName(ministry.name)
    }
    load()
  }, [])

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
    <div className="min-h-screen bg-[#FBF8F2] flex items-center justify-center px-6 py-12">
      <div className="w-full max-w-[390px] flex flex-col items-center text-center">

        {/* Logo */}
        <div className="flex items-center gap-2.5 mb-10">
          <svg width="32" height="32" viewBox="0 0 100 100" fill="none">
            <circle cx="50" cy="50" r="44" stroke="#3E1540" strokeWidth="6" />
            <rect x="47" y="22" width="6" height="56" fill="#3E1540" />
            <rect x="22" y="47" width="56" height="6" fill="#3E1540" />
          </svg>
          <span style={{ fontFamily: "var(--font-instrument-serif)", fontSize: "36px", color: "#13101A", letterSpacing: "-0.01em", lineHeight: 1 }}>
            Central
          </span>
        </div>

        {/* Status icon */}
        <div className="w-16 h-16 rounded-full bg-[#3E1540]/10 flex items-center justify-center mb-6">
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#3E1540" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="10" />
            <line x1="12" y1="8" x2="12" y2="12" />
            <line x1="12" y1="16" x2="12.01" y2="16" />
          </svg>
        </div>

        <h1 style={{ fontFamily: "var(--font-instrument-serif)", fontSize: "26px", color: "#13101A", fontWeight: 400, marginBottom: 8 }}>
          Application under review
        </h1>

        {ministryName && (
          <p className="text-[14px] font-semibold text-[#3E1540] mb-3">{ministryName}</p>
        )}

        <p className="text-[14px] text-[#5A5466] leading-relaxed mb-8 max-w-[300px]">
          We&apos;ve received your ministry application and will review it within 24–48 hours. You&apos;ll gain full access once approved.
        </p>

        <div className="w-full flex flex-col gap-3">
          <button
            onClick={checkStatus}
            disabled={checking}
            className="w-full py-3.5 rounded-xl bg-[#3E1540] hover:bg-[#2D0F2E] disabled:opacity-60 text-[#F6F4EF] font-bold text-[14px] transition-colors"
          >
            {checking ? "Checking…" : "Check status"}
          </button>

          <button
            onClick={() => window.location.href = "/landing"}
            className="w-full py-3.5 rounded-xl border border-[#E5E0D2] text-[14px] font-semibold text-[#5A5466] hover:border-[#3E1540]/40 hover:text-[#3E1540] transition-colors"
          >
            Back to home
          </button>

          <button
            onClick={signOut}
            className="w-full py-3.5 rounded-xl text-[13px] font-medium text-[#8A8497] hover:text-[#3E1540] transition-colors"
          >
            Sign out
          </button>
        </div>

        <p className="text-[12px] text-[#8A8497] mt-8">
          Questions?{" "}
          <a href="mailto:brianjeong13@gmail.com" className="text-[#3E1540] hover:underline">
            Contact us
          </a>
        </p>
      </div>
    </div>
  )
}
