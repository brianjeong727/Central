"use client"

import Link from "next/link"
import { RingCrossLogo } from "@/app/home/components/shared"

const SERIF = "var(--font-instrument-serif)"

export default function NotAdminPage() {
  return (
    <div style={{ minHeight: "100svh", display: "flex", fontFamily: "var(--font-inter)" }}>

      {/* ── Left brand panel (desktop only) ── */}
      <div className="hidden md:flex" style={{
        width: "42%", flexShrink: 0, background: "var(--plum)",
        flexDirection: "column", justifyContent: "space-between",
        padding: "52px 56px", position: "relative", overflow: "hidden",
      }}>
        <div aria-hidden style={{ position: "absolute", inset: 0, backgroundImage: "radial-gradient(circle, rgba(246,244,239,0.1) 1px, transparent 1px)", backgroundSize: "22px 22px", pointerEvents: "none" }} />
        <div aria-hidden style={{ position: "absolute", inset: 0, background: "radial-gradient(circle at 80% 20%, rgba(246,244,239,0.07) 0%, transparent 50%)", pointerEvents: "none" }} />

        <Link href="/" aria-label="Central — home" className="transition-opacity hover:opacity-70" style={{ display: "inline-flex", alignItems: "center", gap: 10, position: "relative", textDecoration: "none", color: "inherit" }}>
          <RingCrossLogo size={26} color="var(--cream-on-dark)" />
          <span style={{ fontFamily: SERIF, fontSize: 22, color: "var(--cream-on-dark)", letterSpacing: "-0.01em" }}>Central</span>
        </Link>

        <div style={{ position: "relative" }}>
          <h2 style={{ fontFamily: SERIF, fontSize: 48, fontWeight: 400, color: "var(--cream-on-dark)", lineHeight: 1.05, letterSpacing: "-0.02em", margin: "0 0 36px" }}>
            Your ministry, all in one place.
          </h2>
          <p style={{ fontFamily: SERIF, fontStyle: "italic", fontSize: 15, color: "rgba(246,244,239,0.6)", lineHeight: 1.7, margin: "0 0 10px" }}>
            &ldquo;And let us consider how to stir up one another to love and good works.&rdquo;
          </p>
          <p style={{ fontSize: 10, letterSpacing: "0.2em", textTransform: "uppercase", color: "rgba(246,244,239,0.35)" }}>
            Hebrews 10 : 24
          </p>
        </div>
      </div>

      {/* ── Content panel ── */}
      <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", background: "var(--cream-panel)", padding: "48px 24px" }}>

        {/* Mobile logo */}
        <div className="flex flex-col items-center mb-10 md:hidden">
          <Link href="/" aria-label="Central — home" className="transition-opacity hover:opacity-70" style={{ display: "inline-flex", alignItems: "center", gap: 10, marginBottom: 6, textDecoration: "none", color: "inherit" }}>
            <RingCrossLogo size={28} color="var(--plum)" />
            <span style={{ fontFamily: SERIF, fontSize: 32, color: "var(--ink)", letterSpacing: "-0.01em" }}>Central</span>
          </Link>
        </div>

        <div style={{ width: "100%", maxWidth: 400 }}>

          {/* Icon */}
          <div style={{ display: "flex", justifyContent: "center", marginBottom: 28 }}>
            <div style={{
              width: 72, height: 72, borderRadius: "50%",
              background: "var(--plum)",
              display: "flex", alignItems: "center", justifyContent: "center",
            }}>
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="var(--cream-on-dark)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                <path d="M7 11V7a5 5 0 0 1 10 0v4" />
              </svg>
            </div>
          </div>

          {/* Heading */}
          <h1 style={{ fontFamily: SERIF, fontSize: 34, fontWeight: 400, color: "var(--ink)", letterSpacing: "-0.02em", lineHeight: 1.1, margin: "0 0 14px", textAlign: "center" }}>
            Church leaders only.
          </h1>
          <p style={{ fontSize: 15, color: "var(--body)", lineHeight: 1.65, textAlign: "center", margin: "0 0 32px" }}>
            Registering a church on Central requires a pastoral role — pastor, deacon, or elder. If you&apos;re a student or ministry member, join an existing ministry instead.
          </p>

          {/* CTAs */}
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <Link
              href="/join"
              style={{
                display: "block", textAlign: "center",
                padding: "14px 0", borderRadius: 12,
                background: "var(--plum)", color: "var(--cream-on-dark)",
                fontSize: 15, fontWeight: 600, textDecoration: "none",
                transition: "background 0.15s",
              }}
              className="hover:bg-[var(--plum-2)] active:scale-[0.97] transition-[transform,background-color] duration-150"
            >
              Browse ministries
            </Link>
            <Link
              href="/"
              style={{
                display: "block", textAlign: "center",
                padding: "13px 0", borderRadius: 12,
                border: "1px solid var(--line-2)", background: "transparent",
                color: "var(--body)", fontSize: 14, fontWeight: 500,
                textDecoration: "none",
              }}
              className="hover:bg-[#F4F1E8] active:scale-[0.97] transition-[transform,background-color] duration-150"
            >
              ← Back to home
            </Link>
          </div>
        </div>
      </div>
    </div>
  )
}
