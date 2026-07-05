"use client"

import { Suspense, useState } from "react"
import Link from "next/link"
import { useSearchParams } from "next/navigation"
import { createClient, siteOrigin } from "@/lib/supabase"
import { Spinner } from "@/app/home/components/shared"
import { signUpWithAutoConfirm } from "@/app/actions/auth"
import { SplitShell, GoogleButton, OrDivider, EyeButton } from "@/app/(auth)/shared"
import { EYEBROW_STYLE as mono } from "@/components/central/typography"

const SERIF = "var(--font-instrument-serif)"
const SANS  = "var(--font-inter)"
const serif: React.CSSProperties = { fontFamily: SERIF, fontWeight: 400, color: "var(--ink)", margin: 0 }

type View = "role-choice" | "admin" | "member"

// ─── tiny icon helper ──────────────────────────────────────────
function Icon({ d, size = 16, stroke = 1.8, style }: {
  d: string; size?: number; stroke?: number; style?: React.CSSProperties
}) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth={stroke} strokeLinecap="round" strokeLinejoin="round"
      style={{ flexShrink: 0, ...style }}>
      <path d={d}/>
    </svg>
  )
}

// ─── field ─────────────────────────────────────────────────────
function Field({ label, hint, helper, value, onChange, placeholder, type = "text", trailing, autoFocus, required }: {
  label: string; hint?: React.ReactNode; helper?: string
  value?: string; onChange?: (e: React.ChangeEvent<HTMLInputElement>) => void
  placeholder?: string; type?: string; trailing?: React.ReactNode
  autoFocus?: boolean; required?: boolean
}) {
  return (
    <label style={{ display: "block" }}>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 8 }}>
        <span style={mono}>{label}</span>
        {hint}
      </div>
      <div style={{ display: "flex", alignItems: "center", background: "var(--cream-panel)", border: "1px solid var(--line-2)", borderRadius: 10, padding: "0 14px" }}>
        <input
          type={type} value={value} onChange={onChange} placeholder={placeholder}
          autoFocus={autoFocus} required={required}
          style={{
            flex: 1, border: "none", outline: "none", background: "transparent", padding: "13px 0",
            fontFamily: SANS, fontSize: 15, color: "var(--ink)",
          }}
        />
        {trailing}
      </div>
      {helper && <div style={{ fontSize: 12, color: "var(--faint)", marginTop: 8 }}>{helper}</div>}
    </label>
  )
}

// ─── primary button ────────────────────────────────────────────
function Primary({ children, disabled, loading, onClick }: {
  children: React.ReactNode; disabled?: boolean; loading?: boolean; onClick?: () => void
}) {
  return (
    <button type={onClick ? "button" : "submit"} disabled={disabled} onClick={onClick} style={{
      width: "100%", padding: "14px 22px", borderRadius: 12, border: "none",
      background: disabled ? "var(--line-2)" : "var(--plum-2)",
      color: disabled ? "var(--faint)" : "var(--cream-panel)",
      fontSize: 15, fontWeight: 500, fontFamily: SANS,
      cursor: disabled ? "not-allowed" : "pointer", letterSpacing: "0.01em",
      transition: "background .15s",
      display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
    }}>
      {loading && <Spinner/>}
      {children}
    </button>
  )
}

// ─── back link ─────────────────────────────────────────────────
function BackLink({ onClick }: { onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} style={{
      background: "transparent", border: "none", cursor: "pointer", padding: 0,
      display: "inline-flex", alignItems: "center", gap: 8,
      fontFamily: SANS, fontSize: 14, color: "var(--muted-text)",
    }}>
      <Icon d="M19 12H5M12 19l-7-7 7-7" size={15}/> Back
    </button>
  )
}

