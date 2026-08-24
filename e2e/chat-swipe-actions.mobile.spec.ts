// Swipe actions on the mobile chat list (components/central/swipe-actions.tsx +
// app/home/chat-permissions.ts + app/home/chat-actions.ts).
//
// The gesture is an accelerator for things chat Settings already does, so the
// things worth proving are (a) the WRITE actually lands in Postgres — an
// optimistic cache patch looks identical to a successful write until you go and
// read the row — (b) the ACTION SET is exactly TWO tiles, Pin plus the one room
// action that fits the room (Leave where you can leave, Mute where you cannot),
// and (c) a FULL swipe fires that tile with no tap, while a drag that comes back
// before release fires nothing.
//
// Archive and Delete are deliberately absent everywhere: both act on the room
// for every member, and they stay behind Settings' danger zone. There is no
// swipe path to either, which is what the toHaveCount(0) assertions pin.
import { test, expect, type Page, type Locator } from "@playwright/test"
import { sandbox, E2E_PREFIX, memberState } from "./fixtures"

const CHURCH = `${E2E_PREFIX}Swipe Church`
const MY = `${E2E_PREFIX}Swipe My`
// A SECOND church chat, owned by the member-tier case. Deliberately separate
// from CHURCH: the admin cases mute and pin that one, and a permission assertion
// that quietly depends on a sibling test's leftovers fails for reasons unrelated
// to permissions.
const MEMBER_CHURCH = `${E2E_PREFIX}Swipe Member Church`

let churchId = ""
let myId = ""
let memberChurchId = ""
let adminId = ""
let memberId = ""

test.beforeAll(async () => {
  const sb = sandbox()
  adminId = await sb.adminUserId()
  memberId = await sb.memberUserId()

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

  const { data: memberChurch, error: mcErr } = await sb.client
    .from("groups")
    .insert({ ministry_id: sb.ministryId, name: MEMBER_CHURCH, type: "church", category: "general", created_by: adminId })
    .select().single()
  if (mcErr) throw mcErr
  memberChurchId = memberChurch.id
  // The member must BELONG to the room for it to appear in their list at all —
  // get_chat_list only returns rooms the caller is in, which is the premise the
  // list's `isMemberOfChat: true` rests on.
  const { error: mcm } = await sb.client.from("group_members").insert({ group_id: memberChurchId, user_id: memberId })
  if (mcm) throw mcm
})

test.afterAll(async () => {
  const sb = sandbox()
  for (const id of [churchId, myId, memberChurchId]) {
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

/** Drag a row along an explicit path of x-offsets and release at the end of it.
 *  `swipeRow` above always travels one way; the full-swipe gesture is decided by
 *  where the finger is when it LIFTS, so proving that needs a path that goes out
 *  past the commit distance and comes back before the release. */
async function dragRowPath(page: Page, row: Locator, startX: number, offsets: number[]) {
  const box = await row.boundingBox()
  if (!box) throw new Error("row has no bounding box")
  const y = box.y + box.height / 2
  const x0 = box.x + startX
  const cdp = await page.context().newCDPSession(page)
  await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: x0, y }] })
  for (const dx of offsets) {
    await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x: x0 + dx, y }] })
    await page.waitForTimeout(16)
  }
  await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] })
  await cdp.detach()
  await page.waitForTimeout(500)  // let the snap settle and the write go out
}

/** A ramp of `steps` offsets ending at `to`, so the drag looks like a finger
 *  rather than a teleport (the handler ignores anything under 8px and locks
 *  direction on the first decisive move). */
const ramp = (to: number, steps = 8, from = 0) =>
  Array.from({ length: steps }, (_, i) => from + ((to - from) * (i + 1)) / steps)

const mutedFor = async (groupId: string, userId: string) => {
  const { data } = await sandbox().client
    .from("group_members").select("muted, notify_mode")
    .eq("group_id", groupId).eq("user_id", userId).single()
  return `${data?.notify_mode}/${data?.muted}`
}

const rowFor = (page: Page, name: string) => page.locator(`[data-pocket-row="${name}"]`)

async function openChats(page: Page, scope: "church" | "my") {
  await page.goto(`/home?tab=chats&chats=${scope}`)
  await page.waitForLoadState("networkidle")
}

