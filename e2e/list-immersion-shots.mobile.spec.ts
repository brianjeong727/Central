// Throwaway visual capture for the full-bleed list immersion (Chats + Directory).
// Evidence only — guarded on IMMERSION_SHOT_DIR so it is a no-op in CI.
import { test, type Page } from "@playwright/test"

const SHOT_DIR = process.env.IMMERSION_SHOT_DIR

async function shot(page: Page, name: string) {
  if (!SHOT_DIR) return
  await page.screenshot({ path: `${SHOT_DIR}/${name}.png`, fullPage: false })
}

test.describe("full-bleed list immersion", () => {
  test("capture Chats + Directory", async ({ page }) => {
    test.setTimeout(180_000)

    await page.goto("/home?tab=chats")
    await page.waitForTimeout(3500)
    await shot(page, "01-chats-church")

    // My chats — the flat single run (no section eyebrows).
    const my = page.getByRole("button", { name: "My chats" }).filter({ visible: true }).first()
    if (await my.count()) { await my.click(); await page.waitForTimeout(2000) }
    await shot(page, "02-chats-my")

    await page.goto("/home?tab=directory")
    await page.waitForTimeout(3500)
    await shot(page, "03-directory")
  })
})