// ─── pill (gender / year) ──────────────────────────────────────
function Pill({ label, on, onClick }: { label: string; on: boolean; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} style={{
      padding: "9px 16px", borderRadius: 999,
      border: "1px solid " + (on ? "var(--plum)" : "var(--line-2)"),
      background: on ? "var(--plum-2)" : "var(--cream-panel)",
      color: on ? "var(--cream-panel)" : "var(--body)",
      fontSize: 14, fontWeight: on ? 500 : 400, fontFamily: SANS, cursor: "pointer",
      transition: "all .12s",
    }}>{label}</button>
  )
}

// ─── select tile (role) ────────────────────────────────────────
function SelectTile({ title, sub, on, onClick }: {
  title: string; sub?: string; on: boolean; onClick: () => void
}) {
  return (
    <button type="button" onClick={onClick} style={{
      flex: 1, textAlign: "left", padding: "16px 18px", borderRadius: 12,
      border: "1px solid " + (on ? "var(--plum-2)" : "var(--line-2)"),
      background: on ? "var(--plum-2)" : "var(--cream-panel)", cursor: "pointer",
      fontFamily: SANS, transition: "all .12s",
    }}>
      <div style={{ fontFamily: SERIF, fontWeight: 400, fontSize: 20, letterSpacing: "-0.01em", lineHeight: 1.1, color: on ? "var(--cream-panel)" : "var(--ink)" }}>
        {title}
      </div>
      {sub && <div style={{ fontSize: 13, marginTop: 4, color: on ? "rgba(251,248,242,0.72)" : "var(--muted-text)" }}>{sub}</div>}
    </button>
  )
}

// ─── path row (welcome chooser) ────────────────────────────────
function PathRow({ icon, iconBg, iconFg, title, body, onClick }: {
  icon: React.ReactNode; iconBg: string; iconFg: string
  title: string; body: string; onClick: () => void
}) {
  return (
    <button type="button" onClick={onClick} style={{
      width: "100%", textAlign: "left", display: "flex", alignItems: "center", gap: 18,
      padding: "22px 24px", borderRadius: 14, border: "1px solid var(--line-2)",
      background: "var(--cream-panel)", cursor: "pointer", fontFamily: SANS, transition: "border-color .15s",
    }}
      className="hover:border-[var(--plum)]"
    >
      <span style={{
        width: 52, height: 52, borderRadius: 13, background: iconBg, color: iconFg,
        display: "grid", placeItems: "center", flexShrink: 0,
      }}>{icon}</span>
      <span style={{ flex: 1, minWidth: 0 }}>
        <span style={{ display: "block", fontFamily: SANS, fontSize: 19, fontWeight: 500, color: "var(--ink)", lineHeight: 1.2 }}>{title}</span>
        <span style={{ display: "block", fontSize: 14, color: "var(--body)", marginTop: 3, lineHeight: 1.5 }}>{body}</span>
      </span>
      <Icon d="M9 6l6 6-6 6" size={18} style={{ color: "var(--faint)" }}/>
    </button>
  )
}

// ─── error banner ──────────────────────────────────────────────
function ErrorBanner({ msg }: { msg: string }) {
  return (
    <div style={{ borderRadius: 10, background: "color-mix(in srgb, var(--danger) 8%, transparent)", border: "1px solid color-mix(in srgb, var(--danger) 18%, transparent)", padding: "10px 14px", fontSize: 13, color: "var(--danger)", fontWeight: 500, display: "flex", gap: 8 }} role="alert">
      <span style={{ flexShrink: 0 }}>⚠</span> {msg}
    </div>
  )
}

