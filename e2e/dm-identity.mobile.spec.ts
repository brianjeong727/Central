// DM identity — the two headline bugs, at the level they actually broke.
//
// 1. A DM has no single name. `groups.name` was written from the CREATOR's side,
//    so when A messaged B, BOTH people saw "B" as the thread title — B saw their
//    own name. get_chat_list now derives the title per viewer.
//
// 2. A DM is keyed on its PAIR (groups.dm_key, unique per ministry). The old
//    "does a DM exist?" check was a two-hop membership query, and it answered
//    "no" whenever a participant's group_members row was missing — so the caller
//    made ANOTHER DM. Three threads accumulated between one pair in production.
//    The self-heal case below reproduces that exact state.
import { test, expect, type Page } from "@playwright/test"
import { sandbox, memberState, E2E_PREFIX } from "./fixtures"

const MSG = "E2E:: dm identity first message"
// The fork needs a THIRD person — the sandbox ships with exactly two, so the
// "add someone to a DM" picker would render empty and the case would go
// unexercised. Created and torn down here (pattern: account-deletion.spec).
const THIRD_EMAIL = "e2e.dm.third@test.com"
const THIRD_NAME = `${E2E_PREFIX}Third Person`

function vis(page: Page, text: string, exact = false) {
  return page.getByText(text, { exact }).filter({ visible: true }).first()
}

