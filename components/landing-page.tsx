"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { Menu, X } from "lucide-react"
import { getUserMinistries } from "@/app/actions/ministry"
import { RingCrossLogo } from "@/app/home/components/shared"
import { createClient } from "@/lib/supabase"

const INK     = "#13101A"
const BODY    = "#5A5466"
const MUTED   = "#8A8497"
const CREAM   = "#FDFCF8"
const CREAM3  = "#F6F2E8"
const IVORY   = "#F1ECDE"
const LINE    = "#E8E2D2"
const LINE2   = "#E2DDCF"
const LINE3   = "#EFE9DA"
const PLUM    = "#3E1540"
const PLUM2   = "#2D0F2E"

const SERIF = "var(--font-instrument-serif)"
const SANS  = "var(--font-inter)"
const MONO  = "ui-monospace, SFMono-Regular, Menlo, monospace"

const FEATURES = [
  { num: "i",   title: "Chats that match ministry life.",       body: "Church-wide rooms, small groups, direct messages, and threaded replies — the way students actually talk during the week, not a generic inbox." },
  { num: "ii",  title: "Announcements with follow-through.",    body: "Pinned updates, event context, and RSVP tracking, so the right people see the right thing without another spreadsheet." },
  { num: "iii", title: "A living directory of your people.",    body: "Names, roles, prayer requests, and spiritual profiles — so leaders and students can genuinely care for one another." },
  { num: "iv",  title: "Planning, beside the conversation.",    body: "Team roles, worship rosters, and event tasks live next to the chats that move them forward — never in a second app." },
]

const RHYTHM = [
  { day: "Sun · service",   what: "Welcome new students.",    who: "— the welcome team" },
  { day: "Mon · planning",  what: "Publish the week ahead.", who: "— campus leads" },
  { day: "Wed · rehearsal", what: "Coordinate worship.",      who: "— praise team" },
  { day: "Fri · cells",     what: "Keep small groups close.", who: "— cell leaders" },
]

