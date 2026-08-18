// Switch ministry: the settings row (mobile: gear > Account & support; desktop:
// inline on the profile tab) still navigates to /ministries, and carries the
// press-row feedback class. Kept — a broken "Switch ministry" link strands a
// multi-ministry user with no way to change tenants.
//
// NOTE ON THE PENDING VEIL: unlike Sign out (which awaits a real network call
// before navigating, giving React a chance to paint), this handler calls
// setSwitching(true) then window.location.assign() synchronously in the same
// tick with no intervening await. On a fast/local connection the document
// unloads before React ever flushes the paint, so the "One moment…" veil does
// not reliably appear — verified directly: polling the DOM for the veil text
// from before the click, racing the navigation, found it 0/N times across
// repeated runs. This spec asserts navigation + the press class only; it does
// NOT assert veil visibility, because asserting it would be asserting a false
// positive on this code path. See test-report.md "switch-ministry veil".
import { test, expect } from "@playwright/test"
import { memberState } from "./fixtures"

test("desktop 1440: switch ministry row navigates to /ministries, carries press-row", async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, storageState: memberState })
  const page = await context.newPage()
  await page.goto("/home?tab=profile")
  const row = page.getByRole("link", { name: "Switch ministry" })
  await expect(row).toBeVisible({ timeout: 15000 })
  await expect(row).toHaveClass(/press-row/)
  await row.click()
  await page.waitForURL(/\/ministries/, { timeout: 15000 })
  await expect(page).toHaveURL(/\/ministries/)
  await context.close()
})

test("mobile 390: switch ministry row (gear > Account & support) navigates to /ministries", async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, storageState: memberState })
  const page = await context.newPage()
  await page.goto("/home?tab=profile")
  await page.getByRole("button", { name: "Settings" }).click()
  await page.getByRole("button", { name: "Account & support" }).click()
  const row = page.getByRole("link", { name: "Switch ministry" })
  await expect(row).toBeVisible({ timeout: 10000 })
  await row.click()
  await page.waitForURL(/\/ministries/, { timeout: 15000 })
  await expect(page).toHaveURL(/\/ministries/)
  await context.close()
})
