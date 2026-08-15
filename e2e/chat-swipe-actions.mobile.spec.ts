// Swipe actions on the mobile chat list (components/central/swipe-actions.tsx +
// app/home/chat-permissions.ts + app/home/chat-actions.ts).
//
// The gesture is an accelerator for things chat Settings already does, so the
// two things worth proving are (a) the WRITE actually lands in Postgres — an
// optimistic cache patch looks identical to a successful write until you go and
// read the row — and (b) the ACTION SET is gated per chat type. Church-chat
// Delete is deliberately absent everywhere: it destroys the room for every
// member and stays behind Settings' danger zone.
import { test, expect, type Page, type Locator } from "@playwright/test"
import { sandbox, E2E_PREFIX } from "./fixtures"

const CHURCH = `${E2E_PREFIX}Swipe Church`
const MY = `${E2E_PREFIX}Swipe My`

let churchId = ""
let myId = ""
let adminId = ""

test.beforeAll(async () => {
  const sb = sandbox()
  adminId = await sb.adminUserId()

  const { data: church, error } = await sb.client
    .from("groups")
    .insert({ ministry_id: sb.ministryId, name: CHURCH, type: "church", category: "general", created_by: adminId })
    .select().single()
  if (error) throw error
  churchId = church.id
  const { error: cm } = await sb.client.from("group_members").insert({ group_id: churchId, user_id: adminId })
  if (cm) throw cm

  const my = await sb.createGroup({ name: MY, memberIds: [adminId] })
  myId = my.id
})

test.afterAll(async () => {
  const sb = sandbox()
  for (const id of [churchId, myId]) {
    if (id) await sb.client.from("groups").delete().eq("id", id)
  }
})

/** Drag a row horizontally with real touch events. Playwright's touchscreen only
 *  taps, so the drag goes through CDP. Starts well clear of the left edge — the
 *  gesture deliberately ignores touches that begin there so back-swipe
 *  (Convention #22) is never contested. */
async function swipeRow(page: Page, row: Locator, dx: number) {
  const box = await row.boundingBox()
  if (!box) throw new Error("row has no bounding box")
  const y = box.y + box.height / 2
  const x0 = dx < 0 ? box.x + box.width - 24 : box.x + box.width / 2
  const cdp = await page.context().newCDPSession(page)
  await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: x0, y }] })
  for (let i = 1; i <= 8; i++) {
    await cdp.send("Input.dispatchTouchEvent", {
      type: "touchMove", touchPoints: [{ x: x0 + (dx * i) / 8, y }],
    })
    await page.waitForTimeout(16)
  }
  await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] })
  await cdp.detach()
  await page.waitForTimeout(400)  // let the snap settle
}

const rowFor = (page: Page, name: string) => page.locator(`[data-pocket-row="${name}"]`)

async function openChats(page: Page, scope: "church" | "my") {
  await page.goto(`/home?tab=chats&chats=${scope}`)
  await page.waitForLoadState("networkidle")
}

