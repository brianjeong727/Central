"use client"

import { useRouter } from "next/navigation"
import { useState, useEffect } from "react"
import { MessageCircle, Megaphone, Users, ClipboardList } from "lucide-react"
import { RingCrossLogo } from "@/app/home/components/shared"
import { createClient } from "@/lib/supabase"

const FEATURES = [
  {
    icon: MessageCircle,
    title: "Real-time Messaging",
    body: "Church-wide channels and small-group chats, all in one place. Direct messages too.",
  },
  {
    icon: Megaphone,
    title: "Announcements",
    body: "Pin events, send announcements, track RSVPs — your community stays in the loop.",
  },
  {
    icon: Users,
    title: "Member Directory",
    body: "Every member's name, role, and prayer request. Know who you're walking with.",
  },
  {
    icon: ClipboardList,
    title: "Team Planning",
    body: "Worship rosters, event tasks, role assignments — everything your teams need to execute.",
  },
]

export default function LandingPage() {
  const router = useRouter()
  const [scrolled, setScrolled] = useState(false)
  const [authUser, setAuthUser] = useState<boolean | null>(null)
  const [authChecked, setAuthChecked] = useState(false)

  useEffect(() => {
    function onScroll() {
      setScrolled(window.scrollY > 80)
    }
    window.addEventListener("scroll", onScroll, { passive: true })
    return () => window.removeEventListener("scroll", onScroll)
  }, [])

  useEffect(() => {
    const supabase = createClient()
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (user) setAuthUser(true)
      setAuthChecked(true)
    })
  }, [])

  function handleRegisterClick() {
    window.location.href = "/onboarding"
  }


  async function handleSignOut() {
    const supabase = createClient()
    await supabase.auth.signOut()
    window.location.href = "/landing"
  }

  return (
    <div style={{ fontFamily: "var(--font-inter)" }}>

      {/* ─────────────────────────────────────────────────────────── */}
      {/* FIXED NAVBAR                                                */}
      {/* ─────────────────────────────────────────────────────────── */}
      <nav
        style={{
          position: "fixed",
          top: 0,
          left: 0,
          right: 0,
          zIndex: 50,
          height: 68,
          display: "grid",
          gridTemplateColumns: "1fr auto 1fr",
          alignItems: "center",
          padding: "0 32px",
          backgroundColor: scrolled ? "#FBF8F2" : "transparent",
          borderBottom: scrolled ? "1px solid #ECE8DE" : "1px solid transparent",
          backdropFilter: scrolled ? "blur(12px)" : "none",
          WebkitBackdropFilter: scrolled ? "blur(12px)" : "none",
          transition: "background-color 0.25s ease, border-color 0.25s ease, backdrop-filter 0.25s ease",
        }}
      >
        {/* Column 1: Logo */}
        <div style={{ display: "flex", alignItems: "center" }}>
          <a
            href="/"
            style={{
              display: "flex",
              alignItems: "center",
              gap: 9,
              textDecoration: "none",
              flexShrink: 0,
            }}
          >
            <RingCrossLogo size={26} color={scrolled ? "#3E1540" : "#F6F4EF"} />
            <span
              style={{
                fontFamily: "var(--font-instrument-serif)",
                fontSize: "24px",
                color: scrolled ? "#13101A" : "#F6F4EF",
                letterSpacing: "-0.01em",
                lineHeight: 1,
                transition: "color 0.25s ease",
              }}
            >
              Central
            </span>
          </a>
        </div>

        {/* Column 2: Center nav links — desktop only, collapses to nothing on mobile */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center" }}>
          <div className="hidden sm:flex" style={{ alignItems: "center", gap: 32 }}>
            {[
              { label: "About", href: "#about" },
              { label: "Why us", href: "#why-us" },
              { label: "Ministries", href: "/ministries" },
            ].map(({ label, href }) => (
              <a
                key={label}
                href={href}
                style={{
                  fontSize: 14, fontWeight: 400,
                  color: scrolled ? "#8A8497" : "rgba(246,244,239,0.75)",
                  textDecoration: "none",
                  transition: "color 0.2s ease",
                  whiteSpace: "nowrap",
                }}
                onMouseEnter={e => (e.currentTarget.style.color = scrolled ? "#13101A" : "#F6F4EF")}
                onMouseLeave={e => (e.currentTarget.style.color = scrolled ? "#8A8497" : "rgba(246,244,239,0.75)")}
              >
                {label}
              </a>
            ))}
            <button
              onClick={handleRegisterClick}
              style={{
                fontSize: 14, fontWeight: 400,
                color: scrolled ? "#8A8497" : "rgba(246,244,239,0.75)",
                background: "none", border: "none", cursor: "pointer", padding: 0,
                transition: "color 0.2s ease",
                whiteSpace: "nowrap",
                fontFamily: "var(--font-inter)",
              }}
              onMouseEnter={e => (e.currentTarget.style.color = scrolled ? "#13101A" : "#F6F4EF")}
              onMouseLeave={e => (e.currentTarget.style.color = scrolled ? "#8A8497" : "rgba(246,244,239,0.75)")}
            >
              Register your ministry
            </button>
          </div>
        </div>

        {/* Column 3: Right auth */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "flex-end" }}>

          {/* Desktop */}
          <div className="hidden sm:flex" style={{ alignItems: "center", gap: 20 }}>
            {authChecked && !authUser && (
              <a
                href="/login"
                style={{
                  fontSize: 14, fontWeight: 500,
                  color: scrolled ? "#5A5466" : "#F6F4EF",
                  textDecoration: "none",
                  transition: "color 0.25s ease",
                }}
              >
                Sign in
              </a>
            )}
            {authChecked && authUser ? (
              <>
                <a
                  href="/home"
                  style={{
                    padding: "7px 18px", borderRadius: 9999, fontSize: 13, fontWeight: 500,
                    background: "transparent", textDecoration: "none",
                    whiteSpace: "nowrap", letterSpacing: "-0.01em",
                    transition: "color 0.2s ease, border-color 0.2s ease",
                    ...(scrolled
                      ? { color: "#3E1540", border: "1px solid #3E1540" }
                      : { color: "#F6F4EF", border: "1px solid #F6F4EF" }),
                  }}
                  onMouseEnter={e => {
                    e.currentTarget.style.color = scrolled ? "#2D0F2E" : "#ffffff"
                    e.currentTarget.style.borderColor = scrolled ? "#2D0F2E" : "#ffffff"
                  }}
                  onMouseLeave={e => {
                    e.currentTarget.style.color = scrolled ? "#3E1540" : "#F6F4EF"
                    e.currentTarget.style.borderColor = scrolled ? "#3E1540" : "#F6F4EF"
                  }}
                >
                  Go to app
                </a>
                <button
                  onClick={handleSignOut}
                  style={{
                    fontSize: 13, fontWeight: 500, background: "none", border: "none",
                    cursor: "pointer", padding: 0, whiteSpace: "nowrap",
                    color: scrolled ? "#8A8497" : "rgba(246,244,239,0.6)",
                    transition: "color 0.2s ease",
                    fontFamily: "var(--font-inter)",
                  }}
                  onMouseEnter={e => (e.currentTarget.style.color = scrolled ? "#13101A" : "#F6F4EF")}
                  onMouseLeave={e => (e.currentTarget.style.color = scrolled ? "#8A8497" : "rgba(246,244,239,0.6)")}
                >
                  Sign out
                </button>
              </>
            ) : (
              <button
                onClick={() => router.push("/signup")}
                style={{
                  padding: "7px 18px", borderRadius: 9999, fontSize: 13, fontWeight: 500,
                  cursor: "pointer", letterSpacing: "-0.01em", whiteSpace: "nowrap",
                  transition: "background 0.25s ease, color 0.25s ease, border-color 0.25s ease",
                  ...(scrolled
                    ? { background: "#3E1540", color: "#F6F4EF", border: "1.5px solid #3E1540" }
                    : { background: "transparent", color: "#F6F4EF", border: "1.5px solid rgba(246,244,239,0.65)" }),
                }}
              >
                Sign up
              </button>
            )}
          </div>

          {/* Mobile */}
          <div className="flex sm:hidden" style={{ alignItems: "center", gap: 16 }}>
            <a
              href="/ministries"
              style={{
                fontSize: 13, fontWeight: 500,
                color: scrolled ? "#5A5466" : "#F6F4EF",
                textDecoration: "none",
                transition: "color 0.25s ease",
              }}
            >
              Ministries
            </a>
            {authChecked && authUser ? (
              <>
                <a
                  href="/home"
                  style={{
                    padding: "6px 14px", borderRadius: 9999, fontSize: 13, fontWeight: 500,
                    background: "transparent", textDecoration: "none",
                    whiteSpace: "nowrap", letterSpacing: "-0.01em",
                    transition: "color 0.2s ease, border-color 0.2s ease",
                    ...(scrolled
                      ? { color: "#3E1540", border: "1px solid #3E1540" }
                      : { color: "#F6F4EF", border: "1px solid #F6F4EF" }),
                  }}
                  onMouseEnter={e => {
                    e.currentTarget.style.color = scrolled ? "#2D0F2E" : "#ffffff"
                    e.currentTarget.style.borderColor = scrolled ? "#2D0F2E" : "#ffffff"
                  }}
                  onMouseLeave={e => {
                    e.currentTarget.style.color = scrolled ? "#3E1540" : "#F6F4EF"
                    e.currentTarget.style.borderColor = scrolled ? "#3E1540" : "#F6F4EF"
                  }}
                >
                  Go to app
                </a>
                <button
                  onClick={handleSignOut}
                  style={{
                    fontSize: 12, fontWeight: 500, background: "none", border: "none",
                    cursor: "pointer", padding: 0, whiteSpace: "nowrap",
                    color: scrolled ? "#8A8497" : "rgba(246,244,239,0.6)",
                    transition: "color 0.2s ease",
                    fontFamily: "var(--font-inter)",
                  }}
                  onMouseEnter={e => (e.currentTarget.style.color = scrolled ? "#13101A" : "#F6F4EF")}
                  onMouseLeave={e => (e.currentTarget.style.color = scrolled ? "#8A8497" : "rgba(246,244,239,0.6)")}
                >
                  Sign out
                </button>
              </>
            ) : (
              <button
                onClick={() => router.push("/signup")}
                style={{
                  padding: "7px 16px", borderRadius: 9999, fontSize: 13, fontWeight: 500,
                  cursor: "pointer", letterSpacing: "-0.01em", whiteSpace: "nowrap",
                  transition: "background 0.25s ease, color 0.25s ease, border-color 0.25s ease",
                  ...(scrolled
                    ? { background: "#3E1540", color: "#F6F4EF", border: "1.5px solid #3E1540" }
                    : { background: "transparent", color: "#F6F4EF", border: "1.5px solid rgba(246,244,239,0.65)" }),
                }}
              >
                Get started
              </button>
            )}
          </div>

        </div>
      </nav>

      {/* ─────────────────────────────────────────────────────────── */}
      {/* SECTION 1 — HERO                                           */}
      {/* ─────────────────────────────────────────────────────────── */}
      <section
        style={{
          position: "relative",
          width: "100%",
          height: "100svh",
          minHeight: 600,
          overflow: "hidden",
          display: "flex",
          flexDirection: "column",
        }}
      >
        {/* Background photo */}
        <div
          style={{
            position: "absolute",
            inset: 0,
            backgroundImage: "url('/chapel.jpg')",
            backgroundSize: "cover",
            backgroundPosition: "center 30%",
            zIndex: 0,
          }}
        />

        {/* Gradient overlays */}
        <div
          style={{
            position: "absolute",
            inset: 0,
            background: "linear-gradient(to bottom, rgba(62,21,64,0.38) 0%, transparent 28%)",
            zIndex: 1,
          }}
        />
        <div
          style={{
            position: "absolute",
            inset: 0,
            background: "linear-gradient(to top, rgba(19,16,26,0.22) 0%, transparent 28%)",
            zIndex: 1,
          }}
        />
        {/* Seamless bottom bleed into ivory — extends 2px below section boundary */}
        <div
          style={{
            position: "absolute",
            bottom: -2,
            left: 0,
            right: 0,
            height: "200px",
            background: "linear-gradient(to top, #FBF8F2 0%, #FBF8F2 8%, rgba(251,248,242,0) 100%)",
            zIndex: 2,
          }}
        />

        {/* Bible verse — top right, offset below navbar */}
        <div
          style={{
            position: "relative",
            zIndex: 10,
            display: "flex",
            justifyContent: "flex-end",
            padding: "76px 36px 0",
          }}
          className="hidden sm:flex"
        >
          <div style={{ textAlign: "right", maxWidth: 280 }}>
            <p
              style={{
                fontFamily: "var(--font-instrument-serif)",
                fontStyle: "italic",
                fontSize: "13.5px",
                color: "rgba(246,244,239,0.88)",
                lineHeight: 1.6,
                margin: 0,
                textShadow: "0 1px 12px rgba(19,16,26,0.5), 0 1px 3px rgba(19,16,26,0.4)",
              }}
            >
              &ldquo;For where two or three gather in my name, there am I with them.&rdquo;
            </p>
            <p
              style={{
                marginTop: 6,
                fontSize: "10px",
                letterSpacing: "0.18em",
                textTransform: "uppercase",
                color: "rgba(246,244,239,0.55)",
                fontFamily: "var(--font-inter)",
                textShadow: "0 1px 12px rgba(19,16,26,0.5), 0 1px 3px rgba(19,16,26,0.4)",
              }}
            >
              Matthew 18:20
            </p>
          </div>
        </div>

        {/* Spacer — pushes content to bottom */}
        <div style={{ flex: 1 }} />

        {/* Hero copy — bottom left */}
        <div
          style={{
            position: "relative",
            zIndex: 10,
            padding: "0 36px 120px",
          }}
          className="flex flex-col items-start sm:items-start text-center sm:text-left"
        >
          <h1
            style={{
              fontFamily: "var(--font-instrument-serif)",
              fontSize: "clamp(48px, 5.5vw, 72px)",
              fontWeight: 400,
              color: "#F6F4EF",
              lineHeight: 1.05,
              letterSpacing: "-0.03em",
              margin: "0 0 28px",
              maxWidth: 600,
              textShadow: "0 2px 20px rgba(19,16,26,0.4), 0 1px 4px rgba(19,16,26,0.3)",
            }}
          >
            Where your ministry<br />gathers.
          </h1>
          <p
            style={{
              fontSize: "clamp(15px, 1.5vw, 18px)",
              color: "rgba(246,244,239,0.70)",
              lineHeight: 1.6,
              maxWidth: 420,
              margin: "0 0 40px",
              textShadow: "0 1px 12px rgba(19,16,26,0.5), 0 1px 3px rgba(19,16,26,0.4)",
            }}
          >
            Messaging, announcements, directory, and team tools — built for the way college ministries actually work.
          </p>

          <div
            style={{ display: "flex", gap: 12, flexWrap: "wrap" }}
            className="justify-center sm:justify-start w-full sm:w-auto"
          >
            <button
              onClick={() => window.location.href = "/onboarding"}
              style={{
                padding: "14px 32px",
                background: "#FBF8F2",
                color: "#3E1540",
                border: "none",
                borderRadius: 9999,
                fontSize: 14,
                fontWeight: 500,
                cursor: "pointer",
                letterSpacing: "-0.01em",
                whiteSpace: "nowrap",
                transition: "background 0.15s",
                boxShadow: "0 2px 12px rgba(19,16,26,0.25)",
              }}
              onMouseEnter={e => (e.currentTarget.style.background = "#EDE9DF")}
              onMouseLeave={e => (e.currentTarget.style.background = "#FBF8F2")}
            >
              Register my ministry
            </button>
            <button
              onClick={() => { window.location.href = "/ministries" }}
              style={{
                padding: "14px 32px",
                background: "transparent",
                color: "rgba(255,255,255,0.95)",
                border: "2px solid rgba(255,255,255,0.9)",
                borderRadius: 9999,
                fontSize: 14,
                fontWeight: 500,
                cursor: "pointer",
                letterSpacing: "-0.01em",
                whiteSpace: "nowrap",
                transition: "border-color 0.15s",
                filter: "drop-shadow(0 1px 6px rgba(19,16,26,0.3))",
                textShadow: "0 1px 8px rgba(19,16,26,0.6)",
              }}
              onMouseEnter={e => (e.currentTarget.style.borderColor = "rgba(246,244,239,0.9)")}
              onMouseLeave={e => (e.currentTarget.style.borderColor = "rgba(246,244,239,0.6)")}
            >
              Join a ministry
            </button>
          </div>
        </div>
      </section>

      {/* ─────────────────────────────────────────────────────────── */}
      {/* SECTION 2 — FEATURES                                       */}
      {/* ─────────────────────────────────────────────────────────── */}
      <section style={{ background: "#FBF8F2", padding: "88px 36px 96px" }}>
        <div style={{ maxWidth: 960, margin: "0 auto" }}>

          {/* Section heading */}
          <div style={{ marginBottom: 56 }}>
            <p
              style={{
                fontFamily: "ui-monospace, 'SF Mono', Menlo, monospace",
                fontSize: 10,
                letterSpacing: "0.16em",
                textTransform: "uppercase",
                color: "#8A8497",
                marginBottom: 14,
              }}
            >
              Everything in one place
            </p>
            <h2
              style={{
                fontFamily: "var(--font-instrument-serif)",
                fontSize: "clamp(32px, 4vw, 48px)",
                fontWeight: 400,
                color: "#13101A",
                letterSpacing: "-0.02em",
                lineHeight: 1.1,
                maxWidth: 520,
                margin: 0,
              }}
            >
              Everything your ministry needs.
            </h2>
          </div>

          {/* 2×2 Feature grid */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(2, 1fr)",
              gap: 20,
            }}
            className="grid-cols-1 sm:grid-cols-2"
          >
            {FEATURES.map(({ icon: Icon, title, body }) => (
              <div
                key={title}
                style={{
                  background: "white",
                  border: "1px solid #ECE8DE",
                  borderRadius: 20,
                  padding: "32px 30px 28px",
                  boxShadow: "0 1px 4px rgba(19,16,26,0.06)",
                }}
              >
                <div
                  style={{
                    width: 44,
                    height: 44,
                    borderRadius: 12,
                    background: "#F4F1E8",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    marginBottom: 20,
                    color: "#3E1540",
                  }}
                >
                  <Icon size={20} strokeWidth={1.5} />
                </div>
                <h3
                  style={{
                    fontFamily: "var(--font-instrument-serif)",
                    fontSize: 22,
                    fontWeight: 400,
                    color: "#13101A",
                    letterSpacing: "-0.01em",
                    margin: "0 0 10px",
                  }}
                >
                  {title}
                </h3>
                <p
                  style={{
                    fontSize: 14,
                    color: "#5A5466",
                    lineHeight: 1.65,
                    margin: 0,
                  }}
                >
                  {body}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ─────────────────────────────────────────────────────────── */}
      {/* SECTION 3 — CTA STRIP                                      */}
      {/* ─────────────────────────────────────────────────────────── */}
      <section
        style={{
          background: "#3E1540",
          padding: "88px 36px",
          textAlign: "center",
        }}
      >
        <div style={{ maxWidth: 640, margin: "0 auto" }}>
          <h2
            style={{
              fontFamily: "var(--font-instrument-serif)",
              fontSize: "clamp(28px, 4vw, 44px)",
              fontWeight: 400,
              color: "#F6F4EF",
              letterSpacing: "-0.02em",
              lineHeight: 1.15,
              margin: "0 0 36px",
            }}
          >
            Built for the way your ministry actually works.
          </h2>
          <button
            onClick={() => window.location.href = "/onboarding"}
            style={{
              height: 50,
              padding: "0 36px",
              background: "#F6F4EF",
              color: "#3E1540",
              border: "none",
              borderRadius: 12,
              fontSize: 15,
              fontWeight: 600,
              cursor: "pointer",
              letterSpacing: "-0.01em",
              transition: "opacity 0.15s",
            }}
            onMouseEnter={e => (e.currentTarget.style.opacity = "0.88")}
            onMouseLeave={e => (e.currentTarget.style.opacity = "1")}
          >
            Get started
          </button>
        </div>
      </section>

      {/* ─────────────────────────────────────────────────────────── */}
      {/* SECTION 4 — FOOTER                                         */}
      {/* ─────────────────────────────────────────────────────────── */}
      <footer
        style={{
          background: "#FBF8F2",
          borderTop: "1px solid #ECE8DE",
          padding: "48px 36px",
          textAlign: "center",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: 16,
        }}
      >
        {/* Logo */}
        <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
          <RingCrossLogo size={22} color="#3E1540" />
          <span
            style={{
              fontFamily: "var(--font-instrument-serif)",
              fontSize: "22px",
              color: "#13101A",
              letterSpacing: "-0.01em",
              lineHeight: 1,
            }}
          >
            Central
          </span>
        </div>

        <p style={{ fontSize: 13, color: "#8A8497", margin: 0 }}>
          Built for college ministries
        </p>

        <div style={{ display: "flex", gap: 24, alignItems: "center" }}>
          <a
            href="/login"
            style={{
              fontSize: 13,
              color: "#5A5466",
              textDecoration: "none",
              fontWeight: 500,
            }}
          >
            Log in
          </a>
          <a
            href="/signup"
            style={{
              fontSize: 13,
              color: "#3E1540",
              textDecoration: "none",
              fontWeight: 600,
            }}
          >
            Sign up
          </a>
        </div>
      </footer>

    </div>
  )
}