test.describe("DM identity — per-viewer name + one thread per pair", () => {
  let adminId = ""
  let memberId = ""
  let adminName = ""
  let memberName = ""
  let dmKey = ""
  let dmId = ""
  let thirdId = ""
  // Groups the fork test creates. Tracked so teardown removes them even when an
  // assertion fails mid-test — an in-test delete only runs on the happy path, and
  // the leftovers then poisoned the NEXT run's "exactly one" check.
  const createdForkIds: string[] = []

  test.beforeAll(async () => {
    const sb = sandbox()
    adminId = await sb.adminUserId()
    memberId = await sb.memberUserId()
    adminName = await sb.adminName()
    memberName = await sb.memberName()
    dmKey = [adminId, memberId].sort().join(":")

    const db = sb.client
    // Start from no thread between the pair, then create exactly one the way the
    // app does — both members present, dm_key set.
    await db.from("groups").delete().eq("ministry_id", sb.ministryId).eq("type", "dm").eq("dm_key", dmKey)
    const { data: dm, error } = await db
      .from("groups")
      // name is deliberately the MEMBER's name — the creator-side value the old
      // code showed to both people. Nothing should ever render it now.
      .insert({ ministry_id: sb.ministryId, name: memberName, type: "dm", created_by: adminId, dm_key: dmKey })
      .select("id").single()
    if (error) throw error
    dmId = dm.id
    await db.from("group_members").insert([
      { group_id: dmId, user_id: adminId },
      { group_id: dmId, user_id: memberId },
    ])
    await sb.insertMessage({ groupId: dmId, senderId: adminId, content: MSG })

    // Third participant for the fork case.
    const { data: created, error: cErr } = await db.auth.admin.createUser({
      email: THIRD_EMAIL, password: "e2e-dm-third-pw", email_confirm: true,
    })
    if (cErr || !created?.user) throw new Error(`createUser failed: ${cErr?.message}`)
    thirdId = created.user.id
    await db.from("profiles").update({
      ministry_id: sb.ministryId, role: "member", name: THIRD_NAME,
      gender: "female", graduation_year: new Date().getFullYear() + 2,
    }).eq("id", thirdId)
  })

  test.afterAll(async () => {
    const sb = sandbox()
    const db = sb.client
    await sb.deleteGroupsByPrefix()
    await db.from("groups").delete().eq("ministry_id", sb.ministryId).eq("type", "dm").eq("dm_key", dmKey)
    // Forks are named from first names, so the prefix sweep above misses them.
    if (createdForkIds.length > 0) await db.from("groups").delete().in("id", createdForkIds)
    if (thirdId) {
      await db.from("profiles").delete().eq("id", thirdId)
      await db.auth.admin.deleteUser(thirdId).catch(() => {})
    }
  })

  // Brian's ask: "adding a member to a DM should not literally add them to the
  // chat, it should create a new group chat". The DM must come out UNTOUCHED —
  // same id, same two members — and the new group must hold all three.
  test("adding someone to a DM forks a new group chat and leaves the DM alone", async ({ page }) => {
    const sb = sandbox()
    const db = sb.client

    await page.goto(`/home?tab=chats&chat=${dmId}`)
    await expect(vis(page, MSG)).toBeVisible({ timeout: 15000 })
    await page.locator("h2").filter({ visible: true }).first().click()
    await vis(page, "Start a group chat").click()

    await page.getByPlaceholder("Search members…").filter({ visible: true }).first().fill("Third")
    await vis(page, THIRD_NAME).click()
    await page.getByRole("button", { name: "Create group chat" }).click()

    // Landed in the NEW chat — a group chat, named after the other participants.
    const title = page.locator("h2").filter({ visible: true }).first()
    await expect(title).not.toHaveText(memberName, { timeout: 15000 })

    // Identify the fork by its MEMBER SET, not its generated name. The name is
    // built from first names, so it neither contains a stable token nor stays
    // unique across runs — matching on it made this assertion depend on leftover
    // fixtures from previous runs rather than on what the fork actually did.
    const thirdsGroups = await db
      .from("group_members").select("group_id, groups!inner(id, type, ministry_id)")
      .eq("user_id", thirdId).eq("groups.type", "my").eq("groups.ministry_id", sb.ministryId)
    const candidateIds = (thirdsGroups.data ?? []).map((r) => r.group_id as string)
    expect(candidateIds.length, "the third person should be in exactly one forked group").toBe(1)
    const forkId = candidateIds[0]
    createdForkIds.push(forkId)
    const forkMembers = await db.from("group_members").select("user_id").eq("group_id", forkId)
    expect(new Set((forkMembers.data ?? []).map((m) => m.user_id)))
      .toEqual(new Set([adminId, memberId, thirdId]))

    // The DM is untouched: same row, still exactly the two of them.
    const dmAfter = await db.from("group_members").select("user_id").eq("group_id", dmId)
    expect(new Set((dmAfter.data ?? []).map((m) => m.user_id))).toEqual(new Set([adminId, memberId]))
    const dmCount = await db
      .from("groups").select("id")
      .eq("ministry_id", sb.ministryId).eq("type", "dm").eq("dm_key", dmKey)
    expect(dmCount.data).toHaveLength(1)

  })

  // The admin created the thread, so the STORED name is already correct for them
  // — this side passed even with the bug. It is here as the control.
  test("the sender sees the recipient's name", async ({ page }) => {
    await page.goto(`/home?tab=chats&chat=${dmId}`)
    await expect(vis(page, MSG)).toBeVisible({ timeout: 15000 })
    await expect(page.locator("h2", { hasText: memberName }).filter({ visible: true }).first()).toBeVisible()
  })

  // The bug: this side rendered the stored name, so the recipient saw THEMSELVES
  // as the conversation title.
  test.describe("as the recipient", () => {
    test.use({ storageState: memberState })

    test("the recipient sees the SENDER's name, not their own", async ({ page }) => {
      await page.goto(`/home?tab=chats&chat=${dmId}`)
      await expect(vis(page, MSG)).toBeVisible({ timeout: 15000 })
      const title = page.locator("h2").filter({ visible: true }).first()
      await expect(title).toHaveText(adminName)
      await expect(title).not.toHaveText(memberName)
    })
  })

  // The production failure, reproduced end-to-end. The recipient's membership row
  // is gone — the state "Leave chat" left behind, which is why their DM push went
  // silent and why the other side kept minting new threads. Messaging that person
  // again must REPAIR the existing thread, not create a second one.
  test.describe("after the recipient's membership row is lost", () => {
    test.use({ storageState: memberState })

    test("messaging again heals the thread instead of spawning a duplicate", async ({ page }) => {
      const sb = sandbox()
      const db = sb.client
      await db.from("group_members").delete().eq("group_id", dmId).eq("user_id", memberId)
      const broken = await db.from("group_members").select("user_id").eq("group_id", dmId)
      expect(broken.data).toHaveLength(1) // only the admin remains

      // The member can no longer even SEE the group (groups RLS is membership or
      // authorship), so this is the exact path that used to create DM #2.
      await page.goto("/home?tab=directory")
      await vis(page, adminName).click()
      const send = page.getByRole("button", { name: "Send Message" }).filter({ visible: true }).first()
      await expect(send).toBeVisible({ timeout: 15000 })
      await send.click()

      // A draft — no group is created until something is actually sent.
      const composer = page.getByPlaceholder("Message").filter({ visible: true }).first()
      await expect(composer).toBeVisible({ timeout: 15000 })
      await composer.fill("E2E:: healed")
      await composer.press("Enter")
      await expect(vis(page, "E2E:: healed")).toBeVisible({ timeout: 15000 })

      // ONE thread for the pair, still the original id, both members restored.
      const after = await db
        .from("groups").select("id")
        .eq("ministry_id", sb.ministryId).eq("type", "dm").eq("dm_key", dmKey)
      expect(after.data).toHaveLength(1)
      expect(after.data?.[0].id).toBe(dmId)

      const healed = await db.from("group_members").select("user_id").eq("group_id", dmId)
      expect(healed.data).toHaveLength(2)

      // …and the original history is still there, in the same thread.
      await expect(vis(page, MSG)).toBeVisible({ timeout: 15000 })
    })
  })
})
