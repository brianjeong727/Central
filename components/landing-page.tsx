"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { Menu, X } from "lucide-react"
import { getUserMinistries } from "@/app/actions/ministry"
import { RingCrossLogo } from "@/app/home/components/shared"
import { createClient } from "@/lib/supabase"

const INK    = "#13101A"
const BODY   = "#5A5466"
const MUTED  = "#8A8497"
const CREAM  = "#FDFCF8"
const CREAM3 = "#F6F2E8"
const IVORY  = "#F1ECDE"
const LINE   = "#E8E2D2"
const LINE2  = "#E2DDCF"
const LINE3  = "#EFE9DA"
const PLUM   = "#3E1540"
const PLUM2  = "#2D0F2E"

const SERIF = "var(--font-instrument-serif)"
const SANS  = "var(--font-inter)"
const MONO  = "ui-monospace, SFMono-Regular, Menlo, monospace"

const HERO_IMAGES = [
  { src: "/landingImage1.JPG",  origin: "40% 44%" },
  { src: "/landingImage2.JPG",  origin: "60% 60%" },
  { src: "/landingImage3.JPG",  origin: "50% 40%" },
  { src: "/landingImage4.jpeg", origin: "44% 56%" },
  { src: "/landingImage5.png",  origin: "56% 48%" },
]

const FEATURES = [
  {
    num: "i",
    title: "Chats that match ministry life.",
    body: "Church-wide rooms, small groups, direct messages, and threaded replies — the way students actually talk during the week, not a generic inbox.",
    img: "/landingImage1.JPG",
    alt: "Students in prayer by candlelight",
    rev: false,
  },
  {
    num: "ii",
    title: "Announcements with follow-through.",
    body: "Pinned updates, event context, and RSVP tracking, so the right people see the right thing without another spreadsheet.",
    img: "/landingImage4.jpeg",
    alt: "The ministry gathered on the church steps",
    rev: true,
  },
  {
    num: "iii",
    title: "A living directory of your people.",
    body: "Names, roles, prayer requests, and spiritual profiles — so leaders and students can genuinely care for one another.",
    img: "/landingImage5.png",
    alt: "The retreat team together",
    rev: false,
  },
  {
    num: "iv",
    title: "Planning, beside the conversation.",
    body: "Team roles, worship rosters, and event tasks live next to the chats that move them forward — never in a second app.",
    img: "/landingImage3.JPG",
    alt: "A prayer huddle, hands on shoulders",
    rev: true,
  },
]

const GALLERY = [
  { src: "/landingImage1.JPG",  cap: "Friday night — prayer by candlelight" },
  { src: "/landingImage4.jpeg", cap: "Sunday — gathered on the steps" },
  { src: "/landingImage3.JPG",  cap: "Retreat — praying over one another" },
  { src: "/landingImage5.png",  cap: "Field night — the whole team" },
  { src: "/landingImage2.JPG",  cap: "The quiet of the chapel at dusk" },
]

const RHYTHM = [
  { day: "Sun · service",   what: "Welcome new students.",    who: "— the welcome team", hl: false },
  { day: "Mon · planning",  what: "Publish the week ahead.",  who: "— campus leads",      hl: false },
  { day: "Wed · rehearsal", what: "Coordinate worship.",       who: "— praise team",       hl: true  },
  { day: "Fri · cells",     what: "Keep small groups close.",  who: "— cell leaders",      hl: false },
]

