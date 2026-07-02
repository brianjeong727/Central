"use client"

import { useState } from "react"
import dynamic from "next/dynamic"
import useSWR from "swr"
import { ChevronRight, Bell, Calendar } from "lucide-react"
import { createClient } from "@/lib/supabase"
import { ChatsSection } from "@/components/ui/chats-section"
import { RingCrossLogo, HeaderActionButton, EYEBROW_STYLE } from "../components/shared"
import { getInitials, previewBody } from "../utils"
import { respondToGradCheck } from "@/app/actions/auto-chats"
import { CentralCard, SectionHeader, CentralButton, UpNextCard, PageTitle, CardTitle, ChatStrip, InsetHairline, TabPageHeader, HomeHeroCarousel, HeroFrame, HeroSectionLabel, HomeHeroSkeleton } from "@/components/central"
import type { HeroSlide } from "@/components/central"
// Lazy — the 649-line hero-curation overlay is leader-only and opens on demand,
// so keep it out of the initial home-tab bundle every member/visitor downloads.
const HomeSlideManager = dynamic(
  () => import("../components/home-slide-manager").then((m) => m.HomeSlideManager),
  { ssr: false }
)
import type { HomeTabProps, Announcement, RsvpAttendee } from "../types"

export { HomeTabProps }

// ── Design tokens ─────────────────────────────────────────────────────────────

const EYEBROW = EYEBROW_STYLE


