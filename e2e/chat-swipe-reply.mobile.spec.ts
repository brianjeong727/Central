// Swipe-to-reply on a chat message bubble (components/central/use-swipe-to-reply.ts
// + the wiring in app/home/tabs/message-row.tsx).
//
// Drag any bubble RIGHT and release → that message loads into the composer's
// reply strip. Same direction for your own bubble and someone else's, matching
// iMessage / WhatsApp / Signal (ratified with Brian 2026-08-20 — the
// "mirrored for your own messages" intuition is not what any of them do).
//
// The gesture is an ACCELERATOR over long-press → Reply, so what's worth proving
// is not that it can fire but that it never fires when another gesture owns the
// touch: the transcript still scrolls vertically, back-swipe still owns the left
// edge (Convention #22), and a SLOW drag must not also trip the 400ms
// long-press timer the tap/context-menu pair shares (Convention #7).
import { test, expect, type Page, type Locator } from "@playwright/test"
import { sandbox, E2E_PREFIX, adminState } from "./fixtures"

const ROOM = `${E2E_PREFIX}Swipe Reply Room`
const THEIRS = "message from the other person"
const MINE = "message from me"

let groupId = ""
let adminId = ""
let memberId = ""
let memberName = ""
let adminName = ""

test.use({ storageState: adminState, viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true })

test.beforeAll(async () => {
  const sb = sandbox()
  adminId = await sb.adminUserId()
  memberId = await sb.memberUserId()

  const g = await sb.createGroup({ name: ROOM, memberIds: [adminId, memberId] })
  groupId = g.id

  // Order matters for the assertions below: the member's line is the INCOMING
  // bubble, the admin's is the OWN one, and the admin is who the spec is
  // signed in as.
  await sb.insertMessage({ groupId, senderId: memberId, content: THEIRS })
  await sb.insertMessage({ groupId, senderId: adminId, content: MINE })

  const { data: profs } = await sb.client.from("profiles").select("id, name").in("id", [memberId, adminId])
  const byId = new Map(((profs ?? []) as { id: string; name: string }[]).map(p => [p.id, p.name]))
  memberName = byId.get(memberId) ?? ""
  adminName = byId.get(adminId) ?? ""
})

test.afterAll(async () => {
  const sb = sandbox()
  if (groupId) await sb.client.from("groups").delete().eq("id", groupId)
})

/**
 * Drag an element with REAL touch events. Playwright's touchscreen only taps, so
 * the drag goes through CDP — the same approach chat-swipe-actions.mobile.spec.ts
 * uses for the list-row gesture.
 *
 * `startAtLeftEdge` deliberately begins the touch inside the 24px zone the
 * gesture cedes to edge-swipe-back, which is the only way to test that cession.
 * `steps`/`stepMs` shape the drag's DURATION — a slow drag is how the
 * long-press interaction gets exercised.
 */
async function drag(
  page: Page,
  el: Locator,
  { dx, dy = 0, steps = 8, stepMs = 16, startAtLeftEdge = false }:
    { dx: number; dy?: number; steps?: number; stepMs?: number; startAtLeftEdge?: boolean },
) {
  const box = await el.boundingBox()
  if (!box) throw new Error("element has no bounding box")
  const y = box.y + box.height / 2
  const x0 = startAtLeftEdge ? 8 : box.x + Math.min(24, box.width / 2)
  const cdp = await page.context().newCDPSession(page)
  await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: x0, y }] })
  for (let i = 1; i <= steps; i++) {
    await cdp.send("Input.dispatchTouchEvent", {
      type: "touchMove",
      touchPoints: [{ x: x0 + (dx * i) / steps, y: y + (dy * i) / steps }],
    })
    await page.waitForTimeout(stepMs)
  }
  await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] })
  await cdp.detach()
  await page.waitForTimeout(400)   // let the snap-back settle
}

const bubbleWith = (page: Page, text: string) =>
  page.locator("[data-message-bubble]").filter({ hasText: text }).first()

const replyStrip = (page: Page) => page.locator("[data-reply-preview]")

async function openRoom(page: Page) {
  await page.goto(`/home?tab=chats&chat=${groupId}`)
  await expect(bubbleWith(page, THEIRS)).toBeVisible({ timeout: 30_000 })
}

async function clearReply(page: Page) {
  if (await replyStrip(page).count()) {
    await replyStrip(page).getByRole("button").click()
    await expect(replyStrip(page)).toHaveCount(0)
  }
}

test.describe("swipe-to-reply on a message bubble", () => {
  test("right-swipe stages a reply on an INCOMING bubble", async ({ page }) => {
    await openRoom(page)
    await drag(page, bubbleWith(page, THEIRS), { dx: 80 })
    await expect(replyStrip(page)).toHaveAttribute("data-reply-preview", memberName)
  })

  test("right-swipe stages a reply on your OWN bubble, same direction", async ({ page }) => {
    // The whole point of the direction ruling: an own bubble is right-aligned
    // and flush to the trailing inset, and still answers a RIGHTWARD swipe. If
    // this ever needs a leftward drag to pass, the gesture was mirrored and the
    // ruling was broken.
    await openRoom(page)
    await drag(page, bubbleWith(page, MINE), { dx: 80 })
    // Named, not just counted: a strip that appeared because the drag landed on
    // the neighbouring incoming bubble would satisfy a bare count.
    await expect(replyStrip(page)).toHaveAttribute("data-reply-preview", adminName)
  })

  test("a LEFT-swipe on your own bubble does nothing", async ({ page }) => {
    await openRoom(page)
    await drag(page, bubbleWith(page, MINE), { dx: -80 })
    await expect(replyStrip(page)).toHaveCount(0)
  })

  test("a short drag under the trigger does not stage a reply", async ({ page }) => {
    await openRoom(page)
    await drag(page, bubbleWith(page, THEIRS), { dx: 20 })
    await expect(replyStrip(page)).toHaveCount(0)
  })

  test("a vertical drag scrolls instead of replying", async ({ page }) => {
    await openRoom(page)
    await drag(page, bubbleWith(page, THEIRS), { dx: 4, dy: -120 })
    await expect(replyStrip(page)).toHaveCount(0)
  })

  test("a drag starting in the left edge zone is left to back-swipe", async ({ page }) => {
    // Convention #22: the first 24px belong to edge-swipe-back, which ChatScreen
    // wires to onClose. The reply gesture must decline that touch outright.
    await openRoom(page)
    await drag(page, bubbleWith(page, THEIRS), { dx: 80, startAtLeftEdge: true })
    await expect(replyStrip(page)).toHaveCount(0)
  })

  test("a SLOW swipe replies without also opening the long-press menu", async ({ page }) => {
    // ~640ms of drag — well past the 400ms long-press threshold (Convention #7).
    // Without the onLock cancel in the hook, the context menu opens mid-drag.
    await openRoom(page)
    await clearReply(page)
    await drag(page, bubbleWith(page, THEIRS), { dx: 80, steps: 16, stepMs: 40 })
    await expect(replyStrip(page)).toHaveCount(1)
    await expect(page.getByRole("button", { name: "Reply", exact: true })).toHaveCount(0)
  })
})
