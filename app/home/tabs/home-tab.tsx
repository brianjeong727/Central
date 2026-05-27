"use client"

import { useState, useEffect } from "react"
import { ChevronRight, Bell, Check, MessageCircle, Calendar } from "lucide-react"
import { createClient } from "@/lib/supabase"
import { ChatsSection } from "@/components/ui/chats-section"
import { Spinner, RingCrossLogo, MONO_STYLE } from "../components/shared"
import { getInitials } from "../utils"
import { DesktopTopbar } from "../components/desktop-nav"
import { respondToGradCheck } from "@/app/actions/auto-chats"
import type { HomeTabProps, Announcement, CongregationQuestion } from "../types"

export { HomeTabProps }

export function HomeTab({ profile, userRole, ministryId, ministryName, recentChats, onSeeChats, onSeeAnnouncements, onOpenChat, onGoToProfile, avatarUrl, activeQuestion, hasResponded, onResponded }: HomeTabProps) {
  const supabase = createClient()

  // Grad-check banner state (optimistic clear)
  const [needsGradCheck, setNeedsGradCheck] = useState(profile.needs_grad_check ?? false)

  async function handleGradCheck(graduated: boolean) {
    setNeedsGradCheck(false)
    respondToGradCheck(profile.id, graduated)
  }

  // Hero event state
  const [heroAnn, setHeroAnn] = useState<Announcement | null>(null)
  const [userHasRsvped, setUserHasRsvped] = useState(false)
  const [rsvping, setRsvping] = useState(false)
  const [rsvpCount, setRsvpCount] = useState(0)
  const [rsvpAttendees, setRsvpAttendees] = useState<{ user_id: string; name: string }[]>([])
  const [featuredShowAttendees, setFeaturedShowAttendees] = useState(false)

  // Page-level state
  const [forYouItems, setForYouItems] = useState<Announcement[]>([])
  const [rsvpedAnnIds, setRsvpedAnnIds] = useState<Set<string>>(new Set())
  const [featuredPrayer, setFeaturedPrayer] = useState<{ name: string; text: string } | null>(null)
  const [memberCount, setMemberCount] = useState<number | null>(null)
  const [eventCount, setEventCount] = useState(0)
  const [loading, setLoading] = useState(true)

  // Pastor Pulse card state
  const [pulseInput, setPulseInput] = useState<string>("")
  const [pulseScale, setPulseScale] = useState<number | null>(null)
  const [pulseOption, setPulseOption] = useState<string | null>(null)
  const [pulseSubmitting, setPulseSubmitting] = useState(false)
  const [pulseSubmitted, setPulseSubmitted] = useState(false)

  const isPastorRole = userRole.toLowerCase() === "pastor"

  async function handlePulseSubmit() {
    if (!activeQuestion || pulseSubmitting) return
    setPulseSubmitting(true)
    const payload: Record<string, unknown> = {
      question_id: activeQuestion.id,
      ministry_id: ministryId,
      user_id: profile.id,
    }
    if (activeQuestion.question_type === "poll") payload.response_option = pulseOption
    else if (activeQuestion.question_type === "scale") payload.response_scale = pulseScale
    else payload.response_text = pulseInput.trim()
    await supabase.from("congregation_responses").upsert(payload, { onConflict: "question_id,user_id" })
    setPulseSubmitting(false)
    setPulseSubmitted(true)
    onResponded?.()
  }

  const isLeaderOrAdmin = ["leader", "admin"].includes(userRole.toLowerCase())
  const top3 = recentChats.slice(0, 3)
  const totalUnread = top3.reduce((s, c) => s + c.unreadCount, 0)
  const showAttendeeList = rsvpAttendees.length > 0 && (isLeaderOrAdmin || featuredShowAttendees)
  const roleBadge = userRole.charAt(0).toUpperCase() + userRole.slice(1).toLowerCase()
  const dateLabel = new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })

  useEffect(() => {
    async function load() {
      // All announcements (pinned first, then newest)
      const { data: anns } = await supabase
        .from("announcements")
        .select("*")
        .eq("ministry_id", ministryId)
        .order("is_pinned", { ascending: false })
        .order("created_at", { ascending: false })
        .limit(10)
      const list = anns ?? []

      // Hero = first event announcement
      const hero = list.find((a) => a.is_event) ?? null
      setHeroAnn(hero)
      setEventCount(list.filter((a) => a.is_event).length)

      // User's RSVPs across all fetched announcements
      let userRsvpIds = new Set<string>()
      if (list.length > 0) {
        const { data: myRsvps } = await supabase
          .from("rsvps")
          .select("announcement_id")
          .eq("user_id", profile.id)
          .in("announcement_id", list.map((a) => a.id))
        userRsvpIds = new Set((myRsvps ?? []).map((r) => r.announcement_id))
        setRsvpedAnnIds(userRsvpIds)
      }

      // Hero RSVP detail
      if (hero) {
        setFeaturedShowAttendees(hero.show_attendees ?? false)
        setUserHasRsvped(userRsvpIds.has(hero.id))
        const { data: heroRsvpRows } = await supabase
          .from("rsvps").select("user_id").eq("announcement_id", hero.id)
        const rows = heroRsvpRows ?? []
        setRsvpCount(rows.length)
        if (rows.length > 0) {
          const { data: profileRows } = await supabase
            .from("profiles").select("id, name")
            .in("id", rows.map((r) => r.user_id))
            .eq("ministry_id", ministryId)
          setRsvpAttendees((profileRows ?? []).map((p) => ({ user_id: p.id, name: p.name })))
        }
      }

      // "For You" — events not RSVPed first, then pinned, then recent; exclude hero
      const heroId = hero?.id
      const forYou = list
        .filter((a) => a.id !== heroId)
        .sort((a, b) => {
          const aScore = (a.is_event && !userRsvpIds.has(a.id) ? 10 : 0) + (a.is_pinned ? 5 : 0)
          const bScore = (b.is_event && !userRsvpIds.has(b.id) ? 10 : 0) + (b.is_pinned ? 5 : 0)
          return bScore - aScore
        })
        .slice(0, 3)
      setForYouItems(forYou)

      // Member count — leaders only
      if (isLeaderOrAdmin) {
        const { count } = await supabase
          .from("profiles")
          .select("*", { count: "exact", head: true })
          .eq("ministry_id", ministryId)
        setMemberCount(count ?? null)
      }

      // Featured prayer request from a peer
      const { data: prayerProfile } = await supabase
        .from("profiles")
        .select("name, pray_for_me")
        .eq("ministry_id", ministryId)
        .not("pray_for_me", "is", null)
        .neq("id", profile.id)
        .limit(1)
        .maybeSingle()
      if (prayerProfile?.pray_for_me) {
        setFeaturedPrayer({ name: prayerProfile.name, text: prayerProfile.pray_for_me })
      }

      setLoading(false)
    }
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile.id])

  async function handleHomeRsvp() {
    if (!heroAnn || rsvping) return
    setRsvping(true)
    if (userHasRsvped) {
      setUserHasRsvped(false)
      setRsvpCount((c) => Math.max(0, c - 1))
      setRsvpAttendees((prev) => prev.filter((a) => a.user_id !== profile.id))
      await supabase.from("rsvps").delete().eq("announcement_id", heroAnn.id).eq("user_id", profile.id)
    } else {
      setUserHasRsvped(true)
      setRsvpCount((c) => c + 1)
      setRsvpAttendees((prev) => [...prev, { user_id: profile.id, name: profile.name }])
      await supabase.from("rsvps").upsert(
        { announcement_id: heroAnn.id, user_id: profile.id },
        { onConflict: "announcement_id,user_id" }
      )
    }
    setRsvping(false)
  }

  async function handleForYouRsvp(annId: string) {
    const isRsvped = rsvpedAnnIds.has(annId)
    setRsvpedAnnIds((prev) => {
      const s = new Set(prev)
      if (isRsvped) s.delete(annId); else s.add(annId)
      return s
    })
    if (isRsvped) {
      await supabase.from("rsvps").delete().eq("announcement_id", annId).eq("user_id", profile.id)
    } else {
      await supabase.from("rsvps").upsert(
        { announcement_id: annId, user_id: profile.id },
        { onConflict: "announcement_id,user_id" }
      )
    }
  }

  const statParts: string[] = [
    eventCount > 0 ? `${eventCount} upcoming event${eventCount !== 1 ? "s" : ""}` : "",
    totalUnread > 0 ? `${totalUnread} unread message${totalUnread !== 1 ? "s" : ""}` : "no unread messages",
    isLeaderOrAdmin && memberCount !== null ? `${memberCount} member${memberCount !== 1 ? "s" : ""}` : "",
  ].filter(Boolean)

  return (
    <div className="pb-28 md:pb-0">
      <DesktopTopbar crumbs={["Central", "Home"]} />

      {/* Mobile top bar */}
      <div className="flex items-center justify-between px-5 pt-14 pb-4 md:hidden">
        <a href="/landing" className="flex items-center gap-2.5" style={{ textDecoration: "none" }}>
          <RingCrossLogo size={26} color="#3E1540" />
          <span style={{ fontFamily: "var(--font-instrument-serif)", fontSize: "28px", color: "#13101A", letterSpacing: "-0.01em", lineHeight: 1 }}>{ministryName}</span>
        </a>
        <button
          onClick={onGoToProfile}
          className="size-9 rounded-full overflow-hidden bg-[#3E1540] border border-[#ECE8DE] flex items-center justify-center hover:opacity-90 transition-opacity flex-shrink-0"
          aria-label="Your profile"
        >
          {avatarUrl ? (
            <img src={avatarUrl} alt="Profile" className="w-full h-full object-cover" />
          ) : (
            <span className="text-white font-bold text-[11px]">{getInitials(profile.name)}</span>
          )}
        </button>
      </div>

      {/* Grad-check banner — shown only to seniors who haven't responded yet */}
      {needsGradCheck && (
        <div style={{ margin: "12px 20px 0", borderRadius: 12, border: "1px solid #E5E0D2", borderLeft: "4px solid #3E1540", background: "white", padding: "14px 16px", display: "flex", flexDirection: "column", gap: 10 }}>
          <div>
            <p style={{ fontSize: 14, fontWeight: 600, color: "#13101A", marginBottom: 4 }}>Have you graduated?</p>
            <p style={{ fontSize: 13, color: "#8A8497" }}>Let us know so we can move you to the right group.</p>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button
              onClick={() => handleGradCheck(true)}
              style={{ flex: 1, background: "#3E1540", color: "white", fontSize: 13, fontWeight: 600, fontFamily: "var(--font-inter)", border: "none", borderRadius: 8, padding: "8px 0", cursor: "pointer" }}
            >
              I&apos;ve graduated
            </button>
            <button
              onClick={() => handleGradCheck(false)}
              style={{ flex: 1, background: "none", color: "#13101A", fontSize: 13, fontWeight: 500, fontFamily: "var(--font-inter)", border: "1px solid #E5E0D2", borderRadius: 8, padding: "8px 0", cursor: "pointer" }}
            >
              Still a student
            </button>
          </div>
        </div>
      )}

      {loading ? (
        <div className="px-5 md:px-14 pt-8"><Spinner /></div>
      ) : (
        <>
          {/* ── Desktop header ── */}
          <div className="hidden md:flex items-end justify-between px-14 pt-11 pb-8 border-b border-[#E5E0D2]" style={{ gap: "24px" }}>
            <div style={{ maxWidth: "640px" }}>
              <p style={MONO_STYLE}>{dateLabel}</p>
              <h1 style={{ margin: "14px 0 8px", fontFamily: "var(--font-instrument-serif)", fontWeight: 400, fontSize: "52px", lineHeight: 1.05, color: "#13101A", letterSpacing: "-0.01em" }}>
                Today in {ministryName}
              </h1>
              <span style={{ display: "inline-block", fontSize: "11px", color: "#5A5466", background: "#F4F1E8", border: "1px solid #E5E0D2", padding: "3px 10px", borderRadius: 999, fontWeight: 500 }}>
                {roleBadge}
              </span>
              <p style={{ marginTop: "12px", color: "#5A5466", fontSize: "14px" }}>
                {statParts.join(" · ")}
              </p>
            </div>
            <div className="flex gap-6 pb-1.5">
              {([
                { label: "Events", value: String(eventCount) },
                { label: "Unread", value: String(totalUnread) },
                ...(isLeaderOrAdmin && memberCount !== null ? [{ label: "Members", value: String(memberCount) }] : []),
              ] as { label: string; value: string }[]).map(({ label, value }) => (
                <div key={label} style={{ textAlign: "right" }}>
                  <p style={MONO_STYLE}>{label}</p>
                  <p style={{ fontFamily: "var(--font-instrument-serif)", fontSize: "28px", marginTop: "2px", fontVariantNumeric: "tabular-nums", color: "#13101A" }}>{value}</p>
                </div>
              ))}
            </div>
          </div>

          {/* ── Desktop content ── */}
          <div className="hidden md:block px-14 py-7">
            {/* Hero + chats */}
            <div className="grid gap-5" style={{ gridTemplateColumns: "1.4fr 1fr" }}>
              {/* Hero event card */}
              {heroAnn ? (
                <div
                  className="relative overflow-hidden rounded-2xl text-[#F6F4EF] flex flex-col hover:shadow-[0_3px_12px_rgba(19,16,26,0.12)] transition-shadow duration-150"
                  style={{ background: "linear-gradient(135deg, #4A1B4D 0%, #3E1540 60%, #1A0820 100%)", padding: "32px 32px 28px", minHeight: "320px" }}
                >
                  <div className="absolute rounded-full pointer-events-none" style={{ top: -120, right: -100, width: 380, height: 380, background: "radial-gradient(circle, rgba(246,244,239,0.14), transparent 60%)" }} />
                  <div className="absolute inset-0 pointer-events-none" style={{ opacity: 0.07, backgroundImage: "radial-gradient(circle, white 1px, transparent 1px)", backgroundSize: "16px 16px" }} />
                  <div className="relative flex justify-between items-start">
                    <span style={{ ...MONO_STYLE, color: "rgba(246,244,239,0.7)" }}>Up next</span>
                    <span style={{ fontSize: "10px", letterSpacing: "0.8px", padding: "3px 9px", borderRadius: 999, background: "rgba(255,255,255,0.15)", color: "#F6F4EF", textTransform: "uppercase", fontWeight: 500 }}>Event</span>
                  </div>
                  <h2 className="relative" style={{ margin: "28px 0 0", fontFamily: "var(--font-instrument-serif)", fontWeight: 400, fontSize: "52px", lineHeight: 0.98, letterSpacing: "-0.01em" }}>
                    {heroAnn.title}
                  </h2>
                  <p className="relative mt-2.5 text-[13px] leading-relaxed line-clamp-3" style={{ opacity: 0.78, maxWidth: "420px" }}>
                    {heroAnn.body}
                  </p>
                  <div className="relative mt-auto pt-9">
                    <div className="flex items-center gap-3">
                      <button
                        onClick={handleHomeRsvp}
                        disabled={rsvping}
                        style={{ background: userHasRsvped ? "rgba(255,255,255,0.15)" : "#F6F4EF", color: userHasRsvped ? "#F6F4EF" : "#13101A", border: 0, padding: "9px 18px", borderRadius: "8px", fontWeight: 500, fontSize: "13px", cursor: "pointer" }}
                      >
                        {userHasRsvped ? "Going ✓" : "RSVP"}
                      </button>
                      <button
                        onClick={onSeeAnnouncements}
                        style={{ background: "rgba(255,255,255,0.08)", color: "#F6F4EF", border: "1px solid rgba(255,255,255,0.18)", padding: "9px 18px", borderRadius: "8px", fontSize: "13px", cursor: "pointer" }}
                      >
                        Details
                      </button>
                      {rsvpCount > 0 && <span style={{ fontSize: "12px", color: "rgba(246,244,239,0.5)", fontWeight: 500 }}>{rsvpCount} going</span>}
                    </div>
                    {showAttendeeList && (
                      <div style={{ marginTop: 12, display: "flex", flexWrap: "wrap", gap: 6 }}>
                        {rsvpAttendees.slice(0, 8).map((a) => (
                          <span key={a.user_id} style={{ fontSize: "11px", color: "rgba(246,244,239,0.75)", background: "rgba(246,244,239,0.12)", border: "1px solid rgba(246,244,239,0.2)", padding: "2px 9px", borderRadius: 999 }}>{a.name.split(" ")[0]}</span>
                        ))}
                        {rsvpAttendees.length > 8 && <span style={{ fontSize: "11px", color: "rgba(246,244,239,0.45)", padding: "2px 4px" }}>+{rsvpAttendees.length - 8} more</span>}
                      </div>
                    )}
                  </div>
                </div>
              ) : (
                <div className="rounded-2xl border border-[#E5E0D2] bg-[#FBF8F2] flex flex-col items-center justify-center gap-3 text-center" style={{ minHeight: "320px", padding: "40px 32px" }}>
                  <Calendar className="w-8 h-8 text-[#C4C4C4]" />
                  <div>
                    <p style={{ fontSize: "15px", fontWeight: 600, color: "#13101A" }}>No upcoming events</p>
                    <p style={{ fontSize: "13px", color: "#8A8497", marginTop: "4px" }}>Check the announcements tab for updates</p>
                  </div>
                  <button onClick={onSeeAnnouncements} style={{ marginTop: "8px", fontSize: "12px", color: "#3E1540", fontWeight: 500, border: "1px solid #3E1540", padding: "6px 16px", borderRadius: 999, cursor: "pointer", background: "transparent" }}>
                    See announcements
                  </button>
                </div>
              )}

              {/* Recent chats */}
              <div className="rounded-xl border border-[#E5E0D2] bg-[#FBF8F2] overflow-hidden flex flex-col">
                <div className="px-4 py-3.5 border-b border-[#E5E0D2] flex items-center">
                  <span style={{ fontSize: "13px", fontWeight: 500 }}>Your chats</span>
                  <span className="flex-1" />
                  {totalUnread > 0 && <span style={{ fontSize: "11px", color: "#8A8497" }}>{totalUnread} unread</span>}
                </div>
                {top3.length === 0 ? (
                  <div className="flex-1 flex items-center justify-center py-10">
                    <div className="text-center">
                      <MessageCircle className="w-6 h-6 text-[#C4C4C4] mx-auto mb-2" />
                      <p style={{ fontSize: "13px", color: "#8A8497" }}>No chats yet</p>
                    </div>
                  </div>
                ) : (
                  top3.map((c, i) => (
                    <button
                      key={c.id}
                      onClick={() => onOpenChat(c.id, c.groupName)}
                      className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-[#F4F1E8] active:scale-[0.99] transition-[transform,background-color] duration-100"
                      style={{ borderTop: i ? "1px solid #EFEAE0" : undefined }}
                    >
                      <div style={{ width: 32, height: 32, borderRadius: 8, flexShrink: 0, background: i % 2 === 0 ? "#3E1540" : "#13101A", color: "#F6F4EF", display: "grid", placeItems: "center", fontSize: "11px", fontWeight: 600 }}>
                        {c.initials}
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div className="flex justify-between gap-2 items-baseline">
                          <span style={{ fontSize: "13px", fontWeight: c.unreadCount ? 600 : 500 }}>{c.groupName}</span>
                          {c.time && <span style={{ fontSize: "10px", color: "#8A8497", flexShrink: 0 }}>{c.time}</span>}
                        </div>
                        {c.lastMessage && (
                          <p style={{ fontSize: "12px", color: "#5A5466", marginTop: "1px", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{c.lastMessage}</p>
                        )}
                      </div>
                      {c.unreadCount > 0 && (
                        <span style={{ background: "#C9A34B", color: "#13101A", fontSize: "10px", fontWeight: 700, padding: "2px 7px", borderRadius: 999 }}>{c.unreadCount}</span>
                      )}
                    </button>
                  ))
                )}
                <button onClick={onSeeChats} className="px-4 py-3 mt-auto border-t border-[#E5E0D2] text-[12px] text-[#8A8497] hover:text-[#13101A] active:opacity-70 text-left transition-[color,opacity] duration-150">
                  See all chats →
                </button>
              </div>
            </div>

            {/* Pastor Pulse card — desktop */}
            {activeQuestion && !hasResponded && !isPastorRole && (
              <div className="mt-6 rounded-2xl px-8 py-7" style={{ background: "linear-gradient(135deg, #4A1B4D 0%, #3E1540 100%)", color: "#F6F4EF" }}>
                {pulseSubmitted ? (
                  <div style={{ textAlign: "center", padding: "20px 0" }}>
                    <p style={{ fontSize: 22, marginBottom: 6 }}>🙏</p>
                    <p style={{ fontSize: 16, fontWeight: 600, marginBottom: 4 }}>Thanks for sharing</p>
                    <p style={{ fontSize: 13, color: "rgba(246,244,239,0.65)" }}>Your response was received anonymously.</p>
                  </div>
                ) : (
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 32, alignItems: "start" }}>
                    <div>
                      <span style={{ fontSize: 10, letterSpacing: "0.8px", textTransform: "uppercase", fontWeight: 600, color: "rgba(246,244,239,0.6)", display: "block", marginBottom: 10 }}>
                        Pastor Pulse · {activeQuestion.question_type === "poll" ? "Poll" : activeQuestion.question_type === "scale" ? "1–5 Scale" : activeQuestion.question_type === "prayer" ? "Prayer" : "Open"}
                      </span>
                      <p style={{ fontFamily: "var(--font-instrument-serif)", fontSize: 28, lineHeight: 1.15, color: "#F6F4EF", margin: 0 }}>{activeQuestion.question_text}</p>
                    </div>
                    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                      {activeQuestion.question_type === "poll" && activeQuestion.options && (
                        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                          {activeQuestion.options.map((opt) => (
                            <button key={opt} onClick={() => setPulseOption(opt)} style={{ padding: "9px 14px", borderRadius: 10, border: `1.5px solid ${pulseOption === opt ? "#F6F4EF" : "rgba(246,244,239,0.25)"}`, background: pulseOption === opt ? "rgba(246,244,239,0.15)" : "transparent", color: "#F6F4EF", fontSize: 14, fontWeight: pulseOption === opt ? 600 : 400, cursor: "pointer", textAlign: "left" }}>{opt}</button>
                          ))}
                        </div>
                      )}
                      {activeQuestion.question_type === "scale" && (
                        <div style={{ display: "flex", gap: 8 }}>
                          {[1, 2, 3, 4, 5].map((n) => (
                            <button key={n} onClick={() => setPulseScale(n)} style={{ flex: 1, aspectRatio: "1", borderRadius: 10, border: `1.5px solid ${pulseScale === n ? "#F6F4EF" : "rgba(246,244,239,0.25)"}`, background: pulseScale === n ? "rgba(246,244,239,0.2)" : "transparent", color: "#F6F4EF", fontSize: 18, fontWeight: 600, cursor: "pointer" }}>{n}</button>
                          ))}
                        </div>
                      )}
                      {(activeQuestion.question_type === "open" || activeQuestion.question_type === "prayer") && (
                        <textarea value={pulseInput} onChange={e => setPulseInput(e.target.value)} placeholder={activeQuestion.question_type === "prayer" ? "Share your prayer request…" : "Share your thoughts…"} rows={3} style={{ width: "100%", padding: "10px 12px", borderRadius: 10, border: "1.5px solid rgba(246,244,239,0.25)", background: "rgba(246,244,239,0.1)", color: "#F6F4EF", fontSize: 14, fontFamily: "var(--font-inter)", resize: "none", boxSizing: "border-box", outline: "none" }} />
                      )}
                      <button
                        onClick={handlePulseSubmit}
                        disabled={pulseSubmitting || (activeQuestion.question_type === "poll" && !pulseOption) || (activeQuestion.question_type === "scale" && !pulseScale) || ((activeQuestion.question_type === "open" || activeQuestion.question_type === "prayer") && !pulseInput.trim())}
                        style={{ padding: "11px 0", borderRadius: 10, background: "#F6F4EF", color: "#3E1540", fontSize: 14, fontWeight: 700, border: "none", cursor: "pointer", fontFamily: "var(--font-inter)", opacity: pulseSubmitting ? 0.6 : 1 }}
                      >
                        {pulseSubmitting ? "Submitting…" : "Submit anonymously"}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* For You section */}
            {forYouItems.length > 0 && (
              <div className="mt-8">
                <div className="flex items-baseline justify-between mb-4">
                  <h2 style={{ fontFamily: "var(--font-instrument-serif)", fontWeight: 400, fontSize: "26px", color: "#13101A", letterSpacing: "-0.01em", margin: 0 }}>For you</h2>
                  <button onClick={onSeeAnnouncements} style={{ fontSize: "12px", color: "#8A8497", cursor: "pointer", background: "none", border: "none" }} className="hover:text-[#3E1540] transition-colors">
                    See all →
                  </button>
                </div>
                <div className="grid gap-4" style={{ gridTemplateColumns: "repeat(3, 1fr)" }}>
                  {forYouItems.map((a) => (
                    <div key={a.id} className="rounded-xl border border-[#E5E0D2] bg-[#FBF8F2] p-5 flex flex-col hover:bg-[#F7F4EF] transition-colors duration-150">
                      <div className="flex items-start justify-between gap-2 mb-3">
                        <span style={{ fontSize: "10px", letterSpacing: "0.8px", padding: "2px 8px", borderRadius: 6, background: "#EFEAE0", textTransform: "uppercase", fontWeight: 500, color: "#5A5466", whiteSpace: "nowrap" }}>
                          {a.is_pinned ? "📌 Pinned" : a.is_event ? "Event" : "Post"}
                        </span>
                        {a.is_event && (
                          <button
                            onClick={() => handleForYouRsvp(a.id)}
                            style={{ fontSize: "11px", fontWeight: 500, padding: "3px 10px", borderRadius: 999, background: rsvpedAnnIds.has(a.id) ? "#EFEAE0" : "transparent", color: rsvpedAnnIds.has(a.id) ? "#5A5466" : "#3E1540", border: `1px solid ${rsvpedAnnIds.has(a.id) ? "#E5E0D2" : "#3E1540"}`, cursor: "pointer", flexShrink: 0 }}
                          >
                            {rsvpedAnnIds.has(a.id) ? "Going ✓" : "RSVP"}
                          </button>
                        )}
                      </div>
                      <h4 style={{ margin: "0 0 6px", fontFamily: "var(--font-instrument-serif)", fontWeight: 400, fontSize: "20px", lineHeight: 1.15, color: "#13101A" }}>{a.title}</h4>
                      <p style={{ fontSize: "12px", color: "#5A5466", lineHeight: 1.55, flex: 1 }} className="line-clamp-2">{a.body}</p>
                      <button onClick={onSeeAnnouncements} style={{ marginTop: "14px", fontSize: "11px", color: "#8A8497", cursor: "pointer", background: "none", border: "none", textAlign: "left", padding: 0 }} className="hover:text-[#3E1540] transition-colors">
                        View →
                      </button>
                    </div>
                  ))}
                </div>
                {/* Leader prompt: event has 0 RSVPs */}
                {isLeaderOrAdmin && heroAnn && rsvpCount === 0 && (
                  <div className="mt-3 rounded-xl border border-[#E5E0D2] bg-[#FBF8F2] px-5 py-3 flex items-center gap-3">
                    <Bell className="w-3.5 h-3.5 text-[#8A8497] flex-shrink-0" />
                    <p style={{ fontSize: "12px", color: "#5A5466", margin: 0 }}>
                      No one has RSVPed to <span style={{ fontWeight: 600, color: "#13101A" }}>{heroAnn.title}</span> yet — share the details with your group!
                    </p>
                  </div>
                )}
              </div>
            )}

            {/* Pray with us */}
            {featuredPrayer && (
              <div className="mt-6 rounded-xl border border-[#E5E0D2] bg-[#FBF8F2]" style={{ padding: "22px 28px", display: "grid", gridTemplateColumns: "1fr 2fr 1fr", alignItems: "center", gap: "24px" }}>
                <div>
                  <p style={MONO_STYLE}>Pray with us</p>
                  <p style={{ fontFamily: "var(--font-instrument-serif)", fontSize: "22px", marginTop: "4px", color: "#13101A" }}>This week&apos;s heart</p>
                </div>
                <div style={{ fontFamily: "var(--font-instrument-serif)", fontStyle: "italic", fontSize: "17px", lineHeight: 1.4, color: "#13101A" }}>
                  &ldquo;{featuredPrayer.text}&rdquo;{" "}
                  <span style={{ fontStyle: "normal", fontFamily: "inherit", color: "#8A8497", fontSize: "12px" }}>— {featuredPrayer.name}</span>
                </div>
                <div className="flex justify-end">
                  <span style={{ fontSize: "13px", color: "#8A8497" }}>🙏 Praying</span>
                </div>
              </div>
            )}
          </div>

          {/* ── Mobile content ── */}
          <div className="md:hidden px-5 pb-4">
            <div className="mb-6">
              <p style={{ fontFamily: "var(--font-instrument-serif)", fontSize: "34px", fontWeight: 400, letterSpacing: "-0.02em", color: "#13101A", lineHeight: 1.1, margin: 0 }}>
                Today in<br />{ministryName}
              </p>
              <div className="flex items-center gap-2 mt-2.5">
                <span style={{ fontSize: "11px", color: "#5A5466", background: "#F4F1E8", border: "1px solid #E5E0D2", padding: "3px 10px", borderRadius: 999, fontWeight: 500 }}>
                  {roleBadge}
                </span>
                {eventCount > 0 && (
                  <span style={{ fontSize: "11px", color: "#8A8497" }}>{eventCount} event{eventCount !== 1 ? "s" : ""}</span>
                )}
                {totalUnread > 0 && (
                  <span style={{ fontSize: "11px", color: "#8A8497" }}>{totalUnread} unread</span>
                )}
              </div>
            </div>

            <div className="flex flex-col gap-8">
              {/* Hero event */}
              <section>
                <div className="flex items-center justify-between mb-3">
                  <h2 style={{ fontFamily: "var(--font-instrument-serif)", fontSize: "22px", color: "#13101A", fontWeight: 400, letterSpacing: "-0.01em", lineHeight: 1, margin: 0 }}>
                    Up next
                  </h2>
                  <button onClick={onSeeAnnouncements} className="text-[12px] text-[#8A8497] font-medium flex items-center gap-0.5 hover:text-[#3E1540] transition-colors">
                    See all <ChevronRight className="w-3 h-3" />
                  </button>
                </div>

                {heroAnn ? (
                  <div className="rounded-[22px] bg-[#3E1540] px-6 py-6 text-[#F6F4EF] relative overflow-hidden shadow-[0_2px_8px_rgba(19,16,26,0.08)]">
                    <div className="absolute -top-[90px] -right-[90px] w-[260px] h-[260px] rounded-full bg-[radial-gradient(circle,rgba(246,244,239,0.18)_0%,transparent_70%)]" />
                    <div className="relative">
                      <div className="flex items-center gap-2 mb-3">
                        <span style={{ ...MONO_STYLE, color: "rgba(246,244,239,0.7)" }}>Event</span>
                      </div>
                      <h3 style={{ fontFamily: "var(--font-instrument-serif)", fontSize: "36px", lineHeight: 1, letterSpacing: "-0.02em", color: "#F6F4EF", margin: "0 0 10px" }}>{heroAnn.title}</h3>
                      <p className="text-[13px] leading-relaxed mb-5 line-clamp-3" style={{ color: "rgba(246,244,239,0.75)" }}>{heroAnn.body}</p>
                      <div className="flex items-center gap-4">
                        <button
                          onClick={handleHomeRsvp}
                          disabled={rsvping}
                          className={`font-bold py-3 px-7 rounded-full text-[14px] transition-colors ${userHasRsvped ? "bg-white/20 text-[#F6F4EF] hover:bg-white/30 active:scale-[0.97]" : "bg-[#F6F4EF] text-[#3E1540] hover:bg-white active:scale-[0.97]"}`}
                        >
                          {userHasRsvped ? <span className="flex items-center gap-1.5"><Check className="w-3.5 h-3.5" />Going</span> : "RSVP"}
                        </button>
                        <button onClick={onSeeAnnouncements} className="text-[13px] font-medium transition-colors" style={{ color: "rgba(246,244,239,0.6)" }}>
                          Details
                        </button>
                      </div>
                      {showAttendeeList && (
                        <div className="mt-3 flex flex-wrap gap-1.5">
                          {rsvpAttendees.slice(0, 6).map((a) => (
                            <span key={a.user_id} style={{ fontSize: "11px", color: "rgba(246,244,239,0.75)", background: "rgba(246,244,239,0.12)", border: "1px solid rgba(246,244,239,0.2)", padding: "2px 9px", borderRadius: 999 }}>{a.name.split(" ")[0]}</span>
                          ))}
                          {rsvpAttendees.length > 6 && <span style={{ fontSize: "11px", color: "rgba(246,244,239,0.45)", padding: "2px 4px" }}>+{rsvpAttendees.length - 6} more</span>}
                        </div>
                      )}
                    </div>
                  </div>
                ) : (
                  <div className="rounded-[22px] border border-[#E5E0D2] bg-[#FBF8F2] px-6 py-8 flex flex-col items-center gap-2 text-center">
                    <Calendar className="w-7 h-7 text-[#C4C4C4]" />
                    <p style={{ fontSize: "14px", fontWeight: 600, color: "#13101A" }}>No upcoming events</p>
                    <p style={{ fontSize: "12px", color: "#8A8497" }}>Check back when events are posted</p>
                  </div>
                )}
              </section>

              {/* Pastor Pulse card — mobile */}
              {activeQuestion && !hasResponded && !isPastorRole && (
                <section>
                  {pulseSubmitted ? (
                    <div className="rounded-[22px] border border-[#E5E0D2] bg-[#FBF8F2] px-6 py-6 text-center">
                      <p style={{ fontSize: 22, marginBottom: 6 }}>🙏</p>
                      <p style={{ fontSize: 15, fontWeight: 600, color: "#13101A", marginBottom: 4 }}>Thanks for sharing</p>
                      <p style={{ fontSize: 12, color: "#8A8497" }}>Your response was received anonymously.</p>
                    </div>
                  ) : (
                    <div className="rounded-[22px] px-6 py-6" style={{ background: "linear-gradient(135deg, #4A1B4D 0%, #3E1540 100%)", color: "#F6F4EF" }}>
                      <span style={{ fontSize: 10, letterSpacing: "0.8px", textTransform: "uppercase", fontWeight: 600, color: "rgba(246,244,239,0.6)", display: "block", marginBottom: 10 }}>
                        Pastor Pulse · {activeQuestion.question_type === "poll" ? "Poll" : activeQuestion.question_type === "scale" ? "1–5 Scale" : activeQuestion.question_type === "prayer" ? "Prayer" : "Open"}
                      </span>
                      <p style={{ fontFamily: "var(--font-instrument-serif)", fontSize: 22, lineHeight: 1.2, marginBottom: 16, color: "#F6F4EF" }}>{activeQuestion.question_text}</p>

                      {activeQuestion.question_type === "poll" && activeQuestion.options && (
                        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                          {activeQuestion.options.map((opt) => (
                            <button
                              key={opt}
                              onClick={() => setPulseOption(opt)}
                              style={{ padding: "10px 14px", borderRadius: 10, border: `1.5px solid ${pulseOption === opt ? "#F6F4EF" : "rgba(246,244,239,0.25)"}`, background: pulseOption === opt ? "rgba(246,244,239,0.15)" : "transparent", color: "#F6F4EF", fontSize: 14, fontWeight: pulseOption === opt ? 600 : 400, cursor: "pointer", textAlign: "left" }}
                            >{opt}</button>
                          ))}
                        </div>
                      )}

                      {activeQuestion.question_type === "scale" && (
                        <div style={{ display: "flex", gap: 8 }}>
                          {[1, 2, 3, 4, 5].map((n) => (
                            <button
                              key={n}
                              onClick={() => setPulseScale(n)}
                              style={{ flex: 1, aspectRatio: "1", borderRadius: 10, border: `1.5px solid ${pulseScale === n ? "#F6F4EF" : "rgba(246,244,239,0.25)"}`, background: pulseScale === n ? "rgba(246,244,239,0.2)" : "transparent", color: "#F6F4EF", fontSize: 16, fontWeight: 600, cursor: "pointer" }}
                            >{n}</button>
                          ))}
                        </div>
                      )}

                      {(activeQuestion.question_type === "open" || activeQuestion.question_type === "prayer") && (
                        <textarea
                          value={pulseInput}
                          onChange={e => setPulseInput(e.target.value)}
                          placeholder={activeQuestion.question_type === "prayer" ? "Share your prayer request…" : "Share your thoughts…"}
                          rows={3}
                          style={{ width: "100%", padding: "10px 12px", borderRadius: 10, border: "1.5px solid rgba(246,244,239,0.25)", background: "rgba(246,244,239,0.1)", color: "#F6F4EF", fontSize: 14, fontFamily: "var(--font-inter)", resize: "none", boxSizing: "border-box", outline: "none" }}
                        />
                      )}

                      <button
                        onClick={handlePulseSubmit}
                        disabled={pulseSubmitting || (activeQuestion.question_type === "poll" && !pulseOption) || (activeQuestion.question_type === "scale" && !pulseScale) || ((activeQuestion.question_type === "open" || activeQuestion.question_type === "prayer") && !pulseInput.trim())}
                        style={{ marginTop: 14, width: "100%", padding: "12px 0", borderRadius: 10, background: "#F6F4EF", color: "#3E1540", fontSize: 14, fontWeight: 700, border: "none", cursor: "pointer", fontFamily: "var(--font-inter)", opacity: pulseSubmitting ? 0.6 : 1 }}
                      >
                        {pulseSubmitting ? "Submitting…" : "Submit anonymously"}
                      </button>
                    </div>
                  )}
                </section>
              )}

              {/* For You - mobile */}
              {forYouItems.length > 0 && (
                <section>
                  <div className="flex items-center justify-between mb-3">
                    <h2 style={{ fontFamily: "var(--font-instrument-serif)", fontSize: "22px", color: "#13101A", fontWeight: 400, letterSpacing: "-0.01em", lineHeight: 1, margin: 0 }}>
                      For you
                    </h2>
                    <button onClick={onSeeAnnouncements} className="text-[12px] text-[#8A8497] font-medium flex items-center gap-0.5 hover:text-[#3E1540] transition-colors">
                      See all <ChevronRight className="w-3 h-3" />
                    </button>
                  </div>
                  <div className="flex flex-col gap-3">
                    {forYouItems.map((a) => (
                      <div key={a.id} className="rounded-2xl bg-white border border-[#E5E0D2] px-4 py-4 shadow-[0_1px_4px_rgba(19,16,26,0.04)] hover:bg-[#F7F4EF] transition-colors duration-150">
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex-1 min-w-0">
                            <span style={{ fontSize: "10px", letterSpacing: "0.8px", color: "#8A8497", textTransform: "uppercase", fontWeight: 500 }}>
                              {a.is_pinned ? "📌 Pinned" : a.is_event ? "Event" : "Post"}
                            </span>
                            <h4 style={{ margin: "4px 0 0", fontFamily: "var(--font-instrument-serif)", fontWeight: 400, fontSize: "18px", lineHeight: 1.2, color: "#13101A" }} className="line-clamp-1">{a.title}</h4>
                          </div>
                          {a.is_event ? (
                            <button
                              onClick={() => handleForYouRsvp(a.id)}
                              style={{ fontSize: "12px", fontWeight: 500, padding: "5px 12px", borderRadius: 999, flexShrink: 0, background: rsvpedAnnIds.has(a.id) ? "#EFEAE0" : "#3E1540", color: rsvpedAnnIds.has(a.id) ? "#5A5466" : "#F6F4EF", border: "none", cursor: "pointer" }}
                            >
                              {rsvpedAnnIds.has(a.id) ? "Going" : "RSVP"}
                            </button>
                          ) : (
                            <button onClick={onSeeAnnouncements} style={{ fontSize: "12px", color: "#8A8497", background: "none", border: "none", cursor: "pointer", flexShrink: 0 }}>View →</button>
                          )}
                        </div>
                        {!a.is_event && (
                          <p style={{ marginTop: "6px", fontSize: "12px", color: "#5A5466", lineHeight: 1.5 }} className="line-clamp-2">{a.body}</p>
                        )}
                      </div>
                    ))}
                  </div>
                </section>
              )}

              {/* Chats */}
              {top3.length > 0 && (
                <ChatsSection chats={top3} totalUnread={totalUnread} onSeeAll={onSeeChats} onOpenChat={onOpenChat} />
              )}
            </div>
          </div>
        </>
      )}
    </div>
  )
}
