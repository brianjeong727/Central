"use client"

import Link from "next/link"
import { AlertCircle } from "lucide-react"
import { RingCrossLogo } from "@/app/home/components/shared"
import { EYEBROW_STYLE as mono } from "@/components/central/typography"

const SERIF = "var(--font-instrument-serif)"
const SANS  = "var(--font-inter)"

// ── AuthPhotoPanel ─────────────────────────────────────────────
// Sticky grid item — must be a direct child of SplitShell's grid.
export function AuthPhotoPanel() {
  return (
    <div className="hidden md:flex" style={{
      position: "sticky", top: 0, alignSelf: "start", height: "100vh",
      overflow: "hidden", color: "var(--cream-panel)", background: "#1E0A20",
      padding: "44px", flexDirection: "column", justifyContent: "space-between",
    }}>
      <img src="/chapel.jpg" alt="" style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" }} />
      <div aria-hidden style={{
        position: "absolute", inset: 0, pointerEvents: "none",
        background: "linear-gradient(155deg, rgba(27,10,30,0.58) 0%, rgba(45,15,46,0.76) 58%, rgba(27,10,30,0.93) 100%)",
      }}/>
      {/* Brand */}
      <Link href="/" aria-label="Central — home" className="transition-opacity hover:opacity-70" style={{ position: "relative", display: "flex", alignItems: "center", gap: 11, textDecoration: "none", color: "inherit" }}>
        <span style={{
          width: 36, height: 36, borderRadius: 10, display: "grid", placeItems: "center", flexShrink: 0,
          background: "rgba(253,252,248,0.12)", border: "1px solid rgba(253,252,248,0.22)",
        }}>
          <RingCrossLogo size={20} color="var(--ivory)" />
        </span>
        <span style={{ fontFamily: SERIF, fontSize: 22, letterSpacing: "-0.01em", color: "var(--cream-panel)" }}>Central</span>
      </Link>
      {/* Tagline + verse */}
      <div style={{ position: "relative" }}>
        <div style={{ fontFamily: SERIF, fontWeight: 600, fontSize: 46, lineHeight: 1.03, letterSpacing: "-0.02em", color: "var(--cream-panel)" }}>
          Your ministry,<br/>all in one place.
        </div>
        <div style={{ marginTop: 26, maxWidth: 360 }}>
          <div style={{ fontFamily: SERIF, fontStyle: "italic", fontSize: 18, lineHeight: 1.5, color: "rgba(253,252,248,0.92)" }}>
            &ldquo;And let us consider how to stir up one another to love and good works.&rdquo;
          </div>
          <div style={{ ...mono, marginTop: 12, color: "rgba(253,252,248,0.60)", letterSpacing: "1.4px" }}>Hebrews 10 : 24</div>
        </div>
      </div>
    </div>
  )
}

// ── SplitShell ─────────────────────────────────────────────────
// Two-column auth layout. topBar renders in the persistent header row:
// use marginRight:"auto" on a Back link to push the secondary link right.
export function SplitShell({ topBar, children }: { topBar?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-[0.786fr_1fr]" style={{
      width: "100%", minHeight: "100svh",
      alignItems: "start",
      background: "var(--cream-panel)", fontFamily: SANS,
    }}>
      {/* On mobile the photo panel is display:none — the grid MUST collapse to a
          single column, or its reserved 0.786fr track crams every auth page into
          the left ~44% with dead space on the right. */}
      <AuthPhotoPanel />
      <div style={{ minHeight: "100svh", display: "flex", flexDirection: "column" }}>
        {/* Top bar */}
        <div className="px-6 md:px-12" style={{
          display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 6,
          paddingTop: 26, minHeight: 64, fontSize: 14, color: "var(--body)",
        }}>
          {topBar}
        </div>
        {/* Form body */}
        <div className="px-6 md:px-14" style={{
          flex: 1, display: "flex", flexDirection: "column", justifyContent: "center", alignItems: "center",
          paddingTop: 24, paddingBottom: 48,
        }}>
          {/* Mobile-only wordmark */}
          <div className="md:hidden" style={{ marginBottom: 36, alignSelf: "flex-start" }}>
            <Link href="/" aria-label="Central — home" className="transition-opacity hover:opacity-70" style={{ display: "inline-flex", alignItems: "center", gap: 12, textDecoration: "none", color: "inherit" }}>
              <span style={{
                width: 32, height: 32, borderRadius: 8, background: "var(--plum)",
                color: "var(--cream-panel)", display: "grid", placeItems: "center",
                fontFamily: SERIF, fontSize: 15, flexShrink: 0,
              }}>C</span>
              <span style={{ fontFamily: SERIF, fontSize: 22, letterSpacing: "-0.01em", color: "var(--ink)" }}>Central</span>
            </Link>
          </div>
          <div style={{ width: "100%", maxWidth: 460 }}>{children}</div>
        </div>
      </div>
    </div>
  )
}

