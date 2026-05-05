"use client"

import { Suspense, useState } from "react"
import Link from "next/link"
import { ArrowLeft } from "lucide-react"
import { joinMinistryByCode } from "@/app/actions/ministry"

const Logo = () => (
  <div className="flex items-center gap-2.5">
    <svg width="32" height="32" viewBox="0 0 100 100" fill="none">
      <circle cx="50" cy="50" r="44" stroke="#3E1540" strokeWidth="6" />
      <rect x="47" y="22" width="6" height="56" fill="#3E1540" />
      <rect x="22" y="47" width="56" height="6" fill="#3E1540" />
    </svg>
    <span
      style={{
        fontFamily: "var(--font-instrument-serif)",
        fontSize: "36px",
        color: "#13101A",
        letterSpacing: "-0.01em",
        lineHeight: 1,
      }}
    >
      Central
    </span>
  </div>
)

const inputClass =
  "w-full px-4 py-3 rounded-xl border border-[#ECE8DE] bg-[#FBF8F2] text-[14px] text-[#13101A] placeholder:text-[#C4C4C4] focus:outline-none focus:ring-2 focus:ring-[#3E1540]/20 focus:border-[#3E1540]/40 transition-all"

function JoinContent() {
  const [inviteCode, setInviteCode] = useState("")
  const [joining, setJoining] = useState(false)
  const [joinError, setJoinError] = useState<string | null>(null)

  async function handleJoin(e: React.FormEvent) {
    e.preventDefault()
    if (!inviteCode.trim()) return
    setJoining(true)
    setJoinError(null)

    try {
      const { error } = await joinMinistryByCode(inviteCode)
      if (error) {
        setJoinError(error)
        setJoining(false)
        return
      }
      window.location.href = "/home"
    } catch {
      setJoinError("Something went wrong. Please try again.")
      setJoining(false)
    }
  }

  return (
    <div className="min-h-screen bg-[#FBF8F2] flex items-center justify-center px-6 py-12">
      <div className="w-full max-w-[390px]">
        <div className="flex flex-col items-center mb-10">
          <div className="mb-3">
            <Logo />
          </div>
          <p className="text-[13px] text-[#8A8497]">College ministry community</p>
        </div>

        <div className="bg-white rounded-2xl border border-[#ECE8DE] p-6 shadow-[0_2px_8px_rgba(19,16,26,0.06)]">
          <Link
            href="/"
            className="flex items-center gap-1.5 text-[13px] text-[#8A8497] hover:text-[#3E1540] mb-5 transition-colors"
          >
            <ArrowLeft className="w-3.5 h-3.5" /> Back
          </Link>

          <h2 className="text-[20px] font-bold text-[#13101A] tracking-tight mb-1">
            Join a ministry
          </h2>
          <p className="text-[13px] text-[#8A8497] mb-6">
            Enter the invite code your ministry leader shared with you.
          </p>

          <form onSubmit={handleJoin} className="flex flex-col gap-4">
            {joinError && (
              <div className="rounded-xl bg-[#3E1540]/8 px-4 py-3 text-[13px] text-[#3E1540] font-medium">
                {joinError}
              </div>
            )}

            <div className="flex flex-col gap-1.5">
              <label className="text-[12px] font-medium text-[#5A5466]">Invite code</label>
              <input
                type="text"
                value={inviteCode}
                onChange={(e) => setInviteCode(e.target.value.toUpperCase())}
                placeholder="e.g. CCSF26"
                required
                autoComplete="off"
                autoCapitalize="characters"
                className={`${inputClass} font-mono tracking-[0.15em] text-[16px]`}
              />
            </div>

            <button
              type="submit"
              disabled={joining || !inviteCode.trim()}
              className="w-full bg-[#3E1540] hover:bg-[#2D0F2E] disabled:opacity-60 text-white font-bold py-3.5 rounded-xl transition-colors text-[14px] mt-1"
            >
              {joining ? "Joining…" : "Join ministry"}
            </button>
          </form>
        </div>
      </div>
    </div>
  )
}

export default function JoinPage() {
  return (
    <Suspense>
      <JoinContent />
    </Suspense>
  )
}
