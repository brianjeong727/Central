// Sign-out and switch-ministry: press feedback (.press-scale / .press-row) plus
// the pending veil (PendingVeil, mounted on click and never cleared on success).
// Each context is fresh so a sign-out in one test never poisons another's
// storage state. Kept — this is regression-worthy: a broken sign-out or
// switch-ministry navigation is a hard outage, and the press classes are the
// only structural signal that Convention #4 tokens (not inline styles) are
// wired to the right controls.
import { test, expect } from "@playwright/test"
import { memberState, adminState } from "./fixtures"

test("desktop 1440: You-panel Sign out shows the pending veil and lands on /login", async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, storageState: adminState })
  const page = await context.newPage()
  await page.goto("/home?tab=profile")
  const signOutBtn = page.getByRole("button", { name: "Sign out" })
  await expect(signOutBtn).toBeVisible({ timeout: 15000 })
  await expect(signOutBtn).toHaveClass(/press-scale/)
  await signOutBtn.click()
  await expect(page.getByText("Signing you out…")).toBeVisible({ timeout: 2000 })
  await page.waitForURL(/\/login/, { timeout: 15000 })
  await expect(page).toHaveURL(/\/login/)
  await context.close()
})

test("mobile 390: Profile > gear > Settings hub Sign out shows the pending veil and lands on /login", async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, storageState: memberState })
  const page = await context.newPage()
  await page.goto("/home?tab=profile")
  await page.getByRole("button", { name: "Settings" }).click()
  const signOutBtn = page.getByRole("button", { name: /Sign out/ })
  await expect(signOutBtn).toBeVisible({ timeout: 10000 })
  await signOutBtn.click()
  await expect(page.getByText("Signing you out…")).toBeVisible({ timeout: 2000 })
  await page.waitForURL(/\/login/, { timeout: 15000 })
  await expect(page).toHaveURL(/\/login/)
  await context.close()
})
