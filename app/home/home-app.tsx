"use client"

import { useState, useEffect, useCallback } from "react"
import { Search, Calendar, ChevronRight, Edit3, Check, X, LogOut, Bell, Users } from "lucide-react"
import { createClient } from "@/lib/supabase"
import { BottomNav } from "@/components/ui/bottom-nav"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { ChatsSection, type ChatPreview } from "@/components/ui/chats-section"

// ─── Types ─────────────────────────────────────────────────────────────────

type Tab = "home" | "announcements" | "chats" | "directory" | "profile"

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
}

interface Announcement {
  id: string
  title: string
  body: string
  created_at: string
  is_pinned: boolean
  is_event: boolean
  seen_count: number | null
}

interface ChatGroup {
  id: string
  name: string
  type: string
  last_message: string | null
  last_sender: string | null
  last_message_time: string | null
  unread_count: number
}

// ─── Helpers ────────────────────────────────────────────────────────────────

const AVATAR_COLORS = [
  "bg-[#6D28D9]",
  "bg-[#7C3AED]",
  "bg-[#8B5CF6]",
  "bg-[#5B21B6]",
  "bg-[#4C1D95]",
  "bg-[#A78BFA]",
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

// ─── Shared Components ──────────────────────────────────────────────────────

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="text-[11px] font-semibold text-muted-foreground/70 uppercase tracking-[0.1em]">
      {children}
    </h2>
  )
}

function Spinner() {
  return (
    <div className="flex items-center justify-center py-12">
      <div className="w-6 h-6 rounded-full border-2 border-[#6D28D9]/20 border-t-[#6D28D9] animate-spin" />
    </div>
  )
}

function EmptyState({ icon, title, subtitle }: { icon: React.ReactNode; title: string; subtitle: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 gap-3 text-center">
      <div className="w-14 h-14 rounded-2xl bg-[#6D28D9]/6 flex items-center justify-center text-[#6D28D9]/40">
        {icon}
      </div>
      <div>
        <p className="text-[14px] font-semibold text-foreground/60">{title}</p>
        <p className="text-[12px] text-muted-foreground/50 mt-0.5">{subtitle}</p>
      </div>
    </div>
  )
}

// ─── Home Tab ───────────────────────────────────────────────────────────────

interface HomeTabProps {
  profile: Profile
  onSeeChats: () => void
  onSeeAnnouncements: () => void
}

