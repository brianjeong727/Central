// Proves the two mobile-shell touch gestures that now share the same tree
// actually coexist: chat-row swipe (components/central/swipe-actions.tsx) and
// shell pull-to-refresh (components/central/use-pull-to-refresh.ts).
//
// `usePullToRefresh`'s ref is `.shell-scroll` — the ANCESTOR of every chat row —
// and `SwipeActionRow` listens on the row's own foreground div, a DESCENDANT.
// Pull-to-refresh merged into main after the swipe row shipped, so until this
// spec the two gesture handlers had never actually been driven on the same
// touch sequence, only reasoned about independently. Both rely on the same
// direction-lock discipline (a vertical-dominant drag releases the swipe row;
// a horizontal-dominant drag makes pull-to-refresh bail without
// preventDefault), so this is the one place that composition is actually
// exercised rather than assumed.
import { test, expect, type Page, type Locator } from "@playwright/test"
import { sandbox, E2E_PREFIX } from "./fixtures"

const NAME = `${E2E_PREFIX}Swipe+Pull`
let groupId = ""

test.beforeAll(async () => {
  const sb = sandbox()
  const adminId = await sb.adminUserId()
  const group = await sb.createGroup({ name: NAME, memberIds: [adminId] })
  groupId = group.id
})

test.afterAll(async () => {
  const sb = sandbox()
  if (groupId) await sb.client.from("groups").delete().eq("id", groupId)
})

const INDICATOR = "[data-pull-refresh]"
const SCROLLER = ".shell-scroll"

interface Frame {
  gapHeight: number
  contentShift: number
}

async function readFrame(page: Page): Promise<Frame> {
  return page.evaluate(
    ([indSel, scrSel]) => {
      const ind = document.querySelector(indSel) as HTMLElement | null
      const scr = document.querySelector(scrSel) as HTMLElement | null
      const t = scr ? getComputedStyle(scr).transform : "none"
      const ty = t && t !== "none" ? parseFloat(t.slice(t.indexOf("(") + 1).split(",")[5] ?? "0") : 0
      return {
        gapHeight: ind ? ind.getBoundingClientRect().height : -1,
        contentShift: Math.round(ty),
      }
    },
    [INDICATOR, SCROLLER] as const,
  )
}

const rowFor = (page: Page, name: string) => page.locator(`[data-pocket-row="${name}"]`)
// The row's ONE room-action tile. Which action it is depends on the room — Leave
// where you can leave (this spec runs the "my" scope), Mute where you cannot — so
// match either rather than naming one. A hidden-assertion needs a selector that
// WOULD match if the panel had opened, or it passes for the wrong reason.
const rowActionButton = (page: Page) => page.getByRole("button", { name: /^(Leave|Mute)$/ })

async function openChats(page: Page) {
  await page.goto(`/home?tab=chats&chats=my`)
  await page.waitForLoadState("networkidle")
  // Preconditions both gestures below depend on: pull-to-refresh only arms at
  // the very top, and a swipe row must actually be on screen.
  expect(await page.evaluate(() => window.scrollY)).toBe(0)
}

/** Real touch drag via CDP (Playwright's touchscreen only taps). Samples one
 *  frame mid-drag — finger still down — before releasing, since the pull gap
 *  and the swipe panel each settle/close on touchend. */
async function drag(
  page: Page,
  x0: number,
  y0: number,
  dx: number,
  dy: number,
): Promise<Frame> {
  const cdp = await page.context().newCDPSession(page)
  await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: x0, y: y0 }] })
  for (let i = 1; i <= 8; i++) {
    await cdp.send("Input.dispatchTouchEvent", {
      type: "touchMove",
      touchPoints: [{ x: x0 + (dx * i) / 8, y: y0 + (dy * i) / 8 }],
    })
    await page.waitForTimeout(16)
  }
  const frame = await readFrame(page)
  await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] })
  await cdp.detach()
  await page.waitForTimeout(400) // let both gestures' settle animations finish
  return frame
}

test.describe("chat-row swipe vs. shell pull-to-refresh", () => {
  test("a vertical drag on a row arms pull-to-refresh, never the swipe panel", async ({ page }) => {
    await openChats(page)
    const row = rowFor(page, NAME)
    await expect(row).toBeVisible({ timeout: 15000 })
    const box = await row.boundingBox()
    if (!box) throw new Error("row has no bounding box")

    const x0 = box.x + box.width / 2 // clear of the 24px left-edge zone
    const y0 = box.y + box.height / 2
    const frame = await drag(page, x0, y0, 0, 220)

    expect(frame.gapHeight, "pull-to-refresh gap must open on a pure vertical drag").toBeGreaterThan(20)
    expect(frame.contentShift, "content must follow the finger down").toBeGreaterThan(20)
    await expect(rowActionButton(page), "the swipe panel must never open on a vertical drag").toBeHidden()
  })

  test("a horizontal drag on a row opens the swipe panel, never pull-to-refresh", async ({ page }) => {
    await openChats(page)
    const row = rowFor(page, NAME)
    await expect(row).toBeVisible({ timeout: 15000 })
    const box = await row.boundingBox()
    if (!box) throw new Error("row has no bounding box")

    const x0 = box.x + box.width - 24 // trailing-panel start, matches chat-swipe-actions.mobile.spec.ts
    const y0 = box.y + box.height / 2
    const frame = await drag(page, x0, y0, -150, 0)

    expect(frame.gapHeight, "pull-to-refresh must never arm on a horizontal drag").toBe(0)
    expect(frame.contentShift, "the shell scroller must not translate on a horizontal drag").toBe(0)
    await expect(rowActionButton(page), "the swipe panel must open on a horizontal drag").toBeVisible()
  })

  test("a drag starting within the left-edge zone opens no swipe panel", async ({ page }) => {
    await openChats(page)
    const row = rowFor(page, NAME)
    await expect(row).toBeVisible({ timeout: 15000 })

    // `row` resolves to the PocketRow <button>, which sits INSIDE
    // SwipeActionRow's foreground div — the actual touch-listening surface —
    // offset by that div's own `bleed` padding (POCKET_CARD_PAD_X = 18px). The
    // foreground div itself starts flush with the card, at the screen's 20px
    // gutter (Convention #26), so THAT edge — not the button's — is what
    // EDGE_PX (24) is measured against. Climb one level to get it.
    const fg = await row.evaluate((el) => {
      const r = (el.parentElement as HTMLElement).getBoundingClientRect()
      return { x: r.x, y: r.y, width: r.width, height: r.height }
    })
    expect(fg.x, "sanity: the foreground surface sits at the mobile gutter").toBeLessThan(24)

    // Within SwipeActionRow's EDGE_PX (24) — that zone belongs to back-swipe
    // (Convention #22), so the row gesture must refuse to arm from here even
    // though the drag itself is horizontal.
    const x0 = fg.x + 2
    const y0 = fg.y + fg.height / 2
    await drag(page, x0, y0, -150, 0)

    await expect(rowActionButton(page), "a touch starting in the edge zone must not open the swipe panel").toBeHidden()
  })
})
