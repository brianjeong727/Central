// Directory online presence — the sage dot on member avatars, driven by the
// `presence-{ministryId}` realtime channel (app/home/use-presence.ts).
// Two real sessions: admin watches the directory, member comes online in a
// second context — the dot must appear on the member's row and clear when the
// member's session closes.
import { test, expect } from "@playwright/test"
import { memberState } from "./fixtures"

const dot = (scope: import("@playwright/test").Page) =>
  scope.getByRole("img", { name: "Online now" })

test("online dots track a second client joining and leaving", async ({ page, browser }) => {
  // Admin opens the directory — own dot should appear (self is online).
  await page.goto("/home?tab=directory")
  await expect(page.locator(".central-list-row").first()).toBeVisible({ timeout: 20_000 })
  await expect(dot(page).first()).toBeVisible({ timeout: 15_000 })
  const soloCount = await dot(page).count()

  // Member comes online in a second real session.
  const memberCtx = await browser.newContext({ storageState: memberState })
  const memberPage = await memberCtx.newPage()
  await memberPage.goto("/home")
  await expect(async () => {
    expect(await dot(page).count()).toBeGreaterThan(soloCount)
  }).toPass({ timeout: 20_000 })

  // Member leaves → their dot clears (admin's own remains).
  await memberCtx.close()
  await expect(async () => {
    expect(await dot(page).count()).toBe(soloCount)
  }).toPass({ timeout: 30_000 })
})

test("online dot renders on the mobile directory list", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto("/home?tab=directory")
  await expect(dot(page).first()).toBeVisible({ timeout: 20_000 })
})
