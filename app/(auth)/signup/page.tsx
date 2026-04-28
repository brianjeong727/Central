"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { createClient } from "@/lib/supabase"

const CURRENT_YEAR = new Date().getFullYear()
const GRAD_YEARS = Array.from({ length: 8 }, (_, i) => CURRENT_YEAR + i - 1)

export default function SignupPage() {
  const router = useRouter()
  const [name, setName] = useState("")
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [graduationYear, setGraduationYear] = useState<string>("")
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  async function handleSignup(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError(null)

    const supabase = createClient()

    const { data, error: signUpError } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { name, graduation_year: Number(graduationYear) },
      },
    })

    if (signUpError) {
      setError(signUpError.message)
      setLoading(false)
      return
    }

    if (data.user) {
      const { error: profileError } = await supabase.from("profiles").insert({
        id: data.user.id,
        name,
        email,
        graduation_year: Number(graduationYear),
        role: "member",
      })

      if (profileError) {
        setError("Account created but profile setup failed. Please contact support.")
        setLoading(false)
        return
      }
    }

    router.push("/home")
    router.refresh()
  }

  const inputClass = "w-full px-4 py-3 rounded-xl border border-[#ECE8DE] bg-[#FBF8F2] text-[14px] text-[#13101A] placeholder:text-[#C4C4C4] focus:outline-none focus:ring-2 focus:ring-[#3E1540]/20 focus:border-[#3E1540]/40 transition-all"

  return (
    <div className="min-h-screen bg-[#FBF8F2] flex items-center justify-center px-6 py-12">
      <div className="w-full max-w-[390px]">

        {/* Logo */}
        <div className="flex flex-col items-center mb-10">
          <div className="flex items-center gap-2.5 mb-3">
            <svg width="32" height="32" viewBox="0 0 100 100" fill="none">
              <circle cx="50" cy="50" r="44" stroke="#3E1540" strokeWidth="6" />
              <rect x="47" y="22" width="6" height="56" fill="#3E1540" />
              <rect x="22" y="47" width="56" height="6" fill="#3E1540" />
            </svg>
            <span style={{ fontFamily: "var(--font-instrument-serif)", fontSize: "36px", color: "#13101A", letterSpacing: "-0.01em", lineHeight: 1 }}>
              Central
            </span>
          </div>
          <p className="text-[13px] text-[#8A8497]">College ministry community</p>
        </div>

        {/* Form card */}
        <div className="bg-white rounded-2xl border border-[#ECE8DE] p-6 shadow-[0_2px_8px_rgba(19,16,26,0.06)]">
          <h2 className="text-[20px] font-bold text-[#13101A] tracking-tight mb-1">Create an account</h2>
          <p className="text-[13px] text-[#8A8497] mb-6">Join the Central community</p>

          <form onSubmit={handleSignup} className="flex flex-col gap-4">
            {error && (
              <div className="rounded-xl bg-[#3E1540]/8 px-4 py-3 text-[13px] text-[#3E1540] font-medium">
                {error}
              </div>
            )}

            <div className="flex flex-col gap-1.5">
              <label className="text-[12px] font-medium text-[#5A5466]">Full name</label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Brian Jeong"
                required
                autoComplete="name"
                className={inputClass}
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-[12px] font-medium text-[#5A5466]">Email</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                required
                autoComplete="email"
                className={inputClass}
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-[12px] font-medium text-[#5A5466]">Password</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                required
                minLength={6}
                autoComplete="new-password"
                className={inputClass}
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-[12px] font-medium text-[#5A5466]">Graduation year</label>
              <select
                value={graduationYear}
                onChange={(e) => setGraduationYear(e.target.value)}
                required
                className="w-full px-4 py-3 rounded-xl border border-[#ECE8DE] bg-[#FBF8F2] text-[14px] text-[#13101A] focus:outline-none focus:ring-2 focus:ring-[#3E1540]/20 focus:border-[#3E1540]/40 transition-all appearance-none"
              >
                <option value="" disabled>Select a year</option>
                {GRAD_YEARS.map((year) => (
                  <option key={year} value={year}>{year}</option>
                ))}
              </select>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-[#3E1540] hover:bg-[#2D0F2E] disabled:opacity-60 text-white font-bold py-3.5 rounded-xl transition-colors text-[14px] mt-1"
            >
              {loading ? "Creating account…" : "Create account"}
            </button>
          </form>
        </div>

        <p className="text-center text-[13px] text-[#8A8497] mt-5">
          Already have an account?{" "}
          <Link href="/login" className="font-semibold text-[#3E1540] hover:underline underline-offset-2">
            Sign in
          </Link>
        </p>

      </div>
    </div>
  )
}
