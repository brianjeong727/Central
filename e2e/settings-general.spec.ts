import { test, expect } from "@playwright/test"

// Church Settings → General, desktop admin.
//
// Covers T7 end to end: the time-zone editor is staged behind Edit → Save
// (Convention #21), commits through the profile confirm modal, and the commit
// lands in the Audit Log as a PLAIN-ENGLISH row — no `settings.general_edit`,
// no `timezone`, no raw key anywhere on that screen.
//
// The sandbox zone is restored in a `finally` so a failing assertion can never
// leave the tenant on a different zone for the next spec.
const ORIGINAL_ZONE = "America/New_York"
const TEST_ZONE = "America/Chicago"
const ORIGINAL_LABEL = "Eastern (New York)"
const TEST_LABEL = "Central (Chicago)"

test.describe("Church Settings — General (desktop, admin)", () => {
  test("time zone saves through the confirm and reads back in plain English in the Audit Log", async ({ page }) => {
    await page.goto("/home?tab=settings&stab=general")

    // The Profile section is the one that owns the Time zone control.
    const profile = page.locator("section").filter({ has: page.getByText("Time zone", { exact: true }) }).first()
    await expect(profile).toBeVisible()
    await expect(page.getByTestId("settings-timezone")).toHaveText(ORIGINAL_LABEL)

    try {
      // ── Edit → stage → Save ──────────────────────────────────────────────
      await profile.getByRole("button", { name: "Edit" }).click()
      const zone = page.getByRole("combobox", { name: "Time zone" })
      await expect(zone).toBeVisible()
      await zone.selectOption(TEST_ZONE)
      await profile.getByRole("button", { name: "Save changes" }).click()

      // ── Confirm modal shows the old → new pair ───────────────────────────
      await expect(page.getByText("Save profile changes?")).toBeVisible()
      await expect(page.getByText(new RegExp(`Time zone\\s*${escapeRe(ORIGINAL_LABEL)}\\s*→\\s*${escapeRe(TEST_LABEL)}`))).toBeVisible()
      await page.getByRole("button", { name: "Confirm & save" }).click()

      // Committed: the section drops back to its read state on the new zone.
      await expect(page.getByTestId("settings-timezone")).toHaveText(TEST_LABEL)

      // ── Audit Log reads it in plain English ──────────────────────────────
      await page.goto("/home?tab=settings&stab=audit")
      await expect(page.getByText("Changed General").first()).toBeVisible()
      await expect(
        page.getByText(new RegExp(`Time zone:\\s*${escapeRe(ORIGINAL_LABEL)}\\s*→\\s*${escapeRe(TEST_LABEL)}`)).first(),
      ).toBeVisible()
      // No raw keys leak onto the screen.
      await expect(page.getByText("settings.general_edit")).toHaveCount(0)
      await expect(page.getByText("moderation.flag_threshold")).toHaveCount(0)
    } finally {
      // ── Restore the sandbox zone ─────────────────────────────────────────
      await page.goto("/home?tab=settings&stab=general")
      const back = page.locator("section").filter({ has: page.getByText("Time zone", { exact: true }) }).first()
      await back.getByRole("button", { name: "Edit" }).click()
      await page.getByRole("combobox", { name: "Time zone" }).selectOption(ORIGINAL_ZONE)
      await back.getByRole("button", { name: "Save changes" }).click()
      await page.getByRole("button", { name: "Confirm & save" }).click()
      await expect(page.getByTestId("settings-timezone")).toHaveText(ORIGINAL_LABEL)
    }
  })
})

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
}
