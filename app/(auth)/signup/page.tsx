"use client"

import { Suspense, useState } from "react"
import Link from "next/link"
import { AlertCircle } from "lucide-react"
import { useSearchParams } from "next/navigation"
import { createClient, siteOrigin } from "@/lib/supabase"
import { Spinner } from "@/app/home/components/shared"
import { SplitShell, GoogleButton, AppleButton, AppleGlyph, GoogleGlyph, OrDivider, EyeButton,
  PocketAuthScreen, PocketBack, PocketField, PocketSelect, PocketSubmit, PocketError,
  AuthSelect, AuthPendingVeil, gradYearOptions,
  pocketPillCard, pocketFieldLabel, pocketFieldBox, pocketH1, pocketSub } from "@/app/(auth)/shared"
import { isNativeShell, useIsNativeShell, signInWithAppleNative, signInWithGoogleNative, googleNativeConfigured, routeAfterNativeSignIn, nativeAuthDebugMessage, googleNativeFailureMessage } from "@/lib/native-auth"
import { EYEBROW_STYLE as mono } from "@/components/central/typography"
import { CentralButton } from "@/components/central"
import { inviteReturnPath, codeFromReturnPath } from "@/lib/invite-code"
import { YOUNG_ADULT } from "@/lib/cohort"
import { YoungAdultCheck } from "../shared"

const SERIF = "var(--font-instrument-serif)"
const SANS  = "var(--font-inter)"
const serif: React.CSSProperties = { fontFamily: SERIF, fontWeight: 400, color: "var(--ink)", margin: 0 }

type View = "role-choice" | "admin" | "member" | "verify-code"

// Shown when signUp resolves to an address that already has an account. The signup
// screens already carry an "Already have an account? Sign in" link, so this only has to
// name the situation — the next step is already on screen.
const EXISTING_ACCOUNT_MSG =
  "An account with this email already exists. Sign in instead — or reset your password if you've forgotten it."