test.describe("chat list swipe actions", () => {
  test("church chat: mute + archive, never delete or leave", async ({ page }) => {
    const sb = sandbox()
    await openChats(page, "church")
    const row = rowFor(page, CHURCH)
    await expect(row).toBeVisible({ timeout: 15000 })

    await swipeRow(page, row, -150)
    await expect(page.getByRole("button", { name: "Mute", exact: true })).toBeVisible()
    await expect(page.getByRole("button", { name: "Archive", exact: true })).toBeVisible()
    // The two that must never be a thumb-flick away on a church chat.
    await expect(page.getByRole("button", { name: "Delete", exact: true })).toHaveCount(0)
    await expect(page.getByRole("button", { name: "Leave", exact: true })).toHaveCount(0)

    await page.getByRole("button", { name: "Mute", exact: true }).click()
    // Read the row back: `muted` is trigger-derived from notify_mode, so this
    // also proves we wrote the column the DB actually listens to.
    await expect.poll(async () => {
      const { data } = await sb.client
        .from("group_members").select("muted, notify_mode")
        .eq("group_id", churchId).eq("user_id", adminId).single()
      return `${data?.notify_mode}/${data?.muted}`
    }, { timeout: 10000 }).toBe("off/true")
  })

  test("pin writes through and floats the row to the top", async ({ page }) => {
    const sb = sandbox()
    await openChats(page, "church")
    const row = rowFor(page, CHURCH)
    await expect(row).toBeVisible({ timeout: 15000 })

    await swipeRow(page, row, 120)
    await page.getByRole("button", { name: "Pin", exact: true }).click()
    await expect.poll(async () => {
      const { data } = await sb.client
        .from("group_members").select("pinned")
        .eq("group_id", churchId).eq("user_id", adminId).single()
      return data?.pinned
    }, { timeout: 10000 }).toBe(true)

    // partitionPinned floats it within its own section card.
    await page.reload()
    await page.waitForLoadState("networkidle")
    const names = await page.locator("[data-pocket-row]").evaluateAll(
      (els) => els.map((e) => e.getAttribute("data-pocket-row")),
    )
    const general = names.filter(Boolean) as string[]
    expect(general[0]).toBe(CHURCH)
  })

  test("my chat: mute + leave, never archive", async ({ page }) => {
    await openChats(page, "my")
    const row = rowFor(page, MY)
    await expect(row).toBeVisible({ timeout: 15000 })

    await swipeRow(page, row, -150)
    await expect(page.getByRole("button", { name: "Mute", exact: true })).toBeVisible()
    await expect(page.getByRole("button", { name: "Leave", exact: true })).toBeVisible()
    await expect(page.getByRole("button", { name: "Archive", exact: true })).toHaveCount(0)
  })

  test("a tap while open closes the row instead of opening the chat", async ({ page }) => {
    await openChats(page, "my")
    const row = rowFor(page, MY)
    await expect(row).toBeVisible({ timeout: 15000 })

    await swipeRow(page, row, -150)
    await expect(page.getByRole("button", { name: "Leave", exact: true })).toBeVisible()
    await row.click()
    // Still on the list — the chat did not open.
    await expect(rowFor(page, MY)).toBeVisible()
    await expect(page.getByRole("button", { name: "Leave", exact: true })).toBeHidden()
  })

  test("archive goes through the confirm and lands in Postgres", async ({ page }) => {
    const sb = sandbox()
    await openChats(page, "church")
    const row = rowFor(page, CHURCH)
    await expect(row).toBeVisible({ timeout: 15000 })

    await swipeRow(page, row, -150)
    await page.getByRole("button", { name: "Archive", exact: true }).click()
    await expect(page.getByText("Archive this chat?")).toBeVisible({ timeout: 10000 })
    await page.getByRole("button", { name: "Archive", exact: true }).last().click()

    await expect.poll(async () => {
      const { data } = await sb.client.from("groups").select("archived").eq("id", churchId).single()
      return data?.archived
    }, { timeout: 10000 }).toBe(true)
  })

  // Uses the "my" scope on purpose: the archive test above moves the church chat
  // into the collapsed Archived accordion, and a spec that silently depends on a
  // sibling test's leftovers fails for a reason that has nothing to do with what
  // it is testing.
  test("a vertical drag over a row still scrolls the list", async ({ page }) => {
    await openChats(page, "my")
    const row = rowFor(page, MY).first()
    await expect(row).toBeVisible({ timeout: 15000 })
    const scroller = page.locator(".shell-scroll").first()
    const before = await scroller.evaluate((e) => e.scrollTop).catch(() => 0)
    const overflows = await scroller.evaluate((e) => e.scrollHeight > e.clientHeight + 1).catch(() => false)

    const box = await row.boundingBox()
    if (!box) throw new Error("no box")
    const cdp = await page.context().newCDPSession(page)
    const x = box.x + box.width / 2
    await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x, y: box.y + 10 }] })
    for (let i = 1; i <= 8; i++) {
      await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x, y: box.y + 10 - i * 25 }] })
      await page.waitForTimeout(16)
    }
    await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] })
    await cdp.detach()
    await page.waitForTimeout(400)

    // The row must NOT have opened a panel — vertical always releases.
    await expect(page.getByRole("button", { name: "Mute", exact: true })).toBeHidden()
    // Only assert movement when there is somewhere to move: `after >= before` is
    // vacuously true on a list that fits the screen, which would make this look
    // like it proved something it did not.
    if (overflows) {
      const after = await scroller.evaluate((e) => e.scrollTop).catch(() => 0)
      expect(after).toBeGreaterThan(before)
    }
  })
})
