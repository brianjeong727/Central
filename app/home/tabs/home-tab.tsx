"use client"

import { useState } from "react"
import dynamic from "next/dynamic"
import useSWR from "swr"
import { Bell, Calendar, Gift, Settings } from "lucide-react"
import { createClient } from "@/lib/supabase"
import { EYEBROW_STYLE } from "../components/shared"
import { PocketHeader } from "../components/pocket-header"
import { PocketUpNext, type PocketCard as UpNextCard } from "../components/pocket-up-next"
import { getInitials, previewBody } from "../utils"
import { useMinistryTimezone } from "../ministry-timezone-context"
import { formatInZone } from "@/lib/tz"
import { respondToGradCheck } from "@/app/actions/auto-chats"
import { roleLabel } from "@/app/actions/super-constants"
import { getSetupChecklist, setLeadersInvited, dismissSetupChecklist } from "@/app/actions/setup-checklist"
import { CentralCard, SectionHeader, CentralButton, FeaturedHeroCard, PageTitle, CardTitle, ChatStrip, InsetHairline, TabPageHeader, HomeHeroCarousel, HeroFrame, HeroSectionLabel, HomeHeroSkeleton, PulseSlideCard, ContentActionButton, GettingStartedCard, MonogramChip, PocketCard, PocketRowCard, PocketRow, PocketButton, PocketRoundButton, POCKET_KICKER_STYLE } from "@/components/central"
import { useIsNativeShell } from "@/lib/native-auth"
import type { HeroSlide, SetupChecklistData, UpNextEventDetail } from "@/components/central"
// Lazy — the 649-line hero-curation overlay is leader-only and opens on demand,
// so keep it out of the initial home-tab bundle every member/visitor downloads.
const HomeSlideManager = dynamic(
  () => import("../components/home-slide-manager").then((m) => m.HomeSlideManager),
  { ssr: false }
)
import type { HomeTabProps, Announcement, RsvpAttendee } from "../types"
import { isAdminRole, isLeaderRole } from "@/lib/roles"
import { HomeDeadlines } from "./home-deadlines"

export { HomeTabProps }

// ── Design tokens ─────────────────────────────────────────────────────────────

const EYEBROW = EYEBROW_STYLE

// Everything the home tab loads in one round-trip. Held as a single SWR cache
// object so the tab paints instantly from cache on revisit; RSVP toggles update
// this object optimistically via the bound `mutate`.
type HomeData = {
  heroAnn: Announcement | null
  latestAnn: Announcement | null
  eventCount: number
  featuredShowAttendees: boolean
  userHasRsvped: boolean
  rsvpCount: number
  rsvpAttendees: RsvpAttendee[]
  forYouItems: Announcement[]
  // Latest 2 announcements (by recency) for the mobile Pocket announcements preview.
  recentAnns: Announcement[]
  rsvpedAnnIds: Set<string>
  slides: HeroSlide[]
  slideRsvpedIds: Set<string>
  slideRsvpCounts: Record<string, number>
  slideRsvpAttendees: Record<string, RsvpAttendee[]>
  slideShowAttendeesIds: Set<string>
  homeVerse: { reference: string; text: string } | null
}

// ── Mobile "Pocket" helpers ───────────────────────────────────────────────────

// A curated HeroSlide RSVPs through this announcement (events reuse their linked
// announcement); null when there's nothing to RSVP to. Mirrors the resolution in
// HomeHeroCarousel so the Pocket up-next reuses the same data source.
function slideAnnId(s: HeroSlide): string | null {
  if (s.kind === "announcement") return s.isEvent ? s.announcementId : null
  if (s.kind === "event") return s.linkedAnnouncementId
  return null
}
function slideDetailId(s: HeroSlide): string | null {
  if (s.kind === "announcement") return s.announcementId
  if (s.kind === "event") return s.linkedAnnouncementId
  return null
}
function slideIsEvent(s: HeroSlide): boolean {
  return s.kind === "event" || (s.kind === "announcement" && s.isEvent)
}
function slideEventDetail(s: HeroSlide): UpNextEventDetail | undefined {
  if (s.kind === "event") return s.eventDetail
  if (s.kind === "announcement") return s.eventDetail
  return undefined
}

// Compact event eyebrow + meta line for a cream Pocket event card. Formatted in the
// MINISTRY's zone — `detail.startDate` is a true instant (lib/tz.ts), so a bare
// toLocale* would print the viewer's device zone instead of the event's real clock.
function fmtEvent(detail: UpNextEventDetail, timeZone: string): { eyebrow: string; meta: string } {
  const monthDay = formatInZone(detail.startDate, timeZone, { month: "short", day: "numeric" })
  const weekday = formatInZone(detail.startDate, timeZone, { weekday: "short" })
  const time = detail.allDay ? "All day" : formatInZone(detail.startDate, timeZone, { hour: "numeric", minute: "2-digit" })
  const meta = [`${weekday}, ${monthDay}`, time, detail.location].filter(Boolean).join(" · ")
  return { eyebrow: `Up next · ${monthDay}`, meta }
}

// Ivory event card — the "further upcoming" cards after the plum lead in the Pocket
// up-next carousel. Tonal borderless (cream-panel retired on mobile); pill buttons.
function PocketEventCard({
  eyebrow,
  title,
  meta,
  isRsvped,
  disabled,
  onRsvp,
  onDetails,
}: {
  eyebrow: string
  title: string
  meta?: string
  isRsvped: boolean
  disabled?: boolean
  onRsvp?: () => void
  onDetails?: () => void
}) {
  return (
    <div
      style={{
        height: "100%",
        boxSizing: "border-box",
        background: "var(--ivory)",
        borderRadius: "var(--r-pocket)",
        padding: "var(--space-8)",
        display: "flex",
        flexDirection: "column",
      }}
    >
      <div style={{ ...POCKET_KICKER_STYLE, color: "var(--plum)" }}>{eyebrow}</div>
      <div
        className="line-clamp-2"
        style={{ fontFamily: "var(--serif)", fontSize: 21, fontWeight: 600, letterSpacing: "-0.015em", lineHeight: 1.15, color: "var(--ink)", marginTop: 8 }}
      >
        {title}
      </div>
      {meta && (
        <div style={{ fontSize: 13, color: "var(--body)", marginTop: 6, fontFamily: "var(--sans)" }}>{meta}</div>
      )}
      <div style={{ display: "flex", gap: 8, marginTop: "auto", paddingTop: "var(--space-7)", flexWrap: "wrap" }}>
        {onRsvp && (
          <PocketButton variant={isRsvped ? "quiet" : "primary"} surface="card" compact disabled={disabled} onClick={onRsvp}>
            {isRsvped ? "Going ✓" : "RSVP"}
          </PocketButton>
        )}
        {onDetails && (
          <PocketButton variant="quiet" surface="card" compact onClick={onDetails}>
            Details
          </PocketButton>
        )}
      </div>
    </div>
  )
}

