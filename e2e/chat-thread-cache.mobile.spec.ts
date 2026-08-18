// Guards app/home/chat-thread-cache.ts — the out-of-React thread snapshot that
// makes a reopened chat paint from memory instead of the network (perf/instant-
// chat-open). Correctness matters more than speed here: a cache that paints fast
// but stale, or that duplicates an optimistic send, is worse than the spinner it
// replaced. Four things are asserted, each the seam the diff calls out as risky:
//   1. an optimistic send survives revalidation and a close/reopen without duplicating
//   2. a reopen paints the cached transcript immediately, then reconciles a message
//      that arrived while the room was closed
//   3. an edit / delete / reaction made OUT OF BAND (not through this client) lands
//      correctly when the room is reopened — mergeThread must not keep stale rows
//   4. load-older still works and its page's reactions arrive embedded (no more
//      follow-up message_reactions query)
import { test, expect, type Page } from "@playwright/test"
import { sandbox, E2E_PREFIX } from "./fixtures"

const ROOM_OPT = `${E2E_PREFIX}Cache Optimistic`
const ROOM_RECONCILE = `${E2E_PREFIX}Cache Reconcile`
const ROOM_ELSEWHERE = `${E2E_PREFIX}Cache Elsewhere`
const ROOM_PAGE = `${E2E_PREFIX}Cache Paging`

const composerLocator = (page: Page) =>
  page.locator("textarea, input[placeholder^='Message']").filter({ visible: true }).first()

// Message text also appears in the chat-list row's last-message preview, which
// stays mounted (just visually behind the ChatScreen overlay) — Playwright's
// visibility check is CSS-based, not occlusion-based, so an unscoped getByText
// matches both. Scope every thread-content assertion to the transcript container
// (data-bottom-anchored), the same marker mobile-screen-sweep uses to identify it.
const threadText = (page: Page, text: string, exact = false) =>
  page.locator("[data-bottom-anchored]").getByText(text, { exact }).filter({ visible: true })

let reconcileId = ""
let elsewhereId = ""
let pageId = ""
let editMsgId = ""
let deleteMsgId = ""
let reactMsgId = ""
let adminId = ""
let memberId = ""

const SEED_TEXT = "reconcile seed message"
const EDIT_ORIGINAL = "edit me original"
const EDIT_UPDATED = "edited out of band"
const DELETE_TEXT = "delete me out of band"
const REACT_TEXT = "react to me out of band"
const OLD_PAGE_REACT_TEXT = "cache msg 2"
const REACT_EMOJI = "🔥"

