import { test, expect } from "@playwright/test"

// Signing up with an address that already has an account must SAY SO — not park the
// user on the verify-code screen forever.
//
// Supabase's email-enumeration protection makes signUp on an existing address return
// HTTP 200 with a SYNTHETIC user and send no email at all. `identities: []` is the only
// signal; `confirmation_sent_at` is populated on that fake user even though nothing was
// sent, so it cannot be used. Before the guard in signup/page.tsx the form advanced to
// the verify-code screen and the user waited forever for a code that never existed.
//
// Uses E2E_ADMIN_EMAIL because it is a CONFIRMED account: Supabase sends no email for
// an already-confirmed address, so this spec cannot consume the project-wide
// `rate_limit_email_sent` budget (2/hour on the built-in sender) no matter how often
// it runs. Do NOT rewrite this to use a fresh address — that would send real mail and
// exhaust the cap for everyone.

const EXISTING_EMAIL = process.env.E2E_ADMIN_EMAIL

test.describe("signup with an already-registered email", () => {
  test.use({ storageState: { cookies: [], origins: [] } })

  test("tells the user instead of stranding them on verify-code", async ({ page }) => {
    test.skip(!EXISTING_EMAIL, "E2E_ADMIN_EMAIL not set")

    await page.goto("/signup", { waitUntil: "networkidle" })
    await page.getByText("Join a ministry", { exact: false }).first().click()

    const first = (selector: string) => page.locator(selector).first()
    await first('input[placeholder="Brian Jeong"]').fill("Existing Email Probe")
    await page.getByText("Male", { exact: true }).first().click()
    await first('input[type="email"]').fill(EXISTING_EMAIL!)
    await first('input[type="password"]').fill("ProbePassword!12345")
    await first('input[type="number"]').fill(String(new Date().getFullYear() + 2))

    await page.getByRole("button", { name: /create account/i }).first().click()

    await expect(page.getByText(/already exists/i).first()).toBeVisible({ timeout: 15_000 })
    // The dead end itself: must NOT have advanced to the code screen.
    await expect(page.getByText(/6-digit|enter the code/i)).toHaveCount(0)
  })
})
