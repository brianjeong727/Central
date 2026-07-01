"use client"

import Link from "next/link"
import { SplitShell } from "@/app/(auth)/shared"

const SERIF = "var(--font-instrument-serif)"

const mono: React.CSSProperties = {
  fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
  fontSize: 11, letterSpacing: "0.13em", color: "var(--muted-text)", textTransform: "uppercase",
}
const serif: React.CSSProperties = { fontFamily: SERIF, fontWeight: 400, color: "var(--ink)", margin: 0 }

export default function NotAdminPage() {
  return (
    <SplitShell topBar={<>
      <Link href="/" style={{
        display: "inline-flex", alignItems: "center", gap: 8,
        color: "var(--body)", textDecoration: "none", marginRight: "auto", fontSize: 14,
      }}>
        <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d="M19 12H5M12 19l-7-7 7-7"/>
        </svg>
        Back to home
      </Link>
    </>}>
      <div style={{ width: 60, height: 60, borderRadius: 16, background: "var(--plum)", display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 24 }}>
        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="var(--cream-on-dark)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
          <path d="M7 11V7a5 5 0 0 1 10 0v4" />
        </svg>
      </div>
      <div style={mono}>Restricted</div>
      <h1 style={{ ...serif, fontSize: 44, lineHeight: 1.05, letterSpacing: "-0.02em", margin: "14px 0 0" }}>
        Church leaders only.
      </h1>
      <p style={{ fontSize: 16, color: "var(--body)", lineHeight: 1.6, margin: "16px 0 0" }}>
        Registering a church on Central requires a pastoral role — pastor, deacon, or elder. If you&apos;re a student or ministry member, join an existing ministry instead.
      </p>

      <div style={{ display: "flex", flexDirection: "column", gap: 12, marginTop: 30 }}>
        <Link
          href="/join"
          style={{
            display: "block", textAlign: "center", padding: "14px 0", borderRadius: 10,
            background: "var(--plum-2)", color: "var(--cream-panel)",
            fontSize: 15, fontWeight: 500, textDecoration: "none", transition: "opacity 0.15s",
          }}
          className="hover:opacity-90 active:scale-[0.97] transition-[transform,opacity] duration-150"
        >
          Browse ministries
        </Link>
        <Link
          href="/"
          style={{
            display: "block", textAlign: "center", padding: "13px 0", borderRadius: 10,
            border: "1px solid var(--line-2)", background: "transparent",
            color: "var(--body)", fontSize: 14, fontWeight: 500, textDecoration: "none",
          }}
          className="hover:bg-[var(--ivory)] active:scale-[0.97] transition-[transform,background-color] duration-150"
        >
          ← Back to home
        </Link>
      </div>
    </SplitShell>
  )
}
