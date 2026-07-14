import Link from "next/link"
import type { Metadata } from "next"

export const metadata: Metadata = {
  title: "Terms of Service · Central",
  description: "The terms that govern your use of Central.",
}

const SUPPORT_EMAIL = "team@joincentral.app"
const EFFECTIVE_DATE = "July 14, 2026"

const H2: React.CSSProperties = { fontFamily: "var(--serif)", fontSize: 24, fontWeight: 600, color: "var(--ink)", letterSpacing: "-0.01em", margin: "40px 0 12px" }
const P: React.CSSProperties = { fontSize: 15, color: "var(--body)", lineHeight: 1.7, margin: "0 0 12px" }
const LI: React.CSSProperties = { fontSize: 15, color: "var(--body)", lineHeight: 1.7, margin: "0 0 8px" }

export default function TermsPage() {
  return (
    <div style={{ minHeight: "100dvh", background: "var(--cream)" }}>
      <div style={{ maxWidth: 720, margin: "0 auto", padding: "72px 24px 96px" }}>
        <p style={{ fontFamily: "var(--mono)", fontSize: 11, letterSpacing: "1.4px", textTransform: "uppercase", color: "var(--muted-text)", margin: 0 }}>
          Central
        </p>
        <h1 style={{ fontFamily: "var(--serif)", fontSize: 44, fontWeight: 600, color: "var(--ink)", letterSpacing: "-0.02em", lineHeight: 1.05, margin: "12px 0 0" }}>
          Terms of Service
        </h1>
        <p style={{ fontSize: 14, color: "var(--muted-text)", margin: "14px 0 0" }}>Effective {EFFECTIVE_DATE}</p>

        <p style={{ ...P, marginTop: 28 }}>
          Central is a private communication platform for college and church ministries. These terms are the agreement
          between you and Central when you create an account or use the app. They&apos;re written to be read — if
          anything is unclear, email us and we&apos;ll explain it plainly.
        </p>

        <h2 style={H2}>Your account</h2>
        <ul style={{ paddingLeft: 20, margin: "0 0 12px" }}>
          <li style={LI}>You must provide accurate information when you sign up, and keep your login credentials to yourself. You&apos;re responsible for activity that happens under your account.</li>
          <li style={LI}>Central is built for ministry communities. Access to a ministry&apos;s content is controlled by that ministry&apos;s leaders, who may approve, remove, or ban members of their own community.</li>
          <li style={LI}>You can delete your account at any time from inside the app (<strong>Profile → Danger Zone → Delete account</strong>). See our <Link href="/privacy" style={{ color: "var(--plum-2)", fontWeight: 500 }}>Privacy Policy</Link> for exactly what deletion removes.</li>
        </ul>

        <h2 style={H2}>Community conduct — zero tolerance for abuse</h2>
        <p style={P}>
          Central hosts content that members create: chat messages, photos, announcements, forms, prayer requests, and
          more. We have <strong>no tolerance for objectionable content or abusive behavior</strong>. By using Central you
          agree not to post or send content that is:
        </p>
        <ul style={{ paddingLeft: 20, margin: "0 0 12px" }}>
          <li style={LI}>Harassing, bullying, threatening, or hateful toward any person or group;</li>
          <li style={LI}>Sexually explicit, pornographic, or exploitative;</li>
          <li style={LI}>Violent, or promoting violence or self-harm;</li>
          <li style={LI}>Defamatory, fraudulent, or deliberately misleading;</li>
          <li style={LI}>Infringing on someone else&apos;s intellectual property or privacy;</li>
          <li style={LI}>Illegal, or promoting illegal activity.</li>
        </ul>
        <p style={P}>
          Every ministry has moderation tools: members can <strong>report</strong> any message, announcement, or profile
          and <strong>block</strong> abusive users directly in the app, and ministry leaders can remove content and
          remove or permanently ban members. We review reports and act on objectionable content promptly — typically
          within 24 hours — including removing content and ejecting the users who post it.
        </p>

        <h2 style={H2}>Your content</h2>
        <p style={P}>
          You own what you create. By posting content on Central you give us the limited license we need to store,
          display, and deliver it to the ministry you shared it with — that&apos;s the whole purpose of the app. We
          don&apos;t sell your content, use it for advertising, or share it outside your ministry.
        </p>

        <h2 style={H2}>Acceptable use</h2>
        <ul style={{ paddingLeft: 20, margin: "0 0 12px" }}>
          <li style={LI}>Don&apos;t attempt to access other ministries&apos; data, other users&apos; accounts, or non-public parts of the service.</li>
          <li style={LI}>Don&apos;t scrape, spam, probe, overload, or interfere with the service.</li>
          <li style={LI}>Don&apos;t use Central to collect personal information about people without their consent.</li>
        </ul>

        <h2 style={H2}>Termination</h2>
        <p style={P}>
          We may suspend or terminate accounts that violate these terms — including immediately and without notice for
          objectionable content or abusive behavior. Ministry leaders may likewise remove or ban members of their own
          ministry. You may stop using Central and delete your account at any time.
        </p>

        <h2 style={H2}>Disclaimers</h2>
        <p style={P}>
          Central is provided &ldquo;as is.&rdquo; We work hard to keep it reliable, but we don&apos;t guarantee the
          service will be uninterrupted or error-free, and to the fullest extent permitted by law we disclaim implied
          warranties and limit our liability to the amount you paid us to use Central (currently: nothing).
        </p>

        <h2 style={H2}>Changes to these terms</h2>
        <p style={P}>
          If we make material changes we&apos;ll update the effective date above and, where appropriate, notify you in
          the app. Continuing to use Central after a change means you accept the updated terms.
        </p>

        <h2 style={H2}>Contact</h2>
        <p style={P}>
          Questions about these terms? Email us at{" "}
          <a href={`mailto:${SUPPORT_EMAIL}`} style={{ color: "var(--plum-2)", fontWeight: 500 }}>{SUPPORT_EMAIL}</a>.
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
