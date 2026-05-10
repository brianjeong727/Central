"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { getUserMinistries } from "@/app/actions/ministry"
import { RingCrossLogo } from "@/app/home/components/shared"
import { createClient } from "@/lib/supabase"

const C = {
  plum: "#3E1540",
  plumDarker: "#240920",
  ink: "#13101A",
  surface: "#FBF8F2",
  surface2: "#F6F4EF",
  border: "#ECE8DE",
  body: "#5A5466",
  muted: "#8A8497",
  ivory: "#F6F4EF",
}

const SERIF = "var(--font-instrument-serif)"
const SANS = "var(--font-inter)"

const FEATURES = [
  {
    num: "i",
    title: "Chats that match ministry life.",
    body: "Church-wide rooms, small groups, direct messages, and threaded replies — the way students actually talk during the week.",
  },
  {
    num: "ii",
    title: "Announcements with follow-through.",
    body: "Pinned updates, event context, and RSVP tracking, so the right people see the right thing without another spreadsheet.",
  },
  {
    num: "iii",
    title: "A living directory of your people.",
    body: "Names, roles, prayer requests, and spiritual profiles — leaders and students can care for each other well.",
  },
  {
    num: "iv",
    title: "Planning, beside the conversation.",
    body: "Team roles, worship rosters, and event tasks live next to the chats that move them forward — not in a second app.",
  },
]

const RHYTHM = [
  { day: "Sun · service", what: "Welcome new students.", who: "— the welcome team" },
  { day: "Mon · planning", what: "Publish the week ahead.", who: "— campus leads" },
  { day: "Wed · rehearsal", what: "Coordinate worship.", who: "— praise team" },
  { day: "Fri · cells", what: "Keep small groups close.", who: "— cell leaders" },
]

