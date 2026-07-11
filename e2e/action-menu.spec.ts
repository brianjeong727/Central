import { test, expect } from "@playwright/test"
import { sandbox } from "./fixtures"

// Regression for the ActionMenu clip/flip fix (components/central/action-menu.tsx):
// the menu portals to <body>, flips ABOVE the trigger when there's no room below,
// and clamps inside the viewport — so a kebab near the bottom edge can never open a
// clipped menu. Exercised on the announcements desktop cards.
//
// A "menuclip" batch (still under the E2E:: namespace) gives us enough cards to
// push the last kebab to the viewport bottom; afterAll clears it by prefix.
const PREFIX = "E2E:: menuclip "

test.describe("ActionMenu flip / clipping (desktop, admin)", () => {
  test.beforeAll(async () => {
    const sb = sandbox()
    await sb.deleteAnnouncementsByPrefix(PREFIX)
    for (let i = 1; i <= 6; i++) {
      await sb.createAnnouncement({
        title: `${PREFIX}${i}`,
        body:
          `Regression fixture card #${i}. Long enough body copy so each card ` +
          `occupies real vertical space and the grid overflows the viewport, ` +
          `pushing the final kebab trigger down to the bottom edge.`,
      })
    }
  })

  test.afterAll(async () => {
    await sandbox().deleteAnnouncementsByPrefix(PREFIX)
  })

  test("bottom-edge kebab flips above the trigger and stays fully in the viewport", async ({ page }) => {
    const viewport = page.viewportSize()
    expect(viewport).not.toBeNull()

    await page.goto("/home?tab=announcements")

    const kebabs = page.getByTitle("More actions")
    await expect(kebabs.first()).toBeVisible()
    const count = await kebabs.count()
    expect(count).toBeGreaterThanOrEqual(6)

    // Take the last card's kebab and pin it to the bottom edge (block:"end"
    // aligns the trigger bottom to the scroll container's bottom).
    const lastKebab = kebabs.nth(count - 1)
    await lastKebab.evaluate((el) => el.scrollIntoView({ block: "end" }))

    const triggerBox = await lastKebab.boundingBox()
    expect(triggerBox).not.toBeNull()

    // Open AFTER scrolling (ActionMenu closes on scroll).
    await lastKebab.click()
    const menu = page.getByTestId("action-menu")
    await expect(menu).toBeVisible()

    const menuBox = await menu.boundingBox()
    expect(menuBox).not.toBeNull()

    // Fully inside the viewport.
    expect(menuBox!.y).toBeGreaterThanOrEqual(0)
    expect(menuBox!.y + menuBox!.height).toBeLessThanOrEqual(viewport!.height)

    // Flipped ABOVE: the menu's bottom sits at or above the trigger's top.
    expect(menuBox!.y + menuBox!.height).toBeLessThanOrEqual(triggerBox!.y + 1)
  })

  test("top-of-page kebab opens BELOW the trigger (flip is not always-on)", async ({ page }) => {
    await page.goto("/home?tab=announcements")

    const firstKebab = page.getByTitle("More actions").first()
    await expect(firstKebab).toBeVisible()
    await firstKebab.scrollIntoViewIfNeeded()

    const triggerBox = await firstKebab.boundingBox()
    expect(triggerBox).not.toBeNull()

    await firstKebab.click()
    const menu = page.getByTestId("action-menu")
    await expect(menu).toBeVisible()

    const menuBox = await menu.boundingBox()
    expect(menuBox).not.toBeNull()

    // Opened below: menu top is at or beneath the trigger's bottom.
    expect(menuBox!.y).toBeGreaterThanOrEqual(triggerBox!.y + triggerBox!.height - 1)
  })

  test("Escape and outside click both close the menu", async ({ page }) => {
    await page.goto("/home?tab=announcements")

    const kebab = page.getByTitle("More actions").first()
    const menu = page.getByTestId("action-menu")

    // Escape.
    await kebab.click()
    await expect(menu).toBeVisible()
    await page.keyboard.press("Escape")
    await expect(menu).toBeHidden()

    // Outside click — on the non-interactive page heading (never navigates).
    await kebab.click()
    await expect(menu).toBeVisible()
    await page.getByRole("heading", { name: "Announcements" }).click()
    await expect(menu).toBeHidden()
  })
})
