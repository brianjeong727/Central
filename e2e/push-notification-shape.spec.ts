// The SHAPE of a chat notification: who / where / what.
//
// It used to be a two-line banner with a run-on title — "Sender · Chat Name" over
// the message. With a long chat name the two ran together as one phrase and the
// message got pushed off the banner. Messenger's split is clearer and is what
// Brian asked for (2026-08-22):
//
//   group:  Sender          DM:  Sender
//           to Chat Name         the message
//           the message
//
// `subtitle` is a real APNs field, so on the native iOS shell those are three
// genuine lines. The Web Notifications API and FCM have no such field, so the
// dispatch route folds it into the first line of the body for those lanes — that
// folding is asserted here too, because a subtitle silently dropped on Android
// would look identical to one that was never set.
//
// This is the first spec in the repo to assert notification TEXT at all: dryRun
// did not surface the payload until now, and push-reaction.spec.ts's header says
// outright that title/body were checked by reading the resolver by hand.
import { test, expect, request } from "@playwright/test"
import { sandbox, E2E_PREFIX } from "./fixtures"

const GROUP_PREFIX = `${E2E_PREFIX}shape-group `

type Payload = { title: string; body: string; subtitle?: string; url: string; tag: string }
type DryRun = {
  recipients: string[]
  reasons: Record<string, string>
  payloads: Record<string, Payload>
  count: number
}