// ── GoogleGlyph ────────────────────────────────────────────────
// Single source for the 4-color Google "G" (brand hex kept in ONE place — reused by
// GoogleButton and the mobile B3 welcome pill so the hex-ratchet count stays put).
export function GoogleGlyph({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden style={{ flexShrink: 0 }}>
      <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.27-4.74 3.27-8.1z"/>
      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84A11 11 0 0 0 12 23z"/>
      <path fill="#FBBC05" d="M5.84 14.1a6.6 6.6 0 0 1 0-4.2V7.06H2.18a11 11 0 0 0 0 9.88l3.66-2.84z"/>
      <path fill="#EA4335" d="M12 4.75c1.61 0 3.06.55 4.2 1.64l3.15-3.15A11 11 0 0 0 12 .98 11 11 0 0 0 2.18 7.06l3.66 2.84C6.71 6.68 9.14 4.75 12 4.75z"/>
    </svg>
  )
}

// ── GoogleButton ───────────────────────────────────────────────
export function GoogleButton({ onClick }: { onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} style={{
      width: "100%", padding: "13px 18px", borderRadius: 12,
      background: "var(--cream-panel)", border: "1px solid var(--line-2)", color: "var(--ink)",
      fontSize: 15, fontWeight: 500, fontFamily: SANS, cursor: "pointer",
      display: "flex", alignItems: "center", justifyContent: "center", gap: 12,
      transition: "background .15s",
    }} className="hover:bg-[var(--ivory)]">
      <GoogleGlyph size={16} />
      Continue with Google
    </button>
  )
}

// ── AppleGlyph ─────────────────────────────────────────────────
// currentColor (no brand hex) — inherits ink on cream buttons, cream on plum.
export function AppleGlyph({ size = 17 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden style={{ flexShrink: 0, marginTop: -2 }}>
      <path d="M17.05 20.28c-.98.95-2.05.8-3.08.35-1.09-.46-2.09-.48-3.24 0-1.44.62-2.2.44-3.06-.35C2.79 15.25 3.51 7.59 9.05 7.31c1.35.07 2.29.74 3.08.8 1.18-.24 2.31-.93 3.57-.84 1.51.12 2.65.72 3.4 1.8-3.12 1.87-2.38 5.98.48 7.13-.57 1.5-1.31 2.99-2.54 4.09l.01-.01zM12.03 7.25c-.15-2.23 1.66-4.07 3.74-4.25.29 2.58-2.34 4.5-3.74 4.25z"/>
    </svg>
  )
}

// ── AppleButton ────────────────────────────────────────────────
// Same chrome as GoogleButton — a sibling provider entry, not a styled brand
// button (Apple's outline style permits this).
export function AppleButton({ onClick }: { onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} style={{
      width: "100%", padding: "13px 18px", borderRadius: 12,
      background: "var(--cream-panel)", border: "1px solid var(--line-2)", color: "var(--ink)",
      fontSize: 15, fontWeight: 500, fontFamily: SANS, cursor: "pointer",
      display: "flex", alignItems: "center", justifyContent: "center", gap: 12,
      transition: "background .15s",
    }} className="hover:bg-[var(--ivory)]">
      <AppleGlyph size={17} />
      Continue with Apple
    </button>
  )
}

// ── OrDivider ──────────────────────────────────────────────────
// No built-in margin — callers control vertical spacing.
export function OrDivider() {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 16, color: "var(--faint)" }}>
      <span style={{ flex: 1, height: 1, background: "var(--line)" }}/>
      <span style={{ ...mono, color: "var(--faint)", textTransform: "lowercase", letterSpacing: "0.06em" }}>or</span>
      <span style={{ flex: 1, height: 1, background: "var(--line)" }}/>
    </div>
  )
}

// ── Mobile Pocket idiom (ratified in login's md:hidden branch) ──────────────
// Shared style tokens + primitives for auth mobile screens so signup /
// forgot-password / update-password match login without re-inlining the grammar.
// Desktop keeps SplitShell; these are for the `md:hidden` branches only.

export const pocketPillBase: React.CSSProperties = {
  display: "flex", alignItems: "center", justifyContent: "center", gap: 9,
  borderRadius: 999, fontSize: 14.5, fontWeight: 600, border: "none",
  minHeight: 50, padding: "0 22px", width: "100%", cursor: "pointer", fontFamily: "var(--serif)",
}
export const pocketPillPrimary: React.CSSProperties = { ...pocketPillBase, background: "var(--plum)", color: "var(--cream)" }
export const pocketPillCard: React.CSSProperties = { ...pocketPillBase, background: "var(--ivory)", color: "var(--ink)" }
export const pocketFieldLabel: React.CSSProperties = {
  display: "block", fontFamily: "var(--mono)", fontSize: 10, letterSpacing: "1.4px",
  color: "var(--muted-text)", textTransform: "uppercase", marginBottom: 7, paddingLeft: 4,
}
export const pocketFieldBox: React.CSSProperties = {
  display: "flex", alignItems: "center", width: "100%", minHeight: 52,
  border: "none", borderRadius: 16, background: "var(--ivory)", padding: "0 18px",
}
export const pocketFieldInput: React.CSSProperties = {
  flex: 1, minWidth: 0, border: "none", outline: "none", background: "transparent",
  fontSize: 16, fontFamily: "var(--serif)", color: "var(--ink)", padding: "14px 0",
}
export const pocketH1: React.CSSProperties = {
  fontFamily: "var(--serif)", fontSize: 30, fontWeight: 600, letterSpacing: "-0.025em",
  lineHeight: 1.08, color: "var(--ink)", margin: 0,
}
export const pocketSub: React.CSSProperties = { fontSize: 14.5, color: "var(--body)", lineHeight: 1.55 }