export default function LandingPage() {
  const router = useRouter()
  const [scrolled, setScrolled]           = useState(false)
  const [authUser, setAuthUser]           = useState<boolean | null>(null)
  const [authChecked, setAuthChecked]     = useState(false)
  const [ministryCount, setMinistryCount] = useState<number | null>(null)
  const [menuOpen, setMenuOpen]           = useState(false)

  // Hero rotation
  const [heroIdx, setHeroIdx] = useState(0)

  // Gallery
  const [galIdx, setGalIdx]             = useState(0)
  const galTrackRef                     = useRef<HTMLDivElement>(null)
  const galStageRef                     = useRef<HTMLDivElement>(null)
  const galAutoRef                      = useRef<ReturnType<typeof setInterval> | null>(null)
  const [galOffset, setGalOffset]       = useState(0)
  const [galCardWidth, setGalCardWidth] = useState(0)

  // Reveal refs
  const featRefs = useRef<(HTMLDivElement | null)[]>([])

  // ── Scroll
  useEffect(() => {
    function onScroll() { setScrolled(window.scrollY > 40) }
    onScroll()
    window.addEventListener("scroll", onScroll, { passive: true })
    return () => window.removeEventListener("scroll", onScroll)
  }, [])

  // ── Auth
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

  // ── Hero rotation (7s, crossfade)
  useEffect(() => {
    const id = setInterval(() => setHeroIdx(i => (i + 1) % HERO_IMAGES.length), 7000)
    return () => clearInterval(id)
  }, [])

  // ── Gallery layout
  const galLayout = useCallback(() => {
    const stage = galStageRef.current
    if (!stage) return
    const W = stage.clientWidth
    const cw = Math.round(W * 0.6)
    const gap = 24
    const off = (W - cw) / 2
    setGalCardWidth(cw)
    setGalOffset(off)
  }, [])

  useEffect(() => {
    galLayout()
    window.addEventListener("resize", galLayout)
    return () => window.removeEventListener("resize", galLayout)
  }, [galLayout])

  // ── Gallery auto-advance
  const armGalAuto = useCallback(() => {
    if (galAutoRef.current) clearInterval(galAutoRef.current)
    galAutoRef.current = setInterval(() => setGalIdx(i => (i + 1) % GALLERY.length), 5000)
  }, [])

  useEffect(() => {
    armGalAuto()
    return () => { if (galAutoRef.current) clearInterval(galAutoRef.current) }
  }, [armGalAuto])

  function goGal(n: number) {
    setGalIdx(((n % GALLERY.length) + GALLERY.length) % GALLERY.length)
    armGalAuto()
  }

  // ── Reveal on scroll
  useEffect(() => {
    const io = new IntersectionObserver(
      entries => entries.forEach(e => {
        if (e.isIntersecting) {
          (e.target as HTMLElement).style.opacity = "1"
          ;(e.target as HTMLElement).style.transform = "none"
          io.unobserve(e.target)
        }
      }),
      { threshold: 0.15 }
    )
    featRefs.current.forEach(el => { if (el) io.observe(el) })
    return () => io.disconnect()
  }, [])

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

  // Gallery transform
  const galTransform = galCardWidth > 0
    ? `translateX(${galOffset - galIdx * (galCardWidth + 24)}px)`
    : "translateX(0)"

  return (
    <main style={{ minHeight: "100vh", background: CREAM, color: INK, fontFamily: SANS }}>

      {/* ── NAV ── */}
      <nav className="cl-nav" style={{
        position: "sticky", top: 0, zIndex: 50, height: 84,
        background: "rgba(253,252,248,0.92)",
        backdropFilter: "blur(16px)", WebkitBackdropFilter: "blur(16px)",
        borderBottom: scrolled ? `1px solid ${LINE}` : "1px solid transparent",
        transition: "border-color 180ms ease",
      }}>
        <div style={{ maxWidth: 1100, margin: "0 auto", padding: "0 56px", height: 84, display: "flex", alignItems: "center" }}>
          <Link href="/" className="cl-brand-link" style={{
            display: "flex", alignItems: "center", gap: 11,
            textDecoration: "none", color: INK,
            fontFamily: SERIF, fontSize: 22, fontWeight: 600, letterSpacing: "-0.01em",
          }}>
            <RingCrossLogo size={26} color={PLUM2}/>
            Central
          </Link>

          <div className="cl-nav-links" style={{ flex: 1, display: "flex", justifyContent: "center", gap: 30 }}>
            {([["Platform", "#platform"], ["Rhythm", "#rhythm"], ["Ministries", "/ministries"]] as const).map(([label, href]) => (
              <a key={label} href={href} className="cl-nav-link" style={{ fontSize: 15, color: BODY, textDecoration: "none" }}>
                {label}
              </a>
            ))}
          </div>

          <div className="cl-nav-right" style={{ display: "flex", gap: 20, alignItems: "center" }}>
            {authChecked && authUser ? (
              <>
                <button onClick={handleSignOut} className="cl-desktop-only cl-nav-text-btn" style={{ background: "transparent", border: 0, color: BODY, cursor: "pointer", fontFamily: SANS, fontSize: 15 }}>
                  Sign out
                </button>
                <button onClick={handleOpenApp} className="cl-desktop-only cl-btn-outline" style={{ height: 42, padding: "0 20px", borderRadius: 999, fontSize: 14.5, fontWeight: 500, border: `1px solid ${LINE2}`, background: CREAM, color: INK, cursor: "pointer", fontFamily: SANS, whiteSpace: "nowrap" }}>
                  Open app
                </button>
              </>
            ) : (
              <>
                <a href="/login" className="cl-desktop-only cl-signin" style={{ fontSize: 15, color: BODY, textDecoration: "none" }}>Sign in</a>
                <button onClick={() => router.push("/signup")} className="cl-desktop-only cl-btn-pill" style={{ height: 42, padding: "0 20px", borderRadius: 999, fontSize: 14.5, fontWeight: 500, background: PLUM2, color: CREAM, border: "none", cursor: "pointer", fontFamily: SANS }}>
                  Get started
                </button>
              </>
            )}
            <button className="cl-hamburger" onClick={() => setMenuOpen(v => !v)} aria-label={menuOpen ? "Close menu" : "Open menu"}
              style={{ background: "transparent", border: "none", cursor: "pointer", padding: 4, color: INK, display: "none", alignItems: "center", justifyContent: "center" }}>
              {menuOpen ? <X size={22}/> : <Menu size={22}/>}
            </button>
          </div>
        </div>
      </nav>

      {/* ── Mobile drawer ── */}
      <div className="cl-mobile-drawer" style={{
        display: "none", position: "fixed", top: 84, left: 0, right: 0, zIndex: 49,
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

      {/* ── HERO ── */}
      <section className="cl-hero-wrap" style={{ maxWidth: 1100, margin: "0 auto", padding: "84px 56px 92px" }}>
        <div className="cl-hero-grid" style={{ display: "grid", gridTemplateColumns: "1.04fr 0.96fr", gap: 72, alignItems: "center" }}>

          {/* Left — type + verse */}
          <div>
            <p style={{ fontFamily: MONO, fontSize: 11, letterSpacing: "1.4px", textTransform: "uppercase", color: MUTED, margin: 0 }}>
              For college ministries
            </p>
            <h1 className="cl-hero-title" style={{ fontFamily: SERIF, fontWeight: 600, fontSize: 72, lineHeight: 0.97, letterSpacing: "-0.025em", margin: "22px 0 0", color: INK }}>
              One calm place,<br/>
              <em style={{ fontStyle: "italic", color: PLUM2 }}>between Sundays.</em>
            </h1>
            <p className="cl-hero-sub" style={{ fontSize: 19, lineHeight: 1.6, color: BODY, marginTop: 28, maxWidth: 440 }}>
              Central replaces scattered chats, announcement threads, RSVP lists, and planning docs with a single weekly workspace your whole ministry lives in.
            </p>
            <div className="cl-hero-ctas" style={{ display: "flex", gap: 18, marginTop: 34, alignItems: "center", flexWrap: "wrap" }}>
              {authChecked && authUser ? (
                <>
                  <button onClick={handleOpenApp} className="cl-btn-primary" style={{ height: 54, padding: "0 30px", borderRadius: 999, fontSize: 15, fontWeight: 500, background: PLUM2, color: CREAM, border: "none", cursor: "pointer", fontFamily: SANS, display: "inline-flex", alignItems: "center" }}>
                    Open app
                  </button>
                  <a href="/ministries" className="cl-ghost" style={{ fontSize: 15, fontWeight: 500, color: PLUM2, textDecoration: "none", display: "inline-flex", alignItems: "center", gap: 7 }}>
                    Find a ministry <span>→</span>
                  </a>
                </>
              ) : (
                <>
                  <button onClick={() => router.push("/register-ministry")} className="cl-btn-primary" style={{ height: 54, padding: "0 30px", borderRadius: 999, fontSize: 15, fontWeight: 500, background: PLUM2, color: CREAM, border: "none", cursor: "pointer", fontFamily: SANS, display: "inline-flex", alignItems: "center" }}>
                    Open app
                  </button>
                  <a href="/ministries" className="cl-ghost" style={{ fontSize: 15, fontWeight: 500, color: PLUM2, textDecoration: "none", display: "inline-flex", alignItems: "center", gap: 7 }}>
                    Find a ministry <span>→</span>
                  </a>
                </>
              )}
            </div>

            {/* Verse — in text column, below CTAs */}
            <div style={{ marginTop: 38, paddingTop: 24, borderTop: `1px solid ${LINE}`, maxWidth: 430 }}>
              <p style={{ fontFamily: SERIF, fontStyle: "italic", fontSize: 17, lineHeight: 1.5, color: BODY, margin: 0 }}>
                &ldquo;For where two or three gather in my name, there am I with them.&rdquo;
              </p>
              <p style={{ fontFamily: MONO, fontSize: 10, letterSpacing: "1.4px", textTransform: "uppercase", color: MUTED, margin: "12px 0 0" }}>
                Matthew 18 : 20
              </p>
            </div>
          </div>

          {/* Right — rotating image stage */}
          <div className="cl-hero-stage" style={{
            position: "relative", width: "100%", aspectRatio: "1 / 1",
            borderRadius: 18, overflow: "hidden",
            border: `1px solid ${LINE2}`, background: CREAM,
          }}>
            {HERO_IMAGES.map((img, k) => (
              <div key={img.src} style={{
                position: "absolute", inset: 0,
                opacity: k === heroIdx ? 1 : 0,
                transition: "opacity 1600ms cubic-bezier(0.77, 0, 0.175, 1)",
              }}>
                <img
                  src={img.src}
                  alt=""
                  style={{
                    width: "100%", height: "100%", objectFit: "cover", display: "block",
                    transformOrigin: img.origin,
                    animation: k === heroIdx ? "cl-kb-zoom 9000ms linear forwards" : "none",
                    transform: k === heroIdx ? undefined : "scale(1.001)",
                  }}
                />
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── FEATURES ── */}
      <section id="platform" className="cl-features" style={{ maxWidth: 1100, margin: "0 auto", padding: "96px 56px 56px", borderTop: `1px solid ${LINE}` }}>
        <p style={{ fontFamily: MONO, fontSize: 11, letterSpacing: "1.4px", textTransform: "uppercase", color: PLUM, margin: 0 }}>
          One calm system
        </p>
        <h2 className="cl-feat-h" style={{ fontFamily: SERIF, fontWeight: 600, fontSize: 46, lineHeight: 1.04, letterSpacing: "-0.02em", margin: "16px 0 0", color: INK, maxWidth: 760 }}>
          Less drift between Sunday and the next gathering.
        </h2>

        {FEATURES.map(({ num, title, body, img, alt, rev }, i) => (
          <div
            key={num}
            ref={el => { featRefs.current[i] = el }}
            className={`cl-feat-row${rev ? " cl-feat-row-rev" : ""}`}
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr",
              gap: 64,
              alignItems: "center",
              padding: "56px 0",
              borderTop: `1px solid ${LINE3}`,
              marginTop: i === 0 ? 44 : 0,
              opacity: 0,
              transform: "translateY(20px)",
              transition: "opacity 950ms cubic-bezier(0.23, 1, 0.32, 1), transform 950ms cubic-bezier(0.23, 1, 0.32, 1)",
            }}
          >
            <div className={rev ? "cl-feat-text-rev" : ""} style={{ order: rev ? 2 : 1 }}>
              <p style={{ fontFamily: SERIF, fontStyle: "italic", fontSize: 19, color: MUTED, margin: "0 0 12px" }}>{num}</p>
              <h3 style={{ fontFamily: SERIF, fontWeight: 600, fontSize: 30, lineHeight: 1.12, letterSpacing: "-0.01em", margin: 0, color: INK }}>{title}</h3>
              <p style={{ fontSize: 16, color: BODY, lineHeight: 1.65, margin: "16px 0 0", maxWidth: 420 }}>{body}</p>
            </div>
            <div style={{ order: rev ? 1 : 2, aspectRatio: "5 / 4", borderRadius: 14, overflow: "hidden", border: `1px solid ${LINE2}` }}>
              <img src={img} alt={alt} style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}/>
            </div>
          </div>
        ))}
      </section>

      {/* ── RHYTHM ── */}
      <section id="rhythm" style={{ background: CREAM3, padding: "92px 0 96px" }}>
        <div className="cl-rhythm-inner" style={{ maxWidth: 1100, margin: "0 auto", padding: "0 56px" }}>
          <p style={{ fontFamily: MONO, fontSize: 11, letterSpacing: "1.4px", textTransform: "uppercase", color: PLUM, margin: 0 }}>
            A week with Central
          </p>
          <h2 className="cl-rhythm-h" style={{ fontFamily: SERIF, fontWeight: 600, fontSize: 44, lineHeight: 1.02, letterSpacing: "-0.02em", margin: "16px 0 40px", color: INK, maxWidth: 720 }}>
            Built for the rhythms you repeat every week.
          </h2>
          <div style={{ borderTop: `1px solid ${LINE}` }}>
            {RHYTHM.map(({ day, what, who, hl }) => (
              <div key={day} className="cl-rli" style={{
                display: "grid", gridTemplateColumns: "220px 1fr auto",
                alignItems: "baseline", gap: 28, padding: "26px 18px",
                borderBottom: `1px solid ${LINE}`,
                background: hl ? "rgba(62,21,64,0.04)" : "transparent",
              }}>
                <span style={{ fontFamily: MONO, fontSize: 12, letterSpacing: "1.2px", textTransform: "uppercase", color: MUTED }}>{day}</span>
                <span className="cl-rli-what" style={{ fontFamily: SERIF, fontSize: 28, color: INK, letterSpacing: "-0.01em" }}>{what}</span>
                <span style={{ fontSize: 13.5, color: MUTED }}>{who}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── MOMENTS GALLERY ── */}
      <section style={{ padding: "92px 0 96px" }}>
        <div style={{ maxWidth: 1100, margin: "0 auto", padding: "0 56px" }}>
          <p style={{ fontFamily: MONO, fontSize: 11, letterSpacing: "1.4px", textTransform: "uppercase", color: PLUM, margin: 0 }}>
            Moments
          </p>
          <h2 className="cl-gal-h" style={{ fontFamily: SERIF, fontWeight: 600, fontSize: 44, lineHeight: 1.02, letterSpacing: "-0.02em", margin: "16px 0 0", color: INK, maxWidth: 720 }}>
            A year in the life of one ministry.
          </h2>
        </div>

        {/* Full-width carousel */}
        <div ref={galStageRef} style={{ position: "relative", marginTop: 36, overflow: "hidden" }}>
          <div
            ref={galTrackRef}
            style={{
              display: "flex",
              gap: 24,
              willChange: "transform",
              transition: "transform 1100ms cubic-bezier(0.77, 0, 0.175, 1)",
              transform: galTransform,
            }}
          >
            {GALLERY.map(({ src, cap }, k) => (
              <div
                key={src}
                style={{
                  flexShrink: 0,
                  width: galCardWidth > 0 ? galCardWidth : "60%",
                  borderRadius: 12,
                  overflow: "hidden",
                  border: `1px solid ${LINE2}`,
                  aspectRatio: "16 / 9",
                  opacity: k === galIdx ? 1 : 0.45,
                  transform: k === galIdx ? "scale(1)" : "scale(0.96)",
                  transition: "opacity 1100ms cubic-bezier(0.77, 0, 0.175, 1), transform 1100ms cubic-bezier(0.77, 0, 0.175, 1)",
                  background: CREAM,
                }}
              >
                <img src={src} alt={cap} style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}/>
              </div>
            ))}
          </div>
        </div>

        {/* Gallery footer: caption + dots + arrows */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "26px 56px 0", maxWidth: 1100, margin: "0 auto" }}>
          <p style={{ fontFamily: SERIF, fontStyle: "italic", fontSize: 16, color: BODY, margin: 0 }}>
            {GALLERY[galIdx].cap}
          </p>
          <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
            {/* Dots */}
            <div style={{ display: "flex", gap: 7 }}>
              {GALLERY.map((_, k) => (
                <span key={k} style={{
                  display: "block",
                  width: k === galIdx ? 18 : 6,
                  height: 6,
                  borderRadius: 999,
                  background: k === galIdx ? PLUM : "#C4C0B0",
                  transition: "background 240ms, width 240ms",
                }}/>
              ))}
            </div>
            {/* Arrows */}
            <div style={{ display: "flex", gap: 8 }}>
              <button
                onClick={() => goGal(galIdx - 1)}
                aria-label="Previous"
                className="cl-gal-btn"
                style={{ width: 36, height: 36, borderRadius: 999, border: `1px solid ${LINE2}`, background: CREAM, color: INK, cursor: "pointer", display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: 15 }}
              >
                ←
              </button>
              <button
                onClick={() => goGal(galIdx + 1)}
                aria-label="Next"
                className="cl-gal-btn"
                style={{ width: 36, height: 36, borderRadius: 999, border: `1px solid ${LINE2}`, background: CREAM, color: INK, cursor: "pointer", display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: 15 }}
              >
                →
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* ── CTA ── */}
      <section className="cl-cta" style={{ padding: "40px 0 96px", textAlign: "center", borderTop: `1px solid ${LINE}`, marginTop: 8 }}>
        <div style={{ maxWidth: 1100, margin: "0 auto", padding: "80px 56px 0" }}>
          <p style={{ fontFamily: MONO, fontSize: 11, letterSpacing: "1.4px", textTransform: "uppercase", color: MUTED, margin: 0 }}>
            Begin
          </p>
          <h3 className="cl-cta-h" style={{ fontFamily: SERIF, fontWeight: 600, fontSize: 60, lineHeight: 1.0, letterSpacing: "-0.025em", margin: "18px 0 0", color: INK }}>
            Give your ministry<br/>one place to gather.
          </h3>
          <p style={{ fontFamily: SERIF, fontStyle: "italic", fontSize: 20, color: BODY, margin: "24px auto 0", maxWidth: 520, lineHeight: 1.5 }}>
            Register a ministry, invite your students, and keep the week moving with a little less friction.
          </p>
          <div style={{ marginTop: 40, display: "flex", gap: 20, justifyContent: "center", alignItems: "center", flexWrap: "wrap" }}>
            <button onClick={() => router.push("/register-ministry")} className="cl-btn-primary" style={{ height: 54, padding: "0 30px", borderRadius: 999, fontSize: 15, fontWeight: 500, background: PLUM2, color: CREAM, border: "none", cursor: "pointer", fontFamily: SANS, display: "inline-flex", alignItems: "center" }}>
              Register your ministry
            </button>
            <a href="/ministries" className="cl-ghost" style={{ fontSize: 15, fontWeight: 500, color: PLUM2, textDecoration: "none", display: "inline-flex", alignItems: "center", gap: 7 }}>
              Find an existing ministry <span>→</span>
            </a>
          </div>
        </div>
      </section>

      {/* ── FOOTER ── */}
      <footer style={{ padding: "44px 0", borderTop: `1px solid ${LINE}` }}>
        <div style={{ maxWidth: 1100, margin: "0 auto", padding: "0 56px", display: "flex", justifyContent: "space-between", alignItems: "baseline", flexWrap: "wrap", gap: 16 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 11, fontFamily: SERIF, fontSize: 20, fontWeight: 600, color: INK }}>
            <RingCrossLogo size={22} color={PLUM2}/>
            Central
          </div>
          <div style={{ fontSize: 13, color: MUTED }}>
            <em style={{ fontFamily: SERIF, fontStyle: "italic", color: INK }}>Built for the rhythms you repeat every week.</em>
            {" "}·{" "}© Central
          </div>
        </div>
      </footer>

      <style>{`
        @keyframes cl-kb-zoom {
          from { transform: scale(1.0); }
          to   { transform: scale(1.04); }
        }

        .cl-btn-primary { transition: transform 140ms ease, opacity 140ms ease; }
        .cl-btn-primary:hover { transform: scale(1.03); opacity: 0.9; }
        .cl-btn-primary:active { transform: scale(0.97); }
        .cl-ghost { transition: opacity 140ms ease; }
        .cl-ghost:hover { opacity: 0.65; }
        .cl-btn-pill { transition: transform 140ms ease, box-shadow 140ms ease; }
        .cl-btn-pill:hover { transform: scale(1.03); box-shadow: 0 4px 14px rgba(45,15,46,0.25); }
        .cl-btn-pill:active { transform: scale(0.97); }
        .cl-btn-outline { transition: background 140ms ease, border-color 140ms ease; }
        .cl-btn-outline:hover { border-color: ${PLUM} !important; }
        .cl-brand-link { transition: opacity 140ms ease; }
        .cl-brand-link:hover { opacity: 0.7; }
        .cl-nav-link { transition: color 140ms ease; }
        .cl-nav-link:hover { color: ${INK} !important; }
        .cl-signin { transition: opacity 140ms ease; }
        .cl-signin:hover { opacity: 0.6; }
        .cl-nav-text-btn { transition: opacity 140ms ease; }
        .cl-nav-text-btn:hover { opacity: 0.6; }
        .cl-gal-btn { transition: border-color 140ms ease; }
        .cl-gal-btn:hover { border-color: ${PLUM} !important; }

        @media (prefers-reduced-motion: reduce) {
          .cl-hero-stage img { animation: none !important; transform: none !important; }
          .cl-hero-stage > div { transition: none !important; }
        }

        /* ── Responsive ── */
        @media (max-width: 960px) {
          .cl-nav-links { display: none !important; }
          .cl-desktop-only { display: none !important; }
          .cl-hamburger { display: flex !important; }
          .cl-mobile-drawer { display: flex !important; }

          .cl-hero-wrap { padding: 64px 24px 48px !important; }
          .cl-hero-grid { grid-template-columns: 1fr !important; gap: 36px !important; }
          .cl-hero-title { font-size: 46px !important; }
          .cl-hero-sub { font-size: 17px !important; max-width: 100% !important; }
          .cl-hero-stage { display: none !important; }

          .cl-features { padding: 64px 24px 40px !important; border-top-width: 1px; }
          .cl-feat-h { font-size: 32px !important; }
          .cl-feat-row { grid-template-columns: 1fr !important; gap: 28px !important; }
          .cl-feat-row > div:first-child { order: 1 !important; }
          .cl-feat-row > div:last-child { order: 2 !important; }
          .cl-feat-row-rev > div:first-child { order: 1 !important; }
          .cl-feat-row-rev > div:last-child { order: 2 !important; }

          .cl-rhythm-inner { padding: 0 24px !important; }
          .cl-rhythm-h { font-size: 28px !important; }
          .cl-rli { grid-template-columns: 1fr auto !important; gap: 8px !important; }
          .cl-rli > span:first-child { grid-column: 1 / -1 !important; }
          .cl-rli-what { font-size: 22px !important; }

          .cl-gal-h { font-size: 32px !important; }

          .cl-cta { padding: 32px 0 72px !important; }
          .cl-cta-h { font-size: 40px !important; }

          footer > div { padding: 0 24px !important; flex-direction: column !important; align-items: flex-start !important; gap: 8px !important; }
        }

        @media (max-width: 560px) {
          .cl-hero-title { font-size: 38px !important; }
          .cl-cta-h { font-size: 32px !important; }
          .cl-feat-h { font-size: 26px !important; }
        }
      `}</style>
    </main>
  )
}
