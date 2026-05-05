import type { Metadata } from "next"
import Link from "next/link"
import { MessageSquare, Megaphone, Users, CalendarDays } from "lucide-react"

export const metadata: Metadata = {
  title: "Central — College Ministry Communication Platform",
  description:
    "The all-in-one communication and planning app built for college ministries. Chat, announcements, member directory, and team planning tools.",
  keywords: [
    "college ministry",
    "campus ministry",
    "church communication app",
    "student ministry platform",
    "ministry planning",
    "church chat",
    "ministry directory",
  ],
}

function RingCrossLogo({ size = 32, color = "#3E1540" }: { size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden>
      <circle cx="50" cy="50" r="36" stroke={color} strokeWidth="7" />
      <line x1="50" y1="17" x2="50" y2="83" stroke={color} strokeWidth="7" strokeLinecap="round" />
      <line x1="17" y1="50" x2="83" y2="50" stroke={color} strokeWidth="7" strokeLinecap="round" />
    </svg>
  )
}

const features = [
  {
    icon: <MessageSquare size={22} strokeWidth={1.75} />,
    title: "Real-time messaging",
    description:
      "Church-wide group chats, small team channels, and direct messages — all synced live.",
  },
  {
    icon: <Megaphone size={22} strokeWidth={1.75} />,
    title: "Announcements & events",
    description:
      "Post announcements with RSVP, audience targeting, and image attachments to keep everyone informed.",
  },
  {
    icon: <Users size={22} strokeWidth={1.75} />,
    title: "Member directory",
    description:
      "Searchable profiles with about me, Bible verse, and community prayer requests.",
  },
  {
    icon: <CalendarDays size={22} strokeWidth={1.75} />,
    title: "Team planning tools",
    description:
      "Role-based teams, meeting notes, and shared resources to keep your ministry leaders aligned.",
  },
]

export default function LandingPage() {
  return (
    <div style={{ background: "#FBF8F2", minHeight: "100vh", fontFamily: "var(--font-inter)" }}>

      {/* ── Hero ──────────────────────────────────────────────────────── */}
      <section
        style={{
          minHeight: "100svh",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          padding: "48px 24px 64px",
          textAlign: "center",
        }}
      >
        {/* Logo + wordmark */}
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 52 }}>
          <RingCrossLogo size={30} />
          <span
            style={{
              fontFamily: "var(--font-instrument-serif)",
              fontSize: 22,
              fontWeight: 400,
              color: "#13101A",
              letterSpacing: "-0.01em",
            }}
          >
            Central
          </span>
        </div>

        {/* Heading */}
        <h1
          style={{
            fontFamily: "var(--font-instrument-serif)",
            fontSize: "clamp(32px, 7vw, 56px)",
            fontWeight: 400,
            color: "#13101A",
            letterSpacing: "-0.02em",
            lineHeight: 1.15,
            maxWidth: 640,
            margin: "0 auto 20px",
          }}
        >
          Everything your ministry needs, in one place.
        </h1>

        {/* Subtitle */}
        <p
          style={{
            fontSize: "clamp(15px, 2vw, 17px)",
            color: "#5A5466",
            lineHeight: 1.7,
            maxWidth: 480,
            margin: "0 auto 40px",
          }}
        >
          Central is the communication and planning platform built for college ministries.
          Chat, announcements, directories, and team tools — all in one app.
        </p>

        {/* CTA buttons */}
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 12,
            width: "100%",
            maxWidth: 320,
            margin: "0 auto",
          }}
          className="sm:flex-row sm:max-w-none sm:w-auto sm:justify-center"
        >
          <Link
            href="/onboarding"
            style={{
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              padding: "13px 28px",
              background: "#3E1540",
              color: "#F6F4EF",
              borderRadius: 12,
              fontSize: 15,
              fontWeight: 600,
              textDecoration: "none",
              letterSpacing: "-0.01em",
              whiteSpace: "nowrap",
            }}
          >
            Register my ministry
          </Link>
          <Link
            href="/join"
            style={{
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              padding: "13px 28px",
              background: "transparent",
              color: "#13101A",
              border: "1.5px solid #D4CFC7",
              borderRadius: 12,
              fontSize: 15,
              fontWeight: 500,
              textDecoration: "none",
              letterSpacing: "-0.01em",
              whiteSpace: "nowrap",
            }}
          >
            Join a ministry
          </Link>
          <Link
            href="/login"
            style={{
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              padding: "13px 28px",
              background: "transparent",
              color: "#3E1540",
              borderRadius: 12,
              fontSize: 15,
              fontWeight: 500,
              textDecoration: "none",
              letterSpacing: "-0.01em",
              whiteSpace: "nowrap",
            }}
          >
            Sign in
          </Link>
        </div>
      </section>

      {/* ── Features ──────────────────────────────────────────────────── */}
      <section
        style={{
          padding: "72px 24px",
          maxWidth: 960,
          margin: "0 auto",
        }}
      >
        <h2
          style={{
            fontFamily: "var(--font-instrument-serif)",
            fontSize: "clamp(24px, 4vw, 34px)",
            fontWeight: 400,
            color: "#13101A",
            letterSpacing: "-0.02em",
            textAlign: "center",
            margin: "0 0 48px",
          }}
        >
          Built for how ministries actually work
        </h2>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
            gap: 20,
          }}
        >
          {features.map((f) => (
            <div
              key={f.title}
              style={{
                background: "white",
                border: "1px solid #ECE8DE",
                borderRadius: 16,
                padding: "28px 24px",
                boxShadow: "0 2px 8px rgba(19,16,26,0.06)",
              }}
            >
              <div
                style={{
                  width: 42,
                  height: 42,
                  borderRadius: 10,
                  background: "#F4F0F8",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  color: "#3E1540",
                  marginBottom: 16,
                }}
              >
                {f.icon}
              </div>
              <h3
                style={{
                  fontFamily: "var(--font-instrument-serif)",
                  fontSize: 18,
                  fontWeight: 400,
                  color: "#13101A",
                  letterSpacing: "-0.01em",
                  margin: "0 0 8px",
                }}
              >
                {f.title}
              </h3>
              <p style={{ fontSize: 14, color: "#5A5466", lineHeight: 1.7, margin: 0 }}>
                {f.description}
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* ── Footer ────────────────────────────────────────────────────── */}
      <footer
        style={{
          borderTop: "1px solid #ECE8DE",
          padding: "32px 24px",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: 10,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <RingCrossLogo size={20} color="#8A8497" />
          <span
            style={{
              fontFamily: "var(--font-instrument-serif)",
              fontSize: 16,
              fontWeight: 400,
              color: "#8A8497",
            }}
          >
            Central
          </span>
        </div>
        <p style={{ fontSize: 13, color: "#8A8497", margin: 0 }}>
          Built for college ministries
        </p>
      </footer>

    </div>
  )
}