export default function LandingPage() {
  const router = useRouter()
  const [scrolled, setScrolled]           = useState(false)
  const [authUser, setAuthUser]           = useState<boolean | null>(null)
  const [authChecked, setAuthChecked]     = useState(false)
  const [ministryCount, setMinistryCount] = useState<number | null>(null)
  const [menuOpen, setMenuOpen]           = useState(false)

  useEffect(() => {
    function onScroll() { setScrolled(window.scrollY > 40) }
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
        setMinistryCount(data?.length ?? 0)
      }
    })
  }, [])

  useEffect(() => { if (scrolled) setMenuOpen(false) }, [scrolled])

  async function handleSignOut() {
    const supabase = createClient()
    await supabase.auth.signOut()
    window.location.assign("/")
  }

  function handleOpenApp() {
    if (ministryCount === 0) router.push("/ministries")
    else if (ministryCount !== null && ministryCount > 1) router.push("/pick-ministry")
    else router.push("/home")
  }

  return (
    <main style={{ minHeight: "100vh", background: CREAM, color: INK, fontFamily: SANS }}>

      {/* ── NAV ── */}
      <nav className="cl-nav" style={{
        position: "sticky", top: 0, zIndex: 50, height: 72,
        background: "rgba(253,252,248,0.92)",
        backdropFilter: "blur(16px)", WebkitBackdropFilter: "blur(16px)",
        borderBottom: scrolled ? `1px solid ${LINE}` : "1px solid transparent",
        transition: "border-color 180ms ease",
      }}>
        <div style={{ maxWidth: 1100, margin: "0 auto", padding: "0 56px", height: 72, display: "flex", alignItems: "center" }}>
          {/* Brand */}
          <Link href="/" className="cl-brand-link" style={{
            display: "flex", alignItems: "center", gap: 10,
            textDecoration: "none", color: INK,
            fontFamily: SERIF, fontSize: 21, fontWeight: 600, letterSpacing: "-0.01em",
          }}>
            <RingCrossLogo size={26} color={PLUM2}/>
            Central
          </Link>

          {/* Center links */}
          <div className="cl-nav-links" style={{ flex: 1, display: "flex", justifyContent: "center", gap: 28 }}>
            {([["Platform", "#platform"], ["Rhythm", "#rhythm"], ["Ministries", "/ministries"]] as const).map(([label, href]) => (
              <a key={label} href={href} className="cl-nav-link" style={{ fontSize: 14, color: BODY, textDecoration: "none" }}>
                {label}
              </a>
            ))}
          </div>

          {/* Right CTAs */}
          <div className="cl-nav-right" style={{ display: "flex", gap: 12, alignItems: "center" }}>
            {authChecked && authUser ? (
              <>
                <button onClick={handleSignOut} className="cl-desktop-only cl-nav-text-btn" style={{ background: "transparent", border: 0, color: BODY, cursor: "pointer", fontFamily: SANS, fontSize: 14 }}>
                  Sign out
                </button>
                <button onClick={handleOpenApp} className="cl-desktop-only cl-btn-outline" style={{ height: 38, padding: "0 18px", borderRadius: 999, fontSize: 14, fontWeight: 500, border: `1px solid ${LINE}`, background: "transparent", color: INK, cursor: "pointer", fontFamily: SANS }}>
                  Open app
                </button>
              </>
            ) : (
              <>
                <a href="/login" className="cl-desktop-only cl-signin" style={{ fontSize: 14, color: BODY, textDecoration: "none" }}>Sign in</a>
                <button onClick={() => router.push("/signup")} className="cl-desktop-only cl-btn-pill" style={{ height: 38, padding: "0 18px", borderRadius: 999, fontSize: 14, fontWeight: 500, background: PLUM2, color: CREAM, border: "none", cursor: "pointer", fontFamily: SANS }}>
                  Get started
                </button>
              </>
            )}
            {/* Hamburger */}
            <button className="cl-hamburger" onClick={() => setMenuOpen(v => !v)} aria-label={menuOpen ? "Close menu" : "Open menu"}
              style={{ background: "transparent", border: "none", cursor: "pointer", padding: 4, color: INK, display: "none", alignItems: "center", justifyContent: "center" }}>
              {menuOpen ? <X size={22}/> : <Menu size={22}/>}
            </button>
          </div>
        </div>
      </nav>

      {/* ── Mobile drawer ── */}
      <div className="cl-mobile-drawer" style={{
        display: "none", position: "fixed", top: 72, left: 0, right: 0, zIndex: 49,
        background: "rgba(253,252,248,0.97)", backdropFilter: "blur(16px)", WebkitBackdropFilter: "blur(16px)",
        borderBottom: `1px solid ${LINE}`, flexDirection: "column", padding: "16px 24px 24px", gap: 4,
        opacity: menuOpen ? 1 : 0, pointerEvents: menuOpen ? "all" : "none",
        transform: menuOpen ? "translateY(0)" : "translateY(-8px)",
        transition: "opacity 200ms ease, transform 200ms ease",
      }}>
        {([["Platform", "#platform"], ["Rhythm", "#rhythm"], ["Ministries", "/ministries"]] as const).map(([label, href]) => (
          <a key={label} href={href} onClick={() => setMenuOpen(false)}
            style={{ fontSize: 16, color: INK, textDecoration: "none", padding: "12px 0", borderBottom: `1px solid ${LINE}`, fontWeight: 500 }}>
            {label}
          </a>
        ))}
        <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 16 }}>
          {authChecked && authUser ? (
            <button onClick={() => { setMenuOpen(false); handleOpenApp() }} style={{ height: 46, display: "flex", alignItems: "center", justifyContent: "center", background: PLUM2, color: CREAM, borderRadius: 12, fontSize: 14, fontWeight: 600, border: "none", cursor: "pointer", fontFamily: SANS }}>
              Open app
            </button>
          ) : (
            <>
              <a href="/ministries" onClick={() => setMenuOpen(false)} style={{ height: 46, display: "flex", alignItems: "center", justifyContent: "center", background: PLUM2, color: CREAM, borderRadius: 12, fontSize: 14, fontWeight: 600, textDecoration: "none" }}>
                Find my ministry
              </a>
              <a href="/login" onClick={() => setMenuOpen(false)} style={{ height: 46, display: "flex", alignItems: "center", justifyContent: "center", background: "transparent", color: INK, borderRadius: 12, fontSize: 14, fontWeight: 500, textDecoration: "none", border: `1px solid ${LINE}` }}>
                Sign in
              </a>
            </>
          )}
        </div>
      </div>

      {/* ── HERO — type-led cream, framed photo ── */}
      <section className="cl-hero-wrap" style={{ maxWidth: 1100, margin: "0 auto", padding: "96px 56px 64px" }}>
        <div className="cl-hero-grid" style={{ display: "grid", gridTemplateColumns: "1.15fr 0.85fr", gap: 56, alignItems: "center" }}>
          {/* Left — type */}
          <div>
            <p style={{ fontFamily: MONO, fontSize: 11, letterSpacing: "1.4px", textTransform: "uppercase", color: MUTED, margin: 0 }}>
              For college ministries
            </p>
            <h1 className="cl-hero-title" style={{ fontFamily: SERIF, fontWeight: 600, fontSize: 72, lineHeight: 0.98, letterSpacing: "-0.025em", margin: "22px 0 0", color: INK }}>
              One calm place,<br/>
              <em style={{ fontStyle: "italic", color: PLUM2 }}>between Sundays.</em>
            </h1>
            <p className="cl-hero-sub" style={{ fontFamily: SERIF, fontSize: 20, lineHeight: 1.55, color: BODY, marginTop: 26, maxWidth: 460 }}>
              Central replaces scattered chats, announcement threads, RSVP lists, and planning docs with a single weekly workspace your whole ministry lives in.
            </p>
            <div className="cl-hero-ctas" style={{ display: "flex", gap: 12, marginTop: 34, alignItems: "center", flexWrap: "wrap" }}>
              {authChecked && authUser ? (
                <>
                  <button onClick={handleOpenApp} className="cl-btn-primary" style={{ height: 50, padding: "0 26px", borderRadius: 999, fontSize: 14.5, fontWeight: 500, background: PLUM2, color: CREAM, border: "none", cursor: "pointer", fontFamily: SANS, display: "inline-flex", alignItems: "center" }}>
                    Open app
                  </button>
                  <a href="/ministries" className="cl-ghost" style={{ fontSize: 14.5, fontWeight: 500, color: PLUM2, textDecoration: "none" }}>
                    Find a ministry →
                  </a>
                </>
              ) : (
                <>
                  <a href="/ministries" className="cl-btn-primary" style={{ height: 50, padding: "0 26px", borderRadius: 999, fontSize: 14.5, fontWeight: 500, background: PLUM2, color: CREAM, textDecoration: "none", display: "inline-flex", alignItems: "center" }}>
                    Find my ministry
                  </a>
                  <button onClick={() => router.push("/register-ministry")} className="cl-ghost" style={{ fontSize: 14.5, fontWeight: 500, color: PLUM2, background: "none", border: "none", cursor: "pointer", fontFamily: SANS, padding: 0 }}>
                    Register your ministry →
                  </button>
                </>
              )}
            </div>
          </div>

          {/* Right — framed photo */}
          <div className="cl-photo" style={{ position: "relative", borderRadius: 18, overflow: "hidden", aspectRatio: "4 / 5", border: `1px solid ${LINE2}` }}>
            <img src="/chapel.jpg" alt="" style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}/>
            <div aria-hidden style={{ position: "absolute", inset: 0, background: "linear-gradient(180deg, transparent 40%, rgba(27,10,30,0.72) 100%)" }}/>
            <div style={{ position: "absolute", left: 24, right: 24, bottom: 24 }}>
              <p style={{ fontFamily: SERIF, fontStyle: "italic", fontSize: 17, lineHeight: 1.5, color: IVORY, margin: 0 }}>
                &ldquo;For where two or three gather in my name, there am I with them.&rdquo;
              </p>
              <p style={{ fontFamily: MONO, fontSize: 10, letterSpacing: "1.4px", textTransform: "uppercase", color: "rgba(246,244,239,0.72)", margin: "12px 0 0" }}>
                Matthew 18 : 20
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* ── Rule ── */}
      <div style={{ maxWidth: 1100, margin: "0 auto", padding: "0 56px" }}>
        <div style={{ height: 1, background: LINE }}/>
      </div>

      {/* ── FEATURES — editorial rows ── */}
      <section id="platform" style={{ maxWidth: 1100, margin: "0 auto", padding: "84px 56px" }}>
        <div style={{ maxWidth: 620, marginBottom: 8 }}>
          <p style={{ fontFamily: MONO, fontSize: 11, letterSpacing: "1.4px", textTransform: "uppercase", color: MUTED, margin: 0 }}>
            One calm system
          </p>
          <h2 className="cl-sec-h" style={{ fontFamily: SERIF, fontWeight: 600, fontSize: 44, lineHeight: 1.02, letterSpacing: "-0.02em", margin: "14px 0 0", color: INK }}>
            Less drift between Sunday and the next gathering.
          </h2>
        </div>

        {FEATURES.map(({ num, title, body }, i) => (
          <div key={num} className="cl-feat-row" style={{
            display: "grid", gridTemplateColumns: "56px 1fr 1.4fr", gap: 28,
            alignItems: "baseline", padding: "30px 0",
            borderTop: `1px solid ${i === 0 ? LINE : LINE3}`,
            marginTop: i === 0 ? 40 : 0,
          }}>
            <span style={{ fontFamily: SERIF, fontStyle: "italic", fontSize: 20, color: MUTED }}>{num}</span>
            <span className="cl-feat-title" style={{ fontFamily: SERIF, fontSize: 26, lineHeight: 1.15, color: INK }}>{title}</span>
            <span style={{ fontSize: 15, color: BODY, lineHeight: 1.65 }}>{body}</span>
          </div>
        ))}
      </section>

      {/* ── RHYTHM — serif list ── */}
      <section id="rhythm" style={{ background: CREAM3, padding: "84px 0" }}>
        <div className="cl-rhythm-inner" style={{ maxWidth: 1100, margin: "0 auto", padding: "0 56px" }}>
          <p style={{ fontFamily: MONO, fontSize: 11, letterSpacing: "1.4px", textTransform: "uppercase", color: MUTED, margin: 0 }}>
            A week with Central
          </p>
          <h2 className="cl-rhythm-h" style={{ fontFamily: SERIF, fontWeight: 600, fontSize: 40, lineHeight: 1.02, letterSpacing: "-0.02em", margin: "14px 0 36px", color: INK }}>
            Built for the rhythms you repeat every week.
          </h2>
          <div style={{ borderTop: `1px solid ${LINE}` }}>
            {RHYTHM.map(({ day, what, who }) => (
              <div key={day} className="cl-rli" style={{ display: "flex", alignItems: "baseline", gap: 24, padding: "22px 0", borderBottom: `1px solid ${LINE}` }}>
                <span style={{ fontFamily: MONO, fontSize: 11, letterSpacing: "1.4px", textTransform: "uppercase", color: MUTED, width: 150, flexShrink: 0 }}>{day}</span>
                <span className="cl-rli-what" style={{ fontFamily: SERIF, fontSize: 24, color: INK, flex: 1 }}>{what}</span>
                <span style={{ fontSize: 13, color: MUTED }}>{who}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── CTA — cream, centered ── */}
      <section className="cl-cta" style={{ padding: "96px 0", textAlign: "center" }}>
        <div style={{ maxWidth: 1100, margin: "0 auto", padding: "0 56px" }}>
          <p style={{ fontFamily: MONO, fontSize: 11, letterSpacing: "1.4px", textTransform: "uppercase", color: MUTED, margin: 0 }}>
            Begin
          </p>
          <h3 className="cl-cta-h" style={{ fontFamily: SERIF, fontWeight: 600, fontSize: 60, lineHeight: 1.0, letterSpacing: "-0.025em", margin: "16px 0 0", color: INK }}>
            Give your ministry<br/>one place to gather.
          </h3>
          <p style={{ fontFamily: SERIF, fontStyle: "italic", fontSize: 20, color: BODY, margin: "22px auto 0", maxWidth: 520, lineHeight: 1.5 }}>
            Register a ministry, invite your students, and keep the week moving with a little less friction.
          </p>
          <div style={{ marginTop: 36, display: "flex", gap: 14, justifyContent: "center", alignItems: "center", flexWrap: "wrap" }}>
            <button onClick={() => router.push("/register-ministry")} className="cl-btn-primary" style={{ height: 50, padding: "0 26px", borderRadius: 999, fontSize: 14.5, fontWeight: 500, background: PLUM2, color: CREAM, border: "none", cursor: "pointer", fontFamily: SANS, display: "inline-flex", alignItems: "center" }}>
              Register your ministry
            </button>
            <a href="/ministries" className="cl-ghost" style={{ fontSize: 14.5, fontWeight: 500, color: PLUM2, textDecoration: "none" }}>
              Find an existing ministry →
            </a>
          </div>
        </div>
      </section>

      {/* ── FOOTER — minimal ── */}
      <footer style={{ padding: "48px 0", borderTop: `1px solid ${LINE}` }}>
        <div style={{ maxWidth: 1100, margin: "0 auto", padding: "0 56px", display: "flex", justifyContent: "space-between", alignItems: "baseline", flexWrap: "wrap", gap: 16 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, fontFamily: SERIF, fontSize: 20, fontWeight: 600, color: INK }}>
            <RingCrossLogo size={22} color={PLUM2}/>
            Central
          </div>
          <div style={{ fontSize: 12.5, color: MUTED }}>
            <em style={{ fontFamily: SERIF, fontStyle: "italic", color: INK }}>Built for the rhythms you repeat every week.</em>
            {" "}·{" "}© Central
          </div>
        </div>
      </footer>

      <style>{`
        /* ── Button hover states ── */
        .cl-btn-primary { transition: transform 140ms ease, opacity 140ms ease; }
        .cl-btn-primary:hover { transform: scale(1.03); opacity: 0.9; }
        .cl-btn-primary:active { transform: scale(0.97); }
        .cl-ghost { transition: opacity 140ms ease; }
        .cl-ghost:hover { opacity: 0.65; }
        .cl-btn-pill { transition: transform 140ms ease, box-shadow 140ms ease; }
        .cl-btn-pill:hover { transform: scale(1.03); box-shadow: 0 4px 14px rgba(45,15,46,0.25); }
        .cl-btn-pill:active { transform: scale(0.97); }
        .cl-btn-outline { transition: background 140ms ease; }
        .cl-btn-outline:hover { background: rgba(62,21,64,0.06) !important; }

        /* ── Nav link hover ── */
        .cl-brand-link { transition: opacity 140ms ease; }
        .cl-brand-link:hover { opacity: 0.7; }
        .cl-nav-link { transition: color 140ms ease; }
        .cl-nav-link:hover { color: ${INK} !important; }
        .cl-signin { transition: opacity 140ms ease; }
        .cl-signin:hover { opacity: 0.6; }
        .cl-nav-text-btn { transition: opacity 140ms ease; }
        .cl-nav-text-btn:hover { opacity: 0.6; }

        /* ── Feature row hover ── */
        .cl-feat-row { transition: background 120ms ease; }
        .cl-feat-row:hover { background: rgba(62,21,64,0.03); }

        /* ── Rhythm item hover ── */
        .cl-rli { transition: background 120ms ease; }
        .cl-rli:hover { background: rgba(62,21,64,0.03); }

        /* ── Responsive ── */
        @media (max-width: 900px) {
          .cl-nav-links  { display: none !important; }
          .cl-desktop-only { display: none !important; }
          .cl-hamburger { display: flex !important; }
          .cl-mobile-drawer { display: flex !important; }

          .cl-hero-wrap { padding: 64px 24px 48px !important; }
          .cl-hero-grid { grid-template-columns: 1fr !important; gap: 36px !important; }
          .cl-hero-title { font-size: 46px !important; }
          .cl-hero-sub { font-size: 17px !important; max-width: 100% !important; }
          .cl-photo { display: none !important; }

          #platform { padding: 64px 24px !important; }
          .cl-sec-h { font-size: 32px !important; }
          .cl-feat-row { grid-template-columns: 40px 1fr !important; gap: 16px !important; }
          .cl-feat-title { grid-column: 2 !important; }
          .cl-feat-row > span:last-child { grid-column: 2 !important; }

          .cl-rhythm-inner { padding: 0 24px !important; }
          .cl-rhythm-h { font-size: 28px !important; }
          .cl-rli { flex-direction: column !important; gap: 6px !important; }
          .cl-rli > span:first-child { width: auto !important; }
          .cl-rli-what { font-size: 20px !important; }

          .cl-cta { padding: 72px 0 !important; }
          .cl-cta-h { font-size: 40px !important; }

          footer { padding: 36px 0 !important; }
          footer > div { padding: 0 24px !important; flex-direction: column !important; align-items: flex-start !important; gap: 8px !important; }
        }

        @media (max-width: 560px) {
          .cl-hero-title { font-size: 38px !important; }
          .cl-cta-h { font-size: 32px !important; }
          .cl-feat-row { grid-template-columns: 1fr !important; }
          .cl-feat-row > span:first-child { display: none; }
        }
      `}</style>
    </main>
  )
}
