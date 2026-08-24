// The mobile profile form's relationship with the software keyboard
// (app/home/tabs/profile-tab.tsx + lib/keyboard-inset.ts + the nav pill).
//
// A profile at phone width is fields end to end, and the shell hides iOS's own
// `^ v Done` accessory bar for the chat composer's sake — so a keyboard, once
// up, had no way down and the field you were typing in could sit underneath it.
// Three of the four fixes are provable in a headless browser (there is no real
// keyboard here, so the INSET itself is not): the fields are big enough to press
// and paste into, an empty tap gives the keyboard back, and the floating nav
// pill vacates whenever a keyboard is up.
import { test, expect, type Page } from "@playwright/test"

/** The iOS/Material minimum, and the mobile contract's own number (§2). Below it
 *  a long press to summon Paste lands on the page instead of the field — which is
 *  what "I can't paste into it" actually was. */
const MIN_TAP = 44

/** The mobile copy. Both viewports render into the DOM (`md:hidden` /
 *  `hidden md:block`), so every field selector here has to say which one it means
 *  — an unscoped one matches two nodes and Playwright refuses. */
const verseField = (page: Page) => page.locator('input[placeholder="e.g. Philippians 4:13"]:visible').first()

async function openEditForm(page: Page) {
  await page.goto("/home?tab=profile")
  await page.waitForLoadState("networkidle")
  await page.getByRole("button", { name: "Edit profile" }).click()
  await expect(page.getByRole("button", { name: "Save" })).toBeVisible()
}

test.describe("mobile profile form + keyboard", () => {
  test("every field is a real tap target — the thing that broke pasting", async ({ page }) => {
    await openEditForm(page)
    const small = await page.evaluate((min) => {
      const els = Array.from(document.querySelectorAll<HTMLElement>("input, textarea, select"))
      return els
        .filter((e) => e.offsetParent !== null && e.getBoundingClientRect().width > 0)
        // The avatar picker is a 0×0 hidden file input behind a 56px label.
        .filter((e) => !(e instanceof HTMLInputElement && e.type === "file"))
        .map((e) => ({ label: e.getAttribute("aria-label") || e.getAttribute("placeholder") || e.tagName, h: Math.round(e.getBoundingClientRect().height) }))
        .filter((f) => f.h < min)
    }, MIN_TAP)
    expect(small, `fields under ${MIN_TAP}px: ${JSON.stringify(small)}`).toEqual([])
  })

  test("pasting into a field lands", async ({ page, context }) => {
    await context.grantPermissions(["clipboard-read", "clipboard-write"])
    await openEditForm(page)
    await page.evaluate(() => navigator.clipboard.writeText("Psalm 23:1"))
    const verse = verseField(page)
    await verse.click()
    await page.keyboard.press("ControlOrMeta+KeyV")
    await expect(verse).toHaveValue("Psalm 23:1")
  })

  test("tapping anything that isn't a control gives the keyboard back", async ({ page }) => {
    await openEditForm(page)
    const verse = verseField(page)
    await verse.click()
    await expect(verse).toBeFocused()

    // The FAITH section kicker — a label, not a control. On a phone this is the
    // bare page between two cards, and tapping it is what everyone tries first.
    await page.locator("p:visible", { hasText: /^Faith$/ }).first().click()
    await expect(verse).not.toBeFocused()
  })

  test("the floating nav pill vacates while a keyboard is up", async ({ page }) => {
    await openEditForm(page)
    const pill = page.locator("nav").filter({ has: page.getByLabel("Profile") }).first()
    await expect(pill).toBeVisible()
    // The keyboard layer sets this on <html>; there is no real keyboard headless.
    await page.evaluate(() => document.documentElement.setAttribute("data-kb-open", ""))
    await expect(pill).toBeHidden()
    await page.evaluate(() => document.documentElement.removeAttribute("data-kb-open"))
    await expect(pill).toBeVisible()
  })

  test("the form gains exactly the keyboard's height to scroll into", async ({ page }) => {
    await openEditForm(page)
    // Measured through evaluate, not boundingBox: with the keyboard closed the
    // spacer is 0px tall, which Playwright calls invisible and waits forever for.
    const spacerHeight = () => page.evaluate(() =>
      Math.round(document.querySelector("[data-kb-spacer]")!.getBoundingClientRect().height))

    // Closed keyboard: the spacer is nothing, and the page keeps its own bottom
    // padding (which is why this is a spacer and not `kb-lift` on the root —
    // the class sets padding-bottom outright and would have eaten it).
    expect(await spacerHeight()).toBe(0)

    // The keyboard layer publishes its height as --kb-inset; there is no real
    // keyboard headless, so drive the variable the way the layer would.
    const KB = 300
    await page.evaluate((kb) => document.documentElement.style.setProperty("--kb-inset", `${kb}px`), KB)
    expect(await spacerHeight()).toBe(KB)

    // The property that actually matters: with the keyboard up, the LAST field
    // can be scrolled clear of it. Asserting the document simply grew by 300 is
    // wrong — a short page has slack, and the first stretch of the spacer only
    // fills that before it starts adding scroll.
    // `behavior: "instant"` on purpose: globals.css sets `html { scroll-behavior:
    // smooth }`, so a plain scrollTo animates and a synchronous read afterwards
    // measures the position it started from — which reads as "the spacer did
    // nothing" when the spacer is fine.
    await page.evaluate(() => {
      const scroller = document.querySelector(".shell-scroll") as HTMLElement | null
      scroller?.scrollTo({ top: scroller.scrollHeight, behavior: "instant" as ScrollBehavior })
      window.scrollTo({ top: document.documentElement.scrollHeight, behavior: "instant" as ScrollBehavior })
    })
    const clearance = await page.evaluate((kb) => {
      const fields = Array.from(document.querySelectorAll<HTMLElement>("input, textarea"))
        .filter((e) => e.offsetParent !== null && e.getBoundingClientRect().height > 0)
      const last = fields[fields.length - 1]
      return { bottom: Math.round(last.getBoundingClientRect().bottom), keyboardTop: window.innerHeight - kb }
    }, KB)
    expect(clearance.bottom).toBeLessThanOrEqual(clearance.keyboardTop)

    await page.evaluate(() => document.documentElement.style.setProperty("--kb-inset", "0px"))
  })

  test("a section with nothing in it renders no kicker", async ({ page }) => {
    await openEditForm(page)
    // ABOUT and PRAYER carry no fields at all, so in edit mode they used to paint
    // two bare labels over blank page in the middle of the form.
    await expect(page.locator("p:visible", { hasText: /^About$/ })).toHaveCount(0)
    await expect(page.locator("p:visible", { hasText: /^Prayer$/ })).toHaveCount(0)
    // The sections that DO have fields are untouched.
    await expect(page.locator("p:visible", { hasText: /^Faith$/ }).first()).toBeVisible()
  })
})
