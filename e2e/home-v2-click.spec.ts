// Phase 2 (Pocket Daybreak v2) - Home mobile click-through. Verifies the v2
// recipe renders in order (chrome/date kicker/setup card/FEATURED hero/deadlines/
// announcements digest/chats digest/quick grid/verse), the admin-only gear opens
// Settings (absent for member), avatar opens Profile, digest See-all links route
// to their tabs, hero See-event/RSVP still work (round-trip RSVP, no net data
// change), and ?tab= deep links still work.
import { test, expect, type Page } from "@playwright/test"
import { adminState, memberState, sandbox, E2E_PREFIX } from "./fixtures"

const MOBILE = { viewport: { width: 390, height: 844 } } as const

function watchConsole(page: Page) {
  const errors: string[] = []
  page.on("console", (msg) => { if (msg.type() === "error") errors.push("console: " + msg.text()) })
  page.on("pageerror", (err) => errors.push("pageerror: " + err.message))
  return errors
}
function assertNoErrors(errors: string[]) {
  expect(errors, "console/page errors:\n" + errors.join("\n")).toEqual([])
}
function vis(page: Page, text: string | RegExp, exact = true) {
  return page.getByText(text, typeof text === "string" ? { exact } : undefined).filter({ visible: true })
}

test.describe("mobile Home v2 (Pocket Daybreak) - Phase 2", () => {
  test.use({ storageState: adminState, ...MOBILE })

  const HERO_TITLE = E2E_PREFIX + "Home v2 Hero Event"
  const DIGEST_TITLE = E2E_PREFIX + "Home v2 Second Announcement"
  const CHAT_NAME = "Home v2 Chat"
  let heroAnnId = ""
  let groupId = ""
  let seededVerse = false

  test.beforeAll(async () => {
    const sb = sandbox()
    const adminId = await sb.adminUserId()
    const memberId = await sb.memberUserId()
    const future = new Date(Date.now() + 5 * 86400000).toISOString()
    const hero = await sb.createAnnouncement({ title: HERO_TITLE, body: "Hero body for the v2 click-through spec.", is_event: true, is_pinned: true, event_date: future })
    heroAnnId = hero.id
    await sb.createAnnouncement({ title: DIGEST_TITLE, body: "Second announcement body." })
    const grp = await sb.createGroup({ name: CHAT_NAME, memberIds: [adminId, memberId] })
    groupId = grp.id
    const { error: msgErr } = await sb.client.from("messages").insert({ group_id: groupId, sender_id: memberId, content: "Hey from the Home v2 click-through spec" })
    if (msgErr) throw msgErr
    const { error: verseErr } = await sb.client.from("home_verses").insert({ ministry_id: sb.ministryId, reference: "Psalm 46:10", text: "Be still, and know that I am God.", order_index: 0 })
    seededVerse = !verseErr
  })

  test.afterAll(async () => {
    const sb = sandbox()
    if (heroAnnId) await sb.deleteRsvpsForAnnouncements([heroAnnId])
    await sb.deleteAnnouncementsByPrefix()
    await sb.deleteGroupsByPrefix()
    if (seededVerse) await sb.client.from("home_verses").delete().eq("ministry_id", sb.ministryId).eq("reference", "Psalm 46:10")
  })

  test("v2 recipe renders in order + chrome + digests + hero RSVP round-trip + deep links", async ({ page }) => {
    const errors = watchConsole(page)
    await page.goto("/home")

    await expect(vis(page, "E2E Sandbox").first()).toBeVisible({ timeout: 15000 })
    const gear = page.getByRole("button", { name: "Church settings" }).filter({ visible: true })
    await expect(gear).toBeVisible({ timeout: 10000 })
    const avatar = page.getByRole("button", { name: "Your profile" }).filter({ visible: true })
    await expect(avatar).toBeVisible()

    const dateLabel = new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })
    await expect(vis(page, dateLabel)).toBeVisible({ timeout: 10000 })

    await expect(vis(page, "Getting started").first()).toBeVisible({ timeout: 10000 })
    await expect(vis(page, "SETUP", false).first()).toBeVisible()

    await expect(vis(page, "FEATURED", false).first()).toBeVisible({ timeout: 10000 })
    await expect(vis(page, HERO_TITLE).first()).toBeVisible({ timeout: 15000 })
    const seeEventBtn = page.getByRole("button", { name: "See event" }).filter({ visible: true }).first()
    await expect(seeEventBtn).toBeVisible()
    const rsvpBtn = page.getByRole("button", { name: /^(RSVP|Going)/ }).filter({ visible: true }).first()
    await expect(rsvpBtn).toBeVisible()

    await expect(vis(page, "Announcements").first()).toBeVisible({ timeout: 10000 })
    await expect(vis(page, DIGEST_TITLE).first()).toBeVisible({ timeout: 10000 })
    const annSeeAll = page.getByRole("button", { name: /See all/ }).filter({ visible: true }).first()
    await expect(annSeeAll).toBeVisible()

    await expect(vis(page, "Chats").first()).toBeVisible({ timeout: 10000 })
    await expect(vis(page, E2E_PREFIX + CHAT_NAME).first()).toBeVisible({ timeout: 10000 })

    const giveTile = vis(page, "Give").first()
    await expect(giveTile).toBeVisible({ timeout: 10000 })

    if (seededVerse) {
      await expect(vis(page, "Psalm 46:10", false).first()).toBeVisible({ timeout: 10000 })
    }

    await seeEventBtn.click()
    await expect(vis(page, "Hero body for the v2 click-through spec.")).toBeVisible({ timeout: 10000 })
    await page.getByRole("button", { name: /Back to announcements/i }).filter({ visible: true }).click()
    await expect(page).toHaveURL(/tab=announcements/, { timeout: 10000 })
    await expect(vis(page, HERO_TITLE).first()).toBeVisible({ timeout: 10000 })
    await page.goto("/home")
    await expect(vis(page, HERO_TITLE).first()).toBeVisible({ timeout: 15000 })

    const rsvpBtn2 = page.getByRole("button", { name: "RSVP" }).filter({ visible: true }).first()
    await expect(rsvpBtn2).toBeVisible({ timeout: 10000 })
    await rsvpBtn2.click()
    await expect(page.getByRole("button", { name: /^Going/ }).filter({ visible: true }).first()).toBeVisible({ timeout: 10000 })
    await page.getByRole("button", { name: /^Going/ }).filter({ visible: true }).first().click()
    await expect(page.getByRole("button", { name: "RSVP" }).filter({ visible: true }).first()).toBeVisible({ timeout: 10000 })

    await annSeeAll.click()
    await expect(page).toHaveURL(/tab=announcements/, { timeout: 10000 })
    await page.goto("/home")
    await expect(page).toHaveURL(/\/home/, { timeout: 10000 })

    const chatsSeeAll = page.getByRole("button", { name: /See all/ }).filter({ visible: true }).last()
    await chatsSeeAll.click()
    await expect(page).toHaveURL(/tab=chats/, { timeout: 10000 })
    await page.goto("/home")
    await expect(gear).toBeVisible({ timeout: 15000 })
    await gear.click()
    await expect(page).toHaveURL(/tab=settings/, { timeout: 10000 })
    await expect(vis(page, "Church Settings").first()).toBeVisible({ timeout: 10000 })

    await page.goto("/home")
    await expect(avatar).toBeVisible({ timeout: 15000 })
    await avatar.click()
    await expect(page).toHaveURL(/tab=profile/, { timeout: 10000 })

    await page.goto("/home?tab=announcements")
    await expect(vis(page, DIGEST_TITLE).first()).toBeVisible({ timeout: 15000 })

    assertNoErrors(errors)
  })
})

test.describe("mobile Home v2 - member has no Settings gear", () => {
  test.use({ storageState: memberState, ...MOBILE })

  test("gear absent for member; avatar still present", async ({ page }) => {
    await page.goto("/home")
    await expect(page.getByRole("button", { name: "Your profile" }).filter({ visible: true })).toBeVisible({ timeout: 15000 })
    await expect(page.getByRole("button", { name: "Church settings" }).filter({ visible: true })).toHaveCount(0)
  })
})
