// Regression + click-through coverage for reaction details (commit 3706108,
// feat/reaction-details-preview-push), the mobile (390px) half:
//   (A) reaction-pill TOUCH tap-vs-long-press split, the reactor "who reacted"
//       PocketSheet, and the CRITICAL guarantee that a pill press never leaks
//       to the bubble's own long-press (Convention #7 stays exactly as-is on
//       the bubble).
//   The desktop-only hover/focus tooltip must NEVER fire on this surface.
//   (9) the Notifications "Reactions" toggle persists across a reload.
//
// Desktop (1440) grammar/sort/parity/live-update/tooltip coverage lives in the
// sibling e2e/chat-reaction-preview.spec.ts.
//
// Touch simulation note: Playwright's `page.mouse.*` always dispatches with
// `pointerType: "mouse"`, and the pill's long-press timer now explicitly
// rejects mouse (`handleRxPointerDown`, message-row.tsx — a mouse reaches the
// reactors via hover instead). A real touch long-press is simulated by
// dispatching PointerEvents with an EXPLICIT `pointerType: "touch"` — React
// attaches native listeners for pointerdown/up/cancel, so a script-dispatched
// native PointerEvent of the right type/pointerType reaches the same handler
// a real touchscreen would. Verified directly against this build before
// committing to this pattern (see test-report.md "Second pass").
import { test, expect, type Page, type Locator } from "@playwright/test"
import { sandbox, E2E_PREFIX, adminState } from "./fixtures"

test.use({ storageState: adminState })

const PREFIX = `${E2E_PREFIX}rxdetail `
const TOGGLE_ROOM = `${PREFIX}toggle`
const SHEET_ROOM = `${PREFIX}sheet`
const TOGGLE_MSG = "toggle test message"
const SHEET_MSG = "sheet test message"

let adminId = ""
let memberId = ""
let ghost1Id = "" // "Grace Lee"
let ghost2Id = "" // "Sarah Kim"
let toggleGroupId = ""
let sheetGroupId = ""

async function centerOf(target: Locator): Promise<{ x: number; y: number }> {
  const box = await target.boundingBox()
  if (!box) throw new Error("target has no bounding box")
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 }
}

// A genuine TOUCH long-press: pointerdown(touch) held `ms`, then pointerup +
// a trailing click (a real touchscreen always emits click after touchend).
async function touchLongPress(page: Page, target: Locator, ms: number) {
  const { x, y } = await centerOf(target)
  const init = { pointerType: "touch", pointerId: 7, isPrimary: true, clientX: x, clientY: y, bubbles: true, cancelable: true }
  await target.dispatchEvent("pointerdown", init as never)
  await page.waitForTimeout(ms)
  await target.dispatchEvent("pointerup", init as never)
  await target.dispatchEvent("click", { bubbles: true, cancelable: true, clientX: x, clientY: y } as never)
}

// A genuine TOUCH quick tap: pointerdown/up inside 400ms, plus the click a
// real touchscreen emits after touchend.
async function touchTap(page: Page, target: Locator) {
  const { x, y } = await centerOf(target)
  const init = { pointerType: "touch", pointerId: 7, isPrimary: true, clientX: x, clientY: y, bubbles: true, cancelable: true }
  await target.dispatchEvent("pointerdown", init as never)
  await target.dispatchEvent("pointerup", init as never)
  await target.dispatchEvent("click", { bubbles: true, cancelable: true, clientX: x, clientY: y } as never)
}

// Scoped to the transcript container (`data-bottom-anchored`) — the mobile
// chat-list row behind the open ChatScreen overlay stays mounted and its
// preview text can echo the same emoji+count, so an unscoped locator can
// double-match (see e2e/chat-thread-cache.mobile.spec.ts's note on this).
const pillLocator = (page: Page, emoji: string) =>
  page.locator("[data-bottom-anchored] button").filter({ hasText: emoji }).filter({ hasText: /\d/ })

