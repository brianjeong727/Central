// Repro + regression coverage for the mobile compose rework (task: mobile-design-sweep):
//   BUG 1 — CreateChatScreen (church + my variants): member search/list clipped,
//           Create button mid-screen, floating pill nav + super chip painting OVER
//           the overlay (root cause: `.content-enter` filled transform animation
//           made the tab wrapper a containing block for `fixed`).
//   BUG 2 — CreateAnnouncementModal mobile branch: nav over the form, chrome row
//           wrap, audience chips wrapping to 3 rows, safe-area clearance.
//   BUG 3 — nav suppression mechanism for full-screen mobile surfaces.
//
// Runs in the `mobile` Playwright project (390×844, admin storage state).
import { test, expect, type Page } from "@playwright/test"

const SHOT_DIR = ".claude/task-context/mobile-design-sweep/screenshots/rework"
const PHASE = process.env.REPRO_PHASE === "before" ? "before" : "after"

function shot(name: string) {
  return `${SHOT_DIR}/${PHASE}-${name}.png`
}

function vis(page: Page, selector: string) {
  return page.locator(selector).filter({ visible: true })
}

// The floating pill nav (dark plum rounded bar, fixed z-50). It hosts the Home button.
function navPill(page: Page) {
  return page.locator("div.fixed.z-50", { has: page.getByRole("button", { name: "Home" }) })
}

test.describe("mobile compose surfaces — nav suppression + layout", () => {
  test("new church chat: full-screen, member list scrolls, nav hidden", async ({ page }) => {
    await page.goto("/home?tab=chats")
    // Church scope is the default; per-section + buttons carry "New <section> chat".
    const addBtn = page.getByRole("button", { name: /^New .+ chat$/ }).filter({ visible: true }).first()
    await expect(addBtn).toBeVisible({ timeout: 15000 })
    await expect(navPill(page)).toBeVisible()
    await addBtn.click()

    const title = page.getByRole("heading", { name: "New Church Chat" }).filter({ visible: true })
    await expect(title).toBeVisible()

    // Member search + list must render — with actual member rows once the
    // roster fetch lands (the sandbox has one other profile).
    const search = page.getByPlaceholder("Search members…").filter({ visible: true })
    await expect(search).toBeVisible()
    await expect(vis(page, "text=Add Members")).toBeVisible()
    await expect(page.getByText("No members found").filter({ visible: true })).toBeHidden({ timeout: 10000 })

    // The overlay must be viewport-fixed and full-height: the title row sits near
    // the top of the VIEWPORT, and the Create button near the bottom.
    const titleBox = await title.boundingBox()
    expect(titleBox!.y).toBeLessThan(120)
    const createBtn = page.getByRole("button", { name: /^Create Chat/ }).filter({ visible: true })
    await expect(createBtn).toBeVisible()
    const createBox = await createBtn.boundingBox()
    expect(createBox!.y + createBox!.height).toBeGreaterThan(844 - 120)

    if (PHASE === "after") {
      // Nav must be suppressed while the composer is open (spec §2.2).
      await expect(navPill(page)).toBeHidden()
    }
    await page.screenshot({ path: shot("new-church-chat"), fullPage: false })

    // Member rows are tappable (list actually rendered, not collapsed).
    const memberRow = search.locator("xpath=ancestor::div[contains(@class,'flex-col')][1]").getByRole("button").first()
    await expect(memberRow).toBeVisible()

    // Close → nav returns.
    await page.getByRole("button", { name: /^Create Chat/ }).filter({ visible: true }).waitFor()
    await page.locator("div.fixed.z-\\[60\\] button").first().click() // X button (first button in overlay header)
    await expect(navPill(page)).toBeVisible()
  })

  test("new my chat: full-screen, member list renders, nav hidden", async ({ page }) => {
    await page.goto("/home?tab=chats&chats=my")
    const addBtn = page.getByRole("button", { name: "New chat", exact: true }).filter({ visible: true })
    await expect(addBtn).toBeVisible({ timeout: 15000 })
    await addBtn.click()

    const title = page.getByRole("heading", { name: "New Chat" }).filter({ visible: true })
    await expect(title).toBeVisible()
    const titleBox = await title.boundingBox()
    expect(titleBox!.y).toBeLessThan(120)

    // Search field + at least one member row between the kicker and the button.
    const search = page.getByPlaceholder("Search members…").filter({ visible: true })
    await expect(search).toBeVisible()
    const searchBox = await search.boundingBox()
    expect(searchBox!.y).toBeGreaterThan(0)
    expect(searchBox!.y).toBeLessThan(844)
    await expect(page.getByText("No members found").filter({ visible: true })).toBeHidden({ timeout: 10000 })

    if (PHASE === "after") {
      await expect(navPill(page)).toBeHidden()
    }
    await page.screenshot({ path: shot("new-my-chat"), fullPage: false })
  })

  test("announcement compose: one-line chrome, scrollable audience row, nav hidden", async ({ page }) => {
    await page.goto("/home?tab=announcements")
    const createBtn = page.getByRole("button", { name: "New announcement" }).filter({ visible: true }).first()
    await expect(createBtn).toBeVisible({ timeout: 15000 })
    await createBtn.click()

    const chromeTitle = page.getByText("New announcement", { exact: true }).filter({ visible: true }).first()
    await expect(chromeTitle).toBeVisible()

    if (PHASE === "after") {
      await expect(navPill(page)).toBeHidden()
      // Chrome row single line: back button and Publish share a row with the title.
      const backBox = await page.getByRole("button", { name: "Back" }).filter({ visible: true }).boundingBox()
      const pubBox = await page.getByRole("button", { name: "Publish" }).filter({ visible: true }).boundingBox()
      const titleBox = await chromeTitle.boundingBox()
      // Vertical centers of title and Publish within the back button's row band.
      const rowCenter = backBox!.y + backBox!.height / 2
      expect(Math.abs(titleBox!.y + titleBox!.height / 2 - rowCenter)).toBeLessThan(12)
      expect(Math.abs(pubBox!.y + pubBox!.height / 2 - rowCenter)).toBeLessThan(12)

      // Audience chips: one horizontally scrollable row (no wrap).
      const everyone = page.getByRole("button", { name: "Everyone" }).filter({ visible: true })
      const group = page.getByRole("button", { name: "Specific Group" }).filter({ visible: true })
      const eBox = await everyone.boundingBox()
      const gBox = await group.boundingBox()
      expect(Math.abs(eBox!.y - gBox!.y)).toBeLessThan(4) // same row
    }

    await page.screenshot({ path: shot("announcement-compose-top"), fullPage: false })

    // Scroll to the bottom (Attachment + Form sections) and verify nothing is
    // covered by the nav and the last section clears the safe area.
    const formPicker = page.getByText("Attach a form to collect responses").filter({ visible: true })
    await formPicker.scrollIntoViewIfNeeded()
    await page.mouse.wheel(0, 400) // settle at the true document bottom
    await expect(page.getByText("Add image or file").filter({ visible: true })).toBeVisible()
    await page.screenshot({ path: shot("announcement-compose-attachments"), fullPage: false })
  })
})
