// Phone-width PULL-TO-REFRESH contract (mobile shell).
//
// The gesture is top-anchored: dragging down at the top opens a gap above the
// content with a spinner in it, and dragging down ANYWHERE ELSE must remain an
// ordinary scroll. That second half is the fragile one, because the guard that
// enforces it reads a scroll offset — and the shell's scroll div is NOT the
// element that scrolls at phone width. Every one of its height/overflow
// constraints is `md:`-prefixed, so it is auto-height there, its content never
// overflows its own box, and the DOCUMENT scrolls instead. Measured at 390px:
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
// Assertions are on MEASURED PIXELS, not on the indicator's presence: it is
// always mounted (the hook paints it imperatively — a drag emits a touchmove per
// frame and the shell wraps the whole app tree), so `count()` is always 1 and
// would prove nothing.
//
// If this fails mid-page, the document fallback was dropped — fix the hook,
// never relax the assertion.
import { test, expect, type Page } from "@playwright/test"

const INDICATOR = "[data-pull-refresh]"
const SCROLLER = ".shell-scroll"

interface Frame {
  gapHeight: number
  gapOpacity: number
  /** Vertical px the content has been pushed down by (0 when untransformed). */
  contentShift: number
}

async function readFrame(page: Page): Promise<Frame> {
  return page.evaluate(
    ([indSel, scrSel]) => {
      const ind = document.querySelector(indSel) as HTMLElement | null
      const scr = document.querySelector(scrSel) as HTMLElement | null
      const t = scr ? getComputedStyle(scr).transform : "none"
      // matrix(a,b,c,d,tx,ty) — ty is the 6th value. "none" means untransformed.
      const ty = t && t !== "none" ? parseFloat(t.slice(t.indexOf("(") + 1).split(",")[5] ?? "0") : 0
      return {
        gapHeight: ind ? ind.getBoundingClientRect().height : -1,
        gapOpacity: ind ? parseFloat(getComputedStyle(ind).opacity) : -1,
        contentShift: Math.round(ty),
      }
    },
    [INDICATOR, SCROLLER] as const
  )
}

// Real touch events via CDP — Playwright's touchscreen only taps, and this is a
// drag. Same approach as edge-swipe-back.mobile.spec.ts. Samples mid-drag with
// the finger still down, because the gap closes on release.
async function dragDown(page: Page): Promise<Frame> {
  const cdp = await page.context().newCDPSession(page)
  const x = 195
  await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x, y: 120, id: 0 }] })
  for (const y of [140, 170, 210, 250, 290, 330]) {
    await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x, y, id: 0 }] })
    await page.waitForTimeout(16)
  }
  const frame = await readFrame(page)
  await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] })
  await cdp.detach()
  return frame
}

const scrollY = (page: Page) => page.evaluate(() => window.scrollY)

test.describe("mobile pull-to-refresh", () => {
  // Home is the tab that overflows the viewport in the e2e tenant (the sandbox
  // has no announcements to make that feed tall), so it is the one place a
  // "mid-page" actually exists to test.
  // How far this page can actually scroll. Read only once it holds STILL across
  // two samples — the home tab grows as its sections resolve, and a height read
  // mid-load produced a different number on every run.
  async function scrollRoom(page: Page): Promise<number> {
    let last = -1
    for (let i = 0; i < 15; i++) {
      await page.waitForTimeout(400)
      const h = await page.evaluate(() => document.documentElement.scrollHeight - window.innerHeight)
      if (h === last) return h
      last = h
    }
    return last
  }

  let room = 0

  test.beforeEach(async ({ page }) => {
    await page.goto("/home?tab=home")
    room = await scrollRoom(page)
    // Derived, never hard-coded: the tenant's content decides the page height.
    expect(room, "need a scrollable page for this contract to mean anything").toBeGreaterThan(60)
  })

  test("at the top: content moves down and the spinner is revealed in the gap", async ({ page }) => {
    expect(await scrollY(page)).toBe(0)

    const atRest = await readFrame(page)
    expect(atRest.gapHeight, "gap is closed before the gesture").toBe(0)
    expect(atRest.contentShift, "content is untransformed at rest").toBe(0)

    const dragging = await dragDown(page)
    expect(dragging.contentShift, "the content itself must follow the finger down").toBeGreaterThan(20)
    expect(dragging.gapHeight, "the gap opens to reveal the spinner").toBeGreaterThan(20)
    expect(dragging.gapOpacity, "the spinner is visible in the gap").toBeGreaterThan(0.4)
    // The gap must match the space the content vacated — that is what makes the
    // spinner sit IN the opening rather than on top of the content.
    expect(Math.abs(dragging.gapHeight - dragging.contentShift)).toBeLessThanOrEqual(2)
  })

  test("returns to rest after release, leaving no transform behind", async ({ page }) => {
    await dragDown(page)
    // Past the settle + the deliberate hold that keeps a fast refresh visible.
    await page.waitForTimeout(1800)

    const settled = await readFrame(page)
    expect(settled.gapHeight, "gap closes again").toBe(0)
    // An identity transform still makes the element a containing block for its
    // fixed descendants, so the hook must strip the property, not zero it.
    const raw = await page.evaluate(
      sel => (document.querySelector(sel) as HTMLElement).style.transform,
      SCROLLER
    )
    expect(raw, "inline transform must be removed at rest, not left at translateY(0)").toBe("")
  })

  test("does NOT arm mid-page, and the page still scrolls", async ({ page }) => {
    await page.evaluate(y => window.scrollTo(0, y), Math.min(120, room))
    await page.waitForTimeout(400)
    const before = await scrollY(page)
    expect(before, "precondition: page is scrolled away from the top").toBeGreaterThan(50)

    const dragging = await dragDown(page)
    expect(dragging.contentShift, "content must not move partway down the page").toBe(0)
    expect(dragging.gapHeight, "no gap may open partway down the page").toBe(0)

    // The drag must have been left alone as a normal scroll — i.e. NOT swallowed
    // by preventDefault. Dragging the finger downward scrolls the page UP.
    const after = await scrollY(page)
    expect(after, "the downward drag should have scrolled the page, not been eaten").toBeLessThan(before)
  })
})
