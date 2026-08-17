// Throwaway visual capture for the Profile-pill / Journal-spoke change
// (mobile_design_system.md §3, 2026-08-16). Evidence only — guarded on
// PROFILE_SHOT_DIR so it is a no-op in CI.
import { test, type Page } from "@playwright/test"

const SHOT_DIR = process.env.PROFILE_SHOT_DIR

async function shot(page: Page, name: string) {
  if (!SHOT_DIR) return
  await page.screenshot({ path: `${SHOT_DIR}/${name}.png`, fullPage: false })
}

test.describe("mobile Profile pill + Journal spoke", () => {
  test("capture the changed surfaces", async ({ page }) => {
    test.setTimeout(180_000)

    // Home root — chrome avatar gone, 5-item pill.
    await page.goto("/home")
    await page.waitForTimeout(2500)
    await shot(page, "01-home-root")

    // Profile root — identity card + PERSONAL / Journal hub row.
    await page.getByRole("button", { name: "Profile" }).filter({ visible: true }).click()
    await page.waitForTimeout(2000)
    await shot(page, "02-profile-root")

    // Journal spoke — chrome title + back chevron + fchips.
    await page.getByText("Journal", { exact: true }).filter({ visible: true }).first().click()
    await page.waitForTimeout(2000)
    await shot(page, "03-journal")

    // Back to the root via the chevron.
    await page.locator(".back-chevron").filter({ visible: true }).first().click()
    await page.waitForTimeout(1500)
    await shot(page, "04-back-on-profile")

    // Chats root — the other avatar-bearing chrome.
    await page.getByRole("button", { name: "Chats" }).filter({ visible: true }).click()
    await page.waitForTimeout(2500)
    await shot(page, "05-chats-root")

    // Announcements root.
    await page.getByRole("button", { name: "Announcements" }).filter({ visible: true }).click()
    await page.waitForTimeout(2500)
    await shot(page, "06-announcements-root")

    // Workspace root + team hub — PocketHubChrome lost its avatar too.
    await page.getByRole("button", { name: "Workspace" }).filter({ visible: true }).click()
    await page.waitForTimeout(2500)
    await shot(page, "07-workspace-root")
  })
})
