"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { getUserMinistries } from "@/app/actions/ministry"
import {
  ArrowRight,
  CalendarDays,
  Check,
  ClipboardList,
  MessageCircle,
  UserRound,
  UsersRound,
} from "lucide-react"
import { RingCrossLogo } from "@/app/home/components/shared"
import { createClient } from "@/lib/supabase"

const COLORS = {
  primary: "#3E1540",
  primaryHover: "#2D0F2E",
  ink: "#13101A",
  gold: "#C9A34B",
  surface: "#FBF8F2",
  border: "#ECE8DE",
  body: "#5A5466",
  muted: "#8A8497",
  ivory: "#F6F4EF",
}

const FEATURE_ROWS = [
  {
    icon: MessageCircle,
    title: "Chats that match ministry life",
    body: "Church-wide rooms, small groups, direct messages, replies, reactions, and read states without scattering people across tools.",
  },
  {
    icon: CalendarDays,
    title: "Announcements with real follow-through",
    body: "Pinned updates, event context, RSVP tracking, and audience-aware publishing keep students aligned without another spreadsheet.",
  },
  {
    icon: UsersRound,
    title: "A living directory",
    body: "Names, roles, prayer requests, and spiritual profiles make it easier for leaders and students to care for each other well.",
  },
  {
    icon: ClipboardList,
    title: "Planning for the people behind the scenes",
    body: "Team roles, rosters, worship planning, event tasks, and service details live beside the conversations that move them forward.",
  },
]