function HomeTab({ profile, onSeeChats, onSeeAnnouncements }: HomeTabProps) {
  const supabase = createClient()
  const [announcement, setAnnouncement] = useState<Announcement | null>(null)
  const [chats, setChats] = useState<ChatPreview[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      const [{ data: ann }, { data: groups }] = await Promise.all([
        supabase
          .from("announcements")
          .select("*")
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle(),
        supabase
          .from("group_members")
          .select("groups(id, name, type)")
          .eq("user_id", profile.id)
          .limit(3),
      ])

      if (ann) setAnnouncement(ann)

      if (groups) {
        const previews: ChatPreview[] = groups
          .map((m: { groups: { id: string; name: string; type: string } | null }) => {
            if (!m.groups) return null
            const g = m.groups
            return {
              id: g.id,
              groupName: g.name,
              lastMessage: "Tap to open chat",
              lastMessageSender: "",
              unreadCount: 0,
              avatarColor: getAvatarColor(g.name),
              initials: getInitials(g.name),
              time: "",
            } satisfies ChatPreview
          })
          .filter(Boolean) as ChatPreview[]
        setChats(previews)
      }
      setLoading(false)
    }
    load()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile.id])

  const totalUnread = chats.reduce((s, c) => s + c.unreadCount, 0)

  return (
    <div className="px-5 pt-14 pb-2">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-xl bg-[#6D28D9] flex items-center justify-center shadow-lg shadow-[#6D28D9]/20">
            <span className="text-[#F59E0B] font-bold text-base">C</span>
          </div>
          <span className="text-[#6D28D9] font-semibold text-lg tracking-tight">CENTRAL</span>
        </div>
        <button className="w-10 h-10 rounded-full bg-[#6D28D9]/8 flex items-center justify-center hover:bg-[#6D28D9]/12 transition-colors relative">
          <Bell className="w-[18px] h-[18px] text-[#6D28D9] stroke-[1.5px]" />
        </button>
      </div>

      {/* Greeting */}
      <div className="flex items-start justify-between gap-4 mb-8">
        <div className="flex-1">
          <p className="text-[13px] text-muted-foreground/70 font-medium tracking-wide mb-1">
            {getGreeting()}
          </p>
          <h1 className="text-[28px] font-bold text-foreground tracking-tight leading-tight">
            {profile.name.split(" ")[0]}
          </h1>
        </div>
        <span className="mt-2 px-2.5 py-1 bg-[#6D28D9]/8 text-[#6D28D9] text-[10px] font-semibold rounded-full tracking-wide uppercase">
          {profile.role}
        </span>
      </div>

      {loading ? (
        <Spinner />
      ) : (
        <div className="flex flex-col gap-8">
          {/* Latest Announcement */}
          <section>
            <div className="flex items-center justify-between mb-4">
              <SectionLabel>Latest Announcement</SectionLabel>
              <button
                onClick={onSeeAnnouncements}
                className="text-[11px] text-[#6D28D9] font-semibold flex items-center gap-0.5 hover:opacity-70 transition-opacity"
              >
                View all <ChevronRight className="w-3.5 h-3.5" />
              </button>
            </div>

            {announcement ? (
              <div className="bg-white rounded-2xl border border-[#6D28D9]/8 p-5 shadow-[0_4px_24px_rgba(109,40,217,0.08)]">
                <div className="flex items-center gap-2 text-muted-foreground/60 text-[11px] font-medium mb-3">
                  <Calendar className="w-3.5 h-3.5" />
                  <span>{formatDate(announcement.created_at)}</span>
                </div>
                <h3 className="text-[17px] font-bold text-foreground tracking-tight mb-2">
                  {announcement.title}
                </h3>
                <p className="text-[13px] text-muted-foreground leading-relaxed mb-5 line-clamp-2">
                  {announcement.body}
                </p>
                <div className="flex items-center gap-3">
                  {announcement.is_event && (
                    <button className="flex-1 bg-[#F59E0B] hover:bg-[#E18D07] text-[#6D28D9] font-bold py-3 px-4 rounded-xl transition-colors text-[13px] tracking-wide shadow-lg shadow-[#F59E0B]/20">
                      RSVP Now
                    </button>
                  )}
                  <button
                    onClick={onSeeAnnouncements}
                    className="py-3 px-4 rounded-xl border border-[#6D28D9]/12 text-[#6D28D9] font-semibold hover:bg-[#6D28D9]/4 transition-colors text-[13px]"
                  >
                    Details
                  </button>
                </div>
              </div>
            ) : (
              <div className="bg-white rounded-2xl border border-[#6D28D9]/8 p-5 text-center text-[13px] text-muted-foreground/50">
                No announcements yet
              </div>
            )}
          </section>

          {/* Your Chats */}
          {chats.length > 0 && (
            <ChatsSection
              chats={chats}
              totalUnread={totalUnread}
              onSeeAll={onSeeChats}
            />
          )}
        </div>
      )}
    </div>
  )
}

// ─── Announcements Tab ──────────────────────────────────────────────────────

