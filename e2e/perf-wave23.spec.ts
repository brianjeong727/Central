import { test, expect, type Page } from "@playwright/test"
import { sandbox } from "./fixtures"

// Wave2+3 perf-diff verification (feat/perf-wave1, commit 1ce5d84):
//   - proxy.ts: middleware JWT local-verify + signed central-mw routing cache
//   - chat-broadcast.ts / chats-tab.tsx / home-app.tsx: chat:{groupId} private
//     broadcast replaces postgres_changes for messages + reactions
//   - next.config.ts + MonogramChip/announcements-tab/profile-tab/home-hero-carousel:
//     next/image pipeline for hot avatar/announcement image sites
//   - home-app.tsx / page.tsx: shell-load slimming (parallelized team queries,
//     slimmer boot profile select)
//   - chats-tab.tsx: bounded message fetch (latest 50 + Load older) — pre-existing
//     from wave1, re-verified here
//
// ── Both regressions found in the first verification pass are now FIXED (commit
// 1ce5d84, engineer live-verified) — this spec has been updated to assert the
// FIXED behavior, not the broken one. See test-report-w23.md for the full history:
//   1. proxy.ts's routing-data embed (`ministries(status)`) was ambiguous
//      (profiles↔ministries carries TWO FKs) → PGRST201 on every cache-miss →
//      every real login landed on /ministries. Fixed by FK-qualifying the embed
//      (`ministries!profiles_ministry_id_fkey(status)`) plus a defensive-degradation
//      path. Real login now reaches /home directly — no workaround needed.
//   2. chat-broadcast.ts's subscribeChatTopic had no generation guard: a rapid
//      unsubscribe→resubscribe of the same topic (React StrictMode's dev
//      double-effect-mount) let two async auth→subscribe continuations both attach
//      a live channel to the same `chat:{groupId}` topic, double-delivering every
//      message/reaction/edit. Fixed with an identity/generation guard on the async
//      continuation + an id-based dedup guard on the regular-message handler
//      (mirroring the pre-existing system-message guard) as defense-in-depth.

test.use({ storageState: { cookies: [], origins: [] } })

const sb = sandbox()

async function mwHmac(body: string, key: string): Promise<string> {
  const enc = new TextEncoder()
  const cryptoKey = await crypto.subtle.importKey("raw", enc.encode(key), { name: "HMAC", hash: "SHA-256" }, false, ["sign"])
  const sig = await crypto.subtle.sign("HMAC", cryptoKey, enc.encode(body))
  let bin = ""
  const bytes = new Uint8Array(sig)
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i])
  return Buffer.from(bin, "binary").toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "")
}
async function signMwCookie(payload: Record<string, unknown>, key: string): Promise<string> {
  const body = Buffer.from(JSON.stringify(payload), "utf8").toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "")
  return `${body}.${await mwHmac(body, key)}`
}

const MW_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!

/** Real login through the UI. proxy.ts's routing-data regression is fixed, so this
 *  reaches /home directly — no cache-hit-cookie workaround needed anymore. */
async function login(page: Page, email: string) {
  await page.goto("/login")
  // Mobile viewport gates the email/password form behind a "Continue with email"
  // tap (Apple/Google buttons shown first); desktop shows the form directly.
  const continueWithEmail = page.getByRole("button", { name: "Continue with email" }).filter({ visible: true })
  if (await continueWithEmail.isVisible().catch(() => false)) await continueWithEmail.click()
  await page.getByPlaceholder("you@university.edu").filter({ visible: true }).fill(email)
  await page.getByPlaceholder("••••••••").filter({ visible: true }).fill(process.env.E2E_PASSWORD!)
  await page.getByRole("button", { name: "Sign in" }).filter({ visible: true }).click()
  await page.waitForURL(/\/home/, { timeout: 15000 })
  await expect(page).toHaveURL(/\/home/)
}

