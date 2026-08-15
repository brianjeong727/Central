"use client"

import { Suspense, useEffect, useState } from "react"
import { AlertCircle } from "lucide-react"
import { useSearchParams } from "next/navigation"
import { createClient } from "@/lib/supabase"
import { Spinner } from "@/app/home/components/shared"
import {
  SplitShell,
  PocketAuthScreen,
  PocketField,
  PocketSelect,
  PocketSubmit,
  PocketError,
  AuthSelect,
  AuthPendingVeil,
  gradYearOptions,
  pocketFieldLabel,
  pocketH1,
  pocketSub,
} from "@/app/(auth)/shared"
import { nameIsEmailDerived } from "@/lib/profile-name"
import { EYEBROW_STYLE as mono } from "@/components/central/typography"
import { CentralButton } from "@/components/central"

const SERIF = "var(--font-instrument-serif)"
const SANS = "var(--font-inter)"
const serif: React.CSSProperties = { fontFamily: SERIF, fontWeight: 400, color: "var(--ink)", margin: 0 }

// ─── field (mirrors signup) ────────────────────────────────────
function Field({ label, helper, value, onChange, placeholder, type = "text", autoFocus }: {
  label: string; helper?: string
  value?: string; onChange?: (e: React.ChangeEvent<HTMLInputElement>) => void
  placeholder?: string; type?: string; autoFocus?: boolean
}) {
  return (
    <label style={{ display: "block" }}>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 8 }}>
        <span style={mono}>{label}</span>
      </div>
      <div style={{ display: "flex", alignItems: "center", background: "var(--cream-panel)", border: "1px solid var(--line-2)", borderRadius: 10, padding: "0 14px" }}>
        <input
          type={type} value={value} onChange={onChange} placeholder={placeholder} autoFocus={autoFocus}
          style={{
            flex: 1, border: "none", outline: "none", background: "transparent", padding: "13px 0",
            fontFamily: SANS, fontSize: 15, color: "var(--ink)",
          }}
        />
      </div>
      {helper && <div style={{ fontSize: 12, color: "var(--muted-text)", marginTop: 8 }}>{helper}</div>}
    </label>
  )
}

// ─── primary button (mirrors signup) ───────────────────────────
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

// ─── pill (gender) — mirrors signup desktop Pill ───────────────
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

// ─── mobile gender pill — mirrors signup MGenderPill ───────────
function MGenderPill({ label, on, onClick }: { label: string; on: boolean; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} style={{
      flex: 1, padding: "12px 16px", borderRadius: 999, border: "none", minHeight: 44,
      background: on ? "var(--plum)" : "var(--ivory)", color: on ? "var(--cream)" : "var(--body)",
      fontSize: 14.5, fontWeight: 600, fontFamily: SERIF, cursor: "pointer",
    }}>{label}</button>
  )
}

// ─── error banner (mirrors signup ErrorBanner) ─────────────────
function ErrorBanner({ msg }: { msg: string }) {
  return (
    <div style={{ borderRadius: 10, background: "color-mix(in srgb, var(--danger) 8%, transparent)", border: "1px solid color-mix(in srgb, var(--danger) 18%, transparent)", padding: "10px 14px", fontSize: 13, color: "var(--danger)", fontWeight: 500, display: "flex", gap: 8 }} role="alert">
      <AlertCircle size={14} style={{ flexShrink: 0, marginTop: 1 }} /> {msg}
    </div>
  )
}

// Only accept a same-origin path. Resolve against the real origin so backslash /
// tab / encoded tricks (/\evil.com, /%09/evil.com) that the WHATWG URL parser
// reads as protocol-relative are caught. Default /ministries.
function sanitizeNext(raw: string | null): string {
  if (!raw || typeof window === "undefined") return "/ministries"
  try {
    const u = new URL(raw, window.location.origin)
    if (u.origin === window.location.origin) return u.pathname + u.search
  } catch {}
  return "/ministries"
}

