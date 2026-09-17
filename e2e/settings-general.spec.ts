import { test, expect, type Page } from "@playwright/test"

// Church Settings → General, desktop admin.
//
// Covers T7 end to end: the time-zone editor is staged behind Edit → Save
// (Convention #21), commits through the profile confirm modal, and the commit
// lands in the Audit Log as a PLAIN-ENGLISH row — no `settings.general_edit`,
// no `timezone`, no raw key anywhere on that screen.
//
// The spec reads the STORED zone rather than assuming one (the sandbox is shared
// and another suite may have moved it), picks a different curated zone to edit
// to, and always lands the tenant back on America/New_York — in a `finally`, so
// a failing assertion can never leave the sandbox on a test zone.
const CANONICAL_ZONE = "America/New_York"
const CANONICAL_LABEL = "Eastern (New York)"
const TEST_ZONE = "America/Chicago"
const TEST_LABEL = "Central (Chicago)"
const ALT_ZONE = "America/Denver"
const ALT_LABEL = "Mountain (Denver)"

test.describe("Church Settings — General (desktop, admin)", () => {
  test("time zone saves through the confirm and reads back in plain English in the Audit Log", async ({ page }) => {
    await page.goto("/home?tab=settings&stab=general")

    // The Profile section is the one that owns the Time zone control.
    const profile = page.locator("section").filter({ has: page.getByText("Time zone", { exact: true }) }).first()
    await expect(profile).toBeVisible()
    const fromLabel = (await page.getByTestId("settings-timezone").innerText()).trim()
    expect(fromLabel.length).toBeGreaterThan(0)
    // Never "edit" to the zone already stored — that would leave Save disabled.
    const toZone = fromLabel === TEST_LABEL ? ALT_ZONE : TEST_ZONE
    const toLabel = fromLabel === TEST_LABEL ? ALT_LABEL : TEST_LABEL

    try {
      // ── Edit → stage → Save ──────────────────────────────────────────────
      await setZone(page, profile, toZone)

      // ── The confirm modal showed the old → new pair ──────────────────────
      // (asserted inside setZone), and the section is back in its read state.
      await expect(page.getByTestId("settings-timezone")).toHaveText(toLabel)

      // ── Audit Log reads it in plain English ──────────────────────────────
      await page.goto("/home?tab=settings&stab=audit")
      await expect(page.getByText("Changed General").first()).toBeVisible()
      await expect(
        page.getByText(new RegExp(`Time zone:\\s*${escapeRe(fromLabel)}\\s*→\\s*${escapeRe(toLabel)}`)).first(),
      ).toBeVisible()
      // No raw keys leak onto the screen.
      await expect(page.getByText("settings.general_edit")).toHaveCount(0)
      await expect(page.getByText("moderation.flag_threshold")).toHaveCount(0)
    } finally {
      // ── Land the sandbox back on its canonical zone ──────────────────────
      await page.goto("/home?tab=settings&stab=general")
      const back = page.locator("section").filter({ has: page.getByText("Time zone", { exact: true }) }).first()
      await expect(back).toBeVisible()
      await setZone(page, back, CANONICAL_ZONE)
      await expect(page.getByTestId("settings-timezone")).toHaveText(CANONICAL_LABEL)
    }
  })
})

// Edit → pick a zone → Save changes → Confirm & save, asserting the confirm
// modal lists the change it is about to commit.
async function setZone(page: Page, section: ReturnType<Page["locator"]>, zone: string) {
  await section.getByRole("button", { name: "Edit" }).click()
  const select = page.getByRole("combobox", { name: "Time zone" })
  await expect(select).toBeVisible()
  await select.selectOption(zone)
  await section.getByRole("button", { name: "Save changes" }).click()
  await expect(page.getByText("Save profile changes?")).toBeVisible()
  await expect(page.getByText(/Time zone/).last()).toBeVisible()
  await page.getByRole("button", { name: "Confirm & save" }).click()
  await expect(page.getByText("Save profile changes?")).toHaveCount(0)
}

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
}
