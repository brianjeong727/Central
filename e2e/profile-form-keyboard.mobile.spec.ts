// The mobile profile's relationship with the software keyboard
// (app/home/tabs/profile-tab.tsx + lib/keyboard-inset.ts + the nav pill).
//
// Profile v2 commits a field by BLURRING it, and at phone width the screen is
// rows end to end with nothing bare to tap — so "put the keyboard away" and
// "save what I typed" are the same act, and there was no way to perform it. The
// shell also hides iOS's own `^ v Done` accessory bar for the chat composer's
// sake, so there was no native escape either. On top of that the verse block —
// the one field you write a sentence into — is the LAST thing on the page, and
// went under the keys the moment it was tapped.
//
// Three of the four fixes are provable headless (there is no real keyboard here,
// so the swipe-down, which gates on one, is not): a field is big enough to press
// and paste into, an empty tap gives the keyboard back, and the page carries the
// room to scroll clear of it.
import { test, expect, type Page } from "@playwright/test"

/** The iOS/Material minimum, and the mobile contract's own number (§2). Below it
 *  a long press to summon Paste lands on the page instead of the field — which is
 *  what "I can't paste into it" actually was. */
const MIN_TAP = 44

/** Both viewports render into the DOM (`md:hidden` / `hidden md:block`), so every
 *  selector here has to say which one it means — an unscoped one matches two
 *  nodes and Playwright refuses. */
const row = (page: Page, label: string) =>
  page.locator(`div:visible`, { hasText: new RegExp(`^${label}$`) }).first()

async function openProfile(page: Page) {
  await page.goto("/home?tab=profile")
  await page.waitForLoadState("networkidle")
  await expect(page.locator("[data-kb-spacer]")).toHaveCount(1)
}

/** Tap a row to turn its value into an input — v2 has no edit MODE. */
async function editRow(page: Page, label: string, placeholder: string) {
  await row(page, label).click()
  const input = page.locator(`input[placeholder="${placeholder}"]:visible`).first()
  await expect(input).toBeFocused()
  return input
}

test.describe("mobile profile + keyboard", () => {
  test("an inline field is a real tap target — the thing that broke pasting", async ({ page }) => {
    await openProfile(page)
    const input = await editRow(page, "FAVORITE VERSE", "e.g. Philippians 4:13")
    expect(Math.round((await input.boundingBox())!.height)).toBeGreaterThanOrEqual(MIN_TAP)
  })

  test("pasting into a field lands", async ({ page, context }) => {
    await context.grantPermissions(["clipboard-read", "clipboard-write"])
    await openProfile(page)
    await page.evaluate(() => navigator.clipboard.writeText("Psalm 23:1"))
    const input = await editRow(page, "WORSHIP SONG", "A song that moves you")
    await page.keyboard.press("ControlOrMeta+KeyV")
    await expect(input).toHaveValue("Psalm 23:1")
  })

  test("tapping anything that isn't a control gives the keyboard back", async ({ page }) => {
    await openProfile(page)
    const input = await editRow(page, "STUDYING", "Your major")
    // The completeness meter's caption — text on the bare page between the
    // identity block and the rows, and the kind of empty space everyone taps
    // first. Blurring is also what COMMITS on this screen, so this is the save
    // gesture as much as the dismiss one.
    await page.getByText("Everything here is visible to your ministry.").click()
    // The input does not merely lose focus — it stops existing. Blur IS the commit
    // on this screen, so the row goes straight back to showing its value, which is
    // the whole point: the tap saved what you typed.
    await expect(input).toHaveCount(0)
  })

  test("the floating nav pill vacates while a keyboard is up", async ({ page }) => {
    await openProfile(page)
    const pill = page.locator("nav").filter({ has: page.getByLabel("Profile") }).first()
    await expect(pill).toBeVisible()
    // The keyboard layer sets this on <html>; there is no real keyboard headless.
    await page.evaluate(() => document.documentElement.setAttribute("data-kb-open", ""))
    await expect(pill).toBeHidden()
    await page.evaluate(() => document.documentElement.removeAttribute("data-kb-open"))
    await expect(pill).toBeVisible()
  })

  test("the verse at the bottom can be scrolled clear of the keyboard", async ({ page }) => {
    await openProfile(page)
    // Measured through evaluate, not boundingBox: with the keyboard closed the
    // spacer is 0px tall, which Playwright calls invisible and waits forever for.
    const spacerHeight = () => page.evaluate(() =>
      Math.round(document.querySelector("[data-kb-spacer]")!.getBoundingClientRect().height))
    expect(await spacerHeight()).toBe(0)

    // The verse block is the LAST thing on the page and the one field you write a
    // sentence into — the exact case that used to type itself under the keys.
    await page.getByText("Add the words, so people see why it stayed with you.").click()
    const verse = page.locator('textarea[aria-label="Verse text"]:visible').first()
    await expect(verse).toBeFocused()

    const KB = 300
    await page.evaluate((kb) => document.documentElement.style.setProperty("--kb-inset", `${kb}px`), KB)
    expect(await spacerHeight()).toBe(KB)

    // `behavior: "instant"` on purpose: globals.css sets `html { scroll-behavior:
    // smooth }`, so a plain scrollTo animates and a synchronous read afterwards
    // measures the position it started from.
    await page.evaluate(() => {
      const scroller = document.querySelector(".shell-scroll") as HTMLElement | null
      scroller?.scrollTo({ top: scroller.scrollHeight, behavior: "instant" as ScrollBehavior })
      window.scrollTo({ top: document.documentElement.scrollHeight, behavior: "instant" as ScrollBehavior })
    })
    const clearance = await page.evaluate((kb) => {
      const el = document.querySelector('textarea[aria-label="Verse text"]') as HTMLElement
      return { bottom: Math.round(el.getBoundingClientRect().bottom), keyboardTop: window.innerHeight - kb }
    }, KB)
    expect(clearance.bottom).toBeLessThanOrEqual(clearance.keyboardTop)

    await page.evaluate(() => document.documentElement.style.setProperty("--kb-inset", "0px"))
  })
})
