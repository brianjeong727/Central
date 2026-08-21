// Regression + click-through coverage for the reaction chat-list PREVIEW
// grammar, sort, unread-isolation, cross-surface parity, SSR/hydration parity
// and live realtime update (commit 3706108, feat/reaction-details-preview-push).
// Desktop (1440) only — mobile (390) interaction coverage lives in the sibling
// e2e/chat-reaction-details.mobile.spec.ts; the hover/focus tooltip and the
// click-toggle regression it guards live in e2e/chat-reaction-tooltip.spec.ts.
//
// Second pass: the author-case grammar narrowed from a blanket "your message"
// to "your photo" / "your file" / "your poll" / "your message" depending on
// the reacted-to message's shape. The Brian's-Sandbox fixtures named in the
// dispatch are all TEXT messages, so the attachment/poll cases are exercised
// against seeded fixtures here instead.
import { test, expect, type Page } from "@playwright/test"
import { createClient } from "@supabase/supabase-js"
import ws from "ws"
import { sandbox, E2E_PREFIX, adminState } from "./fixtures"

test.use({ storageState: adminState, viewport: { width: 1440, height: 900 } })

const PREFIX = `${E2E_PREFIX}rxprev `
const GROUP_A = `${PREFIX}A your-message` // author-case: viewer is the message author
const GROUP_B = `${PREFIX}B you-reacted`  // "You" case: viewer is the reactor
const GROUP_C = `${PREFIX}C other-actor`  // third-party reacts to someone else's message
const GROUP_D = `${PREFIX}D sort-baseline`
const GROUP_E = `${PREFIX}E your-photo`
const GROUP_F = `${PREFIX}F your-file`
const GROUP_G = `${PREFIX}G your-poll`

const TEXT_B = "grammar test B content" // <=40 chars: no truncation ellipsis
const TEXT_C = "grammar test C content"

let adminId = ""
let memberId = ""
let ghost1Id = "" // Grace Lee
let groupAId = ""
let groupBId = ""
let groupCId = ""
let groupDId = ""
let msgAId = ""
let msgBId = ""
let msgCId = ""

// A signed-in (non-service-role) client for `adminId`, built via a magic-link +
// verifyOtp round trip against the service-role admin API — no password needed,
// and it never leaves the E2E sandbox ministry. Used only for a hard-number DB
// check (unread_count) that the DOM doesn't expose a reliable selector for.
async function signInAsAdminEmail(): Promise<ReturnType<typeof createClient>> {
  // A SEPARATE service-role client, isolated from sandbox().client — verifyOtp
  // below sets a real user session on whatever client instance it runs on, and
  // sandbox().client is a process-wide SINGLETON every other sandbox() helper
  // reuses. Calling verifyOtp on that shared instance would silently demote it
  // from service-role to a normal user session for the rest of the suite.
  const authClient = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { autoRefreshToken: false, persistSession: false },
    realtime: { transport: ws as never },
  })
  const { data: link, error: linkErr } = await authClient.auth.admin.generateLink({
    type: "magiclink",
    email: process.env.E2E_ADMIN_EMAIL!,
  })
  if (linkErr) throw linkErr
  const tokenHash = link.properties?.hashed_token
  const { data: verified, error: verErr } = await authClient.auth.verifyOtp({ type: "magiclink", token_hash: tokenHash! })
  if (verErr) throw verErr
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    auth: { persistSession: false },
    realtime: { transport: ws as never },
    global: { headers: { Authorization: `Bearer ${verified.session!.access_token}` } },
  })
}

// The row's preview text as rendered in the Messages list (chat-list-view.tsx
// desktop ChatGroupCard). Scoped to the visible desktop half of the row so a
// hidden mobile-styled duplicate can't double-match.
const desktopPreview = (page: Page, groupName: string) =>
  page.locator("button", { hasText: groupName }).locator(".md\\:flex").filter({ visible: true }).first()