export default function LandingPage() {
  const router = useRouter()
  const [scrolled, setScrolled] = useState(false)
  const [authUser, setAuthUser] = useState<boolean | null>(null)
  const [authChecked, setAuthChecked] = useState(false)
  const [ministryCount, setMinistryCount] = useState<number>(1)

  useEffect(() => {
    function onScroll() {
      setScrolled(window.scrollY > 56)
    }
    onScroll()
    window.addEventListener("scroll", onScroll, { passive: true })
    return () => window.removeEventListener("scroll", onScroll)
  }, [])

  useEffect(() => {
    const supabase = createClient()
    supabase.auth.getUser().then(async ({ data: { user } }) => {
      setAuthUser(Boolean(user))
      setAuthChecked(true)
      if (user) {
        const { data } = await getUserMinistries()
        setMinistryCount(data?.length ?? 1)
      }
    })
  }, [])

  async function handleSignOut() {
    const supabase = createClient()
    await supabase.auth.signOut()
    window.location.assign("/")
  }

  const navColor = scrolled ? C.ink : C.ivory
  const navMuted = scrolled ? "rgba(90,84,102,0.9)" : "rgba(246,244,239,0.85)"

  return (
    <main style={{ minHeight: "100vh", background: C.surface, color: C.ink, fontFamily: SANS }}>

      {/* ── NAV ── */}
      <nav
        style={{
          position: "fixed", top: 0, left: 0, right: 0, zIndex: 50,
          borderBottom: scrolled ? `1px solid ${C.border}` : "1px solid transparent",
          background: scrolled ? "rgba(251,248,242,0.92)" : "transparent",
          backdropFilter: scrolled ? "blur(16px)" : "none",
          WebkitBackdropFilter: scrolled ? "blur(16px)" : "none",
          transition: "background 180ms ease, border-color 180ms ease",
        }}
      >
        <div style={{ maxWidth: 1192, margin: "0 auto", padding: "0 56px", display: "flex", alignItems: "center", height: 72, gap: 24 }}>
          {/* Brand */}
          <Link
            href="/"
            style={{ display: "flex", alignItems: "center", gap: 10, textDecoration: "none", color: navColor, fontFamily: SERIF, fontSize: 22, transition: "color 180ms ease", flexShrink: 0 }}
          >
            <RingCrossLogo size={28} color={scrolled ? C.plum : C.ivory} />
            Central
          </Link>

          {/* Center links */}
          <div className="cl-nav-links" style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 28 }}>
            {[["Platform", "#platform"], ["Rhythm", "#rhythm"], ["Ministries", "/ministries"]].map(([label, href]) => (
              <a key={label} href={href} style={{ fontSize: 13, color: navMuted, textDecoration: "none" }}>
                {label}
              </a>
            ))}
          </div>

          {/* Right CTAs */}
          <div style={{ display: "flex", gap: 10, alignItems: "center", flexShrink: 0 }}>
            {authChecked && authUser ? (
              <>
                <a
                  href={ministryCount > 1 ? "/pick-ministry" : "/home"}
                  style={{ height: 36, padding: "0 16px", borderRadius: 999, display: "inline-flex", alignItems: "center", fontSize: 13.5, fontWeight: 500, textDecoration: "none", border: scrolled ? `1px solid ${C.border}` : "1px solid rgba(246,244,239,0.5)", color: navColor, background: "transparent", fontFamily: SANS }}
                >
                  Open app
                </a>
                <button
                  onClick={handleSignOut}
                  style={{ background: "transparent", border: 0, color: navMuted, cursor: "pointer", fontFamily: SANS, fontSize: 13 }}
                >
                  Sign out
                </button>
              </>
            ) : (
              <>
                <a
                  href="/login"
                  style={{ height: 36, padding: "0 10px", borderRadius: 999, display: "inline-flex", alignItems: "center", fontSize: 13.5, textDecoration: "none", border: "none", background: "transparent", color: navColor, fontFamily: SANS }}
                >
                  Sign in
                </a>
                <button
                  onClick={() => router.push("/onboarding")}
                  style={{ height: 36, padding: "0 16px", borderRadius: 999, display: "inline-flex", alignItems: "center", fontSize: 13.5, fontWeight: 500, border: scrolled ? `1px solid ${C.plum}` : `1px solid ${C.ivory}`, background: scrolled ? C.plum : C.ivory, color: scrolled ? C.ivory : C.plum, cursor: "pointer", fontFamily: SANS }}
                >
                  Get started
                </button>
              </>
            )}
          </div>
        </div>
      </nav>

      {/* ── HERO ── */}
      <section className="cl-hero" style={{ position: "relative", minHeight: 760, overflow: "hidden" }}>
        {/* Chapel — no overlay washes, image speaks for itself */}
        <img
          src="/chapel.jpg"
          alt=""
          aria-hidden
          style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" }}
        />
        {/* Paper fade dissolves image into page at bottom */}
        <div
          aria-hidden
          style={{ position: "absolute", left: 0, right: 0, bottom: 0, height: 180, background: "linear-gradient(180deg, rgba(251,248,242,0) 0%, rgba(251,248,242,0.55) 55%, #FBF8F2 100%)", zIndex: 1 }}
        />

        {/* Same centered container as nav and platform sections */}
        <div className="cl-hero-container" style={{ position: "relative", zIndex: 2, maxWidth: 1192, margin: "0 auto", padding: "0 56px" }}>
        {/* Left-constrained content within the container — keeps chapel untouched */}
        <div
          className="cl-hero-body"
          style={{ padding: "148px 0 96px", maxWidth: 460 }}
        >
          <p style={{ margin: "0 0 22px", fontSize: 11, letterSpacing: "0.22em", textTransform: "uppercase", color: "rgba(246,244,239,0.72)" }}>
            For college ministry leaders
          </p>
          <h1 className="cl-hero-title" style={{ fontFamily: SERIF, fontSize: 76, lineHeight: 0.96, letterSpacing: "-0.018em", color: C.ivory, margin: 0, fontWeight: 400 }}>
            Know who&apos;s connected<br />and what needs{" "}
            <span className="cl-rhythm-italic" style={{ fontStyle: "italic" }}>follow-up.</span>
          </h1>
          <p
            className="cl-hero-sub"
            style={{ fontFamily: SERIF, fontStyle: "italic", fontSize: 18, color: C.ivory, marginTop: 24, maxWidth: 380, lineHeight: 1.5 }}
          >
            Replace scattered chats, announcement threads, RSVP lists, and planning docs with one calm weekly workspace.
          </p>
          <div style={{ display: "flex", gap: 12, marginTop: 32, flexWrap: "wrap" }}>
            <button
              onClick={() => router.push("/onboarding")}
              style={{ height: 48, padding: "0 22px", borderRadius: 999, fontSize: 14, fontWeight: 500, border: `1px solid ${C.ivory}`, background: C.ivory, color: C.plum, cursor: "pointer", fontFamily: SANS, display: "inline-flex", alignItems: "center" }}
            >
              Register your ministry
            </button>
            <a
              href="/ministries"
              style={{ height: 48, padding: "0 22px", borderRadius: 999, fontSize: 14, fontWeight: 500, border: "1px solid rgba(246,244,239,0.52)", background: "rgba(36,9,32,0.82)", color: C.ivory, textDecoration: "none", display: "inline-flex", alignItems: "center" }}
            >
              Find an existing one
            </a>
          </div>
        </div>

        {/* Verse — pinned upper-right, sits in the plum sky of the image */}
        <div
          className="cl-verse-anchor"
          style={{ position: "absolute", right: 56, top: 130, maxWidth: 240, textAlign: "right", zIndex: 2 }}
        >
          <p style={{ fontFamily: SERIF, fontStyle: "italic", fontSize: 14.5, color: C.ivory, lineHeight: 1.5, margin: 0 }}>
            &ldquo;For where two or three gather in my name, there am I with them.&rdquo;
          </p>
          <p style={{ fontSize: 10, letterSpacing: "0.22em", textTransform: "uppercase", color: "rgba(246,244,239,0.68)", margin: "12px 0 0" }}>
            Matthew 18 : 20
          </p>
        </div>
        </div>
      </section>

      {/* ── PLATFORM ── */}
      <section id="platform" className="cl-platform" style={{ maxWidth: 1192, margin: "0 auto", padding: "96px 56px" }}>
        <p style={{ fontSize: 11, letterSpacing: "0.18em", textTransform: "uppercase", color: C.muted, margin: 0 }}>
          One calm system
        </p>
        <h2 className="cl-section-h" style={{ fontFamily: SERIF, fontSize: 60, lineHeight: 0.98, letterSpacing: "-0.012em", margin: "16px 0 0", fontWeight: 400, color: C.ink }}>
          Less drift between<br />Sunday and the next gathering.
        </h2>
        <p style={{ fontSize: 16, color: C.body, marginTop: 22, maxWidth: 580, lineHeight: 1.6 }}>
          Central gives leaders one place to post updates, track responses, care for people, and coordinate the teams that carry the week.
        </p>

        <div
          className="cl-feat-grid"
          style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 1, background: C.border, marginTop: 56, border: `1px solid ${C.border}`, borderRadius: 18, overflow: "hidden" }}
        >
          {FEATURES.map(({ num, title, body }) => (
            <div key={num} style={{ background: C.surface, padding: "40px 36px", minHeight: 220 }}>
              <div style={{ fontFamily: SERIF, fontStyle: "italic", fontSize: 18, color: C.muted }}>{num}</div>
              <h4 style={{ fontFamily: SERIF, fontSize: 28, lineHeight: 1.1, fontWeight: 400, margin: "14px 0 10px", color: C.ink }}>{title}</h4>
              <p style={{ color: C.body, fontSize: 14.5, lineHeight: 1.6, margin: 0 }}>{body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── RHYTHM ── */}
      <section id="rhythm" style={{ background: C.surface2, padding: "96px 0" }}>
        <div className="cl-rhythm-inner" style={{ maxWidth: 1192, margin: "0 auto", padding: "0 56px" }}>
          <p style={{ fontSize: 11, letterSpacing: "0.18em", textTransform: "uppercase", color: C.muted, margin: 0 }}>
            A week with Central
          </p>
          <h2 className="cl-rhythm-h" style={{ fontFamily: SERIF, fontSize: 52, lineHeight: 0.98, letterSpacing: "-0.012em", margin: "16px 0 0", fontWeight: 400, color: C.ink }}>
            Built for the rhythms<br />you repeat every week.
          </h2>

          <div className="cl-rhythm-strip" style={{ marginTop: 48, display: "grid", gridTemplateColumns: "repeat(4, 1fr)", borderTop: `1px solid ${C.border}`, borderBottom: `1px solid ${C.border}` }}>
            {RHYTHM.map(({ day, what, who }, i) => (
              <div
                key={day}
                style={{ padding: "32px 24px", borderRight: i < RHYTHM.length - 1 ? `1px solid ${C.border}` : "none" }}
              >
                <div style={{ fontSize: 10, letterSpacing: "0.22em", textTransform: "uppercase", color: C.muted }}>{day}</div>
                <div style={{ fontFamily: SERIF, fontSize: 24, lineHeight: 1.2, marginTop: 10, color: C.ink }}>{what}</div>
                <div style={{ fontSize: 12.5, color: C.muted, marginTop: 10 }}>{who}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── CTA ── */}
      <section className="cl-cta" style={{ padding: "110px 56px", background: C.plum, color: C.ivory, position: "relative", overflow: "hidden" }}>
        <div aria-hidden style={{ position: "absolute", inset: 0, backgroundImage: "radial-gradient(circle, rgba(246,244,239,0.16) 1px, transparent 1.4px)", backgroundSize: "22px 22px", opacity: 0.28, pointerEvents: "none" }} />
        <div aria-hidden style={{ position: "absolute", inset: 0, background: "radial-gradient(circle at 88% 16%, rgba(246,244,239,0.12) 0%, transparent 40%), radial-gradient(circle at 6% 88%, rgba(246,244,239,0.08) 0%, transparent 35%)", pointerEvents: "none" }} />
        <div style={{ position: "relative", maxWidth: 720, margin: "0 auto" }}>
          <p style={{ fontSize: 11, letterSpacing: "0.22em", textTransform: "uppercase", color: "rgba(246,244,239,0.7)", margin: 0 }}>
            Begin
          </p>
          <h3 className="cl-cta-title" style={{ fontFamily: SERIF, fontSize: 72, lineHeight: 1, letterSpacing: "-0.012em", margin: "16px 0 0", fontWeight: 400 }}>
            Give your ministry<br />one place to gather.
          </h3>
          <p style={{ fontFamily: SERIF, fontStyle: "italic", fontSize: 19, color: "rgba(246,244,239,0.82)", marginTop: 24, maxWidth: 520, lineHeight: 1.5 }}>
            Register a ministry, invite your students, and keep the week moving with a little less friction.
          </p>
          <div style={{ marginTop: 36, display: "flex", gap: 10, flexWrap: "wrap" }}>
            <button
              onClick={() => router.push("/onboarding")}
              style={{ height: 48, padding: "0 22px", borderRadius: 999, fontSize: 14, fontWeight: 500, border: `1px solid ${C.ivory}`, background: C.ivory, color: C.plum, cursor: "pointer", fontFamily: SANS, display: "inline-flex", alignItems: "center" }}
            >
              Start with Central
            </button>
            <a
              href="/login"
              style={{ height: 48, padding: "0 22px", borderRadius: 999, fontSize: 14, fontWeight: 500, border: "1px solid rgba(246,244,239,0.35)", background: "rgba(36,9,32,0.85)", color: C.ivory, textDecoration: "none", display: "inline-flex", alignItems: "center" }}
            >
              Sign in
            </a>
          </div>
        </div>
      </section>

      {/* ── FOOTER ── */}
      <footer className="cl-footer" style={{ padding: "56px 56px" }}>
        <div style={{ maxWidth: 1192, margin: "0 auto" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", paddingBottom: 22, borderBottom: `1px solid ${C.border}`, flexWrap: "wrap", gap: 16 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, fontFamily: SERIF, fontSize: 22, color: C.ink }}>
              <RingCrossLogo size={24} color={C.plum} />
              Central
            </div>
            <div className="cl-footer-links" style={{ display: "flex", gap: 28, fontSize: 13, color: C.body, flexWrap: "wrap" }}>
              {[["Log in", "/login"], ["Find ministry", "/ministries"], ["Platform", "#platform"], ["Rhythm", "#rhythm"]].map(([label, href]) => (
                <a key={label} href={href} style={{ textDecoration: "none", color: "inherit" }}>{label}</a>
              ))}
            </div>
          </div>
          <div style={{ paddingTop: 22, display: "flex", justifyContent: "space-between", fontSize: 12.5, color: C.muted, flexWrap: "wrap", gap: 8 }}>
            <em style={{ fontFamily: SERIF, fontStyle: "italic", color: C.ink }}>Built for the rhythms you repeat every week.</em>
            <span>© Central · College ministry communication</span>
          </div>
        </div>
      </footer>

      <style>{`
        /* Gold underline on italic "rhythm" in hero */
        .cl-rhythm-italic {
          position: relative;
        }
        .cl-rhythm-italic::after {
          content: "";
          position: absolute;
          left: 0;
          right: 6px;
          bottom: 4px;
          height: 2px;
          background: rgba(246,244,239,0.72);
          border-radius: 2px;
        }

        @media (max-width: 900px) {
          .cl-nav-links { display: none !important; }
          .cl-hero { min-height: 520px !important; }
          .cl-hero-container { padding: 0 24px !important; }
          .cl-hero-body { padding: 112px 0 72px !important; max-width: 100% !important; }
          .cl-hero-title { font-size: 46px !important; }
          .cl-hero-sub { font-size: 16px !important; max-width: 100% !important; }
          .cl-verse-anchor { display: none !important; }

          .cl-platform { padding: 64px 24px !important; }
          .cl-section-h { font-size: 36px !important; }
          .cl-feat-grid { grid-template-columns: 1fr !important; }

          .cl-rhythm-inner { padding: 0 24px !important; }
          .cl-rhythm-h { font-size: 34px !important; }
          .cl-rhythm-strip { grid-template-columns: 1fr 1fr !important; }

          .cl-cta { padding: 72px 24px !important; }
          .cl-cta-title { font-size: 44px !important; }

          .cl-footer { padding: 40px 24px !important; }
        }

        @media (max-width: 560px) {
          .cl-hero-title { font-size: 38px !important; }
          .cl-rhythm-strip { grid-template-columns: 1fr !important; }
          .cl-rhythm-strip > div { border-right: none !important; border-bottom: 1px solid ${C.border}; }
          .cl-cta-title { font-size: 34px !important; }
        }
      `}</style>
    </main>
  )
}