test.describe("chat thread cache — correctness (perf/instant-chat-open)", () => {
  test.describe.configure({ timeout: 90000 })

  test.beforeAll(async () => {
    const sb = sandbox()
    adminId = await sb.adminUserId()
    memberId = await sb.memberUserId()

    await sb.createGroup({ name: ROOM_OPT, memberIds: [adminId, memberId] }).then(async (opt) => {
      await sb.insertMessage({ groupId: opt.id, senderId: memberId, content: "opt room anchor" })
    })

    const reconcile = await sb.createGroup({ name: ROOM_RECONCILE, memberIds: [adminId, memberId] })
    reconcileId = reconcile.id
    await sb.insertMessage({ groupId: reconcileId, senderId: memberId, content: SEED_TEXT })

    const elsewhere = await sb.createGroup({ name: ROOM_ELSEWHERE, memberIds: [adminId, memberId] })
    elsewhereId = elsewhere.id
    const editMsg = await sb.insertMessage({ groupId: elsewhereId, senderId: memberId, content: EDIT_ORIGINAL })
    editMsgId = editMsg.id
    const deleteMsg = await sb.insertMessage({ groupId: elsewhereId, senderId: memberId, content: DELETE_TEXT })
    deleteMsgId = deleteMsg.id
    const reactMsg = await sb.insertMessage({ groupId: elsewhereId, senderId: memberId, content: REACT_TEXT })
    reactMsgId = reactMsg.id

    // 55 messages, ascending: newest-50 window = indices 5..54; older page = 0..4.
    // A reaction on index 2 (old page) proves load-older's page carries reactions
    // EMBEDDED, since mergeReactionsFor (the old follow-up query) no longer exists.
    const page = await sb.createGroup({ name: ROOM_PAGE, memberIds: [adminId, memberId] })
    pageId = page.id
    const rows = Array.from({ length: 55 }, (_, i) => ({
      group_id: pageId, sender_id: i % 2 ? memberId : adminId,
      content: `cache msg ${i}`, message_type: "text",
      created_at: new Date(Date.now() - (55 - i) * 60000).toISOString(),
    }))
    const { data: inserted, error } = await sb.client.from("messages").insert(rows).select("id, content")
    if (error) throw error
    const oldPageReactMsg = (inserted as { id: string; content: string }[]).find((m) => m.content === OLD_PAGE_REACT_TEXT)
    if (!oldPageReactMsg) throw new Error("seed message for load-older reaction not found")
    const { error: rxErr } = await sb.client.from("message_reactions")
      .insert({ message_id: oldPageReactMsg.id, user_id: adminId, emoji: REACT_EMOJI, group_id: pageId })
    if (rxErr) throw rxErr
  })

  test.afterAll(async () => {
    await sandbox().deleteGroupsByPrefix(`${E2E_PREFIX}Cache`)
  })

  test("optimistic send paints immediately, survives revalidation, and never duplicates on reopen", async ({ page }) => {
    await page.goto(`/home?tab=chats&chats=my`)
    await page.waitForLoadState("networkidle")
    const row = page.locator(`[data-pocket-row="${ROOM_OPT}"]`)
    await expect(row).toBeVisible({ timeout: 15000 })
    await row.click()
    await expect(page.locator("h2", { hasText: ROOM_OPT }).filter({ visible: true }).first())
      .toBeVisible({ timeout: 15000 })

    const body = `optimistic send ${Date.now()}`
    const composer = composerLocator(page)
    await composer.fill(body)
    await composer.press("Enter")

    // Optimistic paint: on screen well before a real round trip could complete.
    await expect(threadText(page, body)).toHaveCount(1, { timeout: 1000 })

    // Let the insert + revalidation window land, then confirm it did not duplicate
    // when the server window swapped the optimistic id for the real one.
    await expect.poll(async () => threadText(page, body).count(), { timeout: 8000 }).toBe(1)
    await page.waitForTimeout(1500)
    await expect(threadText(page, body)).toHaveCount(1)

    // Close and reopen — the write-through effect must have snapshotted the real
    // (not optimistic) id, so the cached reopen shows it exactly once too.
    await page.locator(".back-chevron").filter({ visible: true }).first().click()
    await expect(row).toBeVisible({ timeout: 10000 })
    await row.click()
    await expect(page.locator("h2", { hasText: ROOM_OPT }).filter({ visible: true }).first())
      .toBeVisible({ timeout: 10000 })
    await expect(threadText(page, body)).toHaveCount(1, { timeout: 5000 })
  })

  test("reopen paints the cached transcript immediately, then reconciles a message inserted while closed", async ({ page }) => {
    const sb = sandbox()
    await page.goto(`/home?tab=chats&chats=my`)
    await page.waitForLoadState("networkidle")
    const row = page.locator(`[data-pocket-row="${ROOM_RECONCILE}"]`)
    await expect(row).toBeVisible({ timeout: 15000 })
    await row.click()
    await expect(threadText(page, SEED_TEXT)).toBeVisible({ timeout: 15000 })

    // Close — the write-through effect snapshots this room's state into the cache.
    await page.locator(".back-chevron").filter({ visible: true }).first().click()
    await expect(row).toBeVisible({ timeout: 10000 })

    // Someone else sends a message while the room is closed — not through this client.
    const newBody = `arrived while closed ${Date.now()}`
    await sb.insertMessage({ groupId: reconcileId, senderId: memberId, content: newBody })

    // Reopen: the cached seed message must paint essentially instantly (no spinner,
    // no wait for a network round trip)...
    await row.click()
    await expect(threadText(page, SEED_TEXT)).toBeVisible({ timeout: 1200 })
    // ...and the message that arrived while closed must land once the background
    // revalidation (fetchThread → mergeThread) resolves.
    await expect(threadText(page, newBody)).toBeVisible({ timeout: 20000 })
  })

  test("an edit, a delete, and a reaction made out of band all land on reopen", async ({ page }) => {
    const sb = sandbox()
    await page.goto(`/home?tab=chats&chats=my`)
    await page.waitForLoadState("networkidle")
    const row = page.locator(`[data-pocket-row="${ROOM_ELSEWHERE}"]`)
    await expect(row).toBeVisible({ timeout: 15000 })
    await row.click()
    await expect(threadText(page, EDIT_ORIGINAL)).toBeVisible({ timeout: 15000 })
    await expect(threadText(page, DELETE_TEXT)).toBeVisible()
    await expect(threadText(page, REACT_EMOJI)).toHaveCount(0)

    // Close — this room's window is now cached.
    await page.locator(".back-chevron").filter({ visible: true }).first().click()
    await expect(row).toBeVisible({ timeout: 10000 })

    // Mutate out of band — not through this client, so nothing but the server
    // window (fetched on reopen) can be the source of the correction.
    const { error: editErr } = await sb.client.from("messages")
      .update({ content: EDIT_UPDATED, is_edited: true }).eq("id", editMsgId)
    if (editErr) throw editErr
    const { error: delErr } = await sb.client.from("messages")
      .update({ deleted: true }).eq("id", deleteMsgId)
    if (delErr) throw delErr
    const { error: rxErr } = await sb.client.from("message_reactions")
      .insert({ message_id: reactMsgId, user_id: memberId, emoji: REACT_EMOJI, group_id: elsewhereId })
    if (rxErr) throw rxErr

    // Reopen — the cached copy (stale edit/delete/no-reaction) must be corrected,
    // not kept, once the revalidation window lands.
    await row.click()
    await expect(threadText(page, EDIT_UPDATED)).toBeVisible({ timeout: 10000 })
    await expect(threadText(page, EDIT_ORIGINAL, true)).toHaveCount(0)
    await expect(threadText(page, "Message deleted")).toBeVisible({ timeout: 10000 })
    await expect(threadText(page, DELETE_TEXT, true)).toHaveCount(0)
    await expect(threadText(page, REACT_EMOJI)).toBeVisible({ timeout: 10000 })
  })

  test("scrolling up loads older messages, and the older page's reactions arrive embedded", async ({ page }) => {
    await page.goto(`/home?tab=chats&chats=my`)
    await page.waitForLoadState("networkidle")
    const row = page.locator(`[data-pocket-row="${ROOM_PAGE}"]`)
    await expect(row).toBeVisible({ timeout: 15000 })
    await row.click()

    // Newest-window boundary (index 5) is loaded; the older page (index 0-4,
    // including the reacted message at index 2) is not yet.
    await expect(threadText(page, "cache msg 54", true)).toBeVisible({ timeout: 15000 })
    await expect(threadText(page, "cache msg 5", true)).toBeVisible({ timeout: 10000 })
    await expect(threadText(page, OLD_PAGE_REACT_TEXT, true)).toHaveCount(0)
    await expect(threadText(page, REACT_EMOJI)).toHaveCount(0)

    // Scroll the transcript to the top — handleMessagesScroll fires loadOlder
    // below scrollTop < 120.
    const scroller = page.locator("[data-bottom-anchored]")
    await scroller.evaluate((el) => {
      el.scrollTop = 0
      el.dispatchEvent(new Event("scroll", { bubbles: true }))
    })

    await expect(threadText(page, OLD_PAGE_REACT_TEXT, true)).toBeVisible({ timeout: 15000 })
    // The reaction rode in embedded on the SAME page response — no follow-up
    // message_reactions query exists anymore to have populated it separately.
    await expect(threadText(page, REACT_EMOJI)).toBeVisible({ timeout: 5000 })
  })
})