test.describe("Wave2+3 — AUTH/MIDDLEWARE (1440x900)", () => {
  test.use({ viewport: { width: 1440, height: 900 } })

  test("public routes load logged out; logged-out /home redirects away", async ({ page }) => {
    for (const path of ["/", "/ministries", "/terms"]) {
      const res = await page.goto(path)
      expect(res?.status(), `${path} should load logged out`).toBeLessThan(400)
    }
    const res = await page.goto("/home")
    // proxy.ts's isPublicPath branch redirects an unauthenticated /home request to
    // /landing, which itself redirects to / (app/landing/page.tsx) — unchanged by
    // wave2/3, this logic sits entirely before the routing-data block. The shell
    // must never render for a logged-out request.
    expect(new URL(page.url()).pathname).toMatch(/^\/($|landing|login)/)
    expect(res?.status()).toBeLessThan(400)
  })

  test("real login (admin AND member) lands on /home — proxy.ts embed regression fixed", async ({ page }) => {
    await login(page, process.env.E2E_ADMIN_EMAIL!)
    await expect(page.getByText(/Good (morning|afternoon|evening)/).filter({ visible: true })).toBeVisible()

    await page.context().clearCookies()
    await login(page, process.env.E2E_MEMBER_EMAIL!)
    await expect(page.getByText(/Good (morning|afternoon|evening)/).filter({ visible: true })).toBeVisible()
  })

  test("central-mw cache-hit cookie is set after a settled login; second nav is fast-path; a tampered cookie is treated as a miss and still resolves correctly (no error, no wrong route)", async ({ page, context }) => {
    await login(page, process.env.E2E_ADMIN_EMAIL!)

    // central-mw cookie is present after landing (settled steady state: active
    // ministry + complete admin profile → cached).
    const cookies = await context.cookies()
    const mwCookie = cookies.find((c) => c.name === "central-mw")
    expect(mwCookie, "central-mw cookie should be set after a settled login").toBeTruthy()

    // Second navigation with the SAME cookie present — fast cache-hit path, still /home.
    await page.goto("/home?tab=announcements", { waitUntil: "domcontentloaded" })
    await expect(page).toHaveURL(/\/home/)

    // Tamper the cookie (flip a signature char) — decodeMw must treat this as a
    // miss (never throw, never leak the old payload) and fall through to a FRESH
    // query, which now (fix applied) correctly re-resolves the same admin/ministry
    // and lands back on /home — not an error, not a wrong route.
    const tampered = mwCookie!.value.slice(0, -1) + (mwCookie!.value.endsWith("X") ? "Y" : "X")
    await context.addCookies([{ name: "central-mw", value: tampered, domain: "localhost", path: "/", httpOnly: true, secure: false }])
    const res = await page.goto("/home", { waitUntil: "domcontentloaded" })
    expect(res?.status(), "tampered cookie must never 500").toBeLessThan(500)
    await expect(page).toHaveURL(/\/home/)
  })

  test("forged cache-hit cookie (signed with the same HMAC scheme) is honored — cache-hit code path sanity check", async ({ page, context }) => {
    const adminId = await sb.adminUserId()
    const cookieVal = await signMwCookie(
      { uid: adminId, mid: sb.ministryId, role: "admin", status: "active", pc: true, exp: Math.floor(Date.now() / 1000) + 280 },
      MW_KEY,
    )
    // Still need a real session cookie (auth) — the mw cache is routing-only, not
    // an authorization bypass. Log in for real first, then overlay our own
    // independently-signed cache value to prove the cache-hit path itself works.
    await login(page, process.env.E2E_ADMIN_EMAIL!)
    await context.addCookies([{ name: "central-mw", value: cookieVal, domain: "localhost", path: "/", httpOnly: true, secure: false }])
    await page.goto("/home", { waitUntil: "domcontentloaded" })
    await expect(page).toHaveURL(/\/home/)
    await expect(page.getByText(/Good (morning|afternoon|evening)/).filter({ visible: true })).toBeVisible()
  })
})