// Kicker row for a Pocket preview section: small serif title + "See all ›".
function PocketSectionHeader({ title, onSeeAll }: { title: string; onSeeAll: () => void }) {
  return (
    <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 12 }}>
      <span style={{ fontFamily: "var(--serif)", fontSize: 19, fontWeight: 600, color: "var(--ink)", letterSpacing: "-0.01em" }}>{title}</span>
      <button
        onClick={onSeeAll}
        style={{ fontSize: 13, fontWeight: 600, color: "var(--muted-text)", background: "none", border: "none", cursor: "pointer", fontFamily: "var(--sans)", padding: 0 }}
      >
        See all ›
      </button>
    </div>
  )
}

// The Pocket quick-action tile (ivory borderless). Full-width since the workspace
// tile that used to sit beside it was removed — a lone half-width tile floating
// left reads as a broken 2-up grid, and every other Home card is full-bleed.
function PocketQuickTile({ icon, label, subtitle, onClick }: { icon: React.ReactNode; label: string; subtitle: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      style={{
        width: "100%",
        textAlign: "left",
        background: "var(--ivory)",
        border: "none",
        borderRadius: "var(--r-pocket)",
        padding: "20px 18px",
        display: "flex",
        flexDirection: "column",
        cursor: "pointer",
      }}
    >
      {icon}
      <div style={{ marginTop: 14 }}>
        <div style={{ fontFamily: "var(--serif)", fontSize: 18, fontWeight: 600, color: "var(--ink)", letterSpacing: "-0.01em", lineHeight: 1.2 }}>{label}</div>
        <div style={{ fontSize: 13, color: "var(--muted-text)", marginTop: 3, fontFamily: "var(--sans)" }}>{subtitle}</div>
      </div>
    </button>
  )
}

// ── Component ─────────────────────────────────────────────────────────────────

