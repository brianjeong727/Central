// Mobile edge-swipe-to-go-back (mobile_design_system §0.3). Verifies the gesture
// on both integration seams: the ChatScreen overlay (hook applied directly) and a
// SubpageShell surface (MemberSheet — the shared seam that also covers announcement
// detail, chat settings, meeting notes, receipts/finance detail, plan drills).
//
// Drives REAL touch events via CDP (Playwright's touchscreen only taps), starting
// inside the left edge zone and dragging right past the completion threshold.
import { test, expect, type Page } from "@playwright/test"
import { sandbox, E2E_PREFIX } from "./fixtures"

const SHOT_DIR = process.env.SWIPE_SHOT_DIR

// Left-edge → right drag past threshold. Optionally screenshots mid-drag (finger
// still down) so the live translateX follow is visible.
async function edgeSwipeBack(page: Page, midName?: string) {
  const cdp = await page.context().newCDPSession(page)
  const y = 430
  await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: 6, y, id: 0 }] })
  for (const x of [40, 90, 150, 220, 290, 340]) {
    await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x, y, id: 0 }] })
    await page.waitForTimeout(16)
  }
  if (midName && SHOT_DIR) await page.screenshot({ path: `${SHOT_DIR}/${midName}.png` })
  await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] })
  await cdp.detach()
}

test.describe("mobile edge-swipe-back", () => {
  const MYCHAT = `${E2E_PREFIX}Swipe Chat`
  const OPENER = "Swipe right from the edge to close me."
  let chatId = ""
  let memberId = ""

  test.beforeAll(async () => {
    const sb = sandbox()
    const adminId = await sb.adminUserId()
    memberId = await sb.memberUserId()
    const my = await sb.createGroup({ name: MYCHAT, memberIds: [adminId, memberId] })
    chatId = my.id
    await sb.insertMessage({ groupId: chatId, senderId: memberId, content: OPENER })
    await sb.insertMessage({ groupId: chatId, senderId: adminId, content: "On it." })
  })

  test.afterAll(async () => {
    await sandbox().deleteGroupsByPrefix()
  })

  test("edge-swipe closes the ChatScreen overlay", async ({ page }) => {
    await page.goto(`/home?tab=chats&chat=${chatId}`)
    await expect(page.getByText(OPENER, { exact: false }).first()).toBeVisible({ timeout: 15000 })
    if (SHOT_DIR) await page.screenshot({ path: `${SHOT_DIR}/chat-open.png` })

    await edgeSwipeBack(page, "chat-midswipe")

    // Overlay dismissed → the message is gone and the chat list is back.
    await expect(page.getByText(OPENER, { exact: false })).toHaveCount(0, { timeout: 8000 })
    if (SHOT_DIR) await page.screenshot({ path: `${SHOT_DIR}/chat-closed.png` })
  })

  test("edge-swipe closes a SubpageShell member sheet", async ({ page }) => {
    await page.goto(`/home?tab=directory&member=${memberId}`)
    await expect(page.getByText("Send Message", { exact: false }).first()).toBeVisible({ timeout: 15000 })
    if (SHOT_DIR) await page.screenshot({ path: `${SHOT_DIR}/member-open.png` })

    await edgeSwipeBack(page, "member-midswipe")

    // Sheet dismissed → back to the directory list (no member-sheet action).
    await expect(page.getByText("Send Message", { exact: false })).toHaveCount(0, { timeout: 8000 })
    if (SHOT_DIR) await page.screenshot({ path: `${SHOT_DIR}/member-closed.png` })
  })
})
