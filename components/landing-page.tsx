"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { Menu, X, Lock, Plus, MessageCircle } from "lucide-react"
import { getUserMinistries } from "@/app/actions/ministry"
import { RingCrossLogo } from "@/app/home/components/shared"
import { createClient } from "@/lib/supabase"
import { isNativeShell, isLikelyNativeShell } from "@/lib/native-push"

/* ── §0 Token constants ── */
const INK    = "var(--ink)"
const BODY   = "var(--body)"
const MUTED  = "var(--muted-text)"
const FAINT  = "var(--faint)"
const CREAM  = "var(--cream)"
const CREAMP = "var(--cream-panel)"
const CREAM2 = "var(--cream-2)"
const CREAM3 = "var(--cream-3)"
const COD    = "var(--cream-on-dark)"
const IVORY  = "var(--ivory)"
const LINE   = "var(--line)"
const LINE2  = "var(--line-2)"
const LINE3  = "var(--line-3)"
const PLUM   = "var(--plum)"
const PLUM2  = "var(--plum-2)"
const PLUM_TINT = "var(--plum-tint)"
const TOGGLE_OFF = "#D6D0C0" // §4.9 toggle-off track (no token exists — value fixed by spec)

const SERIF = "var(--font-instrument-serif)"
const SANS  = "var(--font-inter)"
const MONO  = "ui-monospace, SFMono-Regular, Menlo, monospace"

/* on-dark translucency helper (§0 — never raw rgba) */
const cod = (n: number) => `color-mix(in srgb, var(--cream-on-dark) ${n}%, transparent)`

/* eyebrow base style */
const ey = (opts?: { plum?: boolean; size?: number; ls?: number; color?: string }) => ({
  fontFamily: MONO,
  fontSize: opts?.size ?? 11,
  letterSpacing: `${opts?.ls ?? 1.4}px`,
  textTransform: "uppercase" as const,
  color: opts?.color ?? (opts?.plum ? PLUM : MUTED),
})

/* §0 landing primary button base */
const btnPrimary = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  background: PLUM2,
  color: COD,
  borderRadius: 999,
  padding: "15px 30px",
  fontSize: 15,
  fontWeight: 500,
  border: "none",
  cursor: "pointer",
  fontFamily: SANS,
  textDecoration: "none",
} as const

const mockStyle = {
  background: CREAMP,
  border: `1px solid ${LINE2}`,
  borderRadius: 14, // var(--r-callout)
  overflow: "hidden",
  textAlign: "left" as const,
}

/* ── small local components ── */
function Avatar({ label, size, font }: { label: string; size: number; font: number }) {
  return (
    <span style={{
      width: size, height: size, borderRadius: 999, background: PLUM, color: COD,
      display: "flex", alignItems: "center", justifyContent: "center",
      fontSize: font, fontWeight: 600, flexShrink: 0,
    }}>
      {label}
    </span>
  )
}

function Toggle({ on }: { on: boolean }) {
  return (
    <span style={{
      position: "relative", width: 34, height: 20, borderRadius: 999,
      background: on ? PLUM : TOGGLE_OFF, flexShrink: 0, display: "inline-block",
    }}>
      <span style={{
        position: "absolute", top: 2, [on ? "right" : "left"]: 2,
        width: 16, height: 16, borderRadius: 999, background: CREAM,
      }}/>
    </span>
  )
}

type BadgeKind = "leader" | "admin" | "member"
function RoleBadge({ kind, children }: { kind: BadgeKind; children: React.ReactNode }) {
  const base = { borderRadius: 999, padding: "4px 10px", fontSize: 11, fontWeight: 500 } as const
  const styles: Record<BadgeKind, React.CSSProperties> = {
    leader: { ...base, background: IVORY, color: PLUM },
    admin:  { ...base, background: PLUM2, color: COD },
    member: { ...base, background: IVORY, color: MUTED },
  }
  return <span style={{ marginLeft: "auto", ...styles[kind] }}>{children}</span>
}

/* section label row in the Sunday chat mock */
function SectionLabel({ text, pad }: { text: string; pad: string }) {
  return (
    <div style={{ ...ey({ size: 10, ls: 2 }), display: "flex", alignItems: "center", padding: pad }}>
      {text}
      <Plus size={13} color={MUTED} style={{ marginLeft: "auto" }}/>
    </div>
  )
}

