// Phone-width PULL-TO-REFRESH contract (mobile shell).
//
// The gesture is top-anchored: dragging down at the top of a page refreshes it,
// and dragging down ANYWHERE ELSE must remain an ordinary scroll. That second
// half is the fragile one, because the guard that enforces it reads a scroll
// offset — and the shell's scroll div is NOT the element that scrolls at phone
// width. Every one of its height/overflow constraints is `md:`-prefixed, so it
// is auto-height there, its content never overflows its own box, and the
// DOCUMENT scrolls instead. Measured on announcements at 390px:
//
//     .shell-scroll   scrollHeight 1920 === clientHeight 1920   (not scrollable)
//     after 600px     .shell-scroll.scrollTop 0, window.scrollY 600
//
// So `node.scrollTop` reports a permanent 0 at exactly the width the gesture
// runs at. Reading it alone satisfies "am I at the top?" at EVERY scroll
// position, arming the pull halfway down a feed where preventDefault then eats
// the scroll. usePullToRefresh reads `effectiveScrollTop` instead, which falls
// back to the document when the node isn't itself scrollable.
//
// If this spec fails mid-page, that fallback was dropped — fix the hook, never
// relax the assertion.
import { test, expect, type Page } from "@playwright/test"

const INDICATOR = "[data-pull-refresh]"

// Real touch events via CDP — Playwright's touchscreen only taps, and this
// gesture is a drag. Same approach as edge-swipe-back.mobile.spec.ts.
async function dragDown(page: Page, opts: { hold?: boolean } = {}) {
  const cdp = await page.context().newCDPSession(page)
  const x = 195
  await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x, y: 120, id: 0 }] })
  for (const y of [140, 170, 210, 250, 290, 330]) {
    await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x, y, id: 0 }] })
    await page.waitForTimeout(16)
  }
  // Sample while the finger is still down — the indicator is transient.
  const visibleDuringDrag = await page.locator(INDICATOR).count()
  if (!opts.hold) {
    await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] })
  }
  await cdp.detach()
  return visibleDuringDrag
}

const scrollY = (page: Page) => page.evaluate(() => window.scrollY)

test.describe("mobile pull-to-refresh", () => {
  // Home is the tab that overflows the viewport in the e2e tenant (the sandbox
  // has no announcements to make that feed tall), so it is the one place a
  // "mid-page" actually exists to test.
  test.beforeEach(async ({ page }) => {
    await page.goto("/home?tab=home")
    await page.waitForTimeout(2500)
    const h = await page.evaluate(() => document.documentElement.scrollHeight)
    // Needs enough room to sit clear of the top and still be scrolled.
    expect(h, "need a scrollable page for this contract to mean anything").toBeGreaterThan(844 + 120)
  })

  test("arms at the top of the page", async ({ page }) => {
    expect(await scrollY(page)).toBe(0)
    const seen = await dragDown(page)
    expect(seen, "spinner should follow the finger when pulling from the top").toBeGreaterThan(0)
  })

  test("does NOT arm mid-page, and the page still scrolls", async ({ page }) => {
    await page.evaluate(() => window.scrollTo(0, 120))
    await page.waitForTimeout(400)
    const before = await scrollY(page)
    expect(before, "precondition: page is scrolled away from the top").toBeGreaterThan(50)

    const seen = await dragDown(page)
    expect(seen, "pull-to-refresh must not arm partway down the page").toBe(0)

    // The drag must have been left alone as a normal scroll — i.e. NOT swallowed
    // by preventDefault. Dragging the finger downward scrolls the page UP.
    const after = await scrollY(page)
    expect(after, "the downward drag should have scrolled the page, not been eaten").toBeLessThan(before)
  })
})
