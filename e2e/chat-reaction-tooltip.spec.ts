// Desktop (1440) pill-interaction coverage for the SECOND pass of reaction
// details (commit 3706108, feat/reaction-details-preview-push): the
// press-and-hold -> CentralModal path was deleted and replaced with a
// portaled hover/focus tooltip. Click keeps its single, pre-existing meaning
// (toggle) — this file exists specifically to guard the regression that made
// the change necessary (B1 in enforcer-review.md): a slow desktop click must
// never silently lose its toggle again.
//
// Mobile (390) touch coverage — long-press -> PocketSheet, and the guarantee
// that this tooltip can never appear on touch — lives in the sibling
// e2e/chat-reaction-details.mobile.spec.ts. Chat-list PREVIEW grammar/sort/
// parity lives in e2e/chat-reaction-preview.spec.ts.
import { test, expect, type Page, type Locator } from "@playwright/test"
import { sandbox, E2E_PREFIX, adminState } from "./fixtures"

test.use({ storageState: adminState, viewport: { width: 1440, height: 900 } })

const PREFIX = `${E2E_PREFIX}rxtip `

const pillLocator = (page: Page, emoji: string) =>
  page.locator("[data-bottom-anchored] button").filter({ hasText: emoji }).filter({ hasText: /\d/ })

async function slowClick(page: Page, target: Locator, holdMs: number) {
  const box = await target.boundingBox()
  if (!box) throw new Error("slowClick: target has no bounding box")
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
  await page.mouse.down()
  await page.waitForTimeout(holdMs)
  await page.mouse.up()
}