test.describe("reaction chat-list preview — desktop (1440) grammar, sort, unread, parity", () => {
  test.describe.configure({ timeout: 120000 })

  test.beforeAll(async () => {
    const sb = sandbox()
    adminId = await sb.adminUserId()
    memberId = await sb.memberUserId()
    const { data: ghosts } = await sb.client.from("profiles").select("id, name").eq("ministry_id", sb.ministryId).eq("name", "Grace Lee")
    ghost1Id = (ghosts ?? [])[0]?.id ?? ""
    if (!ghost1Id) throw new Error("expected sandbox.test ghost profile Grace Lee not found")

    await sb.deleteGroupsByPrefix(PREFIX)

    // Group A — author case: admin sends, ghost1 reacts. Text is ALSO present,
    // proving the author case wins over echoing the text back.
    const groupA = await sb.createGroup({ name: GROUP_A, memberIds: [adminId, ghost1Id] })
    groupAId = groupA.id
    const msgA = await sb.insertMessage({ groupId: groupAId, senderId: adminId, content: "this text must not appear in the preview" })
    msgAId = msgA.id

    // Group B — "You" case: member sends text, admin (viewer) reacts.
    const groupB = await sb.createGroup({ name: GROUP_B, memberIds: [adminId, memberId] })
    groupBId = groupB.id
    const msgB = await sb.insertMessage({ groupId: groupBId, senderId: memberId, content: TEXT_B })
    msgBId = msgB.id

    // Group C — third-party case: member sends text, ghost1 (not the viewer,
    // not the author) reacts.
    const groupC = await sb.createGroup({ name: GROUP_C, memberIds: [adminId, memberId, ghost1Id] })
    groupCId = groupC.id
    const msgC = await sb.insertMessage({ groupId: groupCId, senderId: memberId, content: TEXT_C })
    msgCId = msgC.id

    // Group D — sort baseline: a plain message sent AFTER C's message but with
    // no reaction. C's reaction (inserted below, timestamped after D's message)
    // must still sort C above D.
    const groupD = await sb.createGroup({ name: GROUP_D, memberIds: [adminId, memberId] })
    groupDId = groupD.id
    await sb.insertMessage({ groupId: groupDId, senderId: memberId, content: "sort baseline message, no reaction" })

    // Groups E/F/G — author case narrowed to the message's SHAPE (your photo /
    // your file / your poll), not flattened to "your message". Brian's Sandbox
    // only has text fixtures, so these are seeded directly (insertMessage has
    // no attachment/poll params).
    const groupE = await sb.createGroup({ name: GROUP_E, memberIds: [adminId, memberId] })
    const { data: msgEData, error: eErr } = await sb.client.from("messages")
      .insert({ group_id: groupE.id, sender_id: adminId, content: "", message_type: "text", attachment_type: "image/jpeg", attachment_url: "https://example.com/fake.jpg" })
      .select("id").single()
    if (eErr) throw eErr
    const msgEId = (msgEData as { id: string }).id

    const groupF = await sb.createGroup({ name: GROUP_F, memberIds: [adminId, memberId] })
    const { data: msgFData, error: fErr } = await sb.client.from("messages")
      .insert({ group_id: groupF.id, sender_id: adminId, content: "", message_type: "text", attachment_type: "application/pdf", attachment_url: "https://example.com/fake.pdf", attachment_name: "notes.pdf" })
      .select("id").single()
    if (fErr) throw fErr
    const msgFId = (msgFData as { id: string }).id

    const groupG = await sb.createGroup({ name: GROUP_G, memberIds: [adminId, memberId] })
    const { data: pollData, error: pollErr } = await sb.client.from("polls")
      .insert({ group_id: groupG.id, question: "Which night?", options: ["Tue", "Wed"], created_by: adminId })
      .select("id").single()
    if (pollErr) throw pollErr
    const { data: msgGData, error: gErr } = await sb.client.from("messages")
      .insert({ group_id: groupG.id, sender_id: adminId, content: "", message_type: "poll", poll_id: (pollData as { id: string }).id })
      .select("id").single()
    if (gErr) throw gErr
    const msgGId = (msgGData as { id: string }).id

    // Reactions, all timestamped strictly after every message above.
    const now = Date.now()
    const { error: rxErr } = await sb.client.from("message_reactions").insert([
      { message_id: msgAId, user_id: ghost1Id, emoji: "👍", group_id: groupAId, created_at: new Date(now + 1000).toISOString() },
      { message_id: msgBId, user_id: adminId, emoji: "❤️", group_id: groupBId, created_at: new Date(now + 2000).toISOString() },
      { message_id: msgCId, user_id: ghost1Id, emoji: "😂", group_id: groupCId, created_at: new Date(now + 3000).toISOString() },
      { message_id: msgEId, user_id: memberId, emoji: "👍", group_id: groupE.id, created_at: new Date(now + 4000).toISOString() },
      { message_id: msgFId, user_id: memberId, emoji: "👍", group_id: groupF.id, created_at: new Date(now + 5000).toISOString() },
      { message_id: msgGId, user_id: memberId, emoji: "👍", group_id: groupG.id, created_at: new Date(now + 6000).toISOString() },
    ])
    if (rxErr) throw rxErr
  })

  test.afterAll(async () => {
    await sandbox().deleteGroupsByPrefix(PREFIX)
  })

  test("grammar: author-case wins over text, 'You' for the viewer-as-reactor, third-party actor names quoted text", async ({ page }) => {
    await page.goto("/home?tab=chats&chats=my")
    await page.waitForLoadState("networkidle")

    await expect(desktopPreview(page, GROUP_A)).toContainText("reacted 👍 to your message", { timeout: 15000 })
    await expect(desktopPreview(page, GROUP_A)).not.toContainText("this text must not appear")

    await expect(desktopPreview(page, GROUP_B)).toContainText(`You reacted ❤️ to "${TEXT_B}"`)

    const ghost1Name = "Grace Lee"
    await expect(desktopPreview(page, GROUP_C)).toContainText(`${ghost1Name} reacted 😂 to "`)
  })

  test("grammar: the narrowed author case says 'your photo' / 'your file' / 'your poll', not a flattened 'your message'", async ({ page }) => {
    await page.goto("/home?tab=chats&chats=my")
    await page.waitForLoadState("networkidle")

    await expect(desktopPreview(page, GROUP_E)).toContainText("reacted 👍 to your photo", { timeout: 15000 })
    await expect(desktopPreview(page, GROUP_F)).toContainText("reacted 👍 to your file")
    await expect(desktopPreview(page, GROUP_G)).toContainText("reacted 👍 to your poll")
    // None of these collapse to the generic phrase now that the shape is known.
    await expect(desktopPreview(page, GROUP_E)).not.toContainText("to your message")
    await expect(desktopPreview(page, GROUP_F)).not.toContainText("to your message")
    await expect(desktopPreview(page, GROUP_G)).not.toContainText("to your message")
  })

  test("sort: the group whose reaction is newest sorts above a group with a newer plain message but no reaction", async ({ page }) => {
    await page.goto("/home?tab=chats&chats=my")
    await page.waitForLoadState("networkidle")
    const rows = page.locator('button:has-text("' + PREFIX + '")').filter({ visible: true })
    const texts = await rows.allTextContents()
    const idxC = texts.findIndex((t) => t.includes(GROUP_C))
    const idxD = texts.findIndex((t) => t.includes(GROUP_D))
    expect(idxC).toBeGreaterThan(-1)
    expect(idxD).toBeGreaterThan(-1)
    expect(idxC).toBeLessThan(idxD)
  })

  test("unread: a reaction never increments the unread count", async ({ page }) => {
    const sb = sandbox()
    const adminClient = await signInAsAdminEmail()

    const before = await adminClient.rpc("get_chat_list", { p_user_id: adminId, p_ministry_id: sb.ministryId })
    const rowBefore = ((before.data ?? []) as { group_id: string; unread_count: number }[]).find((r) => r.group_id === groupBId)
    expect(rowBefore, "group B row not found in get_chat_list before").toBeTruthy()
    const unreadBefore = rowBefore!.unread_count

    // A second reaction from the member on the same message — must not move
    // unread_count for admin (the viewer here), which a message would.
    await sb.client.from("message_reactions").insert({
      message_id: msgBId, user_id: memberId, emoji: "🙏", group_id: groupBId,
    })

    const after = await adminClient.rpc("get_chat_list", { p_user_id: adminId, p_ministry_id: sb.ministryId })
    const rowAfter = ((after.data ?? []) as { group_id: string; unread_count: number }[]).find((r) => r.group_id === groupBId)
    expect(rowAfter!.unread_count).toBe(unreadBefore)
  })

  test("Home recent-chats strip shows the identical sentence as the Messages list", async ({ page }) => {
    // Bump group B's reaction to be the most recent event in the whole tenant so
    // it's virtually guaranteed to land in the Home strip's top-3 slice.
    const sb = sandbox()
    const { error } = await sb.client
      .from("message_reactions")
      .update({ created_at: new Date().toISOString() })
      .eq("message_id", msgBId)
      .eq("user_id", adminId)
    if (error) throw error

    await page.goto("/home?tab=home")
    await page.waitForLoadState("networkidle")
    const strip = page.locator("button", { hasText: GROUP_B }).filter({ visible: true }).first()
    await expect(strip).toBeVisible({ timeout: 15000 })
    await expect(strip).toContainText(`You reacted ❤️ to "${TEXT_B}"`)
  })

  test("SSR boot emits the same sentence as the client — no post-hydration reshuffle", async ({ page }) => {
    // Fetch the raw server-rendered HTML (page.request shares the authenticated
    // cookie jar with the browser context) — proves the SSR boot (app/home/
    // page.tsx) emitted the correct string, not just the client fetcher.
    const res = await page.request.get("/home?tab=chats&chats=my")
    expect(res.status()).toBe(200)
    const html = await res.text()
    expect(html).toContain("reacted 👍 to your message")

    // Then a real navigation must show the identical string with no flash.
    await page.goto("/home?tab=chats&chats=my")
    await expect(desktopPreview(page, GROUP_A)).toContainText("reacted 👍 to your message", { timeout: 10000 })
  })

  test("live update: inserting a reaction moves the row and updates the preview without a manual refresh, and deleting it reverts", async ({ page }) => {
    const sb = sandbox()
    await page.goto("/home?tab=chats&chats=my")
    await page.waitForLoadState("networkidle")

    // Baseline: group D currently shows its plain-message preview.
    await expect(desktopPreview(page, GROUP_D)).toContainText("sort baseline message")

    // Insert a fresh reaction on group D's message OUT OF BAND (bypassing the
    // client entirely, the way a second device would).
    const { data: dMsgs } = await sb.client.from("messages").select("id").eq("group_id", groupDId).limit(1)
    const dMsgId = (dMsgs as { id: string }[])[0].id
    const { data: liveRx, error: liveErr } = await sb.client
      .from("message_reactions")
      .insert({ message_id: dMsgId, user_id: ghost1Id, emoji: "🔥", group_id: groupDId })
      .select("id")
      .single()
    if (liveErr) throw liveErr

    await expect(desktopPreview(page, GROUP_D)).toContainText("reacted 🔥 to", { timeout: 30000 })

    // Delete it — the preview must REVERT to the plain message, live.
    await sb.client.from("message_reactions").delete().eq("id", (liveRx as { id: string }).id)
    await expect(desktopPreview(page, GROUP_D)).toContainText("sort baseline message", { timeout: 30000 })
    await expect(desktopPreview(page, GROUP_D)).not.toContainText("reacted 🔥")
  })
})
