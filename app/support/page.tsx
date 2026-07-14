import Link from "next/link"
import type { Metadata } from "next"

export const metadata: Metadata = {
  title: "Support · Central",
  description: "Contact the Central team.",
}

const SUPPORT_EMAIL = "team@joincentral.app"

export default function SupportPage() {
  return (
    <div style={{ minHeight: "100dvh", background: "var(--cream)", display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
      <div style={{ maxWidth: 480, width: "100%" }}>
        <p style={{ fontFamily: "var(--mono)", fontSize: 11, letterSpacing: "1.4px", textTransform: "uppercase", color: "var(--muted-text)", margin: 0 }}>
          Central
        </p>
        <h1 style={{ fontFamily: "var(--serif)", fontSize: 40, fontWeight: 600, color: "var(--ink)", letterSpacing: "-0.02em", lineHeight: 1.05, margin: "12px 0 0" }}>
          Contact the Central team
        </h1>
        <p style={{ fontSize: 16, color: "var(--body)", lineHeight: 1.65, margin: "18px 0 0" }}>
          Need help, found a bug, or want to report something? We read every message and aim to respond promptly.
        </p>

        <a
          href={`mailto:${SUPPORT_EMAIL}`}
          style={{
            display: "inline-flex", alignItems: "center", gap: 8, marginTop: 28,
            padding: "13px 22px", borderRadius: 9999, background: "var(--plum)",
            color: "var(--cream)", fontSize: 15, fontWeight: 500, textDecoration: "none",
          }}
        >
          Email {SUPPORT_EMAIL}
        </a>

        <div style={{ marginTop: 40, paddingTop: 22, borderTop: "1px solid var(--line)", display: "flex", gap: 20, fontSize: 14 }}>
          <Link href="/privacy" style={{ color: "var(--plum-2)", fontWeight: 500, textDecoration: "none" }}>Privacy policy</Link>
          <Link href="/" style={{ color: "var(--muted-text)", textDecoration: "none" }}>Back to Central</Link>
        </div>
      </div>
    </div>
  )
}
