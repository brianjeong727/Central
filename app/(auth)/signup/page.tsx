"use client"

import { Suspense, useState } from "react"
import Link from "next/link"
import { AlertCircle } from "lucide-react"
import { useSearchParams } from "next/navigation"
import { createClient, siteOrigin } from "@/lib/supabase"
import { Spinner } from "@/app/home/components/shared"
import { SplitShell, GoogleButton, AppleButton, AppleGlyph, GoogleGlyph, OrDivider, EyeButton,
  PocketAuthScreen, PocketBack, PocketField, PocketSubmit, PocketError,
  pocketPillCard, pocketFieldLabel, pocketH1, pocketSub } from "@/app/(auth)/shared"
import { isNativeShell, useIsNativeShell, signInWithAppleNative, signInWithGoogleNative, googleNativeConfigured } from "@/lib/native-auth"
import { EYEBROW_STYLE as mono } from "@/components/central/typography"
import { CentralButton } from "@/components/central"

const SERIF = "var(--font-instrument-serif)"
const SANS  = "var(--font-inter)"
const serif: React.CSSProperties = { fontFamily: SERIF, fontWeight: 400, color: "var(--ink)", margin: 0 }

type View = "role-choice" | "admin" | "member" | "check-email"

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
    <CentralButton type={onClick ? "button" : "submit"} variant="primary" disabled={disabled} onClick={onClick} style={{
      width: "100%", padding: "14px 22px", borderRadius: 12,
      fontSize: 15, letterSpacing: "0.01em",
    }}>
      {loading && <Spinner/>}
      {children}
    </CentralButton>
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
      <AlertCircle size={14} style={{ flexShrink: 0, marginTop: 1 }} /> {msg}
    </div>
  )
}

// ─── mobile tonal path tile (ivory, borderless) ───────────────
function MPathTile({ icon, title, body, onClick }: {
  icon: React.ReactNode; title: string; body: string; onClick: () => void
}) {
  return (
    <button type="button" onClick={onClick} style={{
      width: "100%", textAlign: "left", display: "flex", alignItems: "center", gap: 14,
      padding: "16px 18px", borderRadius: 16, border: "none", background: "var(--ivory)",
      cursor: "pointer", fontFamily: SERIF, minHeight: 44,
    }}>
      <span style={{ width: 44, height: 44, borderRadius: 12, background: "var(--line-2)", color: "var(--plum)", display: "grid", placeItems: "center", flexShrink: 0 }}>{icon}</span>
      <span style={{ flex: 1, minWidth: 0 }}>
        <span style={{ display: "block", fontFamily: SERIF, fontSize: 17, fontWeight: 600, color: "var(--ink)", lineHeight: 1.2 }}>{title}</span>
        <span style={{ display: "block", fontSize: 13.5, color: "var(--body)", marginTop: 3, lineHeight: 1.45 }}>{body}</span>
      </span>
      <Icon d="M9 6l6 6-6 6" size={18} style={{ color: "var(--faint)" }}/>
    </button>
  )
}

// ─── mobile tonal select tile (role) — ivory off, plum on ──────
function MSelectTile({ title, sub, on, onClick }: {
  title: string; sub?: string; on: boolean; onClick: () => void
}) {
  return (
    <button type="button" onClick={onClick} style={{
      flex: 1, textAlign: "left", padding: "12px 14px", borderRadius: 16, border: "none",
      background: on ? "var(--plum)" : "var(--ivory)", cursor: "pointer", fontFamily: SERIF, minHeight: 44,
    }}>
      <div style={{ fontFamily: SERIF, fontWeight: 600, fontSize: 16, lineHeight: 1.1, color: on ? "var(--cream)" : "var(--ink)" }}>{title}</div>
      {sub && <div style={{ fontSize: 12, marginTop: 3, color: on ? "color-mix(in srgb, var(--cream) 78%, transparent)" : "var(--muted-text)" }}>{sub}</div>}
    </button>
  )
}

// ─── mobile gender pill — ivory off, plum on ───────────────────
function MGenderPill({ label, on, onClick }: { label: string; on: boolean; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} style={{
      flex: 1, padding: "12px 16px", borderRadius: 999, border: "none", minHeight: 44,
      background: on ? "var(--plum)" : "var(--ivory)", color: on ? "var(--cream)" : "var(--body)",
      fontSize: 14.5, fontWeight: 600, fontFamily: SERIF, cursor: "pointer",
    }}>{label}</button>
  )
}