// Full-viewport scroll container matching login's md:hidden form step (exact-fit
// height:100dvh + overflowY:auto so short forms fit with no scroll, tall ones scroll).
// `topInset` — welcome-style screens use `calc(env(safe-area-inset-top) + 24px)`;
// screens with a Back row at the top use bare `env(safe-area-inset-top)`.
export function PocketAuthScreen({ children, topInset = false }: { children: React.ReactNode; topInset?: boolean }) {
  return (
    <div className="max-w-[390px] mx-auto w-full" style={{
      height: "100dvh", overflowY: "auto", background: "var(--cream)", display: "flex", flexDirection: "column",
      padding: `${topInset ? "calc(env(safe-area-inset-top) + 24px)" : "env(safe-area-inset-top)"} 24px calc(env(safe-area-inset-bottom) + 24px)`,
    }}>
      {children}
    </div>
  )
}

// Back chevron row used at the top of a mobile auth screen (matches login).
export function PocketBack({ onClick, href, label = "Back" }: { onClick?: () => void; href?: string; label?: string }) {
  const style: React.CSSProperties = {
    display: "flex", alignItems: "center", gap: 6, alignSelf: "flex-start",
    background: "none", border: "none", color: "var(--muted-text)", fontSize: 14,
    padding: "14px 0 4px", cursor: "pointer", fontFamily: "var(--serif)", textDecoration: "none",
  }
  const inner = (
    <>
      <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M19 12H5M12 19l-7-7 7-7"/></svg>
      {label}
    </>
  )
  return href
    ? <Link href={href} style={style}>{inner}</Link>
    : <button type="button" onClick={onClick} style={style}>{inner}</button>
}

// Ivory pill field (label + tonal box + input, optional trailing eye/etc.).
export function PocketField({ label, trailing, hint, ...input }: {
  label: string; trailing?: React.ReactNode; hint?: React.ReactNode
} & React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <label style={{ display: "block" }}>
      <span style={pocketFieldLabel}>{label}</span>
      <div style={pocketFieldBox}>
        <input {...input} style={pocketFieldInput} />
        {trailing}
      </div>
      {hint && <div style={{ fontSize: 12.5, color: "var(--faint)", marginTop: 7, paddingLeft: 4 }}>{hint}</div>}
    </label>
  )
}

// Plum pill submit button (≥48px) with spinner slot.
export function PocketSubmit({ loading, children, disabled, ...rest }: {
  loading?: boolean; children: React.ReactNode
} & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button {...rest} disabled={disabled} style={{
      ...pocketPillPrimary, marginTop: 24,
      opacity: disabled ? 0.7 : 1, cursor: disabled ? "not-allowed" : "pointer",
    }}>
      {loading && (
        <div style={{ width: 15, height: 15, borderRadius: "50%", border: "2px solid color-mix(in srgb, var(--cream) 30%, transparent)", borderTopColor: "var(--cream)", animation: "spin 0.7s linear infinite", flexShrink: 0 }} />
      )}
      {children}
    </button>
  )
}

// Mobile error banner (matches login's md:hidden alert).
export function PocketError({ msg }: { msg: string }) {
  return (
    <div style={{
      borderRadius: 12, background: "color-mix(in srgb, var(--danger) 8%, transparent)",
      border: "1px solid color-mix(in srgb, var(--danger) 18%, transparent)",
      padding: "10px 14px", fontSize: 13, color: "var(--danger)", fontWeight: 500,
      display: "flex", alignItems: "flex-start", gap: 8, marginTop: 22,
    }} role="alert">
      <AlertCircle size={14} style={{ flexShrink: 0, marginTop: 1 }} />
      {msg}
    </div>
  )
}

// ── EyeButton ──────────────────────────────────────────────────
export function EyeButton({ show, onToggle }: { show: boolean; onToggle: () => void }) {
  return (
    <button type="button" onClick={onToggle} aria-label={show ? "Hide password" : "Show password"}
      style={{ background: "transparent", border: "none", cursor: "pointer", padding: 4, color: "var(--muted-text)", display: "grid", placeItems: "center", marginRight: -4, flexShrink: 0 }}>
      {show
        ? <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0112 20c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19M1 1l22 22"/></svg>
        : <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8S1 12 1 12z"/><circle cx="12" cy="12" r="3"/></svg>
      }
    </button>
  )
}
