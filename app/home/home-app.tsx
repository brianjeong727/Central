"use client"

import { useState, useEffect, useCallback, useRef, useMemo } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import {
  Search, Calendar, ChevronRight, ChevronDown, ChevronLeft, Edit3, Check, X,
  LogOut, Bell, Users, Plus, ImageIcon, CheckCircle2, ArrowLeft, Send, Settings,
  MoreHorizontal, Trash2, CornerUpLeft, ClipboardList, Camera, Home, MessageCircle, User,
  List, Grid3x3, BookOpen,
} from "lucide-react"
import { createClient } from "@/lib/supabase"
import { createGroup } from "@/app/actions/create-group"
import { BottomNav } from "@/components/ui/bottom-nav"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { ChatsSection, type ChatPreview } from "@/components/ui/chats-section"

// ─── Types ─────────────────────────────────────────────────────────────────

type Tab = "home" | "announcements" | "chats" | "plan" | "directory" | "profile"

interface Profile {
  id: string
  name: string
  email: string
  graduation_year: number | null
  role: string
  about_me: string | null
  bible_verse: string | null
  prayer_request: string | null
  pray_for_me: string | null
  ministry_id?: string | null
  avatar_url?: string | null
}

interface Devotional {
  id: string
  user_id: string
  ministry_id: string
  title: string
  passage: string
  content: string
  image_url: string | null
  created_at: string
}

type PrayerStatus = 'praying' | 'answered' | 'ongoing'

interface Prayer {
  id: string
  user_id: string
  ministry_id: string
  title: string
  content: string
  status: PrayerStatus
  created_at: string
}

interface Verse {
  id: string
  user_id: string
  ministry_id: string
  reference: string
  verse_text: string
  note: string
  created_at: string
}

interface Announcement {
  id: string
  title: string
  body: string
  created_at: string
  is_pinned: boolean
  is_event: boolean
  image_url: string | null
  audience: string | null
  created_by: string | null
}

interface EnrichedAnnouncement extends Announcement {
  view_count: number
  rsvp_count: number
  user_has_rsvped: boolean
}

interface ChatGroup {
  id: string
  name: string
  type: string
  last_message: string | null
  last_sender: string | null
  last_message_time: string | null
  unread_count: number
  archived?: boolean
}

interface GroupMember {
  user_id: string
  name: string
  role: string
  graduation_year: number | null
}

interface Message {
  id: string
  group_id: string
  sender_id: string
  content: string
  created_at: string
  sender_name: string
  reply_to_id: string | null
  reply_to_content: string | null
  reply_to_sender: string | null
  deleted?: boolean
}

interface Reaction {
  id: string
  message_id: string
  user_id: string
  emoji: string
}

const REACTION_EMOJIS = ["👍", "❤️", "😂", "🙏", "🔥", "😮"]

// ─── Helpers ────────────────────────────────────────────────────────────────

const AVATAR_COLORS = [
  "bg-[#3E1540]",
  "bg-[#13101A]",
]

function getAvatarColor(str: string): string {
  const sum = str.split("").reduce((acc, c) => acc + c.charCodeAt(0), 0)
  return AVATAR_COLORS[sum % AVATAR_COLORS.length]
}

function getInitials(name: string): string {
  return name
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2)
}

function formatRelativeTime(dateStr: string): string {
  const date = new Date(dateStr)
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffMins = Math.floor(diffMs / 60000)
  const diffHours = Math.floor(diffMs / 3600000)
  const diffDays = Math.floor(diffMs / 86400000)
  if (diffMins < 1) return "now"
  if (diffMins < 60) return `${diffMins}m`
  if (diffHours < 24) return `${diffHours}h`
  if (diffDays < 7) return `${diffDays}d`
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric" })
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
  })
}

function getGreeting(): string {
  const h = new Date().getHours()
  if (h < 12) return "Good morning"
  if (h < 18) return "Good afternoon"
  return "Good evening"
}

function formatMessageTime(dateStr: string): string {
  return new Date(dateStr).toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  })
}

function audienceLabel(audience: string | null): string {
  if (!audience || audience === "all") return "Everyone"
  if (audience.match(/^\d{4}$/)) return `Class of ${audience}`
  if (audience === "group") return "Specific Group"
  return audience
}

// ─── Shared Components ──────────────────────────────────────────────────────

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <span className="text-[11px] font-semibold tracking-[0.15em] uppercase text-[#8A8497]">{children}</span>
  )
}

function Spinner() {
  return (
    <div className="flex items-center justify-center py-12">
      <div className="w-6 h-6 rounded-full border-2 border-[#3E1540]/20 border-t-[#3E1540] animate-spin" />
    </div>
  )
}

function EmptyState({
  icon,
  title,
  subtitle,
}: {
  icon: React.ReactNode
  title: string
  subtitle: string
}) {
  return (
    <div className="flex flex-col items-center justify-center py-16 gap-3 text-center">
      <div className="w-14 h-14 rounded-2xl bg-[#FBF8F2] border border-[#ECE8DE] flex items-center justify-center text-[#8A8497]">
        {icon}
      </div>
      <div>
        <p className="text-[14px] font-semibold text-[#13101A]/60">{title}</p>
        <p className="text-[13px] text-[#5A5466]/50 mt-0.5">{subtitle}</p>
      </div>
    </div>
  )
}

// ─── Home Tab ───────────────────────────────────────────────────────────────

interface HomeTabProps {
  profile: Profile
  ministryId: string
  ministryName: string
  recentChats: ChatPreview[]
  onSeeChats: () => void
  onSeeAnnouncements: () => void
  onOpenChat: (id: string, name: string) => void
  onGoToProfile: () => void
  avatarUrl?: string | null
}

function HomeTab({ profile, ministryId, ministryName, recentChats, onSeeChats, onSeeAnnouncements, onOpenChat, onGoToProfile, avatarUrl }: HomeTabProps) {
  const supabase = createClient()
  const [announcement, setAnnouncement] = useState<Announcement | null>(null)
  const [moreAnnouncements, setMoreAnnouncements] = useState<Announcement[]>([])
  const [featuredPrayer, setFeaturedPrayer] = useState<{ name: string; text: string } | null>(null)
  const [loading, setLoading] = useState(true)
  const [userHasRsvped, setUserHasRsvped] = useState(false)
  const [rsvping, setRsvping] = useState(false)

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
        if (first.is_event) {
          const { data: rsvpData } = await supabase
            .from("rsvps")
            .select("announcement_id")
            .eq("announcement_id", first.id)
            .eq("user_id", profile.id)
            .maybeSingle()
          setUserHasRsvped(!!rsvpData)
        }
      }
      // Fetch a featured prayer from the community
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
    if (!announcement || userHasRsvped || rsvping) return
    setRsvping(true)
    setUserHasRsvped(true)
    await supabase.from("rsvps").upsert(
      { announcement_id: announcement.id, user_id: profile.id },
      { onConflict: "announcement_id,user_id" }
    )
    setRsvping(false)
  }

  const top3 = recentChats.slice(0, 3)
  const totalUnread = top3.reduce((s, c) => s + c.unreadCount, 0)
  const firstName = profile.name.split(" ")[0]
  const dateLabel = new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })

  const monoStyle: React.CSSProperties = {
    fontFamily: "ui-monospace, 'SF Mono', Menlo, monospace",
    fontSize: "11px",
    letterSpacing: "0.04em",
    textTransform: "uppercase",
    color: "#8A8497",
  }

  return (
    <div className="pb-2 md:pb-0">
      {/* ── Desktop Topbar ── */}
      <DesktopTopbar crumbs={["Central", "Home"]} />

      {/* ── Mobile Header ── */}
      <div className="flex items-center justify-between px-5 pt-14 pb-5 md:hidden">
        <div className="flex items-center gap-2.5">
          <svg width="26" height="26" viewBox="0 0 100 100" fill="none">
            <circle cx="50" cy="50" r="44" stroke="#3E1540" strokeWidth="6" />
            <rect x="47" y="22" width="6" height="56" fill="#3E1540" />
            <rect x="22" y="47" width="56" height="6" fill="#3E1540" />
          </svg>
          <span style={{ fontFamily: "var(--font-instrument-serif)", fontSize: "28px", color: "#13101A", letterSpacing: "-0.01em", lineHeight: 1 }}>{ministryName}</span>
        </div>
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
              <p style={monoStyle}>{dateLabel}</p>
              <h1 style={{ margin: "14px 0 0", fontFamily: "var(--font-instrument-serif)", fontWeight: 400, fontSize: "52px", lineHeight: 1.05, color: "#13101A", letterSpacing: "-0.01em" }}>
                {getGreeting()}, {firstName}.
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
                  <p style={monoStyle}>{label}</p>
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
                    <span style={{ ...monoStyle, color: "rgba(246,244,239,0.7)" }}>{announcement.is_event ? "Up next" : "Latest"}</span>
                  </div>
                  <h2 className="relative" style={{ margin: "28px 0 0", fontFamily: "var(--font-instrument-serif)", fontWeight: 400, fontSize: "52px", lineHeight: 0.98, letterSpacing: "-0.01em" }}>
                    {announcement.title}
                  </h2>
                  <p className="relative mt-2.5 text-[13px] leading-relaxed line-clamp-3" style={{ opacity: 0.78, maxWidth: "420px" }}>
                    {announcement.body}
                  </p>
                  <div className="relative mt-auto pt-9 flex items-center gap-3">
                    {announcement.is_event && (
                      <button
                        onClick={handleHomeRsvp}
                        disabled={userHasRsvped || rsvping}
                        style={{
                          background: userHasRsvped ? "rgba(255,255,255,0.15)" : "#F6F4EF",
                          color: userHasRsvped ? "#F6F4EF" : "#13101A",
                          border: 0, padding: "9px 18px", borderRadius: "8px",
                          fontWeight: 500, fontSize: "13px", cursor: userHasRsvped ? "default" : "pointer",
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
                  </div>
                </div>
              ) : (
                <div className="rounded-2xl border border-[#E5E0D2] bg-[#FBF8F2] flex items-center justify-center" style={{ minHeight: "320px" }}>
                  <div className="text-center">
                    <Bell className="w-8 h-8 text-[#C4C4C4] mx-auto mb-3" />
                    <p className="text-[14px] font-semibold text-[#13101A]/50">No announcements yet</p>
                  </div>
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
                    <p className="text-[13px] text-[#8A8497]">No recent chats</p>
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
                    <p style={monoStyle}>{a.is_event ? "Event" : "Announcement"}</p>
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
                  <p style={monoStyle}>Pray with us</p>
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
                        <span className="text-[10px] font-bold tracking-[.22em] uppercase text-[#9E85A0]">{announcement.is_event ? "Up Next" : "Latest"}</span>
                        {announcement.is_event && <span className="px-2 py-0.5 bg-[#C9A34B] text-[#13101A] rounded-full text-[9px] font-bold tracking-[.14em] uppercase">Event</span>}
                      </div>
                      <h3 style={{ fontFamily: "var(--font-instrument-serif)", fontSize: "36px", lineHeight: 1, letterSpacing: "-0.02em", color: "#F6F4EF", margin: "0 0 10px" }}>{announcement.title}</h3>
                      <p className="text-[13px] text-[#CFB8D1] leading-relaxed mb-5 line-clamp-3">{announcement.body}</p>
                      <div className="flex items-center gap-4">
                        {announcement.is_event && (
                          <button
                            onClick={handleHomeRsvp}
                            disabled={userHasRsvped || rsvping}
                            className={`font-bold py-3 px-7 rounded-full text-[14px] transition-colors ${userHasRsvped ? "bg-white/20 text-[#F6F4EF] cursor-default" : "bg-[#F6F4EF] text-[#3E1540] hover:bg-white"}`}
                          >
                            {userHasRsvped ? <span className="flex items-center gap-1.5"><Check className="w-3.5 h-3.5" />You&apos;re going!</span> : "RSVP"}
                          </button>
                        )}
                        <button onClick={onSeeAnnouncements} className="text-[13px] text-[#9E85A0] font-medium hover:text-[#CFB8D1] transition-colors">
                          {announcement.is_event ? "Details" : "View details →"}
                        </button>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="rounded-[22px] bg-[#3E1540] px-6 py-8 text-center text-[13px] text-[#9E85A0] italic">No announcements yet</div>
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

// ─── Create Announcement Modal ───────────────────────────────────────────────

const AUDIENCE_OPTIONS = [
  { value: "all", label: "Everyone" },
  { value: "2025", label: "Class of 2025" },
  { value: "2026", label: "Class of 2026" },
  { value: "2027", label: "Class of 2027" },
  { value: "2028", label: "Class of 2028" },
  { value: "group", label: "Specific Group" },
]

interface CreateAnnouncementModalProps {
  userId: string
  ministryId: string
  existing?: Announcement
  onClose: () => void
  onSuccess: (ann: Announcement) => void
}

function CreateAnnouncementModal({ userId, ministryId, existing, onClose, onSuccess }: CreateAnnouncementModalProps) {
  const supabase = createClient()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const isEditing = !!existing

  const [title, setTitle] = useState(existing?.title ?? "")
  const [body, setBody] = useState(existing?.body ?? "")
  const [audience, setAudience] = useState(existing?.audience ?? "all")
  const [isEvent, setIsEvent] = useState(existing?.is_event ?? false)
  const [imageFile, setImageFile] = useState<File | null>(null)
  const [imagePreview, setImagePreview] = useState<string | null>(existing?.image_url ?? null)
  const [submitting, setSubmitting] = useState(false)
  const [success, setSuccess] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function handleImageChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setImageFile(file)
    setImagePreview(URL.createObjectURL(file))
  }

  function removeImage() {
    setImageFile(null)
    setImagePreview(null)
    if (fileInputRef.current) fileInputRef.current.value = ""
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!title.trim() || !body.trim()) {
      setError("Title and body are required.")
      return
    }

    setSubmitting(true)
    setError(null)

    // Resolve image URL
    let imageUrl: string | null = null
    if (imageFile) {
      // New file picked — upload it
      const ext = imageFile.name.split(".").pop()
      const fileName = `${Date.now()}.${ext}`
      const { data: uploadData, error: uploadError } = await supabase.storage
        .from("announcement-images")
        .upload(fileName, imageFile, { upsert: true })

      if (!uploadError && uploadData) {
        const { data: { publicUrl } } = supabase.storage
          .from("announcement-images")
          .getPublicUrl(uploadData.path)
        imageUrl = publicUrl
      }
    } else if (imagePreview) {
      // No new file but preview is still set — keep existing URL
      imageUrl = imagePreview
    }
    // else imageUrl stays null (removed or never set)

    if (isEditing && existing) {
      const { data, error: updateError } = await supabase
        .from("announcements")
        .update({
          title: title.trim(),
          body: body.trim(),
          audience,
          is_event: isEvent,
          image_url: imageUrl,
        })
        .eq("id", existing.id)
        .select()
        .maybeSingle()

      if (updateError) {
        setError(updateError.message)
        setSubmitting(false)
        return
      }

      setSuccess(true)
      setTimeout(() => {
        // data may be null with maybeSingle(); fall back to merging existing fields
        onSuccess((data ?? { ...existing, title: title.trim(), body: body.trim(), audience, is_event: isEvent, image_url: imageUrl }) as Announcement)
        onClose()
      }, 1000)
    } else {
      const { data, error: insertError } = await supabase
        .from("announcements")
        .insert({
          title: title.trim(),
          body: body.trim(),
          audience,
          is_event: isEvent,
          is_pinned: false,
          image_url: imageUrl,
          created_by: userId,
          ministry_id: ministryId,
        })
        .select()
        .single()

      if (insertError) {
        setError(insertError.message)
        setSubmitting(false)
        return
      }

      setSuccess(true)
      setTimeout(() => {
        onSuccess(data as Announcement)
        onClose()
      }, 1200)
    }
  }

  // Success screen
  if (success) {
    return (
      <div className="fixed inset-0 z-[100] bg-white flex flex-col items-center justify-center gap-4 md:left-[296px]">
        <div className="w-16 h-16 rounded-full bg-[#3E1540]/15 flex items-center justify-center">
          <CheckCircle2 className="w-8 h-8 text-[#3E1540]" />
        </div>
        <div className="text-center">
          <p className="text-[16px] font-bold text-foreground">
            {isEditing ? "Announcement updated!" : "Announcement posted!"}
          </p>
          <p className="text-[13px] text-muted-foreground mt-1">
            {isEditing ? "Your changes have been saved." : "Your announcement is now live."}
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="fixed inset-0 z-[60] bg-white flex flex-col md:bg-black/20 md:backdrop-blur-sm md:items-center md:justify-center">
    <div className="flex flex-col w-full h-full bg-white md:h-auto md:max-h-[88vh] md:max-w-[560px] md:rounded-2xl md:shadow-2xl md:overflow-hidden">

      {/* ── Top nav bar ── */}
      <div className="flex items-center gap-3 px-5 pt-12 pb-4 md:pt-5 border-b border-[#ECE8DE] bg-white flex-shrink-0">
        <button
          onClick={onClose}
          className="w-9 h-9 rounded-full bg-muted/60 flex items-center justify-center hover:bg-muted transition-colors flex-shrink-0"
        >
          <X className="w-4 h-4 text-foreground" />
        </button>
        <h1 className="text-[17px] font-bold text-foreground tracking-tight">
          {isEditing ? "Edit Announcement" : "New Announcement"}
        </h1>
      </div>

      {/* ── Scrollable form fields ── */}
      <div className="flex-1 overflow-y-auto min-h-0">
        <form
          id="ann-form"
          onSubmit={handleSubmit}
          className="px-5 py-6 flex flex-col gap-5"
        >
          {error && (
            <div className="rounded-xl bg-destructive/8 px-4 py-3 text-[13px] text-destructive font-medium">
              {error}
            </div>
          )}

          {/* Title */}
          <div className="flex flex-col gap-1.5">
            <label className="text-[12px] font-medium text-[#8A8497]">Title</label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Announcement title…"
              required
              className="w-full px-4 py-3 rounded-xl border border-[#EFEFEF] bg-[#FBF8F2] text-[14px] text-[#13101A] placeholder:text-[#C4C4C4] focus:outline-none focus:ring-2 focus:ring-[#3E1540]/20 focus:border-[#3E1540]/40 transition-all"
            />
          </div>

          {/* Body */}
          <div className="flex flex-col gap-1.5">
            <label className="text-[12px] font-medium text-[#8A8497]">Body</label>
            <textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder="Write the full announcement here…"
              required
              rows={5}
              className="w-full px-4 py-3 rounded-xl border border-[#EFEFEF] bg-[#FBF8F2] text-[14px] text-[#13101A] placeholder:text-[#C4C4C4] focus:outline-none focus:ring-2 focus:ring-[#3E1540]/20 focus:border-[#3E1540]/40 transition-all resize-none"
            />
          </div>

          {/* Audience */}
          <div className="flex flex-col gap-2.5">
            <label className="text-[12px] font-medium text-[#8A8497]">Audience</label>
            <div className="flex flex-wrap gap-2">
              {AUDIENCE_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setAudience(opt.value)}
                  className={`px-3 py-1.5 rounded-full text-[12px] font-semibold border transition-all ${
                    audience === opt.value
                      ? "bg-[#3E1540] text-white border-[#3E1540]"
                      : "bg-white text-muted-foreground border-[#E5E3F0] hover:border-[#3E1540]/40"
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          {/* Is Event toggle */}
          <div className="flex items-center justify-between bg-[#3E1540]/4 rounded-xl px-4 py-3.5">
            <div>
              <p className="text-[13px] font-semibold text-foreground">This is an event</p>
              <p className="text-[11px] text-muted-foreground/60 mt-0.5">Shows an RSVP button on the card</p>
            </div>
            <button
              type="button"
              onClick={() => setIsEvent((v) => !v)}
              className={`relative w-11 h-6 rounded-full transition-colors duration-200 flex-shrink-0 ${
                isEvent ? "bg-[#3E1540]" : "bg-muted-foreground/20"
              }`}
            >
              <span
                className={`absolute top-0.5 w-5 h-5 rounded-full bg-white shadow-sm transition-all duration-200 ${
                  isEvent ? "left-[22px]" : "left-0.5"
                }`}
              />
            </button>
          </div>

          {/* Image upload */}
          <div className="flex flex-col gap-2">
            <label className="text-[12px] font-medium text-[#8A8497]">
              Image <span className="text-[#C4C4C4]">(optional)</span>
            </label>
            {imagePreview ? (
              <div className="relative rounded-xl overflow-hidden">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={imagePreview} alt="Preview" className="w-full h-44 object-cover" />
                <button
                  type="button"
                  onClick={removeImage}
                  className="absolute top-2 right-2 w-7 h-7 rounded-full bg-black/50 flex items-center justify-center hover:bg-black/70 transition-colors"
                >
                  <X className="w-3.5 h-3.5 text-white" />
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="w-full h-24 rounded-xl border-2 border-dashed border-[#3E1540]/20 flex flex-col items-center justify-center gap-2 text-muted-foreground/50 hover:border-[#3E1540]/40 hover:text-[#3E1540]/60 transition-all"
              >
                <ImageIcon className="w-6 h-6" />
                <span className="text-[12px] font-medium">Tap to add image</span>
              </button>
            )}
            <input ref={fileInputRef} type="file" accept="image/*" onChange={handleImageChange} className="hidden" />
          </div>
        </form>
      </div>

      {/* ── Sticky submit button — always visible at the bottom ── */}
      <div className="bg-white border-t border-[#ECE8DE] px-5 py-4">
        <button
          type="submit"
          form="ann-form"
          disabled={submitting}
          className="w-full bg-[#3E1540] hover:bg-[#2D0F2E] disabled:opacity-60 text-white font-bold py-4 rounded-xl transition-colors text-[14px] tracking-wide"
        >
          {submitting
            ? isEditing ? "Saving…" : "Posting…"
            : isEditing ? "Save Changes" : "Post Announcement"}
        </button>
      </div>

    </div>
    </div>
  )
}

// ─── Announcements Tab ──────────────────────────────────────────────────────

interface AnnouncementsTabProps {
  userId: string
  userRole: string
  userGradYear: number | null
  ministryId: string
  ministryName: string
}

function AnnouncementsTab({ userId, userRole, userGradYear, ministryId, ministryName }: AnnouncementsTabProps) {
  const supabase = createClient()
  const [announcements, setAnnouncements] = useState<EnrichedAnnouncement[]>([])
  const [loading, setLoading] = useState(true)
  const [showCreate, setShowCreate] = useState(false)
  const [editingAnn, setEditingAnn] = useState<EnrichedAnnouncement | null>(null)
  const [compact, setCompact] = useState(false)

  const isLeaderOrAdmin = ["leader", "admin"].includes(userRole.toLowerCase())

  const loadAnnouncements = useCallback(async () => {
    let annQuery = supabase
      .from("announcements")
      .select("*")
      .eq("ministry_id", ministryId)
      .order("is_pinned", { ascending: false })
      .order("created_at", { ascending: false })

    if (!isLeaderOrAdmin) {
      const audienceFilter = userGradYear
        ? `audience.is.null,audience.eq.all,audience.eq.${userGradYear},audience.eq.group`
        : `audience.is.null,audience.eq.all,audience.eq.group`
      annQuery = annQuery.or(audienceFilter)
    }

    const { data: annData } = await annQuery

    const anns: Announcement[] = annData ?? []

    if (anns.length === 0) {
      setAnnouncements([])
      setLoading(false)
      return
    }

    const ids = anns.map((a) => a.id)

    // Fetch view counts, RSVP data in parallel
    const [{ data: viewRows }, { data: rsvpRows }] = await Promise.all([
      supabase.from("announcement_views").select("announcement_id").in("announcement_id", ids),
      supabase.from("rsvps").select("announcement_id, user_id").in("announcement_id", ids),
    ])

    // Record current user's views (upsert — unique on announcement_id + user_id)
    supabase
      .from("announcement_views")
      .upsert(
        ids.map((id) => ({ announcement_id: id, user_id: userId })),
        { onConflict: "announcement_id,user_id" }
      )
      .then() // fire and forget

    // Build lookup maps
    const viewMap: Record<string, number> = {}
    const rsvpCountMap: Record<string, number> = {}
    const userRsvpSet = new Set<string>()

    for (const v of viewRows ?? []) {
      viewMap[v.announcement_id] = (viewMap[v.announcement_id] ?? 0) + 1
    }
    for (const r of rsvpRows ?? []) {
      rsvpCountMap[r.announcement_id] = (rsvpCountMap[r.announcement_id] ?? 0) + 1
      if (r.user_id === userId) userRsvpSet.add(r.announcement_id)
    }

    const enriched: EnrichedAnnouncement[] = anns.map((ann) => ({
      ...ann,
      view_count: viewMap[ann.id] ?? 0,
      rsvp_count: rsvpCountMap[ann.id] ?? 0,
      user_has_rsvped: userRsvpSet.has(ann.id),
    }))

    setAnnouncements(enriched)
    setLoading(false)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId])

  useEffect(() => {
    loadAnnouncements()
  }, [loadAnnouncements])

  function handleRsvpToggle(announcementId: string) {
    setAnnouncements((prev) =>
      prev.map((ann) =>
        ann.id === announcementId
          ? {
              ...ann,
              user_has_rsvped: true,
              rsvp_count: ann.rsvp_count + 1,
            }
          : ann
      )
    )
  }

  function handleNewAnnouncement(newAnn: Announcement) {
    const enriched: EnrichedAnnouncement = {
      ...newAnn,
      view_count: 0,
      rsvp_count: 0,
      user_has_rsvped: false,
    }
    setAnnouncements((prev) => [enriched, ...prev])
  }

  function handleDeleteAnnouncement(id: string) {
    setAnnouncements((prev) => prev.filter((ann) => ann.id !== id))
  }

  async function handleDesktopDelete(ann: EnrichedAnnouncement) {
    const supabase = createClient()
    setAnnouncements((prev) => prev.filter((a) => a.id !== ann.id))
    await supabase.from("announcements").delete().eq("id", ann.id)
  }

  function handleEditSuccess(updated: Announcement) {
    setAnnouncements((prev) =>
      prev.map((ann) =>
        ann.id === updated.id ? { ...ann, ...updated } : ann
      )
    )
  }

  const monoStyle: React.CSSProperties = {
    fontFamily: "ui-monospace, 'SF Mono', Menlo, monospace",
    fontSize: "11px",
    letterSpacing: "0.04em",
    textTransform: "uppercase",
    color: "#8A8497",
  }

  const pinnedAnn = announcements.find(a => a.is_pinned)
  const unpinned = announcements.filter(a => !a.is_pinned)

  return (
    <div className="pb-2 md:pb-0">
      {/* Desktop Topbar */}
      <DesktopTopbar
        crumbs={["Central", "Announcements"]}
        right={isLeaderOrAdmin ? (
          <button
            onClick={() => setShowCreate(true)}
            className="hidden md:flex items-center gap-1.5 px-3.5 py-1.5 bg-[#13101A] hover:bg-[#2D0F2E] text-[#F6F4EF] rounded-lg text-[12px] font-medium transition-colors"
          >
            <Plus className="w-3.5 h-3.5" />
            New announcement
          </button>
        ) : undefined}
      />

      {/* Mobile Header */}
      <div className="flex items-center justify-between px-5 pt-14 pb-5 md:hidden">
        <div className="flex items-center gap-2.5">
          <svg width="26" height="26" viewBox="0 0 100 100" fill="none">
            <circle cx="50" cy="50" r="44" stroke="#3E1540" strokeWidth="6" />
            <rect x="47" y="22" width="6" height="56" fill="#3E1540" />
            <rect x="22" y="47" width="56" height="6" fill="#3E1540" />
          </svg>
          <span style={{ fontFamily: "var(--font-instrument-serif)", fontSize: "28px", color: "#13101A", letterSpacing: "-0.01em", lineHeight: 1 }}>{ministryName}</span>
        </div>
      </div>

      {/* Mobile title */}
      <div className="flex items-end justify-between px-5 mb-6 md:hidden">
        <h1 style={{ fontFamily: "var(--font-instrument-serif)", fontSize: "36px", fontWeight: 400, letterSpacing: "-0.02em", color: "#13101A", lineHeight: 1.05, margin: 0 }}>Announcements</h1>
        {isLeaderOrAdmin && (
          <button onClick={() => setShowCreate(true)} className="size-9 bg-[#3E1540] rounded-xl flex items-center justify-center hover:bg-[#2D0F2E] transition-colors">
            <Plus className="w-4 h-4 text-white" />
          </button>
        )}
      </div>

      {/* Desktop Editorial Header */}
      <div className="hidden md:flex items-end justify-between px-14 pt-11 pb-8 border-b border-[#E5E0D2]" style={{ gap: "24px" }}>
        <div>
          <p style={monoStyle}>{announcements.length} total · {announcements.filter(a => !a.user_has_rsvped && a.is_event).length} unread</p>
          <h1 style={{ margin: "14px 0 0", fontFamily: "var(--font-instrument-serif)", fontWeight: 400, fontSize: "52px", lineHeight: 1.05, letterSpacing: "-0.01em", color: "#13101A" }}>
            Announcements
          </h1>
          <p style={{ marginTop: "12px", color: "#5A5466", fontSize: "14px", maxWidth: "560px" }}>
            What the ministry is planning, praying for, and showing up to.
          </p>
        </div>
        <div className="flex items-center gap-2 pb-1.5">
          {/* Cards/Compact toggle */}
          <div className="flex border border-[#E5E0D2] rounded-lg overflow-hidden">
            <button
              onClick={() => setCompact(false)}
              className="px-3 py-1.5 text-[12px] transition-colors"
              style={{ background: !compact ? "#EFEAE0" : "transparent", fontWeight: !compact ? 500 : 400, border: "none", cursor: "pointer" }}
            >
              Cards
            </button>
            <button
              onClick={() => setCompact(true)}
              className="px-3 py-1.5 text-[12px] transition-colors"
              style={{ background: compact ? "#EFEAE0" : "transparent", fontWeight: compact ? 500 : 400, border: "none", cursor: "pointer" }}
            >
              Compact
            </button>
          </div>
        </div>
      </div>

      {loading ? (
        <div className="px-5 md:px-14"><Spinner /></div>
      ) : announcements.length === 0 ? (
        <div className="px-5 md:px-14">
          <EmptyState
            icon={<Bell className="w-7 h-7" />}
            title="No announcements yet"
            subtitle={isLeaderOrAdmin ? "Nothing announced yet." : "Check back soon for updates"}
          />
        </div>
      ) : (
        <>
          {/* Mobile card list */}
          <div className="md:hidden px-5 pb-4 flex flex-col gap-4">
            {announcements.map((ann, idx) => (
              <AnnouncementCard
                key={ann.id}
                announcement={ann}
                isPinned={ann.is_pinned && idx === 0}
                userId={userId}
                userRole={userRole}
                onRsvpToggle={handleRsvpToggle}
                onEdit={(a) => setEditingAnn(a)}
                onDelete={handleDeleteAnnouncement}
              />
            ))}
          </div>

          {/* Desktop layout */}
          <div className="hidden md:block px-14 py-7">
            {/* Filter chips */}
            <div className="flex gap-2 mb-6">
              {["All", "Events", "Prayer", "Pinned"].map((t, i) => (
                <button key={t} style={{
                  padding: "7px 14px", borderRadius: 999, fontSize: "12px", fontWeight: 500,
                  border: i === 0 ? "1px solid #13101A" : "1px solid #E5E0D2",
                  background: i === 0 ? "#13101A" : "transparent",
                  color: i === 0 ? "#F6F4EF" : "#13101A", cursor: "pointer",
                }}>{t}</button>
              ))}
            </div>

            {/* Pinned hero strip */}
            {pinnedAnn && (
              <div
                className="rounded-xl overflow-hidden mb-6 relative"
                style={{ background: "#3E1540", color: "#F6F4EF", padding: "22px 28px", display: "grid", gridTemplateColumns: "1fr auto", gap: "24px", alignItems: "center" }}
              >
                <div className="absolute rounded-full pointer-events-none" style={{ top: -80, right: 80, width: 280, height: 280, background: "radial-gradient(circle, rgba(201,163,75,0.18), transparent 60%)" }} />
                <div className="relative">
                  <p style={{ fontSize: "11px", letterSpacing: "1px", textTransform: "uppercase", opacity: 0.75, marginBottom: "8px" }}>📌 Pinned</p>
                  <h2 style={{ margin: 0, fontFamily: "var(--font-instrument-serif)", fontWeight: 400, fontSize: "32px", lineHeight: 1.1 }}>{pinnedAnn.title}</h2>
                  <p style={{ marginTop: "6px", fontSize: "13px", opacity: 0.78 }} className="line-clamp-2">{pinnedAnn.body}</p>
                </div>
                <div className="flex gap-2.5 relative items-center">
                  {pinnedAnn.is_event && (
                    <button
                      onClick={() => handleRsvpToggle(pinnedAnn.id)}
                      style={{ background: pinnedAnn.user_has_rsvped ? "rgba(255,255,255,0.15)" : "#F6F4EF", color: pinnedAnn.user_has_rsvped ? "#F6F4EF" : "#13101A", border: 0, padding: "8px 18px", borderRadius: "8px", fontWeight: 500, fontSize: "13px", cursor: "pointer" }}
                    >
                      {pinnedAnn.user_has_rsvped ? "Going ✓" : "RSVP"}
                    </button>
                  )}
                  {isLeaderOrAdmin && (
                    <>
                      <button
                        onClick={() => setEditingAnn(pinnedAnn)}
                        style={{ width: 32, height: 32, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(255,255,255,0.1)", border: "1px solid rgba(255,255,255,0.2)", borderRadius: "8px", cursor: "pointer" }}
                        title="Edit"
                      >
                        <Edit3 className="w-3.5 h-3.5 text-[#F6F4EF]" />
                      </button>
                      <button
                        onClick={() => handleDesktopDelete(pinnedAnn)}
                        style={{ width: 32, height: 32, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(239,68,68,0.15)", border: "1px solid rgba(239,68,68,0.3)", borderRadius: "8px", cursor: "pointer" }}
                        title="Delete"
                      >
                        <Trash2 className="w-3.5 h-3.5 text-red-300" />
                      </button>
                    </>
                  )}
                </div>
              </div>
            )}

            {compact ? (
              /* Compact table */
              <div className="rounded-xl border border-[#E5E0D2] bg-[#FBF8F2] overflow-hidden">
                <div className="grid px-5 py-2.5 border-b border-[#E5E0D2]" style={{ gridTemplateColumns: "100px 1.5fr 1fr 100px", gap: "12px" }}>
                  {["Type", "Title", "When", "Action"].map(h => (
                    <span key={h} style={{ fontFamily: "ui-monospace, 'SF Mono', Menlo, monospace", fontSize: "10px", letterSpacing: "0.06em", textTransform: "uppercase", color: "#8A8497" }}>{h}</span>
                  ))}
                </div>
                {(pinnedAnn ? [pinnedAnn, ...unpinned] : unpinned).map((ann, i) => (
                  <div key={ann.id} className="grid px-5 py-3.5 items-center" style={{ gridTemplateColumns: "100px 1.5fr 1fr 100px", gap: "12px", borderTop: i ? "1px solid #EFEAE0" : undefined }}>
                    <span style={{ fontSize: "10px", letterSpacing: "0.8px", padding: "3px 9px", borderRadius: "6px", background: "#F4F1E8", border: "1px solid #E5E0D2", textTransform: "uppercase", fontWeight: 500, width: "fit-content" }}>
                      {ann.is_event ? "Event" : "Post"}
                    </span>
                    <div>
                      <div style={{ fontFamily: "var(--font-instrument-serif)", fontSize: "17px", lineHeight: 1.2 }}>{ann.title}</div>
                      <div style={{ fontSize: "12px", color: "#8A8497", marginTop: "2px", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }} className="line-clamp-1">{ann.body}</div>
                    </div>
                    <div style={{ fontSize: "12px", color: "#5A5466" }}>{formatDate(ann.created_at)}</div>
                    <div className="flex justify-end items-center gap-1.5">
                      {ann.is_event && (
                        <button
                          onClick={() => handleRsvpToggle(ann.id)}
                          style={{ padding: "4px 10px", borderRadius: "6px", fontSize: "11px", border: "1px solid #E5E0D2", cursor: "pointer", background: ann.user_has_rsvped ? "#EFEAE0" : "transparent" }}
                        >
                          {ann.user_has_rsvped ? "Going" : "RSVP"}
                        </button>
                      )}
                      {isLeaderOrAdmin && (
                        <>
                          <button
                            onClick={() => setEditingAnn(ann)}
                            className="w-7 h-7 flex items-center justify-center rounded-md hover:bg-[#EFEAE0] transition-colors"
                            title="Edit"
                          >
                            <Edit3 className="w-3.5 h-3.5 text-[#5A5466]" />
                          </button>
                          <button
                            onClick={() => handleDesktopDelete(ann)}
                            className="w-7 h-7 flex items-center justify-center rounded-md hover:bg-red-50 transition-colors"
                            title="Delete"
                          >
                            <Trash2 className="w-3.5 h-3.5 text-red-400" />
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              /* Editorial 2-col cards */
              <div className="grid gap-5" style={{ gridTemplateColumns: "1fr 1fr" }}>
                {(pinnedAnn ? [pinnedAnn, ...unpinned] : unpinned).map((ann) => (
                  <article key={ann.id} className="rounded-2xl border border-[#E5E0D2] bg-[#FBF8F2] overflow-hidden">
                    <div style={{ padding: "26px 28px 22px" }}>
                      <div className="flex justify-between items-center mb-4">
                        <span style={monoStyle}>{formatDate(ann.created_at)}</span>
                        <span style={{ fontSize: "10px", letterSpacing: "0.8px", padding: "3px 9px", borderRadius: 999, background: "#EFEAE0", textTransform: "uppercase", fontWeight: 500 }}>
                          {ann.is_event ? "Event" : "Post"}
                        </span>
                      </div>
                      <h3 style={{ margin: 0, fontFamily: "var(--font-instrument-serif)", fontWeight: 400, fontSize: "28px", lineHeight: 1.1, letterSpacing: "-0.01em", color: "#13101A" }}>{ann.title}</h3>
                      <p style={{ marginTop: "14px", fontSize: "14px", color: "#5A5466", lineHeight: 1.55 }} className="line-clamp-3">{ann.body}</p>
                      <div style={{ marginTop: "22px", paddingTop: "16px", borderTop: "1px solid #EFEAE0", display: "flex", alignItems: "center", justifyContent: "space-between", gap: "8px" }}>
                        <span style={{ fontSize: "12px", color: "#8A8497" }}>{ann.rsvp_count} going · {ann.view_count} views</span>
                        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                          {ann.is_event && (
                            <button
                              onClick={() => handleRsvpToggle(ann.id)}
                              style={{ background: ann.user_has_rsvped ? "#EFEAE0" : "transparent", color: "#13101A", border: "1px solid #13101A", padding: "8px 16px", borderRadius: 999, fontSize: "12px", fontWeight: 500, cursor: "pointer" }}
                            >
                              {ann.user_has_rsvped ? "Going ✓" : "RSVP"}
                            </button>
                          )}
                          {isLeaderOrAdmin && (
                            <>
                              <button
                                onClick={() => setEditingAnn(ann)}
                                className="w-8 h-8 flex items-center justify-center rounded-lg border border-[#E5E0D2] hover:bg-[#EFEAE0] transition-colors"
                                title="Edit"
                              >
                                <Edit3 className="w-3.5 h-3.5 text-[#5A5466]" />
                              </button>
                              <button
                                onClick={() => handleDesktopDelete(ann)}
                                className="w-8 h-8 flex items-center justify-center rounded-lg border border-[#E5E0D2] hover:bg-red-50 hover:border-red-200 transition-colors"
                                title="Delete"
                              >
                                <Trash2 className="w-3.5 h-3.5 text-red-400" />
                              </button>
                            </>
                          )}
                        </div>
                      </div>
                    </div>
                  </article>
                ))}
              </div>
            )}
          </div>
        </>
      )}

      {/* FAB — mobile only */}
      {isLeaderOrAdmin && (
        <button
          onClick={() => setShowCreate(true)}
          style={{ position: "fixed", bottom: "6.5rem", right: "max(calc(50% - 195px + 16px), 16px)" }}
          className="md:hidden w-12 h-12 bg-[#3E1540] rounded-2xl flex items-center justify-center z-40 hover:bg-[#2D0F2E] active:scale-95 transition-all"
          aria-label="New announcement"
        >
          <Plus className="w-6 h-6 text-white" />
        </button>
      )}

      {showCreate && (
        <CreateAnnouncementModal userId={userId} ministryId={ministryId} onClose={() => setShowCreate(false)} onSuccess={handleNewAnnouncement} />
      )}
      {editingAnn && (
        <CreateAnnouncementModal
          userId={userId} ministryId={ministryId} existing={editingAnn}
          onClose={() => setEditingAnn(null)}
          onSuccess={(updated) => { handleEditSuccess(updated); setEditingAnn(null) }}
        />
      )}
    </div>
  )
}

// ─── Announcement Detail ─────────────────────────────────────────────────────

interface AnnouncementDetailProps {
  announcement: EnrichedAnnouncement
  userId: string
  onClose: () => void
  onRsvpToggle: (id: string) => void
}

function AnnouncementDetail({ announcement, userId, onClose, onRsvpToggle }: AnnouncementDetailProps) {
  const supabase = createClient()
  const [rsvping, setRsvping] = useState(false)

  async function handleRsvp() {
    if (announcement.user_has_rsvped || rsvping) return
    setRsvping(true)
    onRsvpToggle(announcement.id)
    await supabase.from("rsvps").upsert(
      { announcement_id: announcement.id, user_id: userId },
      { onConflict: "announcement_id,user_id" }
    )
    setRsvping(false)
  }

  const formattedDate = formatDate(announcement.created_at)

  return (
    <div className="fixed inset-0 z-50 bg-white flex flex-col md:left-[296px]">
    <div className="max-w-[390px] mx-auto w-full h-full flex flex-col md:max-w-none">

      {/* Header — never grows/shrinks, sits at top */}
      <div className="flex-shrink-0 flex items-center gap-3 px-5 pt-12 pb-4 md:pt-5 bg-white border-b border-[#ECE8DE]">
        <button
          onClick={onClose}
          className="w-9 h-9 rounded-full bg-[#FBF8F2] flex items-center justify-center flex-shrink-0 hover:bg-[#F2EDE0] transition-colors"
        >
          <ArrowLeft className="w-4 h-4 text-[#3E1540]" />
        </button>
        <span className="text-[15px] font-semibold text-[#13101A]">Announcement</span>
      </div>

      {/* Content — takes all remaining space, scrollable */}
      <div className="flex-1 overflow-y-auto px-5 py-6">
        <div className="flex items-center gap-1.5 text-[13px] text-[#8A8497] mb-5">
          <Calendar className="w-3.5 h-3.5 flex-shrink-0" />
          <span>{formattedDate}</span>
        </div>
        <h1 style={{ fontFamily: "var(--font-instrument-serif)", fontSize: "30px", fontWeight: 400, letterSpacing: "-0.02em", color: "#13101A", lineHeight: 1.1, marginBottom: "16px" }}>
          {announcement.title}
        </h1>
        <p className="text-[14px] text-[#374151] leading-relaxed whitespace-pre-wrap">
          {announcement.body}
        </p>
      </div>

      {/* RSVP bar — pinned to bottom, never floats */}
      {announcement.is_event && (
        <div className="flex-shrink-0 bg-white border-t border-[#ECE8DE] px-5 py-4 pb-20">
          <button
            onClick={handleRsvp}
            disabled={announcement.user_has_rsvped || rsvping}
            className={`w-full rounded-xl py-4 font-semibold text-[15px] transition-colors ${
              announcement.user_has_rsvped
                ? "bg-[#3E1540]/10 text-[#3E1540] cursor-default"
                : "bg-[#3E1540] hover:bg-[#2D0F2E] text-white"
            }`}
          >
            {announcement.user_has_rsvped ? (
              <span className="flex items-center justify-center gap-1.5">
                <Check className="w-4 h-4" />
                You&apos;re going!
              </span>
            ) : (
              "RSVP"
            )}
          </button>
        </div>
      )}

    </div>
    </div>
  )
}

// ─── Announcement Card ───────────────────────────────────────────────────────

interface AnnouncementCardProps {
  announcement: EnrichedAnnouncement
  isPinned: boolean
  userId: string
  userRole: string
  onRsvpToggle: (id: string) => void
  onEdit: (ann: EnrichedAnnouncement) => void
  onDelete: (id: string) => void
}

function AnnouncementCard({ announcement, isPinned, userId, userRole, onRsvpToggle, onEdit, onDelete }: AnnouncementCardProps) {
  const supabase = createClient()
  const [rsvping, setRsvping] = useState(false)
  const [showMenu, setShowMenu] = useState(false)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [showDetail, setShowDetail] = useState(false)

  const isAdminOrLeader = ["admin", "leader"].includes(userRole.toLowerCase())

  async function handleRsvp() {
    if (announcement.user_has_rsvped || rsvping) return
    setRsvping(true)
    onRsvpToggle(announcement.id)
    await supabase.from("rsvps").upsert(
      { announcement_id: announcement.id, user_id: userId },
      { onConflict: "announcement_id,user_id" }
    )
    setRsvping(false)
  }

  async function handleDelete() {
    setDeleting(true)
    await supabase.from("announcements").delete().eq("id", announcement.id)
    onDelete(announcement.id)
  }

  return (
    <>
    <div className="relative rounded-[22px] bg-[#3E1540] overflow-hidden shadow-[0_2px_8px_rgba(19,16,26,0.08)]">
      {/* Radial accent glow */}
      <div className="absolute -top-[70px] -right-[70px] w-[220px] h-[220px] rounded-full bg-[radial-gradient(circle,rgba(201,163,75,0.28)_0%,transparent_70%)] pointer-events-none" />

      {/* Optional image */}
      {announcement.image_url && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={announcement.image_url}
          alt={announcement.title}
          className="w-full h-44 object-cover"
        />
      )}

      <div className="p-6 relative">
        {/* Top row: kicker + admin menu */}
        <div className="flex items-start justify-between mb-3">
          <div className="flex items-center gap-2">
            {isPinned && (
              <span className="text-[10px] font-bold tracking-[.18em] uppercase text-[#C9A34B]">Pinned ·</span>
            )}
            <span className="text-[10px] font-bold tracking-[.22em] uppercase text-[#9E85A0]">
              {announcement.is_event ? "Event" : formatDate(announcement.created_at)}
            </span>
            {announcement.audience && announcement.audience !== "all" && (
              <span className="px-2 py-0.5 bg-[#C9A34B] text-[#13101A] rounded-full text-[9px] font-bold tracking-[.1em] uppercase">
                {audienceLabel(announcement.audience)}
              </span>
            )}
          </div>

          <div className="flex items-center gap-2">
            {announcement.view_count > 0 && (
              <span className="flex items-center gap-1 text-[10px] text-[#9E85A0] font-medium">
                <Users className="w-3 h-3" />
                {announcement.view_count}
              </span>
            )}
            {isAdminOrLeader && (
              <div className="relative">
                {showMenu && (
                  <div className="fixed inset-0 z-[5]" onClick={() => setShowMenu(false)} />
                )}
                <button
                  onClick={(e) => { e.stopPropagation(); setShowMenu((v) => !v) }}
                  className="w-7 h-7 rounded-full flex items-center justify-center hover:bg-white/10 transition-colors"
                >
                  <MoreHorizontal className="w-4 h-4 text-[#9E85A0]" />
                </button>
                {showMenu && (
                  <div className="absolute top-8 right-0 z-[10] bg-white rounded-xl shadow-lg border border-[#ECE8DE] py-1 min-w-[140px]">
                    <button
                      onClick={() => { setShowMenu(false); onEdit(announcement) }}
                      className="w-full flex items-center gap-2.5 px-4 py-2.5 text-[13px] font-medium text-[#13101A] hover:bg-[#FBF8F2] transition-colors text-left"
                    >
                      <Edit3 className="w-3.5 h-3.5 text-[#3E1540]" />
                      Edit
                    </button>
                    <button
                      onClick={() => { setShowMenu(false); setShowDeleteConfirm(true) }}
                      className="w-full flex items-center gap-2.5 px-4 py-2.5 text-[13px] font-medium text-red-500 hover:bg-red-50 transition-colors text-left"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      Delete
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        <h3
          style={{ fontFamily: "var(--font-instrument-serif)", fontSize: "30px", lineHeight: 1.05, letterSpacing: "-0.02em", color: "#F6F4EF", margin: "0 0 8px" }}
        >
          {announcement.title}
        </h3>
        <p className="text-[13px] text-[#CFB8D1] leading-relaxed line-clamp-3 md:line-clamp-5 mb-1">
          {announcement.body}
        </p>
        <button
          onClick={() => setShowDetail(true)}
          className="text-[12px] font-medium text-[#9E85A0] hover:text-[#CFB8D1] transition-colors mb-4"
        >
          Read more
        </button>

        {/* RSVP section */}
        {announcement.is_event && (
          <div className="flex items-center gap-4">
            <button
              onClick={handleRsvp}
              disabled={announcement.user_has_rsvped || rsvping}
              className={`font-bold py-3 px-7 rounded-full transition-all text-[14px] ${
                announcement.user_has_rsvped
                  ? "bg-white/20 text-[#F6F4EF] cursor-default"
                  : "bg-[#F6F4EF] text-[#3E1540] hover:bg-white active:scale-[0.98]"
              }`}
            >
              {announcement.user_has_rsvped ? (
                <span className="flex items-center gap-1.5">
                  <Check className="w-3.5 h-3.5" />
                  You&apos;re going!
                </span>
              ) : (
                "RSVP"
              )}
            </button>

            {announcement.rsvp_count > 0 && (
              <span className="text-[12px] text-[#9E85A0] font-medium">
                {announcement.rsvp_count} going
              </span>
            )}
          </div>
        )}
      </div>

      {/* Delete confirmation overlay */}
      {showDeleteConfirm && (
        <div className="absolute inset-0 z-[20] bg-[#3E1540]/95 backdrop-blur-sm rounded-[22px] flex flex-col items-center justify-center gap-3 p-7">
          <div className="w-11 h-11 rounded-full bg-white/10 flex items-center justify-center mb-1">
            <Trash2 className="w-5 h-5 text-red-400" />
          </div>
          <p className="text-[15px] font-bold text-[#F6F4EF] text-center">Delete this announcement?</p>
          <p className="text-[12px] text-[#9E85A0] text-center -mt-1">This can&apos;t be undone.</p>
          <div className="flex gap-3 w-full mt-1">
            <button
              onClick={() => setShowDeleteConfirm(false)}
              disabled={deleting}
              className="flex-1 py-2.5 rounded-full border border-white/20 text-[13px] font-semibold text-[#F6F4EF] hover:bg-white/10 transition-colors disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              onClick={handleDelete}
              disabled={deleting}
              className="flex-1 py-2.5 rounded-full bg-red-500 text-white text-[13px] font-semibold hover:bg-red-600 transition-colors disabled:opacity-60"
            >
              {deleting ? "Deleting…" : "Delete"}
            </button>
          </div>
        </div>
      )}
    </div>

    {/* Full-screen detail page */}
    {showDetail && (
      <AnnouncementDetail
        announcement={announcement}
        userId={userId}
        onClose={() => setShowDetail(false)}
        onRsvpToggle={onRsvpToggle}
      />
    )}
    </>
  )
}

// ─── Create Chat Screen ──────────────────────────────────────────────────────

interface CreateChatScreenProps {
  userId: string
  userName: string
  ministryId: string
  groupType: "my" | "church"
  onClose: () => void
  onCreated: (group: { id: string; name: string }) => void
}

function CreateChatScreen({ userId, userName, ministryId, groupType, onClose, onCreated }: CreateChatScreenProps) {
  const supabase = createClient()
  const [chatName, setChatName] = useState("")
  const [search, setSearch] = useState("")
  const [allMembers, setAllMembers] = useState<{ id: string; name: string; graduation_year: number | null; role: string }[]>([])
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    async function loadMembers() {
      const { data } = await supabase
        .from("profiles")
        .select("id, name, graduation_year, role")
        .eq("ministry_id", ministryId)
        .neq("id", userId)
        .order("name")
      setAllMembers(data ?? [])
    }
    loadMembers()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const filtered = allMembers.filter((m) =>
    m.name.toLowerCase().includes(search.toLowerCase())
  )
  const selectedMembers = allMembers.filter((m) => selectedIds.has(m.id))

  function toggleMember(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  async function handleCreate() {
    const name = chatName.trim()
    console.log("[handleCreate] fired — name:", JSON.stringify(name), "groupType:", groupType, "userId:", userId)
    if (!name) { setError("Please enter a chat name."); return }

    setCreating(true)
    setError(null)

    console.log("[handleCreate] calling server action createGroup…")
    const { group, error: createErr } = await createGroup({
      name,
      type: groupType,
      memberIds: Array.from(selectedIds),
      createdBy: userId,
    })
    console.log("[handleCreate] server action returned — group:", group, "error:", createErr)

    if (createErr || !group) {
      setError(createErr ?? "Failed to create chat.")
      setCreating(false)
      return
    }

    onCreated({ id: group.id, name: group.name })
  }

  return (
    <div className="fixed inset-0 z-[60] bg-white flex flex-col md:bg-black/20 md:backdrop-blur-sm md:items-center md:justify-center">
      <div className="flex flex-col w-full h-full bg-white md:h-auto md:max-h-[85vh] md:max-w-[500px] md:rounded-2xl md:shadow-2xl md:overflow-hidden">

        {/* Top nav */}
        <div className="flex-shrink-0 flex items-center gap-3 px-5 pt-12 pb-4 md:pt-5 border-b border-[#ECE8DE] bg-white">
          <button
            onClick={onClose}
            className="size-8 bg-[#FBF8F2] rounded-full flex items-center justify-center hover:bg-[#F2EDE0] transition-colors flex-shrink-0"
          >
            <X className="w-4 h-4 text-foreground" />
          </button>
          <h1 className="text-[17px] font-bold text-foreground tracking-tight">
            {groupType === "church" ? "New Church Chat" : "New Chat"}
          </h1>
        </div>

        {/* Scrollable body */}
        <div className="flex-1 overflow-y-auto min-h-0 px-5 py-5 flex flex-col gap-5">
          {error && (
            <div className="rounded-xl bg-red-50 border border-red-200 px-4 py-3 text-[13px] text-red-600 font-medium">
              {error}
            </div>
          )}

          {/* Chat name */}
          <div className="flex flex-col gap-1.5">
            <label className="text-[12px] font-medium text-[#8A8497]">Chat name</label>
            <input
              type="text"
              value={chatName}
              onChange={(e) => setChatName(e.target.value)}
              placeholder={groupType === "church" ? "e.g. Freshman Bible Study" : "e.g. Prayer Group"}
              className="w-full px-4 py-3 rounded-xl border border-[#EFEFEF] bg-[#FBF8F2] text-[14px] text-[#13101A] placeholder:text-[#C4C4C4] focus:outline-none focus:ring-2 focus:ring-[#3E1540]/20 focus:border-[#3E1540]/40 transition-all"
            />
          </div>

          {/* Selected chips */}
          {selectedMembers.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {selectedMembers.map((m) => (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => toggleMember(m.id)}
                  className="flex items-center gap-1.5 bg-[#3E1540] text-white px-3 py-1.5 rounded-full text-[12px] font-semibold hover:bg-[#2D0F2E] transition-colors"
                >
                  {m.name.split(" ")[0]}
                  <X className="w-3 h-3 opacity-70" />
                </button>
              ))}
            </div>
          )}

          {/* Member search */}
          <div className="flex flex-col gap-3">
            <label className="text-[12px] font-medium text-[#8A8497]">
              Add members
              {selectedMembers.length > 0 && (
                <span className="ml-2 text-[#3E1540] font-semibold">{selectedMembers.length} selected</span>
              )}
            </label>
            <div className="relative">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground/40" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search members…"
                className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-[#FBF8F2] text-[13px] placeholder:text-[#C4C4C4] text-[#13101A] focus:outline-none focus:ring-2 focus:ring-[#3E1540]/20 border border-[#EFEFEF] focus:border-[#3E1540]/30 transition-all"
              />
            </div>

            <div className="flex flex-col gap-2">
              {filtered.length === 0 ? (
                <p className="text-center text-[13px] text-muted-foreground/50 py-6">No members found</p>
              ) : (
                filtered.map((member) => {
                  const isSelected = selectedIds.has(member.id)
                  return (
                    <button
                      key={member.id}
                      type="button"
                      onClick={() => toggleMember(member.id)}
                      className={`flex items-center gap-3 p-3 rounded-xl border transition-all text-left ${
                        isSelected
                          ? "border-[#3E1540]/30 bg-[#3E1540]/4"
                          : "border-[#EFEFEF] bg-white hover:border-[#3E1540]/30"
                      }`}
                    >
                      <Avatar className={`w-9 h-9 flex-shrink-0 ${getAvatarColor(member.name)} shadow-sm`}>
                        <AvatarFallback className="text-white font-bold text-[11px] bg-transparent">
                          {getInitials(member.name)}
                        </AvatarFallback>
                      </Avatar>
                      <div className="flex-1 min-w-0">
                        <p className="text-[13px] font-semibold text-foreground">{member.name}</p>
                        {member.graduation_year && (
                          <p className="text-[11px] text-muted-foreground/60">Class of {member.graduation_year}</p>
                        )}
                      </div>
                      <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center flex-shrink-0 transition-all ${
                        isSelected ? "bg-[#3E1540] border-[#3E1540]" : "border-muted-foreground/25"
                      }`}>
                        {isSelected && <Check className="w-3 h-3 text-white" />}
                      </div>
                    </button>
                  )
                })
              )}
            </div>
          </div>
        </div>

        {/* Create button */}
        <div className="flex-shrink-0 bg-white border-t border-[#ECE8DE] px-5 py-4">
          <button
            onClick={handleCreate}
            disabled={creating || !chatName.trim()}
            className="w-full bg-[#3E1540] hover:bg-[#2D0F2E] disabled:opacity-50 text-white font-bold py-4 rounded-xl transition-colors text-[14px] tracking-wide"
          >
            {creating ? "Creating…" : `Create Chat${selectedMembers.length > 0 ? ` · ${selectedMembers.length + 1} members` : ""}`}
          </button>
        </div>

      </div>
    </div>
  )
}

// ─── Chat Settings ───────────────────────────────────────────────────────────

interface ChatSettingsProps {
  groupId: string
  groupName: string
  groupType: string
  userId: string
  userRole: string
  onBack: () => void
  onNameChange: (name: string) => void
  onClose: () => void
}

function ChatSettings({ groupId, groupName, groupType, userId, userRole, onBack, onNameChange, onClose }: ChatSettingsProps) {
  const supabase = createClient()
  const [members, setMembers] = useState<GroupMember[]>([])
  const [loading, setLoading] = useState(true)
  const [displayGroupName, setDisplayGroupName] = useState(groupName)
  const [renaming, setRenaming] = useState(false)
  const [newName, setNewName] = useState(groupName)
  const [saving, setSaving] = useState(false)
  const [showAddMembers, setShowAddMembers] = useState(false)
  const [allProfiles, setAllProfiles] = useState<Profile[]>([])
  const [searchAdd, setSearchAdd] = useState("")
  const [selectedToAdd, setSelectedToAdd] = useState<string[]>([])
  const [addingMembers, setAddingMembers] = useState(false)
  const [removingId, setRemovingId] = useState<string | null>(null)

  const isAdminOrLeader = ["admin", "leader"].includes(userRole.toLowerCase())
  const isDM = groupType === "dm"
  const isMy = groupType === "my"
  const isChurch = groupType === "church"
  const canManage = (isChurch && isAdminOrLeader) || isMy
  const canLeave = isMy || isDM
  const canArchive = isChurch && isAdminOrLeader

  useEffect(() => {
    loadMembers()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [groupId])

  async function loadMembers() {
    setLoading(true)
    const { data } = await supabase
      .from("group_members")
      .select("user_id, profiles!user_id(name, role, graduation_year)")
      .eq("group_id", groupId)

    if (data) {
      const mapped: GroupMember[] = data.map((m: {
        user_id: string
        profiles: { name: string; role: string; graduation_year: number | null } | { name: string; role: string; graduation_year: number | null }[] | null
      }) => {
        const p = Array.isArray(m.profiles) ? m.profiles[0] : m.profiles
        return {
          user_id: m.user_id,
          name: p?.name ?? "Unknown",
          role: p?.role ?? "",
          graduation_year: p?.graduation_year ?? null,
        }
      })
      setMembers(mapped)
    }
    setLoading(false)
  }

  async function loadAllProfiles() {
    const memberIds = new Set(members.map((m) => m.user_id))
    const { data } = await supabase
      .from("profiles")
      .select("id, name, role, graduation_year, email, about_me, bible_verse, prayer_request, pray_for_me")
      .order("name")
    setAllProfiles((data ?? []).filter((p: Profile) => !memberIds.has(p.id)))
  }

  async function handleRename() {
    const trimmed = newName.trim()
    if (!trimmed || trimmed === displayGroupName) { setRenaming(false); return }
    setSaving(true)
    await supabase.from("groups").update({ name: trimmed }).eq("id", groupId)
    setDisplayGroupName(trimmed)
    onNameChange(trimmed)
    setSaving(false)
    setRenaming(false)
  }

  async function handleRemoveMember(memberId: string) {
    setRemovingId(memberId)
    await supabase.from("group_members").delete().eq("group_id", groupId).eq("user_id", memberId)
    setMembers((prev) => prev.filter((m) => m.user_id !== memberId))
    setRemovingId(null)
  }

  async function handleLeave() {
    await supabase.from("group_members").delete().eq("group_id", groupId).eq("user_id", userId)
    onClose()
  }

  async function handleArchive() {
    await supabase.from("groups").update({ archived: true }).eq("id", groupId)
    onClose()
  }

  async function handleAddMembers() {
    if (selectedToAdd.length === 0) return
    setAddingMembers(true)
    await supabase.from("group_members").insert(selectedToAdd.map((uid) => ({ group_id: groupId, user_id: uid })))
    await loadMembers()
    setSelectedToAdd([])
    setAddingMembers(false)
    setShowAddMembers(false)
    setSearchAdd("")
  }

  const filteredProfiles = allProfiles.filter((p) =>
    p.name.toLowerCase().includes(searchAdd.toLowerCase())
  )

  if (showAddMembers) {
    return (
      <div className="fixed inset-0 z-[110] bg-[#FBF8F2] flex flex-col md:left-[296px]">
      <div className="max-w-[390px] mx-auto w-full h-full flex flex-col md:max-w-none">
        <div className="flex-shrink-0 flex items-center gap-3 px-4 pt-12 pb-3 md:pt-5 bg-white border-b border-[#ECE8DE]">
          <button
            onClick={() => { setShowAddMembers(false); setSearchAdd(""); setSelectedToAdd([]) }}
            className="size-8 bg-[#FBF8F2] rounded-full flex items-center justify-center hover:bg-[#F2EDE0] transition-colors flex-shrink-0"
          >
            <ArrowLeft className="w-4 h-4 text-foreground" />
          </button>
          <h2 className="flex-1 text-[15px] font-bold text-foreground tracking-tight">Add Members</h2>
          {selectedToAdd.length > 0 && (
            <span className="text-[12px] font-semibold text-[#3E1540]">{selectedToAdd.length} selected</span>
          )}
        </div>

        <div className="px-4 pt-4 pb-2">
          <div className="relative">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground/40" />
            <input
              type="text"
              placeholder="Search members…"
              value={searchAdd}
              onChange={(e) => setSearchAdd(e.target.value)}
              autoFocus
              className="w-full pl-10 pr-4 py-3 rounded-xl bg-[#FBF8F2] text-[13px] placeholder:text-[#C4C4C4] focus:outline-none focus:ring-2 focus:ring-[#3E1540]/20 border border-[#EFEFEF] focus:border-[#3E1540]/30 transition-all"
            />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-4 py-2">
          {filteredProfiles.length === 0 ? (
            <div className="flex items-center justify-center h-24">
              <p className="text-[13px] text-muted-foreground/40">No members to add</p>
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              {filteredProfiles.map((profile) => {
                const selected = selectedToAdd.includes(profile.id)
                return (
                  <button
                    key={profile.id}
                    onClick={() => setSelectedToAdd((prev) =>
                      selected ? prev.filter((id) => id !== profile.id) : [...prev, profile.id]
                    )}
                    className={`w-full flex items-center gap-3 p-3.5 rounded-xl border transition-all text-left ${
                      selected
                        ? "bg-[#3E1540]/6 border-[#3E1540]/20"
                        : "bg-white border-[#EFEFEF]"
                    }`}
                  >
                    <Avatar className={`w-9 h-9 flex-shrink-0 ${getAvatarColor(profile.name)}`}>
                      <AvatarFallback className="text-white font-bold text-[10px] bg-transparent">
                        {getInitials(profile.name)}
                      </AvatarFallback>
                    </Avatar>
                    <div className="flex-1 min-w-0">
                      <p className="text-[13px] font-semibold text-foreground truncate">{profile.name}</p>
                      <div className="flex items-center gap-2 mt-0.5">
                        {profile.role && (
                          <span className={`text-[9px] font-semibold px-1.5 py-0.5 rounded-full uppercase tracking-wide ${profile.role.toLowerCase() === "admin" || profile.role.toLowerCase() === "leader" ? "bg-[#3E1540] text-white" : "bg-[#F3EDE6] text-[#3E1540]"}`}>
                            {profile.role}
                          </span>
                        )}
                        {profile.graduation_year && (
                          <span className="text-[11px] text-muted-foreground/50">Class of {profile.graduation_year}</span>
                        )}
                      </div>
                    </div>
                    <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center flex-shrink-0 transition-all ${
                      selected ? "bg-[#3E1540] border-[#3E1540]" : "border-muted-foreground/20"
                    }`}>
                      {selected && <Check className="w-3 h-3 text-white" />}
                    </div>
                  </button>
                )
              })}
            </div>
          )}
        </div>

        <div className="flex-shrink-0 bg-white border-t border-[#ECE8DE] px-5 py-4">
          <button
            onClick={handleAddMembers}
            disabled={selectedToAdd.length === 0 || addingMembers}
            className="w-full bg-[#3E1540] hover:bg-[#2D0F2E] disabled:opacity-50 text-white font-bold py-4 rounded-xl transition-colors text-[14px] tracking-wide"
          >
            {addingMembers
              ? "Adding…"
              : selectedToAdd.length > 0
              ? `Add ${selectedToAdd.length} Member${selectedToAdd.length !== 1 ? "s" : ""}`
              : "Add Members"}
          </button>
        </div>
      </div>
      </div>
    )
  }

  return (
    <div className="fixed inset-0 z-[110] bg-[#FBF8F2] flex flex-col md:left-[296px]">
    <div className="max-w-[390px] mx-auto w-full h-full flex flex-col md:max-w-none">
      {/* Header */}
      <div className="flex-shrink-0 flex items-center gap-3 px-4 pt-12 pb-3 md:pt-5 bg-white border-b border-[#ECE8DE]">
        <button
          onClick={onBack}
          className="size-8 bg-[#FBF8F2] rounded-full flex items-center justify-center hover:bg-[#F2EDE0] transition-colors flex-shrink-0"
        >
          <ArrowLeft className="w-4 h-4 text-foreground" />
        </button>
        <h2 className="flex-1 text-[15px] font-bold text-foreground tracking-tight">Chat Info</h2>
      </div>

      <div className="flex-1 overflow-y-auto">
        {/* ── CHAT INFO ── */}
        <div className="px-5 pt-6 pb-2">
          <h3 style={{ fontFamily: "var(--font-instrument-serif)", fontSize: "20px", color: "#13101A", fontWeight: 400, letterSpacing: "-0.01em", lineHeight: 1, marginBottom: "16px" }}>
            Chat info
          </h3>

          {/* Avatar + name + count card */}
          <div className="bg-white rounded-2xl border border-[#EFEFEF] p-5 mb-4 flex items-center gap-4 shadow-[0_1px_3px_rgba(0,0,0,0.06)]">
            <Avatar className={`w-14 h-14 flex-shrink-0 ${getAvatarColor(displayGroupName)}`}>
              <AvatarFallback className="text-white font-bold text-[16px] bg-transparent tracking-wide">
                {getInitials(displayGroupName)}
              </AvatarFallback>
            </Avatar>
            <div>
              <h3 className="text-[16px] font-bold text-foreground tracking-tight">{displayGroupName}</h3>
              <p className="text-[12px] text-muted-foreground/60 mt-0.5">
                {members.length} member{members.length !== 1 ? "s" : ""}
              </p>
            </div>
          </div>

          {/* Members list */}
          {loading ? (
            <Spinner />
          ) : (
            <div className="flex flex-col gap-2 mb-6">
              {members.map((member) => (
                <div
                  key={member.user_id}
                  className="bg-white rounded-xl border border-[#EFEFEF] p-3.5 flex items-center gap-3"
                >
                  <Avatar className={`w-9 h-9 flex-shrink-0 ${getAvatarColor(member.name)}`}>
                    <AvatarFallback className="text-white font-bold text-[10px] bg-transparent">
                      {getInitials(member.name)}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <p className="text-[13px] font-semibold text-foreground truncate">{member.name}</p>
                      {member.user_id === userId && (
                        <span className="text-[9px] bg-[#3E1540]/8 text-[#3E1540] font-semibold px-1.5 py-0.5 rounded-full flex-shrink-0">
                          You
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                      {member.role && (
                        <span className={`text-[9px] font-semibold px-1.5 py-0.5 rounded-full uppercase tracking-wide ${member.role.toLowerCase() === "admin" || member.role.toLowerCase() === "leader" ? "bg-[#3E1540] text-white" : "bg-[#F3EDE6] text-[#3E1540]"}`}>
                          {member.role}
                        </span>
                      )}
                      {member.graduation_year && (
                        <span className="text-[11px] text-muted-foreground/50">
                          Class of {member.graduation_year}
                        </span>
                      )}
                    </div>
                  </div>
                  {canManage && member.user_id !== userId && (
                    <button
                      onClick={() => handleRemoveMember(member.user_id)}
                      disabled={removingId === member.user_id}
                      className="w-7 h-7 rounded-full bg-muted/50 flex items-center justify-center hover:bg-red-50 hover:text-red-500 transition-colors flex-shrink-0 disabled:opacity-40"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* ── MANAGE CHAT ── */}
        {canManage && (
          <div className="px-5 pb-4">
            <h3 style={{ fontFamily: "var(--font-instrument-serif)", fontSize: "20px", color: "#13101A", fontWeight: 400, letterSpacing: "-0.01em", lineHeight: 1, marginBottom: "16px" }}>
              Manage chat
            </h3>
            <div className="bg-white rounded-2xl border border-[#EFEFEF] shadow-[0_1px_3px_rgba(0,0,0,0.06)] overflow-hidden">
              {/* Rename row */}
              {renaming ? (
                <div className="p-4 flex items-center gap-3 border-b border-[#ECE8DE]">
                  <input
                    autoFocus
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") handleRename()
                      if (e.key === "Escape") { setRenaming(false); setNewName(displayGroupName) }
                    }}
                    className="flex-1 text-[13px] text-foreground bg-[#FBF8F2] border border-[#EFEFEF] rounded-xl px-3 py-2 focus:outline-none focus:ring-2 focus:ring-[#3E1540]/30"
                  />
                  <button
                    onClick={handleRename}
                    disabled={saving}
                    className="w-8 h-8 rounded-full bg-[#3E1540] flex items-center justify-center disabled:opacity-50 hover:bg-[#2D0F2E] transition-colors"
                  >
                    <Check className="w-3.5 h-3.5 text-white" />
                  </button>
                  <button
                    onClick={() => { setRenaming(false); setNewName(displayGroupName) }}
                    className="w-8 h-8 rounded-full bg-muted/60 flex items-center justify-center hover:bg-muted transition-colors"
                  >
                    <X className="w-3.5 h-3.5 text-muted-foreground" />
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => { setRenaming(true); setNewName(displayGroupName) }}
                  className="w-full p-4 flex items-center gap-3 hover:bg-[#FBF8F2] transition-colors border-b border-[#ECE8DE]"
                >
                  <div className="w-8 h-8 rounded-xl bg-[#3E1540]/8 flex items-center justify-center flex-shrink-0">
                    <Edit3 className="w-3.5 h-3.5 text-[#3E1540]" />
                  </div>
                  <span className="flex-1 text-[14px] font-semibold text-foreground text-left">Rename Chat</span>
                  <ChevronRight className="w-4 h-4 text-muted-foreground/30" />
                </button>
              )}

              {/* Add members row */}
              <button
                onClick={() => { setShowAddMembers(true); loadAllProfiles() }}
                className="w-full p-4 flex items-center gap-3 hover:bg-[#FBF8F2] transition-colors"
              >
                <div className="w-8 h-8 rounded-xl bg-[#F3EDE6] flex items-center justify-center flex-shrink-0">
                  <Plus className="w-3.5 h-3.5 text-[#3E1540]" />
                </div>
                <span className="flex-1 text-[14px] font-semibold text-foreground text-left">Add Members</span>
                <ChevronRight className="w-4 h-4 text-muted-foreground/30" />
              </button>
            </div>
          </div>
        )}

        {/* ── DANGER ZONE ── */}
        {(canArchive || canLeave) && (
          <div className="px-5 pb-10">
            {canArchive && (
              <button
                onClick={handleArchive}
                className="w-full flex items-center justify-center gap-2 py-3.5 rounded-xl bg-white text-[#5A5466] font-semibold text-[13px] mb-3 hover:bg-[#FBF8F2] transition-colors border border-[#ECE8DE]"
              >
                Archive chat
              </button>
            )}
            {canLeave && (
              <button
                onClick={handleLeave}
                className="w-full flex items-center justify-center gap-2 py-3.5 rounded-xl bg-white text-[#5A5466] font-semibold text-[13px] hover:bg-[#FBF8F2] transition-colors border border-[#ECE8DE]"
              >
                Leave chat
              </button>
            )}
          </div>
        )}
      </div>
    </div>
    </div>
  )
}

// ─── Chat Screen ────────────────────────────────────────────────────────────

interface ChatScreenProps {
  groupId: string
  groupName: string
  userId: string
  userName: string
  userRole: string
  onClose: () => void
  onRead?: () => void
  inline?: boolean
}

function ChatScreen({ groupId, groupName, userId, userName, userRole, onClose, onRead, inline = false }: ChatScreenProps) {
  const supabase = createClient()
  const [messages, setMessages] = useState<Message[]>([])
  const [loading, setLoading] = useState(true)
  const [inputText, setInputText] = useState("")
  const [sending, setSending] = useState(false)
  const [displayName, setDisplayName] = useState(groupName)
  const [groupType, setGroupType] = useState("")
  const [showSettings, setShowSettings] = useState(false)
  const [replyingTo, setReplyingTo] = useState<Message | null>(null)
  const [reactions, setReactions] = useState<Record<string, Reaction[]>>({})
  const [emojiPickerFor, setEmojiPickerFor] = useState<string | null>(null)
  const [contextMenuFor, setContextMenuFor] = useState<string | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const bottomRef = useRef<HTMLDivElement>(null)
  const profilesCache = useRef<Record<string, string>>({ [userId]: userName })
  const messagesRef = useRef<Message[]>([])
  const messageRefs = useRef<Record<string, HTMLDivElement | null>>({})
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const longPressFiredRef = useRef(false)
  const [memberReadMap, setMemberReadMap] = useState<Record<string, { name: string; lastReadAt: string | null }>>({})

  const scrollToBottom = useCallback((smooth = true) => {
    bottomRef.current?.scrollIntoView({ behavior: smooth ? "smooth" : "instant" })
  }, [])

  function scrollToMessage(id: string) {
    messageRefs.current[id]?.scrollIntoView({ behavior: "smooth", block: "center" })
  }

  function handlePointerDown(msg: Message) {
    if (msg.deleted) return
    longPressFiredRef.current = false
    longPressTimer.current = setTimeout(() => {
      longPressFiredRef.current = true
      longPressTimer.current = null
      setContextMenuFor(msg.id)
    }, 400)
  }

  function handlePointerUp(msg: Message) {
    if (msg.deleted) return
    if (longPressTimer.current !== null) {
      // Timer still pending — this is a short tap, open emoji picker
      clearTimeout(longPressTimer.current)
      longPressTimer.current = null
      setEmojiPickerFor((prev) => (prev === msg.id ? null : msg.id))
    }
    // If timer already fired (long press), do nothing here
  }

  function handlePointerCancel() {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current)
      longPressTimer.current = null
    }
  }

  async function handleDeleteMessage(msgId: string) {
    setDeletingId(null)
    setContextMenuFor(null)
    // Optimistic
    setMessages((prev) => prev.map((m) => m.id === msgId ? { ...m, deleted: true, content: "" } : m))
    setReactions((prev) => { const next = { ...prev }; delete next[msgId]; return next })
    await supabase.from("messages").delete().eq("id", msgId).eq("sender_id", userId)
  }

  // Fetch group type for settings
  useEffect(() => {
    supabase
      .from("groups")
      .select("type")
      .eq("id", groupId)
      .single()
      .then(({ data }) => { if (data) setGroupType(data.type) })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [groupId])

  // Load other members' last_read_at for read receipts
  useEffect(() => {
    async function loadMemberReadStates() {
      const { data } = await supabase
        .from("group_members")
        .select("user_id, last_read_at, profiles!user_id(name)")
        .eq("group_id", groupId)
        .neq("user_id", userId)

      if (data) {
        const map: Record<string, { name: string; lastReadAt: string | null }> = {}
        for (const m of data) {
          const p = Array.isArray(m.profiles) ? m.profiles[0] : m.profiles
          map[m.user_id] = { name: (p as { name: string } | null)?.name ?? "?", lastReadAt: m.last_read_at }
        }
        setMemberReadMap(map)
      }
    }
    loadMemberReadStates()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [groupId, userId])

  // Realtime: update memberReadMap when other members mark messages read
  useEffect(() => {
    const channel = supabase
      .channel(`read-receipts-${groupId}`)
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "group_members", filter: `group_id=eq.${groupId}` },
        (payload) => {
          const updated = payload.new as { user_id: string; last_read_at: string | null }
          if (updated.user_id === userId) return
          setMemberReadMap((prev) => ({
            ...prev,
            [updated.user_id]: { ...prev[updated.user_id], lastReadAt: updated.last_read_at },
          }))
        }
      )
      .subscribe()

    return () => { supabase.removeChannel(channel) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [groupId, userId])

  // Mark messages as read on open and again on close (clears badges for messages received while inside)
  useEffect(() => {
    const markRead = () =>
      supabase
        .from("group_members")
        .update({ last_read_at: new Date().toISOString() })
        .eq("group_id", groupId)
        .eq("user_id", userId)
        .then(() => { if (onRead) onRead() })

    markRead()
    return () => { markRead() }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [groupId, userId])

  // Load last 50 messages
  useEffect(() => {
    async function loadMessages() {
      const { data } = await supabase
        .from("messages")
        .select("id, group_id, sender_id, content, created_at, reply_to_id, profiles!sender_id(name), reply_to:reply_to_id(id, content, profiles!sender_id(name))")
        .eq("group_id", groupId)
        .order("created_at", { ascending: true })
        .limit(50)

      if (data) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const enriched: Message[] = data.map((m: any) => {
          const p = Array.isArray(m.profiles) ? m.profiles[0] : m.profiles
          const name = p?.name ?? "Unknown"
          profilesCache.current[m.sender_id] = name

          const replyRaw = m.reply_to ?? null
          const replyProfile = replyRaw?.profiles
            ? (Array.isArray(replyRaw.profiles) ? replyRaw.profiles[0] : replyRaw.profiles)
            : null

          return {
            id: m.id, group_id: m.group_id, sender_id: m.sender_id,
            content: m.content, created_at: m.created_at, sender_name: name,
            reply_to_id: m.reply_to_id ?? null,
            reply_to_content: replyRaw?.content ?? null,
            reply_to_sender: (replyProfile as { name: string } | null)?.name ?? null,
          }
        })
        setMessages(enriched)

        // Load all reactions for these messages in one query
        const messageIds = enriched.map((m) => m.id)
        if (messageIds.length > 0) {
          const { data: rxData } = await supabase
            .from("message_reactions")
            .select("id, message_id, user_id, emoji")
            .in("message_id", messageIds)
          const rxMap: Record<string, Reaction[]> = {}
          for (const rx of ((rxData ?? []) as Reaction[])) {
            if (!rxMap[rx.message_id]) rxMap[rx.message_id] = []
            rxMap[rx.message_id].push(rx)
          }
          setReactions(rxMap)
        }
      }
      setLoading(false)
    }
    loadMessages()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [groupId])

  // Keep messagesRef current so realtime callbacks can look up reply content
  useEffect(() => {
    messagesRef.current = messages
  }, [messages])

  // Scroll to bottom after initial load
  useEffect(() => {
    if (!loading) scrollToBottom(false)
  }, [loading, scrollToBottom])

  // Realtime subscription for new messages from others
  useEffect(() => {
    const channel = supabase
      .channel(`group-messages-${groupId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "messages", filter: `group_id=eq.${groupId}` },
        async (payload) => {
          const raw = payload.new as { id: string; group_id: string; sender_id: string; content: string; created_at: string; reply_to_id: string | null }
          // Skip own messages — handled optimistically
          if (raw.sender_id === userId) return

          let senderName = profilesCache.current[raw.sender_id]
          if (!senderName) {
            const { data: prof } = await supabase.from("profiles").select("name").eq("id", raw.sender_id).single()
            senderName = prof?.name ?? "Unknown"
            profilesCache.current[raw.sender_id] = senderName
          }

          // Resolve reply content from local cache or a quick fetch
          let replyToContent: string | null = null
          let replyToSender: string | null = null
          if (raw.reply_to_id) {
            const cached = messagesRef.current.find((m) => m.id === raw.reply_to_id)
            if (cached) {
              replyToContent = cached.content
              replyToSender = cached.sender_name
            } else {
              const { data: rMsg } = await supabase
                .from("messages")
                .select("content, profiles!sender_id(name)")
                .eq("id", raw.reply_to_id)
                .single()
              if (rMsg) {
                replyToContent = rMsg.content
                const rp = Array.isArray(rMsg.profiles) ? rMsg.profiles[0] : rMsg.profiles
                replyToSender = (rp as { name: string } | null)?.name ?? null
              }
            }
          }

          setMessages((prev) => [...prev, {
            ...raw,
            sender_name: senderName,
            reply_to_id: raw.reply_to_id ?? null,
            reply_to_content: replyToContent,
            reply_to_sender: replyToSender,
          }])

          // Keep last_read_at current as messages arrive so the badge is
          // already cleared in the DB by the time the user navigates back.
          supabase
            .from("group_members")
            .update({ last_read_at: raw.created_at })
            .eq("group_id", groupId)
            .eq("user_id", userId)
            .then()
        }
      )
      .subscribe()

    return () => { supabase.removeChannel(channel) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [groupId, userId])

  // Realtime subscription for reaction inserts and deletes
  useEffect(() => {
    const channel = supabase
      .channel(`reactions-${groupId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "message_reactions" },
        (payload) => {
          const rx = payload.new as Reaction
          setReactions((prev) => {
            const list = prev[rx.message_id] ?? []
            // Replace optimistic temp entry if present, otherwise append
            const tempIdx = list.findIndex(
              (r) => r.user_id === rx.user_id && r.emoji === rx.emoji && r.id.startsWith("temp-")
            )
            if (tempIdx >= 0) {
              const updated = [...list]
              updated[tempIdx] = rx
              return { ...prev, [rx.message_id]: updated }
            }
            if (list.find((r) => r.id === rx.id)) return prev
            return { ...prev, [rx.message_id]: [...list, rx] }
          })
        }
      )
      .on(
        "postgres_changes",
        { event: "DELETE", schema: "public", table: "message_reactions" },
        (payload) => {
          const rx = payload.old as Reaction
          if (!rx.message_id) return
          setReactions((prev) => ({
            ...prev,
            [rx.message_id]: (prev[rx.message_id] ?? []).filter((r) => r.id !== rx.id),
          }))
        }
      )
      .subscribe()

    return () => { supabase.removeChannel(channel) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [groupId])

  // Auto-scroll on new messages
  useEffect(() => {
    scrollToBottom()
  }, [messages, scrollToBottom])

  async function handleSend() {
    const content = inputText.trim()
    if (!content || sending) return

    setSending(true)
    setInputText("")

    const replyTarget = replyingTo
    setReplyingTo(null)

    const optimisticId = `optimistic-${Date.now()}`
    const optimisticMsg: Message = {
      id: optimisticId,
      group_id: groupId,
      sender_id: userId,
      content,
      created_at: new Date().toISOString(),
      sender_name: userName,
      reply_to_id: replyTarget?.id ?? null,
      reply_to_content: replyTarget?.content ?? null,
      reply_to_sender: replyTarget?.sender_name ?? null,
    }
    setMessages((prev) => [...prev, optimisticMsg])

    const { data, error } = await supabase
      .from("messages")
      .insert({ group_id: groupId, sender_id: userId, content, reply_to_id: replyTarget?.id ?? null })
      .select("id")
      .single()

    if (error) {
      setMessages((prev) => prev.filter((m) => m.id !== optimisticId))
    } else if (data) {
      setMessages((prev) => prev.map((m) => m.id === optimisticId ? { ...m, id: data.id } : m))
    }
    setSending(false)
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  function groupedReactions(msgId: string) {
    const list = reactions[msgId] ?? []
    const map: Record<string, { count: number; userReacted: boolean }> = {}
    for (const rx of list) {
      if (!map[rx.emoji]) map[rx.emoji] = { count: 0, userReacted: false }
      map[rx.emoji].count++
      if (rx.user_id === userId) map[rx.emoji].userReacted = true
    }
    return Object.entries(map).map(([emoji, v]) => ({ emoji, ...v }))
  }

  // For each own message: which other members have it as their most-recently-read own message
  const readReceiptMap = useMemo(() => {
    const map: Record<string, string[]> = {}
    const ownMsgs = messages.filter((m) => m.sender_id === userId)
    if (ownMsgs.length === 0) return map
    for (const { name, lastReadAt } of Object.values(memberReadMap)) {
      if (!lastReadAt) continue
      let target: Message | null = null
      for (const m of ownMsgs) {
        if (m.created_at <= lastReadAt) target = m
        else break
      }
      if (target) {
        if (!map[target.id]) map[target.id] = []
        map[target.id].push(name)
      }
    }
    return map
  }, [messages, memberReadMap, userId])

  async function handleReact(messageId: string, emoji: string) {
    setEmojiPickerFor(null)
    const existing = (reactions[messageId] ?? []).find(
      (r) => r.user_id === userId && r.emoji === emoji
    )
    if (existing) {
      // Optimistic remove
      setReactions((prev) => ({
        ...prev,
        [messageId]: (prev[messageId] ?? []).filter((r) => r.id !== existing.id),
      }))
      await supabase.from("message_reactions").delete().eq("id", existing.id)
    } else {
      // Optimistic add
      const tempId = `temp-${Date.now()}`
      setReactions((prev) => ({
        ...prev,
        [messageId]: [
          ...(prev[messageId] ?? []),
          { id: tempId, message_id: messageId, user_id: userId, emoji },
        ],
      }))
      const { data } = await supabase
        .from("message_reactions")
        .insert({ message_id: messageId, user_id: userId, emoji })
        .select("id")
        .single()
      if (data) {
        setReactions((prev) => ({
          ...prev,
          [messageId]: (prev[messageId] ?? []).map((r) =>
            r.id === tempId ? { ...r, id: data.id } : r
          ),
        }))
      }
    }
  }

  return (
    <>
    <div className={inline ? "flex flex-col h-full bg-[#FBF8F2] w-full" : "fixed inset-0 z-[100] bg-[#FBF8F2] flex flex-col md:left-[296px]"}>
    <div className={inline ? "w-full h-full flex flex-col" : "max-w-[390px] mx-auto w-full h-full flex flex-col md:max-w-none"}>
      {/* ── Top bar ── */}
      <div className={`flex-shrink-0 flex items-center gap-3 px-4 ${inline ? "pt-4" : "pt-12 md:pt-5"} pb-3 bg-white border-b border-[#ECE8DE]`}>
        <button
          onClick={onClose}
          className="size-8 bg-[#FBF8F2] rounded-full flex items-center justify-center hover:bg-[#F2EDE0] transition-colors flex-shrink-0"
        >
          <ArrowLeft className="w-4 h-4 text-[#6B7280]" />
        </button>
        <div className="flex-1 min-w-0">
          <h2 style={{ fontFamily: "var(--font-instrument-serif)", fontSize: "22px", color: "#13101A", letterSpacing: "-0.01em", lineHeight: 1.1 }} className="truncate">
            {displayName}
          </h2>
          <p style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: "10px", color: "#8A8497", letterSpacing: "0.08em", textTransform: "uppercase", marginTop: "2px" }}>
            {Object.keys(memberReadMap).length + 1} members · active
          </p>
        </div>
        <button
          onClick={() => setShowSettings(true)}
          className="size-8 bg-[#FBF8F2] rounded-full flex items-center justify-center hover:bg-[#F2EDE0] transition-colors flex-shrink-0"
        >
          <Settings className="w-4 h-4 text-[#6B7280]" />
        </button>
      </div>

      {/* ── Messages area ── */}
      <div className="flex-1 overflow-y-auto px-4 md:px-6 py-5">
        {loading ? (
          <Spinner />
        ) : messages.length === 0 ? (
          <div className="flex items-center justify-center h-full">
            <div className="text-center">
              <p className="text-[14px] font-semibold text-foreground/40">No messages yet</p>
              <p className="text-[12px] text-muted-foreground/40 mt-1">Say hello! 👋</p>
            </div>
          </div>
        ) : (
          <div className="flex flex-col gap-0.5">
            {messages.map((msg, i) => {
              const isOwn = msg.sender_id === userId
              const prevMsg = i > 0 ? messages[i - 1] : null
              const nextMsg = i < messages.length - 1 ? messages[i + 1] : null

              // Group = consecutive same-sender within same minute window
              const sameMinute = (a: Message, b: Message) =>
                a.sender_id === b.sender_id &&
                Math.abs(new Date(a.created_at).getTime() - new Date(b.created_at).getTime()) < 60000

              const isFirstInGroup = !prevMsg || !sameMinute(msg, prevMsg)
              const isLastInGroup = !nextMsg || !sameMinute(msg, nextMsg)

              // Corner treatment per bubble position in group
              const incomingRadius = isFirstInGroup && isLastInGroup
                ? "rounded-2xl rounded-tl-sm"
                : isFirstInGroup
                  ? "rounded-2xl rounded-tl-sm rounded-bl-md"
                  : isLastInGroup
                    ? "rounded-2xl rounded-tl-md"
                    : "rounded-2xl rounded-l-md"
              const outgoingRadius = isFirstInGroup && isLastInGroup
                ? "rounded-2xl rounded-tr-sm"
                : isFirstInGroup
                  ? "rounded-2xl rounded-tr-sm rounded-br-md"
                  : isLastInGroup
                    ? "rounded-2xl rounded-tr-md"
                    : "rounded-2xl rounded-r-md"

              const rxGroups = groupedReactions(msg.id)
              const groupGap = isFirstInGroup && i > 0 ? "mt-3" : ""
              return (
                <div
                  key={msg.id}
                  ref={(el) => { messageRefs.current[msg.id] = el }}
                  className={`flex flex-col relative ${isOwn ? "items-end" : "items-start"} ${groupGap}`}
                >
                  {/* Emoji picker — floats above the bubble */}
                  {emojiPickerFor === msg.id && (
                    <div
                      className={`absolute bottom-[calc(100%-4px)] z-[160] ${isOwn ? "right-0" : "left-0"}`}
                      onPointerDown={(e) => e.stopPropagation()}
                    >
                      <div className="bg-white rounded-2xl shadow-[0_4px_24px_rgba(0,0,0,0.12)] border border-[#EFEFEF] px-3 py-2.5 flex gap-3">
                        {REACTION_EMOJIS.map((emoji) => (
                          <button
                            key={emoji}
                            onClick={(e) => { e.stopPropagation(); handleReact(msg.id, emoji) }}
                            onPointerDown={(e) => e.stopPropagation()}
                            onPointerUp={(e) => e.stopPropagation()}
                            className="text-[22px] hover:scale-125 active:scale-95 transition-transform"
                          >
                            {emoji}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Context menu — floats above the bubble on long press */}
                  {contextMenuFor === msg.id && (
                    <div
                      className={`absolute bottom-[calc(100%+4px)] z-[160] ${isOwn ? "right-0" : "left-0"}`}
                      onPointerDown={(e) => e.stopPropagation()}
                    >
                      <div className="bg-white rounded-2xl shadow-lg border border-[#EFEFEF] overflow-hidden min-w-[140px]">
                        <button
                          onPointerDown={(e) => e.stopPropagation()}
                          onClick={(e) => {
                            e.stopPropagation()
                            setContextMenuFor(null)
                            setReplyingTo(msg)
                          }}
                          className="w-full text-left px-4 py-3 text-[14px] text-[#13101A] flex items-center gap-2.5 hover:bg-[#FBF8F2] active:bg-[#F3EDE6] transition-colors border-b border-[#F3EDE6]"
                        >
                          <CornerUpLeft className="w-4 h-4 text-[#6B7280]" />
                          Reply
                        </button>
                        {isOwn && (
                          <button
                            onPointerDown={(e) => e.stopPropagation()}
                            onClick={(e) => {
                              e.stopPropagation()
                              setContextMenuFor(null)
                              setDeletingId(msg.id)
                            }}
                            className="w-full text-left px-4 py-3 text-[14px] text-red-500 flex items-center gap-2.5 hover:bg-red-50 active:bg-red-100 transition-colors"
                          >
                            <Trash2 className="w-4 h-4" />
                            Delete
                          </button>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Group kicker: sender + time, shown once at top of each incoming group */}
                  {!isOwn && isFirstInGroup && (
                    <div className="flex items-center gap-2 mb-1 pl-9">
                      <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: "10px", color: "#8A8497", letterSpacing: "0.1em", textTransform: "uppercase" }}>
                        {msg.sender_name} · {formatMessageTime(msg.created_at)}
                      </span>
                    </div>
                  )}

                  {/* Incoming group: avatar at bottom-left of last bubble only */}
                  <div className={`flex items-end gap-2 w-full ${isOwn ? "flex-row-reverse" : "flex-row"}`}>
                    {!isOwn && (
                      <div className="flex-shrink-0 w-7">
                        {isLastInGroup ? (
                          <div
                            className={`w-7 h-7 flex items-center justify-center text-[11px] font-bold text-[#F6F4EF] flex-shrink-0 ${getAvatarColor(msg.sender_name)}`}
                            style={{ borderRadius: "10px" }}
                          >
                            {msg.sender_name.charAt(0).toUpperCase()}
                          </div>
                        ) : (
                          <div className="w-7 h-7" />
                        )}
                      </div>
                    )}
                  <div
                    onPointerDown={() => handlePointerDown(msg)}
                    onPointerUp={() => handlePointerUp(msg)}
                    onPointerLeave={handlePointerCancel}
                    onPointerCancel={handlePointerCancel}
                    className={`max-w-[75%] text-[14px] leading-[1.4] select-none ${
                      msg.deleted
                        ? isOwn
                          ? `bg-[#3E1540]/30 text-white/50 ${outgoingRadius} px-4 py-2`
                          : `bg-white border border-[#EFEFEF] text-[#9CA3AF] ${incomingRadius} px-4 py-2 shadow-[0_1px_2px_rgba(0,0,0,0.04)]`
                        : isOwn
                          ? `bg-[#3E1540] text-white ${outgoingRadius}`
                          : `bg-white border border-[#EFEFEF] text-[#13101A] ${incomingRadius} shadow-[0_1px_2px_rgba(0,0,0,0.04)]`
                    } ${!msg.deleted && msg.reply_to_id ? "" : !msg.deleted ? "px-4 py-2" : ""}`}
                  >
                    {msg.deleted ? (
                      <span className="italic text-[13px]">Message deleted</span>
                    ) : (
                      <>
                        {msg.reply_to_id && msg.reply_to_content && (
                          <div className="px-3 pt-2.5 pb-0">
                            <button
                              onPointerDown={(e) => e.stopPropagation()}
                              onClick={() => scrollToMessage(msg.reply_to_id!)}
                              className={`w-full text-left px-3 py-1.5 rounded-lg flex flex-col gap-0.5 ${
                                isOwn
                                  ? "bg-white/20 border-l-[3px] border-white/50"
                                  : "bg-[#F4F1E8] border-l-[3px] border-[#3E1540]"
                              }`}
                            >
                              <span className={`text-[11px] font-semibold flex items-center gap-1 ${isOwn ? "text-white/90" : "text-[#3E1540]"}`}>
                                <CornerUpLeft className="w-3 h-3" />
                                {msg.reply_to_sender}
                              </span>
                              <span className={`text-[12px] truncate ${isOwn ? "text-white/70" : "text-[#8A8497]"}`}>
                                {msg.reply_to_content.slice(0, 80)}
                              </span>
                            </button>
                          </div>
                        )}
                        <div className={msg.reply_to_id ? "px-4 pt-2 pb-2.5" : ""}>
                          {msg.content}
                        </div>
                      </>
                    )}
                  </div>
                  </div>{/* end avatar+bubble row */}

                  {/* Reaction pills — hidden on deleted messages */}
                  {!msg.deleted && rxGroups.length > 0 && (
                    <div className={`flex flex-wrap gap-1 mt-1 ${isOwn ? "pr-1" : "pl-9"}`}>
                      {rxGroups.map(({ emoji, count, userReacted }) => (
                        <button
                          key={emoji}
                          onPointerDown={(e) => e.stopPropagation()}
                          onClick={() => handleReact(msg.id, emoji)}
                          className={`flex items-center gap-0.5 px-2 py-0.5 rounded-full text-[12px] border transition-all active:scale-95 ${
                            userReacted
                              ? "bg-[#3E1540] border-[#3E1540]"
                              : "bg-white border-[#ECE8DE]"
                          }`}
                        >
                          <span>{emoji}</span>
                          <span className={`text-[11px] font-medium ${userReacted ? "text-[#F6F4EF]" : "text-[#8A8497]"}`}>
                            {count}
                          </span>
                        </button>
                      ))}
                    </div>
                  )}

                  {/* Inline delete confirmation */}
                  {deletingId === msg.id && (
                    <div
                      className={`flex items-center gap-2 mt-1 px-1 ${isOwn ? "justify-end" : "justify-start"}`}
                      onPointerDown={(e) => e.stopPropagation()}
                    >
                      <span className="text-[12px] text-[#6B7280]">Delete this message?</span>
                      <button
                        onClick={() => handleDeleteMessage(msg.id)}
                        className="text-[12px] font-semibold text-red-500 hover:text-red-600 transition-colors"
                      >
                        Delete
                      </button>
                      <button
                        onClick={() => setDeletingId(null)}
                        className="text-[12px] text-[#9CA3AF] hover:text-[#6B7280] transition-colors"
                      >
                        Cancel
                      </button>
                    </div>
                  )}

                  {isLastInGroup && (
                    <div className={`flex items-center gap-1.5 mt-1 ${isOwn ? "pr-1" : "pl-9"}`}>
                      {isOwn && (readReceiptMap[msg.id]?.length ?? 0) > 0 && (
                        <div className="flex items-center">
                          {[userName, ...readReceiptMap[msg.id]].map((name, idx) => (
                            <Avatar
                              key={`${name}-${idx}`}
                              title={idx === 0 ? "You" : `Read by ${name}`}
                              className={`w-4 h-4 flex-shrink-0 border border-[#FBF8F2] ${getAvatarColor(name)}${idx > 0 ? " -ml-1" : ""}`}
                            >
                              <AvatarFallback
                                className="text-white bg-transparent"
                                style={{ fontSize: "6px", fontWeight: 700 }}
                              >
                                {name.charAt(0).toUpperCase()}
                              </AvatarFallback>
                            </Avatar>
                          ))}
                        </div>
                      )}
                      <span className="text-[10px] text-[#C4C4C4]">
                        {formatMessageTime(msg.created_at)}
                      </span>
                    </div>
                  )}
                </div>
              )
            })}
            <div ref={bottomRef} />
          </div>
        )}
      </div>

      {/* ── Reply preview bar ── */}
      {replyingTo && (
        <div className="flex-shrink-0 bg-white border-t border-[#ECE8DE] px-4 py-2 flex items-start gap-3">
          <div className="flex-1 border-l-2 border-[#3E1540] pl-2.5 min-w-0">
            <p className="text-[11px] font-semibold text-[#3E1540] flex items-center gap-1 mb-0.5">
              <CornerUpLeft className="w-3 h-3 flex-shrink-0" />
              {replyingTo.sender_name}
            </p>
            <p className="text-[12px] text-[#9CA3AF] truncate">
              {replyingTo.content.slice(0, 60)}
            </p>
          </div>
          <button
            onClick={() => setReplyingTo(null)}
            className="flex-shrink-0 mt-0.5 text-[#C4C4C4] hover:text-[#6B7280] transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* ── Input bar ── */}
      <div className="flex-shrink-0 bg-white border-t border-[#ECE8DE] px-4 py-3 flex items-end gap-2">
        <textarea
          value={inputText}
          onChange={(e) => setInputText(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Message…"
          rows={1}
          className="flex-1 resize-none bg-[#FBF8F2] rounded-full px-4 py-2.5 text-[14px] text-[#13101A] placeholder:text-[#C4C4C4] focus:outline-none border-none max-h-28 overflow-y-auto"
          style={{ lineHeight: "1.5" }}
        />
        <button
          onClick={handleSend}
          disabled={!inputText.trim() || sending}
          className="size-9 rounded-full bg-[#3E1540] flex items-center justify-center flex-shrink-0 disabled:opacity-40 hover:bg-[#2D0F2E] transition-all active:scale-95 ml-1"
        >
          <Send className="w-4 h-4 text-white" />
        </button>
      </div>
      {/* Overlay to dismiss emoji picker / context menu — inside z-[100] stacking context so picker at z-[160] sits above it */}
      {(emojiPickerFor || contextMenuFor) && (
        <div
          className="fixed inset-0 z-[155] md:left-[296px]"
          onClick={() => { setEmojiPickerFor(null); setContextMenuFor(null) }}
        />
      )}
    </div>
    </div>

    {showSettings && (
      <ChatSettings
        groupId={groupId}
        groupName={displayName}
        groupType={groupType}
        userId={userId}
        userRole={userRole}
        onBack={() => setShowSettings(false)}
        onNameChange={(name) => setDisplayName(name)}
        onClose={() => { setShowSettings(false); onClose() }}
      />
    )}
    </>
  )
}

// ─── Chats Tab ──────────────────────────────────────────────────────────────

interface ChatsTabProps {
  userId: string
  userProfile: Profile
  userRole: string
  ministryId: string
  ministryName: string
  onOpenChat: (id: string, name: string) => void
  onTotalUnreadChange: (count: number) => void
  refreshKey: number
  onOpenDirectory: () => void
  activeGroupId?: string | null
}

function ChatsTab({ userId, userProfile, userRole, ministryId, ministryName, onOpenChat, onTotalUnreadChange, refreshKey, onOpenDirectory, activeGroupId }: ChatsTabProps) {
  const supabase = createClient()
  const [subTab, setSubTab] = useState<"church" | "my">("church")
  const [churchChats, setChurchChats] = useState<ChatGroup[]>([])
  const [archivedChurchChats, setArchivedChurchChats] = useState<ChatGroup[]>([])
  const [myChats, setMyChats] = useState<ChatGroup[]>([])
  const [loading, setLoading] = useState(true)
  const [showCreateChat, setShowCreateChat] = useState<"my" | "church" | null>(null)
  const [showArchived, setShowArchived] = useState(false)
  const [search, setSearch] = useState("")

  const isAdminOrLeader = ["admin", "leader"].includes(userRole.toLowerCase())

  useEffect(() => {
    async function load() {
      const { data } = await supabase
        .from("group_members")
        .select("groups(id, name, type, archived), last_read_at")
        .eq("user_id", userId)

      type RawMember = {
        groups: { id: string; name: string; type: string; archived: boolean | null } | { id: string; name: string; type: string; archived: boolean | null }[] | null
        last_read_at: string | null
      }

      const allWithLastRead = (data ?? [])
        .map((m: RawMember) => {
          if (!m.groups) return null
          const g = Array.isArray(m.groups) ? m.groups[0] : m.groups
          if (!g) return null
          return {
            id: g.id,
            name: g.name,
            type: g.type,
            archived: g.archived ?? false,
            last_message: null,
            last_sender: null,
            last_message_time: null,
            unread_count: 0,
            _lastReadAt: m.last_read_at,
          }
        })
        .filter(Boolean) as (ChatGroup & { _lastReadAt: string | null })[]

      // Fetch unread counts + last message preview in parallel per group
      const withUnread = await Promise.all(
        allWithLastRead.map(async ({ _lastReadAt, ...group }) => {
          let countQuery = supabase
            .from("messages")
            .select("*", { count: "exact", head: true })
            .eq("group_id", group.id)
            .neq("sender_id", userId)
          if (_lastReadAt) countQuery = countQuery.gt("created_at", _lastReadAt)

          const [{ count }, { data: lastMsgData }] = await Promise.all([
            countQuery,
            supabase
              .from("messages")
              .select("content, created_at, profiles!sender_id(name)")
              .eq("group_id", group.id)
              .order("created_at", { ascending: false })
              .limit(1)
              .maybeSingle(),
          ])

          const senderProfile = lastMsgData
            ? (Array.isArray(lastMsgData.profiles) ? lastMsgData.profiles[0] : lastMsgData.profiles) as { name: string } | null
            : null

          return {
            ...group,
            unread_count: count ?? 0,
            last_message: lastMsgData?.content ?? null,
            last_sender: senderProfile?.name ?? null,
            last_message_time: lastMsgData?.created_at ?? null,
          }
        })
      )

      // Sort by most recent message first (nulls last)
      withUnread.sort((a, b) => {
        if (!a.last_message_time && !b.last_message_time) return 0
        if (!a.last_message_time) return 1
        if (!b.last_message_time) return -1
        return b.last_message_time.localeCompare(a.last_message_time)
      })

      setChurchChats(withUnread.filter((g) => g.type === "church" && !g.archived))
      setArchivedChurchChats(withUnread.filter((g) => g.type === "church" && g.archived))
      setMyChats(withUnread.filter((g) => g.type !== "church"))

      const total = withUnread.filter((g) => !g.archived).reduce((s, g) => s + g.unread_count, 0)
      onTotalUnreadChange(total)
      setLoading(false)
    }
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId, refreshKey])

  const rawActive = subTab === "church" ? churchChats : myChats
  const active = search.trim()
    ? rawActive.filter((g) => g.name.toLowerCase().includes(search.trim().toLowerCase()))
    : rawActive
  const showPlusButton = subTab === "my" || (subTab === "church" && isAdminOrLeader)

  const monoStyle: React.CSSProperties = {
    fontFamily: "ui-monospace, 'SF Mono', Menlo, monospace",
    fontSize: "10px",
    letterSpacing: "0.06em",
    textTransform: "uppercase",
    color: "#8A8497",
  }

  return (
    <div className="pb-2 md:pb-0 md:h-full md:flex md:flex-col">
      {/* Desktop Plan C header */}
      <div className="hidden md:block px-4 pt-5 pb-4 border-b border-[#E5E0D2] flex-shrink-0">
        <p style={monoStyle}>Workspace</p>
        <p style={{ fontFamily: "var(--font-instrument-serif)", fontSize: "22px", lineHeight: 1.1, color: "#13101A", marginTop: "4px" }}>Chats</p>
      </div>

      {/* Desktop search */}
      <div className="hidden md:flex items-center gap-2 mx-3 my-3 px-3 py-2 border border-[#E5E0D2] rounded-lg bg-[#F4F1E8] text-[#8A8497] flex-shrink-0">
        <Search className="w-3.5 h-3.5 flex-shrink-0" />
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search messages"
          className="flex-1 text-[12px] bg-transparent outline-none placeholder:text-[#8A8497] text-[#13101A]"
        />
      </div>

      <div className="px-5 pt-14 pb-2 md:pt-2 md:px-2 md:flex-1 md:overflow-y-auto">
      {/* Mobile header */}
      <div className="flex items-center justify-between mb-6 md:hidden">
        <div className="flex items-center gap-2.5">
          <svg width="26" height="26" viewBox="0 0 100 100" fill="none">
            <circle cx="50" cy="50" r="44" stroke="#3E1540" strokeWidth="6" />
            <rect x="47" y="22" width="6" height="56" fill="#3E1540" />
            <rect x="22" y="47" width="56" height="6" fill="#3E1540" />
          </svg>
          <span style={{ fontFamily: "var(--font-instrument-serif)", fontSize: "28px", color: "#13101A", letterSpacing: "-0.01em", lineHeight: 1 }}>{ministryName}</span>
        </div>
        <button
          onClick={onOpenDirectory}
          className="w-9 h-9 flex items-center justify-center rounded-xl hover:bg-[#F0EEF8] transition-colors"
          aria-label="Directory"
        >
          <Users className="w-5 h-5 text-[#3E1540]" />
        </button>
      </div>

      {/* Sub-tab switcher — mobile pill / desktop mono labels */}
      <div className="flex items-center gap-1 bg-[#FBF8F2] rounded-xl p-1 mb-5 md:bg-transparent md:p-0 md:mb-1 md:mx-1">
        {(["church", "my"] as const).map((t) => (
          <button
            key={t}
            onClick={() => { setSubTab(t); setSearch("") }}
            className={`flex-1 py-2 rounded-lg text-[12px] font-semibold transition-all
              md:py-1.5 md:px-2 md:rounded-lg md:text-left md:flex-none
              ${subTab === t
                ? "bg-white text-[#3E1540] shadow-sm md:bg-[#EFEAE0] md:shadow-none md:text-[#13101A]"
                : "text-[#9CA3AF] hover:text-[#3E1540]/70 md:text-[#8A8497] md:hover:bg-[#F4F1E8] md:bg-transparent"
              }`}
            style={subTab === t && window?.innerWidth >= 768 ? {} : {}}
          >
            {t === "church" ? "Church Chats" : "My Chats"}
          </button>
        ))}
      </div>

      {/* Search bar — mobile only (desktop has one in the panel header above) */}
      <div className="relative mb-4 md:hidden">
        <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground/40" />
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search chats…"
          className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-[#FBF8F2] text-[13px] placeholder:text-[#C4C4C4] text-[#13101A] focus:outline-none focus:ring-2 focus:ring-[#3E1540]/20 border border-[#EFEFEF] focus:border-[#3E1540]/30 transition-all"
        />
      </div>

      {/* Section header with + button */}
      <div className="flex items-center justify-between mb-3">
        <h3 style={{ fontFamily: "var(--font-instrument-serif)", fontSize: "26px", color: "#13101A", fontWeight: 400, letterSpacing: "-0.01em", lineHeight: 1, margin: 0 }}
          className="md:hidden">
          {subTab === "church" ? "Church chats" : "My chats"}
        </h3>
        {/* Desktop mono section label */}
        <p className="hidden md:block mx-1 mb-1" style={{ fontFamily: "ui-monospace, 'SF Mono', Menlo, monospace", fontSize: "10px", letterSpacing: "0.06em", textTransform: "uppercase", color: "#8A8497" }}>
          {subTab === "church" ? `Church · ${churchChats.length}` : `Direct · ${myChats.length}`}
        </p>
        {showPlusButton && (
          <button
            onClick={() => setShowCreateChat(subTab)}
            className="size-8 rounded-xl bg-[#FBF8F2] border border-[#ECE8DE] flex items-center justify-center hover:bg-[#F2EDE0] active:scale-95 transition-all md:size-7 md:rounded-lg"
          >
            <Plus className="w-4 h-4 text-[#3E1540] md:w-3.5 md:h-3.5" />
          </button>
        )}
      </div>

      {loading ? (
        <Spinner />
      ) : active.length === 0 && !(subTab === "church" && archivedChurchChats.length > 0) ? (
        <EmptyState
          icon={<Users className="w-7 h-7" />}
          title={search.trim() ? "No chats found" : subTab === "church" ? "No church chats" : "No personal chats"}
          subtitle={
            search.trim()
              ? `No chats match "${search.trim()}"`
              : subTab === "church"
              ? "You haven't been added to any church chats yet"
              : "Tap + to start a new chat"
          }
        />
      ) : (
        <div className="flex flex-col gap-2.5 md:gap-0.5">
          {active.map((group, i) => (
            <ChatGroupCard key={group.id} group={group} onClick={() => onOpenChat(group.id, group.name)} isActive={activeGroupId === group.id} />
          ))}

          {/* Archived section (Church Chats only) */}
          {subTab === "church" && archivedChurchChats.length > 0 && (
            <div className="mt-2">
              <button
                onClick={() => setShowArchived((s) => !s)}
                className="w-full flex items-center justify-between py-3 px-1"
              >
                <span className="text-[11px] font-bold text-muted-foreground/40 uppercase tracking-wider">
                  Archived · {archivedChurchChats.length}
                </span>
                <ChevronDown className={`w-4 h-4 text-muted-foreground/30 transition-transform duration-200 ${showArchived ? "rotate-180" : ""}`} />
              </button>
              {showArchived && (
                <div className="flex flex-col gap-2.5">
                  {archivedChurchChats.map((group) => (
                    <div key={group.id} className="opacity-50">
                      <ChatGroupCard group={group} onClick={() => onOpenChat(group.id, group.name)} />
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {showCreateChat && (
        <CreateChatScreen
          userId={userId}
          userName={userProfile.name}
          ministryId={ministryId}
          groupType={showCreateChat}
          onClose={() => setShowCreateChat(null)}
          onCreated={(group) => {
            setShowCreateChat(null)
            onOpenChat(group.id, group.name)
          }}
        />
      )}
      </div>{/* end inner scroll div */}

      {/* Desktop: New chat button at bottom */}
      <div className="hidden md:block mx-3 mt-auto pt-2 pb-3 flex-shrink-0">
        <button
          onClick={() => setShowCreateChat("my")}
          className="w-full flex items-center justify-center gap-1.5 py-2 border border-[#E5E0D2] rounded-lg text-[12px] text-[#5A5466] hover:bg-[#F4F1E8] transition-colors"
        >
          <Plus className="w-3.5 h-3.5" />
          New chat
        </button>
      </div>
    </div>
  )
}

function ChatGroupCard({ group, onClick, isActive }: { group: ChatGroup; onClick: () => void; isActive?: boolean }) {
  const avatarBg = getAvatarColor(group.name) === "bg-[#3E1540]" ? "#3E1540" : "#13101A"
  const firstInitial = group.name.charAt(0)

  return (
    <button onClick={onClick} className="w-full text-left group">
      {/* Mobile style */}
      <div className="md:hidden bg-[#FBF8F2] border border-[#ECE8DE] rounded-[18px] p-4 hover:bg-[#F5F0E8] transition-colors">
        <div className="flex items-center gap-3.5">
          <Avatar className="w-12 h-12 flex-shrink-0" style={{ background: avatarBg, borderRadius: "16px" }}>
            <AvatarFallback className="text-[#F6F4EF] bg-transparent" style={{ fontFamily: "var(--font-instrument-serif)", fontSize: "22px", fontWeight: 400 }}>
              {firstInitial}
            </AvatarFallback>
          </Avatar>
          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between mb-1">
              <h3 className="text-[15px] font-semibold text-[#13101A] truncate pr-2">{group.name}</h3>
              {group.last_message_time && <span className="text-[11px] text-[#8A8497] flex-shrink-0">{formatRelativeTime(group.last_message_time)}</span>}
            </div>
            <div className="flex items-center justify-between gap-2">
              <p className="text-[13px] text-[#5A5466] truncate">
                {group.last_message
                  ? group.last_sender ? <><span className="font-semibold text-[#5A5466]">{group.last_sender}:</span> {group.last_message}</> : group.last_message
                  : <span className="italic text-[#8A8497]">No messages yet</span>}
              </p>
              {group.unread_count > 0 && (
                <span className="w-6 h-6 bg-[#C9A34B] rounded-full text-[11px] font-bold text-[#13101A] flex items-center justify-center flex-shrink-0">{group.unread_count}</span>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Desktop Plan C panel item style */}
      <div
        className="hidden md:flex items-center gap-2.5 px-2 py-2 rounded-lg hover:bg-[#F4F1E8] transition-colors"
        style={{
          background: isActive ? "#EFEAE0" : "transparent",
          borderLeft: isActive ? "2px solid #3E1540" : "2px solid transparent",
        }}
      >
        <div style={{
          width: 28, height: 28, borderRadius: 8, flexShrink: 0,
          background: avatarBg, color: "#F6F4EF",
          display: "grid", placeItems: "center",
          fontFamily: "var(--font-instrument-serif)", fontSize: "13px",
        }}>
          {firstInitial}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: "13px", fontWeight: group.unread_count ? 600 : 500, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{group.name}</div>
          {group.last_message && (
            <div style={{ fontSize: "11px", color: "#8A8497", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
              {group.last_sender ? `${group.last_sender}: ${group.last_message}` : group.last_message}
            </div>
          )}
        </div>
        {group.unread_count > 0 && (
          <span style={{ fontSize: "10px", fontWeight: 700, color: "#13101A", background: "#C9A34B", padding: "1px 6px", borderRadius: 999 }}>{group.unread_count}</span>
        )}
      </div>
    </button>
  )
}

// ─── Directory Tab ───────────────────────────────────────────────────────────

interface DirectoryMember {
  id: string
  name: string
  graduation_year: number | null
  role: string
  email: string
  about_me: string | null
  bible_verse: string | null
  prayer_request: string | null
  pray_for_me: string | null
}

function DirectoryTab({ currentUserId, currentUserName, ministryId, ministryName, onOpenChat, onBack }: { currentUserId: string; currentUserName: string; ministryId: string; ministryName: string; onOpenChat: (id: string, name: string) => void; onBack?: () => void }) {
  const supabase = createClient()
  const [members, setMembers] = useState<DirectoryMember[]>([])
  const [search, setSearch] = useState("")
  const [loading, setLoading] = useState(true)
  const [selected, setSelected] = useState<DirectoryMember | null>(null)

  useEffect(() => {
    async function load() {
      const { data } = await supabase
        .from("profiles")
        .select("id, name, graduation_year, role, email, about_me, bible_verse, prayer_request, pray_for_me")
        .eq("ministry_id", ministryId)
        .order("name")
      setMembers(data ?? [])
      setLoading(false)
    }
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const filtered = members.filter((m) =>
    m.name.toLowerCase().includes(search.toLowerCase())
  )

  const monoStyle: React.CSSProperties = {
    fontFamily: "ui-monospace, 'SF Mono', Menlo, monospace",
    fontSize: "10px",
    letterSpacing: "0.06em",
    textTransform: "uppercase",
    color: "#8A8497",
  }

  return (
    <div className="pb-2 md:pb-0">
      {/* Desktop Topbar */}
      <DesktopTopbar crumbs={["Central", "Directory"]} right={
        <div className="hidden md:flex items-center gap-2 px-3 py-1.5 border border-[#E5E0D2] rounded-full bg-[#F4F1E8] text-[#8A8497]" style={{ width: "280px" }}>
          <Search className="w-3.5 h-3.5 flex-shrink-0" />
          <input
            type="text"
            placeholder="Search by name, year, prayer…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="flex-1 text-[12px] bg-transparent outline-none placeholder:text-[#8A8497] text-[#13101A]"
          />
        </div>
      } />

      {/* Mobile Header */}
      <div className="px-5 pt-14 pb-5 md:hidden">
        <div className="flex items-center gap-2.5 mb-4">
          {onBack && (
            <button onClick={onBack} className="w-9 h-9 flex items-center justify-center rounded-xl hover:bg-[#F0EEF8] transition-colors -ml-1 mr-0.5" aria-label="Back">
              <ArrowLeft className="w-5 h-5 text-[#3E1540]" />
            </button>
          )}
          <span style={{ fontFamily: "var(--font-instrument-serif)", fontSize: "32px", color: "#13101A", letterSpacing: "-0.01em", lineHeight: 1 }}>Directory</span>
        </div>
        <div className="relative">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-[#C4C4C4]" />
          <input
            type="text"
            placeholder="Search members…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-10 pr-4 py-3 rounded-xl bg-[#FBF8F2] border border-[#EFEFEF] text-[13px] placeholder:text-[#C4C4C4] text-[#13101A] focus:outline-none focus:ring-2 focus:ring-[#3E1540]/20 focus:border-[#3E1540]/30 transition-all"
          />
        </div>
      </div>

      {/* Desktop Editorial Header */}
      <div className="hidden md:flex items-end justify-between px-14 pt-11 pb-8 border-b border-[#E5E0D2]" style={{ gap: "24px" }}>
        <div>
          <p style={monoStyle}>{members.length} members · {members.filter(m => ["admin","leader"].includes(m.role.toLowerCase())).length} leaders</p>
          <h1 style={{ margin: "14px 0 0", fontFamily: "var(--font-instrument-serif)", fontWeight: 400, fontSize: "52px", lineHeight: 1.05, letterSpacing: "-0.01em", color: "#13101A" }}>
            Directory
          </h1>
          <p style={{ marginTop: "12px", color: "#5A5466", fontSize: "14px", maxWidth: "560px" }}>
            Names, faces, what they&apos;re carrying. A chance to know and pray.
          </p>
        </div>
      </div>

      {loading ? (
        <div className="px-5 md:px-14"><Spinner /></div>
      ) : filtered.length === 0 ? (
        <div className="px-5 md:px-14">
          <EmptyState
            icon={<Users className="w-7 h-7" />}
            title="No members found"
            subtitle={search ? "Try a different name" : "No members in the directory yet"}
          />
        </div>
      ) : (
        <>
          {/* Mobile card list */}
          <div className="md:hidden px-5 pb-4 flex flex-col gap-3">
            {filtered.map((member) => (
              <button
                key={member.id}
                onClick={() => setSelected(member)}
                className="w-full bg-white rounded-2xl border border-[#EFEFEF] p-4 shadow-[0_1px_3px_rgba(0,0,0,0.06)] hover:shadow-[0_2px_8px_rgba(0,0,0,0.08)] transition-all text-left"
              >
                <div className="flex items-center gap-3.5">
                  <Avatar className="w-11 h-11 bg-[#3E1540]">
                    <AvatarFallback className="text-white font-bold text-[11px] bg-transparent tracking-wide">{getInitials(member.name)}</AvatarFallback>
                  </Avatar>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <h3 className="font-semibold text-foreground text-[14px] tracking-tight">{member.name}</h3>
                      {member.id === currentUserId && (
                        <span className="text-[10px] bg-[#FBF8F2] text-[#9CA3AF] font-semibold px-2.5 py-0.5 rounded-full uppercase tracking-wide">You</span>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      {member.graduation_year && <span className="text-[11px] text-muted-foreground/60 font-medium">Class of {member.graduation_year}</span>}
                      {member.role && (
                        <span className={`text-[10px] font-semibold px-2.5 py-0.5 rounded-full uppercase tracking-wide ${["admin","leader"].includes(member.role.toLowerCase()) ? "bg-[#3E1540] text-white" : "bg-[#F3EDE6] text-[#3E1540]"}`}>
                          {member.role}
                        </span>
                      )}
                    </div>
                  </div>
                  <ChevronRight className="w-4 h-4 text-[#E0DDF0] flex-shrink-0" />
                </div>
              </button>
            ))}
          </div>

          {/* Desktop table */}
          <div className="hidden md:block px-14 py-7">
            <div className="rounded-xl border border-[#E5E0D2] bg-[#FBF8F2] overflow-hidden">
              <div className="grid px-5 py-2.5 border-b border-[#E5E0D2]" style={{ gridTemplateColumns: "1.4fr 100px 1fr 1.4fr 60px", gap: "12px" }}>
                {["Name", "Class", "Role", "Praying for", ""].map((h, i) => (
                  <span key={i} style={monoStyle}>{h}</span>
                ))}
              </div>
              {filtered.map((member, i) => (
                <button
                  key={member.id}
                  onClick={() => setSelected(member)}
                  className="w-full grid px-5 py-3 text-left items-center hover:bg-[#F4F1E8] transition-colors"
                  style={{ gridTemplateColumns: "1.4fr 100px 1fr 1.4fr 60px", gap: "12px", borderTop: i ? "1px solid #EFEAE0" : undefined }}
                >
                  <div className="flex items-center gap-3">
                    <div style={{
                      width: 32, height: 32, borderRadius: 8, flexShrink: 0,
                      background: i % 2 === 0 ? "#3E1540" : "#13101A",
                      color: "#F6F4EF", display: "grid", placeItems: "center",
                      fontSize: "11px", fontWeight: 600,
                    }}>
                      {getInitials(member.name)}
                    </div>
                    <div>
                      <div style={{ fontSize: "13px", fontWeight: 500 }}>
                        {member.name}
                        {member.id === currentUserId && (
                          <span style={{ fontSize: "10px", color: "#8A8497", letterSpacing: "0.6px", textTransform: "uppercase", marginLeft: "6px" }}>You</span>
                        )}
                      </div>
                      <div style={{ fontSize: "11px", color: "#8A8497" }}>{member.email}</div>
                    </div>
                  </div>
                  <div style={{ fontSize: "12px", color: "#5A5466", fontVariantNumeric: "tabular-nums" }}>
                    {member.graduation_year ? `'${String(member.graduation_year).slice(2)}` : "—"}
                  </div>
                  <div>
                    <span style={{
                      fontSize: "10px", letterSpacing: "0.8px", padding: "3px 9px", borderRadius: "6px",
                      background: ["admin","leader"].includes(member.role.toLowerCase()) ? "#3E1540" : "#F4F1E8",
                      color: ["admin","leader"].includes(member.role.toLowerCase()) ? "#F6F4EF" : "#13101A",
                      border: ["admin","leader"].includes(member.role.toLowerCase()) ? "none" : "1px solid #E5E0D2",
                      textTransform: "uppercase", fontWeight: 600,
                    }}>{member.role}</span>
                  </div>
                  <div style={{ fontSize: "12px", color: "#5A5466", fontStyle: "italic", fontFamily: "var(--font-instrument-serif)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                    {member.pray_for_me || "—"}
                  </div>
                  <div className="flex justify-end">
                    <ChevronRight className="w-4 h-4 text-[#C4C4C4]" />
                  </div>
                </button>
              ))}
            </div>
          </div>
        </>
      )}

      {/* Member Detail Sheet */}
      {selected && (
        <MemberSheet
          member={selected}
          currentUserId={currentUserId}
          currentUserName={currentUserName}
          onClose={() => setSelected(null)}
          onOpenChat={(id, name) => {
            setSelected(null)
            onOpenChat(id, name)
          }}
        />
      )}
    </div>
  )
}

function MemberSheet({
  member,
  currentUserId,
  currentUserName,
  onClose,
  onOpenChat,
}: {
  member: DirectoryMember
  currentUserId: string
  currentUserName: string
  onClose: () => void
  onOpenChat: (id: string, name: string) => void
}) {
  const supabase = createClient()
  const [dmLoading, setDmLoading] = useState(false)
  const isOwnProfile = member.id === currentUserId

  async function handleSendMessage() {
    setDmLoading(true)

    // Check for an existing DM between these two users
    const { data: myGroups } = await supabase
      .from("group_members")
      .select("group_id, groups!inner(type)")
      .eq("user_id", currentUserId)

    const myDmGroupIds = (myGroups ?? [])
      .filter((m: { groups: { type: string } | { type: string }[] | null }) => {
        const g = Array.isArray(m.groups) ? m.groups[0] : m.groups
        return g?.type === "dm"
      })
      .map((m: { group_id: string }) => m.group_id)

    if (myDmGroupIds.length > 0) {
      const { data: shared } = await supabase
        .from("group_members")
        .select("group_id")
        .eq("user_id", member.id)
        .in("group_id", myDmGroupIds)
        .limit(1)

      if (shared && shared.length > 0) {
        setDmLoading(false)
        onOpenChat(shared[0].group_id, member.name)
        return
      }
    }

    // No existing DM — create one named after the other person
    const { group: newGroup, error: dmErr } = await createGroup({
      name: member.name,
      type: "dm",
      memberIds: [member.id],
      createdBy: currentUserId,
    })

    setDmLoading(false)
    if (dmErr || !newGroup) return
    onOpenChat(newGroup.id, newGroup.name)
  }

  return (
    <div className="fixed inset-0 z-[60] bg-white flex flex-col md:bg-black/20 md:backdrop-blur-sm md:items-center md:justify-center">
      <div className="max-w-[390px] mx-auto w-full h-full flex flex-col bg-white md:max-w-[580px] md:h-auto md:max-h-[88vh] md:rounded-2xl md:shadow-2xl md:overflow-hidden">

        {/* Header */}
        <div className="flex-shrink-0 flex items-center gap-3 px-4 pt-12 pb-3 md:pt-5 bg-white border-b border-[#ECE8DE]">
          <button
            onClick={onClose}
            className="size-8 bg-[#FBF8F2] rounded-full flex items-center justify-center hover:bg-[#F2EDE0] transition-colors flex-shrink-0"
          >
            <ArrowLeft className="w-4 h-4 text-[#6B7280]" />
          </button>
          <Avatar className={`w-9 h-9 flex-shrink-0 rounded-full ${getAvatarColor(member.name)}`}>
            <AvatarFallback className="text-white font-bold text-[13px] bg-transparent">
              {getInitials(member.name)}
            </AvatarFallback>
          </Avatar>
          <h2 className="flex-1 min-w-0 text-[15px] font-bold text-foreground tracking-tight truncate">
            {member.name}
          </h2>
        </div>

        {/* Scrollable content */}
        <div className="flex-1 overflow-y-auto px-5 py-6">
          {/* Avatar hero + name + meta */}
          <div className="flex flex-col items-center mb-7">
            <Avatar className={`w-20 h-20 ${getAvatarColor(member.name)} mb-4 shadow-lg shadow-[#3E1540]/20`}>
              <AvatarFallback className="text-white font-bold text-2xl bg-transparent">
                {getInitials(member.name)}
              </AvatarFallback>
            </Avatar>
            <h1 className="text-[22px] font-bold text-foreground tracking-tight mb-2">{member.name}</h1>
            <div className="flex items-center gap-2 flex-wrap justify-center">
              {member.graduation_year && (
                <span className="text-[12px] text-muted-foreground/60">
                  Class of {member.graduation_year}
                </span>
              )}
              {member.role && (
                <span className={`text-[10px] font-semibold px-2.5 py-1 rounded-full uppercase tracking-wide ${member.role.toLowerCase() === "admin" || member.role.toLowerCase() === "leader" ? "bg-[#3E1540] text-white shadow-sm shadow-[#3E1540]/30" : "bg-[#F3EDE6] text-[#3E1540]"}`}>
                  {member.role}
                </span>
              )}
              {isOwnProfile && (
                <span className="text-[10px] bg-[#3E1540]/10 text-[#3E1540] font-semibold px-2.5 py-1 rounded-full uppercase tracking-wide">
                  You
                </span>
              )}
            </div>
          </div>

          {/* Fields */}
          <div className="flex flex-col gap-3">
            {member.bible_verse && (
              <div className="bg-white rounded-2xl p-5 border border-[#EFEFEF] shadow-[0_1px_3px_rgba(0,0,0,0.06)]">
                <p style={{ fontFamily: "var(--font-instrument-serif)", fontSize: "14px", color: "#3E1540", fontWeight: 400, marginBottom: "6px" }}>
                  Bible verse
                </p>
                <p className="text-[13px] text-[#374151] italic leading-relaxed">
                  &ldquo;{member.bible_verse}&rdquo;
                </p>
              </div>
            )}

            {member.prayer_request && (
              <div className="bg-white rounded-2xl p-5 border border-[#EFEFEF] shadow-[0_1px_3px_rgba(0,0,0,0.06)]">
                <p style={{ fontFamily: "var(--font-instrument-serif)", fontSize: "14px", color: "#3E1540", fontWeight: 400, marginBottom: "6px" }}>
                  Prayer request
                </p>
                <p className="text-[13px] text-[#374151] leading-relaxed">{member.prayer_request}</p>
              </div>
            )}

            {member.pray_for_me && (
              <div className="bg-white rounded-2xl p-5 border border-[#EFEFEF] shadow-[0_1px_3px_rgba(0,0,0,0.06)]">
                <p style={{ fontFamily: "var(--font-instrument-serif)", fontSize: "14px", color: "#3E1540", fontWeight: 400, marginBottom: "6px" }}>
                  How to pray for me
                </p>
                <p className="text-[13px] text-[#374151] leading-relaxed">{member.pray_for_me}</p>
              </div>
            )}

            {member.about_me && (
              <div className="bg-white rounded-2xl p-5 border border-[#EFEFEF] shadow-[0_1px_3px_rgba(0,0,0,0.06)]">
                <p style={{ fontFamily: "var(--font-instrument-serif)", fontSize: "14px", color: "#3E1540", fontWeight: 400, marginBottom: "6px" }}>
                  About
                </p>
                <p className="text-[13px] text-[#374151] leading-relaxed">{member.about_me}</p>
              </div>
            )}

            {!member.bible_verse && !member.prayer_request && !member.pray_for_me && !member.about_me && (
              <div className="flex items-center justify-center py-10">
                <p className="text-[13px] text-muted-foreground/40">No details shared yet</p>
              </div>
            )}
          </div>
        </div>

        {/* Pinned Send Message button */}
        {!isOwnProfile && (
          <div className="flex-shrink-0 bg-white border-t border-[#ECE8DE] px-5 py-4">
            <button
              onClick={handleSendMessage}
              disabled={dmLoading}
              className="w-full bg-[#3E1540] hover:bg-[#2D0F2E] disabled:opacity-60 text-white font-semibold py-4 rounded-xl transition-colors text-[14px] tracking-wide shadow-lg shadow-[#3E1540]/25 active:scale-[0.98]"
            >
              {dmLoading ? "Opening chat…" : "Send Message"}
            </button>
          </div>
        )}

      </div>
    </div>
  )
}

// ─── Journal Section ─────────────────────────────────────────────────────────

const STATUS_CONFIG: Record<string, { label: string; bg: string; text: string }> = {
  praying:  { label: "Praying",  bg: "#EDE5F0", text: "#3E1540" },
  answered: { label: "Answered", bg: "#D1FAE5", text: "#065F46" },
  ongoing:  { label: "Ongoing",  bg: "#FEF3C7", text: "#92400E" },
}

function fmtJournalDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
}

function JournalDevotionalsTab({ userId, ministryId }: { userId: string; ministryId: string }) {
  const supabase = createClient()
  const imageInputRef = useRef<HTMLInputElement>(null)
  const [entries, setEntries] = useState<Devotional[]>([])
  const [loading, setLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState("")
  const [showEditor, setShowEditor] = useState(false)
  const [editingEntry, setEditingEntry] = useState<Devotional | null>(null)
  const [draft, setDraft] = useState({ title: "", passage: "", content: "", image_url: null as string | null })
  const [saving, setSaving] = useState(false)
  const [uploadingImage, setUploadingImage] = useState(false)
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set())
  const [openMenuId, setOpenMenuId] = useState<string | null>(null)

  useEffect(() => {
    async function load() {
      setLoading(true)
      const { data } = await supabase.from("devotionals").select("*").eq("user_id", userId).order("created_at", { ascending: false })
      if (data) setEntries(data)
      setLoading(false)
    }
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId])

  const filtered = useMemo(() => {
    if (!searchQuery.trim()) return entries
    const q = searchQuery.toLowerCase()
    return entries.filter(e => e.title.toLowerCase().includes(q) || e.passage.toLowerCase().includes(q) || e.content.toLowerCase().includes(q))
  }, [entries, searchQuery])

  function openNew() { setEditingEntry(null); setDraft({ title: "", passage: "", content: "", image_url: null }); setShowEditor(true); setOpenMenuId(null) }
  function openEdit(entry: Devotional) { setEditingEntry(entry); setDraft({ title: entry.title, passage: entry.passage, content: entry.content, image_url: entry.image_url }); setShowEditor(true); setOpenMenuId(null) }

  async function handleSave() {
    if (!draft.title.trim()) return
    setSaving(true)
    if (editingEntry) {
      const { data, error } = await supabase.from("devotionals").update({ title: draft.title, passage: draft.passage, content: draft.content, image_url: draft.image_url }).eq("id", editingEntry.id).select().single()
      if (!error && data) setEntries(prev => prev.map(e => e.id === editingEntry.id ? (data as Devotional) : e))
    } else {
      const { data, error } = await supabase.from("devotionals").insert({ user_id: userId, ministry_id: ministryId, title: draft.title, passage: draft.passage, content: draft.content, image_url: draft.image_url }).select().single()
      if (!error && data) setEntries(prev => [data as Devotional, ...prev])
    }
    setSaving(false); setShowEditor(false); setEditingEntry(null)
  }

  async function handleDelete(id: string) { await supabase.from("devotionals").delete().eq("id", id); setEntries(prev => prev.filter(e => e.id !== id)); setOpenMenuId(null) }

  async function handleImageUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]; if (!file) return
    setUploadingImage(true)
    const ext = file.name.split(".").pop()
    const { data: uploadData, error } = await supabase.storage.from("devotionals").upload(`${userId}/${Date.now()}.${ext}`, file, { upsert: false })
    if (!error && uploadData) { const { data: { publicUrl } } = supabase.storage.from("devotionals").getPublicUrl(uploadData.path); setDraft(d => ({ ...d, image_url: publicUrl })) }
    setUploadingImage(false); if (imageInputRef.current) imageInputRef.current.value = ""
  }

  function toggleExpand(id: string) { setExpandedIds(prev => { const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); return n }) }
  const inputBase: React.CSSProperties = { display: "block", width: "100%", background: "transparent", border: "none", outline: "none", fontFamily: "inherit" }

  return (
    <div>
      <input ref={imageInputRef} type="file" accept="image/*" className="hidden" onChange={handleImageUpload} />
      <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 20 }}>
        <div style={{ flex: 1, position: "relative" }}>
          <Search size={14} style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", color: "#8A8497", pointerEvents: "none" }} />
          <input type="text" placeholder="Search devotionals…" value={searchQuery} onChange={e => setSearchQuery(e.target.value)} style={{ width: "100%", paddingLeft: 36, paddingRight: 12, paddingTop: 9, paddingBottom: 9, background: "#FBF8F2", border: "1px solid #ECE8DE", borderRadius: 10, fontSize: 13, color: "#13101A", outline: "none", fontFamily: "inherit" }} />
        </div>
        <button onClick={openNew} style={{ display: "flex", alignItems: "center", gap: 6, padding: "9px 16px", background: "#3E1540", color: "#F6F4EF", borderRadius: 10, border: "none", fontSize: 13, fontWeight: 500, cursor: "pointer", flexShrink: 0, whiteSpace: "nowrap" }}>
          <Plus size={14} />New entry
        </button>
      </div>

      {showEditor && (
        <div style={{ background: "white", borderRadius: 16, border: "1px solid #ECE8DE", padding: "26px 26px 20px", marginBottom: 20, boxShadow: "0 2px 12px rgba(19,16,26,0.06)" }}>
          <input type="text" placeholder="Entry title…" value={draft.title} onChange={e => setDraft(d => ({ ...d, title: e.target.value }))} autoFocus style={{ ...inputBase, fontFamily: "var(--font-instrument-serif)", fontSize: 22, color: "#13101A", marginBottom: 8, letterSpacing: "-0.02em" }} />
          <input type="text" placeholder="Passage reference (e.g. John 3:16–17)" value={draft.passage} onChange={e => setDraft(d => ({ ...d, passage: e.target.value }))} style={{ ...inputBase, fontFamily: "var(--font-instrument-serif)", fontStyle: "italic", fontSize: 14, color: "#3E1540", borderBottom: "1px solid #ECE8DE", marginBottom: 18, paddingBottom: 10 }} />
          <textarea placeholder="Write your reflections here…" value={draft.content} onChange={e => setDraft(d => ({ ...d, content: e.target.value }))} rows={6} style={{ display: "block", width: "100%", fontSize: 14, color: "#374151", lineHeight: 1.8, background: "transparent", border: "none", outline: "none", resize: "vertical", marginBottom: 14, fontFamily: "inherit" }} />
          {draft.image_url ? (
            <div style={{ position: "relative", marginBottom: 14, display: "inline-block" }}>
              <img src={draft.image_url} alt="" style={{ maxHeight: 180, maxWidth: "100%", borderRadius: 8 }} />
              <button onClick={() => setDraft(d => ({ ...d, image_url: null }))} style={{ position: "absolute", top: 5, right: 5, background: "rgba(0,0,0,0.5)", border: "none", borderRadius: "50%", width: 20, height: 20, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}><X size={10} color="white" /></button>
            </div>
          ) : (
            <button onClick={() => imageInputRef.current?.click()} disabled={uploadingImage} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: "#8A8497", background: "transparent", border: "1px dashed #D4CFC7", borderRadius: 7, padding: "7px 11px", cursor: "pointer", marginBottom: 14 }}>
              <ImageIcon size={12} />{uploadingImage ? "Uploading…" : "Attach photo or image"}
            </button>
          )}
          <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
            <button onClick={() => { setShowEditor(false); setEditingEntry(null) }} style={{ padding: "7px 14px", borderRadius: 8, border: "1px solid #ECE8DE", background: "transparent", fontSize: 13, color: "#5A5466", cursor: "pointer" }}>Cancel</button>
            <button onClick={handleSave} disabled={saving || !draft.title.trim()} style={{ padding: "7px 14px", borderRadius: 8, background: "#3E1540", color: "#F6F4EF", border: "none", fontSize: 13, fontWeight: 500, cursor: "pointer", opacity: saving || !draft.title.trim() ? 0.5 : 1 }}>{saving ? "Saving…" : editingEntry ? "Update" : "Save entry"}</button>
          </div>
        </div>
      )}

      {loading ? (
        <div style={{ textAlign: "center", paddingTop: 48, color: "#8A8497", fontSize: 13 }}>Loading…</div>
      ) : filtered.length === 0 ? (
        <div style={{ textAlign: "center", paddingTop: 48 }}>
          <BookOpen size={28} style={{ color: "#C4C4C4", margin: "0 auto 12px" }} />
          {searchQuery.trim() ? <p style={{ fontSize: 13, color: "#8A8497" }}>No entries match &ldquo;{searchQuery}&rdquo;</p> : (
            <><p style={{ fontFamily: "var(--font-instrument-serif)", fontSize: 17, color: "#13101A", marginBottom: 4 }}>No devotionals yet</p><p style={{ fontSize: 13, color: "#8A8497" }}>Write your first entry to get started.</p></>
          )}
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {filtered.map((entry, idx) => {
            const isFirst = idx === 0 && !searchQuery.trim()
            const isExpanded = isFirst || expandedIds.has(entry.id) || searchQuery.trim().length > 0
            const menuOpen = openMenuId === entry.id
            return (
              <div key={entry.id} style={{ background: "white", borderRadius: 14, border: "1px solid #ECE8DE", boxShadow: "0 1px 3px rgba(19,16,26,0.04)" }}>
                <div style={{ padding: isExpanded ? "20px 20px 0" : "14px 18px", cursor: isFirst ? "default" : "pointer" }} onClick={() => { if (!isFirst) { toggleExpand(entry.id); setOpenMenuId(null) } }}>
                  <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 10 }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <h3 style={{ fontFamily: "var(--font-instrument-serif)", fontSize: isExpanded ? 19 : 15, fontWeight: 400, color: "#13101A", letterSpacing: "-0.01em", lineHeight: 1.25, margin: 0, marginBottom: entry.passage ? 3 : 0 }}>{entry.title}</h3>
                      {entry.passage && <p style={{ fontFamily: "var(--font-instrument-serif)", fontStyle: "italic", fontSize: 13, color: "#3E1540", lineHeight: 1.4, margin: 0 }}>{entry.passage}</p>}
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 4, flexShrink: 0 }}>
                      <span style={{ fontFamily: "ui-monospace, monospace", fontSize: 10, color: "#8A8497", letterSpacing: "0.04em", whiteSpace: "nowrap" }}>{fmtJournalDate(entry.created_at)}</span>
                      <div style={{ position: "relative" }}>
                        <button onClick={e => { e.stopPropagation(); setOpenMenuId(menuOpen ? null : entry.id) }} style={{ width: 26, height: 26, borderRadius: 6, background: menuOpen ? "#F4F1E8" : "transparent", border: "none", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", color: "#8A8497" }}><MoreHorizontal size={15} /></button>
                        {menuOpen && (
                          <div style={{ position: "absolute", right: 0, top: "calc(100% + 4px)", background: "white", border: "1px solid #ECE8DE", borderRadius: 9, boxShadow: "0 4px 14px rgba(19,16,26,0.10)", zIndex: 20, minWidth: 130, overflow: "hidden" }}>
                            <button onClick={e => { e.stopPropagation(); openEdit(entry) }} style={{ display: "flex", alignItems: "center", gap: 8, padding: "9px 13px", width: "100%", background: "transparent", border: "none", fontSize: 13, color: "#13101A", cursor: "pointer" }}><Edit3 size={13} />Edit</button>
                            <div style={{ height: 1, background: "#F0EDE8" }} />
                            <button onClick={e => { e.stopPropagation(); handleDelete(entry.id) }} style={{ display: "flex", alignItems: "center", gap: 8, padding: "9px 13px", width: "100%", background: "transparent", border: "none", fontSize: 13, color: "#EF4444", cursor: "pointer" }}><Trash2 size={13} />Delete</button>
                          </div>
                        )}
                      </div>
                      {!isFirst && <span style={{ color: "#C4C4C4", display: "flex" }}>{isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}</span>}
                    </div>
                  </div>
                </div>
                {isExpanded && (
                  <div style={{ padding: "12px 20px 20px" }}>
                    {entry.content && <p style={{ fontSize: 14, color: "#374151", lineHeight: 1.85, whiteSpace: "pre-wrap", margin: 0, marginBottom: entry.image_url ? 14 : 0 }}>{entry.content}</p>}
                    {entry.image_url && <img src={entry.image_url} alt="" style={{ maxWidth: "100%", maxHeight: 320, borderRadius: 8, objectFit: "cover", display: "block" }} />}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

function JournalPrayersTab({ userId, ministryId }: { userId: string; ministryId: string }) {
  const supabase = createClient()
  const [entries, setEntries] = useState<Prayer[]>([])
  const [loading, setLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState("")
  const [showEditor, setShowEditor] = useState(false)
  const [editingEntry, setEditingEntry] = useState<Prayer | null>(null)
  const [draft, setDraft] = useState({ title: "", content: "", status: "praying" as PrayerStatus })
  const [saving, setSaving] = useState(false)
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set())
  const [openMenuId, setOpenMenuId] = useState<string | null>(null)
  const [statusMenuId, setStatusMenuId] = useState<string | null>(null)

  useEffect(() => {
    async function load() {
      setLoading(true)
      const { data } = await supabase.from("prayers").select("*").eq("user_id", userId).order("created_at", { ascending: false })
      if (data) setEntries(data)
      setLoading(false)
    }
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId])

  const filtered = useMemo(() => {
    if (!searchQuery.trim()) return entries
    const q = searchQuery.toLowerCase()
    return entries.filter(e => e.title.toLowerCase().includes(q) || e.content.toLowerCase().includes(q))
  }, [entries, searchQuery])

  function openNew() { setEditingEntry(null); setDraft({ title: "", content: "", status: "praying" }); setShowEditor(true); setOpenMenuId(null) }
  function openEdit(entry: Prayer) { setEditingEntry(entry); setDraft({ title: entry.title, content: entry.content, status: entry.status }); setShowEditor(true); setOpenMenuId(null) }

  async function handleSave() {
    if (!draft.title.trim()) return
    setSaving(true)
    if (editingEntry) {
      const { data, error } = await supabase.from("prayers").update({ title: draft.title, content: draft.content, status: draft.status }).eq("id", editingEntry.id).select().single()
      if (!error && data) setEntries(prev => prev.map(e => e.id === editingEntry.id ? (data as Prayer) : e))
    } else {
      const { data, error } = await supabase.from("prayers").insert({ user_id: userId, ministry_id: ministryId, title: draft.title, content: draft.content, status: draft.status }).select().single()
      if (!error && data) setEntries(prev => [data as Prayer, ...prev])
    }
    setSaving(false); setShowEditor(false); setEditingEntry(null)
  }

  async function handleDelete(id: string) { await supabase.from("prayers").delete().eq("id", id); setEntries(prev => prev.filter(e => e.id !== id)); setOpenMenuId(null) }

  async function updateStatus(id: string, status: PrayerStatus) {
    const { data, error } = await supabase.from("prayers").update({ status }).eq("id", id).select().single()
    if (!error && data) setEntries(prev => prev.map(e => e.id === id ? (data as Prayer) : e))
    setStatusMenuId(null)
  }

  function toggleExpand(id: string) { setExpandedIds(prev => { const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); return n }) }

  function StatusBadge({ status, entryId }: { status: PrayerStatus; entryId: string }) {
    const cfg = STATUS_CONFIG[status]
    const isOpen = statusMenuId === entryId
    return (
      <div style={{ position: "relative", display: "inline-block" }}>
        <button onClick={e => { e.stopPropagation(); setStatusMenuId(isOpen ? null : entryId); setOpenMenuId(null) }} style={{ padding: "2px 9px", borderRadius: 20, background: cfg.bg, color: cfg.text, fontSize: 11, fontWeight: 600, border: "none", cursor: "pointer", letterSpacing: "0.03em" }}>
          {cfg.label}
        </button>
        {isOpen && (
          <div style={{ position: "absolute", left: 0, top: "calc(100% + 4px)", background: "white", border: "1px solid #ECE8DE", borderRadius: 9, boxShadow: "0 4px 14px rgba(19,16,26,0.10)", zIndex: 20, overflow: "hidden", minWidth: 130 }}>
            {(["praying", "answered", "ongoing"] as PrayerStatus[]).map(s => (
              <button key={s} onClick={e => { e.stopPropagation(); updateStatus(entryId, s) }} style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 12px", width: "100%", background: s === status ? "#F8F5FF" : "transparent", border: "none", cursor: "pointer" }}>
                <span style={{ width: 7, height: 7, borderRadius: "50%", background: STATUS_CONFIG[s].text, flexShrink: 0 }} />
                <span style={{ fontSize: 13, color: "#13101A" }}>{STATUS_CONFIG[s].label}</span>
              </button>
            ))}
          </div>
        )}
      </div>
    )
  }

  const inputBase: React.CSSProperties = { display: "block", width: "100%", background: "transparent", border: "none", outline: "none", fontFamily: "inherit" }

  return (
    <div>
      <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 20 }}>
        <div style={{ flex: 1, position: "relative" }}>
          <Search size={14} style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", color: "#8A8497", pointerEvents: "none" }} />
          <input type="text" placeholder="Search prayers…" value={searchQuery} onChange={e => setSearchQuery(e.target.value)} style={{ width: "100%", paddingLeft: 36, paddingRight: 12, paddingTop: 9, paddingBottom: 9, background: "#FBF8F2", border: "1px solid #ECE8DE", borderRadius: 10, fontSize: 13, color: "#13101A", outline: "none", fontFamily: "inherit" }} />
        </div>
        <button onClick={openNew} style={{ display: "flex", alignItems: "center", gap: 6, padding: "9px 16px", background: "#3E1540", color: "#F6F4EF", borderRadius: 10, border: "none", fontSize: 13, fontWeight: 500, cursor: "pointer", flexShrink: 0, whiteSpace: "nowrap" }}>
          <Plus size={14} />New prayer
        </button>
      </div>

      {showEditor && (
        <div style={{ background: "white", borderRadius: 16, border: "1px solid #ECE8DE", padding: "26px 26px 20px", marginBottom: 20, boxShadow: "0 2px 12px rgba(19,16,26,0.06)" }}>
          <input type="text" placeholder="Prayer title…" value={draft.title} onChange={e => setDraft(d => ({ ...d, title: e.target.value }))} autoFocus style={{ ...inputBase, fontFamily: "var(--font-instrument-serif)", fontSize: 22, color: "#13101A", marginBottom: 14, letterSpacing: "-0.02em" }} />
          <textarea placeholder="Write your prayer here…" value={draft.content} onChange={e => setDraft(d => ({ ...d, content: e.target.value }))} rows={5} style={{ display: "block", width: "100%", fontSize: 14, color: "#374151", lineHeight: 1.8, background: "transparent", border: "none", outline: "none", resize: "vertical", marginBottom: 16, fontFamily: "inherit" }} />
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 18 }}>
            <span style={{ fontSize: 12, color: "#8A8497" }}>Status</span>
            {(["praying", "answered", "ongoing"] as PrayerStatus[]).map(s => {
              const cfg = STATUS_CONFIG[s]; const sel = draft.status === s
              return (
                <button key={s} onClick={() => setDraft(d => ({ ...d, status: s }))} style={{ padding: "3px 11px", borderRadius: 20, background: sel ? cfg.bg : "transparent", color: sel ? cfg.text : "#8A8497", fontSize: 12, fontWeight: sel ? 600 : 400, border: sel ? "none" : "1px solid #ECE8DE", cursor: "pointer" }}>{cfg.label}</button>
              )
            })}
          </div>
          <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
            <button onClick={() => { setShowEditor(false); setEditingEntry(null) }} style={{ padding: "7px 14px", borderRadius: 8, border: "1px solid #ECE8DE", background: "transparent", fontSize: 13, color: "#5A5466", cursor: "pointer" }}>Cancel</button>
            <button onClick={handleSave} disabled={saving || !draft.title.trim()} style={{ padding: "7px 14px", borderRadius: 8, background: "#3E1540", color: "#F6F4EF", border: "none", fontSize: 13, fontWeight: 500, cursor: "pointer", opacity: saving || !draft.title.trim() ? 0.5 : 1 }}>{saving ? "Saving…" : editingEntry ? "Update" : "Save prayer"}</button>
          </div>
        </div>
      )}

      {loading ? (
        <div style={{ textAlign: "center", paddingTop: 48, color: "#8A8497", fontSize: 13 }}>Loading…</div>
      ) : filtered.length === 0 ? (
        <div style={{ textAlign: "center", paddingTop: 48 }}>
          <BookOpen size={28} style={{ color: "#C4C4C4", margin: "0 auto 12px" }} />
          {searchQuery.trim() ? <p style={{ fontSize: 13, color: "#8A8497" }}>No prayers match &ldquo;{searchQuery}&rdquo;</p> : (
            <><p style={{ fontFamily: "var(--font-instrument-serif)", fontSize: 17, color: "#13101A", marginBottom: 4 }}>No prayers yet</p><p style={{ fontSize: 13, color: "#8A8497" }}>Record your first prayer request.</p></>
          )}
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {filtered.map((entry, idx) => {
            const isFirst = idx === 0 && !searchQuery.trim()
            const isExpanded = isFirst || expandedIds.has(entry.id) || searchQuery.trim().length > 0
            const menuOpen = openMenuId === entry.id
            return (
              <div key={entry.id} style={{ background: "white", borderRadius: 14, border: "1px solid #ECE8DE", boxShadow: "0 1px 3px rgba(19,16,26,0.04)" }}>
                <div style={{ padding: isExpanded ? "18px 20px 0" : "13px 18px", cursor: isFirst ? "default" : "pointer" }} onClick={() => { if (!isFirst) { toggleExpand(entry.id); setOpenMenuId(null); setStatusMenuId(null) } }}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
                    <div style={{ flex: 1, minWidth: 0, display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                      <h3 style={{ fontFamily: "var(--font-instrument-serif)", fontSize: 15, fontWeight: 400, color: "#13101A", letterSpacing: "-0.01em", lineHeight: 1.3, margin: 0 }}>{entry.title}</h3>
                      <div onClick={e => e.stopPropagation()}><StatusBadge status={entry.status} entryId={entry.id} /></div>
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 4, flexShrink: 0 }}>
                      <span style={{ fontFamily: "ui-monospace, monospace", fontSize: 10, color: "#8A8497", letterSpacing: "0.04em", whiteSpace: "nowrap" }}>{fmtJournalDate(entry.created_at)}</span>
                      <div style={{ position: "relative" }}>
                        <button onClick={e => { e.stopPropagation(); setOpenMenuId(menuOpen ? null : entry.id); setStatusMenuId(null) }} style={{ width: 26, height: 26, borderRadius: 6, background: menuOpen ? "#F4F1E8" : "transparent", border: "none", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", color: "#8A8497" }}><MoreHorizontal size={15} /></button>
                        {menuOpen && (
                          <div style={{ position: "absolute", right: 0, top: "calc(100% + 4px)", background: "white", border: "1px solid #ECE8DE", borderRadius: 9, boxShadow: "0 4px 14px rgba(19,16,26,0.10)", zIndex: 20, minWidth: 130, overflow: "hidden" }}>
                            <button onClick={e => { e.stopPropagation(); openEdit(entry) }} style={{ display: "flex", alignItems: "center", gap: 8, padding: "9px 13px", width: "100%", background: "transparent", border: "none", fontSize: 13, color: "#13101A", cursor: "pointer" }}><Edit3 size={13} />Edit</button>
                            <div style={{ height: 1, background: "#F0EDE8" }} />
                            <button onClick={e => { e.stopPropagation(); handleDelete(entry.id) }} style={{ display: "flex", alignItems: "center", gap: 8, padding: "9px 13px", width: "100%", background: "transparent", border: "none", fontSize: 13, color: "#EF4444", cursor: "pointer" }}><Trash2 size={13} />Delete</button>
                          </div>
                        )}
                      </div>
                      {!isFirst && <span style={{ color: "#C4C4C4", display: "flex" }}>{isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}</span>}
                    </div>
                  </div>
                </div>
                {isExpanded && entry.content && (
                  <div style={{ padding: "12px 20px 18px" }}>
                    <p style={{ fontSize: 14, color: "#374151", lineHeight: 1.85, whiteSpace: "pre-wrap", margin: 0 }}>{entry.content}</p>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

function JournalVersesTab({ userId, ministryId }: { userId: string; ministryId: string }) {
  const supabase = createClient()
  const [entries, setEntries] = useState<Verse[]>([])
  const [loading, setLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState("")
  const [showEditor, setShowEditor] = useState(false)
  const [editingEntry, setEditingEntry] = useState<Verse | null>(null)
  const [draft, setDraft] = useState({ reference: "", verse_text: "", note: "" })
  const [saving, setSaving] = useState(false)
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set())
  const [openMenuId, setOpenMenuId] = useState<string | null>(null)

  useEffect(() => {
    async function load() {
      setLoading(true)
      const { data } = await supabase.from("verses").select("*").eq("user_id", userId).order("created_at", { ascending: false })
      if (data) setEntries(data)
      setLoading(false)
    }
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId])

  const filtered = useMemo(() => {
    if (!searchQuery.trim()) return entries
    const q = searchQuery.toLowerCase()
    return entries.filter(e => e.reference.toLowerCase().includes(q) || e.verse_text.toLowerCase().includes(q) || e.note.toLowerCase().includes(q))
  }, [entries, searchQuery])

  function openNew() { setEditingEntry(null); setDraft({ reference: "", verse_text: "", note: "" }); setShowEditor(true); setOpenMenuId(null) }
  function openEdit(entry: Verse) { setEditingEntry(entry); setDraft({ reference: entry.reference, verse_text: entry.verse_text, note: entry.note }); setShowEditor(true); setOpenMenuId(null) }

  async function handleSave() {
    if (!draft.reference.trim() || !draft.verse_text.trim()) return
    setSaving(true)
    if (editingEntry) {
      const { data, error } = await supabase.from("verses").update({ reference: draft.reference, verse_text: draft.verse_text, note: draft.note }).eq("id", editingEntry.id).select().single()
      if (!error && data) setEntries(prev => prev.map(e => e.id === editingEntry.id ? (data as Verse) : e))
    } else {
      const { data, error } = await supabase.from("verses").insert({ user_id: userId, ministry_id: ministryId, reference: draft.reference, verse_text: draft.verse_text, note: draft.note }).select().single()
      if (!error && data) setEntries(prev => [data as Verse, ...prev])
    }
    setSaving(false); setShowEditor(false); setEditingEntry(null)
  }

  async function handleDelete(id: string) { await supabase.from("verses").delete().eq("id", id); setEntries(prev => prev.filter(e => e.id !== id)); setOpenMenuId(null) }
  function toggleExpand(id: string) { setExpandedIds(prev => { const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); return n }) }
  const inputBase: React.CSSProperties = { display: "block", width: "100%", background: "transparent", border: "none", outline: "none", fontFamily: "inherit" }

  return (
    <div>
      <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 20 }}>
        <div style={{ flex: 1, position: "relative" }}>
          <Search size={14} style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", color: "#8A8497", pointerEvents: "none" }} />
          <input type="text" placeholder="Search verses…" value={searchQuery} onChange={e => setSearchQuery(e.target.value)} style={{ width: "100%", paddingLeft: 36, paddingRight: 12, paddingTop: 9, paddingBottom: 9, background: "#FBF8F2", border: "1px solid #ECE8DE", borderRadius: 10, fontSize: 13, color: "#13101A", outline: "none", fontFamily: "inherit" }} />
        </div>
        <button onClick={openNew} style={{ display: "flex", alignItems: "center", gap: 6, padding: "9px 16px", background: "#3E1540", color: "#F6F4EF", borderRadius: 10, border: "none", fontSize: 13, fontWeight: 500, cursor: "pointer", flexShrink: 0, whiteSpace: "nowrap" }}>
          <Plus size={14} />Add verse
        </button>
      </div>

      {showEditor && (
        <div style={{ background: "white", borderRadius: 16, border: "1px solid #ECE8DE", padding: "26px 26px 20px", marginBottom: 20, boxShadow: "0 2px 12px rgba(19,16,26,0.06)" }}>
          <input type="text" placeholder="Reference (e.g. John 3:16)" value={draft.reference} onChange={e => setDraft(d => ({ ...d, reference: e.target.value }))} autoFocus style={{ ...inputBase, fontFamily: "var(--font-instrument-serif)", fontSize: 20, color: "#3E1540", marginBottom: 12, letterSpacing: "-0.01em" }} />
          <textarea placeholder="Verse text…" value={draft.verse_text} onChange={e => setDraft(d => ({ ...d, verse_text: e.target.value }))} rows={3} style={{ display: "block", width: "100%", fontFamily: "var(--font-instrument-serif)", fontStyle: "italic", fontSize: 15, color: "#13101A", lineHeight: 1.7, background: "transparent", border: "none", borderBottom: "1px solid #ECE8DE", outline: "none", resize: "none", marginBottom: 16, paddingBottom: 12 }} />
          <textarea placeholder="Why this verse convicted you…" value={draft.note} onChange={e => setDraft(d => ({ ...d, note: e.target.value }))} rows={4} style={{ display: "block", width: "100%", fontSize: 14, color: "#374151", lineHeight: 1.8, background: "transparent", border: "none", outline: "none", resize: "vertical", marginBottom: 16, fontFamily: "inherit" }} />
          <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
            <button onClick={() => { setShowEditor(false); setEditingEntry(null) }} style={{ padding: "7px 14px", borderRadius: 8, border: "1px solid #ECE8DE", background: "transparent", fontSize: 13, color: "#5A5466", cursor: "pointer" }}>Cancel</button>
            <button onClick={handleSave} disabled={saving || !draft.reference.trim() || !draft.verse_text.trim()} style={{ padding: "7px 14px", borderRadius: 8, background: "#3E1540", color: "#F6F4EF", border: "none", fontSize: 13, fontWeight: 500, cursor: "pointer", opacity: saving || !draft.reference.trim() || !draft.verse_text.trim() ? 0.5 : 1 }}>{saving ? "Saving…" : editingEntry ? "Update" : "Save verse"}</button>
          </div>
        </div>
      )}

      {loading ? (
        <div style={{ textAlign: "center", paddingTop: 48, color: "#8A8497", fontSize: 13 }}>Loading…</div>
      ) : filtered.length === 0 ? (
        <div style={{ textAlign: "center", paddingTop: 48 }}>
          <BookOpen size={28} style={{ color: "#C4C4C4", margin: "0 auto 12px" }} />
          {searchQuery.trim() ? <p style={{ fontSize: 13, color: "#8A8497" }}>No verses match &ldquo;{searchQuery}&rdquo;</p> : (
            <><p style={{ fontFamily: "var(--font-instrument-serif)", fontSize: 17, color: "#13101A", marginBottom: 4 }}>No verses saved yet</p><p style={{ fontSize: 13, color: "#8A8497" }}>Save a verse that has spoken to you.</p></>
          )}
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {filtered.map((entry, idx) => {
            const isFirst = idx === 0 && !searchQuery.trim()
            const isExpanded = isFirst || expandedIds.has(entry.id) || searchQuery.trim().length > 0
            const menuOpen = openMenuId === entry.id
            const preview = entry.verse_text.length > 90 ? entry.verse_text.slice(0, 90) + "…" : entry.verse_text
            return (
              <div key={entry.id} style={{ background: "white", borderRadius: 14, border: "1px solid #ECE8DE", boxShadow: "0 1px 3px rgba(19,16,26,0.04)" }}>
                <div style={{ padding: isExpanded ? "20px 20px 0" : "14px 18px", cursor: isFirst ? "default" : "pointer" }} onClick={() => { if (!isFirst) { toggleExpand(entry.id); setOpenMenuId(null) } }}>
                  <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 10 }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <p style={{ fontFamily: "var(--font-instrument-serif)", fontSize: isExpanded ? 18 : 15, fontWeight: 400, color: "#3E1540", letterSpacing: "-0.01em", margin: 0, marginBottom: !isExpanded ? 3 : 0 }}>{entry.reference}</p>
                      {!isExpanded && <p style={{ fontFamily: "var(--font-instrument-serif)", fontStyle: "italic", fontSize: 13, color: "#5A5466", lineHeight: 1.5, margin: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{preview}</p>}
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 4, flexShrink: 0 }}>
                      <span style={{ fontFamily: "ui-monospace, monospace", fontSize: 10, color: "#8A8497", letterSpacing: "0.04em", whiteSpace: "nowrap" }}>{fmtJournalDate(entry.created_at)}</span>
                      <div style={{ position: "relative" }}>
                        <button onClick={e => { e.stopPropagation(); setOpenMenuId(menuOpen ? null : entry.id) }} style={{ width: 26, height: 26, borderRadius: 6, background: menuOpen ? "#F4F1E8" : "transparent", border: "none", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", color: "#8A8497" }}><MoreHorizontal size={15} /></button>
                        {menuOpen && (
                          <div style={{ position: "absolute", right: 0, top: "calc(100% + 4px)", background: "white", border: "1px solid #ECE8DE", borderRadius: 9, boxShadow: "0 4px 14px rgba(19,16,26,0.10)", zIndex: 20, minWidth: 130, overflow: "hidden" }}>
                            <button onClick={e => { e.stopPropagation(); openEdit(entry) }} style={{ display: "flex", alignItems: "center", gap: 8, padding: "9px 13px", width: "100%", background: "transparent", border: "none", fontSize: 13, color: "#13101A", cursor: "pointer" }}><Edit3 size={13} />Edit</button>
                            <div style={{ height: 1, background: "#F0EDE8" }} />
                            <button onClick={e => { e.stopPropagation(); handleDelete(entry.id) }} style={{ display: "flex", alignItems: "center", gap: 8, padding: "9px 13px", width: "100%", background: "transparent", border: "none", fontSize: 13, color: "#EF4444", cursor: "pointer" }}><Trash2 size={13} />Delete</button>
                          </div>
                        )}
                      </div>
                      {!isFirst && <span style={{ color: "#C4C4C4", display: "flex" }}>{isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}</span>}
                    </div>
                  </div>
                </div>
                {isExpanded && (
                  <div style={{ padding: "14px 20px 20px" }}>
                    <p style={{ fontFamily: "var(--font-instrument-serif)", fontStyle: "italic", fontSize: 16, color: "#13101A", lineHeight: 1.75, margin: 0, marginBottom: entry.note ? 16 : 0 }}>
                      &ldquo;{entry.verse_text}&rdquo;
                    </p>
                    {entry.note && (
                      <div style={{ paddingTop: 14, borderTopWidth: 1, borderTopStyle: "solid", borderTopColor: "#F5F2EC" }}>
                        <p style={{ fontFamily: "ui-monospace, monospace", fontSize: 10, color: "#8A8497", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 6, marginTop: 0 }}>Reflection</p>
                        <p style={{ fontSize: 14, color: "#374151", lineHeight: 1.8, whiteSpace: "pre-wrap", margin: 0 }}>{entry.note}</p>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

function JournalSection({ userId, ministryId }: { userId: string; ministryId: string }) {
  const [journalTab, setJournalTab] = useState<'devotionals' | 'prayers' | 'verses'>('devotionals')
  const tabs: { id: 'devotionals' | 'prayers' | 'verses'; label: string }[] = [
    { id: 'devotionals', label: 'Devotionals' },
    { id: 'prayers', label: 'Prayers' },
    { id: 'verses', label: 'Verses' },
  ]
  return (
    <div style={{ padding: "24px 28px 52px" }}>
      <div style={{ display: "flex", gap: 0, marginBottom: 24, borderBottomWidth: 1, borderBottomStyle: "solid", borderBottomColor: "#ECE8DE" }}>
        {tabs.map(t => (
          <button key={t.id} onClick={() => setJournalTab(t.id)} style={{ padding: "8px 18px", background: "transparent", border: "none", borderBottomWidth: 2, borderBottomStyle: "solid", borderBottomColor: journalTab === t.id ? "#3E1540" : "transparent", color: journalTab === t.id ? "#3E1540" : "#8A8497", fontSize: 13, fontWeight: journalTab === t.id ? 600 : 400, cursor: "pointer", marginBottom: -1, letterSpacing: "-0.01em" }}>
            {t.label}
          </button>
        ))}
      </div>
      {journalTab === 'devotionals' && <JournalDevotionalsTab userId={userId} ministryId={ministryId} />}
      {journalTab === 'prayers' && <JournalPrayersTab userId={userId} ministryId={ministryId} />}
      {journalTab === 'verses' && <JournalVersesTab userId={userId} ministryId={ministryId} />}
    </div>
  )
}

// ─── Profile Tab ─────────────────────────────────────────────────────────────

function ProfileTab({
  userId,
  initialProfile,
  ministryName,
  onLogout,
  onAvatarChange,
  activeSection,
  onSectionChange,
}: {
  userId: string
  initialProfile: Profile
  ministryName: string
  onLogout: () => void
  onAvatarChange?: (url: string) => void
  activeSection: "spiritual-profile" | "journal"
  onSectionChange: (s: "spiritual-profile" | "journal") => void
}) {
  const supabase = createClient()
  const [profile, setProfile] = useState<Profile>(initialProfile)
  const [editing, setEditing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [uploadingAvatar, setUploadingAvatar] = useState(false)
  const avatarInputRef = useRef<HTMLInputElement>(null)
  const [draft, setDraft] = useState({
    about_me: initialProfile.about_me ?? "",
    bible_verse: initialProfile.bible_verse ?? "",
    prayer_request: initialProfile.prayer_request ?? "",
    pray_for_me: initialProfile.pray_for_me ?? "",
  })

  const startEdit = () => {
    setDraft({
      about_me: profile.about_me ?? "",
      bible_verse: profile.bible_verse ?? "",
      prayer_request: profile.prayer_request ?? "",
      pray_for_me: profile.pray_for_me ?? "",
    })
    setEditing(true)
  }

  const cancelEdit = () => setEditing(false)

  const saveEdit = useCallback(async () => {
    setSaving(true)
    const { data, error } = await supabase
      .from("profiles")
      .update({
        about_me: draft.about_me || null,
        bible_verse: draft.bible_verse || null,
        prayer_request: draft.prayer_request || null,
        pray_for_me: draft.pray_for_me || null,
      })
      .eq("id", userId)
      .select()
      .single()

    if (!error && data) setProfile(data as Profile)
    setSaving(false)
    setEditing(false)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft, userId])

  async function handleAvatarUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setUploadingAvatar(true)
    const ext = file.name.split(".").pop()
    const fileName = `${userId}.${ext}`
    const { data: uploadData, error } = await supabase.storage
      .from("profile-images")
      .upload(fileName, file, { upsert: true })
    if (!error && uploadData) {
      const { data: { publicUrl } } = supabase.storage
        .from("profile-images")
        .getPublicUrl(uploadData.path)
      await supabase.from("profiles").update({ avatar_url: publicUrl }).eq("id", userId)
      setProfile((p) => ({ ...p, avatar_url: publicUrl }))
      onAvatarChange?.(publicUrl)
    }
    setUploadingAvatar(false)
    if (avatarInputRef.current) avatarInputRef.current.value = ""
  }

  const fields = [
    { key: "about_me" as const, label: "About me", placeholder: "Tell the community about yourself…" },
    { key: "bible_verse" as const, label: "Current Bible verse", placeholder: "What verse are you meditating on?" },
    { key: "prayer_request" as const, label: "Prayer request", placeholder: "Share what you'd like prayer for…" },
    { key: "pray_for_me" as const, label: "How to pray for me this week", placeholder: "Specific ways others can intercede…" },
  ]

  const monoStyle: React.CSSProperties = {
    fontFamily: "ui-monospace, 'SF Mono', Menlo, monospace",
    fontSize: "10px",
    letterSpacing: "0.06em",
    textTransform: "uppercase",
    color: "#8A8497",
  }

  function FieldCard({ fieldKey, label, placeholder }: { fieldKey: keyof typeof draft; label: string; placeholder: string }) {
    return (
      <div className="bg-white rounded-2xl border border-[#ECE8DE] p-5 shadow-[0_1px_3px_rgba(19,16,26,0.04)] md:rounded-xl md:border-[#E5E0D2] md:bg-[#FBF8F2]">
        <div style={monoStyle}>{fieldKey === "about_me" || fieldKey === "bible_verse" ? "Story" : "Prayer"}</div>
        <p style={{ fontFamily: "var(--font-instrument-serif)", fontSize: "15px", color: "#3E1540", fontWeight: 400, marginTop: "4px", marginBottom: "8px", letterSpacing: "-0.01em" }}>
          {label}
        </p>
        {editing ? (
          <textarea
            value={draft[fieldKey]}
            onChange={(e) => setDraft((d) => ({ ...d, [fieldKey]: e.target.value }))}
            placeholder={placeholder}
            rows={3}
            className="w-full text-[13px] text-[#374151] leading-relaxed bg-transparent resize-none focus:outline-none placeholder:text-[#C4C4C4]"
          />
        ) : (
          <p className="text-[14px] text-[#374151] leading-relaxed whitespace-pre-wrap">
            {profile[fieldKey] || <span className="text-[#C4C4C4] italic text-[13px]">{placeholder}</span>}
          </p>
        )}
      </div>
    )
  }

  return (
    <div className="pb-6 md:pb-0">
      {/* Single hidden file input for avatar upload */}
      <input ref={avatarInputRef} type="file" accept="image/*" className="hidden" onChange={handleAvatarUpload} />

      {/* Desktop Topbar */}
      <DesktopTopbar
        crumbs={["Central", "Profile", activeSection === "journal" ? "Journal" : "Spiritual profile"]}
        right={
          activeSection === "spiritual-profile" ? (
            <div className="hidden md:flex items-center gap-2">
              {editing ? (
                <>
                  <button onClick={cancelEdit} className="flex items-center gap-1.5 px-3.5 py-1.5 border border-[#E5E0D2] rounded-lg text-[12px] text-[#5A5466] hover:bg-[#F4F1E8] transition-colors">
                    <X className="w-3.5 h-3.5" />Cancel
                  </button>
                  <button onClick={saveEdit} disabled={saving} className="flex items-center gap-1.5 px-3.5 py-1.5 bg-[#13101A] text-[#F6F4EF] rounded-lg text-[12px] font-medium hover:bg-[#2D0F2E] transition-colors disabled:opacity-60">
                    <Check className="w-3.5 h-3.5" />{saving ? "Saving…" : "Save"}
                  </button>
                </>
              ) : (
                <button onClick={startEdit} className="flex items-center gap-1.5 px-3.5 py-1.5 bg-[#13101A] text-[#F6F4EF] rounded-lg text-[12px] font-medium hover:bg-[#2D0F2E] transition-colors">
                  <Edit3 className="w-3.5 h-3.5" />Edit profile
                </button>
              )}
            </div>
          ) : null
        }
      />

      {/* Mobile header */}
      <div className="flex items-center gap-2.5 px-5 pt-14 pb-5 md:hidden">
        <svg width="26" height="26" viewBox="0 0 100 100" fill="none">
          <circle cx="50" cy="50" r="44" stroke="#3E1540" strokeWidth="6" />
          <rect x="47" y="22" width="6" height="56" fill="#3E1540" />
          <rect x="22" y="47" width="56" height="6" fill="#3E1540" />
        </svg>
        <span style={{ fontFamily: "var(--font-instrument-serif)", fontSize: "28px", color: "#13101A", letterSpacing: "-0.01em", lineHeight: 1 }}>{ministryName}</span>
      </div>

      {/* ── Desktop: journal section ── */}
      {activeSection === "journal" && (
        <div className="hidden md:block">
          <JournalSection userId={userId} ministryId={initialProfile.ministry_id ?? ""} />
        </div>
      )}

      {/* ── Desktop: taller hero (spiritual profile only) ── */}
      <div className={`px-7 pt-7 pb-0 ${activeSection === "journal" ? "hidden" : "hidden md:block"}`}>
        <div
          className="relative overflow-hidden rounded-2xl text-[#F6F4EF]"
          style={{
            background: "linear-gradient(135deg, #4A1B4D 0%, #3E1540 60%, #1A0820 100%)",
            padding: "40px 40px 36px",
            display: "grid", gridTemplateColumns: "auto 1fr auto", gap: "32px", alignItems: "center",
            minHeight: "280px",
          }}
        >
          <div className="absolute rounded-full pointer-events-none" style={{ top: -120, right: 100, width: 380, height: 380, background: "radial-gradient(circle, rgba(201,163,75,0.18), transparent 60%)" }} />
          <div className="absolute inset-0 pointer-events-none" style={{ opacity: 0.06, backgroundImage: "radial-gradient(circle, white 1px, transparent 1px)", backgroundSize: "16px 16px" }} />

          {/* Avatar */}
          <button
            onClick={() => avatarInputRef.current?.click()}
            disabled={uploadingAvatar}
            className="relative group flex-shrink-0"
            style={{ width: 110, height: 110, borderRadius: 22, background: "rgba(255,255,255,0.1)", border: "1px solid rgba(255,255,255,0.2)", display: "grid", placeItems: "center", overflow: "hidden" }}
            aria-label="Change profile photo"
          >
            {profile.avatar_url ? (
              <img src={profile.avatar_url} alt="Profile" className="w-full h-full object-cover" />
            ) : (
              <span style={{ fontFamily: "var(--font-instrument-serif)", fontSize: "44px" }}>{getInitials(profile.name)}</span>
            )}
            <div className="absolute inset-0 bg-black/30 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
              <Camera className="w-6 h-6 text-white" />
            </div>
            {uploadingAvatar && (
              <div className="absolute inset-0 bg-black/40 flex items-center justify-center">
                <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
              </div>
            )}
          </button>

          {/* Name + details */}
          <div className="relative">
            <h1 style={{ margin: 0, fontFamily: "var(--font-instrument-serif)", fontWeight: 400, fontSize: "52px", lineHeight: 1, letterSpacing: "-0.01em" }}>
              {profile.name}
            </h1>
            <div className="flex items-center gap-3 mt-3.5" style={{ fontSize: "13px", opacity: 0.85 }}>
              <span style={{ padding: "3px 10px", border: "1px solid rgba(255,255,255,0.25)", borderRadius: 999, fontSize: "10px", letterSpacing: "0.6px", textTransform: "uppercase", fontWeight: 600 }}>
                {profile.role}
              </span>
              {profile.graduation_year && <span>Class of {profile.graduation_year}</span>}
              <span>·</span>
              <span>{profile.email}</span>
            </div>
            {profile.pray_for_me && (
              <div style={{ marginTop: "22px", paddingTop: "18px", borderTop: "1px solid rgba(255,255,255,0.12)", maxWidth: "480px" }}>
                <div style={{ fontSize: "10px", letterSpacing: "1.2px", textTransform: "uppercase", opacity: 0.6, marginBottom: "6px" }}>This week</div>
                <div style={{ fontFamily: "var(--font-instrument-serif)", fontStyle: "italic", fontSize: "17px", lineHeight: 1.4, opacity: 0.92 }}>
                  &ldquo;{profile.pray_for_me}&rdquo;
                </div>
              </div>
            )}
          </div>

          {/* Stats */}
          <div className="relative flex flex-col gap-5">
            {[
              { label: "Role", value: profile.role.charAt(0).toUpperCase() + profile.role.slice(1) },
              { label: "Class", value: profile.graduation_year ? `'${String(profile.graduation_year).slice(2)}` : "—" },
            ].map(({ label, value }) => (
              <div key={label}>
                <p style={{ fontFamily: "ui-monospace, 'SF Mono', Menlo, monospace", fontSize: "10px", letterSpacing: "0.06em", textTransform: "uppercase", color: "rgba(246,244,239,0.6)" }}>{label}</p>
                <p style={{ fontFamily: "var(--font-instrument-serif)", fontSize: "24px", marginTop: "2px" }}>{value}</p>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Mobile identity card */}
      <div className="md:hidden px-5">
        <div className="rounded-2xl overflow-hidden border border-[#ECE8DE] shadow-[0_2px_8px_rgba(19,16,26,0.06)] mb-5">
          <div className="bg-[#3E1540] px-6 pt-8 pb-8 relative overflow-hidden">
            <div className="absolute -top-[70px] left-1/2 -translate-x-1/2 w-[300px] h-[300px] rounded-full bg-[radial-gradient(circle,rgba(201,163,75,0.20)_0%,transparent_65%)]" />
            <div className="relative z-10 flex flex-col items-center gap-4">
              <button
                onClick={() => avatarInputRef.current?.click()}
                disabled={uploadingAvatar}
                className="relative w-24 h-24 rounded-full overflow-hidden bg-[#5A2060] border-[3px] border-white/20 group flex-shrink-0"
                aria-label="Change profile photo"
              >
                {profile.avatar_url ? (
                  <img src={profile.avatar_url} alt="Profile" className="w-full h-full object-cover" />
                ) : (
                  <span className="flex items-center justify-center w-full h-full text-[#F6F4EF]" style={{ fontFamily: "var(--font-instrument-serif)", fontSize: "32px", fontWeight: 400 }}>
                    {getInitials(profile.name)}
                  </span>
                )}
                <div className="absolute inset-0 bg-black/30 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                  <Camera className="w-5 h-5 text-white" />
                </div>
                {uploadingAvatar && (
                  <div className="absolute inset-0 bg-black/40 flex items-center justify-center">
                    <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  </div>
                )}
              </button>
              <div className="text-center">
                <h2 style={{ fontFamily: "var(--font-instrument-serif)", fontSize: "26px", color: "#F6F4EF", letterSpacing: "-0.02em", lineHeight: 1.1, marginBottom: "10px" }}>{profile.name}</h2>
                <div className="flex items-center justify-center gap-2 flex-wrap mb-2">
                  <span className="text-[10px] bg-white/15 text-[#F6F4EF] font-semibold px-2.5 py-1 rounded-full uppercase tracking-wide">{profile.role}</span>
                  {profile.graduation_year && <span className="text-[12px] text-[#BFA8C1] font-medium">Class of {profile.graduation_year}</span>}
                </div>
                <p className="text-[12px] text-[#9E85A0]">{profile.email}</p>
              </div>
            </div>
          </div>
          <div className="px-4 py-2.5 bg-[#FDFBF7] border-t border-[#ECE8DE] flex items-center justify-between gap-2">
            <div className="flex gap-1">
              <button
                onClick={() => onSectionChange("spiritual-profile")}
                style={{ padding: "4px 10px", borderRadius: 6, fontSize: 10, fontWeight: 600, background: activeSection === "spiritual-profile" ? "#3E1540" : "transparent", color: activeSection === "spiritual-profile" ? "#F6F4EF" : "#8A8497", border: "none", cursor: "pointer", letterSpacing: "0.08em", textTransform: "uppercase" as const }}
              >
                Spiritual profile
              </button>
              <button
                onClick={() => onSectionChange("journal")}
                style={{ padding: "4px 10px", borderRadius: 6, fontSize: 10, fontWeight: 600, background: activeSection === "journal" ? "#3E1540" : "transparent", color: activeSection === "journal" ? "#F6F4EF" : "#8A8497", border: "none", cursor: "pointer", letterSpacing: "0.08em", textTransform: "uppercase" as const }}
              >
                Journal
              </button>
            </div>
            {activeSection === "spiritual-profile" && (
              <div className="flex items-center gap-2">
                {editing ? (
                  <>
                    <button onClick={cancelEdit} className="w-8 h-8 rounded-full bg-[#F2EDE0] flex items-center justify-center hover:bg-[#ECE8DE] transition-colors">
                      <X className="w-3.5 h-3.5 text-[#5A5466]" />
                    </button>
                    <button onClick={saveEdit} disabled={saving} className="flex items-center gap-1.5 bg-[#3E1540] text-white text-[12px] font-semibold px-4 py-1.5 rounded-full hover:bg-[#2D0F2E] transition-colors disabled:opacity-60">
                      <Check className="w-3 h-3" />{saving ? "Saving…" : "Save"}
                    </button>
                  </>
                ) : (
                  <button onClick={startEdit} className="flex items-center gap-1.5 text-[#3E1540] text-[12px] font-semibold px-4 py-1.5 rounded-full border border-[#3E1540]/25 bg-[#3E1540]/5 hover:bg-[#3E1540]/10 transition-colors">
                    <Edit3 className="w-3 h-3" />Edit
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── Field cards ── */}
      {/* Desktop: 2x2 grid — hidden when journal active */}
      <div className={`px-7 py-6 gap-4 ${activeSection === "journal" ? "hidden" : "hidden md:grid"}`} style={{ gridTemplateColumns: "1fr 1fr" }}>
        {fields.map(({ key, label, placeholder }) => (
          <FieldCard key={key} fieldKey={key} label={label} placeholder={placeholder} />
        ))}
        {/* Sign out card */}
        <button
          onClick={onLogout}
          className="rounded-xl border border-[#E5E0D2] bg-[#FBF8F2] p-5 text-left flex items-center gap-2 text-[#EF4444] text-[14px] font-medium hover:bg-red-50/40 transition-colors col-span-2"
        >
          <LogOut className="w-4 h-4" />Sign out
        </button>
      </div>

      {/* Mobile: stacked sections */}
      {activeSection === "journal" ? (
        <div className="md:hidden">
          <JournalSection userId={userId} ministryId={initialProfile.ministry_id ?? ""} />
        </div>
      ) : (
        <div className="md:hidden px-5 pb-6">
          <div className="mb-5">
            <p className="mb-3 ml-0.5" style={{ fontFamily: "var(--font-instrument-serif)", fontSize: "19px", color: "#13101A", fontWeight: 400, letterSpacing: "-0.01em", lineHeight: 1 }}>Your story</p>
            <div className="flex flex-col gap-3">
              {fields.slice(0, 2).map(({ key, label, placeholder }) => (
                <div key={key} className="bg-white rounded-2xl border border-[#ECE8DE] p-5 shadow-[0_1px_3px_rgba(19,16,26,0.04)]">
                  <p style={{ fontFamily: "var(--font-instrument-serif)", fontSize: "15px", color: "#3E1540", fontWeight: 400, marginBottom: "8px", letterSpacing: "-0.01em" }}>{label}</p>
                  {editing ? (
                    <textarea value={draft[key]} onChange={(e) => setDraft((d) => ({ ...d, [key]: e.target.value }))} placeholder={placeholder} rows={3} className="w-full text-[13px] text-[#374151] leading-relaxed bg-transparent resize-none focus:outline-none placeholder:text-[#C4C4C4]" />
                  ) : (
                    <p className="text-[14px] text-[#374151] leading-relaxed whitespace-pre-wrap">{profile[key] || <span className="text-[#C4C4C4] italic text-[13px]">{placeholder}</span>}</p>
                  )}
                </div>
              ))}
            </div>
          </div>
          <div className="mb-6">
            <p className="mb-3 ml-0.5" style={{ fontFamily: "var(--font-instrument-serif)", fontSize: "19px", color: "#13101A", fontWeight: 400, letterSpacing: "-0.01em", lineHeight: 1 }}>Prayer</p>
            <div className="flex flex-col gap-3">
              {fields.slice(2).map(({ key, label, placeholder }) => (
                <div key={key} className="bg-white rounded-2xl border border-[#ECE8DE] p-5 shadow-[0_1px_3px_rgba(19,16,26,0.04)]">
                  <p style={{ fontFamily: "var(--font-instrument-serif)", fontSize: "15px", color: "#3E1540", fontWeight: 400, marginBottom: "8px", letterSpacing: "-0.01em" }}>{label}</p>
                  {editing ? (
                    <textarea value={draft[key]} onChange={(e) => setDraft((d) => ({ ...d, [key]: e.target.value }))} placeholder={placeholder} rows={3} className="w-full text-[13px] text-[#374151] leading-relaxed bg-transparent resize-none focus:outline-none placeholder:text-[#C4C4C4]" />
                  ) : (
                    <p className="text-[14px] text-[#374151] leading-relaxed whitespace-pre-wrap">{profile[key] || <span className="text-[#C4C4C4] italic text-[13px]">{placeholder}</span>}</p>
                  )}
                </div>
              ))}
            </div>
          </div>
          <button onClick={onLogout} className="w-full flex items-center justify-center gap-2 py-3.5 rounded-2xl bg-white border border-[#ECE8DE] text-[#EF4444] text-[14px] font-medium hover:bg-red-50/60 transition-colors shadow-[0_1px_3px_rgba(19,16,26,0.04)]">
            <LogOut className="w-4 h-4" />Sign out
          </button>
        </div>
      )}
    </div>
  )
}

// ─── Plan Tab ─────────────────────────────────────────────────────────────────

interface UserTeam {
  teamId: string
  teamName: string
  teamIcon: string | null
  teamDescription: string | null
  roleId: string
  roleName: string
  permissions: string[]
}

interface Team {
  id: string
  name: string
  icon: string | null
  description: string | null
  created_by: string
  member_count: number
}

interface CalendarEvent {
  id: string
  title: string
  description: string | null
  location: string | null
  start_date: string
  end_date: string
  all_day: boolean
  category: 'welcoming' | 'retreat' | 'social' | 'service' | 'regular'
  created_by: string
}

interface EventPlan {
  id: string
  calendar_event_id: string
  overview_notes: string | null
  expected_turnout: number | null
  budget_allocated: number | null
}

interface EventTask {
  id: string
  event_plan_id: string
  title: string
  assigned_to: string | null
  assigned_name?: string
  due_date: string | null
  completed: boolean
}

interface EventRole {
  id: string
  event_plan_id: string
  role_name: string
  assigned_to: string | null
  assigned_name?: string
  notes: string | null
}

interface EventNote {
  id: string
  event_plan_id: string
  content: string
  created_by: string
  created_by_name?: string
  created_at: string
}

interface TeamRole {
  id: string
  team_id: string
  name: string
  permissions: string[]
}

interface TeamMemberDisplay {
  user_id: string
  name: string
  role_id: string
  role_name: string
  joined_at: string
}

interface DraftRole {
  name: string
  permissions: string[]
}

const PERMISSION_LABELS: Record<string, string> = {
  can_manage_worship_set: "Manage worship set",
  can_view_worship_set: "View worship set",
  can_generate_slides: "Generate slides",
  can_create_dgs: "Create discipleship groups",
  can_view_dgs: "View discipleship groups",
  can_generate_bible_study: "Generate Bible studies",
  can_track_attendance: "Track attendance",
  can_plan_events: "Plan events",
  can_view_finances: "View finances",
  can_manage_members: "Manage members",
  can_manage_team: "Manage team",
}

const ALL_PERMISSIONS = Object.keys(PERMISSION_LABELS)

const TEAM_PRESETS = [
  {
    id: "praise",
    name: "Praise Team",
    icon: "🎵",
    description: "Worship and music ministry",
    roles: [
      { name: "Worship Leader", permissions: ["can_manage_worship_set", "can_view_worship_set", "can_generate_slides", "can_manage_team"] },
      { name: "Member", permissions: ["can_view_worship_set", "can_generate_slides"] },
    ],
  },
  {
    id: "dgl",
    name: "Small Group Leaders",
    icon: "📖",
    description: "Discipleship and Bible study",
    roles: [
      { name: "DGL President", permissions: ["can_create_dgs", "can_view_dgs", "can_generate_bible_study", "can_track_attendance", "can_manage_team"] },
      { name: "Leader", permissions: ["can_create_dgs", "can_view_dgs", "can_generate_bible_study", "can_track_attendance"] },
    ],
  },
  {
    id: "board",
    name: "Student Org Board",
    icon: "🏛️",
    description: "Ministry operations and administration",
    roles: [
      { name: "President", permissions: ["can_plan_events", "can_view_finances", "can_manage_members", "can_track_attendance", "can_manage_team"] },
      { name: "Secretary", permissions: ["can_plan_events", "can_manage_members", "can_track_attendance"] },
      { name: "Treasurer", permissions: ["can_view_finances", "can_plan_events"] },
      { name: "Event Coordinator", permissions: ["can_plan_events", "can_track_attendance"] },
    ],
  },
  {
    id: "tech",
    name: "Tech Team",
    icon: "💻",
    description: "Technical support and media",
    roles: [{ name: "Member", permissions: ["can_view_worship_set", "can_generate_slides"] }],
  },
]

// SVG paths for Plan tab icons
const ICON_SVG: Record<string, React.ReactNode> = {
  "🎵": <><path d="M9 18V6l11-3v12"/><circle cx="6" cy="18" r="3"/><circle cx="17" cy="15" r="3"/></>,
  "📖": <><path d="M2 4h7a4 4 0 0 1 4 4v12a3 3 0 0 0-3-3H2zM22 4h-7a4 4 0 0 0-4 4v12a3 3 0 0 1 3-3h8z"/></>,
  "🏛️": <><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></>,
  "💻": <><rect x="2" y="3" width="20" height="14" rx="2"/><path d="M8 21h8M12 17v4"/></>,
  "👥": <><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/></>,
  // feature-specific icons
  "set": <><path d="M9 18V6l11-3v12"/><circle cx="6" cy="18" r="3"/><circle cx="17" cy="15" r="3"/></>,
  "sliders": <><path d="M4 6h11M19 6h1M4 12h5M13 12h7M4 18h13M21 18h-1"/><circle cx="17" cy="6" r="2"/><circle cx="11" cy="12" r="2"/><circle cx="19" cy="18" r="2"/></>,
  "sparkle": <><path d="M12 3v6M12 15v6M3 12h6M15 12h6"/><path d="m6 6 3 3M15 15l3 3M6 18l3-3M15 9l3-3"/></>,
  "calendar": <><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M8 3v4M16 3v4M3 11h18"/></>,
  "book": <><path d="M2 4h7a4 4 0 0 1 4 4v12a3 3 0 0 0-3-3H2zM22 4h-7a4 4 0 0 0-4 4v12a3 3 0 0 1 3-3h8z"/></>,
  "users": <><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/></>,
  "chart": <><path d="M3 3v18h18"/><path d="m19 9-5 5-4-4-3 3"/></>,
  "seedling": <path d="M7 20s-2-8 5-13c0 0 2 5 6 7l-1 6H7zM12 7s0 4-3 8"/>,
  "dollar": <><line x1="12" y1="2" x2="12" y2="22"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></>,
  "clipboard": <><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><path d="M15 2H9a1 1 0 0 0-1 1v2a1 1 0 0 0 1 1h6a1 1 0 0 0 1-1V3a1 1 0 0 0-1-1z"/></>,
}

function PlanLineIcon({ iconKey, bg = "#3E1540", fg = "#F6F4EF", size = 40 }: { iconKey: string; bg?: string; fg?: string; size?: number }) {
  const paths = ICON_SVG[iconKey] ?? ICON_SVG["clipboard"]
  return (
    <div style={{ width: size, height: size, borderRadius: 10, background: bg, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={fg} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        {paths}
      </svg>
    </div>
  )
}


const WORSHIP_FEATURES = [
  { icon: "set", name: "This Week's Set", desc: "View songs, keys, and role assignments for Sunday's worship." },
  { icon: "sliders", name: "Set Builder", desc: "Build and reorder worship sets, assign keys and roles per song." },
  { icon: "sparkle", name: "Slide Generator", desc: "Auto-generate lyric slides from your worship set." },
  { icon: "calendar", name: "Team Schedule", desc: "See who's playing what role this Sunday." },
]

const DISCIPLESHIP_FEATURES = [
  { icon: "users", name: "My Group", desc: "View your small group members and contact info." },
  { icon: "book", name: "Bible Study Generator", desc: "AI-generated study guides from any passage or topic." },
  { icon: "users", name: "Attendance", desc: "Track weekly attendance for your small group." },
]

const MINISTRY_FEATURES = [
  { icon: "calendar", name: "Events", desc: "Plan and manage upcoming ministry events." },
  { icon: "chart", name: "Attendance Overview", desc: "Ministry-wide attendance trends and insights." },
  { icon: "seedling", name: "New folks", desc: "Track new visitors and their journey to membership." },
  { icon: "dollar", name: "Finances", desc: "Budget tracking and expense reporting for your ministry." },
]

function PlanSectionHeader({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-3 mb-3">
      <span style={{ fontFamily: "var(--font-instrument-serif)", fontSize: "22px", fontWeight: 400, color: "#13101A", letterSpacing: "-0.01em" }}>
        {children}
      </span>
      <div className="flex-1 h-px bg-[#ECE8DE]" />
    </div>
  )
}

function PlanFeatureCard({ icon, name, desc }: { icon: string; name: string; desc: string }) {
  return (
    <div className="bg-white rounded-2xl border border-[#ECE8DE] p-4 shadow-[0_1px_4px_rgba(19,16,26,0.06)] opacity-70">
      <div className="flex items-start gap-3">
        <PlanLineIcon iconKey={icon} bg="#ffffff" fg="#3E1540" />
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2">
            <p className="text-[14px] font-semibold text-[#13101A]">{name}</p>
            <span className="text-[10px] font-medium text-[#8A8497] bg-[#F0EDE8] px-2 py-0.5 rounded-full whitespace-nowrap flex-shrink-0 mt-0.5">
              Soon
            </span>
          </div>
          <p className="text-[13px] text-[#5A5466] mt-0.5 leading-relaxed">{desc}</p>
        </div>
      </div>
    </div>
  )
}

interface PlanTabProps {
  userId: string
  ministryId: string
  ministryName: string
  userTeams: UserTeam[]
  allTeams: Team[]
  isAdmin: boolean
  onTeamsChange: () => void
  showCreateTeam: boolean
  onShowCreateTeam: (v: boolean) => void
  activeTeamId: string | null
  onTeamCreated: (teamId: string) => void
}

function PlanTab({ userId, ministryId, ministryName, userTeams, allTeams, isAdmin, onTeamsChange, showCreateTeam, onShowCreateTeam, activeTeamId, onTeamCreated }: PlanTabProps) {
  const activeTeamName = userTeams.find(t => t.teamId === activeTeamId)?.teamName ?? (isAdmin ? ministryName : "Plan")
  const setShowCreateTeam = onShowCreateTeam
  const [openTeam, setOpenTeam] = useState<Team | null>(null)

  const hasAnyPlanning = isAdmin || userTeams.length > 0

  const monoStyle: React.CSSProperties = {
    fontFamily: "ui-monospace, 'SF Mono', Menlo, monospace",
    fontSize: "11px",
    letterSpacing: "0.04em",
    textTransform: "uppercase",
    color: "#8A8497",
  }

  const teamsToShow = isAdmin ? allTeams : userTeams.map(t => ({ id: t.teamId, name: t.teamName, icon: t.teamIcon, description: t.teamDescription, created_by: "", member_count: 0 }))

  return (
    <div className="pb-2 md:pb-0">
      {/* Desktop Topbar */}
      <DesktopTopbar crumbs={["Central", "Plan"]} />

      {/* Mobile Header */}
      <div className="flex items-center justify-between px-5 pt-14 pb-5 md:hidden">
        <div className="flex items-center gap-2.5">
          <svg width="26" height="26" viewBox="0 0 100 100" fill="none">
            <circle cx="50" cy="50" r="44" stroke="#3E1540" strokeWidth="6" />
            <rect x="47" y="22" width="6" height="56" fill="#3E1540" />
            <rect x="22" y="47" width="56" height="6" fill="#3E1540" />
          </svg>
          <span style={{ fontFamily: "var(--font-instrument-serif)", fontSize: "28px", color: "#13101A", letterSpacing: "-0.01em", lineHeight: 1 }}>{ministryName}</span>
        </div>
        {isAdmin && (
          <button onClick={() => setShowCreateTeam(true)} className="size-9 bg-[#3E1540] rounded-xl flex items-center justify-center hover:bg-[#2D0F2E] transition-colors">
            <Plus className="w-4 h-4 text-[#F6F4EF]" />
          </button>
        )}
      </div>

      {/* Mobile title */}
      <div className="flex items-end justify-between px-5 mb-5 md:hidden">
        <h1 style={{ fontFamily: "var(--font-instrument-serif)", fontSize: "36px", fontWeight: 400, letterSpacing: "-0.02em", color: "#13101A", lineHeight: 1.05, margin: 0 }}>Plan</h1>
      </div>

      {/* Desktop Editorial Header */}
      <div className="hidden md:flex items-start justify-between px-14 pt-11 pb-8 border-b border-[#E5E0D2]">
        <div>
          <p style={monoStyle}>{new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })}</p>
          <h1 style={{ margin: "14px 0 0", fontFamily: "var(--font-instrument-serif)", fontWeight: 400, fontSize: "52px", lineHeight: 1.05, letterSpacing: "-0.01em", color: "#13101A" }}>
            {activeTeamName}
          </h1>
          <p style={{ marginTop: "12px", color: "#5A5466", fontSize: "14px", maxWidth: "560px" }}>
            The week as it stands. Groups to prepare, people to thank.
          </p>
        </div>
        {(() => {
          const activeUserTeam = userTeams.find(t => t.teamId === activeTeamId)
          const activeTeamFull: Team | undefined = allTeams.find(t => t.id === activeTeamId)
            ?? (activeUserTeam ? { id: activeUserTeam.teamId, name: activeUserTeam.teamName, icon: activeUserTeam.teamIcon, description: activeUserTeam.teamDescription, created_by: "", member_count: 0 } : undefined)
          if (!activeTeamFull) return null
          return (
            <button
              onClick={() => setOpenTeam(activeTeamFull)}
              className="w-8 h-8 flex items-center justify-center rounded-lg border border-[#E5E0D2] bg-[#FBF8F2] hover:bg-[#EFEAE0] transition-colors flex-shrink-0"
              title="Team settings"
            >
              <Settings className="w-4 h-4 text-[#5A5466]" />
            </button>
          )
        })()}
      </div>

      {/* Desktop content */}
      <div className="hidden md:block px-14 py-7">
        {(() => {
          const activeUserTeam = userTeams.find(t => t.teamId === activeTeamId)
          const perms = activeUserTeam?.permissions ?? []
          const showCalendar = perms.includes('can_plan_events')
          if (!showCalendar) return null
          const canEdit = isAdmin || perms.includes('can_plan_events')
          return (
            <MinistryCalendar
              ministryId={ministryId}
              teamId={activeTeamId}
              userId={userId}
              canEdit={canEdit}
            />
          )
        })()}
      </div>

      {/* Mobile content */}
      <div className="md:hidden px-5 pb-4">
        {/* Admin: team management */}
        {isAdmin && (
          <div className="mb-8">
            <PlanSectionHeader>Teams</PlanSectionHeader>
            {allTeams.length === 0 ? (
              <div className="bg-white rounded-2xl border border-dashed border-[#ECE8DE] p-6 text-center">
                <p className="text-[14px] font-semibold text-[#13101A]/60 mb-1">No teams yet.</p>
                <p className="text-[13px] text-[#8A8497]">Tap + above to create your first team.</p>
              </div>
            ) : (
              <div className="flex flex-col gap-2">
                {allTeams.map((team) => (
                  <button
                    key={team.id}
                    onClick={() => setOpenTeam(team)}
                    className="w-full bg-white rounded-2xl border border-[#ECE8DE] p-4 shadow-[0_1px_4px_rgba(19,16,26,0.06)] text-left flex items-center gap-3 hover:bg-[#FDFBF7] transition-colors"
                  >
                    <PlanLineIcon iconKey={team.icon ?? "👥"} bg="#3E1540" fg="#F6F4EF" />
                    <div className="flex-1 min-w-0">
                      <p className="text-[14px] font-semibold text-[#13101A]">{team.name}</p>
                      <p className="text-[12px] text-[#8A8497]">{team.member_count} member{team.member_count !== 1 ? "s" : ""}</p>
                    </div>
                    <ChevronRight className="w-4 h-4 text-[#C4C4C4] flex-shrink-0" />
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        <div className="mt-4">
          <PlanSectionHeader>Tools</PlanSectionHeader>
          <div className="grid grid-cols-2 gap-2">
            {[
              { icon: "set", name: "Set" },
              { icon: "sparkle", name: "Slides" },
              { icon: "calendar", name: "Schedule" },
              { icon: "book", name: "Bible Study" },
            ].map((tool) => (
              <div key={tool.name} className="bg-white rounded-2xl border border-[#ECE8DE] p-4 shadow-[0_1px_4px_rgba(19,16,26,0.06)] opacity-60 flex flex-col gap-2">
                <PlanLineIcon iconKey={tool.icon} bg="#ffffff" fg="#3E1540" size={36} />
                <div>
                  <p className="text-[13px] font-semibold text-[#13101A]">{tool.name}</p>
                  <p style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: "9px", color: "#8A8497", letterSpacing: "0.08em", textTransform: "uppercase", marginTop: "2px" }}>Coming soon</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {!isAdmin && !hasAnyPlanning && userTeams.length === 0 && (
          <EmptyState
            icon={<ClipboardList className="w-6 h-6" />}
            title="You're not on a team yet."
            subtitle="Ask a leader to add you."
          />
        )}
      </div>

      {showCreateTeam && (
        <CreateTeamOverlay
          userId={userId}
          ministryId={ministryId}
          onClose={() => setShowCreateTeam(false)}
          onCreated={(teamId) => { setShowCreateTeam(false); onTeamsChange(); onTeamCreated(teamId) }}
        />
      )}

      {openTeam && (
        <TeamDetailOverlay
          team={openTeam}
          userId={userId}
          ministryId={ministryId}
          isAdmin={isAdmin}
          onClose={() => setOpenTeam(null)}
          onChanged={() => { setOpenTeam(null); onTeamsChange() }}
        />
      )}
    </div>
  )
}

// ── MinistryCalendar ──────────────────────────────────────────────────────────

const CATEGORY_CONFIG = {
  welcoming: { label: "Welcoming", dot: "#16A34A", bg: "#DCFCE7", text: "#14532D" },
  retreat:   { label: "Retreat",   dot: "#2563EB", bg: "#DBEAFE", text: "#1E3A8A" },
  social:    { label: "Social",    dot: "#C9A34B", bg: "#FEF3C7", text: "#92400E" },
  service:   { label: "Service",   dot: "#7C3AED", bg: "#EDE9FE", text: "#4C1D95" },
  regular:   { label: "Regular",   dot: "#6B7280", bg: "#F3F4F6", text: "#374151" },
} as const
type Category = keyof typeof CATEGORY_CONFIG

function MonthGrid({
  events,
  currentMonth,
  onMonthChange,
  onSelectEvent,
}: {
  events: CalendarEvent[]
  currentMonth: Date
  onMonthChange: (d: Date) => void
  onSelectEvent: (e: CalendarEvent) => void
}) {
  const year = currentMonth.getFullYear()
  const month = currentMonth.getMonth()
  const firstDayOfWeek = new Date(year, month, 1).getDay()
  const daysInMonth = new Date(year, month + 1, 0).getDate()

  const cells: (number | null)[] = [
    ...Array(firstDayOfWeek).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ]
  while (cells.length % 7 !== 0) cells.push(null)

  const today = new Date()
  const isToday = (day: number) =>
    today.getFullYear() === year && today.getMonth() === month && today.getDate() === day

  const eventsOnDay = (day: number) => {
    return events.filter((ev) => {
      const d = new Date(ev.start_date)
      return d.getFullYear() === year && d.getMonth() === month && d.getDate() === day
    })
  }

  const monthLabel = currentMonth.toLocaleDateString("en-US", { month: "long", year: "numeric" })

  return (
    <div>
      {/* Month nav */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 16, marginBottom: 12 }}>
        <button
          onClick={() => onMonthChange(new Date(year, month - 1, 1))}
          style={{ width: 28, height: 28, borderRadius: 8, border: "1px solid #E5E0D2", background: "#FBF8F2", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}
        >
          <ChevronLeft className="w-4 h-4 text-[#5A5466]" />
        </button>
        <span style={{ fontFamily: "var(--font-instrument-serif)", fontSize: 18, color: "#13101A", fontWeight: 400, minWidth: 180, textAlign: "center" }}>
          {monthLabel}
        </span>
        <button
          onClick={() => onMonthChange(new Date(year, month + 1, 1))}
          style={{ width: 28, height: 28, borderRadius: 8, border: "1px solid #E5E0D2", background: "#FBF8F2", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}
        >
          <ChevronRight className="w-4 h-4 text-[#5A5466]" />
        </button>
      </div>

      {/* Week header */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", marginBottom: 4 }}>
        {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => (
          <div key={d} style={{ fontFamily: "ui-monospace, 'SF Mono', Menlo, monospace", fontSize: 10, letterSpacing: "0.04em", textTransform: "uppercase", color: "#8A8497", textAlign: "center", paddingBottom: 4 }}>
            {d}
          </div>
        ))}
      </div>

      {/* Grid */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", border: "1px solid #E5E0D2", borderRadius: 10, overflow: "hidden" }}>
        {cells.map((day, idx) => {
          const dayEvents = day ? eventsOnDay(day) : []
          const visible = dayEvents.slice(0, 2)
          const overflow = dayEvents.length - 2

          return (
            <div
              key={idx}
              style={{
                minHeight: 80,
                borderRight: idx % 7 !== 6 ? "1px solid #E5E0D2" : "none",
                borderBottom: idx < cells.length - 7 ? "1px solid #E5E0D2" : "none",
                background: day && isToday(day) ? "#F4F0F8" : "#FBF8F2",
                padding: "4px 3px 3px",
                position: "relative",
              }}
            >
              {day && (
                <>
                  <div style={{
                    textAlign: "right",
                    fontSize: 12,
                    fontWeight: isToday(day) ? 700 : 400,
                    color: isToday(day) ? "#3E1540" : "#5A5466",
                    marginBottom: 2,
                    paddingRight: 2,
                  }}>
                    {day}
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                    {visible.map((ev) => {
                      const cfg = CATEGORY_CONFIG[ev.category]
                      return (
                        <button
                          key={ev.id}
                          onClick={() => onSelectEvent(ev)}
                          style={{
                            display: "block",
                            width: "100%",
                            textAlign: "left",
                            background: "none",
                            border: "none",
                            cursor: "pointer",
                            padding: "1px 4px 1px 6px",
                            borderLeft: `3px solid ${cfg.dot}`,
                            borderRadius: 2,
                            fontSize: 11,
                            color: "#13101A",
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            whiteSpace: "nowrap",
                            lineHeight: "18px",
                          }}
                          title={ev.title}
                        >
                          {ev.title}
                        </button>
                      )
                    })}
                    {overflow > 0 && (
                      <span style={{ fontSize: 10, color: "#8A8497", paddingLeft: 4 }}>+{overflow} more</span>
                    )}
                  </div>
                </>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

function TimelineView({
  events,
  onSelectEvent,
}: {
  events: CalendarEvent[]
  onSelectEvent: (e: CalendarEvent) => void
}) {
  // Group by yyyy-MM
  const groups: Record<string, CalendarEvent[]> = {}
  for (const ev of events) {
    const key = ev.start_date.slice(0, 7)
    if (!groups[key]) groups[key] = []
    groups[key].push(ev)
  }

  const monthKeys = Object.keys(groups).sort()

  if (monthKeys.length === 0) {
    return (
      <div style={{ textAlign: "center", padding: "40px 0", color: "#8A8497", fontSize: 14 }}>
        No events yet.
      </div>
    )
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
      {monthKeys.map((key) => {
        const [yyyy, mm] = key.split("-")
        const monthLabel = new Date(Number(yyyy), Number(mm) - 1, 1).toLocaleDateString("en-US", { month: "long", year: "numeric" })
        return (
          <div key={key}>
            <div style={{ fontFamily: "ui-monospace, 'SF Mono', Menlo, monospace", fontSize: 10, letterSpacing: "0.08em", textTransform: "uppercase", color: "#8A8497", marginBottom: 8 }}>
              {monthLabel}
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {groups[key].map((ev) => {
                const cfg = CATEGORY_CONFIG[ev.category]
                const startDate = new Date(ev.start_date)
                const endDate = new Date(ev.end_date)
                const dateStr = ev.all_day
                  ? startDate.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })
                  : startDate.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" }) +
                    " · " + startDate.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" }) +
                    " – " + endDate.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })

                return (
                  <button
                    key={ev.id}
                    onClick={() => onSelectEvent(ev)}
                    style={{
                      display: "flex",
                      alignItems: "flex-start",
                      gap: 10,
                      background: "#FBF8F2",
                      border: "1px solid #E5E0D2",
                      borderRadius: 10,
                      padding: "10px 12px",
                      cursor: "pointer",
                      textAlign: "left",
                      width: "100%",
                    }}
                  >
                    <div style={{ width: 8, height: 8, borderRadius: "50%", background: cfg.dot, flexShrink: 0, marginTop: 5 }} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                        <span style={{ fontWeight: 500, fontSize: 14, color: "#13101A" }}>{ev.title}</span>
                        <span style={{ fontSize: 11, fontWeight: 500, color: cfg.text, background: cfg.bg, padding: "1px 7px", borderRadius: 9999 }}>
                          {cfg.label}
                        </span>
                      </div>
                      <div style={{ fontSize: 12, color: "#8A8497", marginTop: 2 }}>{dateStr}</div>
                      {ev.location && <div style={{ fontSize: 12, color: "#8A8497", marginTop: 1 }}>{ev.location}</div>}
                    </div>
                  </button>
                )
              })}
            </div>
          </div>
        )
      })}
    </div>
  )
}

function EventDetailPopover({
  event,
  canEdit,
  userId,
  onClose,
  onDelete,
  onPlan,
}: {
  event: CalendarEvent
  canEdit: boolean
  userId: string
  onClose: () => void
  onDelete: (id: string) => void
  onPlan: (ev: CalendarEvent) => void
}) {
  const cfg = CATEGORY_CONFIG[event.category]
  const startDate = new Date(event.start_date)
  const endDate = new Date(event.end_date)

  const dateStr = event.all_day
    ? startDate.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })
    : startDate.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" }) +
      " · " + startDate.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" }) +
      " – " + endDate.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })

  return (
    <div
      style={{ position: "fixed", inset: 0, zIndex: 120, background: "rgba(19,16,26,0.35)", display: "flex", alignItems: "center", justifyContent: "center", padding: "20px" }}
      onClick={onClose}
    >
      <div
        style={{ background: "#FBF8F2", borderRadius: 16, padding: "24px", maxWidth: 480, width: "100%", maxHeight: 500, overflowY: "auto", boxShadow: "0 8px 40px rgba(19,16,26,0.16)" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 12 }}>
          <span style={{ fontSize: 11, fontWeight: 500, color: cfg.text, background: cfg.bg, padding: "3px 10px", borderRadius: 9999 }}>
            {cfg.label}
          </span>
          <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", padding: 0 }}>
            <X className="w-4 h-4 text-[#8A8497]" />
          </button>
        </div>
        <h2 style={{ fontFamily: "var(--font-instrument-serif)", fontSize: 24, fontWeight: 400, color: "#13101A", margin: "0 0 8px" }}>
          {event.title}
        </h2>
        <p style={{ fontSize: 13, color: "#8A8497", margin: "0 0 6px" }}>{dateStr}</p>
        {event.location && (
          <p style={{ fontSize: 13, color: "#5A5466", margin: "0 0 12px" }}>📍 {event.location}</p>
        )}
        {event.description && (
          <p style={{ fontSize: 14, color: "#5A5466", lineHeight: 1.6, margin: "0 0 16px" }}>{event.description}</p>
        )}
        <button
          onClick={() => onPlan(event)}
          style={{
            display: "flex", alignItems: "center", gap: 6,
            background: "#3E1540", color: "#F6F4EF",
            border: "none", borderRadius: 8, padding: "8px 16px",
            cursor: "pointer", fontSize: 13, fontWeight: 500,
            marginBottom: 8, width: "100%", justifyContent: "center"
          }}
        >
          Plan this event →
        </button>
        {(canEdit || event.created_by === userId) && (
          <button
            onClick={() => onDelete(event.id)}
            style={{ display: "flex", alignItems: "center", gap: 6, background: "none", border: "1px solid #ECE8DE", borderRadius: 8, padding: "6px 12px", cursor: "pointer", fontSize: 13, color: "#C0392B" }}
          >
            <Trash2 className="w-3.5 h-3.5" />
            Delete event
          </button>
        )}
      </div>
    </div>
  )
}

function AddEventModal({
  ministryId,
  teamId,
  userId,
  onClose,
  onSaved,
}: {
  ministryId: string
  teamId: string | null
  userId: string
  onClose: () => void
  onSaved: (ev: CalendarEvent) => void
}) {
  const supabase = createClient()
  const [title, setTitle] = useState("")
  const [description, setDescription] = useState("")
  const [location, setLocation] = useState("")
  const [startDateStr, setStartDateStr] = useState("")
  const [startTimeStr, setStartTimeStr] = useState("09:00")
  const [endDateStr, setEndDateStr] = useState("")
  const [endTimeStr, setEndTimeStr] = useState("10:00")
  const [allDay, setAllDay] = useState(false)
  const [category, setCategory] = useState<Category>("regular")
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSave() {
    if (!title.trim()) { setError("Title is required."); return }
    if (!startDateStr) { setError("Start date is required."); return }
    if (!endDateStr) { setError("End date is required."); return }

    const startTs = allDay
      ? `${startDateStr}T00:00:00+00:00`
      : `${startDateStr}T${startTimeStr}:00+00:00`
    const endTs = allDay
      ? `${endDateStr}T23:59:59+00:00`
      : `${endDateStr}T${endTimeStr}:00+00:00`

    setSaving(true)
    setError(null)
    try {
      const { data, error: dbErr } = await supabase
        .from("calendar_events")
        .insert({
          ministry_id: ministryId,
          team_id: teamId,
          title: title.trim(),
          description: description.trim() || null,
          location: location.trim() || null,
          start_date: startTs,
          end_date: endTs,
          all_day: allDay,
          category,
          created_by: userId,
        })
        .select("id, title, description, location, start_date, end_date, all_day, category, created_by")
        .single()

      if (dbErr) {
        setError(dbErr.message)
        setSaving(false)
        return
      }
      onSaved(data as CalendarEvent)
    } catch (e: unknown) {
      setError((e as { message?: string }).message ?? "Failed to save event.")
    } finally {
      setSaving(false)
    }
  }

  const inputStyle: React.CSSProperties = {
    width: "100%",
    background: "#FBF8F2",
    border: "1px solid #E5E0D2",
    borderRadius: 8,
    padding: "8px 12px",
    fontSize: 14,
    color: "#13101A",
    outline: "none",
    boxSizing: "border-box",
  }

  const labelStyle: React.CSSProperties = {
    fontSize: 11,
    fontFamily: "ui-monospace, 'SF Mono', Menlo, monospace",
    letterSpacing: "0.06em",
    textTransform: "uppercase",
    color: "#8A8497",
    marginBottom: 4,
    display: "block",
  }

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 80, background: "#FBF8F2", display: "flex", flexDirection: "column", overflowY: "auto" }}>
      <div style={{ maxWidth: 560, width: "100%", margin: "0 auto", padding: "48px 24px 40px" }}>
        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 28 }}>
          <h2 style={{ fontFamily: "var(--font-instrument-serif)", fontSize: 28, fontWeight: 400, color: "#13101A", margin: 0 }}>
            Add Event
          </h2>
          <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", padding: 4 }}>
            <X className="w-5 h-5 text-[#8A8497]" />
          </button>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
          {/* Title */}
          <div>
            <label style={labelStyle}>Title *</label>
            <input style={inputStyle} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Event name" />
          </div>

          {/* Description */}
          <div>
            <label style={labelStyle}>Description</label>
            <textarea
              style={{ ...inputStyle, resize: "vertical", minHeight: 80 }}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Optional details…"
            />
          </div>

          {/* Location */}
          <div>
            <label style={labelStyle}>Location</label>
            <input style={inputStyle} value={location} onChange={(e) => setLocation(e.target.value)} placeholder="Room, building, or address" />
          </div>

          {/* All day toggle */}
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <input
              type="checkbox"
              id="allDay"
              checked={allDay}
              onChange={(e) => setAllDay(e.target.checked)}
              style={{ width: 16, height: 16, accentColor: "#3E1540", cursor: "pointer" }}
            />
            <label htmlFor="allDay" style={{ fontSize: 14, color: "#5A5466", cursor: "pointer" }}>All day</label>
          </div>

          {/* Dates + times */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <div>
              <label style={labelStyle}>Start date *</label>
              <input type="date" style={inputStyle} value={startDateStr} onChange={(e) => setStartDateStr(e.target.value)} />
            </div>
            <div>
              <label style={labelStyle}>Start time</label>
              <input type="time" style={{ ...inputStyle, opacity: allDay ? 0.4 : 1 }} value={startTimeStr} onChange={(e) => setStartTimeStr(e.target.value)} disabled={allDay} />
            </div>
            <div>
              <label style={labelStyle}>End date *</label>
              <input type="date" style={inputStyle} value={endDateStr} onChange={(e) => setEndDateStr(e.target.value)} />
            </div>
            <div>
              <label style={labelStyle}>End time</label>
              <input type="time" style={{ ...inputStyle, opacity: allDay ? 0.4 : 1 }} value={endTimeStr} onChange={(e) => setEndTimeStr(e.target.value)} disabled={allDay} />
            </div>
          </div>

          {/* Category picker */}
          <div>
            <label style={labelStyle}>Category</label>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {(Object.keys(CATEGORY_CONFIG) as Category[]).map((cat) => {
                const cfg = CATEGORY_CONFIG[cat]
                return (
                  <button
                    key={cat}
                    onClick={() => setCategory(cat)}
                    style={{
                      padding: "5px 14px",
                      borderRadius: 9999,
                      fontSize: 13,
                      fontWeight: 500,
                      cursor: "pointer",
                      border: category === cat ? `2px solid ${cfg.dot}` : "2px solid transparent",
                      background: cfg.bg,
                      color: cfg.text,
                      transition: "border-color 0.15s",
                    }}
                  >
                    {cfg.label}
                  </button>
                )
              })}
            </div>
          </div>

          {error && <p style={{ fontSize: 13, color: "#C0392B" }}>{error}</p>}

          {/* Actions */}
          <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", marginTop: 8 }}>
            <button
              onClick={onClose}
              style={{ padding: "8px 20px", borderRadius: 8, border: "1px solid #E5E0D2", background: "#FBF8F2", fontSize: 14, color: "#5A5466", cursor: "pointer" }}
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={saving}
              style={{ padding: "8px 20px", borderRadius: 8, border: "none", background: "#3E1540", color: "#F6F4EF", fontSize: 14, fontWeight: 500, cursor: saving ? "not-allowed" : "pointer", opacity: saving ? 0.7 : 1 }}
            >
              {saving ? "Saving…" : "Save event"}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

function MinistryCalendar({
  ministryId,
  teamId,
  userId,
  canEdit,
}: {
  ministryId: string
  teamId: string | null
  userId: string
  canEdit: boolean
}) {
  const supabase = createClient()
  const [view, setView] = useState<"month" | "list">("month")
  const [events, setEvents] = useState<CalendarEvent[]>([])
  const [plannedEventIds, setPlannedEventIds] = useState<Set<string>>(new Set())
  const [currentMonth, setCurrentMonth] = useState(new Date())
  const [selectedEvent, setSelectedEvent] = useState<CalendarEvent | null>(null)
  const [showAdd, setShowAdd] = useState(false)
  const [loading, setLoading] = useState(true)
  const [tableReady, setTableReady] = useState(true)
  const [planningEvent, setPlanningEvent] = useState<CalendarEvent | null>(null)

  useEffect(() => {
    async function fetchEvents() {
      setLoading(true)
      let query = supabase
        .from("calendar_events")
        .select("id, title, description, location, start_date, end_date, all_day, category, created_by")
        .eq("ministry_id", ministryId)
        .order("start_date", { ascending: true })

      if (teamId) {
        query = query.or(`team_id.eq.${teamId},team_id.is.null`)
      }

      const { data, error } = await query
      if (error && error.message.includes("Could not find the table")) {
        setTableReady(false)
      } else {
        setEvents((data ?? []) as CalendarEvent[])
      }

      // Also fetch which events already have a plan
      const { data: plans } = await supabase
        .from("event_plans")
        .select("calendar_event_id")
        .eq("ministry_id", ministryId)
      if (plans) {
        setPlannedEventIds(new Set(plans.map((p: { calendar_event_id: string }) => p.calendar_event_id)))
      }

      setLoading(false)
    }
    fetchEvents()
  }, [ministryId, teamId])

  async function handleDelete(id: string) {
    setEvents((prev) => prev.filter((ev) => ev.id !== id))
    await supabase.from("calendar_events").delete().eq("id", id)
  }

  if (!tableReady) {
    return (
      <div style={{ borderTop: "1px solid #E5E0D2", paddingTop: 24, marginBottom: 32 }}>
        <p style={{ fontFamily: "var(--font-instrument-serif)", fontSize: 22, fontWeight: 400, color: "#13101A", marginBottom: 8 }}>Ministry Calendar</p>
        <div style={{ background: "#FBF8F2", border: "1px dashed #E5E0D2", borderRadius: 12, padding: "24px 20px", textAlign: "center" }}>
          <p style={{ fontSize: 13, color: "#5A5466", marginBottom: 4 }}>Calendar database table not set up yet.</p>
          <p style={{ fontSize: 12, color: "#8A8497" }}>Run <code style={{ background: "#EFEAE0", padding: "1px 5px", borderRadius: 4 }}>supabase/calendar_migration.sql</code> in the Supabase SQL Editor to enable this feature.</p>
        </div>
      </div>
    )
  }

  return (
    <div style={{ borderTop: "1px solid #E5E0D2", paddingTop: 24, marginBottom: 32 }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
        <span style={{ fontFamily: "var(--font-instrument-serif)", fontSize: 22, fontWeight: 400, color: "#13101A" }}>
          Ministry Calendar
        </span>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          {/* View toggle */}
          <div style={{ display: "flex", background: "#F0EDE8", borderRadius: 8, padding: 2, gap: 2 }}>
            <button
              onClick={() => setView("month")}
              style={{
                display: "flex", alignItems: "center", gap: 4, padding: "4px 10px", borderRadius: 6,
                background: view === "month" ? "#FBF8F2" : "transparent",
                border: "none", cursor: "pointer", fontSize: 12, color: view === "month" ? "#13101A" : "#8A8497",
                fontWeight: view === "month" ? 500 : 400,
                boxShadow: view === "month" ? "0 1px 3px rgba(19,16,26,0.08)" : "none",
              }}
            >
              <Grid3x3 className="w-3 h-3" /> Month
            </button>
            <button
              onClick={() => setView("list")}
              style={{
                display: "flex", alignItems: "center", gap: 4, padding: "4px 10px", borderRadius: 6,
                background: view === "list" ? "#FBF8F2" : "transparent",
                border: "none", cursor: "pointer", fontSize: 12, color: view === "list" ? "#13101A" : "#8A8497",
                fontWeight: view === "list" ? 500 : 400,
                boxShadow: view === "list" ? "0 1px 3px rgba(19,16,26,0.08)" : "none",
              }}
            >
              <List className="w-3 h-3" /> List
            </button>
          </div>
          {canEdit && (
            <button
              onClick={() => setShowAdd(true)}
              style={{ display: "flex", alignItems: "center", gap: 4, background: "#3E1540", color: "#F6F4EF", border: "none", borderRadius: 8, padding: "5px 10px", fontSize: 12, cursor: "pointer", fontWeight: 500 }}
            >
              <Plus className="w-3 h-3" /> Add event
            </button>
          )}
        </div>
      </div>

      <div style={{ display: "flex", gap: 28, alignItems: "flex-start" }}>
        {/* Calendar — left */}
        <div style={{ flex: 1, minWidth: 0 }}>
          {loading ? (
            <div style={{ textAlign: "center", padding: "32px 0", color: "#8A8497", fontSize: 13 }}>Loading…</div>
          ) : view === "month" ? (
            <MonthGrid
              events={events}
              currentMonth={currentMonth}
              onMonthChange={setCurrentMonth}
              onSelectEvent={setSelectedEvent}
            />
          ) : (
            <TimelineView events={events} onSelectEvent={setSelectedEvent} />
          )}
        </div>

        {/* Events panel — right */}
        <div style={{ width: 232, flexShrink: 0, borderLeft: "1px solid #E5E0D2", paddingLeft: 20 }}>
          <p style={{ fontFamily: "ui-monospace,'SF Mono',Menlo,monospace", fontSize: 10, letterSpacing: "0.06em", textTransform: "uppercase", color: "#8A8497", margin: "0 0 10px" }}>
            Events · {events.length || 3}
          </p>

          {events.length === 0 ? (
            /* Default placeholder items when calendar isn't seeded yet */
            [
              { title: "Turkey Bowl", category: "social" as Category, date: "Nov 22" },
              { title: "Welcome Night", category: "welcoming" as Category, date: "Aug 29" },
              { title: "Coffeehouse", category: "social" as Category, date: "Nov 7" },
            ].map((item) => {
              const cfg = CATEGORY_CONFIG[item.category]
              return (
                <div key={item.title} style={{ display: "flex", flexDirection: "column", gap: 4, padding: "10px 0", borderBottom: "1px solid #F0EDE8" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
                    <span style={{ width: 7, height: 7, borderRadius: "50%", background: cfg.dot, flexShrink: 0 }} />
                    <span style={{ fontSize: 13, fontWeight: 500, color: "#13101A", flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{item.title}</span>
                  </div>
                  <span style={{ fontSize: 11, color: "#8A8497", paddingLeft: 14 }}>{item.date}</span>
                  <span style={{ marginLeft: 14, display: "inline-block", fontSize: 10, fontWeight: 500, color: "#92400E", background: "#FEF3C7", borderRadius: 9999, padding: "2px 8px", width: "fit-content" }}>
                    Needs planning
                  </span>
                </div>
              )
            })
          ) : (
            events.map((ev) => {
              const cfg = CATEGORY_CONFIG[ev.category]
              const isPlanned = plannedEventIds.has(ev.id)
              const dateStr = new Date(ev.start_date).toLocaleDateString("en-US", { month: "short", day: "numeric" })
              return (
                <div key={ev.id} style={{ display: "flex", flexDirection: "column", gap: 4, padding: "10px 0", borderBottom: "1px solid #F0EDE8" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
                    <span style={{ width: 7, height: 7, borderRadius: "50%", background: cfg.dot, flexShrink: 0 }} />
                    <span style={{ fontSize: 13, fontWeight: 500, color: "#13101A", flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{ev.title}</span>
                  </div>
                  <span style={{ fontSize: 11, color: "#8A8497", paddingLeft: 14 }}>{dateStr}</span>
                  <div style={{ paddingLeft: 14, display: "flex", alignItems: "center", gap: 6 }}>
                    {isPlanned ? (
                      <span style={{ fontSize: 10, fontWeight: 500, color: "#14532D", background: "#DCFCE7", borderRadius: 9999, padding: "2px 8px" }}>Planned ✓</span>
                    ) : (
                      <span style={{ fontSize: 10, fontWeight: 500, color: "#92400E", background: "#FEF3C7", borderRadius: 9999, padding: "2px 8px" }}>Needs planning</span>
                    )}
                    <button
                      onClick={() => setPlanningEvent(ev)}
                      style={{ fontSize: 11, color: "#3E1540", background: "none", border: "none", cursor: "pointer", fontWeight: 500, padding: 0, textDecoration: "underline", textDecorationColor: "transparent" }}
                      onMouseEnter={(e) => (e.currentTarget.style.textDecorationColor = "#3E1540")}
                      onMouseLeave={(e) => (e.currentTarget.style.textDecorationColor = "transparent")}
                    >
                      {isPlanned ? "View plan" : "Plan →"}
                    </button>
                  </div>
                </div>
              )
            })
          )}
        </div>
      </div>

      {selectedEvent && (
        <EventDetailPopover
          event={selectedEvent}
          canEdit={canEdit}
          userId={userId}
          onClose={() => setSelectedEvent(null)}
          onDelete={(id) => { handleDelete(id); setSelectedEvent(null) }}
          onPlan={(ev) => { setSelectedEvent(null); setPlanningEvent(ev) }}
        />
      )}

      {showAdd && (
        <AddEventModal
          ministryId={ministryId}
          teamId={teamId}
          userId={userId}
          onClose={() => setShowAdd(false)}
          onSaved={(ev) => {
            setEvents((prev) => [...prev, ev].sort((a, b) => a.start_date.localeCompare(b.start_date)))
            setShowAdd(false)
          }}
        />
      )}

      {planningEvent && (
        <EventPlanWorkspace
          calendarEvent={planningEvent}
          ministryId={ministryId}
          userId={userId}
          canEdit={canEdit}
          onClose={() => setPlanningEvent(null)}
        />
      )}
    </div>
  )
}

// ── EventPlanWorkspace ────────────────────────────────────────────────────────

function EventPlanWorkspace({
  calendarEvent,
  ministryId,
  userId,
  canEdit,
  onClose,
}: {
  calendarEvent: CalendarEvent
  ministryId: string
  userId: string
  canEdit: boolean
  onClose: () => void
}) {
  const supabase = createClient()
  const cfg = CATEGORY_CONFIG[calendarEvent.category]

  // Core data state
  const [plan, setPlan] = useState<EventPlan | null>(null)
  const [tasks, setTasks] = useState<EventTask[]>([])
  const [roles, setRoles] = useState<EventRole[]>([])
  const [notes, setNotes] = useState<EventNote[]>([])
  const [members, setMembers] = useState<{ id: string; name: string }[]>([])
  const [loading, setLoading] = useState(true)
  const [activeSection, setActiveSection] = useState<'overview' | 'checklist' | 'roles' | 'notes'>('overview')

  // Overview edit state
  const [turnout, setTurnout] = useState("")
  const [budget, setBudget] = useState("")
  const [overviewNotes, setOverviewNotes] = useState("")
  const [savingOverview, setSavingOverview] = useState(false)

  // Task add state
  const [newTaskTitle, setNewTaskTitle] = useState("")
  const [newTaskAssignee, setNewTaskAssignee] = useState("")
  const [newTaskDue, setNewTaskDue] = useState("")
  const [addingTask, setAddingTask] = useState(false)

  // Role add state
  const [newRoleName, setNewRoleName] = useState("")
  const [newRoleAssignee, setNewRoleAssignee] = useState("")
  const [newRoleNotes, setNewRoleNotes] = useState("")
  const [addingRole, setAddingRole] = useState(false)

  // Role inline edit state
  const [editingRoleId, setEditingRoleId] = useState<string | null>(null)
  const [editRoleName, setEditRoleName] = useState("")
  const [editRoleAssignee, setEditRoleAssignee] = useState("")
  const [editRoleNotes, setEditRoleNotes] = useState("")

  // Note add state
  const [newNote, setNewNote] = useState("")
  const [addingNote, setAddingNote] = useState(false)

  const startDate = new Date(calendarEvent.start_date)
  const endDate = new Date(calendarEvent.end_date)
  const dateStr = calendarEvent.all_day
    ? startDate.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })
    : startDate.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" }) +
      " · " + startDate.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" }) +
      " – " + endDate.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })

  useEffect(() => {
    async function init() {
      setLoading(true)

      // Fetch or create event_plan
      let { data: planData } = await supabase
        .from("event_plans")
        .select("*")
        .eq("calendar_event_id", calendarEvent.id)
        .single()

      if (!planData) {
        const { data: newPlan } = await supabase
          .from("event_plans")
          .insert({ ministry_id: ministryId, calendar_event_id: calendarEvent.id, created_by: userId })
          .select("*")
          .single()
        planData = newPlan
      }

      if (!planData) { setLoading(false); return }

      setPlan(planData as EventPlan)
      setTurnout(planData.expected_turnout != null ? String(planData.expected_turnout) : "")
      setBudget(planData.budget_allocated != null ? String(planData.budget_allocated) : "")
      setOverviewNotes(planData.overview_notes ?? "")

      const planId = planData.id

      // Fetch tasks with assignee name
      const { data: tasksData } = await supabase
        .from("event_tasks")
        .select("*, profiles!event_tasks_assigned_to_fkey(name)")
        .eq("event_plan_id", planId)
        .order("created_at", { ascending: true })

      setTasks((tasksData ?? []).map((t: Record<string, unknown>) => ({
        id: t.id as string,
        event_plan_id: t.event_plan_id as string,
        title: t.title as string,
        assigned_to: t.assigned_to as string | null,
        assigned_name: (t.profiles as { name?: string } | null)?.name,
        due_date: t.due_date as string | null,
        completed: t.completed as boolean,
      })))

      // Fetch roles with assignee name
      const { data: rolesData } = await supabase
        .from("event_roles")
        .select("*, profiles!event_roles_assigned_to_fkey(name)")
        .eq("event_plan_id", planId)
        .order("created_at", { ascending: true })

      setRoles((rolesData ?? []).map((r: Record<string, unknown>) => ({
        id: r.id as string,
        event_plan_id: r.event_plan_id as string,
        role_name: r.role_name as string,
        assigned_to: r.assigned_to as string | null,
        assigned_name: (r.profiles as { name?: string } | null)?.name,
        notes: r.notes as string | null,
      })))

      // Fetch notes with created_by name
      const { data: notesData } = await supabase
        .from("event_notes")
        .select("*, profiles!event_notes_created_by_fkey(name)")
        .eq("event_plan_id", planId)
        .order("created_at", { ascending: false })

      setNotes((notesData ?? []).map((n: Record<string, unknown>) => ({
        id: n.id as string,
        event_plan_id: n.event_plan_id as string,
        content: n.content as string,
        created_by: n.created_by as string,
        created_by_name: (n.profiles as { name?: string } | null)?.name,
        created_at: n.created_at as string,
      })))

      // Fetch ministry members for dropdowns
      const { data: membersData } = await supabase
        .from("profiles")
        .select("id, name")
        .eq("ministry_id", ministryId)
        .order("name")

      setMembers(membersData ?? [])
      setLoading(false)
    }
    init()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [calendarEvent.id, ministryId, userId])

  async function handleSaveOverview() {
    if (!plan) return
    setSavingOverview(true)
    const updates = {
      expected_turnout: turnout !== "" ? parseInt(turnout, 10) : null,
      budget_allocated: budget !== "" ? parseFloat(budget) : null,
      overview_notes: overviewNotes || null,
    }
    const { data } = await supabase
      .from("event_plans")
      .update(updates)
      .eq("id", plan.id)
      .select("*")
      .single()
    if (data) setPlan(data as EventPlan)
    setSavingOverview(false)
  }

  async function handleToggleTask(task: EventTask) {
    const newCompleted = !task.completed
    setTasks((prev) => prev.map((t) => t.id === task.id ? { ...t, completed: newCompleted, } : t))
    await supabase
      .from("event_tasks")
      .update({ completed: newCompleted, completed_at: newCompleted ? new Date().toISOString() : null })
      .eq("id", task.id)
  }

  async function handleAddTask() {
    if (!plan || !newTaskTitle.trim()) return
    setAddingTask(true)
    const { data } = await supabase
      .from("event_tasks")
      .insert({
        event_plan_id: plan.id,
        title: newTaskTitle.trim(),
        assigned_to: newTaskAssignee || null,
        due_date: newTaskDue || null,
        completed: false,
        created_by: userId,
      })
      .select("*, profiles!event_tasks_assigned_to_fkey(name)")
      .single()
    if (data) {
      const d = data as Record<string, unknown>
      setTasks((prev) => [...prev, {
        id: d.id as string,
        event_plan_id: d.event_plan_id as string,
        title: d.title as string,
        assigned_to: d.assigned_to as string | null,
        assigned_name: (d.profiles as { name?: string } | null)?.name,
        due_date: d.due_date as string | null,
        completed: d.completed as boolean,
      }])
    }
    setNewTaskTitle("")
    setNewTaskAssignee("")
    setNewTaskDue("")
    setAddingTask(false)
  }

  async function handleDeleteTask(id: string) {
    setTasks((prev) => prev.filter((t) => t.id !== id))
    await supabase.from("event_tasks").delete().eq("id", id)
  }

  async function handleAddRole() {
    if (!plan || !newRoleName.trim()) return
    setAddingRole(true)
    const { data } = await supabase
      .from("event_roles")
      .insert({
        event_plan_id: plan.id,
        role_name: newRoleName.trim(),
        assigned_to: newRoleAssignee || null,
        notes: newRoleNotes || null,
        created_by: userId,
      })
      .select("*, profiles!event_roles_assigned_to_fkey(name)")
      .single()
    if (data) {
      const d = data as Record<string, unknown>
      setRoles((prev) => [...prev, {
        id: d.id as string,
        event_plan_id: d.event_plan_id as string,
        role_name: d.role_name as string,
        assigned_to: d.assigned_to as string | null,
        assigned_name: (d.profiles as { name?: string } | null)?.name,
        notes: d.notes as string | null,
      }])
    }
    setNewRoleName("")
    setNewRoleAssignee("")
    setNewRoleNotes("")
    setAddingRole(false)
  }

  async function handleDeleteRole(id: string) {
    setRoles((prev) => prev.filter((r) => r.id !== id))
    await supabase.from("event_roles").delete().eq("id", id)
  }

  async function handleSaveRoleEdit(roleId: string) {
    const memberName = members.find((m) => m.id === editRoleAssignee)?.name
    setRoles((prev) => prev.map((r) => r.id === roleId ? {
      ...r,
      role_name: editRoleName,
      assigned_to: editRoleAssignee || null,
      assigned_name: memberName,
      notes: editRoleNotes || null,
    } : r))
    await supabase.from("event_roles").update({
      role_name: editRoleName,
      assigned_to: editRoleAssignee || null,
      notes: editRoleNotes || null,
    }).eq("id", roleId)
    setEditingRoleId(null)
  }

  async function handleAddNote() {
    if (!plan || !newNote.trim()) return
    setAddingNote(true)
    const { data } = await supabase
      .from("event_notes")
      .insert({
        event_plan_id: plan.id,
        content: newNote.trim(),
        created_by: userId,
      })
      .select("*, profiles!event_notes_created_by_fkey(name)")
      .single()
    if (data) {
      const d = data as Record<string, unknown>
      setNotes((prev) => [{
        id: d.id as string,
        event_plan_id: d.event_plan_id as string,
        content: d.content as string,
        created_by: d.created_by as string,
        created_by_name: (d.profiles as { name?: string } | null)?.name,
        created_at: d.created_at as string,
      }, ...prev])
    }
    setNewNote("")
    setAddingNote(false)
  }

  const incompleteTasks = tasks.filter((t) => !t.completed)
  const completedTasks = tasks.filter((t) => t.completed)

  const sections: { key: 'overview' | 'checklist' | 'roles' | 'notes'; label: string }[] = [
    { key: 'overview', label: 'Overview' },
    { key: 'checklist', label: 'Checklist' },
    { key: 'roles', label: 'Roles & Leads' },
    { key: 'notes', label: 'Notes' },
  ]

  const inputStyle: React.CSSProperties = {
    background: "#FBF8F2",
    border: "1px solid #E5E0D2",
    borderRadius: 8,
    padding: "8px 12px",
    fontSize: 13,
    color: "#13101A",
    outline: "none",
    width: "100%",
    boxSizing: "border-box",
  }

  const selectStyle: React.CSSProperties = {
    background: "#FBF8F2",
    border: "1px solid #E5E0D2",
    borderRadius: 8,
    padding: "8px 12px",
    fontSize: 13,
    color: "#13101A",
    outline: "none",
    cursor: "pointer",
  }

  const cardStyle: React.CSSProperties = {
    background: "#FBF8F2",
    border: "1px solid #E5E0D2",
    borderRadius: 12,
    padding: "20px 24px",
    marginBottom: 16,
  }

  const sectionHeadingStyle: React.CSSProperties = {
    fontFamily: "var(--font-instrument-serif)",
    fontSize: 20,
    fontWeight: 400,
    color: "#13101A",
    margin: "0 0 16px",
  }

  const chipStyle: React.CSSProperties = {
    background: "#EFEAE0",
    color: "#5A5466",
    borderRadius: 999,
    padding: "2px 8px",
    fontSize: 12,
    whiteSpace: "nowrap" as const,
  }

  return (
    <div
      style={{ position: "fixed", top: 0, bottom: 0, left: 0, right: 0, zIndex: 75, background: "#FBF8F2", overflowY: "auto" }}
      className="md:left-[296px]"
    >
      {/* Header */}
      <div style={{ position: "sticky", top: 0, background: "#FBF8F2", borderBottom: "1px solid #E5E0D2", zIndex: 10, padding: "0 24px" }}>
        <div style={{ maxWidth: 720, margin: "0 auto" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12, paddingTop: 48, paddingBottom: 16 }}>
            <button
              onClick={onClose}
              style={{ background: "none", border: "none", cursor: "pointer", padding: "4px 8px 4px 0", display: "flex", alignItems: "center", gap: 6, color: "#5A5466", fontSize: 13 }}
            >
              ← Back
            </button>
            <div style={{ flex: 1 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 2 }}>
                <h1 style={{ fontFamily: "var(--font-instrument-serif)", fontSize: 28, fontWeight: 400, color: "#13101A", margin: 0 }}>
                  {calendarEvent.title}
                </h1>
                <span style={{ fontSize: 11, fontWeight: 500, color: cfg.text, background: cfg.bg, padding: "3px 10px", borderRadius: 9999, flexShrink: 0 }}>
                  {cfg.label}
                </span>
              </div>
              <p style={{ fontSize: 13, color: "#8A8497", margin: 0 }}>
                {dateStr}{calendarEvent.location ? ` · ${calendarEvent.location}` : ""}
              </p>
            </div>
          </div>

          {/* Section tabs */}
          <div style={{ display: "flex", gap: 4, paddingBottom: 12 }}>
            {sections.map((s) => (
              <button
                key={s.key}
                onClick={() => setActiveSection(s.key)}
                style={{
                  padding: "6px 14px",
                  borderRadius: 999,
                  border: "none",
                  cursor: "pointer",
                  fontSize: 13,
                  fontWeight: activeSection === s.key ? 500 : 400,
                  background: activeSection === s.key ? "#3E1540" : "transparent",
                  color: activeSection === s.key ? "#F6F4EF" : "#8A8497",
                  transition: "background 0.15s, color 0.15s",
                }}
              >
                {s.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Content */}
      <div style={{ maxWidth: 720, margin: "0 auto", padding: "24px 24px 80px" }}>
        {loading ? (
          <div style={{ textAlign: "center", padding: "48px 0", color: "#8A8497", fontSize: 13 }}>Loading…</div>
        ) : (
          <>
            {/* ── Overview ── */}
            {activeSection === 'overview' && (
              <div>
                {/* Event info block */}
                <div style={{ ...cardStyle, background: "#F4F0F8", border: "1px solid #DDD5E8" }}>
                  <p style={{ fontSize: 14, color: "#5A5466", margin: "0 0 4px" }}><strong style={{ color: "#13101A" }}>Date</strong> · {dateStr}</p>
                  {calendarEvent.location && (
                    <p style={{ fontSize: 14, color: "#5A5466", margin: "0 0 4px" }}><strong style={{ color: "#13101A" }}>Location</strong> · {calendarEvent.location}</p>
                  )}
                  {calendarEvent.description && (
                    <p style={{ fontSize: 14, color: "#5A5466", margin: "4px 0 0", lineHeight: 1.6 }}>{calendarEvent.description}</p>
                  )}
                </div>

                {/* Editable fields */}
                <div style={cardStyle}>
                  <p style={sectionHeadingStyle}>Planning Details</p>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 12 }}>
                    <div>
                      <label style={{ fontSize: 12, color: "#8A8497", display: "block", marginBottom: 4 }}>Expected turnout</label>
                      <input
                        type="number"
                        value={turnout}
                        onChange={(e) => setTurnout(e.target.value)}
                        placeholder="e.g. 80"
                        style={inputStyle}
                      />
                    </div>
                    <div>
                      <label style={{ fontSize: 12, color: "#8A8497", display: "block", marginBottom: 4 }}>Budget allocated ($)</label>
                      <input
                        type="number"
                        value={budget}
                        onChange={(e) => setBudget(e.target.value)}
                        placeholder="e.g. 500"
                        style={inputStyle}
                      />
                    </div>
                  </div>
                  <div style={{ marginBottom: 12 }}>
                    <label style={{ fontSize: 12, color: "#8A8497", display: "block", marginBottom: 4 }}>Overview notes</label>
                    <textarea
                      value={overviewNotes}
                      onChange={(e) => setOverviewNotes(e.target.value)}
                      placeholder="High-level notes about this event..."
                      rows={4}
                      style={{ ...inputStyle, resize: "vertical", lineHeight: 1.5 }}
                    />
                  </div>
                  {canEdit && (
                    <button
                      onClick={handleSaveOverview}
                      disabled={savingOverview}
                      style={{ padding: "8px 20px", borderRadius: 8, border: "none", background: "#3E1540", color: "#F6F4EF", fontSize: 13, fontWeight: 500, cursor: savingOverview ? "not-allowed" : "pointer", opacity: savingOverview ? 0.7 : 1 }}
                    >
                      {savingOverview ? "Saving…" : "Save"}
                    </button>
                  )}
                </div>
              </div>
            )}

            {/* ── Checklist ── */}
            {activeSection === 'checklist' && (
              <div style={cardStyle}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
                  <p style={sectionHeadingStyle}>Checklist</p>
                  <span style={{ fontSize: 12, color: "#8A8497" }}>{incompleteTasks.length} remaining</span>
                </div>

                {/* Add task form */}
                {canEdit && (
                  <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 20, padding: "16px", background: "#F4F0F8", borderRadius: 10 }}>
                    <input
                      value={newTaskTitle}
                      onChange={(e) => setNewTaskTitle(e.target.value)}
                      placeholder="New task..."
                      style={inputStyle}
                      onKeyDown={(e) => { if (e.key === "Enter") handleAddTask() }}
                    />
                    <div style={{ display: "flex", gap: 8 }}>
                      <select
                        value={newTaskAssignee}
                        onChange={(e) => setNewTaskAssignee(e.target.value)}
                        style={{ ...selectStyle, flex: 1 }}
                      >
                        <option value="">Unassigned</option>
                        {members.map((m) => (
                          <option key={m.id} value={m.id}>{m.name}</option>
                        ))}
                      </select>
                      <input
                        type="date"
                        value={newTaskDue}
                        onChange={(e) => setNewTaskDue(e.target.value)}
                        style={{ ...inputStyle, width: "auto" }}
                      />
                      <button
                        onClick={handleAddTask}
                        disabled={addingTask || !newTaskTitle.trim()}
                        style={{ padding: "8px 16px", borderRadius: 8, border: "none", background: "#3E1540", color: "#F6F4EF", fontSize: 13, fontWeight: 500, cursor: addingTask || !newTaskTitle.trim() ? "not-allowed" : "pointer", opacity: addingTask || !newTaskTitle.trim() ? 0.6 : 1, whiteSpace: "nowrap" }}
                      >
                        Add
                      </button>
                    </div>
                  </div>
                )}

                {/* Incomplete tasks */}
                {incompleteTasks.length === 0 && completedTasks.length === 0 && (
                  <p style={{ fontSize: 13, color: "#8A8497", textAlign: "center", padding: "16px 0" }}>No tasks yet.</p>
                )}
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {incompleteTasks.map((task) => (
                    <div key={task.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 12px", border: "1px solid #E5E0D2", borderRadius: 8 }}>
                      <input
                        type="checkbox"
                        checked={task.completed}
                        onChange={() => handleToggleTask(task)}
                        style={{ width: 16, height: 16, cursor: "pointer", accentColor: "#3E1540", flexShrink: 0 }}
                      />
                      <span style={{ flex: 1, fontSize: 14, color: "#13101A" }}>{task.title}</span>
                      {task.assigned_name && (
                        <span style={chipStyle}>{task.assigned_name}</span>
                      )}
                      {task.due_date && (
                        <span style={{ fontSize: 12, color: "#8A8497", whiteSpace: "nowrap" }}>
                          {new Date(task.due_date + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                        </span>
                      )}
                      {canEdit && (
                        <button
                          onClick={() => handleDeleteTask(task.id)}
                          style={{ background: "none", border: "none", cursor: "pointer", padding: 0, flexShrink: 0, color: "#C4C4C4" }}
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  ))}
                </div>

                {/* Completed tasks */}
                {completedTasks.length > 0 && (
                  <div style={{ marginTop: 20 }}>
                    <div style={{ borderTop: "1px solid #E5E0D2", paddingTop: 16, marginBottom: 8 }}>
                      <span style={{ fontSize: 11, color: "#8A8497", textTransform: "uppercase", letterSpacing: "0.05em", fontWeight: 500 }}>Completed</span>
                    </div>
                    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                      {completedTasks.map((task) => (
                        <div key={task.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 12px", border: "1px solid #E5E0D2", borderRadius: 8, opacity: 0.5 }}>
                          <input
                            type="checkbox"
                            checked={task.completed}
                            onChange={() => handleToggleTask(task)}
                            style={{ width: 16, height: 16, cursor: "pointer", accentColor: "#3E1540", flexShrink: 0 }}
                          />
                          <span style={{ flex: 1, fontSize: 14, color: "#13101A", textDecoration: "line-through" }}>{task.title}</span>
                          {task.assigned_name && (
                            <span style={chipStyle}>{task.assigned_name}</span>
                          )}
                          {task.due_date && (
                            <span style={{ fontSize: 12, color: "#8A8497", whiteSpace: "nowrap" }}>
                              {new Date(task.due_date + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                            </span>
                          )}
                          {canEdit && (
                            <button
                              onClick={() => handleDeleteTask(task.id)}
                              style={{ background: "none", border: "none", cursor: "pointer", padding: 0, flexShrink: 0, color: "#C4C4C4" }}
                            >
                              <X className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* ── Roles & Leads ── */}
            {activeSection === 'roles' && (
              <div style={cardStyle}>
                <p style={sectionHeadingStyle}>Roles & Leads</p>

                {roles.length === 0 && (
                  <p style={{ fontSize: 13, color: "#8A8497", textAlign: "center", padding: "16px 0" }}>No roles defined yet.</p>
                )}

                {/* Roles table */}
                <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 16 }}>
                  {roles.map((role) => (
                    <div key={role.id}>
                      {editingRoleId === role.id ? (
                        <div style={{ border: "1px solid #3E1540", borderRadius: 8, padding: "12px" }}>
                          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 8 }}>
                            <input
                              value={editRoleName}
                              onChange={(e) => setEditRoleName(e.target.value)}
                              placeholder="Role name"
                              style={inputStyle}
                            />
                            <select
                              value={editRoleAssignee}
                              onChange={(e) => setEditRoleAssignee(e.target.value)}
                              style={{ ...selectStyle, width: "100%" }}
                            >
                              <option value="">Unassigned</option>
                              {members.map((m) => (
                                <option key={m.id} value={m.id}>{m.name}</option>
                              ))}
                            </select>
                          </div>
                          <input
                            value={editRoleNotes}
                            onChange={(e) => setEditRoleNotes(e.target.value)}
                            placeholder="Notes (optional)"
                            style={{ ...inputStyle, marginBottom: 8 }}
                          />
                          <div style={{ display: "flex", gap: 8 }}>
                            <button
                              onClick={() => handleSaveRoleEdit(role.id)}
                              style={{ padding: "6px 14px", borderRadius: 8, border: "none", background: "#3E1540", color: "#F6F4EF", fontSize: 12, fontWeight: 500, cursor: "pointer" }}
                            >
                              Save
                            </button>
                            <button
                              onClick={() => setEditingRoleId(null)}
                              style={{ padding: "6px 14px", borderRadius: 8, border: "1px solid #E5E0D2", background: "none", fontSize: 12, color: "#5A5466", cursor: "pointer" }}
                            >
                              Cancel
                            </button>
                          </div>
                        </div>
                      ) : (
                        <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 12px", border: "1px solid #E5E0D2", borderRadius: 8 }}>
                          <div style={{ flex: 1 }}>
                            <span style={{ fontSize: 14, fontWeight: 500, color: "#13101A" }}>{role.role_name}</span>
                            {role.notes && (
                              <p style={{ fontSize: 12, color: "#8A8497", margin: "2px 0 0" }}>{role.notes}</p>
                            )}
                          </div>
                          {role.assigned_name ? (
                            <span style={chipStyle}>{role.assigned_name}</span>
                          ) : (
                            <span style={{ ...chipStyle, color: "#C4C4C4" }}>Unassigned</span>
                          )}
                          {canEdit && (
                            <div style={{ display: "flex", gap: 6 }}>
                              <button
                                onClick={() => {
                                  setEditingRoleId(role.id)
                                  setEditRoleName(role.role_name)
                                  setEditRoleAssignee(role.assigned_to ?? "")
                                  setEditRoleNotes(role.notes ?? "")
                                }}
                                style={{ background: "none", border: "none", cursor: "pointer", padding: 0, color: "#8A8497" }}
                              >
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                  <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                                  <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                                </svg>
                              </button>
                              <button
                                onClick={() => handleDeleteRole(role.id)}
                                style={{ background: "none", border: "none", cursor: "pointer", padding: 0, color: "#C4C4C4" }}
                              >
                                <X className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  ))}
                </div>

                {/* Add role form */}
                {canEdit && (
                  <div style={{ borderTop: "1px solid #E5E0D2", paddingTop: 16 }}>
                    <p style={{ fontSize: 12, color: "#8A8497", margin: "0 0 8px" }}>Add a role</p>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 8 }}>
                      <input
                        value={newRoleName}
                        onChange={(e) => setNewRoleName(e.target.value)}
                        placeholder="Role name"
                        style={inputStyle}
                      />
                      <select
                        value={newRoleAssignee}
                        onChange={(e) => setNewRoleAssignee(e.target.value)}
                        style={{ ...selectStyle, width: "100%" }}
                      >
                        <option value="">Unassigned</option>
                        {members.map((m) => (
                          <option key={m.id} value={m.id}>{m.name}</option>
                        ))}
                      </select>
                    </div>
                    <div style={{ display: "flex", gap: 8 }}>
                      <input
                        value={newRoleNotes}
                        onChange={(e) => setNewRoleNotes(e.target.value)}
                        placeholder="Notes (optional)"
                        style={{ ...inputStyle, flex: 1 }}
                      />
                      <button
                        onClick={handleAddRole}
                        disabled={addingRole || !newRoleName.trim()}
                        style={{ padding: "8px 16px", borderRadius: 8, border: "none", background: "#3E1540", color: "#F6F4EF", fontSize: 13, fontWeight: 500, cursor: addingRole || !newRoleName.trim() ? "not-allowed" : "pointer", opacity: addingRole || !newRoleName.trim() ? 0.6 : 1, whiteSpace: "nowrap" }}
                      >
                        Add
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* ── Transition Notes ── */}
            {activeSection === 'notes' && (
              <div style={cardStyle}>
                <div style={{ marginBottom: 16 }}>
                  <p style={sectionHeadingStyle}>Transition Notes</p>
                  <p style={{ fontSize: 13, color: "#8A8497", margin: "-8px 0 0" }}>Institutional memory — never deleted</p>
                </div>

                {/* Add note form */}
                {canEdit && (
                  <div style={{ marginBottom: 20, padding: "16px", background: "#F4F0F8", borderRadius: 10 }}>
                    <textarea
                      value={newNote}
                      onChange={(e) => setNewNote(e.target.value)}
                      placeholder="Write a note for future leaders..."
                      rows={3}
                      style={{ ...inputStyle, resize: "vertical", lineHeight: 1.5, marginBottom: 8 }}
                    />
                    <button
                      onClick={handleAddNote}
                      disabled={addingNote || !newNote.trim()}
                      style={{ padding: "7px 16px", borderRadius: 8, border: "none", background: "#3E1540", color: "#F6F4EF", fontSize: 13, fontWeight: 500, cursor: addingNote || !newNote.trim() ? "not-allowed" : "pointer", opacity: addingNote || !newNote.trim() ? 0.6 : 1 }}
                    >
                      {addingNote ? "Adding…" : "Add note"}
                    </button>
                  </div>
                )}

                {notes.length === 0 && (
                  <p style={{ fontSize: 13, color: "#8A8497", textAlign: "center", padding: "16px 0" }}>No notes yet. Add institutional knowledge for future leaders.</p>
                )}

                <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                  {notes.map((note) => (
                    <div key={note.id} style={{ borderBottom: "1px solid #E5E0D2", paddingBottom: 16 }}>
                      <p style={{ fontSize: 14, color: "#5A5466", lineHeight: 1.6, margin: "0 0 8px", whiteSpace: "pre-wrap" }}>{note.content}</p>
                      <p style={{ fontSize: 12, color: "#8A8497", margin: 0 }}>
                        {note.created_by_name ?? "Someone"} · {new Date(note.created_at).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}

// ── CreateTeamOverlay ─────────────────────────────────────────────────────────

type CreateStep = "preset" | "customize" | "members"

function CreateTeamOverlay({ userId, ministryId, onClose, onCreated }: {
  userId: string
  ministryId: string
  onClose: () => void
  onCreated: (teamId: string) => void
}) {
  const supabase = createClient()
  const [step, setStep] = useState<CreateStep>("preset")
  const [teamName, setTeamName] = useState("")
  const [teamIcon, setTeamIcon] = useState("👥")
  const [teamDesc, setTeamDesc] = useState("")
  const [roles, setRoles] = useState<DraftRole[]>([{ name: "Member", permissions: [] }])
  const [editingRoleIdx, setEditingRoleIdx] = useState<number | null>(null)
  const [ministryMembers, setMinistryMembers] = useState<{ id: string; name: string }[]>([])
  const [memberSearch, setMemberSearch] = useState("")
  const [selectedMembers, setSelectedMembers] = useState<{ userId: string; roleIdx: number }[]>([])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (step !== "members") return
    supabase
      .from("profiles")
      .select("id, name")
      .eq("ministry_id", ministryId)
      .neq("id", userId)
      .order("name")
      .then(({ data }) => setMinistryMembers(data ?? []))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step])

  function applyPreset(preset: typeof TEAM_PRESETS[0]) {
    setTeamName(preset.name)
    setTeamIcon(preset.icon)
    setTeamDesc(preset.description)
    setRoles(preset.roles.map((r) => ({ name: r.name, permissions: [...r.permissions] })))
    setStep("customize")
  }

  function addRole() {
    const next = [...roles, { name: "", permissions: [] }]
    setRoles(next)
    setEditingRoleIdx(next.length - 1)
  }

  function updateRoleName(idx: number, name: string) {
    setRoles((prev) => prev.map((r, i) => (i === idx ? { ...r, name } : r)))
  }

  function toggleRolePermission(idx: number, perm: string) {
    setRoles((prev) =>
      prev.map((r, i) =>
        i === idx
          ? { ...r, permissions: r.permissions.includes(perm) ? r.permissions.filter((p) => p !== perm) : [...r.permissions, perm] }
          : r
      )
    )
  }

  function removeRole(idx: number) {
    setRoles((prev) => prev.filter((_, i) => i !== idx))
    setSelectedMembers((prev) =>
      prev.filter((m) => m.roleIdx !== idx).map((m) => ({ ...m, roleIdx: m.roleIdx > idx ? m.roleIdx - 1 : m.roleIdx }))
    )
    if (editingRoleIdx === idx) setEditingRoleIdx(null)
  }

  function toggleMemberSelection(memberId: string) {
    setSelectedMembers((prev) => {
      const exists = prev.find((m) => m.userId === memberId)
      return exists ? prev.filter((m) => m.userId !== memberId) : [...prev, { userId: memberId, roleIdx: 0 }]
    })
  }

  function updateMemberRole(memberId: string, roleIdx: number) {
    setSelectedMembers((prev) => prev.map((m) => (m.userId === memberId ? { ...m, roleIdx } : m)))
  }

  async function handleSave() {
    if (!teamName.trim()) { setError("Team name is required."); return }
    if (roles.some((r) => !r.name.trim())) { setError("All roles need a name."); return }
    setSaving(true)
    setError(null)

    const { data: team, error: teamErr } = await supabase
      .from("teams")
      .insert({ name: teamName.trim(), icon: teamIcon, description: teamDesc.trim() || null, ministry_id: ministryId, created_by: userId })
      .select("id")
      .single()

    if (teamErr || !team) { setError(teamErr?.message ?? "Failed to create team."); setSaving(false); return }

    const { data: createdRoles, error: rolesErr } = await supabase
      .from("team_roles")
      .insert(roles.map((r) => ({ team_id: team.id, name: r.name.trim(), permissions: r.permissions })))
      .select("id")

    if (rolesErr || !createdRoles) { setError(rolesErr?.message ?? "Failed to create roles."); setSaving(false); return }

    // Build members list — always include creator, then any additionally selected members
    const creatorAlreadySelected = selectedMembers.some((m) => m.userId === userId)
    const allMembers = creatorAlreadySelected
      ? selectedMembers
      : [{ userId, roleIdx: 0 }, ...selectedMembers]

    const { error: membersErr } = await supabase.from("team_members").insert(
      allMembers.map((m) => ({
        team_id: team.id,
        user_id: m.userId,
        role_id: createdRoles[m.roleIdx]?.id ?? createdRoles[0].id,
        added_by: userId,
      }))
    )
    if (membersErr) { setError(membersErr.message); setSaving(false); return }

    onCreated(team.id)
  }

  const filteredMembers = ministryMembers.filter((m) =>
    m.name.toLowerCase().includes(memberSearch.toLowerCase())
  )

  const canAdvance = teamName.trim() !== "" && roles.every((r) => r.name.trim() !== "")

  return (
    <div className="fixed inset-0 z-[70] bg-[#FBF8F2] max-w-[390px] mx-auto flex flex-col md:left-[296px] md:max-w-none">
      {/* Header */}
      <div className="flex items-center justify-between px-5 pt-12 pb-4 md:pt-5 border-b border-[#ECE8DE] bg-[#FBF8F2]">
        <button
          onClick={step === "preset" ? onClose : () => setStep(step === "members" ? "customize" : "preset")}
          className="flex items-center gap-1.5 text-[13px] text-[#8A8497] hover:text-[#3E1540] transition-colors"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          {step === "preset" ? "Cancel" : "Back"}
        </button>
        <span className="text-[14px] font-semibold text-[#13101A]">
          {step === "preset" ? "New Team" : step === "customize" ? "Customize" : "Add Members"}
        </span>
        <div className="w-14 flex justify-end">
          {step === "customize" && (
            <button
              onClick={() => setStep("members")}
              disabled={!canAdvance}
              className="text-[13px] font-semibold text-[#3E1540] disabled:opacity-30"
            >
              Next
            </button>
          )}
          {step === "members" && (
            <button onClick={handleSave} disabled={saving} className="text-[13px] font-semibold text-[#3E1540] disabled:opacity-30">
              {saving ? "Saving…" : "Create"}
            </button>
          )}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-5 py-5">
        {error && (
          <div className="rounded-xl bg-[#3E1540]/8 px-4 py-3 text-[13px] text-[#3E1540] font-medium mb-4">{error}</div>
        )}

        {/* Step 1: Preset picker */}
        {step === "preset" && (
          <div className="flex flex-col gap-3">
            <p className="text-[13px] text-[#8A8497] mb-1">Start with a preset or build from scratch.</p>
            {TEAM_PRESETS.map((preset) => (
              <button
                key={preset.id}
                onClick={() => applyPreset(preset)}
                className="w-full bg-white rounded-2xl border border-[#ECE8DE] p-4 text-left hover:border-[#3E1540]/30 hover:bg-[#FDFBF7] transition-all shadow-[0_1px_4px_rgba(19,16,26,0.06)]"
              >
                <div className="flex items-center gap-3 mb-2">
                  <span className="text-[22px]">{preset.icon}</span>
                  <p className="text-[14px] font-bold text-[#13101A]">{preset.name}</p>
                </div>
                <p className="text-[12px] text-[#8A8497] mb-3">{preset.description}</p>
                <div className="flex flex-wrap gap-1.5">
                  {preset.roles.map((r) => (
                    <span key={r.name} className="text-[11px] bg-[#FBF8F2] border border-[#ECE8DE] text-[#5A5466] px-2 py-0.5 rounded-full">
                      {r.name}
                    </span>
                  ))}
                </div>
              </button>
            ))}
            <button
              onClick={() => { setTeamName(""); setTeamIcon("👥"); setTeamDesc(""); setRoles([{ name: "Member", permissions: [] }]); setStep("customize") }}
              className="w-full bg-white rounded-2xl border border-dashed border-[#ECE8DE] p-4 text-center hover:border-[#3E1540]/30 hover:bg-[#FDFBF7] transition-all"
            >
              <p className="text-[14px] font-semibold text-[#5A5466]">Start from scratch</p>
              <p className="text-[12px] text-[#8A8497] mt-0.5">Build custom roles and permissions</p>
            </button>
          </div>
        )}

        {/* Step 2: Customize */}
        {step === "customize" && (
          <div className="flex flex-col gap-5">
            <div className="flex gap-3">
              <div className="flex flex-col gap-1.5">
                <label className="text-[12px] font-medium text-[#5A5466]">Icon</label>
                <input
                  type="text"
                  value={teamIcon}
                  onChange={(e) => setTeamIcon(e.target.value.slice(-2) || "👥")}
                  className="w-14 h-12 text-center text-[20px] rounded-xl border border-[#ECE8DE] bg-[#FBF8F2] focus:outline-none focus:ring-2 focus:ring-[#3E1540]/20"
                />
              </div>
              <div className="flex-1 flex flex-col gap-1.5">
                <label className="text-[12px] font-medium text-[#5A5466]">Team name</label>
                <input
                  type="text"
                  value={teamName}
                  onChange={(e) => setTeamName(e.target.value)}
                  placeholder="e.g. Praise Team"
                  className="w-full h-12 px-4 rounded-xl border border-[#ECE8DE] bg-[#FBF8F2] text-[14px] text-[#13101A] placeholder:text-[#C4C4C4] focus:outline-none focus:ring-2 focus:ring-[#3E1540]/20"
                />
              </div>
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-[12px] font-medium text-[#5A5466]">Description (optional)</label>
              <input
                type="text"
                value={teamDesc}
                onChange={(e) => setTeamDesc(e.target.value)}
                placeholder="What does this team do?"
                className="w-full px-4 py-3 rounded-xl border border-[#ECE8DE] bg-[#FBF8F2] text-[14px] text-[#13101A] placeholder:text-[#C4C4C4] focus:outline-none focus:ring-2 focus:ring-[#3E1540]/20"
              />
            </div>

            <div>
              <div className="flex items-center justify-between mb-3">
                <label className="text-[12px] font-medium text-[#5A5466]">Roles</label>
                <button onClick={addRole} className="text-[12px] font-semibold text-[#3E1540] hover:opacity-70 transition-opacity">
                  + Add role
                </button>
              </div>
              <div className="flex flex-col gap-2">
                {roles.map((role, idx) => (
                  <div key={idx} className="bg-white rounded-2xl border border-[#ECE8DE] overflow-hidden">
                    <div
                      className="flex items-center gap-3 px-4 py-3 cursor-pointer"
                      onClick={() => setEditingRoleIdx(editingRoleIdx === idx ? null : idx)}
                    >
                      <input
                        type="text"
                        value={role.name}
                        onChange={(e) => { e.stopPropagation(); updateRoleName(idx, e.target.value) }}
                        onClick={(e) => e.stopPropagation()}
                        placeholder="Role name"
                        className="flex-1 text-[14px] font-semibold text-[#13101A] bg-transparent focus:outline-none placeholder:text-[#C4C4C4] placeholder:font-normal"
                      />
                      <div className="flex items-center gap-2 flex-shrink-0">
                        <span className="text-[11px] text-[#8A8497]">{role.permissions.length} perms</span>
                        <ChevronDown className={`w-3.5 h-3.5 text-[#C4C4C4] transition-transform ${editingRoleIdx === idx ? "rotate-180" : ""}`} />
                        {roles.length > 1 && (
                          <button onClick={(e) => { e.stopPropagation(); removeRole(idx) }}>
                            <X className="w-3.5 h-3.5 text-[#C4C4C4] hover:text-[#3E1540] transition-colors" />
                          </button>
                        )}
                      </div>
                    </div>
                    {editingRoleIdx === idx && (
                      <div className="border-t border-[#ECE8DE] px-4 py-3">
                        <div className="flex flex-wrap gap-2">
                          {ALL_PERMISSIONS.map((perm) => {
                            const active = role.permissions.includes(perm)
                            return (
                              <button
                                key={perm}
                                onClick={() => toggleRolePermission(idx, perm)}
                                className={`text-[11px] font-medium px-2.5 py-1 rounded-full border transition-all ${
                                  active
                                    ? "bg-[#3E1540] border-[#3E1540] text-[#F6F4EF]"
                                    : "bg-[#FBF8F2] border-[#ECE8DE] text-[#5A5466] hover:border-[#3E1540]/30"
                                }`}
                              >
                                {PERMISSION_LABELS[perm]}
                              </button>
                            )
                          })}
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Step 3: Members */}
        {step === "members" && (
          <div className="flex flex-col gap-4">
            <p className="text-[13px] text-[#8A8497]">Add members now, or share the invite code later.</p>
            <div className="relative">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-[#C4C4C4]" />
              <input
                type="text"
                value={memberSearch}
                onChange={(e) => setMemberSearch(e.target.value)}
                placeholder="Search members…"
                className="w-full pl-10 pr-4 py-3 rounded-xl bg-[#FBF8F2] border border-[#ECE8DE] text-[13px] placeholder:text-[#C4C4C4] focus:outline-none focus:ring-2 focus:ring-[#3E1540]/20"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              {filteredMembers.length === 0 && (
                <p className="text-[13px] text-[#8A8497] text-center py-6">No members found.</p>
              )}
              {filteredMembers.map((member) => {
                const sel = selectedMembers.find((m) => m.userId === member.id)
                return (
                  <div key={member.id} className="flex items-center gap-3 bg-white rounded-xl border border-[#ECE8DE] p-3">
                    <button
                      onClick={() => toggleMemberSelection(member.id)}
                      className={`w-5 h-5 rounded-md border-2 flex items-center justify-center flex-shrink-0 transition-colors ${
                        sel ? "bg-[#3E1540] border-[#3E1540]" : "border-[#C4C4C4]"
                      }`}
                    >
                      {sel && <Check className="w-3 h-3 text-white" />}
                    </button>
                    <span className="flex-1 text-[14px] font-medium text-[#13101A]">{member.name}</span>
                    {sel && roles.length > 1 && (
                      <select
                        value={sel.roleIdx}
                        onChange={(e) => updateMemberRole(member.id, Number(e.target.value))}
                        className="text-[12px] text-[#5A5466] bg-[#FBF8F2] border border-[#ECE8DE] rounded-lg px-2 py-1 focus:outline-none"
                      >
                        {roles.map((r, i) => (
                          <option key={i} value={i}>{r.name || `Role ${i + 1}`}</option>
                        ))}
                      </select>
                    )}
                    {sel && roles.length === 1 && (
                      <span className="text-[12px] text-[#8A8497]">{roles[0].name}</span>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

// ── TeamDetailOverlay ─────────────────────────────────────────────────────────

function TeamDetailOverlay({ team, userId, ministryId, isAdmin, onClose, onChanged }: {
  team: Team
  userId: string
  ministryId: string
  isAdmin: boolean
  onClose: () => void
  onChanged: () => void
}) {
  const supabase = createClient()
  const [roles, setRoles] = useState<TeamRole[]>([])
  const [members, setMembers] = useState<TeamMemberDisplay[]>([])
  const [loading, setLoading] = useState(true)
  const [showAddMember, setShowAddMember] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [ministryMembers, setMinistryMembers] = useState<{ id: string; name: string }[]>([])
  const [addSearch, setAddSearch] = useState("")
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [selectedRoleId, setSelectedRoleId] = useState<string>("")
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    async function load() {
      const [{ data: rolesData }, { data: membersData }] = await Promise.all([
        supabase.from("team_roles").select("id, team_id, name, permissions").eq("team_id", team.id),
        supabase
          .from("team_members")
          .select("user_id, role_id, joined_at, profiles!user_id(name), team_roles(name)")
          .eq("team_id", team.id),
      ])
      type RawMember = {
        user_id: string
        role_id: string
        joined_at: string
        profiles: { name: string } | { name: string }[] | null
        team_roles: { name: string } | { name: string }[] | null
      }
      setRoles((rolesData ?? []).map((r) => ({ ...r, permissions: Array.isArray(r.permissions) ? r.permissions : [] })))
      setMembers(
        (membersData ?? []).map((m: RawMember) => {
          const p = Array.isArray(m.profiles) ? m.profiles[0] : m.profiles
          const r = Array.isArray(m.team_roles) ? m.team_roles[0] : m.team_roles
          return { user_id: m.user_id, name: p?.name ?? "Unknown", role_id: m.role_id, role_name: r?.name ?? "Member", joined_at: m.joined_at }
        })
      )
      setLoading(false)
    }
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [team.id])

  useEffect(() => {
    if (!showAddMember) return
    setSelectedIds(new Set())
    setSelectedRoleId(roles[0]?.id ?? "")
    const memberIds = new Set([...members.map((m) => m.user_id)])
    supabase
      .from("profiles")
      .select("id, name")
      .eq("ministry_id", ministryId)
      .order("name")
      .then(({ data }) => setMinistryMembers((data ?? []).filter((m) => !memberIds.has(m.id))))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showAddMember, members.length])

  async function handleDeleteTeam() {
    await supabase.from("teams").delete().eq("id", team.id)
    onChanged()
    onClose()
  }

  async function handleAddMembers() {
    if (selectedIds.size === 0) return
    if (!selectedRoleId) { setError("This team has no roles. Delete the team and recreate it."); return }
    setSaving(true)
    setError(null)
    const { error: err } = await supabase.from("team_members").insert(
      Array.from(selectedIds).map((uid) => ({ team_id: team.id, user_id: uid, role_id: selectedRoleId, added_by: userId }))
    )
    if (err) { setError(err.message); setSaving(false); return }
    setShowAddMember(false)
    setSelectedIds(new Set())
    setAddSearch("")
    setSaving(false)
    onChanged()
  }

  async function handleRemoveMember(memberId: string) {
    await supabase.from("team_members").delete().eq("team_id", team.id).eq("user_id", memberId)
    setMembers((prev) => prev.filter((m) => m.user_id !== memberId))
    onChanged()
  }

  const filteredAdd = ministryMembers.filter((m) =>
    m.name.toLowerCase().includes(addSearch.toLowerCase())
  )

  return (
    <div className="fixed inset-0 z-[70] bg-[#FBF8F2] max-w-[390px] mx-auto flex flex-col md:left-[296px] md:max-w-none">
      <div className="flex items-center justify-between px-5 pt-12 pb-4 md:pt-5 border-b border-[#ECE8DE] bg-[#FBF8F2]">
        <button
          onClick={showAddMember ? () => { setShowAddMember(false); setError(null) } : onClose}
          className="flex items-center gap-1.5 text-[13px] text-[#8A8497] hover:text-[#3E1540] transition-colors"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          {showAddMember ? "Back" : "Teams"}
        </button>
        <div className="flex items-center gap-2">
          {!showAddMember && <span className="text-[18px]">{team.icon ?? "👥"}</span>}
          <span className="text-[14px] font-semibold text-[#13101A]">
            {showAddMember ? "Add Member" : team.name}
          </span>
        </div>
        <div className="w-14 flex justify-end">
          {!showAddMember && isAdmin && (
            <button onClick={() => setConfirmDelete(true)} className="text-[#8A8497] hover:text-red-500 transition-colors">
              <Trash2 className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      {confirmDelete && (
        <div className="mx-5 mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 flex items-center justify-between gap-3">
          <span className="text-[13px] text-red-700 font-medium">Delete this team?</span>
          <div className="flex gap-2">
            <button onClick={() => setConfirmDelete(false)} className="text-[12px] font-semibold text-[#8A8497] hover:text-[#13101A]">Cancel</button>
            <button onClick={handleDeleteTeam} className="text-[12px] font-semibold text-red-600 hover:text-red-800">Delete</button>
          </div>
        </div>
      )}

      <div className="flex-1 overflow-y-auto px-5 py-5">
        {error && (
          <div className="rounded-xl bg-[#3E1540]/8 px-4 py-3 text-[13px] text-[#3E1540] font-medium mb-4">{error}</div>
        )}

        {!showAddMember && (
          <>
            {loading ? <Spinner /> : (
              <div className="flex flex-col gap-6">
                {/* Roles */}
                <div>
                  <PlanSectionHeader>Roles</PlanSectionHeader>
                  <div className="flex flex-col gap-2">
                    {roles.length === 0 && (
                      <p className="text-[13px] text-[#8A8497] text-center py-4">No roles defined.</p>
                    )}
                    {roles.map((role) => (
                      <div key={role.id} className="bg-white rounded-2xl border border-[#ECE8DE] p-4">
                        <p className="text-[14px] font-semibold text-[#13101A] mb-2">{role.name}</p>
                        {role.permissions.length > 0 ? (
                          <div className="flex flex-wrap gap-1.5">
                            {role.permissions.map((p) => (
                              <span key={p} className="text-[11px] bg-[#FBF8F2] border border-[#ECE8DE] text-[#5A5466] px-2 py-0.5 rounded-full">
                                {PERMISSION_LABELS[p] ?? p}
                              </span>
                            ))}
                          </div>
                        ) : (
                          <p className="text-[12px] text-[#8A8497]">No permissions assigned</p>
                        )}
                      </div>
                    ))}
                  </div>
                </div>

                {/* Members */}
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-3 flex-1 mr-3">
                      <span style={{ fontFamily: "var(--font-instrument-serif)", fontSize: "22px", fontWeight: 400, color: "#13101A", letterSpacing: "-0.01em" }}>
                        Members
                      </span>
                      <div className="flex-1 h-px bg-[#ECE8DE]" />
                    </div>
                    <button
                      onClick={() => setShowAddMember(true)}
                      className="text-[12px] font-semibold text-[#3E1540] hover:opacity-70 flex-shrink-0"
                    >
                      + Add
                    </button>
                  </div>
                  <div className="flex flex-col gap-1.5">
                    {members.length === 0 && (
                      <p className="text-[13px] text-[#8A8497] text-center py-4">No one&apos;s here yet.</p>
                    )}
                    {members.map((m) => (
                      <div key={m.user_id} className="flex items-center gap-3 bg-white rounded-xl border border-[#ECE8DE] p-3">
                        <div className={`w-8 h-8 rounded-xl flex items-center justify-center text-[12px] font-bold text-[#F6F4EF] flex-shrink-0 ${getAvatarColor(m.name)}`}>
                          {getInitials(m.name)}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-[14px] font-medium text-[#13101A] truncate">{m.name}</p>
                          <p className="text-[12px] text-[#8A8497]">{m.role_name}</p>
                        </div>
                        {isAdmin && m.user_id !== userId && (
                          <button onClick={() => handleRemoveMember(m.user_id)} className="text-[#C4C4C4] hover:text-[#3E1540] transition-colors">
                            <X className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </>
        )}

        {showAddMember && (
          <div className="flex flex-col gap-4 pb-24">
            {/* Role picker — single role applies to all selected */}
            {roles.length > 1 && (
              <div className="flex flex-col gap-2">
                <label className="text-[12px] font-medium text-[#5A5466]">Assign role</label>
                <div className="flex gap-2 flex-wrap">
                  {roles.map((r) => (
                    <button
                      key={r.id}
                      onClick={() => setSelectedRoleId(r.id)}
                      className={`text-[12px] font-semibold px-3 py-1.5 rounded-xl border transition-all ${
                        selectedRoleId === r.id
                          ? "bg-[#3E1540] border-[#3E1540] text-[#F6F4EF]"
                          : "bg-white border-[#ECE8DE] text-[#5A5466] hover:border-[#3E1540]/30"
                      }`}
                    >
                      {r.name}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Selected chips */}
            {selectedIds.size > 0 && (
              <div className="flex flex-wrap gap-2">
                {ministryMembers.filter((m) => selectedIds.has(m.id)).map((m) => (
                  <button
                    key={m.id}
                    onClick={() => setSelectedIds((prev) => { const next = new Set(prev); next.delete(m.id); return next })}
                    className="flex items-center gap-1.5 bg-[#3E1540] text-white px-3 py-1.5 rounded-full text-[12px] font-semibold hover:bg-[#2D0F2E] transition-colors"
                  >
                    {m.name.split(" ")[0]}
                    <X className="w-3 h-3 opacity-70" />
                  </button>
                ))}
              </div>
            )}

            {/* Search */}
            <div className="relative">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-[#C4C4C4]" />
              <input
                type="text"
                value={addSearch}
                onChange={(e) => setAddSearch(e.target.value)}
                placeholder="Search members…"
                className="w-full pl-10 pr-4 py-3 rounded-xl bg-[#FBF8F2] border border-[#ECE8DE] text-[13px] placeholder:text-[#C4C4C4] focus:outline-none focus:ring-2 focus:ring-[#3E1540]/20"
              />
            </div>

            {/* Member list */}
            <div className="flex flex-col gap-1.5">
              {filteredAdd.length === 0 && (
                <p className="text-[13px] text-[#8A8497] text-center py-6">No members to add.</p>
              )}
              {filteredAdd.map((member) => {
                const selected = selectedIds.has(member.id)
                return (
                  <button
                    key={member.id}
                    onClick={() => setSelectedIds((prev) => {
                      const next = new Set(prev)
                      if (next.has(member.id)) next.delete(member.id)
                      else next.add(member.id)
                      return next
                    })}
                    className={`flex items-center gap-3 rounded-xl border p-3 text-left transition-all ${
                      selected ? "bg-[#3E1540]/5 border-[#3E1540]/30" : "bg-white border-[#ECE8DE] hover:bg-[#FDFBF7]"
                    }`}
                  >
                    <div className={`w-8 h-8 rounded-xl flex items-center justify-center text-[12px] font-bold text-[#F6F4EF] flex-shrink-0 ${getAvatarColor(member.name)}`}>
                      {getInitials(member.name)}
                    </div>
                    <span className="flex-1 text-[14px] font-medium text-[#13101A]">{member.name}</span>
                    {selected && <Check className="w-4 h-4 text-[#3E1540]" />}
                  </button>
                )
              })}
            </div>
          </div>
        )}
      </div>

      {/* Sticky add button */}
      {showAddMember && selectedIds.size > 0 && (
        <div className="flex-shrink-0 px-5 pb-8 pt-3 bg-[#FBF8F2] border-t border-[#ECE8DE]">
          <button
            onClick={handleAddMembers}
            disabled={saving}
            className="w-full py-3.5 rounded-2xl bg-[#3E1540] text-[#F6F4EF] text-[15px] font-semibold hover:bg-[#2D0F2E] transition-colors disabled:opacity-50"
          >
            {saving ? "Adding…" : `Add ${selectedIds.size} ${selectedIds.size === 1 ? "member" : "members"}`}
          </button>
        </div>
      )}
    </div>
  )
}

// ─── Command Palette ─────────────────────────────────────────────────────────

type PaletteItemType = "nav" | "person" | "chat" | "announcement"

interface PaletteItem {
  type: PaletteItemType
  id: string
  label: string
  sublabel?: string
  tab?: Tab
}

const NAV_ITEMS: PaletteItem[] = [
  { type: "nav", id: "home",          label: "Home",          tab: "home" },
  { type: "nav", id: "announcements", label: "Announcements", tab: "announcements" },
  { type: "nav", id: "chats",         label: "Chats",         tab: "chats" },
  { type: "nav", id: "directory",     label: "Directory",     tab: "directory" },
  { type: "nav", id: "plan",          label: "Plan",          tab: "plan" },
  { type: "nav", id: "profile",       label: "Profile",       tab: "profile" },
]

interface CommandPaletteProps {
  open: boolean
  onClose: () => void
  ministryId: string
  onTabChange: (tab: Tab) => void
  onOpenChat: (id: string, name: string) => void
}

function CommandPalette({ open, onClose, ministryId, onTabChange, onOpenChat }: CommandPaletteProps) {
  const supabase = createClient()
  const [query, setQuery] = useState("")
  const [results, setResults] = useState<PaletteItem[]>(NAV_ITEMS)
  const [selectedIdx, setSelectedIdx] = useState(0)
  const [loading, setLoading] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (open) {
      setQuery("")
      setResults(NAV_ITEMS)
      setSelectedIdx(0)
      setTimeout(() => inputRef.current?.focus(), 50)
    }
  }, [open])

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    if (!query.trim()) {
      setResults(NAV_ITEMS)
      setSelectedIdx(0)
      return
    }
    debounceRef.current = setTimeout(async () => {
      setLoading(true)
      const q = query.toLowerCase()
      const [profilesRes, groupsRes, announcementsRes] = await Promise.all([
        supabase.from("profiles").select("id, name, email, role").eq("ministry_id", ministryId).ilike("name", `%${q}%`).limit(5),
        supabase.from("groups").select("id, name, type").eq("ministry_id", ministryId).eq("archived", false).ilike("name", `%${q}%`).limit(5),
        supabase.from("announcements").select("id, title").eq("ministry_id", ministryId).ilike("title", `%${q}%`).limit(5),
      ])
      const items: PaletteItem[] = []
      const navMatches = NAV_ITEMS.filter((n) => n.label.toLowerCase().includes(q))
      items.push(...navMatches)
      for (const p of (profilesRes.data ?? []) as { id: string; name: string; email: string; role: string }[]) {
        items.push({ type: "person", id: p.id, label: p.name, sublabel: p.email })
      }
      for (const g of (groupsRes.data ?? []) as { id: string; name: string; type: string }[]) {
        items.push({ type: "chat", id: g.id, label: g.name, sublabel: g.type === "church" ? "Church chat" : g.type === "dm" ? "Direct message" : "Group chat" })
      }
      for (const a of (announcementsRes.data ?? []) as { id: string; title: string }[]) {
        items.push({ type: "announcement", id: a.id, label: a.title, sublabel: "Announcement" })
      }
      setResults(items)
      setSelectedIdx(0)
      setLoading(false)
    }, 120)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, ministryId])

  function selectItem(item: PaletteItem) {
    onClose()
    if (item.type === "nav" && item.tab) { onTabChange(item.tab); return }
    if (item.type === "person") { onTabChange("directory"); return }
    if (item.type === "chat") { onTabChange("chats"); onOpenChat(item.id, item.label); return }
    if (item.type === "announcement") { onTabChange("announcements"); return }
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "ArrowDown") { e.preventDefault(); setSelectedIdx((i) => Math.min(i + 1, results.length - 1)) }
    else if (e.key === "ArrowUp") { e.preventDefault(); setSelectedIdx((i) => Math.max(i - 1, 0)) }
    else if (e.key === "Enter" && results[selectedIdx]) { selectItem(results[selectedIdx]) }
    else if (e.key === "Escape") { onClose() }
  }

  const grouped: { label: string; items: PaletteItem[] }[] = []
  const navItems = results.filter((r) => r.type === "nav")
  const peopleItems = results.filter((r) => r.type === "person")
  const chatItems = results.filter((r) => r.type === "chat")
  const annItems = results.filter((r) => r.type === "announcement")
  if (navItems.length) grouped.push({ label: query ? "Navigation" : "Go to", items: navItems })
  if (peopleItems.length) grouped.push({ label: "People", items: peopleItems })
  if (chatItems.length) grouped.push({ label: "Chats", items: chatItems })
  if (annItems.length) grouped.push({ label: "Announcements", items: annItems })

  const typeIcon: Record<PaletteItemType, React.ReactNode> = {
    nav: <List className="w-3.5 h-3.5" />,
    person: <User className="w-3.5 h-3.5" />,
    chat: <MessageCircle className="w-3.5 h-3.5" />,
    announcement: <Bell className="w-3.5 h-3.5" />,
  }

  if (!open) return null

  let flatIdx = 0

  return (
    <div
      className="fixed inset-0 z-[200] flex items-start justify-center pt-[10vh]"
      style={{ background: "rgba(19,16,26,0.45)" }}
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      <div
        className="w-full max-w-[560px] mx-4 rounded-2xl overflow-hidden shadow-[0_24px_64px_rgba(19,16,26,0.22)]"
        style={{ background: "#FBF8F2", border: "1px solid #ECE8DE" }}
      >
        {/* Search input */}
        <div className="flex items-center gap-3 px-4 py-3.5 border-b border-[#ECE8DE]">
          <Search className="w-4 h-4 text-[#8A8497] flex-shrink-0" />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Jump to anything…"
            className="flex-1 bg-transparent text-[14px] text-[#13101A] placeholder-[#C4C4C4] outline-none"
          />
          {loading && <div className="w-4 h-4 border-2 border-[#3E1540] border-t-transparent rounded-full animate-spin flex-shrink-0" />}
          <kbd className="text-[10px] px-1.5 py-0.5 border border-[#E5E0D2] rounded bg-[#F4F1E8] text-[#8A8497] leading-none flex-shrink-0">esc</kbd>
        </div>

        {/* Results */}
        <div className="max-h-[360px] overflow-y-auto py-2">
          {grouped.length === 0 && !loading && (
            <div className="px-4 py-8 text-center text-[13px] text-[#8A8497]">No results for &ldquo;{query}&rdquo;</div>
          )}
          {grouped.map((group) => (
            <div key={group.label}>
              <div className="px-4 pt-2 pb-1 text-[10px] font-semibold uppercase tracking-widest text-[#C4C4C4]">{group.label}</div>
              {group.items.map((item) => {
                const idx = flatIdx++
                const active = idx === selectedIdx
                return (
                  <button
                    key={item.id}
                    onMouseEnter={() => setSelectedIdx(idx)}
                    onMouseDown={() => selectItem(item)}
                    className="w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors"
                    style={{ background: active ? "#EDE5F0" : "transparent" }}
                  >
                    <span style={{ color: active ? "#3E1540" : "#8A8497" }}>{typeIcon[item.type]}</span>
                    <span className="flex-1 min-w-0">
                      <span className="block text-[13px] font-medium text-[#13101A] truncate">{item.label}</span>
                      {item.sublabel && <span className="block text-[11px] text-[#8A8497] truncate">{item.sublabel}</span>}
                    </span>
                    {active && <ChevronRight className="w-3.5 h-3.5 text-[#3E1540] flex-shrink-0" />}
                  </button>
                )
              })}
            </div>
          ))}
        </div>

        {/* Footer */}
        <div className="flex items-center gap-3 px-4 py-2.5 border-t border-[#ECE8DE] text-[10px] text-[#C4C4C4]">
          <span className="flex items-center gap-1"><kbd className="px-1 py-0.5 border border-[#E5E0D2] rounded bg-[#F4F1E8] leading-none">↑</kbd><kbd className="px-1 py-0.5 border border-[#E5E0D2] rounded bg-[#F4F1E8] leading-none">↓</kbd> navigate</span>
          <span className="flex items-center gap-1"><kbd className="px-1 py-0.5 border border-[#E5E0D2] rounded bg-[#F4F1E8] leading-none">↵</kbd> select</span>
          <span className="flex items-center gap-1"><kbd className="px-1 py-0.5 border border-[#E5E0D2] rounded bg-[#F4F1E8] leading-none">esc</kbd> close</span>
        </div>
      </div>
    </div>
  )
}

// ─── Desktop Topbar ──────────────────────────────────────────────────────────

interface DesktopTopbarProps {
  crumbs: string[]
  right?: React.ReactNode
}

function DesktopTopbar({ crumbs, right }: DesktopTopbarProps) {
  return (
    <div className="hidden md:flex h-14 px-7 items-center gap-4 border-b border-[#E5E0D2] bg-[#FBF8F2] flex-shrink-0">
      <div className="flex items-center gap-1.5 text-[12px]">
        {crumbs.map((c, i) => (
          <span key={i} className="flex items-center gap-1.5">
            <span className={i === crumbs.length - 1 ? "text-[#13101A] font-medium" : "text-[#8A8497]"}>{c}</span>
            {i < crumbs.length - 1 && <span className="text-[#C4C4C4] select-none">/</span>}
          </span>
        ))}
      </div>
      <div className="flex-1" />
      <div
        onClick={() => window.dispatchEvent(new CustomEvent("open-command-palette"))}
        className="flex items-center gap-2 px-3 py-1.5 border border-[#E5E0D2] rounded-lg bg-[#F4F1E8] text-[#8A8497] w-[240px] cursor-pointer hover:bg-[#ECE8DE] transition-colors select-none"
      >
        <Search className="w-3.5 h-3.5 flex-shrink-0" />
        <span className="text-[12px] flex-1">Jump to anything</span>
        <span className="text-[10px] px-1.5 py-0.5 border border-[#E5E0D2] rounded bg-[#FBF8F2] leading-none">⌘K</span>
      </div>
      {right}
    </div>
  )
}

// ─── Desktop Sidebar ─────────────────────────────────────────────────────────

interface DesktopSidebarProps {
  activeTab: Tab
  onTabChange: (tab: Tab) => void
  ministryName: string
  chatsUnread: number
  showPlan: boolean
  userInitials: string
  userAvatarUrl?: string | null
  recentChats: ChatPreview[]
  userTeams: UserTeam[]
  onOpenChat: (id: string, name: string) => void
  activeGroupId?: string | null
  onLogout: () => void
  isAdmin?: boolean
  onCreateTeam?: () => void
  activeTeamId: string | null
  onActiveTeamChange: (id: string) => void
  profileSection: "spiritual-profile" | "journal"
  onProfileSectionChange: (s: "spiritual-profile" | "journal") => void
}

function DesktopSidebar({ activeTab, onTabChange, ministryName, chatsUnread, showPlan, userInitials, userAvatarUrl, recentChats, userTeams, onOpenChat, activeGroupId, onLogout, isAdmin, onCreateTeam, activeTeamId, onActiveTeamChange, profileSection, onProfileSectionChange }: DesktopSidebarProps) {

  const navItems: { id: Tab; icon: React.FC<{ className?: string }> }[] = [
    { id: "home", icon: Home },
    { id: "announcements", icon: Bell },
    { id: "chats", icon: MessageCircle },
    ...(showPlan ? [{ id: "plan" as Tab, icon: ClipboardList }] : []),
    { id: "directory", icon: Users },
    { id: "profile", icon: User },
  ]

  const monoStyle: React.CSSProperties = {
    fontFamily: "ui-monospace, 'SF Mono', Menlo, monospace",
    fontSize: "10px",
    letterSpacing: "0.06em",
    textTransform: "uppercase",
    color: "#8A8497",
  }

  const subItemStyle = (active?: boolean, danger?: boolean): React.CSSProperties => ({
    display: "flex",
    alignItems: "center",
    padding: "7px 10px",
    borderRadius: "8px",
    cursor: "pointer",
    background: active ? "#EFEAE0" : "transparent",
    color: danger ? "#9D2D2D" : "#13101A",
    fontSize: "13px",
    fontWeight: active ? 500 : 400,
    border: "none",
    width: "100%",
    textAlign: "left",
  })

  function renderPanelBody() {
    if (activeTab === "chats") {
      return (
        <div className="flex-1 overflow-y-auto px-2 pb-3">
          <p style={{ ...monoStyle, padding: "8px 8px 6px" }}>Recent</p>
          {recentChats.length === 0 ? (
            <p className="text-[12px] text-[#8A8497] px-2 py-2">No chats yet</p>
          ) : (
            recentChats.slice(0, 6).map((c, i) => {
              const isActive = activeGroupId === c.id
              return (
                <button
                  key={c.id}
                  onClick={() => onOpenChat(c.id, c.groupName)}
                  style={{
                    display: "flex", alignItems: "center", gap: "10px",
                    padding: "8px 8px", borderRadius: "8px", cursor: "pointer",
                    background: isActive ? "#EFEAE0" : "transparent",
                    borderTop: "none", borderRight: "none", borderBottom: "none",
                    borderLeft: isActive ? "2px solid #3E1540" : "2px solid transparent",
                    width: "100%", textAlign: "left",
                  }}
                >
                  <div style={{
                    width: 28, height: 28, borderRadius: 8, flexShrink: 0,
                    background: i % 2 === 0 ? "#3E1540" : "#13101A",
                    color: "#F6F4EF", display: "grid", placeItems: "center",
                    fontSize: "10px", fontWeight: 600,
                  }}>
                    {c.initials}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: "13px", fontWeight: c.unreadCount ? 600 : 500, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{c.groupName}</div>
                    {c.lastMessage && (
                      <div style={{ fontSize: "11px", color: "#8A8497", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{c.lastMessage}</div>
                    )}
                  </div>
                  {c.unreadCount > 0 && (
                    <span style={{ fontSize: "10px", fontWeight: 700, color: "#13101A", background: "#C9A34B", padding: "1px 6px", borderRadius: 999 }}>{c.unreadCount}</span>
                  )}
                </button>
              )
            })
          )}
        </div>
      )
    }

    if (activeTab === "plan") {
      return (
        <div className="flex-1 overflow-y-auto px-2 pb-3">
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "8px 8px 6px" }}>
            <p style={monoStyle}>Your teams · {userTeams.length}</p>
            {isAdmin && onCreateTeam && (
              <button
                onClick={onCreateTeam}
                style={{ width: 20, height: 20, display: "flex", alignItems: "center", justifyContent: "center", background: "transparent", border: "none", cursor: "pointer", color: "#8A8497", borderRadius: 4, padding: 0 }}
                title="New team"
              >
                <Plus className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
          {userTeams.length === 0 ? (
            <p className="text-[12px] text-[#8A8497] px-2 py-2">No teams yet</p>
          ) : (
            userTeams.map((t) => {
              const isActive = t.teamId === activeTeamId
              return (
                <button key={t.teamId} onClick={() => onActiveTeamChange(t.teamId)} style={{
                  display: "flex", alignItems: "center", gap: "10px",
                  padding: "9px 8px", borderRadius: "8px", cursor: "pointer",
                  background: isActive ? "#EFEAE0" : "transparent",
                  borderTopWidth: 0, borderRightWidth: 0, borderBottomWidth: 0,
                  borderLeftWidth: 2, borderLeftStyle: "solid",
                  borderLeftColor: isActive ? "#3E1540" : "transparent",
                  width: "100%", textAlign: "left",
                }}>
                  <div style={{
                    width: 30, height: 30, borderRadius: 8, flexShrink: 0,
                    background: isActive ? "#3E1540" : "#F4F1E8",
                    color: isActive ? "#F6F4EF" : "#13101A",
                    display: "grid", placeItems: "center", fontSize: "16px",
                  }}>
                    {t.teamIcon ?? "👥"}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: "13px", fontWeight: isActive ? 600 : 500, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{t.teamName}</div>
                    <div style={{ fontSize: "10px", color: "#8A8497", letterSpacing: "0.4px" }}>{t.roleName}</div>
                  </div>
                </button>
              )
            })
          )}
        </div>
      )
    }

    if (activeTab === "directory") {
      const filters = [
        { l: "All members", on: true },
        { l: "Leaders" },
        { l: "Class of 2025" },
        { l: "Class of 2026" },
        { l: "Class of 2027" },
        { l: "Class of 2028" },
      ]
      return (
        <div className="flex-1 overflow-y-auto px-2 pb-3">
          <p style={{ ...monoStyle, padding: "8px 8px 4px" }}>Filters</p>
          {filters.map((f, i) => (
            <button key={i} style={subItemStyle(f.on)}>
              <span style={{ flex: 1 }}>{f.l}</span>
            </button>
          ))}
        </div>
      )
    }

    if (activeTab === "profile") {
      const items: { label: string; section?: "spiritual-profile" | "journal"; danger?: boolean; onClick?: () => void }[] = [
        { label: "Spiritual profile", section: "spiritual-profile" },
        { label: "Journal", section: "journal" },
        { label: "Sign out", danger: true, onClick: onLogout },
      ]
      return (
        <div className="flex-1 overflow-y-auto px-2 pb-3">
          <p style={{ ...monoStyle, padding: "8px 8px 6px" }}>Profile</p>
          {items.map((s, i) => (
            <button
              key={i}
              style={subItemStyle(s.section ? profileSection === s.section : undefined, s.danger)}
              onClick={s.section ? () => onProfileSectionChange(s.section!) : s.onClick}
            >
              <span style={{ flex: 1 }}>{s.label}</span>
            </button>
          ))}
        </div>
      )
    }

    // Home and announcements — static sub-nav
    const homeItems = [
      { label: "This week", on: true },
      { label: "Up next" },
      { label: "Pray with us" },
      { label: "Recent activity" },
    ]
    const annItems = [
      { label: "All", on: true },
      { label: "Events" },
      { label: "Prayer" },
      { label: "Pinned" },
    ]
    const items = activeTab === "announcements" ? annItems : homeItems
    const sectionLabel = activeTab === "announcements" ? "Announcements" : "Home"

    return (
      <div className="flex-1 overflow-y-auto px-2 pb-3">
        <p style={{ ...monoStyle, padding: "8px 8px 6px" }}>{sectionLabel}</p>
        {items.map((s, i) => (
          <button key={i} style={subItemStyle(s.on)}>
            <span style={{ flex: 1 }}>{s.label}</span>
          </button>
        ))}
      </div>
    )
  }

  return (
    <>
      {/* Icon Rail */}
      <div className="hidden md:flex flex-col w-16 flex-shrink-0 h-screen bg-[#13101A] items-center py-4 gap-1">
        {/* Logo */}
        <div className="w-9 h-9 rounded-[10px] bg-[#3E1540] flex items-center justify-center mb-3.5 flex-shrink-0">
          <svg width="18" height="18" viewBox="0 0 100 100" fill="none">
            <circle cx="50" cy="50" r="44" stroke="#F6F4EF" strokeWidth="6" />
            <rect x="47" y="22" width="6" height="56" fill="#F6F4EF" />
            <rect x="22" y="47" width="56" height="6" fill="#F6F4EF" />
          </svg>
        </div>

        {navItems.map(({ id, icon: Icon }) => {
          const isActive = activeTab === id
          return (
            <button
              key={id}
              onClick={() => onTabChange(id)}
              className="relative w-10 h-10 rounded-[10px] flex items-center justify-center transition-colors"
              style={{
                background: isActive ? "rgba(255,255,255,0.10)" : "transparent",
                color: isActive ? "#F6F4EF" : "rgba(246,244,239,0.45)",
                border: "none",
                cursor: "pointer",
              }}
            >
              <Icon className="w-[18px] h-[18px]" />
              {isActive && (
                <span className="absolute left-[-9px] top-2 bottom-2 w-0.5 bg-[#C9A34B] rounded-full" />
              )}
              {id === "chats" && chatsUnread > 0 && (
                <span className="absolute top-1.5 right-1.5 w-1.5 h-1.5 bg-[#C9A34B] rounded-full" />
              )}
            </button>
          )
        })}

        <div className="flex-1" />

        {/* User avatar */}
        <div className="w-8 h-8 rounded-full bg-[#3E1540] flex items-center justify-center overflow-hidden flex-shrink-0">
          {userAvatarUrl ? (
            <img src={userAvatarUrl} alt="" className="w-full h-full object-cover" />
          ) : (
            <span className="text-[11px] font-semibold text-[#F6F4EF]">{userInitials}</span>
          )}
        </div>
      </div>

      {/* Context Panel — hidden for chats/directory (those tabs have their own left panel) */}
      <div className={`hidden flex-col w-[232px] flex-shrink-0 h-screen bg-[#FBF8F2] border-r border-[#E5E0D2] ${activeTab === "chats" || activeTab === "directory" ? "" : "md:flex"}`}>
        {/* Workspace header */}
        <div className="px-5 pt-5 pb-4 border-b border-[#E5E0D2] flex-shrink-0">
          <p style={monoStyle}>Workspace</p>
          <p style={{ fontFamily: "var(--font-instrument-serif)", fontSize: "22px", lineHeight: 1.1, color: "#13101A", marginTop: "4px" }}>
            Central
          </p>
          <p className="text-[11px] text-[#8A8497] mt-0.5 leading-tight">{ministryName}</p>
        </div>

        {renderPanelBody()}

        {/* Verse card */}
        <div className="mx-3 mb-4 p-3 border border-[#E5E0D2] rounded-[10px] bg-[#F4F1E8] flex-shrink-0">
          <p style={{ ...monoStyle, marginBottom: "6px" }}>Verse · Psalm 46:10</p>
          <p style={{ fontFamily: "var(--font-instrument-serif)", fontStyle: "italic", fontSize: "14px", lineHeight: 1.4, color: "#13101A" }}>
            &ldquo;Be still, and know that I am God.&rdquo;
          </p>
        </div>
      </div>
    </>
  )
}

// ─── HomeApp (root) ──────────────────────────────────────────────────────────

interface HomeAppProps {
  userId: string
  initialProfile: Profile
  ministryId: string
  ministryName: string
}

export function HomeApp({ userId, initialProfile, ministryId, ministryName }: HomeAppProps) {
  const supabase = createClient()
  const router = useRouter()
  const searchParams = useSearchParams()

  const validTabs: Tab[] = ["home", "announcements", "chats", "plan", "directory", "profile"]
  const initialTab = (searchParams.get("tab") as Tab | null)
  const [activeTab, setActiveTabState] = useState<Tab>(
    initialTab && validTabs.includes(initialTab) ? initialTab : "home"
  )

  function setActiveTab(tab: Tab) {
    setActiveTabState(tab)
    router.replace(`/home?tab=${tab}`, { scroll: false })
  }
  const [globalOpenChat, setGlobalOpenChat] = useState<{ id: string; name: string } | null>(null)
  const [totalChatsUnread, setTotalChatsUnread] = useState(0)
  const [chatRefreshKey, setChatRefreshKey] = useState(0)
  const [recentChats, setRecentChats] = useState<ChatPreview[]>([])
  const [userTeams, setUserTeams] = useState<UserTeam[]>([])
  const [allTeams, setAllTeams] = useState<Team[]>([])
  const [avatarUrl, setAvatarUrl] = useState<string | null>(initialProfile.avatar_url ?? null)
  const [isDesktop, setIsDesktop] = useState(false)
  const [showCreateTeam, setShowCreateTeam] = useState(false)
  const [activeTeamId, setActiveTeamId] = useState<string | null>(null)
  const [profileSection, setProfileSection] = useState<"spiritual-profile" | "journal">("spiritual-profile")
  const [paletteOpen, setPaletteOpen] = useState(false)

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") { e.preventDefault(); setPaletteOpen(true) }
    }
    function handleOpenEvent() { setPaletteOpen(true) }
    window.addEventListener("keydown", handleKeyDown)
    window.addEventListener("open-command-palette", handleOpenEvent)
    return () => {
      window.removeEventListener("keydown", handleKeyDown)
      window.removeEventListener("open-command-palette", handleOpenEvent)
    }
  }, [])

  useEffect(() => {
    const mq = window.matchMedia("(min-width: 768px)")
    setIsDesktop(mq.matches)
    const handler = (e: MediaQueryListEvent) => setIsDesktop(e.matches)
    mq.addEventListener("change", handler)
    return () => mq.removeEventListener("change", handler)
  }, [])

  const isAdmin = ["admin", "leader"].includes(initialProfile.role.toLowerCase())

  // Fetch all user groups with their latest message + real unread counts, sorted by recency
  const loadRecentChats = useCallback(async () => {
    const { data: groups } = await supabase
      .from("group_members")
      .select("groups(id, name, type), last_read_at")
      .eq("user_id", userId)

    if (!groups) return

    type RawGroup = { groups: { id: string; name: string; type: string } | { id: string; name: string; type: string }[] | null; last_read_at: string | null }
    const groupList = (groups as RawGroup[])
      .map((m) => {
        if (!m.groups) return null
        const g = Array.isArray(m.groups) ? m.groups[0] : m.groups
        if (!g) return null
        return { ...g, lastReadAt: m.last_read_at }
      })
      .filter(Boolean) as { id: string; name: string; type: string; lastReadAt: string | null }[]

    if (groupList.length === 0) {
      setRecentChats([])
      return
    }

    const groupIds = groupList.map((g) => g.id)
    const lastReadMap: Record<string, string | null> = {}
    for (const g of groupList) lastReadMap[g.id] = g.lastReadAt

    const { data: msgs } = await supabase
      .from("messages")
      .select("group_id, content, created_at, sender_id, profiles!sender_id(name)")
      .in("group_id", groupIds)
      .order("created_at", { ascending: false })

    type RawMsg = { group_id: string; content: string; created_at: string; sender_id: string; profiles: { name: string } | { name: string }[] | null }
    const lastMsgMap: Record<string, { content: string; senderName: string; time: string; ts: string }> = {}
    const unreadCountMap: Record<string, number> = {}
    for (const msg of ((msgs ?? []) as RawMsg[])) {
      if (!lastMsgMap[msg.group_id]) {
        const p = Array.isArray(msg.profiles) ? msg.profiles[0] : msg.profiles
        lastMsgMap[msg.group_id] = {
          content: msg.content,
          senderName: p?.name ?? "",
          time: formatRelativeTime(msg.created_at),
          ts: msg.created_at,
        }
      }
      const lra = lastReadMap[msg.group_id]
      if (msg.sender_id !== userId && (!lra || msg.created_at > lra)) {
        unreadCountMap[msg.group_id] = (unreadCountMap[msg.group_id] ?? 0) + 1
      }
    }

    const previews: ChatPreview[] = groupList.map((g) => {
      const last = lastMsgMap[g.id]
      return {
        id: g.id,
        groupName: g.name,
        lastMessage: last?.content ?? "",
        lastMessageSender: last?.senderName ?? "",
        unreadCount: unreadCountMap[g.id] ?? 0,
        avatarColor: getAvatarColor(g.name),
        initials: getInitials(g.name),
        time: last?.time ?? "",
        _ts: last?.ts ?? "",
      } as ChatPreview & { _ts: string }
    })

    // Sort by most recent message descending
    previews.sort((a, b) => {
      const ta = (a as ChatPreview & { _ts: string })._ts
      const tb = (b as ChatPreview & { _ts: string })._ts
      if (!ta && !tb) return 0
      if (!ta) return 1
      if (!tb) return -1
      return tb.localeCompare(ta)
    })

    setRecentChats(previews)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId])

  const loadUserTeams = useCallback(async () => {
    type RawMembership = {
      team_id: string
      role_id: string
      teams: { id: string; name: string; icon: string | null; description: string | null } | { id: string; name: string; icon: string | null; description: string | null }[] | null
      team_roles: { id: string; name: string; permissions: string[] } | { id: string; name: string; permissions: string[] }[] | null
    }
    const { data } = await supabase
      .from("team_members")
      .select("team_id, role_id, teams(id, name, icon, description), team_roles(id, name, permissions)")
      .eq("user_id", userId)
    if (!data) return
    const teams: UserTeam[] = (data as RawMembership[]).flatMap((m) => {
      const t = Array.isArray(m.teams) ? m.teams[0] : m.teams
      const r = Array.isArray(m.team_roles) ? m.team_roles[0] : m.team_roles
      if (!t || !r) return []
      return [{ teamId: t.id, teamName: t.name, teamIcon: t.icon, teamDescription: t.description, roleId: r.id, roleName: r.name, permissions: Array.isArray(r.permissions) ? r.permissions : [] }]
    })
    setUserTeams(teams)
    setActiveTeamId((prev) => prev ?? teams[0]?.teamId ?? null)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId])

  const loadAllTeams = useCallback(async () => {
    if (!isAdmin) return
    const { data } = await supabase
      .from("teams")
      .select("id, name, icon, description, created_by")
      .eq("ministry_id", ministryId)
      .order("created_at")
    if (!data) return
    const teamIds = (data as { id: string }[]).map((t) => t.id)
    const countMap: Record<string, number> = {}
    if (teamIds.length > 0) {
      const { data: counts } = await supabase.from("team_members").select("team_id").in("team_id", teamIds)
      for (const m of counts ?? []) countMap[m.team_id] = (countMap[m.team_id] ?? 0) + 1
    }
    setAllTeams((data as { id: string; name: string; icon: string | null; description: string | null; created_by: string }[]).map((t) => ({ ...t, member_count: countMap[t.id] ?? 0 })))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAdmin, ministryId])

  // Initial load + reload after closing a chat
  useEffect(() => {
    loadRecentChats()
  }, [loadRecentChats, chatRefreshKey])

  useEffect(() => {
    loadUserTeams()
    loadAllTeams()
  }, [loadUserTeams, loadAllTeams])

  // Realtime: keep recentChats preview fresh as messages arrive
  useEffect(() => {
    const channel = supabase
      .channel("home-app-recent-chats")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "messages" },
        (payload) => {
          const msg = payload.new as { group_id: string; content: string; created_at: string; sender_id: string }
          supabase
            .from("profiles")
            .select("name")
            .eq("id", msg.sender_id)
            .single()
            .then(({ data: prof }) => {
              const isOwnMessage = msg.sender_id === userId
              setRecentChats((prev) => {
                const existing = prev.find((c) => c.id === msg.group_id)
                if (!existing) return prev
                const updated = prev.map((c) =>
                  c.id === msg.group_id
                    ? {
                        ...c,
                        lastMessage: msg.content,
                        lastMessageSender: prof?.name ?? "",
                        time: formatRelativeTime(msg.created_at),
                        _ts: msg.created_at,
                        unreadCount: isOwnMessage ? c.unreadCount : c.unreadCount + 1,
                      } as ChatPreview & { _ts: string }
                    : c
                )
                // Re-sort so the updated chat bubbles to the top
                return [...updated].sort((a, b) => {
                  const ta = (a as ChatPreview & { _ts: string })._ts ?? ""
                  const tb = (b as ChatPreview & { _ts: string })._ts ?? ""
                  return tb.localeCompare(ta)
                })
              })
            })
        }
      )
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId])

  const recountTotalUnread = useCallback(async () => {
    const { data } = await supabase
      .from("group_members")
      .select("group_id, last_read_at")
      .eq("user_id", userId)

    if (!data || data.length === 0) { setTotalChatsUnread(0); return }

    let total = 0
    await Promise.all(
      data.map(async ({ group_id, last_read_at }: { group_id: string; last_read_at: string | null }) => {
        let q = supabase
          .from("messages")
          .select("*", { count: "exact", head: true })
          .eq("group_id", group_id)
          .neq("sender_id", userId)
        if (last_read_at) q = q.gt("created_at", last_read_at)
        const { count } = await q
        total += count ?? 0
      })
    )
    setTotalChatsUnread(total)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId])

  function handleOpenChat(id: string, name: string) {
    setGlobalOpenChat({ id, name })
  }

  function handleChatClose() {
    setGlobalOpenChat(null)
    setChatRefreshKey((k) => k + 1)
  }

  function handleSidebarTabChange(tab: Tab) {
    setGlobalOpenChat(null)
    setActiveTab(tab)
  }

  async function handleLogout() {
    await supabase.auth.signOut()
    window.location.href = "/login"
  }

  const showPlanTab = isAdmin || userTeams.length > 0

  return (
    <div className="relative min-h-screen bg-[#FBF8F2] max-w-[390px] mx-auto md:max-w-none md:flex md:h-screen md:overflow-hidden md:min-h-0 md:bg-[#F4F1E8]">

      {/* Desktop sidebar — hidden on mobile */}
      <DesktopSidebar
        activeTab={activeTab}
        onTabChange={handleSidebarTabChange}
        ministryName={ministryName}
        chatsUnread={totalChatsUnread}
        showPlan={showPlanTab}
        userInitials={getInitials(initialProfile.name)}
        userAvatarUrl={avatarUrl}
        recentChats={recentChats}
        userTeams={userTeams}
        onOpenChat={handleOpenChat}
        activeGroupId={globalOpenChat?.id}
        onLogout={handleLogout}
        isAdmin={isAdmin}
        onCreateTeam={() => { setActiveTab("plan"); setShowCreateTeam(true) }}
        activeTeamId={activeTeamId}
        onActiveTeamChange={setActiveTeamId}
        profileSection={profileSection}
        onProfileSectionChange={setProfileSection}
      />

      {/* Content + bottom nav wrapper */}
      <div className="md:flex-1 md:flex md:flex-col md:overflow-hidden md:min-h-0">

        {/* Scrollable content area */}
        <div className="overflow-y-auto pb-28 min-h-screen md:flex-1 md:pb-0 md:min-h-0 md:overflow-hidden">

          {activeTab === "home" && (
            <div className="md:h-full md:overflow-y-auto">
              <HomeTab
                profile={initialProfile}
                ministryId={ministryId}
                ministryName={ministryName}
                recentChats={recentChats}
                onSeeChats={() => setActiveTab("chats")}
                onSeeAnnouncements={() => setActiveTab("announcements")}
                onOpenChat={handleOpenChat}
                onGoToProfile={() => setActiveTab("profile")}
                avatarUrl={avatarUrl}
              />
            </div>
          )}

          {activeTab === "announcements" && (
            <div className="md:h-full md:overflow-y-auto">
              <AnnouncementsTab userId={userId} userRole={initialProfile.role} userGradYear={initialProfile.graduation_year} ministryId={ministryId} ministryName={ministryName} />
            </div>
          )}

          {/* Chats tab: mobile = normal stack, desktop = two-column split */}
          {activeTab === "chats" && (
            <div className="md:flex md:h-full md:overflow-hidden">
              {/* Left: chat list */}
              <div className="md:w-[232px] md:flex-shrink-0 md:border-r md:border-[#ECE8DE] md:overflow-y-auto md:h-full">
                <ChatsTab
                  userId={userId}
                  userProfile={initialProfile}
                  userRole={initialProfile.role}
                  ministryId={ministryId}
                  ministryName={ministryName}
                  onOpenChat={handleOpenChat}
                  onTotalUnreadChange={setTotalChatsUnread}
                  refreshKey={chatRefreshKey}
                  onOpenDirectory={() => setActiveTab("directory")}
                  activeGroupId={globalOpenChat?.id}
                />
              </div>
              {/* Right: chat content — desktop only */}
              {globalOpenChat ? (
                <div className="hidden md:flex md:flex-1 md:overflow-hidden">
                  <ChatScreen
                    groupId={globalOpenChat.id}
                    groupName={globalOpenChat.name}
                    userId={userId}
                    userName={initialProfile.name}
                    userRole={initialProfile.role}
                    onClose={handleChatClose}
                    onRead={recountTotalUnread}
                    inline
                  />
                </div>
              ) : (
                <div className="hidden md:flex md:flex-1 md:items-center md:justify-center bg-[#FDFBF7]">
                  <div className="text-center">
                    <MessageCircle className="w-10 h-10 text-[#C4C4C4] mx-auto mb-3" />
                    <p className="text-[14px] font-semibold text-[#8A8497]">Select a chat</p>
                    <p className="text-[12px] text-[#C4C4C4] mt-1">Choose a conversation on the left</p>
                  </div>
                </div>
              )}
            </div>
          )}

          {activeTab === "plan" && (
            <div className="md:h-full md:overflow-y-auto">
              <PlanTab
                userId={userId}
                ministryId={ministryId}
                ministryName={ministryName}
                userTeams={userTeams}
                allTeams={allTeams}
                isAdmin={isAdmin}
                onTeamsChange={() => { loadUserTeams(); loadAllTeams() }}
                showCreateTeam={showCreateTeam}
                onShowCreateTeam={setShowCreateTeam}
                activeTeamId={activeTeamId}
                onTeamCreated={(teamId) => { loadUserTeams(); loadAllTeams(); setActiveTeamId(teamId) }}
              />
            </div>
          )}

          {activeTab === "directory" && (
            <div className="md:h-full md:overflow-y-auto">
              <DirectoryTab
                currentUserId={userId}
                currentUserName={initialProfile.name}
                ministryId={ministryId}
                ministryName={ministryName}
                onBack={() => setActiveTab("chats")}
                onOpenChat={(id, name) => {
                  setActiveTab("chats")
                  handleOpenChat(id, name)
                }}
              />
            </div>
          )}

          {activeTab === "profile" && (
            <div className="md:h-full md:overflow-y-auto">
              <ProfileTab
                userId={userId}
                initialProfile={{ ...initialProfile, avatar_url: avatarUrl }}
                ministryName={ministryName}
                onLogout={handleLogout}
                onAvatarChange={(url) => setAvatarUrl(url)}
                activeSection={profileSection}
                onSectionChange={setProfileSection}
              />
            </div>
          )}

        </div>

        <BottomNav
          activeTab={activeTab}
          onTabChange={setActiveTab}
          chatsUnread={totalChatsUnread}
          showPlan={showPlanTab}
        />

      </div>

      {/* Global ChatScreen overlay — mobile always, desktop only when not on chats tab */}
      {globalOpenChat && !(isDesktop && activeTab === "chats") && (
        <ChatScreen
          groupId={globalOpenChat.id}
          groupName={globalOpenChat.name}
          userId={userId}
          userName={initialProfile.name}
          userRole={initialProfile.role}
          onClose={handleChatClose}
          onRead={recountTotalUnread}
        />
      )}

      <CommandPalette
        open={paletteOpen}
        onClose={() => setPaletteOpen(false)}
        ministryId={ministryId}
        onTabChange={(tab) => { setPaletteOpen(false); handleSidebarTabChange(tab) }}
        onOpenChat={(id, name) => { setPaletteOpen(false); handleOpenChat(id, name) }}
      />
    </div>
  )
}
