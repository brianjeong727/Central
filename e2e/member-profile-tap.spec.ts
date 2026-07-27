import { test, expect, type Page, type Locator } from "@playwright/test"
import { sandbox, memberState } from "./fixtures"

// Regression + click-through coverage for tap-to-open-profile (commit 7a8c1ca,
// feat/tap-member-profile): the global member-profile overlay + the 7 wired
// sites, with special focus on the CRITICAL message-row regression risk
// (Convention #7 tap<400ms/long-press>=400ms, Convention #20 context menu).
//
// Mixed viewports in one file (mirrors e2e/compliance-ugc.spec.ts pattern) —
// test.use() per describe block sets the effective viewport regardless of
// which Playwright project runs the file.

const PREFIX = "E2E:: tap-profile "
const M = { width: 390, height: 844 }
const D = { width: 1440, height: 900 }

// Long-press a chat message bubble (>=400ms hold) — mirrors the helper in
// e2e/compliance-ugc.spec.ts. Holds the pointer down, waits for the menu item
// to appear, then releases.
async function longPress(page: Page, target: Locator, appears: Locator) {
  const box = await target.boundingBox()
  if (!box) throw new Error("longPress: target has no bounding box")
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
  await page.mouse.down()
  await expect(appears).toBeVisible({ timeout: 3000 })
  await page.mouse.up()
}

// Dismiss any open message-row menu via the app's own full-viewport dismiss
// overlay (chats-tab.tsx ~2756, z-155, fires on pointerdown anywhere).
async function dismissMenus(page: Page) {
  await page.mouse.click(10, 10)
}