const RHYTHM_ITEMS = [
  "Welcome new students",
  "Publish weekly announcements",
  "Coordinate worship teams",
  "Keep small groups close",
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
    window.location.href = "/"
  }

  const navInk = scrolled ? COLORS.ink : COLORS.ivory
  const navMuted = scrolled ? COLORS.body : "rgba(246,244,239,0.76)"

  return (
    <main style={{ minHeight: "100vh", background: COLORS.surface, color: COLORS.ink, fontFamily: "var(--font-inter)" }}>
      <nav
        style={{
          position: "fixed",
          top: 0,
          left: 0,
          right: 0,
          zIndex: 50,
          borderBottom: scrolled ? `1px solid ${COLORS.border}` : "1px solid transparent",
          background: scrolled ? "rgba(251,248,242,0.92)" : "transparent",
          backdropFilter: scrolled ? "blur(16px)" : "none",
          WebkitBackdropFilter: scrolled ? "blur(16px)" : "none",
          transition: "background 180ms ease, border-color 180ms ease, backdrop-filter 180ms ease",
        }}
      >
        <div
          className="central-landing-nav"
          style={{
            width: "min(1120px, calc(100% - 32px))",
            height: 72,
            margin: "0 auto",
            display: "grid",
            gridTemplateColumns: "minmax(180px, 1fr) auto minmax(180px, 1fr)",
            alignItems: "center",
            gap: 20,
          }}
        >
          <Link
            href="/"
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
              color: navInk,
              justifySelf: "start",
              textDecoration: "none",
            }}
          >
            <RingCrossLogo size={28} color={scrolled ? COLORS.primary : COLORS.ivory} />
            <span
              style={{
                fontFamily: "var(--font-instrument-serif)",
                fontSize: 25,
                color: navInk,
                lineHeight: 1,
                transition: "color 180ms ease",
              }}
            >
              Central
            </span>
          </Link>

          <div className="hidden md:flex" style={{ alignItems: "center", gap: 30, justifySelf: "center" }}>
            {[
              ["Platform", "#platform"],
              ["Rhythm", "#rhythm"],
              ["Ministries", "/ministries"],
            ].map(([label, href]) => (
              <a
                key={label}
                href={href}
                style={{
                  color: navMuted,
                  fontSize: 14,
                  fontWeight: 500,
                  textDecoration: "none",
                  transition: "color 160ms ease",
                }}
                onMouseEnter={(event) => {
                  event.currentTarget.style.color = navInk
                }}
                onMouseLeave={(event) => {
                  event.currentTarget.style.color = navMuted
                }}
              >
                {label}
              </a>
            ))}
          </div>

          <div style={{ display: "flex", justifyContent: "flex-end", alignItems: "center", justifySelf: "end", gap: 12 }}>
            {authChecked && authUser ? (
              <>
                <a
                  href={ministryCount > 1 ? "/pick-ministry" : "/home"}
                  style={{
                    minHeight: 38,
                    display: "inline-flex",
                    alignItems: "center",
                    justifyContent: "center",
                    borderRadius: 8,
                    border: `1px solid ${scrolled ? COLORS.primary : "rgba(246,244,239,0.78)"}`,
                    color: scrolled ? COLORS.primary : COLORS.ivory,
                    padding: "0 15px",
                    fontSize: 14,
                    fontWeight: 600,
                    textDecoration: "none",
                    whiteSpace: "nowrap",
                  }}
                >
                  Open app
                </a>
                <button
                  onClick={handleSignOut}
                  style={{
                    background: "transparent",
                    border: 0,
                    color: navMuted,
                    cursor: "pointer",
                    fontFamily: "var(--font-inter)",
                    fontSize: 13,
                    fontWeight: 600,
                    padding: "8px 0",
                  }}
                >
                  Sign out
                </button>
              </>
            ) : (
              <>
                <a
                  className="hidden sm:inline-flex"
                  href="/login"
                  style={{
                    color: navMuted,
                    fontSize: 14,
                    fontWeight: 600,
                    textDecoration: "none",
                    whiteSpace: "nowrap",
                  }}
                >
                  Sign in
                </a>
                <button
                  onClick={() => router.push("/onboarding")}
                  style={{
                    minHeight: 38,
                    display: "inline-flex",
                    alignItems: "center",
                    justifyContent: "center",
                    borderRadius: 8,
                    border: scrolled ? `1px solid ${COLORS.primary}` : "1px solid rgba(246,244,239,0.76)",
                    background: scrolled ? COLORS.primary : "rgba(246,244,239,0.12)",
                    color: COLORS.ivory,
                    cursor: "pointer",
                    fontFamily: "var(--font-inter)",
                    fontSize: 14,
                    fontWeight: 700,
                    padding: "0 16px",
                    whiteSpace: "nowrap",
                  }}
                >
                  Get started
                </button>
              </>
            )}
          </div>
        </div>
      </nav>

      <section
        className="central-landing-hero"
        style={{
          position: "relative",
          minHeight: 760,
          display: "flex",
          alignItems: "end",
          overflow: "hidden",
          isolation: "isolate",
          background: COLORS.surface,
        }}
      >
        <div
          aria-hidden
          style={{
            position: "absolute",
            inset: 0,
            zIndex: -3,
            backgroundImage: "url('/chapel.jpg')",
            backgroundPosition: "center center",
            backgroundSize: "cover",
          }}
        />
        <div
          aria-hidden
          style={{
            position: "absolute",
            inset: 0,
            zIndex: -2,
            background:
              "linear-gradient(180deg, rgba(62,21,64,0.10) 0%, rgba(201,163,75,0.06) 42%, rgba(251,248,242,0.04) 100%)",
          }}
        />
        <div
          aria-hidden
          style={{
            position: "absolute",
            inset: 0,
            zIndex: -1,
            background:
              "radial-gradient(circle at 25% 70%, rgba(19,16,26,0.28) 0%, rgba(19,16,26,0.13) 26%, rgba(19,16,26,0) 48%), radial-gradient(circle at 70% 72%, rgba(19,16,26,0.18) 0%, rgba(19,16,26,0.08) 24%, rgba(19,16,26,0) 44%)",
          }}
        />
        <div
          aria-hidden
          style={{
            position: "absolute",
            left: 0,
            right: 0,
            bottom: 0,
            height: 82,
            zIndex: 0,
            background: `linear-gradient(180deg, rgba(251,248,242,0) 0%, rgba(251,248,242,0.08) 52%, ${COLORS.surface} 100%)`,
          }}
        />

        <div
          className="central-landing-hero-inner"
          style={{
            width: "min(1120px, calc(100% - 32px))",
            margin: "0 auto",
            padding: "132px 0 72px",
            display: "grid",
            gridTemplateColumns: "1fr",
            gap: 28,
            alignItems: "end",
            position: "relative",
            zIndex: 1,
          }}
        >
          <div>
            <p
              style={{
                margin: "0 0 18px",
                color: "rgba(246,244,239,0.76)",
                fontSize: 13,
                fontWeight: 700,
                textTransform: "uppercase",
                textShadow: "0 1px 8px rgba(19,16,26,0.28)",
              }}
            >
              College ministry communication
            </p>
            <h1
              className="central-landing-hero-title"
              style={{
                margin: "0 0 24px",
                color: COLORS.ivory,
                fontFamily: "var(--font-instrument-serif)",
                fontSize: 52,
                fontWeight: 400,
                lineHeight: 0.96,
                maxWidth: 650,
                textShadow: "0 2px 14px rgba(19,16,26,0.34)",
              }}
            >
              Central
            </h1>
            <p
              className="central-landing-hero-copy"
              style={{
                margin: "0 0 34px",
                maxWidth: 560,
                color: "rgba(246,244,239,0.82)",
                fontSize: 16,
                lineHeight: 1.7,
                textShadow: "0 1px 10px rgba(19,16,26,0.34)",
              }}
            >
              A quieter home for the weekly rhythm of ministry: conversations, announcements, people, and planning in one place.
            </p>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 12 }}>
              <button
                onClick={() => router.push("/onboarding")}
                style={{
                  minHeight: 48,
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 9,
                  borderRadius: 8,
                  border: `1px solid ${COLORS.ivory}`,
                  background: COLORS.ivory,
                  color: COLORS.primary,
                  cursor: "pointer",
                  fontFamily: "var(--font-inter)",
                  fontSize: 15,
                  fontWeight: 800,
                  padding: "0 22px",
                  boxShadow: "0 2px 8px rgba(19,16,26,0.22)",
                }}
              >
                Register your ministry
                <ArrowRight size={17} strokeWidth={1.8} />
              </button>
              <a
                href="/ministries"
                style={{
                  minHeight: 48,
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  borderRadius: 8,
                  border: "1px solid rgba(246,244,239,0.68)",
                  color: COLORS.ivory,
                  fontSize: 15,
                  fontWeight: 700,
                  padding: "0 22px",
                  textDecoration: "none",
                  textShadow: "0 1px 10px rgba(19,16,26,0.40)",
                }}
              >
                Join an existing ministry
              </a>
            </div>
          </div>

          <div
            className="central-landing-quote"
            style={{
              borderTop: "1px solid rgba(246,244,239,0.28)",
              paddingTop: 24,
              color: COLORS.ivory,
            }}
          >
            <p
              style={{
                margin: "0 0 14px",
                color: "rgba(246,244,239,0.72)",
                fontFamily: "var(--font-instrument-serif)",
                fontSize: 20,
                fontStyle: "italic",
                lineHeight: 1.5,
              }}
            >
              “For where two or three gather in my name, there am I with them.”
            </p>
            <p style={{ margin: 0, color: "rgba(246,244,239,0.58)", fontSize: 12, fontWeight: 700, textTransform: "uppercase" }}>
              Matthew 18:20
            </p>
          </div>
        </div>
      </section>

      <section id="platform" className="central-landing-platform" style={{ background: COLORS.surface, padding: "42px 0 44px" }}>
        <div style={{ width: "min(1120px, calc(100% - 32px))", margin: "0 auto" }}>
          <div
            className="central-landing-feature-grid"
            style={{
              display: "grid",
              gridTemplateColumns: "1fr",
              gap: 30,
              alignItems: "start",
            }}
          >
            <div>
              <p style={{ margin: "0 0 14px", color: COLORS.muted, fontSize: 12, fontWeight: 800, textTransform: "uppercase" }}>
                One calm system
              </p>
              <h2
                className="central-landing-section-title"
                style={{
                  margin: 0,
                  color: COLORS.ink,
                  fontFamily: "var(--font-instrument-serif)",
                  fontSize: 34,
                  fontWeight: 400,
                  lineHeight: 1.08,
                }}
              >
                Less noise between Sunday and the next gathering.
              </h2>
            </div>
            <div style={{ display: "grid", gap: 2 }}>
              {FEATURE_ROWS.map(({ icon: Icon, title, body }) => (
                <div
                  key={title}
                  style={{
                    display: "grid",
                    gridTemplateColumns: "44px 1fr",
                    gap: 18,
                    padding: "24px 0",
                    borderTop: `1px solid ${COLORS.border}`,
                  }}
                >
                  <div
                    style={{
                      width: 40,
                      height: 40,
                      borderRadius: 8,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      background: "#F4F1E8",
                      color: COLORS.primary,
                    }}
                  >
                    <Icon size={19} strokeWidth={1.7} />
                  </div>
                  <div>
                    <h3
                      style={{
                        margin: "0 0 7px",
                        color: COLORS.ink,
                        fontFamily: "var(--font-instrument-serif)",
                        fontSize: 25,
                        fontWeight: 400,
                        lineHeight: 1.18,
                      }}
                    >
                      {title}
                    </h3>
                    <p style={{ margin: 0, color: COLORS.body, fontSize: 15, lineHeight: 1.7 }}>{body}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section id="rhythm" className="central-landing-rhythm" style={{ background: COLORS.surface, padding: "18px 0 64px" }}>
        <div
          className="central-landing-rhythm-grid"
          style={{
            width: "min(1120px, calc(100% - 32px))",
            margin: "0 auto",
            display: "grid",
            gridTemplateColumns: "1fr",
            gap: 30,
            alignItems: "center",
            borderTop: `1px solid ${COLORS.border}`,
            paddingTop: 56,
          }}
        >
          <div>
            <h2
              className="central-landing-section-title"
              style={{
                margin: "0 0 18px",
                color: COLORS.ink,
                fontFamily: "var(--font-instrument-serif)",
                fontSize: 34,
                fontWeight: 400,
                lineHeight: 1.1,
              }}
            >
              Built for the rhythms you repeat every week.
            </h2>
            <p style={{ margin: 0, maxWidth: 610, color: COLORS.body, fontSize: 16, lineHeight: 1.8 }}>
              Central keeps the pastoral, practical, and administrative pieces close together so leaders can move with clarity and students know where to look.
            </p>
          </div>

          <div
            style={{
              border: `1px solid ${COLORS.border}`,
              borderRadius: 8,
              background: "#FFFFFF",
              boxShadow: "0 2px 8px rgba(19,16,26,0.08)",
              overflow: "hidden",
            }}
          >
            {RHYTHM_ITEMS.map((item, index) => (
              <div
                key={item}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 14,
                  minHeight: 58,
                  padding: "0 18px",
                  borderTop: index === 0 ? "none" : `1px solid ${COLORS.border}`,
                }}
              >
                <span
                  style={{
                    width: 26,
                    height: 26,
                    borderRadius: 8,
                    display: "inline-flex",
                    alignItems: "center",
                    justifyContent: "center",
                    background: index === 0 ? COLORS.primary : "#F4F1E8",
                    color: index === 0 ? COLORS.ivory : COLORS.primary,
                    flexShrink: 0,
                  }}
                >
                  <Check size={15} strokeWidth={2} />
                </span>
                <span style={{ color: COLORS.ink, fontSize: 15, fontWeight: 650 }}>{item}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section style={{ background: COLORS.primary, padding: "72px 0" }}>
        <div
          style={{
            width: "min(1120px, calc(100% - 32px))",
            margin: "0 auto",
            display: "grid",
            gridTemplateColumns: "1fr auto",
            gap: 28,
            alignItems: "center",
          }}
          className="max-md:!grid-cols-1"
        >
          <div>
            <h2
              className="central-landing-cta-title"
              style={{
                margin: "0 0 12px",
                color: COLORS.ivory,
                fontFamily: "var(--font-instrument-serif)",
                fontSize: 32,
                fontWeight: 400,
                lineHeight: 1.12,
              }}
            >
              Give your ministry one place to gather.
            </h2>
            <p style={{ margin: 0, color: "rgba(246,244,239,0.72)", fontSize: 15, lineHeight: 1.7 }}>
              Register a ministry, invite your students, and keep the week moving with less friction.
            </p>
          </div>
          <button
            onClick={() => router.push("/onboarding")}
            style={{
              minHeight: 48,
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 9,
              borderRadius: 8,
              border: `1px solid ${COLORS.ivory}`,
              background: COLORS.ivory,
              color: COLORS.primary,
              cursor: "pointer",
              fontFamily: "var(--font-inter)",
              fontSize: 15,
              fontWeight: 800,
              padding: "0 22px",
              width: "fit-content",
            }}
            onMouseEnter={(event) => {
              event.currentTarget.style.background = "#ECE8DE"
            }}
            onMouseLeave={(event) => {
              event.currentTarget.style.background = COLORS.ivory
            }}
          >
            Start with Central
            <ArrowRight size={17} strokeWidth={1.8} />
          </button>
        </div>
      </section>

      <footer style={{ background: COLORS.surface, borderTop: `1px solid ${COLORS.border}`, padding: "34px 0" }}>
        <div
          style={{
            width: "min(1120px, calc(100% - 32px))",
            margin: "0 auto",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 20,
            flexWrap: "wrap",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <RingCrossLogo size={24} color={COLORS.primary} />
            <span style={{ color: COLORS.ink, fontFamily: "var(--font-instrument-serif)", fontSize: 23, lineHeight: 1 }}>
              Central
            </span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 18 }}>
            <a href="/login" style={{ color: COLORS.body, fontSize: 14, fontWeight: 650, textDecoration: "none" }}>
              Log in
            </a>
            <a href="/ministries" style={{ color: COLORS.primary, fontSize: 14, fontWeight: 750, textDecoration: "none" }}>
              Find ministry
            </a>
            <span style={{ color: COLORS.muted, display: "inline-flex", alignItems: "center", gap: 6, fontSize: 13 }}>
              <UserRound size={15} strokeWidth={1.7} />
              Built for college ministries
            </span>
          </div>
        </div>
      </footer>

      <style>{`
        @media (min-width: 901px) {
          .central-landing-hero {
            min-height: 84svh !important;
            align-items: end !important;
          }

          .central-landing-hero-inner {
            grid-template-columns: minmax(0, 660px) minmax(260px, 360px) !important;
            gap: 48px !important;
            padding: 136px 0 96px !important;
          }

          .central-landing-hero-title {
            font-size: 72px !important;
          }

          .central-landing-hero-copy {
            max-width: 560px !important;
            font-size: 18px !important;
          }

          .central-landing-quote {
            border-left: 1px solid rgba(246,244,239,0.28) !important;
            border-top: 0 !important;
            padding-left: 28px !important;
            padding-top: 0 !important;
          }

          .central-landing-platform {
            padding: 82px 0 56px !important;
          }

          .central-landing-feature-grid,
          .central-landing-rhythm-grid {
            gap: 54px !important;
          }

          .central-landing-feature-grid {
            grid-template-columns: minmax(240px, 390px) 1fr !important;
          }

          .central-landing-rhythm-grid {
            grid-template-columns: 1fr minmax(280px, 380px) !important;
          }

          .central-landing-section-title {
            font-size: 44px !important;
          }

          .central-landing-rhythm {
            padding: 32px 0 88px !important;
          }

          .central-landing-cta-title {
            font-size: 38px !important;
          }
        }
      `}</style>
    </main>
  )
}
