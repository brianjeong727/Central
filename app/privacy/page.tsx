import Link from "next/link"
import type { Metadata } from "next"

export const metadata: Metadata = {
  title: "Privacy Policy · Central",
  description: "How Central collects, uses, and protects your data.",
}

const SUPPORT_EMAIL = "team@joincentral.app"
const EFFECTIVE_DATE = "July 13, 2026"

const H2: React.CSSProperties = { fontFamily: "var(--serif)", fontSize: 24, fontWeight: 600, color: "var(--ink)", letterSpacing: "-0.01em", margin: "40px 0 12px" }
const P: React.CSSProperties = { fontSize: 15, color: "var(--body)", lineHeight: 1.7, margin: "0 0 12px" }
const LI: React.CSSProperties = { fontSize: 15, color: "var(--body)", lineHeight: 1.7, margin: "0 0 8px" }

export default function PrivacyPage() {
  return (
    <div style={{ minHeight: "100dvh", background: "var(--cream)" }}>
      <div style={{ maxWidth: 720, margin: "0 auto", padding: "72px 24px 96px" }}>
        <p style={{ fontFamily: "var(--mono)", fontSize: 11, letterSpacing: "1.4px", textTransform: "uppercase", color: "var(--muted-text)", margin: 0 }}>
          Central
        </p>
        <h1 style={{ fontFamily: "var(--serif)", fontSize: 44, fontWeight: 600, color: "var(--ink)", letterSpacing: "-0.02em", lineHeight: 1.05, margin: "12px 0 0" }}>
          Privacy Policy
        </h1>
        <p style={{ fontSize: 14, color: "var(--muted-text)", margin: "14px 0 0" }}>Effective {EFFECTIVE_DATE}</p>

        <p style={{ ...P, marginTop: 28 }}>
          Central is a private communication platform for college and church ministries. This policy explains, in plain
          language, what we collect, how we use it, and the choices you have. We built Central for one job — helping a
          ministry stay connected — and we handle your data with that single purpose in mind.
        </p>

        <h2 style={H2}>What we collect</h2>
        <p style={P}>When you use Central, we collect the information you and your ministry provide:</p>
        <ul style={{ paddingLeft: 20, margin: "0 0 12px" }}>
          <li style={LI}><strong>Account and profile details</strong> — your name, email address, phone number (if you add one), graduation year, and other profile fields you choose to fill in.</li>
          <li style={LI}><strong>Sensitive religious content</strong> — Central lets you share faith-related information such as your testimony, prayer requests, favorite verse, and journal entries (devotionals, prayers, and verses). This is religious information about you. It is optional, you control what you enter, and it is shown only within your ministry.</li>
          <li style={LI}><strong>Messages and photos</strong> — the chat messages, reactions, polls, and any images or files you send, plus profile and announcement photos you upload.</li>
          <li style={LI}><strong>A user identifier</strong> — a unique account ID that links your data to you.</li>
        </ul>
        <p style={P}>
          We do <strong>not</strong> use advertising or tracking SDKs, we do not track you across other apps or websites,
          and we do not collect your device location, health, or financial data.
        </p>

        <h2 style={H2}>How we use it</h2>
        <p style={P}>
          We use your information solely to make the app work — to show your ministry&apos;s directory, deliver your
          messages, post announcements, manage RSVPs and planning, and send the notifications you opt into. We do
          <strong> not</strong> sell your data, we do <strong>not</strong> share it for advertising, and we do
          <strong> not</strong> run analytics or ad networks on it.
        </p>

        <h2 style={H2}>Who processes your data</h2>
        <p style={P}>Central relies on a small number of infrastructure providers that process data on our behalf:</p>
        <ul style={{ paddingLeft: 20, margin: "0 0 12px" }}>
          <li style={LI}><strong>Supabase</strong> — our database, authentication, and file storage provider.</li>
          <li style={LI}><strong>Apple Push Notification service and Web Push</strong> — used only to deliver the notifications you enable.</li>
        </ul>
        <p style={P}>These providers process data only to run Central&apos;s core functionality, not for their own purposes.</p>

        <h2 style={H2}>Retention and deletion</h2>
        <p style={P}>
          You can delete your account at any time from inside the app: <strong>Profile → Danger Zone → Delete account</strong>.
          Deleting your account permanently removes your login and scrubs your profile, journal, and personal records.
        </p>
        <p style={P}>
          One honest exception: <strong>messages you already sent stay in the chats where you sent them</strong>, but they
          are reattributed to &ldquo;Former member&rdquo; with no link back to you. We keep them so we don&apos;t erase the
          shared conversation history for everyone else in the chat. Everything else tied to your account is deleted.
        </p>

        <h2 style={H2}>Your choices</h2>
        <ul style={{ paddingLeft: 20, margin: "0 0 12px" }}>
          <li style={LI}><strong>Notifications</strong> — turn any category of push notification on or off under Profile → Notifications.</li>
          <li style={LI}><strong>Profile fields</strong> — the sensitive and optional fields are yours to fill in, edit, or leave blank.</li>
          <li style={LI}><strong>Revoke consent</strong> — to withdraw consent and remove your data, delete your account (above). There is no separate step required.</li>
        </ul>

        <h2 style={H2}>Contact</h2>
        <p style={P}>
          Questions about this policy or your data? Email us at{" "}
          <a href={`mailto:${SUPPORT_EMAIL}`} style={{ color: "var(--plum-2)", fontWeight: 500 }}>{SUPPORT_EMAIL}</a>.
        </p>

        <div style={{ marginTop: 48, paddingTop: 24, borderTop: "1px solid var(--line)", display: "flex", gap: 20, fontSize: 14 }}>
          <Link href="/support" style={{ color: "var(--plum-2)", fontWeight: 500, textDecoration: "none" }}>Support</Link>
          <Link href="/" style={{ color: "var(--muted-text)", textDecoration: "none" }}>Back to Central</Link>
        </div>
      </div>
    </div>
  )
}