test.describe("reaction details — mobile (390) pill interaction + sheet", () => {
  test.describe.configure({ timeout: 90000 })
  test.use({ viewport: { width: 390, height: 844 } })

  test.beforeAll(async () => {
    const sb = sandbox()
    adminId = await sb.adminUserId()
    memberId = await sb.memberUserId()
    const { data: ghosts } = await sb.client
      .from("profiles")
      .select("id, name")
      .eq("ministry_id", sb.ministryId)
      .in("name", ["Grace Lee", "Sarah Kim"])
    const byName = new Map((ghosts ?? []).map((g) => [g.name as string, g.id as string]))
    ghost1Id = byName.get("Grace Lee") ?? ""
    ghost2Id = byName.get("Sarah Kim") ?? ""
    if (!ghost1Id || !ghost2Id) throw new Error("expected sandbox.test ghost profiles Grace Lee + Sarah Kim not found")

    await sb.deleteGroupsByPrefix(PREFIX)

    const toggleGroup = await sb.createGroup({ name: TOGGLE_ROOM, memberIds: [adminId, memberId] })
    toggleGroupId = toggleGroup.id
    const toggleMsg = await sb.insertMessage({ groupId: toggleGroupId, senderId: memberId, content: TOGGLE_MSG })
    // Seed the pill up front (touch quick-tap toggles the VIEWER's own reaction
    // off/on — the pill must already exist for a tap to have something to hit).
    await sb.client.from("message_reactions").insert({ message_id: toggleMsg.id, user_id: adminId, emoji: "👍", group_id: toggleGroupId })

    const sheetGroup = await sb.createGroup({ name: SHEET_ROOM, memberIds: [adminId, memberId, ghost1Id, ghost2Id] })
    sheetGroupId = sheetGroup.id
    const seedMsg = await sb.insertMessage({ groupId: sheetGroupId, senderId: memberId, content: SHEET_MSG })
    const { error: rxErr } = await sb.client.from("message_reactions").insert([
      { message_id: seedMsg.id, user_id: adminId, emoji: "👍", group_id: sheetGroupId },
      { message_id: seedMsg.id, user_id: ghost1Id, emoji: "👍", group_id: sheetGroupId },
      { message_id: seedMsg.id, user_id: ghost2Id, emoji: "❤️", group_id: sheetGroupId },
    ])
    if (rxErr) throw rxErr
  })

  test.afterAll(async () => {
    await sandbox().deleteGroupsByPrefix(PREFIX)
  })

  test("a genuine touch tap toggles the viewer's own reaction, optimistically, with no sheet and no tooltip", async ({ page }) => {
    await page.goto(`/home?tab=chats&chat=${toggleGroupId}`)
    const pill = pillLocator(page, "👍")
    await expect(pill).toBeVisible({ timeout: 20000 })
    await expect(pill).toContainText("1")

    // A touch tap on the pill toggles it off — no sheet, no tooltip (tooltip
    // is hover/focus-only and gated off touch entirely; see the dedicated test).
    await touchTap(page, pill)
    await expect(pill).toBeHidden({ timeout: 5000 })
    await expect(page.getByRole("dialog")).toHaveCount(0)
    await expect(page.getByRole("tooltip")).toHaveCount(0)

    // Round-trips: react again via the quick-react bar, tap the pill again.
    const bubble = page.locator('div[data-message-bubble]').filter({ hasText: TOGGLE_MSG })
    await bubble.click()
    const thumbsUp = page.getByRole("button", { name: "👍", exact: true })
    await expect(thumbsUp).toBeVisible({ timeout: 2000 })
    await thumbsUp.click()
    await expect(pill).toBeVisible({ timeout: 5000 })
    await touchTap(page, pill)
    await expect(pill).toBeHidden({ timeout: 5000 })
  })

  test("long-press (>=400ms touch) opens the reactor sheet, grouped by emoji with the pressed emoji first, names resolved and 'You' for the viewer — and does not toggle the reaction or leak to the bubble's own menu", async ({ page }) => {
    await page.goto(`/home?tab=chats&chat=${sheetGroupId}`)
    const bubble = page.locator('div[data-message-bubble]').filter({ hasText: SHEET_MSG })
    await expect(bubble).toBeVisible({ timeout: 20000 })

    const heartPill = pillLocator(page, "❤️")
    const thumbPill = pillLocator(page, "👍")
    await expect(thumbPill).toContainText("2") // admin + Grace Lee
    await expect(heartPill).toContainText("1") // Sarah Kim

    // Long-press the ❤️ pill — the sheet opens, and it must NOT also open the
    // bubble's own reply/emoji-bar menu (Convention #7 leak check), and must
    // not be the desktop tooltip (touch never reaches that path at all).
    await touchLongPress(page, heartPill, 500)
    const sheet = page.getByRole("dialog")
    await expect(sheet).toBeVisible({ timeout: 3000 })
    await expect(page.getByRole("tooltip")).toHaveCount(0)
    await expect(sheet.getByText("Reactions", { exact: true })).toBeVisible()
    await expect(page.getByRole("button", { name: "Reply", exact: true })).toHaveCount(0)
    await expect(page.getByRole("button", { name: "👍", exact: true })).toHaveCount(0) // quick-react bar

    // Grouped by emoji, PRESSED emoji (❤️) first, then 👍. Names resolved, not
    // uuids; the sandbox ghost reactors show their real names. Mobile scale:
    // name 15/600, 40px MonogramChip (mobile_design_system.md §2/§4).
    const sheetText = await sheet.innerText()
    const heartIdx = sheetText.indexOf("❤️")
    const thumbIdx = sheetText.indexOf("👍")
    expect(heartIdx).toBeGreaterThan(-1)
    expect(thumbIdx).toBeGreaterThan(-1)
    expect(heartIdx).toBeLessThan(thumbIdx)
    const sarahRow = sheet.getByText("Sarah Kim", { exact: true })
    await expect(sarahRow).toBeVisible()
    await expect(sarahRow).toHaveCSS("font-weight", "600")
    const monogram = sheet.locator("[data-monogram]").first()
    const monoBox = await monogram.boundingBox()
    expect(monoBox?.width).toBeCloseTo(40, 0)
    await expect(sheet.getByText("Grace Lee", { exact: true })).toBeVisible()
    // Viewer (admin) reacted 👍, so they read as "You", never their own name.
    await expect(sheet.getByText("You", { exact: true })).toBeVisible()
    await expect(sheet.getByText(/^admin$/i)).toHaveCount(0)

    // Close the sheet, then confirm the trailing click after the long-press did
    // NOT also toggle admin's own reaction — count is unchanged at 2.
    await page.getByRole("button", { name: "Close" }).click()
    await expect(sheet).toBeHidden()
    await expect(thumbPill).toContainText("2")
    await expect(heartPill).toContainText("1")

    // The BUBBLE's own long-press (Convention #7) is untouched by this diff and
    // is not pointerType-gated — a plain mouse-simulated hold still works, and
    // >=400ms still opens the reply menu.
    const replyBtn = page.getByRole("button", { name: "Reply", exact: true })
    const bBox = await bubble.boundingBox()
    await page.mouse.move(bBox!.x + bBox!.width / 2, bBox!.y + bBox!.height / 2)
    await page.mouse.down()
    await page.waitForTimeout(500)
    await page.mouse.up()
    await expect(replyBtn).toBeVisible({ timeout: 2000 })
    await page.mouse.click(10, 10) // app's own full-viewport dismiss overlay
    await expect(replyBtn).toBeHidden()
  })

  test("the desktop hover/focus tooltip can NEVER appear on this touch surface", async ({ page }) => {
    await page.goto(`/home?tab=chats&chat=${sheetGroupId}`)
    const pill = pillLocator(page, "👍")
    await expect(pill).toBeVisible({ timeout: 20000 })

    // The app's own gate: `(hover: hover) and (pointer: fine)` must read false
    // on this device profile (Pixel 5 / touch), which is what makes the gate
    // effective regardless of how a test tries to synthesize a hover.
    const canHover = await page.evaluate(() => window.matchMedia("(hover: hover) and (pointer: fine)").matches)
    expect(canHover).toBe(false)

    await pill.hover()
    await page.waitForTimeout(400)
    await expect(page.getByRole("tooltip")).toHaveCount(0)

    // Programmatic focus (the keyboard route on desktop) is untested here on
    // purpose — a real touch device has no keyboard-tab concept on this
    // control, and the tooltip code path for FOCUS is not pointer-gated (by
    // design, per the coordinator's note: any keyboard user on any device
    // gets it). That is desktop-shaped coverage and lives in the sibling spec.
  })

  test("Notifications settings: the Reactions toggle renders, toggles, and persists across a reload", async ({ page }) => {
    const sb = sandbox()
    await sb.resetNotificationSettings(adminId)

    await page.goto("/home?tab=profile&pset=notifications")
    const toggle = page.getByRole("switch", { name: "Reactions", exact: true })
    await expect(toggle).toBeVisible({ timeout: 10000 })

    // Default-on: the switch is currently ON. Toggle it off and save.
    await expect(toggle).toHaveAttribute("aria-checked", "true")
    await toggle.click()
    await expect(toggle).toHaveAttribute("aria-checked", "false")
    await expect(page.getByRole("button", { name: "Save changes", exact: true })).toBeVisible()
    await page.getByRole("button", { name: "Save changes", exact: true }).click()
    await expect(page.getByRole("button", { name: "Save changes", exact: true })).toHaveCount(0, { timeout: 5000 })

    // Persists across a reload.
    await page.reload()
    await page.waitForLoadState("networkidle")
    await expect(page.getByRole("switch", { name: "Reactions", exact: true })).toHaveAttribute("aria-checked", "false", { timeout: 20000 })
    const { data } = await sb.client.from("profiles").select("notification_settings").eq("id", adminId).single()
    expect((data as { notification_settings: { reactions?: boolean } }).notification_settings.reactions).toBe(false)

    await sb.resetNotificationSettings(adminId)
  })
})
