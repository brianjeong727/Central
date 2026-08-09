// Guards the read-receipt WRITE contract (chats-tab.tsx, markRead/flushRead).
//
// last_read_at used to be written on every message received while a thread was
// open. That was one group_members write per message per viewer, and because
// group_members is in the supabase_realtime publication each write went back
// through the WAL decoder and fanned out again — the decoder was 44% of all
// database time, with group_members writes (16.5k) nearly matching messages
// (19.3k). Writes are now coalesced and flushed on close.
//
// Coalescing is only safe if the flush is reliable, so that is what this asserts:
// a message that arrives WHILE the thread is open must be marked read by the time
// the user leaves it. If the flush regresses, chats stay unread after you read
// them — a silent, high-annoyance bug that nothing else here would catch.
import { test, expect } from "@playwright/test"
import { sandbox, E2E_PREFIX } from "./fixtures"

test.describe("read receipts (mobile)", () => {
  const CHAT = `${E2E_PREFIX}Read Receipt Flush`
  let chatId = ""
  let adminId = ""
  let memberId = ""

  test.beforeAll(async () => {
    const sb = sandbox()
    adminId = await sb.adminUserId()
    memberId = await sb.memberUserId()
    const g = await sb.createGroup({ name: CHAT, memberIds: [adminId, memberId] })
    chatId = g.id
  })

  test("a message arriving while the thread is open is read by the time it closes", async ({ page }) => {
    const sb = sandbox()
    const db = sb.client

    await page.goto(`/home?tab=chats&chat=${chatId}`)
    await page.locator("h2", { hasText: CHAT }).filter({ visible: true }).first()
      .waitFor({ state: "visible", timeout: 15000 })

    // Arrives over realtime while the thread is open — the case that used to
    // trigger an immediate write and now only marks progress locally.
    const body = `live message ${Date.now()}`
    await sb.insertMessage({ groupId: chatId, senderId: memberId, content: body })
    await page.getByText(body, { exact: false }).filter({ visible: true }).first()
      .waitFor({ state: "visible", timeout: 15000 })

    const sentAt = await db.from("messages").select("created_at")
      .eq("group_id", chatId).order("created_at", { ascending: false }).limit(1)
      .single().then(r => r.data!.created_at as string)

    // Leave the thread — this is what must flush.
    await page.locator(".back-chevron").filter({ visible: true }).first().click()

    await expect.poll(async () => {
      const { data } = await db.from("group_members").select("last_read_at")
        .eq("group_id", chatId).eq("user_id", adminId).single()
      const lr = data?.last_read_at as string | null
      return lr ? new Date(lr).getTime() >= new Date(sentAt).getTime() : false
    }, {
      message: "closing the thread must flush last_read_at past the message received while it was open",
      timeout: 15000,
    }).toBe(true)
  })
})
