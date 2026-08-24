// Muting a chat has to be reversible IN THE PLACE YOU LOOK FOR IT.
//
// Reported by a real user: he muted a chat with the list swipe (labelled "Mute"),
// then went to the chat's settings to undo it and found no unmute anywhere. He was
// right — mobile settings had only a row called "Notifications" reading "Off". The
// word never appeared outside the swipe, which is invisible until you swipe.
import { test, expect } from "@playwright/test"
import { sandbox, E2E_PREFIX } from "./fixtures"

const ROOM = `${E2E_PREFIX}Unmute Room`

test.describe("unmuting a chat from its settings", () => {
  let groupId = ""
  let adminId = ""

  test.beforeAll(async () => {
    const sb = sandbox()
    const db = sb.client
    adminId = await sb.adminUserId()
    await db.from("groups").delete().eq("ministry_id", sb.ministryId).like("name", `${E2E_PREFIX}Unmute%`)
    const { data: g, error } = await db.from("groups")
      .insert({ ministry_id: sb.ministryId, name: ROOM, type: "my", created_by: adminId })
      .select("id").single()
    if (error) throw new Error(`seed group: ${error.message}`)
    groupId = g!.id
    await db.from("group_members").insert({ group_id: groupId, user_id: adminId })
    await db.from("messages").insert({ group_id: groupId, sender_id: adminId, content: "E2E:: hi", message_type: "text" })
  })

  test.afterAll(async () => {
    const sb = sandbox()
    await sb.client.from("groups").delete().eq("ministry_id", sb.ministryId).like("name", `${E2E_PREFIX}Unmute%`)
  })

  test("a muted chat says so, and the switch turns it back on", async ({ page }) => {
    const sb = sandbox()
    const db = sb.client
    // Muted exactly the way the list swipe does it.
    await db.from("group_members").update({ notify_mode: "off", muted: true })
      .eq("group_id", groupId).eq("user_id", adminId)

    await page.goto(`/home?tab=chats&chat=${groupId}`)
    await page.locator("h2", { hasText: ROOM }).filter({ visible: true }).first().click({ timeout: 25000 })

    // The state is legible without drilling into anything, and in the SAME word
    // the swipe used — not "Off".
    const label = page.getByText("Mute notifications").filter({ visible: true }).first()
    await expect(label).toBeVisible({ timeout: 15000 })
    await expect(page.getByText("Muted", { exact: true }).filter({ visible: true }).first()).toBeVisible()

    // Flip it off and save. Settings stage behind Save by design (Convention #21),
    // so the write is only owed after that tap.
    const sw = page.getByRole("switch", { name: "Unmute notifications" }).filter({ visible: true }).first()
    await expect(sw, "the switch reads as UNMUTE while muted").toBeVisible()
    await sw.click()
    await page.getByRole("button", { name: /^Save/ }).filter({ visible: true }).first().click()

    await expect.poll(async () => {
      const { data } = await db.from("group_members").select("muted, notify_mode")
        .eq("group_id", groupId).eq("user_id", adminId).maybeSingle()
      return `${data?.muted}:${data?.notify_mode}`
    }, { message: "unmuting must clear both muted and notify_mode", timeout: 20000 }).toBe("false:all")
  })

  test("an unmuted chat offers muting from the same switch", async ({ page }) => {
    const sb = sandbox()
    const db = sb.client
    await db.from("group_members").update({ notify_mode: "all", muted: false })
      .eq("group_id", groupId).eq("user_id", adminId)

    await page.goto(`/home?tab=chats&chat=${groupId}`)
    await page.locator("h2", { hasText: ROOM }).filter({ visible: true }).first().click({ timeout: 25000 })
    await expect(page.getByRole("switch", { name: "Mute notifications" }).filter({ visible: true }).first())
      .toBeVisible({ timeout: 15000 })
  })
})
