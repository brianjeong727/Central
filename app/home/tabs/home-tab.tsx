"use client"

import { useState, useEffect } from "react"
import { ChevronRight, Bell, Check, MessageCircle } from "lucide-react"
import { createClient } from "@/lib/supabase"
import { ChatsSection } from "@/components/ui/chats-section"
import { Spinner, EmptyState, RingCrossLogo, MONO_STYLE } from "../components/shared"
import { getInitials } from "../utils"
import { DesktopTopbar } from "../components/desktop-nav"
import type { HomeTabProps, Announcement } from "../types"

export { HomeTabProps }

export function HomeTab({ profile, userRole, ministryId, ministryName, recentChats, onSeeChats, onSeeAnnouncements, onOpenChat, onGoToProfile, avatarUrl }: HomeTabProps) {
  const supabase = createClient()
  const [announcement, setAnnouncement] = useState<Announcement | null>(null)
  const [moreAnnouncements, setMoreAnnouncements] = useState<Announcement[]>([])
  const [featuredPrayer, setFeaturedPrayer] = useState<{ name: string; text: string } | null>(null)
  const [loading, setLoading] = useState(true)
  const [userHasRsvped, setUserHasRsvped] = useState(false)
  const [rsvping, setRsvping] = useState(false)
  const [rsvpCount, setRsvpCount] = useState(0)
  const [rsvpAttendees, setRsvpAttendees] = useState<{ user_id: string; name: string }[]>([])
  const [featuredShowAttendees, setFeaturedShowAttendees] = useState(false)

  const isLeaderOrAdmin = ["leader", "admin"].includes(userRole.toLowerCase())

  useEffect(() => {
    async function load() {
      const { data: anns } = await supabase
        .from("announcements")
        .select("*")
        .eq("ministry_id", ministryId)
        .order("is_pinned", { ascending: false })
        .order("created_at", { ascending: false })
        .limit(4)
      const list = anns ?? []
      if (list.length > 0) {
        setAnnouncement(list[0])
        setMoreAnnouncements(list.slice(1))
        const first = list[0]
        setFeaturedShowAttendees(first.show_attendees ?? false)
        if (first.is_event) {
          const { data: rsvpRows } = await supabase
            .from("rsvps")
            .select("user_id")
            .eq("announcement_id", first.id)
          const rows = rsvpRows ?? []
          setRsvpCount(rows.length)
          setUserHasRsvped(rows.some((r) => r.user_id === profile.id))
          // Fetch names for attendees
          const ids = rows.map((r) => r.user_id)
          if (ids.length > 0) {
            const { data: profileRows } = await supabase
              .from("profiles").select("id, name").in("id", ids).eq("ministry_id", ministryId)
            setRsvpAttendees((profileRows ?? []).map((p) => ({ user_id: p.id, name: p.name })))
          }
        }
      }
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
    if (!announcement || rsvping) return
    setRsvping(true)
    if (userHasRsvped) {
      setUserHasRsvped(false)
      setRsvpCount((c) => Math.max(0, c - 1))
      setRsvpAttendees((prev) => prev.filter((a) => a.user_id !== profile.id))
      await supabase.from("rsvps").delete().eq("announcement_id", announcement.id).eq("user_id", profile.id)
    } else {
      setUserHasRsvped(true)
      setRsvpCount((c) => c + 1)
      setRsvpAttendees((prev) => [...prev, { user_id: profile.id, name: profile.name }])
      await supabase.from("rsvps").upsert(
        { announcement_id: announcement.id, user_id: profile.id },
        { onConflict: "announcement_id,user_id" }
      )
    }
    setRsvping(false)
  }

  const showAttendeeList = rsvpAttendees.length > 0 && (isLeaderOrAdmin || featuredShowAttendees)

  const top3 = recentChats.slice(0, 3)
  const totalUnread = top3.reduce((s, c) => s + c.unreadCount, 0)
  const dateLabel = new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })

  return (
    <div className="pb-28 md:pb-0">
      {/* ── Desktop Topbar ── */}
      <DesktopTopbar crumbs={["Central", "Home"]} />

      {/* ── Mobile Header ── */}
      <div className="flex items-center justify-between px-5 pt-14 pb-5 md:hidden">
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

      {loading ? (
        <div className="px-5 md:px-14"><Spinner /></div>
      ) : (
        <>
          {/* ── Desktop Editorial Header ── */}
          <div className="hidden md:flex items-end justify-between px-14 pt-11 pb-8 border-b border-[#E5E0D2]" style={{ gap: "24px" }}>
            <div style={{ maxWidth: "640px" }}>
              <p style={MONO_STYLE}>{dateLabel}</p>
              <h1 style={{ margin: "14px 0 0", fontFamily: "var(--font-instrument-serif)", fontWeight: 400, fontSize: "52px", lineHeight: 1.05, color: "#13101A", letterSpacing: "-0.01em" }}>
                {ministryName}
              </h1>
              <p style={{ marginTop: "12px", color: "#5A5466", fontSize: "14px" }}>
                {totalUnread > 0 ? `${totalUnread} unread message${totalUnread !== 1 ? "s" : ""} waiting for you.` : "You're all caught up."}
              </p>
            </div>
            <div className="flex gap-6 pb-1.5">
              {[
                { label: "Unread", value: String(totalUnread) },
                { label: "Going", value: String(moreAnnouncements.filter(a => a.is_event).length + (announcement?.is_event && userHasRsvped ? 1 : 0)) },
                { label: "In ministry", value: "—" },
              ].map(({ label, value }) => (
                <div key={label}>
                  <p style={MONO_STYLE}>{label}</p>
                  <p style={{ fontFamily: "var(--font-instrument-serif)", fontSize: "28px", marginTop: "2px", fontVariantNumeric: "tabular-nums", color: "#13101A" }}>{value}</p>
                </div>
              ))}
            </div>
          </div>

          {/* ── Desktop Content Grid ── */}
          <div className="hidden md:block px-14 py-7">
            {/* Hero + chats row */}
            <div className="grid gap-5" style={{ gridTemplateColumns: "1.4fr 1fr" }}>
              {/* Hero announcement */}
              {announcement ? (
                <div
                  className="relative overflow-hidden rounded-2xl text-[#F6F4EF] flex flex-col"
                  style={{
                    background: "linear-gradient(135deg, #4A1B4D 0%, #3E1540 60%, #1A0820 100%)",
                    padding: "32px 32px 24px",
                    minHeight: "320px",
                  }}
                >
                  <div className="absolute rounded-full pointer-events-none" style={{ top: -120, right: -100, width: 380, height: 380, background: "radial-gradient(circle, rgba(201,163,75,0.18), transparent 60%)" }} />
                  <div className="absolute inset-0 pointer-events-none" style={{ opacity: 0.07, backgroundImage: "radial-gradient(circle, white 1px, transparent 1px)", backgroundSize: "16px 16px" }} />
                  <div className="relative flex justify-between items-start" style={{ fontSize: "11px" }}>
                    <span style={{ ...MONO_STYLE, color: "rgba(246,244,239,0.7)" }}>{announcement.is_event ? "Up next" : "Latest"}</span>
                    {announcement.is_event && (
                      <span style={{ fontSize: "10px", letterSpacing: "0.8px", padding: "3px 9px", borderRadius: 999, background: "rgba(255,255,255,0.15)", color: "#F6F4EF", textTransform: "uppercase", fontWeight: 500 }}>
                        Event
                      </span>
                    )}
                  </div>
                  <h2 className="relative" style={{ margin: "28px 0 0", fontFamily: "var(--font-instrument-serif)", fontWeight: 400, fontSize: "52px", lineHeight: 0.98, letterSpacing: "-0.01em" }}>
                    {announcement.title}
                  </h2>
                  <p className="relative mt-2.5 text-[13px] leading-relaxed line-clamp-3" style={{ opacity: 0.78, maxWidth: "420px" }}>
                    {announcement.body}
                  </p>
                  <div className="relative mt-auto pt-9">
                    <div className="flex items-center gap-3">
                      {announcement.is_event && (
                        <button
                          onClick={handleHomeRsvp}
                          disabled={rsvping}
                          style={{
                            background: userHasRsvped ? "rgba(255,255,255,0.15)" : "#F6F4EF",
                            color: userHasRsvped ? "#F6F4EF" : "#13101A",
                            border: 0, padding: "9px 18px", borderRadius: "8px",
                            fontWeight: 500, fontSize: "13px", cursor: "pointer",
                          }}
                        >
                          {userHasRsvped ? "Going ✓" : "RSVP"}
                        </button>
                      )}
                      <button
                        onClick={onSeeAnnouncements}
                        style={{
                          background: "rgba(255,255,255,0.08)", color: "#F6F4EF",
                          border: "1px solid rgba(255,255,255,0.18)", padding: "9px 18px",
                          borderRadius: "8px", fontSize: "13px", cursor: "pointer",
                        }}
                      >
                        Details
                      </button>
                      {announcement.is_event && rsvpCount > 0 && (
                        <span style={{ fontSize: "12px", color: "rgba(246,244,239,0.5)", fontWeight: 500 }}>{rsvpCount} going</span>
                      )}
                    </div>
                    {announcement.is_event && showAttendeeList && (
                      <div style={{ marginTop: 12, display: "flex", flexWrap: "wrap", gap: 6 }}>
                        {rsvpAttendees.slice(0, 8).map((a) => (
                          <span key={a.user_id} style={{ fontSize: "11px", color: "rgba(246,244,239,0.75)", background: "rgba(246,244,239,0.12)", border: "1px solid rgba(246,244,239,0.2)", padding: "2px 9px", borderRadius: 999 }}>{a.name.split(" ")[0]}</span>
                        ))}
                        {rsvpAttendees.length > 8 && (
                          <span style={{ fontSize: "11px", color: "rgba(246,244,239,0.45)", padding: "2px 4px" }}>+{rsvpAttendees.length - 8} more</span>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              ) : (
                <div className="rounded-2xl border border-[#E5E0D2] bg-[#FBF8F2] flex items-center justify-center" style={{ minHeight: "320px" }}>
                  <EmptyState icon={<Bell className="w-7 h-7" />} title="No announcements yet" subtitle="Check back soon" />
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
                    <EmptyState icon={<MessageCircle className="w-6 h-6" />} title="No chats yet" subtitle="Start a conversation" />
                  </div>
                ) : (
                  top3.map((c, i) => (
                    <button
                      key={c.id}
                      onClick={() => onOpenChat(c.id, c.groupName)}
                      className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-[#F4F1E8] transition-colors"
                      style={{ borderTop: i ? "1px solid #EFEAE0" : undefined }}
                    >
                      <div style={{
                        width: 32, height: 32, borderRadius: 8, flexShrink: 0,
                        background: i % 2 === 0 ? "#3E1540" : "#13101A",
                        color: "#F6F4EF", display: "grid", placeItems: "center",
                        fontSize: "11px", fontWeight: 600,
                      }}>
                        {c.initials}
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div className="flex justify-between gap-2 items-baseline">
                          <span style={{ fontSize: "13px", fontWeight: c.unreadCount ? 600 : 500 }}>{c.groupName}</span>
                          {c.time && <span style={{ fontSize: "10px", color: "#8A8497", flexShrink: 0 }}>{c.time}</span>}
                        </div>
                        {c.lastMessage && (
                          <p style={{ fontSize: "12px", color: "#5A5466", marginTop: "1px", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                            {c.lastMessage}
                          </p>
                        )}
                      </div>
                      {c.unreadCount > 0 && (
                        <span style={{ background: "#C9A34B", color: "#13101A", fontSize: "10px", fontWeight: 700, padding: "2px 7px", borderRadius: 999 }}>{c.unreadCount}</span>
                      )}
                    </button>
                  ))
                )}
                <button
                  onClick={onSeeChats}
                  className="px-4 py-3 mt-auto border-t border-[#E5E0D2] text-[12px] text-[#8A8497] hover:text-[#13101A] text-left transition-colors"
                >
                  See all chats →
                </button>
              </div>
            </div>

            {/* 3-col announcement cards */}
            {moreAnnouncements.length > 0 && (
              <div className="mt-7 grid gap-4" style={{ gridTemplateColumns: "repeat(3, 1fr)" }}>
                {moreAnnouncements.slice(0, 3).map((a) => (
                  <button
                    key={a.id}
                    onClick={onSeeAnnouncements}
                    className="text-left rounded-xl border border-[#E5E0D2] bg-[#FBF8F2] p-4 hover:bg-[#F4F1E8] transition-colors"
                  >
                    <p style={MONO_STYLE}>{a.is_event ? "Event" : "Announcement"}</p>
                    <h4 style={{ margin: "10px 0 0", fontFamily: "var(--font-instrument-serif)", fontWeight: 400, fontSize: "20px", lineHeight: 1.15, color: "#13101A" }}>{a.title}</h4>
                    <p style={{ marginTop: "8px", fontSize: "12px", color: "#5A5466", lineHeight: 1.5 }} className="line-clamp-2">{a.body}</p>
                    <div style={{ marginTop: "14px", paddingTop: "10px", borderTop: "1px solid #EFEAE0", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                      <span style={{ fontSize: "11px", color: "#8A8497" }}>{a.is_event ? "Event" : "Post"}</span>
                      <span style={{ fontSize: "11px", color: "#8A8497" }}>View →</span>
                    </div>
                  </button>
                ))}
              </div>
            )}

            {/* Pray with us strip */}
            {featuredPrayer && (
              <div
                className="mt-6 rounded-xl border border-[#E5E0D2] bg-[#FBF8F2]"
                style={{ padding: "22px 28px", display: "grid", gridTemplateColumns: "1fr 2fr 1fr", alignItems: "center", gap: "24px" }}
              >
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

          {/* ── Mobile Content ── */}
          <div className="md:hidden px-5 pb-4">
            <div className="flex flex-col gap-8">
              <section>
                <div className="flex items-center justify-between mb-3">
                  <h2 style={{ fontFamily: "var(--font-instrument-serif)", fontSize: "22px", color: "#13101A", fontWeight: 400, letterSpacing: "-0.01em", lineHeight: 1 }}>
                    Latest announcement
                  </h2>
                  <button onClick={onSeeAnnouncements} className="text-[12px] text-[#8A8497] font-medium flex items-center gap-0.5 hover:text-[#3E1540] transition-colors">
                    See all <ChevronRight className="w-3 h-3" />
                  </button>
                </div>
                {announcement ? (
                  <div className="rounded-[22px] bg-[#3E1540] px-6 py-6 text-[#F6F4EF] relative overflow-hidden shadow-[0_2px_8px_rgba(19,16,26,0.08)]">
                    <div className="absolute -top-[90px] -right-[90px] w-[260px] h-[260px] rounded-full bg-[radial-gradient(circle,rgba(201,163,75,0.33)_0%,transparent_70%)]" />
                    <div className="relative">
                      <div className="flex items-center gap-2 mb-3">
                        <span style={{ ...MONO_STYLE, color: "rgba(246,244,239,0.7)" }}>{announcement.is_event ? "Up Next" : "Latest"}</span>
                        {announcement.is_event && (
                          <span style={{ fontSize: "10px", letterSpacing: "0.6px", padding: "2px 8px", borderRadius: 999, background: "rgba(255,255,255,0.15)", color: "#F6F4EF", textTransform: "uppercase", fontWeight: 500 }}>
                            Event
                          </span>
                        )}
                      </div>
                      <h3 style={{ fontFamily: "var(--font-instrument-serif)", fontSize: "36px", lineHeight: 1, letterSpacing: "-0.02em", color: "#F6F4EF", margin: "0 0 10px" }}>{announcement.title}</h3>
                      <p className="text-[13px] leading-relaxed mb-5 line-clamp-3" style={{ color: "rgba(246,244,239,0.75)" }}>{announcement.body}</p>
                      <div className="flex items-center gap-4">
                        {announcement.is_event && (
                          <button
                            onClick={handleHomeRsvp}
                            disabled={rsvping}
                            className={`font-bold py-3 px-7 rounded-full text-[14px] transition-colors ${userHasRsvped ? "bg-white/20 text-[#F6F4EF] hover:bg-white/30 active:scale-[0.98]" : "bg-[#F6F4EF] text-[#3E1540] hover:bg-white active:scale-[0.98]"}`}
                          >
                            {userHasRsvped ? <span className="flex items-center gap-1.5"><Check className="w-3.5 h-3.5" />Going</span> : "RSVP"}
                          </button>
                        )}
                        <button onClick={onSeeAnnouncements} className="text-[13px] font-medium transition-colors" style={{ color: "rgba(246,244,239,0.6)" }}>
                          {announcement.is_event ? "Details" : "View details →"}
                        </button>
                      </div>
                      {announcement.is_event && showAttendeeList && (
                        <div className="mt-3 flex flex-wrap gap-1.5">
                          {rsvpAttendees.slice(0, 6).map((a) => (
                            <span key={a.user_id} style={{ fontSize: "11px", color: "rgba(246,244,239,0.75)", background: "rgba(246,244,239,0.12)", border: "1px solid rgba(246,244,239,0.2)", padding: "2px 9px", borderRadius: 999 }}>{a.name.split(" ")[0]}</span>
                          ))}
                          {rsvpAttendees.length > 6 && (
                            <span style={{ fontSize: "11px", color: "rgba(246,244,239,0.45)", padding: "2px 4px" }}>+{rsvpAttendees.length - 6} more</span>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                ) : (
                  <div className="rounded-[22px] bg-[#3E1540] px-6 py-8 text-center text-[13px] italic" style={{ color: "rgba(246,244,239,0.5)" }}>No announcements yet</div>
                )}
              </section>

              <div>
                {top3.length > 0 ? (
                  <ChatsSection chats={top3} totalUnread={totalUnread} onSeeAll={onSeeChats} onOpenChat={onOpenChat} />
                ) : null}
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