function AnnouncementsTab() {
  const supabase = createClient()
  const [announcements, setAnnouncements] = useState<Announcement[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      const { data } = await supabase
        .from("announcements")
        .select("*")
        .order("is_pinned", { ascending: false })
        .order("created_at", { ascending: false })
      setAnnouncements(data ?? [])
      setLoading(false)
    }
    load()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <div className="px-5 pt-14 pb-2">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-xl bg-[#6D28D9] flex items-center justify-center shadow-lg shadow-[#6D28D9]/20">
            <span className="text-[#F59E0B] font-bold text-base">C</span>
          </div>
          <span className="text-[#6D28D9] font-semibold text-lg tracking-tight">CENTRAL</span>
        </div>
      </div>
      <h1 className="text-[22px] font-bold text-foreground tracking-tight mb-6">Announcements</h1>

      {loading ? (
        <Spinner />
      ) : announcements.length === 0 ? (
        <EmptyState
          icon={<Bell className="w-7 h-7" />}
          title="No announcements yet"
          subtitle="Check back soon for updates"
        />
      ) : (
        <div className="flex flex-col gap-4">
          {announcements.map((ann, idx) => (
            <AnnouncementCard key={ann.id} announcement={ann} isPinned={ann.is_pinned && idx === 0} />
          ))}
        </div>
      )}
    </div>
  )
}

function AnnouncementCard({ announcement, isPinned }: { announcement: Announcement; isPinned: boolean }) {
  return (
    <div className="bg-white rounded-2xl border border-[#6D28D9]/8 p-5 shadow-[0_4px_24px_rgba(109,40,217,0.08)]">
      {isPinned && (
        <div className="flex items-center gap-1.5 mb-3">
          <div className="w-1.5 h-1.5 rounded-full bg-[#F59E0B]" />
          <span className="text-[10px] font-bold text-[#F59E0B] uppercase tracking-wider">Pinned</span>
        </div>
      )}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2 text-muted-foreground/60 text-[11px] font-medium">
          <Calendar className="w-3.5 h-3.5" />
          <span>{formatDate(announcement.created_at)}</span>
        </div>
        {announcement.seen_count != null && announcement.seen_count > 0 && (
          <span className="flex items-center gap-1 text-[10px] text-muted-foreground/50 font-medium">
            <Users className="w-3 h-3" />
            {announcement.seen_count} seen
          </span>
        )}
      </div>
      <h3 className="text-[17px] font-bold text-foreground tracking-tight mb-2">{announcement.title}</h3>
      <p className="text-[13px] text-muted-foreground leading-relaxed mb-4 line-clamp-3">{announcement.body}</p>
      {announcement.is_event && (
        <div className="flex items-center gap-3">
          <button className="flex-1 bg-[#F59E0B] hover:bg-[#E18D07] text-[#6D28D9] font-bold py-3 px-4 rounded-xl transition-colors text-[13px] tracking-wide shadow-lg shadow-[#F59E0B]/20">
            RSVP Now
          </button>
          <button className="py-3 px-4 rounded-xl border border-[#6D28D9]/12 text-[#6D28D9] font-semibold hover:bg-[#6D28D9]/4 transition-colors text-[13px]">
            Details
          </button>
        </div>
      )}
    </div>
  )
}

// ─── Chats Tab ──────────────────────────────────────────────────────────────

