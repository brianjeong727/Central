import { test, expect } from "@playwright/test"
import { createClient, type SupabaseClient } from "@supabase/supabase-js"
import ws from "ws"
import { sandbox, adminState } from "./fixtures"

// Wave1 perf-diff verification (feat/perf-wave1, commit 50a32d1):
//   - chat-list.ts: get_chat_list now returns is_central directly (no follow-up query)
//   - chats-tab.tsx: reactions channel server-side filtered by group_id; reaction
//     INSERT carries group_id; typing broadcast throttled to 2500ms leading edge
//   - announcements-tab.tsx: feed bounded to FEED_PAGE=30 with a "Load more" control
//
// KEPT spec — these are regression-worthy user flows (reaction persistence across
// reload, central-chat flag, feed pagination + RSVP toggle), not one-off probes.
//
// Both desktop ("hidden md:block") and mobile ("md:hidden") trees are ALWAYS
// mounted simultaneously regardless of viewport — Tailwind hides the inactive
// one via CSS, it doesn't unmount it. Every locator that could resolve to
// either tree is narrowed with `.filter({ visible: true })` (established
// convention, see e2e/mobile-pocket-sweep.spec.ts).

test.use({ storageState: adminState })

const sb = sandbox()

// Raw node-side realtime client (mirrors e2e/fixtures.ts' ws-transport pattern),
// used only as an independent "other party" observer for the typing broadcast —
// the sandbox has no working second user session for this run (see test report),
// so this listens on the same public channel the real composer broadcasts to,
// exactly as a second browser tab's ChatScreen subscription would.
type ClientOptions = NonNullable<Parameters<typeof createClient>[2]>
type RealtimeTransport = NonNullable<NonNullable<ClientOptions["realtime"]>["transport"]>
const wsTransport = ws as unknown as RealtimeTransport

function anonRealtimeClient(): SupabaseClient {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false }, realtime: { transport: wsTransport } },
  )
}

