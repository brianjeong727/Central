"use client"

import { useState, useEffect } from "react"
import { ChevronRight, Bell, Calendar } from "lucide-react"
import { createClient } from "@/lib/supabase"
import { ChatsSection } from "@/components/ui/chats-section"
import { Spinner, RingCrossLogo, HeaderActionButton, EYEBROW_STYLE } from "../components/shared"
import { getInitials, previewBody } from "../utils"
import { respondToGradCheck } from "@/app/actions/auto-chats"
import { CentralCard, SectionHeader, CentralButton, UpNextCard, PageTitle, CardTitle, ChatStrip, InsetHairline, TabPageHeader, HomeHeroCarousel, HeroFrame, HeroSectionLabel } from "@/components/central"
import type { HeroSlide } from "@/components/central"
import { HomeSlideManager } from "../components/home-slide-manager"
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

  const [heroAnn, setHeroAnn] = useState<Announcement | null>(null)
  const [latestAnn, setLatestAnn] = useState<Announcement | null>(null)
  const [userHasRsvped, setUserHasRsvped] = useState(false)
  const [rsvping, setRsvping] = useState(false)
  const [rsvpCount, setRsvpCount] = useState(0)
  const [rsvpAttendees, setRsvpAttendees] = useState<{ user_id: string; name: string }[]>([])
  const [featuredShowAttendees, setFeaturedShowAttendees] = useState(false)

  const [forYouItems, setForYouItems] = useState<Announcement[]>([])
  const [rsvpedAnnIds, setRsvpedAnnIds] = useState<Set<string>>(new Set())
  const [eventCount, setEventCount] = useState(0)

  // ── Curated home hero carousel ──
  const [slides, setSlides] = useState<HeroSlide[]>([])
  const [slideRsvpedIds, setSlideRsvpedIds] = useState<Set<string>>(new Set())
  const [slideRsvpCounts, setSlideRsvpCounts] = useState<Record<string, number>>({})
  const [slideRsvpAttendees, setSlideRsvpAttendees] = useState<Record<string, RsvpAttendee[]>>({})
  const [slideShowAttendeesIds, setSlideShowAttendeesIds] = useState<Set<string>>(new Set())
  const [slideRsvping, setSlideRsvping] = useState(false)
  const [managerOpen, setManagerOpen] = useState(false)
  const [slidesRefreshKey, setSlidesRefreshKey] = useState(0)
  const canCurateHome = ["admin", "leader", "deacon", "elder", "pastor"].includes(userRole.toLowerCase())
  const [loading, setLoading] = useState(true)
  const [homeVerse, setHomeVerse] = useState<{ reference: string; text: string } | null>(null)

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
  const showAttendeeList = rsvpAttendees.length > 0 && (isLeaderOrAdmin || featuredShowAttendees)
  const roleLabel = userRole.charAt(0).toUpperCase() + userRole.slice(1).toLowerCase()
  const dateLabel = new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })
  const firstName = profile.name.split(" ")[0]
  const hour = new Date().getHours()
  const greetingPrefix = hour < 12 ? "Good morning, " : hour < 17 ? "Good afternoon, " : hour < 21 ? "Good evening, " : "Good night, "
  const greetingNode = <>{greetingPrefix}<span style={{ color: "var(--plum)" }}>{roleLabel}</span> {firstName}</>


  useEffect(() => {
    async function load() {
      const [
        { data: anns },
        { data: prayerProfile },
        { data: verses },
      ] = await Promise.all([
        supabase
          .from("announcements")
          .select("*")
          .eq("ministry_id", ministryId)
          .order("is_pinned", { ascending: false })
          .order("created_at", { ascending: false })
          .limit(10),
        supabase
          .from("profiles")
          .select("name, pray_for_me")
          .eq("ministry_id", ministryId)
          .not("pray_for_me", "is", null)
          .neq("id", profile.id)
          .limit(1)
          .maybeSingle(),
        supabase
          .from("home_verses")
          .select("reference, text")
          .eq("ministry_id", ministryId)
          .order("order_index", { ascending: true }),
      ])

      // suppress unused variable warning for prayerProfile (state was removed but fetch kept)
      void prayerProfile

      if (verses && verses.length > 0) {
        const now = new Date()
        const dayOfYear = Math.floor(
          (now.getTime() - new Date(now.getFullYear(), 0, 0).getTime()) / 86_400_000
        )
        const v = verses[dayOfYear % verses.length] as { reference: string; text: string }
        setHomeVerse(v)
      }
      const list = anns ?? []
      const hero = list.find((a) => a.is_pinned) ?? list[0] ?? null
      setHeroAnn(hero)
      setLatestAnn(list[0] ?? null)
      setEventCount(list.filter((a) => a.is_event).length)

      const [{ data: myRsvps }, { data: heroRsvpRows }] = await Promise.all([
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
      ])

      const userRsvpIds = new Set((myRsvps ?? []).map((r) => r.announcement_id))
      setRsvpedAnnIds(userRsvpIds)

      if (hero) {
        setFeaturedShowAttendees(hero.show_attendees ?? false)
        setUserHasRsvped(userRsvpIds.has(hero.id))
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

      const heroId = hero?.id
      const forYou = list
        .filter((a) => a.id !== heroId)
        .sort((a, b) => {
          const aScore = (a.is_sub_pinned ? 1000 : 0) + (a.is_event && !userRsvpIds.has(a.id) ? 10 : 0)
          const bScore = (b.is_sub_pinned ? 1000 : 0) + (b.is_event && !userRsvpIds.has(b.id) ? 10 : 0)
          return bScore - aScore
        })
        .slice(0, 3)
      setForYouItems(forYou)

      // ── Curated hero slides: resolve each home_slides row to LIVE referenced data ──
      const { data: slideRows } = await supabase
        .from("home_slides")
        .select("id, slide_type, announcement_id, calendar_event_id, order_index, image_url, caption, eyebrow, panel_color, created_at")
        .eq("ministry_id", ministryId)
        .eq("is_active", true)
        .order("order_index", { ascending: true })

      const rows = slideRows ?? []
      if (rows.length === 0) {
        setSlides([])
      } else {
        const annIds = rows.filter((r) => r.slide_type === "announcement").map((r) => r.announcement_id).filter(Boolean) as string[]
        const evIds = rows.filter((r) => r.slide_type === "event").map((r) => r.calendar_event_id).filter(Boolean) as string[]

        const [{ data: slideAnns }, { data: slideEvents }] = await Promise.all([
          annIds.length
            ? supabase.from("announcements").select("id, title, body, is_event").in("id", annIds).eq("ministry_id", ministryId)
            : Promise.resolve({ data: [] as { id: string; title: string; body: string; is_event: boolean }[] }),
          evIds.length
            ? supabase
                .from("calendar_events")
                .select("id, title, description, location, start_date, end_date, all_day, linked_announcement_id")
                .in("id", evIds)
                .eq("ministry_id", ministryId)
            : Promise.resolve({ data: [] as { id: string; title: string; description: string | null; location: string | null; start_date: string; end_date: string; all_day: boolean; linked_announcement_id: string | null }[] }),
        ])

        const annMap = new Map((slideAnns ?? []).map((a) => [a.id, a]))
        const evMap = new Map((slideEvents ?? []).map((e) => [e.id, e]))

        const built: HeroSlide[] = []
        for (const r of rows) {
          if (r.slide_type === "photo") {
            if (!r.image_url) continue
            built.push({
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
            built.push({ kind: "announcement", key: r.id, announcementId: a.id, title: a.title, body: a.body, isEvent: a.is_event })
          } else {
            const e = evMap.get(r.calendar_event_id ?? "")
            if (!e) continue
            built.push({
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
        setSlides(built)

        // RSVP wiring keyed on announcement_id (event slides reuse their linked announcement).
        const rsvpAnnIds = new Set<string>()
        for (const s of built) {
          if (s.kind === "announcement" && s.isEvent) rsvpAnnIds.add(s.announcementId)
          else if (s.kind === "event" && s.linkedAnnouncementId) rsvpAnnIds.add(s.linkedAnnouncementId)
        }
        const rsvpIdArr = [...rsvpAnnIds]

        if (rsvpIdArr.length === 0) {
          setSlideRsvpedIds(new Set())
          setSlideRsvpCounts({})
          setSlideRsvpAttendees({})
          setSlideShowAttendeesIds(new Set())
        } else {
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

          const allUserIds = [...new Set((allR ?? []).map((r) => r.user_id))]
          let nameById = new Map<string, string>()
          if (allUserIds.length) {
            const { data: profs } = await supabase.from("profiles").select("id, name").in("id", allUserIds).eq("ministry_id", ministryId)
            nameById = new Map((profs ?? []).map((p) => [p.id, p.name]))
          }

          const attendeesMap: Record<string, RsvpAttendee[]> = {}
          for (const [annId, uids] of Object.entries(byAnnUserIds)) {
            attendeesMap[annId] = uids.map((uid) => ({ user_id: uid, name: nameById.get(uid) ?? "" }))
          }

          setSlideRsvpedIds(new Set((myR ?? []).map((r) => r.announcement_id)))
          setSlideRsvpCounts(counts)
          setSlideRsvpAttendees(attendeesMap)
          setSlideShowAttendeesIds(new Set((annMeta ?? []).filter((a) => a.show_attendees).map((a) => a.id)))
        }
      }

      setLoading(false)
    }
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile.id, slidesRefreshKey])

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

  async function handleSlideRsvp(annId: string) {
    if (slideRsvping) return
    setSlideRsvping(true)
    const has = slideRsvpedIds.has(annId)
    setSlideRsvpedIds((prev) => {
      const s = new Set(prev)
      if (has) s.delete(annId)
      else s.add(annId)
      return s
    })
    setSlideRsvpCounts((prev) => ({ ...prev, [annId]: Math.max(0, (prev[annId] ?? 0) + (has ? -1 : 1)) }))
    setSlideRsvpAttendees((prev) => {
      const cur = prev[annId] ?? []
      const next = has
        ? cur.filter((a) => a.user_id !== profile.id)
        : [...cur, { user_id: profile.id, name: profile.name }]
      return { ...prev, [annId]: next }
    })
    if (has) {
      await supabase.from("rsvps").delete().eq("announcement_id", annId).eq("user_id", profile.id)
    } else {
      await supabase.from("rsvps").upsert({ announcement_id: annId, user_id: profile.id }, { onConflict: "announcement_id,user_id" })
    }
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
            <img src={avatarUrl} alt="Profile" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
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

      {loading ? (
        <div className="px-5 md:px-14 pt-8"><Spinner /></div>
      ) : (
        <>
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
                "Featured" section eyebrow is the constant frame element above every state. */}
            <HeroSectionLabel offsetForArrows={slides.length > 1} />
            {slides.length > 0 ? (
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
            )}

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
                          {activeQuestion.options.map((opt) => (
                            <button
                              key={opt}
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

                {slides.length > 0 ? (
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
                          {activeQuestion.options.map((opt) => (
                            <button
                              key={opt}
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
        </>
      )}

      {managerOpen && (
        <HomeSlideManager
          ministryId={ministryId}
          onClose={() => {
            setManagerOpen(false)
            setSlidesRefreshKey((k) => k + 1)
          }}
        />
      )}
    </div>
  )
}