export function HomeTab({
  profile,
  userRole,
  ministryId,
  ministryName,
  recentChats,
  onSeeChats,
  onSeeAnnouncements,
  onOpenChat,
  onGoToProfile,
  onOpenAnnouncement,
  onGoToTab,
  avatarUrl,
  activeQuestion,
  hasResponded,
  onResponded,
}: HomeTabProps) {
  const supabase = createClient()
  // The ministry's IANA zone — every event time on this tab renders through it.
  // components/central is a LEAF, so the hero components take it as a prop.
  const timeZone = useMinistryTimezone()

  const [needsGradCheck, setNeedsGradCheck] = useState(profile.needs_grad_check ?? false)

  async function handleGradCheck(graduated: boolean) {
    setNeedsGradCheck(false)
    respondToGradCheck(profile.id, graduated)
  }

  const [rsvping, setRsvping] = useState(false)

  // ── Curated home hero carousel ──
  const [slideRsvping, setSlideRsvping] = useState(false)
  const [managerOpen, setManagerOpen] = useState(false)
  const canCurateHome = isLeaderRole(userRole)

  // ── Getting-started checklist (admin-tier, new ministries only) ──
  // The server action re-gates eligibility (admin-tier + ministry age +
  // dismissal); this client check just avoids a pointless fetch for members.
  const isAdmin = isAdminRole(userRole)
  const { data: checklist, mutate: mutateChecklist } = useSWR(
    isAdmin ? ["setup-checklist", ministryId] : null,
    () => getSetupChecklist()
  )
  // Card shows only while eligible AND at least one item is open (all done → hidden).
  const checklistData = checklist?.eligible && checklist.items.some((i) => !i.done) ? checklist : null

  async function handleChecklistToggle(done: boolean) {
    if (!checklist?.eligible) return
    const optimistic: SetupChecklistData = {
      ...checklist,
      items: checklist.items.map((i) => (i.key === "invite_leaders" ? { ...i, done } : i)),
    }
    await mutateChecklist(
      async () => {
        await setLeadersInvited(done)
        return optimistic
      },
      { optimisticData: optimistic, rollbackOnError: true, revalidate: false }
    )
  }

  async function handleChecklistDismiss() {
    const optimistic: SetupChecklistData = { eligible: false }
    await mutateChecklist(
      async () => {
        await dismissSetupChecklist()
        return optimistic
      },
      { optimisticData: optimistic, rollbackOnError: true, revalidate: false }
    )
  }

  // Give is web-only in the native shell (App Store 3.2.2(iv)) — the quick tile
  // and the setup checklist (whose "offering" step navigates to Give) hide there.
  const nativeShell = useIsNativeShell()

  function handleChecklistNavigate(key: "first_announcement" | "offering" | "presidents") {
    if (key === "first_announcement") onSeeAnnouncements()
    else if (key === "offering") onGoToTab?.("give")
    else onGoToTab?.("plan")
  }

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
    // Let the "Thanks for sharing" confirmation show in the slide first, THEN flip
    // hasResponded upstream so the pulse slide drops out of the carousel.
    setTimeout(() => onResponded?.(), 2200)
  }

  const isLeaderOrAdmin = isLeaderRole(userRole)
  const top3 = recentChats.slice(0, 3)
  const totalUnread = top3.reduce((s, c) => s + (c.muted ? 0 : c.unreadCount), 0)
  const dateLabel = new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })
  const firstName = profile.name.split(" ")[0]
  const hour = new Date().getHours()
  const greetingPrefix = hour < 12 ? "Good morning, " : hour < 17 ? "Good afternoon, " : hour < 21 ? "Good evening, " : "Good night, "
  // R8 honorific allowlist — only these roles greet with an honorific word before the
  // first name; all others (admin, member, visitor) get the name alone. The real role
  // is used (roleLabel with a null id bypasses the "Super" alias) so "Super" never
  // surfaces in the greeting — that stays impersonation chrome.
  const honorific = ["pastor", "deacon", "elder", "leader"].includes(userRole.toLowerCase())
    ? roleLabel(userRole, null)
    : null
  // Living-accent greeting (Dir 3): each segment is its own sheen span so the slow
  // light-sheen drifts per-word; the plum honorific keeps its plum gradient + italic.
  // Static fill under prefers-reduced-motion (see .greeting-sheen in globals.css).
  const greetingNode = (
    <>
      <span className="greeting-sheen">{greetingPrefix}</span>
      {honorific && <span className="greeting-sheen greeting-sheen-plum">{honorific}</span>}
      <span className="greeting-sheen">{(honorific ? " " : "") + firstName}</span>
    </>
  )


  async function loadHomeData(): Promise<HomeData> {
    // ── RT1: announcements, home verses, and curated slide rows ──
    // All three need only ministryId, so they parallelize. (home_slides moved up
    // from its old sequential position; the dead prayer-profile query is removed.)
    const [
      { data: anns },
      { data: verses },
      { data: slideRows },
    ] = await Promise.all([
      supabase
        .from("announcements")
        .select("*")
        .eq("ministry_id", ministryId)
        // Drafts are app-filtered everywhere (announcements RLS is ministry-scoped
        // only — it does NOT gate on status, so a draft row is readable by any
        // member). Home is a published-only glance surface: exclude drafts here for
        // EVERYONE (hero, the recent-announcements digest, and the up-next fallback
        // all read this list) so an unpublished draft can never surface on Home.
        .or("status.is.null,status.eq.published")
        .order("is_pinned", { ascending: false })
        .order("created_at", { ascending: false })
        .limit(10),
      supabase
        .from("home_verses")
        .select("reference, text")
        .eq("ministry_id", ministryId)
        .order("order_index", { ascending: true }),
      supabase
        .from("home_slides")
        .select("id, slide_type, announcement_id, calendar_event_id, order_index, image_url, caption, eyebrow, panel_color, created_at")
        .eq("ministry_id", ministryId)
        .eq("is_active", true)
        .order("order_index", { ascending: true }),
    ])

    let homeVerse: { reference: string; text: string } | null = null
    if (verses && verses.length > 0) {
      const now = new Date()
      const dayOfYear = Math.floor(
        (now.getTime() - new Date(now.getFullYear(), 0, 0).getTime()) / 86_400_000
      )
      homeVerse = verses[dayOfYear % verses.length] as { reference: string; text: string }
    }
    const list = anns ?? []
    const hero = list.find((a) => a.is_pinned) ?? list[0] ?? null
    const eventCount = list.filter((a) => a.is_event).length
    // Latest 2 by recency (list is pinned-first, so re-sort by created_at for "latest").
    const recentAnns = [...list]
      .sort((a, b) => (b.created_at ?? "").localeCompare(a.created_at ?? ""))
      .slice(0, 2)

    const rows = slideRows ?? []
    const slideAnnIds = rows.filter((r) => r.slide_type === "announcement").map((r) => r.announcement_id).filter(Boolean) as string[]
    const slideEvIds = rows.filter((r) => r.slide_type === "event").map((r) => r.calendar_event_id).filter(Boolean) as string[]

    // ── RT2: my RSVPs + hero attendee rows (need announcement data) AND slide
    // announcement/event resolution (need home_slides rows) — all from RT1, parallel. ──
    const [
      { data: myRsvps },
      { data: heroRsvpRows },
      { data: slideAnns },
      { data: slideEvents },
      { data: slideForms },
    ] = await Promise.all([
      list.length > 0
        ? supabase
            .from("rsvps")
            .select("announcement_id")
            .eq("user_id", profile.id)
            .in("announcement_id", list.map((a) => a.id))
        : Promise.resolve({ data: [] as { announcement_id: string }[], error: null }),
      hero
        ? supabase.from("rsvps").select("user_id").eq("announcement_id", hero.id)
        : Promise.resolve({ data: [] as { user_id: string }[], error: null }),
      slideAnnIds.length
        ? supabase.from("announcements").select("id, title, body, is_event, image_url, event_date, created_at").in("id", slideAnnIds).eq("ministry_id", ministryId)
        : Promise.resolve({ data: [] as { id: string; title: string; body: string; is_event: boolean; image_url: string | null; event_date: string | null; created_at: string }[] }),
      slideEvIds.length
        ? supabase
            .from("calendar_events")
            .select("id, title, description, location, start_date, end_date, all_day, linked_announcement_id")
            .in("id", slideEvIds)
            .eq("ministry_id", ministryId)
        : Promise.resolve({ data: [] as { id: string; title: string; description: string | null; location: string | null; start_date: string; end_date: string; all_day: boolean; linked_announcement_id: string | null }[] }),
      slideAnnIds.length
        ? supabase.from("announcement_forms").select("announcement_id").in("announcement_id", slideAnnIds).eq("ministry_id", ministryId)
        : Promise.resolve({ data: [] as { announcement_id: string }[] }),
    ])

    const userRsvpIds = new Set((myRsvps ?? []).map((r) => r.announcement_id))

    // Hero RSVP scalar state (attendee NAMES are resolved in the combined RT4 below).
    let featuredShowAttendees = false
    let userHasRsvped = false
    let rsvpCount = 0
    let rsvpAttendees: RsvpAttendee[] = []
    if (hero) {
      featuredShowAttendees = hero.show_attendees ?? false
      userHasRsvped = userRsvpIds.has(hero.id)
      rsvpCount = (heroRsvpRows ?? []).length
    }

    const heroId = hero?.id
    const forYouItems = list
      .filter((a) => a.id !== heroId)
      .sort((a, b) => {
        const aScore = (a.is_sub_pinned ? 1000 : 0) + (a.is_event && !userRsvpIds.has(a.id) ? 10 : 0)
        const bScore = (b.is_sub_pinned ? 1000 : 0) + (b.is_event && !userRsvpIds.has(b.id) ? 10 : 0)
        return bScore - aScore
      })
      .slice(0, 3)

    // ── Build curated hero slides from the resolved announcement/event data (RT2). ──
    const annMap = new Map((slideAnns ?? []).map((a) => [a.id, a]))
    const evMap = new Map((slideEvents ?? []).map((e) => [e.id, e]))
    const slideFormSet = new Set((slideForms ?? []).map((f) => f.announcement_id))

    const slides: HeroSlide[] = []
    for (const r of rows) {
      if (r.slide_type === "photo") continue // photo slides shelved — coming soon (soft-hidden; rows kept in DB)
      if (r.slide_type === "announcement") {
        const a = annMap.get(r.announcement_id ?? "")
        if (!a) continue
        slides.push({
          kind: "announcement",
          key: r.id,
          announcementId: a.id,
          title: a.title,
          body: a.body,
          isEvent: a.is_event,
          imageUrl: a.image_url ?? null,
          hasForm: slideFormSet.has(a.id),
          eventDetail: a.is_event && a.event_date ? { startDate: a.event_date, endDate: a.event_date, allDay: false, location: null } : undefined,
          createdAt: a.created_at,
        })
      } else {
        const e = evMap.get(r.calendar_event_id ?? "")
        if (!e) continue
        slides.push({
          kind: "event",
          key: r.id,
          calendarEventId: e.id,
          linkedAnnouncementId: e.linked_announcement_id,
          title: e.title,
          body: e.description,
          eventDetail: { startDate: e.start_date, endDate: e.end_date, allDay: e.all_day, location: e.location },
          imageUrl: r.image_url,
          panelColor: r.panel_color,
        })
      }
    }

    // RSVP wiring keyed on announcement_id (event slides reuse their linked announcement).
    const rsvpAnnIds = new Set<string>()
    for (const s of slides) {
      if (s.kind === "announcement" && s.isEvent) rsvpAnnIds.add(s.announcementId)
      else if (s.kind === "event" && s.linkedAnnouncementId) rsvpAnnIds.add(s.linkedAnnouncementId)
    }
    const rsvpIdArr = [...rsvpAnnIds]

    let slideRsvpedIds = new Set<string>()
    let slideRsvpCounts: Record<string, number> = {}
    const slideRsvpAttendees: Record<string, RsvpAttendee[]> = {}
    let slideShowAttendeesIds = new Set<string>()
    let slideByAnnUserIds: Record<string, string[]> = {}
    let slideUserIds: string[] = []

    // ── RT3: slide RSVP state (needs the slide announcement IDs from RT2). ──
    if (rsvpIdArr.length > 0) {
      const [{ data: myR }, { data: allR }, { data: annMeta }] = await Promise.all([
        supabase.from("rsvps").select("announcement_id").eq("user_id", profile.id).in("announcement_id", rsvpIdArr),
        supabase.from("rsvps").select("announcement_id, user_id").in("announcement_id", rsvpIdArr),
        supabase.from("announcements").select("id, show_attendees").in("id", rsvpIdArr).eq("ministry_id", ministryId),
      ])

      const counts: Record<string, number> = {}
      const byAnnUserIds: Record<string, string[]> = {}
      for (const row of allR ?? []) {
        counts[row.announcement_id] = (counts[row.announcement_id] ?? 0) + 1
        ;(byAnnUserIds[row.announcement_id] ??= []).push(row.user_id)
      }

      slideRsvpedIds = new Set((myR ?? []).map((r) => r.announcement_id))
      slideRsvpCounts = counts
      slideByAnnUserIds = byAnnUserIds
      slideShowAttendeesIds = new Set((annMeta ?? []).filter((a) => a.show_attendees).map((a) => a.id))
      slideUserIds = (allR ?? []).map((r) => r.user_id)
    }

    // ── RT4: ONE profiles lookup for BOTH hero attendees (RT2) and slide
    // attendees (RT3), unioned + deduped — replaces the two old separate fetches. ──
    const profileUserIds = new Set<string>()
    for (const r of heroRsvpRows ?? []) profileUserIds.add(r.user_id)
    for (const uid of slideUserIds) profileUserIds.add(uid)

    let nameById = new Map<string, string>()
    if (profileUserIds.size > 0) {
      const { data: profs } = await supabase
        .from("profiles").select("id, name")
        .in("id", [...profileUserIds])
        .eq("ministry_id", ministryId)
      nameById = new Map((profs ?? []).map((p) => [p.id, p.name]))
    }

    // Hero attendees: derive from the fetched profiles (drop any user whose profile
    // wasn't returned — matches the original behavior, which mapped only profile rows).
    if (hero && (heroRsvpRows ?? []).length > 0) {
      rsvpAttendees = (heroRsvpRows ?? [])
        .filter((r) => nameById.has(r.user_id))
        .map((r) => ({ user_id: r.user_id, name: nameById.get(r.user_id)! }))
    }

    // Slide attendees: keep every RSVPer (empty name if profile missing) — matches original.
    for (const [annId, uids] of Object.entries(slideByAnnUserIds)) {
      slideRsvpAttendees[annId] = uids.map((uid) => ({ user_id: uid, name: nameById.get(uid) ?? "" }))
    }

    return {
      heroAnn: hero,
      latestAnn: list[0] ?? null,
      eventCount,
      featuredShowAttendees,
      userHasRsvped,
      rsvpCount,
      rsvpAttendees,
      forYouItems,
      recentAnns,
      rsvpedAnnIds: userRsvpIds,
      slides,
      slideRsvpedIds,
      slideRsvpCounts,
      slideRsvpAttendees,
      slideShowAttendeesIds,
      homeVerse,
    }
  }

  // SWR cache keyed on ministry + user — instant on revisit, revalidates in the
  // background. The whole home payload lives in one cache entry.
  const { data, isLoading, mutate } = useSWR(
    ["home-tab", ministryId, profile.id],
    loadHomeData
  )

  const loading = isLoading || !data
  const heroAnn = data?.heroAnn ?? null
  const latestAnn = data?.latestAnn ?? null
  const featuredShowAttendees = data?.featuredShowAttendees ?? false
  const userHasRsvped = data?.userHasRsvped ?? false
  const rsvpCount = data?.rsvpCount ?? 0
  const rsvpAttendees = data?.rsvpAttendees ?? []
  const forYouItems = data?.forYouItems ?? []
  const recentAnns = data?.recentAnns ?? []
  const rsvpedAnnIds = data?.rsvpedAnnIds ?? new Set<string>()
  const slides = data?.slides ?? []
  const slideRsvpedIds = data?.slideRsvpedIds ?? new Set<string>()
  const slideRsvpCounts = data?.slideRsvpCounts ?? {}
  const slideRsvpAttendees = data?.slideRsvpAttendees ?? {}
  const slideShowAttendeesIds = data?.slideShowAttendeesIds ?? new Set<string>()
  const homeVerse = data?.homeVerse ?? null
  const showAttendeeList = rsvpAttendees.length > 0 && (isLeaderOrAdmin || featuredShowAttendees)

  async function handleHomeRsvp() {
    if (!data?.heroAnn || rsvping) return
    setRsvping(true)
    const hero = data.heroAnn
    const has = data.userHasRsvped
    const optimistic: HomeData = {
      ...data,
      userHasRsvped: !has,
      rsvpCount: has ? Math.max(0, data.rsvpCount - 1) : data.rsvpCount + 1,
      rsvpAttendees: has
        ? data.rsvpAttendees.filter((a) => a.user_id !== profile.id)
        : [...data.rsvpAttendees, { user_id: profile.id, name: profile.name }],
    }
    await mutate(
      async () => {
        if (has) {
          await supabase.from("rsvps").delete().eq("announcement_id", hero.id).eq("user_id", profile.id)
        } else {
          await supabase.from("rsvps").upsert(
            { announcement_id: hero.id, user_id: profile.id },
            { onConflict: "announcement_id,user_id" }
          )
        }
        return optimistic
      },
      { optimisticData: optimistic, rollbackOnError: true, revalidate: false }
    )
    setRsvping(false)
  }

  async function handleForYouRsvp(annId: string) {
    if (!data) return
    const isRsvped = data.rsvpedAnnIds.has(annId)
    const nextSet = new Set(data.rsvpedAnnIds)
    if (isRsvped) nextSet.delete(annId); else nextSet.add(annId)
    const optimistic: HomeData = { ...data, rsvpedAnnIds: nextSet }
    await mutate(
      async () => {
        if (isRsvped) {
          await supabase.from("rsvps").delete().eq("announcement_id", annId).eq("user_id", profile.id)
        } else {
          await supabase.from("rsvps").upsert(
            { announcement_id: annId, user_id: profile.id },
            { onConflict: "announcement_id,user_id" }
          )
        }
        return optimistic
      },
      { optimisticData: optimistic, rollbackOnError: true, revalidate: false }
    )
  }

  async function handleSlideRsvp(annId: string) {
    if (slideRsvping || !data) return
    setSlideRsvping(true)
    const has = data.slideRsvpedIds.has(annId)
    const nextIds = new Set(data.slideRsvpedIds)
    if (has) nextIds.delete(annId); else nextIds.add(annId)
    const cur = data.slideRsvpAttendees[annId] ?? []
    const optimistic: HomeData = {
      ...data,
      slideRsvpedIds: nextIds,
      slideRsvpCounts: { ...data.slideRsvpCounts, [annId]: Math.max(0, (data.slideRsvpCounts[annId] ?? 0) + (has ? -1 : 1)) },
      slideRsvpAttendees: {
        ...data.slideRsvpAttendees,
        [annId]: has
          ? cur.filter((a) => a.user_id !== profile.id)
          : [...cur, { user_id: profile.id, name: profile.name }],
      },
    }
    await mutate(
      async () => {
        if (has) {
          await supabase.from("rsvps").delete().eq("announcement_id", annId).eq("user_id", profile.id)
        } else {
          await supabase.from("rsvps").upsert({ announcement_id: annId, user_id: profile.id }, { onConflict: "announcement_id,user_id" })
        }
        return optimistic
      },
      { optimisticData: optimistic, rollbackOnError: true, revalidate: false }
    )
    setSlideRsvping(false)
  }

  function handleSlideDetails(slide: HeroSlide) {
    if (slide.kind === "announcement") onOpenAnnouncement(slide.announcementId)
    else if (slide.kind === "event" && slide.linkedAnnouncementId) onOpenAnnouncement(slide.linkedAnnouncementId)
    // photo slides and link-less event slides have no detail target
  }

  // ── Render ────────────────────────────────────────────────────────────────

  // Pastor Pulse rides as the LEAD slide of the hero carousel (PulseSlideCard);
  // all answer state stays here, the card is purely prop-driven. One node per
  // breakpoint (both trees are mounted; only CSS hides one).
  const showPulse = !!activeQuestion && !hasResponded && !isPastorRole
  const pulseCardProps = showPulse && activeQuestion
    ? {
        question: activeQuestion,
        pulseOption,
        setPulseOption,
        pulseScale,
        setPulseScale,
        pulseInput,
        setPulseInput,
        pulseSubmitting,
        submitted: pulseSubmitted,
        onSubmit: handlePulseSubmit,
      }
    : null
  const pulseNodeDesktop = pulseCardProps ? <PulseSlideCard {...pulseCardProps} /> : null
  const pulseNodeMobile = pulseCardProps ? <PulseSlideCard {...pulseCardProps} mobile /> : null

  // ── Mobile "Pocket" up-next carousel cards ──
  // Reuses the SAME data source as the desktop hero (curated home_slides → else the
  // pinned/next announcement → else latest). Lead is the plum FeaturedHeroCard (the
  // one plum surface); "further upcoming" events render as cream PocketEventCards.
  // Photo slides are shelved (loadHomeData already skips them); narrow to the
  // announcement/event reference slides the Pocket cards actually render.
  const pocketSlides = slides.filter(
    (s): s is Extract<HeroSlide, { kind: "announcement" } | { kind: "event" }> => s.kind !== "photo"
  )
  const pocketCards: UpNextCard[] = []
  if (pulseNodeMobile) pocketCards.push({ key: "__pulse__", node: pulseNodeMobile })

  if (pocketSlides.length > 0) {
    const s = pocketSlides[0]
    const annId = slideAnnId(s)
    const attendees = annId ? slideRsvpAttendees[annId] ?? [] : []
    const showAttendees = !!annId && attendees.length > 0 && (isLeaderOrAdmin || slideShowAttendeesIds.has(annId))
    const detailId = slideDetailId(s)
    pocketCards.push({
      key: s.key,
      node: (
        <FeaturedHeroCard
          timeZone={timeZone}
          mobile
          style={{ height: "100%" }}
          eyebrowLabel={s.kind === "announcement" ? s.eyebrowLabel ?? "Up next" : "Up next"}
          title={s.title}
          body={s.body}
          isEvent={slideIsEvent(s)}
          hasForm={s.kind === "announcement" ? s.hasForm : undefined}
          postedDate={s.kind === "announcement" ? s.createdAt : undefined}
          eventDetail={slideEventDetail(s)}
          userHasRsvped={annId ? slideRsvpedIds.has(annId) : false}
          rsvping={slideRsvping}
          rsvpCount={annId ? slideRsvpCounts[annId] ?? 0 : 0}
          attendees={attendees}
          showAttendees={showAttendees}
          onRsvp={annId ? () => handleSlideRsvp(annId) : undefined}
          onDetails={detailId ? () => onOpenAnnouncement(detailId) : undefined}
        />
      ),
    })
  } else if (heroAnn) {
    pocketCards.push({
      key: heroAnn.id,
      node: (
        <FeaturedHeroCard
          timeZone={timeZone}
          mobile
          style={{ height: "100%" }}
          eyebrowLabel="Up next"
          title={heroAnn.title}
          body={heroAnn.body}
          isEvent={heroAnn.is_event}
          postedDate={heroAnn.created_at}
          eventDetail={heroAnn.is_event && heroAnn.event_date ? { startDate: heroAnn.event_date, endDate: heroAnn.event_date, allDay: false, location: null } : undefined}
          userHasRsvped={userHasRsvped}
          rsvping={rsvping}
          rsvpCount={rsvpCount}
          attendees={rsvpAttendees}
          showAttendees={showAttendeeList}
          onRsvp={handleHomeRsvp}
          onDetails={() => onOpenAnnouncement(heroAnn.id)}
        />
      ),
    })
  } else if (latestAnn) {
    pocketCards.push({
      key: latestAnn.id,
      node: (
        <FeaturedHeroCard
          timeZone={timeZone}
          mobile
          style={{ height: "100%" }}
          eyebrowLabel="Latest"
          title={latestAnn.title}
          body={latestAnn.body}
          isEvent={false}
          postedDate={latestAnn.created_at}
          onDetails={() => onOpenAnnouncement(latestAnn.id)}
        />
      ),
    })
  }

  const slideAnnIdSet = new Set(pocketSlides.map(slideAnnId).filter(Boolean) as string[])
  for (const s of pocketSlides.slice(1).filter(slideIsEvent)) {
    const annId = slideAnnId(s)
    const detailId = slideDetailId(s)
    const ed = slideEventDetail(s)
    const { eyebrow, meta } = ed ? fmtEvent(ed, timeZone) : { eyebrow: "Up next", meta: "" }
    pocketCards.push({
      key: s.key,
      node: (
        <PocketEventCard
          eyebrow={eyebrow}
          title={s.title}
          meta={meta}
          isRsvped={annId ? slideRsvpedIds.has(annId) : false}
          disabled={slideRsvping}
          onRsvp={annId ? () => handleSlideRsvp(annId) : undefined}
          onDetails={detailId ? () => onOpenAnnouncement(detailId) : undefined}
        />
      ),
    })
  }
  for (const a of forYouItems.filter((it) => it.is_event && !slideAnnIdSet.has(it.id))) {
    const ed: UpNextEventDetail | undefined = a.event_date ? { startDate: a.event_date, endDate: a.event_date, allDay: false, location: null } : undefined
    const { eyebrow, meta } = ed ? fmtEvent(ed, timeZone) : { eyebrow: "Up next", meta: "" }
    pocketCards.push({
      key: a.id,
      node: (
        <PocketEventCard
          eyebrow={eyebrow}
          title={a.title}
          meta={meta}
          isRsvped={rsvpedAnnIds.has(a.id)}
          onRsvp={() => handleForYouRsvp(a.id)}
          onDetails={() => onOpenAnnouncement(a.id)}
        />
      ),
    })
  }

  return (
    <div>
      {/* ── Mobile chrome header (Pocket) ── */}
      <div className="md:hidden px-5">
        <PocketHeader
          ministryName={ministryName}
          userName={profile.name}
          avatarUrl={avatarUrl}
          onAvatarClick={onGoToProfile}
          action={isAdmin ? (
            <PocketRoundButton variant="ghost" ariaLabel="Church settings" onClick={() => onGoToTab?.("settings")}>
              <Settings style={{ width: 17, height: 17, color: "var(--plum)" }} strokeWidth={1.7} />
            </PocketRoundButton>
          ) : undefined}
        />
      </div>

      {/* ── Grad-check banner ── */}
      {needsGradCheck && (
        <div style={{
          margin: "12px 20px 0",
          borderRadius: "var(--r-card)",
          border: "1px solid var(--line)",
          background: "var(--cream)",
          padding: "14px 16px",
          display: "flex",
          flexDirection: "column",
          gap: 10,
        }}>
          <div>
            <p style={{ fontSize: 14, fontWeight: 600, color: "var(--ink)", marginBottom: 4 }}>Have you graduated?</p>
            <p style={{ fontSize: 13, color: "var(--muted-text)" }}>Let us know so we can move you to the right group.</p>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <CentralButton onClick={() => handleGradCheck(true)} style={{ flex: 1, justifyContent: "center" }}>
              I&apos;ve graduated
            </CentralButton>
            <CentralButton variant="secondary" onClick={() => handleGradCheck(false)} style={{ flex: 1, justifyContent: "center" }}>
              Still a student
            </CentralButton>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════ DESKTOP ══ */}

      {/* Desktop: hero header — title only. The Curate action lives in the hero
          section's own body header (HeroSectionLabel row), per Convention #15:
          create/config buttons never sit in the TabPageHeader. */}
      <TabPageHeader>
        <PageTitle eyebrow={dateLabel} title={greetingNode} style={{ maxWidth: 640 }} />
      </TabPageHeader>

      {/* Desktop: main content */}
      <div
        className="hidden md:block px-14"
        style={{ paddingTop: "var(--space-8)", paddingBottom: "var(--space-9)" }}
      >

        {/* Getting started — admin-tier setup checklist for a fresh ministry.
            Sits directly under the page header, above the hero (hidden once
            dismissed or complete). */}
        {checklistData && !nativeShell && (
          <GettingStartedCard
            data={checklistData}
            onToggleLeadersInvited={handleChecklistToggle}
            onDismiss={handleChecklistDismiss}
            onNavigate={handleChecklistNavigate}
            style={{ marginBottom: "var(--space-8)" }}
          />
        )}

        {/* Up Next — curated carousel, else fall back to pinned-or-latest announcement.
            "Featured" section eyebrow is the constant frame element above every state.
            While the home payload loads, only this region skeletons (same --hero-h
            footprint) — the header/chat strip around it paint immediately from props. */}
        {loading ? (
          <HomeHeroSkeleton />
        ) : (
          <HeroSectionLabel
            breathe
            action={canCurateHome
              ? <ContentActionButton label="Curate" variant="ghost" onClick={() => setManagerOpen(true)} />
              : undefined}
          />
        )}
        {!loading && (slides.length > 0 || pulseNodeDesktop ? (
          <HomeHeroCarousel
            timeZone={timeZone}
            slides={slides}
            pulseNode={pulseNodeDesktop}
            rsvpedIds={slideRsvpedIds}
            rsvpCounts={slideRsvpCounts}
            rsvpAttendees={slideRsvpAttendees}
            showAttendeesIds={slideShowAttendeesIds}
            isLeaderOrAdmin={isLeaderOrAdmin}
            rsvping={slideRsvping}
            onRsvp={handleSlideRsvp}
            onDetails={handleSlideDetails}
          />
        ) : heroAnn ? (
          <HeroFrame bare>
            <FeaturedHeroCard
              timeZone={timeZone}
              fill
              eyebrowLabel="Up next"
              title={heroAnn.title}
              body={heroAnn.body}
              isEvent={heroAnn.is_event}
              postedDate={heroAnn.created_at}
              eventDetail={heroAnn.is_event && heroAnn.event_date ? { startDate: heroAnn.event_date, endDate: heroAnn.event_date, allDay: false, location: null } : undefined}
              userHasRsvped={userHasRsvped}
              rsvping={rsvping}
              rsvpCount={rsvpCount}
              attendees={rsvpAttendees}
              showAttendees={showAttendeeList}
              onRsvp={handleHomeRsvp}
              onDetails={() => onOpenAnnouncement(heroAnn.id)}
            />
          </HeroFrame>
        ) : latestAnn ? (
          <HeroFrame bare>
            <FeaturedHeroCard
              timeZone={timeZone}
              fill
              eyebrowLabel="Latest"
              title={latestAnn.title}
              body={latestAnn.body}
              isEvent={false}
              postedDate={latestAnn.created_at}
              onDetails={() => onOpenAnnouncement(latestAnn.id)}
            />
          </HeroFrame>
        ) : (
          <HeroFrame
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              gap: 12,
              textAlign: "center",
              background: "var(--ivory)",
            }}
          >
            <Calendar style={{ width: 32, height: 32, color: "var(--dashed)" }} />
            <div>
              <p style={{ fontSize: 15, fontWeight: 600, color: "var(--ink)" }}>No upcoming events</p>
              <p style={{ fontSize: 13, color: "var(--muted-text)", marginTop: 4 }}>
                Check the announcements tab for updates.
              </p>
            </div>
            <CentralButton variant="plum-outline" onClick={onSeeAnnouncements} style={{ marginTop: 4 }}>
              See announcements
            </CentralButton>
          </HeroFrame>
        ))}

        {/* Your chats — horizontal strip below hero */}
        <ChatStrip
          chats={top3}
          totalUnread={totalUnread}
          onOpenChat={onOpenChat}
          onSeeAll={onSeeChats}
          style={{ marginTop: "var(--space-8)" }}
        />

        {/* ── My Deadlines — desktop (own SWR key; between chats and For You) ── */}
        <HomeDeadlines ministryId={ministryId} profileId={profile.id} variant="desktop" />

        {/* ── For You section — desktop ── */}
        {forYouItems.length > 0 && (
          <div style={{ marginTop: 36 }}>
            <SectionHeader
              eyebrow="Announcements"
              title="For you"
              action={
                <button
                  onClick={onSeeAnnouncements}
                  style={{ fontSize: 12, color: "var(--muted-text)", background: "none", border: "none", cursor: "pointer", fontFamily: "var(--sans)" }}
                >
                  See all →
                </button>
              }
              style={{ marginBottom: 18 }}
            />

            <div className="grid" style={{ gridTemplateColumns: "repeat(3, 1fr)", gap: "var(--space-6)" }}>
              {forYouItems.map((a) => (
                <CentralCard
                  key={a.id}
                  style={{ display: "flex", flexDirection: "column", gap: 10 }}
                >
                  {/* Type badge + RSVP */}
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                    <span
                      style={{
                        fontSize: 10,
                        letterSpacing: "0.5px",
                        fontWeight: 500,
                        textTransform: "uppercase",
                        padding: "3px 10px",
                        borderRadius: 999,
                        background: "var(--ivory)",
                        border: "1px solid var(--line-2)",
                        color: a.is_sub_pinned ? "var(--plum)" : "var(--muted-text)",
                        whiteSpace: "nowrap",
                        fontFamily: "var(--sans)",
                      }}
                    >
                      {a.is_sub_pinned ? "For you" : a.is_event ? "Event" : "Post"}
                    </span>
                    {a.is_event && (
                      <button
                        onClick={() => handleForYouRsvp(a.id)}
                        style={{
                          fontSize: 11,
                          fontWeight: 500,
                          padding: "3px 10px",
                          borderRadius: 999,
                          border: `1px solid ${rsvpedAnnIds.has(a.id) ? "var(--line-2)" : "var(--plum)"}`,
                          background: rsvpedAnnIds.has(a.id) ? "var(--ivory)" : "transparent",
                          color: rsvpedAnnIds.has(a.id) ? "var(--muted-text)" : "var(--plum)",
                          cursor: "pointer",
                          flexShrink: 0,
                          fontFamily: "var(--sans)",
                        }}
                      >
                        {rsvpedAnnIds.has(a.id) ? "Going ✓" : "RSVP"}
                      </button>
                    )}
                  </div>

                  <CardTitle size={20}>{a.title}</CardTitle>

                  {/* Body — flex: 1 so all cards in a row push actions to the same baseline */}
                  <p
                    className="line-clamp-2"
                    style={{
                      fontSize: 12,
                      color: "var(--body)",
                      lineHeight: 1.55,
                      flex: 1,
                      margin: 0,
                      fontFamily: "var(--sans)",
                    }}
                  >
                    {previewBody(a.body)}
                  </p>

                  {/* View action — always at bottom */}
                  <button
                    onClick={() => onOpenAnnouncement(a.id)}
                    style={{
                      fontSize: 11,
                      color: "var(--muted-text)",
                      background: "none",
                      border: "none",
                      cursor: "pointer",
                      textAlign: "left",
                      padding: 0,
                      fontFamily: "var(--sans)",
                    }}
                  >
                    See announcement →
                  </button>
                </CentralCard>
              ))}
            </div>

            {/* Leader prompt: event has 0 RSVPs */}
            {isLeaderOrAdmin && heroAnn && rsvpCount === 0 && (
              <div
                style={{
                  marginTop: 12,
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  padding: "12px 16px",
                  background: "var(--cream)",
                  border: "1px solid var(--line)",
                  borderRadius: "var(--r-card)",
                }}
              >
                <Bell style={{ width: 14, height: 14, color: "var(--muted-text)", flexShrink: 0 }} />
                <p style={{ fontSize: 12, color: "var(--body)", margin: 0, fontFamily: "var(--sans)" }}>
                  No one has RSVPed to{" "}
                  <span style={{ fontWeight: 600, color: "var(--ink)" }}>{heroAnn.title}</span>{" "}
                  yet — share the details with your group.
                </p>
              </div>
            )}
          </div>
        )}

        {/* ── Daily verse — desktop ── */}
        {homeVerse && (
          <CentralCard
            style={{
              marginTop: "var(--space-8)",
              display: "grid",
              gridTemplateColumns: "1fr 2fr",
              alignItems: "center",
              gap: "var(--space-9)",
            }}
            padding="22px 28px"
          >
            <div>
              <div style={EYEBROW}>Today&apos;s verse</div>
              <CardTitle size={20} style={{ marginTop: 4 }}>{homeVerse.reference}</CardTitle>
            </div>
            <CardTitle size={17} italic style={{ lineHeight: 1.5 }}>
              &ldquo;{homeVerse.text}&rdquo;
            </CardTitle>
          </CentralCard>
        )}

      </div>

      {/* ══════════════════════════════════════════════════════ MOBILE ══ */}

      <div className="md:hidden px-5 pb-4">

        {/* Mono date kicker (Pocket scale — 10 mono, airier tracking) */}
        <div style={{ ...POCKET_KICKER_STYLE, letterSpacing: "2px", marginBottom: "var(--space-8)" }}>{dateLabel}</div>

        <div className="flex flex-col" style={{ gap: "var(--space-9)" }}>

          {/* ── Getting started — mobile (above Up Next, mirrors desktop) ── */}
          {checklistData && !nativeShell && (
            <GettingStartedCard
              data={checklistData}
              variant="mobile"
              onToggleLeadersInvited={handleChecklistToggle}
              onDismiss={handleChecklistDismiss}
              onNavigate={handleChecklistNavigate}
            />
          )}

          {/* ── Up Next — mobile (Pocket scroll-snap carousel) ── */}
          <section>
            {/* §4.1b constant "Featured" eyebrow above the carousel */}
            <HeroSectionLabel breathe />
            {loading ? (
              <HomeHeroSkeleton showLabel={false} />
            ) : pocketCards.length > 0 ? (
              <PocketUpNext cards={pocketCards} />
            ) : (
              <PocketCard
                style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 8, textAlign: "center" }}
                padding="32px 24px"
              >
                <Calendar style={{ width: 28, height: 28, color: "var(--dashed)" }} />
                <p style={{ fontSize: 14, fontWeight: 600, color: "var(--ink)", fontFamily: "var(--sans)" }}>No upcoming events</p>
                <p style={{ fontSize: 12, color: "var(--muted-text)", fontFamily: "var(--sans)" }}>Check back when events are posted.</p>
              </PocketCard>
            )}
          </section>

          {/* ── My Deadlines — mobile (between Up Next and Announcements) ── */}
          <HomeDeadlines ministryId={ministryId} profileId={profile.id} variant="mobile" onSeeAll={() => onGoToTab?.("plan")} />

          {/* ── Announcements preview — mobile (latest 2) ── */}
          {recentAnns.length > 0 && (
            <section>
              <PocketSectionHeader title="Announcements" onSeeAll={onSeeAnnouncements} />
              <PocketRowCard>
                {recentAnns.map((a, i) => (
                  <PocketRow
                    key={a.id}
                    title={a.title}
                    sub={a.body ? previewBody(a.body) : undefined}
                    isLast={i === recentAnns.length - 1}
                    onClick={() => onOpenAnnouncement(a.id)}
                  />
                ))}
              </PocketRowCard>
            </section>
          )}

          {/* ── Chats preview — mobile (top 2) ── */}
          {recentChats.length > 0 && (
            <section>
              <PocketSectionHeader title="Chats" onSeeAll={onSeeChats} />
              <PocketRowCard>
                {recentChats.slice(0, 2).map((c, i) => (
                  <PocketRow
                    key={c.id}
                    leading={<MonogramChip initials={getInitials(c.groupName)} className="w-10 h-10 flex-shrink-0" style={{ fontFamily: "var(--serif)", fontSize: 15, fontWeight: 600 }} />}
                    title={c.groupName}
                    sub={c.lastMessageSender ? `${c.lastMessageSender}: ${c.lastMessage}` : c.lastMessage || "No messages yet"}
                    time={c.time}
                    showDot={c.unreadCount > 0 && !c.muted}
                    isLast={i === Math.min(recentChats.length, 2) - 1}
                    onClick={() => onOpenChat(c.id, c.groupName, c.type)}
                  />
                ))}
              </PocketRowCard>
            </section>
          )}

          {/* ── Quick tile — mobile. Give only; web-only (the native shell hides it).
              The "first workspace" tile that used to share this row is GONE (Brian,
              2026-08-05): Workspace is a bottom-nav destination, so the tile was a
              second door to a place already one tap away, and it arbitrarily showed
              userTeams[0] — meaningless for anyone on more than one team. ── */}
          {!nativeShell && (
          <section>
            <PocketQuickTile
              icon={<div style={{ width: 44, height: 44, borderRadius: 999, background: "var(--plum)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}><Gift style={{ width: 19, height: 19, color: "var(--cream-on-dark)" }} strokeWidth={1.7} /></div>}
              label="Give"
              subtitle="Support the ministry"
              onClick={() => onGoToTab?.("give")}
            />
          </section>
          )}

          {/* ── Daily verse — mobile (ivory, tonal borderless) ── */}
          {homeVerse && (
            <section>
              <PocketCard padding="22px 20px">
                <div style={POCKET_KICKER_STYLE}>Today&apos;s verse</div>
                <p style={{ fontFamily: "var(--serif)", fontStyle: "italic", fontSize: 17, lineHeight: 1.55, color: "var(--ink)", marginTop: 10 }}>
                  &ldquo;{homeVerse.text}&rdquo;
                </p>
                <div style={{ fontFamily: "var(--mono)", fontSize: 10, letterSpacing: "1.8px", textTransform: "uppercase", color: "var(--muted-text)", marginTop: 10 }}>
                  {homeVerse.reference}
                </div>
              </PocketCard>
            </section>
          )}

        </div>
      </div>

      {managerOpen && (
        <HomeSlideManager
          ministryId={ministryId}
          onClose={() => {
            setManagerOpen(false)
            mutate()
          }}
        />
      )}
    </div>
  )
}
