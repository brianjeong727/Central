"use client"

import { Suspense, useState } from "react"
import Link from "next/link"
import { useSearchParams } from "next/navigation"
import { createClient, siteOrigin } from "@/lib/supabase"
import { Spinner } from "@/app/home/components/shared"
import { signUpWithAutoConfirm } from "@/app/actions/auth"

// ─── design tokens ─────────────────────────────────────────────
const SERIF = "var(--font-instrument-serif)"
const SANS  = "var(--font-inter)"

const mono: React.CSSProperties = {
  fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
  fontSize: 11, letterSpacing: "0.13em", color: "#8A8497", textTransform: "uppercase",
}
const serif: React.CSSProperties = { fontFamily: SERIF, fontWeight: 400, color: "#13101A", margin: 0 }

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

// ─── monogram wordmark ─────────────────────────────────────────
function Wordmark({ tone = "ink" }: { tone?: "ink" | "plum" }) {
  const isInk = tone === "ink"
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
      <span style={{
        width: 32, height: 32, borderRadius: 8,
        background: isInk ? "#3E1540" : "rgba(251,248,242,0.10)",
        color: "#FBF8F2", display: "grid", placeItems: "center",
        fontFamily: SERIF, fontSize: 15, flexShrink: 0,
      }}>C</span>
      <span style={{ fontFamily: SERIF, fontSize: 22, letterSpacing: "-0.01em", color: isInk ? "#13101A" : "#FBF8F2" }}>
        Central
      </span>
    </div>
  )
}

// ─── sticky plum panel ─────────────────────────────────────────
function PlumPanel() {
  return (
    <div style={{
      position: "sticky", top: 0, alignSelf: "start", height: "100vh",
      overflow: "hidden", color: "#FBF8F2",
      background: "radial-gradient(120% 100% at 0% 0%, #4A1B4D 0%, #2D0F2E 55%, #1B0A1E 100%)",
      padding: "44px 56px", display: "flex", flexDirection: "column", justifyContent: "space-between",
    }}>
      <div aria-hidden style={{
        position: "absolute", inset: 0, opacity: 0.18, pointerEvents: "none",
        background: "radial-gradient(rgba(251,248,242,0.6) 1px, transparent 1.4px) 0 0 / 14px 14px",
      }}/>
      <div style={{ position: "relative" }}><Wordmark tone="plum"/></div>
      <div style={{ position: "relative" }}>
        <h2 style={{ ...serif, color: "#FBF8F2", fontSize: 60, lineHeight: 1.02, letterSpacing: "-0.04em", maxWidth: 560, margin: 0 }}>
          Your ministry, all in one place.
        </h2>
        <div style={{ marginTop: 36 }}>
          <div style={{ fontFamily: SERIF, fontStyle: "italic", fontSize: 19, lineHeight: 1.45, color: "rgba(251,248,242,0.92)", maxWidth: 460 }}>
            &ldquo;And let us consider how to stir up one another to love and good works.&rdquo;
          </div>
          <div style={{ ...mono, marginTop: 12, color: "rgba(251,248,242,0.55)" }}>HEBREWS 10 : 24</div>
        </div>
      </div>
    </div>
  )
}

// ─── split shell ───────────────────────────────────────────────
function SplitShell({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      width: "100%", minHeight: "100svh", display: "grid", gridTemplateColumns: "1.05fr 1fr",
      alignItems: "start", background: "#FBF8F2", fontFamily: SANS,
    }}
      className="max-md:block"
    >
      <div className="hidden md:block"><PlumPanel/></div>
      <div style={{
        position: "relative", minHeight: "100svh", padding: "64px 56px",
        display: "flex", flexDirection: "column", justifyContent: "center", alignItems: "center",
      }}
        className="px-6 py-16 md:px-14"
      >
        {/* Mobile wordmark */}
        <div className="md:hidden mb-10 self-start">
          <Wordmark tone="ink"/>
        </div>
        <div style={{ width: "100%", maxWidth: 400 }}>{children}</div>
      </div>
    </div>
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
      <div style={{ display: "flex", alignItems: "center", background: "#FBF8F2", border: "1px solid #E2DDCF", borderRadius: 10, padding: "0 14px" }}>
        <input
          type={type} value={value} onChange={onChange} placeholder={placeholder}
          autoFocus={autoFocus} required={required}
          style={{
            flex: 1, border: "none", outline: "none", background: "transparent", padding: "13px 0",
            fontFamily: SANS, fontSize: 15, color: "#13101A",
          }}
        />
        {trailing}
      </div>
      {helper && <div style={{ fontSize: 12, color: "#A09A8C", marginTop: 8 }}>{helper}</div>}
    </label>
  )
}