// ══════════════════════════════════════════════════════════════════
function SignupContent() {
  const searchParams = useSearchParams()
  const intent = searchParams.get("intent")
  const [view, setView] = useState<View>(intent === "register" ? "admin" : "role-choice")
  // Google web-OAuth can't run inside the WKWebView — the shell uses the native
  // Google sheet instead, shown only once the iOS client ID is configured
  // (see app/(auth)/login/page.tsx for the full rationale).
  const nativeShell = useIsNativeShell()
  const googleInShell = googleNativeConfigured()

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

  // check-email state — which email was used, its confirmation redirect, and
  // which form to return to via "Go back". Field state is preserved on return.
  const [pendingEmail,    setPendingEmail]    = useState("")
  const [pendingRedirect, setPendingRedirect] = useState("")
  const [pendingView,     setPendingView]     = useState<"admin"|"member">("admin")
  const [resendLoading,   setResendLoading]   = useState(false)
  const [resendStatus,    setResendStatus]    = useState<{ ok: boolean; msg: string }|null>(null)

  const rateLimitCopy = (msg: string) =>
    msg.toLowerCase().includes("rate limit")
      ? "Too many attempts with this email. Please wait a few minutes or use a different address."
      : msg

  async function handleAdminSignup(e: React.FormEvent) {
    e.preventDefault()
    if (!founderRole) return
    setAdminLoading(true); setAdminError(null)
    const supabase = createClient()
    const redirect = siteOrigin() + "/auth/callback?intent=register&flow=signup"
    const { error: signUpError } = await supabase.auth.signUp({
      email: adminEmail,
      password: adminPassword,
      options: { data: { name: adminName, role: founderRole, central_signup: true }, emailRedirectTo: redirect },
    })
    if (signUpError) {
      setAdminError(rateLimitCopy(signUpError.message))
      setAdminLoading(false); return
    }
    setPendingEmail(adminEmail); setPendingRedirect(redirect); setPendingView("admin")
    setResendStatus(null); setAdminLoading(false); setView("check-email")
  }

  async function handleAdminGoogle() {
    if (isNativeShell()) {
      setAdminError(null)
      const res = await signInWithGoogleNative("signup")
      if (res.ok) { window.location.assign("/onboarding"); return }
      if (res.error === "failed") setAdminError("Google sign-in didn't complete — please try again.")
      else if (res.error === "unavailable") setAdminError("Google sign-in needs the latest app version — update Central and try again.")
      return
    }
    const supabase = createClient()
    await supabase.auth.signInWithOAuth({ provider: "google", options: { redirectTo: siteOrigin() + "/auth/callback?intent=register&flow=signup" } })
  }

  async function handleAdminApple() {
    if (isNativeShell()) {
      setAdminError(null)
      const res = await signInWithAppleNative("signup")
      if (res.ok) { window.location.assign("/onboarding"); return }
      if (res.error === "failed") setAdminError("Apple sign-in didn't complete — make sure this device is signed in to an Apple ID (Settings), then try again.")
      if (res.error !== "unavailable") return
      // plugin missing from this binary — fall through to the web flow
    }
    const supabase = createClient()
    await supabase.auth.signInWithOAuth({ provider: "apple", options: { redirectTo: siteOrigin() + "/auth/callback?intent=register&flow=signup" } })
  }

  const currentYear = new Date().getFullYear()
  const gradYearNum = parseInt(graduationYear, 10)
  const gradYearValid = gradYearNum >= currentYear && gradYearNum <= currentYear + 6

  async function handleMemberSignup(e: React.FormEvent) {
    e.preventDefault()
    if (!gradYearValid) { setMemberError("Please enter a valid graduation year."); return }
    setMemberLoading(true); setMemberError(null)
    const supabase = createClient()
    const redirect = siteOrigin() + "/auth/callback?flow=signup"
    const { error: signUpError } = await supabase.auth.signUp({
      email: memberEmail,
      password: memberPassword,
      options: { data: { name: memberName, graduation_year: String(gradYearNum), gender, central_signup: true }, emailRedirectTo: redirect },
    })
    if (signUpError) {
      setMemberError(rateLimitCopy(signUpError.message))
      setMemberLoading(false); return
    }
    setPendingEmail(memberEmail); setPendingRedirect(redirect); setPendingView("member")
    setResendStatus(null); setMemberLoading(false); setView("check-email")
  }

  async function handleMemberGoogle() {
    if (isNativeShell()) {
      setMemberError(null)
      const res = await signInWithGoogleNative("signup")
      if (res.ok) { window.location.assign("/ministries?tab=code"); return }
      if (res.error === "failed") setMemberError("Google sign-in didn't complete — please try again.")
      else if (res.error === "unavailable") setMemberError("Google sign-in needs the latest app version — update Central and try again.")
      return
    }
    const supabase = createClient()
    await supabase.auth.signInWithOAuth({ provider: "google", options: { redirectTo: siteOrigin() + "/auth/callback?flow=signup" } })
  }

  async function handleMemberApple() {
    if (isNativeShell()) {
      setMemberError(null)
      const res = await signInWithAppleNative("signup")
      // Mirrors the web callback's intent=join landing — a fresh member goes to
      // the join flow, never the marketing landing (hidden in the shell anyway).
      if (res.ok) { window.location.assign("/ministries?tab=code"); return }
      if (res.error === "failed") setMemberError("Apple sign-in didn't complete — make sure this device is signed in to an Apple ID (Settings), then try again.")
      if (res.error !== "unavailable") return
      // plugin missing from this binary — fall through to the web flow
    }
    const supabase = createClient()
    await supabase.auth.signInWithOAuth({ provider: "apple", options: { redirectTo: siteOrigin() + "/auth/callback?flow=signup" } })
  }

  async function handleResend() {
    setResendLoading(true); setResendStatus(null)
    const supabase = createClient()
    const { error } = await supabase.auth.resend({
      type: "signup",
      email: pendingEmail,
      options: { emailRedirectTo: pendingRedirect },
    })
    setResendLoading(false)
    setResendStatus(error
      ? { ok: false, msg: rateLimitCopy(error.message) }
      : { ok: true, msg: "Confirmation email sent again." })
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

  // ── CHECK EMAIL (confirmation sent) ────────────────────────────
  if (view === "check-email") return (<>
    <div className="hidden md:block">
    <SplitShell topBar={<>{alreadyHaveAccount}</>}>
      <div style={mono}>CHECK YOUR INBOX · CENTRAL</div>
      <h1 style={{ ...serif, fontWeight: 600, fontSize: 44, lineHeight: 1.03, letterSpacing: "-0.02em", margin: "14px 0 0" }}>
        Check your email.
      </h1>
      <p style={{ fontSize: 16, color: "var(--body)", lineHeight: 1.6, margin: "16px 0 0" }}>
        We sent a confirmation link to{" "}
        <span style={{ color: "var(--ink)", fontWeight: 500 }}>{pendingEmail}</span>.
        Open it to finish setting up your account — the link signs you in and takes you to the next step.
      </p>

      <div style={{ display: "flex", flexDirection: "column", gap: 12, marginTop: 30 }}>
        <button type="button" onClick={handleResend} disabled={resendLoading} style={{
          width: "100%", padding: "13px 18px", borderRadius: 12,
          background: "var(--cream-panel)", border: "1px solid var(--line-2)", color: "var(--ink)",
          fontSize: 15, fontWeight: 500, fontFamily: SANS, cursor: resendLoading ? "default" : "pointer",
          display: "flex", alignItems: "center", justifyContent: "center", gap: 10,
          opacity: resendLoading ? 0.7 : 1, transition: "background .15s",
        }} className="hover:bg-[var(--ivory)]">
          {resendLoading && <Spinner/>}
          {resendLoading ? "Sending…" : "Resend email"}
        </button>
        {resendStatus && (
          <div style={{ fontSize: 13, color: resendStatus.ok ? "var(--body)" : "var(--danger)" }} role="status">
            {resendStatus.msg}
          </div>
        )}
      </div>

      <div style={{ marginTop: 26, paddingTop: 22, borderTop: "1px solid var(--line)", fontSize: 13, color: "var(--body)" }}>
        Wrong address?{" "}
        <button type="button" onClick={() => { setResendStatus(null); setView(pendingView) }}
          style={{ color: "var(--plum-2)", fontWeight: 500, background: "none", border: "none", cursor: "pointer", padding: 0, fontFamily: SANS, fontSize: 13 }}
          className="hover:underline underline-offset-2">
          Go back
        </button>
      </div>
    </SplitShell>
    </div>

    {/* ── Mobile ── */}
    <div className="md:hidden">
      <PocketAuthScreen topInset>
        <div style={{ marginTop: 8 }}>
          <div style={mono}>Check your inbox</div>
          <h1 style={{ ...pocketH1, marginTop: 8 }}>Check your email.</h1>
        </div>
        <p style={{ ...pocketSub, marginTop: 14 }}>
          We sent a confirmation link to <span style={{ color: "var(--ink)", fontWeight: 600 }}>{pendingEmail}</span>. Open it to finish setting up your account — the link signs you in and takes you to the next step.
        </p>
        <button type="button" onClick={handleResend} disabled={resendLoading} style={{
          ...pocketPillCard, marginTop: 26,
          opacity: resendLoading ? 0.7 : 1, cursor: resendLoading ? "default" : "pointer",
        }}>
          {resendLoading && <Spinner/>}
          {resendLoading ? "Sending…" : "Resend email"}
        </button>
        {resendStatus && (
          <div style={{ fontSize: 13, color: resendStatus.ok ? "var(--body)" : "var(--danger)", marginTop: 12, textAlign: "center" }} role="status">
            {resendStatus.msg}
          </div>
        )}
        <div style={{ marginTop: 22, paddingTop: 20, borderTop: "1px solid var(--line-3)", fontSize: 13.5, color: "var(--body)", textAlign: "center" }}>
          Wrong address?{" "}
          <button type="button" onClick={() => { setResendStatus(null); setView(pendingView) }}
            style={{ color: "var(--plum)", fontWeight: 600, background: "none", border: "none", cursor: "pointer", padding: 0, fontFamily: SERIF, fontSize: 13.5 }}>
            Go back
          </button>
        </div>
      </PocketAuthScreen>
    </div>
  </>)

  // ── ROLE CHOICE ────────────────────────────────────────────────
  if (view === "role-choice") return (<>
    <div className="hidden md:block">
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
    </div>

    {/* ── Mobile ── */}
    <div className="md:hidden">
      <PocketAuthScreen>
        <PocketBack href="/" />
        <div style={{ marginTop: 20 }}>
          <div style={mono}>Get started</div>
          <h1 style={{ ...pocketH1, marginTop: 8 }}>How are you joining?</h1>
        </div>
        <p style={{ ...pocketSub, marginTop: 14 }}>Two ways into Central — start a ministry, or join one that&apos;s already here.</p>
        <div style={{ display: "flex", flexDirection: "column", gap: 12, marginTop: 26 }}>
          <MPathTile
            icon={<Icon d="M3 11l9-8 9 8M5 10v10h14V10" size={20}/>}
            title="Register a church"
            body="I'm a pastor, deacon, or elder starting a new ministry."
            onClick={() => setView("admin")}
          />
          <MPathTile
            icon={<Icon d="M16 21v-2a4 4 0 00-4-4H6a4 4 0 00-4 4v2M22 21v-2a4 4 0 00-3-3.87M9 11a4 4 0 100-8 4 4 0 000 8zm7-8a4 4 0 010 7.75" size={20}/>}
            title="Join a ministry"
            body="I'm a student or member joining an existing ministry."
            onClick={() => setView("member")}
          />
        </div>
      </PocketAuthScreen>
    </div>
  </>)

  // ── ADMIN (register a church) ──────────────────────────────────
  if (view === "admin") return (<>
    <div className="hidden md:block">
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
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <AppleButton onClick={handleAdminApple}/>
          {(!nativeShell || googleInShell) && <GoogleButton onClick={handleAdminGoogle}/>}
        </div>
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
        <p style={{ fontSize: 12, color: "var(--muted-text)", lineHeight: 1.5, textAlign: "center", margin: "-4px 0 0" }}>
          By creating an account you agree to our{" "}
          <Link href="/terms" style={{ color: "var(--plum-2)", fontWeight: 500, textDecoration: "none" }} className="hover:underline underline-offset-2">Terms of Service</Link>
          {" "}and{" "}
          <Link href="/privacy" style={{ color: "var(--plum-2)", fontWeight: 500, textDecoration: "none" }} className="hover:underline underline-offset-2">Privacy Policy</Link>.
        </p>
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
    </div>

    {/* ── Mobile ── */}
    <div className="md:hidden">
      <PocketAuthScreen topInset={intent === "register"}>
        {intent !== "register" && <PocketBack onClick={() => setView("role-choice")} />}
        <div style={{ marginTop: intent !== "register" ? 20 : 8 }}>
          <div style={mono}>Register a church · Step 1 of 2</div>
          <h1 style={{ ...pocketH1, marginTop: 8 }}>Register your church.</h1>
        </div>
        <p style={{ ...pocketSub, marginTop: 14 }}>Create your admin account — you&apos;ll set up the workspace next.</p>
        {/* Apple first + Google hidden in the native shell — mirrors the desktop
            branch (App Store 4.8 SIWA prominence). */}
        <button type="button" onClick={handleAdminApple} style={{ ...pocketPillCard, marginTop: 22 }}>
          <AppleGlyph size={18}/> Continue with Apple
        </button>
        {!nativeShell && (
          <button type="button" onClick={handleAdminGoogle} style={{ ...pocketPillCard, marginTop: 10 }}>
            <GoogleGlyph size={18}/> Continue with Google
          </button>
        )}
        <div style={{ margin: "18px 0" }}><OrDivider/></div>
        {adminError && <PocketError msg={adminError}/>}
        <form onSubmit={handleAdminSignup} style={{ display: "flex", flexDirection: "column", gap: 16, marginTop: 4 }}>
          <PocketField label="Full name" placeholder="Pastor John Smith" value={adminName} onChange={(e) => setAdminName(e.target.value)} required autoComplete="name"/>
          <PocketField label="Email" type="email" placeholder="you@example.com" value={adminEmail} onChange={(e) => setAdminEmail(e.target.value)} required autoComplete="email"/>
          <PocketField label="Password" type={adminShowPw ? "text" : "password"} placeholder="••••••••" value={adminPassword} onChange={(e) => setAdminPassword(e.target.value)} required autoComplete="new-password"
            hint="At least 6 characters." trailing={<EyeButton show={adminShowPw} onToggle={() => setAdminShowPw(v => !v)}/>}/>
          <div>
            <span style={pocketFieldLabel}>Your role</span>
            <div style={{ display: "flex", gap: 8 }}>
              {ROLES.map(r => <MSelectTile key={r.key} title={r.title} sub={r.sub} on={founderRole === r.key} onClick={() => setFounderRole(r.key)}/>)}
            </div>
          </div>
          <PocketSubmit loading={adminLoading} disabled={!founderRole || adminLoading}>
            {adminLoading ? "Creating account…" : "Create account"}
          </PocketSubmit>
          {!founderRole && !adminLoading && (
            <div style={{ fontSize: 13, color: "var(--muted-text)", textAlign: "center", marginTop: -8 }}>Select your role to continue.</div>
          )}
          <p style={{ fontSize: 12, color: "var(--muted-text)", lineHeight: 1.5, textAlign: "center", margin: "-4px 0 0" }}>
            By creating an account you agree to our{" "}
            <Link href="/terms" style={{ color: "var(--plum)", fontWeight: 500, textDecoration: "none" }}>Terms of Service</Link>
            {" "}and{" "}
            <Link href="/privacy" style={{ color: "var(--plum)", fontWeight: 500, textDecoration: "none" }}>Privacy Policy</Link>.
          </p>
        </form>
        <div style={{ marginTop: 22, paddingTop: 20, borderTop: "1px solid var(--line-3)", fontSize: 13.5, color: "var(--body)", textAlign: "center" }}>
          Not a pastor, deacon, or elder?{" "}
          <button type="button" onClick={() => setView("member")}
            style={{ color: "var(--plum)", fontWeight: 600, background: "none", border: "none", cursor: "pointer", padding: 0, fontFamily: SERIF, fontSize: 13.5 }}>
            Join instead →
          </button>
        </div>
      </PocketAuthScreen>
    </div>
  </>)

  // ── MEMBER (join a ministry) ────────────────────────────────────
  return (<>
    <div className="hidden md:block">
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
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <AppleButton onClick={handleMemberApple}/>
          {(!nativeShell || googleInShell) && <GoogleButton onClick={handleMemberGoogle}/>}
        </div>
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
        <p style={{ fontSize: 12, color: "var(--muted-text)", lineHeight: 1.5, textAlign: "center", margin: "-4px 0 0" }}>
          By creating an account you agree to our{" "}
          <Link href="/terms" style={{ color: "var(--plum-2)", fontWeight: 500, textDecoration: "none" }} className="hover:underline underline-offset-2">Terms of Service</Link>
          {" "}and{" "}
          <Link href="/privacy" style={{ color: "var(--plum-2)", fontWeight: 500, textDecoration: "none" }} className="hover:underline underline-offset-2">Privacy Policy</Link>.
        </p>
      </form>

    </SplitShell>
    </div>

    {/* ── Mobile ── */}
    <div className="md:hidden">
      <PocketAuthScreen>
        <PocketBack onClick={() => setView("role-choice")} />
        <div style={{ marginTop: 20 }}>
          <div style={mono}>Join a ministry</div>
          <h1 style={{ ...pocketH1, marginTop: 8 }}>Create your account.</h1>
        </div>
        <p style={{ ...pocketSub, marginTop: 14 }}>Get started with Central in minutes.</p>
        {/* Apple first + Google hidden in the native shell — mirrors desktop. */}
        <button type="button" onClick={handleMemberApple} style={{ ...pocketPillCard, marginTop: 22 }}>
          <AppleGlyph size={18}/> Continue with Apple
        </button>
        {!nativeShell && (
          <button type="button" onClick={handleMemberGoogle} style={{ ...pocketPillCard, marginTop: 10 }}>
            <GoogleGlyph size={18}/> Continue with Google
          </button>
        )}
        <div style={{ margin: "18px 0" }}><OrDivider/></div>
        {memberError && <PocketError msg={memberError}/>}
        <form onSubmit={handleMemberSignup} style={{ display: "flex", flexDirection: "column", gap: 16, marginTop: 4 }}>
          <PocketField label="Full name" placeholder="Brian Jeong" value={memberName} onChange={(e) => setMemberName(e.target.value)} required autoComplete="name"/>
          <div>
            <span style={pocketFieldLabel}>Gender</span>
            <div style={{ fontSize: 12.5, color: "var(--faint)", margin: "-2px 0 8px", paddingLeft: 4 }}>Helps us place you in the right small group.</div>
            <div style={{ display: "flex", gap: 8 }}>
              {["Male", "Female"].map(g => (
                <MGenderPill key={g} label={g} on={gender === g.toLowerCase()} onClick={() => setGender(g.toLowerCase())}/>
              ))}
            </div>
          </div>
          <PocketField label="Email" type="email" placeholder="you@example.com" value={memberEmail} onChange={(e) => setMemberEmail(e.target.value)} required autoComplete="email"/>
          <PocketField label="Password" type={memberShowPw ? "text" : "password"} placeholder="••••••••" value={memberPassword} onChange={(e) => setMemberPassword(e.target.value)} required autoComplete="new-password"
            hint="At least 6 characters." trailing={<EyeButton show={memberShowPw} onToggle={() => setMemberShowPw(v => !v)}/>}/>
          <PocketField label="Graduation year" type="number" placeholder={String(currentYear + 2)} value={graduationYear} onChange={(e) => setGraduationYear(e.target.value)}
            hint={`Enter the year you graduate (e.g. ${currentYear + 1}, ${currentYear + 2}).`}/>
          <PocketSubmit loading={memberLoading} disabled={!gradYearValid || !gender || memberLoading}>
            {memberLoading ? "Creating account…" : "Create account"}
          </PocketSubmit>
          {(!gradYearValid || !gender) && !memberLoading && (
            <div style={{ fontSize: 13, color: "var(--muted-text)", textAlign: "center", marginTop: -8 }}>
              {!gender ? "Select your gender to continue." : "Enter a valid graduation year."}
            </div>
          )}
          <p style={{ fontSize: 12, color: "var(--muted-text)", lineHeight: 1.5, textAlign: "center", margin: "-4px 0 0" }}>
            By creating an account you agree to our{" "}
            <Link href="/terms" style={{ color: "var(--plum)", fontWeight: 500, textDecoration: "none" }}>Terms of Service</Link>
            {" "}and{" "}
            <Link href="/privacy" style={{ color: "var(--plum)", fontWeight: 500, textDecoration: "none" }}>Privacy Policy</Link>.
          </p>
        </form>
      </PocketAuthScreen>
    </div>
  </>)
}

export default function SignupPage() {
  return <Suspense><SignupContent/></Suspense>
}
