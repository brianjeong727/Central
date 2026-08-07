// Phone-width GUTTER CONTRACT: a subpage's content sits exactly 20px from the
// mobile container's edge — the same inset as the tab roots it was opened from.
//
// A `SubpageShell` is a full-bleed subpage (mobile_design_system §3): its own 20px
// screen padding must be the ONLY horizontal inset. That used to hold by convention
// (mount the shell outside your padded wrapper), and the Plan tab's
// `md:hidden px-5 pb-28` body wrapper broke it: anything opened from inside a team —
// the event workspace and every one of its spokes — rendered at 40px, visibly
// narrower than the events list it was opened from, chrome row included.
//
// `SubpageShell` now cancels inherited padding itself (useDeBleed), so this spec is
// the regression guard on that contract rather than on any one screen. If it fails,
// something is double-padding again — fix the shell or the mount, never the number.
import { test, expect, type Page } from "@playwright/test"
import { adminState, sandbox } from "./fixtures"

const MOBILE = { viewport: { width: 390, height: 844 } } as const

/** Central's one mobile screen padding (mobile_design_system §2 "Screen padding 20"). */
const SCREEN_PADDING = 20

/**
 * Left edge of the SubpageShell body's CONTENT box, relative to the viewport.
 * Returns null when no shell is mounted (so a nav miss reads as a skip, not a pass).
 */
async function shellContentLeft(page: Page): Promise<number | null> {
  return page.evaluate(() => {
    const shells = Array.from(document.querySelectorAll("div.w-full.px-5"))
      .filter(el => (el as HTMLElement).offsetParent !== null)
    const body = shells[0]
    if (!body) return null
    const r = body.getBoundingClientRect()
    return Math.round(r.left + (parseFloat(getComputedStyle(body).paddingLeft) || 0))
  })
}

async function expectGutter(page: Page, label: string) {
  const left = await shellContentLeft(page)
  expect(left, `${label}: no SubpageShell mounted — navigation missed, not a pass`).not.toBeNull()
  expect(left, `${label}: content should sit ${SCREEN_PADDING}px from the edge, got ${left}px`).toBe(SCREEN_PADDING)
}

test.describe("mobile subpage gutter contract (20px, never doubled)", () => {
  test.use({ storageState: adminState, ...MOBILE })

  let teamId = ""
  let eventTitle = ""

  test.beforeAll(async () => {
    const sb = sandbox()
    // Any team with at least one event is enough — the contract is structural.
    const { data: ev } = await sb.client
      .from("calendar_events")
      .select("title, team_id")
      .eq("ministry_id", sb.ministryId)
      .not("team_id", "is", null)
      .is("parent_event_id", null)
      .order("start_date", { ascending: false })
      .limit(1)
      .maybeSingle()
    if (ev) { teamId = (ev as { team_id: string }).team_id; eventTitle = (ev as { title: string }).title }
  })

  test.beforeEach(() => {
    test.skip(!teamId, "no team-owned event in this lane's sandbox")
  })

  test("event workspace hub and its spokes hold the 20px gutter", async ({ page }) => {
    await page.goto(`/home?tab=plan&team=${teamId}`)
    const card = page.getByText(eventTitle, { exact: true }).filter({ visible: true }).first()
    await card.waitFor({ state: "visible", timeout: 30_000 })
    await card.click()

    await page.getByText("Jump into planning", { exact: true }).filter({ visible: true }).first()
      .waitFor({ state: "visible", timeout: 30_000 })
    await expectGutter(page, "event hub")

    await page.getByText("Overview", { exact: true }).filter({ visible: true }).first().click()
    await page.waitForTimeout(1200)
    await expectGutter(page, "Overview spoke")

    await page.getByLabel(/^Back to /).filter({ visible: true }).first().click()
    await page.waitForTimeout(900)
    await page.getByText("Roles", { exact: true }).filter({ visible: true }).first().click()
    await page.waitForTimeout(1200)
    await expectGutter(page, "Roles spoke")
  })

  test("team settings holds the 20px gutter", async ({ page }) => {
    await page.goto("/home?tab=plan")
    const gear = page.getByTitle("Team settings").filter({ visible: true }).first()
    await gear.waitFor({ state: "visible", timeout: 30_000 })
    await gear.click()
    await page.getByText("Members", { exact: true }).filter({ visible: true }).first()
      .waitFor({ state: "visible", timeout: 20_000 })
    await expectGutter(page, "team settings")
  })
})