test.describe("reaction pill — desktop (1440) hover tooltip + click-toggle regression", () => {
  test.describe.configure({ timeout: 120000 })

  let adminId = ""
  let memberId = ""
  let ghost1Id = "" // Grace Lee
  let ghost2Id = "" // Sarah Kim
  let basicGroupId = ""
  let multiGroupId = ""
  let scrollGroupId = ""
  let tabGroupId = ""
  let firstMsgId = ""

  test.beforeAll(async () => {
    const sb = sandbox()
    adminId = await sb.adminUserId()
    memberId = await sb.memberUserId()
    const { data: ghosts } = await sb.client.from("profiles").select("id, name").eq("ministry_id", sb.ministryId).in("name", ["Grace Lee", "Sarah Kim"])
    const byName = new Map((ghosts ?? []).map((g) => [g.name as string, g.id as string]))
    ghost1Id = byName.get("Grace Lee") ?? ""
    ghost2Id = byName.get("Sarah Kim") ?? ""
    if (!ghost1Id || !ghost2Id) throw new Error("expected sandbox.test ghost profiles Grace Lee + Sarah Kim not found")

    await sb.deleteGroupsByPrefix(PREFIX)

    // Basic group: TWO reactors on the viewer's pill, so a slow-click toggle
    // (admin's own reaction going away) doesn't remove the pill entirely.
    const basic = await sb.createGroup({ name: `${PREFIX}basic`, memberIds: [adminId, memberId] })
    basicGroupId = basic.id
    const basicMsg = await sb.insertMessage({ groupId: basicGroupId, senderId: memberId, content: "slow click test message" })
    await sb.client.from("message_reactions").insert([
      { message_id: basicMsg.id, user_id: adminId, emoji: "👍", group_id: basicGroupId },
      { message_id: basicMsg.id, user_id: memberId, emoji: "👍", group_id: basicGroupId },
    ])

    // Multi-reactor group: three names, so the tooltip sentence is exercised
    // with listSentence's "A, B and C" grammar and "You" for the viewer.
    const multi = await sb.createGroup({ name: `${PREFIX}multi`, memberIds: [adminId, memberId, ghost1Id, ghost2Id] })
    multiGroupId = multi.id
    const multiMsg = await sb.insertMessage({ groupId: multiGroupId, senderId: memberId, content: "tooltip content test message" })
    await sb.client.from("message_reactions").insert([
      { message_id: multiMsg.id, user_id: adminId, emoji: "👍", group_id: multiGroupId },
      { message_id: multiMsg.id, user_id: ghost1Id, emoji: "👍", group_id: multiGroupId },
      { message_id: multiMsg.id, user_id: ghost2Id, emoji: "👍", group_id: multiGroupId },
    ])

    // Tab group: its OWN fixture, independent of basicGroupId — a shared group
    // across two tests raced (test 1's final optimistic toggle-back and test 4's
    // fresh navigation could observe the write before it settled). A dedicated
    // group removes the cross-test dependency instead of papering over it with
    // a timing guess.
    const tab = await sb.createGroup({ name: `${PREFIX}tab`, memberIds: [adminId, memberId] })
    tabGroupId = tab.id
    const tabMsg = await sb.insertMessage({ groupId: tabGroupId, senderId: memberId, content: "tab focus test message" })
    await sb.client.from("message_reactions").insert([
      { message_id: tabMsg.id, user_id: adminId, emoji: "👍", group_id: tabGroupId },
      { message_id: tabMsg.id, user_id: memberId, emoji: "👍", group_id: tabGroupId },
    ])

    // Scroll group: enough messages to make the transcript scrollable, with a
    // reaction on the FIRST message (top, requires scrolling up) and one on
    // the LAST (bottom, already in view) — the two edges the tooltip's
    // measured-placement flip logic exists for.
    const scroll = await sb.createGroup({ name: `${PREFIX}scroll`, memberIds: [adminId, memberId] })
    scrollGroupId = scroll.id
    const rows = Array.from({ length: 40 }, (_, i) => ({
      group_id: scrollGroupId, sender_id: memberId,
      content: i === 0 ? "TOP message" : i === 39 ? "BOTTOM message" : `filler ${i}`,
      message_type: "text",
      created_at: new Date(Date.now() - (40 - i) * 30000).toISOString(),
    }))
    const { data: inserted, error } = await sb.client.from("messages").insert(rows).select("id, content")
    if (error) throw error
    const msgs = inserted as { id: string; content: string }[]
    firstMsgId = msgs.find((m) => m.content === "TOP message")!.id
    const lastMsgId = msgs.find((m) => m.content === "BOTTOM message")!.id
    await sb.client.from("message_reactions").insert([
      { message_id: firstMsgId, user_id: adminId, emoji: "🔥", group_id: scrollGroupId },
      { message_id: lastMsgId, user_id: adminId, emoji: "🔥", group_id: scrollGroupId },
    ])
  })

  test.afterAll(async () => {
    await sandbox().deleteGroupsByPrefix(PREFIX)
  })

  test("REGRESSION: a slow (>=500ms) desktop click on a pill still TOGGLES — no modal, no stuck state", async ({ page }) => {
    await page.goto(`/home?tab=chats&chat=${basicGroupId}`)
    const pill = pillLocator(page, "👍")
    await expect(pill).toBeVisible({ timeout: 20000 })
    await expect(pill).toContainText("2")

    await slowClick(page, pill, 600)

    // Toggled off — count drops to 1, pill still shows (Grace... no, member's
    // own reaction remains).
    await expect(pill).toContainText("1", { timeout: 5000 })
    // No sheet, no leftover CentralModal, no stuck tooltip.
    await expect(page.getByRole("dialog")).toHaveCount(0)

    // Toggle back on with a second slow click, to prove the round-trip.
    await slowClick(page, pill, 600)
    await expect(pill).toContainText("2", { timeout: 5000 })
  })

  test("hover reveals a tooltip listing every reactor's name for that emoji", async ({ page }) => {
    await page.goto(`/home?tab=chats&chat=${multiGroupId}`)
    const pill = pillLocator(page, "👍")
    await expect(pill).toBeVisible({ timeout: 20000 })
    await expect(pill).toContainText("3")
    // Give the roster SWR a moment to resolve — resolveReactorName returns
    // null (showing nothing) until it has, by design (see the "W2" fix).
    await page.waitForTimeout(1500)

    const canHover = await page.evaluate(() => window.matchMedia("(hover: hover) and (pointer: fine)").matches)
    expect(canHover).toBe(true)

    await pill.hover()
    const tooltip = page.getByRole("tooltip")
    await expect(tooltip).toBeVisible({ timeout: 3000 })
    const text = await tooltip.innerText()
    // listSentence grammar: "You, Grace Lee and Sarah Kim reacted with 👍" (order
    // follows the thread's reaction rows — admin/You first here, seeded first).
    expect(text).toContain("You")
    expect(text).toContain("Grace Lee")
    expect(text).toContain("Sarah Kim")
    expect(text).toContain("reacted with 👍")
    // A plain click still toggles — the tooltip is descriptive, not an action target.
    await pill.click()
    await expect(pill).toContainText("2", { timeout: 5000 })
    await pill.click()
    await expect(pill).toContainText("3", { timeout: 5000 })

    // Moving away closes it.
    await page.mouse.move(5, 5)
    await expect(tooltip).toBeHidden({ timeout: 2000 })
  })

  test("the tooltip never clips against the transcript scroller, at the top or the bottom of the viewport", async ({ page }) => {
    await page.goto(`/home?tab=chats&chat=${scrollGroupId}`)
    await expect(page.locator("[data-bottom-anchored]").getByText("BOTTOM message")).toBeVisible({ timeout: 20000 })

    // Bottom edge: the transcript opens scrolled to the newest message, so the
    // 🔥 pill on "BOTTOM message" is already the last thing in view.
    const bottomPill = pillLocator(page, "🔥").last()
    await bottomPill.scrollIntoViewIfNeeded()
    await bottomPill.hover()
    const tooltip = page.getByRole("tooltip")
    await expect(tooltip).toBeVisible({ timeout: 3000 })
    let box = await tooltip.boundingBox()
    expect(box).toBeTruthy()
    expect(box!.y).toBeGreaterThanOrEqual(0)
    expect(box!.y + box!.height).toBeLessThanOrEqual(900)
    await page.mouse.move(5, 5)
    await expect(tooltip).toBeHidden()

    // Top edge: scroll the transcript container to the very top.
    await page.locator("[data-bottom-anchored]").evaluate((el) => { el.scrollTop = 0 })
    const topPill = pillLocator(page, "🔥").first()
    await expect(topPill).toBeVisible({ timeout: 5000 })
    await topPill.hover()
    await expect(tooltip).toBeVisible({ timeout: 3000 })
    box = await tooltip.boundingBox()
    expect(box).toBeTruthy()
    expect(box!.y).toBeGreaterThanOrEqual(0)
    expect(box!.y + box!.height).toBeLessThanOrEqual(900)
    expect(box!.x).toBeGreaterThanOrEqual(0)
    expect(box!.x + box!.width).toBeLessThanOrEqual(1440)
  })

  test("tabbing to a pill reveals the tooltip (keyboard route); a mouse click focuses it WITHOUT that route firing on its own", async ({ page }) => {
    await page.goto(`/home?tab=chats&chat=${tabGroupId}`)
    const pill = pillLocator(page, "👍")
    await expect(pill).toBeVisible({ timeout: 20000 })
    await page.waitForTimeout(1500)

    // Keyboard route: programmatic focus is what :focus-visible treats as
    // keyboard-equivalent (verified directly against this build — no prior
    // pointer interaction precedes it here).
    await pill.focus()
    const focusVisible = await pill.evaluate((el) => el.matches(":focus-visible"))
    expect(focusVisible).toBe(true)
    const tooltip = page.getByRole("tooltip")
    await expect(tooltip).toBeVisible({ timeout: 2000 })
    await expect(pill).toHaveAttribute("aria-describedby", await tooltip.getAttribute("id") ?? "")

    // Enter still toggles while the tooltip is showing.
    await expect(pill).toContainText("2")
    await page.keyboard.press("Enter")
    await expect(pill).toContainText("1", { timeout: 5000 })
    await page.keyboard.press("Enter")
    await expect(pill).toContainText("2", { timeout: 5000 })

    await page.evaluate(() => (document.activeElement as HTMLElement)?.blur())
    await expect(tooltip).toBeHidden({ timeout: 2000 })

    // Mouse-click route: the click focuses the element (a real DOM fact), but
    // that focus does NOT satisfy :focus-visible — it is not the reason the
    // tooltip shows on a click; the click's own hover is. Proven by checking
    // the CSS pseudo-class directly, the same predicate the code itself reads.
    // (Not restored via a second UI click afterward — afterAll tears down the
    // whole fixture group regardless, and a rapid double-click here is a timing
    // artifact of the test harness, not a product behavior worth chasing.)
    await pill.click()
    await expect(pill).toContainText("1", { timeout: 5000 }) // click also toggled
    const clickFocusVisible = await pill.evaluate((el) => el.matches(":focus-visible"))
    expect(clickFocusVisible).toBe(false)
    const isFocused = await pill.evaluate((el) => document.activeElement === el)
    expect(isFocused).toBe(true)
  })
})
