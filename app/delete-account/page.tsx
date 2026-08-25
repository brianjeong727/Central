import Link from "next/link"
import type { Metadata } from "next"

export const metadata: Metadata = {
  title: "Delete your Central account · Central",
  description: "How to request deletion of your Central account and the data associated with it.",
}

const SUPPORT_EMAIL = "team@joincentral.app"

const H2: React.CSSProperties = { fontFamily: "var(--serif)", fontSize: 24, fontWeight: 600, color: "var(--ink)", letterSpacing: "-0.01em", margin: "40px 0 12px" }
const P: React.CSSProperties = { fontSize: 15, color: "var(--body)", lineHeight: 1.7, margin: "0 0 12px" }
const LI: React.CSSProperties = { fontSize: 15, color: "var(--body)", lineHeight: 1.7, margin: "0 0 8px" }
const STEP_NUM: React.CSSProperties = { fontFamily: "var(--mono)", fontSize: 12, color: "var(--plum-2)", fontWeight: 600, letterSpacing: "0.06em" }

export default function DeleteAccountPage() {
  return (
    <div style={{ minHeight: "100dvh", background: "var(--cream)" }}>
      <div style={{ maxWidth: 720, margin: "0 auto", padding: "72px 24px 96px" }}>
        <p style={{ fontFamily: "var(--mono)", fontSize: 11, letterSpacing: "1.4px", textTransform: "uppercase", color: "var(--muted-text)", margin: 0 }}>
          Central
        </p>
        <h1 style={{ fontFamily: "var(--serif)", fontSize: 44, fontWeight: 600, color: "var(--ink)", letterSpacing: "-0.02em", lineHeight: 1.05, margin: "12px 0 0" }}>
          Delete your account
        </h1>

        <p style={{ ...P, marginTop: 28 }}>
          This page explains how to request deletion of your <strong>Central</strong> account and the data associated
          with it. Central is a private communication platform for college and church ministries.
        </p>

        <h2 style={H2}>Delete your account from inside the app</h2>
        <p style={P}>Deletion is immediate and does not require contacting us:</p>
        <ol style={{ paddingLeft: 20, margin: "0 0 12px" }}>
          <li style={LI}><span style={STEP_NUM}>1</span> &nbsp;Open the Central app and sign in.</li>
          <li style={LI}><span style={STEP_NUM}>2</span> &nbsp;Go to the <strong>Profile</strong> tab.</li>
          <li style={LI}><span style={STEP_NUM}>3</span> &nbsp;Scroll to <strong>Danger Zone</strong> and tap <strong>Delete account</strong>.</li>
          <li style={LI}><span style={STEP_NUM}>4</span> &nbsp;Type your email address to confirm, then confirm the deletion.</li>
        </ol>
        <p style={P}>
          Your login is removed straight away and you are signed out. There is no waiting period and no separate
          approval step.
        </p>

        <h2 style={H2}>If you can&apos;t sign in</h2>
        <p style={P}>
          Email{" "}
          <a href={`mailto:${SUPPORT_EMAIL}`} style={{ color: "var(--plum-2)", fontWeight: 500 }}>{SUPPORT_EMAIL}</a>{" "}
          from the address on your account and ask us to delete it. We will confirm your identity and complete the
          deletion within 30 days.
        </p>

        <h2 style={H2}>What is deleted</h2>
        <p style={P}>Deleting your account permanently removes:</p>
        <ul style={{ paddingLeft: 20, margin: "0 0 12px" }}>
          <li style={LI}><strong>Your login</strong> — your authentication record is hard-deleted, not deactivated.</li>
          <li style={LI}><strong>Your profile details</strong> — name, profile photo, favorite verse and worship song, gender, major, hometown, graduation year, school, saved signature, and notification settings.</li>
          <li style={LI}><strong>Your journal</strong> — devotionals, prayers, and verses you saved.</li>
          <li style={LI}><strong>Your activity records</strong> — RSVPs, announcement views and acknowledgements, form responses, poll votes, message reactions, congregation pulse responses, team and small-group memberships, worship and rotation availability, Bible study progress and annotations, and any pending request to join a ministry.</li>
          <li style={LI}><strong>Your push notification registrations</strong> — so no further notifications can reach your devices.</li>
        </ul>

        <h2 style={H2}>What is kept, and why</h2>
        <p style={P}>
          One honest exception: <strong>messages you already sent stay in the chats where you sent them.</strong> They
          are reattributed to &ldquo;Deleted account&rdquo; with no name, no photo, and no link back to you. We keep
          them so that deleting your account does not erase the shared conversation history for everyone else in those
          chats.
        </p>
        <p style={P}>
          Announcements and events you created are likewise kept for your ministry, with your authorship removed. A
          minimal, scrubbed placeholder record is retained solely to render &ldquo;Deleted account&rdquo; in those
          places; it holds no personal information about you.
        </p>

        <h2 style={H2}>Deleting some of your data without deleting your account</h2>
        <p style={P}>
          You do not have to delete your whole account to remove individual things. Inside the app you can delete your
          own chat messages, delete any journal entry, and clear optional profile fields at any time.
        </p>

        <h2 style={H2}>Questions</h2>
        <p style={P}>
          Email{" "}
          <a href={`mailto:${SUPPORT_EMAIL}`} style={{ color: "var(--plum-2)", fontWeight: 500 }}>{SUPPORT_EMAIL}</a>{" "}
          and we&apos;ll help. Our full{" "}
          <Link href="/privacy" style={{ color: "var(--plum-2)", fontWeight: 500 }}>Privacy Policy</Link>{" "}
          explains everything else we collect and why.
        </p>

        <div style={{ marginTop: 48, paddingTop: 24, borderTop: "1px solid var(--line)", display: "flex", gap: 20, fontSize: 14 }}>
          <Link href="/privacy" style={{ color: "var(--plum-2)", fontWeight: 500, textDecoration: "none" }}>Privacy Policy</Link>
          <Link href="/support" style={{ color: "var(--plum-2)", fontWeight: 500, textDecoration: "none" }}>Support</Link>
          <Link href="/" style={{ color: "var(--muted-text)", textDecoration: "none" }}>Back to Central</Link>
        </div>
      </div>
    </div>
  )
}
