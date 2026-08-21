// A read receipt marks how far someone has read — under WHATEVER message that is.
//
// The map was built from `messages.filter(m => m.sender_id === userId)`, so a
// receipt could only ever land on one of the VIEWER'S OWN messages. In a group
// the newest messages are usually not yours, so the common case produced no
// receipt anywhere and the feature read as "nobody has seen this". Read state was
// never about who read your messages; it is how far each person has got
// (Messenger's arrangement, which is what Brian asked for).
//
// Both cases below are chosen to DISCRIMINATE: case 1 has no own messages at all
// (old behaviour: nothing rendered anywhere), case 2 has an own message EARLIER
// than the reader's position (old behaviour: the chip pinned to that older own
// message instead of where they actually got to).
import { test, expect, type Page } from "@playwright/test"
import { sandbox, E2E_PREFIX, adminState } from "./fixtures"

test.use({ storageState: adminState, viewport: { width: 1440, height: 900 } })

const PREFIX = `${E2E_PREFIX}rcpt `

/** The "Read by …" chips sitting on ONE message's row. */
async function chipsOn(page: Page, messageId: string): Promise<string[]> {
  return page.evaluate((id) => {
    const bubble = document.querySelector(`[data-message-bubble="${id}"]`)
    if (!bubble) return ["__NO_SUCH_MESSAGE__"]
    let n: Element | null = bubble.parentElement
    for (let i = 0; i < 8 && n; i++, n = n.parentElement) {
      // Once an ancestor swallows a second bubble we have left this message's row.
      if (n.querySelectorAll("[data-message-bubble]").length > 1) break
      const chips = Array.from(n.querySelectorAll('[title^="Read by "]'))
      if (chips.length) return chips.map((c) => c.getAttribute("title") ?? "")
    }
    return []
  }, messageId)
}

test.describe("read receipts sit under the last message each person read", () => {
  let adminId = ""
  let memberId = ""
  let memberName = ""
  let ghostId = ""
  const groupIds: string[] = []

  async function makeChat(name: string, lines: { from: "ghost" | "admin"; text: string }[]) {
    const sb = sandbox()
    const { data: g } = await sb.client.from("groups").insert({
      name: `${PREFIX}${name}`, type: "my", ministry_id: sb.ministryId, created_by: adminId,
    }).select("id").single()
    const groupId = (g as { id: string }).id
    groupIds.push(groupId)
    await sb.client.from("group_members").insert(
      [adminId, memberId, ghostId].map((u) => ({ group_id: groupId, user_id: u })),
    )
    const base = Date.now() - 60 * 60 * 1000
    const rows = lines.map((l, i) => ({
      group_id: groupId,
      sender_id: l.from === "admin" ? adminId : ghostId,
      content: l.text,
      message_type: "text",
      created_at: new Date(base + i * 60_000).toISOString(),
    }))
    const { data: msgs, error } = await sb.client.from("messages").insert(rows).select("id, content, created_at")
    if (error) throw error
    return { groupId, msgs: msgs as { id: string; content: string; created_at: string }[] }
  }

  /** Park the member's read position exactly at `stamp`. */
  async function setMemberReadTo(groupId: string, stamp: string) {
    await sandbox().client.from("group_members")
      .update({ last_read_at: stamp }).eq("group_id", groupId).eq("user_id", memberId)
  }

  test.beforeAll(async () => {
    const sb = sandbox()
    adminId = await sb.adminUserId()
    memberId = await sb.memberUserId()
    memberName = await sb.memberName()
    const { data: ghost } = await sb.client.from("profiles").select("id")
      .eq("ministry_id", sb.ministryId).not("id", "in", `(${adminId},${memberId})`).limit(1).maybeSingle()
    ghostId = (ghost as { id: string } | null)?.id ?? ""
    // Clean any leftovers from a previous run before seeding.
    const { data: old } = await sb.client.from("groups").select("id")
      .eq("ministry_id", sb.ministryId).like("name", `${PREFIX}%`)
    for (const g of (old ?? []) as { id: string }[]) {
      await sb.client.from("messages").delete().eq("group_id", g.id)
      await sb.client.from("group_members").delete().eq("group_id", g.id)
      await sb.client.from("groups").delete().eq("id", g.id)
    }
  })

  test.afterAll(async () => {
    const sb = sandbox()
    for (const id of groupIds) {
      await sb.client.from("messages").delete().eq("group_id", id)
      await sb.client.from("group_members").delete().eq("group_id", id)
      await sb.client.from("groups").delete().eq("id", id)
    }
  })

  test("a chat with NO messages of your own still shows how far someone read", async ({ page }) => {
    test.skip(!ghostId, "needs a third sandbox profile")
    const { groupId, msgs } = await makeChat("theirs only", [
      { from: "ghost", text: "first of theirs" },
      { from: "ghost", text: "second of theirs" },
    ])
    // Read everything.
    await setMemberReadTo(groupId, msgs[1].created_at)

    await page.goto(`/home?tab=chats&chat=${groupId}`)
    await expect(page.locator(`[data-message-bubble="${msgs[1].id}"]`)).toBeVisible({ timeout: 20000 })
    await page.waitForTimeout(2500)

    expect(await chipsOn(page, msgs[1].id), "the reader's chip belongs on the last message they read")
      .toContain(`Read by ${memberName}`)
    expect(await chipsOn(page, msgs[0].id), "and nowhere else").toEqual([])
  })

  test("the chip tracks THEIR position, not your last message", async ({ page }) => {
    test.skip(!ghostId, "needs a third sandbox profile")
    const { groupId, msgs } = await makeChat("mixed", [
      { from: "ghost", text: "opening line" },
      { from: "admin", text: "my message in the middle" },
      { from: "ghost", text: "the newest line" },
    ])
    await setMemberReadTo(groupId, msgs[2].created_at)

    await page.goto(`/home?tab=chats&chat=${groupId}`)
    await expect(page.locator(`[data-message-bubble="${msgs[2].id}"]`)).toBeVisible({ timeout: 20000 })
    await page.waitForTimeout(2500)

    // The old build pinned this to msgs[1] — the last message the VIEWER sent at
    // or before their stamp — which is precisely the wrong answer.
    expect(await chipsOn(page, msgs[2].id)).toContain(`Read by ${memberName}`)
    expect(await chipsOn(page, msgs[1].id), "not stuck on your own earlier message").toEqual([])
  })

  test("someone who has read less sits further back", async ({ page }) => {
    test.skip(!ghostId, "needs a third sandbox profile")
    const { groupId, msgs } = await makeChat("partial", [
      { from: "ghost", text: "line one" },
      { from: "admin", text: "line two" },
      { from: "ghost", text: "line three" },
    ])
    // Parked on the FIRST message only.
    await setMemberReadTo(groupId, msgs[0].created_at)

    await page.goto(`/home?tab=chats&chat=${groupId}`)
    await expect(page.locator(`[data-message-bubble="${msgs[2].id}"]`)).toBeVisible({ timeout: 20000 })
    await page.waitForTimeout(2500)

    expect(await chipsOn(page, msgs[0].id)).toContain(`Read by ${memberName}`)
    expect(await chipsOn(page, msgs[2].id), "they have not read this far").toEqual([])
  })
})
