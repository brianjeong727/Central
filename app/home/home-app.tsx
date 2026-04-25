"use client"

import { useState, useEffect, useCallback, useRef, useMemo } from "react"
import {
  Search, Calendar, ChevronRight, ChevronDown, Edit3, Check, X,
  LogOut, Bell, Users, Plus, ImageIcon, CheckCircle2, ArrowLeft, Send, Settings,
  MoreHorizontal, Trash2, CornerUpLeft,
} from "lucide-react"
import { createClient } from "@/lib/supabase"
import { createGroup } from "@/app/actions/create-group"
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
  if (!audience || audience === "all") return "Whole Church"
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
  recentChats: ChatPreview[]
  onSeeChats: () => void
  onSeeAnnouncements: () => void
  onOpenChat: (id: string, name: string) => void
}

function HomeTab({ profile, recentChats, onSeeChats, onSeeAnnouncements, onOpenChat }: HomeTabProps) {
  const supabase = createClient()
  const [announcement, setAnnouncement] = useState<Announcement | null>(null)
  const [loading, setLoading] = useState(true)
  const [userHasRsvped, setUserHasRsvped] = useState(false)
  const [rsvping, setRsvping] = useState(false)

  useEffect(() => {
    async function load() {
      const { data: ann } = await supabase
        .from("announcements")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle()
      if (ann) {
        setAnnouncement(ann)
        if (ann.is_event) {
          const { data: rsvpData } = await supabase
            .from("rsvps")
            .select("announcement_id")
            .eq("announcement_id", ann.id)
            .eq("user_id", profile.id)
            .maybeSingle()
          setUserHasRsvped(!!rsvpData)
        }
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

  return (
    <div className="px-5 pt-14 pb-2">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-2.5">
          <svg width="26" height="26" viewBox="0 0 100 100" fill="none">
            <circle cx="50" cy="50" r="44" stroke="#3E1540" strokeWidth="6" />
            <rect x="47" y="22" width="6" height="56" fill="#3E1540" />
            <rect x="22" y="47" width="56" height="6" fill="#3E1540" />
          </svg>
          <span style={{ fontFamily: "var(--font-instrument-serif)", fontSize: "28px", color: "#13101A", letterSpacing: "-0.01em", lineHeight: 1 }}>Central</span>
        </div>
        <button className="size-9 bg-[#FBF8F2] rounded-xl border border-[#ECE8DE] flex items-center justify-center hover:bg-[#F2EDE0] transition-colors relative">
          <Bell className="size-4 text-[#13101A] stroke-[1.5px]" />
          <span className="absolute top-1.5 right-1.5 size-2 bg-[#C9A34B] rounded-full" />
        </button>
      </div>

      {loading ? (
        <Spinner />
      ) : (
        <div className="flex flex-col gap-8">
          {/* Latest Announcement */}
          <section>
            <div className="flex items-center justify-between mb-3">
              <SectionLabel>Latest Announcement</SectionLabel>
              <button
                onClick={onSeeAnnouncements}
                className="text-[13px] text-[#5A5466] font-medium flex items-center gap-0.5 hover:text-[#3E1540] transition-colors"
              >
                See all <ChevronRight className="w-3.5 h-3.5" />
              </button>
            </div>

            {announcement ? (
              <div className="rounded-[22px] bg-[#3E1540] px-6 py-6 text-[#F6F4EF] relative overflow-hidden shadow-[0_2px_8px_rgba(19,16,26,0.08)]">
                <div className="absolute -top-[90px] -right-[90px] w-[260px] h-[260px] rounded-full bg-[radial-gradient(circle,rgba(201,163,75,0.33)_0%,transparent_70%)]" />
                <div className="relative">
                  <div className="flex items-center gap-2 mb-3">
                    <span className="text-[10px] font-bold tracking-[.22em] uppercase text-[#9E85A0]">
                      {announcement.is_event ? "Up Next" : "Latest"}
                    </span>
                    {announcement.is_event && (
                      <span className="px-2 py-0.5 bg-[#C9A34B] text-[#13101A] rounded-full text-[9px] font-bold tracking-[.14em] uppercase">
                        Event
                      </span>
                    )}
                  </div>
                  <h3 style={{ fontFamily: "var(--font-instrument-serif)", fontSize: "36px", lineHeight: 1, letterSpacing: "-0.02em", color: "#F6F4EF", margin: "0 0 10px" }}>
                    {announcement.title}
                  </h3>
                  <p className="text-[13px] text-[#CFB8D1] leading-relaxed mb-5 line-clamp-2">
                    {announcement.body}
                  </p>
                  <div className="flex items-center gap-4">
                    {announcement.is_event && (
                      <button
                        onClick={handleHomeRsvp}
                        disabled={userHasRsvped || rsvping}
                        className={`font-bold py-3 px-7 rounded-full text-[14px] transition-colors ${
                          userHasRsvped
                            ? "bg-white/20 text-[#F6F4EF] cursor-default"
                            : "bg-[#F6F4EF] text-[#3E1540] hover:bg-white"
                        }`}
                      >
                        {userHasRsvped ? (
                          <span className="flex items-center gap-1.5">
                            <Check className="w-3.5 h-3.5" />
                            You&apos;re going!
                          </span>
                        ) : (
                          "RSVP"
                        )}
                      </button>
                    )}
                    <button
                      onClick={onSeeAnnouncements}
                      className="text-[13px] text-[#9E85A0] font-medium hover:text-[#CFB8D1] transition-colors"
                    >
                      {announcement.is_event ? "Details" : "View details →"}
                    </button>
                  </div>
                </div>
              </div>
            ) : (
              <div className="rounded-[22px] bg-[#3E1540] px-6 py-6 text-center text-[13px] text-[#9E85A0] italic">
                No announcements yet
              </div>
            )}
          </section>

          {/* Recent Chats */}
          {top3.length > 0 && (
            <ChatsSection
              chats={top3}
              totalUnread={totalUnread}
              onSeeAll={onSeeChats}
              onOpenChat={onOpenChat}
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
  existing?: Announcement
  onClose: () => void
  onSuccess: (ann: Announcement) => void
}

function CreateAnnouncementModal({ userId, existing, onClose, onSuccess }: CreateAnnouncementModalProps) {
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
      <div className="fixed inset-0 z-[100] bg-white flex flex-col items-center justify-center gap-4">
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
    <div className="fixed inset-0 z-[100] bg-white flex flex-col">
    <div className="max-w-[390px] mx-auto h-full flex flex-col w-full">

      {/* ── Top nav bar ── */}
      <div className="flex items-center gap-3 px-5 pt-12 pb-4 border-b border-[#ECE8DE] bg-white">
        <button
          onClick={onClose}
          className="w-9 h-9 rounded-full bg-muted/60 flex items-center justify-center hover:bg-muted transition-colors flex-shrink-0"
        >
          <ArrowLeft className="w-4 h-4 text-foreground" />
        </button>
        <h1 className="text-[17px] font-bold text-foreground tracking-tight">
          {isEditing ? "Edit Announcement" : "New Announcement"}
        </h1>
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
            <label className="text-[11px] font-bold text-[#3E1540] uppercase tracking-wider">Title</label>
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
            <label className="text-[11px] font-bold text-[#3E1540] uppercase tracking-wider">Body</label>
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
            <label className="text-[11px] font-bold text-[#3E1540] uppercase tracking-wider">Audience</label>
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
            <label className="text-[11px] font-bold text-[#3E1540] uppercase tracking-wider">
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
}

function AnnouncementsTab({ userId, userRole, userGradYear }: AnnouncementsTabProps) {
  const supabase = createClient()
  const [announcements, setAnnouncements] = useState<EnrichedAnnouncement[]>([])
  const [loading, setLoading] = useState(true)
  const [showCreate, setShowCreate] = useState(false)
  const [editingAnn, setEditingAnn] = useState<EnrichedAnnouncement | null>(null)

  const isLeaderOrAdmin = ["leader", "admin"].includes(userRole.toLowerCase())

  const loadAnnouncements = useCallback(async () => {
    let annQuery = supabase
      .from("announcements")
      .select("*")
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

  function handleEditSuccess(updated: Announcement) {
    setAnnouncements((prev) =>
      prev.map((ann) =>
        ann.id === updated.id ? { ...ann, ...updated } : ann
      )
    )
  }

  return (
    <div className="px-5 pt-14 pb-2">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div className="flex items-center gap-2.5">
          <svg width="26" height="26" viewBox="0 0 100 100" fill="none">
            <circle cx="50" cy="50" r="44" stroke="#3E1540" strokeWidth="6" />
            <rect x="47" y="22" width="6" height="56" fill="#3E1540" />
            <rect x="22" y="47" width="56" height="6" fill="#3E1540" />
          </svg>
          <span style={{ fontFamily: "var(--font-instrument-serif)", fontSize: "28px", color: "#13101A", letterSpacing: "-0.01em", lineHeight: 1 }}>Central</span>
        </div>
      </div>
      <h1 style={{ fontFamily: "var(--font-instrument-serif)", fontSize: "36px", fontWeight: 400, letterSpacing: "-0.02em", color: "#13101A", marginBottom: "24px", lineHeight: 1.05 }}>Announcements</h1>

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
              userRole={userRole}
              onRsvpToggle={handleRsvpToggle}
              onEdit={(a) => setEditingAnn(a)}
              onDelete={handleDeleteAnnouncement}
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
          className="w-12 h-12 bg-[#3E1540] rounded-2xl flex items-center justify-center z-40 hover:bg-[#2D0F2E] active:scale-95 transition-all"
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

      {/* Edit modal */}
      {editingAnn && (
        <CreateAnnouncementModal
          userId={userId}
          existing={editingAnn}
          onClose={() => setEditingAnn(null)}
          onSuccess={(updated) => {
            handleEditSuccess(updated)
            setEditingAnn(null)
          }}
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
    <div className="fixed inset-0 z-50 bg-white flex flex-col">
    <div className="max-w-[390px] mx-auto w-full h-full flex flex-col">

      {/* Header — never grows/shrinks, sits at top */}
      <div className="flex-shrink-0 flex items-center gap-3 px-5 pt-12 pb-4 bg-white border-b border-[#ECE8DE]">
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
        <div className="flex items-center gap-1.5 text-[11px] text-[#C4C4C4] mb-4">
          <Calendar className="w-3 h-3 flex-shrink-0" />
          <span>{formattedDate}</span>
        </div>
        <h1 className="text-2xl font-bold text-[#13101A] tracking-tight leading-tight mb-4">
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
              "RSVP Now"
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
        <p className="text-[13px] text-[#CFB8D1] leading-relaxed line-clamp-3 mb-1">
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
  groupType: "my" | "church"
  onClose: () => void
  onCreated: (group: { id: string; name: string }) => void
}

function CreateChatScreen({ userId, userName, groupType, onClose, onCreated }: CreateChatScreenProps) {
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
    <div className="fixed inset-0 z-[100] bg-white flex flex-col">
      <div className="max-w-[390px] mx-auto w-full h-full flex flex-col">

        {/* Top nav */}
        <div className="flex-shrink-0 flex items-center gap-3 px-5 pt-12 pb-4 border-b border-[#ECE8DE] bg-white">
          <button
            onClick={onClose}
            className="size-8 bg-[#FBF8F2] rounded-full flex items-center justify-center hover:bg-[#F2EDE0] transition-colors flex-shrink-0"
          >
            <ArrowLeft className="w-4 h-4 text-foreground" />
          </button>
          <h1 className="text-[17px] font-bold text-foreground tracking-tight">
            {groupType === "church" ? "New Church Chat" : "New Chat"}
          </h1>
        </div>

        {/* Scrollable body */}
        <div className="flex-1 overflow-y-auto px-5 py-5 flex flex-col gap-5">
          {error && (
            <div className="rounded-xl bg-red-50 border border-red-200 px-4 py-3 text-[13px] text-red-600 font-medium">
              {error}
            </div>
          )}

          {/* Chat name */}
          <div className="flex flex-col gap-1.5">
            <label className="text-[11px] font-bold text-[#3E1540] uppercase tracking-wider">Chat Name</label>
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
            <label className="text-[11px] font-bold text-[#3E1540] uppercase tracking-wider">
              Add Members
              {selectedMembers.length > 0 && (
                <span className="ml-2 text-[#3E1540] font-bold">{selectedMembers.length} selected</span>
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
      <div className="fixed inset-0 z-[110] bg-[#FBF8F2] flex flex-col">
      <div className="max-w-[390px] mx-auto w-full h-full flex flex-col">
        <div className="flex-shrink-0 flex items-center gap-3 px-4 pt-12 pb-3 bg-white border-b border-[#ECE8DE]">
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
    <div className="fixed inset-0 z-[110] bg-[#FBF8F2] flex flex-col">
    <div className="max-w-[390px] mx-auto w-full h-full flex flex-col">
      {/* Header */}
      <div className="flex-shrink-0 flex items-center gap-3 px-4 pt-12 pb-3 bg-white border-b border-[#ECE8DE]">
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
          <div className="flex items-center gap-2 mb-4">
            <div className="w-0.5 h-3 bg-[#3E1540] rounded-full" />
            <span className="text-[10px] font-semibold tracking-[0.15em] uppercase text-[#9CA3AF]">Chat Info</span>
          </div>

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
            <div className="flex items-center gap-2 mb-4">
              <div className="w-0.5 h-3 bg-[#3E1540] rounded-full" />
              <span className="text-[10px] font-semibold tracking-[0.15em] uppercase text-[#9CA3AF]">Manage Chat</span>
            </div>
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
                className="w-full flex items-center justify-center gap-2 py-3.5 rounded-xl bg-white text-red-500 font-semibold text-[13px] mb-3 hover:bg-red-50 transition-colors border border-red-200 active:scale-98"
              >
                Archive Chat
              </button>
            )}
            {canLeave && (
              <button
                onClick={handleLeave}
                className="w-full flex items-center justify-center gap-2 py-3.5 rounded-xl bg-white text-red-500 font-semibold text-[13px] hover:bg-red-50 transition-colors border border-red-200 active:scale-98"
              >
                Leave Chat
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
}

function ChatScreen({ groupId, groupName, userId, userName, userRole, onClose, onRead }: ChatScreenProps) {
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
    longPressFiredRef.current = false
    longPressTimer.current = setTimeout(() => {
      longPressFiredRef.current = true
      longPressTimer.current = null
      setReplyingTo(msg)
    }, 400)
  }

  function handlePointerUp(msg: Message) {
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
    <div className="fixed inset-0 z-[100] bg-[#FBF8F2] flex flex-col">
    <div className="max-w-[390px] mx-auto w-full h-full flex flex-col">
      {/* ── Top bar ── */}
      <div className="flex-shrink-0 flex items-center gap-3 px-4 pt-12 pb-3 bg-white border-b border-[#ECE8DE]">
        <button
          onClick={onClose}
          className="size-8 bg-[#FBF8F2] rounded-full flex items-center justify-center hover:bg-[#F2EDE0] transition-colors flex-shrink-0"
        >
          <ArrowLeft className="w-4 h-4 text-[#6B7280]" />
        </button>
        <Avatar className={`w-9 h-9 flex-shrink-0 rounded-full ${getAvatarColor(displayName)}`}>
          <AvatarFallback className="text-white font-bold text-[13px] bg-transparent">
            {getInitials(displayName)}
          </AvatarFallback>
        </Avatar>
        <h2 className="flex-1 min-w-0 text-[15px] font-semibold text-[#13101A] truncate">
          {displayName}
        </h2>
        <button
          onClick={() => setShowSettings(true)}
          className="size-8 bg-[#FBF8F2] rounded-full flex items-center justify-center hover:bg-[#F2EDE0] transition-colors flex-shrink-0"
        >
          <Settings className="w-4 h-4 text-[#6B7280]" />
        </button>
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
              const rxGroups = groupedReactions(msg.id)
              return (
                <div
                  key={msg.id}
                  ref={(el) => { messageRefs.current[msg.id] = el }}
                  className={`flex flex-col relative ${isOwn ? "items-end" : "items-start"}`}
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

                  {showSender && (
                    <span className="text-[11px] font-medium text-[#3E1540] mb-1 px-1">
                      {msg.sender_name}
                    </span>
                  )}
                  <div
                    onPointerDown={() => handlePointerDown(msg)}
                    onPointerUp={() => handlePointerUp(msg)}
                    onPointerLeave={handlePointerCancel}
                    onPointerCancel={handlePointerCancel}
                    className={`max-w-[78%] rounded-2xl text-[14px] leading-relaxed select-none ${
                      isOwn
                        ? "bg-[#3E1540] text-white rounded-tr-sm"
                        : "bg-white border border-[#EFEFEF] text-[#13101A] rounded-tl-sm shadow-[0_1px_2px_rgba(0,0,0,0.04)]"
                    } ${msg.reply_to_id ? "" : "px-4 py-2.5"}`}
                  >
                    {msg.reply_to_id && msg.reply_to_content && (
                      <div className="px-3 pt-3 pb-0.5">
                        <button
                          onPointerDown={(e) => e.stopPropagation()}
                          onClick={() => scrollToMessage(msg.reply_to_id!)}
                          className={`w-full text-left px-3 py-2 rounded-[6px] flex flex-col gap-0.5 ${
                            isOwn
                              ? "bg-white/20 border-l-[3px] border-white/40"
                              : "bg-[#FBF8F2] border-l-[3px] border-[#3E1540]"
                          }`}
                        >
                          <span className={`text-[11px] font-semibold flex items-center gap-1 ${isOwn ? "text-white/80" : "text-[#3E1540]"}`}>
                            <CornerUpLeft className="w-3 h-3" />
                            {msg.reply_to_sender}
                          </span>
                          <span className={`text-[12px] truncate ${isOwn ? "text-white/60" : "text-[#9CA3AF]"}`}>
                            {msg.reply_to_content.slice(0, 80)}
                          </span>
                        </button>
                      </div>
                    )}
                    <div className={msg.reply_to_id ? "px-4 py-2.5" : ""}>
                      {msg.content}
                    </div>
                  </div>

                  {/* Reaction pills */}
                  {rxGroups.length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-1 px-1">
                      {rxGroups.map(({ emoji, count, userReacted }) => (
                        <button
                          key={emoji}
                          onPointerDown={(e) => e.stopPropagation()}
                          onClick={() => handleReact(msg.id, emoji)}
                          className={`flex items-center gap-0.5 px-2 py-0.5 rounded-full text-[12px] border transition-all active:scale-95 ${
                            userReacted
                              ? "bg-[#F3EDE6] border-[#3E1540]"
                              : "bg-white border-[#EFEFEF]"
                          }`}
                        >
                          <span>{emoji}</span>
                          <span className={`text-[11px] font-medium ${userReacted ? "text-[#3E1540]" : "text-[#6B7280]"}`}>
                            {count}
                          </span>
                        </button>
                      ))}
                    </div>
                  )}

                  <div className="flex items-center gap-1.5 mt-1 px-1">
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
      {/* Overlay to dismiss emoji picker — inside z-[100] stacking context so picker at z-[160] sits above it */}
      {emojiPickerFor && (
        <div
          className="fixed inset-0 z-[155]"
          onClick={() => setEmojiPickerFor(null)}
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
  onOpenChat: (id: string, name: string) => void
  onTotalUnreadChange: (count: number) => void
  refreshKey: number
}

function ChatsTab({ userId, userProfile, userRole, onOpenChat, onTotalUnreadChange, refreshKey }: ChatsTabProps) {
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

  return (
    <div className="px-5 pt-14 pb-2">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-2.5">
          <svg width="26" height="26" viewBox="0 0 100 100" fill="none">
            <circle cx="50" cy="50" r="44" stroke="#3E1540" strokeWidth="6" />
            <rect x="47" y="22" width="6" height="56" fill="#3E1540" />
            <rect x="22" y="47" width="56" height="6" fill="#3E1540" />
          </svg>
          <span style={{ fontFamily: "var(--font-instrument-serif)", fontSize: "28px", color: "#13101A", letterSpacing: "-0.01em", lineHeight: 1 }}>Central</span>
        </div>
      </div>

      {/* Sub-tab switcher */}
      <div className="flex items-center gap-1 bg-[#FBF8F2] rounded-xl p-1 mb-5">
        {(["church", "my"] as const).map((t) => (
          <button
            key={t}
            onClick={() => { setSubTab(t); setSearch("") }}
            className={`flex-1 py-2 rounded-lg text-[12px] font-semibold transition-all ${
              subTab === t
                ? "bg-white text-[#3E1540] shadow-sm"
                : "text-[#9CA3AF] hover:text-[#3E1540]/70"
            }`}
          >
            {t === "church" ? "Church Chats" : "My Chats"}
          </button>
        ))}
      </div>

      {/* Search bar */}
      <div className="relative mb-4">
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
        <h3 style={{ fontFamily: "var(--font-instrument-serif)", fontSize: "26px", color: "#13101A", fontWeight: 400, letterSpacing: "-0.01em", lineHeight: 1, margin: 0 }}>
          {subTab === "church" ? "Church chats" : "My chats"}
        </h3>
        {showPlusButton && (
          <button
            onClick={() => setShowCreateChat(subTab)}
            className="size-8 rounded-xl bg-[#3E1540] flex items-center justify-center hover:bg-[#2D0F2E] active:scale-95 transition-all"
          >
            <Plus className="w-4 h-4 text-white" />
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
        <div className="flex flex-col gap-2.5">
          {active.map((group) => (
            <ChatGroupCard key={group.id} group={group} onClick={() => onOpenChat(group.id, group.name)} />
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
          groupType={showCreateChat}
          onClose={() => setShowCreateChat(null)}
          onCreated={(group) => {
            setShowCreateChat(null)
            onOpenChat(group.id, group.name)
          }}
        />
      )}
    </div>
  )
}

function ChatGroupCard({ group, onClick }: { group: ChatGroup; onClick: () => void }) {
  const avatarBg = getAvatarColor(group.name) === "bg-[#3E1540]" ? "#3E1540" : "#13101A"
  const firstInitial = group.name.charAt(0)

  return (
    <button onClick={onClick} className="w-full bg-[#FBF8F2] border border-[#ECE8DE] rounded-[18px] p-4 hover:bg-[#F5F0E8] transition-colors text-left">
      <div className="flex items-center gap-3.5">
        <Avatar className="w-12 h-12 flex-shrink-0" style={{ background: avatarBg, borderRadius: "16px" }}>
          <AvatarFallback
            className="text-[#F6F4EF] bg-transparent"
            style={{ fontFamily: "var(--font-instrument-serif)", fontSize: "22px", fontWeight: 400 }}
          >
            {firstInitial}
          </AvatarFallback>
        </Avatar>
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between mb-1">
            <h3 className="text-[15px] font-semibold text-[#13101A] truncate pr-2">
              {group.name}
            </h3>
            {group.last_message_time && (
              <span className="text-[11px] text-[#8A8497] flex-shrink-0">
                {formatRelativeTime(group.last_message_time)}
              </span>
            )}
          </div>
          <div className="flex items-center justify-between gap-2">
            <p className="text-[13px] text-[#5A5466] truncate">
              {group.last_message
                ? group.last_sender
                  ? (
                    <>
                      <span className="font-semibold text-[#5A5466]">{group.last_sender}:</span>{" "}
                      {group.last_message}
                    </>
                  )
                  : group.last_message
                : <span className="italic text-[#8A8497]">No messages yet</span>}
            </p>
            {group.unread_count > 0 && (
              <span className="w-6 h-6 bg-[#C9A34B] rounded-full text-[11px] font-bold text-[#13101A] flex items-center justify-center flex-shrink-0">
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
  pray_for_me: string | null
}

function DirectoryTab({ currentUserId, currentUserName, onOpenChat }: { currentUserId: string; currentUserName: string; onOpenChat: (id: string, name: string) => void }) {
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
          <svg width="26" height="26" viewBox="0 0 100 100" fill="none">
            <circle cx="50" cy="50" r="44" stroke="#3E1540" strokeWidth="6" />
            <rect x="47" y="22" width="6" height="56" fill="#3E1540" />
            <rect x="22" y="47" width="56" height="6" fill="#3E1540" />
          </svg>
          <span style={{ fontFamily: "var(--font-instrument-serif)", fontSize: "28px", color: "#13101A", letterSpacing: "-0.01em", lineHeight: 1 }}>Central</span>
        </div>
      </div>
      <h1 style={{ fontFamily: "var(--font-instrument-serif)", fontSize: "36px", fontWeight: 400, letterSpacing: "-0.02em", color: "#13101A", marginBottom: "16px", lineHeight: 1.05 }}>Directory</h1>

      {/* Search */}
      <div className="relative mb-6">
        <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-[#C4C4C4]" />
        <input
          type="text"
          placeholder="Search members…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full pl-10 pr-4 py-3 rounded-xl bg-[#FBF8F2] border border-[#EFEFEF] text-[13px] placeholder:text-[#C4C4C4] text-[#13101A] focus:outline-none focus:ring-2 focus:ring-[#3E1540]/20 focus:border-[#3E1540]/30 transition-all"
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
              className="w-full bg-white rounded-2xl border border-[#EFEFEF] p-4 shadow-[0_1px_3px_rgba(0,0,0,0.06)] hover:shadow-[0_2px_8px_rgba(0,0,0,0.08)] transition-all text-left"
            >
              <div className="flex items-center gap-3.5">
                <Avatar className="w-11 h-11 bg-[#3E1540]">
                  <AvatarFallback className="text-white font-bold text-[11px] bg-transparent tracking-wide">
                    {getInitials(member.name)}
                  </AvatarFallback>
                </Avatar>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <h3 className="font-semibold text-foreground text-[14px] tracking-tight">{member.name}</h3>
                    {member.id === currentUserId && (
                      <span className="text-[10px] bg-[#FBF8F2] text-[#9CA3AF] font-semibold px-2.5 py-0.5 rounded-full uppercase tracking-wide">
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
                      <span className={`text-[10px] font-semibold px-2.5 py-0.5 rounded-full uppercase tracking-wide ${member.role.toLowerCase() === "admin" || member.role.toLowerCase() === "leader" ? "bg-[#3E1540] text-white" : "bg-[#F3EDE6] text-[#5B21B6]"}`}>
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
    <div className="fixed inset-0 z-[60] bg-white flex flex-col">
      <div className="max-w-[390px] mx-auto w-full h-full flex flex-col">

        {/* Header */}
        <div className="flex-shrink-0 flex items-center gap-3 px-4 pt-12 pb-3 bg-white border-b border-[#ECE8DE]">
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
                <p className="text-[10px] font-semibold tracking-[0.12em] uppercase text-[#3E1540] mb-2">
                  Bible Verse
                </p>
                <p className="text-[13px] text-[#374151] italic leading-relaxed">
                  &ldquo;{member.bible_verse}&rdquo;
                </p>
              </div>
            )}

            {member.prayer_request && (
              <div className="bg-white rounded-2xl p-5 border border-[#EFEFEF] shadow-[0_1px_3px_rgba(0,0,0,0.06)]">
                <p className="text-[10px] font-semibold tracking-[0.12em] uppercase text-[#3E1540] mb-2">
                  Prayer Request
                </p>
                <p className="text-[13px] text-[#374151] leading-relaxed">{member.prayer_request}</p>
              </div>
            )}

            {member.pray_for_me && (
              <div className="bg-white rounded-2xl p-5 border border-[#EFEFEF] shadow-[0_1px_3px_rgba(0,0,0,0.06)]">
                <p className="text-[10px] font-semibold tracking-[0.12em] uppercase text-[#3E1540] mb-2">
                  How to Pray for Me
                </p>
                <p className="text-[13px] text-[#374151] leading-relaxed">{member.pray_for_me}</p>
              </div>
            )}

            {member.about_me && (
              <div className="bg-white rounded-2xl p-5 border border-[#EFEFEF] shadow-[0_1px_3px_rgba(0,0,0,0.06)]">
                <p className="text-[10px] font-semibold tracking-[0.12em] uppercase text-[#3E1540] mb-2">
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
          <svg width="26" height="26" viewBox="0 0 100 100" fill="none">
            <circle cx="50" cy="50" r="44" stroke="#3E1540" strokeWidth="6" />
            <rect x="47" y="22" width="6" height="56" fill="#3E1540" />
            <rect x="22" y="47" width="56" height="6" fill="#3E1540" />
          </svg>
          <span style={{ fontFamily: "var(--font-instrument-serif)", fontSize: "28px", color: "#13101A", letterSpacing: "-0.01em", lineHeight: 1 }}>Central</span>
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
                className="flex items-center gap-1.5 bg-[#3E1540] text-white text-[12px] font-bold px-4 py-2 rounded-full hover:bg-[#2D0F2E] transition-colors disabled:opacity-60 shadow-md shadow-[#3E1540]/30"
              >
                <Check className="w-3.5 h-3.5" />
                {saving ? "Saving…" : "Save"}
              </button>
            </>
          ) : (
            <button
              onClick={startEdit}
              className="flex items-center gap-1.5 bg-[#FBF8F2] border border-[#EFEFEF] text-[#3E1540] text-[13px] font-medium px-4 py-1.5 rounded-full hover:bg-[#F2EDE0] transition-colors"
            >
              <Edit3 className="w-3.5 h-3.5" />
              Edit
            </button>
          )}
        </div>
      </div>

      {/* Avatar + Identity */}
      <div className="flex flex-col items-center mb-8">
        <Avatar className="w-20 h-20 bg-[#3E1540] mb-4 shadow-lg shadow-[#3E1540]/20">
          <AvatarFallback className="text-white font-bold text-2xl bg-transparent">
            {getInitials(profile.name)}
          </AvatarFallback>
        </Avatar>
        <h1 className="text-2xl font-bold tracking-tight text-[#13101A]">{profile.name}</h1>
        <div className="flex items-center gap-2.5 mt-2">
          {profile.graduation_year && (
            <span className="text-[12px] text-muted-foreground/60 font-medium">
              Class of {profile.graduation_year}
            </span>
          )}
          <span className="text-[10px] bg-[#3E1540] text-white font-semibold px-2.5 py-1 rounded-full uppercase tracking-wide shadow-sm shadow-[#3E1540]/30">
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
            className="bg-white rounded-2xl border border-[#EFEFEF] p-5 shadow-[0_1px_3px_rgba(0,0,0,0.06)]"
          >
            <p className="text-[10px] font-semibold tracking-[0.12em] uppercase text-[#3E1540] mb-2">{label}</p>
            {editing ? (
              <textarea
                value={draft[key]}
                onChange={(e) => setDraft((d) => ({ ...d, [key]: e.target.value }))}
                placeholder={placeholder}
                rows={3}
                className="w-full text-[13px] text-foreground/80 leading-relaxed bg-transparent resize-none focus:outline-none placeholder:text-muted-foreground/40"
              />
            ) : (
              <p className="text-[14px] text-[#374151] leading-relaxed whitespace-pre-wrap">
                {profile[key] || (
                  <span className="text-[#C4C4C4] italic">{placeholder}</span>
                )}
              </p>
            )}
          </div>
        ))}
      </div>

      {/* Sign out */}
      <button
        onClick={onLogout}
        className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-white border border-[#EFEFEF] text-[#EF4444] text-[14px] font-medium hover:bg-red-50 transition-colors"
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
  const [globalOpenChat, setGlobalOpenChat] = useState<{ id: string; name: string } | null>(null)
  const [totalChatsUnread, setTotalChatsUnread] = useState(0)
  const [chatRefreshKey, setChatRefreshKey] = useState(0)
  const [recentChats, setRecentChats] = useState<ChatPreview[]>([])

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

  // Initial load + reload after closing a chat
  useEffect(() => {
    loadRecentChats()
  }, [loadRecentChats, chatRefreshKey])

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

  async function handleLogout() {
    await supabase.auth.signOut()
    window.location.href = "/login"
  }

  return (
    <div className="relative min-h-screen bg-[#FBF8F2] max-w-[390px] mx-auto">
      {/* Scrollable content area */}
      <div className="overflow-y-auto pb-28 min-h-screen">
        {activeTab === "home" && (
          <HomeTab
            profile={initialProfile}
            recentChats={recentChats}
            onSeeChats={() => setActiveTab("chats")}
            onSeeAnnouncements={() => setActiveTab("announcements")}
            onOpenChat={handleOpenChat}
          />
        )}
        {activeTab === "announcements" && (
          <AnnouncementsTab userId={userId} userRole={initialProfile.role} userGradYear={initialProfile.graduation_year} />
        )}
        {activeTab === "chats" && (
          <ChatsTab
            userId={userId}
            userProfile={initialProfile}
            userRole={initialProfile.role}
            onOpenChat={handleOpenChat}
            onTotalUnreadChange={setTotalChatsUnread}
            refreshKey={chatRefreshKey}
          />
        )}
        {activeTab === "directory" && (
          <DirectoryTab
            currentUserId={userId}
            currentUserName={initialProfile.name}
            onOpenChat={(id, name) => {
              setActiveTab("chats")
              handleOpenChat(id, name)
            }}
          />
        )}
        {activeTab === "profile" && (
          <ProfileTab
            userId={userId}
            initialProfile={initialProfile}
            onLogout={handleLogout}
          />
        )}
      </div>

      <BottomNav
        activeTab={activeTab}
        onTabChange={setActiveTab}
        chatsUnread={totalChatsUnread}
      />

      {/* Global ChatScreen — rendered above everything including bottom nav */}
      {globalOpenChat && (
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
    </div>
  )
}
