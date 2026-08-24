// A push is a claim that there is something you have not seen. Reading the thing
// makes that claim false, so the notification has to come down — including when
// you reached the message YOURSELF instead of tapping the notification, which is
// the case that was broken.
//
// WHY THIS STUBS THE SERVICE WORKER rather than showing a real notification:
// headless Chromium refuses the Notifications API outright — `Notification.permission`
// reads "denied" no matter what is passed to grantPermissions() or to
// newContext({permissions}), and showNotification() then throws. What actually
// needs proving is the WIRING (does opening a chat ask the service worker to close
// that chat's notifications, and only that chat's), and a recording stub proves it
// exactly. The native path is the same function with the same tag; it needs a real
// APNs delivery on a device and cannot be reached from here.
import { test, expect } from "@playwright/test"
import { sandbox, E2E_PREFIX } from "./fixtures"

const ROOM = `${E2E_PREFIX}Notify Room`
const MSG = "E2E:: message you already read"

// Replaces navigator.serviceWorker.getRegistration BEFORE any app code runs, and
// records every getNotifications(filter) and close() the app performs.
const STUB = `
  window.__dismissCalls = []
  window.__closed = []
  const fake = {
    getNotifications: async (filter) => {
      window.__dismissCalls.push(filter && filter.tag)
      // One notification per asked-for tag, so a close() is observable.
      return [{ tag: filter && filter.tag, close() { window.__closed.push(this.tag) } }]
    },
  }
  Object.defineProperty(navigator, "serviceWorker", {
    configurable: true,
    value: { getRegistration: async () => fake, register: async () => fake, ready: Promise.resolve(fake), addEventListener() {} },
  })
`

test.describe("a notification comes down once you've read it", () => {
  let groupId = ""

  test.beforeAll(async () => {
    const sb = sandbox()
    const db = sb.client
    const adminId = await sb.adminUserId()
    const memberId = await sb.memberUserId()
    await db.from("groups").delete().eq("ministry_id", sb.ministryId).like("name", `${E2E_PREFIX}Notify%`)
    const { data: g, error } = await db.from("groups")
      .insert({ ministry_id: sb.ministryId, name: ROOM, type: "my", created_by: adminId })
      .select("id").single()
    if (error) throw new Error(`seed group: ${error.message}`)
    groupId = g!.id
    await db.from("group_members").insert([
      { group_id: groupId, user_id: adminId },
      { group_id: groupId, user_id: memberId },
    ])
    await db.from("messages").insert({ group_id: groupId, sender_id: memberId, content: MSG, message_type: "text" })
  })

  test.afterAll(async () => {
    const sb = sandbox()
    await sb.client.from("groups").delete().eq("ministry_id", sb.ministryId).like("name", `${E2E_PREFIX}Notify%`)
  })

  test("opening a chat yourself clears that chat's notifications, scoped by tag", async ({ page }) => {
    await page.addInitScript(STUB)

    // Reach the message the way the bug report describes: navigate to it directly,
    // never touching a notification.
    await page.goto(`/home?tab=chats&chat=${groupId}`)
    await expect(page.getByText(MSG).filter({ visible: true }).first()).toBeVisible({ timeout: 25000 })

    await expect.poll(
      () => page.evaluate(() => (window as unknown as { __closed: string[] }).__closed),
      { message: "reading the chat must close its notifications", timeout: 15000 },
    ).toContain(`chat-${groupId}`)

    // SCOPED, not a blanket clear: every lookup was filtered to this chat's tag, so
    // reading one chat can never take down another chat's unread notice.
    const asked = await page.evaluate(() => (window as unknown as { __dismissCalls: (string | undefined)[] }).__dismissCalls)
    expect(asked.length, "the app asked the service worker at least once").toBeGreaterThan(0)
    expect(asked.every((t) => t === `chat-${groupId}`),
      `every lookup must be tag-filtered to this chat, got ${JSON.stringify(asked)}`).toBe(true)
  })

  test("coming back to the app with the chat already open clears them again", async ({ page }) => {
    await page.addInitScript(STUB)
    await page.goto(`/home?tab=chats&chat=${groupId}`)
    await expect(page.getByText(MSG).filter({ visible: true }).first()).toBeVisible({ timeout: 25000 })

    // This is the exact shape of the complaint: the notification arrives while the
    // app is backgrounded ON this chat, and returning to it must take it down. The
    // open effect fires once per mount, so only the visibility listener covers it.
    await page.evaluate(() => (window as unknown as { __closed: string[] }).__closed.length = 0)
    await page.evaluate(() => {
      Object.defineProperty(document, "visibilityState", { configurable: true, get: () => "hidden" })
      document.dispatchEvent(new Event("visibilitychange"))
      Object.defineProperty(document, "visibilityState", { configurable: true, get: () => "visible" })
      document.dispatchEvent(new Event("visibilitychange"))
    })

    await expect.poll(
      () => page.evaluate(() => (window as unknown as { __closed: string[] }).__closed),
      { message: "returning to the app must clear them again", timeout: 15000 },
    ).toContain(`chat-${groupId}`)
  })
})
