// Shared per-chat nicknames (personal group chats). Verifies the full loop:
// set a nickname via ChatSettings → it renders in the members list AND replaces
// the sender's real name in the message thread; a filtered nickname is blocked;
// and a church chat exposes no nickname affordance (type='my' gate).
import { test, expect, type Page } from "@playwright/test"
import { sandbox, E2E_PREFIX } from "./fixtures"

const SHOT_DIR = process.env.NICK_SHOT_DIR
const NICK = "Nickname McGee"
const MSG = "hey it's me, the member"

// Text can appear both in the hidden chat-list (behind the overlay) and the
// visible thread — always scope to the visible instance.
function vis(page: Page, text: string, exact = false) {
  return page.getByText(text, { exact }).filter({ visible: true }).first()
}

async function openSettings(page: Page, chatName: string) {
  // Mobile: tapping the chat title (h2) opens ChatSettings (Messenger pattern).
  await page.locator("h2", { hasText: chatName }).filter({ visible: true }).first().click()
}

// The nickname pencil is an icon-only button — locate it by its aria-label attr
// (getByRole name-matching is flaky on icon-only buttons).
function pencilFor(page: Page, name: string) {
  // ChatSettings renders a desktop + a mobile member list; scope to the visible one.
  return page.locator(`button[aria-label="Set nickname for ${name}"]`).filter({ visible: true })
}

test.describe("chat nicknames (personal group chats)", () => {
  const MYCHAT = `${E2E_PREFIX}Nickname Group`
  const CHURCH = `${E2E_PREFIX}Nickname Church`
  const MEMBER = "E2E Member 2"
  let myChatId = ""
  let churchChatId = ""
  let dmChatId = ""
  let mentionChatId = ""

  test.beforeAll(async () => {
    const sb = sandbox()
    const db = sb.client
    const adminId = await sb.adminUserId()
    const memberId = await sb.memberUserId()

    const my = await sb.createGroup({ name: MYCHAT, memberIds: [adminId, memberId] })
    myChatId = my.id
    await sb.insertMessage({ groupId: myChatId, senderId: memberId, content: MSG })

    const { data: church, error } = await db
      .from("groups")
      .insert({ ministry_id: sb.ministryId, name: CHURCH, type: "church", category: "general", created_by: adminId })
      .select("id").single()
    if (error) throw error
    churchChatId = church.id
    await db.from("group_members").insert([
      { group_id: churchChatId, user_id: adminId },
      { group_id: churchChatId, user_id: memberId },
    ])

    // A DM (type='dm') — nicknames are now allowed here too.
    const { data: dm, error: dmErr } = await db
      .from("groups")
      .insert({ ministry_id: sb.ministryId, name: `${E2E_PREFIX}DM`, type: "dm", created_by: adminId })
      .select("id").single()
    if (dmErr) throw dmErr
    dmChatId = dm.id
    await db.from("group_members").insert([
      { group_id: dmChatId, user_id: adminId },
      { group_id: dmChatId, user_id: memberId },
    ])
    await sb.insertMessage({ groupId: dmChatId, senderId: memberId, content: "dm hello there" })

    // A group where the member is pre-nicknamed "Zippy", for the @mention test.
    const mg = await sb.createGroup({ name: `${E2E_PREFIX}Mention Group`, memberIds: [adminId, memberId] })
    mentionChatId = mg.id
    await db.from("chat_nicknames").insert({ group_id: mentionChatId, target_user_id: memberId, ministry_id: sb.ministryId, nickname: "Zippy", set_by: adminId })
    await sb.insertMessage({ groupId: mentionChatId, senderId: memberId, content: "mention me maybe" })
  })

  test.afterAll(async () => {
    await sandbox().deleteGroupsByPrefix()
  })

  test("set a nickname → shows in member list and replaces sender name in thread", async ({ page }) => {
    await page.goto(`/home?tab=chats&chat=${myChatId}`)
    await expect(vis(page, MSG)).toBeVisible({ timeout: 15000 })

    await openSettings(page, MYCHAT)
    const pencil = pencilFor(page, MEMBER)
    await expect(pencil).toBeVisible({ timeout: 10000 })
    await pencil.click()

    await page.getByPlaceholder(MEMBER).fill(NICK)
    await page.getByRole("button", { name: "Save" }).click()

    // Member list now shows the nickname.
    await expect(vis(page, NICK)).toBeVisible({ timeout: 10000 })
    if (SHOT_DIR) await page.screenshot({ path: `${SHOT_DIR}/nickname-settings.png` })

    // Back to the thread — the message sender label is now the nickname.
    await page.goto(`/home?tab=chats&chat=${myChatId}`)
    await expect(vis(page, MSG)).toBeVisible({ timeout: 15000 })
    await expect(vis(page, NICK)).toBeVisible({ timeout: 10000 })
    if (SHOT_DIR) await page.screenshot({ path: `${SHOT_DIR}/nickname-thread.png` })
  })

  test("a filtered nickname is blocked by moderation", async ({ page }) => {
    await page.goto(`/home?tab=chats&chat=${myChatId}`)
    await expect(vis(page, MSG)).toBeVisible({ timeout: 15000 })
    await openSettings(page, MYCHAT)
    await pencilFor(page, MEMBER).click()
    await page.getByPlaceholder(MEMBER).fill("fuck")
    await page.getByRole("button", { name: "Save" }).click()
    await expect(vis(page, "blocked by the chat filter")).toBeVisible({ timeout: 10000 })
  })

  test("church chat exposes no nickname affordance (type gate)", async ({ page }) => {
    await page.goto(`/home?tab=chats&chat=${churchChatId}`)
    await openSettings(page, CHURCH)
    await expect(vis(page, MEMBER)).toBeVisible({ timeout: 15000 })
    await expect(pencilFor(page, MEMBER)).toHaveCount(0)
  })

  test("nickname works in a DM too", async ({ page }) => {
    await page.goto(`/home?tab=chats&chat=${dmChatId}`)
    await expect(vis(page, "dm hello there")).toBeVisible({ timeout: 15000 })
    // DM header title varies (partner name) — tap the visible header h2 to open settings.
    await page.locator("h2").filter({ visible: true }).first().click()
    const pencil = pencilFor(page, MEMBER)
    await expect(pencil).toBeVisible({ timeout: 10000 })
    await pencil.click()
    await page.getByPlaceholder(MEMBER).fill("DM Buddy")
    await page.getByRole("button", { name: "Save" }).click()
    await expect(vis(page, "DM Buddy")).toBeVisible({ timeout: 10000 })
  })

  test("@mention autocomplete shows + inserts the nickname's first word", async ({ page }) => {
    await page.goto(`/home?tab=chats&chat=${mentionChatId}`)
    const input = page.getByPlaceholder("Message").filter({ visible: true }).first()
    await expect(input).toBeVisible({ timeout: 15000 })
    await input.click()
    await input.pressSequentially("@Zip")
    // Autocomplete surfaces the nickname; Enter selects the highlighted option → @Zippy.
    await expect(vis(page, "Zippy")).toBeVisible({ timeout: 5000 })
    await input.press("Enter")
    await expect(input).toHaveValue(/@Zippy/)
  })
})