function CompleteProfileContent() {
  const searchParams = useSearchParams()
  const next = sanitizeNext(searchParams.get("next"))

  const [userId, setUserId] = useState<string | null>(null)
  const [checking, setChecking] = useState(true)
  // Name is collected ONLY when the stored one is handle_new_user's email-prefix
  // fallback rather than something a person typed — the same predicate proxy.ts
  // gates on (lib/profile-name.ts). Everyone else sees the form unchanged.
  const [needsName, setNeedsName] = useState(false)
  const [name, setName] = useState("")
  const [gender, setGender] = useState("")
  const [graduationYear, setGraduationYear] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  // Set once we hand off to window.location.assign — the full page load that
  // follows is the longest wait on this screen and has nothing else to show for
  // it. Never cleared: we are leaving.
  const [navigating, setNavigating] = useState(false)

  const currentYear = new Date().getFullYear()
  const gradYearNum = parseInt(graduationYear, 10)
  const gradYearValid = gradYearNum >= currentYear && gradYearNum <= currentYear + 6
  const nameValid = !needsName || name.trim().length >= 2

  useEffect(() => {
    async function load() {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { window.location.assign("/login"); return }

      const { data: profile } = await supabase
        .from("profiles")
        .select("gender, graduation_year, name, email")
        .eq("id", user.id)
        .single()

      // The SAME predicate proxy.ts gates on — if the two ever disagreed, the
      // gate would bounce a user to a page that then decides they're complete
      // and sends them straight back into the gate.
      const placeholderName = nameIsEmailDerived(profile?.name, profile?.email)
      setNeedsName(placeholderName)
      // Never prefill the derived prefix — that invites them to just accept it.
      if (placeholderName) setName("")

      // Already complete (deep-link) — don't show the form, send them onward.
      if (profile?.gender && profile?.graduation_year != null && !placeholderName) {
        window.location.assign(next)
        return
      }

      setUserId(user.id)
      setChecking(false)
    }
    load()
    // next is derived once from the URL; re-running on its identity is unnecessary
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!userId || !gender || !gradYearValid || !nameValid) return
    setSaving(true); setError(null)
    const supabase = createClient()
    const { error: updateError } = await supabase
      .from("profiles")
      .update({ gender, graduation_year: gradYearNum, ...(needsName ? { name: name.trim() } : {}) })
      .eq("id", userId)
    if (updateError) {
      setError("Something went wrong saving your details. Please try again.")
      setSaving(false)
      return
    }
    setNavigating(true)
    window.location.assign(next)
  }

  async function signOut() {
    const supabase = createClient()
    await supabase.auth.signOut()
    window.location.assign("/login")
  }

  if (checking) return <AuthPendingVeil label="One moment…" />

  const submitHint = !nameValid
    ? "Enter your name to continue."
    : !gender
    ? "Select your gender to continue."
    : !gradYearValid
    ? "Enter a valid graduation year."
    : null

  const years = gradYearOptions(currentYear)
  const yearOptions = (
    <>
      <option value="">Select your graduation year</option>
      {years.map(y => <option key={y} value={String(y)}>{y}</option>)}
    </>
  )
  // Both providers can withhold a name (Apple always does after the first
  // authorization), so the copy names neither.
  const nameHelper = "We couldn't get your name from your sign-in. This is what your ministry sees."

  return (<>
    {navigating && <AuthPendingVeil label="Taking you in…" />}
    {/* ── Desktop ── */}
    <div className="hidden md:block">
      <SplitShell topBar={
        <button type="button" onClick={signOut} style={{
          background: "none", border: "none", cursor: "pointer", padding: 0,
          fontFamily: SANS, fontSize: 14, color: "var(--muted-text)",
        }} className="hover:text-[var(--plum)]">
          Sign out
        </button>
      }>
        <div style={mono}>ONE MORE THING · CENTRAL</div>
        <h1 style={{ ...serif, fontWeight: 600, fontSize: 44, lineHeight: 1.03, letterSpacing: "-0.02em", margin: "14px 0 0" }}>
          A couple details.
        </h1>
        <p style={{ fontSize: 16, color: "var(--body)", lineHeight: 1.6, margin: "16px 0 30px" }}>
          Just two things so we can place you in the right small group — then you&apos;re in.
        </p>

        <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 18 }}>
          {error && <ErrorBanner msg={error}/>}

          {needsName && (
            <Field
              label="YOUR NAME"
              placeholder="First and last name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              helper={nameHelper}
            />
          )}

          <div>
            <div style={mono}>GENDER</div>
            <div style={{ fontSize: 13, color: "var(--muted-text)", margin: "4px 0 10px" }}>Helps us place you in the right small group.</div>
            <div style={{ display: "flex", gap: 8 }}>
              {["Male", "Female"].map(g => (
                <Pill key={g} label={g} on={gender === g.toLowerCase()} onClick={() => setGender(g.toLowerCase())}/>
              ))}
            </div>
          </div>

          <AuthSelect
            label="GRADUATION YEAR"
            value={graduationYear}
            onChange={(e) => setGraduationYear(e.target.value)}
            helper="The year you graduate — it places you in the right class."
          >
            {yearOptions}
          </AuthSelect>

          <Primary disabled={!gender || !gradYearValid || !nameValid || saving} loading={saving}>
            {saving ? "Saving…" : "Continue"}
          </Primary>
          {submitHint && !saving && (
            <div style={{ fontSize: 13, color: "var(--muted-text)", textAlign: "center", marginTop: -6 }}>
              {submitHint}
            </div>
          )}
        </form>
      </SplitShell>
    </div>

    {/* ── Mobile ── */}
    <div className="md:hidden">
      <PocketAuthScreen topInset>
        <div style={{ marginTop: 8 }}>
          <div style={mono}>One more thing</div>
          <h1 style={{ ...pocketH1, marginTop: 8 }}>A couple details.</h1>
        </div>
        <p style={{ ...pocketSub, marginTop: 14 }}>Just two things so we can place you in the right small group — then you&apos;re in.</p>
        {error && <PocketError msg={error}/>}
        <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 16, marginTop: 22 }}>
          {needsName && (
            <PocketField
              label="Your name"
              placeholder="First and last name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              hint={nameHelper}
            />
          )}
          <div>
            <span style={pocketFieldLabel}>Gender</span>
            <div style={{ fontSize: 12.5, color: "var(--muted-text)", margin: "-2px 0 8px", paddingLeft: 4 }}>Helps us place you in the right small group.</div>
            <div style={{ display: "flex", gap: 8 }}>
              {["Male", "Female"].map(g => (
                <MGenderPill key={g} label={g} on={gender === g.toLowerCase()} onClick={() => setGender(g.toLowerCase())}/>
              ))}
            </div>
          </div>
          <PocketSelect label="Graduation year" value={graduationYear} onChange={(e) => setGraduationYear(e.target.value)}
            hint="The year you graduate — it places you in the right class.">
            {yearOptions}
          </PocketSelect>
          <PocketSubmit loading={saving} disabled={!gender || !gradYearValid || !nameValid || saving}>
            {saving ? "Saving…" : "Continue"}
          </PocketSubmit>
          {submitHint && !saving && (
            <div style={{ fontSize: 13, color: "var(--muted-text)", textAlign: "center", marginTop: -8 }}>
              {submitHint}
            </div>
          )}
        </form>
        <button type="button" onClick={signOut} style={{
          marginTop: 22, background: "none", border: "none", cursor: "pointer",
          fontFamily: SERIF, fontSize: 13.5, fontWeight: 600, color: "var(--muted-text)", alignSelf: "center",
        }}>
          Sign out
        </button>
      </PocketAuthScreen>
    </div>
  </>)
}

export default function CompleteProfilePage() {
  return <Suspense><CompleteProfileContent/></Suspense>
}