test.describe("tap-to-open-profile — global overlay + message-row regression", () => {
  const MSG = `${PREFIX}sender bubble message`
  let groupId = ""
  let annId = ""
  let adminId = ""
  let memberId = ""
  let memberName = ""

  test.beforeAll(async () => {
    const sb = sandbox()
    adminId = await sb.adminUserId()
    memberId = await sb.memberUserId()

    const { data: prof } = await sb.client.from("profiles").select("name").eq("id", memberId).single()
    memberName = prof!.name as string

    const grp = await sb.createGroup({ name: `${PREFIX}chat`, memberIds: [adminId, memberId] })
    groupId = grp.id
    await sb.insertMessage({ groupId, senderId: memberId, content: MSG })

    const ann = await sb.createAnnouncement({
      title: `${PREFIX}event`,
      body: "regression fixture for RSVP-chip tap-to-profile",
      is_event: true,
      event_date: new Date(Date.now() + 86400000).toISOString(),
    })
    annId = ann.id
    await sb.insertRsvp({ announcementId: annId, userId: memberId })
  })

  test.afterAll(async () => {
    const sb = sandbox()
    await sb.deleteRsvpsForAnnouncements([annId])
    await sb.deleteAnnouncementsByPrefix(PREFIX)
    await sb.deleteGroupsByPrefix(PREFIX)
  })

  // ──────────────────────────────────────────────────────────────────────
  // CRITICAL: message-row bubble gestures unbroken (mobile 390×844)
  // ──────────────────────────────────────────────────────────────────────
  test.describe("message-row bubble gestures (mobile) — CRITICAL regression", () => {
    test.use({ viewport: M })

    test("quick tap → emoji picker; long-press → reply menu; sender name/avatar → profile only; reaction round-trips", async ({ page }) => {
      await page.goto(`/home?tab=chats&chat=${groupId}`)
      const bubble = page.locator('div[title="Long-press for reply and reactions"]').filter({ hasText: MSG })
      await expect(bubble).toBeVisible({ timeout: 20000 })

      // (a) quick tap (<400ms) → emoji reaction bar opens
      await bubble.click()
      const thumbsUp = page.getByRole("button", { name: "👍", exact: true })
      await expect(thumbsUp).toBeVisible({ timeout: 2000 })
      // Closed via the app's own dismiss overlay (z-155, covers the whole
      // viewport including the bubble while a menu is open — tapping "the
      // bubble again" in a real device is actually caught by this overlay).
      await dismissMenus(page)
      await expect(thumbsUp).toBeHidden()

      // (d) reaction toggle round-trip: reopen picker, react, badge appears; tap badge again to remove
      await bubble.click()
      await expect(thumbsUp).toBeVisible()
      await thumbsUp.click()
      const badge = page.locator("button", { hasText: "👍" }).filter({ hasText: "1" })
      await expect(badge).toBeVisible({ timeout: 5000 })
      await badge.click()
      await expect(badge).toBeHidden({ timeout: 5000 })

      // (b) long-press (>=400ms) → reply/context menu (which itself carries its
      // own quick-react row + Reply/Forward/Report — that row is expected; the
      // distinguishing signal vs the short-tap picker is the Reply action).
      const replyBtn = page.getByRole("button", { name: "Reply", exact: true })
      await longPress(page, bubble, replyBtn)
      await expect(replyBtn).toBeVisible()
      await dismissMenus(page)
      await expect(replyBtn).toBeHidden()
      await expect(thumbsUp).toBeHidden()

      // (c) tapping the SENDER NAME opens the profile overlay — does NOT fire
      // the emoji picker or the context menu.
      const senderName = page.locator("span.cursor-pointer", { hasText: memberName }).filter({ visible: true }).first()
      await expect(senderName).toBeVisible()
      await senderName.click()
      const profileHeading = page.locator("h1", { hasText: memberName }).filter({ visible: true })
      await expect(profileHeading).toBeVisible({ timeout: 10000 })
      await expect(thumbsUp).toBeHidden()
      await expect(replyBtn).toBeHidden()
      await expect(page).toHaveURL(new RegExp(`person=`))

      // Close returns to the SAME chat context (not yanked to Directory).
      const backBtn = page.getByRole("button", { name: "Back to Back" }).filter({ visible: true })
      await backBtn.click()
      await expect(profileHeading).toBeHidden()
      await expect(page).not.toHaveURL(/person=/)
      await expect(bubble).toBeVisible()

      // (c, cont'd) tapping the AVATAR (sibling of the bubble) also opens the
      // profile — and does not trigger the bubble's own press handlers.
      const avatarSpan = bubble.locator("xpath=preceding-sibling::span[1]")
      await avatarSpan.click()
      await expect(profileHeading).toBeVisible({ timeout: 10000 })
      await expect(thumbsUp).toBeHidden()
      await expect(replyBtn).toBeHidden()
      await backBtn.click()
      await expect(profileHeading).toBeHidden()
    })

    test("Send Message from the sender's overlay opens a DM", async ({ page }) => {
      await page.goto(`/home?tab=chats&chat=${groupId}&person=${memberId}`)
      const profileHeading = page.locator("h1", { hasText: memberName }).filter({ visible: true })
      await expect(profileHeading).toBeVisible({ timeout: 10000 })
      const sendMsg = page.getByRole("button", { name: "Send Message" }).filter({ visible: true })
      await expect(sendMsg).toBeVisible()
      await sendMsg.click()
      await expect(page).toHaveURL(/[?&]chat=/, { timeout: 10000 })
      await expect(page).not.toHaveURL(/person=/)
      await expect(page.getByPlaceholder(`Message ${memberName}`).filter({ visible: true })).toBeVisible({ timeout: 10000 })
    })
  })

  // ──────────────────────────────────────────────────────────────────────
  // Overlay from other wired sites + deep-link
  // ──────────────────────────────────────────────────────────────────────
  test.describe("overlay from other sites (mobile)", () => {
    test.use({ viewport: M })

    test("RSVP chip → profile opens with that attendee; close returns to the announcement", async ({ page }) => {
      await page.goto(`/home?tab=announcements&ann=${annId}`)
      const chip = page.getByText(memberName.split(" ")[0], { exact: true }).filter({ visible: true }).first()
      await expect(chip).toBeVisible({ timeout: 15000 })
      await chip.click()
      const profileHeading = page.locator("h1", { hasText: memberName }).filter({ visible: true })
      await expect(profileHeading).toBeVisible({ timeout: 10000 })
      await expect(page).toHaveURL(/person=/)

      const backBtn = page.getByRole("button", { name: "Back to Back" }).filter({ visible: true })
      await backBtn.click()
      await expect(profileHeading).toBeHidden()
      // Still on the announcement, not yanked to Directory.
      await expect(page).toHaveURL(new RegExp(`ann=${annId}`))
      await expect(page.getByText(`${PREFIX}event`).filter({ visible: true }).first()).toBeVisible()
    })

    test("?person= deep-link opens the overlay directly", async ({ page }) => {
      await page.goto(`/home?tab=directory&person=${memberId}`)
      const profileHeading = page.locator("h1", { hasText: memberName }).filter({ visible: true })
      await expect(profileHeading).toBeVisible({ timeout: 15000 })
    })
  })

  // ──────────────────────────────────────────────────────────────────────
  // Desktop spot-check
  // ──────────────────────────────────────────────────────────────────────
  test.describe("overlay from Settings People + z-order over chat (desktop)", () => {
    test.use({ viewport: D })

    test("Settings → People roster: tap name → modal opens with that person; close returns to People", async ({ page }) => {
      await page.goto("/home?tab=settings&stab=people")
      const row = page.getByText(memberName, { exact: true }).filter({ visible: true }).first()
      await expect(row).toBeVisible({ timeout: 15000 })
      await row.click()
      const profileHeading = page.locator("h1", { hasText: memberName }).filter({ visible: true })
      await expect(profileHeading).toBeVisible({ timeout: 10000 })
      await expect(page).toHaveURL(/person=/)

      await page.getByRole("button", { name: "Close" }).filter({ visible: true }).click()
      await expect(profileHeading).toBeHidden()
      await expect(page).toHaveURL(/stab=people/)
      await expect(page).not.toHaveURL(/person=/)
    })

    test("profile modal opens ABOVE the inline chat (z-order)", async ({ page }) => {
      await page.goto(`/home?tab=chats&chat=${groupId}`)
      const bubble = page.locator('div[title="Long-press for reply and reactions"]').filter({ hasText: MSG })
      await expect(bubble).toBeVisible({ timeout: 20000 })
      const senderName = page.locator("span.cursor-pointer", { hasText: memberName }).filter({ visible: true }).first()
      await senderName.click()
      const profileHeading = page.locator("h1", { hasText: memberName }).filter({ visible: true })
      await expect(profileHeading).toBeVisible({ timeout: 10000 })
      // Modal card sits over the veil (z-200) — clicking it must not fall through
      // to the chat underneath.
      const veil = page.locator("div.animate-backdrop-in")
      await expect(veil).toBeVisible()
    })
  })
})