// One label for every pending-veil moment on this page.
const SETTING_UP = "Setting up your account…"

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
      {helper && <div style={{ fontSize: 12, color: "var(--muted-text)", marginTop: 8 }}>{helper}</div>}
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
  // Invite ride-along — see lib/invite-code.ts. `invitePath` is null unless the param
  // is a well-formed code, so every landing below falls back safely.
  const invite = searchParams.get("invite")
  const invitePath = inviteReturnPath(invite)
  const loginHref = (() => {
    const q = new URLSearchParams()
    if (intent) q.set("intent", intent)
    if (invitePath) q.set("invite", codeFromReturnPath(invitePath))
    const qs = q.toString()
    return qs ? `/login?${qs}` : "/login"
  })()
  // intent=join already ANSWERS "how are you joining?" — it is only ever set by the
  // invite landing and by the login page's no-account CTA, both of which know the
  // person is joining an existing ministry. Making them re-answer it is the extra
  // hop that made a rejected Google sign-in feel like being sent back to the start.
  // role-choice stays reachable from this view's own Back control.
  const [view, setView] = useState<View>(
    intent === "register" ? "admin" : intent === "join" ? "member" : "role-choice"
  )
  // Google web-OAuth can't run inside the WKWebView — the shell uses the native
  // Google sheet instead, shown only once the iOS client ID is configured
  // (see app/(auth)/login/page.tsx for the full rationale).
  const nativeShell = useIsNativeShell()
  const googleInShell = googleNativeConfigured()

  // Full-screen "something is happening" cover for the waits with no button to
  // spin: the OAuth round trip (native sheet → signInWithIdToken → mint guard),
  // the web provider redirect, and the window.location.assign handoff after a
  // verified code. Holds a label, null when idle; cleared ONLY on failure —
  // on success we are navigating and the form must not flash back.
  const [pending, setPending] = useState<string | null>(null)

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
  const [isYoungAdult,     setIsYoungAdult]     = useState(false)
  const [gender,           setGender]           = useState("")
  const [memberError,      setMemberError]      = useState<string|null>(null)
  const [memberLoading,    setMemberLoading]    = useState(false)

  // verify-code state — which email was used, its confirmation redirect (kept as a
  // harmless fallback link), and which form to return to via "Go back". Field state
  // is preserved on return.
  const [pendingEmail,    setPendingEmail]    = useState("")
  const [pendingRedirect, setPendingRedirect] = useState("")
  const [pendingView,     setPendingView]     = useState<"admin"|"member">("admin")
  const [resendLoading,   setResendLoading]   = useState(false)
  const [resendStatus,    setResendStatus]    = useState<{ ok: boolean; msg: string }|null>(null)
  // The 6-digit email-confirmation code the user types in-app (replaces the link).
  const [code,          setCode]          = useState("")
  const [verifyLoading, setVerifyLoading] = useState(false)
  const [verifyError,   setVerifyError]   = useState<string|null>(null)

  // ── Already-registered email ────────────────────────────────────────────────
  // Supabase's email-enumeration protection makes signUp on an address that already
  // has an account return HTTP 200 with a SYNTHETIC user and send no email at all.
  // `identities: []` is the only reliable signal — `confirmation_sent_at` IS populated
  // on that fake user even though nothing was sent, so it can't be used. Without this
  // check the caller advances to the verify-code screen and waits forever for a code
  // that was never sent (the "signed up twice and got nothing" dead end).
  //
  // Note this deliberately trades a little enumeration resistance for a usable signup:
  // saying "this email is taken" confirms the address is registered. Standard practice
  // for consumer apps, and the alternative is stranding real people with no explanation.
  const isExistingAccount = (d: { user: { identities?: unknown[] | null } | null } | null) =>
    !!d?.user && Array.isArray(d.user.identities) && d.user.identities.length === 0

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
    const { data: signUpData, error: signUpError } = await supabase.auth.signUp({
      email: adminEmail,
      password: adminPassword,
      options: { data: { name: adminName, role: founderRole, central_signup: true }, emailRedirectTo: redirect },
    })
    if (signUpError) {
      setAdminError(rateLimitCopy(signUpError.message))
      setAdminLoading(false); return
    }
    if (isExistingAccount(signUpData)) {
      setAdminError(EXISTING_ACCOUNT_MSG)
      setAdminLoading(false); return
    }
    setPendingEmail(adminEmail); setPendingRedirect(redirect); setPendingView("admin")
    setResendStatus(null); setCode(""); setVerifyError(null); setAdminLoading(false); setView("verify-code")
  }

  async function handleAdminGoogle() {
    if (isNativeShell()) {
      setAdminError(null); setPending(SETTING_UP)
      const res = await signInWithGoogleNative("signup")
      if (res.ok) { window.location.assign("/onboarding"); return }
      setPending(null)
      // EVERY outcome except a deliberate cancel must say something. This used to
      // return silently for `no-account` and `not-entitled` — and `no-account` is
      // reachable here even though a signup can't be guard-rejected, because
      // native-auth maps ANY failed verification to it, including a session that
      // hadn't propagated yet. The tap looked like it did nothing. Same fix the
      // Apple handlers already carry.
      if (res.error !== "canceled") setAdminError(googleNativeFailureMessage(res))
      return
    }
    setPending(SETTING_UP)
    const supabase = createClient()
    // A failed redirect start leaves ZERO server-side trace — no /auth/callback,
    // no guard timing line — so it reads as "the button did nothing" and is
    // invisible in logs. Surface it and drop the veil rather than stranding the
    // user under a spinner on the page they were already on.
    const { error } = await supabase.auth.signInWithOAuth({ provider: "google", options: { redirectTo: siteOrigin() + "/auth/callback?intent=register&flow=signup" } })
    if (error) { setPending(null); setAdminError("Google sign-in couldn't start — please try again.") }
  }

  async function handleAdminApple() {
    if (isNativeShell()) {
      setAdminError(null); setPending(SETTING_UP)
      const res = await signInWithAppleNative("signup")
      if (res.ok) { window.location.assign("/onboarding"); return }
      // TEMP DIAGNOSTIC: show the raw reason for EVERY non-unavailable failure
      // (previously no-account/canceled returned silently — the "frozen" bug).
      if (res.error !== "unavailable") { setPending(null); setAdminError(nativeAuthDebugMessage(res)); return }
      // plugin missing from this binary — fall through to the web flow (veil stays up)
    }
    setPending(SETTING_UP)
    const supabase = createClient()
    // A failed redirect start leaves ZERO server-side trace — no /auth/callback,
    // no guard timing line — so it reads as "the button did nothing" and is
    // invisible in logs. Surface it and drop the veil rather than stranding the
    // user under a spinner on the page they were already on.
    const { error } = await supabase.auth.signInWithOAuth({ provider: "apple", options: { redirectTo: siteOrigin() + "/auth/callback?intent=register&flow=signup" } })
    if (error) { setPending(null); setAdminError("Apple sign-in couldn't start — please try again.") }
  }

  const currentYear = new Date().getFullYear()
  const gradYearNum = parseInt(graduationYear, 10)
  // A young adult has no graduating class to give, so the year requirement is
  // lifted rather than faked — see lib/cohort.ts for why that distinction has to
  // be explicit rather than inferred from a missing year.
  const gradYearValid = isYoungAdult || (gradYearNum >= currentYear && gradYearNum <= currentYear + 6)
  const yearOptions = (
    <>
      <option value="">Select your graduation year</option>
      {gradYearOptions(currentYear).map(y => <option key={y} value={String(y)}>{y}</option>)}
    </>
  )

  async function handleMemberSignup(e: React.FormEvent) {
    e.preventDefault()
    if (!gradYearValid) { setMemberError("Please enter a valid graduation year."); return }
    setMemberLoading(true); setMemberError(null)
    const supabase = createClient()
    const redirect = memberOauthRedirect(intent, invite)
    const { data: signUpData, error: signUpError } = await supabase.auth.signUp({
      email: memberEmail,
      password: memberPassword,
      options: {
        data: {
          name: memberName,
          // Exactly one of these is ever sent. A young adult carries the grade
          // sentinel and NO graduation year — the join flow reads it off this
          // metadata onto the profile (resolveSignupGrade in actions/ministry.ts),
          // because the handle_new_user trigger only copies name/email/grad year.
          ...(isYoungAdult ? { grade: YOUNG_ADULT } : { graduation_year: String(gradYearNum) }),
          gender,
          central_signup: true,
        },
        emailRedirectTo: redirect,
      },
    })
    if (signUpError) {
      setMemberError(rateLimitCopy(signUpError.message))
      setMemberLoading(false); return
    }
    if (isExistingAccount(signUpData)) {
      setMemberError(EXISTING_ACCOUNT_MSG)
      setMemberLoading(false); return
    }
    setPendingEmail(memberEmail); setPendingRedirect(redirect); setPendingView("member")
    setResendStatus(null); setCode(""); setVerifyError(null); setMemberLoading(false); setView("verify-code")
  }

  async function handleMemberGoogle() {
    if (isNativeShell()) {
      setMemberError(null); setPending(SETTING_UP)
      const res = await signInWithGoogleNative("signup")
      if (res.ok) { window.location.assign(invitePath ?? "/ministries?tab=code"); return }
      setPending(null)
      // See handleAdminGoogle — silence on anything but a deliberate cancel is what
      // left a real user tapping a button that appeared to do nothing.
      if (res.error !== "canceled") setMemberError(googleNativeFailureMessage(res))
      return
    }
    setPending(SETTING_UP)
    const supabase = createClient()
    // A failed redirect start leaves ZERO server-side trace — no /auth/callback,
    // no guard timing line — so it reads as "the button did nothing" and is
    // invisible in logs. Surface it and drop the veil rather than stranding the
    // user under a spinner on the page they were already on.
    const { error } = await supabase.auth.signInWithOAuth({ provider: "google", options: { redirectTo: memberOauthRedirect(intent, invite) } })
    if (error) { setPending(null); setMemberError("Google sign-in couldn't start — please try again.") }
  }

  async function handleMemberApple() {
    if (isNativeShell()) {
      setMemberError(null); setPending(SETTING_UP)
      const res = await signInWithAppleNative("signup")
      // Mirrors the web callback's intent=join landing — a fresh member goes to
      // the join flow, never the marketing landing (hidden in the shell anyway).
      if (res.ok) { window.location.assign(invitePath ?? "/ministries?tab=code"); return }
      // TEMP DIAGNOSTIC: show the raw reason for EVERY non-unavailable failure
      // (previously no-account/canceled returned silently — the "frozen" bug).
      if (res.error !== "unavailable") { setPending(null); setMemberError(nativeAuthDebugMessage(res)); return }
      // plugin missing from this binary — fall through to the web flow (veil stays up)
    }
    setPending(SETTING_UP)
    const supabase = createClient()
    // A failed redirect start leaves ZERO server-side trace — no /auth/callback,
    // no guard timing line — so it reads as "the button did nothing" and is
    // invisible in logs. Surface it and drop the veil rather than stranding the
    // user under a spinner on the page they were already on.
    const { error } = await supabase.auth.signInWithOAuth({ provider: "apple", options: { redirectTo: memberOauthRedirect(intent, invite) } })
    if (error) { setPending(null); setMemberError("Apple sign-in couldn't start — please try again.") }
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
      : { ok: true, msg: "New code sent — check your inbox." })
  }

  // Confirm the email IN-APP with the 6-digit code (replaces the email LINK, which
  // the native shell can't deep-link back from). verifyOtp confirms + mints a
  // session in the browser client on success; an invalid/expired token returns an
  // error and creates NO session. handle_new_user already created the profile row
  // + the central_signup marker at signUp time, so this path skips /auth/callback
  // without skipping anything security-relevant (email ownership is proven by the
  // code; the OAuth mint-guard is for OAuth mints, not email OTP).
  async function handleVerifyCode(e: React.FormEvent) {
    e.preventDefault()
    const token = code.replace(/\D/g, "")
    if (token.length !== 6) { setVerifyError("Enter the 6-digit code from your email."); return }
    setVerifyLoading(true); setVerifyError(null)
    const supabase = createClient()
    const { error } = await supabase.auth.verifyOtp({ email: pendingEmail, token, type: "signup" })
    if (error) {
      // Supabase returns a single combined "Token has expired or is invalid"
      // for both a wrong AND an expired code, so we don't assert which it was.
      setVerifyError(
        error.message.toLowerCase().includes("rate limit")
          ? rateLimitCopy(error.message)
          : "That code is incorrect or has expired. Double-check your email, or resend a new one.")
      setVerifyLoading(false); return
    }
    // Session established in-app. Route exactly as the post-signup path intends —
    // admin registrants set up the workspace; members go where login/callback send
    // a fresh sign-in (active ministries: 1→/home, >1→/pick-ministry, 0→/ministries).
    // routeAfterNativeSignIn runs two queries before it navigates — cover them.
    setPending(SETTING_UP)
    if (pendingView === "admin") { window.location.assign("/onboarding"); return }
    // This path self-routes and never reaches /auth/callback, so the invite has to be
    // honoured here explicitly or a scanned link silently lands on /ministries.
    if (invitePath) { window.location.assign(invitePath); return }
    await routeAfterNativeSignIn(supabase)
  }

  const ROLES = [
    { key: "pastor" as const, title: "Pastor",  sub: "Senior leader" },
    { key: "deacon" as const, title: "Deacon",  sub: "Servant leader" },
    { key: "elder"  as const, title: "Elder",   sub: "Elder board" },
  ]

  const alreadyHaveAccount = (
    <span>
      Already have an account?{" "}
      <Link href={loginHref} style={{ color: "var(--plum-2)", fontWeight: 500, textDecoration: "none" }} className="hover:underline underline-offset-2">
        Sign in
      </Link>
    </span>
  )

  // ── VERIFY CODE (email confirmation via in-app 6-digit code) ───
  const codeInputProps = {
    value: code,
    onChange: (e: React.ChangeEvent<HTMLInputElement>) =>
      setCode(e.target.value.replace(/\D/g, "").slice(0, 6)),
    inputMode: "numeric" as const,
    autoComplete: "one-time-code",
    pattern: "[0-9]*",
    maxLength: 6,
    placeholder: "000000",
    autoFocus: true,
    "aria-label": "6-digit confirmation code",
  }
  if (view === "verify-code") return (<>
    {pending && <AuthPendingVeil label={pending} />}
    <div className="hidden md:block">
    <SplitShell topBar={<>{alreadyHaveAccount}</>}>
      <div style={mono}>VERIFY YOUR EMAIL · CENTRAL</div>
      <h1 style={{ ...serif, fontWeight: 600, fontSize: 44, lineHeight: 1.03, letterSpacing: "-0.02em", margin: "14px 0 0" }}>
        Enter your code.
      </h1>
      <p style={{ fontSize: 16, color: "var(--body)", lineHeight: 1.6, margin: "16px 0 0" }}>
        We sent a 6-digit code to{" "}
        <span style={{ color: "var(--ink)", fontWeight: 500 }}>{pendingEmail}</span>.
        Enter it below to finish setting up your account.
      </p>

      <form onSubmit={handleVerifyCode} style={{ marginTop: 28 }}>
        {verifyError && <div style={{ marginBottom: 16 }}><ErrorBanner msg={verifyError}/></div>}
        <div style={{ ...mono, marginBottom: 8 }}>CONFIRMATION CODE</div>
        <div style={{ display: "flex", alignItems: "center", background: "var(--cream-panel)", border: "1px solid var(--line-2)", borderRadius: 10, padding: "0 14px" }}>
          <input
            {...codeInputProps}
            style={{
              flex: 1, border: "none", outline: "none", background: "transparent", padding: "14px 0",
              fontFamily: SANS, fontSize: 24, fontWeight: 500, letterSpacing: "0.42em",
              textAlign: "center", color: "var(--ink)",
            }}
          />
        </div>
        <div style={{ marginTop: 24 }}>
          <Primary disabled={code.length !== 6 || verifyLoading} loading={verifyLoading}>
            {verifyLoading ? "Verifying…" : "Verify & continue"}
          </Primary>
        </div>
      </form>

      <div style={{ display: "flex", flexDirection: "column", gap: 12, marginTop: 24 }}>
        <div style={{ fontSize: 13, color: "var(--body)" }}>
          Didn&apos;t get it? Check spam, or{" "}
          <button type="button" onClick={handleResend} disabled={resendLoading}
            style={{ color: "var(--plum-2)", fontWeight: 500, background: "none", border: "none", cursor: resendLoading ? "default" : "pointer", padding: 0, fontFamily: SANS, fontSize: 13, opacity: resendLoading ? 0.7 : 1 }}
            className="hover:underline underline-offset-2">
            {resendLoading ? "sending…" : "resend the code"}
          </button>.
        </div>
        {resendStatus && (
          <div style={{ fontSize: 13, color: resendStatus.ok ? "var(--body)" : "var(--danger)" }} role="status">
            {resendStatus.msg}
          </div>
        )}
      </div>

      <div style={{ marginTop: 26, paddingTop: 22, borderTop: "1px solid var(--line)", fontSize: 13, color: "var(--body)" }}>
        Wrong address?{" "}
        <button type="button" onClick={() => { setResendStatus(null); setVerifyError(null); setView(pendingView) }}
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
          <div style={mono}>Verify your email</div>
          <h1 style={{ ...pocketH1, marginTop: 8 }}>Enter your code.</h1>
        </div>
        <p style={{ ...pocketSub, marginTop: 14 }}>
          We sent a 6-digit code to <span style={{ color: "var(--ink)", fontWeight: 600 }}>{pendingEmail}</span>. Enter it below to finish setting up your account.
        </p>
        {verifyError && <PocketError msg={verifyError}/>}
        <form onSubmit={handleVerifyCode} style={{ marginTop: 24 }}>
          <span style={pocketFieldLabel}>Confirmation code</span>
          <div style={{ ...pocketFieldBox, padding: "0 18px" }}>
            <input
              {...codeInputProps}
              style={{
                flex: 1, minWidth: 0, border: "none", outline: "none", background: "transparent",
                fontSize: 24, fontWeight: 600, letterSpacing: "0.4em", textAlign: "center",
                fontFamily: SERIF, color: "var(--ink)", padding: "14px 0",
              }}
            />
          </div>
          <PocketSubmit loading={verifyLoading} disabled={code.length !== 6 || verifyLoading}>
            {verifyLoading ? "Verifying…" : "Verify & continue"}
          </PocketSubmit>
        </form>
        <div style={{ fontSize: 13.5, color: "var(--body)", marginTop: 18, textAlign: "center", lineHeight: 1.5 }}>
          Didn&apos;t get it? Check spam, or{" "}
          <button type="button" onClick={handleResend} disabled={resendLoading}
            style={{ color: "var(--plum)", fontWeight: 600, background: "none", border: "none", cursor: resendLoading ? "default" : "pointer", padding: 0, fontFamily: SERIF, fontSize: 13.5, opacity: resendLoading ? 0.7 : 1 }}>
            {resendLoading ? "sending…" : "resend the code"}
          </button>.
        </div>
        {resendStatus && (
          <div style={{ fontSize: 13, color: resendStatus.ok ? "var(--body)" : "var(--danger)", marginTop: 10, textAlign: "center" }} role="status">
            {resendStatus.msg}
          </div>
        )}
        <div style={{ marginTop: 22, paddingTop: 20, borderTop: "1px solid var(--line-3)", fontSize: 13.5, color: "var(--body)", textAlign: "center" }}>
          Wrong address?{" "}
          <button type="button" onClick={() => { setResendStatus(null); setVerifyError(null); setView(pendingView) }}
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
    {pending && <AuthPendingVeil label={pending} />}
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
        <OrDivider label="or sign up with email"/>

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
        {/* Same gate as the desktop branch above: hidden in the shell ONLY while
            no iOS OAuth client is configured. This read `!nativeShell` alone, which
            hid Google on phone-width signup even once the client ID existed — the
            desktop branch would offer it and this would not. */}
        {(!nativeShell || googleInShell) && (
          <button type="button" onClick={handleAdminGoogle} style={{ ...pocketPillCard, marginTop: 10 }}>
            <GoogleGlyph size={18}/> Continue with Google
          </button>
        )}
        <div style={{ margin: "18px 0" }}><OrDivider label="or sign up with email"/></div>
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
    {pending && <AuthPendingVeil label={pending} />}
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
        <OrDivider label="or sign up with email"/>

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

        {!isYoungAdult && (
          <AuthSelect
            label="GRADUATION YEAR"
            value={graduationYear}
            onChange={(e) => setGraduationYear(e.target.value)}
            helper="The year you graduate — it places you in the right class."
          >
            {yearOptions}
          </AuthSelect>
        )}

        <YoungAdultCheck on={isYoungAdult} onToggle={() => setIsYoungAdult(v => !v)}/>

        <Primary disabled={!gradYearValid || !gender || memberLoading} loading={memberLoading}>
          {memberLoading ? "Creating account…" : "Create account"}
        </Primary>
        {(!gradYearValid || !gender) && !memberLoading && (
          <div style={{ fontSize: 13, color: "var(--muted-text)", textAlign: "center", marginTop: -6 }}>
            {!gender ? "Select your gender to continue." : "Select your graduation year, or tick \u201cI\u2019m a young adult\u201d."}
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
        {/* Apple first, then Google — and Google is hidden in the shell ONLY while
            no iOS OAuth client is configured, exactly as the desktop branch does.
            The comment here used to claim it mirrored desktop while gating on
            `!nativeShell` alone, so a configured client showed Google on desktop
            signup and never on the phone. */}
        <button type="button" onClick={handleMemberApple} style={{ ...pocketPillCard, marginTop: 22 }}>
          <AppleGlyph size={18}/> Continue with Apple
        </button>
        {(!nativeShell || googleInShell) && (
          <button type="button" onClick={handleMemberGoogle} style={{ ...pocketPillCard, marginTop: 10 }}>
            <GoogleGlyph size={18}/> Continue with Google
          </button>
        )}
        <div style={{ margin: "18px 0" }}><OrDivider label="or sign up with email"/></div>
        {memberError && <PocketError msg={memberError}/>}
        <form onSubmit={handleMemberSignup} style={{ display: "flex", flexDirection: "column", gap: 16, marginTop: 4 }}>
          <PocketField label="Full name" placeholder="Brian Jeong" value={memberName} onChange={(e) => setMemberName(e.target.value)} required autoComplete="name"/>
          <div>
            <span style={pocketFieldLabel}>Gender</span>
            <div style={{ fontSize: 12.5, color: "var(--muted-text)", margin: "-2px 0 8px", paddingLeft: 4 }}>Helps us place you in the right small group.</div>
            <div style={{ display: "flex", gap: 8 }}>
              {["Male", "Female"].map(g => (
                <MGenderPill key={g} label={g} on={gender === g.toLowerCase()} onClick={() => setGender(g.toLowerCase())}/>
              ))}
            </div>
          </div>
          <PocketField label="Email" type="email" placeholder="you@example.com" value={memberEmail} onChange={(e) => setMemberEmail(e.target.value)} required autoComplete="email"/>
          <PocketField label="Password" type={memberShowPw ? "text" : "password"} placeholder="••••••••" value={memberPassword} onChange={(e) => setMemberPassword(e.target.value)} required autoComplete="new-password"
            hint="At least 6 characters." trailing={<EyeButton show={memberShowPw} onToggle={() => setMemberShowPw(v => !v)}/>}/>
          {!isYoungAdult && (
            <PocketSelect label="Graduation year" value={graduationYear} onChange={(e) => setGraduationYear(e.target.value)}
              hint="The year you graduate — it places you in the right class.">
              {yearOptions}
            </PocketSelect>
          )}

          <YoungAdultCheck on={isYoungAdult} onToggle={() => setIsYoungAdult(v => !v)} compact/>
          <PocketSubmit loading={memberLoading} disabled={!gradYearValid || !gender || memberLoading}>
            {memberLoading ? "Creating account…" : "Create account"}
          </PocketSubmit>
          {(!gradYearValid || !gender) && !memberLoading && (
            <div style={{ fontSize: 13, color: "var(--muted-text)", textAlign: "center", marginTop: -8 }}>
              {!gender ? "Select your gender to continue." : "Select your graduation year, or tick \u201cI\u2019m a young adult\u201d."}
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

// URLSearchParams + allowlist, never concatenation (see the twin in login/page.tsx).
function memberOauthRedirect(intent: string | null, invite: string | null): string {
  const url = new URL("/auth/callback", siteOrigin())
  url.searchParams.set("flow", "signup")
  // Member paths only ever carry join; admin registration builds its own redirect.
  if (intent === "join") url.searchParams.set("intent", intent)
  const path = inviteReturnPath(invite)
  if (path) url.searchParams.set("invite", codeFromReturnPath(path))
  return url.toString()
}

export default function SignupPage() {
  return <Suspense><SignupContent/></Suspense>
}