test.describe("Wave2+3 — chat broadcast + bounded fetch + images + regression (390x844)", () => {
  test.use({ viewport: { width: 390, height: 844 } })

  test.afterAll(async () => {
    await sb.deleteGroupsByPrefix("E2E::wave23-")
    await sb.deleteAnnouncementsByPrefix("E2E::wave23-")
    const adminId = await sb.adminUserId()
    const memberId = await sb.memberUserId()
    await sb.client.from("profiles").update({ avatar_url: null }).eq("id", adminId)
    await sb.client.from("profiles").update({ avatar_url: null }).eq("id", memberId)
  })

  test("chat broadcast: send/react/edit propagate across two sessions via chat:{gid} with NO double-delivery; typing indicator; recent-chats updates", async ({ browser }) => {
    const adminId = await sb.adminUserId()
    const memberId = await sb.memberUserId()
    const group = await sb.createGroup({ name: "wave23-Broadcast Test", memberIds: [adminId, memberId] })

    const ctxA = await browser.newContext()
    const ctxB = await browser.newContext()
    // Always release both contexts, even on assertion failure, so a failure in
    // this test can never starve/slow the tests that run after it.
    try {
      const pageA = await ctxA.newPage()
      const pageB = await ctxB.newPage()

      await login(pageA, process.env.E2E_ADMIN_EMAIL!)
      await login(pageB, process.env.E2E_MEMBER_EMAIL!)

      // Capture realtime websocket join frames on pageA to confirm a `chat:` PRIVATE
      // broadcast topic is joined (not solely postgres_changes).
      const joinedTopics: string[] = []
      pageA.on("websocket", (ws) => {
        ws.on("framesent", (f) => {
          const payload = typeof f.payload === "string" ? f.payload : ""
          if (payload.includes("phx_join") && payload.includes("realtime:chat:")) {
            const m = payload.match(/realtime:(chat:[0-9a-f-]+)/)
            if (m) joinedTopics.push(m[1])
          }
        })
      })

      for (const p of [pageA, pageB]) {
        await p.goto(`/home?tab=chats&chats=my&chat=${group.id}`)
        await expect(p.getByPlaceholder(/^Message /).filter({ visible: true })).toBeVisible({ timeout: 10000 })
      }

      // Give the hub a moment to (re)join now that both ChatScreens are mounted.
      await pageA.waitForTimeout(1500)

      // ── send from A, observe on B — exactly once (double-delivery regression fixed) ──
      const composerA = pageA.getByPlaceholder(/^Message /).filter({ visible: true })
      await composerA.fill("wave23 broadcast hello")
      await composerA.press("Enter")
      await expect(pageA.getByText("wave23 broadcast hello", { exact: true }).filter({ visible: true }).first()).toBeVisible()
      await expect(pageB.getByText("wave23 broadcast hello", { exact: true }).filter({ visible: true }).first()).toBeVisible({ timeout: 10000 })
      await pageB.waitForTimeout(1000)
      // FIXED (was: chat-broadcast.ts subscribeChatTopic generation race caused a
      // double-delivered INSERT — see header comment). Asserting exactly 1 render,
      // not just "at least 1", is the whole point of this regression check.
      const dupeCountB = await pageB.getByText("wave23 broadcast hello", { exact: true }).filter({ visible: true }).count()
      expect(dupeCountB, "message must render exactly once on the receiving side (chat-broadcast.ts double-delivery regression)").toBe(1)

      expect(joinedTopics.some((t) => t === `chat:${group.id}`), `expected a private broadcast join for chat:${group.id}; observed joins: ${JSON.stringify(joinedTopics)}`).toBeTruthy()

      // ── react from B, observe on A — exactly one reaction pill, not two ──────
      const bubbleOnB = pageB.getByText("wave23 broadcast hello", { exact: true }).filter({ visible: true }).first()
      await bubbleOnB.click()
      const thumbsB = pageB.getByRole("button", { name: "👍" }).filter({ visible: true }).first()
      await expect(thumbsB).toBeVisible()
      await thumbsB.click()
      await expect(pageA.getByRole("button", { name: /👍\s*1/ }).filter({ visible: true })).toBeVisible({ timeout: 10000 })
      expect(await pageA.getByRole("button", { name: /👍\s*1/ }).filter({ visible: true }).count(), "reaction pill must render exactly once").toBe(1)

      // un-react
      await pageB.getByRole("button", { name: /👍\s*1/ }).filter({ visible: true }).first().click()
      await expect(pageA.getByRole("button", { name: /👍\s*1/ }).filter({ visible: true }).first()).not.toBeVisible({ timeout: 10000 })

      // ── edit from A, observe on B — exactly one edited bubble, not two ────────
      const bubbleOnA = pageA.getByText("wave23 broadcast hello", { exact: true }).filter({ visible: true }).first()
      await bubbleOnA.click({ button: "left", delay: 500 }) // long-press (>=400ms) opens the context menu
      await pageA.getByText("Edit", { exact: true }).filter({ visible: true }).click()
      // Two <textarea>s are visible at once: the inline edit box (message-row.tsx,
      // rendered inside the scrollable message list — DOM-first) and the persistent
      // bottom composer (DOM-last). .first() resolves the edit box; .fill() clears
      // the prefilled original content before typing (avoids a Ctrl+A race that
      // otherwise concatenates instead of replacing).
      await pageA.locator("textarea").filter({ visible: true }).first().fill("wave23 broadcast EDITED")
      await pageA.getByRole("button", { name: "Save" }).filter({ visible: true }).click()
      await expect(pageA.getByText("wave23 broadcast EDITED", { exact: true }).filter({ visible: true }).first()).toBeVisible()
      await expect(pageB.getByText("wave23 broadcast EDITED", { exact: true }).filter({ visible: true }).first()).toBeVisible({ timeout: 10000 })
      expect(await pageB.getByText("wave23 broadcast EDITED", { exact: true }).filter({ visible: true }).count(), "edited message must render exactly once on the receiving side").toBe(1)

      // ── typing indicator ──────────────────────────────────────────────────────
      await composerA.click()
      await pageA.waitForTimeout(300)
      await composerA.type("typing check", { delay: 30 })
      await expect(pageB.getByText(/is typing…/).filter({ visible: true })).toBeVisible({ timeout: 10000 })
      await composerA.fill("")

      // ── recent-chats strip on Home updates when a message arrives in another group.
      // Mobile Pocket's Home tab labels this section "Chats" (home-tab.tsx
      // PocketSectionHeader), not "Your chats" (that literal string is the DESKTOP
      // ChatStrip eyebrow only — different component, different copy).
      await pageB.goto("/home")
      await expect(pageB.getByText("Chats", { exact: true }).filter({ visible: true }).first()).toBeVisible()
      // Give home-app's recent-chats hub subscription (freshly (re)mounted on this
      // navigation) a moment to finish its async auth+join before sending — a real
      // user reading the screen takes at least this long too.
      await pageB.waitForTimeout(1500)
      await composerA.fill("wave23 recent-chats bump")
      await composerA.press("Enter")
      await expect(pageB.getByText(/wave23 recent-chats bump/).filter({ visible: true }).first()).toBeVisible({ timeout: 15000 })
    } finally {
      await ctxA.close()
      await ctxB.close()
    }
  })

  test("chat bounded fetch: >50 messages, initial window + Load older preserves position", async ({ page }) => {
    const adminId = await sb.adminUserId()
    const group = await sb.createGroup({ name: "wave23-Bounded Fetch", memberIds: [adminId] })
    for (let i = 0; i < 60; i++) {
      await sb.insertMessage({ groupId: group.id, senderId: adminId, content: `wave23-bulk-${i}` })
    }
    await login(page, process.env.E2E_ADMIN_EMAIL!)
    await page.goto(`/home?tab=chats&chats=my&chat=${group.id}`)

    // Newest message visible; oldest (bulk-0) NOT loaded yet.
    await expect(page.getByText("wave23-bulk-59", { exact: true }).filter({ visible: true }).first()).toBeVisible({ timeout: 10000 })
    await expect(page.getByText("wave23-bulk-0", { exact: true }).filter({ visible: true })).toHaveCount(0)

    // Scroll the message list to the top to trigger loadOlder.
    for (let i = 0; i < 6; i++) {
      await page.mouse.wheel(0, -2000)
      await page.waitForTimeout(300)
    }
    await expect(page.getByText("wave23-bulk-0", { exact: true }).filter({ visible: true }).first()).toBeVisible({ timeout: 10000 })
    // Newest still present — position preserved, nothing got unmounted.
    await expect(page.getByText("wave23-bulk-59", { exact: true }).filter({ visible: true }).first()).toBeVisible()
  })

  test("images: avatars + announcement images render through /_next/image, directory + announcements + profile regression", async ({ page }) => {
    const adminId = await sb.adminUserId()
    const publicUrl = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/profile-images/a98d3716-f60d-4cb7-99db-1faf4ec3fd20.png`
    await sb.client.from("profiles").update({ avatar_url: publicUrl }).eq("id", adminId)
    await sb.createAnnouncement({ title: "wave23-image-test", body: "image pipeline check" })
    await sb.client.from("announcements").update({ image_url: publicUrl }).eq("ministry_id", sb.ministryId).like("title", "E2E::wave23-image-test%")

    await login(page, process.env.E2E_ADMIN_EMAIL!)

    // Directory: admin's own avatar renders via next/image.
    await page.goto("/home?tab=directory")
    await expect(page.getByPlaceholder(/Search members/).filter({ visible: true })).toBeVisible({ timeout: 10000 })
    const dirImg = page.locator("img[src*='/_next/image']").filter({ visible: true }).first()
    await expect(dirImg).toBeVisible({ timeout: 10000 })
    const dirSrc = await dirImg.getAttribute("src")
    expect(dirSrc).toContain("/_next/image")

    // Announcements: seeded image renders via next/image, feed still loads.
    await page.goto("/home?tab=announcements")
    await expect(page.getByText("E2E::wave23-image-test").filter({ visible: true }).first()).toBeVisible({ timeout: 10000 })
    const annImg = page.locator("img[src*='/_next/image']").filter({ visible: true }).first()
    await expect(annImg).toBeVisible({ timeout: 10000 })

    // RSVP regression: create an event, RSVP toggles as a strict on/off.
    const ev = await sb.createAnnouncement({ title: "wave23-rsvp-event", body: "rsvp check", is_event: true, event_date: new Date(Date.now() + 86400000).toISOString() })
    await page.reload()
    // Mobile Pocket feed cards are `<div role="button">`, not `<article>` (that
    // tag is the desktop-only render path) — scope by the div wrapping our title.
    const card = page.locator("div[role='button']").filter({ hasText: "E2E::wave23-rsvp-event" }).filter({ visible: true }).first()
    await card.scrollIntoViewIfNeeded()
    const rsvpButton = card.getByRole("button", { name: /^RSVP$|^Going/ }).first()
    await expect(rsvpButton).toBeVisible()
    await rsvpButton.click()
    await expect(rsvpButton).toHaveText(/Going/, { timeout: 5000 })
    await expect.poll(async () => {
      const { data } = await sb.client.from("rsvps").select("id").eq("announcement_id", ev.id).eq("user_id", adminId)
      return data?.length ?? 0
    }, { timeout: 5000 }).toBe(1)
    await rsvpButton.click()
    await expect(rsvpButton).toHaveText(/^RSVP$/, { timeout: 5000 })

    // Load more still works (regression from wave1, shell-slim boot didn't break pagination).
    const loadMore = page.getByRole("button", { name: /Load more/i }).filter({ visible: true })
    if (await loadMore.isVisible().catch(() => false)) {
      await loadMore.click()
      await expect(page.getByText("E2E::wave23-rsvp-event").filter({ visible: true }).first()).toBeVisible()
    }

    // Profile tab renders (shell-slim boot-profile drop of about_me/bible_verse/pray_for_me).
    await page.goto("/home?tab=profile")
    await expect(page.getByText("E2E Admin", { exact: false }).filter({ visible: true }).first()).toBeVisible({ timeout: 10000 })
    const profImg = page.locator("img[src*='/_next/image']").filter({ visible: true }).first()
    await expect(profImg).toBeVisible({ timeout: 10000 })
  })
})