test.describe("chat list swipe actions", () => {
  test("church chat: the room action is Mute, and only Mute", async ({ page }) => {
    await openChats(page, "church")
    const row = rowFor(page, CHURCH)
    await expect(row).toBeVisible({ timeout: 15000 })

    await swipeRow(page, row, -150)
    await expect(page.getByRole("button", { name: "Mute", exact: true })).toBeVisible()
    // A church chat is not yours to leave, and the two that act on the room for
    // everyone else are not a thumb-flick away from anyone.
    await expect(page.getByRole("button", { name: "Leave", exact: true })).toHaveCount(0)
    await expect(page.getByRole("button", { name: "Archive", exact: true })).toHaveCount(0)
    await expect(page.getByRole("button", { name: "Delete", exact: true })).toHaveCount(0)
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

  test("my chat: the room action is Leave, and it replaces Mute", async ({ page }) => {
    await openChats(page, "my")
    const row = rowFor(page, MY)
    await expect(row).toBeVisible({ timeout: 15000 })

    await swipeRow(page, row, -150)
    await expect(page.getByRole("button", { name: "Leave", exact: true })).toBeVisible()
    // Two tiles per row is the contract, so Leave does not sit BESIDE Mute here
    // — it takes the slot. Mute is still reachable in chat Settings.
    await expect(page.getByRole("button", { name: "Mute", exact: true })).toHaveCount(0)
    await expect(page.getByRole("button", { name: "Archive", exact: true })).toHaveCount(0)
  })

  // ── Full swipe: the tile fires on release, with no tap ────────────────────
  // Order matters: the cancel case asserts NOTHING happened, so it cannot follow
  // a case that leaves or mutes the same room.

  test("dragging past the commit point and back before release does nothing", async ({ page }) => {
    await openChats(page, "my")
    const row = rowFor(page, MY)
    await expect(row).toBeVisible({ timeout: 15000 })

    // Out past the commit distance (one tile = 76px, so the commit point is the
    // 195px floor at this 390px viewport), then back to well inside it.
    await dragRowPath(page, row, 366, [...ramp(-280), ...ramp(-20, 6, -280)])

    // Leave never even reached its confirm, and nothing stuck open either — a
    // 20px drag is under the panel's own threshold.
    await expect(page.getByText("Leave this chat?")).toHaveCount(0)
    await expect(page.getByRole("button", { name: "Leave", exact: true })).toBeHidden()
    await expect(rowFor(page, MY)).toBeVisible()
  })

  test("a full left swipe reaches Leave's confirm, with no tap", async ({ page }) => {
    await openChats(page, "my")
    const row = rowFor(page, MY)
    await expect(row).toBeVisible({ timeout: 15000 })

    await dragRowPath(page, row, 366, ramp(-280))

    // The swipe carries you to the DECISION, never past it — the room action
    // still costs a deliberate tap, which is the whole reason a full swipe is
    // allowed to reach it at all.
    await expect(page.getByText("Leave this chat?")).toBeVisible({ timeout: 10000 })
    await page.getByRole("button", { name: "Cancel", exact: true }).click()
    await expect(page.getByText("Leave this chat?")).toHaveCount(0)
    // Still a member: cancelling is not a slow yes.
    const { data } = await sandbox().client
      .from("group_members").select("user_id").eq("group_id", myId).eq("user_id", adminId).maybeSingle()
    expect(data?.user_id).toBe(adminId)
  })

  test("a full right swipe pins on release, with no tap", async ({ page }) => {
    const sb = sandbox()
    await openChats(page, "my")
    const row = rowFor(page, MY)
    await expect(row).toBeVisible({ timeout: 15000 })

    // Starts at 40px in: clear of the 24px back-swipe edge zone, with room for
    // the full travel without walking off the 390px viewport.
    await dragRowPath(page, row, 40, ramp(280))

    // Pin is the one action on this row that does NOT confirm — it is a private
    // toggle with an Undo toast, so the swipe simply does it.
    await expect.poll(async () => {
      const { data } = await sb.client
        .from("group_members").select("pinned")
        .eq("group_id", myId).eq("user_id", adminId).single()
      return data?.pinned
    }, { timeout: 10000 }).toBe(true)
    await expect(page.getByRole("button", { name: "Unpin", exact: true })).toBeHidden()
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

  test("a full left swipe on a church chat confirms, then mutes for real", async ({ page }) => {
    const sb = sandbox()
    await openChats(page, "church")
    const row = rowFor(page, CHURCH)
    await expect(row).toBeVisible({ timeout: 15000 })

    await dragRowPath(page, row, 366, ramp(-280))
    await expect(page.getByText("Mute this chat?")).toBeVisible({ timeout: 10000 })
    await page.getByRole("button", { name: "Mute", exact: true }).last().click()

    // Read the row back: `muted` is trigger-derived from notify_mode, so this
    // also proves we wrote the column the DB actually listens to.
    await expect.poll(() => mutedFor(churchId, adminId), { timeout: 10000 }).toBe("off/true")
  })

  // Uses the "my" scope on purpose: the church cases above mute and pin that
  // list, and a spec that silently depends on a sibling test's leftovers fails
  // for a reason that has nothing to do with what it is testing.
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
    await expect(page.getByRole("button", { name: "Leave", exact: true })).toBeHidden()
    // Only assert movement when there is somewhere to move: `after >= before` is
    // vacuously true on a list that fits the screen, which would make this look
    // like it proved something it did not.
    if (overflows) {
      const after = await scroller.evaluate((e) => e.scrollTop).catch(() => 0)
      expect(after).toBeGreaterThan(before)
    }
  })
})

// The gate has to EXCLUDE something, or it isn't a gate. Every test above runs
// as the sandbox admin, so they can only ever prove the permissive side; this
// one runs the same swipe as a member-tier account and asserts the room actions
// are absent. It is the assertion that would catch `isLeaderRole` slipping to a
// wider predicate, or `isMemberOfChat: true` being passed from a list that stops
// guaranteeing membership.
test.describe("chat list swipe actions — member tier", () => {
  test.use({ storageState: memberState })

  test("church chat: a member gets mute only — no archive, no unarchive, no leave", async ({ page }) => {
    // Same two-tile set as the admin sees on a church chat. The gate this guards
    // is not WHICH tiles a member gets but that the room-wide ones never appear.
    await openChats(page, "church")
    const row = rowFor(page, MEMBER_CHURCH)
    await expect(row).toBeVisible({ timeout: 15000 })

    await swipeRow(page, row, -150)
    // The panel opened — without this, the three toHaveCount(0) below would pass
    // on a row that never revealed anything.
    await expect(page.getByRole("button", { name: "Mute", exact: true })).toBeVisible()
    await expect(page.getByRole("button", { name: "Archive", exact: true })).toHaveCount(0)
    await expect(page.getByRole("button", { name: "Unarchive", exact: true })).toHaveCount(0)
    await expect(page.getByRole("button", { name: "Leave", exact: true })).toHaveCount(0)
  })
})