// ─── eye toggle ────────────────────────────────────────────────
function EyeButton({ show, onToggle }: { show: boolean; onToggle: () => void }) {
  return (
    <button type="button" onClick={onToggle} aria-label={show ? "Hide password" : "Show password"}
      style={{ background: "transparent", border: "none", cursor: "pointer", padding: 4, color: "#8A8497", display: "grid", placeItems: "center", marginRight: -4 }}>
      {show
        ? <Icon d="M17.94 17.94A10.07 10.07 0 0112 20c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19M1 1l22 22" size={16}/>
        : <Icon d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8S1 12 1 12zM12 15a3 3 0 100-6 3 3 0 000 6z" size={16}/>
      }
    </button>
  )
}

// ─── google button ─────────────────────────────────────────────
function GoogleButton({ onClick }: { onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} style={{
      width: "100%", padding: "13px 18px", borderRadius: 12,
      background: "#FBF8F2", border: "1px solid #E2DDCF", color: "#13101A",
      fontSize: 15, fontWeight: 500, fontFamily: SANS, cursor: "pointer",
      display: "flex", alignItems: "center", justifyContent: "center", gap: 12,
      transition: "background .15s",
    }}
      className="hover:bg-[#F1ECDE]"
    >
      <svg width={16} height={16} viewBox="0 0 24 24" aria-hidden style={{ flexShrink: 0 }}>
        <path fill="#4285F4" d="M23.06 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h6.2a5.3 5.3 0 01-2.3 3.48v2.9h3.72c2.18-2 3.44-4.96 3.44-8.39z"/>
        <path fill="#34A853" d="M12 23.5c3.1 0 5.7-1.03 7.62-2.79l-3.72-2.89c-1.03.69-2.35 1.1-3.9 1.1-3 0-5.54-2.02-6.45-4.74H1.7v2.98A11.5 11.5 0 0012 23.5z"/>
        <path fill="#FBBC05" d="M5.55 14.18A6.91 6.91 0 015.18 12c0-.76.13-1.5.37-2.18V6.84H1.7A11.5 11.5 0 00.5 12c0 1.86.44 3.62 1.2 5.16l3.85-2.98z"/>
        <path fill="#EA4335" d="M12 5.07c1.69 0 3.2.58 4.4 1.72l3.3-3.3C17.7 1.6 15.1.5 12 .5 7.4.5 3.42 3.14 1.7 6.84l3.85 2.98C6.46 7.1 9 5.07 12 5.07z"/>
      </svg>
      Continue with Google
    </button>
  )
}

// ─── or divider ────────────────────────────────────────────────
function OrDivider() {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 14, color: "#A09A8C" }}>
      <span style={{ flex: 1, height: 1, background: "#E8E2D2" }}/>
      <span style={{ ...mono, color: "#A09A8C", textTransform: "lowercase", letterSpacing: "0.06em" }}>or</span>
      <span style={{ flex: 1, height: 1, background: "#E8E2D2" }}/>
    </div>
  )
}