test.describe("Wave1 — mobile chat list + reactions + typing (390x844)", () => {
  test.use({ viewport: { width: 390, height: 844 } })

  test.afterAll(async () => {
    await sb.deleteGroupsByPrefix()
  })

  test("central chat shows solid chip via is_central; reaction send/toggle persists across reload; typing broadcast throttled", async ({ page }) => {
    const adminId = await sb.adminUserId()

    // ── central-chat flag (is_central from get_chat_list, no follow-up query) ──
    const { data: centralGroup, error: cgErr } = await sb.client
      .from("groups")
      .select("id, name")
      .eq("ministry_id", sb.ministryId)
      .eq("is_central_chat", true)
      .limit(1)
      .maybeSingle()
    expect(cgErr).toBeNull()

    // ── arrange: a "my" chat with the admin as its only member — created
    // BEFORE the first page load so the initial get_chat_list fetch already
    // includes it (the chats list has no live-refresh channel for "a chat I
    // was just added to" outside HomeApp's own-memberships listener). ────────
    const group = await sb.createGroup({ name: "Reaction Test", memberIds: [adminId] })
    const groupId = group.id

    await page.goto("/home?tab=chats")
    // Church tab is the default subTab (mobile Pocket filter chip).
    await expect(page.getByRole("button", { name: "Church" }).filter({ visible: true })).toBeVisible()

    if (centralGroup) {
      const row = page.getByRole("button", { name: new RegExp((centralGroup as { name: string }).name) }).filter({ visible: true }).first()
      await expect(row).toBeVisible()
      const chip = row.locator("span").first()
      const bg = await chip.evaluate((el) => getComputedStyle(el).backgroundColor)
      // --plum = #3E1540 = rgb(62, 21, 64)
      expect(bg).toBe("rgb(62, 21, 64)")
    } else {
      test.info().annotations.push({ type: "note", description: "sandbox ministry has no is_central_chat group — skipped chip assertion" })
    }

    await page.getByRole("button", { name: "My chats" }).filter({ visible: true }).click()
    await page.getByRole("button", { name: /E2E::Reaction Test/ }).filter({ visible: true }).click()

    // ── send a message (optimistic) ──────────────────────────────────────────
    const composer = page.getByPlaceholder(/^Message /).filter({ visible: true })
    await expect(composer).toBeVisible()
    await composer.fill("hello from wave1 e2e")
    await composer.press("Enter")
    const messageBubble = page.getByText("hello from wave1 e2e", { exact: true }).filter({ visible: true }).first()
    await expect(messageBubble).toBeVisible()

    // ── react: short tap (<400ms, Convention #7) opens the emoji bar ─────────
    await messageBubble.click()
    const thumbsUp = page.getByRole("button", { name: "👍" }).filter({ visible: true }).first()
    await expect(thumbsUp).toBeVisible()
    await thumbsUp.click()

    // Optimistic: reaction pill appears immediately.
    const reactionPill = page.getByRole("button", { name: /👍\s*1/ }).filter({ visible: true })
    await expect(reactionPill).toBeVisible()

    // Persisted: reload and reopen the same chat via the ?chat= deep link —
    // proves the INSERT carried group_id (not relying on the realtime echo).
    await page.reload()
    await page.waitForURL(/\/home/)
    await expect(page.getByRole("button", { name: /👍\s*1/ }).filter({ visible: true })).toBeVisible({ timeout: 10000 })

    // ── un-react: same emoji toggles off (handleReact DELETE path) ───────────
    await page.getByRole("button", { name: /👍\s*1/ }).filter({ visible: true }).click()
    await expect(page.getByRole("button", { name: /👍\s*1/ }).filter({ visible: true })).not.toBeVisible()

    await page.reload()
    await page.waitForURL(/\/home/)
    await expect(page.getByText("hello from wave1 e2e", { exact: true }).filter({ visible: true }).first()).toBeVisible()
    await expect(page.getByRole("button", { name: /👍\s*1/ }).filter({ visible: true })).not.toBeVisible()

    // ── typing throttle: independent observer subscribes to the same
    // typing-{groupId} broadcast channel the real composer sends on ────────────
    const observer = anonRealtimeClient()
    const events: { isTyping: boolean; t: number }[] = []
    const channel = observer.channel(`typing-${groupId}`)
    channel.on("broadcast", { event: "typing" }, (msg) => {
      const payload = msg.payload as { isTyping: boolean }
      events.push({ isTyping: payload.isTyping, t: Date.now() })
    })
    await new Promise<void>((resolve, reject) => {
      channel.subscribe((status) => {
        if (status === "SUBSCRIBED") resolve()
        if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") reject(new Error(`observer channel failed: ${status}`))
      })
    })

    const composer2 = page.getByPlaceholder(/^Message /).filter({ visible: true })
    // Sustained fast keystrokes over ~3.2s — long enough that a second
    // leading-edge CAN legitimately fire once >=2500ms has elapsed since the
    // first (a fresh leading edge, not a violation). What Wave1 actually
    // changed is the throttle WINDOW (1000ms -> 2500ms): with the old 1000ms
    // throttle this loop would produce ~3 events roughly 1000-1300ms apart;
    // with the new 2500ms throttle it produces at most 2, spaced >=2400ms
    // (small slack for timer jitter) apart.
    const start = Date.now()
    while (Date.now() - start < 3200) {
      await composer2.press("a")
      await page.waitForTimeout(150)
    }
    // Idle past the 2500ms stop-timer so "stopped" fires.
    await expect.poll(() => events.some((e) => !e.isTyping), { timeout: 4000 }).toBe(true)

    await channel.unsubscribe()
    await observer.removeAllChannels()

    const trueEvents = events.filter((e) => e.isTyping)
    expect(trueEvents.length, `expected 1-2 leading-edge typing:true events in ~3.2s of keystrokes (2500ms throttle), got ${trueEvents.length}: ${JSON.stringify(events)}`).toBeGreaterThanOrEqual(1)
    expect(trueEvents.length).toBeLessThanOrEqual(2)
    for (let i = 1; i < trueEvents.length; i++) {
      const gap = trueEvents[i].t - trueEvents[i - 1].t
      expect(gap, `leading-edge typing:true events must be >=2400ms apart (2500ms throttle), got ${gap}ms: ${JSON.stringify(events)}`).toBeGreaterThanOrEqual(2400)
    }
    const falseEvents = events.filter((e) => !e.isTyping)
    expect(falseEvents.length).toBeGreaterThanOrEqual(1)
  })
})

