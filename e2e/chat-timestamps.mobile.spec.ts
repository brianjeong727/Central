// Smarter chat timestamps — the iMessage/Messenger grammar (ratified with Brian
// 2026-09-13):
//
//   • A centred time stamp opens each conversation WINDOW: the first message and
//     any message more than an hour after the previous one (`opensTimeWindow` in
//     app/home/tabs/chats-tab.tsx). Not per day, not per message.
//   • Per-message times are NOT printed in the flow. Each row parks its time
//     past the right edge of the screen (`MessageTimeLabel` in message-row.tsx),
//     and dragging the transcript LEFT slides the whole column in
//     (`useSwipeRevealTimes`, components/central/use-swipe-reveal-times.ts).
//   • The long-press menu carries the full date+time as a caption, so the
//     gesture is an accelerator and never the only route (mobile §0.3).
//
// What is worth proving is the coexistence: a leftward drag must not trip the
// 400ms long-press timer (Convention #7), and a vertical drag must still scroll.
import { test, expect, type Page, type Locator } from "@playwright/test"
import { sandbox, E2E_PREFIX, adminState } from "./fixtures"

const ROOM = `${E2E_PREFIX}Timestamp Room`
const FIRST = "opening line of the first window"
const SAME_WINDOW = "five minutes later, same window"
const SECOND_WINDOW = "two hours later, a new window"
const FILLER = "filler line"
const VIEWPORT_W = 390

let groupId = ""
let adminId = ""
let memberId = ""

test.use({ storageState: adminState, viewport: { width: VIEWPORT_W, height: 844 }, isMobile: true, hasTouch: true })

test.beforeAll(async () => {
  const sb = sandbox()
  adminId = await sb.adminUserId()
  memberId = await sb.memberUserId()

  const g = await sb.createGroup({ name: ROOM, memberIds: [adminId, memberId] })
  groupId = g.id

  const minutesAgo = (m: number) => new Date(Date.now() - m * 60_000).toISOString()
  // Window 1: two messages five minutes apart. Window 2 opens 115 minutes later
  // and then fills with enough short lines to make the transcript scroll, so the
  // vertical-drag assertion has somewhere to go.
  await sb.insertMessage({ groupId, senderId: memberId, content: FIRST, createdAt: minutesAgo(180) })
  await sb.insertMessage({ groupId, senderId: adminId, content: SAME_WINDOW, createdAt: minutesAgo(175) })
  await sb.insertMessage({ groupId, senderId: memberId, content: SECOND_WINDOW, createdAt: minutesAgo(60) })
  for (let i = 0; i < 24; i++) {
    await sb.insertMessage({
      groupId,
      senderId: i % 2 === 0 ? adminId : memberId,
      content: `${FILLER} ${i + 1}`,
      createdAt: minutesAgo(59 - i),
    })
  }
})

test.afterAll(async () => {
  const sb = sandbox()
  if (groupId) await sb.client.from("groups").delete().eq("id", groupId)
})

const bubbleWith = (page: Page, text: string) =>
  page.locator("[data-message-bubble]").filter({ hasText: text }).first()
const timeLabels = (page: Page) => page.locator("[data-message-time]")
const separators = (page: Page) => page.locator("[data-time-separator]")
const menuActions = (page: Page) => page.locator('[data-msg-menu="actions"]')

async function openRoom(page: Page) {
  await page.goto(`/home?tab=chats&chat=${groupId}`)
  await expect(bubbleWith(page, `${FILLER} 24`)).toBeVisible({ timeout: 30_000 })
}

/** Every parked label's box, in viewport coords. */
async function labelBoxes(page: Page) {
  return page.evaluate(() =>
    Array.from(document.querySelectorAll<HTMLElement>("[data-message-time]")).map((el) => {
      const r = el.getBoundingClientRect()
      return { x: r.x, right: r.right, text: el.textContent ?? "" }
    }),
  )
}

/**
 * A REAL touch drag over CDP (Playwright's touchscreen only taps). Returns a
 * `release` so a test can inspect the screen MID-DRAG — the reveal only exists
 * while the finger is down.
 */
async function touchDrag(
  page: Page,
  el: Locator,
  { dx, dy = 0, steps = 8, stepMs = 16 }: { dx: number; dy?: number; steps?: number; stepMs?: number },
) {
  const box = await el.boundingBox()
  if (!box) throw new Error("element has no bounding box")
  const x0 = box.x + Math.min(40, box.width / 2)
  const y0 = box.y + box.height / 2
  const cdp = await page.context().newCDPSession(page)
  await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: x0, y: y0 }] })
  for (let i = 1; i <= steps; i++) {
    await cdp.send("Input.dispatchTouchEvent", {
      type: "touchMove",
      touchPoints: [{ x: x0 + (dx * i) / steps, y: y0 + (dy * i) / steps }],
    })
    await page.waitForTimeout(stepMs)
  }
  return {
    release: async () => {
      await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] })
      await cdp.detach()
      await page.waitForTimeout(400)   // let the snap-back settle
    },
  }
}

