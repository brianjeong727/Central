import { test, expect, devices } from "@playwright/test"
import { adminState } from "./fixtures"

// /ministries must always offer a signed-in user a way OUT.
//
// proxy.ts sends every non-public path to /ministries while profiles.ministry_id is
// null, and separately bounces a logged-in user off /login and /signup to /home —
// which lands right back on /ministries. So for a user who has signed up but not yet
// joined anything, this screen was a closed loop: no back, no sign out, and in the
// Capacitor shell not even a marketing page to fall back to. Clearing cookies was the
// only exit. Reported from the field 2026-08-19.
//
// The assertion is deliberately "signed in ⇒ Sign out is present", not the trapped
// case: it needs no special fixture, and the control it guards is the one that has to
// exist for the trapped user. Both viewports, because the two trees are separate.

test.describe("ministries page always offers an exit", () => {
  test("desktop shows Sign out", async ({ browser }) => {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, storageState: adminState })
    const page = await ctx.newPage()
    await page.goto("/ministries", { waitUntil: "networkidle" })
    await expect(page.getByRole("button", { name: "Sign out" })).toBeVisible({ timeout: 20_000 })
    await ctx.close()
  })

  test("mobile shows Sign out", async ({ browser }) => {
    const ctx = await browser.newContext({ ...devices["iPhone 14 Pro"], storageState: adminState })
    const page = await ctx.newPage()
    await page.goto("/ministries", { waitUntil: "networkidle" })
    await expect(page.getByRole("button", { name: "Sign out" })).toBeVisible({ timeout: 20_000 })
    await ctx.close()
  })
})
