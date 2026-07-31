// Phase-3 (Chats family) mobile screenshot capture. Seeds church chats across
// the GENERAL / GROUPS / TEAMS categories (so the sectioned church list renders,
// including the team-linked TEAMS section) plus a My-chat with messages, then
// screenshots the four Chats-family surfaces at 390×844 for visual sign-off.
// Evidence only (guarded on CHATS_SHOT_DIR); not a regression assertion suite.
import { test, expect, type Page } from "@playwright/test"
import { sandbox, E2E_PREFIX } from "./fixtures"

const SHOT_DIR = process.env.CHATS_SHOT_DIR

async function shot(page: Page, name: string) {
  if (!SHOT_DIR) return
  await page.screenshot({ path: `${SHOT_DIR}/chats-${name}.png`, fullPage: false })
}
function vis(page: Page, text: string, exact = true) {
  return page.getByText(text, { exact }).filter({ visible: true })
}

test.describe("mobile Chats family (P3) screenshots", () => {
  const GENERAL = `${E2E_PREFIX}Sunday Service`
  const GROUP = `${E2E_PREFIX}Freshman Bible Study`
  const TEAM = `${E2E_PREFIX}Worship Team Chat`
  const MYCHAT = `${E2E_PREFIX}Prayer Partners`
  let generalId = ""
  let myChatId = ""
  let groupCatId = ""

  test.beforeAll(async () => {
    const sb = sandbox()
    const db = sb.client
    const adminId = await sb.adminUserId()
    const memberId = await sb.memberUserId()

    async function church(name: string, category: string) {
      const { data, error } = await db
        .from("groups")
        .insert({ ministry_id: sb.ministryId, name, type: "church", category, created_by: adminId })
        .select("id").single()
      if (error) throw error
      await db.from("group_members").insert([
        { group_id: data.id, user_id: adminId },
        { group_id: data.id, user_id: memberId },
      ])
      return data.id
    }

    generalId = await church(GENERAL, "general")
    groupCatId = await church(GROUP, "group")
    await church(TEAM, "team")

    // A My-chat with a short thread so the chat screen has bubbles both ways.
    const my = await sb.createGroup({ name: MYCHAT, memberIds: [adminId, memberId] })
    myChatId = my.id
    await sb.insertMessage({ groupId: myChatId, senderId: memberId, content: "Are we still meeting to pray tonight?" })
    await sb.insertMessage({ groupId: myChatId, senderId: adminId, content: "Yes — 8pm at the chapel. See you there." })
    await sb.insertMessage({ groupId: myChatId, senderId: memberId, content: "Perfect, I'll bring the prayer list." })
    // A couple of messages in the general church chat too.
    await sb.insertMessage({ groupId: generalId, senderId: adminId, content: "Welcome everyone to the Sunday Service chat!" })
  })

  test.afterAll(async () => {
    const sb = sandbox()
    await sb.deleteGroupsByPrefix()
  })

  test("church list — sectioned GENERAL / GROUPS / TEAMS", async ({ page }) => {
    await page.goto("/home?tab=chats&chats=church")
    await expect(vis(page, "Chats").first()).toBeVisible({ timeout: 15000 })
    await expect(vis(page, "Teams").first()).toBeVisible({ timeout: 15000 })
    await shot(page, "list-church")
  })

  test("my-chats list", async ({ page }) => {
    await page.goto("/home?tab=chats&chats=my")
    await expect(vis(page, "Chats").first()).toBeVisible({ timeout: 15000 })
    await expect(vis(page, MYCHAT, false).first()).toBeVisible({ timeout: 15000 })
    await shot(page, "list-my")
  })

  test("chat screen with messages", async ({ page }) => {
    await page.goto("/home?tab=chats&chats=my")
    await vis(page, MYCHAT, false).first().click()
    await expect(vis(page, "8pm at the chapel", false).first()).toBeVisible({ timeout: 15000 })
    await shot(page, "screen")
  })

  test("chat settings", async ({ page }) => {
    await page.goto("/home?tab=chats&chats=my")
    await vis(page, MYCHAT, false).first().click()
    await expect(vis(page, "8pm at the chapel", false).first()).toBeVisible({ timeout: 15000 })
    // Open settings by tapping the chat-header title (mobile has no gear — the
    // header row carries the setShowSettings tap handler at phone width).
    await page.locator("h2").filter({ visible: true }).first().click()
    await expect(vis(page, "Members").first()).toBeVisible({ timeout: 10000 })
    // Wait for the members query to resolve so the role tags + Preferences
    // switches render (both are gated behind the loading spinner).
    await expect(vis(page, "Preferences").first()).toBeVisible({ timeout: 10000 })
    await expect(vis(page, "Mute notifications").first()).toBeVisible({ timeout: 10000 })
    await shot(page, "settings")
  })

  test("create chat (My chat)", async ({ page }) => {
    await page.goto("/home?tab=chats&chats=my")
    await page.getByRole("button", { name: "New chat" }).filter({ visible: true }).first().click()
    await expect(vis(page, "Add Members", false).first()).toBeVisible({ timeout: 10000 })
    await shot(page, "create")
  })

  // "Presets + reassign": move a church chat between sections from ChatSettings,
  // exercising the real groups.category UPDATE under the admin session (RLS proof).
  test("church settings — SECTION control + reassign move (RLS)", async ({ page }) => {
    const sb = sandbox()
    await page.goto("/home?tab=chats&chats=church")
    await vis(page, GROUP, false).first().click()
    await page.locator("h2").filter({ visible: true }).first().click()
    // SECTION control renders with the seeded "Groups" preset active.
    await expect(vis(page, "Section").first()).toBeVisible({ timeout: 10000 })
    await expect(vis(page, "Preferences").first()).toBeVisible({ timeout: 10000 })
    await shot(page, "settings-church")

    // Move Groups → Teams, Save, and confirm the DB flipped + a system note posted.
    // exact:true so the SECTION chip isn't confused with the church-list "New teams
    // chat" + button still mounted under the overlay.
    await page.getByRole("button", { name: "Teams", exact: true }).click()
    await page.getByRole("button", { name: "Save changes" }).click()
    await expect(page.getByRole("button", { name: "Save changes" })).toHaveCount(0, { timeout: 10000 })
    await expect.poll(async () => {
      const { data } = await sb.client.from("groups").select("category").eq("id", groupCatId).single()
      return data?.category
    }, { timeout: 8000 }).toBe("team")
    // Poll (not a single read) so the assertion isn't racy against write→read lag —
    // mirrors the category poll above.
    await expect.poll(async () => {
      const { data: msgs } = await sb.client.from("messages").select("content").eq("group_id", groupCatId).eq("message_type", "system").order("created_at", { ascending: false }).limit(1)
      return msgs?.[0]?.content
    }, { timeout: 8000 }).toBe("Chat moved to Teams")

    // Move back Teams → Groups to restore, confirming re-bucket both ways.
    await page.getByRole("button", { name: "Groups", exact: true }).click()
    await page.getByRole("button", { name: "Save changes" }).click()
    await expect(page.getByRole("button", { name: "Save changes" })).toHaveCount(0, { timeout: 10000 })
    await expect.poll(async () => {
      const { data } = await sb.client.from("groups").select("category").eq("id", groupCatId).single()
      return data?.category
    }, { timeout: 8000 }).toBe("group")
  })

  // Desktop (1440×900) SECTION control render check — same admin, resized viewport.
  test("desktop settings shows the SECTION SegmentedControl", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 })
    await page.goto("/home?tab=chats&chats=church")
    // Open the seeded group-category chat from the desktop ChatListPanel sidebar,
    // wait for its inline ChatScreen header, then open settings via the header's
    // User icon (.last() — the left-nav "YOU" user icon sorts first in the DOM).
    await vis(page, GROUP, false).first().click()
    await expect(page.getByRole("heading", { name: GROUP, exact: false }).filter({ visible: true }).first()).toBeVisible({ timeout: 15000 })
    await page.locator("button:has(svg.lucide-user)").filter({ visible: true }).last().click()
    await expect(vis(page, "Section").first()).toBeVisible({ timeout: 10000 })
    if (SHOT_DIR) await page.screenshot({ path: `${SHOT_DIR}/chats-settings-desktop.png`, fullPage: false })
  })
})