test.describe("smarter chat timestamps", () => {
  test("a centred stamp opens each conversation window, not each message", async ({ page }) => {
    await openRoom(page)
    // Two windows → two stamps, even though the thread holds 27 messages.
    await expect(separators(page)).toHaveCount(2)
    // Each stamp carries the clock time — that is what makes it a window opener
    // rather than the old day divider.
    const texts = await separators(page).allTextContents()
    for (const t of texts) expect(t).toMatch(/\d{1,2}:\d{2} (AM|PM)$/)
  })

  test("per-message times are parked off the right edge at rest", async ({ page }) => {
    await openRoom(page)
    const boxes = await labelBoxes(page)
    expect(boxes.length).toBeGreaterThan(20)
    for (const b of boxes) {
      expect(b.text).toMatch(/^\d{1,2}:\d{2} (AM|PM)$/)
      expect(b.x).toBeGreaterThanOrEqual(VIEWPORT_W)
    }
    // And the sender-name row (the `items-baseline` line above an incoming run)
    // no longer prints one beside the name. Scoped to that row on purpose: the
    // parked label is a sibling in the same column and is SUPPOSED to be in the
    // DOM — a screen reader still hears it.
    const nameRow = page.locator("[data-message-bubble]").filter({ hasText: SECOND_WINDOW }).first()
      .locator("xpath=ancestor::div[contains(@class,'flex-col')][1]").locator(".items-baseline").first()
    await expect(nameRow).toContainText("E2E Member")
    await expect(nameRow).not.toContainText(/\d{1,2}:\d{2} (AM|PM)/)
  })

  test("dragging the transcript LEFT slides the times in; releasing parks them again", async ({ page }) => {
    await openRoom(page)
    // SHOT_DIR: optional — a place OUTSIDE test-results (which Playwright wipes
    // per run) to keep the at-rest / mid-drag frames for a visual pass.
    const shots = process.env.SHOT_DIR
    if (shots) await page.screenshot({ path: `${shots}/timestamps-rest.png` })
    const drag = await touchDrag(page, bubbleWith(page, `${FILLER} 20`), { dx: -90 })
    // Mid-drag: labels are inside the viewport, right-aligned near the row's
    // trailing inset (the transcript's 16px padding).
    const mid = await labelBoxes(page)
    const inView = mid.filter((b) => b.right <= VIEWPORT_W && b.x >= 280)
    expect(inView.length).toBeGreaterThan(5)
    for (const b of inView) expect(b.right).toBeLessThanOrEqual(VIEWPORT_W - 12)
    if (shots) await page.screenshot({ path: `${shots}/timestamps-drag.png` })
    await drag.release()
    const after = await labelBoxes(page)
    for (const b of after) expect(b.x).toBeGreaterThanOrEqual(VIEWPORT_W)
  })

  test("a slow leftward drag on a bubble does not open the long-press menu", async ({ page }) => {
    await openRoom(page)
    // 12 × 60ms = 720ms of finger-down travel, well past the 400ms timer.
    const drag = await touchDrag(page, bubbleWith(page, `${FILLER} 22`), { dx: -80, steps: 12, stepMs: 60 })
    await expect(menuActions(page)).toHaveCount(0)
    await drag.release()
    await expect(menuActions(page)).toHaveCount(0)
  })

  test("a vertical drag still scrolls the transcript and never moves the column", async ({ page }) => {
    await openRoom(page)
    const scroller = page.locator("[data-bottom-anchored]")
    const before = await scroller.evaluate((el) => el.scrollTop)
    expect(before).toBeGreaterThan(0)
    const drag = await touchDrag(page, bubbleWith(page, `${FILLER} 18`), { dx: 0, dy: 220 })
    await drag.release()
    const after = await scroller.evaluate((el) => el.scrollTop)
    expect(after).toBeLessThan(before)
    const transform = await scroller.evaluate((el) => (el.firstElementChild as HTMLElement | null)?.style.transform ?? "")
    expect(transform).toBe("")
  })

  test("the long-press menu carries the full date and time (the tap-reachable path)", async ({ page }) => {
    await openRoom(page)
    // Same long-press the menu-bounds spec uses: the timer is driven by the
    // bubble's pointer handlers, so the press is dispatched as pointer events.
    const b = bubbleWith(page, `${FILLER} 23`)
    await b.dispatchEvent("pointerdown")
    await page.waitForTimeout(600)         // over the 400ms threshold
    await b.dispatchEvent("pointerup")
    await expect(menuActions(page)).toHaveCount(1)
    await expect(page.locator("[data-msg-menu-caption]")).toContainText(/\d{1,2}:\d{2} (AM|PM)$/)
  })
})