// ─── primary button ────────────────────────────────────────────
function Primary({ children, disabled, loading, onClick }: {
  children: React.ReactNode; disabled?: boolean; loading?: boolean; onClick?: () => void
}) {
  return (
    <button type={onClick ? "button" : "submit"} disabled={disabled} onClick={onClick} style={{
      width: "100%", padding: "14px 22px", borderRadius: 12, border: "none",
      background: disabled ? "#E2DDCF" : "#2D0F2E",
      color: disabled ? "#A09A8C" : "#FBF8F2",
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
      fontFamily: SANS, fontSize: 14, color: "#8A8497",
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
      border: "1px solid " + (on ? "#3E1540" : "#E2DDCF"),
      background: on ? "#2D0F2E" : "#FBF8F2",
      color: on ? "#FBF8F2" : "#5A5466",
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
      border: "1px solid " + (on ? "#2D0F2E" : "#E2DDCF"),
      background: on ? "#2D0F2E" : "#FBF8F2", cursor: "pointer",
      fontFamily: SANS, transition: "all .12s",
    }}>
      <div style={{ fontFamily: SERIF, fontWeight: 400, fontSize: 20, letterSpacing: "-0.01em", lineHeight: 1.1, color: on ? "#FBF8F2" : "#13101A" }}>
        {title}
      </div>
      {sub && <div style={{ fontSize: 13, marginTop: 4, color: on ? "rgba(251,248,242,0.72)" : "#8A8497" }}>{sub}</div>}
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
      padding: "20px 22px", borderRadius: 14, border: "1px solid #E2DDCF",
      background: "#FBF8F2", cursor: "pointer", fontFamily: SANS, transition: "border-color .15s",
    }}
      className="hover:border-[#3E1540]"
    >
      <span style={{
        width: 46, height: 46, borderRadius: 12, background: iconBg, color: iconFg,
        display: "grid", placeItems: "center", flexShrink: 0,
      }}>{icon}</span>
      <span style={{ flex: 1, minWidth: 0 }}>
        <span style={{ display: "block", fontFamily: SERIF, fontSize: 23, letterSpacing: "-0.01em", color: "#13101A", lineHeight: 1.1 }}>{title}</span>
        <span style={{ display: "block", fontSize: 14, color: "#5A5466", marginTop: 5, lineHeight: 1.5 }}>{body}</span>
      </span>
      <Icon d="M9 6l6 6-6 6" size={18} style={{ color: "#A09A8C" }}/>
    </button>
  )
}