function ChatRow({
  initial, name, preview, previewItalic, locked, selected, meta,
}: {
  initial: string; name: string; preview: string; previewItalic?: boolean
  locked?: boolean; selected?: boolean; meta?: boolean
}) {
  return (
    <div style={{
      display: "flex", alignItems: "center", gap: 11, padding: "9px 12px", borderRadius: 12,
      ...(selected ? { background: IVORY, border: `1px solid ${LINE2}` } : {}),
    }}>
      <Avatar label={initial} size={34} font={13}/>
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: 14, fontWeight: 600, lineHeight: 1.25, display: "flex", alignItems: "center", gap: 5 }}>
          {name}
          {locked && <Lock size={11} color={MUTED}/>}
        </div>
        <div style={{
          fontSize: 12, color: MUTED, marginTop: 1, maxWidth: 165,
          overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
          ...(previewItalic ? { fontStyle: "italic" } : {}),
        }}>
          {preview}
        </div>
      </div>
      {meta && (
        <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontFamily: MONO, fontSize: 10, color: FAINT }}>5m</span>
          <span style={{ width: 7, height: 7, borderRadius: 999, background: PLUM }}/>
        </div>
      )}
    </div>
  )
}

export default function LandingPage() {
  const router = useRouter()
  const [scrolled, setScrolled]           = useState(false)
  const [authUser, setAuthUser]           = useState<boolean | null>(null)
  const [authChecked, setAuthChecked]     = useState(false)
  const [ministryCount, setMinistryCount] = useState<number | null>(null)
  const [menuOpen, setMenuOpen]           = useState(false)
  // Native-shell gate. The marketing page must NEVER render inside the Capacitor iOS
  // shell. Lazy-init from the synchronous heuristic: in the shell `window.Capacitor`
  // exists → start "pending" so we withhold marketing while the async check confirms
  // and redirects; on plain web it's undefined → false → marketing renders immediately
  // (no delay). On the server there's no window → false, so SSR/web is byte-for-byte
  // unchanged and only the in-shell client hydration diverges (it redirects away at once).
  const [shellPending, setShellPending]   = useState<boolean>(isLikelyNativeShell)

  // ── Scroll (nav border). Closing the mobile menu on scroll happens HERE, in
  // the scroll handler, rather than in a separate scrolled→setMenuOpen effect
  // (which tripped set-state-in-effect). setMenuOpen(false) is idempotent.
  useEffect(() => {
    function onScroll() {
      const past = window.scrollY > 40
      setScrolled(past)
      if (past) setMenuOpen(false)
    }
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

    // Keep the header honest when auth changes elsewhere. A mount-time getUser()
    // alone can't catch a sign-out that happens in another tab/context, leaving a
    // stale "Open app". SIGNED_OUT clears the authed state; SIGNED_IN refreshes it.
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "SIGNED_OUT") {
        setAuthUser(false)
        setMinistryCount(null)
        setAuthChecked(true)
      } else if (event === "SIGNED_IN") {
        setAuthUser(Boolean(session?.user))
        setAuthChecked(true)
        if (session?.user) {
          getUserMinistries().then(({ data }) => setMinistryCount(data?.length ?? 0))
        }
      }
    })
    return () => subscription.unsubscribe()
  }, [])

  // ── Native shell: never show marketing. Authoritative async detection (the sync
  // lazy-init above is only a first-paint heuristic). In the shell → route by session:
  // signed-in → /home, signed-out → /login. Anything that isn't the native shell —
  // including a false-positive on the sync heuristic — clears the gate so the marketing
  // page reveals. Web (detectNative → false) just clears an already-false flag: no-op.
  useEffect(() => {
    let cancelled = false
    isNativeShell().then(async (native) => {
      if (cancelled) return
      if (!native) {
        setShellPending(false)
        return
      }
      const supabase = createClient()
      const { data: { session } } = await supabase.auth.getSession()
      if (cancelled) return
      router.replace(session ? "/home" : "/login")
    })
    return () => { cancelled = true }
  }, [router])


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

  // In the native shell, hold a cream splash-colored surface (matching --cream / the
  // Capacitor splash) instead of flashing the marketing page while the async native
  // check resolves and redirects. On web this is never true, so nothing is withheld.
  if (shellPending) {
    return <main style={{ minHeight: "100vh", background: CREAM }} />
  }

  return (
    <main style={{ minHeight: "100vh", background: CREAM, color: INK, fontFamily: SANS }}>

      {/* ── NAV ── */}
      <nav className="cl-nav" style={{
        position: "sticky", top: 0, zIndex: 50, height: 76,
        background: "color-mix(in srgb, var(--cream) 92%, transparent)",
        backdropFilter: "blur(16px)", WebkitBackdropFilter: "blur(16px)",
        borderBottom: scrolled ? `1px solid ${LINE}` : "1px solid transparent",
        transition: "border-color 180ms ease",
      }}>
        <div className="cl-wrap" style={{ height: 76, display: "flex", alignItems: "center" }}>
          <Link href="/" className="cl-brand-link" style={{
            display: "flex", alignItems: "center", gap: 10,
            textDecoration: "none", color: INK,
            fontFamily: SERIF, fontSize: 21, fontWeight: 600, letterSpacing: "-0.01em",
          }}>
            <RingCrossLogo size={24} color={PLUM2}/>
            Central
          </Link>

          <div className="cl-nav-links" style={{ flex: 1, display: "flex", justifyContent: "center", gap: 22 }}>
            {([["Why", "#why"], ["The week", "#week"], ["Ministries", "/ministries"]] as const).map(([label, href]) => (
              <a key={label} href={href} className="cl-nav-link" style={{ fontSize: 15, color: BODY, textDecoration: "none" }}>
                {label}
              </a>
            ))}
          </div>

          <div className="cl-nav-right" style={{ display: "flex", gap: 22, alignItems: "center" }}>
            {authChecked && authUser ? (
              <>
                <button onClick={handleSignOut} className="cl-desktop-only cl-nav-text-btn" style={{ background: "transparent", border: 0, color: BODY, cursor: "pointer", fontFamily: SANS, fontSize: 15 }}>
                  Sign out
                </button>
                <button onClick={handleOpenApp} className="cl-desktop-only cl-btn-primary" style={{ ...btnPrimary, padding: "10px 20px", fontSize: 14 }}>
                  Open app
                </button>
              </>
            ) : (
              <>
                <a href="/login" className="cl-desktop-only cl-signin" style={{ fontSize: 15, color: BODY, textDecoration: "none" }}>Sign in</a>
                <button onClick={() => router.push("/signup")} className="cl-desktop-only cl-btn-primary" style={{ ...btnPrimary, padding: "10px 20px", fontSize: 14 }}>
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
        display: "none", position: "fixed", top: 76, left: 0, right: 0, zIndex: 49,
        background: "color-mix(in srgb, var(--cream) 97%, transparent)", backdropFilter: "blur(16px)", WebkitBackdropFilter: "blur(16px)",
        borderBottom: `1px solid ${LINE}`, flexDirection: "column", padding: "16px 24px 24px", gap: 4,
        opacity: menuOpen ? 1 : 0, pointerEvents: menuOpen ? "all" : "none",
        transform: menuOpen ? "translateY(0)" : "translateY(-8px)",
        transition: "opacity 200ms ease, transform 200ms ease",
      }}>
        {([["Why", "#why"], ["The week", "#week"], ["Ministries", "/ministries"]] as const).map(([label, href]) => (
          <a key={label} href={href} onClick={() => setMenuOpen(false)}
            style={{ fontSize: 16, color: INK, textDecoration: "none", padding: "12px 0", borderBottom: `1px solid ${LINE}`, fontWeight: 500 }}>
            {label}
          </a>
        ))}
        <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 16 }}>
          {authChecked && authUser ? (
            <button onClick={() => { setMenuOpen(false); handleOpenApp() }} style={{ ...btnPrimary, height: 46, borderRadius: 12, fontSize: 14, fontWeight: 600, width: "100%" }}>
              Open app
            </button>
          ) : (
            <>
              <a href="/signup" onClick={() => setMenuOpen(false)} style={{ ...btnPrimary, height: 46, borderRadius: 12, fontSize: 14, fontWeight: 600, width: "100%", display: "flex", alignItems: "center", justifyContent: "center", textDecoration: "none" }}>
                Get started
              </a>
              <a href="/login" onClick={() => setMenuOpen(false)} style={{ height: 46, borderRadius: 12, fontSize: 14, fontWeight: 600, width: "100%", display: "flex", alignItems: "center", justifyContent: "center", textDecoration: "none", color: INK, border: `1px solid ${LINE}` }}>
                Sign in
              </a>
            </>
          )}
        </div>
      </div>

      {/* ── §3 HERO ── */}
      <section className="cl-hero" style={{ padding: "110px 0 90px", textAlign: "center", borderBottom: `1px solid ${LINE}` }}>
        <div className="cl-wrap">
          <p style={{ ...ey({ plum: true }), margin: 0 }}>Ephesians 4 : 12</p>
          <h1 style={{
            fontFamily: SERIF, fontSize: "clamp(44px, 5vw, 68px)", fontWeight: 600,
            letterSpacing: "-0.02em", lineHeight: 1.06, maxWidth: 860, margin: "20px auto 0", color: INK,
          }}>
            &ldquo;To equip the saints for the work of ministry.&rdquo;
          </h1>
          <p style={{ fontSize: 18, color: BODY, lineHeight: 1.7, maxWidth: 620, margin: "26px auto 0" }}>
            That&rsquo;s the whole job description. Central is the church OS for college ministry — messaging, planning, and roles built so that nothing administrative gets between your people and the work God gave them.
          </p>
          <div style={{ display: "flex", justifyContent: "center", gap: 18, marginTop: 34, flexWrap: "wrap" }}>
            <button onClick={() => router.push("/register-ministry")} className="cl-btn-primary" style={btnPrimary}>
              Register your ministry
            </button>
            <a href="#why" className="cl-ghost" style={{ display: "inline-flex", alignItems: "center", gap: 8, color: INK, fontSize: 15, fontWeight: 500, padding: "15px 10px", textDecoration: "none" }}>
              Why we build <span>↓</span>
            </a>
          </div>
        </div>
      </section>

      {/* ── §4 WHY ── */}
      <section id="why" className="cl-why" style={{ padding: "100px 0" }}>
        <div className="cl-wrap" style={{ maxWidth: 760 }}>
          <p style={{ ...ey(), margin: 0 }}>Why we build</p>
          <p style={{
            fontFamily: SERIF, fontSize: "clamp(24px, 2.6vw, 32px)", fontWeight: 500,
            letterSpacing: "-0.01em", lineHeight: 1.4, color: INK, margin: "22px 0 0",
          }}>
            None of this is the point. The roster isn&rsquo;t the point. The RSVP count isn&rsquo;t the point. They&rsquo;re scaffolding — so that the freshman who walked in three Sundays ago gets known, gets fed on Friday, and gets kept. We build software so the admin never becomes the ministry.
          </p>
          <div style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 28 }}>
            <span style={{ width: 34, height: 1, background: PLUM }}/>
            <span style={ey({ plum: true })}>The Central team</span>
          </div>
        </div>
      </section>

      {/* ── §5 THE WEEK AS LITURGY ── */}
      <section id="week" className="cl-week" style={{ borderTop: `1px solid ${LINE}`, background: CREAMP, padding: "96px 0" }}>
        <div className="cl-wrap">
          <div style={{ textAlign: "center", maxWidth: 640, margin: "0 auto 72px" }}>
            <p style={{ ...ey(), margin: 0 }}>The week, kept</p>
            <h2 style={{
              fontFamily: SERIF, fontSize: "clamp(34px, 4vw, 46px)", fontWeight: 600,
              letterSpacing: "-0.02em", lineHeight: 1.08, margin: "10px 0 0", color: INK,
            }}>
              Ministry has a liturgy. Central carries it.
            </h2>
          </div>

          {/* 5a. Sunday · Church chats — text L / mock R */}
          <div className="cl-week-row" style={{ padding: "48px 0" }}>
            <div className="cl-week-text">
              <p style={{ ...ey({ plum: true }), margin: 0 }}>Sunday · Church chats</p>
              <h3 className="cl-day-head" style={{ fontFamily: SERIF, fontSize: "clamp(28px, 3vw, 36px)", fontWeight: 600, letterSpacing: "-0.02em", lineHeight: 1.12, margin: "6px 0 0", color: INK }}>
                Every room they need. Not one more.
              </h3>
              <p style={{ fontSize: 16, color: BODY, lineHeight: 1.7, margin: "14px 0 0" }}>
                A student&rsquo;s chats are grouped by relationship — the whole church, their groups, their teams. Rooms appear when a leader adds you; there&rsquo;s nothing to join, mute, or browse. Team rooms stay locked to the people serving in them.
              </p>
            </div>
            <div className="cl-week-mock">
              <div style={{ ...mockStyle, maxWidth: 340, justifySelf: "center", width: "100%", margin: "0 auto" }}>
                <div style={{ padding: "14px 12px 16px" }}>
                  <SectionLabel text="General" pad="0 12px 6px"/>
                  <ChatRow initial="C" name="Class of 2027" preview="No messages yet" previewItalic selected/>
                  <ChatRow initial="C" name="Central Chat" preview="No messages yet" previewItalic/>
                  <SectionLabel text="Groups" pad="12px 12px 6px"/>
                  <ChatRow initial="F" name="Fall Retreat 2026" preview="Alex Kang: Deposit deadline i…" meta/>
                  <ChatRow initial="S" name="Sister Pairing '26" preview="Alex Kang: Coffee pairs for O…" meta/>
                  <ChatRow initial="J" name="Jun's Cell" preview="Alex Kang: See everyone Frid…" meta/>
                  <SectionLabel text="Teams" pad="12px 12px 6px"/>
                  <ChatRow initial="W" name="Welcome Team" preview="Alex Kang: Two new folks visi…" locked meta/>
                  <ChatRow initial="D" name="DGL" preview="Alex Kang: Rotation sheet up…" locked meta/>
                </div>
              </div>
            </div>
          </div>

          {/* 5b. Monday · Announcements — mock L / text R */}
          <div className="cl-week-row" style={{ padding: "48px 0", borderTop: `1px solid ${LINE2}` }}>
            <div className="cl-week-mock">
              <div style={mockStyle}>
                <div style={{ padding: "18px 20px 6px" }}>
                  <div style={ey({ size: 10 })}>3 total · 1 unread</div>
                  <div style={{ fontFamily: SERIF, fontSize: 26, fontWeight: 600, marginTop: 4, paddingBottom: 12, borderBottom: `1px solid ${LINE}` }}>Announcements</div>
                </div>
                <div style={{ padding: "14px 20px 20px", display: "flex", flexDirection: "column", gap: 12 }}>
                  {/* pinned */}
                  <div style={{ background: IVORY, borderRadius: 12, padding: "16px 18px" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
                      <span style={{ width: 6, height: 6, borderRadius: 999, background: PLUM }}/>
                      <span style={ey({ size: 10 })}>Pinned</span>
                    </div>
                    <div style={{ fontFamily: SERIF, fontSize: 19, fontWeight: 600, marginTop: 8 }}>Welcome Week schedule</div>
                    <div style={{ fontSize: 13, color: BODY, marginTop: 3 }}>Everything from move-in to Sunday lunch — share with your freshmen.</div>
                  </div>
                  {/* event */}
                  <div style={{ border: `1px solid ${LINE2}`, borderRadius: 12, padding: "14px 18px" }}>
                    <div style={{ display: "flex", alignItems: "center" }}>
                      <span style={ey({ size: 10 })}>Fri, Aug 21</span>
                      <span style={{ marginLeft: "auto", fontFamily: MONO, fontSize: 10, letterSpacing: "1.4px", textTransform: "uppercase", background: IVORY, border: `1px solid ${LINE2}`, borderRadius: 999, padding: "3px 9px", color: PLUM }}>Event</span>
                    </div>
                    <div style={{ fontFamily: SERIF, fontSize: 16, fontWeight: 400, marginTop: 7 }}>Fall Retreat 2026 — registration open</div>
                    <div style={{ display: "flex", alignItems: "center", marginTop: 10, paddingTop: 10, borderTop: `1px solid ${LINE3}` }}>
                      <span style={{ fontSize: 12, color: MUTED }}>61 going · 148 views</span>
                      <span style={{ marginLeft: "auto", background: PLUM, color: COD, borderRadius: 999, padding: "6px 16px", fontSize: 12, fontWeight: 600 }}>RSVP</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
            <div className="cl-week-text">
              <p style={{ ...ey({ plum: true }), margin: 0 }}>Monday · Announcements</p>
              <h3 className="cl-day-head" style={{ fontFamily: SERIF, fontSize: "clamp(28px, 3vw, 36px)", fontWeight: 600, letterSpacing: "-0.02em", lineHeight: 1.12, margin: "6px 0 0", color: INK }}>
                Posted once. Actually seen.
              </h3>
              <p style={{ fontSize: 16, color: BODY, lineHeight: 1.7, margin: "14px 0 0" }}>
                Announcements are a page, not a scroll — pinned posts stay pinned, events carry their own RSVP, and leaders can see who&rsquo;s coming and who hasn&rsquo;t looked. No re-posting across three apps.
              </p>
            </div>
          </div>

          {/* 5c. Wednesday · Teams — text L / mock R */}
          <div className="cl-week-row" style={{ padding: "48px 0", borderTop: `1px solid ${LINE2}` }}>
            <div className="cl-week-text">
              <p style={{ ...ey({ plum: true }), margin: 0 }}>Wednesday · Teams</p>
              <h3 className="cl-day-head" style={{ fontFamily: SERIF, fontSize: "clamp(28px, 3vw, 36px)", fontWeight: 600, letterSpacing: "-0.02em", lineHeight: 1.12, margin: "6px 0 0", color: INK }}>
                Give a team exactly the keys it needs.
              </h3>
              <p style={{ fontSize: 16, color: BODY, lineHeight: 1.7, margin: "14px 0 0" }}>
                Every team is a workspace with its own permissions — the finance team sees finances, the welcome team tracks visitors, nobody carries keys they don&rsquo;t need. And every team is <b style={{ color: INK, fontWeight: 600 }}>one click from its own group chat.</b>
              </p>
            </div>
            <div className="cl-week-mock">
              <div style={mockStyle}>
                <div style={{ padding: "16px 20px 8px" }}>
                  <div style={ey({ size: 10 })}>Central / Workspace / Finance</div>
                  <div style={{ display: "flex", alignItems: "center", marginTop: 6, paddingBottom: 10, borderBottom: `1px solid ${LINE}` }}>
                    <span style={{ fontFamily: SERIF, fontSize: 22, fontWeight: 600 }}>Settings</span>
                    <span style={{ marginLeft: "auto", display: "inline-flex", alignItems: "center", gap: 7, border: `1px solid ${LINE2}`, borderRadius: 10, padding: "7px 14px", fontSize: 12, color: INK, background: CREAM, fontWeight: 500 }}>
                      <MessageCircle size={14}/> Group chat
                    </span>
                  </div>
                </div>
                <div style={{ padding: "6px 20px 18px" }}>
                  {([
                    ["Generate Bible studies", false, true],
                    ["Track attendance", false, true],
                    ["View finances", true, true],
                    ["Manage schedule", false, false],
                  ] as const).map(([label, on, border]) => (
                    <div key={label} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 0", fontSize: 13, ...(border ? { borderBottom: `1px solid ${LINE3}` } : {}) }}>
                      <span>{label}</span>
                      <Toggle on={on}/>
                    </div>
                  ))}
                  <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 10, background: CREAM2, border: `1px solid ${LINE2}`, borderRadius: 10, padding: "10px 14px" }}>
                    <Avatar label="BJ" size={26} font={10}/>
                    <span style={{ fontSize: 13 }}>Brian Jeong</span>
                    <span style={{ marginLeft: "auto", fontSize: 12, color: MUTED }}>President</span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* 5d. Friday · Roles & access — mock L / text R */}
          <div className="cl-week-row" style={{ padding: "48px 0 8px", borderTop: `1px solid ${LINE2}` }}>
            <div className="cl-week-mock">
              <div style={mockStyle}>
                <div style={{ padding: "16px 20px 10px" }}>
                  <div style={ey({ size: 10 })}>Ministry admin</div>
                  <div style={{ fontFamily: SERIF, fontSize: 22, fontWeight: 600, marginTop: 4, paddingBottom: 10, borderBottom: `1px solid ${LINE}` }}>Members and roles</div>
                </div>
                <div style={{ padding: "4px 20px 18px" }}>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8, marginBottom: 12 }}>
                    <div style={{ border: `1px solid ${PLUM}`, background: PLUM_TINT, borderRadius: 12, padding: "9px 12px" }}>
                      <div style={ey({ size: 10 })}>Members</div>
                      <div style={{ fontFamily: SERIF, fontSize: 19, fontWeight: 400 }}>124</div>
                    </div>
                    <div style={{ border: `1px solid ${LINE2}`, borderRadius: 12, padding: "9px 12px" }}>
                      <div style={ey({ size: 10 })}>Leaders</div>
                      <div style={{ fontFamily: SERIF, fontSize: 19, fontWeight: 400 }}>14</div>
                    </div>
                    <div style={{ border: `1px solid ${LINE2}`, borderRadius: 12, padding: "9px 12px" }}>
                      <div style={ey({ size: 10 })}>Admins</div>
                      <div style={{ fontFamily: SERIF, fontSize: 19, fontWeight: 400 }}>2</div>
                    </div>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "9px 0", borderBottom: `1px solid ${LINE3}` }}>
                    <Avatar label="AK" size={28} font={10}/>
                    <span style={{ fontSize: 13 }}>Alex Kang</span>
                    <RoleBadge kind="leader">Leader</RoleBadge>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "9px 0", borderBottom: `1px solid ${LINE3}` }}>
                    <Avatar label="BJ" size={28} font={10}/>
                    <span style={{ fontSize: 13 }}>Brian Jeong</span>
                    <RoleBadge kind="admin">Admin</RoleBadge>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "9px 0" }}>
                    <Avatar label="CS" size={28} font={10}/>
                    <span style={{ fontSize: 13 }}>Caleb Song</span>
                    <RoleBadge kind="member">Member</RoleBadge>
                  </div>
                </div>
              </div>
            </div>
            <div className="cl-week-text">
              <p style={{ ...ey({ plum: true }), margin: 0 }}>Friday · Roles &amp; access</p>
              <h3 className="cl-day-head" style={{ fontFamily: SERIF, fontSize: "clamp(28px, 3vw, 36px)", fontWeight: 600, letterSpacing: "-0.02em", lineHeight: 1.12, margin: "6px 0 0", color: INK }}>
                Every role in its place.
              </h3>
              <p style={{ fontSize: 16, color: BODY, lineHeight: 1.7, margin: "14px 0 0" }}>
                Members, leaders, admins — one roster, one place to grant a role, and everything else follows: which chats appear, which teams unlock, who can announce. Students see a simple week; leaders see their people; staff see the whole flock.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* ── §6 UP NEXT ── */}
      <section className="cl-upnext-sec" style={{ padding: "96px 0" }}>
        <div className="cl-wrap">
          <div style={{ textAlign: "center", marginBottom: 36 }}>
            <p style={{ ...ey(), margin: 0 }}>And on the home screen</p>
            <h2 style={{ fontFamily: SERIF, fontSize: "clamp(28px, 3.2vw, 38px)", fontWeight: 600, letterSpacing: "-0.02em", margin: "10px 0 0", color: INK }}>
              The week ahead greets everyone who opens the app.
            </h2>
          </div>
          <div className="cl-upnext-card" style={{ background: PLUM, borderRadius: 18, overflow: "hidden", display: "grid", gridTemplateColumns: "1.6fr 1fr", position: "relative" }}>
            <div style={{ position: "absolute", top: -70, right: -40, width: 260, height: 260, borderRadius: 999, border: `1px solid ${cod(18)}` }}/>
            <div className="cl-upnext-edit" style={{ padding: "72px 56px", borderRight: `1px solid ${cod(14)}` }}>
              <div style={ey({ color: cod(60) })}>Up next</div>
              <div style={{ fontFamily: SERIF, fontSize: "clamp(30px, 3.4vw, 42px)", fontWeight: 600, letterSpacing: "-0.02em", color: COD, marginTop: 10 }}>Welcome Week</div>
            </div>
            <div className="cl-upnext-date" style={{ padding: "72px 56px" }}>
              <div style={ey({ color: cod(60) })}>Starts</div>
              <div style={{ fontSize: 15, fontWeight: 600, color: COD, marginTop: 10 }}>Sunday</div>
              <div style={{ fontFamily: SERIF, fontSize: "clamp(28px, 3vw, 38px)", fontWeight: 600, color: COD, marginTop: 2 }}>Aug 23</div>
              <div style={{ fontSize: 13, color: cod(60), marginTop: 6 }}>10:00 AM</div>
            </div>
          </div>
        </div>
      </section>

      {/* ── §7 QUOTE BEAT ── */}
      <section className="cl-quote" style={{ borderTop: `1px solid ${LINE}`, padding: "100px 0" }}>
        <div className="cl-wrap" style={{ maxWidth: 760 }}>
          <p style={{ ...ey(), margin: 0 }}>What we&rsquo;re building toward</p>
          <p style={{
            fontFamily: SERIF, fontSize: "clamp(22px, 2.4vw, 29px)", fontWeight: 500,
            lineHeight: 1.45, letterSpacing: "-0.01em", color: INK, margin: "18px 0 0",
          }}>
            We&rsquo;re building Central so no leader spends Saturday night chasing sign-ups across four apps — and so the time that frees up gets spent praying over the names that matter: the ones we haven&rsquo;t seen in a while. That&rsquo;s the trade we&rsquo;re after.
          </p>
          <div style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 24 }}>
            <span style={{ width: 34, height: 1, background: PLUM }}/>
            <span style={{ fontSize: 14, color: BODY }}>The Central team</span>
          </div>
        </div>
      </section>

      {/* ── §8 SEND-OFF ── */}
      <section className="cl-sendoff" style={{ borderTop: `1px solid ${LINE}`, background: CREAM3, padding: "120px 0", textAlign: "center" }}>
        <div className="cl-wrap">
          <p style={{ ...ey({ plum: true }), margin: 0 }}>Sunday is coming</p>
          <h2 style={{
            fontFamily: SERIF, fontSize: "clamp(38px, 4.6vw, 54px)", fontWeight: 600,
            letterSpacing: "-0.02em", lineHeight: 1.08, maxWidth: 720, margin: "16px auto 0", color: INK,
          }}>
            Set the tools in order. Then go do the ministry.
          </h2>
          <p style={{ fontSize: 18, color: BODY, lineHeight: 1.7, maxWidth: 500, margin: "18px auto 0" }}>
            Register your ministry, invite your students, and let the scaffolding disappear behind the work.
          </p>
          <div style={{ display: "flex", justifyContent: "center", gap: 18, marginTop: 32, flexWrap: "wrap" }}>
            <button onClick={() => router.push("/register-ministry")} className="cl-btn-primary" style={btnPrimary}>
              Register your ministry
            </button>
            <a href="/ministries" className="cl-ghost" style={{ display: "inline-flex", alignItems: "center", gap: 8, color: INK, fontSize: 15, fontWeight: 500, padding: "15px 10px", textDecoration: "none" }}>
              Find an existing ministry <span>→</span>
            </a>
          </div>
          <p style={{ fontSize: 13, color: FAINT, fontStyle: "italic", marginTop: 44 }}>Soli Deo gloria.</p>
        </div>
      </section>

      {/* ── §9 FOOTER ── */}
      <footer style={{ borderTop: `1px solid ${LINE}` }}>
        <div className="cl-footer-inner cl-wrap" style={{ padding: "32px 48px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, fontFamily: SERIF, fontSize: 18, fontWeight: 600, color: INK }}>
            <RingCrossLogo size={22} color={PLUM2}/>
            Central
          </div>
          <span style={{ fontSize: 13, color: MUTED, fontStyle: "italic" }}>
            Equipping the saints, administratively. · © Central
          </span>
        </div>
      </footer>

      <style>{`
        .cl-wrap { max-width: 1080px; margin: 0 auto; padding: 0 48px; }

        .cl-week-row { display: grid; grid-template-columns: 1fr 1fr; gap: 64px; align-items: center; }
        .cl-upnext-card { }

        .cl-btn-primary { transition: transform 140ms ease, opacity 140ms ease, background 140ms ease; }
        .cl-btn-primary:hover { background: ${PLUM} !important; opacity: 0.94; }
        .cl-btn-primary:active { transform: scale(0.97); }
        .cl-ghost { transition: opacity 140ms ease; }
        .cl-ghost:hover { opacity: 0.65; }
        .cl-brand-link { transition: opacity 140ms ease; }
        .cl-brand-link:hover { opacity: 0.7; }
        .cl-nav-link { transition: color 140ms ease; }
        .cl-nav-link:hover { color: ${INK} !important; }
        .cl-signin { transition: opacity 140ms ease; }
        .cl-signin:hover { opacity: 0.6; }
        .cl-nav-text-btn { transition: opacity 140ms ease; }
        .cl-nav-text-btn:hover { opacity: 0.6; }

        @media (prefers-reduced-motion: reduce) {
          .cl-btn-primary, .cl-ghost, .cl-mobile-drawer, .cl-nav { transition: none !important; }
        }

        /* ── Responsive ── */
        @media (max-width: 960px) {
          .cl-wrap { padding: 0 24px !important; }

          .cl-nav-links { display: none !important; }
          .cl-desktop-only { display: none !important; }
          .cl-hamburger { display: flex !important; }
          .cl-mobile-drawer { display: flex !important; }

          .cl-hero { padding: 72px 0 64px !important; }
          .cl-why { padding: 64px 0 !important; }
          .cl-week { padding: 64px 0 !important; }
          .cl-upnext-sec { padding: 64px 0 !important; }
          .cl-quote { padding: 64px 0 !important; }
          .cl-sendoff { padding: 80px 0 !important; }

          .cl-week-row { grid-template-columns: 1fr !important; gap: 28px !important; padding: 40px 0 !important; }
          .cl-week-text { order: 1 !important; }
          .cl-week-mock { order: 2 !important; }

          .cl-upnext-card { grid-template-columns: 1fr !important; }
          .cl-upnext-edit { border-right: none !important; padding: 40px 28px !important; }
          .cl-upnext-date { border-top: 1px solid ${cod(14)} !important; padding: 40px 28px !important; }

          .cl-footer-inner { padding: 32px 24px !important; flex-direction: column !important; align-items: flex-start !important; gap: 10px !important; }
        }
      `}</style>
    </main>
  )
}