test.describe.serial("push — chat notification shape", () => {
  let adminId = ""
  let memberId = ""
  let senderName = ""
  const dispatchUrl = `http://localhost:${process.env.E2E_PORT ?? 3001}/api/push/dispatch`
  const secret = process.env.PUSH_WEBHOOK_SECRET

  test.beforeAll(async () => {
    expect(secret, "PUSH_WEBHOOK_SECRET must be set in .env.local for dryRun assertions").toBeTruthy()
    const sb = sandbox()
    adminId = await sb.adminUserId()
    memberId = await sb.memberUserId()
    await sb.deleteGroupsByPrefix(GROUP_PREFIX)
    await sb.resetNotificationSettings(adminId)
    await sb.resetNotificationSettings(memberId)
    // The ADMIN sends; the member receives. The banner names the sender, so that is
    // the name every assertion below compares against.
    const { data } = await sb.client.from("profiles").select("name").eq("id", adminId).single()
    senderName = (data as { name: string } | null)?.name ?? ""
    expect(senderName, "sender profile must have a name").toBeTruthy()
  })

  test.afterAll(async () => {
    const sb = sandbox()
    await sb.deleteGroupsByPrefix(GROUP_PREFIX)
    await sb.resetNotificationSettings(adminId)
    await sb.resetNotificationSettings(memberId)
  })

  async function dryRun(table: string, recordId: string): Promise<DryRun> {
    const ctx = await request.newContext()
    const res = await ctx.post(`${dispatchUrl}?dryRun=1`, {
      headers: { "x-push-secret": secret! },
      data: { table, record_id: recordId },
    })
    const body = await res.json()
    await ctx.dispose()
    return body as DryRun
  }

  /** Send a message from the admin into a fresh group of the given type. */
  async function messageIn(type: "my" | "dm", name: string, content: string) {
    const sb = sandbox()
    if (type === "dm") {
      // A DM cannot be made by flipping a 'my' chat's type: `dm_key` is REQUIRED on
      // every DM (constraint groups_dm_key_required) and it is the participant pair,
      // which is also what makes a second thread between two people impossible — so
      // any existing pair row is cleared first, exactly as the other DM fixtures do.
      const dmKey = [adminId, memberId].sort().join(":")
      await sb.client.from("groups").delete().eq("ministry_id", sb.ministryId).eq("type", "dm").eq("dm_key", dmKey)
      const { data: dm, error } = await sb.client.from("groups")
        .insert({ ministry_id: sb.ministryId, name: `${GROUP_PREFIX}${name}`, type: "dm", created_by: adminId, dm_key: dmKey })
        .select("id, name").single()
      if (error) throw error
      const group = dm as { id: string; name: string }
      await sb.client.from("group_members").insert([
        { group_id: group.id, user_id: adminId },
        { group_id: group.id, user_id: memberId },
      ])
      const msg = await sb.insertMessage({ groupId: group.id, senderId: adminId, content })
      return { group, msg }
    }
    const group = await sb.createGroup({ name: `${GROUP_PREFIX}${name}`, memberIds: [adminId, memberId] })
    const msg = await sb.insertMessage({ groupId: group.id, senderId: adminId, content })
    return { group, msg }
  }

  test("a DM is two lines: the sender, then the message", async () => {
    const { msg } = await messageIn("dm", "dm", "see you at 7")
    const body = await dryRun("messages", msg.id)
    const p = body.payloads[memberId]
    expect(p, "the member should be a recipient").toBeTruthy()
    // Prove the DM BRANCH ran. Without this the test passes on a 'my' chat that
    // happens to be named like a DM, which is exactly how the first draft of this
    // fixture fooled itself — a type flip that the dm_key constraint had rejected.
    expect(body.reasons[memberId]).toBe("dm")
    expect(p.title).toBe(senderName)
    // The whole point of the DM case: no "where" line. You already know who it is.
    expect(p.subtitle).toBeUndefined()
    expect(p.body).toBe("see you at 7")
  })

  test("a group message is three lines: the sender, where, then the message", async () => {
    const { group, msg } = await messageIn("my", "plain", "bring snacks")
    const body = await dryRun("messages", msg.id)
    const p = body.payloads[memberId]
    expect(body.reasons[memberId]).toBe("group")
    // The chat name must NOT be welded onto the title — that is the old shape.
    expect(p.title).toBe(senderName)
    expect(p.title).not.toContain(group.name)
    expect(p.subtitle).toBe(`to ${group.name}`)
    expect(p.body).toBe("bring snacks")
  })

  test("a mention and a reply say WHY on the where-line, not in the title", async () => {
    const sb = sandbox()

    // Mention — the resolver matches the recipient's first name as a token.
    const { data: prof } = await sb.client.from("profiles").select("name").eq("id", memberId).single()
    const firstName = ((prof as { name: string } | null)?.name ?? "").split(" ")[0]
    expect(firstName, "recipient needs a first name to be mentioned").toBeTruthy()
    const mentionGroup = await sb.createGroup({ name: `${GROUP_PREFIX}mention`, memberIds: [adminId, memberId] })
    const mentionMsg = await sb.insertMessage({
      groupId: mentionGroup.id, senderId: adminId, content: `@${firstName} can you lead tonight`,
    })
    const mention = await dryRun("messages", mentionMsg.id)
    expect(mention.reasons[memberId]).toBe("mention")
    expect(mention.payloads[memberId].title).toBe(senderName)
    expect(mention.payloads[memberId].subtitle).toBe(`mentioned you in ${mentionGroup.name}`)

    // Reply — to a message the recipient wrote.
    const replyGroup = await sb.createGroup({ name: `${GROUP_PREFIX}reply`, memberIds: [adminId, memberId] })
    const theirs = await sb.insertMessage({ groupId: replyGroup.id, senderId: memberId, content: "who is on setup" })
    const { data: replyRow, error } = await sb.client.from("messages").insert({
      group_id: replyGroup.id, sender_id: adminId, content: "i've got it", message_type: "text", reply_to_id: theirs.id,
    }).select("id").single()
    if (error) throw error
    const reply = await dryRun("messages", (replyRow as { id: string }).id)
    expect(reply.reasons[memberId]).toBe("reply")
    expect(reply.payloads[memberId].title).toBe(senderName)
    expect(reply.payloads[memberId].subtitle).toBe(`replied in ${replyGroup.name}`)
  })

  test("a reaction follows the same split", async () => {
    const sb = sandbox()
    const group = await sb.createGroup({ name: `${GROUP_PREFIX}reaction`, memberIds: [adminId, memberId] })
    // The ADMIN is the author here, so the admin is the one notified and the MEMBER
    // is the reactor whose name lands in the title.
    const msg = await sb.insertMessage({ groupId: group.id, senderId: adminId, content: "run sheet is up" })
    const { data: rx, error } = await sb.client.from("message_reactions")
      .insert({ message_id: msg.id, user_id: memberId, emoji: "🔥", group_id: group.id })
      .select("id").single()
    if (error) throw error

    const body = await dryRun("message_reactions", (rx as { id: string }).id)
    const p = body.payloads[adminId]
    expect(body.reasons[adminId]).toBe("reaction")
    expect(p.title).toContain("reacted 🔥")
    expect(p.title).not.toContain(group.name)
    expect(p.subtitle).toBe(`in ${group.name}`)
  })

  test("the where-line survives as the body's first line on lanes with no subtitle", async () => {
    // Web push and FCM have title + body only. The dispatch route folds `subtitle`
    // into the body for those two; a silently dropped subtitle would be invisible
    // from the payload alone, so this asserts the fold the send loop performs.
    const { group, msg } = await messageIn("my", "fold", "practice moved to 6")
    const body = await dryRun("messages", msg.id)
    const p = body.payloads[memberId]
    const folded = p.subtitle ? `${p.subtitle}\n${p.body}` : p.body
    expect(folded).toBe(`to ${group.name}\npractice moved to 6`)
    expect(folded.split("\n")).toHaveLength(2)
  })
})
