"use client"

import { useState, useEffect, useRef, useCallback } from "react"
import { useRouter } from "next/navigation"
import { createClient } from "@/lib/supabase"
import { joinMinistryByCode, getPublicMinistries, joinMinistryById } from "@/app/actions/ministry"

type PublicMinistry = { id: string; name: string; university: string; size: string; location: string | null }

const SIZE_LABELS: Record<string, string> = { small: "Under 50", medium: "50–100", large: "100+" }

const SIZE_OPTIONS = ["Under 20", "20–50", "50–100", "100+"]

function RingCrossLogo({ size = 32, color = "#fdf8ee" }: { size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden>
      <circle cx="50" cy="50" r="36" stroke={color} strokeWidth="7" />
      <line x1="50" y1="17" x2="50" y2="83" stroke={color} strokeWidth="7" strokeLinecap="round" />
      <line x1="17" y1="50" x2="83" y2="50" stroke={color} strokeWidth="7" strokeLinecap="round" />
    </svg>
  )
}

export default function LandingPage() {
  const router = useRouter()
  const [navScrolled, setNavScrolled] = useState(false)
  const [ministryName, setMinistryName] = useState("")
  const [university, setUniversity] = useState("")
  const [selectedSize, setSelectedSize] = useState("")
  const [inviteCode, setInviteCode] = useState("")
  const [submitting, setSubmitting] = useState(false)
  const [joinError, setJoinError] = useState<string | null>(null)

  // Browse state
  const [browseSearch, setBrowseSearch] = useState("")
  const [browseMinistries, setBrowseMinistries] = useState<PublicMinistry[]>([])
  const [browsing, setBrowsing] = useState(false)
  const [joiningId, setJoiningId] = useState<string | null>(null)
  const [browseError, setBrowseError] = useState<string | null>(null)
  const [currentUser, setCurrentUser] = useState<{ name?: string; email?: string } | null>(null)

  useEffect(() => {
    const supabase = createClient()
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (user) setCurrentUser({ name: user.user_metadata?.name, email: user.email ?? undefined })
    })
  }, [])

  const registerRef = useRef<HTMLElement>(null)
  const joinRef = useRef<HTMLElement>(null)

  useEffect(() => {
    const onScroll = () => setNavScrolled(window.scrollY > window.innerHeight * 0.7)
    window.addEventListener("scroll", onScroll, { passive: true })
    return () => window.removeEventListener("scroll", onScroll)
  }, [])

  useEffect(() => {
    const hash = window.location.hash
    if (hash === "#register") {
      setTimeout(() => registerRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 400)
    } else if (hash === "#join") {
      setTimeout(() => joinRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 400)
    }
  }, [])

  function scrollToRegister() {
    window.history.pushState({}, "", "/#register")
    registerRef.current?.scrollIntoView({ behavior: "smooth", block: "start" })
  }

  function scrollToJoin() {
    window.history.pushState({}, "", "/#join")
    joinRef.current?.scrollIntoView({ behavior: "smooth", block: "start" })
  }

  function scrollToTop() {
    window.history.pushState({}, "", "/")
    window.scrollTo({ top: 0, behavior: "smooth" })
  }

  async function handleRegister(e: React.FormEvent) {
    e.preventDefault()
    if (!ministryName.trim() || !university.trim() || !selectedSize) return
    sessionStorage.setItem("pending_ministry", JSON.stringify({ name: ministryName, university, size: selectedSize }))
    setSubmitting(true)
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    router.push(user ? "/onboarding" : "/signup?intent=register")
  }

  async function handleJoin(e: React.FormEvent) {
    e.preventDefault()
    if (!inviteCode.trim()) return
    setSubmitting(true)
    setJoinError(null)

    const { error } = await joinMinistryByCode(inviteCode.trim().toUpperCase())

    if (error === "Not authenticated.") {
      // Not logged in — store code and go through signup
      sessionStorage.setItem("pending_invite_code", inviteCode.trim().toUpperCase())
      router.push("/signup?intent=join")
      return
    }
    if (error) {
      setJoinError(error)
      setSubmitting(false)
      return
    }
    window.location.href = "/home"
  }

  const fetchBrowse = useCallback(async (q: string) => {
    setBrowsing(true)
    setBrowseError(null)
    const { data, error } = await getPublicMinistries(q)
    if (error) setBrowseError(error)
    else setBrowseMinistries(data ?? [])
    setBrowsing(false)
  }, [])

  useEffect(() => {
    fetchBrowse("")
  }, [fetchBrowse])

  useEffect(() => {
    const t = setTimeout(() => fetchBrowse(browseSearch), 300)
    return () => clearTimeout(t)
  }, [browseSearch, fetchBrowse])

  async function handleBrowseJoin(m: PublicMinistry) {
    if (joiningId) return
    if (currentUser) {
      setJoiningId(m.id)
      setBrowseError(null)
      const { error } = await joinMinistryById(m.id)
      if (error) { setBrowseError(error); setJoiningId(null) }
      else window.location.href = "/home"
    } else {
      sessionStorage.setItem("pending_browse_ministry", JSON.stringify(m))
      router.push("/signup?intent=join")
    }
  }

  const inputStyle: React.CSSProperties = {
    width: "100%",
    padding: "11px 14px",
    border: "1px solid #ECE8DE",
    borderRadius: 10,
    fontSize: 14.5,
    fontFamily: "var(--font-inter)",
    background: "white",
    color: "#13101A",
    outline: "none",
    boxSizing: "border-box",
  }

  return (
    <div
      style={{
        backgroundImage: "url('/hero-church.png')",
        backgroundAttachment: "fixed",
        backgroundSize: "cover",
        backgroundPosition: "center center",
      }}
    >
      {/* ── Fixed overlays — match fixed photo, consistent across all sections ── */}
      <div style={{ position: "fixed", inset: 0, background: "linear-gradient(to bottom, rgba(20,15,15,0.35) 0%, transparent 25%)", pointerEvents: "none", zIndex: 1 }} />
      <div style={{ position: "fixed", inset: 0, background: "linear-gradient(to top right, rgba(20,15,15,0.72) 0%, rgba(20,15,15,0.42) 40%, transparent 68%)", pointerEvents: "none", zIndex: 1 }} />
      <div style={{ position: "fixed", inset: "auto 0 0 0", height: "10vh", background: "linear-gradient(to top, rgba(20,15,15,0.6) 0%, transparent 100%)", pointerEvents: "none", zIndex: 1 }} />

      {/* ── Fixed nav ────────────────────────────────────────────────────── */}
      <nav
        style={{
          position: "fixed",
          inset: "0 0 auto 0",
          zIndex: 50,
          display: "flex",
          alignItems: "center",
          padding: "0 36px",
          height: 60,
          transition: "background 0.25s ease, box-shadow 0.25s ease, backdrop-filter 0.25s ease",
          background: navScrolled ? "rgba(253,248,238,0.92)" : "rgba(253,248,238,0.18)",
          backdropFilter: "blur(12px)",
          WebkitBackdropFilter: "blur(12px)",
          boxShadow: navScrolled ? "0 1px 0 rgba(58,31,58,0.08)" : "none",
          fontFamily: "var(--font-inter)",
        }}
      >
        <button
          onClick={scrollToTop}
          style={{ display: "flex", alignItems: "center", gap: 9, flex: 1, background: "none", border: "none", cursor: "pointer", padding: 0 }}
        >
          <RingCrossLogo size={22} color={navScrolled ? "#3E1540" : "#fdf8ee"} />
          <span
            style={{
              fontFamily: "var(--font-instrument-serif)",
              fontSize: 19,
              color: navScrolled ? "#13101A" : "#fdf8ee",
              letterSpacing: "-0.01em",
              transition: "color 0.25s ease",
            }}
          >
            Central
          </span>
        </button>

        <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
          <span style={{ color: navScrolled ? "rgba(19,16,26,0.55)" : "rgba(253,248,238,0.7)", fontSize: 14, cursor: "default", transition: "color 0.25s ease" }}>
            Ministries
          </span>
          {currentUser ? (
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <div style={{
                width: 30, height: 30, borderRadius: "50%",
                background: navScrolled ? "#3E1540" : "rgba(253,248,238,0.18)",
                border: `1.5px solid ${navScrolled ? "transparent" : "rgba(253,248,238,0.45)"}`,
                backdropFilter: "blur(8px)",
                display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: 13, fontWeight: 600,
                color: navScrolled ? "#fdf8ee" : "#fdf8ee",
                letterSpacing: "-0.01em",
                flexShrink: 0,
              }}>
                {(currentUser.name ?? currentUser.email ?? "?")[0].toUpperCase()}
              </div>
              <button
                onClick={async () => { const s = createClient(); await s.auth.signOut(); window.location.reload() }}
                style={{ fontSize: 14, color: navScrolled ? "rgba(19,16,26,0.6)" : "rgba(253,248,238,0.78)", background: "none", border: "none", cursor: "pointer", padding: 0, transition: "color 0.25s ease" }}
              >
                Sign out
              </button>
            </div>
          ) : (
            <a href="/login" style={{ fontSize: 14, color: navScrolled ? "rgba(19,16,26,0.6)" : "rgba(253,248,238,0.78)", textDecoration: "none", transition: "color 0.25s ease" }}>
              Sign in
            </a>
          )}
        </div>
      </nav>

      {/* ── Hero — background-attachment:fixed keeps the photo locked while content scrolls ── */}
      <section
        id="hero"
        style={{
          height: "100vh",
          position: "relative",
          display: "flex",
          flexDirection: "column",
          fontFamily: "var(--font-inter)",
        }}
      >
        {/* All hero content above fixed overlays */}
        <div style={{ position: "relative", zIndex: 2, flex: 1, display: "flex", flexDirection: "column" }}>

          {/* Verse — top right, desktop only */}
          <div
            className="hidden md:block"
            style={{ position: "absolute", top: 72, right: 64, maxWidth: 280, textAlign: "right", background: "radial-gradient(ellipse at center, rgba(20,15,15,0.50) 0%, rgba(20,15,15,0.28) 60%, transparent 90%)", padding: "20px 24px", borderRadius: 8 }}
          >
            <p style={{ fontFamily: "ui-monospace, 'SF Mono', Menlo, monospace", fontSize: 10, letterSpacing: "0.14em", textTransform: "uppercase", color: "rgba(253,248,238,0.95)", marginBottom: 10, textShadow: "0 2px 12px rgba(0,0,0,0.6)" }}>
              Matthew 18:20
            </p>
            <blockquote style={{ fontFamily: "var(--font-instrument-serif)", fontStyle: "italic", fontSize: 17, color: "#fdf8ee", lineHeight: 1.55, textAlign: "right", margin: 0, textShadow: "0 2px 12px rgba(0,0,0,0.6)" }}>
              &ldquo;For where two or three gather in my name, there am I with them.&rdquo;
            </blockquote>
          </div>

          <div style={{ flex: 1 }} />

          {/* Bottom-left content */}
          <div style={{ maxWidth: 580, padding: "0 40px 72px" }} className="md:px-[64px] md:pb-[80px]">
            <p style={{ fontFamily: "ui-monospace, 'SF Mono', Menlo, monospace", fontSize: 11, letterSpacing: "0.12em", textTransform: "uppercase", color: "rgba(253,248,238,0.7)", marginBottom: 18, display: "flex", alignItems: "center", gap: 8, textShadow: "0 2px 10px rgba(0,0,0,0.55)" }}>
              <span style={{ color: "rgba(253,248,238,0.28)" }}>—</span>
              For college ministries
            </p>
            <h1 style={{ fontFamily: "var(--font-instrument-serif)", fontSize: "clamp(42px, 6vw, 80px)", fontWeight: 400, color: "#fdf8ee", lineHeight: 1.06, letterSpacing: "-0.02em", margin: "0 0 24px", textShadow: "0 4px 24px rgba(0,0,0,0.35)" }}>
              Where your<br />ministry gathers.
            </h1>
            <p style={{ fontSize: "clamp(14px, 1.4vw, 15.5px)", color: "#fdf8ee", lineHeight: 1.75, maxWidth: 400, marginBottom: 36, textShadow: "0 2px 10px rgba(0,0,0,0.5)" }}>
              Announcements, real-time messaging, member directories, and team tools — everything in one place, built for campus life.
            </p>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 12 }}>
              <button onClick={scrollToRegister} style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "13px 26px", background: "#fdf8ee", color: "#3a1f3a", borderRadius: 999, fontSize: 14.5, fontWeight: 600, border: "none", cursor: "pointer", letterSpacing: "-0.01em", whiteSpace: "nowrap" }}>
                Register my ministry <span style={{ fontSize: 16 }}>→</span>
              </button>
              <button onClick={scrollToJoin} style={{ display: "inline-flex", alignItems: "center", padding: "13px 26px", background: "rgba(20,15,15,0.18)", color: "#fdf8ee", border: "1px solid rgba(253,248,238,0.55)", borderRadius: 999, fontSize: 14.5, fontWeight: 500, cursor: "pointer", letterSpacing: "-0.01em", whiteSpace: "nowrap", backdropFilter: "blur(8px)" }}>
                Join a ministry
              </button>
            </div>
          </div>

        </div>
      </section>

      {/* ── Register section ─────────────────────────────────────────────── */}
      <section
        ref={registerRef}
        id="register"
        style={{ position: "relative", zIndex: 2, overflow: "hidden", padding: "88px 40px 100px", fontFamily: "var(--font-inter)" }}
        className="md:px-[72px]"
      >
        {/* Blurred chapel photo — inset: -20px prevents blur edge artifacts */}
        <div style={{ position: "absolute", inset: -20, backgroundImage: "url('/hero-church.png')", backgroundAttachment: "fixed", backgroundSize: "cover", backgroundPosition: "center", filter: "blur(10px)", zIndex: 0 }} />
        {/* Dark overlay for form readability */}
        <div style={{ position: "absolute", inset: 0, background: "rgba(12,8,4,0.52)", zIndex: 0 }} />

        <div style={{ position: "relative", zIndex: 1, maxWidth: 520 }}>
          <p style={{ fontFamily: "ui-monospace, 'SF Mono', Menlo, monospace", fontSize: 10, letterSpacing: "0.12em", textTransform: "uppercase", color: "rgba(253,248,238,0.5)", marginBottom: 16, display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ color: "rgba(253,248,238,0.2)" }}>—</span> New workspace
          </p>
          <h2 style={{ fontFamily: "var(--font-instrument-serif)", fontSize: "clamp(32px, 4vw, 56px)", fontWeight: 400, color: "#fdf8ee", letterSpacing: "-0.02em", lineHeight: 1.05, margin: "0 0 52px" }}>
            Register your ministry.
          </h2>

          <form onSubmit={handleRegister} style={{ display: "flex", flexDirection: "column", gap: 28 }}>
            <div>
              <label style={{ display: "block", fontFamily: "ui-monospace, 'SF Mono', Menlo, monospace", fontSize: 10, letterSpacing: "0.10em", textTransform: "uppercase", color: "rgba(253,248,238,0.55)", marginBottom: 10 }}>
                Ministry name
              </label>
              <input
                type="text" value={ministryName} onChange={e => setMinistryName(e.target.value)}
                placeholder="e.g. Chi Alpha at Pitt" required
                style={{ width: "100%", padding: "12px 16px", border: "1px solid rgba(253,248,238,0.18)", borderRadius: 10, fontSize: 14.5, fontFamily: "var(--font-inter)", background: "rgba(255,255,255,0.07)", color: "#fdf8ee", outline: "none", boxSizing: "border-box" }}
              />
            </div>
            <div>
              <label style={{ display: "block", fontFamily: "ui-monospace, 'SF Mono', Menlo, monospace", fontSize: 10, letterSpacing: "0.10em", textTransform: "uppercase", color: "rgba(253,248,238,0.55)", marginBottom: 10 }}>
                University
              </label>
              <input
                type="text" value={university} onChange={e => setUniversity(e.target.value)}
                placeholder="e.g. University of Pittsburgh" required
                style={{ width: "100%", padding: "12px 16px", border: "1px solid rgba(253,248,238,0.18)", borderRadius: 10, fontSize: 14.5, fontFamily: "var(--font-inter)", background: "rgba(255,255,255,0.07)", color: "#fdf8ee", outline: "none", boxSizing: "border-box" }}
              />
            </div>
            <div>
              <label style={{ display: "block", fontFamily: "ui-monospace, 'SF Mono', Menlo, monospace", fontSize: 10, letterSpacing: "0.10em", textTransform: "uppercase", color: "rgba(253,248,238,0.55)", marginBottom: 12 }}>
                Approximate size
              </label>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                {SIZE_OPTIONS.map(s => (
                  <button key={s} type="button" onClick={() => setSelectedSize(s)} style={{ padding: "9px 20px", borderRadius: 999, fontSize: 13, fontWeight: 500, cursor: "pointer", transition: "all 0.15s", background: selectedSize === s ? "rgba(253,248,238,0.12)" : "transparent", color: selectedSize === s ? "#fdf8ee" : "rgba(253,248,238,0.6)", border: `1px solid ${selectedSize === s ? "rgba(253,248,238,0.5)" : "rgba(253,248,238,0.2)"}` }}>
                    {s}
                  </button>
                ))}
              </div>
            </div>

            <button
              type="submit"
              disabled={submitting || !ministryName.trim() || !university.trim() || !selectedSize}
              style={{ alignSelf: "flex-start", padding: "13px 28px", background: "#fdf8ee", color: "#1C1008", border: "none", borderRadius: 999, fontSize: 14.5, fontWeight: 600, cursor: submitting || !ministryName.trim() || !university.trim() || !selectedSize ? "not-allowed" : "pointer", opacity: submitting || !ministryName.trim() || !university.trim() || !selectedSize ? 0.4 : 1, letterSpacing: "-0.01em", transition: "opacity 0.15s", fontFamily: "var(--font-inter)", marginTop: 4 }}
            >
              {submitting ? "Creating workspace…" : "Create workspace →"}
            </button>
          </form>

          <p style={{ marginTop: 36, fontSize: 13, color: "rgba(253,248,238,0.4)" }}>
            Already have a code?{" "}
            <button onClick={scrollToJoin} style={{ background: "none", border: "none", cursor: "pointer", color: "rgba(253,248,238,0.7)", fontWeight: 500, fontSize: 13, padding: 0, textDecoration: "underline", textUnderlineOffset: 3 }}>
              Join a ministry ↓
            </button>
          </p>
        </div>
      </section>

      {/* ── Join section ─────────────────────────────────────────────────── */}
      <section
        ref={joinRef}
        id="join"
        style={{ position: "relative", zIndex: 2, overflow: "hidden", padding: "88px 40px 100px", fontFamily: "var(--font-inter)" }}
        className="md:px-[72px]"
      >
        <div style={{ position: "absolute", inset: -20, backgroundImage: "url('/hero-church.png')", backgroundAttachment: "fixed", backgroundSize: "cover", backgroundPosition: "center", filter: "blur(10px)", zIndex: 0 }} />
        <div style={{ position: "absolute", inset: 0, background: "rgba(12,8,4,0.52)", zIndex: 0 }} />

        <div style={{ position: "relative", zIndex: 1, maxWidth: 520 }}>
          <p style={{ fontFamily: "ui-monospace, 'SF Mono', Menlo, monospace", fontSize: 10, letterSpacing: "0.12em", textTransform: "uppercase", color: "rgba(253,248,238,0.5)", marginBottom: 16, display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ color: "rgba(253,248,238,0.2)" }}>—</span> Join existing workspace
          </p>
          <h2 style={{ fontFamily: "var(--font-instrument-serif)", fontSize: "clamp(32px, 4vw, 56px)", fontWeight: 400, color: "#fdf8ee", letterSpacing: "-0.02em", lineHeight: 1.05, margin: "0 0 52px" }}>
            Join your ministry.
          </h2>

          {/* Invite code form */}
          <form onSubmit={handleJoin} style={{ display: "flex", flexDirection: "column", gap: 20 }}>
            {joinError && (
              <div style={{ padding: "10px 14px", borderRadius: 8, background: "rgba(180,40,40,0.25)", border: "1px solid rgba(255,100,100,0.3)", fontSize: 13, color: "#ffb3b3", lineHeight: 1.5 }}>
                {joinError}
              </div>
            )}
            <div>
              <label style={{ display: "block", fontFamily: "ui-monospace, 'SF Mono', Menlo, monospace", fontSize: 10, letterSpacing: "0.10em", textTransform: "uppercase", color: "rgba(253,248,238,0.55)", marginBottom: 10 }}>
                Invite code
              </label>
              <input
                type="text" value={inviteCode} onChange={e => setInviteCode(e.target.value.toUpperCase())}
                placeholder="XXXX-XXXX" required
                style={{ width: "100%", padding: "12px 16px", border: "1px solid rgba(253,248,238,0.18)", borderRadius: 10, fontSize: 15, fontFamily: "ui-monospace, 'SF Mono', Menlo, monospace", letterSpacing: "0.08em", background: "rgba(255,255,255,0.07)", color: "#fdf8ee", outline: "none", boxSizing: "border-box" }}
              />
            </div>
            <button
              type="submit"
              disabled={submitting || !inviteCode.trim()}
              style={{ alignSelf: "flex-start", padding: "13px 28px", background: "#fdf8ee", color: "#1C1008", border: "none", borderRadius: 999, fontSize: 14.5, fontWeight: 600, cursor: submitting || !inviteCode.trim() ? "not-allowed" : "pointer", opacity: submitting || !inviteCode.trim() ? 0.4 : 1, letterSpacing: "-0.01em", transition: "opacity 0.15s", fontFamily: "var(--font-inter)" }}
            >
              {submitting ? "Joining…" : "Join workspace →"}
            </button>
          </form>

          {/* Divider */}
          <div style={{ display: "flex", alignItems: "center", gap: 16, margin: "32px 0 0" }}>
            <div style={{ flex: 1, height: 1, background: "rgba(253,248,238,0.12)" }} />
            <span style={{ fontFamily: "ui-monospace, 'SF Mono', Menlo, monospace", fontSize: 10, letterSpacing: "0.12em", textTransform: "uppercase", color: "rgba(253,248,238,0.35)" }}>or browse</span>
            <div style={{ flex: 1, height: 1, background: "rgba(253,248,238,0.12)" }} />
          </div>

          {/* Browse public ministries */}
          <div style={{ marginTop: 24 }}>
            <label style={{ display: "block", fontFamily: "ui-monospace, 'SF Mono', Menlo, monospace", fontSize: 10, letterSpacing: "0.10em", textTransform: "uppercase", color: "rgba(253,248,238,0.55)", marginBottom: 10 }}>
              Browse public ministries
            </label>
            <input
              type="text"
              value={browseSearch}
              onChange={e => setBrowseSearch(e.target.value)}
              placeholder="Search by name or university…"
              style={{ width: "100%", padding: "12px 16px", border: "1px solid rgba(253,248,238,0.18)", borderRadius: 10, fontSize: 14.5, fontFamily: "var(--font-inter)", background: "rgba(255,255,255,0.07)", color: "#fdf8ee", outline: "none", boxSizing: "border-box" }}
            />

            {browseError && (
              <div style={{ marginTop: 12, padding: "10px 14px", borderRadius: 8, background: "rgba(180,40,40,0.25)", border: "1px solid rgba(255,100,100,0.3)", fontSize: 13, color: "#ffb3b3" }}>
                {browseError}
              </div>
            )}

            <div style={{ marginTop: 12, display: "flex", flexDirection: "column", gap: 8, maxHeight: 280, overflowY: "auto" }}>
              {browsing && (
                <p style={{ fontSize: 13, color: "rgba(253,248,238,0.4)", padding: "12px 0" }}>Loading…</p>
              )}
              {!browsing && browseMinistries.length === 0 && (
                <p style={{ fontSize: 13, color: "rgba(253,248,238,0.4)", padding: "12px 0" }}>
                  {browseSearch ? "No ministries match your search." : "No public ministries yet."}
                </p>
              )}
              {!browsing && browseMinistries.map(m => (
                <button
                  key={m.id}
                  onClick={() => handleBrowseJoin(m)}
                  disabled={joiningId === m.id}
                  style={{
                    display: "flex", alignItems: "center", gap: 14,
                    padding: "12px 14px", borderRadius: 10,
                    background: "rgba(255,255,255,0.06)",
                    border: "1px solid rgba(253,248,238,0.12)",
                    cursor: joiningId === m.id ? "not-allowed" : "pointer",
                    opacity: joiningId === m.id ? 0.6 : 1,
                    textAlign: "left", width: "100%",
                    transition: "background 0.15s",
                  }}
                  onMouseEnter={e => (e.currentTarget.style.background = "rgba(255,255,255,0.11)")}
                  onMouseLeave={e => (e.currentTarget.style.background = "rgba(255,255,255,0.06)")}
                >
                  <div style={{ width: 38, height: 38, borderRadius: 10, background: "rgba(253,248,238,0.12)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                    <span style={{ fontFamily: "var(--font-instrument-serif)", fontSize: 17, color: "#fdf8ee" }}>{m.name[0]}</span>
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ fontSize: 14, fontWeight: 600, color: "#fdf8ee", margin: 0, fontFamily: "var(--font-inter)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{m.name}</p>
                    <p style={{ fontSize: 12, color: "rgba(253,248,238,0.5)", margin: "2px 0 0", fontFamily: "var(--font-inter)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{m.university}</p>
                  </div>
                  <span style={{ fontSize: 11, color: "rgba(253,248,238,0.4)", fontFamily: "var(--font-inter)", flexShrink: 0 }}>
                    {SIZE_LABELS[m.size] ?? m.size}
                  </span>
                  <span style={{ color: "rgba(253,248,238,0.3)", fontSize: 16, flexShrink: 0 }}>›</span>
                </button>
              ))}
            </div>
          </div>

          <p style={{ marginTop: 32, fontSize: 13, color: "rgba(253,248,238,0.4)" }}>
            Starting a new ministry?{" "}
            <button onClick={scrollToRegister} style={{ background: "none", border: "none", cursor: "pointer", color: "rgba(253,248,238,0.7)", fontWeight: 500, fontSize: 13, padding: 0, textDecoration: "underline", textUnderlineOffset: 3 }}>
              Register above ↑
            </button>
          </p>
        </div>
      </section>

      {/* ── Footer strip ─────────────────────────────────────────────────── */}
      <div style={{ padding: "24px 40px", display: "flex", flexWrap: "wrap", alignItems: "center", gap: 16, fontFamily: "var(--font-inter)" }} className="md:px-[64px]">
        <span style={{ fontFamily: "var(--font-instrument-serif)", fontStyle: "italic", fontSize: 13, color: "rgba(253,248,238,0.5)", flex: 1, whiteSpace: "nowrap", textShadow: "0 1px 4px rgba(0,0,0,0.4)" }}>
          Built at the University of Pittsburgh
        </span>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
          {["Real-time chat", "RSVP events", "Directories", "Team planning"].map(f => (
            <span key={f} style={{ fontFamily: "ui-monospace, 'SF Mono', Menlo, monospace", fontSize: 11, letterSpacing: "0.05em", color: "rgba(253,248,238,0.5)", padding: "4px 12px", border: "1px solid rgba(253,248,238,0.2)", borderRadius: 999, whiteSpace: "nowrap" }}>
              {f}
            </span>
          ))}
        </div>
      </div>
    </div>
  )
}