function pulseTypeLabel(type: string) {
  if (type === "poll") return "Poll"
  if (type === "scale") return "1–5 Scale"
  if (type === "prayer") return "Prayer"
  return "Open"
}

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
  rsvpedAnnIds: Set<string>
  slides: HeroSlide[]
  slideRsvpedIds: Set<string>
  slideRsvpCounts: Record<string, number>
  slideRsvpAttendees: Record<string, RsvpAttendee[]>
  slideShowAttendeesIds: Set<string>
  homeVerse: { reference: string; text: string } | null
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
  avatarUrl,
  activeQuestion,
  hasResponded,
  onResponded,
}: HomeTabProps) {
  const supabase = createClient()

  const [needsGradCheck, setNeedsGradCheck] = useState(profile.needs_grad_check ?? false)

  async function handleGradCheck(graduated: boolean) {
    setNeedsGradCheck(false)
    respondToGradCheck(profile.id, graduated)
  }

  const [rsvping, setRsvping] = useState(false)

  // ── Curated home hero carousel ──
  const [slideRsvping, setSlideRsvping] = useState(false)
  const [managerOpen, setManagerOpen] = useState(false)
  const canCurateHome = ["admin", "leader", "deacon", "elder", "pastor"].includes(userRole.toLowerCase())

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

  const isLeaderOrAdmin = ["leader", "admin", "deacon", "elder", "pastor"].includes(userRole.toLowerCase())
  const top3 = recentChats.slice(0, 3)
  const totalUnread = top3.reduce((s, c) => s + c.unreadCount, 0)
  const roleLabel = userRole.charAt(0).toUpperCase() + userRole.slice(1).toLowerCase()
  const dateLabel = new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })
  const firstName = profile.name.split(" ")[0]
  const hour = new Date().getHours()
  const greetingPrefix = hour < 12 ? "Good morning, " : hour < 17 ? "Good afternoon, " : hour < 21 ? "Good evening, " : "Good night, "
  // Living-accent greeting (Dir 3): each segment is its own sheen span so the slow
  // light-sheen drifts per-word; the plum role keeps its plum gradient. Static fill
  // under prefers-reduced-motion (see .greeting-sheen in globals.css).
  const greetingNode = (
    <>
      <span className="greeting-sheen">{greetingPrefix}</span>
      <span className="greeting-sheen greeting-sheen-plum">{roleLabel}</span>
      <span className="greeting-sheen">{" " + firstName}</span>
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
      if (r.slide_type === "photo") {
        if (!r.image_url) continue
        slides.push({
          kind: "photo",
          key: r.id,
          imageUrl: r.image_url,
          caption: r.caption ?? "",
          eyebrow: r.eyebrow ?? "Featured",
          panelColor: r.panel_color,
          meta: r.created_at
            ? `Posted ${new Date(r.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric" })}`
            : null,
        })
      } else if (r.slide_type === "announcement") {
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
  const eventCount = data?.eventCount ?? 0
  const featuredShowAttendees = data?.featuredShowAttendees ?? false
  const userHasRsvped = data?.userHasRsvped ?? false
  const rsvpCount = data?.rsvpCount ?? 0
  const rsvpAttendees = data?.rsvpAttendees ?? []
  const forYouItems = data?.forYouItems ?? []
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

  const pulseAnswered =
    (activeQuestion?.question_type === "poll" && !pulseOption) ||
    (activeQuestion?.question_type === "scale" && !pulseScale) ||
    ((activeQuestion?.question_type === "open" || activeQuestion?.question_type === "prayer") && !pulseInput.trim())

  return (
    <div className="pb-28 md:pb-0">
      {/* ── Mobile top bar ── */}
      <div className="flex items-center justify-between px-5 pt-14 pb-4 md:hidden">
        <a href="/landing" className="flex items-center gap-2.5" style={{ textDecoration: "none" }}>
          <RingCrossLogo size={26} color="var(--plum)" />
          <span style={{ fontFamily: "var(--serif)", fontSize: 26, color: "var(--ink)", letterSpacing: "-0.01em", lineHeight: 1 }}>
            {ministryName}
          </span>
        </a>
        <button
          onClick={onGoToProfile}
          style={{
            width: 36, height: 36, borderRadius: 999, overflow: "hidden",
            background: "var(--plum)", border: "1px solid var(--line)",
            display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
          }}
          aria-label="Your profile"
        >
          {avatarUrl ? (
            <img src={avatarUrl} alt="Profile" decoding="async" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
          ) : (
            <span style={{ color: "var(--cream)", fontWeight: 700, fontSize: 11, fontFamily: "var(--sans)" }}>
              {getInitials(profile.name)}
            </span>
          )}
        </button>
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

      {/* Desktop: hero header */}
      <TabPageHeader className="justify-between" style={{ gap: "var(--space-8)" }}>
        <PageTitle eyebrow={dateLabel} title={greetingNode} style={{ maxWidth: 640 }} />
        {canCurateHome && <HeaderActionButton label="Curate hero" onClick={() => setManagerOpen(true)} />}
      </TabPageHeader>

      {/* Desktop: main content */}
      <div
        className="hidden md:block px-14"
        style={{ paddingTop: "var(--space-8)", paddingBottom: "var(--space-9)" }}
      >

        {/* Up Next — curated carousel, else fall back to pinned-or-latest announcement.
            "Featured" section eyebrow is the constant frame element above every state.
            While the home payload loads, only this region skeletons (same --hero-h
            footprint) — the header/chat strip around it paint immediately from props. */}
        {loading ? (
          <HomeHeroSkeleton />
        ) : (
          <HeroSectionLabel offsetForArrows={slides.length > 1} breathe />
        )}
        {!loading && (slides.length > 0 ? (
          <HomeHeroCarousel
            slides={slides}
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
          <HeroFrame>
            <UpNextCard
              fill
              label="Up next"
              labelAccent
              title={heroAnn.title}
              body={heroAnn.body}
              isEvent={heroAnn.is_event}
              imageUrl={heroAnn.image_url}
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
          <HeroFrame>
            <UpNextCard
              fill
              label="Latest"
              labelAccent={false}
              title={latestAnn.title}
              body={latestAnn.body}
              isEvent={false}
              imageUrl={latestAnn.image_url}
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

        {/* ── Pastor Pulse — desktop ── */}
        {activeQuestion && !hasResponded && !isPastorRole && (
          <CentralCard variant="callout" radius="var(--r-callout)" style={{ marginTop: 22 }} padding="28px 32px">
            {pulseSubmitted ? (
              <div style={{ textAlign: "center", padding: "16px 0" }}>
                <div style={{ ...EYEBROW, marginBottom: 8 }}>Response received</div>
                <CardTitle size={22}>Thanks for sharing.</CardTitle>
                <p style={{ fontSize: 13, color: "var(--muted-text)", marginTop: 6 }}>
                  Your response was received anonymously.
                </p>
              </div>
            ) : (
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 36, alignItems: "start" }}>
                <div>
                  <div style={EYEBROW}>
                    Pastor Pulse · {pulseTypeLabel(activeQuestion.question_type)}
                  </div>
                  <CardTitle size={24} style={{ marginTop: 8 }}>
                    {activeQuestion.question_text}
                  </CardTitle>
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  {activeQuestion.question_type === "poll" && activeQuestion.options && (
                    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                      {activeQuestion.options.map((opt, i) => (
                        <button
                          key={`${opt}-${i}`}
                          onClick={() => setPulseOption(opt)}
                          style={{
                            padding: "9px 14px",
                            borderRadius: "var(--r-input)",
                            border: `1.5px solid ${pulseOption === opt ? "var(--plum)" : "var(--line-2)"}`,
                            background: pulseOption === opt ? "var(--ivory)" : "transparent",
                            color: pulseOption === opt ? "var(--plum)" : "var(--body)",
                            fontSize: 14,
                            fontWeight: pulseOption === opt ? 500 : 400,
                            cursor: "pointer",
                            textAlign: "left",
                            fontFamily: "var(--sans)",
                          }}
                        >
                          {opt}
                        </button>
                      ))}
                    </div>
                  )}
                  {activeQuestion.question_type === "scale" && (
                    <div style={{ display: "flex", gap: 8 }}>
                      {[1, 2, 3, 4, 5].map((n) => (
                        <button
                          key={n}
                          onClick={() => setPulseScale(n)}
                          style={{
                            flex: 1,
                            aspectRatio: "1",
                            borderRadius: "var(--r-input)",
                            border: `1.5px solid ${pulseScale === n ? "var(--plum)" : "var(--line-2)"}`,
                            background: pulseScale === n ? "var(--ivory)" : "transparent",
                            color: pulseScale === n ? "var(--plum)" : "var(--ink)",
                            fontSize: 16,
                            fontWeight: 600,
                            cursor: "pointer",
                            fontFamily: "var(--sans)",
                          }}
                        >
                          {n}
                        </button>
                      ))}
                    </div>
                  )}
                  {(activeQuestion.question_type === "open" || activeQuestion.question_type === "prayer") && (
                    <textarea
                      value={pulseInput}
                      onChange={e => setPulseInput(e.target.value)}
                      placeholder={activeQuestion.question_type === "prayer" ? "Share your prayer request…" : "Share your thoughts…"}
                      rows={3}
                      style={{
                        width: "100%",
                        padding: "10px 12px",
                        borderRadius: "var(--r-input)",
                        border: "1px solid var(--line-2)",
                        background: "var(--cream-2)",
                        color: "var(--ink)",
                        fontSize: 14,
                        fontFamily: "var(--sans)",
                        resize: "none",
                        boxSizing: "border-box",
                        outline: "none",
                      }}
                    />
                  )}
                  <CentralButton
                    onClick={handlePulseSubmit}
                    disabled={pulseSubmitting || pulseAnswered}
                    style={{ justifyContent: "center" }}
                  >
                    {pulseSubmitting ? "Submitting…" : "Submit anonymously"}
                  </CentralButton>
                </div>
              </div>
            )}
          </CentralCard>
        )}

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

        {/* Mobile greeting header */}
        <PageTitle eyebrow={dateLabel} title={greetingNode} titleSize={34} style={{ marginBottom: "var(--space-8)" }}>
          {(eventCount > 0 || totalUnread > 0) && (
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 10 }}>
              {eventCount > 0 && (
                <span style={{ fontSize: 11, color: "var(--muted-text)", fontFamily: "var(--sans)" }}>
                  {eventCount} event{eventCount !== 1 ? "s" : ""}
                </span>
              )}
              {totalUnread > 0 && (
                <span style={{ fontSize: 11, color: "var(--muted-text)", fontFamily: "var(--sans)" }}>
                  {totalUnread} unread
                </span>
              )}
            </div>
          )}
        </PageTitle>

        <div className="flex flex-col" style={{ gap: "var(--space-9)" }}>

          {/* ── Up Next — mobile ── */}
          <section>
            <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 12 }}>
              <div style={{ ...EYEBROW_STYLE, color: "var(--plum)" }}>
                Up next
              </div>
              <button
                onClick={onSeeAnnouncements}
                style={{ display: "flex", alignItems: "center", gap: 2, fontSize: 12, color: "var(--muted-text)", background: "none", border: "none", cursor: "pointer", fontFamily: "var(--sans)" }}
              >
                See all <ChevronRight style={{ width: 12, height: 12 }} />
              </button>
            </div>

            {/* Section header above paints immediately; only the fetch-dependent
                card area skeletons (label lives in the real header, so hide it). */}
            {loading ? (
              <HomeHeroSkeleton showLabel={false} />
            ) : slides.length > 0 ? (
              <HomeHeroCarousel
                slides={slides}
                mobile
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
              <UpNextCard
                label="Up next"
                labelAccent
                title={heroAnn.title}
                body={heroAnn.body}
                isEvent={heroAnn.is_event}
                imageUrl={heroAnn.image_url}
                postedDate={heroAnn.created_at}
                eventDetail={heroAnn.is_event && heroAnn.event_date ? { startDate: heroAnn.event_date, endDate: heroAnn.event_date, allDay: false, location: null } : undefined}
                userHasRsvped={userHasRsvped}
                rsvping={rsvping}
                rsvpCount={rsvpCount}
                attendees={rsvpAttendees}
                showAttendees={showAttendeeList}
                onRsvp={handleHomeRsvp}
                onDetails={() => onOpenAnnouncement(heroAnn.id)}
                mobile
              />
            ) : latestAnn ? (
              <UpNextCard
                label="Latest"
                labelAccent={false}
                title={latestAnn.title}
                body={latestAnn.body}
                isEvent={false}
                imageUrl={latestAnn.image_url}
                postedDate={latestAnn.created_at}
                onDetails={() => onOpenAnnouncement(latestAnn.id)}
                mobile
              />
            ) : (
              <CentralCard
                style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 8, textAlign: "center" }}
                padding="32px 24px"
              >
                <Calendar style={{ width: 28, height: 28, color: "var(--dashed)" }} />
                <p style={{ fontSize: 14, fontWeight: 600, color: "var(--ink)", fontFamily: "var(--sans)" }}>No upcoming events</p>
                <p style={{ fontSize: 12, color: "var(--muted-text)", fontFamily: "var(--sans)" }}>Check back when events are posted.</p>
              </CentralCard>
            )}
          </section>

          {/* ── Pastor Pulse — mobile ── */}
          {activeQuestion && !hasResponded && !isPastorRole && (
            <section>
              {pulseSubmitted ? (
                <CentralCard variant="callout" padding="24px" style={{ textAlign: "center" }}>
                  <div style={{ ...EYEBROW, marginBottom: 8 }}>Response received</div>
                  <CardTitle size={20}>Thanks for sharing.</CardTitle>
                  <p style={{ fontSize: 12, color: "var(--muted-text)", marginTop: 6, fontFamily: "var(--sans)" }}>
                    Your response was received anonymously.
                  </p>
                </CentralCard>
              ) : (
                <CentralCard variant="callout" padding="24px">
                  <div style={EYEBROW}>
                    Pastor Pulse · {pulseTypeLabel(activeQuestion.question_type)}
                  </div>
                  <CardTitle size={22} style={{ margin: "8px 0 14px" }}>
                    {activeQuestion.question_text}
                  </CardTitle>

                  {activeQuestion.question_type === "poll" && activeQuestion.options && (
                    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                      {activeQuestion.options.map((opt, i) => (
                        <button
                          key={`${opt}-${i}`}
                          onClick={() => setPulseOption(opt)}
                          style={{
                            padding: "10px 14px",
                            borderRadius: "var(--r-input)",
                            border: `1.5px solid ${pulseOption === opt ? "var(--plum)" : "var(--line-2)"}`,
                            background: pulseOption === opt ? "var(--ivory)" : "transparent",
                            color: pulseOption === opt ? "var(--plum)" : "var(--body)",
                            fontSize: 14,
                            fontWeight: pulseOption === opt ? 500 : 400,
                            cursor: "pointer",
                            textAlign: "left",
                            fontFamily: "var(--sans)",
                          }}
                        >
                          {opt}
                        </button>
                      ))}
                    </div>
                  )}

                  {activeQuestion.question_type === "scale" && (
                    <div style={{ display: "flex", gap: 8 }}>
                      {[1, 2, 3, 4, 5].map((n) => (
                        <button
                          key={n}
                          onClick={() => setPulseScale(n)}
                          style={{
                            flex: 1,
                            aspectRatio: "1",
                            borderRadius: "var(--r-input)",
                            border: `1.5px solid ${pulseScale === n ? "var(--plum)" : "var(--line-2)"}`,
                            background: pulseScale === n ? "var(--ivory)" : "transparent",
                            color: pulseScale === n ? "var(--plum)" : "var(--ink)",
                            fontSize: 16,
                            fontWeight: 600,
                            cursor: "pointer",
                            fontFamily: "var(--sans)",
                          }}
                        >
                          {n}
                        </button>
                      ))}
                    </div>
                  )}

                  {(activeQuestion.question_type === "open" || activeQuestion.question_type === "prayer") && (
                    <textarea
                      value={pulseInput}
                      onChange={e => setPulseInput(e.target.value)}
                      placeholder={activeQuestion.question_type === "prayer" ? "Share your prayer request…" : "Share your thoughts…"}
                      rows={3}
                      style={{
                        width: "100%",
                        padding: "10px 12px",
                        borderRadius: "var(--r-input)",
                        border: "1px solid var(--line-2)",
                        background: "var(--cream-2)",
                        color: "var(--ink)",
                        fontSize: 14,
                        fontFamily: "var(--sans)",
                        resize: "none",
                        boxSizing: "border-box",
                        outline: "none",
                      }}
                    />
                  )}

                  <CentralButton
                    onClick={handlePulseSubmit}
                    disabled={pulseSubmitting || pulseAnswered}
                    style={{ marginTop: 12, width: "100%", justifyContent: "center" }}
                  >
                    {pulseSubmitting ? "Submitting…" : "Submit anonymously"}
                  </CentralButton>
                </CentralCard>
              )}
            </section>
          )}

          {/* ── For You — mobile ── */}
          {forYouItems.length > 0 && (
            <section>
              <SectionHeader
                eyebrow="Announcements"
                title="For you"
                titleSize={22}
                action={
                  <button
                    onClick={onSeeAnnouncements}
                    style={{ display: "flex", alignItems: "center", gap: 2, fontSize: 12, color: "var(--muted-text)", background: "none", border: "none", cursor: "pointer", fontFamily: "var(--sans)" }}
                  >
                    See all <ChevronRight style={{ width: 12, height: 12 }} />
                  </button>
                }
                style={{ marginBottom: 12 }}
              />

              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {forYouItems.map((a) => (
                  <CentralCard key={a.id} padding={16}>
                    <div style={{ display: "flex", alignItems: "flex-start", gap: 10, justifyContent: "space-between" }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <span
                          style={{
                            fontSize: 10,
                            letterSpacing: "0.5px",
                            fontWeight: 500,
                            textTransform: "uppercase",
                            color: a.is_sub_pinned ? "var(--plum)" : "var(--muted-text)",
                            fontFamily: "var(--sans)",
                          }}
                        >
                          {a.is_sub_pinned ? "For you" : a.is_event ? "Event" : "Post"}
                        </span>
                        <CardTitle
                          size={18}
                          style={{
                            marginTop: 4,
                            overflow: "hidden",
                            display: "-webkit-box",
                            WebkitLineClamp: 1,
                            WebkitBoxOrient: "vertical",
                          } as React.CSSProperties}
                        >
                          {a.title}
                        </CardTitle>
                      </div>
                      {a.is_event ? (
                        <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
                          <button
                            onClick={() => handleForYouRsvp(a.id)}
                            style={{
                              fontSize: 12,
                              fontWeight: 500,
                              padding: "5px 12px",
                              borderRadius: 999,
                              border: `1px solid ${rsvpedAnnIds.has(a.id) ? "var(--line-2)" : "var(--plum)"}`,
                              background: rsvpedAnnIds.has(a.id) ? "var(--ivory)" : "transparent",
                              color: rsvpedAnnIds.has(a.id) ? "var(--muted-text)" : "var(--plum)",
                              cursor: "pointer",
                              fontFamily: "var(--sans)",
                            }}
                          >
                            {rsvpedAnnIds.has(a.id) ? "Going" : "RSVP"}
                          </button>
                          <button
                            onClick={() => onOpenAnnouncement(a.id)}
                            style={{ fontSize: 12, color: "var(--muted-text)", background: "none", border: "none", cursor: "pointer", fontFamily: "var(--sans)" }}
                          >
                            View →
                          </button>
                        </div>
                      ) : (
                        <button
                          onClick={() => onOpenAnnouncement(a.id)}
                          style={{ fontSize: 12, color: "var(--muted-text)", background: "none", border: "none", cursor: "pointer", flexShrink: 0, fontFamily: "var(--sans)" }}
                        >
                          See →
                        </button>
                      )}
                    </div>
                    {!a.is_event && (
                      <p
                        className="line-clamp-2"
                        style={{ marginTop: 6, fontSize: 12, color: "var(--body)", lineHeight: 1.5, fontFamily: "var(--sans)" }}
                      >
                        {previewBody(a.body)}
                      </p>
                    )}
                  </CentralCard>
                ))}
              </div>
            </section>
          )}

          {/* ── Chats — mobile ── */}
          {top3.length > 0 && (
            <ChatsSection
              chats={top3}
              totalUnread={totalUnread}
              onSeeAll={onSeeChats}
              onOpenChat={onOpenChat}
            />
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
