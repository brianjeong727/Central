"use client"

import { RingCrossLogo } from "@/app/home/components/shared"

const SERIF = "var(--font-instrument-serif)"
const SANS  = "var(--font-inter)"

const mono: React.CSSProperties = {
  fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
  fontSize: 11, letterSpacing: "0.13em", color: "var(--muted-text)", textTransform: "uppercase",
}

// ── AuthPhotoPanel ─────────────────────────────────────────────
// Sticky grid item — must be a direct child of SplitShell's grid.
export function AuthPhotoPanel() {
  return (
    <div className="hidden md:flex" style={{
      position: "sticky", top: 0, alignSelf: "start", height: "100vh",
      overflow: "hidden", color: "#FBF8F2", background: "#1E0A20",
      padding: "44px", flexDirection: "column", justifyContent: "space-between",
    }}>
      <img src="/chapel.jpg" alt="" style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" }} />
      <div aria-hidden style={{
        position: "absolute", inset: 0, pointerEvents: "none",
        background: "linear-gradient(155deg, rgba(27,10,30,0.58) 0%, rgba(45,15,46,0.76) 58%, rgba(27,10,30,0.93) 100%)",
      }}/>
      {/* Brand */}
      <div style={{ position: "relative", display: "flex", alignItems: "center", gap: 11 }}>
        <span style={{
          width: 36, height: 36, borderRadius: 10, display: "grid", placeItems: "center", flexShrink: 0,
          background: "rgba(253,252,248,0.12)", border: "1px solid rgba(253,252,248,0.22)",
        }}>
          <RingCrossLogo size={20} color="var(--ivory)" />
        </span>
        <span style={{ fontFamily: SERIF, fontSize: 22, letterSpacing: "-0.01em", color: "#FBF8F2" }}>Central</span>
      </div>
      {/* Tagline + verse */}
      <div style={{ position: "relative" }}>
        <div style={{ fontFamily: SERIF, fontWeight: 600, fontSize: 46, lineHeight: 1.03, letterSpacing: "-0.02em", color: "#FBF8F2" }}>
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
    <div style={{
      width: "100%", minHeight: "100svh",
      display: "grid", gridTemplateColumns: "0.786fr 1fr", alignItems: "start",
      background: "#FBF8F2", fontFamily: SANS,
    }}>
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
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <span style={{
                width: 32, height: 32, borderRadius: 8, background: "var(--plum)",
                color: "#FBF8F2", display: "grid", placeItems: "center",
                fontFamily: SERIF, fontSize: 15, flexShrink: 0,
              }}>C</span>
              <span style={{ fontFamily: SERIF, fontSize: 22, letterSpacing: "-0.01em", color: "var(--ink)" }}>Central</span>
            </div>
          </div>
          <div style={{ width: "100%", maxWidth: 460 }}>{children}</div>
        </div>
      </div>
    </div>
  )
}

// ── GoogleButton ───────────────────────────────────────────────
export function GoogleButton({ onClick }: { onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} style={{
      width: "100%", padding: "13px 18px", borderRadius: 12,
      background: "#FBF8F2", border: "1px solid var(--line-2)", color: "var(--ink)",
      fontSize: 15, fontWeight: 500, fontFamily: SANS, cursor: "pointer",
      display: "flex", alignItems: "center", justifyContent: "center", gap: 12,
      transition: "background .15s",
    }} className="hover:bg-[var(--ivory)]">
      <svg width={16} height={16} viewBox="0 0 24 24" aria-hidden style={{ flexShrink: 0 }}>
        <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.27-4.74 3.27-8.1z"/>
        <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84A11 11 0 0 0 12 23z"/>
        <path fill="#FBBC05" d="M5.84 14.1a6.6 6.6 0 0 1 0-4.2V7.06H2.18a11 11 0 0 0 0 9.88l3.66-2.84z"/>
        <path fill="#EA4335" d="M12 4.75c1.61 0 3.06.55 4.2 1.64l3.15-3.15A11 11 0 0 0 12 .98 11 11 0 0 0 2.18 7.06l3.66 2.84C6.71 6.68 9.14 4.75 12 4.75z"/>
      </svg>
      Continue with Google
    </button>
  )
}

// ── OrDivider ──────────────────────────────────────────────────
// No built-in margin — callers control vertical spacing.
export function OrDivider() {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 16, color: "#A09A8C" }}>
      <span style={{ flex: 1, height: 1, background: "var(--line)" }}/>
      <span style={{ ...mono, color: "#A09A8C", textTransform: "lowercase", letterSpacing: "0.06em" }}>or</span>
      <span style={{ flex: 1, height: 1, background: "var(--line)" }}/>
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
