"use client"

import { useState } from "react"
import Link from "next/link"
import { ArrowLeft, Check } from "lucide-react"
import { joinMinistryByCode, registerMinistry } from "@/app/actions/ministry"

type Mode = "pick" | "join" | "register"
type Size = "small" | "medium" | "large"

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

export default function JoinPage() {
  const [mode, setMode] = useState<Mode>("pick")

  // Join flow
  const [inviteCode, setInviteCode] = useState("")
  const [joining, setJoining] = useState(false)
  const [joinError, setJoinError] = useState<string | null>(null)

  // Register flow
  const [ministryName, setMinistryName] = useState("")
  const [university, setUniversity] = useState("")
  const [size, setSize] = useState<Size>("small")
  const [registering, setRegistering] = useState(false)
  const [registerError, setRegisterError] = useState<string | null>(null)

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

  async function handleRegister(e: React.FormEvent) {
    e.preventDefault()
    if (!ministryName.trim() || !university.trim()) return
    setRegistering(true)
    setRegisterError(null)

    try {
      const { error } = await registerMinistry({
        name: ministryName,
        university,
        size,
      })
      if (error) {
        setRegisterError(error)
        setRegistering(false)
        return
      }
      window.location.href = "/home"
    } catch {
      setRegisterError("Something went wrong. Please try again.")
      setRegistering(false)
    }
  }

  return (
    <div className="min-h-screen bg-[#FBF8F2] flex items-center justify-center px-6 py-12">
      <div className="w-full max-w-[390px]">
        {/* Logo */}
        <div className="flex flex-col items-center mb-10">
          <div className="mb-3">
            <Logo />
          </div>
          <p className="text-[13px] text-[#8A8497]">College ministry community</p>
        </div>

        {/* ── Pick mode ── */}
        {mode === "pick" && (
          <div className="flex flex-col gap-4">
            <div className="text-center mb-2">
              <h2
                style={{
                  fontFamily: "var(--font-instrument-serif)",
                  fontSize: "26px",
                  fontWeight: 400,
                  color: "#13101A",
                  letterSpacing: "-0.01em",
                  lineHeight: 1.1,
                }}
              >
                Get started
              </h2>
              <p className="text-[13px] text-[#8A8497] mt-1.5">
                Join your ministry or create a new workspace.
              </p>
            </div>

            <button
              onClick={() => setMode("join")}
              className="w-full bg-[#3E1540] hover:bg-[#2D0F2E] text-[#F6F4EF] font-semibold py-4 rounded-2xl transition-colors text-[15px] shadow-[0_2px_8px_rgba(19,16,26,0.12)]"
            >
              Join a ministry
            </button>

            <button
              onClick={() => setMode("register")}
              className="w-full bg-white hover:bg-[#F7F4EE] text-[#13101A] font-semibold py-4 rounded-2xl border border-[#ECE8DE] transition-colors text-[15px] shadow-[0_1px_4px_rgba(19,16,26,0.06)]"
            >
              Register my ministry
            </button>

            <p className="text-center text-[13px] text-[#8A8497] mt-1">
              Don&apos;t have an account?{" "}
              <Link href="/signup" className="font-semibold text-[#3E1540] hover:underline underline-offset-2">
                Sign up
              </Link>
            </p>
          </div>
        )}

        {/* ── Join via invite code ── */}
        {mode === "join" && (
          <div className="bg-white rounded-2xl border border-[#ECE8DE] p-6 shadow-[0_2px_8px_rgba(19,16,26,0.06)]">
            <button
              onClick={() => { setMode("pick"); setJoinError(null); setInviteCode("") }}
              className="flex items-center gap-1.5 text-[13px] text-[#8A8497] hover:text-[#3E1540] mb-5 transition-colors"
            >
              <ArrowLeft className="w-3.5 h-3.5" /> Back
            </button>

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
        )}

        {/* ── Register new ministry ── */}
        {mode === "register" && (
          <div className="bg-white rounded-2xl border border-[#ECE8DE] p-6 shadow-[0_2px_8px_rgba(19,16,26,0.06)]">
            <button
              onClick={() => { setMode("pick"); setRegisterError(null) }}
              className="flex items-center gap-1.5 text-[13px] text-[#8A8497] hover:text-[#3E1540] mb-5 transition-colors"
            >
              <ArrowLeft className="w-3.5 h-3.5" /> Back
            </button>

            <h2 className="text-[20px] font-bold text-[#13101A] tracking-tight mb-1">
              Register your ministry
            </h2>
            <p className="text-[13px] text-[#8A8497] mb-6">
              Set up your ministry workspace. You&apos;ll be the admin.
            </p>

            <form onSubmit={handleRegister} className="flex flex-col gap-4">
              {registerError && (
                <div className="rounded-xl bg-[#3E1540]/8 px-4 py-3 text-[13px] text-[#3E1540] font-medium">
                  {registerError}
                </div>
              )}

              <div className="flex flex-col gap-1.5">
                <label className="text-[12px] font-medium text-[#5A5466]">Ministry name</label>
                <input
                  type="text"
                  value={ministryName}
                  onChange={(e) => setMinistryName(e.target.value)}
                  placeholder="e.g. Central Church Student Fellowship"
                  required
                  className={inputClass}
                />
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-[12px] font-medium text-[#5A5466]">University</label>
                <input
                  type="text"
                  value={university}
                  onChange={(e) => setUniversity(e.target.value)}
                  placeholder="e.g. University of Pittsburgh"
                  required
                  className={inputClass}
                />
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-[12px] font-medium text-[#5A5466]">Approximate size</label>
                <div className="flex gap-2">
                  {(["small", "medium", "large"] as Size[]).map((s) => (
                    <button
                      key={s}
                      type="button"
                      onClick={() => setSize(s)}
                      className={`flex-1 py-2.5 rounded-xl border text-[13px] font-semibold transition-all ${
                        size === s
                          ? "bg-[#3E1540] border-[#3E1540] text-[#F6F4EF]"
                          : "bg-[#FBF8F2] border-[#ECE8DE] text-[#5A5466] hover:border-[#3E1540]/40"
                      }`}
                    >
                      {s === "small" ? "< 50" : s === "medium" ? "50–100" : "100+"}
                    </button>
                  ))}
                </div>
              </div>

              <button
                type="submit"
                disabled={registering || !ministryName.trim() || !university.trim()}
                className="w-full bg-[#3E1540] hover:bg-[#2D0F2E] disabled:opacity-60 text-white font-bold py-3.5 rounded-xl transition-colors text-[14px] mt-1"
              >
                {registering ? "Creating…" : "Create workspace"}
              </button>
            </form>
          </div>
        )}

        {/* Invite code note on register screen */}
        {mode === "register" && (
          <div className="flex items-start gap-2.5 mt-4 px-1">
            <div className="w-4 h-4 mt-0.5 rounded-full bg-[#C9A34B]/20 flex items-center justify-center flex-shrink-0">
              <Check className="w-2.5 h-2.5 text-[#C9A34B]" />
            </div>
            <p className="text-[12px] text-[#8A8497] leading-relaxed">
              An invite code will be generated automatically — share it with your members so they can join your workspace.
            </p>
          </div>
        )}
      </div>
    </div>
  )
}