// ─── error banner ──────────────────────────────────────────────
function ErrorBanner({ msg }: { msg: string }) {
  return (
    <div style={{ borderRadius: 10, background: "rgba(220,38,38,0.07)", border: "1px solid rgba(220,38,38,0.15)", padding: "10px 14px", fontSize: 13, color: "#B91C1C", fontWeight: 500, display: "flex", gap: 8 }} role="alert">
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
  const [memberName,     setMemberName]     = useState("")
  const [memberEmail,    setMemberEmail]    = useState("")
  const [memberPassword, setMemberPassword] = useState("")
  const [memberShowPw,   setMemberShowPw]   = useState(false)
  const [grade,          setGrade]          = useState("")
  const [gender,         setGender]         = useState("")
  const [memberError,    setMemberError]    = useState<string|null>(null)
  const [memberLoading,  setMemberLoading]  = useState(false)

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

  async function handleMemberSignup(e: React.FormEvent) {
    e.preventDefault()
    setMemberLoading(true); setMemberError(null)
    const { error: signUpError } = await signUpWithAutoConfirm({ email: memberEmail, password: memberPassword, metadata: { name: memberName, grade, gender } })
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

  const YEARS = ["Freshman", "Sophomore", "Junior", "Senior", "Young Adult"]
  const ROLES = [
    { key: "pastor" as const, title: "Pastor",  sub: "Senior leader" },
    { key: "deacon" as const, title: "Deacon",  sub: "Servant leader" },
    { key: "elder"  as const, title: "Elder",   sub: "Elder board" },
  ]

  // ── ROLE CHOICE ────────────────────────────────────────────────
  if (view === "role-choice") return (
    <SplitShell>
      <div style={mono}>GET STARTED · CENTRAL</div>
      <h1 style={{ ...serif, fontSize: 48, lineHeight: 1.08, letterSpacing: "-0.03em", margin: "8px 0 0" }}>
        How are you joining?
      </h1>
      <p style={{ fontSize: 15, color: "#5A5466", marginTop: 10, marginBottom: 32 }}>
        Two ways into Central — start a ministry, or join one that&apos;s already here.
      </p>

      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <PathRow
          icon={<Icon d="M3 11l9-8 9 8M5 10v10h14V10" size={20}/>}
          iconBg="#3E1540" iconFg="#FBF8F2"
          title="Register a church"
          body="I'm a pastor, deacon, or elder starting a new ministry on Central."
          onClick={() => setView("admin")}
        />
        <PathRow
          icon={<Icon d="M16 21v-2a4 4 0 00-4-4H6a4 4 0 00-4 4v2M22 21v-2a4 4 0 00-3-3.87M9 11a4 4 0 100-8 4 4 0 000 8zm7-8a4 4 0 010 7.75" size={20}/>}
          iconBg="#F1ECDE" iconFg="#3E1540"
          title="Join a ministry"
          body="I'm a student or member looking to join an existing ministry."
          onClick={() => setView("member")}
        />
      </div>

      <div style={{ marginTop: 28, fontSize: 14, color: "#5A5466", textAlign: "center" }}>
        Already have an account?{" "}
        <Link href="/login" style={{ color: "#2D0F2E", fontWeight: 500, textDecoration: "none" }} className="hover:underline underline-offset-2">
          Sign in
        </Link>
      </div>
    </SplitShell>
  )

  // ── ADMIN (register a church) ──────────────────────────────────
  if (view === "admin") return (
    <SplitShell>
      {intent !== "register" && (
        <div style={{ marginBottom: 22 }}><BackLink onClick={() => setView("role-choice")}/></div>
      )}
      <div style={mono}>REGISTER A CHURCH · STEP 1 OF 2</div>
      <h1 style={{ ...serif, fontSize: 44, lineHeight: 1.08, letterSpacing: "-0.03em", margin: "8px 0 0" }}>
        Register your church.
      </h1>
      <p style={{ fontSize: 15, color: "#5A5466", marginTop: 10, marginBottom: 30 }}>
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
          <div style={{ fontSize: 13, color: "#8A8497", textAlign: "center", marginTop: -6 }}>
            Select your role to continue.
          </div>
        )}
      </form>

      <div style={{ marginTop: 26, paddingTop: 22, borderTop: "1px solid #E8E2D2", fontSize: 13, color: "#5A5466" }}>
        Not a pastor, deacon, or elder?{" "}
        <button type="button" onClick={() => setView("member")}
          style={{ color: "#2D0F2E", fontWeight: 500, background: "none", border: "none", cursor: "pointer", padding: 0, fontFamily: SANS, fontSize: 13 }}
          className="hover:underline underline-offset-2">
          Join a ministry instead →
        </button>
      </div>

      <div style={{ marginTop: 12, fontSize: 13, color: "#5A5466", textAlign: "center" }}>
        Already have an account?{" "}
        <Link href="/login?intent=register" style={{ color: "#2D0F2E", fontWeight: 500, textDecoration: "none" }} className="hover:underline underline-offset-2">
          Sign in
        </Link>
      </div>
    </SplitShell>
  )

  // ── MEMBER (join a ministry) ────────────────────────────────────
  return (
    <SplitShell>
      <div style={{ marginBottom: 22 }}><BackLink onClick={() => setView("role-choice")}/></div>
      <div style={mono}>JOIN A MINISTRY · CENTRAL</div>
      <h1 style={{ ...serif, fontSize: 44, lineHeight: 1.08, letterSpacing: "-0.03em", margin: "8px 0 0" }}>
        Create your account.
      </h1>
      <p style={{ fontSize: 15, color: "#5A5466", marginTop: 10, marginBottom: 30 }}>
        Get started with Central in minutes.
      </p>

      <form onSubmit={handleMemberSignup} style={{ display: "flex", flexDirection: "column", gap: 18 }}>
        <GoogleButton onClick={handleMemberGoogle}/>
        <OrDivider/>

        {memberError && <ErrorBanner msg={memberError}/>}

        <Field label="FULL NAME" placeholder="Brian Jeong" value={memberName} onChange={(e) => setMemberName(e.target.value)} required autoFocus/>

        <div>
          <div style={mono}>GENDER</div>
          <div style={{ fontSize: 13, color: "#8A8497", margin: "4px 0 10px" }}>Helps us place you in the right small group.</div>
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

        <div>
          <div style={{ ...mono, marginBottom: 10 }}>YEAR</div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            {YEARS.map(y => (
              <Pill key={y} label={y} on={grade === y.toLowerCase().replace(" ", "_")} onClick={() => setGrade(y.toLowerCase().replace(" ", "_"))}/>
            ))}
          </div>
        </div>

        <Primary disabled={!grade || !gender || memberLoading} loading={memberLoading}>
          {memberLoading ? "Creating account…" : "Create account"}
        </Primary>
        {(!grade || !gender) && !memberLoading && (
          <div style={{ fontSize: 13, color: "#8A8497", textAlign: "center", marginTop: -6 }}>
            Select your year and gender to continue.
          </div>
        )}
      </form>

      <div style={{ marginTop: 28, fontSize: 14, color: "#5A5466", textAlign: "center" }}>
        Already have an account?{" "}
        <Link href="/login" style={{ color: "#2D0F2E", fontWeight: 500, textDecoration: "none" }} className="hover:underline underline-offset-2">
          Sign in
        </Link>
      </div>
    </SplitShell>
  )
}

export default function SignupPage() {
  return <Suspense><SignupContent/></Suspense>
}
