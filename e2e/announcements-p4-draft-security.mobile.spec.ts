// Phase 4 (Announcements + drafts) — independent verifier click-through, KEPT
// as a regression spec. Complements announcements-p4-shots.mobile.spec.ts:
// that spec seeds a draft via direct DB insert to prove the RLS/read-path
// story; THIS spec drives the actual Save/Publish/Delete UI buttons a leader
// clicks, and adds CARD-level RSVP + kebab-menu + compose-validation coverage
// the shots spec doesn't exercise. Every write is scoped to E2E::-prefixed
// sandbox rows and cleaned up in afterAll.
import { test, expect, type Page } from "@playwright/test"
import { sandbox, E2E_PREFIX, memberState } from "./fixtures"

const DRAFT_TITLE = `${E2E_PREFIX}P4 Manual Draft Verify`
const RSVP_EVENT_TITLE = `${E2E_PREFIX}P4 Manual RSVP Event`

function vis(page: Page, text: string, exact = true) {
  return page.getByText(text, { exact }).filter({ visible: true })
}

test.describe.serial("P4 manual click-through — draft visibility + feed interactions", () => {
  let rsvpEventId = ""

  test.beforeAll(async () => {
    const sb = sandbox()
    const adminId = await sb.adminUserId()
    const ev = await sb.createAnnouncement({
      title: RSVP_EVENT_TITLE,
      body: "Manual RSVP round-trip verification event.",
      is_event: true,
      event_date: new Date(Date.now() + 5 * 864e5).toISOString(),
      created_by: adminId,
    })
    rsvpEventId = ev.id
  })

  test.afterAll(async () => {
    const sb = sandbox()
    await sb.deleteAnnouncementsByPrefix(`${E2E_PREFIX}P4 Manual`)
  })

  test("1a — admin creates a draft via the real Save-draft UI button", async ({ page }) => {
    await page.goto("/home?tab=announcements")
    await page.getByRole("button", { name: "New announcement" }).filter({ visible: true }).first().click()
    await expect(vis(page, "Headline").first()).toBeVisible({ timeout: 10000 })

    // Publish disabled until headline + body exist.
    const publishBtn = page.getByRole("button", { name: "Publish", exact: true }).filter({ visible: true }).first()
    await expect(publishBtn).toBeDisabled()
    const publishOpacity = await publishBtn.evaluate((el) => getComputedStyle(el).opacity)
    expect(publishOpacity).toBe("0.45")

    await page.locator('input[placeholder="A clear, scannable headline"]').filter({ visible: true }).fill(DRAFT_TITLE)
    await page.locator('textarea[placeholder="Write the full announcement here…"]').filter({ visible: true }).fill("Testing the real save-draft click path end to end.")

    // Now enabled (poll — the opacity change is CSS-transitioned).
    await expect(publishBtn).toBeEnabled()
    await expect.poll(async () => publishBtn.evaluate((el) => getComputedStyle(el).opacity), { timeout: 3000 }).toBe("1")

    // Click Save (= save-as-draft quiet button), NOT Publish.
    await page.getByRole("button", { name: "Save", exact: true }).filter({ visible: true }).first().click()

    // Back on feed — appears ONLY in the DRAFTS tray.
    await expect(vis(page, "Drafts").first()).toBeVisible({ timeout: 10000 })
    await expect(vis(page, DRAFT_TITLE, false)).toHaveCount(1)
  })

  test("1b — member cannot see the draft: mobile feed, mobile Home", async ({ browser }) => {
    const ctx = await browser.newContext({ storageState: memberState, viewport: { width: 390, height: 844 } })
    const page = await ctx.newPage()
    await page.goto("/home?tab=announcements")
    await expect(page.locator("body")).toBeVisible({ timeout: 15000 })
    await page.waitForLoadState("networkidle").catch(() => {})
    await expect(vis(page, "Drafts")).toHaveCount(0)
    await expect(vis(page, DRAFT_TITLE, false)).toHaveCount(0)

    await page.goto("/home?tab=home")
    await expect(page.locator("body")).toBeVisible({ timeout: 15000 })
    await page.waitForLoadState("networkidle").catch(() => {})
    await expect(vis(page, DRAFT_TITLE, false)).toHaveCount(0)
    await ctx.close()
  })

  test("1b — member cannot see the draft: desktop feed (1440) + desktop Home", async ({ browser }) => {
    const ctx = await browser.newContext({ storageState: memberState, viewport: { width: 1440, height: 900 } })
    const page = await ctx.newPage()
    await page.goto("/home?tab=announcements")
    await expect(page.locator("body")).toBeVisible({ timeout: 15000 })
    await page.waitForLoadState("networkidle").catch(() => {})
    await expect(vis(page, DRAFT_TITLE, false)).toHaveCount(0)

    await page.goto("/home?tab=home")
    await expect(page.locator("body")).toBeVisible({ timeout: 15000 })
    await page.waitForLoadState("networkidle").catch(() => {})
    await expect(vis(page, DRAFT_TITLE, false)).toHaveCount(0)
    await ctx.close()
  })

  test("1c — admin resumes the draft and publishes it: moves to feed, tray entry disappears", async ({ page }) => {
    await page.goto("/home?tab=announcements")
    await vis(page, DRAFT_TITLE, false).first().click()
    await expect(page.locator(`input[value="${DRAFT_TITLE}"]`).filter({ visible: true }).first()).toBeVisible({ timeout: 10000 })
    const publishBtn = page.getByRole("button", { name: "Publish", exact: true }).filter({ visible: true }).first()
    await expect(publishBtn).toBeEnabled()
    await publishBtn.click()

    await expect(vis(page, DRAFT_TITLE, false).first()).toBeVisible({ timeout: 10000 })
    await expect(vis(page, "Drafts")).toHaveCount(0)
  })

  test("1c cleanup — leader deletes the (now published) test announcement via kebab ActionMenu", async ({ page }) => {
    await page.goto("/home?tab=announcements")
    await expect(vis(page, DRAFT_TITLE, false).first()).toBeVisible({ timeout: 10000 })
    // The card's kebab trigger — 28px round icon button (w-7 h-7 rounded-full) housing the MoreHorizontal icon.
    const cardRoot = page.locator("div").filter({ hasText: DRAFT_TITLE }).filter({ visible: true }).last()
    const kebab = cardRoot.locator("button.w-7.h-7.rounded-full").filter({ visible: true }).first()
    await kebab.click()
    const deleteItem = page.getByText("Delete", { exact: true }).filter({ visible: true }).first()
    await expect(deleteItem).toBeVisible({ timeout: 5000 })
    await deleteItem.click()
    const confirmBtn = page.getByRole("button", { name: "Delete", exact: true }).filter({ visible: true }).last()
    await expect(confirmBtn).toBeVisible({ timeout: 5000 })
    await confirmBtn.click()
    await expect(vis(page, DRAFT_TITLE, false)).toHaveCount(0, { timeout: 10000 })
  })

  test("3 — feed filters All/Events/Updates", async ({ page }) => {
    await page.goto("/home?tab=announcements")
    await expect(vis(page, RSVP_EVENT_TITLE, false).first()).toBeVisible({ timeout: 15000 })
    await page.getByRole("button", { name: "Events", exact: true }).filter({ visible: true }).first().click()
    await expect(vis(page, RSVP_EVENT_TITLE, false).first()).toBeVisible({ timeout: 10000 })
    await page.getByRole("button", { name: "Updates", exact: true }).filter({ visible: true }).first().click()
    await expect(vis(page, RSVP_EVENT_TITLE, false)).toHaveCount(0)
    await page.getByRole("button", { name: "All", exact: true }).filter({ visible: true }).first().click()
    await expect(vis(page, RSVP_EVENT_TITLE, false).first()).toBeVisible({ timeout: 10000 })
  })

  test("3 — RSVP round-trip on the CARD (toggle on, toggle off)", async ({ page }) => {
    await page.goto("/home?tab=announcements")
    // NOTE: the card root itself is role="button" (opens detail) and its accessible
    // name is the full concatenated card text — which also matches a loose /Going/
    // regex. Use EXACT "Going" so we only ever hit the small RSVP toggle <button>,
    // never the card's outer clickable wrapper (confirmed via manual DOM probe).
    // The feed's toggle is SWR-optimistic (UI flips before the network write
    // settles) — wait for the actual /rest/v1/rsvps round-trip on each click so a
    // fast second click (or the test ending) can never race/abort the real write.
    const rsvpBtn = page.getByRole("button", { name: "RSVP", exact: true }).filter({ visible: true }).first()
    await expect(rsvpBtn).toBeVisible({ timeout: 15000 })
    const [onResp] = await Promise.all([
      page.waitForResponse((r) => r.url().includes("/rest/v1/rsvps"), { timeout: 10000 }),
      rsvpBtn.click(),
    ])
    expect(onResp.ok()).toBe(true)
    const goingBtn = page.getByRole("button", { name: "Going", exact: true }).filter({ visible: true }).first()
    await expect(goingBtn).toBeVisible({ timeout: 10000 })
    // Still on the feed, not navigated into detail (stopPropagation held).
    await expect(page).toHaveURL(/tab=announcements/)
    const [offResp] = await Promise.all([
      page.waitForResponse((r) => r.url().includes("/rest/v1/rsvps"), { timeout: 10000 }),
      goingBtn.click(),
    ])
    expect(offResp.ok()).toBe(true)
    await expect(page.getByRole("button", { name: "RSVP", exact: true }).filter({ visible: true }).first()).toBeVisible({ timeout: 10000 })
    await expect(page).toHaveURL(/tab=announcements/)
  })

  test("3 — RSVP round-trip in DETAIL (toggle on, toggle off)", async ({ page }) => {
    await page.goto("/home?tab=announcements")
    await vis(page, RSVP_EVENT_TITLE, false).first().click()
    await expect(vis(page, "Manual RSVP round-trip verification event.", false).first()).toBeVisible({ timeout: 15000 })
    const rsvpBtn = page.getByRole("button", { name: "RSVP", exact: true }).filter({ visible: true }).first()
    await rsvpBtn.click()
    await expect(vis(page, "Going — tap to undo", false).first()).toBeVisible({ timeout: 10000 })
    await vis(page, "Going — tap to undo", false).first().click()
    await expect(page.getByRole("button", { name: "RSVP", exact: true }).filter({ visible: true }).first()).toBeVisible({ timeout: 10000 })
  })

  test("3 — kebab ActionMenu opens with leader actions on a published card", async ({ page }) => {
    await page.goto("/home?tab=announcements")
    await expect(vis(page, RSVP_EVENT_TITLE, false).first()).toBeVisible({ timeout: 15000 })
    const cardRoot = page.locator("div").filter({ hasText: RSVP_EVENT_TITLE }).filter({ visible: true }).last()
    const kebab = cardRoot.locator("button.w-7.h-7.rounded-full").filter({ visible: true }).first()
    await kebab.click()
    await expect(page.getByText("Edit", { exact: true }).filter({ visible: true }).first()).toBeVisible({ timeout: 5000 })
    await expect(page.getByText("Pin", { exact: true }).filter({ visible: true }).first()).toBeVisible()
    await expect(page.getByText("Delete", { exact: true }).filter({ visible: true }).first()).toBeVisible()
    await page.keyboard.press("Escape").catch(() => {})
  })

  test("3 — compose event toggle reveals event fields", async ({ page }) => {
    await page.goto("/home?tab=announcements")
    await page.getByRole("button", { name: "New announcement" }).filter({ visible: true }).first().click()
    await expect(vis(page, "Headline").first()).toBeVisible({ timeout: 10000 })
    await expect(vis(page, "Event date & time", false)).toHaveCount(0)
    const eventSwitch = page.getByRole("switch", { name: "This is an event" }).filter({ visible: true }).first()
    await eventSwitch.click()
    await expect(vis(page, "Event date & time", false).first()).toBeVisible({ timeout: 5000 })
    // Leave compose without saving.
    await page.getByRole("button", { name: "Back", exact: true }).filter({ visible: true }).first().click().catch(async () => {
      await page.goBack()
    })
  })
})
