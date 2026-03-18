"use client"

import { useState, useEffect, useCallback, useRef } from "react"
import {
  Search, Calendar, ChevronRight, Edit3, Check, X,
  LogOut, Bell, Users, Plus, ImageIcon, CheckCircle2, ArrowLeft, Send,
} from "lucide-react"
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
}

interface Message {
  id: string
  group_id: string
  sender_id: string
  content: string
  created_at: string
  sender_name: string
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

function formatMessageTime(dateStr: string): string {
  return new Date(dateStr).toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  })
}

function audienceLabel(audience: string | null): string {
  if (!audience || audience === "all") return "Whole Church"
  if (audience.match(/^\d{4}$/)) return `Class of ${audience}`
  if (audience === "group") return "Specific Group"
  return audience
}

// ─── Shared Components ──────────────────────────────────────────────────────

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="text-[11px] font-semibold text-[#F59E0B] uppercase tracking-[0.1em] pl-2.5 border-l-2 border-[#F59E0B]">
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
          .map((m: { groups: { id: string; name: string; type: string } | { id: string; name: string; type: string }[] | null }) => {
            if (!m.groups) return null
            const g = Array.isArray(m.groups) ? m.groups[0] : m.groups
            if (!g) return null
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
          <span className="text-[#F59E0B] font-semibold text-lg tracking-tight">CENTRAL</span>
        </div>
        <button className="w-10 h-10 rounded-full bg-[#F59E0B]/10 flex items-center justify-center hover:bg-[#F59E0B]/20 transition-colors relative">
          <Bell className="w-[18px] h-[18px] text-[#F59E0B] stroke-[1.5px]" />
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
        <span className="mt-2 px-2.5 py-1 bg-[#F59E0B] text-white text-[10px] font-semibold rounded-full tracking-wide uppercase shadow-sm shadow-[#F59E0B]/30">
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
                className="text-[11px] text-[#F59E0B] font-semibold flex items-center gap-0.5 hover:opacity-70 transition-opacity"
              >
                View all <ChevronRight className="w-3.5 h-3.5" />
              </button>
            </div>

            {announcement ? (
              <div className="bg-white rounded-2xl border border-[#F59E0B]/15 p-5 shadow-[0_4px_24px_rgba(245,158,11,0.08)]">
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
                    className="py-3 px-4 rounded-xl border border-[#F59E0B]/25 text-[#F59E0B] font-semibold hover:bg-[#F59E0B]/8 transition-colors text-[13px]"
                  >
                    Details
                  </button>
                </div>
              </div>
            ) : (
              <div className="bg-white rounded-2xl border border-[#F59E0B]/15 p-5 text-center text-[13px] text-muted-foreground/50">
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

// ─── Create Announcement Modal ───────────────────────────────────────────────

const AUDIENCE_OPTIONS = [
  { value: "all", label: "Whole Church" },
  { value: "2025", label: "Class of 2025" },
  { value: "2026", label: "Class of 2026" },
  { value: "2027", label: "Class of 2027" },
  { value: "2028", label: "Class of 2028" },
  { value: "group", label: "Specific Group" },
]

interface CreateAnnouncementModalProps {
  userId: string
  onClose: () => void
  onSuccess: (ann: Announcement) => void
}

function CreateAnnouncementModal({ userId, onClose, onSuccess }: CreateAnnouncementModalProps) {
  const supabase = createClient()
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [title, setTitle] = useState("")
  const [body, setBody] = useState("")
  const [audience, setAudience] = useState("all")
  const [isEvent, setIsEvent] = useState(false)
  const [imageFile, setImageFile] = useState<File | null>(null)
  const [imagePreview, setImagePreview] = useState<string | null>(null)
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

    let imageUrl: string | null = null

    if (imageFile) {
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
      // If upload fails (e.g. bucket not set up), we proceed without the image
    }

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

  // Success screen
  if (success) {
    return (
      <div className="fixed inset-0 z-[100] bg-white flex flex-col items-center justify-center gap-4">
        <div className="w-16 h-16 rounded-full bg-[#F59E0B]/15 flex items-center justify-center">
          <CheckCircle2 className="w-8 h-8 text-[#F59E0B]" />
        </div>
        <div className="text-center">
          <p className="text-[16px] font-bold text-foreground">Announcement posted!</p>
          <p className="text-[13px] text-muted-foreground mt-1">Your announcement is now live.</p>
        </div>
      </div>
    )
  }

  return (
    <div className="fixed inset-0 z-[100] bg-white flex flex-col">
    <div className="max-w-[390px] mx-auto h-full flex flex-col w-full">

      {/* ── Top nav bar ── */}
      <div className="flex items-center gap-3 px-5 pt-12 pb-4 border-b border-[#F59E0B]/15 bg-white">
        <button
          onClick={onClose}
          className="w-9 h-9 rounded-full bg-muted/60 flex items-center justify-center hover:bg-muted transition-colors flex-shrink-0"
        >
          <ArrowLeft className="w-4 h-4 text-foreground" />
        </button>
        <h1 className="text-[17px] font-bold text-foreground tracking-tight">New Announcement</h1>
      </div>

      {/* ── Scrollable form fields ── */}
      <div className="flex-1 overflow-y-auto">
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
            <label className="text-[11px] font-bold text-[#6D28D9] uppercase tracking-wider">Title</label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Announcement title…"
              required
              className="w-full px-4 py-3 rounded-xl border border-[#F59E0B]/20 bg-[#F59E0B]/3 text-[14px] text-foreground placeholder:text-muted-foreground/40 focus:outline-none focus:ring-2 focus:ring-[#F59E0B]/20 focus:border-[#F59E0B]/40 transition-all"
            />
          </div>

          {/* Body */}
          <div className="flex flex-col gap-1.5">
            <label className="text-[11px] font-bold text-[#6D28D9] uppercase tracking-wider">Body</label>
            <textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder="Write the full announcement here…"
              required
              rows={5}
              className="w-full px-4 py-3 rounded-xl border border-[#F59E0B]/20 bg-[#F59E0B]/3 text-[14px] text-foreground placeholder:text-muted-foreground/40 focus:outline-none focus:ring-2 focus:ring-[#F59E0B]/20 focus:border-[#F59E0B]/40 transition-all resize-none"
            />
          </div>

          {/* Audience */}
          <div className="flex flex-col gap-2.5">
            <label className="text-[11px] font-bold text-[#6D28D9] uppercase tracking-wider">Audience</label>
            <div className="flex flex-wrap gap-2">
              {AUDIENCE_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setAudience(opt.value)}
                  className={`px-3 py-1.5 rounded-full text-[12px] font-semibold border transition-all ${
                    audience === opt.value
                      ? "bg-[#6D28D9] text-white border-[#6D28D9] shadow-md shadow-[#6D28D9]/20"
                      : "bg-white text-muted-foreground border-[#F59E0B]/20 hover:border-[#F59E0B]/40"
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          {/* Is Event toggle */}
          <div className="flex items-center justify-between bg-[#6D28D9]/4 rounded-xl px-4 py-3.5">
            <div>
              <p className="text-[13px] font-semibold text-foreground">This is an event</p>
              <p className="text-[11px] text-muted-foreground/60 mt-0.5">Shows an RSVP button on the card</p>
            </div>
            <button
              type="button"
              onClick={() => setIsEvent((v) => !v)}
              className={`relative w-11 h-6 rounded-full transition-colors duration-200 flex-shrink-0 ${
                isEvent ? "bg-[#6D28D9]" : "bg-muted-foreground/20"
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
            <label className="text-[11px] font-bold text-[#6D28D9] uppercase tracking-wider">
              Image{" "}
              <span className="text-muted-foreground/50 normal-case font-medium tracking-normal">(optional)</span>
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
                className="w-full h-24 rounded-xl border-2 border-dashed border-[#6D28D9]/20 flex flex-col items-center justify-center gap-2 text-muted-foreground/50 hover:border-[#F59E0B]/40 hover:text-[#F59E0B]/60 transition-all"
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
      <div className="bg-white border-t border-[#F59E0B]/15 px-5 py-4">
        <button
          type="submit"
          form="ann-form"
          disabled={submitting}
          className="w-full bg-[#F59E0B] hover:bg-[#E18D07] disabled:opacity-60 text-[#6D28D9] font-bold py-4 rounded-xl transition-colors text-[14px] tracking-wide shadow-lg shadow-[#F59E0B]/30"
        >
          {submitting ? "Posting…" : "Post Announcement"}
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
}

function AnnouncementsTab({ userId, userRole }: AnnouncementsTabProps) {
  const supabase = createClient()
  const [announcements, setAnnouncements] = useState<EnrichedAnnouncement[]>([])
  const [loading, setLoading] = useState(true)
  const [showCreate, setShowCreate] = useState(false)

  const isLeaderOrAdmin = ["leader", "admin"].includes(userRole.toLowerCase())

  const loadAnnouncements = useCallback(async () => {
    const { data: annData } = await supabase
      .from("announcements")
      .select("*")
      .order("is_pinned", { ascending: false })
      .order("created_at", { ascending: false })

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

  return (
    <div className="px-5 pt-14 pb-2">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-xl bg-[#6D28D9] flex items-center justify-center shadow-lg shadow-[#6D28D9]/20">
            <span className="text-[#F59E0B] font-bold text-base">C</span>
          </div>
          <span className="text-[#F59E0B] font-semibold text-lg tracking-tight">CENTRAL</span>
        </div>
      </div>
      <h1 className="text-[22px] font-bold text-foreground tracking-tight mb-6">Announcements</h1>

      {loading ? (
        <Spinner />
      ) : announcements.length === 0 ? (
        <EmptyState
          icon={<Bell className="w-7 h-7" />}
          title="No announcements yet"
          subtitle={isLeaderOrAdmin ? "Tap + to post the first one" : "Check back soon for updates"}
        />
      ) : (
        <div className="flex flex-col gap-4">
          {announcements.map((ann, idx) => (
            <AnnouncementCard
              key={ann.id}
              announcement={ann}
              isPinned={ann.is_pinned && idx === 0}
              userId={userId}
              onRsvpToggle={handleRsvpToggle}
            />
          ))}
        </div>
      )}

      {/* FAB — only for leaders/admins */}
      {isLeaderOrAdmin && (
        <button
          onClick={() => setShowCreate(true)}
          style={{
            position: "fixed",
            bottom: "6.5rem",
            right: "max(calc(50% - 195px + 16px), 16px)",
          }}
          className="w-14 h-14 bg-[#6D28D9] rounded-full shadow-xl shadow-[#6D28D9]/30 flex items-center justify-center z-40 hover:bg-[#5B21B6] active:scale-95 transition-all"
          aria-label="New announcement"
        >
          <Plus className="w-6 h-6 text-white" />
        </button>
      )}

      {/* Create modal */}
      {showCreate && (
        <CreateAnnouncementModal
          userId={userId}
          onClose={() => setShowCreate(false)}
          onSuccess={handleNewAnnouncement}
        />
      )}
    </div>
  )
}

// ─── Announcement Card ───────────────────────────────────────────────────────

interface AnnouncementCardProps {
  announcement: EnrichedAnnouncement
  isPinned: boolean
  userId: string
  onRsvpToggle: (id: string) => void
}

function AnnouncementCard({ announcement, isPinned, userId, onRsvpToggle }: AnnouncementCardProps) {
  const supabase = createClient()
  const [rsvping, setRsvping] = useState(false)

  async function handleRsvp() {
    if (announcement.user_has_rsvped || rsvping) return
    setRsvping(true)

    // Optimistic update immediately
    onRsvpToggle(announcement.id)

    await supabase.from("rsvps").upsert(
      { announcement_id: announcement.id, user_id: userId },
      { onConflict: "announcement_id,user_id" }
    )

    setRsvping(false)
  }

  return (
    <div className="bg-white rounded-2xl border border-[#F59E0B]/15 overflow-hidden shadow-[0_4px_24px_rgba(245,158,11,0.08)]">
      {/* Optional image */}
      {announcement.image_url && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={announcement.image_url}
          alt={announcement.title}
          className="w-full h-44 object-cover"
        />
      )}

      <div className="p-5">
        {isPinned && (
          <div className="flex items-center gap-1.5 mb-3">
            <div className="w-1.5 h-1.5 rounded-full bg-[#F59E0B]" />
            <span className="text-[10px] font-bold text-[#F59E0B] uppercase tracking-wider">Pinned</span>
          </div>
        )}

        {/* Meta row */}
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1.5 text-muted-foreground/60 text-[11px] font-medium">
              <Calendar className="w-3.5 h-3.5" />
              <span>{formatDate(announcement.created_at)}</span>
            </div>
            {announcement.audience && announcement.audience !== "all" && (
              <span className="text-[10px] bg-[#6D28D9]/6 text-[#6D28D9] font-semibold px-2 py-0.5 rounded-full">
                {audienceLabel(announcement.audience)}
              </span>
            )}
          </div>
          <div className="flex items-center gap-3">
            {announcement.view_count > 0 && (
              <span className="flex items-center gap-1 text-[10px] text-muted-foreground/50 font-medium">
                <Users className="w-3 h-3" />
                {announcement.view_count} seen
              </span>
            )}
          </div>
        </div>

        <h3 className="text-[17px] font-bold text-foreground tracking-tight mb-2">
          {announcement.title}
        </h3>
        <p className="text-[13px] text-muted-foreground leading-relaxed mb-4 line-clamp-3">
          {announcement.body}
        </p>

        {/* RSVP section */}
        {announcement.is_event && (
          <div className="flex items-center gap-3">
            <button
              onClick={handleRsvp}
              disabled={announcement.user_has_rsvped || rsvping}
              className={`flex-1 font-bold py-3 px-4 rounded-xl transition-all text-[13px] tracking-wide ${
                announcement.user_has_rsvped
                  ? "bg-[#6D28D9]/8 text-[#6D28D9] cursor-default"
                  : "bg-[#F59E0B] hover:bg-[#E18D07] text-[#6D28D9] shadow-lg shadow-[#F59E0B]/20 active:scale-[0.98]"
              }`}
            >
              {announcement.user_has_rsvped ? (
                <span className="flex items-center justify-center gap-1.5">
                  <Check className="w-3.5 h-3.5" />
                  You&apos;re going!
                </span>
              ) : (
                "RSVP Now"
              )}
            </button>

            {announcement.rsvp_count > 0 && (
              <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground/60 font-medium flex-shrink-0">
                <Users className="w-3.5 h-3.5" />
                <span>{announcement.rsvp_count} going</span>
              </div>
            )}
          </div>
        )}
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
  onClose: () => void
}

function ChatScreen({ groupId, groupName, userId, userName, onClose }: ChatScreenProps) {
  const supabase = createClient()
  const [messages, setMessages] = useState<Message[]>([])
  const [loading, setLoading] = useState(true)
  const [inputText, setInputText] = useState("")
  const [sending, setSending] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)
  const profilesCache = useRef<Record<string, string>>({ [userId]: userName })

  const scrollToBottom = useCallback((smooth = true) => {
    bottomRef.current?.scrollIntoView({ behavior: smooth ? "smooth" : "instant" })
  }, [])

  // Load last 50 messages
  useEffect(() => {
    async function loadMessages() {
      const { data } = await supabase
        .from("messages")
        .select("id, group_id, sender_id, content, created_at, profiles!sender_id(name)")
        .eq("group_id", groupId)
        .order("created_at", { ascending: true })
        .limit(50)

      if (data) {
        const enriched: Message[] = data.map((m: {
          id: string; group_id: string; sender_id: string; content: string; created_at: string;
          profiles: { name: string } | { name: string }[] | null
        }) => {
          const p = Array.isArray(m.profiles) ? m.profiles[0] : m.profiles
          const name = p?.name ?? "Unknown"
          profilesCache.current[m.sender_id] = name
          return { id: m.id, group_id: m.group_id, sender_id: m.sender_id, content: m.content, created_at: m.created_at, sender_name: name }
        })
        setMessages(enriched)
      }
      setLoading(false)
    }
    loadMessages()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [groupId])

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
          const raw = payload.new as { id: string; group_id: string; sender_id: string; content: string; created_at: string }
          // Skip own messages — handled optimistically
          if (raw.sender_id === userId) return

          let senderName = profilesCache.current[raw.sender_id]
          if (!senderName) {
            const { data: prof } = await supabase.from("profiles").select("name").eq("id", raw.sender_id).single()
            senderName = prof?.name ?? "Unknown"
            profilesCache.current[raw.sender_id] = senderName
          }
          setMessages((prev) => [...prev, { ...raw, sender_name: senderName }])
        }
      )
      .subscribe()

    return () => { supabase.removeChannel(channel) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [groupId, userId])

  // Auto-scroll on new messages
  useEffect(() => {
    scrollToBottom()
  }, [messages, scrollToBottom])

  async function handleSend() {
    const content = inputText.trim()
    if (!content || sending) return

    setSending(true)
    setInputText("")

    const optimisticId = `optimistic-${Date.now()}`
    const optimisticMsg: Message = {
      id: optimisticId,
      group_id: groupId,
      sender_id: userId,
      content,
      created_at: new Date().toISOString(),
      sender_name: userName,
    }
    setMessages((prev) => [...prev, optimisticMsg])

    const { data, error } = await supabase
      .from("messages")
      .insert({ group_id: groupId, sender_id: userId, content })
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

  return (
    <div className="fixed inset-0 z-[100] bg-[#FAFAFE] flex flex-col">
      {/* ── Top bar ── */}
      <div className="flex-shrink-0 flex items-center gap-3 px-4 pt-12 pb-3 bg-white border-b border-[#F59E0B]/15 shadow-sm">
        <button
          onClick={onClose}
          className="w-9 h-9 rounded-full bg-muted/60 flex items-center justify-center hover:bg-muted transition-colors flex-shrink-0"
        >
          <ArrowLeft className="w-4 h-4 text-foreground" />
        </button>
        <Avatar className={`w-9 h-9 flex-shrink-0 ${getAvatarColor(groupName)} shadow-md shadow-[#6D28D9]/15`}>
          <AvatarFallback className="text-white font-bold text-[11px] bg-transparent tracking-wide">
            {getInitials(groupName)}
          </AvatarFallback>
        </Avatar>
        <h2 className="flex-1 min-w-0 text-[15px] font-bold text-foreground tracking-tight truncate">
          {groupName}
        </h2>
      </div>

      {/* ── Messages area ── */}
      <div className="flex-1 overflow-y-auto px-4 py-5">
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
          <div className="flex flex-col gap-2">
            {messages.map((msg, i) => {
              const isOwn = msg.sender_id === userId
              const prevMsg = i > 0 ? messages[i - 1] : null
              const showSender = !isOwn && msg.sender_id !== prevMsg?.sender_id
              return (
                <div key={msg.id} className={`flex flex-col ${isOwn ? "items-end" : "items-start"}`}>
                  {showSender && (
                    <span className="text-[10px] font-semibold text-[#6D28D9]/60 mb-1 px-1">
                      {msg.sender_name}
                    </span>
                  )}
                  <div
                    className={`max-w-[78%] px-4 py-2.5 rounded-2xl text-[14px] leading-relaxed ${
                      isOwn
                        ? "bg-[#F59E0B] text-[#6D28D9] rounded-br-sm font-medium shadow-md shadow-[#F59E0B]/20"
                        : "bg-white border border-[#F59E0B]/15 text-foreground rounded-bl-sm shadow-sm"
                    }`}
                  >
                    {msg.content}
                  </div>
                  <span className="text-[10px] text-muted-foreground/40 mt-1 px-1">
                    {formatMessageTime(msg.created_at)}
                  </span>
                </div>
              )
            })}
            <div ref={bottomRef} />
          </div>
        )}
      </div>

      {/* ── Input bar ── */}
      <div className="flex-shrink-0 bg-white border-t border-[#F59E0B]/15 px-4 py-3 flex items-end gap-3">
        <textarea
          value={inputText}
          onChange={(e) => setInputText(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Message…"
          rows={1}
          className="flex-1 resize-none bg-[#F59E0B]/5 rounded-2xl px-4 py-2.5 text-[14px] text-foreground placeholder:text-muted-foreground/40 focus:outline-none focus:ring-2 focus:ring-[#F59E0B]/20 border border-[#F59E0B]/10 max-h-28 overflow-y-auto"
          style={{ lineHeight: "1.5" }}
        />
        <button
          onClick={handleSend}
          disabled={!inputText.trim() || sending}
          className="w-10 h-10 rounded-full bg-[#F59E0B] flex items-center justify-center flex-shrink-0 disabled:opacity-40 hover:bg-[#E18D07] transition-all shadow-md shadow-[#F59E0B]/25 active:scale-95"
        >
          <Send className="w-4 h-4 text-[#6D28D9]" />
        </button>
      </div>
    </div>
  )
}

// ─── Chats Tab ──────────────────────────────────────────────────────────────

function ChatsTab({ userId, userProfile }: { userId: string; userProfile: Profile }) {
  const supabase = createClient()
  const [subTab, setSubTab] = useState<"church" | "my">("church")
  const [churchChats, setChurchChats] = useState<ChatGroup[]>([])
  const [myChats, setMyChats] = useState<ChatGroup[]>([])
  const [loading, setLoading] = useState(true)
  const [openChat, setOpenChat] = useState<{ id: string; name: string } | null>(null)

  useEffect(() => {
    async function load() {
      const { data } = await supabase
        .from("group_members")
        .select("groups(id, name, type)")
        .eq("user_id", userId)

      const all: ChatGroup[] = (data ?? [])
        .map((m: { groups: { id: string; name: string; type: string } | { id: string; name: string; type: string }[] | null }) => {
          if (!m.groups) return null
          const g = Array.isArray(m.groups) ? m.groups[0] : m.groups
          if (!g) return null
          return {
            id: g.id,
            name: g.name,
            type: g.type,
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
          <span className="text-[#F59E0B] font-semibold text-lg tracking-tight">CENTRAL</span>
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
            <ChatGroupCard key={group.id} group={group} onClick={() => setOpenChat({ id: group.id, name: group.name })} />
          ))}
        </div>
      )}

      {openChat && (
        <ChatScreen
          groupId={openChat.id}
          groupName={openChat.name}
          userId={userId}
          userName={userProfile.name}
          onClose={() => setOpenChat(null)}
        />
      )}
    </div>
  )
}

function ChatGroupCard({ group, onClick }: { group: ChatGroup; onClick: () => void }) {
  return (
    <button onClick={onClick} className="w-full bg-white rounded-2xl border border-[#F59E0B]/15 p-4 shadow-[0_2px_16px_rgba(245,158,11,0.06)] hover:shadow-[0_4px_24px_rgba(245,158,11,0.1)] hover:border-[#F59E0B]/25 transition-all text-left">
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
                  ? (
                    <>
                      <span className="font-medium text-muted-foreground">{group.last_sender}:</span>{" "}
                      {group.last_message}
                    </>
                  )
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
          <span className="text-[#F59E0B] font-semibold text-lg tracking-tight">CENTRAL</span>
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
          className="w-full pl-10 pr-4 py-3 rounded-xl bg-[#F59E0B]/5 text-[13px] placeholder:text-muted-foreground/40 text-foreground focus:outline-none focus:ring-2 focus:ring-[#F59E0B]/20 focus:bg-white border border-transparent focus:border-[#F59E0B]/25 transition-all"
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
              className="w-full bg-white rounded-2xl border border-[#F59E0B]/15 p-4 shadow-[0_2px_16px_rgba(245,158,11,0.06)] hover:shadow-[0_4px_24px_rgba(245,158,11,0.1)] hover:border-[#F59E0B]/25 transition-all text-left"
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
                      <span className="text-[9px] bg-[#6D28D9]/8 text-[#6D28D9] font-semibold px-1.5 py-0.5 rounded-full">
                        You
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    {member.graduation_year && (
                      <span className="text-[11px] text-muted-foreground/60 font-medium">
                        Class of {member.graduation_year}
                      </span>
                    )}
                    {member.role && (
                      <span className="text-[10px] bg-[#F59E0B] text-white font-semibold px-2 py-0.5 rounded-full shadow-sm shadow-[#F59E0B]/30">
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
                <span className="text-[12px] text-muted-foreground/60">
                  Class of {member.graduation_year}
                </span>
              )}
              {member.role && (
                <span className="text-[10px] bg-[#F59E0B] text-white font-semibold px-2.5 py-1 rounded-full uppercase tracking-wide shadow-sm shadow-[#F59E0B]/30">
                  {member.role}
                </span>
              )}
            </div>
          </div>

          {member.bible_verse && (
            <div className="bg-[#F59E0B]/8 rounded-xl p-4 mb-4">
              <p className="text-[10px] font-bold text-[#F59E0B] uppercase tracking-wider mb-1.5">
                Bible Verse
              </p>
              <p className="text-[13px] text-foreground/80 italic leading-relaxed">
                &ldquo;{member.bible_verse}&rdquo;
              </p>
            </div>
          )}

          {member.prayer_request && (
            <div className="bg-[#6D28D9]/4 rounded-xl p-4 mb-4">
              <p className="text-[10px] font-bold text-[#6D28D9] uppercase tracking-wider mb-1.5">
                Prayer Request
              </p>
              <p className="text-[13px] text-foreground/80 leading-relaxed">{member.prayer_request}</p>
            </div>
          )}

          {member.about_me && (
            <div className="bg-muted/40 rounded-xl p-4 mb-6">
              <p className="text-[10px] font-bold text-muted-foreground/60 uppercase tracking-wider mb-1.5">
                About
              </p>
              <p className="text-[13px] text-foreground/80 leading-relaxed">{member.about_me}</p>
            </div>
          )}

          <button className="w-full bg-[#F59E0B] hover:bg-[#E18D07] text-[#6D28D9] font-bold py-3.5 px-4 rounded-xl transition-colors text-[13px] tracking-wide shadow-lg shadow-[#F59E0B]/25">
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
          <span className="text-[#F59E0B] font-semibold text-lg tracking-tight">CENTRAL</span>
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
                className="flex items-center gap-1.5 bg-[#F59E0B] text-[#6D28D9] text-[12px] font-bold px-4 py-2 rounded-full hover:bg-[#E18D07] transition-colors disabled:opacity-60 shadow-md shadow-[#F59E0B]/30"
              >
                <Check className="w-3.5 h-3.5" />
                {saving ? "Saving…" : "Save"}
              </button>
            </>
          ) : (
            <button
              onClick={startEdit}
              className="flex items-center gap-1.5 bg-[#F59E0B]/12 text-[#F59E0B] text-[12px] font-bold px-4 py-2 rounded-full hover:bg-[#F59E0B]/20 transition-colors"
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
          <span className="text-[10px] bg-[#F59E0B] text-white font-semibold px-2.5 py-1 rounded-full uppercase tracking-wide shadow-sm shadow-[#F59E0B]/30">
            {profile.role}
          </span>
        </div>
        <span className="text-[12px] text-muted-foreground/50 mt-1">{profile.email}</span>
      </div>

      {/* Editable Fields */}
      <div className="flex flex-col gap-4 mb-8">
        {fields.map(({ key, label, placeholder }) => (
          <div
            key={key}
            className="bg-white rounded-2xl border border-[#F59E0B]/15 p-4 shadow-[0_2px_16px_rgba(245,158,11,0.04)]"
          >
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
        {activeTab === "announcements" && (
          <AnnouncementsTab userId={userId} userRole={initialProfile.role} />
        )}
        {activeTab === "chats" && <ChatsTab userId={userId} userProfile={initialProfile} />}
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