function ChatsTab({ userId }: { userId: string }) {
  const supabase = createClient()
  const [subTab, setSubTab] = useState<"church" | "my">("church")
  const [churchChats, setChurchChats] = useState<ChatGroup[]>([])
  const [myChats, setMyChats] = useState<ChatGroup[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      const { data } = await supabase
        .from("group_members")
        .select("groups(id, name, type)")
        .eq("user_id", userId)

      const all: ChatGroup[] = (data ?? [])
        .map((m: { groups: { id: string; name: string; type: string } | null }) => {
          if (!m.groups) return null
          return {
            id: m.groups.id,
            name: m.groups.name,
            type: m.groups.type,
            last_message: null,
            last_sender: null,
            last_message_time: null,
            unread_count: 0,
          }
        })
        .filter(Boolean) as ChatGroup[]

      setChurchChats(all.filter((g) => g.type === "church"))
      setMyChats(all.filter((g) => g.type !== "church"))
      setLoading(false)
    }
    load()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId])

  const active = subTab === "church" ? churchChats : myChats

  return (
    <div className="px-5 pt-14 pb-2">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-xl bg-[#6D28D9] flex items-center justify-center shadow-lg shadow-[#6D28D9]/20">
            <span className="text-[#F59E0B] font-bold text-base">C</span>
          </div>
          <span className="text-[#6D28D9] font-semibold text-lg tracking-tight">CENTRAL</span>
        </div>
      </div>

      {/* Sub-tab switcher */}
      <div className="flex items-center gap-1 bg-[#6D28D9]/6 rounded-xl p-1 mb-6">
        {(["church", "my"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setSubTab(t)}
            className={`flex-1 py-2 rounded-lg text-[12px] font-semibold transition-all ${
              subTab === t
                ? "bg-white text-[#6D28D9] shadow-sm shadow-[#6D28D9]/10"
                : "text-muted-foreground/60 hover:text-[#6D28D9]/70"
            }`}
          >
            {t === "church" ? "Church Chats" : "My Chats"}
          </button>
        ))}
      </div>

      {loading ? (
        <Spinner />
      ) : active.length === 0 ? (
        <EmptyState
          icon={<Users className="w-7 h-7" />}
          title={subTab === "church" ? "No church chats" : "No personal chats"}
          subtitle={
            subTab === "church"
              ? "You haven't been added to any church chats yet"
              : "Start a chat with someone from the directory"
          }
        />
      ) : (
        <div className="flex flex-col gap-3">
          {active.map((group) => (
            <ChatGroupCard key={group.id} group={group} />
          ))}
        </div>
      )}
    </div>
  )
}