test.describe("Wave1 — announcements feed bounding + Load more + RSVP (1440x900)", () => {
  test.afterAll(async () => {
    await sb.deleteAnnouncementsByPrefix("E2E::wave1-")
  })

  test("feed bounds to 30 with Load more; pinned sorts first; RSVP stays a strict toggle", async ({ page }) => {
    const adminId = await sb.adminUserId()

    // Seed 33 filler + 1 pinned + 1 RSVP-target event so the feed is guaranteed
    // to exceed FEED_PAGE=30 regardless of pre-existing sandbox content.
    for (let i = 0; i < 33; i++) {
      await sb.createAnnouncement({ title: `wave1-bulk-${i}`, body: "bulk load-more filler", created_by: adminId })
    }
    await sb.createAnnouncement({ title: "wave1-pinned", body: "should sort first", is_pinned: true, created_by: adminId })
    const rsvpEvent = await sb.createAnnouncement({ title: "wave1-rsvp-event", body: "rsvp toggle check", is_event: true, event_date: new Date(Date.now() + 86400000).toISOString(), created_by: adminId })

    await page.goto("/home?tab=announcements")
    await expect(page.getByRole("heading", { name: "Announcements" }).filter({ visible: true })).toBeVisible()

    // Pinned-first: the pinned hero (desktop h2) renders our just-created pinned row.
    // 15s timeout absorbs a cold dev-server first-paint (route compile + feed SWR) —
    // the default 5s races the announcements fetch on the suite's first hit here.
    await expect(page.getByText("E2E::wave1-pinned").filter({ visible: true }).first()).toBeVisible({ timeout: 15000 })

    // Load more control present (desktop secondary button; the mobile "Load
    // more" text button also exists in the DOM but is display:none at 1440).
    const loadMore = page.getByRole("button", { name: "Load more" }).filter({ visible: true })
    await expect(loadMore).toBeVisible()

    const rsvpEventText = page.getByText("E2E::wave1-rsvp-event").filter({ visible: true }).first()
    const isVisibleBeforeLoadMore = await rsvpEventText.isVisible().catch(() => false)

    await loadMore.click()
    // After Load more, the pinned hero must still be in place and the click
    // must not error.
    await expect(page.getByText("E2E::wave1-pinned").filter({ visible: true }).first()).toBeVisible()

    if (!isVisibleBeforeLoadMore) {
      await expect(rsvpEventText).toBeVisible({ timeout: 10000 })
    }

    // ── RSVP strict toggle (Convention #4/#10) ───────────────────────────────
    const card = page.locator("article", { has: page.getByText("E2E::wave1-rsvp-event") }).filter({ visible: true })
    await card.scrollIntoViewIfNeeded()
    const rsvpButton = card.getByRole("button", { name: /^RSVP$|^Going/ }).first()
    await expect(rsvpButton).toBeVisible()
    await expect(rsvpButton).toHaveText(/^RSVP$/)
    await rsvpButton.click()
    await expect(rsvpButton).toHaveText(/Going/, { timeout: 5000 })

    // The UI flips optimistically before the network write lands (Convention
    // #4) — poll rather than reading the DB the instant the text changes.
    await expect.poll(async () => {
      const { data } = await sb.client.from("rsvps").select("id").eq("announcement_id", rsvpEvent.id).eq("user_id", adminId)
      return data?.length ?? 0
    }, { timeout: 5000 }).toBe(1)

    await rsvpButton.click()
    await expect(rsvpButton).toHaveText(/^RSVP$/, { timeout: 5000 })
    await expect.poll(async () => {
      const { data } = await sb.client.from("rsvps").select("id").eq("announcement_id", rsvpEvent.id).eq("user_id", adminId)
      return data?.length ?? 0
    }, { timeout: 5000 }).toBe(0)
  })
})
