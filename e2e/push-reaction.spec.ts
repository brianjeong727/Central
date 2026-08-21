// Recipient-resolution coverage for resolveReaction (commit 7d3c84c,
// feat/reaction-details-preview-push) — /api/push/dispatch's message_reactions
// branch. Mirrors e2e/push.spec.ts's dryRun pattern.
//
// dryRun does not surface payload (title/body/tag) — no existing push spec in
// this codebase asserts on it either (see push-v2.spec.ts / push-v2b.spec.ts).
// `reason` IS surfaced and is asserted below; title/body/tag were verified by
// reading app/api/push/dispatch/route.ts's resolveReaction directly (see the
// test report) rather than through this harness.
import { test, expect, request } from "@playwright/test"
import { sandbox, E2E_PREFIX } from "./fixtures"

const GROUP_PREFIX = `${E2E_PREFIX}rxpush-group `

test.describe.serial("push v2 — reaction recipient resolution (resolveReaction)", () => {
  let adminId: string
  let memberId: string
  const dispatchUrl = `http://localhost:${process.env.E2E_PORT ?? 3001}/api/push/dispatch`
  const secret = process.env.PUSH_WEBHOOK_SECRET

  test.beforeAll(async () => {
    expect(secret, "PUSH_WEBHOOK_SECRET must be set in .env.local to run dryRun assertions").toBeTruthy()
    const sb = sandbox()
    adminId = await sb.adminUserId()
    memberId = await sb.memberUserId()
    await sb.deleteGroupsByPrefix(GROUP_PREFIX)
    await sb.resetNotificationSettings(adminId)
  })

  test.afterAll(async () => {
    const sb = sandbox()
    await sb.deleteGroupsByPrefix(GROUP_PREFIX)
    await sb.resetNotificationSettings(adminId)
  })

  async function dryRunReaction(rxId: string) {
    const ctx = await request.newContext()
    const res = await ctx.post(`${dispatchUrl}?dryRun=1`, {
      headers: { "x-push-secret": secret! },
      data: { table: "message_reactions", record_id: rxId },
    })
    const body = await res.json()
    await ctx.dispose()
    return body as { recipients: string[]; reasons: Record<string, string>; count: number }
  }

  test("recipient is the MESSAGE AUTHOR only — never the reactor, never other members", async () => {
    const sb = sandbox()
    const group = await sb.createGroup({ name: `${GROUP_PREFIX}author-only`, memberIds: [adminId, memberId] })
    const msg = await sb.insertMessage({ groupId: group.id, senderId: adminId, content: "author-only test" })
    const { data: rx, error } = await sb.client.from("message_reactions")
      .insert({ message_id: msg.id, user_id: memberId, emoji: "👍", group_id: group.id })
      .select("id").single()
    if (error) throw error

    const body = await dryRunReaction((rx as { id: string }).id)
    expect(body.count).toBe(1)
    expect(body.recipients).toEqual([adminId])
    expect(body.recipients).not.toContain(memberId)
    expect(body.reasons[adminId]).toBe("reaction")
  })

  test("self-reaction resolves to no recipients", async () => {
    const sb = sandbox()
    const group = await sb.createGroup({ name: `${GROUP_PREFIX}self`, memberIds: [adminId, memberId] })
    const msg = await sb.insertMessage({ groupId: group.id, senderId: adminId, content: "self-react test" })
    const { data: rx, error } = await sb.client.from("message_reactions")
      .insert({ message_id: msg.id, user_id: adminId, emoji: "👍", group_id: group.id })
      .select("id").single()
    if (error) throw error

    const body = await dryRunReaction((rx as { id: string }).id)
    expect(body.count).toBe(0)
    expect(body.recipients).toEqual([])
  })

  test("a deleted message resolves to no recipients", async () => {
    const sb = sandbox()
    const group = await sb.createGroup({ name: `${GROUP_PREFIX}deleted`, memberIds: [adminId, memberId] })
    const msg = await sb.insertMessage({ groupId: group.id, senderId: adminId, content: "will be deleted" })
    await sb.client.from("messages").update({ deleted: true }).eq("id", msg.id)
    const { data: rx, error } = await sb.client.from("message_reactions")
      .insert({ message_id: msg.id, user_id: memberId, emoji: "👍", group_id: group.id })
      .select("id").single()
    if (error) throw error

    const body = await dryRunReaction((rx as { id: string }).id)
    expect(body.count).toBe(0)
  })

  test("a system message resolves to no recipients", async () => {
    const sb = sandbox()
    const group = await sb.createGroup({ name: `${GROUP_PREFIX}system`, memberIds: [adminId, memberId] })
    const { data: sysMsg, error: msgErr } = await sb.client.from("messages")
      .insert({ group_id: group.id, sender_id: adminId, content: "system event", message_type: "system" })
      .select("id").single()
    if (msgErr) throw msgErr
    const { data: rx, error } = await sb.client.from("message_reactions")
      .insert({ message_id: (sysMsg as { id: string }).id, user_id: memberId, emoji: "👍", group_id: group.id })
      .select("id").single()
    if (error) throw error

    const body = await dryRunReaction((rx as { id: string }).id)
    expect(body.count).toBe(0)
  })

  test("an author who has left the group resolves to no recipients", async () => {
    const sb = sandbox()
    const group = await sb.createGroup({ name: `${GROUP_PREFIX}left`, memberIds: [adminId, memberId] })
    const msg = await sb.insertMessage({ groupId: group.id, senderId: adminId, content: "author will leave" })
    await sb.client.from("group_members").delete().eq("group_id", group.id).eq("user_id", adminId)
    const { data: rx, error } = await sb.client.from("message_reactions")
      .insert({ message_id: msg.id, user_id: memberId, emoji: "👍", group_id: group.id })
      .select("id").single()
    if (error) throw error

    const body = await dryRunReaction((rx as { id: string }).id)
    expect(body.count).toBe(0)
  })

  test("per-chat mute and notify_mode='off' are hard overrides", async () => {
    const sb = sandbox()
    const group = await sb.createGroup({ name: `${GROUP_PREFIX}muted`, memberIds: [adminId, memberId] })
    const msg = await sb.insertMessage({ groupId: group.id, senderId: adminId, content: "muted author test" })

    await sb.setGroupMemberMuted(group.id, adminId, true)
    const { data: rx1, error: e1 } = await sb.client.from("message_reactions")
      .insert({ message_id: msg.id, user_id: memberId, emoji: "👍", group_id: group.id })
      .select("id").single()
    if (e1) throw e1
    expect((await dryRunReaction((rx1 as { id: string }).id)).count).toBe(0)
    await sb.setGroupMemberMuted(group.id, adminId, false)

    await sb.client.from("group_members").update({ notify_mode: "off" }).eq("group_id", group.id).eq("user_id", adminId)
    const { data: rx2, error: e2 } = await sb.client.from("message_reactions")
      .insert({ message_id: msg.id, user_id: memberId, emoji: "❤️", group_id: group.id })
      .select("id").single()
    if (e2) throw e2
    expect((await dryRunReaction((rx2 as { id: string }).id)).count).toBe(0)

    // Cleared: the SAME reaction resolves normally.
    await sb.client.from("group_members").update({ notify_mode: null }).eq("group_id", group.id).eq("user_id", adminId)
    const { data: rx3, error: e3 } = await sb.client.from("message_reactions")
      .insert({ message_id: msg.id, user_id: memberId, emoji: "😂", group_id: group.id })
      .select("id").single()
    if (e3) throw e3
    const bodyCleared = await dryRunReaction((rx3 as { id: string }).id)
    expect(bodyCleared.count).toBe(1)
    expect(bodyCleared.recipients).toEqual([adminId])
  })

  test("notification_settings.reactions === false opts the author out", async () => {
    const sb = sandbox()
    const group = await sb.createGroup({ name: `${GROUP_PREFIX}optout`, memberIds: [adminId, memberId] })
    const msg = await sb.insertMessage({ groupId: group.id, senderId: adminId, content: "opted-out author test" })

    await sb.setNotificationSettings(adminId, { reactions: false })
    const { data: rx, error } = await sb.client.from("message_reactions")
      .insert({ message_id: msg.id, user_id: memberId, emoji: "👍", group_id: group.id })
      .select("id").single()
    if (error) throw error
    expect((await dryRunReaction((rx as { id: string }).id)).count).toBe(0)

    await sb.resetNotificationSettings(adminId)
  })
})
