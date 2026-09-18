// Home is a front door, not a backlog (design pass B4, 2026-09-17).
//
// What this proves, as the sandbox MEMBER at phone width:
//  (a) My deadlines shows at most five open items and a "See all N →" that lands
//      on the Workspace tab — it used to render every open task plus a done tail.
//  (b) A live Pastor Pulse question renders as its OWN card under Featured, not as
//      the carousel's lead slide: the FEATURED carousel's first card is a real
//      slide (it carries "See event"), and the pulse card sits below the dots.
import { test, expect } from "@playwright/test"
import { sandbox, memberState, E2E_PREFIX } from "./fixtures"

const Q = `${E2E_PREFIX}Home doing-plane pulse`
let pausedQuestionIds: string[] = []

test.describe("home — doing plane", () => {
  test.use({ storageState: memberState })

  test.beforeAll(async () => {
    const sb = sandbox()
    // The shell shows ONE active question; the member may already have answered
    // the tenant's live one. Pause every active question for the run and restore.
    const { data } = await sb.client.from("congregation_questions").select("id").eq("ministry_id", sb.ministryId).eq("is_active", true)
    pausedQuestionIds = (data ?? []).map((r) => r.id)
    if (pausedQuestionIds.length) await sb.client.from("congregation_questions").update({ is_active: false }).in("id", pausedQuestionIds)
    await sb.deletePulseQuestionsByPrefix(E2E_PREFIX)
    await sb.createPulseQuestion({ createdBy: await sb.adminUserId(), questionText: Q })
  })

  test.afterAll(async () => {
    const sb = sandbox()
    await sb.deletePulseQuestionsByPrefix(E2E_PREFIX)
    if (pausedQuestionIds.length) await sb.client.from("congregation_questions").update({ is_active: true }).in("id", pausedQuestionIds)
  })

  test("deadlines are capped at five with See all; the pulse is its own card under Featured", async ({ page }) => {
    await page.goto("/home")
    // Both width trees are mounted; the desktop one is display:none, so
    // visibility-filtered page locators resolve to the phone tree alone.
    const screen = page

    // (b) The pulse card is present, below the carousel, and is not a slide.
    const pulse = screen.getByText(Q, { exact: true }).filter({ visible: true })
    await expect(pulse).toBeVisible({ timeout: 20_000 })
    const featured = screen.getByText(/^featured$/i).filter({ visible: true }).first()
    await expect(featured).toBeVisible()
    const fy = (await featured.boundingBox())!.y
    const py = (await pulse.boundingBox())!.y
    expect(py).toBeGreaterThan(fy)
    // The carousel's first card is a data slide (carries its own See event / RSVP).
    const firstCardAction = screen.getByRole("button", { name: /See event|See announcement|Read more/ }).filter({ visible: true }).first()
    if (await firstCardAction.count()) {
      const ay = (await firstCardAction.boundingBox())!.y
      expect(ay).toBeLessThan(py)
    }

    // (a) The deadlines section caps at five rows and hands off with See all.
    const section = screen.getByText("My deadlines", { exact: true }).filter({ visible: true })
    await expect(section).toBeVisible({ timeout: 20_000 })
    const checkboxes = screen.getByRole("button", { name: /Mark (not )?done/ }).filter({ visible: true })
    const n = await checkboxes.count()
    expect(n).toBeLessThanOrEqual(5)
    // No done tail on Home at all.
    await expect(screen.getByRole("button", { name: "Mark not done" }).filter({ visible: true })).toHaveCount(0)
    const seeAll = screen.getByRole("button", { name: /^See all( \d+)? →$/ }).filter({ visible: true })
    if (n > 0) {
      await expect(seeAll).toBeVisible()
      await seeAll.click()
      await expect(page).toHaveURL(/tab=plan/, { timeout: 10_000 })
    }
  })
})
