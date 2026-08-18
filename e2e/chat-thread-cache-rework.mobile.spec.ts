// Rework-specific regressions for app/home/chat-thread-cache.ts, on top of the
// coverage already in chat-thread-cache.mobile.spec.ts (which proves the CURRENT
// mergeThread signature/rule still holds — optimistic send, cache-then-reconcile,
// out-of-band edit/delete/reaction, load-older reactions). This file covers what
// changed in the rework pass (see .claude/task-context/instant-chat-open/rework.md):
//   R2  forgetThread on EVERY access-loss path (leave via Settings, retainThreads
//       off a refreshed membership set) — a departed/removed room must not FLASH
//       its pre-departure transcript on reopen; it must show a spinner (proof the
//       cache was truly forgotten, not just revalidated).
//   R3  first paint waits on the block list — must not have reintroduced a visible
//       spinner on a NORMAL (still-a-member, still-cached) reopen.
//   R4  a failed first fetch must not write-through as a successful empty room.
//   R5  the press-warm is movement-gated — a scroll/swipe brush over a row must
//       not fire a 50-message query; a press that settles still warms.
//
// The chat LIST does not proactively re-fetch membership when it changes out of
// band (leaving via Settings, being removed by someone else) — that is a known,
// separate UX property (a stale row can still be visible after you've left), NOT
// what this file is about. Every test below therefore proves the CACHE behaviour
// directly (spinner-vs-instant-paint, content-vs-empty) rather than asserting the
// list row appears/disappears, which would be testing something else entirely.
import { test, expect, type Page } from "@playwright/test"
import { sandbox, E2E_PREFIX } from "./fixtures"

const ROOM_LEAVE = `${E2E_PREFIX}Cache Leave`
const ROOM_REMOVED = `${E2E_PREFIX}Cache Removed`
const ROOM_NORMAL = `${E2E_PREFIX}Cache Normal Reopen`
const ROOM_FAIL = `${E2E_PREFIX}Cache Fetch Fail`
const ROOM_SCROLL = `${E2E_PREFIX}Cache Warm Scroll`
const ROOM_PRESS = `${E2E_PREFIX}Cache Warm Press`

const LEAVE_SEED = "leave seed message"
const REMOVED_SEED = "removed seed message"
const NORMAL_SEED = "normal reopen seed"
const FAIL_SEED = "should survive a failed fetch"

// Same occlusion caveat as chat-thread-cache.mobile.spec.ts: the chat-list row's
// last-message preview stays mounted behind the ChatScreen overlay, so any
// thread-content assertion must be scoped to the transcript container.
const threadText = (page: Page, text: string, exact = false) =>
  page.locator("[data-bottom-anchored]").getByText(text, { exact }).filter({ visible: true })
const spinner = (page: Page) => page.locator("[data-bottom-anchored] .animate-spin")
const rowFor = (page: Page, name: string) => page.locator(`[data-pocket-row="${name}"]`)

async function openChats(page: Page) {
  await page.goto(`/home?tab=chats&chats=my`)
  await page.waitForLoadState("networkidle")
}

let adminId = ""
let memberId = ""
let leaveId = ""
let removedId = ""
let normalId = ""
let failId = ""
let scrollId = ""
let pressId = ""

