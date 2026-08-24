// The in-app notification banner (components/central/message-banner.tsx +
// lib/chat-notification.ts + the realtime path in app/home/home-app.tsx).
//
// iOS suppresses its OWN banner while the app is foregrounded, so this is the
// only thing that tells a user about a message in another room while they are
// using Central. Two halves are worth proving and neither is provable by
// inspection: that a message in a room you are NOT looking at raises a card
// wherever you are in the app, and that the room you ARE looking at never does.
//
// Messages are inserted with the service-role client, which fires the same
// broadcast_chat_change trigger a real send does — so the client receives them
// over exactly the production path, not a test-only one.
import { test, expect, type Page } from "@playwright/test"
import { sandbox, E2E_PREFIX } from "./fixtures"

const ROOM_A = `${E2E_PREFIX}Banner Room A`
const ROOM_B = `${E2E_PREFIX}Banner Room B`

let roomA = ""
let roomB = ""
let adminId = ""
let memberId = ""
let memberName = ""

test.beforeAll(async () => {
  const sb = sandbox()
  adminId = await sb.adminUserId()
  memberId = await sb.memberUserId()
  const { data: prof } = await sb.client.from("profiles").select("name").eq("id", memberId).single()
  memberName = prof?.name ?? ""

  const a = await sb.createGroup({ name: ROOM_A, memberIds: [adminId, memberId] })
  const b = await sb.createGroup({ name: ROOM_B, memberIds: [adminId, memberId] })
  roomA = a.id
  roomB = b.id
})

test.afterAll(async () => {
  const sb = sandbox()
  for (const id of [roomA, roomB]) if (id) await sb.client.from("groups").delete().eq("id", id)
})

/** Send as the OTHER member, through the normal table so the DB trigger fires. */
async function sendAs(groupId: string, content: string) {
  const sb = sandbox()
  const { error } = await sb.client.from("messages").insert({
    group_id: groupId, sender_id: memberId, content, message_type: "text",
  })
  if (error) throw error
}

const bannerCard = (page: Page) => page.locator(".msg-banner-card")
/** The message as rendered IN the transcript. Anchored on `data-message-bubble`
 *  (message-row.tsx) rather than the text alone: the chat-list row behind the
 *  overlay carries the same preview string, so a bare getByText matches a hidden
 *  list row and proves the opposite of what it looks like it proves. */
const bubbleWith = (page: Page, text: string) =>
  page.locator("[data-message-bubble]").filter({ hasText: text }).first()

/** Land in the app and let the realtime subscriptions + chat list settle — the
 *  banner needs the room's row (for its name and avatar) and its own topic. */
async function openApp(page: Page, tab: string) {
  await page.goto(`/home?tab=${tab}`)
  await page.waitForLoadState("networkidle")
  await page.waitForTimeout(1500)
}

test.describe("in-app message banner", () => {
  test("a message in another room banners while you're on Home", async ({ page }) => {
    await openApp(page, "home")
    await sendAs(roomA, "banner hello there")

    const card = bannerCard(page)
    await expect(card).toBeVisible({ timeout: 15000 })
    // The push payload's grammar, rendered in-app: WHO, then WHERE, then the
    // message. Same three lines the lock screen would have shown.
    await expect(card).toContainText(memberName)
    await expect(card).toContainText(`to ${ROOM_A}`)
    await expect(card).toContainText("banner hello there")
  })

  test("tapping the banner opens that conversation", async ({ page }) => {
    await openApp(page, "home")
    await sendAs(roomA, "tap me open")

    const card = bannerCard(page)
    await expect(card).toBeVisible({ timeout: 15000 })
    await card.click()

    // The conversation is open: the message is on screen in the transcript and
    // the URL carries the room.
    await expect(bubbleWith(page, "tap me open")).toBeVisible({ timeout: 30000 })
    expect(page.url()).toContain(`chat=${roomA}`)
  })

  test("the room you are READING never banners", async ({ page }) => {
    await page.goto(`/home?tab=chats&chat=${roomA}`)
    await page.waitForLoadState("networkidle")
    await page.waitForTimeout(1500)

    await sendAs(roomA, "you are already here")
    // It has to ARRIVE to prove the banner was suppressed rather than the message
    // simply never landing — otherwise this passes on a dead realtime channel.
    await expect(bubbleWith(page, "you are already here")).toBeVisible({ timeout: 30000 })
    await expect(bannerCard(page)).toHaveCount(0)
  })

  test("a DIFFERENT room banners even while you are inside a chat", async ({ page }) => {
    await page.goto(`/home?tab=chats&chat=${roomA}`)
    await page.waitForLoadState("networkidle")
    await page.waitForTimeout(1500)

    await sendAs(roomB, "over here instead")

    const card = bannerCard(page)
    await expect(card).toBeVisible({ timeout: 15000 })
    await expect(card).toContainText(`to ${ROOM_B}`)
  })

  test("a muted room stays silent", async ({ page }) => {
    const sb = sandbox()
    // notify_mode is the column the DB listens to; `muted` is trigger-derived.
    await sb.client.from("group_members")
      .update({ notify_mode: "off" }).eq("group_id", roomB).eq("user_id", adminId)

    await openApp(page, "home")
    await sendAs(roomB, "muted and quiet")
    // Give it more than enough time to have appeared if the mute were ignored.
    await page.waitForTimeout(4000)
    await expect(bannerCard(page)).toHaveCount(0)

    await sb.client.from("group_members")
      .update({ notify_mode: null }).eq("group_id", roomB).eq("user_id", adminId)
  })
})