// ══════════════════════════════════════════════════════════════════
function SignupContent() {
  const searchParams = useSearchParams()
  const intent = searchParams.get("intent")
  const [view, setView] = useState<View>(intent === "register" ? "admin" : "role-choice")

  // admin state
  const [adminName,     setAdminName]     = useState("")
  const [adminEmail,    setAdminEmail]    = useState("")
  const [adminPassword, setAdminPassword] = useState("")
  const [adminShowPw,   setAdminShowPw]   = useState(false)
  const [founderRole,   setFounderRole]   = useState<"pastor"|"deacon"|"elder"|"">("")
  const [adminError,    setAdminError]    = useState<string|null>(null)
  const [adminLoading,  setAdminLoading]  = useState(false)

  // member state
  const [memberName,       setMemberName]       = useState("")
  const [memberEmail,      setMemberEmail]       = useState("")
  const [memberPassword,   setMemberPassword]   = useState("")
  const [memberShowPw,     setMemberShowPw]     = useState(false)
  const [graduationYear,   setGraduationYear]   = useState("")
  const [gender,           setGender]           = useState("")
  const [memberError,      setMemberError]      = useState<string|null>(null)
  const [memberLoading,    setMemberLoading]    = useState(false)

  async function handleAdminSignup(e: React.FormEvent) {
    e.preventDefault()
    if (!founderRole) return
    setAdminLoading(true); setAdminError(null)
    const { error: signUpError } = await signUpWithAutoConfirm({ email: adminEmail, password: adminPassword, metadata: { name: adminName, role: founderRole } })
    if (signUpError) {
      setAdminError(signUpError.toLowerCase().includes("rate limit") ? "Too many attempts with this email. Please wait a few minutes or use a different address." : signUpError)
      setAdminLoading(false); return
    }
    const supabase = createClient()
    const { error: signInError } = await supabase.auth.signInWithPassword({ email: adminEmail, password: adminPassword })
    if (signInError) { setAdminError(signInError.message); setAdminLoading(false); return }
    window.location.replace("/onboarding")
  }

  async function handleAdminGoogle() {
    const supabase = createClient()
    await supabase.auth.signInWithOAuth({ provider: "google", options: { redirectTo: siteOrigin() + "/auth/callback?intent=register" } })
  }

  const currentYear = new Date().getFullYear()
  const gradYearNum = parseInt(graduationYear, 10)
  const gradYearValid = gradYearNum >= currentYear && gradYearNum <= currentYear + 6

  async function handleMemberSignup(e: React.FormEvent) {
    e.preventDefault()
    if (!gradYearValid) { setMemberError("Please enter a valid graduation year."); return }
    setMemberLoading(true); setMemberError(null)
    const { error: signUpError } = await signUpWithAutoConfirm({ email: memberEmail, password: memberPassword, metadata: { name: memberName, graduation_year: String(gradYearNum), gender } })
    if (signUpError) {
      setMemberError(signUpError.toLowerCase().includes("rate limit") ? "Too many attempts with this email. Please wait a few minutes or use a different address." : signUpError)
      setMemberLoading(false); return
    }
    const supabase = createClient()
    const { error: signInError } = await supabase.auth.signInWithPassword({ email: memberEmail, password: memberPassword })
    if (signInError) { setMemberError(signInError.message); setMemberLoading(false); return }
    window.location.replace("/join")
  }

  async function handleMemberGoogle() {
    const supabase = createClient()
    await supabase.auth.signInWithOAuth({ provider: "google", options: { redirectTo: siteOrigin() + "/auth/callback" } })
  }

  const ROLES = [
    { key: "pastor" as const, title: "Pastor",  sub: "Senior leader" },
    { key: "deacon" as const, title: "Deacon",  sub: "Servant leader" },
    { key: "elder"  as const, title: "Elder",   sub: "Elder board" },
  ]

  const alreadyHaveAccount = (
    <span>
      Already have an account?{" "}
      <Link href="/login" style={{ color: "var(--plum-2)", fontWeight: 500, textDecoration: "none" }} className="hover:underline underline-offset-2">
        Sign in
      </Link>
    </span>
  )

  // ── ROLE CHOICE ────────────────────────────────────────────────
  if (view === "role-choice") return (
    <SplitShell topBar={<>
      <Link href="/" style={{
        display: "inline-flex", alignItems: "center", gap: 8,
        color: "var(--body)", textDecoration: "none", marginRight: "auto", fontSize: 14,
      }}>
        <Icon d="M19 12H5M12 19l-7-7 7-7" size={16}/> Back
      </Link>
      {alreadyHaveAccount}
    </>}>
      <div style={mono}>GET STARTED · CENTRAL</div>
      <h1 style={{ ...serif, fontWeight: 600, fontSize: 44, lineHeight: 1.03, letterSpacing: "-0.02em", margin: "14px 0 0" }}>
        How are you joining?
      </h1>
      <p style={{ fontSize: 16, color: "var(--body)", lineHeight: 1.6, margin: "16px 0 0" }}>
        Two ways into Central — start a ministry, or join one that&apos;s already here.
      </p>

      <div style={{ display: "flex", flexDirection: "column", gap: 14, marginTop: 34 }}>
        <PathRow
          icon={<Icon d="M3 11l9-8 9 8M5 10v10h14V10" size={20}/>}
          iconBg="var(--plum)" iconFg="var(--cream-panel)"
          title="Register a church"
          body="I'm a pastor, deacon, or elder starting a new ministry on Central."
          onClick={() => setView("admin")}
        />
        <PathRow
          icon={<Icon d="M16 21v-2a4 4 0 00-4-4H6a4 4 0 00-4 4v2M22 21v-2a4 4 0 00-3-3.87M9 11a4 4 0 100-8 4 4 0 000 8zm7-8a4 4 0 010 7.75" size={20}/>}
          iconBg="var(--ivory)" iconFg="var(--plum)"
          title="Join a ministry"
          body="I'm a student or member looking to join an existing ministry."
          onClick={() => setView("member")}
        />
      </div>
    </SplitShell>
  )

  // ── ADMIN (register a church) ──────────────────────────────────
  if (view === "admin") return (
    <SplitShell topBar={<>
      {intent !== "register" && (
        <span style={{ marginRight: "auto" }}>
          <BackLink onClick={() => setView("role-choice")}/>
        </span>
      )}
      <span>
        Already have an account?{" "}
        <Link href="/login?intent=register" style={{ color: "var(--plum-2)", fontWeight: 500, textDecoration: "none" }} className="hover:underline underline-offset-2">
          Sign in
        </Link>
      </span>
    </>}>
      <div style={mono}>REGISTER A CHURCH · STEP 1 OF 2</div>
      <h1 style={{ ...serif, fontWeight: 600, fontSize: 44, lineHeight: 1.03, letterSpacing: "-0.02em", margin: "14px 0 0" }}>
        Register your church.
      </h1>
      <p style={{ fontSize: 16, color: "var(--body)", lineHeight: 1.6, margin: "16px 0 30px" }}>
        Create your admin account — you&apos;ll set up the workspace next.
      </p>

      <form onSubmit={handleAdminSignup} style={{ display: "flex", flexDirection: "column", gap: 18 }}>
        <GoogleButton onClick={handleAdminGoogle}/>
        <OrDivider/>

        {adminError && <ErrorBanner msg={adminError}/>}

        <Field label="FULL NAME" placeholder="Pastor John Smith" value={adminName} onChange={(e) => setAdminName(e.target.value)} required autoFocus/>
        <Field label="EMAIL" placeholder="you@example.com" type="email" value={adminEmail} onChange={(e) => setAdminEmail(e.target.value)} required/>
        <Field label="PASSWORD" type={adminShowPw ? "text" : "password"} placeholder="••••••••"
          value={adminPassword} onChange={(e) => setAdminPassword(e.target.value)} required
          trailing={<EyeButton show={adminShowPw} onToggle={() => setAdminShowPw(v => !v)}/>}
          helper="At least 6 characters."/>

        <div>
          <div style={{ ...mono, marginBottom: 10 }}>YOUR ROLE</div>
          <div style={{ display: "flex", gap: 10 }}>
            {ROLES.map(r => (
              <SelectTile key={r.key} title={r.title} sub={r.sub} on={founderRole === r.key} onClick={() => setFounderRole(r.key)}/>
            ))}
          </div>
        </div>

        <Primary disabled={!founderRole || adminLoading} loading={adminLoading}>
          {adminLoading ? "Creating account…" : "Create account"}
        </Primary>
        {!founderRole && !adminLoading && (
          <div style={{ fontSize: 13, color: "var(--muted-text)", textAlign: "center", marginTop: -6 }}>
            Select your role to continue.
          </div>
        )}
      </form>

      <div style={{ marginTop: 26, paddingTop: 22, borderTop: "1px solid var(--line)", fontSize: 13, color: "var(--body)" }}>
        Not a pastor, deacon, or elder?{" "}
        <button type="button" onClick={() => setView("member")}
          style={{ color: "var(--plum-2)", fontWeight: 500, background: "none", border: "none", cursor: "pointer", padding: 0, fontFamily: SANS, fontSize: 13 }}
          className="hover:underline underline-offset-2">
          Join a ministry instead →
        </button>
      </div>
    </SplitShell>
  )

  // ── MEMBER (join a ministry) ────────────────────────────────────
  return (
    <SplitShell topBar={<>
      <span style={{ marginRight: "auto" }}>
        <BackLink onClick={() => setView("role-choice")}/>
      </span>
      {alreadyHaveAccount}
    </>}>
      <div style={mono}>JOIN A MINISTRY · CENTRAL</div>
      <h1 style={{ ...serif, fontWeight: 600, fontSize: 44, lineHeight: 1.03, letterSpacing: "-0.02em", margin: "14px 0 0" }}>
        Create your account.
      </h1>
      <p style={{ fontSize: 16, color: "var(--body)", lineHeight: 1.6, margin: "16px 0 30px" }}>
        Get started with Central in minutes.
      </p>

      <form onSubmit={handleMemberSignup} style={{ display: "flex", flexDirection: "column", gap: 18 }}>
        <GoogleButton onClick={handleMemberGoogle}/>
        <OrDivider/>

        {memberError && <ErrorBanner msg={memberError}/>}

        <Field label="FULL NAME" placeholder="Brian Jeong" value={memberName} onChange={(e) => setMemberName(e.target.value)} required autoFocus/>

        <div>
          <div style={mono}>GENDER</div>
          <div style={{ fontSize: 13, color: "var(--muted-text)", margin: "4px 0 10px" }}>Helps us place you in the right small group.</div>
          <div style={{ display: "flex", gap: 8 }}>
            {["Male", "Female"].map(g => (
              <Pill key={g} label={g} on={gender === g.toLowerCase()} onClick={() => setGender(g.toLowerCase())}/>
            ))}
          </div>
        </div>

        <Field label="EMAIL" placeholder="you@example.com" type="email" value={memberEmail} onChange={(e) => setMemberEmail(e.target.value)} required/>
        <Field label="PASSWORD" type={memberShowPw ? "text" : "password"} placeholder="••••••••"
          value={memberPassword} onChange={(e) => setMemberPassword(e.target.value)} required
          trailing={<EyeButton show={memberShowPw} onToggle={() => setMemberShowPw(v => !v)}/>}
          helper="At least 6 characters."/>

        <Field
          label="GRADUATION YEAR"
          placeholder={String(currentYear + 2)}
          type="number"
          value={graduationYear}
          onChange={(e) => setGraduationYear(e.target.value)}
          helper={`Enter the year you graduate (e.g. ${currentYear + 1}, ${currentYear + 2}).`}
        />

        <Primary disabled={!gradYearValid || !gender || memberLoading} loading={memberLoading}>
          {memberLoading ? "Creating account…" : "Create account"}
        </Primary>
        {(!gradYearValid || !gender) && !memberLoading && (
          <div style={{ fontSize: 13, color: "var(--muted-text)", textAlign: "center", marginTop: -6 }}>
            {!gender ? "Select your gender to continue." : "Enter a valid graduation year."}
          </div>
        )}
      </form>

    </SplitShell>
  )
}

export default function SignupPage() {
  return <Suspense><SignupContent/></Suspense>
}