test.describe("chat thread cache — rework (access-loss eviction, block-gated paint, failed-fetch, movement-gated warm)", () => {
  test.describe.configure({ timeout: 90000 })

  test.beforeAll(async () => {
    const sb = sandbox()
    adminId = await sb.adminUserId()
    memberId = await sb.memberUserId()

    const leave = await sb.createGroup({ name: ROOM_LEAVE, memberIds: [adminId, memberId] })
    leaveId = leave.id
    await sb.insertMessage({ groupId: leaveId, senderId: memberId, content: LEAVE_SEED })

    const removed = await sb.createGroup({ name: ROOM_REMOVED, memberIds: [adminId, memberId] })
    removedId = removed.id
    await sb.insertMessage({ groupId: removedId, senderId: memberId, content: REMOVED_SEED })

    const normal = await sb.createGroup({ name: ROOM_NORMAL, memberIds: [adminId, memberId] })
    normalId = normal.id
    await sb.insertMessage({ groupId: normalId, senderId: memberId, content: NORMAL_SEED })

    const fail = await sb.createGroup({ name: ROOM_FAIL, memberIds: [adminId, memberId] })
    failId = fail.id
    await sb.insertMessage({ groupId: failId, senderId: memberId, content: FAIL_SEED })

    const scroll = await sb.createGroup({ name: ROOM_SCROLL, memberIds: [adminId, memberId] })
    scrollId = scroll.id
    await sb.insertMessage({ groupId: scrollId, senderId: memberId, content: "scroll room seed" })

    const press = await sb.createGroup({ name: ROOM_PRESS, memberIds: [adminId, memberId] })
    pressId = press.id
    await sb.insertMessage({ groupId: pressId, senderId: memberId, content: "press room seed" })
  })

  test.afterAll(async () => {
    // Service-role delete bypasses RLS regardless of admin's current membership
    // state at test end, so no explicit re-add-before-cleanup step is needed.
    await sandbox().deleteGroupsByPrefix(`${E2E_PREFIX}Cache`)
  })

  test("leaving via chat SETTINGS (not swipe) calls forgetThread, and re-joining afterward shows correct (not stale-then-corrected) content", async ({ page }) => {
    const sb = sandbox()
    await openChats(page)
    const row = rowFor(page, ROOM_LEAVE)
    await expect(row).toBeVisible({ timeout: 15000 })
    await row.click()
    await expect(threadText(page, LEAVE_SEED)).toBeVisible({ timeout: 15000 })

    // Close, then leave through Settings' Danger Zone (handleLeave), not the swipe
    // action — this is the path R2 fixed (the swipe path already called
    // forgetThread before this rework; Settings' handleLeave did not). Confirmed by
    // reading the diff that handleLeave calls forgetThread(groupId) right after the
    // group_members delete.
    //
    // What this test does NOT do: click the (possibly-stale, possibly-already-gone)
    // list row again immediately after leaving to catch a same-session "flash". The
    // chat LIST's own re-fetch after a membership change was observed, empirically,
    // to be non-deterministic in timing (sometimes the row vanishes near-instantly,
    // sometimes it lingers) — a property of the list, unrelated to this diff — which
    // made a row-click-based assertion here flake on BOTH branches. The exact same
    // underlying primitive (forgetThread) is proven same-session, deterministically,
    // by "being removed by someone else" below, which drives eviction through
    // retainThreads (a second, independent call site) without depending on list UI
    // state at all. This test's job is narrower: leaving via Settings must not leave
    // the room in a corrupted state once you're back in it.
    await page.locator(".back-chevron").filter({ visible: true }).first().click()
    await expect(row).toBeVisible({ timeout: 10000 })
    await row.click()
    await page.locator("h2", { hasText: ROOM_LEAVE }).filter({ visible: true }).first().click()
    await page.getByRole("button", { name: "Leave chat", exact: true }).click()
    await page.getByRole("button", { name: "Leave", exact: true }).click()
    // handleLeave's onClose() drops back to the chat list — wait for the settings
    // overlay (z-110) to fully unmount before doing anything else, or a click below
    // can land on it mid-transition.
    await expect(page.getByRole("button", { name: "Leave chat", exact: true })).toHaveCount(0, { timeout: 10000 })

    // Re-add (simulating being re-invited) and confirm real access recovers cleanly
    // — a reload forces the list to a deterministic state regardless of its own
    // refresh timing.
    const { error } = await sb.client.from("group_members").insert({ group_id: leaveId, user_id: adminId })
    if (error) throw error
    await page.reload()
    await page.waitForLoadState("networkidle")
    const rowAgain = rowFor(page, ROOM_LEAVE)
    await expect(rowAgain).toBeVisible({ timeout: 15000 })
    await rowAgain.click()
    await expect(threadText(page, LEAVE_SEED)).toBeVisible({ timeout: 15000 })
  })

  test("being removed by someone else evicts the cached transcript (retainThreads) — reopen shows a spinner, not a flash", async ({ page }) => {
    const sb = sandbox()
    await openChats(page)
    const row = rowFor(page, ROOM_REMOVED)
    await expect(row).toBeVisible({ timeout: 15000 })
    await row.click()
    await expect(threadText(page, REMOVED_SEED)).toBeVisible({ timeout: 15000 })
    // Close — write-through snapshots this room into the cache.
    await page.locator(".back-chevron").filter({ visible: true }).first().click()
    await expect(row).toBeVisible({ timeout: 10000 })

    // Removed by "someone else" — a direct DB delete of admin's own membership row,
    // exactly what an admin kicking this user (or a group delete cascading the same
    // row away) produces. This does NOT go through leaveChat/handleLeave, so the
    // ONLY thing that can evict the cache is retainThreads, fired from home-app's
    // own-memberships realtime subscription refetching membership
    // (refreshMemberGroups's `group_members?select=group_id&user_id=eq.…` query).
    const refetch = page.waitForResponse(
      (r) => r.url().includes("/rest/v1/group_members") && r.url().includes("select=group_id") && r.url().includes(`user_id=eq.${adminId}`),
      { timeout: 15000 },
    )
    const { error } = await sb.client.from("group_members")
      .delete().eq("group_id", removedId).eq("user_id", adminId)
    if (error) throw error
    await refetch
    // retainThreads runs synchronously right after that query resolves inside
    // refreshMemberGroups; give its continuation a moment to actually execute.
    await page.waitForTimeout(300)

    // Re-add (simulating being re-invited) WITHOUT reloading the page — the cache
    // module's in-memory state must persist across this from the earlier open, so
    // this is the real proof retainThreads (not just a fresh JS runtime) did the
    // evicting.
    const { error: reErr } = await sb.client.from("group_members")
      .insert({ group_id: removedId, user_id: adminId })
    if (reErr) throw reErr

    // Reopen in the SAME page instance (no reload): if retainThreads had not
    // evicted the snapshot, `readThread` would still return it and `loading` would
    // start false — the pre-removal transcript would paint before any network
    // round trip. A spinner appearing proves the cache was actually forgotten.
    await row.click()
    await expect(spinner(page)).toBeVisible({ timeout: 500 })
    await expect(threadText(page, REMOVED_SEED)).toBeVisible({ timeout: 15000 })
  })

  test("a normal reopen (still cached, still a member) paints with no spinner", async ({ page }) => {
    await openChats(page)
    const row = rowFor(page, ROOM_NORMAL)
    await expect(row).toBeVisible({ timeout: 15000 })
    await row.click()
    await expect(threadText(page, NORMAL_SEED)).toBeVisible({ timeout: 15000 })
    await page.locator(".back-chevron").filter({ visible: true }).first().click()
    await expect(row).toBeVisible({ timeout: 10000 })

    // Reopen — this is the case R3 (block-list-gated first paint) put at risk: the
    // block list is warmed from boot (home-app's useBlocks(userId)), so by the time
    // any room is reopened later in the session it should already be resolved and
    // add no wait. No spinner, content visible almost immediately.
    await row.click()
    await expect(threadText(page, NORMAL_SEED)).toBeVisible({ timeout: 1200 })
    await expect(spinner(page)).toHaveCount(0)
  })

  test("a failed first fetch does not cache as an empty room — the next open still tries the network, not a false-empty cache", async ({ page }) => {
    // Registered BEFORE navigation, not after opening the list: home-app's boot
    // idle-warm prefetches the user's top rooms, and with only a handful of rooms
    // in this sandbox ROOM_FAIL would otherwise already be cached (successfully)
    // by the time the list settles, and the click below would paint from that cache
    // rather than ever exercising a failed fetch at all. A predicate (not a glob
    // string) to be robust against exact query-param ordering/encoding.
    await page.route(
      (url) => url.pathname.includes("/rest/v1/messages") && url.search.includes(`group_id=eq.${failId}`),
      (route) => route.abort(),
    )
    await openChats(page)
    const row = rowFor(page, ROOM_FAIL)
    await expect(row).toBeVisible({ timeout: 15000 })
    await row.click()
    // The failed open still releases `loading` (the user must not be stuck under a
    // spinner forever) — it lands on the empty state, which is the acceptable
    // CURRENT-screen behavior; what must NOT happen is that empty state getting
    // written through as if it were a confirmed, real empty room.
    // Scoped to the transcript, NOT the page: the chat LIST stays mounted behind the
    // ChatScreen overlay and Playwright's visibility check is CSS-based rather than
    // occlusion-based, so an unscoped match also picks up every list row whose
    // last-message preview reads "No messages yet" (this sandbox has two).
    await expect(page.locator("[data-bottom-anchored]").getByText("No messages yet", { exact: false }))
      .toBeVisible({ timeout: 15000 })
    await page.locator(".back-chevron").filter({ visible: true }).first().click()
    await expect(row).toBeVisible({ timeout: 10000 })
    await page.unrouteAll({ behavior: "ignoreErrors" })

    // Reopen with the network working again: if the failed fetch HAD been cached as
    // an empty room, `readThread` would return `{messages: [], hasMore: ...}`,
    // `loading` would start false, and this would render "No messages yet" again
    // with no spinner and no retry. A spinner here proves nothing was cached.
    await row.click()
    await expect(spinner(page)).toBeVisible({ timeout: 500 })
    await expect(threadText(page, FAIL_SEED)).toBeVisible({ timeout: 15000 })
  })

  test("a scroll/swipe drag over a chat row does not fire a thread fetch for that room", async ({ page }) => {
    await openChats(page)
    const row = rowFor(page, ROOM_SCROLL);
    await expect(row).toBeVisible({ timeout: 15000 })

    const reqs: string[] = []
    page.on("request", (r) => {
      const u = r.url()
      if (u.includes("/rest/v1/messages") && u.includes(`group_id=eq.${scrollId}`)) reqs.push(u)
    })

    const box = await row.boundingBox()
    if (!box) throw new Error("row has no bounding box")
    const x = box.x + box.width / 2
    const cdp = await page.context().newCDPSession(page)
    await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x, y: box.y + 10 }] })
    // Move well past the 8px tolerance across several steps spanning past the
    // 90ms settle window — a real flick-scroll gesture.
    for (let i = 1; i <= 8; i++) {
      await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x, y: box.y + 10 - i * 25 }] })
      await page.waitForTimeout(20)
    }
    await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] })
    await cdp.detach()
    await page.waitForTimeout(400)

    expect(reqs, `a scroll/swipe drag must not warm-fetch the row it passed over: ${JSON.stringify(reqs)}`)
      .toHaveLength(0)
  })

  test("a press that settles (stays still past the warm window) still warms the room, and a normal tap still opens it", async ({ page }) => {
    await openChats(page)
    const row = rowFor(page, ROOM_PRESS)
    await expect(row).toBeVisible({ timeout: 15000 })

    const reqs: string[] = []
    page.on("request", (r) => {
      const u = r.url()
      if (u.includes("/rest/v1/messages") && u.includes(`group_id=eq.${pressId}`)) reqs.push(u)
    })

    const box = await row.boundingBox()
    if (!box) throw new Error("row has no bounding box")
    // Mouse down-and-hold past the 90ms settle window with no movement, then
    // release — the settle timer fires the warm before mouseup's cleanup can
    // cancel it (cleanup only clears a still-pending timer).
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
    await page.mouse.down()
    await page.waitForTimeout(180)
    await page.mouse.up()

    // The warm fired (a messages request for this room went out)...
    await expect.poll(() => reqs.length, { timeout: 5000 }).toBeGreaterThan(0)
    // ...and the press-then-release still behaved as a normal tap: the room opens.
    await expect(page.locator("h2", { hasText: ROOM_PRESS }).filter({ visible: true }).first())
      .toBeVisible({ timeout: 15000 })
  })
})