function ChatGroupCard({ group }: { group: ChatGroup }) {
  return (
    <button className="w-full bg-white rounded-2xl border border-[#6D28D9]/8 p-4 shadow-[0_2px_16px_rgba(109,40,217,0.06)] hover:shadow-[0_4px_24px_rgba(109,40,217,0.1)] hover:border-[#6D28D9]/12 transition-all text-left">
      <div className="flex items-center gap-3.5">
        <Avatar className={`w-11 h-11 ${getAvatarColor(group.name)} shadow-md shadow-[#6D28D9]/15`}>
          <AvatarFallback className="text-white font-bold text-[11px] bg-transparent tracking-wide">
            {getInitials(group.name)}
          </AvatarFallback>
        </Avatar>
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between mb-1">
            <h3 className="font-semibold text-foreground text-[14px] truncate pr-2 tracking-tight">
              {group.name}
            </h3>
            {group.last_message_time && (
              <span className="text-[10px] text-muted-foreground/50 font-medium flex-shrink-0">
                {formatRelativeTime(group.last_message_time)}
              </span>
            )}
          </div>
          <div className="flex items-center justify-between gap-2">
            <p className="text-[12px] text-muted-foreground/60 truncate">
              {group.last_message
                ? group.last_sender
                  ? <><span className="font-medium text-muted-foreground">{group.last_sender}:</span> {group.last_message}</>
                  : group.last_message
                : "No messages yet"}
            </p>
            {group.unread_count > 0 && (
              <span className="w-5 h-5 bg-[#F59E0B] rounded-full text-[9px] font-bold text-[#6D28D9] flex items-center justify-center flex-shrink-0 shadow-sm shadow-[#F59E0B]/30">
                {group.unread_count}
              </span>
            )}
          </div>
        </div>
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
}

function DirectoryTab({ currentUserId }: { currentUserId: string }) {
  const supabase = createClient()
  const [members, setMembers] = useState<DirectoryMember[]>([])
  const [search, setSearch] = useState("")
  const [loading, setLoading] = useState(true)
  const [selected, setSelected] = useState<DirectoryMember | null>(null)

  useEffect(() => {
    async function load() {
      const { data } = await supabase
        .from("profiles")
        .select("id, name, graduation_year, role, email, about_me, bible_verse, prayer_request")
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

  return (
    <div className="px-5 pt-14 pb-2">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-xl bg-[#6D28D9] flex items-center justify-center shadow-lg shadow-[#6D28D9]/20">
            <span className="text-[#F59E0B] font-bold text-base">C</span>
          </div>
          <span className="text-[#6D28D9] font-semibold text-lg tracking-tight">CENTRAL</span>
        </div>
      </div>
      <h1 className="text-[22px] font-bold text-foreground tracking-tight mb-4">Directory</h1>

      {/* Search */}
      <div className="relative mb-6">
        <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground/40" />
        <input
          type="text"
          placeholder="Search members…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full pl-10 pr-4 py-3 rounded-xl bg-[#6D28D9]/4 text-[13px] placeholder:text-muted-foreground/40 text-foreground focus:outline-none focus:ring-2 focus:ring-[#6D28D9]/20 focus:bg-white border border-transparent focus:border-[#6D28D9]/12 transition-all"
        />
      </div>

      {loading ? (
        <Spinner />
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={<Users className="w-7 h-7" />}
          title="No members found"
          subtitle={search ? "Try a different name" : "No members in the directory yet"}
        />
      ) : (
        <div className="flex flex-col gap-3">
          {filtered.map((member) => (
            <button
              key={member.id}
              onClick={() => setSelected(member)}
              className="w-full bg-white rounded-2xl border border-[#6D28D9]/8 p-4 shadow-[0_2px_16px_rgba(109,40,217,0.06)] hover:shadow-[0_4px_24px_rgba(109,40,217,0.1)] hover:border-[#6D28D9]/12 transition-all text-left"
            >
              <div className="flex items-center gap-3.5">
                <Avatar className="w-11 h-11 bg-[#6D28D9] shadow-md shadow-[#6D28D9]/15">
                  <AvatarFallback className="text-white font-bold text-[11px] bg-transparent tracking-wide">
                    {getInitials(member.name)}
                  </AvatarFallback>
                </Avatar>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <h3 className="font-semibold text-foreground text-[14px] tracking-tight">{member.name}</h3>
                    {member.id === currentUserId && (
                      <span className="text-[9px] bg-[#6D28D9]/8 text-[#6D28D9] font-semibold px-1.5 py-0.5 rounded-full">You</span>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    {member.graduation_year && (
                      <span className="text-[11px] text-muted-foreground/60 font-medium">
                        Class of {member.graduation_year}
                      </span>
                    )}
                    {member.role && (
                      <span className="text-[10px] bg-[#6D28D9]/6 text-[#6D28D9] font-semibold px-2 py-0.5 rounded-full">
                        {member.role}
                      </span>
                    )}
                  </div>
                </div>
                <ChevronRight className="w-4 h-4 text-muted-foreground/30 flex-shrink-0" />
              </div>
            </button>
          ))}
        </div>
      )}

      {/* Member Detail Sheet */}
      {selected && (
        <MemberSheet member={selected} onClose={() => setSelected(null)} />
      )}
    </div>
  )
}

function MemberSheet({ member, onClose }: { member: DirectoryMember; onClose: () => void }) {
  return (
    <>
      <div
        className="fixed inset-0 bg-black/30 z-40 backdrop-blur-sm"
        onClick={onClose}
      />
      <div className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-[390px] bg-white rounded-t-3xl z-50 pb-10 shadow-2xl">
        {/* Pull handle */}
        <div className="flex justify-center pt-3 pb-4">
          <div className="w-10 h-1 rounded-full bg-muted-foreground/20" />
        </div>

        <div className="px-6">
          <div className="flex flex-col items-center mb-6">
            <Avatar className="w-20 h-20 bg-[#6D28D9] mb-4 shadow-lg shadow-[#6D28D9]/20">
              <AvatarFallback className="text-white font-bold text-2xl bg-transparent">
                {getInitials(member.name)}
              </AvatarFallback>
            </Avatar>
            <h2 className="text-[20px] font-bold text-foreground tracking-tight">{member.name}</h2>
            <div className="flex items-center gap-2 mt-2">
              {member.graduation_year && (
                <span className="text-[12px] text-muted-foreground/60">Class of {member.graduation_year}</span>
              )}
              {member.role && (
                <span className="text-[10px] bg-[#6D28D9]/8 text-[#6D28D9] font-semibold px-2.5 py-1 rounded-full uppercase tracking-wide">
                  {member.role}
                </span>
              )}
            </div>
          </div>

          {member.bible_verse && (
            <div className="bg-[#F59E0B]/8 rounded-xl p-4 mb-4">
              <p className="text-[10px] font-bold text-[#F59E0B] uppercase tracking-wider mb-1.5">Bible Verse</p>
              <p className="text-[13px] text-foreground/80 italic leading-relaxed">&ldquo;{member.bible_verse}&rdquo;</p>
            </div>
          )}

          {member.prayer_request && (
            <div className="bg-[#6D28D9]/4 rounded-xl p-4 mb-4">
              <p className="text-[10px] font-bold text-[#6D28D9] uppercase tracking-wider mb-1.5">Prayer Request</p>
              <p className="text-[13px] text-foreground/80 leading-relaxed">{member.prayer_request}</p>
            </div>
          )}

          {member.about_me && (
            <div className="bg-muted/40 rounded-xl p-4 mb-6">
              <p className="text-[10px] font-bold text-muted-foreground/60 uppercase tracking-wider mb-1.5">About</p>
              <p className="text-[13px] text-foreground/80 leading-relaxed">{member.about_me}</p>
            </div>
          )}

          <button className="w-full bg-[#6D28D9] hover:bg-[#5B21B6] text-white font-bold py-3.5 px-4 rounded-xl transition-colors text-[13px] tracking-wide shadow-lg shadow-[#6D28D9]/20">
            Send Message
          </button>
        </div>
      </div>
    </>
  )
}

// ─── Profile Tab ─────────────────────────────────────────────────────────────

function ProfileTab({
  userId,
  initialProfile,
  onLogout,
}: {
  userId: string
  initialProfile: Profile
  onLogout: () => void
}) {
  const supabase = createClient()
  const [profile, setProfile] = useState<Profile>(initialProfile)
  const [editing, setEditing] = useState(false)
  const [saving, setSaving] = useState(false)
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

  const fields = [
    { key: "about_me" as const, label: "About Me", placeholder: "Tell the community about yourself…" },
    { key: "bible_verse" as const, label: "Current Bible Verse", placeholder: "What verse are you meditating on?" },
    { key: "prayer_request" as const, label: "Prayer Request", placeholder: "Share what you'd like prayer for…" },
    { key: "pray_for_me" as const, label: "How to Pray for Me This Week", placeholder: "Specific ways others can intercede…" },
  ]

  return (
    <div className="px-5 pt-14 pb-2">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-xl bg-[#6D28D9] flex items-center justify-center shadow-lg shadow-[#6D28D9]/20">
            <span className="text-[#F59E0B] font-bold text-base">C</span>
          </div>
          <span className="text-[#6D28D9] font-semibold text-lg tracking-tight">CENTRAL</span>
        </div>
        <div className="flex items-center gap-2">
          {editing ? (
            <>
              <button
                onClick={cancelEdit}
                className="w-9 h-9 rounded-full bg-muted/60 flex items-center justify-center hover:bg-muted transition-colors"
              >
                <X className="w-4 h-4 text-muted-foreground" />
              </button>
              <button
                onClick={saveEdit}
                disabled={saving}
                className="flex items-center gap-1.5 bg-[#6D28D9] text-white text-[12px] font-bold px-4 py-2 rounded-full hover:bg-[#5B21B6] transition-colors disabled:opacity-60"
              >
                <Check className="w-3.5 h-3.5" />
                {saving ? "Saving…" : "Save"}
              </button>
            </>
          ) : (
            <button
              onClick={startEdit}
              className="flex items-center gap-1.5 bg-[#6D28D9]/8 text-[#6D28D9] text-[12px] font-bold px-4 py-2 rounded-full hover:bg-[#6D28D9]/12 transition-colors"
            >
              <Edit3 className="w-3.5 h-3.5" />
              Edit
            </button>
          )}
        </div>
      </div>

      {/* Avatar + Identity */}
      <div className="flex flex-col items-center mb-8">
        <Avatar className="w-20 h-20 bg-[#6D28D9] mb-4 shadow-lg shadow-[#6D28D9]/20">
          <AvatarFallback className="text-white font-bold text-2xl bg-transparent">
            {getInitials(profile.name)}
          </AvatarFallback>
        </Avatar>
        <h1 className="text-[22px] font-bold text-foreground tracking-tight">{profile.name}</h1>
        <div className="flex items-center gap-2.5 mt-2">
          {profile.graduation_year && (
            <span className="text-[12px] text-muted-foreground/60 font-medium">
              Class of {profile.graduation_year}
            </span>
          )}
          <span className="text-[10px] bg-[#6D28D9]/8 text-[#6D28D9] font-semibold px-2.5 py-1 rounded-full uppercase tracking-wide">
            {profile.role}
          </span>
        </div>
        <span className="text-[12px] text-muted-foreground/50 mt-1">{profile.email}</span>
      </div>

      {/* Editable Fields */}
      <div className="flex flex-col gap-4 mb-8">
        {fields.map(({ key, label, placeholder }) => (
          <div key={key} className="bg-white rounded-2xl border border-[#6D28D9]/8 p-4 shadow-[0_2px_16px_rgba(109,40,217,0.04)]">
            <p className="text-[10px] font-bold text-[#6D28D9] uppercase tracking-wider mb-2">{label}</p>
            {editing ? (
              <textarea
                value={draft[key]}
                onChange={(e) => setDraft((d) => ({ ...d, [key]: e.target.value }))}
                placeholder={placeholder}
                rows={3}
                className="w-full text-[13px] text-foreground/80 leading-relaxed bg-transparent resize-none focus:outline-none placeholder:text-muted-foreground/40"
              />
            ) : (
              <p className="text-[13px] text-foreground/70 leading-relaxed whitespace-pre-wrap">
                {profile[key] || (
                  <span className="text-muted-foreground/30 italic">{placeholder}</span>
                )}
              </p>
            )}
          </div>
        ))}
      </div>

      {/* Sign out */}
      <button
        onClick={onLogout}
        className="w-full flex items-center justify-center gap-2 py-3 rounded-xl border border-destructive/20 text-destructive text-[13px] font-semibold hover:bg-destructive/4 transition-colors"
      >
        <LogOut className="w-4 h-4" />
        Sign out
      </button>
    </div>
  )
}

// ─── HomeApp (root) ──────────────────────────────────────────────────────────

interface HomeAppProps {
  userId: string
  initialProfile: Profile
}

export function HomeApp({ userId, initialProfile }: HomeAppProps) {
  const supabase = createClient()
  const [activeTab, setActiveTab] = useState<Tab>("home")

  async function handleLogout() {
    await supabase.auth.signOut()
    window.location.href = "/login"
  }

  return (
    <div className="relative min-h-screen bg-[#FAFAFE] max-w-[390px] mx-auto">
      {/* Scrollable content area */}
      <div className="overflow-y-auto pb-28 min-h-screen">
        {activeTab === "home" && (
          <HomeTab
            profile={initialProfile}
            onSeeChats={() => setActiveTab("chats")}
            onSeeAnnouncements={() => setActiveTab("announcements")}
          />
        )}
        {activeTab === "announcements" && <AnnouncementsTab />}
        {activeTab === "chats" && <ChatsTab userId={userId} />}
        {activeTab === "directory" && <DirectoryTab currentUserId={userId} />}
        {activeTab === "profile" && (
          <ProfileTab
            userId={userId}
            initialProfile={initialProfile}
            onLogout={handleLogout}
          />
        )}
      </div>

      <BottomNav activeTab={activeTab} onTabChange={setActiveTab} />
    </div>
  )
}
